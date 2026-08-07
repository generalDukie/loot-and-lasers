extends Control
## Black Market — mirrors web ShopPage (header · hot deal · unified stalls · sell fence).

const SELL_SLOT_COUNT := 5
const SELL_SLOT_MIN_H := 72.0
## Bag source is always laid out as 2 rows; staging is 1 matching row (2:1).
const SELL_SOURCE_ROWS := 2
const SELL_GRID_V_SEP := 6
const SELL_SECTION_SEP := 8
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
## Shared hover compare popup (stall + Hot Deal).
const INSPECT_MIN_W := 210.0
const INSPECT_MAX_W := 340.0
const INSPECT_TITLE_FS := 18
const INSPECT_META_FS := 14
const INSPECT_ROW_FS := 16
const INSPECT_VAL_FS := 18
const INSPECT_DELTA_FS := 16
const INSPECT_ICON := 30.0

var _status: Label
var _currency_row: HBoxContainer
var _vendor: Label
var _list: VBoxContainer
var _equipped: Array = []
var _bag_items: Array = []
## Staging only — up to 5 item dicts (empty Dictionary = vacant). Not bag storage.
var _sell_stage: Array = []
var _sell_btn: Button
## Sell pane layout — source (2 rows) + staging (1 row) under Hot Deal; cells match.
var _sell_root: VBoxContainer
var _sell_stage_row: HBoxContainer
var _sell_source_area: Control
var _sell_panels: Array = []
var _sell_slot_h := SELL_SLOT_MIN_H
var _busy := false
var _busy_slot := ""
var _tick: Timer
var _win_idx := -1
## Hover compare popup (backpack-style stats/compare only — Buy/Haggle stay on the card).
var _gear_inspect: PanelContainer
var _gear_inspect_col: VBoxContainer
var _inspect_anchor: Control = null


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_sell_stage.clear()
	for _i in SELL_SLOT_COUNT:
		_sell_stage.append({})
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_update_meta()


func _boot() -> void:
	_set_status("Opening Black Market…")
	await MissionManager.refresh_character()
	await _load_bag_items()
	await _load_equipped()
	var res: Dictionary = await ShopManager.ensure_shop()
	if not res.ok:
		_set_status(str(res.get("error", "EnsureShop failed")))
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

	_gear_inspect = PanelContainer.new()
	_gear_inspect.visible = false
	_gear_inspect.z_index = 80
	_gear_inspect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_gear_inspect.custom_minimum_size = Vector2(INSPECT_MIN_W, 0)
	_gear_inspect.add_theme_stylebox_override("panel", _compact_inspect_style(ClientUi.CYAN))
	add_child(_gear_inspect)
	_gear_inspect_col = VBoxContainer.new()
	_gear_inspect_col.add_theme_constant_override("separation", 2)
	_gear_inspect_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_gear_inspect.add_child(_gear_inspect_col)

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
	var win: Dictionary = _shop_window()
	var day := ProgressManager.today_et()
	var seed := int(win.get("idx", 0)) * 17 + day.length() * 3
	_vendor.text = "“%s”" % GameData.get_vendor_line(seed)

	for child in _currency_row.get_children():
		child.queue_free()
	# Web header chips: Nova (amber) · Stardust · shop-window clock
	_currency_row.add_child(ClientUi.make_currency_chip(
		"💎",
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA),
		Color("#FCD34D")
	))
	_currency_row.add_child(ClientUi.make_currency_chip(
		"✦",
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST),
		GameData.STARDUST_COLOR
	))
	_currency_row.add_child(ClientUi.make_currency_chip(
		"⏱",
		GameData.format_shop_countdown(_seconds_left()),
		ClientUi.CYAN
	))


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
	panel.size_flags_stretch_ratio = 1.0
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
	var yanked := ShopManager.is_slot_yanked(slot_id)
	var owned := ShopManager.is_slot_purchased(slot_id) or yanked

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
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
		var price := Label.new()
		price.text = "✦ %s" % cost
		price.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		price.add_theme_font_size_override("font_size", STALL_PRICE_FS)
		price.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
		ClientUi.apply_display_font(price)
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
	var title_fs := STALL_TITLE_FS if stall else 16
	var sub_fs := STALL_SUB_FS if stall else 12
	var body_fs := STALL_BODY_FS if stall else 15
	var sep := STALL_SEP if stall else 4
	var top_sep := STALL_TOP_SEP if stall else 8
	var gear_icon := STALL_GEAR_ICON if stall else 36.0
	var bundle_icon := STALL_BUNDLE_ICON if stall else 29.0

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
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
		flavor.add_theme_font_size_override("font_size", STALL_SUB_FS if stall else 13)
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
		panel.mouse_exited.connect(_hide_gear_inspect)

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


