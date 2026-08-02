class_name AvatarPortrait
extends Control
## Drawn portrait Control — used by AvatarRenderer.make_portrait.

var character: Dictionary = {}
var _elapsed := 0.0
var _phase := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_phase = float(get_instance_id() % 97) / 97.0 * TAU


func _process(delta: float) -> void:
	_elapsed += delta
	queue_redraw()


func set_character(c: Dictionary) -> void:
	character = c
	queue_redraw()


func _draw() -> void:
	var s := minf(size.x, size.y)
	if s <= 1.0:
		return
	var scale := s / 200.0
	var breathe := sin(_elapsed * 1.75 + _phase)
	var origin := Vector2((size.x - s) * 0.5, (size.y - s) * 0.5 + breathe * 1.5 * scale)
	var race := str(character.get("race", "Cognati"))
	var archetype := str(character.get("class", "Vanguard"))
	var app := AvatarRenderer.appearance_of(character)
	var skin := AvatarRenderer.parse_hex(str(app.get("skin_color", "#2D5A3D")))
	var dark := AvatarRenderer.shade(skin, -50)
	var light := AvatarRenderer.shade(skin, 34)
	var accent: Color = AvatarRenderer.RACE_ACCENT.get(race, AvatarRenderer.RACE_ACCENT["Cognati"])

	# Multi-ring aura replaces the old flat disc and gives the portrait depth.
	for ring in range(6, 0, -1):
		var radius := (72.0 + float(ring) * 5.0) * scale
		var alpha := (0.012 + float(7 - ring) * 0.009)
		draw_circle(_p(origin, scale, 100, 102), radius, Color(accent.r, accent.g, accent.b, alpha))

	_draw_bust(origin, scale, archetype, accent, dark)
	_draw_ears(origin, scale, str(app.get("ears", "Tapered")), skin)
	_draw_race_base(origin, scale, race, skin, dark, light, accent)
	_draw_face_lighting(origin, scale, race, light, dark, accent)
	_draw_brows(origin, scale, str(app.get("eyebrows", "Standard")))
	if not _blink_closed():
		_draw_eyes(origin, scale, str(app.get("eye_style", "Standard Optics")))
	else:
		_draw_closed_eyes(origin, scale, accent)
	_draw_nose(origin, scale, str(app.get("nose", "Button")), dark)
	_draw_mouth(origin, scale, str(app.get("mouth", "Set Jaw")))
	_draw_markings(origin, scale, str(app.get("marking", "None")), dark)
	_draw_rim_light(origin, scale, race, accent)


func _p(origin: Vector2, scale: float, x: float, y: float) -> Vector2:
	return origin + Vector2(x, y) * scale


func _blink_closed() -> bool:
	var cycle := fposmod(_elapsed + _phase, 3.8)
	return cycle > 3.55 and cycle < 3.68


