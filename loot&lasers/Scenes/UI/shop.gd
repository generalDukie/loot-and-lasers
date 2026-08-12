extends Control
## Black Market — mirrors web ShopPage (header · hot deal · unified stalls · sell fence).

const SELL_SLOT_COUNT := 5
## Fixed inventory-cell metrics — never scale with leftover page height.
const SELL_SLOT_H := 104.0
const SELL_SLOT_MIN_W := 108.0
const SELL_ICON_SZ := 40.0
const SELL_TITLE_FS := 11
const SELL_VAL_FS := 12
const SELL_SOURCE_ROWS := 2
const SELL_GRID_H_SEP := 8
const SELL_GRID_V_SEP := 8
const SELL_SECTION_SEP := 10
const SELL_BTN_MIN_H := 56.0
const SELL_BTN_MIN_W := 420.0
## Stall card scale (Hot Deal / Sell left alone). Vertical ~+15%; icons/fonts/chips more.
const STALL_SEP := 6
const STALL_TOP_SEP := 10
const STALL_GEAR_ICON := 46.0
const STALL_BUNDLE_ICON := 36.0
const STALL_TITLE_FS := 20
const STALL_SUB_FS := 15
const STALL_BODY_FS := 18
const STALL_PRICE_FS := 20
const STALL_BTN_FS := 17
const STALL_CHIP_ICON := 28.0
const STALL_CHIP_FS := 26
const STALL_CHIP_SEP := 6
var _status: Label
var _currency_row: HBoxContainer
var _vendor: Label
var _list: VBoxContainer
var _equipped: Array = []
var _bag_items: Array = []
## Staging only — up to 5 item dicts (empty Dictionary = vacant). Not bag storage.
var _sell_stage: Array = []
var _sell_btn: Button
var _busy := false
var _booting := false
var _busy_slot := ""
var _tick: Timer
var _win_idx := -1
## Shared hover inspection panel (stall + Hot Deal).
var _inspect: ItemInspectPopup


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_sell_stage.clear()
	for _i in SELL_SLOT_COUNT:
		_sell_stage.append({})
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	if not ShopManager.shop_window.is_empty():
		_win_idx = int(_shop_window().get("idx", 0))
		_populate()
	else:
		_set_status("Opening Black Market…")
	call_deferred("_start_boot")


func on_shell_reshow() -> void:
	_update_meta()
	if not ShopManager.shop_window.is_empty():
		_populate()
	elif not _booting:
		_set_status("Opening Black Market…")
	if _busy or _booting:
		return
	call_deferred("_start_boot")


func _start_boot() -> void:
	if not is_inside_tree() or not is_instance_valid(self):
		return
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_update_meta()


func _boot() -> void:
	if _booting:
		return
	_booting = true
	_set_status("Opening Black Market…")
	var res: Dictionary = await ShopManager.ensure_shop()
	if not is_inside_tree() or not is_instance_valid(self):
		_booting = false
		return
	if not res.ok:
		_set_status(str(res.get("error", "EnsureShop failed")))
	else:
		_win_idx = int(_shop_window().get("idx", 0))
		_populate()
	await MissionManager.refresh_character()
	await _load_bag_items()
	_load_equipped()
	_booting = false
	if not is_inside_tree() or not visible:
		return
	_win_idx = int(_shop_window().get("idx", 0))
	_populate()


func _shop_window() -> Dictionary:
	if not ShopManager.shop_window.is_empty():
		return ShopManager.shop_window
	return GameData.get_shop_window()


func _load_equipped() -> void:
	_equipped.clear()
	for it in _bag_items:
		if typeof(it) == TYPE_DICTIONARY and bool(it.get("is_equipped", false)):
			_equipped.append(it)


func _load_bag_items() -> void:
	_bag_items.clear()
	var items_res: Dictionary = await AuthManager.list_items()
	if not items_res.ok or typeof(items_res.data) != TYPE_ARRAY:
		return
	for it in items_res.data:
		if typeof(it) == TYPE_DICTIONARY:
			_bag_items.append(it)
	_prune_stale_sell_stage()


func _prune_stale_sell_stage() -> void:
	for i in _sell_stage.size():
		var staged: Variant = _sell_stage[i]
		if typeof(staged) != TYPE_DICTIONARY or staged.is_empty():
			_sell_stage[i] = {}
			continue
		var id := str(staged.get("id", ""))
		var live := InventoryRules.find_by_id(_bag_items, id)
		if live.is_empty() or not InventoryRules.is_sellable(live):
			_sell_stage[i] = {}
		else:
			_sell_stage[i] = live


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

	head_l.add_child(UiIcon.make_title_row("shopping-bag", "Black Market", ClientUi.TEXT, 29, 28.0))

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

	_inspect = ItemInspectPopup.new()
	add_child(_inspect)

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
	var idx := int(_shop_window().get("idx", 0))
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
	_hide_gear_inspect()
	for c in _list.get_children():
		c.queue_free()
	_update_meta()

	if ShopManager.gear_stock().is_empty():
		_list.add_child(_offline_panel())
		_list.add_child(_make_sell_section())
		return

	var hot: Dictionary = ShopManager.hot_deal()
	if not hot.is_empty():
		_list.add_child(_make_hot_banner(hot))

	_list.add_child(_make_market_section())
	_list.add_child(_make_sell_section())

	if _status.text.begins_with("Opening"):
		_set_status("")


