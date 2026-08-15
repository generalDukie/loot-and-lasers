extends CanvasLayer
## Large page-aware coach overlay — dims UI, spotlights tutorial targets, never covers the hole.

const TutorialAttributeCopy := preload("res://Scripts/UI/TutorialAttributeCopy.gd")
const TutorialCurrencyCopy := preload("res://Scripts/UI/TutorialCurrencyCopy.gd")
const CARD_W := 540.0
const CARD_PAD := 20.0
const HOLE_PAD := 10.0
const POINTER_INSET := 8.0
const POINTER_SPAN := 46.0
const POINTER_CARD_GAP := 12.0
const CARD_HOLE_GAP := POINTER_INSET + POINTER_SPAN + POINTER_CARD_GAP
## Tight stack for mission_timer: card → gap → arrow → gap → timer.
const MISSION_TIMER_STACK_GAP := 8.0
const DIM_ALPHA := 0.58
const DIM_OVERLAP := 1.0
const RING_BORDER := Color(0.05, 0.85, 0.95, 0.98)
## Slow cyan ring pulse during hero attribute / equip flash holds.
const HERO_FLASH_RING_HALF_SEC := 1.25
## Black Market Basics outline rings — ~5s full pulse (border alpha only).
const SHOP_OUTLINE_RING_HALF_SEC := 2.5
const SHOP_OUTLINE_RING_COUNT := 3

var _dim_top: ColorRect
var _dim_bottom: ColorRect
var _dim_left: ColorRect
var _dim_right: ColorRect
var _dim_root: Control
var _dim_pieces: Array = [] # Extra ColorRects for multi-hole dimming
var _ring: Panel
var _ring_extra: Panel
var _card: PanelContainer
var _title: Label
var _body: RichTextLabel
var _btn_back: Button
var _btn_next: Button
var _btn_skip: Button
var _pointer: TextureRect
var _measure_timer: Timer
var _ring_pulse: Tween
var _ring_extra_pulse: Tween
var _ring_pulse_slow := false
var _ring_extra_pulse_slow := false
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
var _shop_refresh_flash_tween: Tween
var _shop_refresh_flash_target: Control
var _shop_restock_flash_tween: Tween
var _shop_restock_flash_target: Control
var _shop_outline_rings: Array = [] ## Panel
var _shop_outline_pulses: Array = [] ## Tween
var _shop_outline_pulse_running := false
var _reward_stardust_flash_tween: Tween
var _reward_stardust_flash_target: Control
var _reward_helmet_flash_tween: Tween
var _reward_helmet_flash_target: Control

const SHOP_HINT_FLASH_HALF_SEC := 1.8
const RANKS_HINT_FLASH_HALF_SEC := 1.6
const FUEL_HINT_FLASH_HALF_SEC := 1.6
const START_HINT_FLASH_HALF_SEC := 1.6
const REWARD_HINT_FLASH_HALF_SEC := 1.6


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

	_dim_root = root
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

	_shop_outline_rings.clear()
	for _i in SHOP_OUTLINE_RING_COUNT:
		var shop_ring := Panel.new()
		shop_ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
		shop_ring.visible = false
		var shop_sb := ring_sb.duplicate() as StyleBoxFlat
		shop_ring.add_theme_stylebox_override("panel", shop_sb)
		root.add_child(shop_ring)
		_shop_outline_rings.append(shop_ring)

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

	_pointer = UiIcon.make("triangle", Color(0.05, 0.9, 0.98, 0.95), 36.0)
	_pointer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pointer.pivot_offset = Vector2(18, 18)
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


func _clear_dim_pieces() -> void:
	for piece in _dim_pieces:
		if piece is Node and is_instance_valid(piece):
			(piece as Node).queue_free()
	_dim_pieces.clear()


## Dim the full viewport except one or more axis-aligned holes (disconnected OK).
func _layout_multi_hole_dim(vp: Vector2, holes: Array) -> void:
	_clear_dim_pieces()
	_dim_top.visible = false
	_dim_bottom.visible = false
	_dim_left.visible = false
	_dim_right.visible = false
	if _dim_root == null or not is_instance_valid(_dim_root):
		return
	var xs: Array = [0.0, vp.x]
	var ys: Array = [0.0, vp.y]
	var valid_holes: Array = []
	for h in holes:
		if typeof(h) != TYPE_RECT2:
			continue
		var r: Rect2 = h
		if r.size.x <= 1.0 or r.size.y <= 1.0:
			continue
		r = r.intersection(Rect2(Vector2.ZERO, vp))
		if r.size.x <= 1.0 or r.size.y <= 1.0:
			continue
		valid_holes.append(r)
		xs.append(r.position.x)
		xs.append(r.end.x)
		ys.append(r.position.y)
		ys.append(r.end.y)
	xs.sort()
	ys.sort()
	xs = _unique_sorted_floats(xs)
	ys = _unique_sorted_floats(ys)
	for i in range(xs.size() - 1):
		for j in range(ys.size() - 1):
			var cell := Rect2(
				Vector2(xs[i], ys[j]),
				Vector2(xs[i + 1] - xs[i], ys[j + 1] - ys[j])
			)
			if cell.size.x < 0.5 or cell.size.y < 0.5:
				continue
			var center := cell.get_center()
			var inside := false
			for hole in valid_holes:
				if (hole as Rect2).has_point(center):
					inside = true
					break
			if inside:
				continue
			var piece := _make_dim(_dim_root)
			piece.position = cell.position
			piece.size = cell.size
			# Keep dim pieces under ring/card (created later in tree order).
			_dim_root.move_child(piece, 0)
			_dim_pieces.append(piece)


