class_name StatsRules
extends RefCounted
## Character sheet math — attribute costs + totals / derived combat (mirrors web).

const ATTR_KEYS: PackedStringArray = ["strength", "agility", "intellect", "vitality", "luck"]
const ATTR_LABELS := {
	"strength": "Strength",
	"agility": "Agility",
	"intellect": "Intellect",
	"vitality": "Vitality",
	"luck": "Luck",
}
const XP_STARDUST_SCALE := 10
const CRIT_MULT := 1.5

const CLASS_BASE_STATS := {
	"Vanguard": {"strength": 15, "agility": 8, "intellect": 6, "vitality": 14, "luck": 7},
	"Astral Warden": {"strength": 15, "agility": 8, "intellect": 6, "vitality": 14, "luck": 7},
	"Shadow Operative": {"strength": 7, "agility": 15, "intellect": 7, "vitality": 11, "luck": 10},
	"Void Runner": {"strength": 7, "agility": 15, "intellect": 7, "vitality": 11, "luck": 10},
	"Technomancer": {"strength": 6, "agility": 8, "intellect": 15, "vitality": 13, "luck": 8},
	"Cosmic Engineer": {"strength": 6, "agility": 8, "intellect": 15, "vitality": 13, "luck": 8},
}

const COST_WAYPOINTS := [
	[1, 10], [10, 15], [20, 25], [30, 40], [40, 65], [50, 100],
	[75, 225], [100, 500], [150, 1500], [200, 4000], [300, 20000],
	[400, 75000], [500, 225000], [600, 600000], [650, 1000000],
]


static func primary_stat(class_key: String) -> String:
	return str(MissionCombat.PRIMARY_STAT.get(class_key, "strength"))


## Normalize character.stats to a Dictionary of ATTR_KEYS (handles missing / JSON string).
static func raw_stats(character: Dictionary) -> Dictionary:
	var out := {
		"strength": 0, "agility": 0, "intellect": 0, "vitality": 0, "luck": 0,
	}
	var raw: Variant = character.get("stats", null)
	if typeof(raw) == TYPE_STRING:
		var parsed: Variant = JSON.parse_string(str(raw))
		raw = parsed
	if typeof(raw) == TYPE_DICTIONARY:
		for k in ATTR_KEYS:
			out[k] = int((raw as Dictionary).get(k, 0))
	# If the sheet has no stored totals yet, fall back to class bases so UI isn't all zeros.
	var any := false
	for k in ATTR_KEYS:
		if int(out[k]) > 0:
			any = true
			break
	if not any:
		var class_key := str(character.get("class", "Vanguard"))
		var base: Dictionary = CLASS_BASE_STATS.get(class_key, CLASS_BASE_STATS["Vanguard"])
		for k in ATTR_KEYS:
			out[k] = int(base.get(k, 0))
	return out


static func purchase_count(character: Dictionary, stat: String) -> int:
	var by: Variant = character.get("attribute_purchases_by_stat", null)
	if typeof(by) == TYPE_DICTIONARY and by.has(stat) and typeof(by[stat]) in [TYPE_INT, TYPE_FLOAT]:
		return maxi(0, int(by[stat]))
	var base: Dictionary = CLASS_BASE_STATS.get(str(character.get("class", "Vanguard")), CLASS_BASE_STATS["Vanguard"])
	var cur := int(raw_stats(character).get(stat, 0))
	return maxi(0, cur - int(base.get(stat, 0)))


static func point_cost(purchase_number: int) -> int:
	var n := maxi(1, purchase_number)
	var cost := 1
	if n <= 650:
		cost = maxi(1, int(round(MissionCombat.lerp_waypoints(n, COST_WAYPOINTS))))
	else:
		cost = maxi(1, int(round(10.0 * pow(1.0 + float(n - 1) / 97.54, 5.657))))
	return cost * XP_STARDUST_SCALE


static func next_cost(character: Dictionary, stat: String) -> int:
	return point_cost(purchase_count(character, stat) + 1)


## Permanent totals: base/purchased + gear + race (no stims).
static func permanent_totals(character: Dictionary, equipped: Array = []) -> Dictionary:
	var base := raw_stats(character)
	var merged := MissionCombat.merge_gear_stats(base, equipped)
	return MissionCombat.apply_race_bonus(merged, character.get("race", null))


## Naked totals (no gear) for the green +bonus delta.
static func naked_totals(character: Dictionary) -> Dictionary:
	return permanent_totals(character, [])


