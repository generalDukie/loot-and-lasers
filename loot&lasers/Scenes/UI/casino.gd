extends Control
## Nebula Casino — casino_v2: Galactic Dice, Stardust Wheel, Crystal Refining, Smuggler's Cache.

const DICE_FACES := ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"]
const DICE_TUMBLE_S := 1.5
const WHEEL_SPIN_S := 2.0
const WHEEL_EXTRA_TURNS := 4
const SD_QUICK_PCTS := [0.10, 0.25, 0.50, 1.0]
const NOVA_PRESETS := [100, 250, 500, 750, 1000]
const REFINING_LADDER := [
	{"stage": 1, "cumulative_pct": 40.0, "mult": 1.25},
	{"stage": 2, "cumulative_pct": 16.0, "mult": 3.0},
	{"stage": 3, "cumulative_pct": 6.5, "mult": 8.0},
	{"stage": 4, "cumulative_pct": 2.5, "mult": 20.0},
	{"stage": 5, "cumulative_pct": 1.0, "mult": 50.0},
]
const CACHE_COMPOSITION := [
	{"id": "worthless_scrap", "label": "Worthless Scrap", "mult": 0.0, "chance": "4/6"},
	{"id": "damaged_shipment", "label": "Damaged Shipment", "mult": 0.5, "chance": "1/6"},
	{"id": "alluring_contraband", "label": "Alluring Contraband", "mult": 2.5, "chance": "1/6"},
]

const GAME_DICE := "galactic_dice"
const GAME_WHEEL := "stardust_wheel"
const GAME_REFINE := "crystal_refining"
const GAME_CACHE := "smugglers_cache"

var _balance_sd: Label
var _balance_nova: Label
var _limits_lab: Label
var _status: Label
var _nav_btns: Dictionary = {} # game_id -> Button
var _panels: Dictionary = {} # game_id -> Control
var _active_game := GAME_DICE

# Shared stardust wager (one strip for dice + wheel)
var _sd_wager := 0
var _sd_wager_box: VBoxContainer
var _sd_wager_lab: Label
var _sd_wager_edit: LineEdit
var _sd_quick_btns: Array[Button] = []

# Shared nova wager (one strip for refining + cache)
var _nova_wager := 100.0
var _nova_wager_box: VBoxContainer
var _nova_wager_lab: Label
var _nova_wager_edit: LineEdit
var _nova_preset_btns: Array[Button] = []
var _syncing_wager_edit := false
var _sd_edit_ok := true
var _nova_edit_ok := true

# Galactic Dice
var _dice_choice := ""
var _dice_choice_btns: Dictionary = {}
var _dice_roll_btn: Button
var _dice_face_a: Label
var _dice_face_b: Label
var _dice_total_lab: Label
var _dice_outcome: Label
var _dice_tray: PanelContainer
var _dice_glow: PanelContainer
var _dice_skip_btn: Button
var _dice_roll_tween: Tween
var _dice_face_timer: Timer
var _dice_skip_requested := false

# Wheel
var _wheel_spin_btn: Button
var _wheel_disc: CasinoWheelDisc
var _wheel_outcome: Label
var _wheel_degrees := 0.0

# Crystal Refining
var _refine_session_id := ""
var _refine_state: Dictionary = {}
var _refine_ladder_box: VBoxContainer
var _refine_status: Label
var _refine_start_btn: Button
var _refine_collect_btn: Button
var _refine_again_btn: Button
var _refine_new_btn: Button
var _refine_result: Label

# Smuggler's Cache
var _cache_session_id := ""
var _cache_state: Dictionary = {}
var _cache_status: Label
var _cache_start_btn: Button
var _cache_next_btn: Button
var _cache_result: Label
var _cache_crate_btns: Array[Button] = []

var _busy := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	if not CasinoManager.state_changed.is_connected(_on_casino_state):
		CasinoManager.state_changed.connect(_on_casino_state)
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_refresh_balances()
	_refresh_wager_controls()
	_refresh_action_enabled()


func _on_casino_state(_casino: Dictionary) -> void:
	_refresh_nav_badges()
	if _active_game == GAME_REFINE:
		_restore_refine_session()
	elif _active_game == GAME_CACHE:
		_restore_cache_session()


func _boot() -> void:
	_set_status("Loading casino…", ClientUi.MUTED)
	await MissionManager.refresh_character()
	var res: Dictionary = await CasinoManager.load_state()
	if not res.ok:
		_set_status(str(res.get("error", "Failed to load casino")), ClientUi.DANGER)
	# Ambiguous in-flight wager from a prior crash/timeout.
	var pending := CasinoManager.pending_request_id()
	if not pending.is_empty():
		var rec: Dictionary = await CasinoManager.recover(pending)
		if rec.ok:
			var data: Dictionary = rec.data if typeof(rec.data) == TYPE_DICTIONARY else {}
			if bool(data.get("found", false)):
				_set_status("Recovered pending wager.", ClientUi.SUCCESS)
			else:
				_set_status("", ClientUi.MUTED)
		else:
			_set_status(str(rec.get("error", "Recover failed")), ClientUi.WARNING)
	_init_default_wagers()
	_refresh_balances()
	_refresh_wager_controls()
	_refresh_nav_badges()
	_restore_refine_session()
	_restore_cache_session()
	_select_game(GAME_DICE)
	if _status.text == "Loading casino…":
		_set_status("", ClientUi.MUTED)


# ── Build ─────────────────────────────────────────────────────

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
	root.custom_minimum_size.x = 980
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 14)
	center.add_child(root)

	root.add_child(_build_header())
	root.add_child(_build_nav())

	var stage := PanelContainer.new()
	stage.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.05, 0.09, 0.94), Color(0.35, 0.40, 0.48, 0.35), 14, 1
	))
	root.add_child(stage)
	var stage_inner := MarginContainer.new()
	stage_inner.add_theme_constant_override("margin_left", 14)
	stage_inner.add_theme_constant_override("margin_right", 14)
	stage_inner.add_theme_constant_override("margin_top", 12)
	stage_inner.add_theme_constant_override("margin_bottom", 12)
	stage.add_child(stage_inner)
	var stage_col := VBoxContainer.new()
	stage_col.add_theme_constant_override("separation", 10)
	stage_inner.add_child(stage_col)

	_sd_wager_box = _build_sd_wager_row()
	_nova_wager_box = _build_nova_wager_row()
	stage_col.add_child(_sd_wager_box)
	stage_col.add_child(_nova_wager_box)

	_panels[GAME_DICE] = _build_dice_panel()
	_panels[GAME_WHEEL] = _build_wheel_panel()
	_panels[GAME_REFINE] = _build_refine_panel()
	_panels[GAME_CACHE] = _build_cache_panel()
	for id in _panels.keys():
		stage_col.add_child(_panels[id])
		_panels[id].visible = false

	_status = ClientUi.make_status()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(_status)

	var disclaimer := Label.new()
	disclaimer.text = "Play responsibly. Gross payout includes your wager; net is profit or loss."
	disclaimer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	disclaimer.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	disclaimer.add_theme_font_size_override("font_size", 13)
	disclaimer.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.70))
	ClientUi.apply_body_font(disclaimer)
	root.add_child(disclaimer)


func _build_header() -> VBoxContainer:
	var head := VBoxContainer.new()
	head.add_theme_constant_override("separation", 4)

	var title_center := CenterContainer.new()
	title_center.add_child(UiIcon.make_title_row("dice-5", "Nebula Casino", ClientUi.TEXT, 27, 28.0))
	head.add_child(title_center)

	var tag := Label.new()
	tag.text = "Four tables. One house. Outcomes are Node-authoritative."
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.add_theme_font_size_override("font_size", 15)
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
	var sd_row := HBoxContainer.new()
	sd_row.add_theme_constant_override("separation", 6)
	sd_chip.add_child(sd_row)
	sd_row.add_child(CurrencyIcon.make("stardust", 18.0))
	_balance_sd = Label.new()
	_balance_sd.add_theme_font_size_override("font_size", 17)
	_balance_sd.add_theme_color_override("font_color", GameData.STARDUST_COLOR)
	ClientUi.apply_display_font(_balance_sd)
	sd_row.add_child(_balance_sd)

	var nova_chip := PanelContainer.new()
	nova_chip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.96, 0.62, 0.04, 0.08), Color(0.96, 0.62, 0.04, 0.30), 8, 1
	))
	chips.add_child(nova_chip)
	var nova_row := HBoxContainer.new()
	nova_row.add_theme_constant_override("separation", 6)
	nova_chip.add_child(nova_row)
	nova_row.add_child(CurrencyIcon.make("nova", 18.0))
	_balance_nova = Label.new()
	_balance_nova.add_theme_font_size_override("font_size", 17)
	_balance_nova.add_theme_color_override("font_color", Color("#FCD34D"))
	ClientUi.apply_display_font(_balance_nova)
	nova_row.add_child(_balance_nova)

	_limits_lab = Label.new()
	_limits_lab.add_theme_font_size_override("font_size", 13)
	_limits_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_limits_lab)
	chips.add_child(_limits_lab)
	return head


