extends Control
## Godot admin console — server-authoritative. UI organizes AdminManager calls only.

const TAB_DEFS: Array = [
	{"id": "overview", "label": "Overview"},
	{"id": "players", "label": "Players"},
	{"id": "simulate", "label": "Simulate"},
	{"id": "grants", "label": "Grants"},
	{"id": "community", "label": "Community"},
	{"id": "logs", "label": "Logs"},
	{"id": "system", "label": "System"},
]

const REFERENCE_PREVIEW_LENGTH := 12
const ID_PREVIEW_LENGTH := 8
const AUDIT_ID_PREVIEW_LENGTH := 10
const OPS_JSON_PREVIEW_LENGTH := 1_500
const INSPECT_NEST_DEPTH_MAX := 3
const INSPECT_OTHER_LIST_CAP := 40
const MILLISECONDS_PER_MINUTE := 60_000
const MILLISECONDS_PER_HOUR := 3_600_000
const KV_LIST_ROW_CAP := 40
const NARROW_LAYOUT_WIDTH_PX := 960
const PAGE_MARGIN_PX := 14
const PAGE_MARGIN_VERTICAL_PX := 10
const CHROME_SEPARATION_PX := 8
const TAB_SEPARATION_PX := 4
const SECTION_SEPARATION_PX := 8
const ROW_SEPARATION_PX := 6
const TARGET_CARD_MIN_HEIGHT_PX := 56
const FILTER_EDITOR_MIN_HEIGHT_PX := 96
const MAIL_BODY_MIN_HEIGHT_PX := 72
const PANEL_CORNER_RADIUS_PX := 12
const PANEL_BORDER_WIDTH_PX := 2

const GRANT_TYPE_FUEL := "fuel"
const GRANT_TYPE_STARDUST := "stardust"
const GRANT_TYPE_NOVA := "nova"
const GRANT_TYPE_XP := "xp"
const GRANT_TYPE_GEAR := "gear"
const GRANT_TYPE_COMPENSATION := "compensation"
const GRANT_TYPE_ENTITLEMENT := "entitlement"

const GRANT_PRESETS_FUEL: Array[int] = [1, 5, 10, 20, 50]
const GRANT_PRESETS_STANDARD: Array[int] = [10, 50, 100, 500, 1000]
const GRANT_PRESETS_XP: Array[int] = [100, 500, 1000, 5000, 10000]
const GRANT_FUEL_DEFAULT := 10
const GRANT_STARDUST_DEFAULT := 100
const GRANT_NOVA_DEFAULT := 10
const GRANT_XP_DEFAULT := 1000
const GRANT_FUEL_DELTA_MIN := -1000
const GRANT_FUEL_DELTA_MAX := 1000
const GRANT_SD_DELTA_MIN := -1_000_000
const GRANT_SD_DELTA_MAX := 1_000_000
const GRANT_NOVA_DELTA_MIN := -100_000
const GRANT_NOVA_DELTA_MAX := 100_000
const GRANT_XP_DELTA_MIN := -10_000_000
const GRANT_XP_DELTA_MAX := 10_000_000
const GRANT_GEAR_LEVEL_MIN := 1
## Gear formulas have no item-level cap. SpinBox requires a finite max; this is a
## widget bound (signed 32-bit), not a gameplay rule.
const GRANT_GEAR_LEVEL_WIDGET_CEILING := 0x7FFF_FFFF
const GRANT_GEAR_LEVEL_DEFAULT := 1
const SIMULATE_LEVEL_MIN := 1
const SIMULATE_LEVEL_DEFAULT := 1
const SIMULATE_PURCHASE_EPA_SHARE_PERCENT := 38
const SIMULATE_PURCHASE_RAMP_COMPLETE_LEVEL := 25
const SIMULATE_STARDUST_DAY_COUNT := 10
const SIMULATE_NOVA_GRANT := 100000
const SIMULATE_GEAR_RARITY := "rare"
const SIMULATE_STIM_COUNT := 3
const SIMULATE_STIM_UNCOMMON_LEVEL_MAX := 19
const SIMULATE_STIM_RARE_LEVEL_MAX := 49
const GRANT_ENTITLEMENT_QTY_MIN := 1
const GRANT_ENTITLEMENT_QTY_MAX := 99
const GRANT_ENTITLEMENT_QTY_DEFAULT := 1
const DEFAULT_ENTITLEMENT_KEY := "account.rename_token"
const MUTE_MINUTES_MIN := 1
const MUTE_MINUTES_MAX := 1440
const MUTE_MINUTES_DEFAULT := 30
const ARENA_SUSPEND_HOURS_MIN := 1
const ARENA_SUSPEND_HOURS_MAX := 720
const ARENA_SUSPEND_HOURS_DEFAULT := 24
const MAIL_EXPIRES_DAYS_MIN := 1
const MAIL_EXPIRES_DAYS_MAX := 365
const PROMO_SD_MAX := 1_000_000
const PROMO_NOVA_MAX := 100_000
const PROMO_MAX_USES_MIN := 1
const PROMO_MAX_USES_MAX := 100_000
const PROMO_SD_DEFAULT := 100
const PROMO_MAX_USES_DEFAULT := 100
const EMAIL_LOG_LIMIT := 50
const REWARDS_SEARCH_LIMIT := 50
const AUDIT_SEARCH_LIMIT := 50
const SCHEDULE_AUDIT_LIMIT := 50

const GEAR_SLOT_IDS: Array[String] = [
	"weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module",
]
const GEAR_RARITY_IDS: Array[String] = ["common", "uncommon", "rare", "epic", "legendary"]
const GEAR_RARITY_DEFAULT_INDEX := 2
const REPAIR_TYPE_IDS: Array[String] = ["clear_expired_stim_buffs", "clear_invalid_equip_refs"]

var _status: Label
var _tabs: HFlowContainer
var _tab_bodies: Dictionary = {}
var _tab_buttons: Dictionary = {}
var _active_tab := "overview"
var _busy := false
var _root: VBoxContainer
var _env_banner: Label
var _target_banner: Label
var _session_lab: RichTextLabel
var _selected_name := ""
var _selected_account_id := ""
var _grant_type := GRANT_TYPE_FUEL
var _narrow := false

var _char_id: LineEdit
var _reason: LineEdit
var _player_list: VBoxContainer
var _detail: RichTextLabel
var _account_hits: VBoxContainer
var _my_characters_cache: Array = []
var _my_char_hosts: Array = []
var _search_result_hosts: Array = []
var _account_result_hosts: Array = []
var _responsive_grids: Array = []
var _grant_type_buttons: Dictionary = {}

var _grant_amount: SpinBox
var _grant_preset_row: HFlowContainer
var _grant_amount_box: VBoxContainer
var _grant_gear_box: VBoxContainer
var _grant_comp_box: VBoxContainer
var _grant_ent_box: VBoxContainer
var _grant_cta: Button
var _grant_summary: Label
var _item_type: OptionButton
var _item_rarity: OptionButton
var _item_level: SpinBox
var _sim_level: SpinBox
var _sim_cta: Button
var _sim_summary: Label
var _reward_sd: SpinBox
var _reward_nova: SpinBox
var _ent_key: LineEdit
var _ent_qty: SpinBox
var _ent_id: LineEdit
var _ent_list: VBoxContainer
var _ent_products: VBoxContainer
var _mute_minutes: SpinBox
var _arena_hours: SpinBox
var _rename_field: LineEdit
var _role_user_id: LineEdit

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
var _system_out: RichTextLabel
var _flag_name: LineEdit
var _repair_type: OptionButton
var _migration_id: LineEdit


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	clip_contents = true
	_build()
	_refresh_target_banner()
	call_deferred("_apply_narrow_layout")
	if not AdminManager.is_admin():
		_set_feedback(
			"Admin access required (role=%s). Privileged controls disabled." % str(AuthManager.user.get("role", "user")),
			"err"
		)
		_set_tabs_enabled(false)
		if _env_banner:
			_env_banner.text = "ADMIN LOCKED · role=%s · env=%s" % [
				str(AuthManager.user.get("role", "user")),
				BackendEnvironment.get_environment_id() if BackendEnvironment else "?",
			]
	else:
		_set_feedback("Ready. Select a character, then Grant or moderate.", "info")
		_load_my_characters()


func _exit_tree() -> void:
	_busy = false


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		_apply_narrow_layout()


func _apply_narrow_layout() -> void:
	_narrow = size.x > 0.0 and size.x < float(NARROW_LAYOUT_WIDTH_PX)
	for grid in _responsive_grids:
		if grid is GridContainer:
			(grid as GridContainer).columns = 1 if _narrow else 2


func _panel(inner: Control, danger := false) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.96),
		Color(ClientUi.DANGER, 0.4) if danger else Color(ClientUi.CYAN, 0.35),
		PANEL_CORNER_RADIUS_PX,
		PANEL_BORDER_WIDTH_PX
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
	for def in TAB_DEFS:
		var tid := str(def["id"])
		var tb: Button = _tab_buttons.get(tid, null)
		if tb == null:
			continue
		if tid == id:
			ClientUi.apply_primary_button(tb)
		else:
			ClientUi.apply_ghost_button(tb)


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", PAGE_MARGIN_PX)
	margin.add_theme_constant_override("margin_right", PAGE_MARGIN_PX)
	margin.add_theme_constant_override("margin_top", PAGE_MARGIN_VERTICAL_PX)
	margin.add_theme_constant_override("margin_bottom", PAGE_MARGIN_VERTICAL_PX)
	add_child(margin)

	var outer := VBoxContainer.new()
	outer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_theme_constant_override("separation", CHROME_SEPARATION_PX)
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

	_reason = ClientUi.make_field("Reason (optional for grants · required for bans, resets, and role changes)")
	outer.add_child(_reason)

	_tabs = HFlowContainer.new()
	_tabs.add_theme_constant_override("h_separation", TAB_SEPARATION_PX)
	_tabs.add_theme_constant_override("v_separation", TAB_SEPARATION_PX)
	outer.add_child(_tabs)
	for def in TAB_DEFS:
		var tb := Button.new()
		tb.text = str(def["label"])
		ClientUi.apply_ghost_button(tb)
		var tid := str(def["id"])
		tb.pressed.connect(func() -> void: _show_tab(tid))
		_tabs.add_child(tb)
		_tab_buttons[tid] = tb

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	outer.add_child(scroll)
	_root = VBoxContainer.new()
	_root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_root.add_theme_constant_override("separation", SECTION_SEPARATION_PX)
	scroll.add_child(_root)

	_char_id = ClientUi.make_field("Paste character id")
	_char_id.text_changed.connect(func(_t: String) -> void: _refresh_target_banner())
	_account_id = ClientUi.make_field("accountId")
	_account_id.text = str(AuthManager.user.get("id", ""))
	_role_user_id = ClientUi.make_field("Account user_id for role change")

	_build_overview()
	_build_players()
	_build_simulate()
	_build_grants()
	_build_community()
	_build_logs()
	_build_system()

	_status = ClientUi.make_status()
	outer.add_child(_status)
	_show_tab("overview")


func _add_tab(id: String, body: Control, danger := false) -> void:
	var panel := _panel(body, danger)
	panel.visible = false
	_root.add_child(panel)
	_tab_bodies[id] = panel


