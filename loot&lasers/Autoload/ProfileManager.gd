extends Node
## Phase 3 — Player profile service (Nakama-backed).
## UI / AuthManager → ProfileManager → NakamaManager.call_authenticated_rpc → Nakama.
## Does not own inventory, currency, missions, arena, or Node character CRUD.

signal profile_changed(profile: Dictionary)
signal profile_error(error: String)

const RPC_GET := "profile_get"
const RPC_UPDATE := "profile_update"

var profile: Dictionary = {}
var _save_busy := false
var _load_busy := false


func _ready() -> void:
	print("[ProfileManager] ready")


func has_profile() -> bool:
	return not profile.is_empty() and str(profile.get("account_id", "")) != ""


func clear_local() -> void:
	profile = {}


## Load profile; create once on the server if missing.
func ensure_profile() -> Dictionary:
	return await load_profile()


func load_profile() -> Dictionary:
	if _load_busy:
		return _fail("Profile load already in progress")
	_load_busy = true
	var res: Dictionary = await NakamaManager.invoke_rpc(RPC_GET, {})
	_load_busy = false
	return _apply_rpc_result(res, true)


## Patch allowlisted fields only. Rejects unknown keys server-side.
## Not for per-frame / per-keystroke saves — callers must debounce.
func update_profile(fields: Dictionary) -> Dictionary:
	if _save_busy:
		return _fail("Profile save already in progress")
	if typeof(fields) != TYPE_DICTIONARY or fields.is_empty():
		return _fail("No profile fields to update")

	_save_busy = true
	var res: Dictionary = await NakamaManager.invoke_rpc(RPC_UPDATE, fields)
	_save_busy = false
	return _apply_rpc_result(res, true)


func update_display_name(display_name: String) -> Dictionary:
	return await update_profile({"display_name": display_name})


func set_selected_character_id(character_id: String) -> Dictionary:
	return await update_profile({"selected_character_id": str(character_id)})


func update_appearance(appearance: Dictionary) -> Dictionary:
	return await update_profile({"appearance": appearance})


func update_avatar_portrait(avatar_portrait: String) -> Dictionary:
	return await update_profile({"avatar_portrait": avatar_portrait})


func _apply_rpc_result(res: Dictionary, emit_ok: bool) -> Dictionary:
	if typeof(res) != TYPE_DICTIONARY:
		var bad := _fail("Malformed profile response")
		profile_error.emit(str(bad.error))
		return bad

	var success := bool(res.get("success", false))
	if not success:
		var err := str(res.get("error", "Profile request failed"))
		profile_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status_code", 0)),
		}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		var malformed := _fail("Malformed profile data")
		profile_error.emit(str(malformed.error))
		return malformed

	profile = (data as Dictionary).duplicate(true)
	if emit_ok:
		profile_changed.emit(profile)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": profile,
		"status_code": int(res.get("status_code", 200)),
	}


func _fail(error: String, status_code: int = 0) -> Dictionary:
	return {
		"ok": false,
		"success": false,
		"error": error,
		"data": {},
		"status_code": status_code,
	}
