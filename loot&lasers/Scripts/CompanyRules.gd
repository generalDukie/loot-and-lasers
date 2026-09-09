class_name CompanyRules
extends RefCounted
## Presentation constants for Corporate Offices and Black Market return shipments.
## Gameplay authority is the Node API.

const COMPANY_ID_CNC := "CNC"
const COMPANY_ID_BJS := "BJS"
const COMPANY_ID_DTD := "DTD"
const COMPANY_ID_GORP := "GORP"

const COMPANY_IDS: PackedStringArray = [
	COMPANY_ID_CNC,
	COMPANY_ID_BJS,
	COMPANY_ID_DTD,
	COMPANY_ID_GORP,
]

const SHIPMENT_ITEM_COUNT := 5
const SHIPMENT_BONUS_PERCENT := 10
const SHIPMENT_REPUTATION_REWARD := 100
const COMPANY_REPUTATION_PER_LEVEL := 1500
const COMPANY_STARTING_LEVEL := 1
const SHIPMENT_DOCK_MODE_SALE := "sale"
const SHIPMENT_DOCK_MODE_SHIPMENT := "shipment"
const SHIPMENT_DOCK_MODE_SAME_COMPANY_INELIGIBLE := "same_company_ineligible"
const SLOT_ALIAS_RING := "ring"
const SLOT_CANONICAL_ACCESSORY := "accessory"
const RARE_COMMISSION_STAT_COUNT := 3
const RARE_WEIGHT_MIN_PERCENT := 20
const RARE_WEIGHT_MAX_PERCENT := 60
const RARE_WEIGHT_TOTAL_PERCENT := 100
const RARE_WEIGHT_DEFAULT_HIGH_PERCENT := 40
const RARE_WEIGHT_DEFAULT_LOW_PERCENT := 20
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

const COMPANY_COLOR_CNC := Color("#E8C547")
const COMPANY_COLOR_BJS := Color("#38BDF8")
const COMPANY_COLOR_DTD := Color("#8B9198")
const COMPANY_COLOR_GORP := Color("#34D399")
const COMPANY_COLORS := {
	COMPANY_ID_CNC: COMPANY_COLOR_CNC,
	COMPANY_ID_BJS: COMPANY_COLOR_BJS,
	COMPANY_ID_DTD: COMPANY_COLOR_DTD,
	COMPANY_ID_GORP: COMPANY_COLOR_GORP,
}

const COMPANY_BADGE_ICON := {
	COMPANY_ID_CNC: "crown",
	COMPANY_ID_BJS: "crosshair",
	COMPANY_ID_DTD: "hard-hat",
	COMPANY_ID_GORP: "cpu",
}

const COMPANY_BADGE_COLOR_CNC := COMPANY_COLOR_CNC
const COMPANY_BADGE_COLOR_BJS := COMPANY_COLOR_BJS
const COMPANY_BADGE_COLOR_DTD := COMPANY_COLOR_DTD
const COMPANY_BADGE_COLOR_GORP := COMPANY_COLOR_GORP
const COMPANY_BADGE_COLORS := {
	COMPANY_ID_CNC: COMPANY_BADGE_COLOR_CNC,
	COMPANY_ID_BJS: COMPANY_BADGE_COLOR_BJS,
	COMPANY_ID_DTD: COMPANY_BADGE_COLOR_DTD,
	COMPANY_ID_GORP: COMPANY_BADGE_COLOR_GORP,
}

const COMPANY_NAMES := {
	COMPANY_ID_CNC: "Crown & Carapace",
	COMPANY_ID_BJS: "Ballistics & Jewelry Services",
	COMPANY_ID_DTD: "Duct-Tape Dynamics",
	COMPANY_ID_GORP: "GORPTEK",
}

const COMPANY_ABBREV := {
	COMPANY_ID_CNC: "C&C",
	COMPANY_ID_BJS: "BJ Services",
	COMPANY_ID_DTD: "DTD",
	COMPANY_ID_GORP: "GORP",
}