func _grid() -> GridContainer:
	var g := GridContainer.new()
	g.columns = 2
	g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	g.add_theme_constant_override("h_separation", SECTION_SEPARATION_PX)
	g.add_theme_constant_override("v_separation", SECTION_SEPARATION_PX)
	_responsive_grids.append(g)
	return g


func _col() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", SECTION_SEPARATION_PX)
	return col


func _subhead(text: String, tint: Color = ClientUi.CYAN) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(lab)
	return lab


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


func _accent_btn(text: String, accent: Color, filled := true) -> Button:
	var b := Button.new()
	b.text = text
	if filled:
		ClientUi.apply_tinted_painted_button(b, accent)
	else:
		ClientUi.apply_dark_outline_button(b, accent, 0)
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


func _set_feedback(msg: String, kind: String = "info") -> void:
	if _status == null:
		return
	_status.text = msg
	var tint := ClientUi.MUTED
	match kind:
		"ok":
			tint = ClientUi.SUCCESS
		"err":
			tint = ClientUi.DANGER
		"busy":
			tint = ClientUi.WARNING
		_:
			tint = ClientUi.CYAN_SOFT
	_status.add_theme_color_override("font_color", tint)


func _run(label: String, work: Callable) -> void:
	if _busy:
		_set_feedback("Action already in progress — wait for the current result.", "err")
		return
	if not AdminManager.is_admin():
		_set_feedback("Admin access required.", "err")
		return
	_busy = true
	_set_feedback(label, "busy")
	var res: Dictionary = await work.call()
	_busy = false
	if not is_inside_tree():
		return
	if typeof(res) != TYPE_DICTIONARY:
		_set_feedback("Unexpected response.", "err")
		return
	var msg := str(res.get("message", "Done" if res.get("ok", false) else "Failed"))
	if not bool(res.get("ok", false)) and msg.is_empty():
		msg = "Failed."
	var audit := str(res.get("audit_id", ""))
	var corr := str(res.get("correlation_id", ""))
	if not audit.is_empty() and msg.find("audit=") < 0:
		msg = "%s · audit=%s" % [msg, audit.substr(0, REFERENCE_PREVIEW_LENGTH)]
	elif not corr.is_empty() and msg.find("corr=") < 0:
		msg = "%s · corr=%s" % [msg, corr.substr(0, REFERENCE_PREVIEW_LENGTH)]
	_set_feedback(msg, "ok" if bool(res.get("ok", false)) else "err")


func _cid() -> String:
	return _char_id.text.strip_edges() if _char_id else ""


func _why() -> String:
	return _reason.text.strip_edges() if _reason else ""


func _require_target_and_reason(need_reason := true) -> bool:
	if _cid().is_empty():
		_set_feedback("Select a character first (search or My Characters).", "err")
		return false
	if need_reason and _why().is_empty():
		_set_feedback("Reason is required for this action.", "err")
		return false
	return true


func _confirm_mod(title: String, work: Callable) -> void:
	if not _require_target_and_reason(true):
		return
	_confirm(title, "%s\nTarget: %s (%s)\nReason: %s" % [title, _selected_name if not _selected_name.is_empty() else "?", _cid(), _why()], func() -> void:
		_run("Working…", work)
	)


func _target_label_text() -> String:
	if _cid().is_empty():
		return "No character selected"
	return "%s · character=%s · account=%s" % [
		_selected_name if not _selected_name.is_empty() else "(unnamed)",
		_cid(),
		_selected_account_id if not _selected_account_id.is_empty() else "?",
	]


func _refresh_target_banner() -> void:
	if _target_banner == null:
		return
	if _cid().is_empty():
		_target_banner.text = "Target: none selected — use Search or My Characters on Players / Grants."
		_target_banner.add_theme_color_override("font_color", ClientUi.WARNING)
	else:
		_target_banner.text = "Target: %s" % _target_label_text()
		_target_banner.add_theme_color_override("font_color", ClientUi.CYAN)
	_refresh_target_cards()
	_refresh_grant_cta()


func _sync_target_fields() -> void:
	_refresh_target_banner()
	if _account_id and not _selected_account_id.is_empty():
		_account_id.text = _selected_account_id
	if _role_user_id and not _selected_account_id.is_empty():
		_role_user_id.text = _selected_account_id


func _clear_host(host: Node) -> void:
	if host == null:
		return
	for c in host.get_children():
		c.queue_free()


func _make_target_picker(include_id_field: bool) -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	var find_row := HBoxContainer.new()
	find_row.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	col.add_child(find_row)
	var search := ClientUi.make_field("Search name / character id / account id / email / nakama id")
	search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	find_row.add_child(search)
	var results := VBoxContainer.new()
	results.add_theme_constant_override("separation", 4)
	var accounts := VBoxContainer.new()
	accounts.add_theme_constant_override("separation", 4)
	var find_btn := _btn("Search", true)
	find_btn.pressed.connect(func() -> void: _on_search_players(search.text, results, accounts))
	find_row.add_child(find_btn)
	var clear_btn := _btn("Clear")
	clear_btn.pressed.connect(_clear_target)
	find_row.add_child(clear_btn)
	col.add_child(_subhead("MY CHARACTERS", ClientUi.GOLD))
	var mine := HFlowContainer.new()
	mine.add_theme_constant_override("h_separation", ROW_SEPARATION_PX)
	mine.add_theme_constant_override("v_separation", 4)
	col.add_child(mine)
	_my_char_hosts.append(mine)
	col.add_child(results)
	col.add_child(accounts)
	_search_result_hosts.append(results)
	_account_result_hosts.append(accounts)
	if include_id_field:
		col.add_child(_char_id)
	var card := Label.new()
	card.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	card.custom_minimum_size.y = TARGET_CARD_MIN_HEIGHT_PX
	card.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	card.set_meta("admin_target_card", true)
	card.text = _target_label_text()
	col.add_child(card)
	card.set_meta("follow_target", true)
	return col


func _refresh_target_cards() -> void:
	var text := _target_label_text()
	for host in _my_char_hosts:
		var picker: Node = host.get_parent()
		if picker == null:
			continue
		for child in picker.get_children():
			if child is Label and bool(child.get_meta("follow_target", false)):
				(child as Label).text = "Selected: %s" % text


func _clear_target() -> void:
	_char_id.text = ""
	_selected_name = ""
	_selected_account_id = ""
	if _detail:
		_detail.text = ""
	_sync_target_fields()
	_refresh_target_cards()
	_set_feedback("Target cleared.", "info")


func _load_my_characters() -> void:
	await _run("Loading your characters…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.list_own_characters()
		_my_characters_cache = res.raw if typeof(res.raw) == TYPE_ARRAY else []
		_fill_my_character_hosts()
		if res.ok:
			res["message"] = "My Characters: %s" % _my_characters_cache.size()
		return res
	)


func _fill_my_character_hosts() -> void:
	for host in _my_char_hosts:
		_clear_host(host)
		if _my_characters_cache.is_empty():
			var empty := Label.new()
			empty.text = "No characters on this admin account."
			empty.add_theme_color_override("font_color", ClientUi.MUTED)
			host.add_child(empty)
			continue
		for row in _my_characters_cache:
			if typeof(row) != TYPE_DICTIONARY:
				continue
			var snap: Dictionary = row
			var b := _accent_btn("%s  Lv%s" % [
				str(row.get("name", "?")),
				ClientUi.format_level(row.get("level", 1)),
			], ClientUi.GOLD, false)
			b.pressed.connect(func() -> void: _select_player(snap))
			host.add_child(b)


