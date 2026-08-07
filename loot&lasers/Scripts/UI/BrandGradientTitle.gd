extends Control
class_name BrandGradientTitle
## Draws brand text with a left→right cyan → teal → purple gradient (web SiteTitle clip).

const COLOR_CYAN := ClientUi.BRAND_GRAD_NEAR_WHITE
const COLOR_TEAL := ClientUi.BRAND_GRAD_CYAN
const COLOR_PURPLE := ClientUi.BRAND_GRAD_PURPLE

var title_text := "LOOT & LASERS"
var font_size := 22
var _brighten := 1.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_remeasure()


func set_brighten(amount: float) -> void:
	_brighten = clampf(amount, 0.85, 1.25)
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
	# Tight height so the title sits high with the subtitle tucked under it.
	custom_minimum_size = Vector2(ceili(sz.x) + 2, ceili(font.get_height(font_size) * 0.92))
	queue_redraw()


func _font() -> Font:
	return ClientUi.display_font()


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
	# Pin baseline near the top of the control so the wordmark sits high in the banner.
	var ascent := font.get_ascent(font_size)
	var y := ascent * 0.92
	var x := 0.0
	for i in title_text.length():
		var ch := title_text.substr(i, 1)
		var cw := font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		var mid_t := (x + cw * 0.5) / total
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
