class_name CasinoWheelDisc
extends Control
## Conic stardust wheel — mirrors web StardustWheel segments + spin landing.

const TIERS: Array = [
	{"p": 0.50, "mult": 0, "label": "Bust", "color": Color("#6B7280")},
	{"p": 0.22, "mult": 1, "label": "Push", "color": Color("#9CA3AF")},
	{"p": 0.15, "mult": 2, "label": "2×", "color": Color("#22C55E")},
	{"p": 0.08, "mult": 3, "label": "3×", "color": Color("#3B82F6")},
	{"p": 0.04, "mult": 5, "label": "5×", "color": Color("#A855F7")},
	{"p": 0.008, "mult": 10, "label": "10×", "color": Color("#F59E0B")},
	{"p": 0.002, "mult": 25, "label": "25×", "color": Color("#F97316")},
]

var segments: Array = []
var glowing := false


func _ready() -> void:
	custom_minimum_size = Vector2(120, 120)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build_segments()
	resized.connect(func() -> void:
		pivot_offset = size * 0.5
		queue_redraw()
	)
	pivot_offset = custom_minimum_size * 0.5
	queue_redraw()


func _build_segments() -> void:
	segments.clear()
	var angle := 0.0
	for t in TIERS:
		var span := float(t.get("p", 0.0)) * 360.0
		segments.append({
			"p": t.get("p", 0.0),
			"mult": int(t.get("mult", 0)),
			"label": str(t.get("label", "")),
			"color": t.get("color", Color.GRAY),
			"start": angle,
			"mid": angle + span * 0.5,
			"span": span,
		})
		angle += span


func tier_for_mult(mult: int) -> Dictionary:
	for seg in segments:
		if int(seg.get("mult", -1)) == mult:
			return seg
	return segments[0] if not segments.is_empty() else {}


## Degrees to add so the pointer (top) lands inside the winning segment.
func spin_delta_degrees(mult: int, current_deg: float, extra_turns: int = 7) -> float:
	var seg := tier_for_mult(mult)
	if seg.is_empty():
		return 360.0 * float(extra_turns)
	var span: float = float(seg.get("span", 10.0))
	var jitter := (randf() * 0.5 - 0.25) * minf(span * 0.6, 12.0)
	var target_mod := fposmod(360.0 - (float(seg.get("mid", 0.0)) + jitter), 360.0)
	var cur_mod := fposmod(current_deg, 360.0)
	var delta := fposmod(target_mod - cur_mod, 360.0)
	return 360.0 * float(extra_turns) + delta


func set_glowing(on: bool) -> void:
	glowing = on
	queue_redraw()


func _draw() -> void:
	if size.x < 8.0 or size.y < 8.0:
		return
	var center := size * 0.5
	var radius := minf(size.x, size.y) * 0.48
	for seg in segments:
		var points := PackedVector2Array()
		points.append(center)
		var start_a := deg_to_rad(float(seg.get("start", 0.0)))
		var end_a := deg_to_rad(float(seg.get("start", 0.0)) + float(seg.get("span", 0.0)))
		var steps := maxi(4, int(ceil(float(seg.get("span", 10.0)) / 3.0)))
		for i in range(steps + 1):
			var a := lerpf(start_a, end_a, float(i) / float(steps))
			# CSS conic 0° = top, clockwise — match web wheel.
			points.append(center + Vector2(sin(a), -cos(a)) * radius)
		draw_colored_polygon(points, seg.get("color", Color.GRAY))
	var rim := Color("#FBBF24", 0.55 if glowing else 0.35)
	draw_arc(center, radius, 0.0, TAU, 64, rim, 2.5, true)
	draw_circle(center, radius * 0.12, Color(0.08, 0.06, 0.04, 0.95))
	draw_arc(center, radius * 0.12, 0.0, TAU, 24, Color("#FBBF24", 0.7), 1.5, true)
	if glowing:
		draw_arc(center, radius + 3.0, 0.0, TAU, 64, Color("#FBBF24", 0.22), 6.0, true)
