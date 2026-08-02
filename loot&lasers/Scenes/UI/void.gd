extends Control
## Void — mirrors web BlackHolePage (pending · hole drop target · junk · 2-col spare gear).

var _balance_lab: Label
var _status: Label
var _hole_hint: Label
var _hole_panel: PanelContainer
var _hole_drop: Control
var _hole_stage: Control
var _hole_material: ShaderMaterial
var _burst_layer: Control
var _fx_layer: Control
var _pending_banner: PanelContainer
var _pending_lab: Label
var _junk_btn: Button
var _grid: GridContainer
var _empty_panel: PanelContainer
var _items: Array = []
var _busy := false
var _hole_active := false
var _sucking_ids: Dictionary = {} # item_id -> true
var _card_by_id: Dictionary = {} # item_id -> PanelContainer


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	_set_status("Loading bag…", ClientUi.MUTED)
	await MissionManager.refresh_character()
	await InventoryManager.list_pending_loot()
	await _load_items()
	_populate()
	_set_status("", ClientUi.MUTED)


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "void"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 12)
	margin.add_child(root)

	# Header — web: Void + stardust chip
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)

	var title := Label.new()
	title.text = "◉  Void"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	header.add_child(title)

	var bal := PanelContainer.new()
	bal.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(GameData.STARDUST_COLOR, 0.10), Color(GameData.STARDUST_COLOR, 0.30), 999, 1
	))
	header.add_child(bal)
	_balance_lab = Label.new()
	_balance_lab.add_theme_font_size_override("font_size", 13)
	_balance_lab.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(_balance_lab)
	bal.add_child(_balance_lab)

	# Pending banner — web primary tint, no claim button (auto after dissolve)
	_pending_banner = PanelContainer.new()
	_pending_banner.visible = false
	_pending_banner.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(ClientUi.CYAN, 0.10), Color(ClientUi.CYAN, 0.40), 12, 1
	))
	root.add_child(_pending_banner)
	var prow := HBoxContainer.new()
	prow.add_theme_constant_override("separation", 10)
	_pending_banner.add_child(prow)
	var picon := Label.new()
	picon.text = "📦"
	picon.add_theme_font_size_override("font_size", 20)
	prow.add_child(picon)
	_pending_lab = Label.new()
	_pending_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_pending_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_pending_lab.add_theme_font_size_override("font_size", 12)
	_pending_lab.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_body_font(_pending_lab)
	prow.add_child(_pending_lab)

	# The Void — drag target
	_hole_panel = PanelContainer.new()
	_hole_panel.custom_minimum_size = Vector2(0, 240)
	_hole_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_set_hole_style(false)
	root.add_child(_hole_panel)

	_hole_drop = Control.new()
	_hole_drop.name = "HoleDrop"
	_hole_drop.custom_minimum_size = Vector2(0, 240)
	_hole_drop.mouse_filter = Control.MOUSE_FILTER_STOP
	_hole_drop.set_drag_forwarding(_hole_get_drag, _hole_can_drop, _hole_drop_data)
	_hole_panel.add_child(_hole_drop)

	_hole_stage = Control.new()
	_hole_stage.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_hole_stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hole_drop.add_child(_hole_stage)

	var black_hole := ColorRect.new()
	black_hole.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	black_hole.color = Color.WHITE
	black_hole.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader := load("res://Shaders/black_hole.gdshader") as Shader
	if shader != null:
		_hole_material = ShaderMaterial.new()
		_hole_material.shader = shader
		_hole_material.set_shader_parameter("activity", 0.72)
		black_hole.material = _hole_material
	_hole_stage.resized.connect(_sync_hole_aspect)
	_hole_stage.add_child(black_hole)

	# Web-style orbit rings over the shader (closest CSS ring equivalent).
	_add_orbit_ring(250.0, Color(ClientUi.VIOLET, 0.40), 14.0, -1.0)
	_add_orbit_ring(320.0, Color(ClientUi.CYAN, 0.30), 22.0, 1.0)

	_burst_layer = Control.new()
	_burst_layer.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_burst_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_burst_layer.z_index = 20
	_hole_stage.add_child(_burst_layer)

	_fx_layer = Control.new()
	_fx_layer.name = "SuckFxLayer"
	_fx_layer.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_fx_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx_layer.z_index = 50
	add_child(_fx_layer)

	_hole_hint = Label.new()
	_hole_hint.text = "Drag gear in to dissolve into stardust"
	_hole_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hole_hint.set_anchors_and_offsets_preset(PRESET_BOTTOM_WIDE)
	_hole_hint.offset_top = -36
	_hole_hint.offset_bottom = -12
	_hole_hint.add_theme_font_size_override("font_size", 11)
	_hole_hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_hole_hint)
	_hole_stage.add_child(_hole_hint)

	# Dissolve Junk — right-aligned like web
	var junk_row := HBoxContainer.new()
	junk_row.alignment = BoxContainer.ALIGNMENT_END
	root.add_child(junk_row)
	_junk_btn = Button.new()
	_junk_btn.text = "Dissolve Junk (0)"
	_junk_btn.tooltip_text = "Unequippables + common gear worse than equipped"
	_style_junk_button(_junk_btn)
	_junk_btn.pressed.connect(_on_junk)
	junk_row.add_child(_junk_btn)

	_status = ClientUi.make_status()
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	root.add_child(_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)

	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 10)
	scroll.add_child(list)

	_empty_panel = PanelContainer.new()
	_empty_panel.visible = false
	_empty_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.72), Color(0.35, 0.40, 0.48, 0.50), 16, 1
	))
	list.add_child(_empty_panel)
	var empty_col := VBoxContainer.new()
	empty_col.add_theme_constant_override("separation", 4)
	_empty_panel.add_child(empty_col)
	var empty_a := Label.new()
	empty_a.text = "No spare gear to dissolve."
	empty_a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	empty_a.add_theme_font_size_override("font_size", 13)
	empty_a.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(empty_a)
	empty_col.add_child(empty_a)
	var empty_b := Label.new()
	empty_b.text = "Complete missions or buy from the Black Market to find items."
	empty_b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	empty_b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	empty_b.add_theme_font_size_override("font_size", 11)
	empty_b.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.65))
	ClientUi.apply_body_font(empty_b)
	empty_col.add_child(empty_b)

	_grid = GridContainer.new()
	_grid.columns = 2
	_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grid.add_theme_constant_override("h_separation", 10)
	_grid.add_theme_constant_override("v_separation", 10)
	list.add_child(_grid)


