extends Control
## Messages — private DMs + server-wide global station chat.

var _meta: Label
var _status: Label
var _sidebar: VBoxContainer
var _thread: VBoxContainer
var _compose: LineEdit
var _active_convo: Dictionary = {}
var _recipient_id := ""
var _busy := false
var _picking_friend := false
var _global_mode := false


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
		_global_mode = false
		_recipient_id = str(t.get("id", ""))
		_active_convo = {}
		_meta.text = "New DM → %s" % str(t.get("name", _recipient_id))
		_show_empty_thread("Type a message below to start.")
	await _load_sidebar()
	if not _active_convo.is_empty():
		await _load_thread()
	_status.text = "Ready."


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 16)
	margin.add_theme_constant_override("margin_top", 10)
	# Leave room for the shell notification FAB (bottom-right) so Send stays clickable.
	margin.add_theme_constant_override("margin_bottom", 88)
	margin.add_theme_constant_override("margin_right", 88)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	margin.add_child(root)

	var head := HBoxContainer.new()
	root.add_child(head)
	var title := Label.new()
	title.text = "💬  Messages"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 29)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	head.add_child(title)
	var new_dm := Button.new()
	new_dm.text = "DM a friend…"
	ClientUi.apply_ghost_button(new_dm)
	new_dm.pressed.connect(_on_pick_friend)
	head.add_child(new_dm)
	var global_btn := Button.new()
	global_btn.text = "Global"
	ClientUi.apply_ghost_button(global_btn)
	global_btn.pressed.connect(_on_global)
	head.add_child(global_btn)

	_meta = Label.new()
	_meta.add_theme_font_size_override("font_size", 15)
	_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_meta)
	root.add_child(_meta)

	_status = ClientUi.make_status()
	root.add_child(_status)

	# Web: sm:grid-cols-[280px_1fr] h-[70vh]
	var split := HBoxContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 12)
	root.add_child(split)

	var side_panel := PanelContainer.new()
	side_panel.custom_minimum_size = Vector2(373, 0)
	side_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.1, 0.96), Color(0.3, 0.38, 0.48, 0.4), 12, 1
	))
	split.add_child(side_panel)
	var side_col := VBoxContainer.new()
	side_col.add_theme_constant_override("separation", 4)
	side_panel.add_child(side_col)
	var side_lab := Label.new()
	side_lab.text = "CONVERSATIONS"
	side_lab.add_theme_font_size_override("font_size", 13)
	side_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(side_lab)
	side_col.add_child(side_lab)
	var side_scroll := ScrollContainer.new()
	side_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side_col.add_child(side_scroll)
	_sidebar = VBoxContainer.new()
	_sidebar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sidebar.add_theme_constant_override("separation", 4)
	side_scroll.add_child(_sidebar)

	var thread_panel := PanelContainer.new()
	thread_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	thread_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	thread_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.09, 0.97), Color(ClientUi.CYAN, 0.35), 12, 1
	))
	split.add_child(thread_panel)
	var thread_col := VBoxContainer.new()
	thread_col.add_theme_constant_override("separation", 8)
	thread_panel.add_child(thread_col)
	var thread_scroll := ScrollContainer.new()
	thread_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	thread_col.add_child(thread_scroll)
	_thread = VBoxContainer.new()
	_thread.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_thread.add_theme_constant_override("separation", 6)
	thread_scroll.add_child(_thread)

	var compose_row := HBoxContainer.new()
	compose_row.add_theme_constant_override("separation", 8)
	thread_col.add_child(compose_row)
	_compose = ClientUi.make_field("Message (max 280)")
	_compose.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_compose.max_length = 280
	# Enter / keypad Enter submits (Godot LineEdit text_submitted).
	_compose.text_submitted.connect(func(_text: String) -> void: _on_send())
	compose_row.add_child(_compose)
	var send := Button.new()
	send.text = "Send"
	send.focus_mode = Control.FOCUS_NONE
	ClientUi.apply_primary_button(send)
	send.pressed.connect(_on_send)
	compose_row.add_child(send)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)

	_show_empty_thread("Select a conversation.")


