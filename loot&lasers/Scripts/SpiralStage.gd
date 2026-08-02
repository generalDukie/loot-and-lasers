class_name SpiralStage
extends Control
## Animated holographic spiral map matching web DungeonMap behavior.
## Zoom mirrors web: scale toward focus + lore panel. Focused planet is drawn larger
## and with more surface detail than the chart-node emoji.

signal planet_pressed(planet_id: int, patrol: bool)
signal wormhole_pressed
signal zoom_changed(zooming: bool)

const WORMHOLE_COLOR := Color("#C084FC")
const WORMHOLE_CYAN := Color("#67E8F9")
const ZOOM_NONE := 0
const ZOOM_WORMHOLE := -1
const ZOOM_SCALE := 2.85 # web 2.4; slightly further for inspect readability
## Matches web DungeonMap: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)
const ZOOM_DURATION := 0.32
const CHART_NODE_SIZE := 44.0
const FOCUS_NODE_SIZE := 132.0 # ~chart × ZOOM_SCALE × 1.05 + a little extra

var layout: Dictionary = {}
var _elapsed := 0.0
var _buttons: Dictionary = {}  # pid -> Button
var _wormhole_button: Button
var _structure_stamp: Array = []
var _zoom_id := ZOOM_NONE
var _zoom_amount := 0.0  # 0 = pulled back, 1 = fully zoomed
var _zoom_tween: Tween

var _dim: ColorRect
var _lore_panel: PanelContainer
var _lore_title: Label
var _lore_sector: Label
var _lore_icon: Label
var _lore_body: Label
var _lore_boss: Label
var _lore_reward: Label


func _ready() -> void:
	clip_contents = true
	resized.connect(_on_resized)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process(true)
	_ensure_overlays()
	_rebuild_buttons()


func _process(delta: float) -> void:
	_elapsed += delta
	queue_redraw()


func refresh_state() -> void:
	## Structural changes rebuild nodes; selection/zoom only restyles + repositions.
	var next := _structure_stamp_now()
	if next != _structure_stamp:
		# Defer so we never free the button currently emitting pressed.
		call_deferred("_rebuild_buttons")
	else:
		_refresh_button_looks()
		_position_buttons()
	queue_redraw()


func clear_zoom() -> void:
	if _zoom_id == ZOOM_NONE and _zoom_amount <= 0.001:
		return
	_tween_zoom(0.0)
	zoom_changed.emit(false)


func _structure_stamp_now() -> Array:
	return [
		DungeonManager.current_planet_id(),
		int(GameManager.active_character.get("level", 1)),
	]


func _ensure_overlays() -> void:
	if is_instance_valid(_dim):
		return

	_dim = ColorRect.new()
	_dim.name = "ZoomDim"
	_dim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_dim.color = Color(0, 0, 0, 0.45)
	_dim.mouse_filter = Control.MOUSE_FILTER_STOP
	_dim.visible = false
	_dim.z_index = 40
	_dim.gui_input.connect(_on_dim_input)
	add_child(_dim)

	_lore_panel = PanelContainer.new()
	_lore_panel.name = "LorePanel"
	_lore_panel.visible = false
	_lore_panel.z_index = 50
	_lore_panel.clip_contents = true
	_lore_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_lore_panel.custom_minimum_size = Vector2(373, 0)
	add_child(_lore_panel)

	var lore_col := VBoxContainer.new()
	lore_col.add_theme_constant_override("separation", 10)
	_lore_panel.add_child(lore_col)

	var close_row := HBoxContainer.new()
	lore_col.add_child(close_row)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	close_row.add_child(spacer)
	var close_btn := Button.new()
	close_btn.text = "✕"
	ClientUi.apply_ghost_button(close_btn)
	close_btn.pressed.connect(clear_zoom)
	close_row.add_child(close_btn)

	var hero := HBoxContainer.new()
	hero.add_theme_constant_override("separation", 12)
	lore_col.add_child(hero)
	_lore_icon = Label.new()
	_lore_icon.custom_minimum_size = Vector2(85, 85)
	_lore_icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_lore_icon.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_lore_icon.add_theme_font_size_override("font_size", 48)
	hero.add_child(_lore_icon)
	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hero.add_child(title_col)
	_lore_sector = Label.new()
	_lore_sector.add_theme_font_size_override("font_size", 13)
	ClientUi.apply_display_font(_lore_sector)
	title_col.add_child(_lore_sector)
	_lore_title = Label.new()
	_lore_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_lore_title.add_theme_font_size_override("font_size", 27)
	ClientUi.apply_display_font(_lore_title)
	title_col.add_child(_lore_title)

	_lore_body = Label.new()
	_lore_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_lore_body.max_lines_visible = 5
	_lore_body.add_theme_font_size_override("font_size", 17)
	_lore_body.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(_lore_body)
	lore_col.add_child(_lore_body)

	_lore_boss = Label.new()
	_lore_boss.add_theme_font_size_override("font_size", 15)
	ClientUi.apply_display_font(_lore_boss)
	lore_col.add_child(_lore_boss)

	_lore_reward = Label.new()
	_lore_reward.add_theme_font_size_override("font_size", 15)
	_lore_reward.add_theme_color_override("font_color", Color("#FDE68A"))
	ClientUi.apply_display_font(_lore_reward)
	lore_col.add_child(_lore_reward)

	var hint := Label.new()
	hint.text = "Tap empty space or Esc to pull back"
	hint.add_theme_font_size_override("font_size", 13)
	hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(hint)
	lore_col.add_child(hint)


