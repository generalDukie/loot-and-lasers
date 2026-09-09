extends RefCounted
class_name UiIcon
## Shared minimalist neon (Lucide) icons for chrome, page titles, and hub tiles.
## Reuses Assets/Icons/nav white-stroke SVGs tinted via theme/modulate — same pack as NavIcon.

const ICON_DIR := "res://Assets/Icons/nav/"
const DEFAULT_SIZE := 22.0


## Semantic aliases → lucide file id (without .svg).
const ALIAS := {
	"notifications": "bell",
	"bell": "bell",
	"settings": "settings",
	"gear": "settings",
	"close": "x",
	"x": "x",
	"check_all": "check-check",
	"check-check": "check-check",
	"check": "check",
	"calendar": "calendar",
	"daily": "calendar",
	"lock": "lock",
	"locked": "lock",
	"unlock": "unlock",
	"unlocked": "unlock",
	"trash": "trash-2",
	"delete": "trash-2",
	"undo": "undo-2",
	"swords": "swords",
	"combat": "swords",
	"arena": "zap",
	"gift": "gift",
	"book": "book-open",
	"book-open": "book-open",
	"codex": "book-open",
	"volume": "volume-2",
	"sfx": "volume-2",
	"music": "music",
	"vibrate": "vibrate",
	"flame": "flame",
	"streak": "flame",
	"shield": "shield",
	"target": "target",
	"skull": "skull",
	"star": "star",
	"warning": "triangle-alert",
	"alert": "triangle-alert",
	"package": "package",
	"loot": "package",
	"sparkles": "sparkles",
	"rainbow": "rainbow",
	"luminae": "rainbow",
	"clock": "clock",
	"timer": "timer",
	"map": "map",
	"scroll": "scroll-text",
	"antenna": "antenna",
	"radio": "radio",
	"sofa": "sofa",
	"lounge": "sofa",
	"money": "circle-dollar-sign",
	"dice": "dices",
	"casino": "dice-5",
	"landmark": "landmark",
	"nexus": "satellite",
	"inbox": "inbox",
	"mail": "mail",
	"send": "send",
	"wrench": "wrench",
	"ban": "ban",
	"ok": "circle-check",
	"fail": "circle-x",
	"loader": "loader",
	"loader-circle": "loader-circle",
	"busy": "loader-circle",
	"log-in": "log-in",
	"login": "log-in",
	"fuel": "fuel",
	"map-pin": "map-pin",
	"location": "map-pin",
	"user-round": "user-round",
	"alien": "alien",
	"ghost": "ghost",
	"hard-hat": "hard-hat",
	"venetian-mask": "venetian-mask",
	"bird": "bird",
	"cat": "cat",
	"dog": "dog",
	"rabbit": "rabbit",
	"rat": "rat",
	"squirrel": "squirrel",
	"snail": "snail",
	"worm": "worm",
	"fish": "fish",
	"shell": "shell",
	"origami": "origami",
	"bone": "bone",
	"sparkle": "sparkle",
	"diamond": "diamond",
	"diamond-fill": "diamond-fill",
	"badge-alert": "badge-alert",
	"list-checks": "list-checks",
	"asterisk": "asterisk",
	"ship": "ship",
	"magnet": "magnet",
	"compass": "compass",
	"palette": "palette",
	"paw-print": "paw-print",
	"paw": "paw-print",
	"coins": "coins",
	"biceps-flexed": "biceps-flexed",
	"biceps": "biceps-flexed",
	"syringe": "syringe",
	"party-popper": "party-popper",
	"shopping-cart": "shopping-cart",
	"circle-dot": "circle-dot",
	"chart-no-axes-combined": "chart-no-axes-combined",
	"chart": "chart-no-axes-combined",
	"torus": "torus",
	"flag": "flag",
	"dice-1": "dice-1",
	"dice-2": "dice-2",
	"dice-3": "dice-3",
	"dice-4": "dice-4",
	"dice-5": "dice-5",
	"dice-6": "dice-6",
	"triangle": "triangle",
	"sword": "sword",
	"axe": "axe",
	"hammer": "hammer",
	"heart": "heart",
	"brain": "brain",
	"wind": "wind",
	"clover": "clover",
	"bot": "bot",
	"drama": "drama",
	"telescope": "telescope",
	"satellite": "satellite",
	"eye": "eye",
	"video": "eye",
	"display": "eye",
	"earth": "earth",
	"house": "house",
	"home": "house",
	"tornado": "tornado",
	"circle-dot-dashed": "circle-dot-dashed",
	"snowflake": "snowflake",
	"cuboid": "cuboid",
	"mountain": "mountain",
	"circle": "circle",
	"bug": "bug",
	"infinity": "infinity",
	"building": "building-2",
	"hourglass": "hourglass",
	"plus": "plus",
	"minus": "minus",
	"refresh": "refresh-cw",
	"play": "play",
	"pause": "pause",
	"skip": "skip-forward",
	"hero": "user",
	"user": "user",
	"friends": "users",
	"users": "users",
	"chat": "message-square",
	"messages": "message-square",
	"rocket": "rocket",
	"galaxy": "orbit",
	"void": "orbit",
	"orbit": "orbit",
	"mine": "pickaxe",
	"mining": "pickaxe",
	"pickaxe": "pickaxe",
	"shop": "shopping-bag",
	"market": "shopping-bag",
	"shopping": "shopping-bag",
	"trophy": "trophy",
	"ranks": "trophy",
	"progress": "trophy",
	"crown": "crown",
	"leaderboard": "trophy",
	"crosshair": "crosshair",
	"cpu": "cpu",
	"beer": "beer",
	"cantina": "beer",
	"zap": "zap",
	"guild": "users",
	"crystal": "sparkles",
	"collectibles": "package",
}


