extends Control
## Black Market — header · Contraband Loot spotlight · unified stalls · sell fence.

const SELL_SLOT_COUNT := 5
## Fixed inventory-cell metrics — never scale with leftover page height.
const SELL_SLOT_H := 104.0
const SELL_SLOT_MIN_W := 108.0
## Glyph on the right of each sell pane (was 40, centered stack).
const SELL_ICON_SZ := 72.0
## Name chrome — matches stall titles. Sale price uses STALL_PRICE_* (buy parity).
const SELL_TITLE_FS := 24
const SELL_SOURCE_ROWS := 2
const SELL_GRID_H_SEP := 8
const SELL_GRID_V_SEP := 8
const SELL_SECTION_SEP := 10
const SELL_BTN_MIN_H := 56.0
const SELL_BTN_MIN_W := 420.0
## Stall card scale (Contraband Loot / Sell left alone). Vertical ~+15%; icons/fonts/chips more.
const STALL_SEP := 6
const STALL_TOP_SEP := 10
## Match sell-pane gear glyph size; title/descriptor sit top-right of the pane.
const STALL_GEAR_ICON := SELL_ICON_SZ
const STALL_BUNDLE_ICON := SELL_ICON_SZ
## Match sell-pane name size; descriptor stays ~75% of title (was 15/20).
const STALL_TITLE_FS := SELL_TITLE_FS
const STALL_SUB_FS := 18
## Gear item-level under rarity · type — smaller than the descriptor.
const STALL_LEVEL_FS := 14
const STALL_BODY_FS := 18
## Stall price chrome — 2× prior icon (16→32), 1.5× prior font (20→30).
const STALL_PRICE_ICON := 32.0
const STALL_PRICE_FS := 30
const STALL_BTN_FS := 17
const STALL_CHIP_ICON := 35.0 ## was 28 × 1.25
const STALL_CHIP_FS := 33 ## was 26 × 1.25
const STALL_CHIP_SEP := 6
const MILLISECONDS_PER_SECOND := 1_000.0
## Contraband spotlight shares stall card metrics; amber wrapper is separate.
## Shop-window countdown chip — 2× prior currency-chip chrome (font 15→30, icon ~16→32).
const REFRESH_TIMER_FS := 30
const REFRESH_TIMER_ICON := 32.0
const REFRESH_TIMER_PAD_H := 16
const REFRESH_TIMER_PAD_V := 8
## Widest countdown the meta chips must reserve (`format_shop_countdown`).
const META_TIMER_WIDTH_SAMPLE := "99h 59m 59s"
## Page brand — matches side-nav Black Market tint + neon sweep.
const MARKET_BRAND_TINT := Color("#9D6BFF")
const MARKET_BRAND_FS := 69 ## was 46 × 1.5
const MARKET_TAGLINE_FS := 19 ## was 15 × 1.25
const SHOP_WINDOW_RESULT_INDEX: int = 0
const SHIPMENT_PREVIEW_FLIGHT_NONE := -1
var _status: Label
var _refresh_timer: Control
var _list: VBoxContainer
var _equipped: Array = []
var _bag_items: Array = []
## Staging only — up to 5 item dicts (empty Dictionary = vacant). Not bag storage.
var _sell_stage: Array = []
var _sell_btn: Button
var _sell_notice: Label
var _shipment_preview: Dictionary = {}
var _shipment_generation := 0
var _shipment_in_flight_generation := SHIPMENT_PREVIEW_FLIGHT_NONE
var _shipment_overflow_blocked := false
var _shipment_error := ""
var _shipment_retry_available := false
var _busy := false
var _booting := false
var _busy_slot := ""
var _tick: Timer
var _win_idx := -1
## Shared hover inspection panel (stall + Contraband Loot).
var _inspect: ItemInspectPopup


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_sell_stage.clear()
	for _i in SELL_SLOT_COUNT:
		_sell_stage.append({})
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	_set_status("Opening Black Market…")
	call_deferred("_start_boot")


func on_shell_reshow() -> void:
	_update_meta()
	if _booting:
		while _booting and is_inside_tree():
			await get_tree().process_frame
		return
	if _busy:
		return
	_set_status("Opening Black Market…")
	await _boot()


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
	var requests := AsyncGroup.new()
	requests.add(ShopManager.ensure_shop)
	requests.add(_load_bag_items)
	requests.add(_load_company_status)
	var results := await requests.wait()
	var res: Dictionary = results[SHOP_WINDOW_RESULT_INDEX]
	if not is_inside_tree() or not is_instance_valid(self):
		_booting = false
		return
	if not res.ok:
		_set_status(str(res.get("error", "EnsureShop failed")))
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


func _load_company_status() -> void:
	if CompanyManager == null:
		return
	await CompanyManager.load_status()


func _invalidate_shipment_preview() -> void:
	_shipment_generation += 1
	_shipment_preview = {}
	_shipment_overflow_blocked = false
	_shipment_error = ""
	_shipment_retry_available = false


func _is_shipment_preview_in_flight() -> bool:
	return _shipment_in_flight_generation != SHIPMENT_PREVIEW_FLIGHT_NONE


func _end_shipment_preview_flight(requested_generation: int) -> void:
	if _shipment_in_flight_generation == requested_generation:
		_shipment_in_flight_generation = SHIPMENT_PREVIEW_FLIGHT_NONE


func _refresh_after_stale_shipment_preview(requested_generation: int) -> void:
	_end_shipment_preview_flight(requested_generation)
	if is_inside_tree():
		_populate()


func _prune_stale_sell_stage() -> void:
	var changed := false
	for i in _sell_stage.size():
		var staged: Variant = _sell_stage[i]
		if typeof(staged) != TYPE_DICTIONARY or staged.is_empty():
			_sell_stage[i] = {}
			continue
		var id := str(staged.get("id", ""))
		var live := InventoryRules.find_by_id(_bag_items, id)
		if live.is_empty() or not InventoryRules.is_sellable(live):
			_sell_stage[i] = {}
			changed = true
		else:
			_sell_stage[i] = live
	if changed:
		_invalidate_shipment_preview()


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

	# Overlay status — never parented into the sell footer (that used to reflow the page).
	_status = ClientUi.make_status()
	_status.visible = false
	_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.clip_text = true
	_status.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	add_child(_status)

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
	if not is_instance_valid(_status):
		return
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
	_refresh_timer = null
	for c in _list.get_children():
		c.queue_free()

	if ShopManager.gear_stock().is_empty():
		_list.add_child(_offline_panel())
		_list.add_child(_make_sell_section())
		_update_meta()
		return

	# Contraband sits at the top of content; timer + restock stack in that same right rail.
	var hot: Dictionary = ShopManager.hot_deal()
	var has_hot := not hot.is_empty()
	if has_hot:
		_list.add_child(_make_hot_banner(hot))
	else:
		_list.add_child(_make_controls_rail_row())
	_list.add_child(_make_market_section())
	_list.add_child(_make_sell_section())
	_update_meta()

	if _status.text.begins_with("Opening"):
		_set_status("")


func _offline_panel() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.size_flags_stretch_ratio = 1.0
	col.add_theme_constant_override("separation", 8)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	col.add_child(top)
	var t_center := CenterContainer.new()
	t_center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t_center.add_child(UiIcon.make_title_row("shopping-bag", "Black Market is offline", ClientUi.TEXT, 21, 24.0))
	top.add_child(t_center)
	top.add_child(_make_timer_restock_stack())
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
	if _refresh_timer == null or not is_instance_valid(_refresh_timer):
		return
	_set_currency_chip_amount(_refresh_timer, GameData.format_shop_countdown(_seconds_left()))
	TutorialManager.tag_target(_refresh_timer, "shop-refresh-timer")