func _on_dim_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
		clear_zoom()


func _unhandled_input(event: InputEvent) -> void:
	if _zoom_id == ZOOM_NONE:
		return
	if event is InputEventKey and event.pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		clear_zoom()
		get_viewport().set_input_as_handled()


func _rebuild_buttons() -> void:
	if not is_inside_tree():
		return
	_ensure_overlays()

	# Drop old planet/wormhole buttons only (keep overlays).
	# Safe: rebuild is deferred off the pressed callback.
	for pid in _buttons.keys():
		var btn: Button = _buttons[pid]
		if is_instance_valid(btn):
			btn.free()
	_buttons.clear()
	if is_instance_valid(_wormhole_button):
		_wormhole_button.free()
	_wormhole_button = null

	var nodes: Array = layout.get("nodes", [])
	var level := int(GameManager.active_character.get("level", 1))
	var active := DungeonManager.current_planet_id()
	var story_front := mini(active, 10)
	var in_infinite := active > 10

	for i in nodes.size():
		var pid := i + 1
		var planet := DungeonRules.get_planet(pid)
		var level_locked := not DungeonRules.is_unlocked(pid, level)
		var story_locked := not in_infinite and pid > story_front
		var locked := level_locked or story_locked
		var cleared := in_infinite or pid < story_front
		var current := not in_infinite and pid == story_front
		var tint: Color = planet.get("color", ClientUi.CYAN)

		var btn := Button.new()
		btn.name = "World%s" % pid
		btn.focus_mode = Control.FOCUS_NONE
		btn.custom_minimum_size = Vector2(59, 59)
		btn.z_index = 10
		btn.mouse_filter = Control.MOUSE_FILTER_STOP
		btn.text = "🔒" if locked else ("✓" if cleared else str(planet.get("icon", "🪐")))
		btn.add_theme_font_size_override("font_size", 23)
		btn.disabled = locked
		btn.mouse_default_cursor_shape = (
			Control.CURSOR_FORBIDDEN if locked else Control.CURSOR_POINTING_HAND
		)
		if level_locked:
			btn.tooltip_text = "Unlocks at level %s" % DungeonRules.unlock_level(pid)
		elif story_locked:
			btn.tooltip_text = "Locked"
		elif current:
			btn.tooltip_text = "Inspect this world"
		elif cleared:
			btn.tooltip_text = "Patrol this world"
		else:
			btn.tooltip_text = str(planet.get("name", ""))
		var captured := pid
		var is_current := current
		var as_patrol := in_infinite or captured < story_front
		btn.pressed.connect(func() -> void:
			_on_planet_click(captured, as_patrol, is_current)
		)
		add_child(btn)
		# Keep under overlays
		move_child(btn, 0)
		_buttons[pid] = btn
		_style_planet_button(btn, tint, locked, current, false, cleared)

	_wormhole_button = Button.new()
	_wormhole_button.name = "Wormhole"
	_wormhole_button.focus_mode = Control.FOCUS_NONE
	_wormhole_button.custom_minimum_size = Vector2(101, 101)
	_wormhole_button.z_index = 12
	_wormhole_button.text = "∞" if in_infinite else "🔒"
	_wormhole_button.add_theme_font_size_override("font_size", 33)
	_wormhole_button.disabled = not in_infinite
	_wormhole_button.tooltip_text = (
		"Inspect Wormhole · Depth %s" % maxi(1, active - 10)
		if in_infinite
		else "Clear World Zero to open the Wormhole"
	)
	_wormhole_button.pressed.connect(_on_wormhole_click)
	add_child(_wormhole_button)
	move_child(_wormhole_button, 0)
	_style_wormhole_button(in_infinite, false)

	# Overlays always on top
	if is_instance_valid(_dim):
		move_child(_dim, get_child_count() - 1)
	if is_instance_valid(_lore_panel):
		move_child(_lore_panel, get_child_count() - 1)

	_structure_stamp = _structure_stamp_now()
	_refresh_button_looks()
	_position_buttons()
	_apply_zoom_ui()


func _on_planet_click(planet_id: int, patrol: bool, is_current: bool) -> void:
	# Emit first; parent may refresh_state — that must NOT free this button synchronously.
	planet_pressed.emit(planet_id, patrol)
	if is_current:
		if _zoom_id == planet_id:
			clear_zoom()
		else:
			_open_zoom(planet_id)
	elif _zoom_id != ZOOM_NONE:
		clear_zoom()
	else:
		_refresh_button_looks()
		_position_buttons()
		queue_redraw()


func _on_wormhole_click() -> void:
	var active := DungeonManager.current_planet_id()
	if active <= 10:
		return
	wormhole_pressed.emit()
	if _zoom_id == ZOOM_WORMHOLE:
		clear_zoom()
	else:
		_open_zoom(ZOOM_WORMHOLE)


func _open_zoom(id: int) -> void:
	_zoom_id = id
	_fill_lore()
	_apply_zoom_ui()
	_tween_zoom(1.0)
	zoom_changed.emit(true)


