extends RefCounted
class_name NavIcon
## Lucide-style nav icons (white SVG strokes) tinted with each button's color.

const ICON_DIR := "res://Assets/Icons/nav/"
const DEFAULT_SIZE := 22.0

static var _cache: Dictionary = {}


static func make(icon_id: String, tint: Color, size: float = DEFAULT_SIZE) -> TextureRect:
	var tr := TextureRect.new()
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.custom_minimum_size = Vector2(size, size)
	tr.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tr.texture = _texture(icon_id)
	tr.modulate = tint
	tr.set_meta("nav_tint", tint)
	return tr


static func set_tint(tr: TextureRect, tint: Color) -> void:
	if tr == null or not is_instance_valid(tr):
		return
	tr.modulate = tint
	tr.set_meta("nav_tint", tint)


static func _texture(icon_id: String) -> Texture2D:
	var key := icon_id.strip_edges().to_lower()
	if key.is_empty():
		key = "user"
	if _cache.has(key):
		return _cache[key] as Texture2D
	var path := ICON_DIR + key + ".svg"
	var tex: Texture2D = null
	if ResourceLoader.exists(path):
		tex = load(path) as Texture2D
	if tex == null:
		# Fallback placeholder so a missing import never blanks the rail.
		var img := Image.create(24, 24, false, Image.FORMAT_RGBA8)
		img.fill(Color(1, 1, 1, 0.85))
		tex = ImageTexture.create_from_image(img)
	_cache[key] = tex
	return tex
