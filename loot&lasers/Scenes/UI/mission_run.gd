extends Control
## Active mission — full-bleed explore art with overlaid status UI (Cantina in-progress).

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
var _ui_layer: Control
var _dim: ColorRect
var _progress_track: Control
var _progress_fill: ColorRect
var _rocket: TextureRect
var _overlay_timer: Label
var _tick: Timer
var _status_poll: Timer
var _busy := false
var _claimed := false
var _ready_fx: Tween
var _enter_tween: Tween


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	clip_contents = true
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_refresh_timer()


func _build() -> void:
	# Void under art (visible only until texture loads).
	add_child(ClientUi.make_page_bg(self, "void"))

	# Full content-pane backdrop — does not cover side nav (page is already content-only).
	_explore = MissionExploreStage.new()
	_explore.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_explore.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_explore.modulate.a = 0.0
	add_child(_explore)

	# Subtle global dim so floating panels stay readable without hiding the art.
	_dim = ColorRect.new()
	_dim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_dim.color = Color(0.02, 0.03, 0.07, 0.22)
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dim.modulate.a = 0.0
	add_child(_dim)

	_ui_layer = Control.new()
	_ui_layer.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_ui_layer.mouse_filter = Control.MOUSE_FILTER_PASS
	_ui_layer.modulate.a = 0.0
	_ui_layer.z_index = 10
	add_child(_ui_layer)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_bottom", 10)
	margin.mouse_filter = Control.MOUSE_FILTER_PASS
	_ui_layer.add_child(margin)

	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 8)
	root.mouse_filter = Control.MOUSE_FILTER_PASS
	margin.add_child(root)

	# Header — Missions + On Mission pill
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	root.add_child(head)
	var page_title := Label.new()
	page_title.text = "Missions"
	page_title.add_theme_font_size_override("font_size", 29)
	page_title.add_theme_color_override("font_color", ClientUi.TEXT)
	page_title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	page_title.add_theme_constant_override("shadow_offset_x", 1)
	page_title.add_theme_constant_override("shadow_offset_y", 2)
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
		ClientUi.painted_panel_style(Color(0.04, 0.08, 0.12, 0.78), Color(ClientUi.CYAN, 0.45), 14, 1)
	)
	pill.add_child(on_mission)
	head.add_child(pill)
	var head_spacer := Control.new()
	head_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_child(head_spacer)

	_status = ClientUi.make_status()
	_status.visible = false
	root.add_child(_status)

	var active_eye := Label.new()
	active_eye.text = "ACTIVE MISSION"
	active_eye.add_theme_font_size_override("font_size", 13)
	active_eye.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.95))
	active_eye.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.75))
	active_eye.add_theme_constant_override("shadow_offset_x", 1)
	active_eye.add_theme_constant_override("shadow_offset_y", 1)
	ClientUi.apply_display_font(active_eye)
	root.add_child(active_eye)

	_active_panel = PanelContainer.new()
	_active_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_active_panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.04, 0.07, 0.12, 0.72), Color(ClientUi.CYAN, 0.45), 10, 1)
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
	_skip_btn.mouse_filter = Control.MOUSE_FILTER_STOP
	ClientUi.apply_display_font(_skip_btn)
	_skip_btn.add_theme_font_size_override("font_size", 16)
	_skip_btn.add_theme_color_override("font_color", Color("#FCD34D"))
	_skip_btn.add_theme_color_override("font_hover_color", Color("#FEF3C7"))
	_skip_btn.add_theme_stylebox_override(
		"normal",
		ClientUi.painted_panel_style(Color(0.12, 0.09, 0.03, 0.92), Color("#F59E0B", 0.45), 8, 1)
	)
	_skip_btn.add_theme_stylebox_override(
		"hover",
		ClientUi.painted_panel_style(Color(0.18, 0.12, 0.04, 0.96), Color("#FBBF24", 0.65), 8, 1)
	)
	_skip_btn.add_theme_stylebox_override(
		"pressed",
		ClientUi.painted_panel_style(Color(0.1, 0.07, 0.02, 0.96), Color("#D97706", 0.7), 8, 1)
	)
	_skip_btn.pressed.connect(_on_skip)
	active_col.add_child(_skip_btn)
	TutorialManager.tag_target(_skip_btn, "mission-skip")

	_claim_btn = Button.new()
	_claim_btn.text = "FIGHT ENCOUNTER"
	_claim_btn.visible = false
	_claim_btn.mouse_filter = Control.MOUSE_FILTER_STOP
	ClientUi.apply_primary_button(_claim_btn)
	_claim_btn.pressed.connect(_on_fight)
	active_col.add_child(_claim_btn)
	TutorialManager.tag_target(_claim_btn, "mission-fight")

	# Flex spacer keeps the rocket timer pinned to the bottom of the content pane.
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(spacer)

	# Flavor caption over the art (stage chrome is off — host owns copy).
	var caption := Label.new()
	caption.name = "FlavorCaption"
	caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	caption.add_theme_font_size_override("font_size", 18)
	caption.add_theme_color_override("font_color", Color(0.95, 0.97, 1.0, 0.92))
	caption.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	caption.add_theme_constant_override("shadow_offset_x", 1)
	caption.add_theme_constant_override("shadow_offset_y", 2)
	ClientUi.apply_display_font(caption)
	root.add_child(caption)

	var overlay := PanelContainer.new()
	overlay.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.03, 0.04, 0.08, 0.55), Color(0.35, 0.4, 0.55, 0.35), 12, 1)
	)
	root.add_child(overlay)

	var overlay_pad := MarginContainer.new()
	overlay_pad.add_theme_constant_override("margin_left", 14)
	overlay_pad.add_theme_constant_override("margin_right", 14)
	overlay_pad.add_theme_constant_override("margin_top", 10)
	overlay_pad.add_theme_constant_override("margin_bottom", 10)
	overlay_pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(overlay_pad)

	var overlay_col := VBoxContainer.new()
	overlay_col.add_theme_constant_override("separation", 6)
	overlay_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay_pad.add_child(overlay_col)

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
	_overlay_timer.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.75))
	_overlay_timer.add_theme_constant_override("shadow_offset_x", 1)
	_overlay_timer.add_theme_constant_override("shadow_offset_y", 1)
	ClientUi.apply_display_font(_overlay_timer)
	time_row.add_child(_overlay_timer)
	_timer_label = _overlay_timer
	TutorialManager.tag_target(_timer_label, "mission-timer")

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

	var fill_right := ColorRect.new()
	fill_right.name = "FillAccent"
	fill_right.color = Color(ClientUi.VIOLET, 0.85)
	fill_right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fill_right.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	fill_right.anchor_left = 0.55
	_progress_fill.add_child(fill_right)

	_rocket = UiIcon.make("rocket", ClientUi.CYAN, 20.0)
	_rocket.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rocket.set_anchors_preset(PRESET_CENTER_LEFT)
	_rocket.offset_left = -10
	_rocket.offset_right = 10
	_rocket.offset_top = -10
	_rocket.offset_bottom = 10
	_progress_track.add_child(_rocket)

	_tick = Timer.new()
	_tick.wait_time = 0.5
	_tick.timeout.connect(_refresh_timer)
	add_child(_tick)

	_status_poll = Timer.new()
	_status_poll.wait_time = 5.0
	_status_poll.timeout.connect(_poll_status)
	add_child(_status_poll)


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
	_play_enter_transition()
	_tick.start()
	_status_poll.start()


