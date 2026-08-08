class_name CombatAttributeMatchup
extends RefCounted
## Presentation-only raw attribute comparison for duel overlays.
## Values come from StatsRules.display_totals — never recalculates combat math.

const ATTR_KEYS: PackedStringArray = ["strength", "agility", "intellect", "vitality", "luck"]
const ATTR_LABELS := {
	"strength": "Strength",
	"agility": "Agility",
	"intellect": "Intelligence",
	"vitality": "Vitality",
	"luck": "Luck",
}
const ATTR_SHORT := {
	"strength": "STR",
	"agility": "AGI",
	"intellect": "INT",
	"vitality": "VIT",
	"luck": "LUK",
}


static func make_panel(
	player_totals: Dictionary,
	enemy_totals: Dictionary,
	player_character: Dictionary = {},
	_enemy_character: Dictionary = {},
	player_items: Array = [],
	_enemy_items: Array = [],
	ui_scale: float = 1.0
) -> PanelContainer:
	var s := clampf(ui_scale, 0.75, 1.35)
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.custom_minimum_size = Vector2(int(420 * s), 0)
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(
			Color(0.025, 0.04, 0.09, 0.9),
			Color("#FBBF24", 0.42),
			14,
			1
		)
	)
	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", int(16 * s))
	pad.add_theme_constant_override("margin_right", int(16 * s))
	pad.add_theme_constant_override("margin_top", int(12 * s))
	pad.add_theme_constant_override("margin_bottom", int(12 * s))
	panel.add_child(pad)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", int(8 * s))
	pad.add_child(col)

	var title := Label.new()
	title.text = "ATTRIBUTE MATCHUP"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", int(15 * s))
	title.add_theme_color_override("font_color", Color("#FCD34D", 0.95))
	ClientUi.apply_display_font(title)
	col.add_child(title)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", int(8 * s))
	col.add_child(head)
	head.add_child(_header_lab("YOU", Color("#22D3EE"), s, true))
	var head_mid := Control.new()
	head_mid.custom_minimum_size.x = int(72 * s)
	head_mid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	head.add_child(head_mid)
	head.add_child(_header_lab("FOE", Color("#FB7185"), s, false))

	var row_h := int(34 * s)
	var val_font := maxi(15, int(17 * s))
	var name_font := maxi(12, int(13 * s))
	var bar_w := int(96 * s)
	var bar_h := maxi(10, int(12 * s))

	for key in ATTR_KEYS:
		var p_val := int(player_totals.get(key, 0))
		var e_val := int(enemy_totals.get(key, 0))
		col.add_child(_make_row(
			key, p_val, e_val, bar_w, bar_h, row_h, val_font, name_font, s,
			player_character, player_items
		))

	return panel


static func _header_lab(text: String, color: Color, s: float, expand: bool) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL if expand else Control.SIZE_EXPAND_FILL
	lab.add_theme_font_size_override("font_size", int(12 * s))
	lab.add_theme_color_override("font_color", Color(color, 0.85))
	ClientUi.apply_display_font(lab)
	return lab


