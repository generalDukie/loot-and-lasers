extends Node
## Nakama connection layer — client, session, socket, RPC.
## Game-specific systems stay in their own managers and call into this.
## See docs/NAKAMA_RPC.md for the manager-facing RPC contract.
##
## Primary RPC API (do not name methods `rpc` — conflicts with Node.rpc):
##   await NakamaManager.call_rpc("id", payload)
##   await NakamaManager.call_authenticated_rpc("id", payload)
## Envelope: { success, data, error, status_code }

signal connection_changed(connected: bool)
signal authenticated(user_id: String)
signal authentication_failed(error: String)
signal session_restored(user_id: String)
signal logged_out()
signal rpc_succeeded(rpc_id: String, data: Variant)
signal rpc_failed(rpc_id: String, error: String, status_code: int)

## Refresh a bit before JWT expiry so calls do not race the clock.
const REFRESH_SKEW_SEC := 60
## Default wall-clock cap for a single RPC attempt (seconds).
const RPC_TIMEOUT_SEC := 10.0
## Transient-failure retries after the first attempt (total attempts = 1 + this).
const RPC_TRANSIENT_RETRIES := 2
## Base delay between transient retries (seconds); doubles each attempt.
const RPC_RETRY_BACKOFF_SEC := 0.35

var client: NakamaClient
var session: NakamaSession
var socket: NakamaSocket

var _auth_busy := false
var _auth_gen := 0
var _socket_connected := false
var _socket_signals_bound := false
var _client_env_id := ""


func _ready() -> void:
	initialize_client()


func initialize_client(force: bool = false) -> Dictionary:
	var env_id := BackendEnvironment.get_environment_id()
	if client != null and not force and _client_env_id == env_id:
		return {"success": true, "data": BackendEnvironment.get_public_config(), "error": "", "status_code": 200}

	var server_key := BackendEnvironment.get_server_key()
	if server_key.is_empty():
		var missing := "Nakama server key not configured for environment '%s'" % env_id
		print("[NakamaManager] ERROR: %s" % missing)
		return {"success": false, "data": BackendEnvironment.get_public_config(), "error": missing, "status_code": 0}

	# Tear down prior client/socket when switching environments.
	if client != null:
		disconnect_socket()
		client = null
		_clear_session_memory()

	var scheme := BackendEnvironment.get_scheme()
	var host := BackendEnvironment.get_host()
	var port := BackendEnvironment.get_port()
	var timeout_sec := BackendEnvironment.get_client_timeout_sec()
	client = Nakama.create_client(
		server_key, host, port, scheme, timeout_sec, NakamaLogger.LOG_LEVEL.ERROR
	)
	_client_env_id = env_id
	var pub := BackendEnvironment.get_public_config()
	print(
		"[NakamaManager] Nakama client initialized env=%s %s://%s:%s"
		% [pub.get("environment", ""), pub.get("scheme", ""), pub.get("host", ""), pub.get("port", 0)]
	)
	return {"success": true, "data": pub, "error": "", "status_code": 200}


## Safe diagnostics for staging/local — never includes tokens or full server key.
func get_connection_diagnostics() -> Dictionary:
	var pub := BackendEnvironment.get_public_config()
	return {
		"environment": pub.get("environment", ""),
		"scheme": pub.get("scheme", ""),
		"host": pub.get("host", ""),
		"port": pub.get("port", 0),
		"client_created": client != null,
		"client_env_id": _client_env_id,
		"authenticated": is_authenticated(),
		"auth_method": get_auth_method(),
		"user_id": session.user_id if session != null and is_authenticated() else "",
		"socket_connected": socket != null and socket.is_connected_to_host(),
		"session_path": BackendEnvironment.get_session_path(),
		"server_key_configured": pub.get("server_key_configured", false),
		"server_key_fingerprint": pub.get("server_key_fingerprint", ""),
	}


