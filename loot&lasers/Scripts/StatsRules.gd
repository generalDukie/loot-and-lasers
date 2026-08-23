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
const CRIT_MULT := 1.5

## Starting attributes — must match productionMath.STARTING_ATTRIBUTES (server is authority).
const CLASS_BASE_STATS := {
	"Vanguard": {"strength": 15, "agility": 8, "intellect": 6, "vitality": 14, "luck": 7},
	"Astral Warden": {"strength": 15, "agility": 8, "intellect": 6, "vitality": 14, "luck": 7},
	"Shadow Operative": {"strength": 7, "agility": 15, "intellect": 7, "vitality": 11, "luck": 10},
	"Void Runner": {"strength": 7, "agility": 15, "intellect": 7, "vitality": 11, "luck": 10},
	"Technomancer": {"strength": 6, "agility": 8, "intellect": 15, "vitality": 13, "luck": 8},
	"Cosmic Engineer": {"strength": 6, "agility": 8, "intellect": 15, "vitality": 13, "luck": 8},
}

const CLASS_BASE_STAT_TOTAL := 50
const MAX_ATTRIBUTE_PURCHASE_BATCH := 50
const MILLISECONDS_PER_SECOND := 1_000
const DEFAULT_COMBAT_STAT_WEIGHT := 0.1
const COMBAT_POWER_PER_LEVEL := 50.0
const COMBAT_POWER_PER_WEIGHTED_STAT := 10.0
const SHEET_CHANCE_PERCENT_SCALE := 100.0
const HEALTH_BASE := 50.0
const HEALTH_PER_VITALITY := 2.5
const HEALTH_VITALITY_SQUARED_COEFFICIENT := 0.008
## Mirrors productionMath native player Base Damage (not a scaled legacy raw).
const PLAYER_BASE_DAMAGE_FLAT := 37.5
const PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT := 0.008
const PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT := 1.727
const GENERIC_FORMAX_AT_100 := 700.0
const GENERIC_FORMAX_EXPONENT := 0.95
const GENERIC_ATTR_EXPONENT := 1.2
const GENERIC_EARLY_EXPONENT := 0.65
const NATURAL_CRIT_CAP := 0.3
const NATURAL_DODGE_CAP := 0.25
const NATURAL_RESIST_CAP := 0.3
const CRIT_FORMAX_MULT := 1.55
const CRIT_ATTR_EXPONENT := 1.8
const REFLEX_CONVERSION_LOW := 0.225
const REFLEX_CONVERSION_HIGH := 0.325
const REFLEX_RAMP_START_LEVEL := 400.0
const REFLEX_RAMP_END_LEVEL := 750.0
const REFLEX_BLEND_HALF_WIDTH := 6.0
const SOFT_CAP_REFERENCE_LEVEL := 100.0


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
	var class_key := str(character.get("class", "Vanguard"))
	var base: Dictionary = CLASS_BASE_STATS.get(class_key, CLASS_BASE_STATS["Vanguard"])
	var cur_sum := 0
	for k in ATTR_KEYS:
		cur_sum += int(out[k])
	if cur_sum < CLASS_BASE_STAT_TOTAL:
		for k in ATTR_KEYS:
			out[k] = int(base.get(k, 0)) + int(out[k])
	return out


static func purchase_count(character: Dictionary, stat: String) -> int:
	var by: Variant = character.get("attribute_purchases_by_stat", null)
	if typeof(by) == TYPE_DICTIONARY and by.has(stat) and typeof(by[stat]) in [TYPE_INT, TYPE_FLOAT]:
		return maxi(0, int(by[stat]))
	return 0


static func point_cost(purchase_number: int) -> int:
	return StardustEconomy.permanent_attribute_purchase_cost(purchase_number)


static func next_cost(character: Dictionary, stat: String) -> int:
	return point_cost(purchase_count(character, stat) + 1)


## Sum of the next `count` purchase costs for one stat (independent curve).
static func batch_cost(character: Dictionary, stat: String, count: int) -> int:
	var n := clampi(count, 0, MAX_ATTRIBUTE_PURCHASE_BATCH)
	var start := purchase_count(character, stat)
	var total := 0
	for i in n:
		total += point_cost(start + i + 1)
	return total


static func max_affordable_purchases(character: Dictionary, stat: String, stardust: int) -> int:
	var start := purchase_count(character, stat)
	var left := maxi(0, stardust)
	var n := 0
	while n < MAX_ATTRIBUTE_PURCHASE_BATCH:
		var c := point_cost(start + n + 1)
		if c <= 0 or left < c:
			break
		left -= c
		n += 1
	return n


