class_name ClientUi
extends RefCounted
## Shared painted sci-fi design system for code-built Control UIs.

const VOID := Color("#0B0D14")
const INK := Color("#101522")
const PANEL := Color("#141B2B")
const PANEL_DEEP := Color("#0D121E")
const CYAN := Color("#0DCADF")
const CYAN_SOFT := Color("#8DECF5")
const VIOLET := Color("#8B5CF6")
const GOLD := Color("#F3C969")
const TEXT := Color("#EAF7FA")
const MUTED := Color("#8CA4B7")
const SUCCESS := Color("#62D89B")
const DANGER := Color("#FF6B6B")
const WARNING := Color("#F5A94E")

## Target frame rate for all animated UI / decorative redraws.
const ANIM_FPS := 120
const ANIM_FRAME_SEC := 1.0 / float(ANIM_FPS)

## Design canvas helpers. After the 1080→1440 conversion, prefer literal 1440p
## sizes for new code. Use px() only for leftover 1080-authored literals.
static func px(v: float) -> int:
	return ResolutionRules.px(v)


static func pxf(v: float) -> float:
	return ResolutionRules.pxf(v)


static func pxv(v: Vector2) -> Vector2:
	return ResolutionRules.pxv(v)


const DISPLAY_FONT_PATH := "res://Assets/Fonts/Exo2-VariableFont_wght.ttf"
const BODY_FONT_PATH := "res://Assets/Fonts/Inter-VariableFont_opsz_wght.ttf"

static var _display_font: Font
static var _body_font: Font
static var _bold_display_font: Font
static var _space_shader: Shader
static var _app_theme: Theme
static var _painted_style_cache: Dictionary = {}
static var _button_style_cache: Dictionary = {}
## Soft nebula renders fine at lower internal resolution; stretch hides the difference.
const SPACE_RENDER_SCALE := 0.4


static func _space_layout_size() -> Vector2i:
	if ResolutionManager != null:
		return ResolutionManager.content_scale_size()
	return ResolutionRules.LEGACY_DESIGN_SIZE


static func display_font() -> Font:
	if _display_font == null and ResourceLoader.exists(DISPLAY_FONT_PATH):
		_display_font = load(DISPLAY_FONT_PATH) as Font
	return _display_font


static func body_font() -> Font:
	if _body_font == null and ResourceLoader.exists(BODY_FONT_PATH):
		_body_font = load(BODY_FONT_PATH) as Font
	return _body_font


static func apply_display_font(control: Control) -> void:
	var font := display_font()
	if font != null:
		control.add_theme_font_override("font", font)


static func apply_bold_display_font(control: Control) -> void:
	var bold := bold_display_font()
	if bold != null:
		control.add_theme_font_override("font", bold)


static func bold_display_font() -> Font:
	if _bold_display_font != null:
		return _bold_display_font
	var base := display_font()
	if base == null:
		return null
	var bold := FontVariation.new()
	bold.base_font = base
	# Embolden keeps glyphs readable on variable Exo 2 (OT wght alone can fail to draw).
	bold.variation_embolden = 0.7
	_bold_display_font = bold
	return _bold_display_font


static func apply_body_font(control: Control) -> void:
	var font := body_font()
	if font != null:
		control.add_theme_font_override("font", font)


## App-wide theme: Exo 2 for UI chrome (labels/buttons/numbers); Inter for fields.
static func app_theme() -> Theme:
	if _app_theme != null:
		return _app_theme
	var theme := Theme.new()
	var display := display_font()
	var body := body_font()
	if display != null:
		theme.default_font = display
		for type_name in ["Label", "Button", "CheckButton", "CheckBox", "OptionButton", "LinkButton"]:
			theme.set_font("font", type_name, display)
	if body != null:
		for type_name in ["LineEdit", "TextEdit", "CodeEdit", "RichTextLabel"]:
			theme.set_font("font", type_name, body)
		# RichTextLabel uses named slots.
		theme.set_font("normal_font", "RichTextLabel", body)
		theme.set_font("bold_font", "RichTextLabel", display)
		theme.set_font("italics_font", "RichTextLabel", body)
		theme.set_font("bold_italics_font", "RichTextLabel", display)
	_app_theme = theme
	return _app_theme


static func apply_root_theme(root: Window) -> void:
	if root == null:
		return
	root.theme = app_theme()


