extends Node
## Arena lobby state — opponents, free battles, cooldown, finish settlement.

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


func _ready() -> void:
	print("[ArenaManager] ready")


func load_history(character_id: String = "") -> Array:
	var cid := character_id if not character_id.is_empty() else str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		match_history = []
		return match_history
	var res: Dictionary = await ApiClient.request(
		"POST",
		"/api/entities/ArenaMatch/filter",
		{"query": {"character_id": cid}, "sort": "-created_date", "limit": ArenaRules.HISTORY_LIMIT},
		true
	)
	if res.ok and typeof(res.data) == TYPE_ARRAY:
		match_history = res.data
	else:
		match_history = []
	return match_history


func record_match(opp: Dictionary, won: bool, rating_delta: int, rating_after = null, is_defense: bool = false) -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty() or opp.is_empty():
		return {"ok": false, "error": "Missing character or opponent"}
	var rid = opp.get("realCharacterId", null)
	if rid != null and str(rid) == "":
		rid = null
	var bot_id = opp.get("arena_bot_id", null)
	if bot_id != null and str(bot_id) == "":
		bot_id = null
	var body := {
		"character_id": cid,
		"opponent_real_id": rid,
		"opponent_name": str(opp.get("name", "Rival")),
		"opponent_is_bot": bool(opp.get("isBot", true)),
		"opponent_level": int(opp.get("level", 1)),
		"opponent_rating": int(opp.get("arena_rating", 1000)),
		"opponent_power": int(opp.get("power", 0)),
		"opponent_class": str(opp.get("class", "")),
		"opponent_race": str(opp.get("race", "")),
		"opponent_guild": opp.get("guild", null),
		"won": won,
		"rating_delta": rating_delta,
		"rating_after": rating_after,
		"is_defense": is_defense,
		"arena_bot_id": bot_id,
		"opponent_snapshot": ArenaRules.snapshot_opponent(opp),
	}
	var create_res: Dictionary = await ApiClient.request("POST", "/api/entities/ArenaMatch", body, true)
	if not create_res.ok:
		return create_res

	# Prune excess rows beyond HISTORY_LIMIT (same as web).
	var all_res: Dictionary = await ApiClient.request(
		"POST",
		"/api/entities/ArenaMatch/filter",
		{"query": {"character_id": cid}, "sort": "-created_date", "limit": ArenaRules.HISTORY_LIMIT + 20},
		true
	)
	if all_res.ok and typeof(all_res.data) == TYPE_ARRAY:
		var all: Array = all_res.data
		if all.size() > ArenaRules.HISTORY_LIMIT:
			for i in range(ArenaRules.HISTORY_LIMIT, all.size()):
				var old: Variant = all[i]
				if typeof(old) != TYPE_DICTIONARY:
					continue
				var oid := str(old.get("id", ""))
				if oid.is_empty():
					continue
				await ApiClient.request("DELETE", "/api/entities/ArenaMatch/%s" % oid.uri_encode(), null, true)

	await load_history(cid)
	return create_res


## Rebuild opponent for revenge: live Character when real & available, else snapshot.
func resolve_revenge_opponent(match: Dictionary) -> Dictionary:
	var snap: Variant = match.get("opponent_snapshot", null)
	if typeof(snap) != TYPE_DICTIONARY or (snap as Dictionary).is_empty():
		return {}

	var real_id := ""
	if match.get("opponent_real_id", null) != null:
		real_id = str(match["opponent_real_id"]).strip_edges()
	if not real_id.is_empty() and real_id != "null" and real_id != "<null>":
		var char_res: Dictionary = await AuthManager.get_character(real_id)
		if char_res.ok and typeof(char_res.data) == TYPE_DICTIONARY:
			var eq: Array = await fetch_equipped_for(real_id)
			return ArenaRules.character_to_opponent(char_res.data, eq)

	var snap_d: Dictionary = (snap as Dictionary).duplicate(true)
	var equipped: Array = []
	var raw_eq: Variant = snap_d.get("equippedItems", [])
	if typeof(raw_eq) == TYPE_ARRAY:
		equipped = raw_eq
	snap_d["equippedItems"] = equipped
	var mid := str(match.get("id", Time.get_ticks_usec()))
	if bool(snap_d.get("isBot", true)):
		snap_d["id"] = "revenge-bot-%s" % mid
	else:
		var sid := str(snap_d.get("id", ""))
		snap_d["id"] = sid if not sid.is_empty() else "revenge-%s" % mid
	var bot_id = snap_d.get("arena_bot_id", null)
	if bot_id == null or str(bot_id) == "":
		bot_id = match.get("arena_bot_id", null)
	if bot_id != null and str(bot_id) == "":
		bot_id = null
	snap_d["arena_bot_id"] = bot_id
	return snap_d


