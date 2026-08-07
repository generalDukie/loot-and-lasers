extends Control
## Comms Terminal — Global frequency (default) + Private channels.
## Presentation parity with web MessagesPage / Chat panels.

var _meta: Label
var _status: Label
var _sidebar: VBoxContainer
var _side_panel: PanelContainer
var _side_lab: Label
var _thread: VBoxContainer
var _thread_scroll: ScrollContainer
var _compose: LineEdit
var _char_count: Label
var _tab_global: Button
var _tab_dm: Button
var _dm_friend_btn: Button
var _send_btn: Button
var _active_convo: Dictionary = {}
var _recipient_id := ""
var _busy := false
var _picking_friend := false
var _global_mode := true


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not RealtimeManager.chat_event.is_connected(_on_chat_event):
		RealtimeManager.chat_event.connect(_on_chat_event)
	await _boot()


func _exit_tree() -> void:
	if RealtimeManager.chat_event.is_connected(_on_chat_event):
		RealtimeManager.chat_event.disconnect(_on_chat_event)


func _on_chat_event(entity: String, _data: Dictionary) -> void:
	if entity == "PrivateMessagePoll" and not _active_convo.is_empty() and not _global_mode:
		await _load_thread()
	elif entity == "ChatMessage" and _global_mode:
		await _load_global_thread()
	elif entity == "ChatMessage" and not _global_mode:
		await _load_sidebar()