static func gear_bonus(character: Dictionary, equipped: Array, stat: String) -> int:
	return int(permanent_totals(character, equipped).get(stat, 0)) - int(naked_totals(character).get(stat, 0))


static func active_buffs(character: Dictionary) -> Array:
	var out: Array = []
	var raw: Variant = character.get("active_buffs", [])
	if typeof(raw) != TYPE_ARRAY:
		return out
	var now_ms := int(Time.get_unix_time_from_system() * 1000.0)
	for b in raw:
		if typeof(b) != TYPE_DICTIONARY:
			continue
		var exp_iso := str(b.get("expires_at", ""))
		if exp_iso.is_empty():
			continue
		var exp_unix := _parse_iso_unix(exp_iso)
		if exp_unix <= 0:
			continue
		if exp_unix * 1000 > now_ms:
			out.append(b)
	return out


## UI totals with stims: buff % on base, then gear + race.
static func display_totals(character: Dictionary, equipped: Array = []) -> Dictionary:
	var base := raw_stats(character)
	var buffed := _apply_buffs(base, active_buffs(character))
	var merged := MissionCombat.merge_gear_stats(buffed, equipped)
	return MissionCombat.apply_race_bonus(merged, character.get("race", null))


static func derived(character: Dictionary, totals: Dictionary) -> Dictionary:
	var level := maxi(1, int(character.get("level", 1)))
	var class_key := str(character.get("class", "Vanguard"))
	var arch := MissionCombat.damage_archetype(class_key)
	var primary_key := primary_stat(class_key)
	var primary_val := float(totals.get(primary_key, 0))
	var raw_dmg := MissionCombat.base_damage(primary_val)
	var damage := int(round(raw_dmg * 0.925 if arch == "agi" else raw_dmg))
	var armor := 0.0
	var tech := 0.0
	if arch != "str":
		armor = MissionCombat.soft_cap_percent(level, float(totals.get("strength", 0)), MissionCombat.ARMOR_CAP)
	if arch != "int":
		tech = MissionCombat.soft_cap_percent(level, float(totals.get("intellect", 0)), MissionCombat.TECH_RESIST_CAP)
	return {
		"damage": damage,
		"critChance": MissionCombat.soft_cap_percent(level, float(totals.get("luck", 0)), MissionCombat.CRIT_CAP),
		"critMult": CRIT_MULT,
		"health": MissionCombat.max_hp(float(totals.get("vitality", 0))),
		"dodgeChance": MissionCombat.soft_cap_percent(level, float(totals.get("agility", 0)), MissionCombat.DODGE_CAP),
		"armor": armor,
		"techResist": tech,
		"primaryStat": primary_key,
		"archetype": arch,
	}


static func combat_power(character: Dictionary, equipped: Array = []) -> int:
	var totals := permanent_totals(character, equipped)
	var class_key := str(character.get("class", "Vanguard"))
	var weights: Dictionary = ArenaRules.CLASS_WEIGHTS.get(class_key, ArenaRules.CLASS_WEIGHTS["Vanguard"])
	var weighted := 0.0
	for k in ATTR_KEYS:
		weighted += float(totals.get(k, 0)) * float(weights.get(k, 0.1))
	return int(round(float(int(character.get("level", 1))) * 50.0 + weighted * 10.0))


static func _apply_buffs(stats: Dictionary, buffs: Array) -> Dictionary:
	var out := stats.duplicate()
	for b in buffs:
		if typeof(b) != TYPE_DICTIONARY:
			continue
		var mult := float(b.get("mult", 0))
		var key := str(b.get("stat", ""))
		if key == "all":
			for k in ATTR_KEYS:
				out[k] = int(round(float(out.get(k, 0)) * (1.0 + mult)))
		elif out.has(key):
			out[key] = int(round(float(out.get(key, 0)) * (1.0 + mult)))
	return out


static func parse_iso_unix(iso: String) -> int:
	return _parse_iso_unix(iso)


static func _parse_iso_unix(iso: String) -> int:
	var s := iso.strip_edges().replace("Z", "")
	if s.is_empty():
		return 0
	if "T" in s:
		var parts := s.split("T")
		if parts.size() >= 2:
			var time_part := parts[1]
			if "." in time_part:
				time_part = time_part.split(".")[0]
			s = "%sT%s" % [parts[0], time_part]
	return int(Time.get_unix_time_from_datetime_string(s))