## Permanent totals: base/purchased + gear (no stims). Race is flavor-only.
static func permanent_totals(character: Dictionary, equipped: Array = []) -> Dictionary:
	var base := raw_stats(character)
	return MissionCombat.merge_gear_stats(base, equipped)


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
	var now_ms := int(Time.get_unix_time_from_system() * MILLISECONDS_PER_SECOND)
	for b in raw:
		if typeof(b) != TYPE_DICTIONARY:
			continue
		var key := str(b.get("stat", "")).strip_edges().to_lower()
		# Single-attribute stims only — legacy "all" buffs are ignored.
		if not (key in ATTR_KEYS):
			continue
		var exp_iso := str(b.get("expires_at", ""))
		if exp_iso.is_empty():
			continue
		var exp_unix := _parse_iso_unix(exp_iso)
		if exp_unix <= 0:
			continue
		if exp_unix * MILLISECONDS_PER_SECOND > now_ms:
			out.append(b)
	return out


## UI / combat totals: permanent pre-stim attributes, then Stim multipliers last.
static func display_totals(character: Dictionary, equipped: Array = []) -> Dictionary:
	var permanent := permanent_totals(character, equipped)
	return _apply_buffs(permanent, active_buffs(character))


static func _round_half_up(value: float) -> int:
	return int(floor(value + 0.5))


static func _round_half_even(value: float) -> int:
	var sign := -1 if value < 0.0 else 1
	var ax := absf(value)
	var n := int(floor(ax))
	var frac := ax - float(n)
	if frac < 0.5:
		return sign * n
	if frac > 0.5:
		return sign * (n + 1)
	return sign * (n if (n % 2 == 0) else n + 1)


static func _sheet_archetype(arch: String) -> String:
	if arch == "agi":
		return "Reflex"
	if arch == "int":
		return "Tech"
	return "Might"


static func _generic_for_max(level: int) -> float:
	return GENERIC_FORMAX_AT_100 * pow(float(level) / SOFT_CAP_REFERENCE_LEVEL, GENERIC_FORMAX_EXPONENT)


static func _derived_stat(level: int, attr: float, cap: float, for_max_mult: float, attr_exponent: float) -> float:
	var x := maxf(0.0, attr)
	var fm := _generic_for_max(level) * for_max_mult
	var from_attr := cap * minf(1.0, 0.0 if fm <= 0.0 else pow(x / fm, attr_exponent))
	var early := cap * minf(1.0, pow(float(level) / SOFT_CAP_REFERENCE_LEVEL, GENERIC_EARLY_EXPONENT))
	return minf(minf(from_attr, early), cap)


static func _reflex_piece(x: float) -> float:
	var lo := REFLEX_CONVERSION_LOW
	var hi := REFLEX_CONVERSION_HIGH
	var a := REFLEX_RAMP_START_LEVEL
	var b := REFLEX_RAMP_END_LEVEL
	if x <= a:
		return lo
	if x >= b:
		return hi
	return lo + ((hi - lo) / (b - a)) * (x - a)


static func _reflex_blend(x: float, knot: float) -> float:
	var w := REFLEX_BLEND_HALF_WIDTH
	var t := (x - (knot - w)) / (2.0 * w)
	if t <= 0.0:
		return _reflex_piece(knot - w)
	if t >= 1.0:
		return _reflex_piece(knot + w)
	var s := clampf(t, 0.0, 1.0)
	s = s * s * (3.0 - 2.0 * s)
	return _reflex_piece(knot - w) * (1.0 - s) + _reflex_piece(knot + w) * s


static func _reflex_agi_conversion(level: int) -> float:
	var L := float(maxi(1, level))
	var a := REFLEX_RAMP_START_LEVEL
	var b := REFLEX_RAMP_END_LEVEL
	var w := REFLEX_BLEND_HALF_WIDTH
	if absf(L - a) < w:
		return _reflex_blend(L, a)
	if absf(L - b) < w:
		return _reflex_blend(L, b)
	return _reflex_piece(L)


