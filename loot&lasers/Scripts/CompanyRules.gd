class_name CompanyRules
extends RefCounted
## Presentation constants for Corporate Offices. Gameplay authority is the Node API.

const COMPANY_ID_DTD := "DTD"
const COMPANY_ID_TTT := "TTT"
const COMPANY_ID_RDR := "RDR"
const COMPANY_ID_GORP := "GORP"

const COMPANY_IDS: PackedStringArray = [
	COMPANY_ID_DTD,
	COMPANY_ID_TTT,
	COMPANY_ID_RDR,
	COMPANY_ID_GORP,
]

const SHIPMENT_ITEM_COUNT := 5
const SHIPMENT_BONUS_PERCENT := 10
const SHIPMENT_REPUTATION_REWARD := 100
const COMPANY_REPUTATION_PER_LEVEL := 1500
const RARE_COMMISSION_STAT_COUNT := 3
const RARE_WEIGHT_MIN_PERCENT := 20
const RARE_WEIGHT_MAX_PERCENT := 60
const RARE_WEIGHT_TOTAL_PERCENT := 100
const EPIC_PRIMARY_PERCENT := 30
const EPIC_VITALITY_PERCENT := 30
const EPIC_LUCK_PERCENT := 20
const EPIC_RANDOM_REMAINDER_PERCENT := 20

const STAT_KEYS: PackedStringArray = [
	"strength",
	"agility",
	"intellect",
	"vitality",
	"luck",
]

const STAT_LABELS := {
	"strength": "Strength",
	"agility": "Agility",
	"intellect": "Intellect",
	"vitality": "Vitality",
	"luck": "Luck",
}

const SLOT_LABELS := {
	"helmet": "Helmet",
	"armor": "Armor",
	"legs": "Legs",
	"boots": "Boots",
	"neck": "Neck",
	"accessory": "Accessory",
	"weapon": "Weapon",
	"ship_module": "Ship Module",
}

const COMPANY_COLORS := {
	COMPANY_ID_DTD: Color("#F59E0B"),
	COMPANY_ID_TTT: Color("#64748B"),
	COMPANY_ID_RDR: Color("#F87171"),
	COMPANY_ID_GORP: Color("#34D399"),
}

const COMPANY_NAMES := {
	COMPANY_ID_DTD: "Duct Tape Dynamics",
	COMPANY_ID_TTT: "Terribly Tedious Technologies",
	COMPANY_ID_RDR: "Run-Down Robotics",
	COMPANY_ID_GORP: "GORPTEK",
}

const COMPANY_ABBREV := {
	COMPANY_ID_DTD: "DTD",
	COMPANY_ID_TTT: "TTT",
	COMPANY_ID_RDR: "RDR",
	COMPANY_ID_GORP: "GORP",
}

const COMPANY_SLOTS := {
	COMPANY_ID_DTD: PackedStringArray(["helmet", "armor", "legs", "boots"]),
	COMPANY_ID_TTT: PackedStringArray(["armor", "boots", "neck", "accessory"]),
	COMPANY_ID_RDR: PackedStringArray(["helmet", "legs", "weapon", "ship_module"]),
	COMPANY_ID_GORP: PackedStringArray(["weapon", "neck", "accessory", "ship_module"]),
}


static func color_for(company_id: String) -> Color:
	return COMPANY_COLORS.get(company_id, ClientUi.CYAN) as Color


static func display_name(company_id: String) -> String:
	return str(COMPANY_NAMES.get(company_id, company_id))


static func abbreviation(company_id: String) -> String:
	return str(COMPANY_ABBREV.get(company_id, company_id))


static func slots_for(company_id: String) -> PackedStringArray:
	return COMPANY_SLOTS.get(company_id, PackedStringArray()) as PackedStringArray


static func slot_label(slot: String) -> String:
	return str(SLOT_LABELS.get(slot, slot.replace("_", " ").capitalize()))


static func stat_label(stat: String) -> String:
	return str(STAT_LABELS.get(stat, stat.capitalize()))


static func rarity_label(rarity: String) -> String:
	var key := rarity.strip_edges().to_lower()
	if key == "epic":
		return "Epic"
	return "Rare"
