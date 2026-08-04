extends Node
## Career / record statistics — presentation only (Restoration 19).
## Node GetCharacterStatistics is authoritative; Godot never increments counters.

signal statistics_loaded(statistics: Dictionary)
signal statistics_error(error: String)

var statistics: Dictionary = {}
var last_public: Dictionary = {}


func _ready() -> void:
	print("[CareerStatsManager] ready")


func clear_local() -> void:
	statistics = {}
	last_public = {}


func load_statistics() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetCharacterStatistics", {})
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "GetCharacterStatistics failed"))
		statistics_error.emit(err)
		return {"ok": false, "error": err, "data": {}}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var stats: Variant = data.get("statistics", {})
	if typeof(stats) == TYPE_DICTIONARY:
		statistics = stats
		statistics_loaded.emit(statistics)
	GameApiClient.apply_authoritative_response(data, "get_character_statistics")
	return {"ok": true, "error": "", "data": data, "statistics": statistics}


func load_public_statistics(character_id: String) -> Dictionary:
	var cid := character_id.strip_edges()
	if cid.is_empty():
		return {"ok": false, "error": "character_id required", "data": {}}
	var res: Dictionary = await GameApiClient.invoke("GetPublicProfileStatistics", {
		"character_id": cid,
	})
	if not bool(res.get("ok", false)):
		return {"ok": false, "error": str(res.get("error", "failed")), "data": {}}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var stats: Variant = data.get("statistics", {})
	if typeof(stats) == TYPE_DICTIONARY:
		last_public = stats
	return {"ok": true, "error": "", "data": data, "statistics": last_public}


## Display helpers — prefer hydrated Node statistics, else character document fields.
func display_int(key: String, fallback_character: Dictionary = {}) -> int:
	if statistics.has(key):
		return int(statistics[key])
	return int(fallback_character.get(key, 0))
