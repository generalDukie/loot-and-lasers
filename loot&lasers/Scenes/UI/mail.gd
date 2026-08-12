extends Control
## Galactic Message Terminal — presentation parity with web MailPage.
## Folders: inbox / sent / system / deleted · claim · guild invite/request · compose.

const FOLDERS: Array = [
	{"id": "inbox", "label": "Inbox"},
	{"id": "sent", "label": "Sent"},
	{"id": "system", "label": "System"},
	{"id": "deleted", "label": "Deleted"},
]

const CATEGORIES: Array = [
	{"id": "all", "label": "All"},
	{"id": "system", "label": "System"},
	{"id": "rewards", "label": "Rewards"},
	{"id": "guild", "label": "Guild"},
	{"id": "friends", "label": "Friends"},
	{"id": "trades", "label": "Trades", "soon": true},
	{"id": "events", "label": "Events", "soon": true},
]

var _status: Label
var _meta: Label
var _list: VBoxContainer
var _detail: VBoxContainer
var _tabs: HBoxContainer
var _cat_row: HBoxContainer
var _busy := false
var _selected: Dictionary = {}
var _folder := "inbox"
var _category := "all"


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	_status.text = "Loading transmissions…"
	await MailManager.load_mail(_folder)
	_populate()
	var pending: Dictionary = GameManager.pending_mail_character if GameManager != null else {}
	if typeof(pending) == TYPE_DICTIONARY and not pending.is_empty():
		GameManager.pending_mail_character = {}
		_show_compose(pending)


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 18)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 16)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	# Header
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)
	var badge := PanelContainer.new()
	badge.custom_minimum_size = Vector2(48, 48)
	badge.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.28, 0.18, 0.06, 0.92), Color(0.95, 0.72, 0.28, 0.5), 14, 1
	))
	header.add_child(badge)
	var badge_c := CenterContainer.new()
	badge.add_child(badge_c)
	badge_c.add_child(UiIcon.make("mail", Color("#16A34A"), 22.0))

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_col.add_theme_constant_override("separation", 2)
	header.add_child(title_col)
	var title := Label.new()
	title.text = "Galactic Message Terminal"
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	title_col.add_child(title)
	_meta = Label.new()
	_meta.text = "Interstellar mail network · transmissions & packages"
	_meta.add_theme_font_size_override("font_size", 17)
	_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_meta)
	title_col.add_child(_meta)

	_status = ClientUi.make_status()
	root.add_child(_status)

	# Folder frequency bar
	var folder_panel := PanelContainer.new()
	folder_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.96), Color(ClientUi.CYAN, 0.28), 14, 1
	))
	root.add_child(folder_panel)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	folder_panel.add_child(_tabs)
	for f in FOLDERS:
		var btn := Button.new()
		btn.text = str(f.get("label", "?"))
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.custom_minimum_size.y = 44
		btn.focus_mode = Control.FOCUS_NONE
		btn.add_theme_font_size_override("font_size", 14)
		ClientUi.apply_display_font(btn)
		var fid := str(f.get("id", "inbox"))
		btn.pressed.connect(func() -> void: _on_folder(fid))
		_tabs.add_child(btn)
	_style_tabs()

	# Category chips (inbox)
	_cat_row = HBoxContainer.new()
	_cat_row.add_theme_constant_override("separation", 6)
	root.add_child(_cat_row)
	_rebuild_categories()

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	root.add_child(top)
	var compose_btn := Button.new()
	compose_btn.text = "Compose"
	ClientUi.apply_primary_button(compose_btn)
	compose_btn.pressed.connect(func() -> void: _show_compose({}))
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

	var left_panel := PanelContainer.new()
	left_panel.custom_minimum_size = Vector2(380, 0)
	left_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.045, 0.055, 0.09, 0.97), Color(0.3, 0.38, 0.48, 0.4), 16, 1
	))
	split.add_child(left_panel)
	var left_pad := MarginContainer.new()
	left_pad.add_theme_constant_override("margin_left", 8)
	left_pad.add_theme_constant_override("margin_right", 8)
	left_pad.add_theme_constant_override("margin_top", 8)
	left_pad.add_theme_constant_override("margin_bottom", 8)
	left_panel.add_child(left_pad)
	var left_scroll := ScrollContainer.new()
	left_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_pad.add_child(left_scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 8)
	left_scroll.add_child(_list)

	var right_panel := PanelContainer.new()
	right_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right_panel.size_flags_stretch_ratio = 1.6
	right_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.085, 0.98), Color(ClientUi.CYAN, 0.3), 16, 1
	))
	split.add_child(right_panel)
	var right_pad := MarginContainer.new()
	right_pad.add_theme_constant_override("margin_left", 14)
	right_pad.add_theme_constant_override("margin_right", 14)
	right_pad.add_theme_constant_override("margin_top", 12)
	right_pad.add_theme_constant_override("margin_bottom", 12)
	right_panel.add_child(right_pad)
	var right_scroll := ScrollContainer.new()
	right_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right_pad.add_child(right_scroll)
	_detail = VBoxContainer.new()
	_detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_detail.add_theme_constant_override("separation", 10)
	right_scroll.add_child(_detail)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)


