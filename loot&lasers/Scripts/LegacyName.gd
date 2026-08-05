class_name LegacyName
extends RefCounted
## Surname / family display — mirrors src/lib/legacyName.js.


static func normalize_display(mode: Variant) -> String:
	return "family" if str(mode) == "family" else "surname"


## Godot str(null) → "<null>"; JSON nulls must not appear in HUD names.
static func clean_text(value: Variant) -> String:
	if value == null:
		return ""
	var s := str(value).strip_edges()
	if s.is_empty():
		return ""
	var low := s.to_lower()
	if low == "null" or low == "<null>" or low == "nil" or low == "undefined":
		return ""
	return s


static func family_label(legacy_name: Variant) -> String:
	var last := clean_text(legacy_name)
	if last.is_empty():
		return ""
	return "The %s Family" % last


static func _account_legacy_name() -> String:
	if AuthManager == null:
		return ""
	return clean_text(AuthManager.user.get("legacy_name", ""))


## Catch-up prompt: account already runs multiple operatives with no surname.
static func needs_legacy_name(character_count: int = -1) -> bool:
	if not _account_legacy_name().is_empty():
		return false
	if character_count < 0:
		return false
	return character_count >= 2


## Create flow: surname is mandatory from the second operative onward.
static func needs_legacy_name_for_create(existing_character_count: int = -1) -> bool:
	if not _account_legacy_name().is_empty():
		return false
	if existing_character_count < 0:
		return false
	return existing_character_count >= 1


## Account values may only backfill our own operatives — never another player's
## card, or every stranger would inherit the viewer's surname.
static func _is_own_character(character: Dictionary) -> bool:
	if AuthManager == null:
		return false
	var uid := str(AuthManager.user.get("id", "")).strip_edges()
	var owner := str(character.get("created_by_id", "")).strip_edges()
	if not uid.is_empty() and not owner.is_empty():
		return owner == uid
	if owner.is_empty() and GameManager != null:
		var cid := str(character.get("id", "")).strip_edges()
		return not cid.is_empty() and cid == GameManager.selected_character_id()
	return false


static func _legacy_from(character: Dictionary) -> String:
	var last := clean_text(character.get("legacy_name", ""))
	if last.is_empty() and _is_own_character(character):
		last = _account_legacy_name()
	return last


static func _display_mode(character: Dictionary) -> String:
	var raw: Variant = character.get("legacy_display", null)
	if raw == null and _is_own_character(character):
		raw = AuthManager.user.get("legacy_display", "surname")
	return normalize_display(raw)


static func full_name(character: Dictionary) -> String:
	var first := clean_text(character.get("name", ""))
	var last := _legacy_from(character)
	var mode := _display_mode(character)
	if last.is_empty() or mode == "family":
		return first
	if first.is_empty():
		return last
	return "%s %s" % [first, last]


## Small line under the hero gear pane in family mode.
static func hero_family_line(character: Dictionary) -> String:
	var last := _legacy_from(character)
	if last.is_empty() or _display_mode(character) != "family":
		return ""
	return family_label(last)


## Sub-line under a family-mode public profile headline ("The X Family"),
## naming the operative the headline hides. Empty in surname mode.
static func profile_operative_line(character: Dictionary) -> String:
	var first := clean_text(character.get("name", ""))
	if first.is_empty() or _legacy_from(character).is_empty():
		return ""
	if _display_mode(character) != "family":
		return ""
	return "Operative %s" % first


## Public profile headline — always keeps the account recognizable to others.
static func profile_display_name(character: Dictionary) -> String:
	var first := clean_text(character.get("name", ""))
	var last := _legacy_from(character)
	var mode := _display_mode(character)
	if mode == "family" and not last.is_empty():
		return family_label(last)
	if not last.is_empty():
		if first.is_empty():
			return last
		return "%s %s" % [first, last]
	return first
