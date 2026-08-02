extends Node
## Player preferences (audio, display, input, accessibility).
## Persists to user://settings.cfg — no gameplay coupling.
##
## Matches web GameCanvas "auto":
##   - Logical canvas always 1920×1080 (16:9)
##   - Window fills the work area (maximized) so nothing is clipped by the taskbar
##   - CONTENT_SCALE_ASPECT_KEEP letterboxes/pillarboxes so UI never crops
##   - F11 toggles fullscreen (works from the editor Play window too)

const SETTINGS_PATH := "user://settings.cfg"
## Same design canvas as web `GameCanvas.jsx`.
const DESIGN_SIZE := Vector2i(1920, 1080)
const MIN_WINDOW := Vector2i(960, 540)

var _config := ConfigFile.new()
var _enforcing_size := false
var _audio_save_timer: SceneTreeTimer

var master_volume: float = 1.0
var music_volume: float = 0.8
var sfx_volume: float = 1.0
var fullscreen: bool = false


func _ready() -> void:
	ClientUi.apply_root_theme(get_window())
	load_settings()
	apply_settings()
	var win := get_window()
	if win != null and not win.size_changed.is_connected(_on_window_size_changed):
		win.size_changed.connect(_on_window_size_changed)
	call_deferred("_ensure_visible_window")
	get_tree().process_frame.connect(_ensure_visible_window, CONNECT_ONE_SHOT)
	# Second pass after Windows applies DPI / chrome metrics.
	get_tree().create_timer(0.15).timeout.connect(_ensure_visible_window)
	print("[SettingsManager] ready design=%sx%s (16:9 auto-scale)" % [DESIGN_SIZE.x, DESIGN_SIZE.y])


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F11:
			toggle_fullscreen()
			get_viewport().set_input_as_handled()


func load_settings() -> void:
	var err := _config.load(SETTINGS_PATH)
	if err != OK:
		return
	master_volume = float(_config.get_value("audio", "master_volume", master_volume))
	music_volume = float(_config.get_value("audio", "music_volume", music_volume))
	sfx_volume = float(_config.get_value("audio", "sfx_volume", sfx_volume))
	fullscreen = bool(_config.get_value("display", "fullscreen", fullscreen))


func save_settings() -> Error:
	_config.set_value("audio", "master_volume", master_volume)
	_config.set_value("audio", "music_volume", music_volume)
	_config.set_value("audio", "sfx_volume", sfx_volume)
	_config.set_value("display", "fullscreen", fullscreen)
	return _config.save(SETTINGS_PATH)


func toggle_fullscreen() -> void:
	fullscreen = not fullscreen
	apply_settings()
	save_settings()


func apply_settings() -> void:
	RenderingServer.set_default_clear_color(Color.BLACK)
	Engine.max_fps = ClientUi.ANIM_FPS
	_apply_content_scale()
	if fullscreen:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	else:
		# Maximized stays inside the work area (taskbar-safe). Manual 16:9 window
		# sizing was clipping the bottom under Windows decorations / DPI.
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		call_deferred("_ensure_visible_window")
	apply_audio()


## Volume only — never touch window mode (sliders used to call apply_settings and break).
func apply_audio() -> void:
	AudioManager.apply_volumes(master_volume, music_volume, sfx_volume)


## Live bus update; optional persist (drag ticks should pass persist=false).
func set_master_volume(v: float, persist: bool = true) -> void:
	master_volume = clampf(v, 0.0, 1.0)
	apply_audio()
	_persist_audio(persist)


func set_music_volume(v: float, persist: bool = true) -> void:
	music_volume = clampf(v, 0.0, 1.0)
	apply_audio()
	_persist_audio(persist)


func set_sfx_volume(v: float, persist: bool = true) -> void:
	sfx_volume = clampf(v, 0.0, 1.0)
	apply_audio()
	_persist_audio(persist)


func _persist_audio(immediate: bool) -> void:
	if immediate:
		_audio_save_timer = null
		save_settings()
		return
	# Coalesce rapid slider ticks / key repeats into one disk write.
	var tree := get_tree()
	if tree == null:
		save_settings()
		return
	_audio_save_timer = tree.create_timer(0.35)
	var token := _audio_save_timer
	token.timeout.connect(func() -> void:
		if _audio_save_timer != token:
			return
		_audio_save_timer = null
		save_settings()
	)


