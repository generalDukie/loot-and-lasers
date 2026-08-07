extends CanvasLayer
## Coach-mark overlay — dims UI, highlights meta tutorial targets, shows step copy.

var _dim_top: ColorRect
var _dim_bottom: ColorRect
var _dim_left: ColorRect
var _dim_right: ColorRect
var _ring: Panel
var _card: PanelContainer
var _title: Label
var _progress: Label
var _body: Label
var _btn_back: Button
var _btn_next: Button
var _btn_skip: Button
var _measure_timer: Timer


func _ready() -> void:
	layer = 128
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build()
	visible = false
	if not TutorialManager.tutorial_changed.is_connected(_on_tutorial_changed):
		TutorialManager.tutorial_changed.connect(_on_tutorial_changed)
	_on_tutorial_changed(TutorialManager.tutorial)


func _build() -> void:
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	_dim_top = _make_dim(root)
	_dim_bottom = _make_dim(root)
	_dim_left = _make_dim(root)
	_dim_right = _make_dim(root)

	_ring = Panel.new()
	_ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ring_sb := StyleBoxFlat.new()
	ring_sb.bg_color = Color(0, 0, 0, 0)
	ring_sb.set_border_width_all(2)
	ring_sb.border_color = Color(0.05, 0.85, 0.95, 0.95)
	ring_sb.set_corner_radius_all(10)
	ring_sb.shadow_color = Color(0.05, 0.85, 0.95, 0.35)
	ring_sb.shadow_size = 12
	_ring.add_theme_stylebox_override("panel", ring_sb)
	root.add_child(_ring)

	_card = PanelContainer.new()
	_card.custom_minimum_size = Vector2(340, 0)
	var card_sb := StyleBoxFlat.new()
	card_sb.bg_color = Color(0.06, 0.08, 0.14, 0.97)
	card_sb.set_border_width_all(1)
	card_sb.border_color = Color(0.2, 0.55, 0.65, 0.55)
	card_sb.set_corner_radius_all(14)
	card_sb.content_margin_left = 16
	card_sb.content_margin_right = 16
	card_sb.content_margin_top = 14
	card_sb.content_margin_bottom = 14
	_card.add_theme_stylebox_override("panel", card_sb)
	root.add_child(_card)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	_card.add_child(v)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	v.add_child(head)

	var head_col := VBoxContainer.new()
	head_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(head_col)

	_progress = Label.new()
	_progress.add_theme_font_size_override("font_size", 10)
	_progress.add_theme_color_override("font_color", Color(0.45, 0.85, 0.95, 0.85))
	ClientUi.apply_display_font(_progress)
	head_col.add_child(_progress)

	_title = Label.new()
	_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_title.add_theme_font_size_override("font_size", 16)
	_title.add_theme_color_override("font_color", Color(0.95, 0.97, 1.0))
	ClientUi.apply_display_font(_title)
	head_col.add_child(_title)

	_btn_skip = Button.new()
	_btn_skip.text = "Skip Tutorial"
	_btn_skip.focus_mode = Control.FOCUS_NONE
	_btn_skip.pressed.connect(func () -> void: TutorialManager.skip())
	head.add_child(_btn_skip)

	_body = Label.new()
	_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.add_theme_font_size_override("font_size", 12)
	_body.add_theme_color_override("font_color", Color(0.7, 0.75, 0.82))
	v.add_child(_body)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 10)
	v.add_child(actions)

	_btn_back = Button.new()
	_btn_back.text = "Back"
	_btn_back.focus_mode = Control.FOCUS_NONE
	_btn_back.pressed.connect(func () -> void: TutorialManager.go_back())
	actions.add_child(_btn_back)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_child(spacer)

	_btn_next = Button.new()
	_btn_next.text = "Next"
	_btn_next.focus_mode = Control.FOCUS_NONE
	_btn_next.pressed.connect(func () -> void: TutorialManager.go_next())
	actions.add_child(_btn_next)

	_measure_timer = Timer.new()
	_measure_timer.wait_time = 0.25
	_measure_timer.timeout.connect(_layout_spotlight)
	add_child(_measure_timer)


func _make_dim(parent: Control) -> ColorRect:
	var r := ColorRect.new()
	r.color = Color(0.01, 0.02, 0.07, 0.72)
	r.mouse_filter = Control.MOUSE_FILTER_STOP
	parent.add_child(r)
	return r


func _on_tutorial_changed(_t: Dictionary) -> void:
	if not TutorialManager.should_show():
		visible = false
		_measure_timer.stop()
		return
	visible = true
	_refresh_copy()
	_layout_spotlight()
	if _measure_timer.is_stopped():
		_measure_timer.start()


func _refresh_copy() -> void:
	var t := TutorialManager.tutorial
	var step := TutorialManager.current_step()
	_progress.text = "OPERATIVE BRIEFING · STEP %s OF %s" % [
		str(t.get("step_index", 1)),
		str(t.get("step_total", 8)),
	]
	_title.text = str(step.get("title", "Tutorial"))
	_body.text = str(step.get("body", ""))
	_btn_next.text = TutorialManager.primary_label()
	_btn_back.disabled = TutorialManager.step_id() == "welcome" or TutorialManager.busy
	_btn_next.disabled = TutorialManager.busy
	_btn_skip.disabled = TutorialManager.busy


func _layout_spotlight() -> void:
	if not visible:
		return
	_refresh_copy()
	var vp := get_viewport().get_visible_rect().size
	var sid := TutorialManager.spotlight_id()
	var hole := Rect2()
	var has_hole := false
	if not sid.is_empty():
		var target := _find_tutorial_target(sid)
		if target != null and is_instance_valid(target):
			var gr: Rect2 = target.get_global_rect()
			hole = Rect2(gr.position - Vector2(8, 8), gr.size + Vector2(16, 16))
			has_hole = true

	if not has_hole:
		_dim_top.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_dim_top.visible = true
		_dim_bottom.visible = false
		_dim_left.visible = false
		_dim_right.visible = false
		_ring.visible = false
		_card.position = Vector2(maxi(16, int(vp.x * 0.5 - 170)), maxi(16, int(vp.y * 0.5 - 110)))
		return

	_dim_bottom.visible = true
	_dim_left.visible = true
	_dim_right.visible = true
	_dim_top.visible = true
	_dim_top.position = Vector2.ZERO
	_dim_top.size = Vector2(vp.x, hole.position.y)
	_dim_bottom.position = Vector2(0, hole.end.y)
	_dim_bottom.size = Vector2(vp.x, maxf(0.0, vp.y - hole.end.y))
	_dim_left.position = Vector2(0, hole.position.y)
	_dim_left.size = Vector2(hole.position.x, hole.size.y)
	_dim_right.position = Vector2(hole.end.x, hole.position.y)
	_dim_right.size = Vector2(maxf(0.0, vp.x - hole.end.x), hole.size.y)

	_ring.visible = true
	_ring.position = hole.position
	_ring.size = hole.size

	var card_y := hole.end.y + 14.0
	if card_y + 200.0 > vp.y:
		card_y = maxf(16.0, hole.position.y - 200.0)
	var card_x := clampf(hole.position.x, 16.0, maxf(16.0, vp.x - 356.0))
	_card.position = Vector2(card_x, card_y)


func _find_tutorial_target(sid: String) -> Control:
	var tree := get_tree()
	if tree == null:
		return null
	var nodes := tree.get_nodes_in_group("tutorial_target")
	for n in nodes:
		if n is Control and str(n.get_meta("tutorial_id", "")) == sid:
			return n as Control
	return null
