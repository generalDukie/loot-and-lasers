class_name CollectiblesCatalog
extends RefCounted
## Cosmic Vault catalogs — mirrors src/lib/collectibles.js.

const SPECIES := [
	{"id": 1, "name": "Voidglider", "rarity": "rare", "lore": "Drifts through hard vacuum feeding on starlight."},
	{"id": 2, "name": "Ember Wraith", "rarity": "uncommon", "lore": "A living flame that haunts volcanic worlds."},
	{"id": 3, "name": "Frost Lich", "rarity": "epic", "lore": "Ancient sorcerers preserved in eternal ice."},
	{"id": 4, "name": "Quartzling", "rarity": "uncommon", "lore": "Sentient crystals that hum in harmonic chords."},
	{"id": 5, "name": "Nebulax", "rarity": "rare", "lore": "Born inside a nebula, it is more cloud than creature."},
	{"id": 6, "name": "Sporeling", "rarity": "common", "lore": "A walking fungus that spreads with every step."},
	{"id": 7, "name": "Krakoth", "rarity": "rare", "lore": "Abyssal apex predator with teeth like stalactites."},
	{"id": 8, "name": "Solaris Moth", "rarity": "rare", "lore": "Drawn to dying stars; its wings store solar fire."},
	{"id": 9, "name": "Void Crab", "rarity": "uncommon", "lore": "Armored scavenger that nests in wrecked hulls."},
	{"id": 10, "name": "Plasma Wisp", "rarity": "epic", "lore": "A spark of pure energy that dances between dimensions."},
	{"id": 11, "name": "Core Worm", "rarity": "rare", "lore": "Burrows through planetary cores, swallowing stone."},
	{"id": 12, "name": "Star Jelly", "rarity": "uncommon", "lore": "Floating bioluminescent drifter of the deep void."},
	{"id": 13, "name": "Magma Golem", "rarity": "epic", "lore": "A titan of cooled lava with a molten heart."},
	{"id": 14, "name": "Echo Specter", "rarity": "rare", "lore": "A memory given form; it repeats your last words."},
	{"id": 15, "name": "Iron Scarab", "rarity": "common", "lore": "Mechanoid insect that swarms derelict stations."},
	{"id": 16, "name": "Storm Harpy", "rarity": "uncommon", "lore": "Rides ion storms, screaming static."},
	{"id": 17, "name": "Abyssal Angler", "rarity": "rare", "lore": "Lures prey with a false star on its forehead."},
	{"id": 18, "name": "Crystal Mantis", "rarity": "rare", "lore": "Strikes faster than light refracts through its blades."},
	{"id": 19, "name": "Void Leviathan", "rarity": "legendary", "lore": "A serpent long enough to eclipse a small moon."},
	{"id": 20, "name": "Pollen Sprite", "rarity": "common", "lore": "Tiny fey that bloom only on garden worlds."},
	{"id": 21, "name": "Rust Specter", "rarity": "uncommon", "lore": "A corroded drone still running on a dead captain's orders."},
	{"id": 22, "name": "Glacial Titan", "rarity": "epic", "lore": "A roaming iceberg given cruel intelligence."},
	{"id": 23, "name": "Photon Serpent", "rarity": "rare", "lore": "Slithers along beams of light, leaving rainbows."},
	{"id": 24, "name": "Bramble Beast", "rarity": "uncommon", "lore": "Rooted predator that waits centuries for one meal."},
	{"id": 25, "name": "Tidal Naga", "rarity": "rare", "lore": "Surfs the gravity tides of shattered moons."},
	{"id": 26, "name": "Cinder Imp", "rarity": "common", "lore": "Mischievous fire-sprite that ignites fuses for fun."},
	{"id": 27, "name": "Null Cub", "rarity": "epic", "lore": "A cub of the Null King; absorbs light around it."},
	{"id": 28, "name": "Prism Drake", "rarity": "epic", "lore": "Scales split white light into weaponized spectra."},
	{"id": 29, "name": "Gravmoth", "rarity": "rare", "lore": "Bends gravity with each wingbeat."},
	{"id": 30, "name": "Genesis Eye", "rarity": "legendary", "lore": "The watcher at World Zero. It saw the beginning."},
]

