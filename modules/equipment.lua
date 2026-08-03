--[[
  Phase 6 — Read-only equipment service (Nakama Lua runtime).
  Collection: equipment / key: <character_id>
  RPC: equipment_get
  Ownership: character-level (matches Node Character.equipped_items / Item.character_id).
  Account id is always context.user_id — never trust client account ids.
  No writes. Missing records return an empty equipment envelope (all slots null).
  Does not modify inventory storage.
]]

local nk = require("nakama")
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local logging = require("lib.logging")

local EQ_COLLECTION = "equipment"
local MAX_CHARACTER_ID = 64

-- Canonical slot IDs — item.type is the slot key (1:1). Matches InventoryRules.EQUIPPABLE_TYPES.
local EQUIPMENT_SLOTS = {
  "weapon",
  "helmet",
  "armor",
  "legs",
  "boots",
  "neck",
  "accessory",
  "ship_module",
}

local SLOT_SET = {}
for _, id in ipairs(EQUIPMENT_SLOTS) do
  SLOT_SET[id] = true
end

local function encode_fail(message, status_code)
  return responses.fail_status(message, status_code)
end

local function decode_payload(payload)
  return validation.decode_payload(payload)
end

-- Lua nil is omitted by nk.json_encode; build slots JSON so empty slots stay null.
local function encode_slots_json(slots)
  local parts = {}
  for _, id in ipairs(EQUIPMENT_SLOTS) do
    local v = nil
    if type(slots) == "table" then
      v = slots[id]
    end
    if v == nil then
      table.insert(parts, string.format('"%s":null', id))
    else
      table.insert(parts, string.format('"%s":%s', id, nk.json_encode(v)))
    end
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

local function encode_ok_equipment(data)
  local owner_id = ""
  local updated_at = 0
  local slots = nil
  if type(data) == "table" then
    if type(data.owner_id) == "string" then
      owner_id = data.owner_id
    end
    if data.updated_at ~= nil then
      updated_at = data.updated_at
    end
    slots = data.slots
  end
  return string.format(
    '{"success":true,"data":{"equipment_version":1,"owner_type":"character","owner_id":%s,"slots":%s,"updated_at":%s},"error":"","status_code":200}',
    nk.json_encode(owner_id),
    encode_slots_json(slots),
    nk.json_encode(updated_at)
  )
end

local function empty_slots()
  -- Intentionally empty map: encode_slots_json emits null for every canonical slot.
  return {}
end

local function empty_equipment(character_id)
  return {
    equipment_version = 1,
    owner_type = "character",
    owner_id = character_id or "",
    slots = empty_slots(),
    updated_at = 0,
  }
end

local function read_profile(user_id)
  return auth.read_profile(user_id)
end

local function sanitize_slot_value(slot_id, raw)
  -- JSON null / missing → empty (encoded as null in the response).
  if raw == nil then
    return nil, nil
  end
  if type(raw) == "boolean" or type(raw) == "number" or type(raw) == "string" then
    return nil, "Invalid item in slot " .. slot_id
  end
  if type(raw) ~= "table" then
    return nil, "Invalid item in slot " .. slot_id
  end

  -- Empty object {} means empty slot.
  local has_keys = false
  for _ in pairs(raw) do
    has_keys = true
    break
  end
  if not has_keys then
    return nil, nil
  end

  local instance_id = raw.instance_id
  local item_id = raw.item_id
  local metadata = raw.metadata

  if type(instance_id) ~= "string" or instance_id == "" then
    return nil, "Invalid item in slot " .. slot_id .. " (instance_id)"
  end
  if type(item_id) ~= "string" or item_id == "" then
    return nil, "Invalid item in slot " .. slot_id .. " (item_id)"
  end
  if metadata == nil then
    metadata = {}
  end
  if type(metadata) ~= "table" then
    return nil, "Invalid item in slot " .. slot_id .. " (metadata)"
  end

  return {
    instance_id = instance_id,
    item_id = item_id,
    metadata = metadata,
  }, nil
end

local function sanitize_slots(raw_slots)
  if raw_slots == nil then
    return empty_slots(), nil
  end
  if type(raw_slots) ~= "table" then
    return nil, "slots must be an object"
  end

  -- Reject array-shaped slots (equipment uses a fixed slot map, not a bag array).
  if #raw_slots > 0 then
    return nil, "slots must be an object keyed by slot id"
  end

  local slots = empty_slots()
  for key, value in pairs(raw_slots) do
    if type(key) ~= "string" then
      return nil, "Malformed equipment slot key"
    end
    if not SLOT_SET[key] then
      -- Unknown keys fail safely rather than silently accepting junk.
      return nil, "Unknown equipment slot: " .. key
    end
    local cleaned, err = sanitize_slot_value(key, value)
    if err ~= nil then
      return nil, err
    end
    if cleaned ~= nil then
      slots[key] = cleaned
    end
  end
  return slots, nil
end

local function normalize_record(character_id, value)
  if type(value) ~= "table" then
    return nil, "Malformed equipment record"
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
    return nil, "Malformed equipment updated_at"
  end
  return {
    equipment_version = 1,
    owner_type = "character",
    owner_id = character_id,
    slots = slots,
    updated_at = updated_at,
  }, nil
end

local function resolve_character_id(user_id, requested)
  local character_id, err = auth.resolve_character_id(user_id, requested, true)
  return character_id, err
end

local function rpc_equipment_get(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end

  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end

  -- Reject client-supplied account / user ids.
  if body.account_id ~= nil or body.user_id ~= nil or body.owner_id ~= nil then
    return encode_fail("Unknown or forbidden field in equipment_get", 400)
  end

  local ok, result = pcall(function()
    local character_id, resolve_err = resolve_character_id(user_id, body.character_id)
    if resolve_err ~= nil then
      error({ err = resolve_err, code = 403 })
    end
    if character_id == "" then
      return empty_equipment("")
    end

    local objects = nk.storage_read({
      { collection = EQ_COLLECTION, key = character_id, user_id = user_id },
    })
    if objects == nil or #objects == 0 then
      return empty_equipment(character_id)
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
    logging.error("equipment", "equipment_get", { user_id = user_id, error = tostring(result) })
    return encode_fail("Failed to load equipment", 500)
  end

  return encode_ok_equipment(result)
end

nk.register_rpc(rpc_equipment_get, "equipment_get")
nk.logger_info("Phase 6 equipment RPC registered (equipment_get, read-only)")
