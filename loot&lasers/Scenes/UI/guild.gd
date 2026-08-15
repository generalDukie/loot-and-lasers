extends Control
## Guild — mirrors web GuildPage (header · invite · challenge · stats · wars · history · roster|log).

const CREATE_COST := 5000
const NAME_NO_DIGITS_MSG := "Names cannot contain numbers"

var _status: Label
var _list: VBoxContainer
var _name_edit: LineEdit
var _tag_edit: LineEdit
var _desc_edit: TextEdit
var _join_name_edit: LineEdit
var _create_mode := true
var _mode_create_btn: Button
var _mode_join_btn: Button
var _create_block: VBoxContainer
var _join_block: VBoxContainer
var _create_submit_btn: Button
var _show_war_picker := false
var _busy := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	if is_instance_valid(_create_submit_btn):
		_create_submit_btn.disabled = not CurrencyManager.can_afford(
			CurrencyManager.CURRENCY_STARDUST,
			CREATE_COST
		)


func _boot() -> void:
	_set_status("Loading guild…")
	await SocialManager.load_my_guild()
	await SocialManager.browse_guilds()
	await _populate()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	_status = ClientUi.make_status()
	_status.visible = false
	root.add_child(_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 12)
	scroll.add_child(_list)


func _set_status(text: String) -> void:
	_status.text = text
	_status.visible = not text.is_empty()


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()
	_show_war_picker = false

	if SocialManager.my_guild.is_empty():
		_list.add_child(_make_creation_flow())
		_set_status("")
		return

	var g: Dictionary = SocialManager.my_guild
	var ch: Dictionary = GameManager.active_character
	# Web order: header → invite → challenge → stats → wars → history → members|log
	_list.add_child(_make_guild_header(g))

	if SocialManager.can_invite_to_guild():
		_list.add_child(_make_invite_row())

	await SocialManager.ensure_guild_challenge()
	var chg: Dictionary = SocialManager.guild_challenge
	if not chg.is_empty():
		_list.add_child(_make_challenge_panel(chg, g))

	_list.add_child(_make_stat_strip())

	var wars: Array = await GuildWarManager.list_wars(str(g.get("id", "")))
	_list.add_child(await _make_wars_panel(g, wars))
	_list.add_child(_make_battle_history(wars, str(g.get("id", ""))))

	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 12)
	_list.add_child(cols)
	cols.add_child(_make_members_panel(ch))
	await SocialManager.load_guild_log(30)
	cols.add_child(_make_log_panel())

	_set_status("")


# ─── No guild: FORM A GUILD (web GuildCreation) ─────────────────────────────

func _make_creation_flow() -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.add_theme_constant_override("separation", 12)

	var head := VBoxContainer.new()
	head.add_theme_constant_override("separation", 4)
	wrap.add_child(head)
	var title_center := CenterContainer.new()
	title_center.add_child(UiIcon.make_title_row("users", "FORM A GUILD", ClientUi.CYAN_SOFT, 32, 28.0))
	head.add_child(title_center)
	var sub := Label.new()
	sub.text = "Band together to share progression and mission glory."
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 19)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	head.add_child(sub)

	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 8)
	wrap.add_child(tabs)
	_mode_create_btn = Button.new()
	_mode_create_btn.text = "Found New"
	_mode_create_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_mode_create_btn.pressed.connect(func() -> void: _set_create_mode(true))
	tabs.add_child(_mode_create_btn)
	_mode_join_btn = Button.new()
	_mode_join_btn.text = "Join Existing"
	_mode_join_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_mode_join_btn.pressed.connect(func() -> void: _set_create_mode(false))
	tabs.add_child(_mode_join_btn)

	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.1, 0.97), Color(ClientUi.CYAN, 0.4), 14, 1
	))
	wrap.add_child(card)
	var card_col := VBoxContainer.new()
	card_col.add_theme_constant_override("separation", 10)
	card.add_child(card_col)

	_create_block = VBoxContainer.new()
	_create_block.add_theme_constant_override("separation", 8)
	card_col.add_child(_create_block)
	_create_block.add_child(_field_label("Guild Name"))
	_name_edit = ClientUi.make_field("e.g. Nova Syndicate")
	_name_edit.max_length = 32
	_create_block.add_child(_name_edit)
	_create_block.add_child(_field_label("Tag (optional)"))
	_tag_edit = ClientUi.make_field("NOVA")
	_tag_edit.max_length = 5
	_create_block.add_child(_tag_edit)
	_create_block.add_child(_field_label("Description"))
	_desc_edit = TextEdit.new()
	_desc_edit.placeholder_text = "What does your guild stand for?"
	_desc_edit.custom_minimum_size = Vector2(0, 96)
	_desc_edit.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	ClientUi.apply_body_font(_desc_edit)
	_create_block.add_child(_desc_edit)
	_create_submit_btn = Button.new()
	ClientUi.fill_priced_action_button(
		_create_submit_btn, "FOUND GUILD", "stardust", CREATE_COST
	)
	_create_submit_btn.disabled = not CurrencyManager.can_afford(
		CurrencyManager.CURRENCY_STARDUST,
		CREATE_COST
	)
	_create_submit_btn.pressed.connect(_on_create)
	_create_block.add_child(_create_submit_btn)

	_join_block = VBoxContainer.new()
	_join_block.add_theme_constant_override("separation", 8)
	_join_block.visible = false
	card_col.add_child(_join_block)

	var browse_lab := Label.new()
	browse_lab.text = "Open guilds"
	browse_lab.add_theme_font_size_override("font_size", 16)
	browse_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(browse_lab)
	_join_block.add_child(browse_lab)
	if SocialManager.guild_browse.is_empty():
		_join_block.add_child(_empty("No public guilds yet."))
	else:
		for g in SocialManager.guild_browse:
			if typeof(g) == TYPE_DICTIONARY:
				_join_block.add_child(_make_browse_row(g))

	var by_name := Label.new()
	by_name.text = "Or join by name"
	by_name.add_theme_font_size_override("font_size", 19)
	by_name.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(by_name)
	_join_block.add_child(by_name)
	_join_name_edit = ClientUi.make_field("Enter the exact guild name")
	_join_name_edit.max_length = 32
	_join_block.add_child(_join_name_edit)
	var join_btn := Button.new()
	join_btn.text = "JOIN GUILD"
	ClientUi.apply_primary_button(join_btn)
	join_btn.pressed.connect(_on_join_by_name)
	_join_block.add_child(join_btn)

	_set_create_mode(true)
	return wrap


