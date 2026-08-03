-- Trusted Nakama -> Node Character wallet bridge. No RPCs are registered here.
local nk = require("nakama")

local M = {}

local function config(context)
  local env = context and context.env
  if type(env) ~= "table" then
    return nil, nil, "Wallet bridge environment unavailable"
  end
  local base = tostring(env.LOOT_NODE_INTERNAL_URL or ""):gsub("/+$", "")
  local secret = tostring(env.LOOT_WALLET_BRIDGE_SECRET or "")
  if base == "" or secret == "" then
    return nil, nil, "Wallet bridge is not configured"
  end
  if not string.match(base, "^https?://") then
    return nil, nil, "Wallet bridge URL is invalid"
  end
  return base, secret, nil
end

function M.apply(context, request)
  if type(request) ~= "table" then
    return nil, "Wallet bridge request required", 500
  end
  local base, secret, cfg_err = config(context)
  if cfg_err ~= nil then
    return nil, cfg_err, 503
  end
  local payload = {
    nakama_user_id = context.user_id,
    character_id = request.character_id,
    operation_type = request.operation_type,
    operation_key = request.operation_key,
    reference_id = request.reference_id,
    amount = request.amount,
  }
  local ok, status, _, response_body = pcall(
    nk.http_request,
    base .. "/internal/wallet/apply",
    "post",
    {
      ["Content-Type"] = "application/json",
      ["X-Loot-Wallet-Bridge-Secret"] = secret,
    },
    nk.json_encode(payload),
    5000,
    false
  )
  if not ok then
    return nil, "Wallet bridge unavailable", 503
  end
  local decoded = nil
  if type(response_body) == "string" and response_body ~= "" then
    local decoded_ok, value = pcall(nk.json_decode, response_body)
    if decoded_ok then decoded = value end
  end
  if tonumber(status) < 200 or tonumber(status) >= 300 then
    local message = type(decoded) == "table" and decoded.error or "Wallet operation failed"
    return nil, tostring(message), tonumber(status) or 502
  end
  if type(decoded) ~= "table" or decoded.success ~= true or type(decoded.wallet) ~= "table" then
    return nil, "Invalid wallet bridge response", 502
  end
  return decoded, nil, 200
end

return M
