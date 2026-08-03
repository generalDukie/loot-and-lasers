--[[
  Phase 18 — Arena matchmaking & rankings (Nakama Lua).

  Public RPCs:
    arena_get_state, arena_get_opponents, arena_refresh_opponents,
    arena_get_rankings, arena_challenge, arena_get_history

  Combat via CombatService (modules/combat.lua). Rating via lib.arena_rating.
  No rewards / guild wars / bots / premium attempts in this phase.
]]

local nk = require("nakama")
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local storage = require("lib.storage")
local time = require("lib.time")
local logging = require("lib.logging")
local transactions = require("lib.transactions")
local ids = require("lib.ids")
local remote_config = require("config")
local arena_rating = require("lib.arena_rating")
local combat = require("combat")

local STATE_COLLECTION = "arena_states"
local INDEX_COLLECTION = "arena_index"
local TX_COLLECTION = "arena_transactions"
local HISTORY_COLLECTION = "arena_history"
local SYSTEM_OWNER = remote_config.SYSTEM_OWNER or "00000000-0000-0000-0000-000000000000"
local ARENA_VERSION = 1
local BATTLE_VERSION = 1

local DEFAULT_TIER_THRESHOLDS = {
  { id = "bronze", min_rating = 0 },
  { id = "silver", min_rating = 1100 },
  { id = "gold", min_rating = 1300 },
  { id = "platinum", min_rating = 1500 },
  { id = "diamond", min_rating = 1800 },
}

local function feature_on(flag_id, context)
  local flag = remote_config.get_feature_flag(flag_id, context)
  if flag == nil then
    return true
  end
  return flag.enabled == true
end

local function cfg_int(key, default)
  local v = remote_config.get_config_value("arena", key)
  local n = tonumber(v)
  if n == nil then
    return default
  end
  return math.floor(n)
end

local function cfg_num(key, default)
  local v = remote_config.get_config_value("arena", key)
  local n = tonumber(v)
  if n == nil then
    return default
  end
  return n
end

local function cfg_string(key, default)
  local v = remote_config.get_config_value("arena", key)
  if type(v) ~= "string" or v == "" then
    return default
  end
  return v
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

local function encode_fail(message, status)
  return responses.fail_status(message, status or 400)
end

local function iso_now()
  return time.iso_utc()
end

local function now_unix()
  return time.unix()
end

local function utc_day_key()
  -- YYYY-MM-DD from ISO
  local iso = iso_now()
  return string.sub(tostring(iso), 1, 10)
end

local function current_season_id()
  local configured = cfg_string("active_season_id", "")
  if configured ~= "" then
    return configured
  end
  return string.sub(utc_day_key(), 1, 7) -- YYYY-MM
end

local function gap_bands()
  return {
    full_gain_difference = cfg_int("full_gain_difference", 100),
    reduced_gain_start = cfg_int("reduced_gain_start", 250),
    severe_reduction_start = cfg_int("severe_reduction_start", 400),
    zero_gain_cutoff = cfg_int("zero_gain_cutoff", 400),
    medium_multiplier = cfg_int("medium_gain_multiplier", 50) / 100.0,
    low_multiplier = cfg_int("low_gain_multiplier", 20) / 100.0,
  }
end

local function repeat_policy()
  return {
    full_reward_matches = cfg_int("repeat_full_reward_matches", 1),
    reduced_reward_matches = cfg_int("repeat_reduced_reward_matches", 1),
    repeated_opponent_gain_multiplier = cfg_int("repeated_opponent_gain_multiplier", 40) / 100.0,
    no_gain_after_repeat_count = cfg_int("no_gain_after_repeat_count", 2),
  }
end

local function tier_thresholds()
  -- Flat RemoteConfig cannot store arrays cleanly; use documented defaults.
  return DEFAULT_TIER_THRESHOLDS
end

local function empty_recent()
  return validation.empty_array()
end

local function empty_state(character_id)
  local rating = cfg_int("default_rating", 1000)
  local season = current_season_id()
  return {
    arena_version = ARENA_VERSION,
    character_id = character_id,
    rating = rating,
    rank_position = 0,
    tier_id = arena_rating.tier_for_rating(rating, tier_thresholds()),
    wins = 0,
    losses = 0,
    win_streak = 0,
    loss_streak = 0,
    battles_today = 0,
    battles_date = utc_day_key(),
    last_battle_at = "",
    next_battle_at = "",
    opponents_refresh_at = "",
    cached_opponents = validation.empty_array(),
    recent_opponents = empty_recent(),
    season_id = season,
    revision = 1,
    updated_at = iso_now(),
    class = "Vanguard",
    level = 1,
    display_name = "",
  }
