extends SceneTree
## Load Admin Console after the project/autoloads finish booting.


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var am := root.get_node_or_null("AdminManager")
	if am == null:
		push_error("AdminManager autoload missing at runtime")
		quit(1)
		return
	var packed: PackedScene = load("res://Scenes/UI/admin.tscn") as PackedScene
	if packed == null:
		push_error("admin.tscn failed to load")
		quit(1)
		return
	var node: Node = packed.instantiate()
	if node == null:
		push_error("admin.tscn failed to instantiate")
		quit(1)
		return
	if node.get_script() == null:
		push_error("admin.gd script not attached/compiled")
		quit(1)
		return
	root.add_child(node)
	print("test_admin_ui_load: PASS")
	quit(0)