const ART_PREFIX := ["Codex", "Shard", "Heart", "Eye", "Crown", "Key", "Core", "Seal", "Tome", "Blade", "Orb", "Scepter", "Compass", "Mask", "Horn"]
const ART_SUFFIX := [
	"of the Void", "of Eternity", "of the Nebula", "of the Abyss", "of First Light",
	"of the Singularity", "of the Ancients", "of the Endless", "of the Forgotten", "of Genesis",
	"of the Rift", "of the Cosmos", "of the Pale Star", "of the Deep", "of the Last Dawn",
]
const REL_ADJ := [
	"Cracked", "Glowing", "Ancient", "Rusted", "Shimmering", "Frozen", "Burned", "Whispering",
	"Pulsing", "Fractured", "Dusty", "Polished", "Cursed", "Blessed", "Singing", "Molten",
	"Petrified", "Translucent", "Tarnished", "Humming",
]
const REL_NOUN := [
	"Idol", "Amulet", "Coin", "Charm", "Totem", "Sigil", "Tablet", "Fragment", "Token", "Talisman",
	"Reliquary", "Shard", "Mote", "Wisp", "Vessel", "Censer", "Pendant", "Rune", "Glyph", "Mark",
	"Seal", "Brand", "Figurine", "Locket", "Crest",
]


static func artifact(id: int) -> Dictionary:
	var i := id - 1
	if i < 0:
		return {}
	var rarity := "common"
	if i < 8:
		rarity = "legendary"
	elif i < 24:
		rarity = "epic"
	elif i < 55:
		rarity = "rare"
	elif i < 80:
		rarity = "uncommon"
	return {
		"id": id,
		"name": "%s %s" % [ART_PREFIX[i % 15], ART_SUFFIX[int(floor(float(i) / 15.0)) % 15]],
		"rarity": rarity,
		"lore": "Recovered relic #%s. Its origin predates recorded galactic history." % id,
	}


static func relic(id: int) -> Dictionary:
	var i := id - 1
	if i < 0:
		return {}
	var rarity := "common"
	if i < 15:
		rarity = "legendary"
	elif i < 50:
		rarity = "epic"
	elif i < 160:
		rarity = "rare"
	elif i < 320:
		rarity = "uncommon"
	return {
		"id": id,
		"name": "%s %s" % [REL_ADJ[i % 20], REL_NOUN[int(floor(float(i) / 20.0)) % 25]],
		"rarity": rarity,
		"lore": "A minor relic of a forgotten people.",
	}


static func species_by_id(id: int) -> Dictionary:
	for s in SPECIES:
		if int(s.get("id", 0)) == id:
			return s
	return {}


static func owned_ids(raw: Variant) -> Dictionary:
	var out := {}
	if typeof(raw) != TYPE_ARRAY:
		return out
	for v in raw:
		out[int(v)] = true
	return out


static func badge_count(character: Dictionary, dungeon_view: Dictionary = {}) -> int:
	return badge_ids(character, dungeon_view).size()


static func badge_ids(character: Dictionary, dungeon_view: Dictionary = {}) -> PackedStringArray:
	var view := dungeon_view
	if view.is_empty() and typeof(character.get("dungeon", null)) == TYPE_DICTIONARY:
		view = character.get("dungeon", {})
	return DungeonRules.badge_ids_from_character(character, view)


## Gear catalog — mirrors productionMath COMPANY_GEAR_CATALOG (48 company variants).
static func gear_catalog() -> Array:
	var out: Array = []
	for row in CompanyRules.gear_catalog():
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = row
		var itype := str(entry.get("type", ""))
		var vid := str(entry.get("id", ""))
		var iname := str(entry.get("name", vid))
		if itype.is_empty() or vid.is_empty():
			continue
		out.append({"id": "%s:%s" % [itype, vid], "name": iname, "type": itype, "visual_id": vid})
	return out


static func discovered_gear_ids(character: Dictionary) -> Dictionary:
	var out := {}
	var catalog := {}
	for entry in gear_catalog():
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var key := str(entry.get("id", ""))
		if not key.is_empty():
			catalog[key] = true
	var raw: Variant = character.get("discovered_gear", [])
	if typeof(raw) != TYPE_ARRAY:
		return out
	for v in raw:
		var key := str(v)
		if key.is_empty() or not catalog.has(key):
			continue
		out[key] = true
	return out


## Best-effort: mark catalog variants discovered after claiming loot items.
static func keys_from_items(items: Array) -> Array:
	var out: Array = []
	var catalog := gear_catalog()
	for it in items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		var itype := str(it.get("type", ""))
		var visual := str(it.get("visual_id", "")).strip_edges()
		if not itype.is_empty() and not visual.is_empty():
			out.append("%s:%s" % [itype, visual])
			continue
		var base := str(it.get("base_name", ""))
		if not base.is_empty() and not itype.is_empty():
			var matched := false
			for e in catalog:
				if str(e.get("type", "")) != itype:
					continue
				if str(e.get("name", "")) == base or str(e.get("visual_id", "")) == base:
					out.append(str(e.get("id", "")))
					matched = true
					break
			if matched:
				continue
			out.append("%s:%s" % [itype, base])
			continue
		var iname := str(it.get("name", ""))
		for e in catalog:
			if str(e.get("type", "")) == itype and iname.contains(str(e.get("name", ""))):
				out.append(str(e.get("id", "")))
				break
	return out
