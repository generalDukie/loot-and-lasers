extends Control
## Persistent in-game console. Page scenes swap inside the recessed content stage.

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
var _activity_label: Label
var _clock: Label
var _portrait_host: CenterContainer
var _notif_btn: Button
var _notif_badge: Label
var _notif_dock: Control
var _notif_panel: PanelContainer
var _notif_list: VBoxContainer
var _notif_meta: Label
var _notif_open := false
var _notif_auto_close: SceneTreeTimer
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
var _last_nav_ms := 0
const NAV_COOLDOWN_MS := 450


func _ready() -> void:
	add_to_group("game_shell")
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scale = Vector2.ONE
	DevEnvironmentBadge.attach_to(self)
	# Never let chrome/rail minimum sizes push past the window edge.
	clip_contents = true
	_build()
	_refresh_chrome()
	_set_decor_active(true)
	var timer := Timer.new()
	timer.wait_time = 1.0
	timer.timeout.connect(_refresh_chrome)
	add_child(timer)
	timer.start()
	var target := GameManager.pending_page_path
	if target.is_empty():
		target = GameManager.SCENE_HUB
	show_page(target)


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
	_content.resized.connect(_fit_page_to_stage)
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
	hub_sub.add_theme_font_size_override("font_size", 12)
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
	_activity.flat = true
	_activity.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_activity.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_activity.tooltip_text = "Open active activity"
	_activity.add_theme_stylebox_override("normal", _nav_style(Color(0.05, 0.12, 0.1, 0.9), Color(ClientUi.SUCCESS, 0.45)))
	_activity.add_theme_stylebox_override("hover", _nav_style(Color(0.07, 0.16, 0.13, 0.95), Color(ClientUi.SUCCESS, 0.7)))
	_activity.add_theme_stylebox_override("pressed", _nav_style(Color(0.04, 0.1, 0.08, 0.95), Color(ClientUi.SUCCESS, 0.55)))
	_activity.pressed.connect(_on_activity_pressed)
	row.add_child(_activity)
	_activity_label = Label.new()
	_activity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_activity_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_activity_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_activity_label.add_theme_font_size_override("font_size", 12)
	_activity_label.add_theme_color_override("font_color", ClientUi.SUCCESS)
	ClientUi.apply_display_font(_activity_label)
	_activity.add_child(_activity_label)
	_activity_label.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_activity_label.offset_left = 14
	_activity_label.offset_right = -14
	_activity_label.offset_top = 4
	_activity_label.offset_bottom = -4
	_activity.custom_minimum_size = Vector2(248, 52)

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

	var settings_btn := Button.new()
	settings_btn.text = "⚙"
	settings_btn.tooltip_text = "Settings"
	settings_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ClientUi.apply_ghost_button(settings_btn)
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
	var online := Label.new()
	online.text = "●"
	online.add_theme_color_override("font_color", ClientUi.CYAN)
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
			btn.pressed.connect(_on_nav_pressed.bind(path))
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
			name_lab.configure(str(item.get("label", "")), tint, 20)
			row.add_child(name_lab)

			var entry := {
				"button": btn,
				"icon": icon_tex,
				"label": name_lab,
				"tint": tint,
				"active": false,
			}
			_nav_buttons[path] = entry
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
	if btn == null or not is_instance_valid(btn):
		return
	entry["active"] = active
	ClientUi.apply_interaction_motion(btn, 1.015)
	# No hover/active chrome — transparent always; feedback is the letter neon only.
	var clear := Color(0, 0, 0, 0)
	btn.add_theme_stylebox_override("normal", _nav_style(clear, clear))
	btn.add_theme_stylebox_override("hover", _nav_style(clear, clear))
	btn.add_theme_stylebox_override("pressed", _nav_style(clear, clear))
	btn.add_theme_stylebox_override("focus", _nav_style(clear, clear))
	btn.add_theme_color_override("font_color", Color(0, 0, 0, 0))
	btn.add_theme_color_override("font_hover_color", Color(0, 0, 0, 0))
	btn.add_theme_color_override("font_pressed_color", Color(0, 0, 0, 0))
	btn.modulate = Color.WHITE

	if icon_tex != null and is_instance_valid(icon_tex):
		NavIcon.set_tint(icon_tex, tint)
	if name_lab != null and is_instance_valid(name_lab):
		name_lab.neon_tint = tint
		name_lab.set_neon(active)


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

	_portrait_host = CenterContainer.new()
	_portrait_host.custom_minimum_size.y = 283
	_portrait_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(_portrait_host)

	_operative_name = Button.new()
	_operative_name.flat = true
	_operative_name.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_operative_name.tooltip_text = "Open character sheet"
	_operative_name.add_theme_font_size_override("font_size", 17)
	_operative_name.add_theme_color_override("font_color", ClientUi.TEXT)
	_operative_name.add_theme_color_override("font_hover_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(_operative_name)
	_operative_name.pressed.connect(func() -> void: GameManager.go_stats())
	panel.add_child(_operative_name)

	_operative_meta = Label.new()
	_operative_meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_operative_meta.add_theme_font_size_override("font_size", 13)
	_operative_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	panel.add_child(_operative_meta)

	_xp_label = Label.new()
	_xp_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_xp_label.add_theme_font_size_override("font_size", 12)
	_xp_label.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	panel.add_child(_xp_label)
	_xp_bar = ProgressBar.new()
	_xp_bar.show_percentage = false
	_xp_bar.custom_minimum_size.y = 8
	ClientUi.apply_hp_bar(_xp_bar, ClientUi.CYAN)
	panel.add_child(_xp_bar)

	_operative_title = Label.new()
	_operative_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_operative_title.add_theme_font_size_override("font_size", 12)
	_operative_title.add_theme_color_override("font_color", ClientUi.GOLD)
	ClientUi.apply_display_font(_operative_title)
	panel.add_child(_operative_title)

	_fuel_value = _make_readout(panel, "fuel", Color("#39FF14"))
	_stardust_value = _make_readout(panel, "stardust", Color("#E879F9"))
	_nova_value = _make_readout(panel, "nova", Color("#FFD700"), true)

	_effects = ActiveEffectsBar.make()
	panel.add_child(_effects)
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


func _make_readout(parent: Control, icon_id: String, tint: Color, open_store := false) -> Label:
	var frame := PanelContainer.new()
	# Keep pane height in the same console band; icons + bold amounts fit inside.
	frame.custom_minimum_size.y = 48
	frame.add_theme_stylebox_override(
		"panel",
		_shell_panel_style(Color(0.055, 0.07, 0.105, 0.96), Color(tint, 0.45), 7, 8, 4)
	)
	parent.add_child(frame)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 8)
	frame.add_child(row)

	var icon := CurrencyIcon.make(icon_id, 22.0)
	match icon_id:
		"fuel":
			icon.tooltip_text = "Fuel"
		"stardust":
			icon.tooltip_text = "Stardust"
		_:
			icon.tooltip_text = "Nova Crystals"
	row.add_child(icon)

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

	if open_store:
		var plus := Button.new()
		plus.text = "+"
		plus.focus_mode = Control.FOCUS_NONE
		plus.custom_minimum_size = Vector2(29, 29)
		plus.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		plus.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		plus.tooltip_text = "Crystal Store"
		plus.add_theme_font_size_override("font_size", 24)
		plus.add_theme_color_override("font_color", Color("#1A1400"))
		plus.add_theme_color_override("font_hover_color", Color("#1A1400"))
		plus.add_theme_color_override("font_pressed_color", Color("#1A1400"))
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
		ClientUi.apply_bold_display_font(plus)
		plus.pressed.connect(func() -> void: GameManager.go_crystal_store())
		row.add_child(plus)
		_start_nova_plus_pulse(plus)
	return value

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
			{"path": GameManager.SCENE_STATS, "label": "Hero", "icon": "user", "color": "#00E5FF"},
			{"path": GameManager.SCENE_CANTINA, "label": "Cantina", "icon": "beer", "color": "#FF8C00"},
			{"path": GameManager.SCENE_GALAXY, "label": "Galaxy", "icon": "orbit", "color": "#BA55D3"},
			{"path": GameManager.SCENE_SHIP, "label": "Ship Hangar", "icon": "rocket", "color": "#2DD4BF"},
		]},
		{"name": "Social", "items": [
			{"path": GameManager.SCENE_FRIENDS, "label": "Friends", "icon": "users", "color": "#A855F7"},
			{"path": GameManager.SCENE_MESSAGES, "label": "Chat", "icon": "message-square", "color": "#38BDF8"},
			{"path": GameManager.SCENE_MAIL, "label": "Mail", "icon": "mail", "color": "#F59E0B"},
			{"path": GameManager.SCENE_GUILD, "label": "Guild", "icon": "users", "color": "#F43F5E"},
		]},
		{"name": "Battle", "items": [
			{"path": GameManager.SCENE_ARENA, "label": "Arena", "icon": "zap", "color": "#FB7185"},
			{"path": GameManager.SCENE_LEADERBOARD, "label": "Ranks", "icon": "trophy", "color": "#34D399"},
			{"path": GameManager.SCENE_NEXUS, "label": "Nexus", "icon": "crown", "color": "#60A5FA"},
		]},
		{"name": "Trade", "items": [
			{"path": GameManager.SCENE_SHOP, "label": "Black Market", "icon": "shopping-bag", "color": "#9D6BFF"},
			{"path": GameManager.SCENE_CASINO, "label": "Casino", "icon": "dice-5", "color": "#FBBF24"},
			{"path": GameManager.SCENE_VOID, "label": "Void", "icon": "orbit", "color": "#14B8A6"},
			{"path": GameManager.SCENE_MINING, "label": "Mine", "icon": "pickaxe", "color": "#EC4899"},
		]},
	]


