class_name InventoryFullSheet
extends Control
## Bag-full gate — send the player to sell at the Black Market or inspect Operative.

signal finished(action: String)

const AMBER := Color("#FBBF24")
## 1.3× the original inventory-full sheet (type, padding, buttons, card).
const SHEET_SCALE_NUMERATOR := 13
const SHEET_SCALE_DENOMINATOR := 10
const SHEET_MIN_WIDTH_BASE := 520
const ACTION_GAP_BASE := 8
const CARD_MARGIN_BASE := 18
const CARD_PAD_Y_BASE := 16
const BODY_GAP_BASE := 10
const TITLE_FS_BASE := 27
const EYEBROW_FS_BASE := 12
const BODY_FS_BASE := ClientUi.BODY_FS
const BUTTON_MIN_H_BASE := 40
const PANEL_RADIUS_BASE := 14
const PANEL_BORDER_BASE := 2
const SHEET_MIN_WIDTH := (SHEET_MIN_WIDTH_BASE * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR
const ACTION_GAP := (ACTION_GAP_BASE * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR
const CARD_MARGIN := (CARD_MARGIN_BASE * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR
const CARD_PAD_Y := (CARD_PAD_Y_BASE * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR
const BODY_GAP := (BODY_GAP_BASE * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR
const TITLE_FS := (TITLE_FS_BASE * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR
const EYEBROW_FS := (EYEBROW_FS_BASE * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR
const BODY_FS := (BODY_FS_BASE * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR
const BUTTON_MIN_H := (BUTTON_MIN_H_BASE * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR
const INTRO_FADE_SEC := 0.18
## Above page overlays (Corporate Offices commission popup is 140).
const SHEET_Z_INDEX := 160


func run(reason: String) -> String:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = SHEET_Z_INDEX
	_build(reason)
	var action: String = await finished
	return action if not action.is_empty() else "cancel"


func _build(reason: String) -> void:
	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scrim.color = Color(0.015, 0.018, 0.04, 0.85)
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	var card := PanelContainer.new()
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	card.custom_minimum_size = Vector2(SHEET_MIN_WIDTH, 0)
	card.add_theme_stylebox_override(
		"panel",
		_scale_flat_style(
			ClientUi.painted_panel_style(
				Color(0.045, 0.05, 0.085, 0.98), Color(AMBER, 0.65), PANEL_RADIUS_BASE, PANEL_BORDER_BASE
			)
		)
	)
	center.add_child(card)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", CARD_MARGIN)
	margin.add_theme_constant_override("margin_right", CARD_MARGIN)
	margin.add_theme_constant_override("margin_top", CARD_PAD_Y)
	margin.add_theme_constant_override("margin_bottom", CARD_PAD_Y)
	card.add_child(margin)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", BODY_GAP)
	margin.add_child(col)

	var eyebrow := Label.new()
	eyebrow.text = "BAG PRESSURE"
	eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	eyebrow.add_theme_font_size_override("font_size", EYEBROW_FS)
	eyebrow.add_theme_color_override("font_color", Color(AMBER, 0.75))
	ClientUi.apply_display_font(eyebrow)
	col.add_child(eyebrow)

	var title := Label.new()
	title.text = "INVENTORY FULL"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", TITLE_FS)
	title.add_theme_color_override("font_color", AMBER)
	ClientUi.apply_display_font(title)
	col.add_child(title)

	var sub := Label.new()
	sub.text = reason if not reason.is_empty() else "Free a backpack slot at the Black Market before this action."
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", BODY_FS)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	col.add_child(sub)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", ACTION_GAP)
	col.add_child(actions)

	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.custom_minimum_size.y = BUTTON_MIN_H
	cancel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(cancel)
	_scale_button(cancel)
	cancel.pressed.connect(func() -> void: _finish("cancel"))
	actions.add_child(cancel)

	var shop := Button.new()
	shop.text = "Black Market"
	shop.custom_minimum_size.y = BUTTON_MIN_H
	shop.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_accent_chip_button(shop)
	_scale_button(shop)
	shop.pressed.connect(func() -> void: _finish("shop"))
	actions.add_child(shop)

	var operative := Button.new()
	operative.text = "Operative"
	operative.custom_minimum_size.y = BUTTON_MIN_H
	operative.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(operative)
	_scale_button(operative)
	operative.pressed.connect(func() -> void: _finish("inventory"))
	actions.add_child(operative)

	card.modulate.a = 0.0
	var tw := card.create_tween()
	tw.tween_property(card, "modulate:a", 1.0, INTRO_FADE_SEC).set_ease(Tween.EASE_OUT)


func _finish(action: String) -> void:
	finished.emit(action)


func _scaled(value: int) -> int:
	return (value * SHEET_SCALE_NUMERATOR) / SHEET_SCALE_DENOMINATOR


func _scale_flat_style(src: StyleBox) -> StyleBox:
	var s := src.duplicate() as StyleBoxFlat
	if s == null:
		return src
	s.content_margin_left = float(_scaled(int(s.content_margin_left)))
	s.content_margin_right = float(_scaled(int(s.content_margin_right)))
	s.content_margin_top = float(_scaled(int(s.content_margin_top)))
	s.content_margin_bottom = float(_scaled(int(s.content_margin_bottom)))
	s.corner_radius_top_left = _scaled(s.corner_radius_top_left)
	s.corner_radius_top_right = _scaled(s.corner_radius_top_right)
	s.corner_radius_bottom_left = _scaled(s.corner_radius_bottom_left)
	s.corner_radius_bottom_right = _scaled(s.corner_radius_bottom_right)
	s.border_width_left = maxi(1, _scaled(s.border_width_left))
	s.border_width_top = maxi(1, _scaled(s.border_width_top))
	s.border_width_right = maxi(1, _scaled(s.border_width_right))
	s.border_width_bottom = maxi(1, _scaled(s.border_width_bottom))
	s.shadow_size = _scaled(s.shadow_size)
	s.shadow_offset = Vector2(
		float(_scaled(int(round(s.shadow_offset.x)))),
		float(_scaled(int(round(s.shadow_offset.y))))
	)
	return s


func _scale_button(btn: Button) -> void:
	btn.add_theme_font_size_override("font_size", _scaled(btn.get_theme_font_size("font_size")))
	for state in ["normal", "hover", "pressed", "disabled", "focus"]:
		if btn.has_theme_stylebox_override(state):
			btn.add_theme_stylebox_override(state, _scale_flat_style(btn.get_theme_stylebox(state)))
