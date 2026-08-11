extends Control
## Settings console — categorized cards, spacious sci-fi layout.

const CARD_SEP := 14
const INNER_SEP := 12
const FIELD_H := 56
const BTN_H := 52

var _status: Label
var _saved_toast: Label
var _apply_btn: Button
var _restore_btn: Button
var _scroll: ScrollContainer
var _content: VBoxContainer

var _cur_pw: LineEdit
var _new_pw: LineEdit
var _confirm_pw: LineEdit
var _promo: LineEdit
var _rename: LineEdit
var _legacy: LineEdit
var _api: LineEdit

var _fullscreen: CheckButton
var _vsync: CheckButton
var _mute: CheckButton
var _unfocused: CheckButton

var _dirty := false
var _busy := false
var _building := false
var _slider_refs: Dictionary = {}
var _toggle_refs: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()
	modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 1.0, 0.28).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			_close_settings()
			get_viewport().set_input_as_handled()


func _close_settings() -> void:
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.16).set_trans(Tween.TRANS_SINE)
	tw.tween_callback(func() -> void: GameManager.go_hub())


func _build() -> void:
	_building = true
	_slider_refs.clear()
	_toggle_refs.clear()
	for c in get_children():
		remove_child(c)
		c.queue_free()

	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 12)
	margin.add_child(root)

	root.add_child(_build_header())

	_status = ClientUi.make_status()
	_status.visible = false
	root.add_child(_status)

	_saved_toast = Label.new()
	_saved_toast.text = "Settings Saved"
	_saved_toast.visible = false
	_saved_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_saved_toast.add_theme_font_size_override("font_size", 16)
	_saved_toast.add_theme_color_override("font_color", ClientUi.SUCCESS)
	ClientUi.apply_display_font(_saved_toast)
	root.add_child(_saved_toast)

	_scroll = ScrollContainer.new()
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(_scroll)

	_content = VBoxContainer.new()
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content.add_theme_constant_override("separation", CARD_SEP)
	_scroll.add_child(_content)

	var columns := HBoxContainer.new()
	columns.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_theme_constant_override("separation", CARD_SEP)
	_content.add_child(columns)

	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.size_flags_stretch_ratio = 1.0
	left.add_theme_constant_override("separation", CARD_SEP)
	columns.add_child(left)

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.size_flags_stretch_ratio = 1.0
	right.add_theme_constant_override("separation", CARD_SEP)
	columns.add_child(right)

	left.add_child(_card("user", "Account", "Identity & credentials", _build_account_body()))
	left.add_child(_card("users", "Character", "Active operative", _build_character_body()))
	left.add_child(_card("swords", "Gameplay", "Combat feel & accessibility", _build_gameplay_body()))

	right.add_child(_card("volume-2", "Audio", "Mix levels for the bridge", _build_audio_body()))
	right.add_child(_card("eye", "Video", "Display & presentation", _build_video_body()))
	right.add_child(_card("bell", "Notifications", "What reaches your console", _build_notifications_body()))
	right.add_child(_card("shield", "Privacy & Social", "Who can reach you", _build_privacy_body()))

	_content.add_child(_build_danger_zone())

	if OS.is_debug_build():
		_content.add_child(_card("wrench", "Developer", "Local overrides", _build_dev_body()))

	_building = false
	_set_dirty(false)


func _build_header() -> Control:
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)

	var title := UiIcon.make_title_row("settings", "Settings", ClientUi.TEXT, 30, 30.0)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)

	var codex := Button.new()
	codex.text = "Codex"
	codex.custom_minimum_size = Vector2(110, BTN_H)
	_style_ghost_btn(codex)
	codex.pressed.connect(func() -> void: GameManager.go_codex())
	head.add_child(codex)

	_restore_btn = Button.new()
	_restore_btn.text = "Restore Defaults"
	_restore_btn.custom_minimum_size = Vector2(170, BTN_H)
	_style_ghost_btn(_restore_btn)
	_restore_btn.pressed.connect(_on_restore_defaults)
	head.add_child(_restore_btn)

	_apply_btn = Button.new()
	_apply_btn.text = "Apply Changes"
	_apply_btn.custom_minimum_size = Vector2(170, BTN_H)
	_style_primary_btn(_apply_btn)
	_apply_btn.disabled = true
	_apply_btn.pressed.connect(_on_apply)
	head.add_child(_apply_btn)

	return head


