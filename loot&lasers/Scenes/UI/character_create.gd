extends Control
## Character create — mirrors web CharacterCreation.jsx (Race → Class → Looks → Launch).

const STEPS: PackedStringArray = ["Race", "Class", "Looks", "Launch"]
const STAT_ORDER: PackedStringArray = ["strength", "agility", "intellect", "vitality", "luck"]
const STAT_LABELS := {
	"strength": "Strength",
	"agility": "Agility",
	"intellect": "Intellect",
	"vitality": "Vitality",
	"luck": "Luck",
}
const NAME_NO_DIGITS_MSG := "Names cannot contain numbers"
const NAME_NO_SPACES_MSG := "Names cannot contain spaces"

var _step := 0
var _busy := false
var _is_first := true
var _existing_char_count := 0
var _checked := false
var _create_request_id := ""

var _race_name := ""
var _class_name := ""
var _skin_color := ""
var _eye_style := ""
var _ears := ""
var _mouth := ""
var _nose := ""
var _eyebrows := ""
var _marking := ""

var _name: LineEdit
var _name_status := "idle" # idle | checking | available | taken | too_short | has_digits | has_spaces
var _name_check_token := 0
var _name_hint: Label
var _name_icon: Label

var _status: Label
var _next_hint: Label
var _prev_btn: Button
var _next_btn: Button
var _create_btn: Button
var _step_dots: Array[PanelContainer] = []
var _step_labels: Array[Label] = []
var _step_connectors: Array[ColorRect] = []

var _pages: Array[Control] = []
var _race_cards: Dictionary = {} # name -> Button
var _class_cards: Dictionary = {} # name -> Button
var _lore_host: Control
var _class_detail_host: Control
var _looks_race_chip: Label
var _looks_class_chip: Label
var _skin_swatch: ColorRect
var _looks_preview_host: CenterContainer
var _launch_preview_host: CenterContainer
var _launch_name: Label
var _launch_meta: Label
var _launch_stats_host: VBoxContainer
var _legacy_block: PanelContainer
var _legacy_field: LineEdit
var _legacy_meta: Label
var _arrow_value_labs: Dictionary = {} # key -> Label


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _load_slot_info()
	_checked = true
	_set_step(0)


func _build() -> void:
	add_child(ClientUi.make_screen("void"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	add_child(margin)

	var root := CenterContainer.new()
	root.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_child(root)

	var col := VBoxContainer.new()
	col.custom_minimum_size = Vector2(960, 0)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 12)
	root.add_child(col)

	# Header — BUILD YOUR OPERATIVE + Cancel
	var head := Control.new()
	head.custom_minimum_size.y = 85
	col.add_child(head)

	var head_copy := VBoxContainer.new()
	head_copy.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	head_copy.add_theme_constant_override("separation", 4)
	head.add_child(head_copy)
	var title := ClientUi.make_title("BUILD YOUR OPERATIVE", 26)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	head_copy.add_child(title)
	var sub := ClientUi.make_subtitle("Pick a species, pick a job, make a face. Try not to explode on day one.")
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	head_copy.add_child(sub)

	var cancel := Button.new()
	cancel.text = "✕  Cancel"
	cancel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	cancel.offset_left = -133
	cancel.offset_top = 0
	cancel.offset_right = 0
	cancel.offset_bottom = 37
	ClientUi.apply_ghost_button(cancel)
	cancel.pressed.connect(_on_cancel)
	head.add_child(cancel)

	# Step indicators
	var steps_row := HBoxContainer.new()
	steps_row.alignment = BoxContainer.ALIGNMENT_CENTER
	steps_row.add_theme_constant_override("separation", 8)
	col.add_child(steps_row)
	for i in range(STEPS.size()):
		var step_wrap := HBoxContainer.new()
		step_wrap.add_theme_constant_override("separation", 6)
		steps_row.add_child(step_wrap)

		var dot := PanelContainer.new()
		dot.custom_minimum_size = Vector2(37, 37)
		step_wrap.add_child(dot)
		var dot_lab := Label.new()
		dot_lab.text = str(i + 1)
		dot_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		dot_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		dot_lab.add_theme_font_size_override("font_size", 15)
		ClientUi.apply_display_font(dot_lab)
		dot.add_child(dot_lab)
		_step_dots.append(dot)

		var lab := Label.new()
		lab.text = STEPS[i]
		lab.add_theme_font_size_override("font_size", 15)
		ClientUi.apply_body_font(lab)
		step_wrap.add_child(lab)
		_step_labels.append(lab)

		if i < STEPS.size() - 1:
			var join := ColorRect.new()
			join.custom_minimum_size = Vector2(43, 1)
			join.color = Color(ClientUi.MUTED, 0.25)
			join.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			steps_row.add_child(join)
			_step_connectors.append(join)

	# Main panel
	var panel := PanelContainer.new()
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size.y = 560
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.05, 0.07, 0.11, 0.92), Color(1, 1, 1, 0.12), 16, 1)
	)
	col.add_child(panel)

	var page_scroll := ScrollContainer.new()
	page_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	page_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(page_scroll)

	var page_host := VBoxContainer.new()
	page_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	page_host.add_theme_constant_override("separation", 0)
	page_scroll.add_child(page_host)

	_pages.append(_build_race_page())
	_pages.append(_build_class_page())
	_pages.append(_build_looks_page())
	_pages.append(_build_launch_page())
	for p in _pages:
		page_host.add_child(p)

	_status = ClientUi.make_status()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_status)

	# Nav — Back / hint / Next|LAUNCH
	var nav := HBoxContainer.new()
	nav.add_theme_constant_override("separation", 10)
	col.add_child(nav)

	_prev_btn = Button.new()
	_prev_btn.text = "‹  Back"
	ClientUi.apply_ghost_button(_prev_btn)
	_prev_btn.pressed.connect(func() -> void: _set_step(_step - 1))
	nav.add_child(_prev_btn)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nav.add_child(spacer)

	_next_hint = Label.new()
	_next_hint.add_theme_font_size_override("font_size", 15)
	_next_hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_next_hint)
	nav.add_child(_next_hint)

	_next_btn = Button.new()
	_next_btn.text = "Next  ›"
	ClientUi.apply_primary_button(_next_btn)
	_next_btn.pressed.connect(func() -> void: _set_step(_step + 1))
	nav.add_child(_next_btn)

	_create_btn = Button.new()
	_create_btn.text = "🚀  LAUNCH"
	ClientUi.apply_primary_button(_create_btn)
	_create_btn.pressed.connect(_on_create)
	nav.add_child(_create_btn)

	_ensure_look_defaults()
	_refresh_race_cards()
	_refresh_class_cards()
	_refresh_lore()
	_refresh_class_detail()
	_refresh_looks_chips()
	_refresh_preview()
	_refresh_skin_swatch()
	_refresh_arrow_labels()


# ─── Pages ───────────────────────────────────────────────────────────────────

