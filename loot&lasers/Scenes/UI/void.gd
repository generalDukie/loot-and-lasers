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
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	# Balance only — never rebuild the gear grid here. A mid-dissolve wallet
	# pulse would briefly recreate a card that is already mid-suck / removed.
	_refresh_balance()


func _refresh_balance() -> void:
	if _balance_lab == null or not is_instance_valid(_balance_lab):
		return
	_balance_lab.text = "%s  stardust" % str(
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST)
	)


func _boot() -> void:
	_set_status("Loading bag…", ClientUi.MUTED)
	var requests := AsyncGroup.new()
	requests.add(MissionManager.refresh_character.bind(true))
	requests.add(InventoryManager.list_pending_loot)
	requests.add(_load_items)
	await requests.wait()
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

	var title_row := UiIcon.make_title_row("circle-dot", "Void", ClientUi.TEXT, 27, 28.0)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_row)

	var bal := PanelContainer.new()
	bal.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(GameData.STARDUST_COLOR, 0.10), Color(GameData.STARDUST_COLOR, 0.30), 999, 1
	))
	header.add_child(bal)
	var bal_inner := HBoxContainer.new()
	bal_inner.add_theme_constant_override("separation", 6)
	bal_inner.alignment = BoxContainer.ALIGNMENT_CENTER
	var bal_pad := MarginContainer.new()
	bal_pad.add_theme_constant_override("margin_left", 10)
	bal_pad.add_theme_constant_override("margin_right", 10)
	bal_pad.add_theme_constant_override("margin_top", 4)
	bal_pad.add_theme_constant_override("margin_bottom", 4)
	bal_pad.add_child(bal_inner)
	bal.add_child(bal_pad)
	bal_inner.add_child(CurrencyIcon.make("stardust", 16.0))
	_balance_lab = Label.new()
	_balance_lab.add_theme_font_size_override("font_size", 17)
	_balance_lab.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(_balance_lab)
	bal_inner.add_child(_balance_lab)

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
	prow.add_child(UiIcon.make("package", ClientUi.CYAN, 27.0))
	_pending_lab = Label.new()
	_pending_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_pending_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_pending_lab.add_theme_font_size_override("font_size", 16)
	_pending_lab.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_body_font(_pending_lab)
	prow.add_child(_pending_lab)

	# The Void — drag target
	_hole_panel = PanelContainer.new()
	_hole_panel.custom_minimum_size = Vector2(0, 320)
	_hole_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_set_hole_style(false)
	root.add_child(_hole_panel)

	_hole_drop = Control.new()
	_hole_drop.name = "HoleDrop"
	_hole_drop.custom_minimum_size = Vector2(0, 320)
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
	_hole_hint.offset_top = -48
	_hole_hint.offset_bottom = -16
	_hole_hint.add_theme_font_size_override("font_size", 19)
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
	empty_a.add_theme_font_size_override("font_size", 19)
	empty_a.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(empty_a)
	empty_col.add_child(empty_a)
	var empty_b := Label.new()
	empty_b.text = "Complete missions or buy from the Black Market to find items."
	empty_b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	empty_b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	empty_b.add_theme_font_size_override("font_size", 19)
	empty_b.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.65))
	ClientUi.apply_body_font(empty_b)
	empty_col.add_child(empty_b)

	_grid = GridContainer.new()
	_grid.columns = 2
	_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grid.add_theme_constant_override("h_separation", 10)
	_grid.add_theme_constant_override("v_separation", 10)
	list.add_child(_grid)


