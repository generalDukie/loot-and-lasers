class_name AchievementsCatalog
extends RefCounted
## Achievement catalog + progress targets — mirrors src/lib/achievements.js.

const ENTRIES := [
	{"id": "first_blood", "name": "First Blood", "desc": "Win your first Arena battle", "category": "Combat", "title": "the Skirmisher", "stat": "arena_wins", "target": 1},
	{"id": "ten_kills", "name": "Seasoned Duelist", "desc": "Win 10 Arena battles", "category": "Combat", "title": "the Duelist", "stat": "arena_wins", "target": 10},
	{"id": "fifty_kills", "name": "Gladiator", "desc": "Win 50 Arena battles", "category": "Combat", "title": "the Gladiator", "stat": "arena_wins", "target": 50},
	{"id": "centurion", "name": "Centurion", "desc": "Win 100 Arena battles", "category": "Combat", "title": "the Champion", "stat": "arena_wins", "target": 100},
	{"id": "hot_streak", "name": "Hot Streak", "desc": "Reach a 5-win Arena streak", "category": "Combat", "title": "On Fire", "stat": "arena_max_streak", "target": 5},
	{"id": "unstoppable", "name": "Unstoppable", "desc": "Reach a 10-win Arena streak", "category": "Combat", "title": "Unstoppable", "stat": "arena_max_streak", "target": 10},
	{"id": "rising_star", "name": "Rising Star", "desc": "Reach 1500 Arena rating", "category": "Combat", "title": "Rising Star", "stat": "arena_rating", "target": 1500},
	{"id": "living_legend", "name": "Living Legend", "desc": "Reach 2000 Arena rating", "category": "Combat", "title": "Living Legend", "stat": "arena_rating", "target": 2000},
	{"id": "brawler", "name": "Brawler", "desc": "Fight 25 Arena battles", "category": "Combat", "title": "the Brawler", "stat": "arena_battles", "target": 25},
	{"id": "initiate", "name": "Initiate", "desc": "Reach level 10", "category": "Progression", "title": "Initiate", "stat": "level", "target": 10},
	{"id": "veteran", "name": "Veteran", "desc": "Reach level 50", "category": "Progression", "title": "Veteran", "stat": "level", "target": 50},
	{"id": "ascendant", "name": "Ascendant", "desc": "Reach level 100", "category": "Progression", "title": "Ascendant", "stat": "level", "target": 100},
	{"id": "operative", "name": "Operative", "desc": "Complete 50 missions", "category": "Progression", "title": "the Operative", "stat": "missions_completed", "target": 50},
	{"id": "wayfarer", "name": "Wayfarer", "desc": "Complete 500 missions", "category": "Progression", "title": "the Wayfarer", "stat": "missions_completed", "target": 500},
	{"id": "spelunker", "name": "Spelunker", "desc": "Clear 1 dungeon", "category": "Exploration", "title": "Spelunker", "stat": "dungeon_clears", "target": 1},
	{"id": "delver", "name": "Delver", "desc": "Clear 25 dungeons", "category": "Exploration", "title": "the Delver", "stat": "dungeon_clears", "target": 25},
	{"id": "depths_walker", "name": "Depths Walker", "desc": "Clear 100 dungeons", "category": "Exploration", "title": "the Depths Walker", "stat": "dungeon_clears", "target": 100},
	{"id": "frontier_scout", "name": "Frontier Scout", "desc": "Reach sector 5", "category": "Exploration", "title": "Frontier Scout", "stat": "highest_sector", "target": 5},
	{"id": "pathfinder", "name": "Pathfinder", "desc": "Reach sector 10", "category": "Exploration", "title": "the Pathfinder", "stat": "highest_sector", "target": 10},
	{"id": "xenobiologist", "name": "Xenobiologist", "desc": "Discover 25 species", "category": "Exploration", "title": "the Xenobiologist", "stat": "discovered_species", "target": 25},
	{"id": "curator", "name": "Curator", "desc": "Collect 10 artifacts", "category": "Exploration", "title": "the Curator", "stat": "collected_artifacts", "target": 10},
	{"id": "relic_keeper", "name": "Relic Keeper", "desc": "Collect 5 relics", "category": "Exploration", "title": "the Relic Keeper", "stat": "collected_relics", "target": 5},
	{"id": "stardust_collector", "name": "Stardust Collector", "desc": "Earn 10,000 total stardust", "category": "Economy", "title": "Stardust Collector", "stat": "total_stardust_earned", "target": 10000},
	{"id": "star_baron", "name": "Star Baron", "desc": "Earn 1,000,000 total stardust", "category": "Economy", "title": "Star Baron", "stat": "total_stardust_earned", "target": 1000000},
]

const CATEGORIES := ["Combat", "Progression", "Exploration", "Economy"]


static func _stat_value(character: Dictionary, stat: String) -> int:
	match stat:
		"discovered_species", "collected_artifacts", "collected_relics":
			var raw: Variant = character.get(stat, [])
			return (raw as Array).size() if typeof(raw) == TYPE_ARRAY else 0
		_:
			return int(character.get(stat, 0))


static func progress(entry: Dictionary, character: Dictionary) -> Dictionary:
	var target := int(entry.get("target", 0))
	if target <= 0:
		return {}
	var current := mini(_stat_value(character, str(entry.get("stat", ""))), target)
	return {"current": current, "target": target}


static func is_unlocked(entry: Dictionary, character: Dictionary) -> bool:
	var ids: Variant = character.get("unlocked_achievements", [])
	if typeof(ids) == TYPE_ARRAY and str(entry.get("id", "")) in ids:
		return true
	# Preview unlock from live stats (server still authoritative on sync).
	var p := progress(entry, character)
	if p.is_empty():
		return false
	return int(p.get("current", 0)) >= int(p.get("target", 1))


static func entry_by_id(ach_id: String) -> Dictionary:
	for e in ENTRIES:
		if str(e.get("id", "")) == ach_id:
			return e
	return {}


## Human-readable names for newly_unlocked ids from a server payload.
static func names_for_ids(ids: Array) -> PackedStringArray:
	var out: PackedStringArray = []
	for raw in ids:
		var id := str(raw)
		if id.is_empty():
			continue
		var e := entry_by_id(id)
		out.append(str(e.get("name", id)) if not e.is_empty() else id)
	return out
