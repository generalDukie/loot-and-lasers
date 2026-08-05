extends Node
## Account lifecycle — promo, rename, slots, purge, legacy name.

const RENAME_NOVA_COST := 500
const SLOT_NOVA_COST := 500
const MAX_SLOTS := 3


func _ready() -> void:
	print("[AccountManager] ready")


func redeem_promo(code: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("RedeemPromoCode", {
		"code": code.strip_edges(),
	})
	_apply_char(res)
	return res


func rename_character(new_name: String, pay_with_nova: bool = false) -> Dictionary:
	var body := {"name": new_name.strip_edges()}
	if pay_with_nova:
		body["pay_with_nova"] = true
	var res: Dictionary = await GameApiClient.invoke("RenameCharacter", body)
	_apply_char(res)
	return res


func buy_character_slot() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("BuyCharacterSlot", {})
	_apply_char(res)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var u: Variant = res.data.get("user", {})
		if typeof(u) == TYPE_DICTIONARY and not (u as Dictionary).is_empty():
			AuthManager.user = u
			AuthManager.user_changed.emit(u)
	return res


func set_legacy_name(name: String) -> Dictionary:
	var legacy := name.strip_edges()
	var res: Dictionary = await AuthManager.update_me({"legacy_name": legacy})
	if not res.ok:
		return res
	# Node stamps every owned Character on lock-in; mirror it into the live cache.
	if not GameManager.active_character.is_empty():
		GameManager.apply_active_character_patch({"legacy_name": legacy}, "account_legacy_name")
	return res


func set_legacy_display(mode: String) -> Dictionary:
	var m := mode.strip_edges().to_lower()
	if m != "family":
		m = "surname"
	var res: Dictionary = await AuthManager.update_me({"legacy_display": m})
	if not res.ok:
		return res
	# Web AccountSettings patches every owned character, not just the active one.
	var uid := str(AuthManager.user.get("id", ""))
	if uid.is_empty():
		return res
	var list: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Character/filter",
		{"query": {"created_by_id": uid}, "sort": "-created_date", "limit": 10}, true
	)
	if list.ok and typeof(list.data) == TYPE_ARRAY:
		for ch in list.data:
			if typeof(ch) != TYPE_DICTIONARY:
				continue
			var cid := str(ch.get("id", ""))
			if cid.is_empty():
				continue
			await GameApiClient.request(
				"PATCH", "/api/entities/Character/%s" % cid.uri_encode(),
				{"legacy_display": m}, true
			)
			if cid == str(GameManager.active_character.get("id", "")):
				GameManager.apply_active_character_patch({"legacy_display": m}, "account_legacy_display")
	return res


func slot_capacity() -> int:
	return mini(MAX_SLOTS, 1 + int(AuthManager.user.get("purchased_slots", 0)))


func purge_and_delete_character(character_id: String, _character_name: String = "") -> Dictionary:
	if character_id.is_empty():
		return {"ok": false, "error": "Missing character id"}
	# Entity deleteMany is locked for social/mail/news — Node owns the purge.
	var del: Dictionary = await GameApiClient.invoke("DeleteMyCharacter", {
		"character_id": character_id,
	})
	if del.ok and str(GameManager.active_character.get("id", "")) == character_id:
		GameManager.clear_active_character("account_character_deleted")
	return del


func _apply_char(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.apply_active_character_patch(patch, "account_mutation")
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.apply_active_character(ch, "account_mutation")
