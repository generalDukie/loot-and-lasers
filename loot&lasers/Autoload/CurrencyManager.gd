extends Node
## Phase 5 — Wallet / currency UI state (Nakama-backed).
## Live Character.stardust / nova_crystals remain untouched this phase.
## UI scripts must not call wallet RPCs directly.

signal wallet_changed(wallet: Dictionary)
signal wallet_error(error: String)
signal loading_changed(loading: bool)

const RPC_GET := "wallet_get"
const RPC_CREDIT := "wallet_credit"
const RPC_DEBIT := "wallet_debit"

## Existing project currency ids (soft / premium).
const CURRENCY_STARDUST := "stardust"
const CURRENCY_NOVA := "nova_crystals"

var wallet: Dictionary = {}
var loading := false

var _load_busy := false
var _mutate_busy := false


func _ready() -> void:
	print("[CurrencyManager] ready")


func has_wallet() -> bool:
	return typeof(wallet.get("balances", null)) == TYPE_DICTIONARY


func clear_local() -> void:
	wallet = {}


func get_balance(currency_id: String) -> int:
	var balances: Variant = wallet.get("balances", {})
	if typeof(balances) != TYPE_DICTIONARY:
		return 0
	return int((balances as Dictionary).get(currency_id, 0))


## Load-or-create zero wallet on Nakama (idempotent).
func ensure_wallet() -> Dictionary:
	return await load_wallet()


func load_wallet() -> Dictionary:
	if _load_busy:
		return _fail("Wallet load already in progress")
	_load_busy = true
	_set_loading(true)
	var res: Dictionary = await NakamaManager.invoke_rpc(RPC_GET, {})
	_load_busy = false
	_set_loading(false)
	return _apply_result(res, true)


## Soft-currency credit helper (nova_crystals credit is rejected server-side).
func credit(currency_id: String, amount: int, transaction_id: String, reason: String, source: String = "client") -> Dictionary:
	return await _mutate(RPC_CREDIT, currency_id, amount, transaction_id, reason, source)


func debit(currency_id: String, amount: int, transaction_id: String, reason: String, source: String = "client") -> Dictionary:
	return await _mutate(RPC_DEBIT, currency_id, amount, transaction_id, reason, source)


func _mutate(
	rpc_id: String,
	currency_id: String,
	amount: int,
	transaction_id: String,
	reason: String,
	source: String
) -> Dictionary:
	if _mutate_busy:
		return _fail("Wallet operation already in progress")
	if currency_id.strip_edges().is_empty():
		return _fail("currency_id is required")
	if amount <= 0:
		return _fail("amount must be positive")
	if transaction_id.strip_edges().is_empty():
		return _fail("transaction_id is required")
	if reason.strip_edges().is_empty():
		return _fail("reason is required")

	_mutate_busy = true
	_set_loading(true)
	var res: Dictionary = await NakamaManager.invoke_rpc(rpc_id, {
		"currency_id": currency_id,
		"amount": amount,
		"transaction_id": transaction_id,
		"reason": reason,
		"source": source,
	})
	_mutate_busy = false
	_set_loading(false)

	if not bool(res.get("success", false)):
		var err := str(res.get("error", "Wallet request failed"))
		wallet_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status_code", 0)),
		}

	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		return _fail("Malformed wallet mutation response")

	var w: Variant = (data as Dictionary).get("wallet", {})
	if typeof(w) == TYPE_DICTIONARY:
		wallet = (w as Dictionary).duplicate(true)
		wallet_changed.emit(wallet)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": data,
		"status_code": int(res.get("status_code", 200)),
	}


func _apply_result(res: Dictionary, emit_ok: bool) -> Dictionary:
	if typeof(res) != TYPE_DICTIONARY:
		var bad := _fail("Malformed wallet response")
		wallet_error.emit(str(bad.error))
		return bad
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "Wallet request failed"))
		wallet_error.emit(err)
		return {
			"ok": false,
			"success": false,
			"error": err,
			"data": {},
			"status_code": int(res.get("status_code", 0)),
		}
	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		var malformed := _fail("Malformed wallet data")
		wallet_error.emit(str(malformed.error))
		return malformed
	wallet = (data as Dictionary).duplicate(true)
	if emit_ok:
		wallet_changed.emit(wallet)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": wallet,
		"status_code": int(res.get("status_code", 200)),
	}


func _set_loading(value: bool) -> void:
	if loading == value:
		return
	loading = value
	loading_changed.emit(loading)


func _fail(error: String, status_code: int = 0) -> Dictionary:
	return {
		"ok": false,
		"success": false,
		"error": error,
		"data": {},
		"status_code": status_code,
	}