func prepare_revenge(match: Dictionary) -> Dictionary:
	var opp: Dictionary = await resolve_revenge_opponent(match)
	if opp.is_empty():
		return {"ok": false, "error": "Cannot rematch — missing opponent snapshot"}
	# Same as web: auto-skip cooldown when revenging.
	return await prepare_challenge(opp, cooldown_active())


func process_bot_raids(max_raids: int = 2) -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return {"ok": false, "raids": []}
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/arena/bots/raids",
		{"characterId": cid, "max": max_raids},
		true
	)
	if not res.ok:
		return {"ok": false, "raids": [], "error": str(res.get("error", ""))}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
	var raids: Array = data.get("raids", []) if typeof(data.get("raids", [])) == TYPE_ARRAY else []
	return {"ok": true, "raids": raids, "data": data}


func sync_day() -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("SyncArenaDay", {})
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var patch: Variant = res.data.get("patch", {})
		if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
			GameManager.active_character.merge(patch, true)
		var ch: Variant = res.data.get("character", {})
		if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
			GameManager.active_character = ch
		free_battles_left = int(GameManager.active_character.get(
			"arena_attempts_left",
			res.data.get("arena_attempts_left", ArenaRules.DAILY_FREE_BATTLES)
		))
	return res


func refresh_character() -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		return {"ok": false, "error": "No active character"}
	var res: Dictionary = await AuthManager.get_character(cid)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		GameManager.active_character = res.data
	return res


func load_equipped() -> Array:
	var items_res: Dictionary = await AuthManager.list_items()
	equipped_items = []
	if items_res.ok and typeof(items_res.data) == TYPE_ARRAY:
		for it in items_res.data:
			if typeof(it) == TYPE_DICTIONARY and bool(it.get("is_equipped", false)):
				equipped_items.append(it)
	return equipped_items


func list_ladder_bots(limit: int = 8) -> Array:
	var cid := str(GameManager.active_character.get("id", ""))
	var path := "/api/arena/bots?limit=%s" % limit
	if not cid.is_empty():
		path += "&characterId=%s" % cid.uri_encode()
	var res: Dictionary = await ApiClient.request("GET", path, null, true)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var bots: Variant = res.data.get("bots", [])
		if typeof(bots) == TYPE_ARRAY:
			return bots
	return []


func list_rated_characters(limit: int = 80) -> Array:
	var res: Dictionary = await ApiClient.request(
		"GET",
		"/api/entities/Character?sort=-arena_rating&limit=%s" % limit,
		null,
		true
	)
	if res.ok and typeof(res.data) == TYPE_ARRAY:
		return res.data
	return []


func fetch_equipped_for(character_id: String) -> Array:
	if character_id.is_empty():
		return []
	var res: Dictionary = await ApiClient.request(
		"POST",
		"/api/entities/Item/filter",
		{"query": {"character_id": character_id, "is_equipped": true}, "sort": "-created_date", "limit": 40},
		true
	)
	if res.ok and typeof(res.data) == TYPE_ARRAY:
		return res.data
	return []


