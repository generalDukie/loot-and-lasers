class_name ItemInspectPopup
extends PanelContainer
## Polished item inspection panel — hover stays open across item ↔ tooltip.
## Sectioned body so rarity / compare / sell / flavor can grow without redesign.

signal action_pressed(action_id: String, item: Dictionary)
signal closed

const HIDE_DELAY_S := 0.16
const MAX_W := 640.0
const PAD_X := 10
const PAD_Y := 8
const ICON_SZ := 42.0
const TITLE_FS := 19
const META_FS := 14
const BODY_FS := 15
const VAL_FS := 17
const DELTA_FS := 15
const STAT_ICON := 22.0
const ACTION_H := 32.0

var _pad: MarginContainer
var _root: VBoxContainer
## Named section hosts for future content (flavor, set bonuses, upgrades…).
var _section_header: VBoxContainer
var _section_meta: VBoxContainer
var _section_compare: VBoxContainer
var _section_stats: VBoxContainer
var _section_extras: VBoxContainer
var _section_footer: VBoxContainer
var _section_actions: HBoxContainer

var _anchor: Control = null
var _item: Dictionary = {}
var _hide_token := 0
var _open := false
var _tween: Tween


func _ready() -> void:
	visible = false
	modulate.a = 0.0
	scale = Vector2(0.96, 0.96)
	z_index = 90
	mouse_filter = Control.MOUSE_FILTER_STOP
	# Top-level so the card never reflows Hero/Shop layout.
	set_as_top_level(true)
	size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	custom_minimum_size = Vector2.ZERO
	clip_contents = false
	_build_chrome()
	mouse_entered.connect(_on_popup_mouse_entered)
	mouse_exited.connect(_on_popup_mouse_exited)


func _build_chrome() -> void:
	_pad = MarginContainer.new()
	_pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pad.add_theme_constant_override("margin_left", PAD_X)
	_pad.add_theme_constant_override("margin_right", PAD_X)
	_pad.add_theme_constant_override("margin_top", PAD_Y)
	_pad.add_theme_constant_override("margin_bottom", PAD_Y)
	add_child(_pad)

	_root = VBoxContainer.new()
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_theme_constant_override("separation", 4)
	_root.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_pad.add_child(_root)

	_section_header = _make_section(2)
	_section_meta = _make_section(2)
	_section_compare = _make_section(2)
	_section_stats = _make_section(2)
	_section_extras = _make_section(3)
	_section_footer = _make_section(2)

	_section_actions = HBoxContainer.new()
	_section_actions.add_theme_constant_override("separation", 6)
	_section_actions.mouse_filter = Control.MOUSE_FILTER_STOP
	_section_actions.visible = false
	_root.add_child(_section_actions)


func _make_section(sep: int) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_theme_constant_override("separation", sep)
	box.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_root.add_child(box)
	return box


func present(anchor: Control, item: Dictionary, options: Dictionary = {}) -> void:
	if anchor == null or not is_instance_valid(anchor) or item.is_empty():
		return
	_cancel_hide()
	_anchor = anchor
	_item = item.duplicate(true)
	_rebuild(options)
	_apply_frame_style(ClientUi.rarity_color(str(item.get("rarity", ""))))
	visible = true
	_open = true
	_fit_to_content()
	_position_near(anchor)
	_play_open_anim()


func _fit_to_content() -> void:
	## Single-line when possible; wrap only past MAX_W. Size == content, no floor.
	_set_wrap_labels(self, false, 0.0)
	custom_minimum_size = Vector2.ZERO
	reset_size()
	var pad := float(PAD_X) * 2.0
	var inner := 0.0
	for box in [
		_section_header, _section_meta, _section_compare, _section_stats,
		_section_extras, _section_footer, _section_actions,
	]:
		if box != null and box.visible:
			inner = maxf(inner, box.get_combined_minimum_size().x)
	var max_inner := MAX_W - pad
	if inner > max_inner:
		_set_wrap_labels(self, true, max_inner)
		inner = max_inner
		reset_size()
	custom_minimum_size = Vector2.ZERO
	reset_size()
	var sz := get_combined_minimum_size()
	sz.x = minf(sz.x, MAX_W)
	size = sz


func _set_wrap_labels(n: Node, wrap: bool, inner_w: float) -> void:
	if n is Label and bool(n.get_meta("inspect_wrap", false)):
		var lab := n as Label
		if wrap:
			var inset := float(lab.get_meta("inspect_wrap_inset", 0.0))
			lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			lab.custom_minimum_size.x = maxf(80.0, inner_w - inset)
		else:
			lab.autowrap_mode = TextServer.AUTOWRAP_OFF
			lab.custom_minimum_size.x = 0
	for c in n.get_children():
		_set_wrap_labels(c, wrap, inner_w)


