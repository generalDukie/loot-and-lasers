extends CanvasLayer
## Large page-aware coach overlay — dims UI, spotlights tutorial targets, never covers the hole.

const CARD_W := 540.0
const CARD_PAD := 20.0
const HOLE_PAD := 10.0
const POINTER_INSET := 8.0
const POINTER_SPAN := 46.0
const POINTER_CARD_GAP := 12.0
const CARD_HOLE_GAP := POINTER_INSET + POINTER_SPAN + POINTER_CARD_GAP
const DIM_ALPHA := 0.58
const DIM_OVERLAP := 1.0
const RING_BORDER := Color(0.05, 0.85, 0.95, 0.98)

var _dim_top: ColorRect
var _dim_bottom: ColorRect
var _dim_left: ColorRect
var _dim_right: ColorRect
var _ring: Panel
var _ring_extra: Panel
var _card: PanelContainer
var _title: Label
var _body: RichTextLabel
var _btn_back: Button
var _btn_next: Button
var _btn_skip: Button
var _pointer: Label
var _measure_timer: Timer
var _ring_pulse: Tween
var _ring_extra_pulse: Tween
var _skip_sheet: Control
var _fuel_flash_tween: Tween
var _fuel_flash_target: Control
var _timer_flash_tween: Tween
var _timer_flash_target: Control
var _helmet_flash_tween: Tween
var _helmet_flash_target: Control
var _stim_flash_tween: Tween
var _stim_flash_target: Control
var _ranks_flash_tween: Tween
var _ranks_flash_target: Control
var _start_flash_tween: Tween
var _start_flash_target: Control


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
	ring_sb.set_border_width_all(3)
	ring_sb.border_color = Color(0.05, 0.85, 0.95, 0.98)
	ring_sb.set_corner_radius_all(12)
	ring_sb.shadow_size = 0
	_ring.add_theme_stylebox_override("panel", ring_sb)
	root.add_child(_ring)

	_ring_extra = Panel.new()
	_ring_extra.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ring_extra_sb := ring_sb.duplicate() as StyleBoxFlat
	_ring_extra.add_theme_stylebox_override("panel", ring_extra_sb)
	root.add_child(_ring_extra)
	_ring_extra.visible = false

	_card = PanelContainer.new()
	_card.custom_minimum_size = Vector2(CARD_W, 0)
	_card.mouse_filter = Control.MOUSE_FILTER_STOP
	var card_sb := StyleBoxFlat.new()
	card_sb.bg_color = Color(0.04, 0.07, 0.14, 0.98)
	card_sb.set_border_width_all(3)
	card_sb.border_color = Color(0.12, 0.78, 0.92, 0.92)
	card_sb.set_corner_radius_all(16)
	card_sb.content_margin_left = 28
	card_sb.content_margin_right = 28
	card_sb.content_margin_top = 24
	card_sb.content_margin_bottom = 24
	card_sb.shadow_color = Color(0.02, 0.55, 0.7, 0.35)
	card_sb.shadow_size = 22
	_card.add_theme_stylebox_override("panel", card_sb)
	root.add_child(_card)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	_card.add_child(v)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	head.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(head)

	var head_col := VBoxContainer.new()
	head_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(head_col)

	_title = Label.new()
	_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_title.add_theme_font_size_override("font_size", 28)
	_title.add_theme_color_override("font_color", Color(0.96, 0.98, 1.0))
	ClientUi.apply_display_font(_title)
	head_col.add_child(_title)

	_btn_skip = Button.new()
	_btn_skip.text = "Skip Tutorial"
	_btn_skip.focus_mode = Control.FOCUS_NONE
	_btn_skip.custom_minimum_size = Vector2(0, 40)
	ClientUi.apply_ghost_button(_btn_skip)
	_btn_skip.add_theme_font_size_override("font_size", 14)
	_btn_skip.pressed.connect(_confirm_skip)
	head.add_child(_btn_skip)

	_body = RichTextLabel.new()
	_body.bbcode_enabled = true
	_body.fit_content = true
	_body.scroll_active = false
	_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.custom_minimum_size.x = CARD_W - 56.0
	_body.add_theme_font_size_override("normal_font_size", 18)
	_body.add_theme_color_override("default_color", Color(0.78, 0.84, 0.90))
	ClientUi.apply_body_font(_body)
	v.add_child(_body)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 12)
	v.add_child(actions)

	_btn_back = Button.new()
	_btn_back.text = "Back"
	_btn_back.focus_mode = Control.FOCUS_NONE
	_btn_back.custom_minimum_size = Vector2(96, 48)
	ClientUi.apply_ghost_button(_btn_back)
	_btn_back.add_theme_font_size_override("font_size", 16)
	_btn_back.pressed.connect(func () -> void: TutorialManager.go_back())
	actions.add_child(_btn_back)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_child(spacer)

	_btn_next = Button.new()
	_btn_next.text = "Continue"
	_btn_next.focus_mode = Control.FOCUS_NONE
	_btn_next.custom_minimum_size = Vector2(220, 52)
	ClientUi.apply_primary_button(_btn_next)
	_btn_next.add_theme_font_size_override("font_size", 18)
	_btn_next.pressed.connect(func () -> void: TutorialManager.go_next())
	actions.add_child(_btn_next)

	_pointer = Label.new()
	_pointer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pointer.add_theme_font_size_override("font_size", 42)
	_pointer.add_theme_color_override("font_color", Color(0.05, 0.9, 0.98, 0.95))
	_pointer.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	_pointer.add_theme_constant_override("shadow_offset_x", 2)
	_pointer.add_theme_constant_override("shadow_offset_y", 2)
	ClientUi.apply_display_font(_pointer)
	root.add_child(_pointer)

	_measure_timer = Timer.new()
	_measure_timer.wait_time = 0.2
	_measure_timer.timeout.connect(_layout_spotlight)
	add_child(_measure_timer)


