extends Control
## Nebula Casino — mirrors web CasinoPage (sealed nova · Stardust Dice · Stardust Wheel).

const NOVA_CASINO_OPEN := false
const DICE_FACES := ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"]
const DICE_ROLL_S := 0.9
const WHEEL_SPIN_S := 5.4
const WHEEL_EXTRA_TURNS := 7

var _balance_sd: Label
var _balance_nova: Label
var _max_bet_lab: Label
var _status: Label
var _dice_bet: SpinBox
var _dice_max_meta: Label
var _dice_face: Label
var _dice_outcome: Label
var _dice_tray: PanelContainer
var _dice_glow: PanelContainer
var _wheel_bet: SpinBox
var _wheel_max_meta: Label
var _wheel_disc: CasinoWheelDisc
var _wheel_outcome: Label
var _dice_btns: Array[Button] = []
var _wheel_btn: Button
var _dice_max_btn: Button
var _wheel_max_btn: Button
var _busy := false
var _dice_roll_tween: Tween
var _dice_face_timer: Timer
var _wheel_degrees := 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	await MissionManager.refresh_character()
	_sync_bets(true)
	_populate()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "cantina"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(scroll)

	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)

	var root := VBoxContainer.new()
	root.custom_minimum_size.x = 720
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 14)
	center.add_child(root)

	# Header — web centered title + tagline + chips
	var head := VBoxContainer.new()
	head.add_theme_constant_override("separation", 4)
	root.add_child(head)

	var title := Label.new()
	title.text = "⚄  Nebula Casino"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	head.add_child(title)

	var tag := Label.new()
	tag.text = "Risk it for the glittering prize. The house always remembers."
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.add_theme_font_size_override("font_size", 11)
	tag.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(tag)
	head.add_child(tag)

	var chips := HBoxContainer.new()
	chips.alignment = BoxContainer.ALIGNMENT_CENTER
	chips.add_theme_constant_override("separation", 10)
	head.add_child(chips)

	var sd_chip := PanelContainer.new()
	sd_chip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.72), Color(0.35, 0.40, 0.48, 0.50), 8, 1
	))
	chips.add_child(sd_chip)
	_balance_sd = Label.new()
	_balance_sd.add_theme_font_size_override("font_size", 13)
	_balance_sd.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(_balance_sd)
	sd_chip.add_child(_balance_sd)

	var nova_chip := PanelContainer.new()
	nova_chip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.96, 0.62, 0.04, 0.08), Color(0.96, 0.62, 0.04, 0.30), 8, 1
	))
	chips.add_child(nova_chip)
	_balance_nova = Label.new()
	_balance_nova.add_theme_font_size_override("font_size", 13)
	_balance_nova.add_theme_color_override("font_color", Color("#FCD34D"))
	ClientUi.apply_display_font(_balance_nova)
	nova_chip.add_child(_balance_nova)

	_max_bet_lab = Label.new()
	_max_bet_lab.add_theme_font_size_override("font_size", 10)
	_max_bet_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_max_bet_lab)
	chips.add_child(_max_bet_lab)

	if not NOVA_CASINO_OPEN:
		root.add_child(_make_sealed_banner())

	var games := HBoxContainer.new()
	games.alignment = BoxContainer.ALIGNMENT_CENTER
	games.add_theme_constant_override("separation", 14)
	root.add_child(games)
	games.add_child(_make_dice_card())
	games.add_child(_make_wheel_card())

	_status = ClientUi.make_status()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(_status)

	var disclaimer := Label.new()
	disclaimer.text = (
		"Nova Crystal bets are capped at 100 per play. Play responsibly, operative."
		if NOVA_CASINO_OPEN
		else "Earn Nova from Weekly Ops & daily login — don't gamble what the void won't refill."
	)
	disclaimer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	disclaimer.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	disclaimer.add_theme_font_size_override("font_size", 10)
	disclaimer.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.70))
	ClientUi.apply_body_font(disclaimer)
	root.add_child(disclaimer)


func _make_sealed_banner() -> PanelContainer:
	var sealed := PanelContainer.new()
	sealed.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.08, 0.06, 0.03, 0.96), Color(0.96, 0.62, 0.04, 0.25), 12, 1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	sealed.add_child(row)
	var gem := Label.new()
	gem.text = "💎"
	gem.add_theme_font_size_override("font_size", 28)
	row.add_child(gem)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 2)
	row.add_child(col)
	var t := Label.new()
	t.text = "Crystal tables sealed"
	t.add_theme_font_size_override("font_size", 13)
	t.add_theme_color_override("font_color", Color("#FDE68A"))
	ClientUi.apply_display_font(t)
	col.add_child(t)
	var b := Label.new()
	b.text = "Nova Crystal games are locked until the Crystal Store is live — they were minting hard currency. Stardust games below are still open."
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.add_theme_font_size_override("font_size", 11)
	b.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(b)
	col.add_child(b)
	return sealed