func _populate() -> void:
	var m: Dictionary = MissionManager.active_mission
	var mname := str(m.get("name", m.get("title", "Mission")))
	_title.text = mname
	var seed_s := str(m.get("mission_id", m.get("id", mname)))
	var scene_i := int(m.get("explore_scene", -1))
	# Configure once with the persisted mission art — never re-roll on remount.
	_explore.configure(mname, seed_s, scene_i, false)

	var caption := _find_flavor_caption()
	if caption != null and _explore.scene_index >= 0:
		caption.text = MissionExploreStage.CAPTIONS[_explore.scene_index]


func _find_flavor_caption() -> Label:
	if not is_instance_valid(_ui_layer):
		return null
	return _ui_layer.find_child("FlavorCaption", true, false) as Label


func _play_enter_transition() -> void:
	if _enter_tween != null and _enter_tween.is_valid():
		_enter_tween.kill()
	_enter_tween = create_tween()
	_enter_tween.set_parallel(true)
	_enter_tween.tween_property(_explore, "modulate:a", 1.0, 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	_enter_tween.tween_property(_dim, "modulate:a", 1.0, 0.4).set_trans(Tween.TRANS_SINE)
	_enter_tween.tween_property(_ui_layer, "modulate:a", 1.0, 0.35).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)


## Mission skip preview — Fuel-based half-Nova (matches Node skipCostFor).
## Cost = MAX(0.5, CEILING(fuel × 0.20)) half-units. Elapsed time ignored.
func _skip_cost_now() -> float:
	if _tutorial_free_skip():
		return 0.0
	var rem := MissionManager.seconds_remaining()
	if rem <= 0:
		return 0.0
	var m: Dictionary = MissionManager.active_mission
	var fuel := float(m.get("fuel_cost", m.get("original_fuel_cost", 0)))
	if fuel <= 0.0:
		return 0.5
	var half := maxi(1, int(ceil(fuel * 0.2)))
	return float(half) / 2.0


func _tutorial_free_skip() -> bool:
	if not TutorialManager.should_show():
		return false
	if TutorialManager.step_id() != "mission_fight":
		return false
	var ob = GameManager.active_character.get("onboarding_tutorial", {})
	if typeof(ob) != TYPE_DICTIONARY:
		return false
	var status := str(ob.get("status", ""))
	if status != "pending" and status != "active":
		return false
	if bool(ob.get("first_mission_bonus_spent", false)):
		return false
	var flagged := str(ob.get("first_mission_bonus_mission_id", ""))
	if flagged.is_empty():
		return false
	var mid := str(MissionManager.active_mission.get("id", ""))
	return mid == flagged


