extends Control
## Public character profile — career · gear · presence · social actions.

var _status: Label
var _body: VBoxContainer
var _busy := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	var target: Dictionary = GameManager.pending_profile
	if target.is_empty() or str(target.get("id", "")).is_empty():
		_status.text = "No profile selected."
		return
	_status.text = "Loading profile…"
	await SocialManager.load_friends()
	var res: Dictionary = await SocialManager.load_public_profile(str(target.get("id", "")))
	if not bool(res.get("ok", false)):
		_status.text = str(res.get("error", "Failed"))
		return
	_populate(res)
	_status.text = "Ready."


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 18)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var head := VBoxContainer.new()
	head.add_theme_constant_override("separation", 2)
	root.add_child(head)
	var eye := Label.new()
	eye.text = "DOSSIER"
	eye.add_theme_font_size_override("font_size", 13)
	eye.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.72))
	ClientUi.apply_display_font(eye)
	head.add_child(eye)
	var title := Label.new()
	title.text = "Public Profile"
	title.add_theme_font_size_override("font_size", 29)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	head.add_child(title)

	_status = ClientUi.make_status()
	root.add_child(_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(scroll)
	_body = VBoxContainer.new()
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 10)
	scroll.add_child(_body)

	var back := Button.new()
	back.text = "Back"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)


func _populate(data: Dictionary) -> void:
	for c in _body.get_children():
		c.queue_free()

	var character: Dictionary = data.get("character", {})
	var presence: Dictionary = data.get("presence", {})
	var st := PresenceManager.display_status(presence)

	# Centered modal-style sheet width.
	_body.custom_minimum_size = Vector2(0, 0)

	var hero := PanelContainer.new()
	hero.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.13, 0.97), Color(ClientUi.CYAN, 0.4), 14, 2
	))
	_body.add_child(hero)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 14)
	hero.add_child(header)
	header.add_child(AvatarRenderer.make_portrait(character, 72.0))

	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 4)
	header.add_child(info)
	var name_l := Label.new()
	var tag := str(data.get("guild_tag", ""))
	name_l.text = "%s%s" % [
		("[%s] " % tag) if not tag.is_empty() else "",
		LegacyName.profile_display_name(character),
	]
	name_l.add_theme_font_size_override("font_size", 27)
	name_l.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(name_l)
	info.add_child(name_l)

	# Web PublicProfileSheet — headline is "The X Family" in family mode, so the
	# operative behind it gets its own line.
	var operative_line := LegacyName.profile_operative_line(character)
	if not operative_line.is_empty():
		var op_lab := Label.new()
		op_lab.text = operative_line
		op_lab.add_theme_font_size_override("font_size", 18)
		op_lab.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.85))
		ClientUi.apply_body_font(op_lab)
		info.add_child(op_lab)

	var sub := Label.new()
	sub.text = "Lv %s %s · %s · %s" % [
		ClientUi.format_level(character.get("level", 1)),
		str(character.get("class", "")),
		str(character.get("race", "")),
		PresenceManager.status_label(st),
	]
	sub.add_theme_color_override("font_color", PresenceManager.status_color(st))
	ClientUi.apply_body_font(sub)
	info.add_child(sub)

	var title := str(character.get("active_title", ""))
	if not title.is_empty():
		var tl := Label.new()
		tl.text = title
		tl.add_theme_color_override("font_color", ClientUi.GOLD)
		ClientUi.apply_display_font(tl)
		info.add_child(tl)

	# Web: 3-col Rating / Wins / Losses mini stats.
	var mini := GridContainer.new()
	mini.columns = 3
	mini.add_theme_constant_override("h_separation", 8)
	mini.add_theme_constant_override("v_separation", 8)
	_body.add_child(mini)
	mini.add_child(_mini_stat("RATING", NumberDisplay.quantity(character.get("arena_rating", 1000)), ClientUi.CYAN))
	mini.add_child(_mini_stat("WINS", NumberDisplay.quantity(character.get("arena_wins", 0)), ClientUi.SUCCESS))
	mini.add_child(_mini_stat("LOSSES", NumberDisplay.quantity(character.get("arena_losses", 0)), ClientUi.DANGER))

	var bio := str(character.get("bio", ""))
	if not bio.is_empty():
		_body.add_child(_card(_p("Bio: %s" % bio)))

	var career: Dictionary = data.get("career", {})
	if not career.is_empty():
		var career_col := VBoxContainer.new()
		career_col.add_theme_constant_override("separation", 4)
		career_col.add_child(ClientUi.make_section_header("CAREER", "Lifetime", ""))
		career_col.add_child(_p("Missions %s · Arena wins %s · Dungeon clears %s · Top dmg %s" % [
			NumberDisplay.quantity(career.get("missions_completed", 0)),
			NumberDisplay.quantity(career.get("arena_wins", 0)),
			NumberDisplay.quantity(career.get("dungeon_clears", 0)),
			NumberDisplay.quantity(career.get("highest_damage", 0)),
		]))
		_body.add_child(_card(career_col))

	# Equipment as compact slot chips (not bullet list).
	var gear_col := VBoxContainer.new()
	gear_col.add_theme_constant_override("separation", 6)
	gear_col.add_child(ClientUi.make_section_header("LOADOUT", "Equipped", ""))
	var equipped: Array = data.get("equipped", [])
	if equipped.is_empty():
		gear_col.add_child(_p("No gear equipped."))
	else:
		var eg := GridContainer.new()
		eg.columns = 3
		eg.add_theme_constant_override("h_separation", 6)
		eg.add_theme_constant_override("v_separation", 6)
		gear_col.add_child(eg)
		for it in equipped:
			if typeof(it) != TYPE_DICTIONARY:
				continue
			eg.add_child(_equip_chip(it))
	_body.add_child(_card(gear_col))

	# 2-col action grid.
	var actions := GridContainer.new()
	actions.columns = 2
	actions.add_theme_constant_override("h_separation", 8)
	actions.add_theme_constant_override("v_separation", 8)
	_body.add_child(actions)

	var me_id := str(GameManager.active_character.get("id", ""))
	var tid := str(character.get("id", ""))
	if me_id != tid and not tid.is_empty():
		var msg := Button.new()
		msg.text = "Message"
		msg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_primary_button(msg)
		msg.pressed.connect(func() -> void:
			GameManager.pending_dm_character = character
			GameManager.go_messages()
		)
		actions.add_child(msg)
		var mail_btn := Button.new()
		mail_btn.text = "Mail"
		mail_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(mail_btn)
		mail_btn.pressed.connect(func() -> void:
			GameManager.go_mail(character)
		)
		actions.add_child(mail_btn)
		var friend_state := _friend_state(me_id, tid)
		var add := Button.new()
		add.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		match friend_state:
			"friends":
				add.text = "Friends"
				add.disabled = true
				ClientUi.apply_ghost_button(add)
			"pending":
				add.text = "Pending"
				add.disabled = true
				ClientUi.apply_ghost_button(add)
			_:
				add.text = "Add Friend"
				ClientUi.apply_ghost_button(add)
				add.pressed.connect(func() -> void: _on_friend(character))
		actions.add_child(add)
		var challenge := Button.new()
		challenge.text = "Challenge"
		challenge.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(challenge)
		challenge.pressed.connect(func() -> void: _on_challenge(character))
		actions.add_child(challenge)
		var guild_invite := Button.new()
		guild_invite.text = "Guild Invite"
		guild_invite.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(guild_invite)
		guild_invite.pressed.connect(func() -> void: _on_guild_invite(character))
		actions.add_child(guild_invite)
		var blk := Button.new()
		blk.text = "Block"
		blk.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(blk)
		blk.pressed.connect(func() -> void: _on_block(character))
		actions.add_child(blk)
		var rep := Button.new()
		rep.text = "Report"
		rep.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_danger_button(rep)
		rep.pressed.connect(func() -> void: _on_report(character))
		actions.add_child(rep)


