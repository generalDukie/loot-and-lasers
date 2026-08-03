extends Node
## Mission lifecycle — Phase 8: Nakama is the sole mission authority.
## Board / start / timer / completion eligibility: Nakama RPCs only.
## Local board cfg is a non-authoritative display cache (never generates missions).
## Fuel buy/sync remain on Node (economy). Rewards / claim grants are deferred.

signal board_changed(offers: Array)
signal active_mission_changed(mission: Dictionary)
signal character_updated(character: Dictionary)
signal claim_ready(result: Dictionary)

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
## True when a dangling / unreadable active pointer exists (legacy Node path).
var active_mission_missing := false
var last_claim_result: Dictionary = {}
var pending_enemy: Dictionary = {}
var pending_battle: Dictionary = {}
var pending_player_items: Array = []

## Authoritative Nakama snapshots.
var nakama_board: Dictionary = {}
var nakama_active: Dictionary = {}
var loading := false

var _nakama_busy := false
var _last_status_at := 0.0


func _ready() -> void:
	print("[MissionManager] ready (Nakama mission authority)")


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
		await _restore_active_mission_from_nakama()
	return res


## Load board exclusively from Nakama `missions_get` (or refresh).
## Local cfg is written only as a display cache after a successful Nakama load.
## Never calls MissionBoard.build_board for authoritative offers.
func ensure_board(force_reroll: bool = false) -> Array:
	var character: Dictionary = GameManager.active_character
	var cid := str(character.get("id", ""))
	if cid.is_empty():
		offers = []
		board_changed.emit(offers)
		return offers

	await _ensure_profile_character(cid)

	var res: Dictionary
	if force_reroll:
		res = await refresh_missions(cid)
	else:
		res = await load_missions(cid)

	if not res.get("success", false):
		# Do not invent missions. Optional stale cache for offline UX messaging only.
		var cached := _load_board_cache(cid)
		if not cached.is_empty():
			offers = cached
			board_changed.emit(offers)
			mission_error.emit(str(res.get("error", "Nakama board unavailable — showing cached display only")))
		else:
			offers = []
			board_changed.emit(offers)
		return offers

	offers = _offers_from_nakama_board(nakama_board)
	_save_board_cache(cid, offers)
	board_changed.emit(offers)
	_apply_nakama_active_to_local()
	return offers


func reroll_board() -> Array:
	return await ensure_board(true)


## Start via Nakama `mission_start` only. Does not call Node LaunchMission (no fuel debit).
func launch_offer(offer: Dictionary) -> Dictionary:
	var mission_id := str(offer.get("mission_id", offer.get("id", ""))).strip_edges()
	if mission_id.is_empty():
		return {"ok": false, "error": "mission_id is required", "data": {}}

	var res: Dictionary = await start_mission(mission_id)
	if not res.get("success", false):
		return {
			"ok": false,
			"error": str(res.get("error", "Launch failed")),
			"data": res.get("data", {}),
			"status_code": int(res.get("status_code", 0)),
		}

	_apply_nakama_active_to_local()
	_clear_board_cache(str(GameManager.active_character.get("id", "")))
	offers = []
	board_changed.emit(offers)
	return {
		"ok": true,
		"error": "",
		"data": {"mission": active_mission},
		"status_code": int(res.get("status_code", 200)),
	}


## Restore active mission from Nakama `mission_status` (not Node Mission filter).
func fetch_active_mission() -> Dictionary:
	await _ensure_profile_character(str(GameManager.active_character.get("id", "")))
	var res: Dictionary = await refresh_mission_status("", true)
	if not res.get("success", false):
		active_mission = {}
		active_mission_missing = false
		active_mission_changed.emit(active_mission)
		return {
			"ok": false,
			"error": str(res.get("error", "mission_status failed")),
			"data": {},
		}

	_apply_nakama_active_to_local()
	return {"ok": true, "data": active_mission, "nakama": nakama_active}


func resume_or_hub() -> void:
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
	if status in ["claimed", "failed", "complete", "completed"]:
		return true
	return seconds_remaining(m) <= 0


