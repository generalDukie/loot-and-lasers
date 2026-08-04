extends Control
## Godot admin console — migrates web AdminPage tabs via AdminManager (server-authoritative).

const TAB_DEFS: Array = [
	{"id": "reports", "label": "Reports"},
	{"id": "players", "label": "Players"},
	{"id": "guild", "label": "Guilds"},
	{"id": "promo", "label": "Promo"},
	{"id": "grant", "label": "Grant"},
	{"id": "rewards", "label": "Rewards"},
	{"id": "audit", "label": "Audit"},
	{"id": "filter", "label": "Filter"},
	{"id": "mail", "label": "Mail"},
	{"id": "email", "label": "Email"},
	{"id": "schedules", "label": "Schedules"},
	{"id": "entitlements", "label": "Entitlements"},
	{"id": "server", "label": "Server"},
	{"id": "economy", "label": "Economy"},
	{"id": "ops", "label": "Ops"},
]

var _status: Label
var _tabs: HBoxContainer
var _tab_bodies: Dictionary = {}
var _active_tab := "reports"
var _busy := false
var _root: VBoxContainer

var _char_id: LineEdit
var _reason: LineEdit
var _search: LineEdit
var _player_list: VBoxContainer
var _detail: RichTextLabel

var _delta_sd: SpinBox
var _delta_nova: SpinBox
var _delta_fuel: SpinBox
var _delta_xp: SpinBox
var _item_type: LineEdit
var _item_rarity: LineEdit
var _mute_minutes: SpinBox

var _guild_id: LineEdit
var _new_leader_id: LineEdit
var _promo_code: LineEdit
var _promo_label: LineEdit
var _promo_list: VBoxContainer

var _mail_subject: LineEdit
var _mail_body: TextEdit
var _mail_all: CheckBox
var _filter_words: TextEdit

var _account_id: LineEdit
var _ent_key: LineEdit
var _ent_qty: SpinBox
var _ent_id: LineEdit
var _ent_list: VBoxContainer

var _reward_char: LineEdit
var _reward_sd: SpinBox
var _reward_nova: SpinBox
var _reward_list: VBoxContainer
var _audit_q: LineEdit
var _audit_list: VBoxContainer
var _email_list: VBoxContainer
var _sched_list: VBoxContainer
var _econ_lab: RichTextLabel
var _reports_list: VBoxContainer


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	clip_contents = true
	_build()
	if not AdminManager.is_admin():
		_status.text = "Admin access required (role=%s)." % str(AuthManager.user.get("role", "user"))
		_set_tabs_enabled(false)


func _exit_tree() -> void:
	_busy = false


func _panel(inner: Control, danger := false) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.96),
		Color(ClientUi.DANGER, 0.4) if danger else Color(ClientUi.CYAN, 0.35),
		12, 2
	))
	panel.add_child(inner)
	return panel


func _set_tabs_enabled(on: bool) -> void:
	for child in _tabs.get_children():
		if child is BaseButton:
			(child as BaseButton).disabled = not on


func _show_tab(id: String) -> void:
	_active_tab = id
	for key in _tab_bodies.keys():
		var node: Control = _tab_bodies[key]
		node.visible = str(key) == id
	var i := 0
	for child in _tabs.get_children():
		if child is Button:
			if i < TAB_DEFS.size() and str(TAB_DEFS[i]["id"]) == id:
				ClientUi.apply_primary_button(child)
			else:
				ClientUi.apply_ghost_button(child)
			i += 1


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_bottom", 10)
	add_child(margin)

	var outer := VBoxContainer.new()
	outer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_theme_constant_override("separation", 8)
	margin.add_child(outer)

	var title := Label.new()
	title.text = "Admin Console"
	title.add_theme_font_size_override("font_size", 28)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	outer.add_child(title)

	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 3)
	outer.add_child(_tabs)
	for def in TAB_DEFS:
		var tb := Button.new()
		tb.text = str(def["label"])
		tb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(tb)
		var tid := str(def["id"])
		tb.pressed.connect(func() -> void: _show_tab(tid))
		_tabs.add_child(tb)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_child(scroll)
	_root = VBoxContainer.new()
	_root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_root.add_theme_constant_override("separation", 10)
	scroll.add_child(_root)

	_build_reports()
	_build_players()
	_build_guild()
	_build_promo()
	_build_grant()
	_build_rewards()
	_build_audit()
	_build_filter()
	_build_mail()
	_build_email()
	_build_schedules()
	_build_entitlements()
	_build_server()
	_build_economy()
	_build_ops()

	_status = ClientUi.make_status()
	outer.add_child(_status)
	_show_tab("reports")


func _add_tab(id: String, body: Control, danger := false) -> void:
	var panel := _panel(body, danger)
	panel.visible = false
	_root.add_child(panel)
	_tab_bodies[id] = panel


