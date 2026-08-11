extends Control
## Missions / Cantina — mirrors web MissionsPage + MissionCantina (idle board).
## Active missions route to mission_run (Godot split; web stays on same page).

const FUEL_COLOR := Color("#39FF14")
const STARDUST_COLOR := Color("#E879F9")

var _list: HBoxContainer
var _section_lab: Label
var _status: Label
var _mining_banner: PanelContainer
var _mining_label: Label
var _fuel_chip: Label
var _buy_fuel_btn: Button
var _music_btn: Button
var _stage_hint: Label
var _stage: Control
var _preview_scrim: ColorRect
var _preview: PanelContainer
var _preview_body: VBoxContainer
var _hover_scrim: ColorRect
var _hover_card: PanelContainer
var _hover_body: VBoxContainer
var _hover_front_layer: CanvasLayer
var _busy := false
var _music_on := true
var _detail_open := false
var _detail_offer: Dictionary = {}
var _detail_tint := Color("#FF9E4F")
var _view_rewards_btn: Button
var _reward_sheet_host: Control


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	if not TutorialManager.tutorial_changed.is_connected(_on_tutorial_changed):
		TutorialManager.tutorial_changed.connect(_on_tutorial_changed)
	if not CombatReturnManager.state_changed.is_connected(_on_combat_return_changed):
		CombatReturnManager.state_changed.connect(_on_combat_return_changed)
	await _boot()
	_sync_view_rewards_cta()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_render()


func _on_combat_return_changed() -> void:
	_sync_view_rewards_cta()