func _make_dice_card() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(360, 0)
	panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.05, 0.09, 0.96), Color(GameData.STARDUST_COLOR, 0.35), 14, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 6)
	col.add_child(head)
	var t := Label.new()
	t.text = "✦  Stardust Dice"
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_theme_font_size_override("font_size", 13)
	t.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(t)
	head.add_child(t)
	_dice_max_meta = Label.new()
	_dice_max_meta.add_theme_font_size_override("font_size", 9)
	_dice_max_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_dice_max_meta)
	head.add_child(_dice_max_meta)

	var rules := Label.new()
	rules.text = "Roll a die. Call High (4–6) or Low (1–3) — call it right to double your stardust."
	rules.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rules.add_theme_font_size_override("font_size", 11)
	rules.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(rules)
	col.add_child(rules)

	# Felt tray — larger die stage with soft stardust glow (web h-16, we lean into Godot polish).
	_dice_tray = PanelContainer.new()
	_dice_tray.custom_minimum_size = Vector2(0, 148)
	_dice_tray.add_theme_stylebox_override("panel", _dice_tray_style(Color(GameData.STARDUST_COLOR, 0.28)))
	col.add_child(_dice_tray)

	var tray_inner := Control.new()
	tray_inner.custom_minimum_size = Vector2(0, 140)
	tray_inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dice_tray.add_child(tray_inner)

	_dice_glow = PanelContainer.new()
	_dice_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dice_glow.set_anchors_preset(PRESET_CENTER)
	_dice_glow.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_dice_glow.grow_vertical = Control.GROW_DIRECTION_BOTH
	_dice_glow.offset_left = -54
	_dice_glow.offset_right = 54
	_dice_glow.offset_top = -54
	_dice_glow.offset_bottom = 54
	_dice_glow.add_theme_stylebox_override("panel", _dice_glow_style(Color(GameData.STARDUST_COLOR, 0.18)))
	tray_inner.add_child(_dice_glow)

	var die_col := VBoxContainer.new()
	die_col.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	die_col.alignment = BoxContainer.ALIGNMENT_CENTER
	die_col.add_theme_constant_override("separation", 4)
	die_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tray_inner.add_child(die_col)

	_dice_face = Label.new()
	_dice_face.text = "⚄"
	_dice_face.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dice_face.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_dice_face.add_theme_font_size_override("font_size", 84)
	_dice_face.add_theme_color_override("font_color", Color(0.92, 0.94, 0.98, 0.92))
	_dice_face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	die_col.add_child(_dice_face)

	_dice_outcome = Label.new()
	_dice_outcome.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dice_outcome.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dice_outcome.add_theme_font_size_override("font_size", 12)
	_dice_outcome.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_dice_outcome)
	die_col.add_child(_dice_outcome)

	var bet_row := HBoxContainer.new()
	bet_row.add_theme_constant_override("separation", 8)
	col.add_child(bet_row)
	_dice_bet = SpinBox.new()
	_dice_bet.min_value = 1
	_dice_bet.step = 1
	_dice_bet.custom_minimum_size.x = 96
	_dice_bet.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bet_row.add_child(_dice_bet)
	_dice_max_btn = Button.new()
	_dice_max_btn.text = "Max"
	ClientUi.apply_ghost_button(_dice_max_btn)
	_dice_max_btn.pressed.connect(func() -> void:
		_dice_bet.value = mini(float(CasinoManager.max_bet()), float(GameManager.active_character.get("stardust", 0)))
	)
	bet_row.add_child(_dice_max_btn)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	col.add_child(row)
	var low := Button.new()
	low.text = "Low (1–3)"
	low.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(low)
	low.pressed.connect(func() -> void: _play_dice("low"))
	row.add_child(low)
	_dice_btns.append(low)
	var high := Button.new()
	high.text = "High (4–6)"
	high.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(high)
	high.pressed.connect(func() -> void: _play_dice("high"))
	row.add_child(high)
	_dice_btns.append(high)
	return panel