static func apply_interaction_motion(control: Control, hover_scale := 1.025) -> void:
	if control == null or control.has_meta("client_ui_motion"):
		return
	control.set_meta("client_ui_motion", true)
	control.set_meta("client_ui_hovered", false)
	# Prefer modulate over Control.scale — scaled controls can break GUI hit-testing
	# when nested under containers / clip regions (buttons look live but never press).
	var hover_boost := 1.0 + (hover_scale - 1.0) * 2.2
	var animate := func(target_mod: Color, duration: float) -> void:
		if not is_instance_valid(control):
			return
		if control.has_meta("client_ui_motion_tween"):
			var previous: Variant = control.get_meta("client_ui_motion_tween")
			if previous is Tween and (previous as Tween).is_valid():
				(previous as Tween).kill()
		var tween := control.create_tween()
		control.set_meta("client_ui_motion_tween", tween)
		tween.tween_property(control, "modulate", target_mod, duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	var idle := Color.WHITE
	var hover := Color(hover_boost, hover_boost, hover_boost, 1.0)
	var pressed := Color(0.92, 0.94, 0.96, 1.0)
	control.mouse_entered.connect(func() -> void:
		control.set_meta("client_ui_hovered", true)
		animate.call(hover, 0.12)
	)
	control.mouse_exited.connect(func() -> void:
		control.set_meta("client_ui_hovered", false)
		animate.call(idle, 0.16)
	)
	control.focus_entered.connect(func() -> void: animate.call(hover, 0.12))
	control.focus_exited.connect(func() -> void: animate.call(idle, 0.16))
	if control is BaseButton:
		var button := control as BaseButton
		button.button_down.connect(func() -> void:
			animate.call(pressed, 0.055)
		)
		button.button_up.connect(func() -> void:
			var target := hover if bool(control.get_meta("client_ui_hovered", false)) else idle
			animate.call(target, 0.09)
		)


static func panel_style(bg: Color = Color(0.07, 0.09, 0.14, 0.96), border: Color = Color(0.0, 0.78, 0.88, 0.55)) -> StyleBoxFlat:
	return painted_panel_style(bg, border)


static func painted_panel_style(
	bg: Color = Color(0.055, 0.075, 0.12, 0.96),
	border: Color = Color(0.05, 0.79, 0.87, 0.58),
	radius: int = 10,
	border_width: int = 2
) -> StyleBoxFlat:
	var key := "%s|%s|%s|%s" % [bg, border, radius, border_width]
	if _painted_style_cache.has(key):
		return _painted_style_cache[key]
	# Web .painted-panel: depth via asymmetric border + restrained drop.
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_width_left = border_width
	s.border_width_right = border_width
	s.border_width_bottom = border_width + 1
	s.border_width_top = maxi(1, border_width - 1)
	s.border_color = border.lightened(0.06)
	s.set_corner_radius_all(radius)
	s.corner_detail = 12
	s.anti_aliasing = true
	s.anti_aliasing_size = 1.1
	s.border_blend = true
	s.content_margin_left = px(14)
	s.content_margin_right = px(14)
	s.content_margin_top = px(11)
	s.content_margin_bottom = px(11)
	s.shadow_color = Color(0.0, 0.0, 0.0, 0.28)
	s.shadow_size = px(10)
	s.shadow_offset = Vector2(0, px(4))
	_painted_style_cache[key] = s
	return s


## Web .painted-frame: panel plus corner stud accents for premium cards.
static func make_painted_frame(
	bg: Color = Color(0.055, 0.075, 0.12, 0.96),
	border: Color = Color(0.05, 0.79, 0.87, 0.58),
	radius: int = 12
) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", painted_panel_style(bg, border, radius, 2))
	var studs := Control.new()
	studs.mouse_filter = Control.MOUSE_FILTER_IGNORE
	studs.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.add_child(studs)
	for pos in [Vector2(8, 8), Vector2(-8, 8), Vector2(8, -8), Vector2(-8, -8)]:
		var stud := ColorRect.new()
		stud.custom_minimum_size = Vector2(7, 7)
		stud.color = Color(border, 0.55)
		stud.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if pos.x < 0:
			stud.anchor_left = 1.0
			stud.anchor_right = 1.0
			stud.offset_left = pos.x - 5.0
			stud.offset_right = pos.x
		else:
			stud.offset_left = pos.x
			stud.offset_right = pos.x + 5.0
		if pos.y < 0:
			stud.anchor_top = 1.0
			stud.anchor_bottom = 1.0
			stud.offset_top = pos.y - 5.0
			stud.offset_bottom = pos.y
		else:
			stud.offset_top = pos.y
			stud.offset_bottom = pos.y + 5.0
		studs.add_child(stud)
	return panel


static func button_style(bg: Color, border: Color) -> StyleBoxFlat:
	var key := "%s|%s" % [bg, border]
	if _button_style_cache.has(key):
		return _button_style_cache[key]
	# Web .painted-btn: chunky bottom ledge + inset top highlight.
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_width_left = 2
	s.border_width_top = 1
	s.border_width_right = 2
	s.border_width_bottom = 3
	s.border_color = border
	s.corner_radius_top_left = 5
	s.corner_radius_top_right = 8
	s.corner_radius_bottom_left = 8
	s.corner_radius_bottom_right = 5
	s.corner_detail = 10
	s.anti_aliasing = true
	s.anti_aliasing_size = 1.1
	s.border_blend = true
	s.content_margin_left = px(14)
	s.content_margin_right = px(14)
	s.content_margin_top = px(8)
	s.content_margin_bottom = px(8)
	s.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	s.shadow_size = px(5)
	s.shadow_offset = Vector2(0, px(2))
	_button_style_cache[key] = s
	return s


static func apply_primary_button(btn: Button) -> void:
	## Web `.painted-btn` — cyan bevel, dark label (hsl 190/192).
	apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", px(13))
	var top := Color(0.11, 0.83, 0.93)       # hsl(190 90% 56%)
	var bottom := Color(0.04, 0.65, 0.80)    # hsl(192 90% 42%)
	var border := Color(0.03, 0.46, 0.57)    # hsl(192 90% 30%)
	var ink := Color(0.04, 0.05, 0.08)       # hsl(232 30% 6%)
	btn.add_theme_stylebox_override("normal", _painted_btn_style(top, bottom, border))
	btn.add_theme_stylebox_override("hover", _painted_btn_style(
		Color(0.18, 0.88, 0.96), Color(0.08, 0.72, 0.86), border
	))
	btn.add_theme_stylebox_override("pressed", _painted_btn_style(
		Color(0.04, 0.55, 0.68), Color(0.03, 0.42, 0.52), border
	))
	btn.add_theme_stylebox_override("disabled", button_style(Color(0.10, 0.14, 0.18, 0.88), Color(0.22, 0.30, 0.36, 0.75)))
	btn.add_theme_color_override("font_color", ink)
	btn.add_theme_color_override("font_hover_color", ink)
	btn.add_theme_color_override("font_pressed_color", ink)
	btn.add_theme_color_override("font_disabled_color", Color(0.40, 0.48, 0.52))
	apply_interaction_motion(btn)


static func apply_tinted_painted_button(btn: Button, tint: Color) -> void:
	## Web Crystal Store pack price buttons — painted-btn with pack accent gradient.
	apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", px(13))
	var top := tint
	var bottom := tint.darkened(0.12)
	var border := tint.darkened(0.28)
	var ink := Color(0.04, 0.05, 0.08)
	btn.add_theme_stylebox_override("normal", _painted_btn_style(top, bottom, border))
	btn.add_theme_stylebox_override("hover", _painted_btn_style(tint.lightened(0.08), tint, border))
	btn.add_theme_stylebox_override("pressed", _painted_btn_style(tint.darkened(0.18), tint.darkened(0.28), border))
	btn.add_theme_stylebox_override("disabled", button_style(Color(0.10, 0.14, 0.18, 0.88), Color(0.22, 0.30, 0.36, 0.75)))
	btn.add_theme_color_override("font_color", ink)
	btn.add_theme_color_override("font_hover_color", ink)
	btn.add_theme_color_override("font_pressed_color", ink)
	btn.add_theme_color_override("font_disabled_color", Color(0.40, 0.48, 0.52))
	apply_interaction_motion(btn)


static func _painted_btn_style(top: Color, bottom: Color, border: Color) -> StyleBoxFlat:
	## Approximate CSS linear-gradient + chunky bottom shadow.
	var s := StyleBoxFlat.new()
	s.bg_color = top.lerp(bottom, 0.45)
	s.border_color = border
	s.set_border_width_all(2)
	s.corner_radius_top_left = 10
	s.corner_radius_top_right = 10
	s.corner_radius_bottom_left = 10
	s.corner_radius_bottom_right = 10
	s.content_margin_left = px(14)
	s.content_margin_right = px(14)
	s.content_margin_top = px(8)
	s.content_margin_bottom = px(8)
	s.shadow_color = Color(border.r, border.g, border.b, 0.95)
	s.shadow_size = 0
	s.shadow_offset = Vector2(0, px(4))
	return s


static func apply_accent_chip_button(btn: Button) -> void:
	## Web arena Refresh: bg-accent/15 text-accent border-accent/30 (violet).
	apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", px(11))
	var a := VIOLET
	btn.add_theme_stylebox_override("normal", button_style(Color(a.r, a.g, a.b, 0.15), Color(a.r, a.g, a.b, 0.30)))
	btn.add_theme_stylebox_override("hover", button_style(Color(a.r, a.g, a.b, 0.25), Color(a.r, a.g, a.b, 0.45)))
	btn.add_theme_stylebox_override("pressed", button_style(Color(a.r, a.g, a.b, 0.20), Color(a.r, a.g, a.b, 0.40)))
	btn.add_theme_color_override("font_color", Color("#C4B5FD"))
	btn.add_theme_color_override("font_hover_color", Color("#DDD6FE"))
	btn.add_theme_color_override("font_pressed_color", TEXT)
	apply_interaction_motion(btn)


static func apply_revenge_button(btn: Button) -> void:
	## Web ArenaMatchHistory REVENGE: rose border/fill.
	apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", px(10))
	btn.add_theme_stylebox_override("normal", button_style(Color(0.96, 0.25, 0.37, 0.15), Color(0.98, 0.45, 0.55, 0.40)))
	btn.add_theme_stylebox_override("hover", button_style(Color(0.96, 0.25, 0.37, 0.25), Color(0.98, 0.45, 0.55, 0.55)))
	btn.add_theme_stylebox_override("pressed", button_style(Color(0.96, 0.25, 0.37, 0.20), Color(0.98, 0.45, 0.55, 0.45)))
	btn.add_theme_stylebox_override("disabled", button_style(Color(0.10, 0.10, 0.12, 0.7), Color(0.4, 0.3, 0.32, 0.35)))
	btn.add_theme_color_override("font_color", Color("#FECDD3"))
	btn.add_theme_color_override("font_hover_color", Color("#FFE4E6"))
	btn.add_theme_color_override("font_pressed_color", Color("#FECDD3"))
	btn.add_theme_color_override("font_disabled_color", Color(0.55, 0.45, 0.48))
	apply_interaction_motion(btn, 1.012)


static func apply_ghost_button(btn: Button) -> void:
	apply_display_font(btn)
	btn.add_theme_stylebox_override("normal", button_style(Color(0.06, 0.08, 0.13, 0.94), Color(0.30, 0.40, 0.52, 0.75)))
	btn.add_theme_stylebox_override("hover", button_style(Color(0.10, 0.14, 0.22, 1.0), Color(CYAN, 0.72)))
	btn.add_theme_stylebox_override("pressed", button_style(Color(0.07, 0.09, 0.16, 1.0), Color(CYAN, 0.55)))
	btn.add_theme_color_override("font_color", Color(0.84, 0.91, 0.96))
	btn.add_theme_color_override("font_hover_color", CYAN_SOFT)
	btn.add_theme_color_override("font_pressed_color", TEXT)
	apply_interaction_motion(btn)


## Web HangarSection / page section chrome: small uppercase eyebrow + tick + title.
static func make_section_header(eyebrow: String, title: String, hint: String = "") -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.add_theme_constant_override("separation", 4)
	if not eyebrow.is_empty():
		var eye := Label.new()
		eye.text = eyebrow.to_upper()
		eye.add_theme_font_size_override("font_size", 13)
		eye.add_theme_color_override("font_color", Color(CYAN, 0.72))
		apply_display_font(eye)
		wrap.add_child(eye)
	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 8)
	wrap.add_child(title_row)
	var tick := ColorRect.new()
	tick.custom_minimum_size = Vector2(3, 21)
	tick.color = Color(CYAN, 0.75)
	title_row.add_child(tick)
	var t := Label.new()
	t.text = title
	t.add_theme_font_size_override("font_size", 20)
	t.add_theme_color_override("font_color", TEXT)
	t.add_theme_color_override("font_shadow_color", Color(CYAN, 0.16))
	t.add_theme_constant_override("shadow_offset_x", 1)
	t.add_theme_constant_override("shadow_offset_y", 1)
	apply_display_font(t)
	title_row.add_child(t)
	var rule := ColorRect.new()
	rule.custom_minimum_size = Vector2(43, 1)
	rule.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rule.color = Color(CYAN, 0.18)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_row.add_child(rule)
	if not hint.is_empty():
		var h := Label.new()
		h.text = hint
		h.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		h.add_theme_font_size_override("font_size", 15)
		h.add_theme_color_override("font_color", MUTED)
		apply_body_font(h)
		wrap.add_child(h)
	return wrap