func _make_attached_refresh_timer() -> Control:
	var chip := _make_refresh_timer_chip(GameData.format_shop_countdown(_seconds_left()))
	_refresh_timer = chip
	TutorialManager.tag_target(chip, "shop-refresh-timer")
	return chip


## Timer on top, Restock under it — shared chrome scale + locked width.
func _make_timer_restock_stack() -> VBoxContainer:
	var stack := VBoxContainer.new()
	stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stack.size_flags_horizontal = Control.SIZE_SHRINK_END
	stack.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	stack.add_theme_constant_override("separation", 8)
	var chip_sz := _meta_chip_fixed_size()
	var timer := _make_attached_refresh_timer()
	timer.custom_minimum_size = chip_sz
	timer.size_flags_horizontal = Control.SIZE_SHRINK_END
	stack.add_child(timer)
	var restock := _make_restock_button()
	restock.custom_minimum_size = chip_sz
	restock.size_flags_horizontal = Control.SIZE_SHRINK_END
	stack.add_child(restock)
	return stack


## Right-aligned timer+restock when there is no contraband row to share.
func _make_controls_rail_row() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 12)
	row.add_child(_make_market_brand())
	var right := HBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.alignment = BoxContainer.ALIGNMENT_END
	right.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	right.add_child(_make_timer_restock_stack())
	row.add_child(right)
	return row


## Logo-like Black Market wordmark (nav neon) + quiet tagline — top-left of content.
func _make_market_brand() -> Control:
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	col.add_theme_constant_override("separation", 8)
	var title := NavNeonLabel.new()
	title.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	title.configure("Black Market", MARKET_BRAND_TINT, MARKET_BRAND_FS)
	col.add_child(title)
	# Logo wordmark — don't clip the neon halo; keep always-on sweep (nav is hover/active only).
	title.clip_contents = false
	title.set_neon(true)
	title.call_deferred("set_neon", true)
	var tag := Label.new()
	tag.text = "All items are sourced ethically and legally. For the most part."
	tag.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tag.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tag.add_theme_font_size_override("font_size", MARKET_TAGLINE_FS)
	tag.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.92))
	ClientUi.apply_body_font(tag)
	col.add_child(tag)
	return col


## Widest countdown text width for a stable timer label.
func _meta_countdown_text_width() -> float:
	var font := ClientUi.display_font()
	if font == null:
		return 160.0
	return font.get_string_size(
		META_TIMER_WIDTH_SAMPLE, HORIZONTAL_ALIGNMENT_LEFT, -1, REFRESH_TIMER_FS
	).x


func _meta_chip_fixed_size() -> Vector2:
	var font := ClientUi.display_font()
	var timer_text_w := _meta_countdown_text_width()
	var restock_text := "Restock · %s" % ShopManager.SHOP_REFRESH_COST
	var restock_text_w := 120.0
	if font != null:
		restock_text_w = font.get_string_size(
			restock_text, HORIZONTAL_ALIGNMENT_LEFT, -1, REFRESH_TIMER_FS
		).x
	var timer_inner := REFRESH_TIMER_ICON + 10.0 + timer_text_w
	var restock_inner := restock_text_w + 10.0 + REFRESH_TIMER_ICON
	var inner_w := maxf(timer_inner, restock_inner)
	var inner_h := maxf(REFRESH_TIMER_ICON, float(REFRESH_TIMER_FS) * 1.15)
	return Vector2(
		ceili(inner_w + float(REFRESH_TIMER_PAD_H) * 2.0),
		ceili(inner_h + float(REFRESH_TIMER_PAD_V) * 2.0)
	)


func _make_refresh_timer_chip(countdown: String) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	chip.custom_minimum_size = _meta_chip_fixed_size()
	chip.add_theme_stylebox_override("panel", _market_meta_chip_style(Color(ClientUi.CYAN, 0.55)))
	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", REFRESH_TIMER_PAD_H)
	pad.add_theme_constant_override("margin_right", REFRESH_TIMER_PAD_H)
	pad.add_theme_constant_override("margin_top", REFRESH_TIMER_PAD_V)
	pad.add_theme_constant_override("margin_bottom", REFRESH_TIMER_PAD_V)
	chip.add_child(pad)
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 10)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	pad.add_child(row)
	# Lucide `timer` is the closest stopwatch match in our icon set.
	row.add_child(UiIcon.make("timer", ClientUi.CYAN, REFRESH_TIMER_ICON))
	var amount := Label.new()
	amount.text = countdown
	amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	amount.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	# Lock label width to the widest countdown so digit changes don't reflow the chip.
	amount.custom_minimum_size.x = ceili(_meta_countdown_text_width())
	amount.add_theme_font_size_override("font_size", REFRESH_TIMER_FS)
	amount.add_theme_color_override("font_color", ClientUi.CYAN.lightened(0.18))
	ClientUi.apply_display_font(amount)
	row.add_child(amount)
	return chip


## Shared dark fill + outline chrome for timer / restock meta chips.
func _market_meta_chip_style(border: Color) -> StyleBoxFlat:
	return ClientUi.painted_panel_style(
		Color(0.04, 0.055, 0.09, 0.95), border, 8, 1
	)


func _make_restock_button() -> Button:
	var accent := Color("#FFD700")
	var restock := Button.new()
	restock.text = ""
	restock.icon = null
	# Content is drawn via child controls — don't clip them to the empty-text min size.
	restock.clip_contents = false
	restock.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	restock.custom_minimum_size = _meta_chip_fixed_size()
	_apply_restock_btn(restock, accent)
	var restock_pad := MarginContainer.new()
	restock_pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_pad.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	restock_pad.add_theme_constant_override("margin_left", REFRESH_TIMER_PAD_H)
	restock_pad.add_theme_constant_override("margin_right", REFRESH_TIMER_PAD_H)
	restock_pad.add_theme_constant_override("margin_top", REFRESH_TIMER_PAD_V)
	restock_pad.add_theme_constant_override("margin_bottom", REFRESH_TIMER_PAD_V)
	restock.add_child(restock_pad)
	var restock_row := HBoxContainer.new()
	restock_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	restock_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	restock_row.alignment = BoxContainer.ALIGNMENT_CENTER
	restock_row.add_theme_constant_override("separation", 10)
	restock_pad.add_child(restock_row)
	var restock_lab := Label.new()
	var free_restock := bool(ShopManager.refresh_info.get("free_available", false))
	restock_lab.text = "Free" if free_restock else "Restock"
	restock_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	restock_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	restock_lab.add_theme_font_size_override("font_size", REFRESH_TIMER_FS)
	restock_lab.add_theme_color_override("font_color", Color.WHITE)
	ClientUi.apply_display_font(restock_lab)
	restock_row.add_child(restock_lab)
	var restock_cluster := HBoxContainer.new()
	restock_cluster.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_cluster.alignment = BoxContainer.ALIGNMENT_CENTER
	restock_cluster.add_theme_constant_override("separation", 2)
	if not free_restock:
		restock_row.add_child(restock_cluster)
	var restock_nova := CurrencyIcon.make("nova", REFRESH_TIMER_ICON)
	restock_nova.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_cluster.add_child(restock_nova)
	var restock_amt := Label.new()
	restock_amt.text = NumberDisplay.nova(ShopManager.SHOP_REFRESH_COST)
	restock_amt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	restock_amt.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	restock_amt.add_theme_font_size_override("font_size", REFRESH_TIMER_FS)
	restock_amt.add_theme_color_override("font_color", accent)
	ClientUi.apply_display_font(restock_amt)
	restock_cluster.add_child(restock_amt)
	restock.pressed.connect(func() -> void: _on_refresh("all"))
	TutorialManager.tag_target(restock, "shop-restock")
	if TutorialManager.blocks_black_market_commerce():
		restock.disabled = true
		restock.focus_mode = Control.FOCUS_NONE
		restock.mouse_default_cursor_shape = Control.CURSOR_ARROW
		restock.tooltip_text = "Finish or skip the tutorial before restocking"
	return restock


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
		var now_ms := int(Time.get_unix_time_from_system() * MILLISECONDS_PER_SECOND)
		return maxi(
			0,
			int((int(win.get("endsAt", 0)) - now_ms) / MILLISECONDS_PER_SECOND),
		)
	return int(win.get("secondsLeft", 0))


