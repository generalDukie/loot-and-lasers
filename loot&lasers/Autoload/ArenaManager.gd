extends Node
## Arena lobby — Node gameplay authority (Restoration 16).
## Presentation only: hydrate state, submit offer_id, play committed combat.

signal arena_state_loaded(state: Dictionary)
signal opponents_loaded(opponents: Array)
signal rankings_loaded(rankings: Array)
signal challenge_started
signal battle_completed(result: Dictionary)
signal rating_changed(rating: int, delta: int)
signal history_loaded(history: Array)
signal arena_error(error: String)
signal loading_changed(loading: bool)
signal battle_state_changed(battling: bool)

var opponents: Array = []
var equipped_items: Array = []
var free_battles_left: int = ArenaRules.DAILY_FREE_BATTLES
var refresh_at_unix_ms: int = 0
var pending_opp: Dictionary = {}
var pending_battle: Dictionary = {}
var pending_rewards: Dictionary = {}
var pending_is_free: bool = true
var pending_skipped: bool = false
var pending_challenge_id := ""
var pending_policy_version := ""
var pending_combat_id := ""
var pending_offer_id := ""
var last_result: Dictionary = {}
var match_history: Array = []

var arena_state: Dictionary = {}
var loading := false
var battling := false
var _busy := false


func _ready() -> void:
	print("[ArenaManager] ready (Node arena authority)")


func clear_local() -> void:
	opponents = []
	equipped_items = []
	free_battles_left = ArenaRules.DAILY_FREE_BATTLES
	refresh_at_unix_ms = 0
	pending_opp = {}
	pending_battle = {}
	pending_rewards = {}
	pending_is_free = true
	pending_skipped = false
	pending_challenge_id = ""
	pending_policy_version = ""
	pending_combat_id = ""
	pending_offer_id = ""
	last_result = {}
	match_history = []
	arena_state = {}
	loading = false
	battling = false
	_busy = false


func is_loading() -> bool:
	return loading


func is_battling() -> bool:
	return battling


func get_rating() -> int:
	return int(arena_state.get("rating", GameManager.active_character.get("arena_rating", 1000)))


func get_rank() -> int:
	return int(arena_state.get("rank_position", arena_state.get("rank", 0)))


func get_opponents() -> Array:
	return opponents


func get_remaining_cooldown() -> int:
	return cooldown_remaining_ms()


func _set_loading(v: bool) -> void:
	loading = v
	loading_changed.emit(v)


func _set_battling(v: bool) -> void:
	battling = v
	battle_state_changed.emit(v)


func _fail(msg: String) -> Dictionary:
	arena_error.emit(msg)
	return {"ok": false, "error": msg, "data": {}}


func _payload(res: Dictionary) -> Dictionary:
	if typeof(res.get("data", null)) == TYPE_DICTIONARY:
		return res.data
	return res


func _apply_character(data: Dictionary) -> void:
	## Must go through GameApiClient → GameManager/CurrencyManager so the
	## operative console sees spends (Nova skip, paid battles, etc.) immediately.
	GameApiClient.apply_authoritative_response(data, "arena_node_action")


func _apply_arena_state(data: Dictionary) -> void:
	var a: Variant = data.get("arena", data)
	if typeof(a) != TYPE_DICTIONARY:
		return
	arena_state = (a as Dictionary).duplicate(true)
	if arena_state.has("attempts_remaining"):
		free_battles_left = int(arena_state["attempts_remaining"])
	elif arena_state.has("arena_attempts_left"):
		free_battles_left = int(arena_state["arena_attempts_left"])
	if typeof(GameManager.active_character) == TYPE_DICTIONARY and not GameManager.active_character.is_empty():
		GameManager.active_character["arena_rating"] = int(arena_state.get("rating", 1000))
		GameManager.active_character["arena_wins"] = int(arena_state.get("wins", 0))
		GameManager.active_character["arena_losses"] = int(arena_state.get("losses", 0))
		GameManager.active_character["arena_streak"] = int(arena_state.get("win_streak", 0))
		GameManager.active_character["arena_attempts_left"] = free_battles_left
		GameManager.active_character["arena_cooldown_at"] = str(arena_state.get("arena_cooldown_at", ""))


