extends Control
## Persistent in-game console. Page scenes swap inside the recessed content stage.

const StationLoadingOverlay := preload("res://Scripts/UI/StationLoadingOverlay.gd")

var _content: Control
var _overlay_host: Control
var _nav_buttons: Dictionary = {}
var _page_path := ""
var _page: Node

var _operative_name: Button
var _operative_meta: Label
var _operative_title: Label
var _fuel_value: Label
var _stardust_value: Label
var _nova_value: Label
var _xp_label: Label
var _xp_bar: ProgressBar
var _activity: Button
var _activity_icon: TextureRect
var _activity_label: Label
var _clock: Label
var _portrait_host: CenterContainer
var _console_class_icon: Control
var _console_portrait_btn: Button
var _hero_page_open := false
var _notif_btn: Button
var _notif_fab_wrap: Control
var _notif_badge: Label
var _notif_badge_chip: Control
var _notif_dock: Control
var _notif_panel: PanelContainer
var _notif_list: VBoxContainer
var _notif_meta: Label
var _notif_open := false
var _notif_hovering := false
var _notif_auto_close: SceneTreeTimer
var _notif_badge_blink: Tween
const NOTIF_TAB_W := 32.0
const NOTIF_TAB_H := 64.0
const NOTIF_HOVER_CLOSE_SEC := 1.0
var _transition_flash: ColorRect
var _atmosphere: Control
var _hud_overlay: Control
var _effects: ActiveEffectsBar
## Cheap snapshot of the character fields the chrome renders — drives same-frame
## readout updates so spending never waits on the 1s clock tick.
var _chrome_stamp: Array = []
var _activity_mode := ""
var _activity_styles: Dictionary = {}
## Serializes shell page swaps. Overlapping swaps were freeing pages mid-_ready and crashing.
var _page_swap_busy := false
var _page_nav_pending := false
var _page_swap_token := 0
## Compiled PackedScenes — first `load()` compiles GDScript and is the hitch.
var _packed_cache: Dictionary = {}
## Pages with an explicit live-reshow contract keep their built control trees.
## Refresh runs in place so reuse never hides the page while staging RPCs wait.
const RETAIN_RENDERED_PAGE_INSTANCES := true
var _page_instances: Dictionary = {}
var _page_live_refresh_token := 0
var _page_live_refresh_active := false
var _warm_queue: Array = []
var _warmup_paused := false
var _cached_character_id := ""

const _WALLET_PANE_HEIGHT := 48.0
const _WALLET_ICON_INSET := 3.0
const _WALLET_ICON_COLUMN := 38.0
const _WALLET_DIVIDER_GAP := 4.0
const _WALLET_VALUE_GAP := 8.0
const _WALLET_TRAILING_SIZE := 29.0
var _last_nav_ms := 0
const NAV_COOLDOWN_MS := 200
const CHROME_REFRESH_INTERVAL_SEC := 1.0
const DAILY_PROMPT_DELAY_SEC := 0.45
const NAV_WARMUP_RESUME_DELAY_SEC := 0.45
const PAGE_FADE_IN_SEC := 0.12
const TRANSITION_FLASH_PEAK_ALPHA := 0.06
const TRANSITION_FLASH_IN_SEC := 0.04
const TRANSITION_FLASH_OUT_SEC := 0.12


func _ready() -> void:
	add_to_group("game_shell")
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scale = Vector2.ONE
	DevEnvironmentBadge.attach_to(self)
	# Never let chrome/rail minimum sizes push past the window edge.
	clip_contents = true
	# Keep station overlay spinning while shell mounts (covers scene-change freeze).
	var overlay := StationLoadingOverlay.instance()
	if overlay == null or not overlay.visible:
		StationLoadingOverlay.show_loading("Entering station…")
	else:
		StationLoadingOverlay.set_message("Entering station…")
	call_deferred("_complete_shell_boot")


func _complete_shell_boot() -> void:
	if not is_instance_valid(self):
		return
	# Yield so the overlay spinner can paint between heavy sync chunks.
	await get_tree().process_frame
	_build()
	await get_tree().process_frame
	_refresh_chrome()
	_set_decor_active(true)
	AudioManager.start_station_ambient()
	SettingsManager.apply_audio()
	var timer := Timer.new()
	timer.wait_time = CHROME_REFRESH_INTERVAL_SEC
	timer.timeout.connect(_refresh_chrome)
	add_child(timer)
	timer.start()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	if not GameManager.active_character_changed.is_connected(_on_active_character_changed):
		GameManager.active_character_changed.connect(_on_active_character_changed)
	var target := GameManager.pending_page_path
	if target.is_empty():
		target = GameManager.SCENE_HUB
	await get_tree().process_frame
	show_page(target)
	_cached_character_id = str(GameManager.active_character.get("id", ""))
	call_deferred("_begin_nav_warmup")
	_ensure_tutorial_coach()
	if not TutorialManager.tutorial_changed.is_connected(_on_tutorial_visibility_changed):
		TutorialManager.tutorial_changed.connect(_on_tutorial_visibility_changed)
	if not TutorialManager.tutorial_finished.is_connected(_on_tutorial_visibility_changed):
		TutorialManager.tutorial_finished.connect(_on_tutorial_visibility_changed)
	if not TutorialManager.tutorial_finished.is_connected(_on_tutorial_finished_daily_prompt):
		TutorialManager.tutorial_finished.connect(_on_tutorial_finished_daily_prompt)
	call_deferred("_sync_notif_for_tutorial")
	await get_tree().process_frame
	await get_tree().process_frame
	StationLoadingOverlay.hide_loading()


func _on_tutorial_visibility_changed(_unused = null) -> void:
	_sync_notif_for_tutorial()


func _on_tutorial_finished_daily_prompt() -> void:
	call_deferred("_try_daily_prompt_after_tutorial")


func _try_daily_prompt_after_tutorial() -> void:
	if not is_inside_tree():
		return
	# Let skip/complete overlays clear before offering the daily choice.
	await get_tree().create_timer(DAILY_PROMPT_DELAY_SEC).timeout
	if not is_inside_tree():
		return
	if TutorialManager.blocks_daily_login_prompt():
		return
	if has_overlay():
		return
	if not await ProgressManager.should_prompt_daily():
		return
	# Same Open Rewards / Later choice as the hub prompt — do not force the calendar open.
	_show_daily_login_choice_prompt()


func _show_daily_login_choice_prompt() -> void:
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
	CurrencyIcon.fill_glyph_host(icon_host, "gift", 48.0, ClientUi.CYAN)

	var title_lab := Label.new()
	title_lab.text = "Daily Login Rewards"
	title_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_lab.add_theme_font_size_override("font_size", 27)
	title_lab.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title_lab)
	col.add_child(title_lab)

	var body_lab := Label.new()
	body_lab.text = "Your daily login reward is ready. Claim it now to keep the streak going."
	body_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body_lab.add_theme_font_size_override("font_size", 17)
	body_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(body_lab)
	col.add_child(body_lab)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 10)
	col.add_child(actions)

	var later := Button.new()
	later.text = "Later"
	later.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(later)
	later.pressed.connect(func() -> void: clear_overlays())
	actions.add_child(later)

	var confirm := Button.new()
	confirm.text = "Open Rewards"
	confirm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(confirm)
	confirm.pressed.connect(func() -> void:
		clear_overlays()
		open_daily_login_modal()
	)
	actions.add_child(confirm)

	show_overlay(overlay)


func _sync_notif_for_tutorial() -> void:
	if _notif_fab_wrap == null or not is_instance_valid(_notif_fab_wrap):
		return
	var hide_fab := TutorialManager.should_show()
	if hide_fab and _notif_open:
		_set_notification_open(false)
	# Tab stays hidden while the panel is open, or during tutorial.
	_notif_fab_wrap.visible = (not hide_fab) and (not _notif_open)


func _ensure_tutorial_coach() -> void:
	if has_node("TutorialCoach"):
		return
	var script: Variant = load("res://Scenes/UI/TutorialCoach.gd")
	if script == null:
		return
	var coach: Node = (script as GDScript).new()
	coach.name = "TutorialCoach"
	add_child(coach)
	TutorialManager.refresh()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_refresh_chrome()


func _on_active_character_changed(character: Dictionary, _source: String) -> void:
	_refresh_chrome()
	var cid := str(character.get("id", ""))
	if cid.is_empty() or cid == _cached_character_id:
		return
	var prev := _cached_character_id
	_cached_character_id = cid
	if not prev.is_empty():
		_purge_parked_pages()
		if _page != null and is_instance_valid(_page):
			_refresh_kept_page(_page)


func _notification(what: int) -> void:
	# Freeze decorative redraws / nebula animation while unfocused — look unchanged in play.
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_set_decor_active(false)
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_set_decor_active(true)


func _set_decor_active(on: bool) -> void:
	if _hud_overlay != null and is_instance_valid(_hud_overlay) and _hud_overlay.has_method("set_active"):
		_hud_overlay.call("set_active", on)
	if _atmosphere != null and is_instance_valid(_atmosphere):
		for child in _atmosphere.get_children():
			if child.has_method("set_active"):
				child.call("set_active", on)
			elif child.has_meta("space_host"):
				_set_space_animating(child, on)
	if _portrait_host != null and is_instance_valid(_portrait_host):
		for n in _portrait_host.find_children("*", "Control", true, false):
			if n.has_method("set_active"):
				n.call("set_active", on)


func _set_space_animating(host: Node, on: bool) -> void:
	for n in host.find_children("*", "SubViewport", true, false):
		if n is SubViewport:
			(n as SubViewport).render_target_update_mode = (
				SubViewport.UPDATE_WHEN_VISIBLE if on else SubViewport.UPDATE_DISABLED
			)
	for n in host.find_children("*", "ColorRect", true, false):
		if n is ColorRect and (n as ColorRect).material is ShaderMaterial:
			var mat := (n as ColorRect).material as ShaderMaterial
			mat.set_shader_parameter("speed", 0.16 if on else 0.0)
			return


func _build() -> void:
	_atmosphere = ClientUi.make_screen("hub")
	add_child(_atmosphere)

	var outer_margin := MarginContainer.new()
	outer_margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	outer_margin.add_theme_constant_override("margin_left", 8)
	outer_margin.add_theme_constant_override("margin_right", 8)
	outer_margin.add_theme_constant_override("margin_top", 8)
	# Extra bottom inset so maximized / taskbar never eats the last row.
	outer_margin.add_theme_constant_override("margin_bottom", 16)
	add_child(outer_margin)

	var frame := PanelContainer.new()
	frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	frame.add_theme_stylebox_override(
		"panel",
		_shell_panel_style(Color(0.04, 0.05, 0.085, 0.98), Color(0.32, 0.42, 0.52, 0.95), 14, 8, 6, 2)
	)
	outer_margin.add_child(frame)

	# Web PersistentGameFrame: rivets, engraved rail, side holo ticks.
	_add_shell_chrome(frame)

	var shell := VBoxContainer.new()
	shell.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shell.add_theme_constant_override("separation", 0)
	frame.add_child(shell)
	shell.add_child(_make_top_chrome())

	var divider := HSeparator.new()
	divider.add_theme_constant_override("separation", 1)
	shell.add_child(divider)

	var body := HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 10)
	shell.add_child(body)
	body.add_child(_make_rail())

	# Web GameLayout: one recessed surface — avoid a second nested content panel.
	var content_stage := MarginContainer.new()
	content_stage.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content_stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content_stage.add_theme_constant_override("margin_right", 6)
	content_stage.add_theme_constant_override("margin_bottom", 6)
	content_stage.add_theme_constant_override("margin_top", 2)
	body.add_child(content_stage)

	_content = Control.new()
	_content.name = "ContentStage"
	_content.clip_contents = true
	_content.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	# Do NOT connect resized → _fit_page_to_stage. Re-applying full-rect anchors
	# from resized recurses into layout and hard-crashes (Settings / Messages).
	# Full-rect pages already track ContentStage size via anchors alone.
	content_stage.add_child(_content)

	_transition_flash = ColorRect.new()
	_transition_flash.color = ClientUi.CYAN
	_transition_flash.modulate.a = 0.0
	_transition_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_transition_flash.z_index = 70
	_transition_flash.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_content.add_child(_transition_flash)

	var hud_script := load("res://Scripts/UI/HudOverlay.gd")
	if hud_script != null:
		_hud_overlay = hud_script.new() as Control
		_hud_overlay.z_index = 80
		_hud_overlay.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		_hud_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_content.add_child(_hud_overlay)

	# Keep every window inside ContentStage so shell navigation is never covered.
	_overlay_host = Control.new()
	_overlay_host.name = "OverlayHost"
	_overlay_host.z_index = 100
	_overlay_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_overlay_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(_overlay_host)
	_build_notification_center()
	_restack_content_layers()
	# Center player-fault notifications over the content stage, not the whole window.
	var notify := get_node_or_null("/root/Notify")
	if notify != null and notify.has_method("set_content_region"):
		notify.set_content_region(_content)


