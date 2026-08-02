extends Node
## AFK space mining — StartMining / CollectMining / CancelMining.


func _ready() -> void:
	print("[MiningManager] ready")


func is_mining() -> bool:
	var end := str(GameManager.active_character.get("mining_end_time", ""))
	return not end.is_empty() and end != "<null>"


## True while mining timer is still running (matches server LaunchMission gate).
func is_mining_busy() -> bool:
	return is_mining() and remaining_ms() > 0


func remaining_ms() -> int:
	var end := str(GameManager.active_character.get("mining_end_time", ""))
	if end.is_empty() or end == "<null>":
		return 0
	var cleaned := end.replace("Z", "").replace("z", "")
	var dict := Time.get_datetime_dict_from_datetime_string(cleaned, false)
	if dict.is_empty():
		return 0
	var end_ms := float(Time.get_unix_time_from_datetime_dict(dict)) * 1000.0
	return maxi(0, int(end_ms - Time.get_unix_time_from_system() * 1000.0))


func is_ready() -> bool:
	return is_mining() and remaining_ms() <= 0


func preview_reward(hours: int) -> int:
	var level := maxi(1, int(GameManager.active_character.get("level", 1)))
	var h := clampi(hours, 1, 24)
	return StardustEconomy.compute_mining_reward(level, float(h))


func start(hours: int) -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("StartMining", {"hours": clampi(hours, 1, 24)})
	_apply(res)
	return res


func collect() -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("CollectMining", {})
	_apply(res)
	return res


func cancel() -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("CancelMining", {})
	_apply(res)
	return res


func _apply(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
