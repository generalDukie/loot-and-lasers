extends Control
## Admin — AdminModeration + entitlements grant/revoke.

var _status: Label
var _char_id: LineEdit
var _reason: LineEdit
var _minutes: SpinBox
var _delta_sd: SpinBox
var _delta_nova: SpinBox
var _account_id: LineEdit
var _ent_key: LineEdit
var _ent_qty: SpinBox
var _revoke_id: LineEdit
var _tabs: HBoxContainer
var _tab_bodies: Dictionary = {}
var _active_tab := "reports"
var _pending_report_id := ""
var _busy := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	var role := str(AuthManager.user.get("role", "user"))
	if role != "admin":
		_status.text = "Admin role required (you are '%s')." % role


func _panel(inner: Control, danger := false) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.96),
		Color(ClientUi.DANGER, 0.4) if danger else Color(ClientUi.CYAN, 0.35),
		12, 2
	))
	panel.add_child(inner)
	return panel


func _show_tab(id: String) -> void:
	_active_tab = id
	for key in _tab_bodies.keys():
		var node: Control = _tab_bodies[key]
		node.visible = key == id
	var i := 0
	var ids := ["reports", "moderation", "entitlements", "tools", "mail", "economy"]
	for child in _tabs.get_children():
		if child is Button:
			if i < ids.size() and ids[i] == id:
				ClientUi.apply_primary_button(child)
			else:
				ClientUi.apply_ghost_button(child)
			i += 1


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 18)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var outer := VBoxContainer.new()
	outer.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	outer.add_theme_constant_override("separation", 10)
	margin.add_child(outer)

	var head := VBoxContainer.new()
	head.add_theme_constant_override("separation", 2)
	outer.add_child(head)
	var eye := Label.new()
	eye.text = "OPS CONSOLE"
	eye.add_theme_font_size_override("font_size", 13)
	eye.add_theme_color_override("font_color", Color(ClientUi.DANGER, 0.85))
	ClientUi.apply_display_font(eye)
	head.add_child(eye)
	var title := Label.new()
	title.text = "🛡  Admin"
	title.add_theme_font_size_override("font_size", 29)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	head.add_child(title)

	# Web AdminPage: horizontal tab strip.
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 4)
	outer.add_child(_tabs)
	for pair in [
		["Reports", "reports"], ["Players", "moderation"], ["Entitlements", "entitlements"],
		["Tools", "tools"], ["Mail", "mail"], ["Economy", "economy"],
	]:
		var tb := Button.new()
		tb.text = str(pair[0])
		tb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(tb)
		var tid := str(pair[1])
		tb.pressed.connect(func() -> void: _show_tab(tid))
		_tabs.add_child(tb)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_child(scroll)
	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 12)
	scroll.add_child(root)

	# —— Moderation (Players) ——
	var mod := VBoxContainer.new()
	mod.add_theme_constant_override("separation", 8)
	mod.add_child(ClientUi.make_section_header("MODERATION", "Mute · Ban · Currency", "Target by character_id + reason."))
	_char_id = ClientUi.make_field("Target character_id")
	mod.add_child(_char_id)
	_reason = ClientUi.make_field("Reason")
	mod.add_child(_reason)

	var mute_row := HBoxContainer.new()
	mute_row.add_theme_constant_override("separation", 8)
	mod.add_child(mute_row)
	_minutes = SpinBox.new()
	_minutes.min_value = 1
	_minutes.max_value = 1440
	_minutes.value = 30
	mute_row.add_child(_minutes)
	var mute := Button.new()
	mute.text = "Mute (minutes)"
	ClientUi.apply_primary_button(mute)
	mute.pressed.connect(func() -> void: _act({
		"action": "mute",
		"character_id": _char_id.text.strip_edges(),
		"minutes": int(_minutes.value),
		"reason": _reason.text,
	}))
	mute_row.add_child(mute)

	var row2 := HBoxContainer.new()
	row2.add_theme_constant_override("separation", 8)
	mod.add_child(row2)
	for pair in [["Ban", "ban"], ["Unban", "unban"], ["Unmute", "unmute"]]:
		var b := Button.new()
		b.text = str(pair[0])
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(b)
		var act: String = str(pair[1])
		b.pressed.connect(func() -> void: _act({
			"action": act,
			"character_id": _char_id.text.strip_edges(),
			"reason": _reason.text,
		}))
		row2.add_child(b)

	mod.add_child(ClientUi.make_section_header("", "Currency Deltas", ""))
	var crow := HBoxContainer.new()
	crow.add_theme_constant_override("separation", 8)
	mod.add_child(crow)
	_delta_sd = SpinBox.new()
	_delta_sd.min_value = -1000000
	_delta_sd.max_value = 1000000
	_delta_sd.value = 0
	_delta_sd.prefix = "SD "
	crow.add_child(_delta_sd)
	_delta_nova = SpinBox.new()
	_delta_nova.min_value = -10000
	_delta_nova.max_value = 10000
	_delta_nova.value = 0
	_delta_nova.prefix = "Nova "
	crow.add_child(_delta_nova)
	var adj := Button.new()
	adj.text = "Adjust Currency"
	ClientUi.apply_primary_button(adj)
	adj.pressed.connect(func() -> void: _act({
		"action": "adjust_currency",
		"character_id": _char_id.text.strip_edges(),
		"reason": _reason.text,
		"deltas": {
			"stardust": int(_delta_sd.value),
			"nova_crystals": int(_delta_nova.value),
		},
	}))
	mod.add_child(adj)

	var mail := Button.new()
	mail.text = "Send System Mail to Active Char"
	ClientUi.apply_ghost_button(mail)
	mail.pressed.connect(func() -> void:
		var cid := str(GameManager.active_character.get("id", ""))
		_act({
			"action": "send_system_mail",
			"subject": "Admin notice",
			"body": _reason.text if not _reason.text.is_empty() else "Hello from admin.",
			"recipients": [cid],
			"reason": "godot-admin",
		})
	)
	mod.add_child(mail)
	var mod_panel := _panel(mod, true)
	root.add_child(mod_panel)
	_tab_bodies["moderation"] = mod_panel

	# —— Entitlements ——
	var ents := VBoxContainer.new()
	ents.add_theme_constant_override("separation", 8)
	ents.add_child(ClientUi.make_section_header("ENTITLEMENTS", "Grant / Revoke", ""))
	_account_id = ClientUi.make_field("accountId (user id)")
	_account_id.text = str(AuthManager.user.get("id", ""))
	ents.add_child(_account_id)
	_ent_key = ClientUi.make_field("entitlementKey (e.g. account.character_slot)")
	_ent_key.text = "account.rename_token"
	ents.add_child(_ent_key)
	_ent_qty = SpinBox.new()
	_ent_qty.min_value = 1
	_ent_qty.max_value = 99
	_ent_qty.value = 1
	ents.add_child(_ent_qty)
	var grant := Button.new()
	grant.text = "Grant Entitlement"
	ClientUi.apply_primary_button(grant)
	grant.pressed.connect(_on_grant)
	ents.add_child(grant)

	_revoke_id = ClientUi.make_field("Entitlement record id to revoke")
	ents.add_child(_revoke_id)
	var revoke := Button.new()
	revoke.text = "Revoke Entitlement"
	ClientUi.apply_danger_button(revoke)
	revoke.pressed.connect(_on_revoke)
	ents.add_child(revoke)

	var search := Button.new()
	search.text = "Search Entitlements for Account"
	ClientUi.apply_ghost_button(search)
	search.pressed.connect(_on_search)
	ents.add_child(search)
	var ents_panel := _panel(ents)
	root.add_child(ents_panel)
	_tab_bodies["entitlements"] = ents_panel

	# —— Tools ——
	var tools := VBoxContainer.new()
	tools.add_theme_constant_override("separation", 8)
	tools.add_child(ClientUi.make_section_header("TOOLS", "Search · Gear", ""))
	var find_row := HBoxContainer.new()
	find_row.add_theme_constant_override("separation", 8)
	tools.add_child(find_row)
	var find_name := ClientUi.make_field("Search character name")
	find_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	find_row.add_child(find_name)
	var find_btn := Button.new()
	find_btn.text = "Find"
	ClientUi.apply_primary_button(find_btn)
	find_btn.pressed.connect(func() -> void: _on_find_character(find_name.text))
	find_row.add_child(find_btn)

	var grant_gear := Button.new()
	grant_gear.text = "Give Random Rare Gear to Target"
	ClientUi.apply_primary_button(grant_gear)
	grant_gear.pressed.connect(_on_give_item)
	tools.add_child(grant_gear)
	var tools_panel := _panel(tools)
	root.add_child(tools_panel)
	_tab_bodies["tools"] = tools_panel

	# —— Reports ——
	var reports := VBoxContainer.new()
	reports.add_theme_constant_override("separation", 8)
	reports.add_child(ClientUi.make_section_header("REPORTS", "Open queue", ""))
	var reports_btn := Button.new()
	reports_btn.text = "Load Open Reports"
	ClientUi.apply_primary_button(reports_btn)
	reports_btn.pressed.connect(_on_load_reports)
	reports.add_child(reports_btn)
	var resolve_btn := Button.new()
	resolve_btn.text = "Resolve First Loaded Report"
	ClientUi.apply_ghost_button(resolve_btn)
	resolve_btn.pressed.connect(func() -> void: _on_resolve_report())
	reports.add_child(resolve_btn)
	var reports_panel := _panel(reports)
	root.add_child(reports_panel)
	_tab_bodies["reports"] = reports_panel

	# —— Mail ——
	var mail_tab := VBoxContainer.new()
	mail_tab.add_theme_constant_override("separation", 8)
	mail_tab.add_child(ClientUi.make_section_header("MAIL", "System notices", "Uses reason field as body when present."))
	var mail_btn := Button.new()
	mail_btn.text = "Send System Mail to Active Char"
	ClientUi.apply_primary_button(mail_btn)
	mail_btn.pressed.connect(func() -> void:
		var cid := str(GameManager.active_character.get("id", ""))
		_act({
			"action": "send_system_mail",
			"subject": "Admin notice",
			"body": _reason.text if not _reason.text.is_empty() else "Hello from admin.",
			"recipients": [cid],
			"reason": "godot-admin",
		})
	)
	mail_tab.add_child(mail_btn)
	var tip := Label.new()
	tip.text = "Set a Reason on the Players tab first — that text becomes the mail body."
	tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tip.add_theme_color_override("font_color", ClientUi.MUTED)
	mail_tab.add_child(tip)
	var mail_panel := _panel(mail_tab)
	root.add_child(mail_panel)
	_tab_bodies["mail"] = mail_panel

	# —— Economy (placeholder chrome matching web tab) ——
	var eco := VBoxContainer.new()
	eco.add_theme_constant_override("separation", 8)
	eco.add_child(ClientUi.make_section_header("ECONOMY", "Currency ops", "Use Players tab for character deltas."))
	var eco_lab := Label.new()
	eco_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	eco_lab.text = "Full economy dashboards (wipe / schedules / promo) still live on the web admin. Currency deltas and entitlements are available in the Players and Entitlements tabs."
	eco_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	eco.add_child(eco_lab)
	var eco_panel := _panel(eco)
	root.add_child(eco_panel)
	_tab_bodies["economy"] = eco_panel

	_status = ClientUi.make_status()
	outer.add_child(_status)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	outer.add_child(back)

	_show_tab("reports")


