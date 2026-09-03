extends Control
## Corporate Offices — company reputation, token storage, overflow resolution, and Commission tokens.

const BACKDROP_FILE := "corporate-offices-bg.png"
const OVERLAY_PANEL_FILL := Color(0.05, 0.06, 0.09, 0.78)
const OVERLAY_CARD_FILL := Color(0.06, 0.07, 0.11, 0.82)
const OVERLAY_CARD_FILL_IDLE := Color(0.05, 0.06, 0.09, 0.72)
const OVERLAY_HOVER_FILL := Color(0.08, 0.09, 0.14, 0.86)
const OVERLAY_PRESSED_FILL := Color(0.07, 0.08, 0.12, 0.86)
const OVERLAY_BANNER_FILL := Color(0.22, 0.12, 0.04, 0.82)
const OVERLAY_TOKEN_FILL := Color(0.07, 0.08, 0.12, 0.82)

var _status: Label
var _overflow_banner: PanelContainer
var _overflow_label: Label
var _company_row: HBoxContainer
var _commission_host: VBoxContainer
var _busy := false

var _selected_company := CompanyRules.COMPANY_ID_DTD
var _stage := "home"
var _spend_token_id := ""
var _chosen_slot := ""
var _rare_stats: Array[String] = []
var _rare_weights: Array[int] = []
var _weight_sliders: Array[HSlider] = []
var _weight_labels: Array[Label] = []


func _ready() -> void:
	clip_contents = true
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CompanyManager.companies_loaded.is_connected(_on_companies_loaded):
		CompanyManager.companies_loaded.connect(_on_companies_loaded)
	if not CompanyManager.company_error.is_connected(_on_company_error):
		CompanyManager.company_error.connect(_on_company_error)
	await _boot()


func on_shell_reshow() -> void:
	_busy = false
	_set_status("Restoring Corporate Offices…")
	await CompanyManager.load_status()
	_refresh()


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
	# Full-bleed offices art — no wash, dim, or page gutter over the photo.
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
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)

	var root := VBoxContainer.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 12)
	margin.add_child(root)

	var header := HBoxContainer.new()
	header.mouse_filter = Control.MOUSE_FILTER_IGNORE
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)
	var title_row := UiIcon.make_title_row("landmark", "Corporate Offices", ClientUi.TEXT, 27, 28.0)
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
		OVERLAY_BANNER_FILL, Color(ClientUi.WARNING, 0.7), 10, 1
	))
	root.add_child(_overflow_banner)
	var banner_pad := MarginContainer.new()
	banner_pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for k in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		banner_pad.add_theme_constant_override(k, 10)
	_overflow_banner.add_child(banner_pad)
	_overflow_label = Label.new()
	_overflow_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overflow_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_overflow_label.add_theme_font_size_override("font_size", 15)
	_overflow_label.add_theme_color_override("font_color", ClientUi.GOLD)
	ClientUi.apply_display_font(_overflow_label)
	banner_pad.add_child(_overflow_label)

	_company_row = HBoxContainer.new()
	_company_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_company_row.add_theme_constant_override("separation", 10)
	_company_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_child(_company_row)

	root.add_child(_make_column("Commissions", _build_commission_column))


func _make_column(title: String, fill: Callable) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		OVERLAY_PANEL_FILL, Color(0.35, 0.40, 0.48, 0.4), 14, 1
	))
	var pad := MarginContainer.new()
	pad.mouse_filter = Control.MOUSE_FILTER_PASS
	for k in ["margin_left", "margin_right"]:
		pad.add_theme_constant_override(k, 14)
	pad.add_theme_constant_override("margin_top", 12)
	pad.add_theme_constant_override("margin_bottom", 12)
	panel.add_child(pad)
	var col := VBoxContainer.new()
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 10)
	pad.add_child(col)
	var lab := Label.new()
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.text = title
	lab.add_theme_font_size_override("font_size", 18)
	lab.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	fill.call(col)
	return panel


func _build_commission_column(col: VBoxContainer) -> void:
	var scroll := ScrollContainer.new()
	scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	_commission_host = VBoxContainer.new()
	_commission_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_commission_host.add_theme_constant_override("separation", 8)
	scroll.add_child(_commission_host)


