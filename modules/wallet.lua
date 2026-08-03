--[[
  Phase 5 — Authoritative wallet / currency service (Nakama Lua).
  Collection: wallets / key: wallet
  Tx log: wallet_transactions / key: <transaction_id>
  RPCs: wallet_get, wallet_credit, wallet_debit

  Currencies match existing Loot & Lasers IDs only:
    - stardust (soft)
    - nova_crystals (premium)

  Account id is always context.user_id — never trust client.
  Premium credits are rejected on session RPC (client cannot mint premium).
]]

local nk = require("nakama")

local WALLET_COLLECTION = "wallets"
local WALLET_KEY = "wallet"
local TX_COLLECTION = "wallet_transactions"

local MAX_TX_ID_LEN = 64
local MAX_REASON_LEN = 128
local MAX_WRITE_RETRIES = 5

-- Currency registry / allowlist (no invented currencies).
local CURRENCIES = {
  stardust = {
    currency_id = "stardust",
    display_name = "Stardust",
    currency_type = "soft",
    minimum_balance = 0,
    maximum_balance = 1000000000000, -- 1e12
    client_visible = true,
    enabled = true,
    -- Future writers (not implemented this phase):
    -- mission, shop, arena, void dissolve, casino, admin
    client_may_credit = true,
    client_may_debit = true,
  },
  nova_crystals = {
    currency_id = "nova_crystals",
    display_name = "Nova Crystals",
    currency_type = "premium",
    minimum_balance = 0,
    maximum_balance = 100000000, -- 1e8
    client_visible = true,
    enabled = true,
    -- Future writers: purchase verification, weekly quests, admin, promotion
    -- Client must NEVER credit premium.
    client_may_credit = false,
    client_may_debit = true,
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

local function default_balances()
  local balances = {}
  for id, def in pairs(CURRENCIES) do
    balances[id] = def.minimum_balance
  end
  return balances
end

local function default_wallet()
  return {
    wallet_version = 1,
    balances = default_balances(),
    updated_at = now_ms(),
    last_transaction_id = "",
  }
end

local function get_currency(currency_id)
  if type(currency_id) ~= "string" or currency_id == "" then
    return nil, "currency_id is required"
  end
  local def = CURRENCIES[currency_id]
  if def == nil then
    return nil, "Unknown currency_id"
  end
  if not def.enabled then
    return nil, "Currency is disabled"
  end
  return def, nil
end

local function normalize_wallet(value)
  local wallet = default_wallet()
  if type(value) ~= "table" then
    return wallet
  end
  if type(value.balances) == "table" then
    for id, def in pairs(CURRENCIES) do
      local raw = value.balances[id]
      if type(raw) == "number" and raw == raw and raw >= def.minimum_balance then
        local bal = math.floor(raw)
        if bal > def.maximum_balance then
          bal = def.maximum_balance
        end
        wallet.balances[id] = bal
      end
    end
  end
  if type(value.updated_at) == "number" then
    wallet.updated_at = value.updated_at
  end
  if type(value.last_transaction_id) == "string" then
    wallet.last_transaction_id = value.last_transaction_id
  end
  wallet.wallet_version = 1
  return wallet
end

local function read_wallet_object(user_id)
  local objects = nk.storage_read({
    { collection = WALLET_COLLECTION, key = WALLET_KEY, user_id = user_id },
  })
  if objects == nil or #objects == 0 then
    return nil, nil
  end
  return normalize_wallet(objects[1].value), objects[1].version
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
  nk.storage_write({ object })
end

local function ensure_wallet(user_id)
  local wallet, version = read_wallet_object(user_id)
  if wallet ~= nil then
    return wallet, version, false
  end
  wallet = default_wallet()
  write_wallet(user_id, wallet, nil)
  wallet, version = read_wallet_object(user_id)
  if wallet == nil then
    wallet = default_wallet()
  end
  return wallet, version, true
end

local function tx_exists(user_id, transaction_id)
  local objects = nk.storage_read({
    { collection = TX_COLLECTION, key = transaction_id, user_id = user_id },
  })
  return objects ~= nil and #objects > 0
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

local function apply_delta(user_id, currency_id, signed_amount, transaction_id, reason, source, is_credit)
  local def, cerr = get_currency(currency_id)
  if cerr ~= nil then
    return nil, cerr, 400
  end

  if is_credit and not def.client_may_credit then
    return nil, "Client cannot credit this currency", 403
  end
  if (not is_credit) and not def.client_may_debit then
    return nil, "Client cannot debit this currency", 403
  end

  local tid_err = validate_transaction_id(transaction_id)
  if tid_err ~= nil then
    return nil, tid_err, 400
  end

  local amt = math.abs(signed_amount)
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
    source = "client"
  end
  if #source > 64 then
    return nil, "source is too long", 400
  end

  -- Idempotency: duplicate transaction_id is rejected (replay protection).
  if tx_exists(user_id, transaction_id) then
    return nil, "Duplicate transaction_id", 409
  end

  local last_err = "Failed to update wallet"
  for _ = 1, MAX_WRITE_RETRIES do
    local wallet, version = ensure_wallet(user_id)
    -- Re-check tx inside retry loop against races.
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
    -- Version conflict / race → retry
  end
  return nil, last_err, 409
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

local function rpc_wallet_credit(context, payload)
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

  local data, err, code = apply_delta(
    user_id,
    body.currency_id,
    tonumber(body.amount) or 0,
    body.transaction_id,
    body.reason,
    body.source,
    true
  )
  if err ~= nil then
    return encode_fail(err, code or 400)
  end
  return encode_ok(data)
end

local function rpc_wallet_debit(context, payload)
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

  local data, err, code = apply_delta(
    user_id,
    body.currency_id,
    tonumber(body.amount) or 0,
    body.transaction_id,
    body.reason,
    body.source,
    false
  )
  if err ~= nil then
    return encode_fail(err, code or 400)
  end
  return encode_ok(data)
end

nk.register_rpc(rpc_wallet_get, "wallet_get")
nk.register_rpc(rpc_wallet_credit, "wallet_credit")
nk.register_rpc(rpc_wallet_debit, "wallet_debit")
nk.logger_info("Phase 5 wallet RPCs registered (wallet_get, wallet_credit, wallet_debit)")