func _tween_zoom(to_amount: float) -> void:
	if _zoom_tween != null and _zoom_tween.is_valid():
		_zoom_tween.kill()
	_zoom_tween = create_tween()
	# cubic-bezier(0.22, 1, 0.36, 1) ≈ cubic ease-out
	_zoom_tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_zoom_tween.tween_method(_set_zoom_amount, _zoom_amount, to_amount, ZOOM_DURATION)
	if to_amount <= 0.0:
		_zoom_tween.tween_callback(_finish_zoom_out)


func _set_zoom_amount(value: float) -> void:
	_zoom_amount = clampf(value, 0.0, 1.0)
	if is_instance_valid(_dim):
		_dim.visible = _zoom_amount > 0.02 or _zoom_id != ZOOM_NONE
		_dim.color = Color(0, 0, 0, 0.45 * _zoom_amount)
		_dim.mouse_filter = (
			Control.MOUSE_FILTER_STOP if _zoom_amount > 0.15 else Control.MOUSE_FILTER_IGNORE
		)
	if is_instance_valid(_lore_panel) and _zoom_id != ZOOM_NONE:
		# Lore fades in after the zoom is underway so it never covers the approach.
		var lore_a := clampf((_zoom_amount - 0.4) / 0.55, 0.0, 1.0)
		_lore_panel.visible = lore_a > 0.01
		_lore_panel.modulate.a = lore_a
		if lore_a > 0.01:
			_position_lore(lore_a)
	_position_buttons()
	queue_redraw()


func _finish_zoom_out() -> void:
	_zoom_id = ZOOM_NONE
	_zoom_amount = 0.0
	if is_instance_valid(_dim):
		_dim.visible = false
		_dim.color = Color(0, 0, 0, 0.45)
	if is_instance_valid(_lore_panel):
		_lore_panel.visible = false
		_lore_panel.modulate.a = 1.0
	_apply_zoom_ui()
	_refresh_button_looks()
	_position_buttons()
	queue_redraw()


func _fill_lore() -> void:
	if not is_instance_valid(_lore_panel):
		return
	var planet: Dictionary
	var tint: Color
	if _zoom_id == ZOOM_WORMHOLE:
		planet = DungeonRules.get_planet(DungeonManager.current_planet_id())
		tint = WORMHOLE_COLOR
		_lore_sector.text = "SECTOR LORE"
	else:
		planet = DungeonRules.get_planet(_zoom_id)
		tint = planet.get("color", ClientUi.CYAN)
		_lore_sector.text = "WORLD %s · LORE BRIEF" % _zoom_id
	_lore_sector.add_theme_color_override("font_color", tint)
	_lore_title.text = str(planet.get("name", "?"))
	_lore_title.add_theme_color_override("font_color", tint)
	_lore_icon.text = str(planet.get("icon", "🪐"))
	_lore_icon.add_theme_stylebox_override(
		"normal",
		ClientUi.painted_panel_style(Color(tint, 0.28), Color(tint, 0.95), 32, 3)
	)
	_lore_body.text = str(planet.get("lore", planet.get("desc", "")))
	var boss := str(planet.get("boss", ""))
	_lore_boss.visible = not boss.is_empty()
	_lore_boss.text = "%s  Boss · %s" % [str(planet.get("boss_emoji", "☠")), boss]
	_lore_boss.add_theme_color_override("font_color", tint)
	var mod := str(planet.get("ship_mod", ""))
	_lore_reward.visible = not mod.is_empty()
	_lore_reward.text = "Clear reward · %s" % mod
	_lore_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.03, 0.035, 0.07, 0.98), Color(tint, 0.7), 16, 2
	))


func _apply_zoom_ui() -> void:
	var zooming := _zoom_id != ZOOM_NONE
	if is_instance_valid(_dim):
		_dim.visible = zooming or _zoom_amount > 0.02
	if is_instance_valid(_lore_panel):
		if zooming:
			_fill_lore()
			_lore_panel.visible = _zoom_amount > 0.4
			_position_lore(_zoom_amount)
		else:
			_lore_panel.visible = false

	# Non-focus nodes stay drawable via _draw; only hide their hit targets when zoomed.
	for pid in _buttons.keys():
		var btn: Button = _buttons[pid]
		if not is_instance_valid(btn):
			continue
		var focus: bool = zooming and pid == _zoom_id
		btn.visible = not zooming or focus
		btn.z_index = 45 if focus else 10
		if focus:
			btn.text = ""
			_style_focus_hit(btn, DungeonRules.get_planet(pid).get("color", ClientUi.CYAN))
			if is_instance_valid(_dim):
				move_child(btn, _dim.get_index())
	if is_instance_valid(_wormhole_button):
		var wh_focus: bool = zooming and _zoom_id == ZOOM_WORMHOLE
		_wormhole_button.visible = not zooming or wh_focus
		_wormhole_button.z_index = 45 if wh_focus else 12
		if wh_focus and is_instance_valid(_dim):
			move_child(_wormhole_button, _dim.get_index())

	if is_instance_valid(_lore_panel):
		move_child(_lore_panel, get_child_count() - 1)

	_position_buttons()


