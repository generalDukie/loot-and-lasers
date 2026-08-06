extends Control
## Settings — mirrors web SettingsPage (account · audio · display · promo · danger).

var _status: Label
var _fullscreen: CheckButton
var _api: LineEdit
var _cur_pw: LineEdit
var _new_pw: LineEdit
var _confirm_pw: LineEdit
var _promo: LineEdit
var _rename: LineEdit
var _legacy: LineEdit
var _busy := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 10)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(scroll)

	var outer := VBoxContainer.new()
	outer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_theme_constant_override("separation", 8)
	scroll.add_child(outer)

	# Web SettingsPage: max-w-5xl centered sheet.
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_child(center)
	var sheet := VBoxContainer.new()
	sheet.custom_minimum_size.x = 1227
	sheet.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sheet.add_theme_constant_override("separation", 8)
	center.add_child(sheet)

	sheet.add_child(UiIcon.make_title_row("settings", "Settings", ClientUi.TEXT, 27, 28.0))

	_status = ClientUi.make_status()
	sheet.add_child(_status)

	# Web SettingsPage: account left, stacked utility column right (max ~22rem).
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 12)
	columns.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sheet.add_child(columns)

	var account_panel := _panel_wrap(_build_account())
	account_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	account_panel.size_flags_stretch_ratio = 1.0
	columns.add_child(account_panel)

	var utility := VBoxContainer.new()
	utility.custom_minimum_size.x = 480
	utility.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	utility.size_flags_stretch_ratio = 0.42
	utility.add_theme_constant_override("separation", 10)
	columns.add_child(utility)
	utility.add_child(_panel_wrap(_build_character_switcher()))
	utility.add_child(_panel_wrap(_build_audio()))
	utility.add_child(_panel_wrap(_build_display()))
	utility.add_child(_build_codex_link())
	utility.add_child(_panel_wrap(_build_promo()))

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	outer.add_child(back)


func _panel_wrap(inner: Control) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.96), Color(ClientUi.CYAN, 0.35), 12, 1
	))
	panel.add_child(inner)
	return panel


func _section_title(text: String) -> Control:
	return ClientUi.make_section_header(text, text.capitalize(), "")


func _build_account() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(_section_title("ACCOUNT"))

	col.add_child(ClientUi.make_section_header("", "Linked Email", "Email is tied to your account and can't be changed."))
	var email := LineEdit.new()
	email.text = str(AuthManager.user.get("email", "—"))
	email.editable = false
	email.custom_minimum_size.y = 53
	ClientUi.apply_body_font(email)
	col.add_child(email)

	col.add_child(ClientUi.make_section_header("", "Change Password", ""))
	_cur_pw = ClientUi.make_field("Current password", true)
	col.add_child(_cur_pw)
	_new_pw = ClientUi.make_field("New password", true)
	col.add_child(_new_pw)
	_confirm_pw = ClientUi.make_field("Confirm new password", true)
	col.add_child(_confirm_pw)
	var chg := Button.new()
	chg.text = "Update Password"
	ClientUi.apply_primary_button(chg)
	chg.pressed.connect(_on_change_password)
	col.add_child(chg)

	var existing_legacy := LegacyName.clean_text(AuthManager.user.get("legacy_name", ""))
	if not existing_legacy.is_empty():
		col.add_child(ClientUi.make_section_header("", "Legacy on Profile", "Locked surname: %s" % existing_legacy))
		var mode_row := HBoxContainer.new()
		mode_row.add_theme_constant_override("separation", 8)
		col.add_child(mode_row)
		var cur_mode := LegacyName.normalize_display(
			GameManager.active_character.get("legacy_display", AuthManager.user.get("legacy_display", "surname"))
		)
		for pair in [["As surname", "surname"], ["Family only", "family"]]:
			var mb := Button.new()
			mb.text = str(pair[0])
			mb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			if cur_mode == str(pair[1]):
				ClientUi.apply_primary_button(mb)
			else:
				ClientUi.apply_ghost_button(mb)
			var mode := str(pair[1])
			mb.pressed.connect(func() -> void: _on_legacy_display(mode))
			mode_row.add_child(mb)
		var mode_help := Label.new()
		mode_help.text = "As surname: shown after your operative name everywhere — HUD, lists, chat.\nFamily only: just your first name in HUD and lists; \"%s\" under your hero gear.\nEither way, other players still see your family on public profiles." % LegacyName.family_label(existing_legacy)
		mode_help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		mode_help.add_theme_font_size_override("font_size", 13)
		mode_help.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(mode_help)
		col.add_child(mode_help)

	col.add_child(ClientUi.make_section_header("", "Change Operative Name", "Letters only — no numbers. Cost: 500 Nova."))
	_rename = ClientUi.make_field("New operative name")
	col.add_child(_rename)
	var rename_btn := Button.new()
	rename_btn.text = "Rename"
	ClientUi.apply_primary_button(rename_btn)
	rename_btn.pressed.connect(_on_rename)
	col.add_child(rename_btn)

	if existing_legacy.is_empty():
		_legacy = ClientUi.make_field("Legacy name (set once, no digits)")
		col.add_child(_legacy)
		var legacy_btn := Button.new()
		legacy_btn.text = "Set Legacy Name"
		ClientUi.apply_ghost_button(legacy_btn)
		legacy_btn.pressed.connect(_on_legacy)
		col.add_child(legacy_btn)
	else:
		_legacy = ClientUi.make_field("Legacy name")
		_legacy.text = existing_legacy
		_legacy.editable = false
		col.add_child(_legacy)

	var spacer := Control.new()
	spacer.custom_minimum_size.y = 11
	col.add_child(spacer)
	col.add_child(_build_danger())

	return col


