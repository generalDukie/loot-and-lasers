class_name GearIcon
extends Control
## Procedural gear glyph — mirrors web GearVisual / GearArtSvg silhouette role.

const REF_SIZE := 40.0

var item: Dictionary = {}
var _variant := 0


static func make(for_item: Dictionary, size_px: float = 40.0) -> GearIcon:
	var icon := GearIcon.new()
	icon.item = for_item.duplicate(true) if not for_item.is_empty() else {}
	icon.custom_minimum_size = Vector2(size_px, size_px)
	icon._variant = _variant_index(for_item)
	return icon


static func _variant_index(for_item: Dictionary) -> int:
	var seed_s := "%s|%s|%s" % [
		str(for_item.get("name", "")),
		str(for_item.get("base_name", "")),
		str(for_item.get("type", "")),
	]
	var h := 2166136261
	for i in seed_s.length():
		h = (h ^ seed_s.unicode_at(i)) * 16777619
		h = h & 0x7fffffff
	return abs(h) % 4


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)
	queue_redraw()


func set_item(for_item: Dictionary) -> void:
	item = for_item.duplicate(true) if not for_item.is_empty() else {}
	_variant = _variant_index(item)
	queue_redraw()


func _draw() -> void:
	if size.x < 4.0 or size.y < 4.0:
		return
	var box := minf(size.x, size.y)
	var scale := box / REF_SIZE
	var ox := (size.x - REF_SIZE * scale) * 0.5
	var oy := (size.y - REF_SIZE * scale) * 0.5
	draw_set_transform(Vector2(ox, oy), 0.0, Vector2(scale, scale))
	_draw_icon(REF_SIZE * 0.5, REF_SIZE * 0.5)


func _draw_icon(cx: float, cy: float) -> void:
	var rarity := str(item.get("rarity", "common"))
	var tint := ClientUi.rarity_color(rarity)
	var itype := str(item.get("type", "weapon"))
	# Plate.
	draw_rect(Rect2(Vector2.ZERO, Vector2(REF_SIZE, REF_SIZE)), Color(0.04, 0.05, 0.08, 0.95), true)
	draw_rect(Rect2(1, 1, REF_SIZE - 2, REF_SIZE - 2), Color(tint, 0.22), false, 1.5)
	draw_circle(Vector2(cx, cy), REF_SIZE * 0.38, Color(tint, 0.12))
	match itype:
		"weapon":
			_draw_weapon(cx, cy, tint)
		"helmet":
			_draw_helmet(cx, cy, tint)
		"armor":
			_draw_armor(cx, cy, tint)
		"boots":
			_draw_boots(cx, cy, tint)
		"legs":
			_draw_legs(cx, cy, tint)
		"neck":
			_draw_neck(cx, cy, tint)
		"accessory":
			_draw_ring(cx, cy, tint)
		"ship_module":
			_draw_module(cx, cy, tint)
		"consumable":
			_draw_flask(cx, cy, tint)
		_:
			_draw_gem(cx, cy, tint)


func _draw_weapon(cx: float, cy: float, tint: Color) -> void:
	var style := GameData.weapon_combat_style_for(
		str(item.get("name", "")), str(item.get("base_name", ""))
	)
	var lean := 0.15 if _variant % 2 == 0 else -0.12
	if style in ["shoot", "stab"] and str(item.get("name", "")).to_lower().find("bow") < 0:
		# Blaster body.
		draw_colored_polygon(PackedVector2Array([
			Vector2(cx - 12, cy - 3 + lean * 10),
			Vector2(cx + 10, cy - 5),
			Vector2(cx + 14, cy),
			Vector2(cx + 10, cy + 5),
			Vector2(cx - 12, cy + 3 - lean * 10),
		]), Color(tint, 0.95))
		draw_rect(Rect2(cx + 8, cy - 2, 8, 4), Color(0.85, 0.95, 1.0, 0.9))
		draw_circle(Vector2(cx - 6, cy), 2.5, Color(tint.lightened(0.35), 0.9))
	elif style == "stab" or str(item.get("name", "")).to_lower().find("dagger") >= 0:
		draw_line(Vector2(cx - 2, cy + 10), Vector2(cx + 2, cy - 12), Color(tint, 0.95), 3.0)
		draw_colored_polygon(PackedVector2Array([
			Vector2(cx, cy - 14), Vector2(cx + 4, cy - 6), Vector2(cx - 4, cy - 6),
		]), Color(0.9, 0.95, 1.0, 0.95))
		draw_line(Vector2(cx - 6, cy + 2), Vector2(cx + 6, cy + 2), Color(tint.darkened(0.2), 0.9), 2.0)
	else:
		# Blade.
		draw_line(Vector2(cx - 1, cy + 12), Vector2(cx + 1, cy - 12), Color(0.85, 0.9, 1.0, 0.95), 2.4)
		draw_colored_polygon(PackedVector2Array([
			Vector2(cx, cy - 14), Vector2(cx + 5, cy - 2), Vector2(cx - 5, cy - 2),
		]), Color(tint, 0.9))
		draw_rect(Rect2(cx - 6, cy + 2, 12, 3), Color(tint.darkened(0.25), 0.95))