static func make_brand_mark(size: int = 22) -> Label:
	var brand := Label.new()
	brand.text = "LOOT & LASERS"
	brand.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	brand.add_theme_font_size_override("font_size", size)
	brand.add_theme_color_override("font_color", CYAN_SOFT)
	brand.add_theme_color_override("font_shadow_color", Color(CYAN, 0.28))
	brand.add_theme_constant_override("shadow_offset_x", 0)
	brand.add_theme_constant_override("shadow_offset_y", 2)
	apply_display_font(brand)
	return brand


static func make_title(text: String, size: int = 32) -> Label:
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", CYAN_SOFT)
	label.add_theme_color_override("font_shadow_color", Color(0.0, 0.55, 0.7, 0.28))
	label.add_theme_constant_override("shadow_offset_x", 0)
	label.add_theme_constant_override("shadow_offset_y", 2)
	apply_display_font(label)
	label.modulate.a = 0.0
	label.tree_entered.connect(func() -> void:
		if not is_instance_valid(label):
			return
		var tw := label.create_tween()
		tw.tween_property(label, "modulate:a", 1.0, 0.28).set_ease(Tween.EASE_OUT)
	, CONNECT_ONE_SHOT)
	return label


static func make_atmosphere_bg(top: Color = Color(0.03, 0.05, 0.09), bottom: Color = Color(0.06, 0.04, 0.08)) -> ColorRect:
	# Compatibility base for older screens. New screens should use make_screen().
	var bg := ColorRect.new()
	bg.color = top.lerp(bottom, 0.45)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return bg


