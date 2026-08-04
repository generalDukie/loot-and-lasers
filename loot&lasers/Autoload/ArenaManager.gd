extends Node
## Arena lobby — Phase 18: Nakama ArenaService is sole rating/combat authority.
## Local MissionCombat simulation and FinishArenaBattle settlement are disabled.
## Preserves UI-facing vars/functions used by arena.gd / arena_combat.gd / leaderboard.

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
## Wall-clock ms when free opponent refresh becomes available again.
var refresh_at_unix_ms: int = 0
var pending_opp: Dictionary = {}
var pending_battle: Dictionary = {}
var pending_rewards: Dictionary = {}
var pending_is_free: bool = true
var pending_skipped: bool = false
var pending_challenge_id := ""
var pending_policy_version := ""
var last_result: Dictionary = {}
var match_history: Array = []

var arena_state: Dictionary = {}
var loading := false
var battling := false
var _busy := false


func _ready() -> void:
	print("[ArenaManager] ready (Nakama arena authority)")


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
	return int(arena_state.get("rank_position", 0))


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


func _character_payload(character_id: String = "") -> Dictionary:
	var cid := character_id if not character_id.is_empty() else str(GameManager.active_character.get("id", ""))
	var payload := {
		"character_id": cid,
		"class": str(GameManager.active_character.get("class", "Vanguard")),
		"level": int(GameManager.active_character.get("level", 1)),
	}
	var dn := str(GameManager.active_character.get("name", GameManager.active_character.get("display_name", "")))
	if not dn.is_empty():
		payload["display_name"] = dn
	return payload


func _apply_arena_state(data: Dictionary) -> void:
	var a: Variant = data.get("arena", data)
	if typeof(a) != TYPE_DICTIONARY:
		return
	arena_state = (a as Dictionary).duplicate(true)
	if data.has("attempts_remaining"):
		free_battles_left = int(data["attempts_remaining"])
	else:
		var limit := int(arena_state.get("daily_attempt_limit", ArenaRules.DAILY_FREE_BATTLES))
		free_battles_left = maxi(0, limit - int(arena_state.get("battles_today", 0)))
	# Mirror rating onto active character for UI that still reads Character fields.
	if typeof(GameManager.active_character) == TYPE_DICTIONARY and not GameManager.active_character.is_empty():
		GameManager.active_character["arena_rating"] = int(arena_state.get("rating", 1000))
		GameManager.active_character["arena_wins"] = int(arena_state.get("wins", 0))
		GameManager.active_character["arena_losses"] = int(arena_state.get("losses", 0))
		GameManager.active_character["arena_streak"] = int(arena_state.get("win_streak", 0))
		GameManager.active_character["arena_attempts_left"] = free_battles_left
		var next_at := str(arena_state.get("next_battle_at", ""))
		if not next_at.is_empty():
			GameManager.active_character["arena_cooldown_at"] = next_at