func _act(body: Dictionary) -> void:
	if _busy:
		return
	if str(AuthManager.user.get("role", "")) != "admin":
		_status.text = "Not an admin."
		return
	_busy = true
	_status.text = "Running %s…" % str(body.get("action", "?"))
	var res: Dictionary = await ApiClient.invoke("AdminModeration", body)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Failed"))
		return
	_status.text = "OK: %s" % str(body.get("action"))


func _on_grant() -> void:
	if _busy:
		return
	if str(AuthManager.user.get("role", "")) != "admin":
		_status.text = "Not an admin."
		return
	var key := _ent_key.text.strip_edges()
	var reason := _reason.text.strip_edges()
	if key.is_empty() or reason.is_empty():
		_status.text = "entitlementKey and reason required."
		return
	_busy = true
	_status.text = "Granting…"
	var body := {
		"entitlementKey": key,
		"accountId": _account_id.text.strip_edges(),
		"characterId": _char_id.text.strip_edges() if not _char_id.text.strip_edges().is_empty() else null,
		"quantity": int(_ent_qty.value),
		"reason": reason,
		"confirm": true,
	}
	# Omit null characterId for cleaner JSON
	if body["characterId"] == null or str(body["characterId"]).is_empty():
		body.erase("characterId")
	var res: Dictionary = await ApiClient.request("POST", "/api/entitlements/admin/grant", body, true)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Grant failed"))
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var ent: Variant = data.get("entitlement", data)
	var eid := ""
	if typeof(ent) == TYPE_DICTIONARY:
		eid = str(ent.get("id", ""))
	_status.text = "Granted%s" % ((" id=%s" % eid) if not eid.is_empty() else ".")


