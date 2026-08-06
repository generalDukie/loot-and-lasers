extends Control
## Shared duel overlay — mirrors web ArenaBattleOverlay (arena + mission + dungeon).
## Node owns combat simulation; this file is presentation + settlement only.

const FIGHTER_SIZE := Vector2(200, 260)

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

var _player_hp: ProgressBar
var _enemy_hp: ProgressBar
var _player_hp_name: Label
var _enemy_hp_name: Label
var _player_hp_nums: Label
var _enemy_hp_nums: Label
var _player_status: Label
var _enemy_status: Label
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
var _ability_emoji: Label
var _ability_title: Label
var _ability_detail: Label
var _ability_class: Label
var _player_weapon: Dictionary = {}
var _enemy_weapon: Dictionary = {}
var _player_weapon_label: Control
var _enemy_weapon_label: Control
var _sheet_host: Control
var _prev_level := 1
var _generation := 0
var _ability_tween: Tween
var _theme_chip: Label
var _dungeon_ctx: Dictionary = {}

var _events: Array = []
var _event_i := 0
var _phase := "intro"
var _playing := false
var _finished := false
var _busy := false
var _combo := 0


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


func _build() -> void:
	# Web: fixed inset-0 duel stage over dark void.
	_backdrop = ArenaStageBackdrop.new()
	_backdrop.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	add_child(_backdrop)
	# Soft live stage — redraws every frame at Engine.max_fps (120).
	_backdrop.set_live(true)

	_theme_chip = Label.new()
	_theme_chip.visible = false
	_theme_chip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_theme_chip.set_anchors_preset(PRESET_CENTER_TOP)
	_theme_chip.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_theme_chip.offset_top = 10
	_theme_chip.offset_left = -220
	_theme_chip.offset_right = 220
	_theme_chip.offset_bottom = 36
	_theme_chip.z_index = 35
	_theme_chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_theme_chip.add_theme_font_size_override("font_size", 13)
	ClientUi.apply_display_font(_theme_chip)
	add_child(_theme_chip)

	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	var hp_pad := MarginContainer.new()
	hp_pad.add_theme_constant_override("margin_left", 20)
	hp_pad.add_theme_constant_override("margin_right", 20)
	hp_pad.add_theme_constant_override("margin_top", 18)
	hp_pad.add_theme_constant_override("margin_bottom", 4)
	root.add_child(hp_pad)

	var hp_row := HBoxContainer.new()
	hp_row.add_theme_constant_override("separation", 12)
	hp_pad.add_child(hp_row)

	var p_hp := _make_hp_side(false)
	p_hp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hp_row.add_child(p_hp)
	_player_hp_name = p_hp.get_meta("name_lab")
	_player_hp = p_hp.get_meta("bar")
	_player_hp_nums = p_hp.get_meta("nums")
	_player_status = p_hp.get_meta("status")

	var mid := VBoxContainer.new()
	mid.custom_minimum_size.x = 48
	mid.alignment = BoxContainer.ALIGNMENT_CENTER
	hp_row.add_child(mid)
	mid.add_child(UiIcon.make("swords", Color("#FCD34D", 0.85), 24.0))

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
	_ability_emoji = Label.new()
	_ability_emoji.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ability_emoji.add_theme_font_size_override("font_size", 29)
	ab_col.add_child(_ability_emoji)
	_ability_title = Label.new()
	_ability_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ability_title.add_theme_font_size_override("font_size", 20)
	ClientUi.apply_display_font(_ability_title)
	ab_col.add_child(_ability_title)
	_ability_detail = Label.new()
	_ability_detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ability_detail.add_theme_font_size_override("font_size", 15)
	ClientUi.apply_display_font(_ability_detail)
	ab_col.add_child(_ability_detail)
	_ability_class = Label.new()
	_ability_class.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ability_class.add_theme_font_size_override("font_size", 12)
	ClientUi.apply_display_font(_ability_class)
	ab_col.add_child(_ability_class)

	_banner = Label.new()
	_banner.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_banner.modulate.a = 0.0
	_banner.z_index = 25
	_banner.add_theme_font_size_override("font_size", 56)
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
	vs_row.add_theme_font_size_override("font_size", 19)
	ClientUi.apply_display_font(vs_row)
	intro_col.add_child(vs_row)
	var fight_row := HBoxContainer.new()
	fight_row.name = "FightLab"
	fight_row.alignment = BoxContainer.ALIGNMENT_CENTER
	fight_row.add_theme_constant_override("separation", 10)
	intro_col.add_child(fight_row)
	fight_row.add_child(UiIcon.make("swords", Color("#FBBF24"), 40.0))
	var fight_lab := Label.new()
	fight_lab.text = "FIGHT!"
	fight_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	fight_lab.add_theme_font_size_override("font_size", 48)
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
	_outro_title.add_theme_font_size_override("font_size", 64)
	ClientUi.apply_display_font(_outro_title)
	outro_col.add_child(_outro_title)
	_outro_sub = Label.new()
	_outro_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_outro_sub.add_theme_font_size_override("font_size", 17)
	_outro_sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_outro_sub)
	outro_col.add_child(_outro_sub)
	_outro_btn = Button.new()
	_outro_btn.text = "VIEW REWARDS"
	_outro_btn.custom_minimum_size = Vector2(293, 59)
	ClientUi.apply_primary_button(_outro_btn)
	_outro_btn.pressed.connect(_on_outro_continue)
	outro_col.add_child(_outro_btn)

	var combo_row := Control.new()
	combo_row.custom_minimum_size.y = 48
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
	_combo_lab.add_theme_font_size_override("font_size", 16)
	_combo_lab.add_theme_color_override("font_color", Color("#FCD34D"))
	ClientUi.apply_display_font(_combo_lab)
	_combo_wrap.add_child(_combo_lab)

	var skip_pad := MarginContainer.new()
	skip_pad.add_theme_constant_override("margin_bottom", 28)
	skip_pad.add_theme_constant_override("margin_top", 4)
	root.add_child(skip_pad)
	var skip_row := HBoxContainer.new()
	skip_row.alignment = BoxContainer.ALIGNMENT_CENTER
	skip_pad.add_child(skip_row)
	_skip_btn = Button.new()
	_skip_btn.text = "⚡  SKIP TO RESULTS"
	_skip_btn.custom_minimum_size = Vector2(293, 53)
	_apply_skip_cta(_skip_btn)
	_skip_btn.pressed.connect(_on_skip)
	skip_row.add_child(_skip_btn)

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
	_combat_log.fit_content = true
	_combat_log.scroll_active = true
	_combat_log.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_combat_log.set_anchors_preset(PRESET_BOTTOM_RIGHT)
	_combat_log.anchor_left = 1.0
	_combat_log.anchor_top = 1.0
	_combat_log.anchor_right = 1.0
	_combat_log.anchor_bottom = 1.0
	_combat_log.offset_left = -300
	_combat_log.offset_top = -150
	_combat_log.offset_right = -12
	_combat_log.offset_bottom = -72
	_combat_log.add_theme_font_size_override("normal_font_size", 12)
	_combat_log.add_theme_color_override("default_color", Color(1, 1, 1, 0.72))
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
	col.add_theme_constant_override("separation", 4)
	var name_lab := Label.new()
	name_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if align_right else HORIZONTAL_ALIGNMENT_LEFT
	name_lab.add_theme_font_size_override("font_size", 19)
	name_lab.add_theme_color_override("font_color", Color("#FB7185") if align_right else Color("#22D3EE"))
	ClientUi.apply_display_font(name_lab)
	col.add_child(name_lab)
	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = 100
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 21)
	ClientUi.apply_hp_bar(bar, Color("#FB7185") if align_right else Color("#22D3EE"))
	# Web: remaining HP hugs center — approximate with fill from left (native ProgressBar).
	col.add_child(bar)
	var nums := Label.new()
	nums.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if align_right else HORIZONTAL_ALIGNMENT_LEFT
	nums.add_theme_font_size_override("font_size", 15)
	nums.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(nums)
	col.add_child(nums)
	var status := Label.new()
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if align_right else HORIZONTAL_ALIGNMENT_LEFT
	status.add_theme_font_size_override("font_size", 12)
	status.add_theme_color_override("font_color", Color("#A5B4FC", 0.95))
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ClientUi.apply_display_font(status)
	col.add_child(status)
	col.set_meta("name_lab", name_lab)
	col.set_meta("bar", bar)
	col.set_meta("nums", nums)
	col.set_meta("status", status)
	return col


