--[[
  Shared time helpers. Server clock only — never trust client time.
]]

local M = {}

function M.unix()
  return os.time()
end

function M.ms()
  return os.time() * 1000
end

function M.iso_utc(unix)
  local t = unix or os.time()
  return os.date("!%Y-%m-%dT%H:%M:%SZ", t)
end

function M.is_expired(expires_unix, now_unix)
  local now = now_unix or os.time()
  local exp = tonumber(expires_unix)
  if exp == nil then
    return false
  end
  return now >= exp
end

return M