const COMPANY_NAME_TOKENS := {
	COMPANY_ID_CNC: "C&C",
	COMPANY_ID_BJS: "BJ Services",
	COMPANY_ID_DTD: "Duct Tape",
	COMPANY_ID_GORP: "GORPTEK",
}

const ORIGIN_MARKET := "market"
const ORIGIN_CONTRABAND := "contraband"
const SHIPMENT_INELIGIBLE_TAG := "No Refunds — Shipment Ineligible"
const COMPANY_OVERFLOW_PENDING := "COMPANY_OVERFLOW_PENDING"
## Matches ClientUi.CYAN without importing that class (avoids class_name parse cycles).
const FALLBACK_ACCENT := Color("#0DCADF")

const COMPANY_SLOTS := {
	COMPANY_ID_CNC: ["helmet", "armor", "legs", "ship_module"],
	COMPANY_ID_BJS: ["helmet", "weapon", "neck", "accessory"],
	COMPANY_ID_DTD: ["legs", "boots", "accessory", "ship_module"],
	COMPANY_ID_GORP: ["armor", "boots", "weapon", "neck"],
}
const COMPANY_GEAR_VARIANT_COUNT := 3
const COMPANY_GEAR_VARIANT_FILE_INDEX_PAD := 2
const COMPANY_GEAR_VARIANT_FILE_INDEX_ORIGIN := 1
const GEAR_SVG_DIR := "res://Assets/Gear/"
## Match nav Lucide SVGs (`svg/scale=3.0` in `.import`) after the 48 glyphs land.
const GEAR_SVG_IMPORT_SCALE := 3.0
## Set true if company SVGs already include a plate/frame (avoids double-framing in GearIcon).
const GEAR_SVG_HAS_OWN_FRAME := false
const WEAPON_COMBAT_STYLE_SWING := "swing"
const WEAPON_COMBAT_STYLE_STAB := "stab"
const WEAPON_COMBAT_STYLE_SHOOT := "shoot"
const WEAPON_COMBAT_STYLES: PackedStringArray = [
	WEAPON_COMBAT_STYLE_SWING,
	WEAPON_COMBAT_STYLE_STAB,
	WEAPON_COMBAT_STYLE_SHOOT,
]
## Mirrors src/lib/productionMath/companyGearPresentation.js. Keys are visual ids.
const COMPANY_GEAR_PRESENTATION := {
	"helmet_cnc_01": { "name": "Grand Carapace" },
	"helmet_cnc_02": { "name": "Sovereign Death-Mask" },
	"helmet_cnc_03": { "name": "Scarab Oracle" },
	"armor_cnc_01": { "name": "Imperial Elytra" },
	"armor_cnc_02": { "name": "Regent Thorn-Mantle" },
	"armor_cnc_03": { "name": "Scarab Reliquary Harness" },
	"legs_cnc_01": { "name": "Duelist Greaves" },
	"legs_cnc_02": { "name": "Royal Shellguards" },
	"legs_cnc_03": { "name": "Court Striders" },
	"ship_module_cnc_01": { "name": "Royal Aegis" },
	"ship_module_cnc_02": { "name": "Throne Drive" },
	"ship_module_cnc_03": { "name": "Oracle Array" },
	"helmet_bjs_01": { "name": "Service Visor" },
	"helmet_bjs_02": { "name": "Counter Ballistic Shield" },
	"helmet_bjs_03": { "name": "Dual-Optic Field Rig" },
	"weapon_bjs_01": { "name": "Service Carbine", "combat_style": WEAPON_COMBAT_STYLE_SHOOT },
	"weapon_bjs_02": { "name": "Breach Marshal", "combat_style": WEAPON_COMBAT_STYLE_SHOOT },
	"weapon_bjs_03": { "name": "Field Breacher", "combat_style": WEAPON_COMBAT_STYLE_SWING },
	"neck_bjs_01": { "name": "Service Tags" },
	"neck_bjs_02": { "name": "Field Gorget" },
	"neck_bjs_03": { "name": "Signal Pendant" },
	"accessory_bjs_01": { "name": "Service Signet" },
	"accessory_bjs_02": { "name": "Field Scanner" },
	"accessory_bjs_03": { "name": "Utility Bracer" },
	"legs_dtd_01": { "name": "Patchwork Worklegs" },
	"legs_dtd_02": { "name": "Scrapwalker Braces" },
	"legs_dtd_03": { "name": "Emergency Overpants" },
	"boots_dtd_01": { "name": "Quickfix Stompers" },
	"boots_dtd_02": { "name": "Springheel Scramblers" },
	"boots_dtd_03": { "name": "Scrapyard Clompers" },
	"accessory_dtd_01": { "name": "Panic Kit" },
	"accessory_dtd_02": { "name": "Lucky Fuse" },
	"accessory_dtd_03": { "name": "Scrapclaw Rig" },
	"ship_module_dtd_01": { "name": "Patchwork Reactor" },
	"ship_module_dtd_02": { "name": "Panic Thruster" },
	"ship_module_dtd_03": { "name": "Scrap Relay" },
	"armor_gorp_01": { "name": "Compliance Vest" },
	"armor_gorp_02": { "name": "Supervisor Yoke" },
	"armor_gorp_03": { "name": "Containment Harness" },
	"boots_gorp_01": { "name": "Compliance Treads" },
	"boots_gorp_02": { "name": "Supervisor Locksteps" },
	"boots_gorp_03": { "name": "Facility Anchors" },
	"weapon_gorp_01": { "name": "Compliance Projector", "combat_style": WEAPON_COMBAT_STYLE_SHOOT },
	"weapon_gorp_02": { "name": "Supervisor's Directive", "combat_style": WEAPON_COMBAT_STYLE_SHOOT },
	"weapon_gorp_03": { "name": "Contract Enforcer", "combat_style": WEAPON_COMBAT_STYLE_SWING },
	"neck_gorp_01": { "name": "Compliance Collar" },
	"neck_gorp_02": { "name": "Supervisor's Seal" },
	"neck_gorp_03": { "name": "Vitality Monitor" },
}

