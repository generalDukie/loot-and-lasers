class_name GameData
extends RefCounted
## Shared enums / defaults for Phase 1 character creation (mirrors web gameData).

const RACES: PackedStringArray = ["Zyrathi", "Cognati", "Luminae", "Grothak", "Synthara"]

const CLASSES: PackedStringArray = [
	"Vanguard",
	"Shadow Operative",
	"Technomancer",
	"Astral Warden",
	"Void Runner",
	"Cosmic Engineer",
]

const RACE_SKINS := {
	"Zyrathi": ["#2D5A3D", "#8B4513", "#4A0E4E", "#1C3D5A"],
	"Cognati": ["#C0C0C0", "#1a1a2e", "#0D2137", "#3D3D3D"],
	"Luminae": ["#E8D5B7", "#C9B8FF", "#B8E6FF", "#FFE4B5"],
	"Grothak": ["#696969", "#8B7355", "#4A4A4A", "#5C4033"],
	"Synthara": ["#2E1A47", "#1A3C34", "#3D1F1F", "#1A1A3C"],
}

const DEFAULT_APPEARANCE := {
	"eye_style": "Standard Optics",
	"ears": "Tapered",
	"mouth": "Set Jaw",
	"nose": "Button",
	"eyebrows": "Standard",
	"marking": "None",
}

const EYE_STYLES: PackedStringArray = [
	"Standard Optics", "Prism Optics", "Multi-Lens", "Target Visor", "Wide Scan", "Combat Slits",
]
const EAR_STYLES: PackedStringArray = [
	"Tapered", "Finned", "Sensor Stalks", "Elongated", "Crest Horns", "None",
]
const MOUTH_STYLES: PackedStringArray = [
	"Set Jaw", "Tusked", "Mandible", "Proboscis", "Closed", "Grim Line",
]
const NOSE_STYLES: PackedStringArray = [
	"Button", "Slits", "Trunk", "None", "Ridge", "Spike",
]
const BROW_STYLES: PackedStringArray = [
	"Standard", "Tactical", "Heavy", "None", "Scarred", "Relaxed",
]
const MARKINGS: PackedStringArray = [
	"None", "Battle Scar", "Plasma Burns", "War Paint", "Speckled", "Fractured",
]

## Web RaceCard / CharacterCreation catalog (src/lib/gameData.js RACES).
const RACE_ACCENT := {
	"Zyrathi": Color("#FF6B1A"),
	"Cognati": Color("#00E5FF"),
	"Luminae": Color("#C9B8FF"),
	"Grothak": Color("#FF8C42"),
	"Synthara": Color("#9D6BFF"),
}

const RACE_CATALOG := {
	"Zyrathi": {
		"emoji": "🐉",
		"tagline": "Scaled hotheads from the Ember Nebula",
		"lore": "Dragonfolk with armor for skin and a temper for fuel. They punch first, negotiate later, and insist the smoking crater was 'defensive.' Great at war. Terrible at dinner parties.",
		"bonuses": {"strength": 0.03, "vitality": 0.02},
	},
	"Cognati": {
		"emoji": "🤖",
		"tagline": "Walking spreadsheets with laser opinions",
		"lore": "Half chrome, half attitude, fully convinced they already simulated this conversation. They run the numbers, win the argument, then blue-screen when someone asks how their day was.",
		"bonuses": {"intellect": 0.03, "agility": 0.02},
	},
	"Luminae": {
		"emoji": "🌟",
		"tagline": "Living disco balls with a hero complex",
		"lore": "Starlight given legs and an ego. They light up corridors, blind friends by accident, and somehow always land on their feet. Bring sunglasses. And maybe a mirror.",
		"bonuses": {"intellect": 0.02, "luck": 0.03},
	},
	"Grothak": {
		"emoji": "💪",
		"tagline": "High-gravity tanks who treat walls as suggestions",
		"lore": "Grew up where the air weighs more than your regrets. Slow to start, impossible to stop, and vaguely offended by doors. If it needs smashing, hire a Grothak. If it needs subtlety… also hire a Grothak, then apologize.",
		"bonuses": {"strength": 0.02, "vitality": 0.03},
	},
	"Synthara": {
		"emoji": "🎭",
		"tagline": "Face-swappers from the Shadow Reach",
		"lore": "Professional strangers. They borrow faces, walk into restricted zones, and leave with the goods plus your dignity. Trust them? Sure. Just count the spoons afterward.",
		"bonuses": {"agility": 0.03, "luck": 0.02},
	},
}