func _apply_content_scale() -> void:
	var win := get_window()
	if win == null:
		return
	# Always layout in 1920×1080 space; Godot scales the whole canvas to the window.
	win.content_scale_size = DESIGN_SIZE
	win.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	win.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP
	win.content_scale_stretch = Window.CONTENT_SCALE_STRETCH_FRACTIONAL


func _on_window_size_changed() -> void:
	if _enforcing_size:
		return
	_apply_content_scale()


func _ensure_visible_window() -> void:
	_apply_content_scale()
	if fullscreen:
		return
	var mode := DisplayServer.window_get_mode()
	if mode == DisplayServer.WINDOW_MODE_FULLSCREEN \
			or mode == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN:
		return

	# Prefer maximize — fills the usable monitor without hanging under the taskbar.
	if mode != DisplayServer.WINDOW_MODE_MAXIMIZED:
		_enforcing_size = true
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_MAXIMIZED)
		_enforcing_size = false

	# Even when maximized, clamp decorations into the usable work area (DPI / taskbar).
	mode = DisplayServer.window_get_mode()
	var screen := DisplayServer.window_get_current_screen()
	var usable := DisplayServer.screen_get_usable_rect(screen)
	if usable.size.x > 1 and usable.size.y > 1:
		var decor := Vector2i(DisplayServer.window_get_size_with_decorations())
		var pos := Vector2i(DisplayServer.window_get_position())
		# If the decorated window hangs past the work area, pull it back in.
		if pos.y + decor.y > usable.position.y + usable.size.y \
				or pos.x + decor.x > usable.position.x + usable.size.x \
				or pos.y < usable.position.y \
				or pos.x < usable.position.x:
			_enforcing_size = true
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			var chrome := decor - Vector2i(DisplayServer.window_get_size())
			var pad := Vector2i(12, 28)
			var max_client := Vector2i(
				maxi(MIN_WINDOW.x, usable.size.x - maxi(chrome.x, 0) - pad.x),
				maxi(MIN_WINDOW.y, usable.size.y - maxi(chrome.y, 0) - pad.y)
			)
			DisplayServer.window_set_size(max_client)
			decor = Vector2i(DisplayServer.window_get_size_with_decorations())
			pos = Vector2i(
				usable.position.x + maxi(0, (usable.size.x - decor.x) / 2),
				usable.position.y + maxi(0, (usable.size.y - decor.y) / 2)
			)
			pos.x = clampi(pos.x, usable.position.x, usable.position.x + maxi(0, usable.size.x - decor.x))
			pos.y = clampi(pos.y, usable.position.y, usable.position.y + maxi(0, usable.size.y - decor.y))
			DisplayServer.window_set_position(pos)
			_enforcing_size = false
			return

	mode = DisplayServer.window_get_mode()
	if mode == DisplayServer.WINDOW_MODE_MAXIMIZED:
		return

	if usable.size.x <= 1 or usable.size.y <= 1:
		return

	var client := Vector2i(DisplayServer.window_get_size())
	var decor2 := Vector2i(DisplayServer.window_get_size_with_decorations())
	var chrome2 := decor2 - client
	# Pad so title bar + DPI rounding never push the bottom under the taskbar.
	var pad2 := Vector2i(12, 28)
	var max_client2 := Vector2i(
		maxi(MIN_WINDOW.x, usable.size.x - maxi(chrome2.x, 0) - pad2.x),
		maxi(MIN_WINDOW.y, usable.size.y - maxi(chrome2.y, 0) - pad2.y)
	)
	var target := Vector2i(
		mini(client.x, max_client2.x) if client.x > 1 else max_client2.x,
		mini(client.y, max_client2.y) if client.y > 1 else max_client2.y
	)
	target.x = clampi(target.x - (target.x % 2), MIN_WINDOW.x, max_client2.x)
	target.y = clampi(target.y - (target.y % 2), MIN_WINDOW.y, max_client2.y)

	if target != client:
		_enforcing_size = true
		DisplayServer.window_set_size(target)
		_enforcing_size = false

	decor2 = Vector2i(DisplayServer.window_get_size_with_decorations())
	var pos2 := Vector2i(
		usable.position.x + maxi(0, (usable.size.x - decor2.x) / 2),
		usable.position.y + maxi(0, (usable.size.y - decor2.y) / 2)
	)
	pos2.x = clampi(pos2.x, usable.position.x, usable.position.x + maxi(0, usable.size.x - decor2.x))
	pos2.y = clampi(pos2.y, usable.position.y, usable.position.y + maxi(0, usable.size.y - decor2.y))
	DisplayServer.window_set_position(pos2)
