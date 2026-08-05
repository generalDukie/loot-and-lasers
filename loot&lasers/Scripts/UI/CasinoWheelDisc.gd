class_name CasinoWheelDisc
extends Control
## Conic stardust wheel — casino_v2 tiers (90% RTP). Land by tier_id or server segment mid.

const TIERS: Array = [
	{"id": "lose", "p": 0.60, "mult": 0, "label": "Lose", "color": Color("#6B7280")},
	{"id": "shove", "p": 0.20, "mult": 1, "label": "Shove", "color": Color("#9CA3AF")},
	{"id": "x2", "p": 0.10, "mult": 2, "label": "2×", "color": Color("#22C55E")},
	{"id": "x3", "p": 0.05, "mult": 3, "label": "3×", "color": Color("#3B82F6")},
	{"id": "x5", "p": 0.03, "mult": 5, "label": "5×", "color": Color("#A855F7")},
	{"id": "x10", "p": 0.02, "mult": 10, "label": "10×", "color": Color("#F59E0B")},
]

var segments: Array = []
var glowing := false


func _ready() -> void:
	custom_minimum_size = Vector2(160, 160)
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
			"id": str(t.get("id", "")),
			"p": t.get("p", 0.0),
			"mult": int(t.get("mult", 0)),
			"label": str(t.get("label", "")),
			"color": t.get("color", Color.GRAY),
			"start": angle,
			"mid": angle + span * 0.5,
			"span": span,
		})
		angle += span


func tier_for_id(tier_id: String) -> Dictionary:
	var key := tier_id.strip_edges().to_lower()
	if key.is_empty():
		return {}
	for seg in segments:
		if str(seg.get("id", "")).to_lower() == key:
			return seg
	return {}


func tier_for_mult(mult: int) -> Dictionary:
	for seg in segments:
		if int(seg.get("mult", -1)) == mult:
			return seg
	return segments[0] if not segments.is_empty() else {}


## Prefer tier_id; optional server segment.mid in [0,1). Falls back to mult.
func spin_delta_degrees(
	mult: int,
	current_deg: float,
	extra_turns: int = 4,
	tier_id: String = "",
	segment_mid_01: float = -1.0,
) -> float:
	var mid_deg := -1.0
	if segment_mid_01 >= 0.0:
		mid_deg = fposmod(segment_mid_01, 1.0) * 360.0
	elif not tier_id.is_empty():
		var by_id := tier_for_id(tier_id)
		if not by_id.is_empty():
			mid_deg = float(by_id.get("mid", 0.0))
	if mid_deg < 0.0:
		var seg := tier_for_mult(mult)
		if seg.is_empty():
			return 360.0 * float(extra_turns)
		mid_deg = float(seg.get("mid", 0.0))
	var span := 12.0
	var matched := tier_for_id(tier_id) if not tier_id.is_empty() else tier_for_mult(mult)
	if not matched.is_empty():
		span = float(matched.get("span", 12.0))
	var jitter := (randf() * 0.5 - 0.25) * minf(span * 0.6, 12.0)
	var target_mod := fposmod(360.0 - (mid_deg + jitter), 360.0)
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