const CLASS_TYPE_BASE := {
	"strength": {"strength": 15, "agility": 8, "intellect": 6, "vitality": 14, "luck": 7},
	"agility": {"strength": 7, "agility": 15, "intellect": 7, "vitality": 11, "luck": 10},
	"intellect": {"strength": 6, "agility": 8, "intellect": 15, "vitality": 13, "luck": 8},
}

const STAT_ICONS := {
	"strength": "⚔", "agility": "💨", "intellect": "🧠", "vitality": "❤", "luck": "🍀",
}

const STAT_COLORS := {
	"strength": Color("#F59E0B"),
	"agility": Color("#34D399"),
	"intellect": Color("#60A5FA"),
	"vitality": Color("#FB7185"),
	"luck": Color("#C084FC"),
}

## Web ClassCard / CharacterCreation catalog (src/lib/gameData.js CLASSES).
const CLASS_CATALOG := {
	"Vanguard": {
		"emoji": "⚔",
		"tagline": "Heavy hitter with reliable Strength damage",
		"description": "Slow, heavy-hitting powerhouse. Vanguards wade into the thick of it with massive weapons — Strength fuels their damage, not armor.",
		"primaryStat": "strength",
		"secondaryStat": "vitality",
		"baseType": "strength",
		"special": {
			"name": "Kinetic Tantrum",
			"effect": "When an enemy dodges you, your next attack is a guaranteed hit and Crit at 2.0×. When you dodge, your next attack is a guaranteed Crit (still can be dodged).",
			"identity": "Punish every dodge with overwhelming force.",
		},
	},
	"Shadow Operative": {
		"emoji": "🗡",
		"tagline": "Dodges attacks and lands devastating critical hits",
		"description": "Operating from the shadows, these elite agents weave between blows and answer every dodge with a killing strike.",
		"primaryStat": "agility",
		"secondaryStat": "luck",
		"baseType": "agility",
		"special": {
			"name": "Phantom Signal",
			"effect": "The first two attacks against you at combat start are forced misses (not dodges).",
			"identity": "Leave only a hologram for the opening volleys.",
		},
	},
	"Technomancer": {
		"emoji": "⚡",
		"tagline": "High burst Tech damage that partially pierces resists",
		"description": "Blending psionic arts with overclocked tech, Technomancers unleash explosive Tech bursts. Intellect fuels damage — not Tech Resistance.",
		"primaryStat": "intellect",
		"secondaryStat": "luck",
		"baseType": "intellect",
		"special": {
			"name": "Overclock",
			"effect": "Each normal attack adds a stack (+12.5% damage dealt, +5% damage taken). Enemy Crits remove 3 stacks.",
			"identity": "Push the core until it screams.",
		},
	},
	"Astral Warden": {
		"emoji": "🛡",
		"tagline": "Strength-fueled survivor with shields and regeneration",
		"description": "Not a healer — a survivor. Astral Wardens smash through fights with raw strength while layering shields and regeneration to simply refuse to die.",
		"primaryStat": "strength",
		"secondaryStat": "vitality",
		"baseType": "strength",
		"special": {
			"name": "Astral Barrier",
			"effect": "10% chance at the start of each turn to raise a barrier equal to 15% Max HP (restores to full if already active).",
			"identity": "The class that simply refuses to die.",
		},
	},
	"Void Runner": {
		"emoji": "☄",
		"tagline": "Blazing agility — strikes come in pairs",
		"description": "Born in the slipstreams between stars, Void Runners fight at a tempo others can't match. They weave, feint, and land a twin strike before the enemy finishes blinking.",
		"primaryStat": "agility",
		"secondaryStat": "luck",
		"baseType": "agility",
		"special": {
			"name": "Dirty Tricks",
			"effect": "At combat start, randomly gain Flashbang (+7.5% Dodge uncapped), Targeting Beacon (+7.5% Crit uncapped), or Stim Injector (two opening attacks before the opponent).",
			"identity": "Never fight fair.",
		},
	},
	"Cosmic Engineer": {
		"emoji": "🔧",
		"tagline": "Gadgets, drones, and status effects win over time",
		"description": "If it can be built, hacked, or jury-rigged, a Cosmic Engineer is already deploying it. Drones, poisons, burns, and EMPs turn the fight into a war of attrition they always win.",
		"primaryStat": "intellect",
		"secondaryStat": "luck",
		"baseType": "intellect",
		"special": {
			"name": "Orbital Assistant",
			"effect": "Every second turn after your attack: Fire Support (60% True Damage), Defensive Protocol (−25% next hit), or Acquire Target (+40% Crit next attack, uncapped).",
			"identity": "Wins through gadgets and sustained pressure.",
		},
	},
}