func _build_nav() -> HBoxContainer:
	## Hub-dock style tiles: game name only, tinted like station dock buttons.
	## Stardust games (dice/wheel) = purple; Nova games (refine/cache) = yellow.
	var nav := HBoxContainer.new()
	nav.alignment = BoxContainer.ALIGNMENT_CENTER
	nav.add_theme_constant_override("separation", 8)
	var stardust_tint := GameData.STARDUST_COLOR
	var nova_tint := Color("#FFD700")
	var specs := [
		{"id": GAME_DICE, "title": "Galactic Dice", "tint": stardust_tint},
		{"id": GAME_WHEEL, "title": "Stardust Wheel", "tint": stardust_tint},
		{"id": GAME_REFINE, "title": "Crystal Refining", "tint": nova_tint},
		{"id": GAME_CACHE, "title": "Smuggler's Cache", "tint": nova_tint},
	]
	for s in specs:
		var tint: Color = s.tint
		var title: String = str(s.title)
		var btn := Button.new()
		btn.toggle_mode = true
		btn.focus_mode = Control.FOCUS_NONE
		btn.text = title
		btn.tooltip_text = title
		btn.alignment = HORIZONTAL_ALIGNMENT_CENTER
		btn.clip_text = true
		btn.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		# Equal tiles: shared width via EXPAND_FILL, fixed height for a stable dock row.
		btn.custom_minimum_size = Vector2(0, 52)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_dock_button(btn, tint)
		# Slightly larger than default dock chrome so titles stay readable on one line.
		btn.add_theme_font_size_override("font_size", 13)
		btn.set_meta("nav_title", title)
		btn.set_meta("nav_tint", tint)
		var gid: String = s.id
		btn.pressed.connect(func() -> void: _select_game(gid))
		nav.add_child(btn)
		_nav_btns[gid] = btn
	return nav


func _refresh_nav_badges() -> void:
	for id in _nav_btns.keys():
		var btn: Button = _nav_btns[id]
		var title := str(btn.get_meta("nav_title", btn.tooltip_text))
		var active := not CasinoManager.active_session(id).is_empty()
		# Name only — session activity lives in tooltip so the face stays clean.
		btn.text = title
		btn.tooltip_text = ("%s — active session" % title) if active else title
		btn.clip_text = true
		btn.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		btn.alignment = HORIZONTAL_ALIGNMENT_CENTER

func _build_dice_panel() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)

	col.add_child(_section_title("Galactic Dice", "Two dice. Bet Low (2–6), Seven, or High (8–12).", GameData.STARDUST_COLOR))

	_dice_tray = PanelContainer.new()
	_dice_tray.custom_minimum_size = Vector2(0, 200)
	_dice_tray.add_theme_stylebox_override("panel", _dice_tray_style(Color(GameData.STARDUST_COLOR, 0.28)))
	col.add_child(_dice_tray)

	var tray_inner := Control.new()
	tray_inner.custom_minimum_size = Vector2(0, 190)
	tray_inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dice_tray.add_child(tray_inner)

	_dice_glow = PanelContainer.new()
	_dice_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dice_glow.set_anchors_preset(PRESET_CENTER)
	_dice_glow.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_dice_glow.grow_vertical = Control.GROW_DIRECTION_BOTH
	_dice_glow.offset_left = -90
	_dice_glow.offset_right = 90
	_dice_glow.offset_top = -70
	_dice_glow.offset_bottom = 70
	_dice_glow.add_theme_stylebox_override("panel", _dice_glow_style(Color(GameData.STARDUST_COLOR, 0.18)))
	tray_inner.add_child(_dice_glow)

	var die_col := VBoxContainer.new()
	die_col.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	die_col.alignment = BoxContainer.ALIGNMENT_CENTER
	die_col.add_theme_constant_override("separation", 4)
	die_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tray_inner.add_child(die_col)

	var faces := HBoxContainer.new()
	faces.alignment = BoxContainer.ALIGNMENT_CENTER
	faces.add_theme_constant_override("separation", 24)
	faces.mouse_filter = Control.MOUSE_FILTER_IGNORE
	die_col.add_child(faces)
	_dice_face_a = _make_die_face("⚄")
	_dice_face_b = _make_die_face("⚄")
	faces.add_child(_dice_face_a)
	faces.add_child(_dice_face_b)

	_dice_total_lab = Label.new()
	_dice_total_lab.text = "Total —"
	_dice_total_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dice_total_lab.add_theme_font_size_override("font_size", 18)
	_dice_total_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_dice_total_lab)
	die_col.add_child(_dice_total_lab)

	_dice_outcome = Label.new()
	_dice_outcome.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dice_outcome.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dice_outcome.add_theme_font_size_override("font_size", 16)
	_dice_outcome.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_dice_outcome)
	die_col.add_child(_dice_outcome)

	var choice_row := HBoxContainer.new()
	choice_row.add_theme_constant_override("separation", 8)
	col.add_child(choice_row)
	for c in [
		{"id": "low", "label": "Low — 2×"},
		{"id": "seven", "label": "Seven — 5×"},
		{"id": "high", "label": "High — 2×"},
	]:
		var b := Button.new()
		b.text = c.label
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(b)
		var cid: String = c.id
		b.pressed.connect(func() -> void: _set_dice_choice(cid))
		choice_row.add_child(b)
		_dice_choice_btns[cid] = b

	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 8)
	col.add_child(action_row)
	_dice_roll_btn = Button.new()
	_dice_roll_btn.text = "Roll"
	_dice_roll_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(_dice_roll_btn)
	_dice_roll_btn.pressed.connect(_play_dice)
	action_row.add_child(_dice_roll_btn)
	_dice_skip_btn = Button.new()
	_dice_skip_btn.text = "Skip"
	_dice_skip_btn.visible = false
	ClientUi.apply_ghost_button(_dice_skip_btn)
	_dice_skip_btn.pressed.connect(func() -> void: _dice_skip_requested = true)
	action_row.add_child(_dice_skip_btn)
	return col


func _build_wheel_panel() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	col.add_child(_section_title("Stardust Wheel", "Spin the weighted wheel. Shove returns your wager (net 0).", Color("#F59E0B")))

	var stage := VBoxContainer.new()
	stage.add_theme_constant_override("separation", 4)
	col.add_child(stage)

	var pointer := Label.new()
	pointer.text = "▼"
	pointer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pointer.add_theme_font_size_override("font_size", 19)
	pointer.add_theme_color_override("font_color", Color("#FBBF24"))
	ClientUi.apply_display_font(pointer)
	stage.add_child(pointer)

	var disc_wrap := CenterContainer.new()
	disc_wrap.custom_minimum_size = Vector2(0, 170)
	stage.add_child(disc_wrap)
	_wheel_disc = CasinoWheelDisc.new()
	_wheel_disc.custom_minimum_size = Vector2(148, 148)
	disc_wrap.add_child(_wheel_disc)

	var legend := HBoxContainer.new()
	legend.alignment = BoxContainer.ALIGNMENT_CENTER
	legend.add_theme_constant_override("separation", 4)
	stage.add_child(legend)
	for tier in CasinoWheelDisc.TIERS:
		var chip := PanelContainer.new()
		chip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.04, 0.05, 0.07, 0.55), Color(0.35, 0.40, 0.48, 0.40), 4, 1
		))
		legend.add_child(chip)
		var chip_lab := Label.new()
		chip_lab.text = "%s %d%%" % [str(tier.get("label", "")), int(round(float(tier.get("p", 0.0)) * 100.0))]
		chip_lab.add_theme_font_size_override("font_size", 12)
		chip_lab.add_theme_color_override("font_color", tier.get("color", ClientUi.MUTED))
		ClientUi.apply_display_font(chip_lab)
		chip.add_child(chip_lab)

	_wheel_spin_btn = Button.new()
	_wheel_spin_btn.text = "Spin"
	ClientUi.apply_tinted_painted_button(_wheel_spin_btn, Color("#F59E0B"))
	_wheel_spin_btn.pressed.connect(_play_wheel)
	col.add_child(_wheel_spin_btn)

	_wheel_outcome = Label.new()
	_wheel_outcome.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_wheel_outcome.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_wheel_outcome.add_theme_font_size_override("font_size", 16)
	_wheel_outcome.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_wheel_outcome)
	col.add_child(_wheel_outcome)
	return col


