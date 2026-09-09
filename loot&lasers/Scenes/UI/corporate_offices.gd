extends Control
## Corporate Offices — company reputation, token storage, overflow resolution, and Commission tokens.

const BACKDROP_FILE := "corporate-offices-bg.png"
const OVERLAY_PANEL_FILL := Color(0.05, 0.06, 0.09, 0.78)
const OVERLAY_CARD_FILL := Color(0.06, 0.07, 0.11, 0.82)
const OVERLAY_BANNER_FILL := Color(0.22, 0.12, 0.04, 0.82)
const OVERLAY_TOKEN_FILL := Color(0.07, 0.08, 0.12, 0.82)
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
const BANNER_PAD_PX := 10
const BANNER_FONT_SIZE_PX := 15
const BANNER_CORNER_RADIUS_PX := 10
const TITLE_FONT_SIZE_PX := 27
const TITLE_ICON_SIZE_PX := 28
const COMPANY_NAME_FONT_SIZE_PX := 16
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
const ORDER_POPUP_WIDTH_PX := 640
const ORDER_POPUP_MAX_HEIGHT_NUMERATOR := 70
const ORDER_POPUP_MAX_HEIGHT_DENOMINATOR := 100
const ORDER_POPUP_Z_INDEX := 140
const ORDER_POPUP_CORNER_RADIUS_PX := 14
const ORDER_POPUP_BORDER_WIDTH_PX := 2
const ORDER_POPUP_PAD_H_PX := 18
const ORDER_POPUP_PAD_V_PX := 16
const ORDER_POPUP_FADE_MS := 180
const MILLISECONDS_PER_SECOND := 1000
const EMPTY_TOKEN_COPY := "No Stored Token"
const REDEEM_BUTTON_LABEL := "Redeem"
const ORDER_POPUP_HEADING := "Order Commission"

var _status: Label
var _page_header: HBoxContainer
var _overflow_banner: PanelContainer
var _overflow_label: Label
var _company_row: HBoxContainer
var _busy := false

