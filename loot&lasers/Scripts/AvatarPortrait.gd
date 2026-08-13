class_name AvatarPortrait
extends Control
## Drawn portrait Control — used by AvatarRenderer.make_portrait.

var character: Dictionary = {}
var _elapsed := 0.0
var _phase := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_phase = float(get_instance_id() % 97) / 97.0 * TAU


func set_active(on: bool) -> void:
	set_process(on)
	if on:
		queue_redraw()


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
	var race_accent: Color = AvatarRenderer.RACE_ACCENT.get(race, AvatarRenderer.RACE_ACCENT["Cognati"])
	var feature_accent := AvatarRenderer.feature_glow(str(app.get("accent_color", "")), race_accent)

	_draw_race_portrait(origin, scale, race, archetype, app, skin, dark, light, race_accent, feature_accent)


func _draw_race_portrait(
	origin: Vector2,
	scale: float,
	race: String,
	archetype: String,
	app: Dictionary,
	skin: Color,
	dark: Color,
	light: Color,
	race_accent: Color,
	feature_accent: Color
) -> void:
	match race:
		"Zyrathi":
			_draw_zyrathi_new(origin, scale, archetype, app, skin, dark, light, race_accent, feature_accent)
		"Synthara":
			_draw_synthara_new(origin, scale, archetype, app, skin, dark, light, race_accent, feature_accent)
		"Grothak":
			_draw_grothak_new(origin, scale, archetype, app, skin, dark, light, race_accent, feature_accent)
		"Cognati":
			_draw_cognati_new(origin, scale, archetype, app, skin, dark, light, race_accent, feature_accent)
		"Luminae":
			_draw_luminae_new(origin, scale, archetype, app, skin, dark, light, race_accent, feature_accent)
		_:
			_draw_cognati_new(origin, scale, archetype, app, skin, dark, light, race_accent, feature_accent)


func _p(origin: Vector2, scale: float, x: float, y: float) -> Vector2:
	return origin + Vector2(x, y) * scale


## Full-brightness aura rings (never shrink-to-fit). Hosts decide clip vs bleed.
func _draw_aura_rings(
	o: Vector2,
	sc: float,
	center: Vector2,
	col: Color,
	rings: int,
	inner: float,
	step: float,
	alpha0: float,
	alpha_step: float
) -> void:
	for ring in range(rings, 0, -1):
		var radius := (inner + float(ring) * step) * sc
		var alpha := alpha0 + float(rings + 1 - ring) * alpha_step
		draw_circle(_p(o, sc, center.x, center.y), radius, Color(col.r, col.g, col.b, alpha))


func _blink_closed() -> bool:
	var cycle := fposmod(_elapsed + _phase, 3.8)
	return cycle > 3.55 and cycle < 3.68


func _draw_bust(
	o: Vector2,
	sc: float,
	archetype: String,
	accent: Color,
	dark: Color,
	bust_tint_override: Color = Color(0, 0, 0, 0)
) -> void:
	var class_tint: Color = {
		"Vanguard": Color("#F87171"),
		"Shadow Operative": Color("#A78BFA"),
		"Technomancer": Color("#38BDF8"),
		"Astral Warden": Color("#FBBF24"),
		"Void Runner": Color("#C084FC"),
		"Cosmic Engineer": Color("#34D399"),
	}.get(archetype, accent)
	if bust_tint_override.a > 0.01:
		class_tint = bust_tint_override

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


## Shared "new style" Prism Optics — solid black lenses + tiny accent glint.
func _draw_prism_optics(o: Vector2, sc: float, left_x: float, right_x: float, y: float, accent: Color, radii: Vector2 = Vector2(12, 9)) -> void:
	for x in [left_x, right_x]:
		var eye := _ellipse_points(o, sc, Vector2(x, y), radii, 24)
		draw_colored_polygon(eye, Color(0.04, 0.04, 0.06))
		draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.9), 1.8 * sc, true)
		draw_circle(_p(o, sc, x - 3.0, y - 2.0), 1.6 * sc, Color(accent, 0.95))


func _poly(o: Vector2, sc: float, pts: Array, fill: Color, outline := true) -> void:
	var packed := PackedVector2Array()
	for p in pts:
		packed.append(_p(o, sc, p.x, p.y))
	if packed.size() >= 3:
		draw_colored_polygon(packed, fill)
		if outline:
			draw_polyline(packed + PackedVector2Array([packed[0]]), AvatarRenderer.INK, 1.8 * sc, true)


func _visor_style(bg: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	return style


# ─── Race portraits ───────────────────────────────────────────────────────────

func _draw_synthara_new(
	o: Vector2,
	sc: float,
	archetype: String,
	app: Dictionary,
	skin: Color,
	dark: Color,
	light: Color,
	race_accent: Color,
	feature: Color
) -> void:
	# Soft aura only — no floating spark dots off the crown.
	_draw_aura_rings(o, sc, Vector2(100, 108), feature, 4, 68.0, 6.0, 0.014, 0.01)

	# Synthara bust uses signature purple, not class tint.
	_draw_bust(o, sc, archetype, race_accent, dark, race_accent)

	# Layered chassis head (softer silhouette + shading).
	var plate_outer := [
		Vector2(100, 34), Vector2(78, 38), Vector2(58, 52), Vector2(46, 74),
		Vector2(42, 100), Vector2(46, 128), Vector2(58, 150), Vector2(76, 164),
		Vector2(100, 172), Vector2(124, 164), Vector2(142, 150), Vector2(154, 128),
		Vector2(158, 100), Vector2(154, 74), Vector2(142, 52), Vector2(122, 38),
	]
	_poly(o, sc, plate_outer, dark, false)
	var plate_mid := [
		Vector2(100, 40), Vector2(80, 44), Vector2(62, 56), Vector2(52, 76),
		Vector2(48, 100), Vector2(52, 126), Vector2(62, 146), Vector2(78, 158),
		Vector2(100, 166), Vector2(122, 158), Vector2(138, 146), Vector2(148, 126),
		Vector2(152, 100), Vector2(148, 76), Vector2(138, 56), Vector2(120, 44),
	]
	_poly(o, sc, plate_mid, skin, false)
	# Nested soft lighting (subsurface-ish).
	var lit := _ellipse_points(o, sc, Vector2(88, 88), Vector2(34, 38), 28)
	draw_colored_polygon(lit, Color(light, 0.22))
	var jaw := _ellipse_points(o, sc, Vector2(108, 132), Vector2(36, 28), 24)
	draw_colored_polygon(jaw, Color(dark, 0.28))
	# Thin chassis outline — lighter than the old heavy ink slab.
	var outline := PackedVector2Array()
	for p in plate_mid:
		outline.append(_p(o, sc, p.x, p.y))
	draw_polyline(outline + PackedVector2Array([outline[0]]), Color(AvatarRenderer.INK, 0.72), 1.6 * sc, true)

	# Face-plate seam — player accent tone.
	draw_line(_p(o, sc, 54, 96), _p(o, sc, 146, 96), Color(dark, 0.55), 2.4 * sc, true)
	draw_line(_p(o, sc, 58, 94), _p(o, sc, 142, 94), Color(feature, 0.55), 1.4 * sc, true)
	draw_circle(_p(o, sc, 100, 95), 2.2 * sc, Color(feature, 0.9))
	draw_circle(_p(o, sc, 100, 95), 1.0 * sc, Color(0.92, 0.96, 1.0, 0.85))

	# Race-default chassis ports — flush to temples (ear slot), not floating crown dots.
	_poly(o, sc, [
		Vector2(46, 100), Vector2(22, 106), Vector2(20, 118), Vector2(28, 124), Vector2(48, 114),
	], Color(AvatarRenderer.shade(skin, -28), 0.98), false)
	_poly(o, sc, [
		Vector2(154, 100), Vector2(178, 106), Vector2(180, 118), Vector2(172, 124), Vector2(152, 114),
	], Color(AvatarRenderer.shade(skin, -28), 0.98), false)
	draw_circle(_p(o, sc, 26, 112), 2.6 * sc, Color(feature, 0.9))
	draw_circle(_p(o, sc, 174, 112), 2.6 * sc, Color(feature, 0.9))
	draw_circle(_p(o, sc, 26, 112), 1.1 * sc, Color(0.9, 0.95, 1.0, 0.85))
	draw_circle(_p(o, sc, 174, 112), 1.1 * sc, Color(0.9, 0.95, 1.0, 0.85))

	var eye_style := str(app.get("eye_style", "Standard Optics"))
	var brow_style := str(app.get("eyebrows", "Standard"))
	var nose_style := str(app.get("nose", "Slits"))
	var mouth_style := str(app.get("mouth", "Set Jaw"))
	var mark_style := str(app.get("marking", "None"))

	# Always draw the chosen options — no remaps that collapse styles.
	if brow_style != "None":
		_draw_brows_synthara(o, sc, brow_style)
	if not _blink_closed():
		_draw_eyes_synthara(o, sc, eye_style, feature)
	else:
		_draw_closed_eyes_synthara(o, sc, feature)
	_draw_nose_synthara(o, sc, nose_style, dark, feature)
	_draw_mouth_synthara(o, sc, mouth_style, feature)
	_draw_markings_synthara(o, sc, mark_style, dark, feature)


func _draw_brows_synthara(o: Vector2, sc: float, style: String) -> void:
	## Brow slot sits well above optics/visor (visor top ≈ y 80).
	var y := 66.0
	match style:
		"Angry":
			draw_line(_p(o, sc, 52, y - 2), _p(o, sc, 90, y + 10), AvatarRenderer.INK, 3.4 * sc, true)
			draw_line(_p(o, sc, 148, y - 2), _p(o, sc, 110, y + 10), AvatarRenderer.INK, 3.4 * sc, true)
			draw_line(_p(o, sc, 54, y), _p(o, sc, 88, y + 8), Color(AvatarRenderer.INK, 0.45), 1.4 * sc, true)
			draw_line(_p(o, sc, 146, y), _p(o, sc, 112, y + 8), Color(AvatarRenderer.INK, 0.45), 1.4 * sc, true)
		"Tactical", "Angled":
			# Sharp inward slash — outer tip low, inner tip high.
			draw_line(_p(o, sc, 54, y + 8), _p(o, sc, 88, y - 4), AvatarRenderer.INK, 3.4 * sc, true)
			draw_line(_p(o, sc, 146, y + 8), _p(o, sc, 112, y - 4), AvatarRenderer.INK, 3.4 * sc, true)
			draw_line(_p(o, sc, 55, y + 6), _p(o, sc, 86, y - 2), Color(AvatarRenderer.INK, 0.45), 1.4 * sc, true)
			draw_line(_p(o, sc, 145, y + 6), _p(o, sc, 114, y - 2), Color(AvatarRenderer.INK, 0.45), 1.4 * sc, true)
		"Heavy", "Thick":
			# Thick chassis plates over each optic.
			draw_rect(Rect2(_p(o, sc, 54, y - 2), Vector2(32, 10) * sc), AvatarRenderer.INK)
			draw_rect(Rect2(_p(o, sc, 114, y - 2), Vector2(32, 10) * sc), AvatarRenderer.INK)
			draw_line(_p(o, sc, 56, y + 9), _p(o, sc, 84, y + 9), Color(0.2, 0.18, 0.28, 0.7), 1.6 * sc, true)
			draw_line(_p(o, sc, 116, y + 9), _p(o, sc, 144, y + 9), Color(0.2, 0.18, 0.28, 0.7), 1.6 * sc, true)
		"Scarred", "Zigzag":
			# Broken jagged ridge — clearly not a smooth brow.
			draw_polyline(PackedVector2Array([
				_p(o, sc, 54, y + 4), _p(o, sc, 64, y - 6), _p(o, sc, 72, y + 2),
				_p(o, sc, 80, y - 5), _p(o, sc, 90, y + 3),
			]), AvatarRenderer.INK, 2.8 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 146, y + 4), _p(o, sc, 136, y - 6), _p(o, sc, 128, y + 2),
				_p(o, sc, 120, y - 5), _p(o, sc, 110, y + 3),
			]), AvatarRenderer.INK, 2.8 * sc, true)
			# Slash mark on the right brow.
			draw_line(_p(o, sc, 124, y - 8), _p(o, sc, 134, y + 6), Color(0.75, 0.7, 0.85, 0.75), 1.8 * sc, true)
		"None":
			return
		_:
			# Standard — soft arch (not a straight slash).
			draw_arc(_p(o, sc, 70, y + 10), 18.0 * sc, deg_to_rad(200), deg_to_rad(340), 14, AvatarRenderer.INK, 2.8 * sc, true)
			draw_arc(_p(o, sc, 130, y + 10), 18.0 * sc, deg_to_rad(200), deg_to_rad(340), 14, AvatarRenderer.INK, 2.8 * sc, true)


