class_name ArenaRules
extends RefCounted
## Arena matchmaking / Elo / rewards — mirrors src/lib/arenaEngine.js (subset).

const DAILY_FREE_BATTLES := 10
const PAID_BATTLE_COST := 15
const REFRESH_MS := 5 * 60 * 1000
const REFRESH_COST := 500
const BATTLE_COOLDOWN_MS := 10 * 60 * 1000
const SKIP_COST := 1
const CHALLENGER_SLOTS := 3
const MAX_REAL_OPPONENTS := 2
const RATING_BAND := 120
const RATING_BAND_WIDE := 280
const LEVEL_BAND := 8
const HISTORY_LIMIT := 10

const ELO_K := 28
const RATING_DELTA_MIN := 6
const RATING_DELTA_MAX := 36

const BOT_NAMES: PackedStringArray = [
	"Nyx Voss", "Kade Orrin", "Vesper Quill", "Jax Riven", "Sable Tor",
	"Reed Calyx", "Mira Solen", "Orin Vex", "Talia Drift", "Hexa Wren",
	"Corin Vale", "Zeph Ardent", "Lumen Pike", "Ash Kestrel", "Rook Fen",
]

const BOT_GUILDS: PackedStringArray = [
	"Void Reapers", "Stellar Syndicate", "Crimson Nebula", "Iron Orbit",
	"Quantum Corsairs", "Solar Fang", "The Forgotten", "Stellar Guard",
	"Drift Cartel", "Star Wraiths",
]

const CLASS_WEIGHTS := {
	"Vanguard": {"strength": 1.0, "vitality": 0.5, "luck": 0.3, "agility": 0.2, "intellect": 0.2},
	"Astral Warden": {"strength": 1.0, "vitality": 0.6, "luck": 0.25, "agility": 0.15, "intellect": 0.2},
	"Shadow Operative": {"agility": 1.0, "vitality": 0.5, "luck": 0.3, "strength": 0.25, "intellect": 0.15},
	"Void Runner": {"agility": 1.0, "vitality": 0.45, "luck": 0.35, "strength": 0.2, "intellect": 0.15},
	"Technomancer": {"intellect": 1.0, "vitality": 0.5, "luck": 0.3, "strength": 0.25, "agility": 0.15},
	"Cosmic Engineer": {"intellect": 1.0, "vitality": 0.5, "luck": 0.3, "strength": 0.25, "agility": 0.15},
}

const BALANCED_SHARES := {
	"Vanguard": {"strength": 0.38, "vitality": 0.27, "luck": 0.17, "agility": 0.11, "intellect": 0.07},
	"Astral Warden": {"strength": 0.34, "vitality": 0.32, "luck": 0.17, "agility": 0.09, "intellect": 0.08},
	"Shadow Operative": {"agility": 0.38, "luck": 0.22, "vitality": 0.25, "strength": 0.08, "intellect": 0.07},
	"Void Runner": {"agility": 0.37, "luck": 0.23, "vitality": 0.25, "strength": 0.08, "intellect": 0.07},
	"Technomancer": {"intellect": 0.38, "vitality": 0.27, "luck": 0.2, "agility": 0.08, "strength": 0.07},
	"Cosmic Engineer": {"intellect": 0.37, "vitality": 0.3, "luck": 0.19, "agility": 0.08, "strength": 0.06},
}

const PRIMARY_STAT := {
	"Vanguard": "strength",
	"Astral Warden": "strength",
	"Shadow Operative": "agility",
	"Void Runner": "agility",
	"Technomancer": "intellect",
	"Cosmic Engineer": "intellect",
}

const LEGACY_CLASS := {
	"Shadowblade": "Shadow Operative",
	"Arcanist": "Technomancer",
	"Warden": "Astral Warden",
	"Gunslinger": "Void Runner",
	"Mystic": "Cosmic Engineer",
}


static func expected_player_attributes(level: int) -> int:
	return ExpectedPlayerAttributes.at(level)