func _field_label(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 15)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	return l


func _set_create_mode(create: bool) -> void:
	_create_mode = create
	if _create_block:
		_create_block.visible = create
	if _join_block:
		_join_block.visible = not create
	if _mode_create_btn:
		if create:
			ClientUi.apply_primary_button(_mode_create_btn)
		else:
			ClientUi.apply_ghost_button(_mode_create_btn)
		_mode_create_btn.text = "Found New"
	if _mode_join_btn:
		if create:
			ClientUi.apply_ghost_button(_mode_join_btn)
		else:
			ClientUi.apply_primary_button(_mode_join_btn)
		_mode_join_btn.text = "Join Existing"


# ─── In guild: header (web GuildHeader) ─────────────────────────────────────

func _make_guild_header(g: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.07, 0.12, 0.97), Color(ClientUi.CYAN, 0.55), 14, 2
	))
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	panel.add_child(root)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	root.add_child(top)

	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 6)
	top.add_child(left)

	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 8)
	left.add_child(name_row)
	var name := Label.new()
	name.text = str(g.get("name", "?"))
	name.add_theme_font_size_override("font_size", 29)
	name.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(name)
	name_row.add_child(name)
	var tag := str(g.get("tag", ""))
	if not tag.is_empty():
		var tag_pill := PanelContainer.new()
		tag_pill.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(ClientUi.CYAN.r, ClientUi.CYAN.g, ClientUi.CYAN.b, 0.12),
			Color(ClientUi.CYAN.r, ClientUi.CYAN.g, ClientUi.CYAN.b, 0.35),
			8, 1
		))
		name_row.add_child(tag_pill)
		var tag_lab := Label.new()
		tag_lab.text = "[%s]" % tag
		tag_lab.add_theme_font_size_override("font_size", 16)
		tag_lab.add_theme_color_override("font_color", ClientUi.CYAN)
		ClientUi.apply_display_font(tag_lab)
		tag_pill.add_child(tag_lab)

	var desc := str(g.get("description", ""))
	if not desc.is_empty():
		var desc_lab := Label.new()
		desc_lab.text = desc
		desc_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc_lab.add_theme_font_size_override("font_size", 19)
		desc_lab.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(desc_lab)
		left.add_child(desc_lab)

	var pills := HBoxContainer.new()
	pills.add_theme_constant_override("separation", 8)
	left.add_child(pills)
	pills.add_child(_header_pill("LVL %s" % ClientUi.format_level(g.get("level", 1)), ClientUi.CYAN, "shield"))
	pills.add_child(_header_pill("%s  MEMBERS" % str(SocialManager.guild_members.size()), ClientUi.VIOLET, "users"))
	var led := Label.new()
	led.text = "Led by %s" % str(g.get("leader_name", "?"))
	led.add_theme_font_size_override("font_size", 15)
	led.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(led)
	pills.add_child(led)

	var is_leader := str(SocialManager.my_membership.get("role", "")) == "leader"
	if is_leader:
		var recruiting_open: bool = g.get("recruiting", true) != false
		var rec := Button.new()
		rec.text = "RECRUITING" if recruiting_open else "INVITE ONLY"
		_style_toggle_pill(rec, recruiting_open, true)
		rec.pressed.connect(func() -> void: _on_set_recruiting(not recruiting_open))
		pills.add_child(rec)
		var listed: bool = g.get("public_listing", true) != false
		var list_btn := Button.new()
		list_btn.text = "PUBLIC" if listed else "HIDDEN"
		_style_toggle_pill(list_btn, listed, false)
		list_btn.pressed.connect(func() -> void: _on_set_listing(not listed))
		pills.add_child(list_btn)

	var xp := int(g.get("experience", g.get("xp", 0)))
	var xp_need := maxi(1, int(g.get("experience_to_next", g.get("xp_to_next", 1000))))
	var xp_row := HBoxContainer.new()
	left.add_child(xp_row)
	var xp_lab := Label.new()
	xp_lab.text = "Guild XP"
	xp_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	xp_lab.add_theme_font_size_override("font_size", 15)
	xp_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	xp_row.add_child(xp_lab)
	var xp_val := Label.new()
	xp_val.text = "%s / %s" % [str(xp), str(xp_need)]
	xp_val.add_theme_font_size_override("font_size", 15)
	xp_val.add_theme_color_override("font_color", ClientUi.MUTED)
	xp_row.add_child(xp_val)
	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = xp_need
	bar.value = mini(xp, xp_need)
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 11)
	# Closest to web cyan→purple gradient fill.
	ClientUi.apply_hp_bar(bar, Color("#22D3EE").lerp(Color("#A855F7"), 0.55))
	left.add_child(bar)

	var leave := Button.new()
	leave.text = "Leave Guild"
	ClientUi.apply_ghost_button(leave)
	leave.pressed.connect(_on_leave)
	top.add_child(leave)
	return panel


