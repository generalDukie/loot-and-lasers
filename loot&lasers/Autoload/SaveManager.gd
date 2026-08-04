extends Node
## Local presentation helpers only (Restoration 25).
## Authoritative gameplay state lives on the Node backend.
## Never upload slot files as recovery authority.

const SAVE_DIR := "user://saves/"
## Intentionally unavailable — gameplay saves are not client-authoritative.
const GAMEPLAY_SAVE_ENABLED := false


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)
	print("[SaveManager] ready (gameplay saves disabled — Node is authority)")


func has_save(slot: String = "default") -> bool:
	return FileAccess.file_exists(_slot_path(slot))


func save_game(_data: Dictionary, slot: String = "default") -> Error:
	push_warning(
		"SaveManager.save_game refused — Node owns authoritative gameplay state (%s)" % slot
	)
	return ERR_UNAVAILABLE


func load_game(slot: String = "default") -> Dictionary:
	push_warning(
		"SaveManager.load_game returns empty — rehydrate from Node, never treat local as authority (%s)" % slot
	)
	return {}


func delete_save(slot: String = "default") -> Error:
	var path := _slot_path(slot)
	if not FileAccess.file_exists(path):
		return OK
	return DirAccess.remove_absolute(path)


## Clear any legacy local slot files so they cannot be mistaken for authority.
func clear_legacy_gameplay_slots() -> void:
	var dir := DirAccess.open(SAVE_DIR)
	if dir == null:
		return
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if not dir.current_is_dir() and name.ends_with(".save"):
			dir.remove(name)
		name = dir.get_next()
	dir.list_dir_end()


func _slot_path(slot: String) -> String:
	return SAVE_DIR.path_join("%s.save" % slot)