func _on_nav_pressed(path: String) -> void:
	if path.is_empty():
		return
	GameManager.open_game_page(path)


## Gate for GameManager.open_game_page — drops rapid / duplicate clicks before deferred load.
func try_begin_page_nav(path: String) -> bool:
	if path.is_empty():
		return false
	if _page_swap_busy or _page_nav_pending:
		return false
	if path == _page_path and _page != null and is_instance_valid(_page):
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
	# Never re-enter while a page is mounting — that freed nodes mid-_ready.
	if _page_swap_busy:
		return
	if path == _page_path and _page != null and is_instance_valid(_page):
		return

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
		clear_overlays()
	_page_path = path
	GameManager.pending_page_path = path
	ClientUi.apply_atmosphere_mood(_atmosphere, _mood_for_page(path))
	_sync_hud_mood(_mood_for_page(path))
	var outgoing_page: Node = null
	if _page != null and is_instance_valid(_page):
		var outgoing := _page
		outgoing_page = outgoing
		if outgoing is Control:
			var outgoing_control := outgoing as Control
			outgoing_control.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var exit_tween := outgoing_control.create_tween()
			exit_tween.set_parallel(true)
			exit_tween.tween_property(outgoing_control, "modulate:a", 0.0, 0.12)
			exit_tween.tween_property(
				outgoing_control,
				"offset_left",
				outgoing_control.offset_left - 12.0,
				0.14
			).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
			exit_tween.tween_property(
				outgoing_control,
				"offset_right",
				outgoing_control.offset_right - 12.0,
				0.14
			).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
			exit_tween.chain().tween_callback(func() -> void:
				if is_instance_valid(outgoing):
					outgoing.queue_free()
			)
		else:
			outgoing.queue_free()
		_page = null
	var packed := load(path) as PackedScene
	if packed == null:
		push_error("Could not load shell page: %s" % path)
		_page_swap_busy = false
		return
	_page = packed.instantiate()
	# If the page script failed to compile, Godot still returns a bare Control.
	# Leaving it full-rect + alpha 0 + MOUSE_FILTER_STOP freezes the whole shell.
	if path == GameManager.SCENE_STATS and not _page.has_method("_populate"):
		push_error("Hero sheet script failed to load — refusing blank input blocker")
		_page.free()
		_page = null
		_page_path = ""
		_page_swap_busy = false
		_set_nav_buttons_enabled(true)
		return
	_content.add_child(_page)
	# Park the fading page under the incoming one, then restack so the live page
	# sits above flash/HUD for picking and under OverlayHost for battle sheets.
	if outgoing_page != null and is_instance_valid(outgoing_page):
		_content.move_child(outgoing_page, 0)
	_restack_content_layers()
	if _page is Control:
		var page_control := _page as Control
		page_control.mouse_filter = Control.MOUSE_FILTER_STOP
		page_control.scale = Vector2.ONE
		page_control.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		page_control.modulate.a = 0.0
		call_deferred("_fit_page_to_stage")
		call_deferred("_animate_page_entry", page_control)
	_update_nav_state()
	_refresh_chrome()
	# Unlock immediately after mount — never hold the nav lock across network awaits
	# (Hero sheet boots with awaits; a hung refresh used to freeze the whole shell).
	_page_swap_busy = false
	_set_nav_buttons_enabled(true)
	_refresh_notif_after_nav()


