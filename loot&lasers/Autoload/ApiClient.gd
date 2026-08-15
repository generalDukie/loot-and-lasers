extends Node
## HTTP client for the Loot & Lasers Node API.
## Base URL follows BackendEnvironment (local/staging) unless overridden.
##
## Client envelope (additive):
##   { ok, status, error, code, data, details, retryable, attempts }
## Mutations are never auto-retried unless `idempotent` is true.

signal base_url_changed(url: String)

const DEFAULT_BASE_URL := "http://127.0.0.1:8787"
const CONFIG_PATH := "user://godot_client.cfg"
## Boot probe — fail fast so splash → login stays snappy if the API is down/slow.
const HEALTH_TIMEOUT_SEC := 0.75
const DEFAULT_TIMEOUT_SEC := 30.0
## One automatic re-attempt after the first failure for safe reads / idempotent calls.
const DEFAULT_SAFE_RETRIES := 1
const RETRY_BACKOFF_SEC := 0.25

const CODE_UNAUTHORIZED := "UNAUTHORIZED"
const CODE_AUTH_SESSION_INVALID := "AUTH_SESSION_INVALID"
const CODE_FORBIDDEN := "FORBIDDEN"
const CODE_NOT_FOUND := "NOT_FOUND"
const CODE_CONFLICT := "CONFLICT"
const CODE_VALIDATION_ERROR := "VALIDATION_ERROR"
const CODE_TIMEOUT := "TIMEOUT"
const CODE_NETWORK_ERROR := "NETWORK_ERROR"
const CODE_INTERNAL_ERROR := "INTERNAL_ERROR"

var base_url: String = DEFAULT_BASE_URL


func _ready() -> void:
	_apply_environment_base_url()
	print("[GameApiClient] base_url=%s" % base_url)


## Prefer BackendEnvironment / LOOT_NODE_API_URL over a stale localhost cfg from local play.
func _apply_environment_base_url() -> void:
	var env_url := ""
	if BackendEnvironment != null and BackendEnvironment.has_method("get_node_api_base_url"):
		env_url = str(BackendEnvironment.get_node_api_base_url()).strip_edges().rstrip("/")
	if env_url.is_empty():
		_load_base_url()
		return
	# Staging (or any non-local env URL) wins over saved localhost so friends share one API.
	var saved := ""
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) == OK:
		saved = str(cfg.get_value("api", "base_url", "")).strip_edges().rstrip("/")
	if not saved.is_empty() and _urls_compatible(saved, env_url):
		base_url = saved
	else:
		base_url = env_url
		cfg.set_value("api", "base_url", base_url)
		cfg.save(CONFIG_PATH)
	base_url_changed.emit(base_url)


func _urls_compatible(saved: String, env_url: String) -> bool:
	if saved == env_url:
		return true
	# Never keep a URL pointed at Nakama (7350/7349/7351) — that is not the Node auth API.
	if _looks_like_nakama_url(saved):
		return false
	# Staging has one authoritative public HTTPS endpoint. Never retain a saved
	# direct-port URL (such as :8787) or any other stale override.
	if BackendEnvironment != null and BackendEnvironment.is_staging():
		return false
	return saved.begins_with("http")


func is_nakama_url(url: String) -> bool:
	return _looks_like_nakama_url(url)


func _looks_like_nakama_url(url: String) -> bool:
	var u := url.to_lower()
	return u.contains(":7350") or u.contains(":7349") or u.contains(":7351")


func set_base_url(url: String) -> void:
	var cleaned := url.strip_edges().rstrip("/")
	if _looks_like_nakama_url(cleaned):
		push_warning("[GameApiClient] Refusing Nakama URL for Node API: %s" % cleaned)
		return
	base_url = cleaned
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	cfg.set_value("api", "base_url", base_url)
	cfg.save(CONFIG_PATH)
	base_url_changed.emit(base_url)


func health(timeout_sec: float = HEALTH_TIMEOUT_SEC) -> Dictionary:
	return await request("GET", "/health", null, false, timeout_sec)


## Probe the one authoritative Node gameplay API. Never fall back from staging
## to localhost, which would silently switch the player to another SQLite DB.
func prefer_reachable_base_url() -> Dictionary:
	var primary := base_url
	var health_primary: Dictionary = await health(HEALTH_TIMEOUT_SEC)
	if health_primary.get("ok", false):
		return {"ok": true, "base_url": base_url, "fallback": false, "error": ""}

	return {
		"ok": false,
		"base_url": primary,
		"fallback": false,
		"error": str(health_primary.get("error", "Node API unreachable")),
	}


