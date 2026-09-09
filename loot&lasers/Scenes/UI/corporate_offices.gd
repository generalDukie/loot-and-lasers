extends Control
## Corporate Offices — company reputation, token storage, overflow resolution, and Commission tokens.

const BACKDROP_FILE := "corporate-offices-bg.png"
const OVERLAY_PANEL_FILL := Color(0.05, 0.06, 0.09, 0.78)
const OVERLAY_CARD_FILL := Color(0.06, 0.07, 0.11, 0.82)
const OVERLAY_SCRIM := Color(0.015, 0.018, 0.04, 0.82)
const PAGE_MARGIN_HORIZONTAL_PX := 16
const PAGE_MARGIN_VERTICAL_PX := 12
const ROOT_SEPARATION_PX := 12
const HEADER_SEPARATION_PX := 12
const PANE_ROW_SEPARATION_PX := 10
const CARD_PAD_PX := 10
const CARD_INNER_SEPARATION_PX := 8
const CARD_CORNER_RADIUS_PX := 12
const CARD_BORDER_WIDTH_PX := 1
const TITLE_FONT_SIZE_PX := 27
const TITLE_ICON_SIZE_PX := 28
const COMPANY_NAME_FONT_SIZE_PX := 16
const COMPANY_NAME_SCALE_NUMERATOR := 5
const COMPANY_NAME_SCALE_DENOMINATOR := 4
const COMPANY_META_FONT_SIZE_PX := 13
const COMPANY_SLOT_FONT_SIZE_PX := 12
const TOKEN_STATUS_FONT_SIZE_PX := 14
const REP_BAR_HEIGHT_PX := 8
const PANE_HEIGHT_WINDOW_PERCENT := 60
const PANE_HEIGHT_REDUCTION_PERCENT := 30
const PANE_HEIGHT_SECOND_REDUCTION_PERCENT := 20
const PERCENT_UNIT := 100
const TOKEN_ART_DIR := "res://Assets/Icons/tokens/"
const TOKEN_ART_EMPTY := "commission_token_empty.svg"
const TOKEN_ART_RARE := "commission_token.svg"
const TOKEN_ART_EPIC := "commission_token_epic.svg"
const TOKEN_ART_PANE_HEIGHT_PERCENT := 40
const TOKEN_ART_SCALE_REDUCTION_PERCENT := 25
const PANE_CHROME_SCALE_INCREASE_PERCENT := 50
const ORDER_POPUP_REF_WIDTH_PX := 908
const ORDER_POPUP_REF_HEIGHT_PX := 2256
const ORDER_POPUP_SIZE_PERCENT := 50
const ORDER_POPUP_Z_INDEX := 140
const ORDER_POPUP_CORNER_RADIUS_PX := 14
const ORDER_POPUP_BORDER_WIDTH_PX := 2
const ORDER_POPUP_PAD_H_PX := 24
const ORDER_POPUP_PAD_V_PX := 22
const ORDER_POPUP_FADE_MS := 180
const ORDER_POPUP_BODY_SEPARATION_PX := 16
const ORDER_POPUP_TOKEN_ART_PX := 64
const ORDER_POPUP_STAT_ICON_PX := 40
const ORDER_POPUP_STAT_TILE_WIDTH_PX := 118
const ORDER_POPUP_STAT_TILE_HEIGHT_PX := 96
const ORDER_POPUP_STAT_TILE_INNER_PAD_PX := 6
const ORDER_POPUP_STAT_TILE_STYLE_MARGIN_PX := 4
const ORDER_POPUP_STAT_TILE_LABEL_ROOM_PX := 12
const ORDER_POPUP_STAT_TILE_HEIGHT_EXTRA_PX := 10
const ORDER_POPUP_STAT_TILE_BOTTOM_PAD_EXTRA_PX := 6
const ORDER_POPUP_STAT_ROW_SEPARATION_PX := 8
const ORDER_POPUP_STAT_NAME_FONT_EXTRA_PX := 2
const ORDER_POPUP_STAT_NAME_COLUMN_PAD_PX := 4
const ORDER_POPUP_SLOT_CHIP_FONT_SIZE_PX := 11
const ORDER_POPUP_ACTION_FONT_SIZE_PX := 13
const ORDER_POPUP_ACTION_FONT_MIN_PX := 11
const ORDER_POPUP_ACTION_PAD_H_PX := 8
const ORDER_POPUP_BODY_INSET_PX := 4
const ORDER_POPUP_CONTROL_CHROME_PAD_PX := 10
const ORDER_POPUP_WEIGHT_ROW_CHROME_PX := 8
const ORDER_POPUP_FIXED_BODY_ROW_COUNT := 8
const ORDER_POPUP_RULE_LINE_COUNT := 2
const ORDER_POPUP_CONTENT_SLACK_PX := 32
const ORDER_POPUP_CONTENT_FILL_PERCENT := 90
const ORDER_POPUP_RULE_FONT_SIZE_PX := 14
const ORDER_POPUP_CHOOSE_SLOT_COPY := "Choose a slot"
const ORDER_POPUP_RARE_RULE_COPY := "Minimum %s%% - Maximum %s%%"
const ORDER_POPUP_RARE_TOTAL_COPY := "Total Stat Distribution - %s%%"
const ORDER_POPUP_RARE_TOTAL_MUST_COPY := "Total must come to exactly %s%%"
const ORDER_POPUP_EPIC_RULE_COPY := "%s, %s, and %s minimums at %s%% / %s%% / %s%% - Remaining stats distributed randomly."
const MILLISECONDS_PER_SECOND := 1000
const EMPTY_TOKEN_COPY := "No Stored Token"
const OVERFLOW_STATUS_COPY := "Reputation gains halted until a token is spent"
const REDEEM_BUTTON_LABEL := "Redeem"
const REDEEM_STORED_TOKEN_LABEL := "Redeem Stored Token - %s"
const ORDER_POPUP_BAG_FULL_COPY := "Free a backpack slot before creating a Commission."
const REDEEM_NEW_TOKEN_LABEL := "Redeem New Token - %s"
const STORED_TOKEN_CAPTION := "Stored"
const NEW_TOKEN_CAPTION := "New"
const TOKEN_CAPTION_FONT_SIZE_PX := 11
const OVERFLOW_TOKEN_PAIR_SEPARATION_PX := 12
const ORDER_POPUP_HEADING := "Order Commission"
const ORDER_POPUP_BG_ALPHA_PERCENT := 24
const ORDER_POPUP_BG_CNC := "corporate_offices_crown_and_carapace.png"
const ORDER_POPUP_BG_BJS := "corporate_offices_bj_services.png"
const ORDER_POPUP_BG_DTD := "corporate_offices_duct_tape_dynamics.png"
const ORDER_POPUP_BG_GORP := "corporate_offices_gorptek.png"

