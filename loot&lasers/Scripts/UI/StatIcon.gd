extends RefCounted
class_name StatIcon
## Hexagonal attribute badge textures (Strength / Agility / Intellect / Luck / Vitality).
## Artwork is full-color — do not tint/modulate.

const ICON_DIR := "res://Assets/Icons/stats/"
const DEFAULT_SIZE := 20.0
const VALID := ["strength", "agility", "intellect", "vitality", "luck"]

static var _cache: Dictionary = {}


static func has(stat: String) -> bool:
	return VALID.has(stat.strip_edges().to_lower())


static func make(stat: String, size_px: float = DEFAULT_SIZE) -> TextureRect:
	var tr := TextureRect.new()
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.custom_minimum_size = Vector2(size_px, size_px)
	tr.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	tr.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tr.texture = texture(stat)
	# Preserve authored badge colors.
	tr.modulate = Color.WHITE
	return tr


static func texture(stat: String) -> Texture2D:
	var key := stat.strip_edges().to_lower()
	if _cache.has(key):
		return _cache[key] as Texture2D
	var tex: Texture2D = null
	var path := ICON_DIR + key + ".png"
	if ResourceLoader.exists(path):
		tex = load(path) as Texture2D
	if tex == null:
		# Works before Godot writes .import sidecars on first editor open.
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


## Icon + label row for places that previously concatenated emoji into a Label.
static func make_labeled(
	stat: String,
	text: String,
	icon_size: float = 14.0,
	font_size: int = 12,
	font_color: Color = Color.WHITE,
	separation: int = 4
) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", separation)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	if has(stat):
		row.add_child(make(stat, icon_size))
	var lab := Label.new()
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.text = text
	lab.add_theme_font_size_override("font_size", font_size)
	lab.add_theme_color_override("font_color", font_color)
	ClientUi.apply_body_font(lab)
	row.add_child(lab)
	return row
