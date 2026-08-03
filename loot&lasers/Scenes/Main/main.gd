extends Control
## Boot router: splash → quick health probe → restore session or login.

var _status: Label


func _ready() -> void:
	_build_splash()
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
	col.add_theme_constant_override("separation", 14)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(col)

	var brand := ClientUi.make_brand_mark(42)
	brand.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(brand)

	_status = Label.new()
	_status.text = "Starting…"
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.add_theme_font_size_override("font_size", 18)
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_status)
	_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(_status)

	# Soft fade-in so the first frame isn't a hard cut.
	modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 1.0, 0.2).set_ease(Tween.EASE_OUT)


func _set_status(text: String) -> void:
	if _status:
		_status.text = text


func _boot() -> void:
	# TEMPORARY_NAKAMA_TEST — one-time connection path check; remove this block later.
	# Path: main → AuthManager.ensure_nakama_session → NakamaManager → Nakama server
	NakamaManager.initialize_client()
	print("[TEMPORARY_NAKAMA_TEST] Nakama client initialized")
	var nakama_res: Dictionary = await AuthManager.ensure_nakama_session()
	if nakama_res.get("success", false):
		var uid := str(nakama_res.get("data", {}).get("user_id", ""))
		print("[TEMPORARY_NAKAMA_TEST] Nakama authentication successful")
		print("[TEMPORARY_NAKAMA_TEST] User ID %s" % uid)
	else:
		print("[TEMPORARY_NAKAMA_TEST] Nakama authentication failed — %s" % str(nakama_res.get("error", "unknown")))
	# END TEMPORARY_NAKAMA_TEST

	_set_status("Connecting…")
	var health: Dictionary = await GameApiClient.health()
	if not health.ok:
		push_warning("API health check failed: %s" % health.get("error", "unknown"))
		_set_status("API offline — opening login…")
		# Still open login so the player can see the error / retry.
		GameManager.go_login()
		return

	if not AuthManager.is_logged_in():
		_set_status("Ready")
		GameManager.go_login()
		return

	_set_status("Restoring session…")
	var me: Dictionary = await AuthManager.fetch_me()
	if not me.ok:
		AuthManager.clear_session()
		GameManager.go_login()
		return

	var active_id := str(AuthManager.user.get("active_character_id", ""))
	if active_id.is_empty():
		GameManager.go_character_select()
		return

	_set_status("Loading operative…")
	var char_res: Dictionary = await AuthManager.get_character(active_id)
	if char_res.ok and typeof(char_res.data) == TYPE_DICTIONARY:
		GameManager.active_character = char_res.data
		# Phase 8: resume from Nakama mission authority (not Node active_mission_id).
		await MissionManager.fetch_active_mission()
		if MissionManager.has_active_mission():
			GameManager.go_mission_run()
		else:
			GameManager.go_hub(char_res.data)
	else:
		GameManager.go_character_select()
