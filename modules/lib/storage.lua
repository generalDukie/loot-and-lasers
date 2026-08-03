--[[
  Shared Nakama storage wrappers.
  Does not hide storage errors — callers receive ok/err.
  Multiple writes are NOT fully atomic across objects; callers must document OCC retries.
]]

local nk = require("nakama")

local M = {}

function M.read_one(user_id, collection, key)
  local objects = nk.storage_read({
    { collection = collection, key = key, user_id = user_id },
  })
  if objects == nil or #objects == 0 then
    return nil, nil, false -- value, version, found
  end
  return objects[1].value, objects[1].version, true
end

function M.write_one(user_id, collection, key, value, version, permission_read, permission_write)
  local object = {
    collection = collection,
    key = key,
    user_id = user_id,
    value = value,
    permission_read = permission_read or 1,
    permission_write = permission_write or 0,
  }
  if version ~= nil and version ~= "" then
    object.version = version
  end
  local ok, err = pcall(function()
    return nk.storage_write({ object })
  end)
  if not ok then
    return nil, tostring(err)
  end
  return err, nil -- ack, nil
end

function M.delete_one(user_id, collection, key)
  local ok, err = pcall(function()
    nk.storage_delete({
      { collection = collection, key = key, user_id = user_id },
    })
  end)
  if not ok then
    return false, tostring(err)
  end
  return true, nil
end

return M
