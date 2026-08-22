extends Control
## Station hub — mirrors web Home.jsx + SpaceStationHub / NexusShowcase / NexusChatter.

var _status: Label
var _open_flyout: PanelContainer = null
var _nexus_owner: Label
var _nexus_chatter: Label
var _chatter_lines: PackedStringArray = []
var _chatter_idx := 0
var _chatter_timer: Timer
var _boot_gen := 0


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	# Defer live boot so shell show_page can finish mounting / fading the dock
	# without waiting on staging RPCs inside _ready.
	call_deferred("_start_boot")


func on_shell_reshow() -> void:
	await _boot()


func _start_boot() -> void:
	if not is_inside_tree() or not is_instance_valid(self):
		return
	await _boot()


func _boot() -> void:
	_boot_gen += 1
	var boot_gen := _boot_gen
	var boot_t0 := Time.get_ticks_msec()
	var requests := AsyncGroup.new()
	requests.add(MissionManager.refresh_character)
	requests.add(SocialManager.load_my_guild)
	requests.add(SocialManager.refresh_unread)
	# Unread badge TTL-cached; Realtime also pushes updates.
	requests.add(NotificationManager.refresh_unread)
	requests.add(NexusManager.load_nexus)
	requests.add(InventoryManager.list_pending_loot)
	await requests.wait()
	if boot_gen != _boot_gen or not is_inside_tree() or not is_instance_valid(self):
		return
	if not InventoryManager.pending_loot.is_empty():
		await InventoryManager.try_claim_pending()
	if boot_gen != _boot_gen or not is_inside_tree() or not is_instance_valid(self):
		return
	RealtimeManager.start("ChatMessage")
	var status := "in_mission" if MissionManager.has_active_mission() else "online"
	PresenceManager.start(status)
	AudioManager.start_hub_bed()
	_populate()
	print("[nav] hub boot_ms=%d" % [Time.get_ticks_msec() - boot_t0])
	if not is_inside_tree() or not visible:
		return
	await _maybe_daily_prompt()
	await _maybe_legacy_prompt()
	await _maybe_bag_pressure()


func _maybe_bag_pressure() -> void:
	if InventoryManager.pending_loot.is_empty():
		return
	if await InventoryManager.is_bag_full():
		await InventoryManager.prompt_bag_pressure(
			self, "Pending loot is waiting — free a bag slot to claim it."
		)


func _maybe_daily_prompt() -> void:
	if TutorialManager.blocks_daily_login_prompt():
		return
	if not await ProgressManager.should_prompt_daily():
		return
	_show_branded_prompt(
		"gift",
		"Daily Login Rewards",
		"Your daily login reward is ready. Claim it now to keep the streak going.",
		"Open Rewards",
		"Later",
		_on_daily_open_from_hub
	)


func _maybe_legacy_prompt() -> void:
	## Web LegacyNameModal — catch-up for accounts that already run 2+ operatives
	## without a surname. Single-character accounts are asked during create.
	if not LegacyName.clean_text(AuthManager.user.get("legacy_name", "")).is_empty():
		return
	var roster: Dictionary = await AuthManager.list_characters()
	if not roster.ok or typeof(roster.data) != TYPE_ARRAY:
		return
	if not LegacyName.needs_legacy_name((roster.data as Array).size()):
		return
	_show_legacy_modal()