func _header_pill(text: String, color: Color, icon_id: String = "") -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(color.r, color.g, color.b, 0.12), Color(color.r, color.g, color.b, 0.35), 12, 1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	p.add_child(row)
	if not icon_id.is_empty():
		row.add_child(UiIcon.make(icon_id, color, 14.0))
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 18)
	l.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(l)
	row.add_child(l)
	return p


func _style_toggle_pill(btn: Button, on: bool, green_when_on: bool) -> void:
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 13)
	var c := Color("#4ADE80") if (on and green_when_on) else (ClientUi.CYAN if on else ClientUi.MUTED)
	btn.add_theme_stylebox_override("normal", ClientUi.button_style(
		Color(c.r, c.g, c.b, 0.12), Color(c.r, c.g, c.b, 0.35)
	))
	btn.add_theme_stylebox_override("hover", ClientUi.button_style(
		Color(c.r, c.g, c.b, 0.2), Color(c.r, c.g, c.b, 0.5)
	))
	btn.add_theme_color_override("font_color", c)


# ─── Weekly challenge ───────────────────────────────────────────────────────

func _make_challenge_panel(chg: Dictionary, g: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.05, 0.1, 0.97), Color(ClientUi.VIOLET, 0.45), 12, 2
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

	var head := HBoxContainer.new()
	col.add_child(head)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(left)
	var eye := Label.new()
	eye.text = "WEEKLY CHALLENGE"
	eye.add_theme_font_size_override("font_size", 13)
	eye.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(eye)
	left.add_child(eye)
	var title := Label.new()
	title.text = str(chg.get("title", "?"))
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	left.add_child(title)

	var completed := str(chg.get("status", "")) == "completed"
	var badge := Label.new()
	if completed:
		badge.text = "✓  Done"
		badge.add_theme_color_override("font_color", ClientUi.SUCCESS)
	else:
		badge.text = "⏱  %s" % _challenge_time_left(chg)
		badge.add_theme_color_override("font_color", ClientUi.MUTED)
	badge.add_theme_font_size_override("font_size", 18)
	ClientUi.apply_display_font(badge)
	head.add_child(badge)

	var prog := int(chg.get("progress", 0))
	var goal := maxi(1, int(chg.get("goal", 1)))
	var pct := int(round(100.0 * float(mini(prog, goal)) / float(goal)))
	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = goal
	bar.value = mini(prog, goal)
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 29)
	ClientUi.apply_hp_bar(bar, ClientUi.CYAN.lerp(ClientUi.VIOLET, 0.5))
	col.add_child(bar)
	var prog_lab := Label.new()
	prog_lab.text = "%s / %s  (%s%%)" % [str(prog), str(goal), str(pct)]
	prog_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prog_lab.add_theme_font_size_override("font_size", 15)
	prog_lab.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(prog_lab)
	col.add_child(prog_lab)

	var hint := Label.new()
	hint.text = "Complete missions and win Arena duels to fill the bar."
	hint.add_theme_font_size_override("font_size", 19)
	hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(hint)
	col.add_child(hint)

	var rewards := HBoxContainer.new()
	rewards.add_theme_constant_override("separation", 8)
	col.add_child(rewards)
	rewards.add_child(ClientUi.make_currency_chip("stardust", chg.get("reward_stardust", 0), Color("#E879F9")))
	rewards.add_child(ClientUi.make_currency_chip("gXP", chg.get("reward_guild_xp", 0), ClientUi.CYAN))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rewards.add_child(spacer)
	var glv := Label.new()
	glv.text = "Guild Lv. %s" % ClientUi.format_level(g.get("level", 1))
	glv.add_theme_font_size_override("font_size", 15)
	glv.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(glv)
	rewards.add_child(glv)
	return panel