func _rebuild_categories() -> void:
	for c in _cat_row.get_children():
		c.queue_free()
	_cat_row.visible = _folder == "inbox"
	if _folder != "inbox":
		return
	for cat in CATEGORIES:
		var btn := Button.new()
		var soon := bool(cat.get("soon", false))
		btn.text = str(cat.get("label", "?")) + (" · Soon" if soon else "")
		btn.focus_mode = Control.FOCUS_NONE
		btn.disabled = soon
		btn.custom_minimum_size = Vector2(0, 32)
		btn.add_theme_font_size_override("font_size", 12)
		ClientUi.apply_display_font(btn)
		var cid := str(cat.get("id", "all"))
		if not soon:
			btn.pressed.connect(func() -> void:
				_category = cid
				_rebuild_categories()
				_populate()
			)
		if cid == _category and not soon:
			ClientUi.apply_primary_button(btn)
		else:
			ClientUi.apply_ghost_button(btn)
		_cat_row.add_child(btn)


func _style_tabs() -> void:
	var i := 0
	for child in _tabs.get_children():
		if child is Button:
			var fid := str(FOLDERS[i].get("id", "")) if i < FOLDERS.size() else ""
			if fid == _folder:
				ClientUi.apply_primary_button(child)
			else:
				ClientUi.apply_ghost_button(child)
			(child as Button).custom_minimum_size.y = 44
			i += 1


func _on_folder(folder: String) -> void:
	if _busy or folder == _folder:
		return
	_folder = folder
	_category = "all"
	_selected = {}
	_style_tabs()
	_rebuild_categories()
	_busy = true
	_status.text = "Loading…"
	await MailManager.load_mail(_folder)
	_busy = false
	_populate()


func _mail_matches_category(mail: Dictionary) -> bool:
	if _folder != "inbox" or _category == "all":
		return true
	var type := str(mail.get("mail_type", "player")).to_lower()
	match _category:
		"rewards":
			return bool(mail.get("has_rewards", false))
		"guild":
			return type.contains("guild")
		"system":
			return type == "system" or type == "admin"
		"friends":
			return type == "player" or type == "friend"
		"trades":
			return type == "trade" or type == "auction"
		"events":
			return type == "event" or type == "daily"
		_:
			return true


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()
	var label := _folder.capitalize()
	var visible_mails: Array = []
	for m in MailManager.inbox:
		if typeof(m) == TYPE_DICTIONARY and _mail_matches_category(m):
			visible_mails.append(m)
	_meta.text = "%s · %s transmission%s%s" % [
		label,
		visible_mails.size(),
		"" if visible_mails.size() == 1 else "s",
		(" · %s unread" % MailManager.unread_count) if _folder == "inbox" else "",
	]
	if visible_mails.is_empty():
		_status.text = ""
		_list.add_child(_empty_list_card())
		_show_detail({})
		return
	_status.text = ""
	for m in visible_mails:
		_list.add_child(_make_row(m))
	if not _selected.is_empty():
		var sid := str(_selected.get("id", ""))
		var found := {}
		for m in visible_mails:
			if str(m.get("id", "")) == sid:
				found = m
				break
		_show_detail(found if not found.is_empty() else {})


func _empty_list_card() -> Control:
	var wrap := PanelContainer.new()
	wrap.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.9), Color(ClientUi.CYAN, 0.22), 14, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	wrap.add_child(col)
	var t := Label.new()
	t.text = "No incoming transmissions"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 15)
	ClientUi.apply_display_font(t)
	col.add_child(t)
	var s := Label.new()
	s.text = "Galactic communications are quiet… for now."
	s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	s.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	s.add_theme_font_size_override("font_size", 12)
	s.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(s)
	col.add_child(s)
	return wrap


func _is_selected_mail(mail: Dictionary) -> bool:
	var sid := str(_selected.get("id", ""))
	return not sid.is_empty() and str(mail.get("id", "")) == sid