func _add_orbit_ring(diameter: float, color: Color, period: float, direction: float) -> void:
	var ring := PanelContainer.new()
	ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ring.custom_minimum_size = Vector2(diameter, diameter)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0, 0, 0, 0)
	style.border_color = color
	style.set_border_width_all(2 if diameter < 300.0 else 1)
	style.set_corner_radius_all(int(diameter / 2.0))
	ring.add_theme_stylebox_override("panel", style)
	ring.set_anchors_preset(PRESET_CENTER)
	ring.grow_horizontal = Control.GROW_DIRECTION_BOTH
	ring.grow_vertical = Control.GROW_DIRECTION_BOTH
	ring.offset_left = -diameter / 2.0
	ring.offset_right = diameter / 2.0
	ring.offset_top = -diameter / 2.0
	ring.offset_bottom = diameter / 2.0
	_hole_stage.add_child(ring)
	var tween := ring.create_tween().set_loops()
	tween.tween_property(ring, "rotation", TAU * direction, period).from(0.0)


func _style_junk_button(btn: Button) -> void:
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 11)
	var a := Color("#FBBF24")
	btn.add_theme_stylebox_override("normal", ClientUi.button_style(Color(a.r, a.g, a.b, 0.10), Color(a.r, a.g, a.b, 0.30)))
	btn.add_theme_stylebox_override("hover", ClientUi.button_style(Color(a.r, a.g, a.b, 0.20), Color(a.r, a.g, a.b, 0.45)))
	btn.add_theme_stylebox_override("pressed", ClientUi.button_style(Color(a.r, a.g, a.b, 0.15), Color(a.r, a.g, a.b, 0.35)))
	btn.add_theme_stylebox_override("disabled", ClientUi.button_style(Color(0.10, 0.10, 0.12, 0.45), Color(0.4, 0.35, 0.2, 0.20)))
	btn.add_theme_color_override("font_color", Color("#FCD34D"))
	btn.add_theme_color_override("font_hover_color", Color("#FEF3C7"))
	btn.add_theme_color_override("font_pressed_color", Color("#FCD34D"))
	btn.add_theme_color_override("font_disabled_color", Color(0.55, 0.50, 0.40, 0.45))
	ClientUi.apply_interaction_motion(btn, 1.012)


