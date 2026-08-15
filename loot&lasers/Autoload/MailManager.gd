extends Node
## Phase 20 / Restoration 23 — Character mail via Node GetInbox / SendMail / ClaimMailReward.

signal inbox_loaded(messages: Array)
signal message_loaded(message: Dictionary)
signal new_mail_received(summary: Dictionary)
signal mail_sent(receipt: Dictionary)
signal mail_read_changed(mail_id: String, read: bool)
signal mail_deleted(mail_id: String)
signal attachments_claimed(receipt: Dictionary)
signal unread_count_changed(count: int)
signal mail_changed
signal mail_error(error: String)
signal loading_changed(loading: bool)
signal mutation_state_changed(mutating: bool)

const MAIL_PREVIEW_LENGTH := 80
const NAKAMA_MAIL_NOTIFICATION_CODE := 20

var inbox: Array = []
var selected_message: Dictionary = {}
var mail_folder: String = "inbox"
var unread_count: int = 0
var next_cursor: String = ""
var has_more_pages := false
var loading := false
var mutating := false
var _busy := false
var _signals_bound := false


func _ready() -> void:
	print("[MailManager] ready (Node mail)")
	_ensure_realtime_binds()


func _ensure_realtime_binds() -> void:
	if _signals_bound:
		return
	if RealtimeManager != null and RealtimeManager.has_signal("nakama_notification"):
		if not RealtimeManager.nakama_notification.is_connected(_on_nakama_notification):
			RealtimeManager.nakama_notification.connect(_on_nakama_notification)
	if RealtimeManager != null and RealtimeManager.has_signal("nakama_connection_changed"):
		if not RealtimeManager.nakama_connection_changed.is_connected(_on_rt_connection):
			RealtimeManager.nakama_connection_changed.connect(_on_rt_connection)
	_signals_bound = true


func is_loading() -> bool:
	return loading


func is_mutating() -> bool:
	return mutating


func get_messages() -> Array:
	return inbox


func get_selected_message() -> Dictionary:
	return selected_message


func get_unread_count() -> int:
	return unread_count


func get_next_cursor() -> String:
	return next_cursor


func has_more() -> bool:
	return has_more_pages


func clear_account_mail_cache() -> void:
	inbox = []
	selected_message = {}
	unread_count = 0
	next_cursor = ""
	has_more_pages = false
	mail_folder = "inbox"
	mail_changed.emit()
	unread_count_changed.emit(0)


func _rid(prefix: String) -> String:
	return "%s-%s-%s" % [prefix, Time.get_ticks_msec(), randi()]


func _set_loading(v: bool) -> void:
	loading = v
	loading_changed.emit(v)


func _set_mutating(v: bool) -> void:
	mutating = v
	mutation_state_changed.emit(v)


func _set_unread(n: int) -> void:
	unread_count = maxi(0, n)
	unread_count_changed.emit(unread_count)
	mail_changed.emit()


func _fail(err: String) -> Dictionary:
	mail_error.emit(err)
	return {"ok": false, "success": false, "error": err, "data": {}}


func _map_type_to_ui(t: String) -> String:
	if t == "player_text":
		return "player"
	return t


func _summary_to_ui(s: Dictionary) -> Dictionary:
	## Accept Node mailService.serializeMail or legacy Nakama summary shapes.
	var sid := str(s.get("id", s.get("mail_id", "")))
	return {
		"id": sid,
		"mail_id": sid,
		"subject": str(s.get("subject", "")),
		"body": str(s.get("body", s.get("preview", ""))),
		"from_name": str(s.get("from_name", s.get("sender_display_name", ""))),
		"from_id": str(s.get("from_id", "")),
		"to_name": str(s.get("to_name", "")),
		"mail_type": _map_type_to_ui(str(s.get("mail_type", s.get("type", "")))),
		"folder": str(s.get("folder", s.get("mailbox", mail_folder))),
		"read": bool(s.get("read", false)),
		"has_rewards": bool(s.get("has_rewards", s.get("has_unclaimed_attachments", false))),
		"claimed": bool(s.get("claimed", false)),
		"guild_id": str(s.get("guild_id", "")),
		"created_date": str(s.get("created_date", s.get("created_at", ""))),
		"expires_at": str(s.get("expires_at", "")),
		"expired": bool(s.get("expired", false)),
		"preview": str(s.get("body", s.get("preview", ""))).substr(0, MAIL_PREVIEW_LENGTH),
	}


