extends RefCounted
## Click = one fire. Hold = delayed slow repeat that eases up to a cap.
## Visual cadence only — the host decides what each fire means (queue vs RPC).

signal stopped

const REPEAT_DELAY_MS := 480
const RAMP_START_MS := 500
const RAMP_END_MS := 2500
const RATE_MIN := 2.0
const RATE_MAX := 10.0

var _active := false
var _started_ms := 0
var _next_ms := 0
var _on_fire: Callable = Callable()
var _can_fire: Callable = Callable()


func start(on_fire: Callable, can_fire: Callable = Callable()) -> void:
	stop()
	_on_fire = on_fire
	_can_fire = can_fire
	_active = true
	_started_ms = Time.get_ticks_msec()
	_next_ms = _started_ms + REPEAT_DELAY_MS
	if not _try_fire():
		stop()


func stop() -> void:
	if not _active:
		return
	_active = false
	_on_fire = Callable()
	_can_fire = Callable()
	stopped.emit()


func is_active() -> bool:
	return _active


func tick() -> void:
	if not _active:
		return
	if not Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		stop()
		return
	var now := Time.get_ticks_msec()
	if now < _next_ms:
		return
	if _try_fire():
		_next_ms = now + _interval_ms(now - _started_ms)
		return
	# Still held — skip this beat (can't afford / queue full) instead of cancelling.
	_next_ms = now + _interval_ms(now - _started_ms)


func _try_fire() -> bool:
	if _can_fire.is_valid() and not bool(_can_fire.call()):
		return false
	if _on_fire.is_valid():
		_on_fire.call()
	return true


func _interval_ms(elapsed_ms: int) -> int:
	var t := clampf(
		float(elapsed_ms - RAMP_START_MS) / float(maxi(1, RAMP_END_MS - RAMP_START_MS)),
		0.0,
		1.0
	)
	t = t * t * (3.0 - 2.0 * t)
	var rate := RATE_MIN + (RATE_MAX - RATE_MIN) * t
	return maxi(100, int(round(1000.0 / maxf(RATE_MIN, rate))))