# ─── Contraband spotlight ───────────────────────────────────────────────────

func _make_hot_banner(item: Dictionary) -> Control:
	var rarity := str(item.get("rarity", "common"))
	var tint := ClientUi.rarity_color(rarity)
	var hot_eta := "soon"
	if not ShopManager.contraband_window.is_empty():
		hot_eta = ArenaRules.format_eta_short(int(ShopManager.contraband_window.get("secondsLeft", 0)) * MILLISECONDS_PER_SECOND)
	elif not ShopManager.shop_window.is_empty():
		hot_eta = ArenaRules.format_eta_short(int(ShopManager.shop_window.get("secondsLeft", 0)) * MILLISECONDS_PER_SECOND)
	## Match painted-panel bottom inset so L/R hug the card the same as the bottom gap.
	var edge := ClientUi.px(11)

	# Full-width row: brand left · contraband center · timer/restock right.
	var outer := HBoxContainer.new()
	outer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_theme_constant_override("separation", 12)
	outer.add_child(_make_market_brand())

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var sb: StyleBoxFlat = ClientUi.painted_panel_style(
		Color(0.14, 0.07, 0.04, 0.97), Color("#FB923C", 0.7), 14, 2
	).duplicate()
	sb.content_margin_left = edge
	sb.content_margin_right = edge
	sb.content_margin_top = edge
	sb.content_margin_bottom = edge
	panel.add_theme_stylebox_override("panel", sb)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

	var badge_row := HBoxContainer.new()
	badge_row.alignment = BoxContainer.ALIGNMENT_CENTER
	badge_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	badge_row.add_theme_constant_override("separation", 6)
	col.add_child(badge_row)
	badge_row.add_child(UiIcon.make("flame", Color("#FED7AA"), 18.0))
	var badge := Label.new()
	badge.text = "CONTRABAND LOOT · resets %s" % hot_eta
	badge.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge.clip_text = true
	badge.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	badge.add_theme_font_size_override("font_size", 15)
	badge.add_theme_color_override("font_color", Color("#FED7AA"))
	ClientUi.apply_display_font(badge)
	badge_row.add_child(badge)

	var card := _make_gear_card(item, true, tint)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_child(card)
	outer.add_child(panel)

	var right_host := HBoxContainer.new()
	right_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	right_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_host.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	right_host.alignment = BoxContainer.ALIGNMENT_END
	right_host.add_child(_make_timer_restock_stack())
	outer.add_child(right_host)

	# Stall-width card (~1/4 of shop content); amber shrink-wraps to the card + equal edge.
	var sync_width := func() -> void:
		var w := outer.size.x
		if w < 64.0:
			return
		card.custom_minimum_size.x = maxf(160.0, (w - 24.0) / 4.0)
	outer.resized.connect(sync_width)
	outer.ready.connect(func() -> void: sync_width.call_deferred())

	return outer


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
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

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
				if str(item.get("_bundle", "")) == "stim_trio":
					continue
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
				if str(item.get("_bundle", "")) == "stim_trio":
					continue
				var sid := str(item.get("_slotId", "")).strip_edges()
				var tag_stim := not locked_stim.is_empty() and sid == locked_stim
				grid.add_child(_make_cons_card(item, tag_stim))
			else:
				var rarity := str(item.get("rarity", "common"))
				grid.add_child(_make_gear_card(item, false, ClientUi.rarity_color(rarity)))
	return panel


func _apply_restock_btn(btn: Button, accent: Color) -> void:
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", REFRESH_TIMER_FS)
	# Dark fill + yellow/crystal outline (hover / press brighten border only).
	var idle := _market_meta_chip_style(Color(accent, 0.65))
	var hover := _market_meta_chip_style(Color(accent, 0.9))
	var pressed := _market_meta_chip_style(accent)
	var disabled := _market_meta_chip_style(Color(accent, 0.3))
	for sb: StyleBoxFlat in [idle, hover, pressed, disabled]:
		sb.content_margin_left = 0
		sb.content_margin_right = 0
		sb.content_margin_top = 0
		sb.content_margin_bottom = 0
	btn.add_theme_stylebox_override("normal", idle)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("focus", hover)
	btn.add_theme_stylebox_override("disabled", disabled)
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

## Glyph left (sell-pane size); name + descriptor hug the top-right.
## Optional `level_text` sits in smaller type under rarity · type.
func _make_stall_title_row(
	glyph: Control,
	title_text: String,
	sub_text: String,
	title_color: Color,
	level_text: String = ""
) -> HBoxContainer:
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", STALL_TOP_SEP)
	top.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.alignment = BoxContainer.ALIGNMENT_BEGIN
	glyph.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	glyph.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	top.add_child(glyph)

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_col.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	title_col.add_theme_constant_override("separation", 2)
	top.add_child(title_col)

	var title := Label.new()
	title.text = title_text
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	title.autowrap_mode = TextServer.AUTOWRAP_OFF
	title.clip_text = true
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	title.add_theme_font_size_override("font_size", STALL_TITLE_FS)
	title.add_theme_color_override("font_color", title_color)
	ClientUi.apply_display_font(title)
	title_col.add_child(title)

	var sub := Label.new()
	sub.text = sub_text
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	sub.autowrap_mode = TextServer.AUTOWRAP_OFF
	sub.clip_text = true
	sub.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	sub.add_theme_font_size_override("font_size", STALL_SUB_FS)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	title_col.add_child(sub)

	if not level_text.is_empty():
		var level_lab := Label.new()
		level_lab.text = level_text
		level_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		level_lab.autowrap_mode = TextServer.AUTOWRAP_OFF
		level_lab.clip_text = true
		level_lab.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		level_lab.add_theme_font_size_override("font_size", STALL_LEVEL_FS)
		level_lab.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(level_lab)
		title_col.add_child(level_lab)
	return top


func _gear_level_label(item: Dictionary) -> String:
	return "Level %s" % ClientUi.format_level(item.get("level", item.get("level_requirement", 1)))


