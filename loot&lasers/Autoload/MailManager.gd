extends Node
## Phase 20 — Account-level mail (Nakama MailService).
## UI scripts call this manager; do not invoke mail RPCs from scenes directly.

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
	print("[MailManager] ready (Nakama mail)")
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
	var sid := str(s.get("mail_id", ""))
	return {
		"id": sid,
		"mail_id": sid,
		"subject": str(s.get("subject", "")),
		"body": str(s.get("preview", "")),
		"from_name": str(s.get("sender_display_name", "")),
		"to_name": "",
		"mail_type": _map_type_to_ui(str(s.get("type", ""))),
		"folder": str(s.get("mailbox", mail_folder)),
		"read": bool(s.get("read", false)),
		"has_rewards": bool(s.get("has_unclaimed_attachments", false)),
		"claimed": not bool(s.get("has_unclaimed_attachments", false)),
		"created_date": str(s.get("created_at", "")),
		"expires_at": str(s.get("expires_at", "")),
		"preview": str(s.get("preview", "")),
	}


func _full_to_ui(m: Dictionary) -> Dictionary:
	var sid := str(m.get("mail_id", ""))
	var sender: Dictionary = m.get("sender", {}) if typeof(m.get("sender", {})) == TYPE_DICTIONARY else {}
	var unclaimed := bool(m.get("has_unclaimed_attachments", false))
	var mailbox := str(m.get("mailbox", mail_folder))
	if bool(m.get("deleted", false)):
		mailbox = "deleted"
	return {
		"id": sid,
		"mail_id": sid,
		"subject": str(m.get("subject", "")),
		"body": str(m.get("body", "")),
		"from_name": str(sender.get("display_name", "")),
		"from_id": str(sender.get("sender_user_id", "")),
		"to_name": "",
		"mail_type": _map_type_to_ui(str(m.get("type", ""))),
		"folder": mailbox,
		"read": bool(m.get("read", false)),
		"has_rewards": unclaimed,
		"claimed": not unclaimed and typeof(m.get("attachments", [])) == TYPE_ARRAY and (m.get("attachments") as Array).size() > 0,
		"attachments": m.get("attachments", []),
		"created_date": str(m.get("created_at", "")),
		"expires_at": str(m.get("expires_at", "")),
		"expired": bool(m.get("expired", false)),
		"target_character_id": str(m.get("target_character_id", "")),
	}


func _on_rt_connection(connected: bool) -> void:
	if connected:
		await refresh_unread()


func _on_nakama_notification(n: Dictionary) -> void:
	var code := int(n.get("code", -1))
	if code != 20:
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
	var payload := {
		"limit": int(filters.get("limit", 30)),
		"cursor": cursor,
		"folder": mail_folder,
		"include_archived": bool(filters.get("include_archived", false)),
	}
	if bool(filters.get("unread_only", false)):
		payload["unread_only"] = true
	if bool(filters.get("attachments_only", false)):
		payload["attachments_only"] = true
	var res: Dictionary = await NakamaManager.invoke_rpc("mail_get_inbox", payload)
	_busy = false
	_set_loading(false)
	if not bool(res.get("success", false)):
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
	if cursor.is_empty():
		inbox = mapped
	else:
		inbox.append_array(mapped)
	next_cursor = str(data.get("next_cursor", ""))
	has_more_pages = bool(data.get("has_more", false))
	if data.has("unread_count"):
		_set_unread(int(data.get("unread_count", 0)))
	else:
		mail_changed.emit()
	inbox_loaded.emit(inbox)
	return inbox


func refresh_unread() -> int:
	var res: Dictionary = await NakamaManager.invoke_rpc("mail_get_unread_count", {})
	if bool(res.get("success", false)):
		var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
		_set_unread(int(data.get("unread_count", 0)))
	return unread_count


