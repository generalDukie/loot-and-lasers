extends Control
class_name NavNeonLabel
## Side-nav label with optional neon sweep (web `.nav-neon-text`).

const SWEEP_SECONDS := 1.6

var label_text := ""
var font_size := 20
var idle_color := Color(0.62, 0.7, 0.78)
var neon_tint := Color("#00E5FF")
var neon_on := false

var _phase := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	set_process(false)
	_remeasure()


func configure(text: String, tint: Color, size: int = 20) -> void:
	label_text = text
	neon_tint = tint
	font_size = size
	_remeasure()
	queue_redraw()


func set_neon(enabled: bool) -> void:
	if neon_on == enabled:
		return
	neon_on = enabled
	set_process(enabled)
	if not enabled:
		_phase = 0.0
	queue_redraw()


func _process(delta: float) -> void:
	if not neon_on:
		return
	_phase = fposmod(_phase + delta / SWEEP_SECONDS, 1.0)
	queue_redraw()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED or what == NOTIFICATION_THEME_CHANGED:
		_remeasure()
		queue_redraw()


func _font() -> Font:
	return ClientUi.display_font()


func _remeasure() -> void:
	var font := _font()
	if font == null or label_text.is_empty():
		custom_minimum_size = Vector2(40, font_size + 4)
		return
	var sz := font.get_string_size(label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	custom_minimum_size = Vector2(ceili(sz.x), maxi(ceili(sz.y), font_size + 2))


func _soft() -> Color:
	return Color(neon_tint, 0.55).lightened(0.05)


func _strong() -> Color:
	return neon_tint.lightened(0.35)


func _color_at(t: float) -> Color:
	## Soft → strong → soft, sliding with `_phase` (matches CSS 200% gradient slide).
	var u := fposmod(t - _phase, 1.0)
	var wave := 0.5 + 0.5 * sin(u * TAU)
	return _soft().lerp(_strong(), wave)


func _draw() -> void:
	var font := _font()
	if font == null or label_text.is_empty():
		return
	var total := font.get_string_size(label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	if total <= 0.0:
		return
	var ascent := font.get_ascent(font_size)
	# Vertically center within allocated height.
	var y := ascent + maxf(0.0, (size.y - font.get_height(font_size)) * 0.5)

	if not neon_on:
		font.draw_string(
			get_canvas_item(),
			Vector2(0, y),
			label_text,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			font_size,
			idle_color
		)
		return

	var glow_a := 0.18 + 0.16 * (0.5 + 0.5 * sin(_phase * TAU))
	var x := 0.0
	for i in label_text.length():
		var ch := label_text.substr(i, 1)
		var cw := font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		var mid_t := (x + cw * 0.5) / total
		var col := _color_at(mid_t)
		# Soft neon halo under the glyph (letters only — no button outline).
		font.draw_string(
			get_canvas_item(),
			Vector2(x, y + 1.0),
			ch,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			font_size,
			Color(neon_tint, glow_a)
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
