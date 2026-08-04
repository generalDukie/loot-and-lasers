extends Node
## Mission lifecycle — Nakama mission authority with Node Character wallet bridge.
## Board / start / timer / claim: Nakama RPCs; required Fuel/Nova and Stardust
## rewards are applied server-to-server to the normalized Character wallet.
## Fuel buy/sync remain direct Node economy actions. XP grants remain deferred.

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
var _nakama_op := 0
var _last_status_at := 0.0
var _fuel_buy_busy := false
var _pending_fuel_request_id := ""


func _ready() -> void:
	print("[MissionManager] ready (Nakama mission authority)")


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


func refresh_character() -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return {"ok": false, "error": "No active character", "data": {}}
	var res: Dictionary = await AuthManager.get_character(cid)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		GameManager.apply_active_character(res.data, "mission_refresh")
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
		mission_error.emit("No active character for mission board")
		return offers

	var synced: Dictionary = await _ensure_profile_character(cid)
	if not synced.get("success", false):
		offers = []
		board_changed.emit(offers)
		mission_error.emit(str(synced.get("error", "Could not sync selected character")))
		return offers

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
			mission_error.emit(str(res.get("error", "Nakama board unavailable")))
		return offers

	offers = _offers_from_nakama_board(nakama_board)
	# Always keep 3 selectable contracts. Launch removes a slot server-side; top-up
	# happens in Nakama ensure_board when deployed. Fall back to a forced refresh once.
	if offers.size() < 3 and not force_reroll and not has_active_mission():
		var refill: Dictionary = await refresh_missions(cid)
		if refill.get("success", false):
			offers = _offers_from_nakama_board(nakama_board)
		elif offers.size() < 3:
			mission_error.emit("Board underfilled (%d/3) — try again shortly" % offers.size())
	_save_board_cache(cid, offers)
	board_changed.emit(offers)
	_apply_nakama_active_to_local()
	return offers


func reroll_board() -> Array:
	return await ensure_board(true)


## Start via Nakama `mission_start`; the server bridges the authoritative Fuel debit.
func launch_offer(offer: Dictionary) -> Dictionary:
	var mission_id := str(offer.get("mission_id", offer.get("id", ""))).strip_edges()
	if mission_id.is_empty():
		return {"ok": false, "error": "mission_id is required", "data": {}}

	var cid := str(GameManager.active_character.get("id", ""))
	var synced: Dictionary = await _ensure_profile_character(cid)
	if not synced.get("success", false):
		return {
			"ok": false,
			"error": str(synced.get("error", "Could not sync selected character")),
			"data": {},
		}

	var res: Dictionary = await start_mission(mission_id)
	if not res.get("success", false):
		return {
			"ok": false,
			"error": str(res.get("error", "Launch failed")),
			"data": res.get("data", {}),
			"status_code": int(res.get("status_code", 0)),
		}

	_apply_nakama_active_to_local()
	_apply_wallet_from_data(res.get("data", {}), "mission_start")
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
	var synced: Dictionary = await _ensure_profile_character(str(GameManager.active_character.get("id", "")))
	if not synced.get("success", false):
		active_mission = {}
		active_mission_missing = false
		return {"ok": false, "error": str(synced.get("error", "profile sync failed")), "data": {}}
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
	var mission_raw: Variant = nakama_active.get("mission", {})
	if typeof(mission_raw) == TYPE_DICTIONARY:
		var nid := str((mission_raw as Dictionary).get("mission_id", ""))
		if not nid.is_empty():
			return nid
	return str(active_mission.get("mission_id", active_mission.get("id", "")))