func _offline_panel() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.size_flags_stretch_ratio = 1.0
	col.add_theme_constant_override("separation", 8)
	var t_center := CenterContainer.new()
	t_center.add_child(UiIcon.make_title_row("shopping-bag", "Black Market is offline", ClientUi.TEXT, 21, 24.0))
	col.add_child(t_center)
	var sub := Label.new()
	sub.text = "Could not load bazaar stock. Restart the game API and retry."
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_font_size_override("font_size", 19)
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
	var win: Dictionary = _shop_window()
	var day := ProgressManager.today_et()
	var seed := int(win.get("idx", 0)) * 17 + day.length() * 3
	_vendor.text = "“%s”" % GameData.get_vendor_line(seed)

	var countdown := GameData.format_shop_countdown(_seconds_left())
	# Prefer in-place updates so the tutorial-tagged refresh chip isn't destroyed
	# every tick (which used to kill coach highlight tweens).
	if _currency_row.get_child_count() >= 3:
		var nova_chip := _currency_row.get_child(0)
		var sd_chip := _currency_row.get_child(1)
		var refresh_chip := _currency_row.get_child(2)
		_set_currency_chip_amount(nova_chip, str(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA)))
		_set_currency_chip_amount(sd_chip, str(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST)))
		_set_currency_chip_amount(refresh_chip, "⏱  %s" % countdown)
		if refresh_chip is Control:
			TutorialManager.tag_target(refresh_chip as Control, "shop-refresh-timer")
		return

	for child in _currency_row.get_children():
		child.queue_free()
	# Web header chips: Nova (amber) · Stardust · shop-window clock
	_currency_row.add_child(ClientUi.make_currency_chip(
		"nova",
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA),
		Color("#FFD700")
	))
	_currency_row.add_child(ClientUi.make_currency_chip(
		"stardust",
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST),
		GameData.STARDUST_COLOR
	))
	var refresh_chip := ClientUi.make_currency_chip(
		"⏱",
		countdown,
		ClientUi.CYAN
	)
	TutorialManager.tag_target(refresh_chip, "shop-refresh-timer")
	_currency_row.add_child(refresh_chip)


func _set_currency_chip_amount(chip: Node, text: String) -> void:
	if chip == null or not is_instance_valid(chip) or not (chip is Control):
		return
	var amount := _find_chip_amount_label(chip as Control)
	if amount != null:
		amount.text = text


func _find_chip_amount_label(root: Control) -> Label:
	if root is Label:
		return root as Label
	for c in root.get_children():
		if c is Label:
			return c as Label
		if c is Control:
			var nested := _find_chip_amount_label(c as Control)
			if nested != null:
				return nested
	return null


func _seconds_left() -> int:
	var win := _shop_window()
	if win.has("endsAt"):
		var now_ms := int(Time.get_unix_time_from_system() * 1000.0)
		return maxi(0, int((int(win.get("endsAt", 0)) - now_ms) / 1000))
	return int(win.get("secondsLeft", 0))


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

	var badge_row := HBoxContainer.new()
	badge_row.alignment = BoxContainer.ALIGNMENT_CENTER
	badge_row.add_theme_constant_override("separation", 6)
	col.add_child(badge_row)
	badge_row.add_child(UiIcon.make("flame", Color("#FED7AA"), 18.0))
	var badge := Label.new()
	badge.text = "HOT DEAL · resets %s" % hot_eta
	badge.add_theme_font_size_override("font_size", 15)
	badge.add_theme_color_override("font_color", Color("#FED7AA"))
	ClientUi.apply_display_font(badge)
	badge_row.add_child(badge)

	var card := _make_gear_card(item, true, tint)
	if sold or yanked:
		card.modulate = Color(1, 1, 1, 0.72)
		col.add_child(card)
		var overlay := Label.new()
		overlay.text = "YANKED TODAY" if yanked else "CLAIMED TODAY"
		overlay.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		overlay.add_theme_font_size_override("font_size", 19)
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
	panel.size_flags_stretch_ratio = 1.0
	TutorialManager.tag_target(panel, "shop-buy")
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
	head_col.add_child(UiIcon.make_title_row("shopping-bag", "Black Market", ClientUi.TEXT, 20, 24.0))
	var h := Label.new()
	h.text = "8 stalls · gear & stims mixed · haggle gear"
	h.add_theme_font_size_override("font_size", 13)
	h.add_theme_color_override("font_color", ClientUi.MUTED)
	head_col.add_child(h)

	var restock := Button.new()
	restock.text = ""
	restock.icon = null
	restock.clip_contents = true
	restock.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_apply_restock_btn(restock, Color("#FFD700"))
	var restock_pad := MarginContainer.new()
	restock_pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_pad.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	restock_pad.add_theme_constant_override("margin_left", 12)
	restock_pad.add_theme_constant_override("margin_right", 12)
	restock_pad.add_theme_constant_override("margin_top", 6)
	restock_pad.add_theme_constant_override("margin_bottom", 6)
	restock.add_child(restock_pad)
	var restock_row := HBoxContainer.new()
	restock_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_row.alignment = BoxContainer.ALIGNMENT_CENTER
	restock_row.add_theme_constant_override("separation", 6)
	restock_pad.add_child(restock_row)
	var restock_lab := Label.new()
	restock_lab.text = "Restock · %s" % ShopManager.SHOP_REFRESH_COST
	restock_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	restock_lab.add_theme_font_size_override("font_size", 13)
	restock_lab.add_theme_color_override("font_color", Color("#FFD700"))
	ClientUi.apply_display_font(restock_lab)
	restock_row.add_child(restock_lab)
	var restock_nova := CurrencyIcon.make("nova", 16.0)
	restock_nova.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_row.add_child(restock_nova)
	var restock_min := restock_row.get_combined_minimum_size() + Vector2(24.0, 12.0)
	restock.custom_minimum_size = Vector2(ceili(restock_min.x), ceili(maxi(restock_min.y, 32.0)))
	restock.pressed.connect(func() -> void: _on_refresh("all"))
	TutorialManager.tag_target(restock, "shop-restock")
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
		var stim_slot_ids: Array = []
		for item in stock:
			if typeof(item) != TYPE_DICTIONARY:
				continue
			if ShopManager.is_stim_slot(item):
				var sid := str(item.get("_slotId", "")).strip_edges()
				if not sid.is_empty():
					stim_slot_ids.append(sid)
		var locked_stim := ""
		if TutorialManager.should_show() and TutorialManager.step_id() == "shop_market":
			locked_stim = TutorialManager.lock_shop_tutorial_stim(stim_slot_ids)
		for item in stock:
			if typeof(item) != TYPE_DICTIONARY:
				continue
			if ShopManager.is_stim_slot(item):
				var sid := str(item.get("_slotId", "")).strip_edges()
				var tag_stim := not locked_stim.is_empty() and sid == locked_stim
				grid.add_child(_make_cons_card(item, tag_stim))
			else:
				var rarity := str(item.get("rarity", "common"))
				grid.add_child(_make_gear_card(item, false, ClientUi.rarity_color(rarity)))
	return panel