func _on_revoke() -> void:
	if _busy:
		return
	if str(AuthManager.user.get("role", "")) != "admin":
		_status.text = "Not an admin."
		return
	var eid := _revoke_id.text.strip_edges()
	var reason := _reason.text.strip_edges()
	if eid.is_empty() or reason.is_empty():
		_status.text = "entitlement id and reason required."
		return
	_busy = true
	_status.text = "Revoking…"
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entitlements/admin/%s/revoke" % eid.uri_encode(),
		{"reason": reason}, true
	)
	_busy = false
	_status.text = "Revoked." if res.ok else str(res.get("error", "Revoke failed"))


func _on_search() -> void:
	if _busy:
		return
	if str(AuthManager.user.get("role", "")) != "admin":
		_status.text = "Not an admin."
		return
	var aid := _account_id.text.strip_edges()
	if aid.is_empty():
		_status.text = "accountId required."
		return
	_busy = true
	_status.text = "Searching…"
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/entitlements/admin/search?accountId=%s&limit=20" % aid.uri_encode(), null, true
	)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Search failed"))
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var rows: Array = data.get("items", []) if typeof(data.get("items", [])) == TYPE_ARRAY else []
	var lines: PackedStringArray = []
	for r in rows:
		if typeof(r) != TYPE_DICTIONARY:
			continue
		lines.append("%s · %s · qty %s · %s" % [
			str(r.get("id", "")).substr(0, 8),
			str(r.get("entitlementKey", "?")),
			str(r.get("quantity", 1)),
			str(r.get("status", "")),
		])
	_status.text = "Found %s:\n%s" % [lines.size(), "\n".join(lines)] if not lines.is_empty() else "No entitlements found."


