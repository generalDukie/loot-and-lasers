extends Control
## Boot router: splash → restore Nakama email session → login / character / hub.
## Godot authentication uses Nakama :7350 only (never Node :8787).

var _status: Label


func _ready() -> void:
	_build_splash()
	DevEnvironmentBadge.attach_to(self)
	# Let the splash paint one frame before any network work.
	await get_tree().process_frame
	await _boot()


func _build_splash() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	var bg := ColorRect.new()
	bg.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	bg.color = Color(0.03, 0.05, 0.09, 1.0)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 10)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(col)

	var brand := ClientUi.make_brand_mark(36)
	brand.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(brand)

	_status = Label.new()
	_status.text = "Starting..."
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.add_theme_font_size_override("font_size", 16)
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_status)
	_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(_status)

	modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 1.0, 0.12).set_ease(Tween.EASE_OUT)


func _set_status(text: String) -> void:
	if _status:
		_status.text = text


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
		_set_status("Ready")
		GameManager.go_login()
		return

	_set_status("Restoring session...")
	var nakama_res: Dictionary = await AuthManager.ensure_nakama_session()
	if not nakama_res.get("success", false):
		_set_status("Ready")
		GameManager.go_login()
		return

	print("[NakamaBoot] authenticated user_id=%s method=%s" % [
		str(nakama_res.get("data", {}).get("user_id", "")),
		str(nakama_res.get("data", {}).get("auth_method", "")),
	])

	if not AuthManager.has_node_gameplay_session():
		print("[NakamaBoot] Node gameplay bridge missing — opening login to re-link")
		_set_status("Ready")
		GameManager.go_login()
		return

	_set_status("Loading profile...")
	var me: Dictionary = await AuthManager.fetch_me()
	if not me.ok:
		await AuthManager.logout()
		GameManager.go_login()
		return

	var active_id := str(AuthManager.user.get("active_character_id", ""))
	if active_id.is_empty():
		GameManager.go_character_select()
		return

	_set_status("Loading operative...")
	var char_res: Dictionary = await AuthManager.get_character(active_id)
	if char_res.ok and typeof(char_res.data) == TYPE_DICTIONARY:
		GameManager.active_character = char_res.data
		await MissionManager.fetch_active_mission()
		if MissionManager.has_active_mission():
			GameManager.go_mission_run()
		else:
			GameManager.go_hub(char_res.data)
	else:
		# Nakama auth OK; Node character load optional.
		GameManager.go_character_select()