func _card(icon_id: String, title: String, subtitle: String, body: Control) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.045, 0.055, 0.09, 0.94), Color(ClientUi.CYAN, 0.28), 16, 1)
	)
	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", 18)
	pad.add_theme_constant_override("margin_right", 18)
	pad.add_theme_constant_override("margin_top", 16)
	pad.add_theme_constant_override("margin_bottom", 16)
	panel.add_child(pad)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", INNER_SEP)
	pad.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	col.add_child(head)

	var icon_box := PanelContainer.new()
	icon_box.custom_minimum_size = Vector2(44, 44)
	icon_box.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(ClientUi.CYAN, 0.1), Color(ClientUi.CYAN, 0.35), 10, 1)
	)
	head.add_child(icon_box)
	var ic := CenterContainer.new()
	icon_box.add_child(ic)
	ic.add_child(UiIcon.make(icon_id, ClientUi.CYAN, 22.0))

	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 2)
	head.add_child(titles)

	var t := Label.new()
	t.text = title
	t.add_theme_font_size_override("font_size", 22)
	t.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(t)
	titles.add_child(t)

	var s := Label.new()
	s.text = subtitle
	s.add_theme_font_size_override("font_size", 14)
	s.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(s)
	titles.add_child(s)

	col.add_child(body)
	return panel


# ── Account ───────────────────────────────────────────────────

func _build_account_body() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", INNER_SEP)

	col.add_child(_field_label("Email"))
	var email := _make_field("", false)
	email.text = str(AuthManager.user.get("email", "—"))
	email.editable = false
	col.add_child(email)

	col.add_child(_field_label("Change Password"))
	_cur_pw = _make_field("Current password", true)
	col.add_child(_cur_pw)
	_new_pw = _make_field("New password", true)
	col.add_child(_new_pw)
	_confirm_pw = _make_field("Confirm new password", true)
	_confirm_pw.text_submitted.connect(func(_t: String) -> void: _on_change_password())
	col.add_child(_confirm_pw)
	var pw_btn := Button.new()
	pw_btn.text = "Update Password"
	pw_btn.custom_minimum_size.y = BTN_H
	_style_primary_btn(pw_btn)
	pw_btn.pressed.connect(_on_change_password)
	col.add_child(pw_btn)

	col.add_child(_field_label("Character Name · 500 Nova Crystals"))
	_rename = _make_field("New operative name")
	_rename.text_submitted.connect(func(_t: String) -> void: _on_rename())
	col.add_child(_rename)
	var rename_btn := Button.new()
	rename_btn.text = "Rename"
	rename_btn.custom_minimum_size.y = BTN_H
	_style_primary_btn(rename_btn)
	rename_btn.pressed.connect(_on_rename)
	col.add_child(rename_btn)

	var existing_legacy := LegacyName.clean_text(AuthManager.user.get("legacy_name", ""))
	col.add_child(_field_label("Legacy / Family Name"))
	if existing_legacy.is_empty():
		_legacy = _make_field("Set once — letters only")
		_legacy.text_submitted.connect(func(_t: String) -> void: _on_legacy())
		col.add_child(_legacy)
		var legacy_btn := Button.new()
		legacy_btn.text = "Set Legacy Name"
		legacy_btn.custom_minimum_size.y = BTN_H
		_style_ghost_btn(legacy_btn)
		legacy_btn.pressed.connect(_on_legacy)
		col.add_child(legacy_btn)
	else:
		_legacy = _make_field("")
		_legacy.text = existing_legacy
		_legacy.editable = false
		col.add_child(_legacy)
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
			mb.custom_minimum_size.y = BTN_H
			if cur_mode == str(pair[1]):
				_style_primary_btn(mb)
			else:
				_style_ghost_btn(mb)
			var mode := str(pair[1])
			mb.pressed.connect(func() -> void: _on_legacy_display(mode))
			mode_row.add_child(mb)

	col.add_child(_field_label("Promo Code"))
	var promo_row := HBoxContainer.new()
	promo_row.add_theme_constant_override("separation", 8)
	col.add_child(promo_row)
	_promo = _make_field("Enter code")
	_promo.text_submitted.connect(func(_t: String) -> void: _on_promo())
	promo_row.add_child(_promo)
	var promo_btn := Button.new()
	promo_btn.text = "Redeem"
	promo_btn.custom_minimum_size = Vector2(120, FIELD_H)
	_style_primary_btn(promo_btn)
	promo_btn.pressed.connect(_on_promo)
	promo_row.add_child(promo_btn)

	return col


