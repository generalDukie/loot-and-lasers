--[[
  Phase 5 — Authoritative wallet / currency service (Nakama Lua).
  Collection: wallets / key: wallet
  Tx log: wallet_transactions / key: <transaction_id>

  PUBLIC RPC (client-callable):
    - wallet_get

  INTERNAL (trusted server modules only — not registered as public RPCs):
    - credit_currency(user_id, currency_id, amount, transaction_id, reason, source)
    - debit_currency(user_id, currency_id, amount, transaction_id, reason, source)

  Future callers (not implemented here): missions, shops, shipments, arena,
  purchase verification, admin tools, daily rewards, guild systems.

  TEMPORARY DEV RPCs (soft currency only, flag-gated — REMOVE before production):
    - dev_wallet_credit_test
    - dev_wallet_debit_test
    Require runtime env LOOT_DEV_WALLET_MUTATIONS=1

  Currencies:
    - stardust (soft)
    - nova_crystals (premium)
]]

local nk = require("nakama")

local WALLET_COLLECTION = "wallets"
local WALLET_KEY = "wallet"
local TX_COLLECTION = "wallet_transactions"

local MAX_TX_ID_LEN = 64
local MAX_REASON_LEN = 128
local MAX_WRITE_RETRIES = 5

-- TEMPORARY — development mutation gate. Do not enable in production.
local DEV_ENV_FLAG = "LOOT_DEV_WALLET_MUTATIONS"

local CURRENCIES = {
  stardust = {
    currency_id = "stardust",
    display_name = "Stardust",
    currency_type = "soft",
    minimum_balance = 0,
    maximum_balance = 1000000000000, -- 1e12
    client_visible = true,
    enabled = true,
  },
  nova_crystals = {
    currency_id = "nova_crystals",
    display_name = "Nova Crystals",
    currency_type = "premium",
    minimum_balance = 0,
    maximum_balance = 100000000, -- 1e8
    client_visible = true,
    enabled = true,
  },
}

local function now_ms()
  return os.time() * 1000
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

local function get_currency(currency_id)
  if type(currency_id) ~= "string" or currency_id == "" then
    return nil, "currency_id is required"
  end
  local def = CURRENCIES[currency_id]
  if def == nil or not def.enabled then
    return nil, "Unknown or disabled currency"
  end
  return def, nil
end

local function empty_balances()
  local balances = {}
  for id, def in pairs(CURRENCIES) do
    balances[id] = def.minimum_balance
  end
  return balances
end

local function normalize_wallet(raw)
  local wallet = {
    wallet_version = 1,
    balances = empty_balances(),
    updated_at = now_ms(),
    last_transaction_id = "",
  }
  if type(raw) ~= "table" then
    return wallet
  end
  if type(raw.wallet_version) == "number" then
    wallet.wallet_version = math.floor(raw.wallet_version)
  end
  if type(raw.balances) == "table" then
    for id, def in pairs(CURRENCIES) do
      local v = raw.balances[id]
      if type(v) == "number" and v == v and v == math.floor(v) then
        if v < def.minimum_balance then
          v = def.minimum_balance
        end
        if v > def.maximum_balance then
          v = def.maximum_balance
        end
        wallet.balances[id] = v
      end
    end
  end
  if type(raw.updated_at) == "number" then
    wallet.updated_at = math.floor(raw.updated_at)
  end
  if type(raw.last_transaction_id) == "string" then
    wallet.last_transaction_id = raw.last_transaction_id
  end
  return wallet
end

local function read_wallet_object(user_id)
  local objects = nk.storage_read({
    {
      collection = WALLET_COLLECTION,
      key = WALLET_KEY,
      user_id = user_id,
    },
  })
  if #objects == 0 then
    return nil, nil
  end
  return normalize_wallet(objects[1].value), objects[1].version
end

local function ensure_wallet(user_id)
  local wallet, version = read_wallet_object(user_id)
  if wallet ~= nil then
    return wallet, version
  end
  wallet = normalize_wallet(nil)
  local ack = nk.storage_write({
    {
      collection = WALLET_COLLECTION,
      key = WALLET_KEY,
      user_id = user_id,
      value = wallet,
      permission_read = 1,
      permission_write = 0,
    },
  })
  local new_version = nil
  if type(ack) == "table" and ack[1] ~= nil then
    new_version = ack[1].version
  end
  return wallet, new_version
end

local function write_wallet(user_id, wallet, version)
  local object = {
    collection = WALLET_COLLECTION,
    key = WALLET_KEY,
    user_id = user_id,
    value = wallet,
    permission_read = 1,
    permission_write = 0,
  }
  if version ~= nil and version ~= "" then
    object.version = version
  end
  return nk.storage_write({ object })
end

local function tx_exists(user_id, transaction_id)
  local objects = nk.storage_read({
    {
      collection = TX_COLLECTION,
      key = transaction_id,
      user_id = user_id,
    },
  })
  return #objects > 0
end