func _compact_inspect_style(accent: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.055, 0.1, 0.98)
	sb.border_color = Color(accent, 0.8)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	sb.shadow_color = Color(0, 0, 0, 0.4)
	sb.shadow_size = 8
	sb.shadow_offset = Vector2(0, 2)
	return sb


func _hide_gear_inspect() -> void:
	_inspect_anchor = null
	if _gear_inspect:
		_gear_inspect.visible = false


func _show_gear_inspect(anchor: Control, item: Dictionary) -> void:
	if _gear_inspect == null or not is_instance_valid(_gear_inspect):
		return
	_inspect_anchor = anchor
	_rebuild_gear_inspect(item)
	_gear_inspect.visible = true
	_gear_inspect.reset_size()
	_position_gear_inspect(anchor)


func _position_gear_inspect(anchor: Control) -> void:
	if _gear_inspect == null or anchor == null or not is_instance_valid(anchor):
		return
	var rect := anchor.get_global_rect()
	var size := _gear_inspect.get_combined_minimum_size()
	size.x = clampf(size.x, INSPECT_MIN_W, INSPECT_MAX_W)
	_gear_inspect.size = size
	var vp := get_viewport_rect().size
	var gap := -2.0
	var pos := Vector2(rect.end.x + gap, rect.position.y)
	if pos.x + size.x > vp.x - 8.0:
		pos.x = rect.position.x - size.x - gap
	if pos.x < 8.0:
		pos.x = clampf(rect.position.x, 8.0, maxf(8.0, vp.x - size.x - 8.0))
		pos.y = rect.position.y - size.y - gap
		if pos.y < 8.0:
			pos.y = rect.end.y + gap
	if pos.y + size.y > vp.y - 8.0:
		pos.y = maxf(8.0, vp.y - size.y - 8.0)
	if pos.y < 8.0:
		pos.y = 8.0
	_gear_inspect.global_position = pos