func _draw_eyes_synthara(o: Vector2, sc: float, style: String, accent: Color) -> void:
	## Optic slot: left/right lenses below the seam, clear of brow + mouth.
	var L := 70.0
	var R := 130.0
	var Y := 90.0
	match style:
		"Target Visor", "Visor Glow":
			draw_style_box(_visor_style(Color(0.04, 0.05, 0.1), Color(AvatarRenderer.INK, 0.85)), Rect2(
				_p(o, sc, L - 16, Y - 10),
				Vector2(R - L + 32, 20) * sc
			))
			draw_rect(Rect2(_p(o, sc, L - 12, Y - 4), Vector2(R - L + 24, 8) * sc), Color(accent.r, accent.g, accent.b, 0.85))
			draw_line(_p(o, sc, L - 6, Y - 1), _p(o, sc, R + 2, Y - 1), Color(0.9, 0.96, 1.0, 0.8), 1.6 * sc, true)
		"Combat Slits", "Cyber Slits":
			for x in [L, R]:
				draw_rect(Rect2(_p(o, sc, x - 12, Y - 4), Vector2(24, 8) * sc), Color(0.05, 0.06, 0.1))
				draw_rect(Rect2(_p(o, sc, x - 10, Y - 2), Vector2(20, 4) * sc), Color(accent.r, accent.g, accent.b, 0.9))
				draw_line(_p(o, sc, x - 7, Y), _p(o, sc, x + 7, Y), Color.WHITE, 1.4 * sc, true)
		"Wide Scan", "Wide Saucer":
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(12, 10), 24)
				draw_colored_polygon(eye, Color(0.05, 0.06, 0.12))
				draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.8), 1.6 * sc, true)
				draw_circle(_p(o, sc, x - 2, Y - 1), 4.5 * sc, Color(0.78, 0.9, 1.0))
				draw_circle(_p(o, sc, x + 2, Y + 2), 2.2 * sc, Color(accent))
		"Dead Gaze", "Ember Gaze":
			# Reptilian almond + vertical slit pupil (legacy name: Ember Gaze).
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(12, 8), 24)
				draw_colored_polygon(eye, Color(0.12, 0.08, 0.05))
				draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.85), 1.6 * sc, true)
				draw_circle(_p(o, sc, x, Y), 5.0 * sc, Color(accent, 0.55))
				draw_rect(Rect2(_p(o, sc, x - 1.3, Y - 5.0), Vector2(2.6, 10) * sc), Color(accent.r, accent.g, accent.b, 0.95))
				draw_rect(Rect2(_p(o, sc, x - 0.65, Y - 4.0), Vector2(1.3, 8) * sc), Color(0.05, 0.04, 0.05, 0.95))
				draw_circle(_p(o, sc, x - 3.2, Y - 1.8), 1.2 * sc, Color(1.0, 0.95, 0.8, 0.75))
		"Prism Optics", "Star Pupils":
			_draw_prism_optics(o, sc, L, R, Y, accent)
		_:
			for x in [L, R]:
				_eye_oval_synthara(o, sc, x, Y, 1.0, accent)


func _eye_oval_synthara(o: Vector2, sc: float, x: float, y: float, scale_mul: float, accent: Color) -> void:
	var rx := 10.5 * scale_mul
	var ry := 7.5 * scale_mul
	var eye := _ellipse_points(o, sc, Vector2(x, y), Vector2(rx, ry), 24)
	draw_colored_polygon(eye, Color(0.9, 0.94, 1.0))
	draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.75), 1.6 * sc, true)
	draw_circle(_p(o, sc, x, y + 0.5), 4.4 * sc * scale_mul, accent)
	draw_circle(_p(o, sc, x, y + 0.5), 2.2 * sc * scale_mul, AvatarRenderer.INK)
	draw_circle(_p(o, sc, x - 1.4, y - 1.4), 1.3 * sc * scale_mul, Color.WHITE)


func _draw_closed_eyes_synthara(o: Vector2, sc: float, accent: Color) -> void:
	for x in [70.0, 130.0]:
		draw_line(_p(o, sc, x - 10, 90), _p(o, sc, x + 10, 88), Color(AvatarRenderer.INK, 0.92), 2.8 * sc, true)
		draw_line(_p(o, sc, x - 6, 92), _p(o, sc, x + 6, 91), Color(accent, 0.3), 1.1 * sc, true)


func _draw_nose_synthara(o: Vector2, sc: float, style: String, dark: Color, accent: Color) -> void:
	## Nose slot sits lower on the chassis (below seam y≈94, above mouth y≈140).
	match style:
		"None":
			return
		"Slits":
			# Twin vent slits — horizontal, mid-lower face.
			draw_line(_p(o, sc, 92, 118), _p(o, sc, 97, 120), Color(AvatarRenderer.INK, 0.82), 2.0 * sc, true)
			draw_line(_p(o, sc, 108, 118), _p(o, sc, 103, 120), Color(AvatarRenderer.INK, 0.82), 2.0 * sc, true)
			draw_line(_p(o, sc, 93, 121), _p(o, sc, 96, 121), Color(accent, 0.35), 1.0 * sc, true)
			draw_line(_p(o, sc, 107, 121), _p(o, sc, 104, 121), Color(accent, 0.35), 1.0 * sc, true)
		"Ridge":
			# Short vertical plate ridge — half the old height (~19px vs ~38px).
			draw_line(_p(o, sc, 100, 110), _p(o, sc, 100, 129), Color(AvatarRenderer.INK, 0.88), 2.4 * sc, true)
			draw_line(_p(o, sc, 98, 112), _p(o, sc, 98, 127), Color(dark, 0.45), 1.4 * sc, true)
			draw_line(_p(o, sc, 102, 112), _p(o, sc, 102, 127), Color(accent, 0.28), 1.2 * sc, true)
		"Spike":
			# Forward chassis tip — diamond spike, not slits.
			_poly(o, sc, [
				Vector2(100, 112), Vector2(108, 122), Vector2(100, 132), Vector2(92, 122),
			], AvatarRenderer.shade(dark, 18), false)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 100, 112), _p(o, sc, 108, 122),
				_p(o, sc, 100, 132), _p(o, sc, 92, 122), _p(o, sc, 100, 112),
			]), Color(AvatarRenderer.INK, 0.8), 1.5 * sc, true)
			draw_line(_p(o, sc, 100, 114), _p(o, sc, 100, 128), Color(accent, 0.55), 1.4 * sc, true)
		"Button":
			# Soft rounded node with a highlight — clearly not slits.
			draw_circle(_p(o, sc, 100, 120), 5.5 * sc, Color(dark, 0.9))
			draw_circle(_p(o, sc, 100, 120), 4.0 * sc, AvatarRenderer.shade(dark, 25))
			draw_circle(_p(o, sc, 98.5, 118.5), 1.6 * sc, Color(
				clampf(accent.r + 0.35, 0.0, 1.0),
				clampf(accent.g + 0.35, 0.0, 1.0),
				clampf(accent.b + 0.25, 0.0, 1.0),
				0.55
			))
			draw_arc(_p(o, sc, 100, 120), 5.5 * sc, 0.0, TAU, 20, Color(AvatarRenderer.INK, 0.65), 1.3 * sc, true)
		_:
			# Fallback = Button.
			draw_circle(_p(o, sc, 100, 120), 5.5 * sc, Color(dark, 0.9))
			draw_circle(_p(o, sc, 100, 120), 4.0 * sc, AvatarRenderer.shade(dark, 25))
			draw_circle(_p(o, sc, 98.5, 118.5), 1.6 * sc, Color(0.85, 0.9, 1.0, 0.5))


func _draw_mouth_synthara(o: Vector2, sc: float, style: String, feature: Color) -> void:
	## Mouth slot sits below nose (y ≈ 140), clear of the face-plate seam.
	var y := 140.0
	match style:
		"Tusked", "Fanged":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 80, y), _p(o, sc, 92, y + 5),
				_p(o, sc, 108, y + 5), _p(o, sc, 120, y),
			]), AvatarRenderer.INK, 4.2 * sc, true)
			_poly(o, sc, [Vector2(86, 140), Vector2(90, 150), Vector2(94, 141)], Color(0.9, 0.92, 0.88), false)
			_poly(o, sc, [Vector2(106, 141), Vector2(110, 150), Vector2(114, 140)], Color(0.9, 0.92, 0.88), false)
		"Mandible", "Beak":
			_poly(o, sc, [
				Vector2(100, y - 6), Vector2(118, y + 6), Vector2(100, y + 20), Vector2(82, y + 6),
			], Color(feature, 0.92), false)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 100, y - 6), _p(o, sc, 118, y + 6),
				_p(o, sc, 100, y + 20), _p(o, sc, 82, y + 6), _p(o, sc, 100, y - 6),
			]), Color(AvatarRenderer.INK, 0.7), 1.4 * sc, true)
		"Proboscis", "Tentacle":
			for x in [84, 92, 100, 108, 116]:
				draw_line(_p(o, sc, x, y), _p(o, sc, x - 1, y + 16), Color(feature, 0.75), 1.8 * sc, true)
		"Closed", "Pursed":
			draw_line(_p(o, sc, 90, y), _p(o, sc, 100, y + 2), AvatarRenderer.INK, 2.6 * sc, true)
			draw_line(_p(o, sc, 100, y + 2), _p(o, sc, 110, y), AvatarRenderer.INK, 2.6 * sc, true)
		"Grim Line":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 80, y + 1), _p(o, sc, 94, y),
				_p(o, sc, 108, y + 1), _p(o, sc, 120, y - 1),
			]), Color(AvatarRenderer.INK, 0.9), 2.6 * sc, true)
		_:
			draw_polyline(PackedVector2Array([
				_p(o, sc, 84, y), _p(o, sc, 94, y + 2),
				_p(o, sc, 106, y + 2), _p(o, sc, 116, y - 1),
			]), Color(AvatarRenderer.INK, 0.85), 2.4 * sc, true)


