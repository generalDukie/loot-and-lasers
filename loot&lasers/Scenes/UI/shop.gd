extends Control
## Black Market — mirrors web ShopPage (header · hot deal · unified stalls).

var _status: Label
var _currency_row: HBoxContainer
var _vendor: Label
var _list: VBoxContainer
var _equipped: Array = []
var _busy := false
var _busy_slot := ""
var _tick: Timer
var _win_idx := -1


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	_set_status("Opening Black Market…")
	await MissionManager.refresh_character()
	await _load_equipped()
	var res: Dictionary = await ShopManager.ensure_shop()
	if not res.ok:
		_set_status(str(res.get("error", "EnsureShop failed")))
	_win_idx = int(GameData.get_shop_window().get("idx", 0))
	_populate()


func _load_equipped() -> void:
	_equipped.clear()
	var items_res: Dictionary = await AuthManager.list_items()
	if not items_res.ok or typeof(items_res.data) != TYPE_ARRAY:
		return
	for it in items_res.data:
		if typeof(it) == TYPE_DICTIONARY and bool(it.get("is_equipped", false)):
			_equipped.append(it)


func _equipped_of_type(item_type: String) -> Dictionary:
	return InventoryRules.find_equipped_of_type(_equipped, item_type)


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)

	var head_l := VBoxContainer.new()
	head_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_l.add_theme_constant_override("separation", 2)
	header.add_child(head_l)

	var eye := Label.new()
	eye.text = "UNDER THE TABLE"
	eye.add_theme_font_size_override("font_size", 13)
	eye.add_theme_color_override("font_color", Color("#E879F9", 0.85))
	ClientUi.apply_display_font(eye)
	head_l.add_child(eye)

	var title := Label.new()
	title.text = "🛒  Black Market"
	title.add_theme_font_size_override("font_size", 29)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	head_l.add_child(title)

	_vendor = Label.new()
	_vendor.add_theme_font_size_override("font_size", 15)
	_vendor.add_theme_color_override("font_color", Color("#F5D0FE", 0.85))
	ClientUi.apply_body_font(_vendor)
	head_l.add_child(_vendor)

	_currency_row = HBoxContainer.new()
	_currency_row.add_theme_constant_override("separation", 8)
	_currency_row.size_flags_vertical = Control.SIZE_SHRINK_END
	header.add_child(_currency_row)

	_status = ClientUi.make_status()
	_status.visible = false
	root.add_child(_status)

	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 10)
	root.add_child(_list)

	_tick = Timer.new()
	_tick.wait_time = 1.0
	_tick.timeout.connect(_on_tick)
	add_child(_tick)
	_tick.start()


func _set_status(text: String) -> void:
	_status.text = text
	_status.visible = not text.is_empty()


func _on_tick() -> void:
	_update_meta()
	var idx := int(GameData.get_shop_window().get("idx", 0))
	if idx != _win_idx and not _busy:
		_win_idx = idx
		_refresh_window()


func _refresh_window() -> void:
	_busy = true
	var res: Dictionary = await ShopManager.ensure_shop()
	_busy = false
	if res.ok:
		_populate()


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()
	_update_meta()

	if ShopManager.gear_stock().is_empty():
		_list.add_child(_offline_panel())
		return

	var hot: Dictionary = ShopManager.hot_deal()
	if not hot.is_empty():
		_list.add_child(_make_hot_banner(hot))

	_list.add_child(_make_market_section())

	if _status.text.begins_with("Opening"):
		_set_status("")


func _offline_panel() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	var t := Label.new()
	t.text = "🛒  Black Market is offline"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 21)
	t.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(t)
	col.add_child(t)
	var sub := Label.new()
	sub.text = "Could not load bazaar stock. Restart the game API and retry."
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_font_size_override("font_size", 16)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(sub)
	var retry := Button.new()
	retry.text = "Retry"
	ClientUi.apply_primary_button(retry)
	retry.pressed.connect(func() -> void:
		_set_status("Opening Black Market…")
		var res: Dictionary = await ShopManager.ensure_shop()
		if not res.ok:
			_set_status(str(res.get("error", "EnsureShop failed")))
		_populate()
	)
	col.add_child(retry)
	return col


