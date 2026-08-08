extends Node
## Central temporary availability gates for Coming Soon systems.
## Autoload so flags resolve before ShipManager / GameManager parse.
## Flip a flag to true to restore the feature without hunting call sites.

const SHIP_HANGAR_ENABLED := false
const VOID_ENABLED := false

const FEATURE_SHIP_HANGAR := "ship_hangar"
const FEATURE_VOID := "void"


func is_enabled(feature_id: String) -> bool:
	match str(feature_id).strip_edges():
		FEATURE_SHIP_HANGAR:
			return SHIP_HANGAR_ENABLED
		FEATURE_VOID:
			return VOID_ENABLED
		_:
			return true


func is_coming_soon(feature_id: String) -> bool:
	var id := str(feature_id).strip_edges()
	if id.is_empty():
		return false
	return not is_enabled(id)


func coming_soon_label(_feature_id: String = "") -> String:
	return "Coming Soon"


func coming_soon_tooltip(feature_id: String) -> String:
	match str(feature_id).strip_edges():
		FEATURE_SHIP_HANGAR:
			return "Ship Hangar — Coming Soon"
		FEATURE_VOID:
			return "Void — Coming Soon"
		_:
			return "Coming Soon"