func _style_junk_button(btn: Button) -> void:
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 15)
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
	var res: Dictionary = await GameApiClient.request(
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
	_refresh_balance()

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
		_pending_lab.text = "Item Waiting: %s\nFree a bag slot, then Claim on Inventory — it will not auto-fill when you dissolve." % pname

	var c := GameManager.active_character
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


func _remove_items_local(item_ids: Array) -> void:
	if item_ids.is_empty():
		return
	var drop: Dictionary = {}
	for iid in item_ids:
		drop[str(iid)] = true
	var next: Array = []
	for it in _items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if drop.has(str(it.get("id", ""))):
			continue
		next.append(it)
	_items = next


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
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(title)
	col.add_child(title)

	var meta := Label.new()
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meta.text = "%s · %s" % [rarity, GameData.gear_type_label(str(it.get("type", "")))]
	meta.add_theme_font_size_override("font_size", 19)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	col.add_child(meta)

	col.add_child(CurrencyIcon.make_stardust_amount_row(
		InventoryRules.estimate_sell_value(it), 14.0, 15
	))

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
		Notify.blocked("Item locked", "Locked items can't be dissolved")
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
	_set_hole_style(false)
	if not res.ok:
		_sucking_ids.erase(item_id)
		if not Notify.from_result(res):
			_set_status(str(res.get("error", "Dissolve failed")), ClientUi.DANGER)
		await _reload()
		return
	# Drop from local list before clearing suck state / reload so a wallet or
	# character refresh cannot briefly recreate the dissolved card.
	_remove_items_local([item_id])
	_sucking_ids.erase(item_id)
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var gained := int(data.get("stardust_gained", preview))
	_set_status("Dissolved into stardust! +%s from %s" % [gained, name], GameData.STARDUST_COLOR)
	_refresh_balance()
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
	_set_hole_style(false)
	if not res.ok:
		_sucking_ids.clear()
		if not Notify.from_result(res):
			_set_status(str(res.get("error", "Dissolve failed")), ClientUi.DANGER)
		await _reload()
		return
	_remove_items_local(ids)
	_sucking_ids.clear()
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var gained := int(data.get("stardust_gained", preview_total))
	var dissolved: Variant = data.get("dissolved", ids)
	var n: int = ids.size()
	if typeof(dissolved) == TYPE_ARRAY:
		n = (dissolved as Array).size()
	_set_status("Junk dissolved! %s items → +%s stardust" % [n, gained], GameData.STARDUST_COLOR)
	_refresh_balance()
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
	var dust := GameData.STARDUST_COLOR
	var spark_colors: Array[Color] = [
		dust,
		Color(1.0, 1.0, 1.0, 1.0),
		Color(0.98, 0.85, 1.0, 1.0),
		Color(0.75, 0.55, 1.0, 1.0),
		Color(0.55, 0.85, 1.0, 1.0),
	]
	var glyphs := ["sparkle", "sparkles", "asterisk"]

	# Soft circular bloom (not a square ColorRect).
	var bloom := PanelContainer.new()
	bloom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bloom.custom_minimum_size = Vector2(56, 56)
	var bloom_style := StyleBoxFlat.new()
	bloom_style.bg_color = Color(dust.r, dust.g, dust.b, 0.55)
	bloom_style.set_corner_radius_all(999)
	bloom_style.shadow_color = Color(dust.r, dust.g, dust.b, 0.65)
	bloom_style.shadow_size = 18
	bloom.add_theme_stylebox_override("panel", bloom_style)
	bloom.pivot_offset = Vector2(28, 28)
	bloom.position = origin - Vector2(28, 28)
	bloom.scale = Vector2(0.35, 0.35)
	bloom.modulate.a = 0.95
	_burst_layer.add_child(bloom)
	var bloom_tween := bloom.create_tween()
	bloom_tween.set_parallel(true)
	bloom_tween.tween_property(bloom, "scale", Vector2(2.8, 2.8), 0.55).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	bloom_tween.tween_property(bloom, "modulate:a", 0.0, 0.55).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	bloom_tween.chain().tween_callback(bloom.queue_free)

	# Dense sparkle spray.
	for i in 36:
		var spark_size := 9.0 + float(i % 5) * 3.0
		var spark := UiIcon.make(glyphs[i % glyphs.size()], spark_colors[i % spark_colors.size()], spark_size)
		spark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		spark.position = origin
		spark.pivot_offset = Vector2(spark_size * 0.5, spark_size * 0.5)
		spark.scale = Vector2(0.2, 0.2)
		_burst_layer.add_child(spark)
		var angle := (float(i) / 36.0) * TAU + randf() * 0.55
		var dist := 36.0 + randf() * 110.0
		var delay := randf() * 0.08
		var life := 0.55 + randf() * 0.55
		var end_scale := 0.55 + randf() * 1.15
		var tween := spark.create_tween()
		tween.set_parallel(true)
		tween.tween_property(spark, "modulate:a", 1.0, 0.04).set_delay(delay)
		tween.tween_property(
			spark, "position", origin + Vector2(cos(angle), sin(angle)) * dist, life
		).set_delay(delay).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tween.tween_property(spark, "scale", Vector2(end_scale, end_scale), life * 0.45).set_delay(delay)
		tween.tween_property(spark, "rotation", randf_range(-1.2, 1.2), life).set_delay(delay)
		tween.tween_property(spark, "modulate:a", 0.0, life * 0.7).set_delay(delay + life * 0.3)
		tween.chain().tween_callback(spark.queue_free)


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
