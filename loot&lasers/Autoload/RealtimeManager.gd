extends Node
## Phase 19: owns exactly one Nakama realtime socket (via NakamaManager).
## Nakama/Node realtime drive updates; periodic polling is an outage fallback only.

signal entity_event(entity: String, event_type: String, data: Dictionary)
signal connection_changed(connected: bool)
signal chat_event(entity: String, data: Dictionary)
signal nakama_connection_changed(connected: bool)
signal nakama_channel_message(message: Dictionary)
signal nakama_presence(event: Dictionary)
signal nakama_notification(notification: Dictionary)

const MAIL_FALLBACK_POLL_SECONDS := 30.0
const LEGACY_CHAT_POLL_SECONDS := 8.0
const REALTIME_RECONNECT_SECONDS := 5.0

var _socket: WebSocketPeer
var _connected := false
var _entity_filter := "FriendRequest"
var _poll_mail: Timer
var _poll_chat: Timer
var _reconnect: Timer
var _want_connect := false
var _want_nakama := false
var _nakama_connecting := false
var _global_channel_id := ""
var _refreshing_friends := false
var _refreshing_guild := false
var _nakama_signals_bound := false
var _nakama_was_connected := false
var _wallet_reconcile_running := false
var _skip_connection_reconcile_once := false


func _ready() -> void:
	print("[RealtimeManager] ready (Nakama + Node realtime, fallback polling)")
	_poll_mail = Timer.new()
	_poll_mail.wait_time = MAIL_FALLBACK_POLL_SECONDS
	_poll_mail.timeout.connect(_on_mail_poll)
	add_child(_poll_mail)

	_poll_chat = Timer.new()
	_poll_chat.wait_time = LEGACY_CHAT_POLL_SECONDS
	_poll_chat.timeout.connect(_on_chat_poll)
	add_child(_poll_chat)

	_reconnect = Timer.new()
	_reconnect.one_shot = true
	_reconnect.wait_time = REALTIME_RECONNECT_SECONDS
	_reconnect.timeout.connect(_on_reconnect)
	add_child(_reconnect)

	set_process(false)


func is_nakama_connected() -> bool:
	return NakamaManager.socket != null and NakamaManager.socket.is_connected_to_host()


func has_node_ws() -> bool:
	return _socket != null and _socket.get_ready_state() == WebSocketPeer.STATE_OPEN


func global_channel_id() -> String:
	return _global_channel_id


func chat_event_listener_count() -> int:
	return chat_event.get_connections().size()


func nakama_channel_listener_count() -> int:
	return nakama_channel_message.get_connections().size()


## Preferred entry — connect Nakama socket once after auth.
func start_nakama(reconcile_wallet: bool = true) -> Dictionary:
	if _nakama_connecting:
		return {"ok": false, "error": "Socket connect already in progress"}
	_want_nakama = true
	_nakama_connecting = true
	_skip_connection_reconcile_once = not reconcile_wallet
	var auth: Dictionary = await NakamaManager.ensure_authenticated()
	if not bool(auth.get("success", false)):
		_nakama_connecting = false
		return {"ok": false, "error": str(auth.get("error", "auth failed"))}
	_bind_nakama_signals()
	var res: Dictionary = await NakamaManager.connect_socket()
	_nakama_connecting = false
	var ok := bool(res.get("success", false))
	nakama_connection_changed.emit(ok)
	connection_changed.emit(ok or _connected)
	if ok:
		call_deferred("_load_social_state_deferred")
	_sync_fallback_polling()
	return {"ok": ok, "error": str(res.get("error", ""))}


func _load_social_state_deferred() -> void:
	await SocialManager.load_social_state()


func stop_nakama() -> void:
	_want_nakama = false
	_global_channel_id = ""
	_nakama_was_connected = false
	await NakamaManager.disconnect_socket()
	nakama_connection_changed.emit(false)
	_sync_fallback_polling()
	ChatManager.clear_account_chat_cache()
	SocialManager.clear_account_social_cache()
	if MailManager != null and MailManager.has_method("clear_account_mail_cache"):
		MailManager.clear_account_mail_cache()


func join_global_chat() -> Dictionary:
	if not _global_channel_id.is_empty() and is_nakama_connected():
		return {"ok": true, "channel_id": _global_channel_id, "cached": true}
	if not is_nakama_connected():
		var started: Dictionary = await start_nakama()
		if not started.get("ok", false):
			return started
	var socket = NakamaManager.socket
	if socket == null:
		return {"ok": false, "error": "No socket"}
	var channel = await socket.join_chat_async("global", NakamaSocket.ChannelType.Room, true, false)
	if channel == null or channel.is_exception():
		return {"ok": false, "error": "Failed to join global chat"}
	_global_channel_id = str(channel.id) if "id" in channel else ""
	return {"ok": true, "channel_id": _global_channel_id}


func leave_global_chat() -> void:
	if not is_nakama_connected() or _global_channel_id.is_empty():
		return
	var socket = NakamaManager.socket
	if socket != null:
		await socket.leave_chat_async(_global_channel_id)
	_global_channel_id = ""


