class_name CombatFxLayer
extends RefCounted
## Presentation FX for duel overlays — float numbers, sparks, shake, flash.
## Independent of combat simulation; knobs come from CombatBeatConfig.

var host: Control ## Stage-local FX parent
var shake_target: Control
var flash_rect: ColorRect
var cfg: CombatBeatConfig

var _float_pool: Array[Control] = []
var _spark_pool: Array[TextureRect] = []


func setup(fx_host: Control, shake: Control, flash: ColorRect, config: CombatBeatConfig) -> void:
	host = fx_host
	shake_target = shake
	flash_rect = flash
	cfg = config if config != null else CombatBeatConfig.make_default()


## font_size / bold come from CombatPresentation.floater_label (damage vs other).
## Optional `icon_id` shows a Lucide glyph (e.g. passive sparkles) instead of / with text.
func float_text(
	card: Control,
	text: String,
	color: Color,
	font_size: int = CombatPresentation.FLOAT_FONT_OTHER,
	bold: bool = false,
	icon_id: String = ""
) -> void:
	if host == null or not is_instance_valid(host) or card == null or not is_instance_valid(card):
		return
	var wrap := _acquire_float()
	while wrap.get_child_count() > 0:
		var c := wrap.get_child(0)
		wrap.remove_child(c)
		c.free()
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 4)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	wrap.add_child(row)
	var gid := icon_id.strip_edges()
	if CurrencyIcon.is_asset_glyph(gid):
		row.add_child(UiIcon.make(gid, color, float(font_size) * 0.85))
	if not text.strip_edges().is_empty():
		var label := Label.new()
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.text = text
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", font_size)
		label.add_theme_color_override("font_color", color)
		if bold:
			ClientUi.apply_bold_display_font(label)
		else:
			ClientUi.apply_display_font(label)
		row.add_child(label)
	wrap.modulate = Color.WHITE
	wrap.visible = true
	host.add_child(wrap)
	# Size estimate for clamping large Crits inside the FX host.
	var approx_w := maxf(48.0, float(font_size) * 0.58 * float(maxi(1, text.length())))
	if CurrencyIcon.is_asset_glyph(gid) and text.strip_edges().is_empty():
		approx_w = float(font_size) * 1.1
	var approx_h := float(font_size) * 1.25
	wrap.custom_minimum_size = Vector2(approx_w, approx_h)
	wrap.size = Vector2(approx_w, approx_h)
	var is_crit_size := font_size >= CombatPresentation.FLOAT_FONT_CRIT
	var origin := _clamp_float_origin(
		_fx_point(card) - Vector2(approx_w * 0.5, approx_h * 0.35),
		approx_w,
		approx_h,
		is_crit_size
	)
	wrap.position = origin
	wrap.pivot_offset = Vector2(approx_w * 0.5, approx_h * 0.5)
	wrap.scale = Vector2(0.55, 0.55) if is_crit_size else Vector2(0.7, 0.7)
	var rise_mult := 1.15 if is_crit_size else 1.0
	var rise := mini(cfg.float_rise_px * rise_mult, maxf(12.0, origin.y - 8.0))
	var life := cfg.scaled(cfg.float_lifetime_s)
	var tween := wrap.create_tween().set_parallel(true)
	tween.tween_property(wrap, "position:y", origin.y - rise, life).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(wrap, "scale", Vector2(1.12, 1.12) if is_crit_size else Vector2.ONE, life * 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(wrap, "modulate:a", 0.0, life * 0.85).set_delay(life * 0.2)
	tween.chain().tween_callback(func() -> void: _release_float(wrap))


func spark(card: Control, crit: bool) -> void:
	if host == null or not is_instance_valid(host) or card == null:
		return
	var mark_sz := 64.0 if crit else 38.0
	var mark := _acquire_spark()
	mark.texture = UiIcon.texture("asterisk" if crit else "sparkle")
	mark.modulate = Color("#FBBF24") if crit else Color(1, 1, 1, 0.95)
	mark.custom_minimum_size = Vector2(mark_sz, mark_sz)
	mark.size = Vector2(mark_sz, mark_sz)
	mark.visible = true
	host.add_child(mark)
	mark.position = _fx_point(card) - Vector2(mark_sz * 0.5, mark_sz * 0.5)
	mark.pivot_offset = Vector2(mark_sz * 0.5, mark_sz * 0.5)
	mark.scale = Vector2(0.25, 0.25)
	var tween := mark.create_tween().set_parallel(true)
	var scale_to := Vector2(1.85, 1.85) if crit else Vector2(1.45, 1.45)
	tween.tween_property(mark, "scale", scale_to, 0.36).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(mark, "modulate:a", 0.0, 0.36)
	tween.chain().tween_callback(func() -> void: _release_spark(mark))
	if crit:
		# Second ring for weight without slowing the beat.
		var ring_sz := 64.0
		var ring := _acquire_spark()
		ring.texture = UiIcon.texture("circle")
		ring.modulate = Color("#FDE68A", 0.9)
		ring.custom_minimum_size = Vector2(ring_sz, ring_sz)
		ring.size = Vector2(ring_sz, ring_sz)
		ring.visible = true
		host.add_child(ring)
		ring.position = _fx_point(card) - Vector2(ring_sz * 0.5, ring_sz * 0.5)
		ring.pivot_offset = Vector2(ring_sz * 0.5, ring_sz * 0.5)
		ring.scale = Vector2(0.4, 0.4)
		var rt := ring.create_tween().set_parallel(true)
		rt.tween_property(ring, "scale", Vector2(2.1, 2.1), 0.32)
		rt.tween_property(ring, "modulate:a", 0.0, 0.32)
		rt.chain().tween_callback(func() -> void: _release_spark(ring))


func shake(strength: float = -1.0) -> void:
	if shake_target == null or not is_instance_valid(shake_target):
		return
	var amt := strength if strength >= 0.0 else cfg.shake_hit
	var base := shake_target.position
	var step := cfg.scaled(cfg.shake_step_s)
	var tween := shake_target.create_tween()
	for offset in [
		Vector2(-amt, amt * 0.45),
		Vector2(amt * 0.82, -amt * 0.27),
		Vector2(-amt * 0.55, amt * 0.18),
		Vector2(amt * 0.36, 0),
		Vector2.ZERO,
	]:
		tween.tween_property(shake_target, "position", base + offset, step).set_trans(Tween.TRANS_SINE)


func flash(peak: float = -1.0) -> void:
	if flash_rect == null or not is_instance_valid(flash_rect):
		return
	var a := peak if peak >= 0.0 else cfg.flash_peak
	flash_rect.color = Color(1, 1, 1, a)
	var tw := flash_rect.create_tween()
	tw.tween_property(flash_rect, "color:a", 0.0, cfg.scaled(cfg.flash_fade_s))


func _fx_point(card: Control) -> Vector2:
	if card == null or not is_instance_valid(card) or host == null:
		return Vector2.ZERO
	var center: Vector2 = card.get_global_transform() * (card.size * 0.5)
	return host.get_global_transform().affine_inverse() * center


## Keep floats (especially large Crits) inside the FX host so they do not clip UI chrome.
func _clamp_float_origin(origin: Vector2, approx_w: float, approx_h: float, is_crit_size: bool) -> Vector2:
	if host == null or not is_instance_valid(host):
		return origin
	var pad := 8.0
	var rise_budget := cfg.float_rise_px * (1.15 if is_crit_size else 1.0) + approx_h
	var o := origin
	o.x = clampf(o.x, pad, maxf(pad, host.size.x - approx_w - pad))
	o.y = clampf(o.y, pad + rise_budget, maxf(pad + rise_budget, host.size.y - pad))
	return o


func _acquire_float() -> Control:
	while not _float_pool.is_empty():
		var node: Control = _float_pool.pop_back()
		if node != null and is_instance_valid(node):
			return node
	var fresh := Control.new()
	fresh.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return fresh


func _release_float(node: Control) -> void:
	if node == null or not is_instance_valid(node):
		return
	if node.get_parent() != null:
		node.get_parent().remove_child(node)
	node.visible = false
	if _float_pool.size() < 12:
		_float_pool.append(node)
	else:
		node.queue_free()


func _acquire_spark() -> TextureRect:
	while not _spark_pool.is_empty():
		var tr: TextureRect = _spark_pool.pop_back()
		if tr != null and is_instance_valid(tr):
			return tr
	var fresh := TextureRect.new()
	fresh.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fresh.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	fresh.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	return fresh


func _release_spark(tr: TextureRect) -> void:
	if tr == null or not is_instance_valid(tr):
		return
	if tr.get_parent() != null:
		tr.get_parent().remove_child(tr)
	tr.visible = false
	if _spark_pool.size() < 10:
		_spark_pool.append(tr)
	else:
		tr.queue_free()
