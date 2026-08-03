extends Node
## Godot authentication coordinator (dual-stack).
## Auth SoT: Nakama email (:7350).
## Gameplay bridge: Node JWT (:8787) for unmigrated Character/economy APIs.
## Do not remove Node auth routes until each gameplay system has migrated.

signal auth_changed(logged_in: bool)
signal user_changed(user: Dictionary)

const CONFIG_PATH := "user://godot_client.cfg"
const BRIDGE_FLAG_KEY := "nakama_node_bridge_v1"

var access_token: String = ""
var user: Dictionary = {}
var last_auth_diagnostics: Dictionary = {}
var node_bridge_ok := false


func _ready() -> void:
	_load_token()
	print("[AuthManager] ready (nakama=pending node_jwt=%s)" % (
		"yes" if not access_token.is_empty() else "no"
	))


func is_logged_in() -> bool:
	return is_nakama_authenticated()


func has_node_gameplay_session() -> bool:
	return not access_token.is_empty()


## Email/password login via Nakama, then bridge Node JWT.
func login(email: String, password: String) -> Dictionary:
	return await _authenticate_email(email, password, false)


## Create account via Nakama, then bridge Node JWT.
func register(email: String, password: String) -> Dictionary:
	return await _authenticate_email(email, password, true)


func _authenticate_email(email: String, password: String, create: bool) -> Dictionary:
	NakamaManager.initialize_client()
	var diag_before := NakamaManager.get_connection_diagnostics()
	print("[AuthManager] %s start env=%s host=%s:%s method=email" % [
		"register" if create else "login",
		diag_before.get("environment", ""),
		diag_before.get("host", ""),
		diag_before.get("port", 0),
	])
	var nakama_res: Dictionary = await NakamaManager.authenticate_email(email, password, create)
	last_auth_diagnostics = {
		"environment": diag_before.get("environment", ""),
		"host": diag_before.get("host", ""),
		"port": diag_before.get("port", 0),
		"auth_method": "email_register" if create else "email_login",
		"success": bool(nakama_res.get("success", false)),
		"error": str(nakama_res.get("error", "")),
		"node_bridge": false,
	}
	if not bool(nakama_res.get("success", false)):
		print("[AuthManager] %s failed — %s" % [
			last_auth_diagnostics.auth_method, last_auth_diagnostics.error
		])
		return {
			"ok": false,
			"success": false,
			"error": str(nakama_res.get("error", "Authentication failed")),
			"data": {},
			"status": int(nakama_res.get("status_code", 0)),
			"diagnostics": last_auth_diagnostics,
		}

	var clean_email := email.strip_edges().to_lower()
	var bridge: Dictionary = await bridge_node_session(clean_email, password)
	last_auth_diagnostics["node_bridge"] = bool(bridge.get("success", false))
	if not bool(bridge.get("success", false)):
		# Keep Nakama session; surface bridge failure so UI can show a useful error.
		last_auth_diagnostics["success"] = false
		last_auth_diagnostics["error"] = str(bridge.get("error", "Node gameplay bridge failed"))
		print("[AuthManager] WARNING: Nakama OK but Node bridge failed — %s" % last_auth_diagnostics.error)
		return {
			"ok": false,
			"success": false,
			"error": "Signed into Nakama, but Node gameplay bridge failed: %s" % last_auth_diagnostics.error,
			"data": {"nakama_ok": true, "node_bridge": false},
			"status": int(bridge.get("status", 0)),
			"diagnostics": last_auth_diagnostics,
		}

	var post: Dictionary = await _post_nakama_auth(clean_email)
	if not bool(post.get("success", false)):
		last_auth_diagnostics["success"] = false
		last_auth_diagnostics["error"] = str(post.get("error", "Post-auth init failed"))
		print("[AuthManager] post-auth init failed — %s" % last_auth_diagnostics.error)
		return {
			"ok": false,
			"success": false,
			"error": str(post.get("error", "Logged in but profile init failed")),
			"data": user,
			"status": int(post.get("status_code", 0)),
			"diagnostics": last_auth_diagnostics,
		}

	last_auth_diagnostics["success"] = true
	last_auth_diagnostics["user_id"] = str(nakama_res.get("data", {}).get("user_id", ""))
	print("[AuthManager] %s success nakama_user=%s node_user=%s" % [
		last_auth_diagnostics.auth_method,
		last_auth_diagnostics.get("user_id", ""),
		str(user.get("id", "")),
	])
	auth_changed.emit(true)
	user_changed.emit(user)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": {"user": user, "user_id": last_auth_diagnostics.get("user_id", "")},
		"status": 200,
		"diagnostics": last_auth_diagnostics,
	}