func _dice_tray_style(border: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.04, 0.03, 0.08, 0.92)
	s.border_color = border
	s.set_border_width_all(1)
	s.set_corner_radius_all(14)
	s.content_margin_left = 10
	s.content_margin_right = 10
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	s.shadow_color = Color(GameData.STARDUST_COLOR, 0.18)
	s.shadow_size = 10
	s.shadow_offset = Vector2(0, 2)
	return s


func _dice_glow_style(fill: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = fill
	s.set_corner_radius_all(999)
	s.shadow_color = Color(fill.r, fill.g, fill.b, mini(0.55, fill.a * 2.2))
	s.shadow_size = 22
	return s


func _set_dice_ambiance(tint: Color, glow_a: float = 0.18) -> void:
	if is_instance_valid(_dice_tray):
		_dice_tray.add_theme_stylebox_override("panel", _dice_tray_style(Color(tint, 0.35)))
	if is_instance_valid(_dice_glow):
		_dice_glow.add_theme_stylebox_override("panel", _dice_glow_style(Color(tint, glow_a)))


func _make_wheel_card() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(340, 0)
	panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.05, 0.08, 0.96), Color("#F59E0B", 0.35), 14, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 6)
	col.add_child(head)
	var t := Label.new()
	t.text = "✦  Stardust Wheel"
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_theme_font_size_override("font_size", 13)
	t.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(t)
	head.add_child(t)
	_wheel_max_meta = Label.new()
	_wheel_max_meta.add_theme_font_size_override("font_size", 9)
	_wheel_max_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_wheel_max_meta)
	head.add_child(_wheel_max_meta)

	var rules := Label.new()
	rules.text = "Spin for a multiplier. Bust loses your stake; 2×–25× pays net profit of (mult−1)×bet."
	rules.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rules.add_theme_font_size_override("font_size", 11)
	rules.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(rules)
	col.add_child(rules)

	var bet_row := HBoxContainer.new()
	bet_row.add_theme_constant_override("separation", 8)
	col.add_child(bet_row)
	_wheel_bet = SpinBox.new()
	_wheel_bet.min_value = 1
	_wheel_bet.step = 1
	_wheel_bet.custom_minimum_size.x = 96
	_wheel_bet.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bet_row.add_child(_wheel_bet)
	_wheel_max_btn = Button.new()
	_wheel_max_btn.text = "Max"
	ClientUi.apply_ghost_button(_wheel_max_btn)
	_wheel_max_btn.pressed.connect(func() -> void:
		_wheel_bet.value = mini(float(CasinoManager.max_bet()), float(GameManager.active_character.get("stardust", 0)))
	)
	bet_row.add_child(_wheel_max_btn)
	_wheel_btn = Button.new()
	_wheel_btn.text = "Spin"
	ClientUi.apply_tinted_painted_button(_wheel_btn, Color("#F59E0B"))
	_wheel_btn.pressed.connect(_play_wheel)
	bet_row.add_child(_wheel_btn)

	var stage := VBoxContainer.new()
	stage.add_theme_constant_override("separation", 4)
	col.add_child(stage)

	var pointer := Label.new()
	pointer.text = "▼"
	pointer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pointer.add_theme_font_size_override("font_size", 14)
	pointer.add_theme_color_override("font_color", Color("#FBBF24"))
	ClientUi.apply_display_font(pointer)
	stage.add_child(pointer)

	var disc_wrap := CenterContainer.new()
	disc_wrap.custom_minimum_size = Vector2(0, 110)
	stage.add_child(disc_wrap)
	_wheel_disc = CasinoWheelDisc.new()
	_wheel_disc.custom_minimum_size = Vector2(96, 96)
	disc_wrap.add_child(_wheel_disc)

	var legend := HBoxContainer.new()
	legend.alignment = BoxContainer.ALIGNMENT_CENTER
	legend.add_theme_constant_override("separation", 4)
	stage.add_child(legend)
	for tier in CasinoWheelDisc.TIERS:
		if int(tier.get("mult", 0)) < 2:
			continue
		var chip := PanelContainer.new()
		chip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.04, 0.05, 0.07, 0.55), Color(0.35, 0.40, 0.48, 0.40), 4, 1
		))
		legend.add_child(chip)
		var chip_lab := Label.new()
		chip_lab.text = str(tier.get("label", ""))
		chip_lab.add_theme_font_size_override("font_size", 9)
		chip_lab.add_theme_color_override("font_color", tier.get("color", ClientUi.MUTED))
		ClientUi.apply_display_font(chip_lab)
		chip.add_child(chip_lab)

	_wheel_outcome = Label.new()
	_wheel_outcome.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_wheel_outcome.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_wheel_outcome.add_theme_font_size_override("font_size", 12)
	_wheel_outcome.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_wheel_outcome)
	col.add_child(_wheel_outcome)
	return panel