func _exit_tree() -> void:
	var notify := get_node_or_null("/root/Notify")
	if notify != null and notify.has_method("clear_content_region"):
		notify.clear_content_region(_content)


func _make_top_chrome() -> Control:
	var top := PanelContainer.new()
	top.custom_minimum_size.y = ClientUi.px(48)
	top.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	top.add_theme_stylebox_override(
		"panel",
		_shell_panel_style(Color(0.045, 0.06, 0.09, 0.98), Color(0.2, 0.3, 0.38, 0.9), 6, 8, 2)
	)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", ClientUi.px(9))
	top.add_child(row)

	# Left hub control — title high, "Station Hub" subtitle, click → hub.
	var brand := Button.new()
	brand.name = "HubBrandButton"
	brand.flat = true
	brand.text = ""
	brand.tooltip_text = "Return to Hub"
	brand.focus_mode = Control.FOCUS_NONE
	brand.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	brand.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	brand.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	brand.custom_minimum_size = ClientUi.pxv(Vector2(220, 40))
	var brand_idle := _nav_style(Color.TRANSPARENT, Color.TRANSPARENT)
	brand_idle.content_margin_left = 6
	brand_idle.content_margin_right = 12
	brand_idle.content_margin_top = 0
	brand_idle.content_margin_bottom = 2
	var brand_hover := _nav_style(Color(ClientUi.CYAN, 0.1), Color(ClientUi.CYAN, 0.35))
	brand_hover.content_margin_left = 6
	brand_hover.content_margin_right = 12
	brand_hover.content_margin_top = 0
	brand_hover.content_margin_bottom = 2
	var brand_press := _nav_style(Color(ClientUi.CYAN, 0.05), ClientUi.CYAN)
	brand_press.content_margin_left = 6
	brand_press.content_margin_right = 12
	brand_press.content_margin_top = 0
	brand_press.content_margin_bottom = 2
	brand.add_theme_stylebox_override("normal", brand_idle)
	brand.add_theme_stylebox_override("hover", brand_hover)
	brand.add_theme_stylebox_override("pressed", brand_press)
	brand.add_theme_stylebox_override("focus", brand_idle)
	brand.pressed.connect(func() -> void: GameManager.go_hub())
	row.add_child(brand)

	var brand_col := VBoxContainer.new()
	brand_col.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	brand_col.add_theme_constant_override("separation", 0)
	brand_col.alignment = BoxContainer.ALIGNMENT_BEGIN
	brand_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	brand.add_child(brand_col)

	var title := BrandGradientTitle.new()
	title.title_text = "LOOT & LASERS"
	title.font_size = 32
	title.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	title.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	brand_col.add_child(title)

	var hub_sub := Label.new()
	hub_sub.text = "Station Hub"
	hub_sub.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	hub_sub.add_theme_font_size_override("font_size", 16)
	hub_sub.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.78))
	hub_sub.add_theme_constant_override("line_spacing", -2)
	ClientUi.apply_display_font(hub_sub)
	brand_col.add_child(hub_sub)

	brand.mouse_entered.connect(func() -> void:
		if is_instance_valid(title):
			title.set_brighten(1.12)
		if is_instance_valid(hub_sub):
			hub_sub.add_theme_color_override("font_color", Color(ClientUi.CYAN_SOFT, 0.95))
	)
	brand.mouse_exited.connect(func() -> void:
		if is_instance_valid(title):
			title.set_brighten(1.0)
		if is_instance_valid(hub_sub):
			hub_sub.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.78))
	)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)

	_activity = Button.new()
	_activity.focus_mode = Control.FOCUS_NONE
	_activity.flat = false
	_activity.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_activity.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_activity.tooltip_text = "Open active activity"
	_activity.custom_minimum_size = Vector2(268, 52)
	_activity.pressed.connect(_on_activity_pressed)
	ClientUi.apply_interaction_motion(_activity, 1.03)
	TutorialManager.tag_target(_activity, "shell-activity")
	row.add_child(_activity)
	var act_row := HBoxContainer.new()
	act_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	act_row.alignment = BoxContainer.ALIGNMENT_CENTER
	act_row.add_theme_constant_override("separation", 8)
	act_row.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	act_row.offset_left = 12
	act_row.offset_right = -12
	act_row.offset_top = 4
	act_row.offset_bottom = -4
	_activity.add_child(act_row)
	_activity_icon = UiIcon.make("rocket", ClientUi.CYAN, 18.0)
	_activity_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_activity_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	act_row.add_child(_activity_icon)
	_activity_label = Label.new()
	_activity_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_activity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_activity_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_activity_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_activity_label.add_theme_font_size_override("font_size", 16)
	_activity_label.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(_activity_label)
	act_row.add_child(_activity_label)
	_apply_activity_styles("idle", ClientUi.SUCCESS)

	_clock = Label.new()
	_clock.custom_minimum_size.x = 99
	_clock.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_clock.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_clock.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_clock.add_theme_font_size_override("font_size", 15)
	_clock.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_clock)
	row.add_child(_clock)

	var switch_btn := Button.new()
	switch_btn.text = "OPERATIVES"
	switch_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ClientUi.apply_ghost_button(switch_btn)
	switch_btn.pressed.connect(func() -> void: GameManager.go_character_select())
	row.add_child(switch_btn)

	# Web ShellTopChrome: Lucide Settings cog — CenterContainer child (same as notif FAB;
	# Button.icon + expand_icon left-biases and ghost margins clip the glyph).
	var settings_btn := Button.new()
	settings_btn.focus_mode = Control.FOCUS_NONE
	settings_btn.tooltip_text = "Settings"
	settings_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	settings_btn.custom_minimum_size = Vector2(40, 36)
	settings_btn.text = ""
	settings_btn.icon = null
	ClientUi.apply_ghost_button(settings_btn)
	for state in ["normal", "hover", "pressed", "disabled", "focus"]:
		var sb := settings_btn.get_theme_stylebox(state)
		if sb is StyleBoxFlat:
			var flat := (sb as StyleBoxFlat).duplicate() as StyleBoxFlat
			flat.content_margin_left = 0
			flat.content_margin_right = 0
			flat.content_margin_top = 0
			flat.content_margin_bottom = 0
			settings_btn.add_theme_stylebox_override(state, flat)
	var settings_host := CenterContainer.new()
	settings_host.name = "SettingsIconHost"
	settings_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	settings_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	settings_btn.add_child(settings_host)
	settings_host.add_child(UiIcon.make("settings", ClientUi.MUTED, 22.0))
	settings_btn.pressed.connect(func() -> void: GameManager.go_settings())
	row.add_child(settings_btn)

	# Admin-only entry — never shown to non-admins (server still enforces role).
	if AdminManager.is_admin():
		var admin_btn := Button.new()
		admin_btn.text = "ADMIN"
		admin_btn.tooltip_text = "Admin Console"
		admin_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		ClientUi.apply_danger_button(admin_btn)
		admin_btn.pressed.connect(func() -> void: GameManager.go_admin())
		row.add_child(admin_btn)

	return top

func _make_rail() -> Control:
	## Side-rail invariant (permanent):
	## - Operative console is fixed-height chrome (SHRINK) at the top of the rail.
	## - All page nav buttons live in the leftover height under the console — never
	##   in a ScrollContainer. They must all stay visible at every window height.
	## - Every page button shares equal height; group headings stay; gaps between
	##   groups stay slightly larger than gaps between buttons inside a group.
	## - Growing/shrinking the console only changes leftover nav height (buttons
	##   rescale). Changing nav must not force the console to grow/scroll.
	## - No minimum button height / font floor — fit comes first.
	var rail := PanelContainer.new()
	rail.custom_minimum_size.x = ClientUi.px(272)
	rail.size_flags_vertical = Control.SIZE_EXPAND_FILL
	# Critical: rail must shrink with the window — never dictate shell height.
	rail.clip_contents = true
	rail.add_theme_stylebox_override(
		"panel",
		_shell_panel_style(Color(0.038, 0.052, 0.08, 0.99), Color(0.15, 0.25, 0.32, 0.95), 5, 6, 4)
	)

	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 4)
	rail.add_child(col)

	var console_header := HBoxContainer.new()
	console_header.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	col.add_child(console_header)
	var console_label := Label.new()
	console_label.text = "OPERATIVE CONSOLE"
	console_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	console_label.add_theme_font_size_override("font_size", 15)
	console_label.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.82))
	ClientUi.apply_display_font(console_label)
	console_header.add_child(console_label)
	var online := CenterContainer.new()
	online.custom_minimum_size = Vector2(14, 14)
	online.add_child(UiIcon.make("circle", ClientUi.CYAN, 10.0))
	console_header.add_child(online)

	col.add_child(_make_operative_panel())
	var sep := HSeparator.new()
	sep.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	col.add_child(sep)

	# Nav band: fills everything under the console. Never wrap in a ScrollContainer.
	var nav := VBoxContainer.new()
	nav.name = "SideNav"
	nav.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nav.size_flags_vertical = Control.SIZE_EXPAND_FILL
	nav.add_theme_constant_override("separation", 4) # group gap > in-group button gap
	col.add_child(nav)
	for group in _nav_groups():
		var items: Array = group.get("items", [])
		var item_count := 0
		for item in items:
			if typeof(item) == TYPE_DICTIONARY:
				item_count += 1
		var group_box := VBoxContainer.new()
		group_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
		# Stretch ∝ button count → every page button ends up the same height
		# even when Battle has 3 items and Explore/Trade have 4.
		group_box.size_flags_stretch_ratio = float(maxi(item_count, 1))
		group_box.add_theme_constant_override("separation", 1)
		nav.add_child(group_box)
		var heading := Label.new()
		heading.text = str(group.get("name", "")).to_upper()
		heading.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		heading.add_theme_font_size_override("font_size", 12)
		heading.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.55))
		ClientUi.apply_display_font(heading)
		group_box.add_child(heading)
		for item in items:
			if typeof(item) != TYPE_DICTIONARY:
				continue
			var path := str(item.get("path", ""))
			var tint := Color(str(item.get("color", "#0DCADF")))
			var btn := Button.new()
			btn.text = ""
			btn.flat = false
			btn.focus_mode = Control.FOCUS_NONE
			btn.size_flags_vertical = Control.SIZE_EXPAND_FILL
			btn.size_flags_stretch_ratio = 1.0
			btn.custom_minimum_size.y = 0 # no height floor — always fit all 15
			var coming_soon := FeatureFlags.is_coming_soon(str(item.get("feature_id", "")))
			if coming_soon:
				btn.disabled = true
				btn.tooltip_text = FeatureFlags.coming_soon_tooltip(str(item.get("feature_id", "")))
				btn.mouse_default_cursor_shape = Control.CURSOR_ARROW
			else:
				btn.pressed.connect(_on_nav_pressed.bind(path))
			var tutorial_id := ""
			if path == GameManager.SCENE_STATS:
				tutorial_id = "nav-hero"
			elif path == GameManager.SCENE_CANTINA:
				tutorial_id = "nav-cantina"
			elif path == GameManager.SCENE_GALAXY:
				tutorial_id = "nav-frontier"
			elif path == GameManager.SCENE_FRIENDS:
				tutorial_id = "nav-friends"
			elif path == GameManager.SCENE_MAIL:
				tutorial_id = "nav-mail"
			elif path == GameManager.SCENE_ARENA:
				tutorial_id = "nav-arena"
			elif path == GameManager.SCENE_LEADERBOARD:
				tutorial_id = "nav-ranks"
			elif path == GameManager.SCENE_SHOP:
				tutorial_id = "nav-shop"
			elif path == GameManager.SCENE_CASINO:
				tutorial_id = "nav-casino"
			elif path == GameManager.SCENE_MINING:
				tutorial_id = "nav-mine"
			if not tutorial_id.is_empty():
				TutorialManager.tag_target(btn, tutorial_id)
			group_box.add_child(btn)

			var pad := MarginContainer.new()
			pad.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
			pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
			pad.add_theme_constant_override("margin_left", 12)
			pad.add_theme_constant_override("margin_right", 8)
			pad.add_theme_constant_override("margin_top", 2)
			pad.add_theme_constant_override("margin_bottom", 2)
			btn.add_child(pad)

			var row := HBoxContainer.new()
			row.mouse_filter = Control.MOUSE_FILTER_IGNORE
			row.alignment = BoxContainer.ALIGNMENT_CENTER
			row.add_theme_constant_override("separation", 14)
			pad.add_child(row)

			# Web ShellSidebar: Lucide icon always uses item color — even when inactive.
			var icon_tex := NavIcon.make(str(item.get("icon", "user")), tint, 22.0)
			row.add_child(icon_tex)

			var name_lab := NavNeonLabel.new()
			name_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			name_lab.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			name_lab.configure(str(item.get("label", "")), tint, 22)
			row.add_child(name_lab)

			var entry := {
				"button": btn,
				"icon": icon_tex,
				"label": name_lab,
				"tint": tint,
				"active": false,
				"coming_soon": coming_soon,
				"feature_id": str(item.get("feature_id", "")),
			}
			_nav_buttons[path] = entry
			if not coming_soon:
				btn.mouse_entered.connect(func() -> void: _on_nav_hover(path, true))
				btn.mouse_exited.connect(func() -> void: _on_nav_hover(path, false))
			_style_nav_button(entry, false)
	return rail


