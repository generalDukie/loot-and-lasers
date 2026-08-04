extends Node
## Global chat + DMs — Node SendMessage / GetChatHistory (Restoration 23).
## Nakama socket remains optional transport for live channel events.

signal global_message_received(message: Dictionary)
signal dm_received(message: Dictionary)
signal message_sent(message: Dictionary)
signal global_history_loaded(messages: Array)
signal dm_history_loaded(user_id: String, messages: Array)
signal conversation_read(user_id: String)
signal unread_changed(total: int)
signal chat_error(error: String)
signal connection_changed(connected: bool)

var global_messages: Array = []
var conversations: Dictionary = {} # user_id -> { messages: [], unread: int }
var _global_joined := false
var _active_dm_user := ""
var _busy := false


func _ready() -> void:
	print("[ChatManager] ready (Node chat)")
	if not RealtimeManager.nakama_connection_changed.is_connected(_on_rt_connection):
		RealtimeManager.nakama_connection_changed.connect(_on_rt_connection)
	if not RealtimeManager.nakama_channel_message.is_connected(_on_channel_message):
		RealtimeManager.nakama_channel_message.connect(_on_channel_message)


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


func _rid(prefix: String) -> String:
	return "%s-%s-%s" % [prefix, Time.get_ticks_msec(), randi()]


func _on_rt_connection(connected: bool) -> void:
	connection_changed.emit(connected)


func _on_channel_message(message: Dictionary) -> void:
	var channel := str(message.get("channel_id", ""))
	if channel == "global" or str(message.get("room_name", "")) == "global":
		global_messages.append(message)
		global_message_received.emit(message)
		return
	var sender := str(message.get("sender_user_id", ""))
	if sender.is_empty():
		return
	if not conversations.has(sender):
		conversations[sender] = {"messages": [], "unread": 0}
	conversations[sender]["messages"].append(message)
	if sender != _active_dm_user:
		conversations[sender]["unread"] = int(conversations[sender].get("unread", 0)) + 1
		unread_changed.emit(get_total_unread_count())
	dm_received.emit(message)


func join_global_chat() -> Dictionary:
	var res: Dictionary = await RealtimeManager.join_global_chat()
	_global_joined = bool(res.get("ok", false))
	return res


func leave_global_chat() -> void:
	await RealtimeManager.leave_global_chat()
	_global_joined = false


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
		global_messages.append(msg)
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
	global_messages = msgs
	global_history_loaded.emit(msgs)
	return {"ok": true, "error": "", "data": data}


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
		conversations[user_id]["messages"].append(msg)
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
	conversations[user_id]["messages"] = msgs
	dm_history_loaded.emit(user_id, msgs)
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
