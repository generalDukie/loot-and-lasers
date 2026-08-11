extends Control
## Character select — large operative roster (logic unchanged).

const MAX_SLOTS := 3

var _list: HBoxContainer
var _status: Label
var _loading_host: Control
var _main_host: Control
var _welcome: Label
var _busy := false
var _switching := false
var _characters: Array = []
var _selected_id := ""
var _active_id := ""
var _enter_btn: Button
var _create_btn: Button
var _unlock_btn: Button
var _card_buttons: Dictionary = {} # id -> Button


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	await _refresh()


func _input(event: InputEvent) -> void:
	if _busy or _switching or not _main_host.visible or _characters.is_empty():
		return
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	var key := event as InputEventKey
	match key.keycode:
		KEY_LEFT, KEY_UP:
			_move_selection(-1)
			get_viewport().set_input_as_handled()
		KEY_RIGHT, KEY_DOWN:
			_move_selection(1)
			get_viewport().set_input_as_handled()
		KEY_ENTER, KEY_KP_ENTER:
			var focus := get_viewport().gui_get_focus_owner()
			if focus == _create_btn or focus == _unlock_btn:
				return
			_enter_selected()
			get_viewport().set_input_as_handled()


func _move_selection(delta: int) -> void:
	if _characters.is_empty():
		return
	var ids: Array[String] = []
	for c in _characters:
		if typeof(c) == TYPE_DICTIONARY:
			var cid := str(c.get("id", ""))
			if not cid.is_empty():
				ids.append(cid)
	if ids.is_empty():
		return
	var idx := ids.find(_selected_id)
	if idx < 0:
		idx = 0
	else:
		idx = clampi(idx + delta, 0, ids.size() - 1)
	_select_card(ids[idx])
	var card: Variant = _card_buttons.get(ids[idx], null)
	if card is Control:
		(card as Control).grab_focus()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_update_slot_actions()


func _build() -> void:
	add_child(ClientUi.make_screen("void"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 36)
	margin.add_theme_constant_override("margin_right", 36)
	margin.add_theme_constant_override("margin_top", 28)
	margin.add_theme_constant_override("margin_bottom", 28)
	add_child(margin)

	var stage := VBoxContainer.new()
	stage.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	stage.alignment = BoxContainer.ALIGNMENT_CENTER
	stage.add_theme_constant_override("separation", 0)
	margin.add_child(stage)

	_loading_host = VBoxContainer.new()
	_loading_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_loading_host.alignment = BoxContainer.ALIGNMENT_CENTER
	_loading_host.add_theme_constant_override("separation", 16)
	stage.add_child(_loading_host)
	var load_title := ClientUi.make_title("LOOT & LASERS", 32)
	load_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading_host.add_child(load_title)
	var spinner_host := CenterContainer.new()
	spinner_host.custom_minimum_size = Vector2(48, 48)
	_loading_host.add_child(spinner_host)
	spinner_host.add_child(UiIcon.make("loader-circle", ClientUi.CYAN, 40.0))

	_main_host = VBoxContainer.new()
	_main_host.visible = false
	_main_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_main_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_main_host.add_theme_constant_override("separation", 16)
	stage.add_child(_main_host)

	var head := VBoxContainer.new()
	head.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	head.add_theme_constant_override("separation", 6)
	_main_host.add_child(head)
	var title := ClientUi.make_title("SELECT YOUR OPERATIVE", 34)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	head.add_child(title)
	_welcome = Label.new()
	_welcome.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_welcome.add_theme_font_size_override("font_size", 18)
	_welcome.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_welcome)
	head.add_child(_welcome)

	_list = HBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_list.alignment = BoxContainer.ALIGNMENT_CENTER
	_list.add_theme_constant_override("separation", 20)
	_main_host.add_child(_list)

	_status = ClientUi.make_status()
	_status.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_main_host.add_child(_status)

	var row := HBoxContainer.new()
	row.size_flags_vertical = Control.SIZE_SHRINK_END
	row.add_theme_constant_override("separation", 12)
	_main_host.add_child(row)

	var logout_btn := Button.new()
	logout_btn.text = "Log out"
	logout_btn.custom_minimum_size = Vector2(140, 48)
	ClientUi.apply_ghost_button(logout_btn)
	logout_btn.pressed.connect(_on_logout)
	row.add_child(logout_btn)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)

	_unlock_btn = Button.new()
	_unlock_btn.text = "Unlock Slot · %s" % AccountManager.SLOT_NOVA_COST
	CurrencyIcon.apply_button_cost(_unlock_btn, 16.0)
	_unlock_btn.custom_minimum_size = Vector2(220, 52)
	_apply_accent_button(_unlock_btn)
	_unlock_btn.pressed.connect(_on_unlock_slot)
	row.add_child(_unlock_btn)

	_create_btn = Button.new()
	_create_btn.text = "CREATE NEW OPERATIVE"
	_create_btn.custom_minimum_size = Vector2(280, 52)
	_apply_accent_button(_create_btn)
	UiIcon.apply_leading_icon(_create_btn, "plus", ClientUi.VIOLET.lightened(0.35), 18.0)
	_create_btn.pressed.connect(_on_create_pressed)
	row.add_child(_create_btn)

	_enter_btn = Button.new()
	_enter_btn.text = "PLAY"
	_enter_btn.custom_minimum_size = Vector2(260, 62)
	ClientUi.apply_primary_button(_enter_btn)
	_enter_btn.add_theme_font_size_override("font_size", 22)
	_enter_btn.pressed.connect(_enter_selected)
	row.add_child(_enter_btn)