func _build_refine_panel() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	col.add_child(_section_title("Crystal Refining", "Push an unstable crystal through five stages. Collect or risk it.", Color("#FCD34D")))

	var ladder_panel := PanelContainer.new()
	ladder_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.05, 0.04, 0.85), Color(0.96, 0.62, 0.04, 0.28), 10, 1
	))
	col.add_child(ladder_panel)
	_refine_ladder_box = VBoxContainer.new()
	_refine_ladder_box.add_theme_constant_override("separation", 4)
	ladder_panel.add_child(_refine_ladder_box)
	_rebuild_refine_ladder()

	_refine_status = Label.new()
	_refine_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_refine_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_refine_status.add_theme_font_size_override("font_size", 15)
	_refine_status.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_refine_status)
	col.add_child(_refine_status)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	col.add_child(row)
	_refine_start_btn = Button.new()
	_refine_start_btn.text = "Start Refining"
	_refine_start_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_tinted_painted_button(_refine_start_btn, Color("#FCD34D"))
	_refine_start_btn.pressed.connect(_refine_start)
	row.add_child(_refine_start_btn)
	_refine_collect_btn = Button.new()
	_refine_collect_btn.text = "Collect"
	_refine_collect_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(_refine_collect_btn)
	_refine_collect_btn.pressed.connect(_refine_collect)
	row.add_child(_refine_collect_btn)
	_refine_again_btn = Button.new()
	_refine_again_btn.text = "Refine Again"
	_refine_again_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_tinted_painted_button(_refine_again_btn, Color("#F59E0B"))
	_refine_again_btn.pressed.connect(_refine_again)
	row.add_child(_refine_again_btn)
	_refine_new_btn = Button.new()
	_refine_new_btn.text = "Start New Session"
	_refine_new_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(_refine_new_btn)
	_refine_new_btn.pressed.connect(_refine_new_session)
	row.add_child(_refine_new_btn)

	_refine_result = Label.new()
	_refine_result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_refine_result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_refine_result.add_theme_font_size_override("font_size", 16)
	_refine_result.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_refine_result)
	col.add_child(_refine_result)
	return col


func _build_cache_panel() -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	col.add_child(_section_title("Smuggler's Cache", "Six sealed crates. Fixed board composition — pick one.", Color("#A78BFA")))

	var comp := PanelContainer.new()
	comp.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.05, 0.09, 0.85), Color(0.65, 0.55, 0.95, 0.30), 10, 1
	))
	col.add_child(comp)
	var comp_col := VBoxContainer.new()
	comp_col.add_theme_constant_override("separation", 3)
	comp.add_child(comp_col)
	var comp_title := Label.new()
	comp_title.text = "Composition"
	comp_title.add_theme_font_size_override("font_size", 14)
	comp_title.add_theme_color_override("font_color", Color("#C4B5FD"))
	ClientUi.apply_display_font(comp_title)
	comp_col.add_child(comp_title)
	for c in CACHE_COMPOSITION:
		var lab := Label.new()
		lab.text = "%s · %s · %sx" % [c.label, c.chance, _fmt_mult(float(c.mult))]
		lab.add_theme_font_size_override("font_size", 13)
		lab.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(lab)
		comp_col.add_child(lab)

	_cache_status = Label.new()
	_cache_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_cache_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_cache_status.add_theme_font_size_override("font_size", 15)
	_cache_status.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_cache_status)
	col.add_child(_cache_status)

	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	col.add_child(grid)
	_cache_crate_btns.clear()
	for i in 6:
		var crate := Button.new()
		crate.custom_minimum_size = Vector2(0, 88)
		crate.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(crate)
		crate.text = "Crate %d\nSealed" % (i + 1)
		var idx := i
		crate.pressed.connect(func() -> void: _cache_select(idx))
		grid.add_child(crate)
		_cache_crate_btns.append(crate)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	col.add_child(row)
	_cache_start_btn = Button.new()
	_cache_start_btn.text = "Start Round"
	_cache_start_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_tinted_painted_button(_cache_start_btn, Color("#A78BFA"))
	_cache_start_btn.pressed.connect(_cache_start)
	row.add_child(_cache_start_btn)
	_cache_next_btn = Button.new()
	_cache_next_btn.text = "Next Round"
	_cache_next_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(_cache_next_btn)
	_cache_next_btn.pressed.connect(_cache_next_round)
	row.add_child(_cache_next_btn)

	_cache_result = Label.new()
	_cache_result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_cache_result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_cache_result.add_theme_font_size_override("font_size", 16)
	_cache_result.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_cache_result)
	col.add_child(_cache_result)
	return col


func _build_sd_wager_row() -> VBoxContainer:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	box.add_child(row)
	_sd_quick_btns.clear()
	for pct in SD_QUICK_PCTS:
		var b := Button.new()
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(b)
		var p := float(pct)
		b.pressed.connect(func() -> void: _set_sd_wager_pct(p))
		row.add_child(b)
		_sd_quick_btns.append(b)
	# Compact manual entry — whole stardust only (web Casino parity).
	var entry := HBoxContainer.new()
	entry.add_theme_constant_override("separation", 8)
	box.add_child(entry)
	_sd_wager_edit = _make_wager_edit(GameData.STARDUST_COLOR)
	_sd_wager_edit.placeholder_text = "Bet"
	_sd_wager_edit.text_submitted.connect(func(_t: String) -> void: _commit_sd_wager_edit())
	_sd_wager_edit.focus_exited.connect(_commit_sd_wager_edit)
	_sd_wager_edit.text_changed.connect(func(_t: String) -> void: _on_sd_wager_edit_changed())
	entry.add_child(_sd_wager_edit)
	_sd_wager_lab = Label.new()
	_sd_wager_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sd_wager_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_sd_wager_lab.add_theme_font_size_override("font_size", 12)
	_sd_wager_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_sd_wager_lab)
	entry.add_child(_sd_wager_lab)
	return box


func _build_nova_wager_row() -> VBoxContainer:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	box.add_child(row)
	_nova_preset_btns.clear()
	for amt in NOVA_PRESETS:
		var b := Button.new()
		b.text = str(amt)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(b)
		var a := float(amt)
		b.pressed.connect(func() -> void: _set_nova_wager(a))
		row.add_child(b)
		_nova_preset_btns.append(b)
	# Compact manual entry — Nova in 0.5 steps (web Casino parity).
	var entry := HBoxContainer.new()
	entry.add_theme_constant_override("separation", 8)
	box.add_child(entry)
	_nova_wager_edit = _make_wager_edit(Color("#FFD700"))
	_nova_wager_edit.placeholder_text = "Bet"
	_nova_wager_edit.text_submitted.connect(func(_t: String) -> void: _commit_nova_wager_edit())
	_nova_wager_edit.focus_exited.connect(_commit_nova_wager_edit)
	_nova_wager_edit.text_changed.connect(func(_t: String) -> void: _on_nova_wager_edit_changed())
	entry.add_child(_nova_wager_edit)
	_nova_wager_lab = Label.new()
	_nova_wager_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_nova_wager_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_nova_wager_lab.add_theme_font_size_override("font_size", 12)
	_nova_wager_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_nova_wager_lab)
	entry.add_child(_nova_wager_lab)
	return box