func _rebuild_gear_inspect(item: Dictionary) -> void:
	while _gear_inspect_col.get_child_count() > 0:
		var old: Node = _gear_inspect_col.get_child(0)
		_gear_inspect_col.remove_child(old)
		old.free()
	var item_type := str(item.get("type", ""))
	var tint := ClientUi.rarity_color(str(item.get("rarity", "")))
	_gear_inspect.add_theme_stylebox_override("panel", _compact_inspect_style(tint))

	var title := Label.new()
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = str(item.get("name", "Item"))
	title.add_theme_font_size_override("font_size", INSPECT_TITLE_FS)
	title.add_theme_color_override("font_color", tint.lightened(0.2))
	ClientUi.apply_display_font(title)
	_gear_inspect_col.add_child(title)

	var meta := Label.new()
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meta.text = "%s · %s · Lv.%s" % [
		str(item.get("rarity", "?")),
		GameData.gear_type_label(item_type) if not item_type.is_empty() else item_type,
		ClientUi.format_level(item.get("level_requirement", "?")),
	]
	meta.add_theme_font_size_override("font_size", INSPECT_META_FS)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	_gear_inspect_col.add_child(meta)

	var worn: Dictionary = {}
	if InventoryRules.is_equippable(item_type):
		worn = _equipped_of_type(item_type)
	if not worn.is_empty():
		var eq_lab := Label.new()
		eq_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
		eq_lab.text = "vs %s" % str(worn.get("name", "equipped"))
		eq_lab.add_theme_font_size_override("font_size", INSPECT_META_FS)
		eq_lab.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(eq_lab)
		_gear_inspect_col.add_child(eq_lab)

	for row in InventoryRules.compare_lines(item, worn):
		var d: int = int(row.get("delta", 0))
		var lab := HBoxContainer.new()
		lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
		lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lab.add_theme_constant_override("separation", 8)
		var stat_key := str(row.get("stat", ""))
		if StatIcon.has(stat_key):
			lab.add_child(StatIcon.make(stat_key, INSPECT_ICON))
		var abbr := Label.new()
		abbr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		abbr.text = stat_key.substr(0, 3).to_upper()
		abbr.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		abbr.add_theme_font_size_override("font_size", INSPECT_ROW_FS)
		abbr.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(abbr)
		lab.add_child(abbr)
		var val := Label.new()
		val.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var nv: int = int(row.get("new", 0))
		val.text = ("+%s" % nv) if nv > 0 else "0"
		val.add_theme_font_size_override("font_size", INSPECT_VAL_FS)
		val.add_theme_color_override(
			"font_color",
			ClientUi.TEXT if nv > 0 else ClientUi.MUTED
		)
		ClientUi.apply_body_font(val)
		lab.add_child(val)
		if InventoryRules.is_equippable(item_type):
			var dlab := Label.new()
			dlab.mouse_filter = Control.MOUSE_FILTER_IGNORE
			dlab.custom_minimum_size.x = 44
			dlab.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			dlab.text = InventoryRules.format_stat_delta(d)
			dlab.add_theme_font_size_override("font_size", INSPECT_DELTA_FS)
			dlab.add_theme_color_override(
				"font_color",
				ClientUi.SUCCESS if d > 0 else (ClientUi.DANGER if d < 0 else ClientUi.MUTED)
			)
			ClientUi.apply_body_font(dlab)
			lab.add_child(dlab)
		_gear_inspect_col.add_child(lab)

	if InventoryRules.is_equippable(item_type):
		var diffs: Dictionary = InventoryRules.compare_gear_attributes(item, worn)
		var total: int = int(diffs.get("total", 0))
		var footer := HBoxContainer.new()
		footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
		footer.add_theme_constant_override("separation", 8)
		var total_lab := Label.new()
		total_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
		total_lab.text = "TOTAL STAT CHANGE:"
		total_lab.add_theme_font_size_override("font_size", INSPECT_META_FS)
		total_lab.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(total_lab)
		footer.add_child(total_lab)
		var total_val := Label.new()
		total_val.mouse_filter = Control.MOUSE_FILTER_IGNORE
		total_val.text = InventoryRules.format_stat_delta(total)
		total_val.add_theme_font_size_override("font_size", INSPECT_ROW_FS)
		total_val.add_theme_color_override(
			"font_color",
			ClientUi.SUCCESS if total > 0 else (ClientUi.DANGER if total < 0 else ClientUi.MUTED)
		)
		ClientUi.apply_display_font(total_val)
		footer.add_child(total_val)
		_gear_inspect_col.add_child(footer)


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
	var price := Label.new()
	price.text = "✦ %s" % cost
	price.add_theme_font_size_override("font_size", price_fs)
	price.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(price)
	price_col.add_child(price)
	if nova > 0:
		var np := Label.new()
		np.text = "💎 %s" % nova
		np.add_theme_font_size_override("font_size", nova_fs)
		np.add_theme_color_override("font_color", Color("#FCD34D"))
		ClientUi.apply_display_font(np)
		price_col.add_child(np)

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
	var sd: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	if not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost):
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
	await _load_bag_items()
	_load_equipped()
	_populate()


func _on_buy_gear(slot_id: String, is_hot: bool, haggle: bool, cost: int, nova: int) -> void:
	if _busy:
		return
	var sd: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	# Client affordability check is UX only — Node recalculates / haggles authoritatively.
	if not haggle and not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost):
		_set_status("Need %s ✦ — you have %s." % [cost, sd])
		return
	if nova > 0 and not CurrencyManager.can_afford(CurrencyManager.CURRENCY_NOVA, nova):
		_set_status("Need %s 💎" % nova)
		return
	_busy = true
	_busy_slot = slot_id
	_set_status("Buying gear…" if not haggle else "Haggling…")
	var res: Dictionary = await ShopManager.buy_gear(slot_id, is_hot, haggle)
	_busy = false
	_busy_slot = ""
	if not res.ok:
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


# ── Sell fence (authoritative DissolveJunk / Void eligibility) ─────────────