func _on_search_players(query: String, results: VBoxContainer, accounts: VBoxContainer) -> void:
	await _run("Searching…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.search_players(query)
		_clear_host(results)
		_clear_host(accounts)
		if not res.ok:
			return res
		var rows: Array = res.data.get("players", []) if typeof(res.data) == TYPE_DICTIONARY else []
		var accs: Array = res.data.get("accounts", []) if typeof(res.data) == TYPE_DICTIONARY else []
		if rows.is_empty():
			var empty := Label.new()
			empty.text = "Character not found."
			empty.add_theme_color_override("font_color", ClientUi.WARNING)
			results.add_child(empty)
		for row in rows:
			if typeof(row) != TYPE_DICTIONARY:
				continue
			var b := _btn("%s  ·  Lv%s  ·  %s" % [
				str(row.get("name", "?")),
				ClientUi.format_level(row.get("level", 1)),
				str(row.get("id", "")).substr(0, ID_PREVIEW_LENGTH),
			])
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			var snap: Dictionary = row
			b.pressed.connect(func() -> void: _select_player(snap))
			results.add_child(b)
		for acc in accs:
			if typeof(acc) != TYPE_DICTIONARY:
				continue
			var ab := _btn("Account · %s · role=%s · %s" % [
				str(acc.get("email", "?")),
				str(acc.get("role", "user")),
				str(acc.get("id", "")).substr(0, ID_PREVIEW_LENGTH),
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
				_refresh_target_cards()
				_set_feedback("Account selected: %s" % _selected_account_id, "ok")
			)
			accounts.add_child(ab)
		res["message"] = "Found %s character(s), %s account(s)." % [rows.size(), accs.size()]
		return res
	)


func _select_player(row: Dictionary) -> void:
	_char_id.text = str(row.get("id", ""))
	_selected_name = str(row.get("name", ""))
	_selected_account_id = str(row.get("owner_id", row.get("created_by_id", row.get("created_by", ""))))
	if _selected_account_id.is_empty():
		_selected_account_id = str(AuthManager.user.get("id", "")) if _is_own_character(str(row.get("id", ""))) else ""
	_sync_target_fields()
	_refresh_target_cards()
	if _item_level:
		_item_level.value = maxi(GRANT_GEAR_LEVEL_MIN, int(row.get("level", GRANT_GEAR_LEVEL_DEFAULT)))
	if _sim_level:
		_sim_level.value = maxi(SIMULATE_LEVEL_MIN, int(row.get("level", SIMULATE_LEVEL_DEFAULT)))
		_refresh_simulate_cta()
	if _detail:
		_detail.text = "[b]%s[/b]  Lv %s · %s · %s\nid=%s\nowner=%s\nSD %s · Nova %s · Fuel %s/%s" % [
			str(row.get("name", "?")),
			ClientUi.format_level(row.get("level", 1)),
			str(row.get("race", "?")),
			str(row.get("class", "?")),
			str(row.get("id", "")),
			_selected_account_id if not _selected_account_id.is_empty() else "?",
			str(row.get("stardust", 0)),
			str(row.get("nova_crystals", 0)),
			str(row.get("fuel", 0)),
			str(row.get("max_fuel", ShipRules.FUEL_MAX_BASE)),
		]
	_run("Loading inventory…", func() -> Dictionary:
		var items: Dictionary = await AdminManager.list_character_items(str(row.get("id", "")))
		if items.ok and _detail:
			var arr: Array = items.raw if typeof(items.raw) == TYPE_ARRAY else []
			var names: PackedStringArray = []
			for it in arr:
				if typeof(it) == TYPE_DICTIONARY:
					names.append(str(it.get("name", "?")))
			_detail.text += "\nItems (%s): %s" % [names.size(), ", ".join(names)]
			items["message"] = "Selected %s" % str(row.get("name", ""))
		return items
	)


func _is_own_character(character_id: String) -> bool:
	for row in _my_characters_cache:
		if typeof(row) == TYPE_DICTIONARY and str(row.get("id", "")) == character_id:
			return true
	return false


# ─── Overview ──────────────────────────────────────────────

func _build_overview() -> void:
	var wrap := _col()
	wrap.add_child(ClientUi.make_section_header("OVERVIEW", "Session · Live ops · Economy", "Read-only snapshot. Mutations live on System."))
	var grid := _grid()
	wrap.add_child(grid)

	var left := _col()
	grid.add_child(left)
	_session_lab = RichTextLabel.new()
	_session_lab.bbcode_enabled = true
	_session_lab.fit_content = true
	_session_lab.scroll_active = false
	_session_lab.text = "Loading session…"
	left.add_child(_session_lab)
	var refresh := _btn("Refresh Session Info", true)
	refresh.pressed.connect(_refresh_session_info)
	left.add_child(refresh)
	var wipe := Label.new()
	wipe.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	wipe.text = "Server Refresh wipe is intentionally not exposed. Unconstrained wipe is rejected by the API. Use System repairs/migrations for approved recovery."
	wipe.add_theme_color_override("font_color", ClientUi.WARNING)
	left.add_child(wipe)

	var right := _col()
	grid.add_child(right)
	var load_d := _btn("Refresh Ops Dashboard", true)
	load_d.pressed.connect(_on_load_ops_dashboard)
	right.add_child(load_d)
	var cfg_btn := _btn("Load Runtime Config")
	cfg_btn.pressed.connect(func() -> void:
		_run("Loading runtime config…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.get_runtime_config()
			if res.ok and _ops_out:
				_ops_out.text = "[b]Runtime config[/b]\n%s" % JSON.stringify(res.data).substr(0, OPS_JSON_PREVIEW_LENGTH)
			return res
		)
	)
	right.add_child(cfg_btn)
	var load_e := _btn("Refresh Economy Snapshot")
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
	right.add_child(load_e)
	_ops_out = RichTextLabel.new()
	_ops_out.bbcode_enabled = true
	_ops_out.fit_content = true
	_ops_out.scroll_active = false
	_ops_out.text = "Load dashboard for live snapshot."
	right.add_child(_ops_out)
	_econ_lab = RichTextLabel.new()
	_econ_lab.bbcode_enabled = true
	_econ_lab.fit_content = true
	_econ_lab.scroll_active = false
	_econ_lab.text = "Load a snapshot to view circulation."
	right.add_child(_econ_lab)
	_add_tab("overview", wrap)
	_refresh_session_info()


func _refresh_session_info() -> void:
	_session_lab.text = "[b]Environment[/b] %s\n[b]Role[/b] %s\n[b]Account[/b] %s\n[b]Email[/b] %s\n[b]Node[/b] %s\n[b]Permissions[/b] binary admin role (Node re-validates every request)\n[b]Target[/b] %s" % [
		BackendEnvironment.get_environment_id() if BackendEnvironment else "?",
		str(AuthManager.user.get("role", "user")),
		str(AuthManager.user.get("id", "")),
		str(AuthManager.user.get("email", "")),
		str(GameApiClient.base_url) if GameApiClient else "?",
		_target_label_text(),
	]
	_set_feedback("Session info refreshed.", "ok")


func _on_load_ops_dashboard() -> void:
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


# ─── Players ───────────────────────────────────────────────

func _build_players() -> void:
	var wrap := _col()
	wrap.add_child(ClientUi.make_section_header("PLAYERS", "Search · Inspect · Moderate", "Same target is used by Grants, Community, and System."))
	var grid := _grid()
	wrap.add_child(grid)

	var left := _col()
	grid.add_child(left)
	left.add_child(_make_target_picker(true))
	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.scroll_active = false
	_detail.custom_minimum_size = Vector2(0, TARGET_CARD_MIN_HEIGHT_PX)
	_detail.add_theme_color_override("default_color", ClientUi.TEXT)
	ClientUi.apply_body_font(_detail)
	left.add_child(_detail)
	var inspect_btn := _btn("Inspect Character", true)
	inspect_btn.pressed.connect(_on_inspect_character)
	left.add_child(inspect_btn)

	var right := _col()
	grid.add_child(right)
	right.add_child(_subhead("IDENTITY"))
	var rename_row := HBoxContainer.new()
	rename_row.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	right.add_child(rename_row)
	_rename_field = ClientUi.make_field("New character name")
	_rename_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rename_row.add_child(_rename_field)
	var rename_btn := _btn("Rename")
	rename_btn.pressed.connect(_on_rename_character)
	rename_row.add_child(rename_btn)

	var role_row := HBoxContainer.new()
	role_row.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	right.add_child(role_row)
	_role_user_id.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	role_row.add_child(_role_user_id)
	var promote := _btn("Promote Admin", false, true)
	promote.pressed.connect(func() -> void: _on_set_role("admin"))
	role_row.add_child(promote)
	var demote := _accent_btn("Demote User", ClientUi.SUCCESS)
	demote.pressed.connect(func() -> void: _on_set_role("user"))
	role_row.add_child(demote)

	right.add_child(_subhead("CHAT / ARENA", ClientUi.WARNING))
	var mute_row := HBoxContainer.new()
	mute_row.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	right.add_child(mute_row)
	_mute_minutes = _spin("min ", MUTE_MINUTES_MIN, MUTE_MINUTES_MAX, MUTE_MINUTES_DEFAULT)
	mute_row.add_child(_mute_minutes)
	var mute_btn := _btn("Mute", true)
	mute_btn.pressed.connect(func() -> void:
		_confirm_mod("Mute player?", func() -> Dictionary:
			return await AdminManager.mute_player(_cid(), int(_mute_minutes.value), _why())
		)
	)
	mute_row.add_child(mute_btn)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	right.add_child(row)
	var ban := _btn("Ban Character", false, true)
	ban.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ban.pressed.connect(func() -> void:
		_confirm_mod("Ban Character?", func() -> Dictionary:
			return await AdminManager.ban_player(_cid(), _why())
		)
	)
	row.add_child(ban)
	var unban := _accent_btn("Unban Character", ClientUi.SUCCESS)
	unban.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	unban.pressed.connect(func() -> void:
		_confirm_mod("Unban Character?", func() -> Dictionary:
			return await AdminManager.unban_player(_cid(), _why())
		)
	)
	row.add_child(unban)
	var unmute := _accent_btn("Unmute", ClientUi.SUCCESS, false)
	unmute.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	unmute.pressed.connect(func() -> void:
		_confirm_mod("Unmute player?", func() -> Dictionary:
			return await AdminManager.unmute_player(_cid(), _why())
		)
	)
	row.add_child(unmute)

	_arena_hours = _spin("Suspend hours ", ARENA_SUSPEND_HOURS_MIN, ARENA_SUSPEND_HOURS_MAX, ARENA_SUSPEND_HOURS_DEFAULT)
	right.add_child(_arena_hours)
	var arena_row := HBoxContainer.new()
	arena_row.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	right.add_child(arena_row)
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
	var arena_u := _accent_btn("Arena Unban", ClientUi.SUCCESS, false)
	arena_u.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	arena_u.pressed.connect(func() -> void:
		_confirm_mod("Arena unban?", func() -> Dictionary:
			return await AdminManager.arena_unban(_cid(), _why())
		)
	)
	arena_row.add_child(arena_u)

	right.add_child(_subhead("DANGER ZONE", ClientUi.DANGER))
	var reset := _btn("Reset Player Progress", false, true)
	reset.pressed.connect(func() -> void:
		if not _require_target_and_reason(true):
			return
		_confirm("RESET PLAYER?", "Deletes items and resets progression for %s (%s). Irreversible.\nReason: %s" % [_selected_name, _cid(), _why()], func() -> void:
			_run("Resetting…", func() -> Dictionary: return await AdminManager.reset_player(_cid(), _why()))
		)
	)
	right.add_child(reset)
	_add_tab("players", wrap, true)


func _on_inspect_character() -> void:
	if _cid().is_empty():
		_set_feedback("character_id required.", "err")
		return
	_run("Inspecting…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.inspect_character(_cid())
		if res.ok and typeof(res.data) == TYPE_DICTIONARY:
			var ch: Variant = res.data.get("character", {})
			if typeof(ch) == TYPE_DICTIONARY:
				_selected_name = str(ch.get("name", _selected_name))
				_selected_account_id = str(ch.get("created_by_id", _selected_account_id))
				_sync_target_fields()
				_refresh_target_cards()
			_detail.text = _format_inspect_sheet(res.data)
			res["message"] = "Inspected %s" % (_selected_name if not _selected_name.is_empty() else _cid())
		return res
	)


func _inspect_escape(text: String) -> String:
	return text.replace("[", "[[")


func _inspect_section(title: String) -> String:
	return "\n[color=#0DCADF][b]%s[/b][/color]" % _inspect_escape(title)


func _inspect_line(label: String, value: String) -> String:
	if value.strip_edges().is_empty():
		value = "—"
	return "[color=#8CA4B7]%s[/color]  %s" % [_inspect_escape(label), _inspect_escape(value)]


func _inspect_scalar(value: Variant) -> String:
	if value == null:
		return "—"
	match typeof(value):
		TYPE_BOOL:
			return "yes" if bool(value) else "no"
		TYPE_INT:
			return str(value)
		TYPE_FLOAT:
			if is_equal_approx(float(value), round(float(value))):
				return str(int(round(float(value))))
			return str(value)
		TYPE_STRING:
			var s := str(value).strip_edges()
			if s.is_empty():
				return "—"
			if s.find("T") >= 0 and (s.find("Z") >= 0 or s.find("+") >= 10 or s.find("-", 11) >= 0):
				return _inspect_time(s)
			return s
		TYPE_ARRAY:
			return _inspect_array(value, 0)
		TYPE_DICTIONARY:
			return _inspect_dict_inline(value, 0)
		_:
			return str(value)


func _inspect_time(raw: String) -> String:
	var s := raw.strip_edges().replace("T", " ")
	if s.ends_with("Z"):
		s = s.substr(0, s.length() - 1)
	var plus := s.rfind("+")
	if plus >= 19:
		s = s.substr(0, plus)
	var dot := s.find(".")
	if dot >= 0:
		s = s.substr(0, dot)
	return s


func _inspect_duration_ms(ms: Variant) -> String:
	var n := int(ms)
	if n <= 0:
		return "expired"
	var hours := n / MILLISECONDS_PER_HOUR
	var minutes := (n % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE
	if hours > 0:
		return "%sh %sm remaining" % [hours, minutes]
	return "%sm remaining" % minutes


func _inspect_array(arr: Array, depth: int) -> String:
	if arr.is_empty():
		return "none"
	if depth >= INSPECT_NEST_DEPTH_MAX:
		return "%s items" % arr.size()
	var parts: PackedStringArray = []
	var shown := mini(arr.size(), INSPECT_OTHER_LIST_CAP)
	for i in range(shown):
		var item: Variant = arr[i]
		if typeof(item) == TYPE_DICTIONARY:
			parts.append(_inspect_item_line(item) if item.has("name") or item.has("subject") or item.has("status") else _inspect_dict_inline(item, depth + 1))
		else:
			parts.append(_inspect_scalar(item))
	var joined := ", ".join(parts)
	if arr.size() > shown:
		joined += "  (+%s more)" % (arr.size() - shown)
	return joined


func _inspect_dict_inline(d: Dictionary, depth: int) -> String:
	if d.is_empty():
		return "none"
	if depth >= INSPECT_NEST_DEPTH_MAX:
		return "%s fields" % d.size()
	var parts: PackedStringArray = []
	for k in d.keys():
		parts.append("%s %s" % [str(k).capitalize().replace("_", " "), _inspect_scalar(d[k])])
	return " · ".join(parts)


func _inspect_item_line(item: Dictionary) -> String:
	var name := str(item.get("name", item.get("subject", item.get("id", "?"))))
	var bits: PackedStringArray = [name]
	if item.has("rarity") and str(item.get("rarity", "")).strip_edges() != "":
		bits.append(str(item.get("rarity")))
	if item.has("type") and str(item.get("type", "")).strip_edges() != "":
		bits.append(str(item.get("type")))
	if item.has("level") or item.has("level_requirement"):
		bits.append("Lv %s" % _inspect_scalar(item.get("level", item.get("level_requirement", 1))))
	if item.has("status") and str(item.get("status", "")).strip_edges() != "":
		bits.append(str(item.get("status")))
	if item.has("claimed"):
		bits.append("claimed" if bool(item.get("claimed", false)) else "unclaimed")
	return " · ".join(bits)


func _inspect_take(source: Dictionary, consumed: Dictionary, key: String) -> Variant:
	consumed[key] = true
	return source.get(key, null)


func _format_inspect_sheet(data: Dictionary) -> String:
	var lines: PackedStringArray = []
	var ch: Dictionary = data.get("character", {}) if typeof(data.get("character", null)) == TYPE_DICTIONARY else {}
	var account: Dictionary = data.get("account", {}) if typeof(data.get("account", null)) == TYPE_DICTIONARY else {}
	var consumed: Dictionary = {}
	var name := str(ch.get("name", "(unnamed)"))
	var cls := str(ch.get("class", "—"))
	var race := str(ch.get("race", ""))
	var ident := "%s · %s" % [cls, race] if not race.is_empty() else cls
	lines.append("[b]%s[/b]  Lv %s · %s" % [
		_inspect_escape(name),
		ClientUi.format_level(ch.get("level", 1)),
		_inspect_escape(ident),
	])
	if bool(data.get("read_only", false)):
		lines.append("[color=#F5A94E]Read-only inspect[/color]")

	if not account.is_empty():
		lines.append(_inspect_section("ACCOUNT"))
		lines.append(_inspect_line("Email", _inspect_scalar(account.get("email", ""))))
		lines.append(_inspect_line("Role", _inspect_scalar(account.get("role", ""))))
		lines.append(_inspect_line("Account id", _inspect_scalar(account.get("id", ""))))
		lines.append(_inspect_line("Nakama id", _inspect_scalar(account.get("nakama_user_id", ""))))
		lines.append(_inspect_line("Active character", _inspect_scalar(account.get("active_character_id", ""))))
		lines.append(_inspect_line("Legacy name", _inspect_scalar(account.get("legacy_name", ""))))
		lines.append(_inspect_line("Created", _inspect_scalar(account.get("created_date", ""))))

	lines.append(_inspect_section("CHARACTER"))
	lines.append(_inspect_line("Character id", _inspect_scalar(_inspect_take(ch, consumed, "id"))))
	_inspect_take(ch, consumed, "name")
	_inspect_take(ch, consumed, "class")
	_inspect_take(ch, consumed, "race")
	_inspect_take(ch, consumed, "level")
	lines.append(_inspect_line("Owner account", _inspect_scalar(_inspect_take(ch, consumed, "created_by_id"))))
	lines.append(_inspect_line("Created by", _inspect_scalar(_inspect_take(ch, consumed, "created_by"))))
	lines.append(_inspect_line("Created", _inspect_scalar(_inspect_take(ch, consumed, "created_date"))))
	lines.append(_inspect_line("Legacy name", _inspect_scalar(_inspect_take(ch, consumed, "legacy_name"))))
	lines.append(_inspect_line("Legacy display", _inspect_scalar(_inspect_take(ch, consumed, "legacy_display"))))

	lines.append(_inspect_section("PROGRESSION"))
	lines.append(_inspect_line("XP", "%s / %s to next" % [
		_inspect_scalar(_inspect_take(ch, consumed, "experience")),
		_inspect_scalar(_inspect_take(ch, consumed, "experience_to_next_level")),
	]))
	if ch.has("unspent_stat_points"):
		lines.append(_inspect_line("Unspent stat points", _inspect_scalar(_inspect_take(ch, consumed, "unspent_stat_points"))))
	if ch.has("attribute_purchases"):
		lines.append(_inspect_line("Attribute purchases", _inspect_scalar(_inspect_take(ch, consumed, "attribute_purchases"))))
	if ch.has("missions_completed"):
		lines.append(_inspect_line("Missions completed", _inspect_scalar(_inspect_take(ch, consumed, "missions_completed"))))
	if ch.has("highest_sector"):
		lines.append(_inspect_line("Highest sector", _inspect_scalar(_inspect_take(ch, consumed, "highest_sector"))))
	if ch.has("dungeon_clears"):
		lines.append(_inspect_line("Dungeon clears", _inspect_scalar(_inspect_take(ch, consumed, "dungeon_clears"))))
	if ch.has("highest_damage"):
		lines.append(_inspect_line("Highest damage", _inspect_scalar(_inspect_take(ch, consumed, "highest_damage"))))
	if ch.has("total_stardust_earned"):
		lines.append(_inspect_line("Lifetime stardust", _inspect_scalar(_inspect_take(ch, consumed, "total_stardust_earned"))))

	lines.append(_inspect_section("CURRENCIES"))
	lines.append(_inspect_line("Stardust", _inspect_scalar(_inspect_take(ch, consumed, "stardust"))))
	var nova := _inspect_scalar(_inspect_take(ch, consumed, "nova_crystals"))
	var nova_bits: PackedStringArray = [nova]
	if ch.has("nova_wagerable_half") or ch.has("nova_wagerable"):
		nova_bits.append("wagerable %s" % _inspect_scalar(_inspect_take(ch, consumed, "nova_wagerable_half" if ch.has("nova_wagerable_half") else "nova_wagerable")))
	if ch.has("nova_promotional_half") or ch.has("nova_promotional"):
		nova_bits.append("promotional %s" % _inspect_scalar(_inspect_take(ch, consumed, "nova_promotional_half" if ch.has("nova_promotional_half") else "nova_promotional")))
	if ch.has("nova_dual_balance_v1"):
		_inspect_take(ch, consumed, "nova_dual_balance_v1")
	lines.append(_inspect_line("Nova", " · ".join(nova_bits)))
	if ch.has("economy_nova_scale"):
		lines.append(_inspect_line("Nova scale", _inspect_scalar(_inspect_take(ch, consumed, "economy_nova_scale"))))
	lines.append(_inspect_line("Fuel", "%s / %s" % [
		_inspect_scalar(_inspect_take(ch, consumed, "fuel")),
		_inspect_scalar(_inspect_take(ch, consumed, "max_fuel")),
	]))
	if ch.has("fuel_purchases"):
		lines.append(_inspect_line("Fuel purchases", _inspect_scalar(_inspect_take(ch, consumed, "fuel_purchases"))))
	if ch.has("fuel_updated_at"):
		lines.append(_inspect_line("Fuel updated", _inspect_scalar(_inspect_take(ch, consumed, "fuel_updated_at"))))
	if ch.has("fuel_reset_at"):
		lines.append(_inspect_line("Fuel reset", _inspect_scalar(_inspect_take(ch, consumed, "fuel_reset_at"))))
	if ch.has("fuel_since_last_gear"):
		lines.append(_inspect_line("Fuel since last gear", _inspect_scalar(_inspect_take(ch, consumed, "fuel_since_last_gear"))))

	var stats: Variant = _inspect_take(ch, consumed, "stats")
	var purchases: Variant = _inspect_take(ch, consumed, "attribute_purchases_by_stat")
	lines.append(_inspect_section("STATS"))
	if typeof(stats) == TYPE_DICTIONARY:
		var order: Array[String] = ["strength", "agility", "intellect", "vitality", "luck"]
		for stat_key in order:
			var bought := ""
			if typeof(purchases) == TYPE_DICTIONARY and purchases.has(stat_key):
				bought = "  (purchases %s)" % _inspect_scalar(purchases[stat_key])
			lines.append(_inspect_line(stat_key.capitalize(), "%s%s" % [_inspect_scalar(stats.get(stat_key, 0)), bought]))
		if typeof(purchases) == TYPE_DICTIONARY:
			for extra in purchases.keys():
				if not order.has(str(extra)):
					lines.append(_inspect_line(str(extra).capitalize(), "purchases %s" % _inspect_scalar(purchases[extra])))
	elif typeof(purchases) == TYPE_DICTIONARY:
		lines.append(_inspect_line("Purchases", _inspect_dict_inline(purchases, 0)))
	else:
		lines.append(_inspect_line("Stats", "—"))

	var appearance: Variant = _inspect_take(ch, consumed, "appearance")
	if typeof(appearance) == TYPE_DICTIONARY and not appearance.is_empty():
		lines.append(_inspect_section("APPEARANCE"))
		for k in appearance.keys():
			lines.append(_inspect_line(str(k).capitalize().replace("_", " "), _inspect_scalar(appearance[k])))

	var equipped_map: Variant = _inspect_take(ch, consumed, "equipped_items")
	var inv: Variant = data.get("inventory", {})
	lines.append(_inspect_section("INVENTORY"))
	if typeof(inv) == TYPE_DICTIONARY:
		lines.append(_inspect_line("Items", _inspect_scalar(inv.get("count", 0))))
		var equipped: Array = inv.get("equipped", []) if typeof(inv.get("equipped", null)) == TYPE_ARRAY else []
		var bag: Array = inv.get("bag", []) if typeof(inv.get("bag", null)) == TYPE_ARRAY else []
		if typeof(equipped_map) == TYPE_DICTIONARY and not equipped_map.is_empty():
			lines.append(_inspect_line("Equipped slots", _inspect_dict_inline(equipped_map, 0)))
		if equipped.is_empty():
			lines.append(_inspect_line("Worn", "none"))
		else:
			lines.append("[color=#8CA4B7]Worn[/color]")
			for it in equipped:
				if typeof(it) == TYPE_DICTIONARY:
					lines.append("  • %s" % _inspect_escape(_inspect_item_line(it)))
		if bag.is_empty():
			lines.append(_inspect_line("Bag", "none"))
		else:
			lines.append("[color=#8CA4B7]Bag[/color]")
			for it in bag:
				if typeof(it) == TYPE_DICTIONARY:
					lines.append("  • %s" % _inspect_escape(_inspect_item_line(it)))
	elif typeof(equipped_map) == TYPE_DICTIONARY:
		lines.append(_inspect_line("Equipped slots", _inspect_dict_inline(equipped_map, 0)))

	var stims: Variant = data.get("active_stims", [])
	lines.append(_inspect_section("STIMS"))
	_inspect_take(ch, consumed, "active_buffs")
	if typeof(stims) != TYPE_ARRAY or stims.is_empty():
		lines.append(_inspect_line("Active", "none"))
	else:
		for stim in stims:
			if typeof(stim) != TYPE_DICTIONARY:
				continue
			var stim_name := str(stim.get("name", stim.get("stat", stim.get("attribute", "stim"))))
			var remain := _inspect_duration_ms(stim.get("remaining_ms", 0))
			var bonus: Variant = stim.get("bonus_percent", null)
			var bonus_txt := "+%s%%" % _inspect_scalar(bonus) if bonus != null else ""
			lines.append("  • %s  %s  %s  %s" % [
				_inspect_escape(stim_name),
				_inspect_escape(str(stim.get("rarity", ""))),
				_inspect_escape(bonus_txt),
				_inspect_escape(remain),
			])

	var mod: Variant = data.get("moderation", null)
	lines.append(_inspect_section("MODERATION"))
	if typeof(mod) != TYPE_DICTIONARY or mod.is_empty():
		lines.append(_inspect_line("Record", "none"))
	else:
		for k in mod.keys():
			lines.append(_inspect_line(str(k).capitalize().replace("_", " "), _inspect_scalar(mod[k])))

	if ch.has("active_mission_id") or ch.has("mission_end_time") or ch.has("mission_board"):
		lines.append(_inspect_section("MISSION STATE"))
		if ch.has("active_mission_id"):
			lines.append(_inspect_line("Active mission", _inspect_scalar(_inspect_take(ch, consumed, "active_mission_id"))))
		if ch.has("mission_end_time"):
			lines.append(_inspect_line("Mission ends", _inspect_scalar(_inspect_take(ch, consumed, "mission_end_time"))))
		var board: Variant = _inspect_take(ch, consumed, "mission_board")
		if typeof(board) == TYPE_DICTIONARY:
			if board.has("character_level"):
				lines.append(_inspect_line("Board level", _inspect_scalar(board.get("character_level"))))
			if board.has("generated_at"):
				lines.append(_inspect_line("Board generated", _inspect_scalar(board.get("generated_at"))))
			var offers: Variant = board.get("offers", [])
			if typeof(offers) == TYPE_ARRAY:
				lines.append(_inspect_line("Offers", str(offers.size())))
				var offer_shown := mini(offers.size(), INSPECT_OTHER_LIST_CAP)
				for i in range(offer_shown):
					var off: Variant = offers[i]
					if typeof(off) == TYPE_DICTIONARY:
						lines.append("  • %s" % _inspect_escape(_inspect_dict_inline(off, 1)))
					else:
						lines.append("  • %s" % _inspect_escape(_inspect_scalar(off)))
				if offers.size() > offer_shown:
					lines.append("  • +%s more offers" % (offers.size() - offer_shown))

	var mail: Variant = data.get("mail_recent", [])
	lines.append(_inspect_section("MAIL"))
	if typeof(mail) != TYPE_ARRAY or mail.is_empty():
		lines.append(_inspect_line("Recent", "none"))
	else:
		for row in mail:
			if typeof(row) == TYPE_DICTIONARY:
				lines.append("  • %s" % _inspect_escape(_inspect_item_line(row)))

	var missions: Variant = data.get("missions_recent", [])
	lines.append(_inspect_section("RECENT MISSIONS"))
	if typeof(missions) != TYPE_ARRAY or missions.is_empty():
		lines.append(_inspect_line("Recent", "none"))
	else:
		for row in missions:
			if typeof(row) != TYPE_DICTIONARY:
				continue
			lines.append("  • %s  %s  %s" % [
				_inspect_escape(_inspect_scalar(row.get("status", ""))),
				_inspect_escape(_inspect_scalar(row.get("id", ""))),
				_inspect_escape(_inspect_scalar(row.get("created_date", ""))),
			])

	for coll_key in ["discovered_species", "collected_artifacts", "collected_relics", "promo_codes_redeemed"]:
		if ch.has(coll_key):
			var coll: Variant = _inspect_take(ch, consumed, coll_key)
			var title := str(coll_key).capitalize().replace("_", " ")
			if typeof(coll) == TYPE_ARRAY:
				lines.append(_inspect_line(title, "%s  %s" % [coll.size(), _inspect_array(coll, 0)]))
			else:
				lines.append(_inspect_line(title, _inspect_scalar(coll)))

	if ch.has("arena_rating") or ch.has("arena_wins") or ch.has("arena_banned"):
		lines.append(_inspect_section("ARENA"))
		for arena_key in [
			"arena_rating", "arena_wins", "arena_losses", "arena_battles",
			"arena_streak", "arena_max_streak", "arena_attempts_left", "arena_attempts_date",
		]:
			if ch.has(arena_key):
				lines.append(_inspect_line(str(arena_key).capitalize().replace("_", " ").replace("Arena ", ""), _inspect_scalar(_inspect_take(ch, consumed, arena_key))))

	var leftover: PackedStringArray = []
	for k in ch.keys():
		if consumed.has(k):
			continue
		leftover.append(_inspect_line(str(k).capitalize().replace("_", " "), _inspect_scalar(ch[k])))
	if not leftover.is_empty():
		lines.append(_inspect_section("OTHER"))
		for row in leftover:
			lines.append(row)
	return "\n".join(lines)


func _on_rename_character() -> void:
	if _cid().is_empty() or _rename_field.text.strip_edges().is_empty():
		_set_feedback("character_id and new name are required.", "err")
		return
	var new_name := _rename_field.text.strip_edges()
	if new_name.find(" ") >= 0 or new_name.find("\t") >= 0:
		_set_feedback("Names cannot contain spaces", "err")
		return
	_confirm("Rename character?", "%s → %s" % [_cid(), new_name], func() -> void:
		_run("Renaming…", func() -> Dictionary:
			return await AdminManager.rename_character(_cid(), new_name)
		)
	)


func _on_set_role(role: String) -> void:
	if _why().is_empty():
		_set_feedback("Reason is required for role changes.", "err")
		return
	var uid := _role_user_id.text.strip_edges() if _role_user_id else ""
	var cid := _cid()
	if uid.is_empty() and cid.is_empty():
		_set_feedback("Select a player (or enter account user_id).", "err")
		return
	var title := "Promote to admin?" if role == "admin" else "Demote to user?"
	_confirm(title, "role=%s\nuser=%s\nchar=%s\nReason: %s" % [role, uid, cid, _why()], func() -> void:
		_run("Updating role…", func() -> Dictionary:
			return await AdminManager.set_role(uid, role, _why(), cid)
		)
	)


# ─── Grants ────────────────────────────────────────────────

func _grant_accent(kind: String = "") -> Color:
	var t := kind if not kind.is_empty() else _grant_type
	match t:
		GRANT_TYPE_FUEL:
			return CurrencyIcon.FUEL_GREEN
		GRANT_TYPE_STARDUST:
			return CurrencyIcon.STARDUST_FUCHSIA
		GRANT_TYPE_NOVA:
			return CurrencyIcon.NOVA_GOLD
		GRANT_TYPE_XP:
			return ClientUi.VIOLET
		GRANT_TYPE_GEAR:
			return ClientUi.GOLD
		GRANT_TYPE_COMPENSATION:
			return ClientUi.WARNING
		GRANT_TYPE_ENTITLEMENT:
			return ClientUi.CYAN
		_:
			return ClientUi.CYAN


func _simulate_stim_rarity_label(level: int) -> String:
	if level <= SIMULATE_STIM_UNCOMMON_LEVEL_MAX:
		return "Uncommon"
	if level <= SIMULATE_STIM_RARE_LEVEL_MAX:
		return "Rare"
	return "Epic"


func _refresh_simulate_cta() -> void:
	var level := SIMULATE_LEVEL_DEFAULT
	if _sim_level:
		level = maxi(SIMULATE_LEVEL_MIN, int(_sim_level.value))
	if _sim_cta:
		_sim_cta.text = "Simulate Level %s" % ClientUi.format_level(level)
	if _sim_summary:
		_sim_summary.text = (
			"Overwrites the selected character. Class stays the same. Level %s, empty XP bar, "
			+ "8× %s on-level gear equipped, purchases ramp to %s%% of EPA by L%s (35/35/20/5/5), "
			+ "%s %s stims on primary/vitality/luck (max duration), Fuel filled, "
			+ "%s days of expected mission Stardust, %s Nova, tutorial completed. Bag wiped."
		) % [
			ClientUi.format_level(level),
			SIMULATE_GEAR_RARITY.capitalize(),
			SIMULATE_PURCHASE_EPA_SHARE_PERCENT,
			SIMULATE_PURCHASE_RAMP_COMPLETE_LEVEL,
			SIMULATE_STIM_COUNT,
			_simulate_stim_rarity_label(level),
			SIMULATE_STARDUST_DAY_COUNT,
			SIMULATE_NOVA_GRANT,
		]


func _on_simulate_pressed() -> void:
	if _cid().is_empty():
		_set_feedback("Select a character first (search or My Characters).", "err")
		return
	var level := maxi(SIMULATE_LEVEL_MIN, int(_sim_level.value) if _sim_level else SIMULATE_LEVEL_DEFAULT)
	var summary := (
		"This replaces gear, purchases, stims, currencies, level, and the mission board for %s (%s).\n"
		+ "Simulate Level %s · 8× %s · %s stims · tutorial complete.\nReason: %s"
	) % [
		_selected_name if not _selected_name.is_empty() else "?",
		_cid(),
		ClientUi.format_level(level),
		SIMULATE_GEAR_RARITY.capitalize(),
		_simulate_stim_rarity_label(level),
		_why() if not _why().is_empty() else "unspecified",
	]
	_confirm("Simulate level?", summary, func() -> void:
		_run("Simulating…", func() -> Dictionary:
			return await AdminManager.simulate_level(_cid(), level, _why())
		)
	)


func _build_simulate() -> void:
	var wrap := _col()
	wrap.add_child(ClientUi.make_section_header(
		"SIMULATE",
		"Expected on-level loadout",
		"Wipes the selected character and rebuilds an expected Light-spender snapshot. Reason above is optional."
	))
	var grid := _grid()
	wrap.add_child(grid)

	var left := _col()
	grid.add_child(left)
	left.add_child(_make_target_picker(false))

	var right := _col()
	grid.add_child(right)
	right.add_child(_subhead("LEVEL"))
	_sim_level = _spin("Lv ", SIMULATE_LEVEL_MIN, GRANT_GEAR_LEVEL_WIDGET_CEILING, SIMULATE_LEVEL_DEFAULT)
	_sim_level.rounded = true
	_sim_level.value_changed.connect(func(_v: float) -> void: _refresh_simulate_cta())
	right.add_child(_sim_level)
	_sim_summary = Label.new()
	_sim_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_sim_summary.add_theme_color_override("font_color", ClientUi.MUTED)
	right.add_child(_sim_summary)
	_sim_cta = _btn("Simulate Level 1", true, true)
	_sim_cta.pressed.connect(_on_simulate_pressed)
	right.add_child(_sim_cta)
	_refresh_simulate_cta()
	_add_tab("simulate", wrap, true)


func _build_grants() -> void:
	var wrap := _col()
	wrap.add_child(ClientUi.make_section_header("GRANTS", "One workflow for every grant type", "Select recipient → type → configure → grant. Reason above is optional."))
	var grid := _grid()
	wrap.add_child(grid)

	var left := _col()
	grid.add_child(left)
	left.add_child(_make_target_picker(false))
	left.add_child(_subhead("GRANT TYPE"))
	var types := HFlowContainer.new()
	types.add_theme_constant_override("h_separation", ROW_SEPARATION_PX)
	types.add_theme_constant_override("v_separation", 4)
	left.add_child(types)
	for spec in [
		[GRANT_TYPE_FUEL, "Fuel"],
		[GRANT_TYPE_STARDUST, "Stardust"],
		[GRANT_TYPE_NOVA, "Nova"],
		[GRANT_TYPE_XP, "XP"],
		[GRANT_TYPE_GEAR, "Gear"],
		[GRANT_TYPE_COMPENSATION, "Compensation"],
		[GRANT_TYPE_ENTITLEMENT, "Entitlement"],
	]:
		var id := str(spec[0])
		var b := _accent_btn(str(spec[1]), _grant_accent(id), id == _grant_type)
		b.pressed.connect(func() -> void: _set_grant_type(id))
		types.add_child(b)
		_grant_type_buttons[id] = b

	var right := _col()
	grid.add_child(right)
	_grant_summary = Label.new()
	_grant_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_grant_summary.add_theme_color_override("font_color", ClientUi.TEXT)
	right.add_child(_grant_summary)

	_grant_amount_box = VBoxContainer.new()
	_grant_amount_box.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	right.add_child(_grant_amount_box)
	_grant_amount = _spin("Amount ", GRANT_FUEL_DELTA_MIN, GRANT_FUEL_DELTA_MAX, GRANT_FUEL_DEFAULT)
	_grant_amount.value_changed.connect(func(_v: float) -> void: _refresh_grant_cta())
	_grant_amount_box.add_child(_grant_amount)
	_grant_preset_row = HFlowContainer.new()
	_grant_preset_row.add_theme_constant_override("h_separation", 4)
	_grant_preset_row.add_theme_constant_override("v_separation", 4)
	_grant_amount_box.add_child(_grant_preset_row)

	_grant_gear_box = VBoxContainer.new()
	_grant_gear_box.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	right.add_child(_grant_gear_box)
	_item_type = _option(GEAR_SLOT_IDS, 0)
	_grant_gear_box.add_child(_item_type)
	_item_rarity = _option(GEAR_RARITY_IDS, GEAR_RARITY_DEFAULT_INDEX)
	_item_rarity.item_selected.connect(func(_i: int) -> void: _refresh_grant_cta())
	_grant_gear_box.add_child(_item_rarity)
	_item_level = _spin("Item level ", GRANT_GEAR_LEVEL_MIN, GRANT_GEAR_LEVEL_WIDGET_CEILING, GRANT_GEAR_LEVEL_DEFAULT)
	_grant_gear_box.add_child(_item_level)

	_grant_comp_box = VBoxContainer.new()
	_grant_comp_box.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	right.add_child(_grant_comp_box)
	var crow := HBoxContainer.new()
	crow.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	_grant_comp_box.add_child(crow)
	_reward_sd = _spin("SD ", 0, GRANT_SD_DELTA_MAX, 0)
	_reward_nova = _spin("Nova ", 0, GRANT_NOVA_DELTA_MAX, 0)
	crow.add_child(_reward_sd)
	crow.add_child(_reward_nova)

	_grant_ent_box = VBoxContainer.new()
	_grant_ent_box.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	right.add_child(_grant_ent_box)
	_ent_key = ClientUi.make_field("entitlementKey")
	_ent_key.text = DEFAULT_ENTITLEMENT_KEY
	_grant_ent_box.add_child(_ent_key)
	_ent_qty = _spin("qty ", GRANT_ENTITLEMENT_QTY_MIN, GRANT_ENTITLEMENT_QTY_MAX, GRANT_ENTITLEMENT_QTY_DEFAULT)
	_grant_ent_box.add_child(_ent_qty)
	_grant_ent_box.add_child(_account_id)
	_ent_id = ClientUi.make_field("entitlement record id (revoke / restore)")
	_grant_ent_box.add_child(_ent_id)
	var ent_row := HBoxContainer.new()
	ent_row.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	_grant_ent_box.add_child(ent_row)
	var rev := _btn("Revoke Entitlement", false, true)
	rev.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rev.pressed.connect(func() -> void:
		_confirm("Revoke entitlement?", _ent_id.text, func() -> void:
			_run("Revoking…", func() -> Dictionary:
				return await AdminManager.entitlements_revoke(_ent_id.text.strip_edges(), {"reason": _why()})
			)
		)
	)
	ent_row.add_child(rev)
	var rest := _accent_btn("Restore Entitlement", ClientUi.SUCCESS, false)
	rest.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rest.pressed.connect(func() -> void:
		_run("Restoring…", func() -> Dictionary:
			return await AdminManager.entitlements_restore(_ent_id.text.strip_edges(), {"reason": _why()})
		)
	)
	ent_row.add_child(rest)
	var search_ent := _btn("Search Account Entitlements")
	search_ent.pressed.connect(func() -> void:
		_run("Searching entitlements…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.entitlements_search({
				"accountId": _account_id.text.strip_edges(),
			})
			_fill_kv_list(_ent_list, res)
			return res
		)
	)
	_grant_ent_box.add_child(search_ent)
	var products := _btn("List Product Mappings")
	products.pressed.connect(func() -> void:
		_run("Loading products…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.entitlements_products()
			_fill_kv_list(_ent_products, res)
			return res
		)
	)
	_grant_ent_box.add_child(products)
	var eaudit := _btn("Entitlement Audit")
	eaudit.pressed.connect(func() -> void:
		_run("Loading entitlement audit…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.entitlements_audit({
				"accountId": _account_id.text.strip_edges(),
				"limit": str(AUDIT_SEARCH_LIMIT),
			})
			_fill_kv_list(_ent_list, res)
			return res
		)
	)
	_grant_ent_box.add_child(eaudit)
	_ent_list = VBoxContainer.new()
	_grant_ent_box.add_child(_ent_list)
	_ent_products = VBoxContainer.new()
	_grant_ent_box.add_child(_ent_products)

	_grant_cta = _btn("Grant", true)
	_grant_cta.pressed.connect(_on_grant_pressed)
	right.add_child(_grant_cta)
	_set_grant_type(GRANT_TYPE_FUEL)
	_add_tab("grants", wrap)


