extends Node
## Mission lifecycle.
## Live Cantina launch/claim/fuel remain on the Node API this phase.
## Phase 7 adds authoritative Nakama mission core (board/start/timer/status) with no rewards.

signal board_changed(offers: Array)
signal active_mission_changed(mission: Dictionary)
signal character_updated(character: Dictionary)
signal claim_ready(result: Dictionary)

## Phase 7 — Nakama mission core signals
signal missions_loaded(board: Dictionary)
signal missions_refreshed(board: Dictionary)
signal mission_started(mission: Dictionary)
signal mission_status_changed(status: Dictionary)
signal mission_error(error: String)
signal loading_changed(loading: bool)

const BOARD_CFG := "user://godot_mission_board.cfg"
const STATUS_MIN_INTERVAL_SEC := 2.0

var offers: Array = []
var active_mission: Dictionary = {}
## True when the character points at a mission row the API can no longer load.
var active_mission_missing := false
var last_claim_result: Dictionary = {}
var pending_enemy: Dictionary = {}
var pending_battle: Dictionary = {}
var pending_player_items: Array = []

## Phase 7 Nakama snapshot (parallel to Node; no rewards).
var nakama_board: Dictionary = {}
var nakama_active: Dictionary = {}
var loading := false

var _nakama_busy := false
var _last_status_at := 0.0


func _ready() -> void:
	print("[MissionManager] ready")


func sync_fuel() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("SyncFuelCycle", {})
	_apply_character_payload(res)
	return res


