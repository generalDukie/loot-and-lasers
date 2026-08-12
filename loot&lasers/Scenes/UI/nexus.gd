extends Control
## Command Nexus — mirrors web (chatter · owner hero · declare · hall of fame).

var _status: Label
var _chatter: Label
var _owner_panel: PanelContainer
var _owner_col: VBoxContainer
var _declare_panel: PanelContainer
var _declare_col: VBoxContainer
var _owner_perk_panel: PanelContainer
var _log: Label
var _hof: VBoxContainer
var _busy := false
var _chatter_lines: PackedStringArray = []
var _chatter_i := 0
var _chatter_timer: Timer


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	_chatter_timer = Timer.new()
	_chatter_timer.wait_time = 7.0
	_chatter_timer.timeout.connect(_rotate_chatter)
	add_child(_chatter_timer)
	_chatter_timer.start()
	await _boot()


func _boot() -> void:
	_set_status("Loading Nexus…")
	await SocialManager.load_my_guild()
	var res: Dictionary = await NexusManager.load_nexus()
	if not res.ok:
		_set_status(str(res.get("error", "Failed to load Nexus")))
	else:
		_set_status("")
	_populate()
	await _load_hof()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "combat"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 18)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 8)
	margin.add_child(root)

	root.add_child(UiIcon.make_title_row("crown", "Galactic Command Nexus", ClientUi.TEXT, 27, 28.0))

	# NexusChatter — icon + rotating italic line.
	var chatter_panel := PanelContainer.new()
	chatter_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.1, 0.72), Color(0.28, 0.36, 0.48, 0.4), 12, 1
	))
	root.add_child(chatter_panel)
	var chatter_row := HBoxContainer.new()
	chatter_row.add_theme_constant_override("separation", 8)
	chatter_panel.add_child(chatter_row)
	var chatter_icon := UiIcon.make("radio", ClientUi.CYAN, 22.0)
	chatter_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chatter_row.add_child(chatter_icon)
	_chatter = Label.new()
	_chatter.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_chatter.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_chatter.add_theme_font_size_override("font_size", 19)
	_chatter.add_theme_color_override("font_color", Color(ClientUi.TEXT, 0.8))
	ClientUi.apply_body_font(_chatter)
	chatter_row.add_child(_chatter)

	# Fit the Nexus into one viewport: owner/assault left, history/status right.
	var body := HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 10)
	root.add_child(body)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 8)
	body.add_child(left)
	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 8)
	body.add_child(right)

	# NexusOwnerPanel showcase hero.
	_owner_panel = PanelContainer.new()
	_owner_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_owner_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.08, 0.06, 0.03, 0.97), Color("#F59E0B", 0.45), 16, 2
	))
	left.add_child(_owner_panel)
	_owner_col = VBoxContainer.new()
	_owner_col.add_theme_constant_override("separation", 10)
	_owner_panel.add_child(_owner_col)

	_declare_panel = PanelContainer.new()
	_declare_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.05, 0.09, 0.97), Color(ClientUi.CYAN, 0.35), 16, 1
	))
	left.add_child(_declare_panel)
	_declare_col = VBoxContainer.new()
	_declare_col.add_theme_constant_override("separation", 8)
	_declare_panel.add_child(_declare_col)

	_owner_perk_panel = PanelContainer.new()
	_owner_perk_panel.visible = false
	_owner_perk_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.12, 0.08, 0.02, 0.85), Color("#F59E0B", 0.4), 12, 1
	))
	left.add_child(_owner_perk_panel)

	var hof_panel := PanelContainer.new()
	hof_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.07, 0.06, 0.03, 0.96), Color("#FBBF24", 0.4), 16, 1
	))
	hof_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(hof_panel)
	var hof_col := VBoxContainer.new()
	hof_col.add_theme_constant_override("separation", 10)
	hof_panel.add_child(hof_col)
	hof_col.add_child(ClientUi.make_section_header("", "Hall of Fame", "Past conquerors of the Nexus. Never resets."))
	var hof_scroll := ScrollContainer.new()
	hof_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hof_col.add_child(hof_scroll)
	_hof = VBoxContainer.new()
	_hof.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hof.add_theme_constant_override("separation", 6)
	hof_scroll.add_child(_hof)

	_status = ClientUi.make_status()
	_status.visible = false
	right.add_child(_status)

	_log = Label.new()
	_log.visible = false
	_log.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_log.add_theme_font_size_override("font_size", 19)
	_log.add_theme_color_override("font_color", ClientUi.MUTED)
	right.add_child(_log)

	var refresh := Button.new()
	refresh.text = "Refresh"
	ClientUi.apply_ghost_button(refresh)
	refresh.pressed.connect(_boot)
	right.add_child(refresh)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)


