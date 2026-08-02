extends Control
## Active mission — full explore art + overlaid rocket timer (web MissionsPage in-flight).

const SKIP_CRYSTALS_PER_MINUTE := 5.0
const GOOFY_STATUS := [
	{"at": 0.0, "msg": "🚀 Igniting thrusters..."},
	{"at": 0.15, "msg": "Spilled space coffee..."},
	{"at": 0.3, "msg": "Dodging a space raccoon..."},
	{"at": 0.45, "msg": "Which button is go again..."},
	{"at": 0.6, "msg": "Halfway — snacks holding."},
	{"at": 0.75, "msg": "Arguing with the GPS..."},
	{"at": 0.9, "msg": "Almost there. Probably."},
	{"at": 0.97, "msg": "Parking the ship..."},
	{"at": 1.0, "msg": "🎉 Arrived!"},
]

var _title: Label
var _goofy: Label
var _timer_label: Label
var _status: Label
var _claim_btn: Button
var _skip_btn: Button
var _active_panel: PanelContainer
var _explore: MissionExploreStage
var _progress_track: Control
var _progress_fill: ColorRect
var _rocket: Label
var _overlay_timer: Label
var _tick: Timer
var _busy := false
var _claimed := false
var _ready_fx: Tween


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	clip_contents = true
	_build()
	await _boot()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "void"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_bottom", 10)
	add_child(margin)

	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 8)
	margin.add_child(root)

	# Header — Missions + On Mission pill
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	root.add_child(head)
	var page_title := Label.new()
	page_title.text = "Missions"
	page_title.add_theme_font_size_override("font_size", 29)
	page_title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(page_title)
	head.add_child(page_title)
	var on_mission := Label.new()
	on_mission.text = "  🚀 On Mission  "
	on_mission.add_theme_font_size_override("font_size", 15)
	on_mission.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(on_mission)
	var pill := PanelContainer.new()
	pill.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(ClientUi.CYAN, 0.12), Color(ClientUi.CYAN, 0.4), 14, 1)
	)
	pill.add_child(on_mission)
	head.add_child(pill)
	var head_spacer := Control.new()
	head_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(head_spacer)

	_status = ClientUi.make_status()
	_status.visible = false
	root.add_child(_status)

	# Slim ACTIVE MISSION strip (title + Skip / Fight)
	var active_eye := Label.new()
	active_eye.text = "ACTIVE MISSION"
	active_eye.add_theme_font_size_override("font_size", 13)
	active_eye.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(active_eye)
	root.add_child(active_eye)

	_active_panel = PanelContainer.new()
	_active_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_active_panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(ClientUi.CYAN, 0.06), Color(ClientUi.CYAN, 0.45), 10, 1)
	)
	root.add_child(_active_panel)
	var active_col := VBoxContainer.new()
	active_col.add_theme_constant_override("separation", 6)
	_active_panel.add_child(active_col)

	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 19)
	_title.add_theme_color_override("font_color", ClientUi.TEXT)
	_title.autowrap_mode = TextServer.AUTOWRAP_OFF
	_title.clip_text = true
	ClientUi.apply_display_font(_title)
	active_col.add_child(_title)

	_goofy = Label.new()
	_goofy.add_theme_font_size_override("font_size", 15)
	_goofy.add_theme_color_override("font_color", ClientUi.MUTED)
	_goofy.clip_text = true
	ClientUi.apply_body_font(_goofy)
	active_col.add_child(_goofy)

	_skip_btn = Button.new()
	_skip_btn.text = "Skip · Fight · 1 💎"
	ClientUi.apply_display_font(_skip_btn)
	_skip_btn.add_theme_font_size_override("font_size", 16)
	_skip_btn.add_theme_color_override("font_color", Color("#FCD34D"))
	_skip_btn.add_theme_color_override("font_hover_color", Color("#FEF3C7"))
	_skip_btn.add_theme_stylebox_override(
		"normal",
		ClientUi.painted_panel_style(Color(0.12, 0.09, 0.03, 0.95), Color("#F59E0B", 0.45), 8, 1)
	)
	_skip_btn.add_theme_stylebox_override(
		"hover",
		ClientUi.painted_panel_style(Color(0.18, 0.12, 0.04, 0.98), Color("#FBBF24", 0.65), 8, 1)
	)
	_skip_btn.add_theme_stylebox_override(
		"pressed",
		ClientUi.painted_panel_style(Color(0.1, 0.07, 0.02, 0.98), Color("#D97706", 0.7), 8, 1)
	)
	_skip_btn.pressed.connect(_on_skip)
	active_col.add_child(_skip_btn)

	_claim_btn = Button.new()
	_claim_btn.text = "FIGHT FOR REWARDS"
	_claim_btn.visible = false
	ClientUi.apply_primary_button(_claim_btn)
	_claim_btn.pressed.connect(_on_fight)
	active_col.add_child(_claim_btn)

	# OUT ON ASSIGNMENT — full remaining height
	var stage_eye := Label.new()
	stage_eye.text = "OUT ON ASSIGNMENT"
	stage_eye.add_theme_font_size_override("font_size", 15)
	stage_eye.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(stage_eye)
	root.add_child(stage_eye)

	var stage_frame := PanelContainer.new()
	stage_frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage_frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage_frame.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.02, 0.03, 0.06, 0.98), Color(0.35, 0.4, 0.55, 0.55), 14, 2)
	)
	root.add_child(stage_frame)

	var stage_host := Control.new()
	stage_host.clip_contents = true
	stage_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage_host.custom_minimum_size = Vector2(267, 240)
	stage_frame.add_child(stage_host)

	_explore = MissionExploreStage.new()
	_explore.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	stage_host.add_child(_explore)

	# Rocket timer overlay — pinned near bottom of the image
	var overlay := MarginContainer.new()
	overlay.set_anchors_and_offsets_preset(PRESET_BOTTOM_WIDE)
	overlay.offset_top = -117
	overlay.offset_bottom = -16
	overlay.offset_left = 21
	overlay.offset_right = -21
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.z_index = 5
	stage_host.add_child(overlay)

	var overlay_col := VBoxContainer.new()
	overlay_col.add_theme_constant_override("separation", 6)
	overlay_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(overlay_col)

	var time_row := HBoxContainer.new()
	time_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay_col.add_child(time_row)
	var time_spacer := Control.new()
	time_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	time_spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	time_row.add_child(time_spacer)
	_overlay_timer = Label.new()
	_overlay_timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_overlay_timer.add_theme_font_size_override("font_size", 17)
	_overlay_timer.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(_overlay_timer)
	time_row.add_child(_overlay_timer)
	_timer_label = _overlay_timer

	_progress_track = Control.new()
	_progress_track.custom_minimum_size = Vector2(0, 22)
	_progress_track.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_progress_track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_progress_track.clip_contents = false
	overlay_col.add_child(_progress_track)

	var track_bg := PanelContainer.new()
	track_bg.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	track_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	track_bg.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.08, 0.1, 0.14, 0.85), Color(0.35, 0.4, 0.5, 0.4), 11, 1)
	)
	_progress_track.add_child(track_bg)

	# Clip fill to rounded track; rocket sits on the tip and may overhang.
	var fill_clip := Control.new()
	fill_clip.name = "FillClip"
	fill_clip.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	fill_clip.offset_left = 2
	fill_clip.offset_top = 2
	fill_clip.offset_right = -2
	fill_clip.offset_bottom = -2
	fill_clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fill_clip.clip_contents = true
	_progress_track.add_child(fill_clip)

	_progress_fill = ColorRect.new()
	_progress_fill.color = ClientUi.CYAN
	_progress_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_progress_fill.set_anchors_and_offsets_preset(PRESET_LEFT_WIDE)
	_progress_fill.anchor_right = 0.0
	_progress_fill.offset_right = 0
	fill_clip.add_child(_progress_fill)

	# Cyan → violet stand-in (web gradient).
	var fill_right := ColorRect.new()
	fill_right.name = "FillAccent"
	fill_right.color = Color(ClientUi.VIOLET, 0.85)
	fill_right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fill_right.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	fill_right.anchor_left = 0.55
	_progress_fill.add_child(fill_right)

	_rocket = Label.new()
	_rocket.text = "🚀"
	_rocket.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_rocket.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_rocket.add_theme_font_size_override("font_size", 21)
	_rocket.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rocket.set_anchors_preset(PRESET_CENTER_LEFT)
	_rocket.offset_left = -16
	_rocket.offset_right = 16
	_rocket.offset_top = -16
	_rocket.offset_bottom = 16
	_progress_track.add_child(_rocket)

	_tick = Timer.new()
	_tick.wait_time = 0.5
	_tick.timeout.connect(_refresh_timer)
	add_child(_tick)