func _make_wager_edit(tint: Color) -> LineEdit:
	var edit := LineEdit.new()
	edit.custom_minimum_size = Vector2(112, 34)
	edit.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	edit.alignment = HORIZONTAL_ALIGNMENT_RIGHT
	edit.context_menu_enabled = false
	ClientUi.apply_body_font(edit)
	edit.add_theme_font_size_override("font_size", 14)
	edit.add_theme_stylebox_override(
		"normal",
		ClientUi.painted_panel_style(Color(0.05, 0.06, 0.09, 0.72), Color(tint, 0.35), 8, 1)
	)
	edit.add_theme_stylebox_override(
		"hover",
		ClientUi.painted_panel_style(Color(0.06, 0.07, 0.10, 0.82), Color(tint, 0.55), 8, 1)
	)
	edit.add_theme_stylebox_override(
		"focus",
		ClientUi.painted_panel_style(Color(0.05, 0.06, 0.09, 0.88), Color(tint, 0.85), 8, 2)
	)
	edit.add_theme_color_override("font_color", Color(0.94, 0.96, 0.98))
	edit.add_theme_color_override("font_placeholder_color", ClientUi.MUTED)
	edit.add_theme_color_override("caret_color", tint)
	edit.add_theme_color_override("selection_color", Color(tint, 0.28))
	return edit


func _section_title(title: String, rules: String, tint: Color) -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 2)
	var t := Label.new()
	t.text = title
	t.add_theme_font_size_override("font_size", 20)
	t.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(t)
	col.add_child(t)
	var r := Label.new()
	r.text = rules
	r.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	r.add_theme_font_size_override("font_size", 14)
	r.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(r)
	col.add_child(r)
	return col


func _make_die_face(glyph: String) -> Label:
	var lab := Label.new()
	lab.text = glyph
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", 96)
	lab.add_theme_color_override("font_color", Color(0.92, 0.94, 0.98, 0.92))
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return lab


# ── Navigation / populate ─────────────────────────────────────

func _select_game(game_id: String) -> void:
	_active_game = game_id
	for id in _panels.keys():
		_panels[id].visible = (id == game_id)
	for id in _nav_btns.keys():
		var btn: Button = _nav_btns[id]
		btn.button_pressed = (id == game_id)
	var uses_sd := game_id == GAME_DICE or game_id == GAME_WHEEL
	if is_instance_valid(_sd_wager_box):
		_sd_wager_box.visible = uses_sd
	if is_instance_valid(_nova_wager_box):
		_nova_wager_box.visible = not uses_sd
	# Switching must not abandon sessions — restore when opening that table.
	if game_id == GAME_REFINE:
		_restore_refine_session()
	elif game_id == GAME_CACHE:
		_restore_cache_session()
	_refresh_wager_controls()
	_refresh_action_enabled()


func _init_default_wagers() -> void:
	var bal := int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	var mn := CasinoManager.stardust_min()
	var mx := CasinoManager.stardust_max()
	var starter := mini(mx, maxi(mn, mini(100, bal)))
	if starter >= mn and starter <= mx and starter <= bal:
		_sd_wager = starter
	else:
		_sd_wager = 0
	var nova_bal := CasinoManager.nova_spendable()
	_nova_wager = 100.0 if nova_bal >= 100.0 else 0.0


func _refresh_balances() -> void:
	_balance_sd.text = _fmt(int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST)))
	var total_nova := float(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA))
	var wag := CasinoManager.nova_wagerable()
	_balance_nova.text = "%s  (Wagerable %s)" % [_fmt_nova(total_nova), _fmt_nova(wag)]
	var nova_rule := "Casino uses Wagerable only"
	if AdminManager.is_admin():
		nova_rule = "Admin: any Nova may be wagered"
	_limits_lab.text = "Stardust %s–%s · Nova %s–%s · %s" % [
		_fmt(CasinoManager.stardust_min()),
		_fmt(CasinoManager.stardust_max()),
		_fmt(CasinoManager.nova_min()),
		_fmt(CasinoManager.nova_max()),
		nova_rule,
	]


func _refresh_wager_controls() -> void:
	var sd_bal := int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	var mn := CasinoManager.stardust_min()
	var mx := CasinoManager.stardust_max()
	if is_instance_valid(_sd_wager_lab):
		_sd_wager_lab.text = "min %s · max %s · whole numbers" % [_fmt(mn), _fmt(mx)]
		if not _sd_wager_valid():
			_sd_wager_lab.add_theme_color_override("font_color", ClientUi.DANGER)
		else:
			_sd_wager_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	_sync_sd_wager_edit()
	for i in _sd_quick_btns.size():
		var pct: float = SD_QUICK_PCTS[i]
		var amt := int(floor(float(sd_bal) * pct))
		var btn := _sd_quick_btns[i]
		btn.text = "%d%% · %s" % [int(pct * 100.0), _fmt(amt)]
		var ok := amt >= mn and amt <= mx and amt <= sd_bal and amt > 0
		btn.disabled = _busy or not ok
		btn.button_pressed = (_sd_wager == amt and ok)

	var nova_bal := CasinoManager.nova_spendable()
	var nova_locked := (
		(not CasinoManager.active_session(GAME_REFINE).is_empty() and _active_game == GAME_REFINE)
		or (not CasinoManager.active_session(GAME_CACHE).is_empty() and _active_game == GAME_CACHE)
	)
	if is_instance_valid(_nova_wager_lab):
		var range_hint := "100–1,000 · steps of 0.5"
		if AdminManager.is_admin():
			_nova_wager_lab.text = "%s · Admin: any Nova%s" % [
				range_hint,
				" · locked" if nova_locked else "",
			]
		else:
			_nova_wager_lab.text = "%s · Wagerable only%s" % [
				range_hint,
				" · locked" if nova_locked else "",
			]
		if not _nova_wager_valid() and not nova_locked:
			_nova_wager_lab.add_theme_color_override("font_color", ClientUi.DANGER)
		else:
			_nova_wager_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	_sync_nova_wager_edit()
	if is_instance_valid(_nova_wager_edit):
		_nova_wager_edit.editable = not _busy and not nova_locked
	for i in _nova_preset_btns.size():
		var amt: float = float(NOVA_PRESETS[i])
		var btn := _nova_preset_btns[i]
		btn.disabled = _busy or nova_locked or amt > nova_bal + 0.0001
		btn.button_pressed = is_equal_approx(_nova_wager, amt)


func _refresh_action_enabled() -> void:
	var sd_ok := _sd_wager_valid()
	var nova_ok := _nova_wager_valid()

	if is_instance_valid(_dice_roll_btn):
		_dice_roll_btn.disabled = _busy or not sd_ok or _dice_choice.is_empty()
	for id in _dice_choice_btns.keys():
		_dice_choice_btns[id].disabled = _busy

	if is_instance_valid(_wheel_spin_btn):
		_wheel_spin_btn.disabled = _busy or not sd_ok
		_wheel_spin_btn.text = "Spinning…" if _busy and _active_game == GAME_WHEEL else "Spin"

	var refine_active := not _refine_session_id.is_empty() and str(_refine_state.get("status", "")) == "active"
	var refine_ended := not _refine_session_id.is_empty() and str(_refine_state.get("status", "")) != "active"
	if _refine_session_id.is_empty():
		refine_ended = false
	# Also treat shattered/completed local flags
	if bool(_refine_state.get("shattered", false)) or bool(_refine_state.get("completed", false)):
		refine_active = false
		refine_ended = true
	if is_instance_valid(_refine_start_btn):
		_refine_start_btn.visible = _refine_session_id.is_empty() or (not refine_active and not refine_ended)
		_refine_start_btn.disabled = _busy or not nova_ok or refine_active
	if is_instance_valid(_refine_collect_btn):
		_refine_collect_btn.visible = refine_active
		_refine_collect_btn.disabled = _busy or not bool(_refine_state.get("can_collect", false))
	if is_instance_valid(_refine_again_btn):
		_refine_again_btn.visible = refine_active
		_refine_again_btn.disabled = _busy or not bool(_refine_state.get("can_refine", false))
	if is_instance_valid(_refine_new_btn):
		_refine_new_btn.visible = refine_ended
		_refine_new_btn.disabled = _busy

	var cache_active := not _cache_session_id.is_empty() and str(_cache_state.get("status", "active")) == "active" and bool(_cache_state.get("sealed", true))
	var cache_done := not _cache_session_id.is_empty() and not cache_active
	if is_instance_valid(_cache_start_btn):
		_cache_start_btn.visible = _cache_session_id.is_empty()
		_cache_start_btn.disabled = _busy or not nova_ok
	if is_instance_valid(_cache_next_btn):
		_cache_next_btn.visible = cache_done
		_cache_next_btn.disabled = _busy or not nova_ok
	for i in _cache_crate_btns.size():
		_cache_crate_btns[i].disabled = _busy or not cache_active