func _draw_bust(
	o: Vector2,
	sc: float,
	archetype: String,
	accent: Color,
	dark: Color
) -> void:
	var class_tint: Color = {
		"Vanguard": Color("#F87171"),
		"Shadow Operative": Color("#A78BFA"),
		"Technomancer": Color("#38BDF8"),
		"Astral Warden": Color("#FBBF24"),
		"Void Runner": Color("#C084FC"),
		"Cosmic Engineer": Color("#34D399"),
	}.get(archetype, accent)

	# Shoulder silhouette and layered armor collar.
	_poly(o, sc, [
		Vector2(18, 200), Vector2(26, 181), Vector2(58, 164),
		Vector2(82, 158), Vector2(118, 158), Vector2(142, 164),
		Vector2(174, 181), Vector2(182, 200),
	], Color(0.025, 0.035, 0.065, 0.98), false)
	_poly(o, sc, [
		Vector2(25, 200), Vector2(34, 184), Vector2(67, 170),
		Vector2(83, 174), Vector2(72, 200),
	], Color(class_tint, 0.24), false)
	_poly(o, sc, [
		Vector2(175, 200), Vector2(166, 184), Vector2(133, 170),
		Vector2(117, 174), Vector2(128, 200),
	], Color(class_tint, 0.24), false)
	_poly(o, sc, [
		Vector2(74, 160), Vector2(87, 178), Vector2(100, 185),
		Vector2(113, 178), Vector2(126, 160), Vector2(116, 200),
		Vector2(84, 200),
	], Color(0.055, 0.07, 0.11, 1.0), false)
	draw_line(_p(o, sc, 30, 185), _p(o, sc, 72, 171), Color(class_tint, 0.72), 2.0 * sc, true)
	draw_line(_p(o, sc, 170, 185), _p(o, sc, 128, 171), Color(class_tint, 0.72), 2.0 * sc, true)
	draw_circle(_p(o, sc, 100, 184), 5.0 * sc, Color(class_tint, 0.85))
	draw_circle(_p(o, sc, 100, 184), 2.0 * sc, Color(0.9, 0.98, 1.0, 0.9))

	# Neck behind the head.
	draw_rect(
		Rect2(_p(o, sc, 84, 145), Vector2(32, 45) * sc),
		Color(dark.r, dark.g, dark.b, 0.92),
		true
	)


func _draw_face_lighting(
	o: Vector2,
	sc: float,
	race: String,
	light: Color,
	dark: Color,
	accent: Color
) -> void:
	var center := Vector2(100, 105)
	var rx := 56.0
	var ry := 62.0
	if race == "Grothak":
		rx = 70.0
		ry = 60.0
	elif race == "Cognati":
		rx = 48.0
		ry = 58.0

	# Painterly side light and jaw shadow.
	draw_arc(_p(o, sc, center.x, center.y), rx * sc, deg_to_rad(198), deg_to_rad(302), 28, Color(light, 0.32), 5.0 * sc, true)
	draw_arc(_p(o, sc, center.x + 3, center.y + 4), ry * sc, deg_to_rad(-58), deg_to_rad(52), 24, Color(dark, 0.24), 7.0 * sc, true)
	draw_line(_p(o, sc, 62, 121), _p(o, sc, 76, 126), Color(dark, 0.22), 3.0 * sc, true)
	draw_line(_p(o, sc, 138, 121), _p(o, sc, 124, 126), Color(accent, 0.18), 2.0 * sc, true)


func _draw_rim_light(o: Vector2, sc: float, race: String, accent: Color) -> void:
	var radius := 61.0
	if race == "Grothak":
		radius = 72.0
	draw_arc(
		_p(o, sc, 100, 105),
		radius * sc,
		deg_to_rad(205),
		deg_to_rad(292),
		32,
		Color(0.82, 0.94, 1.0, 0.42),
		2.2 * sc,
		true
	)
	draw_arc(
		_p(o, sc, 100, 105),
		(radius + 2.0) * sc,
		deg_to_rad(-62),
		deg_to_rad(34),
		24,
		Color(accent, 0.46),
		2.0 * sc,
		true
	)


func _draw_closed_eyes(o: Vector2, sc: float, accent: Color) -> void:
	for x in [70.0, 130.0]:
		draw_line(
			_p(o, sc, x - 11, 91),
			_p(o, sc, x + 11, 89),
			Color(AvatarRenderer.INK, 0.95),
			3.2 * sc,
			true
		)
		draw_line(
			_p(o, sc, x - 7, 94),
			_p(o, sc, x + 7, 93),
			Color(accent, 0.28),
			1.2 * sc,
			true
		)