func _populate() -> void:
	for c in _owner_col.get_children():
		c.queue_free()
	for c in _declare_col.get_children():
		c.queue_free()
	for c in _owner_perk_panel.get_children():
		c.queue_free()

	var n: Dictionary = NexusManager.nexus
	var guild: Dictionary = SocialManager.my_guild
	var members: Array = SocialManager.guild_members
	var power := NexusManager.guild_power(guild, members) if not guild.is_empty() else 0
	var elig: Dictionary = NexusManager.eligibility(guild, members)
	var role := str(SocialManager.my_membership.get("role", ""))
	var gid := str(guild.get("id", ""))
	var owned := not str(n.get("owner_guild_id", "")).is_empty()
	var vuln := NexusManager.is_vulnerable(n)

	var showcase_head := HBoxContainer.new()
	showcase_head.add_theme_constant_override("separation", 8)
	_owner_col.add_child(showcase_head)
	showcase_head.add_child(UiIcon.make("crown", Color("#FBBF24"), 21.0))
	var showcase_title := Label.new()
	showcase_title.text = "GALACTIC COMMAND NEXUS"
	showcase_title.add_theme_font_size_override("font_size", 16)
	showcase_title.add_theme_color_override("font_color", Color("#FBBF24"))
	ClientUi.apply_display_font(showcase_title)
	showcase_head.add_child(showcase_title)

	if not owned:
		var unclaimed_host := CenterContainer.new()
		unclaimed_host.custom_minimum_size = Vector2(64, 64)
		_owner_col.add_child(unclaimed_host)
		unclaimed_host.add_child(UiIcon.make("torus", ClientUi.MUTED, 48.0))
		var unclaimed_title := Label.new()
		unclaimed_title.text = "UNCLAIMED — VULNERABLE"
		unclaimed_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		unclaimed_title.add_theme_font_size_override("font_size", 24)
		unclaimed_title.add_theme_color_override("font_color", ClientUi.DANGER)
		ClientUi.apply_display_font(unclaimed_title)
		_owner_col.add_child(unclaimed_title)
		var unclaimed_hint := Label.new()
		unclaimed_hint.text = "No guild holds the Nexus. Any eligible guild may strike to claim dominion over the galaxy."
		unclaimed_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		unclaimed_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		unclaimed_hint.add_theme_font_size_override("font_size", 19)
		unclaimed_hint.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(unclaimed_hint)
		_owner_col.add_child(unclaimed_hint)
	else:
		var owner_row := HBoxContainer.new()
		owner_row.add_theme_constant_override("separation", 10)
		_owner_col.add_child(owner_row)

		var flag := PanelContainer.new()
		flag.custom_minimum_size = Vector2(69, 69)
		var banner := str(n.get("banner_color", "#FFD700"))
		flag.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.04, 0.05, 0.08, 0.85), Color(banner, 0.75), 10, 2
		))
		owner_row.add_child(flag)
		var flag_host := CenterContainer.new()
		flag.add_child(flag_host)
		flag_host.add_child(UiIcon.make("flag", Color(banner), 29.0))

		var owner_info := VBoxContainer.new()
		owner_info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		owner_info.add_theme_constant_override("separation", 2)
		owner_row.add_child(owner_info)
		var owner_title := Label.new()
		owner_title.text = "[%s] %s" % [str(n.get("owner_guild_tag", "")), str(n.get("owner_guild_name", "?"))]
		owner_title.add_theme_font_size_override("font_size", 27)
		owner_title.add_theme_color_override("font_color", Color("#FDE68A"))
		ClientUi.apply_display_font(owner_title)
		owner_info.add_child(owner_title)
		var leader := Label.new()
		leader.text = "Led by %s" % str(n.get("owner_leader", n.get("owner_guild_leader", "?")))
		leader.add_theme_font_size_override("font_size", 18)
		leader.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(leader)
		owner_info.add_child(leader)

		var rank_chip := PanelContainer.new()
		rank_chip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.12, 0.08, 0.02, 0.85), Color("#F59E0B", 0.45), 14, 1
		))
		owner_row.add_child(rank_chip)
		var rank_row := HBoxContainer.new()
		rank_row.add_theme_constant_override("separation", 6)
		rank_chip.add_child(rank_row)
		rank_row.add_child(UiIcon.make("trophy", Color("#FBBF24"), 16.0))
		var rank_l := Label.new()
		rank_l.text = "RANK #1"
		rank_l.add_theme_font_size_override("font_size", 15)
		rank_l.add_theme_color_override("font_color", Color("#FBBF24"))
		ClientUi.apply_display_font(rank_l)
		rank_row.add_child(rank_l)

		var stats := GridContainer.new()
		stats.columns = 4
		stats.add_theme_constant_override("h_separation", 8)
		stats.add_theme_constant_override("v_separation", 8)
		_owner_col.add_child(stats)
		stats.add_child(_mini("MEMBERS", str(n.get("owner_member_count", members.size())), Color("#22D3EE")))
		stats.add_child(_mini("TIME HELD", NexusManager.format_reign(n), Color("#A855F7")))
		stats.add_child(_mini("DEFENSES", str(n.get("defense_streak", 0)), Color("#34D399")))
		stats.add_child(_mini("SERVER RANK", "#1", Color("#FFD700")))

		var status_row := HBoxContainer.new()
		status_row.add_theme_constant_override("separation", 8)
		_owner_col.add_child(status_row)
		var pill := PanelContainer.new()
		pill.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.04, 0.04, 0.07, 0.95),
			ClientUi.DANGER if vuln else ClientUi.SUCCESS,
			12, 1
		))
		status_row.add_child(pill)
		var pill_row := HBoxContainer.new()
		pill_row.add_theme_constant_override("separation", 4)
		pill.add_child(pill_row)
		var pill_tint := ClientUi.DANGER if vuln else ClientUi.SUCCESS
		pill_row.add_child(UiIcon.make("triangle-alert" if vuln else "shield", pill_tint, 14.0))
		var pill_l := Label.new()
		pill_l.text = "VULNERABLE" if vuln else "FORTIFIED"
		pill_l.add_theme_font_size_override("font_size", 18)
		pill_l.add_theme_color_override("font_color", pill_tint)
		ClientUi.apply_display_font(pill_l)
		pill_row.add_child(pill_l)
		var status_hint := Label.new()
		status_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		status_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		status_hint.text = (
			"Open to assault from eligible guilds."
			if vuln
			else "Defenses hold — becomes vulnerable after 24h."
		)
		status_hint.add_theme_font_size_override("font_size", 19)
		status_hint.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(status_hint)
		status_row.add_child(status_hint)

	_declare_col.add_child(ClientUi.make_section_header("", "Declare Assault", ""))

	if guild.is_empty():
		var join_panel := PanelContainer.new()
		join_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.04, 0.05, 0.08, 0.72), Color(0.28, 0.36, 0.48, 0.35), 12, 1
		))
		_declare_col.add_child(join_panel)
		var join := Label.new()
		join.text = "Join or create a guild to contest the Nexus."
		join.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		join.add_theme_font_size_override("font_size", 16)
		join.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(join)
		join_panel.add_child(join)
	else:
		var reqs := Label.new()
		reqs.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		reqs.text = "Your guild: %s · Lv %s · members %s · role %s\nEligibility: %s\nAssault CD: %s · Projected power %s" % [
			str(guild.get("name", "?")),
			ClientUi.format_level(guild.get("level", 0)),
			str(members.size()),
			role if not role.is_empty() else "—",
			str(elig.get("error", "OK")) if not bool(elig.get("ok", false)) else "OK",
			DungeonRules.format_ms(NexusManager.assault_cooldown_ms()) if NexusManager.assault_cooldown_ms() > 0 else "ready",
			str(power),
		]
		reqs.add_theme_font_size_override("font_size", 19)
		reqs.add_theme_color_override("font_color", ClientUi.MUTED)
		_declare_col.add_child(reqs)

		var assault := Button.new()
		assault.text = "Launch Assault"
		ClientUi.apply_primary_button(assault)
		assault.pressed.connect(_on_assault)
		_declare_col.add_child(assault)

	if NexusManager.owns_nexus(gid):
		_owner_perk_panel.visible = true
		var perk := Label.new()
		perk.text = "Your guild holds the Nexus — members enjoy +5% mission rewards and +5% guild experience."
		perk.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		perk.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		perk.add_theme_font_size_override("font_size", 16)
		perk.add_theme_color_override("font_color", Color("#FDE68A"))
		ClientUi.apply_body_font(perk)
		_owner_perk_panel.add_child(perk)
	else:
		_owner_perk_panel.visible = false

	_chatter_lines = _build_chatter(n)
	_chatter_i = 0
	_chatter.text = _chatter_lines[0] if not _chatter_lines.is_empty() else ""