func _boot() -> void:
	_set_status("Restoring mission…", true)
	await MissionManager.refresh_character()
	if not MissionManager.has_active_mission():
		_set_status("No active mission.", true)
		await get_tree().create_timer(0.5).timeout
		GameManager.go_cantina()
		return
	if MissionManager.active_mission.is_empty():
		await MissionManager.fetch_active_mission()
	_populate()
	_refresh_timer()
	_tick.start()


func _populate() -> void:
	var m: Dictionary = MissionManager.active_mission
	var mname := str(m.get("name", "Mission"))
	_title.text = mname
	var seed_s := str(m.get("id", m.get("mission_id", mname)))
	var scene_i := int(m.get("explore_scene", -1))
	_explore.configure(mname, seed_s, scene_i)


func _skip_cost_now() -> int:
	var rem := MissionManager.seconds_remaining()
	if rem <= 0:
		return 0
	var minutes := float(rem) / 60.0
	return maxi(1, int(ceil(minutes * SKIP_CRYSTALS_PER_MINUTE)))


func _goofy_for_progress(progress: float) -> String:
	var current := str(GOOFY_STATUS[0]["msg"])
	for entry in GOOFY_STATUS:
		if progress >= float(entry["at"]):
			current = str(entry["msg"])
	return current


func _refresh_timer() -> void:
	if _claimed or _busy:
		return
	if MissionManager.active_mission_missing:
		_stop_ready_fx()
		_timer_label.text = "LOST"
		_goofy.text = "Mission record missing."
		_claim_btn.visible = true
		_claim_btn.text = "Recall Ship"
		_claim_btn.disabled = _busy
		_skip_btn.visible = false
		_set_progress(1.0, true)
		_set_status("This mission's record is gone. Recall the ship to free the slot.", true)
		return

	var rem := MissionManager.seconds_remaining()
	var m: Dictionary = MissionManager.active_mission
	var total := maxi(1, int(m.get("duration_seconds", 1)))
	var progress := clampf(1.0 - float(rem) / float(total), 0.0, 1.0)
	_timer_label.text = MissionBoard.format_duration(rem) if rem > 0 else "DONE"
	_goofy.text = _goofy_for_progress(progress)
	_set_progress(progress, rem <= 0)

	if rem <= 0:
		_start_ready_fx()
		_skip_btn.visible = false
		_claim_btn.visible = true
		_claim_btn.disabled = _busy
		_claim_btn.text = "FIGHT FOR REWARDS"
		_active_panel.add_theme_stylebox_override(
			"panel",
			ClientUi.painted_panel_style(Color(ClientUi.SUCCESS, 0.08), Color(ClientUi.SUCCESS, 0.5), 10, 1)
		)
		_set_status("Mission complete — fight the return encounter to claim.", false)
	else:
		_stop_ready_fx()
		_claim_btn.visible = false
		_skip_btn.visible = true
		_skip_btn.disabled = _busy
		_skip_btn.text = "Skip · Fight · %s 💎" % _skip_cost_now()
		_active_panel.add_theme_stylebox_override(
			"panel",
			ClientUi.painted_panel_style(Color(ClientUi.CYAN, 0.06), Color(ClientUi.CYAN, 0.45), 10, 1)
		)
		_set_status("", false)