func _make_dim(parent: Control) -> ColorRect:
	var r := ColorRect.new()
	r.color = Color(0.01, 0.02, 0.07, DIM_ALPHA)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(r)
	return r


func _on_tutorial_changed(_t: Dictionary) -> void:
	if not TutorialManager.should_show():
		_hide_coach()
		_measure_timer.stop()
		return
	if TutorialManager.busy:
		return
	if _measure_timer.is_stopped():
		_measure_timer.start()
	_layout_spotlight()


func _hide_coach() -> void:
	_stop_ring_pulse()
	_stop_extra_ring_pulse()
	_stop_fuel_flash()
	_stop_timer_flash()
	_stop_helmet_flash()
	_stop_stim_flash()
	_stop_ranks_flash()
	_stop_start_flash()
	visible = false
	_dim_top.visible = false
	_dim_bottom.visible = false
	_dim_left.visible = false
	_dim_right.visible = false
	_ring.visible = false
	if is_instance_valid(_ring_extra):
		_ring_extra.visible = false
	if is_instance_valid(_pointer):
		_pointer.visible = false


func _sync_coach_visibility() -> bool:
	if not TutorialManager.should_show() or TutorialManager.busy:
		_hide_coach()
		return false
	if not TutorialManager.coach_visible():
		_hide_coach()
		return false
	if not visible:
		visible = true
		var show_card := TutorialManager.coach_card_visible()
		_card.visible = show_card
		if show_card:
			_refresh_copy()
	return true


func _refresh_copy() -> void:
	var step := TutorialManager.current_step()
	var on_page := TutorialManager.is_on_required_page()
	if TutorialManager.page_is_pending():
		_title.text = str(step.get("title", "Tutorial"))
		_body.text = "Opening %s…" % str(step.get("nav_label", "the next station"))
	elif not on_page and not TutorialManager.is_click_gate():
		var nav := str(step.get("nav_label", "the next station"))
		if nav.is_empty() or nav == "<null>":
			nav = "the next station"
		_title.text = "Click %s" % nav
		_body.text = "Open %s. The next lesson waits until that page is actually open." % nav
	else:
		_title.text = str(step.get("title", "Tutorial"))
		if TutorialManager.step_id() == "mission_fight" and TutorialManager.is_on_required_page():
			var fight := _find_tutorial_target("mission-fight")
			if fight == null or not fight.is_visible_in_tree():
				_title.text = "Skip the Wait"
		_body.text = _body_text_for_step(step)
		if TutorialManager.step_id() == "finish":
			_title.add_theme_font_size_override("font_size", 32)
		else:
			_title.add_theme_font_size_override("font_size", 28)
	var show_next := TutorialManager.shows_primary()
	_btn_next.visible = show_next
	_btn_next.text = TutorialManager.primary_label()
	_btn_next.disabled = not TutorialManager.can_press_primary()
	_btn_back.visible = false
	_btn_skip.disabled = TutorialManager.busy