func _show_branded_prompt(
	icon: String,
	title: String,
	body: String,
	confirm_text: String,
	cancel_text: String,
	on_confirm: Callable
) -> void:
	var host := get_tree().current_scene
	var overlay := Control.new()
	overlay.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP

	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scrim.color = Color(0.02, 0.025, 0.05, 0.78)
	overlay.add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	overlay.add_child(center)

	var sheet := PanelContainer.new()
	sheet.custom_minimum_size = Vector2(560, 0)
	sheet.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.05, 0.06, 0.1, 0.98), Color(ClientUi.CYAN, 0.55), 16, 2)
	)
	center.add_child(sheet)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	sheet.add_child(col)

	var icon_host := CenterContainer.new()
	icon_host.custom_minimum_size = Vector2(56, 56)
	col.add_child(icon_host)
	if CurrencyIcon.is_asset_glyph(icon):
		CurrencyIcon.fill_glyph_host(icon_host, icon, 48.0, ClientUi.CYAN)
	else:
		var icon_lab := Label.new()
		icon_lab.text = icon
		icon_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		icon_lab.add_theme_font_size_override("font_size", 48)
		icon_host.add_child(icon_lab)

	var title_lab := Label.new()
	title_lab.text = title
	title_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_lab.add_theme_font_size_override("font_size", 27)
	title_lab.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title_lab)
	col.add_child(title_lab)

	var body_lab := Label.new()
	body_lab.text = body
	body_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body_lab.add_theme_font_size_override("font_size", 19)
	body_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(body_lab)
	col.add_child(body_lab)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 10)
	col.add_child(actions)
	var later := Button.new()
	later.text = cancel_text
	later.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(later)
	later.pressed.connect(func() -> void: _dismiss_overlay(overlay))
	actions.add_child(later)
	var confirm := Button.new()
	confirm.text = confirm_text
	confirm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(confirm)
	confirm.pressed.connect(func() -> void:
		_dismiss_overlay(overlay)
		on_confirm.call()
	)
	actions.add_child(confirm)

	_present_overlay(overlay)


func _show_legacy_modal() -> void:
	var overlay := Control.new()
	overlay.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP

	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scrim.color = Color(0.02, 0.025, 0.05, 0.8)
	overlay.add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	overlay.add_child(center)

	var sheet := PanelContainer.new()
	sheet.custom_minimum_size = Vector2(560, 0)
	sheet.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.05, 0.06, 0.1, 0.98), Color(ClientUi.VIOLET, 0.45), 16, 2)
	)
	center.add_child(sheet)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	sheet.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	col.add_child(head)
	var lock_badge := PanelContainer.new()
	lock_badge.custom_minimum_size = Vector2(53, 53)
	var badge_sb := StyleBoxFlat.new()
	badge_sb.bg_color = Color(ClientUi.VIOLET, 0.15)
	badge_sb.set_border_width_all(1)
	badge_sb.border_color = Color(ClientUi.VIOLET, 0.35)
	badge_sb.set_corner_radius_all(10)
	lock_badge.add_theme_stylebox_override("panel", badge_sb)
	head.add_child(lock_badge)
	var lock_center := CenterContainer.new()
	lock_badge.add_child(lock_center)
	lock_center.add_child(UiIcon.make("lock", ClientUi.VIOLET, 24.0))
	var head_copy := VBoxContainer.new()
	head_copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(head_copy)
	var title := Label.new()
	title.text = "Set Your Legacy Name"
	title.add_theme_font_size_override("font_size", 20)
	ClientUi.apply_display_font(title)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	head_copy.add_child(title)
	var sub := Label.new()
	sub.text = "One-time · permanent"
	sub.add_theme_font_size_override("font_size", 17)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	head_copy.add_child(sub)

	var body := Label.new()
	body.text = "This is your account's surname — a permanent last name shared by every character you create. It lets other players recognize all your operatives as the same person. It can never be changed."
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_theme_font_size_override("font_size", 19)
	body.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(body)
	col.add_child(body)

	var field := ClientUi.make_field("e.g. Voss, Nakamura, Khel…")
	field.max_length = 20
	col.add_child(field)

	var meta_row := HBoxContainer.new()
	col.add_child(meta_row)
	var count := Label.new()
	count.text = "0/20"
	count.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	count.add_theme_font_size_override("font_size", 17)
	count.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(count)
	meta_row.add_child(count)
	var preview := Label.new()
	preview.text = "Displayed as: —"
	preview.add_theme_font_size_override("font_size", 17)
	preview.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(preview)
	meta_row.add_child(preview)

	var err := Label.new()
	err.add_theme_font_size_override("font_size", 18)
	err.add_theme_color_override("font_color", ClientUi.DANGER)
	ClientUi.apply_body_font(err)
	col.add_child(err)

	field.text_changed.connect(func(t: String) -> void:
		var cleaned := ""
		for ch in t:
			if ch >= "0" and ch <= "9":
				continue
			cleaned += ch
		if cleaned != t:
			var caret := field.caret_column
			field.text = cleaned
			field.caret_column = mini(caret, cleaned.length())
		var trimmed := field.text.strip_edges()
		count.text = "%s/20" % field.text.length()
		preview.text = "Displayed as: %s" % (('"%s"' % trimmed) if not trimmed.is_empty() else "—")
	)

	var submit := Button.new()
	submit.text = "Lock In Legacy Name"
	submit.icon = UiIcon.texture("lock")
	submit.expand_icon = true
	submit.add_theme_constant_override("icon_max_width", 20)
	submit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(submit)
	UiIcon.apply_button_icon_colors(submit, Color.WHITE)
	col.add_child(submit)

	submit.pressed.connect(func() -> void:
		var trimmed := field.text.strip_edges()
		if trimmed.length() < 2:
			err.text = "Legacy name must be at least 2 characters."
			return
		if trimmed.length() > 20:
			err.text = "Legacy name must be 20 characters or fewer."
			return
		for ch in trimmed:
			if ch >= "0" and ch <= "9":
				err.text = "Names cannot contain numbers"
				return
		submit.disabled = true
		submit.text = "Saving…"
		UiIcon.apply_leading_icon(submit, "loader-circle", ClientUi.MUTED, 16.0)
		var res: Dictionary = await AccountManager.set_legacy_name(trimmed)
		if not res.ok:
			submit.disabled = false
			submit.text = "Lock In Legacy Name"
			submit.icon = null
			err.text = str(res.get("error", "Try again."))
			return
		await AuthManager.fetch_me()
		_dismiss_overlay(overlay)
	)

	_present_overlay(overlay)