var _status: Label
var _page_header: HBoxContainer
var _company_row: HBoxContainer
var _busy := false

var _order_company_id := ""
var _spend_token_id := ""
var _chosen_slot := ""
var _rare_stats: Array[String] = []
var _rare_weights: Array[int] = []
var _weight_sliders: Array[HSlider] = []
var _weight_labels: Array[Label] = []
var _rare_total_lab: Label
var _rare_must_lab: Label
var _order_create_btn: Button
var _order_is_epic := false
var _order_filling := false
var _order_overlay: Control
var _order_card: PanelContainer
var _order_body: VBoxContainer


func _ready() -> void:
	clip_contents = true
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CompanyManager.companies_loaded.is_connected(_on_companies_loaded):
		CompanyManager.companies_loaded.connect(_on_companies_loaded)
	if not CompanyManager.company_error.is_connected(_on_company_error):
		CompanyManager.company_error.connect(_on_company_error)
	if not get_viewport().size_changed.is_connected(_on_viewport_resized):
		get_viewport().size_changed.connect(_on_viewport_resized)
	await _boot()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		_on_viewport_resized()


func _on_viewport_resized() -> void:
	_apply_pane_height()
	if _company_row != null:
		_refresh_companies()
	_apply_order_popup_size()


func on_shell_reshow() -> void:
	_busy = false
	_close_order_popup()
	_set_status("Restoring Corporate Offices…")
	await CompanyManager.load_status()
	_refresh()


func has_overlay() -> bool:
	return _order_overlay != null and is_instance_valid(_order_overlay)


func _boot() -> void:
	_busy = true
	_set_status("Loading companies…")
	await CompanyManager.load_status()
	_busy = false
	_refresh()


func _on_companies_loaded(_state: Dictionary = {}) -> void:
	if not is_inside_tree():
		return
	_refresh()


func _on_company_error(error: String) -> void:
	_set_status(error)


func _build() -> void:
	var bg := TextureRect.new()
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.texture = _load_offices_texture(BACKDROP_FILE)
	add_child(bg)
	bg.set_anchors_and_offsets_preset(PRESET_FULL_RECT)

	var margin := MarginContainer.new()
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margin)
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", PAGE_MARGIN_HORIZONTAL_PX)
	margin.add_theme_constant_override("margin_right", PAGE_MARGIN_HORIZONTAL_PX)
	margin.add_theme_constant_override("margin_top", PAGE_MARGIN_VERTICAL_PX)
	margin.add_theme_constant_override("margin_bottom", PAGE_MARGIN_VERTICAL_PX)

	var root := VBoxContainer.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", ROOT_SEPARATION_PX)
	margin.add_child(root)

	_page_header = HBoxContainer.new()
	_page_header.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_page_header.add_theme_constant_override("separation", HEADER_SEPARATION_PX)
	root.add_child(_page_header)
	var header := _page_header
	var title_row := UiIcon.make_title_row("landmark", "Corporate Offices", ClientUi.TEXT, TITLE_FONT_SIZE_PX, float(TITLE_ICON_SIZE_PX))
	title_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_row)
	_status = ClientUi.make_status()
	_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	header.add_child(_status)

	var top_spacer := Control.new()
	top_spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(top_spacer)

	_company_row = HBoxContainer.new()
	_company_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_company_row.add_theme_constant_override("separation", PANE_ROW_SEPARATION_PX)
	_company_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_company_row.size_flags_vertical = Control.SIZE_SHRINK_END
	root.add_child(_company_row)


func _refresh() -> void:
	_apply_pane_height()
	_refresh_companies()
	if has_overlay():
		if _find_token(CompanyManager.company_row(_order_company_id), _spend_token_id).is_empty():
			_close_order_popup()
		else:
			_fill_order_body()


func _refresh_companies() -> void:
	for child in _company_row.get_children():
		child.queue_free()
	for raw in CompanyManager.companies:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		_company_row.add_child(_make_company_card(raw as Dictionary))