func load_arena_state(character_id: String = "") -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("arena_get_state", _character_payload(character_id))
	_busy = false
	_set_loading(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "arena_get_state failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	_apply_arena_state(data)
	arena_state_loaded.emit(arena_state)
	return {"ok": true, "error": "", "data": data}


## Legacy name — maps to Nakama day/attempts sync via arena_get_state.
func sync_day() -> Dictionary:
	return await load_arena_state()


func refresh_character() -> Dictionary:
	# Character sheet still Node-backed; arena rating comes from Nakama state.
	return await load_arena_state()


func load_equipped() -> Array:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		equipped_items = []
		return equipped_items
	var res: Dictionary = await EquipmentManager.load_equipment(cid)
	if bool(res.get("ok", false)):
		var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
		var slots: Variant = data.get("slots", {})
		equipped_items = []
		if typeof(slots) == TYPE_DICTIONARY:
			for k in slots.keys():
				var piece: Variant = slots[k]
				if typeof(piece) == TYPE_DICTIONARY and not (piece as Dictionary).is_empty():
					equipped_items.append(piece)
	return equipped_items


func load_opponents(character_id: String = "") -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("arena_get_opponents", _character_payload(character_id))
	_busy = false
	_set_loading(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "arena_get_opponents failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	opponents = _map_opponent_cards(data.get("opponents", []))
	opponents_loaded.emit(opponents)
	return {"ok": true, "error": "", "data": data, "opponents": opponents}


## Legacy pool builder — now server matchmaking.
func build_opponent_pool() -> Array:
	var res: Dictionary = await load_opponents()
	if not res.get("ok", false):
		opponents = []
	return opponents


func refresh_opponents(charge: bool = false) -> Dictionary:
	# Phase 18: free cooldown refresh only (no premium / stardust charge).
	if charge:
		# Ignore paid refresh — use free path when eligible.
		pass
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var payload := _character_payload()
	payload["request_id"] = "aref-%s-%s" % [Time.get_ticks_msec(), randi()]
	var res: Dictionary = await NakamaManager.invoke_rpc("arena_refresh_opponents", payload)
	_busy = false
	_set_loading(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "arena_refresh_opponents failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	opponents = _map_opponent_cards(data.get("opponents", []))
	var refresh_at := str(data.get("opponents_refresh_at", ""))
	if not refresh_at.is_empty():
		refresh_at_unix_ms = _parse_iso_unix(refresh_at) * 1000
	else:
		mark_refresh_used()
	opponents_loaded.emit(opponents)
	return {"ok": true, "error": "", "opponents": opponents}


func load_rankings(character_id: String = "", cursor: String = "") -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var payload := _character_payload(character_id)
	if not cursor.is_empty():
		payload["cursor"] = cursor
	var res: Dictionary = await NakamaManager.invoke_rpc("arena_get_rankings", payload)
	_busy = false
	_set_loading(false)
	if not bool(res.get("success", false)):
		return _fail(str(res.get("error", "arena_get_rankings failed")))
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var rows: Array = data.get("rankings", []) if typeof(data.get("rankings", [])) == TYPE_ARRAY else []
	rankings_loaded.emit(rows)
	return {"ok": true, "error": "", "data": data}


func load_history(character_id: String = "", cursor: String = "") -> Array:
	var payload := _character_payload(character_id)
	if not cursor.is_empty():
		payload["cursor"] = cursor
	var res: Dictionary = await NakamaManager.invoke_rpc("arena_get_history", payload)
	if bool(res.get("success", false)):
		var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
		match_history = _map_history_rows(data.get("history", []))
	else:
		match_history = []
		arena_error.emit(str(res.get("error", "arena_get_history failed")))
	history_loaded.emit(match_history)
	return match_history


func challenge_opponent(character_id: String, opponent_character_id: String) -> Dictionary:
	return await start_direct_challenge(opponent_character_id)


## Server-authoritative challenge — CombatService resolves winner; client only animates.
func prepare_challenge(opp: Dictionary, skip_cooldown: bool = false) -> Dictionary:
	if _busy or battling:
		return _fail("Arena battle already in progress")
	if cooldown_active() and not skip_cooldown:
		return _fail("Battle cooldown active")
	# Phase 18: no Nova skip / paid battles on Nakama path.
	if cooldown_active() and skip_cooldown:
		return _fail("Cooldown skip is disabled; wait for cooldown")

	var oid := str(opp.get("character_id", opp.get("realCharacterId", opp.get("id", ""))))
	if oid.is_empty():
		return _fail("Missing opponent character id")

	_set_battling(true)
	challenge_started.emit()
	var payload := _character_payload()
	payload["opponent_character_id"] = oid
	payload["request_id"] = "ach-%s-%s" % [Time.get_ticks_msec(), randi()]
	var res: Dictionary = await NakamaManager.invoke_rpc("arena_challenge", payload)
	if not bool(res.get("success", false)):
		_set_battling(false)
		return _fail(str(res.get("error", "arena_challenge failed")))

	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	_ingest_challenge_result(opp, data)
	_set_battling(false)
	return {
		"ok": true,
		"opp": pending_opp,
		"battle": pending_battle,
		"rewards": pending_rewards,
		"is_free": pending_is_free,
		"skipped": false,
	}


func start_direct_challenge(opponent_character_id: String) -> Dictionary:
	var me := str(GameManager.active_character.get("id", ""))
	if me.is_empty() or opponent_character_id.is_empty():
		return _fail("Missing characters")
	if me == opponent_character_id:
		return _fail("Cannot challenge yourself")
	var fake_opp := {"character_id": opponent_character_id, "name": "Rival", "id": opponent_character_id}
	var prep: Dictionary = await prepare_challenge(fake_opp, false)
	if not prep.get("ok", false):
		return prep
	# Navigate handled by callers (leaderboard / profile).
	return prep


func prepare_revenge(match: Dictionary) -> Dictionary:
	var oid := str(match.get("opponent_character_id", match.get("opponent_real_id", "")))
	if oid.is_empty():
		return _fail("Revenge opponent unavailable")
	return await prepare_challenge({"character_id": oid, "name": str(match.get("opponent_name", "Rival"))}, false)


func finish_battle() -> Dictionary:
	## Settlement already applied server-side in arena_challenge.
	## Returns last_result for arena_combat UI compatibility.
	if last_result.is_empty() and not pending_battle.is_empty():
		var won := str(pending_battle.get("winner", "opponent")) == "player"
		last_result = {
			"ok": true,
			"won": won,
			"rewards": pending_rewards,
			"rating_delta": int(pending_rewards.get("arena_rating_delta", 0)),
		}
	battle_completed.emit(last_result)
	_set_battling(false)
	await load_arena_state()
	await load_history()
	await load_opponents()
	return last_result if not last_result.is_empty() else {"ok": true, "won": false}


func record_match(_opp: Dictionary, _won: bool, _rating_delta: int, _rating_after = null, _is_defense: bool = false) -> Dictionary:
	## Disabled — history is written by ArenaService.
	return {"ok": true, "error": "", "legacy": "disabled"}


func process_bot_raids(_limit: int = 2) -> Dictionary:
	## Phase 18: bot raids not ported to Nakama.
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
	var raw := str(arena_state.get("next_battle_at", GameManager.active_character.get("arena_cooldown_at", "")))
	if raw.is_empty():
		return 0
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


func _ingest_challenge_result(opp: Dictionary, data: Dictionary) -> void:
	pending_challenge_id = str(data.get("battle_id", ""))
	pending_policy_version = str(data.get("rating", {}).get("challenger", {}).get("gap_band", "")) if typeof(data.get("rating", {})) == TYPE_DICTIONARY else ""
	pending_is_free = true
	pending_skipped = false

	var combat: Dictionary = data.get("combat", {}) if typeof(data.get("combat", {})) == TYPE_DICTIONARY else {}
	pending_battle = {
		"winner": str(data.get("winner", combat.get("winner", "opponent"))),
		"events": data.get("combat_log", combat.get("combat_log", [])),
		"playerEndHp": int(combat.get("player", {}).get("hp", 0)) if typeof(combat.get("player", {})) == TYPE_DICTIONARY else 0,
		"opponentEndHp": int(combat.get("opponent", {}).get("hp", 0)) if typeof(combat.get("opponent", {})) == TYPE_DICTIONARY else 0,
		"playerMaxHp": int(combat.get("player", {}).get("max_hp", 0)) if typeof(combat.get("player", {})) == TYPE_DICTIONARY else 0,
		"opponentMaxHp": int(combat.get("opponent", {}).get("max_hp", 0)) if typeof(combat.get("opponent", {})) == TYPE_DICTIONARY else 0,
		"initiativeFirstSide": str(combat.get("initiative_first_side", "")),
	}

	var rating: Dictionary = data.get("rating", {}) if typeof(data.get("rating", {})) == TYPE_DICTIONARY else {}
	var ch: Dictionary = rating.get("challenger", {}) if typeof(rating.get("challenger", {})) == TYPE_DICTIONARY else {}
	var delta := int(ch.get("rating_change", 0))
	pending_rewards = {
		"arena_rating_delta": delta,
		"xp": 0,
		"stardust": 0,
		"rating_after": int(ch.get("rating_after", get_rating())),
	}
	pending_opp = opp.duplicate(true)
	pending_opp["character_id"] = str(data.get("winner_character_id", opp.get("character_id", ""))) if false else str(opp.get("character_id", opp.get("id", "")))
	pending_opp["name"] = str(opp.get("display_name", opp.get("name", "Rival")))
	pending_opp["arena_rating"] = int(rating.get("opponent", {}).get("rating_before", 1000)) if typeof(rating.get("opponent", {})) == TYPE_DICTIONARY else 1000
	pending_opp["isBot"] = false
	pending_opp["realCharacterId"] = str(opp.get("character_id", opp.get("id", "")))

	if typeof(data.get("arena", {})) == TYPE_DICTIONARY:
		_apply_arena_state({"arena": data["arena"]})

	var won := str(pending_battle.get("winner", "")) == "player"
	last_result = {
		"ok": true,
		"won": won,
		"rewards": pending_rewards,
		"rating_delta": delta,
		"data": data,
	}
	rating_changed.emit(int(ch.get("rating_after", get_rating())), delta)


func _map_opponent_cards(raw: Variant) -> Array:
	var out: Array = []
	if typeof(raw) != TYPE_ARRAY:
		return out
	for row in raw:
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var r: Dictionary = row
		out.append({
			"id": str(r.get("character_id", "")),
			"character_id": str(r.get("character_id", "")),
			"realCharacterId": str(r.get("character_id", "")),
			"name": str(r.get("display_name", "Rival")),
			"display_name": str(r.get("display_name", "Rival")),
			"class": str(r.get("class", "Vanguard")),
			"level": int(r.get("level", 1)),
			"arena_rating": int(r.get("rating", 1000)),
			"tier_id": str(r.get("tier_id", "")),
			"matchup": str(r.get("matchup", "even")),
			"challenge_eligible": bool(r.get("challenge_eligible", true)),
			"isBot": false,
			"power": 0,
			"equippedItems": [],
		})
	return out


func _map_history_rows(raw: Variant) -> Array:
	var out: Array = []
	if typeof(raw) != TYPE_ARRAY:
		return out
	for row in raw:
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var r: Dictionary = row
		var me := str(GameManager.active_character.get("id", ""))
		var i_am_challenger := str(r.get("challenger_character_id", "")) == me
		var won := str(r.get("winner_character_id", "")) == me
		out.append({
			"id": str(r.get("battle_id", "")),
			"character_id": me,
			"opponent_character_id": str(r.get("opponent_character_id", "") if i_am_challenger else r.get("challenger_character_id", "")),
			"opponent_real_id": str(r.get("opponent_character_id", "") if i_am_challenger else r.get("challenger_character_id", "")),
			"opponent_name": "Rival",
			"won": won,
			"rating_delta": int(r.get("challenger_rating_change", 0) if i_am_challenger else r.get("opponent_rating_change", 0)),
			"rating_after": int(r.get("challenger_rating_after", 0) if i_am_challenger else r.get("opponent_rating_after", 0)),
			"is_defense": not i_am_challenger,
			"created_date": str(r.get("created_at", "")),
			"opponent_snapshot": {},
		})
	return out


func _now_unix_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)


func _parse_iso_unix(iso: String) -> int:
	# Accept "YYYY-MM-DDTHH:MM:SSZ"
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