func effective_end_unix(mission: Dictionary = {}) -> int:
	var m: Dictionary = mission if not mission.is_empty() else active_mission
	var status := str(m.get("status", ""))
	var mission_end := str(m.get("completes_at", m.get("end_time", "")))
	var char_end := str(GameManager.active_character.get("mission_end_time", ""))
	var iso := ""
	if status == "completed" or status == "complete":
		iso = mission_end if not mission_end.is_empty() else char_end
	else:
		iso = mission_end if not mission_end.is_empty() else char_end
	return _parse_iso_unix(iso)


func seconds_remaining(mission: Dictionary = {}) -> int:
	var m: Dictionary = mission if not mission.is_empty() else active_mission
	if m.is_empty():
		return 0
	var status := str(m.get("status", ""))
	if status in ["claimed", "failed", "complete", "completed"]:
		return 0
	# Prefer server-reported remaining when present on nakama_active.
	if mission.is_empty() and nakama_active.has("seconds_remaining"):
		return maxi(0, int(nakama_active.get("seconds_remaining", 0)))
	var end_unix := effective_end_unix(m)
	if end_unix <= 0:
		return 1 if status == "in_progress" or status == "active" else 0
	return maxi(0, int(ceil(float(end_unix) - Time.get_unix_time_from_system())))


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
	var unix := int(Time.get_unix_time_from_datetime_string(s))
	return maxi(0, unix)


func current_mission_id() -> String:
	var mission_raw: Variant = nakama_active.get("mission", {})
	if typeof(mission_raw) == TYPE_DICTIONARY:
		var nid := str((mission_raw as Dictionary).get("mission_id", ""))
		if not nid.is_empty():
			return nid
	return str(active_mission.get("mission_id", active_mission.get("id", "")))


## Skip waits for rewards phase — must not charge crystals or call Node SkipMission.
func skip_mission() -> Dictionary:
	return {
		"ok": false,
		"error": "Mission skip is deferred until the rewards phase",
		"data": {},
	}


## No reward grants. Clears local active state when Nakama reports complete so the
## player can return to the Cantina. Server complete row is cleared on next start.
func claim_mission(_won: bool = true) -> Dictionary:
	await refresh_mission_status("", true)
	var status := _nakama_mission_status()
	if status == "active" and not is_mission_finished():
		return {"ok": false, "error": "Mission not finished yet", "data": {}}

	last_claim_result = {
		"gains": {},
		"rewards_deferred": true,
		"message": "Mission complete — rewards deferred to a later phase",
	}
	active_mission = {}
	active_mission_missing = false
	nakama_active = {}
	pending_enemy = {}
	pending_battle = {}
	pending_player_items = []
	active_mission_changed.emit(active_mission)
	claim_ready.emit(last_claim_result)
	await ensure_board(false)
	return {"ok": true, "error": "", "data": last_claim_result}


func prepare_combat(_refresh: bool = true) -> Dictionary:
	return {
		"ok": false,
		"error": "Mission combat/rewards are deferred — mission core only",
	}


func resolve_combat_outcome() -> Dictionary:
	return await claim_mission(true)


## Nakama mission session: in-flight or complete-awaiting-dismiss (not Node pointers).
func has_active_mission() -> bool:
	var s := _nakama_mission_status()
	if s == "active" or s == "complete":
		return true
	var local_status := str(active_mission.get("status", ""))
	return local_status in ["active", "in_progress", "complete", "completed"]


# ---------------------------------------------------------------------------
# Nakama RPCs
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
	_apply_nakama_active_to_local()
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
	_apply_nakama_active_to_local()
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
	offers = []
	active_mission = {}
	active_mission_missing = false


func _ensure_profile_character(character_id: String) -> void:
	if character_id.is_empty() or ProfileManager == null:
		return
	var selected := str(ProfileManager.profile.get("selected_character_id", ""))
	if selected == character_id:
		return
	await ProfileManager.set_selected_character_id(character_id)


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
	elif (data as Dictionary).has("active") and (data as Dictionary).get("active") == null:
		nakama_active = {}

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


func _nakama_mission_status() -> String:
	var mission_raw: Variant = nakama_active.get("mission", null)
	if typeof(mission_raw) != TYPE_DICTIONARY:
		return ""
	return str((mission_raw as Dictionary).get("status", ""))


func _offers_from_nakama_board(board: Dictionary) -> Array:
	var out: Array = []
	var missions: Variant = board.get("missions", [])
	if typeof(missions) != TYPE_ARRAY:
		return out
	for row in missions:
		if typeof(row) == TYPE_DICTIONARY:
			out.append(_ui_offer_from_nakama(row))
	return out