func _make_company_card(row: Dictionary) -> PanelContainer:
	var cid := str(row.get("id", ""))
	var accent := CompanyRules.color_for(cid)
	var overflow := bool(row.get("overflow_pending", false))
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		OVERLAY_CARD_FILL,
		Color(ClientUi.WARNING if overflow else accent, 0.85 if overflow else 0.55),
		CARD_CORNER_RADIUS_PX,
		CARD_BORDER_WIDTH_PX
	))

	var pad := MarginContainer.new()
	pad.mouse_filter = Control.MOUSE_FILTER_PASS
	for k in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		pad.add_theme_constant_override(k, CARD_PAD_PX)
	panel.add_child(pad)
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_PASS
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", CARD_INNER_SEPARATION_PX)
	pad.add_child(col)

	var name_lab := Label.new()
	name_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_lab.text = str(row.get("name", CompanyRules.display_name(cid)))
	name_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_lab.add_theme_font_size_override(
		"font_size",
		(_pane_chrome_px(COMPANY_NAME_FONT_SIZE_PX) * COMPANY_NAME_SCALE_NUMERATOR) / COMPANY_NAME_SCALE_DENOMINATOR
	)
	name_lab.add_theme_color_override("font_color", accent)
	name_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ClientUi.apply_display_font(name_lab)
	col.add_child(name_lab)

	var slots: Variant = row.get("slots", [])
	var slot_lab := Label.new()
	slot_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if typeof(slots) == TYPE_ARRAY:
		var labels: Array[String] = []
		for slot in slots:
			labels.append(CompanyRules.slot_label(str(slot)))
		slot_lab.text = ", ".join(labels)
	slot_lab.add_theme_font_size_override("font_size", _pane_chrome_px(COMPANY_SLOT_FONT_SIZE_PX))
	slot_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	slot_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(slot_lab)

	var level := CompanyRules.level_from_reputation(int(row.get("reputation", 0)))
	var into := int(row.get("reputation_into_level", 0))
	var need := int(row.get("reputation_per_level", CompanyRules.COMPANY_REPUTATION_PER_LEVEL))
	var meta := Label.new()
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meta.text = "Lv %s  ·  %s / %s  ·  next %s" % [
		level,
		into,
		need,
		CompanyRules.rarity_label(str(row.get("next_token_rarity", "rare"))),
	]
	meta.add_theme_font_size_override("font_size", _pane_chrome_px(COMPANY_META_FONT_SIZE_PX))
	meta.add_theme_color_override("font_color", ClientUi.TEXT)
	col.add_child(meta)

	var bar := ProgressBar.new()
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.min_value = 0
	bar.max_value = need
	bar.value = into
	bar.show_percentage = false
	bar.custom_minimum_size.y = _pane_chrome_px(REP_BAR_HEIGHT_PX)
	ClientUi.apply_hp_bar(bar, accent)
	col.add_child(bar)

	var waiting: Variant = row.get("waiting_token", null)
	var overflow_token: Variant = row.get("overflow_token", null)
	var mid := CenterContainer.new()
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	if overflow:
		mid.add_child(_make_overflow_token_pair(waiting, overflow_token))
	else:
		mid.add_child(_make_token_art(waiting if _is_token(waiting) else overflow_token))
	col.add_child(mid)

	var status := Label.new()
	status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.add_theme_font_size_override("font_size", _pane_chrome_px(TOKEN_STATUS_FONT_SIZE_PX))
	ClientUi.apply_display_font(status)
	if overflow:
		status.text = OVERFLOW_STATUS_COPY
		status.add_theme_color_override("font_color", ClientUi.WARNING)
	elif _is_token(waiting):
		status.text = "%s Token Waiting" % _token_rarity_label(waiting)
		status.add_theme_color_override("font_color", ClientUi.GOLD)
	else:
		status.text = EMPTY_TOKEN_COPY
		status.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(status)

	var ordering := has_overlay()
	if overflow:
		if _is_token(waiting):
			col.add_child(_pane_action_button(
				REDEEM_STORED_TOKEN_LABEL % _token_rarity_label(waiting),
				accent,
				not _busy and not ordering,
				func() -> void: _begin_order(cid, waiting)
			))
		if _is_token(overflow_token):
			col.add_child(_pane_action_button(
				REDEEM_NEW_TOKEN_LABEL % _token_rarity_label(overflow_token),
				accent,
				not _busy and not ordering,
				func() -> void: _begin_order(cid, overflow_token)
			))
	elif _is_token(waiting):
		col.add_child(_pane_action_button(
			REDEEM_BUTTON_LABEL,
			accent,
			not _busy and not ordering,
			func() -> void: _begin_order(cid, waiting)
		))
	return panel


func _make_overflow_token_pair(stored: Variant, new_token: Variant) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", OVERFLOW_TOKEN_PAIR_SEPARATION_PX)
	var side := _token_art_side_px()
	row.add_child(_make_labeled_token_column(STORED_TOKEN_CAPTION, stored, side))
	row.add_child(_make_labeled_token_column(NEW_TOKEN_CAPTION, new_token, side))
	return row


func _make_labeled_token_column(caption: String, token: Variant, side_px: int) -> VBoxContainer:
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", CARD_INNER_SEPARATION_PX)
	var lab := Label.new()
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.text = caption
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", _pane_chrome_px(TOKEN_CAPTION_FONT_SIZE_PX))
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	col.add_child(_make_token_art(token, side_px))
	return col


func _make_token_art(token: Variant, side_px: int = 0) -> TextureRect:
	var tex := TextureRect.new()
	tex.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tex.texture = _token_art_texture(token)
	var side := side_px if side_px > 0 else _token_art_side_px()
	tex.custom_minimum_size = Vector2(side, side)
	return tex


func _pane_chrome_px(base_px: int) -> int:
	return (base_px * (PERCENT_UNIT + PANE_CHROME_SCALE_INCREASE_PERCENT)) / PERCENT_UNIT


func _token_art_side_px() -> int:
	var pane_h := 0
	if _company_row != null:
		pane_h = int(_company_row.custom_minimum_size.y)
	if pane_h <= 0:
		var window_h := int(get_viewport().get_visible_rect().size.y)
		var first_kept := PERCENT_UNIT - PANE_HEIGHT_REDUCTION_PERCENT
		var second_kept := PERCENT_UNIT - PANE_HEIGHT_SECOND_REDUCTION_PERCENT
		pane_h = (window_h * PANE_HEIGHT_WINDOW_PERCENT * first_kept * second_kept) / (PERCENT_UNIT * PERCENT_UNIT * PERCENT_UNIT)
	var kept := PERCENT_UNIT - TOKEN_ART_SCALE_REDUCTION_PERCENT
	return maxi(1, (pane_h * TOKEN_ART_PANE_HEIGHT_PERCENT * kept) / (PERCENT_UNIT * PERCENT_UNIT))


func _token_art_texture(token: Variant) -> Texture2D:
	var file := TOKEN_ART_EMPTY
	if _is_token(token):
		var rarity := str((token as Dictionary).get("rarity", "rare")).to_lower()
		file = TOKEN_ART_EPIC if rarity == "epic" else TOKEN_ART_RARE
	var path := TOKEN_ART_DIR + file
	if ResourceLoader.exists(path):
		return load(path) as Texture2D
	return null


func _pane_action_button(text: String, accent: Color, enabled: bool, on_press: Callable) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.disabled = not enabled
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_tinted_painted_button(btn, accent)
	btn.pressed.connect(on_press)
	return btn


func _apply_pane_height() -> void:
	if _company_row == null:
		return
	var window_h := int(get_viewport().get_visible_rect().size.y)
	var baseline := (window_h * PANE_HEIGHT_WINDOW_PERCENT) / PERCENT_UNIT
	var first_kept := PERCENT_UNIT - PANE_HEIGHT_REDUCTION_PERCENT
	var second_kept := PERCENT_UNIT - PANE_HEIGHT_SECOND_REDUCTION_PERCENT
	var target := (baseline * first_kept * second_kept) / (PERCENT_UNIT * PERCENT_UNIT)
	var leftover := _available_row_height()
	if leftover > 0:
		target = mini(target, leftover)
	_company_row.custom_minimum_size.y = maxi(1, target)


func _available_row_height() -> int:
	var used := PAGE_MARGIN_VERTICAL_PX + PAGE_MARGIN_VERTICAL_PX + ROOT_SEPARATION_PX
	if _page_header != null:
		used += int(_page_header.get_combined_minimum_size().y)
	return maxi(0, int(size.y) - used)