func _refresh() -> void:
	_refresh_companies()
	_refresh_overflow_banner()
	_refresh_commission()


func _refresh_companies() -> void:
	for child in _company_row.get_children():
		child.queue_free()
	for raw in CompanyManager.companies:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var card_row: Dictionary = raw
		_company_row.add_child(_make_company_card(card_row))
	if CompanyManager.company_row(_selected_company).is_empty() and not CompanyManager.companies.is_empty():
		var first_raw: Variant = CompanyManager.companies[0]
		if typeof(first_raw) == TYPE_DICTIONARY:
			_selected_company = str((first_raw as Dictionary).get("id", CompanyRules.COMPANY_ID_DTD))


func _make_company_card(row: Dictionary) -> Button:
	var cid := str(row.get("id", ""))
	var accent := CompanyRules.color_for(cid)
	var selected := cid == _selected_company
	var btn := Button.new()
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size.y = 148
	btn.mouse_filter = Control.MOUSE_FILTER_STOP
	btn.add_theme_stylebox_override("normal", ClientUi.painted_panel_style(
		OVERLAY_CARD_FILL if selected else OVERLAY_CARD_FILL_IDLE,
		Color(accent, 0.85 if selected else 0.4),
		12,
		2 if selected else 1
	))
	btn.add_theme_stylebox_override("hover", ClientUi.painted_panel_style(
		OVERLAY_HOVER_FILL, Color(accent, 0.8), 12, 2
	))
	btn.add_theme_stylebox_override("pressed", ClientUi.painted_panel_style(
		OVERLAY_PRESSED_FILL, Color(accent, 0.9), 12, 2
	))
	btn.pressed.connect(func() -> void:
		_selected_company = cid
		_stage = "home"
		_spend_token_id = ""
		_chosen_slot = ""
		_refresh()
	)

	var pad := MarginContainer.new()
	pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for k in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		pad.add_theme_constant_override(k, 10)
	btn.add_child(pad)
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_theme_constant_override("separation", 4)
	pad.add_child(col)

	var name_lab := Label.new()
	name_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_lab.text = "%s  %s" % [str(row.get("abbreviation", cid)), str(row.get("name", CompanyRules.display_name(cid)))]
	name_lab.add_theme_font_size_override("font_size", 15)
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
	slot_lab.add_theme_font_size_override("font_size", 12)
	slot_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	slot_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(slot_lab)

	var level := int(row.get("level", 0))
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
	meta.add_theme_font_size_override("font_size", 12)
	meta.add_theme_color_override("font_color", ClientUi.TEXT)
	col.add_child(meta)

	var bar := ProgressBar.new()
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.min_value = 0
	bar.max_value = need
	bar.value = into
	bar.show_percentage = false
	bar.custom_minimum_size.y = 8
	ClientUi.apply_hp_bar(bar, accent)
	col.add_child(bar)

	var token: Variant = row.get("waiting_token", null)
	var token_lab := Label.new()
	if bool(row.get("overflow_pending", false)):
		token_lab.text = "Overflow — choose a token"
		token_lab.add_theme_color_override("font_color", ClientUi.WARNING)
	elif typeof(token) == TYPE_DICTIONARY and not (token as Dictionary).is_empty():
		token_lab.text = "Waiting %s token" % CompanyRules.rarity_label(str((token as Dictionary).get("rarity", "")))
		token_lab.add_theme_color_override("font_color", ClientUi.GOLD)
	else:
		token_lab.text = "No waiting token"
		token_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	token_lab.add_theme_font_size_override("font_size", 12)
	col.add_child(token_lab)
	return btn


func _refresh_overflow_banner() -> void:
	var pending: Array = []
	for cid in CompanyManager.overflow_companies:
		pending.append(CompanyRules.abbreviation(str(cid)))
	_overflow_banner.visible = not pending.is_empty()
	if pending.is_empty():
		return
	_overflow_label.text = "Unresolved token overflow: %s. Choose which Commission to keep before sending more return shipments for that Company from the Black Market." % ", ".join(pending)


