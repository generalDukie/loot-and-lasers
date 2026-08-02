class_name ResolutionRules
extends RefCounted
## Pure 16:9 display math — mirrored by ResolutionManager at runtime.
## Design canvas is 2560×1440 (legacy authored UI was 1920×1080).

const DESIGN_SIZE := Vector2i(2560, 1440)
const LEGACY_DESIGN_SIZE := Vector2i(1920, 1080)
const DESIGN_ASPECT := 16.0 / 9.0
## Convert a value authored for the old 1080p canvas into 1440p design pixels.
const FROM_1080 := float(DESIGN_SIZE.x) / float(LEGACY_DESIGN_SIZE.x) # 4/3


static func px(v: float) -> int:
	return maxi(1, int(round(v * FROM_1080)))


static func pxf(v: float) -> float:
	return v * FROM_1080


static func pxv(v: Vector2) -> Vector2:
	return Vector2(pxf(v.x), pxf(v.y))


static func pxvi(v: Vector2i) -> Vector2i:
	return Vector2i(px(float(v.x)), px(float(v.y)))


## Largest centered 16:9 rect that fits inside available_size.
static func largest_16_9_rect(available_size: Vector2) -> Rect2:
	if available_size.x <= 0.0 or available_size.y <= 0.0:
		return Rect2(Vector2.ZERO, Vector2.ZERO)
	var available_aspect := available_size.x / available_size.y
	var game_size := Vector2()
	if available_aspect > DESIGN_ASPECT:
		game_size.y = available_size.y
		game_size.x = game_size.y * DESIGN_ASPECT
	else:
		game_size.x = available_size.x
		game_size.y = game_size.x / DESIGN_ASPECT
	var game_position := (available_size - game_size) * 0.5
	return Rect2(game_position, game_size)


static func ui_scale_for_game_width(game_width: float) -> float:
	if DESIGN_SIZE.x <= 0:
		return 1.0
	return game_width / float(DESIGN_SIZE.x)