func _set_progress(progress: float, done: bool) -> void:
	if not is_instance_valid(_progress_track) or not is_instance_valid(_progress_fill):
		return
	var w := maxf(_progress_track.size.x - 4.0, 1.0)
	var h := maxf(_progress_track.size.y - 4.0, 14.0)
	_progress_fill.set_anchors_and_offsets_preset(PRESET_TOP_LEFT)
	_progress_fill.position = Vector2.ZERO
	_progress_fill.size = Vector2(maxi(0, int(w * progress)), h)
	_rocket.set_anchors_and_offsets_preset(PRESET_TOP_LEFT)
	_rocket.position = Vector2(clampf(w * progress - 10.0, 0.0, maxf(w - 18.0, 0.0)), (h - 20.0) * 0.5)
	_rocket.text = "🎉" if done else "🚀"
	_progress_fill.color = ClientUi.SUCCESS if done else ClientUi.CYAN.lerp(ClientUi.VIOLET, progress)


func _set_status(text: String, show: bool) -> void:
	if not is_instance_valid(_status):
		return
	_status.text = text
	_status.visible = show and not text.is_empty()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		# Re-apply rocket position with current progress width.
		if is_inside_tree() and not _claimed:
			call_deferred("_refresh_timer")


func _start_ready_fx() -> void:
	if _ready_fx != null and _ready_fx.is_valid():
		return
	if not is_instance_valid(_timer_label):
		return
	_timer_label.add_theme_color_override("font_color", ClientUi.SUCCESS)
	_ready_fx = _timer_label.create_tween().set_loops()
	_ready_fx.tween_property(_timer_label, "modulate", Color(1.2, 1.3, 1.2, 1.0), 0.65).set_trans(Tween.TRANS_SINE)
	_ready_fx.tween_property(_timer_label, "modulate", Color.WHITE, 0.65).set_trans(Tween.TRANS_SINE)