func build_opponent_pool(exclude_ids: Array = []) -> Array:
	await refresh_character()
	await load_equipped()
	var char: Dictionary = GameManager.active_character
	var my_id := str(char.get("id", ""))
	var my_owner := str(char.get("created_by_id", str(AuthManager.user.get("id", ""))))
	var exclude := {}
	for eid in exclude_ids:
		exclude[str(eid)] = true

	var all_chars: Array = await list_rated_characters(80)
	var candidates: Array = []
	for c in all_chars:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cid := str(c.get("id", ""))
		if cid.is_empty() or cid == my_id or exclude.has(cid):
			continue
		var owner := str(c.get("created_by_id", ""))
		if not my_owner.is_empty() and owner == my_owner:
			continue
		candidates.append(c)

	var ranked: Array = ArenaRules.rank_candidates(char, candidates)
	# Pull a wider ranked band so the 2nd/3rd real slots stay fair after RNG pick.
	var picked: Array = ArenaRules.pick_ranked(ranked, maxi(5, ArenaRules.CHALLENGER_SLOTS))
	var real: Array = []
	var max_real: int = ArenaRules.MAX_REAL_OPPONENTS
	if picked.size() >= 3:
		var third: Dictionary = picked[2]
		var third_gap: int = absi(int(third.get("arena_rating", 1000)) - int(char.get("arena_rating", 1000)))
		if third_gap <= ArenaRules.RATING_BAND_WIDE:
			max_real = 3
	for i in range(mini(max_real, picked.size())):
		var c: Dictionary = picked[i]
		var eq: Array = await fetch_equipped_for(str(c.get("id", "")))
		real.append(ArenaRules.character_to_opponent(c, eq))

	var need_bots: int = maxi(0, ArenaRules.CHALLENGER_SLOTS - real.size())
	var bots: Array = []
	var used_bot_ids := {}
	if need_bots > 0:
		var ladder: Array = await list_ladder_bots(need_bots + 4)
		for b in ladder:
			if bots.size() >= need_bots:
				break
			if typeof(b) != TYPE_DICTIONARY:
				continue
			var opp: Dictionary = ArenaRules.ladder_bot_to_opponent(b)
			if opp.is_empty():
				continue
			var bid := _clean_id(opp.get("arena_bot_id", null))
			if bid.is_empty():
				bid = _clean_id(opp.get("id", null))
			if bid.is_empty() or used_bot_ids.has(bid):
				continue
			used_bot_ids[bid] = true
			bots.append(opp)
		if bots.size() < need_bots:
			for ephemeral in ArenaRules.generate_ephemeral_bots(char, need_bots - bots.size()):
				if typeof(ephemeral) != TYPE_DICTIONARY:
					continue
				bots.append(ephemeral)

	var pool: Array = _dedupe_opponents(real + bots)
	# Always present a full challenger board when possible. The attempt cap keeps
	# this bounded even if generated fillers ever collide on identity.
	var attempts := 0
	while pool.size() < ArenaRules.CHALLENGER_SLOTS and attempts < ArenaRules.CHALLENGER_SLOTS * 4:
		attempts += 1
		var filler: Array = ArenaRules.generate_ephemeral_bots(char, 1)
		if filler.is_empty():
			break
		pool.append(filler[0])
		pool = _dedupe_opponents(pool)
	pool.shuffle()
	if pool.size() > ArenaRules.CHALLENGER_SLOTS:
		pool = pool.slice(0, ArenaRules.CHALLENGER_SLOTS)
	opponents = pool
	return opponents


func opponent_mix_label() -> String:
	var real_n := 0
	var bot_n := 0
	for o in opponents:
		if typeof(o) != TYPE_DICTIONARY:
			continue
		if bool(o.get("isBot", true)):
			bot_n += 1
		else:
			real_n += 1
	return "%s player%s · %s bot%s" % [
		str(real_n),
		"" if real_n == 1 else "s",
		str(bot_n),
		"" if bot_n == 1 else "s",
	]


func _dedupe_opponents(pool: Array) -> Array:
	var seen := {}
	var out: Array = []
	for i in range(pool.size()):
		var o: Variant = pool[i]
		if typeof(o) != TYPE_DICTIONARY:
			continue
		var key := _opponent_key(o, i)
		if seen.has(key):
			continue
		seen[key] = true
		out.append(o)
	return out


