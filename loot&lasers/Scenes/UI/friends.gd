extends Control
## Friends — list, incoming requests, search & add.

var _status: Label
var _list: VBoxContainer
var _tabs: HBoxContainer
var _filter_row: HBoxContainer
var _search: LineEdit
var _busy := false
var _name_cache := {}
var _presence_map := {}
var _tab := "friends" # friends | requests | blocked
var _online_filter := "all" # all | online | offline


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	_set_status("Loading friends…")
	await SocialManager.load_friends()
	await SocialManager.load_blocks()
	await _warm_names()
	await _warm_presence()
	_populate()
	_set_status("")


func _set_status(text: String = "", danger: bool = false) -> void:
	if not is_instance_valid(_status):
		return
	_status.text = text
	_status.visible = not text.is_empty()
	_status.add_theme_color_override(
		"font_color",
		ClientUi.DANGER if danger else ClientUi.MUTED
	)


func _warm_names() -> void:
	_name_cache.clear()
	var ids: Array = []
	for f in SocialManager.friendships:
		if typeof(f) != TYPE_DICTIONARY:
			continue
		var oid := SocialManager.friend_other_id(f)
		if not oid.is_empty():
			ids.append(oid)
	if ids.is_empty():
		return
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/Character?sort=-created_date&limit=200", null, true
	)
	if res.ok and typeof(res.data) == TYPE_ARRAY:
		for c in res.data:
			if typeof(c) == TYPE_DICTIONARY and str(c.get("id", "")) in ids:
				_name_cache[str(c.get("id", ""))] = c


func _warm_presence() -> void:
	var ids: Array = []
	for f in SocialManager.friendships:
		if typeof(f) != TYPE_DICTIONARY:
			continue
		var oid := SocialManager.friend_other_id(f)
		if not oid.is_empty():
			ids.append(oid)
	_presence_map = await PresenceManager.load_map(ids)


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 20)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_bottom", 14)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var head := HBoxContainer.new()
	root.add_child(head)
	var title_row := UiIcon.make_title_row("users", "Friends", ClientUi.TEXT, 29, 28.0)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title_row)
	var meta := Label.new()
	meta.name = "FriendsMeta"
	meta.add_theme_font_size_override("font_size", 15)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	head.add_child(meta)

	var search_row := HBoxContainer.new()
	search_row.add_theme_constant_override("separation", 8)
	root.add_child(search_row)
	_search = LineEdit.new()
	_search.placeholder_text = "Search character name…"
	_search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	search_row.add_child(_search)
	var find_btn := Button.new()
	find_btn.text = "Find"
	ClientUi.apply_primary_button(find_btn)
	find_btn.pressed.connect(_on_search)
	search_row.add_child(find_btn)

	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	root.add_child(_tabs)
	for pair in [["Friends", "friends"], ["Requests", "requests"], ["Blocked", "blocked"]]:
		var btn := Button.new()
		btn.text = str(pair[0])
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var tid := str(pair[1])
		btn.pressed.connect(func() -> void:
			_tab = tid
			_style_tabs()
			_populate()
		)
		_tabs.add_child(btn)

	_filter_row = HBoxContainer.new()
	_filter_row.add_theme_constant_override("separation", 6)
	root.add_child(_filter_row)
	for pair in [["All", "all"], ["Online", "online"], ["Offline", "offline"]]:
		var fb := Button.new()
		fb.text = str(pair[0])
		fb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var fid := str(pair[1])
		fb.pressed.connect(func() -> void:
			_online_filter = fid
			_style_filters()
			_populate()
		)
		_filter_row.add_child(fb)

	_status = ClientUi.make_status()
	_status.visible = false
	root.add_child(_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 8)
	scroll.add_child(_list)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)

	_style_tabs()
	_style_filters()


func _style_tabs() -> void:
	var ids := ["friends", "requests", "blocked"]
	var i := 0
	for child in _tabs.get_children():
		if child is Button:
			if ids[i] == _tab:
				ClientUi.apply_primary_button(child)
			else:
				ClientUi.apply_ghost_button(child)
			i += 1


