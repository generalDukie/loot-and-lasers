extends Node
## Phase 11 — Nakama equipment RPCs for Nakama inventory instance IDs.
## Hero/Inventory UIs that list Node Item rows use AuthManager.equip_item / unequip_item
## (Node Item PATCH). Do not pass Node Item UUIDs into equipment_equip until bridged.

signal equipment_loaded(equipment: Dictionary)
signal item_equipped(equipment: Dictionary, inventory: Dictionary)
signal item_unequipped(equipment: Dictionary, inventory: Dictionary)
signal equipment_changed(equipment: Dictionary)
signal equipment_error(error: String)
signal loading_changed(loading: bool)
signal mutation_state_changed(mutating: bool)

const RPC_GET := "equipment_get"
const RPC_EQUIP := "equipment_equip"
const RPC_UNEQUIP := "equipment_unequip"

## Canonical slot ids (item.type == slot). Matches InventoryRules.EQUIPPABLE_TYPES.
const SLOT_IDS: PackedStringArray = [
	"weapon",
	"helmet",
	"armor",
	"legs",
	"boots",
	"neck",
	"accessory",
	"ship_module",
]

var nakama_equipment: Dictionary = {}
var loading := false
var mutating := false

var _load_busy := false
var _mutate_busy := false


func _ready() -> void:
	print("[EquipmentManager] ready (equipment_get / equip / unequip)")


func has_equipment() -> bool:
	return typeof(nakama_equipment.get("slots", null)) == TYPE_DICTIONARY


func is_mutating() -> bool:
	return mutating


func clear_local() -> void:
	nakama_equipment = {}


func get_slot(slot_id: String) -> Variant:
	return get_equipped_item(slot_id)


func get_equipped_item(target_slot: String) -> Variant:
	var slots: Variant = nakama_equipment.get("slots", {})
	if typeof(slots) != TYPE_DICTIONARY:
		return null
	return (slots as Dictionary).get(target_slot, null)


func load_equipment(character_id: String = "") -> Dictionary:
	if _load_busy:
		return _fail("Equipment load already in progress")
	_load_busy = true
	_set_loading(true)

	var cid := _resolve_character_id(character_id)
	var payload: Dictionary = {}
	if not cid.is_empty():
		payload["character_id"] = cid

	var res: Dictionary = await NakamaManager.invoke_rpc(RPC_GET, payload)
	_load_busy = false
	_set_loading(false)

	if typeof(res) != TYPE_DICTIONARY:
		var bad := _fail("Malformed equipment response")
		equipment_error.emit(str(bad.error))
		return bad

	if not bool(res.get("success", false)):
		var err := str(res.get("error", "Equipment request failed"))
		equipment_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status_code", 0)),
		}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		var malformed := _fail("Malformed equipment data")
		equipment_error.emit(str(malformed.error))
		return malformed

	nakama_equipment = (data as Dictionary).duplicate(true)
	equipment_changed.emit(nakama_equipment)
	equipment_loaded.emit(nakama_equipment)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": nakama_equipment,
		"status_code": int(res.get("status_code", 200)),
	}


## Equip an inventory instance into target_slot. Server validates ownership and category.
func equip_item(character_id: String, item_instance_id: String, target_slot: String) -> Dictionary:
	if _mutate_busy:
		return _fail("Equipment mutation already in progress")
	var iid := item_instance_id.strip_edges()
	var slot := target_slot.strip_edges()
	if iid.is_empty() or slot.is_empty():
		return _fail("item_instance_id and target_slot are required")
	if SLOT_IDS.find(slot) < 0:
		return _fail("Unknown equipment slot")

	_mutate_busy = true
	_set_mutating(true)

	var cid := _resolve_character_id(character_id)
	var payload := {
		"character_id": cid,
		"item_instance_id": iid,
		"target_slot": slot,
		"request_id": _new_request_id("equip"),
	}
	var res: Dictionary = await NakamaManager.invoke_rpc(RPC_EQUIP, payload)
	_mutate_busy = false
	_set_mutating(false)

	return _apply_mutation_response(res, true)


## Unequip whatever is in target_slot into the bag (server enforces bag capacity).
func unequip_item(character_id: String, target_slot: String) -> Dictionary:
	if _mutate_busy:
		return _fail("Equipment mutation already in progress")
	var slot := target_slot.strip_edges()
	if slot.is_empty():
		return _fail("target_slot is required")
	if SLOT_IDS.find(slot) < 0:
		return _fail("Unknown equipment slot")

	_mutate_busy = true
	_set_mutating(true)

	var cid := _resolve_character_id(character_id)
	var payload := {
		"character_id": cid,
		"target_slot": slot,
		"request_id": _new_request_id("unequip"),
	}
	var res: Dictionary = await NakamaManager.invoke_rpc(RPC_UNEQUIP, payload)
	_mutate_busy = false
	_set_mutating(false)

	return _apply_mutation_response(res, false)