func _build_race_page() -> Control:
	var page := VBoxContainer.new()
	page.add_theme_constant_override("separation", 12)
	page.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var h2 := Label.new()
	h2.text = "Pick Your Race"
	h2.add_theme_font_size_override("font_size", 21)
	ClientUi.apply_display_font(h2)
	h2.add_theme_color_override("font_color", ClientUi.TEXT)
	page.add_child(h2)

	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	page.add_child(grid)

	for race in GameData.RACES:
		var card := _make_race_card(race)
		grid.add_child(card)
		_race_cards[race] = card

	_lore_host = VBoxContainer.new()
	_lore_host.visible = false
	_lore_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	page.add_child(_lore_host)
	return page


func _make_race_card(race_name: String) -> Button:
	var info := GameData.race_info(race_name)
	var accent: Color = GameData.RACE_ACCENT.get(race_name, ClientUi.CYAN)
	var btn := Button.new()
	btn.custom_minimum_size = Vector2(0, 144)
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.clip_contents = true
	btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
	btn.pressed.connect(func() -> void: _select_race(race_name))

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	row.offset_left = 13
	row.offset_top = 13
	row.offset_right = -13
	row.offset_bottom = -13
	row.add_theme_constant_override("separation", 10)
	btn.add_child(row)

	var av_wrap := PanelContainer.new()
	av_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	av_wrap.custom_minimum_size = Vector2(91, 91)
	var av_sb := StyleBoxFlat.new()
	av_sb.bg_color = Color(accent, 0.12)
	av_sb.set_border_width_all(1)
	av_sb.border_color = Color(accent, 0.45)
	av_sb.set_corner_radius_all(10)
	av_wrap.add_theme_stylebox_override("panel", av_sb)
	row.add_child(av_wrap)
	var av_center := CenterContainer.new()
	av_center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	av_wrap.add_child(av_center)
	var fake := {
		"race": race_name,
		"appearance": {
			"skin_color": str((info.get("skinColors", ["#888"]) as Array)[0]),
			"eye_style": GameData.EYE_STYLES[0],
			"ears": GameData.EAR_STYLES[0],
			"mouth": GameData.MOUTH_STYLES[0],
			"nose": GameData.NOSE_STYLES[0],
			"eyebrows": GameData.BROW_STYLES[0],
			"marking": GameData.MARKINGS[0],
		},
	}
	av_center.add_child(AvatarRenderer.make_portrait(fake, 60.0))

	var copy := VBoxContainer.new()
	copy.mouse_filter = Control.MOUSE_FILTER_IGNORE
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.add_theme_constant_override("separation", 3)
	row.add_child(copy)

	var name_row := HBoxContainer.new()
	name_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_row.add_theme_constant_override("separation", 4)
	copy.add_child(name_row)
	var emoji := Label.new()
	emoji.text = str(info.get("emoji", ""))
	emoji.mouse_filter = Control.MOUSE_FILTER_IGNORE
	emoji.add_theme_font_size_override("font_size", 19)
	name_row.add_child(emoji)
	var nm := Label.new()
	nm.text = race_name
	nm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	nm.add_theme_font_size_override("font_size", 17)
	ClientUi.apply_display_font(nm)
	nm.add_theme_color_override("font_color", ClientUi.TEXT)
	name_row.add_child(nm)

	var tag := Label.new()
	tag.text = str(info.get("tagline", ""))
	tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tag.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tag.add_theme_font_size_override("font_size", 13)
	tag.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(tag)
	copy.add_child(tag)

	var bonuses := HBoxContainer.new()
	bonuses.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bonuses.add_theme_constant_override("separation", 6)
	copy.add_child(bonuses)
	var bonus_map: Dictionary = info.get("bonuses", {})
	for stat in bonus_map.keys():
		var chip := StatIcon.make_labeled(
			str(stat),
			"+%s%% %s" % [str(int(round(float(bonus_map[stat]) * 100.0))), str(stat)],
			12.0,
			12,
			ClientUi.CYAN,
			4
		)
		bonuses.add_child(chip)

	btn.set_meta("accent", accent)
	return btn


func _build_class_page() -> Control:
	var page := VBoxContainer.new()
	page.add_theme_constant_override("separation", 10)
	page.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	page.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var head := HBoxContainer.new()
	page.add_child(head)
	var h2 := Label.new()
	h2.text = "Pick Your Class"
	h2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h2.add_theme_font_size_override("font_size", 20)
	ClientUi.apply_display_font(h2)
	h2.add_theme_color_override("font_color", ClientUi.TEXT)
	head.add_child(h2)
	var race_hint := Label.new()
	race_hint.name = "ClassRaceHint"
	race_hint.add_theme_font_size_override("font_size", 13)
	race_hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(race_hint)
	head.add_child(race_hint)
	page.set_meta("race_hint", race_hint)

	var split := HBoxContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 12)
	page.add_child(split)

	var list := VBoxContainer.new()
	list.custom_minimum_size.x = 373
	list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 6)
	split.add_child(list)

	for cls_name in GameData.CLASSES:
		var card := _make_class_card(cls_name)
		list.add_child(card)
		_class_cards[cls_name] = card

	_class_detail_host = VBoxContainer.new()
	_class_detail_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_class_detail_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_class_detail_host.add_theme_constant_override("separation", 8)
	split.add_child(_class_detail_host)
	return page


func _make_class_card(cls_name: String) -> Button:
	var info := GameData.class_info(cls_name)
	var primary := str(info.get("primaryStat", "strength"))
	var accent: Color = GameData.STAT_COLORS.get(primary, ClientUi.VIOLET)
	var btn := Button.new()
	btn.custom_minimum_size = Vector2(0, 77)
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.clip_contents = true
	btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
	btn.pressed.connect(func() -> void: _select_class(cls_name))

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	row.offset_left = 11
	row.offset_top = 8
	row.offset_right = -11
	row.offset_bottom = -8
	row.add_theme_constant_override("separation", 8)
	btn.add_child(row)

	var emblem := Label.new()
	emblem.mouse_filter = Control.MOUSE_FILTER_IGNORE
	emblem.text = str(info.get("emoji", "✦"))
	emblem.add_theme_font_size_override("font_size", 29)
	emblem.custom_minimum_size = Vector2(48, 48)
	emblem.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	emblem.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(emblem)

	var copy := VBoxContainer.new()
	copy.mouse_filter = Control.MOUSE_FILTER_IGNORE
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.add_theme_constant_override("separation", 1)
	row.add_child(copy)

	var nm := Label.new()
	nm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	nm.text = "%s %s" % [str(info.get("emoji", "")), cls_name]
	nm.add_theme_font_size_override("font_size", 16)
	ClientUi.apply_display_font(nm)
	nm.add_theme_color_override("font_color", ClientUi.TEXT)
	copy.add_child(nm)

	var tag := Label.new()
	tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tag.text = str(info.get("tagline", ""))
	tag.clip_text = true
	tag.add_theme_font_size_override("font_size", 12)
	tag.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(tag)
	copy.add_child(tag)

	var chips := HBoxContainer.new()
	chips.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chips.add_theme_constant_override("separation", 4)
	copy.add_child(chips)
	var pri := StatIcon.make_labeled(primary, primary, 12.0, 12, ClientUi.VIOLET, 4)
	chips.add_child(pri)
	var special: Dictionary = info.get("special", {})
	if not special.is_empty():
		var sp := Label.new()
		sp.mouse_filter = Control.MOUSE_FILTER_IGNORE
		sp.text = "✦ %s" % str(special.get("name", ""))
		sp.add_theme_font_size_override("font_size", 12)
		sp.add_theme_color_override("font_color", ClientUi.CYAN)
		ClientUi.apply_body_font(sp)
		chips.add_child(sp)

	btn.set_meta("accent", accent)
	return btn


