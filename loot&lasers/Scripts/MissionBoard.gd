class_name MissionBoard
extends RefCounted
## Client-side cantina offer generation (mirrors web generateDailyMissions).
## Server recomputes rewards on ClaimMission — preview numbers are for UI only.

const MISSION_MIN_FUEL := 0.25
const MISSION_MIN_DURATION_SECONDS := 15
const MISSION_MAX_DURATION_SECONDS := 1200
const XP_STARDUST_SCALE := 10
const MISSION_XP_REBALANCE := 0.85
const XP_PER_FUEL_LINEAR := 0.5
const XP_PER_FUEL_POWER := 0.032
const XP_PER_FUEL_EXP := 1.67
## 0-based indices into the mission-explore art pool (6 images).
const EXPLORE_SCENE_COUNT := 6

## Mirrors web `ITEM_DROP_RATES` — preview chips on the mission detail sheet.
const ITEM_DROP_RATES := {
	"common": {"common": 85, "uncommon": 12, "rare": 3, "epic": 0, "legendary": 0},
	"uncommon": {"common": 55, "uncommon": 35, "rare": 8, "epic": 2, "legendary": 0},
	"rare": {"common": 25, "uncommon": 40, "rare": 25, "epic": 8, "legendary": 2},
	"epic": {"common": 10, "uncommon": 25, "rare": 35, "epic": 22, "legendary": 8},
	"legendary": {"common": 0, "uncommon": 10, "rare": 30, "epic": 35, "legendary": 25},
}
const LOOT_TYPES := ["weapon", "armor", "helmet", "boots", "accessory", "ship_module"]
const RARITY_ORDER := ["common", "uncommon", "rare", "epic", "legendary"]
const RARITY_COLORS := {
	"common": Color("#9CA3AF"),
	"uncommon": Color("#22C55E"),
	"rare": Color("#3B82F6"),
	"epic": Color("#A855F7"),
	"legendary": Color("#F59E0B"),
}

const DURATION_RULES := {
	1: {"min": 15, "max": 30, "step": 15},
	2: {"min": 15, "max": 30, "step": 15},
	3: {"min": 15, "max": 45, "step": 15},
	4: {"min": 30, "max": 60, "step": 15},
	5: {"min": 30, "max": 75, "step": 15},
	6: {"min": 30, "max": 90, "step": 30},
	7: {"min": 30, "max": 90, "step": 30},
	8: {"min": 60, "max": 120, "step": 30},
	9: {"min": 60, "max": 150, "step": 30},
	10: {"min": 60, "max": 150, "step": 30},
	11: {"min": 150, "max": 300, "step": 150},
	12: {"min": 150, "max": 300, "step": 150},
	13: {"min": 150, "max": 450, "step": 150},
	14: {"min": 150, "max": 450, "step": 150},
	15: {"min": 150, "max": 600, "step": 150},
	16: {"min": 300, "max": 750, "step": 150},
	17: {"min": 300, "max": 750, "step": 150},
	18: {"min": 300, "max": 900, "step": 150},
	19: {"min": 300, "max": 1050, "step": 150},
	20: {"min": 300, "max": 1200, "step": 150},
	21: {"min": 300, "max": 1200, "step": 300},
}

const TEMPLATES := [
	{
		"name": "Patrol the Rimward Sector",
		"location": "Nebula Station Alpha",
		"description": "Stroll the rim like you own the place. Mostly squinting at blips that are, statistically, 99% space geese.",
		"sector": 1,
		"level_requirement": 1,
	},
	{
		"name": "Salvage Run: Derelict Freighter",
		"location": "Wreck of the ISS Meridian",
		"description": "The ISS Meridian went quiet forty years ago. The cargo? Still there. Bring a crowbar.",
		"sector": 1,
		"level_requirement": 1,
	},
	{
		"name": "Contraband Dash",
		"location": "Keldris Reach",
		"description": "Move some 'perfectly legal' cargo past a patrol. The agricultural supplies are humming.",
		"sector": 1,
		"level_requirement": 1,
	},
	{
		"name": "Mail Run: Express Capsule",
		"location": "Orbital Post Hub",
		"description": "Deliver a sealed capsule that ticks when you shake it. Definitely not a bomb.",
		"sector": 1,
		"level_requirement": 1,
	},
	{
		"name": "Sensor Calibration Sweep",
		"location": "Relay Buoy Cluster 12",
		"description": "Tap every buoy with a wrench until the network stops screaming in binary.",
		"sector": 1,
		"level_requirement": 1,
	},
	{
		"name": "Asteroid Mining Operation",
		"location": "Kelvari Belt",
		"description": "Smack glowing space rocks until they confess their secrets.",
		"sector": 1,
		"level_requirement": 2,
	},
	{
		"name": "Black Market Buy",
		"location": "The Bazaar of Torment",
		"description": "Meet a contact named Gary who insists on being called The Whisper.",
		"sector": 1,
		"level_requirement": 2,
	},
	{
		"name": "Xeno-Archaeological Dig",
		"location": "Planet Ashara IV",
		"description": "Dig up ruins older than your grandpa's password. The whispering is probably fine.",
		"sector": 2,
		"level_requirement": 3,
	},
	{
		"name": "Escort the Diplomat",
		"location": "Luminae Homeworld",
		"description": "Walk Ambassador Zyr'tal through hostile territory. Do not let him order the seafood.",
		"sector": 2,
		"level_requirement": 4,
	},
	{
		"name": "Infiltrate Pirate Stronghold",
		"location": "Shadow Station Omega",
		"description": "Disable their shields and try not to become someone's new parrot.",
		"sector": 3,
		"level_requirement": 5,
	},
]

