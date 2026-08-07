extends RefCounted
class_name CurrencyIcon
## High-res currency glyphs for the operative console readouts.

const ICON_DIR := "res://Assets/Icons/currency/"
const DEFAULT_SIZE := 20.0
## Imported SVG raster scale (see Assets/Icons/currency/*.svg.import svg/scale).
const SVG_IMPORT_SCALE := 16.0
const SVG_VIEWBOX := 24.0

static var _cache: Dictionary = {}


static func make(icon_id: String, size: float = DEFAULT_SIZE) -> TextureRect:
	var tr := TextureRect.new()
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.custom_minimum_size = Vector2(size, size)
	tr.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	tr.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tr.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	tr.texture_repeat = CanvasItem.TEXTURE_REPEAT_DISABLED
	tr.texture = _texture(icon_id, size)
	return tr


static func _display_scale() -> float:
	var tree := Engine.get_main_loop()
	if tree is SceneTree:
		var vp := (tree as SceneTree).root.get_viewport()
		if vp != null:
			return maxf(1.0, vp.get_screen_transform().get_scale().x)
	var screen := DisplayServer.window_get_current_screen()
	return maxf(1.0, DisplayServer.screen_get_scale(screen))


static func _texture(icon_id: String, display_px: float = DEFAULT_SIZE) -> Texture2D:
	var key := icon_id.strip_edges().to_lower()
	if key.is_empty():
		key = "fuel"
	var raster_px := int(SVG_VIEWBOX * SVG_IMPORT_SCALE)
	var cache_key := "%s@%d" % [key, raster_px]
	if _cache.has(cache_key):
		return _cache[cache_key] as Texture2D
	var path := ICON_DIR + key + ".svg"
	var tex: Texture2D = null
	if ResourceLoader.exists(path):
		tex = load(path) as Texture2D
	if tex == null:
		var img := Image.create(raster_px, raster_px, false, Image.FORMAT_RGBA8)
		img.fill(Color(1, 1, 1, 0.85))
		tex = ImageTexture.create_from_image(img)
	elif OS.is_debug_build():
		var needed := int(ceil(display_px * _display_scale() * 1.25))
		if tex.get_width() > 0 and needed > tex.get_width():
			push_warning(
				"CurrencyIcon '%s' may look soft at %.0fpx (texture %dpx, need ~%dpx). Bump svg/scale in import."
				% [key, display_px, tex.get_width(), needed]
			)
	_cache[cache_key] = tex
	return tex
