--[[
  Phase 17 — Server-authoritative combat engine (Nakama Lua).

  Public RPC: combat_simulate

  Godot submits intent only (character, opponent source, request_id).
  Server loads equipment, derives stats, runs deterministic simulation,
  returns structured combat log + winner. No rewards / Arena / PvE modes.
]]

local nk = require("nakama")
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local storage = require("lib.storage")
local time = require("lib.time")
local logging = require("lib.logging")
local transactions = require("lib.transactions")
local rng_lib = require("lib.rng")
local formulas = require("lib.combat_formulas")
local remote_config = require("config")

local EQ_COLLECTION = "equipment"
local TX_COLLECTION = "combat_transactions"
local COMBAT_VERSION = 1
local MAX_ROUNDS = 200
local ENGINE_ID = "combat_v1"

-- Server-only opponent sources. Client may pick an id; never submit stats/HP.
local OPPONENT_SOURCES = {
  training_dummy = {
    id = "training_dummy",
    display_name = "Training Dummy",
    class = "Vanguard",
    level = 1,
    -- nil stats → class base only
  },
  training_equal = {
    id = "training_equal",
    display_name = "Equal Sparring Bot",
    class = "Vanguard",
    level = 1,
  },
  training_crit = {
    id = "training_crit",
    display_name = "Crit Sparring Bot",
    class = "Shadow Operative",
    level = 40,
    stats = { strength = 20, agility = 90, intellect = 20, vitality = 50, luck = 220 },
  },
  training_dodge = {
    id = "training_dodge",
    display_name = "Dodge Sparring Bot",
    class = "Void Runner",
    level = 40,
    stats = { strength = 18, agility = 220, intellect = 18, vitality = 55, luck = 40 },
  },
  training_tank = {
    id = "training_tank",
    display_name = "Tank Sparring Bot",
    class = "Technomancer",
    level = 40,
    stats = { strength = 120, agility = 30, intellect = 40, vitality = 200, luck = 20 },
  },
  training_glass = {
    id = "training_glass",
    display_name = "Glass Sparring Bot",
    class = "Vanguard",
    level = 10,
    stats = { strength = 80, agility = 20, intellect = 10, vitality = 8, luck = 30 },
  },
  training_healer = {
    id = "training_healer",
    display_name = "Regen Sparring Bot",
    class = "Cosmic Engineer",
    level = 20,
    stats = { strength = 20, agility = 30, intellect = 60, vitality = 80, luck = 25 },
    heal_per_round = 12,
  },
}

local ALLOWED_PAYLOAD = {
  character_id = true,
  opponent_source = true,
  request_id = true,
  class = true,
  level = true,
}

-- Client must never influence outcomes via these keys.
local FORBIDDEN_PAYLOAD = {
  damage = true,
  hit = true,
  hit_chance = true,
  crit = true,
  crits = true,
  dodge = true,
  rng = true,
  seed = true,
  random = true,
  stats = true,
  hp = true,
  max_hp = true,
  buffs = true,
  debuffs = true,
  cooldowns = true,
  events = true,
  log = true,
  combat_log = true,
  winner = true,
  equipment = true,
  armor = true,
  weapon_damage = true,
  initiative = true,
  barrier = true,
  shield = true,
  primary = true,
  opponent_stats = true,
  player_stats = true,
  fighter = true,
  fighters = true,
}

local function feature_on(flag_id, context)
  local flag = remote_config.get_feature_flag(flag_id, context)
  if flag == nil then
    return true
  end
  return flag.enabled == true
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

local function read_equipment_slots(user_id, character_id)
  local value, _, found = storage.read_one(user_id, EQ_COLLECTION, character_id)
  if not found or type(value) ~= "table" or type(value.slots) ~= "table" then
    return {}
  end
  local pieces = {}
  for _, piece in pairs(value.slots) do
    if type(piece) == "table" and type(piece.instance_id) == "string" then
      table.insert(pieces, piece)
    end
  end
  return pieces
end

