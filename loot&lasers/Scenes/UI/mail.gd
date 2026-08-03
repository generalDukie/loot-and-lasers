extends Control
## Mail — inbox / sent / system / deleted · claim · guild invite/request.

const FOLDERS: Array = [
	{"id": "inbox", "label": "Inbox"},
	{"id": "sent", "label": "Sent"},
	{"id": "system", "label": "System"},
	{"id": "deleted", "label": "Deleted"},
]

var _status: Label
var _meta: Label
var _list: VBoxContainer
var _detail: VBoxContainer
var _tabs: HBoxContainer
var _busy := false
var _selected: Dictionary = {}
var _folder := "inbox"


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	_status.text = "Loading mail…"
	await MailManager.load_mail(_folder)
	_populate()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 20)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	margin.add_child(root)

	root.add_child(ClientUi.make_title("MAIL", 28))
	_meta = ClientUi.make_subtitle("FOLDERS · COMPOSE · CLAIM")
	root.add_child(_meta)

	_status = ClientUi.make_status()
	root.add_child(_status)

	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	root.add_child(_tabs)
	for f in FOLDERS:
		var btn := Button.new()
		btn.text = str(f.get("label", "?"))
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var fid := str(f.get("id", "inbox"))
		btn.pressed.connect(func() -> void: _on_folder(fid))
		_tabs.add_child(btn)
	_style_tabs()

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	root.add_child(top)
	var compose_btn := Button.new()
	compose_btn.text = "Compose"
	ClientUi.apply_primary_button(compose_btn)
	compose_btn.pressed.connect(_show_compose)
	top.add_child(compose_btn)
	var refresh := Button.new()
	refresh.text = "Refresh"
	ClientUi.apply_ghost_button(refresh)
	refresh.pressed.connect(func() -> void: await _boot())
	top.add_child(refresh)

	var split := HBoxContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 12)
	root.add_child(split)

	# Web MailPage: fixed-ish list pane + expanding reading pane.
	var left_scroll := ScrollContainer.new()
	left_scroll.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	left_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_scroll.custom_minimum_size = Vector2(400, 0)
	split.add_child(left_scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.custom_minimum_size = Vector2(373, 0)
	_list.add_theme_constant_override("separation", 6)
	left_scroll.add_child(_list)

	var right_scroll := ScrollContainer.new()
	right_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right_scroll.size_flags_stretch_ratio = 1.6
	split.add_child(right_scroll)
	_detail = VBoxContainer.new()
	_detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_detail.add_theme_constant_override("separation", 8)
	right_scroll.add_child(_detail)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)


func _style_tabs() -> void:
	var i := 0
	for child in _tabs.get_children():
		if child is Button:
			var fid := str(FOLDERS[i].get("id", "")) if i < FOLDERS.size() else ""
			if fid == _folder:
				ClientUi.apply_primary_button(child)
			else:
				ClientUi.apply_ghost_button(child)
			i += 1


func _on_folder(folder: String) -> void:
	if _busy or folder == _folder:
		return
	_folder = folder
	_selected = {}
	_style_tabs()
	_busy = true
	_status.text = "Loading…"
	await MailManager.load_mail(_folder)
	_busy = false
	_populate()


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()
	var label := _folder.capitalize()
	_meta.text = "%s · %s messages%s" % [
		label,
		MailManager.inbox.size(),
		(" · %s unread" % MailManager.unread_count) if _folder == "inbox" else "",
	]
	if MailManager.inbox.is_empty():
		_status.text = "No mail in %s." % label
		_show_detail({})
		return
	_status.text = "Select a message."
	for m in MailManager.inbox:
		if typeof(m) == TYPE_DICTIONARY:
			_list.add_child(_make_row(m))
	if not _selected.is_empty():
		var sid := str(_selected.get("id", ""))
		var found := {}
		for m in MailManager.inbox:
			if typeof(m) == TYPE_DICTIONARY and str(m.get("id", "")) == sid:
				found = m
				break
		_show_detail(found)


func _make_row(mail: Dictionary) -> PanelContainer:
	var unread := not bool(mail.get("read", false)) and _folder != "deleted"
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.panel_style(
		Color(0.08, 0.09, 0.12, 0.95),
		Color(0.95, 0.75, 0.35, 0.7) if unread else Color(0.4, 0.5, 0.65, 0.4)
	))
	var btn := Button.new()
	btn.flat = true
	btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
	var reward := " · REWARD" if bool(mail.get("has_rewards", false)) and not bool(mail.get("claimed", false)) else ""
	btn.text = "%s%s\nfrom %s · %s" % [
		str(mail.get("subject", "(no subject)")),
		reward,
		str(mail.get("from_name", "?")),
		str(mail.get("mail_type", "player")),
	]
	btn.pressed.connect(func() -> void: _open(mail))
	panel.add_child(btn)
	return panel


func _open(mail: Dictionary) -> void:
	_selected = mail
	_status.text = "Opening…"
	var res: Dictionary = await MailManager.load_message(str(mail.get("id", "")))
	if bool(res.get("ok", false)) and typeof(res.get("data", {})) == TYPE_DICTIONARY:
		_selected = res.data
	_show_detail(_selected)
	if _folder != "deleted" and not bool(_selected.get("read", false)):
		await MailManager.mark_read(str(_selected.get("id", "")))
		_populate()