func buy_fuel() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("BuyFuel", {})
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
	var res: Dictionary = await GameApiClient.invoke("LaunchMission", {"template": template})
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
	var res: Dictionary = await GameApiClient.request(
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
		# After SkipMission the row stays "completed" with a stale future end_time —
		# snap to the character's patched end so timers / chrome stay consistent.
		if str(active_mission.get("status", "")) == "completed":
			var end_now := str(GameManager.active_character.get("mission_end_time", ""))
			if not end_now.is_empty():
				active_mission["end_time"] = end_now
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
	if m.is_empty():
		return false
	var status := str(m.get("status", ""))
	if status in ["claimed", "failed"]:
		return true
	return seconds_remaining(m) <= 0


func effective_end_unix(mission: Dictionary = {}) -> int:
	## in_progress → mission.end_time (authoritative timer).
	## completed → prefer character.mission_end_time (SkipMission snaps it to now
	## while the mission row may still hold the original future end_time).
	var m: Dictionary = mission if not mission.is_empty() else active_mission
	var status := str(m.get("status", ""))
	var char_end := str(GameManager.active_character.get("mission_end_time", ""))
	var mission_end := str(m.get("end_time", ""))
	# Phase 7 Nakama missions use completes_at.
	if mission_end.is_empty():
		mission_end = str(m.get("completes_at", ""))
	var iso := ""
	if status == "completed" or status == "complete":
		iso = char_end if not char_end.is_empty() else mission_end
	else:
		iso = mission_end if not mission_end.is_empty() else char_end
	return _parse_iso_unix(iso)


func seconds_remaining(mission: Dictionary = {}) -> int:
	var m: Dictionary = mission if not mission.is_empty() else active_mission
	if m.is_empty():
		return 0
	var status := str(m.get("status", ""))
	if status in ["claimed", "failed", "complete"]:
		return 0
	var end_unix := effective_end_unix(m)
	if end_unix <= 0:
		# Unknown / unparseable end — never treat as ready-to-fight.
		return 1 if status == "in_progress" or status == "active" else 0
	return maxi(0, int(ceil(float(end_unix) - Time.get_unix_time_from_system())))


func _parse_iso_unix(iso: String) -> int:
	## Server timestamps are UTC (...Z). Keep the timezone suffix so Godot parses
	## them as UTC — stripping Z and applying local bias wrongly shifted ends into
	## the past and unlocked FIGHT FOR REWARDS immediately.
	var s := iso.strip_edges()
	if s.is_empty():
		return 0
	# Trim fractional seconds but keep Z / ±HH:MM: 2026-07-31T08:00:30.917Z → …30Z
	var dot := s.find(".")
	if dot >= 0:
		var tz := ""
		for i in range(dot + 1, s.length()):
			var ch := s[i]
			if ch == "Z" or ch == "z" or ch == "+" or ch == "-":
				tz = s.substr(i)
				break
		s = s.substr(0, dot) + tz
	var unix := int(Time.get_unix_time_from_datetime_string(s))
	return maxi(0, unix)


func current_mission_id() -> String:
	## The server resolves claims against character.active_mission_id, so trust it
	## first — the cached row can outlive a character switch or a failed refresh.
	var cid := str(GameManager.active_character.get("active_mission_id", ""))
	if not cid.is_empty():
		return cid
	var mission_raw: Variant = nakama_active.get("mission", {})
	if typeof(mission_raw) == TYPE_DICTIONARY:
		var nakama_id := str((mission_raw as Dictionary).get("mission_id", ""))
		if not nakama_id.is_empty():
			return nakama_id
	return str(active_mission.get("id", active_mission.get("mission_id", "")))


func skip_mission() -> Dictionary:
	var mid := current_mission_id()
	if mid.is_empty():
		return {"ok": false, "error": "No active mission", "data": {}}
	var res: Dictionary = await GameApiClient.invoke("SkipMission", {"mission_id": mid})
	_apply_character_payload(res)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var mission_raw: Variant = res.data.get("mission", null)
		if typeof(mission_raw) == TYPE_DICTIONARY and not (mission_raw as Dictionary).is_empty():
			active_mission = (mission_raw as Dictionary).duplicate(true)
		# Align local timer with the character's patched end time + completed status.
		active_mission["status"] = "completed"
		var end_now := str(GameManager.active_character.get("mission_end_time", ""))
		if not end_now.is_empty():
			active_mission["end_time"] = end_now
		active_mission_missing = bool(res.data.get("mission_missing", false))
		active_mission_changed.emit(active_mission)
	return res


func claim_mission(won: bool = true) -> Dictionary:
	var mid := current_mission_id()
	if mid.is_empty():
		return {"ok": false, "error": "No active mission", "data": {}}
	var body := {"mission_id": mid, "won": won}
	var res: Dictionary
	if won:
		res = await GameApiClient.invoke("ClaimMission", body)
	else:
		res = await GameApiClient.invoke("FailMission", {"mission_id": mid})
		if not res.ok:
			res = await GameApiClient.invoke("ClaimMission", {"mission_id": mid, "won": false})
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


func prepare_combat(refresh: bool = true) -> Dictionary:
	## Generate encounter + simulate once. Call after mission timer/skip completes.
	## Set refresh=false when the character payload was just applied (e.g. SkipMission).
	if refresh:
		await refresh_character()
	if not is_mission_finished() and not active_mission_missing:
		return {"ok": false, "error": "Mission not finished yet"}
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


# ---------------------------------------------------------------------------
# Phase 7 — Nakama mission core (no rewards / fuel / claim)
# ---------------------------------------------------------------------------

func load_missions(character_id: String = "") -> Dictionary:
	return await _nakama_board_rpc("missions_get", character_id, false)


func refresh_missions(character_id: String = "") -> Dictionary:
	return await _nakama_board_rpc("missions_refresh", character_id, true)


func start_mission(mission_id: String, character_id: String = "") -> Dictionary:
	if _nakama_busy:
		return _fail_nakama("Mission request already in progress")
	if mission_id.strip_edges().is_empty():
		return _fail_nakama("mission_id is required")

	_nakama_busy = true
	_set_loading(true)
	var payload := _nakama_character_payload(character_id)
	payload["mission_id"] = mission_id.strip_edges()
	var res: Dictionary = await NakamaManager.invoke_rpc("mission_start", payload)
	_nakama_busy = false
	_set_loading(false)

	if not bool(res.get("success", false)):
		var err := str(res.get("error", "mission_start failed"))
		mission_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status_code", 0)),
		}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		return _fail_nakama("Malformed mission_start response")

	nakama_active = (data as Dictionary).duplicate(true)
	var mission: Variant = nakama_active.get("mission", {})
	if typeof(mission) == TYPE_DICTIONARY:
		mission_started.emit(mission)
		mission_status_changed.emit(nakama_active)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": nakama_active,
		"status_code": int(res.get("status_code", 200)),
	}


