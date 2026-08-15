extends Node
## AFK space mining — StartMining / CollectMining / CancelMining / GetMiningStatus.
## Presentation only: countdown display + requests. Node owns timers and rewards.
## Mutations are serialized (idle → starting → mining → aborting → idle).

signal phase_changed(phase: String)

const PHASE_IDLE := "idle"
const PHASE_STARTING := "starting"
const PHASE_MINING := "mining"
const PHASE_ABORTING := "aborting"
const PHASE_COLLECTING := "collecting"

var _collect_request_id := ""
var _phase := PHASE_IDLE
var _bound_character_id := ""
var _end_unix := 0
var _start_unix := 0
var _job_hours := 0
var _rem_snap_ms := -1
var _rem_snap_at_msec := 0


func _ready() -> void:
	print("[MiningManager] ready")
	if GameManager != null and not GameManager.active_character_changed.is_connected(_on_active_character_changed):
		GameManager.active_character_changed.connect(_on_active_character_changed)


func phase() -> String:
	return _phase


func is_mutation_locked() -> bool:
	return _phase == PHASE_STARTING or _phase == PHASE_ABORTING or _phase == PHASE_COLLECTING


func is_mining() -> bool:
	_sync_character_binding()
	if _end_unix > 0:
		return true
	var end := str(GameManager.active_character.get("mining_end_time", "")).strip_edges()
	return not end.is_empty() and end != "<null>" and end != "null"


## True while mining timer is still running (matches server LaunchMission gate).
func is_mining_busy() -> bool:
	return is_mining() and remaining_ms() > 0


func remaining_ms() -> int:
	_sync_character_binding()
	if _end_unix > 0:
		return maxi(0, int((float(_end_unix) - Time.get_unix_time_from_system()) * 1000.0))
	if _rem_snap_ms >= 0:
		var elapsed := Time.get_ticks_msec() - _rem_snap_at_msec
		return maxi(0, _rem_snap_ms - elapsed)
	return 0


func job_duration_ms() -> int:
	_sync_character_binding()
	if _start_unix > 0 and _end_unix > 0 and _end_unix > _start_unix:
		return (_end_unix - _start_unix) * 1000
	if _job_hours > 0:
		return _job_hours * 3600 * 1000
	var hours := maxi(0, _as_int(GameManager.active_character.get("mining_hours", 0)))
	if hours > 0:
		return hours * 3600 * 1000
	return 0


func job_hours() -> int:
	_sync_character_binding()
	if _job_hours > 0:
		return _job_hours
	return maxi(0, _as_int(GameManager.active_character.get("mining_hours", 0)))


func is_ready() -> bool:
	return is_mining() and remaining_ms() <= 0


func committed_reward() -> int:
	return maxi(0, _as_int(GameManager.active_character.get("mining_reward", 0)))


func preview_reward(hours: int) -> int:
	var level := maxi(1, _as_int(GameManager.active_character.get("level", 1), 1))
	var h := clampi(hours, 1, 12)
	return StardustEconomy.compute_mining_reward(level, float(h))


func refresh_status() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetMiningStatus", {})
	if not is_mutation_locked():
		_apply(res)
		_unlock_from_character()
	return res


func start(hours: int) -> Dictionary:
	if TutorialManager != null and TutorialManager.blocks_mining_start():
		return {
			"ok": false,
			"error": "Finish or skip the tutorial before deploying the mining drone",
			"data": {},
			"status": 0,
			"code": "MINING_TUTORIAL_LOCKED",
		}
	if is_mutation_locked():
		return _busy_error()
	if is_ready():
		return await refresh_status()
	if is_mining_busy():
		return await refresh_status()
	_set_phase(PHASE_STARTING)
	var res: Dictionary = await GameApiClient.invoke("StartMining", {"hours": clampi(hours, 1, 12)})
	res = await _retry_if_node_session_gap(res, func() -> Dictionary:
		return await GameApiClient.invoke("StartMining", {"hours": clampi(hours, 1, 12)})
	)
	await _finish_mutation(res)
	return res


func collect() -> Dictionary:
	if is_mutation_locked():
		return _busy_error()
	_set_phase(PHASE_COLLECTING)
	var cid := str(GameManager.active_character.get("id", "char"))
	if _collect_request_id.is_empty() or not _collect_request_id.begins_with("mine_collect_%s_" % cid):
		_collect_request_id = "mine_collect_%s_%d" % [cid, Time.get_ticks_msec()]
	var payload := {"request_id": _collect_request_id}
	var res: Dictionary = await GameApiClient.invoke("CollectMining", payload)
	res = await _retry_if_node_session_gap(res, func() -> Dictionary:
		return await GameApiClient.invoke("CollectMining", payload)
	)
	if res.ok:
		_collect_request_id = ""
	await _finish_mutation(res)
	return res


func cancel() -> Dictionary:
	if is_mutation_locked():
		return _busy_error()
	if is_ready():
		return {
			"ok": false,
			"error": "Mining finished — collect the node instead of aborting",
			"data": {},
			"status": 409,
			"code": "MINING_READY_COLLECT",
		}
	if not is_mining():
		return await refresh_status()
	_set_phase(PHASE_ABORTING)
	_collect_request_id = ""
	var res: Dictionary = await GameApiClient.invoke("CancelMining", {})
	res = await _retry_if_node_session_gap(res, func() -> Dictionary:
		return await GameApiClient.invoke("CancelMining", {})
	)
	await _finish_mutation(res)
	return res