func _show_detail(mail: Dictionary) -> void:
	for c in _detail.get_children():
		c.queue_free()
	if mail.is_empty():
		var empty := Label.new()
		empty.text = "No message selected."
		empty.add_theme_color_override("font_color", Color(0.55, 0.6, 0.7))
		_detail.add_child(empty)
		return

	var title := Label.new()
	title.text = str(mail.get("subject", "(no subject)"))
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.add_theme_font_size_override("font_size", 24)
	_detail.add_child(title)

	var meta := Label.new()
	meta.text = "From %s → %s · %s · %s" % [
		str(mail.get("from_name", "?")),
		str(mail.get("to_name", "?")),
		str(mail.get("mail_type", "")),
		str(mail.get("folder", _folder)),
	]
	meta.add_theme_font_size_override("font_size", 16)
	meta.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	_detail.add_child(meta)

	var body := Label.new()
	body.text = str(mail.get("body", ""))
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_theme_font_size_override("font_size", 19)
	_detail.add_child(body)

	var mid := str(mail.get("id", ""))
	var mtype := str(mail.get("mail_type", ""))
	var is_deleted := str(mail.get("folder", _folder)) == "deleted" or _folder == "deleted"

	if not is_deleted and bool(mail.get("has_rewards", false)) and not bool(mail.get("claimed", false)):
		var claim := Button.new()
		claim.text = "Claim Rewards"
		ClientUi.apply_primary_button(claim)
		claim.pressed.connect(func() -> void: _on_claim(mid))
		_detail.add_child(claim)

	if not is_deleted and mtype in ["guild_invite", "guild_request"]:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		_detail.add_child(row)
		var acc := Button.new()
		acc.text = "Accept"
		acc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_primary_button(acc)
		acc.pressed.connect(func() -> void: _on_guild_mail(mail, true))
		row.add_child(acc)
		var dec := Button.new()
		dec.text = "Decline"
		dec.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(dec)
		dec.pressed.connect(func() -> void: _on_guild_mail(mail, false))
		row.add_child(dec)

	if is_deleted:
		var restore := Button.new()
		restore.text = "Restore to Inbox"
		ClientUi.apply_primary_button(restore)
		restore.pressed.connect(func() -> void: _on_restore(mid))
		_detail.add_child(restore)
	else:
		var del := Button.new()
		del.text = "Delete"
		ClientUi.apply_ghost_button(del)
		del.pressed.connect(func() -> void: _on_delete(mid))
		_detail.add_child(del)


func _on_claim(mail_id: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Claiming…"
	var res: Dictionary = await MailManager.claim_mail(mail_id)
	_busy = false
	if not res.ok:
		_status.text = _err(res)
		return
	_status.text = "Rewards claimed."
	_selected = {}
	_populate()


func _on_delete(mail_id: String) -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await MailManager.delete_mail(mail_id)
	_busy = false
	if not res.ok:
		_status.text = _err(res)
		return
	_status.text = "Moved to Deleted."
	_selected = {}
	_populate()


func _on_restore(mail_id: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Restoring…"
	var res: Dictionary = await MailManager.restore_mail(mail_id)
	_busy = false
	if not res.ok:
		_status.text = _err(res)
		return
	_status.text = "Restored to Inbox."
	_selected = {}
	_populate()


func _on_guild_mail(mail: Dictionary, accept: bool) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Accepting…" if accept else "Declining…"
	var res: Dictionary = await SocialManager.handle_guild_mail(mail, accept)
	_busy = false
	if not res.ok:
		_status.text = _err(res)
		return
	_status.text = "Done."
	_selected = {}
	_populate()


func _err(res: Dictionary) -> String:
	var err := str(res.get("error", "Failed"))
	if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
		err = str(res.data["error"])
	return err


func _show_compose() -> void:
	for c in _detail.get_children():
		c.queue_free()
	_status.text = "Loading recipients…"
	var recipients: Array = await MailManager.mail_compose_recipients()
	if recipients.is_empty():
		_status.text = "No friends to mail."
		var empty := Label.new()
		empty.text = "Add friends to send player mail."
		empty.add_theme_color_override("font_color", Color(0.55, 0.6, 0.7))
		_detail.add_child(empty)
		return
	_status.text = "Compose a message."
	var title := Label.new()
	title.text = "Compose"
	title.add_theme_font_size_override("font_size", 24)
	_detail.add_child(title)

	var to_lab := Label.new()
	to_lab.text = "To (friends)"
	to_lab.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	_detail.add_child(to_lab)
	var to_opt := OptionButton.new()
	for r in recipients:
		if typeof(r) != TYPE_DICTIONARY:
			continue
		to_opt.add_item("%s (Lv %s)" % [str(r.get("name", "?")), str(r.get("level", 1))])
		to_opt.set_item_metadata(to_opt.item_count - 1, r)
	_detail.add_child(to_opt)

	var subj := LineEdit.new()
	subj.placeholder_text = "Subject"
	_detail.add_child(subj)
	var body := TextEdit.new()
	body.placeholder_text = "Message (max 1000)"
	body.custom_minimum_size = Vector2(0, 160)
	body.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_detail.add_child(body)

	var send := Button.new()
	send.text = "Send"
	ClientUi.apply_primary_button(send)
	send.pressed.connect(func() -> void: _on_send(to_opt, subj.text, body.text))
	_detail.add_child(send)


func _on_send(to_opt: OptionButton, subject: String, body: String) -> void:
	if _busy:
		return
	if to_opt.item_count <= 0:
		_status.text = "No recipient."
		return
	var target: Variant = to_opt.get_item_metadata(to_opt.selected)
	if typeof(target) != TYPE_DICTIONARY:
		_status.text = "Pick a recipient."
		return
	_busy = true
	_status.text = "Sending…"
	var res: Dictionary = await MailManager.send_player_mail_to(target, subject, body)
	_busy = false
	if not res.ok:
		_status.text = _err(res)
		return
	_status.text = "Sent."
	_folder = "sent"
	_style_tabs()
	await MailManager.load_mail(_folder)
	_populate()
	_show_detail({})