func _on_find_character(query: String) -> void:
	if _busy:
		return
	if str(AuthManager.user.get("role", "")) != "admin":
		_status.text = "Not an admin."
		return
	var q := query.strip_edges()
	if q.is_empty():
		_status.text = "Enter a character name."
		return
	_busy = true
	_status.text = "Searching characters…"
	var hits: Array = await SocialManager.search_characters(q)
	_busy = false
	if hits.is_empty():
		_status.text = "No character matched."
		return
	var target: Dictionary = hits[0]
	_char_id.text = str(target.get("id", ""))
	_status.text = "Found %s · id %s · Lv %s (filled target field)" % [
		str(target.get("name", "?")), str(target.get("id", "")), str(target.get("level", 1)),
	]


func _on_give_item() -> void:
	if _busy:
		return
	if str(AuthManager.user.get("role", "")) != "admin":
		_status.text = "Not an admin."
		return
	var cid := _char_id.text.strip_edges()
	var reason := _reason.text.strip_edges()
	if cid.is_empty() or reason.is_empty():
		_status.text = "character_id and reason required."
		return
	_busy = true
	_status.text = "Granting gear…"
	var res: Dictionary = await ApiClient.invoke("AdminModeration", {
		"action": "give_item",
		"character_id": cid,
		"reason": reason,
		"type": "weapon",
		"rarity": "rare",
	})
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Grant item failed"))
		return
	var item_name := "?"
	if typeof(res.data) == TYPE_DICTIONARY:
		var it: Variant = res.data.get("item", {})
		if typeof(it) == TYPE_DICTIONARY:
			item_name = str(it.get("name", "?"))
	_status.text = "Granted %s to %s." % [item_name, cid]


func _on_load_reports() -> void:
	if _busy:
		return
	if str(AuthManager.user.get("role", "")) != "admin":
		_status.text = "Not an admin."
		return
	_busy = true
	_status.text = "Loading reports…"
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entities/Report/filter",
		{"query": {"status": "open"}, "sort": "-created_date", "limit": 20}, true
	)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Reports failed"))
		return
	var rows: Array = res.data if typeof(res.data) == TYPE_ARRAY else []
	if rows.is_empty():
		_status.text = "No open reports."
		return
	var lines: PackedStringArray = []
	for r in rows:
		if typeof(r) != TYPE_DICTIONARY:
			continue
		lines.append("%s · %s · %s" % [
			str(r.get("id", "")).substr(0, 10),
			str(r.get("reason", r.get("category", "?"))),
			str(r.get("reported_name", r.get("target_name", ""))),
		])
		# Offer resolve for first report via reason field convention
	_status.text = "Open reports (%s):\n%s\nUse Resolve First after setting reason." % [
		lines.size(), "\n".join(lines),
	]
	if not rows.is_empty() and typeof(rows[0]) == TYPE_DICTIONARY:
		_pending_report_id = str(rows[0].get("id", ""))


func _on_resolve_report(report_id: String = "") -> void:
	var rid := report_id if not report_id.is_empty() else _pending_report_id
	if rid.is_empty():
		_status.text = "Load reports first."
		return
	_act({
		"action": "resolve_report",
		"report_id": rid,
		"action_taken": _reason.text.strip_edges() if not _reason.text.strip_edges().is_empty() else "resolved via Godot admin",
	})