const LOW_FUEL_TEMPLATES := [
	{
		"name": "Quick Salvage Sweep",
		"description": "A fast burn through nearby debris — light on fuel, light on glory.",
		"location": "Drift Sector 7",
	},
	{
		"name": "Scavenge the Dock Lights",
		"description": "Pop a few broken bay lamps for scrap wire. Tiny job, tiny tank.",
		"location": "Hangar Rim",
	},
	{
		"name": "Courier Hop: One Parcel",
		"description": "Drop a sealed envelope two decks over. The recipient tips in dust. Barely.",
		"location": "Station Corridor 3",
	},
]

const QUEST_GIVERS := [
	{"emoji": "🤖", "name": "CLANK", "color": "#00E5FF"},
	{"emoji": "👽", "name": "Zyx", "color": "#9D5CFF"},
	{"emoji": "🐙", "name": "Capt. Tentak", "color": "#FF6B35"},
	{"emoji": "🧙", "name": "Old Maru", "color": "#FFD700"},
	{"emoji": "👻", "name": "Wraith Vin", "color": "#8BE8FF"},
	{"emoji": "🦊", "name": "Rix", "color": "#FF9E4F"},
	{"emoji": "🐉", "name": "Drako", "color": "#FF4D6D"},
	{"emoji": "🛸", "name": "Skip", "color": "#5CFFB0"},
]

const COLLECTIBLES := [
	{"name": "Void Geode", "emoji": "🪨"},
	{"name": "Star Fragment", "emoji": "⭐"},
	{"name": "Memory Crystal", "emoji": "💠"},
	{"name": "Stardust Cluster", "emoji": "✨"},
]


static func normalize_fuel(n: Variant) -> float:
	return snappedf(float(n), 0.01)


static func fuel_cost_from_duration(duration_seconds: int) -> float:
	return maxf(MISSION_MIN_FUEL, snappedf(float(duration_seconds) / 60.0, 0.01))


static func get_allowed_durations(level: int) -> Array:
	var lvl := maxi(1, level)
	var rule: Dictionary = DURATION_RULES.get(21 if lvl >= 21 else lvl, DURATION_RULES[21])
	var out: Array = []
	var s: int = int(rule["min"])
	while s <= int(rule["max"]):
		out.append(s)
		s += int(rule["step"])
	return out


static func roll_duration(level: int) -> int:
	var pool := get_allowed_durations(level)
	return int(pool[randi() % pool.size()])


static func reward_variance(level: int) -> float:
	return 0.25 if level <= 10 else 0.10


static func roll_efficiency(level: int) -> float:
	var v := reward_variance(level)
	var raw := (1.0 - v) + randf() * (2.0 * v)
	return snappedf(raw, 0.01)


## Mission XP/Fuel (scaled). Mirrors server missionXpPerFuelBase × XP_STARDUST_SCALE.
static func xp_per_fuel(level: int) -> int:
	var L := maxi(1, level)
	var pre := 10.0 + XP_PER_FUEL_LINEAR * float(L - 1) + XP_PER_FUEL_POWER * (pow(float(L), XP_PER_FUEL_EXP) - 1.0)
	return maxi(1, int(round(pre))) * XP_STARDUST_SCALE


static func sd_per_fuel(level: int) -> int:
	return StardustEconomy.stardust_per_fuel(level)