func _is_token(token: Variant) -> bool:
	return typeof(token) == TYPE_DICTIONARY and not (token as Dictionary).is_empty()


func _token_rarity_label(token: Variant) -> String:
	if not _is_token(token):
		return ""
	return CompanyRules.rarity_label(str((token as Dictionary).get("rarity", "rare")))


func _begin_order(company_id: String, token: Variant) -> void:
	if has_overlay() or not _is_token(token):
		return
	_order_company_id = company_id
	_spend_token_id = str((token as Dictionary).get("id", ""))
	_chosen_slot = _default_order_slot(company_id)
	_rare_stats.clear()
	_rare_weights.clear()
	_open_order_popup()


func _open_order_popup() -> void:
	if has_overlay():
		return
	_order_overlay = Control.new()
	_order_overlay.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_order_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	_order_overlay.z_index = ORDER_POPUP_Z_INDEX

	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scrim.color = OVERLAY_SCRIM
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	scrim.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
			_close_order_popup()
	)
	_order_overlay.add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_order_overlay.add_child(center)

	_order_card = PanelContainer.new()
	_order_card.mouse_filter = Control.MOUSE_FILTER_STOP
	_order_card.clip_contents = true
	var panel_style := ClientUi.painted_panel_style(
		Color(0.045, 0.05, 0.085, 0.98),
		Color(CompanyRules.color_for(_order_company_id), 0.65),
		ORDER_POPUP_CORNER_RADIUS_PX,
		ORDER_POPUP_BORDER_WIDTH_PX
	).duplicate() as StyleBoxFlat
	panel_style.content_margin_left = 0
	panel_style.content_margin_right = 0
	panel_style.content_margin_top = 0
	panel_style.content_margin_bottom = 0
	_order_card.add_theme_stylebox_override("panel", panel_style)
	center.add_child(_order_card)
	_apply_order_popup_size()

	var host := Control.new()
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_order_card.add_child(host)

	var bg := TextureRect.new()
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	bg.modulate = Color(1.0, 1.0, 1.0, float(ORDER_POPUP_BG_ALPHA_PERCENT) / float(PERCENT_UNIT))
	bg.texture = _load_offices_texture(_order_popup_bg_file(_order_company_id))
	host.add_child(bg)
	bg.set_anchors_and_offsets_preset(PRESET_FULL_RECT)

	var margin := MarginContainer.new()
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_theme_constant_override("margin_left", ORDER_POPUP_PAD_H_PX)
	margin.add_theme_constant_override("margin_right", ORDER_POPUP_PAD_H_PX)
	margin.add_theme_constant_override("margin_top", ORDER_POPUP_PAD_V_PX)
	margin.add_theme_constant_override("margin_bottom", ORDER_POPUP_PAD_V_PX)
	host.add_child(margin)
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)

	_order_body = VBoxContainer.new()
	_order_body.alignment = BoxContainer.ALIGNMENT_CENTER
	_order_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_order_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_order_body.add_theme_constant_override("separation", ORDER_POPUP_BODY_SEPARATION_PX)
	margin.add_child(_order_body)

	add_child(_order_overlay)
	_fill_order_body()
	_refresh_companies()
	_order_card.modulate.a = 0.0
	var tween := _order_card.create_tween()
	tween.tween_property(_order_card, "modulate:a", 1.0, float(ORDER_POPUP_FADE_MS) / float(MILLISECONDS_PER_SECOND)).set_ease(Tween.EASE_OUT)


func _order_popup_card_size() -> Vector2:
	var view := get_viewport().get_visible_rect().size
	var max_w := maxi(1, int(view.x) - PAGE_MARGIN_HORIZONTAL_PX - PAGE_MARGIN_HORIZONTAL_PX)
	var max_h := maxi(1, int(view.y) - PAGE_MARGIN_VERTICAL_PX - PAGE_MARGIN_VERTICAL_PX)
	var width := (ORDER_POPUP_REF_WIDTH_PX * ORDER_POPUP_SIZE_PERCENT) / PERCENT_UNIT
	var height := (ORDER_POPUP_REF_HEIGHT_PX * ORDER_POPUP_SIZE_PERCENT) / PERCENT_UNIT
	return Vector2(mini(width, max_w), mini(height, max_h))


func _apply_order_popup_size() -> void:
	if _order_card == null or not is_instance_valid(_order_card):
		return
	var card_size := _order_popup_card_size()
	_order_card.custom_minimum_size = card_size


func _close_order_popup() -> void:
	if _order_overlay != null and is_instance_valid(_order_overlay):
		_order_overlay.queue_free()
	_order_overlay = null
	_order_card = null
	_order_body = null
	_order_company_id = ""
	_spend_token_id = ""
	_chosen_slot = ""
	_rare_stats.clear()
	_rare_weights.clear()
	_weight_sliders.clear()
	_weight_labels.clear()
	_rare_total_lab = null
	_rare_must_lab = null
	_order_create_btn = null
	if is_inside_tree():
		_refresh_companies()