## Convenience: unequip by instance id (resolves slot from cached equipment or a fresh load).
func unequip_by_instance(character_id: String, item_instance_id: String) -> Dictionary:
	var iid := item_instance_id.strip_edges()
	if iid.is_empty():
		return _fail("item_instance_id is required")
	var slot := _find_slot_for_instance(iid)
	if slot.is_empty():
		await load_equipment(character_id)
		slot = _find_slot_for_instance(iid)
	if slot.is_empty():
		return _fail("Item is not equipped")
	return await unequip_item(character_id, slot)


## Convenience for UI that still knows Node item type as the slot id.
func equip_from_bag(item_instance_id: String, item_type: String, character_id: String = "") -> Dictionary:
	return await equip_item(character_id, item_instance_id, item_type)


## UI-facing equipped list from Nakama slots (authoritative after Phase 11).
func list_equipped_items(character_id: String = "") -> Dictionary:
	var nakama_res: Dictionary = await load_equipment(character_id)
	if not nakama_res.get("success", false):
		return {
			"ok": false,
			"status": int(nakama_res.get("status_code", 0)),
			"error": str(nakama_res.get("error", "Equipment load failed")),
			"data": [],
			"nakama_ok": false,
			"nakama_equipment": nakama_equipment,
		}

	var equipped: Array = []
	var slots: Variant = nakama_equipment.get("slots", {})
	if typeof(slots) == TYPE_DICTIONARY:
		for slot_id in SLOT_IDS:
			var piece: Variant = (slots as Dictionary).get(slot_id, null)
			if typeof(piece) != TYPE_DICTIONARY:
				continue
			var row: Dictionary = (piece as Dictionary).duplicate(true)
			row["type"] = slot_id
			row["is_equipped"] = true
			row["id"] = str(row.get("instance_id", ""))
			equipped.append(row)

	return {
		"ok": true,
		"status": 200,
		"error": "",
		"data": equipped,
		"nakama_ok": true,
		"nakama_equipment": nakama_equipment,
	}


func _apply_mutation_response(res: Dictionary, is_equip: bool) -> Dictionary:
	if typeof(res) != TYPE_DICTIONARY:
		var bad := _fail("Malformed equipment mutation response")
		equipment_error.emit(str(bad.error))
		return bad

	if not bool(res.get("success", false)):
		var err := str(res.get("error", "Equipment mutation failed"))
		equipment_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status_code", 0)),
		}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		var malformed := _fail("Malformed equipment mutation data")
		equipment_error.emit(str(malformed.error))
		return malformed

	var eq: Variant = (data as Dictionary).get("equipment", {})
	var inv: Variant = (data as Dictionary).get("inventory", {})
	if typeof(eq) == TYPE_DICTIONARY:
		nakama_equipment = (eq as Dictionary).duplicate(true)
		equipment_changed.emit(nakama_equipment)
	if typeof(inv) == TYPE_DICTIONARY and InventoryManager != null:
		InventoryManager.apply_nakama_inventory(inv as Dictionary)

	if is_equip:
		item_equipped.emit(nakama_equipment, inv if typeof(inv) == TYPE_DICTIONARY else {})
	else:
		item_unequipped.emit(nakama_equipment, inv if typeof(inv) == TYPE_DICTIONARY else {})

	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": data,
		"status_code": int(res.get("status_code", 200)),
	}


func _find_slot_for_instance(instance_id: String) -> String:
	var slots: Variant = nakama_equipment.get("slots", {})
	if typeof(slots) != TYPE_DICTIONARY:
		return ""
	for slot_id in SLOT_IDS:
		var piece: Variant = (slots as Dictionary).get(slot_id, null)
		if typeof(piece) == TYPE_DICTIONARY and str(piece.get("instance_id", "")) == instance_id:
			return slot_id
	return ""


func _resolve_character_id(character_id: String) -> String:
	var cid := character_id.strip_edges()
	if cid.is_empty():
		cid = str(GameManager.active_character.get("id", ""))
	if cid.is_empty() and ProfileManager != null:
		cid = str(ProfileManager.profile.get("selected_character_id", ""))
	return cid


func _new_request_id(prefix: String) -> String:
	return "%s-%s-%d" % [prefix, str(Time.get_unix_time_from_system()), randi()]


func _set_loading(value: bool) -> void:
	if loading == value:
		return
	loading = value
	loading_changed.emit(loading)


func _set_mutating(value: bool) -> void:
	if mutating == value:
		return
	mutating = value
	mutation_state_changed.emit(mutating)


func _fail(error: String, status_code: int = 0) -> Dictionary:
	return {
		"ok": false,
		"success": false,
		"error": error,
		"data": {},
		"status_code": status_code,
	}
