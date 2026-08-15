extends Node
## Headless GameApiClient contract tests (Pipeline 2).
## Covers envelope normalization, timeout/disconnect codes, safe-read retry,
## mutation non-retry, and authoritative response application.
##
## Optional env (set by verify_godot_api_client_contract.mjs):
##   LOOT_API_CLIENT_TEST_BASE — flaky Node stub base URL

var _failed := false


func _ready() -> void:
	call_deferred("_run")


func _run() -> void:
	_test_error_code_defaults()
	if _failed:
		return
	_test_retry_eligibility()
	if _failed:
		return
	_test_envelope_normalization()
	if _failed:
		return
	await _test_timeout_and_disconnect()
	if _failed:
		return
	await _test_safe_read_retries_against_stub()
	if _failed:
		return
	await _test_mutation_is_not_retried_against_stub()
	if _failed:
		return
	# Character changes normally wake managers such as TutorialManager, which may
	# start authenticated production requests. Keep this contract test isolated
	# from saved user sessions while it exercises the authoritative cache helpers.
	var game_signals_were_blocked := GameManager.is_blocking_signals()
	GameManager.set_block_signals(true)
	_test_authoritative_response_application()
	if _failed:
		GameManager.set_block_signals(game_signals_were_blocked)
		return
	_test_logout_clears_loading_state()
	GameManager.set_block_signals(game_signals_were_blocked)
	if _failed:
		return

	print("API_CLIENT_CONTRACT_TEST_OK")
	get_tree().quit(0)


func _test_error_code_defaults() -> void:
	_check(GameApiClient.default_error_code(401) == GameApiClient.CODE_UNAUTHORIZED, "401 -> UNAUTHORIZED")
	_check(GameApiClient.default_error_code(403) == GameApiClient.CODE_FORBIDDEN, "403 -> FORBIDDEN")
	_check(GameApiClient.default_error_code(404) == GameApiClient.CODE_NOT_FOUND, "404 -> NOT_FOUND")
	_check(GameApiClient.default_error_code(409) == GameApiClient.CODE_CONFLICT, "409 -> CONFLICT")
	_check(GameApiClient.default_error_code(422) == GameApiClient.CODE_VALIDATION_ERROR, "422 -> VALIDATION_ERROR")
	_check(GameApiClient.default_error_code(500) == GameApiClient.CODE_INTERNAL_ERROR, "500 -> INTERNAL_ERROR")


func _test_retry_eligibility() -> void:
	_check(GameApiClient.is_safe_read_method("GET"), "GET is safe read")
	_check(GameApiClient.is_safe_read_method("HEAD"), "HEAD is safe read")
	_check(not GameApiClient.is_safe_read_method("POST"), "POST is not safe read")
	_check(GameApiClient.is_retry_eligible("GET", false), "GET retry eligible")
	_check(not GameApiClient.is_retry_eligible("POST", false), "unkeyed POST not retry eligible")
	_check(GameApiClient.is_retry_eligible("POST", true), "idempotent POST retry eligible")


func _test_envelope_normalization() -> void:
	var ok_env: Dictionary = GameApiClient._normalize_http_envelope(200, {
		"success": true,
		"character": {"id": "c1"},
	})
	_check(bool(ok_env.get("ok", false)), "200 envelope ok")
	_check(str(ok_env.get("error", "")) == "", "200 envelope empty error")

	var conflict: Dictionary = GameApiClient._normalize_http_envelope(409, {
		"success": false,
		"error": "Already claimed",
		"code": "CONFLICT",
	})
	_check(not bool(conflict.get("ok", true)), "409 envelope not ok")
	_check(str(conflict.get("code", "")) == "CONFLICT", "409 preserves server code")
	_check(str(conflict.get("error", "")) == "Already claimed", "409 preserves error text")

	var bare: Dictionary = GameApiClient._normalize_http_envelope(422, {"error": "bad payload"})
	_check(str(bare.get("code", "")) == GameApiClient.CODE_VALIDATION_ERROR, "422 defaults VALIDATION_ERROR")

	var forbidden: Dictionary = GameApiClient._normalize_http_envelope(403, {})
	_check(str(forbidden.get("code", "")) == GameApiClient.CODE_FORBIDDEN, "403 defaults FORBIDDEN")
	_check(str(forbidden.get("error", "")).begins_with("HTTP"), "403 synthesizes HTTP error text")

	var gateway: Dictionary = GameApiClient._normalize_http_envelope(503, {"error": "busy"})
	_check(bool(gateway.get("retryable", false)), "503 marked retryable")


