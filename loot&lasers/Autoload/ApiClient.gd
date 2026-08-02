extends Node
## HTTP client for the Loot & Lasers Node API (localhost:8787 by default).

signal base_url_changed(url: String)

const DEFAULT_BASE_URL := "http://127.0.0.1:8787"
const CONFIG_PATH := "user://godot_client.cfg"

var base_url: String = DEFAULT_BASE_URL


func _ready() -> void:
	_load_base_url()
	print("[ApiClient] base_url=%s" % base_url)


func set_base_url(url: String) -> void:
	base_url = url.rstrip("/")
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	cfg.set_value("api", "base_url", base_url)
	cfg.save(CONFIG_PATH)
	base_url_changed.emit(base_url)


func health() -> Dictionary:
	return await request("GET", "/health", null, false)


func invoke(function_name: String, body: Dictionary = {}) -> Dictionary:
	return await request("POST", "/api/functions/%s" % function_name, body, true)


func request(method: String, path: String, body: Variant = null, authed: bool = true) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = 30.0
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