func load_message(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_loading(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("mail_get_message", {"mail_id": mail_id})
	_set_loading(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "Failed to load message")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var mail: Dictionary = data.get("mail", {}) if typeof(data.get("mail", {})) == TYPE_DICTIONARY else {}
	selected_message = _full_to_ui(mail)
	message_loaded.emit(selected_message)
	return {"ok": true, "success": true, "data": selected_message, "error": ""}


func mark_read(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("mail_mark_read", {"mail_id": mail_id})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "Mark read failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if data.has("unread_count"):
		_set_unread(int(data.get("unread_count", unread_count)))
	for m in inbox:
		if typeof(m) == TYPE_DICTIONARY and str(m.get("id", "")) == mail_id:
			m["read"] = true
	mail_read_changed.emit(mail_id, true)
	mail_changed.emit()
	return {"ok": true, "success": true, "data": data, "error": ""}


func mark_unread(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("mail_mark_unread", {"mail_id": mail_id})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "Mark unread failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if data.has("unread_count"):
		_set_unread(int(data.get("unread_count", unread_count)))
	for m in inbox:
		if typeof(m) == TYPE_DICTIONARY and str(m.get("id", "")) == mail_id:
			m["read"] = false
	mail_read_changed.emit(mail_id, false)
	mail_changed.emit()
	return {"ok": true, "success": true, "data": data, "error": ""}


func delete_mail(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("mail_delete", {
		"mail_id": mail_id,
		"request_id": _rid("mdel"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "Delete failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if data.has("unread_count"):
		_set_unread(int(data.get("unread_count", unread_count)))
	await load_mail(mail_folder)
	mail_deleted.emit(mail_id)
	return {"ok": true, "success": true, "data": data, "error": ""}


func restore_mail(mail_id: String) -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("mail_delete", {
		"mail_id": mail_id,
		"restore": true,
		"request_id": _rid("mres"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "Restore failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if data.has("unread_count"):
		_set_unread(int(data.get("unread_count", unread_count)))
	await load_mail(mail_folder)
	return {"ok": true, "success": true, "data": data, "error": ""}


func claim_attachments(mail_id: String, target_character_id: String = "") -> Dictionary:
	if mail_id.is_empty():
		return _fail("Missing mail_id")
	if target_character_id.is_empty():
		target_character_id = str(GameManager.active_character.get("id", ""))
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("mail_claim_attachments", {
		"mail_id": mail_id,
		"target_character_id": target_character_id,
		"request_id": _rid("mclaim"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "Claim failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if CurrencyManager != null and CurrencyManager.has_method("load_wallet"):
		await CurrencyManager.load_wallet()
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(target_character_id)
	if data.has("mail") and typeof(data.get("mail")) == TYPE_DICTIONARY:
		selected_message = _full_to_ui(data.get("mail"))
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
	var res: Dictionary = await NakamaManager.invoke_rpc("mail_send_player_text", {
		"recipient_user_id": recipient_user_id,
		"subject": subject,
		"body": body,
		"request_id": _rid("msend"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "Send failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	mail_sent.emit(data)
	return {"ok": true, "success": true, "data": data, "error": ""}


## Legacy compose path — accepts friend/character dict; prefers user_id.
func send_player_mail_to(target: Dictionary, subject: String, body: String) -> Dictionary:
	var rid := str(target.get("user_id", target.get("id", "")))
	return await send_player_mail(rid, subject, body)


func mail_compose_recipients() -> Array:
	var out: Array = []
	var seen := {}
	if SocialManager != null:
		await SocialManager.load_social_state()
		for f in SocialManager.friendships:
			if typeof(f) != TYPE_DICTIONARY:
				continue
			var oid := SocialManager.friend_other_id(f)
			if oid.is_empty() or seen.has(oid):
				continue
			seen[oid] = true
			out.append({
				"id": oid,
				"user_id": oid,
				"name": str(f.get("display_name", f.get("username", oid))),
				"level": 1,
			})
	return out
