--[[
  Phase 7/8/14 — Mission service (Nakama Lua).
  Public RPCs: missions_get, missions_refresh, mission_start, mission_status,
               mission_claim, mission_skip

  Phase 14: claim applies stardust + optional loot via RewardService / LootService.
  XP is recorded as unsupported (no ProgressionService).
  No fuel debit, arena/shipment/daily/admin grants.

  Ownership: character-level (matches Node Mission.character_id).
  Account id = context.user_id only. Character must match profile.selected_character_id.

  Storage:
    mission_boards / <character_id>
    active_missions / <character_id>
]]

local nk = require("nakama")
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local time = require("lib.time")
local ids = require("lib.ids")
local logging = require("lib.logging")
local transactions = require("lib.transactions")
local remote_config = require("config")
local reward_formulas = require("data.mission_reward_formulas")
local rewards = require("rewards")
local loot = require("loot")
local wallet_bridge = require("lib.wallet_bridge")

local BOARD_COLLECTION = "mission_boards"
local ACTIVE_COLLECTION = "active_missions"

local MAX_CHARACTER_ID = auth.MAX_CHARACTER_ID
-- Hardcoded fallbacks — remote config may override when valid; defaults preserve live behavior.
local BOARD_SIZE_DEFAULT = 3
local REFRESH_COOLDOWN_DEFAULT = 15
local SKIP_CRYSTALS_PER_MINUTE = 5

local function board_size()
  local v = remote_config.get_config_value("missions", "board_size")
  if type(v) == "number" and v == math.floor(v) and v >= 1 and v <= 10 then
    return v
  end
  return BOARD_SIZE_DEFAULT
end

local function refresh_cooldown_sec()
  local v = remote_config.get_config_value("missions", "free_refresh_cooldown_seconds")
  if type(v) == "number" and v == math.floor(v) and v >= 0 and v <= 86400 then
    return v
  end
  return REFRESH_COOLDOWN_DEFAULT
end

local MIN_DURATION = 15
local MAX_DURATION = 1200
local MAX_WRITE_RETRIES = 5

local ALLOWED_STATUS = {
  available = true,
  active = true,
  complete = true,
  reward_pending = true,
  claimed = true,
  expired = true,
  reward_failed = true,
}

-- Duration pools (mirrors src/lib/missionDuration.js / MissionBoard.DURATION_RULES).
local DURATION_RULES = {
  [1] = { min = 15, max = 30, step = 15 },
  [2] = { min = 15, max = 30, step = 15 },
  [3] = { min = 15, max = 45, step = 15 },
  [4] = { min = 30, max = 60, step = 15 },
  [5] = { min = 30, max = 75, step = 15 },
  [6] = { min = 30, max = 90, step = 30 },
  [7] = { min = 30, max = 90, step = 30 },
  [8] = { min = 60, max = 120, step = 30 },
  [9] = { min = 60, max = 150, step = 30 },
  [10] = { min = 60, max = 150, step = 30 },
  [11] = { min = 150, max = 300, step = 150 },
  [12] = { min = 150, max = 300, step = 150 },
  [13] = { min = 150, max = 450, step = 150 },
  [14] = { min = 150, max = 450, step = 150 },
  [15] = { min = 150, max = 600, step = 150 },
  [16] = { min = 300, max = 750, step = 150 },
  [17] = { min = 300, max = 750, step = 150 },
  [18] = { min = 300, max = 900, step = 150 },
  [19] = { min = 300, max = 1050, step = 150 },
  [20] = { min = 300, max = 1200, step = 150 },
  [21] = { min = 300, max = 1200, step = 300 },
}

-- Templates mirrored from loot&lasers/Scripts/MissionBoard.gd (verified existing fields).
local TEMPLATES = {
  {
    template_id = "patrol_rimward",
    title = "Patrol the Rimward Sector",
    location = "Nebula Station Alpha",
    description = "Stroll the rim like you own the place. Mostly squinting at blips that are, statistically, 99% space geese.",
    sector = 1,
    level_requirement = 1,
  },
  {
    template_id = "salvage_freighter",
    title = "Salvage Run: Derelict Freighter",
    location = "Wreck of the ISS Meridian",
    description = "The ISS Meridian went quiet forty years ago. The cargo? Still there. Bring a crowbar.",
    sector = 1,
    level_requirement = 1,
  },
  {
    template_id = "contraband_dash",
    title = "Contraband Dash",
    location = "Keldris Reach",
    description = "Move some 'perfectly legal' cargo past a patrol. The agricultural supplies are humming.",
    sector = 1,
    level_requirement = 1,
  },
  {
    template_id = "mail_run",
    title = "Mail Run: Express Capsule",
    location = "Orbital Post Hub",
    description = "Deliver a sealed capsule that ticks when you shake it. Definitely not a bomb.",
    sector = 1,
    level_requirement = 1,
  },
  {
    template_id = "sensor_sweep",
    title = "Sensor Calibration Sweep",
    location = "Relay Buoy Cluster 12",
    description = "Tap every buoy with a wrench until the network stops screaming in binary.",
    sector = 1,
    level_requirement = 1,
  },
  {
    template_id = "asteroid_mining",
    title = "Asteroid Mining Operation",
    location = "Kelvari Belt",
    description = "Smack glowing space rocks until they confess their secrets.",
    sector = 1,
    level_requirement = 2,
  },
  {
    template_id = "black_market",
    title = "Black Market Buy",
    location = "The Bazaar of Torment",
    description = "Meet a contact named Gary who insists on being called The Whisper.",
    sector = 1,
    level_requirement = 2,
  },
  {
    template_id = "xeno_dig",
    title = "Xeno-Archaeological Dig",
    location = "Planet Ashara IV",
    description = "Dig up ruins older than your grandpa's password. The whispering is probably fine.",
    sector = 2,
    level_requirement = 3,
  },
  {
    template_id = "escort_diplomat",
    title = "Escort the Diplomat",
    location = "Luminae Homeworld",
    description = "Walk Ambassador Zyr'tal through hostile territory. Do not let him order the seafood.",
    sector = 2,
    level_requirement = 4,
  },
  {
    template_id = "pirate_stronghold",
    title = "Infiltrate Pirate Stronghold",
    location = "Shadow Station Omega",
    description = "Disable their shields and try not to become someone's new parrot.",
    sector = 3,
    level_requirement = 5,
  },
}

