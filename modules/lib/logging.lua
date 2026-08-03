--[[
  Shared logging helpers. Never log tokens, passwords, cookies, or secrets.
]]

local nk = require("nakama")

local M = {}

local function safe_str(v)
  if v == nil then
    return ""
  end
  return tostring(v)
end

function M.info(module_name, action, fields)
  local parts = {
    string.format("[%s] %s", safe_str(module_name), safe_str(action)),
  }
  if type(fields) == "table" then
    if fields.user_id then
      table.insert(parts, "user=" .. safe_str(fields.user_id))
    end
    if fields.character_id then
      table.insert(parts, "char=" .. safe_str(fields.character_id))
    end
    if fields.request_id then
      table.insert(parts, "req=" .. safe_str(fields.request_id))
    end
    if fields.code then
      table.insert(parts, "code=" .. safe_str(fields.code))
    end
    if fields.ok ~= nil then
      table.insert(parts, "ok=" .. tostring(fields.ok))
    end
  end
  nk.logger_info(table.concat(parts, " "))
end

function M.error(module_name, action, fields)
  local parts = {
    string.format("[%s] %s", safe_str(module_name), safe_str(action)),
  }
  if type(fields) == "table" then
    if fields.user_id then
      table.insert(parts, "user=" .. safe_str(fields.user_id))
    end
    if fields.character_id then
      table.insert(parts, "char=" .. safe_str(fields.character_id))
    end
    if fields.request_id then
      table.insert(parts, "req=" .. safe_str(fields.request_id))
    end
    if fields.code then
      table.insert(parts, "code=" .. safe_str(fields.code))
    end
    if fields.error then
      table.insert(parts, "err=" .. safe_str(fields.error))
    end
  end
  nk.logger_error(table.concat(parts, " "))
end

return M