func _draw_markings_synthara(o: Vector2, sc: float, style: String, dark: Color, accent: Color) -> void:
	## Cheek / temple / jaw only — never across the optic band or third-eye crown.
	match style:
		"Battle Scar", "Scar":
			draw_line(_p(o, sc, 124, 112), _p(o, sc, 138, 132), Color(accent, 0.75), 1.8 * sc, true)
		"Plasma Burns", "Mole Cluster":
			draw_circle(_p(o, sc, 128, 118), 3.0 * sc, dark)
			draw_circle(_p(o, sc, 136, 126), 2.2 * sc, dark)
			draw_circle(_p(o, sc, 120, 128), 2.0 * sc, dark)
		"Speckled", "Freckles":
			for i in 4:
				var x := 118.0 + float(i) * 5.0
				draw_circle(_p(o, sc, x, 120 + (i % 2) * 5), 1.8 * sc, Color(dark.r, dark.g, dark.b, 0.7))
		"Fractured", "Cracks":
			# Jaw / cheek plate cracks — below seam, off-center from third eye.
			draw_polyline(PackedVector2Array([
				_p(o, sc, 118, 108), _p(o, sc, 126, 122), _p(o, sc, 122, 136),
			]), Color(accent, 0.55), 1.6 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 78, 112), _p(o, sc, 70, 128),
			]), Color(accent, 0.4), 1.4 * sc, true)
		_:
			pass


# ─── Grothak (high-gravity tank) ─────────────────────────────────────────────

func _draw_grothak_new(
	o: Vector2,
	sc: float,
	archetype: String,
	app: Dictionary,
	skin: Color,
	dark: Color,
	light: Color,
	race_accent: Color,
	feature: Color
) -> void:
	# Soft aura — wide, low, no crown floaters / no rim lights.
	_draw_aura_rings(o, sc, Vector2(100, 112), feature, 4, 78.0, 6.5, 0.006, 0.0045)

	# Bust uses signature Grothak orange, not class tint.
	_draw_bust(o, sc, archetype, race_accent, dark, race_accent)

	# Wide heavy skull with layered shading.
	var head_c := Vector2(100, 112)
	var head_r := Vector2(78, 68)
	_painted_ellipse(o, sc, head_c, head_r, skin, dark, light)
	# Lower-half face shade — full width, clipped to the head silhouette.
	var jaw := PackedVector2Array()
	for i in 25:
		var angle := PI * float(i) / 24.0 # 0..PI = bottom semicircle in Godot Y-down
		jaw.append(_p(
			o,
			sc,
			head_c.x + cos(angle) * head_r.x,
			head_c.y + sin(angle) * head_r.y
		))
	draw_colored_polygon(jaw, Color(dark, 0.55))
	# Soft lift inside the same mask (slightly inset lower arc).
	var jaw_lit := PackedVector2Array()
	for i in 21:
		var angle := PI * float(i) / 20.0
		jaw_lit.append(_p(
			o,
			sc,
			head_c.x - 4.0 + cos(angle) * (head_r.x * 0.72),
			head_c.y + 6.0 + sin(angle) * (head_r.y * 0.55)
		))
	draw_colored_polygon(jaw_lit, Color(skin, 0.28))

	# Race-signature brow plate (always on) — sits above eye slot.
	_poly(o, sc, [
		Vector2(36, 92), Vector2(52, 78), Vector2(100, 72), Vector2(148, 78), Vector2(164, 92),
		Vector2(148, 98), Vector2(100, 94), Vector2(52, 98),
	], Color(AvatarRenderer.shade(skin, -30), 0.98), false)
	draw_line(_p(o, sc, 40, 90), _p(o, sc, 160, 90), Color(dark, 0.75), 4.5 * sc, true)
	draw_line(_p(o, sc, 48, 86), _p(o, sc, 152, 86), Color(feature, 0.4), 1.6 * sc, true)

	# Forehead crest — race signature, tinted by accent tone.
	_poly(o, sc, [
		Vector2(100, 42), Vector2(116, 68), Vector2(100, 86), Vector2(84, 68),
	], Color(feature, 0.95), false)
	draw_polyline(PackedVector2Array([
		_p(o, sc, 100, 42), _p(o, sc, 116, 68),
		_p(o, sc, 100, 86), _p(o, sc, 84, 68), _p(o, sc, 100, 42),
	]), Color(AvatarRenderer.INK, 0.75), 1.6 * sc, true)
	draw_line(_p(o, sc, 100, 48), _p(o, sc, 100, 80), Color(0.95, 0.9, 0.85, 0.35), 1.4 * sc, true)

	# Cheek / jaw stress lines (subtle race read).
	draw_polyline(PackedVector2Array([
		_p(o, sc, 48, 128), _p(o, sc, 56, 146), _p(o, sc, 52, 158),
	]), Color(dark, 0.55), 2.2 * sc, true)
	draw_polyline(PackedVector2Array([
		_p(o, sc, 152, 128), _p(o, sc, 144, 146), _p(o, sc, 148, 158),
	]), Color(dark, 0.55), 2.2 * sc, true)

	var eye_style := str(app.get("eye_style", "Standard Optics"))
	var brow_style := str(app.get("eyebrows", "Heavy"))
	var nose_style := str(app.get("nose", "Button"))
	var mouth_style := str(app.get("mouth", "Tusked"))
	var mark_style := str(app.get("marking", "None"))

	# Always draw the chosen options — no remaps that collapse styles.
	if brow_style != "None":
		_draw_brows_grothak(o, sc, brow_style)
	if not _blink_closed():
		_draw_eyes_grothak(o, sc, eye_style, feature)
	else:
		_draw_closed_eyes_grothak(o, sc, feature)
	_draw_nose_grothak(o, sc, nose_style, dark, feature)
	_draw_mouth_grothak(o, sc, mouth_style, feature)
	_draw_markings_grothak(o, sc, mark_style, dark, feature)


func _draw_brows_grothak(o: Vector2, sc: float, style: String) -> void:
	## Above optics (y≈98), below crest tip — rides the brow plate.
	var y := 78.0
	match style:
		"Angry":
			draw_line(_p(o, sc, 46, y - 4), _p(o, sc, 92, y + 10), AvatarRenderer.INK, 3.8 * sc, true)
			draw_line(_p(o, sc, 154, y - 4), _p(o, sc, 108, y + 10), AvatarRenderer.INK, 3.8 * sc, true)
		"Tactical", "Angled":
			draw_line(_p(o, sc, 48, y + 6), _p(o, sc, 90, y - 2), AvatarRenderer.INK, 3.6 * sc, true)
			draw_line(_p(o, sc, 152, y + 6), _p(o, sc, 110, y - 2), AvatarRenderer.INK, 3.6 * sc, true)
		"Heavy", "Thick":
			draw_rect(Rect2(_p(o, sc, 46, y - 2), Vector2(40, 11) * sc), AvatarRenderer.INK)
			draw_rect(Rect2(_p(o, sc, 114, y - 2), Vector2(40, 11) * sc), AvatarRenderer.INK)
		"Scarred", "Zigzag":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 48, y + 2), _p(o, sc, 60, y - 6), _p(o, sc, 72, y + 2),
				_p(o, sc, 84, y - 5), _p(o, sc, 94, y + 3),
			]), AvatarRenderer.INK, 3.0 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 152, y + 2), _p(o, sc, 140, y - 6), _p(o, sc, 128, y + 2),
				_p(o, sc, 116, y - 5), _p(o, sc, 106, y + 3),
			]), AvatarRenderer.INK, 3.0 * sc, true)
		"None":
			return
		_:
			# Standard — thick gentle arch.
			draw_arc(_p(o, sc, 68, y + 12), 22.0 * sc, deg_to_rad(200), deg_to_rad(340), 14, AvatarRenderer.INK, 3.2 * sc, true)
			draw_arc(_p(o, sc, 132, y + 12), 22.0 * sc, deg_to_rad(200), deg_to_rad(340), 14, AvatarRenderer.INK, 3.2 * sc, true)


func _draw_eyes_grothak(o: Vector2, sc: float, style: String, accent: Color) -> void:
	var L := 68.0
	var R := 132.0
	var Y := 104.0
	match style:
		"Heavy Lids":
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(13, 7), 22)
				draw_colored_polygon(eye, Color(0.9, 0.94, 1.0))
				draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.8), 1.8 * sc, true)
				draw_circle(_p(o, sc, x, Y + 1), 4.0 * sc, accent)
				draw_circle(_p(o, sc, x, Y + 1), 2.0 * sc, AvatarRenderer.INK)
				# Heavy upper lid shadow.
				draw_line(_p(o, sc, x - 12, Y - 5), _p(o, sc, x + 12, Y - 4), AvatarRenderer.INK, 3.4 * sc, true)
		"Combat Slits", "Cyber Slits":
			for x in [L, R]:
				draw_rect(Rect2(_p(o, sc, x - 14, Y - 4), Vector2(28, 9) * sc), Color(0.05, 0.06, 0.1))
				draw_rect(Rect2(_p(o, sc, x - 12, Y - 2), Vector2(24, 5) * sc), Color(accent.r, accent.g, accent.b, 0.92))
				draw_line(_p(o, sc, x - 8, Y), _p(o, sc, x + 8, Y), Color.WHITE, 1.5 * sc, true)
		"Wide Scan", "Wide Saucer":
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(14, 11), 24)
				draw_colored_polygon(eye, Color(0.05, 0.06, 0.12))
				draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.8), 1.8 * sc, true)
				draw_circle(_p(o, sc, x - 2, Y - 1), 5.0 * sc, Color(0.85, 0.9, 1.0))
				draw_circle(_p(o, sc, x + 2, Y + 2), 2.4 * sc, accent)
		"Prism Optics", "Star Pupils":
			_draw_prism_optics(o, sc, L, R, Y, accent)
		_:
			# Standard Optics — heavy ovals with full accent iris.
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(12, 9), 24)
				draw_colored_polygon(eye, Color(0.9, 0.94, 1.0))
				draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.8), 2.0 * sc, true)
				draw_circle(_p(o, sc, x, Y + 0.5), 4.8 * sc, accent)
				draw_circle(_p(o, sc, x, Y + 0.5), 2.4 * sc, AvatarRenderer.INK)
				draw_circle(_p(o, sc, x - 1.5, Y - 1.5), 1.4 * sc, Color.WHITE)
				draw_line(_p(o, sc, x - 10, Y - 7), _p(o, sc, x + 10, Y - 6), Color(AvatarRenderer.INK, 0.7), 2.2 * sc, true)


func _draw_closed_eyes_grothak(o: Vector2, sc: float, accent: Color) -> void:
	for x in [68.0, 132.0]:
		draw_line(_p(o, sc, x - 12, 104), _p(o, sc, x + 12, 102), Color(AvatarRenderer.INK, 0.95), 3.4 * sc, true)
		draw_line(_p(o, sc, x - 8, 107), _p(o, sc, x + 8, 106), Color(accent, 0.28), 1.2 * sc, true)


