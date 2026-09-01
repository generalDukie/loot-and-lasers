class_name InventoryRules
extends RefCounted
## Slot / bag / sell rules mirroring inventory junk heuristics + backpack cap.

const EQUIPPABLE_TYPES: PackedStringArray = [
	"helmet", "armor", "legs", "boots", "weapon", "neck", "accessory", "ship_module",
]

## Client estimate: production backpack is a hard 10 unequipped items of any type.
## Mirrors src/lib/productionMath BACKPACK_UNEQUIPPED_ITEM_CAP (server is authority).
const BACKPACK_UNEQUIPPED_ITEM_CAP := 10
## @deprecated Use BACKPACK_UNEQUIPPED_ITEM_CAP.
const BAG_CAP_DEFAULT := BACKPACK_UNEQUIPPED_ITEM_CAP

## Authoritative Stim % / duration by rarity. Matches server CONSUMABLE_TIERS.
## Mission drops historically stored only {stat, tier}; never trust a missing/forged mult.
const STIM_PERCENT_SCALE := 100
const STIM_TIER_MULT := {
	"uncommon": 0.05,
	"rare": 0.10,
	"epic": 0.20,
}
const STIM_TIER_HOURS := {
	"uncommon": 6,
	"rare": 12,
	"epic": 24,
}
const STIM_TIER_MAX_HOURS := {
	"uncommon": 18,
	"rare": 36,
	"epic": 72,
}


static func is_equippable(item_type: String) -> bool:
	var t := item_type
	if t == "ring":
		t = "accessory"
	return t in EQUIPPABLE_TYPES


static func is_consumable(item: Dictionary) -> bool:
	if str(item.get("type", "")) != "consumable":
		return false
	var cons: Variant = item.get("consumable", null)
	return typeof(cons) == TYPE_DICTIONARY and not (cons as Dictionary).is_empty()


static func bag_occupancy(items: Array) -> int:
	var n := 0
	for it in items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if bool(it.get("is_equipped", false)):
			continue
		n += 1
	return n


## Client estimate: production backpack is a hard 10 unequipped items of any type.
static func bag_cap(_character: Dictionary = {}) -> int:
	return BACKPACK_UNEQUIPPED_ITEM_CAP


static func find_equipped_of_type(items: Array, item_type: String) -> Dictionary:
	for it in items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if bool(it.get("is_equipped", false)) and str(it.get("type", "")) == item_type:
			return it
	return {}


static func find_by_id(items: Array, item_id: String) -> Dictionary:
	for it in items:
		if typeof(it) == TYPE_DICTIONARY and str(it.get("id", "")) == item_id:
			return it
	return {}


## Flat sum — used by junk heuristics.
static func power_rating(item: Dictionary) -> int:
	var stats: Variant = item.get("stats", {})
	if typeof(stats) != TYPE_DICTIONARY:
		return 0
	var sum := 0
	for k in stats.keys():
		sum += int(stats[k])
	return sum


## Class-weighted power for Black Market junk heuristics (mirrors web powerRating).
## Not used for gear comparison presentation — see compare_gear_attributes.
static func class_power_rating(item: Dictionary, class_key: String = StatsRules.DEFAULT_CLASS_KEY) -> int:
	var stats: Variant = item.get("stats", {})
	if typeof(stats) != TYPE_DICTIONARY:
		return 0
	var weights: Dictionary = ArenaRules.CLASS_WEIGHTS.get(
		class_key, ArenaRules.CLASS_WEIGHTS[StatsRules.DEFAULT_CLASS_KEY]
	)
	var sum := 0.0
	for k in StatsRules.ATTR_KEYS:
		sum += float(stats.get(k, 0)) * float(weights.get(k, 1.0))
	return int(round(sum * 10.0))


## Raw attribute diffs vs equipped (no class/rarity/power weighting).
## Keys: strength, agility, intellect, vitality, luck, total.
static func compare_gear_attributes(hovered: Dictionary, equipped: Dictionary = {}) -> Dictionary:
	var a: Dictionary = hovered.get("stats", {}) if typeof(hovered.get("stats", {})) == TYPE_DICTIONARY else {}
	var b: Dictionary = {}
	if not equipped.is_empty() and typeof(equipped.get("stats", {})) == TYPE_DICTIONARY:
		b = equipped.get("stats", {})
	var out := {
		"strength": 0, "agility": 0, "intellect": 0, "vitality": 0, "luck": 0, "total": 0,
	}
	var total := 0
	for k in StatsRules.ATTR_KEYS:
		var d := int(a.get(k, 0)) - int(b.get(k, 0))
		out[k] = d
		total += d
	out["total"] = total
	return out