func _set_grant_type(kind: String) -> void:
	_grant_type = kind
	for id in _grant_type_buttons.keys():
		var b: Button = _grant_type_buttons[id]
		var filled := str(id) == kind
		if filled:
			ClientUi.apply_tinted_painted_button(b, _grant_accent(str(id)))
		else:
			ClientUi.apply_dark_outline_button(b, _grant_accent(str(id)), 0)
	var amount := kind == GRANT_TYPE_FUEL or kind == GRANT_TYPE_STARDUST or kind == GRANT_TYPE_NOVA or kind == GRANT_TYPE_XP
	_grant_amount_box.visible = amount
	_grant_gear_box.visible = kind == GRANT_TYPE_GEAR
	_grant_comp_box.visible = kind == GRANT_TYPE_COMPENSATION
	_grant_ent_box.visible = kind == GRANT_TYPE_ENTITLEMENT
	if amount:
		_configure_grant_amount(kind)
	_refresh_grant_cta()


func _configure_grant_amount(kind: String) -> void:
	match kind:
		GRANT_TYPE_FUEL:
			_grant_amount.min_value = GRANT_FUEL_DELTA_MIN
			_grant_amount.max_value = GRANT_FUEL_DELTA_MAX
			_grant_amount.value = GRANT_FUEL_DEFAULT
			_grant_amount.prefix = "Fuel "
			_fill_presets(GRANT_PRESETS_FUEL)
		GRANT_TYPE_STARDUST:
			_grant_amount.min_value = GRANT_SD_DELTA_MIN
			_grant_amount.max_value = GRANT_SD_DELTA_MAX
			_grant_amount.value = GRANT_STARDUST_DEFAULT
			_grant_amount.prefix = "SD "
			_fill_presets(GRANT_PRESETS_STANDARD)
		GRANT_TYPE_NOVA:
			_grant_amount.min_value = GRANT_NOVA_DELTA_MIN
			_grant_amount.max_value = GRANT_NOVA_DELTA_MAX
			_grant_amount.value = GRANT_NOVA_DEFAULT
			_grant_amount.prefix = "Nova "
			_fill_presets(GRANT_PRESETS_STANDARD)
		GRANT_TYPE_XP:
			_grant_amount.min_value = GRANT_XP_DELTA_MIN
			_grant_amount.max_value = GRANT_XP_DELTA_MAX
			_grant_amount.value = GRANT_XP_DEFAULT
			_grant_amount.prefix = "XP "
			_fill_presets(GRANT_PRESETS_XP)