func _btn(text: String, primary := false, danger := false) -> Button:
	var b := Button.new()
	b.text = text
	if danger:
		ClientUi.apply_danger_button(b)
	elif primary:
		ClientUi.apply_primary_button(b)
	else:
		ClientUi.apply_ghost_button(b)
	return b


func _spin(prefix: String, min_v: float, max_v: float, val: float = 0.0) -> SpinBox:
	var s := SpinBox.new()
	s.min_value = min_v
	s.max_value = max_v
	s.value = val
	s.prefix = prefix
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return s


func _confirm(title: String, text: String, on_ok: Callable) -> void:
	var d := ConfirmationDialog.new()
	d.title = title
	d.dialog_text = text
	d.ok_button_text = "Confirm"
	d.cancel_button_text = "Cancel"
	add_child(d)
	d.confirmed.connect(func() -> void:
		on_ok.call()
		d.queue_free()
	)
	d.canceled.connect(func() -> void: d.queue_free())
	d.close_requested.connect(func() -> void: d.queue_free())
	d.popup_centered()


func _run(label: String, work: Callable) -> void:
	if _busy:
		return
	if not AdminManager.is_admin():
		_status.text = "Admin access required."
		return
	_busy = true
	_status.text = label
	var res: Dictionary = await work.call()
	_busy = false
	if not is_inside_tree():
		return
	if typeof(res) != TYPE_DICTIONARY:
		_status.text = "Unexpected response."
		return
	_status.text = str(res.get("message", "Done" if res.get("ok", false) else "Failed"))
	if not bool(res.get("ok", false)) and str(res.get("message", "")).is_empty():
		_status.text = "Failed."


func _cid() -> String:
	return _char_id.text.strip_edges()


func _why() -> String:
	return _reason.text.strip_edges()


func _confirm_mod(title: String, work: Callable) -> void:
	if _cid().is_empty() or _why().is_empty():
		_status.text = "character_id and reason are required."
		return
	_confirm(title, "%s\nTarget: %s\nReason: %s" % [title, _cid(), _why()], func() -> void:
		_run("Working…", work)
	)


# ─── Reports ───────────────────────────────────────────────

func _build_reports() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("REPORTS", "Open queue", "Resolve via AdminModeration."))
	var load_btn := _btn("Load Open Reports", true)
	load_btn.pressed.connect(_on_load_reports)
	col.add_child(load_btn)
	_reports_list = VBoxContainer.new()
	_reports_list.add_theme_constant_override("separation", 6)
	col.add_child(_reports_list)
	_add_tab("reports", col)


func _on_load_reports() -> void:
	await _run("Loading reports…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.list_open_reports()
		for c in _reports_list.get_children():
			c.queue_free()
		if not res.ok:
			return res
		var rows: Array = res.raw if typeof(res.raw) == TYPE_ARRAY else []
		if rows.is_empty() and typeof(res.data) == TYPE_DICTIONARY:
			var d: Variant = res.data.get("data", null)
			if typeof(d) == TYPE_ARRAY:
				rows = d
		if rows.is_empty():
			var empty := Label.new()
			empty.text = "No open reports."
			empty.add_theme_color_override("font_color", ClientUi.MUTED)
			_reports_list.add_child(empty)
		for row in rows:
			if typeof(row) != TYPE_DICTIONARY:
				continue
			_reports_list.add_child(_make_report_row(row))
		res["message"] = "Loaded %s open report(s)." % rows.size()
		return res
	)


func _make_report_row(row: Dictionary) -> Control:
	var box := HBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var lab := Label.new()
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.text = "%s · %s → %s · %s" % [
		str(row.get("id", "")).substr(0, 8),
		str(row.get("reporter_name", row.get("reporter_id", "?"))),
		str(row.get("reported_name", row.get("reported_id", "?"))),
		str(row.get("reason", "")),
	]
	box.add_child(lab)
	var rid := str(row.get("id", ""))
	var btn := _btn("Resolve")
	btn.pressed.connect(func() -> void:
		_confirm("Resolve report?", "Mark report %s as resolved (warned)." % rid, func() -> void:
			_run("Resolving…", func() -> Dictionary: return await AdminManager.resolve_report(rid))
		)
	)
	box.add_child(btn)
	return box


# ─── Players ───────────────────────────────────────────────

