extends Node
## Centralized Nakama backend environment (local / staging).
## Selection priority (highest first):
##   1. OS env LOOT_NAKAMA_ENV
##   2. user://backend_env.cfg → [backend] environment=
##   3. ProjectSettings loot/backend/environment
##   4. default: local
##
## Staging socket server key resolution (never logged in full):
##   1. OS env NAKAMA_SOCKET_SERVER_KEY (or LOOT_NAKAMA_SERVER_KEY)
##   2. res://Config/nakama_secrets.cfg [staging] server_key=  (gitignored)
##   3. user://nakama_secrets.cfg [staging] server_key=
## Local uses the built-in defaultkey (Docker compose default).

const ENV_LOCAL := "local"
const ENV_STAGING := "staging"

const SETTING_PATH := "loot/backend/environment"
const USER_ENV_PATH := "user://backend_env.cfg"
const PROJECT_SECRETS_PATH := "res://Config/nakama_secrets.cfg"
const USER_SECRETS_PATH := "user://nakama_secrets.cfg"

## Public connection endpoints only — no DB/console/SSH secrets here.
const ENVIRONMENTS := {
	ENV_LOCAL: {
		"scheme": "http",
		"host": "127.0.0.1",
		"port": 7350,
		"socket_scheme": "ws",
		"server_key": "defaultkey",
		"auth_timeout_sec": 5.0,
		"client_timeout_sec": 2,
	},
	ENV_STAGING: {
		"scheme": "http",
		"host": "178.156.210.186",
		"port": 7350,
		"socket_scheme": "ws",
		# Filled at runtime from env / secrets file — never hardcode staging secrets.
		"server_key": "",
		"auth_timeout_sec": 15.0,
		"client_timeout_sec": 10,
	},
}

var _environment: String = ENV_LOCAL
var _resolved: Dictionary = {}


func _ready() -> void:
	_environment = _resolve_environment_id()
	_resolved = _build_resolved(_environment)
	_log_selection()


func get_environment_id() -> String:
	return _environment


func is_staging() -> bool:
	return _environment == ENV_STAGING


func is_local() -> bool:
	return _environment == ENV_LOCAL


func is_development_overlay_enabled() -> bool:
	return OS.is_debug_build() or OS.has_feature("editor")


## Safe connection summary — never includes server key or tokens.
func get_public_config() -> Dictionary:
	return {
		"environment": _environment,
		"scheme": str(_resolved.get("scheme", "")),
		"host": str(_resolved.get("host", "")),
		"port": int(_resolved.get("port", 0)),
		"socket_scheme": str(_resolved.get("socket_scheme", "ws")),
		"server_key_configured": not str(_resolved.get("server_key", "")).is_empty(),
		"server_key_fingerprint": _key_fingerprint(str(_resolved.get("server_key", ""))),
	}


func get_scheme() -> String:
	return str(_resolved.get("scheme", "http"))


func get_host() -> String:
	return str(_resolved.get("host", "127.0.0.1"))


func get_port() -> int:
	return int(_resolved.get("port", 7350))


func get_socket_scheme() -> String:
	return str(_resolved.get("socket_scheme", "ws"))


func get_server_key() -> String:
	return str(_resolved.get("server_key", ""))


func get_auth_timeout_sec() -> float:
	return float(_resolved.get("auth_timeout_sec", 5.0))


func get_client_timeout_sec() -> int:
	return int(_resolved.get("client_timeout_sec", 2))


## Env-scoped session file so local tokens cannot restore against staging.
func get_session_path() -> String:
	return "user://nakama_session_%s.cfg" % _environment


func get_device_id_path() -> String:
	return "user://nakama_device_id_%s.txt" % _environment


## Persist selection for next launch (dev convenience). Does not store secrets.
func set_environment_persistent(env_id: String) -> Dictionary:
	var id := _normalize_env_id(env_id)
	if id.is_empty():
		return {"ok": false, "error": "Unknown environment (use local or staging)"}
	var cfg := ConfigFile.new()
	cfg.load(USER_ENV_PATH)
	cfg.set_value("backend", "environment", id)
	var err := cfg.save(USER_ENV_PATH)
	if err != OK:
		return {"ok": false, "error": "Failed to save %s" % USER_ENV_PATH}
	return {"ok": true, "environment": id, "note": "Restart Godot (or call apply_environment) to reconnect"}


## Hot-apply after changing selection. Clears client/session; caller must re-auth.
func apply_environment(env_id: String) -> Dictionary:
	var id := _normalize_env_id(env_id)
	if id.is_empty():
		return {"ok": false, "error": "Unknown environment"}
	_environment = id
	_resolved = _build_resolved(_environment)
	if str(_resolved.get("server_key", "")).is_empty():
		return {
			"ok": false,
			"error": "Staging server key missing. Set NAKAMA_SOCKET_SERVER_KEY or Config/nakama_secrets.cfg",
			"config": get_public_config(),
		}
	_log_selection()
	return {"ok": true, "config": get_public_config()}


func _resolve_environment_id() -> String:
	var from_os := _normalize_env_id(OS.get_environment("LOOT_NAKAMA_ENV"))
	if not from_os.is_empty():
		return from_os
	var cfg := ConfigFile.new()
	if cfg.load(USER_ENV_PATH) == OK:
		var from_user := _normalize_env_id(str(cfg.get_value("backend", "environment", "")))
		if not from_user.is_empty():
			return from_user
	if ProjectSettings.has_setting(SETTING_PATH):
		var from_ps := _normalize_env_id(str(ProjectSettings.get_setting(SETTING_PATH, "")))
		if not from_ps.is_empty():
			return from_ps
	return ENV_LOCAL


func _normalize_env_id(raw: String) -> String:
	var v := raw.strip_edges().to_lower()
	if v == ENV_LOCAL or v == ENV_STAGING:
		return v
	return ""


func _build_resolved(env_id: String) -> Dictionary:
	var base: Dictionary = ENVIRONMENTS.get(env_id, ENVIRONMENTS[ENV_LOCAL]).duplicate(true)
	if env_id == ENV_STAGING:
		var key := _load_staging_server_key()
		base["server_key"] = key
	return base


func _load_staging_server_key() -> String:
	var from_os := OS.get_environment("NAKAMA_SOCKET_SERVER_KEY").strip_edges()
	if from_os.is_empty():
		from_os = OS.get_environment("LOOT_NAKAMA_SERVER_KEY").strip_edges()
	if not from_os.is_empty():
		return from_os
	var from_project := _read_secret_key(PROJECT_SECRETS_PATH)
	if not from_project.is_empty():
		return from_project
	return _read_secret_key(USER_SECRETS_PATH)


func _read_secret_key(path: String) -> String:
	var cfg := ConfigFile.new()
	if cfg.load(path) != OK:
		return ""
	return str(cfg.get_value("staging", "server_key", "")).strip_edges()


func _key_fingerprint(key: String) -> String:
	if key.is_empty():
		return "missing"
	if key.length() <= 4:
		return "set(len=%d)" % key.length()
	return "set(len=%d,tail=%s)" % [key.length(), key.substr(key.length() - 2, 2)]


func _log_selection() -> void:
	var pub := get_public_config()
	print(
		"[BackendEnvironment] env=%s %s://%s:%s key=%s"
		% [
			pub.get("environment", ""),
			pub.get("scheme", ""),
			pub.get("host", ""),
			pub.get("port", 0),
			pub.get("server_key_fingerprint", ""),
		]
	)