static func merge_stats(character: Dictionary, items: Array = []) -> Dictionary:
	var base: Dictionary = {}
	var raw: Variant = character.get("stats", {})
	if typeof(raw) == TYPE_DICTIONARY:
		base = (raw as Dictionary).duplicate()
	else:
		base = {"strength": 0, "agility": 0, "intellect": 0, "vitality": 0, "luck": 0}
	# Match web computeTotalStats: gear on base first, then race % on the total.
	return MissionCombat.apply_race_bonus(
		MissionCombat.merge_gear_stats(base, items),
		character.get("race", null)
	)


static func compute_power(character: Dictionary, items: Array = []) -> int:
	var class_key := str(character.get("class", "Vanguard"))
	var weights: Dictionary = CLASS_WEIGHTS.get(class_key, CLASS_WEIGHTS["Vanguard"])
	var stats := merge_stats(character, items)
	var weighted := 0.0
	for k in ["strength", "agility", "intellect", "vitality", "luck"]:
		weighted += float(stats.get(k, 0)) * float(weights.get(k, 0.1))
	return int(round(float(int(character.get("level", 1))) * 10.0 + weighted * 7.5))


static func elo_expected(player_rating: float, opp_rating: float) -> float:
	return 1.0 / (1.0 + pow(10.0, (opp_rating - player_rating) / 400.0))


static func elo_rating_delta(player_rating: int, opp_rating: int, won: bool) -> int:
	var expected := elo_expected(float(player_rating), float(opp_rating))
	var raw := int(round(float(ELO_K) * ((1.0 if won else 0.0) - expected)))
	if won:
		return clampi(raw, RATING_DELTA_MIN, RATING_DELTA_MAX)
	return clampi(raw, -RATING_DELTA_MAX, -RATING_DELTA_MIN)


static func arena_xp_reward(level: int) -> int:
	return maxi(1, int(round(float(MissionBoard.xp_per_fuel(level)) * 5.0 / 7.0)))


static func arena_sd_reward(level: int) -> int:
	return StardustEconomy.arena_win_stardust(level)


static func compute_rewards(player: Dictionary, opp: Dictionary, won: bool, is_free: bool) -> Dictionary:
	var rating_delta := elo_rating_delta(
		int(player.get("arena_rating", 1000)),
		int(opp.get("arena_rating", 1000)),
		won
	)
	var xp := 0
	var sd := 0
	if is_free and won:
		var pl := int(player.get("level", 1))
		xp = arena_xp_reward(pl)
		sd = arena_sd_reward(pl)
	return {
		"won": won,
		"free": is_free,
		"experience": xp,
		"stardust": sd,
		"arena_rating_delta": rating_delta,
	}


## Pre-fight stakes preview used by challenger cards (rewards only — no risk badge).
static func preview_arena_match(player: Dictionary, opp: Dictionary, is_free: bool, _player_power: int = -1) -> Dictionary:
	var on_win := compute_rewards(player, opp, true, is_free)
	var on_loss := compute_rewards(player, opp, false, is_free)
	return {"onWin": on_win, "onLoss": on_loss}


static func allocate_attrs(total: int, shares: Dictionary, primary: String) -> Dictionary:
	var budget := maxi(0, total)
	var out := {"strength": 0, "agility": 0, "intellect": 0, "vitality": 0, "luck": 0}
	var assigned := 0
	for k in out.keys():
		var floor_v := int(floor(float(budget) * float(shares.get(k, 0))))
		out[k] = floor_v
		assigned += floor_v
	var primary_key := primary if out.has(primary) else "strength"
	out[primary_key] = int(out[primary_key]) + (budget - assigned)
	return out


static func mins_since_updated(char: Dictionary) -> int:
	var raw := str(char.get("updated_date", ""))
	if raw.is_empty():
		return 0
	var s := raw.replace("Z", "").replace("T", " ")
	if "." in s:
		s = s.get_slice(".", 0)
	var unix := Time.get_unix_time_from_datetime_string(s)
	if unix <= 0:
		return 0
	return maxi(0, int((Time.get_unix_time_from_system() - unix) / 60.0))


