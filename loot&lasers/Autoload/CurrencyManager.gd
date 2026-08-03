extends Node
## Phase 5 — Wallet / currency UI state (Nakama-backed, read-only from the client).
## Live Character.stardust / nova_crystals remain untouched this phase.
## UI scripts must not call wallet RPCs directly.
## Balance mutations are server-internal only (credit_currency / debit_currency in wallet.lua).
## Public client RPC: wallet_get only.

signal wallet_changed(wallet: Dictionary)
signal wallet_error(error: String)
signal loading_changed(loading: bool)

const RPC_GET := "wallet_get"

## Existing project currency ids (soft / premium).
const CURRENCY_STARDUST := "stardust"
const CURRENCY_NOVA := "nova_crystals"

var wallet: Dictionary = {}
var loading := false

var _load_busy := false


func _ready() -> void:
	print("[CurrencyManager] ready (read-only wallet_get)")


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
