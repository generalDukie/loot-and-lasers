extends Control
## Space Mining — mirrors web SpaceMiningPage (hero node · duration · progress · stats).

var _balance_lab: Label
var _status: Label
var _hero_wrap: Control
var _hero_emoji: Label
var _hero_glow: ColorRect
var _hero_title: Label
var _hero_sub: Label
var _idle_box: VBoxContainer
var _busy_box: VBoxContainer
var _ready_box: VBoxContainer
var _hours: HSlider
var _hours_lab: Label
var _preview_chip: Label
var _preview_formula: Label
var _progress: ProgressBar
var _remain_lab: Label
var _reward_lab: Label
var _ready_reward: Label
var _stat_level: Label
var _stat_rate: Label
var _stat_max: Label
var _start_btn: Button
var _abort_btn: Button
var _collect_btn: Button
var _busy := false
var _tick: Timer
var _emoji_tween: Tween
var _glow_tween: Tween
var _last_phase := ""


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_populate()


func _boot() -> void:
	await MissionManager.refresh_character()
	_populate()
	_tick = Timer.new()
	_tick.wait_time = 1.0
	_tick.timeout.connect(_populate)
	add_child(_tick)
	_tick.start()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "void"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 14)
	margin.add_child(root)

	# Header — Pickaxe Space Mining + stardust
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)

	var title := Label.new()
	title.text = "⛏  Space Mining"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 27)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	header.add_child(title)

	_balance_lab = Label.new()
	_balance_lab.add_theme_font_size_override("font_size", 16)
	_balance_lab.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(_balance_lab)
	header.add_child(_balance_lab)

	# Hero painted panel (web motion.div painted-panel p-6 text-center)
	var hero := PanelContainer.new()
	hero.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hero.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	hero.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.05, 0.08, 0.97), Color(0.35, 0.40, 0.48, 0.45), 16, 1
	))
	root.add_child(hero)

	var pad := MarginContainer.new()
	for k in ["margin_left", "margin_right"]:
		pad.add_theme_constant_override(k, 20)
	pad.add_theme_constant_override("margin_top", 18)
	pad.add_theme_constant_override("margin_bottom", 18)
	hero.add_child(pad)

	var hcol := VBoxContainer.new()
	hcol.add_theme_constant_override("separation", 10)
	pad.add_child(hcol)

	_hero_wrap = Control.new()
	_hero_wrap.custom_minimum_size = Vector2(0, 187)
	_hero_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hcol.add_child(_hero_wrap)

	_hero_glow = ColorRect.new()
	_hero_glow.color = Color(0.96, 0.62, 0.04, 0.0)
	_hero_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hero_glow.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_hero_wrap.add_child(_hero_glow)

	_hero_emoji = Label.new()
	_hero_emoji.text = "🪨"
	_hero_emoji.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hero_emoji.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_hero_emoji.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_hero_emoji.add_theme_font_size_override("font_size", 75)
	_hero_emoji.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hero_wrap.add_child(_hero_emoji)

	_hero_title = Label.new()
	_hero_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hero_title.add_theme_font_size_override("font_size", 21)
	_hero_title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(_hero_title)
	hcol.add_child(_hero_title)

	_hero_sub = Label.new()
	_hero_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hero_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hero_sub.add_theme_font_size_override("font_size", 15)
	_hero_sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_hero_sub)
	hcol.add_child(_hero_sub)

	# ── Idle: deploy drone ──
	_idle_box = VBoxContainer.new()
	_idle_box.add_theme_constant_override("separation", 8)
	hcol.add_child(_idle_box)

	var dur_row := HBoxContainer.new()
	_idle_box.add_child(dur_row)
	var dur_lab := Label.new()
	dur_lab.text = "⏱  Duration"
	dur_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dur_lab.add_theme_font_size_override("font_size", 15)
	dur_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(dur_lab)
	dur_row.add_child(dur_lab)
	_hours_lab = Label.new()
	_hours_lab.add_theme_font_size_override("font_size", 21)
	_hours_lab.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(_hours_lab)
	dur_row.add_child(_hours_lab)

	_hours = HSlider.new()
	_hours.min_value = 1
	_hours.max_value = 24
	_hours.step = 1
	_hours.value = 4
	_hours.custom_minimum_size.y = 24
	_hours.value_changed.connect(func(_v: float) -> void: _refresh_idle_preview())
	_idle_box.add_child(_hours)

	var tick_row := HBoxContainer.new()
	_idle_box.add_child(tick_row)
	for i in 3:
		var t: String = ["1h", "12h", "24h"][i]
		var tl := Label.new()
		tl.text = t
		tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tl.horizontal_alignment = [
			HORIZONTAL_ALIGNMENT_LEFT,
			HORIZONTAL_ALIGNMENT_CENTER,
			HORIZONTAL_ALIGNMENT_RIGHT,
		][i]
		tl.add_theme_font_size_override("font_size", 12)
		tl.add_theme_color_override("font_color", ClientUi.MUTED)
		tick_row.add_child(tl)

	var preview_row := HBoxContainer.new()
	preview_row.alignment = BoxContainer.ALIGNMENT_CENTER
	preview_row.add_theme_constant_override("separation", 8)
	_idle_box.add_child(preview_row)

	var chip := PanelContainer.new()
	chip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(ClientUi.VIOLET, 0.10), Color(ClientUi.VIOLET, 0.30), 999, 1
	))
	preview_row.add_child(chip)
	_preview_chip = Label.new()
	_preview_chip.add_theme_font_size_override("font_size", 15)
	_preview_chip.add_theme_color_override("font_color", Color("#C4B5FD"))
	ClientUi.apply_display_font(_preview_chip)
	chip.add_child(_preview_chip)

	_preview_formula = Label.new()
	_preview_formula.add_theme_font_size_override("font_size", 13)
	_preview_formula.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_preview_formula)
	preview_row.add_child(_preview_formula)

	_start_btn = Button.new()
	_start_btn.text = "⚡  Start Mining"
	_start_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(_start_btn)
	_start_btn.pressed.connect(_on_start)
	_idle_box.add_child(_start_btn)

	# ── Busy: in progress ──
	_busy_box = VBoxContainer.new()
	_busy_box.add_theme_constant_override("separation", 8)
	_busy_box.visible = false
	hcol.add_child(_busy_box)

	var busy_row := HBoxContainer.new()
	_busy_box.add_child(busy_row)
	_remain_lab = Label.new()
	_remain_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_remain_lab.add_theme_font_size_override("font_size", 16)
	_remain_lab.add_theme_color_override("font_color", Color("#FCD34D"))
	ClientUi.apply_display_font(_remain_lab)
	busy_row.add_child(_remain_lab)
	_reward_lab = Label.new()
	_reward_lab.add_theme_font_size_override("font_size", 16)
	_reward_lab.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(_reward_lab)
	busy_row.add_child(_reward_lab)

	_progress = ProgressBar.new()
	_progress.min_value = 0
	_progress.max_value = 100
	_progress.show_percentage = false
	_progress.custom_minimum_size = Vector2(0, 13)
	ClientUi.apply_hp_bar(_progress, Color("#F59E0B"))
	_busy_box.add_child(_progress)

	_abort_btn = Button.new()
	_abort_btn.text = "Abort (no reward)"
	_abort_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(_abort_btn)
	_abort_btn.pressed.connect(_on_cancel)
	_busy_box.add_child(_abort_btn)

	# ── Ready: collect ──
	_ready_box = VBoxContainer.new()
	_ready_box.add_theme_constant_override("separation", 10)
	_ready_box.visible = false
	hcol.add_child(_ready_box)

	_ready_reward = Label.new()
	_ready_reward.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ready_reward.add_theme_font_size_override("font_size", 48)
	_ready_reward.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(_ready_reward)
	_ready_box.add_child(_ready_reward)

	_collect_btn = Button.new()
	_collect_btn.text = "✦  Collect Stardust"
	_collect_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(_collect_btn)
	_collect_btn.pressed.connect(_on_collect)
	_ready_box.add_child(_collect_btn)

	_status = ClientUi.make_status()
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hcol.add_child(_status)

	# Footer 3-up stats
	var footer := HBoxContainer.new()
	footer.add_theme_constant_override("separation", 8)
	root.add_child(footer)
	_stat_level = _footer_tile(footer, "YOUR LEVEL", ClientUi.CYAN)
	_stat_rate = _footer_tile(footer, "BASE RATE", Color("#FCD34D"))
	_stat_max = _footer_tile(footer, "MAX (24h)", GameData.STARDUST_COLOR)


