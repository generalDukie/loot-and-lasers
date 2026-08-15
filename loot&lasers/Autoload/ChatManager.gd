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

const CHAT_HISTORY_LIMIT := 50
const CONVERSATION_LOOKUP_LIMIT := 1
const MESSAGE_PREVIEW_LENGTH := 80

var global_messages: Array = []
var conversations: Dictionary = {} # peer_character_id -> { messages: [], unread: int, name: String, conversation_id: String }
var _name_by_id: Dictionary = {} # character_id -> display name
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
		return false
	for i in range(global_messages.size()):
		var existing: Variant = global_messages[i]
		if typeof(existing) != TYPE_DICTIONARY:
			continue
		if message_id_of(existing) == mid:
			global_messages[i] = message
			return false
	global_messages.append(message)
	return true


func upsert_dm_message(user_id: String, message: Dictionary, source: String) -> bool:
	if user_id.is_empty() or message.is_empty():
		return false
	if not conversations.has(user_id):
		conversations[user_id] = {"messages": [], "unread": 0}
	var msgs: Array = conversations[user_id]["messages"]
	var mid := message_id_of(message)
	if mid.is_empty():
		return false
	for i in range(msgs.size()):
		var existing: Variant = msgs[i]
		if typeof(existing) != TYPE_DICTIONARY:
			continue
		if message_id_of(existing) == mid:
			msgs[i] = message
			return false
	msgs.append(message)
	conversations[user_id]["messages"] = msgs
	return true


func join_global_chat() -> Dictionary:
	# Idempotent: one Nakama room join per session.
	if _global_joined and not RealtimeManager.global_channel_id().is_empty():
		return {"ok": true, "channel_id": RealtimeManager.global_channel_id(), "cached": true}
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
		# Local confirmation — WS broadcast for the same id must not insert a second copy.
		var inserted := upsert_global_message(msg, "local_send")
		if inserted:
			message_sent.emit(msg)
		else:
			# Already present from a racing broadcast; still notify UI to refresh that row if needed.
			message_sent.emit(msg)
	return {"ok": true, "error": "", "data": data}


func load_global_history(_cursor: String = "") -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke(
		"GetChatHistory",
		{"channel": "global", "limit": CHAT_HISTORY_LIMIT},
	)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "history failed"))
		chat_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var msgs: Array = data.get("messages", []) if typeof(data.get("messages", [])) == TYPE_ARRAY else []
	global_messages = _dedupe_messages(msgs)
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
	var conv_id := str(data.get("conversation_id", "")).strip_edges()
	if not conversations.has(user_id):
		conversations[user_id] = {"messages": [], "unread": 0}
	if not conv_id.is_empty():
		conversations[user_id]["conversation_id"] = conv_id
	if not msg.is_empty():
		if str(msg.get("sender_name", "")).is_empty():
			msg["sender_name"] = str(GameManager.active_character.get("name", "You"))
		upsert_dm_message(user_id, msg, "local_send")
		message_sent.emit(msg)
	return {"ok": true, "error": "", "data": data}


func remember_character_name(character_id: String, display_name: String) -> void:
	var cid := str(character_id).strip_edges()
	var nm := str(display_name).strip_edges()
	if cid.is_empty() or nm.is_empty() or nm == cid:
		return
	_name_by_id[cid] = nm
	if conversations.has(cid):
		conversations[cid]["name"] = nm


func character_display_name(character_id: String, fallback: String = "") -> String:
	var cid := str(character_id).strip_edges()
	if cid.is_empty():
		return fallback
	if _name_by_id.has(cid):
		var cached := str(_name_by_id[cid]).strip_edges()
		if not cached.is_empty():
			return cached
	if conversations.has(cid):
		var nm := str(conversations[cid].get("name", "")).strip_edges()
		if not nm.is_empty() and nm != cid:
			return nm
	var fb := str(fallback).strip_edges()
	if not fb.is_empty() and fb != cid:
		return fb
	return "Unknown operative"


