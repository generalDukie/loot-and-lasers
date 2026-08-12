extends Control
class_name BrandGradientTitle
## Draws brand text with a left→right cyan → teal → purple gradient (web SiteTitle clip).

const COLOR_CYAN := ClientUi.BRAND_GRAD_NEAR_WHITE
const COLOR_TEAL := ClientUi.BRAND_GRAD_CYAN
const COLOR_PURPLE := ClientUi.BRAND_GRAD_PURPLE

const WORDMARK_TRACK := 0.02
const WORDMARK_SCAN := 0.18
const WORDMARK_SCAN_PERIOD := 8.0
const WORDMARK_SCAN_THICK := 2.5
const WORDMARK_SCAN_CYCLE := 1.6

var title_text := "LOOT & LASERS"
var font_size := 22
var h_align := HORIZONTAL_ALIGNMENT_LEFT
var use_bold := false
var _brighten := 1.0
var _wordmark_fx := false
var _fx_font: FontVariation
var _scan_overlay: ColorRect


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_remeasure()


static func make(text: String, size_px: int = 22, center: bool = false, bold: bool = false) -> BrandGradientTitle:
	var node := BrandGradientTitle.new()
	node.title_text = text
	node.font_size = size_px
	node.use_bold = bold
	node.h_align = HORIZONTAL_ALIGNMENT_CENTER if center else HORIZONTAL_ALIGNMENT_LEFT
	if center:
		node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return node


func set_title(text: String) -> void:
	title_text = text
	_remeasure()
	queue_redraw()


func set_font_size(size_px: int) -> void:
	font_size = maxi(8, size_px)
	_remeasure()
	queue_redraw()


## Binary-search a font size so the title spans about `target_width` pixels.
func fit_to_width(target_width: float, min_px: int = 48, max_px: int = 420) -> void:
	var font := _font()
	if font == null or title_text.is_empty() or target_width <= 1.0:
		set_font_size(min_px)
		return
	var lo := min_px
	var hi := max_px
	while lo < hi:
		var mid := int((lo + hi + 1) / 2)
		_apply_wordmark_spacing(mid)
		var w := font.get_string_size(
			title_text, HORIZONTAL_ALIGNMENT_LEFT, -1, mid
		).x
		if w <= target_width:
			lo = mid
		else:
			hi = mid - 1
	set_font_size(lo)


func set_brighten(amount: float) -> void:
	_brighten = clampf(amount, 0.85, 1.25)
	queue_redraw()


func enable_wordmark_fx(on: bool = true) -> void:
	material = null
	_wordmark_fx = on
	if on:
		clip_children = CLIP_CHILDREN_AND_DRAW
		_ensure_scan_overlay()
	else:
		clip_children = CLIP_CHILDREN_DISABLED
		_teardown_scan_overlay()
	_remeasure()
	queue_redraw()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED or what == NOTIFICATION_THEME_CHANGED:
		_remeasure()
		queue_redraw()


func _remeasure() -> void:
	var font := _font()
	if font == null:
		custom_minimum_size = Vector2(160, font_size)
		return
	var sz := font.get_string_size(
		title_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size
	)
	var h := font.get_height(font_size)
	if not _wordmark_fx:
		# Hub titles: tight box so a subtitle can tuck under the wordmark.
		h *= 0.92
	custom_minimum_size = Vector2(ceili(sz.x) + 2, ceili(h) + 2)
	queue_redraw()


func _font() -> Font:
	if _wordmark_fx:
		return _ensure_wordmark_font()
	if use_bold:
		var bold := ClientUi.bold_display_font()
		if bold != null:
			return bold
	return ClientUi.display_font()


func _ensure_wordmark_font() -> Font:
	if _fx_font == null:
		_fx_font = FontVariation.new()
		_fx_font.base_font = ClientUi.display_font()
		# Standard Exo 2 Bold via the variable wght axis — not synthetic embolden.
		_fx_font.variation_opentype = { &"wght": 700 }
		_fx_font.variation_embolden = 0.0
	_apply_wordmark_spacing(font_size)
	return _fx_font


func _apply_wordmark_spacing(size_px: int) -> void:
	if _fx_font == null:
		return
	_fx_font.set_spacing(TextServer.SPACING_GLYPH, int(round(float(size_px) * WORDMARK_TRACK)))


