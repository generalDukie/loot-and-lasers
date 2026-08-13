extends CanvasLayer
class_name StationLoadingOverlay
## Full-screen station loading veil that lives on the viewport root so the
## spinner keeps turning across character-select → game-shell scene changes.

const SPIN_SEC := 0.9
const LAYER_NAME := "StationLoadingOverlay"

var _status: Label
var _spinner: TextureRect
var _spinning := false


static func instance() -> StationLoadingOverlay:
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null or tree.root == null:
		return null
	var existing := tree.root.get_node_or_null(LAYER_NAME)
	if existing is StationLoadingOverlay:
		return existing as StationLoadingOverlay
	var overlay := StationLoadingOverlay.new()
	overlay.name = LAYER_NAME
	overlay.layer = 120
	tree.root.add_child(overlay)
	return overlay


static func show_loading(message: String) -> void:
	var overlay := instance()
	if overlay == null:
		return
	overlay._ensure_ui()
	overlay._set_message(message)
	overlay.visible = true
	overlay._start_spin()


static func set_message(message: String) -> void:
	var overlay := instance()
	if overlay == null:
		return
	overlay._set_message(message)


static func hide_loading() -> void:
	var overlay := instance()
	if overlay == null:
		return
	overlay._stop_spin()
	overlay.visible = false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 120
	visible = false
	_ensure_ui()


func _process(delta: float) -> void:
	if not _spinning or not is_instance_valid(_spinner):
		return
	_sync_spinner_pivot()
	_spinner.rotation += delta * (TAU / SPIN_SEC)


func _ensure_ui() -> void:
	if get_child_count() > 0:
		return
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(root)
	root.add_child(ClientUi.make_space_splash_bg("void"))
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(center)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 16)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(col)
	var title := Label.new()
	title.text = "LOOT & LASERS"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 32)
	title.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(title)
	col.add_child(title)
	var spinner_host := CenterContainer.new()
	spinner_host.custom_minimum_size = Vector2(56, 56)
	spinner_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(spinner_host)
	_spinner = UiIcon.make("loader-circle", ClientUi.CYAN, 40.0)
	_spinner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spinner.resized.connect(_sync_spinner_pivot)
	spinner_host.add_child(_spinner)
	_sync_spinner_pivot()
	_status = Label.new()
	_status.text = "Entering station…"
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.add_theme_font_size_override("font_size", 18)
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_status)
	col.add_child(_status)


func _set_message(message: String) -> void:
	_ensure_ui()
	if is_instance_valid(_status):
		_status.text = message


func _start_spin() -> void:
	_ensure_ui()
	if is_instance_valid(_spinner):
		_spinner.rotation = 0.0
		_sync_spinner_pivot()
	_spinning = true
	set_process(true)


func _stop_spin() -> void:
	_spinning = false
	set_process(false)
	if is_instance_valid(_spinner):
		_spinner.rotation = 0.0


func _sync_spinner_pivot() -> void:
	if not is_instance_valid(_spinner):
		return
	var sz := _spinner.size
	if sz.x <= 1.0 or sz.y <= 1.0:
		sz = _spinner.custom_minimum_size
	_spinner.pivot_offset = sz * 0.5