local QUEST_GIVERS = {
  { emoji = "🤖", name = "CLANK", color = "#00E5FF" },
  { emoji = "👽", name = "Zyx", color = "#9D5CFF" },
  { emoji = "🐙", name = "Capt. Tentak", color = "#FF6B35" },
  { emoji = "🧙", name = "Old Maru", color = "#FFD700" },
  { emoji = "👻", name = "Wraith Vin", color = "#8BE8FF" },
  { emoji = "🦊", name = "Rix", color = "#FF9E4F" },
  { emoji = "🐉", name = "Drako", color = "#FF4D6D" },
  { emoji = "🛸", name = "Skip", color = "#5CFFB0" },
}

local function now_unix()
  return time.unix()
end

local function now_ms()
  return time.ms()
end

local function iso_utc(unix)
  return time.iso_utc(unix)
end

local function encode_ok(data)
  return responses.ok(data)
end

local function encode_fail(message, status_code)
  return responses.fail_status(message, status_code)
end

local function decode_payload(payload)
  return validation.decode_payload(payload)
end

local function empty_array()
  return validation.empty_array()
end

local function rand_u32()
  local u = ids.uuid()
  local n = 0
  for i = 1, #u do
    local c = string.sub(u, i, i)
    local v = tonumber(c, 16)
    if v ~= nil then
      n = (n * 16 + v) % 2147483647
    end
  end
  return n
end

local function rand_int(lo, hi)
  if hi < lo then
    return lo
  end
  return lo + (rand_u32() % (hi - lo + 1))
end

local function shuffle_copy(list)
  local out = {}
  for i = 1, #list do
    out[i] = list[i]
  end
  for i = #out, 2, -1 do
    local j = rand_int(1, i)
    out[i], out[j] = out[j], out[i]
  end
  return out
end

local function read_profile(user_id)
  return auth.read_profile(user_id)
end

local function resolve_character_id(user_id, requested)
  local character_id, err = auth.resolve_character_id(user_id, requested, false)
  return character_id, err
end

local function reject_client_ids(body)
  return validation.reject_client_identity_fields(body)
end

local function clamp_level(level)
  local n = tonumber(level) or 1
  n = math.floor(n)
  if n < 1 then
    n = 1
  end
  if n > 100 then
    n = 100
  end
  return n
end

local function clamp_sector(sector)
  local n = tonumber(sector) or 0
  n = math.floor(n)
  if n < 0 then
    n = 0
  end
  if n > 50 then
    n = 50
  end
  return n
end

local function duration_pool(level)
  local lvl = clamp_level(level)
  local rule = DURATION_RULES[lvl]
  if rule == nil then
    rule = DURATION_RULES[21]
  end
  local pool = {}
  local s = rule.min
  while s <= rule.max do
    table.insert(pool, s)
    s = s + rule.step
  end
  return pool
end