func _build_players() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("PLAYERS", "Search · Moderate · Economy", "All mutations require a reason."))

	var find_row := HBoxContainer.new()
	find_row.add_theme_constant_override("separation", 8)
	col.add_child(find_row)
	_search = ClientUi.make_field("Search name or character id")
	_search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	find_row.add_child(_search)
	var find_btn := _btn("Search", true)
	find_btn.pressed.connect(_on_search_players)
	find_row.add_child(find_btn)

	_player_list = VBoxContainer.new()
	_player_list.add_theme_constant_override("separation", 4)
	col.add_child(_player_list)

	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.scroll_active = false
	_detail.custom_minimum_size = Vector2(0, 80)
	_detail.add_theme_color_override("default_color", ClientUi.MUTED)
	col.add_child(_detail)

	_char_id = ClientUi.make_field("Target character_id")
	col.add_child(_char_id)
	_reason = ClientUi.make_field("Reason (required for mutations)")
	col.add_child(_reason)

	var mute_row := HBoxContainer.new()
	mute_row.add_theme_constant_override("separation", 8)
	col.add_child(mute_row)
	_mute_minutes = _spin("min ", 1, 1440, 30)
	mute_row.add_child(_mute_minutes)
	var mute_btn := _btn("Mute", true)
	mute_btn.pressed.connect(func() -> void:
		_confirm_mod("Mute player?", func() -> Dictionary:
			return await AdminManager.mute_player(_cid(), int(_mute_minutes.value), _why())
		)
	)
	mute_row.add_child(mute_btn)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	col.add_child(row)
	for pair in [["Ban", "ban"], ["Unban", "unban"], ["Unmute", "unmute"]]:
		var b := _btn(str(pair[0]), false, str(pair[1]) == "ban")
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var act := str(pair[1])
		b.pressed.connect(func() -> void:
			_confirm_mod("%s player?" % act.capitalize(), func() -> Dictionary:
				match act:
					"ban":
						return await AdminManager.ban_player(_cid(), _why())
					"unban":
						return await AdminManager.unban_player(_cid(), _why())
					_:
						return await AdminManager.unmute_player(_cid(), _why())
			)
		)
		row.add_child(b)

	var reset := _btn("Reset Player Progress", false, true)
	reset.pressed.connect(func() -> void:
		_confirm("RESET PLAYER?", "Deletes items and resets progression for %s. Irreversible." % _cid(), func() -> void:
			_run("Resetting…", func() -> Dictionary: return await AdminManager.reset_player(_cid(), _why()))
		)
	)
	col.add_child(reset)

	var rename_row := HBoxContainer.new()
	rename_row.add_theme_constant_override("separation", 8)
	col.add_child(rename_row)
	var rename_field := ClientUi.make_field("New character name")
	rename_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rename_row.add_child(rename_field)
	var rename_btn := _btn("Rename")
	rename_btn.pressed.connect(func() -> void:
		_run("Renaming…", func() -> Dictionary:
			return await AdminManager.rename_character(_cid(), rename_field.text.strip_edges())
		)
	)
	rename_row.add_child(rename_btn)

	var role_row := HBoxContainer.new()
	role_row.add_theme_constant_override("separation", 8)
	col.add_child(role_row)
	var uid := ClientUi.make_field("Account user_id for role change")
	uid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	role_row.add_child(uid)
	var promote := _btn("Promote Admin", false, true)
	promote.pressed.connect(func() -> void:
		_confirm("Promote to admin?", "Grant admin role to %s" % uid.text, func() -> void:
			_run("Promoting…", func() -> Dictionary:
				return await AdminManager.set_role(uid.text.strip_edges(), "admin", _why())
			)
		)
	)
	role_row.add_child(promote)
	var demote := _btn("Demote User")
	demote.pressed.connect(func() -> void:
		_confirm("Demote to user?", "Remove admin from %s" % uid.text, func() -> void:
			_run("Demoting…", func() -> Dictionary:
				return await AdminManager.set_role(uid.text.strip_edges(), "user", _why())
			)
		)
	)
	role_row.add_child(demote)

	col.add_child(ClientUi.make_section_header("", "Currency deltas", "Positive adds, negative removes."))
	var crow := HBoxContainer.new()
	crow.add_theme_constant_override("separation", 6)
	col.add_child(crow)
	_delta_sd = _spin("SD ", -1000000, 1000000)
	_delta_nova = _spin("Nova ", -100000, 100000)
	_delta_fuel = _spin("Fuel ", -1000, 1000)
	_delta_xp = _spin("XP ", -10000000, 10000000)
	crow.add_child(_delta_sd)
	crow.add_child(_delta_nova)
	crow.add_child(_delta_fuel)
	crow.add_child(_delta_xp)
	var adj := _btn("Apply Currency", true)
	adj.pressed.connect(func() -> void:
		var deltas := {
			"stardust": int(_delta_sd.value),
			"nova_crystals": int(_delta_nova.value),
			"fuel": int(_delta_fuel.value),
			"experience": int(_delta_xp.value),
		}
		_confirm_mod("Adjust currency?", func() -> Dictionary:
			return await AdminManager.adjust_currency(_cid(), deltas, _why())
		)
	)
	col.add_child(adj)
	_add_tab("players", col, true)


