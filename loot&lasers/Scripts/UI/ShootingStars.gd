class_name ShootingStars
extends Control
## Animated multi-depth starfield matching the web SpaceBackground treatment.

const SHOOTERS := [
	{"top": 0.06, "duration": 9.0, "delay": 1.0},
	{"top": 0.22, "duration": 11.0, "delay": 4.0},
	{"top": 0.38, "duration": 8.0, "delay": 7.0},
	{"top": 0.54, "duration": 12.0, "delay": 2.0},
	{"top": 0.70, "duration": 10.0, "delay": 6.0},
	{"top": 0.86, "duration": 9.0, "delay": 9.0},
]

@export_range(0.0, 1.5, 0.05) var intensity := 1.0

var _elapsed := 0.0
var _redraw_accum := 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	resized.connect(queue_redraw)


func _process(delta: float) -> void:
	_elapsed += delta
	_redraw_accum += delta
	if _redraw_accum < 0.08:
		return
	_redraw_accum = 0.0
	queue_redraw()


func _draw() -> void:
	if size.x <= 1.0 or size.y <= 1.0:
		return
	# GPU nebula/stars already live in space_backdrop — keep only streak motion here.
	for i in SHOOTERS.size():
		_draw_shooter(SHOOTERS[i], i)


func _draw_star_depth(
	count: int,
	x_seed: int,
	y_seed: int,
	base_alpha: float,
	radius_scale: float
) -> void:
	for i in count:
		var px := float((i * x_seed + 31) % 997) / 997.0 * size.x
		var py := float((i * y_seed + 47) % 991) / 991.0 * size.y
		var pulse := 0.5 + 0.5 * sin(_elapsed * (0.55 + float(i % 5) * 0.11) + float(i) * 1.73)
		var alpha := (base_alpha + pulse * 0.34) * intensity
		var radius := (0.65 + float(i % 4) * 0.28) * radius_scale
		var tint := Color(0.78, 0.92, 1.0, alpha)
		if i % 7 == 0:
			tint = Color(0.82, 0.68, 1.0, alpha * 0.82)
		draw_circle(Vector2(px, py), radius, tint)


func _draw_shooter(data: Dictionary, index: int) -> void:
	var duration := float(data.get("duration", 10.0))
	var delay := float(data.get("delay", 0.0))
	var cycle := fposmod(_elapsed - delay, duration)
	var progress := cycle / duration
	var opacity := _shoot_opacity(progress) * intensity
	if opacity <= 0.005:
		return

	var travel_start := -160.0
	var travel_end := size.x + 160.0
	var origin := Vector2(
		lerpf(travel_start, travel_end, progress),
		size.y * float(data.get("top", 0.5))
	)
	var direction := Vector2.RIGHT.rotated(deg_to_rad(16.0))
	var length := 120.0
	var segments := 20

	# Soft drop-shadow beneath the streak.
	draw_line(
		origin - direction * 4.0,
		origin + direction * length,
		Color(0.52, 0.78, 1.0, opacity * 0.14),
		6.0,
		true
	)
	for segment in segments:
		var t0 := float(segment) / float(segments)
		var t1 := float(segment + 1) / float(segments)
		var a := origin + direction * length * t0
		var b := origin + direction * length * t1
		var segment_alpha := opacity * pow(t1, 1.65)
		draw_line(a, b, Color(0.78, 0.9, 1.0, segment_alpha), 1.6, true)

	var head := origin + direction * length
	draw_circle(head, 1.8, Color(0.9, 0.97, 1.0, opacity))
	draw_circle(head, 4.2, Color(0.58, 0.82, 1.0, opacity * 0.12))


func _shoot_opacity(progress: float) -> float:
	if progress < 0.06:
		return smoothstep(0.0, 0.06, progress) * 0.85
	if progress < 0.55:
		return lerpf(0.85, 0.7, (progress - 0.06) / 0.49)
	return lerpf(0.7, 0.0, (progress - 0.55) / 0.45)