func _refresh_notif_after_nav() -> void:
	await NotificationManager.refresh_unread()
	_update_notif_badge()


func _set_nav_buttons_enabled(enabled: bool) -> void:
	# Force-enable the rail after swaps. Older builds disabled buttons during load and
	# could leave the side nav dead if a Hero mount stalled.
	for path in _nav_buttons:
		var data: Dictionary = _nav_buttons[path]
		var btn: Variant = data.get("button", null)
		if btn is BaseButton and is_instance_valid(btn):
			(btn as BaseButton).disabled = not enabled
			(btn as BaseButton).mouse_default_cursor_shape = (
				Control.CURSOR_ARROW if not enabled else Control.CURSOR_POINTING_HAND
			)


func toggle_notifications() -> void:
	_set_notification_open(not _notif_open)
	if _notif_open:
		await _refresh_notification_center()


func _set_notification_open(open: bool) -> void:
	_notif_open = open
	_notif_auto_close = null
	_sync_notif_fab()
	if _notif_panel == null or not is_instance_valid(_notif_panel):
		return
	if open:
		# Expand dock stack so the sheet has room above the FAB.
		var stack := _notif_panel.get_parent() as Control
		if stack != null:
			stack.offset_top = -587
		_notif_panel.visible = true
		_notif_panel.modulate.a = 0.0
		_notif_panel.scale = Vector2(0.88, 0.88)
		call_deferred("_play_notif_open_anim")
		var tree := get_tree()
		if tree != null:
			_notif_auto_close = tree.create_timer(30.0)
			var token := _notif_auto_close
			token.timeout.connect(func() -> void:
				if _notif_auto_close != token or not _notif_open:
					return
				_set_notification_open(false)
			)
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
					stack.offset_top = -107
		)


