--[[
  Phase 4 — Read-only inventory service (Nakama Lua runtime).
  Collection: inventories / key: <character_id>
  RPC: inventory_get
  Ownership: character-level (matches Node Item.character_id architecture).
  account id is always context.user_id — never trust client account ids.
  No writes. Missing records return an empty inventory envelope.
]]

local nk = require("nakama")

local INV_COLLECTION = "inventories"
local PROFILE_COLLECTION = "player_profiles"
local PROFILE_KEY = "profile"
local MAX_CHARACTER_ID = 64

local function encode_ok(data)
  return nk.json_encode({
    success = true,
    data = data or {},
    error = "",
    status_code = 200,
  })
end

local function encode_fail(message, status_code)
  return nk.json_encode({
    success = false,
    data = {},
    error = message or "Request failed",
    status_code = status_code or 400,
  })
end

local function decode_payload(payload)
  if payload == nil or payload == "" then
    return {}
  end
  local ok, decoded = pcall(nk.json_decode, payload)
  if not ok or type(decoded) ~= "table" then
    return nil
  end
  return decoded
end

local function empty_array()
  -- Lua {} encodes as JSON object; force a real JSON array.
  return nk.json_decode("[]")
end

local function empty_inventory(character_id)
  return {
    inventory_version = 1,
    owner_type = "character",
    owner_id = character_id or "",
    slots = empty_array(),
    updated_at = 0,
  }
end

local function read_profile(user_id)
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

local function sanitize_slots(raw_slots)
  local slots = empty_array()
  if type(raw_slots) ~= "table" then
    return nil, "slots must be an array"
  end
  local count = #raw_slots
  if count == 0 then
    for _, _ in pairs(raw_slots) do
      return nil, "Malformed inventory slots"
    end
    return slots, nil
  end
  for i = 1, count do
    local row = raw_slots[i]
    if type(row) ~= "table" then
      return nil, "Malformed inventory slot at index " .. tostring(i)
    end
    local instance_id = row.instance_id
    local item_id = row.item_id
    local quantity = row.quantity
    local slot_index = row.slot_index
    local metadata = row.metadata
    if type(instance_id) ~= "string" or instance_id == "" then
      return nil, "slot.instance_id missing"
    end
    if type(item_id) ~= "string" or item_id == "" then
      return nil, "slot.item_id missing"
    end
    if type(quantity) ~= "number" or quantity < 1 then
      return nil, "slot.quantity invalid"
    end
    if type(slot_index) ~= "number" then
      slot_index = i - 1
    end
    if metadata == nil then
      metadata = {}
    end
    if type(metadata) ~= "table" then
      return nil, "slot.metadata must be an object"
    end
    table.insert(slots, {
      instance_id = instance_id,
      item_id = item_id,
      quantity = math.floor(quantity),
      slot_index = math.floor(slot_index),
      metadata = metadata,
    })
  end
  return slots, nil
end
local function normalize_record(character_id, value)
  if type(value) ~= "table" then
    return nil, "Malformed inventory record"
  end
  local slots, err = sanitize_slots(value.slots)
  if err ~= nil then
    return nil, err
  end
  local updated_at = value.updated_at
  if updated_at == nil then
    updated_at = 0
  end
  if type(updated_at) ~= "number" and type(updated_at) ~= "string" then
    return nil, "Malformed inventory updated_at"
  end
  return {
    inventory_version = 1,
    owner_type = "character",
    owner_id = character_id,
    slots = slots,
    updated_at = updated_at,
  }, nil
end

local function resolve_character_id(user_id, requested)
  local profile = read_profile(user_id)
  local selected = ""
  if profile ~= nil and type(profile.selected_character_id) == "string" then
    selected = profile.selected_character_id
  end

  if requested ~= nil and requested ~= "" then
    if type(requested) ~= "string" then
      return nil, "character_id must be a string"
    end
    if #requested > MAX_CHARACTER_ID then
      return nil, "character_id is too long"
    end
    -- Phase 4 ownership check: only the profile-selected character is readable.
    -- Full Node ownership binding is out of scope; do not silently allow arbitrary ids.
    if selected == "" then
      return nil, "No selected character on profile"
    end
    if requested ~= selected then
      return nil, "character_id is not the selected character for this account"
    end
    return requested, nil
  end

  if selected == "" then
    return "", nil -- empty inventory path (no character selected)
  end
  return selected, nil
end

local function rpc_inventory_get(context, payload)
  local user_id = context.user_id
  if user_id == nil or user_id == "" then
    return encode_fail("Unauthenticated", 401)
  end

  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end

  -- Reject client-supplied account / user ids.
  if body.account_id ~= nil or body.user_id ~= nil or body.owner_id ~= nil then
    return encode_fail("Unknown or forbidden field in inventory_get", 400)
  end

  local ok, result = pcall(function()
    local character_id, resolve_err = resolve_character_id(user_id, body.character_id)
    if resolve_err ~= nil then
      error({ err = resolve_err, code = 403 })
    end
    if character_id == "" then
      return empty_inventory("")
    end

    local objects = nk.storage_read({
      { collection = INV_COLLECTION, key = character_id, user_id = user_id },
    })
    if objects == nil or #objects == 0 then
      return empty_inventory(character_id)
    end

    local normalized, norm_err = normalize_record(character_id, objects[1].value)
    if norm_err ~= nil then
      error({ err = norm_err, code = 422 })
    end
    return normalized
  end)

  if not ok then
    if type(result) == "table" and result.err ~= nil then
      return encode_fail(result.err, result.code or 400)
    end
    nk.logger_error(string.format("inventory_get failed: %s", tostring(result)))
    return encode_fail("Failed to load inventory", 500)
  end

  return encode_ok(result)
end

nk.register_rpc(rpc_inventory_get, "inventory_get")
nk.logger_info("Phase 4 inventory RPC registered (inventory_get, read-only)")