func _ensure_scan_overlay() -> void:
	if _scan_overlay != null and is_instance_valid(_scan_overlay):
		return
	_scan_overlay = ColorRect.new()
	_scan_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scan_overlay.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_scan_overlay.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_scan_overlay.grow_vertical = Control.GROW_DIRECTION_BOTH
	_scan_overlay.color = Color.WHITE
	if ResourceLoader.exists("res://Shaders/brand_wordmark.gdshader"):
		var mat := ShaderMaterial.new()
		mat.shader = load("res://Shaders/brand_wordmark.gdshader") as Shader
		mat.set_shader_parameter("scan_intensity", WORDMARK_SCAN)
		mat.set_shader_parameter("scan_period_px", WORDMARK_SCAN_PERIOD)
		mat.set_shader_parameter("scan_thick_px", WORDMARK_SCAN_THICK)
		mat.set_shader_parameter("scan_cycle_sec", WORDMARK_SCAN_CYCLE)
		_scan_overlay.material = mat
	add_child(_scan_overlay)


func _teardown_scan_overlay() -> void:
	if _scan_overlay != null and is_instance_valid(_scan_overlay):
		_scan_overlay.queue_free()
	_scan_overlay = null


func _draw_shaped_gradient(ci: RID, area: Vector2) -> void:
	var font := _font()
	if font == null or title_text.is_empty():
		return
	var total := font.get_string_size(
		title_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size
	).x
	if total <= 0.0:
		return
	var ascent := font.get_ascent(font_size)
	var y := ascent
	var origin_x := 0.0
	if h_align == HORIZONTAL_ALIGNMENT_CENTER:
		origin_x = (area.x - total) * 0.5
	elif h_align == HORIZONTAL_ALIGNMENT_RIGHT:
		origin_x = area.x - total
	var run := 0.0
	for i in title_text.length():
		var ch := title_text.substr(i, 1)
		var next := font.get_string_size(
			title_text.substr(0, i + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, font_size
		).x
		var adv := next - run
		var col := _gradient_at((run + adv * 0.5) / total)
		var at := Vector2(origin_x + run, y)
		font.draw_string(
			ci, at + Vector2(0.0, 1.0), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size,
			Color(COLOR_TEAL, 0.22)
		)
		font.draw_string(
			ci, at, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, col
		)
		run = next


func _gradient_at(t: float) -> Color:
	var x := clampf(t, 0.0, 1.0)
	var col: Color
	if x < 0.5:
		col = COLOR_CYAN.lerp(COLOR_TEAL, x * 2.0)
	else:
		col = COLOR_TEAL.lerp(COLOR_PURPLE, (x - 0.5) * 2.0)
	return Color(
		clampf(col.r * _brighten, 0.0, 1.0),
		clampf(col.g * _brighten, 0.0, 1.0),
		clampf(col.b * _brighten, 0.0, 1.0),
		1.0
	)


func _draw() -> void:
	var font := _font()
	if font == null or title_text.is_empty():
		return
	var total := font.get_string_size(
		title_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size
	).x
	if total <= 0.0:
		return
	if _wordmark_fx:
		_draw_shaped_gradient(get_canvas_item(), size)
		return
	# Pin baseline near the top of the control so the wordmark sits high in the banner.
	var ascent := font.get_ascent(font_size)
	var y := ascent * 0.92
	var x := 0.0
	if h_align == HORIZONTAL_ALIGNMENT_CENTER:
		x = (size.x - total) * 0.5
	elif h_align == HORIZONTAL_ALIGNMENT_RIGHT:
		x = size.x - total
	var run := 0.0
	for i in title_text.length():
		var ch := title_text.substr(i, 1)
		var cw := font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		var mid_t := (run + cw * 0.5) / total
		var col := _gradient_at(mid_t)
		font.draw_string(
			get_canvas_item(),
			Vector2(x, y + 1.0),
			ch,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			font_size,
			Color(COLOR_TEAL, 0.22)
		)
		font.draw_string(
			get_canvas_item(),
			Vector2(x, y),
			ch,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			font_size,
			col
		)
		x += cw
		run += cw