func _unique_sorted_floats(values: Array) -> Array:
	var out: Array = []
	for v in values:
		var f := float(v)
		if out.is_empty() or absf(f - float(out[out.size() - 1])) > 0.25:
			out.append(f)
	return out


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
	_stop_shop_outline_rings()
	_stop_fuel_flash()
	_stop_timer_flash()
	_stop_helmet_flash()
	_stop_stim_flash()
	_stop_shop_refresh_flash()
	_stop_shop_restock_flash()
	_stop_ranks_flash()
	_stop_start_flash()
	_stop_reward_flashes()
	visible = false
	_clear_dim_pieces()
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
		var buy := _find_tutorial_target("shop-buy")
		if buy != null and is_instance_valid(buy) and buy.is_visible_in_tree():
			return "shop-buy"
	if TutorialManager.step_id() == "arena_free" and TutorialManager.is_on_required_page():
		var free_pane := _find_tutorial_target("arena-free")
		if free_pane != null and is_instance_valid(free_pane) and free_pane.is_visible_in_tree():
			return "arena-free"
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


## Combat tiles that change when `stat` is raised (mirrors stats.gd mapping).
func _combat_labels_for_flash_stat(stat: String) -> Array:
	var class_key := str(GameManager.active_character.get("class", "Vanguard"))
	var primary := StatsRules.primary_stat(class_key)
	var arch := MissionCombat.damage_archetype(class_key)
	match stat:
		"luck":
			return ["Crit Chance"]
		"vitality":
			return ["Max Health"]
		"agility":
			var out: Array = ["Dodge Chance"]
			if primary == "agility":
				out.append("Damage")
			return out
		"intellect":
			var out: Array = []
			if arch != "int":
				out.append("Tech Resist")
			if primary == "intellect":
				out.append("Damage")
			return out
		"strength":
			if arch == "str" or primary == "strength":
				return ["Damage"]
			return ["Might Resistance"]
		_:
			return []


func _hero_flash_hold_stat() -> String:
	if TutorialManager.hero_upgrade_flash_hold_active():
		return TutorialManager.hero_upgrade_flash_stat()
	if TutorialManager.hero_equip_flash_hold_active():
		var flash_stat := TutorialManager.hero_equip_flash_stat()
		if flash_stat.is_empty():
			return StatsRules.primary_stat(
				str(GameManager.active_character.get("class", "Vanguard"))
			)
		return flash_stat
	return ""


func _hero_flash_hold_active() -> bool:
	return (
		TutorialManager.hero_upgrade_flash_hold_active()
		or TutorialManager.hero_equip_flash_hold_active()
	)


func _hole_for_tutorial_id(tid: String) -> Rect2:
	var target := _find_tutorial_target(tid)
	if target == null or not is_instance_valid(target) or not target.is_visible_in_tree():
		return Rect2()
	var gr: Rect2 = target.get_global_rect()
	var hole := Rect2(gr.position - Vector2(HOLE_PAD, HOLE_PAD), gr.size + Vector2(HOLE_PAD * 2.0, HOLE_PAD * 2.0))
	if hole.size.x <= 4.0 or hole.size.y <= 4.0:
		return Rect2()
	return hole


## Discrete holes for attribute row + linked combat tiles (no merged undim between them).
func _hero_flash_hold_holes(stat: String) -> Array:
	var holes: Array = []
	if stat.is_empty():
		return holes
	var attr_hole := _hole_for_tutorial_id("hero-attr-%s" % stat)
	if attr_hole.size.x > 4.0:
		holes.append(attr_hole)
	for label in _combat_labels_for_flash_stat(stat):
		var combat_hole := _hole_for_tutorial_id("hero-combat-%s" % str(label))
		if combat_hole.size.x > 4.0:
			holes.append(combat_hole)
	return holes


