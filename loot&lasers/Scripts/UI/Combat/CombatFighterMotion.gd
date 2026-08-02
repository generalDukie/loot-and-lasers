class_name CombatFighterMotion
extends RefCounted
## Stationary-fighter motion: anticipation lunge, dodge slip, impact squash, idle bob, weapon swing.

var cfg: CombatBeatConfig
var _idle_tweens: Array[Tween] = []


func setup(config: CombatBeatConfig) -> void:
	cfg = config if config != null else CombatBeatConfig.make_default()


func start_idle(card: Control, delay: float = 0.0) -> void:
	if card == null or not is_instance_valid(card):
		return
	stop_idle_on(card)
	var bob := cfg.idle_bob_px
	var half := cfg.scaled(cfg.idle_bob_s)
	var tween := card.create_tween().set_loops()
	if delay > 0.0:
		tween.tween_interval(delay)
	tween.tween_property(card, "position:y", -bob, half).set_trans(Tween.TRANS_SINE)
	tween.tween_property(card, "position:y", 0.0, half).set_trans(Tween.TRANS_SINE)
	tween.set_meta("idle_card", card)
	_idle_tweens.append(tween)


func stop_idle_on(card: Control) -> void:
	if card == null:
		return
	var keep: Array[Tween] = []
	for tw in _idle_tweens:
		if tw == null or not tw.is_valid():
			continue
		if tw.get_meta("idle_card", null) == card:
			tw.kill()
			card.position.y = 0.0
		else:
			keep.append(tw)
	_idle_tweens = keep


func stop_all_idle() -> void:
	for tw in _idle_tweens:
		if tw != null and tw.is_valid():
			tw.kill()
	_idle_tweens.clear()


func lunge(card: Control, side: String) -> void:
	if card == null or not is_instance_valid(card):
		return
	stop_idle_on(card)
	var direction := 1.0 if side == "player" else -1.0
	var dist := cfg.lunge_distance
	var tween := card.create_tween()
	# Anticipation settle → strike → recovery.
	tween.tween_property(card, "position:x", direction * -6.0, cfg.scaled(0.05)).set_trans(Tween.TRANS_SINE)
	tween.tween_property(card, "position:x", direction * dist, cfg.scaled(cfg.lunge_out_s)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(card, "position:x", 0.0, cfg.scaled(cfg.lunge_back_s)).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func() -> void:
		if is_instance_valid(card):
			start_idle(card, 0.05)
	)


func slip(card: Control, side: String) -> void:
	if card == null or not is_instance_valid(card):
		return
	stop_idle_on(card)
	var direction := -1.0 if side == "player" else 1.0
	var tween := card.create_tween()
	tween.set_parallel(true)
	tween.tween_property(card, "position:x", direction * cfg.slip_distance, cfg.scaled(cfg.slip_out_s)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(card, "modulate", Color(0.75, 0.95, 1.0, 0.85), cfg.scaled(cfg.slip_out_s))
	tween.chain().set_parallel(true)
	tween.tween_property(card, "position:x", 0.0, cfg.scaled(cfg.slip_back_s)).set_trans(Tween.TRANS_SINE)
	tween.tween_property(card, "modulate", Color.WHITE, cfg.scaled(cfg.slip_back_s))
	tween.chain().tween_callback(func() -> void:
		if is_instance_valid(card):
			start_idle(card, 0.05)
	)


## Distinct from dodge slip: brief brace flash (shield / full absorb).
func guard(card: Control) -> void:
	if card == null or not is_instance_valid(card):
		return
	stop_idle_on(card)
	card.pivot_offset = card.size * 0.5
	card.modulate = Color(0.55, 0.92, 1.0)
	card.scale = Vector2(1.04, 1.04)
	var tween := card.create_tween().set_parallel(true)
	var recover := cfg.scaled(0.22)
	tween.tween_property(card, "modulate", Color.WHITE, recover)
	tween.tween_property(card, "scale", Vector2.ONE, recover).set_trans(Tween.TRANS_SINE)
	tween.chain().tween_callback(func() -> void:
		if is_instance_valid(card):
			start_idle(card, 0.05)
	)


func impact(card: Control, crit: bool, fx: CombatFxLayer) -> void:
	if card == null or not is_instance_valid(card):
		return
	stop_idle_on(card)
	card.pivot_offset = card.size * 0.5
	card.modulate = Color(1.0, 0.82, 0.35) if crit else Color(1.0, 0.45, 0.48)
	card.scale = Vector2(0.90, 0.90) if crit else Vector2(0.95, 0.95)
	var tween := card.create_tween().set_parallel(true)
	var recover := cfg.scaled(cfg.impact_recover_s)
	tween.tween_property(card, "modulate", Color.WHITE, recover)
	tween.tween_property(card, "scale", Vector2.ONE, recover).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.chain().tween_callback(func() -> void:
		if is_instance_valid(card):
			start_idle(card, 0.08)
	)
	if fx != null:
		fx.spark(card, crit)


func swing_weapon(weapon_node: Control, side: String, style: String) -> void:
	if weapon_node == null or not is_instance_valid(weapon_node):
		return
	var dir := 1.0 if side == "player" else -1.0
	var tween := weapon_node.create_tween()
	match style:
		"stab":
			tween.tween_property(weapon_node, "position:x", dir * 22.0, cfg.scaled(0.11))
			tween.tween_property(weapon_node, "position:x", 0.0, cfg.scaled(0.16))
		"shoot":
			tween.tween_property(weapon_node, "scale", Vector2(1.3, 1.3), cfg.scaled(0.07))
			tween.tween_property(weapon_node, "scale", Vector2.ONE, cfg.scaled(0.14))
		_:
			tween.tween_property(weapon_node, "rotation", dir * -1.0, cfg.scaled(0.11))
			tween.tween_property(weapon_node, "rotation", dir * 0.4, cfg.scaled(0.11))
			tween.tween_property(weapon_node, "rotation", 0.0, cfg.scaled(0.14))


func settle(card: Control, victorious: bool) -> void:
	if card == null or not is_instance_valid(card):
		return
	stop_idle_on(card)
	card.pivot_offset = card.size * 0.5
	var tween := card.create_tween().set_parallel(true)
	if victorious:
		tween.tween_property(card, "modulate", Color(1.18, 1.18, 1.12, 1.0), 0.35)
		tween.tween_property(card, "scale", Vector2(1.05, 1.05), 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		tween.tween_property(card, "modulate", Color(0.55, 0.55, 0.62, 0.75), 0.4)
		tween.tween_property(card, "rotation", 0.09, 0.4).set_trans(Tween.TRANS_SINE)
		tween.tween_property(card, "position:y", 12.0, 0.4).set_trans(Tween.TRANS_SINE)