end

local function read_state(user_id, character_id)
  local value, version, found = storage.read_one(user_id, STATE_COLLECTION, character_id)
  if not found then
    return nil, nil
  end
  return value, version
end

local function write_state(user_id, character_id, doc, version)
  return storage.write_one(user_id, STATE_COLLECTION, character_id, doc, version, 1, 0)
end

local function read_index(character_id)
  local value, version, found = storage.read_one(SYSTEM_OWNER, INDEX_COLLECTION, character_id)
  if not found then
    return nil, nil
  end
  return value, version
end

local function write_index(character_id, doc, version)
  return storage.write_one(SYSTEM_OWNER, INDEX_COLLECTION, character_id, doc, version, 2, 0)
end

local function read_tx(user_id, request_id)
  local value, version, found = storage.read_one(user_id, TX_COLLECTION, request_id)
  if not found then
    return nil, nil
  end
  return value, version
end

local function write_tx(user_id, request_id, record, version)
  return storage.write_one(user_id, TX_COLLECTION, request_id, record, version, 1, 0)
end

local function roll_day(state)
  local today = utc_day_key()
  if state.battles_date ~= today then
    state.battles_date = today
    state.battles_today = 0
  end
  return state
end

local function public_state(state)
  return {
    arena_version = state.arena_version,
    character_id = state.character_id,
    rating = state.rating,
    rank_position = state.rank_position or 0,
    tier_id = state.tier_id,
    wins = state.wins,
    losses = state.losses,
    win_streak = state.win_streak,
    loss_streak = state.loss_streak,
    battles_today = state.battles_today,
    battles_date = state.battles_date,
    daily_attempt_limit = cfg_int("daily_attempt_limit", 10),
    last_battle_at = state.last_battle_at,
    next_battle_at = state.next_battle_at,
    season_id = state.season_id,
    revision = state.revision,
    updated_at = state.updated_at,
    class = state.class,
    level = state.level,
    display_name = state.display_name,
  }
end

local function upsert_index(user_id, state)
  local doc = {
    character_id = state.character_id,
    user_id = user_id,
    rating = state.rating,
    tier_id = state.tier_id,
    display_name = state.display_name or "",
    class = state.class or "Vanguard",
    level = state.level or 1,
    season_id = state.season_id,
    eligible = true,
    updated_at = iso_now(),
  }
  local _, version = read_index(state.character_id)
  write_index(state.character_id, doc, version)
end

local function ensure_state(user_id, character_id, meta)
  local state, version = read_state(user_id, character_id)
  if state == nil then
    state = empty_state(character_id)
    if type(meta) == "table" then
      if type(meta.class) == "string" and meta.class ~= "" then
        state.class = meta.class
      end
      if tonumber(meta.level) then
        state.level = math.max(1, math.min(100, math.floor(tonumber(meta.level))))
      end
      if type(meta.display_name) == "string" then
        state.display_name = meta.display_name
      end
    end
    if state.display_name == "" then
      local profile = auth.read_profile(user_id)
      if profile ~= nil and type(profile.display_name) == "string" then
        state.display_name = profile.display_name
      end
    end
    state.tier_id = arena_rating.tier_for_rating(state.rating, tier_thresholds())
    write_state(user_id, character_id, state, nil)
    state, version = read_state(user_id, character_id)
  else
    state = roll_day(state)
    if type(meta) == "table" then
      local dirty = false
      if type(meta.class) == "string" and meta.class ~= "" and meta.class ~= state.class then
        state.class = meta.class
        dirty = true
      end
      if tonumber(meta.level) then
        local lv = math.max(1, math.min(100, math.floor(tonumber(meta.level))))
        if lv ~= state.level then
          state.level = lv
          dirty = true
        end
      end
      if type(meta.display_name) == "string" and meta.display_name ~= "" and meta.display_name ~= state.display_name then
        state.display_name = meta.display_name
        dirty = true
      end
      if dirty then
        state.updated_at = iso_now()
        write_state(user_id, character_id, state, version)
        state, version = read_state(user_id, character_id)
      end
    end
  end
  upsert_index(user_id, state)
  return state, version