func _present_overlay(overlay: Control) -> void:
	var host := get_tree().current_scene
	if host != null and host.is_in_group("game_shell") and host.has_method("show_overlay"):
		host.show_overlay(overlay)
	else:
		add_child(overlay)


func _dismiss_overlay(overlay: Control) -> void:
	var host := get_tree().current_scene
	if host != null and host.is_in_group("game_shell") and host.has_method("clear_overlays"):
		host.clear_overlays()
	elif is_instance_valid(overlay):
		overlay.queue_free()


func _on_daily_open_from_hub() -> void:
	var shell := get_tree().current_scene
	if shell != null and shell.has_method("open_daily_login_modal"):
		shell.open_daily_login_modal()
		return
	# Fallback: claim directly if shell overlay helper is unavailable.
	await _on_daily_claim_from_hub()


func _on_daily_claim_from_hub() -> void:
	_status.text = "Claiming daily…"
	var res: Dictionary = await ProgressManager.claim_daily()
	if res.ok:
		await ProgressManager.sync_achievements()
		AudioManager.play_ui("claim")
		if res.get("already_claimed", false):
			_status.text = "Already claimed today."
		else:
			_status.text = "Daily reward claimed."
		_populate()
	else:
		_status.text = str(res.get("error", "Daily claim failed"))