func _boot() -> void:
	_status.text = "Loading…"
	if not GameManager.pending_dm_character.is_empty():
		var t: Dictionary = GameManager.pending_dm_character
		GameManager.pending_dm_character = {}
		await _set_tab_dm()
		_recipient_id = str(t.get("id", ""))
		_active_convo = {}
		_meta.text = "Secure link → %s" % str(t.get("name", _recipient_id))
		_show_empty_thread("Type a message below to start.")
		await _load_sidebar()
	else:
		await _set_tab_global()
	_status.text = ""


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 88)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_bottom", 88)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 12)
	margin.add_child(root)

	# Header — Comms Terminal
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)

	var badge := PanelContainer.new()
	badge.custom_minimum_size = Vector2(48, 48)
	badge.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.22, 0.28, 0.9), Color(ClientUi.CYAN, 0.45), 14, 1
	))
	header.add_child(badge)
	var badge_center := CenterContainer.new()
	badge.add_child(badge_center)
	badge_center.add_child(UiIcon.make("message-square", ClientUi.CYAN_SOFT, 22.0))

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_col.add_theme_constant_override("separation", 2)
	header.add_child(title_col)
	var title := Label.new()
	title.text = "Comms Terminal"
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	title_col.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "Station frequencies · encrypted private links"
	subtitle.add_theme_font_size_override("font_size", 13)
	subtitle.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(subtitle)
	title_col.add_child(subtitle)

	# Frequency bar
	var freq_bar := PanelContainer.new()
	freq_bar.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.96), Color(ClientUi.CYAN, 0.28), 16, 1
	))
	root.add_child(freq_bar)
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 8)
	freq_bar.add_child(tabs)

	var freq_lab := Label.new()
	freq_lab.text = "  FREQ  "
	freq_lab.add_theme_font_size_override("font_size", 11)
	freq_lab.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.55))
	ClientUi.apply_display_font(freq_lab)
	tabs.add_child(freq_lab)

	_tab_global = _make_tab_button("Global · Open")
	_tab_global.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tab_global.pressed.connect(func() -> void: await _set_tab_global())
	tabs.add_child(_tab_global)

	_tab_dm = _make_tab_button("Private · Secure")
	_tab_dm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tab_dm.pressed.connect(func() -> void: await _set_tab_dm())
	tabs.add_child(_tab_dm)

	_meta = Label.new()
	_meta.add_theme_font_size_override("font_size", 14)
	_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_meta)
	root.add_child(_meta)

	_status = ClientUi.make_status()
	root.add_child(_status)

	var split := HBoxContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 14)
	root.add_child(split)

	_side_panel = PanelContainer.new()
	_side_panel.custom_minimum_size = Vector2(300, 0)
	_side_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_side_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.045, 0.055, 0.09, 0.97), Color(0.28, 0.38, 0.48, 0.42), 16, 1
	))
	split.add_child(_side_panel)
	var side_col := VBoxContainer.new()
	side_col.add_theme_constant_override("separation", 10)
	_side_panel.add_child(side_col)

	_side_lab = Label.new()
	_side_lab.text = "PRIVATE LINKS"
	_side_lab.add_theme_font_size_override("font_size", 12)
	_side_lab.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.65))
	ClientUi.apply_display_font(_side_lab)
	side_col.add_child(_side_lab)

	_dm_friend_btn = Button.new()
	_dm_friend_btn.text = "DM a friend…"
	_dm_friend_btn.custom_minimum_size = Vector2(0, 46)
	_dm_friend_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(_dm_friend_btn)
	_dm_friend_btn.pressed.connect(_on_pick_friend)
	side_col.add_child(_dm_friend_btn)

	var side_scroll := ScrollContainer.new()
	side_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side_col.add_child(side_scroll)
	_sidebar = VBoxContainer.new()
	_sidebar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sidebar.add_theme_constant_override("separation", 6)
	side_scroll.add_child(_sidebar)

	var thread_panel := PanelContainer.new()
	thread_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	thread_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	thread_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.085, 0.98), Color(ClientUi.CYAN, 0.32), 16, 1
	))
	split.add_child(thread_panel)
	var thread_col := VBoxContainer.new()
	thread_col.add_theme_constant_override("separation", 0)
	thread_panel.add_child(thread_col)

	_thread_scroll = ScrollContainer.new()
	_thread_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	thread_col.add_child(_thread_scroll)
	var thread_pad := MarginContainer.new()
	thread_pad.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	thread_pad.add_theme_constant_override("margin_left", 14)
	thread_pad.add_theme_constant_override("margin_right", 14)
	thread_pad.add_theme_constant_override("margin_top", 14)
	thread_pad.add_theme_constant_override("margin_bottom", 10)
	_thread_scroll.add_child(thread_pad)
	_thread = VBoxContainer.new()
	_thread.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_thread.add_theme_constant_override("separation", 10)
	thread_pad.add_child(_thread)

	# Compose bar
	var compose_wrap := PanelContainer.new()
	compose_wrap.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.07, 0.11, 0.98), Color(ClientUi.CYAN, 0.2), 0, 1
	))
	thread_col.add_child(compose_wrap)
	var compose_pad := MarginContainer.new()
	compose_pad.add_theme_constant_override("margin_left", 12)
	compose_pad.add_theme_constant_override("margin_right", 12)
	compose_pad.add_theme_constant_override("margin_top", 12)
	compose_pad.add_theme_constant_override("margin_bottom", 12)
	compose_wrap.add_child(compose_pad)
	var compose_col := VBoxContainer.new()
	compose_col.add_theme_constant_override("separation", 6)
	compose_pad.add_child(compose_col)

	var compose_row := HBoxContainer.new()
	compose_row.add_theme_constant_override("separation", 10)
	compose_col.add_child(compose_row)
	_compose = ClientUi.make_field("Broadcast to the station…")
	_compose.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_compose.custom_minimum_size.y = 48
	_compose.max_length = 280
	_compose.text_changed.connect(_on_compose_changed)
	_compose.text_submitted.connect(func(_text: String) -> void: _on_send())
	compose_row.add_child(_compose)
	_send_btn = Button.new()
	_send_btn.text = "  Send"
	_send_btn.focus_mode = Control.FOCUS_NONE
	_send_btn.custom_minimum_size = Vector2(110, 48)
	ClientUi.apply_primary_button(_send_btn)
	_send_btn.pressed.connect(_on_send)
	compose_row.add_child(_send_btn)

	_char_count = Label.new()
	_char_count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_char_count.add_theme_font_size_override("font_size", 11)
	_char_count.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.7))
	ClientUi.apply_display_font(_char_count)
	compose_col.add_child(_char_count)
	_on_compose_changed(_compose.text)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)

	_refresh_tab_styles()
	_apply_layout_for_mode()