func _set_sd_wager_pct(pct: float) -> void:
	var bal := int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	var amt := int(floor(float(bal) * pct))
	var mn := CasinoManager.stardust_min()
	var mx := CasinoManager.stardust_max()
	if amt < mn or amt > mx or amt > bal or amt <= 0:
		_set_status("Wager %s is outside allowed limits." % _fmt(amt), ClientUi.DANGER)
		return
	_sd_edit_ok = true
	_sd_wager = amt
	_refresh_wager_controls()
	_refresh_action_enabled()


func _set_nova_wager(amt: float) -> void:
	var snapped := snappedf(amt, 0.5)
	var bal := CasinoManager.nova_spendable()
	if snapped > bal + 0.0001:
		if AdminManager.is_admin():
			_set_status("Not enough Nova for %s." % _fmt_nova(snapped), ClientUi.DANGER)
		else:
			_set_status(
				"Not enough Wagerable Nova for %s. Bonus Nova cannot be wagered." % _fmt_nova(snapped),
				ClientUi.DANGER
			)
		return
	_nova_edit_ok = true
	_nova_wager = snapped
	_refresh_wager_controls()
	_refresh_action_enabled()


func _sync_sd_wager_edit() -> void:
	if not is_instance_valid(_sd_wager_edit):
		return
	if _sd_wager_edit.has_focus():
		return
	_syncing_wager_edit = true
	_sd_wager_edit.text = str(_sd_wager) if _sd_wager > 0 else ""
	_sd_wager_edit.editable = not _busy
	_syncing_wager_edit = false


func _sync_nova_wager_edit() -> void:
	if not is_instance_valid(_nova_wager_edit):
		return
	if _nova_wager_edit.has_focus():
		return
	_syncing_wager_edit = true
	_nova_wager_edit.text = _fmt_nova(_nova_wager) if _nova_wager > 0.0 else ""
	_syncing_wager_edit = false


func _on_sd_wager_edit_changed() -> void:
	if _syncing_wager_edit:
		return
	var parsed := _parse_sd_wager_text(_sd_wager_edit.text)
	if parsed < 0:
		_sd_edit_ok = false
		if is_instance_valid(_sd_wager_lab):
			_sd_wager_lab.add_theme_color_override("font_color", ClientUi.DANGER)
		_refresh_action_enabled()
		return
	_sd_edit_ok = true
	_sd_wager = parsed
	for i in _sd_quick_btns.size():
		var pct: float = SD_QUICK_PCTS[i]
		var bal := int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
		var amt := int(floor(float(bal) * pct))
		_sd_quick_btns[i].button_pressed = (_sd_wager == amt)
	if is_instance_valid(_sd_wager_lab):
		var mn := CasinoManager.stardust_min()
		var mx := CasinoManager.stardust_max()
		_sd_wager_lab.text = "min %s · max %s · whole numbers" % [_fmt(mn), _fmt(mx)]
		_sd_wager_lab.add_theme_color_override(
			"font_color", ClientUi.MUTED if _sd_wager_valid() else ClientUi.DANGER
		)
	_refresh_action_enabled()


func _on_nova_wager_edit_changed() -> void:
	if _syncing_wager_edit:
		return
	var parsed := _parse_nova_wager_text(_nova_wager_edit.text)
	if parsed < 0.0:
		_nova_edit_ok = false
		if is_instance_valid(_nova_wager_lab):
			_nova_wager_lab.add_theme_color_override("font_color", ClientUi.DANGER)
		_refresh_action_enabled()
		return
	_nova_edit_ok = true
	_nova_wager = parsed
	for i in _nova_preset_btns.size():
		_nova_preset_btns[i].button_pressed = is_equal_approx(_nova_wager, float(NOVA_PRESETS[i]))
	if is_instance_valid(_nova_wager_lab):
		_nova_wager_lab.add_theme_color_override(
			"font_color", ClientUi.MUTED if _nova_wager_valid() else ClientUi.DANGER
		)
	_refresh_action_enabled()


func _commit_sd_wager_edit() -> void:
	if not is_instance_valid(_sd_wager_edit):
		return
	var parsed := _parse_sd_wager_text(_sd_wager_edit.text.strip_edges())
	if parsed < 0:
		_sd_edit_ok = _sd_wager > 0
		_sync_sd_wager_edit()
		_refresh_action_enabled()
		return
	_sd_edit_ok = true
	_sd_wager = parsed
	_refresh_wager_controls()
	_refresh_action_enabled()


func _commit_nova_wager_edit() -> void:
	if not is_instance_valid(_nova_wager_edit):
		return
	var raw := _nova_wager_edit.text.strip_edges()
	if raw.is_empty():
		_nova_edit_ok = _nova_wager > 0.0
		_sync_nova_wager_edit()
		_refresh_action_enabled()
		return
	if not raw.is_valid_float():
		_nova_edit_ok = _nova_wager > 0.0
		_sync_nova_wager_edit()
		_refresh_action_enabled()
		return
	var n := float(raw)
	# Snap to nearest 0.5 on commit so typing "100.2" lands on a legal stake.
	_nova_edit_ok = true
	_nova_wager = snappedf(n, 0.5)
	_refresh_wager_controls()
	_refresh_action_enabled()


func _parse_sd_wager_text(raw: String) -> int:
	var t := raw.strip_edges()
	if t.is_empty():
		return -1
	# Whole numbers only — reject decimals.
	if not t.is_valid_int():
		return -1
	return maxi(0, int(t))


func _parse_nova_wager_text(raw: String) -> float:
	var t := raw.strip_edges()
	if t.is_empty() or not t.is_valid_float():
		return -1.0
	var n := float(t)
	if n < 0.0:
		return -1.0
	# Must already be on a 0.5 step while typing (allow "100." → 100).
	var half := snappedf(n, 0.5)
	if not is_equal_approx(n, half):
		return -1.0
	return half


func _sd_wager_valid() -> bool:
	if not _sd_edit_ok:
		return false
	var bal := int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	return _sd_wager >= CasinoManager.stardust_min() and _sd_wager <= CasinoManager.stardust_max() and _sd_wager <= bal


func _nova_wager_valid() -> bool:
	if not _nova_edit_ok:
		return false
	var bal := CasinoManager.nova_spendable()
	var half := snappedf(_nova_wager, 0.5)
	if not is_equal_approx(_nova_wager, half):
		return false
	return (
		_nova_wager >= float(CasinoManager.nova_min())
		and _nova_wager <= float(CasinoManager.nova_max())
		and _nova_wager <= bal + 0.0001
	)


func _fmt_nova(v: float) -> String:
	var half := snappedf(v, 0.5)
	if is_equal_approx(half, float(int(half))):
		return str(int(half))
	return "%.1f" % half


func _set_dice_choice(choice: String) -> void:
	_dice_choice = choice
	for id in _dice_choice_btns.keys():
		if id == choice:
			ClientUi.apply_primary_button(_dice_choice_btns[id])
		else:
			ClientUi.apply_ghost_button(_dice_choice_btns[id])
	_refresh_action_enabled()


# ── Galactic Dice ─────────────────────────────────────────────

func _play_dice() -> void:
	if _busy:
		return
	if not _sd_wager_valid() or _dice_choice.is_empty():
		_set_status("Select a valid wager and Low / Seven / High.", ClientUi.DANGER)
		return
	_busy = true
	_dice_skip_requested = false
	_refresh_action_enabled()
	_refresh_wager_controls()
	_dice_outcome.text = ""
	_dice_total_lab.text = "Rolling…"
	_set_dice_ambiance(GameData.STARDUST_COLOR, 0.28)
	_set_status("Rolling…", ClientUi.MUTED)
	if is_instance_valid(_dice_skip_btn):
		_dice_skip_btn.visible = true
	_start_dice_roll_loop()
	# Settle while tumbling; pad remaining time so reveal is ~1.5s (skippable).
	var t0 := Time.get_ticks_msec()
	var settle_res: Dictionary = await CasinoManager.settle_galactic_dice(_sd_wager, _dice_choice)
	var elapsed := (Time.get_ticks_msec() - t0) / 1000.0
	var remain := maxf(0.0, DICE_TUMBLE_S - elapsed)
	if remain > 0.0 and not _dice_skip_requested:
		await _wait_skippable(remain)
	var res: Dictionary = await _maybe_recover(settle_res)
	_stop_dice_roll_loop()
	if is_instance_valid(_dice_skip_btn):
		_dice_skip_btn.visible = false
	await _reveal_dice_result(res)
	_busy = false
	_refresh_wager_controls()
	_refresh_action_enabled()
	_refresh_balances()
	_refresh_nav_badges()