func _draw_nose_grothak(o: Vector2, sc: float, style: String, dark: Color, accent: Color) -> void:
	## Midface below brow plate / eyes — oversized so it reads on the wide skull.
	match style:
		"None":
			return
		"Slits":
			# Deep nostril cuts with a bridge block.
			_poly(o, sc, [
				Vector2(88, 118), Vector2(112, 118), Vector2(108, 128), Vector2(92, 128),
			], Color(dark, 0.7), false)
			draw_line(_p(o, sc, 86, 122), _p(o, sc, 96, 130), AvatarRenderer.INK, 3.4 * sc, true)
			draw_line(_p(o, sc, 114, 122), _p(o, sc, 104, 130), AvatarRenderer.INK, 3.4 * sc, true)
			draw_line(_p(o, sc, 88, 132), _p(o, sc, 96, 132), Color(accent, 0.45), 2.0 * sc, true)
			draw_line(_p(o, sc, 112, 132), _p(o, sc, 104, 132), Color(accent, 0.45), 2.0 * sc, true)
		"Ridge":
			# Tall bone ridge down the midface.
			_poly(o, sc, [
				Vector2(94, 112), Vector2(106, 112), Vector2(110, 136), Vector2(90, 136),
			], Color(AvatarRenderer.shade(dark, 10), 0.95), false)
			draw_line(_p(o, sc, 100, 110), _p(o, sc, 100, 138), AvatarRenderer.INK, 4.0 * sc, true)
			draw_line(_p(o, sc, 96, 114), _p(o, sc, 96, 134), Color(accent, 0.4), 2.0 * sc, true)
			draw_line(_p(o, sc, 104, 114), _p(o, sc, 104, 134), Color(dark, 0.55), 2.0 * sc, true)
		"Spike":
			# Large forward horn-nose.
			_poly(o, sc, [
				Vector2(100, 110), Vector2(116, 128), Vector2(100, 146), Vector2(84, 128),
			], AvatarRenderer.shade(dark, 18), false)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 100, 110), _p(o, sc, 116, 128),
				_p(o, sc, 100, 146), _p(o, sc, 84, 128), _p(o, sc, 100, 110),
			]), Color(AvatarRenderer.INK, 0.85), 2.2 * sc, true)
			draw_line(_p(o, sc, 100, 114), _p(o, sc, 100, 140), Color(accent, 0.65), 2.4 * sc, true)
		"Button":
			# Big rounded snout node.
			draw_circle(_p(o, sc, 100, 128), 11.0 * sc, Color(dark, 0.95))
			draw_circle(_p(o, sc, 100, 128), 8.5 * sc, AvatarRenderer.shade(dark, 28))
			draw_arc(_p(o, sc, 100, 128), 11.0 * sc, 0.0, TAU, 24, Color(AvatarRenderer.INK, 0.75), 2.0 * sc, true)
			draw_circle(_p(o, sc, 96, 124), 2.4 * sc, Color(accent, 0.55))
		_:
			draw_circle(_p(o, sc, 100, 128), 11.0 * sc, Color(dark, 0.95))
			draw_circle(_p(o, sc, 100, 128), 8.5 * sc, AvatarRenderer.shade(dark, 28))
			draw_arc(_p(o, sc, 100, 128), 11.0 * sc, 0.0, TAU, 24, Color(AvatarRenderer.INK, 0.75), 2.0 * sc, true)
			draw_circle(_p(o, sc, 96, 124), 2.4 * sc, Color(accent, 0.55))


func _draw_mouth_grothak(o: Vector2, sc: float, style: String, feature: Color) -> void:
	var y := 152.0
	match style:
		"Tusked", "Fanged":
			# Blunt tusks — flat bottom (two vertices), longer + farther apart.
			_poly(o, sc, [
				Vector2(72, 148), Vector2(70, 172), Vector2(80, 172), Vector2(84, 150),
			], Color(0.92, 0.94, 0.88), false)
			_poly(o, sc, [
				Vector2(128, 148), Vector2(130, 172), Vector2(120, 172), Vector2(116, 150),
			], Color(0.92, 0.94, 0.88), false)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 72, 148), _p(o, sc, 70, 172), _p(o, sc, 80, 172), _p(o, sc, 84, 150),
			]), Color(AvatarRenderer.INK, 0.55), 1.4 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 128, 148), _p(o, sc, 130, 172), _p(o, sc, 120, 172), _p(o, sc, 116, 150),
			]), Color(AvatarRenderer.INK, 0.55), 1.4 * sc, true)
		"Wide Grin":
			# Teeth plate with slightly raised outer edges (soft smile).
			_poly(o, sc, [
				Vector2(72, y - 2), Vector2(100, y + 1), Vector2(128, y - 2),
				Vector2(124, y + 8), Vector2(100, y + 9), Vector2(76, y + 8),
			], Color(0.88, 0.9, 0.86), false)
			for i in 5:
				var tx := 80.0 + float(i) * 10.0
				draw_line(_p(o, sc, tx, y + 1), _p(o, sc, tx, y + 7), Color(AvatarRenderer.INK, 0.35), 1.2 * sc, true)
		"Mandible", "Beak":
			_poly(o, sc, [
				Vector2(100, y - 8), Vector2(124, y + 8), Vector2(100, y + 24), Vector2(76, y + 8),
			], Color(feature, 0.88), false)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 100, y - 8), _p(o, sc, 124, y + 8),
				_p(o, sc, 100, y + 24), _p(o, sc, 76, y + 8), _p(o, sc, 100, y - 8),
			]), Color(AvatarRenderer.INK, 0.7), 1.6 * sc, true)
		"Closed", "Pursed":
			draw_line(_p(o, sc, 86, y), _p(o, sc, 100, y + 3), AvatarRenderer.INK, 3.2 * sc, true)
			draw_line(_p(o, sc, 100, y + 3), _p(o, sc, 114, y), AvatarRenderer.INK, 3.2 * sc, true)
		"Grim Line":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 72, y + 2), _p(o, sc, 92, y),
				_p(o, sc, 110, y + 1), _p(o, sc, 128, y - 2),
			]), Color(AvatarRenderer.INK, 0.92), 3.2 * sc, true)
		_:
			draw_polyline(PackedVector2Array([
				_p(o, sc, 76, y), _p(o, sc, 92, y + 3),
				_p(o, sc, 110, y + 2), _p(o, sc, 124, y - 1),
			]), Color(AvatarRenderer.INK, 0.88), 2.8 * sc, true)


func _draw_markings_grothak(o: Vector2, sc: float, style: String, dark: Color, accent: Color) -> void:
	## Cheeks / jaw only — clear of crest, brow plate, and eyes.
	match style:
		"Battle Scar", "Scar":
			draw_line(_p(o, sc, 128, 118), _p(o, sc, 146, 142), Color(accent, 0.8), 2.2 * sc, true)
		"War Paint", "Tribal Lines":
			# Cheek bands only — below eye bottoms (~y 115).
			draw_line(_p(o, sc, 40, 128), _p(o, sc, 64, 122), Color(accent, 0.75), 2.4 * sc, true)
			draw_line(_p(o, sc, 160, 128), _p(o, sc, 136, 122), Color(accent, 0.75), 2.4 * sc, true)
			draw_line(_p(o, sc, 46, 140), _p(o, sc, 68, 136), Color(accent, 0.5), 1.8 * sc, true)
			draw_line(_p(o, sc, 154, 140), _p(o, sc, 132, 136), Color(accent, 0.5), 1.8 * sc, true)
		"Plasma Burns", "Mole Cluster":
			draw_circle(_p(o, sc, 130, 126), 3.4 * sc, dark)
			draw_circle(_p(o, sc, 140, 134), 2.6 * sc, dark)
			draw_circle(_p(o, sc, 122, 136), 2.2 * sc, dark)
		"Speckled", "Freckles":
			for i in 5:
				var x := 116.0 + float(i) * 5.5
				draw_circle(_p(o, sc, x, 124 + (i % 2) * 6), 2.0 * sc, Color(dark.r, dark.g, dark.b, 0.72))
		_:
			pass


# ─── Cognati (chrome spreadsheet with opinions) ──────────────────────────────

func _draw_cognati_new(
	o: Vector2,
	sc: float,
	archetype: String,
	app: Dictionary,
	skin: Color,
	dark: Color,
	light: Color,
	race_accent: Color,
	feature: Color
) -> void:
	# Soft aura — no rim lights, no floating crown sparkles.
	_draw_aura_rings(o, sc, Vector2(100, 108), feature, 4, 64.0, 5.5, 0.012, 0.009)

	# Bust uses signature Cognati cyan.
	_draw_bust(o, sc, archetype, race_accent, dark, race_accent)

	# Softened hex chassis — more vertices than base for less harsh geometry.
	var plate_outer := [
		Vector2(100, 38), Vector2(136, 52), Vector2(152, 88),
		Vector2(148, 128), Vector2(120, 160), Vector2(100, 170),
		Vector2(80, 160), Vector2(52, 128), Vector2(48, 88), Vector2(64, 52),
	]
	_poly(o, sc, plate_outer, dark, false)
	var plate_mid := [
		Vector2(100, 44), Vector2(132, 56), Vector2(146, 90),
		Vector2(142, 126), Vector2(118, 154), Vector2(100, 164),
		Vector2(82, 154), Vector2(58, 126), Vector2(54, 90), Vector2(68, 56),
	]
	_poly(o, sc, plate_mid, skin, false)
	# Soft panel lighting.
	_poly(o, sc, [
		Vector2(88, 52), Vector2(118, 58), Vector2(128, 88), Vector2(100, 78), Vector2(72, 88),
	], Color(light, 0.22), false)
	_poly(o, sc, [
		Vector2(70, 120), Vector2(100, 150), Vector2(130, 120), Vector2(118, 148), Vector2(82, 148),
	], Color(dark, 0.28), false)
	var outline := PackedVector2Array()
	for p in plate_mid:
		outline.append(_p(o, sc, p.x, p.y))
	draw_polyline(outline + PackedVector2Array([outline[0]]), Color(AvatarRenderer.INK, 0.7), 1.7 * sc, true)

	# Race-signature antenna — orb follows accent tone.
	draw_line(_p(o, sc, 100, 44), _p(o, sc, 100, 16), AvatarRenderer.INK, 2.8 * sc, true)
	draw_circle(_p(o, sc, 100, 12), 8.5 * sc, AvatarRenderer.INK)
	draw_circle(_p(o, sc, 100, 12), 6.0 * sc, feature)
	draw_circle(_p(o, sc, 98, 10), 2.0 * sc, Color.WHITE)

	# Circuit seams + nodes (accent) — clear of eye/mouth/nose slots.
	draw_line(_p(o, sc, 100, 48), _p(o, sc, 100, 78), Color(feature, 0.85), 2.0 * sc, true)
	# Lower seam starts below the nose slot so Slits / Button / Spike stay readable.
	draw_line(_p(o, sc, 100, 128), _p(o, sc, 100, 158), Color(feature, 0.55), 1.8 * sc, true)
	draw_line(_p(o, sc, 66, 70), _p(o, sc, 58, 118), Color(feature, 0.5), 1.8 * sc, true)
	draw_line(_p(o, sc, 134, 70), _p(o, sc, 142, 118), Color(feature, 0.5), 1.8 * sc, true)
	for pt in [Vector2(62, 68), Vector2(138, 68), Vector2(56, 122), Vector2(144, 122)]:
		draw_circle(_p(o, sc, pt.x, pt.y), 4.2 * sc, AvatarRenderer.INK)
		draw_circle(_p(o, sc, pt.x, pt.y), 2.2 * sc, Color(feature, 0.9))

	var eye_style := str(app.get("eye_style", "Standard Optics"))
	var brow_style := str(app.get("eyebrows", "None"))
	var nose_style := str(app.get("nose", "Slits"))
	var mouth_style := str(app.get("mouth", "Set Jaw"))

	# Always draw the chosen nose — mouths sit lower; no remaps that collapse styles.
	if brow_style != "None":
		_draw_brows_cognati(o, sc, brow_style)
	if not _blink_closed():
		_draw_eyes_cognati(o, sc, eye_style, feature)
	else:
		_draw_closed_eyes_cognati(o, sc, feature)
	_draw_nose_cognati(o, sc, nose_style, dark, feature)
	_draw_mouth_cognati(o, sc, mouth_style, feature)