local function write_transaction(user_id, tx)
  nk.storage_write({
    {
      collection = TX_COLLECTION,
      key = tx.transaction_id,
      user_id = user_id,
      value = tx,
      permission_read = 1,
      permission_write = 0,
    },
  })
end

local function validate_transaction_id(transaction_id)
  if type(transaction_id) ~= "string" or transaction_id == "" then
    return "transaction_id is required"
  end
  if #transaction_id > MAX_TX_ID_LEN then
    return "transaction_id is too long"
  end
  if not string.match(transaction_id, "^[%w%-%._:]+$") then
    return "transaction_id has invalid characters"
  end
  return nil
end

local function validate_amount(amount)
  if type(amount) ~= "number" or amount ~= amount then
    return "amount must be a number"
  end
  if amount ~= math.floor(amount) then
    return "amount must be an integer"
  end
  if amount <= 0 then
    return "amount must be positive"
  end
  if amount > 1000000000000 then
    return "amount exceeds hard limit"
  end
  return nil
end

local function public_wallet(wallet)
  local balances = {}
  for id, def in pairs(CURRENCIES) do
    if def.client_visible then
      balances[id] = wallet.balances[id] or def.minimum_balance
    end
  end
  return {
    wallet_version = wallet.wallet_version,
    balances = balances,
    updated_at = wallet.updated_at,
    last_transaction_id = wallet.last_transaction_id or "",
  }
end

-- Core mutation. user_id MUST come from a trusted server caller (never Godot payload).
local function apply_delta(user_id, currency_id, amount, transaction_id, reason, source, is_credit)
  if type(user_id) ~= "string" or user_id == "" then
    return nil, "user_id is required", 400
  end

  local def, cerr = get_currency(currency_id)
  if cerr ~= nil then
    return nil, cerr, 400
  end

  local tid_err = validate_transaction_id(transaction_id)
  if tid_err ~= nil then
    return nil, tid_err, 400
  end

  local amt = tonumber(amount)
  if amt == nil then
    return nil, "amount must be a number", 400
  end
  local amt_err = validate_amount(amt)
  if amt_err ~= nil then
    return nil, amt_err, 400
  end

  if type(reason) ~= "string" or reason == "" then
    return nil, "reason is required", 400
  end
  if #reason > MAX_REASON_LEN then
    return nil, "reason is too long", 400
  end
  if type(source) ~= "string" or source == "" then
    source = "server"
  end
  if #source > 64 then
    return nil, "source is too long", 400
  end

  if tx_exists(user_id, transaction_id) then
    return nil, "Duplicate transaction_id", 409
  end

  local last_err = "Failed to update wallet"
  for _ = 1, MAX_WRITE_RETRIES do
    local wallet, version = ensure_wallet(user_id)
    if tx_exists(user_id, transaction_id) then
      return nil, "Duplicate transaction_id", 409
    end

    local current = wallet.balances[currency_id] or def.minimum_balance
    local next_bal
    if is_credit then
      next_bal = current + amt
    else
      next_bal = current - amt
    end

    if next_bal < def.minimum_balance then
      return nil, "Insufficient balance", 400
    end
    if next_bal > def.maximum_balance then
      return nil, "Balance exceeds maximum", 400
    end

    wallet.balances[currency_id] = next_bal
    wallet.updated_at = now_ms()
    wallet.last_transaction_id = transaction_id

    local tx = {
      transaction_id = transaction_id,
      timestamp = wallet.updated_at,
      reason = reason,
      currency = currency_id,
      amount = is_credit and amt or -amt,
      balance_after = next_bal,
      source = source,
    }

    local ok, err = pcall(function()
      write_wallet(user_id, wallet, version)
      write_transaction(user_id, tx)
    end)
    if ok then
      return {
        wallet = public_wallet(wallet),
        transaction = tx,
      }, nil, 200
    end
    last_err = tostring(err)
  end
  return nil, last_err, 409
end

--[[
  INTERNAL API — call from trusted Nakama modules only.
  Other modules: local wallet = require("wallet")
  Never trust user_id / balances / results from a Godot payload.
]]
local function credit_currency(user_id, currency_id, amount, transaction_id, reason, source)
  return apply_delta(user_id, currency_id, amount, transaction_id, reason, source, true)
end

local function debit_currency(user_id, currency_id, amount, transaction_id, reason, source)
  return apply_delta(user_id, currency_id, amount, transaction_id, reason, source, false)
end