func _on_nav_hover(path: String, hovering: bool) -> void:
	if not _nav_buttons.has(path):
		return
	var entry: Dictionary = _nav_buttons[path]
	if bool(entry.get("active", false)):
		return
	var name_lab: NavNeonLabel = entry.get("label")
	# Icons stay a fixed tint — neon sweep is letters only.
	if name_lab != null and is_instance_valid(name_lab):
		name_lab.set_neon(hovering)


func _style_nav_button(entry: Dictionary, active: bool) -> void:
	var btn: Button = entry.get("button")
	var icon_tex: TextureRect = entry.get("icon")
	var name_lab: NavNeonLabel = entry.get("label")
	var tint: Color = entry.get("tint", ClientUi.CYAN)
	var coming_soon := bool(entry.get("coming_soon", false))
	if btn == null or not is_instance_valid(btn):
		return
	entry["active"] = active
	if not coming_soon:
		ClientUi.apply_interaction_motion(btn, 1.015)
	# No hover/active chrome — transparent always; feedback is the letter neon only.
	var clear := Color(0, 0, 0, 0)
	btn.add_theme_stylebox_override("normal", _nav_style(clear, clear))
	btn.add_theme_stylebox_override("hover", _nav_style(clear, clear))
	btn.add_theme_stylebox_override("pressed", _nav_style(clear, clear))
	btn.add_theme_stylebox_override("focus", _nav_style(clear, clear))
	btn.add_theme_stylebox_override("disabled", _nav_style(clear, clear))
	btn.add_theme_color_override("font_color", Color(0, 0, 0, 0))
	btn.add_theme_color_override("font_hover_color", Color(0, 0, 0, 0))
	btn.add_theme_color_override("font_pressed_color", Color(0, 0, 0, 0))
	btn.add_theme_color_override("font_disabled_color", Color(0, 0, 0, 0))
	# Grey out Coming Soon entries without removing them from the rail.
	btn.modulate = Color(0.55, 0.55, 0.58, 0.72) if coming_soon else Color.WHITE

	var draw_tint := Color(tint, 0.45) if coming_soon else tint
	if icon_tex != null and is_instance_valid(icon_tex):
		NavIcon.set_tint(icon_tex, draw_tint)
	if name_lab != null and is_instance_valid(name_lab):
		name_lab.neon_tint = draw_tint
		name_lab.set_neon(false if coming_soon else active)


func _nav_style(bg: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(0)
	style.set_corner_radius_all(8)
	style.content_margin_left = 0
	style.content_margin_right = 0
	style.content_margin_top = 0
	style.content_margin_bottom = 0
	return style


func _make_operative_panel() -> Control:
	## Fixed-height console chrome. Must stay SIZE_SHRINK_BEGIN so the SideNav
	## band under it can expand/contract and keep all page buttons visible.
	var panel := VBoxContainer.new()
	panel.name = "OperativeConsole"
	panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	panel.add_theme_constant_override("separation", 2)

	## Portrait + stim bubbles share one fixed-height band so active stims
	## never grow the console or compress side-nav buttons.
	var portrait_area := Control.new()
	portrait_area.name = "OperativePortraitArea"
	portrait_area.custom_minimum_size.y = 283
	portrait_area.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	portrait_area.mouse_filter = Control.MOUSE_FILTER_PASS
	# Portrait draws auras inside its own square; no need to clip the band itself.
	portrait_area.clip_contents = false
	panel.add_child(portrait_area)

	_portrait_host = CenterContainer.new()
	_portrait_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_portrait_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_portrait_host.clip_contents = false
	portrait_area.add_child(_portrait_host)

	_effects = ActiveEffectsBar.make()
	_effects.console_bubbles = true
	_effects.mouse_filter = Control.MOUSE_FILTER_STOP
	# Overlay beside the head inside the fixed portrait band (does not grow console).
	_effects.anchor_left = 1.0
	_effects.anchor_right = 1.0
	_effects.anchor_top = 0.0
	_effects.anchor_bottom = 0.0
	_effects.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_effects.grow_vertical = Control.GROW_DIRECTION_END
	_effects.offset_left = -56
	_effects.offset_right = -2
	_effects.offset_top = 44
	_effects.offset_bottom = 200
	portrait_area.add_child(_effects)

	_operative_name = Button.new()
	_operative_name.flat = true
	_operative_name.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_operative_name.tooltip_text = "Open character sheet"
	_operative_name.add_theme_font_size_override("font_size", 17)
	_operative_name.add_theme_color_override("font_color", ClientUi.TEXT)
	_operative_name.add_theme_color_override("font_hover_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(_operative_name)
	_operative_name.pressed.connect(func() -> void:
		if TutorialManager.should_show():
			return
		GameManager.go_stats()
	)
	TutorialManager.tag_target(_operative_name, "shell-operative")
	panel.add_child(_operative_name)

	_operative_meta = Label.new()
	_operative_meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_operative_meta.add_theme_font_size_override("font_size", 15)
	_operative_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	panel.add_child(_operative_meta)

	_xp_label = Label.new()
	_xp_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_xp_label.add_theme_font_size_override("font_size", 14)
	_xp_label.add_theme_color_override("font_color", ClientUi.BRAND_GRAD_NEAR_WHITE)
	panel.add_child(_xp_label)
	_xp_bar = ProgressBar.new()
	_xp_bar.show_percentage = false
	_xp_bar.custom_minimum_size.y = 8
	ClientUi.apply_xp_bar(_xp_bar)
	panel.add_child(_xp_bar)

	_operative_title = Label.new()
	_operative_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_operative_title.add_theme_font_size_override("font_size", 14)
	_operative_title.add_theme_color_override("font_color", ClientUi.GOLD)
	ClientUi.apply_display_font(_operative_title)
	panel.add_child(_operative_title)

	var wallet := VBoxContainer.new()
	wallet.name = "WalletReadouts"
	wallet.set_meta("tutorial_id", "shell-wallet")
	wallet.add_to_group("tutorial_target")
	wallet.add_theme_constant_override("separation", 4)
	panel.add_child(wallet)
	_fuel_value = _make_readout(wallet, "fuel", Color("#39FF14"))
	var fuel_pane := _fuel_value.get_parent().get_parent() as Control
	if fuel_pane != null:
		TutorialManager.tag_target(fuel_pane, "shell-fuel")
	_stardust_value = _make_readout(wallet, "stardust", Color("#E879F9"))
	_nova_value = _make_readout(wallet, "nova", Color("#FFD700"), true)

	TutorialManager.tag_target(panel, "shell-operative")
	TutorialManager.tag_target(portrait_area, "shell-operative")
	return panel


## Write a readout and flash it when the number actually moved.
func _set_readout(label: Label, value: String) -> void:
	if label == null or label.text == value:
		return
	var first := label.text.is_empty()
	label.text = value
	if first:
		return
	if label.has_meta("readout_tween"):
		var previous: Variant = label.get_meta("readout_tween")
		if previous is Tween and (previous as Tween).is_valid():
			(previous as Tween).kill()
	var tween := label.create_tween()
	label.set_meta("readout_tween", tween)
	tween.tween_property(label, "modulate", Color(1.45, 1.5, 1.55, 1.0), 0.08)
	tween.tween_property(label, "modulate", Color.WHITE, 0.28)


func _format_rail_amount(value: Variant) -> String:
	# Exact integer display — no K/M/B rounding; keep full digits with separators.
	var n := 0
	match typeof(value):
		TYPE_INT:
			n = int(value)
		TYPE_FLOAT:
			n = int(value) # truncate .0 from JSON floats; do not round
		_:
			var raw := str(value).strip_edges()
			if raw.contains("."):
				raw = raw.get_slice(".", 0)
			n = int(raw) if raw.is_valid_int() else 0
	var neg := n < 0
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3, 3) + out
		s = s.substr(0, s.length() - 3)
	out = s + out
	return ("-" if neg else "") + out


func _fit_currency_fonts() -> void:
	# Base value size is +40% over the previous 18px console readout (→ 25).
	# Shrink only for very long exact values — never touch rail / console layout.
	var max_len := 0
	for lab in [_fuel_value, _stardust_value, _nova_value]:
		if lab != null and is_instance_valid(lab):
			max_len = maxi(max_len, lab.text.length())
	var value_size := 25
	if max_len > 18:
		value_size = 16
	elif max_len > 14:
		value_size = 18
	elif max_len > 11:
		value_size = 20
	for lab in [_fuel_value, _stardust_value, _nova_value]:
		if lab == null or not is_instance_valid(lab):
			continue
		lab.add_theme_font_size_override("font_size", value_size)
		lab.visible = true


func _wallet_pane_inner_height() -> float:
	# Wallet readout stylebox uses margin_y = 4 on top and bottom.
	return _WALLET_PANE_HEIGHT - 8.0


func _wallet_icon_display_size() -> float:
	return _wallet_pane_inner_height() - _WALLET_ICON_INSET * 2.0


func _wallet_readout_border_color(tint: Color) -> Color:
	return Color(tint, 0.45)


func _make_wallet_divider(color: Color, height: float) -> Control:
	var host := Control.new()
	host.custom_minimum_size = Vector2(1, height)
	host.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var line := ColorRect.new()
	line.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	line.color = color
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(line)
	return host


func _make_readout(parent: Control, icon_id: String, tint: Color, open_store := false) -> Label:
	var frame := PanelContainer.new()
	var border_color := _wallet_readout_border_color(tint)
	frame.custom_minimum_size.y = _WALLET_PANE_HEIGHT
	frame.add_theme_stylebox_override(
		"panel",
		_shell_panel_style(Color(0.055, 0.07, 0.105, 0.96), border_color, 7, 8, 4)
	)
	parent.add_child(frame)
	var inner_h := _wallet_pane_inner_height()
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 0)
	frame.add_child(row)

	var icon_col := CenterContainer.new()
	icon_col.custom_minimum_size = Vector2(_WALLET_ICON_COLUMN, inner_h)
	icon_col.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon_col)
	var icon := CurrencyIcon.make(icon_id, _wallet_icon_display_size())
	match icon_id:
		"fuel":
			icon.tooltip_text = "Fuel"
		"stardust":
			icon.tooltip_text = "Stardust"
		_:
			icon.tooltip_text = "Nova Crystals"
	icon_col.add_child(icon)

	var icon_gap := Control.new()
	icon_gap.custom_minimum_size = Vector2(_WALLET_DIVIDER_GAP, 0)
	icon_gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon_gap)
	row.add_child(_make_wallet_divider(border_color, inner_h))

	var value_gap := Control.new()
	value_gap.custom_minimum_size = Vector2(_WALLET_VALUE_GAP, 0)
	value_gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(value_gap)

	var value := Label.new()
	# Amount must always read clearly next to the icon — never clip away digits.
	value.text = "0"
	value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	value.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	value.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	value.clip_text = false
	value.autowrap_mode = TextServer.AUTOWRAP_OFF
	value.add_theme_font_size_override("font_size", 33)
	value.add_theme_color_override("font_color", tint.lightened(0.15))
	ClientUi.apply_bold_display_font(value)
	value.set_meta("readout_icon", icon)
	row.add_child(value)

	# Reserve the same trailing width on every row so values share one center line.
	var trailing := CenterContainer.new()
	trailing.custom_minimum_size = Vector2(_WALLET_TRAILING_SIZE, _WALLET_TRAILING_SIZE)
	trailing.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	trailing.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(trailing)
	if open_store:
		trailing.add_child(_make_nova_store_button(tint))
	return value