func hydrate_character_names(ids: Array) -> Dictionary:
	## Batch resolve via GetCharactersByIds — one call for many peers.
	var uniq: Array = []
	var seen: Dictionary = {}
	for raw in ids:
		var cid := str(raw).strip_edges()
		if cid.is_empty() or seen.has(cid):
			continue
		seen[cid] = true
		uniq.append(cid)
	if uniq.is_empty():
		return {}
	var res: Dictionary = await GameApiClient.invoke("GetCharactersByIds", {"ids": uniq})
	if not bool(res.get("ok", false)):
		return {}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var chars: Array = data.get("characters", []) if typeof(data.get("characters", [])) == TYPE_ARRAY else []
	var out: Dictionary = {}
	for c in chars:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cid := str(c.get("id", "")).strip_edges()
		var nm := str(c.get("name", "")).strip_edges()
		if cid.is_empty() or nm.is_empty():
			continue
		out[cid] = nm
		remember_character_name(cid, nm)
	return out


func load_dm_history(peer_id: String, conversation_id: String = "") -> Dictionary:
	var body := {"channel": "private", "limit": CHAT_HISTORY_LIMIT}
	var conv := str(conversation_id).strip_edges()
	var peer := str(peer_id).strip_edges()
	if not conv.is_empty():
		body["conversation_id"] = conv
	if not peer.is_empty():
		body["recipient_id"] = peer
	var res: Dictionary = await GameApiClient.invoke("GetChatHistory", body)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "DM history failed"))
		chat_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var msgs: Array = data.get("messages", []) if typeof(data.get("messages", [])) == TYPE_ARRAY else []
	var resolved_peer := str(data.get("other_character_id", peer)).strip_edges()
	if resolved_peer.is_empty():
		resolved_peer = peer
	var resolved_name := str(data.get("other_character_name", "")).strip_edges()
	if not resolved_name.is_empty():
		remember_character_name(resolved_peer, resolved_name)
	for m in msgs:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		remember_character_name(str(m.get("sender_id", "")), str(m.get("sender_name", "")))
	if not resolved_peer.is_empty():
		if not conversations.has(resolved_peer):
			conversations[resolved_peer] = {"messages": [], "unread": 0}
		conversations[resolved_peer]["messages"] = _dedupe_messages(msgs)
		var cid2 := str(data.get("conversation_id", conv)).strip_edges()
		if not cid2.is_empty():
			conversations[resolved_peer]["conversation_id"] = cid2
		if not resolved_name.is_empty():
			conversations[resolved_peer]["name"] = resolved_name
		dm_history_loaded.emit(resolved_peer, conversations[resolved_peer]["messages"])
	return {"ok": true, "error": "", "data": data}


func mark_conversation_read(peer_or_conversation_id: String) -> Dictionary:
	var key := str(peer_or_conversation_id).strip_edges()
	var conv_id := key
	var peer := key
	if conversations.has(key):
		peer = key
		conv_id = str(conversations[key].get("conversation_id", "")).strip_edges()
	if conv_id.is_empty() or conv_id == peer:
		var hist: Dictionary = await GameApiClient.invoke("GetChatHistory", {
			"channel": "private",
			"recipient_id": peer,
			"limit": CONVERSATION_LOOKUP_LIMIT,
		})
		if bool(hist.get("ok", false)) and typeof(hist.get("data", {})) == TYPE_DICTIONARY:
			conv_id = str(hist.data.get("conversation_id", "")).strip_edges()
			var oname := str(hist.data.get("other_character_name", "")).strip_edges()
			var oid := str(hist.data.get("other_character_id", peer)).strip_edges()
			if not oname.is_empty():
				remember_character_name(oid, oname)
	if not conv_id.is_empty():
		await GameApiClient.invoke("MarkConversationRead", {"conversation_id": conv_id})
	if conversations.has(peer):
		conversations[peer]["unread"] = 0
	unread_changed.emit(get_total_unread_count())
	conversation_read.emit(peer)
	return {"ok": true, "error": ""}


## Legacy aliases used by messages.gd
func char_id() -> String:
	return str(GameManager.active_character.get("id", ""))


