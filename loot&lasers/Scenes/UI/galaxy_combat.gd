extends Control
## Frontier combat playback → FinishDungeonBattle.

var _title: Label
var _vs: Label
var _player_hp: ProgressBar
var _enemy_hp: ProgressBar
var _player_hp_label: Label
var _enemy_hp_label: Label
var _log: Label
var _status: Label
var _skip_btn: Button
var _continue_btn: Button
var _result_box: PanelContainer
var _result_label: Label
var _result_actions: HBoxContainer
var _player_portrait_slot: CenterContainer
var _enemy_portrait_slot: CenterContainer
var _sheet_host: Control
var _prev_level := 1

var _player_hp_val := 0
var _enemy_hp_val := 0
var _player_max := 1
var _enemy_max := 1
var _events: Array = []
var _event_i := 0
var _playing := false
var _finished := false
var _busy := false
var _tick: Timer


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()
	_boot()


func _build() -> void:
	var backdrop := ArenaStageBackdrop.new()
	backdrop.accent = Color("#34D399")
	add_child(backdrop)
	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scrim.color = Color(0.015, 0.03, 0.04, 0.5)
	scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(scrim)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 24)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	add_child(margin)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)

	col.add_child(ClientUi.make_title("FRONTIER COMBAT", 22))
	_title = ClientUi.make_subtitle("Dungeon encounter")
	col.add_child(_title)

	var hp_row := HBoxContainer.new()
	hp_row.add_theme_constant_override("separation", 16)
	col.add_child(hp_row)
	var p_col := VBoxContainer.new()
	p_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hp_row.add_child(p_col)
	_player_hp_label = Label.new()
	_player_hp_label.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(_player_hp_label)
	p_col.add_child(_player_hp_label)
	_player_hp = ProgressBar.new()
	_player_hp.show_percentage = false
	_player_hp.custom_minimum_size = Vector2(0, 24)
	ClientUi.apply_hp_bar(_player_hp, ClientUi.CYAN)
	p_col.add_child(_player_hp)
	var e_col := VBoxContainer.new()
	e_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hp_row.add_child(e_col)
	_enemy_hp_label = Label.new()
	_enemy_hp_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_enemy_hp_label.add_theme_color_override("font_color", ClientUi.DANGER)
	ClientUi.apply_display_font(_enemy_hp_label)
	e_col.add_child(_enemy_hp_label)
	_enemy_hp = ProgressBar.new()
	_enemy_hp.show_percentage = false
	_enemy_hp.custom_minimum_size = Vector2(0, 24)
	ClientUi.apply_hp_bar(_enemy_hp, ClientUi.DANGER)
	e_col.add_child(_enemy_hp)

	var stage := Control.new()
	stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage.custom_minimum_size.y = 347
	col.add_child(stage)
	var fighters := HBoxContainer.new()
	fighters.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	fighters.alignment = BoxContainer.ALIGNMENT_CENTER
	fighters.add_theme_constant_override("separation", 28)
	stage.add_child(fighters)
	_player_portrait_slot = CenterContainer.new()
	_player_portrait_slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_player_portrait_slot.custom_minimum_size = Vector2(267, 293)
	fighters.add_child(_player_portrait_slot)
	_vs = Label.new()
	_vs.text = "VS"
	_vs.custom_minimum_size.x = 85
	_vs.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_vs.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_vs.add_theme_font_size_override("font_size", 35)
	_vs.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(_vs)
	fighters.add_child(_vs)
	_enemy_portrait_slot = CenterContainer.new()
	_enemy_portrait_slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_enemy_portrait_slot.custom_minimum_size = Vector2(267, 293)
	fighters.add_child(_enemy_portrait_slot)

	_log = Label.new()
	_log.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_log.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_log.custom_minimum_size = Vector2(0, 64)
	_log.add_theme_font_size_override("font_size", 21)
	_log.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(_log)
	col.add_child(_log)

	_status = ClientUi.make_status()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_status)

	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation", 12)
	col.add_child(actions)
	_skip_btn = Button.new()
	_skip_btn.text = "Skip to Results"
	_skip_btn.custom_minimum_size = Vector2(240, 0)
	ClientUi.apply_ghost_button(_skip_btn)
	_skip_btn.pressed.connect(_skip_playback)
	actions.add_child(_skip_btn)
	_continue_btn = Button.new()
	_continue_btn.text = "Settle"
	_continue_btn.visible = false
	_continue_btn.custom_minimum_size = Vector2(293, 0)
	ClientUi.apply_primary_button(_continue_btn)
	_continue_btn.pressed.connect(_on_continue)
	actions.add_child(_continue_btn)

	_result_box = PanelContainer.new()
	_result_box.visible = false
	col.add_child(_result_box)
	var rcol := VBoxContainer.new()
	_result_box.add_child(rcol)
	_result_label = Label.new()
	_result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rcol.add_child(_result_label)
	_result_actions = HBoxContainer.new()
	rcol.add_child(_result_actions)

	_sheet_host = Control.new()
	_sheet_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_sheet_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sheet_host.z_index = 50
	add_child(_sheet_host)

	_tick = Timer.new()
	_tick.wait_time = 0.65
	_tick.timeout.connect(_step_event)
	add_child(_tick)