## Preview-only character-sheet derived stats (productionMath). Combat uses MissionCombat.
static func derived(character: Dictionary, totals: Dictionary) -> Dictionary:
	var level := maxi(1, int(character.get("level", 1)))
	var class_key := str(character.get("class", "Vanguard"))
	var arch := MissionCombat.damage_archetype(class_key)
	var sheet_arch := _sheet_archetype(arch)
	var primary_key := primary_stat(class_key)
	var primary_val := maxf(0.0, float(totals.get(primary_key, 0)))
	var vit := maxf(0.0, float(totals.get("vitality", 0)))
	var luck := maxf(0.0, float(totals.get("luck", 0)))
	var agi := maxf(0.0, float(totals.get("agility", 0)))
	var strength := maxf(0.0, float(totals.get("strength", 0)))
	var intel := maxf(0.0, float(totals.get("intellect", 0)))
	var converted_agi := agi * _reflex_agi_conversion(level) if sheet_arch == "Reflex" else agi
	var might_resist := 0.0
	var tech_resist := 0.0
	var reflex_resist := 0.0
	if sheet_arch == "Might":
		tech_resist = _derived_stat(level, intel, NATURAL_RESIST_CAP, 1.0, GENERIC_ATTR_EXPONENT)
		reflex_resist = tech_resist
	elif sheet_arch == "Reflex":
		might_resist = _derived_stat(level, strength, NATURAL_RESIST_CAP, 1.0, GENERIC_ATTR_EXPONENT)
		tech_resist = _derived_stat(level, intel, NATURAL_RESIST_CAP, 1.0, GENERIC_ATTR_EXPONENT)
	else:
		might_resist = _derived_stat(level, strength, NATURAL_RESIST_CAP, 1.0, GENERIC_ATTR_EXPONENT)
		reflex_resist = might_resist
	var hp := maxi(1, _round_half_even(HEALTH_BASE + HEALTH_PER_VITALITY * vit + HEALTH_VITALITY_SQUARED_COEFFICIENT * vit * vit))
	var canonical_atk := PLAYER_BASE_DAMAGE_FLAT + PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT * pow(primary_val, PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT)
	return {
		"damage": _round_half_up(canonical_atk),
		"critChance": _derived_stat(level, luck, NATURAL_CRIT_CAP, CRIT_FORMAX_MULT, CRIT_ATTR_EXPONENT) * SHEET_CHANCE_PERCENT_SCALE,
		"critMult": CRIT_MULT,
		"health": hp,
		"dodgeChance": _derived_stat(level, converted_agi, NATURAL_DODGE_CAP, 1.0, GENERIC_ATTR_EXPONENT) * SHEET_CHANCE_PERCENT_SCALE,
		"armor": might_resist * SHEET_CHANCE_PERCENT_SCALE,
		"techResist": tech_resist * SHEET_CHANCE_PERCENT_SCALE,
		"reflexResist": reflex_resist * SHEET_CHANCE_PERCENT_SCALE,
		"primaryStat": primary_key,
		"archetype": arch,
	}


## Concise player-facing combat effect for attribute hover tooltips (presentation only).
static func attribute_tooltip(stat: String, character: Dictionary, equipped: Array = []) -> String:
	var totals := display_totals(character, equipped)
	var d := derived(character, totals)
	var arch := str(d.get("archetype", "str"))
	var primary := str(d.get("primaryStat", "strength"))
	match stat:
		"luck":
			return "Increases critical-hit chance by %.1f%% (×%.1f crit damage)." % [
				float(d.get("critChance", 0)), float(d.get("critMult", CRIT_MULT)),
			]
		"vitality":
			return "Increases maximum health to %d." % int(d.get("health", 0))
		"agility":
			var lines := "Increases dodge chance by %.1f%%." % float(d.get("dodgeChance", 0))
			if primary == "agility":
				lines += "\nAlso sets attack damage to %d." % int(d.get("damage", 0))
			return lines
		"intellect":
			var lines2 := "Increases tech resistance by %.1f%%." % float(d.get("techResist", 0))
			if arch == "str":
				lines2 += "\nIncreases Reflex Resist by %.1f%%." % float(d.get("reflexResist", 0))
			if primary == "intellect":
				lines2 += "\nAlso sets attack damage to %d." % int(d.get("damage", 0))
			return lines2
		"strength":
			if arch == "str" or primary == "strength":
				return "Increases attack damage to %d." % int(d.get("damage", 0))
			var str_line := "Increases Might Resistance by %.1f%%." % float(d.get("armor", 0))
			if arch == "int":
				str_line += "\nIncreases Reflex Resist by %.1f%%." % float(d.get("reflexResist", 0))
			return str_line
		_:
			return "Contributes to combat power and derived stats."


static func combat_power(character: Dictionary, equipped: Array = []) -> int:
	var totals := permanent_totals(character, equipped)
	var class_key := str(character.get("class", "Vanguard"))
	var weights: Dictionary = ArenaRules.CLASS_WEIGHTS.get(class_key, ArenaRules.CLASS_WEIGHTS["Vanguard"])
	var weighted := 0.0
	for k in ATTR_KEYS:
		weighted += float(totals.get(k, 0)) * float(weights.get(k, DEFAULT_COMBAT_STAT_WEIGHT))
	return int(
		round(
			float(int(character.get("level", 1))) * COMBAT_POWER_PER_LEVEL
			+ weighted * COMBAT_POWER_PER_WEIGHTED_STAT
		)
	)


static func _apply_buffs(stats: Dictionary, buffs: Array) -> Dictionary:
	var out := stats.duplicate()
	for b in buffs:
		if typeof(b) != TYPE_DICTIONARY:
			continue
		var mult := float(b.get("mult", 0))
		var key := str(b.get("stat", "")).strip_edges().to_lower()
		if out.has(key):
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
