extends Node
## HTTP client for the Loot & Lasers Node API.
## Base URL follows BackendEnvironment (local/staging) unless overridden.

signal base_url_changed(url: String)

const DEFAULT_BASE_URL := "http://127.0.0.1:8787"
const CONFIG_PATH := "user://godot_client.cfg"
## Boot probe — fail fast so splash → login stays snappy if the API is down/slow.
const HEALTH_TIMEOUT_SEC := 0.75
const DEFAULT_TIMEOUT_SEC := 30.0

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
	# Staging: drop leftover localhost so LOOT_NODE_API_URL / secrets can win.
	if BackendEnvironment != null and BackendEnvironment.is_staging():
		if saved.contains("127.0.0.1") or saved.contains("localhost"):
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


func invoke(function_name: String, body: Dictionary = {}) -> Dictionary:
	return await request("POST", "/api/functions/%s" % function_name, body, true)


func request(
	method: String,
	path: String,
	body: Variant = null,
	authed: bool = true,
	timeout_sec: float = DEFAULT_TIMEOUT_SEC
) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = maxf(0.25, timeout_sec)
	add_child(http)

	var headers: PackedStringArray = ["Content-Type: application/json", "Accept: application/json"]
	if authed:
		var token := AuthManager.access_token
		if token.is_empty():
			http.queue_free()
			return {"ok": false, "status": 0, "error": "Not logged in", "data": {}}
		headers.append("Authorization: Bearer %s" % token)

	var url := "%s%s" % [base_url, path]
	var payload := ""
	if body != null:
		payload = JSON.stringify(body)

	var http_method := _method_enum(method)
	var err := http.request(url, headers, http_method, payload)
	if err != OK:
		http.queue_free()
		return {"ok": false, "status": 0, "error": "Request failed to start (%s)" % err, "data": {}}

	var completed: Array = await http.request_completed
	http.queue_free()

	var result: int = completed[0]
	var status_code: int = completed[1]
	var response_body: PackedByteArray = completed[3]

	if result != HTTPRequest.RESULT_SUCCESS:
		return {
			"ok": false,
			"status": status_code,
			"error": "Network error (%s). Is the API running on %s?" % [result, base_url],
			"data": {},
		}

	var text := response_body.get_string_from_utf8()
	var data: Variant = {}
	if not text.is_empty():
		var parsed: Variant = JSON.parse_string(text)
		if parsed != null:
			data = parsed
		else:
			data = {"raw": text}

	var ok := status_code >= 200 and status_code < 300
	var error_msg := ""
	if not ok:
		if typeof(data) == TYPE_DICTIONARY and data.has("error"):
			error_msg = str(data["error"])
		else:
			error_msg = "HTTP %s" % status_code

	return {"ok": ok, "status": status_code, "error": error_msg, "data": data}


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
		_:
			return HTTPClient.METHOD_GET


func _load_base_url() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) == OK:
		base_url = str(cfg.get_value("api", "base_url", DEFAULT_BASE_URL)).rstrip("/")
	else:
		base_url = DEFAULT_BASE_URL
