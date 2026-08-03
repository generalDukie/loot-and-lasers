--[[
  Phase 6 + 11 — Equipment service (Nakama Lua).
  Public RPCs: equipment_get, equipment_equip, equipment_unequip
  Representation B: equipped items live in equipment.slots; bag is inventories.slots.
  Mutations move instances between collections. No grants/deletes/loot.
  Account id = context.user_id only.
]]

local nk = require("nakama")
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local storage = require("lib.storage")
local time = require("lib.time")
local logging = require("lib.logging")
local transactions = require("lib.transactions")

local EQ_COLLECTION = "equipment"
local INV_COLLECTION = "inventories"
local TX_COLLECTION = "equipment_mutations"
local BAG_CAP_DEFAULT = 10
local MAX_WRITE_RETRIES = 5

-- Canonical slot IDs — item category (metadata.type) must equal slot (1:1).
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
local SLOT_ALLOWLIST = {}
for _, id in ipairs(EQUIPMENT_SLOTS) do
  SLOT_SET[id] = true
  SLOT_ALLOWLIST[id] = { [id] = true }
end

local function encode_fail(message, status_code)
  return responses.fail_status(message, status_code)
end

local function decode_payload(payload)
  return validation.decode_payload(payload)
end

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
    '{"success":true,"data":{"equipment_version":1,"owner_type":"character","owner_id":%s,"slots":%s,"updated_at":%s},"error":"","status_code":200,"code":"OK"}',
    nk.json_encode(owner_id),
    encode_slots_json(slots),
    nk.json_encode(updated_at)
  )
end

local function empty_slots()
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

local function empty_inventory(character_id)
  return {
    inventory_version = 1,
    owner_type = "character",
    owner_id = character_id or "",
    slots = validation.empty_array(),
    updated_at = 0,
  }
end

local function sanitize_slot_value(slot_id, raw)
  if raw == nil then
    return nil, nil
  end
  if type(raw) == "boolean" or type(raw) == "number" or type(raw) == "string" then
    return nil, "Invalid item in slot " .. slot_id
  end
  if type(raw) ~= "table" then
    return nil, "Invalid item in slot " .. slot_id
  end

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

local function sanitize_eq_slots(raw_slots)
  if raw_slots == nil then
    return empty_slots(), nil
  end
  if type(raw_slots) ~= "table" then
    return nil, "slots must be an object"
  end
  if #raw_slots > 0 then
    return nil, "slots must be an object keyed by slot id"
  end

  local slots = empty_slots()
  for key, value in pairs(raw_slots) do
    if type(key) ~= "string" then
      return nil, "Malformed equipment slot key"
    end
    if not SLOT_SET[key] then
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

local function normalize_equipment(character_id, value)
  if type(value) ~= "table" then
    return nil, "Malformed equipment record"
  end
  local slots, err = sanitize_eq_slots(value.slots)
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

local function sanitize_inv_slots(raw_slots)
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

local function normalize_inventory(character_id, value)
  if type(value) ~= "table" then
    return nil, "Malformed inventory record"
  end
  local slots, err = sanitize_inv_slots(value.slots)
  if err ~= nil then
    return nil, err
  end
  local updated_at = value.updated_at or 0
  return {
    inventory_version = 1,
    owner_type = "character",
    owner_id = character_id,
    slots = slots,
    updated_at = updated_at,
  }, nil
end

local function read_equipment(user_id, character_id)
  local value, version, found = storage.read_one(user_id, EQ_COLLECTION, character_id)
  if not found then
    return empty_equipment(character_id), nil, nil
  end
  local normalized, err = normalize_equipment(character_id, value)
  if err ~= nil then
    return nil, nil, err
  end
  return normalized, version, nil
end

local function read_inventory(user_id, character_id)
  local value, version, found = storage.read_one(user_id, INV_COLLECTION, character_id)
  if not found then
    return empty_inventory(character_id), nil, nil
  end
  local normalized, err = normalize_inventory(character_id, value)
  if err ~= nil then
    return nil, nil, err
  end
  return normalized, version, nil
end

local function write_equipment(user_id, character_id, record, version)
  return storage.write_one(user_id, EQ_COLLECTION, character_id, record, version, 1, 0)
end

local function write_inventory(user_id, character_id, record, version)
  return storage.write_one(user_id, INV_COLLECTION, character_id, record, version, 1, 0)
end