func _make_nova_store_button(tint: Color) -> Button:
	var plus := Button.new()
	plus.focus_mode = Control.FOCUS_NONE
	plus.text = ""
	plus.custom_minimum_size = Vector2(_WALLET_TRAILING_SIZE, _WALLET_TRAILING_SIZE)
	plus.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	plus.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	plus.tooltip_text = "Crystal Store"
	var plus_style := StyleBoxFlat.new()
	plus_style.bg_color = Color(tint.lightened(0.05), 0.92)
	plus_style.border_color = Color(tint.lightened(0.25), 1.0)
	plus_style.set_border_width_all(1)
	plus_style.set_corner_radius_all(5)
	plus_style.content_margin_left = 0
	plus_style.content_margin_right = 0
	plus_style.content_margin_top = 0
	plus_style.content_margin_bottom = 0
	plus.add_theme_stylebox_override("normal", plus_style)
	var plus_hover := plus_style.duplicate() as StyleBoxFlat
	plus_hover.bg_color = Color(tint.lightened(0.2), 1.0)
	plus.add_theme_stylebox_override("hover", plus_hover)
	plus.add_theme_stylebox_override("pressed", plus_hover)
	plus.add_theme_stylebox_override("focus", plus_style.duplicate())
	var plus_host := CenterContainer.new()
	plus_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plus_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	plus.add_child(plus_host)
	# Lucide plus TextureRect — true geometric center (Label "+" sits low on font baseline).
	var glyph_size := maxf(14.0, _WALLET_TRAILING_SIZE - 10.0)
	plus_host.add_child(UiIcon.make("plus", Color("#1A1400"), glyph_size))
	plus.pressed.connect(func() -> void: GameManager.go_crystal_store())
	_start_nova_plus_pulse(plus)
	return plus

func _start_nova_plus_pulse(plus: Button) -> void:
	## Soft flash + scale pop so the Crystal Store affordance reads at a glance.
	if plus == null or not is_instance_valid(plus):
		return
	plus.pivot_offset = plus.custom_minimum_size * 0.5
	var tween := plus.create_tween().set_loops()
	tween.tween_property(plus, "modulate", Color(1.45, 1.3, 0.65, 1.0), 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.parallel().tween_property(plus, "scale", Vector2(1.14, 1.14), 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(plus, "modulate", Color.WHITE, 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.parallel().tween_property(plus, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func _nav_groups() -> Array:
	## Icons match web `src/lib/navGroups.js` Lucide set (order top→bottom).
	## Colors stay as existing rail tints; NavIcon modulates white SVGs to them.
	return [
		{"name": "Explore", "items": [
			{"path": GameManager.SCENE_STATS, "label": "Operative", "icon": "user", "color": "#00E5FF"},
			{"path": GameManager.SCENE_CANTINA, "label": "Cantina", "icon": "beer", "color": "#FF8C00"},
			{"path": GameManager.SCENE_GALAXY, "label": "Galactic Frontier", "icon": "orbit", "color": "#BA55D3"},
			{"path": GameManager.SCENE_SHIP, "label": "Coming Soon", "icon": "rocket", "color": "#2DD4BF", "feature_id": FeatureFlags.FEATURE_SHIP_HANGAR},
		]},
		{"name": "Social", "items": [
			{"path": GameManager.SCENE_FRIENDS, "label": "Friends", "icon": "users", "color": "#A855F7"},
			{"path": GameManager.SCENE_MESSAGES, "label": "Chat", "icon": "message-square", "color": "#38BDF8"},
			{"path": GameManager.SCENE_MAIL, "label": "Mail", "icon": "mail", "color": "#16A34A"},
			{"path": GameManager.SCENE_GUILD, "label": "Guild", "icon": "users", "color": "#B45309"},
		]},
		{"name": "Battle", "items": [
			{"path": GameManager.SCENE_ARENA, "label": "Arena", "icon": "swords", "color": "#FB7185"},
			{"path": GameManager.SCENE_LEADERBOARD, "label": "Ranks", "icon": "trophy", "color": "#34D399"},
			{"path": GameManager.SCENE_NEXUS, "label": "Nexus", "icon": "crown", "color": "#60A5FA"},
		]},
		{"name": "Trade", "items": [
			{"path": GameManager.SCENE_SHOP, "label": "Black Market", "icon": "shopping-bag", "color": "#9D6BFF"},
			{"path": GameManager.SCENE_CASINO, "label": "Casino", "icon": "dice-5", "color": "#FBBF24"},
			{"path": GameManager.SCENE_VOID, "label": "Coming Soon", "icon": "orbit", "color": "#14B8A6", "feature_id": FeatureFlags.FEATURE_VOID},
			{"path": GameManager.SCENE_MINING, "label": "Mine", "icon": "pickaxe", "color": "#EC4899"},
		]},
	]


func _on_nav_pressed(path: String) -> void:
	if path.is_empty():
		return
	if path == GameManager.SCENE_VOID and FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_VOID):
		return
	if path == GameManager.SCENE_SHIP and FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return
	if TutorialManager.should_show() and not TutorialManager.nav_allowed(path):
		return
	GameManager.open_game_page(path)


## Gate for GameManager.open_game_page — drops rapid / duplicate clicks before deferred load.
func try_begin_page_nav(path: String) -> bool:
	if path.is_empty():
		return false
	if TutorialManager.locks_combat_navigation() and has_combat_replay_overlay():
		Notify.blocked("Finish the tutorial fight first")
		return false
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_VOID) and path == GameManager.SCENE_VOID:
		return false
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR) and path == GameManager.SCENE_SHIP:
		return false
	if _page_swap_busy or _page_nav_pending:
		return false
	# Same page under a dismissed overlay (Arena after a fight) must still
	# run show_page → on_shell_reshow so reminted challenger cards replace
	# the pre-fight portraits.
	if path == _page_path and _page != null and is_instance_valid(_page):
		if _page_live_refresh_active:
			return false
		if _page.has_method("on_shell_reshow"):
			_page_nav_pending = true
			return true
		return false
	var now := Time.get_ticks_msec()
	if now - _last_nav_ms < NAV_COOLDOWN_MS:
		return false
	_last_nav_ms = now
	_page_nav_pending = true
	return true


func show_page(path: String) -> void:
	_page_nav_pending = false
	if path.is_empty():
		return
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_VOID) and path == GameManager.SCENE_VOID:
		return
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR) and path == GameManager.SCENE_SHIP:
		return
	if path == _page_path and _page != null and is_instance_valid(_page):
		_refresh_kept_page(_page)
		return

	# Never re-enter while a page is mounting — that freed nodes mid-_ready.
	if _page_swap_busy:
		return

	_cancel_live_page_refresh()
	_pause_nav_warmup()
	_page_swap_busy = true
	# Failsafe — never leave the shell permanently locked if a page script errors mid-mount.
	_page_swap_token += 1
	var swap_token := _page_swap_token
	var tree := get_tree()
	if tree != null:
		tree.create_timer(2.0).timeout.connect(func() -> void:
			if _page_swap_busy and _page_swap_token == swap_token:
				push_warning("Page swap lock released by failsafe")
				_page_swap_busy = false
				_page_nav_pending = false
				_set_nav_buttons_enabled(true)
		, CONNECT_ONE_SHOT)
	# Navigating to a normal page dismisses battle overlays (web portal behavior).
	if path not in [
		GameManager.SCENE_ARENA_COMBAT,
		GameManager.SCENE_MISSION_COMBAT,
		GameManager.SCENE_GALAXY_COMBAT,
	]:
		if TutorialManager.locks_combat_navigation() and has_combat_replay_overlay():
			Notify.blocked("Finish the tutorial fight first")
			_page_swap_busy = false
			_page_nav_pending = false
			return
		clear_overlays()
	var outgoing_path := _page_path
	_page_path = path
	GameManager.pending_page_path = path
	ClientUi.apply_atmosphere_mood(_atmosphere, _mood_for_page(path))
	_sync_hud_mood(_mood_for_page(path))
	if _page != null and is_instance_valid(_page):
		var outgoing := _page
		_page = null
		if _retains_page_instance(outgoing_path):
			_park_page(outgoing)
			_page_instances[outgoing_path] = outgoing
		else:
			_page_instances.erase(outgoing_path)
			outgoing.queue_free()
	var restored := false
	if _retains_page_instance(path) and _page_instances.has(path) and is_instance_valid(_page_instances[path]):
		_page = _page_instances[path]
		_unpark_page(_page)
		restored = true
	else:
		var packed := _load_packed(path)
		if packed == null:
			push_error("Could not load shell page: %s" % path)
			_page_swap_busy = false
			_schedule_nav_warmup_resume()
			return
		_page = packed.instantiate()
		# If the page script failed to compile, Godot still returns a bare Control.
		# Leaving it full-rect + alpha 0 + MOUSE_FILTER_STOP freezes the whole shell.
		var script_ok := true
		if path == GameManager.SCENE_STATS:
			script_ok = _page.has_method("_populate")
		elif path == GameManager.SCENE_HUB:
			script_ok = _page.has_method("_populate") and _page.has_method("_build")
		elif path == GameManager.SCENE_CANTINA:
			script_ok = _page.has_method("_render") and _page.has_method("_build")
		elif path == GameManager.SCENE_SHOP:
			script_ok = _page.has_method("_populate") and _page.has_method("_build")
		if not script_ok:
			push_error("Shell page script failed to load (%s) — refusing blank input blocker" % path)
			_page.free()
			_page = null
			_page_path = ""
			GameManager.current_page_path = ""
			_page_swap_busy = false
			_set_nav_buttons_enabled(true)
			_schedule_nav_warmup_resume()
			return
		_content.add_child(_page)
		if _retains_page_instance(path):
			_page_instances[path] = _page
	_restack_content_layers()
	_hero_page_open = path == GameManager.SCENE_STATS
	if _page is Control:
		var page_control := _page as Control
		page_control.mouse_filter = Control.MOUSE_FILTER_STOP
		page_control.scale = Vector2.ONE
		page_control.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		page_control.modulate.a = 0.0
		# Fit then enter in one deferred pass so they cannot race.
		# Restored pages keep their built tree visible after the fade — live
		# refresh must not hide them again while staging RPCs wait.
		call_deferred("_fit_and_enter_page", page_control)
		if restored:
			call_deferred("_refresh_kept_page", _page)
	_update_nav_state()
	_refresh_chrome()
	_apply_console_portrait_mode()
	# Unlock immediately after mount — never hold the nav lock across network awaits
	# (Hero sheet boots with awaits; a hung refresh used to freeze the whole shell).
	_page_swap_busy = false
	_set_nav_buttons_enabled(true)
	_schedule_nav_warmup_resume()
	# Badge updates from Realtime + opening the notif dock; avoid GetNotifications on every hop.
	_update_notif_badge()
	call_deferred("_notify_tutorial_page_ready", path)