func _sync_bets(reset_defaults := false) -> void:
	var mx := CasinoManager.max_bet()
	_dice_bet.max_value = mx
	_wheel_bet.max_value = mx
	if reset_defaults:
		# Web defaults to Math.min(100, MAX).
		var starter := mini(100, mx)
		_dice_bet.value = starter
		_wheel_bet.value = starter
	else:
		_dice_bet.value = mini(_dice_bet.value, mx)
		_wheel_bet.value = mini(_wheel_bet.value, mx)
	if _dice_max_meta:
		_dice_max_meta.text = "50% · 2× · max %s" % _fmt(mx)
	if _wheel_max_meta:
		_wheel_max_meta.text = "up to 25× · max %s" % _fmt(mx)


func _populate() -> void:
	var c := GameManager.active_character
	_balance_sd.text = "✦  %s" % _fmt(int(c.get("stardust", 0)))
	_balance_nova.text = "💎  %s" % _fmt(int(c.get("nova_crystals", 0)))
	_max_bet_lab.text = "Max stardust bet · %s ✦ (scales with SD/F)" % _fmt(CasinoManager.max_bet())
	_sync_bets(false)


func _set_controls_enabled(on: bool) -> void:
	for btn in _dice_btns:
		if is_instance_valid(btn):
			btn.disabled = not on
	if is_instance_valid(_wheel_btn):
		_wheel_btn.disabled = not on
		_wheel_btn.text = "Spin" if on else "Spinning…"
	if is_instance_valid(_dice_max_btn):
		_dice_max_btn.disabled = not on
	if is_instance_valid(_wheel_max_btn):
		_wheel_max_btn.disabled = not on
	_dice_bet.editable = on
	_wheel_bet.editable = on


func _play_dice(choice: String) -> void:
	if _busy:
		return
	var bet := maxi(1, int(_dice_bet.value))
	var bal := int(GameManager.active_character.get("stardust", 0))
	if bal < bet:
		_dice_outcome.text = "Not enough stardust"
		_dice_outcome.add_theme_color_override("font_color", ClientUi.DANGER)
		return
	_busy = true
	_set_controls_enabled(false)
	_dice_outcome.text = ""
	_dice_face.text = DICE_FACES[0]
	_dice_face.add_theme_color_override("font_color", Color(0.96, 0.97, 1.0, 1.0))
	_set_dice_ambiance(GameData.STARDUST_COLOR, 0.28)
	_set_status("Rolling…", ClientUi.MUTED)
	_start_dice_roll_loop()
	await get_tree().create_timer(DICE_ROLL_S).timeout
	var res: Dictionary = await CasinoManager.settle_dice(bet, choice)
	_stop_dice_roll_loop()
	await get_tree().create_timer(0.2).timeout
	await _reveal_dice_result(res, bet)
	_busy = false
	_set_controls_enabled(true)


func _play_wheel() -> void:
	if _busy:
		return
	var bet := maxi(1, int(_wheel_bet.value))
	var bal := int(GameManager.active_character.get("stardust", 0))
	if bal < bet:
		_wheel_outcome.text = "Not enough stardust"
		_wheel_outcome.add_theme_color_override("font_color", ClientUi.DANGER)
		return
	_busy = true
	_set_controls_enabled(false)
	_wheel_outcome.text = ""
	_set_status("Spinning…", ClientUi.MUTED)
	_wheel_disc.set_glowing(true)
	var res: Dictionary = await CasinoManager.settle_wheel(bet)
	if not res.ok:
		_wheel_disc.set_glowing(false)
		_busy = false
		_set_controls_enabled(true)
		_show_error(res)
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var outcome: Dictionary = data.get("outcome", {}) if typeof(data.get("outcome", {})) == TYPE_DICTIONARY else {}
	var mult := int(outcome.get("mult", outcome.get("payout_mult", 0)))
	var delta := _wheel_disc.spin_delta_degrees(mult, _wheel_degrees, WHEEL_EXTRA_TURNS)
	var target := _wheel_degrees + delta
	var tw := create_tween()
	# Closest to web cubic-bezier [0.08, 0.82, 0.05, 1] — snappy then long coast.
	tw.tween_method(_set_wheel_rotation, _wheel_degrees, target, WHEEL_SPIN_S) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	await tw.finished
	_wheel_degrees = target
	_wheel_disc.set_glowing(false)
	await _reveal_wheel_result(res, mult, bet)
	_busy = false
	_set_controls_enabled(true)