func _resolved_spotlight_id() -> String:
	if TutorialManager.step_id() == "mission_fight" and TutorialManager.is_on_required_page():
		var fight := _find_tutorial_target("mission-fight")
		if fight != null and is_instance_valid(fight) and fight.is_visible_in_tree():
			return "mission-fight"
		var skip := _find_tutorial_target("mission-skip")
		if skip != null and is_instance_valid(skip) and skip.is_visible_in_tree():
			return "mission-skip"
	if TutorialManager.step_id() == "mission_timer" and TutorialManager.is_on_required_page():
		var timer := _find_tutorial_target("mission-timer")
		if timer != null and is_instance_valid(timer) and timer.is_visible_in_tree():
			return "mission-timer"
	if TutorialManager.step_id() == "hero_equip" and TutorialManager.is_on_required_page():
		var helmet := _find_tutorial_target("hero-bag-helmet")
		if helmet != null and is_instance_valid(helmet) and helmet.is_visible_in_tree():
			return "hero-bag-helmet"
	if TutorialManager.step_id() == "shop_market" and TutorialManager.is_on_required_page():
		var stim := _find_tutorial_target("shop-stim")
		if stim != null and is_instance_valid(stim) and stim.is_visible_in_tree():
			return "shop-stim"
	var primary := TutorialManager.spotlight_id()
	var extra := TutorialManager.extra_spotlight_id()
	if TutorialManager.is_on_required_page():
		if not primary.is_empty() and _find_tutorial_target(primary) != null:
			return primary
		if not extra.is_empty() and _find_tutorial_target(extra) != null:
			return extra
		return primary
	if not primary.is_empty() and _find_tutorial_target(primary) != null:
		return primary
	if not extra.is_empty() and _find_tutorial_target(extra) != null:
		return extra
	return TutorialManager.nav_spotlight_for_page(TutorialManager.required_page())


func _expand_hole_with_target(hole: Rect2, tutorial_id: String) -> Rect2:
	var extra := _find_tutorial_target(tutorial_id)
	if extra == null or not is_instance_valid(extra) or not extra.is_visible_in_tree():
		return hole
	var gr: Rect2 = extra.get_global_rect()
	var extra_hole := Rect2(gr.position - Vector2(HOLE_PAD, HOLE_PAD), gr.size + Vector2(HOLE_PAD * 2.0, HOLE_PAD * 2.0))
	if hole.size.x <= 4.0 or hole.size.y <= 4.0:
		return extra_hole
	return hole.merge(extra_hole)


func _layout_spotlight() -> void:
	if not _sync_coach_visibility():
		return
	if TutorialManager.coach_card_visible():
		_refresh_copy()
	var vp := get_viewport().get_visible_rect().size
	var sid := _resolved_spotlight_id()
	var hole := Rect2()
	var has_hole := false
	if not sid.is_empty():
		var target := _spotlight_target_for(sid)
		if target != null and is_instance_valid(target) and target.is_visible_in_tree():
			var gr: Rect2 = target.get_global_rect()
			hole = Rect2(gr.position - Vector2(HOLE_PAD, HOLE_PAD), gr.size + Vector2(HOLE_PAD * 2.0, HOLE_PAD * 2.0))
			has_hole = hole.size.x > 4.0 and hole.size.y > 4.0
	if has_hole and TutorialManager.step_id() == "hero_equip" and TutorialManager.is_on_required_page():
		hole = _expand_hole_with_target(hole, "hero-doll")

	if not has_hole:
		_dim_top.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_dim_top.visible = true
		_dim_bottom.visible = false
		_dim_left.visible = false
		_dim_right.visible = false
		_ring.visible = false
		if is_instance_valid(_pointer):
			_pointer.visible = false
		if TutorialManager.coach_card_visible():
			_place_card(Rect2(), vp, "center")
		else:
			_card.visible = false
		_layout_secondary_spotlight_ring()
		_update_stim_hint()
		_update_ranks_hint()
		_update_start_hint()
		return

	if not TutorialManager.coach_dims_screen():
		_dim_top.visible = false
		_dim_bottom.visible = false
		_dim_left.visible = false
		_dim_right.visible = false
	else:
		_dim_bottom.visible = true
		_dim_left.visible = true
		_dim_right.visible = true
		_dim_top.visible = true
		_dim_top.position = Vector2.ZERO
		_dim_top.size = Vector2(vp.x, maxf(0.0, hole.position.y + DIM_OVERLAP))
		_dim_bottom.position = Vector2(0, maxf(0.0, hole.end.y - DIM_OVERLAP))
		_dim_bottom.size = Vector2(vp.x, maxf(0.0, vp.y - hole.end.y + DIM_OVERLAP))
		_dim_left.position = Vector2(0, hole.position.y)
		_dim_left.size = Vector2(maxf(0.0, hole.position.x + DIM_OVERLAP), hole.size.y)
		_dim_right.position = Vector2(maxf(0.0, hole.end.x - DIM_OVERLAP), hole.position.y)
		_dim_right.size = Vector2(maxf(0.0, vp.x - hole.end.x + DIM_OVERLAP), hole.size.y)

	if _uses_spotlight_ring():
		_ring.visible = true
		_ring.position = hole.position
		_ring.size = hole.size
		_pulse_ring()
	else:
		_ring.visible = false
		_stop_ring_pulse()

	_layout_secondary_spotlight_ring()

	var placement := str(TutorialManager.current_step().get("placement", "auto"))
	if not TutorialManager.is_on_required_page() and not TutorialManager.page_is_pending():
		placement = "auto"
	if TutorialManager.coach_card_visible():
		_place_card(hole, vp, placement)
		_place_pointer(hole, vp)
	else:
		_card.visible = false
		if is_instance_valid(_pointer):
			_pointer.visible = false
	_update_fuel_hint()
	_update_timer_hint()
	_update_helmet_hint()
	_update_stim_hint()
	_update_ranks_hint()
	_update_start_hint()