func _apply_skip_cta(btn: Button) -> void:
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 17)
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
	if _is_mission():
		await _boot_mission()
	elif _is_dungeon():
		await _boot_dungeon()
	else:
		await _boot_arena()


func _is_mission() -> bool:
	return str(GameManager.combat_overlay_kind) == "mission"


func _is_dungeon() -> bool:
	return str(GameManager.combat_overlay_kind) == "dungeon"


func _opp() -> Dictionary:
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
	_start_duel(
		GameManager.active_character,
		ArenaManager.pending_opp,
		ArenaManager.pending_battle,
		ArenaManager.equipped_items,
		ArenaRules.resolve_opp_items(ArenaManager.pending_opp)
	)


func _boot_mission() -> void:
	if not MissionManager.has_active_mission():
		await get_tree().create_timer(0.35).timeout
		GameManager.close_overlay()
		GameManager.go_cantina()
		return
	# Mission run may have already prepared the duel (Skip / Fight) — don't double-fetch.
	if MissionManager.pending_battle.is_empty():
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
	var planet: Dictionary = DungeonRules.get_planet(DungeonManager.selected_planet_id)
	var enemy: Dictionary = DungeonManager.pending_enemy
	var is_boss := bool(enemy.get("isBoss", false))
	_dungeon_ctx = {
		"planet_name": str(planet.get("name", "Frontier")),
		"planet_icon": str(planet.get("icon", "")),
		"planet_color": planet.get("color", Color("#34D399")),
		"patrol": DungeonManager.patrol,
		"is_boss": is_boss,
		"enemy_name": str(enemy.get("name", "Foe")),
		"enemy_index": _dungeon_enemy_index(enemy),
		"free_lives_before": DungeonRules.free_lives_left(GameManager.active_character),
	}
	var accent := Color("#34D399")
	var raw_accent: Variant = _dungeon_ctx.get("planet_color", accent)
	if typeof(raw_accent) == TYPE_COLOR:
		accent = raw_accent as Color
	_backdrop.set_accent(accent)
	_theme_chip.text = "%s %s%s" % [
		_dungeon_ctx.get("planet_icon", ""),
		_dungeon_ctx.get("planet_name", "Frontier"),
		" · Patrol" if bool(_dungeon_ctx.get("patrol", false)) else "",
	]
	_theme_chip.add_theme_color_override("font_color", accent.lightened(0.25))
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

	var p_emoji := _class_emoji(str(player.get("class", "")))
	var e_emoji := _class_emoji(str(opp.get("class", "")))
	_player_hp_name.text = "%s  %s" % [p_emoji, player_name]
	_enemy_hp_name.text = "%s  %s" % [opp_name, e_emoji]

	_player_card = _mount_fighter(_player_anchor, player, Color("#22D3EE"), _player_weapon, true)
	_enemy_card = _mount_fighter(_enemy_anchor, opp, Color("#FB7185"), _enemy_weapon, false)
	_layout_fighters()

	var p_max := maxi(1, int(battle.get("playerMaxHp", 1)))
	var e_max := maxi(1, int(battle.get("opponentMaxHp", 1)))
	_hp.reset(p_max, p_max, e_max, e_max)

	_events = battle.get("events", []) if typeof(battle.get("events", [])) == TYPE_ARRAY else []
	_event_i = 0
	_phase = "intro"
	_playing = true

	var vs_row: Label = _intro_layer.find_child("VsRow", true, false) as Label
	if vs_row:
		vs_row.text = "%s   VS   %s" % [player_name, opp_name]
		vs_row.add_theme_color_override("font_color", Color("#67E8F9"))
	_intro_layer.visible = true
	_intro_layer.modulate.a = 0.0
	var intro_tw := _intro_layer.create_tween()
	intro_tw.tween_property(_intro_layer, "modulate:a", 1.0, 0.22)
	await get_tree().create_timer(_beats.intro_duration()).timeout
	if not is_instance_valid(self) or _finished:
		return
	var fade := _intro_layer.create_tween()
	fade.tween_property(_intro_layer, "modulate:a", 0.0, 0.18)
	await fade.finished
	if not is_instance_valid(self) or _finished:
		return
	_intro_layer.visible = false
	_motion.start_idle(_player_card, 0.0)
	_motion.start_idle(_enemy_card, 0.35)
	_phase = "fight"
	_run_playback()


