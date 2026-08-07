extends Control
## Character select — mirrors web CharacterSelectPage.jsx.

const MAX_SLOTS := 3

var _list: VBoxContainer
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
		KEY_UP:
			_move_selection(-1)
			get_viewport().set_input_as_handled()
		KEY_DOWN:
			_move_selection(1)
			get_viewport().set_input_as_handled()
		KEY_ENTER, KEY_KP_ENTER:
			# Leave Enter alone when focus is on create / unlock CTAs.
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
	margin.add_theme_constant_override("margin_left", 28)
	margin.add_theme_constant_override("margin_right", 28)
	margin.add_theme_constant_override("margin_top", 24)
	margin.add_theme_constant_override("margin_bottom", 24)
	add_child(margin)

	# Full-rect stack (not CenterContainer): a centered tall column was clipping the
	# footer off-screen, so New / Enter Game could not be reached.
	var stage := VBoxContainer.new()
	stage.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	stage.alignment = BoxContainer.ALIGNMENT_CENTER
	stage.add_theme_constant_override("separation", 0)
	margin.add_child(stage)

	# Loading state — SiteTitle + spinner (web CharacterSelectPage)
	_loading_host = VBoxContainer.new()
	_loading_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_loading_host.alignment = BoxContainer.ALIGNMENT_CENTER
	_loading_host.add_theme_constant_override("separation", 16)
	stage.add_child(_loading_host)
	var load_title := ClientUi.make_title("LOOT & LASERS", 28)
	load_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading_host.add_child(load_title)
	var spinner := Label.new()
	spinner.text = "⟳"
	spinner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	spinner.add_theme_font_size_override("font_size", 37)
	spinner.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(spinner)
	_loading_host.add_child(spinner)

	# Main picker — list scrolls; footer always stays on-screen.
	_main_host = VBoxContainer.new()
	_main_host.visible = false
	_main_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_main_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_main_host.add_theme_constant_override("separation", 14)
	stage.add_child(_main_host)

	var head := VBoxContainer.new()
	head.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	head.add_theme_constant_override("separation", 6)
	_main_host.add_child(head)
	var title := ClientUi.make_title("SELECT YOUR OPERATIVE", 26)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	head.add_child(title)
	_welcome = Label.new()
	_welcome.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_welcome.add_theme_font_size_override("font_size", 17)
	_welcome.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_welcome)
	head.add_child(_welcome)

	# Keep the list in a plain expanding column — CenterContainer collapses
	# ScrollContainer min-height to 0 and hid every operative card.
	var list_col := VBoxContainer.new()
	list_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list_col.add_theme_constant_override("separation", 10)
	_main_host.add_child(list_col)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	list_col.add_child(scroll)

	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 10)
	scroll.add_child(_list)

	_status = ClientUi.make_status()
	_status.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_main_host.add_child(_status)

	# Footer: Log out | New + Enter Game — always pinned below the list.
	var row := HBoxContainer.new()
	row.size_flags_vertical = Control.SIZE_SHRINK_END
	row.add_theme_constant_override("separation", 10)
	_main_host.add_child(row)

	var logout_btn := Button.new()
	logout_btn.text = "↪  Log out"
	ClientUi.apply_ghost_button(logout_btn)
	logout_btn.pressed.connect(_on_logout)
	row.add_child(logout_btn)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)

	_unlock_btn = Button.new()
	_unlock_btn.text = "＋  Unlock Slot · %s 💎" % AccountManager.SLOT_NOVA_COST
	_apply_accent_button(_unlock_btn)
	_unlock_btn.pressed.connect(_on_unlock_slot)
	row.add_child(_unlock_btn)

	_create_btn = Button.new()
	_create_btn.text = "＋  New"
	_apply_accent_button(_create_btn)
	_create_btn.pressed.connect(_on_create_pressed)
	row.add_child(_create_btn)

	_enter_btn = Button.new()
	_enter_btn.text = "↪  Enter Game"
	_enter_btn.custom_minimum_size.x = 197
	ClientUi.apply_primary_button(_enter_btn)
	_enter_btn.pressed.connect(_enter_selected)
	row.add_child(_enter_btn)


func _apply_accent_button(btn: Button) -> void:
	## Closest to web painted-btn-accent (violet accent CTA).
	var n := StyleBoxFlat.new()
	n.bg_color = Color(ClientUi.VIOLET, 0.18)
	n.set_border_width_all(1)
	n.border_color = Color(ClientUi.VIOLET, 0.55)
	n.set_corner_radius_all(8)
	n.content_margin_left = 14
	n.content_margin_right = 14
	n.content_margin_top = 8
	n.content_margin_bottom = 8
	var h := n.duplicate() as StyleBoxFlat
	h.bg_color = Color(ClientUi.VIOLET, 0.28)
	btn.add_theme_stylebox_override("normal", n)
	btn.add_theme_stylebox_override("hover", h)
	btn.add_theme_stylebox_override("pressed", h)
	btn.add_theme_stylebox_override("disabled", n)
	btn.add_theme_color_override("font_color", ClientUi.VIOLET.lightened(0.25))
	btn.add_theme_color_override("font_hover_color", ClientUi.TEXT)
	btn.add_theme_font_size_override("font_size", 16)
	ClientUi.apply_display_font(btn)


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
	for child in _list.get_children():
		child.queue_free()
	_card_buttons.clear()

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
	# Empty list → create flow when Node gameplay bridge is available.
	if _characters.is_empty():
		if AuthManager.has_node_gameplay_session():
			GameManager.go_character_create()
			return
		_loading_host.visible = false
		_main_host.visible = true
		_welcome.text = "👥  Welcome, %s" % _welcome_name()
		_status.add_theme_color_override("font_color", ClientUi.MUTED)
		_status.text = "No operatives yet. Re-login if Character APIs failed to bridge."
		_create_btn.disabled = false
		_enter_btn.disabled = true
		_unlock_btn.visible = false
		return

	_loading_host.visible = false
	_main_host.visible = true
	_welcome.text = "👥  Welcome back, %s" % _welcome_name()

	_active_id = str(AuthManager.user.get("active_character_id", ""))
	_selected_id = _active_id
	if _selected_id.is_empty():
		_selected_id = str(_characters[0].get("id", ""))

	_update_slot_actions()

	for c in _characters:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cid := str(c.get("id", ""))
		var card := _make_card(c, cid == _active_id, cid == _selected_id)
		_list.add_child(card)
		_card_buttons[cid] = card