func _stop_ready_fx() -> void:
	if _ready_fx != null and _ready_fx.is_valid():
		_ready_fx.kill()
	_ready_fx = null
	if is_instance_valid(_timer_label):
		_timer_label.modulate = Color.WHITE
		_timer_label.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)


func _on_fight() -> void:
	if _busy or _claimed:
		return
	if MissionManager.active_mission_missing:
		await _recall_lost_mission()
		return
	if not MissionManager.is_mission_finished():
		_set_status("Mission not finished yet — wait for the timer, or skip with Nova Crystals.", true)
		_refresh_timer()
		return
	_busy = true
	_claim_btn.disabled = true
	_skip_btn.disabled = true
	_set_status("Opening encounter…", true)
	var prep: Dictionary = await MissionManager.prepare_combat(true)
	if not prep.get("ok", false) or MissionManager.pending_battle.is_empty():
		_busy = false
		_set_status("Could not prepare the encounter. Try again.", true)
		_refresh_timer()
		return
	GameManager.go_mission_combat()


func _recall_lost_mission() -> void:
	_busy = true
	_set_status("Recalling ship…", true)
	await MissionManager.refresh_character()
	if not MissionManager.has_active_mission():
		_busy = false
		_claimed = true
		_tick.stop()
		GameManager.go_cantina()
		return
	await MissionManager.fetch_active_mission()
	if not MissionManager.active_mission_missing:
		_busy = false
		_populate()
		_refresh_timer()
		_set_status("Mission record recovered — no recall needed.", true)
		return
	var res: Dictionary = await MissionManager.claim_mission(false)
	_busy = false
	if not res.ok:
		_set_status(str(res.get("error", "Recall failed")), true)
		_refresh_timer()
		return
	_claimed = true
	_tick.stop()
	GameManager.go_cantina()


func _on_skip() -> void:
	if _busy or _claimed:
		return
	var cost := _skip_cost_now()
	if cost <= 0:
		# Already ready — go straight to the fight path.
		await _on_fight()
		return
	var crystals := int(GameManager.active_character.get("nova_crystals", 0))
	if crystals < cost:
		_set_status("Not enough Nova Crystals — need %s 💎 (you have %s)." % [cost, crystals], true)
		return
	_busy = true
	_skip_btn.disabled = true
	_claim_btn.disabled = true
	_set_status("Skipping wait…", true)
	var res: Dictionary = await MissionManager.skip_mission()
	if not res.ok:
		var err := str(res.get("error", "Skip failed"))
		# Already completed (e.g. prior skip left future end_time) — open the fight.
		if err.to_lower().find("not in progress") >= 0:
			MissionManager.active_mission["status"] = "completed"
			_busy = false
			await _on_fight()
			return
		_busy = false
		_set_status(err, true)
		_refresh_timer()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	if bool(data.get("mission_missing", false)):
		_busy = false
		_set_status("Mission record lost — ship recalled. Returning to the cantina…", true)
		await get_tree().create_timer(1.0).timeout
		GameManager.go_cantina()
		return
	_set_status("Preparing encounter…", true)
	# Character was just patched by SkipMission — skip the redundant refresh round-trip.
	var prep: Dictionary = await MissionManager.prepare_combat(false)
	if not prep.get("ok", false) or MissionManager.pending_battle.is_empty():
		_busy = false
		_set_status("Skip applied, but the encounter failed to load. Tap FIGHT FOR REWARDS.", true)
		_refresh_timer()
		return
	GameManager.go_mission_combat()
