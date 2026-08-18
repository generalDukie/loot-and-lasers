-- Password mutation bridge. Only the Node API may call this with Nakama's HTTP key.
local nk = require("nakama")
local responses = require("lib.responses")

local MIN_PASSWORD_LENGTH = 8
local MAX_PASSWORD_LENGTH = 128

local function password_set(context, payload)
  if context.user_id ~= nil and context.user_id ~= "" then
    return responses.fail_status("Server-to-server only", 403)
  end

  local ok, body = pcall(nk.json_decode, payload or "")
  if not ok or type(body) ~= "table" then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local user_id = tostring(body.user_id or "")
  local email = string.lower(tostring(body.email or ""))
  local password = tostring(body.password or "")
  if user_id == "" or email == "" then
    return responses.fail_status("user_id and email are required", 400)
  end
  if #password < MIN_PASSWORD_LENGTH or #password > MAX_PASSWORD_LENGTH then
    return responses.fail_status(
      string.format("Password must be %d-%d characters", MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH),
      422
    )
  end

  local hashed = nk.bcrypt_hash(password)
  local updated = nk.sql_exec([[
    UPDATE users
    SET password = $1, update_time = now()
    WHERE id = $2::UUID AND lower(email) = lower($3)
  ]], { hashed, user_id, email })
  if updated ~= 1 then
    return responses.fail_status("Nakama account not found", 404)
  end
  return responses.ok({ password_updated = true })
end

nk.register_rpc(password_set, "auth_password_set")
