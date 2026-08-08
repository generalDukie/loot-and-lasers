extends Control
## Galactic Frontier — mirrors web GalaxyMapPage (header · DungeonMap | DungeonPlanetView).

var _status: Label
var _subtitle: Label
var _meta_right: Label
var _map_hint: Label
var _detail_root: PanelContainer
var _detail_glow: ColorRect
var _detail_hair: ColorRect
var _detail_icon_wrap: PanelContainer
var _detail_icon: Label
var _detail_sector: Label
var _detail_title: Label
var _detail_boss: Label
var _detail_cleared_lab: Label
var _detail_cleared_val: Label
var _detail_desc: Label
var _mode_banner: PanelContainer
var _mode_label: Label
var _return_front_btn: Button
var _reward_banner: PanelContainer
var _detail_reward: Label
var _detail_progress: ProgressBar
var _encounter_grid: GridContainer
var _cooldown_bar: PanelContainer
var _cooldown_lab: Label
var _skip_btn: Button
var _fight_btn: Button
var _map_stage: SpiralStage
var _busy := false
var _tick: Timer
var _layout: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_layout = SpiralMap.build()
	_build()
	await _boot()


func _boot() -> void:
	_status.text = "Syncing frontier…"
	await MissionManager.refresh_character()
	var res: Dictionary = await DungeonManager.sync_state()
	if not res.ok:
		_status.text = str(res.get("error", "SyncDungeonState failed"))
	else:
		_status.text = ""
	var active := DungeonManager.current_planet_id()
	var in_infinite := active > 10
	DungeonManager.selected_planet_id = active
	DungeonManager.viewing_wormhole = in_infinite
	_populate()
	_tick = Timer.new()
	_tick.wait_time = 1.0
	_tick.timeout.connect(_populate_meta)
	add_child(_tick)
	_tick.start()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "void"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	add_child(margin)

	var root := VBoxContainer.new()
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 8)
	margin.add_child(root)

	# ── Header (web GalaxyMapPage) ──
	var header := HBoxContainer.new()
	header.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)

	var head_l := VBoxContainer.new()
	head_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_l.add_theme_constant_override("separation", 2)
	header.add_child(head_l)
	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 10)
	head_l.add_child(title_row)
	var sat := Label.new()
	sat.text = "🛰"
	sat.add_theme_font_size_override("font_size", 29)
	sat.add_theme_color_override("font_color", ClientUi.CYAN)
	title_row.add_child(sat)
	var title := Label.new()
	title.text = "Galactic Frontier"
	title.add_theme_font_size_override("font_size", 32)
	title.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(title)
	title_row.add_child(title)
	_subtitle = Label.new()
	_subtitle.add_theme_font_size_override("font_size", 15)
	_subtitle.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_subtitle)
	head_l.add_child(_subtitle)

	var head_r := HBoxContainer.new()
	head_r.alignment = BoxContainer.ALIGNMENT_END
	head_r.add_theme_constant_override("separation", 18)
	header.add_child(head_r)

	_meta_right = Label.new()
	_meta_right.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_meta_right.add_theme_font_size_override("font_size", 17)
	_meta_right.add_theme_color_override("font_color", Color("#C084FC"))
	ClientUi.apply_display_font(_meta_right)
	head_r.add_child(_meta_right)

	_status = ClientUi.make_status()
	_status.visible = false
	root.add_child(_status)

	var body := HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 12)
	root.add_child(body)

	# ── Left: spiral map (~1.85 flex) ──
	var map_col := VBoxContainer.new()
	map_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_col.size_flags_stretch_ratio = 1.85
	map_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_col.add_theme_constant_override("separation", 0)
	body.add_child(map_col)

	var map_frame := PanelContainer.new()
	map_frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_frame.clip_contents = true
	map_frame.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.02, 0.025, 0.06, 0.98), Color(Color("#C084FC"), 0.28), 16, 1
	))
	map_col.add_child(map_frame)

	var map_stack := Control.new()
	map_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_stack.clip_contents = true
	map_frame.add_child(map_stack)

	_map_stage = SpiralStage.new()
	_map_stage.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_map_stage.custom_minimum_size = Vector2(373, 373)
	_map_stage.layout = _layout
	_map_stage.planet_pressed.connect(_on_planet_pressed)
	_map_stage.wormhole_pressed.connect(_on_wormhole)
	_map_stage.zoom_changed.connect(_on_zoom_changed)
	map_stack.add_child(_map_stage)

	_map_hint = Label.new()
	_map_hint.set_anchors_and_offsets_preset(PRESET_BOTTOM_WIDE)
	_map_hint.offset_top = -48
	_map_hint.offset_bottom = -13
	_map_hint.offset_left = 21
	_map_hint.offset_right = -21
	_map_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_map_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_map_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_map_hint.z_index = 5
	_map_hint.add_theme_font_size_override("font_size", 15)
	_map_hint.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.9))
	ClientUi.apply_body_font(_map_hint)
	_map_hint.text = "Worlds 1–10 spiral into the Wormhole. Tap your current world to inspect its lore."
	map_stack.add_child(_map_hint)

	# ── Right: planet view (~clamp 260–440 / ~28vw) ──
	_detail_root = PanelContainer.new()
	_detail_root.custom_minimum_size = Vector2(400, 0)
	_detail_root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_detail_root.size_flags_stretch_ratio = 0.72
	_detail_root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_detail_root.clip_contents = true
	_detail_root.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.055, 0.1, 0.99), Color(ClientUi.CYAN, 0.35), 16, 1
	))
	body.add_child(_detail_root)

	var detail_outer := VBoxContainer.new()
	detail_outer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_outer.add_theme_constant_override("separation", 10)
	_detail_root.add_child(detail_outer)

	var detail_stack := Control.new()
	detail_stack.clip_contents = true
	detail_stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_outer.add_child(detail_stack)

	_detail_glow = ColorRect.new()
	_detail_glow.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_detail_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_detail_glow.color = Color(0.13, 0.77, 0.37, 0.08)
	detail_stack.add_child(_detail_glow)

	# Top tint hairline (web DungeonPlanetView)
	_detail_hair = ColorRect.new()
	_detail_hair.set_anchors_and_offsets_preset(PRESET_TOP_WIDE)
	_detail_hair.offset_bottom = 2
	_detail_hair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_detail_hair.color = ClientUi.CYAN
	detail_stack.add_child(_detail_hair)

	var d_margin := MarginContainer.new()
	d_margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	d_margin.add_theme_constant_override("margin_left", 14)
	d_margin.add_theme_constant_override("margin_right", 14)
	d_margin.add_theme_constant_override("margin_top", 14)
	d_margin.add_theme_constant_override("margin_bottom", 8)
	detail_stack.add_child(d_margin)

	var dcol := VBoxContainer.new()
	dcol.size_flags_vertical = Control.SIZE_EXPAND_FILL
	dcol.add_theme_constant_override("separation", 8)
	d_margin.add_child(dcol)

	# Planet header
	var head_row := HBoxContainer.new()
	head_row.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	head_row.add_theme_constant_override("separation", 10)
	dcol.add_child(head_row)

	_detail_icon_wrap = PanelContainer.new()
	_detail_icon_wrap.custom_minimum_size = Vector2(64, 64)
	head_row.add_child(_detail_icon_wrap)
	_detail_icon = Label.new()
	_detail_icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_detail_icon.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_detail_icon.add_theme_font_size_override("font_size", 32)
	_detail_icon_wrap.add_child(_detail_icon)

	var head_col := VBoxContainer.new()
	head_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_col.add_theme_constant_override("separation", 2)
	head_row.add_child(head_col)

	_detail_sector = Label.new()
	_detail_sector.add_theme_font_size_override("font_size", 13)
	_detail_sector.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(_detail_sector)
	head_col.add_child(_detail_sector)

	_detail_title = Label.new()
	_detail_title.clip_text = true
	_detail_title.add_theme_font_size_override("font_size", 24)
	ClientUi.apply_display_font(_detail_title)
	head_col.add_child(_detail_title)

	_detail_boss = Label.new()
	_detail_boss.clip_text = true
	_detail_boss.add_theme_font_size_override("font_size", 16)
	_detail_boss.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_detail_boss)
	head_col.add_child(_detail_boss)

	var cleared_col := VBoxContainer.new()
	cleared_col.add_theme_constant_override("separation", 0)
	head_row.add_child(cleared_col)
	_detail_cleared_lab = Label.new()
	_detail_cleared_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_detail_cleared_lab.add_theme_font_size_override("font_size", 13)
	_detail_cleared_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_detail_cleared_lab)
	cleared_col.add_child(_detail_cleared_lab)
	_detail_cleared_val = Label.new()
	_detail_cleared_val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_detail_cleared_val.add_theme_font_size_override("font_size", 24)
	ClientUi.apply_display_font(_detail_cleared_val)
	cleared_col.add_child(_detail_cleared_val)

	_detail_progress = ProgressBar.new()
	_detail_progress.min_value = 0
	_detail_progress.max_value = 10
	_detail_progress.show_percentage = false
	_detail_progress.custom_minimum_size = Vector2(0, 7)
	_detail_progress.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	dcol.add_child(_detail_progress)

	_detail_desc = Label.new()
	_detail_desc.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_detail_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail_desc.max_lines_visible = 2
	_detail_desc.add_theme_font_size_override("font_size", 17)
	_detail_desc.add_theme_color_override("font_color", Color(0.82, 0.86, 0.92, 0.95))
	ClientUi.apply_body_font(_detail_desc)
	dcol.add_child(_detail_desc)

	_mode_banner = PanelContainer.new()
	_mode_banner.visible = false
	_mode_banner.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_mode_banner.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.96, 0.62, 0.04, 0.08), Color("#F59E0B", 0.28), 10, 1
	))
	dcol.add_child(_mode_banner)
	var mode_row := HBoxContainer.new()
	mode_row.add_theme_constant_override("separation", 8)
	_mode_banner.add_child(mode_row)
	_mode_label = Label.new()
	_mode_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_mode_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_mode_label.add_theme_font_size_override("font_size", 15)
	_mode_label.add_theme_color_override("font_color", Color("#FEF3C7", 0.92))
	ClientUi.apply_body_font(_mode_label)
	mode_row.add_child(_mode_label)
	_return_front_btn = Button.new()
	_return_front_btn.text = "Front"
	ClientUi.apply_ghost_button(_return_front_btn)
	_return_front_btn.add_theme_font_size_override("font_size", 13)
	_return_front_btn.add_theme_color_override("font_color", ClientUi.CYAN)
	_return_front_btn.pressed.connect(_return_to_front)
	mode_row.add_child(_return_front_btn)

	_reward_banner = PanelContainer.new()
	_reward_banner.visible = false
	_reward_banner.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	dcol.add_child(_reward_banner)
	var reward_row := HBoxContainer.new()
	reward_row.add_theme_constant_override("separation", 8)
	_reward_banner.add_child(reward_row)
	var gem := Label.new()
	gem.text = "💎"
	gem.add_theme_font_size_override("font_size", 19)
	reward_row.add_child(gem)
	_detail_reward = Label.new()
	_detail_reward.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_detail_reward.clip_text = true
	_detail_reward.add_theme_font_size_override("font_size", 16)
	_detail_reward.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_detail_reward)
	reward_row.add_child(_detail_reward)

	# Encounter path — expands; Fight stays pinned below (outside this expand body).
	var enc_frame := PanelContainer.new()
	enc_frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	enc_frame.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.02, 0.025, 0.05, 0.5), Color(0.35, 0.4, 0.5, 0.4), 12, 1
	))
	dcol.add_child(enc_frame)
	var enc_col := VBoxContainer.new()
	enc_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	enc_col.add_theme_constant_override("separation", 8)
	enc_frame.add_child(enc_col)
	var enc_head := HBoxContainer.new()
	enc_head.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	enc_col.add_child(enc_head)
	var enc_lab := Label.new()
	enc_lab.text = "ENCOUNTER PATH"
	enc_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	enc_lab.add_theme_font_size_override("font_size", 13)
	enc_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(enc_lab)
	enc_head.add_child(enc_lab)
	var enc_sub := Label.new()
	enc_sub.text = "1–9 · Boss"
	enc_sub.add_theme_font_size_override("font_size", 13)
	enc_sub.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.85))
	ClientUi.apply_body_font(enc_sub)
	enc_head.add_child(enc_sub)

	_encounter_grid = GridContainer.new()
	_encounter_grid.columns = 5
	_encounter_grid.add_theme_constant_override("h_separation", 6)
	_encounter_grid.add_theme_constant_override("v_separation", 6)
	_encounter_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_encounter_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	enc_col.add_child(_encounter_grid)

	# Actions pinned under the clipped body so the grid never covers Fight.
	var actions := VBoxContainer.new()
	actions.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	actions.add_theme_constant_override("separation", 8)
	detail_outer.add_child(actions)

	var act_pad := MarginContainer.new()
	act_pad.add_theme_constant_override("margin_left", 14)
	act_pad.add_theme_constant_override("margin_right", 14)
	act_pad.add_theme_constant_override("margin_bottom", 14)
	actions.add_child(act_pad)
	var act_col := VBoxContainer.new()
	act_col.add_theme_constant_override("separation", 8)
	act_pad.add_child(act_col)

	_cooldown_bar = PanelContainer.new()
	_cooldown_bar.visible = false
	_cooldown_bar.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.96, 0.62, 0.04, 0.08), Color("#F59E0B", 0.32), 10, 1
	))
	act_col.add_child(_cooldown_bar)
	var cd_row := HBoxContainer.new()
	cd_row.add_theme_constant_override("separation", 8)
	_cooldown_bar.add_child(cd_row)
	_cooldown_lab = Label.new()
	_cooldown_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_cooldown_lab.add_theme_font_size_override("font_size", 16)
	_cooldown_lab.add_theme_color_override("font_color", Color("#FDE68A"))
	ClientUi.apply_display_font(_cooldown_lab)
	cd_row.add_child(_cooldown_lab)
	_skip_btn = Button.new()
	_skip_btn.text = "⚡ Skip · %s💎" % DungeonRules.SKIP_COST
	ClientUi.apply_ghost_button(_skip_btn)
	_skip_btn.add_theme_font_size_override("font_size", 15)
	_skip_btn.add_theme_color_override("font_color", Color("#FDE68A"))
	_skip_btn.pressed.connect(_on_skip)
	cd_row.add_child(_skip_btn)

	_fight_btn = Button.new()
	_fight_btn.text = "⚔  Fight 1"
	_fight_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_fight_btn.custom_minimum_size.y = 61
	ClientUi.apply_primary_button(_fight_btn)
	_fight_btn.add_theme_font_size_override("font_size", 20)
	_fight_btn.pressed.connect(_on_fight)
	act_col.add_child(_fight_btn)


