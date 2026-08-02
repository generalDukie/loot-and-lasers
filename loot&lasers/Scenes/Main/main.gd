extends Node
## Boot router: restore session or send player to login.

func _ready() -> void:
	await get_tree().process_frame
	await _boot()


func _boot() -> void:
	var health: Dictionary = await ApiClient.health()
	if not health.ok:
		push_warning("API health check failed: %s" % health.get("error", "unknown"))
		# Still open login so the player can see the error / retry.
		GameManager.go_login()
		return

	if not AuthManager.is_logged_in():
		GameManager.go_login()
		return

	var me: Dictionary = await AuthManager.fetch_me()
	if not me.ok:
		AuthManager.clear_session()
		GameManager.go_login()
		return

	var active_id := str(AuthManager.user.get("active_character_id", ""))
	if active_id.is_empty():
		GameManager.go_character_select()
		return

	var char_res: Dictionary = await AuthManager.get_character(active_id)
	if char_res.ok and typeof(char_res.data) == TYPE_DICTIONARY:
		GameManager.active_character = char_res.data
		if not str(char_res.data.get("active_mission_id", "")).is_empty():
			await MissionManager.fetch_active_mission()
			GameManager.go_mission_run()
		else:
			GameManager.go_hub(char_res.data)
	else:
		GameManager.go_character_select()