func _position_lore(anim_t: float = 1.0) -> void:
	## Web sm+: left mid; wide map → bottom-left so the focused planet stays clear.
	if not is_instance_valid(_lore_panel):
		return
	var margin := 14.0
	var w := mini(size.x * 0.42, 380.0)
	w = maxf(w, 260.0)
	_lore_panel.custom_minimum_size = Vector2(w, 0)
	_lore_panel.reset_size()
	var natural_h := maxf(_lore_panel.get_combined_minimum_size().y, 100.0)
	var max_h := size.y * 0.48
	var h := mini(natural_h, max_h)
	_lore_panel.size = Vector2(w, h)
	var slide := (1.0 - clampf(anim_t, 0.0, 1.0)) * 16.0
	# Prefer bottom-left (matches inspect screenshot); clamp so it stays on-stage.
	var x := margin
	var y := size.y - h - margin + slide
	if size.y > 520.0:
		# Tall stage: mid-left like web desktop lore.
		y = clampf((size.y - h) * 0.5 + slide, margin, size.y - h - margin)
	_lore_panel.position = Vector2(x, y)


func _map_metrics() -> Dictionary:
	var side := minf(size.x, size.y)
	var offset := Vector2((size.x - side) * 0.5, (size.y - side) * 0.5)
	var center := offset + Vector2(side, side) * 0.5
	return {"side": side, "offset": offset, "center": center}


func _focus_pct() -> Vector2:
	if _zoom_id == ZOOM_WORMHOLE:
		return SpiralMap.WORMHOLE
	if _zoom_id >= 1:
		var nodes: Array = layout.get("nodes", [])
		var idx := _zoom_id - 1
		if idx >= 0 and idx < nodes.size():
			return nodes[idx]
	return Vector2(50, 50)


func _xform(p: Vector2) -> Vector2:
	## Web: translate((50-fx)*S, (50-fy)*S) scale(S) origin center
	## → p' = S*(p - focus) + center, eased by _zoom_amount
	var m := _map_metrics()
	var side: float = m["side"]
	var offset: Vector2 = m["offset"]
	var center: Vector2 = m["center"]
	if side < 10.0 or _zoom_amount <= 0.001 or _zoom_id == ZOOM_NONE:
		return p
	# Nudge focus slightly up-right so the left lore card doesn't cover the orb.
	center.y -= size.y * 0.04 * _zoom_amount
	center.x += size.x * 0.06 * _zoom_amount
	var focus := SpiralMap.pct_to_px(_focus_pct(), side) + offset
	var zoomed := ZOOM_SCALE * (p - focus) + center
	return p.lerp(zoomed, _zoom_amount)


func _xform_radius(r: float) -> float:
	return r * lerpf(1.0, ZOOM_SCALE, _zoom_amount)


func _refresh_button_looks() -> void:
	var level := int(GameManager.active_character.get("level", 1))
	var active := DungeonManager.current_planet_id()
	var story_front := mini(active, 10)
	var in_infinite := active > 10
	var selected := DungeonManager.selected_planet_id
	for pid in _buttons.keys():
		var btn: Button = _buttons[pid]
		if not is_instance_valid(btn):
			continue
		var planet := DungeonRules.get_planet(pid)
		var tint: Color = planet.get("color", ClientUi.CYAN)
		var level_locked: bool = not DungeonRules.is_unlocked(pid, level)
		var story_locked: bool = not in_infinite and pid > story_front
		var locked: bool = level_locked or story_locked
		var cleared: bool = in_infinite or pid < story_front
		var current: bool = not in_infinite and pid == story_front
		var is_selected: bool = not DungeonManager.viewing_wormhole and pid == selected
		if locked:
			btn.text = "🔒"
		elif cleared and _zoom_id != pid:
			btn.text = "✓"
		else:
			btn.text = str(planet.get("icon", "🪐"))
		_style_planet_button(btn, tint, locked, current, is_selected, cleared)
	if is_instance_valid(_wormhole_button):
		_style_wormhole_button(
			active > 10,
			DungeonManager.viewing_wormhole or _zoom_id == ZOOM_WORMHOLE
		)


func _style_focus_hit(btn: Button, tint: Color) -> void:
	## Transparent circular hit target; white ring + glow drawn under it.
	var clear := Color(0, 0, 0, 0)
	var ring := Color.WHITE
	var r := int(_focus_node_size() * 0.5)
	btn.add_theme_stylebox_override("normal", ClientUi.painted_panel_style(clear, Color(ring, 0.95), r, 3))
	btn.add_theme_stylebox_override("hover", ClientUi.painted_panel_style(Color(tint, 0.08), ring, r, 3))
	btn.add_theme_stylebox_override("pressed", ClientUi.painted_panel_style(Color(tint, 0.12), ring, r, 3))
	btn.add_theme_stylebox_override("disabled", ClientUi.painted_panel_style(clear, Color(0.4, 0.4, 0.45, 0.5), r, 2))