func _on_tutorial_changed(_unused = null) -> void:
	if _hover_card == null or not _hover_card.visible:
		_sync_hover_layer_parent()
		return
	call_deferred("_fit_hover_above_patrons")


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "cantina"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	margin.add_child(root)

	# Web header: Missions + fuel/music/buy
	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 10)
	root.add_child(title_row)

	var title_row_item := UiIcon.make_title_row("map", "Missions", ClientUi.TEXT, 29, 28.0)
	title_row_item.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(title_row_item)

	var controls := HBoxContainer.new()
	controls.add_theme_constant_override("separation", 8)
	title_row.add_child(controls)

	_music_btn = Button.new()
	_music_btn.text = "Music On"
	_music_btn.icon = UiIcon.texture("volume-2")
	_music_btn.expand_icon = true
	_music_btn.add_theme_constant_override("icon_max_width", 16)
	UiIcon.apply_button_icon_colors(_music_btn, ClientUi.MUTED)
	ClientUi.apply_ghost_button(_music_btn)
	_music_btn.add_theme_font_size_override("font_size", 15)
	_music_btn.pressed.connect(_toggle_music)
	controls.add_child(_music_btn)

	_fuel_chip = Label.new()
	_fuel_chip.add_theme_font_size_override("font_size", 15)
	_fuel_chip.add_theme_color_override("font_color", FUEL_COLOR)
	ClientUi.apply_body_font(_fuel_chip)
	var fuel_panel := PanelContainer.new()
	var fuel_sb := StyleBoxFlat.new()
	fuel_sb.bg_color = Color(FUEL_COLOR, 0.1)
	fuel_sb.set_border_width_all(1)
	fuel_sb.border_color = Color(FUEL_COLOR, 0.35)
	fuel_sb.set_corner_radius_all(12)
	fuel_sb.content_margin_left = 10
	fuel_sb.content_margin_right = 10
	fuel_sb.content_margin_top = 4
	fuel_sb.content_margin_bottom = 4
	fuel_panel.add_theme_stylebox_override("panel", fuel_sb)
	var fuel_row := HBoxContainer.new()
	fuel_row.add_theme_constant_override("separation", 6)
	fuel_panel.add_child(fuel_row)
	fuel_row.add_child(UiIcon.make("fuel", FUEL_COLOR, 15.0))
	fuel_row.add_child(_fuel_chip)
	controls.add_child(fuel_panel)

	_buy_fuel_btn = Button.new()
	_buy_fuel_btn.text = "+20 · 10"
	CurrencyIcon.apply_button_cost(_buy_fuel_btn, 15.0)
	ClientUi.apply_ghost_button(_buy_fuel_btn)
	_buy_fuel_btn.add_theme_font_size_override("font_size", 15)
	_buy_fuel_btn.add_theme_color_override("font_color", ClientUi.CYAN)
	_buy_fuel_btn.pressed.connect(_on_buy_fuel)
	controls.add_child(_buy_fuel_btn)

	_view_rewards_btn = Button.new()
	_view_rewards_btn.text = "VIEW REWARDS"
	_view_rewards_btn.visible = false
	ClientUi.apply_primary_button(_view_rewards_btn)
	_view_rewards_btn.add_theme_font_size_override("font_size", 15)
	_view_rewards_btn.pressed.connect(_on_view_rewards)
	controls.add_child(_view_rewards_btn)

	# Mining banner — web copy
	_mining_banner = PanelContainer.new()
	_mining_banner.visible = false
	_mining_banner.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.22, 0.14, 0.06, 0.95), Color("#F59E0B", 0.55), 12, 1)
	)
	root.add_child(_mining_banner)
	var mining_row := HBoxContainer.new()
	mining_row.add_theme_constant_override("separation", 10)
	_mining_banner.add_child(mining_row)
	mining_row.add_child(UiIcon.make("pickaxe", Color("#FCD34D"), 24.0))
	var mining_copy := VBoxContainer.new()
	mining_copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mining_copy.add_theme_constant_override("separation", 2)
	mining_row.add_child(mining_copy)
	var mining_title := Label.new()
	mining_title.text = "Ship Deployed — Mining"
	mining_title.add_theme_font_size_override("font_size", 17)
	mining_title.add_theme_color_override("font_color", Color("#FCD34D"))
	ClientUi.apply_display_font(mining_title)
	mining_copy.add_child(mining_title)
	_mining_label = Label.new()
	_mining_label.text = "Missions unavailable until mining finishes or is cancelled."
	_mining_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_mining_label.add_theme_font_size_override("font_size", 15)
	_mining_label.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_mining_label)
	mining_copy.add_child(_mining_label)
	var mining_btn := Button.new()
	mining_btn.text = "View →"
	ClientUi.apply_ghost_button(mining_btn)
	mining_btn.add_theme_color_override("font_color", Color("#FCD34D"))
	mining_btn.pressed.connect(func() -> void: GameManager.go_mining())
	mining_row.add_child(mining_btn)

	# Section: THE CANTINA
	_section_lab = Label.new()
	_section_lab.text = "THE CANTINA"
	_section_lab.add_theme_font_size_override("font_size", 15)
	_section_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_section_lab)
	root.add_child(_section_lab)

	# Lounge stage
	var stage := Control.new()
	_stage = stage
	stage.clip_contents = true
	stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage.custom_minimum_size.y = 267
	root.add_child(stage)

	var bg := TextureRect.new()
	bg.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.texture = _load_web_texture("cantina-bg.png")
	stage.add_child(bg)

	for orb in [
		{"x": 0.08, "y": 0.18, "s": 120, "c": Color(0.62, 0.42, 1.0, 0.22)},
		{"x": 0.82, "y": 0.14, "s": 90, "c": Color(0.0, 0.9, 1.0, 0.2)},
		{"x": 0.60, "y": 0.70, "s": 140, "c": Color(1.0, 0.42, 0.1, 0.16)},
		{"x": 0.28, "y": 0.78, "s": 80, "c": Color(0.0, 0.9, 1.0, 0.16)},
		{"x": 0.92, "y": 0.60, "s": 70, "c": Color(0.62, 0.42, 1.0, 0.18)},
	]:
		var gradient := Gradient.new()
		var orb_color: Color = orb["c"]
		gradient.colors = PackedColorArray([orb_color, Color(orb_color, 0.0)])
		var texture := GradientTexture2D.new()
		texture.gradient = gradient
		texture.fill = GradientTexture2D.FILL_RADIAL
		texture.fill_from = Vector2(0.5, 0.5)
		texture.fill_to = Vector2(1.0, 0.5)
		var glow := TextureRect.new()
		glow.texture = texture
		glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
		glow.anchor_left = float(orb["x"])
		glow.anchor_top = float(orb["y"])
		glow.anchor_right = float(orb["x"])
		glow.anchor_bottom = float(orb["y"])
		var sz := float(orb["s"])
		glow.offset_left = -sz * 0.5
		glow.offset_top = -sz * 0.5
		glow.offset_right = sz * 0.5
		glow.offset_bottom = sz * 0.5
		stage.add_child(glow)
		var drift := glow.create_tween().set_loops()
		drift.tween_property(glow, "modulate:a", 0.62, 1.8 + float(orb["x"])).set_trans(Tween.TRANS_SINE)
		drift.tween_property(glow, "modulate:a", 1.0, 1.8 + float(orb["y"])).set_trans(Tween.TRANS_SINE)

	for spark in [
		{"x": 0.14, "y": 0.22, "r": 4, "c": Color("#00E5FF")},
		{"x": 0.44, "y": 0.12, "r": 3, "c": Color("#9D6BFF")},
		{"x": 0.70, "y": 0.30, "r": 5, "c": Color("#FFB347")},
		{"x": 0.36, "y": 0.40, "r": 3, "c": Color("#00E5FF")},
		{"x": 0.88, "y": 0.36, "r": 4, "c": Color("#9D6BFF")},
		{"x": 0.22, "y": 0.64, "r": 3, "c": Color("#5CFFB0")},
		{"x": 0.64, "y": 0.58, "r": 4, "c": Color("#00E5FF")},
		{"x": 0.52, "y": 0.80, "r": 3, "c": Color("#FFB347")},
	]:
		var dot := ColorRect.new()
		dot.color = spark["c"]
		dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		dot.anchor_left = float(spark["x"])
		dot.anchor_top = float(spark["y"])
		dot.anchor_right = float(spark["x"])
		dot.anchor_bottom = float(spark["y"])
		var r := float(spark["r"])
		dot.offset_right = r
		dot.offset_bottom = r
		stage.add_child(dot)

	var veil := ColorRect.new()
	veil.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	veil.color = Color(0.025, 0.02, 0.05, 0.10)
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(veil)

	_stage_hint = Label.new()
	_stage_hint.text = "Hover a patron for the full job · click to accept"
	_stage_hint.set_anchors_and_offsets_preset(PRESET_TOP_WIDE)
	_stage_hint.offset_top = 13
	_stage_hint.offset_bottom = 45
	_stage_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_stage_hint.add_theme_font_size_override("font_size", 13)
	_stage_hint.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.9))
	ClientUi.apply_display_font(_stage_hint)
	stage.add_child(_stage_hint)

	# Hover preview — pointer-events ignore (web MissionCantina hover card).
	_hover_scrim = ColorRect.new()
	_hover_scrim.visible = false
	_hover_scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_hover_scrim.color = Color(0.04, 0.03, 0.07, 0.5)
	_hover_scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hover_scrim.z_index = 20
	stage.add_child(_hover_scrim)

	_hover_card = PanelContainer.new()
	_hover_card.visible = false
	_hover_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hover_card.z_index = 25
	_hover_card.anchor_left = 0.5
	_hover_card.anchor_right = 0.5
	_hover_card.anchor_top = 0.0
	_hover_card.anchor_bottom = 0.0
	_hover_card.offset_left = -453
	_hover_card.offset_right = 453
	_hover_card.custom_minimum_size = Vector2(907, 0)
	stage.add_child(_hover_card)
	var hover_pad := MarginContainer.new()
	hover_pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hover_pad.add_theme_constant_override("margin_left", 28)
	hover_pad.add_theme_constant_override("margin_right", 28)
	hover_pad.add_theme_constant_override("margin_top", 22)
	hover_pad.add_theme_constant_override("margin_bottom", 22)
	_hover_card.add_child(hover_pad)
	_hover_body = VBoxContainer.new()
	_hover_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hover_body.add_theme_constant_override("separation", 14)
	hover_pad.add_child(_hover_body)

	_hover_front_layer = CanvasLayer.new()
	_hover_front_layer.layer = 129
	add_child(_hover_front_layer)

	# Click detail sheet — mirrors web MissionDetailSheet / provided mock.
	# Anchored in the content stage (page area, not including side nav).
	_preview_scrim = ColorRect.new()
	_preview_scrim.visible = false
	_preview_scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_preview_scrim.color = Color(0.04, 0.03, 0.07, 0.72)
	_preview_scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	_preview_scrim.z_index = 40
	_preview_scrim.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			_close_mission_sheet()
	)
	stage.add_child(_preview_scrim)

	_preview = PanelContainer.new()
	_preview.visible = false
	_preview.mouse_filter = Control.MOUSE_FILTER_STOP
	_preview.z_index = 45
	_preview.anchor_left = 0.5
	_preview.anchor_right = 0.5
	_preview.anchor_top = 0.0
	_preview.anchor_bottom = 0.0
	_preview.offset_left = -373
	_preview.offset_right = 373
	_preview.offset_top = 0
	_preview.offset_bottom = 0
	_preview.custom_minimum_size = Vector2(747, 0)
	stage.add_child(_preview)

	var preview_pad := MarginContainer.new()
	preview_pad.add_theme_constant_override("margin_left", 28)
	preview_pad.add_theme_constant_override("margin_right", 28)
	preview_pad.add_theme_constant_override("margin_top", 24)
	preview_pad.add_theme_constant_override("margin_bottom", 24)
	_preview.add_child(preview_pad)
	_preview_body = VBoxContainer.new()
	_preview_body.add_theme_constant_override("separation", 16)
	preview_pad.add_child(_preview_body)

	_list = HBoxContainer.new()
	_list.set_anchors_and_offsets_preset(PRESET_BOTTOM_WIDE)
	_list.offset_left = 32
	_list.offset_right = -32
	_list.offset_top = -200
	_list.offset_bottom = -24
	_list.add_theme_constant_override("separation", 14)
	_list.z_index = 30
	TutorialManager.tag_target(_list, "cantina-patrons")
	stage.add_child(_list)

	_status = ClientUi.make_status()
	root.add_child(_status)

	_reward_sheet_host = Control.new()
	_reward_sheet_host.visible = false
	_reward_sheet_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_reward_sheet_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_reward_sheet_host.z_index = 90
	add_child(_reward_sheet_host)