func _notify_tutorial_page_ready(path: String) -> void:
	if _page_path != path or _page == null or not is_instance_valid(_page):
		return
	GameManager.current_page_path = path
	TutorialManager.notify_page_changed(path)


func _keeps_page(path: String) -> bool:
	if path.is_empty():
		return false
	return path not in [
		GameManager.SCENE_MISSION_RUN,
		GameManager.SCENE_MISSION_COMBAT,
		GameManager.SCENE_ARENA_COMBAT,
		GameManager.SCENE_GALAXY_COMBAT,
	]


func _retains_page_instance(path: String) -> bool:
	return (
		RETAIN_RENDERED_PAGE_INSTANCES
		and _keeps_page(path)
		and path in [
			GameManager.SCENE_HUB,
			GameManager.SCENE_STATS,
			GameManager.SCENE_SHOP,
			GameManager.SCENE_ARENA,
			GameManager.SCENE_CANTINA,
			GameManager.SCENE_GALAXY,
			GameManager.SCENE_LEADERBOARD,
		]
	)


func _load_packed(path: String) -> PackedScene:
	if _packed_cache.has(path):
		var hit: Variant = _packed_cache[path]
		if hit is PackedScene:
			return hit
	var packed := load(path) as PackedScene
	if packed != null:
		_packed_cache[path] = packed
	return packed


func _park_page(page: Node) -> void:
	if page == null or not is_instance_valid(page):
		return
	_stop_page_audio(page)
	page.process_mode = Node.PROCESS_MODE_DISABLED
	if page is Control:
		var control := page as Control
		control.visible = false
		control.mouse_filter = Control.MOUSE_FILTER_IGNORE
		control.modulate.a = 1.0


func _unpark_page(page: Node) -> void:
	if page == null or not is_instance_valid(page):
		return
	page.process_mode = Node.PROCESS_MODE_INHERIT
	if page is Control:
		var control := page as Control
		control.visible = true
		control.mouse_filter = Control.MOUSE_FILTER_STOP
		control.modulate.a = 1.0
		control.scale = Vector2.ONE
		control.set_anchors_and_offsets_preset(PRESET_FULL_RECT)


func _stop_page_audio(root: Node) -> void:
	if root is AudioStreamPlayer:
		(root as AudioStreamPlayer).stop()
	elif root is AudioStreamPlayer2D:
		(root as AudioStreamPlayer2D).stop()
	for child in root.get_children():
		_stop_page_audio(child)


func _refresh_kept_page(page: Node) -> void:
	if page == null or not is_instance_valid(page) or page != _page:
		return
	if _page_live_refresh_active:
		return
	if not page.has_method("on_shell_reshow"):
		return
	_page_live_refresh_token += 1
	var refresh_token := _page_live_refresh_token
	_page_live_refresh_active = true
	# Refresh in place. Zeroing alpha + the station veil left Hub/chrome-visible
	# pages blank for the whole staging round-trip (or forever on a hung RPC).
	await page.call("on_shell_reshow")
	_finish_live_page_refresh(page, refresh_token)


func _finish_live_page_refresh(page: Node, refresh_token: int) -> void:
	if refresh_token != _page_live_refresh_token:
		return
	_page_live_refresh_active = false
	StationLoadingOverlay.hide_loading()
	if page == null or page != _page or not is_instance_valid(page):
		return
	if page is Control:
		(page as Control).modulate.a = 1.0


func _cancel_live_page_refresh() -> void:
	_page_live_refresh_token += 1
	if not _page_live_refresh_active:
		return
	_page_live_refresh_active = false
	StationLoadingOverlay.hide_loading()
	if _page is Control and is_instance_valid(_page):
		(_page as Control).modulate.a = 1.0


func _purge_parked_pages() -> void:
	var live: Node = _page
	for path in _page_instances.keys():
		var parked: Variant = _page_instances[path]
		if parked == live or not (parked is Node):
			continue
		var node := parked as Node
		if is_instance_valid(node):
			node.queue_free()
	_page_instances.clear()
	if live != null and is_instance_valid(live) and not _page_path.is_empty():
		_page_instances[_page_path] = live


func _begin_nav_warmup() -> void:
	_warm_queue.clear()
	var seen: Dictionary = {}
	# Heavy first-open pages first so lingering on the hub precompiles them
	# without blocking a click that already started.
	var priority: Array = [
		GameManager.SCENE_SHOP,
		GameManager.SCENE_STATS,
		GameManager.SCENE_CANTINA,
		GameManager.SCENE_ARENA,
	]
	for path in priority:
		var p := str(path)
		if p.is_empty() or seen.has(p) or _is_ephemeral_or_missing(p):
			continue
		seen[p] = true
		_warm_queue.append(p)
	for group in _nav_groups():
		if typeof(group) != TYPE_DICTIONARY:
			continue
		for item in group.get("items", []):
			if typeof(item) != TYPE_DICTIONARY:
				continue
			var path := str(item.get("path", ""))
			if path.is_empty() or seen.has(path) or _is_ephemeral_or_missing(path):
				continue
			seen[path] = true
			_warm_queue.append(path)
	for extra in [
		GameManager.SCENE_HUB,
		GameManager.SCENE_SETTINGS,
		GameManager.SCENE_CRYSTAL_STORE,
		GameManager.SCENE_COLLECTIBLES,
		GameManager.SCENE_PROGRESS,
		GameManager.SCENE_CODEX,
		GameManager.SCENE_NOTIFICATIONS,
	]:
		if seen.has(extra) or _is_ephemeral_or_missing(extra):
			continue
		seen[extra] = true
		_warm_queue.append(extra)
	_warmup_paused = false
	call_deferred("_warm_next_scene")


func _is_ephemeral_or_missing(path: String) -> bool:
	return path.is_empty() or not _keeps_page(path) or not ResourceLoader.exists(path)


func _pause_nav_warmup() -> void:
	_warmup_paused = true


func _schedule_nav_warmup_resume() -> void:
	_warmup_paused = false
	if _warm_queue.is_empty() or not is_inside_tree():
		return
	var tree := get_tree()
	if tree == null:
		return
	tree.create_timer(NAV_WARMUP_RESUME_DELAY_SEC).timeout.connect(
		_warm_next_scene,
		CONNECT_ONE_SHOT,
	)


func _warm_next_scene() -> void:
	if not is_inside_tree() or _warmup_paused or _page_swap_busy:
		return
	while not _warm_queue.is_empty():
		var path := str(_warm_queue.pop_front())
		if path.is_empty() or _packed_cache.has(path):
			continue
		if not ResourceLoader.exists(path):
			continue
		var packed := load(path) as PackedScene
		if packed != null:
			_packed_cache[path] = packed
		break
	if not _warm_queue.is_empty() and not _warmup_paused and not _page_swap_busy:
		call_deferred("_warm_next_scene")


func _set_nav_buttons_enabled(enabled: bool) -> void:
	# Force-enable the rail after swaps. Older builds disabled buttons during load and
	# could leave the side nav dead if a Hero mount stalled.
	for path in _nav_buttons:
		var data: Dictionary = _nav_buttons[path]
		var btn: Variant = data.get("button", null)
		if btn is BaseButton and is_instance_valid(btn):
			var coming_soon := bool(data.get("coming_soon", false))
			var allow := enabled and not coming_soon
			(btn as BaseButton).disabled = not allow
			(btn as BaseButton).mouse_default_cursor_shape = (
				Control.CURSOR_ARROW if not allow else Control.CURSOR_POINTING_HAND
			)


func toggle_notifications() -> void:
	_set_notification_open(not _notif_open)
	if _notif_open:
		await _refresh_notification_center()


func _set_notification_open(open: bool) -> void:
	_notif_open = open
	_cancel_notif_hover_close()
	_notif_hovering = false
	_sync_notif_fab()
	if _notif_panel == null or not is_instance_valid(_notif_panel):
		return
	if open:
		# Expand dock stack so the sheet has room above the bottom edge.
		var stack := _notif_panel.get_parent() as Control
		if stack != null:
			stack.offset_top = -520
		_notif_panel.visible = true
		_notif_panel.modulate.a = 0.0
		_notif_panel.scale = Vector2(0.88, 0.88)
		call_deferred("_play_notif_open_anim")
		# Click opened from the tucked tab — treat as off-menu until the pointer enters.
		_arm_notif_hover_close()
	else:
		var tween := _notif_panel.create_tween()
		tween.set_parallel(true)
		tween.tween_property(_notif_panel, "modulate:a", 0.0, 0.14)
		tween.tween_property(_notif_panel, "scale", Vector2(0.92, 0.92), 0.14)
		tween.chain().tween_callback(func() -> void:
			if is_instance_valid(_notif_panel) and not _notif_open:
				_notif_panel.visible = false
				_notif_panel.scale = Vector2.ONE
				var stack := _notif_panel.get_parent() as Control
				if stack != null:
					stack.offset_top = -16
		)