func _challenge_time_left(chg: Dictionary) -> String:
	var ends := str(chg.get("ends_at", ""))
	if ends.is_empty():
		return "—"
	var s := ends.replace("Z", "").replace("T", " ")
	if "." in s:
		s = s.get_slice(".", 0)
	var unix := Time.get_unix_time_from_datetime_string(s)
	if unix <= 0:
		return "—"
	var left := maxi(0, int(unix - Time.get_unix_time_from_system()))
	var days := left / 86400
	var hours := (left % 86400) / 3600
	return "%sd %sh left" % [days, hours]


# ─── Collective stats (web GuildPage) ───────────────────────────────────────

func _make_stat_strip() -> GridContainer:
	var members: Array = SocialManager.guild_members
	var total_missions := 0
	var total_sd := 0
	var lvl_sum := 0
	for m in members:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		total_missions += int(m.get("contributed_missions", 0))
		total_sd += int(m.get("contributed_stardust", 0))
		lvl_sum += int(m.get("character_level", 1))
	var avg := 1 if members.is_empty() else int(round(float(lvl_sum) / float(members.size())))

	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	grid.add_child(_stat_tile("target", "MISSIONS RUN", str(total_missions), ClientUi.CYAN))
	grid.add_child(_stat_tile("sparkle", "STARDUST EARNED", str(total_sd), Color("#C084FC")))
	grid.add_child(_stat_tile("chart-no-axes-combined", "AVG LEVEL", str(avg), ClientUi.VIOLET))
	grid.add_child(_stat_tile("users", "MEMBERS", str(members.size()), ClientUi.SUCCESS))
	return grid


func _stat_tile(icon: String, label: String, value: String, color: Color) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.95), Color(0.35, 0.4, 0.5, 0.4), 12, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 2)
	panel.add_child(col)
	var ic_host := CenterContainer.new()
	ic_host.custom_minimum_size = Vector2(24, 24)
	col.add_child(ic_host)
	CurrencyIcon.fill_glyph_host(ic_host, icon, 19.0, color)
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


# ─── Guild Wars (web War Council) ───────────────────────────────────────────

