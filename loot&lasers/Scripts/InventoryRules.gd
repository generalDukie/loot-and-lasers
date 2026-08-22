class_name InventoryRules
extends RefCounted
## Slot / bag / dissolve rules mirroring web inventoryJunk + inventoryCap.

const EQUIPPABLE_TYPES: PackedStringArray = [
	"helmet", "armor", "legs", "boots", "weapon", "neck", "accessory", "ship_module",
]

const BAG_CAP_DEFAULT := 10


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
	return BAG_CAP_DEFAULT


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


## Class-weighted power for dissolve-junk heuristics (mirrors web powerRating).
## Not used for gear comparison presentation — see compare_gear_attributes.
static func class_power_rating(item: Dictionary, class_key: String = "Vanguard") -> int:
	var stats: Variant = item.get("stats", {})
	if typeof(stats) != TYPE_DICTIONARY:
		return 0
	var weights: Dictionary = ArenaRules.CLASS_WEIGHTS.get(class_key, ArenaRules.CLASS_WEIGHTS["Vanguard"])
	var sum := 0.0
	for k in ["strength", "agility", "intellect", "vitality", "luck"]:
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
	for k in ["strength", "agility", "intellect", "vitality", "luck"]:
		var d := int(a.get(k, 0)) - int(b.get(k, 0))
		out[k] = d
		total += d
	out["total"] = total
	return out


static func format_stat_delta(delta: int) -> String:
	if delta > 0:
		return "+%s" % delta
	return str(delta)


static func compare_lines(candidate: Dictionary, equipped: Dictionary) -> Array:
	var out: Array = []
	var a: Dictionary = candidate.get("stats", {}) if typeof(candidate.get("stats", {})) == TYPE_DICTIONARY else {}
	var b: Dictionary = equipped.get("stats", {}) if typeof(equipped.get("stats", {})) == TYPE_DICTIONARY else {}
	for k in ["strength", "agility", "intellect", "vitality", "luck"]:
		var nv := int(a.get(k, 0))
		var ov := int(b.get(k, 0))
		if nv == 0 and ov == 0:
			continue
		out.append({"stat": k, "delta": nv - ov, "new": nv, "old": ov})
	return out


static func estimate_sell_value(item: Dictionary) -> int:
	return StardustEconomy.gear_sale_value(item)


## True if Void can dissolve this bag piece (unlocked + unequipped).
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