## Skip remaining wait via Nakama `mission_skip`; the server bridges the Nova debit
## and compensates it if the mission state write fails.
func skip_mission() -> Dictionary:
	var mid := current_mission_id()
	if mid.is_empty():
		return {"ok": false, "error": "No active mission to skip", "data": {}}

	var expected_cost := 0
	var rem := seconds_remaining()
	if rem > 0:
		expected_cost = maxi(1, int(ceil((float(rem) / 60.0) * 5.0)))
	if expected_cost > 0:
		if CurrencyManager != null and not CurrencyManager.can_afford(CurrencyManager.CURRENCY_NOVA, expected_cost):
			return {"ok": false, "error": "Not enough Nova Crystals", "data": {}}

	var op := await _acquire_nakama()
	if op == 0:
		return _fail_nakama("Mission request busy — try again")
	var payload := _nakama_character_payload("")
	payload["mission_id"] = mid
	payload["request_id"] = "skip-%s-%d" % [
		mid.substr(0, mini(8, mid.length())),
		int(Time.get_unix_time_from_system()),
	]
	var res: Dictionary = await NakamaManager.invoke_rpc("mission_skip", payload)
	_release_nakama(op)

	if not bool(res.get("success", false)):
		var err := str(res.get("error", "Mission skip failed"))
		mission_error.emit(err)
		return {"ok": false, "error": err, "data": {}}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		return {"ok": false, "error": "Malformed skip response", "data": {}}

	var skip_data: Dictionary = data
	var bridge_wallet_applied := _apply_wallet_from_data(skip_data, "mission_skip")
	if typeof(skip_data.get("active", null)) == TYPE_DICTIONARY:
		nakama_active = (skip_data.get("active") as Dictionary).duplicate(true)
		# Ensure has_active so local finish checks stay consistent.
		nakama_active["has_active"] = true
	elif typeof(skip_data.get("mission", null)) == TYPE_DICTIONARY:
		nakama_active = {"mission": skip_data.get("mission"), "has_active": true, "is_complete": true}
	_apply_nakama_active_to_local()
	# Force local finished state even if envelope shape drifts.
	if typeof(nakama_active.get("mission", null)) == TYPE_DICTIONARY:
		(nakama_active["mission"] as Dictionary)["status"] = "complete"
		active_mission["status"] = "complete"
		active_mission["completes_at_unix"] = int(Time.get_unix_time_from_system())
	mission_status_changed.emit(nakama_active)

	var already_done := bool(skip_data.get("already_complete", false)) or bool(skip_data.get("replay", false))
	var charge := int(skip_data.get("skip_cost", expected_cost))
	if charge < 0:
		charge = 0
	if already_done:
		charge = 0

	if charge > 0 and not bridge_wallet_applied:
		var debit: Dictionary = await GameApiClient.invoke("DebitNovaCrystals", {
			"amount": charge,
			"purpose": "mission_skip",
			"mission_id": mid,
			"request_id": "mission_skip:%s" % mid,
		})
		if not bool(debit.get("ok", false)):
			var debit_err := str(debit.get("error", "Could not spend Nova Crystals"))
			if typeof(debit.get("data", null)) == TYPE_DICTIONARY and debit.data.has("error"):
				debit_err = str(debit.data["error"])
			print("[MissionManager] WARNING: skip completed but Nova debit failed — %s" % debit_err)
			skip_data["debit_warning"] = debit_err
		else:
			_apply_character_payload(debit)
			skip_data["nova_debited"] = charge
	elif charge > 0:
		skip_data["nova_debited"] = charge

	return {"ok": true, "error": "", "data": skip_data}


## Claim completed mission rewards via Nakama mission_claim (server-authoritative).
## Does not mutate wallet/inventory locally — refreshes managers from server result.
func claim_mission(_won: bool = true) -> Dictionary:
	return await claim_mission_for("", "")


