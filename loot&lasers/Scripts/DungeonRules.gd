class_name DungeonRules
extends RefCounted
## Galactic Frontier presentation — unlocks, planet copy, cooldown display helpers.
## Combat, XP, Gear, and enemy identity are server-authoritative.

const ENEMIES_PER_PLANET := 10
## @deprecated Death quotas removed — independent 1h Dungeon and Wormhole cooldowns.
const DEATHS_PER_DAY := 0
## @deprecated Continue fee removed with death quotas.
const CONTINUE_COST := 0
const SKIP_COST := 25
const BATTLE_COOLDOWN_MS := 60 * 60 * 1000
## @deprecated use BATTLE_COOLDOWN_MS
const WIN_COOLDOWN_MS := BATTLE_COOLDOWN_MS
## @deprecated use BATTLE_COOLDOWN_MS
const LOSS_COOLDOWN_MS := BATTLE_COOLDOWN_MS
const WORMHOLE_ID := "wormhole"
const STATIC_PLANET_COUNT := 10
const DUNGEON_DISPLAY_ID_ONE := 1
const NEXT_DUNGEON_ID_STEP := 1
const DUNGEON_BADGE_MAX := 10
const DUNGEON_BADGE_ID_PREFIX := "D"
const HTTP_STATUS_REQUEST_TIMEOUT := 408
const HTTP_STATUS_TOO_EARLY := 425
const HTTP_STATUS_TOO_MANY_REQUESTS := 429
const HTTP_STATUS_SERVER_ERROR_MIN := 500
const HTTP_STATUS_SERVER_ERROR_MAX := 599
const SKIP_CODE_TIMEOUT := "TIMEOUT"
const SKIP_CODE_NETWORK_ERROR := "NETWORK_ERROR"
const MILLISECONDS_PER_SECOND := 1_000.0
const SECONDS_PER_MINUTE := 60
const UNLIMITED_LIVES_SENTINEL := 999

const UNLOCK_LEVELS := [0, 10, 20, 30, 40, 50, 60, 70, 90, 120, 140]