func _fill_order_body() -> void:
	if _order_body == null:
		return
	_rare_total_lab = null
	_rare_must_lab = null
	_order_create_btn = null
	_order_filling = true
	_order_body.add_theme_constant_override("separation", _order_px(ORDER_POPUP_BODY_SEPARATION_PX))
	for child in _order_body.get_children():
		child.queue_free()
	var row := CompanyManager.company_row(_order_company_id)
	var token := _find_token(row, _spend_token_id)
	if token.is_empty():
		_order_filling = false
		_close_order_popup()
		return
	var rarity := str(token.get("rarity", "rare")).to_lower()
	_order_is_epic = rarity == "epic"
	var accent := CompanyRules.color_for(_order_company_id)

	_order_body.add_child(_order_centered_label(
		CompanyRules.display_name(_order_company_id),
		COMPANY_NAME_FONT_SIZE_PX,
		accent
	))
	_order_body.add_child(_order_centered_label(ORDER_POPUP_HEADING, TITLE_FONT_SIZE_PX, accent))
	_order_body.add_child(_order_rarity_row(token, rarity, accent))

	_order_body.add_child(_order_centered_label(ORDER_POPUP_CHOOSE_SLOT_COPY, COMPANY_META_FONT_SIZE_PX, ClientUi.MUTED))
	_order_body.add_child(_order_slot_row(row))

	if rarity == "epic":
		_fill_epic_controls()
		_order_body.add_child(_order_centered_label(
			ORDER_POPUP_EPIC_RULE_COPY % [
				CompanyRules.stat_label(_active_class_primary_stat()),
				CompanyRules.stat_label("vitality"),
				CompanyRules.stat_label("luck"),
				CompanyRules.EPIC_PRIMARY_PERCENT,
				CompanyRules.EPIC_VITALITY_PERCENT,
				CompanyRules.EPIC_LUCK_PERCENT,
			],
			ORDER_POPUP_RULE_FONT_SIZE_PX,
			ClientUi.TEXT
		))
	else:
		_fill_rare_controls()
		_order_body.add_child(_order_centered_label(
			ORDER_POPUP_RARE_RULE_COPY % [
				CompanyRules.RARE_WEIGHT_MIN_PERCENT,
				CompanyRules.RARE_WEIGHT_MAX_PERCENT,
			],
			ORDER_POPUP_RULE_FONT_SIZE_PX,
			ClientUi.TEXT
		))
		if _rare_stats.size() == CompanyRules.RARE_COMMISSION_STAT_COUNT:
			_rare_total_lab = _order_centered_label("", ORDER_POPUP_RULE_FONT_SIZE_PX, ClientUi.TEXT)
			_rare_must_lab = _order_centered_label(
				ORDER_POPUP_RARE_TOTAL_MUST_COPY % CompanyRules.RARE_WEIGHT_TOTAL_PERCENT,
				ORDER_POPUP_RULE_FONT_SIZE_PX,
				ClientUi.TEXT
			)
			_order_body.add_child(_rare_total_lab)
			_order_body.add_child(_rare_must_lab)

	var actions := _order_centered_row()
	_order_body.add_child(actions)
	var cancel := Button.new()
	cancel.text = "Cancel — keep token"
	cancel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(cancel)
	var go := Button.new()
	go.text = "Create Commission item"
	go.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_tinted_painted_button(go, accent)
	_order_create_btn = go
	var action_fs := _order_action_font_px(cancel.text, go.text, cancel.get_theme_font("font"))
	_order_constrain_action_button(cancel, action_fs)
	_order_constrain_action_button(go, action_fs)
	cancel.pressed.connect(_close_order_popup)
	go.pressed.connect(_on_redeem_pressed)
	actions.add_child(cancel)
	actions.add_child(go)
	_order_filling = false
	_refresh_rare_total_ui()
	_sync_order_create_enabled()


func _order_centered_label(text: String, font_size_px: int, color: Color) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.add_theme_font_size_override("font_size", _order_px(font_size_px))
	lab.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(lab)
	return lab


func _order_centered_row() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", PANE_ROW_SEPARATION_PX)
	return row


func _order_apply_button_font(btn: Button, font_size_px: int) -> void:
	btn.add_theme_font_size_override("font_size", _order_px(font_size_px))


func _order_popup_inner_width() -> int:
	return maxi(
		1,
		int(_order_popup_card_size().x)
		- ORDER_POPUP_PAD_H_PX
		- ORDER_POPUP_PAD_H_PX
		- ORDER_POPUP_BORDER_WIDTH_PX
		- ORDER_POPUP_BORDER_WIDTH_PX
		- ORDER_POPUP_BODY_INSET_PX
		- ORDER_POPUP_BODY_INSET_PX
	)


func _order_popup_inner_height() -> int:
	return maxi(1, int(_order_popup_card_size().y) - ORDER_POPUP_PAD_V_PX - ORDER_POPUP_PAD_V_PX)


func _order_popup_baseline_content_height() -> int:
	var tile_content := (
		ORDER_POPUP_STAT_TILE_INNER_PAD_PX
		+ ORDER_POPUP_STAT_TILE_INNER_PAD_PX
		+ ORDER_POPUP_STAT_TILE_STYLE_MARGIN_PX
		+ ORDER_POPUP_STAT_TILE_STYLE_MARGIN_PX
		+ ORDER_POPUP_STAT_ICON_PX
		+ CARD_INNER_SEPARATION_PX
		+ TOKEN_CAPTION_FONT_SIZE_PX
		+ CARD_INNER_SEPARATION_PX
		+ COMPANY_META_FONT_SIZE_PX
		+ ORDER_POPUP_STAT_NAME_FONT_EXTRA_PX
		+ ORDER_POPUP_STAT_TILE_LABEL_ROOM_PX
		+ ORDER_POPUP_STAT_TILE_HEIGHT_EXTRA_PX
		+ ORDER_POPUP_STAT_TILE_BOTTOM_PAD_EXTRA_PX
	)
	var tile_h := maxi(tile_content, ORDER_POPUP_STAT_TILE_HEIGHT_PX)
	var chip_h := ORDER_POPUP_SLOT_CHIP_FONT_SIZE_PX + ORDER_POPUP_CONTROL_CHROME_PAD_PX
	var action_h := ORDER_POPUP_ACTION_FONT_SIZE_PX + ORDER_POPUP_CONTROL_CHROME_PAD_PX
	var weight_h := ORDER_POPUP_STAT_ICON_PX + ORDER_POPUP_WEIGHT_ROW_CHROME_PX
	var rows := ORDER_POPUP_FIXED_BODY_ROW_COUNT + CompanyRules.RARE_COMMISSION_STAT_COUNT
	var seps := maxi(0, rows - 1) * ORDER_POPUP_BODY_SEPARATION_PX
	return (
		COMPANY_NAME_FONT_SIZE_PX
		+ TITLE_FONT_SIZE_PX
		+ ORDER_POPUP_TOKEN_ART_PX
		+ COMPANY_META_FONT_SIZE_PX
		+ chip_h
		+ tile_h
		+ ORDER_POPUP_RULE_FONT_SIZE_PX * ORDER_POPUP_RULE_LINE_COUNT
		+ weight_h * CompanyRules.RARE_COMMISSION_STAT_COUNT
		+ action_h
		+ seps
		+ ORDER_POPUP_CONTENT_SLACK_PX
	)


func _order_popup_scale_percent() -> int:
	var baseline := _order_popup_baseline_content_height()
	return maxi(PERCENT_UNIT, (_order_popup_inner_height() * ORDER_POPUP_CONTENT_FILL_PERCENT) / maxi(1, baseline))


func _order_px(base_px: int) -> int:
	return (base_px * _order_popup_scale_percent()) / PERCENT_UNIT


func _order_stat_tile_slot_width() -> int:
	var count := CompanyRules.STAT_KEYS.size()
	var gaps := maxi(0, count - 1) * ORDER_POPUP_STAT_ROW_SEPARATION_PX
	return maxi(1, (_order_popup_inner_width() - gaps) / maxi(1, count))


