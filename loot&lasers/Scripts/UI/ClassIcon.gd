extends RefCounted
class_name ClassIcon
## Class emblem textures — voxel symbols cropped from the class sheet (no labels).
## Artwork is full-color — do not tint/modulate.

const ICON_DIR := "res://Assets/Icons/classes/"
## Matches former creator list emblem box (~48px).
const DEFAULT_SIZE := 48.0
const SIZE_LIST := 48.0
const SIZE_DETAIL := 72.0
const SIZE_COMBAT := 36.0
const SIZE_LEADERBOARD := 32.0
const SIZE_PODIUM := 48.0
const SIZE_BANNER := 36.0

const FILE_BY_CLASS := {
	"Vanguard": "vanguard.png",
	"Astral Warden": "astral_warden.png",
	"Shadow Operative": "shadow_operative.png",
	"Void Runner": "void_runner.png",
	"Technomancer": "technomancer.png",
	"Cosmic Engineer": "cosmic_engineer.png",
}

static var _cache: Dictionary = {}


static func has(class_key: String) -> bool:
	return FILE_BY_CLASS.has(str(class_key).strip_edges())


static func make(class_key: String, size_px: float = DEFAULT_SIZE) -> TextureRect:
	var tr := TextureRect.new()
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.custom_minimum_size = Vector2(size_px, size_px)
	tr.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	tr.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	# Pixel-art emblems — nearest keeps bevel/edges crisp when scaled.
	tr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	tr.texture_repeat = CanvasItem.TEXTURE_REPEAT_DISABLED
	tr.clip_contents = false
	tr.texture = texture(class_key)
	tr.modulate = Color.WHITE
	return tr


static func texture(class_key: String) -> Texture2D:
	var key := str(class_key).strip_edges()
	if _cache.has(key):
		return _cache[key] as Texture2D
	var tex: Texture2D = null
	var file_name := str(FILE_BY_CLASS.get(key, ""))
	if not file_name.is_empty():
		var path := ICON_DIR + file_name
		if ResourceLoader.exists(path):
			tex = load(path) as Texture2D
		if tex == null:
			var abs_path := ProjectSettings.globalize_path(path)
			var img := Image.new()
			if FileAccess.file_exists(path) and img.load(abs_path) == OK:
				tex = ImageTexture.create_from_image(img)
	if tex == null:
		var img := Image.create(24, 24, false, Image.FORMAT_RGBA8)
		img.fill(Color(1, 1, 1, 0.35))
		tex = ImageTexture.create_from_image(img)
	_cache[key] = tex
	return tex