func _apply_row_style(panel: PanelContainer, mail: Dictionary, btn: Button = null) -> void:
	var unread := not bool(mail.get("read", false)) and _folder != "deleted"
	var has_reward := bool(mail.get("has_rewards", false)) and not bool(mail.get("claimed", false))
	var selected := _is_selected_mail(mail)
	var border := Color(0.95, 0.75, 0.35, 0.65) if has_reward else (Color(ClientUi.CYAN, 0.55) if unread else Color(0.35, 0.42, 0.55, 0.4))
	var bg := Color(0.08, 0.14, 0.18, 0.95) if unread else Color(0.06, 0.07, 0.11, 0.94)
	var border_w := 1
	if selected:
		bg = Color(0.05, 0.22, 0.28, 0.98)
		border = ClientUi.CYAN
		border_w = 2
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(bg, border, 12, border_w))
	if btn != null and is_instance_valid(btn):
		btn.add_theme_color_override(
			"font_color",
			ClientUi.CYAN_SOFT if selected else (ClientUi.TEXT if unread else Color(0.78, 0.84, 0.90))
		)


func _style_mail_rows() -> void:
	if not is_instance_valid(_list):
		return
	for child in _list.get_children():
		if not (child is PanelContainer) or not child.has_meta("mail"):
			continue
		var mail: Variant = child.get_meta("mail")
		if typeof(mail) != TYPE_DICTIONARY:
			continue
		var btn: Button = child.get_node_or_null("MailRowButton") as Button
		_apply_row_style(child as PanelContainer, mail, btn)


func _make_row(mail: Dictionary) -> PanelContainer:
	var unread := not bool(mail.get("read", false)) and _folder != "deleted"
	var has_reward := bool(mail.get("has_rewards", false)) and not bool(mail.get("claimed", false))
	var claimed := bool(mail.get("claimed", false))
	var panel := PanelContainer.new()
	panel.set_meta("mail", mail.duplicate(true))
	var btn := Button.new()
	btn.name = "MailRowButton"
	btn.flat = true
	btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size.y = 72
	var tags := ""
	if has_reward:
		tags += " · PACKAGE"
	if claimed:
		tags += " · CLAIMED"
	if unread:
		tags += " · NEW"
	btn.text = "%s%s\n%s · %s" % [
		str(mail.get("subject", "(no subject)")),
		tags,
		str(mail.get("from_name", "?")),
		str(mail.get("mail_type", "player")).replace("_", " "),
	]
	btn.pressed.connect(func() -> void: _open(mail))
	panel.add_child(btn)
	_apply_row_style(panel, mail, btn)
	return panel


func _open(mail: Dictionary) -> void:
	_selected = mail
	_style_mail_rows()
	_status.text = "Opening transmission…"
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
		empty.text = "Select a transmission to read."
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(empty)
		_detail.add_child(empty)
		return

	var title := Label.new()
	title.text = str(mail.get("subject", "(no subject)"))
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.add_theme_font_size_override("font_size", 22)
	ClientUi.apply_display_font(title)
	_detail.add_child(title)

	var meta := Label.new()
	meta.text = "From %s · %s · %s" % [
		str(mail.get("from_name", "?")),
		str(mail.get("mail_type", "")).replace("_", " "),
		str(mail.get("created_date", "")).substr(0, 16),
	]
	meta.add_theme_font_size_override("font_size", 17)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	_detail.add_child(meta)

	var body_panel := PanelContainer.new()
	body_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.1, 0.95), Color(0.3, 0.38, 0.48, 0.4), 12, 1
	))
	_detail.add_child(body_panel)
	var body := Label.new()
	body.text = str(mail.get("body", ""))
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_theme_font_size_override("font_size", 19)
	ClientUi.apply_body_font(body)
	body_panel.add_child(body)

	var mid := str(mail.get("id", ""))
	var mtype := str(mail.get("mail_type", ""))
	var is_deleted := str(mail.get("folder", _folder)) == "deleted" or _folder == "deleted"
	var claimed := bool(mail.get("claimed", false))
	var has_reward := bool(mail.get("has_rewards", false))

	if has_reward:
		var reward_panel := PanelContainer.new()
		var rborder := Color(0.3, 0.75, 0.45, 0.55) if claimed else Color(0.95, 0.72, 0.28, 0.65)
		var rbg := Color(0.06, 0.16, 0.1, 0.92) if claimed else Color(0.18, 0.12, 0.04, 0.92)
		reward_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(rbg, rborder, 12, 1))
		_detail.add_child(reward_panel)
		var rcol := VBoxContainer.new()
		rcol.add_theme_constant_override("separation", 8)
		reward_panel.add_child(rcol)
		var rlab := Label.new()
		rlab.text = "Package Claimed" if claimed else "Attached Transmission Package"
		rlab.add_theme_font_size_override("font_size", 18)
		ClientUi.apply_display_font(rlab)
		rcol.add_child(rlab)
		var summary := Label.new()
		summary.text = _reward_summary(mail.get("rewards", {}))
		summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		summary.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(summary)
		rcol.add_child(summary)
		if not is_deleted and not claimed:
			var claim := Button.new()
			claim.text = "Claim Rewards"
			ClientUi.apply_primary_button(claim)
			claim.pressed.connect(func() -> void: _on_claim(mid))
			rcol.add_child(claim)
		elif claimed:
			var done := Label.new()
			done.text = "✓ Claimed — added to wallet & inventory"
			done.add_theme_color_override("font_color", Color(0.45, 0.9, 0.6))
			ClientUi.apply_display_font(done)
			rcol.add_child(done)

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


