extends Node
## Headless client-state test; no backend mutations.


func _ready() -> void:
	call_deferred("_run")


func _run() -> void:
	CurrencyManager.clear_local()
	GameManager.clear_active_character("test_start")

	var account_a := {
		"id": "char-a",
		"fuel": 20,
		"stardust": 100,
		"nova_crystals": 5,
	}
	GameManager.apply_active_character(account_a, "test_account_a")
	_check(CurrencyManager.has_wallet(), "account A wallet hydrates")
	_check(CurrencyManager.get_balance(CurrencyManager.CURRENCY_FUEL) == 20, "Fuel hydrates")
	_check(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST) == 100, "Stardust hydrates")
	_check(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA) == 5, "Nova hydrates")

	var newer := {
		"character_id": "char-a",
		"balances": {"fuel": 19.75, "stardust": 125, "nova_crystals": 4},
		"transaction_id": "wallet-test-newer",
		"revision": 5,
	}
	_check(CurrencyManager.apply_authoritative_wallet(newer, "test"), "new wallet applies")
	_check(is_equal_approx(CurrencyManager.get_balance(CurrencyManager.CURRENCY_FUEL), 19.75), "fractional Fuel is preserved")
	_check(CurrencyManager.format_balance(CurrencyManager.CURRENCY_FUEL) == "19.75", "fractional Fuel formats like web")
	_check(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST) == 125, "new Stardust applies")

	var older := {
		"character_id": "char-a",
		"balances": {"fuel": 20, "stardust": 1, "nova_crystals": 5},
		"transaction_id": "wallet-test-older",
		"revision": 4,
	}
	_check(not CurrencyManager.apply_authoritative_wallet(older, "test"), "older revision rejected")
	_check(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST) == 125, "older response cannot overwrite")

	var after_skip := {
		"character_id": "char-a",
		"balances": {"fuel": 19.75, "stardust": 125, "nova_crystals": 98073.5},
		"transaction_id": "wallet-test-half-nova",
		"revision": 6,
	}
	_check(CurrencyManager.apply_authoritative_wallet(after_skip, "test"), "half-unit Nova wallet applies")
	_check(
		is_equal_approx(float(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA)), 98073.5),
		"Nova keeps leftover half after a 1.5 spend"
	)
	_check(
		CurrencyManager.format_balance(CurrencyManager.CURRENCY_NOVA) == "98,073.5",
		"Nova wallet shows the exact half-unit amount"
	)
	_check(NumberDisplay.nova(98075) == "98,075", "whole Nova does not append .0")
	_check(NumberDisplay.nova(1.5) == "1.5", "skip cost 1.5 formats as 1.5")

	GameManager.clear_active_character("test_logout")
	_check(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST) == 0, "logout clears wallet")
	var account_b := {
		"id": "char-b",
		"fuel": 7,
		"stardust": 3,
		"nova_crystals": 1,
	}
	GameManager.apply_active_character(account_b, "test_account_b")
	_check(str(CurrencyManager.wallet.get("character_id", "")) == "char-b", "account B identity replaces A")
	_check(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST) == 3, "account B does not inherit A")

	print("WALLET_CLIENT_TEST_OK")
	get_tree().quit(0)


func _check(condition: bool, message: String) -> void:
	if condition:
		return
	push_error("WALLET_CLIENT_TEST_FAILED: %s" % message)
	get_tree().quit(1)