func _painted_ellipse(
	o: Vector2,
	sc: float,
	center: Vector2,
	radii: Vector2,
	skin: Color,
	dark: Color,
	light: Color
) -> void:
	var outer := _ellipse_points(o, sc, center, radii, 48)
	draw_colored_polygon(outer, dark)
	var body := _ellipse_points(o, sc, center + Vector2(-1, -2), radii - Vector2(3, 3), 48)
	draw_colored_polygon(body, skin)
	var lit := _ellipse_points(o, sc, center + Vector2(-10, -10), radii * Vector2(0.62, 0.55), 36)
	draw_colored_polygon(lit, Color(light, 0.2))
	draw_polyline(outer + PackedVector2Array([outer[0]]), AvatarRenderer.INK, 2.8 * sc, true)


func _ellipse_points(
	o: Vector2,
	sc: float,
	center: Vector2,
	radii: Vector2,
	steps: int
) -> PackedVector2Array:
	var points := PackedVector2Array()
	for i in steps:
		var angle := TAU * float(i) / float(steps)
		points.append(_p(
			o,
			sc,
			center.x + cos(angle) * radii.x,
			center.y + sin(angle) * radii.y
		))
	return points


func _draw_race_base(o: Vector2, sc: float, race: String, skin: Color, dark: Color, light: Color, accent: Color) -> void:
	match race:
		"Zyrathi":
			_poly(o, sc, [Vector2(58, 48), Vector2(48, 8), Vector2(72, 42)], AvatarRenderer.shade(skin, 25))
			_poly(o, sc, [Vector2(100, 40), Vector2(100, 2), Vector2(114, 40)], accent)
			_poly(o, sc, [Vector2(142, 48), Vector2(152, 8), Vector2(128, 42)], AvatarRenderer.shade(skin, 25))
			_painted_ellipse(o, sc, Vector2(100, 105), Vector2(61, 66), skin, dark, light)
			_painted_ellipse(o, sc, Vector2(100, 140), Vector2(32, 21), AvatarRenderer.shade(skin, -18), AvatarRenderer.shade(dark, -10), skin)
			for pt in [Vector2(62, 88), Vector2(138, 88), Vector2(70, 112), Vector2(130, 112)]:
				draw_arc(_p(o, sc, pt.x, pt.y), 10.0 * sc, PI, TAU, 12, Color(dark, 0.62), 2.0 * sc, true)
		"Cognati":
			draw_line(_p(o, sc, 100, 40), _p(o, sc, 100, 14), AvatarRenderer.INK, 3.0 * sc)
			draw_circle(_p(o, sc, 100, 12), 9.0 * sc, AvatarRenderer.INK)
			draw_circle(_p(o, sc, 100, 12), 6.0 * sc, accent)
			draw_circle(_p(o, sc, 98, 10), 2.0 * sc, Color.WHITE)
			_poly(o, sc, [
				Vector2(100, 40), Vector2(148, 58), Vector2(152, 118),
				Vector2(100, 168), Vector2(48, 118), Vector2(52, 58),
			], dark)
			_poly(o, sc, [
				Vector2(99, 44), Vector2(143, 61), Vector2(146, 114),
				Vector2(99, 162), Vector2(54, 114), Vector2(57, 61),
			], skin, false)
			draw_line(_p(o, sc, 100, 42), _p(o, sc, 100, 164), Color(accent.r, accent.g, accent.b, 0.85), 2.0 * sc)
			draw_line(_p(o, sc, 62, 70), _p(o, sc, 58, 128), Color(accent, 0.55), 2.0 * sc, true)
			draw_line(_p(o, sc, 138, 70), _p(o, sc, 142, 128), Color(accent, 0.55), 2.0 * sc, true)
			for pt in [Vector2(58, 66), Vector2(142, 66), Vector2(56, 128), Vector2(144, 128)]:
				draw_circle(_p(o, sc, pt.x, pt.y), 5.0 * sc, AvatarRenderer.INK)
				draw_circle(_p(o, sc, pt.x, pt.y), 2.0 * sc, Color(accent, 0.7))
		"Luminae":
			draw_circle(_p(o, sc, 100, 100), 86.0 * sc, Color(accent.r, accent.g, accent.b, 0.08))
			draw_circle(_p(o, sc, 100, 100), 72.0 * sc, Color(accent.r, accent.g, accent.b, 0.12))
			_painted_ellipse(o, sc, Vector2(100, 105), Vector2(58, 66), skin, dark, light)
			for pt in [Vector2(62, 40), Vector2(100, 22), Vector2(138, 40)]:
				_poly(o, sc, [pt, pt + Vector2(6, -18), pt + Vector2(12, 0)], accent)
			for pt in [Vector2(50, 78), Vector2(150, 78), Vector2(64, 148), Vector2(136, 148), Vector2(100, 52)]:
				draw_circle(_p(o, sc, pt.x, pt.y), 2.2 * sc, Color.WHITE)
				draw_circle(_p(o, sc, pt.x, pt.y), 5.0 * sc, Color(accent, 0.12))
		"Grothak":
			_painted_ellipse(o, sc, Vector2(100, 110), Vector2(76, 67), skin, dark, light)
			_poly(o, sc, [Vector2(100, 52), Vector2(114, 72), Vector2(100, 92), Vector2(86, 72)], accent)
			draw_line(_p(o, sc, 40, 100), _p(o, sc, 160, 100), Color(dark.r, dark.g, dark.b, 0.65), 6.0 * sc)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 58, 130), _p(o, sc, 66, 150), _p(o, sc, 62, 160),
			]), Color(dark, 0.65), 2.5 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 142, 126), _p(o, sc, 136, 144), _p(o, sc, 140, 156),
			]), Color(dark, 0.65), 2.5 * sc, true)
		"Synthara":
			_poly(o, sc, [
				Vector2(100, 36), Vector2(65, 43), Vector2(46, 72),
				Vector2(42, 108), Vector2(51, 146), Vector2(76, 165),
				Vector2(100, 174), Vector2(124, 165), Vector2(149, 146),
				Vector2(158, 108), Vector2(154, 72), Vector2(135, 43),
			], dark)
			_poly(o, sc, [
				Vector2(100, 41), Vector2(68, 48), Vector2(51, 74),
				Vector2(48, 107), Vector2(56, 142), Vector2(78, 159),
				Vector2(100, 168), Vector2(122, 159), Vector2(144, 142),
				Vector2(152, 107), Vector2(149, 74), Vector2(132, 48),
			], skin, false)
			draw_line(_p(o, sc, 52, 94), _p(o, sc, 148, 94), Color(dark.r, dark.g, dark.b, 0.45), 3.0 * sc)
			_poly(o, sc, [Vector2(40, 96), Vector2(14, 108), Vector2(42, 110)], Color(accent, 0.5), false)
			_poly(o, sc, [Vector2(160, 96), Vector2(186, 108), Vector2(158, 110)], Color(accent, 0.5), false)
		_:
			_painted_ellipse(o, sc, Vector2(100, 105), Vector2(58, 64), skin, dark, light)