func request_hide() -> void:
	## Short delay so the cursor can cross the gap between item and popup.
	_hide_token += 1
	var token := _hide_token
	get_tree().create_timer(HIDE_DELAY_S).timeout.connect(func() -> void:
		if token != _hide_token:
			return
		if _pointer_over_zone():
			return
		force_hide()
	)


func force_hide() -> void:
	_cancel_hide()
	_open = false
	_anchor = null
	_item = {}
	if _tween != null and is_instance_valid(_tween):
		_tween.kill()
	_tween = null
	visible = false
	modulate.a = 0.0
	scale = Vector2(0.96, 0.96)
	closed.emit()


func is_showing_item(item_id: String) -> bool:
	return _open and str(_item.get("id", "")) == str(item_id)


func current_item() -> Dictionary:
	return _item


func _cancel_hide() -> void:
	_hide_token += 1


func _on_popup_mouse_entered() -> void:
	_cancel_hide()


func _on_popup_mouse_exited() -> void:
	request_hide()


func is_pointer_over_zone() -> bool:
	var mouse := get_viewport().get_mouse_position()
	if visible and get_global_rect().grow(4.0).has_point(mouse):
		return true
	if _anchor != null and is_instance_valid(_anchor):
		if _anchor.get_global_rect().grow(4.0).has_point(mouse):
			return true
	return false


func _pointer_over_zone() -> bool:
	return is_pointer_over_zone()


func _play_open_anim() -> void:
	if _tween != null and is_instance_valid(_tween):
		_tween.kill()
	pivot_offset = size * 0.5
	modulate.a = 0.0
	scale = Vector2(0.96, 0.96)
	_tween = create_tween().set_parallel(true)
	_tween.tween_property(self, "modulate:a", 1.0, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_tween.tween_property(self, "scale", Vector2.ONE, 0.14).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _apply_frame_style(accent: Color) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.035, 0.05, 0.1, 0.98)
	sb.border_color = Color(accent, 0.92)
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 0
	sb.content_margin_right = 0
	sb.content_margin_top = 0
	sb.content_margin_bottom = 0
	sb.shadow_color = Color(accent.r, accent.g, accent.b, 0.22)
	sb.shadow_size = 4
	sb.shadow_offset = Vector2(0, 2)
	add_theme_stylebox_override("panel", sb)


func _clear_section(box: Container) -> void:
	while box.get_child_count() > 0:
		var c: Node = box.get_child(0)
		box.remove_child(c)
		c.free()