func _make_sell_section() -> VBoxContainer:
	_sell_panels.clear()
	_sell_slot_h = SELL_SLOT_MIN_H
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.size_flags_stretch_ratio = 1.0
	col.add_theme_constant_override("separation", SELL_SECTION_SEP)
	_sell_root = col

	var gap := Control.new()
	gap.custom_minimum_size.y = 6
	col.add_child(gap)

	var rule := HSeparator.new()
	rule.modulate = Color(1, 1, 1, 0.22)
	col.add_child(rule)

	var head := Label.new()
	head.text = "SELL ITEMS"
	head.add_theme_font_size_override("font_size", 13)
	head.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.9))
	ClientUi.apply_display_font(head)
	col.add_child(head)

	# Bag source = 2 item-rows tall; staging = 1 matching item row (even if bag is empty/short).
	var available := _sell_available_items()
	if available.is_empty():
		var empty := Label.new()
		empty.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		empty.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		empty.text = "No sellable bag gear — unequipped unlocked items appear here."
		empty.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		empty.add_theme_font_size_override("font_size", 14)
		empty.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(empty)
		col.add_child(empty)
		_sell_source_area = empty
	else:
		var source_scroll := ScrollContainer.new()
		source_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		source_scroll.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		source_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		col.add_child(source_scroll)
		_sell_source_area = source_scroll

		var source_grid := GridContainer.new()
		source_grid.columns = SELL_SLOT_COUNT
		source_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		source_grid.add_theme_constant_override("h_separation", 6)
		source_grid.add_theme_constant_override("v_separation", SELL_GRID_V_SEP)
		source_scroll.add_child(source_grid)
		for it in available:
			source_grid.add_child(_make_sell_bag_slot(it as Dictionary, false))

	var stage_row := HBoxContainer.new()
	stage_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage_row.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	stage_row.add_theme_constant_override("separation", 6)
	col.add_child(stage_row)
	_sell_stage_row = stage_row
	for i in SELL_SLOT_COUNT:
		var staged: Dictionary = _sell_stage[i] if typeof(_sell_stage[i]) == TYPE_DICTIONARY else {}
		stage_row.add_child(_make_sell_bag_slot(staged, true, i))

	_sell_btn = Button.new()
	_sell_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sell_btn.size_flags_vertical = Control.SIZE_SHRINK_END
	_sell_btn.custom_minimum_size.y = 40
	ClientUi.apply_primary_button(_sell_btn)
	_sell_btn.pressed.connect(_on_confirm_sell)
	col.add_child(_sell_btn)
	_refresh_sell_button()

	if not col.resized.is_connected(_on_sell_root_resized):
		col.resized.connect(_on_sell_root_resized)
	call_deferred("_sync_sell_slot_layout")
	return col


func _on_sell_root_resized() -> void:
	_sync_sell_slot_layout()


func _sell_chrome_height() -> float:
	if _sell_root == null or not is_instance_valid(_sell_root):
		return 0.0
	var h := 0.0
	for c in _sell_root.get_children():
		if c == _sell_source_area or c == _sell_stage_row:
			continue
		if c is Control and is_instance_valid(c):
			h += maxf((c as Control).size.y, (c as Control).get_combined_minimum_size().y)
	# One VBox separation between every adjacent pair of children.
	var n := _sell_root.get_child_count()
	if n > 1:
		h += float(SELL_SECTION_SEP * (n - 1))
	return h


func _sync_sell_slot_layout() -> void:
	if _sell_root == null or not is_instance_valid(_sell_root):
		return
	if _sell_stage_row == null or not is_instance_valid(_sell_stage_row):
		return
	var avail := _sell_root.size.y - _sell_chrome_height()
	# 2 source rows + 1 staging row + one in-grid v-sep between the two source rows.
	var slot_h := (avail - float(SELL_GRID_V_SEP)) / float(SELL_SOURCE_ROWS + 1)
	slot_h = maxf(SELL_SLOT_MIN_H, slot_h)
	_sell_slot_h = slot_h

	var source_h := slot_h * float(SELL_SOURCE_ROWS) + float(SELL_GRID_V_SEP)
	if _sell_source_area != null and is_instance_valid(_sell_source_area):
		_sell_source_area.custom_minimum_size.y = source_h
		_sell_source_area.size.y = source_h
	_sell_stage_row.custom_minimum_size.y = slot_h
	_sell_stage_row.size.y = slot_h

	var scale := slot_h / SELL_SLOT_MIN_H
	var title_fs := int(round(clampf(11.0 * scale, 11.0, 22.0)))
	var val_fs := int(round(clampf(12.0 * scale, 12.0, 24.0)))
	var mark_fs := int(round(clampf(18.0 * scale, 18.0, 36.0)))
	var icon_sz := clampf(36.0 * scale, 36.0, 96.0)
	for panel_v in _sell_panels:
		if typeof(panel_v) != TYPE_OBJECT or not is_instance_valid(panel_v):
			continue
		var panel := panel_v as PanelContainer
		panel.custom_minimum_size = Vector2(112, slot_h)
		panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		var title: Variant = panel.get_meta("sell_title", null)
		if title is Label and is_instance_valid(title):
			(title as Label).add_theme_font_size_override("font_size", title_fs)
		var val: Variant = panel.get_meta("sell_val", null)
		if val is Label and is_instance_valid(val):
			(val as Label).add_theme_font_size_override("font_size", val_fs)
		var mark: Variant = panel.get_meta("sell_mark", null)
		if mark is Label and is_instance_valid(mark):
			(mark as Label).add_theme_font_size_override("font_size", mark_fs)
		var icon: Variant = panel.get_meta("sell_icon", null)
		if icon is Control and is_instance_valid(icon):
			(icon as Control).custom_minimum_size = Vector2(icon_sz, icon_sz)
			if icon.has_method("queue_redraw"):
				icon.queue_redraw()


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
		_sell_btn.text = "Sell for 0 Stardust"
	else:
		_sell_btn.text = "Sell for %s Stardust" % total