func _play_notif_open_anim() -> void:
	if not _notif_open or _notif_panel == null or not is_instance_valid(_notif_panel):
		return
	# Pivot from the bottom-right so the sheet blooms upward/left into the stage.
	_notif_panel.pivot_offset = Vector2(_notif_panel.size.x, _notif_panel.size.y)
	var tween := _notif_panel.create_tween()
	tween.set_parallel(true)
	tween.tween_property(_notif_panel, "modulate:a", 1.0, 0.16)
	tween.tween_property(_notif_panel, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _arm_notif_hover_close() -> void:
	_cancel_notif_hover_close()
	if not _notif_open:
		return
	var tree := get_tree()
	if tree == null:
		return
	_notif_auto_close = tree.create_timer(NOTIF_HOVER_CLOSE_SEC)
	var token := _notif_auto_close
	token.timeout.connect(func() -> void:
		if _notif_auto_close != token or not _notif_open:
			return
		# Re-check pointer — child hops can spuriously fire mouse_exited.
		if _notif_panel_contains_mouse():
			_notif_hovering = true
			return
		_set_notification_open(false)
	)


func _cancel_notif_hover_close() -> void:
	_notif_auto_close = null


func _notif_panel_contains_mouse() -> bool:
	if _notif_panel == null or not is_instance_valid(_notif_panel) or not _notif_panel.visible:
		return false
	return _notif_panel.get_global_rect().has_point(_notif_panel.get_global_mouse_position())


func _on_notif_panel_mouse_entered() -> void:
	_notif_hovering = true
	_cancel_notif_hover_close()


func _on_notif_panel_mouse_exited() -> void:
	# Defer one frame so moving onto a child inside the panel doesn't count as leave.
	await get_tree().process_frame
	if not _notif_open:
		return
	if _notif_panel_contains_mouse():
		_notif_hovering = true
		return
	_notif_hovering = false
	_arm_notif_hover_close()


func show_overlay(node: Control) -> void:
	if node == null:
		return
	clear_overlays()
	_content.move_child(_overlay_host, -1)
	# Host must stay IGNORE — STOP on an empty full-rect host swallows every click
	# in the content stage (including after a broken/dismissed overlay).
	_overlay_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if node.mouse_filter == Control.MOUSE_FILTER_PASS:
		node.mouse_filter = Control.MOUSE_FILTER_STOP
	node.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	node.modulate.a = 0.0
	_overlay_host.add_child(node)
	var tween := node.create_tween()
	tween.tween_property(node, "modulate:a", 1.0, 0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


func show_overlay_scene(path: String) -> void:
	var packed := load(path) as PackedScene
	if packed == null:
		push_error("Could not load overlay scene: %s" % path)
		return
	var node := packed.instantiate()
	if node is Control:
		show_overlay(node as Control)
	else:
		push_error("Overlay scene is not a Control: %s" % path)
		node.queue_free()


func open_daily_login_modal() -> void:
	## Avoid stacking duplicate modals if the player double-clicks Claim Daily.
	if TutorialManager.blocks_daily_login_prompt():
		return
	if _overlay_host != null and is_instance_valid(_overlay_host):
		for child in _overlay_host.get_children():
			if child.get_script() != null and str(child.get_script().resource_path).ends_with("DailyLoginModal.gd"):
				return
	var script: Variant = load("res://Scenes/UI/DailyLoginModal.gd")
	if script == null:
		push_warning("[GameShell] DailyLoginModal.gd missing")
		return
	var modal: Control = (script as GDScript).new()
	show_overlay(modal)
	if modal.has_signal("claimed"):
		modal.claimed.connect(_on_daily_login_claimed)


func _on_daily_login_claimed(_payload: Dictionary) -> void:
	_refresh_chrome()
	await _refresh_notification_center()


func has_overlay() -> bool:
	return _overlay_host != null and is_instance_valid(_overlay_host) and _overlay_host.get_child_count() > 0


func has_combat_replay_overlay() -> bool:
	if _overlay_host == null or not is_instance_valid(_overlay_host):
		return false
	for child in _overlay_host.get_children():
		if child.has_method("handle_external_dismiss"):
			return true
	return false


func clear_overlays() -> void:
	if _overlay_host == null or not is_instance_valid(_overlay_host):
		return
	if TutorialManager.locks_combat_navigation() and has_combat_replay_overlay():
		Notify.blocked("Finish the tutorial fight first")
		return
	for child in _overlay_host.get_children():
		if child.has_method("handle_external_dismiss"):
			child.handle_external_dismiss()
		child.queue_free()
	_overlay_host.mouse_filter = Control.MOUSE_FILTER_IGNORE


func _restack_content_layers() -> void:
	## Pick order is tree order (back→front). Keep decorative layers under the page,
	## notification dock above the page, and OverlayHost on top for battle sheets.
	if _transition_flash != null and is_instance_valid(_transition_flash):
		_content.move_child(_transition_flash, 0)
	if _hud_overlay != null and is_instance_valid(_hud_overlay):
		_content.move_child(_hud_overlay, mini(1, _content.get_child_count() - 1))
	if _page != null and is_instance_valid(_page):
		_content.move_child(_page, mini(2, _content.get_child_count() - 1))
	if _notif_dock != null and is_instance_valid(_notif_dock):
		_content.move_child(_notif_dock, -1)
	if _overlay_host != null and is_instance_valid(_overlay_host):
		_content.move_child(_overlay_host, -1)
	for path in _page_instances:
		var parked: Variant = _page_instances[path]
		if parked is Node and parked != _page and is_instance_valid(parked) and parked.get_parent() == _content:
			_content.move_child(parked as Node, 0)


func _build_notification_center() -> void:
	## Slim BR edge tab + popover panel (tucks tab while open; hover-off closes).
	_notif_dock = Control.new()
	_notif_dock.name = "NotificationDock"
	_notif_dock.z_index = 90
	_notif_dock.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_notif_dock.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(_notif_dock)

	var stack := Control.new()
	stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stack.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	stack.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	stack.grow_vertical = Control.GROW_DIRECTION_BEGIN
	stack.anchor_left = 1.0
	stack.anchor_top = 1.0
	stack.anchor_right = 1.0
	stack.anchor_bottom = 1.0
	stack.offset_left = -472
	stack.offset_top = -16
	stack.offset_right = -16
	stack.offset_bottom = -16
	_notif_dock.add_child(stack)

	_notif_panel = PanelContainer.new()
	_notif_panel.visible = false
	_notif_panel.custom_minimum_size = Vector2(453, 480)
	_notif_panel.set_anchors_and_offsets_preset(PRESET_BOTTOM_RIGHT)
	_notif_panel.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_notif_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_notif_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_notif_panel.add_theme_stylebox_override(
		"panel",
		_shell_panel_style(Color(0.04, 0.05, 0.09, 0.97), Color(0.28, 0.38, 0.48, 0.7), 16, 10, 10, 1)
	)
	_notif_panel.mouse_entered.connect(_on_notif_panel_mouse_entered)
	_notif_panel.mouse_exited.connect(_on_notif_panel_mouse_exited)
	stack.add_child(_notif_panel)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	_notif_panel.add_child(col)

	var header := HBoxContainer.new()
	col.add_child(header)
	var title_row := UiIcon.make_title_row("bell", "Notifications", ClientUi.MUTED, 16, 18.0)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_row)
	_notif_meta = Label.new()
	_notif_meta.add_theme_font_size_override("font_size", 13)
	_notif_meta.add_theme_color_override("font_color", ClientUi.DANGER)
	ClientUi.apply_body_font(_notif_meta)
	header.add_child(_notif_meta)
	var mark := Button.new()
	mark.focus_mode = Control.FOCUS_NONE
	mark.tooltip_text = "Mark all read"
	mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mark.custom_minimum_size = Vector2(34, 30)
	ClientUi.apply_ghost_button(mark)
	UiIcon.set_button_icon(mark, "check-check", ClientUi.MUTED, 18.0)
	mark.pressed.connect(func() -> void:
		await NotificationManager.mark_all_read()
		await _refresh_notification_center()
	)
	header.add_child(mark)

	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size.y = 373
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(scroll)
	_notif_list = VBoxContainer.new()
	_notif_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_notif_list.add_theme_constant_override("separation", 6)
	scroll.add_child(_notif_list)

	# Slim vertical edge tab — flush right, bottom-aligned, height matches old FAB.
	var tab_wrap := Control.new()
	tab_wrap.custom_minimum_size = Vector2(NOTIF_TAB_W, NOTIF_TAB_H)
	tab_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tab_wrap.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	tab_wrap.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	tab_wrap.grow_vertical = Control.GROW_DIRECTION_BEGIN
	tab_wrap.anchor_left = 1.0
	tab_wrap.anchor_top = 1.0
	tab_wrap.anchor_right = 1.0
	tab_wrap.anchor_bottom = 1.0
	tab_wrap.offset_left = -NOTIF_TAB_W
	tab_wrap.offset_top = -NOTIF_TAB_H
	tab_wrap.offset_right = 0.0
	tab_wrap.offset_bottom = 0.0
	_notif_dock.add_child(tab_wrap)
	_notif_fab_wrap = tab_wrap

	_notif_btn = Button.new()
	_notif_btn.text = ""
	_notif_btn.tooltip_text = "Open notifications"
	_notif_btn.focus_mode = Control.FOCUS_NONE
	_notif_btn.custom_minimum_size = Vector2(NOTIF_TAB_W, NOTIF_TAB_H)
	_notif_btn.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_notif_btn.mouse_filter = Control.MOUSE_FILTER_STOP
	_notif_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_notif_btn.icon = null
	_style_notif_fab(false)
	_notif_btn.pressed.connect(toggle_notifications)
	ClientUi.apply_interaction_motion(_notif_btn, 1.03)
	tab_wrap.add_child(_notif_btn)
	_set_notif_fab_glyph("bell")

	var badge_chip := PanelContainer.new()
	badge_chip.visible = false
	badge_chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge_chip.z_index = 2
	# Sit on the inward (left) face of the tab so the count stays readable.
	badge_chip.anchor_left = 0.0
	badge_chip.anchor_top = 0.0
	badge_chip.anchor_right = 0.0
	badge_chip.anchor_bottom = 0.0
	badge_chip.offset_left = -10.0
	badge_chip.offset_top = 6.0
	badge_chip.offset_right = 12.0
	badge_chip.offset_bottom = 24.0
	var badge_bg := StyleBoxFlat.new()
	badge_bg.bg_color = ClientUi.DANGER
	badge_bg.set_corner_radius_all(9)
	badge_bg.content_margin_left = 5
	badge_bg.content_margin_right = 5
	badge_bg.content_margin_top = 1
	badge_bg.content_margin_bottom = 1
	badge_chip.add_theme_stylebox_override("panel", badge_bg)
	tab_wrap.add_child(badge_chip)
	_notif_badge_chip = badge_chip

	_notif_badge = Label.new()
	_notif_badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_notif_badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_notif_badge.add_theme_font_size_override("font_size", 12)
	_notif_badge.add_theme_color_override("font_color", Color.WHITE)
	ClientUi.apply_display_font(_notif_badge)
	_notif_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge_chip.add_child(_notif_badge)
	_notif_badge.set_meta("chip", badge_chip)


func _style_notif_fab(_open: bool) -> void:
	if _notif_btn == null or not is_instance_valid(_notif_btn):
		return
	var fill := Color(0.05, 0.08, 0.12, 0.94)
	var border := Color(ClientUi.CYAN, 0.45)
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_bottom = 1
	style.border_width_right = 0
	style.corner_radius_top_left = 10
	style.corner_radius_bottom_left = 10
	style.corner_radius_top_right = 0
	style.corner_radius_bottom_right = 0
	style.content_margin_left = 0
	style.content_margin_right = 0
	style.content_margin_top = 0
	style.content_margin_bottom = 0
	_notif_btn.add_theme_stylebox_override("normal", style)
	var hover := style.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.07, 0.12, 0.18, 0.98)
	hover.border_color = Color(ClientUi.CYAN, 0.7)
	_notif_btn.add_theme_stylebox_override("hover", hover)
	_notif_btn.add_theme_stylebox_override("pressed", hover)
	_notif_btn.add_theme_stylebox_override("focus", style)


func _set_notif_fab_glyph(icon_id: String) -> void:
	if _notif_btn == null or not is_instance_valid(_notif_btn):
		return
	_notif_btn.icon = null
	_notif_btn.text = ""
	var host := _notif_btn.get_node_or_null("FabIconHost") as CenterContainer
	if host == null:
		host = CenterContainer.new()
		host.name = "FabIconHost"
		host.mouse_filter = Control.MOUSE_FILTER_IGNORE
		host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		_notif_btn.add_child(host)
	for child in host.get_children():
		child.queue_free()
	var glyph := UiIcon.make(icon_id, ClientUi.CYAN, 18.0)
	glyph.name = "FabIcon"
	host.add_child(glyph)


func _sync_notif_fab() -> void:
	if _notif_btn == null or not is_instance_valid(_notif_btn):
		return
	# Tuck the edge tab while the panel is open; restore when closed.
	if _notif_fab_wrap != null and is_instance_valid(_notif_fab_wrap):
		var hide_for_tutorial := TutorialManager.should_show()
		_notif_fab_wrap.visible = (not _notif_open) and (not hide_for_tutorial)
	_set_notif_fab_glyph("bell")
	_notif_btn.tooltip_text = "Open notifications"
	_style_notif_fab(false)
	_update_notif_badge()


