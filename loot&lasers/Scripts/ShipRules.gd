class_name ShipRules
extends RefCounted
## Fuel mounts + ship hangar catalogs (mirrors fuelMounts.js / gameData ship section).

const MAX_FUEL_STACK := 3
const REDUCTION_CAP := 0.9

const FUEL_MOUNTS := [
	{"id": 1, "name": "Ion Booster", "speed": 0.10, "duration_hours": 1, "stardust": 1200, "crystals": 0},
	{"id": 2, "name": "Plasma Thruster", "speed": 0.20, "duration_hours": 2, "stardust": 3000, "crystals": 0},
	{"id": 3, "name": "Warp Core", "speed": 0.30, "duration_hours": 4, "stardust": 5000, "crystals": 8},
	{"id": 4, "name": "Singularity Drive", "speed": 0.45, "duration_hours": 8, "stardust": 10000, "crystals": 20},
]

## Matches web SHIP_UPGRADE_STEP = 1.08 — multiplies installed mod effects.
const SHIP_UPGRADE_STEP := 1.08

const SHIP_TYPES := {
	"scout": {
		"name": "Recon Scout", "emoji": "satellite", "cost": 0, "unlock_level": 1,
		"desc": "Standard-issue exploration vessel. Reliable, if unremarkable.",
		"cost_mult": 1.0, "upgrade_mult": 1.0, "inherent": {},
	},
	"frigate": {
		"name": "Storm Frigate", "emoji": "rocket", "cost": 50000, "unlock_level": 50,
		"desc": "Military-grade frigate with reinforced hull plating and salvage magnets.",
		"cost_mult": 1.10, "upgrade_mult": SHIP_UPGRADE_STEP,
		"inherent": {"mission_stardust_mult": 0.05},
	},
	"cruiser": {
		"name": "Galaxy Cruiser", "emoji": "ship", "cost": 150000, "unlock_level": 100,
		"desc": "Long-range endurance cruiser with an overcharged AI core.",
		"cost_mult": 1.21, "upgrade_mult": SHIP_UPGRADE_STEP * SHIP_UPGRADE_STEP,
		"inherent": {"mission_xp_mult": 0.05, "mission_duration_reduction": 0.03},
	},
	"dreadnought": {
		"name": "Void Dreadnought", "emoji": "ship", "cost": 400000, "unlock_level": 200,
		"desc": "Capital-class warship. The ultimate command vessel.",
		"cost_mult": 1.331, "upgrade_mult": SHIP_UPGRADE_STEP * SHIP_UPGRADE_STEP * SHIP_UPGRADE_STEP,
		"inherent": {"mission_stardust_mult": 0.10, "mission_xp_mult": 0.10, "fuel_cost_reduction": 1},
	},
}

## Per-tier effect amounts (mirrors economyFormulas / gameData SHIP_MODS).
const MOD_EFFECT_PER_TIER := {
	"fuel_tank": {"max_fuel_bonus": 2.0},
	"fuel_efficiency": {"fuel_cost_reduction": 1.0},
	"warp_drive": {"mission_duration_reduction": 0.005},
	"stardust_magnet": {"mission_stardust_mult": 0.005},
	"neural_accel": {"mission_xp_mult": 0.005},
	"cargo_hold": {"inventory_cap_bonus": 1.0},
}

const SHIP_ORDER: PackedStringArray = ["scout", "frigate", "cruiser", "dreadnought"]