## Staging/local smoke test: auth → profile_get → inventory_get → socket.
## Does not log secrets. Safe to run from the editor / debug console.
func run_connection_smoke_test() -> Dictionary:
	var steps: Array = []
	var diag := get_connection_diagnostics()
	steps.append({"step": "environment", "ok": true, "detail": diag})

	var init_res: Dictionary = initialize_client(true)
	steps.append({
		"step": "client_create",
		"ok": bool(init_res.get("success", false)),
		"error": str(init_res.get("error", "")),
	})
	if not bool(init_res.get("success", false)):
		return {"success": false, "steps": steps, "diagnostics": get_connection_diagnostics()}

	# Smoke test uses device auth only — email login/register is the Godot UI path.
	var auth_res: Dictionary = await authenticate_device()
	steps.append({
		"step": "authenticate",
		"ok": bool(auth_res.get("success", false)),
		"method": "device",
		"user_id": str(auth_res.get("data", {}).get("user_id", "")),
		"error": str(auth_res.get("error", "")),
	})
	if not bool(auth_res.get("success", false)):
		return {"success": false, "steps": steps, "diagnostics": get_connection_diagnostics()}

	var profile_res: Dictionary = await invoke_rpc("profile_get", {})
	steps.append({
		"step": "profile_get",
		"ok": bool(profile_res.get("success", false)),
		"error": str(profile_res.get("error", "")),
	})

	var inv_res: Dictionary = await invoke_rpc("inventory_get", {})
	steps.append({
		"step": "inventory_get",
		"ok": bool(inv_res.get("success", false)),
		"error": str(inv_res.get("error", "")),
	})

	var sock_res: Dictionary = await connect_socket()
	steps.append({
		"step": "socket_connect",
		"ok": bool(sock_res.get("success", false)),
		"error": str(sock_res.get("error", "")),
	})

	var all_ok := true
	for s in steps:
		if typeof(s) == TYPE_DICTIONARY and not bool(s.get("ok", false)) and str(s.get("step", "")) != "environment":
			all_ok = false
			break

	var out := {
		"success": all_ok,
		"steps": steps,
		"diagnostics": get_connection_diagnostics(),
	}
	print("[NakamaManager] connection smoke test success=%s env=%s" % [
		all_ok, BackendEnvironment.get_environment_id()
	])
	return out


func is_authenticated() -> bool:
	return session != null and session.is_valid() and not session.is_exception() \
		and not session.is_expired()


## Last successful auth method for this env session: email | device | restored | "".
func get_auth_method() -> String:
	return _load_auth_method()


func get_session_token() -> String:
	if session == null or not is_authenticated():
		return ""
	return str(session.token)


func get_session_user_id() -> String:
	if session == null or not is_authenticated():
		return ""
	return str(session.user_id)


## Email used for last email auth (persisted for passwordless Node re-bridge).
func get_account_email() -> String:
	return _load_account_email()


## Godot login / register — sole email/password path (Nakama :7350, never Node :8787).
## create=true → register; create=false → login existing account.
func authenticate_email(email: String, password: String, create: bool = false, username: String = "") -> Dictionary:
	if _auth_busy:
		return _fail("Authentication already in progress")
	var clean_email := email.strip_edges().to_lower()
	if clean_email.is_empty() or password.is_empty():
		return _fail("Email and password are required")
	var init_res: Dictionary = initialize_client()
	if not bool(init_res.get("success", false)):
		authentication_failed.emit(str(init_res.get("error", "client init failed")))
		return init_res
	if client == null:
		return _fail("Nakama client not initialized")

	_auth_busy = true
	_auth_gen += 1
	var gen := _auth_gen
	var timeout_sec := BackendEnvironment.get_auth_timeout_sec()
	var uname = username.strip_edges() if not username.strip_edges().is_empty() else null
	var result: NakamaSession = await _authenticate_email_timed(clean_email, password, create, uname, timeout_sec, gen)
	if gen != _auth_gen:
		return _fail("Authentication superseded")
	_auth_busy = false

	var method := "email_register" if create else "email_login"
	var diag := get_connection_diagnostics()
	if result == null:
		var timeout_err := "Nakama unreachable or timed out (%ss) at %s://%s:%s" % [
			str(timeout_sec), diag.get("scheme", ""), diag.get("host", ""), diag.get("port", 0)
		]
		print("[NakamaManager] ERROR: %s failed — %s" % [method, timeout_err])
		authentication_failed.emit(timeout_err)
		return _fail(timeout_err)
	if result.is_exception():
		var err := _friendly_email_auth_error(_exception_message(result), create)
		print("[NakamaManager] ERROR: %s failed — %s (env=%s host=%s:%s)" % [
			method, err, diag.get("environment", ""), diag.get("host", ""), diag.get("port", 0)
		])
		authentication_failed.emit(err)
		return _fail(err, _exception_status(result))

	_set_session(result, false)
	_save_auth_method("email")
	_save_account_email(clean_email)
	print("[NakamaManager] %s success env=%s host=%s:%s user_id=%s" % [
		method,
		BackendEnvironment.get_environment_id(),
		diag.get("host", ""),
		diag.get("port", 0),
		session.user_id,
	])
	authenticated.emit(session.user_id)
	return {
		"success": true,
		"data": {
			"user_id": session.user_id,
			"auth_method": "email",
			"created": create,
			"email": clean_email,
		},
		"error": "",
		"status_code": 200,
	}