func _make_wars_panel(guild: Dictionary, wars: Array) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.07, 0.05, 0.08, 0.97), Color(0.8, 0.35, 0.4, 0.45), 12, 2
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

	var head := HBoxContainer.new()
	col.add_child(head)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(left)
	var eye := Label.new()
	eye.text = "GUILD WARS"
	eye.add_theme_font_size_override("font_size", 13)
	eye.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(eye)
	left.add_child(eye)
	var title := Label.new()
	title.text = "War Council"
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	left.add_child(title)
	var wl := Label.new()
	wl.text = "%sW / %sL" % [str(guild.get("war_wins", 0)), str(guild.get("war_losses", 0))]
	wl.add_theme_font_size_override("font_size", 16)
	wl.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(wl)
	head.add_child(wl)

	var hint := Label.new()
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.text = "Declare war on any guild. Both sides have 24h to ready up — only readied members fight in the gauntlet, ranked by level."
	hint.add_theme_font_size_override("font_size", 19)
	hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(hint)
	col.add_child(hint)

	var role := str(SocialManager.my_membership.get("role", ""))
	var can_declare := role == "leader" or role == "officer"
	var active: Array = []
	for w in wars:
		if typeof(w) != TYPE_DICTIONARY:
			continue
		var st := str(w.get("status", ""))
		if st in ["readying", "declared", "active"]:
			active.append(w)

	if active.is_empty():
		col.add_child(_empty(
			"No active wars. Declare one below." if can_declare else "No active wars. Ask your leader to declare war."
		))
	else:
		for w in active:
			col.add_child(await _make_war_card(w))

	if can_declare:
		var declare := Button.new()
		ClientUi.fill_priced_action_button(
			declare, "Declare War", "stardust", GuildWarManager.DECLARE_COST
		)
		declare.pressed.connect(func() -> void:
			_show_war_picker = not _show_war_picker
			_populate()
		)
		col.add_child(declare)
		if _show_war_picker:
			col.add_child(_empty("Choose a rival guild:"))
			var targets := 0
			for g in SocialManager.guild_browse:
				if typeof(g) != TYPE_DICTIONARY:
					continue
				var gid := str(g.get("id", ""))
				if gid.is_empty() or gid == str(guild.get("id", "")):
					continue
				targets += 1
				col.add_child(_make_war_target_row(g))
			if targets == 0:
				col.add_child(_empty("No other guilds listed yet."))
	return panel


func _make_battle_history(wars: Array, guild_id: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.96), Color(0.55, 0.3, 0.35, 0.4), 12, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)
	var head_row := HBoxContainer.new()
	head_row.add_theme_constant_override("separation", 8)
	col.add_child(head_row)
	head_row.add_child(UiIcon.make("swords", Color(0.95, 0.65, 0.72), 18.0))
	var t := Label.new()
	t.text = "BATTLE HISTORY"
	t.add_theme_font_size_override("font_size", 16)
	t.add_theme_color_override("font_color", Color(0.95, 0.65, 0.72))
	ClientUi.apply_display_font(t)
	head_row.add_child(t)

	var done: Array = []
	for w in wars:
		if typeof(w) != TYPE_DICTIONARY:
			continue
		if str(w.get("status", "")) == "completed":
			done.append(w)
	if done.is_empty():
		col.add_child(_empty("No battles recorded yet. Declare war to start building your legacy."))
		return panel

	var shown := 0
	for w in done:
		if shown >= 10:
			break
		shown += 1
		var us_attack := str(w.get("attacker_guild_id", "")) == guild_id
		var opponent := str(w.get("defender_guild_name", "?")) if us_attack else str(w.get("attacker_guild_name", "?"))
		var won := str(w.get("winner_side", "")) == ("attacker" if us_attack else "defender")
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		col.add_child(row)
		row.add_child(UiIcon.make("trophy" if won else "skull", ClientUi.SUCCESS if won else ClientUi.DANGER, 20.0))
		var info := Label.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.text = "vs %s" % opponent
		info.add_theme_font_size_override("font_size", 19)
		info.add_theme_color_override("font_color", ClientUi.TEXT)
		ClientUi.apply_body_font(info)
		row.add_child(info)
		var badge := Label.new()
		badge.text = "WIN" if won else "LOSS"
		badge.add_theme_font_size_override("font_size", 17)
		badge.add_theme_color_override("font_color", ClientUi.SUCCESS if won else ClientUi.DANGER)
		ClientUi.apply_display_font(badge)
		row.add_child(badge)
	return panel


func _make_war_target_row(g: Dictionary) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var info := Label.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.text = "[%s] %s · Lv %s" % [str(g.get("tag", "")), str(g.get("name", "?")), ClientUi.format_level(g.get("level", 1))]
	info.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(info)
	row.add_child(info)
	var btn := Button.new()
	btn.text = "Declare"
	ClientUi.apply_primary_button(btn)
	var capt := str(g.get("id", ""))
	btn.pressed.connect(func() -> void: _on_declare_war(capt))
	row.add_child(btn)
	return row


