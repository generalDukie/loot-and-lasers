extends Control
## Shared duel overlay — mirrors web ArenaBattleOverlay (arena + mission + dungeon).
## Node owns combat simulation; this file is presentation + settlement only.

## Base sizes at ui_scale 1.0 (~1600×900 stage). Responsive via _combat_ui_scale().
const FIGHTER_W_BASE := 300.0
const FIGHTER_H_BASE := 360.0
const PORTRAIT_BASE := 280.0
const HP_BAR_H_BASE := 38.0
const CLASS_ICON_BASE := 36.0
## Temporary: hide GearIcon weapon glyphs in all duel UIs (mission/arena/frontier).
## Bump/lunge + attack SFX stay. Flip back on when better glyphs land.
const SHOW_WEAPON_GLYPHS := false

const STAT_COLORS := {
	"strength": Color("#F87171"),
	"agility": Color("#4ADE80"),
	"intellect": Color("#60A5FA"),
	"vitality": Color("#FBBF24"),
	"luck": Color("#C084FC"),
}
const MOD_COLORS := {
	"dmg": Color("#F87171"),
	"armor": Color("#FBBF24"),
	"tech": Color("#38BDF8"),
	"crit": Color("#C084FC"),
	"dodge": Color("#4ADE80"),
}

var _beats: CombatBeatConfig
var _fx: CombatFxLayer
var _motion: CombatFighterMotion
var _hp: CombatHpPresenter

var _player_hp: TextureProgressBar
var _enemy_hp: TextureProgressBar
var _player_hp_name: Label
var _enemy_hp_name: Label
var _player_hp_nums: Label
var _enemy_hp_nums: Label
var _player_status: Control
var _enemy_status: Control
var _combat_log: RichTextLabel
var _dev_diag: Label
var _skip_btn: Button
var _stage: Control
var _fighters: Control
var _fx_layer: Control
var _banner: Label
var _intro_layer: Control
var _outro_layer: Control
var _outro_title: Label
var _outro_sub: Label
var _outro_btn: Button
var _flash: ColorRect
var _combo_lab: Label
var _combo_wrap: PanelContainer
var _player_anchor: Control
var _enemy_anchor: Control
var _player_card: Control
var _enemy_card: Control
var _backdrop: ArenaStageBackdrop
var _ability_banner: PanelContainer
var _ability_icon: TextureRect
var _ability_title: Label
var _ability_detail: Label
var _ability_class: Label
var _player_weapon: Dictionary = {}
var _enemy_weapon: Dictionary = {}
var _player_weapon_label: Control
var _enemy_weapon_label: Control
var _matchup_panel: Control
var _player_totals: Dictionary = {}
var _enemy_totals: Dictionary = {}
var _duel_player: Dictionary = {}
var _duel_enemy: Dictionary = {}
var _duel_player_items: Array = []
var _duel_enemy_items: Array = []
var _sheet_host: Control
var _prev_level := 1
var _generation := 0
var _ability_tween: Tween
var _theme_chip: HBoxContainer
var _theme_chip_icon: CenterContainer
var _theme_chip_lab: Label
var _dungeon_ctx: Dictionary = {}
var _fighter_size: Vector2 = Vector2(FIGHTER_W_BASE, FIGHTER_H_BASE)
var _portrait_px: float = PORTRAIT_BASE

var _events: Array = []
var _event_i := 0
var _phase := "intro"
var _playing := false
var _finished := false
var _dismiss_handled := false
var _busy := false
var _combo := 0
## Snapshot of the committed fight for Replay after settle clears pending_battle.
var _presentation_battle: Dictionary = {}
var _cached_summary: Dictionary = {}
var _rewards_settled := false
var _watch_only := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_beats = CombatBeatConfig.make_default()
	_fx = CombatFxLayer.new()
	_motion = CombatFighterMotion.new()
	_hp = CombatHpPresenter.new()
	_build()
	_fx.setup(_fx_layer, _fighters, _flash, _beats)
	_motion.setup(_beats)
	_hp.setup(_player_hp, _enemy_hp, _player_hp_nums, _enemy_hp_nums, _beats)
	_boot()


func _exit_tree() -> void:
	handle_external_dismiss()


## Called when the shell clears the combat overlay (nav away / close).
## Mid-replay → background settle + View Rewards CTA. Concluded/settled → no-op.
func handle_external_dismiss() -> void:
	if _dismiss_handled:
		return
	_dismiss_handled = true
	if _finished or _rewards_settled or _watch_only:
		return
	_generation += 1
	_playing = false
	var combat_kind := "arena"
	if _is_mission():
		combat_kind = "mission"
	elif _is_dungeon():
		combat_kind = "dungeon"
	if _phase == "outro":
		CombatReturnManager.capture_presentation_from_managers(combat_kind, _prev_level, _dungeon_ctx)
		CombatReturnManager.note_outro_pending(combat_kind, _prev_level, _dungeon_ctx)
		return
	# Mid-intro / mid-fight: settle rewards now so return doesn't replay.
	CombatReturnManager.capture_presentation_from_managers(combat_kind, _prev_level, _dungeon_ctx)
	CombatReturnManager.begin_settle_from_replay(combat_kind, _prev_level, _dungeon_ctx)


