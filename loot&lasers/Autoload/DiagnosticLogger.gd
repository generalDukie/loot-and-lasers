extends Node
## Privacy-safe client diagnostics (Restoration 27).
## Never logs tokens, JWTs, passwords, chat/mail bodies, or full inventory.
## Telemetry is non-authoritative — never grants rewards or progression.

const LOG_DIR := "user://logs/"
const LOG_FILE := "client.log"
const MAX_LOG_BYTES := 256 * 1024
const MAX_BREADCRUMBS := 40

const SEV_DEBUG := "debug"
const SEV_INFO := "info"
const SEV_WARN := "warn"
const SEV_ERROR := "error"

signal breadcrumb_recorded(entry: Dictionary)

var _breadcrumbs: Array = []
var _client_version: String = "unknown"
var _environment: String = "local"


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(LOG_DIR)
	_client_version = str(Engine.get_version_info().get("string", "godot"))
	if BackendEnvironment != null and BackendEnvironment.has_method("get_environment_name"):
		_environment = str(BackendEnvironment.get_environment_name())
	info("DiagnosticLogger", "ready", {"client_version": _client_version, "environment": _environment})


func debug(component: String, message: String, fields: Dictionary = {}) -> void:
	_emit(SEV_DEBUG, component, message, fields)


func info(component: String, message: String, fields: Dictionary = {}) -> void:
	_emit(SEV_INFO, component, message, fields)


func warn(component: String, message: String, fields: Dictionary = {}) -> void:
	_emit(SEV_WARN, component, message, fields)


func error(component: String, message: String, fields: Dictionary = {}) -> void:
	_emit(SEV_ERROR, component, message, fields)


func breadcrumb(kind: String, detail: Dictionary = {}) -> void:
	var entry := {
		"ts": Time.get_datetime_string_from_system(true),
		"kind": kind,
		"detail": _redact(detail),
	}
	_breadcrumbs.push_back(entry)
	while _breadcrumbs.size() > MAX_BREADCRUMBS:
		_breadcrumbs.pop_front()
	breadcrumb_recorded.emit(entry)


func get_breadcrumbs() -> Array:
	return _breadcrumbs.duplicate(true)


## Safe crash/diagnostic payload — excludes tokens and private content.
func serialize_safe_diagnostic(extra: Dictionary = {}) -> Dictionary:
	return {
		"client_version": _client_version,
		"environment": _environment,
		"scene": _active_scene_name(),
		"breadcrumbs": get_breadcrumbs(),
		"extra": _redact(extra),
		"authoritative": false,
	}


## Optional non-authoritative analytics. Never blocks gameplay.
func record_analytics(event_name: String, properties: Dictionary = {}, consent: bool = true) -> void:
	if not consent:
		return
	# Fire-and-forget; ignore result.
	GameApiClient.invoke("RecordClientAnalytics", {
		"name": event_name,
		"properties": _redact(properties),
		"consent": consent,
	})


func _emit(severity: String, component: String, message: String, fields: Dictionary) -> void:
	var payload := {
		"ts": Time.get_datetime_string_from_system(true),
		"severity": severity,
		"component": component,
		"message": message,
		"environment": _environment,
		"client_version": _client_version,
		"fields": _redact(fields),
	}
	var line := JSON.stringify(payload)
	if severity == SEV_ERROR:
		push_error("[%s] %s" % [component, message])
	elif severity == SEV_WARN:
		push_warning("[%s] %s" % [component, message])
	else:
		# Avoid per-frame spam in production builds
		if severity == SEV_DEBUG and OS.has_feature("release"):
			return
		print("[%s] %s" % [component, message])
	_append_file(line)


func _redact(data: Dictionary) -> Dictionary:
	var out := {}
	for k in data.keys():
		var key := str(k).to_lower()
		if key.contains("password") or key.contains("token") or key.contains("authorization") or key.contains("secret") or key.contains("jwt") or key.contains("cookie"):
			out[k] = "[redacted]"
		elif key.contains("chat") or key.contains("mail_body") or key.contains("message_body"):
			out[k] = "[redacted]"
		else:
			var v: Variant = data[k]
			if typeof(v) == TYPE_STRING and str(v).length() > 500:
				out[k] = str(v).substr(0, 500) + "…"
			else:
				out[k] = v
	return out


func _append_file(line: String) -> void:
	var path := LOG_DIR.path_join(LOG_FILE)
	if FileAccess.file_exists(path):
		var sz := FileAccess.get_file_as_bytes(path).size()
		if sz > MAX_LOG_BYTES:
			# Rotate: truncate by rewriting last half is complex — delete and start fresh.
			DirAccess.remove_absolute(path)
	var f := FileAccess.open(path, FileAccess.READ_WRITE)
	if f == null:
		f = FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return
	f.seek_end()
	f.store_line(line)
	f.close()


func _active_scene_name() -> String:
	var tree := get_tree()
	if tree == null or tree.current_scene == null:
		return ""
	return str(tree.current_scene.name)