end

local function list_index_entries(limit)
  local out = {}
  local cursor = ""
  local remaining = math.min(limit or 200, 500)
  while remaining > 0 do
    local batch = math.min(100, remaining)
    local objects, next_cursor = nk.storage_list(SYSTEM_OWNER, INDEX_COLLECTION, batch, cursor)
    if objects == nil or #objects == 0 then
      break
    end
    for i = 1, #objects do
      local v = objects[i].value
      if type(v) == "table" and type(v.character_id) == "string" then
        table.insert(out, v)
      end
    end
    remaining = remaining - #objects
    if next_cursor == nil or next_cursor == "" then
      break
    end
    cursor = next_cursor
  end
  return out
end

local function count_recent_wins_vs(state, opponent_character_id, window_seconds)
  local recent = state.recent_opponents
  if type(recent) ~= "table" then
    return 0
  end
  local cutoff = now_unix() - (tonumber(window_seconds) or 86400)
  local wins = 0
  local battles = 0
  for i = 1, #recent do
    local row = recent[i]
    if type(row) == "table"
      and row.opponent_character_id == opponent_character_id
      and (tonumber(row.at) or 0) >= cutoff
    then
      battles = battles + 1
      if row.won == true then
        wins = wins + 1
      end
    end
  end
  return wins, battles
end

local function push_recent(state, opponent_character_id, won)
  local recent = state.recent_opponents
  if type(recent) ~= "table" then
    recent = empty_recent()
  end
  table.insert(recent, 1, {
    opponent_character_id = opponent_character_id,
    won = won == true,
    at = now_unix(),
  })
  while #recent > 40 do
    table.remove(recent)
  end
  state.recent_opponents = recent
end

local function cooldown_active(state)
  local next_at = state.next_battle_at
  if type(next_at) ~= "string" or next_at == "" then
    return false, 0
  end
  -- Compare via unix if parseable; else string compare ISO
  local cd = cfg_int("battle_cooldown_seconds", 300)
  local last = state.last_battle_at
  if type(last) ~= "string" or last == "" then
    return false, 0
  end
  -- next_battle_at stored as ISO; eligibility: now < next → active
  -- Use stored next_battle_at unix via time helper if available; fallback string.
  local now = iso_now()
  if now < next_at then
    return true, cd
  end
  return false, 0
end

local function attempts_remaining(state)
  state = roll_day(state)
  local limit = cfg_int("daily_attempt_limit", 10)
  return math.max(0, limit - (tonumber(state.battles_today) or 0)), limit
end

local function estimate_matchup(my_rating, their_rating)
  local gap = my_rating - their_rating
  if math.abs(gap) <= 50 then
    return "even"
  end
  if gap > 0 then
    return "favored"
  end
  return "underdog"
end

local function public_opponent_card(entry, my_rating, my_character_id, my_user_id, state)
  local their_rating = tonumber(entry.rating) or 1000
  local wins, battles = count_recent_wins_vs(state, entry.character_id, cfg_int("repeat_opponent_window_seconds", 86400))
  local max_per = cfg_int("max_rated_battles_per_opponent", 3)
  local eligible = true
  local reason = ""
  if entry.character_id == my_character_id then
    eligible = false
    reason = "self"
  elseif entry.user_id == my_user_id then
    eligible = false
    reason = "same_account"
  elseif battles >= max_per then
    eligible = false
    reason = "anti_farm"
  elseif entry.eligible == false then
    eligible = false
    reason = "ineligible"
  end
  return {
    character_id = entry.character_id,
    display_name = entry.display_name ~= "" and entry.display_name or "Rival",
    class = entry.class or "Vanguard",
    level = entry.level or 1,
    rating = their_rating,
    tier_id = entry.tier_id or arena_rating.tier_for_rating(their_rating, tier_thresholds()),
    matchup = estimate_matchup(my_rating, their_rating),
    challenge_eligible = eligible,
    eligibility_reason = reason,
    estimated_win_gain = nil,
  }
end