func _build() -> void:
	# Web: fixed inset-0 duel stage over dark void.
	_backdrop = ArenaStageBackdrop.new()
	_backdrop.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	add_child(_backdrop)
	# Soft live stage — redraws every frame at Engine.max_fps (120).
	_backdrop.set_live(true)

	_theme_chip = HBoxContainer.new()
	_theme_chip.visible = false
	_theme_chip.alignment = BoxContainer.ALIGNMENT_CENTER
	_theme_chip.add_theme_constant_override("separation", 6)
	_theme_chip.set_anchors_preset(PRESET_CENTER_TOP)
	_theme_chip.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_theme_chip.offset_top = 10
	_theme_chip.offset_left = -220
	_theme_chip.offset_right = 220
	_theme_chip.offset_bottom = 36
	_theme_chip.z_index = 35
	_theme_chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_theme_chip)
	_theme_chip_icon = CenterContainer.new()
	_theme_chip_icon.custom_minimum_size = Vector2(16, 16)
	_theme_chip.add_child(_theme_chip_icon)
	_theme_chip_lab = Label.new()
	_theme_chip_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_theme_chip_lab.add_theme_font_size_override("font_size", 13)
	ClientUi.apply_display_font(_theme_chip_lab)
	_theme_chip.add_child(_theme_chip_lab)

	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	var hp_pad := MarginContainer.new()
	hp_pad.add_theme_constant_override("margin_left", 28)
	hp_pad.add_theme_constant_override("margin_right", 28)
	hp_pad.add_theme_constant_override("margin_top", 16)
	hp_pad.add_theme_constant_override("margin_bottom", 6)
	root.add_child(hp_pad)

	var hp_row := HBoxContainer.new()
	hp_row.add_theme_constant_override("separation", 16)
	hp_pad.add_child(hp_row)

	var p_hp := _make_hp_side(false)
	p_hp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hp_row.add_child(p_hp)
	_player_hp_name = p_hp.get_meta("name_lab")
	_player_hp = p_hp.get_meta("bar")
	_player_hp_nums = p_hp.get_meta("nums")
	_player_status = p_hp.get_meta("status")

	var mid := VBoxContainer.new()
	mid.custom_minimum_size.x = 64
	mid.alignment = BoxContainer.ALIGNMENT_CENTER
	hp_row.add_child(mid)
	mid.add_child(UiIcon.make("swords", Color("#FCD34D", 0.9), 32.0))

	var e_hp := _make_hp_side(true)
	e_hp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hp_row.add_child(e_hp)
	_enemy_hp_name = e_hp.get_meta("name_lab")
	_enemy_hp = e_hp.get_meta("bar")
	_enemy_hp_nums = e_hp.get_meta("nums")
	_enemy_status = e_hp.get_meta("status")

	_stage = Control.new()
	_stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_stage.clip_contents = true
	root.add_child(_stage)

	_fighters = Control.new()
	_fighters.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_fighters.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stage.add_child(_fighters)

	_player_anchor = _make_fighter_anchor()
	_fighters.add_child(_player_anchor)
	_enemy_anchor = _make_fighter_anchor()
	_fighters.add_child(_enemy_anchor)
	_stage.resized.connect(_layout_fighters)
	_fighters.resized.connect(_layout_fighters)

	# Corner brackets like web duel frame.
	_add_corner(Color("#22D3EE", 0.35), true, true)
	_add_corner(Color("#FB7185", 0.35), false, true)
	_add_corner(Color("#22D3EE", 0.35), true, false)
	_add_corner(Color("#FB7185", 0.35), false, false)

	_fx_layer = Control.new()
	_fx_layer.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_fx_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stage.add_child(_fx_layer)

	_flash = ColorRect.new()
	_flash.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_flash.color = Color(1, 1, 1, 0)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stage.add_child(_flash)

	_ability_banner = PanelContainer.new()
	_ability_banner.visible = false
	_ability_banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ability_banner.z_index = 20
	_stage.add_child(_ability_banner)
	var ab_col := VBoxContainer.new()
	ab_col.add_theme_constant_override("separation", 2)
	_ability_banner.add_child(ab_col)
	_ability_icon = ClassIcon.make("Vanguard", ClassIcon.SIZE_BANNER)
	_ability_icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	ab_col.add_child(_ability_icon)
	_ability_title = Label.new()
	_ability_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ability_title.add_theme_font_size_override("font_size", 24)
	ClientUi.apply_display_font(_ability_title)
	ab_col.add_child(_ability_title)
	_ability_detail = Label.new()
	_ability_detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ability_detail.add_theme_font_size_override("font_size", 17)
	ClientUi.apply_display_font(_ability_detail)
	ab_col.add_child(_ability_detail)
	_ability_class = Label.new()
	_ability_class.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ability_class.add_theme_font_size_override("font_size", 14)
	ClientUi.apply_display_font(_ability_class)
	ab_col.add_child(_ability_class)

	_banner = Label.new()
	_banner.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_banner.modulate.a = 0.0
	_banner.z_index = 25
	_banner.add_theme_font_size_override("font_size", 68)
	_banner.add_theme_color_override("font_color", Color("#FBBF24"))
	ClientUi.apply_display_font(_banner)
	_stage.add_child(_banner)

	_intro_layer = Control.new()
	_intro_layer.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_intro_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_intro_layer.z_index = 40
	_stage.add_child(_intro_layer)
	var intro_col := VBoxContainer.new()
	intro_col.set_anchors_preset(PRESET_CENTER_TOP)
	intro_col.grow_horizontal = Control.GROW_DIRECTION_BOTH
	intro_col.offset_top = 64
	intro_col.offset_left = -240
	intro_col.offset_right = 240
	intro_col.add_theme_constant_override("separation", 8)
	_intro_layer.add_child(intro_col)
	var vs_row := Label.new()
	vs_row.name = "VsRow"
	vs_row.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vs_row.add_theme_font_size_override("font_size", 26)
	ClientUi.apply_display_font(vs_row)
	intro_col.add_child(vs_row)
	var fight_row := HBoxContainer.new()
	fight_row.name = "FightLab"
	fight_row.alignment = BoxContainer.ALIGNMENT_CENTER
	fight_row.add_theme_constant_override("separation", 12)
	intro_col.add_child(fight_row)
	fight_row.add_child(UiIcon.make("swords", Color("#FBBF24"), 48.0))
	var fight_lab := Label.new()
	fight_lab.text = "FIGHT!"
	fight_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	fight_lab.add_theme_font_size_override("font_size", 58)
	fight_lab.add_theme_color_override("font_color", Color("#FBBF24"))
	ClientUi.apply_display_font(fight_lab)
	fight_row.add_child(fight_lab)

	_outro_layer = ColorRect.new()
	_outro_layer.color = Color(0, 0, 0, 0.72)
	_outro_layer.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_outro_layer.visible = false
	_outro_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	# Above empty _sheet_host so VIEW REWARDS is never blocked by the sheet mount.
	_outro_layer.z_index = 70
	add_child(_outro_layer)
	var outro_center := CenterContainer.new()
	outro_center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_outro_layer.add_child(outro_center)
	var outro_col := VBoxContainer.new()
	outro_col.add_theme_constant_override("separation", 10)
	outro_center.add_child(outro_col)
	_outro_title = Label.new()
	_outro_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_outro_title.add_theme_font_size_override("font_size", 72)
	ClientUi.apply_display_font(_outro_title)
	outro_col.add_child(_outro_title)
	_outro_sub = Label.new()
	_outro_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_outro_sub.add_theme_font_size_override("font_size", 20)
	_outro_sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_outro_sub)
	outro_col.add_child(_outro_sub)
	_outro_btn = Button.new()
	_outro_btn.text = "VIEW REWARDS"
	_outro_btn.custom_minimum_size = Vector2(320, 64)
	ClientUi.apply_primary_button(_outro_btn)
	_outro_btn.pressed.connect(_on_outro_continue)
	outro_col.add_child(_outro_btn)

	var combo_row := Control.new()
	combo_row.custom_minimum_size.y = 40
	root.add_child(combo_row)
	_combo_wrap = PanelContainer.new()
	_combo_wrap.visible = false
	_combo_wrap.set_anchors_preset(PRESET_CENTER)
	_combo_wrap.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_combo_wrap.grow_vertical = Control.GROW_DIRECTION_BOTH
	_combo_wrap.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.96, 0.62, 0.04, 0.18), Color("#FBBF24", 0.55), 14, 1
	))
	combo_row.add_child(_combo_wrap)
	_combo_lab = Label.new()
	_combo_lab.add_theme_font_size_override("font_size", 20)
	_combo_lab.add_theme_color_override("font_color", Color("#FCD34D"))
	ClientUi.apply_display_font(_combo_lab)
	_combo_wrap.add_child(_combo_lab)

	var skip_pad := MarginContainer.new()
	skip_pad.add_theme_constant_override("margin_bottom", 24)
	skip_pad.add_theme_constant_override("margin_top", 2)
	root.add_child(skip_pad)
	var skip_row := HBoxContainer.new()
	skip_row.alignment = BoxContainer.ALIGNMENT_CENTER
	skip_pad.add_child(skip_row)
	_skip_btn = Button.new()
	_skip_btn.text = "SKIP TO RESULTS"
	_skip_btn.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_skip_btn.custom_minimum_size = Vector2(320, 58)
	_apply_skip_cta(_skip_btn)
	_skip_btn.pressed.connect(_on_skip)
	skip_row.add_child(_skip_btn)

	_apply_combat_tutorial_tags()

	_sheet_host = Control.new()
	_sheet_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_sheet_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sheet_host.z_index = 80
	# Hidden until a reward sheet is mounted — a full-rect host can still steal
	# hits from the outro in some Godot versions even with MOUSE_FILTER_IGNORE.
	_sheet_host.visible = false
	add_child(_sheet_host)

	_combat_log = RichTextLabel.new()
	_combat_log.bbcode_enabled = true
	# Fixed panel size — grow-to-fit overflows the BR box and hides new lines.
	_combat_log.fit_content = false
	_combat_log.scroll_active = true
	_combat_log.scroll_following = true
	_combat_log.clip_contents = true
	_combat_log.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_combat_log.set_anchors_preset(PRESET_BOTTOM_RIGHT)
	_combat_log.anchor_left = 1.0
	_combat_log.anchor_top = 1.0
	_combat_log.anchor_right = 1.0
	_combat_log.anchor_bottom = 1.0
	_combat_log.offset_left = -340
	_combat_log.offset_top = -180
	_combat_log.offset_right = -12
	_combat_log.offset_bottom = -72
	_combat_log.add_theme_font_size_override("normal_font_size", 15)
	_combat_log.add_theme_color_override("default_color", Color(1, 1, 1, 0.78))
	_combat_log.z_index = 25
	add_child(_combat_log)

	_dev_diag = Label.new()
	_dev_diag.visible = CombatPresentation.is_dev_diagnostics_enabled()
	_dev_diag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dev_diag.set_anchors_preset(PRESET_TOP_LEFT)
	_dev_diag.offset_left = 12
	_dev_diag.offset_top = 56
	_dev_diag.offset_right = 320
	_dev_diag.offset_bottom = 140
	_dev_diag.add_theme_font_size_override("font_size", 12)
	_dev_diag.add_theme_color_override("font_color", Color("#FCD34D", 0.9))
	_dev_diag.z_index = 40
	add_child(_dev_diag)


func _make_hp_side(align_right: bool) -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	var name_lab := Label.new()
	name_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if align_right else HORIZONTAL_ALIGNMENT_LEFT
	name_lab.add_theme_font_size_override("font_size", 28)
	name_lab.add_theme_color_override("font_color", Color("#FB7185") if align_right else Color("#22D3EE"))
	ClientUi.apply_display_font(name_lab)
	col.add_child(name_lab)
	# TextureProgressBar so fill_mode can be fixed per side (no scaleX mirror).
	var bar := TextureProgressBar.new()
	bar.min_value = 0
	bar.max_value = 100
	bar.value = 100
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.custom_minimum_size = Vector2(0, HP_BAR_H_BASE)
	_apply_combat_hp_bar(bar, Color("#FB7185") if align_right else Color("#22D3EE"), align_right)
	col.add_child(bar)
	var nums := Label.new()
	nums.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if align_right else HORIZONTAL_ALIGNMENT_LEFT
	nums.add_theme_font_size_override("font_size", 22)
	nums.add_theme_color_override("font_color", Color("#E2E8F0"))
	ClientUi.apply_display_font(nums)
	col.add_child(nums)
	var status := HBoxContainer.new()
	status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	status.custom_minimum_size.y = 22
	status.add_theme_constant_override("separation", 8)
	status.alignment = (
		BoxContainer.ALIGNMENT_END if align_right else BoxContainer.ALIGNMENT_BEGIN
	)
	col.add_child(status)
	col.set_meta("name_lab", name_lab)
	col.set_meta("bar", bar)
	col.set_meta("nums", nums)
	col.set_meta("status", status)
	col.set_meta("status_align_right", align_right)
	return col


func _apply_combat_hp_bar(bar: TextureProgressBar, fill: Color, enemy_side: bool) -> void:
	## Permanent fill orientation per side — never scaleX / never toggled on hits.
	bar.fill_mode = (
		TextureProgressBar.FILL_LEFT_TO_RIGHT
		if enemy_side
		else TextureProgressBar.FILL_RIGHT_TO_LEFT
	)
	bar.nine_patch_stretch = true
	bar.stretch_margin_left = 6
	bar.stretch_margin_top = 6
	bar.stretch_margin_right = 6
	bar.stretch_margin_bottom = 6
	bar.texture_under = CombatHpPresenter._solid_tex(Color(0.02, 0.03, 0.055, 0.96))
	bar.texture_progress = CombatHpPresenter._solid_tex(Color.WHITE)
	bar.tint_under = Color(0.02, 0.03, 0.055, 0.96)
	bar.tint_progress = fill
	bar.scale = Vector2.ONE