func _style_planet_button(
	btn: Button,
	tint: Color,
	locked: bool,
	current: bool,
	selected: bool,
	cleared: bool
) -> void:
	var border := Color(0.28, 0.3, 0.38, 0.7) if locked else tint
	if selected:
		border = Color.WHITE
	var bg := Color(0.04, 0.045, 0.075, 0.96) if locked else Color(tint, 0.16)
	if current:
		bg = Color(tint, 0.28)
	elif cleared:
		bg = Color(ClientUi.SUCCESS, 0.11)
	btn.add_theme_stylebox_override("normal", ClientUi.painted_panel_style(bg, Color(border, 0.9), 24, 2))
	btn.add_theme_stylebox_override(
		"hover",
		ClientUi.painted_panel_style(Color(tint, 0.3), tint.lightened(0.3), 24, 2)
	)
	btn.add_theme_stylebox_override(
		"pressed",
		ClientUi.painted_panel_style(Color(tint, 0.2), Color.WHITE, 24, 2)
	)
	btn.add_theme_stylebox_override(
		"disabled",
		ClientUi.painted_panel_style(Color(0.035, 0.04, 0.065, 0.84), Color(0.25, 0.27, 0.34, 0.5), 24, 1)
	)
	btn.add_theme_color_override("font_color", tint.lightened(0.2))
	btn.add_theme_color_override("font_hover_color", Color.WHITE)
	btn.add_theme_color_override("font_disabled_color", Color(0.42, 0.44, 0.5))
	ClientUi.apply_interaction_motion(btn, 1.04)


func _style_wormhole_button(unlocked: bool, selected: bool) -> void:
	if not is_instance_valid(_wormhole_button):
		return
	var border := Color.WHITE if selected else (WORMHOLE_COLOR if unlocked else Color(0.3, 0.3, 0.36))
	var bg := Color(0.08, 0.015, 0.14, 0.98) if unlocked else Color(0.035, 0.035, 0.06, 0.9)
	_wormhole_button.add_theme_stylebox_override(
		"normal", ClientUi.painted_panel_style(bg, Color(border, 0.9), 38, 2)
	)
	_wormhole_button.add_theme_stylebox_override(
		"hover", ClientUi.painted_panel_style(Color(WORMHOLE_COLOR, 0.3), WORMHOLE_CYAN, 38, 3)
	)
	_wormhole_button.add_theme_stylebox_override(
		"disabled", ClientUi.painted_panel_style(bg, Color(border, 0.45), 38, 1)
	)
	_wormhole_button.add_theme_color_override("font_color", WORMHOLE_CYAN)
	_wormhole_button.add_theme_color_override("font_disabled_color", Color(0.42, 0.42, 0.5))
	if unlocked:
		ClientUi.apply_interaction_motion(_wormhole_button, 1.1)


func _on_resized() -> void:
	_position_buttons()
	if _zoom_id != ZOOM_NONE:
		_position_lore(_zoom_amount)
	queue_redraw()


func _focus_node_size() -> float:
	return lerpf(CHART_NODE_SIZE, FOCUS_NODE_SIZE, _zoom_amount)


func _position_buttons() -> void:
	var m := _map_metrics()
	var side: float = m["side"]
	var offset: Vector2 = m["offset"]
	if side < 10.0:
		return
	var nodes: Array = layout.get("nodes", [])
	var zooming := _zoom_id != ZOOM_NONE
	for i in nodes.size():
		var pid := i + 1
		var btn: Button = _buttons.get(pid)
		if not is_instance_valid(btn):
			continue
		var raw := SpiralMap.pct_to_px(nodes[i], side) + offset
		var px := _xform(raw)
		var edge := _focus_node_size() if (zooming and pid == _zoom_id) else CHART_NODE_SIZE
		var sz := Vector2(edge, edge)
		btn.custom_minimum_size = sz
		btn.size = sz
		btn.position = px - sz * 0.5
		if zooming and pid == _zoom_id:
			# Hit target only — surface art is drawn in _draw_focus_planet.
			btn.text = ""
			btn.add_theme_font_size_override("font_size", 1)
		else:
			btn.add_theme_font_size_override("font_size", 23)
	if is_instance_valid(_wormhole_button):
		var raw_w := SpiralMap.pct_to_px(SpiralMap.WORMHOLE, side) + offset
		var wp := _xform(raw_w)
		var edge_w := lerpf(76.0, 150.0, _zoom_amount) if (zooming and _zoom_id == ZOOM_WORMHOLE) else 76.0
		var wsz := Vector2(edge_w, edge_w)
		_wormhole_button.custom_minimum_size = wsz
		_wormhole_button.size = wsz
		_wormhole_button.position = wp - wsz * 0.5


func _draw() -> void:
	var m := _map_metrics()
	var side: float = m["side"]
	var offset: Vector2 = m["offset"]
	if side < 10.0:
		return
	var map_rect := Rect2(offset, Vector2(side, side))
	# Background stays unzoomed (clip frame).
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.015, 0.02, 0.055, 0.97))
	_draw_holo_grid(map_rect)
	_draw_stars(map_rect)
	_draw_spiral(side, offset)
	_draw_planet_fx(side, offset)
	_draw_wormhole(side, offset)
	if _zoom_id == ZOOM_NONE:
		_draw_scan_sweep(map_rect)