func _apply_accent_button(btn: Button) -> void:
	var n := StyleBoxFlat.new()
	n.bg_color = Color(ClientUi.VIOLET, 0.18)
	n.set_border_width_all(2)
	n.border_color = Color(ClientUi.VIOLET, 0.62)
	n.set_corner_radius_all(10)
	n.content_margin_left = 18
	n.content_margin_right = 18
	n.content_margin_top = 10
	n.content_margin_bottom = 10
	n.shadow_color = Color(ClientUi.VIOLET, 0.22)
	n.shadow_size = 8
	n.shadow_offset = Vector2(0, 2)
	var h := n.duplicate() as StyleBoxFlat
	h.bg_color = Color(ClientUi.VIOLET, 0.32)
	h.border_color = ClientUi.VIOLET.lightened(0.12)
	btn.add_theme_stylebox_override("normal", n)
	btn.add_theme_stylebox_override("hover", h)
	btn.add_theme_stylebox_override("pressed", h)
	btn.add_theme_stylebox_override("disabled", n)
	btn.add_theme_color_override("font_color", ClientUi.VIOLET.lightened(0.28))
	btn.add_theme_color_override("font_hover_color", ClientUi.TEXT)
	btn.add_theme_font_size_override("font_size", 16)
	ClientUi.apply_display_font(btn)
	ClientUi.apply_interaction_motion(btn, 1.02)


func _welcome_name() -> String:
	var full := str(AuthManager.user.get("full_name", "")).strip_edges()
	if not full.is_empty():
		return full
	var email := str(AuthManager.user.get("email", "")).strip_edges()
	if not email.is_empty():
		return email
	return "commander"


func _refresh() -> void:
	if _busy:
		return
	_busy = true
	_loading_host.visible = true
	_main_host.visible = false
	_status.text = ""
	_clear_roster()

	var me: Dictionary = await AuthManager.fetch_me()
	if not me.ok:
		_busy = false
		_loading_host.visible = false
		_main_host.visible = true
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = str(me.get("error", "Could not load profile"))
		return

	var res: Dictionary = await AuthManager.list_characters()
	_busy = false
	if not res.ok:
		_loading_host.visible = false
		_main_host.visible = true
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = str(res.get("error", "Could not list characters"))
		return

	_characters = res.data if typeof(res.data) == TYPE_ARRAY else []
	if _characters.is_empty():
		if AuthManager.has_node_gameplay_session():
			GameManager.go_character_create()
			return
		_loading_host.visible = false
		_main_host.visible = true
		_welcome.text = "Welcome, %s" % _welcome_name()
		_status.add_theme_color_override("font_color", ClientUi.MUTED)
		_status.text = "No operatives yet. Re-login if Character APIs failed to bridge."
		_create_btn.disabled = false
		_enter_btn.disabled = true
		_unlock_btn.visible = false
		_rebuild_roster()
		return

	_loading_host.visible = false
	_main_host.visible = true
	_welcome.text = "Welcome back, %s — choose who deploys." % _welcome_name()

	_active_id = str(AuthManager.user.get("active_character_id", ""))
	_selected_id = _active_id
	if _selected_id.is_empty():
		_selected_id = str(_characters[0].get("id", ""))

	_update_slot_actions()
	_rebuild_roster()