func _update_meta() -> void:
	var c: Dictionary = GameManager.active_character
	var win: Dictionary = GameData.get_shop_window()
	var day := ProgressManager.today_et()
	var seed := int(win.get("idx", 0)) * 17 + day.length() * 3
	_vendor.text = "“%s”" % GameData.get_vendor_line(seed)

	for child in _currency_row.get_children():
		child.queue_free()
	# Web header chips: Nova (amber) · Stardust · shop-window clock
	_currency_row.add_child(ClientUi.make_currency_chip("💎", c.get("nova_crystals", 0), Color("#FCD34D")))
	_currency_row.add_child(ClientUi.make_currency_chip("✦", c.get("stardust", 0), GameData.STARDUST_COLOR))
	_currency_row.add_child(ClientUi.make_currency_chip(
		"⏱",
		GameData.format_shop_countdown(int(win.get("secondsLeft", 0))),
		ClientUi.CYAN
	))


# ─── Hot Deal ───────────────────────────────────────────────────────────────

func _make_hot_banner(item: Dictionary) -> PanelContainer:
	var sold := ShopManager.is_hot_purchased()
	var yanked := ShopManager.is_hot_yanked()
	var hot_eta := ArenaRules.format_eta_short(ArenaRules.ms_until_et_midnight())
	var rarity := str(item.get("rarity", "common"))
	var tint := ClientUi.rarity_color(rarity)

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.14, 0.07, 0.04, 0.97), Color("#FB923C", 0.7), 14, 2
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

	var badge := Label.new()
	badge.text = "🔥  HOT DEAL · resets %s" % hot_eta
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge.add_theme_font_size_override("font_size", 15)
	badge.add_theme_color_override("font_color", Color("#FED7AA"))
	ClientUi.apply_display_font(badge)
	col.add_child(badge)

	var card := _make_gear_card(item, true, tint)
	if sold or yanked:
		card.modulate = Color(1, 1, 1, 0.72)
		col.add_child(card)
		var overlay := Label.new()
		overlay.text = "YANKED TODAY" if yanked else "CLAIMED TODAY"
		overlay.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		overlay.add_theme_font_size_override("font_size", 16)
		overlay.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(overlay)
		col.add_child(overlay)
	else:
		col.add_child(card)
	return panel


# ─── Black Market stalls ────────────────────────────────────────────────────

func _make_market_section() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.08, 0.1, 0.96), Color(ClientUi.CYAN, 0.28), 12, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	col.add_child(head)
	var head_col := VBoxContainer.new()
	head_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(head_col)
	var t := Label.new()
	t.text = "⚔  Black Market"
	t.add_theme_font_size_override("font_size", 20)
	t.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(t)
	head_col.add_child(t)
	var h := Label.new()
	h.text = "8 stalls · gear & stims mixed · haggle gear"
	h.add_theme_font_size_override("font_size", 13)
	h.add_theme_color_override("font_color", ClientUi.MUTED)
	head_col.add_child(h)

	var restock := Button.new()
	restock.text = "Restock · 💎 %s" % ShopManager.SHOP_REFRESH_COST
	_apply_restock_btn(restock, Color("#FBBF24"))
	restock.pressed.connect(func() -> void: _on_refresh("all"))
	head.add_child(restock)

	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(grid)

	var stock: Array = ShopManager.shop_stock()
	if stock.is_empty():
		grid.add_child(_empty_line("No stock."))
	else:
		for item in stock:
			if typeof(item) != TYPE_DICTIONARY:
				continue
			if ShopManager.is_stim_slot(item):
				grid.add_child(_make_cons_card(item))
			else:
				var rarity := str(item.get("rarity", "common"))
				grid.add_child(_make_gear_card(item, false, ClientUi.rarity_color(rarity)))
	return panel