func _play_notif_open_anim() -> void:
	if not _notif_open or _notif_panel == null or not is_instance_valid(_notif_panel):
		return
	# Pivot from the FAB corner so the sheet blooms upward/left.
	_notif_panel.pivot_offset = Vector2(_notif_panel.size.x, _notif_panel.size.y)
	var tween := _notif_panel.create_tween()
	tween.set_parallel(true)
	tween.tween_property(_notif_panel, "modulate:a", 1.0, 0.16)
	tween.tween_property(_notif_panel, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


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


func clear_overlays() -> void:
	if _overlay_host == null or not is_instance_valid(_overlay_host):
		return
	for child in _overlay_host.get_children():
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


func _build_notification_center() -> void:
	## Web NotificationCenter: floating BR round FAB + popover panel.
	_notif_dock = Control.new()
	_notif_dock.name = "NotificationDock"
	_notif_dock.z_index = 90
	_notif_dock.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_notif_dock.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(_notif_dock)

	var stack := VBoxContainer.new()
	stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stack.alignment = BoxContainer.ALIGNMENT_END
	stack.add_theme_constant_override("separation", 10)
	stack.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	stack.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	stack.grow_vertical = Control.GROW_DIRECTION_BEGIN
	stack.anchor_left = 1.0
	stack.anchor_top = 1.0
	stack.anchor_right = 1.0
	stack.anchor_bottom = 1.0
	stack.offset_left = -491
	stack.offset_top = -107
	stack.offset_right = -19
	stack.offset_bottom = -19
	_notif_dock.add_child(stack)

	_notif_panel = PanelContainer.new()
	_notif_panel.visible = false
	_notif_panel.custom_minimum_size = Vector2(453, 480)
	_notif_panel.size_flags_vertical = Control.SIZE_SHRINK_END
	_notif_panel.size_flags_horizontal = Control.SIZE_SHRINK_END
	_notif_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_notif_panel.add_theme_stylebox_override(
		"panel",
		_shell_panel_style(Color(0.04, 0.05, 0.09, 0.97), Color(0.28, 0.38, 0.48, 0.7), 16, 10, 10, 1)
	)
	stack.add_child(_notif_panel)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	_notif_panel.add_child(col)

	var header := HBoxContainer.new()
	col.add_child(header)
	var title := Label.new()
	title.text = "🔔  Notifications"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(title)
	header.add_child(title)
	_notif_meta = Label.new()
	_notif_meta.add_theme_font_size_override("font_size", 13)
	_notif_meta.add_theme_color_override("font_color", ClientUi.DANGER)
	ClientUi.apply_body_font(_notif_meta)
	header.add_child(_notif_meta)
	var mark := Button.new()
	mark.text = "✓✓"
	mark.tooltip_text = "Mark all read"
	ClientUi.apply_ghost_button(mark)
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

	# Round FAB — mirrors web `w-12 h-12 rounded-full`.
	var fab_wrap := Control.new()
	fab_wrap.custom_minimum_size = Vector2(64, 64)
	fab_wrap.size_flags_horizontal = Control.SIZE_SHRINK_END
	fab_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stack.add_child(fab_wrap)

	_notif_btn = Button.new()
	_notif_btn.text = "🔔"
	_notif_btn.tooltip_text = "Open notifications"
	_notif_btn.focus_mode = Control.FOCUS_NONE
	_notif_btn.custom_minimum_size = Vector2(64, 64)
	_notif_btn.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_notif_btn.mouse_filter = Control.MOUSE_FILTER_STOP
	_notif_btn.add_theme_font_size_override("font_size", 24)
	_style_notif_fab(false)
	_notif_btn.pressed.connect(toggle_notifications)
	ClientUi.apply_interaction_motion(_notif_btn, 1.06)
	fab_wrap.add_child(_notif_btn)

	var badge_chip := PanelContainer.new()
	badge_chip.visible = false
	badge_chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge_chip.z_index = 2
	badge_chip.anchor_left = 1.0
	badge_chip.anchor_top = 0.0
	badge_chip.anchor_right = 1.0
	badge_chip.anchor_bottom = 0.0
	badge_chip.offset_left = -11.0
	badge_chip.offset_top = -8.0
	badge_chip.offset_right = 16.0
	badge_chip.offset_bottom = 16.0
	var badge_bg := StyleBoxFlat.new()
	badge_bg.bg_color = ClientUi.DANGER
	badge_bg.set_corner_radius_all(9)
	badge_bg.content_margin_left = 5
	badge_bg.content_margin_right = 5
	badge_bg.content_margin_top = 1
	badge_bg.content_margin_bottom = 1
	badge_chip.add_theme_stylebox_override("panel", badge_bg)
	fab_wrap.add_child(badge_chip)

	_notif_badge = Label.new()
	_notif_badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_notif_badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_notif_badge.add_theme_font_size_override("font_size", 13)
	_notif_badge.add_theme_color_override("font_color", Color.WHITE)
	ClientUi.apply_display_font(_notif_badge)
	_notif_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge_chip.add_child(_notif_badge)
	# Keep a handle to the chip so badge visibility toggles the whole pill.
	_notif_badge.set_meta("chip", badge_chip)


func _style_notif_fab(open: bool) -> void:
	if _notif_btn == null or not is_instance_valid(_notif_btn):
		return
	var fill := Color(ClientUi.CYAN, 0.22 if open else 0.15)
	var border := Color(ClientUi.CYAN, 0.55 if open else 0.4)
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(24)
	style.content_margin_left = 0
	style.content_margin_right = 0
	style.content_margin_top = 0
	style.content_margin_bottom = 0
	_notif_btn.add_theme_stylebox_override("normal", style)
	var hover := style.duplicate() as StyleBoxFlat
	hover.bg_color = Color(ClientUi.CYAN, 0.28)
	_notif_btn.add_theme_stylebox_override("hover", hover)
	_notif_btn.add_theme_stylebox_override("pressed", hover)
	_notif_btn.add_theme_stylebox_override("focus", style)
	_notif_btn.add_theme_color_override("font_color", ClientUi.CYAN)
	_notif_btn.add_theme_color_override("font_hover_color", ClientUi.CYAN_SOFT)
	_notif_btn.add_theme_color_override("font_pressed_color", ClientUi.CYAN)


func _sync_notif_fab() -> void:
	if _notif_btn == null or not is_instance_valid(_notif_btn):
		return
	_notif_btn.text = "✕" if _notif_open else "🔔"
	_notif_btn.tooltip_text = "Minimize notifications" if _notif_open else "Open notifications"
	_style_notif_fab(_notif_open)
	_update_notif_badge()


func _update_notif_badge(unread_override: int = -1) -> void:
	if _notif_badge == null or not is_instance_valid(_notif_badge):
		return
	var chip: Control = _notif_badge.get_meta("chip") if _notif_badge.has_meta("chip") else null
	var unread := unread_override if unread_override >= 0 else NotificationManager.unread_count
	var total := unread + (1 if ProgressManager.can_claim_daily() else 0)
	var show := not _notif_open and total > 0
	if chip != null and is_instance_valid(chip):
		chip.visible = show
	else:
		_notif_badge.visible = show
	if show:
		_notif_badge.text = "9+" if total > 9 else str(total)


func _refresh_notification_center() -> void:
	await NotificationManager.load_inbox()
	var unread := NotificationManager.unread_count
	_notif_meta.text = ("· %s new" % unread) if unread > 0 else ""
	_update_notif_badge(unread)
	for child in _notif_list.get_children():
		child.queue_free()

	if ProgressManager.can_claim_daily():
		var daily := Button.new()
		daily.text = "📅  Daily Reward Ready\nClaim your login reward"
		daily.alignment = HORIZONTAL_ALIGNMENT_LEFT
		ClientUi.apply_ghost_button(daily)
		daily.add_theme_color_override("font_color", ClientUi.GOLD)
		daily.pressed.connect(func() -> void:
			_set_notification_open(false)
			GameManager.go_progress()
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


func _animate_page_entry(page_control: Control) -> void:
	if page_control == null or not is_instance_valid(page_control):
		return
	# Keep anchors full-rect; only nudge offset for the slide-in so hit targets stay valid.
	page_control.offset_left = 24.0
	page_control.offset_right = 24.0
	page_control.modulate.a = 0.0
	var tween := page_control.create_tween()
	tween.set_parallel(true)
	tween.tween_property(page_control, "offset_left", 0.0, 0.26).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	tween.tween_property(page_control, "offset_right", 0.0, 0.26).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	tween.tween_property(page_control, "modulate:a", 1.0, 0.2).set_ease(Tween.EASE_OUT)
	if _transition_flash != null and is_instance_valid(_transition_flash):
		_transition_flash.modulate.a = 0.0
		var flash := _transition_flash.create_tween()
		flash.tween_property(_transition_flash, "modulate:a", 0.10, 0.06)
		flash.tween_property(_transition_flash, "modulate:a", 0.0, 0.24).set_ease(Tween.EASE_OUT)


func _fit_page_to_stage() -> void:
	if _page == null or not is_instance_valid(_page) or not (_page is Control):
		return
	var page_control := _page as Control
	var available := _content.size
	if available.x <= 1.0 or available.y <= 1.0:
		return

	# IMPORTANT: do not use Control.scale to fit pages. Scaled Controls break GUI
	# hit-testing in Godot (buttons look clickable but never receive presses).
	# Fill the stage at 1:1 and let each page's own layout/scroll handle overflow.
	page_control.scale = Vector2.ONE
	page_control.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	page_control.position = Vector2.ZERO
	page_control.size = available


func _update_nav_state() -> void:
	var active_path := _nav_key_for_page(_page_path)
	for path in _nav_buttons:
		var data: Dictionary = _nav_buttons[path]
		_style_nav_button(data, str(path) == active_path)


func _nav_key_for_page(path: String) -> String:
	if path in [GameManager.SCENE_MISSION_RUN, GameManager.SCENE_MISSION_COMBAT]:
		return GameManager.SCENE_CANTINA
	if path in [
		GameManager.SCENE_INVENTORY,
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
	if MiningManager.is_mining_busy():
		mining_tick = int(ceil(float(MiningManager.remaining_ms()) / 1000.0))
	return [
		c.get("id", ""),
		c.get("stardust", 0),
		c.get("nova_crystals", 0),
		c.get("fuel", 0),
		c.get("max_fuel", 0),
		c.get("level", 0),
		c.get("experience", 0),
		c.get("experience_to_next_level", 0),
		c.get("active_title", ""),
		MissionManager.has_active_mission(),
		MiningManager.is_mining_busy(),
		mission_tick,
		mining_tick,
	]


func _on_activity_pressed() -> void:
	# Always jump back to the live activity screen (mission run while deployed).
	if MissionManager.has_active_mission():
		GameManager.go_mission_run()
		return
	if MiningManager.is_mining_busy():
		GameManager.go_mining()
		return
	GameManager.go_hub()


func _activity_style_set(mode: String, tint: Color) -> Dictionary:
	if _activity_styles.has(mode):
		return _activity_styles[mode]
	var styles := {
		"normal": _nav_style(Color(tint, 0.14), Color(tint, 0.45)),
		"hover": _nav_style(Color(tint, 0.22), Color(tint, 0.7)),
		"pressed": _nav_style(Color(tint, 0.12), Color(tint, 0.55)),
	}
	_activity_styles[mode] = styles
	return styles


func _apply_activity_styles(mode: String, tint: Color) -> void:
	if _activity_mode == mode:
		return
	_activity_mode = mode
	var styles: Dictionary
	if mode == "idle":
		var idle := ClientUi.SUCCESS
		var soft := _nav_style(Color(0.05, 0.12, 0.1, 0.55), Color(idle, 0.25))
		styles = {"normal": soft, "hover": soft, "pressed": soft}
		_activity_styles[mode] = styles
	else:
		styles = _activity_style_set(mode, tint)
	_activity.add_theme_stylebox_override("normal", styles["normal"])
	_activity.add_theme_stylebox_override("hover", styles["hover"])
	_activity.add_theme_stylebox_override("pressed", styles["pressed"])


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
				_activity_label.text = "Mission Complete\nREADY"
			else:
				_activity_label.text = "Mission in Progress\n%s" % MissionBoard.format_duration(remaining)
	elif MiningManager.is_mining_busy():
		var tint_m := Color("#F59E0B")
		_apply_activity_styles("mining", tint_m)
		_activity.disabled = false
		_activity.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		_activity.tooltip_text = "Open mining"
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
		if is_instance_valid(_activity_label):
			_activity_label.add_theme_color_override("font_color", ClientUi.SUCCESS)
			_activity_label.text = "Systems Nominal"

	var character := GameManager.active_character
	if character.is_empty():
		_operative_name.text = "NO OPERATIVE"
		return
	_operative_name.text = LegacyName.full_name(character)
	_operative_meta.text = "LV %s · %s · %s" % [
		str(character.get("level", 1)),
		str(character.get("race", "?")),
		str(character.get("class", "?")),
	]
	_operative_title.text = str(character.get("active_title", ""))
	_set_readout(_fuel_value, "%s / %s" % [
		_format_rail_amount(character.get("fuel", 0)),
		_format_rail_amount(character.get("max_fuel", 100)),
	])
	# Character balances remain the live readout this phase (Node SoT).
	# Phase 5 Nakama wallet loads in parallel — not yet migrated onto these chips.
	_set_readout(_stardust_value, _format_rail_amount(character.get("stardust", 0)))
	_set_readout(_nova_value, _format_rail_amount(character.get("nova_crystals", 0)))
	if CurrencyManager != null and not CurrencyManager.loading:
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
		portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
		portrait.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		portrait_btn.add_child(portrait)
		portrait_btn.pressed.connect(func() -> void: GameManager.go_stats())
		_portrait_host.add_child(portrait_btn)
	else:
		var existing := _portrait_host.get_child(0)
		for n in existing.find_children("*", "Control", true, false):
			if n.has_method("set_character"):
				n.call("set_character", character)
				break
