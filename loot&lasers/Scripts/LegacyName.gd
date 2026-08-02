class_name LegacyName
extends RefCounted
## Surname / family display — mirrors src/lib/legacyName.js.


static func normalize_display(mode: Variant) -> String:
	return "family" if str(mode) == "family" else "surname"


static func full_name(character: Dictionary) -> String:
	var first := str(character.get("name", ""))
	var last := str(character.get("legacy_name", "")).strip_edges()
	if last.is_empty():
		# Fall back to account legacy name when character field empty.
		last = str(AuthManager.user.get("legacy_name", "")).strip_edges()
	var mode := normalize_display(character.get("legacy_display", AuthManager.user.get("legacy_display", "surname")))
	if last.is_empty() or mode == "family":
		return first
	return "%s %s" % [first, last]


static func profile_display_name(character: Dictionary) -> String:
	var first := str(character.get("name", ""))
	var last := str(character.get("legacy_name", "")).strip_edges()
	if last.is_empty():
		last = str(AuthManager.user.get("legacy_name", "")).strip_edges()
	var mode := normalize_display(character.get("legacy_display", AuthManager.user.get("legacy_display", "surname")))
	if mode == "family" and not last.is_empty():
		return "the %s family" % last
	if not last.is_empty():
		return "%s %s" % [first, last]
	return first