static func character_to_opponent(char: Dictionary, equipped: Array = [], guild_tag = null) -> Dictionary:
	var power := compute_power(char, equipped)
	var guild = null
	if guild_tag != null and str(guild_tag) != "":
		var tag := str(guild_tag)
		guild = tag if tag.begins_with("[") else "[%s]" % tag
	var appearance: Dictionary = {}
	if typeof(char.get("appearance", {})) == TYPE_DICTIONARY:
		appearance = (char.get("appearance", {}) as Dictionary).duplicate()
	return {
		"id": "real-%s" % str(char.get("id", "")),
		"realCharacterId": str(char.get("id", "")),
		"name": str(char.get("name", "Rival")),
		"race": str(char.get("race", "Human")),
		"class": str(char.get("class", "Vanguard")),
		"level": int(char.get("level", 1)),
		"arena_rating": int(char.get("arena_rating", 1000)),
		"stats": char.get("stats", {}) if typeof(char.get("stats", {})) == TYPE_DICTIONARY else {},
		"power": power,
		"arena_wins": int(char.get("arena_wins", 0)),
		"arena_losses": int(char.get("arena_losses", 0)),
		"guild": guild,
		"lastOnlineMins": mins_since_updated(char),
		"appearance": appearance,
		"avatar_url": char.get("avatar_url", null),
		"active_title": char.get("active_title", null),
		"isBot": false,
		"equippedItems": equipped,
		"speciesId": null,
		"arena_bot_id": null,
	}


## Frozen opponent payload stored on ArenaMatch for revenge rematches.
static func snapshot_opponent(opp: Dictionary) -> Dictionary:
	var equipped_items: Array = []
	var raw_eq: Variant = opp.get("equippedItems", [])
	if typeof(raw_eq) == TYPE_ARRAY:
		for it in raw_eq:
			if typeof(it) != TYPE_DICTIONARY:
				continue
			equipped_items.append({
				"id": it.get("id", null),
				"name": it.get("name", null),
				"type": it.get("type", null),
				"rarity": it.get("rarity", null),
				"stats": it.get("stats", {}),
				"level_requirement": it.get("level_requirement", null),
				"base_name": it.get("base_name", null),
				"emoji": it.get("emoji", null),
			})
	var equipped_ids: Array = []
	var raw_ids: Variant = opp.get("equippedItemIds", [])
	if typeof(raw_ids) == TYPE_ARRAY and not (raw_ids as Array).is_empty():
		for idv in raw_ids:
			if idv != null and str(idv) != "":
				equipped_ids.append(str(idv))
	else:
		for it in equipped_items:
			var iid = it.get("id", null)
			if iid != null and str(iid) != "":
				equipped_ids.append(str(iid))
	var rid = opp.get("realCharacterId", null)
	if rid != null and str(rid) == "":
		rid = null
	var bot_id = opp.get("arena_bot_id", null)
	if bot_id != null and str(bot_id) == "":
		bot_id = null
	return {
		"id": opp.get("id", null),
		"realCharacterId": rid,
		"name": opp.get("name", "Rival"),
		"race": opp.get("race", null),
		"class": opp.get("class", null),
		"level": int(opp.get("level", 1)),
		"arena_rating": int(opp.get("arena_rating", 1000)),
		"stats": opp.get("stats", {}) if typeof(opp.get("stats", {})) == TYPE_DICTIONARY else {},
		"power": int(opp.get("power", 0)),
		"arena_wins": int(opp.get("arena_wins", 0)),
		"arena_losses": int(opp.get("arena_losses", 0)),
		"guild": opp.get("guild", null),
		"appearance": opp.get("appearance", {}) if typeof(opp.get("appearance", {})) == TYPE_DICTIONARY else {},
		"avatar_url": opp.get("avatar_url", null),
		"active_title": opp.get("active_title", null),
		"isBot": bool(opp.get("isBot", true)),
		"speciesId": opp.get("speciesId", null),
		"arena_bot_id": bot_id,
		"equippedItemIds": equipped_ids,
		"equippedItems": equipped_items,
		"lastOnlineMins": int(opp.get("lastOnlineMins", 0)),
	}