func _authenticate_email_timed(
	email: String,
	password: String,
	create: bool,
	username,
	timeout_sec: float,
	gen: int
) -> NakamaSession:
	var box: Dictionary = {"session": null, "done": false}
	_authenticate_email_worker(email, password, create, username, box, gen)
	var start_ms := Time.get_ticks_msec()
	while not bool(box.get("done", false)):
		if gen != _auth_gen:
			return null
		if Time.get_ticks_msec() - start_ms >= int(timeout_sec * 1000.0):
			return null
		await get_tree().process_frame
	return box.get("session") as NakamaSession


func _authenticate_email_worker(
	email: String,
	password: String,
	create: bool,
	username,
	box: Dictionary,
	gen: int
) -> void:
	var result: NakamaSession = await client.authenticate_email_async(
		email, password, username, create
	)
	if gen != _auth_gen:
		return
	box["session"] = result
	box["done"] = true


func _friendly_email_auth_error(raw: String, create: bool) -> String:
	var low := raw.to_lower()
	if low.contains("already in use") or low.contains("already exists") or low.contains("user already"):
		return "An account with that email already exists. Log in instead."
	if low.contains("not found") or low.contains("user account not found") or low.contains("invalid credentials"):
		return "Invalid email or password" if not create else raw
	if low.contains("password") and (low.contains("short") or low.contains("least") or low.contains("8")):
		return "Password must be at least 8 characters."
	if raw.strip_edges().is_empty():
		return "Authentication failed"
	return raw


func authenticate_device() -> Dictionary:
	if _auth_busy:
		return _fail("Authentication already in progress")
	var init_res: Dictionary = initialize_client()
	if not bool(init_res.get("success", false)):
		authentication_failed.emit(str(init_res.get("error", "client init failed")))
		return init_res
	if client == null:
		return _fail("Nakama client not initialized")

	_auth_busy = true
	_auth_gen += 1
	var gen := _auth_gen
	var device_id := _resolve_device_id()
	var timeout_sec := BackendEnvironment.get_auth_timeout_sec()
	var result: NakamaSession = await _authenticate_device_timed(device_id, timeout_sec, gen)
	if gen != _auth_gen:
		return _fail("Authentication superseded")
	_auth_busy = false

	if result == null:
		var timeout_err := "Nakama server unreachable or timed out (%ss)" % str(timeout_sec)
		print("[NakamaManager] ERROR: device authentication failed — %s" % timeout_err)
		authentication_failed.emit(timeout_err)
		return _fail(timeout_err)
	if result.is_exception():
		var err := _exception_message(result)
		print("[NakamaManager] ERROR: device authentication failed — %s" % err)
		authentication_failed.emit(err)
		return _fail(err)

	_set_session(result, false)
	_save_auth_method("device")
	print("[NakamaManager] Nakama device auth successful user_id=%s env=%s" % [
		session.user_id, BackendEnvironment.get_environment_id()
	])
	authenticated.emit(session.user_id)
	return {"success": true, "data": {"user_id": session.user_id, "auth_method": "device"}, "error": "", "status_code": 200}


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
	var init_res: Dictionary = initialize_client()
	if not bool(init_res.get("success", false)):
		return init_res
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

	if _load_auth_method().is_empty():
		_save_auth_method("restored")
	print("[NakamaManager] Nakama session restored user_id=%s env=%s method=%s" % [
		session.user_id, BackendEnvironment.get_environment_id(), get_auth_method()
	])
	session_restored.emit(session.user_id)
	return {
		"success": true,
		"data": {"user_id": session.user_id, "auth_method": get_auth_method()},
		"error": "",
		"status_code": 200,
	}


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


