class_name SpiralMap
extends RefCounted
## Spiral dungeon layout — mirrors DungeonMap.jsx buildSpiralNodes.

const WORMHOLE := Vector2(50, 50)
const SPIRAL_TURNS := 1.2
const MAP_MARGIN := 14.0


static func build() -> Dictionary:
	var raw: Array = []
	for i in 10:
		var t := float(i) / 9.0
		var angle := -PI / 2.0 + t * SPIRAL_TURNS * PI * 2.0
		var r := 1.0 - t * 0.64
		raw.append({"x": cos(angle) * r, "y": sin(angle) * r, "r": r})

	var max_reach := 0.18
	for p in raw:
		max_reach = maxf(max_reach, float(p["r"]) + 0.22)
	var scale := (100.0 - MAP_MARGIN * 2.0) / (2.0 * max_reach)

	var nodes: Array = []
	for p in raw:
		nodes.append(_map_pt(float(p["x"]), float(p["y"]), scale))

	var guide: Array = []
	for i in 57:
		var t := (float(i) / 56.0) * 1.12
		var angle := -PI / 2.0 + minf(t, 1.0) * SPIRAL_TURNS * PI * 2.0 \
			+ maxf(0.0, t - 1.0) * PI * 0.7
		var r := maxf(0.0, 1.0 - minf(t, 1.12) * 0.72)
		guide.append(_map_pt(cos(angle) * r, sin(angle) * r, scale))

	return {"nodes": nodes, "guide": guide, "wormhole": WORMHOLE}


static func _map_pt(x: float, y: float, scale: float) -> Vector2:
	return Vector2(WORMHOLE.x + x * scale, WORMHOLE.y + y * scale)


static func segment_control(a: Vector2, b: Vector2) -> Vector2:
	var mid := (a + b) * 0.5
	return mid * 0.82 + WORMHOLE * 0.18


static func radial_label_offset(pos: Vector2) -> Vector2:
	var d := pos - WORMHOLE
	var len := d.length()
	if len < 0.001:
		return Vector2(0, -8)
	return (d / len) * Vector2(8.5, 7.5)


static func pct_to_px(pct: Vector2, stage_size: float) -> Vector2:
	return pct * (stage_size / 100.0)