func _apply_restock_btn(btn: Button, accent: Color) -> void:
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 13)
	var idle := ClientUi.button_style(
		Color(accent.r, accent.g, accent.b, 0.15), Color(accent.r, accent.g, accent.b, 0.35)
	)
	var hover := ClientUi.button_style(
		Color(accent.r, accent.g, accent.b, 0.25), Color(accent.r, accent.g, accent.b, 0.5)
	)
	var pressed := ClientUi.button_style(
		Color(accent.r, accent.g, accent.b, 0.32), Color(accent.r, accent.g, accent.b, 0.65)
	)
	btn.add_theme_stylebox_override("normal", idle)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("focus", hover)
	btn.add_theme_stylebox_override("disabled", idle)
	btn.add_theme_color_override("font_color", accent)
	btn.add_theme_color_override("font_hover_color", accent)
	btn.add_theme_color_override("font_pressed_color", accent)
	btn.add_theme_color_override("font_focus_color", accent)
	ClientUi.apply_interaction_motion(btn)


func _empty_line(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.add_theme_font_size_override("font_size", 19)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	return lab


# ─── Cards ──────────────────────────────────────────────────────────────────

func _make_cons_card(item: Dictionary, tutorial_stim := false) -> PanelContainer:
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
	var yanked := ShopManager.is_slot_yanked(slot_id)
	var owned := ShopManager.is_slot_purchased(slot_id) or yanked

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if tutorial_stim:
		TutorialManager.tag_target(panel, "shop-stim")
	else:
		TutorialManager.tag_target(panel, "shop-item")
	var panel_sb: StyleBoxFlat = ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.08, 0.96), Color(rarity_tint, 0.45), 10, 1
	).duplicate()
	panel_sb.content_margin_top = int(round(float(panel_sb.content_margin_top) * 1.15))
	panel_sb.content_margin_bottom = int(round(float(panel_sb.content_margin_bottom) * 1.15))
	panel.add_theme_stylebox_override("panel", panel_sb)
	if owned:
		panel.modulate = Color(1, 1, 1, 0.72)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", STALL_SEP)
	panel.add_child(col)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", STALL_TOP_SEP)
	col.add_child(top)
	var icon_box := PanelContainer.new()
	icon_box.custom_minimum_size = Vector2(56, 56)
	icon_box.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(tint, 0.12), Color(tint, 0.4), 8, 1
	))
	top.add_child(icon_box)
	var icon_center := CenterContainer.new()
	icon_box.add_child(icon_center)
	if is_trio:
		icon_center.add_child(UiIcon.make("package", tint, 28.0))
	elif stat == "all":
		icon_center.add_child(UiIcon.make("sparkles", tint, 28.0))
	else:
		icon_center.add_child(StatIcon.make(stat, 28.0))

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title_col)
	var title := Label.new()
	title.text = str(item.get("name", "?"))
	title.add_theme_font_size_override("font_size", STALL_TITLE_FS)
	title.add_theme_color_override("font_color", rarity_tint)
	ClientUi.apply_display_font(title)
	title_col.add_child(title)
	var sub := Label.new()
	sub.text = "bundle · 3 stims" if is_trio else ("%s · stim" % rarity)
	sub.add_theme_font_size_override("font_size", STALL_SUB_FS)
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
	detail.add_theme_font_size_override("font_size", STALL_BODY_FS)
	ClientUi.apply_body_font(detail)
	col.add_child(detail)

	if owned:
		var gone := Label.new()
		gone.text = "YANKED" if yanked else "SOLD"
		gone.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		gone.add_theme_font_size_override("font_size", STALL_BODY_FS)
		gone.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(gone)
		col.add_child(gone)
	else:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		col.add_child(row)
		var price := CurrencyIcon.make_stardust_amount_row(cost, 16.0, STALL_PRICE_FS)
		price.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(price)
		var buy := Button.new()
		buy.text = "Open" if is_trio else "Buy"
		ClientUi.apply_primary_button(buy)
		buy.add_theme_font_size_override("font_size", STALL_BTN_FS)
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
	var stall := not is_hot
	var title_fs := STALL_TITLE_FS if stall else 18
	var sub_fs := STALL_SUB_FS if stall else 16
	var body_fs := STALL_BODY_FS if stall else 18
	var sep := STALL_SEP if stall else 4
	var top_sep := STALL_TOP_SEP if stall else 8
	var gear_icon := STALL_GEAR_ICON if stall else 36.0
	var bundle_icon := STALL_BUNDLE_ICON if stall else 29.0

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	TutorialManager.tag_target(panel, "shop-item")
	var border := Color(tint, 0.7) if is_hot else Color(tint, 0.45)
	var panel_sb: StyleBoxFlat = ClientUi.painted_panel_style(
		Color(0.05, 0.05, 0.08, 0.96), border, 10, 2 if is_hot else 1
	).duplicate()
	if stall:
		panel_sb.content_margin_top = int(round(float(panel_sb.content_margin_top) * 1.15))
		panel_sb.content_margin_bottom = int(round(float(panel_sb.content_margin_bottom) * 1.15))
	panel.add_theme_stylebox_override("panel", panel_sb)
	if owned:
		panel.modulate = Color(1, 1, 1, 0.72)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", sep)
	panel.add_child(col)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", top_sep)
	col.add_child(top)
	if is_bundle:
		top.add_child(UiIcon.make("package", tint, bundle_icon))
	else:
		top.add_child(GearIcon.make(item, gear_icon))

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title_col)
	var title := Label.new()
	title.text = str(item.get("name", "?"))
	title.add_theme_font_size_override("font_size", title_fs)
	title.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(title)
	title_col.add_child(title)
	var sub := Label.new()
	if is_bundle:
		sub.text = "bundle · 2 commons"
	else:
		sub.text = "%s · %s" % [str(item.get("rarity", "")), GameData.gear_type_label(item_type)]
	sub.add_theme_font_size_override("font_size", sub_fs)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	title_col.add_child(sub)

	if is_bundle:
		var flavor := Label.new()
		flavor.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		flavor.text = str(item.get("flavor_text", "Crate"))
		flavor.add_theme_font_size_override("font_size", STALL_SUB_FS if stall else 17)
		flavor.add_theme_color_override("font_color", ClientUi.MUTED)
		col.add_child(flavor)
	else:
		# Base attributes only (backpack chip style) — comparison lives in hover popup.
		var stats_raw: Variant = item.get("stats", {})
		if typeof(stats_raw) == TYPE_DICTIONARY:
			var entries := _gear_attr_entries(stats_raw as Dictionary)
			if not entries.is_empty():
				col.add_child(_make_gear_attr_band(entries, stall))
		var captured := item.duplicate(true)
		panel.mouse_entered.connect(func() -> void:
			_show_gear_inspect(panel, captured)
		)
		panel.mouse_exited.connect(_request_hide_gear_inspect)

	if owned:
		var gone := Label.new()
		gone.text = "YANKED" if yanked else "SOLD"
		gone.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		gone.add_theme_font_size_override("font_size", body_fs)
		gone.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(gone)
		col.add_child(gone)
	else:
		col.add_child(_gear_actions(item, is_hot, is_bundle, cost, nova, slot_id, stall))
	return panel


