extends Node
## Authoritative display resolution for Loot & Lasers (Godot 4.7).
##
## Logical design size: 2560×1440 (content_scale_size).
## Physical window / browser canvas: whatever the OS or HTML provides.
## Stretch: canvas_items + KEEP + FRACTIONAL → uniform fit with pillar/letterbox.
##
## Do not force the physical surface to 2560×1440. Do not add a second
## Control.scale path. SettingsManager delegates content scaling here.

signal game_viewport_changed(viewport_size: Vector2i, game_rect: Rect2, ui_scale: float)
signal resolution_state_changed(state: Dictionary)

const DESIGN_SIZE := ResolutionRules.DESIGN_SIZE
const DESIGN_ASPECT := ResolutionRules.DESIGN_ASPECT
## false = content_scale_size is 2560×1440 (authored sizes already converted ×4/3).
const USE_LEGACY_CONTENT_LAYOUT := false
const MIN_COMFORTABLE := Vector2i(1280, 720)
## Safe physical default when no override / usable rect is available.
const DEFAULT_PHYSICAL_WINDOW := Vector2i(1920, 1080)

var _last_viewport_size := Vector2i.ZERO
var _last_game_rect := Rect2()
var _last_ui_scale := 1.0
var _connected := false
var _clamping_window := false


func _ready() -> void:
	_configure_root_content_scaling()
	_connect_resize_events()
	call_deferred("_ensure_physical_window_fits_display")
	call_deferred("_refresh_display_state")
	var layout := content_scale_size()
	print(
		"[ResolutionManager] ready design=%sx%s layout=%sx%s canvas_items/keep/fractional legacy_layout=%s web=%s"
		% [DESIGN_SIZE.x, DESIGN_SIZE.y, layout.x, layout.y, USE_LEGACY_CONTENT_LAYOUT, OS.has_feature("web")]
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


func is_web() -> bool:
	return OS.has_feature("web")


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
	if _clamping_window:
		return
	apply_content_scaling()
	_refresh_display_state()


func _on_viewport_size_changed() -> void:
	_refresh_display_state()


## If the OS opened a physical window larger than the usable monitor (classic
## 2560×1440 window on a 1080p laptop), clamp it so content scaling can fit.
## Never runs on web — the HTML canvas owns the surface size.
func _ensure_physical_window_fits_display() -> void:
	if is_web():
		apply_content_scaling()
		return
	var win := get_window()
	if win == null:
		return
	var mode := DisplayServer.window_get_mode()
	if mode == DisplayServer.WINDOW_MODE_FULLSCREEN \
			or mode == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN \
			or mode == DisplayServer.WINDOW_MODE_MAXIMIZED:
		apply_content_scaling()
		return

	var screen := DisplayServer.window_get_current_screen()
	var usable := DisplayServer.screen_get_usable_rect(screen)
	if usable.size.x <= 1 or usable.size.y <= 1:
		return

	var client := Vector2i(DisplayServer.window_get_size())
	var decor := Vector2i(DisplayServer.window_get_size_with_decorations())
	var chrome := decor - client
	var pad := Vector2i(12, 28)
	var max_client := Vector2i(
		maxi(MIN_COMFORTABLE.x, usable.size.x - maxi(chrome.x, 0) - pad.x),
		maxi(MIN_COMFORTABLE.y, usable.size.y - maxi(chrome.y, 0) - pad.y)
	)
	# Even dimensions avoid half-pixel stretch shimmer on some GPUs.
	max_client.x -= max_client.x % 2
	max_client.y -= max_client.y % 2

	if client.x <= max_client.x and client.y <= max_client.y:
		apply_content_scaling()
		return

	var target := Vector2i(
		mini(client.x, max_client.x),
		mini(client.y, max_client.y)
	)
	# Prefer a 16:9 client that still fits the usable area.
	var fitted := ResolutionRules.largest_16_9_rect(Vector2(max_client))
	if fitted.size.x >= float(MIN_COMFORTABLE.x) and fitted.size.y >= float(MIN_COMFORTABLE.y):
		target = Vector2i(int(fitted.size.x), int(fitted.size.y))
		target.x -= target.x % 2
		target.y -= target.y % 2

	_clamping_window = true
	DisplayServer.window_set_size(target)
	decor = Vector2i(DisplayServer.window_get_size_with_decorations())
	var pos := Vector2i(
		usable.position.x + maxi(0, (usable.size.x - decor.x) / 2),
		usable.position.y + maxi(0, (usable.size.y - decor.y) / 2)
	)
	pos.x = clampi(pos.x, usable.position.x, usable.position.x + maxi(0, usable.size.x - decor.x))
	pos.y = clampi(pos.y, usable.position.y, usable.position.y + maxi(0, usable.size.y - decor.y))
	DisplayServer.window_set_position(pos)
	_clamping_window = false
	apply_content_scaling()
	if OS.is_debug_build():
		print(
			"[ResolutionManager] clamped oversized window %sx%s → %sx%s (usable %sx%s)"
			% [client.x, client.y, target.x, target.y, usable.size.x, usable.size.y]
		)


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
	resolution_state_changed.emit(build_resolution_state())
	if OS.is_debug_build():
		_log_diagnostics(viewport_size, game_rect, ui_scale)


func build_resolution_state() -> Dictionary:
	var root_window := get_tree().root
	var visible_rect := root_window.get_visible_rect() if root_window else Rect2()
	return {
		"design_size": DESIGN_SIZE,
		"layout_size": content_scale_size(),
		"window_size": Vector2i(root_window.size) if root_window else Vector2i.ZERO,
		"visible_rect": visible_rect,
		"content_scale_size": root_window.content_scale_size if root_window else Vector2i.ZERO,
		"content_scale_mode": root_window.content_scale_mode if root_window else -1,
		"content_scale_aspect": root_window.content_scale_aspect if root_window else -1,
		"content_scale_stretch": root_window.content_scale_stretch if root_window else -1,
		"game_rect": _last_game_rect,
		"ui_scale": _last_ui_scale,
		"is_web": is_web(),
	}


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
