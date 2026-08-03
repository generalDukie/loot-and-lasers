--[[
  Phase 12 — Central reward service (Nakama Lua).
  Internal orchestrator for trusted backend modules.

  PUBLIC: optional gated RPC only
    - dev_reward_test (LOOT_DEV_REWARD_TEST=1; fixed allowlist; soft currency only)

  NOT registered (security):
    - reward_grant, grant_reward, reward_apply, reward_debug, reward_claim_any

  Supported today:
    - currency (soft: stardust) via wallet.credit_currency
    - item (server-generated instances only) via inventory grant API (grant_item_instance)

  Rejected safely (future):
    - premium_currency / nova_crystals via this service
    - bare item grants without instance_id (client-authored)
    - xp (no ProgressionService yet)
    - entitlement / cosmetic / title

  No gameplay callers (missions/arena/etc.) wired yet.
  LootService (Phase 13) is an authorized internal caller for item grants.
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
local wallet = require("wallet")
local reward_tables = require("data.reward_tables")

local TX_COLLECTION = "reward_transactions"
local REWARD_VERSION = 1
local DEV_ENV_FLAG = "LOOT_DEV_REWARD_TEST"
local MAX_REWARDS = 16
local MAX_REASON = 128
local MAX_SOURCE = 64
local MAX_META_KEYS = 16

local SUPPORTED_CURRENCY = {
  stardust = true,
}

local ALLOWED_SOURCE_TYPES = {
  dev_test = true,
  system = true,
  loot = true,
  loot_dev = true,
  -- Future trusted callers (documented; not wired yet):
  -- mission = true, arena = true, shipment = true, daily_login = true,
  -- event = true, achievement = true, mail = true, admin = true, purchase = true,
}

local STATUS = {
  pending = "pending",
  applying = "applying",
  completed = "completed",
  failed = "failed",
  compensation_required = "compensation_required",
}

local function now_iso()
  return time.iso_utc()
end

local function fingerprint_bundle(user_id, character_id, source_type, source_id, rewards)
  -- Deterministic compare string (not cryptographic).
  local parts = {
    tostring(user_id or ""),
    tostring(character_id or ""),
    tostring(source_type or ""),
    tostring(source_id or ""),
  }
  if type(rewards) == "table" then
    for i = 1, #rewards do
      local r = rewards[i]
      if type(r) == "table" then
        table.insert(parts, string.format(
          "%s|%s|%s|%s|%s",
          tostring(r.type or ""),
          tostring(r.currency_id or r.item_id or ""),
          tostring(r.amount or r.quantity or ""),
          tostring(r.instance_id or ""),
          tostring(i)
        ))
      end
    end
  end
  return table.concat(parts, ";")
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

local function empty_applied()
  return validation.empty_array()
end

--- Validate a single reward entry. Returns cleaned entry or nil, err.
local function validate_reward_entry(entry, index)
  if type(entry) ~= "table" then
    return nil, "Reward entry " .. tostring(index) .. " must be an object"
  end
  local rtype = entry.type
  if type(rtype) ~= "string" or rtype == "" then
    return nil, "Reward entry " .. tostring(index) .. " missing type"
  end

  if rtype == "currency" then
    local currency_id = entry.currency_id
    if type(currency_id) ~= "string" or currency_id == "" then
      return nil, "currency_id is required"
    end
    if currency_id == "nova_crystals" or entry.currency_type == "premium" then
      return nil, "Premium currency rewards are not supported by RewardService in Phase 12"
    end
    if SUPPORTED_CURRENCY[currency_id] ~= true then
      return nil, "Unsupported or unknown currency_id"
    end
    local amount = tonumber(entry.amount)
    if amount == nil or amount ~= math.floor(amount) then
      return nil, "amount must be an integer"
    end
    if amount <= 0 then
      return nil, "amount must be positive"
    end
    if amount > 1000000000 then
      return nil, "amount exceeds hard limit"
    end
    return {
      type = "currency",
      currency_id = currency_id,
      amount = amount,
    }, nil
  end

  if rtype == "premium_currency" then
    return nil, "Premium currency rewards are not supported by RewardService in Phase 12"
  end

  if rtype == "item" or rtype == "consumable" then
    -- Trusted server-generated instances only (LootService). Reject bare item_id grants.
    if type(entry.instance_id) ~= "string" or entry.instance_id == "" then
      return nil, "item rewards require server-generated instance_id"
    end
    if type(entry.item_id) ~= "string" or entry.item_id == "" then
      return nil, "item_id is required"
    end
    local quantity = tonumber(entry.quantity) or 1
    if quantity ~= math.floor(quantity) or quantity < 1 then
      return nil, "quantity must be a positive integer"
    end
    if quantity > 99 then
      return nil, "quantity exceeds hard limit"
    end
    local metadata = entry.metadata
    if metadata == nil then
      metadata = {}
    end
    if type(metadata) ~= "table" then
      return nil, "item metadata must be an object"
    end
    if type(metadata.type) ~= "string" or metadata.type == "" then
      return nil, "item metadata.type is required"
    end
    return {
      type = "item",
      item_id = entry.item_id,
      quantity = quantity,
      instance_id = entry.instance_id,
      metadata = metadata,
      rarity = type(entry.rarity) == "string" and entry.rarity or "",
      item_level = tonumber(entry.item_level) or 1,
    }, nil
  end

  if rtype == "xp" or rtype == "experience" then
    return nil, "XP rewards are not supported until ProgressionService exists"
  end

  if rtype == "entitlement" or rtype == "cosmetic" or rtype == "title" then
    return nil, "Entitlement/cosmetic rewards are not supported yet"
  end

  return nil, "Unknown reward type: " .. rtype
end

function validate_reward_bundle(bundle)
  if type(bundle) ~= "table" then
    return nil, "Reward bundle must be an object"
  end

  local version = tonumber(bundle.reward_version) or REWARD_VERSION
  if version ~= REWARD_VERSION then
    return nil, "Unsupported reward_version"
  end

  local tid_err = transactions.validate_transaction_id(bundle.transaction_id)
  if tid_err ~= nil then
    return nil, tid_err
  end

  if type(bundle.user_id) ~= "string" or bundle.user_id == "" then
    return nil, "user_id is required"
  end

  local character_id = bundle.character_id
  if character_id == nil then
    character_id = ""
  end
  if type(character_id) ~= "string" then
    return nil, "character_id must be a string"
  end
  if #character_id > 64 then
    return nil, "character_id is too long"
  end

  local source_type = bundle.source_type
  if type(source_type) ~= "string" or source_type == "" then
    return nil, "source_type is required"
  end
  if #source_type > MAX_SOURCE then
    return nil, "source_type is too long"
  end
  if ALLOWED_SOURCE_TYPES[source_type] ~= true then
    return nil, "source_type is not an authorized reward source"
  end

  local source_id = bundle.source_id
  if type(source_id) ~= "string" or source_id == "" then
    return nil, "source_id is required"
  end
  if #source_id > 128 then
    return nil, "source_id is too long"
  end

  local reason_err = transactions.validate_reason(bundle.reason)
  if reason_err ~= nil then
    return nil, reason_err
  end

  if type(bundle.rewards) ~= "table" then
    return nil, "rewards must be an array"
  end
  local count = #bundle.rewards
  if count < 1 then
    return nil, "rewards must contain at least one entry"
  end
  if count > MAX_REWARDS then
    return nil, "too many rewards in bundle"
  end

  local cleaned = validation.empty_array()
  for i = 1, count do
    local entry, err = validate_reward_entry(bundle.rewards[i], i)
    if err ~= nil then
      return nil, err
    end
    table.insert(cleaned, entry)
  end

  local metadata = bundle.metadata
  if metadata == nil then
    metadata = {}
  end
  if type(metadata) ~= "table" then
    return nil, "metadata must be an object"
  end
  local meta_count = 0
  for _ in pairs(metadata) do
    meta_count = meta_count + 1
    if meta_count > MAX_META_KEYS then
      return nil, "metadata has too many keys"
    end
  end

  local fp = fingerprint_bundle(bundle.user_id, character_id, source_type, source_id, cleaned)
  return {
    reward_version = REWARD_VERSION,
    source_type = source_type,
    source_id = source_id,
    user_id = bundle.user_id,
    character_id = character_id,
    transaction_id = bundle.transaction_id,
    reason = bundle.reason,
    rewards = cleaned,
    metadata = metadata,
    reward_hash = fp,
  }, nil
end

function build_reward_result(success, transaction_id, status, applied, errors)
  return {
    success = success == true,
    transaction_id = transaction_id or "",
    status = status or STATUS.failed,
    applied = applied or empty_applied(),
    errors = errors or validation.empty_array(),
  }
end

function get_reward_transaction(user_id, transaction_id)
  if type(user_id) ~= "string" or user_id == "" then
    return nil, "user_id is required"
  end
  local tid_err = transactions.validate_transaction_id(transaction_id)
  if tid_err ~= nil then
    return nil, tid_err
  end
  local tx = read_tx(user_id, transaction_id)
  if tx == nil then
    return nil, "Reward transaction not found"
  end
  return tx, nil
end

function record_reward_transaction(user_id, record, version)
  if type(record) ~= "table" or type(record.transaction_id) ~= "string" then
    return nil, "Invalid reward transaction record"
  end
  local _, err = write_tx(user_id, record.transaction_id, record, version)
  if err ~= nil then
    return nil, err
  end
  return record, nil
end

--- Soft-currency credit via existing wallet internals.
function apply_currency_reward(user_id, currency_id, amount, step_transaction_id, reason, source)
  if SUPPORTED_CURRENCY[currency_id] ~= true then
    return nil, "Unsupported currency_id"
  end
  local data, err, code = wallet.credit_currency(
    user_id,
    currency_id,
    amount,
    step_transaction_id,
    reason,
    source or "reward_service"
  )
  if err ~= nil then
    return nil, err, code or 400
  end
  local balance_after = nil
  if type(data) == "table" and type(data.transaction) == "table" then
    balance_after = data.transaction.balance_after
  end
  return {
    type = "currency",
    currency_id = currency_id,
    amount = amount,
    balance_after = balance_after,
  }, nil, 200
end

--- Item grant via inventory.grant_item_instance (trusted pre-generated instances only).
function apply_item_reward(user_id, character_id, entry, _step_transaction_id)
  if type(character_id) ~= "string" or character_id == "" then
    return nil, "character_id is required for item rewards", 400
  end
  local inventory = require("inventory")
  local data, err, code = inventory.grant_item_instance(user_id, character_id, {
    instance_id = entry.instance_id,
    item_id = entry.item_id,
    quantity = entry.quantity,
    metadata = entry.metadata,
  })
  if err ~= nil then
    return nil, err, code or 400
  end
  return {
    type = "item",
    instance_id = entry.instance_id,
    item_id = entry.item_id,
    quantity = entry.quantity,
    already_present = data and data.already_present == true,
  }, nil, 200
end

--- Extension point — not implemented (no ProgressionService).
function apply_xp_reward(_user_id, _character_id, _entry, _step_transaction_id)
  return nil, "XP rewards are not supported until ProgressionService exists", 501
end

--- Extension point — not implemented.
function apply_entitlement_reward(_user_id, _character_id, _entry, _step_transaction_id)
  return nil, "Entitlement rewards are not supported yet", 501
end

local function result_from_tx(tx)
  return build_reward_result(
    tx.status == STATUS.completed,
    tx.transaction_id,
    tx.status,
    tx.applied_rewards or empty_applied(),
    tx.errors or validation.empty_array()
  )
end

--- Apply a validated reward bundle. Trusted callers only.
--- user_id in the bundle must be the authenticated/server recipient — never from Godot payload.
function apply_reward_bundle(bundle)
  local cleaned, verr = validate_reward_bundle(bundle)
  if verr ~= nil then
    return build_reward_result(false, bundle and bundle.transaction_id or "", STATUS.failed, empty_applied(), { verr }), verr
  end

  local user_id = cleaned.user_id
  local transaction_id = cleaned.transaction_id

  local existing, version = read_tx(user_id, transaction_id)
  if existing ~= nil then
    if existing.reward_hash ~= cleaned.reward_hash
      or existing.user_id ~= cleaned.user_id
      or tostring(existing.character_id or "") ~= cleaned.character_id
      or existing.source_type ~= cleaned.source_type
      or existing.source_id ~= cleaned.source_id
    then
      return build_reward_result(false, transaction_id, STATUS.failed, empty_applied(), {
        "Conflicting reuse of transaction_id",
      }), "Conflicting reuse of transaction_id"
    end
    -- Idempotent replay
    return result_from_tx(existing), nil
  end

  local now = now_iso()
  local record = {
    transaction_id = transaction_id,
    status = STATUS.pending,
    user_id = user_id,
    character_id = cleaned.character_id,
    source_type = cleaned.source_type,
    source_id = cleaned.source_id,
    reward_hash = cleaned.reward_hash,
    reason = cleaned.reason,
    requested_rewards = cleaned.rewards,
    applied_rewards = empty_applied(),
    failed_reward = nil,
    errors = validation.empty_array(),
    created_at = now,
    updated_at = now,
  }

  local _, werr = write_tx(user_id, transaction_id, record, nil)
  if werr ~= nil then
    -- Race: another writer may have created it
    existing = read_tx(user_id, transaction_id)
    if existing ~= nil then
      if existing.reward_hash ~= cleaned.reward_hash then
        return build_reward_result(false, transaction_id, STATUS.failed, empty_applied(), {
          "Conflicting reuse of transaction_id",
        }), "Conflicting reuse of transaction_id"
      end
      return result_from_tx(existing), nil
    end
    return build_reward_result(false, transaction_id, STATUS.failed, empty_applied(), { tostring(werr) }), tostring(werr)
  end

  record.status = STATUS.applying
  record.updated_at = now_iso()
  write_tx(user_id, transaction_id, record, nil)

  -- Deterministic order: apply currency then item steps.
  for i = 1, #cleaned.rewards do
    local entry = cleaned.rewards[i]
    local step_tid = string.format("%s:step:%d", transaction_id, i)
    local applied_entry, aerr

    if entry.type == "currency" then
      applied_entry, aerr = apply_currency_reward(
        user_id,
        entry.currency_id,
        entry.amount,
        step_tid,
        cleaned.reason,
        "reward_service:" .. cleaned.source_type
      )
    elseif entry.type == "item" then
      applied_entry, aerr = apply_item_reward(
        user_id,
        cleaned.character_id,
        entry,
        step_tid
      )
    else
      aerr = "Unsupported reward type during apply"
    end

    if aerr ~= nil then
      record.status = STATUS.failed
      if #record.applied_rewards > 0 then
        record.status = STATUS.compensation_required
      end
      record.failed_reward = entry
      table.insert(record.errors, aerr)
      record.updated_at = now_iso()
      write_tx(user_id, transaction_id, record, nil)
      logging.error("rewards", "apply_reward_bundle", {
        user_id = user_id,
        request_id = transaction_id,
        error = aerr,
        code = responses.CODES.INTERNAL_ERROR,
      })
      return result_from_tx(record), aerr
    end

    table.insert(record.applied_rewards, applied_entry)
    record.updated_at = now_iso()
    write_tx(user_id, transaction_id, record, nil)
  end

  record.status = STATUS.completed
  record.failed_reward = nil
  record.updated_at = now_iso()
  write_tx(user_id, transaction_id, record, nil)

  logging.info("rewards", "apply_reward_bundle", {
    user_id = user_id,
    request_id = transaction_id,
    ok = true,
    code = responses.CODES.OK,
  })
  return result_from_tx(record), nil
end

local function dev_rewards_enabled(context)
  local env = context and context.env
  if type(env) ~= "table" then
    return false
  end
  return env[DEV_ENV_FLAG] == "1"
end

-- TEMPORARY DEV RPC — fixed allowlist only; soft currency; no premium; remove before production.
local function rpc_dev_reward_test(context, payload)
  if not dev_rewards_enabled(context) then
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
  local unknown = validation.reject_unknown_keys(body, {
    test_reward_id = true,
    transaction_id = true,
    character_id = true,
  })
  if unknown ~= nil then
    return responses.fail(unknown, responses.CODES.INVALID_PAYLOAD)
  end

  local test_id, terr = validation.require_string(body.test_reward_id, "test_reward_id", 64)
  if terr ~= nil then
    return responses.fail(terr, responses.CODES.INVALID_PAYLOAD)
  end

  local template = reward_tables.get_dev_test(test_id)
  if template == nil then
    return responses.fail("Unknown or forbidden test_reward_id", responses.CODES.FORBIDDEN)
  end

  -- Reject any attempt to smuggle premium via allowlist mistakes.
  for i = 1, #template.rewards do
    local r = template.rewards[i]
    if r.type ~= "currency" or r.currency_id ~= "stardust" then
      return responses.fail("Development test rewards may only grant soft currency", responses.CODES.FORBIDDEN)
    end
  end

  local transaction_id = body.transaction_id
  if transaction_id == nil or transaction_id == "" then
    transaction_id = "dev-reward-" .. ids.request_id()
  end
  local tid_err = transactions.validate_transaction_id(transaction_id)
  if tid_err ~= nil then
    return responses.fail(tid_err, responses.CODES.INVALID_PAYLOAD)
  end

  local character_id = ""
  if body.character_id ~= nil and body.character_id ~= "" then
    local cid, cerr = auth.resolve_character_id(user_id, body.character_id, false)
    if cerr ~= nil then
      return responses.fail_status(cerr, 403)
    end
    character_id = cid
  end

  local bundle = {
    reward_version = REWARD_VERSION,
    source_type = template.source_type,
    source_id = template.source_id,
    user_id = user_id, -- always authenticated session user
    character_id = character_id,
    transaction_id = transaction_id,
    reason = template.reason,
    rewards = template.rewards,
    metadata = template.metadata or {},
  }

  local result, err = apply_reward_bundle(bundle)
  if err ~= nil and result.success ~= true then
    return responses.fail(err, responses.CODES.UNPROCESSABLE)
  end
  return responses.ok(result)
end

nk.register_rpc(rpc_dev_reward_test, "dev_reward_test")
-- reward_grant / grant_reward / reward_apply intentionally NOT registered.

nk.logger_info("Phase 12 reward service: internal apply_reward_bundle; gated dev_reward_test; no public grant RPC")

return {
  validate_reward_bundle = validate_reward_bundle,
  apply_reward_bundle = apply_reward_bundle,
  apply_currency_reward = apply_currency_reward,
  apply_item_reward = apply_item_reward,
  apply_xp_reward = apply_xp_reward,
  apply_entitlement_reward = apply_entitlement_reward,
  build_reward_result = build_reward_result,
  record_reward_transaction = record_reward_transaction,
  get_reward_transaction = get_reward_transaction,
  STATUS = STATUS,
  TX_COLLECTION = TX_COLLECTION,
  SUPPORTED_CURRENCY = SUPPORTED_CURRENCY,
  DEV_ENV_FLAG = DEV_ENV_FLAG,
}