var _order_company_id := ""
var _spend_token_id := ""
var _chosen_slot := ""
var _rare_stats: Array[String] = []
var _rare_weights: Array[int] = []
var _weight_sliders: Array[HSlider] = []
var _weight_labels: Array[Label] = []
var _order_overlay: Control
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

	_overflow_banner = PanelContainer.new()
	_overflow_banner.visible = false
	_overflow_banner.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		OVERLAY_BANNER_FILL, Color(ClientUi.WARNING, 0.7), BANNER_CORNER_RADIUS_PX, CARD_BORDER_WIDTH_PX
	))
	root.add_child(_overflow_banner)
	var banner_pad := MarginContainer.new()
	banner_pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for k in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		banner_pad.add_theme_constant_override(k, BANNER_PAD_PX)
	_overflow_banner.add_child(banner_pad)
	_overflow_label = Label.new()
	_overflow_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overflow_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_overflow_label.add_theme_font_size_override("font_size", BANNER_FONT_SIZE_PX)
	_overflow_label.add_theme_color_override("font_color", ClientUi.GOLD)
	ClientUi.apply_display_font(_overflow_label)
	banner_pad.add_child(_overflow_label)

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
	_refresh_overflow_banner()
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
	name_lab.text = "%s  %s" % [str(row.get("abbreviation", cid)), str(row.get("name", CompanyRules.display_name(cid)))]
	name_lab.add_theme_font_size_override("font_size", _pane_chrome_px(COMPANY_NAME_FONT_SIZE_PX))
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
	mid.add_child(_make_token_art(waiting if _is_token(waiting) else overflow_token))
	col.add_child(mid)

	var status := Label.new()
	status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.add_theme_font_size_override("font_size", _pane_chrome_px(TOKEN_STATUS_FONT_SIZE_PX))
	ClientUi.apply_display_font(status)
	if overflow:
		status.text = "Overflow — choose a token"
		status.add_theme_color_override("font_color", ClientUi.WARNING)
	elif _is_token(waiting):
		status.text = "Waiting %s token" % _token_rarity_label(waiting)
		status.add_theme_color_override("font_color", ClientUi.GOLD)
	else:
		status.text = EMPTY_TOKEN_COPY
		status.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(status)

	var ordering := has_overlay()
	if overflow:
		if _is_token(waiting):
			col.add_child(_pane_action_button(
				"Redeem waiting — keep new",
				accent,
				not _busy and not ordering,
				func() -> void: _begin_order(cid, waiting)
			))
		if _is_token(overflow_token):
			col.add_child(_pane_action_button(
				"Redeem new — keep waiting",
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


func _make_token_art(token: Variant) -> TextureRect:
	var tex := TextureRect.new()
	tex.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tex.texture = _token_art_texture(token)
	var side := _token_art_side_px()
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


func _refresh_overflow_banner() -> void:
	var pending: Array = []
	for cid in CompanyManager.overflow_companies:
		pending.append(CompanyRules.abbreviation(str(cid)))
	_overflow_banner.visible = not pending.is_empty()
	if pending.is_empty():
		return
	_overflow_label.text = "Unresolved token overflow: %s. Redeem one token for that Company before sending it more return shipments. Other companies can still earn and store their own token." % ", ".join(pending)


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
	if _overflow_banner != null and _overflow_banner.visible:
		used += int(_overflow_banner.get_combined_minimum_size().y) + ROOT_SEPARATION_PX
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
	_chosen_slot = ""
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

	var card := PanelContainer.new()
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	card.custom_minimum_size.x = ORDER_POPUP_WIDTH_PX
	card.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(
			Color(0.045, 0.05, 0.085, 0.98),
			Color(CompanyRules.color_for(_order_company_id), 0.65),
			ORDER_POPUP_CORNER_RADIUS_PX,
			ORDER_POPUP_BORDER_WIDTH_PX
		)
	)
	center.add_child(card)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", ORDER_POPUP_PAD_H_PX)
	margin.add_theme_constant_override("margin_right", ORDER_POPUP_PAD_H_PX)
	margin.add_theme_constant_override("margin_top", ORDER_POPUP_PAD_V_PX)
	margin.add_theme_constant_override("margin_bottom", ORDER_POPUP_PAD_V_PX)
	card.add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(
		ORDER_POPUP_WIDTH_PX - ORDER_POPUP_PAD_H_PX - ORDER_POPUP_PAD_H_PX,
		_order_popup_max_body_height()
	)
	margin.add_child(scroll)

	_order_body = VBoxContainer.new()
	_order_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_order_body.add_theme_constant_override("separation", CARD_INNER_SEPARATION_PX)
	scroll.add_child(_order_body)

	add_child(_order_overlay)
	_fill_order_body()
	_refresh_companies()
	card.modulate.a = 0.0
	var tween := card.create_tween()
	tween.tween_property(card, "modulate:a", 1.0, float(ORDER_POPUP_FADE_MS) / float(MILLISECONDS_PER_SECOND)).set_ease(Tween.EASE_OUT)


func _order_popup_max_body_height() -> int:
	var window_h := int(get_viewport().get_visible_rect().size.y)
	return maxi(1, (window_h * ORDER_POPUP_MAX_HEIGHT_NUMERATOR) / ORDER_POPUP_MAX_HEIGHT_DENOMINATOR)


func _close_order_popup() -> void:
	if _order_overlay != null and is_instance_valid(_order_overlay):
		_order_overlay.queue_free()
	_order_overlay = null
	_order_body = null
	_order_company_id = ""
	_spend_token_id = ""
	_chosen_slot = ""
	_rare_stats.clear()
	_rare_weights.clear()
	_weight_sliders.clear()
	_weight_labels.clear()
	if is_inside_tree():
		_refresh_companies()


func _fill_order_body() -> void:
	if _order_body == null:
		return
	for child in _order_body.get_children():
		child.queue_free()
	var row := CompanyManager.company_row(_order_company_id)
	var token := _find_token(row, _spend_token_id)
	if token.is_empty():
		_close_order_popup()
		return
	var rarity := str(token.get("rarity", "rare")).to_lower()
	var accent := CompanyRules.color_for(_order_company_id)

	var eyebrow := Label.new()
	eyebrow.text = CompanyRules.abbreviation(_order_company_id)
	eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	eyebrow.add_theme_font_size_override("font_size", COMPANY_META_FONT_SIZE_PX)
	eyebrow.add_theme_color_override("font_color", Color(accent, 0.85))
	ClientUi.apply_display_font(eyebrow)
	_order_body.add_child(eyebrow)

	var heading := Label.new()
	heading.text = ORDER_POPUP_HEADING
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", TITLE_FONT_SIZE_PX)
	heading.add_theme_color_override("font_color", accent)
	ClientUi.apply_display_font(heading)
	_order_body.add_child(heading)

	_order_body.add_child(_token_card(token, "Spending this token"))

	var slot_lab := Label.new()
	slot_lab.text = "Choose one slot this Company manufactures."
	slot_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	slot_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_order_body.add_child(slot_lab)
	var slot_row := HFlowContainer.new()
	slot_row.add_theme_constant_override("h_separation", PANE_ROW_SEPARATION_PX)
	slot_row.add_theme_constant_override("v_separation", PANE_ROW_SEPARATION_PX)
	_order_body.add_child(slot_row)
	var slots: Variant = row.get("slots", CompanyRules.slots_for(_order_company_id))
	if typeof(slots) == TYPE_ARRAY:
		for slot in slots:
			var sid := str(slot)
			var sbtn := Button.new()
			sbtn.text = CompanyRules.slot_label(sid)
			sbtn.toggle_mode = true
			sbtn.button_pressed = _chosen_slot == sid
			ClientUi.apply_accent_chip_button(sbtn)
			sbtn.pressed.connect(func() -> void:
				_chosen_slot = sid
				_fill_order_body()
			)
			slot_row.add_child(sbtn)

	if rarity == "epic":
		var epic := Label.new()
		epic.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		epic.text = "Epic Commissions always roll Class Primary, Vitality, and Luck. Bases are %s / %s / %s. The remaining %s is split at random among those three. Off-stats stay at zero. The server rolls this; you cannot submit the result." % [
			CompanyRules.EPIC_PRIMARY_PERCENT,
			CompanyRules.EPIC_VITALITY_PERCENT,
			CompanyRules.EPIC_LUCK_PERCENT,
			CompanyRules.EPIC_RANDOM_REMAINDER_PERCENT,
		]
		epic.add_theme_color_override("font_color", ClientUi.TEXT)
		_order_body.add_child(epic)
	else:
		_fill_rare_controls()

	var warn := Label.new()
	warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warn.text = "Confirming consumes the token and delivers one unequipped Gear item to your backpack. A full backpack rejects this and keeps the token."
	warn.add_theme_color_override("font_color", ClientUi.WARNING)
	_order_body.add_child(warn)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", PANE_ROW_SEPARATION_PX)
	_order_body.add_child(actions)
	var cancel := Button.new()
	cancel.text = "Cancel — keep token"
	cancel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(cancel)
	cancel.pressed.connect(_close_order_popup)
	actions.add_child(cancel)
	var go := Button.new()
	go.text = "Create Commission item"
	go.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	go.disabled = _busy or _chosen_slot.is_empty() or (rarity != "epic" and not _rare_ready())
	ClientUi.apply_tinted_painted_button(go, accent)
	go.pressed.connect(_on_redeem_pressed)
	actions.add_child(go)


func _token_card(token: Variant, caption: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		OVERLAY_TOKEN_FILL, Color(ClientUi.GOLD, 0.45), BANNER_CORNER_RADIUS_PX, CARD_BORDER_WIDTH_PX
	))
	var pad := MarginContainer.new()
	for k in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		pad.add_theme_constant_override(k, CARD_PAD_PX)
	panel.add_child(pad)
	var lab := Label.new()
	if _is_token(token):
		lab.text = "%s\n%s %s token from Company level %s" % [
			caption,
			CompanyRules.abbreviation(str((token as Dictionary).get("company_id", _order_company_id))),
			_token_rarity_label(token),
			int((token as Dictionary).get("awarded_level", 1)),
		]
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.add_theme_color_override("font_color", ClientUi.TEXT)
	pad.add_child(lab)
	return panel