func _set_hole_style(active: bool) -> void:
	_hole_active = active
	var border := Color(ClientUi.VIOLET, 0.85 if active else 0.45)
	_hole_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.02, 0.02, 0.05, 0.96), border, 16, 1
	))
	if _hole_hint:
		_hole_hint.text = "Release to dissolve" if active else "Drag gear in to dissolve into stardust"
	if _hole_material != null:
		_hole_material.set_shader_parameter("activity", 1.0 if active else 0.72)


func _sync_hole_aspect() -> void:
	if _hole_material == null or not is_instance_valid(_hole_stage):
		return
	var safe_height := maxf(1.0, _hole_stage.size.y)
	_hole_material.set_shader_parameter("aspect", _hole_stage.size.x / safe_height)


func _load_items() -> void:
	var cid := str(GameManager.active_character.get("id", ""))
	_items = []
	if cid.is_empty():
		return
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entities/Item/filter",
		{"query": {"character_id": cid}, "sort": "-created_date", "limit": 200}, true
	)
	if res.ok and typeof(res.data) == TYPE_ARRAY:
		_items = res.data


func _unequipped() -> Array:
	var out: Array = []
	for it in _items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if bool(it.get("is_equipped", false)):
			continue
		var iid := str(it.get("id", ""))
		if _sucking_ids.has(iid):
			continue
		out.append(it)
	return out


func _populate() -> void:
	var c := GameManager.active_character
	_balance_lab.text = "✦  %s  stardust" % str(c.get("stardust", 0))

	var pending: Array = InventoryManager.pending_loot
	_pending_banner.visible = not pending.is_empty()
	if not pending.is_empty():
		var first: Variant = pending[0]
		var pname := "?"
		if typeof(first) == TYPE_DICTIONARY:
			var item_blob: Variant = first.get("item", first)
			if typeof(item_blob) == TYPE_DICTIONARY:
				pname = str(item_blob.get("name", first.get("name", "?")))
			else:
				pname = str(first.get("name", "?"))
		_pending_lab.text = "Item Waiting: %s\nDissolve gear below to make room — it'll be added automatically." % pname

	var cls := str(c.get("class", "Vanguard"))
	var junk_ids: Array = InventoryRules.list_junk_ids(_items, cls)
	_junk_btn.text = "Dissolve Junk (%s)" % junk_ids.size()
	_junk_btn.disabled = junk_ids.is_empty() or _busy

	var spare: Array = _unequipped()
	_empty_panel.visible = spare.is_empty()
	_grid.visible = not spare.is_empty()

	_card_by_id.clear()
	for child in _grid.get_children():
		child.queue_free()
	for it in spare:
		var card := _make_item_card(it)
		_grid.add_child(card)
		_card_by_id[str(it.get("id", ""))] = card


func _make_item_card(it: Dictionary) -> PanelContainer:
	var rarity := str(it.get("rarity", "common"))
	var tint := ClientUi.rarity_color(rarity)
	var iid := str(it.get("id", ""))
	var locked := bool(it.get("locked", false))

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.72), Color(tint, 0.25), 10, 1
	))
	panel.set_meta("item_id", iid)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)

	# Drag only from icon/text — leave Dissolve as a normal click target (web stopPropagation).
	var drag_host := PanelContainer.new()
	drag_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	drag_host.mouse_default_cursor_shape = Control.CURSOR_MOVE
	drag_host.tooltip_text = "Drag into the Void to dissolve"
	drag_host.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	drag_host.set_drag_forwarding(
		func(_at: Vector2) -> Variant: return _card_get_drag(drag_host, it),
		func(_at: Vector2, _data: Variant) -> bool: return false,
		func(_at: Vector2, _data: Variant) -> void: pass
	)
	row.add_child(drag_host)

	var drag_row := HBoxContainer.new()
	drag_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	drag_row.add_theme_constant_override("separation", 8)
	drag_host.add_child(drag_row)

	var icon := GearIcon.make(it, 34.0)
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	drag_row.add_child(icon)

	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 1)
	drag_row.add_child(col)

	var title := Label.new()
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = str(it.get("name", "?"))
	title.clip_text = true
	title.add_theme_font_size_override("font_size", 12)
	title.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(title)
	col.add_child(title)

	var meta := Label.new()
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meta.text = "%s · %s" % [rarity, str(it.get("type", "?"))]
	meta.add_theme_font_size_override("font_size", 11)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	col.add_child(meta)

	var val := Label.new()
	val.mouse_filter = Control.MOUSE_FILTER_IGNORE
	val.text = "✦  %s" % InventoryRules.estimate_sell_value(it)
	val.add_theme_font_size_override("font_size", 11)
	val.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_body_font(val)
	col.add_child(val)

	var btn := Button.new()
	btn.text = "Dissolve"
	btn.focus_mode = Control.FOCUS_NONE
	btn.disabled = locked or _busy
	ClientUi.apply_accent_chip_button(btn)
	btn.pressed.connect(func() -> void: _on_dissolve(iid))
	row.add_child(btn)
	return panel