# ---------------------------------------------------------------------------
# RPC framework — shared by every manager after migration
# ---------------------------------------------------------------------------

## Call a Nakama RPC with an existing session.
## Verifies auth (soft-refresh near expiry). Does not device-auth a new account.
## Always async; never blocks the main thread beyond awaited frames.
##
## options:
##   timeout_sec: float
##   retries: int — transient retries after the first attempt
##   retry_on_auth_failure: bool — one session refresh + retry on 401-style errors
##   use_socket: bool — use realtime socket when connected
##   log: bool — force request logging on/off (default: debug/editor builds only)
func call_rpc(rpc_id: String, payload: Variant = null, options: Dictionary = {}) -> Dictionary:
	return await _execute_rpc(rpc_id, payload, options, false)


## Ensure a valid Nakama session (restore → refresh → device auth), then call_rpc.
## Prefer this from gameplay managers once they migrate off GameApiClient.
func call_authenticated_rpc(rpc_id: String, payload: Variant = null, options: Dictionary = {}) -> Dictionary:
	return await _execute_rpc(rpc_id, payload, options, true)


## Alias kept for earlier wiring.
func rpc_authenticated(rpc_id: String, payload: Variant = null, options: Dictionary = {}) -> Dictionary:
	return await call_authenticated_rpc(rpc_id, payload, options)


## Optional helper: if the server returns JSON { success|ok, error, data }, promote it.
## Managers can use call_rpc / call_authenticated_rpc directly; this is for Node-API parity.
func invoke_rpc(rpc_id: String, payload: Dictionary = {}, options: Dictionary = {}) -> Dictionary:
	var res: Dictionary = await call_authenticated_rpc(rpc_id, payload, options)
	if not res.get("success", false):
		return res
	return _promote_server_envelope(res)


func _execute_rpc(
	rpc_id: String,
	payload: Variant,
	options: Dictionary,
	require_full_auth: bool
) -> Dictionary:
	var id := rpc_id.strip_edges()
	if id.is_empty():
		return _rpc_fail("Missing RPC id")

	var timeout_sec := float(options.get("timeout_sec", RPC_TIMEOUT_SEC))
	var retries := int(options.get("retries", RPC_TRANSIENT_RETRIES))
	var retry_on_auth := bool(options.get("retry_on_auth_failure", true))
	var use_socket := bool(options.get("use_socket", false))
	var do_log := bool(options.get("log", _rpc_logging_enabled()))

	if client == null:
		initialize_client()
	if client == null:
		return _rpc_fail("Nakama client not initialized")

	if require_full_auth:
		var ready: Dictionary = await ensure_authenticated()
		if not ready.get("success", false):
			var auth_err := str(ready.get("error", "Not authenticated"))
			_rpc_log(do_log, id, "auth_failed", auth_err)
			return _rpc_fail(auth_err, int(ready.get("status_code", 0)))
	else:
		var verified: Dictionary = await _verify_session_for_rpc()
		if not verified.get("success", false):
			var verify_err := str(verified.get("error", "Not authenticated"))
			_rpc_log(do_log, id, "auth_verify_failed", verify_err)
			return _rpc_fail(verify_err, int(verified.get("status_code", 0)))

	_rpc_log(do_log, id, "request", payload)

	var attempts := maxi(1, retries + 1)
	var result: Dictionary = _rpc_fail("RPC did not run")
	for attempt in range(attempts):
		result = await _rpc_once(id, payload, timeout_sec, use_socket)
		if result.get("success", false):
			_rpc_log(do_log, id, "success", result.get("data"))
			rpc_succeeded.emit(id, result.get("data"))
			return result

		# Auth failure: refresh once, then one more attempt (does not consume transient budget).
		if retry_on_auth and _is_auth_rpc_failure(result):
			_rpc_log(do_log, id, "auth_retry", result.get("error"))
			var refreshed: Dictionary = await refresh_session()
			if refreshed.get("success", false):
				result = await _rpc_once(id, payload, timeout_sec, use_socket)
				if result.get("success", false):
					_rpc_log(do_log, id, "success", result.get("data"))
					rpc_succeeded.emit(id, result.get("data"))
					return result
			retry_on_auth = false

		if attempt >= attempts - 1 or not _is_transient_rpc_failure(result):
			break

		var backoff := RPC_RETRY_BACKOFF_SEC * pow(2.0, float(attempt))
		_rpc_log(do_log, id, "transient_retry", "%s (attempt %s/%s, wait %.2fs)" % [
			str(result.get("error", "")), str(attempt + 1), str(attempts), backoff
		])
		await get_tree().create_timer(backoff).timeout

	_rpc_log(do_log, id, "failed", result.get("error"))
	rpc_failed.emit(id, str(result.get("error", "RPC failed")), int(result.get("status_code", 0)))
	return result