func _apply_skip_cta(btn: Button) -> void:
	ClientUi.apply_display_font(btn)
	btn.alignment = HORIZONTAL_ALIGNMENT_CENTER
	btn.add_theme_font_size_override("font_size", 23)
	btn.add_theme_stylebox_override("normal", ClientUi.button_style(Color("#F59E0B"), Color("#FCD34D")))
	btn.add_theme_stylebox_override("hover", ClientUi.button_style(Color("#FBBF24"), Color("#FDE68A")))
	btn.add_theme_stylebox_override("pressed", ClientUi.button_style(Color("#D97706"), Color("#F59E0B")))
	btn.add_theme_color_override("font_color", Color(0.05, 0.05, 0.05))
	btn.add_theme_color_override("font_hover_color", Color(0.02, 0.02, 0.02))
	btn.add_theme_color_override("font_pressed_color", Color(0.08, 0.05, 0.0))
	ClientUi.apply_interaction_motion(btn)


func _add_corner(color: Color, left: bool, top: bool) -> void:
	var c := ColorRect.new()
	c.color = color
	c.custom_minimum_size = Vector2(24, 2)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.set_anchors_preset(PRESET_TOP_LEFT)
	if left:
		c.offset_left = 13
		c.offset_right = 37
	else:
		c.anchor_left = 1.0
		c.anchor_right = 1.0
		c.offset_left = -37
		c.offset_right = -13
	if top:
		c.offset_top = 13
		c.offset_bottom = 16
	else:
		c.anchor_top = 1.0
		c.anchor_bottom = 1.0
		c.offset_top = -16
		c.offset_bottom = -13
	_stage.add_child(c)
	var v := ColorRect.new()
	v.color = color
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.set_anchors_preset(PRESET_TOP_LEFT)
	if left:
		v.offset_left = 13
		v.offset_right = 16
	else:
		v.anchor_left = 1.0
		v.anchor_right = 1.0
		v.offset_left = -16
		v.offset_right = -13
	if top:
		v.offset_top = 13
		v.offset_bottom = 37
	else:
		v.anchor_top = 1.0
		v.anchor_bottom = 1.0
		v.offset_top = -37
		v.offset_bottom = -13
	_stage.add_child(v)


func _boot() -> void:
	_watch_only = bool(GameManager.combat_watch_only)
	GameManager.combat_watch_only = false
	var combat_kind := "arena"
	if _is_mission():
		combat_kind = "mission"
	elif _is_dungeon():
		combat_kind = "dungeon"
	# Settled / outro-pending rewards are claimed via the source-page CTA — never remount fight.
	if not _watch_only and CombatReturnManager.is_for_kind(combat_kind):
		_dismiss_handled = true
		_finished = true
		call_deferred("_abort_remount")
		return
	if _watch_only:
		CombatReturnManager.restore_presentation_to_managers()
		_cached_summary = CombatReturnManager.last_watch.get("summary", {}).duplicate(true) \
			if typeof(CombatReturnManager.last_watch.get("summary", null)) == TYPE_DICTIONARY \
			else {}
		_rewards_settled = true
		_prev_level = int(CombatReturnManager.last_watch.get("prev_level", _prev_level))
		_dungeon_ctx = CombatReturnManager.last_watch.get("dungeon_ctx", {}).duplicate(true) \
			if typeof(CombatReturnManager.last_watch.get("dungeon_ctx", null)) == TYPE_DICTIONARY \
			else {}
	if _is_mission():
		await _boot_mission()
	elif _is_dungeon():
		await _boot_dungeon()
	else:
		await _boot_arena()


func _abort_remount() -> void:
	if is_instance_valid(self):
		GameManager.close_overlay()


func _apply_combat_tutorial_tags() -> void:
	if _is_mission():
		return
	TutorialManager.tag_target(_outro_btn, "arena-outro")
	TutorialManager.tag_target(_skip_btn, "arena-outro")


func _tutorial_mission_skip_locked() -> bool:
	## Guided first mission duel — player must watch the playback (rewatch may skip).
	return _is_mission() and not _watch_only and TutorialManager.blocks_combat_skip_to_results()


func _sync_tutorial_skip_lock() -> void:
	if not is_instance_valid(_skip_btn):
		return
	if _tutorial_mission_skip_locked():
		_skip_btn.visible = false
		_skip_btn.disabled = true


func _is_mission() -> bool:
	return str(GameManager.combat_overlay_kind) == "mission"


func _is_dungeon() -> bool:
	return str(GameManager.combat_overlay_kind) == "dungeon"


func _opp() -> Dictionary:
	if not _duel_enemy.is_empty():
		return _duel_enemy
	if _is_mission():
		return MissionManager.pending_enemy
	if _is_dungeon():
		return DungeonManager.pending_enemy
	return ArenaManager.pending_opp


func _battle() -> Dictionary:
	if _is_mission():
		return MissionManager.pending_battle
	if _is_dungeon():
		return DungeonManager.pending_battle
	return ArenaManager.pending_battle


func _player_items() -> Array:
	if _is_mission():
		return MissionManager.pending_player_items
	if _is_dungeon():
		return DungeonManager.pending_player_items
	return ArenaManager.equipped_items


func _boot_arena() -> void:
	if ArenaManager.pending_battle.is_empty() or ArenaManager.pending_opp.is_empty():
		await get_tree().create_timer(0.2).timeout
		GameManager.close_overlay()
		GameManager.go_arena()
		return
	var battle_opp: Dictionary = ArenaManager.pending_opp.duplicate(true)
	_start_duel(
		GameManager.active_character,
		battle_opp,
		ArenaManager.pending_battle.duplicate(true),
		ArenaManager.equipped_items,
		ArenaRules.resolve_opp_items(battle_opp)
	)


func _boot_mission() -> void:
	if not _watch_only and not MissionManager.has_active_mission():
		await get_tree().create_timer(0.35).timeout
		GameManager.close_overlay()
		GameManager.go_cantina()
		return
	# Mission run may have already prepared the duel (Skip / Fight) — don't double-fetch.
	if MissionManager.pending_battle.is_empty():
		if _watch_only:
			await get_tree().create_timer(0.2).timeout
			GameManager.close_overlay()
			GameManager.go_cantina()
			return
		var prep: Dictionary = await MissionManager.prepare_combat()
		if not prep.get("ok", false) or MissionManager.pending_battle.is_empty():
			await get_tree().create_timer(0.5).timeout
			GameManager.close_overlay()
			GameManager.go_mission_run()
			return
	var enemy_items: Array = []
	if typeof(MissionManager.pending_enemy.get("equippedItems", null)) == TYPE_ARRAY:
		enemy_items = MissionManager.pending_enemy.get("equippedItems", [])
	_start_duel(
		GameManager.active_character,
		MissionManager.pending_enemy,
		MissionManager.pending_battle,
		MissionManager.pending_player_items,
		enemy_items
	)


func _boot_dungeon() -> void:
	if DungeonManager.pending_battle.is_empty() or DungeonManager.pending_enemy.is_empty():
		await get_tree().create_timer(0.35).timeout
		GameManager.close_overlay()
		GameManager.go_galaxy()
		return
	var enemy: Dictionary = DungeonManager.pending_enemy
	if _watch_only and not _dungeon_ctx.is_empty():
		# Prefer the snapshot captured at settle time.
		pass
	else:
		var planet: Dictionary = DungeonRules.get_planet(DungeonManager.selected_planet_id)
		var is_boss := bool(enemy.get("isBoss", false))
		_dungeon_ctx = {
			"planet_name": str(planet.get("name", "Frontier")),
			"planet_icon": str(planet.get("icon", "")),
			"planet_color": planet.get("color", Color("#34D399")),
			"is_boss": is_boss,
			"enemy_name": str(enemy.get("name", "Foe")),
			"enemy_index": _dungeon_enemy_index(enemy),
		}
	var accent := Color("#34D399")
	var raw_accent: Variant = _dungeon_ctx.get("planet_color", accent)
	if typeof(raw_accent) == TYPE_COLOR:
		accent = raw_accent as Color
	_backdrop.set_accent(accent)
	var picon := str(_dungeon_ctx.get("planet_icon", "orbit"))
	var pname := str(_dungeon_ctx.get("planet_name", "Frontier"))
	if picon.strip_edges().is_empty():
		picon = "orbit"
	CurrencyIcon.fill_glyph_host(_theme_chip_icon, picon, 14.0, accent.lightened(0.25))
	_theme_chip_lab.text = pname
	_theme_chip_lab.add_theme_color_override("font_color", accent.lightened(0.25))
	_theme_chip.visible = true
	_start_duel(
		GameManager.active_character,
		enemy,
		DungeonManager.pending_battle,
		DungeonManager.pending_player_items,
		[]
	)


func _dungeon_enemy_index(enemy: Dictionary) -> int:
	var id := str(enemy.get("id", ""))
	var parts := id.split("-")
	if parts.size() >= 3:
		return clampi(int(parts[2]), 1, DungeonRules.ENEMIES_PER_PLANET)
	return DungeonManager.current_enemy_index()