func _make_sell_bag_slot(item: Dictionary, is_stage: bool, stage_index: int = -1) -> PanelContainer:
	var filled := not item.is_empty()
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	# Min width keeps Grid/HBox columns from collapsing Labels into vertical 1-glyph stacks.
	panel.custom_minimum_size = Vector2(112, _sell_slot_h)
	_sell_panels.append(panel)
	if filled:
		var tint := ClientUi.rarity_color(str(item.get("rarity", "")))
		panel.add_theme_stylebox_override("panel", _sell_slot_style(Color(tint, 0.14), Color(tint, 0.55)))
		panel.tooltip_text = "%s — %s ✦ · click to %s" % [
			str(item.get("name", "Item")),
			InventoryRules.estimate_sell_value(item),
			"remove" if is_stage else "stage for sale",
		]
	else:
		panel.add_theme_stylebox_override(
			"panel",
			_sell_slot_style(Color(0.05, 0.06, 0.09, 0.7), Color(0.3, 0.35, 0.42, 0.35))
		)
		panel.tooltip_text = "Empty sell slot" if is_stage else "Empty"
		panel.modulate.a = 0.55 if is_stage else 1.0

	var root := VBoxContainer.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 2)
	panel.add_child(root)

	if filled:
		var title := Label.new()
		title.mouse_filter = Control.MOUSE_FILTER_IGNORE
		title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		title.autowrap_mode = TextServer.AUTOWRAP_OFF
		title.clip_text = true
		title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		title.text = str(item.get("name", "Item"))
		title.add_theme_font_size_override("font_size", 11)
		title.add_theme_color_override(
			"font_color",
			ClientUi.rarity_color(str(item.get("rarity", ""))).lightened(0.2)
		)
		ClientUi.apply_display_font(title)
		root.add_child(title)
		panel.set_meta("sell_title", title)

		var icon_wrap := CenterContainer.new()
		icon_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		icon_wrap.size_flags_vertical = Control.SIZE_EXPAND_FILL
		root.add_child(icon_wrap)
		var gear := GearIcon.make(item, 36.0)
		icon_wrap.add_child(gear)
		panel.set_meta("sell_icon", gear)

		var val := Label.new()
		val.mouse_filter = Control.MOUSE_FILTER_IGNORE
		val.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		val.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		val.autowrap_mode = TextServer.AUTOWRAP_OFF
		val.clip_text = true
		val.text = "✦ %s" % InventoryRules.estimate_sell_value(item)
		val.add_theme_font_size_override("font_size", 12)
		val.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
		ClientUi.apply_display_font(val)
		root.add_child(val)
		panel.set_meta("sell_val", val)
	else:
		var mark := Label.new()
		mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		mark.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mark.size_flags_vertical = Control.SIZE_EXPAND_FILL
		mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		mark.autowrap_mode = TextServer.AUTOWRAP_OFF
		mark.text = "·"
		mark.add_theme_font_size_override("font_size", 18)
		mark.add_theme_color_override("font_color", ClientUi.MUTED)
		root.add_child(mark)
		panel.set_meta("sell_mark", mark)

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
	sb.content_margin_left = 4
	sb.content_margin_right = 4
	sb.content_margin_top = 3
	sb.content_margin_bottom = 3
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
		_set_status("Sell tray full — remove an item or confirm the sale.")
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
	_set_status("Sold %s item(s) for ✦ %s" % [dissolved_n, gained])
	_populate()
