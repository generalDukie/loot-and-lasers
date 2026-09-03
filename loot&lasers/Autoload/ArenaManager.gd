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

const DEFAULT_ARENA_RATING := 1_000
const EQUIPPED_ITEM_QUERY_LIMIT := 20
const DEFAULT_LEADERBOARD_LIMIT := 100
const MAX_LEADERBOARD_LIMIT := 100
const DEFAULT_NEARBY_RADIUS := 5
const MAX_NEARBY_RADIUS := 25
const BOARD_HASH_MULTIPLIER := 33
const BOARD_HASH_MODULUS := 2_147_483_647
const MILLISECONDS_PER_SECOND := 1_000.0
const DEFAULT_BOT_RAID_BATCH := 2

var opponents: Array = []
var equipped_items: Array = []
var rewarded_wins_today: int = 0
var rewarded_wins_remaining: int = ArenaRules.DAILY_REWARDED_WINS
var reward_cap_reached := false
var rank_position: int = 0
var refresh_at_unix_ms: int = 0
var pending_opp: Dictionary = {}
var pending_battle: Dictionary = {}
var pending_rewards: Dictionary = {}
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
	rewarded_wins_today = 0
	rewarded_wins_remaining = ArenaRules.DAILY_REWARDED_WINS
	reward_cap_reached = false
	rank_position = 0
	refresh_at_unix_ms = 0
	pending_opp = {}
	pending_battle = {}
	pending_rewards = {}
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
	return int(
		arena_state.get(
			"rating",
			GameManager.active_character.get("arena_rating", DEFAULT_ARENA_RATING),
		)
	)


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


## Client presentation lock only — call if the duel overlay is dismissed
## before FinishArenaBattle (script error, nav away, empty overlay).
func release_presentation_lock() -> void:
	if battling:
		_set_battling(false)


func _combat_overlay_visible() -> bool:
	var current := get_tree().current_scene
	if current != null and current.has_method("has_combat_replay_overlay"):
		return bool(current.call("has_combat_replay_overlay"))
	return false


## If Settings / nav tore down the duel overlay, settle or unlock so the lobby
## is not stuck on "Arena battle already in progress".
func recover_orphan_presentation() -> Dictionary:
	if _combat_overlay_visible():
		return {"ok": true, "overlay": true}
	if CombatReturnManager.kind == "arena" and CombatReturnManager.state == CombatReturnManager.STATE_SETTLING:
		return {"ok": true, "settling": true}
	if CombatReturnManager.is_for_kind("arena"):
		return {"ok": true, "awaiting_rewards": true}
	if not battling and pending_combat_id.is_empty() and pending_offer_id.is_empty():
		return {"ok": true}
	if pending_combat_id.is_empty() and pending_offer_id.is_empty():
		release_presentation_lock()
		return {"ok": true, "unlocked": true}
	var fin: Dictionary = await finish_battle()
	if not bool(fin.get("ok", false)):
		var rec: Dictionary = await recover_match()
		if bool(rec.get("ok", false)):
			fin = await finish_battle()
	release_presentation_lock()
	return {"ok": true, "settled": bool(fin.get("ok", false))}


func _fail(msg: String, code: String = "", data: Dictionary = {}) -> Dictionary:
	arena_error.emit(msg)
	return {"ok": false, "error": msg, "code": code, "data": data}


func _payload(res: Dictionary) -> Dictionary:
	if typeof(res.get("data", null)) == TYPE_DICTIONARY:
		return res.data
	return res


func _apply_board_from_payload(data: Dictionary) -> void:
	if typeof(data.get("opponents", null)) != TYPE_ARRAY:
		return
	_apply_character(data)
	# Only hydrate arena from an explicit `arena` object — never the whole payload.
	# ARENA_BOARD_REFRESHED errors used to fall through as arena_state and wipe
	# arena_cooldown_at, which turned SKIP & FIGHT into CHALLENGE after one press.
	if typeof(data.get("arena", null)) == TYPE_DICTIONARY:
		_apply_arena_state(data)
	opponents = _map_opponent_cards(data.get("opponents", []))
	var expires := _iso_field(data.get("expires_at", null))
	if not expires.is_empty():
		refresh_at_unix_ms = int(_parse_iso_unix(expires) * MILLISECONDS_PER_SECOND)
	opponents_loaded.emit(opponents)