local function roll_duration(level)
  local pool = duration_pool(level)
  return pool[rand_int(1, #pool)]
end

local function roll_efficiency(level)
  local v = 0.25
  if clamp_level(level) > 10 then
    v = 0.10
  end
  -- Approximate 0.01 steps across [1-v, 1+v]
  local steps = math.floor(v * 200 + 0.5) -- e.g. 50 for 0.25
  local unit = rand_int(0, steps)
  local raw = (1.0 - v) + (unit / 100.0)
  return math.floor(raw * 100 + 0.5) / 100
end

local function difficulty_for_sector(sector)
  if sector <= 1 then
    return "easy"
  end
  if sector == 2 then
    return "medium"
  end
  return "hard"
end

local function filter_templates(level, highest_sector)
  local max_sector = highest_sector + 1
  local out = {}
  for _, tpl in ipairs(TEMPLATES) do
    if tpl.level_requirement <= level and tpl.sector <= max_sector then
      table.insert(out, tpl)
    end
  end
  if #out == 0 then
    -- Fallback: lowest templates so boards never fail hard.
    for _, tpl in ipairs(TEMPLATES) do
      if tpl.level_requirement <= 1 then
        table.insert(out, tpl)
      end
    end
  end
  return out
end

local function public_mission(m)
  return {
    mission_version = 1,
    mission_id = m.mission_id,
    template_id = m.template_id,
    owner_character_id = m.owner_character_id,
    title = m.title,
    description = m.description,
    location = m.location or "",
    sector = m.sector or 1,
    level_requirement = m.level_requirement or 1,
    difficulty = m.difficulty or "",
    risk = m.risk or 0,
    duration_seconds = m.duration_seconds,
    status = m.status,
    generated_at = m.generated_at or "",
    started_at = m.started_at or "",
    completes_at = m.completes_at or "",
    completes_at_unix = tonumber(m.completes_at_unix) or 0,
    completed_at = m.completed_at or "",
    expires_at = m.expires_at or "",
    claimed_at = m.claimed_at or "",
    claim_request_id = m.claim_request_id or "",
    reward_transaction_id = m.reward_transaction_id or "",
    loot_transaction_id = m.loot_transaction_id or "",
    reward_status = m.reward_status or "",
    reward_reference = m.reward_reference or {},
    metadata = m.metadata or {},
  }
end

local function snapshot_reward_reference(level, duration_seconds, stardust_eff, xp_eff)
  local fuel = reward_formulas.fuel_from_duration(duration_seconds)
  local stardust_amount = reward_formulas.compute_stardust(level, fuel)
  local xp_amount = reward_formulas.compute_xp(level, fuel, xp_eff)
  local include_loot = reward_formulas.LOOT_CHANCE >= 1.0
  return {
    reward_formula_version = reward_formulas.REWARD_FORMULA_VERSION,
    character_level = math.floor(tonumber(level) or 1),
    fuel_cost = fuel,
    stardust_efficiency = stardust_eff,
    xp_efficiency = xp_eff,
    currency_id = "stardust",
    stardust_amount = stardust_amount,
    xp_amount = xp_amount,
    xp_grant = "unsupported",
    include_loot = include_loot,
    loot_table_id = reward_formulas.DEFAULT_LOOT_TABLE_ID,
  }
end

local function build_mission(character_id, tpl, level)
  local duration = roll_duration(level)
  local generated = now_unix()
  local patron = QUEST_GIVERS[rand_int(1, #QUEST_GIVERS)]
  local sd_eff = roll_efficiency(level)
  local xp_eff = roll_efficiency(level)
  return {
    mission_version = 1,
    mission_id = ids.uuid(),
    template_id = tpl.template_id,
    owner_character_id = character_id,
    title = tpl.title,
    description = tpl.description,
    location = tpl.location,
    sector = tpl.sector,
    level_requirement = tpl.level_requirement,
    difficulty = difficulty_for_sector(tpl.sector),
    risk = tpl.sector,
    duration_seconds = duration,
    status = "available",
    generated_at = iso_utc(generated),
    started_at = "",
    completes_at = "",
    completed_at = "",
    expires_at = "",
    claimed_at = "",
    claim_request_id = "",
    reward_transaction_id = "",
    loot_transaction_id = "",
    reward_status = "",
    reward_reference = snapshot_reward_reference(level, duration, sd_eff, xp_eff),
    metadata = {
      patron = patron,
      explore_scene = rand_int(0, 5),
    },
  }
end

local function generate_board_missions(character_id, level, highest_sector)
  local filtered = filter_templates(level, highest_sector)
  local shuffled = shuffle_copy(filtered)
  local missions = empty_array()
  local used_patrons = {}
  local count = math.min(board_size(), #shuffled)
  for i = 1, count do
    local m = build_mission(character_id, shuffled[i], level)
    -- Prefer unique patrons when possible.
    local patron = m.metadata.patron
    local pname = patron and patron.name or ""
    if used_patrons[pname] then
      for _ = 1, 8 do
        local alt = QUEST_GIVERS[rand_int(1, #QUEST_GIVERS)]
        if not used_patrons[alt.name] then
          m.metadata.patron = alt
          pname = alt.name
          break
        end
      end
    end
    used_patrons[pname] = true
    table.insert(missions, m)
  end
  return missions
end

--- Fill an under-sized board back up to board_size() (e.g. after mission_start removes a slot).
local function top_up_board_missions(board, character_id, level, highest_sector)
  local size = board_size()
  if type(board) ~= "table" then
    return board
  end
  if type(board.missions) ~= "table" then
    board.missions = empty_array()
  end
  local need = size - #board.missions
  if need <= 0 then
    return board
  end

  local used_patrons = {}
  local used_templates = {}
  for _, existing in ipairs(board.missions) do
    if type(existing) == "table" then
      local tid = existing.template_id or ""
      if tid ~= "" then
        used_templates[tid] = true
      end
      local patron = existing.metadata and existing.metadata.patron
      if type(patron) == "table" and patron.name then
        used_patrons[patron.name] = true
      end
    end
  end

  local filtered = filter_templates(level, highest_sector)
  local shuffled = shuffle_copy(filtered)
  for i = 1, #shuffled do
    if need <= 0 then
      break
    end
    local tpl = shuffled[i]
    if not used_templates[tpl.template_id] then
      local m = build_mission(character_id, tpl, level)
      local patron = m.metadata.patron
      local pname = patron and patron.name or ""
      if used_patrons[pname] then
        for _ = 1, 8 do
          local alt = QUEST_GIVERS[rand_int(1, #QUEST_GIVERS)]
          if not used_patrons[alt.name] then
            m.metadata.patron = alt
            pname = alt.name
            break
          end
        end
      end
      used_patrons[pname] = true
      used_templates[tpl.template_id] = true
      table.insert(board.missions, m)
      need = need - 1
    end
  end

  -- If templates were exhausted, allow duplicates to guarantee board_size.
  while need > 0 and #filtered > 0 do
    local tpl = filtered[rand_int(1, #filtered)]
    local m = build_mission(character_id, tpl, level)
    table.insert(board.missions, m)
    need = need - 1
  end

  board.updated_at = now_ms()
  return board
end

local function read_board(user_id, character_id)
  local objects = nk.storage_read({
    { collection = BOARD_COLLECTION, key = character_id, user_id = user_id },
  })
  if objects == nil or #objects == 0 then
    return nil, nil
  end
  return objects[1].value, objects[1].version
end

local function write_board(user_id, character_id, board, version)
  local object = {
    collection = BOARD_COLLECTION,
    key = character_id,
    user_id = user_id,
    value = board,
    permission_read = 1,
    permission_write = 0,
  }
  if version ~= nil and version ~= "" then
    object.version = version
  end
  return nk.storage_write({ object })
end

local function read_active(user_id, character_id)
  local objects = nk.storage_read({
    { collection = ACTIVE_COLLECTION, key = character_id, user_id = user_id },
  })
  if objects == nil or #objects == 0 then
    return nil, nil
  end
  return objects[1].value, objects[1].version
end

local function write_active(user_id, character_id, active, version)
  local object = {
    collection = ACTIVE_COLLECTION,
    key = character_id,
    user_id = user_id,
    value = active,
    permission_read = 1,
    permission_write = 0,
  }
  if version ~= nil and version ~= "" then
    object.version = version
  end
  return nk.storage_write({ object })
end

local function delete_active(user_id, character_id)
  nk.storage_delete({
    { collection = ACTIVE_COLLECTION, key = character_id, user_id = user_id },
  })
end

local function empty_board(character_id)
  return {
    board_version = 1,
    owner_character_id = character_id,
    missions = empty_array(),
    generated_at = 0,
    last_refresh_at = 0,
    level_snapshot = 1,
    highest_sector_snapshot = 0,
  }
end

local function apply_timer_transition(mission)
  if type(mission) ~= "table" then
    return mission, false
  end
  if mission.status ~= "active" then
    return mission, false
  end
  local completes = tonumber(mission.completes_at_unix)
  if completes == nil then
    -- Parse ISO completes_at if unix missing.
    return mission, false
  end
  if now_unix() >= completes then
    mission.status = "complete"
    mission.completed_at = iso_utc(now_unix())
    return mission, true
  end
  return mission, false
end

--- Nova cost to skip remaining wait (matches client SKIP_CRYSTALS_PER_MINUTE).
local function skip_cost_for(mission)
  if type(mission) ~= "table" then
    return 0
  end
  if mission.status ~= "active" then
    return 0
  end
  local completes = tonumber(mission.completes_at_unix) or 0
  local rem = math.max(0, completes - now_unix())
  if rem <= 0 then
    return 0
  end
  local minutes = rem / 60.0
  return math.max(1, math.ceil(minutes * SKIP_CRYSTALS_PER_MINUTE))
end

local function ensure_board(user_id, character_id, level, highest_sector, force_refresh)
  local board, version = read_board(user_id, character_id)
  local now = now_unix()
  local size = board_size()

  if board ~= nil and type(board) == "table" and not force_refresh then
    if type(board.missions) == "table" and #board.missions >= size then
      return board, version, false
    end
    -- After launch, slots are removed — top up to full size without refresh cooldown.
    if type(board.missions) == "table" and #board.missions > 0 and #board.missions < size then
      board = top_up_board_missions(board, character_id, level, highest_sector)
      local last_err = "Failed to top up mission board"
      for _ = 1, MAX_WRITE_RETRIES do
        local okw, errw = pcall(function()
          write_board(user_id, character_id, board, version)
        end)
        if okw then
          return board, version, false
        end
        last_err = tostring(errw)
        board, version = read_board(user_id, character_id)
        if board == nil or type(board) ~= "table" then
          break
        end
        if type(board.missions) == "table" and #board.missions >= size then
          return board, version, false
        end
        if type(board.missions) == "table" and #board.missions > 0 then
          board = top_up_board_missions(board, character_id, level, highest_sector)
        else
          break
        end
      end
      -- Fall through to full regenerate if top-up writes keep failing.
      nk.logger_warn(string.format("mission board top-up failed: %s", last_err))
    end
  end

  if force_refresh and board ~= nil and type(board) == "table" then
    local last = tonumber(board.last_refresh_at) or 0
    if last > 0 and (now - last) < refresh_cooldown_sec() then
      return nil, nil, "Refresh cooldown active"
    end
  end

  local missions = generate_board_missions(character_id, level, highest_sector)
  local new_board = {
    board_version = 1,
    owner_character_id = character_id,
    missions = missions,
    generated_at = now,
    last_refresh_at = now,
    level_snapshot = level,
    highest_sector_snapshot = highest_sector,
  }

  local last_err = "Failed to write mission board"
  for _ = 1, MAX_WRITE_RETRIES do
    local cur, ver = read_board(user_id, character_id)
    if force_refresh and cur ~= nil then
      local last = tonumber(cur.last_refresh_at) or 0
      if last > 0 and (now_unix() - last) < refresh_cooldown_sec() then
        return nil, nil, "Refresh cooldown active"
      end
    end
    if not force_refresh and cur ~= nil and type(cur.missions) == "table" then
      if #cur.missions >= size then
        return cur, ver, false
      end
      if #cur.missions > 0 then
        cur = top_up_board_missions(cur, character_id, level, highest_sector)
        local ok_top, err_top = pcall(function()
          write_board(user_id, character_id, cur, ver)
        end)
        if ok_top then
          return cur, ver, false
        end
        last_err = tostring(err_top)
      end
    end
    local ok, err = pcall(function()
      write_board(user_id, character_id, new_board, ver)
    end)
    if ok then
      return new_board, ver, force_refresh
    end
    last_err = tostring(err)
  end
  return nil, nil, last_err
end

local function public_board(board)
  local missions = empty_array()
  if type(board) == "table" and type(board.missions) == "table" then
    for i = 1, #board.missions do
      table.insert(missions, public_mission(board.missions[i]))
    end
  end
  return {
    board_version = 1,
    owner_character_id = board.owner_character_id or "",
    missions = missions,
    generated_at = board.generated_at or 0,
    last_refresh_at = board.last_refresh_at or 0,
    refresh_cooldown_seconds = refresh_cooldown_sec(),
  }
end

local function public_active(active)
  if active == nil or type(active) ~= "table" or type(active.mission) ~= "table" then
    return nil
  end
  local m = public_mission(active.mission)
  local completes = tonumber(active.mission.completes_at_unix) or 0
  local remaining = 0
  if active.mission.status == "active" and completes > 0 then
    remaining = math.max(0, completes - now_unix())
  end
  return {
    mission = m,
    server_time_unix = now_unix(),
    seconds_remaining = remaining,
    is_complete = active.mission.status == "complete"
      or active.mission.status == "reward_pending"
      or active.mission.status == "reward_failed"
      or active.mission.status == "claimed",
    ready_for_resolution = active.mission.status == "complete"
      or active.mission.status == "reward_failed",
    reward_status = active.mission.reward_status or "",
  }
end

local function rpc_missions_get(context, payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = reject_client_ids(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end

  local ok, result = pcall(function()
    local character_id, err = resolve_character_id(user_id, body.character_id)
    if err ~= nil then
      error({ err = err, code = 403 })
    end
    local level = clamp_level(body.level)
    local highest_sector = clamp_sector(body.highest_sector)

    local board, _, board_err = ensure_board(user_id, character_id, level, highest_sector, false)
    if board == nil then
      error({ err = tostring(board_err or "Failed to load board"), code = 500 })
    end

    local active_raw = read_active(user_id, character_id)
    local changed = false
    if active_raw ~= nil and type(active_raw.mission) == "table" then
      local m, did = apply_timer_transition(active_raw.mission)
      active_raw.mission = m
      if did then
        write_active(user_id, character_id, active_raw, nil)
        changed = true
      end
    end

    return {
      board = public_board(board),
      active = public_active(active_raw),
      timer_updated = changed,
    }
  end)

  if not ok then
    if type(result) == "table" and result.err ~= nil then
      return encode_fail(result.err, result.code or 400)
    end
    nk.logger_error(string.format("missions_get failed: %s", tostring(result)))
    return encode_fail("Failed to load missions", 500)
  end
  return encode_ok(result)
end

local function rpc_missions_refresh(context, payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = reject_client_ids(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  -- Reject client-authored mission lists / timers.
  if body.missions ~= nil or body.duration_seconds ~= nil or body.completes_at ~= nil then
    return encode_fail("Client cannot supply mission generation fields", 400)
  end

  local ok, result = pcall(function()
    local character_id, err = resolve_character_id(user_id, body.character_id)
    if err ~= nil then
      error({ err = err, code = 403 })
    end

    local active_raw = read_active(user_id, character_id)
    if active_raw ~= nil and type(active_raw.mission) == "table" then
      local m = active_raw.mission
      apply_timer_transition(m)
      if m.status == "active" then
        error({ err = "Cannot refresh board while a mission is active", code = 409 })
      end
    end

    local level = clamp_level(body.level)
    local highest_sector = clamp_sector(body.highest_sector)
    local board, _, board_err = ensure_board(user_id, character_id, level, highest_sector, true)
    if board == nil then
      local code = 429
      if board_err ~= "Refresh cooldown active" then
        code = 500
      end
      error({ err = tostring(board_err or "Refresh failed"), code = code })
    end

    return {
      board = public_board(board),
      active = public_active(read_active(user_id, character_id)),
    }
  end)

  if not ok then
    if type(result) == "table" and result.err ~= nil then
      return encode_fail(result.err, result.code or 400)
    end
    nk.logger_error(string.format("missions_refresh failed: %s", tostring(result)))
    return encode_fail("Failed to refresh missions", 500)
  end
  return encode_ok(result)
end

local function rpc_mission_start(context, payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = reject_client_ids(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  if body.started_at ~= nil or body.completes_at ~= nil or body.duration_seconds ~= nil
      or body.status ~= nil or body.start_time ~= nil or body.end_time ~= nil then
    return encode_fail("Client cannot supply authoritative mission timing or status", 400)
  end
  if type(body.mission_id) ~= "string" or body.mission_id == "" then
    return encode_fail("mission_id is required", 400)
  end

  local ok, result = pcall(function()
    local character_id, err = resolve_character_id(user_id, body.character_id)
    if err ~= nil then
      error({ err = err, code = 403 })
    end

    -- Reject if already active (after timer transition).
    local active_raw, active_ver = read_active(user_id, character_id)
    if active_raw ~= nil and type(active_raw.mission) == "table" then
      local m, did = apply_timer_transition(active_raw.mission)
      active_raw.mission = m
      if did then
        write_active(user_id, character_id, active_raw, active_ver)
        active_ver = nil
      end
      if m.status == "active" then
        error({ err = "Already on a mission", code = 409 })
      end
      if m.status == "complete" or m.status == "reward_pending" or m.status == "reward_failed" then
        error({ err = "Claim mission rewards before starting another", code = 409 })
      end
      -- claimed/expired: clear pointer so a new mission can start.
      if m.status == "claimed" or m.status == "expired" then
        delete_active(user_id, character_id)
        active_raw = nil
      end
    end

    local board, board_ver = read_board(user_id, character_id)
    if board == nil or type(board.missions) ~= "table" then
      error({ err = "No mission board", code = 404 })
    end

    local found = nil
    local found_index = nil
    for i = 1, #board.missions do
      local row = board.missions[i]
      if type(row) == "table" and row.mission_id == body.mission_id then
        found = row
        found_index = i
        break
      end
    end
    if found == nil then
      error({ err = "Unknown mission_id", code = 404 })
    end
    if found.owner_character_id ~= character_id then
      error({ err = "Mission not owned by character", code = 403 })
    end
    if found.status ~= "available" then
      error({ err = "Mission is not available", code = 409 })
    end
    local duration = tonumber(found.duration_seconds)
    if duration == nil or duration < MIN_DURATION or duration > MAX_DURATION then
      error({ err = "Invalid mission duration", code = 422 })
    end
    local fuel_cost = tonumber(found.reward_reference and found.reward_reference.fuel_cost)
    local rounded_fuel_cost = fuel_cost and (math.floor(fuel_cost * 100 + 0.5) / 100) or nil
    if fuel_cost == nil or rounded_fuel_cost < 0.01
        or math.abs(fuel_cost - rounded_fuel_cost) > 0.000000001 then
      error({ err = "Invalid mission fuel snapshot", code = 422 })
    end
    fuel_cost = rounded_fuel_cost
    local wallet_result, wallet_err, wallet_code = wallet_bridge.apply(context, {
      character_id = character_id,
      operation_type = "mission_start_fuel",
      operation_key = "mission_start:" .. found.mission_id,
      reference_id = found.mission_id,
      amount = fuel_cost,
    })
    if wallet_err ~= nil then
      error({ err = wallet_err, code = wallet_code or 409 })
    end

    local started = now_unix()
    local completes = started + math.floor(duration)
    found.status = "active"
    found.started_at = iso_utc(started)
    found.completes_at = iso_utc(completes)
    found.started_at_unix = started
    found.completes_at_unix = completes
    found.completed_at = ""

    -- Remove from board and write active.
    local new_missions = empty_array()
    for i = 1, #board.missions do
      if i ~= found_index then
        table.insert(new_missions, board.missions[i])
      end
    end
    board.missions = new_missions

    local active_doc = {
      owner_character_id = character_id,
      mission = found,
      updated_at = now_ms(),
    }

    local wrote = false
    local last_err = "Failed to start mission"
    for _ = 1, MAX_WRITE_RETRIES do
      -- Re-check active each retry.
      local cur_active = read_active(user_id, character_id)
      if cur_active ~= nil and type(cur_active.mission) == "table" and cur_active.mission.status == "active" then
        error({ err = "Already on a mission", code = 409 })
      end
      local okw, errw = pcall(function()
        write_active(user_id, character_id, active_doc, nil)
        write_board(user_id, character_id, board, board_ver)
      end)
      if okw then
        wrote = true
        break
      end
      last_err = tostring(errw)
      board, board_ver = read_board(user_id, character_id)
    end
    if not wrote then
      local cleanup_ok = pcall(function()
        delete_active(user_id, character_id)
      end)
      if not cleanup_ok then
        error({
          err = "Mission start state is pending reconciliation; payment retained",
          code = 503,
        })
      end
      local _, compensation_err = wallet_bridge.apply(context, {
        character_id = character_id,
        operation_type = "mission_start_fuel_refund",
        operation_key = "mission_start_refund:" .. found.mission_id,
        reference_id = found.mission_id,
        amount = fuel_cost,
      })
      if compensation_err ~= nil then
        error({
          err = "Mission start failed after payment; compensation pending, retry reconciliation",
          code = 503,
        })
      end
      error({ err = last_err .. " (fuel compensated)", code = 409 })
    end

    local response = public_active(active_doc)
    response.wallet = wallet_result.wallet
    response.character = wallet_result.character
    return response
  end)

  if not ok then
    if type(result) == "table" and result.err ~= nil then
      return encode_fail(result.err, result.code or 400)
    end
    nk.logger_error(string.format("mission_start failed: %s", tostring(result)))
    return encode_fail("Failed to start mission", 500)
  end
  return encode_ok(result)
end

local function rpc_mission_status(context, payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = reject_client_ids(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end

  local ok, result = pcall(function()
    local character_id, err = resolve_character_id(user_id, body.character_id)
    if err ~= nil then
      error({ err = err, code = 403 })
    end

    local active_raw, active_ver = read_active(user_id, character_id)
    if active_raw == nil or type(active_raw.mission) ~= "table" then
      return {
        mission = nil,
        server_time_unix = now_unix(),
        seconds_remaining = 0,
        is_complete = false,
        ready_for_resolution = false,
        has_active = false,
      }
    end

    local m, did = apply_timer_transition(active_raw.mission)
    active_raw.mission = m
    if did then
      write_active(user_id, character_id, active_raw, active_ver)
    end

    local pub = public_active(active_raw)
    pub.has_active = true
    pub.status_transitioned = did
    return pub
  end)

  if not ok then
    if type(result) == "table" and result.err ~= nil then
      return encode_fail(result.err, result.code or 400)
    end
    nk.logger_error(string.format("mission_status failed: %s", tostring(result)))
    return encode_fail("Failed to load mission status", 500)
  end
  return encode_ok(result)
end

--- Build claim receipt from mission + reward/loot results.
local function build_claim_receipt(mission, reward_result, loot_items, xp_note)
  local currency = validation.empty_array()
  local items = validation.empty_array()
  local xp = validation.empty_array()
  local other = validation.empty_array()

  if type(reward_result) == "table" and type(reward_result.applied) == "table" then
    for i = 1, #reward_result.applied do
      local a = reward_result.applied[i]
      if type(a) == "table" then
        if a.type == "currency" then
          table.insert(currency, {
            currency_id = a.currency_id,
            amount = a.amount,
          })
        elseif a.type == "item" then
          table.insert(items, {
            instance_id = a.instance_id,
            item_id = a.item_id,
            quantity = a.quantity,
          })
        end
      end
    end
  end

  if type(loot_items) == "table" then
    for i = 1, #loot_items do
      local inst = loot_items[i]
      if type(inst) == "table" then
        local already = false
        for j = 1, #items do
          if items[j].instance_id == inst.instance_id then
            already = true
            break
          end
        end
        if not already then
          table.insert(items, {
            instance_id = inst.instance_id,
            item_id = inst.item_id,
            quantity = inst.quantity,
            rarity = inst.rarity,
          })
        end
      end
    end
  end

  if type(xp_note) == "table" then
    table.insert(xp, xp_note)
  end

  return {
    transaction_id = mission.reward_transaction_id or "",
    status = mission.reward_status or "",
    currency = currency,
    items = items,
    xp = xp,
    other = other,
  }
end

local function ensure_reward_snapshot(mission)
  local ref = mission.reward_reference
  if type(ref) ~= "table" then
    ref = {}
  end
  if type(ref.stardust_amount) == "number" and ref.stardust_amount >= 0 and type(ref.currency_id) == "string" then
    return ref, nil
  end
  -- Backfill for missions generated before Phase 14 snapshot fields.
  local level = tonumber(ref.character_level) or tonumber(mission.level_requirement) or 1
  local duration = tonumber(mission.duration_seconds) or MIN_DURATION
  local sd_eff = tonumber(ref.stardust_efficiency) or 1
  local xp_eff = tonumber(ref.xp_efficiency) or 1
  local snap = snapshot_reward_reference(level, duration, sd_eff, xp_eff)
  -- Preserve original efficiencies if present.
  snap.stardust_efficiency = sd_eff
  snap.xp_efficiency = xp_eff
  mission.reward_reference = snap
  return snap, nil
end

local function rpc_mission_claim(context, payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = reject_client_ids(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true,
    mission_id = true,
    request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  -- Reject client-authored reward outcomes.
  if body.rewards ~= nil or body.amount ~= nil or body.currency_id ~= nil
      or body.item_id ~= nil or body.rarity ~= nil or body.seed ~= nil
      or body.affixes ~= nil or body.item_level ~= nil or body.xp ~= nil
      or body.status ~= nil or body.loot_table_id ~= nil or body.won ~= nil
      or body.completes_at ~= nil or body.claimed ~= nil then
    return encode_fail("Client cannot supply reward or completion fields", 400)
  end
  if type(body.mission_id) ~= "string" or body.mission_id == "" then
    return encode_fail("mission_id is required", 400)
  end
  if type(body.request_id) ~= "string" or body.request_id == "" then
    return encode_fail("request_id is required", 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end

  local ok, result = pcall(function()
    local character_id, err = resolve_character_id(user_id, body.character_id)
    if err ~= nil then
      error({ err = err, code = 403 })
    end

    local active_raw, active_ver = read_active(user_id, character_id)
    if active_raw == nil or type(active_raw.mission) ~= "table" then
      error({ err = "No active mission", code = 404 })
    end

    local mission, did = apply_timer_transition(active_raw.mission)
    active_raw.mission = mission
    if did then
      write_active(user_id, character_id, active_raw, active_ver)
      active_ver = nil
      active_raw, active_ver = read_active(user_id, character_id)
      mission = active_raw.mission
    end

    if mission.mission_id ~= body.mission_id then
      error({ err = "mission_id does not match active mission", code = 404 })
    end
    if mission.owner_character_id ~= character_id then
      error({ err = "Mission not owned by character", code = 403 })
    end

    -- Idempotent replay for completed claims.
    if mission.status == "claimed" then
      if mission.claim_request_id ~= "" and mission.claim_request_id ~= body.request_id then
        error({ err = "Conflicting reuse of claim request_id", code = 409 })
      end
      local xp_note = {
        amount = (mission.reward_reference and mission.reward_reference.xp_amount) or 0,
        status = "unsupported",
        reason = "ProgressionService not available",
      }
      local replay_wallet = nil
      local replay_character = nil
      local replay_amount = tonumber(mission.reward_reference and mission.reward_reference.stardust_amount) or 0
      if replay_amount > 0 then
        local replay_bridge, replay_err = wallet_bridge.apply(context, {
          character_id = character_id,
          operation_type = "mission_claim_stardust",
          operation_key = "mission_reward:" .. mission.mission_id,
          reference_id = mission.mission_id,
          amount = replay_amount,
        })
        if replay_err ~= nil then error({ err = replay_err, code = 503 }) end
        replay_wallet = replay_bridge.wallet
        replay_character = replay_bridge.character
      end
      return {
        mission = public_mission(mission),
        reward = build_claim_receipt(mission, mission.reward_receipt_summary, mission.loot_receipt_items, xp_note),
        replay = true,
        wallet = replay_wallet,
        character = replay_character,
      }
    end

    if mission.status == "reward_pending" then
      if mission.claim_request_id ~= "" and mission.claim_request_id ~= body.request_id then
        error({ err = "Conflicting reuse of claim request_id", code = 409 })
      end
      -- Fall through to retry grant using stored transaction ids.
    elseif mission.status == "reward_failed" then
      if mission.claim_request_id ~= "" and mission.claim_request_id ~= body.request_id then
        error({ err = "Conflicting reuse of claim request_id", code = 409 })
      end
      -- Allow retry with same request_id.
    elseif mission.status == "complete" then
      -- OK
    elseif mission.status == "active" then
      error({ err = "Mission not complete yet", code = 409 })
    else
      error({ err = "Mission is not claimable", code = 409 })
    end

    local ref, rerr = ensure_reward_snapshot(mission)
    if rerr ~= nil then
      error({ err = rerr, code = 422 })
    end
    if type(ref.currency_id) ~= "string" or ref.currency_id ~= "stardust" then
      error({ err = "Invalid mission currency reward definition", code = 422 })
    end
    local stardust_amount = tonumber(ref.stardust_amount)
    if stardust_amount == nil or stardust_amount < 0 or stardust_amount ~= math.floor(stardust_amount) then
      error({ err = "Invalid mission stardust amount", code = 422 })
    end
    if stardust_amount > 100000000 then
      error({ err = "Mission stardust amount exceeds hard limit", code = 422 })
    end

    local reward_tid = "mission_reward:" .. mission.mission_id
    local loot_tid = "mission_loot:" .. mission.mission_id
    if #reward_tid > 64 then
      error({ err = "reward transaction_id too long", code = 500 })
    end

    -- Transition to reward_pending before granting.
    mission.status = "reward_pending"
    mission.claim_request_id = body.request_id
    mission.reward_transaction_id = reward_tid
    mission.loot_transaction_id = ""
    mission.reward_status = "pending"
    mission.updated_at = now_ms()
    active_raw.mission = mission
    active_raw.updated_at = now_ms()
    write_active(user_id, character_id, active_raw, active_ver)
    active_ver = nil

    local loot_items = validation.empty_array()
    local reward_entries = validation.empty_array()

    local wallet_result = nil
    if stardust_amount > 0 then
      wallet_result, rerr = wallet_bridge.apply(context, {
        character_id = character_id,
        operation_type = "mission_claim_stardust",
        operation_key = reward_tid,
        reference_id = mission.mission_id,
        amount = stardust_amount,
      })
      if rerr ~= nil then
        mission.status = "reward_failed"
        mission.reward_status = "wallet_failed"
        active_raw.mission = mission
        write_active(user_id, character_id, active_raw, nil)
        error({ err = tostring(rerr), code = 409 })
      end
    end

    if ref.include_loot == true then
      local loot_table_id = ref.loot_table_id
      if type(loot_table_id) ~= "string" or loot_table_id == "" then
        error({ err = "Missing loot_table_id on mission reward reference", code = 422 })
      end
      local loot_record, lerr = loot.generate_loot_bundle({
        user_id = user_id,
        character_id = character_id,
        source_type = "mission",
        source_id = mission.mission_id,
        loot_table_id = loot_table_id,
        transaction_id = loot_tid,
      })
      if lerr ~= nil then
        mission.status = "reward_failed"
        mission.reward_status = "loot_failed"
        active_raw.mission = mission
        write_active(user_id, character_id, active_raw, nil)
        error({ err = "Loot generation failed: " .. tostring(lerr), code = 422 })
      end
      mission.loot_transaction_id = loot_tid
      loot_items = loot_record.generated_items or validation.empty_array()
      for i = 1, #loot_items do
        local inst = loot_items[i]
        table.insert(reward_entries, {
          type = "item",
          item_id = inst.item_id,
          quantity = inst.quantity,
          instance_id = inst.instance_id,
          metadata = inst.metadata,
          rarity = inst.rarity,
          item_level = inst.item_level,
        })
      end
    end

    if #reward_entries < 1 then
      -- Zero currency and no loot — still mark claimed (edge case).
      mission.status = "claimed"
      mission.claimed_at = iso_utc(now_unix())
      mission.reward_status = "completed"
      mission.reward_receipt_summary = { applied = validation.empty_array() }
      if wallet_result ~= nil then
        table.insert(mission.reward_receipt_summary.applied, {
          type = "currency",
          currency_id = "stardust",
          amount = stardust_amount,
          balance_after = wallet_result.wallet.balances.stardust,
        })
      end
      mission.loot_receipt_items = loot_items
      active_raw.mission = mission
      write_active(user_id, character_id, active_raw, nil)
      local xp_note = {
        amount = tonumber(ref.xp_amount) or 0,
        status = "unsupported",
        reason = "ProgressionService not available",
      }
      return {
        mission = public_mission(mission),
        reward = build_claim_receipt(mission, mission.reward_receipt_summary, loot_items, xp_note),
        replay = false,
        wallet = wallet_result and wallet_result.wallet or nil,
        character = wallet_result and wallet_result.character or nil,
      }
    end

    local bundle = {
      reward_version = 1,
      source_type = "mission",
      source_id = mission.mission_id,
      user_id = user_id,
      character_id = character_id,
      transaction_id = reward_tid,
      reason = "mission_claim",
      rewards = reward_entries,
      metadata = {
        claim_request_id = body.request_id,
        loot_transaction_id = mission.loot_transaction_id,
      },
    }

    local reward_result, aerr = rewards.apply_reward_bundle(bundle)
    if aerr ~= nil or reward_result == nil or reward_result.success ~= true then
      local msg = aerr or "Reward apply failed"
      if string.find(tostring(msg), "Inventory full", 1, true) then
        mission.status = "reward_failed"
        mission.reward_status = "inventory_full"
      else
        mission.status = "reward_failed"
        mission.reward_status = "failed"
      end
      active_raw.mission = mission
      write_active(user_id, character_id, active_raw, nil)
      error({ err = tostring(msg), code = 409 })
    end

    -- Mark loot items on mission for receipt replay.
    if mission.loot_transaction_id ~= "" then
      mission.loot_receipt_items = loot_items
    end

    mission.status = "claimed"
    mission.claimed_at = iso_utc(now_unix())
    mission.reward_status = "completed"
    mission.reward_receipt_summary = {
      applied = reward_result.applied or validation.empty_array(),
      transaction_id = reward_tid,
      status = "completed",
    }
    if wallet_result ~= nil then
      table.insert(mission.reward_receipt_summary.applied, {
        type = "currency",
        currency_id = "stardust",
        amount = stardust_amount,
        balance_after = wallet_result.wallet.balances.stardust,
      })
    end
    mission.loot_receipt_items = loot_items
    active_raw.mission = mission
    active_raw.updated_at = now_ms()
    write_active(user_id, character_id, active_raw, nil)

    logging.info("missions", "mission_claim", {
      user_id = user_id,
      request_id = body.request_id,
      mission_id = mission.mission_id,
      reward_transaction_id = reward_tid,
    })

    local xp_note = {
      amount = tonumber(ref.xp_amount) or 0,
      status = "unsupported",
      reason = "ProgressionService not available",
    }

    return {
      mission = public_mission(mission),
      reward = build_claim_receipt(mission, reward_result, loot_items, xp_note),
      replay = false,
      gains = {
        stardust = stardust_amount,
        experience = 0,
        experience_status = "unsupported",
      },
      wallet = wallet_result and wallet_result.wallet or nil,
      character = wallet_result and wallet_result.character or nil,
    }
  end)

  if not ok then
    if type(result) == "table" and result.err ~= nil then
      return encode_fail(result.err, result.code or 400)
    end
    nk.logger_error(string.format("mission_claim failed: %s", tostring(result)))
    return encode_fail("Failed to claim mission", 500)
  end
  return encode_ok(result)
end

--- Skip remaining wait: debit nova_crystals, snap mission to complete.
local function rpc_mission_skip(context, payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = reject_client_ids(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true,
    mission_id = true,
    request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  if body.completes_at ~= nil or body.status ~= nil or body.skip_cost ~= nil
      or body.amount ~= nil or body.currency_id ~= nil then
    return encode_fail("Client cannot supply skip cost or completion fields", 400)
  end
  if type(body.mission_id) ~= "string" or body.mission_id == "" then
    return encode_fail("mission_id is required", 400)
  end
  if type(body.request_id) ~= "string" or body.request_id == "" then
    return encode_fail("request_id is required", 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end

  local ok, result = pcall(function()
    local character_id, err = resolve_character_id(user_id, body.character_id)
    if err ~= nil then
      error({ err = err, code = 403 })
    end

    local active_raw, active_ver = read_active(user_id, character_id)
    if active_raw == nil or type(active_raw.mission) ~= "table" then
      error({ err = "No active mission", code = 404 })
    end

    local mission, did = apply_timer_transition(active_raw.mission)
    active_raw.mission = mission
    if did then
      write_active(user_id, character_id, active_raw, active_ver)
      active_ver = nil
    end

    if mission.mission_id ~= body.mission_id then
      error({ err = "mission_id does not match active mission", code = 404 })
    end

    -- Already claimable — idempotent no-op (no second debit).
    if mission.status == "complete"
        or mission.status == "reward_pending"
        or mission.status == "reward_failed"
        or mission.status == "claimed" then
      if mission.skip_request_id ~= nil and mission.skip_request_id ~= ""
          and mission.skip_request_id ~= body.request_id then
        -- Different request after prior skip is fine if already complete.
      end
      local pub = public_active(active_raw)
      pub.has_active = true
      local replay_wallet = nil
      local replay_character = nil
      local paid = tonumber(mission.skip_cost_paid) or 0
      if paid > 0 and type(mission.skip_request_id) == "string" and mission.skip_request_id ~= "" then
        local replay_bridge, replay_err = wallet_bridge.apply(context, {
          character_id = character_id,
          operation_type = "mission_skip_nova",
          operation_key = "mission_skip:" .. mission.mission_id,
          reference_id = mission.mission_id,
          amount = paid,
        })
        if replay_err ~= nil then error({ err = replay_err, code = 503 }) end
        replay_wallet = replay_bridge.wallet
        replay_character = replay_bridge.character
      end
      return {
        active = pub,
        skip_cost = 0,
        already_complete = true,
        wallet = replay_wallet,
        character = replay_character,
      }
    end

    if mission.status ~= "active" then
      error({ err = "Mission is not active", code = 409 })
    end

    -- Replay same skip request_id after success.
    if mission.skip_request_id ~= nil and mission.skip_request_id == body.request_id
        and mission.status == "complete" then
      local pub = public_active(active_raw)
      pub.has_active = true
      return {
        active = pub,
        skip_cost = tonumber(mission.skip_cost_paid) or 0,
        replay = true,
      }
    end

    local cost = skip_cost_for(mission)
    if cost < 1 then
      -- Timer already elapsed between checks.
      mission.status = "complete"
      mission.completed_at = iso_utc(now_unix())
      active_raw.mission = mission
      active_raw.updated_at = now_ms()
      write_active(user_id, character_id, active_raw, active_ver)
      local pub = public_active(active_raw)
      pub.has_active = true
      return {
        active = pub,
        skip_cost = 0,
        already_complete = true,
      }
    end

    local wallet_result, wallet_err, wallet_code = wallet_bridge.apply(context, {
      character_id = character_id,
      operation_type = "mission_skip_nova",
      operation_key = "mission_skip:" .. mission.mission_id,
      reference_id = mission.mission_id,
      amount = cost,
    })
    if wallet_err ~= nil then
      error({ err = wallet_err, code = wallet_code or 409 })
    end

    -- Timer skip only. Nova was already debited from the authoritative Node
    -- Character ledger through the trusted bridge above.
    local now = now_unix()
    mission.status = "complete"
    mission.completed_at = iso_utc(now)
    mission.completes_at = iso_utc(now)
    mission.completes_at_unix = now
    mission.skip_request_id = body.request_id
    mission.skip_cost_paid = cost
    mission.updated_at = now_ms()
    active_raw.mission = mission
    active_raw.updated_at = now_ms()
    local write_ok, write_err = pcall(function()
      write_active(user_id, character_id, active_raw, active_ver)
    end)
    if not write_ok then
      local _, compensation_err = wallet_bridge.apply(context, {
        character_id = character_id,
        operation_type = "mission_skip_nova_refund",
        operation_key = "mission_skip_refund:" .. mission.mission_id,
        reference_id = mission.mission_id,
        amount = cost,
      })
      if compensation_err ~= nil then
        error({
          err = "Mission skip failed after payment; compensation pending, retry reconciliation",
          code = 503,
        })
      end
      error({ err = tostring(write_err) .. " (Nova compensated)", code = 409 })
    end

    logging.info("missions", "mission_skip", {
      user_id = user_id,
      request_id = body.request_id,
      mission_id = mission.mission_id,
      skip_cost = cost,
    })

    local pub = public_active(active_raw)
    pub.has_active = true
    return {
      active = pub,
      skip_cost = cost,
      already_complete = false,
      wallet = wallet_result.wallet,
      character = wallet_result.character,
    }
  end)

  if not ok then
    if type(result) == "table" and result.err ~= nil then
      return encode_fail(result.err, result.code or 400)
    end
    nk.logger_error(string.format("mission_skip failed: %s", tostring(result)))
    return encode_fail("Failed to skip mission", 500)
  end
  return encode_ok(result)
end

nk.register_rpc(rpc_missions_get, "missions_get")
nk.register_rpc(rpc_missions_refresh, "missions_refresh")
nk.register_rpc(rpc_mission_start, "mission_start")
nk.register_rpc(rpc_mission_status, "mission_status")
nk.register_rpc(rpc_mission_claim, "mission_claim")
nk.register_rpc(rpc_mission_skip, "mission_skip")
nk.logger_info("Phase 14 mission RPCs registered (incl. mission_claim, mission_skip) — rewards via RewardService/LootService")