func _test_timeout_and_disconnect() -> void:
	var previous: String = GameApiClient.base_url
	# Closed local port — connection failure (retryable NETWORK_ERROR).
	GameApiClient.base_url = "http://127.0.0.1:1"
	var disconnected: Dictionary = await GameApiClient.request(
		"GET", "/health", null, false, 0.4, false, false, 0
	)
	_check(not bool(disconnected.get("ok", true)), "closed port fails")
	_check(
		str(disconnected.get("code", "")) == GameApiClient.CODE_NETWORK_ERROR \
			or str(disconnected.get("code", "")) == GameApiClient.CODE_TIMEOUT,
		"closed port uses NETWORK_ERROR or TIMEOUT"
	)
	_check(bool(disconnected.get("retryable", false)), "closed port is retryable")

	# Non-routable blackhole with short timeout — TIMEOUT when the OS does not fail fast.
	GameApiClient.base_url = "http://172.16.0.1:9"
	var timed: Dictionary = await GameApiClient.request(
		"GET", "/health", null, false, 0.35, false, false, 0
	)
	_check(not bool(timed.get("ok", true)), "unreachable host fails")
	_check(
		str(timed.get("code", "")) == GameApiClient.CODE_TIMEOUT \
			or str(timed.get("code", "")) == GameApiClient.CODE_NETWORK_ERROR,
		"unreachable host uses TIMEOUT or NETWORK_ERROR"
	)

	GameApiClient.base_url = previous


func _stub_base() -> String:
	var from_env := OS.get_environment("LOOT_API_CLIENT_TEST_BASE").strip_edges().rstrip("/")
	return from_env


func _test_safe_read_retries_against_stub() -> void:
	var stub := _stub_base()
	if stub.is_empty():
		print("SKIP safe-read retry stub (LOOT_API_CLIENT_TEST_BASE unset)")
		return
	var previous: String = GameApiClient.base_url
	GameApiClient.base_url = stub
	var res: Dictionary = await GameApiClient.request(
		"GET", "/flaky-read", null, false, 2.0, false, false, 1
	)
	GameApiClient.base_url = previous
	_check(bool(res.get("ok", false)), "safe GET eventually succeeds after 503")
	_check(int(res.get("attempts", 0)) >= 2, "safe GET recorded a retry attempt")


func _test_mutation_is_not_retried_against_stub() -> void:
	var stub := _stub_base()
	if stub.is_empty():
		print("SKIP mutation non-retry stub (LOOT_API_CLIENT_TEST_BASE unset)")
		return
	var previous: String = GameApiClient.base_url
	GameApiClient.base_url = stub
	var res: Dictionary = await GameApiClient.request(
		"POST",
		"/api/functions/BuyFuel",
		{"amount": 1},
		false,
		2.0,
		false,
		false,
		-1
	)
	_check(not bool(res.get("ok", true)), "unkeyed mutation fails on 503")
	_check(int(res.get("attempts", 0)) == 1, "unkeyed mutation attempts == 1")
	_check(
		str(res.get("code", "")) == GameApiClient.CODE_INTERNAL_ERROR \
			or str(res.get("code", "")) == "INTERNAL_ERROR",
		"503 mutation code preserved/defaulted"
	)

	var counts: Dictionary = await GameApiClient.request(
		"GET", "/counts", null, false, 2.0, false, false, 0
	)
	GameApiClient.base_url = previous
	_check(bool(counts.get("ok", false)), "counts endpoint ok")
	var data: Variant = counts.get("data", {})
	if typeof(data) == TYPE_DICTIONARY:
		_check(int((data as Dictionary).get("mutations", 0)) == 1, "unkeyed mutation hit stub once")
		_check(int((data as Dictionary).get("reads", 0)) >= 2, "safe read hit stub at least twice")
	else:
		_check(false, "counts payload is a dictionary")