func invoke(function_name: String, body: Dictionary = {}, idempotent: bool = false) -> Dictionary:
	return await request(
		"POST",
		"/api/functions/%s" % function_name,
		body,
		true,
		DEFAULT_TIMEOUT_SEC,
		true,
		idempotent
	)


func request(
	method: String,
	path: String,
	body: Variant = null,
	authed: bool = true,
	timeout_sec: float = DEFAULT_TIMEOUT_SEC,
	allow_reauth: bool = true,
	idempotent: bool = false,
	max_retries: int = -1
) -> Dictionary:
	var retries := max_retries
	if retries < 0:
		retries = DEFAULT_SAFE_RETRIES if _is_retry_eligible(method, idempotent) else 0
	var attempts := maxi(1, retries + 1)
	var last: Dictionary = {}

	for attempt in range(attempts):
		last = await _request_once(method, path, body, authed, timeout_sec, allow_reauth)
		last["attempts"] = attempt + 1
		if last.get("ok", false):
			return last
		# Auth re-bridge already consumed allow_reauth inside _request_once.
		allow_reauth = false
		if attempt >= attempts - 1:
			break
		if not bool(last.get("retryable", false)):
			break
		if not _is_retry_eligible(method, idempotent):
			break
		await get_tree().create_timer(RETRY_BACKOFF_SEC * float(attempt + 1)).timeout

	return last


func _request_once(
	method: String,
	path: String,
	body: Variant,
	authed: bool,
	timeout_sec: float,
	allow_reauth: bool
) -> Dictionary:
	if authed and allow_reauth and AuthManager != null and _node_gameplay_token_needs_refresh():
		var proactive: Dictionary = await AuthManager.refresh_node_gameplay_session()
		if AuthManager.access_token.is_empty():
			if AuthManager.is_logged_in():
				return _client_error(
					int(proactive.get("status", 503)),
					str(proactive.get("error", "Gameplay session unavailable")),
					"NODE_SESSION_UNAVAILABLE",
					true
				)
			return _client_error(
				int(proactive.get("status", 401)),
				str(proactive.get("error", "Not logged in")),
				CODE_UNAUTHORIZED
			)

	var http := HTTPRequest.new()
	http.timeout = maxf(0.25, timeout_sec)
	add_child(http)

	var headers: PackedStringArray = ["Content-Type: application/json", "Accept: application/json"]
	var request_id := _new_request_id()
	headers.append("X-Request-Id: %s" % request_id)
	if authed:
		var token := AuthManager.access_token if AuthManager != null else ""
		if token.is_empty():
			http.queue_free()
			if AuthManager != null and AuthManager.is_logged_in():
				return _client_error(0, "Gameplay session unavailable", "NODE_SESSION_UNAVAILABLE", true)
			return _client_error(0, "Not logged in", CODE_UNAUTHORIZED)
		headers.append("Authorization: Bearer %s" % token)

	var url := "%s%s" % [base_url, path]
	var payload := ""
	if body != null:
		payload = JSON.stringify(body)

	var http_method := _method_enum(method)
	var started_ms := Time.get_ticks_msec()
	var err := http.request(url, headers, http_method, payload)
	if err != OK:
		http.queue_free()
		_diag_fail(method, path, request_id, 0, "Request failed to start", CODE_NETWORK_ERROR)
		return _client_error(0, "Request failed to start (%s)" % err, CODE_NETWORK_ERROR, true)

	var completed: Array = await http.request_completed
	http.queue_free()

	var result: int = completed[0]
	var status_code: int = completed[1]
	var response_body: PackedByteArray = completed[3]
	var duration_ms := Time.get_ticks_msec() - started_ms

	if result != HTTPRequest.RESULT_SUCCESS:
		var transport := _transport_failure(result, status_code)
		transport["request_id"] = request_id
		_diag_fail(method, path, request_id, status_code, str(transport.get("error", "transport")), str(transport.get("code", CODE_NETWORK_ERROR)), duration_ms)
		return transport

	var text := response_body.get_string_from_utf8()
	var data: Variant = {}
	if not text.is_empty():
		var json := JSON.new()
		if json.parse(text) == OK:
			data = json.data
		else:
			data = {"raw": text}

	var envelope := _normalize_http_envelope(status_code, data)
	envelope["request_id"] = request_id
	if typeof(data) == TYPE_DICTIONARY and str(data.get("request_id", "")).is_empty() == false:
		envelope["request_id"] = str(data.get("request_id"))

	if not bool(envelope.get("ok", false)):
		_diag_fail(method, path, str(envelope.get("request_id", request_id)), status_code, str(envelope.get("error", "")), str(envelope.get("code", "")), duration_ms)

	if status_code == 401 and authed and allow_reauth and AuthManager != null:
		if str(envelope.get("code", "")) == CODE_AUTH_SESSION_INVALID:
			if AuthManager.has_method("handle_session_superseded"):
				await AuthManager.handle_session_superseded(str(envelope.get("error", "")))
			return envelope
		var refreshed: Dictionary = await AuthManager.refresh_node_gameplay_session()
		if refreshed.get("success", false):
			return await _request_once(method, path, body, authed, timeout_sec, false)

	return envelope