func _boot() -> void:
	_busy = true
	var boot_t0 := Time.get_ticks_msec()
	_status.text = "Syncing fuel…"
	AudioManager.start_cantina_bed()
	_music_on = true
	_update_music_btn()
	if not MissionManager.mission_error.is_connected(_on_mission_error):
		MissionManager.mission_error.connect(_on_mission_error)
	await MissionManager.sync_fuel()
	# sync_fuel already rehydrates character + wallet; skip a second Character GET.
	if MissionManager.has_active_mission():
		GameManager.go_mission_run()
		return
	_status.text = "Loading contracts…"
	await MissionManager.ensure_board(false)
	await InventoryManager.list_pending_loot()
	_busy = false
	_render()
	print("[nav] cantina boot_ms=%d" % [Time.get_ticks_msec() - boot_t0])


func _on_mission_error(err: String) -> void:
	if err.is_empty():
		return
	_status.add_theme_color_override("font_color", Color(1.0, 0.55, 0.45))
	_status.text = err


func _toggle_music() -> void:
	_music_on = not _music_on
	if _music_on:
		AudioManager.start_cantina_bed()
	else:
		AudioManager.stop_music()
	_update_music_btn()


func _update_music_btn() -> void:
	if _music_btn == null:
		return
	_music_btn.text = "Music On" if _music_on else "Music Off"
	_music_btn.icon = UiIcon.texture("volume-2" if _music_on else "music")
	UiIcon.apply_button_icon_colors(_music_btn, ClientUi.MUTED)


func _render() -> void:
	_sync_view_rewards_cta()
	for c in _list.get_children():
		c.queue_free()
	var ch: Dictionary = GameManager.active_character
	var max_fuel := ShipRules.effective_max_fuel(ch)
	if max_fuel <= 0:
		max_fuel = ShipRules.FUEL_MAX_BASE
	_fuel_chip.text = "%s/%s" % [
		CurrencyManager.format_balance(CurrencyManager.CURRENCY_FUEL),
		max_fuel,
	]

	var purchases := int(ch.get("fuel_purchases", 0))
	var left := maxi(0, ShopManager.FUEL_PURCHASE_MAX - purchases)
	_buy_fuel_btn.text = "+%s · %s (%s)" % [
		ShopManager.FUEL_PURCHASE_AMOUNT,
		ShopManager.FUEL_PURCHASE_COST,
		left,
	]
	CurrencyIcon.apply_button_cost(_buy_fuel_btn, 15.0)
	var gate: Dictionary = ShopManager.can_buy_fuel()
	var can_pay := CurrencyManager.can_afford(
		CurrencyManager.CURRENCY_NOVA,
		ShopManager.FUEL_PURCHASE_COST
	)
	_buy_fuel_btn.disabled = not bool(gate.get("ok", false)) or not can_pay
	_buy_fuel_btn.tooltip_text = (
		str(gate.get("error", "Buy fuel"))
		if not bool(gate.get("ok", false))
		else ("Buy fuel" if can_pay else "Not enough Nova Crystals")
	)

	_mining_banner.visible = MiningManager.is_mining_busy()
	if MiningManager.is_mining_busy():
		_stage_hint.text = "Mining in progress"
	else:
		_stage_hint.text = "Hover a patron for the full job · click to accept"

	var offers: Array = MissionManager.offers
	if offers.is_empty():
		if _status.text.is_empty() or _status.text == "Loading contracts…":
			_status.add_theme_color_override("font_color", ClientUi.MUTED)
			_status.text = "No contracts on the board right now."
		return
	if not _status.text.to_lower().contains("fail") and not _status.text.to_lower().contains("error"):
		_status.text = ""
	for offer in offers:
		if typeof(offer) == TYPE_DICTIONARY:
			_list.add_child(_make_patron(offer))