static func _gradient_layer(colors: PackedColorArray, radial := false, opacity := 1.0) -> TextureRect:
	var gradient := Gradient.new()
	gradient.colors = colors
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.width = _space_layout_size().x
	texture.height = _space_layout_size().y
	if radial:
		texture.fill = GradientTexture2D.FILL_RADIAL
		texture.fill_from = Vector2(0.18, 0.2)
		texture.fill_to = Vector2(0.88, 0.9)
	else:
		texture.fill_from = Vector2(0.0, 0.0)
		texture.fill_to = Vector2(0.0, 1.0)
	var layer := TextureRect.new()
	layer.texture = texture
	layer.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	layer.stretch_mode = TextureRect.STRETCH_SCALE
	layer.modulate.a = opacity
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return layer


static func _space_material_layer(mood: String, opacity: float, intensity: float) -> Control:
	## Render the heavy nebula shader at reduced resolution, then stretch.
	## Soft clouds/stars look identical; GPU cost drops roughly with scale².
	var host := Control.new()
	host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.set_meta("space_host", true)

	var layout := _space_layout_size()
	var vp_size := Vector2i(
		maxi(320, int(float(layout.x) * SPACE_RENDER_SCALE)),
		maxi(180, int(float(layout.y) * SPACE_RENDER_SCALE))
	)
	var viewport := SubViewport.new()
	viewport.transparent_bg = true
	viewport.handle_input_locally = false
	viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	viewport.size = vp_size

	var layer := ColorRect.new()
	layer.color = Color.WHITE
	layer.size = Vector2(vp_size)
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if _space_shader == null and ResourceLoader.exists("res://Shaders/space_backdrop.gdshader"):
		_space_shader = load("res://Shaders/space_backdrop.gdshader") as Shader
	if _space_shader == null:
		layer.color = Color.TRANSPARENT
		host.add_child(layer)
		return host
	var palette: Array = _mood_palette(mood)
	var material := ShaderMaterial.new()
	material.shader = _space_shader
	material.set_shader_parameter("color_deep", palette[1])
	material.set_shader_parameter("color_nebula", palette[2])
	material.set_shader_parameter("color_accent", palette[3])
	material.set_shader_parameter("intensity", intensity)
	material.set_shader_parameter("transparency", opacity)
	layer.material = material
	layer.set_meta("space_shader_rect", true)
	viewport.add_child(layer)

	var container := SubViewportContainer.new()
	container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	container.stretch = true
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	container.add_child(viewport)
	host.add_child(container)
	return host