local function equipment_fingerprint(pieces)
  local parts = {}
  for i = 1, #pieces do
    local p = pieces[i]
    local meta = p.metadata
    if type(meta) ~= "table" then
      meta = {}
    end
    local stats = meta.stats
    local stat_bits = ""
    if type(stats) == "table" then
      for _, k in ipairs(formulas.ATTR_KEYS) do
        stat_bits = stat_bits .. k .. "=" .. tostring(stats[k] or 0) .. ";"
      end
    end
    table.insert(parts, tostring(p.instance_id) .. ":" .. tostring(p.item_id or "") .. ":" .. stat_bits)
  end
  table.sort(parts)
  return table.concat(parts, "|")
end

local function clamp_level(raw)
  local n = tonumber(raw)
  if n == nil then
    return 1
  end
  n = math.floor(n)
  if n < 1 then
    return 1
  end
  if n > 100 then
    return 100
  end
  return n
end

local function resolve_class(raw)
  if type(raw) == "string" and formulas.is_known_class(raw) then
    return raw
  end
  return "Vanguard"
end

local function build_fighter_from_totals(opts)
  local class_name = opts.class
  local level = opts.level
  local totals = opts.totals
  local side = opts.side
  local name = opts.display_name
  local heal_per_round = tonumber(opts.heal_per_round) or 0

  local primary_key = formulas.CLASS_PRIMARY[class_name] or "strength"
  local primary_value = tonumber(totals[primary_key]) or 0
  local archetype = formulas.get_damage_archetype(class_name)
  local damage_type = formulas.get_damage_type(class_name)
  local max_hp = formulas.get_max_hp(totals.vitality)
  local armor = formulas.get_armor_percent(class_name, level, totals.strength)
  local tech = formulas.get_tech_resist_percent(class_name, level, totals.intellect)

  return {
    side = side,
    name = name,
    class = class_name,
    level = level,
    totals = {
      strength = totals.strength,
      agility = totals.agility,
      intellect = totals.intellect,
      vitality = totals.vitality,
      luck = totals.luck,
    },
    primary_key = primary_key,
    primary_value = primary_value,
    archetype = archetype,
    damage_type = damage_type,
    max_hp = max_hp,
    hp = max_hp,
    barrier = 0,
    crit = formulas.get_crit_chance(level, totals.luck),
    dodge = formulas.get_dodge_chance(level, totals.agility),
    armor_percent = armor,
    tech_resist_percent = tech,
    heal_per_round = heal_per_round,
    buffs = validation.empty_array(),
    debuffs = validation.empty_array(),
  }
end

local function build_player_fighter(user_id, character_id, class_name, level, side, display_name)
  local pieces = read_equipment_slots(user_id, character_id)
  local totals = formulas.build_totals(class_name, pieces)
  local fighter = build_fighter_from_totals({
    class = class_name,
    level = level,
    totals = totals,
    side = side or "player",
    display_name = display_name or "Player",
    heal_per_round = 0,
  })
  return fighter, pieces, equipment_fingerprint(pieces)
end

--- INTERNAL — build a combatant from authoritative equipment (Arena / future modes).
local function build_character_combatant(user_id, character_id, opts)
  opts = opts or {}
  local class_name = resolve_class(opts.class)
  local level = clamp_level(opts.level)
  local side = opts.side or "player"
  local name = opts.display_name or (side == "opponent" and "Opponent" or "Player")
  return build_player_fighter(user_id, character_id, class_name, level, side, name)
end

local function build_opponent_fighter(template, mirror_class, mirror_level)
  local class_name = template.class or "Vanguard"
  local level = clamp_level(template.level or 1)
  -- Optional mirror: training_equal uses challenger class/level for fair spar.
  if template.id == "training_equal" then
    class_name = mirror_class or class_name
    level = mirror_level or level
  end

  local totals
  if type(template.stats) == "table" then
    totals = formulas.empty_stats()
    for _, k in ipairs(formulas.ATTR_KEYS) do
      totals[k] = math.max(0, math.floor(tonumber(template.stats[k]) or 0))
    end
  else
    totals = formulas.class_base(class_name)
  end

  return build_fighter_from_totals({
    class = class_name,
    level = level,
    totals = totals,
    side = "opponent",
    display_name = template.display_name or template.id or "Opponent",
    heal_per_round = template.heal_per_round or 0,
  })
