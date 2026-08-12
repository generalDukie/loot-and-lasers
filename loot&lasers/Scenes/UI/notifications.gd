extends Control
## Notifications — mirrors web NotificationsTab (type tint · mark read · actions).

const TYPE_META := {
	"friend_request": {"label": "Friend Request", "color": Color("#A855F7")},
	"private_message": {"label": "Message", "color": Color("#22D3EE")},
	"mail": {"label": "Mail", "color": Color("#F59E0B")},
	"chat_mention": {"label": "Mention", "color": Color("#34D399")},
	"daily": {"label": "Daily Reward", "color": Color("#FFD700")},
	"system": {"label": "System", "color": Color("#FB7185")},
	"stat_points": {"label": "Attribute Points", "color": Color("#22D3EE")},
	"achievement": {"label": "Achievement", "color": Color("#FFD700")},
	"arena_defense": {"label": "Arena Defense", "color": Color("#EF4444")},
	"arena": {"label": "Arena", "color": Color("#F97316")},
	"mining": {"label": "Mining", "color": Color("#A3E635")},
	"mission": {"label": "Mission", "color": Color("#38BDF8")},
	"dungeon": {"label": "Dungeon", "color": Color("#A855F7")},
}

var _status: Label
var _meta: Label
var _list: VBoxContainer
var _busy := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	_status.text = "Loading notifications…"
	await NotificationManager.load_inbox()
	_populate()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	# Web NotificationCenter: floating BR panel ~22rem — approximate with right-aligned sheet.
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 40)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_top", 40)
	margin.add_theme_constant_override("margin_bottom", 18)
	add_child(margin)

	var align := HBoxContainer.new()
	align.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_child(align)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	align.add_child(spacer)

	var sheet := PanelContainer.new()
	sheet.custom_minimum_size = Vector2(480, 0)
	sheet.size_flags_horizontal = Control.SIZE_SHRINK_END
	sheet.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sheet.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.09, 0.98), Color(ClientUi.CYAN, 0.4), 14, 2
	))
	align.add_child(sheet)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	sheet.add_child(root)

	var header := HBoxContainer.new()
	root.add_child(header)
	var head_l := VBoxContainer.new()
	head_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_l.add_theme_constant_override("separation", 2)
	header.add_child(head_l)
	var eye := Label.new()
	eye.text = "INBOX"
	eye.add_theme_font_size_override("font_size", 13)
	eye.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.72))
	ClientUi.apply_display_font(eye)
	head_l.add_child(eye)
	head_l.add_child(UiIcon.make_title_row("bell", "Notifications", ClientUi.TEXT, 24, 24.0))
	_meta = Label.new()
	_meta.add_theme_font_size_override("font_size", 19)
	_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_meta)
	head_l.add_child(_meta)

	var mark := Button.new()
	mark.text = "Mark all"
	ClientUi.apply_ghost_button(mark)
	mark.pressed.connect(_on_mark_all)
	header.add_child(mark)

	_status = ClientUi.make_status()
	root.add_child(_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(0, 373)
	root.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 6)
	scroll.add_child(_list)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	root.add_child(row)
	var refresh := Button.new()
	refresh.text = "Refresh"
	ClientUi.apply_ghost_button(refresh)
	refresh.pressed.connect(func() -> void: await _boot())
	row.add_child(refresh)
	var back := Button.new()
	back.text = "Close"
	ClientUi.apply_shell_back(back, self)
	back.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	row.add_child(back)


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()
	var unread: int = NotificationManager.unread_count
	_meta.text = "%s unread of %s" % [unread, NotificationManager.notifications.size()]
	if unread > 0:
		_meta.add_theme_color_override("font_color", ClientUi.DANGER)
	else:
		_meta.add_theme_color_override("font_color", ClientUi.MUTED)

	# Web NotificationCenter: daily-ready chip when unclaimed.
	if ProgressManager.can_claim_daily():
		var daily := PanelContainer.new()
		daily.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.12, 0.1, 0.04, 0.97), Color(ClientUi.GOLD, 0.55), 10, 1
		))
		_list.add_child(daily)
		var drow := HBoxContainer.new()
		drow.add_theme_constant_override("separation", 8)
		daily.add_child(drow)
		var daily_title := UiIcon.make_title_row("calendar", "Daily login ready", Color("#FDE68A"), 16, 20.0)
		daily_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		drow.add_child(daily_title)
		var dbtn := Button.new()
		dbtn.text = "Open"
		ClientUi.apply_primary_button(dbtn)
		dbtn.pressed.connect(func() -> void:
			var shell := get_tree().current_scene
			if shell != null and shell.has_method("open_daily_login_modal"):
				shell.open_daily_login_modal()
			else:
				await ProgressManager.claim_daily()
				await ProgressManager.load_daily()
				_populate()
		)
		drow.add_child(dbtn)

	if NotificationManager.notifications.is_empty() and not ProgressManager.can_claim_daily():
		_status.text = ""
		_list.add_child(_empty_state())
		return
	_status.text = "Ready."
	for n in NotificationManager.notifications:
		if typeof(n) == TYPE_DICTIONARY:
			_list.add_child(_make_row(n))