## Exchange Nakama session for Node JWT (creates/links Node user as needed).
func bridge_node_session(email: String = "", password: String = "") -> Dictionary:
	if GameApiClient == null:
		return {"success": false, "error": "GameApiClient missing", "status": 0}
	if not is_nakama_authenticated():
		return {"success": false, "error": "Nakama session required before Node bridge", "status": 401}
	var token := ""
	if NakamaManager.has_method("get_session_token"):
		token = NakamaManager.get_session_token()
	elif NakamaManager.session != null:
		token = str(NakamaManager.session.token)
	if token.is_empty():
		return {"success": false, "error": "Missing Nakama session token", "status": 401}

	var body := {
		"nakama_token": token,
		"email": email.strip_edges().to_lower(),
	}
	if not password.is_empty():
		body["password"] = password

	var res: Dictionary = await GameApiClient.request(
		"POST",
		"/api/auth/nakama-bridge",
		body,
		false
	)
	if not res.ok:
		node_bridge_ok = false
		var err := str(res.get("error", "Node bridge failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		return {"success": false, "error": err, "status": int(res.get("status", 0))}

	_apply_auth_payload(res.data)
	node_bridge_ok = not access_token.is_empty()
	_mark_bridge_flag()
	print("[AuthManager] Node bridge OK user_id=%s" % str(user.get("id", "")))
	return {"success": true, "error": "", "status": 200, "data": user}


## After Nakama restore: reuse JWT if valid, else bridge with session token.
func ensure_node_bridge() -> Dictionary:
	if not is_nakama_authenticated():
		return {"success": false, "error": "Not authenticated on Nakama", "status": 401}
	if not access_token.is_empty():
		var me: Dictionary = await GameApiClient.request("GET", "/api/auth/me", null, true)
		if me.ok and typeof(me.data) == TYPE_DICTIONARY:
			user = me.data
			_merge_profile_into_user()
			node_bridge_ok = true
			user_changed.emit(user)
			return {"success": true, "error": "", "status": 200, "data": user}
		# Stale JWT — clear and re-bridge.
		access_token = ""
		_save_token()
	var email := str(user.get("email", "")).strip_edges().to_lower()
	if email.is_empty() and NakamaManager != null and NakamaManager.has_method("get_account_email"):
		email = str(NakamaManager.get_account_email()).strip_edges().to_lower()
	return await bridge_node_session(email, "")


func _post_nakama_auth(email: String) -> Dictionary:
	# Prefer Node user (gameplay id) when bridge succeeded.
	if user.is_empty() or str(user.get("id", "")).is_empty():
		user = _user_from_nakama(email)
	elif not email.is_empty():
		user["email"] = email
	if ProfileManager != null:
		var pref: Dictionary = await ProfileManager.ensure_profile()
		if not pref.get("success", false) and not pref.get("ok", false):
			return {
				"success": false,
				"error": "Profile init failed — %s" % str(pref.get("error", "unknown")),
				"status_code": int(pref.get("status_code", 0)),
			}
		_merge_profile_into_user()
	if CurrencyManager != null:
		var wres: Dictionary = await CurrencyManager.ensure_wallet()
		if not wres.get("success", false) and not wres.get("ok", false):
			print("[AuthManager] WARNING: Nakama wallet unavailable — %s" % str(wres.get("error", "unknown")))
	if RealtimeManager != null and RealtimeManager.has_method("start_nakama"):
		var sock: Dictionary = await RealtimeManager.start_nakama()
		if not bool(sock.get("ok", false)):
			print("[AuthManager] WARNING: realtime socket — %s" % str(sock.get("error", "unknown")))
	return {"success": true, "error": "", "status_code": 200}


func _user_from_nakama(email: String = "") -> Dictionary:
	var uid := ""
	if NakamaManager != null and NakamaManager.session != null:
		uid = str(NakamaManager.session.user_id)
	var out := {
		"id": uid,
		"email": email,
		"full_name": "",
		"auth_provider": "nakama_email",
	}
	if ProfileManager != null and ProfileManager.has_profile():
		var p: Dictionary = ProfileManager.profile
		var display := str(p.get("display_name", "")).strip_edges()
		if not display.is_empty():
			out["full_name"] = display
		var selected := str(p.get("selected_character_id", "")).strip_edges()
		if not selected.is_empty():
			out["active_character_id"] = selected
	return out


func _merge_profile_into_user() -> void:
	if ProfileManager == null or not ProfileManager.has_profile():
		return
	var p: Dictionary = ProfileManager.profile
	var display := str(p.get("display_name", "")).strip_edges()
	if not display.is_empty():
		user["full_name"] = display
	var selected := str(p.get("selected_character_id", "")).strip_edges()
	if not selected.is_empty():
		user["active_character_id"] = selected
	# Keep Node user.id for Character.created_by_id; store Nakama id separately.
	var account_id := str(p.get("account_id", "")).strip_edges()
	if not account_id.is_empty():
		user["nakama_account_id"] = account_id


## OTP is legacy Node-only — disabled for Godot Nakama auth.
func verify_otp(_email: String, _otp_code: String) -> Dictionary:
	return {
		"ok": false,
		"error": "Email OTP is not used — Godot accounts authenticate with Nakama email/password.",
		"data": {},
		"status": 410,
	}


func resend_otp(_email: String) -> Dictionary:
	return {
		"ok": false,
		"error": "Email OTP is not used — Godot accounts authenticate with Nakama email/password.",
		"data": {},
		"status": 410,
	}


func fetch_me() -> Dictionary:
	if not is_nakama_authenticated():
		clear_session()
		return {"ok": false, "error": "Not authenticated", "data": {}, "status": 401}
	# Node /me is gameplay user id (Character.created_by_id).
	if not access_token.is_empty():
		var res: Dictionary = await GameApiClient.request("GET", "/api/auth/me", null, true)
		if res.ok and typeof(res.data) == TYPE_DICTIONARY:
			user = res.data
			_merge_profile_into_user()
			node_bridge_ok = true
			user_changed.emit(user)
			return {"ok": true, "error": "", "data": user, "status": 200}
		if int(res.get("status", 0)) == 401:
			# JWT expired/invalid — keep Nakama session, re-bridge without password.
			access_token = ""
			_save_token()
			node_bridge_ok = false
			var bridged: Dictionary = await ensure_node_bridge()
			if bridged.get("success", false):
				return {"ok": true, "error": "", "data": user, "status": 200}
			return {
				"ok": false,
				"error": "Node session expired and re-bridge failed — %s" % str(bridged.get("error", "")),
				"data": {},
				"status": int(bridged.get("status", 401)),
			}
	else:
		var bridged2: Dictionary = await ensure_node_bridge()
		if bridged2.get("success", false):
			return {"ok": true, "error": "", "data": user, "status": 200}
		return {
			"ok": false,
			"error": "Node gameplay bridge required — %s" % str(bridged2.get("error", "")),
			"data": {},
			"status": int(bridged2.get("status", 503)),
		}


func update_me(patch: Dictionary) -> Dictionary:
	# Godot account fields go to Nakama profile — never Node :8787 auth/me.
	if patch.has("full_name") or patch.has("display_name"):
		var display := str(patch.get("display_name", patch.get("full_name", ""))).strip_edges()
		if ProfileManager != null and not display.is_empty():
			var pref: Dictionary = await ProfileManager.update_display_name(display)
			if pref.get("success", false) or pref.get("ok", false):
				_merge_profile_into_user()
				user_changed.emit(user)
				return {"ok": true, "error": "", "data": user, "status": 200}
			return {
				"ok": false,
				"error": str(pref.get("error", "Failed to update display name")),
				"data": {},
				"status": int(pref.get("status_code", 0)),
			}
	if patch.has("active_character_id") and ProfileManager != null:
		var cid := str(patch.get("active_character_id", ""))
		var sync_res: Dictionary = await ProfileManager.set_selected_character_id(cid)
		if sync_res.get("success", false) or sync_res.get("ok", false):
			user["active_character_id"] = cid
			user_changed.emit(user)
			return {"ok": true, "error": "", "data": user, "status": 200}
		return {
			"ok": false,
			"error": str(sync_res.get("error", "Failed to update selected character")),
			"data": {},
			"status": int(sync_res.get("status_code", 0)),
		}
	user.merge(patch, true)
	user_changed.emit(user)
	return {"ok": true, "error": "", "data": user, "status": 200}


func list_characters() -> Dictionary:
	if user.is_empty() or access_token.is_empty():
		var me_res: Dictionary = await fetch_me()
		if not me_res.ok:
			return me_res
	if access_token.is_empty():
		return {
			"ok": false,
			"status": 503,
			"error": "Node gameplay session missing — re-login to bridge Character APIs",
			"data": [],
		}
	var uid := str(user.get("id", ""))
	return await GameApiClient.request(
		"POST",
		"/api/entities/Character/filter",
		{"query": {"created_by_id": uid}, "sort": "-created_date", "limit": 10},
		true
	)


func create_character(payload: Dictionary) -> Dictionary:
	if access_token.is_empty():
		var bridged: Dictionary = await ensure_node_bridge()
		if not bridged.get("success", false):
			return {
				"ok": false,
				"error": "Character creation needs Node gameplay bridge (:8787). %s" % str(bridged.get("error", "")),
				"data": {},
				"status": 503,
			}
	return await GameApiClient.request("POST", "/api/entities/Character", payload, true)


func select_character(character_id: String) -> Dictionary:
	var res: Dictionary = await update_me({"active_character_id": character_id})
	if res.ok and ProfileManager != null and NakamaManager.is_authenticated():
		var sync_res: Dictionary = await ProfileManager.set_selected_character_id(character_id)
		if not sync_res.get("success", false) and not sync_res.get("ok", false):
			print("[AuthManager] WARNING: Nakama profile selected_character_id sync failed — %s" % str(sync_res.get("error", "")))
	return res


func get_character(character_id: String) -> Dictionary:
	if access_token.is_empty():
		var bridged: Dictionary = await ensure_node_bridge()
		if not bridged.get("success", false):
			return {"ok": false, "error": "No Node gameplay session for characters", "data": {}, "status": 503}
	return await GameApiClient.request("GET", "/api/entities/Character/%s" % character_id, null, true)


func list_items(character_id: String = "", limit: int = 200) -> Dictionary:
	var cid := character_id if not character_id.is_empty() else str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return {"ok": false, "status": 0, "error": "No character id", "data": []}
	if access_token.is_empty():
		return {"ok": true, "status": 200, "error": "", "data": []}
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
	await logout_nakama()
	clear_session()


## Restore Nakama email session, bridge Node JWT, then profile/wallet.
func ensure_nakama_session() -> Dictionary:
	NakamaManager.initialize_client()
	var res: Dictionary = await NakamaManager.ensure_authenticated()
	if res.get("success", false):
		print("[AuthManager] Nakama session ready user_id=%s method=%s" % [
			str(res.get("data", {}).get("user_id", "")),
			str(res.get("data", {}).get("auth_method", NakamaManager.get_auth_method())),
		])
		var bridge: Dictionary = await ensure_node_bridge()
		if not bridge.get("success", false):
			print("[AuthManager] WARNING: Node bridge unavailable — %s" % str(bridge.get("error", "unknown")))
		if user.is_empty():
			user = _user_from_nakama()
		if ProfileManager != null:
			var pref: Dictionary = await ProfileManager.ensure_profile()
			if pref.get("success", false) or pref.get("ok", false):
				_merge_profile_into_user()
				print("[AuthManager] Nakama profile ready account_id=%s" % str(pref.get("data", {}).get("account_id", "")))
			else:
				print("[AuthManager] WARNING: Nakama profile unavailable — %s" % str(pref.get("error", "unknown")))
		if CurrencyManager != null:
			var wres: Dictionary = await CurrencyManager.ensure_wallet()
			if wres.get("success", false) or wres.get("ok", false):
				print("[AuthManager] Nakama wallet ready")
			else:
				print("[AuthManager] WARNING: Nakama wallet unavailable — %s" % str(wres.get("error", "unknown")))
		auth_changed.emit(true)
		user_changed.emit(user)
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
	if MailManager != null and MailManager.has_method("clear_account_mail_cache"):
		MailManager.clear_account_mail_cache()
	if SocialManager != null and SocialManager.has_method("clear_account_social_cache"):
		SocialManager.clear_account_social_cache()
	if ChatManager != null and ChatManager.has_method("clear_account_chat_cache"):
		ChatManager.clear_account_chat_cache()
	if RealtimeManager != null and RealtimeManager.has_method("stop_nakama"):
		await RealtimeManager.stop_nakama()
	if NakamaManager == null:
		return {"success": true, "data": {}, "error": "", "status_code": 200}
	return await NakamaManager.logout()


func is_nakama_authenticated() -> bool:
	return NakamaManager != null and NakamaManager.is_authenticated()


func change_password(_current_password: String, _new_password: String) -> Dictionary:
	return {
		"ok": false,
		"error": "Password change via Node API is disabled. Use Nakama Console or a future Nakama password flow.",
		"data": {},
		"status": 410,
	}


func request_password_reset(_email: String) -> Dictionary:
	return {
		"ok": false,
		"error": "Password reset is not available in the Godot client yet (Nakama email auth). Contact an admin if locked out.",
		"data": {},
		"status": 410,
	}


func reset_password(_reset_token: String, _new_password: String) -> Dictionary:
	return {
		"ok": false,
		"error": "Password reset is not available in the Godot client yet.",
		"data": {},
		"status": 410,
	}


func get_auth_diagnostics() -> Dictionary:
	var diag: Dictionary = NakamaManager.get_connection_diagnostics() if NakamaManager != null else {}
	diag["last_auth"] = last_auth_diagnostics
	diag["logged_in"] = is_logged_in()
	return diag


func clear_session() -> void:
	access_token = ""
	user = {}
	node_bridge_ok = false
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
	if typeof(data.get("user", {})) == TYPE_DICTIONARY:
		user = data.get("user", {})
	_save_token()
	auth_changed.emit(not access_token.is_empty() or is_nakama_authenticated())
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


func _mark_bridge_flag() -> void:
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	cfg.set_value("auth", BRIDGE_FLAG_KEY, true)
	cfg.save(CONFIG_PATH)