const PLANETS := [
	{"id": 1, "name": "Verdant Expanse", "icon": "earth", "boss_emoji": "bug", "color": Color(0.13, 0.77, 0.37),
		"desc": "Lush frontier world. The local fauna has teeth. Consider it a warm-up.",
		"lore": "Scout charts mark this as the soft edge of known space — until the canopy closes and the Brood answers. Every trail here was walked by something that never came back.",
		"boss": "Tharon Brood Matriarch", "names": ["Thornback", "Moss Reaver", "Canopy Stalker", "Rootmaw", "Sporekin", "Verdant Fang"]},
	{"id": 2, "name": "Ashen Reach", "icon": "house", "boss_emoji": "flame", "color": Color(0.23, 0.51, 0.96),
		"desc": "War-scarred ruins crawling with scavengers and worse. Watch the rooftops.",
		"lore": "Once a trade hub, now a bone-yard of collapsed spires. Snipers nest in the ash, and the Warden still collects tithes in blood and scrap.",
		"boss": "Warden of Ash", "names": ["Ash Runner", "Ruin Sniper", "Scrap Hound", "Cinder Guard", "Rubble Knight", "Ember Jack"]},
	{"id": 3, "name": "Shadow Veil", "icon": "skull", "boss_emoji": "skull", "color": Color(0.66, 0.33, 0.97),
		"desc": "A nebula-smuggler's paradise. Everyone here wants your stardust and your organs.",
		"lore": "Fog thick enough to hide a fleet. Deals are sealed with knives, and Captain Zyrik's flag means your cargo already belongs to someone else.",
		"boss": "Captain Zyrik", "names": ["Veilcutter", "Dust Smuggler", "Night Hook", "Black Nebula", "Quiet Blade", "Zyrik Mate"]},
	{"id": 4, "name": "Shattered Expanse", "icon": "tornado", "boss_emoji": "tornado", "color": Color(0.96, 0.62, 0.04),
		"desc": "Spacetime is more of a suggestion here. Reality bites back.",
		"lore": "Navigation logs contradict themselves. You may arrive before you left. The Riftlord feeds on those who try to make sense of the folds.",
		"boss": "The Riftlord", "names": ["Rift Tick", "Echo Twin", "Chrono Wisp", "Fracture", "Paradox Hound", "Foldling"]},
	{"id": 5, "name": "Abyssal Core", "icon": "circle-dot-dashed", "boss_emoji": "circle-dot-dashed", "color": Color(0.94, 0.27, 0.27),
		"desc": "Where stars go to die. Something down there is eating the light itself.",
		"lore": "No beacon lasts long here. Crews report the dark moving against the grain — and a hunger that learned their names from the silence.",
		"boss": "Void Devourer", "names": ["Light-Eater", "Abyss Maw", "Null Spawn", "Dark Current", "Hunger", "Umbral"]},
	{"id": 6, "name": "Frostfall Reach", "icon": "snowflake", "boss_emoji": "cuboid", "color": Color(0.02, 0.71, 0.83),
		"desc": "A frozen hellscape where the cold has learned to hunt in packs.",
		"lore": "Wind that cuts like wire. The packs don't chase heat — they herd it. The Glacial Warden keeps the ice honest, and visitors rare.",
		"boss": "Glacial Warden", "names": ["Ice Howler", "Rimeclaw", "Frost Pack", "Shard Wolf", "Glacier Kin", "Whiteout"]},
	{"id": 7, "name": "Ember Maw", "icon": "mountain", "boss_emoji": "mountain", "color": Color(0.98, 0.45, 0.09),
		"desc": "A volcanic world ruled by things that swim in magma and breathe fire.",
		"lore": "The crust is a thin lid on a living furnace. Magma lanes are roads if you can stand the heat — and the Titan that calls them home.",
		"boss": "Magma Titan", "names": ["Magma Skimmer", "Cinder Drake", "Lava Wight", "Ember Serpent", "Pyre Guard", "Scoria"]},
	{"id": 8, "name": "Void Sanctum", "icon": "circle", "boss_emoji": "circle", "color": Color(0.49, 0.23, 0.93),
		"desc": "A temple carved into a dead moon. The priests never left.",
		"lore": "Hymns still echo in vacuum. The Null King's congregation doesn't sleep — it waits for pilgrims foolish enough to pray aloud.",
		"boss": "The Null King", "names": ["Moon Acolyte", "Silent Choir", "Null Priest", "Dead Cantor", "Sanctum Shade", "Vesperite"]},
	{"id": 9, "name": "Crystal Nexus", "icon": "nova", "boss_emoji": "nova", "color": Color(0.08, 0.72, 0.65),
		"desc": "A lattice-world of living crystal that refracts your worst memories into lasers.",
		"lore": "Every facet is a mirror with an opinion. Walk carefully — the Prism Sovereign turns regret into a weapon and calls it judgment.",
		"boss": "Prism Sovereign", "names": ["Facet Wraith", "Prism Scout", "Lattice Blade", "Refractor", "Geode Knight", "Shardling"]},
	{"id": 10, "name": "World Zero", "icon": "orbit", "boss_emoji": "orbit", "color": Color(0.98, 0.75, 0.14),
		"desc": "The last mapped world of the Frontier. Clearing every standard Dungeon enemy — all 100 — opens the Wormhole.",
		"lore": "Charts end here for a reason. The Genesis is the last named lock, but the Wormhole does not open until every standard enemy on D1–D10 has fallen.",
		"boss": "The Genesis", "names": ["Proto Guard", "First Echo", "Zero Spawn", "Origin Wisp", "Seedling", "Primeform"]},
]


static func unlock_level(planet_id: int) -> int:
	if planet_id >= 1 and planet_id <= STATIC_PLANET_COUNT:
		return int(UNLOCK_LEVELS[planet_id])
	return 0


static func is_unlocked(planet_id: int, player_level: int) -> bool:
	var u := unlock_level(planet_id)
	if u <= 0:
		return true
	return maxi(1, player_level) >= u


