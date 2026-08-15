extends Control
## Space Mining — mirrors web SpaceMiningPage (hero node · duration · progress · stats).

const MINUTES_PER_HOUR := 60.0
const SECONDS_PER_MINUTE := 60
const MINUTES_PER_HOUR_INT := 60
const MILLISECONDS_PER_SECOND := 1_000.0

var _balance_lab: Label
var _status: Label
var _hero_wrap: Control
var _hero_icon_host: Control
var _hero_icon: TextureRect
var _hero_glow: ColorRect
var _hero_title: Label
var _hero_sub: Label
var _idle_box: VBoxContainer
var _busy_box: VBoxContainer
var _ready_box: VBoxContainer
var _hours: HSlider
var _hours_lab: Label
var _preview_chip: Label
var _preview_icon: TextureRect
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
	if not MiningManager.phase_changed.is_connected(_on_mining_phase_changed):
		MiningManager.phase_changed.connect(_on_mining_phase_changed)
	await _boot()


func _exit_tree() -> void:
	if MiningManager.phase_changed.is_connected(_on_mining_phase_changed):
		MiningManager.phase_changed.disconnect(_on_mining_phase_changed)
	if CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.disconnect(_on_wallet_changed)


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_populate()


func _on_mining_phase_changed(_phase: String) -> void:
	_populate()