func _slot_capacity() -> int:
	return AccountManager.slot_capacity()


func _can_show_create_slot() -> bool:
	return _characters.size() < _slot_capacity() and not _switching


func _visual_count() -> int:
	return _characters.size() + (1 if _can_show_create_slot() else 0)


func _update_slot_actions() -> void:
	var total_slots := _slot_capacity()
	var can_create := _characters.size() < total_slots
	var can_purchase := total_slots < MAX_SLOTS
	_create_btn.visible = can_create
	_create_btn.disabled = _switching or _busy
	_unlock_btn.visible = can_purchase
	var can_afford_slot := CurrencyManager.can_afford(
		CurrencyManager.CURRENCY_NOVA,
		AccountManager.SLOT_NOVA_COST
	)
	_unlock_btn.disabled = _switching or _busy or _characters.is_empty() or not can_afford_slot
	_unlock_btn.tooltip_text = (
		"Unlock another operative slot"
		if can_afford_slot
		else "Not enough Nova Crystals"
	)
	_enter_btn.disabled = _selected_id.is_empty() or _switching
	if not _switching:
		_enter_btn.text = "PLAY"
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	if can_create:
		_status.text = "%s / %s operative slots" % [_characters.size(), total_slots]
	elif can_purchase:
		_status.text = "%s / %s slots · unlock another for %s Nova (max %s)" % [
			_characters.size(), total_slots, AccountManager.SLOT_NOVA_COST, MAX_SLOTS,
		]
	else:
		_status.text = "All %s operative slots are filled." % MAX_SLOTS


func _clear_roster() -> void:
	while _list != null and is_instance_valid(_list) and _list.get_child_count() > 0:
		var child := _list.get_child(_list.get_child_count() - 1)
		_list.remove_child(child)
		child.queue_free()
	_card_buttons.clear()


func _side_spacer() -> Control:
	var s := Control.new()
	s.mouse_filter = Control.MOUSE_FILTER_IGNORE
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.size_flags_stretch_ratio = 0.28
	return s


func _rebuild_roster() -> void:
	_clear_roster()
	var n := _visual_count()
	if n <= 1 and not _characters.is_empty():
		_list.add_child(_side_spacer())
	for c in _characters:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cid := str(c.get("id", ""))
		var card := _make_card(c, cid == _active_id, cid == _selected_id)
		_list.add_child(card)
		_card_buttons[cid] = card
	if _can_show_create_slot():
		_list.add_child(_make_create_card())
	if n <= 1 and not _characters.is_empty():
		_list.add_child(_side_spacer())
	_enter_btn.disabled = _selected_id.is_empty() or _switching
	_update_slot_actions()


