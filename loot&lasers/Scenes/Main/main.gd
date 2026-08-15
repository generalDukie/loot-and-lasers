extends Control
## Boot router: splash → restore session → login or character select (never skip to hub).
## Godot authentication uses Nakama :7350 only (never Node :8787).

const LOGO_WIDTH_FRAC := 0.75
const STATUS_GAP_PX := 16.0
const STATUS_FONT_PX := 23
const MIN_SPLASH_SEC := 5.0
const SPLASH_FADE_IN_SEC := 0.18
const MILLISECONDS_PER_SECOND := 1_000.0

var _status: Label
var _brand: BrandGradientTitle
var _brand_host: CenterContainer
var _splash_started_ms := 0


func _ready() -> void:
	_build_splash()
	_splash_started_ms = Time.get_ticks_msec()
	DevEnvironmentBadge.attach_to(self)
	# Let the splash paint one frame before any network work.
	await get_tree().process_frame
	_layout_splash()
	await _boot()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		_layout_splash()


func _build_splash() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	var bg := ClientUi.make_space_splash_bg("void")
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	# Logo alone in a full-rect CenterContainer so it sits dead-center.
	_brand_host = CenterContainer.new()
	_brand_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_brand_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_brand_host)

	_brand = BrandGradientTitle.make("LOOT & LASERS", 96, true, true)
	_brand.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_brand.enable_wordmark_fx()
	_brand_host.add_child(_brand)

	_status = Label.new()
	_status.text = "Starting..."
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.add_theme_font_size_override("font_size", STATUS_FONT_PX)
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_status)
	_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_status)

	modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 1.0, SPLASH_FADE_IN_SEC).set_ease(Tween.EASE_OUT)


func _layout_splash() -> void:
	if not is_instance_valid(_brand) or not is_instance_valid(_status):
		return
	var vw := size.x
	if vw < 8.0:
		return
	_brand.fit_to_width(vw * LOGO_WIDTH_FRAC)
	# Status sits just under the centered logo (not part of the centering stack).
	_status.reset_size()
	var brand_h := _brand.custom_minimum_size.y
	var status_w := _status.get_minimum_size().x
	var status_h := _status.get_minimum_size().y
	_status.size = Vector2(maxi(status_w, 1), maxi(status_h, 1))
	_status.position = Vector2(
		(vw - _status.size.x) * 0.5,
		size.y * 0.5 + brand_h * 0.5 + STATUS_GAP_PX
	)


func _set_status(text: String) -> void:
	if _status:
		_status.text = text
		call_deferred("_layout_splash")


func _hold_splash() -> void:
	var elapsed := (
		float(Time.get_ticks_msec() - _splash_started_ms) / MILLISECONDS_PER_SECOND
	)
	var remain := MIN_SPLASH_SEC - elapsed
	if remain > 0.05:
		_set_status("Bringing you into space...")
		await get_tree().create_timer(remain).timeout


func _leave_to_login() -> void:
	await _hold_splash()
	GameManager.go_login()


func _leave_to_character_select() -> void:
	await _hold_splash()
	GameManager.go_character_select()


func _leave_to_hub(character: Dictionary) -> void:
	await _hold_splash()
	_set_status("Entering station...")
	await get_tree().process_frame
	GameManager.go_hub(character)


func _boot() -> void:
	_set_status("Starting...")

	var init_res: Dictionary = NakamaManager.initialize_client()
	var diag: Dictionary = NakamaManager.get_connection_diagnostics()
	print(
		"[NakamaBoot] env=%s host=%s:%s client=%s key=%s auth_method=%s"
		% [
			diag.get("environment", ""),
			diag.get("host", ""),
			diag.get("port", ""),
			diag.get("client_created", false),
			diag.get("server_key_fingerprint", ""),
			diag.get("auth_method", ""),
		]
	)
	if not bool(init_res.get("success", false)):
		print("[NakamaBoot] client init failed — %s" % str(init_res.get("error", "unknown")))
		await _leave_to_login()
		return

	_set_status("Restoring session...")
	var nakama_res: Dictionary = await AuthManager.ensure_nakama_session(_set_status)
	if not nakama_res.get("success", false):
		await _leave_to_login()
		return

	print("[NakamaBoot] authenticated user_id=%s method=%s" % [
		str(nakama_res.get("data", {}).get("user_id", "")),
		str(nakama_res.get("data", {}).get("auth_method", "")),
	])

	if not AuthManager.has_node_gameplay_session():
		print("[NakamaBoot] Node gameplay bridge missing — opening login to re-link")
		await _leave_to_login()
		return

	_set_status("Loading profile...")
	var me: Dictionary = await AuthManager.fetch_me()
	if not me.ok:
		await AuthManager.logout()
		await _leave_to_login()
		return

	# Always land on character select after a restored session so the player
	# confirms who deploys. active_character_id is kept so the roster pre-selects
	# the last operative; Enter still loads that character into the hub.
	await _leave_to_character_select()