func _load_sidebar() -> void:
	for c in _sidebar.get_children():
		c.queue_free()
	if _picking_friend:
		await SocialManager.load_friends()
		if SocialManager.friendships.is_empty():
			_sidebar.add_child(_side_label("No friends yet."))
			return
		for f in SocialManager.friendships:
			var oid := SocialManager.friend_other_id(f)
			var btn := Button.new()
			btn.text = "DM %s" % oid
			btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
			ClientUi.apply_ghost_button(btn)
			var capt := oid
			btn.pressed.connect(func() -> void:
				_picking_friend = false
				_global_mode = false
				_recipient_id = capt
				_active_convo = {}
				_compose.placeholder_text = "Message (max 280)"
				_meta.text = "New DM → %s" % capt
				_show_empty_thread("Type a message below to start.")
				_load_sidebar()
			)
			_sidebar.add_child(btn)
		return

	var convos: Array = await ChatManager.list_conversations()
	if convos.is_empty():
		_sidebar.add_child(_side_label("No conversations yet."))
		return
	for c in convos:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var btn := Button.new()
		var active := str(c.get("id", "")) == str(_active_convo.get("id", ""))
		btn.text = "%s\n%s" % [
			ChatManager.other_participant(c),
			str(c.get("last_message_preview", "")).substr(0, 36),
		]
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
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
			_compose.placeholder_text = "Message (max 280)"
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
	_meta.text = "Thread with %s" % _recipient_id
	await ChatManager.mark_read(cid)
	var msgs: Array = await ChatManager.load_thread(cid)
	if msgs.is_empty():
		_thread.add_child(_bubble("No messages yet — say hello.", false))
		return
	for m in msgs:
		var mine := str(m.get("sender_id", "")) == ChatManager.char_id()
		_thread.add_child(_bubble(str(m.get("content", "")), mine))


func _show_empty_thread(text: String) -> void:
	for c in _thread.get_children():
		c.queue_free()
	_thread.add_child(_bubble(text, false))


func _side_label(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	return l


func _bubble(t: String, mine: bool) -> PanelContainer:
	var panel := PanelContainer.new()
	var bg := Color(0.04, 0.28, 0.36, 0.95) if mine else Color(0.07, 0.09, 0.14, 0.96)
	var border := Color(ClientUi.CYAN, 0.55) if mine else Color(0.35, 0.42, 0.55, 0.45)
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(bg, border, 10, 1))
	var l := Label.new()
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.text = t
	l.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(l)
	panel.add_child(l)
	return panel


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
		_status.text = "Sent to global."
		await _load_global_thread()
		return

	var rid := _recipient_id
	if rid.is_empty() and not _active_convo.is_empty():
		rid = ChatManager.other_participant(_active_convo)
	if rid.is_empty():
		_status.text = "Pick a conversation or friend first — or open Global."
		_busy = false
		return
	var res: Dictionary = await ChatManager.send_private(rid, text)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Send failed"))
		return
	_compose.text = ""
	_status.text = "Sent."
	if typeof(res.data) == TYPE_DICTIONARY:
		var cid := str(res.data.get("conversation_id", ""))
		if not cid.is_empty():
			_active_convo = {"id": cid, "participant_ids": [ChatManager.char_id(), rid]}
	await _load_sidebar()
	await _load_thread()


func _on_pick_friend() -> void:
	_picking_friend = true
	_global_mode = false
	_compose.placeholder_text = "Message (max 280)"
	_meta.text = "Pick a friend to DM"
	await _load_sidebar()


func _on_global() -> void:
	_picking_friend = false
	_global_mode = true
	_active_convo = {}
	_recipient_id = ""
	_meta.text = "Global — server-wide station channel"
	_compose.placeholder_text = "Broadcast to everyone (max 280)"
	_status.text = "Global chat"
	await _load_global_thread()
	await _load_sidebar()

func _load_global_thread() -> void:
	for c in _thread.get_children():
		c.queue_free()
	var msgs: Array = await ChatManager.load_global()
	if msgs.is_empty():
		_thread.add_child(_bubble("No global messages yet — say hello to the station.", false))
		return
	var me := ChatManager.char_id()
	for m in msgs:
		var mine := str(m.get("sender_id", "")) == me
		var tag := str(m.get("sender_guild_tag", "")).strip_edges()
		var who := str(m.get("sender_name", "?"))
		var prefix := ("[%s] %s" % [tag, who]) if not tag.is_empty() else who
		_thread.add_child(_bubble("%s: %s" % [prefix, str(m.get("content", ""))], mine))