func _build_character_switcher() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	var character := GameManager.active_character
	col.add_child(ClientUi.make_section_header("", "Operatives", "Switch active operative anytime."))
	var name := Label.new()
	name.text = "%s · Lv %s %s" % [
		str(character.get("name", "Operative")),
		str(character.get("level", 1)),
		str(character.get("class", "")),
	]
	name.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(name)
	col.add_child(name)
	var switch_btn := Button.new()
	switch_btn.text = "Switch Character"
	ClientUi.apply_ghost_button(switch_btn)
	switch_btn.pressed.connect(func() -> void: GameManager.go_character_select())
	col.add_child(switch_btn)
	return col


func _build_audio() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 12)
	col.add_child(_section_title("AUDIO"))

	col.add_child(_volume_row("Master Volume", "volume-2", SettingsManager.master_volume, func(v: float) -> void:
		SettingsManager.set_master_volume(v, false)
	))
	col.add_child(_volume_row("Music Volume", "music", SettingsManager.music_volume, func(v: float) -> void:
		SettingsManager.set_music_volume(v, false)
	))
	col.add_child(_volume_row("SFX Volume", "zap", SettingsManager.sfx_volume, func(v: float) -> void:
		SettingsManager.set_sfx_volume(v, false)
	, true))

	var play_bg := CheckButton.new()
	play_bg.text = "Play music when unfocused"
	play_bg.button_pressed = SettingsManager.play_music_when_unfocused
	play_bg.toggled.connect(func(on: bool) -> void:
		SettingsManager.set_play_music_when_unfocused(on, true)
	)
	col.add_child(play_bg)

	var tip := Label.new()
	tip.text = "Station ambience and cantina music use Music. Combat / UI cues use SFX."
	tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tip.add_theme_font_size_override("font_size", 15)
	tip.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(tip)
	col.add_child(tip)
	return col