func _body_text_for_step(step: Dictionary) -> String:
	if TutorialManager.step_id() == "hero_upgrade":
		var class_key := str(GameManager.active_character.get("class", "Vanguard"))
		return TutorialCurrencyCopy.colorize(TutorialAttributeCopy.body_for_class(class_key))
	if TutorialManager.step_id() == "mission_fight" and TutorialManager.is_on_required_page():
		var fight := _find_tutorial_target("mission-fight")
		if fight == null or not fight.is_visible_in_tree():
			return TutorialCurrencyCopy.colorize(
				"This one's on us, but next time it'll cost ya! Tap Skip to jump the wait and fight now."
			)
	return TutorialCurrencyCopy.colorize(str(step.get("body", "")))


func _min_card_height_for_step() -> float:
	match TutorialManager.step_id():
		"hero_upgrade":
			return 340.0
		"hero_equip":
			return 300.0
		"mission_pick":
			return 320.0
		"mission_timer":
			return 300.0
		"hero_equip":
			return 280.0
		"shop_market":
			return 300.0
		_:
			return 180.0


func _mission_timer_card_y(hole: Rect2) -> float:
	var activity := _find_tutorial_target("shell-activity")
	if activity != null and is_instance_valid(activity) and activity.is_visible_in_tree():
		return activity.get_global_rect().end.y + CARD_HOLE_GAP
	if hole.size.y > 1.0:
		return hole.end.y + CARD_HOLE_GAP
	return CARD_PAD + 64.0