func _poly(o: Vector2, sc: float, pts: Array, fill: Color, outline := true) -> void:
	var packed := PackedVector2Array()
	for p in pts:
		packed.append(_p(o, sc, p.x, p.y))
	if packed.size() >= 3:
		draw_colored_polygon(packed, fill)
		if outline:
			draw_polyline(packed + PackedVector2Array([packed[0]]), AvatarRenderer.INK, 1.8 * sc, true)


func _draw_ears(o: Vector2, sc: float, style: String, skin: Color) -> void:
	match style:
		"Tapered", "Pointed":
			_poly(o, sc, [Vector2(48, 108), Vector2(16, 74), Vector2(58, 108)], skin)
			_poly(o, sc, [Vector2(152, 108), Vector2(184, 74), Vector2(142, 108)], skin)
		"Finned":
			for i in 3:
				var y := 96.0 + float(i) * 11.0
				draw_line(_p(o, sc, 46, y), _p(o, sc, 12, y + 4), AvatarRenderer.INK, 2.5 * sc)
				draw_line(_p(o, sc, 154, y), _p(o, sc, 188, y + 4), AvatarRenderer.INK, 2.5 * sc)
		"Sensor Stalks", "Antennae":
			draw_line(_p(o, sc, 70, 56), _p(o, sc, 50, 16), AvatarRenderer.INK, 2.5 * sc)
			draw_circle(_p(o, sc, 49, 14), 9.0 * sc, Color(0.0, 0.9, 1.0))
			draw_line(_p(o, sc, 130, 56), _p(o, sc, 150, 16), AvatarRenderer.INK, 2.5 * sc)
			draw_circle(_p(o, sc, 151, 14), 9.0 * sc, Color(0.0, 0.9, 1.0))
		"Elongated", "Leaf":
			_poly(o, sc, [Vector2(48, 108), Vector2(14, 70), Vector2(20, 62), Vector2(54, 108)], skin)
			_poly(o, sc, [Vector2(152, 108), Vector2(186, 70), Vector2(180, 62), Vector2(146, 108)], skin)
		"Crest Horns", "Horns":
			_poly(o, sc, [Vector2(60, 52), Vector2(44, 12), Vector2(70, 52)], Color(0.96, 0.89, 0.74))
			_poly(o, sc, [Vector2(140, 52), Vector2(156, 12), Vector2(130, 52)], Color(0.96, 0.89, 0.74))
		_:
			pass