func _full_to_ui(m: Dictionary) -> Dictionary:
	return _summary_to_ui(m)


func _on_rt_connection(connected: bool) -> void:
	if connected:
		await refresh_unread()


func _on_nakama_notification(n: Dictionary) -> void:
	var code := int(n.get("code", -1))
	if code != NAKAMA_MAIL_NOTIFICATION_CODE:
		return
	var content: Variant = n.get("content", {})
	if typeof(content) == TYPE_STRING:
		content = JSON.parse_string(content)
	if typeof(content) != TYPE_DICTIONARY:
		return
	var event := str(content.get("event", ""))
	if event != "new_mail_received" and event != "":
		# Still accept bare new_mail subject payloads
		pass
	var summary := {
		"mail_id": str(content.get("mail_id", "")),
		"type": str(content.get("type", "")),
		"sender_display_name": str(content.get("sender_display_name", "")),
		"subject": str(content.get("subject", "")),
		"created_at": str(content.get("created_at", "")),
		"has_unclaimed_attachments": bool(content.get("has_attachments", false)),
	}
	if content.has("unread_count"):
		_set_unread(int(content.get("unread_count", unread_count)))
	else:
		_set_unread(unread_count + 1)
	new_mail_received.emit(summary)
	mail_changed.emit()


func load_inbox(cursor: String = "", filters: Dictionary = {}) -> Array:
	return await load_mail(str(filters.get("folder", mail_folder)), cursor, filters)


func load_mail(folder: String = "inbox", cursor: String = "", filters: Dictionary = {}) -> Array:
	_ensure_realtime_binds()
	mail_folder = folder if not folder.is_empty() else "inbox"
	if _busy:
		return inbox
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("GetInbox", {
		"folder": mail_folder,
		"limit": int(filters.get("limit", 100)),
	})
	_busy = false
	_set_loading(false)
	if not bool(res.get("ok", false)):
		inbox = []
		_fail(str(res.get("error", "Failed to load mail")))
		inbox_loaded.emit(inbox)
		mail_changed.emit()
		return inbox
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var rows: Array = data.get("mail", []) if typeof(data.get("mail", [])) == TYPE_ARRAY else []
	var mapped: Array = []
	for r in rows:
		if typeof(r) == TYPE_DICTIONARY:
			mapped.append(_summary_to_ui(r))
	inbox = mapped
	next_cursor = ""
	has_more_pages = false
	if data.has("unread_count"):
		_set_unread(int(data.get("unread_count", 0)))
	else:
		mail_changed.emit()
	inbox_loaded.emit(inbox)
	return inbox


func refresh_unread() -> int:
	var res: Dictionary = await GameApiClient.invoke("GetInbox", {"folder": "inbox", "limit": 1})
	if bool(res.get("ok", false)):
		var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
		_set_unread(int(data.get("unread_count", 0)))
	return unread_count


func load_message(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	await load_mail(mail_folder)
	for m in inbox:
		if typeof(m) == TYPE_DICTIONARY and str(m.get("id", "")) == mail_id:
			selected_message = m
			message_loaded.emit(selected_message)
			return {"ok": true, "success": true, "data": selected_message, "error": ""}
	return _fail("Mail not found")


func mark_read(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("MarkMailRead", {"mail_id": mail_id, "read": true})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "Mark read failed")))
	for m in inbox:
		if typeof(m) == TYPE_DICTIONARY and str(m.get("id", "")) == mail_id:
			m["read"] = true
	mail_read_changed.emit(mail_id, true)
	await refresh_unread()
	return {"ok": true, "success": true, "data": res.get("data", {}), "error": ""}


func mark_unread(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("MarkMailRead", {"mail_id": mail_id, "read": false})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "Mark unread failed")))
	for m in inbox:
		if typeof(m) == TYPE_DICTIONARY and str(m.get("id", "")) == mail_id:
			m["read"] = false
	mail_read_changed.emit(mail_id, false)
	await refresh_unread()
	return {"ok": true, "success": true, "data": res.get("data", {}), "error": ""}