func _reveal_dice_result(res: Dictionary) -> void:
	if not res.ok:
		_show_error(res)
		_dice_total_lab.text = "Total —"
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var dice_v: Variant = data.get("dice", [])
	var d1 := 1
	var d2 := 1
	if typeof(dice_v) == TYPE_ARRAY and dice_v.size() >= 2:
		d1 = clampi(int(dice_v[0]), 1, 6)
		d2 = clampi(int(dice_v[1]), 1, 6)
	var total := int(data.get("total", d1 + d2))
	var won := bool(data.get("won", false))
	var seven_win := str(data.get("outcome", "")) == "seven_win" or (won and _dice_choice == "seven")
	var gross := int(data.get("gross_payout", 0))
	var net := int(data.get("net_result", 0))
	_dice_face_a.text = DICE_FACES[d1 - 1]
	_dice_face_b.text = DICE_FACES[d2 - 1]
	var tint := ClientUi.SUCCESS if won else ClientUi.DANGER
	if seven_win:
		tint = Color("#FBBF24")
	_dice_face_a.add_theme_color_override("font_color", tint)
	_dice_face_b.add_theme_color_override("font_color", tint)
	_set_dice_ambiance(tint, 0.40 if seven_win else (0.32 if won else 0.16))
	_dice_total_lab.text = "Total %d" % total
	_dice_total_lab.add_theme_color_override("font_color", tint)
	_dice_outcome.text = _payout_line(gross, net, "stardust")
	_dice_outcome.add_theme_color_override("font_color", tint)
	await _pop_result(_dice_outcome, won)
	if seven_win:
		_burst_fx(self, true)
		AudioManager.play_ui("equip")
	elif won:
		_burst_fx(self, false)
		AudioManager.play_ui("equip")
	_set_status("", ClientUi.MUTED)
	await get_tree().create_timer(0.45).timeout
	if is_instance_valid(_dice_face_a):
		_dice_face_a.add_theme_color_override("font_color", Color(0.92, 0.94, 0.98, 0.92))
	if is_instance_valid(_dice_face_b):
		_dice_face_b.add_theme_color_override("font_color", Color(0.92, 0.94, 0.98, 0.92))
	_set_dice_ambiance(GameData.STARDUST_COLOR, 0.18)


# ── Wheel ─────────────────────────────────────────────────────

func _play_wheel() -> void:
	if _busy:
		return
	if not _sd_wager_valid():
		_set_status("Select a valid stardust wager.", ClientUi.DANGER)
		return
	_busy = true
	_refresh_action_enabled()
	_refresh_wager_controls()
	_wheel_outcome.text = ""
	_set_status("Spinning…", ClientUi.MUTED)
	_wheel_disc.set_glowing(true)
	var res: Dictionary = await CasinoManager.settle_stardust_wheel(_sd_wager)
	res = await _maybe_recover(res)
	if not res.ok:
		_wheel_disc.set_glowing(false)
		_busy = false
		_refresh_wager_controls()
		_refresh_action_enabled()
		_show_error(res)
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var tier_id := str(data.get("tier_id", data.get("outcome", "")))
	var mult := int(data.get("payout_mult", 0))
	var seg: Variant = data.get("segment", {})
	var mid_01 := -1.0
	if typeof(seg) == TYPE_DICTIONARY and seg.has("mid"):
		mid_01 = float(seg.get("mid", -1.0))
	var delta := _wheel_disc.spin_delta_degrees(mult, _wheel_degrees, WHEEL_EXTRA_TURNS, tier_id, mid_01)
	var target := _wheel_degrees + delta
	var tw := create_tween()
	tw.tween_method(_set_wheel_rotation, _wheel_degrees, target, WHEEL_SPIN_S) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	await tw.finished
	_wheel_degrees = target
	_wheel_disc.set_glowing(false)
	await _reveal_wheel_result(data)
	_busy = false
	_refresh_wager_controls()
	_refresh_action_enabled()
	_refresh_balances()


func _set_wheel_rotation(deg: float) -> void:
	_wheel_degrees = deg
	if is_instance_valid(_wheel_disc):
		_wheel_disc.rotation_degrees = deg


func _reveal_wheel_result(data: Dictionary) -> void:
	var tier_id := str(data.get("tier_id", data.get("outcome", "")))
	var mult := int(data.get("payout_mult", 0))
	var gross := int(data.get("gross_payout", 0))
	var net := int(data.get("net_result", 0))
	var shove := bool(data.get("shove", tier_id == "shove" or mult == 1))
	var tier := _wheel_disc.tier_for_id(tier_id)
	if tier.is_empty():
		tier = _wheel_disc.tier_for_mult(mult)
	var tint: Color = tier.get("color", ClientUi.GOLD)
	var label := str(tier.get("label", tier_id))
	var text := ""
	if shove:
		text = "Shove — stake returned (net 0) · %s" % _payout_line(gross, net, "stardust")
	elif mult == 0:
		text = "Lose · %s" % _payout_line(gross, net, "stardust")
	else:
		text = "%s · %s" % [label, _payout_line(gross, net, "stardust")]
	_wheel_outcome.text = text
	_wheel_outcome.add_theme_color_override("font_color", tint)
	var big := mult >= 5
	await _pop_result(_wheel_outcome, mult >= 2)
	if big:
		_burst_fx(self, mult >= 10)
		AudioManager.play_ui("equip")
	elif mult >= 2:
		_burst_fx(self, false)
		AudioManager.play_ui("equip")
	_set_status("", ClientUi.MUTED)


# ── Crystal Refining ──────────────────────────────────────────

func _rebuild_refine_ladder() -> void:
	if not is_instance_valid(_refine_ladder_box):
		return
	for c in _refine_ladder_box.get_children():
		c.queue_free()
	var stage_now := int(_refine_state.get("stage", 0))
	for row in REFINING_LADDER:
		var lab := Label.new()
		var st: int = int(row.stage)
		var mark := "▸" if st == stage_now else "·"
		lab.text = "%s Stage %d · reach %s%% · %sx payout" % [
			mark, st, str(row.cumulative_pct), _fmt_mult(float(row.mult))
		]
		lab.add_theme_font_size_override("font_size", 14)
		var col := Color("#FDE68A") if st == stage_now else ClientUi.MUTED
		if st < stage_now:
			col = ClientUi.SUCCESS
		lab.add_theme_color_override("font_color", col)
		ClientUi.apply_body_font(lab)
		_refine_ladder_box.add_child(lab)


func _restore_refine_session() -> void:
	var sess := CasinoManager.active_session(GAME_REFINE)
	if sess.is_empty():
		# Keep local completed session UI until Start New Session clears it.
		if _refine_session_id.is_empty():
			_refine_state = {}
			_refine_status.text = "No active session. Choose a Nova wager and start refining."
		_rebuild_refine_ladder()
		_refresh_action_enabled()
		return
	_refine_session_id = str(sess.get("session_id", ""))
	var st: Dictionary = sess.get("state", {}) if typeof(sess.get("state", null)) == TYPE_DICTIONARY else {}
	_refine_state = st.duplicate(true)
	_refine_state["status"] = str(sess.get("status", "active"))
	_refine_state["wager"] = float(sess.get("wager", st.get("wager", _nova_wager)))
	_nova_edit_ok = true
	_nova_wager = float(_refine_state.get("wager", _nova_wager))
	_refine_status.text = "Active session · stage %d · wager %s Nova" % [
		int(_refine_state.get("stage", 0)), _fmt_nova(float(_refine_state.get("wager", 0)))
	]
	_rebuild_refine_ladder()
	_refresh_wager_controls()
	_refresh_action_enabled()