static func is_under_shell(node: Node) -> bool:
	var n := node
	while n != null:
		if n.is_in_group("game_shell"):
			return true
		n = n.get_parent()
	return false


static func make_page_bg(page: Node, mood: String = "hub") -> Control:
	## Full atmosphere outside the shell; soft wash inside so chrome isn’t doubled.
	if page != null and is_under_shell(page):
		return make_content_wash(mood)
	return make_screen(mood)


static func _mood_palette(mood: String) -> Array:
	return {
		"hub": [Color("#07131E"), Color("#0B0D14"), Color("#170D24"), CYAN],
		"cantina": [Color("#1A0D14"), Color("#0B0D14"), Color("#291414"), Color("#F07A50")],
		"combat": [Color("#160B18"), Color("#090C14"), Color("#20102F"), VIOLET],
		"void": [Color("#090914"), Color("#05060C"), Color("#140B25"), VIOLET],
	}.get(mood, [Color("#07131E"), VOID, Color("#170D24"), CYAN])


static func make_content_wash(mood: String = "hub") -> Control:
	# Inside the shell the atmosphere lives on game_shell — pages only tint.
	var screen := Control.new()
	screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var palette: Array = _mood_palette(mood)
	screen.add_child(_gradient_layer(PackedColorArray([
		Color(palette[0], 0.42), Color(palette[1], 0.22), Color(palette[2], 0.34)
	]), false, 0.72))
	screen.add_child(_gradient_layer(PackedColorArray([
		Color(palette[3], 0.12), Color(palette[3], 0.0)
	]), true, 0.45))
	# Shell already owns AmbientHud — skip a second full-screen redraw pass here.
	return screen