func _exit_tree() -> void:
	pass


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	# Web SpaceStationHub — station art as full content-stage backdrop.
	var station_art := TextureRect.new()
	station_art.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	station_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	station_art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	station_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	station_art.texture = _load_station_texture("station-hub.png")
	add_child(station_art)
	add_child(_make_stage_gradient())
	add_child(_make_stage_vignette())
	add_child(_make_top_fade())

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 12)
	margin.add_child(root)

	# Open station art (web: flex-1 min-h spacer — no caption overlay)
	var vista := Control.new()
	vista.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vista.custom_minimum_size.y = 85
	vista.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(vista)

	_status = Label.new()
	_status.visible = false
	root.add_child(_status)

	# Bottom dock — DOCK_ORDER equal flex tiles (web SpaceStationHub)
	var deck := HBoxContainer.new()
	deck.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	deck.size_flags_vertical = Control.SIZE_SHRINK_END
	deck.add_theme_constant_override("separation", 8)
	root.add_child(deck)

	## Dock face/option tints match side-nav rail colors in game_shell._nav_groups().
	deck.add_child(_dock_split(
		"user", "Operative", "#00E5FF",
		[
			{"label": "Operative", "icon": "user", "color": "#00E5FF", "action": func() -> void: GameManager.go_stats()},
			{"label": "Coming Soon", "icon": "rocket", "color": "#2DD4BF", "action": func() -> void: GameManager.go_ship()},
		]
	))
	deck.add_child(_dock_tile("orbit", "Galactic Frontier", "#BA55D3", func() -> void: GameManager.go_galaxy()))
	deck.add_child(_dock_split(
		"swords", "Arena", "#FB7185",
		[
			{"label": "Arena", "icon": "zap", "color": "#FB7185", "action": func() -> void: GameManager.go_arena()},
			{"label": "Leaderboard", "icon": "trophy", "color": "#34D399", "action": func() -> void: GameManager.go_leaderboard()},
		]
	))
	deck.add_child(_dock_split(
		"beer", "Cantina", "#FF8C00",
		[
			{"label": "Missions", "icon": "beer", "color": "#FF8C00", "action": _on_missions},
			{"label": "Casino", "icon": "dice-5", "color": "#FBBF24", "action": func() -> void: GameManager.go_casino()},
		]
	))
	deck.add_child(_dock_split(
		"shopping-bag", "Black Market", "#9D6BFF",
		[
			{"label": "Black Market", "icon": "shopping-bag", "color": "#9D6BFF", "action": func() -> void: GameManager.go_shop()},
			{"label": "Mining", "icon": "pickaxe", "color": "#EC4899", "action": func() -> void: GameManager.go_mining()},
			{"label": "Crystals", "icon": "sparkles", "color": "#FFD700", "action": func() -> void: GameManager.go_crystal_store()},
			{"label": "Coming Soon", "icon": "orbit", "color": "#14B8A6", "action": func() -> void: GameManager.go_void()},
		]
	))
	deck.add_child(_dock_split(
		"message-square", "Social", "#16A34A",
		[
			{"label": "Mail", "icon": "mail", "color": "#16A34A", "action": func() -> void: GameManager.go_mail()},
			{"label": "Friends", "icon": "users", "color": "#A855F7", "action": func() -> void: GameManager.go_friends()},
			{"label": "Guild", "icon": "landmark", "color": "#F43F5E", "action": func() -> void: GameManager.go_guild()},
			{"label": "Messages", "icon": "send", "color": "#38BDF8", "action": func() -> void: GameManager.go_messages()},
		]
	))

	# Galactic Command Nexus strip — showcase + chatter (web children row)
	var nexus_strip := PanelContainer.new()
	nexus_strip.size_flags_vertical = Control.SIZE_SHRINK_END
	var strip_sb := StyleBoxFlat.new()
	strip_sb.bg_color = Color(0.04, 0.05, 0.08, 0.9)
	strip_sb.set_border_width_all(1)
	strip_sb.border_color = Color(1, 1, 1, 0.12)
	strip_sb.set_corner_radius_all(12)
	strip_sb.content_margin_left = 10
	strip_sb.content_margin_right = 10
	strip_sb.content_margin_top = 10
	strip_sb.content_margin_bottom = 10
	nexus_strip.add_theme_stylebox_override("panel", strip_sb)
	root.add_child(nexus_strip)

	var nexus_row := HBoxContainer.new()
	nexus_row.add_theme_constant_override("separation", 10)
	nexus_strip.add_child(nexus_row)

	# NexusShowcase
	var showcase := Button.new()
	showcase.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	showcase.size_flags_stretch_ratio = 1.15
	showcase.custom_minimum_size.y = 75
	showcase.clip_contents = true
	showcase.alignment = HORIZONTAL_ALIGNMENT_LEFT
	var sc_sb := StyleBoxFlat.new()
	sc_sb.bg_color = Color(0.06, 0.07, 0.1, 0.7)
	sc_sb.set_border_width_all(1)
	sc_sb.border_color = Color(1, 1, 1, 0.14)
	sc_sb.set_corner_radius_all(12)
	showcase.add_theme_stylebox_override("normal", sc_sb)
	var sc_h := sc_sb.duplicate() as StyleBoxFlat
	sc_h.border_color = Color("#FBBF24", 0.4)
	showcase.add_theme_stylebox_override("hover", sc_h)
	showcase.add_theme_stylebox_override("pressed", sc_h)
	showcase.add_theme_color_override("font_color", Color(0, 0, 0, 0))
	showcase.pressed.connect(func() -> void: GameManager.go_nexus())
	nexus_row.add_child(showcase)

	var sc_row := HBoxContainer.new()
	sc_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sc_row.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	sc_row.offset_left = 16
	sc_row.offset_top = 11
	sc_row.offset_right = -16
	sc_row.offset_bottom = -11
	sc_row.add_theme_constant_override("separation", 10)
	showcase.add_child(sc_row)

	var crown := UiIcon.make("crown", Color("#FBBF24"), 28.0)
	crown.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sc_row.add_child(crown)

	var sc_copy := VBoxContainer.new()
	sc_copy.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sc_copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc_copy.add_theme_constant_override("separation", 2)
	sc_row.add_child(sc_copy)
	var nexus_eye := Label.new()
	nexus_eye.mouse_filter = Control.MOUSE_FILTER_IGNORE
	nexus_eye.text = "GALACTIC COMMAND NEXUS"
	nexus_eye.add_theme_font_size_override("font_size", 16)
	nexus_eye.add_theme_color_override("font_color", Color("#FCD34D", 0.8))
	ClientUi.apply_display_font(nexus_eye)
	sc_copy.add_child(nexus_eye)
	_nexus_owner = Label.new()
	_nexus_owner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_nexus_owner.clip_text = true
	_nexus_owner.add_theme_font_size_override("font_size", 19)
	_nexus_owner.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(_nexus_owner)
	sc_copy.add_child(_nexus_owner)

	var chevron := Label.new()
	chevron.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chevron.text = "›"
	chevron.add_theme_font_size_override("font_size", 24)
	chevron.add_theme_color_override("font_color", ClientUi.MUTED)
	sc_row.add_child(chevron)

	# NexusChatter
	var chatter_panel := PanelContainer.new()
	chatter_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var ch_sb := StyleBoxFlat.new()
	ch_sb.bg_color = Color(0.05, 0.06, 0.09, 0.55)
	ch_sb.set_border_width_all(1)
	ch_sb.border_color = Color(1, 1, 1, 0.1)
	ch_sb.set_corner_radius_all(12)
	ch_sb.content_margin_left = 10
	ch_sb.content_margin_right = 10
	ch_sb.content_margin_top = 8
	ch_sb.content_margin_bottom = 8
	chatter_panel.add_theme_stylebox_override("panel", ch_sb)
	nexus_row.add_child(chatter_panel)
	var chatter_row := HBoxContainer.new()
	chatter_row.add_theme_constant_override("separation", 8)
	chatter_panel.add_child(chatter_row)
	var radio := UiIcon.make("radio", ClientUi.CYAN, 22.0)
	radio.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chatter_row.add_child(radio)
	_nexus_chatter = Label.new()
	_nexus_chatter.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_nexus_chatter.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_nexus_chatter.add_theme_font_size_override("font_size", 19)
	_nexus_chatter.add_theme_color_override("font_color", Color(ClientUi.TEXT, 0.82))
	ClientUi.apply_body_font(_nexus_chatter)
	chatter_row.add_child(_nexus_chatter)

	_chatter_timer = Timer.new()
	_chatter_timer.wait_time = 7.0
	_chatter_timer.autostart = false
	_chatter_timer.timeout.connect(_advance_chatter)
	add_child(_chatter_timer)


