class_name CantinaCatalog
extends RefCounted
## Cantina mission-contact overlay — mirrors src/lib/productionMath/cantinaContactPresentation.js.
## Gameplay authority is the Node API. Emoji-only persisted boards overlay catalog portraits.

const CANTINA_SVG_DIR := "res://Assets/Cantina/"
const CANTINA_SVG_IMPORT_SCALE := 3.0
const CANTINA_CONTACT_VISUAL_ID_PREFIX := "cantina_contact"
const CANTINA_CONTACT_VISUAL_ID_SEPARATOR := "_"
const CANTINA_COMPANY_COUNT := 4
const CANTINA_CONTACTS_PER_COMPANY := 1
const CANTINA_INDEPENDENT_CONTACT_COUNT := 6
const CANTINA_CONTACT_CATALOG_SIZE := CANTINA_COMPANY_COUNT * CANTINA_CONTACTS_PER_COMPANY + CANTINA_INDEPENDENT_CONTACT_COUNT
const CANTINA_CONTACT_INDEX_ORIGIN := 1
const CANTINA_CONTACT_INDEX_DIGITS := 2

## Mirrors src/lib/productionMath/cantinaContactPresentation.js. Keys are visual ids.
const CANTINA_CONTACT_PRESENTATION := {
	"cantina_contact_01": {"name": "Lady Vessara", "visual_company_id": "CNC"},
	"cantina_contact_02": {"name": "Mara Voss", "visual_company_id": "BJS"},
	"cantina_contact_03": {"name": "Pikk Patch", "visual_company_id": "DTD"},
	"cantina_contact_04": {"name": "Administrator Vale", "visual_company_id": "GORP"},
	"cantina_contact_05": {"name": "Rill Eightfold", "visual_company_id": ""},
	"cantina_contact_06": {"name": "Shard-of-Dawn", "visual_company_id": ""},
	"cantina_contact_07": {"name": "Nima Duskwing", "visual_company_id": ""},
	"cantina_contact_08": {"name": "Ollo Drift", "visual_company_id": ""},
	"cantina_contact_09": {"name": "Morrow Cap", "visual_company_id": ""},
	"cantina_contact_10": {"name": "Ssar Keel", "visual_company_id": ""},
}


static func catalog_size() -> int:
	return CANTINA_CONTACT_CATALOG_SIZE


static func svg_import_scale() -> float:
	return CANTINA_SVG_IMPORT_SCALE


static func is_cantina_visual_id(visual_id: String) -> bool:
	var id := visual_id.strip_edges()
	return id.begins_with(CANTINA_CONTACT_VISUAL_ID_PREFIX + CANTINA_CONTACT_VISUAL_ID_SEPARATOR)


static func visual_id(index: int) -> String:
	if index < CANTINA_CONTACT_INDEX_ORIGIN:
		return ""
	if index >= CANTINA_CONTACT_INDEX_ORIGIN + CANTINA_CONTACT_CATALOG_SIZE:
		return ""
	return "%s%s%s" % [
		CANTINA_CONTACT_VISUAL_ID_PREFIX,
		CANTINA_CONTACT_VISUAL_ID_SEPARATOR,
		str(index).pad_zeros(CANTINA_CONTACT_INDEX_DIGITS),
	]


static func svg_path(visual_id: String) -> String:
	var id := visual_id.strip_edges()
	if not is_cantina_visual_id(id):
		return ""
	return CANTINA_SVG_DIR + id + ".svg"


static func display_name(visual_id: String) -> String:
	var id := visual_id.strip_edges()
	var raw: Variant = CANTINA_CONTACT_PRESENTATION.get(id, {})
	if typeof(raw) != TYPE_DICTIONARY:
		return id
	var name := str(raw.get("name", "")).strip_edges()
	return name if not name.is_empty() else id


static func patron_payload(visual_id: String) -> Dictionary:
	var id := visual_id.strip_edges()
	var raw: Variant = CANTINA_CONTACT_PRESENTATION.get(id, {})
	if typeof(raw) != TYPE_DICTIONARY:
		return {}
	var name := str(raw.get("name", "")).strip_edges()
	if name.is_empty():
		return {}
	return {
		"name": name,
		"visual_id": id,
		"visual_company_id": str(raw.get("visual_company_id", "")).strip_edges(),
	}


static func overlay_offers(offers: Array) -> Array:
	var used := {}
	var cursor := 0
	var out: Array = []
	for offer_raw in offers:
		if typeof(offer_raw) != TYPE_DICTIONARY:
			continue
		var offer: Dictionary = (offer_raw as Dictionary).duplicate(true)
		var patron_raw: Variant = offer.get("patron", {})
		var visual := ""
		if typeof(patron_raw) == TYPE_DICTIONARY:
			visual = str((patron_raw as Dictionary).get("visual_id", "")).strip_edges()
		var payload := patron_payload(visual)
		if payload.is_empty() or used.has(str(payload.get("visual_id", ""))):
			payload = {}
			while cursor < CANTINA_CONTACT_CATALOG_SIZE:
				var candidate := patron_payload(visual_id(CANTINA_CONTACT_INDEX_ORIGIN + cursor))
				cursor += 1
				var cid := str(candidate.get("visual_id", ""))
				if not cid.is_empty() and not used.has(cid):
					payload = candidate
					break
			if payload.is_empty():
				payload = patron_payload(visual_id(CANTINA_CONTACT_INDEX_ORIGIN))
		var pid := str(payload.get("visual_id", ""))
		if not pid.is_empty():
			used[pid] = true
		offer["patron"] = payload
		out.append(offer)
	return out


static var _tex_cache: Dictionary = {}


static func texture(visual_id: String) -> Texture2D:
	var id := visual_id.strip_edges()
	if _tex_cache.has(id):
		return _tex_cache[id] as Texture2D
	var path := svg_path(id)
	var tex: Texture2D = null
	if not path.is_empty() and ResourceLoader.exists(path):
		tex = load(path) as Texture2D
	_tex_cache[id] = tex
	return tex
