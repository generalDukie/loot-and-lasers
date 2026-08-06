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
var _env_banner: Label
var _target_banner: Label
var _session_lab: RichTextLabel
var _selected_name := ""
var _selected_account_id := ""

var _char_id: LineEdit
var _reason: LineEdit
var _search: LineEdit
var _player_list: VBoxContainer
var _detail: RichTextLabel
var _account_hits: VBoxContainer

var _delta_sd: SpinBox
var _delta_nova: SpinBox
var _delta_fuel: SpinBox
var _delta_xp: SpinBox
var _item_type: OptionButton
var _item_rarity: OptionButton
var _item_level: SpinBox
var _mute_minutes: SpinBox

var _guild_id: LineEdit
var _new_leader_id: LineEdit
var _guild_list: VBoxContainer
var _guild_members: VBoxContainer
var _promo_code: LineEdit
var _promo_label: LineEdit
var _promo_sd: SpinBox
var _promo_nova: SpinBox
var _promo_max: SpinBox
var _promo_list: VBoxContainer

var _mail_subject: LineEdit
var _mail_body: TextEdit
var _mail_all: CheckBox
var _mail_sd: SpinBox
var _mail_nova: SpinBox
var _mail_expires: SpinBox
var _filter_words: TextEdit

var _account_id: LineEdit
var _ent_key: LineEdit
var _ent_qty: SpinBox
var _ent_id: LineEdit
var _ent_list: VBoxContainer
var _ent_products: VBoxContainer

var _reward_char: LineEdit
var _reward_sd: SpinBox
var _reward_nova: SpinBox
var _reward_claim_id: LineEdit
var _reward_list: VBoxContainer
var _audit_q: LineEdit
var _audit_entry_id: LineEdit
var _audit_note: LineEdit
var _audit_list: VBoxContainer
var _email_list: VBoxContainer
var _sched_list: VBoxContainer
var _sched_audit_list: VBoxContainer
var _econ_lab: RichTextLabel
var _reports_list: VBoxContainer
var _ops_out: RichTextLabel
var _flag_name: LineEdit
var _repair_type: OptionButton
var _migration_id: LineEdit
var _role_user_id: LineEdit
var _rename_field: LineEdit
var _arena_hours: SpinBox


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	clip_contents = true
	_build()
	_refresh_target_banner()
	if not AdminManager.is_admin():
		_status.text = "Admin access required (role=%s). Privileged controls disabled." % str(AuthManager.user.get("role", "user"))
		_set_tabs_enabled(false)
		if _env_banner:
			_env_banner.text = "ADMIN LOCKED · role=%s · env=%s" % [
				str(AuthManager.user.get("role", "user")),
				BackendEnvironment.get_environment_id() if BackendEnvironment else "?",
			]
	else:
		_status.text = "Ready. Select a target on Players, then use other tabs."


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

	_env_banner = Label.new()
	_env_banner.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_env_banner.add_theme_color_override("font_color", ClientUi.WARNING)
	_env_banner.text = "ENV %s · role=%s · node=%s · permissions=admin (binary role; Node re-checks every request)" % [
		BackendEnvironment.get_environment_id().to_upper() if BackendEnvironment else "?",
		str(AuthManager.user.get("role", "user")),
		str(GameApiClient.base_url) if GameApiClient else "?",
	]
	outer.add_child(_env_banner)

	_target_banner = Label.new()
	_target_banner.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_target_banner.add_theme_color_override("font_color", ClientUi.CYAN)
	outer.add_child(_target_banner)

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


func _option(items: Array, selected: int = 0) -> OptionButton:
	var ob := OptionButton.new()
	ob.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for it in items:
		ob.add_item(str(it))
	ob.select(clampi(selected, 0, maxi(0, items.size() - 1)))
	return ob


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
		_status.text = "Action already in progress — wait for the current result."
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
	var msg := str(res.get("message", "Done" if res.get("ok", false) else "Failed"))
	if not bool(res.get("ok", false)) and msg.is_empty():
		msg = "Failed."
	var audit := str(res.get("audit_id", ""))
	var corr := str(res.get("correlation_id", ""))
	if not audit.is_empty() and msg.find("audit=") < 0:
		msg = "%s · audit=%s" % [msg, audit.substr(0, 12)]
	elif not corr.is_empty() and msg.find("corr=") < 0:
		msg = "%s · corr=%s" % [msg, corr.substr(0, 12)]
	_status.text = msg


func _cid() -> String:
	return _char_id.text.strip_edges() if _char_id else ""


func _why() -> String:
	return _reason.text.strip_edges() if _reason else ""


func _require_target_and_reason(need_reason := true) -> bool:
	if _cid().is_empty():
		_status.text = "Select or enter a target character_id first (Players tab)."
		return false
	if need_reason and _why().is_empty():
		_status.text = "Reason is required for this action."
		return false
	return true