func _goofy_for_progress(progress: float) -> String:
	var current := str(GOOFY_STATUS[0]["msg"])
	for entry in GOOFY_STATUS:
		if progress >= float(entry["at"]):
			current = str(entry["msg"])
	return current


func _poll_status() -> void:
	if _claimed or _busy:
		return
	await MissionManager.refresh_mission_status()
	_refresh_timer()


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

	if rem <= 0 or MissionManager.is_mission_finished():
		_start_ready_fx()
		_skip_btn.visible = false
		_claim_btn.visible = true
		_claim_btn.disabled = _busy
		_claim_btn.text = "FIGHT ENCOUNTER"
		_active_panel.add_theme_stylebox_override(
			"panel",
			ClientUi.painted_panel_style(Color(0.04, 0.1, 0.07, 0.75), Color(ClientUi.SUCCESS, 0.5), 10, 1)
		)
		_set_status("Mission complete — fight the encounter for rewards.", false)
	else:
		_stop_ready_fx()
		_claim_btn.visible = false
		_skip_btn.visible = true
		_skip_btn.disabled = _busy
		var cost := _skip_cost_now()
		if cost <= 0.0 and _tutorial_free_skip():
			_skip_btn.text = "Skip · Fight · FREE"
		else:
			_skip_btn.text = "Skip · Fight · %s 💎" % cost
		_active_panel.add_theme_stylebox_override(
			"panel",
			ClientUi.painted_panel_style(Color(0.04, 0.07, 0.12, 0.72), Color(ClientUi.CYAN, 0.45), 10, 1)
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
	_rocket.position = Vector2(clampf(w * progress - 10.0, 0.0, maxf(w - 20.0, 0.0)), (h - 20.0) * 0.5)
	if done:
		_rocket.texture = UiIcon.texture("sparkles")
		UiIcon.set_tint(_rocket, ClientUi.SUCCESS)
	else:
		_rocket.texture = UiIcon.texture("rocket")
		UiIcon.set_tint(_rocket, ClientUi.CYAN)
	_progress_fill.color = ClientUi.SUCCESS if done else ClientUi.CYAN.lerp(ClientUi.VIOLET, progress)


func _set_status(text: String, show: bool) -> void:
	if not is_instance_valid(_status):
		return
	_status.text = text
	_status.visible = show and not text.is_empty()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
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


func _start_mission_fight() -> void:
	_set_status("Preparing encounter…", true)
	var prep: Dictionary = await MissionManager.prepare_combat(false)
	_busy = false
	if not prep.get("ok", false):
		_set_status(str(prep.get("error", "Could not start fight")), true)
		_claim_btn.visible = true
		_claim_btn.disabled = false
		_skip_btn.visible = false
		_refresh_timer()
		return
	_tick.stop()
	if is_instance_valid(_status_poll):
		_status_poll.stop()
	GameManager.go_mission_combat()


func _on_fight() -> void:
	if _busy or _claimed:
		return
	if MissionManager.active_mission_missing:
		await _recall_lost_mission()
		return

	_busy = true
	_claim_btn.disabled = true
	_skip_btn.disabled = true
	_skip_btn.visible = false

	if not MissionManager.is_mission_finished():
		_set_status("Checking mission…", true)
		await MissionManager.refresh_mission_status("", true)
	if not MissionManager.is_mission_finished():
		_busy = false
		Notify.blocked("Mission not finished", "Wait for the timer, or skip with Nova Crystals")
		_set_status("", false)
		_refresh_timer()
		return

	await _start_mission_fight()


func _recall_lost_mission() -> void:
	_busy = true
	_set_status("Recalling ship…", true)
	await MissionManager.refresh_character()
	if not MissionManager.has_active_mission():
		_busy = false
		_claimed = true
		_tick.stop()
		if is_instance_valid(_status_poll):
			_status_poll.stop()
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
	if is_instance_valid(_status_poll):
		_status_poll.stop()
	GameManager.go_cantina()


func _on_skip() -> void:
	if _busy or _claimed:
		return
	var cost := _skip_cost_now()
	if cost <= 0:
		await _on_fight()
		return
	var crystals: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA))
	if not CurrencyManager.can_afford(CurrencyManager.CURRENCY_NOVA, cost):
		Notify.blocked("Not enough Nova Crystals", "Need %s 💎 (you have %s)" % [cost, crystals])
		return

	_busy = true
	_skip_btn.disabled = true
	_claim_btn.disabled = true
	_set_status("Skipping wait…", true)
	var res: Dictionary = await MissionManager.skip_mission()
	if not res.ok:
		var err := str(res.get("error", "Skip failed"))
		var low := err.to_lower()
		if low.find("not in progress") >= 0 or low.find("not active") >= 0 or low.find("already complete") >= 0:
			_busy = false
			await _on_fight()
			return
		_busy = false
		if not Notify.from_result(res):
			_set_status(err, true)
		_refresh_timer()
		return

	_skip_btn.visible = false
	_claim_btn.visible = true
	_claim_btn.disabled = true
	_timer_label.text = "DONE"
	_set_status("Wait skipped — starting fight…", true)
	await _start_mission_fight()
