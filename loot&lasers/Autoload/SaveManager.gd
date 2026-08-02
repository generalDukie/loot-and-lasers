extends Node
## Local and remote persistence entry point.
## No save format yet — stubs for future character / settings / cloud sync.

const SAVE_DIR := "user://saves/"


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)
	print("[SaveManager] ready")


func has_save(slot: String = "default") -> bool:
	return FileAccess.file_exists(_slot_path(slot))


func save_game(_data: Dictionary, slot: String = "default") -> Error:
	# Intentionally empty foundation — implement serialization later.
	push_warning("SaveManager.save_game is not implemented yet (%s)" % slot)
	return ERR_UNAVAILABLE


func load_game(slot: String = "default") -> Dictionary:
	# Intentionally empty foundation — implement deserialization later.
	push_warning("SaveManager.load_game is not implemented yet (%s)" % slot)
	return {}


func delete_save(slot: String = "default") -> Error:
	var path := _slot_path(slot)
	if not FileAccess.file_exists(path):
		return OK
	return DirAccess.remove_absolute(path)


func _slot_path(slot: String) -> String:
	return SAVE_DIR.path_join("%s.save" % slot)