static func make_screen(mood: String = "hub") -> Control:
	var screen := Control.new()
	screen.name = "AtmosphereScreen"
	screen.set_meta("atmosphere_mood", mood)
	screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var palette: Array = _mood_palette(mood)
	screen.add_child(_gradient_layer(PackedColorArray([palette[0], palette[1], palette[2]])))
	screen.add_child(_gradient_layer(PackedColorArray([
		Color(palette[3], 0.28), Color(palette[3], 0.0)
	]), true, 0.75))
	var space := _space_material_layer(mood, 0.72, 1.0)
	space.name = "SpaceMaterial"
	screen.add_child(space)
	# GPU stars already live in the shader — keep only shooting streaks as motion.
	screen.add_child(_make_shooting_stars(0.9))
	screen.add_child(_make_ambient_hud(palette[3], 1.0))
	return screen


static func _make_ambient_hud(accent: Color, intensity: float) -> Control:
	var script := load("res://Scripts/UI/AmbientHudOverlay.gd")
	if script == null:
		return Control.new()
	var layer := script.new() as Control
	layer.set("accent", accent)
	layer.set("intensity", intensity)
	layer.set_meta("ambient_hud", true)
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return layer


static func apply_atmosphere_mood(screen: Control, mood: String) -> void:
	if screen == null or not is_instance_valid(screen):
		return
	if str(screen.get_meta("atmosphere_mood", "")) == mood:
		return
	screen.set_meta("atmosphere_mood", mood)
	var palette: Array = _mood_palette(mood)
	for child in screen.get_children():
		if child.has_meta("ambient_hud"):
			child.set("accent", palette[3])
			child.queue_redraw()
		if child is TextureRect and child.texture is GradientTexture2D:
			var tex := child.texture as GradientTexture2D
			if tex.fill == GradientTexture2D.FILL_RADIAL:
				tex.gradient.colors = PackedColorArray([Color(palette[3], 0.28), Color(palette[3], 0.0)])
			else:
				tex.gradient.colors = PackedColorArray([palette[0], palette[1], palette[2]])
		elif child.has_meta("space_host"):
			_apply_space_palette(child, palette)
		elif child is ColorRect and child.material is ShaderMaterial:
			var mat := child.material as ShaderMaterial
			mat.set_shader_parameter("color_deep", palette[1])
			mat.set_shader_parameter("color_nebula", palette[2])
			mat.set_shader_parameter("color_accent", palette[3])


static func _apply_space_palette(host: Node, palette: Array) -> void:
	for n in host.find_children("*", "ColorRect", true, false):
		if n is ColorRect and (n as ColorRect).material is ShaderMaterial:
			var mat := (n as ColorRect).material as ShaderMaterial
			mat.set_shader_parameter("color_deep", palette[1])
			mat.set_shader_parameter("color_nebula", palette[2])
			mat.set_shader_parameter("color_accent", palette[3])
			return


static func _make_shooting_stars(intensity: float) -> Control:
	var script := load("res://Scripts/UI/ShootingStars.gd")
	if script == null:
		return Control.new()
	var layer := script.new() as Control
	layer.set("intensity", intensity)
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return layer


static func apply_danger_button(btn: Button) -> void:
	apply_display_font(btn)
	btn.add_theme_stylebox_override("normal", button_style(Color(0.38, 0.10, 0.14, 1.0), DANGER))
	btn.add_theme_stylebox_override("hover", button_style(Color(0.5, 0.14, 0.18, 1.0), Color(1.0, 0.56, 0.56)))
	btn.add_theme_color_override("font_color", Color(1.0, 0.92, 0.92))
	apply_interaction_motion(btn)


