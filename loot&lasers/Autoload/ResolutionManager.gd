extends Node
## Authoritative display resolution for Loot & Lasers (Godot 4.7).
## Project / window base: 2560×1440 @ 16:9 via Window content scaling (canvas_items + KEEP).
##
## Content layout size: native 2560×1440 after scale_design_to_1440 conversion.
## Keep USE_LEGACY_CONTENT_LAYOUT false unless rolling back to pre-conversion sizes.
## Do not add a second scaling path — SettingsManager delegates here.

signal game_viewport_changed(viewport_size: Vector2i, game_rect: Rect2, ui_scale: float)

const DESIGN_SIZE := ResolutionRules.DESIGN_SIZE
const DESIGN_ASPECT := ResolutionRules.DESIGN_ASPECT
## false = content_scale_size is 2560×1440 (authored sizes already converted ×4/3).
const USE_LEGACY_CONTENT_LAYOUT := false
const MIN_COMFORTABLE := Vector2i(1280, 720)

var _last_viewport_size := Vector2i.ZERO
var _last_game_rect := Rect2()
var _last_ui_scale := 1.0
var _connected := false


func _ready() -> void:
	_configure_root_content_scaling()
	_connect_resize_events()
	call_deferred("_refresh_display_state")
	var layout := content_scale_size()
	print(
		"[ResolutionManager] ready design=%sx%s layout=%sx%s canvas_items/keep/fractional legacy_layout=%s"
		% [DESIGN_SIZE.x, DESIGN_SIZE.y, layout.x, layout.y, USE_LEGACY_CONTENT_LAYOUT]
	)


func design_size() -> Vector2i:
	return DESIGN_SIZE


func content_scale_size() -> Vector2i:
	return ResolutionRules.LEGACY_DESIGN_SIZE if USE_LEGACY_CONTENT_LAYOUT else DESIGN_SIZE


func last_game_rect() -> Rect2:
	return _last_game_rect


func last_ui_scale() -> float:
	return _last_ui_scale


func last_viewport_size() -> Vector2i:
	return _last_viewport_size


func apply_content_scaling(win: Window = null) -> void:
	if win == null:
		win = get_window()
	if win == null:
		return
	win.content_scale_size = content_scale_size()
	win.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	win.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP
	win.content_scale_stretch = Window.CONTENT_SCALE_STRETCH_FRACTIONAL


func _configure_root_content_scaling() -> void:
	apply_content_scaling()
	RenderingServer.set_default_clear_color(Color.BLACK)


func _connect_resize_events() -> void:
	if _connected:
		return
	var win := get_window()
	if win == null:
		return
	if not win.size_changed.is_connected(_on_window_size_changed):
		win.size_changed.connect(_on_window_size_changed)
	var vp := get_viewport()
	if vp != null and not vp.size_changed.is_connected(_on_viewport_size_changed):
		vp.size_changed.connect(_on_viewport_size_changed)
	_connected = true


func _on_window_size_changed() -> void:
	apply_content_scaling()
	_refresh_display_state()


func _on_viewport_size_changed() -> void:
	_refresh_display_state()


func _refresh_display_state() -> void:
	var vp := get_viewport()
	if vp == null:
		return
	var available_size := vp.get_visible_rect().size
	var viewport_size := Vector2i(available_size)
	var game_rect := ResolutionRules.largest_16_9_rect(available_size)
	var layout_w := float(content_scale_size().x)
	var ui_scale := game_rect.size.x / layout_w if layout_w > 0.0 else 1.0
	if viewport_size == _last_viewport_size \
			and is_equal_approx(ui_scale, _last_ui_scale) \
			and game_rect.is_equal_approx(_last_game_rect):
		return
	_last_viewport_size = viewport_size
	_last_game_rect = game_rect
	_last_ui_scale = ui_scale
	game_viewport_changed.emit(viewport_size, game_rect, ui_scale)
	if OS.is_debug_build():
		_log_diagnostics(viewport_size, game_rect, ui_scale)


func _log_diagnostics(viewport_size: Vector2i, game_rect: Rect2, ui_scale: float) -> void:
	var win := get_window()
	var win_size := Vector2i(win.size) if win else Vector2i.ZERO
	var screen := DisplayServer.window_get_current_screen() if win else 0
	var dpr := DisplayServer.screen_get_scale(screen) if win else 1.0
	var layout := content_scale_size()
	print(
		"[ResolutionManager] design=%sx%s layout=%sx%s viewport=%sx%s window=%sx%s game=(%.0f,%.0f %.0fx%.0f) ui_scale=%.4f dpr=%.2f screen=%s"
		% [
			DESIGN_SIZE.x, DESIGN_SIZE.y,
			layout.x, layout.y,
			viewport_size.x, viewport_size.y,
			win_size.x, win_size.y,
			game_rect.position.x, game_rect.position.y, game_rect.size.x, game_rect.size.y,
			ui_scale, dpr, screen,
		]
	)
