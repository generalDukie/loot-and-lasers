class_name MissionCombat
extends RefCounted
## Soft end-of-mission combat (client-side). Mirrors missionCombat.js +
## arenaEngine simulateBattle with class passives (ClassPassives.gd).

const ENEMY_ATTR_MULT := 0.28
const PLAYER_BASE := 50
const GEAR_FILL := 0.75

const FULL_SET_BUDGET := [
	[1, 12.5], [10, 245], [25, 480], [50, 825], [100, 1405],
	[200, 2545], [300, 3930], [400, 5305], [500, 6675],
]

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

const RACE_BONUSES := {
	"Zyrathi": {"strength": 0.03, "vitality": 0.02},
	"Cognati": {"intellect": 0.03, "agility": 0.02},
	"Luminae": {"intellect": 0.02, "luck": 0.03},
	"Grothak": {"strength": 0.02, "vitality": 0.03},
	"Synthara": {"agility": 0.03, "luck": 0.02},
}

const PRIMARY_STAT := {
	"Vanguard": "strength",
	"Astral Warden": "strength",
	"Shadow Operative": "agility",
	"Void Runner": "agility",
	"Technomancer": "intellect",
	"Cosmic Engineer": "intellect",
}

const ENCOUNTER_NAMES := [
	"Scrap Raider", "Dust Bandit", "Vermin Scout", "Hull Rat", "Junk Drone",
	"Space Mite", "Corridor Thug", "Loot Tick", "Derelict Guard", "Petty Corsair",
]

const CRIT_CAP := 30.0
const DODGE_CAP := 25.0
const ARMOR_CAP := 30.0
const TECH_RESIST_CAP := 30.0
const DUNGEON_CRIT_CAP := 75.0
const DUNGEON_DODGE_CAP := 75.0
const DUNGEON_ARMOR_CAP := 75.0
const DUNGEON_TECH_RESIST_CAP := 75.0
const CRIT_MULT := 1.5
const DAMAGE_BASE := 15.0
const DAMAGE_COEFF := 0.0032
const DAMAGE_EXP := 1.727


static func lerp_waypoints(level: float, points: Array) -> float:
	var L := maxf(1.0, level)
	if L <= float(points[0][0]):
		return float(points[0][1])
	for i in range(1, points.size()):
		var a: Array = points[i - 1]
		var b: Array = points[i]
		if L <= float(b[0]):
			var t := (L - float(a[0])) / maxf(0.0001, float(b[0]) - float(a[0]))
			return float(a[1]) + t * (float(b[1]) - float(a[1]))
	return float(points[points.size() - 1][1])


static func progressing_attrs(level: int) -> int:
	var gear := lerp_waypoints(float(level), FULL_SET_BUDGET)
	return int(round(float(PLAYER_BASE) + gear * GEAR_FILL))


static func enemy_budget(level: int) -> int:
	return int(round(float(progressing_attrs(level)) * ENEMY_ATTR_MULT))


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


static func generate_encounter(character: Dictionary, mission: Dictionary = {}) -> Dictionary:
	var level := maxi(1, int(character.get("level", 1)))
	var archetypes := ["MIGHT", "REFLEX", "TECH"]
	var archetype: String = archetypes[randi() % archetypes.size()]
	var budget := enemy_budget(level)
	var stats := distribute_attrs(budget, archetype)
	var class_key: String = ARCHETYPE_CLASS[archetype]
	var race_keys := RACE_BONUSES.keys()
	var race_key: String = race_keys[randi() % race_keys.size()]
	return {
		"id": "mission-foe-%s" % Time.get_unix_time_from_system(),
		"name": ENCOUNTER_NAMES[randi() % ENCOUNTER_NAMES.size()],
		"missionEnemyArchetype": archetype,
		"missionEnemy": true,
		"suppressClassPassive": true,
		"class": class_key,
		"race": null,
		"level": level,
		"stats": stats,
		"speciesId": race_key,
		"_missionId": str(mission.get("id", "")),
	}


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


static func base_damage(primary: float) -> float:
	var p := maxf(0.0, primary)
	return DAMAGE_BASE + DAMAGE_COEFF * pow(p, DAMAGE_EXP)


