extends Node
## Headless local integration: Nakama auth → Node account → Character → logout.


func _ready() -> void:
	call_deferred("_run")


func _run() -> void:
	var stamp := str(Time.get_unix_time_from_system()).replace(".", "")
	var email := "godot-foundation-%s@example.com" % stamp
	var password := "FoundationPass%sX" % stamp

	var auth: Dictionary = await AuthManager.register(email, password)
	if not _check(auth.get("ok", false), "Nakama register and Node exchange"):
		return
	if not _check(not AuthManager.access_token.is_empty(), "gameplay JWT cached"):
		return
	if not _check(
		AuthManager.node_token_nakama_user_id == str(NakamaManager.session.user_id),
		"gameplay JWT bound to current Nakama user"
	):
		return
	if not _check(
		AuthManager.node_token_expires_at > Time.get_unix_time_from_system(),
		"gameplay JWT expiry cached"
	):
		return

	var request_id := "char-%s" % Crypto.new().generate_random_bytes(16).hex_encode()
	var payload := {
		"name": "Foundation",
		"race": "Zyrathi",
		"class": "Vanguard",
		"nova_crystals": 999999,
	}
	var created: Dictionary = await AuthManager.create_character(payload, request_id)
	if not _check(created.get("ok", false), "Character creation"):
		return
	var character: Dictionary = created.get("data", {})
	var character_id := str(character.get("id", ""))
	if not _check(not character_id.is_empty(), "Character id returned"):
		return
	if not _check(int(character.get("nova_crystals", -1)) == 1000, "starter Nova 500 display (1000 half-units)"):
		return
	if not _check(int(character.get("stardust", -1)) == 0, "starter Stardust is 0"):
		return

	var replay: Dictionary = await AuthManager.create_character(payload, request_id)
	if not _check(
		replay.get("ok", false) and str(replay.get("data", {}).get("id", "")) == character_id,
		"Character creation replay is exact-once"
	):
		return

	var selected: Dictionary = await AuthManager.select_character(character_id)
	if not _check(selected.get("ok", false), "Node selected Character update"):
		return
	var loaded: Dictionary = await AuthManager.get_selected_character()
	if not _check(
		loaded.get("ok", false) and str(loaded.get("data", {}).get("id", "")) == character_id,
		"authoritative selected Character load"
	):
		return

	await AuthManager.logout()
	if not _check(AuthManager.access_token.is_empty(), "logout clears gameplay JWT"):
		return
	if not _check(not NakamaManager.is_authenticated(), "logout clears Nakama session"):
		return
	if not _check(GameManager.active_character.is_empty(), "logout clears Character cache"):
		return
	if not _check(CurrencyManager.wallet.is_empty(), "logout clears wallet cache"):
		return

	print("AUTH_FOUNDATION_GODOT_TEST_OK")
	get_tree().quit(0)


func _check(condition: bool, message: String) -> bool:
	if condition:
		return true
	push_error("AUTH_FOUNDATION_GODOT_TEST_FAILED: %s" % message)
	get_tree().quit(1)
	return false