func _update_notif_badge(unread_override: int = -1) -> void:
	if _notif_badge == null or not is_instance_valid(_notif_badge):
		return
	var chip: Control = _notif_badge_chip
	if chip == null or not is_instance_valid(chip):
		chip = _notif_badge.get_meta("chip") if _notif_badge.has_meta("chip") else null
	var unread := unread_override if unread_override >= 0 else NotificationManager.unread_count
	var total := unread + (1 if ProgressManager.can_claim_daily() else 0)
	var show := not _notif_open and total > 0
	if chip != null and is_instance_valid(chip):
		chip.visible = show
	else:
		_notif_badge.visible = show
	if show:
		_notif_badge.text = "9+" if total > 9 else str(total)
	_sync_notif_badge_blink(show)


func _sync_notif_badge_blink(active: bool) -> void:
	if _notif_badge_blink != null and is_instance_valid(_notif_badge_blink):
		_notif_badge_blink.kill()
	_notif_badge_blink = null
	var chip := _notif_badge_chip
	if chip == null or not is_instance_valid(chip):
		return
	chip.modulate = Color(1, 1, 1, 1)
	if not active:
		return
	var tween := create_tween()
	tween.set_loops()
	# Two quick attention blinks, then a pause.
	tween.tween_property(chip, "modulate:a", 0.28, 0.16)
	tween.tween_property(chip, "modulate:a", 1.0, 0.16)
	tween.tween_property(chip, "modulate:a", 0.28, 0.16)
	tween.tween_property(chip, "modulate:a", 1.0, 0.16)
	tween.tween_interval(1.35)
	_notif_badge_blink = tween


func _refresh_notification_center() -> void:
	await NotificationManager.load_inbox()
	var unread := NotificationManager.unread_count
	_notif_meta.text = ("· %s new" % unread) if unread > 0 else ""
	_update_notif_badge(unread)
	for child in _notif_list.get_children():
		child.queue_free()

	if ProgressManager.can_claim_daily():
		var daily := Button.new()
		daily.text = "  Daily Reward Ready\nClaim your login reward"
		daily.alignment = HORIZONTAL_ALIGNMENT_LEFT
		daily.icon = UiIcon.texture("calendar")
		daily.expand_icon = true
		daily.add_theme_constant_override("icon_max_width", 20)
		ClientUi.apply_ghost_button(daily)
		daily.add_theme_color_override("font_color", ClientUi.GOLD)
		UiIcon.apply_button_icon_colors(daily, ClientUi.GOLD)
		daily.pressed.connect(func() -> void:
			_set_notification_open(false)
			open_daily_login_modal()
		)
		_notif_list.add_child(daily)

	var items: Array = NotificationManager.notifications
	if items.is_empty() and not ProgressManager.can_claim_daily():
		var empty := Label.new()
		empty.text = "No notifications yet."
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(empty)
		_notif_list.add_child(empty)
		return

	for n in items:
		if typeof(n) != TYPE_DICTIONARY:
			continue
		var row := Button.new()
		var title_text := str(n.get("title", n.get("type", "Alert")))
		var body_text := str(n.get("body", n.get("message", "")))
		row.text = "%s\n%s" % [title_text, body_text]
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		ClientUi.apply_ghost_button(row)
		if bool(n.get("read", false)):
			row.modulate = Color(1, 1, 1, 0.55)
		var nid := str(n.get("id", ""))
		row.pressed.connect(func() -> void:
			if not nid.is_empty():
				await NotificationManager.mark_read(nid)
				await _refresh_notification_center()
		)
		_notif_list.add_child(row)


func _mood_for_page(path: String) -> String:
	if path in [
		GameManager.SCENE_CANTINA,
		GameManager.SCENE_MISSION_RUN,
		GameManager.SCENE_CASINO,
	]:
		return "cantina"
	if path in [
		GameManager.SCENE_ARENA,
		GameManager.SCENE_ARENA_COMBAT,
		GameManager.SCENE_MISSION_COMBAT,
		GameManager.SCENE_GALAXY_COMBAT,
		GameManager.SCENE_GUILD_WARS,
		GameManager.SCENE_NEXUS,
	]:
		return "combat"
	if path in [
		GameManager.SCENE_VOID,
		GameManager.SCENE_GALAXY,
		GameManager.SCENE_GALAXY_NEWS,
		GameManager.SCENE_MINING,
	]:
		return "void"
	return "hub"


func _sync_hud_mood(mood: String) -> void:
	if _hud_overlay == null or not is_instance_valid(_hud_overlay):
		return
	var accent: Color = {
		"hub": ClientUi.CYAN,
		"cantina": Color("#F07A50"),
		"combat": ClientUi.VIOLET,
		"void": ClientUi.VIOLET,
	}.get(mood, ClientUi.CYAN)
	_hud_overlay.set("accent", accent)
	_hud_overlay.set("strength", 0.42 if mood == "hub" else 0.5)
	_hud_overlay.queue_redraw()


func _fit_and_enter_page(page_control: Control) -> void:
	_fit_page_to_stage()
	_animate_page_entry(page_control)


func _animate_page_entry(page_control: Control) -> void:
	if page_control == null or not is_instance_valid(page_control):
		return
	# Fade only. Sliding via offset_left/right while anchors are FULL_RECT races
	# _fit_page_to_stage and can SIGSEGV in Godot 4.7 when pages rebuild layout
	# (Settings, Messages Private tab).
	page_control.offset_left = 0.0
	page_control.offset_top = 0.0
	page_control.offset_right = 0.0
	page_control.offset_bottom = 0.0
	page_control.modulate.a = 0.0
	var tween := page_control.create_tween()
	tween.tween_property(page_control, "modulate:a", 1.0, PAGE_FADE_IN_SEC).set_ease(Tween.EASE_OUT)
	if _transition_flash != null and is_instance_valid(_transition_flash):
		_transition_flash.modulate.a = 0.0
		var flash := _transition_flash.create_tween()
		flash.tween_property(
			_transition_flash,
			"modulate:a",
			TRANSITION_FLASH_PEAK_ALPHA,
			TRANSITION_FLASH_IN_SEC,
		)
		flash.tween_property(
			_transition_flash,
			"modulate:a",
			0.0,
			TRANSITION_FLASH_OUT_SEC,
		).set_ease(Tween.EASE_OUT)


func _fit_page_to_stage() -> void:
	if _page == null or not is_instance_valid(_page) or not (_page is Control):
		return
	var page_control := _page as Control
	if not is_instance_valid(_content):
		return

	# IMPORTANT: do not use Control.scale to fit pages. Scaled Controls break GUI
	# hit-testing in Godot (buttons look clickable but never receive presses).
	# IMPORTANT: do not assign Control.size with FULL_RECT anchors (Godot warns /
	# can SIGSEGV). Anchors alone keep the page glued to ContentStage.
	page_control.scale = Vector2.ONE
	if (
		is_equal_approx(page_control.anchor_left, 0.0)
		and is_equal_approx(page_control.anchor_top, 0.0)
		and is_equal_approx(page_control.anchor_right, 1.0)
		and is_equal_approx(page_control.anchor_bottom, 1.0)
		and is_equal_approx(page_control.offset_left, 0.0)
		and is_equal_approx(page_control.offset_top, 0.0)
		and is_equal_approx(page_control.offset_right, 0.0)
		and is_equal_approx(page_control.offset_bottom, 0.0)
	):
		return
	page_control.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	page_control.offset_left = 0.0
	page_control.offset_top = 0.0
	page_control.offset_right = 0.0
	page_control.offset_bottom = 0.0


func _update_nav_state() -> void:
	var active_path := _nav_key_for_page(_page_path)
	for path in _nav_buttons:
		var data: Dictionary = _nav_buttons[path]
		_style_nav_button(data, str(path) == active_path)


func _nav_key_for_page(path: String) -> String:
	if path in [GameManager.SCENE_MISSION_RUN, GameManager.SCENE_MISSION_COMBAT]:
		return GameManager.SCENE_CANTINA
	if path in [
		GameManager.SCENE_PROGRESS,
		GameManager.SCENE_COLLECTIBLES,
		GameManager.SCENE_CODEX,
	]:
		return GameManager.SCENE_STATS
	if path in [GameManager.SCENE_GALAXY_COMBAT, GameManager.SCENE_GALAXY_NEWS]:
		return GameManager.SCENE_GALAXY
	if path == GameManager.SCENE_ARENA_COMBAT:
		return GameManager.SCENE_ARENA
	if path == GameManager.SCENE_GUILD_WARS:
		return GameManager.SCENE_GUILD
	if path == GameManager.SCENE_NOTIFICATIONS:
		return GameManager.SCENE_MAIL
	return path


func _add_shell_chrome(frame: PanelContainer) -> void:
	var chrome := Control.new()
	chrome.name = "ShellChrome"
	chrome.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chrome.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	# Keep chrome below interactive shell content for both draw + pick safety.
	chrome.z_index = -1
	frame.add_child(chrome)

	for pos in [
		Vector2(14, 14),
		Vector2(-14, 14),
		Vector2(14, -14),
		Vector2(-14, -14),
	]:
		var rivet := ColorRect.new()
		rivet.custom_minimum_size = Vector2(11, 11)
		rivet.color = Color(0.42, 0.5, 0.58, 0.95)
		rivet.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if pos.x < 0:
			rivet.anchor_left = 1.0
			rivet.anchor_right = 1.0
			rivet.offset_left = pos.x - 8.0
			rivet.offset_right = pos.x
		else:
			rivet.anchor_left = 0.0
			rivet.anchor_right = 0.0
			rivet.offset_left = pos.x
			rivet.offset_right = pos.x + 8.0
		if pos.y < 0:
			rivet.anchor_top = 1.0
			rivet.anchor_bottom = 1.0
			rivet.offset_top = pos.y - 8.0
			rivet.offset_bottom = pos.y
		else:
			rivet.anchor_top = 0.0
			rivet.anchor_bottom = 0.0
			rivet.offset_top = pos.y
			rivet.offset_bottom = pos.y + 8.0
		chrome.add_child(rivet)

	var rail := ColorRect.new()
	rail.color = Color(ClientUi.CYAN, 0.35)
	rail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rail.anchor_left = 0.12
	rail.anchor_right = 0.88
	rail.anchor_top = 0.0
	rail.anchor_bottom = 0.0
	rail.offset_top = 13.0
	rail.offset_bottom = 15.0
	chrome.add_child(rail)
	var rail_pulse := rail.create_tween().set_loops()
	rail_pulse.tween_property(rail, "modulate:a", 0.42, 2.4).set_trans(Tween.TRANS_SINE)
	rail_pulse.tween_property(rail, "modulate:a", 1.0, 2.4).set_trans(Tween.TRANS_SINE)

	var left_tick := ColorRect.new()
	left_tick.color = Color(ClientUi.CYAN, 0.28)
	left_tick.mouse_filter = Control.MOUSE_FILTER_IGNORE
	left_tick.anchor_left = 0.0
	left_tick.anchor_right = 0.0
	left_tick.anchor_top = 0.22
	left_tick.anchor_bottom = 0.78
	left_tick.offset_left = 8.0
	left_tick.offset_right = 11.0
	chrome.add_child(left_tick)

	var right_tick := ColorRect.new()
	right_tick.color = Color(ClientUi.VIOLET, 0.24)
	right_tick.mouse_filter = Control.MOUSE_FILTER_IGNORE
	right_tick.anchor_left = 1.0
	right_tick.anchor_right = 1.0
	right_tick.anchor_top = 0.22
	right_tick.anchor_bottom = 0.78
	right_tick.offset_left = -11.0
	right_tick.offset_right = -8.0
	chrome.add_child(right_tick)