func _apply_restock_btn(btn: Button, accent: Color) -> void:
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 13)
	btn.add_theme_stylebox_override("normal", ClientUi.button_style(
		Color(accent.r, accent.g, accent.b, 0.15), Color(accent.r, accent.g, accent.b, 0.35)
	))
	btn.add_theme_stylebox_override("hover", ClientUi.button_style(
		Color(accent.r, accent.g, accent.b, 0.25), Color(accent.r, accent.g, accent.b, 0.5)
	))
	btn.add_theme_color_override("font_color", accent)
	ClientUi.apply_interaction_motion(btn)


func _empty_line(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.add_theme_font_size_override("font_size", 16)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	return lab


# ─── Cards ──────────────────────────────────────────────────────────────────

func _make_cons_card(item: Dictionary) -> PanelContainer:
	var slot_id := str(item.get("_slotId", ""))
	var cost := ShopManager.slot_cost_sd(item)
	if cost <= 0:
		cost = int(item.get("sell_value", 250))
	var rarity := str(item.get("rarity", "common"))
	var is_trio := str(item.get("_bundle", "")) == "stim_trio"
	var cons: Variant = item.get("consumable", {})
	var stat := "all"
	if typeof(cons) == TYPE_DICTIONARY:
		stat = str(cons.get("stat", "all"))
	var tint := Color("#FBBF24") if is_trio else GameData.stat_color(stat)
	var rarity_tint := ClientUi.rarity_color(rarity)

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.08, 0.96), Color(tint, 0.45), 10, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	col.add_child(top)
	var icon_box := PanelContainer.new()
	icon_box.custom_minimum_size = Vector2(48, 48)
	icon_box.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(tint, 0.12), Color(tint, 0.4), 8, 1
	))
	top.add_child(icon_box)
	var icon := Label.new()
	icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if is_trio:
		icon.text = "📦"
	elif stat == "all":
		icon.text = "✨"
	else:
		icon.text = str(GameData.STAT_ICONS.get(stat, "🧪"))
	icon.add_theme_font_size_override("font_size", 19)
	icon_box.add_child(icon)

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title_col)
	var title := Label.new()
	title.text = str(item.get("name", "?"))
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", rarity_tint)
	ClientUi.apply_display_font(title)
	title_col.add_child(title)
	var sub := Label.new()
	sub.text = "bundle · 3 stims" if is_trio else ("%s · stim" % rarity)
	sub.add_theme_font_size_override("font_size", 12)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	title_col.add_child(sub)

	var detail := Label.new()
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if is_trio:
		var names: PackedStringArray = []
		var bundle: Variant = item.get("bundle_items", [])
		if typeof(bundle) == TYPE_ARRAY:
			for b in bundle:
				if typeof(b) == TYPE_DICTIONARY:
					names.append(str(b.get("name", "")).replace(" Stim", ""))
		detail.text = " · ".join(names) if names.size() > 0 else str(item.get("flavor_text", "Stim Trio"))
		detail.add_theme_color_override("font_color", Color("#FDE68A", 0.9))
	elif typeof(cons) == TYPE_DICTIONARY:
		detail.text = "+%s%% %s · %sh" % [
			str(int(round(float(cons.get("mult", 0)) * 100.0))),
			"ALL" if stat == "all" else stat,
			str(cons.get("duration_hours", "?")),
		]
		detail.add_theme_color_override("font_color", tint)
	else:
		detail.text = str(item.get("flavor_text", "Stim"))
		detail.add_theme_color_override("font_color", ClientUi.MUTED)
	detail.add_theme_font_size_override("font_size", 15)
	ClientUi.apply_body_font(detail)
	col.add_child(detail)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	col.add_child(row)
	var price := Label.new()
	price.text = "✦ %s" % cost
	price.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	price.add_theme_font_size_override("font_size", 16)
	price.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(price)
	row.add_child(price)
	var buy := Button.new()
	buy.text = "Open" if is_trio else "Buy"
	ClientUi.apply_primary_button(buy)
	buy.add_theme_font_size_override("font_size", 15)
	var capt_cost := cost
	buy.pressed.connect(func() -> void: _on_buy_cons(slot_id, capt_cost))
	row.add_child(buy)
	return panel