func _order_stat_tile_chrome_x() -> int:
	return CARD_BORDER_WIDTH_PX + CARD_BORDER_WIDTH_PX


func _order_action_font_px(left_text: String, right_text: String, font: Font) -> int:
	var share := maxi(1, (_order_popup_inner_width() - PANE_ROW_SEPARATION_PX) / 2)
	var text_budget := maxi(1, share - ORDER_POPUP_ACTION_PAD_H_PX - ORDER_POPUP_ACTION_PAD_H_PX)
	if font == null:
		font = ThemeDB.fallback_font
	var size_px := _order_px(ORDER_POPUP_ACTION_FONT_SIZE_PX)
	while size_px > ORDER_POPUP_ACTION_FONT_MIN_PX:
		var left_w := int(font.get_string_size(left_text, HORIZONTAL_ALIGNMENT_CENTER, -1, size_px).x)
		var right_w := int(font.get_string_size(right_text, HORIZONTAL_ALIGNMENT_CENTER, -1, size_px).x)
		if maxi(left_w, right_w) <= text_budget:
			break
		size_px -= 1
	return size_px


func _order_constrain_action_button(btn: Button, font_size_px: int) -> void:
	btn.add_theme_font_size_override("font_size", font_size_px)
	btn.clip_text = false
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.custom_minimum_size.x = 0
	for state in ["normal", "hover", "pressed", "disabled"]:
		var raw := btn.get_theme_stylebox(state)
		if raw == null:
			continue
		var style := raw.duplicate() as StyleBoxFlat
		if style == null:
			continue
		style.content_margin_left = ORDER_POPUP_ACTION_PAD_H_PX
		style.content_margin_right = ORDER_POPUP_ACTION_PAD_H_PX
		style.shadow_size = 0
		style.shadow_offset = Vector2.ZERO
		btn.add_theme_stylebox_override(state, style)


func _order_stat_name_font_px() -> int:
	var scaled := _order_px(COMPANY_META_FONT_SIZE_PX)
	var width_safe := COMPANY_META_FONT_SIZE_PX + ORDER_POPUP_STAT_NAME_FONT_EXTRA_PX
	return mini(scaled, width_safe)


