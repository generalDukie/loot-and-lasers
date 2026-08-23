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
	"Zyrathi": ["#9B2D2D", "#8B4513", "#4A0E4E", "#1C3D5A"],
	"Cognati": ["#B4B8BC", "#8C9098", "#5C6068", "#3E4248"],
	"Luminae": ["#E8D5B7", "#C9B8FF", "#B8E6FF", "#F0D090"],
	"Grothak": ["#696969", "#8B7355", "#4A4A4A", "#5C4033"],
	"Synthara": ["#2E1A47", "#1A3C34", "#3D1F1F", "#1A1A3C"],
}

## Player-picked feature glow colors (eyes, marks, ports, etc.) — brighter than skins.
const RACE_ACCENT_TONES := {
	"Zyrathi": ["#FF6B1A", "#34D399", "#FBBF24", "#FB7185"],
	"Cognati": ["#00E5FF", "#60A5FA", "#A78BFA", "#F59E0B"],
	"Luminae": ["#F6C84C", "#C9B8FF", "#7DD3FC", "#F2A0C0"],
	"Grothak": ["#FF8C42", "#FBBF24", "#F87171", "#A3E635"],
	"Synthara": ["#B794F6", "#34D399", "#FB7185", "#38BDF8"],
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
	"Standard", "Tactical", "Heavy", "None", "Scarred", "Relaxed", "Angry",
]
const MARKINGS: PackedStringArray = [
	"None", "Battle Scar", "Plasma Burns", "War Paint", "Speckled", "Fractured",
]

## Race-gated Looks options. Missing races fall back to the global lists above.
## Single-entry ears = race-default (locked in the creator).
const RACE_APPEARANCE := {
	"Zyrathi": {
		"eye_style": [
			"Standard Optics", "Ember Gaze", "Prism Optics",
		],
		"ears": ["None"],
		"mouth": [
			"Tusked", "Set Jaw", "Grim Line", "Wide Grin", "Mandible", "Closed",
		],
		"nose": ["Ridge", "Slits", "Spike", "Button", "None"],
		"eyebrows": ["Heavy", "Standard", "Tactical", "Angry", "Scarred", "None"],
		"marking": [
			"None", "Battle Scar", "War Paint", "Speckled", "Plasma Burns",
		],
	},
	"Synthara": {
		"eye_style": [
			"Combat Slits", "Target Visor", "Wide Scan", "Dead Gaze", "Prism Optics",
		],
		"ears": ["Chassis Ports"],
		"mouth": [
			"Set Jaw", "Closed", "Grim Line", "Mandible", "Proboscis", "Tusked",
		],
		"nose": ["Slits", "Ridge", "None", "Spike", "Button"],
		"eyebrows": ["Standard", "Tactical", "Heavy", "Angry", "None", "Scarred"],
		"marking": [
			"None", "Fractured", "Plasma Burns", "Battle Scar", "Speckled",
		],
	},
	"Grothak": {
		"eye_style": [
			"Standard Optics", "Wide Scan", "Heavy Lids", "Prism Optics",
		],
		"ears": ["None"],
		"mouth": [
			"Tusked", "Set Jaw", "Grim Line", "Closed", "Wide Grin", "Mandible",
		],
		"nose": ["Button", "Ridge", "Slits", "Spike", "None"],
		"eyebrows": ["Heavy", "Standard", "Tactical", "Angry", "Scarred", "None"],
		"marking": [
			"None", "Battle Scar", "War Paint", "Speckled", "Plasma Burns",
		],
	},
	"Cognati": {
		"eye_style": [
			"Standard Optics", "Target Visor", "Combat Slits", "Prism Optics",
		],
		"ears": ["None"],
		"mouth": [
			"Set Jaw", "Grim Line", "Mandible", "Proboscis",
		],
		"nose": ["Slits", "Ridge", "None", "Button", "Spike"],
		"eyebrows": [],
		"marking": [],
	},
	"Luminae": {
		"eye_style": [
			"Standard Optics", "Wide Scan", "Cyclops", "Prism Optics",
		],
		"ears": ["None"],
		"mouth": [
			"Set Jaw", "Closed", "Grim Line", "Wide Grin",
		],
		"nose": ["Button", "Slits", "Ridge", "None"],
		"eyebrows": ["Relaxed", "Standard", "None", "Tactical", "Heavy", "Angry"],
		"marking": [
			"None", "Speckled", "War Paint", "Fractured", "Plasma Burns",
		],
	},
}

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
		"emoji": "alien",
		"tagline": "Scaled hotheads from the Ember Nebula",
		"lore": "Dragonfolk with armor for skin and a temper for fuel. They punch first, negotiate later, and insist the smoking crater was 'defensive.' Great at war. Terrible at dinner parties.",
	},
	"Cognati": {
		"emoji": "bot",
		"tagline": "Walking spreadsheets with laser opinions",
		"lore": "Half chrome, half attitude, fully convinced they already simulated this conversation. They run the numbers, win the argument, then blue-screen when someone asks how their day was.",
	},
	"Luminae": {
		"emoji": "rainbow",
		"tagline": "Living disco balls with a hero complex",
		"lore": "Starlight given legs and an ego. They light up corridors, blind friends by accident, and somehow always land on their feet. Bring sunglasses. And maybe a mirror.",
	},
	"Grothak": {
		"emoji": "biceps-flexed",
		"tagline": "High-gravity tanks who treat walls as suggestions",
		"lore": "Grew up where the air weighs more than your regrets. Slow to start, impossible to stop, and vaguely offended by doors. If it needs smashing, hire a Grothak. If it needs subtlety… also hire a Grothak, then apologize.",
	},
	"Synthara": {
		"emoji": "drama",
		"tagline": "Face-swappers from the Shadow Reach",
		"lore": "Professional strangers. They borrow faces, walk into restricted zones, and leave with the goods plus your dignity. Trust them? Sure. Just count the spoons afterward.",
	},
}

