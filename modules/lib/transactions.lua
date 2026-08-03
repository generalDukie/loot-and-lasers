--[[
  Shared transaction / idempotency helpers.
  Wallet mutation logic remains in wallet.lua — these helpers only validate IDs/metadata.
  Consistency note: separate storage writes are not fully atomic; callers use OCC retries.
]]

local M = {}

local MAX_TX_ID_LEN = 64
local MAX_REASON_LEN = 128
local MAX_SOURCE_LEN = 64

function M.validate_transaction_id(transaction_id)
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

function M.validate_reason(reason)
  if type(reason) ~= "string" or reason == "" then
    return "reason is required"
  end
  if #reason > MAX_REASON_LEN then
    return "reason is too long"
  end
  return nil
end

function M.normalize_source(source, default_source)
  if type(source) ~= "string" or source == "" then
    return default_source or "server", nil
  end
  if #source > MAX_SOURCE_LEN then
    return nil, "source is too long"
  end
  return source, nil
end

M.MAX_TX_ID_LEN = MAX_TX_ID_LEN
M.MAX_REASON_LEN = MAX_REASON_LEN

return M