func _refresh_commission() -> void:
	for child in _commission_host.get_children():
		child.queue_free()
	var row := CompanyManager.company_row(_selected_company)
	if row.is_empty():
		return
	if bool(row.get("overflow_pending", false)) and _stage != "commission":
		_fill_overflow(row)
		return
	if _stage == "commission":
		_fill_commission_config(row)
		return
	_fill_waiting_token(row)


func _fill_waiting_token(row: Dictionary) -> void:
	var waiting: Variant = row.get("waiting_token", null)
	if typeof(waiting) != TYPE_DICTIONARY or waiting.is_empty():
		var empty := Label.new()
		empty.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		empty.text = "No waiting Commission token. Each successful return Shipment from the Black Market grants +%s reputation. A Company level every %s reputation awards one token." % [
			CompanyRules.SHIPMENT_REPUTATION_REWARD,
			CompanyRules.COMPANY_REPUTATION_PER_LEVEL,
		]
		empty.add_theme_color_override("font_color", ClientUi.MUTED)
		_commission_host.add_child(empty)
		return
	_commission_host.add_child(_token_card(waiting, "Waiting token"))
	var hint := Label.new()
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.text = "Redeem when you want the item. Tokens do not use backpack space until you confirm. A full backpack rejects creation and keeps the token."
	hint.add_theme_color_override("font_color", ClientUi.MUTED)
	_commission_host.add_child(hint)
	var redeem := Button.new()
	redeem.text = "Configure Commission"
	ClientUi.apply_accent_chip_button(redeem)
	redeem.pressed.connect(func() -> void:
		_spend_token_id = str(waiting.get("id", ""))
		_chosen_slot = ""
		_rare_stats.clear()
		_rare_weights.clear()
		_stage = "commission"
		_refresh_commission()
	)
	_commission_host.add_child(redeem)


func _fill_overflow(row: Dictionary) -> void:
	var waiting: Variant = row.get("waiting_token", null)
	var overflow: Variant = row.get("overflow_token", null)
	var title := Label.new()
	title.text = "Choose which token to spend. The other remains waiting. Opening this choice does not spend either token."
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.add_theme_color_override("font_color", ClientUi.GOLD)
	_commission_host.add_child(title)
	if typeof(waiting) == TYPE_DICTIONARY:
		_commission_host.add_child(_token_card(waiting, "Current waiting token"))
		var spend_old := Button.new()
		spend_old.text = "Spend waiting token — keep the new one"
		ClientUi.apply_accent_chip_button(spend_old)
		spend_old.pressed.connect(func() -> void:
			_begin_commission_from_token(waiting)
		)
		_commission_host.add_child(spend_old)
	if typeof(overflow) == TYPE_DICTIONARY:
		_commission_host.add_child(_token_card(overflow, "Newly earned token"))
		var spend_new := Button.new()
		spend_new.text = "Spend new token — keep the waiting one"
		ClientUi.apply_accent_chip_button(spend_new)
		spend_new.pressed.connect(func() -> void:
			_begin_commission_from_token(overflow)
		)
		_commission_host.add_child(spend_new)
	var cancel := Button.new()
	cancel.text = "Decide later"
	cancel.pressed.connect(func() -> void:
		_stage = "home"
		_spend_token_id = ""
		_refresh()
	)
	_commission_host.add_child(cancel)


func _begin_commission_from_token(token: Variant) -> void:
	if typeof(token) != TYPE_DICTIONARY:
		return
	_spend_token_id = str(token.get("id", ""))
	_chosen_slot = ""
	_rare_stats.clear()
	_rare_weights.clear()
	_stage = "commission"
	_refresh_commission()


func _token_card(token: Variant, caption: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		OVERLAY_TOKEN_FILL, Color(ClientUi.GOLD, 0.45), 10, 1
	))
	var pad := MarginContainer.new()
	for k in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		pad.add_theme_constant_override(k, 10)
	panel.add_child(pad)
	var lab := Label.new()
	if typeof(token) == TYPE_DICTIONARY:
		lab.text = "%s\n%s %s token from Company level %s" % [
			caption,
			CompanyRules.abbreviation(str(token.get("company_id", _selected_company))),
			CompanyRules.rarity_label(str(token.get("rarity", "rare"))),
			int(token.get("awarded_level", 1)),
		]
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.add_theme_color_override("font_color", ClientUi.TEXT)
	pad.add_child(lab)
	return panel