func _layout_spotlight() -> void:
	if not _sync_coach_visibility():
		return
	if TutorialManager.coach_card_visible():
		_refresh_copy()
	var vp := get_viewport().get_visible_rect().size
	var sid := _resolved_spotlight_id()
	var hole := Rect2()
	var ring_hole := Rect2()
	var has_hole := false
	var flash_holes: Array = []
	var using_flash_hold := false
	if not sid.is_empty():
		var target := _spotlight_target_for(sid)
		if target != null and is_instance_valid(target) and target.is_visible_in_tree():
			var gr: Rect2 = target.get_global_rect()
			hole = Rect2(gr.position - Vector2(HOLE_PAD, HOLE_PAD), gr.size + Vector2(HOLE_PAD * 2.0, HOLE_PAD * 2.0))
			ring_hole = hole
			has_hole = hole.size.x > 4.0 and hole.size.y > 4.0
	# After buy/equip: spotlight only the affected attribute + combat tile(s).
	if (
		has_hole
		and TutorialManager.is_on_required_page()
		and TutorialManager.step_id() in ["hero_upgrade", "hero_equip"]
		and _hero_flash_hold_active()
	):
		var flash_stat := _hero_flash_hold_stat()
		flash_holes = _hero_flash_hold_holes(flash_stat)
		if not flash_holes.is_empty():
			using_flash_hold = true
			hole = flash_holes[0]
			for i in range(1, flash_holes.size()):
				hole = hole.merge(flash_holes[i])
			ring_hole = flash_holes[0]
			has_hole = true
	elif has_hole and TutorialManager.step_id() == "hero_equip" and TutorialManager.is_on_required_page():
		hole = _expand_hole_with_target(hole, "hero-doll")
		ring_hole = hole
	if has_hole and TutorialManager.step_id() == "shop_market" and TutorialManager.is_on_required_page():
		# Undim buy + sell (not only one stim), plus refresh timer and Nova restock.
		hole = _expand_hole_with_target(hole, "shop-buy")
		hole = _expand_hole_with_target(hole, "shop-sell-tray")
		hole = _expand_hole_with_target(hole, "shop-refresh-timer")
		hole = _expand_hole_with_target(hole, "shop-restock")
		ring_hole = hole
	if has_hole and TutorialManager.step_id() == "arena_free" and TutorialManager.is_on_required_page():
		# Free-battles pane is the primary hole / cyan ring.
		# Contenders + Ranks are SEPARATE holes (multi-hole dim below) —
		# merging them with nav would undim the whole arena strip.
		ring_hole = hole
		var free_pane := _find_tutorial_target("arena-free")
		if free_pane != null and is_instance_valid(free_pane) and free_pane.is_visible_in_tree():
			var fgr: Rect2 = free_pane.get_global_rect()
			hole = Rect2(
				fgr.position - Vector2(HOLE_PAD, HOLE_PAD),
				fgr.size + Vector2(HOLE_PAD * 2.0, HOLE_PAD * 2.0)
			)
			ring_hole = hole
			has_hole = hole.size.x > 4.0 and hole.size.y > 4.0
	if has_hole and TutorialManager.step_id() == "mission_pick" and TutorialManager.is_on_required_page():
		# Keep the mission board as the only primary hole / ring.
		# Fuel is a SECOND disconnected hole (multi-hole dim) — do not merge rects
		# or the whole screen between console and missions gets undimmed.
		ring_hole = hole
		var patrons := _find_tutorial_target("cantina-patrons")
		if patrons != null and is_instance_valid(patrons) and patrons.is_visible_in_tree():
			var pgr: Rect2 = patrons.get_global_rect()
			hole = Rect2(
				pgr.position - Vector2(HOLE_PAD, HOLE_PAD),
				pgr.size + Vector2(HOLE_PAD * 2.0, HOLE_PAD * 2.0)
			)
			ring_hole = hole
			has_hole = hole.size.x > 4.0 and hole.size.y > 4.0

	if not has_hole:
		_clear_dim_pieces()
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
		_update_fuel_hint()
		_update_stim_hint()
		_update_shop_refresh_hint()
		_update_shop_restock_hint()
		_layout_shop_outline_rings()
		_update_ranks_hint()
		_update_start_hint()
		_update_reward_hints()
		return

	if not TutorialManager.coach_dims_screen():
		_clear_dim_pieces()
		_dim_top.visible = false
		_dim_bottom.visible = false
		_dim_left.visible = false
		_dim_right.visible = false
	elif using_flash_hold and flash_holes.size() > 0:
		_layout_multi_hole_dim(vp, flash_holes)
	elif TutorialManager.step_id() == "arena_free" and TutorialManager.is_on_required_page():
		var holes: Array = [hole]
		var contenders_hole := _hole_for_tutorial_id("arena-contenders")
		if contenders_hole.size.x > 4.0:
			holes.append(contenders_hole)
		var ranks_hole := _hole_for_tutorial_id("nav-ranks")
		if ranks_hole.size.x > 4.0:
			holes.append(ranks_hole)
		_layout_multi_hole_dim(vp, holes)
	elif TutorialManager.step_id() == "mission_pick" and TutorialManager.is_on_required_page():
		var holes: Array = [hole]
		var fuel := _find_tutorial_target("shell-fuel")
		if fuel != null and is_instance_valid(fuel) and fuel.is_visible_in_tree():
			var fgr: Rect2 = fuel.get_global_rect()
			var fuel_hole := Rect2(
				fgr.position - Vector2(HOLE_PAD, HOLE_PAD),
				fgr.size + Vector2(HOLE_PAD * 2.0, HOLE_PAD * 2.0)
			)
			if fuel_hole.size.x > 4.0 and fuel_hole.size.y > 4.0:
				holes.append(fuel_hole)
		_layout_multi_hole_dim(vp, holes)
	else:
		_clear_dim_pieces()
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
		_ring.position = ring_hole.position
		_ring.size = ring_hole.size
		_pulse_ring(using_flash_hold)
	else:
		_ring.visible = false
		_stop_ring_pulse()

	if using_flash_hold and flash_holes.size() > 1 and is_instance_valid(_ring_extra):
		# Slow secondary ring on the first combat tile while the attribute flashes.
		_ring_extra.visible = true
		_ring_extra.position = flash_holes[1].position
		_ring_extra.size = flash_holes[1].size
		_pulse_extra_ring(true)
	else:
		_layout_secondary_spotlight_ring()

	var placement := str(TutorialManager.current_step().get("placement", "auto"))
	if not TutorialManager.is_on_required_page() and not TutorialManager.page_is_pending():
		placement = "auto"
	if TutorialManager.coach_card_visible():
		var card_hole := hole
		if TutorialManager.step_id() in ["arena_free", "mission_pick"]:
			card_hole = ring_hole
		elif TutorialManager.step_id() == "mine_explain":
			var stardust_hole := _hole_for_tutorial_id("mine-stardust")
			if stardust_hole.size.x > 4.0:
				card_hole = stardust_hole
		elif TutorialManager.step_id() == "mission_timer":
			var timer_hole := _hole_for_tutorial_id("mission-timer")
			if timer_hole.size.x > 4.0:
				card_hole = timer_hole
		_place_card(card_hole, vp, placement)
		if TutorialManager.step_id() in ["shop_market", "frontier_fight"]:
			# No pointer — card is pinned; pointing into the map/detail is noise.
			if is_instance_valid(_pointer):
				_pointer.visible = false
		else:
			_place_pointer(card_hole, vp)
	else:
		_card.visible = false
		if is_instance_valid(_pointer):
			_pointer.visible = false
	_update_fuel_hint()
	_update_timer_hint()
	_update_helmet_hint()
	_update_stim_hint()
	_update_shop_refresh_hint()
	_update_shop_restock_hint()
	_layout_shop_outline_rings()
	_update_ranks_hint()
	_update_start_hint()
	_update_reward_hints()


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


