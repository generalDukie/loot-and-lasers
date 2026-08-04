extends Node
## Presentation-only recovery / cache boundaries (Restoration 25).
## Node owns authoritative saves. This never uploads gameplay state.

## Bump when local presentation cache shape changes.
const CACHE_SCHEMA_VERSION := 25

const CACHE_DIR := "user://presentation_cache/"
const STATE_LOADING := "loading_authoritative_save"
const STATE_RECONNECTING := "reconnecting"
const STATE_RECOVERING_ACTION := "recovering_previous_action"
const STATE_MIGRATION := "migration_in_progress"
const STATE_MAINTENANCE := "temporary_maintenance"
const STATE_REVIEW := "character_data_requires_review"
const STATE_PENDING_REWARD := "pending_reward_available"
const STATE_CACHE_CLEARED := "stale_client_cache_cleared"
const STATE_RETRY := "retry_available"
const STATE_READY := "ready"

signal recovery_state_changed(state: String, detail: Dictionary)

var current_state: String = STATE_LOADING
var last_recovery: Dictionary = {}
var maintenance_message: String = ""


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(CACHE_DIR)
	print("[RecoveryManager] ready schema=%s" % CACHE_SCHEMA_VERSION)


func set_ui_state(state: String, detail: Dictionary = {}) -> void:
	current_state = state
	recovery_state_changed.emit(state, detail)


## Discard presentation cache when schema/account/character mismatch.
func invalidate_presentation_cache(reason: String = "version_mismatch") -> void:
	var dir := DirAccess.open(CACHE_DIR)
	if dir:
		dir.list_dir_begin()
		var name := dir.get_next()
		while name != "":
			if not dir.current_is_dir():
				dir.remove(name)
			name = dir.get_next()
		dir.list_dir_end()
	set_ui_state(STATE_CACHE_CLEARED, {"reason": reason})


func cache_path(account_id: String, character_id: String, key: String) -> String:
	var safe_a := account_id.replace("/", "_").replace(":", "_")
	var safe_c := character_id.replace("/", "_").replace(":", "_")
	return CACHE_DIR.path_join("%s_%s_%s.cfg" % [safe_a, safe_c, key])


## Write presentation-only snapshot. Never treated as authority.
func write_presentation_cache(account_id: String, character_id: String, key: String, data: Dictionary) -> void:
	if account_id.is_empty() or character_id.is_empty():
		return
	var cfg := ConfigFile.new()
	cfg.set_value("meta", "cache_schema_version", CACHE_SCHEMA_VERSION)
	cfg.set_value("meta", "account_id", account_id)
	cfg.set_value("meta", "character_id", character_id)
	cfg.set_value("meta", "created_at", Time.get_datetime_string_from_system(true))
	cfg.set_value("data", "json", JSON.stringify(data))
	cfg.save(cache_path(account_id, character_id, key))


func read_presentation_cache(account_id: String, character_id: String, key: String) -> Dictionary:
	var path := cache_path(account_id, character_id, key)
	if not FileAccess.file_exists(path):
		return {}
	var cfg := ConfigFile.new()
	if cfg.load(path) != OK:
		return {}
	var ver := int(cfg.get_value("meta", "cache_schema_version", 0))
	var a := str(cfg.get_value("meta", "account_id", ""))
	var c := str(cfg.get_value("meta", "character_id", ""))
	if ver != CACHE_SCHEMA_VERSION or a != account_id or c != character_id:
		invalidate_presentation_cache("schema_or_scope_mismatch")
		return {}
	var raw := str(cfg.get_value("data", "json", "{}"))
	var parsed: Variant = JSON.parse_string(raw)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed


## After lost write response: query Node by stable key. Never invent a new mutation.
func recover_ambiguous_request(payload: Dictionary) -> Dictionary:
	set_ui_state(STATE_RECOVERING_ACTION, payload)
	var res: Dictionary = await GameApiClient.invoke("RecoverAmbiguousRequest", payload)
	last_recovery = res
	if bool(res.get("ok", false)):
		var data: Dictionary = res.get("data", res)
		if bool(data.get("found", false)):
			set_ui_state(STATE_READY, {"recovered": true})
		else:
			set_ui_state(STATE_RETRY, {"found": false})
	else:
		set_ui_state(STATE_RETRY, {"error": res.get("error", "recovery_failed")})
	return res


func refresh_recovery_state() -> Dictionary:
	set_ui_state(STATE_LOADING, {})
	var res: Dictionary = await GameApiClient.invoke("GetRecoveryState", {})
	if bool(res.get("ok", false)):
		var data: Dictionary = res.get("data", res)
		last_recovery = data
		var maint: Dictionary = data.get("maintenance", {})
		if bool(maint.get("enabled", false)):
			maintenance_message = str(maint.get("message", "Temporary maintenance"))
			set_ui_state(STATE_MAINTENANCE, maint)
		else:
			var recovery: Dictionary = data.get("recovery", {})
			if bool(recovery.get("character_review_required", false)):
				set_ui_state(STATE_REVIEW, recovery)
			elif int(recovery.get("pending_loot_count", 0)) > 0:
				set_ui_state(STATE_PENDING_REWARD, recovery)
			else:
				set_ui_state(STATE_READY, recovery)
	else:
		set_ui_state(STATE_RECONNECTING, {"error": res.get("error", "")})
	return res