static var _gear_catalog: Array = []


static func color_for(company_id: String) -> Color:
	var raw: Variant = COMPANY_COLORS.get(company_id, FALLBACK_ACCENT)
	if raw is Color:
		return raw
	return FALLBACK_ACCENT


static func display_name(company_id: String) -> String:
	return str(COMPANY_NAMES.get(company_id, company_id))


static func abbreviation(company_id: String) -> String:
	return str(COMPANY_ABBREV.get(company_id, company_id))


static func name_token(company_id: String) -> String:
	return str(COMPANY_NAME_TOKENS.get(company_id, abbreviation(company_id)))


static func is_market_or_contraband_origin(origin: String) -> bool:
	var key := origin.strip_edges().to_lower()
	return key == ORIGIN_MARKET or key == ORIGIN_CONTRABAND


static func slots_for(company_id: String) -> Array:
	var raw: Variant = COMPANY_SLOTS.get(company_id, [])
	if typeof(raw) != TYPE_ARRAY:
		return []
	var out: Array = []
	for slot in raw:
		out.append(str(slot))
	return out


static func gear_visual_id(slot: String, company_id: String, variant_index: int) -> String:
	var n := variant_index + COMPANY_GEAR_VARIANT_FILE_INDEX_ORIGIN
	var suffix := str(n).pad_zeros(COMPANY_GEAR_VARIANT_FILE_INDEX_PAD)
	return "%s_%s_%s" % [canonical_slot(slot), company_id.strip_edges().to_lower(), suffix]


static func gear_svg_path(visual_id: String) -> String:
	var id := visual_id.strip_edges()
	if id.is_empty():
		return ""
	return GEAR_SVG_DIR + id + ".svg"


static func gear_svg_has_own_frame() -> bool:
	return GEAR_SVG_HAS_OWN_FRAME


static func gear_svg_import_scale() -> float:
	return GEAR_SVG_IMPORT_SCALE


