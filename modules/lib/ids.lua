--[[
  Shared ID helpers.
]]

local nk = require("nakama")

local M = {}

function M.uuid()
  return nk.uuid_v4()
end

--- Lightweight non-crypto id for logs/request correlation.
function M.request_id()
  return string.format("%s-%d", string.sub(nk.uuid_v4(), 1, 8), os.time())
end

return M