# ── Character ─────────────────────────────────────────────────

func _build_character_body() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 14)
	var ch: Dictionary = GameManager.active_character

	var hero := PanelContainer.new()
	hero.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.03, 0.06, 0.1, 0.85), Color(ClientUi.CYAN, 0.4), 14, 1)
	)
	col.add_child(hero)
	var hero_pad := MarginContainer.new()
	hero_pad.add_theme_constant_override("margin_left", 16)
	hero_pad.add_theme_constant_override("margin_right", 16)
	hero_pad.add_theme_constant_override("margin_top", 14)
	hero_pad.add_theme_constant_override("margin_bottom", 14)
	hero.add_child(hero_pad)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	hero_pad.add_child(row)

	row.add_child(AvatarRenderer.make_portrait(ch, 96.0))

	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 4)
	info.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(info)

	var name_l := Label.new()
	name_l.text = str(ch.get("name", "Operative"))
	name_l.add_theme_font_size_override("font_size", 24)
	name_l.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(name_l)
	info.add_child(name_l)

	var meta := Label.new()
	meta.text = "Level %s · %s" % [
		ClientUi.format_level(ch.get("level", 1)),
		str(ch.get("class", "Operative")),
	]
	meta.add_theme_font_size_override("font_size", 16)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	info.add_child(meta)

	var switch_btn := Button.new()
	switch_btn.text = "Switch Operative"
	switch_btn.custom_minimum_size = Vector2(0, 64)
	_style_primary_btn(switch_btn)
	switch_btn.add_theme_font_size_override("font_size", 18)
	switch_btn.pressed.connect(func() -> void: GameManager.go_character_select())
	col.add_child(switch_btn)

	var hint := Label.new()
	hint.text = "Select another operative from your roster."
	hint.add_theme_font_size_override("font_size", 13)
	hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(hint)
	col.add_child(hint)
	return col


# ── Audio ─────────────────────────────────────────────────────

func _build_audio_body() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 14)

	_mute = _make_toggle("Mute Master", SettingsManager.master_muted, func(on: bool) -> void:
		SettingsManager.set_master_muted(on, false)
		_mark_dirty()
	)
	col.add_child(_mute)

	col.add_child(_premium_slider("Master", "volume-2", SettingsManager.master_volume, func(v: float) -> void:
		SettingsManager.set_master_volume(v, false)
		_mark_dirty()
	, "master"))
	col.add_child(_premium_slider("Music", "music", SettingsManager.music_volume, func(v: float) -> void:
		SettingsManager.set_music_volume(v, false)
		_mark_dirty()
	, "music"))
	col.add_child(_premium_slider("Ambient", "orbit", SettingsManager.ambient_volume, func(v: float) -> void:
		SettingsManager.set_ambient_volume(v, false)
		_mark_dirty()
	, "ambient"))
	col.add_child(_premium_slider("UI / SFX", "zap", SettingsManager.sfx_volume, func(v: float) -> void:
		SettingsManager.set_sfx_volume(v, false)
		_mark_dirty()
	, "sfx", true))

	_unfocused = _make_toggle(
		"Play music when unfocused",
		SettingsManager.play_music_when_unfocused,
		func(on: bool) -> void:
			SettingsManager.set_play_music_when_unfocused(on, false)
			_mark_dirty()
	)
	col.add_child(_unfocused)
	return col


# ── Video ─────────────────────────────────────────────────────