local function select_opponents(my_user_id, my_character_id, state)
  local my_rating = tonumber(state.rating) or 1000
  local initial = cfg_int("matchmaking_initial_window", 120)
  local step = cfg_int("matchmaking_window_step", 80)
  local max_window = cfg_int("matchmaking_max_window", 800)
  local slots = cfg_int("matchmaking_slots", 3)
  local all = list_index_entries(400)
  local window = initial
  local picked = {}
  local seen = {}

  local function try_collect()
    local candidates = {}
    for i = 1, #all do
      local e = all[i]
      if e.character_id ~= my_character_id
        and e.user_id ~= my_user_id
        and e.eligible ~= false
        and not seen[e.character_id]
      then
        local dist = math.abs((tonumber(e.rating) or 1000) - my_rating)
        if dist <= window then
          local _, battles = count_recent_wins_vs(
            state, e.character_id, cfg_int("repeat_opponent_window_seconds", 86400)
          )
          if battles < cfg_int("max_rated_battles_per_opponent", 3) then
            table.insert(candidates, { entry = e, dist = dist })
          end
        end
      end
    end
    table.sort(candidates, function(a, b)
      if a.dist == b.dist then
        return tostring(a.entry.character_id) < tostring(b.entry.character_id)
      end
      return a.dist < b.dist
    end)
    for i = 1, #candidates do
      if #picked >= slots then
        break
      end
      local cid = candidates[i].entry.character_id
      if not seen[cid] then
        seen[cid] = true
        table.insert(picked, candidates[i].entry)
      end
    end
  end

  while #picked < slots and window <= max_window do
    try_collect()
    if #picked >= slots then
      break
    end
    window = window + step
  end

  local cards = validation.empty_array()
  for i = 1, #picked do
    table.insert(cards, public_opponent_card(picked[i], my_rating, my_character_id, my_user_id, state))
  end
  return cards, window
end

local function compute_rank_position(character_id, rating)
  local all = list_index_entries(500)
  local better = 0
  for i = 1, #all do
    local e = all[i]
    local r = tonumber(e.rating) or 0
    if r > rating or (r == rating and tostring(e.character_id) < tostring(character_id)) then
      better = better + 1
    end
  end
  return better + 1, #all
end

local function find_opponent_owner(opponent_character_id)
  local idx = read_index(opponent_character_id)
  if idx == nil or type(idx.user_id) ~= "string" then
    return nil, "Opponent not found in Arena"
  end
  return idx, nil
end

local function apply_meta_from_body(body)
  return {
    class = body.class,
    level = body.level,
    display_name = body.display_name,
  }
end

---------------------------------------------------------------------------
-- RPCs
---------------------------------------------------------------------------