func _build_looks_page() -> Control:
	var page := VBoxContainer.new()
	page.add_theme_constant_override("separation", 14)
	page.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	page.add_child(head)
	var h2 := Label.new()
	h2.text = "Customize Your Face"
	h2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h2.add_theme_font_size_override("font_size", 21)
	ClientUi.apply_display_font(h2)
	h2.add_theme_color_override("font_color", ClientUi.TEXT)
	head.add_child(h2)

	_looks_race_chip = _chip_label("")
	_looks_race_chip.add_theme_color_override("font_color", ClientUi.CYAN)
	head.add_child(_looks_race_chip)
	_looks_class_chip = _chip_label("")
	_looks_class_chip.add_theme_color_override("font_color", ClientUi.VIOLET)
	head.add_child(_looks_class_chip)

	var rand_btn := Button.new()
	rand_btn.text = "⚄  Randomize"
	ClientUi.apply_ghost_button(rand_btn)
	rand_btn.pressed.connect(_randomize_looks)
	head.add_child(rand_btn)

	var split := HBoxContainer.new()
	split.add_theme_constant_override("separation", 20)
	page.add_child(split)

	var preview_col := VBoxContainer.new()
	preview_col.custom_minimum_size.x = 240
	preview_col.add_theme_constant_override("separation", 8)
	split.add_child(preview_col)
	var preview_frame := PanelContainer.new()
	preview_frame.custom_minimum_size = Vector2(229, 229)
	preview_frame.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.04, 0.06, 0.1, 0.9), Color(1, 1, 1, 0.14), 12, 1)
	)
	preview_col.add_child(preview_frame)
	_looks_preview_host = CenterContainer.new()
	preview_frame.add_child(_looks_preview_host)
	var preview_cap := Label.new()
	preview_cap.text = "PREVIEW"
	preview_cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	preview_cap.add_theme_font_size_override("font_size", 12)
	preview_cap.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(preview_cap)
	preview_col.add_child(preview_cap)

	var form_col := VBoxContainer.new()
	form_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	form_col.add_theme_constant_override("separation", 10)
	split.add_child(form_col)

	var name_lab := Label.new()
	name_lab.text = "Operative Name"
	name_lab.add_theme_font_size_override("font_size", 15)
	name_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(name_lab)
	form_col.add_child(name_lab)

	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 6)
	form_col.add_child(name_row)
	_name = ClientUi.make_field("Something cool. Or stupid. Your call.")
	_name.max_length = 24
	_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_name.text_changed.connect(_on_name_changed)
	name_row.add_child(_name)
	_name_icon = Label.new()
	_name_icon.custom_minimum_size.x = 24
	_name_icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_icon.add_theme_font_size_override("font_size", 19)
	name_row.add_child(_name_icon)

	_name_hint = Label.new()
	_name_hint.add_theme_font_size_override("font_size", 15)
	_name_hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_name_hint)
	form_col.add_child(_name_hint)
	var letters_only := Label.new()
	letters_only.text = "Letters only — no numbers or spaces."
	letters_only.add_theme_font_size_override("font_size", 13)
	letters_only.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.75))
	ClientUi.apply_body_font(letters_only)
	form_col.add_child(letters_only)

	# Skin tone arrow row
	var skin_row := _make_arrow_shell("Skin Tone")
	form_col.add_child(skin_row)
	var skin_mid := skin_row.get_node("Mid") as HBoxContainer
	var skin_prev := skin_row.get_node("Prev") as Button
	var skin_next := skin_row.get_node("Next") as Button
	_skin_swatch = ColorRect.new()
	_skin_swatch.custom_minimum_size = Vector2(48, 48)
	_skin_swatch.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	skin_mid.add_child(_skin_swatch)
	skin_prev.pressed.connect(func() -> void: _cycle_skin(-1))
	skin_next.pressed.connect(func() -> void: _cycle_skin(1))

	form_col.add_child(_make_arrow_selector("Eyes", "eye_style", GameData.EYE_STYLES))
	form_col.add_child(_make_arrow_selector("Brows", "eyebrows", GameData.BROW_STYLES))
	form_col.add_child(_make_arrow_selector("Nose", "nose", GameData.NOSE_STYLES))
	form_col.add_child(_make_arrow_selector("Mouth", "mouth", GameData.MOUTH_STYLES))
	form_col.add_child(_make_arrow_selector("Ears", "ears", GameData.EAR_STYLES))
	form_col.add_child(_make_arrow_selector("Marks", "marking", GameData.MARKINGS))
	return page


func _build_launch_page() -> Control:
	var page := VBoxContainer.new()
	page.add_theme_constant_override("separation", 14)
	page.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var h2 := Label.new()
	h2.text = "Looking Good. Ship It."
	h2.add_theme_font_size_override("font_size", 21)
	ClientUi.apply_display_font(h2)
	h2.add_theme_color_override("font_color", ClientUi.TEXT)
	page.add_child(h2)

	var card := PanelContainer.new()
	card.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.05, 0.07, 0.11, 0.85), Color(1, 1, 1, 0.12), 12, 1)
	)
	page.add_child(card)

	var split := HBoxContainer.new()
	split.add_theme_constant_override("separation", 18)
	card.add_child(split)

	var left := VBoxContainer.new()
	left.custom_minimum_size.x = 240
	left.add_theme_constant_override("separation", 8)
	split.add_child(left)
	_launch_preview_host = CenterContainer.new()
	_launch_preview_host.custom_minimum_size = Vector2(213, 213)
	left.add_child(_launch_preview_host)
	_launch_name = Label.new()
	_launch_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_launch_name.add_theme_font_size_override("font_size", 27)
	ClientUi.apply_display_font(_launch_name)
	_launch_name.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	left.add_child(_launch_name)
	_launch_meta = Label.new()
	_launch_meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_launch_meta.add_theme_font_size_override("font_size", 16)
	_launch_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_launch_meta)
	left.add_child(_launch_meta)

	_launch_stats_host = VBoxContainer.new()
	_launch_stats_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_launch_stats_host.add_theme_constant_override("separation", 6)
	split.add_child(_launch_stats_host)

	page.add_child(_build_legacy_block())
	return page