func claim_mission_for(character_id: String = "", mission_id: String = "") -> Dictionary:
	var mid := mission_id.strip_edges()
	if mid.is_empty():
		var nakama_mission: Variant = nakama_active.get("mission", {})
		if typeof(nakama_mission) == TYPE_DICTIONARY:
			mid = str(nakama_mission.get("mission_id", ""))
		if mid.is_empty():
			mid = str(active_mission.get("mission_id", active_mission.get("id", "")))
	if mid.is_empty():
		return {"ok": false, "error": "mission_id is required", "data": {}}

	# Sync status unless we already know the mission is claimable (e.g. just skipped).
	if not is_mission_finished():
		var status_res: Dictionary = await refresh_mission_status(character_id, true)
		if not status_res.get("success", false):
			var status_err := str(status_res.get("error", "Could not refresh mission status"))
			mission_error.emit(status_err)
			return {"ok": false, "error": status_err, "data": {}}

	var status := _nakama_mission_status()
	if status == "active" and not is_mission_finished():
		return {"ok": false, "error": "Mission not finished yet", "data": {}}

	var op := await _acquire_nakama()
	if op == 0:
		return _fail_nakama("Mission request busy — try again")
	mission_claim_started.emit()
	var payload := _nakama_character_payload(character_id)
	payload["mission_id"] = mid
	payload["request_id"] = "claim-%s-%d" % [
		mid.substr(0, mini(8, mid.length())),
		int(Time.get_unix_time_from_system()),
	]
	var res: Dictionary = await NakamaManager.invoke_rpc("mission_claim", payload)
	_release_nakama(op)

	if not bool(res.get("success", false)):
		var err := str(res.get("error", "Mission claim failed"))
		mission_error.emit(err)
		mission_claim_failed.emit(err)
		return {"ok": false, "error": err, "data": {}}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		var bad := "Malformed claim response"
		mission_claim_failed.emit(bad)
		return {"ok": false, "error": bad, "data": {}}

	var claim_data: Dictionary = data
	_apply_wallet_from_data(claim_data, "mission_claim")
	var reward: Dictionary = {}
	if typeof(claim_data.get("reward", null)) == TYPE_DICTIONARY:
		reward = claim_data.get("reward")
	var gains: Dictionary = {}
	if typeof(claim_data.get("gains", null)) == TYPE_DICTIONARY:
		gains = claim_data.get("gains")
	else:
		var stardust := 0
		var currency: Variant = reward.get("currency", [])
		if typeof(currency) == TYPE_ARRAY:
			for row in currency:
				if typeof(row) == TYPE_DICTIONARY and str(row.get("currency_id", "")) == "stardust":
					stardust += int(row.get("amount", 0))
		gains = {
			"stardust": stardust,
			"experience": 0,
			"experience_status": "unsupported",
		}

	last_claim_result = {
		"gains": gains,
		"reward": reward,
		"items": reward.get("items", []) if typeof(reward.get("items", null)) == TYPE_ARRAY else [],
		"mission": claim_data.get("mission", {}),
		"rewards_deferred": false,
		"message": "",
		"replay": bool(claim_data.get("replay", false)),
	}

	if CurrencyManager != null and not claim_data.has("wallet") and CurrencyManager.has_method("load_wallet"):
		await CurrencyManager.load_wallet()
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(str(payload.get("character_id", "")))

	active_mission = {}
	active_mission_missing = false
	nakama_active = {}
	pending_enemy = {}
	pending_battle = {}
	pending_player_items = []
	active_mission_changed.emit(active_mission)
	claim_ready.emit(last_claim_result)
	mission_claimed.emit(last_claim_result)
	reward_received.emit(reward)
	await ensure_board(false)
	return {"ok": true, "error": "", "data": last_claim_result}


## Soft end-of-mission encounter (client-side), matching web generateMissionEncounter + simulateBattle.
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

	# Ensure nested stats exist for MissionCombat.build_fighter.
	var stats_src: Dictionary = StatsRules.raw_stats(ch)
	var fighter_char := ch.duplicate(true)
	fighter_char["stats"] = stats_src

	pending_enemy = MissionCombat.generate_encounter(fighter_char, active_mission)
	pending_player_items = await _load_equipped_items()
	pending_battle = MissionCombat.simulate_battle(
		fighter_char, pending_enemy, pending_player_items, []
	)
	return {
		"ok": true,
		"error": "",
		"data": {"enemy": pending_enemy, "battle": pending_battle},
	}