func _build_video_body() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)

	_fullscreen = _make_toggle("Fullscreen", SettingsManager.fullscreen, func(on: bool) -> void:
		SettingsManager.set_window_mode("fullscreen" if on else "maximized", false)
		_fullscreen.button_pressed = SettingsManager.fullscreen
		_mark_dirty()
	)
	col.add_child(_fullscreen)

	_vsync = _make_toggle("VSync", SettingsManager.vsync, func(on: bool) -> void:
		SettingsManager.vsync = on
		SettingsManager.apply_settings()
		_mark_dirty()
	)
	col.add_child(_vsync)

	col.add_child(_coming_soon("Brightness"))
	col.add_child(_coming_soon("UI Scale"))
	col.add_child(_coming_soon("Resolution"))

	var tip := Label.new()
	tip.text = "F11 toggles fullscreen anytime."
	tip.add_theme_font_size_override("font_size", 13)
	tip.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(tip)
	col.add_child(tip)
	return col


# ── Gameplay ──────────────────────────────────────────────────

func _build_gameplay_body() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 14)

	var speed_norm := clampf((SettingsManager.combat_anim_speed - 0.35) / 1.65, 0.0, 1.0)
	col.add_child(_premium_slider("Combat Animation Speed", "clock", speed_norm, func(v: float) -> void:
		SettingsManager.set_combat_anim_speed(0.35 + clampf(v, 0.0, 1.0) * 1.65, false)
		_mark_dirty()
	, "combat_speed"))

	col.add_child(_premium_slider("Screen Shake", "vibrate", SettingsManager.screen_shake_scale, func(v: float) -> void:
		SettingsManager.set_screen_shake_scale(v, false)
		_mark_dirty()
	, "shake", true))

	col.add_child(_coming_soon("Damage Numbers"))
	col.add_child(_coming_soon("Auto Skip Battles"))
	col.add_child(_coming_soon("Confirm Before Selling"))
	col.add_child(_coming_soon("Confirm Before Spending Nova"))
	col.add_child(_coming_soon("Colorblind Mode"))
	col.add_child(_coming_soon("Reduce Motion"))
	return col


# ── Notifications ─────────────────────────────────────────────

func _build_notifications_body() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(_pref_toggle("Mission Complete", "notif_mission_complete", SettingsManager.notif_mission_complete))
	col.add_child(_pref_toggle("Arena Ready", "notif_arena_ready", SettingsManager.notif_arena_ready))
	col.add_child(_pref_toggle("Daily Reward", "notif_daily_reward", SettingsManager.notif_daily_reward))
	col.add_child(_pref_toggle("Mail", "notif_mail", SettingsManager.notif_mail))
	col.add_child(_pref_toggle("Guild Activity", "notif_guild_activity", SettingsManager.notif_guild_activity))
	return col


# ── Privacy ───────────────────────────────────────────────────

func _build_privacy_body() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.add_child(_pref_toggle("Allow Friend Requests", "privacy_friend_requests", SettingsManager.privacy_friend_requests))
	col.add_child(_pref_toggle("Allow Guild Invites", "privacy_guild_invites", SettingsManager.privacy_guild_invites))
	col.add_child(_pref_toggle("Show Online Status", "privacy_show_online", SettingsManager.privacy_show_online))
	col.add_child(_coming_soon("Block List"))
	return col


# ── Danger ────────────────────────────────────────────────────

