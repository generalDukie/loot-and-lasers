extends Node
## Player preferences — Restoration 24.
## Local device settings persist to user://settings.cfg (never uploaded as gameplay).
## Account preferences (legacy_display, etc.) sync via Node Get/SaveAccountPreferences.
##
## Display scaling is owned by ResolutionManager (2560×1440 logical, canvas_items, KEEP).
## This autoload applies audio + window mode and re-asserts content scale.
## Physical window sizing never forces 2560×1440 and is skipped entirely on web.

signal settings_changed
signal account_preferences_changed(preferences: Dictionary)

const SETTINGS_PATH := "user://settings.cfg"
const SETTINGS_VERSION := 2
const DESIGN_SIZE := ResolutionRules.DESIGN_SIZE
const MIN_WINDOW := Vector2i(960, 540)

## Local-only keys (must never POST to Node as authority).
const LOCAL_KEYS := [
	"master_volume", "music_volume", "sfx_volume",
	"window_mode", "fullscreen", "play_music_when_unfocused",
	"vsync", "combat_anim_speed", "screen_shake_scale",
]

var _config := ConfigFile.new()
var _enforcing_size := false
var _audio_save_timer: SceneTreeTimer
var _account_prefs: Dictionary = {}

var master_volume: float = 1.0
var music_volume: float = 0.8
var sfx_volume: float = 1.0
## Legacy mirror of window_mode == "fullscreen" | "exclusive"
var fullscreen: bool = false
## windowed | maximized | fullscreen | exclusive
var window_mode: String = "maximized"
var play_music_when_unfocused: bool = true
var vsync: bool = true
## Combat presentation only (1.0 = default pace).
var combat_anim_speed: float = 1.0
## 0 = no shake, 1 = full CombatBeatConfig shake.
var screen_shake_scale: float = 1.0


func _ready() -> void:
	ClientUi.apply_root_theme(get_window())
	load_settings()
	apply_settings()
	var win := get_window()
	if win != null and not win.size_changed.is_connected(_on_window_size_changed):
		win.size_changed.connect(_on_window_size_changed)
	if not OS.has_feature("web"):
		call_deferred("_ensure_visible_window")
		get_tree().process_frame.connect(_ensure_visible_window, CONNECT_ONE_SHOT)
		get_tree().create_timer(0.15).timeout.connect(_ensure_visible_window)
	print("[SettingsManager] ready v%s design=%sx%s" % [SETTINGS_VERSION, DESIGN_SIZE.x, DESIGN_SIZE.y])


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_on_app_focus_out()
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_on_app_focus_in()


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
	play_music_when_unfocused = bool(_config.get_value("audio", "play_music_when_unfocused", play_music_when_unfocused))
	fullscreen = bool(_config.get_value("display", "fullscreen", fullscreen))
	window_mode = str(_config.get_value("display", "window_mode", ""))
	if window_mode.is_empty():
		window_mode = "fullscreen" if fullscreen else "maximized"
	vsync = bool(_config.get_value("display", "vsync", vsync))
	combat_anim_speed = clampf(float(_config.get_value("accessibility", "combat_anim_speed", combat_anim_speed)), 0.35, 2.0)
	screen_shake_scale = clampf(float(_config.get_value("accessibility", "screen_shake_scale", screen_shake_scale)), 0.0, 1.0)
	_migrate_settings_file_if_needed()


func save_settings() -> Error:
	_config.set_value("meta", "version", SETTINGS_VERSION)
	_config.set_value("audio", "master_volume", master_volume)
	_config.set_value("audio", "music_volume", music_volume)
	_config.set_value("audio", "sfx_volume", sfx_volume)
	_config.set_value("audio", "play_music_when_unfocused", play_music_when_unfocused)
	_config.set_value("display", "fullscreen", fullscreen)
	_config.set_value("display", "window_mode", window_mode)
	_config.set_value("display", "vsync", vsync)
	_config.set_value("accessibility", "combat_anim_speed", combat_anim_speed)
	_config.set_value("accessibility", "screen_shake_scale", screen_shake_scale)
	var err := _config.save(SETTINGS_PATH)
	settings_changed.emit()
	return err