func _place_card(hole: Rect2, vp: Vector2, placement: String) -> void:
	_card.custom_minimum_size.x = CARD_W
	_card.reset_size()
	var card_size := _card.get_combined_minimum_size()
	var w := maxf(CARD_W, card_size.x)
	var h := maxf(card_size.y, _min_card_height_for_step())
	_card.size = Vector2(w, h)
	var pos := Vector2((vp.x - w) * 0.5, (vp.y - h) * 0.5)
	if TutorialManager.step_id() == "mission_timer":
		# Sit below the banner mission button — not on CARD_PAD, which covers shell-activity.
		pos = Vector2(hole.position.x + hole.size.x * 0.5 - w * 0.5, _mission_timer_card_y(hole))
	elif TutorialManager.step_id() == "mission_fight":
		pos = Vector2(hole.position.x + hole.size.x * 0.5 - w * 0.5, hole.end.y + CARD_HOLE_GAP)
	elif hole.size.x > 1.0 and hole.size.y > 1.0:
		var chosen := placement
		if chosen == "auto" or chosen.is_empty() or chosen == "center":
			chosen = _auto_placement(hole, vp, w, h)
		match chosen:
			"right":
				pos = Vector2(hole.end.x + CARD_HOLE_GAP, hole.position.y)
			"left":
				pos = Vector2(hole.position.x - w - CARD_HOLE_GAP, hole.position.y)
			"top":
				pos = Vector2(hole.position.x, hole.position.y - h - CARD_HOLE_GAP)
			"bottom":
				pos = Vector2(hole.position.x, hole.end.y + CARD_HOLE_GAP)
			_:
				pos = Vector2((vp.x - w) * 0.5, (vp.y - h) * 0.5)
	pos.x = clampf(pos.x, CARD_PAD, maxf(CARD_PAD, vp.x - w - CARD_PAD))
	pos.y = clampf(pos.y, CARD_PAD, maxf(CARD_PAD, vp.y - h - CARD_PAD))
	# Never cover the spotlight hole if we can slide off it.
	if TutorialManager.step_id() not in ["mission_timer", "mission_fight"] and hole.size.x > 1.0:
		var card_rect := Rect2(pos, Vector2(w, h))
		if card_rect.intersects(hole):
			if hole.end.x + CARD_HOLE_GAP + w + CARD_PAD <= vp.x:
				pos.x = hole.end.x + CARD_HOLE_GAP
			elif hole.position.x - w - CARD_HOLE_GAP >= CARD_PAD:
				pos.x = hole.position.x - w - CARD_HOLE_GAP
			elif hole.end.y + CARD_HOLE_GAP + h + CARD_PAD <= vp.y:
				pos.y = hole.end.y + CARD_HOLE_GAP
			elif hole.position.y - h - CARD_HOLE_GAP >= CARD_PAD:
				pos.y = hole.position.y - h - CARD_HOLE_GAP
			pos.x = clampf(pos.x, CARD_PAD, maxf(CARD_PAD, vp.x - w - CARD_PAD))
			pos.y = clampf(pos.y, CARD_PAD, maxf(CARD_PAD, vp.y - h - CARD_PAD))
	_card.position = pos


func _update_fuel_hint() -> void:
	_stop_fuel_flash()
	if not visible or TutorialManager.step_id() != "mission_pick":
		return
	if not TutorialManager.is_on_required_page():
		return
	var target := _find_tutorial_target("shell-fuel")
	if target == null or not is_instance_valid(target):
		return
	_fuel_flash_target = target
	target.modulate = Color.WHITE
	_fuel_flash_tween = target.create_tween().set_loops()
	_fuel_flash_tween.tween_property(target, "modulate", Color(1.12, 1.38, 1.08, 1.0), 0.6).set_trans(Tween.TRANS_SINE)
	_fuel_flash_tween.tween_property(target, "modulate", Color.WHITE, 0.6).set_trans(Tween.TRANS_SINE)


func _stop_fuel_flash() -> void:
	if _fuel_flash_tween != null and is_instance_valid(_fuel_flash_tween):
		_fuel_flash_tween.kill()
	_fuel_flash_tween = null
	if _fuel_flash_target != null and is_instance_valid(_fuel_flash_target):
		_fuel_flash_target.modulate = Color.WHITE
	_fuel_flash_target = null


func _update_timer_hint() -> void:
	_stop_timer_flash()
	if not visible or TutorialManager.step_id() != "mission_timer":
		return
	if not TutorialManager.is_on_required_page():
		return
	var target := _find_tutorial_target("mission-timer")
	if target == null or not is_instance_valid(target):
		return
	_timer_flash_target = target
	target.modulate = Color.WHITE
	_timer_flash_tween = target.create_tween().set_loops()
	_timer_flash_tween.tween_property(target, "modulate", Color(1.15, 1.35, 1.45, 1.0), 0.6).set_trans(Tween.TRANS_SINE)
	_timer_flash_tween.tween_property(target, "modulate", Color.WHITE, 0.6).set_trans(Tween.TRANS_SINE)


func _stop_timer_flash() -> void:
	if _timer_flash_tween != null and is_instance_valid(_timer_flash_tween):
		_timer_flash_tween.kill()
	_timer_flash_tween = null
	if _timer_flash_target != null and is_instance_valid(_timer_flash_target):
		_timer_flash_target.modulate = Color.WHITE
	_timer_flash_target = null


