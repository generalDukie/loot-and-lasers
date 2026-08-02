class_name CombatHpPresenter
extends RefCounted
## HP bar + numeral presentation with tweened fills and low-HP tint.

var player_bar: ProgressBar
var enemy_bar: ProgressBar
var player_nums: Label
var enemy_nums: Label
var cfg: CombatBeatConfig

var player_hp: int = 0
var enemy_hp: int = 0
var player_max: int = 1
var enemy_max: int = 1

const PLAYER_COLOR := Color("#22D3EE")
const ENEMY_COLOR := Color("#FB7185")
const LOW_COLOR := Color("#FB7185")


func setup(
	p_bar: ProgressBar,
	e_bar: ProgressBar,
	p_nums: Label,
	e_nums: Label,
	config: CombatBeatConfig
) -> void:
	player_bar = p_bar
	enemy_bar = e_bar
	player_nums = p_nums
	enemy_nums = e_nums
	cfg = config if config != null else CombatBeatConfig.make_default()


func reset(p_hp: int, p_max: int, e_hp: int, e_max: int) -> void:
	player_max = maxi(1, p_max)
	enemy_max = maxi(1, e_max)
	player_hp = clampi(p_hp, 0, player_max)
	enemy_hp = clampi(e_hp, 0, enemy_max)
	if player_bar:
		player_bar.max_value = player_max
		player_bar.value = player_hp
	if enemy_bar:
		enemy_bar.max_value = enemy_max
		enemy_bar.value = enemy_hp
	_apply_labels()
	_apply_tints()


func apply_damage(to_player: bool, amount: int, flash_color: Color) -> void:
	if to_player:
		player_hp = maxi(0, player_hp - amount)
		_tween_bar(player_bar, player_hp, flash_color)
	else:
		enemy_hp = maxi(0, enemy_hp - amount)
		_tween_bar(enemy_bar, enemy_hp, flash_color)
	_apply_labels()
	_apply_tints()


func apply_heal(to_player: bool, amount: int) -> void:
	if to_player:
		player_hp = mini(player_max, player_hp + amount)
		_tween_bar(player_bar, player_hp, Color("#86EFAC"))
	else:
		enemy_hp = mini(enemy_max, enemy_hp + amount)
		_tween_bar(enemy_bar, enemy_hp, Color("#86EFAC"))
	_apply_labels()
	_apply_tints()


func snap(p_hp: int, e_hp: int) -> void:
	player_hp = clampi(p_hp, 0, player_max)
	enemy_hp = clampi(e_hp, 0, enemy_max)
	if player_bar:
		player_bar.value = player_hp
	if enemy_bar:
		enemy_bar.value = enemy_hp
	_apply_labels()
	_apply_tints()


func _tween_bar(bar: ProgressBar, target: float, flash: Color) -> void:
	if bar == null or not is_instance_valid(bar):
		return
	bar.modulate = flash
	var tween := bar.create_tween().set_parallel(true)
	tween.tween_property(bar, "value", target, cfg.scaled(cfg.hp_tween_s)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(bar, "modulate", Color.WHITE, cfg.scaled(0.22))


func _apply_labels() -> void:
	if player_nums:
		player_nums.text = "%s / %s" % [player_hp, player_max]
	if enemy_nums:
		enemy_nums.text = "%s / %s" % [enemy_hp, enemy_max]


func _apply_tints() -> void:
	var p_pct := 100.0 * float(player_hp) / float(player_max)
	var e_pct := 100.0 * float(enemy_hp) / float(enemy_max)
	if player_bar:
		ClientUi.apply_hp_bar(player_bar, LOW_COLOR if (p_pct > 0.0 and p_pct < 25.0) else PLAYER_COLOR)
	if enemy_bar:
		ClientUi.apply_hp_bar(enemy_bar, LOW_COLOR if (e_pct > 0.0 and e_pct < 25.0) else ENEMY_COLOR)