func _draw_brows_cognati(o: Vector2, sc: float, style: String) -> void:
	## Above triangular optics (~y 92), clear of antenna root.
	var y := 70.0
	match style:
		"Angry":
			draw_line(_p(o, sc, 54, y - 2), _p(o, sc, 90, y + 10), AvatarRenderer.INK, 3.2 * sc, true)
			draw_line(_p(o, sc, 146, y - 2), _p(o, sc, 110, y + 10), AvatarRenderer.INK, 3.2 * sc, true)
		"Tactical", "Angled":
			draw_line(_p(o, sc, 54, y + 6), _p(o, sc, 88, y - 2), AvatarRenderer.INK, 3.0 * sc, true)
			draw_line(_p(o, sc, 146, y + 6), _p(o, sc, 112, y - 2), AvatarRenderer.INK, 3.0 * sc, true)
		"Heavy", "Thick":
			draw_rect(Rect2(_p(o, sc, 54, y - 2), Vector2(32, 9) * sc), AvatarRenderer.INK)
			draw_rect(Rect2(_p(o, sc, 114, y - 2), Vector2(32, 9) * sc), AvatarRenderer.INK)
		"None":
			return
		_:
			draw_arc(_p(o, sc, 70, y + 10), 16.0 * sc, deg_to_rad(205), deg_to_rad(335), 12, AvatarRenderer.INK, 2.6 * sc, true)
			draw_arc(_p(o, sc, 130, y + 10), 16.0 * sc, deg_to_rad(205), deg_to_rad(335), 12, AvatarRenderer.INK, 2.6 * sc, true)


func _draw_eyes_cognati(o: Vector2, sc: float, style: String, accent: Color) -> void:
	var L := 70.0
	var R := 130.0
	var Y := 92.0
	match style:
		"Target Visor", "Visor Glow":
			draw_style_box(_visor_style(Color(0.04, 0.05, 0.1), Color(AvatarRenderer.INK, 0.85)), Rect2(
				_p(o, sc, L - 16, Y - 10),
				Vector2(R - L + 32, 20) * sc
			))
			draw_rect(Rect2(_p(o, sc, L - 12, Y - 4), Vector2(R - L + 24, 8) * sc), Color(accent.r, accent.g, accent.b, 0.88))
			draw_line(_p(o, sc, L - 6, Y - 1), _p(o, sc, R + 2, Y - 1), Color(0.9, 0.98, 1.0, 0.85), 1.6 * sc, true)
		"Combat Slits", "Cyber Slits":
			for x in [L, R]:
				draw_rect(Rect2(_p(o, sc, x - 12, Y - 4), Vector2(24, 8) * sc), Color(0.05, 0.06, 0.1))
				draw_rect(Rect2(_p(o, sc, x - 10, Y - 2), Vector2(20, 4) * sc), Color(accent.r, accent.g, accent.b, 0.92))
				draw_line(_p(o, sc, x - 7, Y), _p(o, sc, x + 7, Y), Color.WHITE, 1.4 * sc, true)
		"Prism Optics", "Star Pupils":
			_draw_prism_optics(o, sc, L, R, Y, accent)
		_:
			# Standard Optics — combat-slit treatment in a triangle (tip points outward).
			for x in [L, R]:
				var tip_dir := -1.0 if x < 100.0 else 1.0
				_poly(o, sc, [
					Vector2(x + tip_dir * 13, Y),
					Vector2(x - tip_dir * 11, Y - 7),
					Vector2(x - tip_dir * 11, Y + 7),
				], Color(0.05, 0.06, 0.1), false)
				_poly(o, sc, [
					Vector2(x + tip_dir * 9, Y),
					Vector2(x - tip_dir * 8, Y - 4),
					Vector2(x - tip_dir * 8, Y + 4),
				], Color(accent.r, accent.g, accent.b, 0.92), false)
				draw_line(
					_p(o, sc, x - tip_dir * 5, Y),
					_p(o, sc, x + tip_dir * 6, Y),
					Color.WHITE,
					1.4 * sc,
					true
				)


func _draw_closed_eyes_cognati(o: Vector2, sc: float, accent: Color) -> void:
	for x in [70.0, 130.0]:
		draw_line(_p(o, sc, x - 10, 92), _p(o, sc, x + 10, 90), Color(AvatarRenderer.INK, 0.92), 2.8 * sc, true)
		draw_line(_p(o, sc, x - 6, 94), _p(o, sc, x + 6, 93), Color(accent, 0.3), 1.1 * sc, true)


func _draw_nose_cognati(o: Vector2, sc: float, style: String, dark: Color, accent: Color) -> void:
	## Midface slot (~y 110–122), above mouth (~y 138). Each style must read distinctly.
	match style:
		"None":
			return
		"Slits":
			# Twin vent cuts — angled ink + accent floor. Not a circle, not a spike.
			draw_line(_p(o, sc, 90, 112), _p(o, sc, 97, 118), Color(AvatarRenderer.INK, 0.9), 2.4 * sc, true)
			draw_line(_p(o, sc, 110, 112), _p(o, sc, 103, 118), Color(AvatarRenderer.INK, 0.9), 2.4 * sc, true)
			draw_line(_p(o, sc, 91, 119), _p(o, sc, 97, 119), Color(accent, 0.7), 1.4 * sc, true)
			draw_line(_p(o, sc, 109, 119), _p(o, sc, 103, 119), Color(accent, 0.7), 1.4 * sc, true)
		"Ridge":
			draw_line(_p(o, sc, 100, 106), _p(o, sc, 100, 124), Color(AvatarRenderer.INK, 0.9), 2.6 * sc, true)
			draw_line(_p(o, sc, 97, 108), _p(o, sc, 97, 122), Color(dark, 0.5), 1.5 * sc, true)
			draw_line(_p(o, sc, 103, 108), _p(o, sc, 103, 122), Color(accent, 0.4), 1.3 * sc, true)
		"Spike":
			# Forward chassis tip — outlined diamond, clearly not slits or a button.
			_poly(o, sc, [
				Vector2(100, 108), Vector2(109, 118), Vector2(100, 128), Vector2(91, 118),
			], AvatarRenderer.shade(dark, 22), false)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 100, 108), _p(o, sc, 109, 118),
				_p(o, sc, 100, 128), _p(o, sc, 91, 118), _p(o, sc, 100, 108),
			]), Color(AvatarRenderer.INK, 0.85), 1.6 * sc, true)
			draw_line(_p(o, sc, 100, 110), _p(o, sc, 100, 124), Color(accent, 0.75), 1.6 * sc, true)
		"Button":
			# Soft rounded sensor node with ink rim + accent highlight.
			draw_circle(_p(o, sc, 100, 116), 6.0 * sc, Color(dark, 0.95))
			draw_circle(_p(o, sc, 100, 116), 4.2 * sc, AvatarRenderer.shade(dark, 28))
			draw_arc(_p(o, sc, 100, 116), 6.0 * sc, 0.0, TAU, 22, Color(AvatarRenderer.INK, 0.75), 1.4 * sc, true)
			draw_circle(_p(o, sc, 98.2, 114.2), 1.8 * sc, Color(
				clampf(accent.r + 0.3, 0.0, 1.0),
				clampf(accent.g + 0.3, 0.0, 1.0),
				clampf(accent.b + 0.2, 0.0, 1.0),
				0.7
			))
		_:
			draw_line(_p(o, sc, 90, 112), _p(o, sc, 97, 118), Color(AvatarRenderer.INK, 0.9), 2.4 * sc, true)
			draw_line(_p(o, sc, 110, 112), _p(o, sc, 103, 118), Color(AvatarRenderer.INK, 0.9), 2.4 * sc, true)


func _draw_mouth_cognati(o: Vector2, sc: float, style: String, feature: Color) -> void:
	var y := 138.0
	match style:
		"Mandible", "Beak":
			# ~30% smaller than the original diamond.
			_poly(o, sc, [
				Vector2(100, y - 4.2), Vector2(112.6, y + 4.2), Vector2(100, y + 12.6), Vector2(87.4, y + 4.2),
			], Color(feature, 0.85), false)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 100, y - 4.2), _p(o, sc, 112.6, y + 4.2),
				_p(o, sc, 100, y + 12.6), _p(o, sc, 87.4, y + 4.2), _p(o, sc, 100, y - 4.2),
			]), Color(AvatarRenderer.INK, 0.7), 1.4 * sc, true)
		"Proboscis", "Tentacle":
			for x in [86, 93, 100, 107, 114]:
				draw_line(_p(o, sc, x, y), _p(o, sc, x - 1, y + 14), Color(feature, 0.7), 1.6 * sc, true)
		"Closed", "Pursed":
			draw_line(_p(o, sc, 90, y), _p(o, sc, 100, y + 2), AvatarRenderer.INK, 2.4 * sc, true)
			draw_line(_p(o, sc, 100, y + 2), _p(o, sc, 110, y), AvatarRenderer.INK, 2.4 * sc, true)
		"Grim Line":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 80, y + 1), _p(o, sc, 94, y),
				_p(o, sc, 108, y + 1), _p(o, sc, 120, y - 1),
			]), Color(AvatarRenderer.INK, 0.9), 2.4 * sc, true)
		_:
			draw_polyline(PackedVector2Array([
				_p(o, sc, 84, y), _p(o, sc, 94, y + 2),
				_p(o, sc, 106, y + 2), _p(o, sc, 116, y - 1),
			]), Color(AvatarRenderer.INK, 0.85), 2.2 * sc, true)


# ─── Luminae (starlight with a hero complex) ─────────────────────────────────

func _draw_luminae_new(
	o: Vector2,
	sc: float,
	archetype: String,
	app: Dictionary,
	skin: Color,
	dark: Color,
	light: Color,
	race_accent: Color,
	feature: Color
) -> void:
	# Strong luminous aura — Luminae reads much brighter than other races.
	# Full-size rings; hosts with a visible portrait frame may clip, unframed hosts should not.
	_draw_aura_rings(o, sc, Vector2(100, 105), feature, 8, 58.0, 9.5, 0.028, 0.018)
	# Soft white bloom under the accent rings.
	draw_circle(_p(o, sc, 100, 105), 78.0 * sc, Color(1.0, 1.0, 1.0, 0.06))
	draw_circle(_p(o, sc, 100, 105), 52.0 * sc, Color(feature.r, feature.g, feature.b, 0.1))

	# Bust uses signature Luminae lavender.
	_draw_bust(o, sc, archetype, race_accent, dark, race_accent)

	# Soft oval head with layered shading (noticeably softer than base ellipse).
	_painted_ellipse(o, sc, Vector2(100, 108), Vector2(60, 68), skin, dark, light)
	var cheek_lit := _ellipse_points(o, sc, Vector2(78, 100), Vector2(22, 28), 20)
	draw_colored_polygon(cheek_lit, Color(light, 0.2))
	var jaw_shade := _ellipse_points(o, sc, Vector2(112, 138), Vector2(28, 22), 18)
	draw_colored_polygon(jaw_shade, Color(dark, 0.22))
	var outline := _ellipse_points(o, sc, Vector2(100, 108), Vector2(58, 66), 40)
	draw_polyline(outline + PackedVector2Array([outline[0]]), Color(AvatarRenderer.INK, 0.55), 1.5 * sc, true)

	# Race-signature crown flares — accent fill, clear of brow/eye slots.
	for flare in [
		[Vector2(100, 42), Vector2(94, 14), Vector2(106, 14)],
		[Vector2(68, 52), Vector2(54, 22), Vector2(74, 48)],
		[Vector2(132, 52), Vector2(146, 22), Vector2(126, 48)],
	]:
		_poly(o, sc, flare, Color(feature, 0.92), false)
		draw_polyline(PackedVector2Array([
			_p(o, sc, flare[0].x, flare[0].y),
			_p(o, sc, flare[1].x, flare[1].y),
			_p(o, sc, flare[2].x, flare[2].y),
			_p(o, sc, flare[0].x, flare[0].y),
		]), Color(AvatarRenderer.INK, 0.45), 1.2 * sc, true)

	# Soft cheek / temple sparkles — clear of eyes (~y 90) and mouth (~y 140).
	for pt in [Vector2(54, 88), Vector2(146, 88), Vector2(58, 148), Vector2(142, 148)]:
		draw_circle(_p(o, sc, pt.x, pt.y), 4.5 * sc, Color(feature, 0.14))
		draw_circle(_p(o, sc, pt.x, pt.y), 1.8 * sc, Color(0.98, 0.98, 1.0, 0.85))

	var eye_style := str(app.get("eye_style", "Standard Optics"))
	var brow_style := str(app.get("eyebrows", "Relaxed"))
	var nose_style := str(app.get("nose", "Button"))
	var mouth_style := str(app.get("mouth", "Set Jaw"))
	var mark_style := str(app.get("marking", "None"))

	if brow_style != "None":
		_draw_brows_luminae(o, sc, brow_style, eye_style == "Cyclops")
	if not _blink_closed():
		_draw_eyes_luminae(o, sc, eye_style, feature)
	else:
		_draw_closed_eyes_luminae(o, sc, feature, eye_style)
	_draw_nose_luminae(o, sc, nose_style, dark, feature)
	_draw_mouth_luminae(o, sc, mouth_style, feature)
	_draw_markings_luminae(o, sc, mark_style, dark, feature)




