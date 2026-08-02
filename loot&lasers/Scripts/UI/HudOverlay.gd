class_name HudOverlay
extends Control
## Lightweight animated HUD treatment for the shared content stage.

@export var accent := Color("#0DCADF")
@export_range(0.0, 1.0, 0.05) var strength := 0.55

var _elapsed := 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)


func _process(delta: float) -> void:
	_elapsed += delta
	queue_redraw()


func _draw() -> void:
	if size.x < 40.0 or size.y < 40.0:
		return

	var inset := 7.0
	var corner := 22.0
	var bright := Color(accent, 0.48 * strength)
	var dim := Color(accent, 0.12 * strength)

	# Precision corner brackets.
	for data in [
		[Vector2(inset, inset), Vector2(1, 1)],
		[Vector2(size.x - inset, inset), Vector2(-1, 1)],
		[Vector2(inset, size.y - inset), Vector2(1, -1)],
		[Vector2(size.x - inset, size.y - inset), Vector2(-1, -1)],
	]:
		var p: Vector2 = data[0]
		var direction: Vector2 = data[1]
		draw_line(p, p + Vector2(direction.x * corner, 0), bright, 1.5, true)
		draw_line(p, p + Vector2(0, direction.y * corner), bright, 1.5, true)
		draw_circle(p, 2.2, Color(accent, 0.72 * strength))

	# Quiet structural guide lines.
	draw_line(Vector2(inset + corner + 8, inset), Vector2(size.x - inset - corner - 8, inset), dim, 1.0)
	draw_line(
		Vector2(inset + corner + 8, size.y - inset),
		Vector2(size.x - inset - corner - 8, size.y - inset),
		dim,
		1.0
	)

	# Slow scanning beam — live instrument motion without obscuring UI.
	var sweep := fposmod(_elapsed * 0.065, 1.2) - 0.08
	var y := sweep * size.y
	draw_line(Vector2(inset, y), Vector2(size.x - inset, y), Color(accent, 0.10 * strength), 1.0)
	draw_line(
		Vector2(inset, y - 3.0),
		Vector2(size.x - inset, y - 3.0),
		Color(accent, 0.04 * strength),
		1.0
	)

	# Animated telemetry ticks.
	var pulse := 0.55 + sin(_elapsed * 2.1) * 0.25
	for i in 5:
		var x := inset + 9.0 + float(i) * 7.0
		draw_line(
			Vector2(x, size.y - inset - 5),
			Vector2(x, size.y - inset - 5 - float(i % 3 + 1) * 2.0),
			Color(accent, pulse * 0.4 * strength),
			1.0
		)

	# Sparse side calibration marks give the content stage instrument depth.
	for side in [inset, size.x - inset]:
		var direction := 1.0 if side < size.x * 0.5 else -1.0
		for i in range(1, 7):
			var mark_y := inset + (size.y - inset * 2.0) * float(i) / 7.0
			var mark_len := 7.0 if i % 2 == 0 else 4.0
			draw_line(
				Vector2(side, mark_y),
				Vector2(side + direction * mark_len, mark_y),
				Color(accent, (0.10 + pulse * 0.05) * strength),
				1.0
			)

	# A tiny breathing acquisition reticle; intentionally too faint to read as a target.
	var reticle_center := Vector2(size.x * 0.5, inset + 5.0)
	var reticle_half := 9.0 + sin(_elapsed * 0.8) * 1.5
	draw_line(
		reticle_center - Vector2(reticle_half, 0),
		reticle_center - Vector2(3.0, 0),
		Color(accent, 0.12 * strength),
		1.0
	)
	draw_line(
		reticle_center + Vector2(3.0, 0),
		reticle_center + Vector2(reticle_half, 0),
		Color(accent, 0.12 * strength),
		1.0
	)
