class_name MissionBoard
extends RefCounted
## Mission presentation helpers.
##
## Mission-board generation and all gameplay-relevant preview values (duration, Fuel,
## XP, Stardust, efficiency) are owned by Node. Godot requests the board via
## `MissionManager.ensure_board()` → `GetMissionBoard`, then renders the authoritative
## values the server returns.
##
## What remains here is either pure presentation (duration formatting, rarity display
## colours) or non-mission helpers still used by other pages:
##   • `xp_per_fuel`         — used by ArenaRules for an Arena XP estimate.
##   • `collection_percentage` — used by stats.gd for the collection bonus readout.
## Do not reintroduce mission gameplay formulas here; Node is authoritative.

const XP_STARDUST_SCALE := 10
const XP_PER_FUEL_LINEAR := 0.5
const XP_PER_FUEL_POWER := 0.032
const XP_PER_FUEL_EXP := 1.67

## Rarity display order + colours for preview chips (presentation only).
const RARITY_ORDER := ["common", "uncommon", "rare", "epic", "legendary"]
const RARITY_COLORS := {
	"common": Color("#9CA3AF"),
	"uncommon": Color("#22C55E"),
	"rare": Color("#3B82F6"),
	"epic": Color("#A855F7"),
	"legendary": Color("#F59E0B"),
}


## Mission XP/Fuel (game scale). Mirrors server getMissionXpPerFuel: round(design) × 10.
## Client mirror retained for ArenaRules' Arena XP estimate — NOT used for the mission board.
static func xp_per_fuel(level: int) -> int:
	var L := maxi(1, level)
	var pre := 10.0 + XP_PER_FUEL_LINEAR * float(L - 1) + XP_PER_FUEL_POWER * (pow(float(L), XP_PER_FUEL_EXP) - 1.0)
	return maxi(1, int(round(pre))) * XP_STARDUST_SCALE


## Collection bonus percentage — mirrors server getCollectionPercentage(character, 0).
## Used by stats.gd for the collection readout (not a mission-board authority value).
static func collection_percentage(character: Dictionary) -> float:
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


## Human-readable mission duration (presentation only): 300 → "5m", 90 → "1m 30s".
static func format_duration(seconds: int) -> String:
	var s := maxi(0, seconds)
	if s < 60:
		return "%ss" % s
	var m := s / 60
	var r := s % 60
	if r == 0:
		return "%sm" % m
	return "%sm %ss" % [m, r]