func serialize_local_preferences() -> Dictionary:
	return {
		"master_volume": master_volume,
		"music_volume": music_volume,
		"sfx_volume": sfx_volume,
		"play_music_when_unfocused": play_music_when_unfocused,
		"fullscreen": fullscreen,
		"window_mode": window_mode,
		"vsync": vsync,
		"combat_anim_speed": combat_anim_speed,
		"screen_shake_scale": screen_shake_scale,
		"scope": "local_device",
	}


func get_ui_state(key: String, default_value: Variant = null) -> Variant:
	return _config.get_value("ui_state", key, default_value)


func set_ui_state(key: String, value: Variant, persist: bool = true) -> void:
	_config.set_value("ui_state", key, value)
	if persist:
		_config.save(SETTINGS_PATH)


func toggle_fullscreen() -> void:
	if window_mode == "fullscreen" or window_mode == "exclusive" or fullscreen:
		window_mode = "maximized"
		fullscreen = false
	else:
		window_mode = "fullscreen"
		fullscreen = true
	apply_settings()
	save_settings()


func set_window_mode(mode: String, persist: bool = true) -> void:
	var m := mode.strip_edges().to_lower()
	if m not in ["windowed", "maximized", "fullscreen", "exclusive", "borderless"]:
		m = "maximized"
	if m == "borderless":
		m = "fullscreen"
	window_mode = m
	fullscreen = m == "fullscreen" or m == "exclusive"
	apply_settings()
	if persist:
		save_settings()


func apply_settings() -> void:
	RenderingServer.set_default_clear_color(Color.BLACK)
	Engine.max_fps = ClientUi.ANIM_FPS
	if vsync:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED)
	else:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	_apply_content_scale()
	if OS.has_feature("web"):
		apply_audio()
		return
	_apply_window_mode()
	apply_audio()


func _apply_window_mode() -> void:
	match window_mode:
		"exclusive":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN)
		"fullscreen", "borderless":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		"windowed":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			call_deferred("_ensure_visible_window")
		_:
			# maximized (default desktop comfort)
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			call_deferred("_ensure_visible_window")


## Volume only — never touch window mode (sliders used to call apply_settings and break).
func apply_audio() -> void:
	var music := music_volume
	if not play_music_when_unfocused and not _app_has_focus():
		music = 0.0
	AudioManager.apply_volumes(master_volume, music, sfx_volume)


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


func set_play_music_when_unfocused(on: bool, persist: bool = true) -> void:
	play_music_when_unfocused = on
	apply_audio()
	if persist:
		save_settings()


func set_combat_anim_speed(v: float, persist: bool = true) -> void:
	combat_anim_speed = clampf(v, 0.35, 2.0)
	if persist:
		save_settings()


func set_screen_shake_scale(v: float, persist: bool = true) -> void:
	screen_shake_scale = clampf(v, 0.0, 1.0)
	if persist:
		save_settings()


func _persist_audio(immediate: bool) -> void:
	if immediate:
		_audio_save_timer = null
		save_settings()
		return
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
	if ResolutionManager != null:
		ResolutionManager.apply_content_scaling(get_window())
		return
	var win := get_window()
	if win == null:
		return
	win.content_scale_size = DESIGN_SIZE
	win.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	win.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP
	win.content_scale_stretch = Window.CONTENT_SCALE_STRETCH_FRACTIONAL


func _on_window_size_changed() -> void:
	if _enforcing_size:
		return
	_apply_content_scale()


func _app_has_focus() -> bool:
	return DisplayServer.window_is_focused() if not OS.has_feature("web") else true


func _on_app_focus_out() -> void:
	apply_audio()


func _on_app_focus_in() -> void:
	apply_audio()