static func apply_race_bonus(stats: Dictionary, race: Variant) -> Dictionary:
	var out := stats.duplicate()
	if race == null:
		return out
	var bonuses: Dictionary = RACE_BONUSES.get(str(race), {})
	for k in bonuses.keys():
		out[k] = int(round(float(out.get(k, 0)) * (1.0 + float(bonuses[k]))))
	return out


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


static func build_fighter(character: Dictionary, items: Array, side: String) -> Dictionary:
	var base: Dictionary = character.get("stats", {}) if typeof(character.get("stats", {})) == TYPE_DICTIONARY else {}
	var merged := merge_gear_stats(base, items)
	var suppress := bool(character.get("suppressClassPassive", false)) \
		or bool(character.get("missionEnemy", false)) \
		or bool(character.get("dungeonEnemy", false))
	var race = null if suppress else character.get("race", null)
	var stats := apply_race_bonus(merged, race)
	var class_key := str(character.get("class", "Vanguard"))
	var level := maxi(1, int(character.get("level", 1)))
	var arch := damage_archetype(class_key)
	var primary_key := "strength"
	if arch == "agi":
		primary_key = "agility"
	elif arch == "int":
		primary_key = "intellect"
	var primary_val := float(stats.get(primary_key, 0))
	var dungeon_caps := bool(character.get("dungeonEnemy", false))
	var crit_cap := DUNGEON_CRIT_CAP if dungeon_caps else CRIT_CAP
	var dodge_cap := DUNGEON_DODGE_CAP if dungeon_caps else DODGE_CAP
	var armor_cap := DUNGEON_ARMOR_CAP if dungeon_caps else ARMOR_CAP
	var tech_cap := DUNGEON_TECH_RESIST_CAP if dungeon_caps else TECH_RESIST_CAP
	var armor := 0.0
	var tech := 0.0
	if arch != "str":
		armor = soft_cap_percent(level, float(stats.get("strength", 0)), armor_cap)
	if arch != "int":
		tech = soft_cap_percent(level, float(stats.get("intellect", 0)), tech_cap)
	var hp := max_hp(float(stats.get("vitality", 0)))
	var dmg_type := "strength"
	if arch == "agi":
		dmg_type = "agility"
	elif arch == "int":
		dmg_type = "tech"
	var sheet_atk := base_damage(primary_val)
	# Match web computeDerivedStats: agility sheet damage uses ×0.925.
	if arch == "agi":
		sheet_atk *= 0.925
	return {
		"side": side,
		"name": str(character.get("name", side)),
		"className": null if suppress else class_key,
		"suppressClassPassive": suppress,
		"hp": hp,
		"maxHp": hp,
		"barrier": 0,
		"primaryValue": primary_val,
		"standardAttack": sheet_atk,
		"archetype": arch,
		"crit": soft_cap_percent(level, float(stats.get("luck", 0)), crit_cap) / 100.0,
		"dodge": soft_cap_percent(level, float(stats.get("agility", 0)), dodge_cap) / 100.0,
		"armorPercent": armor,
		"techResistPercent": tech,
		"damageType": dmg_type,
		"passive": null,
		"passiveState": ClassPassives.create_state(),
	}


static func roll_damage(archetype: String, primary: float) -> float:
	var raw := base_damage(primary)
	var uni := 0.90 + randf() * 0.20
	if archetype == "agi":
		var agi_var := 0.80 + randf() * 0.25
		return raw * agi_var * uni
	return raw * uni


static func _stim_turn_plan(A: Dictionary, B: Dictionary) -> Variant:
	var a_stim := ClassPassives.has_stim_injector(A)
	var b_stim := ClassPassives.has_stim_injector(B)
	if not a_stim and not b_stim:
		return null
	var runner: Dictionary
	var other: Dictionary
	if a_stim and b_stim:
		runner = A if randf() < 0.5 else B
		other = B if runner == A else A
	elif a_stim:
		runner = A
		other = B
	else:
		runner = B
		other = A
	return {
		"runnerSide": runner["side"],
		"queue": [runner, runner, other],
	}