func _mission_timer_bar_rect() -> Rect2:
	var timer := _find_tutorial_target("mission-timer")
	if timer == null or not is_instance_valid(timer) or not timer.is_visible_in_tree():
		return Rect2()
	return timer.get_global_rect()


func _mission_timer_tip_anchor() -> Vector2:
	## Point at the countdown text (right side); fall back to top-right of the timer chrome.
	var countdown := _find_tutorial_target("mission-timer-countdown")
	if countdown != null and is_instance_valid(countdown) and countdown.is_visible_in_tree():
		return countdown.get_global_rect().get_center()
	var bar := _mission_timer_bar_rect()
	if bar.size.x > 4.0:
		return Vector2(bar.end.x - mini(56.0, bar.size.x * 0.2), bar.position.y + mini(18.0, bar.size.y * 0.35))
	return Vector2.ZERO


func _mission_timer_card_pos(hole: Rect2, vp: Vector2, w: float, h: float) -> Vector2:
	## Card sits directly above the timer; bottom-right of card lines up over the countdown
	## so the triangle can sit in the gap between them.
	var bar := _mission_timer_bar_rect()
	var anchor := bar if bar.size.x > 4.0 else hole
	var tip := _mission_timer_tip_anchor()
	if tip == Vector2.ZERO and anchor.size.x > 4.0:
		tip = Vector2(anchor.end.x - 40.0, anchor.position.y)
	var gap := MISSION_TIMER_STACK_GAP
	var stack := gap + POINTER_SPAN + gap
	var x := (vp.x - w) * 0.5
	var y := maxf(CARD_PAD, vp.y - h - CARD_PAD)
	if tip != Vector2.ZERO:
		# Bottom-right of card near tip so the arrow sits just off that corner.
		x = tip.x - w + POINTER_SPAN * 0.55
		y = tip.y - stack - h
	elif anchor.size.x > 4.0:
		x = anchor.end.x - w
		y = anchor.position.y - stack - h
	return Vector2(x, y)