func _draw_holo_grid(rect: Rect2) -> void:
	# Grid drawn in zoomed space so it pans with the coil.
	var step := maxf(28.0, rect.size.x / 13.0)
	var x := rect.position.x
	while x <= rect.end.x:
		var a := _xform(Vector2(x, rect.position.y))
		var b := _xform(Vector2(x, rect.end.y))
		draw_line(a, b, Color(ClientUi.CYAN, 0.055), 1.0)
		x += step
	var y := rect.position.y
	while y <= rect.end.y:
		var a2 := _xform(Vector2(rect.position.x, y))
		var b2 := _xform(Vector2(rect.end.x, y))
		draw_line(a2, b2, Color(ClientUi.CYAN, 0.055), 1.0)
		y += step
	var c := _xform(rect.get_center())
	for r in [0.18, 0.32, 0.46]:
		draw_arc(c, _xform_radius(rect.size.x * r), 0, TAU, 64, Color(WORMHOLE_COLOR, 0.045), 1.0)


func _draw_stars(rect: Rect2) -> void:
	var seed_value := 2654435761
	for i in 52:
		seed_value = int(seed_value * 1597334677) & 0x7FFFFFFF
		var sx := float(seed_value % 970) / 1000.0
		seed_value = int(seed_value * 2246822519) & 0x7FFFFFFF
		var sy := float(seed_value % 970) / 1000.0
		var twinkle := 0.55 if _zoom_id != ZOOM_NONE else (
			0.3 + 0.7 * absf(sin(_elapsed * (0.7 + float(i % 5) * 0.12) + i))
		)
		var p := _xform(rect.position + Vector2(sx, sy) * rect.size)
		draw_circle(
			p,
			_xform_radius(0.7 + float(i % 4) * 0.35),
			Color(1, 1, 1, (0.12 + float(i % 5) * 0.05) * twinkle)
		)


func _draw_spiral(side: float, offset: Vector2) -> void:
	var guide: Array = layout.get("guide", [])
	if guide.size() >= 2:
		var points := PackedVector2Array()
		for point in guide:
			points.append(_xform(SpiralMap.pct_to_px(point, side) + offset))
		# Soft purple glow + dashed cyan spine (mockup parity).
		draw_polyline(points, Color(WORMHOLE_COLOR, 0.22), _xform_radius(6.0), true)
		draw_polyline(points, Color(WORMHOLE_COLOR, 0.55), _xform_radius(2.0), true)
		_draw_dashed_polyline(points, Color(ClientUi.CYAN, 0.35), _xform_radius(1.2), 10.0, 7.0)

	var nodes: Array = layout.get("nodes", [])
	var active := DungeonManager.current_planet_id()
	var story_front := mini(active, 10)
	var in_infinite := active > 10
	for i in range(1, nodes.size()):
		var a := SpiralMap.pct_to_px(nodes[i - 1], side) + offset
		var b := SpiralMap.pct_to_px(nodes[i], side) + offset
		var control := SpiralMap.pct_to_px(SpiralMap.segment_control(nodes[i - 1], nodes[i]), side) + offset
		var route := _quadratic_points(a, control, b, 20)
		var unlocked := in_infinite or i + 1 <= story_front
		var planet := DungeonRules.get_planet(i)
		var tint: Color = planet.get("color", ClientUi.CYAN) if unlocked else Color(0.28, 0.29, 0.34)
		var xformed := PackedVector2Array()
		for pt in route:
			xformed.append(_xform(pt))
		if unlocked:
			draw_polyline(xformed, Color(tint, 0.35), _xform_radius(3.4), true)
			_draw_dashed_polyline(xformed, Color(tint, 0.85), _xform_radius(1.8), 9.0, 6.0)
		else:
			_draw_dashed_polyline(xformed, Color(tint, 0.28), _xform_radius(1.2), 8.0, 8.0)
		if unlocked and _zoom_id == ZOOM_NONE:
			_draw_route_packets(xformed, tint, i)

	if nodes.size() >= 10:
		var a2 := SpiralMap.pct_to_px(nodes[9], side) + offset
		var b2 := SpiralMap.pct_to_px(SpiralMap.WORMHOLE, side) + offset
		var control2 := SpiralMap.pct_to_px(SpiralMap.segment_control(nodes[9], SpiralMap.WORMHOLE), side) + offset
		var route2 := _quadratic_points(a2, control2, b2, 20)
		var x2 := PackedVector2Array()
		for pt in route2:
			x2.append(_xform(pt))
		var wh_tint := WORMHOLE_COLOR if in_infinite else Color(0.28, 0.29, 0.34)
		_draw_dashed_polyline(x2, Color(wh_tint, 0.7 if in_infinite else 0.28), _xform_radius(1.8), 9.0, 6.0)


func _draw_dashed_polyline(
	points: PackedVector2Array, color: Color, width: float, dash: float, gap: float
) -> void:
	if points.size() < 2:
		return
	var carry := 0.0
	var drawing := true
	for i in range(1, points.size()):
		var a: Vector2 = points[i - 1]
		var b: Vector2 = points[i]
		var seg := b - a
		var seg_len := seg.length()
		if seg_len <= 0.001:
			continue
		var dir := seg / seg_len
		var t := 0.0
		while t < seg_len:
			var step := (dash if drawing else gap) - carry
			var next_t := minf(seg_len, t + step)
			if drawing:
				draw_line(a + dir * t, a + dir * next_t, color, width, true)
			var advanced := next_t - t
			if advanced + 0.0001 >= step:
				drawing = not drawing
				carry = 0.0
			else:
				carry += advanced
			t = next_t


