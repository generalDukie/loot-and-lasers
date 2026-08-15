extends Node
## Godot authentication coordinator (dual-stack).
## Auth SoT: Nakama email (:7350).
## Gameplay bridge: Node JWT (:8787) for unmigrated Character/economy APIs.
## Do not remove Node auth routes until each gameplay system has migrated.

signal auth_changed(logged_in: bool)
signal user_changed(user: Dictionary)
signal node_bridge_completed(result: Dictionary)

const CONFIG_PATH := "user://godot_client.cfg"
const BRIDGE_FLAG_KEY := "nakama_node_bridge_v1"
const NODE_REFRESH_SKEW_SEC := 90
const CODE_AUTH_SESSION_INVALID := "AUTH_SESSION_INVALID"

var access_token: String = ""
var user: Dictionary = {}
var last_auth_diagnostics: Dictionary = {}
var node_bridge_ok := false
var node_token_expires_at := 0
var node_token_nakama_user_id := ""
var _bridge_in_progress := false
var _node_auth_generation := 0
var _superseded_handling := false
var session_superseded_message := ""


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

	# A newly authenticated Nakama identity must never inherit a prior account's
	# Node gameplay token if the exchange is unavailable.
	_clear_node_session_only()
	var clean_email := email.strip_edges().to_lower()
	var bridge: Dictionary = await bridge_node_session(clean_email, "", true)
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
func bridge_node_session(email: String = "", _password: String = "", force_claim: bool = false) -> Dictionary:
	if GameApiClient == null:
		return {"success": false, "error": "GameApiClient missing", "status": 0}
	if not is_nakama_authenticated():
		return {"success": false, "error": "Nakama session required before Node bridge", "status": 401}
	if _bridge_in_progress:
		var pending: Dictionary = await node_bridge_completed
		return pending
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
		"force_claim": force_claim,
	}
	_bridge_in_progress = true
	var bridge_generation := _node_auth_generation
	var res: Dictionary = await GameApiClient.request(
		"POST",
		"/api/auth/nakama-bridge",
		body,
		false,
		5.0,
		false
	)
	if not res.ok:
		node_bridge_ok = false
		var err := str(res.get("error", "Node bridge failed"))
		var code := str(res.get("code", ""))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY:
			var data: Dictionary = res.data
			if data.has("error"):
				err = str(data["error"])
			if code.is_empty() and data.has("code"):
				code = str(data["code"])
		if code == CODE_AUTH_SESSION_INVALID:
			await handle_session_superseded(err)
		return _finish_node_bridge({
			"success": false,
			"error": err,
			"status": int(res.get("status", 401)),
			"code": code,
		})

	var response_nakama_id := ""
	if typeof(res.get("data", null)) == TYPE_DICTIONARY:
		response_nakama_id = str(res.data.get("nakama_user_id", ""))
	if (
		bridge_generation != _node_auth_generation
		or response_nakama_id.is_empty()
		or response_nakama_id != _current_nakama_user_id()
	):
		return _finish_node_bridge({
			"success": false,
			"error": "Authentication changed while linking gameplay",
			"status": 409,
		})
	_apply_auth_payload(res.data)
	node_bridge_ok = not access_token.is_empty()
	_mark_bridge_flag()
	print("[AuthManager] Node bridge OK user_id=%s" % str(user.get("id", "")))
	return _finish_node_bridge({"success": true, "error": "", "status": 200, "data": user})


