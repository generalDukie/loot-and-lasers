extends Node
## Phase 10 — Client-visible remote config + feature flags (read-only).
## Architecture: UI → RemoteConfigManager → config_get → modules/config.lua
## Cache under user:// is presentation-only; Nakama remains authoritative.

signal config_loaded(data: Dictionary)
signal config_changed(data: Dictionary)
signal config_error(error: String)
signal loading_changed(loading: bool)
signal maintenance_changed(enabled: bool, message: String)

const RPC_GET := "config_get"
const CACHE_PATH := "user://remote_config_cache.json"

## Presentation defaults when offline / before first fetch (match server defaults).
const DEFAULTS := {
	"global": {
		"maintenance_enabled": false,
		"maintenance_message": "",
		"maintenance_started_at": "",
		"maintenance_expected_end": "",
		"minimum_client_version": "",
		"recommended_client_version": "",
		"update_message": "",
		"update_required": false,
		"announcement_text": "",
	},
	"missions": {
		"board_size": 3,
		"free_refresh_cooldown_seconds": 15,
	},
	"client_ui": {
		"show_development_banner": true,
	},
}

const DEFAULT_FLAGS := {
	"shipments_enabled": true,
}

var loading := false
var revision: int = 0
var environment: String = "development"
var namespaces: Dictionary = {}
var feature_flags: Dictionary = {}
var fetched_at_unix: int = 0
var _from_cache: bool = false
var _load_busy := false
var _last_maintenance := false


func _ready() -> void:
	_apply_defaults()
	_load_cache_file()
	print("[RemoteConfigManager] ready (client-visible config_get)")


func load_config(client_version: String = "") -> Dictionary:
	return await reload_config(client_version)


func reload_config(client_version: String = "") -> Dictionary:
	if _load_busy:
		return _fail("Config load already in progress")
	_load_busy = true
	_set_loading(true)

	var payload: Dictionary = {}
	var ver := client_version.strip_edges()
	if not ver.is_empty():
		payload["client_version"] = ver

	var res: Dictionary = await NakamaManager.invoke_rpc(RPC_GET, payload)
	_load_busy = false
	_set_loading(false)

	if typeof(res) != TYPE_DICTIONARY:
		var bad := _fail("Malformed config response")
		config_error.emit(str(bad.error))
		return bad

	if not bool(res.get("success", false)):
		var err := str(res.get("error", "Config request failed"))
		config_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status_code", 0)),
		}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		var malformed := _fail("Malformed config data")
		config_error.emit(str(malformed.error))
		return malformed

	_apply_server_payload(data as Dictionary, false)
	_save_cache_file()
	config_loaded.emit(_snapshot())
	config_changed.emit(_snapshot())
	_emit_maintenance_if_changed()
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": _snapshot(),
		"status_code": int(res.get("status_code", 200)),
	}


func get_value(ns: String, key: String, fallback: Variant = null) -> Variant:
	var bag: Variant = namespaces.get(ns, null)
	if typeof(bag) == TYPE_DICTIONARY and (bag as Dictionary).has(key):
		return (bag as Dictionary)[key]
	var def_ns: Variant = DEFAULTS.get(ns, null)
	if typeof(def_ns) == TYPE_DICTIONARY and (def_ns as Dictionary).has(key):
		return (def_ns as Dictionary)[key]
	return fallback


func get_namespace(ns: String) -> Dictionary:
	var bag: Variant = namespaces.get(ns, null)
	if typeof(bag) == TYPE_DICTIONARY:
		return (bag as Dictionary).duplicate(true)
	var def_ns: Variant = DEFAULTS.get(ns, null)
	if typeof(def_ns) == TYPE_DICTIONARY:
		return (def_ns as Dictionary).duplicate(true)
	return {}


func is_feature_enabled(flag_id: String, fallback: bool = false) -> bool:
	if feature_flags.has(flag_id):
		return bool(feature_flags[flag_id])
	if DEFAULT_FLAGS.has(flag_id):
		return bool(DEFAULT_FLAGS[flag_id])
	return fallback


func get_revision() -> int:
	return revision


func clear_local_cache() -> void:
	if FileAccess.file_exists(CACHE_PATH):
		DirAccess.remove_absolute(CACHE_PATH)
	_apply_defaults()
	_from_cache = false
	fetched_at_unix = 0
	config_changed.emit(_snapshot())
	_emit_maintenance_if_changed()


func _apply_defaults() -> void:
	namespaces = {}
	for ns in DEFAULTS.keys():
		namespaces[ns] = (DEFAULTS[ns] as Dictionary).duplicate(true)
	feature_flags = DEFAULT_FLAGS.duplicate(true)
	revision = 0
	environment = "development"


func _apply_server_payload(data: Dictionary, from_cache: bool) -> void:
	_from_cache = from_cache
	revision = int(data.get("revision", 0))
	environment = str(data.get("environment", "development"))
	var ns: Variant = data.get("namespaces", {})
	if typeof(ns) == TYPE_DICTIONARY:
		namespaces = (ns as Dictionary).duplicate(true)
	var flags: Variant = data.get("feature_flags", {})
	if typeof(flags) == TYPE_DICTIONARY:
		feature_flags = (flags as Dictionary).duplicate(true)
	fetched_at_unix = int(data.get("fetched_at_unix", int(Time.get_unix_time_from_system())))


func _snapshot() -> Dictionary:
	return {
		"revision": revision,
		"environment": environment,
		"namespaces": namespaces.duplicate(true),
		"feature_flags": feature_flags.duplicate(true),
		"fetched_at_unix": fetched_at_unix,
		"from_cache": _from_cache,
	}


func _load_cache_file() -> void:
	if not FileAccess.file_exists(CACHE_PATH):
		return
	var f := FileAccess.open(CACHE_PATH, FileAccess.READ)
	if f == null:
		return
	var text := f.get_as_text()
	f.close()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var data := parsed as Dictionary
	# Cache is presentation-only; validate shape before use.
	if typeof(data.get("namespaces", null)) != TYPE_DICTIONARY:
		return
	_apply_server_payload(data, true)


func _save_cache_file() -> void:
	var payload := _snapshot()
	payload["fetched_at_unix"] = int(Time.get_unix_time_from_system())
	fetched_at_unix = int(payload["fetched_at_unix"])
	var f := FileAccess.open(CACHE_PATH, FileAccess.WRITE)
	if f == null:
		return
	f.store_string(JSON.stringify(payload))
	f.close()


func _emit_maintenance_if_changed() -> void:
	var enabled := bool(get_value("global", "maintenance_enabled", false))
	var message := str(get_value("global", "maintenance_message", ""))
	if enabled != _last_maintenance:
		_last_maintenance = enabled
		maintenance_changed.emit(enabled, message)


func _set_loading(v: bool) -> void:
	loading = v
	loading_changed.emit(v)


func _fail(msg: String) -> Dictionary:
	return {
		"ok": false,
		"success": false,
		"error": msg,
		"data": {},
		"status_code": 0,
	}