func _load_web_texture(file_name: String) -> Texture2D:
	var rel := "res://Assets/Textures/%s" % file_name
	if ResourceLoader.exists(rel):
		var texture := load(rel) as Texture2D
		if texture != null:
			return texture
	var path := ProjectSettings.globalize_path(rel)
	if FileAccess.file_exists(path):
		var image := Image.load_from_file(path)
		if image != null and not image.is_empty():
			return ImageTexture.create_from_image(image)
	push_warning("Cantina backdrop missing: %s" % rel)
	return null


func _make_patron(offer: Dictionary) -> Button:
	var patron: Dictionary = offer.get("patron", {}) if typeof(offer.get("patron", {})) == TYPE_DICTIONARY else {}
	var ch := GameManager.active_character
	var locked := int(offer.get("level_requirement", 1)) > int(ch.get("level", 1))
	# Fuel affordability is preview-only; Nakama mission_start bridges the authoritative debit.
	var mining := MiningManager.is_mining_busy()
	var state := "Accept"
	if mining:
		state = "Busy"
	elif locked:
		state = "Locked"

	var tint := Color(str(patron.get("color", "#FF9E4F")))
	var scene_i := int(offer.get("explore_scene", -1))
	var art := MissionExploreStage.texture_for_index(scene_i)

	var button := Button.new()
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size = Vector2(213, 147)
	button.clip_text = true
	button.text = ""
	button.flat = true
	button.focus_mode = Control.FOCUS_NONE
	var empty := StyleBoxEmpty.new()
	button.add_theme_stylebox_override("normal", empty)
	button.add_theme_stylebox_override("hover", empty)
	button.add_theme_stylebox_override("pressed", empty)
	button.add_theme_stylebox_override("disabled", empty)
	ClientUi.apply_interaction_motion(button, 1.035)
	button.disabled = false

	var frame := PanelContainer.new()
	frame.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(tint, 0.2), Color(tint, 0.85), 14, 2)
	)
	button.add_child(frame)

	var host := Control.new()
	host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.clip_contents = true
	frame.add_child(host)

	if art != null:
		var bg := TextureRect.new()
		bg.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		bg.texture = art
		bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
		host.add_child(bg)
		var veil := ColorRect.new()
		veil.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		veil.color = Color(0.04, 0.03, 0.08, 0.42)
		veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
		host.add_child(veil)
	else:
		var fill := ColorRect.new()
		fill.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		fill.color = Color(tint, 0.35)
		fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
		host.add_child(fill)

	var col := VBoxContainer.new()
	col.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 4)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(col)

	var glyph_host := CenterContainer.new()
	glyph_host.custom_minimum_size = Vector2(36, 36)
	glyph_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(glyph_host)
	var patron_glyph := str(patron.get("emoji", "user-round"))
	CurrencyIcon.fill_glyph_host(glyph_host, patron_glyph, 28.0, Color.WHITE)

	var name_l := Label.new()
	name_l.text = str(patron.get("name", "Patron"))
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.add_theme_font_size_override("font_size", 15)
	name_l.add_theme_color_override("font_color", Color.WHITE)
	name_l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	name_l.add_theme_constant_override("shadow_offset_x", 1)
	name_l.add_theme_constant_override("shadow_offset_y", 1)
	name_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ClientUi.apply_display_font(name_l)
	col.add_child(name_l)

	var state_l := Label.new()
	state_l.text = state
	state_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	state_l.add_theme_font_size_override("font_size", 13)
	state_l.add_theme_color_override("font_color", tint.lightened(0.25))
	state_l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	state_l.add_theme_constant_override("shadow_offset_x", 1)
	state_l.add_theme_constant_override("shadow_offset_y", 1)
	state_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ClientUi.apply_display_font(state_l)
	col.add_child(state_l)

	var captured := offer.duplicate(true)
	button.mouse_entered.connect(func() -> void: _show_hover_preview(captured, tint, state))
	button.mouse_exited.connect(func() -> void: _hide_hover_preview())
	button.pressed.connect(func() -> void: _open_mission_sheet(captured, tint, state))
	TutorialManager.tag_target(button, "cantina-patrons")
	return button


func _hide_hover_preview() -> void:
	if _detail_open:
		return
	if _hover_card:
		_hover_card.visible = false
	if _hover_scrim:
		_hover_scrim.visible = false
	_sync_hover_layer_parent()


func _hover_on_front_layer() -> bool:
	return (
		TutorialManager.should_show()
		and TutorialManager.coach_visible()
		and TutorialManager.step_id() == "mission_pick"
	)