func _boot() -> void:
	if DungeonManager.pending_battle.is_empty() or DungeonManager.pending_enemy.is_empty():
		_status.text = "No pending frontier fight."
		await get_tree().create_timer(0.35).timeout
		GameManager.close_overlay()
		GameManager.go_galaxy()
		return
	var enemy: Dictionary = DungeonManager.pending_enemy
	var battle: Dictionary = DungeonManager.pending_battle
	_vs.text = "VS"
	_prev_level = int(GameManager.active_character.get("level", 1))
	_player_portrait_slot.add_child(_portrait_card(GameManager.active_character, ClientUi.CYAN))
	_enemy_portrait_slot.add_child(_portrait_card(enemy, ClientUi.DANGER))
	_title.text = "Lv %s · %s%s%s" % [
		str(enemy.get("level", 1)),
		str(enemy.get("class", "?")),
		" · BOSS" if bool(enemy.get("isBoss", false)) else "",
		" · patrol" if DungeonManager.patrol else "",
	]
	_player_max = maxi(1, int(battle.get("playerMaxHp", 1)))
	_enemy_max = maxi(1, int(battle.get("opponentMaxHp", 1)))
	_player_hp_val = _player_max
	_enemy_hp_val = _enemy_max
	_player_hp.max_value = _player_max
	_enemy_hp.max_value = _enemy_max
	_update_hp_ui()
	_events = battle.get("events", []) if typeof(battle.get("events", [])) == TYPE_ARRAY else []
	_event_i = 0
	_playing = true
	_log.text = "Engage!"
	_status.text = "Auto-playing… (Skip anytime)"
	_tick.start()


func _portrait_card(character: Dictionary, tint: Color) -> PanelContainer:
	var frame := PanelContainer.new()
	frame.custom_minimum_size = Vector2(240, 267)
	frame.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.035, 0.045, 0.075, 0.7), Color(tint, 0.82), 14, 2)
	)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	frame.add_child(col)
	var name := Label.new()
	name.text = str(character.get("name", "?"))
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name.add_theme_font_size_override("font_size", 16)
	name.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(name)
	col.add_child(name)
	var center := CenterContainer.new()
	col.add_child(center)
	center.add_child(AvatarRenderer.make_portrait(character, 128.0))
	frame.pivot_offset = Vector2(90, 100)
	return frame


func _update_hp_ui() -> void:
	_player_hp.value = _player_hp_val
	_enemy_hp.value = _enemy_hp_val
	_player_hp_label.text = "%s  %s / %s" % [
		str(GameManager.active_character.get("name", "You")), _player_hp_val, _player_max,
	]
	_enemy_hp_label.text = "%s / %s  %s" % [
		_enemy_hp_val, _enemy_max, str(DungeonManager.pending_enemy.get("name", "Foe")),
	]


