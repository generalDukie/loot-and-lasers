extends Node
## Mission lifecycle — Node gameplay authority.
## The cantina board is a client-side preview matching the web client. Node validates
## launch, owns mission state/timers, and atomically grants XP, Stardust, and loot.

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
signal mission_claim_started
signal mission_claimed(result: Dictionary)
signal mission_claim_failed(error: String)
signal reward_received(reward: Dictionary)

const BOARD_CFG := "user://godot_mission_board.cfg"
## Bump when board shape changes (e.g. explore art no longer slot-tied).
const BOARD_CACHE_VERSION := 2
const STATUS_MIN_INTERVAL_SEC := 2.0
## Skip Character GET on rapid page hops when GameManager already has this character.
const CHARACTER_REFRESH_TTL_MS := 20000

var offers: Array = []
var active_mission: Dictionary = {}
var _character_refresh_ms := 0
var _character_refresh_id := ""
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
var _nakama_op := 0
var _last_status_at := 0.0
var _fuel_buy_busy := false
var _pending_fuel_request_id := ""


func _ready() -> void:
	print("[MissionManager] ready (Node mission authority)")


func _await_nakama_idle(timeout_sec: float = 12.0) -> bool:
	var start_ms := Time.get_ticks_msec()
	while _nakama_busy:
		if Time.get_ticks_msec() - start_ms >= int(timeout_sec * 1000.0):
			return false
		await get_tree().process_frame
	return true


## Acquire exclusive Nakama mission RPC slot. Returns op id (>0) or 0 on timeout.
func _acquire_nakama(timeout_sec: float = 12.0) -> int:
	if not await _await_nakama_idle(timeout_sec):
		return 0
	_nakama_op += 1
	_nakama_busy = true
	_set_loading(true)
	return _nakama_op


func _release_nakama(op: int) -> void:
	if op > 0 and op == _nakama_op:
		_nakama_busy = false
		_set_loading(false)


func sync_fuel() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("SyncFuelCycle", {})
	_apply_character_payload(res)
	return res


func buy_fuel() -> Dictionary:
	if _fuel_buy_busy:
		return {"ok": false, "error": "Fuel purchase already in progress", "data": {}}
	_fuel_buy_busy = true
	if _pending_fuel_request_id.is_empty():
		_pending_fuel_request_id = "fuel-%s-%d-%d" % [
			str(GameManager.active_character.get("id", "")).substr(0, 8),
			int(Time.get_unix_time_from_system()),
			randi() % 100000,
		]
	var res: Dictionary = await GameApiClient.invoke("BuyFuel", {
		"request_id": _pending_fuel_request_id,
	})
	_apply_character_payload(res)
	_fuel_buy_busy = false
	# Keep an ambiguous network request id so a retry replays instead of charging twice.
	if bool(res.get("ok", false)) or int(res.get("status", 0)) > 0:
		_pending_fuel_request_id = ""
	return res


func refresh_character(force: bool = false) -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return {"ok": false, "error": "No active character", "data": {}}
	var now := Time.get_ticks_msec()
	if (
		not force
		and cid == _character_refresh_id
		and now - _character_refresh_ms < CHARACTER_REFRESH_TTL_MS
		and not GameManager.active_character.is_empty()
	):
		return {"ok": true, "error": "", "data": GameManager.active_character, "cached": true}
	var res: Dictionary = await AuthManager.get_character(cid)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		GameManager.apply_active_character(res.data, "mission_refresh")
		character_updated.emit(res.data)
		_character_refresh_ms = Time.get_ticks_msec()
		_character_refresh_id = cid
		await _restore_active_mission_from_node()
	return res


func invalidate_character_cache() -> void:
	_character_refresh_ms = 0
	_character_refresh_id = ""


## The board is display-only, matching the web client. Node snapshots and validates
## all authoritative costs/rewards when LaunchMission is called.
func ensure_board(force_reroll: bool = false) -> Array:
	var character: Dictionary = GameManager.active_character
	var cid := str(character.get("id", ""))
	if cid.is_empty():
		offers = []
		board_changed.emit(offers)
		return offers

	if not force_reroll:
		var cached := _load_board_cache(cid)
		if not cached.is_empty():
			offers = cached
			board_changed.emit(offers)
			return offers

	offers = MissionBoard.build_board(character)
	_save_board_cache(cid, offers)
	board_changed.emit(offers)
	return offers