func _make_stage_gradient() -> TextureRect:
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 0.42, 1.0])
	gradient.colors = PackedColorArray([
		Color(0.015, 0.02, 0.045, 0.72),
		Color(0.015, 0.02, 0.045, 0.08),
		Color(0.015, 0.02, 0.045, 0.84),
	])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill_from = Vector2(0.5, 0.0)
	texture.fill_to = Vector2(0.5, 1.0)
	var overlay := TextureRect.new()
	overlay.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	overlay.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	overlay.texture = texture
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return overlay


func _make_stage_vignette() -> TextureRect:
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 0.55, 1.0])
	gradient.colors = PackedColorArray([
		Color(0.015, 0.02, 0.045, 0.0),
		Color(0.015, 0.02, 0.045, 0.08),
		Color(0.015, 0.02, 0.045, 0.58),
	])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.45)
	texture.fill_to = Vector2(1.0, 1.0)
	var overlay := TextureRect.new()
	overlay.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	overlay.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	overlay.texture = texture
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return overlay


func _make_top_fade() -> TextureRect:
	## Web: absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/50
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 1.0])
	gradient.colors = PackedColorArray([
		Color(0.015, 0.02, 0.045, 0.5),
		Color(0.015, 0.02, 0.045, 0.0),
	])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill_from = Vector2(0.5, 0.0)
	texture.fill_to = Vector2(0.5, 1.0)
	var overlay := TextureRect.new()
	overlay.set_anchors_and_offsets_preset(PRESET_TOP_WIDE)
	overlay.offset_bottom = 128
	overlay.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	overlay.texture = texture
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return overlay