func _busy_error() -> Dictionary:
	return {
		"ok": false,
		"error": "Mining request already in progress",
		"data": {},
		"status": 0,
		"code": "MINING_BUSY",
	}


func _finish_mutation(res: Dictionary) -> void:
	if res.ok:
		_apply(res)
	else:
		var status: Dictionary = await GameApiClient.invoke("GetMiningStatus", {})
		_apply(status)
	_unlock_from_character()


func _unlock_from_character() -> void:
	if is_mining():
		_set_phase(PHASE_MINING)
	else:
		_set_phase(PHASE_IDLE)


func _set_phase(next: String) -> void:
	if _phase == next:
		return
	_phase = next
	phase_changed.emit(_phase)


func _on_active_character_changed(character: Dictionary, _source: String) -> void:
	var cid := str(character.get("id", "")).strip_edges()
	if cid == _bound_character_id:
		return
	_bound_character_id = cid
	_collect_request_id = ""
	_clear_timer_cache()
	_capture_timer_from_character(character)
	_unlock_from_character()


func _sync_character_binding() -> void:
	var cid := str(GameManager.active_character.get("id", "")).strip_edges()
	if cid == _bound_character_id:
		return
	_bound_character_id = cid
	_collect_request_id = ""
	_clear_timer_cache()
	_capture_timer_from_character(GameManager.active_character)


func _clear_timer_cache() -> void:
	_end_unix = 0
	_start_unix = 0
	_job_hours = 0
	_rem_snap_ms = -1
	_rem_snap_at_msec = 0


func _retry_if_node_session_gap(res: Dictionary, again: Callable) -> Dictionary:
	if res.ok:
		return res
	var code := str(res.get("code", ""))
	if code != "NODE_SESSION_UNAVAILABLE" and code != GameApiClient.CODE_UNAUTHORIZED:
		return res
	if AuthManager == null or not AuthManager.is_logged_in():
		return res
	var bridged: Dictionary = await AuthManager.refresh_node_gameplay_session()
	if not bridged.get("success", false) and AuthManager.access_token.is_empty():
		return {
			"ok": false,
			"error": "Gameplay session unavailable",
			"code": "NODE_SESSION_UNAVAILABLE",
			"data": {},
			"status": _as_int(bridged.get("status", 503), 503),
		}
	return await again.call()


func _apply(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var mining: Dictionary = {}
	if typeof(data.get("mining", null)) == TYPE_DICTIONARY:
		mining = data.mining
		GameManager.active_character["mining"] = mining
	GameApiClient.apply_authoritative_response(data, "mining_mutation")
	_sync_character_binding()
	if not mining.is_empty():
		_capture_timer_from_mining(mining)
	else:
		_capture_timer_from_character(GameManager.active_character)


func _capture_timer_from_mining(mining: Dictionary) -> void:
	var hours_raw: Variant = mining.get("hours", null)
	if hours_raw == null:
		hours_raw = mining.get("mining_hours", 0)
	_job_hours = maxi(0, _as_int(hours_raw))
	_start_unix = maxi(0, _as_int(mining.get("mining_start_time_unix", 0)))
	_end_unix = maxi(0, _as_int(mining.get("mining_end_time_unix", 0)))
	if _end_unix <= 0:
		_end_unix = _parse_iso_unix(str(mining.get("mining_end_time", "")))
	if _start_unix <= 0:
		_start_unix = _parse_iso_unix(str(mining.get("mining_start_time", "")))
	if _end_unix <= 0 and mining.get("remaining_ms", null) != null:
		_rem_snap_ms = maxi(0, _as_int(mining.get("remaining_ms", 0)))
		_rem_snap_at_msec = Time.get_ticks_msec()
	else:
		_rem_snap_ms = -1
	if mining.has("mining_hours") and mining.get("mining_hours", null) != null:
		GameManager.active_character["mining_hours"] = _job_hours
	elif _job_hours > 0:
		GameManager.active_character["mining_hours"] = _job_hours


func _capture_timer_from_character(character: Dictionary) -> void:
	_job_hours = maxi(0, _as_int(character.get("mining_hours", 0)))
	_end_unix = _parse_iso_unix(str(character.get("mining_end_time", "")))
	_start_unix = _parse_iso_unix(str(character.get("mining_start_time", "")))
	_rem_snap_ms = -1


func _as_int(value: Variant, fallback: int = 0) -> int:
	if value == null:
		return fallback
	match typeof(value):
		TYPE_INT:
			return value
		TYPE_FLOAT:
			return int(value)
		TYPE_BOOL:
			return 1 if value else 0
		TYPE_STRING:
			var s := str(value).strip_edges()
			if s.is_empty() or s == "<null>" or s == "null":
				return fallback
			if s.is_valid_int():
				return int(s)
			if s.is_valid_float():
				return int(float(s))
			return fallback
		_:
			return fallback


func _parse_iso_unix(iso: String) -> int:
	## Godot's ISO parser wants YYYY-MM-DDTHH:MM:SS with no Z / fractional seconds.
	var s := iso.strip_edges()
	if s.is_empty() or s == "<null>" or s == "null":
		return 0
	s = s.replace("Z", "").replace("z", "")
	var plus := s.rfind("+")
	if plus >= 19:
		s = s.substr(0, plus)
	var dot := s.find(".")
	if dot >= 0:
		s = s.substr(0, dot)
	if s.length() < 19:
		return 0
	if s.length() >= 11 and s.substr(10, 1) == " ":
		s = s.substr(0, 10) + "T" + s.substr(11)
	var parsed := Time.get_unix_time_from_datetime_string(s)
	return maxi(0, _as_int(parsed))