func get_active_mission(character_id: String = "") -> Dictionary:
	return await refresh_mission_status(character_id)


func refresh_mission_status(character_id: String = "", force: bool = false) -> Dictionary:
	var now := Time.get_ticks_msec() / 1000.0
	if not force and (now - _last_status_at) < STATUS_MIN_INTERVAL_SEC and not nakama_active.is_empty():
		return {
			"ok": true,
			"success": true,
			"error": "",
			"data": nakama_active,
			"status_code": 200,
			"cached": true,
		}
	if _nakama_busy:
		return _fail_nakama("Mission request already in progress")

	_nakama_busy = true
	_set_loading(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("mission_status", _nakama_character_payload(character_id))
	_nakama_busy = false
	_set_loading(false)
	_last_status_at = Time.get_ticks_msec() / 1000.0

	if not bool(res.get("success", false)):
		var err := str(res.get("error", "mission_status failed"))
		mission_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status_code", 0)),
		}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		return _fail_nakama("Malformed mission_status response")

	nakama_active = (data as Dictionary).duplicate(true)
	mission_status_changed.emit(nakama_active)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": nakama_active,
		"status_code": int(res.get("status_code", 200)),
	}


func clear_nakama_mission_local() -> void:
	nakama_board = {}
	nakama_active = {}


func _nakama_board_rpc(rpc_id: String, character_id: String, is_refresh: bool) -> Dictionary:
	if _nakama_busy:
		return _fail_nakama("Mission request already in progress")
	_nakama_busy = true
	_set_loading(true)
	var payload := _nakama_character_payload(character_id)
	var ch: Dictionary = GameManager.active_character
	payload["level"] = int(ch.get("level", 1))
	payload["highest_sector"] = int(ch.get("highest_sector", 0))
	var res: Dictionary = await NakamaManager.invoke_rpc(rpc_id, payload)
	_nakama_busy = false
	_set_loading(false)

	if not bool(res.get("success", false)):
		var err := str(res.get("error", "%s failed" % rpc_id))
		mission_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status_code", 0)),
		}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		return _fail_nakama("Malformed %s response" % rpc_id)

	var board: Variant = (data as Dictionary).get("board", {})
	if typeof(board) == TYPE_DICTIONARY:
		nakama_board = (board as Dictionary).duplicate(true)
		if is_refresh:
			missions_refreshed.emit(nakama_board)
		else:
			missions_loaded.emit(nakama_board)

	var active: Variant = (data as Dictionary).get("active", null)
	if typeof(active) == TYPE_DICTIONARY:
		nakama_active = (active as Dictionary).duplicate(true)
		mission_status_changed.emit(nakama_active)

	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": data,
		"status_code": int(res.get("status_code", 200)),
	}


func _nakama_character_payload(character_id: String = "") -> Dictionary:
	var cid := character_id.strip_edges()
	if cid.is_empty():
		cid = str(GameManager.active_character.get("id", ""))
	if cid.is_empty() and ProfileManager != null:
		cid = str(ProfileManager.profile.get("selected_character_id", ""))
	var payload: Dictionary = {}
	if not cid.is_empty():
		payload["character_id"] = cid
	return payload


func _set_loading(value: bool) -> void:
	if loading == value:
		return
	loading = value
	loading_changed.emit(loading)


func _fail_nakama(error: String, status_code: int = 0) -> Dictionary:
	mission_error.emit(error)
	return {
		"ok": false,
		"success": false,
		"error": error,
		"data": {},
		"status_code": status_code,
	}


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