func _boot() -> void:
	_busy = true
	var requests := AsyncGroup.new()
	requests.add(MissionManager.refresh_character.bind(true))
	requests.add(MiningManager.refresh_status)
	await requests.wait()
	_busy = false
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
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 14)
	margin.add_child(root)

	# Header — Pickaxe Space Mining + stardust
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)

	var title_row := UiIcon.make_title_row("pickaxe", "Space Mining", ClientUi.TEXT, 27, 28.0)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_row)

	var bal_row := HBoxContainer.new()
	bal_row.add_theme_constant_override("separation", 6)
	bal_row.alignment = BoxContainer.ALIGNMENT_END
	header.add_child(bal_row)
	bal_row.add_child(CurrencyIcon.make("stardust", 18.0))
	_balance_lab = Label.new()
	_balance_lab.add_theme_font_size_override("font_size", 16)
	_balance_lab.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(_balance_lab)
	bal_row.add_child(_balance_lab)

	# Hero painted panel (web motion.div painted-panel p-6 text-center)
	var hero := PanelContainer.new()
	hero.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hero.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hero.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.05, 0.08, 0.97), Color(0.35, 0.40, 0.48, 0.45), 16, 1
	))
	TutorialManager.tag_target(hero, "mine-hero")
	root.add_child(hero)

	var pad := MarginContainer.new()
	pad.size_flags_vertical = Control.SIZE_EXPAND_FILL
	for k in ["margin_left", "margin_right"]:
		pad.add_theme_constant_override(k, 20)
	pad.add_theme_constant_override("margin_top", 18)
	pad.add_theme_constant_override("margin_bottom", 18)
	hero.add_child(pad)

	var hcol := VBoxContainer.new()
	hcol.size_flags_vertical = Control.SIZE_EXPAND_FILL
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

	_hero_icon_host = Control.new()
	_hero_icon_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hero_icon_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_hero_wrap.add_child(_hero_icon_host)

	var hero_center := CenterContainer.new()
	hero_center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	hero_center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hero_icon_host.add_child(hero_center)

	_hero_icon = UiIcon.make("pickaxe", ClientUi.MUTED, 72.0)
	hero_center.add_child(_hero_icon)

	_hero_title = Label.new()
	_hero_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hero_title.add_theme_font_size_override("font_size", 21)
	_hero_title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(_hero_title)
	hcol.add_child(_hero_title)

	_hero_sub = Label.new()
	_hero_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hero_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hero_sub.add_theme_font_size_override("font_size", 19)
	_hero_sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_hero_sub)
	hcol.add_child(_hero_sub)

	# ── Idle: deploy drone ──
	_idle_box = VBoxContainer.new()
	_idle_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
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
	_hours_lab.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(_hours_lab)
	dur_row.add_child(_hours_lab)

	_hours = HSlider.new()
	_hours.min_value = 1
	_hours.max_value = 12
	_hours.step = 1
	_hours.value = 1
	_hours.custom_minimum_size.y = 48
	_hours.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_mining_hours_slider_style(_hours)
	_hours.value_changed.connect(func(_v: float) -> void: _refresh_idle_preview())
	_idle_box.add_child(_hours)

	var tick_row := HBoxContainer.new()
	_idle_box.add_child(tick_row)
	for i in 3:
		var t: String = ["1h", "6h", "12h"][i]
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

	var preview_row := CenterContainer.new()
	preview_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_idle_box.add_child(preview_row)

	var chip := PanelContainer.new()
	chip.custom_minimum_size = Vector2(420, 72)
	chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var chip_style := ClientUi.painted_panel_style(
		Color(ClientUi.VIOLET, 0.12), Color(ClientUi.VIOLET, 0.40), 14, 1
	)
	chip_style.content_margin_left = 20
	chip_style.content_margin_right = 20
	chip_style.content_margin_top = 12
	chip_style.content_margin_bottom = 12
	chip.add_theme_stylebox_override("panel", chip_style)
	TutorialManager.tag_target(chip, "mine-stardust")
	preview_row.add_child(chip)

	var chip_row := HBoxContainer.new()
	chip_row.alignment = BoxContainer.ALIGNMENT_CENTER
	chip_row.add_theme_constant_override("separation", 10)
	chip.add_child(chip_row)
	_preview_icon = CurrencyIcon.make("stardust", 32.0)
	chip_row.add_child(_preview_icon)
	_preview_chip = Label.new()
	_preview_chip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_preview_chip.add_theme_font_size_override("font_size", 24)
	_preview_chip.add_theme_color_override("font_color", Color("#C4B5FD"))
	ClientUi.apply_display_font(_preview_chip)
	chip_row.add_child(_preview_chip)

	var idle_spacer := Control.new()
	idle_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	idle_spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_idle_box.add_child(idle_spacer)

	var start_row := HBoxContainer.new()
	start_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	start_row.size_flags_vertical = Control.SIZE_SHRINK_END
	start_row.add_theme_constant_override("separation", 0)
	_idle_box.add_child(start_row)
	var start_pad_l := Control.new()
	start_pad_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	start_pad_l.size_flags_stretch_ratio = 1.5
	start_pad_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	start_row.add_child(start_pad_l)
	_start_btn = Button.new()
	_start_btn.text = "Start Mining"
	_start_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_start_btn.size_flags_stretch_ratio = 1.0
	_start_btn.size_flags_vertical = Control.SIZE_SHRINK_END
	_start_btn.custom_minimum_size.y = 80
	ClientUi.apply_primary_button(_start_btn)
	_start_btn.add_theme_font_size_override("font_size", 28)
	_start_btn.pressed.connect(_on_start)
	start_row.add_child(_start_btn)
	var start_pad_r := Control.new()
	start_pad_r.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	start_pad_r.size_flags_stretch_ratio = 1.5
	start_pad_r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	start_row.add_child(start_pad_r)

	# ── Busy: in progress ──
	_busy_box = VBoxContainer.new()
	_busy_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
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
	_ready_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
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
	_collect_btn.text = "Collect Stardust"
	_collect_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(_collect_btn)
	CurrencyIcon.apply_stardust_button_cost(_collect_btn, 18.0)
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
	_stat_max = _footer_tile(footer, "MAX (12h)", GameData.STARDUST_COLOR)


