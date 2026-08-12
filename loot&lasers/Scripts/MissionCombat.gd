class_name MissionCombat
extends RefCounted
## Local combat math for stat sheets and dungeon foe generation (presentation only).
## Authoritative mission/dungeon combat settlement uses Node Prepare* + committed events.

const ARCHETYPE_CLASS := {
	"MIGHT": "Vanguard",
	"REFLEX": "Shadow Operative",
	"TECH": "Technomancer",
}

const ARCHETYPE_SHARES := {
	"MIGHT": {"strength": 0.35, "vitality": 0.25, "luck": 0.2, "agility": 0.1, "intellect": 0.1},
	"REFLEX": {"agility": 0.35, "vitality": 0.25, "luck": 0.2, "strength": 0.1, "intellect": 0.1},
	"TECH": {"intellect": 0.35, "vitality": 0.25, "luck": 0.2, "strength": 0.1, "agility": 0.1},
}

const PRIMARY_STAT := {
	"Vanguard": "strength",
	"Astral Warden": "strength",
	"Shadow Operative": "agility",
	"Void Runner": "agility",
	"Technomancer": "intellect",
	"Cosmic Engineer": "intellect",
}

const CRIT_CAP := 30.0
const DODGE_CAP := 25.0
const ARMOR_CAP := 30.0
const TECH_RESIST_CAP := 30.0
const DUNGEON_CRIT_CAP := 75.0
const DUNGEON_DODGE_CAP := 75.0
const DUNGEON_ARMOR_CAP := 75.0
const DUNGEON_TECH_RESIST_CAP := 75.0
const DAMAGE_BASE := 15.0
const DAMAGE_BASE_RAMP_FLOOR := 5.0
const DAMAGE_BASE_RAMP_FULL_LEVEL := 25
const DAMAGE_COEFF := 0.0032
const DAMAGE_EXP := 1.727


## Linear flat ramp: 5 at L1 → 15 at L25+. Mission soft foes + arena bots only.
static func ramped_damage_base(level: int) -> float:
	var L := maxi(1, level)
	if L >= DAMAGE_BASE_RAMP_FULL_LEVEL:
		return DAMAGE_BASE
	var span := float(DAMAGE_BASE_RAMP_FULL_LEVEL - 1)
	return DAMAGE_BASE_RAMP_FLOOR + (DAMAGE_BASE - DAMAGE_BASE_RAMP_FLOOR) * (float(L - 1) / span)


## Dungeon foes also set isBot — exclude them so dungeon stays on full flat 15.
static func uses_ramped_damage_base(character: Dictionary) -> bool:
	if bool(character.get("dungeonEnemy", false)):
		return false
	return bool(character.get("missionEnemy", false)) \
		or bool(character.get("isBot", false)) \
		or bool(character.get("is_bot", false))


static func damage_base_for_combatant(character: Dictionary) -> float:
	if uses_ramped_damage_base(character):
		return ramped_damage_base(maxi(1, int(character.get("level", 1))))
	return DAMAGE_BASE


static func distribute_attrs(total: int, archetype: String) -> Dictionary:
	var shares: Dictionary = ARCHETYPE_SHARES.get(archetype, ARCHETYPE_SHARES["MIGHT"])
	var keys: Array = shares.keys()
	var raw: Array = []
	for k in keys:
		var exact := float(total) * float(shares[k])
		var fl := int(floor(exact))
		raw.append({"key": k, "floor": fl, "frac": exact - float(fl)})
	var assigned := 0
	for r in raw:
		assigned += int(r["floor"])
	var remain := total - assigned
	raw.sort_custom(func(a, b):
		if a["frac"] == b["frac"]:
			return str(a["key"]) < str(b["key"])
		return a["frac"] > b["frac"]
	)
	for i in range(raw.size()):
		if remain <= 0:
			break
		raw[i]["floor"] = int(raw[i]["floor"]) + 1
		remain -= 1
	var out := {"strength": 0, "agility": 0, "intellect": 0, "vitality": 0, "luck": 0}
	for r in raw:
		out[str(r["key"])] = int(r["floor"])
	return out


static func soft_cap_percent(level: int, total_attr: float, max_percent: float) -> float:
	var L := float(maxi(1, level))
	var attr := maxf(0.0, total_attr)
	var for_max := 700.0 * pow(L / 100.0, 0.95)
	var from_attr := 0.0
	if for_max > 0.0:
		from_attr = max_percent * minf(1.0, pow(attr / for_max, 1.20))
	var pre100 := max_percent * minf(1.0, pow(L / 100.0, 0.65))
	return minf(minf(from_attr, pre100), max_percent)


static func max_hp(vitality: float) -> int:
	var v := maxf(0.0, vitality)
	return int(round(50.0 + 2.5 * v + 0.008 * pow(v, 2.0)))


static func base_damage(primary: float, damage_base: float = DAMAGE_BASE) -> float:
	var p := maxf(0.0, primary)
	return damage_base + DAMAGE_COEFF * pow(p, DAMAGE_EXP)


static func merge_gear_stats(base_stats: Dictionary, items: Array) -> Dictionary:
	var out := base_stats.duplicate()
	for it in items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		var s: Variant = it.get("stats", {})
		if typeof(s) != TYPE_DICTIONARY:
			continue
		for k in ["strength", "agility", "intellect", "vitality", "luck"]:
			out[k] = int(out.get(k, 0)) + int(s.get(k, 0))
	return out


static func damage_archetype(class_key: String) -> String:
	var primary: String = PRIMARY_STAT.get(class_key, "strength")
	if primary == "agility":
		return "agi"
	if primary == "intellect":
		return "int"
	return "str"