## Web CharacterCreation Launch step — permanent surname on the 2nd+ operative.
func _build_legacy_block() -> PanelContainer:
	_legacy_block = PanelContainer.new()
	_legacy_block.visible = false
	_legacy_block.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(ClientUi.VIOLET, 0.07), Color(ClientUi.VIOLET, 0.35), 12, 1)
	)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	_legacy_block.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	col.add_child(head)
	head.add_child(UiIcon.make("lock", ClientUi.VIOLET, 20.0))
	var title := Label.new()
	title.text = "Set Your Legacy Name"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 17)
	ClientUi.apply_display_font(title)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	head.add_child(title)
	var once := Label.new()
	once.text = "One-time · permanent"
	once.add_theme_font_size_override("font_size", 13)
	once.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(once)
	head.add_child(once)

	var body := Label.new()
	body.text = "Your second operative locks in the account's surname — a permanent last name shared by every character you create, so other players can recognize them as the same person. It can never be changed."
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_theme_font_size_override("font_size", 14)
	body.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(body)
	col.add_child(body)

	_legacy_field = ClientUi.make_field("e.g. Voss, Nakamura, Khel…")
	_legacy_field.max_length = 20
	_legacy_field.text_changed.connect(_on_legacy_changed)
	col.add_child(_legacy_field)

	_legacy_meta = Label.new()
	_legacy_meta.text = "0/20 · Displayed as: —"
	_legacy_meta.add_theme_font_size_override("font_size", 13)
	_legacy_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_legacy_meta)
	col.add_child(_legacy_meta)
	return _legacy_block


func _on_legacy_changed(text: String) -> void:
	var cleaned := ""
	for ch in text:
		if ch >= "0" and ch <= "9":
			continue
		cleaned += ch
	if cleaned != text:
		var caret := _legacy_field.caret_column
		_legacy_field.text = cleaned
		_legacy_field.caret_column = mini(caret, cleaned.length())
	_refresh_legacy_meta()
	_refresh_nav_gates()


func _refresh_legacy_meta() -> void:
	if _legacy_meta == null:
		return
	var trimmed := _legacy_field.text.strip_edges()
	var first := _name.text.strip_edges() if _name else ""
	if first.is_empty():
		first = "Operative"
	_legacy_meta.text = "%s/20 · Displayed as: %s" % [
		_legacy_field.text.length(),
		("%s %s" % [first, trimmed]) if not trimmed.is_empty() else "—",
	]


func _legacy_required() -> bool:
	return LegacyName.needs_legacy_name_for_create(_existing_char_count)


func _has_digits(text: String) -> bool:
	for ch in text:
		if ch >= "0" and ch <= "9":
			return true
	return false


func _has_whitespace(text: String) -> bool:
	for ch in text:
		if ch == " " or ch == "\t" or ch == "\n" or ch == "\r":
			return true
	return false


func _legacy_ready() -> bool:
	if not _legacy_required():
		return true
	if _legacy_field == null:
		return false
	var trimmed := _legacy_field.text.strip_edges()
	if trimmed.length() < 2 or trimmed.length() > 20:
		return false
	return not _has_digits(trimmed)


# ─── Arrow / chip helpers ────────────────────────────────────────────────────

