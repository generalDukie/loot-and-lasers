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


## Equip an unequipped bag item. Swaps the same-slot piece if one is worn.
func equip_item(item_id: String) -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return {"ok": false, "error": "No active character", "data": {}}
	var list_res: Dictionary = await list_items(cid)
	if not list_res.ok:
		return list_res
	var items: Array = list_res.data if typeof(list_res.data) == TYPE_ARRAY else []
	var item := InventoryRules.find_by_id(items, item_id)
	if item.is_empty():
		return {"ok": false, "error": "Item not found", "data": {}}
	if bool(item.get("is_equipped", false)):
		return {"ok": false, "error": "Already equipped", "data": {}}
	var item_type := str(item.get("type", ""))
	if not InventoryRules.is_equippable(item_type):
		return {"ok": false, "error": "That item cannot be equipped", "data": {}}

	var currently := InventoryRules.find_equipped_of_type(items, item_type)

	var eq_res: Dictionary = await patch_item(item_id, {"is_equipped": true})
	if not eq_res.ok:
		return eq_res

	# Swap: unequip previous after new is equipped (keeps bag occupancy flat).
	if not currently.is_empty():
		var old_id := str(currently.get("id", ""))
		if old_id != item_id:
			var uneq: Dictionary = await patch_item(old_id, {"is_equipped": false})
			if not uneq.ok:
				# Best-effort rollback of the new equip.
				await patch_item(item_id, {"is_equipped": false})
				return uneq

	var eq_map: Dictionary = {}
	var raw_map: Variant = GameManager.active_character.get("equipped_items", {})
	if typeof(raw_map) == TYPE_DICTIONARY:
		eq_map = raw_map.duplicate(true)
	eq_map[item_type] = item_id
	var ch_res: Dictionary = await patch_character(cid, {"equipped_items": eq_map})
	if not ch_res.ok:
		return ch_res
	if typeof(ch_res.data) == TYPE_DICTIONARY:
		GameManager.active_character = ch_res.data
	else:
		GameManager.active_character["equipped_items"] = eq_map
	return {"ok": true, "error": "", "data": GameManager.active_character, "status": 200}


## Unequip a worn item into the bag (blocked when bag is full).
func unequip_item(item_id: String) -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return {"ok": false, "error": "No active character", "data": {}}
	var list_res: Dictionary = await list_items(cid)
	if not list_res.ok:
		return list_res
	var items: Array = list_res.data if typeof(list_res.data) == TYPE_ARRAY else []
	var item := InventoryRules.find_by_id(items, item_id)
	if item.is_empty():
		return {"ok": false, "error": "Item not found", "data": {}}
	if not bool(item.get("is_equipped", false)):
		return {"ok": false, "error": "Not equipped", "data": {}}

	var bag_count := InventoryRules.bag_occupancy(items)
	var cap := InventoryRules.bag_cap(GameManager.active_character)
	if bag_count >= cap:
		return {"ok": false, "error": "Inventory full — dissolve an item before unequipping", "data": {}}

	var item_type := str(item.get("type", ""))
	var uneq: Dictionary = await patch_item(item_id, {"is_equipped": false})
	if not uneq.ok:
		return uneq

	var eq_map: Dictionary = {}
	var raw_map: Variant = GameManager.active_character.get("equipped_items", {})
	if typeof(raw_map) == TYPE_DICTIONARY:
		eq_map = raw_map.duplicate(true)
	eq_map.erase(item_type)
	var ch_res: Dictionary = await patch_character(cid, {"equipped_items": eq_map})
	if not ch_res.ok:
		return ch_res
	if typeof(ch_res.data) == TYPE_DICTIONARY:
		GameManager.active_character = ch_res.data
	else:
		GameManager.active_character["equipped_items"] = eq_map
	return {"ok": true, "error": "", "data": GameManager.active_character, "status": 200}


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
	else:
		print("[AuthManager] Nakama session unavailable — %s" % str(res.get("error", "unknown")))
	return res


func logout_nakama() -> Dictionary:
	if ProfileManager != null:
		ProfileManager.clear_local()
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