func _node_gameplay_token_needs_refresh() -> bool:
	if AuthManager == null:
		return false
	if AuthManager.access_token.is_empty():
		return AuthManager.is_logged_in()
	var expires_at := int(AuthManager.node_token_expires_at)
	if expires_at <= 0:
		return false
	return expires_at <= Time.get_unix_time_from_system() + AuthManager.NODE_REFRESH_SKEW_SEC


## Apply server-authored character / patch / wallet / attribute sheet fields.
## Does not invent a second cache — only GameManager + CurrencyManager + StatsManager.
func apply_authoritative_response(data: Variant, source: String = "api") -> Dictionary:
	var out := {
		"character_applied": false,
		"patch_applied": false,
		"wallet_applied": false,
		"sheet_applied": false,
		"items_applied": false,
	}
	if typeof(data) != TYPE_DICTIONARY:
		return out
	var body: Dictionary = data

	var ch: Variant = body.get("character", null)
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty() and GameManager != null:
		GameManager.apply_active_character(ch, source)
		out["character_applied"] = true
	else:
		var patch: Variant = body.get("patch", null)
		if typeof(patch) != TYPE_DICTIONARY or (patch as Dictionary).is_empty():
			patch = body.get("applied", null)
		if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty() and GameManager != null:
			GameManager.apply_active_character_patch(patch, source)
			out["patch_applied"] = true

	var wallet: Variant = body.get("wallet", null)
	if typeof(wallet) != TYPE_DICTIONARY or (wallet as Dictionary).is_empty():
		var bal: Variant = body.get("balances", null)
		if typeof(bal) == TYPE_DICTIONARY and not (bal as Dictionary).is_empty():
			# Economy RPCs often return bare getBalances() — wrap for CurrencyManager.
			var wrapped: Dictionary = {"balances": (bal as Dictionary).duplicate(true)}
			var cid := str(body.get("character_id", "")).strip_edges()
			if cid.is_empty() and typeof(ch) == TYPE_DICTIONARY:
				cid = str((ch as Dictionary).get("id", "")).strip_edges()
			if cid.is_empty() and GameManager != null:
				cid = str(GameManager.active_character.get("id", "")).strip_edges()
			if not cid.is_empty():
				wrapped["character_id"] = cid
			var txn := str(body.get("transaction_id", "")).strip_edges()
			if txn.is_empty() and typeof(body.get("transaction", null)) == TYPE_DICTIONARY:
				txn = str((body.get("transaction") as Dictionary).get("transaction_id", "")).strip_edges()
			if not txn.is_empty():
				wrapped["transaction_id"] = txn
			if body.has("revision"):
				wrapped["revision"] = body.get("revision")
			wallet = wrapped
		else:
			wallet = null
	elif typeof(wallet) == TYPE_DICTIONARY and not (wallet as Dictionary).has("balances"):
		# Some payloads put currency keys on wallet itself.
		var w := wallet as Dictionary
		if w.has("fuel") or w.has("stardust") or w.has("nova_crystals"):
			var nested: Dictionary = {"balances": w.duplicate(true)}
			var wid := str(w.get("character_id", body.get("character_id", ""))).strip_edges()
			if wid.is_empty() and GameManager != null:
				wid = str(GameManager.active_character.get("id", "")).strip_edges()
			if not wid.is_empty():
				nested["character_id"] = wid
			wallet = nested
	if typeof(wallet) == TYPE_DICTIONARY and CurrencyManager != null:
		if CurrencyManager.apply_authoritative_wallet(wallet, source):
			out["wallet_applied"] = true

	if StatsManager != null and StatsManager.has_method("apply_inventory_snapshot"):
		if StatsManager.apply_inventory_snapshot(body):
			out["items_applied"] = true
			out["sheet_applied"] = not StatsManager.authoritative_sheet.is_empty()

	return out