func _chip_label(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.add_theme_font_size_override("font_size", 13)
	ClientUi.apply_body_font(lab)
	return lab


func _make_arrow_shell(label_text: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var lab := Label.new()
	lab.text = label_text
	lab.custom_minimum_size.x = 96
	lab.add_theme_font_size_override("font_size", 15)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(lab)
	row.add_child(lab)

	var prev := Button.new()
	prev.name = "Prev"
	prev.text = "‹"
	prev.custom_minimum_size = Vector2(37, 37)
	ClientUi.apply_ghost_button(prev)
	row.add_child(prev)

	var mid := HBoxContainer.new()
	mid.name = "Mid"
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(mid)

	var next := Button.new()
	next.name = "Next"
	next.text = "›"
	next.custom_minimum_size = Vector2(37, 37)
	ClientUi.apply_ghost_button(next)
	row.add_child(next)
	return row


func _make_arrow_selector(label_text: String, field: String, options: PackedStringArray) -> HBoxContainer:
	var row := _make_arrow_shell(label_text)
	var mid := row.get_node("Mid") as HBoxContainer
	var prev := row.get_node("Prev") as Button
	var next := row.get_node("Next") as Button
	var val := Label.new()
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	val.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	val.add_theme_font_size_override("font_size", 16)
	val.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(val)
	mid.add_child(val)
	_arrow_value_labs[field] = val
	prev.pressed.connect(func() -> void: _cycle_field(field, options, -1))
	next.pressed.connect(func() -> void: _cycle_field(field, options, 1))
	return row


func _cycle_field(field: String, options: PackedStringArray, delta: int) -> void:
	if options.is_empty():
		return
	var cur := _get_field(field)
	var idx := options.find(cur)
	if idx < 0:
		idx = 0
	idx = (idx + delta + options.size()) % options.size()
	_set_field(field, options[idx])
	_refresh_arrow_labels()
	_refresh_preview()
	if _step == 3:
		_refresh_launch()


func _get_field(field: String) -> String:
	match field:
		"eye_style":
			return _eye_style
		"eyebrows":
			return _eyebrows
		"nose":
			return _nose
		"mouth":
			return _mouth
		"ears":
			return _ears
		"marking":
			return _marking
		_:
			return ""


func _set_field(field: String, value: String) -> void:
	match field:
		"eye_style":
			_eye_style = value
		"eyebrows":
			_eyebrows = value
		"nose":
			_nose = value
		"mouth":
			_mouth = value
		"ears":
			_ears = value
		"marking":
			_marking = value


func _cycle_skin(delta: int) -> void:
	if _race_name.is_empty():
		return
	var skins: Array = GameData.RACE_SKINS.get(_race_name, [])
	if skins.is_empty():
		return
	var idx := skins.find(_skin_color)
	if idx < 0:
		idx = 0
	idx = (idx + delta + skins.size()) % skins.size()
	_skin_color = str(skins[idx])
	_refresh_skin_swatch()
	_refresh_preview()


# ─── Selection / refresh ─────────────────────────────────────────────────────

func _select_race(race_name: String) -> void:
	var skins: Array = GameData.RACE_SKINS.get(race_name, ["#2D5A3D"])
	var keep_skin := skins.has(_skin_color)
	_race_name = race_name
	if not keep_skin:
		_skin_color = str(skins[0]) if not skins.is_empty() else "#2D5A3D"
	_ensure_look_defaults()
	_refresh_race_cards()
	_refresh_lore()
	_refresh_looks_chips()
	_refresh_skin_swatch()
	_refresh_preview()
	_refresh_class_detail()
	_refresh_nav_gates()
	var hint := _pages[1].get_meta("race_hint") as Label
	if hint:
		var info := GameData.race_info(race_name)
		hint.text = "For %s %s" % [str(info.get("emoji", "")), race_name]


func _select_class(cls_name: String) -> void:
	_class_name = cls_name
	_refresh_class_cards()
	_refresh_class_detail()
	_refresh_looks_chips()
	_refresh_nav_gates()
	if _step == 3:
		_refresh_launch()


func _ensure_look_defaults() -> void:
	if _eye_style.is_empty():
		_eye_style = GameData.EYE_STYLES[0]
	if _ears.is_empty():
		_ears = GameData.EAR_STYLES[0]
	if _mouth.is_empty():
		_mouth = GameData.MOUTH_STYLES[0]
	if _nose.is_empty():
		_nose = GameData.NOSE_STYLES[0]
	if _eyebrows.is_empty():
		_eyebrows = GameData.BROW_STYLES[0]
	if _marking.is_empty():
		_marking = GameData.MARKINGS[0]
	if _skin_color.is_empty() and not _race_name.is_empty():
		var skins: Array = GameData.RACE_SKINS.get(_race_name, ["#2D5A3D"])
		_skin_color = str(skins[0]) if not skins.is_empty() else "#2D5A3D"


func _refresh_race_cards() -> void:
	for key in _race_cards:
		var btn := _race_cards[key] as Button
		var selected := str(key) == _race_name
		var accent: Color = btn.get_meta("accent", ClientUi.CYAN)
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(ClientUi.CYAN, 0.08) if selected else Color(0.06, 0.08, 0.12, 0.75)
		sb.set_border_width_all(2 if selected else 1)
		sb.border_color = ClientUi.CYAN if selected else Color(accent, 0.35)
		sb.set_corner_radius_all(12)
		sb.content_margin_left = 0
		sb.content_margin_right = 0
		sb.content_margin_top = 0
		sb.content_margin_bottom = 0
		btn.add_theme_stylebox_override("normal", sb)
		btn.add_theme_stylebox_override("hover", sb)
		btn.add_theme_stylebox_override("pressed", sb)
		btn.add_theme_stylebox_override("focus", sb)
		btn.add_theme_color_override("font_color", Color(0, 0, 0, 0))


func _refresh_class_cards() -> void:
	for key in _class_cards:
		var btn := _class_cards[key] as Button
		var selected := str(key) == _class_name
		var accent: Color = btn.get_meta("accent", ClientUi.VIOLET)
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(ClientUi.VIOLET, 0.12) if selected else Color(0.06, 0.08, 0.12, 0.65)
		sb.set_border_width_all(2 if selected else 1)
		sb.border_color = ClientUi.VIOLET if selected else Color(1, 1, 1, 0.12)
		sb.set_corner_radius_all(10)
		btn.add_theme_stylebox_override("normal", sb)
		btn.add_theme_stylebox_override("hover", sb)
		btn.add_theme_stylebox_override("pressed", sb)
		btn.add_theme_stylebox_override("focus", sb)
		btn.add_theme_color_override("font_color", Color(0, 0, 0, 0))
		# soft accent wash via border when selected
		if selected:
			sb.border_color = Color(accent, 0.85)


func _refresh_lore() -> void:
	for c in _lore_host.get_children():
		c.queue_free()
	if _race_name.is_empty():
		_lore_host.visible = false
		return
	_lore_host.visible = true
	var info := GameData.race_info(_race_name)
	var accent: Color = GameData.RACE_ACCENT.get(_race_name, ClientUi.CYAN)

	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(accent, 0.08)
	sb.set_border_width_all(1)
	sb.border_color = Color(accent, 0.35)
	sb.set_corner_radius_all(12)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", sb)
	_lore_host.add_child(panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	panel.add_child(row)

	var av := CenterContainer.new()
	av.custom_minimum_size = Vector2(123, 123)
	row.add_child(av)
	av.add_child(AvatarRenderer.make_portrait(_fake_character(), 84.0))

	var copy := VBoxContainer.new()
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.add_theme_constant_override("separation", 4)
	row.add_child(copy)
	var title := Label.new()
	title.text = "%s %s" % [str(info.get("emoji", "")), _race_name]
	title.add_theme_font_size_override("font_size", 16)
	ClientUi.apply_display_font(title)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	copy.add_child(title)
	var lore := Label.new()
	lore.text = str(info.get("lore", ""))
	lore.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lore.add_theme_font_size_override("font_size", 15)
	lore.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(lore)
	copy.add_child(lore)


func _refresh_class_detail() -> void:
	for c in _class_detail_host.get_children():
		c.queue_free()
	if _class_name.is_empty():
		var empty := PanelContainer.new()
		empty.size_flags_vertical = Control.SIZE_EXPAND_FILL
		var esb := StyleBoxFlat.new()
		esb.bg_color = Color(0.06, 0.08, 0.12, 0.4)
		esb.set_border_width_all(1)
		esb.border_color = Color(1, 1, 1, 0.12)
		esb.set_corner_radius_all(12)
		esb.draw_center = true
		empty.add_theme_stylebox_override("panel", esb)
		_class_detail_host.add_child(empty)
		var wrap := VBoxContainer.new()
		wrap.alignment = BoxContainer.ALIGNMENT_CENTER
		empty.add_child(wrap)
		var star := Label.new()
		star.text = "✦"
		star.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		star.add_theme_font_size_override("font_size", 29)
		star.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.6))
		wrap.add_child(star)
		var t := Label.new()
		t.text = "Choose a class"
		t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		t.add_theme_font_size_override("font_size", 17)
		ClientUi.apply_display_font(t)
		t.add_theme_color_override("font_color", ClientUi.MUTED)
		wrap.add_child(t)
		var hint := Label.new()
		hint.text = "Pick a kit on the left to preview its special, identity, and starting attributes."
		hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		hint.add_theme_font_size_override("font_size", 15)
		hint.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.8))
		ClientUi.apply_body_font(hint)
		wrap.add_child(hint)
		return

	var info := GameData.class_info(_class_name)
	var primary := str(info.get("primaryStat", "strength"))
	var accent: Color = GameData.STAT_COLORS.get(primary, ClientUi.VIOLET)
	var special: Dictionary = info.get("special", {})

	var top := PanelContainer.new()
	var tsb := StyleBoxFlat.new()
	tsb.bg_color = Color(accent, 0.1)
	tsb.set_border_width_all(1)
	tsb.border_color = Color(1, 1, 1, 0.12)
	tsb.set_corner_radius_all(12)
	tsb.content_margin_left = 12
	tsb.content_margin_right = 12
	tsb.content_margin_top = 10
	tsb.content_margin_bottom = 10
	top.add_theme_stylebox_override("panel", tsb)
	_class_detail_host.add_child(top)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	top.add_child(row)
	var emblem := Label.new()
	emblem.text = str(info.get("emoji", "✦"))
	emblem.add_theme_font_size_override("font_size", 48)
	emblem.custom_minimum_size = Vector2(75, 75)
	emblem.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	emblem.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(emblem)

	var copy := VBoxContainer.new()
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.add_theme_constant_override("separation", 4)
	row.add_child(copy)
	var title := Label.new()
	title.text = "%s %s" % [str(info.get("emoji", "")), _class_name]
	title.add_theme_font_size_override("font_size", 17)
	ClientUi.apply_display_font(title)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	copy.add_child(title)
	var desc := Label.new()
	desc.text = str(info.get("description", ""))
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.add_theme_font_size_override("font_size", 15)
	desc.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(desc)
	copy.add_child(desc)
	if not special.is_empty():
		var sp_name := Label.new()
		sp_name.text = str(special.get("name", ""))
		sp_name.add_theme_font_size_override("font_size", 15)
		ClientUi.apply_display_font(sp_name)
		sp_name.add_theme_color_override("font_color", ClientUi.CYAN)
		copy.add_child(sp_name)
		var sp_fx := Label.new()
		sp_fx.text = str(special.get("effect", ""))
		sp_fx.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		sp_fx.add_theme_font_size_override("font_size", 13)
		sp_fx.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(sp_fx)
		copy.add_child(sp_fx)
		var sp_id := Label.new()
		sp_id.text = str(special.get("identity", ""))
		sp_id.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		sp_id.add_theme_font_size_override("font_size", 12)
		sp_id.add_theme_color_override("font_color", Color(ClientUi.GOLD, 0.85))
		ClientUi.apply_body_font(sp_id)
		copy.add_child(sp_id)

	var stats_panel := PanelContainer.new()
	stats_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var ssb := StyleBoxFlat.new()
	ssb.bg_color = Color(0.04, 0.06, 0.1, 0.55)
	ssb.set_border_width_all(1)
	ssb.border_color = Color(1, 1, 1, 0.1)
	ssb.set_corner_radius_all(12)
	ssb.content_margin_left = 10
	ssb.content_margin_right = 10
	ssb.content_margin_top = 8
	ssb.content_margin_bottom = 8
	stats_panel.add_theme_stylebox_override("panel", ssb)
	_class_detail_host.add_child(stats_panel)
	var stats_host := VBoxContainer.new()
	stats_panel.add_child(stats_host)
	_fill_stats_chart(stats_host, true)