func _make_cons_card(item: Dictionary, tutorial_stim := false) -> PanelContainer:
	var slot_id := str(item.get("_slotId", ""))
	var cost := ShopManager.slot_cost_sd(item)
	if cost <= 0:
		cost = int(item.get("sell_value", 250))
	var rarity := str(item.get("rarity", "common"))
	var cons: Variant = item.get("consumable", {})
	var stat := "strength"
	if typeof(cons) == TYPE_DICTIONARY:
		stat = str(cons.get("stat", "strength")).strip_edges().to_lower()
	var rarity_tint := ClientUi.rarity_color(rarity)
	var yanked := ShopManager.is_slot_yanked(slot_id)
	var owned := ShopManager.is_slot_purchased(slot_id) or yanked

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
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
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", STALL_SEP)
	panel.add_child(col)

	var glyph := GearIcon.make(item, STALL_GEAR_ICON)
	glyph.custom_minimum_size = Vector2(STALL_GEAR_ICON, STALL_GEAR_ICON)
	col.add_child(_make_stall_title_row(
		glyph,
		str(item.get("name", "?")),
		"%s · Stim" % rarity.capitalize(),
		rarity_tint
	))

	# Face: attribute glyph + % only. Duration lives on hover inspect.
	if typeof(cons) == TYPE_DICTIONARY and StatIcon.has(stat):
		var pct := int(InventoryRules.stim_effect(item).get("percent", 0))
		if pct > 0:
			col.add_child(_make_gear_attr_band([{"k": stat, "v": pct, "pct": true}], true))
		var captured := item.duplicate(true)
		panel.mouse_entered.connect(func() -> void:
			_show_gear_inspect(panel, captured)
		)
		panel.mouse_exited.connect(_hide_gear_inspect)
	else:
		var detail2 := Label.new()
		detail2.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		detail2.text = str(item.get("flavor_text", "Stim"))
		detail2.add_theme_color_override("font_color", ClientUi.MUTED)
		detail2.add_theme_font_size_override("font_size", STALL_BODY_FS)
		ClientUi.apply_body_font(detail2)
		col.add_child(detail2)

	if owned:
		var gone := Label.new()
		gone.text = "YANKED" if yanked else "SOLD"
		gone.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		gone.add_theme_font_size_override("font_size", STALL_BODY_FS)
		gone.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(gone)
		col.add_child(gone)
	else:
		var foot_spacer := Control.new()
		foot_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
		foot_spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(foot_spacer)
		var foot := HBoxContainer.new()
		foot.add_theme_constant_override("separation", 8)
		foot.size_flags_vertical = Control.SIZE_SHRINK_END
		col.add_child(foot)
		var price := CurrencyIcon.make_stardust_amount_row(cost, STALL_PRICE_ICON, STALL_PRICE_FS)
		price.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		price.size_flags_vertical = Control.SIZE_SHRINK_END
		foot.add_child(price)
		var foot_mid := Control.new()
		foot_mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		foot_mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
		foot.add_child(foot_mid)
		var buy := Button.new()
		buy.text = "Buy"
		ClientUi.apply_primary_button(buy)
		buy.add_theme_font_size_override("font_size", STALL_BTN_FS)
		var capt_cost := cost
		buy.pressed.connect(func() -> void: _on_buy_cons(slot_id, capt_cost))
		if TutorialManager.blocks_black_market_commerce():
			_lock_commerce_button(buy, "Finish or skip the tutorial before buying")
		foot.add_child(buy)
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

	# Contraband Loot uses the same pane chrome as every other Buy stall.
	var item_type := str(item.get("type", ""))
	var rarity := str(item.get("rarity", ""))
	var body_fs := STALL_BODY_FS
	var sep := STALL_SEP

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if not is_hot:
		panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	TutorialManager.tag_target(panel, "shop-item")
	var panel_sb: StyleBoxFlat = ClientUi.painted_panel_style(
		Color(0.05, 0.05, 0.08, 0.96), Color(tint, 0.45), 10, 1
	).duplicate()
	panel_sb.content_margin_top = int(round(float(panel_sb.content_margin_top) * 1.15))
	panel_sb.content_margin_bottom = int(round(float(panel_sb.content_margin_bottom) * 1.15))
	panel.add_theme_stylebox_override("panel", panel_sb)
	if owned:
		panel.modulate = Color(1, 1, 1, 0.72)

	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", sep)
	panel.add_child(col)

	var glyph: Control
	if is_bundle:
		glyph = UiIcon.make("package", tint, STALL_BUNDLE_ICON)
		glyph.custom_minimum_size = Vector2(STALL_BUNDLE_ICON, STALL_BUNDLE_ICON)
	else:
		glyph = GearIcon.make(item, STALL_GEAR_ICON)
		glyph.custom_minimum_size = Vector2(STALL_GEAR_ICON, STALL_GEAR_ICON)
	var sub_text := "Bundle · 2 Commons" if is_bundle else "%s · %s" % [
		rarity.capitalize(),
		GameData.gear_type_label(item_type),
	]
	var level_text := "" if is_bundle else _gear_level_label(item)
	col.add_child(_make_stall_title_row(glyph, str(item.get("name", "?")), sub_text, tint, level_text))

	if is_bundle:
		var flavor := Label.new()
		flavor.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		flavor.text = str(item.get("flavor_text", "Crate"))
		flavor.add_theme_font_size_override("font_size", STALL_SUB_FS)
		flavor.add_theme_color_override("font_color", ClientUi.MUTED)
		col.add_child(flavor)
	else:
		# Base attributes only (backpack chip style) — comparison lives in hover popup.
		var stats_raw: Variant = item.get("stats", {})
		if typeof(stats_raw) == TYPE_DICTIONARY:
			var entries := _gear_attr_entries(stats_raw as Dictionary)
			if not entries.is_empty():
				col.add_child(_make_gear_attr_band(entries, true))
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
		var foot_spacer := Control.new()
		foot_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
		foot_spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(foot_spacer)
		col.add_child(_gear_actions(item, is_hot, is_bundle, cost, nova, slot_id))
	return panel


func _gear_attr_entries(stats_raw: Dictionary) -> Array:
	return InventoryRules.positive_stat_entries(stats_raw)