func _make_gear_card(item: Dictionary, is_hot: bool, tint: Color) -> PanelContainer:
	var slot_id := str(item.get("_slotId", ""))
	var cost := ShopManager.slot_cost_sd(item)
	var nova := ShopManager.slot_cost_nova(item)
	var is_bundle := bool(item.get("_bundle", false)) and str(item.get("_bundle", "")) != ""
	if typeof(item.get("_bundle", null)) == TYPE_BOOL:
		is_bundle = bool(item.get("_bundle", false))
	elif typeof(item.get("_bundle", null)) == TYPE_STRING:
		is_bundle = not str(item.get("_bundle", "")).is_empty()
	var owned := false
	var yanked := false
	if is_hot:
		owned = ShopManager.is_hot_purchased() or ShopManager.is_hot_yanked()
		yanked = ShopManager.is_hot_yanked()
	else:
		yanked = ShopManager.is_slot_yanked(slot_id)
		owned = ShopManager.is_slot_purchased(slot_id) or yanked

	var item_type := str(item.get("type", ""))
	var eq: Dictionary = _equipped_of_type(item_type)
	var class_key := str(GameManager.active_character.get("class", "Vanguard"))
	var better := false
	if not owned and not is_bundle and not eq.is_empty():
		better = InventoryRules.class_power_rating(item, class_key) > InventoryRules.class_power_rating(eq, class_key)

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var border := Color(tint, 0.7) if is_hot else (Color(ClientUi.SUCCESS, 0.45) if better else Color(tint, 0.45))
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.05, 0.08, 0.96), border, 10, 2 if is_hot or better else 1
	))
	if owned:
		panel.modulate = Color(1, 1, 1, 0.72)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	col.add_child(top)
	if is_bundle:
		var crate := Label.new()
		crate.text = "📦"
		crate.add_theme_font_size_override("font_size", 29)
		top.add_child(crate)
	else:
		top.add_child(GearIcon.make(item, 36.0))

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title_col)
	var title := Label.new()
	title.text = str(item.get("name", "?"))
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(title)
	title_col.add_child(title)
	var sub := Label.new()
	if is_bundle:
		sub.text = "bundle · 2 commons"
	else:
		sub.text = "%s · %s" % [str(item.get("rarity", "")), GameData.gear_type_label(item_type)]
	sub.add_theme_font_size_override("font_size", 12)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	title_col.add_child(sub)

	col.add_child(_compare_badge(item, eq, class_key, is_bundle))

	if is_bundle:
		var flavor := Label.new()
		flavor.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		flavor.text = str(item.get("flavor_text", "Crate"))
		flavor.add_theme_font_size_override("font_size", 13)
		flavor.add_theme_color_override("font_color", ClientUi.MUTED)
		col.add_child(flavor)
	else:
		col.add_child(_stat_delta_row(item, eq))

	if owned:
		var gone := Label.new()
		gone.text = "YANKED" if yanked else "SOLD"
		gone.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		gone.add_theme_font_size_override("font_size", 15)
		gone.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(gone)
		col.add_child(gone)
	else:
		col.add_child(_gear_actions(item, is_hot, is_bundle, cost, nova, slot_id))
	return panel