static func make_subtitle(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", MUTED)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	apply_body_font(label)
	return label


static func make_field(placeholder: String, secret: bool = false) -> LineEdit:
	var edit := LineEdit.new()
	edit.placeholder_text = placeholder
	edit.secret = secret
	edit.custom_minimum_size = Vector2(0, 51)
	edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	apply_body_font(edit)
	edit.add_theme_stylebox_override("normal", painted_panel_style(PANEL_DEEP, Color(0.25, 0.36, 0.48, 0.9), 6, 1))
	edit.add_theme_stylebox_override("hover", painted_panel_style(PANEL_DEEP.lightened(0.025), Color(CYAN, 0.58), 6, 1))
	edit.add_theme_stylebox_override("focus", painted_panel_style(PANEL_DEEP, CYAN, 6, 2))
	edit.add_theme_color_override("font_color", TEXT)
	edit.add_theme_color_override("font_placeholder_color", MUTED)
	edit.add_theme_color_override("caret_color", CYAN_SOFT)
	edit.add_theme_color_override("selection_color", Color(CYAN, 0.32))
	return edit


static func apply_selector(selector: OptionButton) -> void:
	selector.custom_minimum_size = Vector2(0, 53)
	selector.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	apply_body_font(selector)
	selector.add_theme_stylebox_override(
		"normal", painted_panel_style(PANEL_DEEP, Color(0.25, 0.36, 0.48, 0.9), 6, 1)
	)
	selector.add_theme_stylebox_override(
		"hover", painted_panel_style(PANEL_DEEP.lightened(0.04), CYAN, 6, 1)
	)
	selector.add_theme_stylebox_override(
		"pressed", painted_panel_style(PANEL_DEEP.darkened(0.08), VIOLET, 6, 2)
	)
	selector.add_theme_color_override("font_color", TEXT)
	selector.add_theme_color_override("font_hover_color", CYAN_SOFT)
	apply_interaction_motion(selector, 1.012)


static func apply_shell_back(btn: Button, host: Node) -> void:
	## Hide redundant Hub back buttons when the persistent shell owns navigation.
	btn.visible = not is_under_shell(host)


static func dock_button_style(tint: Color, hover := false) -> StyleBoxFlat:
	# Station dock: deep wash, crisp tint border, soft lift on hover.
	var style := StyleBoxFlat.new()
	var wash := Color(tint, 0.28 if hover else 0.16)
	style.bg_color = wash.lerp(Color(0.025, 0.04, 0.07, 0.94), 0.5)
	style.border_color = Color(tint, 0.92 if hover else 0.72)
	style.border_width_left = 2
	style.border_width_right = 2
	style.border_width_top = 1
	style.border_width_bottom = 3
	style.set_corner_radius_all(10)
	style.content_margin_left = px(8)
	style.content_margin_right = px(8)
	style.content_margin_top = px(10)
	style.content_margin_bottom = px(10)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.4 if hover else 0.28)
	style.shadow_size = px(8) if hover else px(5)
	style.shadow_offset = Vector2(0, px(3))
	return style


static func apply_dock_button(btn: Button, tint: Color) -> void:
	apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", px(11))
	btn.add_theme_stylebox_override("normal", dock_button_style(tint, false))
	btn.add_theme_stylebox_override("hover", dock_button_style(tint, true))
	btn.add_theme_stylebox_override("pressed", dock_button_style(tint.darkened(0.14), false))
	btn.add_theme_color_override("font_color", tint.lightened(0.18))
	btn.add_theme_color_override("font_hover_color", Color(0.96, 0.99, 1.0))
	btn.add_theme_color_override("font_pressed_color", tint.lightened(0.05))
	apply_interaction_motion(btn, 1.02)


static func make_status() -> Label:
	var label := Label.new()
	label.text = ""
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 15)
	label.add_theme_color_override("font_color", DANGER)
	apply_body_font(label)
	return label


static func make_currency_chip(symbol: String, value: Variant, tint: Color = CYAN) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.add_theme_stylebox_override(
		"panel",
		painted_panel_style(Color(0.04, 0.055, 0.09, 0.95), Color(tint, 0.55), 8, 1)
	)
	var label := Label.new()
	label.text = "%s  %s" % [symbol, str(value)]
	label.add_theme_font_size_override("font_size", 15)
	label.add_theme_color_override("font_color", tint.lightened(0.18))
	apply_display_font(label)
	chip.add_child(label)
	return chip


static func rarity_color(rarity: String) -> Color:
	match rarity.to_lower():
		"common":
			return Color("#8CA4B7")
		"uncommon":
			return Color("#5DDB8B")
		"rare":
			return Color("#36A8FF")
		"epic":
			return Color("#A970FF")
		"legendary":
			return Color("#F3A93E")
		"mythic":
			return Color("#FF5F7E")
		_:
			return MUTED


static func apply_hp_bar(bar: ProgressBar, fill: Color) -> void:
	var track := StyleBoxFlat.new()
	track.bg_color = Color(0.02, 0.03, 0.055, 0.96)
	track.border_color = Color(0.22, 0.30, 0.40, 0.85)
	track.set_border_width_all(1)
	track.set_corner_radius_all(4)
	track.content_margin_left = 1
	track.content_margin_right = 1
	track.content_margin_top = 1
	track.content_margin_bottom = 1
	var meter := StyleBoxFlat.new()
	meter.bg_color = fill
	meter.border_color = fill.lightened(0.22)
	meter.border_width_top = 1
	meter.border_width_bottom = 0
	meter.border_width_left = 0
	meter.border_width_right = 0
	meter.set_corner_radius_all(3)
	bar.add_theme_stylebox_override("background", track)
	bar.add_theme_stylebox_override("fill", meter)