## Map Nakama mission schema → Cantina offer shape (display only).
func _ui_offer_from_nakama(m: Dictionary) -> Dictionary:
	var meta: Dictionary = {}
	var meta_raw: Variant = m.get("metadata", {})
	if typeof(meta_raw) == TYPE_DICTIONARY:
		meta = meta_raw
	var patron: Dictionary = {}
	var patron_raw: Variant = meta.get("patron", {})
	if typeof(patron_raw) == TYPE_DICTIONARY:
		patron = patron_raw
	var reward_ref: Dictionary = {}
	var rr: Variant = m.get("reward_reference", {})
	if typeof(rr) == TYPE_DICTIONARY:
		reward_ref = rr
	var title := str(m.get("title", m.get("name", "Contract")))
	var mission_id := str(m.get("mission_id", ""))
	return {
		"id": mission_id,
		"mission_id": mission_id,
		"name": title,
		"title": title,
		"description": str(m.get("description", "")),
		"location": str(m.get("location", "")),
		"sector": int(m.get("sector", 1)),
		"level_requirement": int(m.get("level_requirement", 1)),
		"duration_seconds": int(m.get("duration_seconds", 15)),
		"difficulty": str(m.get("difficulty", "")),
		"risk": int(m.get("risk", 0)),
		"status": str(m.get("status", "available")),
		"patron": patron,
		"explore_scene": int(meta.get("explore_scene", 0)),
		"stardust_efficiency": float(reward_ref.get("stardust_efficiency", 1.0)),
		"xp_efficiency": float(reward_ref.get("xp_efficiency", 1.0)),
		"rewards": {},
		"reward_reference": reward_ref,
	}


func _ui_active_from_nakama(wrapper: Dictionary) -> Dictionary:
	var mission_raw: Variant = wrapper.get("mission", null)
	if typeof(mission_raw) != TYPE_DICTIONARY:
		return {}
	var m: Dictionary = mission_raw
	var offer := _ui_offer_from_nakama(m)
	offer["status"] = str(m.get("status", "active"))
	offer["end_time"] = str(m.get("completes_at", ""))
	offer["completes_at"] = str(m.get("completes_at", ""))
	offer["started_at"] = str(m.get("started_at", ""))
	offer["start_time"] = str(m.get("started_at", ""))
	offer["duration_seconds"] = int(m.get("duration_seconds", offer.get("duration_seconds", 15)))
	return offer


func _apply_nakama_active_to_local() -> void:
	if nakama_active.is_empty() or typeof(nakama_active.get("mission", null)) != TYPE_DICTIONARY:
		if str(active_mission.get("status", "")) in ["active", "in_progress", "complete", "completed"]:
			# Keep local only if still matching; otherwise clear.
			if not bool(nakama_active.get("has_active", false)) and nakama_active.get("mission") == null:
				active_mission = {}
				active_mission_missing = false
				active_mission_changed.emit(active_mission)
		return
	active_mission = _ui_active_from_nakama(nakama_active)
	active_mission_missing = false
	active_mission_changed.emit(active_mission)


func _restore_active_mission_from_nakama() -> void:
	await fetch_active_mission()


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


## Non-authoritative display cache only — never used to invent missions.
func _load_board_cache(character_id: String) -> Array:
	var cfg := ConfigFile.new()
	if cfg.load(BOARD_CFG) != OK:
		return []
	var raw: Variant = cfg.get_value(character_id, "offers", [])
	return raw if typeof(raw) == TYPE_ARRAY else []


func _save_board_cache(character_id: String, board: Array) -> void:
	var cfg := ConfigFile.new()
	cfg.load(BOARD_CFG)
	cfg.set_value(character_id, "offers", board)
	cfg.set_value(character_id, "cache_source", "nakama")
	cfg.set_value(character_id, "cached_at", Time.get_unix_time_from_system())
	cfg.save(BOARD_CFG)


func _clear_board_cache(character_id: String) -> void:
	if character_id.is_empty():
		return
	var cfg := ConfigFile.new()
	cfg.load(BOARD_CFG)
	cfg.set_value(character_id, "offers", [])
	cfg.save(BOARD_CFG)
