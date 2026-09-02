class_name StatusLine
extends Label
## Transient page caption. Never contributes height to Containers, so showing
## "Preparing encounter…" cannot reflow the rest of the page.

const OVERLAY_Z_INDEX := 80
const OVERLAY_TOP_PX := 12
const OVERLAY_HEIGHT_PX := 52
const OVERLAY_SIDE_RATIO := 0.08
const FONT_OUTLINE_SIZE := 8
const OVERLAY_FONT_DELTA := 6
const FADE_OUT_MS := 1000
const MILLISECONDS_PER_SECOND := 1000

var overlay := true
var _mounting := false
var _held_text := ""
var _fading := false
var _suppress_vis := false
var _fade: Tween


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if overlay:
		_apply_overlay_font()
		set_process(true)
		call_deferred("_mount_overlay")


func _process(_delta: float) -> void:
	if not overlay:
		return
	var raw := text
	var filled := not raw.strip_edges().is_empty()
	if _fading:
		if not filled:
			text = _held_text
		elif raw != _held_text:
			_start_fade(raw)
			return
		_set_visible_silent(true)
		return
	if not filled:
		return
	_start_fade(raw)


func _get_minimum_size() -> Vector2:
	# Label does not define this virtual in GDScript, so `super` cannot be called.
	# StatusLine is an overlay caption and must never contribute Container height.
	return Vector2.ZERO


func _notification(what: int) -> void:
	if what == NOTIFICATION_PARENTED and overlay and not _mounting:
		if get_parent() is Container:
			call_deferred("_mount_overlay")


func _mount_overlay() -> void:
	if not overlay or not is_inside_tree():
		return
	var host := _find_overlay_host()
	if host == null:
		return
	_mounting = true
	if get_parent() != host:
		reparent(host)
	_mounting = false
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = OVERLAY_Z_INDEX
	set_anchors_preset(Control.PRESET_CENTER_TOP)
	anchor_left = OVERLAY_SIDE_RATIO
	anchor_right = 1.0 - OVERLAY_SIDE_RATIO
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	offset_left = 0.0
	offset_right = 0.0
	offset_top = float(ClientUi.px(OVERLAY_TOP_PX))
	offset_bottom = offset_top + float(ClientUi.px(OVERLAY_HEIGHT_PX))
	horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_theme_constant_override("outline_size", FONT_OUTLINE_SIZE)
	add_theme_color_override("font_outline_color", Color(0.02, 0.03, 0.06, 0.92))
	_apply_overlay_font()


func _apply_overlay_font() -> void:
	add_theme_font_size_override("font_size", ClientUi.BODY_FS + OVERLAY_FONT_DELTA)


func _start_fade(caption: String) -> void:
	_held_text = caption
	text = caption
	_fading = true
	_set_visible_silent(true)
	modulate.a = 1.0
	_kill_fade()
	var tree := get_tree()
	if tree == null:
		_finish_hide()
		return
	# SceneTree tween — node-bound tweens pause while the label is hidden.
	_fade = tree.create_tween()
	_fade.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	_fade.set_trans(Tween.TRANS_SINE)
	_fade.set_ease(Tween.EASE_IN)
	_fade.tween_property(
		self,
		"modulate:a",
		0.0,
		float(FADE_OUT_MS) / float(MILLISECONDS_PER_SECOND)
	)
	_fade.finished.connect(_finish_hide)


func _finish_hide() -> void:
	_kill_fade()
	_fading = false
	_held_text = ""
	text = ""
	modulate.a = 1.0
	_set_visible_silent(false)


func _kill_fade() -> void:
	if _fade != null:
		_fade.kill()
		_fade = null


func _set_visible_silent(on: bool) -> void:
	if visible == on:
		return
	_suppress_vis = true
	visible = on
	_suppress_vis = false


func _find_overlay_host() -> Control:
	var node: Node = self
	while node != null:
		if node is Control and not (node is Container):
			var script: Script = (node as Control).get_script()
			if script != null:
				var path := str(script.resource_path)
				if path.contains("Scenes/UI/") or path.contains("Scenes/Main/"):
					return node as Control
		node = node.get_parent()
	return null