func _build_display() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	col.add_child(_section_title("DISPLAY"))
	var hint := Label.new()
	hint.text = "Logical design is 2560×1440 (16:9). The window fits your screen; Godot scales the full UI uniformly (letterbox/pillarbox). Press F11 for fullscreen."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.add_theme_font_size_override("font_size", 15)
	hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(hint)
	col.add_child(hint)
	_fullscreen = CheckButton.new()
	_fullscreen.text = "Fullscreen"
	_fullscreen.button_pressed = SettingsManager.fullscreen
	_fullscreen.toggled.connect(func(on: bool) -> void:
		SettingsManager.set_window_mode("fullscreen" if on else "maximized", true)
		_fullscreen.button_pressed = SettingsManager.fullscreen
	)
	col.add_child(_fullscreen)

	var vsync_btn := CheckButton.new()
	vsync_btn.text = "VSync"
	vsync_btn.button_pressed = SettingsManager.vsync
	vsync_btn.toggled.connect(func(on: bool) -> void:
		SettingsManager.vsync = on
		SettingsManager.apply_settings()
		SettingsManager.save_settings()
	)
	col.add_child(vsync_btn)

	col.add_child(ClientUi.make_section_header("", "Accessibility", "Presentation only — does not change combat math."))
	var speed_norm := clampf((SettingsManager.combat_anim_speed - 0.35) / 1.65, 0.0, 1.0)
	col.add_child(_volume_row("Combat animation speed", "clock", speed_norm, func(v: float) -> void:
		SettingsManager.set_combat_anim_speed(0.35 + clampf(v, 0.0, 1.0) * 1.65, true)
	))
	col.add_child(_volume_row("Screen shake", "vibrate", SettingsManager.screen_shake_scale, func(v: float) -> void:
		SettingsManager.set_screen_shake_scale(v, true)
	, true))

	var fs_hint := Label.new()
	fs_hint.text = "Tip: press F11 anytime to toggle fullscreen (including from the editor Play window)."
	fs_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	fs_hint.add_theme_font_size_override("font_size", 15)
	fs_hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(fs_hint)
	col.add_child(fs_hint)

	var save_local := Button.new()
	save_local.text = "Apply Display"
	ClientUi.apply_ghost_button(save_local)
	save_local.pressed.connect(func() -> void:
		SettingsManager.save_settings()
		_status.text = "Local settings saved."
	)
	col.add_child(save_local)

	col.add_child(ClientUi.make_section_header("", "Self-host API", "Developer override."))
	_api = ClientUi.make_field("API base URL")
	_api.text = GameApiClient.base_url
	col.add_child(_api)
	var save_api := Button.new()
	save_api.text = "Apply API URL"
	ClientUi.apply_ghost_button(save_api)
	save_api.pressed.connect(func() -> void:
		GameApiClient.set_base_url(_api.text.strip_edges())
		_status.text = "API → %s" % GameApiClient.base_url
	)
	col.add_child(save_api)
	return col


func _build_codex_link() -> PanelContainer:
	var row_panel := PanelContainer.new()
	row_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.96), Color(ClientUi.CYAN, 0.35), 12, 1
	))
	var btn := Button.new()
	btn.flat = true
	btn.custom_minimum_size = Vector2(0, 69)
	btn.pressed.connect(func() -> void: GameManager.go_codex())
	row_panel.add_child(btn)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	btn.add_child(row)
	var icon_box := PanelContainer.new()
	icon_box.custom_minimum_size = Vector2(43, 43)
	icon_box.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(ClientUi.CYAN, 0.1), Color(ClientUi.CYAN, 0.25), 8, 1
	))
	row.add_child(icon_box)
	var icon_center := CenterContainer.new()
	icon_box.add_child(icon_center)
	icon_center.add_child(UiIcon.make("book-open", ClientUi.CYAN, 22.0))
	var text_col := VBoxContainer.new()
	text_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text_col.add_theme_constant_override("separation", 2)
	row.add_child(text_col)
	var title := Label.new()
	title.text = "Codex & Guide"
	title.add_theme_font_size_override("font_size", 19)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	text_col.add_child(title)
	var hint := Label.new()
	hint.text = "How things work · New player tutorial"
	hint.add_theme_font_size_override("font_size", 15)
	hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(hint)
	text_col.add_child(hint)
	return row_panel


func _build_promo() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(ClientUi.make_section_header("PROMO", "Promo Code", ""))
	_promo = ClientUi.make_field("Enter code")
	col.add_child(_promo)
	var promo_btn := Button.new()
	promo_btn.text = "Redeem"
	ClientUi.apply_primary_button(promo_btn)
	promo_btn.pressed.connect(_on_promo)
	col.add_child(promo_btn)
	return col


func _build_danger() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.55), Color(0.28, 0.36, 0.48, 0.35), 12, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	panel.add_child(col)

	var logout_row := _danger_row(
		"Log Out",
		"Sign out of your account",
		false,
		func() -> void:
			await AuthManager.logout()
			GameManager.go_login()
	)
	col.add_child(logout_row)

	var sep := ColorRect.new()
	sep.custom_minimum_size = Vector2(0, 1)
	sep.color = Color(0.28, 0.36, 0.48, 0.35)
	col.add_child(sep)

	var del_row := _danger_row(
		"Delete Character",
		"Permanently erase your operative and all progress",
		true,
		_on_delete_char
	)
	col.add_child(del_row)
	return panel


