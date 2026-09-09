class_name CantinaPatronIcon
extends Control
## Cantina contact portrait — crops opaque SVG pixels and contain-fits the square,
## same fill path as GearIcon stim/gear glyphs.

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)


static func make(visual_id: String, size_px: float) -> CantinaPatronIcon:
	var icon := CantinaPatronIcon.new()
	icon.set_meta("visual_id", visual_id.strip_edges())
	icon.custom_minimum_size = Vector2(size_px, size_px)
	icon.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	icon.size_flags_vertical = Control.SIZE_EXPAND_FILL
	return icon


func _draw() -> void:
	if size.x < 1.0 or size.y < 1.0:
		return
	var visual := str(get_meta("visual_id", "")).strip_edges()
	var tex := CantinaCatalog.texture(visual)
	if tex == null:
		return
	var dest := Rect2(Vector2.ZERO, size)
	var src := GearIcon.opaque_source_rect(tex)
	draw_texture_rect_region(tex, GearIcon.contain_dest_rect(src.size, dest), src)