func _apply_character(data: Dictionary) -> void:
	## Must go through GameApiClient → GameManager/CurrencyManager so the
	## operative console sees spends (Nova skip) immediately.
	GameApiClient.apply_authoritative_response(data, "arena_node_action")


func _apply_arena_state(data: Dictionary) -> void:
	var a: Variant = data.get("arena", null)
	# Back-compat: GetArenaStatus-shaped payloads are the arena object itself.
	if typeof(a) != TYPE_DICTIONARY and _looks_like_arena_state(data):
		a = data
	if typeof(a) != TYPE_DICTIONARY:
		return
	if not _looks_like_arena_state(a):
		return
	arena_state = (a as Dictionary).duplicate(true)
	rewarded_wins_today = int(arena_state.get("rewarded_wins_today", 0))
	rewarded_wins_remaining = int(arena_state.get(
		"rewarded_wins_remaining",
		maxi(0, ArenaRules.DAILY_REWARDED_WINS - rewarded_wins_today)
	))
	reward_cap_reached = bool(arena_state.get("reward_cap_reached", arena_state.get("rating_only", false)))
	rank_position = int(arena_state.get("rank_position", arena_state.get("rank", 0)))
	if typeof(GameManager.active_character) == TYPE_DICTIONARY and not GameManager.active_character.is_empty():
		GameManager.active_character["arena_rating"] = int(
			arena_state.get("rating", DEFAULT_ARENA_RATING)
		)
		GameManager.active_character["arena_wins"] = int(arena_state.get("wins", 0))
		GameManager.active_character["arena_losses"] = int(arena_state.get("losses", 0))
		GameManager.active_character["arena_streak"] = int(arena_state.get("win_streak", 0))
		GameManager.active_character["arena_rank"] = rank_position
		# Never write str(null) → "<null>" — that breaks cooldown math fallbacks.
		GameManager.active_character["arena_cooldown_at"] = _iso_field(arena_state.get("arena_cooldown_at", null))


func _looks_like_arena_state(d: Dictionary) -> bool:
	return (
		d.has("cooldown_active")
		or d.has("rewarded_wins_today")
		or d.has("rewarded_wins_remaining")
		or d.has("next_battle_at")
		or d.has("available_at")
		or (d.has("rating") and d.has("wins"))
	)


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
		{
			"query": {"character_id": cid, "is_equipped": true},
			"limit": EQUIPPED_ITEM_QUERY_LIMIT,
		},
		true
	)
	equipped_items = []
	if res.ok and typeof(res.data) == TYPE_ARRAY:
		for piece in res.data:
			if typeof(piece) == TYPE_DICTIONARY and not (piece as Dictionary).is_empty():
				equipped_items.append(piece)
	return equipped_items


func load_opponents(_character_id: String = "", _force: bool = false, exclude_ids: Array = []) -> Dictionary:
	## `_force` ignored — server remints only on fight / 2h TTL / level mismatch.
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var body := {}
	if exclude_ids.size() > 0:
		body["exclude_ids"] = exclude_ids
	var res: Dictionary = await GameApiClient.invoke("GetArenaOpponents", body)
	_busy = false
	_set_loading(false)
	if not bool(res.get("ok", false)):
		return _fail(str(res.get("error", "GetArenaOpponents failed")), str(res.get("code", "")))
	var data := _payload(res)
	_apply_board_from_payload(data)
	var debug_offers: Variant = data.get("debug_offers", null)
	if typeof(debug_offers) == TYPE_DICTIONARY:
		print("[ArenaOffers] %s" % JSON.stringify(debug_offers))
	return {"ok": true, "error": "", "data": data, "opponents": opponents}


func build_opponent_pool(_force: bool = false, exclude_ids: Array = []) -> Array:
	var res: Dictionary = await load_opponents("", false, exclude_ids)
	if not res.get("ok", false):
		opponents = []
	return opponents


## Manual refresh removed — kept as soft no-op for any leftover callers.
func refresh_opponents(_charge: bool = false) -> Dictionary:
	return await load_opponents()