func _draw_brows_luminae(o: Vector2, sc: float, style: String, cyclops: bool = false) -> void:
	var y := 70.0
	if cyclops:
		# Single centered brow above the cyclops eye — style still reads.
		match style:
			"Angry":
				draw_line(_p(o, sc, 78, y - 2), _p(o, sc, 100, y + 8), AvatarRenderer.INK, 2.8 * sc, true)
				draw_line(_p(o, sc, 122, y - 2), _p(o, sc, 100, y + 8), AvatarRenderer.INK, 2.8 * sc, true)
			"Tactical", "Angled":
				draw_line(_p(o, sc, 78, y + 4), _p(o, sc, 100, y - 4), AvatarRenderer.INK, 2.8 * sc, true)
				draw_line(_p(o, sc, 122, y + 4), _p(o, sc, 100, y - 4), AvatarRenderer.INK, 2.8 * sc, true)
			"Heavy", "Thick":
				draw_arc(_p(o, sc, 100, y + 14), 28.0 * sc, deg_to_rad(200), deg_to_rad(340), 16, AvatarRenderer.INK, 3.6 * sc, true)
			"Scarred", "Zigzag":
				draw_polyline(PackedVector2Array([
					_p(o, sc, 78, y + 2), _p(o, sc, 88, y - 5), _p(o, sc, 98, y + 1),
					_p(o, sc, 108, y - 5), _p(o, sc, 122, y + 2),
				]), AvatarRenderer.INK, 2.2 * sc, true)
			"Relaxed":
				draw_arc(_p(o, sc, 100, y + 16), 24.0 * sc, deg_to_rad(210), deg_to_rad(330), 12, Color(AvatarRenderer.INK, 0.75), 1.9 * sc, true)
			"None":
				return
			_:
				# Standard — one fuller centered arch.
				draw_arc(_p(o, sc, 100, y + 12), 26.0 * sc, deg_to_rad(205), deg_to_rad(335), 14, AvatarRenderer.INK, 2.8 * sc, true)
		return
	match style:
		"Angry":
			draw_line(_p(o, sc, 54, y - 2), _p(o, sc, 90, y + 8), AvatarRenderer.INK, 2.8 * sc, true)
			draw_line(_p(o, sc, 146, y - 2), _p(o, sc, 110, y + 8), AvatarRenderer.INK, 2.8 * sc, true)
		"Tactical", "Angled":
			draw_line(_p(o, sc, 56, y + 6), _p(o, sc, 88, y - 2), AvatarRenderer.INK, 2.6 * sc, true)
			draw_line(_p(o, sc, 144, y + 6), _p(o, sc, 112, y - 2), AvatarRenderer.INK, 2.6 * sc, true)
		"Heavy", "Thick":
			draw_arc(_p(o, sc, 70, y + 12), 20.0 * sc, deg_to_rad(200), deg_to_rad(340), 12, AvatarRenderer.INK, 3.4 * sc, true)
			draw_arc(_p(o, sc, 130, y + 12), 20.0 * sc, deg_to_rad(200), deg_to_rad(340), 12, AvatarRenderer.INK, 3.4 * sc, true)
		"Scarred", "Zigzag":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 56, y), _p(o, sc, 66, y - 5), _p(o, sc, 76, y), _p(o, sc, 88, y - 3),
			]), AvatarRenderer.INK, 2.0 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 144, y), _p(o, sc, 134, y - 5), _p(o, sc, 124, y), _p(o, sc, 112, y - 3),
			]), AvatarRenderer.INK, 2.0 * sc, true)
		"Relaxed":
			# Softer, flatter, thinner arches.
			draw_arc(_p(o, sc, 70, y + 14), 16.0 * sc, deg_to_rad(210), deg_to_rad(330), 10, Color(AvatarRenderer.INK, 0.75), 1.8 * sc, true)
			draw_arc(_p(o, sc, 130, y + 14), 16.0 * sc, deg_to_rad(210), deg_to_rad(330), 10, Color(AvatarRenderer.INK, 0.75), 1.8 * sc, true)
		"None":
			return
		_:
			# Standard — fuller arch.
			draw_arc(_p(o, sc, 70, y + 10), 18.0 * sc, deg_to_rad(205), deg_to_rad(335), 12, AvatarRenderer.INK, 2.6 * sc, true)
			draw_arc(_p(o, sc, 130, y + 10), 18.0 * sc, deg_to_rad(205), deg_to_rad(335), 12, AvatarRenderer.INK, 2.6 * sc, true)

func _draw_eyes_luminae(o: Vector2, sc: float, style: String, accent: Color) -> void:
	var L := 70.0
	var R := 130.0
	var Y := 92.0
	match style:
		"Cyclops":
			# One large central luminous eye.
			var eye := _ellipse_points(o, sc, Vector2(100, Y), Vector2(18, 14), 28)
			draw_colored_polygon(eye, Color(0.96, 0.97, 1.0))
			draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.55), 1.8 * sc, true)
			draw_circle(_p(o, sc, 100, Y), 10.0 * sc, Color(accent, 0.4))
			draw_circle(_p(o, sc, 100, Y), 7.0 * sc, accent)
			draw_circle(_p(o, sc, 100, Y), 3.4 * sc, AvatarRenderer.INK)
			draw_circle(_p(o, sc, 97.5, Y - 2.5), 2.0 * sc, Color.WHITE)
		"Wide Scan", "Wide Saucer":
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(13, 11), 24)
				draw_colored_polygon(eye, Color(0.95, 0.96, 1.0))
				draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.55), 1.5 * sc, true)
				draw_circle(_p(o, sc, x, Y), 6.5 * sc, Color(accent, 0.55))
				draw_circle(_p(o, sc, x, Y), 4.0 * sc, accent)
				draw_circle(_p(o, sc, x, Y), 2.0 * sc, AvatarRenderer.INK)
				draw_circle(_p(o, sc, x - 1.5, Y - 1.8), 1.3 * sc, Color.WHITE)
		"Prism Optics", "Star Pupils":
			_draw_prism_optics(o, sc, L, R, Y, accent)
		_:
			# Standard Optics — soft luminous ovals.
			for x in [L, R]:
				_eye_oval_luminae(o, sc, x, Y, accent)


func _eye_oval_luminae(o: Vector2, sc: float, x: float, y: float, accent: Color) -> void:
	var eye := _ellipse_points(o, sc, Vector2(x, y), Vector2(11, 8), 24)
	draw_colored_polygon(eye, Color(0.96, 0.97, 1.0))
	draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.55), 1.5 * sc, true)
	draw_circle(_p(o, sc, x, y + 0.5), 5.0 * sc, Color(accent, 0.45))
	draw_circle(_p(o, sc, x, y + 0.5), 3.6 * sc, accent)
	draw_circle(_p(o, sc, x, y + 0.5), 1.8 * sc, AvatarRenderer.INK)
	draw_circle(_p(o, sc, x - 1.4, y - 1.5), 1.2 * sc, Color.WHITE)


func _draw_closed_eyes_luminae(o: Vector2, sc: float, accent: Color, style: String = "") -> void:
	if style == "Cyclops":
		draw_line(_p(o, sc, 84, 92), _p(o, sc, 116, 90), Color(AvatarRenderer.INK, 0.85), 3.0 * sc, true)
		draw_line(_p(o, sc, 90, 95), _p(o, sc, 110, 94), Color(accent, 0.35), 1.2 * sc, true)
		return
	for x in [70.0, 130.0]:
		draw_line(_p(o, sc, x - 10, 92), _p(o, sc, x + 10, 90), Color(AvatarRenderer.INK, 0.85), 2.6 * sc, true)
		draw_line(_p(o, sc, x - 6, 94), _p(o, sc, x + 6, 93), Color(accent, 0.35), 1.1 * sc, true)


func _draw_nose_luminae(o: Vector2, sc: float, style: String, dark: Color, accent: Color) -> void:
	match style:
		"None":
			return
		"Slits":
			draw_line(_p(o, sc, 92, 118), _p(o, sc, 97, 122), Color(AvatarRenderer.INK, 0.7), 2.0 * sc, true)
			draw_line(_p(o, sc, 108, 118), _p(o, sc, 103, 122), Color(AvatarRenderer.INK, 0.7), 2.0 * sc, true)
			draw_line(_p(o, sc, 93, 123), _p(o, sc, 96, 123), Color(accent, 0.45), 1.1 * sc, true)
			draw_line(_p(o, sc, 107, 123), _p(o, sc, 104, 123), Color(accent, 0.45), 1.1 * sc, true)
		"Ridge":
			draw_line(_p(o, sc, 100, 110), _p(o, sc, 100, 128), Color(AvatarRenderer.INK, 0.75), 2.2 * sc, true)
			draw_line(_p(o, sc, 98, 112), _p(o, sc, 98, 126), Color(accent, 0.35), 1.2 * sc, true)
		"Button":
			draw_circle(_p(o, sc, 100, 120), 5.2 * sc, Color(dark, 0.75))
			draw_circle(_p(o, sc, 100, 120), 3.6 * sc, AvatarRenderer.shade(dark, 30))
			draw_circle(_p(o, sc, 98.5, 118.5), 1.5 * sc, Color(accent, 0.55))
			draw_arc(_p(o, sc, 100, 120), 5.2 * sc, 0.0, TAU, 18, Color(AvatarRenderer.INK, 0.45), 1.1 * sc, true)
		_:
			draw_circle(_p(o, sc, 100, 120), 5.2 * sc, Color(dark, 0.75))
			draw_circle(_p(o, sc, 100, 120), 3.6 * sc, AvatarRenderer.shade(dark, 30))
			draw_circle(_p(o, sc, 98.5, 118.5), 1.5 * sc, Color(accent, 0.55))