func load_arena_state(_character_id: String = "") -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("GetArenaStatus", {})
	_busy = false
	_set_loading(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "GetArenaStatus failed")))
	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	arena_state_loaded.emit(arena_state)
	return {"ok": true, "error": "", "data": data}


func sync_day() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("SyncArenaDay", {})
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "SyncArenaDay failed")))
	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	arena_state_loaded.emit(arena_state)
	return {"ok": true, "error": "", "data": data}


func refresh_character() -> Dictionary:
	return await load_arena_state()


func load_equipped() -> Array:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		equipped_items = []
		return equipped_items
	var res: Dictionary = await GameApiClient.request(
		"POST",
		"/api/entities/Item/filter",
		{"query": {"character_id": cid, "is_equipped": true}, "limit": 20},
		true
	)
	equipped_items = []
	if res.ok and typeof(res.data) == TYPE_ARRAY:
		for piece in res.data:
			if typeof(piece) == TYPE_DICTIONARY and not (piece as Dictionary).is_empty():
				equipped_items.append(piece)
	return equipped_items


func load_opponents(_character_id: String = "") -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("GetArenaOpponents", {})
	_busy = false
	_set_loading(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "GetArenaOpponents failed")))
	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	opponents = _map_opponent_cards(data.get("opponents", []))
	var expires := str(data.get("expires_at", ""))
	if not expires.is_empty():
		refresh_at_unix_ms = _parse_iso_unix(expires) * 1000
	opponents_loaded.emit(opponents)
	return {"ok": true, "error": "", "data": data, "opponents": opponents}


func build_opponent_pool() -> Array:
	var res: Dictionary = await load_opponents()
	if not res.get("ok", false):
		opponents = []
	return opponents


func refresh_opponents(charge: bool = false) -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("RefreshArenaOpponents", {"charge": charge})
	_busy = false
	_set_loading(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "RefreshArenaOpponents failed")))
	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	opponents = _map_opponent_cards(data.get("opponents", []))
	mark_refresh_used()
	opponents_loaded.emit(opponents)
	return {"ok": true, "error": "", "opponents": opponents}


func load_rankings(_character_id: String = "", _cursor: String = "", limit: int = 100, offset: int = 0) -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("GetArenaLeaderboard", {
		"limit": clampi(limit, 1, 100),
		"offset": maxi(0, offset),
	})
	_busy = false
	_set_loading(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "GetArenaLeaderboard failed")))
	var data := _payload(res)
	_apply_arena_state(data)
	var rows: Array = data.get("rankings", []) if typeof(data.get("rankings", [])) == TYPE_ARRAY else []
	rankings_loaded.emit(rows)
	return {"ok": true, "error": "", "data": data}


## Nearby window around the active character (server rank; not client-computed).
func load_nearby_rankings(radius: int = 5) -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("GetArenaLeaderboard", {
		"limit": 1,
		"offset": 0,
		"nearby": true,
		"nearby_radius": clampi(radius, 0, 25),
	})
	_busy = false
	_set_loading(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "GetArenaLeaderboard nearby failed")))
	var data := _payload(res)
	_apply_arena_state(data)
	return {"ok": true, "error": "", "data": data}


func load_history(_character_id: String = "", _cursor: String = "") -> Array:
	match_history = []
	history_loaded.emit(match_history)
	return match_history


func challenge_opponent(_character_id: String, opponent_character_id: String) -> Dictionary:
	return await start_direct_challenge(opponent_character_id)


func prepare_challenge(opp: Dictionary, skip_cooldown: bool = false) -> Dictionary:
	if _busy or battling:
		return _fail("Arena battle already in progress")
	if cooldown_active() and not skip_cooldown:
		return _fail("Battle cooldown active")

	var offer_id := str(opp.get("offer_id", ""))
	if offer_id.is_empty():
		return _fail("Missing opponent offer id")

	_set_battling(true)
	challenge_started.emit()
	var payload := {
		"offer_id": offer_id,
		"is_free": free_battles_left > 0,
		"skip_cooldown": skip_cooldown,
	}
	var res: Dictionary = await GameApiClient.invoke("PrepareArenaCombat", payload)
	if not bool(res.get("ok", false)):
		_set_battling(false)
		return _fail(str(res.get("error", "PrepareArenaCombat failed")))

	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	_ingest_prepare_result(opp, data)
	return {
		"ok": true,
		"opp": pending_opp,
		"battle": pending_battle,
		"rewards": pending_rewards,
		"is_free": pending_is_free,
		"skipped": pending_skipped,
	}