func _class_emoji(class_key: String) -> String:
	var cat: Variant = GameData.CLASS_CATALOG.get(class_key, null)
	if typeof(cat) == TYPE_DICTIONARY:
		return str((cat as Dictionary).get("emoji", "✧"))
	return "✧"


func _make_fighter_anchor() -> Control:
	var anchor := Control.new()
	anchor.custom_minimum_size = FIGHTER_SIZE
	anchor.size = FIGHTER_SIZE
	anchor.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return anchor


func _layout_fighters() -> void:
	if _fighters == null or _player_anchor == null or _enemy_anchor == null:
		return
	var gap := 64.0
	var total_w := FIGHTER_SIZE.x * 2.0 + gap
	var x0 := (_fighters.size.x - total_w) * 0.5
	var y0 := maxf(8.0, (_fighters.size.y - FIGHTER_SIZE.y) * 0.42)
	_player_anchor.position = Vector2(x0, y0)
	_enemy_anchor.position = Vector2(x0 + FIGHTER_SIZE.x + gap, y0)


func _mount_fighter(anchor: Control, character: Dictionary, tint: Color, weapon: Dictionary, is_player: bool) -> Control:
	var card := _portrait_card(character, tint, weapon, is_player)
	anchor.add_child(card)
	card.size = FIGHTER_SIZE
	card.position = Vector2.ZERO
	card.pivot_offset = FIGHTER_SIZE * 0.5
	return card



