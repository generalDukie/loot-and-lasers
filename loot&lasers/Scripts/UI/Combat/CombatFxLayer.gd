class_name CombatFxLayer
extends RefCounted
## Presentation FX for duel overlays — float numbers, sparks, shake, flash.
## Independent of combat simulation; knobs come from CombatBeatConfig.

var host: Control ## Stage-local FX parent
var shake_target: Control
var flash_rect: ColorRect
var cfg: CombatBeatConfig

var _float_pool: Array[Label] = []
var _spark_pool: Array[Label] = []


func setup(fx_host: Control, shake: Control, flash: ColorRect, config: CombatBeatConfig) -> void:
	host = fx_host
	shake_target = shake
	flash_rect = flash
	cfg = config if config != null else CombatBeatConfig.make_default()


func float_text(card: Control, text: String, color: Color, big: bool = false) -> void:
	if host == null or not is_instance_valid(host) or card == null or not is_instance_valid(card):
		return
	var label := _acquire_float()
	label.text = text
	label.add_theme_font_size_override("font_size", 32 if big else 20)
	label.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(label)
	label.modulate = Color.WHITE
	label.visible = true
	host.add_child(label)
	var origin := _fx_point(card) - Vector2(28, 12)
	label.position = origin
	label.pivot_offset = Vector2(28, 12)
	label.scale = Vector2(0.55, 0.55) if big else Vector2(0.7, 0.7)
	var rise := cfg.float_rise_px * (1.15 if big else 1.0)
	var life := cfg.scaled(cfg.float_lifetime_s)
	var tween := label.create_tween().set_parallel(true)
	tween.tween_property(label, "position:y", origin.y - rise, life).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "scale", Vector2(1.12, 1.12) if big else Vector2.ONE, life * 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "modulate:a", 0.0, life * 0.85).set_delay(life * 0.2)
	tween.chain().tween_callback(func() -> void: _release_float(label))


func spark(card: Control, crit: bool) -> void:
	if host == null or not is_instance_valid(host) or card == null:
		return
	var mark := _acquire_spark()
	mark.text = "✸" if crit else "✦"
	mark.add_theme_font_size_override("font_size", 52 if crit else 30)
	mark.add_theme_color_override("font_color", Color("#FBBF24") if crit else Color(1, 1, 1, 0.95))
	ClientUi.apply_display_font(mark)
	mark.modulate = Color.WHITE
	mark.visible = true
	host.add_child(mark)
	mark.position = _fx_point(card) - Vector2(18, 18)
	mark.pivot_offset = Vector2(18, 18)
	mark.scale = Vector2(0.25, 0.25)
	var tween := mark.create_tween().set_parallel(true)
	var scale_to := Vector2(1.85, 1.85) if crit else Vector2(1.45, 1.45)
	tween.tween_property(mark, "scale", scale_to, 0.36).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(mark, "modulate:a", 0.0, 0.36)
	tween.chain().tween_callback(func() -> void: _release_spark(mark))
	if crit:
		# Second ring for weight without slowing the beat.
		var ring := _acquire_spark()
		ring.text = "○"
		ring.add_theme_font_size_override("font_size", 40)
		ring.add_theme_color_override("font_color", Color("#FDE68A", 0.9))
		ClientUi.apply_display_font(ring)
		ring.modulate = Color.WHITE
		ring.visible = true
		host.add_child(ring)
		ring.position = _fx_point(card) - Vector2(20, 20)
		ring.pivot_offset = Vector2(20, 20)
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


func _acquire_float() -> Label:
	while not _float_pool.is_empty():
		var lab: Label = _float_pool.pop_back()
		if lab != null and is_instance_valid(lab):
			return lab
	var fresh := Label.new()
	fresh.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return fresh


func _release_float(lab: Label) -> void:
	if lab == null or not is_instance_valid(lab):
		return
	if lab.get_parent() != null:
		lab.get_parent().remove_child(lab)
	lab.visible = false
	if _float_pool.size() < 12:
		_float_pool.append(lab)
	else:
		lab.queue_free()


func _acquire_spark() -> Label:
	while not _spark_pool.is_empty():
		var lab: Label = _spark_pool.pop_back()
		if lab != null and is_instance_valid(lab):
			return lab
	var fresh := Label.new()
	fresh.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return fresh


func _release_spark(lab: Label) -> void:
	if lab == null or not is_instance_valid(lab):
		return
	if lab.get_parent() != null:
		lab.get_parent().remove_child(lab)
	lab.visible = false
	if _spark_pool.size() < 10:
		_spark_pool.append(lab)
	else:
		lab.queue_free()
