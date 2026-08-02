class_name InventoryRules
extends RefCounted
## Slot / bag / dissolve rules mirroring web inventoryJunk + inventoryCap.

const EQUIPPABLE_TYPES: PackedStringArray = [
	"helmet", "armor", "legs", "boots", "weapon", "neck", "accessory", "ship_module",
]

const BAG_CAP_DEFAULT := 10

const RARITY_SELL_FACTOR := {
	"common": 0.55, "uncommon": 0.7, "rare": 0.9, "epic": 1.15, "legendary": 1.4,
}
const TYPE_SELL_WEIGHT := {
	"weapon": 1.4, "armor": 1.2, "helmet": 1.0, "boots": 1.0, "legs": 1.0,
	"neck": 1.1, "accessory": 1.15, "ship_module": 1.35, "material": 0.5, "consumable": 0.6,
}


static func is_equippable(item_type: String) -> bool:
	return item_type in EQUIPPABLE_TYPES


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
		if not bool(it.get("is_equipped", false)):
			n += 1
	return n


## Client estimate: 10 + ship cargo mods (with upgrade multiplier), matching web getInventoryCap.
static func bag_cap(character: Dictionary = {}) -> int:
	return BAG_CAP_DEFAULT + int(round(ShipRules.mod_effect_total(character, "inventory_cap_bonus")))


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


## Class-weighted power for equip compare (mirrors StatCompareBubble).
static func class_power_rating(item: Dictionary, class_key: String = "Vanguard") -> int:
	var stats: Variant = item.get("stats", {})
	if typeof(stats) != TYPE_DICTIONARY:
		return 0
	var weights: Dictionary = ArenaRules.CLASS_WEIGHTS.get(class_key, ArenaRules.CLASS_WEIGHTS["Vanguard"])
	var sum := 0.0
	for k in ["strength", "agility", "intellect", "vitality", "luck"]:
		sum += float(stats.get(k, 0)) * float(weights.get(k, 1.0))
	return int(round(sum * 10.0))


static func compare_lines(candidate: Dictionary, equipped: Dictionary) -> Array:
	var out: Array = []
	var a: Dictionary = candidate.get("stats", {}) if typeof(candidate.get("stats", {})) == TYPE_DICTIONARY else {}
	var b: Dictionary = equipped.get("stats", {}) if typeof(equipped.get("stats", {})) == TYPE_DICTIONARY else {}
	for k in ["strength", "agility", "intellect", "vitality", "luck"]:
		var dv := int(a.get(k, 0)) - int(b.get(k, 0))
		if int(a.get(k, 0)) == 0 and int(b.get(k, 0)) == 0:
			continue
		out.append({"stat": k, "delta": dv, "new": int(a.get(k, 0)), "old": int(b.get(k, 0))})
	return out


static func estimate_sell_value(item: Dictionary) -> int:
	var itype := str(item.get("type", ""))
	var sell := int(item.get("sell_value", 0))
	if itype in ["consumable", "material"] and sell > 0:
		return maxi(1, sell)
	var stats: Variant = item.get("stats", {})
	var sum := 0
	if typeof(stats) == TYPE_DICTIONARY:
		for k in stats.keys():
			sum += int(stats[k])
	if sum > 0:
		var rarity := str(item.get("rarity", "common"))
		var rf := float(RARITY_SELL_FACTOR.get(rarity, 0.55))
		var tw := float(TYPE_SELL_WEIGHT.get(itype, 1.0))
		return maxi(1, int(round(float(sum) * rf * tw * 10.0)))
	return maxi(1, sell if sell > 0 else 1)


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
