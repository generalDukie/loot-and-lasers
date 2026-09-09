class_name StimCatalog
extends RefCounted
## Stim presentation overlay — mirrors src/lib/productionMath/stimPresentation.js.
## Gameplay authority is the Node API. Existing bag stims without visual_id stay flasks.

const STIM_SVG_DIR := "res://Assets/Stims/"
const STIM_SVG_IMPORT_SCALE := 3.0
const STIM_SVG_HAS_OWN_FRAME := false
const STIM_VISUAL_ID_PREFIX := "stim"
const STIM_VISUAL_ID_SEPARATOR := "_"
const STIM_ATTRIBUTE_COUNT := 5
const STIM_RARITY_DESIGN_COUNT := 3
const STIM_CATALOG_SIZE := STIM_ATTRIBUTE_COUNT * STIM_RARITY_DESIGN_COUNT

## Mirrors src/lib/productionMath/stimPresentation.js. Keys are visual ids.
const STIM_PRESENTATION := {
	"stim_strength_uncommon": {"name": "Strength Field Injector"},
	"stim_agility_uncommon": {"name": "Agility Field Injector"},
	"stim_intellect_uncommon": {"name": "Intellect Field Injector"},
	"stim_vitality_uncommon": {"name": "Vitality Field Injector"},
	"stim_luck_uncommon": {"name": "Luck Field Injector"},
	"stim_strength_rare": {"name": "Strength Precision Injector"},
	"stim_agility_rare": {"name": "Agility Precision Injector"},
	"stim_intellect_rare": {"name": "Intellect Precision Injector"},
	"stim_vitality_rare": {"name": "Vitality Precision Injector"},
	"stim_luck_rare": {"name": "Luck Precision Injector"},
	"stim_strength_epic": {"name": "Strength Infusion Capsule"},
	"stim_agility_epic": {"name": "Agility Infusion Capsule"},
	"stim_intellect_epic": {"name": "Intellect Infusion Capsule"},
	"stim_vitality_epic": {"name": "Vitality Infusion Capsule"},
	"stim_luck_epic": {"name": "Luck Infusion Capsule"},
}


static func catalog_size() -> int:
	return STIM_CATALOG_SIZE


static func svg_import_scale() -> float:
	return STIM_SVG_IMPORT_SCALE


static func svg_has_own_frame() -> bool:
	return STIM_SVG_HAS_OWN_FRAME


static func is_stim_visual_id(visual_id: String) -> bool:
	var id := visual_id.strip_edges()
	return id.begins_with(STIM_VISUAL_ID_PREFIX + STIM_VISUAL_ID_SEPARATOR)


static func visual_id(stat: String, rarity: String) -> String:
	var s := stat.strip_edges().to_lower()
	var r := rarity.strip_edges().to_lower()
	if s.is_empty() or r.is_empty():
		return ""
	return "%s%s%s%s%s" % [STIM_VISUAL_ID_PREFIX, STIM_VISUAL_ID_SEPARATOR, s, STIM_VISUAL_ID_SEPARATOR, r]


static func svg_path(visual_id: String) -> String:
	var id := visual_id.strip_edges()
	if not is_stim_visual_id(id):
		return ""
	return STIM_SVG_DIR + id + ".svg"


static func display_name(visual_id: String) -> String:
	var id := visual_id.strip_edges()
	var raw: Variant = STIM_PRESENTATION.get(id, {})
	if typeof(raw) != TYPE_DICTIONARY:
		return id
	var name := str(raw.get("name", "")).strip_edges()
	return name if not name.is_empty() else id