func _footer_tile(parent: HBoxContainer, label: String, color: Color) -> Label:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.55), Color(0.35, 0.40, 0.48, 0.40), 12, 1
	))
	parent.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 2)
	panel.add_child(col)
	var val := Label.new()
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	val.add_theme_font_size_override("font_size", 19)
	val.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(val)
	col.add_child(val)
	var lab := Label.new()
	lab.text = label
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", 12)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	return val


func _refresh_idle_preview() -> void:
	var c := GameManager.active_character
	var level := maxi(1, int(c.get("level", 1)))
	var h := int(_hours.value)
	var preview := MiningManager.preview_reward(h)
	var spf := StardustEconomy.stardust_per_fuel(level)
	_hours_lab.text = "%sh" % h
	_preview_chip.text = "%s ✦ projected" % preview
	_preview_formula.text = "(%s × 0.03 × %sm)" % [spf, h * 60]


func _populate() -> void:
	var c := GameManager.active_character
	var level := maxi(1, int(c.get("level", 1)))
	var spf := StardustEconomy.stardust_per_fuel(level)
	var rate_per_hour := int(round(float(spf) * StardustEconomy.MINING_EFFICIENCY * 60.0))
	_balance_lab.text = "✦  %s" % str(
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST)
	)
	_stat_level.text = str(level)
	_stat_rate.text = "%s/h" % rate_per_hour
	_stat_max.text = str(MiningManager.preview_reward(24))
	_refresh_idle_preview()

	var mining := MiningManager.is_mining()
	var ready := MiningManager.is_ready()
	var rem := MiningManager.remaining_ms()
	var reward := int(c.get("mining_reward", 0))

	_idle_box.visible = not mining
	_busy_box.visible = mining and not ready
	_ready_box.visible = ready
	_start_btn.disabled = _busy
	_abort_btn.disabled = _busy
	_collect_btn.disabled = _busy

	var phase := "idle"
	if ready:
		phase = "ready"
	elif mining:
		phase = "busy"

	if not mining:
		_hero_emoji.text = "🪨"
		_hero_title.text = "Deploy Mining Drone"
		_hero_title.add_theme_color_override("font_color", ClientUi.TEXT)
		_hero_sub.text = "Set your drone to mine a stardust node. The longer it runs, the more you collect — yield scales with your level."
		_set_glow(Color(0, 0, 0, 0), false)
	elif ready:
		_hero_emoji.text = "💎"
		_hero_title.text = "NODE READY!"
		_hero_title.add_theme_color_override("font_color", Color("#4ADE80"))
		_hero_sub.text = "Your drone finished mining a stardust node."
		_ready_reward.text = "+%s ✦" % reward
		_set_glow(Color(0.13, 0.77, 0.37, 0.35), true)
	else:
		_hero_emoji.text = "⛏️"
		_hero_title.text = "Mining in Progress"
		_hero_title.add_theme_color_override("font_color", ClientUi.TEXT)
		_hero_sub.text = "Your drone is harvesting a stardust node..."
		_remain_lab.text = "⏱  %s" % _format_remaining(rem)
		_reward_lab.text = "%s ✦" % reward
		# Derive duration from reward ≈ StardustPerFuel × 0.03 × minutes.
		var rate := float(spf) * StardustEconomy.MINING_EFFICIENCY * 60.0
		var total_h := float(reward) / maxf(1.0, rate)
		var total_ms := maxf(1.0, total_h * 3600000.0)
		var elapsed := total_ms - float(rem)
		_progress.value = clampf(elapsed / total_ms * 100.0, 0.0, 100.0)
		_set_glow(Color(0.96, 0.62, 0.04, 0.22), true)

	if phase != _last_phase:
		_last_phase = phase
		_restart_emoji_motion(phase)

	if MissionManager.has_active_mission() and not mining:
		if _status.text.is_empty() or _status.text.begins_with("🚀") or _status.text.begins_with("Cantina"):
			_set_status("🚀 Ship Busy — finish or claim your Cantina mission before deploying the mining drone.", ClientUi.DANGER)
	elif _status.text.begins_with("🚀") or _status.text.begins_with("Cantina"):
		_set_status("", ClientUi.MUTED)