func _populate_meta() -> void:
	var c := GameManager.active_character
	var active := DungeonManager.current_planet_id()
	var in_infinite := active > 10
	var depth := maxi(1, active - 10)
	_subtitle.text = "1 hour cooldown, skip for %s💎%s" % [
		str(DungeonRules.SKIP_COST),
		(" · Wormhole depth %s" % depth) if in_infinite else "",
	]

	var installed_mods := ShipRules.loadout_for(c).size()
	var relics: Variant = c.get("ship_mods", [])
	var relic_count := (relics as Array).size() if typeof(relics) == TYPE_ARRAY else 0
	_meta_right.text = "⚡  %s mods%s" % [
		installed_mods,
		(" · %s relics" % relic_count) if relic_count > 0 else "",
	]

	_update_detail()
	if _map_stage:
		_map_stage.refresh_state()


func _populate() -> void:
	_populate_meta()


func _update_detail() -> void:
	for c in _encounter_grid.get_children():
		c.queue_free()

	var pid := DungeonManager.selected_planet_id
	var viewing_wh := DungeonManager.viewing_wormhole
	var active := DungeonManager.current_planet_id()
	var enemy_idx := DungeonManager.current_enemy_index()
	var display_enemy := enemy_idx
	# Only the active frontier node (story front or current wormhole depth) can be fought.
	var fightable := pid == active

	var planet: Dictionary
	if viewing_wh:
		planet = DungeonRules.get_planet(pid)
	else:
		planet = DungeonRules.get_planet(pid)
	if planet.is_empty():
		return

	var tint: Color = planet.get("color", ClientUi.CYAN)
	if viewing_wh:
		tint = Color("#C084FC")

	_detail_root.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.055, 0.1, 0.99), Color(tint, 0.45), 16, 1
	))
	_detail_glow.color = Color(tint, 0.12)
	if _detail_hair:
		_detail_hair.color = tint
	_detail_icon_wrap.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(tint, 0.22), Color(tint, 0.55), 12, 1
	))
	_detail_icon.text = str(planet.get("icon", "🪐"))

	if viewing_wh:
		_detail_sector.text = "? WORMHOLE"
		_detail_sector.add_theme_color_override("font_color", Color("#C084FC"))
	else:
		_detail_sector.text = "SECTOR %s" % str(planet.get("id", pid))
		_detail_sector.add_theme_color_override("font_color", ClientUi.CYAN)

	_detail_title.text = str(planet.get("name", "?"))
	_detail_title.add_theme_color_override("font_color", tint)

	_detail_boss.visible = true
	_detail_boss.text = "%s  %s" % [
		str(planet.get("boss_emoji", "?")),
		str(planet.get("boss", "")),
	]

	var cleared := maxi(0, display_enemy - 1)
	if viewing_wh:
		cleared = maxi(0, enemy_idx - 1)
	elif pid != active:
		cleared = 10 if pid < active else 0

	_detail_cleared_lab.text = "CLEARED"
	_detail_cleared_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	_detail_cleared_val.text = "%s/10" % cleared
	_detail_cleared_val.add_theme_color_override("font_color", tint)

	_detail_progress.value = cleared
	ClientUi.apply_hp_bar(_detail_progress, tint)

	_detail_desc.text = str(planet.get("desc", ""))

	_mode_banner.visible = false

	var ship_mod := str(planet.get("ship_mod", ""))
	_reward_banner.visible = not ship_mod.is_empty()
	if _reward_banner.visible:
		_reward_banner.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(tint, 0.08), Color(tint, 0.28), 10, 1
		))
		_detail_reward.text = "Boss reward · %s" % ship_mod
		_detail_reward.add_theme_color_override("font_color", Color("#FDE68A", 0.95))

	# Encounter cells — active node highlights the current enemy; other worlds show cleared/locked.
	for i in range(1, 11):
		var is_boss := i == 10
		var is_current := i == display_enemy
		var is_cleared := i < display_enemy
		var locked := i > display_enemy
		if not viewing_wh and pid != active:
			if pid < active:
				is_cleared = true
				is_current = false
				locked = false
			else:
				locked = true
				is_cleared = false
				is_current = false
		_encounter_grid.add_child(_enc_cell(i, is_boss, is_current, is_cleared, locked))

	var locked_ahead := (not viewing_wh) and pid > active
	_update_actions(fightable, locked_ahead, display_enemy)