func _make_card(character: Dictionary, is_active: bool, is_selected: bool) -> Button:
	var btn := Button.new()
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.size_flags_vertical = Control.SIZE_EXPAND_FILL
	btn.size_flags_stretch_ratio = 1.14 if is_selected else 1.0
	btn.clip_contents = true
	btn.focus_mode = Control.FOCUS_ALL
	btn.disabled = _switching
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var cid := str(character.get("id", ""))
	btn.pressed.connect(func() -> void: _select_card(cid))
	btn.gui_input.connect(func(ev: InputEvent) -> void:
		if _busy or _switching:
			return
		if ev is InputEventMouseButton:
			var mb := ev as InputEventMouseButton
			if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT and mb.double_click:
				_select_card(cid)
				_enter(character)
				get_viewport().set_input_as_handled()
	)
	_style_card(btn, is_selected, false)
	ClientUi.apply_interaction_motion(btn, 1.015)

	var pad := MarginContainer.new()
	pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pad.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	pad.add_theme_constant_override("margin_left", 18)
	pad.add_theme_constant_override("margin_right", 18)
	pad.add_theme_constant_override("margin_top", 14)
	pad.add_theme_constant_override("margin_bottom", 16)
	btn.add_child(pad)

	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 8)
	pad.add_child(col)

	var badge_row := HBoxContainer.new()
	badge_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge_row.alignment = BoxContainer.ALIGNMENT_CENTER
	badge_row.custom_minimum_size.y = 28
	col.add_child(badge_row)
	if is_active:
		badge_row.add_child(_status_chip("ACTIVE OPERATIVE", ClientUi.CYAN if is_selected else ClientUi.SUCCESS))
	elif is_selected:
		badge_row.add_child(_status_chip("SELECTED", ClientUi.CYAN))

	var art_host := CenterContainer.new()
	art_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	art_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(art_host)
	var frame := PanelContainer.new()
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_theme_stylebox_override("panel", _inset_style(
		Color(0.03, 0.05, 0.09, 0.98),
		Color(ClientUi.CYAN, 0.7) if is_selected else Color(0.35, 0.45, 0.55, 0.45),
		16,
		3 if is_selected else 2,
		Color(ClientUi.CYAN, 0.28) if is_selected else Color(0, 0, 0, 0.35),
		14 if is_selected else 8
	))
	art_host.add_child(frame)
	var portrait := AvatarRenderer.make_portrait(character, 240.0)
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if portrait is AvatarPortrait:
		(portrait as AvatarPortrait).set_active(true)
	frame.add_child(portrait)
	_bind_portrait_size(btn, art_host, portrait, frame)

	var name_l := Label.new()
	name_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.text = LegacyName.full_name(character)
	name_l.clip_text = true
	name_l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_l.add_theme_font_size_override("font_size", 28)
	name_l.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(name_l)
	col.add_child(name_l)

	var title_l := Label.new()
	title_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_l.custom_minimum_size.y = 18
	var title := str(character.get("active_title", "")).strip_edges()
	title_l.text = title if not title.is_empty() and title != "<null>" else " "
	title_l.add_theme_font_size_override("font_size", 14)
	title_l.add_theme_color_override("font_color", Color(ClientUi.GOLD, 0.92))
	ClientUi.apply_display_font(title_l)
	col.add_child(title_l)

	var meta_row := HBoxContainer.new()
	meta_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meta_row.alignment = BoxContainer.ALIGNMENT_CENTER
	meta_row.add_theme_constant_override("separation", 10)
	col.add_child(meta_row)
	meta_row.add_child(_status_chip("LV %s" % ClientUi.format_level(character.get("level", 1)), ClientUi.CYAN_SOFT))
	var class_key := str(character.get("class", "?"))
	if ClassIcon.has(class_key):
		meta_row.add_child(ClassIcon.make(class_key, 30.0))
	var class_l := Label.new()
	class_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	class_l.text = class_key
	class_l.add_theme_font_size_override("font_size", 16)
	class_l.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(class_l)
	meta_row.add_child(class_l)

	var race_l := Label.new()
	race_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	race_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	race_l.text = str(character.get("race", "")).strip_edges()
	race_l.add_theme_font_size_override("font_size", 15)
	race_l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(race_l)
	col.add_child(race_l)

	var summary := Label.new()
	summary.mouse_filter = Control.MOUSE_FILTER_IGNORE
	summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	summary.text = _summary_line(character)
	summary.add_theme_font_size_override("font_size", 13)
	summary.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.9))
	ClientUi.apply_body_font(summary)
	col.add_child(summary)

	return btn


func _summary_line(character: Dictionary) -> String:
	var bits: Array[String] = []
	if character.has("arena_rating"):
		bits.append("Rating %s" % int(character.get("arena_rating", 1000)))
	var wins := int(character.get("arena_wins", 0))
	var missions := int(character.get("missions_completed", 0))
	var guild := str(character.get("guild_tag", character.get("guild", ""))).strip_edges()
	if wins > 0:
		bits.append("%s wins" % wins)
	if missions > 0:
		bits.append("%s missions" % missions)
	if not guild.is_empty() and guild != "<null>":
		bits.append("[%s]" % guild)
	if bits.is_empty():
		return "Ready for deployment"
	return " · ".join(bits)