func _restart_emoji_motion(phase: String) -> void:
	if _emoji_tween != null and _emoji_tween.is_valid():
		_emoji_tween.kill()
	_hero_emoji.rotation = 0.0
	_hero_emoji.position = Vector2.ZERO
	_hero_emoji.scale = Vector2.ONE
	# Pivot at visual center so rotate/bob reads like Framer Motion.
	var sz := _hero_wrap.size
	if sz.x < 1.0 or sz.y < 1.0:
		sz = _hero_wrap.custom_minimum_size
	_hero_emoji.pivot_offset = sz * 0.5
	_emoji_tween = _hero_emoji.create_tween().set_loops()
	match phase:
		"idle":
			_emoji_tween.tween_property(_hero_emoji, "rotation", TAU, 20.0).from(0.0)
		"busy":
			_emoji_tween.tween_property(_hero_emoji, "position:y", -8.0, 1.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
			_emoji_tween.tween_property(_hero_emoji, "position:y", 0.0, 1.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		"ready":
			_emoji_tween.tween_property(_hero_emoji, "scale", Vector2(1.15, 1.15), 0.4).set_trans(Tween.TRANS_SINE)
			_emoji_tween.parallel().tween_property(_hero_emoji, "rotation", deg_to_rad(5.0), 0.4)
			_emoji_tween.tween_property(_hero_emoji, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_SINE)
			_emoji_tween.parallel().tween_property(_hero_emoji, "rotation", deg_to_rad(-5.0), 0.4)
			_emoji_tween.tween_property(_hero_emoji, "rotation", 0.0, 0.2)


func _set_glow(color: Color, pulse: bool) -> void:
	if _glow_tween != null and _glow_tween.is_valid():
		_glow_tween.kill()
	_hero_glow.color = color
	if not pulse or color.a <= 0.01:
		return
	_glow_tween = _hero_glow.create_tween().set_loops()
	var hi := Color(color.r, color.g, color.b, mini(0.55, color.a * 2.2))
	var lo := Color(color.r, color.g, color.b, color.a * 0.35)
	_glow_tween.tween_property(_hero_glow, "color", hi, 0.75).set_trans(Tween.TRANS_SINE)
	_glow_tween.tween_property(_hero_glow, "color", lo, 0.75).set_trans(Tween.TRANS_SINE)


func _format_remaining(ms: int) -> String:
	## Mirrors web formatRemaining.
	if ms <= 0:
		return "Ready to collect!"
	var total := int(ceil(float(ms) / 1000.0))
	var h := int(total / 3600)
	var m := int((total % 3600) / 60)
	var s := total % 60
	if h > 0:
		return "%sh %sm %ss" % [h, m, s]
	if m > 0:
		return "%sm %ss" % [m, s]
	return "%ss" % s


func _on_start() -> void:
	if _busy:
		return
	if MissionManager.has_active_mission():
		_set_status(
			"🚀 Ship Busy — your ship is on a mission. Finish or claim it before deploying the mining drone.",
			ClientUi.DANGER
		)
		return
	_busy = true
	_start_btn.disabled = true
	_set_status("Starting…", ClientUi.MUTED)
	var hours := int(_hours.value)
	var res: Dictionary = await MiningManager.start(hours)
	_busy = false
	if not res.ok:
		_set_status(str(res.get("error", "StartMining failed")), ClientUi.DANGER)
	else:
		var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
		var patch: Variant = data.get("patch", {})
		var gained := 0
		if typeof(patch) == TYPE_DICTIONARY:
			gained = int(patch.get("mining_reward", 0))
		if gained <= 0:
			gained = MiningManager.preview_reward(hours)
		_set_status("Mining started! Collect %s ✦ in %sh." % [gained, hours], GameData.STARDUST_COLOR)
	_populate()


func _on_collect() -> void:
	if _busy:
		return
	_busy = true
	_collect_btn.disabled = true
	_set_status("Collecting…", ClientUi.MUTED)
	var res: Dictionary = await MiningManager.collect()
	_busy = false
	if not res.ok:
		_set_status(str(res.get("error", "CollectMining failed")), ClientUi.DANGER)
	else:
		var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
		_set_status(
			"Node collected! +%s ✦ stardust harvested." % str(data.get("stardust_gained", 0)),
			Color("#4ADE80")
		)
	_populate()


func _on_cancel() -> void:
	if _busy:
		return
	_busy = true
	_abort_btn.disabled = true
	_set_status("Aborting…", ClientUi.MUTED)
	var res: Dictionary = await MiningManager.cancel()
	_busy = false
	if res.ok:
		_set_status(
			"Mining aborted — drone recalled, no stardust recovered. Let it finish to collect the full yield.",
			ClientUi.MUTED
		)
	else:
		_set_status(str(res.get("error", "Cancel failed")), ClientUi.DANGER)
	_populate()


func _set_status(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)