func _fill_presets(values: Array[int]) -> void:
	_clear_host(_grant_preset_row)
	for n in values:
		var amt := n
		var b := _btn(str(amt))
		b.pressed.connect(func() -> void:
			_grant_amount.value = amt
			_refresh_grant_cta()
		)
		_grant_preset_row.add_child(b)


func _grant_amount_int() -> int:
	return int(_grant_amount.value) if _grant_amount else 0


func _grant_cta_label() -> String:
	var amt := _grant_amount_int()
	var verb := "Grant" if amt >= 0 else "Remove"
	var mag := absi(amt)
	match _grant_type:
		GRANT_TYPE_FUEL:
			return "%s %s Fuel" % [verb, mag]
		GRANT_TYPE_STARDUST:
			return "%s %s Stardust" % [verb, mag]
		GRANT_TYPE_NOVA:
			return "%s %s Nova" % [verb, mag]
		GRANT_TYPE_XP:
			return "%s %s XP" % [verb, mag]
		GRANT_TYPE_GEAR:
			var rarity := _item_rarity.get_item_text(_item_rarity.selected) if _item_rarity else "rare"
			return "Grant %s Gear" % rarity.capitalize()
		GRANT_TYPE_COMPENSATION:
			return "Grant Compensation"
		GRANT_TYPE_ENTITLEMENT:
			return "Grant Entitlement"
		_:
			return "Grant"