func _build_danger_zone() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.12, 0.04, 0.06, 0.9), Color(ClientUi.DANGER, 0.45), 16, 1)
	)
	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", 18)
	pad.add_theme_constant_override("margin_right", 18)
	pad.add_theme_constant_override("margin_top", 16)
	pad.add_theme_constant_override("margin_bottom", 16)
	panel.add_child(pad)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	pad.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	col.add_child(head)
	head.add_child(UiIcon.make("alert", ClientUi.DANGER, 22.0))
	var title := Label.new()
	title.text = "Danger Zone"
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", ClientUi.DANGER)
	ClientUi.apply_display_font(title)
	head.add_child(title)

	var sub := Label.new()
	sub.text = "Irreversible account actions."
	sub.add_theme_font_size_override("font_size", 14)
	sub.add_theme_color_override("font_color", Color(ClientUi.DANGER, 0.7))
	ClientUi.apply_body_font(sub)
	col.add_child(sub)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	col.add_child(row)

	var logout := Button.new()
	logout.text = "Log Out"
	logout.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	logout.custom_minimum_size.y = 58
	_style_ghost_btn(logout)
	logout.pressed.connect(_on_logout_confirm)
	row.add_child(logout)

	var delete_btn := Button.new()
	delete_btn.text = "Delete Character"
	delete_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	delete_btn.custom_minimum_size.y = 58
	ClientUi.apply_danger_button(delete_btn)
	ClientUi.apply_interaction_motion(delete_btn)
	delete_btn.pressed.connect(_on_delete_char_step1)
	row.add_child(delete_btn)
	return panel


func _build_dev_body() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", INNER_SEP)
	col.add_child(_field_label("Self-host API"))
	_api = _make_field("API base URL")
	_api.text = GameApiClient.base_url
	col.add_child(_api)
	var save_api := Button.new()
	save_api.text = "Apply API URL"
	save_api.custom_minimum_size.y = BTN_H
	_style_ghost_btn(save_api)
	save_api.pressed.connect(func() -> void:
		GameApiClient.set_base_url(_api.text.strip_edges())
		_flash_status("API → %s" % GameApiClient.base_url)
	)
	col.add_child(save_api)
	return col


# ── Controls ──────────────────────────────────────────────────

func _field_label(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 13)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(l)
	return l


func _make_field(placeholder: String, secret: bool = false) -> LineEdit:
	var edit := ClientUi.make_field(placeholder, secret)
	edit.custom_minimum_size.y = FIELD_H
	edit.add_theme_font_size_override("font_size", 16)
	return edit


func _make_toggle(text: String, on: bool, on_change: Callable) -> CheckButton:
	var btn := CheckButton.new()
	btn.text = text
	btn.button_pressed = on
	btn.custom_minimum_size.y = 40
	ClientUi.apply_body_font(btn)
	btn.add_theme_font_size_override("font_size", 16)
	btn.add_theme_color_override("font_color", ClientUi.TEXT)
	btn.toggled.connect(func(pressed: bool) -> void:
		if _building:
			return
		if on_change.is_valid():
			on_change.call(pressed)
	)
	return btn


func _pref_toggle(label: String, key: String, current: bool) -> CheckButton:
	var btn := _make_toggle(label, current, func(on: bool) -> void:
		match key:
			"notif_mission_complete":
				SettingsManager.notif_mission_complete = on
			"notif_arena_ready":
				SettingsManager.notif_arena_ready = on
			"notif_daily_reward":
				SettingsManager.notif_daily_reward = on
			"notif_mail":
				SettingsManager.notif_mail = on
			"notif_guild_activity":
				SettingsManager.notif_guild_activity = on
			"privacy_friend_requests":
				SettingsManager.privacy_friend_requests = on
			"privacy_guild_invites":
				SettingsManager.privacy_guild_invites = on
			"privacy_show_online":
				SettingsManager.privacy_show_online = on
		_toggle_refs[key] = on
		_mark_dirty()
	)
	_toggle_refs[key] = current
	return btn


func _coming_soon(label: String) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.modulate = Color(1, 1, 1, 0.55)
	var l := Label.new()
	l.text = label
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.add_theme_font_size_override("font_size", 15)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	row.add_child(l)
	var tag := Label.new()
	tag.text = "Coming soon"
	tag.add_theme_font_size_override("font_size", 12)
	tag.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.65))
	ClientUi.apply_display_font(tag)
	row.add_child(tag)
	return row


