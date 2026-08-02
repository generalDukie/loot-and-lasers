class_name ArenaStageBackdrop
extends Control
## Orbital arena backdrop + hardlight floor — mirrors web ArenaBackdrop / ArenaFloor.

@export var accent: Color = Color("#22D3EE")
@export var pulse := false

var _elapsed := 0.0
var _stars: Array = []
var _gallery_lights: Array = []
var _redraw_accum := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	resized.connect(queue_redraw)
	_seed_fx()
	set_process(true)


func _seed_fx() -> void:
	_stars.clear()
	_gallery_lights.clear()
	var rng := RandomNumberGenerator.new()
	rng.seed = 0xA7E14
	for i in 90:
		_stars.append({
			"x": rng.randf(),
			"y": rng.randf() * 0.72,
			"s": rng.randf_range(0.6, 2.4),
			"o": rng.randf_range(0.2, 0.85),
			"tw": rng.randf_range(2.0, 5.5),
			"delay": rng.randf() * 4.0,
		})
	for i in 28:
		_gallery_lights.append({
			"x": 0.08 + rng.randf() * 0.84,
			"y": 0.58 + rng.randf() * 0.22,
			"s": rng.randf_range(1.0, 2.6),
			"o": rng.randf_range(0.2, 0.55),
			"delay": rng.randf() * 3.0,
			"hue": i % 3,
		})


func set_accent(color: Color) -> void:
	accent = color
	queue_redraw()


func set_live(on: bool) -> void:
	set_process(on)
	if on:
		queue_redraw()


func set_pulse(on: bool) -> void:
	pulse = on
	queue_redraw()


func _process(delta: float) -> void:
	_elapsed += delta
	_redraw_accum += delta
	# Full redraw every frame is expensive during combat tweens — ~12 fps is enough.
	if _redraw_accum < 0.08 and not pulse:
		return
	_redraw_accum = 0.0
	queue_redraw()


func _draw() -> void:
	if size.x < 2.0 or size.y < 2.0:
		return
	_draw_void()
	_draw_nebula()
	_draw_worlds()
	_draw_stars()
	_draw_gallery()
	_draw_floor()
	_draw_vignette()


func _draw_void() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("#02010c"))
	# Soft vertical wash.
	for i in 8:
		var t := float(i) / 7.0
		var c := Color("#02010c").lerp(Color("#07051c"), t * 0.7).lerp(Color("#050318"), t)
		c.a = 0.55
		draw_rect(Rect2(0, size.y * t, size.x, size.y / 7.0 + 2.0), c)


func _draw_nebula() -> void:
	var tint := Color(accent, 0.14)
	_soft_ellipse(Vector2(size.x * 0.2, size.y * 0.12), Vector2(size.x * 0.34, size.y * 0.22), tint)
	_soft_ellipse(Vector2(size.x * 0.82, size.y * 0.18), Vector2(size.x * 0.28, size.y * 0.18), Color(0.95, 0.25, 0.4, 0.1))
	_soft_ellipse(Vector2(size.x * 0.5, size.y * 0.05), Vector2(size.x * 0.26, size.y * 0.16), Color(0.4, 0.4, 0.9, 0.1))
	_soft_ellipse(Vector2(size.x * 0.5, size.y * 0.88), Vector2(size.x * 0.4, size.y * 0.2), Color(accent, 0.08))


func _soft_ellipse(center: Vector2, radii: Vector2, color: Color) -> void:
	for i in 5:
		var f := 1.0 - float(i) / 5.0
		var c := Color(color, color.a * f * 0.55)
		draw_circle(center, maxf(radii.x, radii.y) * (0.45 + f * 0.55), c)


func _draw_worlds() -> void:
	# Distant gas giant.
	var gx := size.x * 0.88
	var gy := size.y * 0.1
	draw_circle(Vector2(gx, gy), 34.0, Color("#1e1b4b"))
	draw_circle(Vector2(gx - 6, gy - 6), 28.0, Color("#6366f1"))
	draw_circle(Vector2(gx - 10, gy - 10), 14.0, Color("#a5b4fc"))
	draw_arc(Vector2(gx, gy), 48.0, -0.5, 2.6, 28, Color(0.65, 0.7, 0.98, 0.28), 1.5)
	# Ice moon.
	var mx := size.x * 0.12
	var my := size.y * 0.12
	draw_circle(Vector2(mx, my), 12.0, Color("#1e293b"))
	draw_circle(Vector2(mx - 2, my - 2), 10.0, Color("#94a3b8"))
	draw_circle(Vector2(mx - 4, my - 4), 4.0, Color("#e2e8f0"))


func _draw_stars() -> void:
	for s in _stars:
		var tw := 0.5 + 0.5 * sin((_elapsed + float(s["delay"])) * (TAU / float(s["tw"])))
		var a := float(s["o"]) * (0.25 + 0.75 * tw)
		draw_circle(
			Vector2(float(s["x"]) * size.x, float(s["y"]) * size.y),
			float(s["s"]),
			Color(1, 1, 1, a)
		)