func reroll_board() -> Array:
	return await ensure_board(true)


## Node snapshots the mission, reward definition, loot roll, timer, and Fuel debit.
func launch_offer(offer: Dictionary) -> Dictionary:
	var template := offer.duplicate(true)
	var res: Dictionary = await GameApiClient.invoke("LaunchMission", {"template": template})
	if not res.ok:
		mission_error.emit(str(res.get("error", "Launch failed")))
		return res
	_apply_character_payload(res)
	if typeof(res.data) == TYPE_DICTIONARY and typeof(res.data.get("mission", {})) == TYPE_DICTIONARY:
		active_mission = res.data["mission"]
		active_mission_missing = false
		active_mission_changed.emit(active_mission)
	_clear_board_cache(str(GameManager.active_character.get("id", "")))
	offers = []
	board_changed.emit(offers)
	return res


## Restore the Node-owned mission selected by Character.active_mission_id.
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
		if status in ["claimed", "failed"]:
			active_mission_missing = true
			active_mission = {
				"id": mid,
				"name": str(row.get("name", "Resolved Mission")),
				"end_time": "",
				"status": status,
			}
		else:
			active_mission_missing = false
			active_mission = row
			if str(active_mission.get("end_time", "")).is_empty():
				var fallback := str(GameManager.active_character.get("mission_end_time", ""))
				if not fallback.is_empty():
					active_mission["end_time"] = fallback
			if status == "completed":
				var end_now := str(GameManager.active_character.get("mission_end_time", ""))
				if not end_now.is_empty():
					active_mission["end_time"] = end_now
	elif res.ok:
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
	if status in ["claimed", "failed", "complete", "completed", "reward_pending", "reward_failed"]:
		return true
	return seconds_remaining(m) <= 0


func effective_end_unix(mission: Dictionary = {}) -> int:
	var m: Dictionary = mission if not mission.is_empty() else active_mission
	var status := str(m.get("status", ""))
	# Prefer server unix when present (avoids ISO parse quirks).
	var unix_raw = m.get("completes_at_unix", null)
	if unix_raw != null:
		var u := int(unix_raw)
		if u > 0:
			return u
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
	if status in ["claimed", "failed", "complete", "completed", "reward_pending", "reward_failed"]:
		return 0
	# Countdown from completes_at on the client clock so the UI ticks every second.
	# Server seconds_remaining is a poll snapshot (STATUS_MIN_INTERVAL) — do not freeze the display on it.
	var end_unix := effective_end_unix(m)
	if end_unix > 0:
		return maxi(0, int(ceil(float(end_unix) - Time.get_unix_time_from_system())))
	if mission.is_empty() and nakama_active.has("seconds_remaining"):
		return maxi(0, int(nakama_active.get("seconds_remaining", 0)))
	return 1 if status == "in_progress" or status == "active" else 0


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
	var authoritative := str(GameManager.active_character.get("active_mission_id", ""))
	if not authoritative.is_empty():
		return authoritative
	return str(active_mission.get("id", ""))


## Node atomically debits Nova and completes the authoritative Mission row.
func skip_mission() -> Dictionary:
	var mid := current_mission_id()
	if mid.is_empty():
		return {"ok": false, "error": "No active mission to skip", "data": {}}
	var res: Dictionary = await GameApiClient.invoke("SkipMission", {"mission_id": mid})
	_apply_character_payload(res)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var mission_raw: Variant = res.data.get("mission", null)
		if typeof(mission_raw) == TYPE_DICTIONARY and not (mission_raw as Dictionary).is_empty():
			active_mission = (mission_raw as Dictionary).duplicate(true)
			active_mission["status"] = "completed"
			var end_now := str(GameManager.active_character.get("mission_end_time", ""))
			if not end_now.is_empty():
				active_mission["end_time"] = end_now
			active_mission_missing = bool(res.data.get("mission_missing", false))
			active_mission_changed.emit(active_mission)
	elif not res.ok:
		mission_error.emit(str(res.get("error", "Mission skip failed")))
	return res