func _sync_hover_layer_parent() -> void:
	if _hover_scrim == null or _hover_card == null or _stage == null:
		return
	var front := _hover_on_front_layer() and _hover_card.visible
	var target: Node = _hover_front_layer if front else _stage
	if _hover_scrim.get_parent() == target and _hover_card.get_parent() == target:
		return
	if is_instance_valid(_hover_scrim.get_parent()):
		_hover_scrim.get_parent().remove_child(_hover_scrim)
	if is_instance_valid(_hover_card.get_parent()):
		_hover_card.get_parent().remove_child(_hover_card)
	target.add_child(_hover_scrim)
	target.add_child(_hover_card)
	if front:
		_hover_scrim.z_index = 0
		_hover_card.z_index = 1
	else:
		_restore_hover_stage_layout()


func _restore_hover_stage_layout() -> void:
	_hover_scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_hover_scrim.z_index = 20
	_hover_card.anchor_left = 0.5
	_hover_card.anchor_right = 0.5
	_hover_card.anchor_top = 0.0
	_hover_card.anchor_bottom = 0.0
	_hover_card.offset_left = -453
	_hover_card.offset_right = 453
	_hover_card.z_index = 25


func _force_hide_hover_preview() -> void:
	if _hover_card:
		_hover_card.visible = false
	if _hover_scrim:
		_hover_scrim.visible = false