## Preview includes MISSION_XP_REBALANCE (0.85) — mirrors server computeMissionXpFromFuel.
static func preview_xp(fuel: float, level: int, efficiency: float) -> int:
	return maxi(
		1 if fuel > 0.0 else 0,
		int(round(fuel * float(xp_per_fuel(level)) * efficiency * MISSION_XP_REBALANCE))
	)


## Mission SD = ROUND(StardustPerFuel(level) * fuel). Efficiency does not apply.
static func preview_sd(fuel: float, level: int, _efficiency: float = 1.0) -> int:
	return StardustEconomy.mission_stardust_reward(level, fuel)


## Claim-aligned preview (ship mods + collection XP; optional nexus +5% SD).
## Matches server computeMissionGains with gearTotal=0 for collection %.
static func compute_gains(character: Dictionary, offer: Dictionary, nexus_bonus: bool = false) -> Dictionary:
	var level := int(character.get("level", 1))
	var fuel := estimate_fuel_cost(offer, character)
	var xp_eff := float(offer.get("xp_efficiency", 1.0))
	var xp_base := preview_xp(fuel, level, xp_eff)
	var sd_base := preview_sd(fuel, level)
	var xp_mult := 1.0 + ShipRules.mod_effect_total(character, "mission_xp_mult")
	var sd_mult := 1.0 + ShipRules.mod_effect_total(character, "mission_stardust_mult")
	var bonus_mult := 1.05 if nexus_bonus else 1.0
	var pct := collection_percentage(character)
	var xp_gain := int(round(float(int(round(float(xp_base) * xp_mult))) * (1.0 + pct / 100.0)))
	var sd_gain := int(round(float(sd_base) * bonus_mult * sd_mult))
	return {
		"experience": maxi(0, xp_gain),
		"stardust": maxi(0, sd_gain),
		"collection_pct": pct,
		"fuel": fuel,
	}


static func collection_percentage(character: Dictionary) -> float:
	# Mirrors server getCollectionPercentage(character, 0) — gearTotal omitted on claim.
	const BASE_TOTAL := 30 + 100 + 500 + 10
	var species := 0
	var arts := 0
	var relics := 0
	var gear := 0
	var raw_s: Variant = character.get("discovered_species", [])
	if typeof(raw_s) == TYPE_ARRAY:
		species = (raw_s as Array).size()
	var raw_a: Variant = character.get("collected_artifacts", [])
	if typeof(raw_a) == TYPE_ARRAY:
		arts = (raw_a as Array).size()
	var raw_r: Variant = character.get("collected_relics", [])
	if typeof(raw_r) == TYPE_ARRAY:
		relics = (raw_r as Array).size()
	var raw_g: Variant = character.get("discovered_gear", [])
	if typeof(raw_g) == TYPE_ARRAY:
		gear = (raw_g as Array).size()
	var badges := CollectiblesCatalog.badge_count(character)
	var discovered := species + arts + relics + gear + badges
	if BASE_TOTAL <= 0:
		return 0.0
	return snappedf(float(discovered) / float(BASE_TOTAL) * 100.0, 0.1)


static func estimate_fuel_cost(offer: Dictionary, character: Dictionary = {}) -> float:
	if not character.is_empty():
		return ShipRules.effective_fuel_cost(character, offer)
	if offer.has("fuel_cost") and typeof(offer["fuel_cost"]) in [TYPE_FLOAT, TYPE_INT]:
		return maxf(MISSION_MIN_FUEL, normalize_fuel(offer["fuel_cost"]))
	return fuel_cost_from_duration(int(offer.get("duration_seconds", 60)))


static func estimate_duration(offer: Dictionary, character: Dictionary = {}) -> int:
	if not character.is_empty():
		return ShipRules.effective_mission_duration(character, offer)
	return int(offer.get("duration_seconds", 0))


static func format_duration(seconds: int) -> String:
	var s := maxi(0, seconds)
	if s < 60:
		return "%ss" % s
	var m := s / 60
	var r := s % 60
	if r == 0:
		return "%sm" % m
	return "%sm %ss" % [m, r]


## Unique explore-art indices for a board (no duplicates when count ≤ pool size).
static func pick_explore_scenes(count: int) -> Array:
	var pool: Array = []
	for i in EXPLORE_SCENE_COUNT:
		pool.append(i)
	pool.shuffle()
	var out: Array = []
	for i in range(maxi(0, count)):
		out.append(int(pool[i % pool.size()]))
	return out


static func explore_image_id(scene_index: int) -> String:
	if scene_index < 0:
		return ""
	var n := scene_index % EXPLORE_SCENE_COUNT
	return "mission_explore_%02d" % (n + 1)