func _on_compose_changed(text: String) -> void:
	var max_len := _compose.max_length if _compose.max_length > 0 else 280
	_char_count.text = "%d / %d" % [text.length(), max_len]
	var near := text.length() >= int(max_len * 0.85)
	_char_count.add_theme_color_override(
		"font_color",
		Color(0.95, 0.75, 0.35, 0.95) if near else Color(ClientUi.MUTED, 0.7)
	)


func _make_tab_button(label: String) -> Button:
	var btn := Button.new()
	btn.text = label
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size = Vector2(0, 48)
	btn.add_theme_font_size_override("font_size", 16)
	ClientUi.apply_display_font(btn)
	return btn


func _refresh_tab_styles() -> void:
	if _tab_global:
		if _global_mode:
			ClientUi.apply_primary_button(_tab_global)
		else:
			ClientUi.apply_ghost_button(_tab_global)
		_tab_global.custom_minimum_size = Vector2(0, 48)
		_tab_global.add_theme_font_size_override("font_size", 16)
	if _tab_dm:
		if _global_mode:
			ClientUi.apply_ghost_button(_tab_dm)
		else:
			ClientUi.apply_primary_button(_tab_dm)
		_tab_dm.custom_minimum_size = Vector2(0, 48)
		_tab_dm.add_theme_font_size_override("font_size", 16)


func _apply_layout_for_mode() -> void:
	if _side_panel:
		_side_panel.visible = not _global_mode
	if _dm_friend_btn:
		_dm_friend_btn.visible = not _global_mode


func _set_tab_global() -> void:
	_picking_friend = false
	_global_mode = true
	_active_convo = {}
	_recipient_id = ""
	_meta.text = "Global Frequency — open channel for all operatives"
	_compose.placeholder_text = "Broadcast to the station…"
	_compose.max_length = 280
	_status.text = ""
	_on_compose_changed(_compose.text)
	_refresh_tab_styles()
	_apply_layout_for_mode()
	await _load_global_thread()


func _set_tab_dm() -> void:
	_global_mode = false
	_picking_friend = false
	_meta.text = "Private channels — encrypted one-to-one links"
	_compose.placeholder_text = "Whisper a private message…"
	_compose.max_length = 500
	_status.text = ""
	_on_compose_changed(_compose.text)
	_refresh_tab_styles()
	_apply_layout_for_mode()
	await _load_sidebar()
	if not _active_convo.is_empty():
		await _load_thread()
	elif _recipient_id.is_empty():
		_show_empty_thread("Select a private channel or DM a friend.")