func _compare_badge(slot: Dictionary, equipped: Dictionary, class_key: String, is_bundle: bool) -> PanelContainer:
	var panel := PanelContainer.new()
	var text := ""
	var color := ClientUi.MUTED
	if is_bundle:
		text = "Bundle"
		color = Color("#FCD34D")
	elif equipped.is_empty():
		text = "📦 Empty slot"
		color = Color("#7DD3FC")
	else:
		var d := InventoryRules.class_power_rating(slot, class_key) - InventoryRules.class_power_rating(equipped, class_key)
		if d > 0:
			text = "▲ +%s vs equipped" % d
			color = ClientUi.SUCCESS
		elif d < 0:
			text = "▼ %s vs equipped" % d
			color = ClientUi.DANGER
		else:
			text = "— Same power"
			color = ClientUi.MUTED
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(color.r, color.g, color.b, 0.12), Color(color.r, color.g, color.b, 0.35), 8, 1
	))
	var lab := Label.new()
	lab.text = text
	lab.add_theme_font_size_override("font_size", 12)
	lab.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(lab)
	panel.add_child(lab)
	return panel


func _stat_delta_row(slot: Dictionary, equipped: Dictionary) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var stats: Variant = slot.get("stats", {})
	if typeof(stats) != TYPE_DICTIONARY:
		return row
	var eq_stats: Dictionary = {}
	if not equipped.is_empty() and typeof(equipped.get("stats", {})) == TYPE_DICTIONARY:
		eq_stats = equipped.get("stats", {})
	for k in ["strength", "agility", "intellect", "vitality", "luck"]:
		var v := int(stats.get(k, 0))
		var e := int(eq_stats.get(k, 0))
		if v <= 0 and e <= 0:
			continue
		var lab := Label.new()
		var color: Color = GameData.stat_color(k)
		var icon := str(GameData.STAT_ICONS.get(k, ""))
		if equipped.is_empty():
			lab.text = "%s %s" % [icon, v]
			lab.add_theme_color_override("font_color", color)
		else:
			var d := v - e
			var dtxt := ("+%s" % d) if d > 0 else str(d)
			lab.text = "%s %s (%s)" % [icon, v, dtxt]
			lab.add_theme_color_override("font_color", ClientUi.SUCCESS if d > 0 else (ClientUi.DANGER if d < 0 else color))
		lab.add_theme_font_size_override("font_size", 12)
		ClientUi.apply_body_font(lab)
		row.add_child(lab)
	return row


func _gear_actions(item: Dictionary, is_hot: bool, is_bundle: bool, cost: int, nova: int, slot_id: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var price_col := VBoxContainer.new()
	price_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(price_col)
	var price := Label.new()
	price.text = "✦ %s" % cost
	price.add_theme_font_size_override("font_size", 16)
	price.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(price)
	price_col.add_child(price)
	if nova > 0:
		var np := Label.new()
		np.text = "💎 %s" % nova
		np.add_theme_font_size_override("font_size", 15)
		np.add_theme_color_override("font_color", Color("#FCD34D"))
		ClientUi.apply_display_font(np)
		price_col.add_child(np)

	if not is_bundle:
		var hag := Button.new()
		hag.text = "Haggle"
		_apply_haggle_btn(hag)
		hag.pressed.connect(func() -> void: _on_buy_gear(slot_id, is_hot, true, cost, nova))
		row.add_child(hag)

	var buy := Button.new()
	buy.text = "Open" if is_bundle else "Buy"
	ClientUi.apply_primary_button(buy)
	buy.add_theme_font_size_override("font_size", 15)
	buy.pressed.connect(func() -> void: _on_buy_gear(slot_id, is_hot, false, cost, nova))
	row.add_child(buy)
	return row


func _apply_haggle_btn(btn: Button) -> void:
	## Web: fuchsia border/text Haggle chip
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 13)
	var f := Color("#E879F9")
	btn.add_theme_stylebox_override("normal", ClientUi.button_style(
		Color(f.r, f.g, f.b, 0.08), Color(f.r, f.g, f.b, 0.4)
	))
	btn.add_theme_stylebox_override("hover", ClientUi.button_style(
		Color(f.r, f.g, f.b, 0.18), Color(f.r, f.g, f.b, 0.55)
	))
	btn.add_theme_color_override("font_color", Color("#F0ABFC"))
	ClientUi.apply_interaction_motion(btn, 1.012)