## Prefer server display_stats (EPA / gear+Stim finals).
## Never route PvE/bot foes through StatsRules.raw_stats — that collapses missing
## or sub-50 EPA budgets into class base (looks like "only base stats").
static func _attr_map_sum(totals: Dictionary) -> int:
	var s := 0
	for k in StatsRules.ATTR_KEYS:
		s += int(totals.get(k, 0))
	return s


static func _normalize_attr_map(raw: Variant) -> Dictionary:
	var out := {
		"strength": 0, "agility": 0, "intellect": 0, "vitality": 0, "luck": 0,
	}
	if typeof(raw) != TYPE_DICTIONARY:
		return out
	for k in out.keys():
		out[k] = int((raw as Dictionary).get(k, 0))
	return out


static func _is_class_base_only(character: Dictionary, totals: Dictionary) -> bool:
	var class_key := str(character.get("class", "Vanguard"))
	var base: Dictionary = StatsRules.CLASS_BASE_STATS.get(class_key, StatsRules.CLASS_BASE_STATS["Vanguard"])
	for k in StatsRules.ATTR_KEYS:
		if int(totals.get(k, 0)) != int(base.get(k, 0)):
			return false
	return _attr_map_sum(totals) > 0


static func _is_generated_foe(character: Dictionary) -> bool:
	# Never treat the local operative as a generated foe — overlay kind alone
	# used to mark *both* sides as foes in mission/dungeon/arena.
	if GameManager != null:
		var active_id := str(GameManager.active_character.get("id", "")).strip_edges()
		var cid := str(character.get("id", character.get("character_id", ""))).strip_edges()
		if not active_id.is_empty() and cid == active_id:
			return false
	if bool(character.get("missionEnemy", false)) \
			or bool(character.get("mission_enemy", false)) \
			or bool(character.get("dungeonEnemy", false)) \
			or bool(character.get("dungeon_enemy", false)) \
			or bool(character.get("isBot", false)) \
			or bool(character.get("is_bot", false)):
		return true
	# Stripped public summaries omit flags — use combat overlay kind for foes only.
	if GameManager == null:
		return false
	var kind := str(GameManager.combat_overlay_kind)
	if kind == "mission" or kind == "dungeon":
		# Player already excluded above; remaining combatants in these modes are PvE.
		return true
	if kind == "arena":
		var real_id := str(character.get("realCharacterId", character.get("character_id", "")))
		return real_id.is_empty() and str(character.get("id", "")).is_empty()
	return false


static func _infer_mission_archetype(character: Dictionary) -> String:
	var arch := str(character.get("missionEnemyArchetype", character.get("dungeonEnemyArchetype", "")))
	if not arch.is_empty():
		return arch
	var ck := str(character.get("class", "Vanguard"))
	if ck in ["Shadow Operative", "Void Runner"]:
		return "REFLEX"
	if ck in ["Technomancer", "Cosmic Engineer"]:
		return "TECH"
	return "MIGHT"


static func _epa_enemy_totals(opp: Dictionary) -> Dictionary:
	var level := maxi(1, int(opp.get("level", 1)))
	var epa := float(ExpectedPlayerAttributes.at(level))
	var kind := str(GameManager.combat_overlay_kind) if GameManager != null else ""
	var as_mission := bool(opp.get("missionEnemy", false)) or bool(opp.get("mission_enemy", false)) \
		or kind == "mission"
	var as_dungeon := bool(opp.get("dungeonEnemy", false)) or bool(opp.get("dungeon_enemy", false)) \
		or bool(opp.get("isBoss", false)) or bool(opp.get("boss", false)) \
		or kind == "dungeon"
	if as_mission and kind != "dungeon" and not bool(opp.get("dungeonEnemy", false)):
		var budget := int(round(epa * 0.35))
		return MissionCombat.distribute_attrs(budget, _infer_mission_archetype(opp))
	if as_dungeon:
		var boss := bool(opp.get("isBoss", false)) or bool(opp.get("boss", false))
		var budget2 := int(round(epa * (1.30 if boss else 1.20)))
		return MissionCombat.distribute_attrs(budget2, _infer_mission_archetype(opp))
	if bool(opp.get("isBot", false)) or bool(opp.get("is_bot", false)) or kind == "arena":
		var class_key := ArenaRules.normalize_class(str(opp.get("class", "Vanguard")))
		var shares: Dictionary = ArenaRules.BALANCED_SHARES.get(class_key, ArenaRules.BALANCED_SHARES["Vanguard"])
		var primary: String = ArenaRules.PRIMARY_STAT.get(class_key, "strength")
		return ArenaRules.allocate_attrs(int(round(epa)), shares, primary)
	return {}


## Prefer server display_stats (EPA / gear+Stim finals).
## Real operatives: never trust bare character.stats (missing gear/stims) — use
## display_totals when server finals are absent.
## PvE/bots: never route through raw_stats / class base as if those were EPA.
static func _matchup_totals(
	character: Dictionary,
	items: Array,
	server_totals: Variant = null,
	is_player: bool = false
) -> Dictionary:
	var mapped := _normalize_attr_map(server_totals)
	if _attr_map_sum(mapped) <= 0:
		mapped = _normalize_attr_map(character.get("display_stats", null))

	var generated := (not is_player) and _is_generated_foe(character)

	# Usable server/local display map: non-zero, and not a class-base placeholder on foes.
	if _attr_map_sum(mapped) > 0 and not (generated and _is_class_base_only(character, mapped)):
		return mapped

	if generated:
		var epa_totals := _epa_enemy_totals(character)
		if _attr_map_sum(epa_totals) > 0:
			return epa_totals

	# Player / real operative fallback: permanent + gear + active Stims.
	return StatsRules.display_totals(character, items)


func _start_duel(
	player: Dictionary,
	opp: Dictionary,
	battle: Dictionary,
	player_items: Array,
	opp_items: Array
) -> void:
	var player_name := str(player.get("name", "You"))
	var opp_name := str(opp.get("name", "Rival"))
	_prev_level = int(player.get("level", 1))
	_player_weapon = GameData.weapon_from_items(player_items)
	_enemy_weapon = GameData.weapon_from_items(opp_items)
	_duel_player = player.duplicate(true)
	_duel_enemy = opp.duplicate(true)
	_duel_player_items = player_items.duplicate(true)
	_duel_enemy_items = opp_items.duplicate(true)
	var server_player: Variant = battle.get("player_display_stats", null)
	# Prefer explicit display_stats; only fall back to stats when display_stats key is absent.
	var server_enemy: Variant = null
	if opp.has("display_stats") and typeof(opp.get("display_stats")) == TYPE_DICTIONARY:
		server_enemy = opp.get("display_stats")
	elif opp.has("stats") and typeof(opp.get("stats")) == TYPE_DICTIONARY:
		server_enemy = opp.get("stats")
	_player_totals = _matchup_totals(player, player_items, server_player, true)
	_enemy_totals = _matchup_totals(opp, opp_items, server_enemy, false)
	# Keep matchup source on the foe for rebuilds / return-to-combat.
	if _attr_map_sum(_enemy_totals) > 0:
		_duel_enemy["display_stats"] = _enemy_totals.duplicate()
		opp["display_stats"] = _enemy_totals.duplicate()
	# Mirror finalized player totals so rebuilds don't fall back to naked stats.
	if _attr_map_sum(_player_totals) > 0:
		_duel_player["display_stats"] = _player_totals.duplicate()
		player["display_stats"] = _player_totals.duplicate()

	_player_hp_name.text = player_name
	_enemy_hp_name.text = opp_name

	_clear_fighter_anchors()

	_recompute_fighter_metrics()
	_player_card = _mount_fighter(_player_anchor, player, Color("#22D3EE"), _player_weapon, true)
	_enemy_card = _mount_fighter(_enemy_anchor, opp, Color("#FB7185"), _enemy_weapon, false)
	_rebuild_matchup()
	# Defer layout until stage has a real size (first frame after mount).
	call_deferred("_layout_fighters")

	var p_max := maxi(1, int(battle.get("playerMaxHp", 1)))
	var e_max := maxi(1, int(battle.get("opponentMaxHp", 1)))
	_hp.reset(p_max, p_max, e_max, e_max)

	_events = battle.get("events", []) if typeof(battle.get("events", [])) == TYPE_ARRAY else []
	_event_i = 0
	_phase = "intro"
	_playing = true
	_presentation_battle = battle.duplicate(true)
	_sync_tutorial_skip_lock()

	var vs_row: Label = _intro_layer.find_child("VsRow", true, false) as Label
	if vs_row:
		vs_row.text = "%s   VS   %s" % [player_name, opp_name]
		vs_row.add_theme_color_override("font_color", Color("#67E8F9"))
	_intro_layer.visible = true
	_intro_layer.modulate.a = 0.0
	var intro_tw := _intro_layer.create_tween()
	intro_tw.tween_property(_intro_layer, "modulate:a", 1.0, 0.22)
	await get_tree().create_timer(_beats.intro_duration()).timeout
	# Skip during intro cancels playback — leave concluded path + final HP on screen.
	if not is_instance_valid(self) or _finished or not _playing or _phase == "outro":
		return
	var fade := _intro_layer.create_tween()
	fade.tween_property(_intro_layer, "modulate:a", 0.0, 0.18)
	await fade.finished
	if not is_instance_valid(self) or _finished or not _playing or _phase == "outro":
		return
	_intro_layer.visible = false
	_motion.start_idle(_player_card, 0.0)
	_motion.start_idle(_enemy_card, 0.35)
	_phase = "fight"
	_run_playback()


