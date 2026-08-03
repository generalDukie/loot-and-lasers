--[[
  Shared validation helpers.
  Failures return (nil, message) or for decode: nil on hard failure.
  Do not silently coerce dangerous values.
]]

local nk = require("nakama")

local M = {}

function M.decode_payload(payload)
  if payload == nil or payload == "" then
    return {}
  end
  local ok, decoded = pcall(nk.json_decode, payload)
  if not ok or type(decoded) ~= "table" then
    return nil
  end
  return decoded
end

function M.reject_client_identity_fields(body)
  if type(body) ~= "table" then
    return "Malformed payload"
  end
  if body.account_id ~= nil or body.user_id ~= nil or body.owner_id ~= nil then
    return "Unknown or forbidden field"
  end
  return nil
end

function M.require_string(value, field_name, max_len)
  if type(value) ~= "string" or value == "" then
    return nil, (field_name or "field") .. " is required"
  end
  if max_len ~= nil and #value > max_len then
    return nil, (field_name or "field") .. " is too long"
  end
  return value, nil
end

function M.optional_string(value, field_name, max_len)
  if value == nil then
    return nil, nil
  end
  return M.require_string(value, field_name, max_len)
end

function M.require_integer(value, field_name, min_v, max_v)
  local n = tonumber(value)
  if n == nil or n ~= math.floor(n) then
    return nil, (field_name or "field") .. " must be an integer"
  end
  if min_v ~= nil and n < min_v then
    return nil, (field_name or "field") .. " is too small"
  end
  if max_v ~= nil and n > max_v then
    return nil, (field_name or "field") .. " is too large"
  end
  return n, nil
end

function M.require_positive_amount(value, field_name)
  local n, err = M.require_integer(value, field_name, 1, nil)
  if err ~= nil then
    return nil, err
  end
  return n, nil
end

function M.require_enum(value, field_name, allowed)
  if type(value) ~= "string" or value == "" then
    return nil, (field_name or "field") .. " is required"
  end
  if type(allowed) ~= "table" or allowed[value] ~= true then
    return nil, (field_name or "field") .. " is not allowed"
  end
  return value, nil
end

function M.require_table(value, field_name)
  if type(value) ~= "table" then
    return nil, (field_name or "field") .. " must be an object"
  end
  return value, nil
end

function M.reject_unknown_keys(body, allowed)
  if type(body) ~= "table" then
    return "Malformed payload"
  end
  for k, _ in pairs(body) do
    if allowed[k] ~= true then
      return "Unknown field: " .. tostring(k)
    end
  end
  return nil
end

function M.empty_array()
  return nk.json_decode("[]")
end

return M