func _danger_row(title: String, hint: String, destructive: bool, on_press: Callable) -> Button:
	var btn := Button.new()
	btn.flat = true
	btn.custom_minimum_size = Vector2(0, 75)
	btn.pressed.connect(on_press)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	btn.add_child(row)
	var icon := UiIcon.make("trash-2" if destructive else "undo-2", ClientUi.DANGER if destructive else ClientUi.MUTED, 21.0)
	row.add_child(icon)
	var text_col := VBoxContainer.new()
	text_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text_col.add_theme_constant_override("separation", 2)
	row.add_child(text_col)
	var t := Label.new()
	t.text = title
	t.add_theme_font_size_override("font_size", 19)
	t.add_theme_color_override("font_color", ClientUi.DANGER if destructive else ClientUi.TEXT)
	ClientUi.apply_body_font(t)
	text_col.add_child(t)
	var h := Label.new()
	h.text = hint
	h.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	h.add_theme_font_size_override("font_size", 15)
	h.add_theme_color_override("font_color", Color(ClientUi.DANGER, 0.7) if destructive else ClientUi.MUTED)
	ClientUi.apply_body_font(h)
	text_col.add_child(h)
	return btn


func _volume_row(label: String, icon_id: String, value: float, on_change: Callable, preview_sfx: bool = false) -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrap.add_theme_constant_override("separation", 4)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	wrap.add_child(head)

	head.add_child(UiIcon.make(icon_id, ClientUi.CYAN, 19.0))

	var lab := Label.new()
	lab.text = label
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.add_theme_font_size_override("font_size", 16)
	lab.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(lab)
	head.add_child(lab)

	var pct := Label.new()
	pct.text = "%d" % int(round(value * 100.0))
	pct.custom_minimum_size.x = 48
	pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	pct.add_theme_font_size_override("font_size", 15)
	pct.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(pct)
	head.add_child(pct)

	var s := HSlider.new()
	s.min_value = 0.0
	s.max_value = 1.0
	s.step = 0.01
	s.value = clampf(value, 0.0, 1.0)
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.custom_minimum_size = Vector2(0, 29)
	s.focus_mode = Control.FOCUS_ALL
	s.mouse_filter = Control.MOUSE_FILTER_STOP
	s.value_changed.connect(func(v: float) -> void:
		pct.text = "%d" % int(round(v * 100.0))
		if on_change.is_valid():
			on_change.call(v)
	)
	s.drag_ended.connect(func(_changed: bool) -> void:
		SettingsManager.save_settings()
		if preview_sfx:
			AudioManager.play_ui("click")
	)
	wrap.add_child(s)
	return wrap


func _on_change_password() -> void:
	if _busy:
		return
	if _new_pw.text.length() < 6:
		_status.text = "New password must be at least 6 characters."
		return
	if _new_pw.text != _confirm_pw.text:
		_status.text = "New password and confirmation differ."
		return
	_busy = true
	_status.text = "Updating…"
	var res: Dictionary = await AuthManager.change_password(_cur_pw.text, _new_pw.text)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Change password failed"))
		return
	_status.text = "Password updated."
	_cur_pw.text = ""
	_new_pw.text = ""
	_confirm_pw.text = ""


func _on_promo() -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await AccountManager.redeem_promo(_promo.text)
	_busy = false
	_status.text = "Promo redeemed." if res.ok else str(res.get("error", "Redeem failed"))


func _on_rename() -> void:
	if _busy:
		return
	var new_name := _rename.text.strip_edges()
	if new_name.find(" ") >= 0 or new_name.find("\t") >= 0:
		_status.text = "Names cannot contain spaces"
		return
	_busy = true
	var res: Dictionary = await AccountManager.rename_character(new_name, true)
	_busy = false
	_status.text = "Renamed to %s" % GameManager.active_character.get("name", "?") if res.ok else str(res.get("error", "Rename failed"))


func _on_legacy() -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await AccountManager.set_legacy_name(_legacy.text)
	_busy = false
	_status.text = "Legacy name set." if res.ok else str(res.get("error", "Failed"))
	if res.ok:
		_legacy.editable = false


func _on_legacy_display(mode: String) -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await AccountManager.set_legacy_display(mode)
	_busy = false
	if res.ok:
		GameManager.active_character["legacy_display"] = LegacyName.normalize_display(mode)
		_status.text = "Legacy display → %s" % LegacyName.normalize_display(mode)
	else:
		_status.text = str(res.get("error", "Display mode failed"))


func _on_delete_char() -> void:
	if _busy:
		return
	var c: Dictionary = GameManager.active_character
	var cid := str(c.get("id", ""))
	if cid.is_empty():
		_status.text = "No active character."
		return
	_busy = true
	_status.text = "Purging…"
	var res: Dictionary = await AccountManager.purge_and_delete_character(cid, str(c.get("name", "")))
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Delete failed"))
		return
	_status.text = "Character deleted."
	GameManager.go_character_select()