const SHIP_MODS := {
	"fuel_tank": {
		"name": "Reinforced Fuel Tank", "emoji": "fuel", "category": "Propulsion",
		"desc": "Expands your fuel reserves for longer expeditions before refuelling.",
		"effect_key": "max_fuel_bonus",
		"tiers": [
			{"id": "fuel_tank_1", "cost": 2000, "max_fuel_bonus": 2}, {"id": "fuel_tank_2", "cost": 4500, "max_fuel_bonus": 2},
			{"id": "fuel_tank_3", "cost": 8000, "max_fuel_bonus": 2}, {"id": "fuel_tank_4", "cost": 12500, "max_fuel_bonus": 2},
			{"id": "fuel_tank_5", "cost": 18000, "max_fuel_bonus": 2}, {"id": "fuel_tank_6", "cost": 25000, "max_fuel_bonus": 2},
			{"id": "fuel_tank_7", "cost": 34000, "max_fuel_bonus": 2}, {"id": "fuel_tank_8", "cost": 45000, "max_fuel_bonus": 2},
			{"id": "fuel_tank_9", "cost": 56000, "max_fuel_bonus": 2}, {"id": "fuel_tank_10", "cost": 68000, "max_fuel_bonus": 2},
		],
	},
	"fuel_efficiency": {
		"name": "Fuel Injector Tune", "emoji": "wrench", "category": "Propulsion",
		"desc": "Optimises combustion so every launch burns less fuel.",
		"effect_key": "fuel_cost_reduction",
		"tiers": [
			{"id": "fuel_efficiency_1", "cost": 3500, "fuel_cost_reduction": 1}, {"id": "fuel_efficiency_2", "cost": 7000, "fuel_cost_reduction": 1},
			{"id": "fuel_efficiency_3", "cost": 11000, "fuel_cost_reduction": 1}, {"id": "fuel_efficiency_4", "cost": 16000, "fuel_cost_reduction": 1},
			{"id": "fuel_efficiency_5", "cost": 22000, "fuel_cost_reduction": 1}, {"id": "fuel_efficiency_6", "cost": 29000, "fuel_cost_reduction": 1},
			{"id": "fuel_efficiency_7", "cost": 37000, "fuel_cost_reduction": 1}, {"id": "fuel_efficiency_8", "cost": 46000, "fuel_cost_reduction": 1},
			{"id": "fuel_efficiency_9", "cost": 56000, "fuel_cost_reduction": 1}, {"id": "fuel_efficiency_10", "cost": 68000, "fuel_cost_reduction": 1},
		],
	},
	"warp_drive": {
		"name": "Warp Drive", "emoji": "tornado", "category": "Propulsion",
		"desc": "Folds space to shorten every mission's travel time.",
		"effect_key": "mission_duration_reduction",
		"tiers": [
			{"id": "warp_drive_1", "cost": 5000, "mission_duration_reduction": 0.005}, {"id": "warp_drive_2", "cost": 9500, "mission_duration_reduction": 0.005},
			{"id": "warp_drive_3", "cost": 14500, "mission_duration_reduction": 0.005}, {"id": "warp_drive_4", "cost": 20000, "mission_duration_reduction": 0.005},
			{"id": "warp_drive_5", "cost": 26000, "mission_duration_reduction": 0.005}, {"id": "warp_drive_6", "cost": 33000, "mission_duration_reduction": 0.005},
			{"id": "warp_drive_7", "cost": 41000, "mission_duration_reduction": 0.005}, {"id": "warp_drive_8", "cost": 50000, "mission_duration_reduction": 0.005},
			{"id": "warp_drive_9", "cost": 60000, "mission_duration_reduction": 0.005}, {"id": "warp_drive_10", "cost": 71000, "mission_duration_reduction": 0.005},
		],
	},
	"stardust_magnet": {
		"name": "Stardust Magnet", "emoji": "magnet", "category": "Harvesting",
		"desc": "Magnetic hull plating draws extra stardust from mission rewards.",
		"effect_key": "mission_stardust_mult",
		"tiers": [
			{"id": "stardust_magnet_1", "cost": 3000, "mission_stardust_mult": 0.005}, {"id": "stardust_magnet_2", "cost": 6500, "mission_stardust_mult": 0.005},
			{"id": "stardust_magnet_3", "cost": 10500, "mission_stardust_mult": 0.005}, {"id": "stardust_magnet_4", "cost": 15000, "mission_stardust_mult": 0.005},
			{"id": "stardust_magnet_5", "cost": 20000, "mission_stardust_mult": 0.005}, {"id": "stardust_magnet_6", "cost": 25500, "mission_stardust_mult": 0.005},
			{"id": "stardust_magnet_7", "cost": 31500, "mission_stardust_mult": 0.005}, {"id": "stardust_magnet_8", "cost": 38000, "mission_stardust_mult": 0.005},
			{"id": "stardust_magnet_9", "cost": 45000, "mission_stardust_mult": 0.005}, {"id": "stardust_magnet_10", "cost": 53000, "mission_stardust_mult": 0.005},
		],
	},
	"neural_accel": {
		"name": "Neural Accelerator", "emoji": "brain", "category": "Computing",
		"desc": "Boosts your shipboard AI for faster combat learning and XP gain.",
		"effect_key": "mission_xp_mult",
		"tiers": [
			{"id": "neural_accel_1", "cost": 4000, "mission_xp_mult": 0.005}, {"id": "neural_accel_2", "cost": 8000, "mission_xp_mult": 0.005},
			{"id": "neural_accel_3", "cost": 12500, "mission_xp_mult": 0.005}, {"id": "neural_accel_4", "cost": 17500, "mission_xp_mult": 0.005},
			{"id": "neural_accel_5", "cost": 23000, "mission_xp_mult": 0.005}, {"id": "neural_accel_6", "cost": 29000, "mission_xp_mult": 0.005},
			{"id": "neural_accel_7", "cost": 35500, "mission_xp_mult": 0.005}, {"id": "neural_accel_8", "cost": 42500, "mission_xp_mult": 0.005},
			{"id": "neural_accel_9", "cost": 50000, "mission_xp_mult": 0.005}, {"id": "neural_accel_10", "cost": 58000, "mission_xp_mult": 0.005},
		],
	},
	"cargo_hold": {
		"name": "Cargo Hold", "emoji": "package", "category": "Storage",
		"desc": "Expands your cargo bay so you can carry more gear before your inventory fills.",
		"effect_key": "inventory_cap_bonus",
		"tiers": [
			{"id": "cargo_hold_1", "cost": 6000, "inventory_cap_bonus": 1}, {"id": "cargo_hold_2", "cost": 12000, "inventory_cap_bonus": 1},
			{"id": "cargo_hold_3", "cost": 19000, "inventory_cap_bonus": 1}, {"id": "cargo_hold_4", "cost": 27000, "inventory_cap_bonus": 1},
			{"id": "cargo_hold_5", "cost": 36000, "inventory_cap_bonus": 1}, {"id": "cargo_hold_6", "cost": 46000, "inventory_cap_bonus": 1},
			{"id": "cargo_hold_7", "cost": 57000, "inventory_cap_bonus": 1}, {"id": "cargo_hold_8", "cost": 69000, "inventory_cap_bonus": 1},
			{"id": "cargo_hold_9", "cost": 82000, "inventory_cap_bonus": 1}, {"id": "cargo_hold_10", "cost": 96000, "inventory_cap_bonus": 1},
		],
	},
}

