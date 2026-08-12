extends Control
## Guild wars — declare, ready, resolve (web GuildWars chrome).

var _meta: HBoxContainer
var _status: Label
var _list: VBoxContainer
var _busy := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_populate()


func _boot() -> void:
	_status.text = "Loading wars…"
	await SocialManager.load_my_guild()
	await SocialManager.browse_guilds()
	_populate()
	_status.text = "Ready."


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
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var header := HBoxContainer.new()
	root.add_child(header)
	var head_l := VBoxContainer.new()
	head_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_l.add_theme_constant_override("separation", 2)
	header.add_child(head_l)
	var eye := Label.new()
	eye.text = "GUILD CONFLICT"
	eye.add_theme_font_size_override("font_size", 13)
	eye.add_theme_color_override("font_color", Color(ClientUi.WARNING, 0.85))
	ClientUi.apply_display_font(eye)
	head_l.add_child(eye)
	head_l.add_child(UiIcon.make_title_row("swords", "Guild Wars", ClientUi.TEXT, 29, 28.0))
	_meta = HBoxContainer.new()
	_meta.add_theme_constant_override("separation", 4)
	_meta.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_l.add_child(_meta)

	var refresh := Button.new()
	refresh.text = "Refresh"
	ClientUi.apply_ghost_button(refresh)
	refresh.pressed.connect(_boot)
	header.add_child(refresh)

	_status = ClientUi.make_status()
	root.add_child(_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 10)
	scroll.add_child(_list)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()
	var guild: Dictionary = SocialManager.my_guild
	var role := str(SocialManager.my_membership.get("role", ""))
	if guild.is_empty():
		_set_meta_text("Join a guild first.")
		_list.add_child(_empty("You need a guild before declaring war."))
		return
	_rebuild_meta(
		"[%s] %s · %s ·" % [str(guild.get("tag", "")), str(guild.get("name", "")), role],
		str(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST)),
		"SD · declare costs %s" % GuildWarManager.DECLARE_COST
	)

	_list.add_child(ClientUi.make_section_header("DECLARE", "Choose a Target", "Leaders & officers only · %s SD." % GuildWarManager.DECLARE_COST))
	var can_declare := role == "leader" or role == "officer"
	var can_afford := CurrencyManager.can_afford(
		CurrencyManager.CURRENCY_STARDUST,
		GuildWarManager.DECLARE_COST
	)
	var targets := 0
	for g in SocialManager.guild_browse:
		if typeof(g) != TYPE_DICTIONARY:
			continue
		var gid := str(g.get("id", ""))
		if gid == str(guild.get("id", "")):
			continue
		targets += 1
		_list.add_child(_target_row(g, can_declare, can_afford))
	if targets == 0:
		_list.add_child(_lab("No other guilds to declare on."))

	var wars: Array = await GuildWarManager.list_wars(str(guild.get("id", "")))
	_list.add_child(ClientUi.make_section_header("THEATER", "Active / Recent Wars", "%s recorded." % wars.size()))
	if wars.is_empty():
		_list.add_child(_empty("No wars yet."))
		return
	for w in wars:
		await _add_war_card(w)


func _target_row(g: Dictionary, can_declare: bool, can_afford: bool) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.07, 0.08, 0.12, 0.95), Color(0.55, 0.35, 0.3, 0.45), 10, 1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	var info := Label.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.text = "[%s] %s · Lv %s" % [str(g.get("tag", "")), str(g.get("name", "?")), ClientUi.format_level(g.get("level", 1))]
	info.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(info)
	row.add_child(info)
	if can_declare:
		var btn := Button.new()
		btn.text = "Declare"
		ClientUi.apply_primary_button(btn)
		btn.disabled = not can_afford
		var capt := str(g.get("id", ""))
		btn.pressed.connect(func() -> void: _on_declare(capt))
		row.add_child(btn)
	return panel


