extends Node
## AFK space mining — StartMining / CollectMining / CancelMining / GetMiningStatus.
## Presentation only: countdown display + requests. Node owns timers and rewards.

var _collect_request_id := ""


func _ready() -> void:
	print("[MiningManager] ready")


func is_mining() -> bool:
	var end := str(GameManager.active_character.get("mining_end_time", ""))
	return not end.is_empty() and end != "<null>"


## True while mining timer is still running (matches server LaunchMission gate).
func is_mining_busy() -> bool:
	return is_mining() and remaining_ms() > 0


func remaining_ms() -> int:
	# Prefer server unix when present (avoids ISO parse quirks / clock skew display).
	var unix_raw = GameManager.active_character.get("mining_end_time_unix", null)
	if unix_raw == null:
		var mining: Variant = GameManager.active_character.get("mining", null)
		if typeof(mining) == TYPE_DICTIONARY:
			unix_raw = (mining as Dictionary).get("mining_end_time_unix", null)
			var rem_snap = (mining as Dictionary).get("remaining_ms", null)
			# Snapshot only when end unix missing — do not freeze UI on poll snapshot alone.
			if unix_raw == null and rem_snap != null:
				return maxi(0, int(rem_snap))
	if unix_raw != null:
		var end_unix := int(unix_raw)
		if end_unix > 0:
			return maxi(0, int((float(end_unix) - Time.get_unix_time_from_system()) * 1000.0))

	var end := str(GameManager.active_character.get("mining_end_time", ""))
	if end.is_empty() or end == "<null>":
		return 0
	var end_unix2 := _parse_iso_unix(end)
	if end_unix2 <= 0:
		return 0
	return maxi(0, int((float(end_unix2) - Time.get_unix_time_from_system()) * 1000.0))


func is_ready() -> bool:
	return is_mining() and remaining_ms() <= 0


func committed_reward() -> int:
	return maxi(0, int(GameManager.active_character.get("mining_reward", 0)))


func preview_reward(hours: int) -> int:
	var level := maxi(1, int(GameManager.active_character.get("level", 1)))
	var h := clampi(hours, 1, 24)
	return StardustEconomy.compute_mining_reward(level, float(h))


func refresh_status() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetMiningStatus", {})
	_apply(res)
	return res


func start(hours: int) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("StartMining", {"hours": clampi(hours, 1, 24)})
	_apply(res)
	return res


func collect() -> Dictionary:
	if _collect_request_id.is_empty():
		_collect_request_id = "mine_collect_%s_%d" % [
			str(GameManager.active_character.get("id", "char")),
			Time.get_ticks_msec(),
		]
	var res: Dictionary = await GameApiClient.invoke("CollectMining", {
		"request_id": _collect_request_id,
	})
	_apply(res)
	if res.ok:
		_collect_request_id = ""
	return res


func cancel() -> Dictionary:
	_collect_request_id = ""
	var res: Dictionary = await GameApiClient.invoke("CancelMining", {})
	_apply(res)
	return res


func _apply(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	if typeof(data.get("mining", null)) == TYPE_DICTIONARY:
		var mining: Dictionary = data.mining
		# Flatten timer fields onto active_character for remaining_ms() / UI.
		for k in [
			"mining_end_time_unix",
			"mining_start_time_unix",
			"mining_start_time",
			"mining_hours",
			"remaining_ms",
			"mining_state",
		]:
			if mining.has(k):
				GameManager.active_character[k] = mining[k]
		GameManager.active_character["mining"] = mining
	GameApiClient.apply_authoritative_response(data, "mining_mutation")


func _parse_iso_unix(iso: String) -> int:
	var s := iso.strip_edges()
	if s.is_empty():
		return 0
	var dot := s.find(".")
	if dot >= 0:
		var tz := ""
		for i in range(dot + 1, s.length()):
			var ch := s[i]
			if ch == "Z" or ch == "z" or ch == "+" or ch == "-":
				tz = s.substr(i)
				break
		s = s.substr(0, dot) + tz
	return maxi(0, int(Time.get_unix_time_from_datetime_string(s)))