func _apply_mining_hours_slider_style(slider: HSlider) -> void:
	var dust := GameData.STARDUST_COLOR
	# Thin track; grabber is drawn larger so the control reads as a slider.
	var track := StyleBoxFlat.new()
	track.bg_color = Color(dust, 0.22)
	track.set_corner_radius_all(6)
	track.set_content_margin_all(0)
	track.content_margin_top = 14
	track.content_margin_bottom = 14
	slider.add_theme_stylebox_override("slider", track)

	var fill := StyleBoxFlat.new()
	fill.bg_color = Color(dust, 0.72)
	fill.set_corner_radius_all(6)
	fill.set_content_margin_all(0)
	fill.content_margin_top = 14
	fill.content_margin_bottom = 14
	slider.add_theme_stylebox_override("grabber_area", fill)
	var fill_hi := fill.duplicate() as StyleBoxFlat
	fill_hi.bg_color = Color(dust.lightened(0.12), 0.88)
	slider.add_theme_stylebox_override("grabber_area_highlight", fill_hi)

	var grabber := _make_mining_slider_grabber_tex(40, dust)
	var grabber_hi := _make_mining_slider_grabber_tex(40, dust.lightened(0.18))
	slider.add_theme_icon_override("grabber", grabber)
	slider.add_theme_icon_override("grabber_highlight", grabber_hi)
	slider.add_theme_icon_override("grabber_disabled", grabber)


func _make_mining_slider_grabber_tex(diameter: int, color: Color) -> Texture2D:
	var img := Image.create(diameter, diameter, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var r := float(diameter) * 0.5
	var center := Vector2(r, r)
	var inner := r - 2.5
	var rim := r - 0.5
	for y in diameter:
		for x in diameter:
			var d := Vector2(float(x) + 0.5, float(y) + 0.5).distance_to(center)
			if d <= inner:
				img.set_pixel(x, y, color)
			elif d <= rim:
				img.set_pixel(x, y, Color(1, 1, 1, 0.9))
	return ImageTexture.create_from_image(img)


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
	var h := int(_hours.value)
	var preview := MiningManager.preview_reward(h)
	_hours_lab.text = "%sh" % h
	_preview_chip.text = "%s projected" % preview


func _populate() -> void:
	var c := GameManager.active_character
	var level := maxi(1, int(c.get("level", 1)))
	var spf := StardustEconomy.stardust_per_fuel(level)
	var rate_per_hour := int(
		round(float(spf) * StardustEconomy.MINING_EFFICIENCY * MINUTES_PER_HOUR)
	)
	_balance_lab.text = str(
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST)
	)
	_stat_level.text = str(level)
	_stat_rate.text = "%s/h" % rate_per_hour
	_stat_max.text = str(MiningManager.preview_reward(12))
	_refresh_idle_preview()

	var mining := MiningManager.is_mining()
	var ready := MiningManager.is_ready()
	var rem := MiningManager.remaining_ms()
	var reward := MiningManager.committed_reward()

	_idle_box.visible = not mining
	_busy_box.visible = mining and not ready
	_ready_box.visible = ready
	var locked := _busy or MiningManager.is_mutation_locked()
	_start_btn.disabled = locked or TutorialManager.blocks_mining_start()
	if TutorialManager.blocks_mining_start():
		_start_btn.tooltip_text = "Finish or skip the tutorial before deploying the mining drone"
	else:
		_start_btn.tooltip_text = ""
	_abort_btn.disabled = locked
	_collect_btn.disabled = locked

	var phase := "idle"
	if ready:
		phase = "ready"
	elif mining:
		phase = "busy"

	if not mining:
		_set_hero_icon("pickaxe", ClientUi.MUTED)
		_hero_title.text = "Deploy Mining Drone"
		_hero_title.add_theme_color_override("font_color", ClientUi.TEXT)
		_hero_sub.text = "Set your drone to mine a stardust node. The longer it runs, the more you collect — yield scales with your level."
		_set_glow(Color(0, 0, 0, 0), false)
	elif ready:
		_set_hero_icon("sparkles", Color("#4ADE80"))
		_hero_title.text = "NODE READY!"
		_hero_title.add_theme_color_override("font_color", Color("#4ADE80"))
		_hero_sub.text = "Your drone finished mining a stardust node."
		_ready_reward.text = "+%s" % reward
		_set_glow(Color(0.13, 0.77, 0.37, 0.35), true)
	else:
		_set_hero_icon("pickaxe", Color("#F59E0B"))
		_hero_title.text = "Mining in Progress"
		_hero_title.add_theme_color_override("font_color", ClientUi.TEXT)
		_hero_sub.text = "Your drone is harvesting a stardust node..."
		_remain_lab.text = "⏱  %s" % _format_remaining(rem)
		_reward_lab.text = str(reward)
		var total_ms := float(MiningManager.job_duration_ms())
		if total_ms <= 1.0:
			total_ms = maxf(1.0, float(rem + 1))
		var elapsed := total_ms - float(rem)
		_progress.value = clampf(elapsed / total_ms * 100.0, 0.0, 100.0)
		_set_glow(Color(0.96, 0.62, 0.04, 0.22), true)

	if phase != _last_phase:
		_last_phase = phase
		_restart_emoji_motion(phase)

	if TutorialManager.blocks_mining_start() and not mining:
		if _status.text.is_empty() or _status.text.begins_with("Ship Busy") or _status.text.begins_with("Cantina") or _status.text.begins_with("Tutorial"):
			_set_status("Tutorial — finish or skip onboarding before deploying the mining drone.", ClientUi.MUTED)
	elif MissionManager.has_active_mission() and not mining:
		if _status.text.is_empty() or _status.text.begins_with("Ship Busy") or _status.text.begins_with("Cantina") or _status.text.begins_with("Tutorial"):
			_set_status("Ship Busy — finish or claim your Cantina mission before deploying the mining drone.", ClientUi.DANGER)
	elif _status.text.begins_with("Ship Busy") or _status.text.begins_with("Cantina") or _status.text.begins_with("Tutorial"):
		_set_status("", ClientUi.MUTED)