func _premium_slider(
	label: String,
	icon_id: String,
	value: float,
	on_change: Callable,
	key: String,
	preview_sfx: bool = false
) -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrap.add_theme_constant_override("separation", 6)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	wrap.add_child(head)
	head.add_child(UiIcon.make(icon_id, ClientUi.CYAN, 20.0))

	var lab := Label.new()
	lab.text = label
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.add_theme_font_size_override("font_size", 16)
	lab.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(lab)
	head.add_child(lab)

	var pct := Label.new()
	pct.text = "%d%%" % int(round(value * 100.0))
	pct.custom_minimum_size.x = 56
	pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	pct.add_theme_font_size_override("font_size", 15)
	pct.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(pct)
	head.add_child(pct)

	var s := HSlider.new()
	s.min_value = 0.0
	s.max_value = 1.0
	s.step = 0.01
	s.value = clampf(value, 0.0, 1.0)
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.custom_minimum_size = Vector2(0, 28)
	s.focus_mode = Control.FOCUS_ALL
	_style_slider(s)
	s.value_changed.connect(func(v: float) -> void:
		pct.text = "%d%%" % int(round(v * 100.0))
		if _building:
			return
		if on_change.is_valid():
			on_change.call(v)
	)
	s.drag_ended.connect(func(_changed: bool) -> void:
		if preview_sfx:
			AudioManager.play_ui("click")
	)
	wrap.add_child(s)
	_slider_refs[key] = s
	return wrap


func _style_slider(s: HSlider) -> void:
	var track := StyleBoxFlat.new()
	track.bg_color = Color(0.08, 0.1, 0.14, 0.95)
	track.set_corner_radius_all(8)
	track.content_margin_top = 6
	track.content_margin_bottom = 6
	track.set_border_width_all(1)
	track.border_color = Color(0.28, 0.36, 0.48, 0.55)
	s.add_theme_stylebox_override("slider", track)

	var fill := StyleBoxFlat.new()
	fill.bg_color = Color(ClientUi.CYAN, 0.75)
	fill.set_corner_radius_all(8)
	s.add_theme_stylebox_override("grabber_area", fill)

	var fill_hl := StyleBoxFlat.new()
	fill_hl.bg_color = Color(ClientUi.CYAN_SOFT, 0.9)
	fill_hl.set_corner_radius_all(8)
	s.add_theme_stylebox_override("grabber_area_highlight", fill_hl)


func _style_primary_btn(btn: Button) -> void:
	ClientUi.apply_primary_button(btn)
	btn.custom_minimum_size.y = maxi(int(btn.custom_minimum_size.y), BTN_H)
	btn.add_theme_font_size_override("font_size", 16)


func _style_ghost_btn(btn: Button) -> void:
	ClientUi.apply_ghost_button(btn)
	btn.custom_minimum_size.y = maxi(int(btn.custom_minimum_size.y), BTN_H)
	btn.add_theme_font_size_override("font_size", 15)
	ClientUi.apply_interaction_motion(btn)


# ── Dirty / Apply / Restore ───────────────────────────────────

func _mark_dirty() -> void:
	if _building:
		return
	_set_dirty(true)


func _set_dirty(on: bool) -> void:
	_dirty = on
	if is_instance_valid(_apply_btn):
		_apply_btn.disabled = not on
		_apply_btn.text = "Apply Changes" if on else "Up to Date"


func _on_apply() -> void:
	SettingsManager.apply_settings()
	SettingsManager.save_settings()
	_set_dirty(false)
	_show_saved_toast()


func _show_saved_toast() -> void:
	if not is_instance_valid(_saved_toast):
		return
	_saved_toast.visible = true
	_saved_toast.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(_saved_toast, "modulate:a", 1.0, 0.18)
	tw.tween_interval(1.2)
	tw.tween_property(_saved_toast, "modulate:a", 0.0, 0.35)
	tw.tween_callback(func() -> void:
		if is_instance_valid(_saved_toast):
			_saved_toast.visible = false
	)
	AudioManager.play_ui("confirm")


func _on_restore_defaults() -> void:
	var sheet := ClientUi.make_confirm_sheet(
		"SETTINGS",
		"Restore Defaults?",
		"Reset audio, video, gameplay, notifications, and privacy to factory defaults.",
		_do_restore_defaults,
		Callable(),
		"Restore",
		"Cancel",
		ClientUi.CYAN,
		false
	)
	add_child(sheet)


func _do_restore_defaults() -> void:
	SettingsManager.restore_defaults()
	_build()
	_show_saved_toast()