func _update_actions(fightable: bool, locked_ahead: bool, enemy_idx: int) -> void:
	var cooldown := DungeonManager.cooldown_ms()

	_cooldown_bar.visible = cooldown > 0
	if cooldown > 0:
		_cooldown_lab.text = "⏱  Cooldown %s" % DungeonRules.format_ms(cooldown)

	_fight_btn.disabled = cooldown > 0 or _busy or not fightable

	if fightable:
		_fight_btn.text = "⚔  Fight %s%s" % [
			enemy_idx, " · BOSS" if enemy_idx == DungeonRules.ENEMIES_PER_PLANET else "",
		]
		ClientUi.apply_primary_button(_fight_btn)
	elif locked_ahead:
		_fight_btn.text = "🔒  Locked"
		ClientUi.apply_ghost_button(_fight_btn)
	else:
		_fight_btn.text = "✓  Cleared"
		ClientUi.apply_ghost_button(_fight_btn)


func _enc_cell(
	idx: int, is_boss: bool, is_current: bool, is_cleared: bool, locked: bool
) -> PanelContainer:
	var border := Color(0.35, 0.4, 0.5, 0.45)
	var bg := Color(0.06, 0.07, 0.1, 0.95)
	var icon := "⚔"
	var icon_col := ClientUi.CYAN
	var label := str(idx)
	var label_col := ClientUi.TEXT
	var use_lock_icon := false

	if is_boss:
		border = Color("#FBBF24", 0.55)
		bg = Color(0.12, 0.08, 0.03, 0.95)
		icon = "👑"
		icon_col = Color("#FCD34D")
		label = "BOSS"
		label_col = Color("#FDE68A")
	elif is_current:
		border = Color(ClientUi.CYAN, 0.7)
		bg = Color(0.04, 0.1, 0.12, 0.96)
		icon = "⚔"
		icon_col = ClientUi.CYAN
	elif is_cleared:
		border = Color(ClientUi.SUCCESS, 0.4)
		bg = Color(0.04, 0.1, 0.07, 0.9)
		icon = "✓"
		icon_col = ClientUi.SUCCESS
		label_col = Color(ClientUi.SUCCESS, 0.9)
	elif locked:
		border = Color(0.3, 0.32, 0.38, 0.35)
		bg = Color(0.05, 0.05, 0.07, 0.55)
		icon = ""
		use_lock_icon = true
		icon_col = Color(ClientUi.MUTED, 0.85)
		label_col = Color(ClientUi.MUTED, 0.6)

	var cell := PanelContainer.new()
	cell.custom_minimum_size = Vector2(48, 69)
	cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cell.size_flags_vertical = Control.SIZE_EXPAND_FILL
	cell.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(bg, border, 10, 2 if (is_current or is_boss) else 1))
	var col := VBoxContainer.new()
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 2)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	cell.add_child(col)
	if is_current:
		var next := Label.new()
		next.text = "NEXT"
		next.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		next.add_theme_font_size_override("font_size", 11)
		next.add_theme_color_override("font_color", Color(0.02, 0.05, 0.08))
		ClientUi.apply_display_font(next)
		var next_bg := PanelContainer.new()
		var next_style := ClientUi.painted_panel_style(ClientUi.CYAN, ClientUi.CYAN, 6, 0)
		next_style.content_margin_left = 6
		next_style.content_margin_right = 6
		next_style.content_margin_top = 1
		next_style.content_margin_bottom = 1
		next_bg.add_theme_stylebox_override("panel", next_style)
		next_bg.add_child(next)
		col.add_child(next_bg)
	if use_lock_icon:
		var lock_wrap := CenterContainer.new()
		lock_wrap.custom_minimum_size = Vector2(24, 24)
		lock_wrap.add_child(UiIcon.make("lock", icon_col, 18.0))
		col.add_child(lock_wrap)
	else:
		var icon_lab := Label.new()
		icon_lab.text = icon
		icon_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		icon_lab.add_theme_font_size_override("font_size", 19)
		icon_lab.add_theme_color_override("font_color", icon_col)
		col.add_child(icon_lab)
	var lab := Label.new()
	lab.text = label
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", 12)
	lab.add_theme_color_override("font_color", label_col)
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	return cell


