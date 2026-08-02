class_name AmbientHudOverlay
extends Control
## Lightweight screen-space flavor shared by every page: scanlines, HUD corners,
## drifting motes, and a slow radar sweep. Purely decorative and input-transparent.

@export var accent: Color = Color("#0DCADF")
@export var intensity := 1.0

var _elapsed := 0.0
var _motes: Array[Dictionary] = []
var _scan_tex: Texture2D


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	resized.connect(queue_redraw)
	_ensure_scan_tex()
	var rng := RandomNumberGenerator.new()
	rng.seed = 0x10F1A
	for i in 24:
		_motes.append({
			"x": rng.randf(),
			"y": rng.randf(),
			"speed": rng.randf_range(0.006, 0.018),
			"size": rng.randf_range(0.6, 1.8),
			"phase": rng.randf() * TAU,
		})


func set_active(on: bool) -> void:
	set_process(on)
	if on:
		queue_redraw()


func _ensure_scan_tex() -> void:
	if _scan_tex != null:
		return
	# 1×6 strip: one lit row + 5 clear — matches old draw_line step of 6.
	var img := Image.create(1, 6, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	img.set_pixel(0, 0, Color(0.72, 0.9, 1.0, 1.0))
	_scan_tex = ImageTexture.create_from_image(img)


func _process(delta: float) -> void:
	_elapsed += delta
	queue_redraw()


func _draw() -> void:
	if size.x < 2.0 or size.y < 2.0:
		return
	_draw_scanlines()
	_draw_motes()
	_draw_corner_brackets()
	_draw_radar_sweep()


func _draw_scanlines() -> void:
	if _scan_tex == null:
		_ensure_scan_tex()
	# One tiled blit replaces ~180 draw_line calls at 1080p.
	draw_texture_rect(
		_scan_tex,
		Rect2(Vector2.ZERO, size),
		true,
		Color(1, 1, 1, 0.012 * intensity)
	)


func _draw_motes() -> void:
	for mote in _motes:
		var y := fposmod(float(mote["y"]) - _elapsed * float(mote["speed"]), 1.0)
		var x := float(mote["x"]) + sin(_elapsed * 0.32 + float(mote["phase"])) * 0.012
		var twinkle := 0.35 + 0.65 * absf(sin(_elapsed * 0.8 + float(mote["phase"])))
		draw_circle(
			Vector2(x * size.x, y * size.y),
			float(mote["size"]),
			Color(accent, (0.04 + 0.08 * twinkle) * intensity)
		)


func _draw_corner_brackets() -> void:
	var c := Color(accent, 0.16 * intensity)
	var bright := Color(accent, 0.42 * intensity)
	var pad := 11.0
	var arm := 24.0
	for corner in [
		Vector2(pad, pad),
		Vector2(size.x - pad, pad),
		Vector2(pad, size.y - pad),
		Vector2(size.x - pad, size.y - pad),
	]:
		var sx := 1.0 if corner.x < size.x * 0.5 else -1.0
		var sy := 1.0 if corner.y < size.y * 0.5 else -1.0
		draw_line(corner, corner + Vector2(arm * sx, 0), bright, 1.5, true)
		draw_line(corner, corner + Vector2(0, arm * sy), bright, 1.5, true)
		draw_circle(corner + Vector2(6 * sx, 6 * sy), 1.6, c)


func _draw_radar_sweep() -> void:
	# Keep the radar fully on-screen (window edges / taskbar safe).
	var center := Vector2(size.x - 58.0, size.y - 64.0)
	var radius := 28.0
	draw_arc(center, radius, 0, TAU, 32, Color(accent, 0.09 * intensity), 1.0)
	draw_arc(center, radius * 0.55, 0, TAU, 24, Color(accent, 0.06 * intensity), 1.0)
	var angle := fposmod(_elapsed * 0.55, TAU)
	draw_line(center, center + Vector2(cos(angle), sin(angle)) * radius, Color(accent, 0.2 * intensity), 1.0)
	draw_circle(center, 1.5, Color(accent, 0.35 * intensity))
