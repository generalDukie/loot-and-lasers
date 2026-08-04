class_name CombatBeatConfig
extends RefCounted
## Configurable arena/mission duel pacing. Mechanics stay in MissionCombat;
## this only controls how long each event *looks*.
##
## Philosophy (classic async browser RPG): quiet beats snap, heavy beats linger,
## land roughly mid-swing so anticipation → impact → recovery stay readable.
## Absolute times target ~5–15s fights without feeling cinematic.

## Global scale (1.0 = designed desktop pace). Lower = faster; keeps ratios.
@export var speed: float = 1.0

@export var intro_s: float = 0.85
@export var land_ratio: float = 0.42 ## Fraction of beat before HP/numbers land
@export var min_recovery_s: float = 0.08

## Per-type beat lengths in seconds (pre-speed).
@export var beat_default: float = 0.72
@export var beat_regen: float = 0.42
@export var beat_dodge: float = 0.50
@export var beat_passive: float = 0.78
@export var beat_crit: float = 0.92
@export var beat_ability: float = 0.95

## Motion / FX (presentation only).
@export var lunge_distance: float = 48.0
@export var lunge_out_s: float = 0.14
@export var lunge_back_s: float = 0.22
@export var slip_distance: float = 32.0
@export var slip_out_s: float = 0.12
@export var slip_back_s: float = 0.20
@export var impact_recover_s: float = 0.28
@export var float_lifetime_s: float = 0.65
@export var float_rise_px: float = 56.0
@export var shake_step_s: float = 0.05
@export var shake_crit: float = 12.0
@export var shake_hit: float = 5.5
@export var flash_peak: float = 0.26
@export var flash_fade_s: float = 0.22
@export var hp_tween_s: float = 0.28
@export var banner_hold_s: float = 0.55
@export var idle_bob_px: float = 5.0
@export var idle_bob_s: float = 1.15
@export var hit_pause_crit_s: float = 0.06 ## Tiny freeze on crit land (snappy, not cinematic)


static func make_default() -> CombatBeatConfig:
	var cfg := CombatBeatConfig.new()
	if SettingsManager != null:
		cfg.speed = SettingsManager.combat_anim_speed
		var shake_scale: float = SettingsManager.screen_shake_scale
		cfg.shake_crit *= shake_scale
		cfg.shake_hit *= shake_scale
	return cfg


func scaled(seconds: float) -> float:
	return maxf(0.04, seconds * maxf(0.35, speed))


func intro_duration() -> float:
	return scaled(intro_s)


func beat_duration(ev: Dictionary) -> float:
	if ev.is_empty():
		return scaled(beat_default)
	var t := str(ev.get("type", ""))
	if t == "regen":
		return scaled(beat_regen)
	if bool(ev.get("dodged", false)) or t == "dodge":
		return scaled(beat_dodge)
	# Full barrier absorb: readable brace, still snappy.
	if bool(ev.get("shieldHit", false)) and int(ev.get("damage", 0)) <= 0:
		return scaled(beat_dodge)
	if t == "passive" or (t == "miss" and str(ev.get("missKind", "")) == "phantom_signal"):
		return scaled(beat_passive)
	if t == "secondary" and ev.get("passive", null) != null:
		return scaled(beat_ability)
	if bool(ev.get("crit", false)) or t == "ability" or t == "drone":
		return scaled(beat_crit if bool(ev.get("crit", false)) else beat_ability)
	return scaled(beat_default)


func land_delay(ev: Dictionary) -> float:
	var beat := beat_duration(ev)
	var delay := beat * clampf(land_ratio, 0.2, 0.6)
	# Quiet / dodge: land early so the slip reads as the whole beat.
	var t := str(ev.get("type", ""))
	if t == "regen" or t == "dodge" or bool(ev.get("dodged", false)) or t == "miss":
		delay = minf(delay, scaled(0.16))
	return minf(delay, maxf(0.05, beat - scaled(min_recovery_s)))


func recovery_after_land(ev: Dictionary) -> float:
	return maxf(scaled(min_recovery_s), beat_duration(ev) - land_delay(ev))