static func resolve_id(icon_id: String) -> String:
	var key := icon_id.strip_edges().to_lower()
	if key.is_empty():
		return "user"
	if ALIAS.has(key):
		return str(ALIAS[key])
	return key


static func texture(icon_id: String) -> Texture2D:
	var key := icon_id.strip_edges().to_lower()
	if key == "stardust":
		return CurrencyIcon.texture("stardust")
	if key == "fuel":
		return CurrencyIcon.texture("fuel")
	if key == "nova":
		return CurrencyIcon.texture("nova")
	return NavIcon.texture_for(resolve_id(icon_id))


static func make(icon_id: String, tint: Color = Color(ClientUi.CYAN), size: float = DEFAULT_SIZE) -> TextureRect:
	var key := icon_id.strip_edges().to_lower()
	if key == "stardust":
		return CurrencyIcon.make("stardust", size)
	if key == "fuel":
		return CurrencyIcon.make("fuel", size)
	if key == "nova":
		return CurrencyIcon.make("nova", size)
	return NavIcon.make(resolve_id(icon_id), tint, size)


static func set_tint(tr: TextureRect, tint: Color) -> void:
	NavIcon.set_tint(tr, tint)


static func apply_button_icon_colors(btn: Button, tint: Color) -> void:
	if btn == null:
		return
	btn.add_theme_color_override("icon_normal_color", tint)
	btn.add_theme_color_override("icon_hover_color", tint.lightened(0.12))
	btn.add_theme_color_override("icon_pressed_color", tint.darkened(0.08))
	btn.add_theme_color_override("icon_hover_pressed_color", tint.darkened(0.08))
	btn.add_theme_color_override("icon_focus_color", tint)
	btn.add_theme_color_override("icon_disabled_color", Color(tint.r, tint.g, tint.b, 0.35))


## Icon-only button (settings / notification FAB). Keeps tooltip + click area.
## Call this *after* apply_ghost_button / other style helpers — those set large
## content margins that would otherwise clip a centered Lucide icon.
static func make_icon_button(
	icon_id: String,
	tint: Color,
	size: float = 28.0,
	tooltip: String = ""
) -> Button:
	var btn := Button.new()
	btn.text = ""
	btn.tooltip_text = tooltip
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size = Vector2(maxi(40, int(size + 16.0)), maxi(36, int(size + 12.0)))
	btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	set_button_icon(btn, icon_id, tint, size)
	return btn


static func set_button_icon(btn: Button, icon_id: String, tint: Color, size: float = 28.0) -> void:
	if btn == null or not is_instance_valid(btn):
		return
	btn.text = ""
	var key := icon_id.strip_edges().to_lower()
	btn.icon = texture(icon_id)
	btn.expand_icon = true
	btn.alignment = HORIZONTAL_ALIGNMENT_CENTER
	btn.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	btn.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
	btn.add_theme_constant_override("icon_max_width", int(size))
	# Zero content margins so expand_icon centers in the full hit area (FAB / chrome).
	# Must run after ghost/painted styles — their px(14)/px(8) margins clip icons.
	for state in ["normal", "hover", "pressed", "disabled", "focus"]:
		var sb := btn.get_theme_stylebox(state)
		var flat: StyleBoxFlat
		if sb is StyleBoxFlat:
			flat = (sb as StyleBoxFlat).duplicate() as StyleBoxFlat
		else:
			flat = StyleBoxFlat.new()
			flat.bg_color = Color(0, 0, 0, 0)
			flat.set_corner_radius_all(8)
		flat.content_margin_left = 0
		flat.content_margin_right = 0
		flat.content_margin_top = 0
		flat.content_margin_bottom = 0
		btn.add_theme_stylebox_override(state, flat)
	# Currency glyphs are baked colors — don't multiply with chrome tint.
	var baked := key == "stardust" or key == "fuel" or key == "nova"
	apply_button_icon_colors(btn, Color.WHITE if baked else tint)
	btn.set_meta("ui_icon_id", key if baked else resolve_id(icon_id))