static func _presentation_for(visual_id: String) -> Dictionary:
	var raw: Variant = COMPANY_GEAR_PRESENTATION.get(visual_id, {})
	if typeof(raw) != TYPE_DICTIONARY:
		return {"name": visual_id, "combat_style": ""}
	var entry: Dictionary = raw
	var name := str(entry.get("name", "")).strip_edges()
	if name.is_empty():
		name = visual_id
	var style := str(entry.get("combat_style", "")).strip_edges().to_lower()
	if not WEAPON_COMBAT_STYLES.has(style):
		style = ""
	return {"name": name, "combat_style": style}


static func gear_combat_style(visual_id: String) -> String:
	return str(_presentation_for(visual_id).get("combat_style", ""))


static func gear_combat_style_for_name(item_name: String) -> String:
	var key := item_name.strip_edges()
	if key.is_empty():
		return ""
	for row in gear_catalog():
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = row
		if str(entry.get("name", "")) == key or str(entry.get("id", "")) == key:
			return str(entry.get("combat_style", ""))
	return ""


static func gear_catalog() -> Array:
	if not _gear_catalog.is_empty():
		return _gear_catalog
	var rows: Array = []
	for company_id in COMPANY_IDS:
		for slot in slots_for(company_id):
			for i in range(COMPANY_GEAR_VARIANT_COUNT):
				var id := gear_visual_id(str(slot), company_id, i)
				var pres := _presentation_for(id)
				var combat := ""
				if str(slot) == "weapon":
					combat = str(pres.get("combat_style", ""))
				rows.append({
					"id": id,
					"name": str(pres.get("name", id)),
					"type": str(slot),
					"company_id": company_id,
					"combat_style": combat,
				})
	_gear_catalog = rows
	return _gear_catalog


static func slot_label(slot: String) -> String:
	return str(SLOT_LABELS.get(slot, slot.replace("_", " ").capitalize()))


static func stat_label(stat: String) -> String:
	return str(STAT_LABELS.get(stat, stat.capitalize()))


static func rarity_label(rarity: String) -> String:
	var key := rarity.strip_edges().to_lower()
	if key == "epic":
		return "Epic"
	return "Rare"


static func is_company_id(company_id: String) -> bool:
	return COMPANY_IDS.has(company_id)


static func level_from_reputation(reputation: int) -> int:
	return (maxi(0, reputation) / COMPANY_REPUTATION_PER_LEVEL) + COMPANY_STARTING_LEVEL


static func manufacturer_id(item: Dictionary) -> String:
	return str(item.get("manufacturer", "")).strip_edges()


static func manufacturer_badge_icon(company_id: String) -> String:
	return str(COMPANY_BADGE_ICON.get(company_id, ""))


static func manufacturer_badge_color(company_id: String) -> Color:
	return color_for(company_id)


static func should_show_manufacturer_badge(item: Dictionary, sell_tab: bool = false) -> bool:
	if item.is_empty() or not is_company_id(manufacturer_id(item)):
		return false
	if sell_tab:
		return item.get("shipment_eligible") == true
	return true


static func canonical_slot(slot: String) -> String:
	var key := slot.strip_edges().to_lower()
	if key == SLOT_ALIAS_RING:
		return SLOT_CANONICAL_ACCESSORY
	return key


static func manufactures_slot(company_id: String, slot: String) -> bool:
	return slots_for(company_id).has(canonical_slot(slot))


static func shipment_bonus_label() -> String:
	return "+%s%%" % SHIPMENT_BONUS_PERCENT


static func is_shipment_dock_eligible_item(item: Dictionary) -> bool:
	if item.is_empty() or str(item.get("id", "")).strip_edges().is_empty():
		return false
	if bool(item.get("is_equipped", false)):
		return false
	var slot := canonical_slot(str(item.get("type", item.get("slot", ""))))
	if slot.is_empty() or not SLOT_LABELS.has(slot):
		return false
	var manufacturer := str(item.get("manufacturer", "")).strip_edges()
	if not is_company_id(manufacturer):
		return false
	if not manufactures_slot(manufacturer, slot):
		return false
	if is_market_or_contraband_origin(str(item.get("origin", ""))):
		return false
	return item.get("shipment_eligible") == true