func _mini(label: String, value: String, color: Color) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.04, 0.07, 0.95), Color(0.35, 0.4, 0.5, 0.4), 8, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	panel.add_child(col)
	var l := Label.new()
	l.text = label
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", 11)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(l)
	col.add_child(l)
	var v := Label.new()
	v.text = value
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_theme_font_size_override("font_size", 17)
	v.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(v)
	col.add_child(v)
	return panel


func _build_chatter(n: Dictionary) -> PackedStringArray:
	if n.is_empty() or str(n.get("owner_guild_id", "")).is_empty():
		return PackedStringArray([
			"The Nexus lies unclaimed... rumors swirl of guilds marshalling fleets.",
			"Station chatter: 'Who will be the first to take the Nexus?'",
		])
	var name := str(n.get("owner_guild_name", "Unknown"))
	var held := NexusManager.format_reign(n)
	var streak := int(n.get("defense_streak", 0))
	var out: PackedStringArray = [
		"Have you heard? %s rules the galaxy now." % name,
		"The Nexus hasn't fallen in %s. %s stands firm." % [held, name],
	]
	if streak > 0:
		out.append("%s has repelled %s assault%s. Legend grows." % [
			name, streak, "s" if streak > 1 else "",
		])
	if NexusManager.is_vulnerable(n):
		out.append("Whispers in the lounge: 'The Nexus is vulnerable — someone make a move.'")
	return out