## Stable identity for an opponent. Ephemeral bots carry a null arena_bot_id,
## so fall back through id and finally position to keep them distinct.
func _opponent_key(o: Dictionary, index: int) -> String:
	var rid := _clean_id(o.get("realCharacterId", null))
	if not rid.is_empty():
		return "real-%s" % rid
	var bid := _clean_id(o.get("arena_bot_id", null))
	if not bid.is_empty():
		return "bot-%s" % bid
	var oid := _clean_id(o.get("id", null))
	if not oid.is_empty():
		return "opp-%s" % oid
	return "idx-%d" % index


func _clean_id(value: Variant) -> String:
	if value == null:
		return ""
	var s := str(value).strip_edges()
	if s == "<null>" or s == "null":
		return ""
	return s


func can_free_refresh() -> bool:
	return _now_unix_ms() >= refresh_at_unix_ms


func refresh_remaining_ms() -> int:
	return maxi(0, refresh_at_unix_ms - _now_unix_ms())


func mark_refresh_used() -> void:
	refresh_at_unix_ms = _now_unix_ms() + ArenaRules.REFRESH_MS


func refresh_opponents(charge: bool = false) -> Dictionary:
	if charge:
		var res: Dictionary = await ApiClient.invoke("RefreshArenaOpponents", {"charge": true})
		if not res.ok:
			return res
		if typeof(res.data) == TYPE_DICTIONARY:
			var patch: Variant = res.data.get("patch", {})
			if typeof(patch) == TYPE_DICTIONARY:
				GameManager.active_character.merge(patch, true)
			var ch: Variant = res.data.get("character", {})
			if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
				GameManager.active_character = ch
	await build_opponent_pool()
	mark_refresh_used()
	return {"ok": true, "opponents": opponents}


func cooldown_ends_unix_ms() -> int:
	var raw := str(GameManager.active_character.get("arena_cooldown_at", ""))
	if raw.is_empty():
		return 0
	var base := _parse_iso_unix(raw)
	if base <= 0:
		return 0
	return base * 1000 + ArenaRules.BATTLE_COOLDOWN_MS


func cooldown_active() -> bool:
	return _now_unix_ms() < cooldown_ends_unix_ms()


func cooldown_remaining_ms() -> int:
	return maxi(0, cooldown_ends_unix_ms() - _now_unix_ms())


func _now_unix_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)


func prepare_challenge(opp: Dictionary, skip_cooldown: bool = false) -> Dictionary:
	if cooldown_active() and not skip_cooldown:
		return {"ok": false, "error": "Battle cooldown active"}
	if equipped_items.is_empty():
		await load_equipped()
	var is_free := free_battles_left > 0
	var total_cost := (ArenaRules.SKIP_COST if skip_cooldown else 0) + (0 if is_free else ArenaRules.PAID_BATTLE_COST)
	var nova := int(GameManager.active_character.get("nova_crystals", 0))
	if total_cost > 0 and nova < total_cost:
		return {"ok": false, "error": "Need %s Nova Crystals" % total_cost}

	var opp_items: Array = ArenaRules.resolve_opp_items(opp)
	pending_opp = opp.duplicate(true)
	pending_challenge_id = str(opp.get("challengeId", ""))
	pending_policy_version = str(opp.get("policyVersion", ""))
	pending_battle = MissionCombat.simulate_battle(
		GameManager.active_character,
		opp,
		equipped_items,
		opp_items
	)
	var won := str(pending_battle.get("winner", "opponent")) == "player"
	pending_is_free = is_free
	pending_skipped = skip_cooldown
	pending_rewards = ArenaRules.compute_rewards(GameManager.active_character, opp, won, is_free)
	return {
		"ok": true,
		"opp": pending_opp,
		"battle": pending_battle,
		"rewards": pending_rewards,
		"is_free": is_free,
		"skipped": skip_cooldown,
	}