const MOD_ORDER: PackedStringArray = [
	"fuel_tank", "fuel_efficiency", "warp_drive", "stardust_magnet", "neural_accel", "cargo_hold",
]


static func active_ship_id(character: Dictionary) -> String:
	var sid := str(character.get("active_ship", "scout"))
	return sid if SHIP_TYPES.has(sid) else "scout"


static func owned_ships(character: Dictionary) -> Array:
	var out: Array = ["scout"]
	var raw: Variant = character.get("owned_ships", [])
	if typeof(raw) == TYPE_ARRAY:
		for s in raw:
			var sid := str(s)
			if sid not in out and SHIP_TYPES.has(sid):
				out.append(sid)
	return out


static func owns_ship(character: Dictionary, ship_id: String) -> bool:
	return ship_id in owned_ships(character)


static func loadout_for(character: Dictionary, ship_id: String = "") -> Array:
	var sid := ship_id if not ship_id.is_empty() else active_ship_id(character)
	var loadouts: Variant = character.get("ship_mod_loadouts", {})
	if typeof(loadouts) == TYPE_DICTIONARY:
		var mods: Variant = (loadouts as Dictionary).get(sid, [])
		if typeof(mods) == TYPE_ARRAY:
			return mods
	return []


static func installed_tier_count(character: Dictionary, category: String, ship_id: String = "") -> int:
	var prefix := category + "_"
	var n := 0
	for mid in loadout_for(character, ship_id):
		if str(mid).begins_with(prefix):
			n += 1
	return n


