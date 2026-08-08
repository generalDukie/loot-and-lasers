extends Node
## Transient "action blocked" popup for player-fault problems only — the kind the
## player can fix themselves (not enough Stardust/Nova/Fuel, level or unlock
## requirement not met, bag full, on cooldown, "already on a mission", etc.).
##
## Draws a single warning card, briefly, centered in the game content pane. It is
## NOT for network/server failures — those keep their existing inline handling.
##
## Usage from anywhere:
##   Notify.blocked("Not enough Stardust")
##   Notify.blocked("Locked", "Reach level 10 to enter the Galactic Frontier")

const HOLD_SEC := 1.5
const DUP_WINDOW_MS := 900
const MAX_WIDTH := 460.0

var _layer: CanvasLayer
var _overlay: Control
var _card: PanelContainer
var _tween: Tween
var _region: Control = null
var _last_msg := ""
var _last_ms := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_layer = CanvasLayer.new()
	_layer.layer = 128
	add_child(_layer)
	_overlay = Control.new()
	_overlay.name = "NotifyOverlay"
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_layer.add_child(_overlay)


## Registered by game_shell so the card centers over the content pane rather than
## the whole window. Full-screen scenes (login, character select, combat) simply
## never register, so the card falls back to viewport center.
func set_content_region(region: Control) -> void:
	_region = region


func clear_content_region(region: Control = null) -> void:
	if region == null or region == _region:
		_region = null


## Primary entry point for player-fault, action-blocked messages.
func blocked(message: String, hint: String = "") -> void:
	_show(message, hint)


## Alias so call sites can read naturally as an error notification.
func player_error(message: String, hint: String = "") -> void:
	_show(message, hint)


## Player-fault business rejections we surface as a center popup. System failures
## (network, timeout, internal, auth/session) are NOT player-fault and are left for
## the caller to handle inline.
const _PLAYER_FAULT_CODES := {
	"VALIDATION_ERROR": true,
	"CONFLICT": true,
	"FORBIDDEN": true,
	"NOT_FOUND": true,
}
const _SYSTEM_CODES := {
	"NETWORK_ERROR": true,
	"TIMEOUT": true,
	"INTERNAL_ERROR": true,
	"UNAUTHORIZED": true,
	"AUTH_SESSION_INVALID": true,
}


## Returns true when `res` is a player-fault rejection and a popup was shown.
## Returns false for system/network failures so the caller can fall back to its
## existing inline handling. `hint` is an optional secondary line.
func from_result(res: Dictionary, hint: String = "") -> bool:
	if bool(res.get("ok", false)):
		return false
	if not is_player_fault(res):
		return false
	var msg := str(res.get("error", "")).strip_edges()
	if msg.is_empty():
		msg = "That action isn't available right now."
	_show(msg, hint)
	return true


func is_player_fault(res: Dictionary) -> bool:
	var code := str(res.get("code", ""))
	if _SYSTEM_CODES.has(code):
		return false
	if _PLAYER_FAULT_CODES.has(code):
		return true
	var status := int(res.get("status", 0))
	return status >= 400 and status < 500


func _show(message: String, hint: String) -> void:
	var msg := message.strip_edges()
	if msg.is_empty():
		return
	var now := Time.get_ticks_msec()
	if msg == _last_msg and now - _last_ms < DUP_WINDOW_MS:
		return
	_last_msg = msg
	_last_ms = now

	if _tween != null and _tween.is_valid():
		_tween.kill()
	if _card != null and is_instance_valid(_card):
		_card.queue_free()
	_card = _build_card(msg, hint.strip_edges())
	_overlay.add_child(_card)

	var audio := get_node_or_null("/root/AudioManager")
	if audio != null and audio.has_method("play_ui"):
		audio.play_ui("error")

	_center_card()
	_card.resized.connect(_center_card)

	_card.modulate.a = 0.0
	_card.scale = Vector2(0.94, 0.94)
	_tween = create_tween()
	_tween.tween_property(_card, "modulate:a", 1.0, 0.14)
	(
		_tween
		. parallel()
		. tween_property(_card, "scale", Vector2.ONE, 0.18)
		. set_trans(Tween.TRANS_BACK)
		. set_ease(Tween.EASE_OUT)
	)
	_tween.tween_interval(HOLD_SEC)
	_tween.tween_property(_card, "modulate:a", 0.0, 0.3)
	_tween.tween_callback(
		func() -> void:
			if is_instance_valid(_card):
				_card.queue_free()
			_card = null
	)


func _center_card() -> void:
	if _card == null or not is_instance_valid(_card):
		return
	var center := _overlay.get_viewport_rect().size * 0.5
	if (
		_region != null
		and is_instance_valid(_region)
		and _region.is_inside_tree()
		and _region.is_visible_in_tree()
	):
		var r := _region.get_global_rect()
		if r.size.x > 8.0 and r.size.y > 8.0:
			center = r.position + r.size * 0.5
	var sz := _card.get_combined_minimum_size()
	sz.x = minf(sz.x, MAX_WIDTH)
	_card.size = sz
	_card.pivot_offset = sz * 0.5
	_card.position = (center - sz * 0.5).round()


func _build_card(message: String, hint: String) -> PanelContainer:
	var amber := Color("#F5A524")
	var card := PanelContainer.new()
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.z_index = 10
	card.add_theme_stylebox_override(
		"panel", ClientUi.panel_style(Color(0.12, 0.07, 0.02, 0.96), Color(amber.r, amber.g, amber.b, 0.85))
	)
	card.custom_minimum_size = Vector2(220.0, 0.0)

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", ClientUi.px(10))
	card.add_child(row)

	var icon := UiIcon.make("warning", amber, 26.0)
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)

	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	col.add_theme_constant_override("separation", 2)
	row.add_child(col)

	var title := Label.new()
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = message
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.custom_minimum_size.x = 180.0
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(1.0, 0.96, 0.9))
	ClientUi.apply_body_font(title)
	col.add_child(title)

	if not hint.is_empty():
		var sub := Label.new()
		sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
		sub.text = hint
		sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		sub.custom_minimum_size.x = 180.0
		sub.add_theme_font_size_override("font_size", 14)
		sub.add_theme_color_override("font_color", Color(0.86, 0.78, 0.62))
		ClientUi.apply_body_font(sub)
		col.add_child(sub)

	return card