func _place_card(hole: Rect2, vp: Vector2, placement: String) -> void:
	_card.custom_minimum_size.x = CARD_W
	_card.reset_size()
	var card_size := _card.get_combined_minimum_size()
	var w := maxf(CARD_W, card_size.x)
	var h := maxf(card_size.y, _min_card_height_for_step())
	_card.size = Vector2(w, h)
	var pos := Vector2((vp.x - w) * 0.5, (vp.y - h) * 0.5)
	if TutorialManager.step_id() == "mission_timer":
		pos = _mission_timer_card_pos(hole, vp, w, h)
	elif TutorialManager.step_id() == "mission_fight":
		pos = Vector2(hole.position.x + hole.size.x * 0.5 - w * 0.5, hole.end.y + CARD_HOLE_GAP)
	elif TutorialManager.step_id() == "mine_explain":
		pos = _mine_explain_card_pos(hole, vp, w, h)
	elif TutorialManager.step_id() in ["frontier_fight", "mission_return"]:
		pos = _frontier_fight_card_pos(vp, w, h)
	elif TutorialManager.step_id() == "finish":
		pos = _finish_card_pos(vp, w, h)
	elif TutorialManager.step_id() == "shop_market":
		pos = _shop_market_card_pos(vp, w, h)
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
			"bottom_right":
				pos = Vector2(vp.x - w - CARD_PAD, vp.y - h - CARD_PAD)
			_:
				pos = Vector2((vp.x - w) * 0.5, (vp.y - h) * 0.5)
	pos.x = clampf(pos.x, CARD_PAD, maxf(CARD_PAD, vp.x - w - CARD_PAD))
	pos.y = clampf(pos.y, CARD_PAD, maxf(CARD_PAD, vp.y - h - CARD_PAD))
	if TutorialManager.step_id() == "mission_timer":
		# Prefer keeping the bottom-right stacked over the countdown after clamp.
		var tip := _mission_timer_tip_anchor()
		var bar := _mission_timer_bar_rect()
		if tip != Vector2.ZERO:
			pos.x = clampf(
				tip.x - w + POINTER_SPAN * 0.55,
				CARD_PAD,
				maxf(CARD_PAD, vp.x - w - CARD_PAD)
			)
		if bar.size.y > 1.0:
			var stacked_y := bar.position.y - (MISSION_TIMER_STACK_GAP + POINTER_SPAN + MISSION_TIMER_STACK_GAP) - h
			pos.y = clampf(stacked_y, CARD_PAD, maxf(CARD_PAD, vp.y - h - CARD_PAD))
	# Never cover the spotlight hole if we can slide off it.
	# shop_market intentionally sits on the sell tray (bottom-right).
	# mine_explain is pinned under the stardust preview (centered).
	# finish is centered in the content stage.
	# frontier_fight sits on empty starfield at the map's top-left.
	if TutorialManager.step_id() not in ["mission_timer", "mission_fight", "shop_market", "mine_explain", "finish", "frontier_fight", "mission_return"] and hole.size.x > 1.0:
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


func _mine_explain_card_pos(hole: Rect2, vp: Vector2, w: float, h: float) -> Vector2:
	## Center under the stardust-gained preview chip (fallback: hole / screen center).
	var x := (vp.x - w) * 0.5
	var y := (vp.y - h) * 0.5
	var anchor := hole
	if anchor.size.x <= 4.0:
		anchor = _hole_for_tutorial_id("mine-stardust")
	if anchor.size.x > 4.0:
		x = anchor.position.x + anchor.size.x * 0.5 - w * 0.5
		y = anchor.end.y + CARD_HOLE_GAP
	return Vector2(x, y)


func _frontier_fight_card_pos(vp: Vector2, w: float, h: float) -> Vector2:
	## Top-left of the galactic frontier map window — sits on empty starfield,
	## leaving planet detail / encounters / fight controls free.
	var map := _hole_for_tutorial_id("galaxy-map")
	if map.size.x > 4.0 and map.size.y > 4.0:
		return Vector2(map.position.x + CARD_PAD, map.position.y + CARD_PAD)
	var region := _content_stage_rect()
	if region.size.x > 4.0 and region.size.y > 4.0:
		return Vector2(region.position.x + CARD_PAD, region.position.y + CARD_PAD)
	return Vector2(CARD_PAD, CARD_PAD)


func _finish_card_pos(vp: Vector2, w: float, h: float) -> Vector2:
	## Center in the content page (right of the side rail), not the full window.
	var region := _content_stage_rect()
	if region.size.x > 4.0 and region.size.y > 4.0:
		return Vector2(
			region.position.x + (region.size.x - w) * 0.5,
			region.position.y + (region.size.y - h) * 0.5
		)
	return Vector2((vp.x - w) * 0.5, (vp.y - h) * 0.5)


func _content_stage_rect() -> Rect2:
	var tree := get_tree()
	if tree == null:
		return Rect2()
	var shell := tree.get_first_node_in_group("game_shell")
	if shell == null or not is_instance_valid(shell):
		return Rect2()
	var stage := shell.find_child("ContentStage", true, false)
	if stage is Control and is_instance_valid(stage) and (stage as Control).is_visible_in_tree():
		return (stage as Control).get_global_rect()
	return Rect2()


func _shop_market_card_pos(vp: Vector2, w: float, h: float) -> Vector2:
	## Pin the coach over the sell tray (bottom-right) so buy stalls stay readable.
	var sell := _find_tutorial_target("shop-sell-tray")
	if sell != null and is_instance_valid(sell) and sell.is_visible_in_tree():
		var gr: Rect2 = sell.get_global_rect()
		var x := gr.end.x - w
		var y := gr.position.y
		# Keep the card on-screen; prefer sitting on the sell block.
		if y + h > vp.y - CARD_PAD:
			y = vp.y - h - CARD_PAD
		if y < CARD_PAD:
			y = CARD_PAD
		return Vector2(x, y)
	return Vector2(vp.x - w - CARD_PAD, vp.y - h - CARD_PAD)


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
	# Slow informational pulse — fuel is shown, not a forced interaction target.
	_fuel_flash_tween.tween_property(
		target, "modulate", Color(1.06, 1.16, 1.08, 1.0), FUEL_HINT_FLASH_HALF_SEC
	).set_trans(Tween.TRANS_SINE)
	_fuel_flash_tween.tween_property(
		target, "modulate", Color.WHITE, FUEL_HINT_FLASH_HALF_SEC
	).set_trans(Tween.TRANS_SINE)


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
	# shop_market uses coach-layer outline rings (see _layout_shop_outline_rings).
	return