func _show_hover_preview(offer: Dictionary, tint: Color, state: String) -> void:
	## Non-interactive hover card — web MissionCantina hover preview.
	if _detail_open:
		return
	var patron: Dictionary = offer.get("patron", {}) if typeof(offer.get("patron", {})) == TYPE_DICTIONARY else {}
	# Authoritative preview values from Node (GetMissionBoard) — never recomputed here.
	var xp_val := int(offer.get("preview_xp", 0))
	var sd_val := int(offer.get("preview_stardust", 0))
	var fuel_txt := _fmt_offer_fuel(offer)

	var card_style := ClientUi.painted_panel_style(
		Color(0.05, 0.045, 0.08, 0.97), Color(tint, 0.55), 18, 2
	)
	card_style.content_margin_left = 0
	card_style.content_margin_right = 0
	card_style.content_margin_top = 0
	card_style.content_margin_bottom = 0
	_hover_card.add_theme_stylebox_override("panel", card_style)

	for c in _hover_body.get_children():
		_hover_body.remove_child(c)
		c.free()

	var head := HBoxContainer.new()
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_theme_constant_override("separation", 18)
	_hover_body.add_child(head)
	head.add_child(_make_sheet_quest_icon(patron, tint))

	var titles := VBoxContainer.new()
	titles.mouse_filter = Control.MOUSE_FILTER_IGNORE
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 4)
	head.add_child(titles)

	var eyebrow := Label.new()
	eyebrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	eyebrow.text = "CONTRACT OFFER"
	eyebrow.add_theme_font_size_override("font_size", 19)
	eyebrow.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(eyebrow)
	titles.add_child(eyebrow)

	var name_l := Label.new()
	name_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_l.text = str(offer.get("name", "Contract"))
	name_l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_l.add_theme_font_size_override("font_size", 37)
	name_l.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(name_l)
	titles.add_child(name_l)

	titles.add_child(_make_location_row(str(offer.get("location", "?")), 21))

	var desc := Label.new()
	desc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	desc.text = str(offer.get("description", ""))
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.add_theme_font_size_override("font_size", 24)
	desc.add_theme_color_override("font_color", Color(0.9, 0.92, 0.95, 0.95))
	ClientUi.apply_body_font(desc)
	_hover_body.add_child(desc)

	var rewards := HBoxContainer.new()
	rewards.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rewards.add_theme_constant_override("separation", 12)
	_hover_body.add_child(rewards)
	rewards.add_child(_make_reward_tile("", fuel_txt, "Fuel", FUEL_COLOR, false, "fuel"))
	rewards.add_child(_make_reward_tile("star", str(xp_val), "XP", Color.WHITE, true))
	rewards.add_child(_make_reward_tile("sparkle", str(sd_val), "Stardust", STARDUST_COLOR))

	var footer := Label.new()
	footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	footer.add_theme_font_size_override("font_size", 21)
	ClientUi.apply_display_font(footer)
	if state == "Locked":
		footer.text = "Requires Level %s" % ClientUi.format_level(offer.get("level_requirement", "?"))
		footer.add_theme_color_override("font_color", ClientUi.DANGER)
	elif state == "Busy":
		footer.text = "Scouting — finish mining to launch"
		footer.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	else:
		footer.text = "Click the patron to take the job"
		footer.add_theme_color_override("font_color", tint)
	_hover_body.add_child(footer)

	_hover_scrim.visible = true
	_hover_card.visible = true
	_sync_hover_layer_parent()
	_set_tree_mouse_ignore(_hover_card)
	call_deferred("_fit_hover_above_patrons")
	_hover_card.modulate.a = 0.0
	_hover_card.scale = Vector2(0.96, 0.96)
	var half_w := (_hover_card.offset_right - _hover_card.offset_left) * 0.5
	_hover_card.pivot_offset = Vector2(half_w, 0)
	var reveal := _hover_card.create_tween().set_parallel(true)
	reveal.tween_property(_hover_card, "modulate:a", 1.0, 0.14)
	reveal.tween_property(_hover_card, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _set_tree_mouse_ignore(node: Node) -> void:
	if node is Control:
		(node as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	for child in node.get_children():
		_set_tree_mouse_ignore(child)


func _fit_hover_above_patrons() -> void:
	if _hover_card == null or not is_instance_valid(_hover_card) or not _hover_card.visible:
		return
	if _stage == null or not is_instance_valid(_stage):
		return
	await get_tree().process_frame
	if not is_instance_valid(_hover_card) or not _hover_card.visible or _detail_open:
		return
	_hover_card.reset_size()
	var content_h := _hover_card.get_combined_minimum_size().y
	var stage_gr := _stage.get_global_rect()
	var patrons_top := _list.get_global_rect().position.y - stage_gr.position.y
	var gap := 14.0
	var band_top := 36.0
	var band_bottom := patrons_top - gap
	var band_h := maxf(100.0, band_bottom - band_top)
	var h := minf(content_h, band_h)
	var top := band_top + maxf(0.0, (band_h - h) * 0.5)
	var stage_w := _stage.size.x
	var card_w := clampf(680.0, 480.0, maxf(480.0, stage_w - 40.0))
	_hover_card.custom_minimum_size.x = card_w
	_hover_card.pivot_offset = Vector2(card_w * 0.5, h * 0.5)
	if _hover_on_front_layer():
		_hover_scrim.set_anchors_and_offsets_preset(PRESET_TOP_LEFT)
		_hover_scrim.global_position = stage_gr.position
		_hover_scrim.size = stage_gr.size
		_hover_card.set_anchors_and_offsets_preset(PRESET_TOP_LEFT)
		_hover_card.global_position = Vector2(
			stage_gr.position.x + (stage_w - card_w) * 0.5,
			stage_gr.position.y + top
		)
		_hover_card.size = Vector2(card_w, h)
	else:
		_hover_card.offset_top = top
		_hover_card.offset_bottom = top + h
		_hover_card.offset_left = -card_w * 0.5
		_hover_card.offset_right = card_w * 0.5


func _close_mission_sheet() -> void:
	_detail_open = false
	_detail_offer = {}
	_preview.visible = false
	_preview_scrim.visible = false


func _open_mission_sheet(offer: Dictionary, tint: Color, state: String) -> void:
	## Click detail sheet — web MissionDetailSheet layout (mock parity).
	_force_hide_hover_preview()
	_detail_open = true
	_detail_offer = offer.duplicate(true)
	_detail_tint = tint
	var patron: Dictionary = offer.get("patron", {}) if typeof(offer.get("patron", {})) == TYPE_DICTIONARY else {}
	# Authoritative preview values from Node (GetMissionBoard) — never recomputed here.
	var xp_val := int(offer.get("preview_xp", 0))
	var sd_val := int(offer.get("preview_stardust", 0))
	var fuel_txt := _fmt_offer_fuel(offer)

	var card_style := ClientUi.painted_panel_style(
		Color(0.06, 0.055, 0.09, 0.98), Color(0.35, 0.4, 0.48, 0.55), 18, 1
	)
	card_style.content_margin_left = 0
	card_style.content_margin_right = 0
	card_style.content_margin_top = 0
	card_style.content_margin_bottom = 0
	_preview.add_theme_stylebox_override("panel", card_style)

	for c in _preview_body.get_children():
		_preview_body.remove_child(c)
		c.free()

	# Header row: icon | titles | close
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 16)
	_preview_body.add_child(head)
	head.add_child(_make_sheet_quest_icon(patron, tint))

	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 4)
	head.add_child(titles)

	var eyebrow := Label.new()
	eyebrow.text = str(patron.get("name", "Patron")).to_upper()
	eyebrow.add_theme_font_size_override("font_size", 17)
	eyebrow.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(eyebrow)
	titles.add_child(eyebrow)

	var name_l := Label.new()
	name_l.text = str(offer.get("name", "Contract"))
	name_l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_l.add_theme_font_size_override("font_size", 35)
	name_l.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(name_l)
	titles.add_child(name_l)

	titles.add_child(_make_location_row(str(offer.get("location", "?")), 19))

	var close_btn := Button.new()
	close_btn.text = ""
	close_btn.flat = true
	close_btn.focus_mode = Control.FOCUS_NONE
	close_btn.custom_minimum_size = Vector2(48, 48)
	UiIcon.set_button_icon(close_btn, "x", ClientUi.MUTED, 22.0)
	close_btn.pressed.connect(_close_mission_sheet)
	head.add_child(close_btn)

	# Mission artwork banner — same explore_scene as the in-progress backdrop.
	var art := MissionExploreStage.texture_for_index(int(offer.get("explore_scene", -1)))
	if art != null:
		var art_frame := PanelContainer.new()
		art_frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		art_frame.custom_minimum_size = Vector2(0, 132)
		art_frame.clip_contents = true
		art_frame.add_theme_stylebox_override(
			"panel",
			ClientUi.painted_panel_style(Color(0.04, 0.04, 0.07, 1.0), Color(tint, 0.45), 12, 1)
		)
		_preview_body.add_child(art_frame)
		var art_host := Control.new()
		art_host.custom_minimum_size = Vector2(0, 128)
		art_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		art_host.clip_contents = true
		art_frame.add_child(art_host)
		var art_tex := TextureRect.new()
		art_tex.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		art_tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art_tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		art_tex.texture = art
		art_tex.mouse_filter = Control.MOUSE_FILTER_IGNORE
		art_host.add_child(art_tex)

	# Description
	var desc := Label.new()
	desc.text = str(offer.get("description", ""))
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.add_theme_font_size_override("font_size", 21)
	desc.add_theme_color_override("font_color", Color(0.9, 0.92, 0.95, 0.95))
	ClientUi.apply_body_font(desc)
	_preview_body.add_child(desc)

	# Rewards
	var rew_lab := Label.new()
	rew_lab.text = "REWARDS"
	rew_lab.add_theme_font_size_override("font_size", 16)
	rew_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(rew_lab)
	_preview_body.add_child(rew_lab)
	var reward_row := HBoxContainer.new()
	reward_row.add_theme_constant_override("separation", 10)
	_preview_body.add_child(reward_row)
	reward_row.add_child(_make_reward_tile("", fuel_txt, "Fuel", FUEL_COLOR, false, "fuel"))
	reward_row.add_child(_make_reward_tile("star", str(xp_val), "XP", Color.WHITE, true))
	reward_row.add_child(_make_reward_tile("sparkle", str(sd_val), "Stardust", STARDUST_COLOR))

	# Status + Start Mission — fuel does not gate launch (Nakama start has no debit).
	var disabled := state == "Locked" or state == "Busy"
	if state == "Locked":
		var lock_lab := Label.new()
		lock_lab.text = "Requires Level %s" % ClientUi.format_level(offer.get("level_requirement", "?"))
		lock_lab.add_theme_font_size_override("font_size", 19)
		lock_lab.add_theme_color_override("font_color", ClientUi.DANGER)
		ClientUi.apply_body_font(lock_lab)
		_preview_body.add_child(lock_lab)
	elif state == "Busy":
		var busy_lab := Label.new()
		busy_lab.text = "Mining in progress — scout now, launch when free"
		busy_lab.add_theme_font_size_override("font_size", 19)
		busy_lab.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
		ClientUi.apply_body_font(busy_lab)
		_preview_body.add_child(busy_lab)

	var start := Button.new()
	if not disabled:
		start.text = "START MISSION"
	elif state == "Busy":
		start.text = "SCOUTING"
	else:
		start.text = "UNAVAILABLE"
	start.disabled = disabled
	start.custom_minimum_size = Vector2(0, 64)
	start.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(start)
	start.add_theme_font_size_override("font_size", 21)
	if not disabled:
		start.pressed.connect(func() -> void:
			var launch_offer := _detail_offer.duplicate(true)
			_close_mission_sheet()
			_on_launch(launch_offer)
		)
	TutorialManager.tag_target(start, "cantina-start")
	_preview_body.add_child(start)

	_preview_scrim.visible = true
	_preview.visible = true
	call_deferred("_fit_preview_above_patrons")
	_preview.modulate.a = 0.0
	_preview.scale = Vector2(0.94, 0.94)
	_preview.pivot_offset = Vector2((_preview.offset_right - _preview.offset_left) * 0.5, 0)
	var reveal := _preview.create_tween().set_parallel(true)
	reveal.tween_property(_preview, "modulate:a", 1.0, 0.16)
	reveal.tween_property(_preview, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _fit_preview_above_patrons() -> void:
	if _preview == null or not is_instance_valid(_preview) or not _preview.visible:
		return
	if _stage == null or not is_instance_valid(_stage):
		return
	await get_tree().process_frame
	if not is_instance_valid(_preview) or not _preview.visible:
		return
	_preview.reset_size()
	var content_h := _preview.get_combined_minimum_size().y
	# Center in the content stage band above patron buttons (ignores side nav —
	# stage is already the page content area).
	var patrons_top := _list.get_global_rect().position.y - _stage.get_global_rect().position.y
	var gap := 16.0
	var band_top := 36.0
	var band_bottom := patrons_top - gap
	var band_h := maxf(120.0, band_bottom - band_top)
	var h := minf(content_h, band_h)
	var top := band_top + maxf(0.0, (band_h - h) * 0.5)
	_preview.offset_top = top
	_preview.offset_bottom = top + h
	# Keep horizontally centered in the stage (page), not the full window.
	var stage_w := _stage.size.x
	var card_w := clampf(560.0, 420.0, maxf(420.0, stage_w - 48.0))
	_preview.offset_left = -card_w * 0.5
	_preview.offset_right = card_w * 0.5
	_preview.custom_minimum_size.x = card_w
	_preview.pivot_offset = Vector2(card_w * 0.5, h * 0.5)


func _make_sheet_quest_icon(patron: Dictionary, tint: Color) -> PanelContainer:
	var wrap := PanelContainer.new()
	wrap.custom_minimum_size = Vector2(96, 96)
	var wrap_style := ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.08, 0.98), Color(tint, 0.95), 14, 2
	)
	wrap_style.content_margin_left = 6
	wrap_style.content_margin_right = 6
	wrap_style.content_margin_top = 6
	wrap_style.content_margin_bottom = 6
	wrap.add_theme_stylebox_override("panel", wrap_style)
	var glyph_host := CenterContainer.new()
	glyph_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	wrap.add_child(glyph_host)
	CurrencyIcon.fill_glyph_host(
		glyph_host,
		str(patron.get("emoji", "bot")),
		45.0,
		tint.lightened(0.15)
	)
	return wrap