# ─── Actions ────────────────────────────────────────────────────────────────

func _on_refresh(which: String) -> void:
	if _busy:
		return
	var nova := int(GameManager.active_character.get("nova_crystals", 0))
	if nova < ShopManager.SHOP_REFRESH_COST:
		_set_status("Need %s 💎 to refresh." % ShopManager.SHOP_REFRESH_COST)
		return
	_busy = true
	_set_status("Refreshing %s…" % which)
	var res: Dictionary = await ShopManager.refresh_shop(which)
	_busy = false
	if not res.ok:
		_set_status(str(res.get("error", "Refresh failed")))
		_update_meta()
		return
	_set_status("🔄 Black Market restocked (−%s 💎)." % ShopManager.SHOP_REFRESH_COST)
	_populate()


func _on_buy_cons(slot_id: String, cost: int) -> void:
	if _busy:
		return
	var sd := int(GameManager.active_character.get("stardust", 0))
	if sd < cost:
		_set_status("Need %s ✦ — you have %s." % [cost, sd])
		return
	_busy = true
	_busy_slot = slot_id
	_set_status("Buying stim…")
	var res: Dictionary = await ShopManager.buy_consumable(slot_id)
	_busy = false
	_busy_slot = ""
	if not res.ok:
		_set_status(_err(res))
		_update_meta()
		return
	_set_status(_purchase_msg(ShopManager.last_purchase, "🛒 Purchased!"))
	await _load_equipped()
	_populate()


func _on_buy_gear(slot_id: String, is_hot: bool, haggle: bool, cost: int, nova: int) -> void:
	if _busy:
		return
	var sd := int(GameManager.active_character.get("stardust", 0))
	var nc := int(GameManager.active_character.get("nova_crystals", 0))
	if haggle:
		var need := int(ceil(float(cost) * 0.85))
		if sd < need:
			_set_status("Need %s ✦ to haggle if the deal lands." % need)
			return
	else:
		if sd < cost:
			_set_status("Need %s ✦ — you have %s." % [cost, sd])
			return
		if nova > 0 and nc < nova:
			_set_status("Need %s 💎." % nova)
			return
	_busy = true
	_busy_slot = slot_id
	_set_status("Haggling…" if haggle else "Buying gear…")
	var res: Dictionary = await ShopManager.buy_gear(slot_id, is_hot, haggle)
	_busy = false
	_busy_slot = ""
	if not res.ok:
		_set_status(_err(res))
		_update_meta()
		return
	var purchase: Dictionary = ShopManager.last_purchase
	if str(purchase.get("kind", "")) == "haggle_fail":
		_set_status(str(purchase.get("note", "Haggle failed — they yanked the listing.")))
	else:
		var note := str(purchase.get("haggle_note", ""))
		var msg := _purchase_msg(purchase, "Deal struck!" if haggle else "Purchased!")
		if not note.is_empty():
			msg = "%s · %s" % [note, msg]
		_set_status(msg)
	await _load_equipped()
	_populate()


func _purchase_msg(purchase: Dictionary, fallback: String) -> String:
	var pending: Variant = purchase.get("pending_loot", [])
	var items: Variant = purchase.get("items", [])
	var cost := int(purchase.get("cost", 0))
	var nova_cost := int(purchase.get("nova_cost", 0))
	var parts: PackedStringArray = [fallback]
	if cost > 0:
		parts.append("−%s ✦" % cost)
	if nova_cost > 0:
		parts.append("−%s 💎" % nova_cost)
	if typeof(pending) == TYPE_ARRAY and (pending as Array).size() > 0:
		parts.append("bag full — item held as pending loot")
	elif typeof(items) == TYPE_ARRAY and (items as Array).size() > 0:
		parts.append("added to inventory")
	return " · ".join(parts)


func _err(res: Dictionary) -> String:
	var err := str(res.get("error", "Purchase failed"))
	if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
		err = str(res.data["error"])
	return err
