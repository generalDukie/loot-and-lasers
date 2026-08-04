extends Node
## Account presentation projection for Godot.
## Selected character + display/legacy name are Node-authoritative.
## Does not call Nakama RPCs (gameplay dual-authority closed).

signal profile_changed(profile: Dictionary)
signal profile_error(error: String)

var profile: Dictionary = {}
var _save_busy := false
var _load_busy := false


func _ready() -> void:
	print("[ProfileManager] ready (Node projection — no Nakama profile RPCs)")


func has_profile() -> bool:
	return not profile.is_empty() and str(profile.get("account_id", "")) != ""


func clear_local() -> void:
	profile = {}


## Load / synthesize profile from Nakama session id + Node user fields.
func ensure_profile() -> Dictionary:
	return await load_profile()


func load_profile() -> Dictionary:
	if _load_busy:
		return _fail("Profile load already in progress")
	_load_busy = true
	profile = _project_local_profile()
	_load_busy = false
	if not has_profile():
		var bad := _fail("No Nakama session for profile projection")
		profile_error.emit(str(bad.error))
		return bad
	profile_changed.emit(profile)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": profile,
		"status_code": 200,
	}


## Patch allowlisted account fields via Node (never Nakama).
func update_profile(fields: Dictionary) -> Dictionary:
	if _save_busy:
		return _fail("Profile save already in progress")
	if typeof(fields) != TYPE_DICTIONARY or fields.is_empty():
		return _fail("No profile fields to update")

	if fields.has("selected_character_id"):
		return await set_selected_character_id(str(fields.get("selected_character_id", "")))

	if fields.has("display_name") or fields.has("legacy_name"):
		var name := str(fields.get("legacy_name", fields.get("display_name", ""))).strip_edges()
		return await update_display_name(name)

	# Appearance / avatar are presentation-only local cache (no Nakama write).
	_save_busy = true
	for key in fields.keys():
		if key == "appearance" or key == "avatar_portrait":
			profile[key] = fields[key]
	_save_busy = false
	profile_changed.emit(profile)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": profile,
		"status_code": 200,
	}


func update_display_name(display_name: String) -> Dictionary:
	var name := display_name.strip_edges()
	if name.is_empty():
		return _fail("display_name is required")
	if _save_busy:
		return _fail("Profile save already in progress")
	_save_busy = true
	var res: Dictionary = await GameApiClient.invoke("SaveAccountPreferences", {
		"preferences": {"legacy_name": name},
	})
	_save_busy = false
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "Failed to update display name"))
		profile_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status", 0)),
		}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var prefs: Variant = data.get("preferences", {})
	if typeof(prefs) == TYPE_DICTIONARY:
		var legacy := str((prefs as Dictionary).get("legacy_name", name)).strip_edges()
		profile["display_name"] = legacy
		profile["legacy_name"] = legacy
		if AuthManager != null:
			AuthManager.user["legacy_name"] = legacy
			AuthManager.user["full_name"] = legacy
	else:
		profile["display_name"] = name
		profile["legacy_name"] = name
	profile_changed.emit(profile)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": profile,
		"status_code": 200,
	}


## Node users.active_character_id — never Nakama profile.selected_character_id.
func set_selected_character_id(character_id: String) -> Dictionary:
	var cid := str(character_id).strip_edges()
	if cid.is_empty():
		return _fail("character_id required")
	if AuthManager == null:
		return _fail("AuthManager missing")
	var res: Dictionary = await AuthManager.select_character(cid)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "Failed to select character"))
		profile_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status", 0)),
		}
	profile["selected_character_id"] = cid
	profile_changed.emit(profile)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": profile,
		"status_code": 200,
	}


func update_appearance(appearance: Dictionary) -> Dictionary:
	return await update_profile({"appearance": appearance})


func update_avatar_portrait(avatar_portrait: String) -> Dictionary:
	return await update_profile({"avatar_portrait": avatar_portrait})


func _project_local_profile() -> Dictionary:
	var account_id := ""
	if NakamaManager != null and NakamaManager.has_method("get_session_user_id"):
		account_id = str(NakamaManager.get_session_user_id()).strip_edges()
	var display := ""
	var selected := ""
	if AuthManager != null and typeof(AuthManager.user) == TYPE_DICTIONARY:
		display = str(AuthManager.user.get("full_name", "")).strip_edges()
		if display.is_empty():
			display = str(AuthManager.user.get("legacy_name", "")).strip_edges()
		selected = str(AuthManager.user.get("active_character_id", "")).strip_edges()
	if selected.is_empty() and GameManager != null:
		selected = str(GameManager.active_character.get("id", "")).strip_edges()
	if account_id.is_empty():
		return {}
	return {
		"account_id": account_id,
		"display_name": display,
		"legacy_name": display,
		"selected_character_id": selected,
		"source": "node_local_projection",
	}


func _fail(error: String, status_code: int = 0) -> Dictionary:
	return {
		"ok": false,
		"success": false,
		"error": error,
		"data": {},
		"status_code": status_code,
	}