func _make_location_row(location: String, font_size: int) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 6)
	row.add_child(UiIcon.make("map-pin", ClientUi.MUTED, float(font_size) * 0.9))
	var loc := Label.new()
	loc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	loc.text = location
	loc.add_theme_font_size_override("font_size", font_size)
	loc.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(loc)
	row.add_child(loc)
	return row


func _offer_fuel_cost(offer: Dictionary) -> float:
	## Display cost: minutes from mission length, nearest 0.25 (30s→0.5, 2m30s→2.5, 10m→10).
	var secs := int(offer.get("display_duration_seconds", offer.get("duration_seconds", 0)))
	if offer.has("fuel_cost") and typeof(offer["fuel_cost"]) in [TYPE_FLOAT, TYPE_INT]:
		return maxf(0.0, snappedf(float(offer["fuel_cost"]), 0.25))
	return maxf(0.0, snappedf(float(secs) / 60.0, 0.25))


func _fmt_offer_fuel(offer: Dictionary) -> String:
	var v := _offer_fuel_cost(offer)
	if is_equal_approx(v, roundf(v)):
		return str(int(round(v)))
	return ("%0.2f" % v).rstrip("0").rstrip(".")


func _make_reward_tile(
	icon: String,
	value: String,
	label: String,
	color: Color,
	xp_gradient := false,
	currency_icon := ""
) -> PanelContainer:
	var tile := PanelContainer.new()
	tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var border := Color(ClientUi.BRAND_GRAD_CYAN, 0.45) if xp_gradient else Color(color, 0.45)
	if not xp_gradient:
		border = Color(0.32, 0.36, 0.42, 0.4) if color == ClientUi.GOLD else Color(color, 0.4)
	var tile_style := ClientUi.painted_panel_style(
		Color(0.09, 0.1, 0.13, 0.9), border, 12, 1
	)
	tile_style.content_margin_left = 10
	tile_style.content_margin_right = 10
	tile_style.content_margin_top = 12
	tile_style.content_margin_bottom = 12
	tile.add_theme_stylebox_override("panel", tile_style)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 4)
	tile.add_child(col)
	if xp_gradient:
		var star_host := CenterContainer.new()
		star_host.custom_minimum_size = Vector2(28, 28)
		star_host.add_child(UiIcon.make(
			icon if CurrencyIcon.is_asset_glyph(icon) else "star",
			ClientUi.BRAND_GRAD_CYAN,
			24.0
		))
		col.add_child(star_host)
		col.add_child(BrandGradientTitle.make(value, 29, true))
		col.add_child(BrandGradientTitle.make(label, 16, true))
	else:
		if not currency_icon.is_empty():
			var icon_host := CenterContainer.new()
			icon_host.custom_minimum_size = Vector2(28, 28)
			icon_host.add_child(CurrencyIcon.make(currency_icon, 24.0))
			col.add_child(icon_host)
		elif CurrencyIcon.is_asset_glyph(icon):
			var lucide_host := CenterContainer.new()
			lucide_host.custom_minimum_size = Vector2(28, 28)
			lucide_host.add_child(UiIcon.make(icon, color, 24.0))
			col.add_child(lucide_host)
		else:
			var ic := Label.new()
			ic.text = icon
			ic.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			ic.add_theme_font_size_override("font_size", 24)
			ic.add_theme_color_override("font_color", color)
			col.add_child(ic)
		var val := Label.new()
		val.text = value
		val.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		val.add_theme_font_size_override("font_size", 29)
		val.add_theme_color_override("font_color", color)
		ClientUi.apply_display_font(val)
		col.add_child(val)
		var lab := Label.new()
		lab.text = label
		lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lab.add_theme_font_size_override("font_size", 16)
		lab.add_theme_color_override("font_color", color)
		ClientUi.apply_display_font(lab)
		col.add_child(lab)
	return tile


