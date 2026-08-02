class_name ShootingStars
extends Control
## Diagonal meteor streaks — bright head, fading trail, quick dashes (not slow bars).

## Each entry: vertical lane, dash duration, pause before next dash, start delay, angle°.
const SHOOTERS := [
	{"top": 0.08, "dash": 1.6, "gap": 7.5, "delay": 0.4, "angle": -28.0},
	{"top": 0.22, "dash": 1.9, "gap": 9.0, "delay": 2.8, "angle": -22.0},
	{"top": 0.38, "dash": 1.4, "gap": 8.2, "delay": 5.1, "angle": -32.0},
	{"top": 0.52, "dash": 2.1, "gap": 10.0, "delay": 1.2, "angle": -18.0},
	{"top": 0.68, "dash": 1.7, "gap": 8.8, "delay": 4.0, "angle": -26.0},
	{"top": 0.84, "dash": 1.5, "gap": 9.5, "delay": 6.6, "angle": -30.0},
]

@export_range(0.0, 1.5, 0.05) var intensity := 1.0

var _elapsed := 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	set_process(true)
	resized.connect(queue_redraw)


func set_active(on: bool) -> void:
	set_process(on)
	if on:
		queue_redraw()


func _process(delta: float) -> void:
	_elapsed += delta
	queue_redraw()


func _draw() -> void:
	if size.x <= 1.0 or size.y <= 1.0:
		return
	for i in SHOOTERS.size():
		_draw_shooter(SHOOTERS[i], i)


func _draw_shooter(data: Dictionary, _index: int) -> void:
	var dash := float(data.get("dash", 1.6))
	var gap := float(data.get("gap", 8.0))
	var delay := float(data.get("delay", 0.0))
	var cycle_len := dash + gap
	var cycle := fposmod(_elapsed - delay, cycle_len)
	if cycle > dash:
		return
	var progress := cycle / dash
	var opacity := _shoot_opacity(progress) * intensity
	if opacity <= 0.01:
		return

	# Travel from off-left to off-right; slight downward bias from angle.
	var angle := deg_to_rad(float(data.get("angle", -26.0)))
	var direction := Vector2.RIGHT.rotated(angle)
	var travel := size.x + size.y * 0.35 + 280.0
	var start := Vector2(
		-180.0,
		size.y * float(data.get("top", 0.5))
	)
	# Head position along the flight path.
	var head := start + direction * (travel * progress)
	var trail_len := clampf(size.x * 0.11, 70.0, 160.0)

	# Soft glow along the trail (wide, faint).
	draw_line(
		head - direction * trail_len,
		head,
		Color(0.55, 0.78, 1.0, opacity * 0.16),
		5.0,
		true
	)
	# Core streak — transparent at the tail, bright at the head.
	var segments := 14
	for segment in segments:
		var t0 := float(segment) / float(segments)
		var t1 := float(segment + 1) / float(segments)
		# t=0 at tail (behind head), t=1 at head.
		var a := head - direction * trail_len * (1.0 - t0)
		var b := head - direction * trail_len * (1.0 - t1)
		var segment_alpha := opacity * pow(t1, 2.2)
		var width := lerpf(1.0, 2.2, t1)
		draw_line(a, b, Color(0.86, 0.94, 1.0, segment_alpha), width, true)

	# Bright tip + soft bloom so it reads as a meteor head, not a bar.
	draw_circle(head, 2.4, Color(0.95, 0.98, 1.0, opacity))
	draw_circle(head, 5.5, Color(0.65, 0.85, 1.0, opacity * 0.18))
	draw_circle(head, 9.0, Color(0.45, 0.72, 1.0, opacity * 0.07))


func _shoot_opacity(progress: float) -> float:
	# Fade in fast, hold, fade out — matches a brief meteor flash.
	if progress < 0.08:
		return smoothstep(0.0, 0.08, progress)
	if progress < 0.72:
		return 1.0
	return 1.0 - smoothstep(0.72, 1.0, progress)
