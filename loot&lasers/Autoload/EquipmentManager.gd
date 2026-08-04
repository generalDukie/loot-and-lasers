extends Node
## Equipment presentation — Node Item rows are the sole authority.
## Nakama equipment_* RPCs are disabled on the Godot client.

signal equipment_loaded(equipment: Dictionary)
signal item_equipped(equipment: Dictionary, inventory: Dictionary)
signal item_unequipped(equipment: Dictionary, inventory: Dictionary)
signal equipment_changed(equipment: Dictionary)
signal equipment_error(error: String)
signal loading_changed(loading: bool)
signal mutation_state_changed(mutating: bool)

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

## Cached Node-derived slot map (presentation only).
var nakama_equipment: Dictionary = {}
var loading := false
var mutating := false

var _load_busy := false
var _mutate_busy := false


func _ready() -> void:
	print("[EquipmentManager] ready (Node Item authority — Nakama equipment RPCs blocked)")


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
	var items_res: Dictionary = await AuthManager.list_items(cid)
	_load_busy = false
	_set_loading(false)

	if not bool(items_res.get("ok", false)) or typeof(items_res.get("data", null)) != TYPE_ARRAY:
		var err := str(items_res.get("error", "Equipment load failed"))
		equipment_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(items_res.get("status", 0)),
		}

	var slots: Dictionary = {}
	for it in items_res.data:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if not bool(it.get("is_equipped", false)):
			continue
		var slot := str(it.get("type", "")).strip_edges()
		if SLOT_IDS.find(slot) < 0:
			continue
		slots[slot] = (it as Dictionary).duplicate(true)

	nakama_equipment = {
		"character_id": cid,
		"slots": slots,
		"source": "node_items",
	}
	equipment_changed.emit(nakama_equipment)
	equipment_loaded.emit(nakama_equipment)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": nakama_equipment,
		"status_code": 200,
	}


## Mutations must use AuthManager.equip_item / unequip_item (Node EquipItem/UnequipItem).
func equip_item(_character_id: String, _item_instance_id: String, _target_slot: String) -> Dictionary:
	return _fail_mutation("Use AuthManager.equip_item — Nakama equipment_equip is disabled")


func unequip_item(_character_id: String, _target_slot: String) -> Dictionary:
	return _fail_mutation("Use AuthManager.unequip_item — Nakama equipment_unequip is disabled")


func unequip_by_instance(_character_id: String, _item_instance_id: String) -> Dictionary:
	return _fail_mutation("Use AuthManager.unequip_item — Nakama equipment_unequip is disabled")


func equip_from_bag(_item_instance_id: String, _item_type: String, _character_id: String = "") -> Dictionary:
	return _fail_mutation("Use AuthManager.equip_item — Nakama equipment_equip is disabled")


func list_equipped_items(character_id: String = "") -> Dictionary:
	var node_res: Dictionary = await load_equipment(character_id)
	if not node_res.get("success", false):
		return {
			"ok": false,
			"status": int(node_res.get("status_code", 0)),
			"error": str(node_res.get("error", "Equipment load failed")),
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
			if str(row.get("id", "")).is_empty():
				row["id"] = str(row.get("instance_id", ""))
			equipped.append(row)

	return {
		"ok": true,
		"status": 200,
		"error": "",
		"data": equipped,
		"nakama_ok": false,
		"nakama_equipment": nakama_equipment,
	}


func _resolve_character_id(character_id: String) -> String:
	var cid := character_id.strip_edges()
	if cid.is_empty() and GameManager != null:
		cid = GameManager.selected_character_id()
	return cid


func _set_loading(value: bool) -> void:
	if loading == value:
		return
	loading = value
	loading_changed.emit(loading)


func _fail_mutation(error: String) -> Dictionary:
	equipment_error.emit(error)
	return _fail(error, 410)


func _fail(error: String, status_code: int = 0) -> Dictionary:
	return {
		"ok": false,
		"success": false,
		"error": error,
		"data": {},
		"status_code": status_code,
	}