func _quadratic_points(a: Vector2, control: Vector2, b: Vector2, steps: int) -> PackedVector2Array:
	var points := PackedVector2Array()
	for i in steps:
		var t := float(i) / float(steps - 1)
		points.append((1.0 - t) * (1.0 - t) * a + 2.0 * (1.0 - t) * t * control + t * t * b)
	return points


func _draw_route_packets(route: PackedVector2Array, tint: Color, lane: int) -> void:
	if route.size() < 2:
		return
	for packet in 2:
		var progress := fposmod(_elapsed * (0.24 + lane * 0.006) + packet * 0.5 + lane * 0.11, 1.0)
		var index := clampi(int(progress * float(route.size() - 1)), 0, route.size() - 1)
		draw_circle(route[index], 2.3, Color(tint.lightened(0.35), 0.9))
		draw_circle(route[index], 5.0, Color(tint, 0.13))


func _draw_planet_fx(side: float, offset: Vector2) -> void:
	var nodes: Array = layout.get("nodes", [])
	var active := DungeonManager.current_planet_id()
	var story_front := mini(active, 10)
	var in_infinite := active > 10
	var selected := DungeonManager.selected_planet_id
	var level := int(GameManager.active_character.get("level", 1))
	var zooming := _zoom_id != ZOOM_NONE
	for i in nodes.size():
		var pid := i + 1
		var raw := SpiralMap.pct_to_px(nodes[i], side) + offset
		var point := _xform(raw)
		var planet := DungeonRules.get_planet(pid)
		var tint: Color = planet.get("color", ClientUi.CYAN)
		var locked := not DungeonRules.is_unlocked(pid, level) or (not in_infinite and pid > story_front)
		if zooming and pid == _zoom_id:
			_draw_focus_planet(point, tint, pid)
			continue
		if not locked:
			draw_circle(point, _xform_radius(31.0), Color(tint, 0.055))
		if not zooming and ((pid == story_front and not in_infinite) or (pid == selected and not DungeonManager.viewing_wormhole)):
			var pulse := _xform_radius(26.0 + fposmod(_elapsed * 18.0, 18.0))
			var alpha := 0.5 * (1.0 - fposmod(_elapsed * 1.1, 1.0))
			draw_arc(point, pulse, 0, TAU, 32, Color(tint, alpha), 1.5)

		if zooming:
			continue
		var label_offset := SpiralMap.pct_to_px(SpiralMap.radial_label_offset(nodes[i]), side)
		var label_pos := _xform(raw + label_offset)
		var state := ""
		if locked:
			state = "Lv %s" % DungeonRules.unlock_level(pid)
		elif in_infinite or pid < story_front:
			state = "PATROL" if pid == selected and not DungeonManager.viewing_wormhole else ""
		elif pid == story_front:
			state = "HERE · TAP"
		var title := "%s. %s" % [pid, str(planet.get("name", ""))]
		draw_string(
			ClientUi.display_font() if ClientUi.display_font() != null else ThemeDB.fallback_font,
			label_pos + Vector2(-34, 2),
			title,
			HORIZONTAL_ALIGNMENT_CENTER,
			68,
			9,
			Color(tint, 0.95) if not locked else Color(0.46, 0.47, 0.52, 0.75)
		)
		if not state.is_empty():
			draw_string(
				ClientUi.display_font() if ClientUi.display_font() != null else ThemeDB.fallback_font,
				label_pos + Vector2(-30, 13),
				state,
				HORIZONTAL_ALIGNMENT_CENTER,
				60,
				7,
				(Color(ClientUi.GOLD, 0.9) if state == "PATROL" else Color(ClientUi.CYAN_SOFT, 0.7))
				if not locked else Color(ClientUi.MUTED, 0.55)
			)


