class_name DungeonRules
extends RefCounted
## Galactic Frontier — mirrors dungeonEngine.js / dungeonData.js (client sim + gates).

const ENEMIES_PER_PLANET := 10
const DEATHS_PER_DAY := 3
const CONTINUE_COST := 5
const SKIP_COST := 10
const WIN_COOLDOWN_MS := 10 * 60 * 1000
const LOSS_COOLDOWN_MS := 25 * 60 * 1000
const PATROL_REWARD_MULT := 0.4
const WORMHOLE_ID := "wormhole"

const UNLOCK_LEVELS := [0, 10, 20, 30, 40, 50, 60, 70, 90, 120, 140]

const ENEMY_LEVELS := [
	[],
	[10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
	[20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
	[30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
	[40, 42, 43, 45, 46, 48, 49, 51, 52, 54],
	[55, 57, 58, 60, 61, 63, 64, 66, 67, 69],
	[70, 72, 74, 76, 78, 80, 82, 84, 86, 88],
	[90, 93, 95, 98, 100, 103, 105, 108, 110, 113],
	[115, 118, 120, 123, 125, 128, 130, 133, 135, 138],
	[140, 143, 146, 149, 152, 155, 158, 161, 164, 167],
	[170, 173, 177, 180, 183, 187, 190, 193, 197, 200],
]

const LEVEL_OFFSETS := [0, 3, 7, 10, 13, 17, 20, 23, 27, 30]

const PLANETS := [
	{"id": 1, "name": "Verdant Expanse", "icon": "🌍", "boss_emoji": "👾", "color": Color(0.13, 0.77, 0.37),
		"desc": "Lush frontier world. The local fauna has teeth. Consider it a warm-up.",
		"lore": "Scout charts mark this as the soft edge of known space — until the canopy closes and the Brood answers. Every trail here was walked by something that never came back.",
		"ship_mod": "Plasma Drive",
		"boss": "Tharon Brood Matriarch", "names": ["Thornback", "Moss Reaver", "Canopy Stalker", "Rootmaw", "Sporekin", "Verdant Fang"]},
	{"id": 2, "name": "Ashen Reach", "icon": "🏚️", "boss_emoji": "🔥", "color": Color(0.23, 0.51, 0.96),
		"desc": "War-scarred ruins crawling with scavengers and worse. Watch the rooftops.",
		"lore": "Once a trade hub, now a bone-yard of collapsed spires. Snipers nest in the ash, and the Warden still collects tithes in blood and scrap.",
		"ship_mod": "Warp Coil",
		"boss": "Warden of Ash", "names": ["Ash Runner", "Ruin Sniper", "Scrap Hound", "Cinder Guard", "Rubble Knight", "Ember Jack"]},
	{"id": 3, "name": "Shadow Veil", "icon": "🏴‍☠️", "boss_emoji": "💀", "color": Color(0.66, 0.33, 0.97),
		"desc": "A nebula-smuggler's paradise. Everyone here wants your stardust and your organs.",
		"lore": "Fog thick enough to hide a fleet. Deals are sealed with knives, and Captain Zyrik's flag means your cargo already belongs to someone else.",
		"ship_mod": "Phase Shift",
		"boss": "Captain Zyrik", "names": ["Veilcutter", "Dust Smuggler", "Night Hook", "Black Nebula", "Quiet Blade", "Zyrik Mate"]},
	{"id": 4, "name": "Shattered Expanse", "icon": "🌀", "boss_emoji": "🌀", "color": Color(0.96, 0.62, 0.04),
		"desc": "Spacetime is more of a suggestion here. Reality bites back.",
		"lore": "Navigation logs contradict themselves. You may arrive before you left. The Riftlord feeds on those who try to make sense of the folds.",
		"ship_mod": "Singularity Engine",
		"boss": "The Riftlord", "names": ["Rift Tick", "Echo Twin", "Chrono Wisp", "Fracture", "Paradox Hound", "Foldling"]},
	{"id": 5, "name": "Abyssal Core", "icon": "🕳️", "boss_emoji": "🕳️", "color": Color(0.94, 0.27, 0.27),
		"desc": "Where stars go to die. Something down there is eating the light itself.",
		"lore": "No beacon lasts long here. Crews report the dark moving against the grain — and a hunger that learned their names from the silence.",
		"ship_mod": "Void Sail",
		"boss": "Void Devourer", "names": ["Light-Eater", "Abyss Maw", "Null Spawn", "Dark Current", "Hunger", "Umbral"]},
	{"id": 6, "name": "Frostfall Reach", "icon": "❄️", "boss_emoji": "🧊", "color": Color(0.02, 0.71, 0.83),
		"desc": "A frozen hellscape where the cold has learned to hunt in packs.",
		"lore": "Wind that cuts like wire. The packs don't chase heat — they herd it. The Glacial Warden keeps the ice honest, and visitors rare.",
		"ship_mod": "Cryo Thruster",
		"boss": "Glacial Warden", "names": ["Ice Howler", "Rimeclaw", "Frost Pack", "Shard Wolf", "Glacier Kin", "Whiteout"]},
	{"id": 7, "name": "Ember Maw", "icon": "🌋", "boss_emoji": "🌋", "color": Color(0.98, 0.45, 0.09),
		"desc": "A volcanic world ruled by things that swim in magma and breathe fire.",
		"lore": "The crust is a thin lid on a living furnace. Magma lanes are roads if you can stand the heat — and the Titan that calls them home.",
		"ship_mod": "Solar Booster",
		"boss": "Magma Titan", "names": ["Magma Skimmer", "Cinder Drake", "Lava Wight", "Ember Serpent", "Pyre Guard", "Scoria"]},
	{"id": 8, "name": "Void Sanctum", "icon": "🌑", "boss_emoji": "🌑", "color": Color(0.49, 0.23, 0.93),
		"desc": "A temple carved into a dead moon. The priests never left.",
		"lore": "Hymns still echo in vacuum. The Null King's congregation doesn't sleep — it waits for pilgrims foolish enough to pray aloud.",
		"ship_mod": "Quantum Anchor",
		"boss": "The Null King", "names": ["Moon Acolyte", "Silent Choir", "Null Priest", "Dead Cantor", "Sanctum Shade", "Vesperite"]},
	{"id": 9, "name": "Crystal Nexus", "icon": "💎", "boss_emoji": "💎", "color": Color(0.08, 0.72, 0.65),
		"desc": "A lattice-world of living crystal that refracts your worst memories into lasers.",
		"lore": "Every facet is a mirror with an opinion. Walk carefully — the Prism Sovereign turns regret into a weapon and calls it judgment.",
		"ship_mod": "Aether Wing",
		"boss": "Prism Sovereign", "names": ["Facet Wraith", "Prism Scout", "Lattice Blade", "Refractor", "Geode Knight", "Shardling"]},
	{"id": 10, "name": "World Zero", "icon": "💫", "boss_emoji": "💫", "color": Color(0.98, 0.75, 0.14),
		"desc": "The first planet. The last stop of the known Frontier. Clear The Genesis to open the Wormhole.",
		"lore": "Charts end here for a reason. The Genesis is not a guardian — it is a lock. Break it, and the Wormhole stops pretending to be sealed.",
		"ship_mod": "Genesis Core",
		"boss": "The Genesis", "names": ["Proto Guard", "First Echo", "Zero Spawn", "Origin Wisp", "Seedling", "Primeform"]},
]


static func unlock_level(planet_id: int) -> int:
	if planet_id >= 1 and planet_id <= 10:
		return int(UNLOCK_LEVELS[planet_id])
	return 0


static func is_unlocked(planet_id: int, player_level: int) -> bool:
	var u := unlock_level(planet_id)
	if u <= 0:
		return true
	return maxi(1, player_level) >= u


static func get_planet(planet_id: int) -> Dictionary:
	if planet_id >= 1 and planet_id <= 10:
		return PLANETS[planet_id - 1].duplicate(true)
	# Wormhole / infinite depths
	var depth := maxi(1, planet_id - 10)
	var themes := [
		{"name": "Shattered", "icon": "🌌", "boss_emoji": "🌌", "boss": "The Fracture", "names": ["Shard Echo", "Broken Twin", "Fold Wraith", "Fractling"]},
		{"name": "Abyssal", "icon": "🖤", "boss_emoji": "🖤", "boss": "The Hollow", "names": ["Hollow Bite", "Deep Shade", "Null Maw", "Abyss Tick"]},
		{"name": "Temporal", "icon": "⏳", "boss_emoji": "⏳", "boss": "Chronovore", "names": ["Time Debt", "Loop Hound", "Yesterday", "Second Skin"]},
		{"name": "Celestial", "icon": "✨", "boss_emoji": "✨", "boss": "The Zenith", "names": ["Star Choir", "Nova Kin", "Zenith Spark", "Solarite"]},
	]
	var t: Dictionary = themes[(depth - 1) % themes.size()]
	return {
		"id": planet_id,
		"name": "The Wormhole · Depth %s" % depth,
		"icon": str(t.get("icon", "🌌")),
		"boss_emoji": str(t.get("boss_emoji", "🌌")),
		"color": Color(0.55, 0.35, 0.95),
		"desc": "Beyond World Zero, spacetime folds into an endless corridor. There is no last floor — only deeper.",
		"lore": "Past the Genesis lock, every depth is a new shape of the same hunger. Charts burn out. Compasses spin. The only way is through — and through never ends.",
		"ship_mod": "",
		"boss": str(t["boss"]),
		"names": t["names"],
		"wormhole": true,
		"depth": depth,
	}


static func enemy_level(planet_id: int, enemy_index: int) -> int:
	var idx := clampi(enemy_index, 1, ENEMIES_PER_PLANET)
	var band := maxi(1, planet_id)
	if band <= 10:
		return int(ENEMY_LEVELS[band][idx - 1])
	var depth := band - 10
	var start := 200 + (depth - 1) * 35 + 3
	return start + int(LEVEL_OFFSETS[idx - 1])


static func expected_player_attrs(level: int) -> int:
	return ExpectedPlayerAttributes.at(level)


static func enemy_budget(level: int, is_boss: bool) -> int:
	var mult := 1.30 if is_boss else 1.20
	return int(round(float(expected_player_attrs(level)) * mult))


static func generate_enemy(planet: Dictionary, enemy_index: int) -> Dictionary:
	var pid := int(planet.get("id", 1))
	var idx := clampi(enemy_index, 1, ENEMIES_PER_PLANET)
	var is_boss := idx == ENEMIES_PER_PLANET
	var rng := RandomNumberGenerator.new()
	rng.seed = pid * 1000 + idx * 37 + 7
	var level := enemy_level(pid, idx)
	var budget := enemy_budget(level, is_boss)
	var archetypes := ["MIGHT", "REFLEX", "TECH"]
	var arch: String = archetypes[rng.randi_range(0, 2)]
	var stats := MissionCombat.distribute_attrs(budget, arch)
	var class_key: String = MissionCombat.ARCHETYPE_CLASS[arch]
	var names: Array = planet.get("names", [])
	var name := str(planet.get("boss", "Boss")) if is_boss else (
		str(names[rng.randi_range(0, names.size() - 1)]) if names.size() > 0 else "Frontier Foe"
	)
	return {
		"id": "dungeon-%s-%s" % [pid, idx],
		"name": name,
		"race": null,
		"class": class_key,
		"dungeonEnemyArchetype": arch,
		"dungeonEnemy": true,
		"suppressClassPassive": true,
		"level": level,
		"stats": stats,
		"isBoss": is_boss,
		"speciesId": ((pid * 13 + idx * 7) % 30) + 1,
	}


static func format_ms(ms: int) -> String:
	var sec := maxi(0, int(ceil(float(ms) / 1000.0)))
	var m := sec / 60
	var s := sec % 60
	return "%d:%02d" % [m, s]


static func cooldown_remaining_ms(character: Dictionary) -> int:
	var until := str(character.get("dungeon_cooldown_until", ""))
	if until.is_empty() or until == "<null>":
		var at := str(character.get("dungeon_cooldown_at", ""))
		var ms := _as_int(character.get("dungeon_cooldown_ms", 0))
		if at.is_empty() or ms <= 0:
			return 0
		var start_ms := _parse_iso_ms(at)
		if start_ms <= 0:
			return 0
		return maxi(0, int(start_ms + ms - Time.get_unix_time_from_system() * 1000.0))
	var end_ms := _parse_iso_ms(until)
	if end_ms <= 0:
		return 0
	return maxi(0, int(end_ms - Time.get_unix_time_from_system() * 1000.0))


static func _as_int(value: Variant) -> int:
	match typeof(value):
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
			return 0
		_:
			return 0


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
	return float(Time.get_unix_time_from_datetime_dict(dict)) * 1000.0


static func free_lives_left(character: Dictionary) -> int:
	return maxi(0, DEATHS_PER_DAY - int(character.get("dungeon_deaths", 0)))