## Claim/fail through Node's atomic reward pipeline. ClaimMission owns XP, level,
## Stardust, inventory capacity, pending loot, achievements, and idempotent replay.
func claim_mission(won: bool = true) -> Dictionary:
	return await _claim_node_mission(won, "")


func claim_mission_for(character_id: String = "", mission_id: String = "") -> Dictionary:
	# Compatibility wrapper for callers that pass explicit ids. Ownership remains
	# bound to the authenticated Node account; character_id is never trusted.
	var _unused_character_id := character_id
	return await _claim_node_mission(true, mission_id)


func _claim_node_mission(won: bool, mission_id: String) -> Dictionary:
	var mid := mission_id.strip_edges()
	if mid.is_empty():
		mid = current_mission_id()
	if mid.is_empty():
		return {"ok": false, "error": "No active mission", "data": {}}
	mission_claim_started.emit()
	var res: Dictionary
	# Node ignores client won — combat_result is authoritative (Restoration 08/11).
	if won:
		res = await GameApiClient.invoke("ClaimMission", {
			"mission_id": mid,
			"idempotencyKey": "mission:%s" % mid,
		})
	else:
		res = await GameApiClient.invoke("FailMission", {
			"mission_id": mid,
			"idempotencyKey": "mission:%s" % mid,
		})
		if not res.ok:
			res = await GameApiClient.invoke("ClaimMission", {
				"mission_id": mid,
				"idempotencyKey": "mission:%s" % mid,
			})
	if not res.ok:
		var err := str(res.get("error", "Mission claim failed"))
		mission_error.emit(err)
		mission_claim_failed.emit(err)
		return res

	var mission_snapshot := active_mission.duplicate(true)
	_apply_character_payload(res)
	last_claim_result = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	# Presentation follows Node combat/reward authority — not the caller hint.
	var settled_won := bool(last_claim_result.get("won", won))
	if settled_won and not bool(last_claim_result.get("mission_missing", false)):
		GameManager.remember_loot_from_claim(last_claim_result)
	else:
		GameManager.recent_loot_ids = PackedStringArray()
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(str(GameManager.active_character.get("id", "")))

	active_mission = {}
	active_mission_missing = false
	nakama_active = {}
	pending_enemy = {}
	pending_battle = {}
	pending_player_items = []
	active_mission_changed.emit(active_mission)
	claim_ready.emit(last_claim_result)
	mission_claimed.emit(last_claim_result)
	reward_received.emit(last_claim_result)
	if settled_won and not bool(last_claim_result.get("mission_missing", false)):
		var gains: Dictionary = last_claim_result.get("gains", {}) if typeof(last_claim_result.get("gains", {})) == TYPE_DICTIONARY else {}
		await SocialManager.contribute_mission(mission_snapshot, gains)
	await ensure_board(true)
	return res


## Soft end-of-mission encounter — Node simulates + commits; Godot plays events only.
## Call after the mission timer is finished (or after a successful skip).
func prepare_combat(_refresh: bool = true) -> Dictionary:
	if not is_mission_finished():
		if _refresh:
			await refresh_mission_status("", true)
		if not is_mission_finished():
			return {"ok": false, "error": "Mission not finished yet — wait or skip first", "data": {}}

	var ch: Dictionary = GameManager.active_character
	if ch.is_empty():
		return {"ok": false, "error": "No active character", "data": {}}

	var mid := str(active_mission.get("id", ch.get("active_mission_id", "")))
	if mid.is_empty():
		return {"ok": false, "error": "No active mission", "data": {}}

	var res: Dictionary = await GameApiClient.invoke("PrepareMissionCombat", {"mission_id": mid})
	if not res.ok:
		return {"ok": false, "error": str(res.get("error", "PrepareMissionCombat failed")), "data": {}}

	var payload: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	pending_enemy = payload.get("enemy", {}) if typeof(payload.get("enemy", {})) == TYPE_DICTIONARY else {}
	var battle: Dictionary = payload.get("battle", {}) if typeof(payload.get("battle", {})) == TYPE_DICTIONARY else {}
	if battle.is_empty() and typeof(payload.get("events", null)) == TYPE_ARRAY:
		battle = {
			"winner": payload.get("winner", ""),
			"events": payload.get("events", []),
			"playerMaxHp": payload.get("playerMaxHp", 0),
			"opponentMaxHp": payload.get("opponentMaxHp", 0),
			"initiativeFirstSide": payload.get("opening_side", ""),
			"playerEnd": payload.get("playerEnd", {}),
			"opponentEnd": payload.get("opponentEnd", {}),
		}
	pending_battle = battle
	pending_player_items = []
	return {
		"ok": true,
		"error": "",
		"data": {"enemy": pending_enemy, "battle": pending_battle, "combat_id": payload.get("combat_id", "")},
	}