static func generate_daily(character: Dictionary) -> Array:
	var level := int(character.get("level", 1))
	var max_sector := int(character.get("highest_sector", 1)) + 1
	var pool: Array = []
	for t in TEMPLATES:
		if int(t.get("level_requirement", 1)) <= level and int(t.get("sector", 1)) <= max_sector:
			pool.append(t)
	if pool.is_empty():
		for t in TEMPLATES:
			if int(t.get("level_requirement", 1)) <= level:
				pool.append(t)
	if pool.is_empty():
		pool = TEMPLATES.duplicate()

	pool.shuffle()
	var givers := QUEST_GIVERS.duplicate()
	givers.shuffle()
	# Art belongs to the generated mission, not the physical quest slot.
	var explore_indices: Array = pick_explore_scenes(3)
	var offers: Array = []
	for i in range(3):
		var tpl: Dictionary = pool[i % pool.size()]
		var duration := roll_duration(level)
		var sd_eff := roll_efficiency(level)
		var xp_eff := roll_efficiency(level)
		var scene_i := int(explore_indices[i])
		var draft := {
			"name": tpl["name"],
			"description": tpl["description"],
			"location": tpl["location"],
			"sector": tpl["sector"],
			"level_requirement": tpl["level_requirement"],
			"duration_seconds": duration,
			"stardust_efficiency": sd_eff,
			"xp_efficiency": xp_eff,
			"patron": givers[i % givers.size()],
			"_seed": "%s-%s" % [Time.get_unix_time_from_system(), i],
			"explore_scene": scene_i,
			"image_id": explore_image_id(scene_i),
		}
		var fuel := estimate_fuel_cost(draft, character)
		var rarity := "common"
		if level >= 12:
			rarity = "epic"
		elif level >= 7:
			rarity = "rare"
		elif level >= 3:
			rarity = "uncommon"
		draft["rewards"] = {
			"experience": preview_xp(fuel, level, xp_eff),
			"stardust": preview_sd(fuel, level),
			"item_rarity_chance": rarity,
			"collectible": COLLECTIBLES[randi() % COLLECTIBLES.size()],
		}
		offers.append(draft)
	return offers


static func generate_low_fuel(character: Dictionary, current_fuel: float) -> Array:
	var fuel := normalize_fuel(current_fuel)
	if fuel < MISSION_MIN_FUEL:
		return []
	var level := int(character.get("level", 1))
	var duration := maxi(MISSION_MIN_DURATION_SECONDS, int(round(fuel * 60.0)))
	duration = mini(duration, MISSION_MAX_DURATION_SECONDS)
	var givers := QUEST_GIVERS.duplicate()
	givers.shuffle()
	var count := mini(3, LOW_FUEL_TEMPLATES.size())
	var explore_indices: Array = pick_explore_scenes(count)
	var offers: Array = []
	for i in range(count):
		var tpl: Dictionary = LOW_FUEL_TEMPLATES[i]
		var sd_eff := roll_efficiency(level)
		var xp_eff := roll_efficiency(level)
		var pinned := maxf(MISSION_MIN_FUEL, fuel)
		var scene_i := int(explore_indices[i])
		offers.append({
			"name": tpl["name"],
			"description": tpl["description"],
			"location": tpl["location"],
			"sector": 1,
			"level_requirement": 1,
			"duration_seconds": duration,
			"fuel_cost": pinned,
			"stardust_efficiency": sd_eff,
			"xp_efficiency": xp_eff,
			"_lowFuel": true,
			"patron": givers[i % givers.size()],
			"_seed": "low-%s-%s" % [Time.get_unix_time_from_system(), i],
			"explore_scene": scene_i,
			"image_id": explore_image_id(scene_i),
			"rewards": {
				"experience": preview_xp(pinned, level, xp_eff),
				"stardust": preview_sd(pinned, level),
				"item_rarity_chance": "common",
			},
		})
	return offers


static func can_afford_any(character: Dictionary, offers: Array) -> bool:
	var fuel := normalize_fuel(character.get("fuel", 0))
	for o in offers:
		if estimate_fuel_cost(o, character) <= fuel + 0.001:
			return true
	return false


static func build_board(character: Dictionary) -> Array:
	var normal := generate_daily(character)
	if can_afford_any(character, normal):
		return normal
	var fuel := normalize_fuel(character.get("fuel", 0))
	var low := generate_low_fuel(character, fuel)
	return low if not low.is_empty() else normal