func resolve_combat_outcome() -> Dictionary:
	if pending_battle.is_empty():
		return {"ok": false, "error": "No pending battle", "data": {}}
	var won := str(pending_battle.get("winner", "")) == "player"
	if not won:
		# Soft fail: clear duel state. Mission stays complete so the player can fight again.
		pending_enemy = {}
		pending_battle = {}
		pending_player_items = []
		return {"ok": true, "error": "", "data": {"gains": {}, "items": [], "failed": true}}
	return await claim_mission(true)


func _load_equipped_items() -> Array:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return []
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Item/filter",
		{"query": {"character_id": cid, "is_equipped": true}, "limit": 20}, true
	)
	return res.data if res.ok and typeof(res.data) == TYPE_ARRAY else []


## Nakama mission session: in-flight or awaiting claim (claimed is cleared on next start).
func has_active_mission() -> bool:
	var s := _nakama_mission_status()
	if s in ["active", "complete", "reward_pending", "reward_failed"]:
		return true
	var local_status := str(active_mission.get("status", ""))
	return local_status in ["active", "in_progress", "complete", "completed", "reward_pending", "reward_failed"]


# ---------------------------------------------------------------------------
# Nakama RPCs
# ---------------------------------------------------------------------------

func load_missions(character_id: String = "") -> Dictionary:
	return await _nakama_board_rpc("missions_get", character_id, false)


func refresh_missions(character_id: String = "") -> Dictionary:
	return await _nakama_board_rpc("missions_refresh", character_id, true)


func start_mission(mission_id: String, character_id: String = "") -> Dictionary:
	if mission_id.strip_edges().is_empty():
		return _fail_nakama("mission_id is required")

	var op := await _acquire_nakama()
	if op == 0:
		return _fail_nakama("Mission request busy — try again")
	var payload := _nakama_character_payload(character_id)
	payload["mission_id"] = mission_id.strip_edges()
	var res: Dictionary = await NakamaManager.invoke_rpc("mission_start", payload)
	_release_nakama(op)

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

	var op := await _acquire_nakama()
	if op == 0:
		# Soft-fail for polls: keep last snapshot instead of hard erroring the UI.
		if not force and not nakama_active.is_empty():
			return {
				"ok": true,
				"success": true,
				"error": "",
				"data": nakama_active,
				"status_code": 200,
				"cached": true,
			}
		return _fail_nakama("Mission request busy — try again")
	var res: Dictionary = await NakamaManager.invoke_rpc("mission_status", _nakama_character_payload(character_id))
	_release_nakama(op)
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


func _nakama_board_rpc(rpc_id: String, character_id: String, is_refresh: bool) -> Dictionary:
	var op := await _acquire_nakama()
	if op == 0:
		return _fail_nakama("Mission request busy — try again")
	var payload := _nakama_character_payload(character_id)
	var ch: Dictionary = GameManager.active_character
	payload["level"] = int(ch.get("level", 1))
	payload["highest_sector"] = int(ch.get("highest_sector", 0))
	var res: Dictionary = await NakamaManager.invoke_rpc(rpc_id, payload)
	_release_nakama(op)

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
		GameManager.apply_active_character(ch, "mission_node_action")
		character_updated.emit(ch)
		return
	var patch: Variant = res.data.get("patch", null)
	if typeof(patch) == TYPE_DICTIONARY and not patch.is_empty():
		GameManager.apply_active_character_patch(patch, "mission_node_action")
		character_updated.emit(GameManager.active_character)


func _apply_wallet_from_data(data: Variant, source: String) -> bool:
	if CurrencyManager == null or typeof(data) != TYPE_DICTIONARY:
		return false
	var wallet_data: Variant = (data as Dictionary).get("wallet", null)
	if typeof(wallet_data) != TYPE_DICTIONARY:
		return false
	if CurrencyManager.apply_authoritative_wallet(wallet_data, source):
		character_updated.emit(GameManager.active_character)
	return true


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