func _rotate_chatter() -> void:
	if _chatter_lines.is_empty():
		return
	_chatter_i = (_chatter_i + 1) % _chatter_lines.size()
	_chatter.text = _chatter_lines[_chatter_i]


func _load_hof() -> void:
	for c in _hof.get_children():
		c.queue_free()
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/NexusHallOfFame?sort=-lost_at&limit=50", null, true
	)
	if not res.ok or typeof(res.data) != TYPE_ARRAY:
		_hof.add_child(_hof_line("Could not load Hall of Fame."))
		return
	var rows: Array = res.data
	if rows.is_empty():
		_hof.add_child(_hof_line("No legends yet. The first conquest will echo through history."))
		return
	var i := 0
	for r in rows:
		if typeof(r) != TYPE_DICTIONARY:
			continue
		i += 1
		if i > 12:
			break
		_hof.add_child(_hof_row(i, r))


func _hof_row(rank: int, r: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.08, 0.65), Color(0.28, 0.36, 0.48, 0.25), 8, 1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	var num := Label.new()
	num.text = "%s." % rank
	num.custom_minimum_size = Vector2(27, 0)
	num.add_theme_font_size_override("font_size", 13)
	num.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(num)
	row.add_child(num)
	var name := Label.new()
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.text = "[%s] %s" % [str(r.get("guild_tag", "")), str(r.get("guild_name", "?"))]
	name.add_theme_font_size_override("font_size", 16)
	name.add_theme_color_override("font_color", Color("#FFD700"))
	ClientUi.apply_display_font(name)
	row.add_child(name)
	var meta := Label.new()
	meta.text = "%sd · %s def" % [str(r.get("reign_days", 0)), str(r.get("defenses", 0))]
	meta.add_theme_font_size_override("font_size", 19)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	row.add_child(meta)
	return panel


func _hof_line(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", 16)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	return l


func _on_assault() -> void:
	if _busy:
		return
	var guild: Dictionary = SocialManager.my_guild
	var members: Array = SocialManager.guild_members
	var role := str(SocialManager.my_membership.get("role", ""))
	if role != "leader" and role != "officer":
		Notify.blocked("Not allowed", "Only a leader or officer can assault")
		return
	var elig: Dictionary = NexusManager.eligibility(guild, members)
	if not bool(elig.get("ok", false)):
		Notify.blocked(str(elig.get("error", "Not eligible")))
		return
	if NexusManager.owns_nexus(str(guild.get("id", ""))):
		Notify.blocked("You already own the Nexus")
		return
	if not NexusManager.is_vulnerable():
		Notify.blocked("Owner still protected")
		return
	if NexusManager.assault_cooldown_ms() > 0:
		Notify.blocked("Assault on cooldown")
		return
	_busy = true
	_set_status("Resolving assault…")
	var res: Dictionary = await NexusManager.resolve_assault(str(guild.get("id", "")))
	_busy = false
	if not res.ok:
		if not Notify.from_result(res):
			_set_status(str(res.get("error", "Assault failed")))
		return
	var data: Dictionary = NexusManager.last_assault
	_set_status("Winner: %s · ownership changed: %s" % [
		str(data.get("winner", "?")),
		str(data.get("ownership_changed", false)),
	])
	var lines: PackedStringArray = []
	var events: Variant = data.get("events", [])
	if typeof(events) == TYPE_ARRAY:
		for ev in events:
			if typeof(ev) == TYPE_DICTIONARY:
				lines.append(str(ev.get("text", "")))
	_log.text = "\n".join(lines)
	_log.visible = not _log.text.strip_edges().is_empty()
	_populate()
	await _load_hof()


func _set_status(text: String) -> void:
	if not is_instance_valid(_status):
		return
	_status.text = text
	_status.visible = not text.is_empty()