func _gear_attr_entries(stats_raw: Dictionary) -> Array:
	var entries: Array = []
	for k in ["strength", "agility", "intellect", "vitality", "luck"]:
		var v := int(stats_raw.get(k, 0))
		if v <= 0:
			continue
		entries.append({"k": k, "v": v})
		if entries.size() >= 5:
			break
	return entries


func _make_gear_attr_band(entries: Array, stall: bool = false) -> Control:
	# Stall cards: one left-anchored row. Hot Deal keeps centered multi-row bag layout.
	if stall:
		return _make_gear_attr_row(entries, true)

	var band := VBoxContainer.new()
	band.mouse_filter = Control.MOUSE_FILTER_IGNORE
	band.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	band.alignment = BoxContainer.ALIGNMENT_CENTER
	band.add_theme_constant_override("separation", 2)
	var n := entries.size()
	var top_n := 0
	var bot_n := n
	if n > 2:
		bot_n = int(ceil(float(n) / 2.0))
		top_n = n - bot_n
	if top_n > 0:
		band.add_child(_make_gear_attr_row(entries.slice(0, top_n), false))
	band.add_child(_make_gear_attr_row(entries.slice(top_n, n), false))
	return band


func _make_gear_attr_row(entries: Array, stall: bool = false) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if stall:
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.alignment = BoxContainer.ALIGNMENT_BEGIN
	else:
		row.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", STALL_CHIP_SEP if stall else 4)
	var icon_sz := STALL_CHIP_ICON if stall else StatIcon.SIZE_ITEM_PANE
	var font_sz := STALL_CHIP_FS if stall else 20
	for e in entries:
		var k := str(e.get("k", ""))
		var v := int(e.get("v", 0))
		row.add_child(StatIcon.make_labeled(
			k,
			str(v),
			icon_sz,
			font_sz,
			GameData.stat_color(k),
			STALL_CHIP_SEP if stall else 4
		))
	return row