func load_rankings(_character_id: String = "", _cursor: String = "", limit: int = DEFAULT_LEADERBOARD_LIMIT, offset: int = 0) -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("GetArenaLeaderboard", {
		"limit": clampi(limit, 1, MAX_LEADERBOARD_LIMIT),
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
func load_nearby_rankings(radius: int = DEFAULT_NEARBY_RADIUS) -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("GetArenaLeaderboard", {
		"limit": 1,
		"offset": 0,
		"nearby": true,
		"nearby_radius": clampi(radius, 0, MAX_NEARBY_RADIUS),
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


func prepare_challenge(
	opp: Dictionary,
	skip_cooldown: bool = false,
	_cooldown_retry: bool = false,
	_board_retry: bool = false
) -> Dictionary:
	if _busy:
		return _fail("Arena request already in progress")
	if battling:
		_busy = true
		var orphan: Dictionary = await recover_orphan_presentation()
		_busy = false
		if bool(orphan.get("overlay", false)):
			return _fail("Arena battle already in progress")
		if bool(orphan.get("settling", false)):
			return _fail("Still settling arena rewards…")
		if bool(orphan.get("awaiting_rewards", false)):
			return _fail("Collect your arena rewards first")
		if battling:
			return _fail("Arena battle already in progress")
	# Paying the skip is opt-in via the lobby button, but if our clock/state
	# already knows a cooldown is active, always send skip so the server charge path runs.
	if cooldown_active():
		skip_cooldown = true

	var offer_id := str(opp.get("offer_id", ""))
	if offer_id.is_empty():
		return _fail("Missing opponent offer id")

	# Lock the clicked contender before any await so the battle overlay cannot
	# boot (or keep showing) the previous fight's opponent.
	_begin_active_opponent(opp)

	_set_battling(true)
	challenge_started.emit()
	var payload := {
		"offer_id": offer_id,
		"skip_cooldown": skip_cooldown,
	}
	var res: Dictionary = await GameApiClient.invoke("PrepareArenaCombat", payload)
	if not bool(res.get("ok", false)):
		_set_battling(false)
		var code := str(res.get("code", ""))
		var err_data := _payload(res)
		if code == "ARENA_BOARD_REFRESHED":
			_apply_board_from_payload(err_data)
			# Never auto-start a substitute offer — that fought whoever landed
			# in the same slot after remint while the card still showed the last foe.
			return _fail(
				str(res.get("error", "Challengers updated — pick again")),
				code,
				err_data
			)
		# Client thought CD was clear but server still has one — resync and retry once with skip.
		if code == "ARENA_COOLDOWN" and not _cooldown_retry:
			await load_arena_state()
			return await prepare_challenge(opp, true, true, _board_retry)
		return _fail(str(res.get("error", "PrepareArenaCombat failed")), code, err_data)

	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	_ingest_prepare_result(opp, data, skip_cooldown)
	return {
		"ok": true,
		"opp": pending_opp,
		"battle": pending_battle,
		"rewards": pending_rewards,
		"skipped": pending_skipped,
	}


func _match_offer_on_board(desired: Dictionary) -> Dictionary:
	var want_offer := str(desired.get("offer_id", "")).strip_edges()
	var want_real := str(desired.get("realCharacterId", desired.get("character_id", ""))).strip_edges()
	var want_bot := str(desired.get("arena_bot_id", "")).strip_edges()
	var want_name := str(desired.get("name", desired.get("display_name", ""))).strip_edges().to_lower()
	for row in opponents:
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var o: Dictionary = row
		var oid := str(o.get("offer_id", "")).strip_edges()
		if not want_offer.is_empty() and oid == want_offer:
			return o
	for row in opponents:
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var o2: Dictionary = row
		var real := str(o2.get("realCharacterId", o2.get("character_id", ""))).strip_edges()
		var bot := str(o2.get("arena_bot_id", "")).strip_edges()
		if not want_real.is_empty() and real == want_real:
			return o2
		if not want_bot.is_empty() and bot == want_bot:
			return o2
	if not want_name.is_empty():
		for row in opponents:
			if typeof(row) != TYPE_DICTIONARY:
				continue
			var o3: Dictionary = row
			var nm := str(o3.get("name", o3.get("display_name", ""))).strip_edges().to_lower()
			if nm == want_name:
				return o3
	return {}


func start_direct_challenge(opponent_character_id: String) -> Dictionary:
	for o in opponents:
		if typeof(o) != TYPE_DICTIONARY:
			continue
		var oid := str(o.get("character_id", o.get("realCharacterId", "")))
		if oid == opponent_character_id and str(o.get("offer_id", "")) != "":
			return await prepare_challenge(o, false)
	return await _create_and_prepare_direct_challenge(opponent_character_id)


func _create_and_prepare_direct_challenge(
	opponent_character_id: String,
	skip_cooldown: bool = false,
	_cooldown_retry: bool = false,
	existing_challenge_id: String = ""
) -> Dictionary:
	if opponent_character_id.is_empty():
		return _fail("Opponent required")
	if battling:
		_busy = true
		var orphan: Dictionary = await recover_orphan_presentation()
		_busy = false
		if bool(orphan.get("overlay", false)):
			return _fail("Arena battle already in progress")
		if bool(orphan.get("settling", false)):
			return _fail("Still settling arena rewards…")
		if bool(orphan.get("awaiting_rewards", false)):
			return _fail("Collect your arena rewards first")
		if battling:
			return _fail("Arena battle already in progress")
	if cooldown_active():
		skip_cooldown = true

	var challenge_id := existing_challenge_id
	if challenge_id.is_empty():
		var me := str(GameManager.active_character.get("id", ""))
		var created: Dictionary = await GameApiClient.request(
			"POST",
			"/api/arena/challenges",
			{
				"challengerCharacterId": me,
				"opponentCharacterId": opponent_character_id,
				"idempotencyKey": "godot-dc-%s-%s-%s" % [
					me,
					opponent_character_id,
					str(Time.get_ticks_msec()),
				],
				"challengeType": "leaderboard_direct",
			},
			true
		)
		if not bool(created.get("ok", false)):
			return _fail(str(created.get("error", "Direct challenge create failed")), str(created.get("code", "")))
		var created_data := _payload(created)
		challenge_id = str(created_data.get("challengeId", created_data.get("challenge_id", "")))
		if challenge_id.is_empty():
			return _fail("Direct challenge id missing")

	_set_battling(true)
	challenge_started.emit()
	var payload := {
		"challenge_id": challenge_id,
		"skip_cooldown": skip_cooldown,
	}
	var res: Dictionary = await GameApiClient.invoke("PrepareArenaCombat", payload)
	if not bool(res.get("ok", false)):
		_set_battling(false)
		var code := str(res.get("code", ""))
		if code == "ARENA_COOLDOWN" and not _cooldown_retry:
			await load_arena_state()
			return await _create_and_prepare_direct_challenge(
				opponent_character_id, true, true, challenge_id
			)
		return _fail(str(res.get("error", "PrepareArenaCombat failed")), code, _payload(res))

	var data := _payload(res)
	_apply_character(data)
	_apply_arena_state(data)
	var opp: Dictionary = data.get("opponent", {}) if typeof(data.get("opponent", {})) == TYPE_DICTIONARY else {}
	_begin_active_opponent(opp)
	_ingest_prepare_result(opp, data, skip_cooldown)
	return {
		"ok": true,
		"opp": pending_opp,
		"battle": pending_battle,
		"rewards": pending_rewards,
		"skipped": pending_skipped,
	}


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
		"skip_cooldown": pending_skipped,
	}
	if not pending_challenge_id.is_empty():
		body["challenge_id"] = pending_challenge_id
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
	# Prefer fresh board from FinishArenaBattle; otherwise force-mint excluding prior set.
	var server_offers: Variant = data.get("opponents", null)
	if typeof(server_offers) == TYPE_ARRAY and (server_offers as Array).size() > 0:
		opponents = _map_opponent_cards(server_offers)
		var debug_offers: Variant = data.get("debug_offers", null)
		if typeof(debug_offers) == TYPE_DICTIONARY:
			print("[ArenaOffers] %s" % JSON.stringify(debug_offers))
		var expires := str(data.get("expires_at", ""))
		if not expires.is_empty():
			refresh_at_unix_ms = int(_parse_iso_unix(expires) * MILLISECONDS_PER_SECOND)
		opponents_loaded.emit(opponents)
	else:
		# Finish should have reminted; reload current board (server ignores force).
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
		player_won = data.get("won") == true
	elif data.has("player_won"):
		player_won = data.get("player_won") == true
	elif battle.has("playerWon"):
		player_won = battle.get("playerWon") == true
	elif rewards.has("won"):
		player_won = rewards.get("won") == true
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


func process_bot_raids(_limit: int = DEFAULT_BOT_RAID_BATCH) -> Dictionary:
	return {"ok": true, "raids": []}


func resolve_revenge_opponent(match: Dictionary) -> Dictionary:
	var oid := str(match.get("opponent_character_id", match.get("opponent_real_id", "")))
	if oid.is_empty():
		return {}
	return {
		"id": oid,
		"character_id": oid,
		"realCharacterId": oid,
		"name": str(match.get("opponent_name", "Rival")),
		"arena_rating": int(
			match.get(
				"opponent_rating_before",
				match.get("opponent_rating", DEFAULT_ARENA_RATING),
			)
		),
		"isBot": false,
	}


## Board expiry helpers (TTL from server `expires_at`; not a manual refresh gate).
func board_expired() -> bool:
	return refresh_at_unix_ms > 0 and _now_unix_ms() >= refresh_at_unix_ms


func board_remaining_ms() -> int:
	return maxi(0, refresh_at_unix_ms - _now_unix_ms())


## @deprecated Manual refresh removed — alias kept for older UI callers.
func can_free_refresh() -> bool:
	return board_expired()


func refresh_remaining_ms() -> int:
	return board_remaining_ms()


func mark_refresh_used() -> void:
	## No-op: expiry comes from server `expires_at` on GetArenaOpponents.
	pass


func cooldown_ends_unix_ms() -> int:
	var end_iso := _iso_field(arena_state.get("next_battle_at", null))
	if end_iso.is_empty():
		end_iso = _iso_field(arena_state.get("available_at", null))
	if not end_iso.is_empty():
		var end_unix := _parse_iso_unix(end_iso)
		if end_unix > 0:
			return int(end_unix * MILLISECONDS_PER_SECOND)
	var start := _iso_field(GameManager.active_character.get("arena_cooldown_at", null))
	if start.is_empty():
		start = _iso_field(arena_state.get("arena_cooldown_at", null))
	if start.is_empty():
		return 0
	var start_unix := _parse_iso_unix(start)
	if start_unix <= 0:
		return 0
	return int(start_unix * MILLISECONDS_PER_SECOND) + ArenaRules.BATTLE_COOLDOWN_MS


func cooldown_active() -> bool:
	var ends := cooldown_ends_unix_ms()
	if ends > 0:
		return _now_unix_ms() < ends
	# No usable end timestamp — trust server availability flags.
	if arena_state.has("cooldown_active"):
		return bool(arena_state.get("cooldown_active", false))
	if arena_state.has("available"):
		return arena_state.get("available") == false
	return false


func cooldown_remaining_ms() -> int:
	var ends := cooldown_ends_unix_ms()
	if ends > 0:
		return maxi(0, ends - _now_unix_ms())
	if cooldown_active():
		return ArenaRules.BATTLE_COOLDOWN_MS
	return 0


func opponent_mix_label(opp: Dictionary) -> String:
	return str(opp.get("matchup", opp.get("mixLabel", "")))


static func defense_snapshot_to_opponent(snap: Dictionary) -> Dictionary:
	return snap.duplicate(true)


func _begin_active_opponent(opp: Dictionary) -> void:
	pending_opp = opp.duplicate(true)
	pending_battle = {}
	pending_rewards = {}
	pending_combat_id = ""
	pending_offer_id = str(opp.get("offer_id", ""))
	pending_challenge_id = ""


## Combat math / items only. Never replace the locked contender's identity
## (name, appearance, class, race, ids) with a stale combat.enemy blob.
func _merge_opponent_combat_fields(dst: Dictionary, src: Dictionary) -> void:
	if src.is_empty():
		return
	for key in ["display_stats", "stats", "equippedItems", "power"]:
		if not src.has(key):
			continue
		var value: Variant = src.get(key)
		if value == null:
			continue
		if typeof(value) == TYPE_DICTIONARY:
			dst[key] = (value as Dictionary).duplicate(true)
		elif typeof(value) == TYPE_ARRAY:
			dst[key] = (value as Array).duplicate(true)
		else:
			dst[key] = value
	for key in [
		"name", "display_name", "class", "race", "level", "appearance", "avatar_url",
		"avatar_config", "guild", "character_id", "realCharacterId", "id", "isBot",
		"is_bot", "arena_bot_id", "offer_id",
	]:
		if dst.has(key):
			var cur: Variant = dst.get(key)
			if typeof(cur) == TYPE_STRING and str(cur).strip_edges().is_empty():
				pass
			elif cur != null and str(cur) != "":
				continue
		if src.has(key) and src.get(key) != null:
			dst[key] = src.get(key)


func _ingest_prepare_result(opp: Dictionary, data: Dictionary, requested_skip: bool = false) -> void:
	pending_offer_id = str(data.get("offer_id", opp.get("offer_id", "")))
	pending_challenge_id = str(data.get("challenge_id", ""))
	pending_skipped = bool(data.get("skip_cooldown", requested_skip))
	var combat: Dictionary = data.get("combat", {}) if typeof(data.get("combat", {})) == TYPE_DICTIONARY else {}
	pending_combat_id = str(combat.get("combat_id", ""))
	_ingest_combat_payload(combat)
	if pending_opp.is_empty() or str(pending_opp.get("offer_id", "")) != str(opp.get("offer_id", "")):
		pending_opp = opp.duplicate(true)
	if typeof(data.get("opponent", null)) == TYPE_DICTIONARY:
		_merge_opponent_combat_fields(pending_opp, data["opponent"])
	if typeof(combat.get("enemy", null)) == TYPE_DICTIONARY:
		_merge_opponent_combat_fields(pending_opp, combat["enemy"])
	var player_disp: Variant = combat.get("player_display_stats", null)
	if typeof(player_disp) != TYPE_DICTIONARY and typeof(data.get("player_display_stats", null)) == TYPE_DICTIONARY:
		player_disp = data.get("player_display_stats")
	if typeof(player_disp) == TYPE_DICTIONARY:
		pending_battle["player_display_stats"] = (player_disp as Dictionary).duplicate(true)
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
	var pds: Variant = combat.get("player_display_stats", battle.get("player_display_stats", null))
	if typeof(pds) == TYPE_DICTIONARY:
		pending_battle["player_display_stats"] = (pds as Dictionary).duplicate(true)


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
			"race": str(r.get("race", "")),
			"level": int(r.get("level", 1)),
			"arena_rating": int(
				r.get("arena_rating", r.get("rating", DEFAULT_ARENA_RATING))
			),
			"matchup": str(r.get("matchup", "even")),
			"isBot": is_bot,
			"arena_bot_id": r.get("arena_bot_id", null),
			"power": int(r.get("power", 0)),
			"guild": r.get("guild", null),
			"appearance": r.get("appearance", {}),
			"equippedItems": [],
		})
	return _shuffle_board_slots(out)


## Stable per-board slot order so real operatives are not always index 0.
## Seeded from offer_ids so UI rebuilds do not jump the same three cards around.
func _shuffle_board_slots(cards: Array) -> Array:
	if cards.size() <= 1:
		return cards
	var seed := 1
	for card in cards:
		if typeof(card) != TYPE_DICTIONARY:
			continue
		var oid := str((card as Dictionary).get("offer_id", ""))
		seed = int((seed * BOARD_HASH_MULTIPLIER + oid.hash()) % BOARD_HASH_MODULUS)
		if seed <= 0:
			seed = 1
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var out: Array = cards.duplicate()
	for i in range(out.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp: Variant = out[i]
		out[i] = out[j]
		out[j] = tmp
	return out


func _now_unix_ms() -> int:
	return int(Time.get_unix_time_from_system() * MILLISECONDS_PER_SECOND)


func _iso_field(value: Variant) -> String:
	if value == null:
		return ""
	var s := str(value).strip_edges()
	if s.is_empty() or s == "<null>" or s.to_lower() == "null":
		return ""
	return s


func _parse_iso_unix(iso: String) -> int:
	## Server emits UTC ISO (`Date.toISOString`, usually `…Z`). Parsing those
	## components via `get_unix_time_from_datetime_dict` treats them as *local*
	## wall-clock and shifts board TTL by the machine offset (e.g. +4h on ET),
	## so the lobby keeps showing offer_ids the server has already retired.
	var s := _iso_field(iso)
	if s.is_empty():
		return 0
	if s.ends_with("Z") or s.ends_with("z"):
		s = s.substr(0, s.length() - 1)
	if "T" in s:
		var parts := s.split("T")
		if parts.size() >= 2:
			var time_part := parts[1]
			# Drop fractional seconds / any trailing offset we will replace.
			if "+" in time_part:
				time_part = time_part.split("+")[0]
			elif time_part.rfind("-") > 0:
				time_part = time_part.substr(0, time_part.rfind("-"))
			if "." in time_part:
				time_part = time_part.split(".")[0]
			s = "%sT%s+00:00" % [parts[0], time_part]
	var unix := int(Time.get_unix_time_from_datetime_string(s))
	return maxi(0, unix)