func _set_wheel_rotation(deg: float) -> void:
	_wheel_degrees = deg
	if is_instance_valid(_wheel_disc):
		_wheel_disc.rotation_degrees = deg


func _start_dice_roll_loop() -> void:
	if _dice_roll_tween != null and _dice_roll_tween.is_valid():
		_dice_roll_tween.kill()
	if _dice_face_timer == null:
		_dice_face_timer = Timer.new()
		_dice_face_timer.wait_time = 0.12
		_dice_face_timer.timeout.connect(_cycle_dice_face)
		add_child(_dice_face_timer)
	# Pivot from glyph center so the wobble reads as a tumble, not a corner flail.
	_dice_face.pivot_offset = _dice_face.size * 0.5
	if _dice_face.pivot_offset == Vector2.ZERO:
		_dice_face.pivot_offset = Vector2(48, 48)
	_dice_face.rotation_degrees = 0.0
	_dice_face.scale = Vector2.ONE
	_cycle_dice_face()
	_dice_face_timer.start()
	# Web StardustDice: rotate [0, -30, 30, -20, 20, 0] + soft scale pulse over 0.45s.
	_dice_roll_tween = create_tween().set_loops()
	_dice_roll_tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_dice_roll_tween.tween_property(_dice_face, "rotation_degrees", -18.0, 0.09)
	_dice_roll_tween.parallel().tween_property(_dice_face, "scale", Vector2(1.08, 1.08), 0.09)
	_dice_roll_tween.tween_property(_dice_face, "rotation_degrees", 18.0, 0.12)
	_dice_roll_tween.tween_property(_dice_face, "rotation_degrees", -12.0, 0.09)
	_dice_roll_tween.parallel().tween_property(_dice_face, "scale", Vector2.ONE, 0.09)
	_dice_roll_tween.tween_property(_dice_face, "rotation_degrees", 12.0, 0.09)
	_dice_roll_tween.tween_property(_dice_face, "rotation_degrees", 0.0, 0.06)


func _cycle_dice_face() -> void:
	if is_instance_valid(_dice_face):
		_dice_face.text = DICE_FACES[randi() % DICE_FACES.size()]


