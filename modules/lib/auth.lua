--[[
  Shared auth / character ownership helpers.
  Account id always comes from context.user_id — never from client payload.
]]

local nk = require("nakama")
local responses = require("lib.responses")

local M = {}

local PROFILE_COLLECTION = "player_profiles"
local PROFILE_KEY = "profile"
local MAX_CHARACTER_ID = 64

function M.user_id(context)
  if context == nil or context.user_id == nil or context.user_id == "" then
    return nil
  end
  return context.user_id
end

function M.require_user(context)
  local uid = M.user_id(context)
  if uid == nil then
    return nil, responses.fail_status("Unauthenticated", 401)
  end
  return uid, nil
end

function M.read_profile(user_id)
  local objects = nk.storage_read({
    { collection = PROFILE_COLLECTION, key = PROFILE_KEY, user_id = user_id },
  })
  if objects == nil or #objects == 0 then
    return nil
  end
  local value = objects[1].value
  if type(value) ~= "table" then
    return nil
  end
  return value
end

--- Resolve character id against profile.selected_character_id.
--- allow_empty=true returns "" when no selection (inventory empty-path).
function M.resolve_character_id(user_id, requested, allow_empty)
  local profile = M.read_profile(user_id)
  local selected = ""
  if profile ~= nil and type(profile.selected_character_id) == "string" then
    selected = profile.selected_character_id
  end

  if requested ~= nil and requested ~= "" then
    if type(requested) ~= "string" then
      return nil, "character_id must be a string", 403
    end
    if #requested > MAX_CHARACTER_ID then
      return nil, "character_id is too long", 403
    end
    if selected == "" then
      return nil, "No selected character on profile", 403
    end
    if requested ~= selected then
      return nil, "character_id is not the selected character for this account", 403
    end
    return requested, nil, nil
  end

  if selected == "" then
    if allow_empty then
      return "", nil, nil
    end
    return nil, "No selected character on profile", 403
  end
  return selected, nil, nil
end

M.MAX_CHARACTER_ID = MAX_CHARACTER_ID
M.PROFILE_COLLECTION = PROFILE_COLLECTION
M.PROFILE_KEY = PROFILE_KEY

return M