static func format_stat_delta(delta: int) -> String:
	return NumberDisplay.signed_quantity(delta)


## Positive gear stats in class display order (Primary, Vit, Luck, Off A, Off B).
static func positive_stat_entries(stats: Dictionary, class_key: String = "") -> Array:
	var entries: Array = []
	for k in StatsRules.item_stat_display_order(class_key):
		var v := int(stats.get(k, 0))
		if v <= 0:
			continue
		entries.append({"k": k, "v": v})
	return entries


static func compare_lines(candidate: Dictionary, equipped: Dictionary, class_key: String = "") -> Array:
	var out: Array = []
	var a: Dictionary = candidate.get("stats", {}) if typeof(candidate.get("stats", {})) == TYPE_DICTIONARY else {}
	var b: Dictionary = equipped.get("stats", {}) if typeof(equipped.get("stats", {})) == TYPE_DICTIONARY else {}
	for k in StatsRules.item_stat_display_order(class_key):
		var nv := int(a.get(k, 0))
		var ov := int(b.get(k, 0))
		if nv == 0 and ov == 0:
			continue
		out.append({"stat": k, "delta": nv - ov, "new": nv, "old": ov})
	return out


static func estimate_sell_value(item: Dictionary) -> int:
	return StardustEconomy.gear_sale_value(item)


## True if the Black Market can buy this bag piece (unlocked + unequipped).
static func is_sellable(item: Dictionary) -> bool:
	if item.is_empty():
		return false
	if bool(item.get("locked", false)) or bool(item.get("is_equipped", false)):
		return false
	return not str(item.get("id", "")).is_empty()


## UI junk heuristic matching web listDissolveJunk (class-weighted power).
static func is_dissolve_junk(item: Dictionary, items: Array, character_class: String = "") -> bool:
	if bool(item.get("locked", false)) or bool(item.get("is_equipped", false)):
		return false
	var itype := str(item.get("type", ""))
	if not is_equippable(itype):
		return true
	if str(item.get("rarity", "")) != "common":
		return false
	var worn := find_equipped_of_type(items, itype)
	if worn.is_empty():
		return false
	var cls := character_class
	if cls.is_empty():
		cls = str(GameManager.active_character.get("class", "Vanguard"))
	return class_power_rating(item, cls) < class_power_rating(worn, cls)


static func list_junk_ids(items: Array, character_class: String = "") -> Array:
	var out: Array = []
	for it in items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if is_dissolve_junk(it, items, character_class):
			var iid := str(it.get("id", ""))
			if not iid.is_empty():
				out.append(iid)
	return out


static func stim_rarity(item: Dictionary) -> String:
	var cons: Variant = item.get("consumable", {})
	var from_cons := ""
	if typeof(cons) == TYPE_DICTIONARY:
		from_cons = str((cons as Dictionary).get("tier", "")).strip_edges().to_lower()
	var raw := str(item.get("rarity", from_cons)).strip_edges().to_lower()
	if raw == "common" or raw == "minor":
		return "uncommon"
	if raw == "legendary" or raw == "mythic" or raw == "prime":
		return "epic"
	if STIM_TIER_MULT.has(raw):
		return raw
	if typeof(cons) == TYPE_DICTIONARY and STIM_TIER_MULT.has(from_cons):
		return from_cons
	return "uncommon"


static func stim_effect(item: Dictionary) -> Dictionary:
	var cons: Variant = item.get("consumable", {})
	var stat := ""
	if typeof(cons) == TYPE_DICTIONARY:
		stat = str((cons as Dictionary).get("stat", "")).strip_edges().to_lower()
	var rarity := stim_rarity(item)
	var mult := float(STIM_TIER_MULT.get(rarity, 0.05))
	var hours := int(STIM_TIER_HOURS.get(rarity, 6))
	var max_hours := int(STIM_TIER_MAX_HOURS.get(rarity, 18))
	return {
		"stat": stat,
		"rarity": rarity,
		"mult": mult,
		"duration_hours": hours,
		"max_duration_hours": max_hours,
		"percent": int(round(mult * float(STIM_PERCENT_SCALE))),
	}