func _fill_rare_controls() -> void:
	if _order_body == null:
		return
	var intro := Label.new()
	intro.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	intro.text = "Pick any three stats. Each must be between %s%% and %s%%, in whole percents, totaling %s%%." % [
		CompanyRules.RARE_WEIGHT_MIN_PERCENT,
		CompanyRules.RARE_WEIGHT_MAX_PERCENT,
		CompanyRules.RARE_WEIGHT_TOTAL_PERCENT,
	]
	intro.add_theme_color_override("font_color", ClientUi.TEXT)
	_order_body.add_child(intro)
	var stat_row := HFlowContainer.new()
	stat_row.add_theme_constant_override("h_separation", PANE_ROW_SEPARATION_PX)
	stat_row.add_theme_constant_override("v_separation", PANE_ROW_SEPARATION_PX)
	_order_body.add_child(stat_row)
	for key in CompanyRules.STAT_KEYS:
		var sbtn := Button.new()
		sbtn.text = CompanyRules.stat_label(key)
		sbtn.toggle_mode = true
		sbtn.button_pressed = _rare_stats.has(key)
		ClientUi.apply_accent_chip_button(sbtn)
		sbtn.pressed.connect(func() -> void:
			_toggle_rare_stat(key)
			_fill_order_body()
		)
		stat_row.add_child(sbtn)
	_weight_sliders.clear()
	_weight_labels.clear()
	if _rare_stats.size() == CompanyRules.RARE_COMMISSION_STAT_COUNT:
		if _rare_weights.size() != CompanyRules.RARE_COMMISSION_STAT_COUNT:
			_rare_weights = _default_rare_weights()
		for i in range(_rare_stats.size()):
			var wrap := VBoxContainer.new()
			var lab := Label.new()
			lab.text = "%s  %s%%" % [CompanyRules.stat_label(_rare_stats[i]), _rare_weights[i]]
			_weight_labels.append(lab)
			wrap.add_child(lab)
			var slider := HSlider.new()
			slider.mouse_filter = Control.MOUSE_FILTER_STOP
			slider.min_value = CompanyRules.RARE_WEIGHT_MIN_PERCENT
			slider.max_value = CompanyRules.RARE_WEIGHT_MAX_PERCENT
			slider.step = 1
			slider.value = _rare_weights[i]
			slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var captured := i
			slider.value_changed.connect(func(v: float) -> void:
				_adjust_rare_weight(captured, int(round(v)))
			)
			_weight_sliders.append(slider)
			wrap.add_child(slider)
			_order_body.add_child(wrap)


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
	var lo := CompanyRules.RARE_WEIGHT_MIN_PERCENT
	var hi := CompanyRules.RARE_WEIGHT_MAX_PERCENT
	var total := CompanyRules.RARE_WEIGHT_TOTAL_PERCENT
	value = clampi(value, lo, hi)
	var others: Array[int] = []
	for i in range(_rare_weights.size()):
		if i != index:
			others.append(i)
	var leftover := total - value
	var a: int = others[0]
	var b: int = others[1]
	var a_val := clampi(_rare_weights[a], lo, hi)
	var b_val := leftover - a_val
	if b_val < lo:
		b_val = lo
		a_val = leftover - b_val
	if b_val > hi:
		b_val = hi
		a_val = leftover - b_val
	a_val = clampi(a_val, lo, hi)
	b_val = leftover - a_val
	_rare_weights[index] = value
	_rare_weights[a] = a_val
	_rare_weights[b] = b_val
	for i in range(_weight_sliders.size()):
		if is_instance_valid(_weight_sliders[i]):
			_weight_sliders[i].set_value_no_signal(float(_rare_weights[i]))
		if i < _weight_labels.size() and is_instance_valid(_weight_labels[i]):
			_weight_labels[i].text = "%s  %s%%" % [CompanyRules.stat_label(_rare_stats[i]), _rare_weights[i]]


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
		var code := str(res.get("code", ""))
		if code == "INVENTORY_FULL":
			_set_status("Backpack full. Sell or equip something first. Your token was not spent.")
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