static func simulate_battle(player: Dictionary, enemy: Dictionary, player_items: Array = [], opp_items: Array = []) -> Dictionary:
	var A := build_fighter(player, player_items, "player")
	var B := build_fighter(enemy, opp_items, "opponent")
	var events: Array = []
	events.append_array(ClassPassives.on_combat_start(A))
	events.append_array(ClassPassives.on_combat_start(B))

	var stim_plan = _stim_turn_plan(A, B)
	var stim_queue: Array = []
	var attacker: Dictionary
	var defender: Dictionary
	var initiative: String
	if stim_plan != null:
		stim_queue = (stim_plan as Dictionary)["queue"].duplicate()
		attacker = stim_queue.pop_front()
		defender = B if attacker == A else A
		initiative = str((stim_plan as Dictionary)["runnerSide"])
		events.append({
			"type": "passive",
			"text": "Stim Injector overrides opening turns",
		})
	else:
		var player_first := randf() < 0.5
		attacker = A if player_first else B
		defender = B if player_first else A
		initiative = str(attacker["side"])

	var turn := 0
	while int(A["hp"]) > 0 and int(B["hp"]) > 0 and turn < 5000:
		turn += 1
		events.append_array(ClassPassives.on_turn_start(attacker))
		var mods: Dictionary = ClassPassives.begin_attack_mods(attacker)

		if ClassPassives.try_phantom_miss(defender):
			events.append(ClassPassives.phantom_miss_event(defender, attacker))
			ClassPassives.end_attack_mods(attacker, mods)
		elif not bool(mods.get("guaranteedHit", false)) and randf() < float(defender["dodge"]):
			ClassPassives.on_dodge(defender, attacker)
			events.append({
				"type": "dodge",
				"attacker": attacker["side"],
				"defender": defender["side"],
				"damage": 0,
				"crit": false,
				"dodged": true,
				"shieldHit": false,
				"text": "%s dodges!" % defender["name"],
			})
			ClassPassives.end_attack_mods(attacker, mods)
		else:
			var dmg := roll_damage(str(attacker["archetype"]), float(attacker["primaryValue"]))
			var crit_chance := float(attacker["crit"]) + float(mods.get("critBonusFlat", 0.0))
			var crit := bool(mods.get("guaranteedCrit", false)) or randf() < crit_chance
			var override_mult = mods.get("critMultOverride", null)
			if override_mult != null:
				dmg *= float(override_mult)
			elif crit:
				dmg *= CRIT_MULT
			dmg *= ClassPassives.overclock_dealt(attacker)
			dmg *= ClassPassives.overclock_taken(defender)
			var mit := 0.0
			var dt := str(attacker["damageType"])
			if dt == "strength":
				mit = float(defender["armorPercent"]) / 100.0
			elif dt == "tech":
				mit = float(defender["techResistPercent"]) / 100.0
			dmg *= (1.0 - mit)
			dmg = ClassPassives.apply_incoming_mult(defender, dmg)
			var final_dmg := maxi(0, int(round(dmg)))
			var barrier_absorbed := 0
			var barrier := int(defender.get("barrier", 0))
			if barrier > 0 and final_dmg > 0:
				barrier_absorbed = mini(barrier, final_dmg)
				defender["barrier"] = barrier - barrier_absorbed
				final_dmg -= barrier_absorbed
			defender["hp"] = maxi(0, int(defender["hp"]) - final_dmg)
			ClassPassives.on_hit_dealt(attacker)
			if crit:
				ClassPassives.on_crit_taken(defender)
			events.append({
				"type": "attack",
				"attacker": attacker["side"],
				"defender": defender["side"],
				"damage": final_dmg,
				"barrierAbsorbed": barrier_absorbed,
				"shieldHit": barrier_absorbed > 0,
				"crit": crit,
				"dodged": false,
				"text": "%s hits %s for %s%s" % [
					attacker["name"],
					defender["name"],
					final_dmg,
					" (CRIT)" if crit else "",
				],
			})
			ClassPassives.end_attack_mods(attacker, mods)
			events.append_array(ClassPassives.maybe_orbital(attacker, defender))

		if int(A["hp"]) <= 0 or int(B["hp"]) <= 0:
			break
		if not stim_queue.is_empty():
			attacker = stim_queue.pop_front()
			defender = B if attacker == A else A
		else:
			var tmp := attacker
			attacker = defender
			defender = tmp

	return {
		"events": events,
		"winner": "player" if int(A["hp"]) > 0 else "opponent",
		"playerMaxHp": int(A["maxHp"]),
		"opponentMaxHp": int(B["maxHp"]),
		"playerEndHp": maxi(0, int(A["hp"])),
		"opponentEndHp": maxi(0, int(B["hp"])),
		"initiativeFirstSide": initiative,
	}