func _make_gear_attr_band(entries: Array, stall: bool = false) -> Control:
	# Stall cards always use a single attribute row (including legendaries).
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
		var label := "+%s%%" % v if bool(e.get("pct", false)) else str(v)
		row.add_child(StatIcon.make_labeled(
			k,
			label,
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
	_inspect.present_hover(anchor, item, worn, {
		"show_sell_value": false,
		"actions": [],
		"instant_dismiss": true,
	})

func _gear_actions(
	item: Dictionary,
	is_hot: bool,
	is_bundle: bool,
	cost: int,
	nova: float,
	slot_id: String
) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	row.size_flags_vertical = Control.SIZE_SHRINK_END
	# Stardust (and optional Nova) hug the bottom-left; buy/haggle stay right.
	var price_col := VBoxContainer.new()
	price_col.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	price_col.size_flags_vertical = Control.SIZE_SHRINK_END
	price_col.add_theme_constant_override("separation", 2)
	row.add_child(price_col)
	var price_icon := STALL_PRICE_ICON
	var price_fs := STALL_PRICE_FS
	var nova_icon := 28.0
	var nova_fs := int(round(float(STALL_BODY_FS) * 1.5))
	var btn_fs := STALL_BTN_FS
	var discount_pct := int(item.get("haggle_discount_pct", 0))
	var sd_wrap := HBoxContainer.new()
	sd_wrap.add_theme_constant_override("separation", 4)
	sd_wrap.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	sd_wrap.add_child(CurrencyIcon.make_stardust_amount_row(cost, price_icon, price_fs))
	if discount_pct > 0:
		var disc := Label.new()
		disc.text = "(-%s%%)" % discount_pct
		disc.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		disc.add_theme_font_size_override("font_size", maxi(11, int(round(float(price_fs) * 0.55))))
		disc.add_theme_color_override("font_color", Color("#86EFAC"))
		ClientUi.apply_display_font(disc)
		sd_wrap.add_child(disc)
	price_col.add_child(sd_wrap)
	if nova > 0:
		price_col.add_child(CurrencyIcon.make_amount_row(
			nova, nova_icon, CurrencyIcon.NOVA_GOLD, nova_fs
		))

	var mid := Control.new()
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(mid)

	var can_haggle := not is_bundle and not is_hot and discount_pct <= 0
	if item.has("haggle_eligible"):
		can_haggle = can_haggle and bool(item.get("haggle_eligible", false))
	if bool(item.get("haggle_attempted", false)) or bool(item.get("yanked", false)):
		can_haggle = false
	if can_haggle:
		var hag := Button.new()
		hag.text = "Haggle"
		_apply_haggle_btn(hag)
		hag.add_theme_font_size_override("font_size", STALL_SUB_FS)
		hag.pressed.connect(func() -> void: _on_buy_gear(slot_id, is_hot, true, cost, nova))
		if TutorialManager.blocks_black_market_commerce():
			_lock_commerce_button(hag, "Finish or skip the tutorial before buying")
		row.add_child(hag)

	var buy := Button.new()
	buy.text = "Open" if is_bundle else "Buy"
	ClientUi.apply_primary_button(buy)
	buy.add_theme_font_size_override("font_size", btn_fs)
	buy.pressed.connect(func() -> void: _on_buy_gear(slot_id, is_hot, false, cost, nova))
	if TutorialManager.blocks_black_market_commerce():
		_lock_commerce_button(buy, "Finish or skip the tutorial before buying")
	row.add_child(buy)
	return row


func _lock_commerce_button(btn: Button, tip: String) -> void:
	btn.disabled = true
	btn.focus_mode = Control.FOCUS_NONE
	btn.mouse_default_cursor_shape = Control.CURSOR_ARROW
	btn.tooltip_text = tip


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
	if TutorialManager.blocks_black_market_commerce():
		Notify.blocked("Finish or skip the tutorial before restocking the Black Market")
		return
	var free_restock := bool(ShopManager.refresh_info.get("free_available", false))
	if not free_restock and not CurrencyManager.can_afford(CurrencyManager.CURRENCY_NOVA, ShopManager.SHOP_REFRESH_COST):
		Notify.blocked("Not enough Nova Crystals", "Need %s Nova to refresh (you have %s)" % [
			NumberDisplay.nova(ShopManager.SHOP_REFRESH_COST),
			CurrencyManager.format_balance(CurrencyManager.CURRENCY_NOVA),
		])
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
	if free_restock:
		_set_status("Black Market restocked (free restock).")
	else:
		_set_status("Black Market restocked (−%s Nova Crystals)." % NumberDisplay.nova(ShopManager.SHOP_REFRESH_COST))
	_populate()


func _on_buy_cons(slot_id: String, cost: int) -> void:
	if _busy:
		return
	if TutorialManager.blocks_black_market_commerce():
		Notify.blocked("Finish or skip the tutorial before buying from the Black Market")
		return
	var sd: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	if not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost):
		Notify.blocked("Not enough Stardust", "Need %s — you have %s" % [
			NumberDisplay.quantity_exact(cost),
			NumberDisplay.quantity_exact(sd),
		])
		return
	if not await InventoryManager.ensure_space(self, "Free a backpack slot before buying."):
		return
	_busy = true
	_busy_slot = slot_id
	_set_status("Buying stim…")
	var res: Dictionary = await ShopManager.buy_consumable(slot_id)
	_busy = false
	_busy_slot = ""
	if not res.ok:
		if InventoryManager.is_inventory_full_error(res):
			await InventoryManager.prompt_bag_pressure(self, "Free a backpack slot before buying.")
		if not Notify.from_result(res):
			_set_status(_err(res))
		_update_meta()
		return
	_set_status(_purchase_msg(ShopManager.last_purchase, "Purchased!"))
	await _load_bag_items()
	_load_equipped()
	_populate()


func _on_buy_gear(slot_id: String, is_hot: bool, haggle: bool, cost: int, nova: float) -> void:
	if _busy:
		return
	if TutorialManager.blocks_black_market_commerce():
		Notify.blocked("Finish or skip the tutorial before buying from the Black Market")
		return
	var sd: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	# Client affordability check is UX only — Node recalculates / haggles authoritatively.
	if not haggle and not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost):
		Notify.blocked("Not enough Stardust", "Need %s — you have %s" % [
			NumberDisplay.quantity_exact(cost),
			NumberDisplay.quantity_exact(sd),
		])
		return
	if not haggle and nova > 0.0 and not CurrencyManager.can_afford(CurrencyManager.CURRENCY_NOVA, nova):
		Notify.blocked("Not enough Nova Crystals", "Need %s Nova (you have %s)" % [
			NumberDisplay.nova(nova),
			NumberDisplay.nova(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA)),
		])
		return
	if not haggle and not await InventoryManager.ensure_space(self, "Free a backpack slot before buying."):
		return
	_busy = true
	_busy_slot = slot_id
	_set_status("Buying gear…" if not haggle else "Haggling…")
	var res: Dictionary = await ShopManager.buy_gear(slot_id, is_hot, haggle)
	_busy = false
	_busy_slot = ""
	if not res.ok:
		if InventoryManager.is_inventory_full_error(res):
			await InventoryManager.prompt_bag_pressure(self, "Free a backpack slot before buying.")
		if not Notify.from_result(res):
			_set_status(_err(res))
		_update_meta()
		return
	var purchase: Dictionary = ShopManager.last_purchase
	if bool(purchase.get("haggle_failed", false)):
		_set_status(str(purchase.get("haggle_note", "They yanked the listing")))
		_populate()
		return
	if bool(purchase.get("haggle_success", false)):
		var note := str(purchase.get("haggle_note", "They blinked"))
		var pct := int(purchase.get("haggle_discount_pct", 0))
		var new_sd := NumberDisplay.quantity(int(purchase.get("cost", 0)))
		var new_nova := float(purchase.get("nova_cost", 0.0))
		if pct > 0 and new_nova > 0.0:
			_set_status("%s · new price %s Stardust / %s Nova (-%s%%)" % [
				note, new_sd, NumberDisplay.nova(new_nova), pct,
			])
		elif pct > 0:
			_set_status("%s · new price %s Stardust (-%s%%)" % [note, new_sd, pct])
		elif new_nova > 0.0:
			_set_status("%s · new price %s Stardust / %s Nova" % [note, new_sd, NumberDisplay.nova(new_nova)])
		else:
			_set_status("%s · new price %s Stardust" % [note, new_sd])
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
	var nova_cost := float(purchase.get("nova_cost", 0))
	var parts: PackedStringArray = [fallback]
	if cost > 0:
		parts.append("−%s Stardust" % NumberDisplay.quantity(cost))
	if nova_cost > 0:
		parts.append("−%s Nova" % NumberDisplay.nova(nova_cost))
	if typeof(pending) == TYPE_ARRAY and (pending as Array).size() > 0:
		parts.append("held as pending loot")
	elif typeof(items) == TYPE_ARRAY and (items as Array).size() > 0:
		parts.append("added to inventory")
	return " · ".join(parts)


func _err(res: Dictionary) -> String:
	var err := str(res.get("error", "Purchase failed"))
	if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
		err = str(res.data["error"])
	return err