func _make_war_card(w: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	var status := str(w.get("status", "?"))
	var border := Color(0.7, 0.4, 0.35, 0.55)
	if status == "readying":
		border = Color(ClientUi.WARNING, 0.55)
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.08, 0.07, 0.1, 0.96), border, 10, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)

	var status_l := Label.new()
	status_l.text = status.to_upper()
	status_l.add_theme_font_size_override("font_size", 17)
	status_l.add_theme_color_override("font_color", border)
	ClientUi.apply_display_font(status_l)
	col.add_child(status_l)

	var matchup := Label.new()
	matchup.text = "[%s] %s  vs  %s" % [
		str(w.get("attacker_guild_tag", "")),
		str(w.get("attacker_guild_name", "?")),
		str(w.get("defender_guild_name", "?")),
	]
	matchup.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(matchup)
	col.add_child(matchup)

	if status == "readying":
		var readies: Array = await GuildWarManager.list_readies(str(w.get("id", "")))
		var ready_lab := Label.new()
		ready_lab.text = "Ready: %s fighters" % readies.size()
		ready_lab.add_theme_font_size_override("font_size", 18)
		ready_lab.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(ready_lab)
		col.add_child(ready_lab)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		col.add_child(row)
		var ready_btn := Button.new()
		var mine: Dictionary = await GuildWarManager.my_ready(str(w.get("id", "")))
		ready_btn.text = "Unready" if not mine.is_empty() else "Ready Up"
		ClientUi.apply_primary_button(ready_btn)
		var capt_w: Dictionary = w
		ready_btn.pressed.connect(func() -> void: _on_war_ready(capt_w))
		row.add_child(ready_btn)
		if GuildWarManager.is_deadline_passed(w):
			var res_btn := Button.new()
			res_btn.text = "Resolve War"
			ClientUi.apply_ghost_button(res_btn)
			res_btn.pressed.connect(func() -> void: _on_war_resolve(capt_w))
			row.add_child(res_btn)
	return panel


# ─── Members / Log ──────────────────────────────────────────────────────────

func _make_invite_row() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.96), Color(ClientUi.CYAN, 0.35), 10, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)
	var t := Label.new()
	t.text = "Invite by name"
	t.add_theme_font_size_override("font_size", 17)
	t.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(t)
	col.add_child(t)
	var invite_row := HBoxContainer.new()
	invite_row.add_theme_constant_override("separation", 8)
	col.add_child(invite_row)
	var invite_edit := ClientUi.make_field("Character name")
	invite_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	invite_row.add_child(invite_edit)
	var invite_btn := Button.new()
	invite_btn.text = "Invite"
	ClientUi.apply_primary_button(invite_btn)
	invite_btn.pressed.connect(func() -> void: _on_invite(invite_edit.text))
	invite_row.add_child(invite_btn)
	return panel


func _make_members_panel(ch: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.045, 0.06, 0.09, 0.96), Color(0.4, 0.5, 0.65, 0.4), 12, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)
	var t := Label.new()
	t.text = "MEMBER ROSTER"
	t.add_theme_font_size_override("font_size", 16)
	t.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(t)
	col.add_child(t)

	var members: Array = SocialManager.guild_members.duplicate()
	members.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var order := {"leader": 0, "officer": 1, "member": 2}
		var ra := int(order.get(str(a.get("role", "member")), 2))
		var rb := int(order.get(str(b.get("role", "member")), 2))
		if ra != rb:
			return ra < rb
		return int(a.get("contributed_missions", 0)) > int(b.get("contributed_missions", 0))
	)
	var my_id := str(ch.get("id", ""))
	for m in members:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		col.add_child(_make_member_row(m, my_id))
	return panel


func _make_member_row(m: Dictionary, my_id: String) -> PanelContainer:
	var role := str(m.get("role", "member"))
	var is_you := str(m.get("character_id", "")) == my_id
	var color := Color("#FBBF24") if role == "leader" else (ClientUi.CYAN if role == "officer" else ClientUi.MUTED)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(ClientUi.CYAN.r, ClientUi.CYAN.g, ClientUi.CYAN.b, 0.06) if is_you else Color(0.04, 0.05, 0.08, 0.9),
		Color(ClientUi.CYAN.r, ClientUi.CYAN.g, ClientUi.CYAN.b, 0.35) if is_you else Color(0.35, 0.4, 0.5, 0.3),
		8, 1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	row.add_child(UiIcon.make("crown" if role == "leader" else "star", color, 19.0))
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 1)
	row.add_child(col)
	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 6)
	col.add_child(name_row)
	var name := Label.new()
	name.text = str(m.get("character_name", "?"))
	name.add_theme_font_size_override("font_size", 17)
	name.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(name)
	name_row.add_child(name)
	if is_you:
		var you := Label.new()
		you.text = "YOU"
		you.add_theme_font_size_override("font_size", 12)
		you.add_theme_color_override("font_color", ClientUi.CYAN)
		ClientUi.apply_display_font(you)
		name_row.add_child(you)
	var role_lab := Label.new()
	role_lab.text = role.capitalize()
	role_lab.add_theme_font_size_override("font_size", 13)
	role_lab.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(role_lab)
	name_row.add_child(role_lab)
	var detail := Label.new()
	detail.text = "Lvl %s · %s · %s Stardust" % [
		ClientUi.format_level(m.get("character_level", 1)),
		str(m.get("contributed_missions", 0)),
		str(m.get("contributed_stardust", 0)),
	]
	detail.add_theme_font_size_override("font_size", 19)
	detail.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(detail)
	col.add_child(detail)
	return panel