func _fill_stats_chart(host: VBoxContainer, compact: bool) -> void:
	for c in host.get_children():
		c.queue_free()
	if _class_name.is_empty():
		return
	var info := GameData.class_info(_class_name)
	var primary := str(info.get("primaryStat", ""))
	var secondary := str(info.get("secondaryStat", ""))
	var stats := GameData.preview_stats(_race_name if not _race_name.is_empty() else "Zyrathi", _class_name)
	var max_val := 1
	for k in STAT_ORDER:
		max_val = maxi(max_val, int(stats.get(k, 0)))

	var head := HBoxContainer.new()
	host.add_child(head)
	var h := Label.new()
	h.text = "STARTING STATS"
	h.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_theme_font_size_override("font_size", 13)
	ClientUi.apply_display_font(h)
	h.add_theme_color_override("font_color", ClientUi.MUTED)
	head.add_child(h)
	if not primary.is_empty():
		var pri := Label.new()
		pri.text = "Primary: %s" % str(STAT_LABELS.get(primary, primary))
		pri.add_theme_font_size_override("font_size", 12)
		pri.add_theme_color_override("font_color", GameData.STAT_COLORS.get(primary, ClientUi.MUTED))
		ClientUi.apply_body_font(pri)
		head.add_child(pri)

	for stat in STAT_ORDER:
		var val := int(stats.get(stat, 0))
		var color: Color = GameData.STAT_COLORS.get(stat, ClientUi.MUTED)
		var row := PanelContainer.new()
		var rsb := StyleBoxFlat.new()
		rsb.bg_color = Color(color, 0.12)
		rsb.set_border_width_all(1)
		if stat == primary:
			rsb.border_color = Color(color, 0.55)
		elif stat == secondary:
			rsb.border_color = Color(color, 0.28)
		else:
			rsb.border_color = Color(1, 1, 1, 0.08)
		rsb.set_corner_radius_all(8)
		rsb.content_margin_left = 8
		rsb.content_margin_right = 8
		rsb.content_margin_top = 5
		rsb.content_margin_bottom = 5
		row.add_theme_stylebox_override("panel", rsb)
		host.add_child(row)

		var inner := HBoxContainer.new()
		inner.add_theme_constant_override("separation", 6)
		row.add_child(inner)
		var icon := StatIcon.make(stat, 16.0)
		inner.add_child(icon)
		var nm := Label.new()
		var suffix := ""
		if stat == primary:
			suffix = " Pri"
		elif stat == secondary:
			suffix = " Sec"
		nm.text = "%s%s" % [str(STAT_LABELS.get(stat, stat)), suffix]
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		nm.add_theme_font_size_override("font_size", 10 if compact else 11)
		ClientUi.apply_display_font(nm)
		nm.add_theme_color_override("font_color", color.lightened(0.25))
		inner.add_child(nm)
		var num := Label.new()
		num.text = str(val)
		num.add_theme_font_size_override("font_size", 16)
		ClientUi.apply_display_font(num)
		num.add_theme_color_override("font_color", color.lightened(0.25))
		inner.add_child(num)
		var bar_bg := ProgressBar.new()
		bar_bg.custom_minimum_size = Vector2(75, 8)
		bar_bg.max_value = float(max_val)
		bar_bg.value = float(val)
		bar_bg.show_percentage = false
		bar_bg.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var bar_bg_sb := StyleBoxFlat.new()
		bar_bg_sb.bg_color = Color(0, 0, 0, 0.3)
		bar_bg_sb.set_corner_radius_all(3)
		bar_bg.add_theme_stylebox_override("background", bar_bg_sb)
		var bar_fill_sb := StyleBoxFlat.new()
		bar_fill_sb.bg_color = color
		bar_fill_sb.set_corner_radius_all(3)
		bar_bg.add_theme_stylebox_override("fill", bar_fill_sb)
		inner.add_child(bar_bg)

	if not _race_name.is_empty():
		var note := Label.new()
		note.text = "Includes %s racial bonuses%s." % [
			_race_name,
			" on the preview values" if compact else "",
		]
		note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		note.add_theme_font_size_override("font_size", 12)
		note.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(note)
		host.add_child(note)


func _refresh_looks_chips() -> void:
	if _looks_race_chip:
		_looks_race_chip.text = _race_name
		_looks_race_chip.visible = not _race_name.is_empty()
	if _looks_class_chip:
		_looks_class_chip.text = _class_name
		_looks_class_chip.visible = not _class_name.is_empty()


func _refresh_skin_swatch() -> void:
	if _skin_swatch == null:
		return
	_skin_swatch.color = Color(_skin_color) if not _skin_color.is_empty() else Color("#888888")


func _refresh_arrow_labels() -> void:
	for field in _arrow_value_labs:
		var lab := _arrow_value_labs[field] as Label
		lab.text = _get_field(str(field))


func _fake_character() -> Dictionary:
	return {
		"race": _race_name if not _race_name.is_empty() else "Zyrathi",
		"class": _class_name,
		"appearance": _appearance(),
	}