func _empty_state() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.9), Color(0.3, 0.38, 0.48, 0.4), 14, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)
	var icon_center := CenterContainer.new()
	icon_center.add_child(UiIcon.make("bell", ClientUi.MUTED, 37.0))
	col.add_child(icon_center)
	var lab := Label.new()
	lab.text = "No notifications yet."
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(lab)
	col.add_child(lab)
	return panel


func _make_row(n: Dictionary) -> PanelContainer:
	var unread := not bool(n.get("read", false))
	var ntype := str(n.get("type", "system"))
	var meta: Dictionary = TYPE_META.get(ntype, TYPE_META["system"])
	var tint: Color = meta.get("color", Color("#FB7185"))
	var panel := PanelContainer.new()
	panel.modulate.a = 1.0 if unread else 0.62
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.07, 0.09, 0.13, 0.96) if unread else Color(0.06, 0.07, 0.1, 0.9),
		Color(tint, 0.55) if unread else Color(0.3, 0.36, 0.45, 0.35),
		10, 1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)

	var badge := PanelContainer.new()
	badge.custom_minimum_size = Vector2(48, 48)
	var badge_s := StyleBoxFlat.new()
	badge_s.bg_color = Color(tint, 0.18)
	badge_s.set_corner_radius_all(8)
	badge.add_theme_stylebox_override("panel", badge_s)
	row.add_child(badge)
	var badge_l := Label.new()
	badge_l.text = str(meta.get("label", "System")).substr(0, 1)
	badge_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge_l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	badge_l.add_theme_color_override("font_color", tint)
	badge_l.add_theme_font_size_override("font_size", 19)
	ClientUi.apply_display_font(badge_l)
	badge.add_child(badge_l)

	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 4)
	row.add_child(col)

	var type_l := Label.new()
	type_l.text = str(meta.get("label", ntype))
	type_l.add_theme_font_size_override("font_size", 17)
	type_l.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(type_l)
	col.add_child(type_l)

	var title := Label.new()
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.text = "%s — %s" % [str(n.get("title", "Notice")), str(n.get("body", ""))]
	title.add_theme_font_size_override("font_size", 17)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(title)
	col.add_child(title)

	var meta_l := Label.new()
	meta_l.text = _time_ago(str(n.get("created_date", "")))
	meta_l.add_theme_font_size_override("font_size", 19)
	meta_l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta_l)
	col.add_child(meta_l)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	col.add_child(actions)
	if ntype == "friend_request" and unread:
		var acc := Button.new()
		acc.text = "Accept"
		ClientUi.apply_primary_button(acc)
		var capt: Dictionary = n
		acc.pressed.connect(func() -> void: _act(capt, true))
		actions.add_child(acc)
		var dec := Button.new()
		dec.text = "Decline"
		ClientUi.apply_ghost_button(dec)
		dec.pressed.connect(func() -> void: _act(capt, false))
		actions.add_child(dec)
	elif unread:
		var read_btn := Button.new()
		read_btn.text = "Mark read"
		ClientUi.apply_ghost_button(read_btn)
		var capt2: Dictionary = n
		read_btn.pressed.connect(func() -> void: _mark_one(capt2))
		actions.add_child(read_btn)
	if ntype == "mail":
		var mail_btn := Button.new()
		mail_btn.text = "Open Mail"
		ClientUi.apply_ghost_button(mail_btn)
		mail_btn.pressed.connect(func() -> void: GameManager.go_mail())
		actions.add_child(mail_btn)
	elif ntype == "private_message":
		var msg_btn := Button.new()
		msg_btn.text = "Messages"
		ClientUi.apply_ghost_button(msg_btn)
		msg_btn.pressed.connect(func() -> void: GameManager.go_messages())
		actions.add_child(msg_btn)
	return panel


func _time_ago(date_str: String) -> String:
	if date_str.is_empty():
		return ""
	var t := Time.get_unix_time_from_datetime_string(date_str.replace("Z", "").replace("T", " "))
	if t <= 0:
		return date_str
	var mins := int((Time.get_unix_time_from_system() - t) / 60.0)
	if mins < 1:
		return "just now"
	if mins < 60:
		return "%sm ago" % mins
	var hrs := int(mins / 60.0)
	if hrs < 24:
		return "%sh ago" % hrs
	return "%sd ago" % int(hrs / 24.0)


func _act(n: Dictionary, accept: bool) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Accepting…" if accept else "Declining…"
	var res: Dictionary = await NotificationManager.act_on(n, accept)
	_busy = false
	_status.text = "Done." if res.ok else str(res.get("error", "Failed"))
	_populate()


func _mark_one(n: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	await NotificationManager.mark_read(str(n.get("id", "")))
	_busy = false
	_populate()


func _on_mark_all() -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Marking…"
	await NotificationManager.mark_all_read()
	_busy = false
	_populate()