func resolve_combat_outcome() -> Dictionary:
	if pending_battle.is_empty():
		return {"ok": false, "error": "No pending battle", "data": {}}
	# Winner comes from committed Node combat — never re-simulate locally.
	var won := str(pending_battle.get("winner", "")) == "player"
	return await claim_mission(won)


func _load_equipped_items() -> Array:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return []
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Item/filter",
		{"query": {"character_id": cid, "is_equipped": true}, "limit": 20}, true
	)
	return res.data if res.ok and typeof(res.data) == TYPE_ARRAY else []


## Character.active_mission_id is the single authoritative active pointer.
func has_active_mission() -> bool:
	return not str(GameManager.active_character.get("active_mission_id", "")).is_empty()


# ---------------------------------------------------------------------------
# Legacy Nakama mission RPCs — hard-disabled (Node LaunchMission/ClaimMission)
# ---------------------------------------------------------------------------

func load_missions(_character_id: String = "") -> Dictionary:
	return _fail_nakama("Nakama missions_get disabled — use Node Cantina / LaunchMission", 410)


func refresh_missions(_character_id: String = "") -> Dictionary:
	return _fail_nakama("Nakama missions_refresh disabled — use Node mission offers", 410)


func start_mission(_mission_id: String, _character_id: String = "") -> Dictionary:
	return _fail_nakama("Nakama mission_start disabled — use MissionManager.launch_offer", 410)


func get_active_mission(character_id: String = "") -> Dictionary:
	return await refresh_mission_status(character_id)


func refresh_mission_status(character_id: String = "", force: bool = false) -> Dictionary:
	var now := Time.get_ticks_msec() / 1000.0
	if not force and (now - _last_status_at) < STATUS_MIN_INTERVAL_SEC and not active_mission.is_empty():
		return {
			"ok": true,
			"success": true,
			"error": "",
			"data": active_mission,
			"status_code": 200,
			"cached": true,
		}
	var _unused_character_id := character_id
	var res: Dictionary = await fetch_active_mission()
	_last_status_at = Time.get_ticks_msec() / 1000.0
	if not res.ok:
		var err := str(res.get("error", "mission_status failed"))
		mission_error.emit(err)
		return res
	mission_status_changed.emit(active_mission)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": active_mission,
		"status_code": int(res.get("status", 200)),
	}


func clear_nakama_mission_local() -> void:
	nakama_board = {}
	nakama_active = {}
	offers = []
	active_mission = {}
	active_mission_missing = false


func _ensure_profile_character(character_id: String) -> Dictionary:
	if character_id.is_empty():
		return {"success": false, "error": "character_id required"}
	if ProfileManager == null:
		return {"success": true, "error": ""}
	var selected := str(ProfileManager.profile.get("selected_character_id", ""))
	if selected == character_id:
		return {"success": true, "error": ""}
	var res: Dictionary = await ProfileManager.set_selected_character_id(character_id)
	if res.get("success", false) or res.get("ok", false):
		return {"success": true, "error": ""}
	return {
		"success": false,
		"error": "Selected character sync failed — %s" % str(res.get("error", "unknown")),
	}