func _on_launch(offer: Dictionary) -> void:
	if _busy:
		return
	var ch := GameManager.active_character
	var level_req := int(offer.get("level_requirement", 1))
	if level_req > int(ch.get("level", 1)):
		Notify.blocked("Locked", "Reach level %s to accept this contract" % level_req)
		return
	if MiningManager.is_mining_busy():
		Notify.blocked("Ship is mining", "Cancel or finish mining before launching")
		_mining_banner.visible = true
		return

	if await InventoryManager.is_bag_full():
		_busy = true
		var action: String = await InventoryManager.prompt_bag_pressure(
			self,
			"Your bag is at capacity. Clear inventory space before starting a mission so loot has somewhere to go."
		)
		_busy = false
		if action == "inventory":
			return
		if action == "cancel":
			Notify.blocked("Bag full", "Launch cancelled — inventory still full")
			return
		if await InventoryManager.is_bag_full():
			Notify.blocked("Bag full", "Free a slot, then launch again")
			return

	_busy = true
	_status.text = "Launching…"
	var res: Dictionary = await MissionManager.launch_offer(offer)
	_busy = false
	if not res.ok:
		var err := str(res.get("error", "Launch failed"))
		if err.to_lower().contains("mining"):
			Notify.blocked("Mining in progress", "Finish or cancel mining first")
			_mining_banner.visible = true
			await MissionManager.refresh_character()
			_render()
		elif err.to_lower().contains("inventory"):
			Notify.blocked("Bag full", err)
			await InventoryManager.prompt_bag_pressure(self, err)
		elif not Notify.from_result(res):
			_status.add_theme_color_override("font_color", Color(1.0, 0.55, 0.45))
			_status.text = err
		return
	GameManager.go_mission_run()


func _sync_view_rewards_cta() -> void:
	if not is_instance_valid(_view_rewards_btn):
		return
	var show := CombatReturnManager.is_for_kind("mission")
	_view_rewards_btn.visible = show
	if show:
		var settling := CombatReturnManager.state == CombatReturnManager.STATE_SETTLING
		_view_rewards_btn.disabled = settling or _busy
		_view_rewards_btn.text = "SETTLING…" if settling else "VIEW REWARDS"


func _on_view_rewards() -> void:
	if _busy:
		return
	_busy = true
	_view_rewards_btn.disabled = true
	await CombatReturnManager.present_rewards(_reward_sheet_host)
	_busy = false
	_sync_view_rewards_cta()


func _on_buy_fuel() -> void:
	if _busy:
		return
	var gate: Dictionary = ShopManager.can_buy_fuel()
	if not bool(gate.get("ok", false)):
		Notify.blocked(str(gate.get("error", "Cannot buy fuel")))
		return
	_busy = true
	_status.text = "Buying fuel…"
	var res: Dictionary = await MissionManager.buy_fuel()
	_busy = false
	if not res.ok:
		if not Notify.from_result(res):
			_status.add_theme_color_override("font_color", Color(1.0, 0.55, 0.45))
			_status.text = str(res.get("error", "Buy fuel failed"))
		return
	await MissionManager.refresh_character()
	_status.add_theme_color_override("font_color", Color(0.45, 0.9, 0.65))
	_status.text = "Fuel topped up."
	_render()