func _card_get_drag(panel: Control, it: Dictionary) -> Variant:
	var iid := str(it.get("id", ""))
	if iid.is_empty() or _busy or _sucking_ids.has(iid) or bool(it.get("locked", false)):
		return null
	var preview := GearIcon.make(it, 40.0)
	panel.set_drag_preview(preview)
	return {"kind": "void_dissolve", "item_id": iid}


func _hole_get_drag(_at: Vector2) -> Variant:
	return null


func _hole_can_drop(_at: Vector2, data: Variant) -> bool:
	var ok := typeof(data) == TYPE_DICTIONARY and str(data.get("kind", "")) == "void_dissolve"
	if ok and not _hole_active:
		_set_hole_style(true)
	elif not ok and _hole_active:
		_set_hole_style(false)
	return ok


func _hole_drop_data(_at: Vector2, data: Variant) -> void:
	_set_hole_style(false)
	if typeof(data) != TYPE_DICTIONARY:
		return
	var iid := str(data.get("item_id", ""))
	if not iid.is_empty():
		_on_dissolve(iid)


func _notification(what: int) -> void:
	# Clear hole highlight if a drag ends outside the drop target.
	if what == NOTIFICATION_DRAG_END and _hole_active:
		_set_hole_style(false)


func _on_dissolve(item_id: String) -> void:
	if _busy or item_id.is_empty() or _sucking_ids.has(item_id):
		return
	var it: Dictionary = InventoryRules.find_by_id(_items, item_id)
	if it.is_empty():
		return
	if bool(it.get("locked", false)):
		_set_status("Locked items can't be dissolved.", ClientUi.DANGER)
		return

	_busy = true
	_sucking_ids[item_id] = true
	_junk_btn.disabled = true
	var preview := InventoryRules.estimate_sell_value(it)
	var name := str(it.get("name", "item"))
	AudioManager.play_ui("blackhole_suck")
	_set_hole_style(true)
	_animate_suck(item_id)
	await get_tree().create_timer(1.25).timeout
	_spawn_burst()
	await get_tree().create_timer(0.15).timeout

	var res: Dictionary = await InventoryManager.dissolve_item(item_id)
	_busy = false
	_sucking_ids.erase(item_id)
	_set_hole_style(false)
	if not res.ok:
		_set_status(str(res.get("error", "Dissolve failed")), ClientUi.DANGER)
		await _reload()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var gained := int(data.get("stardust_gained", preview))
	_set_status("✦ Dissolved into stardust! +%s from %s" % [gained, name], GameData.STARDUST_COLOR)
	await _reload()


func _on_junk() -> void:
	if _busy:
		return
	var cls := str(GameManager.active_character.get("class", "Vanguard"))
	var ids: Array = InventoryRules.list_junk_ids(_items, cls)
	if ids.is_empty():
		_set_status("No junk to dissolve — no unequippables or worse common gear.", ClientUi.MUTED)
		return
	_busy = true
	_junk_btn.disabled = true
	var preview_total := 0
	for iid in ids:
		var it: Dictionary = InventoryRules.find_by_id(_items, str(iid))
		if not it.is_empty():
			preview_total += InventoryRules.estimate_sell_value(it)
			_sucking_ids[str(iid)] = true
	AudioManager.play_ui("blackhole_suck")
	_set_hole_style(true)
	for iid in ids:
		_animate_suck(str(iid))
	await get_tree().create_timer(1.25).timeout
	_spawn_burst()
	await get_tree().create_timer(0.15).timeout

	var res: Dictionary = await InventoryManager.dissolve_junk(ids)
	_busy = false
	_sucking_ids.clear()
	_set_hole_style(false)
	if not res.ok:
		_set_status(str(res.get("error", "Dissolve failed")), ClientUi.DANGER)
		await _reload()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var gained := int(data.get("stardust_gained", preview_total))
	var dissolved: Variant = data.get("dissolved", ids)
	var n: int = ids.size()
	if typeof(dissolved) == TYPE_ARRAY:
		n = (dissolved as Array).size()
	_set_status("✦ Junk dissolved! %s items → +%s stardust" % [n, gained], GameData.STARDUST_COLOR)
	await _reload()


