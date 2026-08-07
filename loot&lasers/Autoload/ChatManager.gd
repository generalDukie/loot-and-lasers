extends Node
## Global chat + DMs — Node SendMessage / GetChatHistory (Restoration 23).
## Live fan-out: one Node WebSocket ChatMessage event → one upsert by server id.

signal global_message_received(message: Dictionary)
signal dm_received(message: Dictionary)
signal message_sent(message: Dictionary)
signal global_history_loaded(messages: Array)
signal dm_history_loaded(user_id: String, messages: Array)
signal conversation_read(user_id: String)
signal unread_changed(total: int)
signal chat_error(error: String)
signal connection_changed(connected: bool)

## Temporary diagnostics — remove after chat dupes are validated in play.
const CHAT_DEBUG := true

var global_messages: Array = []
var conversations: Dictionary = {} # user_id -> { messages: [], unread: int }
var _global_joined := false
var _active_dm_user := ""
var _busy := false
var _chat_event_bound := false


func _ready() -> void:
	print("[ChatManager] ready (Node chat)")
	if not RealtimeManager.nakama_connection_changed.is_connected(_on_rt_connection):
		RealtimeManager.nakama_connection_changed.connect(_on_rt_connection)
	if not RealtimeManager.nakama_channel_message.is_connected(_on_channel_message):
		RealtimeManager.nakama_channel_message.connect(_on_channel_message)
	_ensure_node_chat_binds()


func _ensure_node_chat_binds() -> void:
	if _chat_event_bound:
		return
	if not RealtimeManager.chat_event.is_connected(_on_node_chat_event):
		RealtimeManager.chat_event.connect(_on_node_chat_event)
	_chat_event_bound = true
	_debug_subs("bind_node_chat")


func _debug_subs(reason: String) -> void:
	if not CHAT_DEBUG:
		return
	var node_ws := 1 if RealtimeManager.has_node_ws() else 0
	var nakama_ws := 1 if RealtimeManager.is_nakama_connected() else 0
	var chat_listeners := RealtimeManager.chat_event_listener_count()
	var channel_listeners := RealtimeManager.nakama_channel_listener_count()
	print("[chat-diag] %s node_ws=%d nakama_ws=%d chat_event_listeners=%d nakama_channel_listeners=%d global_joined=%s channel=%s" % [
		reason,
		node_ws,
		nakama_ws,
		chat_listeners,
		channel_listeners,
		_global_joined,
		RealtimeManager.global_channel_id(),
	])


## Avoid naming this is_connected() — that overrides Object.is_connected (signals).
func is_nakama_connected() -> bool:
	return RealtimeManager.is_nakama_connected()


func get_global_messages() -> Array:
	return global_messages


func get_conversation(user_id: String) -> Dictionary:
	return conversations.get(user_id, {"messages": [], "unread": 0})


func get_unread_count(user_id: String) -> int:
	var c: Dictionary = get_conversation(user_id)
	return int(c.get("unread", 0))


func get_total_unread_count() -> int:
	var total := 0
	for k in conversations.keys():
		total += int(conversations[k].get("unread", 0))
	return total


func message_id_of(message: Dictionary) -> String:
	var mid := str(message.get("id", "")).strip_edges()
	if not mid.is_empty():
		return mid
	return str(message.get("message_id", "")).strip_edges()


func _on_rt_connection(connected: bool) -> void:
	connection_changed.emit(connected)
	_debug_subs("nakama_connection_%s" % connected)


func _on_node_chat_event(entity: String, data: Variant) -> void:
	if entity != "ChatMessage":
		return
	if typeof(data) != TYPE_DICTIONARY:
		return
	var msg: Dictionary = data
	var inserted := upsert_global_message(msg, "server_broadcast")
	if inserted:
		global_message_received.emit(msg)