static func normalize_class(class_key: String) -> String:
	if LEGACY_CLASS.has(class_key):
		return str(LEGACY_CLASS[class_key])
	if class_key in GameData.CLASSES:
		return class_key
	return "Vanguard"


static func ladder_bot_to_opponent(bot: Dictionary) -> Dictionary:
	if bot.is_empty():
		return {}
	var class_key := normalize_class(str(bot.get("class", "Vanguard")))
	var level := maxi(1, int(bot.get("level", 1)))
	var stats: Dictionary = {}
	var raw_stats: Variant = bot.get("stats", {})
	if typeof(raw_stats) == TYPE_DICTIONARY and not (raw_stats as Dictionary).is_empty():
		stats = (raw_stats as Dictionary).duplicate()
	else:
		var mult := 0.85 + randf() * 0.30
		var budget := int(round(float(expected_player_attributes(level)) * mult))
		var shares: Dictionary = BALANCED_SHARES.get(class_key, BALANCED_SHARES["Vanguard"])
		var primary: String = PRIMARY_STAT.get(class_key, "strength")
		stats = allocate_attrs(budget, shares, primary)
	var fake_char := {"level": level, "class": class_key, "stats": stats, "race": str(bot.get("race", "Synthara"))}
	var power := compute_power(fake_char, [])
	# get() returns a stored null rather than the default, so check the value.
	var bot_id := ""
	if bot.get("arena_bot_id", null) != null:
		bot_id = str(bot["arena_bot_id"])
	if bot_id.is_empty() and bot.get("id", null) != null:
		bot_id = str(bot["id"])
	return {
		"id": bot_id,
		"arena_bot_id": bot_id,
		"realCharacterId": null,
		"name": str(bot.get("name", "Arena Bot")),
		"race": str(bot.get("race", "Synthara")),
		"class": class_key,
		"level": level,
		"arena_rating": int(bot.get("arena_rating", 1000)),
		"stats": stats,
		"power": power,
		"arena_wins": int(bot.get("arena_wins", 0)),
		"arena_losses": int(bot.get("arena_losses", 0)),
		"guild": bot.get("guild", null),
		"lastOnlineMins": int(bot.get("lastOnlineMins", randi() % 180)),
		"isBot": true,
		"equippedItems": [],
		"speciesId": int(bot.get("speciesId", ((str(bot.get("name", "A")).unicode_at(0) % 30) + 1))),
	}


static func generate_ephemeral_bots(character: Dictionary, count: int) -> Array:
	var out: Array = []
	var my_level := maxi(1, int(character.get("level", 1)))
	var my_rating := int(character.get("arena_rating", 1000))
	var used := {}
	for i in range(maxi(0, count)):
		var class_key: String = GameData.CLASSES[randi() % GameData.CLASSES.size()]
		var level := maxi(1, my_level + randi_range(-5, 5))
		var mult := 0.85 + randf() * 0.30
		var budget := int(round(float(expected_player_attributes(level)) * mult))
		var shares: Dictionary = BALANCED_SHARES.get(class_key, BALANCED_SHARES["Vanguard"])
		var primary: String = PRIMARY_STAT.get(class_key, "strength")
		var stats := allocate_attrs(budget, shares, primary)
		var rating := maxi(0, my_rating + randi_range(-40, 40))
		var name := BOT_NAMES[randi() % BOT_NAMES.size()]
		var guard := 0
		while used.has(name) and guard < 20:
			name = BOT_NAMES[randi() % BOT_NAMES.size()]
			guard += 1
		used[name] = true
		var race: String = GameData.RACES[randi() % GameData.RACES.size()]
		var fake := {"level": level, "class": class_key, "stats": stats, "race": race}
		out.append({
			"id": "bot-%s-%s-%s" % [Time.get_ticks_usec(), i, randi()],
			"arena_bot_id": null,
			"realCharacterId": null,
			"name": name,
			"race": race,
			"class": class_key,
			"level": level,
			"arena_rating": rating,
			"stats": stats,
			"power": compute_power(fake, []),
			"arena_wins": maxi(0, rating / 4 + randi_range(0, 20)),
			"arena_losses": randi_range(0, 40),
			"guild": BOT_GUILDS[randi() % BOT_GUILDS.size()] if randf() < 0.6 else null,
			"lastOnlineMins": randi() % (60 * 24 * 3),
			"isBot": true,
			"equippedItems": [],
			"speciesId": (i * 7 + name.unicode_at(0)) % 30 + 1,
		})
	return out