func _nakama_board_rpc(rpc_id: String, _character_id: String, _is_refresh: bool) -> Dictionary:
	return _fail_nakama(
		"Nakama %s disabled — Node owns mission board/lifecycle" % rpc_id,
		410
	)


func _nakama_character_payload(character_id: String = "") -> Dictionary:
	var cid := character_id.strip_edges()
	if cid.is_empty() and GameManager != null:
		cid = GameManager.selected_character_id()
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
		"explore_scene": int(meta.get("explore_scene", -1)),
		"image_id": str(meta.get("image_id", "")),
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
	offer["completes_at_unix"] = int(m.get("completes_at_unix", 0))
	offer["started_at"] = str(m.get("started_at", ""))
	offer["start_time"] = str(m.get("started_at", ""))
	offer["duration_seconds"] = int(m.get("duration_seconds", offer.get("duration_seconds", 15)))
	return offer


func _apply_nakama_active_to_local() -> void:
	if nakama_active.is_empty() or typeof(nakama_active.get("mission", null)) != TYPE_DICTIONARY:
		if str(active_mission.get("status", "")) in ["active", "in_progress", "complete", "completed", "reward_pending", "reward_failed"]:
			# Keep local only if still matching; otherwise clear.
			if not bool(nakama_active.get("has_active", false)) and nakama_active.get("mission") == null:
				active_mission = {}
				active_mission_missing = false
				active_mission_changed.emit(active_mission)
		return
	var status := str((nakama_active.get("mission") as Dictionary).get("status", ""))
	# Claimed missions remain server-side for idempotent replay but do not block Cantina.
	if status == "claimed":
		active_mission = {}
		active_mission_missing = false
		active_mission_changed.emit(active_mission)
		return
	active_mission = _ui_active_from_nakama(nakama_active)
	active_mission_missing = false
	active_mission_changed.emit(active_mission)


func _restore_active_mission_from_node() -> void:
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
	var applied: Dictionary = GameApiClient.apply_authoritative_response(res.data, "mission_node_action")
	if bool(applied.get("character_applied", false)) \
		or bool(applied.get("patch_applied", false)) \
		or bool(applied.get("wallet_applied", false)):
		_character_refresh_ms = Time.get_ticks_msec()
		_character_refresh_id = str(GameManager.active_character.get("id", ""))
		character_updated.emit(GameManager.active_character)


func _apply_wallet_from_data(data: Variant, source: String) -> bool:
	var applied: Dictionary = GameApiClient.apply_authoritative_response(data, source)
	if bool(applied.get("wallet_applied", false)):
		character_updated.emit(GameManager.active_character)
		return true
	return false


## Non-authoritative display cache only — never used to invent missions.
func _load_board_cache(character_id: String) -> Array:
	var cfg := ConfigFile.new()
	if cfg.load(BOARD_CFG) != OK:
		return []
	if int(cfg.get_value(character_id, "board_version", 0)) != BOARD_CACHE_VERSION:
		return []
	var raw: Variant = cfg.get_value(character_id, "offers", [])
	if typeof(raw) != TYPE_ARRAY:
		return []
	# Reject legacy slot-tied boards missing per-mission art.
	for row in raw:
		if typeof(row) != TYPE_DICTIONARY:
			return []
		if not (row as Dictionary).has("explore_scene"):
			return []
	return raw


func _save_board_cache(character_id: String, board: Array) -> void:
	var cfg := ConfigFile.new()
	cfg.load(BOARD_CFG)
	cfg.set_value(character_id, "offers", board)
	cfg.set_value(character_id, "board_version", BOARD_CACHE_VERSION)
	cfg.set_value(character_id, "cache_source", "local_board")
	cfg.set_value(character_id, "cached_at", Time.get_unix_time_from_system())
	cfg.save(BOARD_CFG)


func _clear_board_cache(character_id: String) -> void:
	if character_id.is_empty():
		return
	var cfg := ConfigFile.new()
	cfg.load(BOARD_CFG)
	cfg.set_value(character_id, "offers", [])
	cfg.save(BOARD_CFG)