func _style_filters() -> void:
	_filter_row.visible = _tab == "friends"
	var ids := ["all", "online", "offline"]
	var i := 0
	for child in _filter_row.get_children():
		if child is Button:
			if ids[i] == _online_filter:
				ClientUi.apply_primary_button(child)
			else:
				ClientUi.apply_ghost_button(child)
			i += 1


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()
	_style_tabs()
	_style_filters()

	var online_n := 0
	for f in SocialManager.friendships:
		if typeof(f) != TYPE_DICTIONARY:
			continue
		var oid := SocialManager.friend_other_id(f)
		var st := PresenceManager.display_status(_presence_map.get(oid, {}))
		if st == "online" or st == "in_mission":
			online_n += 1
	var meta := find_child("FriendsMeta", true, false) as Label
	if meta:
		meta.text = "%s friends · %s online" % [SocialManager.friendships.size(), online_n]

	if _tab == "requests":
		_list.add_child(_section("INCOMING (%s)" % SocialManager.incoming_requests.size()))
		if SocialManager.incoming_requests.is_empty():
			_list.add_child(_empty("No pending requests."))
		else:
			for r in SocialManager.incoming_requests:
				if typeof(r) == TYPE_DICTIONARY:
					_list.add_child(_make_request_row(r, true))
		_list.add_child(_section("OUTGOING (%s)" % SocialManager.outgoing_requests.size()))
		for r in SocialManager.outgoing_requests:
			if typeof(r) == TYPE_DICTIONARY:
				_list.add_child(_make_request_row(r, false))
		return

	if _tab == "blocked":
		if SocialManager.blocks.is_empty():
			_list.add_child(_empty("No blocks."))
		else:
			for b in SocialManager.blocks:
				if typeof(b) == TYPE_DICTIONARY:
					_list.add_child(_make_block_row(b))
		return

	# Friends tab
	if SocialManager.friendships.is_empty():
		_list.add_child(_empty("No friends yet — search above."))
		return
	for f in SocialManager.friendships:
		if typeof(f) != TYPE_DICTIONARY:
			continue
		var oid2 := SocialManager.friend_other_id(f)
		var st2 := PresenceManager.display_status(_presence_map.get(oid2, {}))
		var is_online := st2 == "online" or st2 == "in_mission"
		if _online_filter == "online" and not is_online:
			continue
		if _online_filter == "offline" and is_online:
			continue
		_list.add_child(_make_friend_row(f))


func _section(t: String) -> Control:
	return ClientUi.make_section_header("", t, "")


func _empty(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", 16)
	l.add_theme_color_override("font_color", Color(0.55, 0.6, 0.7))
	return l


func _make_request_row(req: Dictionary, incoming: bool) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.panel_style(Color(0.08, 0.09, 0.12, 0.95), Color(0.55, 0.45, 0.85, 0.45)))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	var lab := Label.new()
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if incoming:
		lab.text = "%s wants to be friends" % str(req.get("from_name", "?"))
	else:
		lab.text = "Pending → %s" % str(req.get("to_name", "?"))
	row.add_child(lab)
	if incoming:
		var acc := Button.new()
		acc.text = "Accept"
		ClientUi.apply_primary_button(acc)
		acc.pressed.connect(func() -> void: _on_accept(req))
		row.add_child(acc)
		var dec := Button.new()
		dec.text = "Decline"
		ClientUi.apply_ghost_button(dec)
		dec.pressed.connect(func() -> void: _on_decline(req))
		row.add_child(dec)
	else:
		var cancel := Button.new()
		cancel.text = "Cancel"
		ClientUi.apply_ghost_button(cancel)
		cancel.pressed.connect(func() -> void: _on_cancel(req))
		row.add_child(cancel)
	return panel


func _make_friend_row(friendship: Dictionary) -> PanelContainer:
	var oid := SocialManager.friend_other_id(friendship)
	var other: Dictionary = _name_cache.get(oid, {})
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.panel_style(Color(0.07, 0.09, 0.11, 0.95), Color(0.3, 0.7, 0.55, 0.45)))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	if not other.is_empty():
		row.add_child(AvatarRenderer.make_portrait(other, 40.0))
	var lab := Label.new()
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var st := PresenceManager.display_status(_presence_map.get(oid, {}))
	if other.is_empty():
		lab.text = "%s · %s" % [oid, PresenceManager.status_label(st)]
	else:
		lab.text = "%s · Lv %s %s · %s" % [
			LegacyName.full_name(other),
			str(other.get("level", 1)),
			str(other.get("class", "")),
			PresenceManager.status_label(st),
		]
	lab.add_theme_color_override("font_color", PresenceManager.status_color(st))
	row.add_child(lab)
	var prof := Button.new()
	prof.text = "Profile"
	ClientUi.apply_primary_button(prof)
	var profile_target: Dictionary = other if not other.is_empty() else {"id": oid}
	prof.pressed.connect(func() -> void: GameManager.go_public_profile(profile_target))
	row.add_child(prof)
	var msg := Button.new()
	msg.text = "Message"
	ClientUi.apply_ghost_button(msg)
	msg.pressed.connect(func() -> void:
		GameManager.pending_dm_character = other if not other.is_empty() else {"id": oid}
		GameManager.go_messages()
	)
	row.add_child(msg)
	var rem := Button.new()
	rem.text = "Remove"
	ClientUi.apply_ghost_button(rem)
	rem.pressed.connect(func() -> void: _on_remove(oid))
	row.add_child(rem)
	var blk := Button.new()
	blk.text = "Block"
	ClientUi.apply_ghost_button(blk)
	var oname := str(other.get("name", oid))
	blk.pressed.connect(func() -> void: _on_block(oid, oname))
	row.add_child(blk)
	return panel


