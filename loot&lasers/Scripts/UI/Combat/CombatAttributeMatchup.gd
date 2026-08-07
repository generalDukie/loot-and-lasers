class_name CombatAttributeMatchup
extends RefCounted
## Presentation-only raw attribute comparison for duel overlays.
## Values come from StatsRules.display_totals — never recalculates combat math.

const ATTR_KEYS: PackedStringArray = ["strength", "agility", "intellect", "vitality", "luck"]
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
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(
			Color(0.03, 0.05, 0.1, 0.82),
			Color("#FBBF24", 0.35),
			10,
			1
		)
	)
	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", int(10 * s))
	pad.add_theme_constant_override("margin_right", int(10 * s))
	pad.add_theme_constant_override("margin_top", int(8 * s))
	pad.add_theme_constant_override("margin_bottom", int(8 * s))
	panel.add_child(pad)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", int(5 * s))
	pad.add_child(col)

	var title := Label.new()
	title.text = "ATTRIBUTE MATCHUP"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", int(13 * s))
	title.add_theme_color_override("font_color", Color("#FCD34D", 0.9))
	ClientUi.apply_display_font(title)
	col.add_child(title)

	var bar_w := int(72 * s)
	var bar_h := maxi(8, int(10 * s))
	var val_font := maxi(14, int(16 * s))
	var name_font := maxi(11, int(12 * s))

	for key in ATTR_KEYS:
		var p_val := int(player_totals.get(key, 0))
		var e_val := int(enemy_totals.get(key, 0))
		var row := _make_row(
			key, p_val, e_val, bar_w, bar_h, val_font, name_font, s,
			player_character, player_items
		)
		col.add_child(row)

	return panel


static func _make_row(
	key: String,
	p_val: int,
	e_val: int,
	bar_w: int,
	bar_h: int,
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

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", int(6 * s))
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.tooltip_text = StatsRules.attribute_tooltip(key, player_character, player_items)

	var p_lab := Label.new()
	p_lab.text = str(p_val)
	p_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	p_lab.custom_minimum_size.x = int(44 * s)
	p_lab.add_theme_font_size_override("font_size", val_font)
	p_lab.add_theme_color_override("font_color", color.lightened(0.15) if p_adv else Color(color, 0.72 if not e_adv else 0.55))
	ClientUi.apply_display_font(p_lab)
	row.add_child(p_lab)

	row.add_child(_meter(float(p_val) / float(peak), bar_w, bar_h, color, true, p_adv))

	var mid := Label.new()
	mid.text = str(ATTR_SHORT.get(key, key.to_upper()))
	mid.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mid.custom_minimum_size.x = int(40 * s)
	mid.add_theme_font_size_override("font_size", name_font)
	mid.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(mid)
	mid.tooltip_text = StatsRules.attribute_tooltip(key, player_character, player_items)
	row.add_child(mid)

	row.add_child(_meter(float(e_val) / float(peak), bar_w, bar_h, color, false, e_adv))

	var e_lab := Label.new()
	e_lab.text = str(e_val)
	e_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	e_lab.custom_minimum_size.x = int(44 * s)
	e_lab.add_theme_font_size_override("font_size", val_font)
	e_lab.add_theme_color_override("font_color", color.lightened(0.15) if e_adv else Color(color, 0.72 if not p_adv else 0.55))
	ClientUi.apply_display_font(e_lab)
	row.add_child(e_lab)

	return row


static func _meter(fill: float, width: int, height: int, color: Color, grow_left: bool, advantage: bool) -> Control:
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
	if grow_left:
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