func _draw_brows(o: Vector2, sc: float, style: String) -> void:
	var y := 73.0
	match style:
		"None":
			return
		"Tactical", "Angled":
			draw_line(_p(o, sc, 58, y + 7), _p(o, sc, 88, y - 3), AvatarRenderer.INK, 3.5 * sc, true)
			draw_line(_p(o, sc, 142, y + 7), _p(o, sc, 112, y - 3), AvatarRenderer.INK, 3.5 * sc, true)
		"Heavy", "Thick":
			draw_rect(Rect2(_p(o, sc, 52, y - 4), Vector2(36, 11) * sc), AvatarRenderer.INK)
			draw_rect(Rect2(_p(o, sc, 112, y - 4), Vector2(36, 11) * sc), AvatarRenderer.INK)
		"Scarred", "Zigzag":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 56, y), _p(o, sc, 66, y - 7), _p(o, sc, 76, y), _p(o, sc, 88, y - 7)
			]), AvatarRenderer.INK, 2.8 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 144, y), _p(o, sc, 134, y - 7), _p(o, sc, 124, y), _p(o, sc, 112, y - 7)
			]), AvatarRenderer.INK, 2.8 * sc, true)
		_:
			draw_line(_p(o, sc, 58, y), _p(o, sc, 89, y - 3), AvatarRenderer.INK, 3.0 * sc, true)
			draw_line(_p(o, sc, 142, y), _p(o, sc, 111, y - 3), AvatarRenderer.INK, 3.0 * sc, true)