## Leading Lucide icon beside existing button text (Fight / Skip / etc.).
static func apply_leading_icon(btn: Button, icon_id: String, tint: Color, size: float = 20.0) -> void:
	if btn == null or not is_instance_valid(btn):
		return
	var key := icon_id.strip_edges().to_lower()
	btn.icon = texture(icon_id)
	btn.expand_icon = true
	btn.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	btn.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
	btn.add_theme_constant_override("icon_max_width", int(round(size)))
	var baked := key == "stardust" or key == "fuel" or key == "nova"
	apply_button_icon_colors(btn, Color.WHITE if baked else tint)
	btn.set_meta("ui_icon_id", key if baked else resolve_id(icon_id))


const ITEM_NAME_BADGE_GAP_PX := 4
const ITEM_NAME_BADGE_MIN_PX := 12.0
## Keeps the name visible when a parent sizes to content or the badge texture is large.
const ITEM_NAME_LABEL_MIN_PX := 32.0


static func make_manufacturer_badge(item: Dictionary, size: float) -> TextureRect:
	var company_id := CompanyRules.manufacturer_id(item)
	var badge := make(
		CompanyRules.manufacturer_badge_icon(company_id),
		CompanyRules.manufacturer_badge_color(company_id),
		size
	)
	badge.custom_minimum_size = Vector2(size, size)
	badge.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	badge.size_flags_stretch_ratio = 0.0
	return badge


## Item name with the company badge immediately beside it.
## Pass sell_tab=true to hide the badge on non-shipment-eligible Gear.
static func make_item_name_row(
	item: Dictionary,
	font_size: int,
	font_color: Color,
	opts: Dictionary = {}
) -> HBoxContainer:
	var sell_tab := bool(opts.get("sell_tab", false))
	var icon_size := float(opts.get("icon_size", maxf(ITEM_NAME_BADGE_MIN_PX, float(font_size) - 4.0)))
	var alignment := int(opts.get("alignment", HORIZONTAL_ALIGNMENT_LEFT))
	var autowrap := int(opts.get("autowrap", TextServer.AUTOWRAP_OFF))
	var display_font := bool(opts.get("display_font", true))
	var expand := bool(opts.get("expand", true))
	## Shrink-to-content rows (inspect hover) must not clip or the name width becomes 0.
	var clip := bool(opts.get("clip", expand))
	var fallback := str(opts.get("fallback", "Item"))
	var max_lines := int(opts.get("max_lines", 1))

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", ITEM_NAME_BADGE_GAP_PX)
	if expand:
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	else:
		row.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	if alignment == HORIZONTAL_ALIGNMENT_CENTER:
		row.alignment = BoxContainer.ALIGNMENT_CENTER
	elif alignment == HORIZONTAL_ALIGNMENT_RIGHT:
		row.alignment = BoxContainer.ALIGNMENT_END
	else:
		row.alignment = BoxContainer.ALIGNMENT_BEGIN

	if CompanyRules.should_show_manufacturer_badge(item, sell_tab):
		row.add_child(make_manufacturer_badge(item, icon_size))

	var lab := Label.new()
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.text = str(item.get("name", fallback))
	lab.horizontal_alignment = alignment
	lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lab.autowrap_mode = autowrap
	lab.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if expand:
		lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lab.custom_minimum_size.x = ITEM_NAME_LABEL_MIN_PX
	else:
		lab.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	if clip:
		lab.clip_text = true
		if autowrap == TextServer.AUTOWRAP_OFF:
			lab.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	if max_lines > 0:
		lab.max_lines_visible = max_lines
	lab.add_theme_font_size_override("font_size", font_size)
	lab.add_theme_color_override("font_color", font_color)
	if display_font:
		ClientUi.apply_display_font(lab)
	else:
		ClientUi.apply_body_font(lab)
	if bool(opts.get("inspect_wrap", false)):
		lab.set_meta("inspect_wrap", true)
		if opts.has("inspect_wrap_inset"):
			lab.set_meta("inspect_wrap_inset", float(opts.get("inspect_wrap_inset", 0.0)))
	row.add_child(lab)
	row.set_meta("name_label", lab)
	return row


## Title row: neon icon + text label (replaces "🔔 Notifications" patterns).
static func make_title_row(
	icon_id: String,
	title: String,
	tint: Color = Color(ClientUi.TEXT),
	font_size: int = 28,
	icon_size: float = 28.0
) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.add_child(make(icon_id, tint, icon_size))
	var lab := Label.new()
	lab.text = title
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lab.add_theme_font_size_override("font_size", font_size)
	lab.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(lab)
	row.add_child(lab)
	row.set_meta("title_label", lab)
	return row


## Hub / tile icon at a fixed size.
static func make_tile_icon(icon_id: String, tint: Color, size: float = 36.0) -> TextureRect:
	return make(icon_id, tint, size)
