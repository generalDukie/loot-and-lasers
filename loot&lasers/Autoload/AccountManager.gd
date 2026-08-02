extends Node
## Account lifecycle — promo, rename, slots, purge, legacy name.

const RENAME_NOVA_COST := 500
const SLOT_NOVA_COST := 500
const MAX_SLOTS := 3


func _ready() -> void:
	print("[AccountManager] ready")


func redeem_promo(code: String) -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("RedeemPromoCode", {
		"code": code.strip_edges(),
	})
	_apply_char(res)
	return res


func rename_character(new_name: String, pay_with_nova: bool = false) -> Dictionary:
	var body := {"name": new_name.strip_edges()}
	if pay_with_nova:
		body["pay_with_nova"] = true
	var res: Dictionary = await ApiClient.invoke("RenameCharacter", body)
	_apply_char(res)
	return res


func buy_character_slot() -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("BuyCharacterSlot", {})
	_apply_char(res)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var u: Variant = res.data.get("user", {})
		if typeof(u) == TYPE_DICTIONARY and not (u as Dictionary).is_empty():
			AuthManager.user = u
			AuthManager.user_changed.emit(u)
	return res


func set_legacy_name(name: String) -> Dictionary:
	return await AuthManager.update_me({"legacy_name": name.strip_edges()})


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
	var list: Dictionary = await ApiClient.request(
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
			await ApiClient.request(
				"PATCH", "/api/entities/Character/%s" % cid.uri_encode(),
				{"legacy_display": m}, true
			)
			if cid == str(GameManager.active_character.get("id", "")):
				GameManager.active_character["legacy_display"] = m
	return res


func slot_capacity() -> int:
	return mini(MAX_SLOTS, 1 + int(AuthManager.user.get("purchased_slots", 0)))


func purge_and_delete_character(character_id: String, character_name: String = "") -> Dictionary:
	if character_id.is_empty():
		return {"ok": false, "error": "Missing character id"}
	# Leave guild first
	await SocialManager.load_my_guild()
	if str(SocialManager.my_membership.get("character_id", "")) == character_id \
			or str(GameManager.active_character.get("id", "")) == character_id:
		if not SocialManager.my_membership.is_empty():
			await SocialManager.leave_guild()

	var cleanups: Array = [
		["Item", {"character_id": character_id}],
		["Mission", {"character_id": character_id}],
		["Mail", {"owner_id": character_id}],
		["AppNotification", {"owner_id": character_id}],
		["GuildMember", {"character_id": character_id}],
		["PlayerPresence", {"character_id": character_id}],
		["DailyLogin", {"character_id": character_id}],
		["ChatMessage", {"sender_id": character_id}],
		["PrivateMessage", {"sender_id": character_id}],
		["PrivateMessage", {"recipient_id": character_id}],
		["FriendRequest", {"from_character_id": character_id}],
		["FriendRequest", {"to_character_id": character_id}],
		["Block", {"blocker_id": character_id}],
		["Block", {"blocked_id": character_id}],
		["Report", {"reporter_id": character_id}],
		["Report", {"reported_id": character_id}],
		["GalaxyNews", {"character_id": character_id}],
	]
	if not character_name.is_empty():
		cleanups.append(["GalaxyNews", {"character_name": character_name}])

	for entry in cleanups:
		await ApiClient.request(
			"POST", "/api/entities/%s/delete-many" % entry[0],
			{"query": entry[1]}, true
		)

	var del: Dictionary = await ApiClient.request(
		"DELETE", "/api/entities/Character/%s" % character_id.uri_encode(), null, true
	)
	if del.ok and str(GameManager.active_character.get("id", "")) == character_id:
		GameManager.active_character = {}
	return del


func _apply_char(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