func _rebuild(options: Dictionary) -> void:
	_clear_section(_section_header)
	_clear_section(_section_meta)
	_clear_section(_section_compare)
	_clear_section(_section_stats)
	_clear_section(_section_extras)
	_clear_section(_section_footer)
	_clear_section(_section_actions)
	_section_actions.visible = false

	var item := _item
	var item_type := str(item.get("type", ""))
	var tint := ClientUi.rarity_color(str(item.get("rarity", "")))
	var equipped_preview := bool(options.get("equipped_preview", false))
	var compare_with: Dictionary = options.get("compare_with", {}) if typeof(options.get("compare_with", {})) == TYPE_DICTIONARY else {}
	var show_sell := bool(options.get("show_sell_value", false))
	var actions: Array = options.get("actions", []) if typeof(options.get("actions", [])) == TYPE_ARRAY else []

	var icon_box := ICON_SZ + 4.0

	# —— Header: icon + name ——
	var head := HBoxContainer.new()
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_theme_constant_override("separation", 8)
	head.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_section_header.add_child(head)

	var icon_wrap := CenterContainer.new()
	icon_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_wrap.custom_minimum_size = Vector2(icon_box, icon_box)
	head.add_child(icon_wrap)
	var icon_panel := PanelContainer.new()
	icon_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_panel.custom_minimum_size = Vector2(icon_box, icon_box)
	var icon_sb := StyleBoxFlat.new()
	icon_sb.bg_color = Color(tint, 0.14)
	icon_sb.border_color = Color(tint, 0.65)
	icon_sb.set_border_width_all(1)
	icon_sb.set_corner_radius_all(8)
	icon_panel.add_theme_stylebox_override("panel", icon_sb)
	icon_wrap.add_child(icon_panel)
	var icon_center := CenterContainer.new()
	icon_center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_panel.add_child(icon_center)
	icon_center.add_child(GearIcon.make(item, ICON_SZ))

	var title_col := VBoxContainer.new()
	title_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_col.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	title_col.add_theme_constant_override("separation", 1)
	head.add_child(title_col)

	var title := Label.new()
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = str(item.get("name", "Item"))
	title.autowrap_mode = TextServer.AUTOWRAP_OFF
	title.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	title.set_meta("inspect_wrap", true)
	title.set_meta("inspect_wrap_inset", icon_box + 8.0)
	title.add_theme_font_size_override("font_size", TITLE_FS)
	title.add_theme_color_override("font_color", tint.lightened(0.22))
	ClientUi.apply_display_font(title)
	title_col.add_child(title)

	var rarity_lab := Label.new()
	rarity_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rarity_lab.text = str(item.get("rarity", "common")).capitalize()
	rarity_lab.add_theme_font_size_override("font_size", META_FS)
	rarity_lab.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(rarity_lab)
	title_col.add_child(rarity_lab)

	# —— Meta ——
	var type_label := item_type
	if not item_type.is_empty():
		type_label = str(GameData.gear_type_label(item_type))
	var meta := Label.new()
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meta.text = "%s · Requires Lv %s" % [
		type_label if not type_label.is_empty() else "Item",
		ClientUi.format_level(item.get("level_requirement", "?")),
	]
	meta.autowrap_mode = TextServer.AUTOWRAP_OFF
	meta.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	meta.set_meta("inspect_wrap", true)
	meta.add_theme_font_size_override("font_size", META_FS)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	_section_meta.add_child(meta)

	# —— Compare banner ——
	if not equipped_preview and not compare_with.is_empty():
		var eq_lab := Label.new()
		eq_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
		eq_lab.text = "Compared to equipped: %s" % str(compare_with.get("name", "gear"))
		eq_lab.autowrap_mode = TextServer.AUTOWRAP_OFF
		eq_lab.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		eq_lab.set_meta("inspect_wrap", true)
		eq_lab.add_theme_font_size_override("font_size", META_FS)
		eq_lab.add_theme_color_override("font_color", Color(ClientUi.CYAN_SOFT, 0.9))
		ClientUi.apply_body_font(eq_lab)
		_section_compare.add_child(eq_lab)

	# —— Stats / stims ——
	if InventoryRules.is_consumable(item):
		var cons: Dictionary = item.get("consumable", {}) if typeof(item.get("consumable", {})) == TYPE_DICTIONARY else {}
		var stim := Label.new()
		stim.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stim.text = "Stim · %s +%s%% · %sh" % [
			str(cons.get("stat", "?")).capitalize(),
			str(int(round(float(cons.get("mult", 0)) * 100.0))),
			str(cons.get("duration_hours", "?")),
		]
		stim.add_theme_font_size_override("font_size", BODY_FS)
		stim.add_theme_color_override("font_color", ClientUi.CYAN)
		ClientUi.apply_body_font(stim)
		_section_stats.add_child(stim)
	elif equipped_preview:
		_fill_absolute_stats(item)
	else:
		_fill_compare_stats(item, compare_with)

	# —— Extras (sell value now; set bonuses / flavor later) ——
	if show_sell and not InventoryRules.is_consumable(item):
		var sell := Label.new()
		sell.mouse_filter = Control.MOUSE_FILTER_IGNORE
		sell.text = "Sell value · ✦ %s" % InventoryRules.estimate_sell_value(item)
		sell.add_theme_font_size_override("font_size", META_FS)
		sell.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
		ClientUi.apply_display_font(sell)
		_section_extras.add_child(sell)

	var flavor := str(item.get("flavor", item.get("description", ""))).strip_edges()
	if not flavor.is_empty():
		var flav := Label.new()
		flav.mouse_filter = Control.MOUSE_FILTER_IGNORE
		flav.text = flavor
		flav.autowrap_mode = TextServer.AUTOWRAP_OFF
		flav.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		flav.set_meta("inspect_wrap", true)
		flav.add_theme_font_size_override("font_size", META_FS)
		flav.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.95))
		ClientUi.apply_body_font(flav)
		_section_extras.add_child(flav)

	# —— Footer total delta ——
	if not equipped_preview and InventoryRules.is_equippable(item_type):
		var diffs: Dictionary = InventoryRules.compare_gear_attributes(item, compare_with)
		var total: int = int(diffs.get("total", 0))
		var footer := HBoxContainer.new()
		footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
		footer.add_theme_constant_override("separation", 6)
		var total_lab := Label.new()
		total_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
		total_lab.text = "TOTAL STAT CHANGE"
		total_lab.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		total_lab.add_theme_font_size_override("font_size", META_FS)
		total_lab.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(total_lab)
		footer.add_child(total_lab)
		var total_val := Label.new()
		total_val.mouse_filter = Control.MOUSE_FILTER_IGNORE
		total_val.text = InventoryRules.format_stat_delta(total)
		total_val.add_theme_font_size_override("font_size", BODY_FS)
		total_val.add_theme_color_override(
			"font_color",
			ClientUi.SUCCESS if total > 0 else (ClientUi.DANGER if total < 0 else ClientUi.MUTED)
		)
		ClientUi.apply_display_font(total_val)
		footer.add_child(total_val)
		_section_footer.add_child(footer)

	# —— Actions ——
	if not actions.is_empty():
		_section_actions.visible = true
		for a in actions:
			if typeof(a) != TYPE_DICTIONARY:
				continue
			var aid := str(a.get("id", ""))
			var label := str(a.get("label", aid))
			if aid.is_empty():
				continue
			var btn := Button.new()
			btn.text = label
			btn.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
			btn.custom_minimum_size.y = ACTION_H
			ClientUi.apply_primary_button(btn)
			btn.add_theme_font_size_override("font_size", META_FS)
			var captured_id := aid
			var captured_item := item.duplicate(true)
			btn.pressed.connect(func() -> void:
				action_pressed.emit(captured_id, captured_item)
			)
			_section_actions.add_child(btn)

	_section_header.visible = _section_header.get_child_count() > 0
	_section_meta.visible = _section_meta.get_child_count() > 0
	_section_compare.visible = _section_compare.get_child_count() > 0
	_section_stats.visible = _section_stats.get_child_count() > 0
	_section_extras.visible = _section_extras.get_child_count() > 0
	_section_footer.visible = _section_footer.get_child_count() > 0