func _request_hide_gear_inspect() -> void:
	if _inspect != null and is_instance_valid(_inspect):
		_inspect.request_hide()


func _hide_gear_inspect() -> void:
	if _inspect != null and is_instance_valid(_inspect):
		_inspect.force_hide()


func _show_gear_inspect(anchor: Control, item: Dictionary) -> void:
	if _inspect == null or not is_instance_valid(_inspect):
		return
	var item_type := str(item.get("type", ""))
	var worn: Dictionary = {}
	if InventoryRules.is_equippable(item_type):
		worn = _equipped_of_type(item_type)
	_inspect.present(anchor, item, {
		"compare_with": worn,
		"show_sell_value": false,
		"actions": [],
	})

func _gear_actions(
	item: Dictionary,
	is_hot: bool,
	is_bundle: bool,
	cost: int,
	nova: int,
	slot_id: String,
	stall: bool = false
) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var price_col := VBoxContainer.new()
	price_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(price_col)
	var price_fs := STALL_PRICE_FS if stall else 16
	var nova_fs := STALL_BODY_FS if stall else 15
	var btn_fs := STALL_BTN_FS if stall else 15
	price_col.add_child(CurrencyIcon.make_stardust_amount_row(cost, 16.0, price_fs))
	if nova > 0:
		price_col.add_child(CurrencyIcon.make_amount_row(
			nova, 14.0, CurrencyIcon.NOVA_GOLD, nova_fs
		))

	if not is_bundle:
		var hag := Button.new()
		hag.text = "Haggle"
		_apply_haggle_btn(hag)
		if stall:
			hag.add_theme_font_size_override("font_size", STALL_SUB_FS)
		hag.pressed.connect(func() -> void: _on_buy_gear(slot_id, is_hot, true, cost, nova))
		row.add_child(hag)

	var buy := Button.new()
	buy.text = "Open" if is_bundle else "Buy"
	ClientUi.apply_primary_button(buy)
	buy.add_theme_font_size_override("font_size", btn_fs)
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
	var nova: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA))
	if nova < ShopManager.SHOP_REFRESH_COST:
		Notify.blocked("Need %s Nova Crystals to refresh" % ShopManager.SHOP_REFRESH_COST)
		return
	_busy = true
	_set_status("Refreshing %s…" % which)
	var res: Dictionary = await ShopManager.refresh_shop(which)
	_busy = false
	if not res.ok:
		if not Notify.from_result(res):
			_set_status(str(res.get("error", "Refresh failed")))
		_update_meta()
		return
	_set_status("Black Market restocked (−%s Nova Crystals)." % ShopManager.SHOP_REFRESH_COST)
	_populate()


func _on_buy_cons(slot_id: String, cost: int) -> void:
	if _busy:
		return
	var sd: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	if not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost):
		Notify.blocked("Not enough Stardust", "Need %s — you have %s" % [cost, sd])
		return
	_busy = true
	_busy_slot = slot_id
	_set_status("Buying stim…")
	var res: Dictionary = await ShopManager.buy_consumable(slot_id)
	_busy = false
	_busy_slot = ""
	if not res.ok:
		if not Notify.from_result(res):
			_set_status(_err(res))
		_update_meta()
		return
	_set_status(_purchase_msg(ShopManager.last_purchase, "Purchased!"))
	await _load_bag_items()
	_load_equipped()
	_populate()


func _on_buy_gear(slot_id: String, is_hot: bool, haggle: bool, cost: int, nova: int) -> void:
	if _busy:
		return
	var sd: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	# Client affordability check is UX only — Node recalculates / haggles authoritatively.
	if not haggle and not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost):
		Notify.blocked("Not enough Stardust", "Need %s — you have %s" % [cost, sd])
		return
	if nova > 0 and not CurrencyManager.can_afford(CurrencyManager.CURRENCY_NOVA, nova):
		Notify.blocked("Not enough Nova Crystals", "Need %s Nova" % nova)
		return
	_busy = true
	_busy_slot = slot_id
	_set_status("Buying gear…" if not haggle else "Haggling…")
	var res: Dictionary = await ShopManager.buy_gear(slot_id, is_hot, haggle)
	_busy = false
	_busy_slot = ""
	if not res.ok:
		if not Notify.from_result(res):
			_set_status(_err(res))
		_update_meta()
		return
	var purchase: Dictionary = ShopManager.last_purchase
	if bool(purchase.get("haggle_failed", false)):
		_set_status(str(purchase.get("haggle_note", "Deal soured — listing yanked")))
		_populate()
		return
	var msg := _purchase_msg(purchase, "Purchased!")
	if str(purchase.get("haggle_note", "")) != "":
		msg = "%s · %s" % [purchase.get("haggle_note", ""), msg]
	_set_status(msg)
	await _load_bag_items()
	_load_equipped()
	_populate()