func _migrate_settings_file_if_needed() -> void:
	var ver := int(_config.get_value("meta", "version", 1))
	if ver >= SETTINGS_VERSION:
		return
	# v1 → v2: derive window_mode from fullscreen bool.
	if window_mode.is_empty():
		window_mode = "fullscreen" if fullscreen else "maximized"
	_config.set_value("meta", "version", SETTINGS_VERSION)
	_config.set_value("display", "window_mode", window_mode)
	_config.save(SETTINGS_PATH)


# ── Account preferences (Node) ────────────────────────────────

func load_account_preferences() -> Dictionary:
	if AuthManager.access_token.is_empty():
		return _account_prefs
	var res: Dictionary = await GameApiClient.invoke("GetAccountPreferences", {})
	if bool(res.get("ok", false)) and typeof(res.get("data", {})) == TYPE_DICTIONARY:
		var data: Dictionary = res.data
		_account_prefs = data.get("preferences", {}) if typeof(data.get("preferences", {})) == TYPE_DICTIONARY else {}
		account_preferences_changed.emit(_account_prefs)
	return _account_prefs


func save_account_preferences(patch: Dictionary) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("SaveAccountPreferences", {"preferences": patch})
	if not bool(res.get("ok", false)):
		return {"ok": false, "error": str(res.get("error", "Save failed"))}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	_account_prefs = data.get("preferences", {}) if typeof(data.get("preferences", {})) == TYPE_DICTIONARY else {}
	account_preferences_changed.emit(_account_prefs)
	return {"ok": true, "preferences": _account_prefs}


func get_account_preferences() -> Dictionary:
	return _account_prefs.duplicate(true)


func _ensure_visible_window() -> void:
	_apply_content_scale()
	if OS.has_feature("web"):
		return
	if fullscreen or window_mode == "fullscreen" or window_mode == "exclusive":
		return
	var mode := DisplayServer.window_get_mode()
	if mode == DisplayServer.WINDOW_MODE_FULLSCREEN \
			or mode == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN:
		return

	var screen := DisplayServer.window_get_current_screen()
	var usable := DisplayServer.screen_get_usable_rect(screen)

	if window_mode == "maximized" and mode != DisplayServer.WINDOW_MODE_MAXIMIZED:
		_enforcing_size = true
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_MAXIMIZED)
		_enforcing_size = false

	mode = DisplayServer.window_get_mode()
	if usable.size.x > 1 and usable.size.y > 1:
		var decor := Vector2i(DisplayServer.window_get_size_with_decorations())
		var pos := Vector2i(DisplayServer.window_get_position())
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
			max_client.x = mini(max_client.x, usable.size.x)
			max_client.y = mini(max_client.y, usable.size.y)
			var fitted := ResolutionRules.largest_16_9_rect(Vector2(max_client))
			if fitted.size.x >= float(MIN_WINDOW.x) and fitted.size.y >= float(MIN_WINDOW.y):
				max_client = Vector2i(int(fitted.size.x), int(fitted.size.y))
			max_client.x -= max_client.x % 2
			max_client.y -= max_client.y % 2
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
			_apply_content_scale()
			return

	mode = DisplayServer.window_get_mode()
	if mode == DisplayServer.WINDOW_MODE_MAXIMIZED:
		_apply_content_scale()
		return

	if usable.size.x <= 1 or usable.size.y <= 1:
		return

	var client := Vector2i(DisplayServer.window_get_size())
	var decor2 := Vector2i(DisplayServer.window_get_size_with_decorations())
	var chrome2 := decor2 - client
	var pad2 := Vector2i(12, 28)
	var max_client2 := Vector2i(
		maxi(MIN_WINDOW.x, usable.size.x - maxi(chrome2.x, 0) - pad2.x),
		maxi(MIN_WINDOW.y, usable.size.y - maxi(chrome2.y, 0) - pad2.y)
	)
	max_client2.x = mini(max_client2.x, usable.size.x)
	max_client2.y = mini(max_client2.y, usable.size.y)
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
	_apply_content_scale()