# ── Sell fence (Black Market buyback) ─────────────

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
	head.text = "Sell Items - Send Shipments"
	head.add_theme_font_size_override("font_size", 15)
	head.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(head)
	col.add_child(head)

	var bag_hint := Label.new()
	bag_hint.text = "Backpack - Add 5 items from the same manufacturer to send a return shipment and earn reputation with that company"
	bag_hint.add_theme_font_size_override("font_size", 17)
	bag_hint.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.9))
	ClientUi.apply_body_font(bag_hint)
	bag_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
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
		bag_hint.text = "Backpack - unequipped items appear here"

	var tray_hint := Label.new()
	tray_hint.text = "Shipping dock - Sell up to 5 items at once"
	tray_hint.add_theme_font_size_override("font_size", 17)
	tray_hint.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.9))
	ClientUi.apply_body_font(tray_hint)
	col.add_child(tray_hint)

	var stage_grid := _make_sell_grid()
	stage_grid.custom_minimum_size.y = SELL_SLOT_H
	col.add_child(stage_grid)
	var display_by_id := _shipment_row_display_values()
	for i in SELL_SLOT_COUNT:
		var staged: Dictionary = _sell_stage[i] if typeof(_sell_stage[i]) == TYPE_DICTIONARY else {}
		var display_value := -1
		if not staged.is_empty():
			display_value = int(display_by_id.get(str(staged.get("id", "")), -1))
		stage_grid.add_child(_make_sell_bag_slot(staged, true, i, display_value))

	_sell_notice = Label.new()
	_sell_notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_sell_notice.add_theme_font_size_override("font_size", 16)
	ClientUi.apply_body_font(_sell_notice)
	col.add_child(_sell_notice)

	var footer := HBoxContainer.new()
	footer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	footer.add_theme_constant_override("separation", 12)
	col.add_child(footer)

	# Left rail keeps equal expand space (even when status is hidden) so SELL stays centered.
	var left := HBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	left.alignment = BoxContainer.ALIGNMENT_BEGIN
	footer.add_child(left)

	_sell_btn = Button.new()
	_sell_btn.custom_minimum_size = Vector2(SELL_BTN_MIN_W, SELL_BTN_MIN_H)
	_sell_btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_sell_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_sell_btn.clip_contents = false
	_sell_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_apply_sell_action_button(_sell_btn)
	_build_sell_btn_content(_sell_btn)
	_sell_btn.pressed.connect(_on_confirm_sell)
	footer.add_child(_sell_btn)

	var trail := Control.new()
	trail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	trail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(trail)

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
	## Dark fill + cyan outline; label/value colors live on child content.
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 18)
	btn.text = ""
	btn.icon = null
	var border := ClientUi.CYAN
	var normal := _sell_btn_style(Color(border, 0.7), 0.35)
	var hover := _sell_btn_style(Color(border, 0.95), 0.55)
	var pressed := _sell_btn_style(border, 0.25)
	var disabled := _sell_btn_style(Color(border, 0.28), 0.0)
	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("focus", hover)
	btn.add_theme_stylebox_override("disabled", disabled)
	btn.add_theme_color_override("font_color", border)
	btn.add_theme_color_override("font_hover_color", border)
	btn.add_theme_color_override("font_pressed_color", border)
	btn.add_theme_color_override("font_disabled_color", Color(border, 0.45))
	btn.set_meta("ui_sfx_kind", "confirm")
	ClientUi.apply_interaction_motion(btn, 1.03)


func _sell_btn_style(border: Color, glow: float) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.04, 0.055, 0.09, 0.95)
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
	s.shadow_color = Color(border.r, border.g, border.b, clampf(glow, 0.0, 1.0) * 0.45)
	s.shadow_size = 10 if glow > 0.01 else 0
	s.shadow_offset = Vector2(0, 3)
	return s


func _build_sell_btn_content(btn: Button) -> void:
	var pad := MarginContainer.new()
	pad.name = "ContentPad"
	pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pad.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pad.add_theme_constant_override("margin_left", 8)
	pad.add_theme_constant_override("margin_right", 8)
	btn.add_child(pad)
	var row := HBoxContainer.new()
	row.name = "Row"
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 6)
	pad.add_child(row)


func _sell_btn_content_row() -> HBoxContainer:
	if _sell_btn == null or not is_instance_valid(_sell_btn):
		return null
	return _sell_btn.get_node_or_null("ContentPad/Row") as HBoxContainer


func _clear_sell_btn_row(row: HBoxContainer) -> void:
	while row.get_child_count() > 0:
		var child := row.get_child(0)
		row.remove_child(child)
		child.free()


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


func _sell_dock_classification() -> Dictionary:
	return CompanyRules.classify_shipment_dock(_sell_stage)


func _shipment_preview_matches_dock() -> bool:
	if _shipment_preview.is_empty():
		return false
	var ids := _sell_staged_ids()
	var preview_items: Variant = _shipment_preview.get("items", [])
	if typeof(preview_items) != TYPE_ARRAY or (preview_items as Array).size() != ids.size():
		return false
	var preview_ids: Dictionary = {}
	for raw in preview_items:
		if typeof(raw) == TYPE_DICTIONARY:
			preview_ids[str((raw as Dictionary).get("id", ""))] = true
	for iid in ids:
		if not preview_ids.has(str(iid)):
			return false
	return str(_shipment_preview.get("company_id", "")) == str(_sell_dock_classification().get("company_id", ""))


func _shipment_row_display_values() -> Dictionary:
	var out := {}
	if not _shipment_preview_matches_dock():
		return out
	var payout := int(_shipment_preview.get("payout", 0))
	var bonus := int(_shipment_preview.get("bonus", 0))
	var base_value := int(_shipment_preview.get("base_value", 0))
	var sell_values: Array = []
	var ids: Array = []
	for slot in _sell_stage:
		if typeof(slot) != TYPE_DICTIONARY or slot.is_empty():
			continue
		var item: Dictionary = slot
		ids.append(str(item.get("id", "")))
		sell_values.append(maxi(0, int(item.get("sell_value", 0))))
	var allocated: Array[int] = CompanyRules.allocate_shipment_display_values(sell_values, payout, bonus, base_value)
	for i in range(mini(ids.size(), allocated.size())):
		out[str(ids[i])] = allocated[i]
	return out


func _set_sell_notice(text: String, color: Color) -> void:
	if _sell_notice == null or not is_instance_valid(_sell_notice):
		return
	_sell_notice.text = text
	_sell_notice.visible = not text.is_empty()
	_sell_notice.add_theme_color_override("font_color", color)


func _refresh_sell_notice(classification: Dictionary) -> void:
	var mode := str(classification.get("mode", CompanyRules.SHIPMENT_DOCK_MODE_SALE))
	if mode == CompanyRules.SHIPMENT_DOCK_MODE_SAME_COMPANY_INELIGIBLE:
		_set_sell_notice(
			"This selection does not qualify as a return shipment and will be sold as a normal sale. Market, Contraband, and other ineligible Gear cannot earn company reputation.",
			ClientUi.WARNING
		)
		return
	if mode != CompanyRules.SHIPMENT_DOCK_MODE_SHIPMENT:
		_set_sell_notice("", ClientUi.MUTED)
		return
	var company_id := str(classification.get("company_id", ""))
	if _shipment_overflow_blocked or CompanyManager.overflow_pending(company_id):
		_set_sell_notice(
			"%s already has an unresolved token choice. Deliver is blocked until you resolve it in Corporate Offices. This crate will not be sold as a normal sale." % CompanyRules.display_name(company_id),
			ClientUi.WARNING
		)
		return
	if not _shipment_error.is_empty():
		_set_sell_notice(_shipment_error, ClientUi.DANGER)
		return
	if not _shipment_preview_matches_dock():
		_set_sell_notice("Checking return shipment with the company…", ClientUi.MUTED)
		return
	var bonus := int(_shipment_preview.get("bonus", 0))
	_set_sell_notice(
		"Return shipment to %s. +%s%% bonus (%s Stardust) and +%s reputation." % [
			CompanyRules.display_name(company_id),
			CompanyRules.SHIPMENT_BONUS_PERCENT,
			_format_sell_amount(bonus),
			CompanyRules.SHIPMENT_REPUTATION_REWARD,
		],
		ClientUi.SUCCESS
	)