func _confirm_mod(title: String, work: Callable) -> void:
	if not _require_target_and_reason(true):
		return
	_confirm(title, "%s\nTarget: %s (%s)\nReason: %s" % [title, _selected_name if not _selected_name.is_empty() else "?", _cid(), _why()], func() -> void:
		_run("Working…", work)
	)


func _refresh_target_banner() -> void:
	if _target_banner == null:
		return
	if _cid().is_empty():
		_target_banner.text = "Target: none selected — open Players to search/select before mutations."
	else:
		_target_banner.text = "Target: %s · character=%s · account=%s" % [
			_selected_name if not _selected_name.is_empty() else "(unnamed)",
			_cid(),
			_selected_account_id if not _selected_account_id.is_empty() else "?",
		]


func _sync_target_fields() -> void:
	_refresh_target_banner()
	if _reward_char and not _cid().is_empty():
		_reward_char.text = _cid()
	if _account_id and not _selected_account_id.is_empty():
		_account_id.text = _selected_account_id
	if _role_user_id and not _selected_account_id.is_empty():
		_role_user_id.text = _selected_account_id


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
	col.add_child(ClientUi.make_section_header("PLAYERS", "Search · Moderate · Economy", "Lookup accepts name, character id, account id, email, or Nakama user id."))

	var find_row := HBoxContainer.new()
	find_row.add_theme_constant_override("separation", 8)
	col.add_child(find_row)
	_search = ClientUi.make_field("Search name / character id / account id / email / nakama id")
	_search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	find_row.add_child(_search)
	var find_btn := _btn("Search", true)
	find_btn.pressed.connect(_on_search_players)
	find_row.add_child(find_btn)
	var clear_btn := _btn("Clear Target")
	clear_btn.pressed.connect(func() -> void:
		_char_id.text = ""
		_selected_name = ""
		_selected_account_id = ""
		_detail.text = ""
		_sync_target_fields()
		_status.text = "Target cleared."
	)
	find_row.add_child(clear_btn)

	_player_list = VBoxContainer.new()
	_player_list.add_theme_constant_override("separation", 4)
	col.add_child(_player_list)
	_account_hits = VBoxContainer.new()
	_account_hits.add_theme_constant_override("separation", 4)
	col.add_child(_account_hits)

	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.scroll_active = false
	_detail.custom_minimum_size = Vector2(0, 80)
	_detail.add_theme_color_override("default_color", ClientUi.MUTED)
	col.add_child(_detail)

	_char_id = ClientUi.make_field("Target character_id")
	_char_id.text_changed.connect(func(_t: String) -> void: _refresh_target_banner())
	col.add_child(_char_id)
	_reason = ClientUi.make_field("Reason (required for mutations)")
	col.add_child(_reason)

	var inspect_row := HBoxContainer.new()
	inspect_row.add_theme_constant_override("separation", 8)
	col.add_child(inspect_row)
	var inspect_btn := _btn("Inspect Character", true)
	inspect_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inspect_btn.pressed.connect(func() -> void:
		if _cid().is_empty():
			_status.text = "character_id required."
			return
		_run("Inspecting…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.inspect_character(_cid())
			if res.ok and typeof(res.data) == TYPE_DICTIONARY:
				var ch: Variant = res.data.get("character", {})
				if typeof(ch) == TYPE_DICTIONARY:
					_selected_name = str(ch.get("name", _selected_name))
					_selected_account_id = str(ch.get("created_by_id", _selected_account_id))
					_sync_target_fields()
				var inv: Variant = res.data.get("inventory", {})
				var inv_count := 0
				if typeof(inv) == TYPE_DICTIONARY:
					inv_count = int(inv.get("count", 0))
				_detail.text = "[b]Inspect[/b] ok · inventory=%s\n%s" % [inv_count, JSON.stringify(res.data).substr(0, 1200)]
			return res
		)
	)
	inspect_row.add_child(inspect_btn)

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
		if not _require_target_and_reason(true):
			return
		_confirm("RESET PLAYER?", "Deletes items and resets progression for %s (%s). Irreversible.\nReason: %s" % [_selected_name, _cid(), _why()], func() -> void:
			_run("Resetting…", func() -> Dictionary: return await AdminManager.reset_player(_cid(), _why()))
		)
	)
	col.add_child(reset)

	var rename_row := HBoxContainer.new()
	rename_row.add_theme_constant_override("separation", 8)
	col.add_child(rename_row)
	_rename_field = ClientUi.make_field("New character name")
	_rename_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rename_row.add_child(_rename_field)
	var rename_btn := _btn("Rename")
	rename_btn.pressed.connect(func() -> void:
		if _cid().is_empty() or _rename_field.text.strip_edges().is_empty():
			_status.text = "character_id and new name are required."
			return
		var new_name := _rename_field.text.strip_edges()
		if new_name.find(" ") >= 0 or new_name.find("\t") >= 0:
			_status.text = "Names cannot contain spaces"
			return
		_confirm("Rename character?", "%s → %s" % [_cid(), new_name], func() -> void:
			_run("Renaming…", func() -> Dictionary:
				return await AdminManager.rename_character(_cid(), new_name)
			)
		)
	)
	rename_row.add_child(rename_btn)

	var role_row := HBoxContainer.new()
	role_row.add_theme_constant_override("separation", 8)
	col.add_child(role_row)
	_role_user_id = ClientUi.make_field("Account user_id for role change")
	_role_user_id.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	role_row.add_child(_role_user_id)
	var promote := _btn("Promote Admin", false, true)
	promote.pressed.connect(func() -> void:
		if _role_user_id.text.strip_edges().is_empty() or _why().is_empty():
			_status.text = "account user_id and reason are required."
			return
		_confirm("Promote to admin?", "Grant admin role to %s\nReason: %s" % [_role_user_id.text.strip_edges(), _why()], func() -> void:
			_run("Promoting…", func() -> Dictionary:
				return await AdminManager.set_role(_role_user_id.text.strip_edges(), "admin", _why())
			)
		)
	)
	role_row.add_child(promote)
	var demote := _btn("Demote User")
	demote.pressed.connect(func() -> void:
		if _role_user_id.text.strip_edges().is_empty() or _why().is_empty():
			_status.text = "account user_id and reason are required."
			return
		_confirm("Demote to user?", "Remove admin from %s\nReason: %s" % [_role_user_id.text.strip_edges(), _why()], func() -> void:
			_run("Demoting…", func() -> Dictionary:
				return await AdminManager.set_role(_role_user_id.text.strip_edges(), "user", _why())
			)
		)
	)
	role_row.add_child(demote)

	col.add_child(ClientUi.make_section_header("", "Currency deltas", "Positive adds, negative removes. Node ledger is authoritative."))
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
		for c in _account_hits.get_children():
			c.queue_free()
		if not res.ok:
			return res
		var rows: Array = res.data.get("players", []) if typeof(res.data) == TYPE_DICTIONARY else []
		var accounts: Array = res.data.get("accounts", []) if typeof(res.data) == TYPE_DICTIONARY else []
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
		for acc in accounts:
			if typeof(acc) != TYPE_DICTIONARY:
				continue
			var ab := _btn("Account · %s · role=%s · %s" % [
				str(acc.get("email", "?")),
				str(acc.get("role", "user")),
				str(acc.get("id", "")).substr(0, 8),
			])
			ab.alignment = HORIZONTAL_ALIGNMENT_LEFT
			var asnap: Dictionary = acc
			ab.pressed.connect(func() -> void:
				_selected_account_id = str(asnap.get("id", ""))
				if _role_user_id:
					_role_user_id.text = _selected_account_id
				if _account_id:
					_account_id.text = _selected_account_id
				_sync_target_fields()
				_status.text = "Account selected: %s" % _selected_account_id
			)
			_account_hits.add_child(ab)
		res["message"] = "Found %s character(s), %s account(s)." % [rows.size(), accounts.size()]
		return res
	)