static func wormhole_planet_id(band: int) -> int:
	return STATIC_PLANET_COUNT + maxi(DUNGEON_DISPLAY_ID_ONE, band)


## Map selection after a Frontier fight. Does not use sequential dungeon_planet.
## Loss / non-boss win stay on the fought location. Dungeon boss win advances
## to the next dungeon; D10 boss win opens the Wormhole when it is unlocked.
static func frontier_selection_after_combat(args: Dictionary) -> Dictionary:
	var viewing_wormhole := bool(args.get("viewing_wormhole", false))
	var content := str(args.get("content", "")).strip_edges()
	var wormhole_band := maxi(DUNGEON_DISPLAY_ID_ONE, as_int(args.get("wormhole_band", DUNGEON_DISPLAY_ID_ONE), DUNGEON_DISPLAY_ID_ONE))
	if viewing_wormhole or content == WORMHOLE_ID:
		return {
			"planet_id": wormhole_planet_id(wormhole_band),
			"viewing_wormhole": true,
		}
	var fought := _fought_dungeon_id(args)
	var won := bool(args.get("won", false))
	var is_boss := bool(args.get("is_boss", false))
	var track_complete := bool(args.get("track_complete", false))
	if (not won) or (not is_boss and not track_complete):
		return {
			"planet_id": fought,
			"viewing_wormhole": false,
		}
	var next_planet := fought + NEXT_DUNGEON_ID_STEP
	if next_planet > STATIC_PLANET_COUNT:
		if bool(args.get("wormhole_unlocked", false)):
			return {
				"planet_id": wormhole_planet_id(wormhole_band),
				"viewing_wormhole": true,
			}
		return {
			"planet_id": STATIC_PLANET_COUNT,
			"viewing_wormhole": false,
		}
	return {
		"planet_id": next_planet,
		"viewing_wormhole": false,
	}


static func _fought_dungeon_id(args: Dictionary) -> int:
	var from_enemy := as_int(args.get("dungeon_id", 0), 0)
	if from_enemy >= DUNGEON_DISPLAY_ID_ONE and from_enemy <= STATIC_PLANET_COUNT:
		return from_enemy
	var selected := as_int(args.get("selected_planet_id", DUNGEON_DISPLAY_ID_ONE), DUNGEON_DISPLAY_ID_ONE)
	if selected >= DUNGEON_DISPLAY_ID_ONE and selected <= STATIC_PLANET_COUNT:
		return selected
	return DUNGEON_DISPLAY_ID_ONE


static func get_planet(planet_id: int) -> Dictionary:
	if planet_id >= 1 and planet_id <= STATIC_PLANET_COUNT:
		return PLANETS[planet_id - 1].duplicate(true)
	# Wormhole / infinite depths
	var depth := maxi(1, planet_id - STATIC_PLANET_COUNT)
	var themes := [
		{"name": "Shattered", "icon": "orbit", "boss_emoji": "orbit", "boss": "The Fracture", "names": ["Shard Echo", "Broken Twin", "Fold Wraith", "Fractling"]},
		{"name": "Abyssal", "icon": "heart", "boss_emoji": "heart", "boss": "The Hollow", "names": ["Hollow Bite", "Deep Shade", "Null Maw", "Abyss Tick"]},
		{"name": "Temporal", "icon": "hourglass", "boss_emoji": "hourglass", "boss": "Chronovore", "names": ["Time Debt", "Loop Hound", "Yesterday", "Second Skin"]},
		{"name": "Celestial", "icon": "sparkles", "boss_emoji": "sparkles", "boss": "The Zenith", "names": ["Star Choir", "Nova Kin", "Zenith Spark", "Solarite"]},
	]
	var t: Dictionary = themes[(depth - 1) % themes.size()]
	return {
		"id": planet_id,
		"name": "The Wormhole · Depth %s" % depth,
		"icon": str(t.get("icon", "orbit")),
		"boss_emoji": str(t.get("boss_emoji", "orbit")),
		"color": Color(0.55, 0.35, 0.95),
		"desc": "Beyond World Zero, spacetime folds into an endless corridor. There is no last floor — only deeper.",
		"lore": "Past the Genesis lock, every depth is a new shape of the same hunger. Charts burn out. Compasses spin. The only way is through — and through never ends.",
		"boss": str(t["boss"]),
		"names": t["names"],
		"wormhole": true,
		"depth": depth,
	}