func _refresh_grant_cta() -> void:
	if _grant_cta == null:
		return
	_grant_cta.text = _grant_cta_label()
	var accent := _grant_accent()
	if _grant_type == GRANT_TYPE_FUEL or _grant_type == GRANT_TYPE_STARDUST or _grant_type == GRANT_TYPE_NOVA or _grant_type == GRANT_TYPE_XP:
		if _grant_amount_int() < 0:
			ClientUi.apply_danger_button(_grant_cta)
		else:
			ClientUi.apply_tinted_painted_button(_grant_cta, accent)
	elif _grant_type == GRANT_TYPE_GEAR:
		var rarity := _item_rarity.get_item_text(_item_rarity.selected) if _item_rarity else "rare"
		ClientUi.apply_tinted_painted_button(_grant_cta, ClientUi.rarity_color(rarity))
	else:
		ClientUi.apply_tinted_painted_button(_grant_cta, accent)
	if _grant_summary:
		_grant_summary.text = "Will apply to: %s" % _target_label_text()
		_grant_summary.add_theme_color_override("font_color", accent)


func _on_grant_pressed() -> void:
	if _cid().is_empty() and _grant_type != GRANT_TYPE_ENTITLEMENT:
		_set_feedback("Select a character first (search or My Characters).", "err")
		return
	if _grant_type == GRANT_TYPE_ENTITLEMENT and _account_id.text.strip_edges().is_empty():
		_set_feedback("Account id required for entitlements.", "err")
		return
	if _grant_type == GRANT_TYPE_FUEL or _grant_type == GRANT_TYPE_STARDUST or _grant_type == GRANT_TYPE_NOVA or _grant_type == GRANT_TYPE_XP:
		if _grant_amount_int() == 0:
			_set_feedback("Invalid amount.", "err")
			return
	var summary := "%s\nTarget: %s" % [_grant_cta_label(), _target_label_text()]
	if not _why().is_empty():
		summary += "\nReason: %s" % _why()
	_confirm(_grant_cta_label() + "?", summary, func() -> void:
		_run("Granting…", _execute_grant)
	)