func _make_log_panel() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.045, 0.06, 0.09, 0.96), Color(0.4, 0.5, 0.65, 0.4), 12, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)
	var t_row := HBoxContainer.new()
	t_row.add_theme_constant_override("separation", 6)
	col.add_child(t_row)
	t_row.add_child(UiIcon.make("scroll-text", ClientUi.MUTED, 16.0))
	var t := Label.new()
	t.text = "SHARED MISSION LOG"
	t.add_theme_font_size_override("font_size", 16)
	t.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(t)
	t_row.add_child(t)
	if SocialManager.guild_log.is_empty():
		col.add_child(_empty("No activity yet. Complete missions to populate the log."))
	else:
		var shown := 0
		for entry in SocialManager.guild_log:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var row := VBoxContainer.new()
			row.add_theme_constant_override("separation", 1)
			col.add_child(row)
			var elab := Label.new()
			elab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			elab.text = "%s %s" % [str(entry.get("character_name", "")), str(entry.get("message", ""))]
			elab.add_theme_font_size_override("font_size", 19)
			elab.add_theme_color_override("font_color", ClientUi.TEXT)
			ClientUi.apply_body_font(elab)
			row.add_child(elab)
			var ago := Label.new()
			ago.text = _time_ago(str(entry.get("created_date", "")))
			ago.add_theme_font_size_override("font_size", 17)
			ago.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.7))
			row.add_child(ago)
			shown += 1
			if shown >= 12:
				break
	return panel


func _time_ago(iso: String) -> String:
	if iso.is_empty():
		return ""
	var s := iso.replace("Z", "").replace("T", " ")
	if "." in s:
		s = s.get_slice(".", 0)
	var unix := Time.get_unix_time_from_datetime_string(s)
	if unix <= 0:
		return ""
	var diff := int(Time.get_unix_time_from_system() - unix)
	if diff < 60:
		return "just now"
	if diff < 3600:
		return "%sm ago" % (diff / 60)
	if diff < 86400:
		return "%sh ago" % (diff / 3600)
	return "%sd ago" % (diff / 86400)


func _empty(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", 19)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	return l


func _make_browse_row(g: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.1, 0.96), Color(0.45, 0.55, 0.8, 0.45), 10, 1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)
	var title := Label.new()
	title.text = "[%s] %s" % [str(g.get("tag", "????")), str(g.get("name", "?"))]
	title.add_theme_font_size_override("font_size", 19)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	col.add_child(title)
	var detail := Label.new()
	var invite_only: bool = g.get("recruiting", true) == false
	detail.text = "Members %s · Lv %s · Leader %s · %s" % [
		str(g.get("member_count", 0)), ClientUi.format_level(g.get("level", 1)), str(g.get("leader_name", "?")),
		"invite-only" if invite_only else "open",
	]
	detail.add_theme_font_size_override("font_size", 19)
	detail.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(detail)
	var join := Button.new()
	join.text = "Request" if invite_only else "Join"
	ClientUi.apply_primary_button(join)
	var gid := str(g.get("id", ""))
	var captured := g.duplicate(true)
	if invite_only:
		join.pressed.connect(func() -> void: _on_request(captured))
	else:
		join.pressed.connect(func() -> void: _on_join(gid))
	row.add_child(join)
	return panel


# ─── Actions ────────────────────────────────────────────────────────────────

func _on_declare_war(gid: String) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Declaring war…")
	var res: Dictionary = await GuildWarManager.declare_war(gid)
	_busy = false
	if not res.ok:
		_set_status(_err(res))
		return
	_set_status("War declared (−%s Stardust)." % GuildWarManager.DECLARE_COST)
	await SocialManager.load_my_guild()
	await SocialManager.browse_guilds()
	await _populate()


