extends Node
## Phase 6 — Read-only Nakama equipment snapshot (no equip/unequip/grants).
## Live Hero / Inventory UI still uses Node Item.is_equipped via StatsManager / AuthManager.
## Architecture: Hero → EquipmentManager → equipment_get → modules/equipment.lua → storage.

signal equipment_changed(equipment: Dictionary)
signal equipment_error(error: String)
signal loading_changed(loading: bool)

const RPC_GET := "equipment_get"

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

## Last successful Nakama equipment record (read-only). Node remains live SoT for UI gear.
var nakama_equipment: Dictionary = {}
var loading := false

var _load_busy := false


func _ready() -> void:
	print("[EquipmentManager] ready (read-only equipment_get)")


func has_equipment() -> bool:
	return typeof(nakama_equipment.get("slots", null)) == TYPE_DICTIONARY


func clear_local() -> void:
	nakama_equipment = {}


func get_slot(slot_id: String) -> Variant:
	var slots: Variant = nakama_equipment.get("slots", {})
	if typeof(slots) != TYPE_DICTIONARY:
		return null
	return (slots as Dictionary).get(slot_id, null)


## Load Nakama equipment for the selected character (or explicit character_id).
## Missing records → empty slots (no server write). Never copies Node Items / equipped_items.
func load_equipment(character_id: String = "") -> Dictionary:
	if _load_busy:
		return _fail("Equipment load already in progress")
	_load_busy = true
	_set_loading(true)

	var cid := character_id.strip_edges()
	if cid.is_empty():
		cid = str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		cid = str(ProfileManager.profile.get("selected_character_id", "")) if ProfileManager != null else ""

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
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": nakama_equipment,
		"status_code": int(res.get("status_code", 200)),
	}


## UI-facing equipped list: Node Items remain authoritative for rendering this phase.
## Also refreshes the Nakama read-only snapshot (failures are non-fatal to Node list).
func list_equipped_items(character_id: String = "") -> Dictionary:
	var nakama_res: Dictionary = await load_equipment(character_id)
	if not nakama_res.get("success", false):
		print("[EquipmentManager] WARNING: Nakama equipment_get — %s" % str(nakama_res.get("error", "")))

	var node_res: Dictionary = await AuthManager.list_items(character_id)
	if typeof(node_res) != TYPE_DICTIONARY:
		return {"ok": false, "status": 0, "error": "Malformed item list", "data": []}

	var equipped: Array = []
	if node_res.get("ok", false) and typeof(node_res.get("data", null)) == TYPE_ARRAY:
		for it in node_res.data:
			if typeof(it) != TYPE_DICTIONARY:
				continue
			if bool(it.get("is_equipped", false)) and InventoryRules.is_equippable(str(it.get("type", ""))):
				equipped.append(it)

	return {
		"ok": bool(node_res.get("ok", false)),
		"status": int(node_res.get("status", 0)),
		"error": str(node_res.get("error", "")),
		"data": equipped,
		"nakama_ok": bool(nakama_res.get("success", false)),
		"nakama_equipment": nakama_equipment,
	}


func _set_loading(value: bool) -> void:
	if loading == value:
		return
	loading = value
	loading_changed.emit(loading)


func _fail(error: String, status_code: int = 0) -> Dictionary:
	return {
		"ok": false,
		"success": false,
		"error": error,
		"data": {},
		"status_code": status_code,
	}