func _make_block_row(b: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.panel_style(Color(0.1, 0.07, 0.08, 0.95), Color(0.7, 0.35, 0.35, 0.5)))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	var lab := Label.new()
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.text = str(b.get("blocked_name", b.get("blocked_id", "?")))
	row.add_child(lab)
	var ub := Button.new()
	ub.text = "Unblock"
	ClientUi.apply_primary_button(ub)
	var bid := str(b.get("id", ""))
	ub.pressed.connect(func() -> void: _on_unblock(bid))
	row.add_child(ub)
	return panel


func _on_search() -> void:
	if _busy:
		return
	_busy = true
	_set_status("Searching…")
	var hits: Array = await SocialManager.search_characters(_search.text)
	_busy = false
	for c in _list.get_children():
		c.queue_free()
	_list.add_child(_section("SEARCH RESULTS"))
	if hits.is_empty():
		_list.add_child(_empty("No matches."))
	else:
		for c in hits:
			_list.add_child(_make_search_row(c))
	var back_list := Button.new()
	back_list.text = "Back to friends list"
	ClientUi.apply_ghost_button(back_list)
	back_list.pressed.connect(func() -> void: _populate())
	_list.add_child(back_list)
	_set_status("%s matches" % hits.size())


func _make_search_row(c: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.panel_style(Color(0.08, 0.09, 0.12, 0.95), Color(0.45, 0.55, 0.75, 0.45)))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	var lab := Label.new()
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.text = "%s · Lv %s %s" % [
		LegacyName.full_name(c),
		str(c.get("level", 1)),
		str(c.get("class", "")),
	]
	row.add_child(lab)
	var prof := Button.new()
	prof.text = "Profile"
	ClientUi.apply_ghost_button(prof)
	prof.pressed.connect(func() -> void: GameManager.go_public_profile(c))
	row.add_child(prof)
	var add := Button.new()
	add.text = "Add"
	ClientUi.apply_primary_button(add)
	add.pressed.connect(func() -> void: _on_add(c))
	row.add_child(add)
	var blk := Button.new()
	blk.text = "Block"
	ClientUi.apply_ghost_button(blk)
	blk.pressed.connect(func() -> void: _on_block(str(c.get("id", "")), str(c.get("name", ""))))
	row.add_child(blk)
	var rep := Button.new()
	rep.text = "Report"
	ClientUi.apply_danger_button(rep)
	rep.pressed.connect(func() -> void: _on_report(c))
	row.add_child(rep)
	return panel


func _on_report(c: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Reporting…")
	var res: Dictionary = await SocialManager.report_player(c, "Inappropriate profile", "profile")
	_busy = false
	if res.ok:
		_set_status("Report submitted.")
	else:
		_set_status(_err(res), true)


func _on_add(c: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Sending request…")
	var res: Dictionary = await SocialManager.send_friend_request(c)
	_busy = false
	if not res.ok:
		_set_status(_err(res), true)
		return
	_set_status("Request sent.")
	await _warm_names()
	await _warm_presence()
	_populate()


func _on_accept(req: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await SocialManager.accept_friend(req)
	_busy = false
	if not res.ok:
		_set_status(_err(res), true)
		return
	_set_status("Accepted.")
	await _warm_names()
	await _warm_presence()
	_populate()


func _on_decline(req: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	await SocialManager.decline_friend(req)
	_busy = false
	_populate()


func _on_cancel(req: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	await SocialManager.cancel_friend_request(req)
	_busy = false
	_populate()


func _on_remove(other_id: String) -> void:
	if _busy:
		return
	_busy = true
	await SocialManager.remove_friend(other_id)
	_busy = false
	_populate()


func _on_block(other_id: String, other_name: String) -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await SocialManager.block_character(other_id, other_name)
	_busy = false
	if res.ok:
		_set_status("Blocked.")
	else:
		_set_status(_err(res), true)
	_populate()


func _on_unblock(block_id: String) -> void:
	if _busy:
		return
	_busy = true
	await SocialManager.unblock(block_id)
	_busy = false
	_populate()


func _err(res: Dictionary) -> String:
	var err := str(res.get("error", "Failed"))
	if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
		err = str(res.data["error"])
	return err
