extends RefCounted
class_name DevEnvironmentBadge
## Development-only overlay showing active Nakama backend environment.
## Does not display secrets.


static func attach_to(parent: CanvasItem) -> Label:
	if parent == null:
		return null
	if not BackendEnvironment.is_development_overlay_enabled():
		return null
	var existing := parent.get_node_or_null("DevEnvironmentBadge")
	if existing is Label:
		_refresh(existing)
		return existing

	var lab := Label.new()
	lab.name = "DevEnvironmentBadge"
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.set_anchors_preset(Control.PRESET_TOP_LEFT)
	lab.offset_left = 12
	lab.offset_top = 8
	lab.offset_right = 420
	lab.offset_bottom = 36
	lab.z_index = 1000
	lab.add_theme_font_size_override("font_size", 14)
	lab.add_theme_color_override("font_color", Color(0.95, 0.85, 0.35, 0.95))
	lab.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	lab.add_theme_constant_override("outline_size", 4)
	_refresh(lab)
	parent.add_child(lab)
	return lab


static func _refresh(lab: Label) -> void:
	var pub: Dictionary = BackendEnvironment.get_public_config()
	var node_url := str(pub.get("node_api_base_url", ""))
	if GameApiClient != null:
		node_url = str(GameApiClient.base_url)
	lab.text = "NAKAMA %s · %s://%s:%s (auth)\nNODE gameplay %s" % [
		str(pub.get("environment", "?")).to_upper(),
		str(pub.get("scheme", "")),
		str(pub.get("host", "")),
		str(pub.get("port", "")),
		node_url,
	]
	lab.offset_bottom = 52