func list_conversations() -> Array:
	## Prefer server list (names + previews in one response); fall back to local cache + batch names.
	var res: Dictionary = await GameApiClient.invoke("ListPrivateConversations", {})
	if bool(res.get("ok", false)):
		var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
		var rows: Array = data.get("conversations", []) if typeof(data.get("conversations", [])) == TYPE_ARRAY else []
		var out: Array = []
		for c in rows:
			if typeof(c) != TYPE_DICTIONARY:
				continue
			var peer := str(c.get("other_character_id", c.get("user_id", ""))).strip_edges()
			var nm := str(c.get("other_character_name", "")).strip_edges()
			if not peer.is_empty() and not nm.is_empty():
				remember_character_name(peer, nm)
			if not peer.is_empty():
				if not conversations.has(peer):
					conversations[peer] = {"messages": [], "unread": 0}
				conversations[peer]["name"] = nm
				conversations[peer]["conversation_id"] = str(c.get("conversation_id", c.get("id", "")))
				conversations[peer]["unread"] = int(c.get("unread_count", conversations[peer].get("unread", 0)))
			out.append(c)
		if not out.is_empty() or rows.is_empty():
			return out

	var ids: Array = []
	for uid in conversations.keys():
		ids.append(str(uid))
	await hydrate_character_names(ids)
	var fallback: Array = []
	for uid in conversations.keys():
		var peer := str(uid)
		var bucket: Dictionary = conversations[peer]
		var preview := ""
		var msgs: Array = bucket.get("messages", []) if typeof(bucket.get("messages", [])) == TYPE_ARRAY else []
		if not msgs.is_empty():
			var last: Variant = msgs[msgs.size() - 1]
			if typeof(last) == TYPE_DICTIONARY:
				preview = str(last.get("content", "")).substr(0, MESSAGE_PREVIEW_LENGTH)
		fallback.append({
			"id": str(bucket.get("conversation_id", "")),
			"conversation_id": str(bucket.get("conversation_id", "")),
			"participant_ids": [char_id(), peer],
			"other_character_id": peer,
			"other_character_name": character_display_name(peer),
			"user_id": peer,
			"last_message_preview": preview,
			"unread_count": int(bucket.get("unread", 0)),
		})
	return fallback


func other_participant(conversation: Dictionary) -> String:
	## Peer character id for routing — never the conversation document id.
	var peer := str(conversation.get("other_character_id", "")).strip_edges()
	if not peer.is_empty():
		return peer
	peer = str(conversation.get("user_id", "")).strip_edges()
	if not peer.is_empty() and peer != str(conversation.get("id", "")) and peer != str(conversation.get("conversation_id", "")):
		return peer
	var mine := char_id()
	var parts: Variant = conversation.get("participant_ids", [])
	if typeof(parts) == TYPE_ARRAY:
		for pid in parts:
			var sid := str(pid).strip_edges()
			if not sid.is_empty() and sid != mine:
				return sid
	return ""


func other_participant_name(conversation: Dictionary) -> String:
	var peer := other_participant(conversation)
	var nm := str(conversation.get("other_character_name", "")).strip_edges()
	if nm.is_empty():
		nm = str(conversation.get("name", "")).strip_edges()
	return character_display_name(peer, nm)


func load_thread(conversation: Dictionary) -> Array:
	var peer := other_participant(conversation)
	var conv_id := str(conversation.get("conversation_id", conversation.get("id", ""))).strip_edges()
	var res: Dictionary = await load_dm_history(peer, conv_id)
	if res.get("ok", false):
		if not peer.is_empty():
			return get_conversation(peer).get("messages", [])
		var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
		return data.get("messages", []) if typeof(data.get("messages", [])) == TYPE_ARRAY else []
	return []


func mark_read(conversation: Dictionary) -> void:
	var peer := other_participant(conversation)
	var conv_id := str(conversation.get("conversation_id", conversation.get("id", ""))).strip_edges()
	if not conv_id.is_empty():
		await GameApiClient.invoke("MarkConversationRead", {"conversation_id": conv_id})
		if not peer.is_empty() and conversations.has(peer):
			conversations[peer]["unread"] = 0
			unread_changed.emit(get_total_unread_count())
			conversation_read.emit(peer)
		return
	await mark_conversation_read(peer)


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
	_name_by_id.clear()
	_active_dm_user = ""
	_global_joined = false
	unread_changed.emit(0)