func _appearance() -> Dictionary:
	_ensure_look_defaults()
	return {
		"skin_color": _skin_color if not _skin_color.is_empty() else "#2D5A3D",
		"eye_style": _eye_style,
		"ears": _ears,
		"mouth": _mouth,
		"nose": _nose,
		"eyebrows": _eyebrows,
		"marking": _marking,
	}


func _refresh_preview() -> void:
	if _looks_preview_host == null:
		return
	for c in _looks_preview_host.get_children():
		c.queue_free()
	if _race_name.is_empty():
		return
	_looks_preview_host.add_child(AvatarRenderer.make_portrait(_fake_character(), 148.0))


func _refresh_launch() -> void:
	if _launch_preview_host == null:
		return
	for c in _launch_preview_host.get_children():
		c.queue_free()
	_launch_preview_host.add_child(AvatarRenderer.make_portrait(_fake_character(), 132.0))
	if _legacy_block != null:
		_legacy_block.visible = _legacy_required()
		_refresh_legacy_meta()
	var nm := _name.text.strip_edges() if _name else ""
	var shown := LegacyName.full_name({
		"name": nm,
		"legacy_name": _pending_legacy_name(),
		"legacy_display": LegacyName.normalize_display(
			AuthManager.user.get("legacy_display", "surname") if AuthManager != null else "surname"
		),
	})
	_launch_name.text = shown if not shown.is_empty() else "Unnamed Operative"
	_launch_meta.text = "%s · %s" % [_race_name, _class_name]
	_fill_stats_chart(_launch_stats_host, false)


## Account surname, or the one being locked in on this Launch step.
func _pending_legacy_name() -> String:
	var last := ""
	if AuthManager != null:
		last = LegacyName.clean_text(AuthManager.user.get("legacy_name", ""))
	if last.is_empty() and _legacy_field != null:
		last = _legacy_field.text.strip_edges()
	return last


func _randomize_looks() -> void:
	if _race_name.is_empty():
		return
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var skins: Array = GameData.RACE_SKINS.get(_race_name, ["#2D5A3D"])
	_skin_color = str(skins[rng.randi_range(0, skins.size() - 1)])
	_eye_style = GameData.EYE_STYLES[rng.randi_range(0, GameData.EYE_STYLES.size() - 1)]
	_ears = GameData.EAR_STYLES[rng.randi_range(0, GameData.EAR_STYLES.size() - 1)]
	_mouth = GameData.MOUTH_STYLES[rng.randi_range(0, GameData.MOUTH_STYLES.size() - 1)]
	_nose = GameData.NOSE_STYLES[rng.randi_range(0, GameData.NOSE_STYLES.size() - 1)]
	_eyebrows = GameData.BROW_STYLES[rng.randi_range(0, GameData.BROW_STYLES.size() - 1)]
	_marking = GameData.MARKINGS[rng.randi_range(0, GameData.MARKINGS.size() - 1)]
	_refresh_skin_swatch()
	_refresh_arrow_labels()
	_refresh_preview()


# ─── Steps / nav ─────────────────────────────────────────────────────────────

func _set_step(next_step: int) -> void:
	if next_step > _step and not _can_advance_from(_step):
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = _step_block_reason(_step)
		return
	_status.text = ""
	_step = clampi(next_step, 0, 3)
	for i in _pages.size():
		_pages[i].visible = i == _step
	_style_step_indicators()
	_prev_btn.disabled = _step == 0
	_next_btn.visible = _step < 3
	_create_btn.visible = _step == 3
	if _step == 2:
		_schedule_name_check()
	if _step == 3:
		_refresh_launch()
	_refresh_nav_gates()


func _style_step_indicators() -> void:
	for i in _step_dots.size():
		var dot := _step_dots[i]
		var lab := dot.get_child(0) as Label
		var sb := StyleBoxFlat.new()
		sb.set_corner_radius_all(14)
		sb.set_border_width_all(1)
		if i < _step:
			sb.bg_color = ClientUi.CYAN
			sb.border_color = ClientUi.CYAN
			lab.add_theme_color_override("font_color", ClientUi.VOID)
			_step_labels[i].add_theme_color_override("font_color", ClientUi.CYAN)
		elif i == _step:
			sb.bg_color = Color(0, 0, 0, 0)
			sb.border_color = ClientUi.CYAN
			lab.add_theme_color_override("font_color", ClientUi.CYAN)
			_step_labels[i].add_theme_color_override("font_color", ClientUi.CYAN)
		else:
			sb.bg_color = Color(0, 0, 0, 0)
			sb.border_color = Color(ClientUi.MUTED, 0.3)
			lab.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.45))
			_step_labels[i].add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.4))
		dot.add_theme_stylebox_override("panel", sb)
	for i in _step_connectors.size():
		_step_connectors[i].color = ClientUi.CYAN if i < _step else Color(ClientUi.MUTED, 0.2)


func _can_advance_from(step: int) -> bool:
	match step:
		0:
			return not _race_name.is_empty()
		1:
			return not _class_name.is_empty()
		2:
			return _name_status == "available"
		_:
			return true


func _step_block_reason(step: int) -> String:
	match step:
		0:
			return "Pick a race first."
		1:
			return "Pick a class first."
		2:
			return _name_status_message()
		_:
			return ""


func _refresh_nav_gates() -> void:
	if _next_btn != null:
		_next_btn.disabled = not _can_advance_from(_step)
	if _create_btn != null:
		_create_btn.disabled = _busy or _name.text.strip_edges().length() < 2 or not _legacy_ready()
	_next_hint.text = ""
	if _step == 3 and not _legacy_ready():
		_next_hint.text = "Need a legacy name"
	if _step == 2:
		var trimmed := _name.text.strip_edges()
		if trimmed.is_empty():
			_next_hint.text = "Need a name"
		elif _name_status == "has_digits":
			_next_hint.text = NAME_NO_DIGITS_MSG
		elif _name_status == "has_spaces":
			_next_hint.text = NAME_NO_SPACES_MSG
		elif _name_status == "too_short":
			_next_hint.text = "Need at least 2 characters"
		elif _name_status == "checking":
			_next_hint.text = "Checking name…"
		elif _name_status == "taken":
			_next_hint.text = "Name taken"
		elif _name_status != "available":
			_next_hint.text = "Need a name"


func _on_cancel() -> void:
	if _existing_char_count > 0:
		GameManager.go_character_select()
	else:
		GameManager.go_login()


# ─── Name check ──────────────────────────────────────────────────────────────

func _on_name_changed(text: String) -> void:
	var cleaned := ""
	for ch in text:
		if ch >= "0" and ch <= "9":
			continue
		cleaned += ch
	if cleaned != text:
		var caret := _name.caret_column
		_name.text = cleaned
		_name.caret_column = mini(caret, cleaned.length())
	_schedule_name_check()