func _purchase_msg(purchase: Dictionary, fallback: String) -> String:
	var pending: Variant = purchase.get("pending_loot", [])
	var items: Variant = purchase.get("items", [])
	var cost := int(purchase.get("cost", 0))
	var nova_cost := int(purchase.get("nova_cost", 0))
	var parts: PackedStringArray = [fallback]
	if cost > 0:
		parts.append("−%s Stardust" % cost)
	if nova_cost > 0:
		parts.append("−%s Nova" % nova_cost)
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


# ── Sell fence (authoritative DissolveJunk / Void eligibility) ─────────────

func _make_sell_section() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	col.add_theme_constant_override("separation", SELL_SECTION_SEP)
	TutorialManager.tag_target(col, "shop-sell-tray")

	var gap := Control.new()
	gap.custom_minimum_size.y = 6
	col.add_child(gap)

	var rule := HSeparator.new()
	rule.modulate = Color(1, 1, 1, 0.22)
	col.add_child(rule)

	var head := Label.new()
	head.text = "SELL ITEMS"
	head.add_theme_font_size_override("font_size", 15)
	head.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(head)
	col.add_child(head)

	var bag_hint := Label.new()
	bag_hint.text = "Bag — click or drag gear into the tray"
	bag_hint.add_theme_font_size_override("font_size", 17)
	bag_hint.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.9))
	ClientUi.apply_body_font(bag_hint)
	col.add_child(bag_hint)

	var available := _sell_available_items()
	var source_h := SELL_SLOT_H * float(SELL_SOURCE_ROWS) + float(SELL_GRID_V_SEP) * float(SELL_SOURCE_ROWS - 1)
	var source_scroll := ScrollContainer.new()
	source_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	source_scroll.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	source_scroll.custom_minimum_size = Vector2(0, source_h)
	source_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	source_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	col.add_child(source_scroll)

	var source_grid := _make_sell_grid()
	source_scroll.add_child(source_grid)
	for it in available:
		source_grid.add_child(_make_sell_bag_slot(it as Dictionary, false))
	# Always reserve at least 2 full rows so the bag grid never collapses/stretches.
	var min_cells := SELL_SLOT_COUNT * SELL_SOURCE_ROWS
	while source_grid.get_child_count() < min_cells:
		source_grid.add_child(_make_sell_bag_slot({}, false))
	if available.is_empty():
		bag_hint.text = "Bag — unequipped unlocked items appear here"

	var tray_hint := Label.new()
	tray_hint.text = "Sell tray — up to %s items" % SELL_SLOT_COUNT
	tray_hint.add_theme_font_size_override("font_size", 17)
	tray_hint.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.9))
	ClientUi.apply_body_font(tray_hint)
	col.add_child(tray_hint)

	var stage_grid := _make_sell_grid()
	stage_grid.custom_minimum_size.y = SELL_SLOT_H
	col.add_child(stage_grid)
	for i in SELL_SLOT_COUNT:
		var staged: Dictionary = _sell_stage[i] if typeof(_sell_stage[i]) == TYPE_DICTIONARY else {}
		stage_grid.add_child(_make_sell_bag_slot(staged, true, i))

	var btn_wrap := CenterContainer.new()
	btn_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn_wrap.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	col.add_child(btn_wrap)

	_sell_btn = Button.new()
	_sell_btn.custom_minimum_size = Vector2(SELL_BTN_MIN_W, SELL_BTN_MIN_H)
	_sell_btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_apply_sell_action_button(_sell_btn)
	_sell_btn.pressed.connect(_on_confirm_sell)
	btn_wrap.add_child(_sell_btn)
	_refresh_sell_button()
	return col


func _make_sell_grid() -> GridContainer:
	var grid := GridContainer.new()
	grid.columns = SELL_SLOT_COUNT
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	grid.add_theme_constant_override("h_separation", SELL_GRID_H_SEP)
	grid.add_theme_constant_override("v_separation", SELL_GRID_V_SEP)
	return grid


func _apply_sell_action_button(btn: Button) -> void:
	## Primary fence CTA — larger painted cyan with soft glow; disabled stays muted.
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 18)
	var top := Color(0.14, 0.88, 0.96)
	var bottom := Color(0.05, 0.68, 0.82)
	var border := Color(0.08, 0.78, 0.90)
	var ink := Color(0.03, 0.05, 0.08)
	var normal := _sell_btn_style(top, bottom, border, 0.55)
	var hover := _sell_btn_style(Color(0.22, 0.94, 1.0), Color(0.10, 0.78, 0.90), Color(0.45, 0.95, 1.0), 0.85)
	var pressed := _sell_btn_style(Color(0.06, 0.58, 0.72), Color(0.03, 0.42, 0.54), border, 0.35)
	var disabled := _sell_btn_style(
		Color(0.12, 0.14, 0.18), Color(0.08, 0.10, 0.13), Color(0.28, 0.32, 0.38, 0.7), 0.0
	)
	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("disabled", disabled)
	btn.add_theme_color_override("font_color", ink)
	btn.add_theme_color_override("font_hover_color", ink)
	btn.add_theme_color_override("font_pressed_color", ink)
	btn.add_theme_color_override("font_disabled_color", Color(0.45, 0.50, 0.55))
	btn.set_meta("ui_sfx_kind", "confirm")
	ClientUi.apply_interaction_motion(btn, 1.03)