local function item_category(row)
  if type(row) ~= "table" then
    return nil
  end
  if type(row.metadata) == "table" and type(row.metadata.type) == "string" and row.metadata.type ~= "" then
    return row.metadata.type
  end
  return nil
end

local function find_inv_index(inv, instance_id)
  if type(inv) ~= "table" or type(inv.slots) ~= "table" then
    return nil
  end
  for i = 1, #inv.slots do
    if inv.slots[i].instance_id == instance_id then
      return i
    end
  end
  return nil
end

local function find_equipped_instance(eq, instance_id)
  if type(eq) ~= "table" or type(eq.slots) ~= "table" then
    return nil
  end
  for _, slot_id in ipairs(EQUIPMENT_SLOTS) do
    local piece = eq.slots[slot_id]
    if type(piece) == "table" and piece.instance_id == instance_id then
      return slot_id
    end
  end
  return nil
end

local function reindex_inv_slots(slots)
  local out = validation.empty_array()
  for i = 1, #slots do
    local row = slots[i]
    table.insert(out, {
      instance_id = row.instance_id,
      item_id = row.item_id,
      quantity = row.quantity,
      slot_index = i - 1,
      metadata = row.metadata or {},
    })
  end
  return out
end

local function copy_eq_slots(slots)
  local out = empty_slots()
  if type(slots) ~= "table" then
    return out
  end
  for _, id in ipairs(EQUIPMENT_SLOTS) do
    if slots[id] ~= nil then
      out[id] = {
        instance_id = slots[id].instance_id,
        item_id = slots[id].item_id,
        metadata = slots[id].metadata or {},
      }
    end
  end
  return out
end

local function mutation_response(equipment, inventory, extras)
  local data = {
    equipment = equipment,
    inventory = inventory,
  }
  if type(extras) == "table" then
    for k, v in pairs(extras) do
      data[k] = v
    end
  end
  -- Encode equipment with null slots explicitly; wrap via responses.ok for inventory-friendly envelope.
  -- Use custom JSON so equipment.slots keep nulls.
  local inv_json = nk.json_encode(inventory)
  local extras_parts = {}
  if type(extras) == "table" then
    for k, v in pairs(extras) do
      table.insert(extras_parts, string.format("%s:%s", nk.json_encode(k), nk.json_encode(v)))
    end
  end
  local extras_json = ""
  if #extras_parts > 0 then
    extras_json = "," .. table.concat(extras_parts, ",")
  end
  return string.format(
    '{"success":true,"data":{"equipment":{"equipment_version":1,"owner_type":"character","owner_id":%s,"slots":%s,"updated_at":%s},"inventory":%s%s},"error":"","status_code":200,"code":"OK"}',
    nk.json_encode(equipment.owner_id or ""),
    encode_slots_json(equipment.slots),
    nk.json_encode(equipment.updated_at or 0),
    inv_json,
    extras_json
  )
end

local function read_tx(user_id, request_id)
  local value, _, found = storage.read_one(user_id, TX_COLLECTION, request_id)
  if not found or type(value) ~= "table" then
    return nil
  end
  return value
end

local function write_tx(user_id, request_id, record)
  return storage.write_one(user_id, TX_COLLECTION, request_id, record, nil, 1, 0)
end

local function replay_tx(tx)
  if type(tx) ~= "table" or type(tx.equipment) ~= "table" or type(tx.inventory) ~= "table" then
    return encode_fail("Corrupt mutation transaction", 500)
  end
  return mutation_response(tx.equipment, tx.inventory, {
    request_id = tx.request_id or "",
    action = tx.action or "",
    replayed = true,
  })
end

local function persist_pair(user_id, character_id, equipment, inventory, eq_ver, inv_ver)
  local now = time.unix()
  equipment.updated_at = now
  inventory.updated_at = now
  equipment.owner_id = character_id
  inventory.owner_id = character_id
  local _, werr1 = write_equipment(user_id, character_id, equipment, eq_ver)
  if werr1 ~= nil then
    return false, tostring(werr1)
  end
  local _, werr2 = write_inventory(user_id, character_id, inventory, inv_ver)
  if werr2 ~= nil then
    return false, tostring(werr2)
  end
  return true, nil
end