func _bind_nakama_signals() -> void:
	if _nakama_signals_bound:
		return
	if not NakamaManager.connection_changed.is_connected(_on_nakama_mgr_connection):
		NakamaManager.connection_changed.connect(_on_nakama_mgr_connection)
	# Socket message signals bound when socket exists
	_nakama_signals_bound = true
	_ensure_socket_message_binds()


func _ensure_socket_message_binds() -> void:
	var socket = NakamaManager.socket
	if socket == null:
		return
	if not socket.received_channel_message.is_connected(_on_nakama_channel_message):
		socket.received_channel_message.connect(_on_nakama_channel_message)
	if not socket.received_status_presence.is_connected(_on_nakama_status_presence):
		socket.received_status_presence.connect(_on_nakama_status_presence)
	if socket.has_signal("received_notification") and not socket.received_notification.is_connected(_on_nakama_notification):
		socket.received_notification.connect(_on_nakama_notification)


func _on_nakama_notification(p_notification) -> void:
	var n := {
		"id": str(p_notification.id) if p_notification != null and "id" in p_notification else "",
		"subject": str(p_notification.subject) if p_notification != null and "subject" in p_notification else "",
		"code": int(p_notification.code) if p_notification != null and "code" in p_notification else -1,
		"content": {},
		"create_time": str(p_notification.create_time) if p_notification != null and "create_time" in p_notification else "",
	}
	if p_notification != null and "content" in p_notification:
		var raw = p_notification.content
		if typeof(raw) == TYPE_STRING:
			var parsed: Variant = JSON.parse_string(raw)
			n["content"] = parsed if typeof(parsed) == TYPE_DICTIONARY else {"raw": raw}
		elif typeof(raw) == TYPE_DICTIONARY:
			n["content"] = raw
	nakama_notification.emit(n)
	entity_event.emit("MailNotification", "received", n)
	if str(n.get("subject", "")).to_lower() == "wallet_updated":
		_handle_wallet_event(n.get("content", {}))


func _on_nakama_mgr_connection(connected: bool) -> void:
	if connected:
		_ensure_socket_message_binds()
		if not _nakama_was_connected:
			if _skip_connection_reconcile_once:
				_skip_connection_reconcile_once = false
			else:
				call_deferred("_reconcile_wallet_deferred", "nakama_reconnect")
	_nakama_was_connected = connected
	nakama_connection_changed.emit(connected)
	connection_changed.emit(connected or _connected)
	_sync_fallback_polling()


func _on_nakama_channel_message(p_message) -> void:
	var msg := {
		"message_id": str(p_message.message_id) if p_message != null and "message_id" in p_message else "",
		"channel_id": str(p_message.channel_id) if p_message != null and "channel_id" in p_message else "",
		"sender_user_id": str(p_message.sender_id) if p_message != null and "sender_id" in p_message else "",
		"content": "",
		"created_at": str(p_message.create_time) if p_message != null and "create_time" in p_message else "",
	}
	if p_message != null and "content" in p_message:
		var raw = p_message.content
		if typeof(raw) == TYPE_STRING:
			var parsed: Variant = JSON.parse_string(raw)
			if typeof(parsed) == TYPE_DICTIONARY:
				msg["content"] = str(parsed.get("text", parsed.get("message", "")))
				msg["sender_display_name"] = str(parsed.get("sender_display_name", ""))
				msg["sender_character_id"] = str(parsed.get("sender_character_id", ""))
			else:
				msg["content"] = raw
	nakama_channel_message.emit(msg)
	chat_event.emit("NakamaChannel", msg)


func _on_nakama_status_presence(p_presence) -> void:
	nakama_presence.emit({"raw": true})
	# Presence details vary by SDK version; SocialManager may refresh on demand.


## Legacy Node WebSocket — mail/guild fan-out until those migrate.
func start(entity: String = "ChatMessage") -> void:
	_entity_filter = entity
	_want_connect = true
	_want_nakama = true
	# Connect Nakama once; repeated Hub visits must not stack join/boot work.
	if not is_nakama_connected() and not _nakama_connecting:
		call_deferred("_boot_nakama_deferred")
	_connect_ws()
	_sync_fallback_polling()
	_poll_chat.stop()
	MailManager.refresh_unread()


## Start the existing authenticated Node socket as soon as the gameplay bridge is
## ready so account-scoped wallet events do not depend on visiting Hub first.
func start_node_wallet_events() -> void:
	_want_connect = true
	_entity_filter = "*"
	_connect_ws()
	_sync_fallback_polling()


func _boot_nakama_deferred() -> void:
	await start_nakama()


func stop() -> void:
	stop_node()
	if _want_nakama:
		stop_nakama()


func stop_node() -> void:
	_want_connect = false
	_poll_mail.stop()
	_poll_chat.stop()
	_reconnect.stop()
	if _socket:
		_socket.close()
		_socket = null
	_connected = false
	set_process(false)
	connection_changed.emit(false)
	_sync_fallback_polling()