end

local function snapshot_fighter(f)
  return {
    side = f.side,
    name = f.name,
    class = f.class,
    level = f.level,
    totals = f.totals,
    max_hp = f.max_hp,
    hp = f.hp,
    barrier = f.barrier,
    crit_chance = f.crit,
    dodge_chance = f.dodge,
    armor_percent = f.armor_percent,
    tech_resist_percent = f.tech_resist_percent,
    primary_key = f.primary_key,
    primary_value = f.primary_value,
    archetype = f.archetype,
    damage_type = f.damage_type,
    heal_per_round = f.heal_per_round,
  }
end

local function append_log(log, entry)
  table.insert(log, entry)
end

local function apply_heal(fighter, amount, log, round, reason)
  if amount <= 0 or fighter.hp <= 0 then
    return
  end
  local before = fighter.hp
  fighter.hp = math.min(fighter.max_hp, fighter.hp + amount)
  local healed = fighter.hp - before
  if healed > 0 then
    append_log(log, {
      round = round,
      type = "heal",
      side = fighter.side,
      amount = healed,
      hp = fighter.hp,
      max_hp = fighter.max_hp,
      text = string.format("%s heals %d (%s). HP: %d/%d", fighter.name, healed, reason, fighter.hp, fighter.max_hp),
    })
  end
end

local function resolve_attack(attacker, defender, rng, log, round)
  append_log(log, {
    round = round,
    type = "attack_start",
    attacker = attacker.side,
    defender = defender.side,
    text = string.format("%s attacks %s.", attacker.name, defender.name),
  })

  -- Dodge check (no separate hit-chance stat in SoT formulas).
  if rng.unit() < defender.dodge then
    append_log(log, {
      round = round,
      type = "dodge",
      attacker = attacker.side,
      defender = defender.side,
      damage = 0,
      crit = false,
      dodged = true,
      hp = defender.hp,
      text = string.format("%s dodges.", defender.name),
    })
    return
  end

  append_log(log, {
    round = round,
    type = "hit",
    attacker = attacker.side,
    defender = defender.side,
    text = "Hit.",
  })

  local raw = formulas.roll_basic_attack_damage(attacker.archetype, attacker.primary_value, rng)
  local crit = rng.unit() < attacker.crit
  if crit then
    raw = raw * formulas.CRIT_MULT
    append_log(log, {
      round = round,
      type = "crit",
      attacker = attacker.side,
      text = "Critical.",
    })
  end

  local mit = formulas.mitigation_for_damage_type(
    attacker.damage_type,
    defender.armor_percent,
    defender.tech_resist_percent
  )
  raw = raw * (1.0 - mit)
  local final_dmg = math.max(0, math.floor(raw + 0.5))

  local barrier_absorbed = 0
  if defender.barrier > 0 and final_dmg > 0 then
    barrier_absorbed = math.min(defender.barrier, final_dmg)
    defender.barrier = defender.barrier - barrier_absorbed
    final_dmg = final_dmg - barrier_absorbed
  end

  defender.hp = math.max(0, defender.hp - final_dmg)

  append_log(log, {
    round = round,
    type = "damage",
    attacker = attacker.side,
    defender = defender.side,
    damage = final_dmg,
    barrier_absorbed = barrier_absorbed,
    shield_hit = barrier_absorbed > 0,
    crit = crit,
    dodged = false,
    mitigation = mit,
    hp = defender.hp,
    max_hp = defender.max_hp,
    text = string.format(
      "%d damage.%s %s HP: %d/%d",
      final_dmg,
      crit and " Critical." or "",
      defender.name,
      defender.hp,
      defender.max_hp
    ),
  })
end