## After Nakama restore: reuse JWT if valid, else bridge with session token.
func ensure_node_bridge() -> Dictionary:
	if not is_nakama_authenticated():
		return {"success": false, "error": "Not authenticated on Nakama", "status": 401}
	if GameApiClient != null and GameApiClient.has_method("prefer_reachable_base_url"):
		var reach: Dictionary = await GameApiClient.prefer_reachable_base_url()
		if not reach.get("ok", false):
			node_bridge_ok = false
			return {
				"success": false,
				"error": "Node gameplay API unreachable — %s" % str(reach.get("error", "")),
				"status": 503,
			}
	if not access_token.is_empty():
		var current_nakama_id := _current_nakama_user_id()
		var binding_matches := (
			not current_nakama_id.is_empty()
			and node_token_nakama_user_id == current_nakama_id
		)
		var has_time := node_token_expires_at > Time.get_unix_time_from_system() + NODE_REFRESH_SKEW_SEC
		if binding_matches and has_time:
			var me: Dictionary = await GameApiClient.request(
				"GET", "/api/auth/me", null, true, 3.0, false
			)
			if me.ok and typeof(me.data) == TYPE_DICTIONARY:
				user = me.data
				_merge_profile_into_user()
				node_bridge_ok = true
				user_changed.emit(user)
				return {"success": true, "error": "", "status": 200, "data": user}
		# Wrong account on the JWT — drop it. Near-expiry keeps the live token
		# until the bridge returns a replacement so concurrent Node RPCs do not
		# observe an empty gameplay session and report "Not logged in".
		if not binding_matches:
			_clear_node_session_only()
	var email := str(user.get("email", "")).strip_edges().to_lower()
	if email.is_empty() and NakamaManager != null and NakamaManager.has_method("get_account_email"):
		email = str(NakamaManager.get_account_email()).strip_edges().to_lower()
	return await bridge_node_session(email, "")


func refresh_node_gameplay_session() -> Dictionary:
	if NakamaManager == null:
		return {"success": false, "error": "Nakama manager unavailable", "status": 401}
	## Coalesce overlapping refreshes. Never clear the live JWT first — concurrent
	## Node RPCs (mining, presence) would otherwise see an empty token while Nakama
	## is still valid.
	if _bridge_in_progress:
		var pending: Dictionary = await node_bridge_completed
		if has_node_gameplay_session():
			return {"success": true, "error": "", "status": 200, "data": user}
		return pending
	if NakamaManager.session != null and NakamaManager.session.would_expire_in(NODE_REFRESH_SKEW_SEC):
		var refreshed: Dictionary = await NakamaManager.refresh_session()
		if not refreshed.get("success", false):
			if _is_terminal_auth_failure(refreshed):
				_clear_node_session_only()
				await logout_nakama()
				clear_session()
				GameManager.go_login()
			return {
				"success": false,
				"error": str(refreshed.get("error", "Nakama session expired")),
				"status": int(refreshed.get("status_code", 401)),
			}
	if not is_nakama_authenticated():
		_clear_node_session_only()
		await logout_nakama()
		clear_session()
		GameManager.go_login()
		return {"success": false, "error": "Nakama session expired", "status": 401}
	var email := ""
	if NakamaManager.has_method("get_account_email"):
		email = str(NakamaManager.get_account_email()).strip_edges().to_lower()
	var bridged: Dictionary = await bridge_node_session(email, "", false)
	if not bridged.get("success", false):
		if str(bridged.get("code", "")) == CODE_AUTH_SESSION_INVALID:
			return bridged
		if int(bridged.get("status", 0)) == 401 and not is_nakama_authenticated():
			await logout_nakama()
			clear_session()
			GameManager.go_login()
	return bridged


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
		if RealtimeManager.has_method("start_node_wallet_events"):
			RealtimeManager.start_node_wallet_events()
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
	return out


func _merge_profile_into_user() -> void:
	if ProfileManager == null or not ProfileManager.has_profile():
		return
	var p: Dictionary = ProfileManager.profile
	var display := str(p.get("display_name", "")).strip_edges()
	if not display.is_empty():
		user["full_name"] = display
	# Keep Node user.id for Character.created_by_id; store Nakama id separately.
	var account_id := str(p.get("account_id", "")).strip_edges()
	if not account_id.is_empty():
		user["nakama_account_id"] = account_id



func fetch_me() -> Dictionary:
	if not is_nakama_authenticated():
		clear_session()
		return {"ok": false, "error": "Not authenticated", "data": {}, "status": 401}
	# Node /me is gameplay user id (Character.created_by_id).
	if access_token.is_empty():
		var bridged_empty: Dictionary = await ensure_node_bridge()
		if bridged_empty.get("success", false):
			return {"ok": true, "error": "", "data": user, "status": 200}
		return {
			"ok": false,
			"error": "Node gameplay bridge required — %s" % str(bridged_empty.get("error", "")),
			"data": {},
			"status": int(bridged_empty.get("status", 503)),
		}

	var res: Dictionary = await GameApiClient.request("GET", "/api/auth/me", null, true, 5.0)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		user = res.data
		_merge_profile_into_user()
		node_bridge_ok = true
		user_changed.emit(user)
		return {"ok": true, "error": "", "data": user, "status": 200}

	# JWT expired/invalid or Node unreachable — keep Nakama session, re-bridge.
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


