class_name CombatHpPresenter
extends RefCounted
## HP bar + numeral presentation with tweened fills and low-HP tint.
## Orientation is a permanent side property (TextureProgressBar.fill_mode), never
## toggled by damage, healing, tint refresh, or combat round.
## Player (left): FILL_RIGHT_TO_LEFT — remaining HP hugs the center (right edge).
## Enemy (right): FILL_LEFT_TO_RIGHT — remaining HP hugs the center (left edge).

var player_bar: TextureProgressBar
var enemy_bar: TextureProgressBar
var player_nums: Label
var enemy_nums: Label
var cfg: CombatBeatConfig

var player_hp: int = 0
var enemy_hp: int = 0
var player_max: int = 1
var enemy_max: int = 1

var _player_tween: Tween
var _enemy_tween: Tween

const PLAYER_COLOR := Color("#22D3EE")
const ENEMY_COLOR := Color("#FB7185")
const LOW_COLOR := Color("#FB7185")
const TRACK_COLOR := Color(0.02, 0.03, 0.055, 0.96)


func setup(
	p_bar: TextureProgressBar,
	e_bar: TextureProgressBar,
	p_nums: Label,
	e_nums: Label,
	config: CombatBeatConfig
) -> void:
	player_bar = p_bar
	enemy_bar = e_bar
	player_nums = p_nums
	enemy_nums = e_nums
	cfg = config if config != null else CombatBeatConfig.make_default()
	# Permanent orientation — set once, never reassigned on hits.
	_configure_side(player_bar, true, PLAYER_COLOR)
	_configure_side(enemy_bar, false, ENEMY_COLOR)


func reset(p_hp: int, p_max: int, e_hp: int, e_max: int) -> void:
	_kill_tweens()
	player_max = maxi(1, p_max)
	enemy_max = maxi(1, e_max)
	player_hp = clampi(p_hp, 0, player_max)
	enemy_hp = clampi(e_hp, 0, enemy_max)
	if player_bar:
		player_bar.max_value = player_max
		player_bar.value = player_hp
		player_bar.modulate = Color.WHITE
	if enemy_bar:
		enemy_bar.max_value = enemy_max
		enemy_bar.value = enemy_hp
		enemy_bar.modulate = Color.WHITE
	_apply_labels()
	_apply_tints()


func apply_damage(to_player: bool, amount: int, flash_color: Color) -> void:
	if to_player:
		player_hp = maxi(0, player_hp - amount)
		_tween_bar(true, player_hp, flash_color)
	else:
		enemy_hp = maxi(0, enemy_hp - amount)
		_tween_bar(false, enemy_hp, flash_color)
	_apply_labels()
	_apply_tints()


func apply_heal(to_player: bool, amount: int) -> void:
	if to_player:
		player_hp = mini(player_max, player_hp + amount)
		_tween_bar(true, player_hp, Color("#86EFAC"))
	else:
		enemy_hp = mini(enemy_max, enemy_hp + amount)
		_tween_bar(false, enemy_hp, Color("#86EFAC"))
	_apply_labels()
	_apply_tints()


func snap(p_hp: int, e_hp: int) -> void:
	## Instant final state — kill in-flight fill tweens so skip can't leave bars at max.
	_kill_tweens()
	player_hp = clampi(p_hp, 0, player_max)
	enemy_hp = clampi(e_hp, 0, enemy_max)
	if player_bar:
		player_bar.value = player_hp
		player_bar.modulate = Color.WHITE
	if enemy_bar:
		enemy_bar.value = enemy_hp
		enemy_bar.modulate = Color.WHITE
	_apply_labels()
	_apply_tints()


func _kill_tweens() -> void:
	if _player_tween != null and is_instance_valid(_player_tween):
		_player_tween.kill()
	_player_tween = null
	if _enemy_tween != null and is_instance_valid(_enemy_tween):
		_enemy_tween.kill()
	_enemy_tween = null


func _tween_bar(to_player: bool, target: float, flash: Color) -> void:
	var bar: TextureProgressBar = player_bar if to_player else enemy_bar
	if bar == null or not is_instance_valid(bar):
		return
	if to_player:
		if _player_tween != null and is_instance_valid(_player_tween):
			_player_tween.kill()
	else:
		if _enemy_tween != null and is_instance_valid(_enemy_tween):
			_enemy_tween.kill()
	bar.modulate = flash
	var tween := bar.create_tween().set_parallel(true)
	if to_player:
		_player_tween = tween
	else:
		_enemy_tween = tween
	tween.tween_property(bar, "value", target, cfg.scaled(cfg.hp_tween_s)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(bar, "modulate", Color.WHITE, cfg.scaled(0.22))


func _apply_labels() -> void:
	if player_nums:
		player_nums.text = "%s / %s" % [player_hp, player_max]
	if enemy_nums:
		enemy_nums.text = "%s / %s" % [enemy_hp, enemy_max]


func _apply_tints() -> void:
	## Color only — never touch fill_mode, scale, or pivot.
	var p_pct := 100.0 * float(player_hp) / float(player_max)
	var e_pct := 100.0 * float(enemy_hp) / float(enemy_max)
	if player_bar:
		_tint_bar(player_bar, LOW_COLOR if (p_pct > 0.0 and p_pct < 25.0) else PLAYER_COLOR)
	if enemy_bar:
		_tint_bar(enemy_bar, LOW_COLOR if (e_pct > 0.0 and e_pct < 25.0) else ENEMY_COLOR)


func _configure_side(bar: TextureProgressBar, player_side: bool, fill: Color) -> void:
	if bar == null or not is_instance_valid(bar):
		return
	bar.min_value = 0.0
	bar.nine_patch_stretch = true
	bar.stretch_margin_left = 6
	bar.stretch_margin_top = 6
	bar.stretch_margin_right = 6
	bar.stretch_margin_bottom = 6
	# Fixed for the whole fight — do not reassign in tint/damage paths.
	bar.fill_mode = (
		TextureProgressBar.FILL_RIGHT_TO_LEFT
		if player_side
		else TextureProgressBar.FILL_LEFT_TO_RIGHT
	)
	bar.scale = Vector2.ONE
	bar.pivot_offset = Vector2.ZERO
	bar.texture_under = _solid_tex(TRACK_COLOR)
	bar.texture_progress = _solid_tex(Color.WHITE)
	bar.tint_under = TRACK_COLOR
	_tint_bar(bar, fill)


func _tint_bar(bar: TextureProgressBar, fill: Color) -> void:
	bar.tint_progress = fill
	bar.tint_under = TRACK_COLOR


static func _solid_tex(color: Color) -> Texture2D:
	var img := Image.create(8, 8, false, Image.FORMAT_RGBA8)
	img.fill(color)
	return ImageTexture.create_from_image(img)