func default_error_code(status: int) -> String:
	if status == 401:
		return CODE_UNAUTHORIZED
	if status == 403:
		return CODE_FORBIDDEN
	if status == 404:
		return CODE_NOT_FOUND
	if status == 409:
		return CODE_CONFLICT
	if status == 400 or status == 422:
		return CODE_VALIDATION_ERROR
	if status == 408:
		return CODE_TIMEOUT
	return CODE_INTERNAL_ERROR


func is_safe_read_method(method: String) -> bool:
	var m := method.to_upper()
	return m == "GET" or m == "HEAD"


func is_retry_eligible(method: String, idempotent: bool = false) -> bool:
	return _is_retry_eligible(method, idempotent)


func is_transient_failure(result: Dictionary) -> bool:
	if bool(result.get("retryable", false)):
		return true
	var status := int(result.get("status", 0))
	if status in [0, 408, 425, 429, 502, 503, 504]:
		return true
	var code := str(result.get("code", ""))
	return code == CODE_TIMEOUT or code == CODE_NETWORK_ERROR


func _is_retry_eligible(method: String, idempotent: bool) -> bool:
	return idempotent or is_safe_read_method(method)


func _normalize_http_envelope(status_code: int, data: Variant) -> Dictionary:
	var ok := status_code >= 200 and status_code < 300
	var error_msg := ""
	var code := ""
	var details: Variant = null
	var retryable := false

	if typeof(data) == TYPE_DICTIONARY:
		var body: Dictionary = data
		if body.has("code"):
			code = str(body.get("code", ""))
		if body.has("details"):
			details = body.get("details")
		if not ok:
			if body.has("error"):
				error_msg = str(body["error"])
			elif body.has("message"):
				error_msg = str(body["message"])

	if not ok and error_msg.is_empty():
		error_msg = "HTTP %s" % status_code
	if not ok and code.is_empty():
		code = default_error_code(status_code)
	if ok:
		code = str(code)

	if not ok:
		retryable = status_code in [408, 425, 429, 502, 503, 504]

	return {
		"ok": ok,
		"status": status_code,
		"error": error_msg,
		"code": code,
		"data": data,
		"details": details,
		"retryable": retryable,
		"attempts": 1,
	}


func _transport_failure(result: int, status_code: int) -> Dictionary:
	var code := CODE_NETWORK_ERROR
	var msg := "Network error (%s). Is the API running on %s?" % [result, base_url]
	if result == HTTPRequest.RESULT_TIMEOUT:
		code = CODE_TIMEOUT
		msg = "Request timed out talking to %s" % base_url
	elif result == HTTPRequest.RESULT_CANT_CONNECT \
		or result == HTTPRequest.RESULT_CANT_RESOLVE \
		or result == HTTPRequest.RESULT_CONNECTION_ERROR:
		code = CODE_NETWORK_ERROR
		msg = "Could not connect to Node API at %s" % base_url
	return {
		"ok": false,
		"status": status_code,
		"error": msg,
		"code": code,
		"data": {},
		"details": {"http_result": result},
		"retryable": true,
		"attempts": 1,
	}


func _client_error(status: int, error_msg: String, code: String, retryable: bool = false) -> Dictionary:
	return {
		"ok": false,
		"status": status,
		"error": error_msg,
		"code": code,
		"data": {},
		"details": null,
		"retryable": retryable,
		"attempts": 1,
	}


func _method_enum(method: String) -> int:
	match method.to_upper():
		"GET":
			return HTTPClient.METHOD_GET
		"POST":
			return HTTPClient.METHOD_POST
		"PUT":
			return HTTPClient.METHOD_PUT
		"PATCH":
			return HTTPClient.METHOD_PATCH
		"DELETE":
			return HTTPClient.METHOD_DELETE
		"HEAD":
			return HTTPClient.METHOD_HEAD
		_:
			return HTTPClient.METHOD_GET


func _load_base_url() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) == OK:
		base_url = str(cfg.get_value("api", "base_url", DEFAULT_BASE_URL)).rstrip("/")
	else:
		base_url = DEFAULT_BASE_URL


func _new_request_id() -> String:
	return "g%d-%d" % [Time.get_unix_time_from_system(), randi() % 100000]


func _diag_fail(
	method: String,
	path: String,
	request_id: String,
	status: int,
	error_msg: String,
	code: String,
	duration_ms: int = 0
) -> void:
	if DiagnosticLogger == null:
		return
	DiagnosticLogger.warn("GameApiClient", "api_request_failed", {
		"method": method,
		"path": path,
		"request_id": request_id,
		"status": status,
		"code": code,
		"error": error_msg,
		"duration_ms": duration_ms,
	})
	DiagnosticLogger.breadcrumb("api_fail", {
		"path": path,
		"status": status,
		"request_id": request_id,
	})