func _fill_absolute_stats(item: Dictionary) -> void:
	var stats_raw: Variant = item.get("stats", {})
	if typeof(stats_raw) != TYPE_DICTIONARY:
		return
	for k in stats_raw.keys():
		var v := int(stats_raw[k])
		if v == 0:
			continue
		_section_stats.add_child(_stat_row(str(k), v, null))


func _fill_compare_stats(item: Dictionary, worn: Dictionary) -> void:
	for row in InventoryRules.compare_lines(item, worn):
		var nv: int = int(row.get("new", 0))
		var d: int = int(row.get("delta", 0))
		var show_delta := InventoryRules.is_equippable(str(item.get("type", "")))
		_section_stats.add_child(_stat_row(str(row.get("stat", "")), nv, d if show_delta else null))


func _stat_row(stat_key: String, value: int, delta) -> Control:
	var lab := HBoxContainer.new()
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	lab.add_theme_constant_override("separation", 6)
	if StatIcon.has(stat_key):
		lab.add_child(StatIcon.make(stat_key, STAT_ICON))
	var abbr := Label.new()
	abbr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	abbr.text = stat_key.substr(0, 3).to_upper() if not stat_key.is_empty() else "?"
	abbr.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	abbr.add_theme_font_size_override("font_size", BODY_FS)
	abbr.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(abbr)
	lab.add_child(abbr)
	var val := Label.new()
	val.mouse_filter = Control.MOUSE_FILTER_IGNORE
	val.text = ("+%s" % value) if value > 0 else "0"
	val.add_theme_font_size_override("font_size", VAL_FS)
	val.add_theme_color_override("font_color", ClientUi.TEXT if value > 0 else ClientUi.MUTED)
	ClientUi.apply_body_font(val)
	lab.add_child(val)
	if delta != null:
		var d: int = int(delta)
		var dlab := Label.new()
		dlab.mouse_filter = Control.MOUSE_FILTER_IGNORE
		dlab.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		dlab.text = InventoryRules.format_stat_delta(d)
		dlab.add_theme_font_size_override("font_size", DELTA_FS)
		dlab.add_theme_color_override(
			"font_color",
			ClientUi.SUCCESS if d > 0 else (ClientUi.DANGER if d < 0 else ClientUi.MUTED)
		)
		ClientUi.apply_body_font(dlab)
		lab.add_child(dlab)
	return lab


func _position_near(anchor: Control) -> void:
	if anchor == null or not is_instance_valid(anchor):
		return
	var rect := anchor.get_global_rect()
	var sz := size
	var vp := get_viewport_rect().size
	var gap := 8.0
	# Prefer right of item; flip left; then above/below. Avoid covering the item.
	var candidates: Array[Vector2] = [
		Vector2(rect.end.x + gap, rect.position.y),
		Vector2(rect.position.x - sz.x - gap, rect.position.y),
		Vector2(rect.position.x, rect.position.y - sz.y - gap),
		Vector2(rect.position.x, rect.end.y + gap),
	]
	var best := candidates[0]
	var best_score := -INF
	for pos in candidates:
		var p: Vector2 = pos
		p.x = clampf(p.x, 8.0, maxf(8.0, vp.x - sz.x - 8.0))
		p.y = clampf(p.y, 8.0, maxf(8.0, vp.y - sz.y - 8.0))
		var popup_rect := Rect2(p, sz)
		var overlap := popup_rect.intersection(rect).get_area()
		var on_screen := popup_rect.get_area()
		var score := on_screen - overlap * 4.0
		# Prefer horizontal placements.
		if absf(p.y - rect.position.y) < 2.0:
			score += 80.0
		if score > best_score:
			best_score = score
			best = p
	global_position = best