func _slot_capacity() -> int:
	return AccountManager.slot_capacity()


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
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	if can_create:
		_status.text = "%s/%s slots used." % [_characters.size(), total_slots]
	elif can_purchase:
		_status.text = "%s/%s slots used — unlock another for %s 💎 (up to %s total)." % [
			_characters.size(), total_slots, AccountManager.SLOT_NOVA_COST, MAX_SLOTS,
		]
	else:
		_status.text = "All %s operative slots are filled." % MAX_SLOTS


func _make_card(character: Dictionary, is_active: bool, is_selected: bool) -> Button:
	var btn := Button.new()
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.custom_minimum_size.y = 117
	btn.clip_contents = true
	btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
	btn.disabled = _switching
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
	_style_card(btn, is_selected)

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	row.offset_left = 19
	row.offset_top = 16
	row.offset_right = -19
	row.offset_bottom = -16
	row.add_theme_constant_override("separation", 14)
	btn.add_child(row)

	var portrait := AvatarRenderer.make_portrait(character, 64.0)
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(portrait)

	var info := VBoxContainer.new()
	info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 2)
	info.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(info)

	var name_l := Label.new()
	name_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_l.text = LegacyName.full_name(character)
	name_l.clip_text = true
	name_l.add_theme_font_size_override("font_size", 20)
	name_l.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(name_l)
	info.add_child(name_l)

	var meta := Label.new()
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Web: Level {n} · {race} {class}
	meta.text = "Level %s · %s %s" % [
		ClientUi.format_level(character.get("level", 1)),
		str(character.get("race", "?")),
		str(character.get("class", "?")),
	]
	meta.add_theme_font_size_override("font_size", 15)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	info.add_child(meta)

	if is_active:
		var active := Label.new()
		active.mouse_filter = Control.MOUSE_FILTER_IGNORE
		active.text = "✓  Active"
		active.add_theme_font_size_override("font_size", 15)
		active.add_theme_color_override("font_color", ClientUi.CYAN)
		ClientUi.apply_display_font(active)
		row.add_child(active)

	return btn


func _style_card(btn: Button, is_selected: bool) -> void:
	var sb := StyleBoxFlat.new()
	if is_selected:
		sb.bg_color = Color(ClientUi.CYAN, 0.06)
		sb.set_border_width_all(2)
		sb.border_color = ClientUi.CYAN
	else:
		sb.bg_color = Color(0.06, 0.08, 0.12, 0.72)
		sb.set_border_width_all(1)
		sb.border_color = Color(1, 1, 1, 0.12)
	sb.set_corner_radius_all(16)
	btn.add_theme_stylebox_override("normal", sb)
	var hover := sb.duplicate() as StyleBoxFlat
	if not is_selected:
		hover.border_color = Color(ClientUi.CYAN, 0.4)
		hover.bg_color = Color(0.07, 0.09, 0.14, 0.85)
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
		_status.text = "Need %s 💎 to unlock a slot — you have %s." % [
			AccountManager.SLOT_NOVA_COST, nova,
		]
		return
	_busy = true
	_unlock_btn.disabled = true
	_create_btn.disabled = true
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	_status.text = "Unlocking slot…"
	# BuyCharacterSlot debits the account's active operative — pin first if needed.
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
	_status.text = "Slot unlocked (−%s 💎). Create your next operative." % AccountManager.SLOT_NOVA_COST
	await _refresh()
	GameManager.go_character_create()


func _select_card(character_id: String) -> void:
	if _busy or _switching or character_id.is_empty():
		return
	_selected_id = character_id
	_rebuild_cards()


func _rebuild_cards() -> void:
	for child in _list.get_children():
		child.queue_free()
	_card_buttons.clear()
	for c in _characters:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cid := str(c.get("id", ""))
		var card := _make_card(c, cid == _active_id, cid == _selected_id)
		_list.add_child(card)
		_card_buttons[cid] = card
	_enter_btn.disabled = _selected_id.is_empty() or _switching
	_update_slot_actions()


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
	_enter_btn.text = "⟳  Enter Game"
	_create_btn.disabled = true
	_unlock_btn.disabled = true
	_rebuild_cards()
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	_status.text = "Selecting…"
	var cid := str(character.get("id", ""))
	var res: Dictionary = await AuthManager.select_character(cid)
	if not res.ok:
		_switching = false
		_enter_btn.text = "↪  Enter Game"
		_update_slot_actions()
		_rebuild_cards()
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = str(res.get("error", "Could not select character"))
		return
	_status.text = "Loading operative…"
	var loaded: Dictionary = await AuthManager.get_selected_character()
	if not loaded.ok or typeof(loaded.get("data", null)) != TYPE_DICTIONARY:
		_switching = false
		_enter_btn.text = "↪  Enter Game"
		_update_slot_actions()
		_rebuild_cards()
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = str(loaded.get("error", "Could not load selected character"))
		return
	GameManager.go_hub(loaded.data)


func _on_logout() -> void:
	await AuthManager.logout()
	GameManager.go_login()