func start_direct_challenge(opponent_character_id: String) -> Dictionary:
	for o in opponents:
		if typeof(o) != TYPE_DICTIONARY:
			continue
		var oid := str(o.get("character_id", o.get("realCharacterId", "")))
		if oid == opponent_character_id and str(o.get("offer_id", "")) != "":
			return await prepare_challenge(o, false)
	return _fail("Opponent offer not found — refresh Arena")


func prepare_revenge(match: Dictionary) -> Dictionary:
	var oid := str(match.get("opponent_character_id", match.get("opponent_real_id", "")))
	if oid.is_empty():
		return _fail("Revenge opponent unavailable")
	return await start_direct_challenge(oid)


func finish_battle() -> Dictionary:
	if pending_combat_id.is_empty() and pending_offer_id.is_empty():
		if not last_result.is_empty():
			battle_completed.emit(last_result)
			_set_battling(false)
			return last_result
		return _fail("No pending Arena match")

	var body := {
		"combat_id": pending_combat_id,
		"offer_id": pending_offer_id,
		"is_free": pending_is_free,
		"skip_cooldown": pending_skipped,
	}
	var res: Dictionary = await GameApiClient.invoke("FinishArenaBattle", body)
	if not bool(res.get("ok", false)):
		_set_battling(false)
		return _fail(str(res.get("error", "FinishArenaBattle failed")))

	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	last_result = _normalize_battle_result(data)
	print(
		"[ArenaBattleResult] player=%s opp=%s winner=%s playerWon=%s outcome=%s ranking=%s rewards=%s"
		% [
			str(last_result.get("playerId", "")),
			str(last_result.get("opponentId", "")),
			str(last_result.get("winnerId", "")),
			str(last_result.get("playerWon", false)),
			str(last_result.get("outcome", "")),
			str(last_result.get("rankingChange", 0)),
			str(last_result.get("rewards", {})),
		]
	)
	var rewards_out: Dictionary = last_result.get("rewards", {}) if typeof(last_result.get("rewards", {})) == TYPE_DICTIONARY else {}
	rating_changed.emit(int(rewards_out.get("rating_after", get_rating())), int(last_result.get("rankingChange", 0)))
	battle_completed.emit(last_result)
	_set_battling(false)
	pending_combat_id = ""
	pending_offer_id = ""
	await load_opponents()
	return last_result


## One authoritative arena result for UI, ranking display, rewards sheet, and history.
func _normalize_battle_result(data: Dictionary) -> Dictionary:
	var rewards: Dictionary = data.get("rewards", {}) if typeof(data.get("rewards", {})) == TYPE_DICTIONARY else {}
	var battle: Dictionary = data.get("battle_result", {}) if typeof(data.get("battle_result", {})) == TYPE_DICTIONARY else {}
	var winner := str(data.get("winner", ""))
	if winner.is_empty() and not battle.is_empty():
		winner = str(battle.get("winner", ""))
	if winner.is_empty():
		winner = str(pending_battle.get("winner", "opponent"))
	var player_won := false
	if data.has("won"):
		player_won = bool(data.get("won"))
	elif data.has("player_won"):
		player_won = bool(data.get("player_won"))
	elif battle.has("playerWon"):
		player_won = bool(battle.get("playerWon"))
	elif rewards.has("won"):
		player_won = bool(rewards.get("won"))
	else:
		player_won = winner == "player"
	var outcome := str(data.get("outcome", battle.get("outcome", "")))
	if outcome.is_empty():
		outcome = "victory" if player_won else "defeat"
	var opp: Dictionary = pending_opp.duplicate(true)
	if typeof(data.get("opponent", null)) == TYPE_DICTIONARY and not (data.get("opponent") as Dictionary).is_empty():
		opp = (data.get("opponent") as Dictionary).duplicate(true)
	var player_id := str(GameManager.active_character.get("id", ""))
	var opponent_id := str(
		opp.get("character_id", opp.get("realCharacterId", opp.get("id", battle.get("opponentId", ""))))
	)
	var ranking_change := int(
		battle.get("rankingChange", rewards.get("arena_rating_delta", data.get("rankingChange", 0)))
	)
	var normalized_rewards: Dictionary = rewards.duplicate(true)
	normalized_rewards["won"] = player_won
	normalized_rewards["arena_rating_delta"] = ranking_change
	var result := {
		"ok": true,
		"won": player_won,
		"playerWon": player_won,
		"player_won": player_won,
		"outcome": outcome,
		"winner": "player" if player_won else "opponent",
		"battleId": str(data.get("combat_id", battle.get("battleId", pending_combat_id))),
		"playerId": player_id,
		"opponentId": opponent_id,
		"winnerId": player_id if player_won else opponent_id,
		"loserId": opponent_id if player_won else player_id,
		"rankingChange": ranking_change,
		"rating_delta": ranking_change,
		"rewards": normalized_rewards,
		"opp": opp,
		"is_free": bool(data.get("is_free", pending_is_free)),
		"nova_spent": int(data.get("nova_spent", 0)),
		"progression": data.get("progression", {}) if typeof(data.get("progression", {})) == TYPE_DICTIONARY else {},
		"data": data,
	}
	return result