func update_me(patch: Dictionary) -> Dictionary:
	# Account fields that affect identity/display go to Node — never Nakama profile RPCs.
	if patch.has("full_name") or patch.has("display_name") or patch.has("legacy_name"):
		var display := str(
			patch.get("legacy_name", patch.get("display_name", patch.get("full_name", "")))
		).strip_edges()
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
	if patch.has("active_character_id"):
		var cid := str(patch.get("active_character_id", ""))
		var node_res: Dictionary = await GameApiClient.request(
			"PATCH",
			"/api/auth/me",
			{"active_character_id": cid},
			true
		)
		if node_res.get("ok", false):
			if typeof(node_res.get("data", null)) == TYPE_DICTIONARY:
				user = (node_res.data as Dictionary).duplicate(true)
				_merge_profile_into_user()
			user_changed.emit(user)
			return {"ok": true, "error": "", "data": user, "status": 200}
		return {
			"ok": false,
			"error": str(node_res.get("error", "Failed to update selected character")),
			"data": {},
			"status": int(node_res.get("status", 0)),
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


func create_character(payload: Dictionary, request_id: String = "") -> Dictionary:
	if access_token.is_empty():
		var bridged: Dictionary = await ensure_node_bridge()
		if not bridged.get("success", false):
			return {
				"ok": false,
				"error": "Character creation needs Node gameplay bridge (:8787). %s" % str(bridged.get("error", "")),
				"data": {},
				"status": 503,
			}
	var body := payload.duplicate(true)
	if not request_id.is_empty():
		body["request_id"] = request_id
	return await GameApiClient.request("POST", "/api/entities/Character", body, true)


func select_character(character_id: String) -> Dictionary:
	return await update_me({"active_character_id": character_id})


func get_character(character_id: String) -> Dictionary:
	if access_token.is_empty():
		var bridged: Dictionary = await ensure_node_bridge()
		if not bridged.get("success", false):
			return {"ok": false, "error": "No Node gameplay session for characters", "data": {}, "status": 503}
	return await GameApiClient.request("GET", "/api/entities/Character/%s" % character_id, null, true)


func get_selected_character() -> Dictionary:
	if access_token.is_empty():
		var bridged: Dictionary = await ensure_node_bridge()
		if not bridged.get("success", false):
			return {"ok": false, "error": "No Node gameplay session for characters", "data": {}, "status": 503}
	return await GameApiClient.request("GET", "/api/auth/selected-character", null, true)


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


## Equip an unequipped bag item via Node EquipItem (atomic swap + sheet).
func equip_item(item_id: String) -> Dictionary:
	if item_id.is_empty():
		return {"ok": false, "error": "Missing item_id", "data": {}, "status": 0}
	var res: Dictionary = await GameApiClient.invoke("EquipItem", {"item_id": item_id})
	if not res.get("ok", false):
		var err := str(res.get("error", "Equip failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		return {
			"ok": false,
			"error": err,
			"data": res.get("data", {}),
			"status": int(res.get("status", 0)),
			"code": str(res.get("code", "")),
		}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	GameApiClient.apply_authoritative_response(data, "auth_equip_item")
	if StatsManager != null and StatsManager.has_method("apply_inventory_snapshot"):
		StatsManager.apply_inventory_snapshot(data)
	print("[AuthManager] equip_item ok id=%s via=EquipItem" % item_id.substr(0, mini(8, item_id.length())))
	return {"ok": true, "error": "", "data": data, "status": 200}


## Unequip a worn item into the bag via Node UnequipItem.
func unequip_item(item_id: String) -> Dictionary:
	if item_id.is_empty():
		return {"ok": false, "error": "Missing item_id", "data": {}, "status": 0}
	var res: Dictionary = await GameApiClient.invoke("UnequipItem", {"item_id": item_id})
	if not res.get("ok", false):
		var err := str(res.get("error", "Unequip failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		return {
			"ok": false,
			"error": err,
			"data": res.get("data", {}),
			"status": int(res.get("status", 0)),
			"code": str(res.get("code", "")),
		}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	GameApiClient.apply_authoritative_response(data, "auth_unequip_item")
	if StatsManager != null and StatsManager.has_method("apply_inventory_snapshot"):
		StatsManager.apply_inventory_snapshot(data)
	print("[AuthManager] unequip_item ok id=%s via=UnequipItem" % item_id.substr(0, mini(8, item_id.length())))
	return {"ok": true, "error": "", "data": data, "status": 200}


## Apply a stim: deletes the item and patches character.active_buffs.
func use_consumable(item_id: String) -> Dictionary:
	if item_id.is_empty():
		return {"ok": false, "error": "Missing item_id", "data": {}}
	var body := {
		"item_id": item_id,
		"request_id": "stim-%s-%s" % [item_id, Time.get_ticks_msec()],
	}
	var res: Dictionary = await GameApiClient.invoke("UseConsumable", body)
	if not res.ok:
		var err := str(res.get("error", "UseConsumable failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		return {"ok": false, "error": err, "status": res.get("status", 0), "data": res.get("data", {})}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.apply_active_character_patch(patch, "auth_use_consumable")
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.apply_active_character(ch, "auth_use_consumable")
	return {"ok": true, "error": "", "data": data, "status": 200}


## Rehydrate active Stims after reconnect (server filters expired).
func refresh_active_stims() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetActiveStims", {})
	if not res.ok:
		return {"ok": false, "error": str(res.get("error", "GetActiveStims failed")), "data": {}}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.apply_active_character(ch, "auth_refresh_stims")
	elif typeof(data.get("active_buffs", null)) == TYPE_ARRAY:
		GameManager.apply_active_character_patch({"active_buffs": data["active_buffs"]}, "auth_refresh_stims")
	return {"ok": true, "error": "", "data": data}


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
		GameManager.apply_active_character_patch(patch, "auth_dismiss_buff")
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.apply_active_character(ch, "auth_dismiss_buff")
	return {"ok": true, "error": "", "data": data, "status": 200}


func logout() -> void:
	await logout_nakama()
	clear_session()


## Another device claimed this account — end local session without re-bridging.
## announce=true only for a live kick (WebSocket session_kicked). Silent clear for
## stale restore / refresh AUTH_SESSION_INVALID so a second machine's login screen
## does not show "signed in elsewhere" before that machine has logged in.
func handle_session_superseded(message: String = "", announce: bool = false) -> void:
	if _superseded_handling:
		return
	_superseded_handling = true
	if announce:
		session_superseded_message = (
			message if not message.is_empty()
			else "Signed in elsewhere on this server. Please log in again."
		)
	else:
		session_superseded_message = ""
	if RealtimeManager != null and RealtimeManager.has_method("stop"):
		RealtimeManager.stop()
	elif RealtimeManager != null and RealtimeManager.has_method("stop_node"):
		RealtimeManager.stop_node()
	_clear_node_session_only()
	await logout_nakama()
	clear_session()
	auth_changed.emit(false)
	user_changed.emit({})
	if GameManager != null and GameManager.has_method("go_login"):
		GameManager.go_login()
	_superseded_handling = false


## Restore Nakama email session, bridge Node JWT, then profile/wallet.
## Optional status_cb(text) updates splash labels during long hybrid boot.
func ensure_nakama_session(status_cb: Callable = Callable()) -> Dictionary:
	_boot_status(status_cb, "Restoring session...")
	NakamaManager.initialize_client()
	var res: Dictionary = await NakamaManager.ensure_authenticated()
	if res.get("success", false):
		print("[AuthManager] Nakama session ready user_id=%s method=%s" % [
			str(res.get("data", {}).get("user_id", "")),
			str(res.get("data", {}).get("auth_method", NakamaManager.get_auth_method())),
		])
		_boot_status(status_cb, "Linking gameplay...")
		var bridge: Dictionary = await ensure_node_bridge()
		if not bridge.get("success", false):
			print("[AuthManager] WARNING: Node bridge unavailable — %s" % str(bridge.get("error", "unknown")))
		if user.is_empty():
			user = _user_from_nakama()
		_boot_status(status_cb, "Loading profile...")
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
		if RealtimeManager != null:
			if RealtimeManager.has_method("start_nakama"):
				var socket_result: Dictionary = await RealtimeManager.start_nakama()
				if not bool(socket_result.get("ok", false)):
					print("[AuthManager] WARNING: realtime socket — %s" % str(socket_result.get("error", "unknown")))
			if RealtimeManager.has_method("start_node_wallet_events"):
				RealtimeManager.start_node_wallet_events()
		auth_changed.emit(true)
		user_changed.emit(user)
	else:
		print("[AuthManager] Nakama session unavailable — %s" % str(res.get("error", "unknown")))
	return res


func _boot_status(status_cb: Callable, text: String) -> void:
	if status_cb.is_valid():
		status_cb.call(text)


func logout_nakama() -> Dictionary:
	GameManager.clear_active_character("auth_logout")
	if ProfileManager != null:
		ProfileManager.clear_local()
	if CurrencyManager != null:
		CurrencyManager.clear_local()
	if EquipmentManager != null:
		EquipmentManager.clear_local()
	if InventoryManager != null and InventoryManager.has_method("clear_nakama_inventory_local"):
		InventoryManager.clear_nakama_inventory_local()
	if StatsManager != null and StatsManager.has_method("clear_local"):
		StatsManager.clear_local()
	if ShopManager != null and ShopManager.has_method("clear_local"):
		ShopManager.clear_local()
	if ArenaManager != null and ArenaManager.has_method("clear_local"):
		ArenaManager.clear_local()
	if ProgressManager != null and ProgressManager.has_method("clear_local"):
		ProgressManager.clear_local()
	if DungeonManager != null and DungeonManager.has_method("clear_local"):
		DungeonManager.clear_local()
	if NotificationManager != null and NotificationManager.has_method("clear_local"):
		NotificationManager.clear_local()
	if PresenceManager != null and PresenceManager.has_method("stop"):
		PresenceManager.stop()
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
		if RealtimeManager.has_method("stop_node"):
			RealtimeManager.stop_node()
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
	user = {}
	_clear_node_session_only()
	GameManager.clear_active_character("auth_session_cleared")
	if AudioManager != null:
		AudioManager.stop_station_ambient()
		AudioManager.stop_music()
	auth_changed.emit(false)
	user_changed.emit(user)


func _apply_auth_payload(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	access_token = str(data.get("access_token", ""))
	node_token_nakama_user_id = str(data.get("nakama_user_id", ""))
	node_token_expires_at = int(data.get("expires_at", 0))
	if typeof(data.get("user", {})) == TYPE_DICTIONARY:
		user = data.get("user", {})
		user["nakama_user_id"] = node_token_nakama_user_id
	_save_token()
	auth_changed.emit(not access_token.is_empty() or is_nakama_authenticated())
	user_changed.emit(user)
	if not access_token.is_empty() and SettingsManager != null:
		SettingsManager.load_account_preferences()


func _save_token() -> void:
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	var section := _auth_section()
	cfg.set_value(section, "access_token", access_token)
	cfg.set_value(section, "nakama_user_id", node_token_nakama_user_id)
	cfg.set_value(section, "expires_at", node_token_expires_at)
	cfg.save(CONFIG_PATH)


func _load_token() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) == OK:
		var section := _auth_section()
		access_token = str(cfg.get_value(section, "access_token", ""))
		node_token_nakama_user_id = str(cfg.get_value(section, "nakama_user_id", ""))
		node_token_expires_at = int(cfg.get_value(section, "expires_at", 0))


func _mark_bridge_flag() -> void:
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	cfg.set_value(_auth_section(), BRIDGE_FLAG_KEY, true)
	cfg.save(CONFIG_PATH)


func _auth_section() -> String:
	var env_id := "local"
	if BackendEnvironment != null and BackendEnvironment.has_method("get_environment_id"):
		env_id = str(BackendEnvironment.get_environment_id())
	return "auth_%s" % env_id


func _current_nakama_user_id() -> String:
	if NakamaManager != null and NakamaManager.session != null:
		return str(NakamaManager.session.user_id)
	return ""


func _clear_node_session_only() -> void:
	_node_auth_generation += 1
	access_token = ""
	node_token_nakama_user_id = ""
	node_token_expires_at = 0
	node_bridge_ok = false
	_save_token()


func _finish_node_bridge(result: Dictionary) -> Dictionary:
	_bridge_in_progress = false
	node_bridge_completed.emit(result)
	return result


func _is_terminal_auth_failure(result: Dictionary) -> bool:
	var status := int(result.get("status_code", result.get("status", 0)))
	var message := str(result.get("error", "")).to_lower()
	return status == 401 or message.contains("expired") or message.contains("unauthorized")