static func race_info(race_name: String) -> Dictionary:
	var info: Dictionary = RACE_CATALOG.get(race_name, {}).duplicate(true)
	info["name"] = race_name
	info["skinColors"] = RACE_SKINS.get(race_name, ["#2D5A3D"])
	return info


static func class_info(class_name_key: String) -> Dictionary:
	var info: Dictionary = CLASS_CATALOG.get(class_name_key, {}).duplicate(true)
	info["name"] = class_name_key
	var base_type := str(info.get("baseType", "strength"))
	info["baseStats"] = (CLASS_TYPE_BASE.get(base_type, CLASS_TYPE_BASE["strength"]) as Dictionary).duplicate()
	return info


static func preview_stats(race_name: String, class_name_key: String) -> Dictionary:
	var cls := class_info(class_name_key)
	var stats: Dictionary = cls.get("baseStats", {}).duplicate()
	var race := race_info(race_name)
	var bonuses: Dictionary = race.get("bonuses", {})
	for k in bonuses.keys():
		stats[k] = int(round(float(stats.get(k, 0)) * (1.0 + float(bonuses[k]))))
	return stats


const WEAPON_EMOJIS := {
	"Plasma Rifle": "🔫", "Ion Blaster": "⚡", "Photon Cannon": "💥", "Pulse Repeater": "🔫",
	"Neutrino Sniper": "🎯", "Graviton Shotgun": "💥", "Phase Pistol": "🔫", "Singularity Cannon": "🌌",
	"Void Saber": "⚔️", "Photon Cleaver": "⚔️", "Starforged Blade": "⚔️",
	"Quantum Dagger": "🗡️", "Shadow Needle": "🗡️", "Phase Knife": "🗡️",
	"Nebula Bow": "🏹", "Ion Longbow": "🏹",
	"Graviton Axe": "🪓", "Titan Maul": "🪓",
	"Arc Staff": "🔮", "Psionic Wand": "🔮",
}


static func weapon_emoji_for(name: String, base_name: String = "") -> String:
	if not base_name.is_empty() and WEAPON_EMOJIS.has(base_name):
		return str(WEAPON_EMOJIS[base_name])
	for key in WEAPON_EMOJIS.keys():
		if name.find(str(key)) >= 0:
			return str(WEAPON_EMOJIS[key])
	var n := name.to_lower()
	if _name_has(n, ["sword", "blade", "saber", "katana", "cleaver"]):
		return "⚔️"
	if _name_has(n, ["dagger", "knife", "needle", "silencer"]):
		return "🗡️"
	if _name_has(n, ["staff", "wand", "caster", "rod"]):
		return "🔮"
	if _name_has(n, ["bow", "crossbow", "longbow"]):
		return "🏹"
	if _name_has(n, ["axe", "hammer", "mace", "maul"]):
		return "🪓"
	if _name_has(n, ["cannon", "shotgun", "launcher"]):
		return "💥"
	if n.find("sniper") >= 0:
		return "🎯"
	if _name_has(n, ["rifle", "pistol", "gun", "repeater", "blaster"]):
		return "🔫"
	return "⚔️"


## swing | stab | shoot — drives attack motion + SFX.
static func weapon_combat_style_for(name: String, base_name: String = "", emoji: String = "") -> String:
	var e := emoji if not emoji.is_empty() else weapon_emoji_for(name, base_name)
	if e in ["⚔️", "🪓"]:
		return "swing"
	if e in ["🗡️", "🔪"]:
		return "stab"
	var n := ("%s %s" % [base_name, name]).to_lower()
	if _name_has(n, ["sword", "blade", "saber", "katana", "cleaver", "axe", "hammer", "mace", "maul", "club"]):
		return "swing"
	if _name_has(n, ["dagger", "knife", "needle", "silencer", "rapier"]):
		return "stab"
	return "shoot"