func _refresh_sell_button() -> void:
	if _sell_btn == null or not is_instance_valid(_sell_btn):
		return
	var ids := _sell_staged_ids()
	var classification := _sell_dock_classification()
	var mode := str(classification.get("mode", CompanyRules.SHIPMENT_DOCK_MODE_SALE))
	var shipment_mode := mode == CompanyRules.SHIPMENT_DOCK_MODE_SHIPMENT
	var overflow := shipment_mode and (
		_shipment_overflow_blocked
		or CompanyManager.overflow_pending(str(classification.get("company_id", "")))
	)
	var retry_available := shipment_mode and _shipment_retry_available and not overflow
	var preview_ready := shipment_mode and _shipment_preview_matches_dock() and not overflow and _shipment_error.is_empty()
	var total := int(_shipment_preview.get("payout", 0)) if preview_ready else _sell_preview_total()
	var can_act := not ids.is_empty() and not _busy
	if shipment_mode:
		if retry_available:
			can_act = can_act and not _is_shipment_preview_in_flight()
		else:
			can_act = can_act and preview_ready and not overflow
	_sell_btn.disabled = not can_act
	_sell_btn.text = ""
	_sell_btn.icon = null
	var row := _sell_btn_content_row()
	if row == null:
		_build_sell_btn_content(_sell_btn)
		row = _sell_btn_content_row()
	if row == null:
		return
	_clear_sell_btn_row(row)
	var blue := ClientUi.CYAN
	var muted_blue := Color(blue, 0.45) if _sell_btn.disabled else blue
	var prefix := Label.new()
	prefix.mouse_filter = Control.MOUSE_FILTER_IGNORE
	prefix.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	prefix.add_theme_font_size_override("font_size", 18)
	prefix.add_theme_color_override("font_color", muted_blue)
	ClientUi.apply_display_font(prefix)
	row.add_child(prefix)
	if ids.is_empty():
		prefix.text = "SELL ITEMS — SELECT GEAR"
		_refresh_sell_notice(classification)
		return
	if shipment_mode:
		prefix.text = "DELIVER SHIPMENT —"
		if retry_available:
			prefix.text = "RETRY PREVIEW"
			_refresh_sell_notice(classification)
			return
		if not preview_ready:
			if overflow:
				prefix.text = "DELIVER SHIPMENT — RESOLVE TOKEN"
			elif not _shipment_error.is_empty():
				prefix.text = "DELIVER SHIPMENT — BLOCKED"
			else:
				prefix.text = "DELIVER SHIPMENT — PREVIEWING"
			_refresh_sell_notice(classification)
			_request_shipment_preview(classification)
			return
	else:
		prefix.text = "SELL ITEMS —"
	var glyph := CurrencyIcon.make("stardust", 32.0)
	glyph.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(glyph)
	var amount := Label.new()
	amount.mouse_filter = Control.MOUSE_FILTER_IGNORE
	amount.text = _format_sell_amount(total)
	amount.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	amount.add_theme_font_size_override("font_size", 18)
	var fuchsia := CurrencyIcon.STARDUST_FUCHSIA
	amount.add_theme_color_override(
		"font_color",
		Color(fuchsia, 0.5) if _sell_btn.disabled else fuchsia
	)
	ClientUi.apply_display_font(amount)
	row.add_child(amount)
	_refresh_sell_notice(classification)
	if shipment_mode and not preview_ready and not retry_available:
		_request_shipment_preview(classification)


func _request_shipment_preview(classification: Dictionary) -> void:
	if _is_shipment_preview_in_flight():
		return
	if _shipment_retry_available:
		return
	if str(classification.get("mode", "")) != CompanyRules.SHIPMENT_DOCK_MODE_SHIPMENT:
		return
	var company_id := str(classification.get("company_id", ""))
	var ids := _sell_staged_ids()
	if company_id.is_empty() or ids.size() != CompanyRules.SHIPMENT_ITEM_COUNT:
		return
	if CompanyManager.overflow_pending(company_id):
		_shipment_overflow_blocked = true
		_refresh_sell_notice(classification)
		return
	_shipment_in_flight_generation = _shipment_generation
	var generation := _shipment_generation
	if CompanyManager.companies.is_empty():
		await _load_company_status()
	if generation != _shipment_generation or not is_inside_tree():
		_refresh_after_stale_shipment_preview(generation)
		return
	if CompanyManager.overflow_pending(company_id):
		_end_shipment_preview_flight(generation)
		_shipment_overflow_blocked = true
		_populate()
		return
	var res: Dictionary = await CompanyManager.preview_shipment(company_id, ids)
	_end_shipment_preview_flight(generation)
	if generation != _shipment_generation or not is_inside_tree():
		if is_inside_tree():
			_populate()
		return
	if not res.ok:
		var code := str(res.get("code", ""))
		if code == CompanyRules.COMPANY_OVERFLOW_PENDING:
			_shipment_overflow_blocked = true
			_shipment_error = ""
			_shipment_retry_available = false
		else:
			_shipment_error = str(res.get("error", "This crate cannot be delivered as a shipment."))
			_shipment_preview = {}
			_shipment_retry_available = true
		_populate()
		return
	_shipment_error = ""
	_shipment_retry_available = false
	_shipment_overflow_blocked = false
	_shipment_preview = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	_populate()


