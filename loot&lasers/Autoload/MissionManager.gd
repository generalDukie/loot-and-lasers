extends Node
## Mission lifecycle against the Node API (cantina is client-generated).

signal board_changed(offers: Array)
signal active_mission_changed(mission: Dictionary)
signal character_updated(character: Dictionary)
signal claim_ready(result: Dictionary)

const BOARD_CFG := "user://godot_mission_board.cfg"

var offers: Array = []
var active_mission: Dictionary = {}
## True when the character points at a mission row the API can no longer load.
var active_mission_missing := false
var last_claim_result: Dictionary = {}
var pending_enemy: Dictionary = {}
var pending_battle: Dictionary = {}
var pending_player_items: Array = []


func _ready() -> void:
	print("[MissionManager] ready")


func sync_fuel() -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("SyncFuelCycle", {})
	_apply_character_payload(res)
	return res


func buy_fuel() -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("BuyFuel", {})
	_apply_character_payload(res)
	return res


func refresh_character() -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return {"ok": false, "error": "No active character", "data": {}}
	var res: Dictionary = await AuthManager.get_character(cid)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		GameManager.active_character = res.data
		character_updated.emit(res.data)
		await _restore_active_mission_from_character()
	return res


func ensure_board(force_reroll: bool = false) -> Array:
	var character: Dictionary = GameManager.active_character
	var cid := str(character.get("id", ""))
	if cid.is_empty():
		offers = []
		board_changed.emit(offers)
		return offers

	if not force_reroll:
		var cached := _load_board(cid)
		if not cached.is_empty():
			offers = cached
			board_changed.emit(offers)
			return offers

	offers = MissionBoard.build_board(character)
	_save_board(cid, offers)
	board_changed.emit(offers)
	return offers


func reroll_board() -> Array:
	return await ensure_board(true)


func launch_offer(offer: Dictionary) -> Dictionary:
	var template := offer.duplicate(true)
	# Server ignores preview XP/SD; keep loot metadata.
	var res: Dictionary = await ApiClient.invoke("LaunchMission", {"template": template})
	if not res.ok:
		return res
	_apply_character_payload(res)
	if typeof(res.data) == TYPE_DICTIONARY and typeof(res.data.get("mission", {})) == TYPE_DICTIONARY:
		active_mission = res.data["mission"]
		active_mission_changed.emit(active_mission)
	# Consume this board after launch (web regenerates after resolve).
	_clear_board(str(GameManager.active_character.get("id", "")))
	offers = []
	board_changed.emit(offers)
	return res


func fetch_active_mission() -> Dictionary:
	var mid := str(GameManager.active_character.get("active_mission_id", ""))
	if mid.is_empty():
		active_mission = {}
		active_mission_missing = false
		active_mission_changed.emit(active_mission)
		return {"ok": true, "data": {}}
	var res: Dictionary = await ApiClient.request(
		"POST",
		"/api/entities/Mission/filter",
		{"query": {"id": mid}, "sort": "-created_date", "limit": 1},
		true
	)
	if res.ok and typeof(res.data) == TYPE_ARRAY and not res.data.is_empty():
		var row: Dictionary = res.data[0]
		var status := str(row.get("status", "in_progress"))
		if status == "claimed" or status == "failed":
			# Row is resolved but the character still points at it — same dead end as
			# a deleted row, so offer the recall instead of a timer that never claims.
			active_mission_missing = true
			active_mission = {
				"id": mid,
				"name": str(row.get("name", "Resolved Mission")),
				"end_time": "",
				"status": status,
			}
			active_mission_changed.emit(active_mission)
			return res
		active_mission_missing = false
		active_mission = row
		# Prefer character mission_end_time if mission row is missing it.
		if str(active_mission.get("end_time", "")).is_empty():
			var end_fallback := str(GameManager.active_character.get("mission_end_time", ""))
			if not end_fallback.is_empty():
				active_mission["end_time"] = end_fallback
	elif res.ok:
		# Character still points at a mission id we can't load — keep a stub so resume
		# UI works. Claiming it lets the server release the dangling pointer.
		active_mission_missing = true
		active_mission = {
			"id": mid,
			"name": "Lost Mission Record",
			"end_time": "",
			"status": "in_progress",
		}
	active_mission_changed.emit(active_mission)
	return res


func resume_or_hub() -> void:
	## Route helper used by hub / boot after character refresh.
	if has_active_mission():
		if active_mission.is_empty():
			await fetch_active_mission()
		GameManager.go_mission_run()
	else:
		GameManager.go_hub()


func is_mission_finished(mission: Dictionary = {}) -> bool:
	var m: Dictionary = mission if not mission.is_empty() else active_mission
	var end_iso := str(m.get("end_time", GameManager.active_character.get("mission_end_time", "")))
	if end_iso.is_empty():
		return false
	return seconds_remaining(m) <= 0


func seconds_remaining(mission: Dictionary = {}) -> int:
	var m: Dictionary = mission if not mission.is_empty() else active_mission
	var end_iso := str(m.get("end_time", GameManager.active_character.get("mission_end_time", "")))
	if end_iso.is_empty():
		return 0
	var end_unix := _parse_iso_unix(end_iso)
	if end_unix <= 0:
		return 0
	return maxi(0, int(ceil(float(end_unix) - Time.get_unix_time_from_system())))