## Restore an existing session. Does NOT create anonymous device accounts.
## Godot login/register must call authenticate_email; device auth is explicit-only.
func ensure_authenticated() -> Dictionary:
	if is_authenticated():
		return {
			"success": true,
			"data": {"user_id": session.user_id, "auth_method": get_auth_method()},
			"error": "",
			"status_code": 200,
		}
	var restored: Dictionary = await restore_session()
	if restored.get("success", false):
		return restored
	return _fail("Not authenticated — log in with email")


## Soft verification: valid session required; soft-refresh near expiry; no new device auth.
func _verify_session_for_rpc() -> Dictionary:
	if is_authenticated():
		if session.would_expire_in(REFRESH_SKEW_SEC) and not session.refresh_token.is_empty() \
				and not session.is_refresh_expired():
			var refreshed: Dictionary = await refresh_session()
			if refreshed.get("success", false):
				return refreshed
			return _fail(str(refreshed.get("error", "Session refresh failed")), int(refreshed.get("status_code", 0)))
		return {"success": true, "data": {"user_id": session.user_id}, "error": "", "status_code": 200}
	if session != null and not session.refresh_token.is_empty() and not session.is_refresh_expired():
		return await refresh_session()
	return _fail("Not authenticated")


func _rpc_once(rpc_id: String, payload: Variant, timeout_sec: float, use_socket: bool) -> Dictionary:
	var encoded: Variant = _encode_rpc_payload(payload)
	# Per-call box so concurrent RPCs never cancel each other / freeze the UI.
	var box: Dictionary = {"result": null, "done": false, "abandoned": false}
	_rpc_worker(rpc_id, encoded, use_socket, box)

	var start_ms := Time.get_ticks_msec()
	var limit_ms := int(maxf(0.25, timeout_sec) * 1000.0)
	while not bool(box.get("done", false)):
		if Time.get_ticks_msec() - start_ms >= limit_ms:
			box["abandoned"] = true
			return _rpc_fail(
				"Nakama server unreachable or timed out (%ss)" % str(timeout_sec),
				408
			)
		await get_tree().process_frame

	var raw_result = box.get("result")
	if raw_result == null:
		return _rpc_fail("RPC returned null")
	if typeof(raw_result) == TYPE_DICTIONARY and (raw_result as Dictionary).has("framework_error"):
		var ferr: Dictionary = raw_result
		return _rpc_fail(str(ferr.get("framework_error", "RPC failed")), int(ferr.get("status_code", 0)))
	if raw_result.has_method("is_exception") and raw_result.is_exception():
		var err := _exception_message(raw_result)
		var status := _exception_status(raw_result)
		# Offline / connection failures often surface as empty status + HTTPRequest text.
		if status == 0 and _looks_like_offline_error(err):
			err = "Nakama server unreachable — %s" % err
		return _rpc_fail(err, status)

	var data: Variant = _decode_rpc_payload(raw_result)
	return _rpc_ok(data)


