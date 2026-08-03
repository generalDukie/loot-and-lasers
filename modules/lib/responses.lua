--[[
  Shared response helpers.
  Preserves Godot-compatible fields: success, data, error (string), status_code.
  Adds stable machine-readable `code` without removing status_code.
]]

local nk = require("nakama")

local M = {}

M.CODES = {
  OK = "OK",
  UNAUTHENTICATED = "UNAUTHENTICATED",
  FORBIDDEN = "FORBIDDEN",
  INVALID_PAYLOAD = "INVALID_PAYLOAD",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  RATE_LIMITED = "RATE_LIMITED",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  STORAGE_ERROR = "STORAGE_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  UNPROCESSABLE = "UNPROCESSABLE",
}

local STATUS_FOR_CODE = {
  OK = 200,
  UNAUTHENTICATED = 401,
  FORBIDDEN = 403,
  INVALID_PAYLOAD = 400,
  NOT_FOUND = 404,
  CONFLICT = 409,
  RATE_LIMITED = 429,
  INSUFFICIENT_FUNDS = 400,
  STORAGE_ERROR = 500,
  INTERNAL_ERROR = 500,
  UNPROCESSABLE = 422,
}

function M.status_for_code(code)
  return STATUS_FOR_CODE[code] or 400
end

function M.ok(data, code)
  return nk.json_encode({
    success = true,
    data = data or {},
    error = "",
    status_code = 200,
    code = code or M.CODES.OK,
  })
end

function M.fail(message, code, status_code)
  local stable = code or M.CODES.INVALID_PAYLOAD
  local status = status_code or M.status_for_code(stable)
  return nk.json_encode({
    success = false,
    data = {},
    error = message or "Request failed",
    status_code = status,
    code = stable,
  })
end

-- Map legacy numeric HTTP-ish codes used across modules onto stable codes.
function M.fail_status(message, status_code)
  local code = M.CODES.INVALID_PAYLOAD
  local s = status_code or 400
  if s == 401 then
    code = M.CODES.UNAUTHENTICATED
  elseif s == 403 then
    code = M.CODES.FORBIDDEN
  elseif s == 404 then
    code = M.CODES.NOT_FOUND
  elseif s == 409 then
    code = M.CODES.CONFLICT
  elseif s == 422 then
    code = M.CODES.UNPROCESSABLE
  elseif s == 429 then
    code = M.CODES.RATE_LIMITED
  elseif s >= 500 then
    code = M.CODES.INTERNAL_ERROR
  end
  return M.fail(message, code, s)
end

return M