func _draw_mouth_luminae(o: Vector2, sc: float, style: String, feature: Color) -> void:
	var y := 140.0
	match style:
		"Wide Grin":
			# Teeth band with slightly raised outer edges (soft smile).
			_poly(o, sc, [
				Vector2(82, y - 3), Vector2(100, y), Vector2(118, y - 3),
				Vector2(116, y + 6), Vector2(100, y + 7), Vector2(84, y + 6),
			], Color(0.92, 0.93, 0.95, 0.9), false)
			for i in 4:
				var tx := 88.0 + float(i) * 8.0
				draw_line(_p(o, sc, tx, y), _p(o, sc, tx, y + 5), Color(AvatarRenderer.INK, 0.3), 1.1 * sc, true)
			draw_line(_p(o, sc, 88, y + 2), _p(o, sc, 112, y + 2), Color(feature, 0.2), 1.0 * sc, true)
		"Closed", "Pursed":
			draw_line(_p(o, sc, 90, y), _p(o, sc, 100, y + 2), AvatarRenderer.INK, 2.2 * sc, true)
			draw_line(_p(o, sc, 100, y + 2), _p(o, sc, 110, y), AvatarRenderer.INK, 2.2 * sc, true)
		"Grim Line":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 82, y + 1), _p(o, sc, 96, y),
				_p(o, sc, 110, y + 1), _p(o, sc, 120, y - 1),
			]), Color(AvatarRenderer.INK, 0.85), 2.2 * sc, true)
		_:
			draw_polyline(PackedVector2Array([
				_p(o, sc, 86, y), _p(o, sc, 96, y + 2),
				_p(o, sc, 108, y + 2), _p(o, sc, 118, y - 1),
			]), Color(AvatarRenderer.INK, 0.8), 2.0 * sc, true)


func _draw_markings_luminae(o: Vector2, sc: float, style: String, dark: Color, accent: Color) -> void:
	## Cheek / temple only — clear of eyes, crown, and mouth.
	match style:
		"Speckled", "Freckles":
			for i in 6:
				var x := 118.0 + float(i % 3) * 6.0
				var y := 118.0 + float(i / 3) * 7.0
				draw_circle(_p(o, sc, x, y), 1.6 * sc, Color(accent, 0.55))
				draw_circle(_p(o, sc, 82.0 - float(i % 3) * 6.0, y), 1.4 * sc, Color(accent, 0.4))
		"War Paint", "Tribal Lines":
			draw_line(_p(o, sc, 48, 120), _p(o, sc, 68, 116), Color(accent, 0.7), 2.2 * sc, true)
			draw_line(_p(o, sc, 152, 120), _p(o, sc, 132, 116), Color(accent, 0.7), 2.2 * sc, true)
			draw_line(_p(o, sc, 52, 130), _p(o, sc, 70, 128), Color(accent, 0.4), 1.6 * sc, true)
			draw_line(_p(o, sc, 148, 130), _p(o, sc, 130, 128), Color(accent, 0.4), 1.6 * sc, true)
		"Fractured", "Cracks":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 120, 110), _p(o, sc, 130, 122), _p(o, sc, 126, 136),
			]), Color(accent, 0.55), 1.5 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 76, 112), _p(o, sc, 66, 126),
			]), Color(accent, 0.4), 1.3 * sc, true)
		"Plasma Burns", "Mole Cluster":
			draw_circle(_p(o, sc, 128, 120), 3.2 * sc, Color(dark, 0.7))
			draw_circle(_p(o, sc, 136, 128), 2.4 * sc, Color(accent, 0.45))
			draw_circle(_p(o, sc, 120, 130), 2.0 * sc, Color(dark, 0.6))
		_:
			pass


# ─── Zyrathi (scaled dragonfolk / Ember Nebula) ───────────────────────────────

func _draw_zyrathi_new(
	o: Vector2,
	sc: float,
	archetype: String,
	app: Dictionary,
	skin: Color,
	dark: Color,
	light: Color,
	race_accent: Color,
	feature: Color
) -> void:
	# Warm ember aura — quieter than before; still reads hotter than Synthara.
	_draw_aura_rings(o, sc, Vector2(100, 108), feature, 5, 70.0, 7.0, 0.008, 0.006)
	draw_circle(_p(o, sc, 100, 108), 56.0 * sc, Color(feature.r, feature.g, feature.b, 0.03))

	# Bust uses signature Zyrathi orange.
	_draw_bust(o, sc, archetype, race_accent, dark, race_accent)

	# Angular armored skull — slightly wider jaw than a soft oval.
	var head := [
		Vector2(100, 38), Vector2(72, 46), Vector2(50, 70), Vector2(44, 104),
		Vector2(50, 138), Vector2(70, 162), Vector2(100, 174), Vector2(130, 162),
		Vector2(150, 138), Vector2(156, 104), Vector2(150, 70), Vector2(128, 46),
	]
	_poly(o, sc, head, dark, false)
	var face := [
		Vector2(100, 44), Vector2(76, 52), Vector2(56, 74), Vector2(50, 104),
		Vector2(56, 136), Vector2(74, 158), Vector2(100, 168), Vector2(126, 158),
		Vector2(144, 136), Vector2(150, 104), Vector2(144, 74), Vector2(124, 52),
	]
	_poly(o, sc, face, skin, false)
	var cheek_lit := _ellipse_points(o, sc, Vector2(82, 96), Vector2(26, 30), 20)
	draw_colored_polygon(cheek_lit, Color(light, 0.2))
	var muzzle := _ellipse_points(o, sc, Vector2(100, 142), Vector2(30, 18), 20)
	draw_colored_polygon(muzzle, Color(AvatarRenderer.shade(skin, -16), 0.85))
	var outline := PackedVector2Array()
	for p in face:
		outline.append(_p(o, sc, p.x, p.y))
	draw_polyline(outline + PackedVector2Array([outline[0]]), Color(AvatarRenderer.INK, 0.7), 1.7 * sc, true)

	# Two accent plates at the horn bases — no midsection bridge.
	_poly(o, sc, [
		Vector2(72, 46), Vector2(60, 52), Vector2(56, 60), Vector2(70, 62), Vector2(82, 56), Vector2(80, 50),
	], Color(feature, 0.92), false)
	_poly(o, sc, [
		Vector2(128, 46), Vector2(140, 52), Vector2(144, 60), Vector2(130, 62), Vector2(118, 56), Vector2(120, 50),
	], Color(feature, 0.92), false)
	draw_polyline(PackedVector2Array([
		_p(o, sc, 72, 46), _p(o, sc, 60, 52), _p(o, sc, 56, 60),
		_p(o, sc, 70, 62), _p(o, sc, 82, 56), _p(o, sc, 80, 50), _p(o, sc, 72, 46),
	]), Color(AvatarRenderer.INK, 0.55), 1.3 * sc, true)
	draw_polyline(PackedVector2Array([
		_p(o, sc, 128, 46), _p(o, sc, 140, 52), _p(o, sc, 144, 60),
		_p(o, sc, 130, 62), _p(o, sc, 118, 56), _p(o, sc, 120, 50), _p(o, sc, 128, 46),
	]), Color(AvatarRenderer.INK, 0.55), 1.3 * sc, true)
	draw_line(_p(o, sc, 62, 54), _p(o, sc, 76, 56), Color(0.98, 0.95, 0.85, 0.3), 1.0 * sc, true)
	draw_line(_p(o, sc, 138, 54), _p(o, sc, 124, 56), Color(0.98, 0.95, 0.85, 0.3), 1.0 * sc, true)

	# Horns drawn after the plates so bases sit in front / connected to them.
	_poly(o, sc, [
		Vector2(60, 56), Vector2(42, 10), Vector2(54, 8), Vector2(76, 52),
	], Color(AvatarRenderer.shade(skin, 18), 0.98), false)
	_poly(o, sc, [
		Vector2(140, 56), Vector2(158, 10), Vector2(146, 8), Vector2(124, 52),
	], Color(AvatarRenderer.shade(skin, 18), 0.98), false)
	draw_polyline(PackedVector2Array([
		_p(o, sc, 60, 56), _p(o, sc, 42, 10), _p(o, sc, 54, 8), _p(o, sc, 76, 52),
	]), Color(AvatarRenderer.INK, 0.55), 1.3 * sc, true)
	draw_polyline(PackedVector2Array([
		_p(o, sc, 140, 56), _p(o, sc, 158, 10), _p(o, sc, 146, 8), _p(o, sc, 124, 52),
	]), Color(AvatarRenderer.INK, 0.55), 1.3 * sc, true)
	# Horn tip glints.
	draw_circle(_p(o, sc, 48, 12), 1.6 * sc, Color(feature, 0.7))
	draw_circle(_p(o, sc, 152, 12), 1.6 * sc, Color(feature, 0.7))

	# Scale armor plates — cheek / temple arcs (always on, clear of eye slot ~y 94).
	for pt in [Vector2(58, 86), Vector2(142, 86), Vector2(64, 118), Vector2(136, 118)]:
		draw_arc(_p(o, sc, pt.x, pt.y), 9.0 * sc, PI * 0.15, PI * 0.95, 10, Color(dark, 0.7), 2.0 * sc, true)
		draw_arc(_p(o, sc, pt.x, pt.y), 9.0 * sc, PI * 0.2, PI * 0.85, 8, Color(feature, 0.22), 1.1 * sc, true)

	var eye_style := str(app.get("eye_style", "Standard Optics"))
	var brow_style := str(app.get("eyebrows", "Heavy"))
	var nose_style := str(app.get("nose", "Ridge"))
	var mouth_style := str(app.get("mouth", "Tusked"))
	var mark_style := str(app.get("marking", "None"))

	if brow_style != "None":
		_draw_brows_zyrathi(o, sc, brow_style)
	if not _blink_closed():
		_draw_eyes_zyrathi(o, sc, eye_style, feature)
	else:
		_draw_closed_eyes_zyrathi(o, sc, feature)
	_draw_nose_zyrathi(o, sc, nose_style, dark, feature)
	_draw_mouth_zyrathi(o, sc, mouth_style, feature)
	_draw_markings_zyrathi(o, sc, mark_style, dark, feature)


func _draw_brows_zyrathi(o: Vector2, sc: float, style: String) -> void:
	## Ridged brows above optics (~y 94), below horn roots.
	var y := 72.0
	match style:
		"Angry":
			draw_line(_p(o, sc, 52, y - 4), _p(o, sc, 92, y + 10), AvatarRenderer.INK, 3.4 * sc, true)
			draw_line(_p(o, sc, 148, y - 4), _p(o, sc, 108, y + 10), AvatarRenderer.INK, 3.4 * sc, true)
		"Tactical", "Angled":
			draw_line(_p(o, sc, 54, y + 8), _p(o, sc, 90, y - 2), AvatarRenderer.INK, 3.2 * sc, true)
			draw_line(_p(o, sc, 146, y + 8), _p(o, sc, 110, y - 2), AvatarRenderer.INK, 3.2 * sc, true)
		"Heavy", "Thick":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 52, y + 6), _p(o, sc, 68, y - 2), _p(o, sc, 90, y + 2),
			]), AvatarRenderer.INK, 4.0 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 148, y + 6), _p(o, sc, 132, y - 2), _p(o, sc, 110, y + 2),
			]), AvatarRenderer.INK, 4.0 * sc, true)
		"Scarred", "Zigzag":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 54, y + 2), _p(o, sc, 64, y - 6), _p(o, sc, 74, y + 2),
				_p(o, sc, 84, y - 4), _p(o, sc, 92, y + 3),
			]), AvatarRenderer.INK, 2.6 * sc, true)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 146, y + 2), _p(o, sc, 136, y - 6), _p(o, sc, 126, y + 2),
				_p(o, sc, 116, y - 4), _p(o, sc, 108, y + 3),
			]), AvatarRenderer.INK, 2.6 * sc, true)
			draw_line(_p(o, sc, 120, y - 8), _p(o, sc, 132, y + 6), Color(0.85, 0.7, 0.55, 0.7), 1.6 * sc, true)
		"None":
			return
		_:
			# Standard — armored brow ridges.
			draw_arc(_p(o, sc, 70, y + 10), 18.0 * sc, deg_to_rad(200), deg_to_rad(340), 12, AvatarRenderer.INK, 3.0 * sc, true)
			draw_arc(_p(o, sc, 130, y + 10), 18.0 * sc, deg_to_rad(200), deg_to_rad(340), 12, AvatarRenderer.INK, 3.0 * sc, true)