func _on_search_players() -> void:
	await _run("Searching…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.search_players(_search.text)
		for c in _player_list.get_children():
			c.queue_free()
		if not res.ok:
			return res
		var rows: Array = res.data.get("players", []) if typeof(res.data) == TYPE_DICTIONARY else []
		for row in rows:
			if typeof(row) != TYPE_DICTIONARY:
				continue
			var b := _btn("%s  ·  Lv%s  ·  %s" % [
				str(row.get("name", "?")),
				str(row.get("level", 1)),
				str(row.get("id", "")).substr(0, 8),
			])
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			var snap: Dictionary = row
			b.pressed.connect(func() -> void: _select_player(snap))
			_player_list.add_child(b)
		res["message"] = "Found %s character(s)." % rows.size()
		return res
	)


func _select_player(row: Dictionary) -> void:
	_char_id.text = str(row.get("id", ""))
	_detail.text = "[b]%s[/b]  Lv %s · %s · %s\nid=%s\nowner=%s\nSD %s · Nova %s · Fuel %s/%s" % [
		str(row.get("name", "?")),
		str(row.get("level", 1)),
		str(row.get("race", "?")),
		str(row.get("class", "?")),
		str(row.get("id", "")),
		str(row.get("owner_id", row.get("created_by", "?"))),
		str(row.get("stardust", 0)),
		str(row.get("nova_crystals", 0)),
		str(row.get("fuel", 0)),
		str(row.get("max_fuel", 100)),
	]
	_run("Loading inventory…", func() -> Dictionary:
		var items: Dictionary = await AdminManager.list_character_items(str(row.get("id", "")))
		if items.ok:
			var arr: Array = items.raw if typeof(items.raw) == TYPE_ARRAY else []
			var names: PackedStringArray = []
			for it in arr:
				if typeof(it) == TYPE_DICTIONARY:
					names.append(str(it.get("name", "?")))
			_detail.text += "\nItems (%s): %s" % [names.size(), ", ".join(names)]
			items["message"] = "Selected %s" % str(row.get("name", ""))
		return items
	)


# ─── Guilds ────────────────────────────────────────────────

func _build_guild() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("GUILDS", "Force leadership transfer", ""))
	var load_g := _btn("Load Guilds", true)
	load_g.pressed.connect(_on_load_guilds)
	col.add_child(load_g)
	_guild_id = ClientUi.make_field("guild_id")
	col.add_child(_guild_id)
	_new_leader_id = ClientUi.make_field("new_leader character_id")
	col.add_child(_new_leader_id)
	var xfer := _btn("Transfer Leadership", false, true)
	xfer.pressed.connect(func() -> void:
		if _why().is_empty():
			_reason.text = "admin guild transfer"
		_confirm("Transfer guild leadership?", "Guild %s → %s" % [_guild_id.text, _new_leader_id.text], func() -> void:
			_run("Transferring…", func() -> Dictionary:
				return await AdminManager.transfer_guild(
					_guild_id.text.strip_edges(),
					_new_leader_id.text.strip_edges(),
					_why()
				)
			)
		)
	)
	col.add_child(xfer)
	_add_tab("guild", col)


func _on_load_guilds() -> void:
	await _run("Loading guilds…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.list_guilds()
		var rows: Array = res.raw if typeof(res.raw) == TYPE_ARRAY else []
		var lines: PackedStringArray = []
		for g in rows:
			if typeof(g) == TYPE_DICTIONARY:
				lines.append("%s · %s · leader=%s" % [
					str(g.get("name", "?")),
					str(g.get("id", "")).substr(0, 8),
					str(g.get("leader_id", "")).substr(0, 8),
				])
		_status.text = "Guilds:\n" + "\n".join(lines) if not lines.is_empty() else "No guilds."
		res["message"] = "Loaded %s guild(s)." % rows.size()
		return res
	)


# ─── Promo ─────────────────────────────────────────────────

func _build_promo() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("PROMO CODES", "Create · Toggle · Delete", "Server promo CRUD currently lacks global audit writes."))
	_promo_code = ClientUi.make_field("CODE")
	col.add_child(_promo_code)
	_promo_label = ClientUi.make_field("Label")
	col.add_child(_promo_label)
	var create := _btn("Create (100 SD)", true)
	create.pressed.connect(func() -> void:
		_run("Creating promo…", func() -> Dictionary:
			return await AdminManager.create_promo_code(
				_promo_code.text.strip_edges(),
				_promo_label.text.strip_edges(),
				{"stardust": 100},
				100
			)
		)
	)
	col.add_child(create)
	var refresh := _btn("Refresh List")
	refresh.pressed.connect(_on_load_promos)
	col.add_child(refresh)
	_promo_list = VBoxContainer.new()
	_promo_list.add_theme_constant_override("separation", 4)
	col.add_child(_promo_list)
	_add_tab("promo", col)