static func displayed_remaining_ms(remaining_at_sync: int, elapsed_ms: int) -> int:
	return maxi(0, remaining_at_sync - maxi(0, elapsed_ms))


static func format_ms(ms: int) -> String:
	var sec := maxi(0, int(ceil(float(ms) / MILLISECONDS_PER_SECOND)))
	var m := sec / SECONDS_PER_MINUTE
	var s := sec % SECONDS_PER_MINUTE
	return "%d:%02d" % [m, s]


static func cooldown_remaining_ms(character: Dictionary, kind: String = "dungeon") -> int:
	var blob: Variant = character.get("dungeon", {})
	if typeof(blob) == TYPE_DICTIONARY:
		var key := "wormhole_cooldown_remaining_ms" if kind == "wormhole" else "dungeon_cooldown_remaining_ms"
		if (blob as Dictionary).has(key):
			return maxi(0, int((blob as Dictionary).get(key, 0)))
	var until_key := "wormhole_cooldown_until" if kind == "wormhole" else "dungeon_cooldown_until"
	var until := str(character.get(until_key, ""))
	if until.is_empty() or until == "<null>":
		if kind == "wormhole":
			return 0
		var at := str(character.get("dungeon_cooldown_at", ""))
		var ms := _as_int(character.get("dungeon_cooldown_ms", 0))
		if at.is_empty() or ms <= 0:
			return 0
		var start_ms := _parse_iso_ms(at)
		if start_ms <= 0:
			return 0
		return maxi(
			0,
			int(start_ms + ms - Time.get_unix_time_from_system() * MILLISECONDS_PER_SECOND),
		)
	var end_ms := _parse_iso_ms(until)
	if end_ms <= 0:
		return 0
	return maxi(
		0,
		int(end_ms - Time.get_unix_time_from_system() * MILLISECONDS_PER_SECOND),
	)


static func as_int(value: Variant, fallback: int = 0) -> int:
	match typeof(value):
		TYPE_NIL:
			return fallback
		TYPE_BOOL:
			return 1 if value else 0
		TYPE_INT:
			return value
		TYPE_FLOAT:
			return int(value)
		TYPE_STRING:
			var s := str(value).strip_edges()
			if s.is_valid_int():
				return int(s)
			if s.is_valid_float():
				return int(float(s))
			return fallback
		_:
			return fallback


static func _as_int(value: Variant) -> int:
	return as_int(value, 0)


static func _parse_iso_ms(iso: String) -> float:
	# Accept unix ms string or ISO-ish; Godot Time.parse_datetime_string needs stripped Z.
	if iso.is_empty():
		return 0.0
	if iso.is_valid_float():
		return float(iso)
	var cleaned := iso.replace("Z", "").replace("z", "")
	var dict := Time.get_datetime_dict_from_datetime_string(cleaned, false)
	if dict.is_empty():
		return 0.0
	return float(Time.get_unix_time_from_datetime_dict(dict)) * MILLISECONDS_PER_SECOND


## @deprecated Death quotas removed — always returns a sentinel so continue fees never gate.
static func free_lives_left(_character: Dictionary) -> int:
	return UNLIMITED_LIVES_SENTINEL


static func badge_id_for_index(index: int) -> String:
	if index < 0 or index >= STATIC_PLANET_COUNT:
		return ""
	return "%s%s" % [DUNGEON_BADGE_ID_PREFIX, index + 1]


