--[[
  Phase 13 — Server-authoritative loot generation (Nakama Lua).

  INTERNAL API only for trusted modules.
  PUBLIC: gated RPC
    - dev_loot_test (LOOT_DEV_LOOT_TEST=1; fixed table allowlist)

  NOT registered:
    - loot_generate, roll_loot, grant_random_item, generate_item, loot_debug, loot_from_table

  Flow: generate item instance → RewardService.apply_reward_bundle → inventory.grant_item_instance
  No gameplay callers (missions/arena/etc.) wired in this phase.
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
local rewards = require("rewards")
local loot_tables = require("data.loot_tables")
local item_definitions = require("data.item_definitions")

local TX_COLLECTION = "loot_transactions"
local DEV_ENV_FLAG = "LOOT_DEV_LOOT_TEST"
local LOOT_TX_VERSION = 1
local INSTANCE_VERSION = 1

local STATUS = {
  pending = "pending",
  generated = "generated",
  granting = "granting",
  completed = "completed",
  failed = "failed",
  inventory_full = "inventory_full",
}

local ALLOWED_SOURCE_TYPES = {
  loot_dev = true,
  system = true,
  mission = true,
  -- Future: arena, shipment, event, shop, daily_login, admin
}

--- Deterministic FNV-1a style hash (gameplay RNG — not cryptographic).
local function hash_string(s)
  local h = 2166136261
  for i = 1, #s do
    h = (h * 16777619 + string.byte(s, i)) % 4294967296
  end
  return h
end

--- LCG RNG. Documented as non-cryptographic; suitable for anti-duplication + deterministic replay.
local function make_rng(seed_str)
  local state = hash_string(seed_str)
  return function(n)
    state = (state * 1664525 + 1013904223) % 4294967296
    if type(n) ~= "number" or n <= 0 then
      return 0
    end
    return state % math.floor(n)
  end
end

local function read_tx(user_id, transaction_id)
  local value, version, found = storage.read_one(user_id, TX_COLLECTION, transaction_id)
  if not found then
    return nil, nil
  end
  return value, version
end

local function write_tx(user_id, transaction_id, record, version)
  return storage.write_one(user_id, TX_COLLECTION, transaction_id, record, version, 1, 0)
end

function hash_loot_request(user_id, character_id, source_type, source_id, loot_table_id)
  return table.concat({
    tostring(user_id or ""),
    tostring(character_id or ""),
    tostring(source_type or ""),
    tostring(source_id or ""),
    tostring(loot_table_id or ""),
  }, "|")
end

function validate_loot_table(table_doc)
  if type(table_doc) ~= "table" then
    return nil, "Loot table must be an object"
  end
  if table_doc.enabled ~= true then
    return nil, "Loot table is disabled"
  end
  if type(table_doc.loot_table_id) ~= "string" or table_doc.loot_table_id == "" then
    return nil, "loot_table_id is required"
  end
  local rolls = tonumber(table_doc.rolls) or 1
  if rolls ~= math.floor(rolls) or rolls < 1 or rolls > 8 then
    return nil, "rolls must be an integer from 1 to 8"
  end
  if type(table_doc.entries) ~= "table" or #table_doc.entries < 1 then
    return nil, "loot table entries required"
  end
  local total = 0
  for i = 1, #table_doc.entries do
    local e = table_doc.entries[i]
    if type(e) ~= "table" then
      return nil, "Malformed loot entry"
    end
    local w = tonumber(e.weight)
    if w == nil or w ~= math.floor(w) or w < 0 then
      return nil, "Negative or invalid weight"
    end
    if w > 0 then
      total = total + w
    end
    if e.type ~= "item_pool" then
      return nil, "Unsupported loot entry type"
    end
    if type(e.item_pool_id) ~= "string" or e.item_pool_id == "" then
      return nil, "item_pool_id required"
    end
    if type(e.rarity_weights) ~= "table" then
      return nil, "rarity_weights required"
    end
    local rw_total = 0
    for rarity, rw in pairs(e.rarity_weights) do
      if not item_definitions.is_rarity(rarity) then
        return nil, "Invalid rarity in weights: " .. tostring(rarity)
      end
      local n = tonumber(rw)
      if n == nil or n ~= math.floor(n) or n < 0 then
        return nil, "Invalid rarity weight"
      end
      rw_total = rw_total + n
    end
    if w > 0 and rw_total <= 0 then
      return nil, "Zero-total rarity weights"
    end
  end
  if total <= 0 then
    return nil, "Zero-total loot table weights"
  end
  return table_doc, nil
end

function get_loot_table(loot_table_id)
  local doc = loot_tables.get_table(loot_table_id)
  if doc == nil then
    return nil, "Unknown loot table"
  end
  return validate_loot_table(doc)
end

function select_weighted_entry(entries, rng)
  local total = 0
  local ordered = {}
  for i = 1, #entries do
    local e = entries[i]
    local w = tonumber(e.weight) or 0
    if w > 0 then
      table.insert(ordered, { entry = e, weight = w, index = i })
      total = total + w
    end
  end
  if total <= 0 then
    return nil, "Zero-total weights"
  end
  local pick = rng(total)
  local cursor = 0
  for i = 1, #ordered do
    cursor = cursor + ordered[i].weight
    if pick < cursor then
      return ordered[i].entry, nil
    end
  end
  return ordered[#ordered].entry, nil
end

local function select_weighted_key(weights, rng)
  local total = 0
  local keys = {}
  for k, w in pairs(weights) do
    local n = tonumber(w) or 0
    if n > 0 then
      table.insert(keys, k)
      total = total + n
    end
  end
  table.sort(keys)
  if total <= 0 then
    return nil, "Zero-total weights"
  end
  local pick = rng(total)
  local cursor = 0
  for i = 1, #keys do
    cursor = cursor + (tonumber(weights[keys[i]]) or 0)
    if pick < cursor then
      return keys[i], nil
    end
  end
  return keys[#keys], nil
end

function resolve_rarity(rarity_weights, rng)
  return select_weighted_key(rarity_weights, rng)
end

function resolve_item_level(pool, rng)
  local min_l = tonumber(pool.minimum_level) or 1
  local max_l = tonumber(pool.maximum_level) or min_l
  if max_l < min_l then
    max_l = min_l
  end
  local span = math.floor(max_l - min_l + 1)
  return min_l + rng(span)
end

--- Affix extension point — project has no affix DB; returns empty array.
function roll_affixes(_def, _rarity, _rng)
  return validation.empty_array()
end

function validate_generated_item(inst)
  if type(inst) ~= "table" then
    return nil, "Generated item must be an object"
  end
  if type(inst.instance_id) ~= "string" or inst.instance_id == "" then
    return nil, "instance_id missing"
  end
  if type(inst.item_id) ~= "string" or inst.item_id == "" then
    return nil, "item_id missing"
  end
  local def = item_definitions.get(inst.item_id)
  if def == nil or def.enabled ~= true then
    return nil, "Invalid or disabled item definition"
  end
  if not item_definitions.is_rarity(inst.rarity) then
    return nil, "Invalid rarity"
  end
  if def.allowed_rarities ~= nil and def.allowed_rarities[inst.rarity] ~= true then
    return nil, "Rarity not allowed for item"
  end
  if type(inst.quantity) ~= "number" or inst.quantity < 1 then
    return nil, "Invalid quantity"
  end
  return inst, nil
end

function generate_item_instance(ctx)
  local def = item_definitions.get(ctx.item_id)
  if def == nil or def.enabled ~= true then
    return nil, "Invalid item definition"
  end
  local rarity = ctx.rarity
  if def.allowed_rarities ~= nil and def.allowed_rarities[rarity] ~= true then
    return nil, "Rarity not allowed for item"
  end
  local affixes = roll_affixes(def, rarity, ctx.rng)
  local instance_id = "loot-" .. ids.uuid()
  local inst = {
    instance_version = INSTANCE_VERSION,
    instance_id = instance_id,
    item_id = def.item_id,
    owner_user_id = ctx.user_id,
    owner_character_id = ctx.character_id,
    quantity = ctx.quantity or 1,
    rarity = rarity,
    item_level = ctx.item_level or 1,
    rolled_affixes = affixes,
    source_type = ctx.source_type,
    source_id = ctx.source_id,
    loot_transaction_id = ctx.transaction_id,
    generated_at = time.iso_utc(),
    metadata = {
      type = def.type,
      rarity = rarity,
      name = def.display_name,
      level_requirement = ctx.item_level or 1,
      stats = {},
      rolled_affixes = affixes,
    },
  }
  return validate_generated_item(inst)
end

local function validate_pool(pool)
  if type(pool) ~= "table" or pool.enabled ~= true then
    return nil, "Item pool disabled or missing"
  end
  if type(pool.item_ids) ~= "table" or #pool.item_ids < 1 then
    return nil, "Empty item pool"
  end
  for i = 1, #pool.item_ids do
    local id = pool.item_ids[i]
    local def = item_definitions.get(id)
    if def == nil or def.enabled ~= true then
      return nil, "Pool references invalid item: " .. tostring(id)
    end
  end
  return pool, nil
end

function generate_loot_bundle(request)
  if type(request) ~= "table" then
    return nil, "Loot request must be an object"
  end
  local tid_err = transactions.validate_transaction_id(request.transaction_id)
  if tid_err ~= nil then
    return nil, tid_err
  end
  if type(request.user_id) ~= "string" or request.user_id == "" then
    return nil, "user_id is required"
  end
  if type(request.character_id) ~= "string" or request.character_id == "" then
    return nil, "character_id is required"
  end
  if type(request.source_type) ~= "string" or ALLOWED_SOURCE_TYPES[request.source_type] ~= true then
    return nil, "source_type is not authorized"
  end
  if type(request.source_id) ~= "string" or request.source_id == "" then
    return nil, "source_id is required"
  end
  if type(request.loot_table_id) ~= "string" or request.loot_table_id == "" then
    return nil, "loot_table_id is required"
  end

  -- Never trust client seed/rarity/item_id if present — ignore them.
  local user_id = request.user_id
  local transaction_id = request.transaction_id
  local request_hash = hash_loot_request(
    user_id, request.character_id, request.source_type, request.source_id, request.loot_table_id
  )

  local existing = read_tx(user_id, transaction_id)
  if existing ~= nil then
    if existing.request_hash ~= request_hash
      or existing.user_id ~= user_id
      or existing.character_id ~= request.character_id
      or existing.source_type ~= request.source_type
      or existing.source_id ~= request.source_id
      or existing.loot_table_id ~= request.loot_table_id
    then
      return nil, "Conflicting reuse of transaction_id"
    end
    return existing, nil
  end

  local table_doc, terr = get_loot_table(request.loot_table_id)
  if terr ~= nil then
    return nil, terr
  end

  local seed = table.concat({
    "loot",
    transaction_id,
    request.source_type,
    request.source_id,
    user_id,
    request.character_id,
  }, ":")
  -- Server-only salt constant (not a secret credential; not returned to clients).
  seed = seed .. ":v1"

  local generated = validation.empty_array()
  local rolls = math.floor(tonumber(table_doc.rolls) or 1)
  for roll_index = 1, rolls do
    local rng = make_rng(seed .. ":roll:" .. tostring(roll_index))
    local entry, eerr = select_weighted_entry(table_doc.entries, rng)
    if eerr ~= nil then
      return nil, eerr
    end
    local pool = loot_tables.get_pool(entry.item_pool_id)
    local pok, perr = validate_pool(pool)
    if perr ~= nil then
      return nil, perr
    end
    pool = pok

    local rarity, rerr = resolve_rarity(entry.rarity_weights, rng)
    if rerr ~= nil then
      return nil, rerr
    end

    local qmin = tonumber(entry.quantity_min) or 1
    local qmax = tonumber(entry.quantity_max) or qmin
    if qmax < qmin then
      qmax = qmin
    end
    local quantity = qmin + rng(math.floor(qmax - qmin + 1))

    local item_index = rng(#pool.item_ids) + 1
    local item_id = pool.item_ids[item_index]
    local item_level = resolve_item_level(pool, rng)

    local inst, ierr = generate_item_instance({
      item_id = item_id,
      rarity = rarity,
      quantity = quantity,
      item_level = item_level,
      user_id = user_id,
      character_id = request.character_id,
      source_type = request.source_type,
      source_id = request.source_id,
      transaction_id = transaction_id,
      rng = rng,
    })
    if ierr ~= nil then
      return nil, ierr
    end
    table.insert(generated, inst)
  end

  local now = time.iso_utc()
  local record = {
    loot_transaction_version = LOOT_TX_VERSION,
    transaction_id = transaction_id,
    status = STATUS.generated,
    user_id = user_id,
    character_id = request.character_id,
    source_type = request.source_type,
    source_id = request.source_id,
    loot_table_id = request.loot_table_id,
    request_hash = request_hash,
    generated_items = generated,
    reward_transaction_id = "",
    created_at = now,
    updated_at = now,
  }
  local _, werr = write_tx(user_id, transaction_id, record, nil)
  if werr ~= nil then
    local again = read_tx(user_id, transaction_id)
    if again ~= nil then
      if again.request_hash ~= request_hash then
        return nil, "Conflicting reuse of transaction_id"
      end
      return again, nil
    end
    return nil, tostring(werr)
  end
  return record, nil
end

--- Generate loot then grant via RewardService (inventory append).
function create_loot_receipt_and_grant(request)
  local record, err = generate_loot_bundle(request)
  if err ~= nil then
    return nil, err
  end

  if record.status == STATUS.completed then
    return record, nil
  end
  if record.status == STATUS.inventory_full then
    return record, "Inventory full"
  end

  -- Idempotent grant: use loot transaction_id as reward transaction_id.
  local reward_tid = record.transaction_id
  if type(record.reward_transaction_id) == "string" and record.reward_transaction_id ~= "" then
    reward_tid = record.reward_transaction_id
  end

  local reward_entries = validation.empty_array()
  for i = 1, #record.generated_items do
    local inst = record.generated_items[i]
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

  record.status = STATUS.granting
  record.reward_transaction_id = reward_tid
  record.updated_at = time.iso_utc()
  write_tx(request.user_id, record.transaction_id, record, nil)

  local bundle = {
    reward_version = 1,
    source_type = "loot",
    source_id = request.loot_table_id,
    user_id = request.user_id,
    character_id = request.character_id,
    transaction_id = reward_tid,
    reason = "Loot grant from table " .. request.loot_table_id,
    rewards = reward_entries,
    metadata = { loot_transaction_id = record.transaction_id },
  }

  local result, rerr = rewards.apply_reward_bundle(bundle)
  if rerr ~= nil or result.success ~= true then
    local msg = rerr or "Reward grant failed"
    if string.find(tostring(msg), "Inventory full", 1, true) then
      record.status = STATUS.inventory_full
    else
      record.status = STATUS.failed
    end
    record.updated_at = time.iso_utc()
    write_tx(request.user_id, record.transaction_id, record, nil)
    return record, msg
  end

  record.status = STATUS.completed
  record.updated_at = time.iso_utc()
  write_tx(request.user_id, record.transaction_id, record, nil)
  return record, nil
end

local function env_blocks_dev(context)
  local env = context and context.env
  if type(env) ~= "table" then
    return false
  end
  local e = tostring(env["LOOT_ENVIRONMENT"] or "")
  return e == "production" or e == "staging"
end

local function dev_loot_enabled(context)
  if env_blocks_dev(context) then
    return false
  end
  local env = context and context.env
  if type(env) ~= "table" then
    return false
  end
  return env[DEV_ENV_FLAG] == "1"
end

local function rpc_dev_loot_test(context, payload)
  if not dev_loot_enabled(context) then
    return responses.fail_status("RPC not found", 404)
  end
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end

  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return responses.fail(forbid, responses.CODES.INVALID_PAYLOAD)
  end
  -- Reject authoritative client fields.
  local unknown = validation.reject_unknown_keys(body, {
    test_table_id = true,
    transaction_id = true,
    character_id = true,
  })
  if unknown ~= nil then
    return responses.fail(unknown, responses.CODES.INVALID_PAYLOAD)
  end
  if body.item_id ~= nil or body.rarity ~= nil or body.seed ~= nil or body.affixes ~= nil or body.item_level ~= nil then
    return responses.fail("Client must not supply loot outcome fields", responses.CODES.INVALID_PAYLOAD)
  end

  local table_id, terr = validation.require_string(body.test_table_id, "test_table_id", 64)
  if terr ~= nil then
    return responses.fail(terr, responses.CODES.INVALID_PAYLOAD)
  end
  if loot_tables.DEV_TEST_TABLE_IDS[table_id] ~= true then
    return responses.fail("Unknown or forbidden test_table_id", responses.CODES.FORBIDDEN)
  end

  local character_id, cerr = auth.resolve_character_id(user_id, body.character_id, false)
  if cerr ~= nil then
    return responses.fail_status(cerr, 403)
  end

  local transaction_id = body.transaction_id
  if transaction_id == nil or transaction_id == "" then
    transaction_id = "dev-loot-" .. ids.request_id()
  end
  local tid_err = transactions.validate_transaction_id(transaction_id)
  if tid_err ~= nil then
    return responses.fail(tid_err, responses.CODES.INVALID_PAYLOAD)
  end

  local record, err = create_loot_receipt_and_grant({
    user_id = user_id,
    character_id = character_id,
    source_type = "loot_dev",
    source_id = table_id,
    loot_table_id = table_id,
    transaction_id = transaction_id,
  })
  if err ~= nil then
    if record ~= nil and record.status == STATUS.inventory_full then
      return responses.fail("Inventory full", responses.CODES.CONFLICT)
    end
    return responses.fail(err, responses.CODES.UNPROCESSABLE)
  end

  -- Strip any seed material; return generated items + status only.
  return responses.ok({
    transaction_id = record.transaction_id,
    status = record.status,
    loot_table_id = record.loot_table_id,
    generated_items = record.generated_items,
    reward_transaction_id = record.reward_transaction_id,
  })
end

nk.register_rpc(rpc_dev_loot_test, "dev_loot_test")
-- loot_generate / roll_loot intentionally NOT registered.

nk.logger_info("Phase 13 loot: internal generate + RewardService grant; gated dev_loot_test; no public loot RPC")

return {
  get_loot_table = get_loot_table,
  validate_loot_table = validate_loot_table,
  select_weighted_entry = select_weighted_entry,
  generate_loot_bundle = generate_loot_bundle,
  generate_item_instance = generate_item_instance,
  resolve_item_level = resolve_item_level,
  resolve_rarity = resolve_rarity,
  roll_affixes = roll_affixes,
  validate_generated_item = validate_generated_item,
  create_loot_receipt_and_grant = create_loot_receipt_and_grant,
  hash_loot_request = hash_loot_request,
  STATUS = STATUS,
  DEV_ENV_FLAG = DEV_ENV_FLAG,
  TX_COLLECTION = TX_COLLECTION,
}