func _on_load_promos() -> void:
	await _run("Loading promos…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.list_promo_codes()
		for c in _promo_list.get_children():
			c.queue_free()
		var rows: Array = res.raw if typeof(res.raw) == TYPE_ARRAY else []
		for row in rows:
			if typeof(row) != TYPE_DICTIONARY:
				continue
			var box := HBoxContainer.new()
			var lab := Label.new()
			lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			lab.text = "%s · %s · active=%s" % [
				str(row.get("code", "")),
				str(row.get("label", "")),
				str(row.get("active", true)),
			]
			box.add_child(lab)
			var pid := str(row.get("id", ""))
			var active := bool(row.get("active", true))
			var tog := _btn("Off" if active else "On")
			tog.pressed.connect(func() -> void:
				_run("Toggling…", func() -> Dictionary:
					return await AdminManager.toggle_promo_code(pid, not active)
				)
			)
			box.add_child(tog)
			var del := _btn("Delete", false, true)
			del.pressed.connect(func() -> void:
				_confirm("Delete promo?", pid, func() -> void:
					_run("Deleting…", func() -> Dictionary: return await AdminManager.delete_promo_code(pid))
				)
			)
			box.add_child(del)
			_promo_list.add_child(box)
		res["message"] = "Loaded %s promo(s)." % rows.size()
		return res
	)


# ─── Grant ─────────────────────────────────────────────────

func _build_grant() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("GRANT ITEM", "Uses Players target + reason", ""))
	_item_type = ClientUi.make_field("type (weapon/armor/…)")
	_item_type.text = "weapon"
	col.add_child(_item_type)
	_item_rarity = ClientUi.make_field("rarity (common…legendary)")
	_item_rarity.text = "rare"
	col.add_child(_item_rarity)
	var give := _btn("Give Generated Item", true)
	give.pressed.connect(func() -> void:
		_confirm_mod("Grant item?", func() -> Dictionary:
			return await AdminManager.grant_item(_cid(), {
				"generate": true,
				"type": _item_type.text.strip_edges(),
				"rarity": _item_rarity.text.strip_edges(),
			}, _why())
		)
	)
	col.add_child(give)
	var tip := Label.new()
	tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tip.text = "Set character_id and reason on the Players tab first. Currency grants are also on Players."
	tip.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(tip)
	_add_tab("grant", col)


# ─── Rewards ───────────────────────────────────────────────

func _build_rewards() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("REWARDS", "Compensation · Retry", ""))
	_reward_char = ClientUi.make_field("characterId for compensation")
	col.add_child(_reward_char)
	var rrow := HBoxContainer.new()
	rrow.add_theme_constant_override("separation", 8)
	col.add_child(rrow)
	_reward_sd = _spin("SD ", 0, 1000000, 0)
	_reward_nova = _spin("Nova ", 0, 100000, 0)
	rrow.add_child(_reward_sd)
	rrow.add_child(_reward_nova)
	var grant := _btn("Grant Compensation", true)
	grant.pressed.connect(func() -> void:
		if _why().is_empty():
			_status.text = "Reason required."
			return
		_confirm("Grant compensation?", "SD %s · Nova %s" % [int(_reward_sd.value), int(_reward_nova.value)], func() -> void:
			_run("Granting reward…", func() -> Dictionary:
				return await AdminManager.rewards_grant({
					"characterId": _reward_char.text.strip_edges(),
					"reason": _why(),
					"stardust": int(_reward_sd.value),
					"nova_crystals": int(_reward_nova.value),
				})
			)
		)
	)
	col.add_child(grant)
	var search := _btn("Search Recent Claims")
	search.pressed.connect(func() -> void:
		_run("Searching rewards…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.rewards_search({"limit": "50"})
			_fill_kv_list(_reward_list, res)
			return res
		)
	)
	col.add_child(search)
	_reward_list = VBoxContainer.new()
	col.add_child(_reward_list)
	_add_tab("rewards", col)


# ─── Audit ─────────────────────────────────────────────────

func _build_audit() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("AUDIT LOGS", "Search · Annotate", ""))
	_audit_q = ClientUi.make_field("action or accountId filter")
	col.add_child(_audit_q)
	var search := _btn("Search Audit", true)
	search.pressed.connect(func() -> void:
		_run("Searching audit…", func() -> Dictionary:
			var params := {"limit": "50"}
			var q := _audit_q.text.strip_edges()
			if not q.is_empty():
				if q.length() > 20:
					params["accountId"] = q
				else:
					params["action"] = q
			var res: Dictionary = await AdminManager.audit_search(params)
			_fill_kv_list(_audit_list, res)
			return res
		)
	)
	col.add_child(search)
	_audit_list = VBoxContainer.new()
	col.add_child(_audit_list)
	_add_tab("audit", col)


# ─── Filter ────────────────────────────────────────────────