static func score_candidate(player: Dictionary, candidate: Dictionary) -> float:
	var rating_gap := absf(float(int(candidate.get("arena_rating", 1000)) - int(player.get("arena_rating", 1000))))
	var level_gap := absf(float(int(candidate.get("level", 1)) - int(player.get("level", 1))))
	return rating_gap + level_gap * 28.0


static func rank_candidates(player: Dictionary, candidates: Array) -> Array:
	var my_level := int(player.get("level", 1))
	var my_rating := int(player.get("arena_rating", 1000))
	var eligible: Array = []
	for c in candidates:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		if abs(int(c.get("level", 1)) - my_level) <= LEVEL_BAND:
			eligible.append(c)
	eligible.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return score_candidate(player, a) < score_candidate(player, b)
	)
	var tight: Array = []
	var wide: Array = []
	var rest: Array = []
	for c in eligible:
		var gap: int = absi(int(c.get("arena_rating", 1000)) - my_rating)
		if gap <= RATING_BAND:
			tight.append(c)
		elif gap <= RATING_BAND_WIDE:
			wide.append(c)
		else:
			rest.append(c)
	return tight + wide + rest


static func pick_ranked(ranked: Array, count: int) -> Array:
	var pool: Array = ranked.duplicate()
	var out: Array = []
	while out.size() < count and pool.size() > 0:
		var band_size := mini(5, pool.size())
		var band: Array = pool.slice(0, band_size)
		var total_w := 0.0
		var weights: Array = []
		for i in range(band.size()):
			var w := float(band.size() - i)
			weights.append(w)
			total_w += w
		var roll := randf() * total_w
		var idx := 0
		for i in range(weights.size()):
			roll -= float(weights[i])
			if roll <= 0.0:
				idx = i
				break
		var chosen: Dictionary = band[idx]
		out.append(chosen)
		pool.erase(chosen)
	return out


static func format_ms(ms: int) -> String:
	var s := maxi(0, ms / 1000)
	return "%d:%02d" % [s / 60, s % 60]


static func format_eta_short(ms: int) -> String:
	var s := maxi(0, ms / 1000)
	var h := s / 3600
	var m := (s % 3600) / 60
	if h > 0:
		return "%dh %dm" % [h, m]
	if m > 0:
		return "%dm" % m
	return "<1m"


static func ms_until_et_midnight() -> int:
	## Prefer ProgressManager server sync; local fallback only when unsynced.
	if ProgressManager != null and not ProgressManager.last_time_payload.is_empty():
		return ProgressManager.ms_until_daily_reset_display()
	return ms_until_et_midnight_local_fallback()


static func ms_until_et_midnight_local_fallback() -> int:
	## Approximate Eastern as UTC-4 (EDT). Lobby-only ETA when /api/time/now unavailable.
	var unix := int(Time.get_unix_time_from_system())
	var et := unix - 4 * 3600
	var day_sec := posmod(et, 86400)
	return (86400 - day_sec) * 1000


static func resolve_opp_items(opp: Dictionary) -> Array:
	var items: Variant = opp.get("equippedItems", [])
	if typeof(items) == TYPE_ARRAY:
		return items
	return []