func _dock_tile(icon_id: String, label: String, tint_hex: String, action: Callable) -> Button:
	var tint := Color(tint_hex)
	var btn := Button.new()
	btn.text = ""
	btn.tooltip_text = label
	btn.custom_minimum_size = Vector2(0, 123)
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.size_flags_vertical = Control.SIZE_EXPAND_FILL
	ClientUi.apply_dock_button(btn, tint)
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 6)
	var icon := UiIcon.make(icon_id, tint, 42.5)
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(icon)
	var lab := Label.new()
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.text = label
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lab.autowrap_mode = TextServer.AUTOWRAP_OFF
	lab.clip_text = true
	lab.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.add_theme_font_size_override("font_size", 20)
	lab.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	btn.add_child(col)
	btn.pressed.connect(action)
	return btn


func _dock_split(icon_id: String, label: String, tint_hex: String, options: Array) -> Control:
	var tint := Color(tint_hex)
	var wrap := Control.new()
	wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	wrap.custom_minimum_size = Vector2(0, 123)
	wrap.mouse_filter = Control.MOUSE_FILTER_STOP

	var btn := Button.new()
	btn.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	btn.text = ""
	btn.tooltip_text = label
	ClientUi.apply_dock_button(btn, tint)
	var face := VBoxContainer.new()
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	face.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	face.alignment = BoxContainer.ALIGNMENT_CENTER
	face.add_theme_constant_override("separation", 6)
	var face_icon := UiIcon.make(icon_id, tint, 42.5)
	face_icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	face.add_child(face_icon)
	var face_lab := Label.new()
	face_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	face_lab.text = label
	face_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	face_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	face_lab.autowrap_mode = TextServer.AUTOWRAP_OFF
	face_lab.clip_text = true
	face_lab.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	face_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	face_lab.add_theme_font_size_override("font_size", 20)
	face_lab.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(face_lab)
	face.add_child(face_lab)
	btn.add_child(face)
	wrap.add_child(btn)
	wrap.set_meta("dock_button", btn)

	var primary: Dictionary = options[0] if options.size() > 0 else {}
	if primary.has("action"):
		btn.pressed.connect(primary["action"])

	var fly := PanelContainer.new()
	fly.visible = false
	fly.mouse_filter = Control.MOUSE_FILTER_STOP
	fly.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.09, 0.98), Color(tint_hex, 0.45), 10, 1
	))
	wrap.add_child(fly)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 2)
	fly.add_child(col)
	for opt in options:
		if typeof(opt) != TYPE_DICTIONARY:
			continue
		var ob := Button.new()
		ob.text = "  %s" % str(opt.get("label", "?"))
		ob.add_theme_font_size_override("font_size", 15)
		var opt_color := Color(str(opt.get("color", tint_hex)))
		ClientUi.apply_ghost_button(ob)
		ob.add_theme_color_override("font_color", opt_color)
		ob.icon = UiIcon.texture(str(opt.get("icon", icon_id)))
		ob.expand_icon = true
		ob.add_theme_constant_override("icon_max_width", 18)
		UiIcon.apply_button_icon_colors(ob, opt_color)
		var act: Callable = opt.get("action", Callable())
		ob.pressed.connect(func() -> void:
			fly.visible = false
			if act.is_valid():
				act.call()
		)
		col.add_child(ob)

	wrap.mouse_entered.connect(func() -> void:
		if options.size() <= 1:
			return
		if _open_flyout and is_instance_valid(_open_flyout) and _open_flyout != fly:
			_open_flyout.visible = false
		_open_flyout = fly
		fly.visible = true
		var w := maxf(wrap.size.x, 140.0)
		fly.custom_minimum_size = Vector2(w, 0)
		fly.size = Vector2(w, 0)
		fly.reset_size()
		await get_tree().process_frame
		fly.position = Vector2((wrap.size.x - fly.size.x) * 0.5, -fly.size.y - 6.0)
	)
	wrap.mouse_exited.connect(func() -> void:
		await get_tree().create_timer(0.12).timeout
		if not fly.get_global_rect().has_point(get_global_mouse_position()) \
				and not wrap.get_global_rect().has_point(get_global_mouse_position()):
			fly.visible = false
			if _open_flyout == fly:
				_open_flyout = null
	)
	fly.mouse_exited.connect(func() -> void:
		await get_tree().create_timer(0.12).timeout
		if not fly.get_global_rect().has_point(get_global_mouse_position()) \
				and not wrap.get_global_rect().has_point(get_global_mouse_position()):
			fly.visible = false
			if _open_flyout == fly:
				_open_flyout = null
	)
	return wrap