local function rpc_arena_get_state(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("arena_enabled", context) then
    return encode_fail("Arena is disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true, class = true, level = true, display_name = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, false)
  if resolve_err ~= nil then
    return encode_fail(resolve_err, 403)
  end
  local state = ensure_state(user_id, character_id, apply_meta_from_body(body))
  local rank, total = compute_rank_position(character_id, state.rating)
  state.rank_position = rank
  local rem, limit = attempts_remaining(state)
  local on_cd = cooldown_active(state)
  return responses.ok({
    arena = public_state(state),
    rank_position = rank,
    ranked_population = total,
    attempts_remaining = rem,
    daily_attempt_limit = limit,
    cooldown_active = on_cd,
    season_id = state.season_id,
  })
end

local function rpc_arena_get_opponents(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("arena_enabled", context) or not feature_on("arena_matchmaking_enabled", context) then
    return encode_fail("Arena matchmaking is disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true, class = true, level = true, display_name = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, false)
  if resolve_err ~= nil then
    return encode_fail(resolve_err, 403)
  end
  local state, version = ensure_state(user_id, character_id, apply_meta_from_body(body))
  local cards, window = select_opponents(user_id, character_id, state)
  state.cached_opponents = cards
  state.updated_at = iso_now()
  write_state(user_id, character_id, state, version)
  return responses.ok({
    opponents = cards,
    count = #cards,
    matchmaking_window = window,
    rating = state.rating,
  })
end

local function rpc_arena_refresh_opponents(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("arena_enabled", context) or not feature_on("arena_matchmaking_enabled", context) then
    return encode_fail("Arena matchmaking is disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true, request_id = true, class = true, level = true, display_name = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, false)
  if resolve_err ~= nil then
    return encode_fail(resolve_err, 403)
  end

  local existing = read_tx(user_id, body.request_id)
  if existing ~= nil then
    if existing.type ~= "refresh_opponents" or existing.character_id ~= character_id then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing.result) == "table" then
      return responses.ok(existing.result)
    end
  end

  local state, version = ensure_state(user_id, character_id, apply_meta_from_body(body))
  local refresh_cd = cfg_int("opponent_refresh_cooldown_seconds", 300)
  if type(state.opponents_refresh_at) == "string" and state.opponents_refresh_at ~= "" then
    if iso_now() < state.opponents_refresh_at then
      return encode_fail("Opponent refresh cooldown active", 429)
    end
  end

  local cards, window = select_opponents(user_id, character_id, state)
  local next_refresh = os.date("!%Y-%m-%dT%H:%M:%SZ", now_unix() + refresh_cd)
  state.cached_opponents = cards
  state.opponents_refresh_at = next_refresh
  state.updated_at = iso_now()
  write_state(user_id, character_id, state, version)

  local result = {
    opponents = cards,
    count = #cards,
    matchmaking_window = window,
    opponents_refresh_at = next_refresh,
    replay = false,
  }
  write_tx(user_id, body.request_id, {
    type = "refresh_opponents",
    character_id = character_id,
    request_id = body.request_id,
    result = result,
    status = "completed",
    created_at = iso_now(),
  }, nil)
  result.replay = false
  return responses.ok(result)
end

local function rpc_arena_get_rankings(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("arena_enabled", context) or not feature_on("arena_rankings_enabled", context) then
    return encode_fail("Arena rankings are disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true, limit = true, cursor = true, class = true, level = true, display_name = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, false)
  if resolve_err ~= nil then
    return encode_fail(resolve_err, 403)
  end
  local state = ensure_state(user_id, character_id, apply_meta_from_body(body))
  local max_page = cfg_int("rankings_page_size", 50)
  local limit = tonumber(body.limit) or max_page
  if limit < 1 then
    limit = 1
  end
  if limit > max_page then
    limit = max_page
  end
  local offset = 0
  if type(body.cursor) == "string" and body.cursor ~= "" then
    offset = tonumber(body.cursor) or 0
    if offset < 0 then
      offset = 0
    end
  end

  local all = list_index_entries(500)
  table.sort(all, function(a, b)
    local ra = tonumber(a.rating) or 0
    local rb = tonumber(b.rating) or 0
    if ra == rb then
      return tostring(a.character_id) < tostring(b.character_id)
    end
    return ra > rb
  end)

  local page = validation.empty_array()
  local end_i = math.min(offset + limit, #all)
  for i = offset + 1, end_i do
    local e = all[i]
    local card = public_opponent_card(e, state.rating, character_id, user_id, state)
    card.rank = i
    table.insert(page, card)
  end
  local next_cursor = ""
  if end_i < #all then
    next_cursor = tostring(end_i)
  end
  local my_rank = 0
  for i = 1, #all do
    if all[i].character_id == character_id then
      my_rank = i
      break
    end
  end
  return responses.ok({
    rankings = page,
    next_cursor = next_cursor,
    total = #all,
    self_rank = my_rank,
    self_rating = state.rating,
  })
end

local FORBIDDEN_CHALLENGE = {
  damage = true, hit = true, crit = true, rng = true, seed = true, stats = true,
  hp = true, winner = true, rating_change = true, rating_delta = true,
  combat_log = true, events = true, buffs = true, defense_snapshot = true,
  opponent_stats = true, rewards = true,
}

local function rpc_arena_challenge(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("arena_enabled", context) or not feature_on("arena_direct_challenge_enabled", context) then
    return encode_fail("Arena challenges are disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  for key, _ in pairs(body) do
    if FORBIDDEN_CHALLENGE[key] then
      return encode_fail("Client may not submit arena outcome field: " .. tostring(key), 400)
    end
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true,
    opponent_character_id = true,
    request_id = true,
    class = true,
    level = true,
    display_name = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local opponent_character_id, oerr = validation.require_string(body.opponent_character_id, "opponent_character_id", 64)
  if oerr ~= nil then
    return encode_fail(oerr, 400)
  end
  local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, false)
  if resolve_err ~= nil then
    return encode_fail(resolve_err, 403)
  end
  if opponent_character_id == character_id then
    return encode_fail("Cannot challenge yourself", 400)
  end

  local existing = read_tx(user_id, body.request_id)
  if existing ~= nil then
    if existing.type ~= "challenge"
      or existing.character_id ~= character_id
      or existing.opponent_character_id ~= opponent_character_id
    then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing.result) == "table" then
      existing.result.replay = true
      return responses.ok(existing.result)
    end
  end

  local challenger_state, challenger_version = ensure_state(user_id, character_id, apply_meta_from_body(body))
  local on_cd = cooldown_active(challenger_state)
  if on_cd then
    return encode_fail("Battle cooldown active", 429)
  end
  local rem = attempts_remaining(challenger_state)
  if rem <= 0 then
    return encode_fail("Daily arena attempt limit reached", 429)
  end

  local idx, ierr = find_opponent_owner(opponent_character_id)
  if ierr ~= nil then
    return encode_fail(ierr, 404)
  end
  if idx.user_id == user_id then
    return encode_fail("Cannot challenge another character on the same account", 400)
  end

  local opp_user = idx.user_id
  local opp_state, opp_version = read_state(opp_user, opponent_character_id)
  if opp_state == nil then
    -- Index exists but state missing — rebuild minimal from index
    opp_state = empty_state(opponent_character_id)
    opp_state.rating = tonumber(idx.rating) or cfg_int("default_rating", 1000)
    opp_state.class = idx.class or "Vanguard"
    opp_state.level = idx.level or 1
    opp_state.display_name = idx.display_name or ""
    write_state(opp_user, opponent_character_id, opp_state, nil)
    opp_state, opp_version = read_state(opp_user, opponent_character_id)
  end

  local _, battles = count_recent_wins_vs(
    challenger_state, opponent_character_id, cfg_int("repeat_opponent_window_seconds", 86400)
  )
  if battles >= cfg_int("max_rated_battles_per_opponent", 3) then
    return encode_fail("Anti-farming limit: too many rated battles vs this opponent", 429)
  end
  local prior_wins = select(1, count_recent_wins_vs(
    challenger_state, opponent_character_id, cfg_int("repeat_opponent_window_seconds", 86400)
  ))

  -- Persist pending intent
  local battle_id = "ab-" .. tostring(body.request_id)
  local tx = {
    type = "challenge",
    status = "pending",
    request_id = body.request_id,
    battle_id = battle_id,
    character_id = character_id,
    opponent_character_id = opponent_character_id,
    opponent_user_id = opp_user,
    created_at = iso_now(),
  }
  write_tx(user_id, body.request_id, tx, nil)

  -- Defense: live equipment load (no client snapshot). Documented Phase 18 decision.
  local fighter_a, _, fp_a = combat.build_character_combatant(user_id, character_id, {
    class = challenger_state.class,
    level = challenger_state.level,
    display_name = challenger_state.display_name ~= "" and challenger_state.display_name or "Challenger",
    side = "player",
  })
  local fighter_b, _, fp_b = combat.build_character_combatant(opp_user, opponent_character_id, {
    class = opp_state.class,
    level = opp_state.level,
    display_name = opp_state.display_name ~= "" and opp_state.display_name or "Opponent",
    side = "opponent",
  })

  local seed = table.concat({
    "arena", body.request_id, character_id, opponent_character_id, fp_a, fp_b,
  }, "|")
  local combat_result = combat.simulate_combat(fighter_a, fighter_b, seed)
  tx.status = "combat_resolved"
  tx.combat = {
    winner = combat_result.winner,
    seed = combat_result.seed,
    rounds = combat_result.rounds,
  }

  local challenger_won = combat_result.winner == "player"
  local cr_before = tonumber(challenger_state.rating) or 1000
  local or_before = tonumber(opp_state.rating) or 1000

  local delta_info = arena_rating.compute_rating_delta({
    challenger_rating = cr_before,
    opponent_rating = or_before,
    won = challenger_won,
    k_factor = cfg_int("k_factor", 28),
    rating_divisor = cfg_int("rating_divisor", 400),
    maximum_gain = cfg_int("maximum_gain", 32),
    maximum_loss = cfg_int("maximum_loss", 32),
    minimum_nonzero_gain = cfg_int("minimum_nonzero_gain", 1),
    gap_bands = gap_bands(),
    repeat_policy = repeat_policy(),
    prior_ranked_wins = prior_wins,
  })

  -- Opponent (defender) delta is mirrored Elo without gap/repeat win bonuses.
  local def_delta_info = arena_rating.compute_rating_delta({
    challenger_rating = or_before,
    opponent_rating = cr_before,
    won = not challenger_won,
    k_factor = cfg_int("k_factor", 28),
    rating_divisor = cfg_int("rating_divisor", 400),
    maximum_gain = cfg_int("maximum_gain", 32),
    maximum_loss = cfg_int("maximum_loss", 32),
    minimum_nonzero_gain = cfg_int("minimum_nonzero_gain", 1),
    gap_bands = {
      full_gain_difference = 99999,
      reduced_gain_start = 99999,
      severe_reduction_start = 99999,
      zero_gain_cutoff = 99999,
      medium_multiplier = 1,
      low_multiplier = 1,
    },
    repeat_policy = {
      full_reward_matches = 999,
      reduced_reward_matches = 0,
      repeated_opponent_gain_multiplier = 1,
      no_gain_after_repeat_count = 999,
    },
    prior_ranked_wins = 0,
  })

  local min_r = cfg_int("minimum_rating", 0)
  local max_r = cfg_int("maximum_rating", 3000)
  local cr_after = arena_rating.clamp_rating(cr_before + delta_info.rating_delta, min_r, max_r)
  local or_after = arena_rating.clamp_rating(or_before + def_delta_info.rating_delta, min_r, max_r)
  local applied_challenger = cr_after - cr_before
  local applied_opponent = or_after - or_before

  tx.status = "ratings_pending"

  -- Update challenger
  challenger_state.rating = cr_after
  challenger_state.tier_id = arena_rating.tier_for_rating(cr_after, tier_thresholds())
  if challenger_won then
    challenger_state.wins = (tonumber(challenger_state.wins) or 0) + 1
    challenger_state.win_streak = (tonumber(challenger_state.win_streak) or 0) + 1
    challenger_state.loss_streak = 0
  else
    challenger_state.losses = (tonumber(challenger_state.losses) or 0) + 1
    challenger_state.loss_streak = (tonumber(challenger_state.loss_streak) or 0) + 1
    challenger_state.win_streak = 0
  end
  challenger_state = roll_day(challenger_state)
  challenger_state.battles_today = (tonumber(challenger_state.battles_today) or 0) + 1
  local cd = cfg_int("battle_cooldown_seconds", 300)
  challenger_state.last_battle_at = iso_now()
  challenger_state.next_battle_at = os.date("!%Y-%m-%dT%H:%M:%SZ", now_unix() + cd)
  push_recent(challenger_state, opponent_character_id, challenger_won)
  challenger_state.revision = (tonumber(challenger_state.revision) or 1) + 1
  challenger_state.updated_at = iso_now()
  local rank = select(1, compute_rank_position(character_id, cr_after))
  challenger_state.rank_position = rank
  write_state(user_id, character_id, challenger_state, challenger_version)
  upsert_index(user_id, challenger_state)

  -- Update opponent
  opp_state.rating = or_after
  opp_state.tier_id = arena_rating.tier_for_rating(or_after, tier_thresholds())
  if not challenger_won then
    opp_state.wins = (tonumber(opp_state.wins) or 0) + 1
    opp_state.win_streak = (tonumber(opp_state.win_streak) or 0) + 1
    opp_state.loss_streak = 0
  else
    opp_state.losses = (tonumber(opp_state.losses) or 0) + 1
    opp_state.loss_streak = (tonumber(opp_state.loss_streak) or 0) + 1
    opp_state.win_streak = 0
  end
  opp_state.revision = (tonumber(opp_state.revision) or 1) + 1
  opp_state.updated_at = iso_now()
  write_state(opp_user, opponent_character_id, opp_state, opp_version)
  upsert_index(opp_user, opp_state)

  local winner_cid = challenger_won and character_id or opponent_character_id
  local loser_cid = challenger_won and opponent_character_id or character_id
  local history = {
    battle_version = BATTLE_VERSION,
    battle_id = battle_id,
    season_id = current_season_id(),
    challenger_character_id = character_id,
    opponent_character_id = opponent_character_id,
    winner_character_id = winner_cid,
    loser_character_id = loser_cid,
    challenger_rating_before = cr_before,
    challenger_rating_after = cr_after,
    opponent_rating_before = or_before,
    opponent_rating_after = or_after,
    challenger_rating_change = applied_challenger,
    opponent_rating_change = applied_opponent,
    combat_replay_id = body.request_id,
    created_at = iso_now(),
    metadata = {
      gap_band = delta_info.gap_band,
      zero_reward_reason = delta_info.zero_reward_reason,
      policy_version = delta_info.policy_version,
    },
  }
  storage.write_one(user_id, HISTORY_COLLECTION, battle_id, history, nil, 1, 0)
  storage.write_one(opp_user, HISTORY_COLLECTION, battle_id, history, nil, 1, 0)

  local result = {
    battle_id = battle_id,
    request_id = body.request_id,
    winner = combat_result.winner,
    winner_character_id = winner_cid,
    combat_log = combat_result.combat_log,
    combat = {
      rounds = combat_result.rounds,
      truncated = combat_result.truncated,
      initiative_first_side = combat_result.initiative_first_side,
      seed = combat_result.seed,
      player = combat_result.player,
      opponent = combat_result.opponent,
    },
    rating = {
      challenger = {
        rating_before = cr_before,
        rating_change = applied_challenger,
        rating_after = cr_after,
        gap_band = delta_info.gap_band,
        zero_reward_reason = delta_info.zero_reward_reason,
      },
      opponent = {
        rating_before = or_before,
        rating_change = applied_opponent,
        rating_after = or_after,
      },
    },
    arena = public_state(challenger_state),
    replay = false,
  }

  tx.status = "completed"
  tx.result = result
  write_tx(user_id, body.request_id, tx, nil)

  logging.info("arena", "arena_challenge", {
    user_id = user_id,
    character_id = character_id,
    opponent_character_id = opponent_character_id,
    winner = combat_result.winner,
    rating_change = applied_challenger,
    ok = true,
  })

  return responses.ok(result)
end

local function rpc_arena_get_history(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("arena_enabled", context) then
    return encode_fail("Arena is disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true, limit = true, cursor = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, false)
  if resolve_err ~= nil then
    return encode_fail(resolve_err, 403)
  end
  ensure_state(user_id, character_id, nil)

  local page_size = cfg_int("history_page_size", 10)
  local limit = tonumber(body.limit) or page_size
  if limit < 1 then
    limit = 1
  end
  if limit > page_size then
    limit = page_size
  end

  local objects, cursor = nk.storage_list(user_id, HISTORY_COLLECTION, 100, "")
  local rows = {}
  if objects ~= nil then
    for i = 1, #objects do
      local v = objects[i].value
      if type(v) == "table"
        and (v.challenger_character_id == character_id or v.opponent_character_id == character_id)
      then
        table.insert(rows, v)
      end
    end
  end
  table.sort(rows, function(a, b)
    return tostring(a.created_at or "") > tostring(b.created_at or "")
  end)
  local offset = tonumber(body.cursor) or 0
  if offset < 0 then
    offset = 0
  end
  local page = validation.empty_array()
  local end_i = math.min(offset + limit, #rows)
  for i = offset + 1, end_i do
    table.insert(page, rows[i])
  end
  local next_cursor = ""
  if end_i < #rows then
    next_cursor = tostring(end_i)
  end
  return responses.ok({
    history = page,
    next_cursor = next_cursor,
    count = #page,
  })
end

nk.register_rpc(rpc_arena_get_state, "arena_get_state")
nk.register_rpc(rpc_arena_get_opponents, "arena_get_opponents")
nk.register_rpc(rpc_arena_refresh_opponents, "arena_refresh_opponents")
nk.register_rpc(rpc_arena_get_rankings, "arena_get_rankings")
nk.register_rpc(rpc_arena_challenge, "arena_challenge")
nk.register_rpc(rpc_arena_get_history, "arena_get_history")
nk.logger_info("Phase 18 arena RPCs registered")

return {
  STATE_COLLECTION = STATE_COLLECTION,
  INDEX_COLLECTION = INDEX_COLLECTION,
  TX_COLLECTION = TX_COLLECTION,
  HISTORY_COLLECTION = HISTORY_COLLECTION,
}