func _build_filter() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("CHAT FILTER", "Word list", "One word per line."))
	var load_f := _btn("Load Current Filter", true)
	load_f.pressed.connect(func() -> void:
		_run("Loading filter…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.get_moderation_filter()
			if res.ok and typeof(res.data) == TYPE_DICTIONARY:
				var words: Variant = res.data.get("filtered_words", [])
				if typeof(words) == TYPE_ARRAY:
					var lines: PackedStringArray = []
					for w in words:
						lines.append(str(w))
					_filter_words.text = "\n".join(lines)
			return res
		)
	)
	col.add_child(load_f)
	_filter_words = TextEdit.new()
	_filter_words.custom_minimum_size = Vector2(0, 160)
	_filter_words.placeholder_text = "badword\nother"
	col.add_child(_filter_words)
	var save := _btn("Save Filter", true)
	save.pressed.connect(func() -> void:
		var words: Array = []
		for line in _filter_words.text.split("\n"):
			var w := str(line).strip_edges()
			if not w.is_empty():
				words.append(w)
		_confirm("Save chat filter?", "%s words" % words.size(), func() -> void:
			_run("Saving filter…", func() -> Dictionary: return await AdminManager.edit_filter(words))
		)
	)
	col.add_child(save)
	_add_tab("filter", col)


# ─── Mail ──────────────────────────────────────────────────

func _build_mail() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("SYSTEM MAIL", "Broadcast or targeted", ""))
	_mail_subject = ClientUi.make_field("Subject")
	col.add_child(_mail_subject)
	_mail_body = TextEdit.new()
	_mail_body.custom_minimum_size = Vector2(0, 100)
	_mail_body.placeholder_text = "Body"
	col.add_child(_mail_body)
	_mail_all = CheckBox.new()
	_mail_all.text = "Send to ALL players"
	col.add_child(_mail_all)
	var send := _btn("Send System Mail", true)
	send.pressed.connect(func() -> void:
		if _why().is_empty():
			_status.text = "Reason required (Players tab)."
			return
		var recipients: Variant = "all" if _mail_all.button_pressed else [_cid()]
		_confirm("Send system mail?", str(recipients), func() -> void:
			_run("Sending mail…", func() -> Dictionary:
				return await AdminManager.send_system_mail(
					_mail_subject.text.strip_edges(),
					_mail_body.text,
					recipients,
					_why()
				)
			)
		)
	)
	col.add_child(send)
	_add_tab("mail", col)


# ─── Email ─────────────────────────────────────────────────

func _build_email() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("EMAIL", "SMTP log · test", ""))
	var load_e := _btn("Load Email Log", true)
	load_e.pressed.connect(func() -> void:
		_run("Loading email log…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.email_log(50)
			_fill_kv_list(_email_list, res)
			return res
		)
	)
	col.add_child(load_e)
	var test := _btn("Send Test Email")
	test.pressed.connect(func() -> void:
		_run("Sending test email…", func() -> Dictionary: return await AdminManager.email_test())
	)
	col.add_child(test)
	_email_list = VBoxContainer.new()
	col.add_child(_email_list)
	_add_tab("email", col)


# ─── Schedules ─────────────────────────────────────────────

func _build_schedules() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("SCHEDULES", "List · Pause · Tick", ""))
	var load_s := _btn("Load Schedules", true)
	load_s.pressed.connect(func() -> void:
		_run("Loading schedules…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.schedules_list()
			_fill_schedule_list(res)
			return res
		)
	)
	col.add_child(load_s)
	var tick := _btn("Manual Tick")
	tick.pressed.connect(func() -> void:
		_confirm("Run schedule tick?", "Executes due jobs now.", func() -> void:
			_run("Ticking…", func() -> Dictionary: return await AdminManager.schedules_tick())
		)
	)
	col.add_child(tick)
	_sched_list = VBoxContainer.new()
	col.add_child(_sched_list)
	_add_tab("schedules", col)


func _fill_schedule_list(res: Dictionary) -> void:
	for c in _sched_list.get_children():
		c.queue_free()
	if not res.ok:
		return
	var rows: Array = []
	if typeof(res.raw) == TYPE_ARRAY:
		rows = res.raw
	elif typeof(res.data) == TYPE_DICTIONARY and typeof(res.data.get("schedules", null)) == TYPE_ARRAY:
		rows = res.data["schedules"]
	elif typeof(res.data) == TYPE_ARRAY:
		rows = res.data
	for row in rows:
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var box := HBoxContainer.new()
		var lab := Label.new()
		lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lab.text = "%s · enabled=%s · %s" % [
			str(row.get("name", row.get("id", "?"))),
			str(row.get("enabled", true)),
			str(row.get("id", "")).substr(0, 8),
		]
		box.add_child(lab)
		var sid := str(row.get("id", ""))
		var en := bool(row.get("enabled", true))
		var tog := _btn("Pause" if en else "Resume")
		tog.pressed.connect(func() -> void:
			_run("Updating schedule…", func() -> Dictionary:
				if en:
					return await AdminManager.schedules_pause(sid)
				return await AdminManager.schedules_resume(sid)
			)
		)
		box.add_child(tog)
		_sched_list.add_child(box)