## Full-screen painted confirm — matches CombatSheets / InventoryFullSheet overlays.
## Parent the returned Control on the game shell (or current scene), not a clipped rail.
static func make_confirm_sheet(
	eyebrow: String,
	heading: String,
	body: String,
	on_confirm: Callable,
	on_cancel: Callable = Callable(),
	confirm_label: String = "Confirm",
	cancel_label: String = "Cancel",
	accent: Color = DANGER,
	danger_confirm: bool = false
) -> Control:
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	root.z_index = 140

	var dismiss := func() -> void:
		if is_instance_valid(root):
			root.queue_free()
		if on_cancel.is_valid():
			on_cancel.call()

	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scrim.color = Color(0.015, 0.018, 0.04, 0.82)
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	scrim.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
			dismiss.call()
	)
	root.add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(center)

	var card := PanelContainer.new()
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	card.custom_minimum_size = Vector2(520, 0)
	card.add_theme_stylebox_override(
		"panel",
		painted_panel_style(Color(0.045, 0.05, 0.085, 0.98), Color(accent, 0.65), 14, 2)
	)
	center.add_child(card)

	var margin := MarginContainer.new()
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 18)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	card.add_child(margin)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	margin.add_child(col)

	if not eyebrow.is_empty():
		var eye := Label.new()
		eye.text = eyebrow
		eye.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		eye.add_theme_font_size_override("font_size", 12)
		eye.add_theme_color_override("font_color", Color(accent, 0.75))
		apply_display_font(eye)
		col.add_child(eye)

	var title := Label.new()
	title.text = heading
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 27)
	title.add_theme_color_override("font_color", accent)
	apply_display_font(title)
	col.add_child(title)

	if not body.is_empty():
		var body_lab := Label.new()
		body_lab.text = body
		body_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		body_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		body_lab.add_theme_font_size_override("font_size", 15)
		body_lab.add_theme_color_override("font_color", MUTED)
		apply_body_font(body_lab)
		col.add_child(body_lab)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 10)
	col.add_child(actions)

	var cancel_btn := Button.new()
	cancel_btn.text = cancel_label
	cancel_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	apply_ghost_button(cancel_btn)
	cancel_btn.pressed.connect(dismiss)
	actions.add_child(cancel_btn)

	var confirm_btn := Button.new()
	confirm_btn.text = confirm_label
	confirm_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if danger_confirm:
		apply_danger_button(confirm_btn)
	else:
		apply_primary_button(confirm_btn)
	confirm_btn.pressed.connect(func() -> void:
		if is_instance_valid(root):
			root.queue_free()
		if on_confirm.is_valid():
			on_confirm.call()
	)
	actions.add_child(confirm_btn)

	card.modulate.a = 0.0
	var tween := card.create_tween()
	tween.tween_property(card, "modulate:a", 1.0, 0.18).set_ease(Tween.EASE_OUT)
	return root


## Non-blocking toast overlay (top-center). Safe if host is freed mid-tween.
static func show_toast(host: Node, title: String, body: String = "", duration: float = 3.5) -> void:
	if host == null or not is_instance_valid(host):
		return
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.z_index = 100
	panel.add_theme_stylebox_override(
		"panel",
		panel_style(Color(0.08, 0.12, 0.1, 0.96), Color(0.45, 0.9, 0.65, 0.85))
	)
	panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	panel.offset_top = 21
	panel.offset_bottom = 21
	panel.custom_minimum_size = Vector2(427, 0)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)
	var t := Label.new()
	t.text = title
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 20)
	t.add_theme_color_override("font_color", Color(0.85, 1.0, 0.9))
	col.add_child(t)
	if not body.is_empty():
		var b := Label.new()
		b.text = body
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.add_theme_font_size_override("font_size", 16)
		b.add_theme_color_override("font_color", Color(0.75, 0.88, 0.82))
		col.add_child(b)
	panel.modulate.a = 0.0
	panel.position.y = -10.0
	host.add_child(panel)
	var tw := panel.create_tween()
	tw.set_parallel(true)
	tw.tween_property(panel, "modulate:a", 1.0, 0.2)
	tw.tween_property(panel, "position:y", 0.0, 0.24).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.chain().tween_interval(maxf(0.5, duration))
	tw.chain().tween_property(panel, "modulate:a", 0.0, 0.35)
	tw.chain().tween_callback(func() -> void:
		if is_instance_valid(panel):
			panel.queue_free()
	)
