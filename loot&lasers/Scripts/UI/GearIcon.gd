class_name GearIcon
extends Control
## Gear / stim / junk glyph — SVG when `visual_id` resolves, else a procedural silhouette.

const REF_SIZE := 40.0
const GLYPH_FRAME_MARGIN_PX := 1.0
const GLYPH_FRAME_STROKE_PX := 1.5
## Inner edge of the rarity stroke — glyphs fill the plate inside the frame.
const GEAR_SVG_INSET_PX := GLYPH_FRAME_MARGIN_PX + GLYPH_FRAME_STROKE_PX * 0.5
const GLYPH_BOUNDS_SAMPLE_PX := 128
const GLYPH_OPAQUE_ALPHA := 0.04
const GLYPH_CONTENT_PAD_RATIO := 0.02

var item: Dictionary = {}
var _variant := 0
static var _svg_cache: Dictionary = {}
static var _svg_region_cache: Dictionary = {}


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


static func _svg_texture(visual_id: String) -> Texture2D:
	var key := visual_id.strip_edges()
	if key.is_empty():
		return null
	if _svg_cache.has(key):
		return _svg_cache[key] as Texture2D
	var path := JunkCatalog.svg_path(key)
	if path.is_empty() or not ResourceLoader.exists(path):
		path = StimCatalog.svg_path(key)
	if path.is_empty() or not ResourceLoader.exists(path):
		path = CompanyRules.gear_svg_path(key)
	var tex: Texture2D = null
	if not path.is_empty() and ResourceLoader.exists(path):
		tex = load(path) as Texture2D
	_svg_cache[key] = tex
	return tex


static func _opaque_source_rect(tex: Texture2D) -> Rect2:
	var tex_size := tex.get_size()
	var full := Rect2(Vector2.ZERO, tex_size)
	var cache_key := tex.resource_path
	if cache_key.is_empty():
		cache_key = str(tex.get_instance_id())
	if _svg_region_cache.has(cache_key):
		return _svg_region_cache[cache_key] as Rect2
	var img := tex.get_image()
	if img == null or img.is_empty():
		_svg_region_cache[cache_key] = full
		return full
	if img.is_compressed():
		var err := img.decompress()
		if err != OK:
			_svg_region_cache[cache_key] = full
			return full
	var sample := img
	if img.get_width() > GLYPH_BOUNDS_SAMPLE_PX or img.get_height() > GLYPH_BOUNDS_SAMPLE_PX:
		sample = img.duplicate()
		sample.resize(GLYPH_BOUNDS_SAMPLE_PX, GLYPH_BOUNDS_SAMPLE_PX, Image.INTERPOLATE_NEAREST)
	var min_x := sample.get_width()
	var min_y := sample.get_height()
	var max_x := -1
	var max_y := -1
	for y in sample.get_height():
		for x in sample.get_width():
			if sample.get_pixel(x, y).a >= GLYPH_OPAQUE_ALPHA:
				if x < min_x:
					min_x = x
				if y < min_y:
					min_y = y
				if x > max_x:
					max_x = x
				if y > max_y:
					max_y = y
	if max_x < 0:
		_svg_region_cache[cache_key] = full
		return full
	var sx := tex_size.x / float(sample.get_width())
	var sy := tex_size.y / float(sample.get_height())
	var region := Rect2(
		float(min_x) * sx,
		float(min_y) * sy,
		float(max_x - min_x + 1) * sx,
		float(max_y - min_y + 1) * sy
	)
	var pad := maxf(region.size.x, region.size.y) * GLYPH_CONTENT_PAD_RATIO
	region = region.grow(pad).intersection(full)
	if region.size.x < 1.0 or region.size.y < 1.0:
		region = full
	_svg_region_cache[cache_key] = region
	return region


static func opaque_source_rect(tex: Texture2D) -> Rect2:
	return _opaque_source_rect(tex)


static func contain_dest_rect(src_size: Vector2, dest: Rect2) -> Rect2:
	return _contain_rect(src_size, dest)


static func _contain_rect(src_size: Vector2, dest: Rect2) -> Rect2:
	if src_size.x <= 0.0 or src_size.y <= 0.0:
		return dest
	var fit := minf(dest.size.x / src_size.x, dest.size.y / src_size.y)
	var drawn := src_size * fit
	return Rect2(dest.position + (dest.size - drawn) * 0.5, drawn)


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
	var visual := str(item.get("visual_id", ""))
	# Plate — rarity border / glow. Skip fill when the SVG already has a frame.
	var own_frame := false
	if JunkCatalog.is_junk_visual_id(visual):
		own_frame = JunkCatalog.svg_has_own_frame()
	elif StimCatalog.is_stim_visual_id(visual):
		own_frame = StimCatalog.svg_has_own_frame()
	else:
		own_frame = CompanyRules.gear_svg_has_own_frame()
	if not own_frame:
		draw_rect(Rect2(Vector2.ZERO, Vector2(REF_SIZE, REF_SIZE)), Color(0.04, 0.05, 0.08, 0.95), true)
	draw_rect(
		Rect2(
			GLYPH_FRAME_MARGIN_PX,
			GLYPH_FRAME_MARGIN_PX,
			REF_SIZE - GLYPH_FRAME_MARGIN_PX * 2.0,
			REF_SIZE - GLYPH_FRAME_MARGIN_PX * 2.0
		),
		Color(tint, 0.22),
		false,
		GLYPH_FRAME_STROKE_PX
	)
	var svg := _svg_texture(visual)
	if svg != null:
		var inset := 0.0 if own_frame else GEAR_SVG_INSET_PX
		var dest := Rect2(inset, inset, REF_SIZE - inset * 2.0, REF_SIZE - inset * 2.0)
		var src := _opaque_source_rect(svg)
		draw_texture_rect_region(svg, _contain_rect(src.size, dest), src)
		return
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
			_draw_flask(cx, cy, _stim_attr_color())
		_:
			_draw_gem(cx, cy, tint)


func _stim_attr_color() -> Color:
	var cons: Variant = item.get("consumable", {})
	var stat := ""
	if typeof(cons) == TYPE_DICTIONARY:
		stat = str(cons.get("stat", "")).strip_edges().to_lower()
	return GameData.stat_color(stat) if not stat.is_empty() else ClientUi.rarity_color(str(item.get("rarity", "common")))


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


## Stim flask: liquid / body / cork use attribute color; plate border+glow stay rarity.
func _draw_flask(cx: float, cy: float, attr: Color) -> void:
	draw_rect(Rect2(cx - 4, cy - 12, 8, 5), Color(attr.darkened(0.15), 0.95))
	draw_colored_polygon(PackedVector2Array([
		Vector2(cx - 3, cy - 7), Vector2(cx + 3, cy - 7),
		Vector2(cx + 8, cy + 10), Vector2(cx - 8, cy + 10),
	]), Color(attr, 0.88))
	draw_circle(Vector2(cx, cy + 4), 3.0, Color(attr.lightened(0.45), 0.45))


func _draw_gem(cx: float, cy: float, tint: Color) -> void:
	draw_colored_polygon(PackedVector2Array([
		Vector2(cx, cy - 10), Vector2(cx + 8, cy), Vector2(cx, cy + 10), Vector2(cx - 8, cy),
	]), Color(tint, 0.9))