func _shell_panel_style(
	bg: Color,
	border: Color,
	radius: int,
	margin_x: int,
	margin_y: int,
	border_width: int = 1
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(radius)
	style.corner_detail = 12
	style.anti_aliasing = true
	style.anti_aliasing_size = 1.25
	style.border_blend = true
	style.content_margin_left = margin_x
	style.content_margin_right = margin_x
	style.content_margin_top = margin_y
	style.content_margin_bottom = margin_y
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	style.shadow_size = 4
	style.shadow_offset = Vector2(0, 1)
	return style


func _process(_delta: float) -> void:
	var stamp := _character_stamp()
	if stamp == _chrome_stamp:
		return
	_refresh_chrome()


func _character_stamp() -> Array:
	var c: Dictionary = GameManager.active_character
	var mission_tick := -1
	if MissionManager.has_active_mission():
		mission_tick = MissionManager.seconds_remaining()
	var mining_tick := -1
	if MiningManager.is_mining():
		mining_tick = int(ceil(float(MiningManager.remaining_ms()) / 1000.0))
	return [
		c.get("id", ""),
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST),
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA),
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_FUEL),
		c.get("max_fuel", 0),
		c.get("level", 0),
		c.get("experience", 0),
		c.get("experience_to_next_level", 0),
		c.get("active_title", ""),
		MissionManager.has_active_mission(),
		MiningManager.is_mining(),
		mission_tick,
		mining_tick,
	]


func _on_activity_pressed() -> void:
	# Always jump back to the live activity screen (mission run while deployed).
	if MissionManager.has_active_mission():
		GameManager.go_mission_run()
		return
	if MiningManager.is_mining():
		GameManager.go_mining()
		return
	GameManager.go_hub()


func _activity_style_set(mode: String, tint: Color) -> Dictionary:
	if _activity_styles.has(mode):
		return _activity_styles[mode]
	var styles := {
		"normal": ClientUi.button_style(Color(tint.r, tint.g, tint.b, 0.22), Color(tint.r, tint.g, tint.b, 0.92)),
		"hover": ClientUi.button_style(Color(tint.r, tint.g, tint.b, 0.38), tint.lightened(0.1)),
		"pressed": ClientUi.button_style(Color(tint.r, tint.g, tint.b, 0.16), Color(tint.r, tint.g, tint.b, 0.72)),
		"disabled": ClientUi.button_style(Color(0.05, 0.10, 0.12, 0.5), Color(ClientUi.MUTED, 0.28)),
	}
	_activity_styles[mode] = styles
	return styles


func _apply_activity_styles(mode: String, tint: Color) -> void:
	if _activity_mode == mode:
		return
	_activity_mode = mode
	var styles: Dictionary
	if mode == "idle":
		var quiet := ClientUi.button_style(Color(0.05, 0.10, 0.12, 0.5), Color(ClientUi.MUTED, 0.28))
		styles = {"normal": quiet, "hover": quiet, "pressed": quiet, "disabled": quiet}
		_activity_styles[mode] = styles
	else:
		styles = _activity_style_set(mode, tint)
	_activity.add_theme_stylebox_override("normal", styles["normal"])
	_activity.add_theme_stylebox_override("hover", styles["hover"])
	_activity.add_theme_stylebox_override("pressed", styles["pressed"])
	_activity.add_theme_stylebox_override("disabled", styles.get("disabled", styles["normal"]))


func _set_activity_icon(icon_id: String, tint: Color) -> void:
	if not is_instance_valid(_activity_icon):
		return
	_activity_icon.texture = UiIcon.texture(icon_id)
	UiIcon.set_tint(_activity_icon, tint)


func _refresh_chrome() -> void:
	_chrome_stamp = _character_stamp()
	_clock.text = Time.get_time_string_from_system()
	if MissionManager.has_active_mission():
		var remaining := MissionManager.seconds_remaining()
		var done := remaining <= 0
		var tint := ClientUi.SUCCESS if done else ClientUi.CYAN
		_apply_activity_styles("mission_done" if done else "mission", tint)
		_activity.disabled = false
		_activity.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		_activity.tooltip_text = "Return to mission" if not done else "Claim mission rewards"
		if is_instance_valid(_activity_label):
			_activity_label.add_theme_color_override("font_color", tint)
			if done:
				_set_activity_icon("check", tint)
				_activity_label.text = "Mission Complete\nREADY"
			else:
				_set_activity_icon("rocket", tint)
				_activity_label.text = "Mission in Progress\n%s" % MissionBoard.format_duration(remaining)
	elif MiningManager.is_ready():
		var tint_r := Color("#4ADE80")
		_apply_activity_styles("mining_ready", tint_r)
		_activity.disabled = false
		_activity.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		_activity.tooltip_text = "Collect mining"
		_set_activity_icon("sparkles", tint_r)
		if is_instance_valid(_activity_label):
			_activity_label.add_theme_color_override("font_color", tint_r)
			_activity_label.text = "Mining Complete\nCOLLECT"
	elif MiningManager.is_mining_busy():
		var tint_m := Color("#F59E0B")
		_apply_activity_styles("mining", tint_m)
		_activity.disabled = false
		_activity.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		_activity.tooltip_text = "Open mining"
		_set_activity_icon("pickaxe", tint_m)
		if is_instance_valid(_activity_label):
			_activity_label.add_theme_color_override("font_color", tint_m)
			_activity_label.text = "Mining in Progress\n%s" % MissionBoard.format_duration(
				int(ceil(float(MiningManager.remaining_ms()) / 1000.0))
			)
	else:
		_apply_activity_styles("idle", ClientUi.SUCCESS)
		_activity.disabled = true
		_activity.mouse_default_cursor_shape = Control.CURSOR_ARROW
		_activity.tooltip_text = ""
		_set_activity_icon("ok", ClientUi.MUTED)
		if is_instance_valid(_activity_label):
			_activity_label.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.9))
			_activity_label.text = "Systems Normal"

	var character := GameManager.active_character
	if character.is_empty():
		_operative_name.text = "NO OPERATIVE"
		return
	_operative_name.text = LegacyName.full_name(character)
	_operative_meta.text = "LV %s · %s · %s" % [
		ClientUi.format_level(character.get("level", 1)),
		str(character.get("race", "?")),
		str(character.get("class", "?")),
	]
	_operative_title.text = str(character.get("active_title", ""))
	_set_readout(_fuel_value, "%s / %s" % [
		CurrencyManager.format_balance(CurrencyManager.CURRENCY_FUEL),
		_format_rail_amount(ShipRules.effective_max_fuel(character)),
	])
	_set_readout(_stardust_value, _format_rail_amount(
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST)
	))
	_set_readout(_nova_value, CurrencyManager.format_balance(CurrencyManager.CURRENCY_NOVA))
	if not CurrencyManager.loading and not CurrencyManager.has_wallet():
		CurrencyManager.load_wallet()
	_fit_currency_fonts()
	var xp := int(character.get("experience", 0))
	var xp_next := maxi(1, int(character.get("experience_to_next_level", 1)))
	_xp_label.text = "XP  %s / %s" % [_format_rail_amount(xp), _format_rail_amount(xp_next)]
	_xp_bar.max_value = xp_next
	_xp_bar.value = mini(xp, xp_next)
	# ActiveEffectsBar owns its 1s timer — avoid rebuilding chips twice per second.
	# Portrait is a Button so clicks reach Hero (PanelContainer children ate gui_input).
	if _portrait_host.get_child_count() == 0:
		var portrait_btn := Button.new()
		portrait_btn.flat = true
		portrait_btn.focus_mode = Control.FOCUS_NONE
		portrait_btn.tooltip_text = "Open character sheet"
		portrait_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		portrait_btn.custom_minimum_size = Vector2(208, 208)
		portrait_btn.clip_contents = false
		portrait_btn.add_theme_stylebox_override(
			"normal",
			_shell_panel_style(Color(0.035, 0.05, 0.08, 0.98), Color(ClientUi.CYAN, 0.65), 10, 4, 4)
		)
		portrait_btn.add_theme_stylebox_override(
			"hover",
			_shell_panel_style(Color(0.05, 0.08, 0.12, 0.98), Color(ClientUi.CYAN_SOFT, 0.9), 10, 4, 4)
		)
		portrait_btn.add_theme_stylebox_override(
			"pressed",
			_shell_panel_style(Color(0.03, 0.045, 0.07, 0.98), Color(ClientUi.CYAN, 0.85), 10, 4, 4)
		)
		var empty := StyleBoxEmpty.new()
		portrait_btn.add_theme_stylebox_override("focus", empty)
		var portrait := AvatarRenderer.make_portrait(character, 200.0)
		portrait.name = "ConsolePortrait"
		portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
		# Full aura bleed in the existing console band (do not grow console).
		portrait.clip_contents = false
		portrait.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		portrait_btn.add_child(portrait)
		# Full-rect host so the class glyph is truly centered in the portrait button.
		var class_host := CenterContainer.new()
		class_host.name = "ConsoleClassIcon"
		class_host.visible = false
		class_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
		class_host.clip_contents = false
		class_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		portrait_btn.add_child(class_host)
		# Fill most of the 208px portrait frame.
		var class_icon := ClassIcon.make(str(character.get("class", "Vanguard")), 192.0)
		class_icon.name = "ClassGlyph"
		class_host.add_child(class_icon)
		portrait_btn.pressed.connect(func() -> void:
			if TutorialManager.should_show():
				return
			GameManager.go_stats()
		)
		TutorialManager.tag_target(portrait_btn, "shell-operative")
		_portrait_host.add_child(portrait_btn)
		_console_portrait_btn = portrait_btn
		_console_class_icon = class_host
	else:
		var existing := _portrait_host.get_child(0)
		_console_portrait_btn = existing as Button
		_console_class_icon = existing.get_node_or_null("ConsoleClassIcon")
		# Migrate older TextureRect-only placeholder into a centered host.
		if _console_class_icon is TextureRect:
			var old_icon := _console_class_icon as TextureRect
			var migrate_host := CenterContainer.new()
			migrate_host.name = "ConsoleClassIcon"
			migrate_host.visible = old_icon.visible
			migrate_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
			migrate_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			existing.add_child(migrate_host)
			old_icon.name = "ClassGlyph"
			old_icon.get_parent().remove_child(old_icon)
			migrate_host.add_child(old_icon)
			_console_class_icon = migrate_host
		for n in existing.find_children("*", "Control", true, false):
			if n.has_method("set_character") and str(n.name) == "ConsolePortrait":
				n.call("set_character", character)
				break
	_apply_console_portrait_mode()


func _apply_console_portrait_mode() -> void:
	if not is_instance_valid(_portrait_host) or _portrait_host.get_child_count() == 0:
		return
	var btn := _portrait_host.get_child(0) as Control
	if btn == null:
		return
	var portrait := btn.get_node_or_null("ConsolePortrait") as Control
	var class_host := btn.get_node_or_null("ConsoleClassIcon") as Control
	var ch: Dictionary = GameManager.active_character
	var class_key := str(ch.get("class", "Vanguard"))
	if class_host != null:
		class_host.visible = _hero_page_open
		var glyph := class_host.get_node_or_null("ClassGlyph") as TextureRect
		if glyph == null and class_host is TextureRect:
			glyph = class_host as TextureRect
		if glyph != null:
			glyph.texture = ClassIcon.texture(class_key)
			glyph.modulate = Color.WHITE
			glyph.custom_minimum_size = Vector2(192, 192)
	if portrait != null:
		portrait.visible = not _hero_page_open
		portrait.clip_contents = false
		if portrait.has_method("set_active"):
			portrait.call("set_active", not _hero_page_open and visible)
	if is_instance_valid(_effects):
		# Bubbles sit on the portrait face — hide with the face on Hero page.
		_effects.modulate.a = 0.0 if _hero_page_open else 1.0
		_effects.mouse_filter = (
			Control.MOUSE_FILTER_IGNORE if _hero_page_open else Control.MOUSE_FILTER_STOP
		)
	if btn is Button:
		(btn as Button).tooltip_text = (
			"%s — Operative sheet open" % class_key if _hero_page_open else "Open character sheet"
		)
