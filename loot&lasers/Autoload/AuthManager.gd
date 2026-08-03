extends Node
## Session / JWT + auth helpers for the Godot client.
## Node API (GameApiClient) remains the source of truth for gameplay auth.
## NakamaManager handles the parallel Nakama session used for realtime/RPC.

signal auth_changed(logged_in: bool)
signal user_changed(user: Dictionary)

const CONFIG_PATH := "user://godot_client.cfg"

var access_token: String = ""
var user: Dictionary = {}


func _ready() -> void:
	_load_token()
	print("[AuthManager] ready (token=%s)" % ("yes" if not access_token.is_empty() else "no"))


func is_logged_in() -> bool:
	return not access_token.is_empty()


func login(email: String, password: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.request(
		"POST",
		"/api/auth/login",
		{"email": email.strip_edges(), "password": password},
		false
	)
	if res.ok:
		_apply_auth_payload(res.data)
	return res


func register(email: String, password: String) -> Dictionary:
	return await GameApiClient.request(
		"POST",
		"/api/auth/register",
		{"email": email.strip_edges(), "password": password},
		false
	)


func verify_otp(email: String, otp_code: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.request(
		"POST",
		"/api/auth/verify-otp",
		{"email": email.strip_edges(), "otpCode": otp_code.strip_edges()},
		false
	)
	if res.ok:
		_apply_auth_payload(res.data)
	return res


func resend_otp(email: String) -> Dictionary:
	return await GameApiClient.request(
		"POST",
		"/api/auth/resend-otp",
		{"email": email.strip_edges()},
		false
	)


func fetch_me() -> Dictionary:
	var res: Dictionary = await GameApiClient.request("GET", "/api/auth/me", null, true)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		user = res.data
		user_changed.emit(user)
	elif res.status == 401:
		clear_session()
	return res


func update_me(patch: Dictionary) -> Dictionary:
	var res: Dictionary = await GameApiClient.request("PATCH", "/api/auth/me", patch, true)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		user = res.data
		user_changed.emit(user)
	return res


func list_characters() -> Dictionary:
	if user.is_empty():
		var me_res: Dictionary = await fetch_me()
		if not me_res.ok:
			return me_res
	var uid := str(user.get("id", ""))
	return await GameApiClient.request(
		"POST",
		"/api/entities/Character/filter",
		{"query": {"created_by_id": uid}, "sort": "-created_date", "limit": 10},
		true
	)


func create_character(payload: Dictionary) -> Dictionary:
	return await GameApiClient.request("POST", "/api/entities/Character", payload, true)


func select_character(character_id: String) -> Dictionary:
	var res: Dictionary = await update_me({"active_character_id": character_id})
	# Best-effort Nakama profile sync — Node active_character_id remains gameplay SoT.
	if res.ok and ProfileManager != null and NakamaManager.is_authenticated():
		var sync_res: Dictionary = await ProfileManager.set_selected_character_id(character_id)
		if not sync_res.get("success", false):
			print("[AuthManager] WARNING: Nakama profile selected_character_id sync failed — %s" % str(sync_res.get("error", "")))
	return res


func get_character(character_id: String) -> Dictionary:
	return await GameApiClient.request("GET", "/api/entities/Character/%s" % character_id, null, true)


func list_items(character_id: String = "", limit: int = 200) -> Dictionary:
	var cid := character_id if not character_id.is_empty() else str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return {"ok": false, "status": 0, "error": "No character id", "data": []}
	return await GameApiClient.request(
		"POST",
		"/api/entities/Item/filter",
		{"query": {"character_id": cid}, "sort": "-created_date", "limit": limit},
		true
	)


func patch_item(item_id: String, patch: Dictionary) -> Dictionary:
	return await GameApiClient.request("PATCH", "/api/entities/Item/%s" % item_id, patch, true)


func patch_character(character_id: String, patch: Dictionary) -> Dictionary:
	return await GameApiClient.request("PATCH", "/api/entities/Character/%s" % character_id, patch, true)


## Equip an unequipped bag item. DEPRECATED — use EquipmentManager.equip_item (Nakama).
func equip_item(item_id: String) -> Dictionary:
	push_warning("[AuthManager] equip_item is disabled — use EquipmentManager.equip_item")
	return {
		"ok": false,
		"error": "Legacy equip path disabled — use EquipmentManager",
		"data": {},
		"status": 410,
	}


## Unequip a worn item into the bag. DEPRECATED — use EquipmentManager.unequip_item (Nakama).
func unequip_item(item_id: String) -> Dictionary:
	push_warning("[AuthManager] unequip_item is disabled — use EquipmentManager.unequip_item")
	return {
		"ok": false,
		"error": "Legacy unequip path disabled — use EquipmentManager",
		"data": {},
		"status": 410,
	}


## Apply a stim: deletes the item and patches character.active_buffs.
func use_consumable(item_id: String) -> Dictionary:
	if item_id.is_empty():
		return {"ok": false, "error": "Missing item_id", "data": {}}
	var res: Dictionary = await GameApiClient.invoke("UseConsumable", {"item_id": item_id})
	if not res.ok:
		var err := str(res.get("error", "UseConsumable failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		return {"ok": false, "error": err, "status": res.get("status", 0), "data": res.get("data", {})}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
	return {"ok": true, "error": "", "data": data, "status": 200}


## Manually remove an active Stim effect (discards remaining duration).
func dismiss_active_buff(stat: String, expires_at: String = "", name: String = "") -> Dictionary:
	if stat.is_empty():
		return {"ok": false, "error": "Missing stat", "data": {}}
	var body := {"stat": stat}
	if not expires_at.is_empty():
		body["expires_at"] = expires_at
	if not name.is_empty():
		body["name"] = name
	var res: Dictionary = await GameApiClient.invoke("DismissActiveBuff", body)
	if not res.ok:
		var err := str(res.get("error", "DismissActiveBuff failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		return {"ok": false, "error": err, "status": res.get("status", 0), "data": res.get("data", {})}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
	return {"ok": true, "error": "", "data": data, "status": 200}


func logout() -> void:
	if not access_token.is_empty():
		await GameApiClient.request("POST", "/api/auth/logout", {}, true)
	# Clear parallel Nakama session without touching Node gameplay APIs.
	await logout_nakama()
	clear_session()


## Ensure a Nakama session exists (restore saved tokens, else device auth).
## Does not replace email/password login against the Node API.
func ensure_nakama_session() -> Dictionary:
	NakamaManager.initialize_client()
	var res: Dictionary = await NakamaManager.ensure_authenticated()
	if res.get("success", false):
		print("[AuthManager] Nakama session ready user_id=%s" % str(res.get("data", {}).get("user_id", "")))
		# Phase 3: load-or-create slim Nakama profile (idempotent).
		if ProfileManager != null:
			var pref: Dictionary = await ProfileManager.ensure_profile()
			if pref.get("success", false):
				print("[AuthManager] Nakama profile ready account_id=%s" % str(pref.get("data", {}).get("account_id", "")))
			else:
				print("[AuthManager] WARNING: Nakama profile unavailable — %s" % str(pref.get("error", "unknown")))
		# Phase 5: load-or-create zero wallet (does not migrate Character balances).
		if CurrencyManager != null:
			var wres: Dictionary = await CurrencyManager.ensure_wallet()
			if wres.get("success", false):
				print("[AuthManager] Nakama wallet ready")
			else:
				print("[AuthManager] WARNING: Nakama wallet unavailable — %s" % str(wres.get("error", "unknown")))
	else:
		print("[AuthManager] Nakama session unavailable — %s" % str(res.get("error", "unknown")))
	return res


func logout_nakama() -> Dictionary:
	if ProfileManager != null:
		ProfileManager.clear_local()
	if CurrencyManager != null:
		CurrencyManager.clear_local()
	if EquipmentManager != null:
		EquipmentManager.clear_local()
	if MissionManager != null and MissionManager.has_method("clear_nakama_mission_local"):
		MissionManager.clear_nakama_mission_local()
	if NakamaManager == null:
		return {"success": true, "data": {}, "error": "", "status_code": 200}
	return await NakamaManager.logout()


func is_nakama_authenticated() -> bool:
	return NakamaManager != null and NakamaManager.is_authenticated()


func change_password(current_password: String, new_password: String) -> Dictionary:
	return await GameApiClient.request(
		"POST", "/api/auth/change-password",
		{"currentPassword": current_password, "newPassword": new_password},
		true
	)


func request_password_reset(email: String) -> Dictionary:
	return await GameApiClient.request(
		"POST", "/api/auth/reset-password-request",
		{"email": email.strip_edges()},
		false
	)


func reset_password(reset_token: String, new_password: String) -> Dictionary:
	return await GameApiClient.request(
		"POST", "/api/auth/reset-password",
		{"resetToken": reset_token.strip_edges(), "newPassword": new_password},
		false
	)


func clear_session() -> void:
	access_token = ""
	user = {}
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	cfg.set_value("auth", "access_token", "")
	cfg.save(CONFIG_PATH)
	auth_changed.emit(false)
	user_changed.emit(user)


func _apply_auth_payload(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	access_token = str(data.get("access_token", ""))
	user = data.get("user", {}) if typeof(data.get("user", {})) == TYPE_DICTIONARY else {}
	_save_token()
	auth_changed.emit(not access_token.is_empty())
	user_changed.emit(user)


func _save_token() -> void:
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	cfg.set_value("auth", "access_token", access_token)
	cfg.save(CONFIG_PATH)


func _load_token() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) == OK:
		access_token = str(cfg.get_value("auth", "access_token", ""))