func _add_war_card(w: Dictionary) -> void:
	var panel := PanelContainer.new()
	var status := str(w.get("status", "?"))
	var border := Color(0.7, 0.4, 0.35, 0.55)
	if status == "completed":
		border = Color(ClientUi.GOLD, 0.5)
	elif status == "readying":
		border = Color(ClientUi.WARNING, 0.55)
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.08, 0.07, 0.1, 0.96), border, 12, 2
	))
	_list.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)

	var status_l := Label.new()
	status_l.text = status.to_upper()
	status_l.add_theme_font_size_override("font_size", 17)
	status_l.add_theme_color_override("font_color", border)
	ClientUi.apply_display_font(status_l)
	col.add_child(status_l)

	col.add_child(_lab("[%s] %s  vs  %s" % [
		str(w.get("attacker_guild_tag", "")),
		str(w.get("attacker_guild_name", "?")),
		str(w.get("defender_guild_name", "?")),
	]))
	col.add_child(_lab("Deadline: %s · winner: %s" % [
		str(w.get("ready_deadline", "—")),
		str(w.get("winner_side", "—")),
	]))
	if status == "readying":
		var readies: Array = await GuildWarManager.list_readies(str(w.get("id", "")))
		col.add_child(_lab("Ready: %s fighters" % readies.size()))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		col.add_child(row)
		var ready_btn := Button.new()
		var mine: Dictionary = await GuildWarManager.my_ready(str(w.get("id", "")))
		ready_btn.text = "Unready" if not mine.is_empty() else "Ready Up"
		ClientUi.apply_primary_button(ready_btn)
		var capt_w: Dictionary = w
		ready_btn.pressed.connect(func() -> void: _on_ready(capt_w))
		row.add_child(ready_btn)
		if GuildWarManager.is_deadline_passed(w):
			var res_btn := Button.new()
			res_btn.text = "Resolve War"
			ClientUi.apply_ghost_button(res_btn)
			res_btn.pressed.connect(func() -> void: _on_resolve(capt_w))
			row.add_child(res_btn)
	elif status == "completed":
		var log: Variant = w.get("battle_log", [])
		if typeof(log) == TYPE_ARRAY and (log as Array).size() > 0:
			var d0: Dictionary = log[0]
			col.add_child(_lab("First duel: %s vs %s → %s" % [
				str(d0.get("attacker_name", "?")),
				str(d0.get("defender_name", "?")),
				str(d0.get("winner", "?")),
			]))


func _lab(t: String) -> Label:
	var l := Label.new()
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.text = t
	l.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(l)
	return l


func _empty(t: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.9), Color(0.3, 0.38, 0.48, 0.35), 12, 1
	))
	var l := Label.new()
	l.text = t
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	panel.add_child(l)
	return panel


func _on_declare(gid: String) -> void:
	if _busy:
		return
	if not CurrencyManager.can_afford(
		CurrencyManager.CURRENCY_STARDUST,
		GuildWarManager.DECLARE_COST
	):
		_status.text = "Need %s SD to declare war." % GuildWarManager.DECLARE_COST
		return
	_busy = true
	_status.text = "Declaring…"
	var res: Dictionary = await GuildWarManager.declare_war(gid)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Declare failed"))
		return
	_status.text = "War declared (−%s SD)." % GuildWarManager.DECLARE_COST
	await _boot()


func _set_meta_text(msg: String) -> void:
	if not is_instance_valid(_meta):
		return
	for c in _meta.get_children():
		c.queue_free()
	var lab := Label.new()
	lab.text = msg
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.add_theme_font_size_override("font_size", 19)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(lab)
	_meta.add_child(lab)


func _rebuild_meta(prefix: String, sd_amount: String, suffix: String) -> void:
	if not is_instance_valid(_meta):
		return
	for c in _meta.get_children():
		c.queue_free()
	var pre := Label.new()
	pre.text = prefix
	pre.add_theme_font_size_override("font_size", 19)
	pre.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(pre)
	_meta.add_child(pre)
	_meta.add_child(CurrencyIcon.make("stardust", 16.0))
	var mid := Label.new()
	mid.text = "%s %s" % [sd_amount, suffix]
	mid.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.add_theme_font_size_override("font_size", 19)
	mid.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(mid)
	_meta.add_child(mid)


func _on_ready(war: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await GuildWarManager.toggle_ready(war)
	_busy = false
	_status.text = "Ready." if bool(res.get("ready", false)) else "Unreadied."
	if not bool(res.get("ok", false)):
		_status.text = str(res.get("error", "Ready failed"))
	await _boot()


func _on_resolve(war: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Resolving gauntlet…"
	var res: Dictionary = await GuildWarManager.resolve_war(war)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Resolve failed"))
		return
	_status.text = "Winner: %s" % str(res.get("winner", "?"))
	await _boot()