func _sell_btn_style(top: Color, bottom: Color, border: Color, glow: float) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = top.lerp(bottom, 0.42)
	s.border_color = border
	s.set_border_width_all(2)
	s.corner_radius_top_left = 12
	s.corner_radius_top_right = 12
	s.corner_radius_bottom_left = 12
	s.corner_radius_bottom_right = 12
	s.content_margin_left = 28
	s.content_margin_right = 28
	s.content_margin_top = 14
	s.content_margin_bottom = 14
	s.shadow_color = Color(border.r, border.g, border.b, clampf(glow, 0.0, 1.0) * 0.55)
	s.shadow_size = 10 if glow > 0.01 else 0
	s.shadow_offset = Vector2(0, 3)
	return s


func _format_sell_amount(n: int) -> String:
	var s := str(maxi(0, n))
	var out := ""
	var count := 0
	for i in range(s.length() - 1, -1, -1):
		if count > 0 and count % 3 == 0:
			out = "," + out
		out = s[i] + out
		count += 1
	return out


func _sell_available_items() -> Array:
	var staged_ids: Dictionary = {}
	for slot in _sell_stage:
		if typeof(slot) == TYPE_DICTIONARY and not slot.is_empty():
			staged_ids[str(slot.get("id", ""))] = true
	var out: Array = []
	for it in _bag_items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if not InventoryRules.is_sellable(it):
			continue
		var id := str(it.get("id", ""))
		if staged_ids.has(id):
			continue
		out.append(it)
	return out


func _sell_preview_total() -> int:
	var total := 0
	for slot in _sell_stage:
		if typeof(slot) == TYPE_DICTIONARY and not slot.is_empty():
			total += InventoryRules.estimate_sell_value(slot)
	return total


func _sell_staged_ids() -> Array:
	var ids: Array = []
	for slot in _sell_stage:
		if typeof(slot) != TYPE_DICTIONARY or slot.is_empty():
			continue
		var id := str(slot.get("id", ""))
		if not id.is_empty():
			ids.append(id)
	return ids


func _refresh_sell_button() -> void:
	if _sell_btn == null or not is_instance_valid(_sell_btn):
		return
	var ids := _sell_staged_ids()
	var total := _sell_preview_total()
	_sell_btn.disabled = ids.is_empty() or _busy
	if ids.is_empty():
		_sell_btn.text = "SELL ITEMS — SELECT GEAR"
		_sell_btn.icon = null
	else:
		_sell_btn.text = "SELL ITEMS — %s" % _format_sell_amount(total)
		CurrencyIcon.apply_stardust_button_cost(_sell_btn, 16.0)


