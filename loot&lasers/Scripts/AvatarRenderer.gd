class_name AvatarRenderer
extends RefCounted
## Procedural portrait factory.

const INK := Color(0.07, 0.04, 0.11)
const RACE_ACCENT := {
	"Zyrathi": Color(1.0, 0.42, 0.1),
	"Cognati": Color(0.0, 0.9, 1.0),
	"Luminae": Color(0.79, 0.72, 1.0),
	"Grothak": Color(1.0, 0.55, 0.26),
	"Synthara": Color(0.62, 0.42, 1.0),
}


static func make_portrait(character: Dictionary, size: float = 56.0) -> Control:
	var portrait := AvatarPortrait.new()
	portrait.custom_minimum_size = Vector2(size, size)
	portrait.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	portrait.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	# Default unclipped so race auras can bleed; visible portrait frames clip at the host.
	portrait.clip_contents = false
	portrait.set_character(character)
	return portrait


static func parse_hex(hex: String, fallback: Color = Color(0.45, 0.65, 0.35)) -> Color:
	var s := hex.strip_edges()
	if s.is_empty():
		return fallback
	if not s.begins_with("#"):
		s = "#" + s
	if Color.html_is_valid(s):
		return Color.html(s)
	return fallback


static func shade(c: Color, amt: float) -> Color:
	var d := amt / 255.0
	return Color(
		clampf(c.r + d, 0.0, 1.0),
		clampf(c.g + d, 0.0, 1.0),
		clampf(c.b + d, 0.0, 1.0),
		1.0
	)


## Bright glow for player accent tone — keeps hue, lifts sat/value so dark picks stay readable.
static func feature_glow(hex: String, fallback: Color = Color(0.72, 0.58, 0.96)) -> Color:
	var c := parse_hex(hex, fallback)
	var h := c.h
	var s := clampf(maxi(c.s, 0.35) * 1.12, 0.4, 1.0)
	var v := clampf(maxi(c.v, 0.42) + 0.2, 0.58, 1.0)
	return Color.from_hsv(h, s, v, 1.0)


static func appearance_of(character: Dictionary) -> Dictionary:
	var a: Variant = character.get("appearance", {})
	return a if typeof(a) == TYPE_DICTIONARY else {}