func _on_channel_message(message: Dictionary) -> void:
	# Legacy Nakama room path — still upsert by id so it cannot double-insert.
	var channel := str(message.get("channel_id", ""))
	var room := str(message.get("room_name", ""))
	if channel == "global" or room == "global" or channel.contains("global"):
		var normalized := message.duplicate(true)
		if str(normalized.get("id", "")).is_empty() and not str(normalized.get("message_id", "")).is_empty():
			normalized["id"] = str(normalized.get("message_id", ""))
		var inserted := upsert_global_message(normalized, "nakama_channel")
		if inserted:
			global_message_received.emit(normalized)
		return
	var sender := str(message.get("sender_user_id", ""))
	if sender.is_empty():
		return
	if not conversations.has(sender):
		conversations[sender] = {"messages": [], "unread": 0}
	if not upsert_dm_message(sender, message, "nakama_channel"):
		return
	if sender != _active_dm_user:
		conversations[sender]["unread"] = int(conversations[sender].get("unread", 0)) + 1
		unread_changed.emit(get_total_unread_count())
	dm_received.emit(message)


## Returns true when a new message was inserted; false when id already existed (updated in place).
func upsert_global_message(message: Dictionary, source: String) -> bool:
	if message.is_empty():
		return false
	var mid := message_id_of(message)
	var sender := str(message.get("sender_id", message.get("sender_name", "")))
	if mid.is_empty():
		# No server id — refuse to invent duplicates from content alone.
		if CHAT_DEBUG:
			print("[chat] skip insert (missing id) source=%s sender=%s" % [source, sender])
		return false
	for i in range(global_messages.size()):
		var existing: Variant = global_messages[i]
		if typeof(existing) != TYPE_DICTIONARY:
			continue
		if message_id_of(existing) == mid:
			global_messages[i] = message
			if CHAT_DEBUG:
				print("[chat] ignore duplicate id=%s source=%s sender=%s" % [mid, source, sender])
			return false
	global_messages.append(message)
	if CHAT_DEBUG:
		print("[chat] insert id=%s source=%s sender=%s" % [mid, source, sender])
	return true


func upsert_dm_message(user_id: String, message: Dictionary, source: String) -> bool:
	if user_id.is_empty() or message.is_empty():
		return false
	if not conversations.has(user_id):
		conversations[user_id] = {"messages": [], "unread": 0}
	var msgs: Array = conversations[user_id]["messages"]
	var mid := message_id_of(message)
	if mid.is_empty():
		if CHAT_DEBUG:
			print("[chat] skip dm insert (missing id) source=%s user=%s" % [source, user_id])
		return false
	for i in range(msgs.size()):
		var existing: Variant = msgs[i]
		if typeof(existing) != TYPE_DICTIONARY:
			continue
		if message_id_of(existing) == mid:
			msgs[i] = message
			if CHAT_DEBUG:
				print("[chat] ignore dm duplicate id=%s source=%s" % [mid, source])
			return false
	msgs.append(message)
	conversations[user_id]["messages"] = msgs
	if CHAT_DEBUG:
		print("[chat] insert dm id=%s source=%s user=%s" % [mid, source, user_id])
	return true


func join_global_chat() -> Dictionary:
	# Idempotent: one Nakama room join per session.
	if _global_joined and not RealtimeManager.global_channel_id().is_empty():
		_debug_subs("join_global_already")
		return {"ok": true, "channel_id": RealtimeManager.global_channel_id(), "cached": true}
	var res: Dictionary = await RealtimeManager.join_global_chat()
	_global_joined = bool(res.get("ok", false))
	_debug_subs("join_global")
	return res


func leave_global_chat() -> void:
	await RealtimeManager.leave_global_chat()
	_global_joined = false
	_debug_subs("leave_global")


func send_global_message(content: String) -> Dictionary:
	if _busy:
		return {"ok": false, "error": "Chat busy"}
	_busy = true
	var res: Dictionary = await GameApiClient.invoke("SendMessage", {
		"channel": "global",
		"content": content,
	})
	_busy = false
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "send failed"))
		chat_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var msg: Dictionary = data.get("message", {}) if typeof(data.get("message", {})) == TYPE_DICTIONARY else {}
	if not msg.is_empty():
		# Local confirmation — WS broadcast for the same id must not insert a second copy.
		var inserted := upsert_global_message(msg, "local_send")
		if inserted:
			message_sent.emit(msg)
		else:
			# Already present from a racing broadcast; still notify UI to refresh that row if needed.
			message_sent.emit(msg)
	return {"ok": true, "error": "", "data": data}


