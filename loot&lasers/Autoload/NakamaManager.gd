extends Node
## Nakama connection layer — client, session, socket, RPC.
## Game-specific systems stay in their own managers and call into this.

signal connection_changed(connected: bool)
signal authenticated(user_id: String)
signal authentication_failed(error: String)
signal session_restored(user_id: String)
signal logged_out()

const SERVER_KEY := "defaultkey"
const HOST := "127.0.0.1"
const PORT := 7350
const SCHEME := "http"
const SOCKET_SCHEME := "ws"
const DEVICE_ID_PATH := "user://nakama_device_id.txt"
const SESSION_PATH := "user://nakama_session.cfg"
## Refresh a bit before JWT expiry so calls do not race the clock.
const REFRESH_SKEW_SEC := 60
## HTTP timeout for the Nakama client (seconds).
const CLIENT_TIMEOUT_SEC := 2
## Wall-clock cap so a dead server cannot hang the main thread forever.
const AUTH_TIMEOUT_SEC := 5.0

var client: NakamaClient
var session: NakamaSession
var socket: NakamaSocket

var _auth_busy := false
var _auth_gen := 0
var _socket_connected := false
var _socket_signals_bound := false


func _ready() -> void:
	initialize_client()


func initialize_client() -> void:
	if client != null:
		return
	client = Nakama.create_client(
		SERVER_KEY, HOST, PORT, SCHEME, CLIENT_TIMEOUT_SEC, NakamaLogger.LOG_LEVEL.ERROR
	)
	print("[NakamaManager] Nakama client initialized (%s://%s:%s)" % [SCHEME, HOST, PORT])


func is_authenticated() -> bool:
	return session != null and session.is_valid() and not session.is_exception() \
		and not session.is_expired()


func authenticate_device() -> Dictionary:
	if _auth_busy:
		return _fail("Authentication already in progress")
	if client == null:
		initialize_client()
	if client == null:
		return _fail("Nakama client not initialized")

	_auth_busy = true
	_auth_gen += 1
	var gen := _auth_gen
	var device_id := _resolve_device_id()
	var result: NakamaSession = await _authenticate_device_timed(device_id, AUTH_TIMEOUT_SEC, gen)
	if gen != _auth_gen:
		return _fail("Authentication superseded")
	_auth_busy = false

	if result == null:
		var timeout_err := "Nakama server unreachable or timed out (%ss)" % str(AUTH_TIMEOUT_SEC)
		print("[NakamaManager] ERROR: device authentication failed — %s" % timeout_err)
		authentication_failed.emit(timeout_err)
		return _fail(timeout_err)
	if result.is_exception():
		var err := _exception_message(result)
		print("[NakamaManager] ERROR: device authentication failed — %s" % err)
		authentication_failed.emit(err)
		return _fail(err)

	_set_session(result, false)
	print("[NakamaManager] Nakama authentication successful user_id=%s" % session.user_id)
	authenticated.emit(session.user_id)
	return {"success": true, "data": {"user_id": session.user_id}, "error": "", "status_code": 200}


func _authenticate_device_timed(device_id: String, timeout_sec: float, gen: int) -> NakamaSession:
	var box: Dictionary = {"session": null, "done": false}
	_authenticate_device_worker(device_id, box, gen)
	var start_ms := Time.get_ticks_msec()
	while not bool(box.get("done", false)):
		if gen != _auth_gen:
			return null
		if Time.get_ticks_msec() - start_ms >= int(timeout_sec * 1000.0):
			return null
		await get_tree().process_frame
	return box.get("session") as NakamaSession


func _authenticate_device_worker(device_id: String, box: Dictionary, gen: int) -> void:
	var result: NakamaSession = await client.authenticate_device_async(device_id)
	if gen != _auth_gen:
		return
	box["session"] = result
	box["done"] = true


