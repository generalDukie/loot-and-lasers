extends Control
class_name Codex
## Codex — mirrors web CodexModal layout, tabs, and rich guide body.

var _tabs: HBoxContainer
var _body: RichTextLabel
var _section := "start"
var _tab_buttons: Array[Button] = []
var _sheet: PanelContainer


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()
	_show_section(_section)
	mark_seen_for_active()
	# Entry motion — match web spring fade without Control.scale.
	if is_instance_valid(_sheet):
		_sheet.modulate.a = 0.0
		var tw := _sheet.create_tween()
		tw.tween_property(_sheet, "modulate:a", 1.0, 0.22).set_ease(Tween.EASE_OUT)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if (event as InputEventKey).keycode == KEY_ESCAPE:
			GameManager.close_overlay()
			get_viewport().set_input_as_handled()


func _build() -> void:
	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scrim.color = Color(0.04, 0.05, 0.08, 0.80)
	scrim.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			GameManager.close_overlay()
	)
	add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	# Web: max-w-2xl ≈ 672px, max-h ~84%.
	_sheet = PanelContainer.new()
	_sheet.custom_minimum_size = Vector2(896, 747)
	_sheet.mouse_filter = Control.MOUSE_FILTER_STOP
	_sheet.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.055, 0.065, 0.1, 0.97), Color(0.35, 0.42, 0.52, 0.55), 16, 1)
	)
	center.add_child(_sheet)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 0)
	_sheet.add_child(root)

	# —— Header: book + title | X ——
	var header := MarginContainer.new()
	header.add_theme_constant_override("margin_left", 14)
	header.add_theme_constant_override("margin_right", 10)
	header.add_theme_constant_override("margin_top", 12)
	header.add_theme_constant_override("margin_bottom", 10)
	root.add_child(header)
	var head_row := HBoxContainer.new()
	head_row.add_theme_constant_override("separation", 8)
	header.add_child(head_row)

	head_row.add_child(UiIcon.make("book-open", ClientUi.CYAN, 24.0))

	var title := Label.new()
	title.text = "Codex & Guide"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	head_row.add_child(title)

	var close := Button.new()
	close.text = ""
	close.flat = true
	close.custom_minimum_size = Vector2(43, 37)
	UiIcon.set_button_icon(close, "x", ClientUi.MUTED, 18.0)
	close.pressed.connect(func() -> void: GameManager.close_overlay())
	head_row.add_child(close)

	root.add_child(_hairline(Color(0.4, 0.45, 0.55, 0.35)))

	# —— Reopen banner ——
	var banner := PanelContainer.new()
	banner.add_theme_stylebox_override("panel", _flat(Color(ClientUi.CYAN, 0.06), Color(0, 0, 0, 0), 0))
	root.add_child(banner)
	var banner_m := MarginContainer.new()
	banner_m.add_theme_constant_override("margin_left", 12)
	banner_m.add_theme_constant_override("margin_right", 12)
	banner_m.add_theme_constant_override("margin_top", 6)
	banner_m.add_theme_constant_override("margin_bottom", 6)
	banner.add_child(banner_m)
	var banner_lab := RichTextLabel.new()
	banner_lab.bbcode_enabled = true
	banner_lab.fit_content = true
	banner_lab.scroll_active = false
	banner_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	banner_lab.add_theme_font_size_override("normal_font_size", 11)
	ClientUi.apply_body_font(banner_lab)
	banner_lab.text = "[center][color=#8CA4B7]You can reopen this guide anytime from [b][color=#EAF7FA]Settings → Codex[/color][/b].[/color][/center]"
	banner_m.add_child(banner_lab)

	root.add_child(_hairline(Color(0.4, 0.45, 0.55, 0.28)))

	# —— Section tabs (horizontal scroll) ——
	var tab_wrap := MarginContainer.new()
	tab_wrap.add_theme_constant_override("margin_left", 8)
	tab_wrap.add_theme_constant_override("margin_right", 8)
	tab_wrap.add_theme_constant_override("margin_top", 8)
	tab_wrap.add_theme_constant_override("margin_bottom", 8)
	root.add_child(tab_wrap)
	var tab_scroll := ScrollContainer.new()
	tab_scroll.custom_minimum_size = Vector2(0, 48)
	tab_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	tab_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	tab_wrap.add_child(tab_scroll)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	tab_scroll.add_child(_tabs)
	_tab_buttons.clear()
	for s in CodexCatalog.SECTIONS:
		var sid := str(s.get("id", "start"))
		var tint := Color(str(s.get("color", "#22D3EE")))
		var b := Button.new()
		b.text = str(s.get("label", "?"))
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size = Vector2(0, 37)
		b.add_theme_font_size_override("font_size", 15)
		ClientUi.apply_display_font(b)
		UiIcon.apply_leading_icon(b, str(s.get("icon", "book-open")), tint, 16.0)
		b.set_meta("section_id", sid)
		b.set_meta("tint", tint)
		b.pressed.connect(_show_section.bind(sid))
		_tabs.add_child(b)
		_tab_buttons.append(b)

	root.add_child(_hairline(Color(0.4, 0.45, 0.55, 0.28)))

	# —— Scrollable body (web: overflow-y-auto p-4) ——
	var body_margin := MarginContainer.new()
	body_margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body_margin.add_theme_constant_override("margin_left", 16)
	body_margin.add_theme_constant_override("margin_right", 16)
	body_margin.add_theme_constant_override("margin_top", 14)
	body_margin.add_theme_constant_override("margin_bottom", 14)
	root.add_child(body_margin)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body_margin.add_child(scroll)

	_body = RichTextLabel.new()
	_body.bbcode_enabled = true
	_body.fit_content = true
	_body.scroll_active = false
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.add_theme_font_size_override("normal_font_size", 13)
	_body.add_theme_color_override("default_color", Color(CodexCatalog.FG))
	ClientUi.apply_body_font(_body)
	var display := ClientUi.display_font()
	if display != null:
		_body.add_theme_font_override("bold_font", display)
	scroll.add_child(_body)
	scroll.resized.connect(func() -> void:
		if is_instance_valid(_body) and scroll.size.x > 1.0:
			_body.custom_minimum_size.x = scroll.size.x
	)