local function rpc_wallet_get(context, payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  if body.user_id ~= nil or body.account_id ~= nil or body.owner_id ~= nil then
    return encode_fail("Unknown or forbidden field", 400)
  end

  local ok, result = pcall(function()
    local wallet = ensure_wallet(user_id)
    return public_wallet(wallet)
  end)
  if not ok then
    nk.logger_error(string.format("wallet_get failed: %s", tostring(result)))
    return encode_fail("Failed to load wallet", 500)
  end
  return encode_ok(result)
end

local function dev_mutations_enabled(context)
  local env = context.env
  if type(env) ~= "table" then
    return false
  end
  return env[DEV_ENV_FLAG] == "1"
end

-- TEMPORARY DEV RPC — soft currency only. Remove before production.
local function rpc_dev_wallet_credit_test(context, payload)
  if not dev_mutations_enabled(context) then
    return encode_fail("RPC not found", 404)
  end
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  if body.user_id ~= nil or body.account_id ~= nil or body.owner_id ~= nil then
    return encode_fail("Unknown or forbidden field", 400)
  end
  if body.currency_id ~= "stardust" then
    return encode_fail("Dev credit test allows soft currency only", 403)
  end

  local data, err, code = credit_currency(
    user_id,
    body.currency_id,
    body.amount,
    body.transaction_id,
    body.reason,
    "dev_wallet_credit_test"
  )
  if err ~= nil then
    return encode_fail(err, code or 400)
  end
  return encode_ok(data)
end

-- TEMPORARY DEV RPC — soft currency only. Remove before production.
local function rpc_dev_wallet_debit_test(context, payload)
  if not dev_mutations_enabled(context) then
    return encode_fail("RPC not found", 404)
  end
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  if body.user_id ~= nil or body.account_id ~= nil or body.owner_id ~= nil then
    return encode_fail("Unknown or forbidden field", 400)
  end
  if body.currency_id ~= "stardust" then
    return encode_fail("Dev debit test allows soft currency only", 403)
  end

  local data, err, code = debit_currency(
    user_id,
    body.currency_id,
    body.amount,
    body.transaction_id,
    body.reason,
    "dev_wallet_debit_test"
  )
  if err ~= nil then
    return encode_fail(err, code or 400)
  end
  return encode_ok(data)
end

-- TEMPORARY — exercises internal credit_currency / debit_currency on the session user.
local function rpc_dev_wallet_internal_selftest(context, payload)
  if not dev_mutations_enabled(context) then
    return encode_fail("RPC not found", 404)
  end
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  -- Ignore client payload for mutation targets; use session user only.
  local _ = decode_payload(payload)

  local report = {
    credit_ok = false,
    debit_ok = false,
    duplicate_rejected = false,
    insufficient_rejected = false,
    tx_logged = false,
    errors = {},
  }

  local stamp = tostring(now_ms())
  local tid_credit = "selftest-credit-" .. stamp
  local tid_debit = "selftest-debit-" .. stamp

  local credit_data, credit_err = credit_currency(
    user_id, "stardust", 50, tid_credit, "internal selftest credit", "wallet_selftest"
  )
  if credit_err ~= nil then
    table.insert(report.errors, "credit: " .. tostring(credit_err))
  else
    report.credit_ok = true
    report.tx_logged = credit_data ~= nil and credit_data.transaction ~= nil
  end

  local _, dup_err = credit_currency(
    user_id, "stardust", 50, tid_credit, "internal selftest duplicate", "wallet_selftest"
  )
  if dup_err == "Duplicate transaction_id" then
    report.duplicate_rejected = true
  else
    table.insert(report.errors, "duplicate: expected Duplicate transaction_id, got " .. tostring(dup_err))
  end

  local debit_data, debit_err = debit_currency(
    user_id, "stardust", 10, tid_debit, "internal selftest debit", "wallet_selftest"
  )
  if debit_err ~= nil then
    table.insert(report.errors, "debit: " .. tostring(debit_err))
  else
    report.debit_ok = true
    if debit_data ~= nil and debit_data.transaction ~= nil then
      report.tx_logged = true
    end
  end

  local huge_tid = "selftest-insuff-" .. stamp
  local _, insuff_err = debit_currency(
    user_id, "stardust", 1000000000000, huge_tid, "internal selftest insuff", "wallet_selftest"
  )
  if insuff_err == "Insufficient balance" then
    report.insufficient_rejected = true
  else
    table.insert(report.errors, "insufficient: expected Insufficient balance, got " .. tostring(insuff_err))
  end

  report.passed = report.credit_ok
    and report.debit_ok
    and report.duplicate_rejected
    and report.insufficient_rejected
    and report.tx_logged
    and #report.errors == 0

  if report.passed then
    return encode_ok(report)
  end
  return nk.json_encode({
    success = false,
    data = report,
    error = "Internal wallet selftest failed",
    status_code = 500,
  })
end

nk.register_rpc(rpc_wallet_get, "wallet_get")
-- wallet_credit / wallet_debit intentionally NOT registered (security).

-- TEMPORARY DEV RPCs — gated by LOOT_DEV_WALLET_MUTATIONS=1; soft currency only.
nk.register_rpc(rpc_dev_wallet_credit_test, "dev_wallet_credit_test")
nk.register_rpc(rpc_dev_wallet_debit_test, "dev_wallet_debit_test")
nk.register_rpc(rpc_dev_wallet_internal_selftest, "dev_wallet_internal_selftest")

nk.logger_info("Phase 5 wallet: public RPC wallet_get; mutations internal-only; gated dev test RPCs registered")

return {
  credit_currency = credit_currency,
  debit_currency = debit_currency,
  ensure_wallet = ensure_wallet,
  public_wallet = public_wallet,
  CURRENCIES = CURRENCIES,
}