func _load_station_texture(file_name: String) -> Texture2D:
	var rel := "res://Assets/Textures/%s" % file_name
	# Prefer imported resource; fall back to raw PNG so a bad .import cannot blank the page.
	if ResourceLoader.exists(rel):
		var texture := load(rel) as Texture2D
		if texture != null:
			return texture
	var path := ProjectSettings.globalize_path(rel)
	if FileAccess.file_exists(path):
		var image := Image.load_from_file(path)
		if image != null and not image.is_empty():
			return ImageTexture.create_from_image(image)
	push_warning("Hub backdrop missing: %s" % rel)
	return null


func _populate() -> void:
	var nexus := NexusManager.nexus
	var owner_id := str(nexus.get("owner_guild_id", ""))
	if owner_id.is_empty():
		_nexus_owner.text = "Unclaimed — vulnerable to assault"
		_nexus_owner.add_theme_color_override("font_color", ClientUi.DANGER)
	else:
		var owner_name := str(nexus.get("owner_guild_name", "Unknown Guild"))
		var owner_tag := str(nexus.get("owner_guild_tag", ""))
		_nexus_owner.text = "Held by [%s] %s · %s" % [owner_tag, owner_name, NexusManager.format_reign(nexus)]
		_nexus_owner.add_theme_color_override("font_color", Color(str(nexus.get("banner_color", "#FFD700"))))

	_chatter_lines = _build_chatter_lines(nexus)
	_chatter_idx = 0
	_apply_chatter_line()
	if _chatter_lines.size() > 1:
		_chatter_timer.start()
	else:
		_chatter_timer.stop()


func _build_chatter_lines(nexus: Dictionary) -> PackedStringArray:
	## Mirrors web NexusChatter buildLines().
	var owner_id := str(nexus.get("owner_guild_id", ""))
	if owner_id.is_empty():
		return PackedStringArray([
			"The Nexus lies unclaimed... rumors swirl of guilds marshalling fleets.",
			"Station chatter: 'Who will be the first to take the Nexus?'",
		])
	var name := str(nexus.get("owner_guild_name", "Unknown"))
	var held := NexusManager.format_reign(nexus)
	var streak := int(nexus.get("defense_streak", 0))
	var out: PackedStringArray = [
		"Have you heard? %s rules the galaxy now." % name,
		"The Nexus hasn't fallen in %s. %s stands firm." % [held, name],
	]
	if streak > 0:
		var assault_word := "assaults" if streak > 1 else "assault"
		out.append("%s has repelled %s %s. Legend grows." % [name, streak, assault_word])
	if NexusManager.is_vulnerable(nexus):
		out.append("Whispers in the lounge: 'The Nexus is vulnerable — someone make a move.'")
	return out


func _apply_chatter_line() -> void:
	if _nexus_chatter == null or _chatter_lines.is_empty():
		return
	_nexus_chatter.text = _chatter_lines[_chatter_idx % _chatter_lines.size()]


func _advance_chatter() -> void:
	if _chatter_lines.size() <= 1:
		return
	_chatter_idx = (_chatter_idx + 1) % _chatter_lines.size()
	_apply_chatter_line()


func _on_missions() -> void:
	## Closest to web /missions — active run opens mission_run, else cantina board.
	if MissionManager.has_active_mission():
		GameManager.go_mission_run()
	else:
		GameManager.go_cantina()


func _on_logout() -> void:
	PresenceManager.stop()
	RealtimeManager.stop()
	await AuthManager.logout()
	GameManager.go_login()