func _hairline(color: Color) -> ColorRect:
	var line := ColorRect.new()
	line.custom_minimum_size = Vector2(0, 1)
	line.color = color
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return line


func _flat(bg: Color, border: Color, radius: int) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(1 if border.a > 0.01 else 0)
	s.set_corner_radius_all(radius)
	s.content_margin_left = 10
	s.content_margin_right = 10
	s.content_margin_top = 5
	s.content_margin_bottom = 5
	return s


func _show_section(id: String) -> void:
	_section = id
	_body.text = CodexCatalog.body_bbcode(id)
	_style_tabs()


func _style_tabs() -> void:
	for b in _tab_buttons:
		var sid := str(b.get_meta("section_id", ""))
		var tint: Color = b.get_meta("tint", ClientUi.CYAN)
		var active := sid == _section
		if active:
			b.add_theme_stylebox_override("normal", _flat(Color(tint, 0.14), Color(tint, 0.7), 8))
			b.add_theme_stylebox_override("hover", _flat(Color(tint, 0.18), Color(tint, 0.85), 8))
			b.add_theme_stylebox_override("pressed", _flat(Color(tint, 0.12), Color(tint, 0.6), 8))
			b.add_theme_color_override("font_color", tint.lightened(0.15))
			b.add_theme_color_override("font_hover_color", tint.lightened(0.28))
			UiIcon.apply_button_icon_colors(b, tint.lightened(0.15))
		else:
			b.add_theme_stylebox_override("normal", _flat(Color(0.06, 0.08, 0.12, 0.35), Color(0.4, 0.45, 0.55, 0.35), 8))
			b.add_theme_stylebox_override("hover", _flat(Color(0.1, 0.12, 0.16, 0.7), Color(0.5, 0.55, 0.65, 0.5), 8))
			b.add_theme_stylebox_override("pressed", _flat(Color(0.08, 0.1, 0.14, 0.6), Color(0.45, 0.5, 0.6, 0.45), 8))
			b.add_theme_color_override("font_color", ClientUi.MUTED)
			b.add_theme_color_override("font_hover_color", ClientUi.TEXT)
			UiIcon.apply_button_icon_colors(b, ClientUi.MUTED)
		b.modulate = Color.WHITE


static func cfg_path() -> String:
	return "user://godot_codex.cfg"


static func should_prompt_for_active() -> bool:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return false
	var cfg := ConfigFile.new()
	cfg.load(cfg_path())
	return not bool(cfg.get_value("codex", "seen_%s" % cid, false))


static func mark_seen_for_active() -> void:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return
	var cfg := ConfigFile.new()
	cfg.load(cfg_path())
	cfg.set_value("codex", "seen_%s" % cid, true)
	cfg.save(cfg_path())