static func classify_shipment_dock(items: Array) -> Dictionary:
	var filled: Array = []
	for raw in items:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var item: Dictionary = raw
		if str(item.get("id", "")).strip_edges().is_empty():
			continue
		filled.append(item)
	if filled.size() != SHIPMENT_ITEM_COUNT:
		return {"mode": SHIPMENT_DOCK_MODE_SALE, "company_id": "", "reason": "incomplete"}
	var ids: Dictionary = {}
	var manufacturers: Array[String] = []
	for raw in filled:
		var item: Dictionary = raw
		var iid := str(item.get("id", "")).strip_edges()
		ids[iid] = true
		manufacturers.append(str(item.get("manufacturer", "")).strip_edges())
	if ids.size() != SHIPMENT_ITEM_COUNT:
		return {"mode": SHIPMENT_DOCK_MODE_SALE, "company_id": "", "reason": "duplicate"}
	var unique: Dictionary = {}
	for manufacturer in manufacturers:
		unique[manufacturer] = true
	var company_id := manufacturers[0] if unique.size() == 1 else ""
	var same_live := unique.size() == 1 and is_company_id(company_id)
	if same_live:
		var all_eligible := true
		for raw in filled:
			if not is_shipment_dock_eligible_item(raw):
				all_eligible = false
				break
		if all_eligible:
			return {"mode": SHIPMENT_DOCK_MODE_SHIPMENT, "company_id": company_id, "reason": "qualifying"}
		return {
			"mode": SHIPMENT_DOCK_MODE_SAME_COMPANY_INELIGIBLE,
			"company_id": company_id,
			"reason": "same_company_ineligible",
		}
	return {"mode": SHIPMENT_DOCK_MODE_SALE, "company_id": "", "reason": "mixed"}


static func allocate_shipment_display_values(sell_values: Array, payout: int, bonus: int, base_value: int) -> Array[int]:
	var values: Array[int] = []
	for raw in sell_values:
		values.append(maxi(0, int(raw)))
	var count := values.size()
	var out: Array[int] = []
	if count == 0:
		return out
	var target := maxi(0, payout)
	var bonus_total := maxi(0, bonus)
	var server_base := maxi(0, base_value)
	var share_base := server_base
	if share_base <= 0:
		for value in values:
			share_base += value
	var extras: Array[int] = []
	var assigned := 0
	for i in count:
		extras.append(0)
	if bonus_total > 0 and share_base > 0:
		for i in count:
			extras[i] = int(bonus_total * values[i] / share_base)
			assigned += extras[i]
	var leftover := bonus_total - assigned
	var index := 0
	while leftover > 0 and count > 0:
		extras[index] += 1
		leftover -= 1
		index = (index + 1) % count
	for i in count:
		out.append(values[i] + extras[i])
	var sum := 0
	for amount in out:
		sum += amount
	var delta := target - sum
	index = 0
	var steps := 0
	var max_steps := count * (absi(delta) + 1)
	while delta != 0 and steps < max_steps:
		var slot := index % count
		if delta > 0:
			out[slot] += 1
			delta -= 1
		elif out[slot] > 0:
			out[slot] -= 1
			delta += 1
		index += 1
		steps += 1
	return out


static func format_shipment_delivery_status(data: Dictionary) -> String:
	var parts: Array[String] = []
	var company_name := str(data.get("company_name", "")).strip_edges()
	if not company_name.is_empty():
		parts.append(company_name)
	if data.has("payout"):
		parts.append("%s Stardust" % maxi(0, int(data.get("payout", 0))))
	if data.has("reputation_granted"):
		parts.append("+%s reputation" % maxi(0, int(data.get("reputation_granted", 0))))
	if data.has("company_level"):
		parts.append("company level %s" % maxi(COMPANY_STARTING_LEVEL, int(data.get("company_level", COMPANY_STARTING_LEVEL))))
	var rarity := str(data.get("token_rarity", "")).strip_edges()
	if not rarity.is_empty():
		parts.append("%s token" % rarity)
	if bool(data.get("overflow_pending", false)):
		parts.append("resolve token overflow in Corporate Offices")
	if parts.is_empty():
		return "Shipment delivered."
	return "Shipment delivered: %s." % " · ".join(parts)