# ─── Entitlements ──────────────────────────────────────────

func _build_entitlements() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("ENTITLEMENTS", "Grant · Revoke · Restore", ""))
	_account_id = ClientUi.make_field("accountId")
	_account_id.text = str(AuthManager.user.get("id", ""))
	col.add_child(_account_id)
	_ent_key = ClientUi.make_field("entitlementKey")
	_ent_key.text = "account.rename_token"
	col.add_child(_ent_key)
	_ent_qty = _spin("qty ", 1, 99, 1)
	col.add_child(_ent_qty)
	var grant := _btn("Grant", true)
	grant.pressed.connect(func() -> void:
		if _why().is_empty():
			_status.text = "Reason required."
			return
		_confirm("Grant entitlement?", _ent_key.text, func() -> void:
			_run("Granting entitlement…", func() -> Dictionary:
				return await AdminManager.entitlements_grant({
					"entitlementKey": _ent_key.text.strip_edges(),
					"accountId": _account_id.text.strip_edges(),
					"quantity": int(_ent_qty.value),
					"reason": _why(),
					"confirm": true,
				})
			)
		)
	)
	col.add_child(grant)
	_ent_id = ClientUi.make_field("entitlement record id")
	col.add_child(_ent_id)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	col.add_child(row)
	var rev := _btn("Revoke", false, true)
	rev.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rev.pressed.connect(func() -> void:
		_confirm("Revoke entitlement?", _ent_id.text, func() -> void:
			_run("Revoking…", func() -> Dictionary:
				return await AdminManager.entitlements_revoke(_ent_id.text.strip_edges(), {"reason": _why()})
			)
		)
	)
	row.add_child(rev)
	var rest := _btn("Restore")
	rest.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rest.pressed.connect(func() -> void:
		_run("Restoring…", func() -> Dictionary:
			return await AdminManager.entitlements_restore(_ent_id.text.strip_edges(), {"reason": _why()})
		)
	)
	row.add_child(rest)
	var search := _btn("Search Account Entitlements")
	search.pressed.connect(func() -> void:
		_run("Searching entitlements…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.entitlements_search({
				"accountId": _account_id.text.strip_edges(),
			})
			_fill_kv_list(_ent_list, res)
			return res
		)
	)
	col.add_child(search)
	_ent_list = VBoxContainer.new()
	col.add_child(_ent_list)
	_add_tab("entitlements", col)


# ─── Server (unavailable wipe) ─────────────────────────────

func _build_server() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("SERVER", "Wipe unavailable", ""))
	var lab := Label.new()
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.text = "Server Refresh wipe is not migrated. The web wipe UI is broken (unconstrained deleteMany is rejected by the API). No Godot wipe control until a safe constrained backend wipe exists."
	lab.add_theme_color_override("font_color", ClientUi.WARNING)
	col.add_child(lab)
	_add_tab("server", col, true)


# ─── Economy ───────────────────────────────────────────────

func _build_economy() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("ECONOMY", "Circulation snapshot", "Read-only analytics."))
	var load_e := _btn("Refresh Snapshot", true)
	load_e.pressed.connect(func() -> void:
		_run("Loading economy…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.economy_snapshot()
			if res.ok and typeof(res.data) == TYPE_DICTIONARY:
				var d: Dictionary = res.data
				_econ_lab.text = "[b]Characters[/b] %s\n[b]Total Stardust[/b] %s\n[b]Total Nova[/b] %s\nNova events: %s · Stardust events: %s" % [
					str(d.get("character_count", 0)),
					str(d.get("total_stardust", 0)),
					str(d.get("total_nova", 0)),
					str((d.get("nova_events", []) as Array).size() if typeof(d.get("nova_events", null)) == TYPE_ARRAY else 0),
					str((d.get("stardust_events", []) as Array).size() if typeof(d.get("stardust_events", null)) == TYPE_ARRAY else 0),
				]
			return res
		)
	)
	col.add_child(load_e)
	_econ_lab = RichTextLabel.new()
	_econ_lab.bbcode_enabled = true
	_econ_lab.fit_content = true
	_econ_lab.text = "Load a snapshot to view circulation."
	col.add_child(_econ_lab)
	_add_tab("economy", col)


# ─── Ops (live operations) ─────────────────────────────────

