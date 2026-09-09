class_name JunkCatalog
extends RefCounted
## Junk / trinket presentation overlay — mirrors src/lib/productionMath/junkPresentation.js.
## Gameplay authority is the Node API. Existing bag junk without visual_id stays gems.

const JUNK_SVG_DIR := "res://Assets/Junk/"
const JUNK_SVG_IMPORT_SCALE := 3.0
const JUNK_SVG_HAS_OWN_FRAME := false
const JUNK_VISUAL_ID_PREFIX := "trinket"
const JUNK_VISUAL_ID_SEPARATOR := "_"
const JUNK_CATALOG_SIZE := 10
const JUNK_VISUAL_ID_INDEX_ORIGIN := 1
const JUNK_VISUAL_ID_INDEX_DIGITS := 2

## Mirrors src/lib/productionMath/junkPresentation.js. Keys are visual ids.
const JUNK_PRESENTATION := {
	"trinket_01": {
		"name": "Cracked Data Slate",
		"flavor": "Battered tablet with a shattered unlit screen, missing upper corner, tarnished casing, and one taped edge.",
	},
	"trinket_02": {
		"name": "Stripped Gear Cluster",
		"flavor": "Three mismatched tarnished gears with missing teeth, uneven spoke slots, and a crooked axle.",
	},
	"trinket_03": {
		"name": "Spent Power Cell",
		"flavor": "Dented discarded battery with corroded terminals, faded warning stripes, scraped paint, and a crushed lower casing.",
	},
	"trinket_04": {
		"name": "Tangled Cable Nest",
		"flavor": "Loose tangled loops of faded insulated cable with frayed wire ends, mismatched broken connectors, and a taped splice.",
	},
	"trinket_05": {
		"name": "Busted Service Bot",
		"flavor": "Tiny discarded maintenance robot with a cracked dead face display, one missing wheel, a dangling repair arm, and a patched shell.",
	},
	"trinket_06": {
		"name": "Crushed Ration Tin",
		"flavor": "Flattened food tin with a peeled-back lid, dented rim, crushed sides, and a scraped, faded label.",
	},
	"trinket_07": {
		"name": "Clouded Optic Lens",
		"flavor": "Scratched and clouded glass in a bent metal rim, with a fractured mounting tab and rust around the lower bracket.",
	},
	"trinket_08": {
		"name": "Snapped Antenna",
		"flavor": "Kinked aerial on a cracked mounting base, with a snapped tip, rusty swivel joint, and loose exposed wiring.",
	},
	"trinket_09": {
		"name": "Obsolete Credit Reader",
		"flavor": "Chunky discarded payment terminal with a dead scratched display, missing buttons, a jammed card slot, and a cracked side casing.",
	},
	"trinket_10": {
		"name": "Counterfeit Prize Idol",
		"flavor": "Cheap gold-painted plastic prize figure with chipped coating, crude molded features, and a broken pedestal exposing dull plastic underneath.",
	},
}


static func catalog_size() -> int:
	return JUNK_CATALOG_SIZE


static func svg_import_scale() -> float:
	return JUNK_SVG_IMPORT_SCALE


static func svg_has_own_frame() -> bool:
	return JUNK_SVG_HAS_OWN_FRAME


static func is_junk_visual_id(visual_id: String) -> bool:
	var id := visual_id.strip_edges()
	return id.begins_with(JUNK_VISUAL_ID_PREFIX + JUNK_VISUAL_ID_SEPARATOR)


static func visual_id(index: int) -> String:
	if index < JUNK_VISUAL_ID_INDEX_ORIGIN:
		return ""
	if index >= JUNK_VISUAL_ID_INDEX_ORIGIN + JUNK_CATALOG_SIZE:
		return ""
	return "%s%s%s" % [
		JUNK_VISUAL_ID_PREFIX,
		JUNK_VISUAL_ID_SEPARATOR,
		str(index).pad_zeros(JUNK_VISUAL_ID_INDEX_DIGITS),
	]


static func svg_path(visual_id: String) -> String:
	var id := visual_id.strip_edges()
	if not is_junk_visual_id(id):
		return ""
	return JUNK_SVG_DIR + id + ".svg"


static func display_name(visual_id: String) -> String:
	var id := visual_id.strip_edges()
	var raw: Variant = JUNK_PRESENTATION.get(id, {})
	if typeof(raw) != TYPE_DICTIONARY:
		return id
	var name := str(raw.get("name", "")).strip_edges()
	return name if not name.is_empty() else id
