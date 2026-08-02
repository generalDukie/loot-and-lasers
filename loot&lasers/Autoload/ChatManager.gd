extends Node
## Private DMs + global station chat via SendMessage / entity filters.


func _ready() -> void:
	print("[ChatManager] ready")


func char_id() -> String:
	return str(GameManager.active_character.get("id", ""))


func list_conversations() -> Array:
	var me := char_id()
	if me.is_empty():
		return []
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/PrivateConversation?sort=-last_message_at&limit=100", null, true
	)
	if not res.ok or typeof(res.data) != TYPE_ARRAY:
		return []
	var out: Array = []
	for c in res.data:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var parts: Variant = c.get("participant_ids", [])
		if typeof(parts) == TYPE_ARRAY and me in parts:
			out.append(c)
	return out


func other_participant(conversation: Dictionary) -> String:
	var me := char_id()
	var parts: Variant = conversation.get("participant_ids", [])
	if typeof(parts) != TYPE_ARRAY:
		return ""
	for p in parts:
		if str(p) != me:
			return str(p)
	return ""


func load_thread(conversation_id: String) -> Array:
	if conversation_id.is_empty():
		return []
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entities/PrivateMessage/filter",
		{"query": {"conversation_id": conversation_id}, "sort": "-created_date", "limit": 50}, true
	)
	if not res.ok or typeof(res.data) != TYPE_ARRAY:
		return []
	var msgs: Array = res.data.duplicate()
	msgs.reverse() # oldest first for UI
	return msgs


func mark_read(conversation_id: String) -> void:
	var me := char_id()
	if conversation_id.is_empty() or me.is_empty():
		return
	await ApiClient.request("POST", "/api/entities/PrivateMessage/update-many", {
		"query": {
			"conversation_id": conversation_id,
			"recipient_id": me,
			"read_by_recipient": false,
		},
		"update": {"$set": {"read_by_recipient": true}},
	}, true)
	# Web markConversationRead also clears related private_message notifications.
	var notifs: Dictionary = await ApiClient.request(
		"POST", "/api/entities/AppNotification/filter",
		{
			"query": {
				"owner_id": me,
				"type": "private_message",
				"related_id": conversation_id,
				"read": false,
			},
			"limit": 50,
		},
		true
	)
	if notifs.ok and typeof(notifs.data) == TYPE_ARRAY:
		for n in notifs.data:
			if typeof(n) != TYPE_DICTIONARY:
				continue
			var nid := str(n.get("id", ""))
			if nid.is_empty():
				continue
			await ApiClient.request(
				"PATCH", "/api/entities/AppNotification/%s" % nid.uri_encode(),
				{"read": true}, true
			)


func send_private(recipient_id: String, content: String) -> Dictionary:
	var text := content.strip_edges()
	if recipient_id.is_empty() or text.is_empty():
		return {"ok": false, "error": "Missing recipient or message"}
	if text.length() > 280:
		return {"ok": false, "error": "Max 280 characters"}
	return await ApiClient.invoke("SendMessage", {
		"channel": "private",
		"recipient_id": recipient_id,
		"content": text,
	})


func send_global(content: String) -> Dictionary:
	var text := content.strip_edges()
	if text.is_empty():
		return {"ok": false, "error": "Empty message"}
	if text.length() > 280:
		return {"ok": false, "error": "Max 280 characters"}
	return await ApiClient.invoke("SendMessage", {
		"channel": "global",
		"content": text,
	})


func load_global(limit: int = 40) -> Array:
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/ChatMessage?sort=-created_date&limit=%s" % clampi(limit, 10, 100), null, true
	)
	if not res.ok or typeof(res.data) != TYPE_ARRAY:
		return []
	var msgs: Array = []
	for m in res.data:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		if bool(m.get("deleted", false)):
			continue
		msgs.append(m)
	msgs.reverse()
	return msgs