func _draw_eyes(o: Vector2, sc: float, style: String) -> void:
	var L := 70.0
	var R := 130.0
	var Y := 90.0
	match style:
		"Target Visor", "Visor Glow":
			draw_style_box(_visor_style(Color(0.03, 0.05, 0.1), AvatarRenderer.INK), Rect2(
				_p(o, sc, L - 18, Y - 12),
				Vector2(R - L + 36, 24) * sc
			))
			draw_rect(Rect2(_p(o, sc, L - 13, Y - 5), Vector2(R - L + 26, 10) * sc), Color(0.0, 0.74, 0.85))
			draw_line(_p(o, sc, L - 8, Y - 2), _p(o, sc, R + 4, Y - 2), Color(0.8, 0.98, 1.0, 0.82), 2.0 * sc, true)
		"Combat Slits", "Cyber Slits":
			for x in [L, R]:
				draw_rect(Rect2(_p(o, sc, x - 14, Y - 6), Vector2(28, 12) * sc), Color(0.0, 0.7, 0.82))
				draw_line(_p(o, sc, x - 9, Y - 1), _p(o, sc, x + 9, Y - 1), Color.WHITE, 2.0 * sc, true)
		"Wide Scan", "Wide Saucer":
			for x in [L, R]:
				draw_circle(_p(o, sc, x, Y), 13.0 * sc, Color(0.05, 0.06, 0.12))
				draw_circle(_p(o, sc, x - 3, Y - 2), 5.0 * sc, Color(0.78, 0.96, 1.0))
				draw_circle(_p(o, sc, x + 3, Y + 2), 2.5 * sc, Color(0.0, 0.75, 0.9))
		"Multi-Lens", "Three Eyes":
			for e in [Vector2(L, Y), Vector2(100, 74), Vector2(R, Y)]:
				_eye_oval(o, sc, e.x, e.y, 0.76)
		"Prism Optics", "Star Pupils":
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(11, 8), 24)
				draw_colored_polygon(eye, Color(0.9, 0.95, 1.0))
				draw_polyline(eye + PackedVector2Array([eye[0]]), AvatarRenderer.INK, 2.0 * sc, true)
				draw_circle(_p(o, sc, x, Y), 4.5 * sc, Color(0.49, 0.23, 0.93))
				draw_circle(_p(o, sc, x, Y), 2.0 * sc, AvatarRenderer.INK)
				draw_circle(_p(o, sc, x - 1.5, Y - 1.5), 1.2 * sc, Color.WHITE)
		_:
			for x in [L, R]:
				_eye_oval(o, sc, x, Y)


func _eye_oval(o: Vector2, sc: float, x: float, y: float, scale_mul := 1.0) -> void:
	var rx := 11.0 * scale_mul
	var ry := 8.0 * scale_mul
	var eye := _ellipse_points(o, sc, Vector2(x, y), Vector2(rx, ry), 24)
	draw_colored_polygon(eye, Color(0.92, 0.96, 1.0))
	draw_polyline(eye + PackedVector2Array([eye[0]]), AvatarRenderer.INK, 2.0 * sc, true)
	draw_circle(_p(o, sc, x, y + 1), 4.8 * sc * scale_mul, Color(0.0, 0.58, 0.7))
	draw_circle(_p(o, sc, x, y + 1), 2.5 * sc * scale_mul, AvatarRenderer.INK)
	draw_circle(_p(o, sc, x - 1.5, y - 1.5), 1.4 * sc * scale_mul, Color.WHITE)
	draw_line(_p(o, sc, x - rx + 1, y - ry + 1), _p(o, sc, x + rx - 1, y - ry), Color(AvatarRenderer.INK, 0.78), 2.4 * sc, true)