static func next_mod_tier(character: Dictionary, category: String, ship_id: String = "") -> Dictionary:
	var cat: Dictionary = SHIP_MODS.get(category, {})
	if cat.is_empty():
		return {}
	var tiers: Array = cat.get("tiers", [])
	var have := installed_tier_count(character, category, ship_id)
	if have >= tiers.size():
		return {}
	return tiers[have]


static func tier_cost(tier: Dictionary, ship_id: String) -> int:
	var mult := float(SHIP_TYPES.get(ship_id, {}).get("cost_mult", 1.0))
	return maxi(1, int(round(float(tier.get("cost", 0)) * mult)))


static func active_fuel_mounts(character: Dictionary) -> Array:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return []
	var out: Array = []
	var raw: Variant = character.get("active_fuel_mounts", [])
	if typeof(raw) != TYPE_ARRAY:
		return out
	var now_ms := int(Time.get_unix_time_from_system() * 1000.0)
	for m in raw:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		var exp := _parse_iso_ms(str(m.get("expires_at", "")))
		if exp > now_ms:
			out.append(m)
	return out


static func fuel_speed(character: Dictionary) -> float:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return 0.0
	var best := 0.0
	for m in active_fuel_mounts(character):
		best = maxf(best, float(m.get("speed", 0)))
	return best


## Gameplay max fuel while hangar is retired — base tank only (saved ship data intact).
static func effective_max_fuel(character: Dictionary) -> int:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return FUEL_MAX_BASE
	return maxi(1, int(character.get("max_fuel", FUEL_MAX_BASE)))


static func upgrade_mult(ship_id: String = "") -> float:
	var sid := ship_id if not ship_id.is_empty() else "scout"
	return float(SHIP_TYPES.get(sid, {}).get("upgrade_mult", 1.0))


## Sum of a given effect across active-ship mods + hull inherent (web getModEffectTotal).
static func mod_effect_total(character: Dictionary, effect_key: String) -> float:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return 0.0
	var sid := active_ship_id(character)
	var mult := upgrade_mult(sid)
	var mod_sum := 0.0
	for mid in loadout_for(character, sid):
		var id := str(mid)
		for cat in MOD_ORDER:
			var prefix := cat + "_"
			if not id.begins_with(prefix):
				continue
			var per: Dictionary = MOD_EFFECT_PER_TIER.get(cat, {})
			mod_sum += float(per.get(effect_key, 0.0))
			break
	var inherent: Dictionary = SHIP_TYPES.get(sid, {}).get("inherent", {})
	return mod_sum * mult + float(inherent.get(effect_key, 0.0))


## Effective mission duration after warp mods + strongest fuel mount (web getEffectiveMissionDuration).
static func effective_mission_duration(character: Dictionary, mission: Dictionary) -> int:
	var warp := mod_effect_total(character, "mission_duration_reduction")
	var speed := fuel_speed(character)
	var total := minf(REDUCTION_CAP, warp + speed)
	var raw := maxi(1, int(floor(float(mission.get("duration_seconds", 0)) * (1.0 - total))))
	return maxi(15, int(round(float(raw) / 15.0)) * 15)