func _step_event() -> void:
	if not _playing:
		return
	if _event_i >= _events.size():
		_finish_playback()
		return
	var ev: Dictionary = _events[_event_i]
	_event_i += 1
	_log.text = str(ev.get("text", ""))
	var t := str(ev.get("type", ""))
	if t == "attack" or t == "drone":
		var dmg := int(ev.get("damage", 0))
		var crit := bool(ev.get("crit", false))
		var target := _player_portrait_slot if str(ev.get("defender", "")) == "player" else _enemy_portrait_slot
		if target.get_child_count() > 0:
			var card: Control = target.get_child(0)
			card.modulate = Color(1.0, 0.82, 0.4) if crit else Color(1.0, 0.42, 0.45)
			var tw := card.create_tween()
			tw.tween_property(card, "modulate", Color.WHITE, 0.28)
		AudioManager.play_attack("swing", crit, t == "drone")
		if str(ev.get("defender", "")) == "player":
			_player_hp_val = maxi(0, _player_hp_val - dmg)
		else:
			_enemy_hp_val = maxi(0, _enemy_hp_val - dmg)
		_update_hp_ui()
	elif t == "dodge" or t == "miss":
		AudioManager.play_ui("dodge")
	if _player_hp_val <= 0 or _enemy_hp_val <= 0:
		_finish_playback()
		return
	_tick.start(0.9 if t == "passive" else (0.55 if t in ["dodge", "miss"] else 0.7))


func _skip_playback() -> void:
	if _finished:
		return
	_tick.stop()
	var battle: Dictionary = DungeonManager.pending_battle
	_player_hp_val = maxi(0, int(battle.get("playerEndHp", 0)))
	_enemy_hp_val = maxi(0, int(battle.get("opponentEndHp", 0)))
	_update_hp_ui()
	_event_i = _events.size()
	_finish_playback()


func _finish_playback() -> void:
	if _finished:
		return
	_finished = true
	_playing = false
	_tick.stop()
	_skip_btn.visible = false
	_continue_btn.visible = true
	var won := str(DungeonManager.pending_battle.get("winner", "")) == "player"
	_log.text = "VICTORY" if won else "DEFEAT"
	_continue_btn.text = "Claim Rewards" if won else "Acknowledge Defeat"
	_status.text = "Settle with FinishDungeonBattle"


func _on_continue() -> void:
	if _busy:
		return
	_busy = true
	_continue_btn.disabled = true
	_status.text = "Settling…"
	var res: Dictionary = await DungeonManager.finish_battle()
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Settle failed"))
		_continue_btn.disabled = false
		return
	_continue_btn.visible = false
	if bool(DungeonManager.last_finish.get("won", false)):
		AudioManager.play_ui("claim")
	else:
		AudioManager.play_ui("hit")
	ProgressManager.toast_newly_unlocked(self, DungeonManager.last_finish)
	await _show_result(DungeonManager.last_finish)


func _show_result(data: Dictionary) -> void:
	_result_box.visible = false
	_continue_btn.visible = false
	var won := bool(data.get("won", false))
	var rewards: Dictionary = data.get("rewards", {}) if typeof(data.get("rewards", {})) == TYPE_DICTIONARY else {}
	var items: Array = data.get("items", []) if typeof(data.get("items", [])) == TYPE_ARRAY else []
	var gear = items[0] if items.size() > 0 and typeof(items[0]) == TYPE_DICTIONARY else null
	var note := ""
	if items.size() > 1:
		note = "Loot: %s item(s)" % items.size()
	var ship: Variant = data.get("ship_mod", null)
	if ship != null and str(ship) != "":
		note = (note + " · " if not note.is_empty() else "") + "Ship mod: %s" % str(ship)
	var summary := {
		"won": won,
		"mode": "dungeon",
		"title": "Victory" if won else "Defeat",
		"subtitle": "DRU %s" % str(rewards.get("dru", 0)),
		"xp": int(rewards.get("experience", 0)),
		"stardust": int(rewards.get("stardust", 0)),
		"gear_item": gear,
		"note": note,
		"actions": [
			{"label": "Back to Frontier", "primary": true, "callback": func() -> void: GameManager.go_galaxy()},
			{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
		],
	}
	CombatSheets.present_complete_then_level_up(
		_sheet_host, summary, _prev_level, GameManager.active_character, true
	)