func _rpc_worker(rpc_id: String, encoded: Variant, use_socket: bool, box: Dictionary) -> void:
	var result = null
	if use_socket and socket != null and socket.is_connected_to_host():
		result = await socket.rpc_async(rpc_id, encoded)
	else:
		if session == null or client == null:
			result = {"framework_error": "Nakama client/session missing", "status_code": 0}
		else:
			result = await client.rpc_async(session, rpc_id, encoded)
	if bool(box.get("abandoned", false)):
		return
	box["result"] = result
	box["done"] = true


func _encode_rpc_payload(payload: Variant) -> Variant:
	if payload == null:
		return null
	match typeof(payload):
		TYPE_STRING:
			var s := str(payload)
			return s if not s.is_empty() else null
		TYPE_DICTIONARY:
			if (payload as Dictionary).is_empty():
				return null
			return JSON.stringify(payload)
		TYPE_ARRAY:
			return JSON.stringify(payload)
		TYPE_BOOL, TYPE_INT, TYPE_FLOAT:
			return JSON.stringify(payload)
		_:
			return JSON.stringify(payload)


func _decode_rpc_payload(result) -> Variant:
	var raw := ""
	if result != null and "payload" in result and result.payload != null:
		raw = str(result.payload)
	if raw.is_empty():
		return {}
	var parsed: Variant = JSON.parse_string(raw)
	if parsed == null:
		return {"raw": raw}
	return parsed


func _promote_server_envelope(res: Dictionary) -> Dictionary:
	var data: Variant = res.get("data")
	if typeof(data) != TYPE_DICTIONARY:
		return res
	var body: Dictionary = data
	if not body.has("ok") and not body.has("success"):
		return res

	var server_ok := bool(body.get("ok", body.get("success", false)))
	var server_error := str(body.get("error", ""))
	var server_data: Variant = body.get("data", {})
	if not body.has("data"):
		server_data = body.duplicate(true)
		server_data.erase("ok")
		server_data.erase("success")
		server_data.erase("error")
		server_data.erase("status")
		server_data.erase("status_code")

	var status := int(res.get("status_code", 200))
	if body.has("status_code"):
		status = int(body.get("status_code"))
	elif body.has("status"):
		status = int(body.get("status"))
	elif not server_ok and status == 200:
		status = 0

	var out := _rpc_result(server_ok, server_data, server_error, status)
	if not server_ok and server_error.is_empty():
		out["error"] = "RPC rejected by server"
	return out


func _is_auth_rpc_failure(result: Dictionary) -> bool:
	var status := int(result.get("status_code", 0))
	if status == 401 or status == 403:
		return true
	var err := str(result.get("error", "")).to_lower()
	return err.contains("unauthorized") or err.contains("unauthenticated") \
		or (err.contains("session") and err.contains("expired")) \
		or err.contains("not authenticated")


func _is_transient_rpc_failure(result: Dictionary) -> bool:
	var status := int(result.get("status_code", 0))
	if status in [0, 408, 425, 429, 500, 502, 503, 504]:
		return true
	var err := str(result.get("error", "")).to_lower()
	return err.contains("timed out") or err.contains("unreachable") \
		or err.contains("httprequest failed") or err.contains("connection") \
		or err.contains("temporarily") or err.contains("unavailable")


func _looks_like_offline_error(err: String) -> bool:
	var e := err.to_lower()
	return e.contains("httprequest failed") or e.contains("connection") \
		or e.contains("unreachable") or e.contains("failed to connect") \
		or e.is_empty()


func _rpc_logging_enabled() -> bool:
	return OS.is_debug_build() or Engine.is_editor_hint()


func _rpc_log(enabled: bool, rpc_id: String, phase: String, detail: Variant = null) -> void:
	if not enabled:
		return
	# Never log tokens / session material — payload may contain gameplay fields only.
	var detail_text := ""
	if detail == null:
		detail_text = ""
	elif typeof(detail) == TYPE_DICTIONARY or typeof(detail) == TYPE_ARRAY:
		detail_text = " %s" % JSON.stringify(detail)
	else:
		detail_text = " %s" % str(detail)
	print("[NakamaManager:RPC] %s %s%s" % [rpc_id, phase, detail_text])


func _rpc_ok(data: Variant) -> Dictionary:
	return _rpc_result(true, data, "", 200)


func _rpc_fail(error: String, status_code: int = 0) -> Dictionary:
	return _rpc_result(false, {}, error, status_code)