## Fuel charged at launch — pinned fuel_cost OR effective minutes − fuel injectors.
static func effective_fuel_cost(character: Dictionary, mission: Dictionary) -> float:
	if mission.has("fuel_cost") and typeof(mission["fuel_cost"]) in [TYPE_FLOAT, TYPE_INT]:
		return maxf(0.25, snappedf(float(mission["fuel_cost"]), 0.01))
	var secs := effective_mission_duration(character, mission)
	var raw := float(secs) / 60.0 - mod_effect_total(character, "fuel_cost_reduction")
	return maxf(0.25, snappedf(raw, 0.01))


static func mount_by_id(mount_id: int) -> Dictionary:
	for m in FUEL_MOUNTS:
		if int(m.get("id", 0)) == mount_id:
			return m
	return {}


static func _parse_iso_ms(iso: String) -> int:
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
	return int(Time.get_unix_time_from_datetime_string(s)) * 1000


const SCOUT_MILESTONE_LEVEL := 20
const FUEL_MAX_BASE := 100


static func inherent_label(ship: Dictionary) -> String:
	var inh: Dictionary = ship.get("inherent", {})
	var parts: PackedStringArray = []
	if float(inh.get("mission_stardust_mult", 0)) > 0:
		parts.append("+%s%% Stardust" % int(round(float(inh["mission_stardust_mult"]) * 100.0)))
	if float(inh.get("mission_xp_mult", 0)) > 0:
		parts.append("+%s%% XP" % int(round(float(inh["mission_xp_mult"]) * 100.0)))
	if float(inh.get("mission_duration_reduction", 0)) > 0:
		parts.append("-%s%% Time" % int(round(float(inh["mission_duration_reduction"]) * 100.0)))
	if float(inh.get("fuel_cost_reduction", 0)) > 0:
		parts.append("-%s Fuel" % str(inh["fuel_cost_reduction"]))
	var mult := float(ship.get("upgrade_mult", 1.0))
	if mult > 1.0:
		parts.append("+%s%% Upgrade Power" % int(round((mult - 1.0) * 100.0)))
	return " · ".join(parts)


static func tier_effect_label(tier: Dictionary, ship_id: String) -> String:
	if tier.is_empty():
		return ""
	var mult := upgrade_mult(ship_id)
	var parts: PackedStringArray = []
	if tier.has("max_fuel_bonus"):
		parts.append("+%s Max Fuel" % int(round(float(tier["max_fuel_bonus"]) * mult)))
	if tier.has("fuel_cost_reduction"):
		parts.append("-%s Fuel Cost" % str(snappedf(float(tier["fuel_cost_reduction"]) * mult, 0.1)))
	if tier.has("mission_duration_reduction"):
		var pct := float(tier["mission_duration_reduction"]) * mult * 100.0
		parts.append("-%s%% Time" % str(snappedf(pct, 0.1)).trim_suffix(".0"))
	if tier.has("mission_stardust_mult"):
		var pct2 := float(tier["mission_stardust_mult"]) * mult * 100.0
		parts.append("+%s%% Stardust" % str(snappedf(pct2, 0.1)).trim_suffix(".0"))
	if tier.has("mission_xp_mult"):
		var pct3 := float(tier["mission_xp_mult"]) * mult * 100.0
		parts.append("+%s%% XP" % str(snappedf(pct3, 0.1)).trim_suffix(".0"))
	if tier.has("inventory_cap_bonus"):
		parts.append("+%s Inventory" % int(round(float(tier["inventory_cap_bonus"]) * mult)))
	return " · ".join(parts)


static func scout_milestone_status(character: Dictionary) -> Dictionary:
	var claimed := false
	var milestones: Variant = character.get("ship_milestones", {})
	if typeof(milestones) == TYPE_DICTIONARY:
		claimed = bool((milestones as Dictionary).get("scout_bay", false))
	var level := int(character.get("level", 1))
	var eligible := level >= SCOUT_MILESTONE_LEVEL
	return {
		"level": SCOUT_MILESTONE_LEVEL,
		"claimed": claimed,
		"eligible": eligible,
		"ready": eligible and not claimed,
	}