static func badge_ids_from_clears(clears: Variant) -> PackedStringArray:
	var out := PackedStringArray()
	if typeof(clears) != TYPE_ARRAY:
		return out
	var rows: Array = clears
	var limit := mini(STATIC_PLANET_COUNT, rows.size())
	for i in limit:
		if _as_int(rows[i]) >= ENEMIES_PER_PLANET:
			out.append(badge_id_for_index(i))
	return out


static func badge_ids_from_tracks(tracks: Variant) -> PackedStringArray:
	var out := PackedStringArray()
	if typeof(tracks) != TYPE_ARRAY:
		return out
	var rows: Array = tracks
	var limit := mini(STATIC_PLANET_COUNT, rows.size())
	for i in limit:
		var row: Variant = rows[i]
		if typeof(row) == TYPE_DICTIONARY and bool((row as Dictionary).get("complete", false)):
			out.append(badge_id_for_index(i))
	return out


## Priority: serialized dungeon_badge_ids → phase7_pve.dungeon_clears → tracks → empty.
## Never uses sequential dungeon_planet.
static func badge_ids_from_character(character: Dictionary, dungeon_view: Dictionary = {}) -> PackedStringArray:
	var view := dungeon_view
	if view.is_empty() and typeof(character.get("dungeon", null)) == TYPE_DICTIONARY:
		view = character.get("dungeon", {})
	if typeof(view) == TYPE_DICTIONARY and (view as Dictionary).has("dungeon_badge_ids"):
		return _normalize_badge_ids((view as Dictionary).get("dungeon_badge_ids", []))
	var phase7: Variant = character.get("phase7_pve", {})
	if typeof(phase7) == TYPE_DICTIONARY:
		var clears: Variant = (phase7 as Dictionary).get("dungeon_clears", null)
		if typeof(clears) == TYPE_ARRAY:
			return badge_ids_from_clears(clears)
	if typeof(view) == TYPE_DICTIONARY:
		var from_tracks := badge_ids_from_tracks((view as Dictionary).get("tracks", []))
		if not from_tracks.is_empty():
			return from_tracks
	return PackedStringArray()


static func badge_count_from_character(character: Dictionary, dungeon_view: Dictionary = {}) -> int:
	return badge_ids_from_character(character, dungeon_view).size()


static func badge_label(dungeon_display_id: int) -> String:
	var planet: Dictionary = get_planet(dungeon_display_id)
	var dungeon_name := str(planet.get("name", "Dungeon"))
	return "D%s · %s" % [dungeon_display_id, dungeon_name]


static func badge_description() -> String:
	return "Earned by completing all ten one-time enemies in this Dungeon."


static func badge_status_text(owned: int) -> String:
	return "Dungeon badges · %s/%s" % [owned, DUNGEON_BADGE_MAX]


static func badge_empty_text() -> String:
	return "No badges — complete all ten enemies in a standard Dungeon."


static func skip_request_id_should_retain(res: Dictionary) -> bool:
	if res.is_empty():
		return true
	if bool(res.get("ok", false)):
		return false
	if bool(res.get("retryable", false)):
		return true
	var status := int(res.get("status", 0))
	if status <= 0:
		return true
	var code := str(res.get("code", ""))
	if code == SKIP_CODE_TIMEOUT or code == SKIP_CODE_NETWORK_ERROR:
		return true
	if status == HTTP_STATUS_REQUEST_TIMEOUT or status == HTTP_STATUS_TOO_EARLY or status == HTTP_STATUS_TOO_MANY_REQUESTS:
		return true
	if status >= HTTP_STATUS_SERVER_ERROR_MIN and status <= HTTP_STATUS_SERVER_ERROR_MAX:
		return true
	return false


static func _normalize_badge_ids(raw: Variant) -> PackedStringArray:
	var out := PackedStringArray()
	if typeof(raw) != TYPE_ARRAY:
		return out
	var seen := {}
	for value in raw:
		var id := str(value).strip_edges().to_upper()
		if id.is_empty() or seen.has(id):
			continue
		seen[id] = true
		out.append(id)
		if out.size() >= DUNGEON_BADGE_MAX:
			break
	return out