func _friend_state(me_id: String, tid: String) -> String:
	for f in SocialManager.friendships:
		if typeof(f) != TYPE_DICTIONARY:
			continue
		var parts: Variant = f.get("participant_ids", [])
		if typeof(parts) == TYPE_ARRAY and tid in (parts as Array):
			return "friends"
	for r in SocialManager.incoming_requests + SocialManager.outgoing_requests:
		if typeof(r) != TYPE_DICTIONARY:
			continue
		var a := str(r.get("from_character_id", ""))
		var b := str(r.get("to_character_id", ""))
		if (a == me_id and b == tid) or (a == tid and b == me_id):
			return "pending"
	return "none"


func _mini_stat(label: String, value: String, color: Color) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.1, 0.96), Color(color, 0.45), 10, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	panel.add_child(col)
	var v := Label.new()
	v.text = value
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_theme_font_size_override("font_size", 24)
	v.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(v)
	col.add_child(v)
	var l := Label.new()
	l.text = label
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", 12)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(l)
	col.add_child(l)
	return panel


func _equip_chip(it: Dictionary) -> PanelContainer:
	var tint := ClientUi.rarity_color(str(it.get("rarity", "")))
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(0, 75)
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.07, 0.11, 0.96), Color(tint, 0.55), 8, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 2)
	panel.add_child(col)
	var t := Label.new()
	t.text = GameData.gear_type_label(str(it.get("type", ""))).to_upper()
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 11)
	t.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(t)
	col.add_child(t)
	var n := Label.new()
	n.text = str(it.get("name", "Item"))
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	n.add_theme_font_size_override("font_size", 15)
	n.add_theme_color_override("font_color", tint.lightened(0.15))
	ClientUi.apply_body_font(n)
	col.add_child(n)
	return panel


func _card(inner: Control) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.95), Color(0.3, 0.4, 0.52, 0.4), 12, 1
	))
	panel.add_child(inner)
	return panel


func _p(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", 17)
	l.add_theme_color_override("font_color", Color(0.82, 0.88, 0.94))
	ClientUi.apply_body_font(l)
	return l


func _on_friend(c: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Sending request…"
	var res: Dictionary = await SocialManager.send_friend_request(c)
	_busy = false
	_status.text = "Request sent." if res.ok else _err(res)


func _on_challenge(c: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Opening arena challenge…"
	var res: Dictionary = await ArenaManager.start_direct_challenge(str(c.get("id", "")))
	_busy = false
	if not res.ok:
		var code := str(res.get("code", ""))
		if code == "ARENA_BOARD_REFRESHED":
			_status.text = "Challengers updated — pick again from Arena."
		else:
			_status.text = _err(res)
		return
	GameManager.go_arena_combat()


func _on_guild_invite(c: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Sending guild invite…"
	var res: Dictionary = await SocialManager.invite_to_guild(c)
	_busy = false
	_status.text = "Invite sent." if res.ok else _err(res)


func _on_block(c: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await SocialManager.block_character(str(c.get("id", "")), str(c.get("name", "")))
	_busy = false
	_status.text = "Blocked." if res.ok else _err(res)


func _on_report(c: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Submitting report…"
	var res: Dictionary = await SocialManager.report_player(c, "Inappropriate profile", "profile")
	_busy = false
	_status.text = "Report submitted." if res.ok else _err(res)


func _err(res: Dictionary) -> String:
	var err := str(res.get("error", "Failed"))
	if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
		err = str(res.data["error"])
	return err
