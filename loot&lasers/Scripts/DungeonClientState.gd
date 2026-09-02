class_name DungeonClientState
extends RefCounted
## Client-owned Dungeon view + skip request IDs. Not server character data.

const SELECTOR_DUNGEON := "dungeon"
const SELECTOR_WORMHOLE := "wormhole"
const REQUEST_ID_RANDOM_RANGE := 100_000

var character_id := ""
var view: Dictionary = {}
var dungeon_skip_id := ""
var wormhole_skip_id := ""


func clear() -> void:
	character_id = ""
	view = {}
	dungeon_skip_id = ""
	wormhole_skip_id = ""


func apply_dungeon_sync(next_character_id: String, dungeon: Dictionary) -> void:
	var cid := next_character_id.strip_edges()
	if cid.is_empty() or dungeon.is_empty():
		return
	character_id = cid
	view = dungeon.duplicate(true)


func apply_character_refresh(character: Dictionary) -> void:
	var cid := str(character.get("id", "")).strip_edges()
	if cid.is_empty():
		clear()
		return
	if not character_id.is_empty() and character_id != cid:
		clear()
		return
	character_id = cid


func blob_for(character: Dictionary = {}) -> Dictionary:
	var cid := str(character.get("id", "")).strip_edges()
	if cid.is_empty():
		cid = character_id
	if not view.is_empty() and not character_id.is_empty() and character_id == cid:
		return view
	var nested: Variant = character.get("dungeon", {})
	if typeof(nested) == TYPE_DICTIONARY:
		return nested
	return {}


func begin_skip(selector: String) -> String:
	if selector == SELECTOR_WORMHOLE:
		if wormhole_skip_id.is_empty():
			wormhole_skip_id = _new_request_id("wh-skip")
		return wormhole_skip_id
	if dungeon_skip_id.is_empty():
		dungeon_skip_id = _new_request_id("d-skip")
	return dungeon_skip_id


func complete_skip(selector: String, res: Dictionary) -> void:
	if DungeonRules.skip_request_id_should_retain(res):
		return
	if selector == SELECTOR_WORMHOLE:
		wormhole_skip_id = ""
	else:
		dungeon_skip_id = ""


func pending_skip_id(selector: String) -> String:
	if selector == SELECTOR_WORMHOLE:
		return wormhole_skip_id
	return dungeon_skip_id


func _new_request_id(prefix: String) -> String:
	return "%s-%d-%d" % [prefix, int(Time.get_unix_time_from_system()), randi() % REQUEST_ID_RANDOM_RANGE]