func _draw_gallery() -> void:
	var base_y := size.y * 0.78
	for i in 3:
		var ry := 18.0 + float(i) * 10.0
		var rx := size.x * (0.42 + float(i) * 0.05)
		var y := base_y + float(i) * 10.0
		var pulse_a := 0.12 + 0.1 * sin(_elapsed * 0.8 + float(i))
		draw_arc(Vector2(size.x * 0.5, y), rx, PI, TAU, 48, Color(accent, pulse_a), 1.2)
		draw_arc(Vector2(size.x * 0.5, y), rx * 0.92, PI, TAU, 48, Color(0.4, 0.45, 0.55, 0.18), 0.8)
	for x_frac_v in [0.14, 0.28, 0.4, 0.6, 0.72, 0.86]:
		var x_frac := float(x_frac_v)
		var x := size.x * x_frac
		var depth := 1.0 - absf(0.5 - x_frac) * 2.0
		var y := base_y + (1.0 - depth) * 14.0
		draw_line(Vector2(x, y), Vector2(x, y + 18.0), Color(accent, 0.25 + depth * 0.35), 1.4)
		draw_circle(Vector2(x, y), 2.2, Color(accent, 0.55))
	for l in _gallery_lights:
		var tw := 0.5 + 0.5 * sin((_elapsed + float(l["delay"])) * 2.2)
		var hue: int = int(l["hue"])
		var c := accent if hue == 0 else (Color("#F472B6") if hue == 1 else Color("#FBBF24"))
		c.a = float(l["o"]) * (0.2 + 0.8 * tw)
		draw_circle(Vector2(float(l["x"]) * size.x, float(l["y"]) * size.y), float(l["s"]), c)


func _draw_floor() -> void:
	var cx := size.x * 0.5
	var cy := size.y * 0.82
	var rx := size.x * 0.42
	var ry := size.y * 0.085
	var pulse_boost := 1.0 if not pulse else (0.7 + 0.3 * absf(sin(_elapsed * 10.0)))
	# Void bloom under deck.
	_soft_ellipse(Vector2(cx, cy + ry * 0.6), Vector2(rx * 0.9, ry * 0.7), Color(accent, 0.12 * pulse_boost))
	# Deck fill.
	draw_colored_polygon(_ellipse_points(Vector2(cx, cy), rx, ry, 48), Color(accent, 0.14 * pulse_boost))
	# Perspective grid.
	for i in 9:
		var t := float(i) / 8.0
		var y := cy - ry * 0.7 + t * ry * 1.5
		var half := rx * (0.35 + t * 0.65)
		draw_line(
			Vector2(cx - half, y), Vector2(cx + half, y),
			Color(accent, 0.12 + t * 0.22), 1.0 if i != 4 else 1.6
		)
	for i in range(-4, 5):
		draw_line(
			Vector2(cx + float(i) * rx * 0.05, cy - ry * 0.65),
			Vector2(cx + float(i) * rx * 0.22, cy + ry * 0.85),
			Color(accent, 0.18), 0.8
		)
	# Energy rims.
	draw_arc(Vector2(cx, cy), rx, 0, TAU, 64, Color(accent, 0.45 * pulse_boost), 2.2)
	draw_arc(Vector2(cx, cy), rx * 0.88, 0, TAU, 56, Color(accent, 0.28), 1.2)
	draw_arc(Vector2(cx, cy), rx * 0.64, 0, TAU, 48, Color(accent.lightened(0.35), 0.18), 1.0)
	# Center divider.
	draw_line(Vector2(cx, cy - ry * 0.85), Vector2(cx, cy + ry * 0.9), Color(0.6, 0.65, 0.72, 0.35), 1.4)
	draw_circle(Vector2(cx, cy), 6.0, Color(0.9, 0.92, 0.95, 0.35))
	draw_circle(Vector2(cx, cy), 2.5, Color(0.95, 0.96, 0.98, 0.55))
	# Team pads.
	_draw_pad(Vector2(cx - rx * 0.5, cy + ry * 0.15), rx * 0.28, ry * 0.42, Color("#22D3EE"))
	_draw_pad(Vector2(cx + rx * 0.5, cy + ry * 0.15), rx * 0.28, ry * 0.42, Color("#FB7185"))
	# Corner emitters.
	for p in [
		Vector2(cx - rx * 0.82, cy - ry * 0.35),
		Vector2(cx + rx * 0.82, cy - ry * 0.35),
		Vector2(cx - rx * 0.7, cy + ry * 0.65),
		Vector2(cx + rx * 0.7, cy + ry * 0.65),
	]:
		var side_cyan: bool = p.x < cx
		var ec := Color("#22D3EE") if side_cyan else Color("#FB7185")
		var blink := 0.4 + 0.55 * absf(sin(_elapsed * (8.0 if pulse else 2.4) + p.x * 0.01))
		draw_circle(p, 4.5, Color(ec, blink))
		draw_arc(p, 9.0, 0, TAU, 16, Color(ec, 0.35), 1.0)


func _draw_pad(center: Vector2, rx: float, ry: float, color: Color) -> void:
	draw_colored_polygon(_ellipse_points(center, rx, ry, 28), Color(color, 0.12))
	draw_arc(center, rx, 0, TAU, 28, Color(color, 0.5), 1.5)
	draw_arc(center, rx * 0.72, 0, TAU, 24, Color(color, 0.28), 0.8)


func _ellipse_points(center: Vector2, rx: float, ry: float, steps: int) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in steps:
		var a := TAU * float(i) / float(steps)
		pts.append(center + Vector2(cos(a) * rx, sin(a) * ry))
	return pts


func _draw_vignette() -> void:
	# Soft overhead cone.
	var top := Color(accent, 0.05)
	draw_colored_polygon(
		PackedVector2Array([
			Vector2(size.x * 0.42, 0),
			Vector2(size.x * 0.58, 0),
			Vector2(size.x, size.y * 0.45),
			Vector2(0, size.y * 0.45),
		]),
		top
	)
	# Edge darkening.
	draw_rect(Rect2(0, 0, size.x * 0.08, size.y), Color(0.01, 0.005, 0.04, 0.35))
	draw_rect(Rect2(size.x * 0.92, 0, size.x * 0.08, size.y), Color(0.01, 0.005, 0.04, 0.35))
	draw_rect(Rect2(0, size.y * 0.85, size.x, size.y * 0.15), Color(0.01, 0.005, 0.04, 0.55))