func _set_hero_icon(icon_id: String, tint: Color, size: float = 72.0) -> void:
	if _hero_icon == null:
		return
	_hero_icon.texture = UiIcon.texture(icon_id)
	_hero_icon.custom_minimum_size = Vector2(size, size)
	UiIcon.set_tint(_hero_icon, tint)


func _restart_emoji_motion(phase: String) -> void:
	if _emoji_tween != null and _emoji_tween.is_valid():
		_emoji_tween.kill()
	_hero_icon_host.rotation = 0.0
	_hero_icon_host.position = Vector2.ZERO
	_hero_icon_host.scale = Vector2.ONE
	# Pivot at visual center so rotate/bob reads like Framer Motion.
	var sz := _hero_wrap.size
	if sz.x < 1.0 or sz.y < 1.0:
		sz = _hero_wrap.custom_minimum_size
	_hero_icon_host.pivot_offset = sz * 0.5
	_emoji_tween = _hero_icon_host.create_tween().set_loops()
	match phase:
		"idle":
			_emoji_tween.tween_property(_hero_icon_host, "rotation", TAU, 20.0).from(0.0)
		"busy":
			_emoji_tween.tween_property(_hero_icon_host, "position:y", -8.0, 1.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
			_emoji_tween.tween_property(_hero_icon_host, "position:y", 0.0, 1.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		"ready":
			_emoji_tween.tween_property(_hero_icon_host, "scale", Vector2(1.15, 1.15), 0.4).set_trans(Tween.TRANS_SINE)
			_emoji_tween.parallel().tween_property(_hero_icon_host, "rotation", deg_to_rad(5.0), 0.4)
			_emoji_tween.tween_property(_hero_icon_host, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_SINE)
			_emoji_tween.parallel().tween_property(_hero_icon_host, "rotation", deg_to_rad(-5.0), 0.4)
			_emoji_tween.tween_property(_hero_icon_host, "rotation", 0.0, 0.2)


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
	var total := int(ceil(float(ms) / MILLISECONDS_PER_SECOND))
	var seconds_per_hour := SECONDS_PER_MINUTE * MINUTES_PER_HOUR_INT
	var h := int(total / seconds_per_hour)
	var m := int((total % seconds_per_hour) / SECONDS_PER_MINUTE)
	var s := total % 60
	if h > 0:
		return "%sh %sm %ss" % [h, m, s]
	if m > 0:
		return "%sm %ss" % [m, s]
	return "%ss" % s


func _on_start() -> void:
	if _busy or MiningManager.is_mutation_locked():
		return
	if TutorialManager.blocks_mining_start():
		Notify.blocked("Finish or skip the tutorial before deploying the mining drone")
		return
	if MissionManager.has_active_mission():
		Notify.blocked("Ship busy", "Finish or claim your mission before deploying the mining drone")
		return
	_busy = true
	_start_btn.disabled = true
	_set_status("Starting…", ClientUi.MUTED)
	var hours := int(_hours.value)
	var res: Dictionary = await MiningManager.start(hours)
	_busy = false
	if not res.ok:
		_set_status(_mining_error_text(res, "StartMining failed"), ClientUi.DANGER)
		if not Notify.from_result(res):
			pass
	else:
		var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
		var patch: Variant = data.get("patch", {})
		var gained := 0
		if typeof(patch) == TYPE_DICTIONARY:
			gained = int(patch.get("mining_reward", 0))
		if gained <= 0 and typeof(data.get("mining", null)) == TYPE_DICTIONARY:
			gained = int((data.mining as Dictionary).get("mining_reward", 0))
		if gained <= 0:
			gained = MiningManager.committed_reward()
		if gained <= 0:
			gained = MiningManager.preview_reward(hours)
		var shown_hours := MiningManager.job_hours()
		if shown_hours <= 0:
			shown_hours = hours
		_set_status("Mining started! Collect %s Stardust in %sh." % [gained, shown_hours], GameData.STARDUST_COLOR)
	_populate()


func _on_collect() -> void:
	if _busy or MiningManager.is_mutation_locked():
		return
	_busy = true
	_collect_btn.disabled = true
	_set_status("Collecting…", ClientUi.MUTED)
	var res: Dictionary = await MiningManager.collect()
	_busy = false
	if not res.ok:
		_set_status(_mining_error_text(res, "CollectMining failed"), ClientUi.DANGER)
	else:
		var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
		_set_status(
			"Node collected! +%s Stardust harvested." % str(data.get("stardust_gained", 0)),
			Color("#4ADE80")
		)
	_populate()


func _on_cancel() -> void:
	if _busy or MiningManager.is_mutation_locked():
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
		_set_status(_mining_error_text(res, "Cancel failed"), ClientUi.DANGER)
	_populate()


func _mining_error_text(res: Dictionary, fallback: String) -> String:
	var code := str(res.get("code", ""))
	if code == "NODE_SESSION_UNAVAILABLE" or (
		code == GameApiClient.CODE_UNAUTHORIZED and AuthManager != null and AuthManager.is_logged_in()
	):
		return "Mining is reconnecting to the gameplay server. Try again."
	if code == "MINING_BUSY":
		return "Wait for the current mining request to finish."
	if code == "MINING_NOT_ACTIVE" or code == "ALREADY_ABORTED":
		return "No active mining job."
	if code == "MINING_READY_COLLECT":
		return "Mining finished — collect the node instead of aborting."
	var msg := str(res.get("error", "")).strip_edges()
	if msg.to_lower() == "not logged in" and AuthManager != null and AuthManager.is_logged_in():
		return "Mining is reconnecting to the gameplay server. Try again."
	return msg if not msg.is_empty() else fallback


func _set_status(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)