func restore_session() -> Dictionary:
	if client == null:
		initialize_client()
	var saved := _load_session_tokens()
	var token := str(saved.get("token", ""))
	var refresh := str(saved.get("refresh_token", ""))
	if token.is_empty():
		return _fail("No saved Nakama session")

	var restored: NakamaSession = NakamaSession.new(token, false, refresh if not refresh.is_empty() else null)
	if restored == null or restored.is_exception() or not restored.is_valid():
		_clear_saved_session()
		return _fail("Saved Nakama session is invalid")

	session = restored
	if session.is_expired() or session.would_expire_in(REFRESH_SKEW_SEC):
		if session.is_refresh_expired() or session.refresh_token.is_empty():
			_clear_session_memory()
			_clear_saved_session()
			return _fail("Saved Nakama session expired")
		var refresh_res: Dictionary = await refresh_session()
		if not refresh_res.get("success", false):
			return refresh_res

	print("[NakamaManager] Nakama session restored user_id=%s" % session.user_id)
	session_restored.emit(session.user_id)
	return {"success": true, "data": {"user_id": session.user_id}, "error": "", "status_code": 200}


func refresh_session() -> Dictionary:
	if client == null:
		return _fail("Nakama client not initialized")
	if session == null or session.refresh_token.is_empty():
		return _fail("No refresh token available")
	if session.is_refresh_expired():
		_clear_session_memory()
		_clear_saved_session()
		return _fail("Refresh token expired")

	var result: NakamaSession = await client.session_refresh_async(session)
	if result == null or result.is_exception():
		var err := _exception_message(result)
		print("[NakamaManager] ERROR: session refresh failed — %s" % err)
		_clear_session_memory()
		_clear_saved_session()
		return _fail(err, _exception_status(result))

	_set_session(result, false)
	print("[NakamaManager] Nakama session refreshed user_id=%s" % session.user_id)
	return {"success": true, "data": {"user_id": session.user_id}, "error": "", "status_code": 200}


func logout() -> Dictionary:
	var had_session: bool = session != null and not session.is_exception()
	var logout_session: NakamaSession = session
	await disconnect_socket()
	if had_session and client != null and logout_session != null and not logout_session.token.is_empty():
		var res: NakamaAsyncResult = await client.session_logout_async(logout_session)
		if res != null and res.is_exception():
			# Still clear local state — server may already be down.
			print("[NakamaManager] WARNING: server logout failed — %s" % _exception_message(res))
	_clear_session_memory()
	_clear_saved_session()
	print("[NakamaManager] logged out (local session cleared)")
	logged_out.emit()
	return {"success": true, "data": {}, "error": "", "status_code": 200}


func connect_socket() -> Dictionary:
	if not is_authenticated():
		return _fail("Not authenticated")
	if client == null:
		return _fail("Nakama client not initialized")
	if socket != null and socket.is_connected_to_host():
		return {"success": true, "data": {"already_connected": true}, "error": "", "status_code": 200}

	socket = Nakama.create_socket_from(client)
	_bind_socket_signals()
	var res: NakamaAsyncResult = await socket.connect_async(session)
	if res != null and res.is_exception():
		var err := _exception_message(res)
		print("[NakamaManager] ERROR: socket connect failed — %s" % err)
		socket = null
		_socket_signals_bound = false
		_socket_connected = false
		connection_changed.emit(false)
		return _fail(err, _exception_status(res))

	_socket_connected = socket != null and socket.is_connected_to_host()
	connection_changed.emit(_socket_connected)
	print("[NakamaManager] socket connected=%s" % _socket_connected)
	return {
		"success": _socket_connected,
		"data": {"connected": _socket_connected},
		"error": "" if _socket_connected else "Socket did not report connected",
		"status_code": 200 if _socket_connected else 0,
	}


func disconnect_socket() -> void:
	if socket == null:
		if _socket_connected:
			_socket_connected = false
			connection_changed.emit(false)
		return
	if socket.is_connected_to_host():
		socket.close()
	socket = null
	_socket_signals_bound = false
	if _socket_connected:
		_socket_connected = false
		connection_changed.emit(false)
	print("[NakamaManager] socket disconnected")