--- Core simulator — reusable by future Arena / missions / raids.
local function simulate_combat(player, opponent, seed_str)
  local rng = rng_lib.make(seed_str)
  local log = validation.empty_array()

  append_log(log, {
    round = 0,
    type = "combat_start",
    engine = ENGINE_ID,
    text = string.format("Combat start: %s vs %s", player.name, opponent.name),
  })

  local player_first = rng.unit() < 0.5
  local attacker = player_first and player or opponent
  local defender = player_first and opponent or player
  local initiative = attacker.side

  append_log(log, {
    round = 0,
    type = "initiative",
    first_side = initiative,
    text = string.format("Initiative: %s acts first.", attacker.name),
  })

  local round = 0
  local truncated = false

  while player.hp > 0 and opponent.hp > 0 and round < MAX_ROUNDS do
    round = round + 1

    resolve_attack(attacker, defender, rng, log, round)

    if player.hp <= 0 or opponent.hp <= 0 then
      break
    end

    -- End-of-round regen (buff/heal hook for future systems).
    apply_heal(attacker, attacker.heal_per_round, log, round, "regen")
    apply_heal(defender, defender.heal_per_round, log, round, "regen")

    if player.hp <= 0 or opponent.hp <= 0 then
      break
    end

    local tmp = attacker
    attacker = defender
    defender = tmp
  end

  if player.hp > 0 and opponent.hp > 0 then
    truncated = true
    append_log(log, {
      round = round,
      type = "timeout",
      text = string.format("Max rounds (%d) reached — resolving by remaining HP.", MAX_ROUNDS),
    })
  end

  local winner
  if player.hp <= 0 and opponent.hp <= 0 then
    -- Simultaneous lethal: challenger wins (draw prevention).
    winner = "player"
    append_log(log, {
      round = round,
      type = "draw_break",
      text = "Simultaneous KO — challenger awarded win.",
    })
  elseif player.hp <= 0 then
    winner = "opponent"
  elseif opponent.hp <= 0 then
    winner = "player"
  else
    -- Timeout: higher HP wins; tie → player.
    if player.hp > opponent.hp then
      winner = "player"
    elseif opponent.hp > player.hp then
      winner = "opponent"
    else
      winner = "player"
      append_log(log, {
        round = round,
        type = "draw_break",
        text = "HP tie after timeout — challenger awarded win.",
      })
    end
  end

  append_log(log, {
    round = round,
    type = "combat_end",
    winner = winner,
    truncated = truncated,
    text = string.format("Winner: %s", winner),
  })

  return {
    engine = ENGINE_ID,
    combat_version = COMBAT_VERSION,
    winner = winner,
    truncated = truncated,
    rounds = round,
    initiative_first_side = initiative,
    max_rounds = MAX_ROUNDS,
    player = snapshot_fighter(player),
    opponent = snapshot_fighter(opponent),
    combat_log = log,
    seed = seed_str,
  }
end

local function build_seed(user_id, character_id, opponent_id, request_id, eq_fp, class_name, level)
  return table.concat({
    "combat",
    tostring(user_id),
    tostring(character_id),
    tostring(opponent_id),
    tostring(request_id),
    tostring(eq_fp),
    tostring(class_name),
    tostring(level),
  }, "|")
end

local function public_result(result, meta)
  return {
    engine = result.engine,
    combat_version = result.combat_version,
    request_id = meta.request_id,
    character_id = meta.character_id,
    opponent_source = meta.opponent_source,
    winner = result.winner,
    truncated = result.truncated,
    rounds = result.rounds,
    initiative_first_side = result.initiative_first_side,
    max_rounds = result.max_rounds,
    player = result.player,
    opponent = result.opponent,
    combat_log = result.combat_log,
    -- seed echoed so clients can request deterministic replay verification;
    -- clients must never supply seed as input authority.
    seed = result.seed,
    created_at = meta.created_at,
    replay = meta.replay == true,
  }
end

local function run_simulate(user_id, character_id, opponent_source, request_id, class_name, level)
  local template = OPPONENT_SOURCES[opponent_source]
  if template == nil then
    return nil, "Unknown opponent_source", 400
  end

  local player, _pieces, eq_fp = build_player_fighter(user_id, character_id, class_name, level)
  local opponent = build_opponent_fighter(template, class_name, level)
  local seed = build_seed(user_id, character_id, opponent_source, request_id, eq_fp, class_name, level)

  -- Mutate copies — build_fighter already returns fresh tables.
  local result = simulate_combat(player, opponent, seed)
  return result, nil, nil, eq_fp