func _refine_start() -> void:
	if _busy:
		return
	if not _nova_wager_valid():
		_set_status("Select a valid Nova wager (100–1000).", ClientUi.DANGER)
		return
	if not CasinoManager.active_session(GAME_REFINE).is_empty():
		_set_status("Active refining session already exists — open Crystal Refining to continue.", ClientUi.WARNING)
		_restore_refine_session()
		return
	_busy = true
	_refresh_action_enabled()
	_on_refinement_started()
	var res: Dictionary = await CasinoManager.session_start(GAME_REFINE, _nova_wager)
	res = await _maybe_recover(res)
	_busy = false
	if not res.ok:
		_show_error(res)
		_refresh_action_enabled()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	_apply_refine_payload(data)
	_refresh_balances()
	_refresh_nav_badges()
	_refresh_action_enabled()


func _refine_collect() -> void:
	if _busy or _refine_session_id.is_empty():
		return
	_busy = true
	_refresh_action_enabled()
	var res: Dictionary = await CasinoManager.session_action(_refine_session_id, "collect")
	res = await _maybe_recover(res)
	_busy = false
	if not res.ok:
		_show_error(res)
		_refresh_action_enabled()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	_apply_refine_payload(data)
	_refresh_balances()
	_refresh_nav_badges()
	_refresh_action_enabled()


func _refine_again() -> void:
	if _busy or _refine_session_id.is_empty():
		return
	_busy = true
	_refresh_action_enabled()
	var res: Dictionary = await CasinoManager.session_action(_refine_session_id, "refine_again")
	res = await _maybe_recover(res)
	_busy = false
	if not res.ok:
		_show_error(res)
		_refresh_action_enabled()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	_apply_refine_payload(data)
	_refresh_balances()
	_refresh_nav_badges()
	_refresh_action_enabled()


func _refine_new_session() -> void:
	_refine_session_id = ""
	_refine_state = {}
	_refine_result.text = ""
	_refine_status.text = "No active session. Choose a Nova wager and start refining."
	_rebuild_refine_ladder()
	_refresh_action_enabled()
	_refresh_wager_controls()


func _apply_refine_payload(data: Dictionary) -> void:
	_refine_session_id = str(data.get("session_id", _refine_session_id))
	var sess: Variant = data.get("session", {})
	if typeof(sess) == TYPE_DICTIONARY:
		_refine_state = sess.duplicate(true)
	var event := str(data.get("event", _refine_state.get("last_event", "")))
	match event:
		"refinement_succeeded":
			_on_refinement_succeeded(data)
		"crystal_shattered":
			_on_crystal_shattered(data)
		"payout_collected":
			_on_payout_collected(data)
		"final_refinement_completed":
			_on_final_refinement_completed(data)
		_:
			pass
	if bool(_refine_state.get("shattered", false)) or bool(_refine_state.get("completed", false)) \
			or event in ["crystal_shattered", "payout_collected", "final_refinement_completed"]:
		_refine_state["status"] = "completed"
	elif not _refine_session_id.is_empty():
		_refine_state["status"] = str(_refine_state.get("status", "active"))
	_rebuild_refine_ladder()
	var stage := int(_refine_state.get("stage", 0))
	_refine_status.text = "Stage %d · %s" % [stage, event if not event.is_empty() else "in progress"]
	if data.has("gross_payout") and data.get("gross_payout") != null:
		_refine_result.text = _payout_line(int(data.get("gross_payout", 0)), int(data.get("net_result", 0)), "nova")
		_refine_result.add_theme_color_override(
			"font_color",
			ClientUi.SUCCESS if int(data.get("net_result", 0)) > 0 else ClientUi.DANGER
		)
	_set_status("", ClientUi.MUTED)


## Visual event hooks — placeholders for particles / shaders later.
func _on_refinement_started() -> void:
	_refine_status.text = "Refinement started…"
	_refine_status.add_theme_color_override("font_color", Color("#FDE68A"))
	_set_status("Refining…", ClientUi.MUTED)


func _on_refinement_succeeded(_data: Dictionary) -> void:
	_refine_status.add_theme_color_override("font_color", ClientUi.SUCCESS)
	AudioManager.play_ui("equip")


func _on_crystal_shattered(_data: Dictionary) -> void:
	_refine_status.text = "Crystal shattered — wager lost."
	_refine_status.add_theme_color_override("font_color", ClientUi.DANGER)
	if AudioManager != null and AudioManager.has_method("play_ui"):
		AudioManager.play_ui("equip")


func _on_payout_collected(data: Dictionary) -> void:
	_refine_status.text = "Payout collected."
	_refine_status.add_theme_color_override("font_color", ClientUi.SUCCESS)
	_burst_fx(self, float(data.get("gross_payout", 0)) >= float(data.get("wager", _nova_wager)) * 8.0)
	AudioManager.play_ui("equip")


func _on_final_refinement_completed(data: Dictionary) -> void:
	_refine_status.text = "Final refinement complete — max payout."
	_refine_status.add_theme_color_override("font_color", Color("#FBBF24"))
	_burst_fx(self, true)
	AudioManager.play_ui("equip")
	_refine_result.text = _payout_line(int(data.get("gross_payout", 0)), int(data.get("net_result", 0)), "nova")


# ── Smuggler's Cache ──────────────────────────────────────────

func _restore_cache_session() -> void:
	var sess := CasinoManager.active_session(GAME_CACHE)
	if sess.is_empty():
		if _cache_session_id.is_empty():
			_cache_state = {}
			_cache_status.text = "No active round. Start a round, then pick a crate."
			_reset_cache_crates_sealed()
		_refresh_action_enabled()
		return
	_cache_session_id = str(sess.get("session_id", ""))
	var st: Dictionary = sess.get("state", {}) if typeof(sess.get("state", null)) == TYPE_DICTIONARY else {}
	_cache_state = st.duplicate(true)
	_cache_state["status"] = str(sess.get("status", "active"))
	_cache_state["wager"] = float(sess.get("wager", st.get("wager", _nova_wager)))
	_nova_edit_ok = true
	_nova_wager = float(_cache_state.get("wager", _nova_wager))
	if bool(_cache_state.get("sealed", true)) and _cache_state.get("selected_index", null) == null:
		_cache_status.text = "Active session · pick a sealed crate · wager %s Nova" % _fmt_nova(float(_cache_state.get("wager", 0)))
		_reset_cache_crates_sealed()
	else:
		_cache_status.text = "Round settled."
		_paint_cache_board(_cache_state.get("board", []), int(_cache_state.get("selected_index", -1)))
	_refresh_wager_controls()
	_refresh_action_enabled()


func _cache_start() -> void:
	if _busy:
		return
	if not _nova_wager_valid():
		_set_status("Select a valid Nova wager (100–1000).", ClientUi.DANGER)
		return
	if not CasinoManager.active_session(GAME_CACHE).is_empty():
		_set_status("Active cache session already exists — continue that round.", ClientUi.WARNING)
		_restore_cache_session()
		return
	_busy = true
	_refresh_action_enabled()
	_cache_result.text = ""
	_set_status("Starting round…", ClientUi.MUTED)
	var res: Dictionary = await CasinoManager.session_start(GAME_CACHE, _nova_wager)
	res = await _maybe_recover(res)
	_busy = false
	if not res.ok:
		_show_error(res)
		_refresh_action_enabled()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	_cache_session_id = str(data.get("session_id", ""))
	var sess: Variant = data.get("session", {})
	_cache_state = sess.duplicate(true) if typeof(sess) == TYPE_DICTIONARY else {"sealed": true, "status": "active"}
	_cache_state["status"] = "active"
	_cache_state["wager"] = float(data.get("wager", _nova_wager))
	_cache_status.text = "Round live — pick one of six sealed crates."
	_reset_cache_crates_sealed()
	_set_status("", ClientUi.MUTED)
	_refresh_balances()
	_refresh_nav_badges()
	_refresh_action_enabled()


func _cache_next_round() -> void:
	_cache_session_id = ""
	_cache_state = {}
	_cache_result.text = ""
	_reset_cache_crates_sealed()
	_cache_start()