func _make_sell_bag_slot(item: Dictionary, is_stage: bool, stage_index: int = -1) -> PanelContainer:
	var filled := not item.is_empty()
	var panel := PanelContainer.new()
	# Equal stretch across the 5 columns; height is locked so icons never grow.
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	panel.size_flags_stretch_ratio = 1.0
	panel.custom_minimum_size = Vector2(SELL_SLOT_MIN_W, SELL_SLOT_H)
	panel.clip_contents = true
	if filled:
		var tint := ClientUi.rarity_color(str(item.get("rarity", "")))
		panel.add_theme_stylebox_override("panel", _sell_slot_style(Color(tint, 0.14), Color(tint, 0.55)))
		panel.tooltip_text = "%s — %s Stardust · click to %s" % [
			str(item.get("name", "Item")),
			_format_sell_amount(InventoryRules.estimate_sell_value(item)),
			"remove" if is_stage else "stage for sale",
		]
	else:
		panel.add_theme_stylebox_override(
			"panel",
			_sell_slot_style(Color(0.04, 0.05, 0.08, 0.78), Color(0.28, 0.34, 0.42, 0.42))
		)
		panel.tooltip_text = "Empty sell slot" if is_stage else ""
		panel.modulate.a = 0.72 if is_stage else 0.45

	var root := VBoxContainer.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.alignment = BoxContainer.ALIGNMENT_CENTER
	root.add_theme_constant_override("separation", 3)
	panel.add_child(root)

	if filled:
		var title := Label.new()
		title.mouse_filter = Control.MOUSE_FILTER_IGNORE
		title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		title.autowrap_mode = TextServer.AUTOWRAP_OFF
		title.clip_text = true
		title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		title.custom_minimum_size.y = 16
		title.text = str(item.get("name", "Item"))
		title.add_theme_font_size_override("font_size", SELL_TITLE_FS)
		title.add_theme_color_override(
			"font_color",
			ClientUi.rarity_color(str(item.get("rarity", ""))).lightened(0.2)
		)
		ClientUi.apply_display_font(title)
		root.add_child(title)

		var icon_wrap := CenterContainer.new()
		icon_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		icon_wrap.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		icon_wrap.custom_minimum_size = Vector2(SELL_ICON_SZ, SELL_ICON_SZ)
		root.add_child(icon_wrap)
		var gear := GearIcon.make(item, SELL_ICON_SZ)
		gear.custom_minimum_size = Vector2(SELL_ICON_SZ, SELL_ICON_SZ)
		icon_wrap.add_child(gear)

		var val_host := CenterContainer.new()
		val_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
		val_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		val_host.custom_minimum_size.y = 16
		root.add_child(val_host)
		val_host.add_child(CurrencyIcon.make_stardust_amount_row(
			_format_sell_amount(InventoryRules.estimate_sell_value(item)),
			12.0,
			SELL_VAL_FS
		))
	else:
		var mark := Label.new()
		mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		mark.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mark.size_flags_vertical = Control.SIZE_EXPAND_FILL
		mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		mark.autowrap_mode = TextServer.AUTOWRAP_OFF
		mark.text = "—" if is_stage else "·"
		mark.add_theme_font_size_override("font_size", 20 if is_stage else 16)
		mark.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.75 if is_stage else 0.45))
		root.add_child(mark)

	if filled and not is_stage:
		TutorialManager.tag_target(panel, "shop-sell-item")
	if filled:
		var captured := item.duplicate(true)
		var idx := stage_index
		panel.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
				if is_stage:
					_unstage_sell_slot(idx)
				else:
					_stage_sell_item(captured)
				panel.accept_event()
		)
		panel.set_drag_forwarding(
			func(_at: Vector2) -> Variant:
				return {
					"kind": "bm_sell",
					"item": captured.duplicate(true),
					"from_stage": is_stage,
					"stage_index": idx,
				},
			func(_at: Vector2, data: Variant) -> bool:
				return is_stage and _can_drop_on_sell_slot(data),
			func(_at: Vector2, data: Variant) -> void:
				if is_stage:
					_drop_on_sell_slot(idx, data)
		)
	elif is_stage:
		var idx2 := stage_index
		panel.set_drag_forwarding(
			func(_at: Vector2) -> Variant: return null,
			func(_at: Vector2, data: Variant) -> bool:
				return _can_drop_on_sell_slot(data),
			func(_at: Vector2, data: Variant) -> void:
				_drop_on_sell_slot(idx2, data)
		)
	return panel


func _sell_slot_style(bg: Color, border: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 6
	sb.content_margin_right = 6
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	return sb


func _can_drop_on_sell_slot(data: Variant) -> bool:
	if typeof(data) != TYPE_DICTIONARY:
		return false
	if str(data.get("kind", "")) != "bm_sell":
		return false
	var item: Variant = data.get("item", {})
	return typeof(item) == TYPE_DICTIONARY and InventoryRules.is_sellable(item)


func _drop_on_sell_slot(stage_index: int, data: Variant) -> void:
	if not _can_drop_on_sell_slot(data) or stage_index < 0 or stage_index >= SELL_SLOT_COUNT:
		return
	var item: Dictionary = (data.get("item", {}) as Dictionary).duplicate(true)
	var id := str(item.get("id", ""))
	# Move within stage or from bag pool — never duplicate.
	for i in _sell_stage.size():
		var slot: Variant = _sell_stage[i]
		if typeof(slot) == TYPE_DICTIONARY and str(slot.get("id", "")) == id:
			_sell_stage[i] = {}
	_sell_stage[stage_index] = item
	_populate()


func _stage_sell_item(item: Dictionary) -> void:
	if _busy or not InventoryRules.is_sellable(item):
		return
	var id := str(item.get("id", ""))
	for slot in _sell_stage:
		if typeof(slot) == TYPE_DICTIONARY and str(slot.get("id", "")) == id:
			return
	var empty := -1
	for i in _sell_stage.size():
		var slot: Variant = _sell_stage[i]
		if typeof(slot) != TYPE_DICTIONARY or slot.is_empty():
			empty = i
			break
	if empty < 0:
		Notify.blocked("Sell tray full", "Remove an item or confirm the sale")
		return
	_sell_stage[empty] = item.duplicate(true)
	_populate()


func _unstage_sell_slot(stage_index: int) -> void:
	if stage_index < 0 or stage_index >= _sell_stage.size():
		return
	_sell_stage[stage_index] = {}
	_populate()


func _on_confirm_sell() -> void:
	if _busy:
		return
	var ids := _sell_staged_ids()
	if ids.is_empty():
		return
	_busy = true
	_refresh_sell_button()
	_set_status("Selling…")
	var preview := _sell_preview_total()
	var res: Dictionary = await ShopManager.sell_items(ids)
	_busy = false
	if not res.ok:
		if not Notify.from_result(res):
			_set_status(str(res.get("error", "Sale failed")))
		await _load_bag_items()
		_load_equipped()
		_populate()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var gained := int(data.get("stardust_gained", preview))
	var dissolved: Variant = data.get("dissolved", ids)
	var dissolved_n: int = ids.size()
	if typeof(dissolved) == TYPE_ARRAY:
		dissolved_n = (dissolved as Array).size()
	for i in _sell_stage.size():
		_sell_stage[i] = {}
	await _load_bag_items()
	_load_equipped()
	_set_status("Sold %s item(s) for %s Stardust" % [dissolved_n, gained])
	_populate()