func _reload() -> void:
	await MissionManager.refresh_character()
	await InventoryManager.list_pending_loot()
	await _load_items()
	_populate()


func _animate_suck(item_id: String) -> void:
	var card: Variant = _card_by_id.get(item_id)
	if not (card is Control) or not is_instance_valid(card):
		return
	var panel := card as Control
	# Reparent out of the grid so layout can't fight the fly-in tween.
	var start_global := panel.global_position
	var start_size := panel.size
	panel.get_parent().remove_child(panel)
	_fx_layer.add_child(panel)
	panel.global_position = start_global
	panel.size = start_size
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.z_index = 40
	var hole_center := _hole_drop.get_global_rect().get_center()
	var target := hole_center - start_size * 0.05
	var tween := panel.create_tween()
	tween.set_parallel(true)
	tween.tween_property(panel, "global_position", target - start_size * 0.45, 1.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_property(panel, "scale", Vector2(0.05, 0.05), 1.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_property(panel, "modulate:a", 0.0, 1.2).set_delay(0.15)
	tween.tween_property(panel, "rotation", TAU * 4.0, 1.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(func() -> void:
		if is_instance_valid(panel):
			panel.queue_free()
	)
	_card_by_id.erase(item_id)


func _spawn_burst() -> void:
	AudioManager.play_ui("blackhole_burst")
	_pulse_black_hole()
	if _burst_layer == null or not is_instance_valid(_burst_layer):
		return
	var origin := _burst_layer.size * 0.5
	for i in 16:
		var spark := Label.new()
		spark.text = "✦"
		spark.add_theme_font_size_override("font_size", 12 + (i % 4) * 2)
		spark.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
		spark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		spark.position = origin
		_burst_layer.add_child(spark)
		var angle := (float(i) / 16.0) * TAU + randf() * 0.4
		var dist := 50.0 + randf() * 80.0
		var delay := randf() * 0.06
		var tween := spark.create_tween()
		tween.tween_property(spark, "modulate:a", 1.0, 0.01).set_delay(delay)
		tween.parallel().tween_property(
			spark, "position", origin + Vector2(cos(angle), sin(angle)) * dist, 0.95
		).set_delay(delay).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tween.parallel().tween_property(spark, "modulate:a", 0.0, 0.95).set_delay(delay)
		tween.tween_callback(spark.queue_free)

	var flash := ColorRect.new()
	flash.color = Color(0.91, 0.47, 0.98, 0.55)
	flash.custom_minimum_size = Vector2(70, 70)
	flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flash.set_anchors_preset(PRESET_CENTER)
	flash.grow_horizontal = Control.GROW_DIRECTION_BOTH
	flash.grow_vertical = Control.GROW_DIRECTION_BOTH
	flash.offset_left = -35
	flash.offset_right = 35
	flash.offset_top = -35
	flash.offset_bottom = 35
	_burst_layer.add_child(flash)
	var ft := flash.create_tween()
	ft.tween_property(flash, "scale", Vector2(2.4, 2.4), 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	ft.parallel().tween_property(flash, "modulate:a", 0.0, 0.5)
	ft.tween_callback(flash.queue_free)


func _pulse_black_hole() -> void:
	if _hole_material == null:
		return
	var tween := create_tween()
	tween.tween_method(
		func(value: float) -> void:
			if _hole_material != null:
				_hole_material.set_shader_parameter("activity", value),
		0.72,
		1.0,
		0.16
	).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.tween_method(
		func(value: float) -> void:
			if _hole_material != null:
				_hole_material.set_shader_parameter("activity", value),
		1.0,
		0.72,
		0.8
	).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _set_status(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)