const CLASS_TYPE_BASE := {
	"strength": {"strength": 15, "agility": 8, "intellect": 6, "vitality": 14, "luck": 7},
	"agility": {"strength": 7, "agility": 15, "intellect": 7, "vitality": 11, "luck": 10},
	"intellect": {"strength": 6, "agility": 8, "intellect": 15, "vitality": 13, "luck": 8},
}

## Attribute badges are TextureRects via StatIcon — not emoji strings.
## Kept empty so any leftover string concat stays blank rather than showing stale glyphs.
const STAT_ICONS := {
	"strength": "", "agility": "", "intellect": "", "vitality": "", "luck": "",
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
		"tagline": "Rage induced strength. Doesn't like dodges",
		"description": "Vanguards meet the galaxy head-on, turning raw Might and a questionable relationship with self-preservation into overwhelming force. Missing one only seems to make them take the next swing personally.",
		"primaryStat": "strength",
		"baseType": "strength",
		"special": {
			"name": "Kinetic Tantrum",
			"effect": "When the Vanguard dodges, their next attack is a guaranteed 1.5× crit. When their attack is dodged, their next attack is guaranteed to [u]hit[/u] and [u]crit[/u] for 2.0× damage.",
			"identity": "Punish every dodge with overwhelming force.",
		},
	},
	"Shadow Operative": {
		"tagline": "You'll see their hologram before them",
		"description": "Shadow Operatives weaponize Reflex, misdirection, and precision to ensure the enemy is always firing at where they used to be. By the time you've found the real one, they've usually finished the job.",
		"primaryStat": "agility",
		"baseType": "agility",
		"special": {
			"name": "Phantom Signal",
			"effect": "The first incoming attack against the Shadow Operative is a guaranteed miss (not a Dodge). Every 10th Shadow turn re-primes the next incoming attack.",
			"identity": "Leave only a hologram for the opening volleys.",
		},
	},
	"Technomancer": {
		"tagline": "Relies on powerful but unstable Tech",
		"description": "Technomancers push forbidden technology beyond every sensible operating limit, converting raw Tech into increasingly catastrophic firepower. Warning labels are generally treated as optimization suggestions.",
		"primaryStat": "intellect",
		"baseType": "intellect",
		"special": {
			"name": "Overclock",
			"effect": "Each attack attempt grants an Overclock stack (max 6): +12.5% damage dealt and +5% damage taken per stack. A 6-stack attack resolves at full power, then vents to 4. Enemy Crits remove 2 stacks.",
			"identity": "Push the core until it screams.",
		},
	},
	"Astral Warden": {
		"tagline": "A natural protector with powerful shields",
		"description": "Astral Wardens are immovable bulwarks whose immense Might is matched only by their unnatural resilience. Even when their defenses finally crack, the cosmos has an irritating habit of putting them back together.",
		"primaryStat": "strength",
		"baseType": "strength",
		"special": {
			"name": "Astral Barrier",
			"effect": "At the start of each turn, the Astral Warden has a 10% chance to gain or fully restore a barrier equal to 15% of maximum HP.",
			"identity": "The class that simply refuses to die.",
		},
	},
	"Void Runner": {
		"tagline": "Masters of the jury-rig",
		"description": "Void Runners survive the frontier through lightning Reflexes and an impressive collection of devices of questionable legality. Fair fights are mostly something that happens to other people.",
		"primaryStat": "agility",
		"baseType": "agility",
		"special": {
			"name": "Dirty Tricks",
			"effect": "At combat start, one random Dirty Trick. Distinct second and third tricks deploy at total combat turns 14 and 28. Flashbang +7.5 Dodge, Targeting Beacon +7.5 Crit (both cap-bypass), Stim Injector takes the next two attack turns.",
			"identity": "Never fight fair.",
		},
	},
	"Cosmic Engineer": {
		"tagline": "Has a trusted Drone buddy",
		"description": "Cosmic Engineers turn Tech into an arsenal of machines, drones, and improvised solutions that keep fighting long after common sense says they shouldn't. A good Engineer never fights alone... and rarely knows exactly what their equipment will do next.",
		"primaryStat": "intellect",
		"baseType": "intellect",
		"special": {
			"name": "Orbital Assistant",
			"effect": "On Engineer turns 2, 4, 6, 8, 10, then every 3rd turn from 13, the drone acts before the Engineer attacks and picks Fire Support (60% True Damage), Defensive Protocol (−25% until the Engineer is hit), or Acquire Target (+40 Crit on that attack).",
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


static func preview_stats(_race_name: String, class_name_key: String) -> Dictionary:
	var cls := class_info(class_name_key)
	return (cls.get("baseStats", {}) as Dictionary).duplicate()


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


static func appearance_options_for(race: String, field: String) -> PackedStringArray:
	var gated: Variant = RACE_APPEARANCE.get(race, {})
	if typeof(gated) == TYPE_DICTIONARY and (gated as Dictionary).has(field):
		var raw: Variant = (gated as Dictionary)[field]
		if typeof(raw) == TYPE_ARRAY or typeof(raw) == TYPE_PACKED_STRING_ARRAY:
			return PackedStringArray(raw)
	match field:
		"eye_style":
			return EYE_STYLES
		"ears":
			return EAR_STYLES
		"mouth":
			return MOUTH_STYLES
		"nose":
			return NOSE_STYLES
		"eyebrows":
			return BROW_STYLES
		"marking":
			return MARKINGS
		_:
			return PackedStringArray()


## Empty string = player picks ears. Non-empty = race signature, always on.
static func locked_ears_for_race(race: String) -> String:
	var opts := appearance_options_for(race, "ears")
	if opts.size() == 1:
		return str(opts[0])
	return ""


static func accent_tones_for_race(race: String) -> Array:
	return RACE_ACCENT_TONES.get(race, ["#B794F6"]) as Array


static func default_appearance_for_race(race: String) -> Dictionary:
	var skins: Array = RACE_SKINS.get(race, ["#2D5A3D"])
	var accents: Array = accent_tones_for_race(race)
	var appearance := DEFAULT_APPEARANCE.duplicate()
	appearance["skin_color"] = skins[0]
	appearance["accent_color"] = str(accents[0]) if not accents.is_empty() else "#B794F6"
	for field in ["eye_style", "ears", "mouth", "nose", "eyebrows", "marking"]:
		var opts := appearance_options_for(race, field)
		if not opts.is_empty():
			appearance[field] = opts[0]
	return appearance


static func random_appearance_for_race(race: String, rng: RandomNumberGenerator = null) -> Dictionary:
	var r := rng
	if r == null:
		r = RandomNumberGenerator.new()
		r.randomize()
	var appearance := default_appearance_for_race(race)
	var skins: Array = RACE_SKINS.get(race, ["#2D5A3D"])
	if not skins.is_empty():
		appearance["skin_color"] = str(skins[r.randi_range(0, skins.size() - 1)])
	var accents: Array = accent_tones_for_race(race)
	if not accents.is_empty():
		appearance["accent_color"] = str(accents[r.randi_range(0, accents.size() - 1)])
	for field in ["eye_style", "mouth", "nose", "eyebrows", "marking"]:
		var opts := appearance_options_for(race, field)
		if not opts.is_empty():
			appearance[field] = opts[r.randi_range(0, opts.size() - 1)]
	var locked := locked_ears_for_race(race)
	if not locked.is_empty():
		appearance["ears"] = locked
	else:
		var ears := appearance_options_for(race, "ears")
		if not ears.is_empty():
			appearance["ears"] = ears[r.randi_range(0, ears.size() - 1)]
	return appearance


static func clamp_appearance_to_race(race: String, appearance: Dictionary) -> Dictionary:
	var out := appearance.duplicate()
	# Synthara renamed Ember Gaze → Dead Gaze.
	if race == "Synthara" and str(out.get("eye_style", "")) == "Ember Gaze":
		out["eye_style"] = "Dead Gaze"
	for field in ["eye_style", "ears", "mouth", "nose", "eyebrows", "marking"]:
		var opts := appearance_options_for(race, field)
		if opts.is_empty():
			# Race opted out of this slot (e.g. Cognati brows / markings).
			if field == "marking" or field == "eyebrows":
				out[field] = "None"
			continue
		var cur := str(out.get(field, ""))
		if opts.find(cur) < 0:
			out[field] = opts[0]
	var locked := locked_ears_for_race(race)
	if not locked.is_empty():
		out["ears"] = locked
	var accents := accent_tones_for_race(race)
	var accent_cur := str(out.get("accent_color", ""))
	if accents.is_empty():
		pass
	elif accents.find(accent_cur) < 0:
		out["accent_color"] = str(accents[0])
	return out

static func build_create_payload(
	char_name: String,
	race: String,
	class_key: String,
	_is_first: bool,
	appearance: Dictionary = {}
) -> Dictionary:
	var looks := appearance if not appearance.is_empty() else default_appearance_for_race(race)
	if not looks.has("skin_color"):
		looks["skin_color"] = default_appearance_for_race(race).get("skin_color", "#2D5A3D")
	if not looks.has("accent_color"):
		looks["accent_color"] = default_appearance_for_race(race).get("accent_color", "#B794F6")
	# Legacy identity is account-owned; Node re-stamps it from the user row on create.
	var legacy_name := ""
	var legacy_display := "surname"
	if AuthManager != null:
		legacy_name = LegacyName.clean_text(AuthManager.user.get("legacy_name", ""))
		legacy_display = LegacyName.normalize_display(AuthManager.user.get("legacy_display", "surname"))
	return {
		"name": char_name.strip_edges(),
		"race": race,
		"class": class_key,
		"appearance": looks,
		"equipped_items": {},
		"legacy_name": legacy_name,
		"legacy_display": legacy_display,
	}


## Black Market — display countdown only. Server EnsureShop owns stock + 12h ET windows.
## Prefer ShopManager.shop_window (from Node) when available; this helper is a coarse UTC fallback.
const SHOP_WINDOW_MS := 12 * 60 * 60 * 1000
const SHOP_REFRESH_COST := 20
const STARDUST_COLOR := Color("#E879F9")
const MILLISECONDS_PER_SECOND := 1_000.0
const SECONDS_PER_MINUTE := 60
const MINUTES_PER_HOUR := 60

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
	var ms := int(Time.get_unix_time_from_system() * MILLISECONDS_PER_SECOND)
	var idx := int(ms / SHOP_WINDOW_MS)
	var starts_at := idx * SHOP_WINDOW_MS
	var ends_at := starts_at + SHOP_WINDOW_MS
	return {
		"idx": idx,
		"startsAt": starts_at,
		"endsAt": ends_at,
		"secondsLeft": maxi(0, int((ends_at - ms) / MILLISECONDS_PER_SECOND)),
	}


static func format_shop_countdown(sec: int) -> String:
	var s := maxi(0, sec)
	var seconds_per_hour := SECONDS_PER_MINUTE * MINUTES_PER_HOUR
	var h := s / seconds_per_hour
	var m := (s % seconds_per_hour) / SECONDS_PER_MINUTE
	var r := s % SECONDS_PER_MINUTE
	return "%sh %sm %02ds" % [h, m, r]


static func get_vendor_line(seed: int = 0) -> String:
	var i := absi(seed) % VENDOR_LINES.size()
	return VENDOR_LINES[i]


static func gear_type_label(type_key: String) -> String:
	if type_key.is_empty():
		return ""
	if type_key == "accessory" or type_key == "ring":
		return "Accessory"
	# Title-case snake_case keys ("ship_module" → "Ship Module"), never keep underscores.
	return type_key.capitalize()


static func stat_color(stat: String) -> Color:
	if STAT_COLORS.has(stat):
		return STAT_COLORS[stat]
	return Color("#FBBF24")