func _update_helmet_hint() -> void:
	_stop_helmet_flash()
	if not visible or TutorialManager.step_id() != "hero_equip":
		return
	if not TutorialManager.is_on_required_page():
		return
	var target := _find_tutorial_target("hero-bag-helmet")
	if target == null or not is_instance_valid(target):
		return
	_helmet_flash_target = target
	target.modulate = Color.WHITE
	_helmet_flash_tween = target.create_tween().set_loops()
	_helmet_flash_tween.tween_property(target, "modulate", Color(1.18, 1.32, 1.08, 1.0), 0.6).set_trans(Tween.TRANS_SINE)
	_helmet_flash_tween.tween_property(target, "modulate", Color.WHITE, 0.6).set_trans(Tween.TRANS_SINE)


func _stop_helmet_flash() -> void:
	if _helmet_flash_tween != null and is_instance_valid(_helmet_flash_tween):
		_helmet_flash_tween.kill()
	_helmet_flash_tween = null
	if _helmet_flash_target != null and is_instance_valid(_helmet_flash_target):
		_helmet_flash_target.modulate = Color.WHITE
	_helmet_flash_target = null


func _update_stim_hint() -> void:
	_stop_stim_flash()
	if not visible or TutorialManager.step_id() != "shop_market":
		return
	if not TutorialManager.is_on_required_page():
		return
	var target := _find_tutorial_target("shop-stim")
	if target == null or not is_instance_valid(target):
		return
	_stim_flash_target = target
	target.modulate = Color.WHITE
	_stim_flash_tween = target.create_tween().set_loops()
	_stim_flash_tween.tween_property(target, "modulate", Color(1.15, 1.28, 1.42, 1.0), 0.6).set_trans(Tween.TRANS_SINE)
	_stim_flash_tween.tween_property(target, "modulate", Color.WHITE, 0.6).set_trans(Tween.TRANS_SINE)


func _stop_stim_flash() -> void:
	if _stim_flash_tween != null and is_instance_valid(_stim_flash_tween):
		_stim_flash_tween.kill()
	_stim_flash_tween = null
	if _stim_flash_target != null and is_instance_valid(_stim_flash_target):
		_stim_flash_target.modulate = Color.WHITE
	_stim_flash_target = null


func _update_ranks_hint() -> void:
	_stop_ranks_flash()
	if not visible or TutorialManager.step_id() != "arena_free":
		return
	if not TutorialManager.is_on_required_page():
		return
	var target := _find_tutorial_target("nav-ranks")
	if target == null or not is_instance_valid(target):
		return
	_ranks_flash_target = target
	target.modulate = Color.WHITE
	_ranks_flash_tween = target.create_tween().set_loops()
	_ranks_flash_tween.tween_property(target, "modulate", Color(1.08, 1.12, 1.18, 1.0), 0.75).set_trans(Tween.TRANS_SINE)
	_ranks_flash_tween.tween_property(target, "modulate", Color.WHITE, 0.75).set_trans(Tween.TRANS_SINE)


func _stop_ranks_flash() -> void:
	if _ranks_flash_tween != null and is_instance_valid(_ranks_flash_tween):
		_ranks_flash_tween.kill()
	_ranks_flash_tween = null
	if _ranks_flash_target != null and is_instance_valid(_ranks_flash_target):
		_ranks_flash_target.modulate = Color.WHITE
	_ranks_flash_target = null


func _update_start_hint() -> void:
	_stop_start_flash()
	if not visible or TutorialManager.step_id() != "mission_start":
		return
	if not TutorialManager.is_on_required_page():
		return
	var target := _find_tutorial_target("cantina-start")
	if target == null or not is_instance_valid(target):
		return
	_start_flash_target = target
	target.modulate = Color.WHITE
	_start_flash_tween = target.create_tween().set_loops()
	_start_flash_tween.tween_property(target, "modulate", Color(1.12, 1.38, 1.08, 1.0), 0.6).set_trans(Tween.TRANS_SINE)
	_start_flash_tween.tween_property(target, "modulate", Color.WHITE, 0.6).set_trans(Tween.TRANS_SINE)


func _stop_start_flash() -> void:
	if _start_flash_tween != null and is_instance_valid(_start_flash_tween):
		_start_flash_tween.kill()
	_start_flash_tween = null
	if _start_flash_target != null and is_instance_valid(_start_flash_target):
		_start_flash_target.modulate = Color.WHITE
	_start_flash_target = null


