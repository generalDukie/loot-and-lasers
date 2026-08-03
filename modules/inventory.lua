--[[
  Phase 4 + 13 — Inventory service (Nakama Lua runtime).
  Public RPC: inventory_get (read-only)
  INTERNAL (trusted modules only — not registered as public RPCs):
    - grant_item_instance(user_id, character_id, instance_row)
  Collection: inventories / key: <character_id>
]]

local nk = require("nakama")
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local storage = require("lib.storage")
local logging = require("lib.logging")
local time = require("lib.time")

local INV_COLLECTION = "inventories"
local BAG_CAP_DEFAULT = 10
local MAX_WRITE_RETRIES = 5

local function empty_inventory(character_id)
  return {
    inventory_version = 1,
    owner_type = "character",
    owner_id = character_id or "",
    slots = validation.empty_array(),
    updated_at = 0,
  }
end

local function sanitize_slots(raw_slots)
  local slots = validation.empty_array()
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

local function rpc_inventory_get(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end

  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end

  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return responses.fail_status("Unknown or forbidden field in inventory_get", 400)
  end

  local ok, result = pcall(function()
    local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, true)
    if resolve_err ~= nil then
      error({ err = resolve_err, code = 403 })
    end
    if character_id == "" then
      return empty_inventory("")
    end

    local value, _, found = storage.read_one(user_id, INV_COLLECTION, character_id)
    if not found then
      return empty_inventory(character_id)
    end

    local normalized, norm_err = normalize_record(character_id, value)
    if norm_err ~= nil then
      error({ err = norm_err, code = 422 })
    end
    return normalized
  end)

  if not ok then
    if type(result) == "table" and result.err ~= nil then
      return responses.fail_status(result.err, result.code or 400)
    end
    logging.error("inventory", "inventory_get", { user_id = user_id, error = tostring(result) })
    return responses.fail_status("Failed to load inventory", 500)
  end

  return responses.ok(result)
end

local function read_inventory(user_id, character_id)
  local value, version, found = storage.read_one(user_id, INV_COLLECTION, character_id)
  if not found then
    return empty_inventory(character_id), nil, nil
  end
  local normalized, err = normalize_record(character_id, value)
  if err ~= nil then
    return nil, nil, err
  end
  return normalized, version, nil
end

--- INTERNAL — append one item instance to character bag. Not a public RPC.
--- instance_row: { instance_id, item_id, quantity, metadata }
local function grant_item_instance(user_id, character_id, instance_row)
  if type(user_id) ~= "string" or user_id == "" then
    return nil, "user_id is required", 400
  end
  if type(character_id) ~= "string" or character_id == "" then
    return nil, "character_id is required", 400
  end
  if type(instance_row) ~= "table" then
    return nil, "instance_row must be an object", 400
  end
  if type(instance_row.instance_id) ~= "string" or instance_row.instance_id == "" then
    return nil, "instance_id is required", 400
  end
  if type(instance_row.item_id) ~= "string" or instance_row.item_id == "" then
    return nil, "item_id is required", 400
  end
  local quantity = tonumber(instance_row.quantity) or 1
  if quantity ~= math.floor(quantity) or quantity < 1 then
    return nil, "quantity must be a positive integer", 400
  end
  local metadata = instance_row.metadata
  if metadata == nil then
    metadata = {}
  end
  if type(metadata) ~= "table" then
    return nil, "metadata must be an object", 400
  end

  local last_err = "Failed to grant item"
  for _ = 1, MAX_WRITE_RETRIES do
    local inv, version, err = read_inventory(user_id, character_id)
    if err ~= nil then
      return nil, err, 422
    end

    -- Duplicate instance guard
    for i = 1, #inv.slots do
      if inv.slots[i].instance_id == instance_row.instance_id then
        return {
          inventory = inv,
          already_present = true,
          instance_id = instance_row.instance_id,
        }, nil, 200
      end
    end

    if #inv.slots >= BAG_CAP_DEFAULT then
      return nil, "Inventory full", 409
    end

    local slots = validation.empty_array()
    for i = 1, #inv.slots do
      table.insert(slots, inv.slots[i])
    end
    table.insert(slots, {
      instance_id = instance_row.instance_id,
      item_id = instance_row.item_id,
      quantity = quantity,
      slot_index = #slots,
      metadata = metadata,
    })

    local record = {
      inventory_version = 1,
      owner_type = "character",
      owner_id = character_id,
      slots = slots,
      updated_at = time.unix(),
    }
    local _, werr = storage.write_one(user_id, INV_COLLECTION, character_id, record, version, 1, 0)
    if werr == nil then
      return {
        inventory = record,
        already_present = false,
        instance_id = instance_row.instance_id,
      }, nil, 200
    end
    last_err = tostring(werr)
  end
  return nil, last_err, 409
end

nk.register_rpc(rpc_inventory_get, "inventory_get")
-- inventory_grant / inventory_write intentionally NOT registered.

nk.logger_info("Phase 4/13 inventory: public inventory_get; grant_item_instance internal-only")

return {
  grant_item_instance = grant_item_instance,
  BAG_CAP_DEFAULT = BAG_CAP_DEFAULT,
  INV_COLLECTION = INV_COLLECTION,
}