func _inset_style(bg: Color, border: Color, radius: int, width: int, glow: Color, glow_size: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_border_width_all(width)
	sb.border_color = border
	sb.set_corner_radius_all(radius)
	sb.corner_detail = 12
	sb.anti_aliasing = true
	sb.content_margin_left = 6
	sb.content_margin_right = 6
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	sb.shadow_color = glow
	sb.shadow_size = glow_size
	sb.shadow_offset = Vector2.ZERO
	return sb


func _status_chip(text: String, tint: Color) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.add_theme_stylebox_override("panel", _inset_style(
		Color(tint, 0.16), Color(tint, 0.72), 8, 1, Color(tint, 0.18), 6
	))
	var l := Label.new()
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.text = text
	l.add_theme_font_size_override("font_size", 13)
	l.add_theme_color_override("font_color", tint.lightened(0.12))
	ClientUi.apply_display_font(l)
	chip.add_child(l)
	return chip


func _bind_portrait_size(card: Control, host: Control, portrait: Control, frame: Control) -> void:
	var sync := func() -> void:
		if not is_instance_valid(host) or not is_instance_valid(portrait):
			return
		var side := minf(host.size.x, host.size.y)
		side = clampf(side - 4.0, 180.0, 420.0)
		portrait.custom_minimum_size = Vector2(side, side)
		if is_instance_valid(frame):
			frame.custom_minimum_size = Vector2(side + 12.0, side + 12.0)
	host.resized.connect(sync)
	if card != null:
		card.resized.connect(sync)
	sync.call_deferred()


func _make_create_card() -> Button:
	var btn := Button.new()
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.size_flags_vertical = Control.SIZE_EXPAND_FILL
	btn.size_flags_stretch_ratio = 1.0
	btn.focus_mode = Control.FOCUS_ALL
	btn.disabled = _switching or _busy
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	btn.pressed.connect(_on_create_pressed)
	_style_card(btn, false, true)
	ClientUi.apply_interaction_motion(btn, 1.02)

	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	col.add_theme_constant_override("separation", 16)
	btn.add_child(col)

	var icon_wrap := CenterContainer.new()
	icon_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(icon_wrap)
	var plus_panel := PanelContainer.new()
	plus_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plus_panel.custom_minimum_size = Vector2(96, 96)
	plus_panel.add_theme_stylebox_override("panel", _inset_style(
		Color(ClientUi.VIOLET, 0.14), Color(ClientUi.VIOLET, 0.6), 48, 2,
		Color(ClientUi.VIOLET, 0.22), 10
	))
	icon_wrap.add_child(plus_panel)
	var plus_c := CenterContainer.new()
	plus_c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plus_panel.add_child(plus_c)
	plus_c.add_child(UiIcon.make("plus", ClientUi.VIOLET.lightened(0.2), 42.0))

	var lab := Label.new()
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.text = "CREATE NEW\nOPERATIVE"
	lab.add_theme_font_size_override("font_size", 22)
	lab.add_theme_color_override("font_color", ClientUi.VIOLET.lightened(0.25))
	ClientUi.apply_display_font(lab)
	col.add_child(lab)

	var hint := Label.new()
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.text = "Open a new slot on your roster"
	hint.add_theme_font_size_override("font_size", 14)
	hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(hint)
	col.add_child(hint)
	return btn


func _style_card(btn: Button, is_selected: bool, is_create: bool) -> void:
	var sb := StyleBoxFlat.new()
	if is_create:
		sb.bg_color = Color(0.07, 0.06, 0.12, 0.82)
		sb.set_border_width_all(2)
		sb.border_color = Color(ClientUi.VIOLET, 0.45)
		sb.shadow_color = Color(ClientUi.VIOLET, 0.18)
		sb.shadow_size = 12
	elif is_selected:
		sb.bg_color = Color(0.05, 0.14, 0.18, 0.96)
		sb.set_border_width_all(3)
		sb.border_color = ClientUi.CYAN
		sb.shadow_color = Color(ClientUi.CYAN, 0.42)
		sb.shadow_size = 22
	else:
		sb.bg_color = Color(0.05, 0.07, 0.11, 0.92)
		sb.set_border_width_all(2)
		sb.border_color = Color(0.32, 0.40, 0.52, 0.55)
		sb.shadow_color = Color(0, 0, 0, 0.35)
		sb.shadow_size = 10
	sb.shadow_offset = Vector2(0, 3)
	sb.set_corner_radius_all(18)
	sb.corner_detail = 12
	sb.anti_aliasing = true
	btn.add_theme_stylebox_override("normal", sb)
	var hover := sb.duplicate() as StyleBoxFlat
	if is_create:
		hover.bg_color = Color(0.10, 0.08, 0.16, 0.92)
		hover.border_color = ClientUi.VIOLET.lightened(0.1)
	elif not is_selected:
		hover.border_color = Color(ClientUi.CYAN, 0.62)
		hover.bg_color = Color(0.07, 0.10, 0.15, 0.95)
		hover.shadow_color = Color(ClientUi.CYAN, 0.22)
		hover.shadow_size = 14
	else:
		hover.bg_color = Color(0.06, 0.18, 0.22, 0.98)
		hover.shadow_size = 26
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_stylebox_override("pressed", hover)
	btn.add_theme_stylebox_override("disabled", sb)
	btn.add_theme_stylebox_override("focus", sb)
	btn.add_theme_color_override("font_color", Color(0, 0, 0, 0))


func _on_create_pressed() -> void:
	if _busy or _switching:
		return
	var total_slots := _slot_capacity()
	if _characters.size() >= total_slots:
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = "No free character slots (max %s)." % total_slots
		return
	GameManager.go_character_create()


func _on_unlock_slot() -> void:
	if _busy or _switching:
		return
	if _slot_capacity() >= MAX_SLOTS:
		_status.add_theme_color_override("font_color", ClientUi.MUTED)
		_status.text = "All %s operative slots are already unlocked." % MAX_SLOTS
		return
	var debit_id := _active_id
	if debit_id.is_empty():
		debit_id = _selected_id
	if debit_id.is_empty() and not _characters.is_empty() and typeof(_characters[0]) == TYPE_DICTIONARY:
		debit_id = str(_characters[0].get("id", ""))
	if debit_id.is_empty():
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = "Create an operative before buying a slot."
		return
	var nova: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA))
	if not CurrencyManager.can_afford(
		CurrencyManager.CURRENCY_NOVA,
		AccountManager.SLOT_NOVA_COST
	):
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = "Need %s Nova Crystals to unlock a slot — you have %s." % [
			AccountManager.SLOT_NOVA_COST, nova,
		]
		return
	_busy = true
	_unlock_btn.disabled = true
	_create_btn.disabled = true
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	_status.text = "Unlocking slot…"
	if str(AuthManager.user.get("active_character_id", "")) != debit_id:
		var pin: Dictionary = await AuthManager.select_character(debit_id)
		if not pin.ok:
			_busy = false
			_update_slot_actions()
			_status.add_theme_color_override("font_color", ClientUi.DANGER)
			_status.text = str(pin.get("error", "Could not pin active operative"))
			return
		_active_id = debit_id
	var res: Dictionary = await AccountManager.buy_character_slot()
	_busy = false
	if not res.ok:
		_update_slot_actions()
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = str(res.get("error", "Could not unlock slot"))
		return
	_status.add_theme_color_override("font_color", ClientUi.SUCCESS)
	_status.text = "Slot unlocked (−%s Nova). Create your next operative." % AccountManager.SLOT_NOVA_COST
	await _refresh()
	GameManager.go_character_create()