func _build_ops() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("OPS", "Live operations", "Maintenance, flags, integrity — Node enforces."))
	var dash_lab := RichTextLabel.new()
	dash_lab.bbcode_enabled = true
	dash_lab.fit_content = true
	dash_lab.text = "Load dashboard for live snapshot."
	col.add_child(dash_lab)
	var load_d := _btn("Refresh Ops Dashboard", true)
	load_d.pressed.connect(func() -> void:
		_run("Loading ops…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.get_ops_dashboard()
			if res.ok and typeof(res.data) == TYPE_DICTIONARY:
				var d: Dictionary = res.data.get("dashboard", res.data)
				if typeof(d) != TYPE_DICTIONARY:
					d = res.data
				var maint: Dictionary = d.get("maintenance", {}) if typeof(d.get("maintenance", null)) == TYPE_DICTIONARY else {}
				dash_lab.text = "[b]Accounts[/b] %s · [b]Characters[/b] %s · [b]Presence[/b] %s\n[b]Open reports[/b] %s · [b]Quarantine[/b] %s\n[b]Maintenance[/b] %s — %s" % [
					str(d.get("accounts", 0)),
					str(d.get("characters", 0)),
					str(d.get("players_online_estimate", 0)),
					str(d.get("open_reports", 0)),
					str(d.get("pending_quarantine", 0)),
					str(maint.get("enabled", false)),
					str(maint.get("message", "")),
				]
			return res
		)
	)
	col.add_child(load_d)

	var maint_on := _btn("Enable Maintenance")
	maint_on.pressed.connect(func() -> void:
		_run("Enabling maintenance…", func() -> Dictionary:
			return await AdminManager.set_maintenance_mode(true, "Temporary maintenance", _why())
		)
	)
	col.add_child(maint_on)
	var maint_off := _btn("Disable Maintenance")
	maint_off.pressed.connect(func() -> void:
		_run("Disabling maintenance…", func() -> Dictionary:
			return await AdminManager.set_maintenance_mode(false, "", _why())
		)
	)
	col.add_child(maint_off)

	var flag_row := HBoxContainer.new()
	flag_row.add_theme_constant_override("separation", 6)
	col.add_child(flag_row)
	var flag_name := LineEdit.new()
	flag_name.placeholder_text = "feature_flag"
	flag_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	flag_row.add_child(flag_name)
	var flag_on := _btn("Flag ON")
	flag_on.pressed.connect(func() -> void:
		_run("Setting flag…", func() -> Dictionary:
			return await AdminManager.set_feature_flag(flag_name.text.strip_edges(), true, _why())
		)
	)
	flag_row.add_child(flag_on)
	var flag_off := _btn("Flag OFF")
	flag_off.pressed.connect(func() -> void:
		_run("Clearing flag…", func() -> Dictionary:
			return await AdminManager.set_feature_flag(flag_name.text.strip_edges(), false, _why())
		)
	)
	flag_row.add_child(flag_off)

	var audit_btn := _btn("Integrity Audit (selected character)")
	audit_btn.pressed.connect(func() -> void:
		_run("Running integrity audit…", func() -> Dictionary:
			return await AdminManager.run_integrity_audit(_char_id.text.strip_edges(), "", false)
		)
	)
	col.add_child(audit_btn)

	var arena_s := _btn("Arena Suspend 24h")
	arena_s.pressed.connect(func() -> void:
		_run("Suspending arena…", func() -> Dictionary:
			return await AdminManager.arena_suspend(_char_id.text.strip_edges(), 24, _why())
		)
	)
	col.add_child(arena_s)

	_add_tab("ops", col)


func _fill_kv_list(host: VBoxContainer, res: Dictionary) -> void:
	for c in host.get_children():
		c.queue_free()
	if not res.ok:
		var err := Label.new()
		err.text = str(res.get("message", "Failed"))
		err.add_theme_color_override("font_color", ClientUi.DANGER)
		host.add_child(err)
		return
	var rows: Array = []
	if typeof(res.raw) == TYPE_ARRAY:
		rows = res.raw
	elif typeof(res.data) == TYPE_DICTIONARY:
		for key in ["entries", "claims", "items", "events", "results", "data"]:
			if typeof(res.data.get(key, null)) == TYPE_ARRAY:
				rows = res.data[key]
				break
		if rows.is_empty() and typeof(res.data.get("data", null)) == TYPE_ARRAY:
			rows = res.data["data"]
	elif typeof(res.data) == TYPE_ARRAY:
		rows = res.data
	if rows.is_empty():
		var empty := Label.new()
		empty.text = JSON.stringify(res.data) if typeof(res.data) == TYPE_DICTIONARY else "No rows."
		empty.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		empty.add_theme_color_override("font_color", ClientUi.MUTED)
		host.add_child(empty)
		return
	var n := 0
	for row in rows:
		if n >= 40:
			break
		n += 1
		var lab := Label.new()
		lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		if typeof(row) == TYPE_DICTIONARY:
			lab.text = str(row.get("id", row.get("action", row.get("code", row))))
			if row.has("action"):
				lab.text = "%s · %s" % [str(row.get("action")), str(row.get("id", "")).substr(0, 10)]
			elif row.has("status"):
				lab.text = "%s · %s" % [str(row.get("status")), str(row.get("id", "")).substr(0, 10)]
		else:
			lab.text = str(row)
		host.add_child(lab)