func _flash_status(text: String) -> void:
	if not is_instance_valid(_status):
		return
	_status.text = text
	_status.visible = not text.is_empty()


# ── Account actions ───────────────────────────────────────────

func _on_change_password() -> void:
	if _busy:
		return
	if _new_pw.text.length() < 6:
		_flash_status("New password must be at least 6 characters.")
		return
	if _new_pw.text != _confirm_pw.text:
		_flash_status("New password and confirmation differ.")
		return
	_busy = true
	_flash_status("Updating…")
	var res: Dictionary = await AuthManager.change_password(_cur_pw.text, _new_pw.text)
	_busy = false
	if not res.ok:
		_flash_status(str(res.get("error", "Change password failed")))
		return
	_flash_status("Password updated.")
	_cur_pw.text = ""
	_new_pw.text = ""
	_confirm_pw.text = ""


func _on_promo() -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await AccountManager.redeem_promo(_promo.text)
	_busy = false
	_flash_status("Promo redeemed." if res.ok else str(res.get("error", "Redeem failed")))


func _on_rename() -> void:
	if _busy:
		return
	var new_name := _rename.text.strip_edges()
	if new_name.find(" ") >= 0 or new_name.find("\t") >= 0:
		_flash_status("Names cannot contain spaces")
		return
	_busy = true
	var res: Dictionary = await AccountManager.rename_character(new_name, true)
	_busy = false
	_flash_status(
		"Renamed to %s" % GameManager.active_character.get("name", "?") if res.ok
		else str(res.get("error", "Rename failed"))
	)


func _on_legacy() -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await AccountManager.set_legacy_name(_legacy.text)
	_busy = false
	_flash_status("Legacy name set." if res.ok else str(res.get("error", "Failed")))
	if res.ok:
		_build()


func _on_legacy_display(mode: String) -> void:
	if _busy:
		return
	_busy = true
	var res: Dictionary = await AccountManager.set_legacy_display(mode)
	_busy = false
	if res.ok:
		GameManager.active_character["legacy_display"] = LegacyName.normalize_display(mode)
		_flash_status("Legacy display updated.")
		_build()
	else:
		_flash_status(str(res.get("error", "Display mode failed")))


func _on_logout_confirm() -> void:
	var sheet := ClientUi.make_confirm_sheet(
		"ACCOUNT",
		"Log Out?",
		"You will return to the login screen.",
		_do_logout,
		Callable(),
		"Log Out",
		"Stay",
		ClientUi.CYAN,
		false
	)
	add_child(sheet)


func _do_logout() -> void:
	await AuthManager.logout()
	GameManager.go_login()


func _on_delete_char_step1() -> void:
	var c: Dictionary = GameManager.active_character
	var cname := str(c.get("name", "Operative"))
	var sheet := ClientUi.make_confirm_sheet(
		"DANGER",
		"Delete %s?" % cname,
		"This permanently erases your operative and all progress. This cannot be undone.",
		_on_delete_char_step2,
		Callable(),
		"Continue",
		"Cancel",
		ClientUi.DANGER,
		true
	)
	add_child(sheet)


func _on_delete_char_step2() -> void:
	var c: Dictionary = GameManager.active_character
	var cname := str(c.get("name", ""))
	var sheet := ClientUi.make_confirm_sheet(
		"FINAL WARNING",
		"Confirm deletion",
		"Type the operative name “%s” in your mind, then confirm. There is no recovery." % cname,
		_on_delete_char_final,
		Callable(),
		"Delete Forever",
		"Cancel",
		ClientUi.DANGER,
		true
	)
	add_child(sheet)


func _on_delete_char_final() -> void:
	if _busy:
		return
	var c: Dictionary = GameManager.active_character
	var cid := str(c.get("id", ""))
	if cid.is_empty():
		_flash_status("No active character.")
		return
	_busy = true
	_flash_status("Purging…")
	var res: Dictionary = await AccountManager.purge_and_delete_character(cid, str(c.get("name", "")))
	_busy = false
	if not res.ok:
		_flash_status(str(res.get("error", "Delete failed")))
		return
	_flash_status("Character deleted.")
	GameManager.go_character_select()