func call_rpc(rpc_id: String, payload: Dictionary = {}) -> Dictionary:
	if rpc_id.is_empty():
		return _fail("Missing RPC id")
	if client == null:
		return _fail("Nakama client not initialized")
	if not is_authenticated():
		# Try a soft refresh/restore before failing hard.
		if session != null and not session.refresh_token.is_empty() and not session.is_refresh_expired():
			var refreshed: Dictionary = await refresh_session()
			if not refreshed.get("success", false):
				return _fail("Not authenticated")
		else:
			return _fail("Not authenticated")

	var payload_json: Variant = null
	if not payload.is_empty():
		payload_json = JSON.stringify(payload)
	var result = await client.rpc_async(session, rpc_id, payload_json)
	if result == null:
		return _fail("RPC returned null")
	if result.is_exception():
		return _fail(_exception_message(result), _exception_status(result))

	var raw := str(result.payload) if result.payload != null else ""
	var data: Variant = {}
	if not raw.is_empty():
		var parsed: Variant = JSON.parse_string(raw)
		if parsed == null:
			data = {"raw": raw}
		else:
			data = parsed
	return {"success": true, "data": data, "error": "", "status_code": 200}


## Boot helper used by AuthManager / temporary tests.
func ensure_authenticated() -> Dictionary:
	var restored: Dictionary = await restore_session()
	if restored.get("success", false):
		return restored
	return await authenticate_device()


func _set_session(next: NakamaSession, emit_restored: bool) -> void:
	session = next
	_save_session_tokens()
	if emit_restored:
		session_restored.emit(session.user_id)


func _clear_session_memory() -> void:
	session = null


func _bind_socket_signals() -> void:
	if socket == null or _socket_signals_bound:
		return
	socket.connected.connect(_on_socket_connected)
	socket.closed.connect(_on_socket_closed)
	_socket_signals_bound = true


func _on_socket_connected() -> void:
	_socket_connected = true
	connection_changed.emit(true)


func _on_socket_closed() -> void:
	_socket_connected = false
	connection_changed.emit(false)


func _resolve_device_id() -> String:
	var id := str(OS.get_unique_id()).strip_edges()
	if not id.is_empty():
		return id
	if FileAccess.file_exists(DEVICE_ID_PATH):
		var existing := FileAccess.get_file_as_string(DEVICE_ID_PATH).strip_edges()
		if not existing.is_empty():
			return existing
	var fallback := "godot-%s-%s" % [
		str(Time.get_unix_time_from_system()),
		str(randi()),
	]
	var f := FileAccess.open(DEVICE_ID_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(fallback)
		f.close()
	else:
		push_warning("[NakamaManager] could not persist fallback device id")
	return fallback


func _save_session_tokens() -> void:
	if session == null or not session.is_valid():
		return
	var cfg := ConfigFile.new()
	cfg.load(SESSION_PATH)
	cfg.set_value("nakama", "token", session.token)
	cfg.set_value("nakama", "refresh_token", session.refresh_token)
	cfg.set_value("nakama", "user_id", session.user_id)
	cfg.save(SESSION_PATH)


func _load_session_tokens() -> Dictionary:
	var cfg := ConfigFile.new()
	if cfg.load(SESSION_PATH) != OK:
		return {}
	return {
		"token": str(cfg.get_value("nakama", "token", "")),
		"refresh_token": str(cfg.get_value("nakama", "refresh_token", "")),
		"user_id": str(cfg.get_value("nakama", "user_id", "")),
	}


func _clear_saved_session() -> void:
	if FileAccess.file_exists(SESSION_PATH):
		DirAccess.remove_absolute(SESSION_PATH)


func _exception_message(result) -> String:
	if result == null:
		return "unknown error"
	if result.has_method("get_exception"):
		var ex = result.get_exception()
		if ex != null:
			if "message" in ex and not str(ex.message).is_empty():
				return str(ex.message)
			return str(ex)
	return "unknown error"


func _exception_status(result) -> int:
	if result != null and result.has_method("get_exception"):
		var ex = result.get_exception()
		if ex != null and "status_code" in ex:
			return int(ex.status_code)
	return 0


func _fail(error: String, status_code: int = 0) -> Dictionary:
	return {"success": false, "data": {}, "error": error, "status_code": status_code}