func _load_sidebar() -> void:
	for c in _sidebar.get_children():
		c.queue_free()
	if _global_mode:
		return
	if _picking_friend:
		_side_lab.text = "FRIENDS"
		await SocialManager.load_friends()
		if SocialManager.friendships.is_empty():
			_sidebar.add_child(_side_label("No friends yet."))
			return
		for f in SocialManager.friendships:
			var oid := SocialManager.friend_other_id(f)
			var btn := Button.new()
			btn.text = "DM %s" % oid
			btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
			btn.custom_minimum_size = Vector2(0, 48)
			ClientUi.apply_ghost_button(btn)
			var capt := oid
			btn.pressed.connect(func() -> void:
				_picking_friend = false
				_global_mode = false
				_recipient_id = capt
				_active_convo = {}
				_compose.placeholder_text = "Whisper a private message…"
				_meta.text = "Secure link → %s" % capt
				_show_empty_thread("Type a message below to start.")
				_side_lab.text = "PRIVATE LINKS"
				_load_sidebar()
			)
			_sidebar.add_child(btn)
		return

	_side_lab.text = "PRIVATE LINKS"
	var convos: Array = await ChatManager.list_conversations()
	if convos.is_empty():
		_sidebar.add_child(_side_label("No private channels yet."))
		return
	for c in convos:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var btn := Button.new()
		var active := str(c.get("id", "")) == str(_active_convo.get("id", ""))
		btn.text = "%s\n%s" % [
			ChatManager.other_participant(c),
			str(c.get("last_message_preview", "")).substr(0, 40),
		]
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.custom_minimum_size = Vector2(0, 56)
		if active:
			ClientUi.apply_primary_button(btn)
		else:
			ClientUi.apply_ghost_button(btn)
		var capt: Dictionary = c
		btn.pressed.connect(func() -> void:
			_picking_friend = false
			_global_mode = false
			_active_convo = capt
			_recipient_id = ChatManager.other_participant(capt)
			_compose.placeholder_text = "Whisper a private message…"
			_load_sidebar()
			_load_thread()
		)
		_sidebar.add_child(btn)


func _load_thread() -> void:
	for c in _thread.get_children():
		c.queue_free()
	if _active_convo.is_empty():
		_show_empty_thread("Type a message below to start." if not _recipient_id.is_empty() else "Select a conversation.")
		return
	var cid := str(_active_convo.get("id", ""))
	_recipient_id = ChatManager.other_participant(_active_convo)
	_meta.text = "Secure link with %s" % _recipient_id
	await ChatManager.mark_read(cid)
	var msgs: Array = await ChatManager.load_thread(cid)
	if msgs.is_empty():
		_thread.add_child(_empty_state("Secure link established — say hello."))
		return
	var me := ChatManager.char_id()
	for m in msgs:
		var mine := str(m.get("sender_id", "")) == me
		var who := "You" if mine else str(m.get("sender_name", _recipient_id))
		_thread.add_child(_message_row(str(m.get("content", "")), who, mine, str(m.get("sender_guild_tag", ""))))
	_scroll_thread_bottom()


func _show_empty_thread(text: String) -> void:
	for c in _thread.get_children():
		c.queue_free()
	_thread.add_child(_empty_state(text))


func _side_label(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	return l


func _empty_state(t: String) -> Control:
	var wrap := CenterContainer.new()
	wrap.custom_minimum_size = Vector2(0, 160)
	wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var l := Label.new()
	l.text = t
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", 14)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	wrap.add_child(l)
	return wrap


func _message_row(content: String, who: String, mine: bool, guild_tag: String = "") -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if mine:
		row.alignment = BoxContainer.ALIGNMENT_END

	var avatar := PanelContainer.new()
	avatar.custom_minimum_size = Vector2(36, 36)
	var av_bg := Color(0.06, 0.28, 0.34, 0.9) if mine else Color(0.1, 0.12, 0.18, 0.95)
	var av_border := Color(ClientUi.CYAN, 0.5) if mine else Color(0.35, 0.42, 0.55, 0.5)
	avatar.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(av_bg, av_border, 10, 1))
	var av_center := CenterContainer.new()
	avatar.add_child(av_center)
	var av_lab := Label.new()
	av_lab.text = who.substr(0, 1).to_upper() if not who.is_empty() else "?"
	av_lab.add_theme_font_size_override("font_size", 14)
	av_lab.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(av_lab)
	av_center.add_child(av_lab)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	col.size_flags_horizontal = Control.SIZE_SHRINK_END if mine else Control.SIZE_EXPAND_FILL
	if not mine:
		col.size_flags_stretch_ratio = 1.0

	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 6)
	if mine:
		name_row.alignment = BoxContainer.ALIGNMENT_END
	col.add_child(name_row)
	if not guild_tag.strip_edges().is_empty():
		var tag := Label.new()
		tag.text = "[%s]" % guild_tag
		tag.add_theme_font_size_override("font_size", 11)
		tag.add_theme_color_override("font_color", Color(0.95, 0.78, 0.35))
		ClientUi.apply_display_font(tag)
		name_row.add_child(tag)
	var name_lab := Label.new()
	name_lab.text = who
	name_lab.add_theme_font_size_override("font_size", 12)
	name_lab.add_theme_color_override("font_color", Color(ClientUi.CYAN_SOFT, 0.9) if mine else ClientUi.TEXT)
	ClientUi.apply_display_font(name_lab)
	name_row.add_child(name_lab)

	var bubble := PanelContainer.new()
	bubble.size_flags_horizontal = Control.SIZE_SHRINK_END if mine else Control.SIZE_SHRINK_BEGIN
	var bg := Color(0.05, 0.32, 0.38, 0.92) if mine else Color(0.09, 0.11, 0.16, 0.96)
	var border := Color(ClientUi.CYAN, 0.5) if mine else Color(0.32, 0.4, 0.52, 0.45)
	bubble.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(bg, border, 14, 1))
	var body := Label.new()
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.text = content
	body.custom_minimum_size.x = 120
	body.add_theme_font_size_override("font_size", 14)
	body.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(body)
	bubble.add_child(body)
	col.add_child(bubble)

	if mine:
		row.add_child(col)
		row.add_child(avatar)
	else:
		row.add_child(avatar)
		row.add_child(col)
	return row