func _stop_stim_flash() -> void:
	if _stim_flash_tween != null and is_instance_valid(_stim_flash_tween):
		_stim_flash_tween.kill()
	_stim_flash_tween = null
	if _stim_flash_target != null and is_instance_valid(_stim_flash_target):
		_stim_flash_target.modulate = Color.WHITE
	_stim_flash_target = null


func _update_shop_refresh_hint() -> void:
	_stop_shop_refresh_flash()
	# Replaced by outline rings — modulate flashes were restarted every 0.2s by
	# _layout_spotlight and never completed a visible pulse.
	return


func _stop_shop_refresh_flash() -> void:
	if _shop_refresh_flash_tween != null and is_instance_valid(_shop_refresh_flash_tween):
		_shop_refresh_flash_tween.kill()
	_shop_refresh_flash_tween = null
	if _shop_refresh_flash_target != null and is_instance_valid(_shop_refresh_flash_target):
		_shop_refresh_flash_target.modulate = Color.WHITE
	_shop_refresh_flash_target = null


func _update_shop_restock_hint() -> void:
	_stop_shop_restock_flash()
	# Replaced by outline rings (same restart bug as refresh flash).
	return


func _stop_shop_restock_flash() -> void:
	if _shop_restock_flash_tween != null and is_instance_valid(_shop_restock_flash_tween):
		_shop_restock_flash_tween.kill()
	_shop_restock_flash_tween = null
	if _shop_restock_flash_target != null and is_instance_valid(_shop_restock_flash_target):
		_shop_restock_flash_target.modulate = Color.WHITE
	_shop_restock_flash_target = null


func _shop_outline_target_ids() -> Array:
	return ["shop-stim", "shop-restock", "shop-refresh-timer"]


func _layout_shop_outline_rings() -> void:
	if (
		not visible
		or TutorialManager.step_id() != "shop_market"
		or not TutorialManager.is_on_required_page()
	):
		_stop_shop_outline_rings()
		return
	var holes: Array = []
	for tid in _shop_outline_target_ids():
		var hole := _hole_for_tutorial_id(str(tid))
		if hole.size.x > 4.0 and hole.size.y > 4.0:
			holes.append(hole)
	if holes.is_empty():
		_stop_shop_outline_rings()
		return
	for i in _shop_outline_rings.size():
		var ring: Panel = _shop_outline_rings[i]
		if not is_instance_valid(ring):
			continue
		if i < holes.size():
			var hole: Rect2 = holes[i]
			ring.visible = true
			ring.position = hole.position
			ring.size = hole.size
		else:
			ring.visible = false
	_pulse_shop_outline_rings()


func _pulse_shop_outline_rings() -> void:
	## Border-only pulse on coach rings (not button modulate). Do not restart
	## every layout tick — that was why shop flashes looked absent in-game.
	if _shop_outline_pulse_running:
		return
	_shop_outline_pulse_running = true
	_shop_outline_pulses.clear()
	var dim := Color(RING_BORDER.r, RING_BORDER.g, RING_BORDER.b, 0.18)
	var bright := Color(RING_BORDER.r, RING_BORDER.g, RING_BORDER.b, 0.92)
	for ring_v in _shop_outline_rings:
		var ring: Panel = ring_v
		if not is_instance_valid(ring):
			continue
		var sb := ring.get_theme_stylebox("panel") as StyleBoxFlat
		if sb == null:
			continue
		sb.shadow_size = 0
		sb.bg_color = Color(0, 0, 0, 0)
		sb.border_color = dim
		var tw := create_tween().set_loops()
		tw.tween_property(sb, "border_color", bright, SHOP_OUTLINE_RING_HALF_SEC).set_trans(Tween.TRANS_SINE)
		tw.tween_property(sb, "border_color", dim, SHOP_OUTLINE_RING_HALF_SEC).set_trans(Tween.TRANS_SINE)
		_shop_outline_pulses.append(tw)