func _connect_ws() -> void:
	if AuthManager.access_token.is_empty():
		return
	if _socket != null and _socket.get_ready_state() in [
		WebSocketPeer.STATE_CONNECTING,
		WebSocketPeer.STATE_OPEN,
	]:
		return
	var base := GameApiClient.base_url.replace("http://", "ws://").replace("https://", "wss://")
	var url := "%s/ws?entity=%s&token=%s" % [
		base.rstrip("/"),
		_entity_filter.uri_encode(),
		AuthManager.access_token.uri_encode(),
	]
	_socket = WebSocketPeer.new()
	var err := _socket.connect_to_url(url)
	if err != OK:
		print("[RealtimeManager] Node WS connect failed: ", err)
		_socket = null
		return
	set_process(true)


func _process(_delta: float) -> void:
	# Only polls Node WebSocketPeer state — does NOT initiate Nakama connects.
	if _socket == null:
		set_process(false)
		return
	_socket.poll()
	var state := _socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not _connected:
			_connected = true
			connection_changed.emit(true)
			_sync_fallback_polling()
		while _socket.get_available_packet_count() > 0:
			var packet := _socket.get_packet().get_string_from_utf8()
			_handle_packet(packet)
	elif state == WebSocketPeer.STATE_CLOSED:
		if _connected:
			_connected = false
			connection_changed.emit(false)
		_socket = null
		set_process(false)
		if _want_connect:
			_reconnect.start()
		_sync_fallback_polling()


func _handle_packet(packet: String) -> void:
	var data: Variant = JSON.parse_string(packet)
	if typeof(data) != TYPE_DICTIONARY:
		return
	var entity := str(data.get("entity", ""))
	var event_type := str(data.get("type", data.get("event", "")))
	var payload: Variant = data.get("data", data)
	entity_event.emit(entity, event_type, payload if typeof(payload) == TYPE_DICTIONARY else {})
	if entity == "ChatMessage":
		chat_event.emit(entity, payload if typeof(payload) == TYPE_DICTIONARY else {})
	elif entity == "FriendRequest" and not _refreshing_friends:
		_refreshing_friends = true
		SocialManager.load_friends()
		_refreshing_friends = false
	elif entity == "Wallet" or event_type == "wallet_updated":
		_handle_wallet_event(payload if typeof(payload) == TYPE_DICTIONARY else {})
	elif entity == "Auth" and event_type == "session_kicked":
		var msg := "Signed in elsewhere on this server. Please log in again."
		if typeof(payload) == TYPE_DICTIONARY:
			msg = str(payload.get("message", msg))
		if AuthManager != null and AuthManager.has_method("handle_session_superseded"):
			AuthManager.handle_session_superseded(msg, true)


func _handle_wallet_event(payload: Dictionary) -> void:
	if CurrencyManager == null:
		return
	var event_character_id := str(payload.get("character_id", "")).strip_edges()
	var selected_id := str(GameManager.active_character.get("id", "")).strip_edges()
	if not event_character_id.is_empty() and not selected_id.is_empty() and event_character_id != selected_id:
		return
	if bool(payload.get("force_reconcile", false)):
		if MissionManager != null and MissionManager.has_method("invalidate_character_cache"):
			MissionManager.invalidate_character_cache()
		call_deferred("_reconcile_wallet_deferred", str(payload.get("source", "wallet_event")))
		return
	if CurrencyManager.apply_realtime_wallet(payload):
		var character := GameManager.active_character.duplicate(true)
		var balances: Dictionary = CurrencyManager.get_balances()
		for currency_id in CurrencyManager.CURRENCY_IDS:
			character[currency_id] = int(balances.get(currency_id, 0))
		GameManager.apply_active_character(character, "wallet_updated", false)
		return
	call_deferred("_reconcile_wallet_deferred", "wallet_event")


func _reconcile_wallet_deferred(source: String) -> void:
	await _reconcile_wallet_once(source)


func _reconcile_wallet_once(source: String) -> void:
	if _wallet_reconcile_running or CurrencyManager == null:
		return
	if str(GameManager.active_character.get("id", "")).is_empty():
		return
	_wallet_reconcile_running = true
	await CurrencyManager.reconcile_wallet()
	var cid := str(GameManager.active_character.get("id", "")).strip_edges()
	if (
		source.begins_with("admin_")
		and not cid.is_empty()
		and InventoryManager != null
		and InventoryManager.has_method("load_inventory")
	):
		await InventoryManager.load_inventory(cid)
	_wallet_reconcile_running = false


func _on_mail_poll() -> void:
	if is_nakama_connected() or has_node_ws():
		_sync_fallback_polling()
		return
	MailManager.refresh_unread()
	NotificationManager.refresh_unread()


func _sync_fallback_polling() -> void:
	if _poll_mail == null:
		return
	var wants_realtime := _want_connect or _want_nakama
	var has_realtime := is_nakama_connected() or has_node_ws()
	if not wants_realtime or has_realtime:
		_poll_mail.stop()
		return
	if _poll_mail.is_stopped():
		_poll_mail.start()


func _on_chat_poll() -> void:
	# Legacy private poll disabled under Nakama chat authority.
	pass


func _on_reconnect() -> void:
	if _want_connect:
		_connect_ws()
	if _want_nakama and not is_nakama_connected():
		start_nakama()