func _draw_focus_planet(center: Vector2, tint: Color, world_id: int) -> void:
	## Detailed inspect orb: atmosphere, oceans, continents, limb darkening, ring.
	var r := _focus_node_size() * 0.42
	var ocean := tint.darkened(0.35).lerp(Color(0.08, 0.22, 0.42), 0.35)
	var land := tint.lightened(0.08).lerp(Color(0.18, 0.55, 0.22), 0.25)
	var land_dark := land.darkened(0.28)
	var atmos := Color(tint.lightened(0.25), 0.22)

	# Soft outer glow (matches neon halo in mockup).
	draw_circle(center, r * 1.55, Color(tint, 0.07 * _zoom_amount))
	draw_circle(center, r * 1.28, Color(tint, 0.12 * _zoom_amount))
	draw_circle(center, r * 1.08, atmos)

	# Body — limb darkening via concentric discs.
	draw_circle(center, r, Color(ocean.darkened(0.25), 1.0))
	draw_circle(center + Vector2(-r * 0.12, -r * 0.14), r * 0.92, ocean)
	draw_circle(center + Vector2(-r * 0.22, -r * 0.26), r * 0.55, ocean.lightened(0.12))

	# Continent blobs (deterministic per world id).
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(world_id * 7919 + 17)
	for _i in 7:
		var ang := rng.randf() * TAU
		var dist := rng.randf_range(0.08, 0.62) * r
		var blob_r := rng.randf_range(0.14, 0.34) * r
		var pos := center + Vector2(cos(ang), sin(ang)) * dist + Vector2(-r * 0.05, -r * 0.08)
		if pos.distance_to(center) + blob_r * 0.35 > r * 0.98:
			continue
		draw_circle(pos, blob_r, land if (_i % 2 == 0) else land_dark)
		if rng.randf() > 0.45:
			draw_circle(pos + Vector2(blob_r * 0.25, -blob_r * 0.15), blob_r * 0.45, land.lightened(0.1))

	# Polar caps / haze.
	draw_circle(center + Vector2(0, -r * 0.72), r * 0.22, Color(0.85, 0.95, 1.0, 0.35))
	draw_circle(center + Vector2(0.05 * r, r * 0.7), r * 0.18, Color(0.75, 0.9, 1.0, 0.22))

	# Specular highlight.
	draw_circle(center + Vector2(-r * 0.32, -r * 0.38), r * 0.16, Color(1, 1, 1, 0.28))
	draw_circle(center + Vector2(-r * 0.28, -r * 0.34), r * 0.07, Color(1, 1, 1, 0.55))

	# Thin terminator shade on the far limb.
	draw_arc(center, r * 0.96, PI * 0.15, PI * 1.05, 28, Color(0, 0, 0, 0.28), r * 0.08)

	# Selection ring (white) + tint halo — button styles echo this.
	draw_arc(center, r + 3.0, 0, TAU, 48, Color(1, 1, 1, 0.92), 2.5)
	draw_arc(center, r + 7.0, 0, TAU, 48, Color(tint, 0.55), 2.0)

	# Slow atmosphere shimmer.
	var shimmer := fposmod(_elapsed * 0.35, TAU)
	draw_arc(center, r * 1.02, shimmer, shimmer + PI * 0.55, 20, Color(tint.lightened(0.4), 0.35), 1.5)


func _draw_wormhole(side: float, offset: Vector2) -> void:
	var raw := SpiralMap.pct_to_px(SpiralMap.WORMHOLE, side) + offset
	var center := _xform(raw)
	var active := DungeonManager.current_planet_id()
	var unlocked := active > 10
	var base := WORMHOLE_COLOR if unlocked else Color(0.3, 0.3, 0.36)
	var pulse := 1.0 + 0.08 * sin(_elapsed * 2.2)
	draw_circle(center, _xform_radius(52.0 * pulse), Color(base, 0.08 if unlocked else 0.035))
	for i in 3:
		var radius := _xform_radius((30.0 + i * 8.0) * pulse)
		var start := _elapsed * (0.6 + i * 0.25) * (-1.0 if i == 1 else 1.0)
		draw_arc(
			center, radius, start, start + PI * (1.25 + i * 0.15), 32,
			Color(WORMHOLE_CYAN if i == 1 else base, 0.65 if unlocked else 0.18),
			_xform_radius(2.0 - i * 0.3)
		)
	draw_circle(center, _xform_radius(15.0 + 2.0 * sin(_elapsed * 2.0)), Color(0.01, 0.002, 0.035, 1.0))
	if unlocked:
		for i in 3:
			var angle := _elapsed * (1.1 + i * 0.2) + i * TAU / 3.0
			draw_circle(
				center + Vector2(cos(angle) * _xform_radius(31.0), sin(angle) * _xform_radius(18.0)),
				_xform_radius(2.2),
				Color(0.9, 0.85, 1.0)
			)
	if _zoom_id == ZOOM_NONE:
		var label := "∞ WORMHOLE · DEPTH %s" % maxi(1, active - 10) if unlocked else "∞ WORMHOLE SEALED"
		draw_string(
			ClientUi.display_font() if ClientUi.display_font() != null else ThemeDB.fallback_font,
			center + Vector2(-72, 58),
			label,
			HORIZONTAL_ALIGNMENT_CENTER,
			144,
			10,
			Color(base, 0.95 if unlocked else 0.55)
		)
		if unlocked and DungeonManager.viewing_wormhole:
			draw_string(
				ClientUi.display_font() if ClientUi.display_font() != null else ThemeDB.fallback_font,
				center + Vector2(-24, 72),
				"ENTER",
				HORIZONTAL_ALIGNMENT_CENTER,
				48,
				9,
				WORMHOLE_CYAN
			)
		elif not unlocked:
			draw_string(
				ClientUi.display_font() if ClientUi.display_font() != null else ThemeDB.fallback_font,
				center + Vector2(-48, 72),
				"Clear World Zero",
				HORIZONTAL_ALIGNMENT_CENTER,
				96,
				8,
				Color(ClientUi.MUTED, 0.7)
			)


func _draw_scan_sweep(rect: Rect2) -> void:
	var y := rect.position.y + fposmod(_elapsed / 6.0, 1.0) * rect.size.y
	for i in 7:
		var alpha := (1.0 - float(i) / 7.0) * 0.045
		draw_line(
			Vector2(rect.position.x, y - i * 3.0),
			Vector2(rect.end.x, y - i * 3.0),
			Color(ClientUi.CYAN, alpha),
			1.0
		)