func _on_planet_pressed(planet_id: int) -> void:
	DungeonManager.select_planet(planet_id, false)
	_populate_meta()


func _on_zoom_changed(zooming: bool) -> void:
	_map_hint.text = (
		"Inspecting your current sector — pull back to return to the chart."
		if zooming
		else "Worlds 1–10 spiral into the Wormhole. Tap your current world to inspect its lore."
	)


func _return_to_front() -> void:
	var active := DungeonManager.current_planet_id()
	if active > 10:
		DungeonManager.select_planet(active, true)
	else:
		DungeonManager.select_planet(active, false)
	if _map_stage:
		_map_stage.clear_zoom()
	_populate_meta()


func _on_wormhole() -> void:
	var active := DungeonManager.current_planet_id()
	var depth := maxi(1, active - 10)
	DungeonManager.select_planet(10 + depth, true)
	_populate_meta()


func _set_status(msg: String, danger := false) -> void:
	_status.visible = not msg.is_empty()
	_status.text = msg
	_status.add_theme_color_override(
		"font_color",
		Color(1.0, 0.55, 0.45) if danger else ClientUi.MUTED
	)


func _on_fight() -> void:
	if _busy:
		return
	_busy = true
	_set_status("Preparing encounter…")
	var prep: Dictionary = await DungeonManager.prepare_fight()
	_busy = false
	if not prep.ok:
		var err := str(prep.get("error", "Cannot fight"))
		var low := err.to_lower()
		if low.contains("failed") or low.contains("network") or low.contains("timeout"):
			_set_status(err, true)
		else:
			Notify.blocked(err)
			_set_status("")
		_populate_meta()
		return
	GameManager.go_galaxy_combat()


func _on_skip() -> void:
	if _busy:
		return
	if DungeonManager.cooldown_ms() <= 0:
		Notify.blocked("No cooldown to skip")
		return
	_busy = true
	_set_status("Skipping cooldown…")
	var res: Dictionary = await DungeonManager.skip_cooldown()
	_busy = false
	if not res.ok:
		var err := str(res.get("error", "Skip failed"))
		var low := err.to_lower()
		if low.contains("failed") or low.contains("network") or low.contains("timeout"):
			_set_status(err, true)
		else:
			Notify.blocked(err)
			_set_status("")
	else:
		_set_status("")
		_populate()