func _make_fighter_anchor() -> Control:
	var anchor := Control.new()
	anchor.name = "FighterAnchor"
	anchor.custom_minimum_size = _fighter_size
	anchor.size = _fighter_size
	anchor.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return anchor


func _combat_ui_scale() -> float:
	if _fighters == null or _fighters.size.x < 8.0 or _fighters.size.y < 8.0:
		return 1.0
	var sx := _fighters.size.x / 1600.0
	var sy := _fighters.size.y / 900.0
	return clampf(minf(sx, sy), 0.75, 1.3)


func _recompute_fighter_metrics() -> void:
	var s := _combat_ui_scale()
	_portrait_px = PORTRAIT_BASE * s
	_fighter_size = Vector2(FIGHTER_W_BASE * s, FIGHTER_H_BASE * s)
	if _player_hp:
		_player_hp.custom_minimum_size.y = HP_BAR_H_BASE * s
	if _enemy_hp:
		_enemy_hp.custom_minimum_size.y = HP_BAR_H_BASE * s
	# Scale lunges with fighter footprint so travel still reads across the gap.
	if _beats:
		_beats.lunge_distance = 56.0 * s
		_beats.slip_distance = 36.0 * s
		_beats.float_rise_px = 64.0 * s


func _layout_fighters() -> void:
	if _fighters == null or _player_anchor == null or _enemy_anchor == null:
		return
	var s := _combat_ui_scale()
	var desired_portrait := PORTRAIT_BASE * s
	# First real size after mount (or meaningful scale change): remount at correct scale.
	if _fighters.size.x > 64.0 and is_instance_valid(_player_card) \
			and absf(desired_portrait - _portrait_px) > 10.0 \
			and not _duel_player.is_empty():
		_recompute_fighter_metrics()
		_remount_current_fighters()
	elif not is_instance_valid(_player_card):
		_recompute_fighter_metrics()
	s = _combat_ui_scale()
	## Keep a clear corridor between fighters; matchup lives at bottom-center (not in the gap).
	var gap := maxf(120.0 * s, 140.0)
	var total_w := _fighter_size.x * 2.0 + gap
	if total_w > _fighters.size.x - 24.0 and _fighters.size.x > 64.0:
		gap = maxf(64.0, _fighters.size.x - 24.0 - _fighter_size.x * 2.0)
	var x0 := maxf(12.0, (_fighters.size.x - (_fighter_size.x * 2.0 + gap)) * 0.5)
	var y0 := maxf(12.0, (_fighters.size.y - _fighter_size.y) * 0.28)
	_player_anchor.custom_minimum_size = _fighter_size
	_player_anchor.size = _fighter_size
	_enemy_anchor.custom_minimum_size = _fighter_size
	_enemy_anchor.size = _fighter_size
	_player_anchor.position = Vector2(x0, y0)
	_enemy_anchor.position = Vector2(x0 + _fighter_size.x + gap, y0)
	if is_instance_valid(_player_card):
		_player_card.size = _fighter_size
		_player_card.pivot_offset = _fighter_size * 0.5
	if is_instance_valid(_enemy_card):
		_enemy_card.size = _fighter_size
		_enemy_card.pivot_offset = _fighter_size * 0.5
	_layout_matchup(s)


func _clear_fighter_anchors() -> void:
	if is_instance_valid(_player_card):
		_player_card = null
	if is_instance_valid(_enemy_card):
		_enemy_card = null
	for child in _player_anchor.get_children():
		_player_anchor.remove_child(child)
		child.free()
	for child in _enemy_anchor.get_children():
		_enemy_anchor.remove_child(child)
		child.free()


func _remount_current_fighters() -> void:
	_clear_fighter_anchors()
	_player_card = _mount_fighter(_player_anchor, _duel_player, Color("#22D3EE"), _player_weapon, true)
	_enemy_card = _mount_fighter(_enemy_anchor, _duel_enemy, Color("#FB7185"), _enemy_weapon, false)
	_rebuild_matchup()
	if _motion and is_instance_valid(_player_card):
		_motion.start_idle(_player_card, 0.0)
	if _motion and is_instance_valid(_enemy_card):
		_motion.start_idle(_enemy_card, 0.35)


func _layout_matchup(s: float) -> void:
	if not is_instance_valid(_matchup_panel) or _fighters == null:
		return
	_matchup_panel.reset_size()
	var mw := maxf(420.0 * clampf(s, 0.75, 1.35), _matchup_panel.get_combined_minimum_size().x)
	var mh := maxf(200.0 * clampf(s, 0.75, 1.35), _matchup_panel.get_combined_minimum_size().y)
	mw = minf(mw, maxf(280.0, _fighters.size.x - 48.0))
	## Bottom-center combat dashboard — clear of fighter art.
	var cx := _fighters.size.x * 0.5
	var bottom_pad := 18.0 * s
	var cy := _fighters.size.y - bottom_pad - mh * 0.5
	# Keep above the absolute floor if the stage is short.
	cy = maxf(cy, _fighter_size.y + 24.0 * s)
	_matchup_panel.position = Vector2(cx - mw * 0.5, cy - mh * 0.5)
	_matchup_panel.size = Vector2(mw, mh)


func _rebuild_matchup() -> void:
	if is_instance_valid(_matchup_panel):
		_matchup_panel.queue_free()
		_matchup_panel = null
	if _stage == null:
		return
	_matchup_panel = CombatAttributeMatchup.make_panel(
		_player_totals,
		_enemy_totals,
		_duel_player,
		_duel_enemy,
		_duel_player_items,
		_duel_enemy_items,
		_combat_ui_scale()
	)
	_matchup_panel.z_index = 8
	_matchup_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_stage.add_child(_matchup_panel)


func _mount_fighter(anchor: Control, character: Dictionary, tint: Color, weapon: Dictionary, is_player: bool) -> Control:
	var card := _portrait_card(character, tint, weapon, is_player)
	card.name = "PlayerCenter" if is_player else "EnemyCenter"
	anchor.add_child(card)
	card.size = _fighter_size
	card.position = Vector2.ZERO
	card.pivot_offset = _fighter_size * 0.5
	return card


func _portrait_card(character: Dictionary, tint: Color, weapon: Dictionary, is_player: bool) -> Control:
	var s := _combat_ui_scale()
	var frame := Control.new()
	frame.custom_minimum_size = _fighter_size
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var col := VBoxContainer.new()
	col.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	col.alignment = BoxContainer.ALIGNMENT_BEGIN
	col.add_theme_constant_override("separation", int(6 * s))
	frame.add_child(col)

	var head := HBoxContainer.new()
	head.alignment = BoxContainer.ALIGNMENT_CENTER
	head.add_theme_constant_override("separation", int(8 * s))
	col.add_child(head)
	var icon := ClassIcon.make(str(character.get("class", "")), CLASS_ICON_BASE * s)
	head.add_child(icon)
	var name := Label.new()
	name.text = str(character.get("name", "?"))
	name.add_theme_font_size_override("font_size", int(22 * s))
	name.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(name)
	head.add_child(name)
	var lvl := Label.new()
	lvl.text = "Lv %s" % int(character.get("level", 1))
	lvl.add_theme_font_size_override("font_size", int(16 * s))
	lvl.add_theme_color_override("font_color", Color(tint, 0.75))
	ClientUi.apply_display_font(lvl)
	head.add_child(lvl)

	var portrait_sz := _portrait_px
	var portrait_wrap := Control.new()
	portrait_wrap.name = "PlayerHitPoint" if is_player else "EnemyHitPoint"
	portrait_wrap.custom_minimum_size = Vector2(portrait_sz, portrait_sz)
	portrait_wrap.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	portrait_wrap.clip_contents = false
	col.add_child(portrait_wrap)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	center.clip_contents = false
	portrait_wrap.add_child(center)
	var portrait := AvatarRenderer.make_portrait(character, portrait_sz)
	portrait.clip_contents = false
	if not is_player:
		portrait.scale = Vector2(-1, 1)
		portrait.pivot_offset = Vector2(portrait_sz * 0.5, portrait_sz * 0.5)
	center.add_child(portrait)

	if SHOW_WEAPON_GLYPHS:
		var wlab := Control.new()
		wlab.name = "PlayerAttackOrigin" if is_player else "EnemyAttackOrigin"
		wlab.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var wicon := 48.0 * s
		wlab.custom_minimum_size = Vector2(wicon + 8.0, wicon + 8.0)
		wlab.set_anchors_preset(PRESET_CENTER_RIGHT if is_player else PRESET_CENTER_LEFT)
		if is_player:
			wlab.offset_left = -(wicon + 12.0)
			wlab.offset_right = 0
		else:
			wlab.offset_left = 0
			wlab.offset_right = wicon + 12.0
		wlab.offset_top = -wicon * 0.5
		wlab.offset_bottom = wicon * 0.5
		wlab.pivot_offset = Vector2(wicon * 0.5, wicon * 0.5)
		var witem := {
			"name": str(weapon.get("name", "")),
			"base_name": str(weapon.get("base_name", "")),
			"type": "weapon",
			"rarity": str(weapon.get("rarity", "common")),
		}
		wlab.add_child(GearIcon.make(witem, wicon))
		portrait_wrap.add_child(wlab)
		if is_player:
			_player_weapon_label = wlab
		else:
			_enemy_weapon_label = wlab
	elif is_player:
		_player_weapon_label = null
	else:
		_enemy_weapon_label = null

	return frame