func skip_cooldown() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("SkipArenaCooldown", {})
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "SkipArenaCooldown failed")))
	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	return {"ok": true, "data": data}


func recover_match(combat_id: String = "") -> Dictionary:
	var body := {}
	if not combat_id.is_empty():
		body["combat_id"] = combat_id
	elif not pending_combat_id.is_empty():
		body["combat_id"] = pending_combat_id
	var res: Dictionary = await GameApiClient.invoke("RecoverArenaMatch", body)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "RecoverArenaMatch failed")))
	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	if bool(data.get("pending", false)):
		var combat: Dictionary = data.get("combat", {}) if typeof(data.get("combat", {})) == TYPE_DICTIONARY else {}
		pending_combat_id = str(data.get("combat_id", combat.get("combat_id", "")))
		_ingest_combat_payload(combat)
		pending_opp = data.get("opponent", {}) if typeof(data.get("opponent", {})) == TYPE_DICTIONARY else {}
	return {"ok": true, "data": data}


func record_match(_opp: Dictionary, _won: bool, _rating_delta: int, _rating_after = null, _is_defense: bool = false) -> Dictionary:
	return {"ok": true, "error": "", "legacy": "disabled"}


func process_bot_raids(_limit: int = 2) -> Dictionary:
	return {"ok": true, "raids": []}


func list_ladder_bots() -> Array:
	return []


func list_rated_characters() -> Array:
	var res: Dictionary = await load_rankings()
	if res.get("ok", false):
		return res.get("data", {}).get("rankings", [])
	return []


func fetch_equipped_for(_character_id: String) -> Array:
	return []


func resolve_revenge_opponent(match: Dictionary) -> Dictionary:
	var oid := str(match.get("opponent_character_id", match.get("opponent_real_id", "")))
	if oid.is_empty():
		return {}
	return {
		"id": oid,
		"character_id": oid,
		"realCharacterId": oid,
		"name": str(match.get("opponent_name", "Rival")),
		"arena_rating": int(match.get("opponent_rating_before", match.get("opponent_rating", 1000))),
		"isBot": false,
	}


func can_free_refresh() -> bool:
	return _now_unix_ms() >= refresh_at_unix_ms


func refresh_remaining_ms() -> int:
	return maxi(0, refresh_at_unix_ms - _now_unix_ms())


func mark_refresh_used() -> void:
	refresh_at_unix_ms = _now_unix_ms() + ArenaRules.REFRESH_MS


func cooldown_ends_unix_ms() -> int:
	var raw := str(arena_state.get("next_battle_at", arena_state.get("available_at", "")))
	if raw.is_empty():
		var start := str(GameManager.active_character.get("arena_cooldown_at", ""))
		if start.is_empty():
			return 0
		return _parse_iso_unix(start) * 1000 + ArenaRules.BATTLE_COOLDOWN_MS
	return _parse_iso_unix(raw) * 1000


func cooldown_active() -> bool:
	var ends := cooldown_ends_unix_ms()
	if ends <= 0:
		return false
	return _now_unix_ms() < ends


func cooldown_remaining_ms() -> int:
	return maxi(0, cooldown_ends_unix_ms() - _now_unix_ms())


func opponent_mix_label(opp: Dictionary) -> String:
	return str(opp.get("matchup", opp.get("mixLabel", "")))