func load_global_history(_cursor: String = "") -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetChatHistory", {"channel": "global", "limit": 50})
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "history failed"))
		chat_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var msgs: Array = data.get("messages", []) if typeof(data.get("messages", [])) == TYPE_ARRAY else []
	global_messages = _dedupe_messages(msgs)
	if CHAT_DEBUG:
		print("[chat] history loaded count=%d (deduped from %d) source=cached_history" % [
			global_messages.size(), msgs.size()
		])
	global_history_loaded.emit(global_messages)
	return {"ok": true, "error": "", "data": data}


func _dedupe_messages(msgs: Array) -> Array:
	var out: Array = []
	var seen: Dictionary = {}
	for m in msgs:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		var mid := message_id_of(m)
		if mid.is_empty():
			out.append(m)
			continue
		if seen.has(mid):
			continue
		seen[mid] = true
		out.append(m)
	return out


func open_dm(user_id: String) -> Dictionary:
	_active_dm_user = user_id
	return await load_dm_history(user_id)


func send_dm(user_id: String, content: String) -> Dictionary:
	if _busy:
		return {"ok": false, "error": "Chat busy"}
	_busy = true
	var res: Dictionary = await GameApiClient.invoke("SendMessage", {
		"channel": "private",
		"recipient_id": user_id,
		"content": content,
	})
	_busy = false
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "DM failed"))
		chat_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var msg: Dictionary = data.get("message", {}) if typeof(data.get("message", {})) == TYPE_DICTIONARY else {}
	if not conversations.has(user_id):
		conversations[user_id] = {"messages": [], "unread": 0}
	if not msg.is_empty():
		upsert_dm_message(user_id, msg, "local_send")
		message_sent.emit(msg)
	return {"ok": true, "error": "", "data": data}


func load_dm_history(user_id: String, _cursor: String = "") -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetChatHistory", {
		"channel": "private",
		"recipient_id": user_id,
		"limit": 50,
	})
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "DM history failed"))
		chat_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var msgs: Array = data.get("messages", []) if typeof(data.get("messages", [])) == TYPE_ARRAY else []
	if not conversations.has(user_id):
		conversations[user_id] = {"messages": [], "unread": 0}
	conversations[user_id]["messages"] = _dedupe_messages(msgs)
	dm_history_loaded.emit(user_id, conversations[user_id]["messages"])
	return {"ok": true, "error": "", "data": data}


func mark_conversation_read(user_id: String) -> Dictionary:
	var conv_id := ""
	var hist: Dictionary = await GameApiClient.invoke("GetChatHistory", {
		"channel": "private",
		"recipient_id": user_id,
		"limit": 1,
	})
	if bool(hist.get("ok", false)) and typeof(hist.get("data", {})) == TYPE_DICTIONARY:
		conv_id = str(hist.data.get("conversation_id", ""))
	if not conv_id.is_empty():
		await GameApiClient.invoke("MarkConversationRead", {"conversation_id": conv_id})
	if conversations.has(user_id):
		conversations[user_id]["unread"] = 0
	unread_changed.emit(get_total_unread_count())
	conversation_read.emit(user_id)
	return {"ok": true, "error": ""}


## Legacy aliases used by messages.gd
func char_id() -> String:
	return str(GameManager.active_character.get("id", ""))


func list_conversations() -> Array:
	var out: Array = []
	for uid in conversations.keys():
		out.append({
			"participant_ids": [uid],
			"user_id": uid,
			"last_message_preview": "",
		})
	return out


func other_participant(conversation: Dictionary) -> String:
	return str(conversation.get("user_id", conversation.get("id", "")))


func load_thread(conversation_id: String) -> Array:
	var res: Dictionary = await load_dm_history(conversation_id)
	if res.get("ok", false):
		return get_conversation(conversation_id).get("messages", [])
	return []


func mark_read(conversation_id: String) -> void:
	await mark_conversation_read(conversation_id)


func send_private(recipient_id: String, content: String) -> Dictionary:
	return await send_dm(recipient_id, content)


func send_global(content: String) -> Dictionary:
	return await send_global_message(content)


func load_global() -> Array:
	var res: Dictionary = await load_global_history()
	if res.get("ok", false):
		return global_messages
	return []


func clear_account_chat_cache() -> void:
	global_messages = []
	conversations.clear()
	_active_dm_user = ""
	_global_joined = false
	unread_changed.emit(0)
