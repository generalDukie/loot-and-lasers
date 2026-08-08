extends Node
## AppNotification inbox — Node GetNotifications / MarkRead (Restoration 22).
## Presentation only: Godot never creates authoritative gameplay alerts.

signal notifications_changed

const UNREAD_REFRESH_TTL_MS := 15000

var notifications: Array = []
var unread_count: int = 0
var _busy := false
var _unread_refresh_ms := 0


func _ready() -> void:
	print("[NotificationManager] ready")


func clear_local() -> void:
	notifications = []
	unread_count = 0
	_busy = false
	notifications_changed.emit()


func char_id() -> String:
	return str(GameManager.active_character.get("id", ""))


func load_inbox() -> Array:
	var cid := char_id()
	if cid.is_empty():
		notifications = []
		unread_count = 0
		notifications_changed.emit()
		return notifications
	var res: Dictionary = await GameApiClient.invoke("GetNotifications", {"limit": 50})
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var rows: Variant = res.data.get("notifications", [])
		var raw: Array = rows if typeof(rows) == TYPE_ARRAY else []
		notifications = _filter_by_prefs(raw)
		unread_count = 0
		for n in notifications:
			if typeof(n) == TYPE_DICTIONARY and not bool(n.get("read", false)):
				unread_count += 1
	else:
		notifications = []
		unread_count = 0
	notifications_changed.emit()
	return notifications


func refresh_unread(force: bool = false) -> int:
	var cid := char_id()
	if cid.is_empty():
		unread_count = 0
		return 0
	var now := Time.get_ticks_msec()
	if not force and now - _unread_refresh_ms < UNREAD_REFRESH_TTL_MS:
		return unread_count
	var res: Dictionary = await GameApiClient.invoke("GetNotifications", {
		"unread_only": true,
		"limit": 100,
	})
	_unread_refresh_ms = Time.get_ticks_msec()
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var counts: Variant = res.data.get("counts", {})
		if typeof(counts) == TYPE_DICTIONARY:
			unread_count = int(counts.get("total", 0))
		else:
			var rows: Variant = res.data.get("notifications", [])
			unread_count = rows.size() if typeof(rows) == TYPE_ARRAY else 0
	else:
		unread_count = 0
	notifications_changed.emit()
	return unread_count


func mark_read(notification_id: String) -> Dictionary:
	if notification_id.is_empty():
		return {"ok": false, "error": "Missing id"}
	var res: Dictionary = await GameApiClient.invoke("MarkNotificationRead", {"id": notification_id})
	if res.ok:
		await load_inbox()
	return res


func mark_all_read() -> Dictionary:
	var cid := char_id()
	if cid.is_empty():
		return {"ok": false, "error": "No character"}
	var res: Dictionary = await GameApiClient.invoke("MarkAllNotificationsRead", {})
	if res.ok:
		await load_inbox()
	return res


func dismiss(notification_id: String) -> Dictionary:
	if notification_id.is_empty():
		return {"ok": false, "error": "Missing id"}
	var res: Dictionary = await GameApiClient.invoke("DismissNotification", {"id": notification_id})
	if res.ok:
		await load_inbox()
	return res


## Accept/decline friend_request notifications via related FriendRequest id.
func act_on(notification: Dictionary, accept: bool) -> Dictionary:
	if _busy:
		return {"ok": false, "error": "Busy"}
	_busy = true
	var ntype := str(notification.get("type", ""))
	var nid := str(notification.get("id", ""))
	if ntype != "friend_request":
		var just_read := await mark_read(nid)
		_busy = false
		return just_read
	var related := str(notification.get("related_id", ""))
	if related.is_empty():
		await mark_read(nid)
		_busy = false
		return {"ok": false, "error": "Missing friend request"}
	var req_res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/FriendRequest/%s" % related.uri_encode(), null, true
	)
	if not req_res.ok or typeof(req_res.data) != TYPE_DICTIONARY:
		await mark_read(nid)
		_busy = false
		return {"ok": false, "error": "Friend request not found"}
	var request: Dictionary = req_res.data
	var status := str(request.get("status", ""))
	var result: Dictionary
	if status != "pending":
		result = {"ok": true, "already_resolved": true}
	elif accept:
		result = await SocialManager.accept_friend(request)
		if result.ok:
			var me := GameManager.active_character
			await GameApiClient.invoke("CreateNotification", {
				"owner_id": str(request.get("from_character_id", "")),
				"type": "system",
				"title": str(me.get("name", "")),
				"body": "accepted your friend request",
			})
	else:
		result = await SocialManager.decline_friend(request)
	await mark_read(nid)
	_busy = false
	return result


func _filter_by_prefs(rows: Array) -> Array:
	var out: Array = []
	for row in rows:
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var ntype := str((row as Dictionary).get("type", ""))
		if SettingsManager != null and not SettingsManager.allows_notification_type(ntype):
			continue
		out.append(row)
	return out