func _order_stat_name_column_width() -> int:
	var font := ClientUi.display_font()
	if font == null:
		font = ThemeDB.fallback_font
	var fs := _order_stat_name_font_px()
	var widest := 1
	for key in CompanyRules.STAT_KEYS:
		var w := int(font.get_string_size(CompanyRules.stat_label(key), HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x)
		widest = maxi(widest, w)
	return widest + ORDER_POPUP_STAT_NAME_COLUMN_PAD_PX


func _order_stat_icon_px() -> int:
	var scaled := _order_px(ORDER_POPUP_STAT_ICON_PX)
	var inner := (
		_order_stat_tile_slot_width()
		- _order_stat_tile_chrome_x()
		- _order_px(ORDER_POPUP_STAT_TILE_INNER_PAD_PX)
		- _order_px(ORDER_POPUP_STAT_TILE_INNER_PAD_PX)
	)
	return clampi(scaled, 1, maxi(1, inner))


func _order_stat_tile_style(bg: Color, border: Color) -> StyleBoxFlat:
	var style := ClientUi.painted_panel_style(
		bg,
		border,
		CARD_CORNER_RADIUS_PX,
		CARD_BORDER_WIDTH_PX
	).duplicate() as StyleBoxFlat
	style.content_margin_left = 0
	style.content_margin_right = 0
	style.content_margin_top = 0
	style.content_margin_bottom = 0
	style.shadow_size = 0
	style.shadow_offset = Vector2.ZERO
	return style


func _order_stat_tile_size() -> Vector2:
	var slot := _order_stat_tile_slot_width()
	var width := maxi(1, slot - _order_stat_tile_chrome_x())
	var pad := _order_px(ORDER_POPUP_STAT_TILE_INNER_PAD_PX)
	var sep := _order_px(CARD_INNER_SEPARATION_PX)
	var content_h := (
		pad
		+ pad
		+ _order_stat_icon_px()
		+ sep
		+ _order_px(TOKEN_CAPTION_FONT_SIZE_PX)
		+ sep
		+ _order_stat_name_font_px()
		+ _order_px(ORDER_POPUP_STAT_TILE_LABEL_ROOM_PX)
	)
	var height := maxi(content_h, _order_px(ORDER_POPUP_STAT_TILE_HEIGHT_PX)) + _order_px(ORDER_POPUP_STAT_TILE_HEIGHT_EXTRA_PX)
	return Vector2(width, height)


func _order_rarity_row(token: Dictionary, rarity: String, accent: Color) -> HBoxContainer:
	var row := _order_centered_row()
	row.add_child(_make_token_art(token, _order_px(ORDER_POPUP_TOKEN_ART_PX)))
	var rarity_lab := Label.new()
	rarity_lab.text = CompanyRules.rarity_label(rarity)
	rarity_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	rarity_lab.add_theme_font_size_override("font_size", _order_px(TOKEN_STATUS_FONT_SIZE_PX))
	rarity_lab.add_theme_color_override("font_color", ClientUi.GOLD if rarity == "epic" else accent)
	ClientUi.apply_display_font(rarity_lab)
	row.add_child(rarity_lab)
	return row


func _order_slot_row(row: Dictionary) -> HBoxContainer:
	var slot_row := _order_centered_row()
	var slots: Variant = row.get("slots", CompanyRules.slots_for(_order_company_id))
	if typeof(slots) == TYPE_ARRAY:
		for slot in slots:
			var sid := str(slot)
			var sbtn := Button.new()
			sbtn.text = CompanyRules.slot_label(sid)
			sbtn.toggle_mode = true
			sbtn.button_pressed = _chosen_slot == sid
			sbtn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			ClientUi.apply_accent_chip_button(sbtn)
			_order_apply_button_font(sbtn, ORDER_POPUP_SLOT_CHIP_FONT_SIZE_PX)
			sbtn.toggled.connect(func(on: bool) -> void:
				if _order_filling or not on:
					return
				_chosen_slot = sid
				_fill_order_body()
			)
			slot_row.add_child(sbtn)
	return slot_row


func _fill_epic_controls() -> void:
	if _order_body == null:
		return
	var primary := _active_class_primary_stat()
	var row := _order_centered_row()
	row.add_theme_constant_override("separation", ORDER_POPUP_STAT_ROW_SEPARATION_PX)
	row.add_child(_make_stat_tile(primary, true, true, ""))
	row.add_child(_make_stat_tile("vitality", true, true, ""))
	row.add_child(_make_stat_tile("luck", true, true, ""))
	_order_body.add_child(row)


func _fill_rare_controls() -> void:
	if _order_body == null:
		return
	var stat_row := _order_centered_row()
	stat_row.add_theme_constant_override("separation", ORDER_POPUP_STAT_ROW_SEPARATION_PX)
	_order_body.add_child(stat_row)
	for key in CompanyRules.STAT_KEYS:
		var selected := _rare_stats.has(key)
		var tile := _make_stat_tile(key, selected, false, "")
		if tile is Button:
			(tile as Button).pressed.connect(func() -> void:
				_toggle_rare_stat(key)
				_fill_order_body()
			)
		stat_row.add_child(tile)
	_weight_sliders.clear()
	_weight_labels.clear()
	if _rare_stats.size() != CompanyRules.RARE_COMMISSION_STAT_COUNT:
		return
	if _rare_weights.size() != CompanyRules.RARE_COMMISSION_STAT_COUNT:
		_rare_weights = _default_rare_weights()
	for i in range(_rare_stats.size()):
		_order_body.add_child(_make_rare_weight_row(i))


func _make_rare_weight_row(index: int) -> HBoxContainer:
	var stat := _rare_stats[index]
	var color: Color = GameData.STAT_COLORS.get(stat, ClientUi.CYAN)
	var row := _order_centered_row()
	row.add_child(StatIcon.make(stat, float(_order_stat_icon_px())))
	var name_lab := Label.new()
	name_lab.text = CompanyRules.stat_label(stat)
	name_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	name_lab.custom_minimum_size.x = _order_stat_name_column_width()
	name_lab.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	name_lab.add_theme_font_size_override("font_size", _order_stat_name_font_px())
	name_lab.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(name_lab)
	row.add_child(name_lab)
	var pct := Label.new()
	pct.custom_minimum_size.x = _order_px(ORDER_POPUP_STAT_TILE_WIDTH_PX / 2)
	pct.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	pct.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	pct.text = "%s%%" % _rare_weights[index]
	pct.add_theme_font_size_override("font_size", _order_stat_name_font_px())
	pct.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(pct)
	_weight_labels.append(pct)
	row.add_child(pct)
	var slider := HSlider.new()
	slider.mouse_filter = Control.MOUSE_FILTER_STOP
	slider.min_value = CompanyRules.RARE_WEIGHT_MIN_PERCENT
	slider.max_value = CompanyRules.RARE_WEIGHT_MAX_PERCENT
	slider.step = 1
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	slider.size_flags_stretch_ratio = 1.0
	row.add_child(slider)
	slider.set_value_no_signal(float(_rare_weights[index]))
	var captured := index
	slider.value_changed.connect(func(v: float) -> void:
		_adjust_rare_weight(captured, int(round(v)))
	)
	_weight_sliders.append(slider)
	return row


func _make_stat_tile(stat: String, selected: bool, locked: bool, caption: String) -> Control:
	var color: Color = GameData.STAT_COLORS.get(stat, ClientUi.CYAN)
	var tile_size := _order_stat_tile_size()
	var icon_px := _order_stat_icon_px()
	var name_fs := _order_stat_name_font_px()
	var caption_fs := _order_px(TOKEN_CAPTION_FONT_SIZE_PX)
	var inner_pad := _order_px(ORDER_POPUP_STAT_TILE_INNER_PAD_PX)
	var host: Control
	if locked:
		var panel := PanelContainer.new()
		panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
		panel.clip_contents = false
		panel.custom_minimum_size = tile_size
		panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		panel.add_theme_stylebox_override(
			"panel",
			_order_stat_tile_style(Color(color, 0.16), Color(color, 0.85))
		)
		host = panel
	else:
		var btn := Button.new()
		btn.toggle_mode = true
		btn.button_pressed = selected
		btn.clip_text = false
		btn.clip_contents = false
		btn.custom_minimum_size = tile_size
		btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		btn.add_theme_stylebox_override("normal", _order_stat_tile_style(
			Color(color, 0.28 if selected else 0.10),
			Color(color, 0.95 if selected else 0.40)
		))
		btn.add_theme_stylebox_override("hover", _order_stat_tile_style(
			Color(color, 0.34 if selected else 0.18),
			Color(color, 0.95)
		))
		btn.add_theme_stylebox_override("pressed", _order_stat_tile_style(
			Color(color, 0.28),
			Color(color, 0.95)
		))
		btn.add_theme_color_override("font_color", color)
		host = btn
	var inner := MarginContainer.new()
	inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inner.size_flags_vertical = Control.SIZE_EXPAND_FILL
	inner.add_theme_constant_override("margin_left", inner_pad)
	inner.add_theme_constant_override("margin_right", inner_pad)
	inner.add_theme_constant_override("margin_top", inner_pad)
	inner.add_theme_constant_override("margin_bottom", inner_pad + _order_px(ORDER_POPUP_STAT_TILE_BOTTOM_PAD_EXTRA_PX))
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", _order_px(CARD_INNER_SEPARATION_PX))
	col.add_child(StatIcon.make(stat, float(icon_px)))
	if not caption.is_empty():
		var cap := Label.new()
		cap.mouse_filter = Control.MOUSE_FILTER_IGNORE
		cap.text = caption
		cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cap.clip_text = false
		cap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cap.add_theme_font_size_override("font_size", caption_fs)
		cap.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(cap)
		col.add_child(cap)
	var name_lab := Label.new()
	name_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_lab.text = CompanyRules.stat_label(stat)
	name_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_lab.clip_text = false
	name_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_lab.add_theme_font_size_override("font_size", name_fs)
	name_lab.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(name_lab)
	col.add_child(name_lab)
	inner.add_child(col)
	host.add_child(inner)
	if host is Button:
		inner.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return host


func _active_class_primary_stat() -> String:
	if GameManager == null or typeof(GameManager.active_character) != TYPE_DICTIONARY:
		return "strength"
	var class_key := str(GameManager.active_character.get("class", "Vanguard"))
	var info := GameData.class_info(class_key)
	var primary := str(info.get("primaryStat", "strength")).strip_edges().to_lower()
	if not CompanyRules.STAT_KEYS.has(primary):
		return "strength"
	return primary


func _default_rare_weights() -> Array[int]:
	return [
		CompanyRules.RARE_WEIGHT_DEFAULT_HIGH_PERCENT,
		CompanyRules.RARE_WEIGHT_DEFAULT_HIGH_PERCENT,
		CompanyRules.RARE_WEIGHT_DEFAULT_LOW_PERCENT,
	]


func _toggle_rare_stat(stat: String) -> void:
	if _rare_stats.has(stat):
		_rare_stats.erase(stat)
		_rare_weights.clear()
		return
	if _rare_stats.size() >= CompanyRules.RARE_COMMISSION_STAT_COUNT:
		return
	_rare_stats.append(stat)
	if _rare_stats.size() == CompanyRules.RARE_COMMISSION_STAT_COUNT:
		_rare_weights = _default_rare_weights()


func _adjust_rare_weight(index: int, value: int) -> void:
	if _rare_weights.size() != CompanyRules.RARE_COMMISSION_STAT_COUNT:
		return
	if index < 0 or index >= _rare_weights.size():
		return
	_rare_weights[index] = clampi(
		value,
		CompanyRules.RARE_WEIGHT_MIN_PERCENT,
		CompanyRules.RARE_WEIGHT_MAX_PERCENT
	)
	if index < _weight_labels.size() and is_instance_valid(_weight_labels[index]):
		_weight_labels[index].text = "%s%%" % _rare_weights[index]
	_refresh_rare_total_ui()


func _rare_weight_sum() -> int:
	var sum := 0
	for w in _rare_weights:
		sum += w
	return sum


func _refresh_rare_total_ui() -> void:
	var sum := _rare_weight_sum()
	var exact := sum == CompanyRules.RARE_WEIGHT_TOTAL_PERCENT
	var color := ClientUi.SUCCESS if exact else ClientUi.DANGER
	if _rare_total_lab != null and is_instance_valid(_rare_total_lab):
		_rare_total_lab.text = ORDER_POPUP_RARE_TOTAL_COPY % sum
		_rare_total_lab.add_theme_color_override("font_color", color)
	if _rare_must_lab != null and is_instance_valid(_rare_must_lab):
		_rare_must_lab.add_theme_color_override("font_color", color)
	_sync_order_create_enabled()


func _sync_order_create_enabled() -> void:
	if _order_create_btn == null or not is_instance_valid(_order_create_btn):
		return
	_order_create_btn.disabled = _busy or _chosen_slot.is_empty() or (not _order_is_epic and not _rare_ready())


func _default_order_slot(company_id: String) -> String:
	var slots: Array = CompanyRules.slots_for(company_id)
	if slots.is_empty():
		return ""
	return str(slots[0])


func _rare_ready() -> bool:
	if _rare_stats.size() != CompanyRules.RARE_COMMISSION_STAT_COUNT:
		return false
	if _rare_weights.size() != CompanyRules.RARE_COMMISSION_STAT_COUNT:
		return false
	var sum := 0
	for w in _rare_weights:
		if w < CompanyRules.RARE_WEIGHT_MIN_PERCENT or w > CompanyRules.RARE_WEIGHT_MAX_PERCENT:
			return false
		sum += w
	return sum == CompanyRules.RARE_WEIGHT_TOTAL_PERCENT


func _find_token(row: Dictionary, token_id: String) -> Dictionary:
	for key in ["waiting_token", "overflow_token"]:
		var tok: Variant = row.get(key, null)
		if typeof(tok) == TYPE_DICTIONARY and str((tok as Dictionary).get("id", "")) == token_id:
			return tok as Dictionary
	return {}


func _on_redeem_pressed() -> void:
	if _busy or _chosen_slot.is_empty() or _spend_token_id.is_empty() or _order_company_id.is_empty():
		return
	var row := CompanyManager.company_row(_order_company_id)
	var token := _find_token(row, _spend_token_id)
	var rarity := str(token.get("rarity", "rare")).to_lower()
	var weights := {}
	if rarity != "epic":
		if not _rare_ready():
			_set_status("Choose three stats totaling 100%.")
			return
		for i in range(_rare_stats.size()):
			weights[_rare_stats[i]] = _rare_weights[i]
	if await InventoryManager.is_bag_full():
		var action := await InventoryManager.prompt_bag_pressure(self, ORDER_POPUP_BAG_FULL_COPY)
		if action == "shop" or action == "inventory":
			_close_order_popup()
		return
	_busy = true
	_set_status("Creating Commission item…")
	var company_id := _order_company_id
	var res: Dictionary = await CompanyManager.redeem_commission(
		company_id,
		_spend_token_id,
		_chosen_slot,
		weights
	)
	_busy = false
	if not res.ok:
		if InventoryManager.is_inventory_full_error(res):
			var action := await InventoryManager.prompt_bag_pressure(self, ORDER_POPUP_BAG_FULL_COPY)
			if action == "shop" or action == "inventory":
				_close_order_popup()
		else:
			_set_status(str(res.get("error", "Commission failed")))
		await CompanyManager.load_status()
		_refresh()
		return
	_close_order_popup()
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var item: Dictionary = data.get("item", {}) if typeof(data.get("item", {})) == TYPE_DICTIONARY else {}
	_set_status("Commission delivered: %s. It is in your backpack, unequipped." % str(item.get("name", "Gear")))
	await CompanyManager.load_status()
	_refresh()


func _order_popup_bg_file(company_id: String) -> String:
	match company_id:
		CompanyRules.COMPANY_ID_CNC:
			return ORDER_POPUP_BG_CNC
		CompanyRules.COMPANY_ID_BJS:
			return ORDER_POPUP_BG_BJS
		CompanyRules.COMPANY_ID_DTD:
			return ORDER_POPUP_BG_DTD
		CompanyRules.COMPANY_ID_GORP:
			return ORDER_POPUP_BG_GORP
		_:
			return BACKDROP_FILE


func _load_offices_texture(file_name: String) -> Texture2D:
	var rel := "res://Assets/Textures/%s" % file_name
	if ResourceLoader.exists(rel):
		var texture := load(rel) as Texture2D
		if texture != null:
			return texture
	var path := ProjectSettings.globalize_path(rel)
	if FileAccess.file_exists(path):
		var image := Image.load_from_file(path)
		if image != null and not image.is_empty():
			return ImageTexture.create_from_image(image)
	push_warning("Corporate Offices backdrop missing: %s" % rel)
	return null


func _set_status(text: String) -> void:
	if _status != null:
		_status.text = text
