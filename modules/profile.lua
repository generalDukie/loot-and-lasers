--[[
  Phase 3 — Player profile service (Nakama Lua runtime).
  Collection: player_profiles / key: profile
  RPCs: profile_get, profile_update
  account_id is always context.user_id — never trust client.
]]

local nk = require("nakama")
local responses = require("lib.responses")
local validation = require("lib.validation")
local time = require("lib.time")
local logging = require("lib.logging")

local COLLECTION = "player_profiles"
local KEY = "profile"
local MIN_DISPLAY_NAME = 2
local MAX_DISPLAY_NAME = 24
local MAX_SELECTED_CHARACTER_ID = 64
local MAX_AVATAR_PORTRAIT = 64
local MAX_APPEARANCE_VALUE = 48

local ALLOWED_APPEARANCE_KEYS = {
  skin_color = true,
  eye_style = true,
  ears = true,
  mouth = true,
  nose = true,
  eyebrows = true,
  marking = true,
}

local ALLOWED_UPDATE_KEYS = {
  display_name = true,
  selected_character_id = true,
  appearance = true,
  avatar_portrait = true,
}

local function now_ms()
  return time.ms()
end

local function encode_ok(data)
  return responses.ok(data)
end

local function encode_fail(message, status_code)
  return responses.fail_status(message, status_code)
end

local function decode_payload(payload)
  return validation.decode_payload(payload)
end

local function default_profile(user_id)
  local t = now_ms()
  return {
    account_id = user_id,
    display_name = "",
    selected_character_id = "",
    appearance = {},
    avatar_portrait = "",
    created_at = t,
    updated_at = t,
  }
end

local function normalize_profile(user_id, value)
  local profile = default_profile(user_id)
  if type(value) ~= "table" then
    return profile
  end
  if type(value.display_name) == "string" then
    profile.display_name = value.display_name
  end
  if type(value.selected_character_id) == "string" then
    profile.selected_character_id = value.selected_character_id
  end
  if type(value.avatar_portrait) == "string" then
    profile.avatar_portrait = value.avatar_portrait
  end
  if type(value.appearance) == "table" then
    local appearance = {}
    for k, v in pairs(value.appearance) do
      if ALLOWED_APPEARANCE_KEYS[k] and type(v) == "string" then
        appearance[k] = v
      end
    end
    profile.appearance = appearance
  end
  if type(value.created_at) == "number" then
    profile.created_at = value.created_at
  end
  if type(value.updated_at) == "number" then
    profile.updated_at = value.updated_at
  end
  -- Always force authoritative account id from the session.
  profile.account_id = user_id
  return profile
end

local function read_profile(user_id)
  local objects = nk.storage_read({
    { collection = COLLECTION, key = KEY, user_id = user_id },
  })
  if objects == nil or #objects == 0 then
    return nil
  end
  return normalize_profile(user_id, objects[1].value)
end

local function write_profile(user_id, profile)
  nk.storage_write({
    {
      collection = COLLECTION,
      key = KEY,
      user_id = user_id,
      value = profile,
      permission_read = 1, -- owner read
      permission_write = 0, -- server / RPC only
    },
  })
end

local function ensure_profile(user_id)
  local existing = read_profile(user_id)
  if existing ~= nil then
    return existing, false
  end
  local created = default_profile(user_id)
  write_profile(user_id, created)
  -- Re-read so concurrent first-writes still converge on one key.
  local again = read_profile(user_id)
  if again ~= nil then
    return again, true
  end
  return created, true
end

local function validate_display_name(name)
  if type(name) ~= "string" then
    return "display_name must be a string"
  end
  local trimmed = name:match("^%s*(.-)%s*$") or ""
  if trimmed == "" then
    return "display_name must be at least " .. tostring(MIN_DISPLAY_NAME) .. " characters."
  end
  if #trimmed < MIN_DISPLAY_NAME then
    return "display_name must be at least " .. tostring(MIN_DISPLAY_NAME) .. " characters."
  end
  if #trimmed > MAX_DISPLAY_NAME then
    return "display_name must be " .. tostring(MAX_DISPLAY_NAME) .. " characters or fewer."
  end
  if trimmed:find("%d") then
    return "Names cannot contain numbers"
  end
  return nil, trimmed
end

local function validate_appearance(appearance)
  if type(appearance) ~= "table" then
    return "appearance must be an object"
  end
  local clean = {}
  for k, v in pairs(appearance) do
    if not ALLOWED_APPEARANCE_KEYS[k] then
      return "Unknown appearance field: " .. tostring(k)
    end
    if type(v) ~= "string" then
      return "appearance." .. tostring(k) .. " must be a string"
    end
    if #v > MAX_APPEARANCE_VALUE then
      return "appearance." .. tostring(k) .. " is too long"
    end
    clean[k] = v
  end
  return nil, clean
end

local function rpc_profile_get(context, _payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end
  local ok, profile_or_err = pcall(function()
    local profile = ensure_profile(user_id)
    return profile
  end)
  if not ok then
    nk.logger_error(string.format("profile_get failed: %s", tostring(profile_or_err)))
    return encode_fail("Failed to load profile", 500)
  end
  return encode_ok(profile_or_err)
end

local function rpc_profile_update(context, payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end

  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end

  for k, _ in pairs(body) do
    if not ALLOWED_UPDATE_KEYS[k] then
      return encode_fail("Unknown field: " .. tostring(k), 400)
    end
  end

  local ok, result = pcall(function()
    local profile = ensure_profile(user_id)

    if body.display_name ~= nil then
      local err, trimmed = validate_display_name(body.display_name)
      if err ~= nil then
        error({ err = err, code = 400 })
      end
      profile.display_name = trimmed
    end

    if body.selected_character_id ~= nil then
      if type(body.selected_character_id) ~= "string" then
        error({ err = "selected_character_id must be a string", code = 400 })
      end
      if #body.selected_character_id > MAX_SELECTED_CHARACTER_ID then
        error({ err = "selected_character_id is too long", code = 400 })
      end
      profile.selected_character_id = body.selected_character_id
    end

    if body.avatar_portrait ~= nil then
      if type(body.avatar_portrait) ~= "string" then
        error({ err = "avatar_portrait must be a string", code = 400 })
      end
      if #body.avatar_portrait > MAX_AVATAR_PORTRAIT then
        error({ err = "avatar_portrait is too long", code = 400 })
      end
      profile.avatar_portrait = body.avatar_portrait
    end

    if body.appearance ~= nil then
      local err, clean = validate_appearance(body.appearance)
      if err ~= nil then
        error({ err = err, code = 400 })
      end
      profile.appearance = clean
    end

    profile.account_id = user_id
    profile.updated_at = now_ms()
    write_profile(user_id, profile)
    return profile
  end)

  if not ok then
    if type(result) == "table" and result.err ~= nil then
      return encode_fail(result.err, result.code or 400)
    end
    nk.logger_error(string.format("profile_update failed: %s", tostring(result)))
    return encode_fail("Failed to update profile", 500)
  end

  return encode_ok(result)
end

nk.register_rpc(rpc_profile_get, "profile_get")
nk.register_rpc(rpc_profile_update, "profile_update")

nk.logger_info("Phase 3 profile RPCs registered (profile_get, profile_update)")