func _scroll_thread_bottom() -> void:
	await get_tree().process_frame
	if _thread_scroll != null and is_instance_valid(_thread_scroll):
		_thread_scroll.scroll_vertical = int(_thread_scroll.get_v_scroll_bar().max_value)


func _on_send() -> void:
	if _busy:
		return
	var text := _compose.text.strip_edges()
	if text.is_empty():
		_status.text = "Type a message first."
		return
	_busy = true

	if _global_mode:
		var gres: Dictionary = await ChatManager.send_global(text)
		_busy = false
		if not gres.ok:
			_status.text = str(gres.get("error", "Send failed"))
			return
		_compose.text = ""
		_on_compose_changed("")
		_status.text = ""
		await _load_global_thread()
		return

	var rid := _recipient_id
	if rid.is_empty() and not _active_convo.is_empty():
		rid = ChatManager.other_participant(_active_convo)
	if rid.is_empty():
		_status.text = "Pick a conversation or friend first."
		_busy = false
		return
	var res: Dictionary = await ChatManager.send_private(rid, text)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Send failed"))
		return
	_compose.text = ""
	_on_compose_changed("")
	_status.text = ""
	if typeof(res.data) == TYPE_DICTIONARY:
		var cid := str(res.data.get("conversation_id", ""))
		if not cid.is_empty():
			_active_convo = {"id": cid, "participant_ids": [ChatManager.char_id(), rid]}
	await _load_sidebar()
	await _load_thread()


func _on_pick_friend() -> void:
	_picking_friend = true
	_global_mode = false
	_compose.placeholder_text = "Whisper a private message…"
	_meta.text = "Pick a friend to open a secure link"
	_refresh_tab_styles()
	_apply_layout_for_mode()
	await _load_sidebar()


func _load_global_thread() -> void:
	for c in _thread.get_children():
		c.queue_free()
	var msgs: Array = await ChatManager.load_global()
	if msgs.is_empty():
		_thread.add_child(_empty_state("Channel clear — be the first to broadcast."))
		return
	var me := ChatManager.char_id()
	for m in msgs:
		var mine := str(m.get("sender_id", "")) == me
		var who := "You" if mine else str(m.get("sender_name", "?"))
		_thread.add_child(_message_row(
			str(m.get("content", "")),
			who,
			mine,
			str(m.get("sender_guild_tag", ""))
		))
	_scroll_thread_bottom()