func _draw_helmet(cx: float, cy: float, tint: Color) -> void:
	draw_arc(Vector2(cx, cy + 2), 11.0, PI, TAU, 20, Color(tint, 0.95), 3.5)
	draw_rect(Rect2(cx - 10, cy - 2, 20, 8), Color(tint, 0.85))
	draw_line(Vector2(cx - 6, cy + 1), Vector2(cx + 6, cy + 1), Color(0.2, 0.9, 1.0, 0.9), 2.0)


func _draw_armor(cx: float, cy: float, tint: Color) -> void:
	draw_colored_polygon(PackedVector2Array([
		Vector2(cx, cy - 12), Vector2(cx + 12, cy - 4), Vector2(cx + 10, cy + 12),
		Vector2(cx - 10, cy + 12), Vector2(cx - 12, cy - 4),
	]), Color(tint, 0.85))
	draw_line(Vector2(cx, cy - 8), Vector2(cx, cy + 8), Color(1, 1, 1, 0.35), 1.2)


func _draw_boots(cx: float, cy: float, tint: Color) -> void:
	draw_rect(Rect2(cx - 10, cy - 6, 8, 14), Color(tint, 0.9))
	draw_rect(Rect2(cx + 2, cy - 6, 8, 14), Color(tint, 0.9))
	draw_rect(Rect2(cx - 12, cy + 6, 12, 4), Color(tint.darkened(0.2), 0.95))
	draw_rect(Rect2(cx + 0, cy + 6, 12, 4), Color(tint.darkened(0.2), 0.95))


func _draw_legs(cx: float, cy: float, tint: Color) -> void:
	draw_rect(Rect2(cx - 9, cy - 10, 7, 20), Color(tint, 0.9))
	draw_rect(Rect2(cx + 2, cy - 10, 7, 20), Color(tint, 0.9))
	draw_rect(Rect2(cx - 10, cy - 12, 20, 5), Color(tint.lightened(0.15), 0.85))


func _draw_neck(cx: float, cy: float, tint: Color) -> void:
	draw_arc(Vector2(cx, cy - 2), 9.0, 0.4, PI - 0.4, 18, Color(tint, 0.9), 2.0)
	draw_circle(Vector2(cx, cy + 6), 4.5, Color(tint.lightened(0.2), 0.95))
	draw_circle(Vector2(cx, cy + 6), 2.0, Color(1, 1, 1, 0.55))


func _draw_ring(cx: float, cy: float, tint: Color) -> void:
	draw_arc(Vector2(cx, cy), 8.0, 0, TAU, 24, Color(tint, 0.95), 2.4)
	draw_arc(Vector2(cx, cy), 5.0, 0, TAU, 20, Color(tint.lightened(0.3), 0.55), 1.2)
	draw_circle(Vector2(cx, cy - 7), 2.5, Color(tint.lightened(0.4), 0.95))


func _draw_module(cx: float, cy: float, tint: Color) -> void:
	draw_rect(Rect2(cx - 10, cy - 8, 20, 16), Color(tint, 0.85))
	draw_circle(Vector2(cx, cy), 4.0, Color(0.3, 0.95, 1.0, 0.9))
	draw_line(Vector2(cx - 10, cy), Vector2(cx - 14, cy), Color(tint, 0.7), 1.5)
	draw_line(Vector2(cx + 10, cy), Vector2(cx + 14, cy), Color(tint, 0.7), 1.5)


func _draw_flask(cx: float, cy: float, tint: Color) -> void:
	draw_rect(Rect2(cx - 4, cy - 12, 8, 5), Color(tint.darkened(0.2), 0.95))
	draw_colored_polygon(PackedVector2Array([
		Vector2(cx - 3, cy - 7), Vector2(cx + 3, cy - 7),
		Vector2(cx + 8, cy + 10), Vector2(cx - 8, cy + 10),
	]), Color(tint, 0.75))
	draw_circle(Vector2(cx, cy + 4), 3.0, Color(1, 1, 1, 0.35))


func _draw_gem(cx: float, cy: float, tint: Color) -> void:
	draw_colored_polygon(PackedVector2Array([
		Vector2(cx, cy - 10), Vector2(cx + 8, cy), Vector2(cx, cy + 10), Vector2(cx - 8, cy),
	]), Color(tint, 0.9))