func _cache_select(index: int) -> void:
	if _busy or _cache_session_id.is_empty():
		return
	_busy = true
	_refresh_action_enabled()
	_set_status("Opening crate…", ClientUi.MUTED)
	var res: Dictionary = await CasinoManager.session_action(
		_cache_session_id, "select", {"crate_index": index}
	)
	res = await _maybe_recover(res)
	if not res.ok:
		_busy = false
		_show_error(res)
		_refresh_action_enabled()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var board: Array = data.get("board", []) if typeof(data.get("board", null)) == TYPE_ARRAY else []
	var selected := int(data.get("selected_index", index))
	# Reveal chosen first, then others.
	await _reveal_cache_crates(board, selected)
	_cache_state = data.get("session", {}) if typeof(data.get("session", null)) == TYPE_DICTIONARY else {}
	_cache_state["status"] = "completed"
	_cache_state["board"] = board
	_cache_state["selected_index"] = selected
	_cache_state["sealed"] = false
	var gross := int(data.get("gross_payout", 0))
	var net := int(data.get("net_result", 0))
	var label := str(data.get("label", ""))
	_cache_result.text = "%s · %s" % [label, _payout_line(gross, net, "nova")]
	_cache_result.add_theme_color_override(
		"font_color",
		ClientUi.SUCCESS if net > 0 else (ClientUi.WARNING if gross > 0 else ClientUi.DANGER)
	)
	_cache_status.text = "Round settled. Next Round to play again."
	if bool(data.get("won", false)):
		_burst_fx(self, true)
		AudioManager.play_ui("equip")
	_set_status("", ClientUi.MUTED)
	_busy = false
	_refresh_balances()
	_refresh_nav_badges()
	_refresh_action_enabled()


func _reset_cache_crates_sealed() -> void:
	for i in _cache_crate_btns.size():
		var b := _cache_crate_btns[i]
		b.text = "Crate %d\nSealed" % (i + 1)
		b.disabled = true
		ClientUi.apply_ghost_button(b)


func _paint_cache_board(board: Array, selected: int) -> void:
	for i in _cache_crate_btns.size():
		var b := _cache_crate_btns[i]
		var cell: Dictionary = {}
		if i < board.size() and typeof(board[i]) == TYPE_DICTIONARY:
			cell = board[i]
		var lab := str(cell.get("label", "???"))
		var mult := float(cell.get("mult", 0))
		b.text = "%s\n%sx" % [lab, _fmt_mult(mult)]
		b.disabled = true
		if i == selected:
			ClientUi.apply_primary_button(b)
		else:
			ClientUi.apply_ghost_button(b)


func _reveal_cache_crates(board: Array, selected: int) -> void:
	# Chosen first
	if selected >= 0 and selected < _cache_crate_btns.size():
		var cell: Dictionary = board[selected] if selected < board.size() and typeof(board[selected]) == TYPE_DICTIONARY else {}
		var b := _cache_crate_btns[selected]
		b.text = "%s\n%sx" % [str(cell.get("label", "???")), _fmt_mult(float(cell.get("mult", 0)))]
		ClientUi.apply_primary_button(b)
		await _pop_result(b, float(cell.get("mult", 0)) > 1.0)
		await get_tree().create_timer(0.35).timeout
	# Then the rest
	for i in _cache_crate_btns.size():
		if i == selected:
			continue
		var cell2: Dictionary = board[i] if i < board.size() and typeof(board[i]) == TYPE_DICTIONARY else {}
		_cache_crate_btns[i].text = "%s\n%sx" % [str(cell2.get("label", "???")), _fmt_mult(float(cell2.get("mult", 0)))]
		ClientUi.apply_ghost_button(_cache_crate_btns[i])
	await get_tree().create_timer(0.2).timeout


# ── Shared helpers ────────────────────────────────────────────

func _maybe_recover(res: Dictionary) -> Dictionary:
	if res.ok:
		return res
	if not _is_ambiguous(res):
		return res
	var pending := CasinoManager.pending_request_id()
	if pending.is_empty():
		return res
	_set_status("Connection unclear — recovering wager…", ClientUi.WARNING)
	var rec: Dictionary = await CasinoManager.recover(pending)
	if not rec.ok:
		return rec
	var data: Dictionary = rec.data if typeof(rec.data) == TYPE_DICTIONARY else {}
	if bool(data.get("found", false)):
		return {"ok": true, "error": "", "status": 200, "data": data}
	return res


func _is_ambiguous(res: Dictionary) -> bool:
	if bool(res.get("ok", false)):
		return false
	var status := int(res.get("status", 0))
	var code := str(res.get("code", ""))
	return status == 0 or code == "TIMEOUT" or code == "NETWORK_ERROR" or bool(res.get("retryable", false))


func _payout_line(gross: int, net: int, currency: String) -> String:
	var unit := "stardust" if currency == "stardust" else "Nova"
	var net_s := "+%s" % _fmt(net) if net > 0 else _fmt(net)
	return "Gross payout %s %s · Net %s %s" % [_fmt(gross), unit, net_s, unit]


func _show_error(res: Dictionary) -> void:
	_set_status(str(res.get("error", "Wager failed")), ClientUi.DANGER)
	_refresh_balances()


func _set_status(text: String, color: Color) -> void:
	if is_instance_valid(_status):
		_status.text = text
		_status.add_theme_color_override("font_color", color)


func _wait_skippable(seconds: float) -> void:
	var left := seconds
	while left > 0.0 and not _dice_skip_requested:
		var step := minf(0.05, left)
		await get_tree().create_timer(step).timeout
		left -= step


func _start_dice_roll_loop() -> void:
	if _dice_roll_tween != null and _dice_roll_tween.is_valid():
		_dice_roll_tween.kill()
	if _dice_face_timer == null:
		_dice_face_timer = Timer.new()
		_dice_face_timer.wait_time = 0.12
		_dice_face_timer.timeout.connect(_cycle_dice_faces)
		add_child(_dice_face_timer)
	for face in [_dice_face_a, _dice_face_b]:
		if not is_instance_valid(face):
			continue
		face.pivot_offset = face.size * 0.5
		if face.pivot_offset == Vector2.ZERO:
			face.pivot_offset = Vector2(40, 40)
		face.rotation_degrees = 0.0
		face.scale = Vector2.ONE
	_cycle_dice_faces()
	_dice_face_timer.start()
	_dice_roll_tween = create_tween().set_loops()
	_dice_roll_tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	for face in [_dice_face_a, _dice_face_b]:
		if is_instance_valid(face):
			_dice_roll_tween.parallel().tween_property(face, "rotation_degrees", -18.0, 0.09)
			_dice_roll_tween.parallel().tween_property(face, "scale", Vector2(1.08, 1.08), 0.09)
	_dice_roll_tween.tween_interval(0.01)
	for face in [_dice_face_a, _dice_face_b]:
		if is_instance_valid(face):
			_dice_roll_tween.parallel().tween_property(face, "rotation_degrees", 18.0, 0.12)
	_dice_roll_tween.tween_interval(0.01)
	for face in [_dice_face_a, _dice_face_b]:
		if is_instance_valid(face):
			_dice_roll_tween.parallel().tween_property(face, "rotation_degrees", 0.0, 0.1)
			_dice_roll_tween.parallel().tween_property(face, "scale", Vector2.ONE, 0.1)


func _cycle_dice_faces() -> void:
	if is_instance_valid(_dice_face_a):
		_dice_face_a.text = DICE_FACES[randi() % DICE_FACES.size()]
	if is_instance_valid(_dice_face_b):
		_dice_face_b.text = DICE_FACES[randi() % DICE_FACES.size()]


func _stop_dice_roll_loop() -> void:
	if _dice_face_timer != null:
		_dice_face_timer.stop()
	if _dice_roll_tween != null and _dice_roll_tween.is_valid():
		_dice_roll_tween.kill()
	_dice_roll_tween = null
	for face in [_dice_face_a, _dice_face_b]:
		if not is_instance_valid(face):
			continue
		var settle: Tween = face.create_tween()
		settle.set_parallel(true)
		settle.tween_property(face, "rotation_degrees", 0.0, 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		settle.tween_property(face, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)


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
		tw.tween_property(node, "rotation_degrees", 0.0, 0.06)
	await tw.finished


func _burst_fx(host: Control, big: bool) -> void:
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


func _fmt_mult(m: float) -> String:
	if is_equal_approx(m, floor(m)):
		return str(int(m))
	return "%.2g" % m