## Leaderboard direct challenge — preview then create server challenge.
func start_direct_challenge(opponent_character_id: String) -> Dictionary:
	var me := str(GameManager.active_character.get("id", ""))
	if me.is_empty() or opponent_character_id.is_empty():
		return {"ok": false, "error": "Missing characters"}
	if me == opponent_character_id:
		return {"ok": false, "error": "Cannot challenge yourself"}
	var preview: Dictionary = await ApiClient.request(
		"POST", "/api/arena/challenges/preview",
		{
			"challengerCharacterId": me,
			"opponentCharacterId": opponent_character_id,
			"challengeType": "leaderboard_direct",
		},
		true
	)
	if not preview.ok:
		return {"ok": false, "error": str(preview.get("error", "Preview failed")), "data": preview.data}
	var pdata: Dictionary = preview.data if typeof(preview.data) == TYPE_DICTIONARY else {}
	if pdata.get("challengeAllowed") == false:
		return {
			"ok": false,
			"error": str(pdata.get("error", pdata.get("reasonCode", "Challenge not allowed"))),
			"data": pdata,
		}
	var idem := "lb-%s-%s-%s" % [me, Time.get_ticks_msec(), randi()]
	var created: Dictionary = await ApiClient.request(
		"POST", "/api/arena/challenges",
		{
			"challengerCharacterId": me,
			"opponentCharacterId": opponent_character_id,
			"idempotencyKey": idem,
			"challengeType": "leaderboard_direct",
		},
		true
	)
	if not created.ok:
		return {"ok": false, "error": str(created.get("error", "Create challenge failed")), "data": created.data}
	var cdata: Dictionary = created.data if typeof(created.data) == TYPE_DICTIONARY else {}
	var snap: Dictionary = cdata.get("defenseSnapshot", {}) if typeof(cdata.get("defenseSnapshot", {})) == TYPE_DICTIONARY else {}
	var opp := defense_snapshot_to_opponent(snap, cdata)
	var prep := await prepare_challenge(opp, false)
	if not prep.get("ok", false):
		return prep
	pending_challenge_id = str(cdata.get("challengeId", ""))
	pending_policy_version = str(cdata.get("policyVersion", ""))
	pending_opp["challengeId"] = pending_challenge_id
	pending_opp["policyVersion"] = pending_policy_version
	return {
		"ok": true,
		"preview": pdata,
		"challenge": cdata,
		"opp": pending_opp,
		"battle": pending_battle,
		"rewards": pending_rewards,
		"warningCode": cdata.get("warningCode", pdata.get("warningCode", null)),
	}


static func defense_snapshot_to_opponent(snap: Dictionary, challenge: Dictionary = {}) -> Dictionary:
	var cid := str(snap.get("characterId", ""))
	var items: Array = snap.get("equippedItems", []) if typeof(snap.get("equippedItems", [])) == TYPE_ARRAY else []
	return {
		"id": "real-%s" % cid,
		"realCharacterId": cid,
		"name": str(snap.get("name", "Rival")),
		"race": str(snap.get("race", "")),
		"class": str(snap.get("class", "")),
		"level": int(snap.get("level", 1)),
		"arena_rating": int(snap.get("arena_rating", 1000)),
		"arena_wins": int(snap.get("arena_wins", 0)),
		"arena_losses": int(snap.get("arena_losses", 0)),
		"stats": snap.get("stats", {}) if typeof(snap.get("stats", {})) == TYPE_DICTIONARY else {},
		"appearance": snap.get("appearance", {}) if typeof(snap.get("appearance", {})) == TYPE_DICTIONARY else {},
		"active_title": str(snap.get("active_title", "")),
		"equippedItems": items,
		"isBot": false,
		"directChallenge": true,
		"challengeId": str(challenge.get("challengeId", "")),
		"policyVersion": str(challenge.get("policyVersion", "")),
	}