func _stop_dice_roll_loop() -> void:
	if _dice_face_timer != null:
		_dice_face_timer.stop()
	if _dice_roll_tween != null and _dice_roll_tween.is_valid():
		_dice_roll_tween.kill()
	_dice_roll_tween = null
	if not is_instance_valid(_dice_face):
		return
	# Ease out of the tumble instead of snapping flat.
	var settle := _dice_face.create_tween()
	settle.set_parallel(true)
	settle.tween_property(_dice_face, "rotation_degrees", 0.0, 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	settle.tween_property(_dice_face, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)


func _reveal_dice_result(res: Dictionary, bet: int) -> void:
	if not res.ok:
		_show_error(res)
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var outcome: Dictionary = data.get("outcome", {}) if typeof(data.get("outcome", {})) == TYPE_DICTIONARY else {}
	var dice_n := clampi(int(outcome.get("dice", 1)), 1, 6)
	var won := bool(outcome.get("won", false))
	var dsd := int(data.get("delta_stardust", bet if won else -bet))
	_dice_face.text = DICE_FACES[dice_n - 1]
	_dice_face.add_theme_color_override("font_color", ClientUi.SUCCESS if won else ClientUi.DANGER)
	_set_dice_ambiance(ClientUi.SUCCESS if won else ClientUi.DANGER, 0.32 if won else 0.16)
	if won:
		_dice_outcome.text = "Rolled %s — +%s ✦" % [dice_n, _fmt(absi(dsd))]
	else:
		_dice_outcome.text = "Rolled %s — −%s ✦" % [dice_n, _fmt(bet)]
	_dice_outcome.add_theme_color_override("font_color", ClientUi.SUCCESS if won else ClientUi.DANGER)
	# Soft land on the final face — skip the big bounce/shake on the die itself.
	await get_tree().create_timer(0.12).timeout
	await _pop_result(_dice_outcome, won)
	if won:
		_burst_fx(self, false)
		AudioManager.play_ui("equip")
	_set_status("", ClientUi.MUTED)
	_populate()
	await get_tree().create_timer(0.55).timeout
	if is_instance_valid(_dice_face):
		_dice_face.add_theme_color_override("font_color", Color(0.92, 0.94, 0.98, 0.92))
	_set_dice_ambiance(GameData.STARDUST_COLOR, 0.18)


func _reveal_wheel_result(res: Dictionary, mult: int, bet: int) -> void:
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var dsd := int(data.get("delta_stardust", int(round(float(bet) * float(mult - 1)))))
	var tier := _wheel_disc.tier_for_mult(mult)
	var tint: Color = tier.get("color", ClientUi.GOLD)
	var text := ""
	if mult == 0:
		text = "Lost %s ✦" % _fmt(bet)
	elif mult == 1:
		text = "Push — stake returned"
	else:
		text = "+%s ✦ (%s)" % [_fmt(absi(dsd)), str(tier.get("label", ""))]
	_wheel_outcome.text = text
	_wheel_outcome.add_theme_color_override("font_color", tint)
	await _pop_result(_wheel_outcome, mult >= 2)
	if mult >= 10:
		_burst_fx(self, true)
		AudioManager.play_ui("equip")
	elif mult >= 2:
		_burst_fx(self, false)
		AudioManager.play_ui("equip")
	_set_status("", ClientUi.MUTED)
	_populate()


func _show_error(res: Dictionary) -> void:
	_set_status(str(res.get("error", "Wager failed")), ClientUi.DANGER)
	_populate()


func _pop_result(node: Control, won: bool) -> void:
	if node == null or not is_instance_valid(node):
		return
	node.pivot_offset = node.size * 0.5
	if node.pivot_offset == Vector2.ZERO:
		node.pivot_offset = Vector2(40, 12)
	node.scale = Vector2(0.35, 0.35)
	node.modulate.a = 0.0
	var tw := node.create_tween()
	tw.tween_property(node, "modulate:a", 1.0, 0.12)
	if won:
		tw.parallel().tween_property(node, "scale", Vector2(1.28, 1.28), 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(node, "scale", Vector2.ONE, 0.16)
	else:
		tw.parallel().tween_property(node, "scale", Vector2.ONE, 0.26).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.parallel().tween_property(node, "rotation_degrees", -8.0, 0.06)
		tw.tween_property(node, "rotation_degrees", 8.0, 0.08)
		tw.tween_property(node, "rotation_degrees", -5.0, 0.06)
		tw.tween_property(node, "rotation_degrees", 0.0, 0.06)
	await tw.finished


func _burst_fx(host: Control, big: bool) -> void:
	## Closest equivalent to web casinoFx burstWin / burstBig.
	if host == null or not is_instance_valid(host):
		return
	var layer := Control.new()
	layer.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.z_index = 200
	host.add_child(layer)
	var colors: Array = [Color("#22C55E"), Color("#86EFAC"), Color("#FBBF24"), Color.WHITE]
	if big:
		colors = [Color("#A855F7"), Color("#22C55E"), Color("#FBBF24"), Color("#3B82F6"), Color("#F97316"), Color.WHITE]
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var count := 110 if big else 70
	for i in count:
		var speck := ColorRect.new()
		speck.custom_minimum_size = Vector2(rng.randf_range(3, 8), rng.randf_range(4, 11))
		speck.size = speck.custom_minimum_size
		speck.color = colors[i % colors.size()]
		speck.mouse_filter = Control.MOUSE_FILTER_IGNORE
		layer.add_child(speck)
		var start := Vector2(host.size.x * 0.5 + rng.randf_range(-50, 50), host.size.y * 0.55)
		speck.position = start
		speck.rotation = rng.randf_range(-1.0, 1.0)
		var end := start + Vector2(rng.randf_range(-260, 260), rng.randf_range(-40, 220))
		var tw := speck.create_tween().set_parallel(true)
		tw.tween_property(speck, "position", end, rng.randf_range(0.65, 1.15)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(speck, "modulate:a", 0.0, 0.85).set_delay(0.2)
		tw.tween_property(speck, "rotation", speck.rotation + rng.randf_range(-3, 3), 1.0)
	var cleanup := host.create_tween()
	cleanup.tween_interval(1.35)
	cleanup.tween_callback(layer.queue_free)


func _set_status(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)


func _fmt(n: int) -> String:
	var s := str(absi(n))
	var out := ""
	var i := 0
	for c_i in range(s.length() - 1, -1, -1):
		if i > 0 and i % 3 == 0:
			out = "," + out
		out = s[c_i] + out
		i += 1
	return ("-" if n < 0 else "") + out
