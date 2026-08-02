extends SceneTree
## 1) Reload every .gd  2) Instantiate every .tscn without entering tree.


func _initialize() -> void:
	var scripts: PackedStringArray = _collect("res://", ".gd")
	var scenes: PackedStringArray = _collect("res://", ".tscn")
	var script_fails: Array = []
	var scene_fails: Array = []

	print("AUDIT_SCRIPTS=%s" % scripts.size())
	for path in scripts:
		if path.begins_with("res://.godot/") or path.get_file().begins_with("_"):
			continue
		var res: Resource = ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_IGNORE)
		if res == null:
			script_fails.append(path)
			print("SCRIPT_FAIL %s" % path)

	print("AUDIT_SCENES=%s" % scenes.size())
	for path in scenes:
		if path.begins_with("res://.godot/") or path.get_file().begins_with("_"):
			continue
		var packed: PackedScene = ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_IGNORE) as PackedScene
		if packed == null:
			scene_fails.append(path)
			print("SCENE_FAIL_LOAD %s" % path)
			continue
		var node: Node = packed.instantiate()
		if node == null:
			scene_fails.append(path)
			print("SCENE_FAIL_INST %s" % path)
			continue
		# Not added to tree — _ready / awaits do not run.
		node.free()

	print("SCRIPT_FAIL_COUNT=%s" % script_fails.size())
	print("SCENE_FAIL_COUNT=%s" % scene_fails.size())
	if script_fails.is_empty() and scene_fails.is_empty():
		print("AUDIT_OK")
		quit(0)
	else:
		print("AUDIT_BAD")
		quit(1)


func _collect(dir_path: String, suffix: String) -> PackedStringArray:
	var out: PackedStringArray = []
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return out
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if name.begins_with("."):
			name = dir.get_next()
			continue
		var full := dir_path.path_join(name)
		if dir.current_is_dir():
			if name == ".godot":
				name = dir.get_next()
				continue
			out.append_array(_collect(full, suffix))
		elif name.ends_with(suffix):
			out.append(full)
		name = dir.get_next()
	dir.list_dir_end()
	return out
