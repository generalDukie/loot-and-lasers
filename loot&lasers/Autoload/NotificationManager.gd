extends Node
## AppNotification inbox — list, mark read, friend-request actions.

signal notifications_changed

var notifications: Array = []
var unread_count: int = 0
var _busy := false


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
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/AppNotification/filter",
		{"query": {"owner_id": cid}, "sort": "-created_date", "limit": 50}, true
	)
	notifications = res.data if res.ok and typeof(res.data) == TYPE_ARRAY else []
	unread_count = 0
	for n in notifications:
		if typeof(n) == TYPE_DICTIONARY and not bool(n.get("read", false)):
			unread_count += 1
	notifications_changed.emit()
	return notifications


func refresh_unread() -> int:
	var cid := char_id()
	if cid.is_empty():
		unread_count = 0
		return 0
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/AppNotification/filter",
		{"query": {"owner_id": cid, "read": false}, "sort": "-created_date", "limit": 100}, true
	)
	unread_count = res.data.size() if res.ok and typeof(res.data) == TYPE_ARRAY else 0
	notifications_changed.emit()
	return unread_count


func mark_read(notification_id: String) -> Dictionary:
	if notification_id.is_empty():
		return {"ok": false, "error": "Missing id"}
	var res: Dictionary = await GameApiClient.request(
		"PATCH", "/api/entities/AppNotification/%s" % notification_id.uri_encode(),
		{"read": true}, true
	)
	if res.ok:
		await load_inbox()
	return res


func mark_all_read() -> Dictionary:
	var cid := char_id()
	if cid.is_empty():
		return {"ok": false, "error": "No character"}
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/AppNotification/update-many",
		{"query": {"owner_id": cid, "read": false}, "update": {"$set": {"read": true}}}, true
	)
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
			await GameApiClient.request("POST", "/api/entities/AppNotification", {
				"owner_id": str(request.get("from_character_id", "")),
				"type": "system",
				"title": str(me.get("name", "")),
				"body": "accepted your friend request",
				"read": false,
			}, true)
	else:
		result = await SocialManager.decline_friend(request)
	await mark_read(nid)
	_busy = false
	return result