func _draw_eyes_zyrathi(o: Vector2, sc: float, style: String, accent: Color) -> void:
	var L := 70.0
	var R := 130.0
	var Y := 94.0
	match style:
		"Ember Gaze":
			# Reptilian almond + vertical slit pupil with ember glow.
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(13, 8), 24)
				draw_colored_polygon(eye, Color(0.12, 0.08, 0.05))
				draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.85), 1.7 * sc, true)
				draw_circle(_p(o, sc, x, Y), 5.5 * sc, Color(accent, 0.55))
				draw_rect(Rect2(_p(o, sc, x - 1.4, Y - 5.5), Vector2(2.8, 11) * sc), Color(accent.r, accent.g, accent.b, 0.95))
				draw_rect(Rect2(_p(o, sc, x - 0.7, Y - 4.5), Vector2(1.4, 9) * sc), Color(0.05, 0.04, 0.05, 0.95))
				draw_circle(_p(o, sc, x - 3.5, Y - 2.0), 1.3 * sc, Color(1.0, 0.95, 0.8, 0.75))
		"Combat Slits", "Cyber Slits":
			for x in [L, R]:
				draw_rect(Rect2(_p(o, sc, x - 14, Y - 5), Vector2(28, 10) * sc), Color(0.05, 0.06, 0.1))
				draw_rect(Rect2(_p(o, sc, x - 12, Y - 3), Vector2(24, 6) * sc), Color(accent.r, accent.g, accent.b, 0.92))
				draw_line(_p(o, sc, x - 8, Y), _p(o, sc, x + 8, Y), Color.WHITE, 1.4 * sc, true)
		"Wide Scan", "Wide Saucer":
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(14, 11), 24)
				draw_colored_polygon(eye, Color(0.08, 0.06, 0.05))
				draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.8), 1.8 * sc, true)
				draw_circle(_p(o, sc, x - 2, Y - 1), 5.2 * sc, Color(0.95, 0.9, 0.75))
				draw_circle(_p(o, sc, x + 2, Y + 2), 2.4 * sc, accent)
		"Prism Optics", "Star Pupils":
			_draw_prism_optics(o, sc, L, R, Y, accent)
		_:
			# Standard Optics — warm almond with accent iris.
			for x in [L, R]:
				var eye := _ellipse_points(o, sc, Vector2(x, Y), Vector2(12, 8), 24)
				draw_colored_polygon(eye, Color(0.96, 0.94, 0.88))
				draw_polyline(eye + PackedVector2Array([eye[0]]), Color(AvatarRenderer.INK, 0.8), 1.8 * sc, true)
				draw_circle(_p(o, sc, x, Y + 0.5), 4.6 * sc, accent)
				draw_circle(_p(o, sc, x, Y + 0.5), 2.2 * sc, AvatarRenderer.INK)
				draw_circle(_p(o, sc, x - 1.5, Y - 1.5), 1.3 * sc, Color.WHITE)


func _draw_closed_eyes_zyrathi(o: Vector2, sc: float, accent: Color) -> void:
	for x in [70.0, 130.0]:
		draw_line(_p(o, sc, x - 12, 94), _p(o, sc, x + 12, 92), Color(AvatarRenderer.INK, 0.95), 3.0 * sc, true)
		draw_line(_p(o, sc, x - 8, 97), _p(o, sc, x + 8, 96), Color(accent, 0.3), 1.2 * sc, true)


func _draw_nose_zyrathi(o: Vector2, sc: float, style: String, dark: Color, accent: Color) -> void:
	## Midface between eyes (~y 94) and mouth (~y 144).
	match style:
		"None":
			return
		"Slits":
			draw_line(_p(o, sc, 90, 118), _p(o, sc, 96, 124), AvatarRenderer.INK, 2.4 * sc, true)
			draw_line(_p(o, sc, 110, 118), _p(o, sc, 104, 124), AvatarRenderer.INK, 2.4 * sc, true)
			draw_line(_p(o, sc, 91, 126), _p(o, sc, 96, 126), Color(accent, 0.5), 1.3 * sc, true)
			draw_line(_p(o, sc, 109, 126), _p(o, sc, 104, 126), Color(accent, 0.5), 1.3 * sc, true)
		"Ridge":
			_poly(o, sc, [
				Vector2(96, 110), Vector2(104, 110), Vector2(108, 130), Vector2(92, 130),
			], Color(AvatarRenderer.shade(dark, 8), 0.9), false)
			draw_line(_p(o, sc, 100, 108), _p(o, sc, 100, 132), AvatarRenderer.INK, 2.8 * sc, true)
			draw_line(_p(o, sc, 97, 112), _p(o, sc, 97, 128), Color(accent, 0.4), 1.4 * sc, true)
		"Spike":
			_poly(o, sc, [
				Vector2(100, 108), Vector2(112, 124), Vector2(100, 140), Vector2(88, 124),
			], AvatarRenderer.shade(dark, 16), false)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 100, 108), _p(o, sc, 112, 124),
				_p(o, sc, 100, 140), _p(o, sc, 88, 124), _p(o, sc, 100, 108),
			]), Color(AvatarRenderer.INK, 0.75), 1.6 * sc, true)
			draw_line(_p(o, sc, 100, 112), _p(o, sc, 100, 134), Color(accent, 0.55), 1.8 * sc, true)
		"Button":
			draw_circle(_p(o, sc, 100, 124), 6.0 * sc, Color(dark, 0.9))
			draw_circle(_p(o, sc, 100, 124), 4.2 * sc, AvatarRenderer.shade(dark, 26))
			draw_circle(_p(o, sc, 98, 122), 1.6 * sc, Color(accent, 0.55))
			draw_arc(_p(o, sc, 100, 124), 6.0 * sc, 0.0, TAU, 18, Color(AvatarRenderer.INK, 0.5), 1.2 * sc, true)
		_:
			draw_line(_p(o, sc, 100, 110), _p(o, sc, 100, 130), AvatarRenderer.INK, 2.4 * sc, true)


func _draw_mouth_zyrathi(o: Vector2, sc: float, style: String, feature: Color) -> void:
	var y := 146.0
	match style:
		"Tusked", "Fanged":
			# Sharp dragon fangs — pointed tips, no mouth line between them.
			_poly(o, sc, [
				Vector2(80, y - 4), Vector2(76, y + 16), Vector2(86, y - 2),
			], Color(0.94, 0.93, 0.88), false)
			_poly(o, sc, [
				Vector2(120, y - 4), Vector2(124, y + 16), Vector2(114, y - 2),
			], Color(0.94, 0.93, 0.88), false)
		"Wide Grin":
			# Teeth plate with slightly raised outer edges (soft smile).
			_poly(o, sc, [
				Vector2(78, y - 2), Vector2(100, y + 1), Vector2(122, y - 2),
				Vector2(120, y + 7), Vector2(100, y + 8), Vector2(80, y + 7),
			], Color(0.92, 0.9, 0.85), false)
			for i in 4:
				var tx := 88.0 + float(i) * 8.0
				draw_line(_p(o, sc, tx, y + 1), _p(o, sc, tx, y + 6), Color(AvatarRenderer.INK, 0.4), 1.4 * sc, true)
		"Mandible", "Beak":
			_poly(o, sc, [
				Vector2(100, y - 10), Vector2(122, y + 4), Vector2(100, y + 18), Vector2(78, y + 4),
			], Color(feature, 0.85), false)
			draw_polyline(PackedVector2Array([
				_p(o, sc, 100, y - 10), _p(o, sc, 122, y + 4),
				_p(o, sc, 100, y + 18), _p(o, sc, 78, y + 4), _p(o, sc, 100, y - 10),
			]), Color(AvatarRenderer.INK, 0.7), 1.6 * sc, true)
		"Closed", "Pursed":
			draw_line(_p(o, sc, 88, y), _p(o, sc, 112, y), AvatarRenderer.INK, 2.6 * sc, true)
		"Grim Line":
			draw_polyline(PackedVector2Array([
				_p(o, sc, 78, y + 1), _p(o, sc, 94, y),
				_p(o, sc, 110, y + 1), _p(o, sc, 124, y - 2),
			]), Color(AvatarRenderer.INK, 0.9), 2.6 * sc, true)
		_:
			# Set Jaw
			draw_polyline(PackedVector2Array([
				_p(o, sc, 82, y), _p(o, sc, 94, y + 3),
				_p(o, sc, 110, y + 3), _p(o, sc, 122, y - 1),
			]), Color(AvatarRenderer.INK, 0.85), 2.4 * sc, true)


func _draw_markings_zyrathi(o: Vector2, sc: float, style: String, dark: Color, accent: Color) -> void:
	## Cheek / jaw only — clear of horns, eyes, and muzzle.
	match style:
		"Battle Scar", "Scar":
			draw_line(_p(o, sc, 122, 112), _p(o, sc, 144, 136), Color(accent, 0.8), 2.2 * sc, true)
			draw_line(_p(o, sc, 126, 110), _p(o, sc, 140, 128), Color(dark, 0.45), 1.2 * sc, true)
		"War Paint", "Tribal Lines":
			# Cheek bands inset from the skull edge.
			draw_line(_p(o, sc, 62, 116), _p(o, sc, 82, 110), Color(accent, 0.75), 2.4 * sc, true)
			draw_line(_p(o, sc, 138, 116), _p(o, sc, 118, 110), Color(accent, 0.75), 2.4 * sc, true)
			draw_line(_p(o, sc, 66, 128), _p(o, sc, 84, 124), Color(accent, 0.45), 1.6 * sc, true)
			draw_line(_p(o, sc, 134, 128), _p(o, sc, 116, 124), Color(accent, 0.45), 1.6 * sc, true)
		"Speckled", "Freckles":
			for i in 5:
				var x := 118.0 + float(i % 3) * 7.0
				var y := 116.0 + float(i / 3) * 8.0
				draw_circle(_p(o, sc, x, y), 1.7 * sc, Color(accent, 0.55))
				draw_circle(_p(o, sc, 82.0 - float(i % 3) * 7.0, y), 1.5 * sc, Color(dark, 0.5))
		"Plasma Burns", "Mole Cluster":
			draw_circle(_p(o, sc, 128, 120), 3.4 * sc, Color(dark, 0.75))
			draw_circle(_p(o, sc, 138, 130), 2.6 * sc, Color(accent, 0.5))
			draw_circle(_p(o, sc, 120, 132), 2.0 * sc, Color(dark, 0.6))
		_:
			pass