func _select_player(row: Dictionary) -> void:
	_char_id.text = str(row.get("id", ""))
	_selected_name = str(row.get("name", ""))
	_selected_account_id = str(row.get("owner_id", row.get("created_by_id", row.get("created_by", ""))))
	_sync_target_fields()
	_detail.text = "[b]%s[/b]  Lv %s · %s · %s\nid=%s\nowner=%s\nSD %s · Nova %s · Fuel %s/%s" % [
		str(row.get("name", "?")),
		str(row.get("level", 1)),
		str(row.get("race", "?")),
		str(row.get("class", "?")),
		str(row.get("id", "")),
		_selected_account_id if not _selected_account_id.is_empty() else "?",
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
	col.add_child(ClientUi.make_section_header("GUILDS", "List · Members · Transfer", "Select a guild, load members, then transfer."))
	var load_g := _btn("Load Guilds", true)
	load_g.pressed.connect(_on_load_guilds)
	col.add_child(load_g)
	_guild_list = VBoxContainer.new()
	_guild_list.add_theme_constant_override("separation", 4)
	col.add_child(_guild_list)
	_guild_id = ClientUi.make_field("guild_id")
	col.add_child(_guild_id)
	var load_m := _btn("Load Guild Members")
	load_m.pressed.connect(func() -> void:
		if _guild_id.text.strip_edges().is_empty():
			_status.text = "guild_id required."
			return
		_run("Loading members…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.list_guild_members(_guild_id.text.strip_edges())
			for c in _guild_members.get_children():
				c.queue_free()
			if not res.ok:
				return res
			var rows: Array = res.raw if typeof(res.raw) == TYPE_ARRAY else []
			if typeof(res.data) == TYPE_DICTIONARY and typeof(res.data.get("members", null)) == TYPE_ARRAY:
				rows = res.data["members"]
			for row in rows:
				if typeof(row) != TYPE_DICTIONARY:
					continue
				var mid := str(row.get("character_id", row.get("id", "")))
				var b := _btn("%s · %s" % [str(row.get("name", row.get("character_name", "?"))), mid.substr(0, 8)])
				b.alignment = HORIZONTAL_ALIGNMENT_LEFT
				b.pressed.connect(func() -> void:
					_new_leader_id.text = mid
					_status.text = "Leader candidate set: %s" % mid
				)
				_guild_members.add_child(b)
			res["message"] = "Loaded %s member(s)." % rows.size()
			return res
		)
	)
	col.add_child(load_m)
	_guild_members = VBoxContainer.new()
	col.add_child(_guild_members)
	_new_leader_id = ClientUi.make_field("new_leader character_id")
	col.add_child(_new_leader_id)
	var xfer := _btn("Transfer Leadership", false, true)
	xfer.pressed.connect(func() -> void:
		if _guild_id.text.strip_edges().is_empty() or _new_leader_id.text.strip_edges().is_empty():
			_status.text = "guild_id and new_leader character_id required."
			return
		if _why().is_empty():
			_reason.text = "admin guild transfer"
		_confirm("Transfer guild leadership?", "Guild %s → %s\nReason: %s" % [_guild_id.text, _new_leader_id.text, _why()], func() -> void:
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
	_add_tab("guild", col, true)


func _on_load_guilds() -> void:
	await _run("Loading guilds…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.list_guilds()
		for c in _guild_list.get_children():
			c.queue_free()
		if not res.ok:
			return res
		var rows: Array = res.raw if typeof(res.raw) == TYPE_ARRAY else []
		if typeof(res.data) == TYPE_DICTIONARY and typeof(res.data.get("data", null)) == TYPE_ARRAY:
			rows = res.data["data"]
		for g in rows:
			if typeof(g) != TYPE_DICTIONARY:
				continue
			var gid := str(g.get("id", ""))
			var b := _btn("%s · leader=%s · %s" % [
				str(g.get("name", "?")),
				str(g.get("leader_id", "")).substr(0, 8),
				gid.substr(0, 8),
			])
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			b.pressed.connect(func() -> void:
				_guild_id.text = gid
				_status.text = "Guild selected: %s" % gid
			)
			_guild_list.add_child(b)
		res["message"] = "Loaded %s guild(s)." % rows.size()
		return res
	)


# ─── Promo ─────────────────────────────────────────────────

func _build_promo() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("PROMO CODES", "Create · Toggle · Delete", "Configure rewards below before create."))
	_promo_code = ClientUi.make_field("CODE")
	col.add_child(_promo_code)
	_promo_label = ClientUi.make_field("Label")
	col.add_child(_promo_label)
	var prow := HBoxContainer.new()
	prow.add_theme_constant_override("separation", 8)
	col.add_child(prow)
	_promo_sd = _spin("SD ", 0, 1000000, 100)
	_promo_nova = _spin("Nova ", 0, 100000, 0)
	_promo_max = _spin("Max uses ", 1, 100000, 100)
	prow.add_child(_promo_sd)
	prow.add_child(_promo_nova)
	prow.add_child(_promo_max)
	var create := _btn("Create Promo Code", true)
	create.pressed.connect(func() -> void:
		if _promo_code.text.strip_edges().is_empty():
			_status.text = "Promo code required."
			return
		var rewards := {}
		if int(_promo_sd.value) > 0:
			rewards["stardust"] = int(_promo_sd.value)
		if int(_promo_nova.value) > 0:
			rewards["nova_crystals"] = int(_promo_nova.value)
		_confirm("Create promo?", "%s · rewards=%s · max=%s" % [_promo_code.text, str(rewards), int(_promo_max.value)], func() -> void:
			_run("Creating promo…", func() -> Dictionary:
				return await AdminManager.create_promo_code(
					_promo_code.text.strip_edges(),
					_promo_label.text.strip_edges(),
					rewards,
					int(_promo_max.value)
				)
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
	col.add_child(ClientUi.make_section_header("GRANT ITEM", "Node generates gear via shared generator", "Uses Players target character + reason."))
	var tip0 := Label.new()
	tip0.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tip0.text = "Current target: shown in banner above. Godot never invents item stats."
	tip0.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(tip0)
	_item_type = _option(["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"], 0)
	col.add_child(_item_type)
	_item_rarity = _option(["common", "uncommon", "rare", "epic", "legendary"], 2)
	col.add_child(_item_rarity)
	_item_level = _spin("Item level ", 1, 100, 1)
	col.add_child(_item_level)
	var give := _btn("Give Generated Gear", true)
	give.pressed.connect(func() -> void:
		_confirm_mod("Grant generated gear?", func() -> Dictionary:
			return await AdminManager.grant_item(_cid(), {
				"type": _item_type.get_item_text(_item_type.selected),
				"rarity": _item_rarity.get_item_text(_item_rarity.selected),
				"level": int(_item_level.value),
			}, _why())
		)
	)
	col.add_child(give)
	_add_tab("grant", col)


# ─── Rewards ───────────────────────────────────────────────

func _build_rewards() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("REWARDS", "Compensation · Retry · Audit", "Uses Node /api/rewards admin routes."))
	_reward_char = ClientUi.make_field("characterId for compensation")
	if not _cid().is_empty():
		_reward_char.text = _cid()
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
			_status.text = "Reason required (Players tab)."
			return
		var cid := _reward_char.text.strip_edges()
		if cid.is_empty():
			cid = _cid()
		if cid.is_empty():
			_status.text = "characterId required."
			return
		_confirm("Grant compensation?", "Char %s · SD %s · Nova %s\nReason: %s" % [cid, int(_reward_sd.value), int(_reward_nova.value), _why()], func() -> void:
			_run("Granting reward…", func() -> Dictionary:
				return await AdminManager.rewards_grant({
					"characterId": cid,
					"reason": _why(),
					"stardust": int(_reward_sd.value),
					"nova_crystals": int(_reward_nova.value),
					"compensation": true,
				})
			)
		)
	)
	col.add_child(grant)
	_reward_claim_id = ClientUi.make_field("claim id for detail / retry")
	col.add_child(_reward_claim_id)
	var rrow2 := HBoxContainer.new()
	rrow2.add_theme_constant_override("separation", 8)
	col.add_child(rrow2)
	var get_claim := _btn("Get Claim")
	get_claim.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	get_claim.pressed.connect(func() -> void:
		if _reward_claim_id.text.strip_edges().is_empty():
			_status.text = "claim id required."
			return
		_run("Loading claim…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.rewards_get(_reward_claim_id.text.strip_edges())
			_fill_kv_list(_reward_list, res)
			return res
		)
	)
	rrow2.add_child(get_claim)
	var retry := _btn("Retry Delivery")
	retry.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	retry.pressed.connect(func() -> void:
		if _reward_claim_id.text.strip_edges().is_empty() or _why().is_empty():
			_status.text = "claim id and reason required."
			return
		_confirm("Retry reward delivery?", _reward_claim_id.text, func() -> void:
			_run("Retrying delivery…", func() -> Dictionary:
				return await AdminManager.rewards_retry(_reward_claim_id.text.strip_edges(), {"reason": _why()})
			)
		)
	)
	rrow2.add_child(retry)
	var search := _btn("Search Recent Claims")
	search.pressed.connect(func() -> void:
		_run("Searching rewards…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.rewards_search({"limit": "50"})
			_fill_kv_list(_reward_list, res)
			return res
		)
	)
	col.add_child(search)
	var audit_r := _btn("Recent Reward Audit")
	audit_r.pressed.connect(func() -> void:
		_run("Loading reward audit…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.rewards_audit({"limit": "50"})
			_fill_kv_list(_reward_list, res)
			return res
		)
	)
	col.add_child(audit_r)
	_reward_list = VBoxContainer.new()
	col.add_child(_reward_list)
	_add_tab("rewards", col)


# ─── Audit ─────────────────────────────────────────────────

func _build_audit() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("AUDIT LOGS", "Search · Detail · Timeline · Annotate", "Read-only search; annotate appends a note."))
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
	var timeline := _btn("Account Timeline (selected account)")
	timeline.pressed.connect(func() -> void:
		var aid := _selected_account_id if not _selected_account_id.is_empty() else (_account_id.text.strip_edges() if _account_id else "")
		if aid.is_empty():
			_status.text = "Select an account (Players search) first."
			return
		_run("Loading timeline…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.audit_timeline(aid, {"limit": "50"})
			_fill_kv_list(_audit_list, res)
			return res
		)
	)
	col.add_child(timeline)
	_audit_entry_id = ClientUi.make_field("audit entry id")
	col.add_child(_audit_entry_id)
	var get_e := _btn("Get Entry + Integrity")
	get_e.pressed.connect(func() -> void:
		if _audit_entry_id.text.strip_edges().is_empty():
			_status.text = "audit entry id required."
			return
		_run("Loading audit entry…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.audit_get(_audit_entry_id.text.strip_edges())
			var integ: Dictionary = await AdminManager.audit_integrity(_audit_entry_id.text.strip_edges())
			_fill_kv_list(_audit_list, res)
			if integ.ok:
				res["message"] = "%s · integrity checked" % str(res.get("message", "OK"))
			return res
		)
	)
	col.add_child(get_e)
	_audit_note = ClientUi.make_field("Annotation note")
	col.add_child(_audit_note)
	var ann := _btn("Annotate Entry")
	ann.pressed.connect(func() -> void:
		if _audit_entry_id.text.strip_edges().is_empty() or _audit_note.text.strip_edges().is_empty():
			_status.text = "entry id and note required."
			return
		_confirm("Annotate audit entry?", _audit_note.text, func() -> void:
			_run("Annotating…", func() -> Dictionary:
				return await AdminManager.audit_annotate(_audit_entry_id.text.strip_edges(), _audit_note.text.strip_edges())
			)
		)
	)
	col.add_child(ann)
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
	col.add_child(ClientUi.make_section_header("SYSTEM MAIL", "Broadcast or targeted", "Uses Players target unless Send to ALL is checked."))
	_mail_subject = ClientUi.make_field("Subject")
	col.add_child(_mail_subject)
	_mail_body = TextEdit.new()
	_mail_body.custom_minimum_size = Vector2(0, 100)
	_mail_body.placeholder_text = "Body"
	col.add_child(_mail_body)
	var mrow := HBoxContainer.new()
	mrow.add_theme_constant_override("separation", 8)
	col.add_child(mrow)
	_mail_sd = _spin("Reward SD ", 0, 1000000, 0)
	_mail_nova = _spin("Reward Nova ", 0, 100000, 0)
	_mail_expires = _spin("Expires days ", 1, 365, 14)
	mrow.add_child(_mail_sd)
	mrow.add_child(_mail_nova)
	mrow.add_child(_mail_expires)
	_mail_all = CheckBox.new()
	_mail_all.text = "Send to ALL players (high risk)"
	col.add_child(_mail_all)
	var send := _btn("Send System Mail", true)
	send.pressed.connect(func() -> void:
		if _why().is_empty():
			_status.text = "Reason required (Players tab)."
			return
		if _mail_subject.text.strip_edges().is_empty():
			_status.text = "Subject required."
			return
		if not _mail_all.button_pressed and _cid().is_empty():
			_status.text = "Select a target character or check Send to ALL."
			return
		var recipients: Variant = "all" if _mail_all.button_pressed else [_cid()]
		var rewards := {}
		if int(_mail_sd.value) > 0:
			rewards["stardust"] = int(_mail_sd.value)
		if int(_mail_nova.value) > 0:
			rewards["nova_crystals"] = int(_mail_nova.value)
		_confirm("Send system mail?", "To: %s\nRewards: %s\nReason: %s" % [str(recipients), str(rewards), _why()], func() -> void:
			_run("Sending mail…", func() -> Dictionary:
				return await AdminManager.send_system_mail(
					_mail_subject.text.strip_edges(),
					_mail_body.text,
					recipients,
					_why(),
					rewards,
					int(_mail_expires.value)
				)
			)
		)
	)
	col.add_child(send)
	_add_tab("mail", col, true)


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
	col.add_child(ClientUi.make_section_header("SCHEDULES", "List · Pause · Tick · Audit", "Create remains available via AdminManager for advanced payloads; use Pause/Resume here."))
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
	var audit_s := _btn("Load Schedule Audit")
	audit_s.pressed.connect(func() -> void:
		_run("Loading schedule audit…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.schedules_audit(50)
			_fill_kv_list(_sched_audit_list, res)
			return res
		)
	)
	col.add_child(audit_s)
	_sched_list = VBoxContainer.new()
	col.add_child(_sched_list)
	_sched_audit_list = VBoxContainer.new()
	col.add_child(_sched_audit_list)
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
	col.add_child(ClientUi.make_section_header("ENTITLEMENTS", "Grant · Revoke · Restore · Products", "High-value keys require confirm:true (already sent)."))
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
		_confirm("Grant entitlement?", "%s × %s to %s" % [_ent_key.text, int(_ent_qty.value), _account_id.text], func() -> void:
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
	var products := _btn("List Product Mappings")
	products.pressed.connect(func() -> void:
		_run("Loading products…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.entitlements_products()
			_fill_kv_list(_ent_products, res)
			return res
		)
	)
	col.add_child(products)
	var eaudit := _btn("Entitlement Audit")
	eaudit.pressed.connect(func() -> void:
		_run("Loading entitlement audit…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.entitlements_audit({
				"accountId": _account_id.text.strip_edges(),
				"limit": "50",
			})
			_fill_kv_list(_ent_list, res)
			return res
		)
	)
	col.add_child(eaudit)
	_ent_list = VBoxContainer.new()
	col.add_child(_ent_list)
	_ent_products = VBoxContainer.new()
	col.add_child(_ent_products)
	_add_tab("entitlements", col)


# ─── Server (unavailable wipe) ─────────────────────────────

func _build_server() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("SERVER / SESSION", "Read-only session · wipe unavailable", ""))
	_session_lab = RichTextLabel.new()
	_session_lab.bbcode_enabled = true
	_session_lab.fit_content = true
	_session_lab.text = "Loading session…"
	col.add_child(_session_lab)
	var refresh := _btn("Refresh Session Info", true)
	refresh.pressed.connect(func() -> void:
		_session_lab.text = "[b]Environment[/b] %s\n[b]Role[/b] %s\n[b]Account[/b] %s\n[b]Email[/b] %s\n[b]Node[/b] %s\n[b]Permissions[/b] binary admin role (Node re-validates every request)\n[b]Target[/b] %s / %s" % [
			BackendEnvironment.get_environment_id() if BackendEnvironment else "?",
			str(AuthManager.user.get("role", "user")),
			str(AuthManager.user.get("id", "")),
			str(AuthManager.user.get("email", "")),
			str(GameApiClient.base_url) if GameApiClient else "?",
			_selected_name if not _selected_name.is_empty() else "(none)",
			_cid() if not _cid().is_empty() else "(none)",
		]
		_status.text = "Session info refreshed."
	)
	col.add_child(refresh)
	var lab := Label.new()
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.text = "Server Refresh wipe is intentionally not exposed. Unconstrained wipe is rejected by the API. Use Ops repairs/migrations for approved recovery."
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
	col.add_child(ClientUi.make_section_header("OPS", "Live operations", "Maintenance, flags, integrity, repairs, migrations, arena — Node enforces."))
	_ops_out = RichTextLabel.new()
	_ops_out.bbcode_enabled = true
	_ops_out.fit_content = true
	_ops_out.text = "Load dashboard for live snapshot."
	col.add_child(_ops_out)
	var load_d := _btn("Refresh Ops Dashboard", true)
	load_d.pressed.connect(func() -> void:
		_run("Loading ops…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.get_ops_dashboard()
			if res.ok and typeof(res.data) == TYPE_DICTIONARY:
				var d: Dictionary = res.data.get("dashboard", res.data)
				if typeof(d) != TYPE_DICTIONARY:
					d = res.data
				var maint: Dictionary = d.get("maintenance", {}) if typeof(d.get("maintenance", null)) == TYPE_DICTIONARY else {}
				_ops_out.text = "[b]Accounts[/b] %s · [b]Characters[/b] %s · [b]Presence[/b] %s\n[b]Open reports[/b] %s · [b]Quarantine[/b] %s\n[b]Maintenance[/b] %s — %s" % [
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

	var cfg_btn := _btn("Load Runtime Config")
	cfg_btn.pressed.connect(func() -> void:
		_run("Loading runtime config…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.get_runtime_config()
			if res.ok:
				_ops_out.text = "[b]Runtime config[/b]\n%s" % JSON.stringify(res.data).substr(0, 1500)
			return res
		)
	)
	col.add_child(cfg_btn)

	var maint_on := _btn("Enable Maintenance", false, true)
	maint_on.pressed.connect(func() -> void:
		if _why().is_empty():
			_status.text = "Reason required."
			return
		_confirm("Enable maintenance mode?", "Players blocked from writes.\nReason: %s" % _why(), func() -> void:
			_run("Enabling maintenance…", func() -> Dictionary:
				return await AdminManager.set_maintenance_mode(true, "Temporary maintenance", _why())
			)
		)
	)
	col.add_child(maint_on)
	var maint_off := _btn("Disable Maintenance")
	maint_off.pressed.connect(func() -> void:
		if _why().is_empty():
			_status.text = "Reason required."
			return
		_confirm("Disable maintenance mode?", "Reason: %s" % _why(), func() -> void:
			_run("Disabling maintenance…", func() -> Dictionary:
				return await AdminManager.set_maintenance_mode(false, "", _why())
			)
		)
	)
	col.add_child(maint_off)

	var flag_row := HBoxContainer.new()
	flag_row.add_theme_constant_override("separation", 6)
	col.add_child(flag_row)
	_flag_name = LineEdit.new()
	_flag_name.placeholder_text = "feature_flag (e.g. casino_enabled)"
	_flag_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	flag_row.add_child(_flag_name)
	var flag_on := _btn("Flag ON")
	flag_on.pressed.connect(func() -> void:
		if _flag_name.text.strip_edges().is_empty() or _why().is_empty():
			_status.text = "flag name and reason required."
			return
		_confirm("Enable feature flag?", "%s\nReason: %s" % [_flag_name.text, _why()], func() -> void:
			_run("Setting flag…", func() -> Dictionary:
				return await AdminManager.set_feature_flag(_flag_name.text.strip_edges(), true, _why())
			)
		)
	)
	flag_row.add_child(flag_on)
	var flag_off := _btn("Flag OFF")
	flag_off.pressed.connect(func() -> void:
		if _flag_name.text.strip_edges().is_empty() or _why().is_empty():
			_status.text = "flag name and reason required."
			return
		_confirm("Disable feature flag?", "%s\nReason: %s" % [_flag_name.text, _why()], func() -> void:
			_run("Clearing flag…", func() -> Dictionary:
				return await AdminManager.set_feature_flag(_flag_name.text.strip_edges(), false, _why())
			)
		)
	)
	flag_row.add_child(flag_off)

	var audit_btn := _btn("Integrity Audit (selected character)")
	audit_btn.pressed.connect(func() -> void:
		if _cid().is_empty():
			_status.text = "character_id required."
			return
		_run("Running integrity audit…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.run_integrity_audit(_cid(), "", false)
			if res.ok:
				_ops_out.text = "[b]Integrity audit[/b]\n%s" % JSON.stringify(res.data).substr(0, 1500)
			return res
		)
	)
	col.add_child(audit_btn)

	col.add_child(ClientUi.make_section_header("", "Data repair", "Dry-run first. Supported: clear_expired_stim_buffs, clear_invalid_equip_refs."))
	_repair_type = _option(["clear_expired_stim_buffs", "clear_invalid_equip_refs"], 0)
	col.add_child(_repair_type)
	var dry := _btn("Dry-Run Repair")
	dry.pressed.connect(func() -> void:
		if _cid().is_empty():
			_status.text = "character_id required."
			return
		_run("Dry-run repair…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.apply_data_repair(
				_repair_type.get_item_text(_repair_type.selected), _cid(), false
			)
			if res.ok:
				_ops_out.text = "[b]Repair dry-run[/b]\n%s" % JSON.stringify(res.data).substr(0, 1500)
			return res
		)
	)
	col.add_child(dry)
	var apply_r := _btn("Apply Repair", false, true)
	apply_r.pressed.connect(func() -> void:
		if not _require_target_and_reason(true):
			return
		_confirm("APPLY repair?", "%s on %s\nReason: %s" % [_repair_type.get_item_text(_repair_type.selected), _cid(), _why()], func() -> void:
			_run("Applying repair…", func() -> Dictionary:
				var res: Dictionary = await AdminManager.apply_data_repair(
					_repair_type.get_item_text(_repair_type.selected), _cid(), true
				)
				if res.ok:
					_ops_out.text = "[b]Repair applied[/b]\n%s" % JSON.stringify(res.data).substr(0, 1500)
				return res
			)
		)
	)
	col.add_child(apply_r)

	col.add_child(ClientUi.make_section_header("", "Migration", "Dry-run default. Apply is critical — staging/prod gates on Node."))
	_migration_id = ClientUi.make_field("migration_id (e.g. integrity_framework_v1)")
	col.add_child(_migration_id)
	var mig_dry := _btn("Dry-Run Migration")
	mig_dry.pressed.connect(func() -> void:
		if _migration_id.text.strip_edges().is_empty():
			_status.text = "migration_id required."
			return
		_run("Dry-run migration…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.run_migration(_migration_id.text.strip_edges(), false)
			if res.ok:
				_ops_out.text = "[b]Migration dry-run[/b]\n%s" % JSON.stringify(res.data).substr(0, 1500)
			return res
		)
	)
	col.add_child(mig_dry)
	var mig_apply := _btn("Apply Migration", false, true)
	mig_apply.pressed.connect(func() -> void:
		if _migration_id.text.strip_edges().is_empty() or _why().is_empty():
			_status.text = "migration_id and reason required."
			return
		_confirm("APPLY MIGRATION?", "%s\nEnv: %s\nReason: %s\nIrreversible without restore." % [
			_migration_id.text,
			BackendEnvironment.get_environment_id() if BackendEnvironment else "?",
			_why(),
		], func() -> void:
			_run("Applying migration…", func() -> Dictionary:
				var res: Dictionary = await AdminManager.run_migration(_migration_id.text.strip_edges(), true)
				if res.ok:
					_ops_out.text = "[b]Migration applied[/b]\n%s" % JSON.stringify(res.data).substr(0, 1500)
				return res
			)
		)
	)
	col.add_child(mig_apply)

	col.add_child(ClientUi.make_section_header("", "Arena moderation", "Uses Players target + reason."))
	_arena_hours = _spin("Suspend hours ", 1, 720, 24)
	col.add_child(_arena_hours)
	var arena_row := HBoxContainer.new()
	arena_row.add_theme_constant_override("separation", 6)
	col.add_child(arena_row)
	var arena_s := _btn("Arena Suspend")
	arena_s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	arena_s.pressed.connect(func() -> void:
		_confirm_mod("Arena suspend?", func() -> Dictionary:
			return await AdminManager.arena_suspend(_cid(), int(_arena_hours.value), _why())
		)
	)
	arena_row.add_child(arena_s)
	var arena_b := _btn("Arena Ban", false, true)
	arena_b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	arena_b.pressed.connect(func() -> void:
		_confirm_mod("Arena ban?", func() -> Dictionary:
			return await AdminManager.arena_ban(_cid(), _why())
		)
	)
	arena_row.add_child(arena_b)
	var arena_u := _btn("Arena Unban")
	arena_u.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	arena_u.pressed.connect(func() -> void:
		_confirm_mod("Arena unban?", func() -> Dictionary:
			return await AdminManager.arena_unban(_cid(), _why())
		)
	)
	arena_row.add_child(arena_u)

	_add_tab("ops", col, true)


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