end

local function rpc_combat_simulate(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end

  if not feature_on("combat_simulate_enabled", context) then
    return encode_fail("Combat simulation is disabled", 403)
  end

  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end

  local forbid_id = validation.reject_client_identity_fields(body)
  if forbid_id ~= nil then
    return encode_fail(forbid_id, 400)
  end

  for key, _ in pairs(body) do
    if FORBIDDEN_PAYLOAD[key] then
      return encode_fail("Client may not submit combat outcome field: " .. tostring(key), 400)
    end
  end

  local unknown = validation.reject_unknown_keys(body, ALLOWED_PAYLOAD)
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end

  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end

  local opponent_source, oerr = validation.require_string(body.opponent_source, "opponent_source", 64)
  if oerr ~= nil then
    return encode_fail(oerr, 400)
  end
  if OPPONENT_SOURCES[opponent_source] == nil then
    return encode_fail("opponent_source is not a legal server template", 400)
  end

  local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, false)
  if resolve_err ~= nil then
    return encode_fail(resolve_err, 403)
  end

  local class_name = resolve_class(body.class)
  local level = clamp_level(body.level)

  local existing = read_tx(user_id, body.request_id)
  if existing ~= nil then
    if existing.type ~= "combat_simulate"
      or existing.character_id ~= character_id
      or existing.opponent_source ~= opponent_source
      or existing.class ~= class_name
      or existing.level ~= level
    then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing.result) == "table" then
      logging.info("combat", "combat_simulate", {
        user_id = user_id,
        character_id = character_id,
        request_id = body.request_id,
        replay = true,
        ok = true,
      })
      return responses.ok(public_result(existing.result, {
        request_id = body.request_id,
        character_id = character_id,
        opponent_source = opponent_source,
        created_at = existing.created_at,
        replay = true,
      }))
    end
  end

  local result, err, status, eq_fp = run_simulate(
    user_id, character_id, opponent_source, body.request_id, class_name, level
  )
  if err ~= nil then
    logging.info("combat", "combat_simulate", {
      user_id = user_id,
      character_id = character_id,
      error = err,
      ok = false,
    })
    return encode_fail(err, status or 400)
  end

  local created_at = time.iso_utc()
  local record = {
    type = "combat_simulate",
    combat_version = COMBAT_VERSION,
    request_id = body.request_id,
    character_id = character_id,
    opponent_source = opponent_source,
    class = class_name,
    level = level,
    equipment_fingerprint = eq_fp,
    result = result,
    created_at = created_at,
    status = "completed",
  }

  local _, werr = write_tx(user_id, body.request_id, record, nil)
  if werr ~= nil then
    local again = read_tx(user_id, body.request_id)
    if again ~= nil and type(again.result) == "table" then
      return responses.ok(public_result(again.result, {
        request_id = body.request_id,
        character_id = character_id,
        opponent_source = opponent_source,
        created_at = again.created_at,
        replay = true,
      }))
    end
    logging.error("combat", "combat_simulate", {
      user_id = user_id,
      error = werr,
    })
    return encode_fail("Failed to persist combat result", 500)
  end

  logging.info("combat", "combat_simulate", {
    user_id = user_id,
    character_id = character_id,
    request_id = body.request_id,
    winner = result.winner,
    rounds = result.rounds,
    ok = true,
  })

  return responses.ok(public_result(result, {
    request_id = body.request_id,
    character_id = character_id,
    opponent_source = opponent_source,
    created_at = created_at,
    replay = false,
  }))
end

nk.register_rpc(rpc_combat_simulate, "combat_simulate")
nk.logger_info("Phase 17 combat RPC registered (combat_simulate)")

return {
  simulate_combat = simulate_combat,
  build_character_combatant = build_character_combatant,
  OPPONENT_SOURCES = OPPONENT_SOURCES,
  TX_COLLECTION = TX_COLLECTION,
  MAX_ROUNDS = MAX_ROUNDS,
  ENGINE_ID = ENGINE_ID,
}