local function apply_equip(user_id, character_id, instance_id, target_slot, request_id)
  if not SLOT_SET[target_slot] then
    return nil, "Unknown equipment slot", 400
  end

  local existing = read_tx(user_id, request_id)
  if existing ~= nil then
    return replay_tx(existing), nil
  end

  local last_err = "Failed to equip item"
  for _ = 1, MAX_WRITE_RETRIES do
    existing = read_tx(user_id, request_id)
    if existing ~= nil then
      return replay_tx(existing), nil
    end

    local eq, eq_ver, eq_err = read_equipment(user_id, character_id)
    if eq_err ~= nil then
      return nil, eq_err, 422
    end
    local inv, inv_ver, inv_err = read_inventory(user_id, character_id)
    if inv_err ~= nil then
      return nil, inv_err, 422
    end

    local worn_slot = find_equipped_instance(eq, instance_id)
    if worn_slot ~= nil then
      if worn_slot == target_slot then
        return mutation_response(eq, inv, {
          request_id = request_id,
          action = "equip",
          already_equipped = true,
        }), nil
      end
      return nil, "Item is already equipped in another slot", 409
    end

    local inv_index = find_inv_index(inv, instance_id)
    if inv_index == nil then
      return nil, "Item instance not found in inventory", 404
    end

    local row = inv.slots[inv_index]
    local category = item_category(row)
    if category == nil then
      return nil, "Item is missing equipment category", 422
    end
    local allowed = SLOT_ALLOWLIST[target_slot]
    if allowed == nil or allowed[category] ~= true then
      return nil, "Item type is incompatible with slot", 400
    end

    local new_eq_slots = copy_eq_slots(eq.slots)
    local displaced = new_eq_slots[target_slot]
    new_eq_slots[target_slot] = {
      instance_id = row.instance_id,
      item_id = row.item_id,
      metadata = row.metadata or {},
    }

    local new_inv_slots = validation.empty_array()
    for i = 1, #inv.slots do
      if i ~= inv_index then
        table.insert(new_inv_slots, inv.slots[i])
      end
    end
    if displaced ~= nil then
      table.insert(new_inv_slots, {
        instance_id = displaced.instance_id,
        item_id = displaced.item_id,
        quantity = 1,
        slot_index = 0,
        metadata = displaced.metadata or {},
      })
    end
    new_inv_slots = reindex_inv_slots(new_inv_slots)

    local new_eq = {
      equipment_version = 1,
      owner_type = "character",
      owner_id = character_id,
      slots = new_eq_slots,
      updated_at = time.unix(),
    }
    local new_inv = {
      inventory_version = 1,
      owner_type = "character",
      owner_id = character_id,
      slots = new_inv_slots,
      updated_at = time.unix(),
    }

    local ok_write, werr = persist_pair(user_id, character_id, new_eq, new_inv, eq_ver, inv_ver)
    if ok_write then
      local tx = {
        request_id = request_id,
        character_id = character_id,
        action = "equip",
        equipment = new_eq,
        inventory = new_inv,
        created_at = time.unix(),
      }
      write_tx(user_id, request_id, tx)
      return mutation_response(new_eq, new_inv, {
        request_id = request_id,
        action = "equip",
        replayed = false,
      }), nil
    end
    last_err = werr or last_err
  end
  return nil, last_err, 409
end