func _visor_style(bg: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	return style


func _draw_nose(o: Vector2, sc: float, style: String, dark: Color) -> void:
	match style:
		"None":
			return
		"Slits":
			draw_line(_p(o, sc, 91, 106), _p(o, sc, 96, 108), Color(AvatarRenderer.INK, 0.78), 2.0 * sc, true)
			draw_line(_p(o, sc, 109, 106), _p(o, sc, 104, 108), Color(AvatarRenderer.INK, 0.78), 2.0 * sc, true)
		"Trunk":
			draw_line(_p(o, sc, 100, 102), _p(o, sc, 100, 138), AvatarRenderer.INK, 2.0 * sc)
		"Ridge":
			draw_line(_p(o, sc, 100, 80), _p(o, sc, 100, 118), AvatarRenderer.INK, 2.0 * sc)
		"Spike":
			_poly(o, sc, [Vector2(100, 96), Vector2(109, 114), Vector2(91, 114)], AvatarRenderer.shade(dark, 20))
		_:
			draw_line(_p(o, sc, 101, 98), _p(o, sc, 97, 111), Color(dark, 0.58), 2.0 * sc, true)
			draw_line(_p(o, sc, 97, 111), _p(o, sc, 103, 112), Color(dark, 0.58), 2.0 * sc, true)


func _draw_mouth(o: Vector2, sc: float, style: String) -> void:
	var y := 138.0
	match style:
		"Tusked", "Fanged":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 78, y), _p(o, sc, 91, y + 6),
				_p(o, sc, 109, y + 6), _p(o, sc, 122, y),
			]), Color(0.3, 0.07, 0.08), 5.0 * sc, true)
			_poly(o, sc, [Vector2(84, 138), Vector2(89, 149), Vector2(94, 139)], Color(0.92, 0.94, 0.9))
			_poly(o, sc, [Vector2(106, 139), Vector2(111, 149), Vector2(116, 138)], Color(0.92, 0.94, 0.9))
		"Mandible", "Beak":
			_poly(o, sc, [Vector2(100, y - 10), Vector2(122, y + 8), Vector2(100, y + 26), Vector2(78, y + 8)], Color(1.0, 0.64, 0.17))
		"Proboscis", "Tentacle":
			for x in [74, 87, 100, 113, 126]:
				draw_line(_p(o, sc, x, y), _p(o, sc, x - 2, y + 22), AvatarRenderer.INK, 2.0 * sc)
		"Closed", "Pursed":
			draw_line(_p(o, sc, 89, y), _p(o, sc, 100, y + 2), Color(0.28, 0.07, 0.09), 3.0 * sc, true)
			draw_line(_p(o, sc, 100, y + 2), _p(o, sc, 111, y), Color(0.28, 0.07, 0.09), 3.0 * sc, true)
		"Grim Line":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 78, y + 2), _p(o, sc, 94, y),
				_p(o, sc, 108, y + 1), _p(o, sc, 122, y - 2),
			]), Color(AvatarRenderer.INK, 0.92), 3.0 * sc, true)
		"Wide Grin":
			_poly(o, sc, [
				Vector2(78, y), Vector2(88, y + 7), Vector2(100, y + 9),
				Vector2(112, y + 7), Vector2(122, y),
				Vector2(110, y + 3), Vector2(90, y + 3),
			], Color(0.88, 0.9, 0.88))
		_:
			draw_polyline(PackedVector2Array([
				_p(o, sc, 82, y), _p(o, sc, 94, y + 3),
				_p(o, sc, 107, y + 2), _p(o, sc, 118, y - 2),
			]), Color(AvatarRenderer.INK, 0.88), 2.8 * sc, true)


func _draw_markings(o: Vector2, sc: float, style: String, dark: Color) -> void:
	match style:
		"Battle Scar", "Scar":
			draw_line(_p(o, sc, 118, 68), _p(o, sc, 130, 94), Color(0.85, 0.77, 1.0), 2.0 * sc)
		"Plasma Burns", "Mole Cluster":
			draw_circle(_p(o, sc, 116, 110), 3.5 * sc, dark)
			draw_circle(_p(o, sc, 126, 116), 2.5 * sc, dark)
			draw_circle(_p(o, sc, 108, 114), 2.5 * sc, dark)
		"War Paint", "Tribal Lines":
			draw_line(_p(o, sc, 54, 110), _p(o, sc, 72, 102), Color(0.85, 0.77, 1.0), 2.0 * sc)
			draw_line(_p(o, sc, 146, 110), _p(o, sc, 128, 102), Color(0.85, 0.77, 1.0), 2.0 * sc)
		"Speckled", "Freckles":
			for i in 5:
				var x := 88.0 + float(i) * 4.0
				draw_circle(_p(o, sc, x, 102 + (i % 2) * 5), 2.2 * sc, Color(dark.r, dark.g, dark.b, 0.75))
		"Fractured", "Cracks":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 100, 52), _p(o, sc, 107, 74), _p(o, sc, 102, 86), _p(o, sc, 110, 100)
			]), Color(0.6, 0.54, 0.71), 2.0 * sc, true)
		_:
			pass
