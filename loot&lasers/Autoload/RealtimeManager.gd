extends Node
## WebSocket fan-out for FriendRequest / Guild (mail unread is polled).

signal entity_event(entity: String, event_type: String, data: Dictionary)
signal connection_changed(connected: bool)
signal chat_event(entity: String, data: Dictionary)

var _socket: WebSocketPeer
var _connected := false
var _entity_filter := "FriendRequest"
var _poll_mail: Timer
var _poll_chat: Timer
var _reconnect: Timer
var _want_connect := false
var _refreshing_friends := false
var _refreshing_guild := false


func _ready() -> void:
	print("[RealtimeManager] ready")
	_poll_mail = Timer.new()
	_poll_mail.wait_time = 30.0
	_poll_mail.timeout.connect(_on_mail_poll)
	add_child(_poll_mail)

	_poll_chat = Timer.new()
	_poll_chat.wait_time = 8.0
	_poll_chat.timeout.connect(_on_chat_poll)
	add_child(_poll_chat)

	_reconnect = Timer.new()
	_reconnect.one_shot = true
	_reconnect.wait_time = 5.0
	_reconnect.timeout.connect(_on_reconnect)
	add_child(_reconnect)

	set_process(false)


func start(entity: String = "ChatMessage") -> void:
	# ChatMessage is broadcast to non-admins; PrivateMessage is sensitive (poll instead).
	_entity_filter = entity
	_want_connect = true
	_connect_ws()
	if not _poll_mail.is_stopped():
		_poll_mail.stop()
	_poll_mail.start()
	if not _poll_chat.is_stopped():
		_poll_chat.stop()
	_poll_chat.start()
	SocialManager.refresh_unread()


func stop() -> void:
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


func _connect_ws() -> void:
	if AuthManager.access_token.is_empty():
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
		print("[RealtimeManager] connect failed: ", err)
		_socket = null
		if _want_connect and _reconnect.is_stopped():
			_reconnect.start()
		return
	set_process(true)


func _process(_delta: float) -> void:
	if _socket == null:
		return
	_socket.poll()
	var state := _socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not _connected:
			_connected = true
			connection_changed.emit(true)
			print("[RealtimeManager] connected")
		while _socket.get_available_packet_count() > 0:
			var packet := _socket.get_packet().get_string_from_utf8()
			_handle_packet(packet)
	elif state == WebSocketPeer.STATE_CLOSING:
		pass
	elif state == WebSocketPeer.STATE_CLOSED:
		if _connected:
			print("[RealtimeManager] closed code=", _socket.get_close_code())
		_connected = false
		connection_changed.emit(false)
		_socket = null
		set_process(false)
		if _want_connect and _reconnect.is_stopped():
			_reconnect.start()


func _on_reconnect() -> void:
	if _want_connect and _socket == null:
		_connect_ws()


func _handle_packet(text: String) -> void:
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var msg: Dictionary = parsed
	var mtype := str(msg.get("type", ""))
	if mtype == "connected" or mtype == "error":
		return
	var entity := str(msg.get("entity", ""))
	var data: Dictionary = msg.get("data", {}) if typeof(msg.get("data", {})) == TYPE_DICTIONARY else {}
	entity_event.emit(entity, mtype, data)
	if entity == "FriendRequest":
		_refresh_friends_async()
	elif entity in ["Guild", "GuildMember"]:
		_refresh_guild_async()
	elif entity == "ChatMessage":
		chat_event.emit(entity, data)


func _refresh_friends_async() -> void:
	if _refreshing_friends:
		return
	_refreshing_friends = true
	await SocialManager.load_friends()
	_refreshing_friends = false


func _refresh_guild_async() -> void:
	if _refreshing_guild:
		return
	_refreshing_guild = true
	await SocialManager.load_my_guild()
	_refreshing_guild = false


func _on_mail_poll() -> void:
	if AuthManager.access_token.is_empty():
		return
	await SocialManager.refresh_unread()
	await NotificationManager.refresh_unread()


func _on_chat_poll() -> void:
	# PrivateMessage is sensitive — not WS-broadcast to players; soft-notify via signal.
	if AuthManager.access_token.is_empty():
		return
	chat_event.emit("PrivateMessagePoll", {})
	# Friend lists refresh via WS FriendRequest events — avoid loading every 8s.