func _portrait_card(character: Dictionary, tint: Color, weapon: Dictionary, is_player: bool) -> Control:
	var frame := Control.new()
	frame.custom_minimum_size = FIGHTER_SIZE
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var col := VBoxContainer.new()
	col.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	col.alignment = BoxContainer.ALIGNMENT_BEGIN
	col.add_theme_constant_override("separation", 4)
	frame.add_child(col)

	var head := HBoxContainer.new()
	head.alignment = BoxContainer.ALIGNMENT_CENTER
	head.add_theme_constant_override("separation", 6)
	col.add_child(head)
	var emoji := Label.new()
	emoji.text = _class_emoji(str(character.get("class", "")))
	emoji.add_theme_font_size_override("font_size", 19)
	head.add_child(emoji)
	var name := Label.new()
	name.text = str(character.get("name", "?"))
	name.add_theme_font_size_override("font_size", 17)
	name.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(name)
	head.add_child(name)

	var portrait_wrap := Control.new()
	portrait_wrap.custom_minimum_size = Vector2(224, 224)
	portrait_wrap.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(portrait_wrap)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	portrait_wrap.add_child(center)
	var portrait := AvatarRenderer.make_portrait(character, 156.0)
	if not is_player:
		portrait.scale = Vector2(-1, 1)
		portrait.pivot_offset = Vector2(78, 78)
	center.add_child(portrait)

	var wlab := Control.new()
	wlab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wlab.custom_minimum_size = Vector2(53, 53)
	wlab.set_anchors_preset(PRESET_CENTER_RIGHT if is_player else PRESET_CENTER_LEFT)
	if is_player:
		wlab.offset_left = -59
		wlab.offset_right = 0
	else:
		wlab.offset_left = 0
		wlab.offset_right = 59
	wlab.offset_top = -24
	wlab.offset_bottom = 29
	wlab.pivot_offset = Vector2(20, 20)
	var witem := {
		"name": str(weapon.get("name", "")),
		"base_name": str(weapon.get("base_name", "")),
		"type": "weapon",
		"rarity": str(weapon.get("rarity", "common")),
	}
	wlab.add_child(GearIcon.make(witem, 40.0))
	portrait_wrap.add_child(wlab)
	if is_player:
		_player_weapon_label = wlab
	else:
		_enemy_weapon_label = wlab

	col.add_child(_fighter_stats_block(character, tint))
	return frame


func _fighter_stats_block(character: Dictionary, tint: Color) -> Label:
	var items: Array = []
	if str(character.get("id", "")) == str(GameManager.active_character.get("id", "")):
		items = _player_items()
	elif typeof(character.get("equippedItems", null)) == TYPE_ARRAY:
		items = character.get("equippedItems", [])
	var totals := StatsRules.display_totals(character, items)
	var d := StatsRules.derived(character, totals)
	var primary := str(d.get("primaryStat", "strength"))
	var abbrev := {"strength": "STR", "agility": "AGI", "intellect": "INT", "vitality": "VIT", "luck": "LUK"}
	var lab := Label.new()
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", 15)
	lab.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(lab)
	lab.text = "%s %s · DMG %s · CRIT %.0f%% · DODGE %.0f%%" % [
		abbrev.get(primary, "STR"),
		str(int(totals.get(primary, 0))),
		str(d.get("damage", 0)),
		float(d.get("critChance", 0)),
		float(d.get("dodgeChance", 0)),
	]
	return lab


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
	_show_outro()


func _update_combo(_attacker: String) -> void:
	if _combo >= 2:
		_combo_wrap.visible = true
		_combo_lab.text = "⚡  COMBO ×%s" % _combo
	else:
		_combo_wrap.visible = false