local function apply_unequip(user_id, character_id, target_slot, request_id)
  if not SLOT_SET[target_slot] then
    return nil, "Unknown equipment slot", 400
  end

  local existing = read_tx(user_id, request_id)
  if existing ~= nil then
    return replay_tx(existing), nil
  end

  local last_err = "Failed to unequip item"
  for _ = 1, MAX_WRITE_RETRIES do
    existing = read_tx(user_id, request_id)
    if existing ~= nil then
      return replay_tx(existing), nil
    end

    local eq, eq_ver, eq_err = read_equipment(user_id, character_id)
    if eq_err ~= nil then
      return nil, eq_err, 422
    end
    local inv, inv_ver, inv_err = read_inventory(user_id, character_id)
    if inv_err ~= nil then
      return nil, inv_err, 422
    end

    local piece = eq.slots[target_slot]
    if piece == nil then
      return nil, "Slot is empty", 404
    end

    if #inv.slots >= BAG_CAP_DEFAULT then
      return nil, "Inventory full — free a bag slot before unequipping", 409
    end

    if find_inv_index(inv, piece.instance_id) ~= nil then
      return nil, "Equipped item already present in inventory", 409
    end

    local new_eq_slots = copy_eq_slots(eq.slots)
    new_eq_slots[target_slot] = nil

    local new_inv_slots = validation.empty_array()
    for i = 1, #inv.slots do
      table.insert(new_inv_slots, inv.slots[i])
    end
    table.insert(new_inv_slots, {
      instance_id = piece.instance_id,
      item_id = piece.item_id,
      quantity = 1,
      slot_index = 0,
      metadata = piece.metadata or {},
    })
    new_inv_slots = reindex_inv_slots(new_inv_slots)

    local new_eq = {
      equipment_version = 1,
      owner_type = "character",
      owner_id = character_id,
      slots = new_eq_slots,
      updated_at = time.unix(),
    }
    local new_inv = {
      inventory_version = 1,
      owner_type = "character",
      owner_id = character_id,
      slots = new_inv_slots,
      updated_at = time.unix(),
    }

    local ok_write, werr = persist_pair(user_id, character_id, new_eq, new_inv, eq_ver, inv_ver)
    if ok_write then
      local tx = {
        request_id = request_id,
        character_id = character_id,
        action = "unequip",
        equipment = new_eq,
        inventory = new_inv,
        created_at = time.unix(),
      }
      write_tx(user_id, request_id, tx)
      return mutation_response(new_eq, new_inv, {
        request_id = request_id,
        action = "unequip",
        replayed = false,
      }), nil
    end
    last_err = werr or last_err
  end
  return nil, last_err, 409
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

  if body.account_id ~= nil or body.user_id ~= nil or body.owner_id ~= nil then
    return encode_fail("Unknown or forbidden field in equipment_get", 400)
  end

  local ok, result = pcall(function()
    local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, true)
    if resolve_err ~= nil then
      error({ err = resolve_err, code = 403 })
    end
    if character_id == "" then
      return empty_equipment("")
    end
    local eq, _, err = read_equipment(user_id, character_id)
    if err ~= nil then
      error({ err = err, code = 422 })
    end
    return eq
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

local function rpc_equipment_equip(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end

  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true,
    item_instance_id = true,
    target_slot = true,
    request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end

  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local instance_id, ierr = validation.require_string(body.item_instance_id, "item_instance_id", 128)
  if ierr ~= nil then
    return encode_fail(ierr, 400)
  end
  local target_slot, serr = validation.require_string(body.target_slot, "target_slot", 64)
  if serr ~= nil then
    return encode_fail(serr, 400)
  end

  local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, false)
  if resolve_err ~= nil then
    return encode_fail(resolve_err, 403)
  end

  local encoded, err, status = apply_equip(user_id, character_id, instance_id, target_slot, body.request_id)
  if err ~= nil then
    local code = status or 400
    if code >= 500 then
      logging.error("equipment", "equipment_equip", {
        user_id = user_id,
        character_id = character_id,
        error = err,
        code = tostring(code),
      })
    else
      logging.info("equipment", "equipment_equip", {
        user_id = user_id,
        character_id = character_id,
        error = err,
        code = tostring(code),
        ok = false,
      })
    end
    return encode_fail(err, code)
  end
  logging.info("equipment", "equipment_equip", {
    user_id = user_id,
    character_id = character_id,
    request_id = body.request_id,
    ok = true,
  })
  return encoded
end

local function rpc_equipment_unequip(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end

  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true,
    target_slot = true,
    request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end

  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local target_slot, serr = validation.require_string(body.target_slot, "target_slot", 64)
  if serr ~= nil then
    return encode_fail(serr, 400)
  end

  local character_id, resolve_err = auth.resolve_character_id(user_id, body.character_id, false)
  if resolve_err ~= nil then
    return encode_fail(resolve_err, 403)
  end

  local encoded, err, status = apply_unequip(user_id, character_id, target_slot, body.request_id)
  if err ~= nil then
    local code = status or 400
    if code >= 500 then
      logging.error("equipment", "equipment_unequip", {
        user_id = user_id,
        character_id = character_id,
        error = err,
        code = tostring(code),
      })
    else
      logging.info("equipment", "equipment_unequip", {
        user_id = user_id,
        character_id = character_id,
        error = err,
        code = tostring(code),
        ok = false,
      })
    end
    return encode_fail(err, code)
  end
  logging.info("equipment", "equipment_unequip", {
    user_id = user_id,
    character_id = character_id,
    request_id = body.request_id,
    ok = true,
  })
  return encoded
end

nk.register_rpc(rpc_equipment_get, "equipment_get")
nk.register_rpc(rpc_equipment_equip, "equipment_equip")
nk.register_rpc(rpc_equipment_unequip, "equipment_unequip")
nk.logger_info("Phase 11 equipment RPCs registered (equipment_get, equipment_equip, equipment_unequip)")