func _auto_placement(hole: Rect2, vp: Vector2, w: float, h: float) -> String:
	if hole.end.x + CARD_HOLE_GAP + w + CARD_PAD <= vp.x:
		return "right"
	if hole.position.x - w - CARD_HOLE_GAP >= CARD_PAD:
		return "left"
	if hole.end.y + CARD_HOLE_GAP + h + CARD_PAD <= vp.y:
		return "bottom"
	if hole.position.y - h - CARD_HOLE_GAP >= CARD_PAD:
		return "top"
	return "center"


func _layout_secondary_spotlight_ring() -> void:
	_stop_extra_ring_pulse()
	if not is_instance_valid(_ring_extra):
		return
	_ring_extra.visible = false
	if not TutorialManager.is_on_required_page():
		return
	var sid := ""
	match TutorialManager.step_id():
		"shop_market", "arena_free":
			sid = TutorialManager.extra_spotlight_id()
	if sid.is_empty():
		return
	var target := _find_tutorial_target(sid)
	if target == null or not is_instance_valid(target) or not target.is_visible_in_tree():
		return
	var gr: Rect2 = target.get_global_rect()
	var hole := Rect2(gr.position - Vector2(HOLE_PAD, HOLE_PAD), gr.size + Vector2(HOLE_PAD * 2.0, HOLE_PAD * 2.0))
	if hole.size.x <= 4.0 or hole.size.y <= 4.0:
		return
	_ring_extra.visible = true
	_ring_extra.position = hole.position
	_ring_extra.size = hole.size
	_pulse_extra_ring(TutorialManager.step_id() == "arena_free")


func _uses_spotlight_ring() -> bool:
	# mission_start already flashes the START MISSION button; the ring top border
	# reads as a full-width cyan hairline above the wide button.
	return TutorialManager.step_id() != "mission_start"


func _pulse_ring() -> void:
	if _ring_pulse != null and is_instance_valid(_ring_pulse) and _ring_pulse.is_running():
		return
	_stop_ring_pulse()
	_reset_ring_style()
	var sb := _ring.get_theme_stylebox("panel") as StyleBoxFlat
	if sb == null:
		return
	# Border-only pulse — no modulate/shadow glow over the spotlight target.
	sb.shadow_size = 0
	var dim := Color(RING_BORDER.r, RING_BORDER.g, RING_BORDER.b, 0.32)
	sb.border_color = dim
	_ring_pulse = create_tween().set_loops()
	_ring_pulse.tween_property(sb, "border_color", RING_BORDER, 0.55).set_trans(Tween.TRANS_SINE)
	_ring_pulse.tween_property(sb, "border_color", dim, 0.55).set_trans(Tween.TRANS_SINE)


func _stop_ring_pulse() -> void:
	if _ring_pulse != null and is_instance_valid(_ring_pulse):
		_ring_pulse.kill()
	_ring_pulse = null
	_reset_ring_style()


func _pulse_extra_ring(subtle: bool = false) -> void:
	if _ring_extra_pulse != null and is_instance_valid(_ring_extra_pulse) and _ring_extra_pulse.is_running():
		return
	_stop_extra_ring_pulse()
	_reset_extra_ring_style()
	var sb := _ring_extra.get_theme_stylebox("panel") as StyleBoxFlat
	if sb == null:
		return
	sb.shadow_size = 0
	var dim_alpha := 0.22 if subtle else 0.32
	var bright_alpha := 0.72 if subtle else 1.0
	var dim := Color(RING_BORDER.r, RING_BORDER.g, RING_BORDER.b, dim_alpha)
	var bright := Color(RING_BORDER.r, RING_BORDER.g, RING_BORDER.b, bright_alpha)
	sb.border_color = dim
	var half := 0.85 if subtle else 0.55
	_ring_extra_pulse = create_tween().set_loops()
	_ring_extra_pulse.tween_property(sb, "border_color", bright, half).set_trans(Tween.TRANS_SINE)
	_ring_extra_pulse.tween_property(sb, "border_color", dim, half).set_trans(Tween.TRANS_SINE)


func _stop_extra_ring_pulse() -> void:
	if _ring_extra_pulse != null and is_instance_valid(_ring_extra_pulse):
		_ring_extra_pulse.kill()
	_ring_extra_pulse = null
	_reset_extra_ring_style()


func _reset_extra_ring_style() -> void:
	if not is_instance_valid(_ring_extra):
		return
	_ring_extra.modulate = Color.WHITE
	var sb := _ring_extra.get_theme_stylebox("panel") as StyleBoxFlat
	if sb == null:
		return
	sb.bg_color = Color(0, 0, 0, 0)
	sb.border_color = RING_BORDER
	sb.shadow_size = 0