func _play_one_event(ev: Dictionary, gen: int) -> void:
	_hide_ability_banner()
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
			_fx.float_text(host, str(floater.get("label", "")), floater_color, bool(floater.get("crit", false)))

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
	_show_ability_banner(banner)


func _refresh_status_presentation() -> void:
	var status: Dictionary = CombatPresentation.reduce_status(_events, _event_i)
	var player_side: Dictionary = status.get("player", {}) as Dictionary
	var opponent_side: Dictionary = status.get("opponent", {}) as Dictionary
	if _player_status:
		_player_status.text = CombatPresentation.status_chip_text(player_side)
	if _enemy_status:
		_enemy_status.text = CombatPresentation.status_chip_text(opponent_side)
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
	_combat_log.append_text(line + "\n")
	# Keep last ~10 lines readable without a huge panel.
	var txt := _combat_log.get_parsed_text()
	var lines := txt.split("\n")
	if lines.size() > 12:
		var keep := PackedStringArray()
		for i in range(maxi(0, lines.size() - 10), lines.size()):
			keep.append(lines[i])
		_combat_log.clear()
		_combat_log.append_text("\n".join(keep))


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
	_ability_emoji.text = _class_emoji(str(banner.get("className", "")))
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
	_ability_tween.set_parallel(true)
	_ability_tween.tween_property(_ability_banner, "modulate:a", 1.0, 0.12)
	_ability_tween.tween_property(_ability_banner, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_ability_tween.chain().tween_property(_ability_banner, "modulate:a", 0.0, 0.14).set_delay(hold)
	_ability_tween.tween_callback(func() -> void:
		if is_instance_valid(_ability_banner):
			_ability_banner.visible = false
	)


func _card_for(side: Variant) -> Control:
	if side == null:
		return null
	return _player_card if str(side) == "player" else _enemy_card


func _on_skip() -> void:
	if _busy or _finished:
		return
	_generation += 1
	_playing = false
	_hide_ability_banner()
	var battle: Dictionary = _battle()
	_hp.snap(
		maxi(0, int(battle.get("playerEndHp", _hp.player_hp))),
		maxi(0, int(battle.get("opponentEndHp", _hp.enemy_hp)))
	)
	_event_i = _events.size()
	# Web SKIP calls onDone immediately (settle + rewards).
	_settle_and_show_rewards()


func _show_outro() -> void:
	if _finished:
		return
	_playing = false
	_phase = "outro"
	_skip_btn.visible = false
	_combo_wrap.visible = false
	_hide_ability_banner()
	var won := str(_battle().get("winner", "opponent")) == "player"
	_outro_title.text = "VICTORY" if won else "DEFEAT"
	_outro_title.add_theme_color_override("font_color", Color("#FBBF24") if won else Color("#FB7185"))
	if _is_mission():
		_outro_sub.text = "The path home is clear." if won else "The encounter overwhelms you…"
		_outro_btn.text = "VIEW REWARDS" if won else "VIEW RESULTS"
	elif _is_dungeon():
		_outro_sub.text = "The frontier yields." if won else "The world claims another operative…"
		_outro_btn.text = "VIEW REWARDS" if won else "VIEW RESULTS"
	else:
		_outro_sub.text = "Glory to the galaxy." if won else "You fall... but you'll rise again."
		_outro_btn.text = "VIEW REWARDS" if won else "VIEW RESULTS"
	if won:
		ClientUi.apply_primary_button(_outro_btn)
	else:
		ClientUi.apply_danger_button(_outro_btn)
	_motion.stop_all_idle()
	_motion.settle(_player_card if won else _enemy_card, true)
	_motion.settle(_enemy_card if won else _player_card, false)
	_outro_layer.visible = true
	_outro_layer.modulate.a = 0.0
	var tw := _outro_layer.create_tween()
	tw.tween_property(_outro_layer, "modulate:a", 1.0, 0.25)


func _on_outro_continue() -> void:
	if _busy:
		return
	_outro_btn.disabled = true
	_settle_and_show_rewards()


func _settle_and_show_rewards() -> void:
	if _busy:
		return
	_busy = true
	_finished = true
	_playing = false
	_skip_btn.disabled = true
	_skip_btn.visible = false
	_outro_layer.visible = false
	var mission_won := false
	var dungeon_won := false
	if _is_mission():
		mission_won = str(_battle().get("winner", "opponent")) == "player"
	elif _is_dungeon():
		dungeon_won = str(_battle().get("winner", "opponent")) == "player"
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
		_outro_sub.text = str(res.get("error", "Settle failed"))
		_outro_btn.disabled = false
		_skip_btn.disabled = false
		_skip_btn.visible = true
		_finished = false
		return
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
			GameManager.go_inventory()
		else:
			GameManager.go_hub()
	var note := ""
	if won and items.size() > 1:
		note = "%s item(s) recovered" % items.size()
	elif won and outcome == "NONE":
		note = "No item recovered this run."
	elif won and outcome == "STIM":
		note = "Stim recovered."
	elif won and outcome == "JUNK":
		note = "Junk recovered."
	var summary := {
		"won": won,
		"mode": "mission",
		"title": "Mission claimed!" if won else "Mission failed",
		"subtitle": "" if won else "No stardust, XP, or loot. Fuel was already spent.",
		"xp": int(gains.get("experience", 0)) if won else 0,
		"stardust": int(gains.get("stardust", 0)) if won else 0,
		"gear_item": gear,
		"note": note,
		"progression": data.get("progression", {}) if typeof(data.get("progression", {})) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Cantina", "primary": true, "callback": go_cantina},
			{"label": "Inventory" if won else "Hub", "primary": false, "callback": go_secondary},
		],
	}
	CombatSheets.present_complete_then_level_up(
		_sheet_host, summary, _prev_level, GameManager.active_character, true
	)


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
	var was_patrol := bool(_dungeon_ctx.get("patrol", false))
	var enemy_index := int(_dungeon_ctx.get("enemy_index", 1))
	var title := ""
	if won:
		if was_patrol:
			title = "Patrolled — defeated %s" % enemy_name
		elif is_boss:
			title = "Defeated %s" % enemy_name
		else:
			title = "Cleared enemy %s" % enemy_index
	else:
		title = "Fell to %s" % enemy_name
	var subtitle := planet_name
	if is_boss:
		subtitle += " · Boss"
	if was_patrol:
		subtitle += " · Patrol"
	var note := ""
	if not won:
		var free_before := int(_dungeon_ctx.get("free_lives_before", 0))
		var deaths_now := int(GameManager.active_character.get("dungeon_deaths", 0))
		if free_before > 1:
			note = "Death %s/%s. No rewards on defeat." % [deaths_now, DungeonRules.DEATHS_PER_DAY]
		elif free_before == 1:
			note = "Last free life spent. Further fights cost %s 💎." % DungeonRules.CONTINUE_COST
		else:
			note = "Next fight costs %s 💎." % DungeonRules.CONTINUE_COST
	elif items.size() > 1:
		var milestone: Variant = items[items.size() - 1]
		if typeof(milestone) == TYPE_DICTIONARY:
			note = "Milestone chest: %s" % str(milestone.get("name", "loot"))
		else:
			note = "Loot: %s item(s)" % items.size()
	var ship: Variant = data.get("ship_mod", null)
	if ship != null and str(ship) != "":
		note = (note + " · " if not note.is_empty() else "") + "Ship mod: %s" % str(ship)
	var summary := {
		"won": won,
		"mode": "dungeon",
		"title": title,
		"subtitle": subtitle,
		"xp": int(rewards.get("experience", 0)) if won else 0,
		"stardust": int(rewards.get("stardust", 0)) if won else 0,
		"gear_item": gear,
		"note": note,
		"progression": data.get("progression", {}) if typeof(data.get("progression", {})) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Back to Frontier", "primary": true, "callback": func() -> void: GameManager.go_galaxy()},
			{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
		],
	}
	CombatSheets.present_complete_then_level_up(
		_sheet_host, summary, _prev_level, GameManager.active_character, true
	)


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

	var summary := {
		"won": won,
		"mode": "arena",
		"title": ("Defeated %s" if won else "Defeated by %s") % str(opp.get("name", "rival")),
		"subtitle": "Rating now %s" % str(GameManager.active_character.get("arena_rating", "?")),
		"xp": int(rewards.get("experience", 0)),
		"stardust": int(rewards.get("stardust", 0)),
		"rating_delta": delta,
		"note": note,
		"progression": result.get("progression", {}) if typeof(result.get("progression", {})) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Back to Arena", "primary": true, "callback": func() -> void: GameManager.go_arena()},
			{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
		],
	}
	# Arena can award XP on either outcome; still sequence level-up after complete.
	CombatSheets.present_complete_then_level_up(
		_sheet_host, summary, _prev_level, GameManager.active_character, false
	)
