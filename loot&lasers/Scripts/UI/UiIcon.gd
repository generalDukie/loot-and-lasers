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
	"stardust": "sparkles",
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
	"nexus": "crown",
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
	"leaderboard": "crown",
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
	return NavIcon.texture_for(resolve_id(icon_id))


static func make(icon_id: String, tint: Color = Color(ClientUi.CYAN), size: float = DEFAULT_SIZE) -> TextureRect:
	return NavIcon.make(resolve_id(icon_id), tint, size)


static func set_tint(tr: TextureRect, tint: Color) -> void:
	NavIcon.set_tint(tr, tint)


static func apply_button_icon_colors(btn: Button, tint: Color) -> void:
	if btn == null:
		return
	btn.add_theme_color_override("icon_normal_color", tint)
	btn.add_theme_color_override("icon_hover_color", tint.lightened(0.12))
	btn.add_theme_color_override("icon_pressed_color", tint.darkened(0.08))
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
	apply_button_icon_colors(btn, tint)
	btn.set_meta("ui_icon_id", resolve_id(icon_id))


## Leading Lucide icon beside existing button text (Fight / Skip / etc.).
static func apply_leading_icon(btn: Button, icon_id: String, tint: Color, size: float = 20.0) -> void:
	if btn == null or not is_instance_valid(btn):
		return
	btn.icon = texture(icon_id)
	btn.expand_icon = true
	btn.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	btn.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
	btn.add_theme_constant_override("icon_max_width", int(round(size)))
	apply_button_icon_colors(btn, tint)
	btn.set_meta("ui_icon_id", resolve_id(icon_id))


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