func _stop_shop_outline_rings() -> void:
	for tw_v in _shop_outline_pulses:
		if tw_v != null and is_instance_valid(tw_v):
			(tw_v as Tween).kill()
	_shop_outline_pulses.clear()
	_shop_outline_pulse_running = false
	for ring_v in _shop_outline_rings:
		var ring: Panel = ring_v
		if not is_instance_valid(ring):
			continue
		ring.visible = false
		var sb := ring.get_theme_stylebox("panel") as StyleBoxFlat
		if sb != null:
			sb.border_color = RING_BORDER
			sb.shadow_size = 0
			sb.bg_color = Color(0, 0, 0, 0)


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
	_ranks_flash_tween.tween_property(
		target, "modulate", Color(1.12, 1.22, 1.38, 1.0), RANKS_HINT_FLASH_HALF_SEC
	).set_trans(Tween.TRANS_SINE)
	_ranks_flash_tween.tween_property(
		target, "modulate", Color.WHITE, RANKS_HINT_FLASH_HALF_SEC
	).set_trans(Tween.TRANS_SINE)


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
	_start_flash_tween.tween_property(
		target, "modulate", Color(1.10, 1.28, 1.08, 1.0), START_HINT_FLASH_HALF_SEC
	).set_trans(Tween.TRANS_SINE)
	_start_flash_tween.tween_property(
		target, "modulate", Color.WHITE, START_HINT_FLASH_HALF_SEC
	).set_trans(Tween.TRANS_SINE)


func _stop_start_flash() -> void:
	if _start_flash_tween != null and is_instance_valid(_start_flash_tween):
		_start_flash_tween.kill()
	_start_flash_tween = null
	if _start_flash_target != null and is_instance_valid(_start_flash_target):
		_start_flash_target.modulate = Color.WHITE
	_start_flash_target = null


func _update_reward_hints() -> void:
	_stop_reward_flashes()
	if not visible or TutorialManager.step_id() != "click_hero":
		return
	if not TutorialManager.post_combat_overlay_visible():
		return
	_start_reward_flash("combat-reward-stardust", true)
	_start_reward_flash("combat-reward-helmet", false)


func _start_reward_flash(tutorial_id: String, is_stardust: bool) -> void:
	var target := _find_tutorial_target(tutorial_id)
	if target == null or not is_instance_valid(target):
		return
	target.modulate = Color.WHITE
	var tw := target.create_tween().set_loops()
	# Slow subtle pulse — draw the eye to loot they'll spend/equip next.
	var peak := Color(1.10, 1.18, 1.05, 1.0) if is_stardust else Color(1.08, 1.14, 1.20, 1.0)
	tw.tween_property(target, "modulate", peak, REWARD_HINT_FLASH_HALF_SEC).set_trans(Tween.TRANS_SINE)
	tw.tween_property(target, "modulate", Color.WHITE, REWARD_HINT_FLASH_HALF_SEC).set_trans(Tween.TRANS_SINE)
	if is_stardust:
		_reward_stardust_flash_tween = tw
		_reward_stardust_flash_target = target
	else:
		_reward_helmet_flash_tween = tw
		_reward_helmet_flash_target = target


func _stop_reward_flashes() -> void:
	if _reward_stardust_flash_tween != null and is_instance_valid(_reward_stardust_flash_tween):
		_reward_stardust_flash_tween.kill()
	_reward_stardust_flash_tween = null
	if _reward_stardust_flash_target != null and is_instance_valid(_reward_stardust_flash_target):
		_reward_stardust_flash_target.modulate = Color.WHITE
	_reward_stardust_flash_target = null
	if _reward_helmet_flash_tween != null and is_instance_valid(_reward_helmet_flash_tween):
		_reward_helmet_flash_tween.kill()
	_reward_helmet_flash_tween = null
	if _reward_helmet_flash_target != null and is_instance_valid(_reward_helmet_flash_target):
		_reward_helmet_flash_target.modulate = Color.WHITE
	_reward_helmet_flash_target = null


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


func _secondary_spotlight_id_for_step() -> String:
	return ""


func _secondary_spotlight_subtle(step_id: String) -> bool:
	return false


func _layout_secondary_spotlight_ring() -> void:
	_stop_extra_ring_pulse()
	if not is_instance_valid(_ring_extra):
		return
	_ring_extra.visible = false
	if not TutorialManager.is_on_required_page():
		return
	var sid := _secondary_spotlight_id_for_step()
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
	_pulse_extra_ring(_secondary_spotlight_subtle(TutorialManager.step_id()))


func _uses_spotlight_ring() -> bool:
	# mission_start already flashes the START MISSION button; the ring top border
	# reads as a full-width cyan hairline above the wide button.
	# shop_market uses dedicated outline rings on stim / restock / refresh timer.
	return TutorialManager.step_id() not in ["mission_start", "shop_market"]


func _pulse_ring(slow: bool = false) -> void:
	if (
		_ring_pulse != null
		and is_instance_valid(_ring_pulse)
		and _ring_pulse.is_running()
		and _ring_pulse_slow == slow
	):
		return
	_stop_ring_pulse()
	_reset_ring_style()
	var sb := _ring.get_theme_stylebox("panel") as StyleBoxFlat
	if sb == null:
		return
	# Border-only pulse — no modulate/shadow glow over the spotlight target.
	sb.shadow_size = 0
	var dim_alpha := 0.22 if slow else 0.32
	var bright_alpha := 0.85 if slow else 1.0
	var dim := Color(RING_BORDER.r, RING_BORDER.g, RING_BORDER.b, dim_alpha)
	var bright := Color(RING_BORDER.r, RING_BORDER.g, RING_BORDER.b, bright_alpha)
	sb.border_color = dim
	_ring_pulse_slow = slow
	var half := HERO_FLASH_RING_HALF_SEC if slow else 0.55
	_ring_pulse = create_tween().set_loops()
	_ring_pulse.tween_property(sb, "border_color", bright, half).set_trans(Tween.TRANS_SINE)
	_ring_pulse.tween_property(sb, "border_color", dim, half).set_trans(Tween.TRANS_SINE)