static func _name_has(haystack: String, needles: Array) -> bool:
	for needle in needles:
		if haystack.find(str(needle)) >= 0:
			return true
	return false


static func weapon_from_items(items: Array) -> Dictionary:
	for it in items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if str(it.get("type", "")) != "weapon":
			continue
		var wname := str(it.get("name", "Weapon"))
		var base := str(it.get("base_name", ""))
		var emoji := weapon_emoji_for(wname, base)
		var rarity := str(it.get("rarity", "common"))
		return {
			"name": wname,
			"base_name": base,
			"emoji": emoji,
			"style": weapon_combat_style_for(wname, base, emoji),
			"rarity": rarity,
			"color": ClientUi.rarity_color(rarity),
		}
	return {
		"name": "Fist",
		"base_name": "Fist",
		"emoji": "🥊",
		"style": "swing",
		"rarity": "common",
		"color": Color("#F87171"),
	}


static func default_appearance_for_race(race: String) -> Dictionary:
	var skins: Array = RACE_SKINS.get(race, ["#2D5A3D"])
	var appearance := DEFAULT_APPEARANCE.duplicate()
	appearance["skin_color"] = skins[0]
	return appearance


static func build_create_payload(
	char_name: String,
	race: String,
	class_key: String,
	is_first: bool,
	appearance: Dictionary = {}
) -> Dictionary:
	var looks := appearance if not appearance.is_empty() else default_appearance_for_race(race)
	if not looks.has("skin_color"):
		looks["skin_color"] = default_appearance_for_race(race).get("skin_color", "#2D5A3D")
	return {
		"name": char_name.strip_edges(),
		"race": race,
		"class": class_key,
		"nova_crystals": 100 if is_first else 0,
		"appearance": looks,
		"equipped_items": {},
		"legacy_name": "",
		"legacy_display": "surname",
	}


## Black Market — display countdown only. Server EnsureShop owns stock + 12h ET windows.
## Prefer ShopManager.shop_window (from Node) when available; this helper is a coarse UTC fallback.
const SHOP_WINDOW_MS := 12 * 60 * 60 * 1000
const SHOP_REFRESH_COST := 20
const STARDUST_COLOR := Color("#E879F9")

const VENDOR_LINES: PackedStringArray = [
	"Cash only. No names. No receipts.",
	"If the badge asks, you found it in a wreck.",
	"Hot piece under the tarp — don't make me shout.",
	"Everything's clean. Relatively.",
	"You blink, someone else buys it.",
	"I don't do refunds. I do introductions.",
	"Price is a suggestion. Manners aren't.",
	"Smells like ozone and opportunity in here.",
	"Don't touch the crate unless you're buying the crate.",
	"Whisper what you need. I'll pretend I didn't hear.",
  "Market's honest. My smile isn't.",
	"Come back after midnight — same junk, better stories.",
]


static func get_shop_window() -> Dictionary:
	var ms := int(Time.get_unix_time_from_system() * 1000.0)
	var idx := int(ms / SHOP_WINDOW_MS)
	var starts_at := idx * SHOP_WINDOW_MS
	var ends_at := starts_at + SHOP_WINDOW_MS
	return {
		"idx": idx,
		"startsAt": starts_at,
		"endsAt": ends_at,
		"secondsLeft": maxi(0, int((ends_at - ms) / 1000)),
	}


static func format_shop_countdown(sec: int) -> String:
	var s := maxi(0, sec)
	var h := s / 3600
	var m := (s % 3600) / 60
	var r := s % 60
	return "%sh %sm %02ds" % [h, m, r]


static func get_vendor_line(seed: int = 0) -> String:
	var i := absi(seed) % VENDOR_LINES.size()
	return VENDOR_LINES[i]


static func gear_type_label(type_key: String) -> String:
	if type_key.is_empty():
		return ""
	if type_key == "accessory":
		return "Ring"
	return type_key.substr(0, 1).to_upper() + type_key.substr(1)


static func stat_color(stat: String) -> Color:
	if STAT_COLORS.has(stat):
		return STAT_COLORS[stat]
	return Color("#FBBF24")