func _select_card(character_id: String) -> void:
	if _busy or _switching or character_id.is_empty():
		return
	_selected_id = character_id
	_rebuild_roster()


func _rebuild_cards() -> void:
	_rebuild_roster()


func _enter_selected() -> void:
	if _switching or _selected_id.is_empty():
		return
	for character in _characters:
		if typeof(character) == TYPE_DICTIONARY and str(character.get("id", "")) == _selected_id:
			_enter(character)
			return


func _enter(character: Dictionary) -> void:
	if _busy or _switching:
		return
	_switching = true
	_enter_btn.disabled = true
	_enter_btn.text = "LOADING…"
	_create_btn.disabled = true
	_unlock_btn.disabled = true
	_rebuild_roster()
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	_status.text = "Selecting…"
	var cid := str(character.get("id", ""))
	var res: Dictionary = await AuthManager.select_character(cid)
	if not res.ok:
		_switching = false
		_enter_btn.text = "PLAY"
		_update_slot_actions()
		_rebuild_roster()
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = str(res.get("error", "Could not select character"))
		return
	_status.text = "Loading operative…"
	var loaded: Dictionary = await AuthManager.get_selected_character()
	if not loaded.ok or typeof(loaded.get("data", null)) != TYPE_DICTIONARY:
		_switching = false
		_enter_btn.text = "PLAY"
		_update_slot_actions()
		_rebuild_roster()
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = str(loaded.get("error", "Could not load selected character"))
		return
	GameManager.go_hub(loaded.data)


func _on_logout() -> void:
	await AuthManager.logout()
	GameManager.go_login()
