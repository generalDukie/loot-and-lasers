--[[
  Phase 7 — Mission service core (Nakama Lua).
  Public RPCs: missions_get, missions_refresh, mission_start, mission_status
  NO rewards, XP, currency, items, fuel/energy, claim, or loot grants.

  Ownership: character-level (matches Node Mission.character_id).
  Account id = context.user_id only. Character must match profile.selected_character_id.

  Storage:
    mission_boards / <character_id>
    active_missions / <character_id>
]]

local nk = require("nakama")

local BOARD_COLLECTION = "mission_boards"
local ACTIVE_COLLECTION = "active_missions"
local PROFILE_COLLECTION = "player_profiles"
local PROFILE_KEY = "profile"

local MAX_CHARACTER_ID = 64
local BOARD_SIZE = 3
local REFRESH_COOLDOWN_SEC = 15
local MIN_DURATION = 15
local MAX_DURATION = 1200
local MAX_WRITE_RETRIES = 5

local ALLOWED_STATUS = {
  available = true,
  active = true,
  complete = true,
  expired = true,
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
  return os.time()
end

local function now_ms()
  return os.time() * 1000
end

local function iso_utc(unix)
  -- Basic UTC ISO without strftime %z (Nakama Lua os.date is limited).
  return os.date("!%Y-%m-%dT%H:%M:%SZ", unix)
end

local function encode_ok(data)
  return nk.json_encode({
    success = true,
    data = data or {},
    error = "",
    status_code = 200,
  })
end

local function encode_fail(message, status_code)
  return nk.json_encode({
    success = false,
    data = {},
    error = message or "Request failed",
    status_code = status_code or 400,
  })
end

local function decode_payload(payload)
  if payload == nil or payload == "" then
    return {}
  end
  local ok, decoded = pcall(nk.json_decode, payload)
  if not ok or type(decoded) ~= "table" then
    return nil
  end
  return decoded
end

local function empty_array()
  return nk.json_decode("[]")
end

local function rand_u32()
  local u = nk.uuid_v4()
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
  local objects = nk.storage_read({
    { collection = PROFILE_COLLECTION, key = PROFILE_KEY, user_id = user_id },
  })
  if objects == nil or #objects == 0 then
    return nil
  end
  local value = objects[1].value
  if type(value) ~= "table" then
    return nil
  end
  return value
end

local function resolve_character_id(user_id, requested)
  local profile = read_profile(user_id)
  local selected = ""
  if profile ~= nil and type(profile.selected_character_id) == "string" then
    selected = profile.selected_character_id
  end

  if requested ~= nil and requested ~= "" then
    if type(requested) ~= "string" then
      return nil, "character_id must be a string"
    end
    if #requested > MAX_CHARACTER_ID then
      return nil, "character_id is too long"
    end
    if selected == "" then
      return nil, "No selected character on profile"
    end
    if requested ~= selected then
      return nil, "character_id is not the selected character for this account"
    end
    return requested, nil
  end

  if selected == "" then
    return nil, "No selected character on profile"
  end
  return selected, nil
end

local function reject_client_ids(body)
  if body.account_id ~= nil or body.user_id ~= nil or body.owner_id ~= nil then
    return "Unknown or forbidden field"
  end
  return nil
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
    completed_at = m.completed_at or "",
    expires_at = m.expires_at or "",
    reward_reference = m.reward_reference or {},
    metadata = m.metadata or {},
  }
end

local function build_mission(character_id, tpl, level)
  local duration = roll_duration(level)
  local generated = now_unix()
  local patron = QUEST_GIVERS[rand_int(1, #QUEST_GIVERS)]
  return {
    mission_version = 1,
    mission_id = nk.uuid_v4(),
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
    reward_reference = {
      -- Future claim phase only — never granted by this module.
      stardust_efficiency = roll_efficiency(level),
      xp_efficiency = roll_efficiency(level),
    },
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
  local count = math.min(BOARD_SIZE, #shuffled)
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

local function ensure_board(user_id, character_id, level, highest_sector, force_refresh)
  local board, version = read_board(user_id, character_id)
  local now = now_unix()

  if board ~= nil and type(board) == "table" and not force_refresh then
    if type(board.missions) == "table" and #board.missions > 0 then
      return board, version, false
    end
  end

  if force_refresh and board ~= nil and type(board) == "table" then
    local last = tonumber(board.last_refresh_at) or 0
    if last > 0 and (now - last) < REFRESH_COOLDOWN_SEC then
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
      if last > 0 and (now_unix() - last) < REFRESH_COOLDOWN_SEC then
        return nil, nil, "Refresh cooldown active"
      end
    end
    if not force_refresh and cur ~= nil and type(cur.missions) == "table" and #cur.missions > 0 then
      return cur, ver, false
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
    refresh_cooldown_seconds = REFRESH_COOLDOWN_SEC,
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
    is_complete = active.mission.status == "complete",
    ready_for_resolution = active.mission.status == "complete",
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
      -- complete/expired: clear pointer so a new mission can start (no rewards this phase).
      if m.status == "complete" or m.status == "expired" then
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
      error({ err = last_err, code = 409 })
    end

    return public_active(active_doc)
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

nk.register_rpc(rpc_missions_get, "missions_get")
nk.register_rpc(rpc_missions_refresh, "missions_refresh")
nk.register_rpc(rpc_mission_start, "mission_start")
nk.register_rpc(rpc_mission_status, "mission_status")
nk.logger_info("Phase 7 mission RPCs registered (missions_get, missions_refresh, mission_start, mission_status) — no rewards")