func _rpc_result(success: bool, data: Variant, error: String, status_code: int) -> Dictionary:
	return {
		"success": success,
		"data": data if data != null else {},
		"error": error,
		"status_code": status_code,
	}


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
	var device_path := BackendEnvironment.get_device_id_path()
	var id := str(OS.get_unique_id()).strip_edges()
	if not id.is_empty():
		return "%s-%s" % [BackendEnvironment.get_environment_id(), id]
	if FileAccess.file_exists(device_path):
		var existing := FileAccess.get_file_as_string(device_path).strip_edges()
		if not existing.is_empty():
			return existing
	var fallback := "godot-%s-%s-%s" % [
		BackendEnvironment.get_environment_id(),
		str(Time.get_unix_time_from_system()),
		str(randi()),
	]
	var f := FileAccess.open(device_path, FileAccess.WRITE)
	if f != null:
		f.store_string(fallback)
		f.close()
	else:
		push_warning("[NakamaManager] could not persist fallback device id")
	return fallback


func _save_session_tokens() -> void:
	if session == null or not session.is_valid():
		return
	var session_path := BackendEnvironment.get_session_path()
	var cfg := ConfigFile.new()
	cfg.load(session_path)
	cfg.set_value("nakama", "environment", BackendEnvironment.get_environment_id())
	cfg.set_value("nakama", "token", session.token)
	cfg.set_value("nakama", "refresh_token", session.refresh_token)
	cfg.set_value("nakama", "user_id", session.user_id)
	cfg.save(session_path)


func _save_auth_method(method: String) -> void:
	var session_path := BackendEnvironment.get_session_path()
	var cfg := ConfigFile.new()
	cfg.load(session_path)
	cfg.set_value("nakama", "auth_method", method.strip_edges())
	cfg.set_value("nakama", "environment", BackendEnvironment.get_environment_id())
	cfg.save(session_path)


func _save_account_email(email: String) -> void:
	var clean := email.strip_edges().to_lower()
	if clean.is_empty():
		return
	var session_path := BackendEnvironment.get_session_path()
	var cfg := ConfigFile.new()
	cfg.load(session_path)
	cfg.set_value("nakama", "account_email", clean)
	cfg.set_value("nakama", "environment", BackendEnvironment.get_environment_id())
	cfg.save(session_path)


func _load_account_email() -> String:
	var session_path := BackendEnvironment.get_session_path()
	var cfg := ConfigFile.new()
	if cfg.load(session_path) != OK:
		return ""
	var saved_env := str(cfg.get_value("nakama", "environment", ""))
	if not saved_env.is_empty() and saved_env != BackendEnvironment.get_environment_id():
		return ""
	return str(cfg.get_value("nakama", "account_email", "")).strip_edges().to_lower()


func _load_auth_method() -> String:
	var session_path := BackendEnvironment.get_session_path()
	var cfg := ConfigFile.new()
	if cfg.load(session_path) != OK:
		return ""
	var saved_env := str(cfg.get_value("nakama", "environment", ""))
	if not saved_env.is_empty() and saved_env != BackendEnvironment.get_environment_id():
		return ""
	return str(cfg.get_value("nakama", "auth_method", "")).strip_edges()


func _load_session_tokens() -> Dictionary:
	var session_path := BackendEnvironment.get_session_path()
	var cfg := ConfigFile.new()
	if cfg.load(session_path) != OK:
		return {}
	var saved_env := str(cfg.get_value("nakama", "environment", ""))
	if not saved_env.is_empty() and saved_env != BackendEnvironment.get_environment_id():
		# Refuse cross-environment session reuse.
		return {}
	return {
		"token": str(cfg.get_value("nakama", "token", "")),
		"refresh_token": str(cfg.get_value("nakama", "refresh_token", "")),
		"user_id": str(cfg.get_value("nakama", "user_id", "")),
		"auth_method": str(cfg.get_value("nakama", "auth_method", "")),
	}


func _clear_saved_session() -> void:
	var session_path := BackendEnvironment.get_session_path()
	if FileAccess.file_exists(session_path):
		DirAccess.remove_absolute(session_path)


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