func _parse_iso_unix(iso: String) -> int:
	var s := iso.strip_edges()
	if s.ends_with("Z"):
		s = s.substr(0, s.length() - 1)
	# Drop milliseconds: 2026-07-31T08:00:30.917
	var dot := s.find(".")
	if dot >= 0:
		s = s.substr(0, dot)
	var unix := Time.get_unix_time_from_datetime_string(s)
	return int(unix)


func current_mission_id() -> String:
	## The server resolves claims against character.active_mission_id, so trust it
	## first — the cached row can outlive a character switch or a failed refresh.
	var cid := str(GameManager.active_character.get("active_mission_id", ""))
	if not cid.is_empty():
		return cid
	return str(active_mission.get("id", ""))


func skip_mission() -> Dictionary:
	var mid := current_mission_id()
	if mid.is_empty():
		return {"ok": false, "error": "No active mission", "data": {}}
	var res: Dictionary = await ApiClient.invoke("SkipMission", {"mission_id": mid})
	_apply_character_payload(res)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY and typeof(res.data.get("mission", {})) == TYPE_DICTIONARY:
		active_mission = res.data["mission"]
		active_mission_changed.emit(active_mission)
	return res


func claim_mission(won: bool = true) -> Dictionary:
	var mid := current_mission_id()
	if mid.is_empty():
		return {"ok": false, "error": "No active mission", "data": {}}
	var body := {"mission_id": mid, "won": won}
	var res: Dictionary
	if won:
		res = await ApiClient.invoke("ClaimMission", body)
	else:
		res = await ApiClient.invoke("FailMission", {"mission_id": mid})
		if not res.ok:
			res = await ApiClient.invoke("ClaimMission", {"mission_id": mid, "won": false})
	_apply_character_payload(res)
	if res.ok:
		last_claim_result = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
		var mission_snap: Dictionary = active_mission.duplicate(true)
		if won and not bool(last_claim_result.get("mission_missing", false)):
			GameManager.remember_loot_from_claim(last_claim_result)
		else:
			GameManager.recent_loot_ids = PackedStringArray()
		active_mission = {}
		active_mission_missing = false
		pending_enemy = {}
		pending_battle = {}
		pending_player_items = []
		active_mission_changed.emit(active_mission)
		claim_ready.emit(last_claim_result)
		if won and not bool(last_claim_result.get("mission_missing", false)):
			var gains: Dictionary = last_claim_result.get("gains", {}) if typeof(last_claim_result.get("gains", {})) == TYPE_DICTIONARY else {}
			await SocialManager.contribute_mission(mission_snap, gains)
		await ensure_board(true)
	return res


func prepare_combat() -> Dictionary:
	## Generate encounter + simulate once. Call after mission timer/skip completes.
	await refresh_character()
	var equipped: Array = []
	var items_res: Dictionary = await AuthManager.list_items()
	if items_res.ok and typeof(items_res.data) == TYPE_ARRAY:
		for it in items_res.data:
			if typeof(it) == TYPE_DICTIONARY and bool(it.get("is_equipped", false)):
				equipped.append(it)
	pending_player_items = equipped
	pending_enemy = MissionCombat.generate_encounter(GameManager.active_character, active_mission)
	pending_battle = MissionCombat.simulate_battle(
		GameManager.active_character,
		pending_enemy,
		pending_player_items
	)
	return {"ok": true, "enemy": pending_enemy, "battle": pending_battle}


func resolve_combat_outcome() -> Dictionary:
	## Claim or fail based on pending_battle.winner.
	var won := str(pending_battle.get("winner", "opponent")) == "player"
	return await claim_mission(won)


func has_active_mission() -> bool:
	return not str(GameManager.active_character.get("active_mission_id", "")).is_empty()


func _restore_active_mission_from_character() -> void:
	if has_active_mission():
		await fetch_active_mission()
	else:
		active_mission = {}
		active_mission_changed.emit(active_mission)


func _apply_character_payload(res: Dictionary) -> void:
	if not res.ok:
		return
	if typeof(res.data) != TYPE_DICTIONARY:
		return
	var ch: Variant = res.data.get("character", null)
	if typeof(ch) == TYPE_DICTIONARY and not ch.is_empty():
		GameManager.active_character = ch
		character_updated.emit(ch)
		return
	var patch: Variant = res.data.get("patch", null)
	if typeof(patch) == TYPE_DICTIONARY and not patch.is_empty():
		for k in patch.keys():
			GameManager.active_character[k] = patch[k]
		character_updated.emit(GameManager.active_character)


func _load_board(character_id: String) -> Array:
	var cfg := ConfigFile.new()
	if cfg.load(BOARD_CFG) != OK:
		return []
	var raw: Variant = cfg.get_value(character_id, "offers", [])
	return raw if typeof(raw) == TYPE_ARRAY else []


func _save_board(character_id: String, board: Array) -> void:
	var cfg := ConfigFile.new()
	cfg.load(BOARD_CFG)
	cfg.set_value(character_id, "offers", board)
	cfg.save(BOARD_CFG)


func _clear_board(character_id: String) -> void:
	if character_id.is_empty():
		return
	var cfg := ConfigFile.new()
	cfg.load(BOARD_CFG)
	cfg.set_value(character_id, "offers", [])
	cfg.save(BOARD_CFG)