func _update_hp_ui() -> void:
	if _hp:
		_hp.snap(_hp.player_hp, _hp.enemy_hp)


func _event_duration(ev: Dictionary) -> float:
	return _beats.beat_duration(ev)


func _combo_at(i: int) -> int:
	if i < 0 or i >= _events.size():
		return 0
	var raw: Variant = _events[i]
	if typeof(raw) != TYPE_DICTIONARY:
		return 0
	var ev: Dictionary = raw
	var ev_type := str(ev.get("type", ""))
	if ev.is_empty() or bool(ev.get("dodged", false)) or ev_type in ["regen", "dodge", "miss", "passive"]:
		return 0
	if ev.get("attacker", null) == null:
		return 0
	var count := 0
	var j := i
	while j >= 0:
		var raw_e: Variant = _events[j]
		if typeof(raw_e) != TYPE_DICTIONARY:
			break
		var e: Dictionary = raw_e
		var et := str(e.get("type", ""))
		if str(e.get("attacker", "")) == str(ev.get("attacker", "")) \
				and not bool(e.get("dodged", false)) \
				and et not in ["regen", "dodge", "miss", "passive"]:
			count += 1
		else:
			break
		j -= 1
	return count


func _run_playback() -> void:
	_generation += 1
	var gen := _generation
	while _playing and not _finished and _event_i < _events.size():
		if gen != _generation:
			return
		var raw: Variant = _events[_event_i]
		if typeof(raw) != TYPE_DICTIONARY:
			_event_i += 1
			continue
		var ev: Dictionary = raw
		_combo = _combo_at(_event_i)
		_update_combo(str(ev.get("attacker", "")))
		await _play_one_event(ev, gen)
		if gen != _generation or _finished:
			return
		_event_i += 1
		if _hp.player_hp <= 0 or _hp.enemy_hp <= 0:
			break
	if gen != _generation or _finished:
		return
	_conclude_fight()


func _update_combo(_attacker: String) -> void:
	if _combo >= 2:
		_combo_wrap.visible = true
		_combo_lab.text = "⚡  COMBO ×%s" % _combo
	else:
		_combo_wrap.visible = false


func _play_one_event(ev: Dictionary, gen: int) -> void:
	# Ability banners linger on their own timer; only replace when a new one fires.
	var land_at := _beats.land_delay(ev)
	_maybe_ability_banner(ev)
	_begin_event_fx(ev)
	if land_at > 0.0:
		await get_tree().create_timer(land_at).timeout
		if gen != _generation or _finished:
			return
	_land_event(ev)
	# Crits get a tiny readable hold without stretching the whole fight.
	if bool(ev.get("crit", false)):
		var hold := _beats.scaled(_beats.hit_pause_crit_s)
		if hold > 0.01:
			await get_tree().create_timer(hold).timeout
			if gen != _generation or _finished:
				return
	await get_tree().create_timer(_beats.recovery_after_land(ev)).timeout


func _begin_event_fx(ev: Dictionary) -> void:
	var t := str(ev.get("type", ""))
	var quiet := t == "regen"
	var attacker := _card_for(ev.get("attacker", null))
	var defender := _card_for(ev.get("defender", null))
	var side := str(ev.get("attacker", "player"))

	if quiet:
		return
	if t == "dodge" or t == "miss" or bool(ev.get("dodged", false)):
		_motion.lunge(attacker, side)
		_motion.slip(defender, str(ev.get("defender", "player")))
		return
	if t in ["attack", "drone", "ability", "secondary"] or int(ev.get("damage", 0)) > 0:
		if SHOW_WEAPON_GLYPHS:
			var weapon: Dictionary = _player_weapon if side == "player" else _enemy_weapon
			var wlab := _player_weapon_label if side == "player" else _enemy_weapon_label
			_motion.swing_weapon(wlab, side, str(weapon.get("style", "swing")))
		_motion.lunge(attacker, side)


func _land_event(ev: Dictionary) -> void:
	var t := str(ev.get("type", ""))
	var defender := _card_for(ev.get("defender", null))
	if defender == null and (t == "barrier" or t == "passive"):
		defender = _card_for(ev.get("side", null))
	var attacker := _card_for(ev.get("attacker", null))
	var side := str(ev.get("attacker", "player"))
	var weapon: Dictionary = _player_weapon if side == "player" else _enemy_weapon

	_refresh_status_presentation()
	_append_combat_log(ev)

	var floater: Dictionary = CombatPresentation.floater_label(ev)
	if not floater.is_empty():
		var host: Control = defender if defender else attacker
		if host:
			var floater_color: Color = floater.get("color", Color.WHITE) as Color
			_fx.float_text(
				host,
				str(floater.get("label", "")),
				floater_color,
				int(floater.get("font_size", CombatPresentation.FLOAT_FONT_OTHER)),
				bool(floater.get("bold", false)),
				str(floater.get("icon", ""))
			)

	if int(ev.get("heal", 0)) > 0:
		var heal := int(ev.get("heal", 0))
		var to_player := str(ev.get("defender", "player")) == "player"
		_hp.apply_heal(to_player, heal)
		AudioManager.play_ui("claim")
		return

	if t == "dodge" or t == "miss" or bool(ev.get("dodged", false)):
		if t == "dodge" or bool(ev.get("dodged", false)):
			_motion.slip(defender, str(ev.get("defender", "player")))
		AudioManager.play_ui("dodge")
		return

	if t == "passive" and int(ev.get("damage", 0)) <= 0:
		AudioManager.play_ui("ability")
		return

	if t == "barrier":
		if defender:
			_motion.guard(defender)
		AudioManager.play_ui("dodge")
		return

	var shield := bool(ev.get("shieldHit", false))
	var dmg := int(ev.get("damage", 0))
	if shield and dmg <= 0:
		_motion.guard(defender)
		AudioManager.play_ui("dodge")
		return
	if shield and dmg > 0:
		_motion.guard(defender)
		AudioManager.play_ui("dodge")

	if dmg <= 0:
		return

	var crit := bool(ev.get("crit", false))
	var ability := t == "drone" or t == "ability"
	_motion.impact(defender, crit or ability, _fx)
	AudioManager.play_attack(str(weapon.get("style", "swing")), crit, ability)
	var to_player := str(ev.get("defender", "")) == "player"
	var flash_col := Color(1.0, 0.35, 0.35) if to_player else (Color(1.0, 0.85, 0.35) if crit else Color(0.4, 0.9, 1.0))
	_hp.apply_damage(to_player, dmg, flash_col)
	if crit or ability:
		_fx.shake(_beats.shake_crit if crit else _beats.shake_hit * 1.4)
		_fx.flash(_beats.flash_peak * (1.25 if crit else 1.0))
		if _backdrop:
			_backdrop.set_pulse(true)
			get_tree().create_timer(0.4).timeout.connect(func() -> void:
				if is_instance_valid(_backdrop):
					_backdrop.set_pulse(false)
			)
	else:
		_fx.shake(_beats.shake_hit)
		_fx.flash(_beats.flash_peak * 0.55)


func _maybe_ability_banner(ev: Dictionary) -> void:
	var banner := ClassPassives.resolve_ability_banner(
		ev, GameManager.active_character, _opp()
	)
	if banner.is_empty():
		return
	# Player class callouts always; opponent only for real PvP (not bots / mission / dungeon).
	var side := str(banner.get("side", "player"))
	if side == "opponent" and _is_generated_foe(_opp()):
		return
	_show_ability_banner(banner)


func _refresh_status_presentation() -> void:
	var status: Dictionary = CombatPresentation.reduce_status(_events, _event_i)
	var player_side: Dictionary = status.get("player", {}) as Dictionary
	var opponent_side: Dictionary = status.get("opponent", {}) as Dictionary
	if _player_status:
		CombatPresentation.fill_status_chip(_player_status, player_side, false)
	if _enemy_status:
		CombatPresentation.fill_status_chip(_enemy_status, opponent_side, true)
	if _dev_diag and _dev_diag.visible:
		var ev: Dictionary = {}
		if _event_i >= 0 and _event_i < _events.size() and typeof(_events[_event_i]) == TYPE_DICTIONARY:
			ev = _events[_event_i]
		_dev_diag.text = "COMBAT DEV\nidx %s/%s\ntype=%s kind=%s\ndmg=%s crit=%s dtype=%s" % [
			_event_i,
			maxi(0, _events.size() - 1),
			str(ev.get("type", "—")),
			str(ev.get("kind", ev.get("missKind", "—"))),
			str(ev.get("damage", 0)),
			str(bool(ev.get("crit", false))),
			str(ev.get("damageType", "—")),
		]


func _append_combat_log(ev: Dictionary) -> void:
	if _combat_log == null:
		return
	var line := CombatPresentation.format_log_line(ev, _event_i)
	if CombatPresentation.is_ability_log_event(ev):
		_combat_log.append_text("[color=#E9D5FF]%s[/color]\n" % line)
	else:
		_combat_log.append_text(line + "\n")
	# Keep last ~12 lines readable without a huge panel.
	var txt := _combat_log.get_parsed_text()
	var lines := txt.split("\n")
	if lines.size() > 14:
		var keep := PackedStringArray()
		for i in range(maxi(0, lines.size() - 12), lines.size()):
			keep.append(lines[i])
		_combat_log.clear()
		_combat_log.append_text("\n".join(keep))
	# Layout needs a tick before scroll_to_line sees the new height.
	call_deferred("_scroll_combat_log_to_end")