static func defense_snapshot_to_opponent(snap: Dictionary) -> Dictionary:
	return snap.duplicate(true)


func _ingest_prepare_result(opp: Dictionary, data: Dictionary) -> void:
	pending_offer_id = str(data.get("offer_id", opp.get("offer_id", "")))
	pending_is_free = bool(data.get("is_free", free_battles_left > 0))
	pending_skipped = bool(data.get("skip_cooldown", false))
	pending_challenge_id = ""
	var combat: Dictionary = data.get("combat", {}) if typeof(data.get("combat", {})) == TYPE_DICTIONARY else {}
	pending_combat_id = str(combat.get("combat_id", ""))
	_ingest_combat_payload(combat)
	pending_opp = opp.duplicate(true)
	if typeof(data.get("opponent", {})) == TYPE_DICTIONARY:
		pending_opp.merge(data["opponent"], true)
	pending_rewards = {
		"arena_rating_delta": 0,
		"xp": 0,
		"stardust": 0,
	}


func _ingest_combat_payload(combat: Dictionary) -> void:
	var battle: Dictionary = combat.get("battle", {}) if typeof(combat.get("battle", {})) == TYPE_DICTIONARY else {}
	var player_end: Dictionary = {}
	var opp_end: Dictionary = {}
	if typeof(battle.get("playerEnd", null)) == TYPE_DICTIONARY:
		player_end = battle["playerEnd"]
	elif typeof(combat.get("playerEnd", null)) == TYPE_DICTIONARY:
		player_end = combat["playerEnd"]
	if typeof(battle.get("opponentEnd", null)) == TYPE_DICTIONARY:
		opp_end = battle["opponentEnd"]
	elif typeof(combat.get("opponentEnd", null)) == TYPE_DICTIONARY:
		opp_end = combat["opponentEnd"]
	pending_battle = {
		"winner": str(combat.get("winner", battle.get("winner", "opponent"))),
		"events": battle.get("events", combat.get("events", [])),
		"playerEndHp": int(player_end.get("hp", 0)),
		"opponentEndHp": int(opp_end.get("hp", 0)),
		"playerMaxHp": int(battle.get("playerMaxHp", combat.get("playerMaxHp", 0))),
		"opponentMaxHp": int(battle.get("opponentMaxHp", combat.get("opponentMaxHp", 0))),
		"initiativeFirstSide": str(battle.get("initiativeFirstSide", combat.get("opening_side", ""))),
	}


func _map_opponent_cards(raw: Variant) -> Array:
	var out: Array = []
	if typeof(raw) != TYPE_ARRAY:
		return out
	for row in raw:
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var r: Dictionary = row
		var is_bot := bool(r.get("isBot", r.get("is_bot", false)))
		out.append({
			"id": str(r.get("id", r.get("offer_id", ""))),
			"offer_id": str(r.get("offer_id", "")),
			"character_id": str(r.get("character_id", r.get("realCharacterId", ""))),
			"realCharacterId": str(r.get("realCharacterId", r.get("character_id", ""))),
			"name": str(r.get("name", r.get("display_name", "Rival"))),
			"display_name": str(r.get("name", r.get("display_name", "Rival"))),
			"class": str(r.get("class", "Vanguard")),
			"level": int(r.get("level", 1)),
			"arena_rating": int(r.get("arena_rating", r.get("rating", 1000))),
			"matchup": str(r.get("matchup", "even")),
			"isBot": is_bot,
			"arena_bot_id": r.get("arena_bot_id", null),
			"power": int(r.get("power", 0)),
			"guild": r.get("guild", null),
			"appearance": r.get("appearance", {}),
			"equippedItems": [],
		})
	return out


func _now_unix_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)


func _parse_iso_unix(iso: String) -> int:
	var s := iso.strip_edges()
	if s.ends_with("Z"):
		s = s.substr(0, s.length() - 1)
	var parts := s.split("T")
	if parts.size() < 2:
		return 0
	var d := parts[0].split("-")
	var t := parts[1].split(":")
	if d.size() < 3 or t.size() < 3:
		return 0
	var dict := {
		"year": int(d[0]),
		"month": int(d[1]),
		"day": int(d[2]),
		"hour": int(t[0]),
		"minute": int(t[1]),
		"second": int(float(t[2])),
	}
	return int(Time.get_unix_time_from_datetime_dict(dict))