func _make_sell_bag_slot(item: Dictionary, is_stage: bool, stage_index: int = -1, shipment_display_value: int = -1) -> PanelContainer:
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
		panel.tooltip_text = ""
	else:
		panel.add_theme_stylebox_override(
			"panel",
			_sell_slot_style(Color(0.04, 0.05, 0.08, 0.78), Color(0.28, 0.34, 0.42, 0.42))
		)
		panel.tooltip_text = ""
		panel.modulate.a = 0.72 if is_stage else 0.45

	var root := HBoxContainer.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.alignment = BoxContainer.ALIGNMENT_CENTER
	root.add_theme_constant_override("separation", 6)
	panel.add_child(root)

	if filled:
		var icon_wrap := CenterContainer.new()
		icon_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon_wrap.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		icon_wrap.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		icon_wrap.custom_minimum_size = Vector2(SELL_ICON_SZ, SELL_ICON_SZ)
		root.add_child(icon_wrap)
		var gear := GearIcon.make(item, SELL_ICON_SZ)
		gear.custom_minimum_size = Vector2(SELL_ICON_SZ, SELL_ICON_SZ)
		icon_wrap.add_child(gear)

		var text_col := VBoxContainer.new()
		text_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		text_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		text_col.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		text_col.add_theme_constant_override("separation", 4)
		root.add_child(text_col)

		var title := Label.new()
		title.mouse_filter = Control.MOUSE_FILTER_IGNORE
		title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		title.autowrap_mode = TextServer.AUTOWRAP_OFF
		title.clip_text = true
		title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		title.text = str(item.get("name", "Item"))
		title.add_theme_font_size_override("font_size", SELL_TITLE_FS)
		title.add_theme_color_override(
			"font_color",
			ClientUi.rarity_color(str(item.get("rarity", ""))).lightened(0.2)
		)
		ClientUi.apply_display_font(title)
		text_col.add_child(title)

		var price_row := HBoxContainer.new()
		price_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		price_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		price_row.alignment = BoxContainer.ALIGNMENT_END
		text_col.add_child(price_row)
		var shown_value := shipment_display_value if shipment_display_value >= 0 else InventoryRules.estimate_sell_value(item)
		price_row.add_child(CurrencyIcon.make_stardust_amount_row(
			_format_sell_amount(shown_value),
			STALL_PRICE_ICON,
			STALL_PRICE_FS
		))
		if shipment_display_value >= 0:
			var bonus := Label.new()
			bonus.mouse_filter = Control.MOUSE_FILTER_IGNORE
			bonus.text = CompanyRules.shipment_bonus_label()
			bonus.add_theme_font_size_override("font_size", 16)
			bonus.add_theme_color_override("font_color", ClientUi.SUCCESS)
			ClientUi.apply_display_font(bonus)
			price_row.add_child(bonus)
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
		panel.mouse_entered.connect(func() -> void:
			_show_gear_inspect(panel, captured)
		)
		panel.mouse_exited.connect(_hide_gear_inspect)
		panel.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
				_hide_gear_inspect()
				if is_stage:
					_unstage_sell_slot(idx)
				else:
					_stage_sell_item(captured)
				panel.accept_event()
		)
		panel.set_drag_forwarding(
			func(_at: Vector2) -> Variant:
				_hide_gear_inspect()
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
	_invalidate_shipment_preview()
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
	_invalidate_shipment_preview()
	_populate()


func _unstage_sell_slot(stage_index: int) -> void:
	if stage_index < 0 or stage_index >= _sell_stage.size():
		return
	_sell_stage[stage_index] = {}
	_invalidate_shipment_preview()
	_populate()


func _retry_shipment_preview() -> void:
	if _busy or _is_shipment_preview_in_flight() or not _shipment_retry_available:
		return
	if str(_sell_dock_classification().get("mode", "")) != CompanyRules.SHIPMENT_DOCK_MODE_SHIPMENT:
		return
	_shipment_retry_available = false
	_shipment_error = ""
	_populate()


func _on_confirm_sell() -> void:
	if _busy:
		return
	var ids := _sell_staged_ids()
	if ids.is_empty():
		return
	var classification := _sell_dock_classification()
	var mode := str(classification.get("mode", CompanyRules.SHIPMENT_DOCK_MODE_SALE))
	if mode == CompanyRules.SHIPMENT_DOCK_MODE_SHIPMENT:
		if _shipment_retry_available:
			_retry_shipment_preview()
			return
		_on_confirm_shipment(classification)
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
	_invalidate_shipment_preview()
	await _load_bag_items()
	_load_equipped()
	_set_status("Sold %s item(s) for %s Stardust" % [dissolved_n, NumberDisplay.quantity(gained)])
	_populate()


func _on_confirm_shipment(classification: Dictionary) -> void:
	if _busy:
		return
	var company_id := str(classification.get("company_id", ""))
	if company_id.is_empty() or not _shipment_preview_matches_dock():
		_set_status("Wait for the company preview before delivering this shipment.")
		return
	if _shipment_overflow_blocked or CompanyManager.overflow_pending(company_id):
		_set_status("Resolve %s token overflow in Corporate Offices before delivering." % CompanyRules.display_name(company_id))
		return
	var preview := _shipment_preview.duplicate(true)
	var payout := int(preview.get("payout", 0))
	var base_value := int(preview.get("base_value", 0))
	var bonus := int(preview.get("bonus", 0))
	var names: Array[String] = []
	for slot in _sell_stage:
		if typeof(slot) == TYPE_DICTIONARY and not slot.is_empty():
			names.append(str((slot as Dictionary).get("name", "Gear")))
	var token_note := "No company level this time."
	var awarded: Variant = preview.get("awarded_tokens", [])
	if bool(preview.get("levels_up", false)):
		token_note = "This will raise %s to company level %s." % [
			CompanyRules.display_name(company_id),
			int(preview.get("next_level", 0)),
		]
		if typeof(awarded) == TYPE_ARRAY and awarded.size() > 0 and typeof(awarded[0]) == TYPE_DICTIONARY:
			token_note += " It awards a %s Commission token." % CompanyRules.rarity_label(str((awarded[0] as Dictionary).get("rarity", "rare")))
	var overflow_note := ""
	var row := CompanyManager.company_row(company_id)
	var waiting: Variant = row.get("waiting_token", null)
	if typeof(waiting) == TYPE_DICTIONARY and not (waiting as Dictionary).is_empty() and typeof(awarded) == TYPE_ARRAY and awarded.size() > 0:
		overflow_note = "\nThis will create token overflow. Stay here, then resolve the choice in Corporate Offices."
	var body := "%s\n%s\nNormal sell value: %s Stardust.\n%s%% shipment bonus: %s Stardust.\nFinal payout: %s Stardust.\nReputation: +%s.\n%s%s\n%s" % [
		CompanyRules.display_name(company_id),
		", ".join(names),
		_format_sell_amount(base_value),
		CompanyRules.SHIPMENT_BONUS_PERCENT,
		_format_sell_amount(bonus),
		_format_sell_amount(payout),
		CompanyRules.SHIPMENT_REPUTATION_REWARD,
		token_note,
		overflow_note,
		str(preview.get("warning", "These five items will be permanently consumed.")),
	]
	var sheet := ClientUi.make_confirm_sheet(
		"Return shipment",
		"Deliver this crate?",
		body,
		func() -> void: _submit_shipment(company_id),
		Callable(),
		"Deliver Shipment",
		"Cancel",
		ClientUi.GOLD,
		true
	)
	add_child(sheet)


func _submit_shipment(company_id: String) -> void:
	if _busy:
		return
	var classification := _sell_dock_classification()
	if str(classification.get("mode", "")) != CompanyRules.SHIPMENT_DOCK_MODE_SHIPMENT:
		_set_status("This crate is no longer a return shipment.")
		_populate()
		return
	if str(classification.get("company_id", "")) != company_id or not _shipment_preview_matches_dock():
		_set_status("Shipment preview expired. The crate was not delivered.")
		_invalidate_shipment_preview()
		_populate()
		return
	var ids := _sell_staged_ids()
	_busy = true
	_refresh_sell_button()
	_set_status("Delivering shipment…")
	var res: Dictionary = await CompanyManager.confirm_shipment(company_id, ids)
	_busy = false
	if not res.ok:
		var code := str(res.get("code", ""))
		if code == CompanyRules.COMPANY_OVERFLOW_PENDING:
			_shipment_overflow_blocked = true
			_set_status("Resolve %s token overflow in Corporate Offices. Nothing was sold." % CompanyRules.display_name(company_id))
		else:
			_set_status(str(res.get("error", "Shipment failed")))
		await _load_company_status()
		await _load_bag_items()
		_load_equipped()
		_populate()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	for i in _sell_stage.size():
		_sell_stage[i] = {}
	_invalidate_shipment_preview()
	await _load_company_status()
	await _load_bag_items()
	_load_equipped()
	_set_status(_shipment_success_status(company_id, data))
	_populate()


func _shipment_success_status(company_id: String, data: Dictionary) -> String:
	var payload := {
		"company_name": CompanyRules.display_name(company_id),
		"overflow_pending": bool(data.get("overflow_pending", false)),
	}
	if data.has("payout"):
		payload["payout"] = int(data.get("payout", 0))
	if data.has("reputation_granted"):
		payload["reputation_granted"] = int(data.get("reputation_granted", 0))
	var levels: Variant = data.get("levels_awarded", [])
	var company: Variant = data.get("company", {})
	if typeof(levels) == TYPE_ARRAY and (levels as Array).size() > 0:
		if typeof(company) == TYPE_DICTIONARY and (company as Dictionary).has("level"):
			payload["company_level"] = int((company as Dictionary).get("level", 0))
		else:
			payload["company_level"] = int((levels as Array)[(levels as Array).size() - 1])
	var tokens: Variant = data.get("tokens_created", [])
	if typeof(tokens) == TYPE_ARRAY and (tokens as Array).size() > 0 and typeof(tokens[0]) == TYPE_DICTIONARY:
		payload["token_rarity"] = CompanyRules.rarity_label(str((tokens[0] as Dictionary).get("rarity", "")))
	return CompanyRules.format_shipment_delivery_status(payload)