func _on_war_ready(war: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await GuildWarManager.toggle_ready(war)
	_busy = false
	if not bool(res.get("ok", false)):
		_set_status(str(res.get("error", "Ready failed")))
	else:
		_set_status("Ready." if bool(res.get("ready", false)) else "Unreadied.")
	await _populate()


func _on_war_resolve(war: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Resolving gauntlet…")
	var res: Dictionary = await GuildWarManager.resolve_war(war)
	_busy = false
	if not res.ok:
		_set_status(str(res.get("error", "Resolve failed")))
		return
	_set_status("Winner: %s" % str(res.get("winner", "?")))
	await SocialManager.load_my_guild()
	await _populate()


func _on_invite(query: String) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Searching…")
	var hits: Array = await SocialManager.search_characters(query)
	if hits.is_empty():
		_busy = false
		_set_status("No character matched.")
		return
	var target: Dictionary = hits[0]
	_set_status("Inviting %s…" % str(target.get("name", "?")))
	var res: Dictionary = await SocialManager.invite_to_guild(target)
	_busy = false
	_set_status("Invite sent." if res.ok else str(res.get("error", "Invite failed")))


func _on_set_recruiting(open: bool) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Updating recruiting…")
	var res: Dictionary = await SocialManager.set_guild_recruiting(open)
	_busy = false
	_set_status("Recruiting updated." if res.ok else _err(res))
	if res.ok:
		await _populate()


func _on_set_listing(visible: bool) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Updating listing…")
	var res: Dictionary = await SocialManager.set_guild_public_listing(visible)
	_busy = false
	_set_status("Listing updated." if res.ok else _err(res))
	if res.ok:
		await _populate()


func _on_request(guild: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Sending join request…")
	var res: Dictionary = await SocialManager.request_to_join_guild(guild)
	_busy = false
	_set_status("Request sent to officers." if res.ok else _err(res))


func _has_digits(s: String) -> bool:
	for c in s:
		if c >= "0" and c <= "9":
			return true
	return false


func _on_create() -> void:
	if _busy:
		return
	var gname := _name_edit.text.strip_edges()
	if gname.is_empty():
		_set_status("Guild needs a name.")
		return
	if _has_digits(gname):
		_set_status(NAME_NO_DIGITS_MSG)
		return
	if not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, CREATE_COST):
		_set_status("You need %s Stardust to found a guild." % CREATE_COST)
		return
	_busy = true
	_set_status("Creating…")
	var desc := _desc_edit.text.strip_edges() if _desc_edit else ""
	var res: Dictionary = await SocialManager.create_guild(gname, _tag_edit.text, desc)
	_busy = false
	if not res.ok:
		_set_status(_err(res))
		return
	_set_status("Guild created.")
	await SocialManager.browse_guilds()
	await _populate()


func _on_join_by_name() -> void:
	if _busy:
		return
	var q := _join_name_edit.text.strip_edges()
	if q.is_empty():
		_set_status("Enter a guild name to join.")
		return
	_busy = true
	_set_status("Searching…")
	# Prefer exact match from public browse; fall back to API filter.
	var found: Dictionary = {}
	for g in SocialManager.guild_browse:
		if typeof(g) == TYPE_DICTIONARY and str(g.get("name", "")).to_lower() == q.to_lower():
			found = g
			break
	if found.is_empty():
		var res: Dictionary = await GameApiClient.request(
			"GET",
			"/api/entities/Guild?name=%s&limit=5" % q.uri_encode(),
			null,
			true
		)
		if res.ok and typeof(res.data) == TYPE_ARRAY:
			for g in res.data:
				if typeof(g) == TYPE_DICTIONARY and str(g.get("name", "")).to_lower() == q.to_lower():
					found = g
					break
			if found.is_empty() and not (res.data as Array).is_empty() and typeof(res.data[0]) == TYPE_DICTIONARY:
				found = res.data[0]
	if found.is_empty():
		_busy = false
		_set_status("No guild found with that name.")
		return
	if found.get("recruiting", true) == false:
		var req: Dictionary = await SocialManager.request_to_join_guild(found)
		_busy = false
		_set_status(
			("Request sent to join %s. An officer will review it." % str(found.get("name", "?")))
			if req.ok else _err(req)
		)
		return
	var join: Dictionary = await SocialManager.join_guild(str(found.get("id", "")))
	_busy = false
	if not join.ok:
		_set_status(_err(join))
		return
	_set_status("Joined.")
	await _populate()


func _on_join(guild_id: String) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Joining…")
	var res: Dictionary = await SocialManager.join_guild(guild_id)
	_busy = false
	if not res.ok:
		_set_status(_err(res))
		return
	_set_status("Joined.")
	await _populate()


func _on_leave() -> void:
	if _busy:
		return
	_busy = true
	_set_status("Leaving…")
	var res: Dictionary = await SocialManager.leave_guild()
	_busy = false
	if not res.ok:
		_set_status(_err(res))
		return
	_set_status("Left guild.")
	await SocialManager.browse_guilds()
	await _populate()


func _err(res: Dictionary) -> String:
	var err := str(res.get("error", "Failed"))
	if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
		err = str(res.data["error"])
	return err