func _fill_commission_config(row: Dictionary) -> void:
	var token := _find_token(row, _spend_token_id)
	if token.is_empty():
		_stage = "home"
		_fill_waiting_token(row)
		return
	var rarity := str(token.get("rarity", "rare")).to_lower()
	var back := Button.new()
	back.text = "Back — keep both tokens"
	back.pressed.connect(func() -> void:
		_stage = "home"
		_spend_token_id = ""
		_chosen_slot = ""
		_refresh_commission()
	)
	_commission_host.add_child(back)
	_commission_host.add_child(_token_card(token, "Spending this token"))

	var slot_lab := Label.new()
	slot_lab.text = "Choose one slot this Company manufactures."
	slot_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	_commission_host.add_child(slot_lab)
	var slot_row := HBoxContainer.new()
	slot_row.add_theme_constant_override("separation", 6)
	_commission_host.add_child(slot_row)
	var slots: Variant = row.get("slots", CompanyRules.slots_for(_selected_company))
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
				_refresh_commission()
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
		_commission_host.add_child(epic)
	else:
		_fill_rare_controls()

	var warn := Label.new()
	warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warn.text = "Confirming consumes the token and delivers one unequipped Gear item to your backpack. A full backpack rejects this and keeps the token."
	warn.add_theme_color_override("font_color", ClientUi.WARNING)
	_commission_host.add_child(warn)
	var go := Button.new()
	go.text = "Create Commission item"
	go.disabled = _busy or _chosen_slot.is_empty() or (rarity != "epic" and not _rare_ready())
	ClientUi.apply_accent_chip_button(go)
	go.pressed.connect(_on_redeem_pressed)
	_commission_host.add_child(go)


func _fill_rare_controls() -> void:
	var intro := Label.new()
	intro.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	intro.text = "Pick any three stats. Each must be between %s%% and %s%%, in whole percents, totaling %s%%." % [
		CompanyRules.RARE_WEIGHT_MIN_PERCENT,
		CompanyRules.RARE_WEIGHT_MAX_PERCENT,
		CompanyRules.RARE_WEIGHT_TOTAL_PERCENT,
	]
	intro.add_theme_color_override("font_color", ClientUi.TEXT)
	_commission_host.add_child(intro)
	var stat_row := HBoxContainer.new()
	stat_row.add_theme_constant_override("separation", 6)
	_commission_host.add_child(stat_row)
	for key in CompanyRules.STAT_KEYS:
		var sbtn := Button.new()
		sbtn.text = CompanyRules.stat_label(key)
		sbtn.toggle_mode = true
		sbtn.button_pressed = _rare_stats.has(key)
		ClientUi.apply_accent_chip_button(sbtn)
		sbtn.pressed.connect(func() -> void:
			_toggle_rare_stat(key)
			_refresh_commission()
		)
		stat_row.add_child(sbtn)
	_weight_sliders.clear()
	_weight_labels.clear()
	if _rare_stats.size() == CompanyRules.RARE_COMMISSION_STAT_COUNT:
		if _rare_weights.size() != CompanyRules.RARE_COMMISSION_STAT_COUNT:
			_rare_weights = [40, 40, 20]
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
			_commission_host.add_child(wrap)


func _toggle_rare_stat(stat: String) -> void:
	if _rare_stats.has(stat):
		_rare_stats.erase(stat)
		_rare_weights.clear()
		return
	if _rare_stats.size() >= CompanyRules.RARE_COMMISSION_STAT_COUNT:
		return
	_rare_stats.append(stat)
	if _rare_stats.size() == CompanyRules.RARE_COMMISSION_STAT_COUNT:
		_rare_weights = [40, 40, 20]


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
	if _busy or _chosen_slot.is_empty() or _spend_token_id.is_empty():
		return
	var row := CompanyManager.company_row(_selected_company)
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
	var res: Dictionary = await CompanyManager.redeem_commission(
		_selected_company,
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
	_stage = "home"
	_spend_token_id = ""
	_chosen_slot = ""
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