static func _make_row(
	key: String,
	p_val: int,
	e_val: int,
	bar_w: int,
	bar_h: int,
	row_h: int,
	val_font: int,
	name_font: int,
	s: float,
	player_character: Dictionary,
	player_items: Array
) -> Control:
	var color: Color = GameData.stat_color(key) if GameData != null else Color("#A5B4FC")
	var peak := maxi(1, maxi(p_val, e_val))
	var p_adv := p_val > e_val
	var e_adv := e_val > p_val
	var tip := StatsRules.attribute_tooltip(key, player_character, player_items)

	var row := PanelContainer.new()
	row.custom_minimum_size.y = row_h
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.tooltip_text = tip
	var row_bg := StyleBoxFlat.new()
	row_bg.bg_color = Color(color, 0.07)
	row_bg.border_color = Color(color, 0.22)
	row_bg.set_border_width_all(1)
	row_bg.set_corner_radius_all(8)
	row_bg.content_margin_left = int(10 * s)
	row_bg.content_margin_right = int(10 * s)
	row_bg.content_margin_top = int(4 * s)
	row_bg.content_margin_bottom = int(4 * s)
	row.add_theme_stylebox_override("panel", row_bg)

	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", int(8 * s))
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hb.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_child(hb)

	# Player value + meter (fill grows toward center / right).
	var p_side := HBoxContainer.new()
	p_side.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p_side.add_theme_constant_override("separation", int(6 * s))
	p_side.alignment = BoxContainer.ALIGNMENT_END
	hb.add_child(p_side)

	var p_lab := Label.new()
	p_lab.text = str(p_val)
	p_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	p_lab.custom_minimum_size.x = int(40 * s)
	p_lab.add_theme_font_size_override("font_size", val_font)
	p_lab.add_theme_color_override(
		"font_color",
		color.lightened(0.2) if p_adv else Color(color, 0.7 if not e_adv else 0.5)
	)
	ClientUi.apply_display_font(p_lab)
	p_side.add_child(p_lab)
	p_side.add_child(_meter(float(p_val) / float(peak), bar_w, bar_h, color, true, p_adv))

	# Center: short code + advantage chevron.
	var mid := VBoxContainer.new()
	mid.custom_minimum_size.x = int(72 * s)
	mid.alignment = BoxContainer.ALIGNMENT_CENTER
	mid.add_theme_constant_override("separation", 0)
	hb.add_child(mid)

	var mid_lab := Label.new()
	mid_lab.text = str(ATTR_SHORT.get(key, key.to_upper()))
	mid_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mid_lab.add_theme_font_size_override("font_size", name_font)
	mid_lab.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(mid_lab)
	mid_lab.tooltip_text = "%s\n%s" % [str(ATTR_LABELS.get(key, key)), tip]
	mid.add_child(mid_lab)

	var adv := Label.new()
	if p_adv:
		adv.text = "◀ ADV"
		adv.add_theme_color_override("font_color", Color("#22D3EE", 0.95))
	elif e_adv:
		adv.text = "ADV ▶"
		adv.add_theme_color_override("font_color", Color("#FB7185", 0.95))
	else:
		adv.text = "EVEN"
		adv.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.85))
	adv.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	adv.add_theme_font_size_override("font_size", maxi(10, int(11 * s)))
	ClientUi.apply_display_font(adv)
	mid.add_child(adv)

	# Enemy meter + value (fill grows toward center / left).
	var e_side := HBoxContainer.new()
	e_side.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	e_side.add_theme_constant_override("separation", int(6 * s))
	e_side.alignment = BoxContainer.ALIGNMENT_BEGIN
	hb.add_child(e_side)

	e_side.add_child(_meter(float(e_val) / float(peak), bar_w, bar_h, color, false, e_adv))
	var e_lab := Label.new()
	e_lab.text = str(e_val)
	e_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	e_lab.custom_minimum_size.x = int(40 * s)
	e_lab.add_theme_font_size_override("font_size", val_font)
	e_lab.add_theme_color_override(
		"font_color",
		color.lightened(0.2) if e_adv else Color(color, 0.7 if not p_adv else 0.5)
	)
	ClientUi.apply_display_font(e_lab)
	e_side.add_child(e_lab)

	return row


static func _meter(fill: float, width: int, height: int, color: Color, grow_from_right: bool, advantage: bool) -> Control:
	var host := Control.new()
	host.custom_minimum_size = Vector2(width, height)
	host.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var track := ColorRect.new()
	track.color = Color(0.06, 0.08, 0.14, 0.95)
	track.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(track)

	var meter := ColorRect.new()
	meter.color = Color(color, 0.95 if advantage else 0.55)
	meter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var w := maxf(2.0, float(width) * clampf(fill, 0.0, 1.0))
	if grow_from_right:
		meter.anchor_left = 1.0
		meter.anchor_right = 1.0
		meter.offset_left = -w
		meter.offset_right = 0
	else:
		meter.offset_left = 0
		meter.offset_right = w
	meter.offset_top = 0
	meter.offset_bottom = height
	host.add_child(meter)
	return host