func _reward_summary(rewards: Variant) -> String:
	if typeof(rewards) != TYPE_DICTIONARY:
		return "Attached package"
	var r: Dictionary = rewards
	var parts: PackedStringArray = []
	if int(r.get("stardust", 0)) > 0:
		parts.append("%s Stardust" % int(r.get("stardust", 0)))
	if int(r.get("nova_crystals", 0)) > 0:
		parts.append("%s Nova" % int(r.get("nova_crystals", 0)))
	if int(r.get("fuel", 0)) > 0:
		parts.append("%s Fuel" % int(r.get("fuel", 0)))
	if str(r.get("item_rarity", "")) != "":
		parts.append("%s gear" % str(r.get("item_rarity", "")))
	return " · ".join(parts) if not parts.is_empty() else "Attached package"


func _on_claim(mail_id: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Claiming package…"
	var res: Dictionary = await MailManager.claim_mail(mail_id)
	_busy = false
	if not res.ok:
		_status.text = _err(res)
		return
	_status.text = "Rewards claimed."
	await MailManager.load_mail(_folder)
	# Keep selected but refresh claimed state
	for m in MailManager.inbox:
		if typeof(m) == TYPE_DICTIONARY and str(m.get("id", "")) == mail_id:
			_selected = m
			break
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
	await MailManager.load_mail(_folder)
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
	await MailManager.load_mail(_folder)
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
	await MailManager.load_mail(_folder)
	_populate()


func _err(res: Dictionary) -> String:
	var err := str(res.get("error", "Failed"))
	if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
		err = str(res.data["error"])
	return err


func _show_compose(forced_recipient: Dictionary = {}) -> void:
	for c in _detail.get_children():
		c.queue_free()
	_status.text = "Loading recipients…"
	var recipients: Array = await MailManager.mail_compose_recipients()
	if not forced_recipient.is_empty():
		var fid := str(forced_recipient.get("id", forced_recipient.get("character_id", "")))
		var found := false
		for r in recipients:
			if typeof(r) == TYPE_DICTIONARY and str(r.get("id", "")) == fid:
				found = true
				break
		if not found and not fid.is_empty():
			recipients.push_front({
				"id": fid,
				"name": str(forced_recipient.get("name", "Player")),
				"level": int(forced_recipient.get("level", 1)),
			})
	if recipients.is_empty():
		_status.text = "No recipient selected."
		var empty := Label.new()
		empty.text = "Open a player from Rankings or their profile and tap Mail."
		empty.add_theme_color_override("font_color", Color(0.55, 0.6, 0.7))
		_detail.add_child(empty)
		return
	_status.text = "Compose a transmission."
	var title := Label.new()
	title.text = "Compose Transmission"
	title.add_theme_font_size_override("font_size", 22)
	ClientUi.apply_display_font(title)
	_detail.add_child(title)

	var to_lab := Label.new()
	to_lab.text = "To"
	to_lab.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	_detail.add_child(to_lab)
	var to_opt := OptionButton.new()
	var select_i := 0
	var forced_id := str(forced_recipient.get("id", forced_recipient.get("character_id", "")))
	for r in recipients:
		if typeof(r) != TYPE_DICTIONARY:
			continue
		to_opt.add_item("%s (Lv %s)" % [str(r.get("name", "?")), int(r.get("level", 1))])
		to_opt.set_item_metadata(to_opt.item_count - 1, r)
		if not forced_id.is_empty() and str(r.get("id", "")) == forced_id:
			select_i = to_opt.item_count - 1
	if to_opt.item_count > 0:
		to_opt.select(select_i)
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
	send.text = "Send Transmission"
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
	_status.text = "Transmission sent."
	_folder = "sent"
	_style_tabs()
	_rebuild_categories()
	await MailManager.load_mail(_folder)
	_populate()
	_show_detail({})