func _execute_grant() -> Dictionary:
	match _grant_type:
		GRANT_TYPE_FUEL:
			return await AdminManager.adjust_currency(_cid(), {"fuel": _grant_amount_int()}, _why())
		GRANT_TYPE_STARDUST:
			return await AdminManager.adjust_currency(_cid(), {"stardust": _grant_amount_int()}, _why())
		GRANT_TYPE_NOVA:
			return await AdminManager.adjust_currency(_cid(), {"nova_crystals": _grant_amount_int()}, _why())
		GRANT_TYPE_XP:
			return await AdminManager.adjust_currency(_cid(), {"experience": _grant_amount_int()}, _why())
		GRANT_TYPE_GEAR:
			return await AdminManager.grant_item(_cid(), {
				"type": _item_type.get_item_text(_item_type.selected),
				"rarity": _item_rarity.get_item_text(_item_rarity.selected),
				"level": int(_item_level.value),
			}, _why())
		GRANT_TYPE_COMPENSATION:
			return await AdminManager.rewards_grant({
				"characterId": _cid(),
				"reason": _why(),
				"stardust": int(_reward_sd.value),
				"nova_crystals": int(_reward_nova.value),
				"compensation": true,
			})
		GRANT_TYPE_ENTITLEMENT:
			return await AdminManager.entitlements_grant({
				"entitlementKey": _ent_key.text.strip_edges(),
				"accountId": _account_id.text.strip_edges(),
				"quantity": int(_ent_qty.value),
				"reason": _why(),
				"confirm": true,
			})
		_:
			return {"ok": false, "message": "Unknown grant type."}


# ─── Community ─────────────────────────────────────────────

func _build_community() -> void:
	var wrap := _col()
	wrap.add_child(ClientUi.make_section_header("COMMUNITY", "Reports · Filter · Mail · Guilds · Promo", "Player-facing operations. Mail uses the selected character unless Send to ALL is checked."))
	wrap.add_child(_make_target_picker(false))
	var grid := _grid()
	wrap.add_child(grid)

	var reports := _col()
	grid.add_child(reports)
	reports.add_child(_subhead("REPORTS"))
	var load_btn := _btn("Load Open Reports", true)
	load_btn.pressed.connect(_on_load_reports)
	reports.add_child(load_btn)
	_reports_list = VBoxContainer.new()
	_reports_list.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	reports.add_child(_reports_list)

	var filter := _col()
	grid.add_child(filter)
	filter.add_child(_subhead("CHAT FILTER"))
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
	filter.add_child(load_f)
	_filter_words = TextEdit.new()
	_filter_words.custom_minimum_size = Vector2(0, FILTER_EDITOR_MIN_HEIGHT_PX)
	_filter_words.placeholder_text = "badword\nother"
	filter.add_child(_filter_words)
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
	filter.add_child(save)

	var mail := _col()
	grid.add_child(mail)
	mail.add_child(_subhead("SYSTEM MAIL"))
	_mail_subject = ClientUi.make_field("Subject")
	mail.add_child(_mail_subject)
	_mail_body = TextEdit.new()
	_mail_body.custom_minimum_size = Vector2(0, MAIL_BODY_MIN_HEIGHT_PX)
	_mail_body.placeholder_text = "Body"
	mail.add_child(_mail_body)
	var mrow := HBoxContainer.new()
	mrow.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	mail.add_child(mrow)
	_mail_sd = _spin("Reward SD ", 0, GRANT_SD_DELTA_MAX, 0)
	_mail_nova = _spin("Reward Nova ", 0, GRANT_NOVA_DELTA_MAX, 0)
	_mail_expires = _spin("Expires days ", MAIL_EXPIRES_DAYS_MIN, MAIL_EXPIRES_DAYS_MAX, AdminManager.DEFAULT_SYSTEM_MAIL_EXPIRY_DAYS)
	mrow.add_child(_mail_sd)
	mrow.add_child(_mail_nova)
	mrow.add_child(_mail_expires)
	_mail_all = CheckBox.new()
	_mail_all.text = "Send to ALL players (high risk)"
	mail.add_child(_mail_all)
	var send := _btn("Send System Mail", false, true)
	send.pressed.connect(_on_send_system_mail)
	mail.add_child(send)

	var guilds := _col()
	grid.add_child(guilds)
	guilds.add_child(_subhead("GUILDS"))
	var load_g := _btn("Load Guilds", true)
	load_g.pressed.connect(_on_load_guilds)
	guilds.add_child(load_g)
	_guild_list = VBoxContainer.new()
	_guild_list.add_theme_constant_override("separation", 4)
	guilds.add_child(_guild_list)
	_guild_id = ClientUi.make_field("guild_id")
	guilds.add_child(_guild_id)
	var load_m := _btn("Load Guild Members")
	load_m.pressed.connect(_on_load_guild_members)
	guilds.add_child(load_m)
	_guild_members = VBoxContainer.new()
	guilds.add_child(_guild_members)
	_new_leader_id = ClientUi.make_field("new_leader character_id")
	guilds.add_child(_new_leader_id)
	var xfer := _btn("Transfer Leadership", false, true)
	xfer.pressed.connect(_on_transfer_guild)
	guilds.add_child(xfer)

	var promo := _col()
	grid.add_child(promo)
	promo.add_child(_subhead("PROMO CODES"))
	_promo_code = ClientUi.make_field("CODE")
	promo.add_child(_promo_code)
	_promo_label = ClientUi.make_field("Label")
	promo.add_child(_promo_label)
	var prow := HBoxContainer.new()
	prow.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	promo.add_child(prow)
	_promo_sd = _spin("SD ", 0, PROMO_SD_MAX, PROMO_SD_DEFAULT)
	_promo_nova = _spin("Nova ", 0, PROMO_NOVA_MAX, 0)
	_promo_max = _spin("Max uses ", PROMO_MAX_USES_MIN, PROMO_MAX_USES_MAX, PROMO_MAX_USES_DEFAULT)
	prow.add_child(_promo_sd)
	prow.add_child(_promo_nova)
	prow.add_child(_promo_max)
	var create := _btn("Create Promo Code", true)
	create.pressed.connect(_on_create_promo)
	promo.add_child(create)
	var refresh := _btn("Refresh List")
	refresh.pressed.connect(_on_load_promos)
	promo.add_child(refresh)
	_promo_list = VBoxContainer.new()
	_promo_list.add_theme_constant_override("separation", 4)
	promo.add_child(_promo_list)
	_add_tab("community", wrap, true)


func _on_load_reports() -> void:
	await _run("Loading reports…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.list_open_reports()
		_clear_host(_reports_list)
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
	box.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	var lab := Label.new()
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.text = "%s · %s → %s · %s" % [
		str(row.get("id", "")).substr(0, ID_PREVIEW_LENGTH),
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


func _on_send_system_mail() -> void:
	if _why().is_empty():
		_set_feedback("Reason required for system mail.", "err")
		return
	if _mail_subject.text.strip_edges().is_empty():
		_set_feedback("Subject required.", "err")
		return
	if not _mail_all.button_pressed and _cid().is_empty():
		_set_feedback("Select a target character or check Send to ALL.", "err")
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


func _on_load_guilds() -> void:
	await _run("Loading guilds…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.list_guilds()
		_clear_host(_guild_list)
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
				str(g.get("leader_id", "")).substr(0, ID_PREVIEW_LENGTH),
				gid.substr(0, ID_PREVIEW_LENGTH),
			])
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			b.pressed.connect(func() -> void:
				_guild_id.text = gid
				_set_feedback("Guild selected: %s" % gid, "ok")
			)
			_guild_list.add_child(b)
		res["message"] = "Loaded %s guild(s)." % rows.size()
		return res
	)


func _on_load_guild_members() -> void:
	if _guild_id.text.strip_edges().is_empty():
		_set_feedback("guild_id required.", "err")
		return
	_run("Loading members…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.list_guild_members(_guild_id.text.strip_edges())
		_clear_host(_guild_members)
		if not res.ok:
			return res
		var rows: Array = res.raw if typeof(res.raw) == TYPE_ARRAY else []
		if typeof(res.data) == TYPE_DICTIONARY and typeof(res.data.get("members", null)) == TYPE_ARRAY:
			rows = res.data["members"]
		for row in rows:
			if typeof(row) != TYPE_DICTIONARY:
				continue
			var mid := str(row.get("character_id", row.get("id", "")))
			var b := _btn("%s · %s" % [
				str(row.get("name", row.get("character_name", "?"))),
				mid.substr(0, ID_PREVIEW_LENGTH),
			])
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			b.pressed.connect(func() -> void:
				_new_leader_id.text = mid
				_set_feedback("Leader candidate set: %s" % mid, "ok")
			)
			_guild_members.add_child(b)
		res["message"] = "Loaded %s member(s)." % rows.size()
		return res
	)


func _on_transfer_guild() -> void:
	if _guild_id.text.strip_edges().is_empty() or _new_leader_id.text.strip_edges().is_empty():
		_set_feedback("guild_id and new_leader character_id required.", "err")
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


func _on_create_promo() -> void:
	if _promo_code.text.strip_edges().is_empty():
		_set_feedback("Promo code required.", "err")
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