func finish_battle() -> Dictionary:
	if pending_battle.is_empty() or pending_opp.is_empty():
		return {"ok": false, "error": "No pending arena battle"}
	var won := bool(pending_rewards.get("won", false))
	var max_hit := 0
	var events: Variant = pending_battle.get("events", [])
	if typeof(events) == TYPE_ARRAY:
		for e in events:
			if typeof(e) != TYPE_DICTIONARY:
				continue
			if str(e.get("attacker", "")) == "player":
				max_hit = maxi(max_hit, int(e.get("damage", 0)))

	var opp := pending_opp
	var opp_id = opp.get("realCharacterId", null)
	if opp_id == null or str(opp_id) == "":
		opp_id = opp.get("id", null)
	var bot_id = opp.get("arena_bot_id", null)
	if bot_id != null and str(bot_id) == "":
		bot_id = null

	var body := {
		"won": won,
		"is_free": pending_is_free,
		"skipped": pending_skipped,
		"skip_cooldown": pending_skipped,
		"opponent": {
			"arena_rating": int(opp.get("arena_rating", 1000)),
			"id": opp_id,
			"speciesId": opp.get("speciesId", null),
			"isBot": bool(opp.get("isBot", true)),
			"arena_bot_id": bot_id,
		},
		"max_hit": max_hit,
		"species_id": opp.get("speciesId", null),
	}
	if not pending_challenge_id.is_empty():
		body["challenge_id"] = pending_challenge_id
		body["challengeId"] = pending_challenge_id
	if not pending_policy_version.is_empty():
		body["policyVersion"] = pending_policy_version
	var res: Dictionary = await ApiClient.invoke("FinishArenaBattle", body)
	if not res.ok:
		# Keep pending_* so the player can retry Settle.
		await refresh_character()
		free_battles_left = int(GameManager.active_character.get("arena_attempts_left", free_battles_left))
		var err := str(res.get("error", "Settle failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		return {"ok": false, "error": err, "status": res.get("status", 0)}

	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY:
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
	if pending_is_free:
		free_battles_left = maxi(0, free_battles_left - 1)
	free_battles_left = int(GameManager.active_character.get("arena_attempts_left", free_battles_left))

	var server_rewards: Variant = data.get("rewards", pending_rewards)
	var rewards_dict: Dictionary = server_rewards if typeof(server_rewards) == TYPE_DICTIONARY else pending_rewards.duplicate(true)
	# Prefer server XP/SD; keep client Elo preview if server omitted delta.
	if not rewards_dict.has("arena_rating_delta") and pending_rewards.has("arena_rating_delta"):
		rewards_dict["arena_rating_delta"] = pending_rewards["arena_rating_delta"]
	if not rewards_dict.has("free"):
		rewards_dict["free"] = pending_is_free

	last_result = {
		"won": won,
		"opp": opp.duplicate(true),
		"rewards": rewards_dict,
		"client_rewards": pending_rewards.duplicate(true),
		"character": GameManager.active_character.duplicate(true),
		"nova_spent": int(data.get("nova_spent", 0)),
		"is_free": bool(data.get("is_free", pending_is_free)),
	}

	var rating_delta := int(rewards_dict.get("arena_rating_delta", pending_rewards.get("arena_rating_delta", 0)))
	var rating_after = GameManager.active_character.get("arena_rating", null)
	await record_match(opp, won, rating_delta, rating_after, false)
	if won:
		await SocialManager.contribute_arena_win()

	var exclude_ids: Array = []
	var rid = opp.get("realCharacterId", null)
	if rid != null and str(rid) != "":
		exclude_ids.append(str(rid))
	await build_opponent_pool(exclude_ids)

	_clear_pending()
	return {"ok": true, "data": data, "result": last_result}


func _clear_pending() -> void:
	pending_opp = {}
	pending_battle = {}
	pending_rewards = {}
	pending_is_free = true
	pending_skipped = false
	pending_challenge_id = ""
	pending_policy_version = ""


func _parse_iso_unix(iso: String) -> int:
	var s := iso.strip_edges()
	if s.is_empty():
		return 0
	s = s.replace("Z", "")
	if "T" in s:
		var parts := s.split("T")
		if parts.size() >= 2:
			var time_part := parts[1]
			if "." in time_part:
				time_part = time_part.split(".")[0]
			s = "%sT%s" % [parts[0], time_part]
	return int(Time.get_unix_time_from_datetime_string(s))