func _stop_ring_pulse() -> void:
	if _ring_pulse != null and is_instance_valid(_ring_pulse):
		_ring_pulse.kill()
	_ring_pulse = null
	_ring_pulse_slow = false
	_reset_ring_style()


func _pulse_extra_ring(subtle: bool = false) -> void:
	# subtle == slow hero-flash pace (HERO_FLASH_RING_HALF_SEC)
	if (
		_ring_extra_pulse != null
		and is_instance_valid(_ring_extra_pulse)
		and _ring_extra_pulse.is_running()
		and _ring_extra_pulse_slow == subtle
	):
		return
	_stop_extra_ring_pulse()
	_reset_extra_ring_style()
	var sb := _ring_extra.get_theme_stylebox("panel") as StyleBoxFlat
	if sb == null:
		return
	sb.shadow_size = 0
	var dim_alpha := 0.22 if subtle else 0.32
	var bright_alpha := 0.85 if subtle else 1.0
	var dim := Color(RING_BORDER.r, RING_BORDER.g, RING_BORDER.b, dim_alpha)
	var bright := Color(RING_BORDER.r, RING_BORDER.g, RING_BORDER.b, bright_alpha)
	sb.border_color = dim
	_ring_extra_pulse_slow = subtle
	var half := HERO_FLASH_RING_HALF_SEC if subtle else 0.55
	_ring_extra_pulse = create_tween().set_loops()
	_ring_extra_pulse.tween_property(sb, "border_color", bright, half).set_trans(Tween.TRANS_SINE)
	_ring_extra_pulse.tween_property(sb, "border_color", dim, half).set_trans(Tween.TRANS_SINE)


func _stop_extra_ring_pulse() -> void:
	if _ring_extra_pulse != null and is_instance_valid(_ring_extra_pulse):
		_ring_extra_pulse.kill()
	_ring_extra_pulse = null
	_ring_extra_pulse_slow = false
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
	_pointer.texture = UiIcon.texture("triangle")
	if TutorialManager.step_id() == "mission_timer":
		_place_mission_timer_pointer(hole, vp)
		return
	var card_center := _card.position + _card.size * 0.5
	var hole_center := hole.get_center()
	if hole_center.x < card_center.x:
		# Point left (toward hole on the left of the card).
		_pointer.rotation_degrees = 270
		_pointer.position = Vector2(hole.end.x + POINTER_INSET, hole_center.y - POINTER_SPAN * 0.5)
	elif hole_center.x > card_center.x:
		# Point right.
		_pointer.rotation_degrees = 90
		_pointer.position = Vector2(hole.position.x - POINTER_INSET - POINTER_SPAN, hole_center.y - POINTER_SPAN * 0.5)
	elif hole_center.y < card_center.y:
		# Point up.
		_pointer.rotation_degrees = 0
		_pointer.position = Vector2(hole_center.x - POINTER_SPAN * 0.35, hole.end.y + POINTER_INSET)
	else:
		# Point down.
		_pointer.rotation_degrees = 180
		_pointer.position = Vector2(hole_center.x - POINTER_SPAN * 0.35, hole.position.y - POINTER_INSET - POINTER_SPAN)
	_pointer.position.x = clampf(_pointer.position.x, 8.0, vp.x - POINTER_SPAN)
	_pointer.position.y = clampf(_pointer.position.y, 8.0, vp.y - POINTER_SPAN)


func _place_mission_timer_pointer(hole: Rect2, vp: Vector2) -> void:
	## Triangle in the small gap under the card's bottom-right, aimed at the countdown.
	_pointer.rotation_degrees = 180
	var tip := _mission_timer_tip_anchor()
	var gap := MISSION_TIMER_STACK_GAP
	var card_br := _card.position + Vector2(_card.size.x, _card.size.y)
	var px := card_br.x - POINTER_SPAN - 2.0
	var py := _card.position.y + _card.size.y + gap
	if tip != Vector2.ZERO:
		# Keep the chevron nearly above the countdown while staying off the card BR.
		px = clampf(tip.x - POINTER_SPAN * 0.35, card_br.x - POINTER_SPAN - 10.0, card_br.x - POINTER_SPAN * 0.25)
		var bar := _mission_timer_bar_rect()
		if bar.size.y > 1.0:
			py = minf(py, bar.position.y - gap - POINTER_SPAN)
	elif hole.size.y > 1.0:
		py = minf(py, hole.position.y - gap - POINTER_SPAN)
	_pointer.position = Vector2(px, py)
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