func _on_load_promos() -> void:
	await _run("Loading promos…", func() -> Dictionary:
		var res: Dictionary = await AdminManager.list_promo_codes()
		_clear_host(_promo_list)
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


# ─── Logs ──────────────────────────────────────────────────

func _build_logs() -> void:
	var wrap := _col()
	wrap.add_child(ClientUi.make_section_header("LOGS", "Audit · Email · Reward claims", "Read/search first. Annotate and retry still confirm."))
	var grid := _grid()
	wrap.add_child(grid)

	var audit := _col()
	grid.add_child(audit)
	audit.add_child(_subhead("AUDIT LOGS"))
	_audit_q = ClientUi.make_field("action or accountId filter")
	audit.add_child(_audit_q)
	var search := _btn("Search Audit", true)
	search.pressed.connect(func() -> void:
		_run("Searching audit…", func() -> Dictionary:
			var params := {"limit": str(AUDIT_SEARCH_LIMIT)}
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
	audit.add_child(search)
	var timeline := _btn("Account Timeline (selected account)")
	timeline.pressed.connect(func() -> void:
		var aid := _selected_account_id if not _selected_account_id.is_empty() else (_account_id.text.strip_edges() if _account_id else "")
		if aid.is_empty():
			_set_feedback("Select an account (search) first.", "err")
			return
		_run("Loading timeline…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.audit_timeline(aid, {"limit": str(AUDIT_SEARCH_LIMIT)})
			_fill_kv_list(_audit_list, res)
			return res
		)
	)
	audit.add_child(timeline)
	_audit_entry_id = ClientUi.make_field("audit entry id")
	audit.add_child(_audit_entry_id)
	var get_e := _btn("Get Entry + Integrity")
	get_e.pressed.connect(func() -> void:
		if _audit_entry_id.text.strip_edges().is_empty():
			_set_feedback("audit entry id required.", "err")
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
	audit.add_child(get_e)
	_audit_note = ClientUi.make_field("Annotation note")
	audit.add_child(_audit_note)
	var ann := _btn("Annotate Entry")
	ann.pressed.connect(func() -> void:
		if _audit_entry_id.text.strip_edges().is_empty() or _audit_note.text.strip_edges().is_empty():
			_set_feedback("entry id and note required.", "err")
			return
		_confirm("Annotate audit entry?", _audit_note.text, func() -> void:
			_run("Annotating…", func() -> Dictionary:
				return await AdminManager.audit_annotate(_audit_entry_id.text.strip_edges(), _audit_note.text.strip_edges())
			)
		)
	)
	audit.add_child(ann)
	_audit_list = VBoxContainer.new()
	audit.add_child(_audit_list)

	var other := _col()
	grid.add_child(other)
	other.add_child(_subhead("EMAIL"))
	var load_e := _btn("Load Email Log", true)
	load_e.pressed.connect(func() -> void:
		_run("Loading email log…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.email_log(EMAIL_LOG_LIMIT)
			_fill_kv_list(_email_list, res)
			return res
		)
	)
	other.add_child(load_e)
	var test := _btn("Send Test Email")
	test.pressed.connect(func() -> void:
		_run("Sending test email…", func() -> Dictionary: return await AdminManager.email_test())
	)
	other.add_child(test)
	_email_list = VBoxContainer.new()
	other.add_child(_email_list)

	other.add_child(_subhead("REWARD CLAIMS"))
	_reward_claim_id = ClientUi.make_field("claim id for detail / retry")
	other.add_child(_reward_claim_id)
	var rrow2 := HBoxContainer.new()
	rrow2.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	other.add_child(rrow2)
	var get_claim := _btn("Get Claim")
	get_claim.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	get_claim.pressed.connect(func() -> void:
		if _reward_claim_id.text.strip_edges().is_empty():
			_set_feedback("claim id required.", "err")
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
			_set_feedback("claim id and reason required.", "err")
			return
		_confirm("Retry reward delivery?", _reward_claim_id.text, func() -> void:
			_run("Retrying delivery…", func() -> Dictionary:
				return await AdminManager.rewards_retry(_reward_claim_id.text.strip_edges(), {"reason": _why()})
			)
		)
	)
	rrow2.add_child(retry)
	var search_r := _btn("Search Recent Claims")
	search_r.pressed.connect(func() -> void:
		_run("Searching rewards…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.rewards_search({"limit": str(REWARDS_SEARCH_LIMIT)})
			_fill_kv_list(_reward_list, res)
			return res
		)
	)
	other.add_child(search_r)
	var audit_r := _btn("Recent Reward Audit")
	audit_r.pressed.connect(func() -> void:
		_run("Loading reward audit…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.rewards_audit({"limit": str(REWARDS_SEARCH_LIMIT)})
			_fill_kv_list(_reward_list, res)
			return res
		)
	)
	other.add_child(audit_r)
	_reward_list = VBoxContainer.new()
	other.add_child(_reward_list)
	_add_tab("logs", wrap)


# ─── System ────────────────────────────────────────────────

func _build_system() -> void:
	var wrap := _col()
	wrap.add_child(ClientUi.make_section_header("SYSTEM", "Maintenance · Flags · Integrity · Schedules", "Destructive applies stay confirmed. Uses selected character for integrity/repair."))
	wrap.add_child(_make_target_picker(false))
	var grid := _grid()
	wrap.add_child(grid)

	var left := _col()
	grid.add_child(left)
	left.add_child(_subhead("MAINTENANCE", ClientUi.DANGER))
	var maint_on := _btn("Enable Maintenance", false, true)
	maint_on.pressed.connect(func() -> void:
		if _why().is_empty():
			_set_feedback("Reason required.", "err")
			return
		_confirm("Enable maintenance mode?", "Players blocked from writes.\nReason: %s" % _why(), func() -> void:
			_run("Enabling maintenance…", func() -> Dictionary:
				return await AdminManager.set_maintenance_mode(true, "Temporary maintenance", _why())
			)
		)
	)
	left.add_child(maint_on)
	var maint_off := _accent_btn("Disable Maintenance", ClientUi.SUCCESS)
	maint_off.pressed.connect(func() -> void:
		if _why().is_empty():
			_set_feedback("Reason required.", "err")
			return
		_confirm("Disable maintenance mode?", "Reason: %s" % _why(), func() -> void:
			_run("Disabling maintenance…", func() -> Dictionary:
				return await AdminManager.set_maintenance_mode(false, "", _why())
			)
		)
	)
	left.add_child(maint_off)

	left.add_child(_subhead("FEATURE FLAGS"))
	var flag_row := HBoxContainer.new()
	flag_row.add_theme_constant_override("separation", ROW_SEPARATION_PX)
	left.add_child(flag_row)
	_flag_name = LineEdit.new()
	_flag_name.placeholder_text = "feature_flag (e.g. casino_enabled)"
	_flag_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	flag_row.add_child(_flag_name)
	var flag_on := _btn("Flag ON")
	flag_on.pressed.connect(func() -> void:
		if _flag_name.text.strip_edges().is_empty() or _why().is_empty():
			_set_feedback("flag name and reason required.", "err")
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
			_set_feedback("flag name and reason required.", "err")
			return
		_confirm("Disable feature flag?", "%s\nReason: %s" % [_flag_name.text, _why()], func() -> void:
			_run("Clearing flag…", func() -> Dictionary:
				return await AdminManager.set_feature_flag(_flag_name.text.strip_edges(), false, _why())
			)
		)
	)
	flag_row.add_child(flag_off)

	left.add_child(_subhead("SCHEDULES"))
	var load_s := _btn("Load Schedules", true)
	load_s.pressed.connect(func() -> void:
		_run("Loading schedules…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.schedules_list()
			_fill_schedule_list(res)
			return res
		)
	)
	left.add_child(load_s)
	var tick := _btn("Manual Tick")
	tick.pressed.connect(func() -> void:
		_confirm("Run schedule tick?", "Executes due jobs now.", func() -> void:
			_run("Ticking…", func() -> Dictionary: return await AdminManager.schedules_tick())
		)
	)
	left.add_child(tick)
	var audit_s := _btn("Load Schedule Audit")
	audit_s.pressed.connect(func() -> void:
		_run("Loading schedule audit…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.schedules_audit(SCHEDULE_AUDIT_LIMIT)
			_fill_kv_list(_sched_audit_list, res)
			return res
		)
	)
	left.add_child(audit_s)
	_sched_list = VBoxContainer.new()
	left.add_child(_sched_list)
	_sched_audit_list = VBoxContainer.new()
	left.add_child(_sched_audit_list)

	var right := _col()
	grid.add_child(right)
	_system_out = RichTextLabel.new()
	_system_out.bbcode_enabled = true
	_system_out.fit_content = true
	_system_out.scroll_active = false
	_system_out.text = "Integrity, repair, and migration results appear here."
	right.add_child(_system_out)
	right.add_child(_subhead("INTEGRITY / REPAIR", ClientUi.WARNING))
	var audit_btn := _btn("Integrity Audit (selected character)", true)
	audit_btn.pressed.connect(func() -> void:
		if _cid().is_empty():
			_set_feedback("character_id required.", "err")
			return
		_run("Running integrity audit…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.run_integrity_audit(_cid(), "", false)
			if res.ok:
				_write_json_panel(_system_out, "Integrity audit", res.data)
			return res
		)
	)
	right.add_child(audit_btn)
	_repair_type = _option(REPAIR_TYPE_IDS, 0)
	right.add_child(_repair_type)
	var dry := _btn("Dry-Run Repair")
	dry.pressed.connect(func() -> void:
		if _cid().is_empty():
			_set_feedback("character_id required.", "err")
			return
		_run("Dry-run repair…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.apply_data_repair(
				_repair_type.get_item_text(_repair_type.selected), _cid(), false
			)
			if res.ok:
				_write_json_panel(_system_out, "Repair dry-run", res.data)
			return res
		)
	)
	right.add_child(dry)
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
					_write_json_panel(_system_out, "Repair applied", res.data)
				return res
			)
		)
	)
	right.add_child(apply_r)

	right.add_child(_subhead("MIGRATION", ClientUi.DANGER))
	_migration_id = ClientUi.make_field("migration_id (e.g. integrity_framework_v1)")
	right.add_child(_migration_id)
	var mig_dry := _btn("Dry-Run Migration")
	mig_dry.pressed.connect(func() -> void:
		if _migration_id.text.strip_edges().is_empty():
			_set_feedback("migration_id required.", "err")
			return
		_run("Dry-run migration…", func() -> Dictionary:
			var res: Dictionary = await AdminManager.run_migration(_migration_id.text.strip_edges(), false)
			if res.ok:
				_write_json_panel(_system_out, "Migration dry-run", res.data)
			return res
		)
	)
	right.add_child(mig_dry)
	var mig_apply := _btn("Apply Migration", false, true)
	mig_apply.pressed.connect(func() -> void:
		if _migration_id.text.strip_edges().is_empty() or _why().is_empty():
			_set_feedback("migration_id and reason required.", "err")
			return
		_confirm("APPLY MIGRATION?", "%s\nEnv: %s\nReason: %s\nIrreversible without restore." % [
			_migration_id.text,
			BackendEnvironment.get_environment_id() if BackendEnvironment else "?",
			_why(),
		], func() -> void:
			_run("Applying migration…", func() -> Dictionary:
				var res: Dictionary = await AdminManager.run_migration(_migration_id.text.strip_edges(), true)
				if res.ok:
					_write_json_panel(_system_out, "Migration applied", res.data)
				return res
			)
		)
	)
	right.add_child(mig_apply)
	var wipe := Label.new()
	wipe.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	wipe.text = "Server Refresh wipe is intentionally not exposed. Unconstrained wipe is rejected by the API."
	wipe.add_theme_color_override("font_color", ClientUi.WARNING)
	right.add_child(wipe)
	_add_tab("system", wrap, true)


func _write_json_panel(target: RichTextLabel, title: String, data: Variant) -> void:
	if target == null:
		return
	target.text = "[b]%s[/b]\n%s" % [title, JSON.stringify(data).substr(0, OPS_JSON_PREVIEW_LENGTH)]


func _fill_schedule_list(res: Dictionary) -> void:
	_clear_host(_sched_list)
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
			str(row.get("id", "")).substr(0, ID_PREVIEW_LENGTH),
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


func _fill_kv_list(host: VBoxContainer, res: Dictionary) -> void:
	_clear_host(host)
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
		if n >= KV_LIST_ROW_CAP:
			break
		n += 1
		var lab := Label.new()
		lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		if typeof(row) == TYPE_DICTIONARY:
			lab.text = str(row.get("id", row.get("action", row.get("code", row))))
			if row.has("action"):
				lab.text = "%s · %s" % [
					str(row.get("action")),
					str(row.get("id", "")).substr(0, AUDIT_ID_PREVIEW_LENGTH),
				]
			elif row.has("status"):
				lab.text = "%s · %s" % [
					str(row.get("status")),
					str(row.get("id", "")).substr(0, AUDIT_ID_PREVIEW_LENGTH),
				]
		else:
			lab.text = str(row)
		host.add_child(lab)