func delete_mail(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("DeleteMail", {"mail_id": mail_id})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "Delete failed")))
	await load_mail(mail_folder)
	mail_deleted.emit(mail_id)
	return {"ok": true, "success": true, "data": res.get("data", {}), "error": ""}


func restore_mail(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("RestoreMail", {"mail_id": mail_id})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "Restore failed")))
	await load_mail(mail_folder)
	return {"ok": true, "success": true, "data": res.get("data", {}), "error": ""}


func claim_attachments(mail_id: String, _target_character_id: String = "") -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("ClaimMailReward", {"mail_id": mail_id})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "Claim failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if CurrencyManager != null and CurrencyManager.has_method("load_wallet"):
		await CurrencyManager.load_wallet()
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(str(GameManager.active_character.get("id", "")))
	await load_mail(mail_folder)
	attachments_claimed.emit(data)
	return {"ok": true, "success": true, "data": data, "error": ""}


## Compatibility alias for legacy SocialManager.claim_mail callers.
func claim_mail(mail_id: String) -> Dictionary:
	return await claim_attachments(mail_id)


func send_player_mail(recipient_user_id: String, subject: String, body: String) -> Dictionary:
	if recipient_user_id.is_empty():
		return _fail("Missing recipient")
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("SendMail", {
		"to_character_id": recipient_user_id,
		"subject": subject,
		"body": body,
	})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "Send failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	mail_sent.emit(data)
	return {"ok": true, "success": true, "data": data, "error": ""}


## Legacy compose path — accepts friend/character dict; prefers character id.
func send_player_mail_to(target: Dictionary, subject: String, body: String) -> Dictionary:
	var rid := str(target.get("id", target.get("character_id", target.get("user_id", ""))))
	return await send_player_mail(rid, subject, body)


## Hydrate friend (+ guild) recipients with authoritative name/level like web MailPage.
## Callers may also mail any character via a forced recipient (profile / rankings).
func mail_compose_recipients() -> Array:
	var ids: Array = []
	var seen := {}
	var mine := ""
	if GameManager != null and typeof(GameManager.active_character) == TYPE_DICTIONARY:
		mine = str(GameManager.active_character.get("id", ""))

	if SocialManager != null:
		await SocialManager.load_social_state()
		for f in SocialManager.friendships:
			if typeof(f) != TYPE_DICTIONARY:
				continue
			var oid := SocialManager.friend_other_id(f)
			if oid.is_empty() or oid == mine or seen.has(oid):
				continue
			seen[oid] = true
			ids.append(oid)

		# Web also includes guild mates as compose targets.
		await SocialManager.load_my_guild()
		for m in SocialManager.guild_members:
			if typeof(m) != TYPE_DICTIONARY:
				continue
			var mid := str(m.get("character_id", m.get("id", "")))
			if mid.is_empty() or mid == mine or seen.has(mid):
				continue
			seen[mid] = true
			ids.append(mid)

	if ids.is_empty():
		return []

	var res: Dictionary = await GameApiClient.invoke("GetCharactersByIds", {"ids": ids})
	if not bool(res.get("ok", false)):
		# Fallback: show ids only if hydrate fails (should be rare).
		var fallback: Array = []
		for oid2 in ids:
			fallback.append({"id": str(oid2), "name": str(oid2), "level": 1})
		return fallback

	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var chars: Array = data.get("characters", []) if typeof(data.get("characters", [])) == TYPE_ARRAY else []
	var out: Array = []
	var got := {}
	for c in chars:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cid := str(c.get("id", ""))
		if cid.is_empty() or got.has(cid):
			continue
		got[cid] = true
		var nm := str(c.get("name", "")).strip_edges()
		if nm.is_empty():
			nm = cid
		out.append({
			"id": cid,
			"character_id": cid,
			"user_id": cid,
			"name": nm,
			"level": int(c.get("level", 1)),
			"class": str(c.get("class", "")),
			"race": str(c.get("race", "")),
		})
	# Preserve any unresolved ids at the end so compose still works.
	for oid3 in ids:
		var sid := str(oid3)
		if not got.has(sid):
			out.append({"id": sid, "character_id": sid, "user_id": sid, "name": sid, "level": 1})
	return out