func _schedule_name_check() -> void:
	_name_check_token += 1
	var token := _name_check_token
	var trimmed := _name.text.strip_edges()
	if trimmed.is_empty():
		_name_status = "idle"
		_update_name_status_ui()
		return
	for ch in trimmed:
		if ch >= "0" and ch <= "9":
			_name_status = "has_digits"
			_update_name_status_ui()
			return
	if _has_whitespace(trimmed):
		_name_status = "has_spaces"
		_update_name_status_ui()
		return
	if trimmed.length() < 2:
		_name_status = "too_short"
		_update_name_status_ui()
		return
	_name_status = "checking"
	_update_name_status_ui()
	await get_tree().create_timer(0.45).timeout
	if token != _name_check_token:
		return
	var res: Dictionary = await GameApiClient.request(
		"POST",
		"/api/entities/Character/filter",
		{"query": {"name": trimmed}, "sort": "-created_date", "limit": 1},
		true
	)
	if token != _name_check_token:
		return
	if not res.ok:
		_name_status = "idle"
	elif typeof(res.data) == TYPE_ARRAY and not (res.data as Array).is_empty():
		_name_status = "taken"
	else:
		_name_status = "available"
	_update_name_status_ui()


func _name_status_message() -> String:
	match _name_status:
		"checking":
			return "Checking name…"
		"available":
			return "Name available."
		"taken":
			return "Taken. Try again, hotshot."
		"too_short":
			return "At least 2 characters."
		"has_digits":
			return NAME_NO_DIGITS_MSG
		"has_spaces":
			return NAME_NO_SPACES_MSG
		_:
			return "Need a name."


func _update_name_status_ui() -> void:
	if _name_hint == null:
		return
	match _name_status:
		"taken":
			_name_hint.text = "Taken. Try again, hotshot."
			_name_hint.add_theme_color_override("font_color", ClientUi.DANGER)
			_name_icon.text = "✕"
			_name_icon.add_theme_color_override("font_color", ClientUi.DANGER)
		"too_short":
			_name_hint.text = "At least 2 characters."
			_name_hint.add_theme_color_override("font_color", ClientUi.DANGER)
			_name_icon.text = "✕"
			_name_icon.add_theme_color_override("font_color", ClientUi.DANGER)
		"has_digits":
			_name_hint.text = NAME_NO_DIGITS_MSG
			_name_hint.add_theme_color_override("font_color", ClientUi.DANGER)
			_name_icon.text = "✕"
			_name_icon.add_theme_color_override("font_color", ClientUi.DANGER)
		"has_spaces":
			_name_hint.text = NAME_NO_SPACES_MSG
			_name_hint.add_theme_color_override("font_color", ClientUi.DANGER)
			_name_icon.text = "✕"
			_name_icon.add_theme_color_override("font_color", ClientUi.DANGER)
		"available":
			_name_hint.text = ""
			_name_icon.text = "✓"
			_name_icon.add_theme_color_override("font_color", ClientUi.SUCCESS)
		"checking":
			_name_hint.text = ""
			_name_icon.text = "…"
			_name_icon.add_theme_color_override("font_color", ClientUi.MUTED)
		_:
			_name_hint.text = ""
			_name_icon.text = ""
	_refresh_nav_gates()


# ─── Load / create ───────────────────────────────────────────────────────────

func _load_slot_info() -> void:
	var me: Dictionary = await AuthManager.fetch_me()
	if not me.ok:
		_status.text = str(me.get("error", "Could not load profile"))
		return
	var list_res: Dictionary = await AuthManager.list_characters()
	if list_res.ok and typeof(list_res.data) == TYPE_ARRAY:
		_existing_char_count = list_res.data.size()
		_is_first = list_res.data.is_empty()
		var purchased := int(AuthManager.user.get("purchased_slots", 0))
		var max_slots := mini(3, 1 + purchased)
		if list_res.data.size() >= max_slots:
			_status.add_theme_color_override("font_color", ClientUi.DANGER)
			_status.text = "No free character slots (max %s)." % max_slots
			GameManager.go_character_select()


func _on_create() -> void:
	if _busy:
		return
	var char_name := _name.text.strip_edges()
	if char_name.length() < 2 or char_name.length() > 24:
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = "Name must be at least 2 characters."
		_set_step(2)
		return
	for ch in char_name:
		if ch >= "0" and ch <= "9":
			_status.add_theme_color_override("font_color", ClientUi.DANGER)
			_status.text = NAME_NO_DIGITS_MSG
			_set_step(2)
			return
	if _has_whitespace(char_name):
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = NAME_NO_SPACES_MSG
		_set_step(2)
		return
	if _name_status != "available":
		await _schedule_name_check()
		if _name_status != "available":
			_status.add_theme_color_override("font_color", ClientUi.DANGER)
			_status.text = _name_status_message()
			_set_step(2)
			return
	if _race_name.is_empty() or _class_name.is_empty():
		_status.text = "Pick a race and class first."
		return
	# Lock the account surname before the create so the operative inherits it.
	if _legacy_required():
		var legacy := _legacy_field.text.strip_edges()
		if not _legacy_ready():
			_status.add_theme_color_override("font_color", ClientUi.DANGER)
			_status.text = NAME_NO_DIGITS_MSG if _has_digits(legacy) else "Legacy name must be 2–20 characters."
			return
		_busy = true
		_refresh_nav_gates()
		_status.add_theme_color_override("font_color", ClientUi.MUTED)
		_status.text = "Locking legacy name…"
		var legacy_res: Dictionary = await AccountManager.set_legacy_name(legacy)
		_busy = false
		_refresh_nav_gates()
		if not legacy_res.ok:
			_status.add_theme_color_override("font_color", ClientUi.DANGER)
			_status.text = str(legacy_res.get("error", "Could not set legacy name."))
			return
		await AuthManager.fetch_me()

	var payload := GameData.build_create_payload(char_name, _race_name, _class_name, _is_first, _appearance())
	_busy = true
	_refresh_nav_gates()
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	_status.text = "Creating…"
	if _create_request_id.is_empty():
		_create_request_id = "char-%s" % Crypto.new().generate_random_bytes(16).hex_encode()
	var res: Dictionary = await AuthManager.create_character(payload, _create_request_id)
	_busy = false
	_refresh_nav_gates()
	if not res.ok:
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = str(res.get("error", "Could not create character. Try again."))
		return
	var character: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var cid := str(character.get("id", ""))
	if not cid.is_empty():
		var selected: Dictionary = await AuthManager.select_character(cid)
		if not selected.ok:
			_status.add_theme_color_override("font_color", ClientUi.DANGER)
			_status.text = str(selected.get("error", "Character created, but selection failed."))
			return
		var loaded: Dictionary = await AuthManager.get_selected_character()
		if not loaded.ok or typeof(loaded.get("data", null)) != TYPE_DICTIONARY:
			_status.add_theme_color_override("font_color", ClientUi.DANGER)
			_status.text = str(loaded.get("error", "Character created, but loading failed."))
			return
		_create_request_id = ""
		GameManager.go_hub(loaded.data)
	else:
		GameManager.go_character_select()
