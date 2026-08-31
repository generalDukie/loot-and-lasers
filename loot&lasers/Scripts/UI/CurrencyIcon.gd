extends RefCounted
class_name CurrencyIcon
## High-res currency glyphs for the operative console readouts.

const ICON_DIR := "res://Assets/Icons/currency/"
const DEFAULT_SIZE := 20.0
## Imported SVG raster scale (see Assets/Icons/currency/*.svg.import svg/scale).
const SVG_IMPORT_SCALE := 16.0
const SVG_VIEWBOX := 24.0

static var _cache: Dictionary = {}


## Wallet / Crystal Store gold for Nova Crystals.
const NOVA_GOLD := Color("#FFD700")
## Wallet stardust fuchsia (matches GameData.STARDUST_COLOR).
const STARDUST_FUCHSIA := Color("#E879F9")
## Wallet fuel neon green.
const FUEL_GREEN := Color("#39FF14")


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
	tr.texture = texture(icon_id, size)
	return tr


static func texture(icon_id: String, size: float = DEFAULT_SIZE) -> Texture2D:
	return _texture(icon_id, size)


## Prefix (or suffix) a cost button with a currency glyph (set `btn.text` without emoji first).
static func apply_button_cost(
	btn: Button,
	size: float = 16.0,
	icon_id: String = "nova",
	trailing: bool = false
) -> void:
	if btn == null or not is_instance_valid(btn):
		return
	btn.icon = texture(icon_id, size)
	btn.expand_icon = true
	btn.icon_alignment = HORIZONTAL_ALIGNMENT_RIGHT if trailing else HORIZONTAL_ALIGNMENT_LEFT
	btn.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
	btn.add_theme_constant_override("icon_max_width", int(round(size)))
	btn.add_theme_constant_override("h_separation", 4)
	# Glyph SVGs are already tinted; force every Button icon state to white or the
	# crystal only appears while pressed (theme icon_normal_color is black/empty).
	UiIcon.apply_button_icon_colors(btn, Color.WHITE)


static func apply_stardust_button_cost(btn: Button, size: float = 16.0, trailing: bool = false) -> void:
	apply_button_cost(btn, size, "stardust", trailing)


## Icon + amount row for price chips / balance labels.
static func make_amount_row(
	amount: Variant,
	size: float = 16.0,
	tint: Color = NOVA_GOLD,
	font_size: int = 15,
	icon_id: String = "nova"
) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	row.alignment = BoxContainer.ALIGNMENT_BEGIN
	row.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(make(icon_id, size))
	var lab := Label.new()
	lab.text = NumberDisplay.currency_amount(amount, icon_id)
	lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", font_size)
	lab.add_theme_color_override("font_color", tint.lightened(0.12))
	row.add_child(lab)
	return row


static func make_stardust_amount_row(
	amount: Variant,
	size: float = 16.0,
	font_size: int = 15
) -> HBoxContainer:
	return make_amount_row(amount, size, STARDUST_FUCHSIA, font_size, "stardust")


## True for Lucide/nav asset ids and currency glyph keys.
static func is_asset_glyph(glyph: String) -> bool:
	var g := glyph.strip_edges().to_lower()
	if g.is_empty():
		return false
	if g == "nova" or g == "stardust" or g == "fuel":
		return true
	for i in g.length():
		var ch := g[i]
		var ok := (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") or ch == "-"
		if not ok:
			return false
	return true


## Fill a CenterContainer (or any Control) with currency / Lucide / emoji glyph.
static func fill_glyph_host(
	host: Control,
	glyph: String,
	size: float = 32.0,
	tint: Color = Color.WHITE
) -> void:
	if host == null or not is_instance_valid(host):
		return
	while host.get_child_count() > 0:
		var c := host.get_child(0)
		host.remove_child(c)
		c.free()
	var g := glyph.strip_edges()
	if g.is_empty():
		g = "orbit"
	var key := g.to_lower()
	if key == "nova" or key == "stardust" or key == "fuel" or g == "✦" or g == "✨":
		var currency_id := "stardust" if (g == "✦" or g == "✨" or key == "stardust") else key
		host.add_child(make(currency_id, size))
		return
	if is_asset_glyph(g):
		host.add_child(UiIcon.make(g, tint, size))
		return
	var lab := Label.new()
	lab.text = g
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", int(round(size * 0.9)))
	host.add_child(lab)


static func planet_uses_nova_glyph(planet: Dictionary) -> bool:
	var g := str(planet.get("icon", "")).strip_edges()
	return g.to_lower() == "nova"


## Apply planet chart glyph onto a world button (Nova / Lucide / emoji).
static func apply_planet_button_glyph(btn: Button, planet: Dictionary, font_size: int = 23) -> void:
	if btn == null or not is_instance_valid(btn):
		return
	var g := str(planet.get("icon", "orbit")).strip_edges()
	var tint: Color = planet.get("color", ClientUi.CYAN) if planet.get("color", null) is Color else ClientUi.CYAN
	if g.to_lower() == "nova":
		btn.text = ""
		btn.icon = texture("nova", float(font_size))
		btn.expand_icon = true
		btn.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		btn.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
		btn.add_theme_constant_override("icon_max_width", font_size)
		return
	if is_asset_glyph(g):
		btn.text = ""
		btn.icon = UiIcon.texture(g)
		btn.expand_icon = true
		btn.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		btn.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
		btn.add_theme_constant_override("icon_max_width", font_size)
		UiIcon.apply_button_icon_colors(btn, tint)
		return
	btn.icon = null
	btn.text = g if not g.is_empty() else "orbit"
	btn.add_theme_font_size_override("font_size", font_size)


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