func _test_authoritative_response_application() -> void:
	GameManager.clear_active_character("api_client_contract_test")
	var applied: Dictionary = GameApiClient.apply_authoritative_response({
		"character": {
			"id": "char-contract",
			"fuel": 11,
			"stardust": 22,
			"nova_crystals": 3,
		},
		"wallet": {
			"character_id": "char-contract",
			"balances": {"fuel": 11, "stardust": 22, "nova_crystals": 3},
			"transaction_id": "wallet-contract-1",
			"revision": 1,
		},
	}, "api_client_contract_test")
	_check(bool(applied.get("character_applied", false)), "character applied via helper")
	_check(str(GameManager.active_character.get("id", "")) == "char-contract", "GameManager owns character")
	_check(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST) == 22, "CurrencyManager owns wallet")

	var patched: Dictionary = GameApiClient.apply_authoritative_response({
		"patch": {"stardust": 30},
	}, "api_client_contract_test")
	_check(bool(patched.get("patch_applied", false)), "patch applied via helper")
	_check(int(GameManager.active_character.get("stardust", 0)) == 30, "patch merges into GameManager")

	# Bare economy balances (SkipArenaCooldown shape) must still update the wallet.
	# Simulate scaled Character storage + display balances (live spend path).
	GameManager.apply_active_character({
		"id": "char-contract",
		"fuel": 9,
		"stardust": 30,
		"nova_crystals": 20, # half-units → 10.0 display
		"economy_nova_scale": 2,
	}, "api_client_contract_scale_setup")
	var bare: Dictionary = GameApiClient.apply_authoritative_response({
		"character": {
			"id": "char-contract",
			"fuel": 9,
			"stardust": 30,
			"nova_crystals": 20,
			"economy_nova_scale": 2,
		},
		"balances": {"fuel": 9, "stardust": 30, "nova_crystals": 9.5},
	}, "api_client_contract_bare_balances")
	_check(bool(bare.get("character_applied", false)), "bare balances path applies character")
	_check(bool(bare.get("wallet_applied", false)), "bare balances update wallet")
	_check(
		is_equal_approx(float(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA)), 9.5),
		"display balances do not get halved again under economy_nova_scale=2"
	)
	_check(
		int(GameManager.active_character.get("nova_crystals", 0)) == 19,
		"active character keeps half-unit storage after display wallet apply"
	)

	GameManager.clear_active_character("api_client_contract_cleanup")
	_check(GameManager.active_character.is_empty(), "cleanup clears character")
	_check(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST) == 0, "cleanup clears wallet")


func _test_logout_clears_loading_state() -> void:
	GameManager.apply_active_character({
		"id": "char-logout",
		"fuel": 1,
		"stardust": 1,
		"nova_crystals": 1,
	}, "api_client_contract_logout_setup")
	GameManager.clear_active_character("api_client_contract_logout")
	_check(GameManager.active_character.is_empty(), "logout clears character cache")
	_check(
		not CurrencyManager.has_wallet() \
			or CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST) == 0,
		"logout releases wallet state"
	)


func _check(condition: bool, message: String) -> void:
	if condition:
		return
	_failed = true
	push_error("API_CLIENT_CONTRACT_TEST_FAILED: %s" % message)
	get_tree().quit(1)