func _reset_ring_style() -> void:
	if not is_instance_valid(_ring):
		return
	_ring.modulate = Color.WHITE
	var sb := _ring.get_theme_stylebox("panel") as StyleBoxFlat
	if sb == null:
		return
	sb.bg_color = Color(0, 0, 0, 0)
	sb.border_color = RING_BORDER
	sb.shadow_size = 0


func _spotlight_target_for(sid: String) -> Control:
	if TutorialManager.step_id() == "click_operative" and sid == "shell-operative":
		var tree := get_tree()
		if tree != null:
			for n in tree.get_nodes_in_group("tutorial_target"):
				if not (n is Control):
					continue
				if str(n.name) != "OperativeConsole":
					continue
				var c := n as Control
				if c.is_visible_in_tree():
					return c
	return _find_tutorial_target(sid)


func _place_pointer(hole: Rect2, vp: Vector2) -> void:
	if not is_instance_valid(_pointer):
		return
	_pointer.visible = true
	var card_center := _card.position + _card.size * 0.5
	var hole_center := hole.get_center()
	if hole_center.x < card_center.x:
		_pointer.text = "◀"
		_pointer.position = Vector2(hole.end.x + POINTER_INSET, hole_center.y - POINTER_SPAN * 0.5)
	elif hole_center.x > card_center.x:
		_pointer.text = "▶"
		_pointer.position = Vector2(hole.position.x - POINTER_INSET - POINTER_SPAN, hole_center.y - POINTER_SPAN * 0.5)
	elif hole_center.y < card_center.y:
		_pointer.text = "▲"
		_pointer.position = Vector2(hole_center.x - POINTER_SPAN * 0.35, hole.end.y + POINTER_INSET)
	else:
		_pointer.text = "▼"
		_pointer.position = Vector2(hole_center.x - POINTER_SPAN * 0.35, hole.position.y - POINTER_INSET - POINTER_SPAN)
	_pointer.position.x = clampf(_pointer.position.x, 8.0, vp.x - POINTER_SPAN)
	_pointer.position.y = clampf(_pointer.position.y, 8.0, vp.y - POINTER_SPAN)


func _confirm_skip() -> void:
	if TutorialManager.busy:
		return
	if is_instance_valid(_skip_sheet):
		return
	_skip_sheet = ClientUi.make_confirm_sheet(
		"TUTORIAL",
		"Skip the tutorial?",
		"You can revisit help later. Skipping ends the whole guided sequence.",
		func() -> void:
			_skip_sheet = null
			TutorialManager.skip(),
		func() -> void:
			_skip_sheet = null,
		"Skip Tutorial",
		"Keep Training",
		ClientUi.DANGER,
		true
	)
	add_child(_skip_sheet)


func _find_tutorial_target(sid: String) -> Control:
	if sid.is_empty():
		return null
	var tree := get_tree()
	if tree == null:
		return null
	var overlay_hit: Control = null
	var page_hit: Control = null
	var nodes := tree.get_nodes_in_group("tutorial_target")
	for n in nodes:
		if not (n is Control):
			continue
		if str(n.get_meta("tutorial_id", "")) != sid:
			continue
		var c := n as Control
		if not c.is_visible_in_tree():
			continue
		if _is_under_overlay(c):
			if overlay_hit == null:
				overlay_hit = c
		elif not _is_buried_by_overlay(c) and page_hit == null:
			page_hit = c
	if overlay_hit != null:
		return overlay_hit
	return page_hit


func _is_under_overlay(node: Control) -> bool:
	var walk: Node = node
	while walk != null:
		if str(walk.name) == "OverlayHost":
			return true
		walk = walk.get_parent()
	return false


func _is_buried_by_overlay(node: Control) -> bool:
	if _is_under_overlay(node) or not _content_overlay_open():
		return false
	var walk: Node = node
	while walk != null:
		if str(walk.name) == "ContentStage":
			return true
		walk = walk.get_parent()
	return false


func _content_overlay_open() -> bool:
	var tree := get_tree()
	if tree == null:
		return false
	var shell := tree.get_first_node_in_group("game_shell")
	if shell != null and shell.has_method("has_overlay"):
		return bool(shell.call("has_overlay"))
	return false