func _scroll_combat_log_to_end() -> void:
	if _combat_log == null or not is_instance_valid(_combat_log):
		return
	var last := maxi(0, _combat_log.get_line_count() - 1)
	_combat_log.scroll_to_line(last)


func _hide_ability_banner() -> void:
	if _ability_tween != null and _ability_tween.is_valid():
		_ability_tween.kill()
		_ability_tween = null
	if _ability_banner != null and is_instance_valid(_ability_banner):
		_ability_banner.visible = false
		_ability_banner.modulate.a = 0.0


func _show_ability_banner(banner: Dictionary) -> void:
	if _ability_banner == null:
		return
	_hide_ability_banner()
	var color: Color = banner.get("color", ClientUi.CYAN)
	var side := str(banner.get("side", "player"))
	_ability_banner.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(color, 0.14), Color(color, 0.7), 12, 2)
	)
	_ability_icon.texture = ClassIcon.texture(str(banner.get("className", "")))
	_ability_title.text = str(banner.get("name", ""))
	_ability_title.add_theme_color_override("font_color", color)
	var detail := str(banner.get("detail", ""))
	_ability_detail.visible = not detail.is_empty()
	_ability_detail.text = detail
	_ability_detail.add_theme_color_override("font_color", Color(color, 0.95))
	_ability_class.text = str(banner.get("className", "")).to_upper()
	_ability_class.add_theme_color_override("font_color", Color(color, 0.7))

	_ability_banner.reset_size()
	var bw := maxf(140.0, _ability_banner.get_combined_minimum_size().x)
	var bh := maxf(72.0, _ability_banner.get_combined_minimum_size().y)
	if side == "player":
		_ability_banner.position = Vector2(24, _stage.size.y * 0.36)
	else:
		_ability_banner.position = Vector2(_stage.size.x - bw - 24, _stage.size.y * 0.36)
	_ability_banner.size = Vector2(bw, bh)
	_ability_banner.visible = true
	_ability_banner.modulate.a = 0.0
	_ability_banner.scale = Vector2(0.85, 0.85)
	var hold := _beats.scaled(_beats.banner_hold_s)
	_ability_tween = _ability_banner.create_tween()
	# Open (parallel), then hold, then fade — callback must not run in parallel with the hold.
	_ability_tween.set_parallel(true)
	_ability_tween.tween_property(_ability_banner, "modulate:a", 1.0, 0.12)
	_ability_tween.tween_property(_ability_banner, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_ability_tween.chain().set_parallel(false)
	_ability_tween.tween_interval(hold)
	_ability_tween.tween_property(_ability_banner, "modulate:a", 0.0, 0.14)
	_ability_tween.tween_callback(func() -> void:
		if is_instance_valid(_ability_banner):
			_ability_banner.visible = false
	)


func _card_for(side: Variant) -> Control:
	if side == null:
		return null
	return _player_card if str(side) == "player" else _enemy_card


func _battle_for_presentation() -> Dictionary:
	if not _presentation_battle.is_empty():
		return _presentation_battle
	return _battle()


func _on_skip() -> void:
	## Fast-forward presentation to the authoritative final HP, then combat report.
	## Does not re-simulate combat — consumes playerEnd / EndHp / event log from the committed battle.
	if _tutorial_mission_skip_locked():
		return
	if _busy or _finished or _phase == "outro":
		return
	_generation += 1
	_playing = false
	_hide_ability_banner()
	if is_instance_valid(_intro_layer):
		_intro_layer.visible = false
	var end_hp := CombatPresentation.resolve_end_hp(_battle_for_presentation(), _hp.player_hp, _hp.enemy_hp)
	_hp.snap(end_hp.x, end_hp.y)
	_event_i = _events.size()
	_conclude_fight()


func _conclude_fight() -> void:
	## Skip Victory/Defeat overlay — settle once (if needed) and open the combat report.
	if _busy:
		return
	if _finished and not _rewards_settled:
		return
	_playing = false
	_phase = "outro"
	_skip_btn.visible = false
	_combo_wrap.visible = false
	_hide_ability_banner()
	var battle := _battle_for_presentation()
	if _presentation_battle.is_empty() and not battle.is_empty():
		_presentation_battle = battle.duplicate(true)
	var won := str(battle.get("winner", "opponent")) == "player"
	_motion.stop_all_idle()
	_motion.settle(_player_card if won else _enemy_card, true)
	_motion.settle(_enemy_card if won else _player_card, false)
	if _rewards_settled:
		if is_instance_valid(_sheet_host) and _sheet_host.visible and _sheet_host.get_child_count() > 0:
			return
		_remount_cached_report()
		return
	_settle_and_show_rewards()


func _on_outro_continue() -> void:
	## Settle-failure recovery still uses the outro CTA.
	if _busy:
		return
	_outro_btn.disabled = true
	_settle_and_show_rewards()


func _settle_and_show_rewards() -> void:
	if _busy:
		return
	if _watch_only or _rewards_settled:
		_remount_cached_report()
		return
	_busy = true
	_finished = true
	_playing = false
	_skip_btn.disabled = true
	_skip_btn.visible = false
	_outro_layer.visible = false
	if _presentation_battle.is_empty():
		var live := _battle()
		if not live.is_empty():
			_presentation_battle = live.duplicate(true)
	var combat_kind := "arena"
	if _is_mission():
		combat_kind = "mission"
	elif _is_dungeon():
		combat_kind = "dungeon"
	CombatReturnManager.capture_presentation_from_managers(combat_kind, _prev_level, _dungeon_ctx)
	var mission_won := false
	var dungeon_won := false
	if _is_mission():
		mission_won = str(_presentation_battle.get("winner", "opponent")) == "player"
	elif _is_dungeon():
		dungeon_won = str(_presentation_battle.get("winner", "opponent")) == "player"
	var res: Dictionary
	if _is_mission():
		res = await MissionManager.resolve_combat_outcome()
	elif _is_dungeon():
		res = await DungeonManager.finish_battle()
	else:
		res = await ArenaManager.finish_battle()
	_busy = false
	if not res.ok:
		_outro_layer.visible = true
		_outro_title.text = "SETTLE FAILED"
		_outro_sub.text = str(res.get("error", "Settle failed"))
		_outro_btn.text = "RETRY"
		_outro_btn.disabled = false
		ClientUi.apply_danger_button(_outro_btn)
		_skip_btn.disabled = false
		_skip_btn.visible = true
		_sync_tutorial_skip_lock()
		_finished = false
		return
	_rewards_settled = true
	if _is_mission():
		if mission_won:
			AudioManager.play_ui("claim")
		else:
			AudioManager.play_ui("hit")
		ProgressManager.toast_newly_unlocked(
			self, res.data if typeof(res.data) == TYPE_DICTIONARY else {}
		)
		await _show_mission_result(mission_won, res.data if typeof(res.data) == TYPE_DICTIONARY else {})
		return
	if _is_dungeon():
		if dungeon_won:
			AudioManager.play_ui("claim")
		else:
			AudioManager.play_ui("hit")
		var finish_data: Dictionary = DungeonManager.last_finish.duplicate(true)
		if not finish_data.has("won"):
			finish_data["won"] = dungeon_won
		ProgressManager.toast_newly_unlocked(self, finish_data)
		await _show_dungeon_result(finish_data)
		return
	var result: Dictionary = res
	# Prefer authoritative manager DTO; keep nested "result" only as legacy alias.
	if typeof(res.get("result", null)) == TYPE_DICTIONARY and not bool(res.has("won")):
		result = res.get("result", {})
	if bool(result.get("won", false)):
		AudioManager.play_ui("claim")
	else:
		AudioManager.play_ui("hit")
	ProgressManager.toast_newly_unlocked(self, res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {})
	print(
		"[ArenaBattleResult] UI settle won=%s outcome=%s ranking=%s xp=%s sd=%s"
		% [
			str(result.get("won", false)),
			str(result.get("outcome", "")),
			str(result.get("rankingChange", result.get("rating_delta", 0))),
			str((result.get("rewards", {}) as Dictionary).get("experience", 0) if typeof(result.get("rewards", {})) == TYPE_DICTIONARY else 0),
			str((result.get("rewards", {}) as Dictionary).get("stardust", 0) if typeof(result.get("rewards", {})) == TYPE_DICTIONARY else 0),
		]
	)
	await _show_result(result)


func _replay_action() -> Dictionary:
	return {
		"label": "Replay",
		"primary": false,
		"replay": true,
		"callback": func() -> void: _start_combat_rewatch(),
	}


func _start_combat_rewatch() -> void:
	if _busy or _presentation_battle.is_empty():
		return
	_generation += 1
	_finished = false
	_busy = false
	_playing = true
	_phase = "intro"
	_event_i = 0
	_combo = 0
	_combo_wrap.visible = false
	_hide_ability_banner()
	_outro_layer.visible = false
	if is_instance_valid(_combat_log):
		_combat_log.clear()
	var battle := _presentation_battle
	_events = battle.get("events", []) if typeof(battle.get("events", [])) == TYPE_ARRAY else []
	var p_max := maxi(1, int(battle.get("playerMaxHp", 1)))
	var e_max := maxi(1, int(battle.get("opponentMaxHp", 1)))
	_hp.reset(p_max, p_max, e_max, e_max)
	_skip_btn.disabled = false
	_skip_btn.visible = true
	_sync_tutorial_skip_lock()
	_motion.stop_all_idle()
	if is_instance_valid(_player_card):
		_player_card.modulate = Color.WHITE
		_player_card.rotation = 0.0
		_player_card.position = Vector2.ZERO
	if is_instance_valid(_enemy_card):
		_enemy_card.modulate = Color.WHITE
		_enemy_card.rotation = 0.0
		_enemy_card.position = Vector2.ZERO
	var player_name := str(_duel_player.get("name", "You"))
	var opp_name := str(_duel_enemy.get("name", "Rival"))
	var vs_row: Label = _intro_layer.find_child("VsRow", true, false) as Label
	if vs_row:
		vs_row.text = "%s   VS   %s" % [player_name, opp_name]
	_intro_layer.visible = true
	_intro_layer.modulate.a = 0.0
	var intro_tw := _intro_layer.create_tween()
	intro_tw.tween_property(_intro_layer, "modulate:a", 1.0, 0.22)
	await get_tree().create_timer(_beats.intro_duration()).timeout
	if not is_instance_valid(self) or _finished or not _playing or _phase == "outro":
		return
	var fade := _intro_layer.create_tween()
	fade.tween_property(_intro_layer, "modulate:a", 0.0, 0.18)
	await fade.finished
	if not is_instance_valid(self) or _finished or not _playing or _phase == "outro":
		return
	_intro_layer.visible = false
	_motion.start_idle(_player_card, 0.0)
	_motion.start_idle(_enemy_card, 0.35)
	_phase = "fight"
	_run_playback()


func _remount_cached_report() -> void:
	if _cached_summary.is_empty() and _presentation_battle.is_empty():
		return
	_finished = true
	_playing = false
	_skip_btn.visible = false
	_outro_layer.visible = false
	if _is_mission() and TutorialManager.should_show():
		TutorialManager.notify_mission_outro_ready()
	var summary := _rebuild_summary_actions(_cached_summary)
	CombatSheets.present_complete_then_level_up(
		_sheet_host, summary, _prev_level, GameManager.active_character, true, false
	)


func _rebuild_summary_actions(base: Dictionary) -> Dictionary:
	## Fresh Callables after rewatch — deep-duplicated summaries drop/break callbacks.
	var summary := base.duplicate(true)
	var won := bool(summary.get("won", false))
	var mode := str(summary.get("mode", "arena"))
	match mode:
		"mission":
			summary["actions"] = [
				{"label": "Cantina", "primary": true, "callback": func() -> void: GameManager.go_cantina()},
				{
					"label": "Operative" if won else "Hub",
					"primary": false,
					"callback": (func() -> void: GameManager.go_stats()) if won else (func() -> void: GameManager.go_hub()),
				},
				_replay_action(),
			]
		"dungeon":
			summary["actions"] = [
				{"label": "Back to Frontier", "primary": true, "callback": func() -> void: GameManager.go_galaxy()},
				{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
				_replay_action(),
			]
		_:
			summary["actions"] = [
				{"label": "Back to Arena", "primary": true, "callback": func() -> void: GameManager.go_arena()},
				{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
				_replay_action(),
			]
	return summary


func _cache_and_present_summary(summary: Dictionary, require_win_for_levelup: bool) -> void:
	_cached_summary = summary.duplicate(true)
	CombatReturnManager.remember_watch_summary(summary, _presentation_battle, _prev_level, _dungeon_ctx)
	if _is_mission() and TutorialManager.should_show():
		TutorialManager.notify_mission_outro_ready()
	CombatSheets.present_complete_then_level_up(
		_sheet_host,
		summary,
		_prev_level,
		GameManager.active_character,
		require_win_for_levelup,
		not _watch_only
	)


func _show_mission_result(won: bool, data: Dictionary) -> void:
	_motion.stop_all_idle()

	if bool(data.get("mission_missing", false)):
		var missing := CombatSheets.make_complete_sheet({
			"won": false,
			"mode": "mission",
			"title": "Mission record lost",
			"subtitle": "Your ship has been recalled — no rewards were issued.",
			"note": "Launch a new mission from the cantina.",
			"actions": [
				{"label": "Back to Cantina", "primary": true, "callback": func() -> void: GameManager.go_cantina()},
			],
		}, func() -> void: GameManager.go_cantina())
		_sheet_host.visible = true
		_sheet_host.mouse_filter = Control.MOUSE_FILTER_STOP
		_sheet_host.add_child(missing)
		return

	var gains: Dictionary = data.get("gains", {}) if typeof(data.get("gains", {})) == TYPE_DICTIONARY else {}
	var items: Array = data.get("items", []) if typeof(data.get("items", [])) == TYPE_ARRAY else []
	var gear = items[0] if items.size() > 0 and typeof(items[0]) == TYPE_DICTIONARY else null
	var outcome := str(data.get("item_outcome", "")).to_upper()
	var go_cantina := func() -> void: GameManager.go_cantina()
	var go_secondary := func() -> void:
		if won:
			GameManager.go_stats()
		else:
			GameManager.go_hub()
	# Items now render as their own reward panes; only note the empty-loot case.
	var note := ""
	if won and outcome == "NONE":
		note = "No item recovered this run."
	var xp_val := int(gains.get("experience", 0))
	var sd_val := int(gains.get("stardust", 0))
	var has_loss_rewards := not won and (xp_val > 0 or sd_val > 0 or not items.is_empty())
	var summary := {
		"won": won,
		"mode": "mission",
		"title": "Victory" if won else "Defeat",
		"subtitle": "" if won else (
			"Reduced rewards issued." if has_loss_rewards
			else "No stardust, XP, or loot. Fuel was already spent."
		),
		"xp": xp_val,
		"stardust": sd_val,
		"gear_item": gear,
		"reward_items": items if (won or has_loss_rewards) else [],
		"note": note,
		"progression": data.get("progression", {}) if typeof(data.get("progression", {})) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Cantina", "primary": true, "callback": go_cantina},
			{"label": "Operative" if won else "Hub", "primary": false, "callback": go_secondary},
			_replay_action(),
		],
	}
	_cache_and_present_summary(summary, true)


func _show_dungeon_result(data: Dictionary) -> void:
	_motion.stop_all_idle()
	_theme_chip.visible = false
	var won := bool(data.get("won", false))
	var rewards: Dictionary = data.get("rewards", {}) if typeof(data.get("rewards", {})) == TYPE_DICTIONARY else {}
	var items: Array = data.get("items", []) if typeof(data.get("items", [])) == TYPE_ARRAY else []
	var gear = items[0] if items.size() > 0 and typeof(items[0]) == TYPE_DICTIONARY else null
	var enemy_name := str(_dungeon_ctx.get("enemy_name", "Foe"))
	var planet_name := str(_dungeon_ctx.get("planet_name", "Frontier"))
	var is_boss := bool(_dungeon_ctx.get("is_boss", false))
	var enemy_index := int(_dungeon_ctx.get("enemy_index", 1))
	var context := planet_name
	if is_boss:
		context += " · Boss · %s" % enemy_name
	elif won:
		context += " · Enemy %s" % enemy_index
	else:
		context += " · Fell to %s" % enemy_name
	var note := ""
	if not won:
		note = "No rewards on defeat."
	elif items.size() > 1:
		note = "Loot: %s item(s)" % items.size()
	var summary := {
		"won": won,
		"mode": "dungeon",
		"title": "Victory" if won else "Defeat",
		"subtitle": context,
		"xp": int(rewards.get("experience", 0)) if won else 0,
		"stardust": int(rewards.get("stardust", 0)) if won else 0,
		"gear_item": gear,
		"reward_items": items if won else [],
		"note": note,
		"progression": data.get("progression", {}) if typeof(data.get("progression", {})) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Back to Frontier", "primary": true, "callback": func() -> void: GameManager.go_galaxy()},
			{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
			_replay_action(),
		],
	}
	_cache_and_present_summary(summary, true)


func _show_result(result: Dictionary) -> void:
	var won := bool(result.get("won", false))
	var rewards: Dictionary = result.get("rewards", {}) if typeof(result.get("rewards", {})) == TYPE_DICTIONARY else {}
	var opp: Dictionary = result.get("opp", {}) if typeof(result.get("opp", {})) == TYPE_DICTIONARY else {}
	var delta := int(rewards.get("arena_rating_delta", 0))
	var was_free := bool(result.get("is_free", rewards.get("free", true)))
	var nova_spent := int(result.get("nova_spent", 0))
	var note := ""
	if not won:
		note = "No rewards on defeat."
	elif not was_free:
		note = "Paid battle — rating only."
	else:
		note = "Free battle rewards applied."
	if nova_spent > 0:
		note += " Nova spent: %s." % nova_spent
	var opp_name := str(opp.get("name", "rival"))
	var summary := {
		"won": won,
		"mode": "arena",
		"title": "Victory" if won else "Defeat",
		"subtitle": "%s · Rating now %s" % [
			opp_name,
			str(GameManager.active_character.get("arena_rating", "?")),
		],
		"xp": int(rewards.get("experience", 0)),
		"stardust": int(rewards.get("stardust", 0)),
		"rating_delta": delta,
		"note": note,
		"progression": result.get("progression", {}) if typeof(result.get("progression", {})) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Back to Arena", "primary": true, "callback": func() -> void: GameManager.go_arena()},
			{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
			_replay_action(),
		],
	}
	# Arena can award XP on either outcome; still sequence level-up after complete.
	_cache_and_present_summary(summary, false)
