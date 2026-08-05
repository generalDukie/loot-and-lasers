extends Node
## Normalized client wallet for the dual-stack migration.
## Compatibility authority: Node Character balances (per selected character).
## UI is read-only and must never mutate balances directly.
## Nakama's account wallet remains available to migrated server modules, but is not
## merged with Character balances because the two ledgers have different scopes.

signal wallet_changed(wallet: Dictionary)
signal balances_changed(balances: Dictionary, changed_currency_ids: Array, source: String)
signal balance_changed(currency_id: String, balance: float, source: String)
signal wallet_error(error: String)
signal loading_changed(loading: bool)

const CURRENCY_FUEL := "fuel"
const CURRENCY_STARDUST := "stardust"
const CURRENCY_NOVA := "nova_crystals"
const CURRENCY_IDS := [CURRENCY_FUEL, CURRENCY_STARDUST, CURRENCY_NOVA]
const SOURCE_CHARACTER := "node_character"
const SOURCE_REALTIME := "wallet_updated"

var wallet: Dictionary = {}
var loading := false

var _load_busy := false
var _request_sequence := 0
var _last_applied_sequence := 0
var _last_server_revision := 0
var _seen_transaction_ids: Dictionary = {}


func _ready() -> void:
	print("[CurrencyManager] ready (Node Character compatibility authority)")


func has_wallet() -> bool:
	return (
		typeof(wallet.get("balances", null)) == TYPE_DICTIONARY
		and not str(wallet.get("character_id", "")).is_empty()
	)


func clear_local() -> void:
	var old_balances := get_balances()
	wallet = {}
	_last_applied_sequence = 0
	_last_server_revision = 0
	_seen_transaction_ids = {}
	if not old_balances.is_empty():
		var cleared := _empty_balances()
		wallet_changed.emit(wallet)
		balances_changed.emit(cleared, CURRENCY_IDS.duplicate(), "clear")
		for currency_id in CURRENCY_IDS:
			balance_changed.emit(currency_id, 0, "clear")


func get_balance(currency_id: String) -> Variant:
	var balances: Variant = wallet.get("balances", {})
	if typeof(balances) != TYPE_DICTIONARY:
		return 0
	return (balances as Dictionary).get(currency_id, 0)


func get_balances() -> Dictionary:
	var balances: Variant = wallet.get("balances", {})
	return (balances as Dictionary).duplicate(true) if typeof(balances) == TYPE_DICTIONARY else {}


## Extra wallet fields (e.g. nova_wagerable / nova_promotional display amounts).
func get_meta_balance(key: String, default_value: Variant = 0.0) -> Variant:
	return wallet.get(key, default_value)


func nova_wagerable() -> float:
	return float(wallet.get("nova_wagerable", 0.0))


func nova_promotional() -> float:
	return float(wallet.get("nova_promotional", 0.0))


func can_afford(currency_id: String, amount: float) -> bool:
	return amount >= 0.0 and float(get_balance(currency_id)) + 0.0000001 >= amount


func format_balance(currency_id: String) -> String:
	var value: float = float(get_balance(currency_id))
	if currency_id == CURRENCY_FUEL:
		var rounded := snappedf(float(value), 0.01)
		return str(int(rounded)) if is_equal_approx(rounded, float(int(rounded))) else "%.2f" % rounded
	if currency_id == CURRENCY_NOVA:
		var half := snappedf(value, 0.5)
		if is_equal_approx(half, float(int(half))):
			return str(int(half))
		return "%.1f" % half
	return str(int(value))


func next_request_sequence() -> int:
	_request_sequence += 1
	return _request_sequence


## Hydrate immediately from the already-authoritative selected Character, then
## reconcile once from Node when a character exists.
func ensure_wallet() -> Dictionary:
	if not GameManager.active_character.is_empty():
		apply_character_snapshot(GameManager.active_character, "character_selected")
		return await reconcile_wallet()
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": wallet,
		"status_code": 200,
		"empty": true,
	}


## Backward-compatible alias used by existing managers. This no longer calls
## Nakama wallet_get because UI balances are Character-scoped during migration.
func load_wallet() -> Dictionary:
	return await reconcile_wallet()


func reconcile_wallet() -> Dictionary:
	if _load_busy:
		return {
			"ok": true,
			"success": true,
			"error": "",
			"data": wallet,
			"status_code": 200,
			"coalesced": true,
		}
	var character_id := str(GameManager.active_character.get("id", "")).strip_edges()
	if character_id.is_empty():
		return _fail("No selected character to reconcile")
	var sequence := next_request_sequence()
	_load_busy = true
	_set_loading(true)
	var res: Dictionary = await AuthManager.get_character(character_id)
	_load_busy = false
	_set_loading(false)
	if not bool(res.get("ok", false)):
		var error := str(res.get("error", "Wallet reconciliation failed"))
		wallet_error.emit(error)
		return _fail(error, int(res.get("status", 0)))
	var character: Variant = res.get("data", {})
	if typeof(character) != TYPE_DICTIONARY:
		var malformed := _fail("Malformed Character wallet response")
		wallet_error.emit(str(malformed.error))
		return malformed
	if str((character as Dictionary).get("id", "")) != character_id:
		return _fail("Stale wallet response for another character")
	if not apply_character_snapshot(character, "reconcile", sequence):
		return _fail("Ignored stale wallet response")
	GameManager.apply_active_character(character, "wallet_reconcile", false)
	return {
		"ok": true,
		"success": true,
		"error": "",
		"data": wallet,
		"status_code": int(res.get("status", 200)),
	}


## Apply a full Character snapshot returned by an authoritative Node action.
## Returns false when stale ordering or a replayed transaction was rejected.
func apply_character_snapshot(
		character: Dictionary,
		source: String = SOURCE_CHARACTER,
		request_sequence: int = 0,
		transaction_id: String = ""
	) -> bool:
	var character_id := str(character.get("id", "")).strip_edges()
	if character_id.is_empty():
		return false
	if request_sequence > 0 and request_sequence < _last_applied_sequence:
		return false
	if not transaction_id.is_empty() and _seen_transaction_ids.has(transaction_id):
		return false

	var previous_character_id := str(wallet.get("character_id", ""))
	var old_balances := get_balances()
	if previous_character_id != character_id:
		old_balances = {}
		_seen_transaction_ids = {}
		_last_server_revision = 0

	var balances := _empty_balances()
	for currency_id in CURRENCY_IDS:
		if currency_id == CURRENCY_NOVA:
			balances[currency_id] = _normalize_balance(
				currency_id, _nova_display_from_character(character)
			)
		else:
			balances[currency_id] = _normalize_balance(currency_id, character.get(currency_id, 0))

	if request_sequence <= 0:
		request_sequence = next_request_sequence()
	_last_applied_sequence = maxi(_last_applied_sequence, request_sequence)
	var character_revision := int(character.get("wallet_revision", 0))
	if character_revision > _last_server_revision:
		_last_server_revision = character_revision
	if not transaction_id.is_empty():
		_seen_transaction_ids[transaction_id] = true
		if _seen_transaction_ids.size() > 128:
			_seen_transaction_ids.erase(_seen_transaction_ids.keys()[0])

	var changed: Array = []
	for currency_id in CURRENCY_IDS:
		var value_changed := not old_balances.has(currency_id)
		if not value_changed and (currency_id == CURRENCY_FUEL or currency_id == CURRENCY_NOVA):
			value_changed = not is_equal_approx(
				float(old_balances.get(currency_id, 0)),
				float(balances[currency_id])
			)
		elif not value_changed:
			value_changed = int(old_balances.get(currency_id, 0)) != int(balances[currency_id])
		if value_changed:
			changed.append(currency_id)

	var nova_w := _read_nova_split(character, "nova_wagerable", "nova_wagerable_half")
	var nova_p := _read_nova_split(character, "nova_promotional", "nova_promotional_half")
	wallet = {
		"wallet_version": 2,
		"balances": balances,
		"character_id": character_id,
		"source": source,
		"updated_at": int(Time.get_unix_time_from_system() * 1000.0),
		"last_transaction_id": transaction_id,
		"revision": _last_applied_sequence,
		"server_revision": _last_server_revision,
		"nova_wagerable": nova_w,
		"nova_promotional": nova_p,
	}
	wallet_changed.emit(wallet)
	if not changed.is_empty():
		balances_changed.emit(balances.duplicate(true), changed, source)
		for currency_id in changed:
			balance_changed.emit(currency_id, float(balances[currency_id]), source)
	return true


func apply_character_patch(
		patch: Dictionary,
		source: String = SOURCE_CHARACTER,
		request_sequence: int = 0,
		transaction_id: String = ""
	) -> bool:
	if GameManager.active_character.is_empty():
		return false
	var merged := GameManager.active_character.duplicate(true)
	merged.merge(patch, true)
	return apply_character_snapshot(merged, source, request_sequence, transaction_id)


## Accept a safe realtime event. Events for another selected character or
## without complete authoritative balances trigger reconciliation instead.
func apply_realtime_wallet(payload: Dictionary) -> bool:
	return apply_authoritative_wallet(payload, SOURCE_REALTIME)


## Apply a complete normalized wallet returned by a trusted Node action or the
## trusted Nakama→Node bridge. Partial balance payloads are rejected.
func apply_authoritative_wallet(payload: Dictionary, source: String = SOURCE_CHARACTER) -> bool:
	var character_id := str(payload.get("character_id", "")).strip_edges()
	var selected_id := str(GameManager.active_character.get("id", "")).strip_edges()
	if character_id.is_empty() or character_id != selected_id:
		return false
	var balances: Variant = payload.get("balances", null)
	if typeof(balances) != TYPE_DICTIONARY:
		return false
	var character := GameManager.active_character.duplicate(true)
	var bal := balances as Dictionary
	for currency_id in CURRENCY_IDS:
		if not bal.has(currency_id):
			return false
		character[currency_id] = _normalize_balance(
			currency_id,
			bal.get(currency_id, 0)
		)
	# Authoritative display balances already (getBalances) — prefer split fields.
	if bal.has("nova_wagerable"):
		character["nova_wagerable"] = float(bal.get("nova_wagerable", 0))
	if bal.has("nova_promotional"):
		character["nova_promotional"] = float(bal.get("nova_promotional", 0))
	var transaction_id := str(payload.get("transaction_id", ""))
	var server_revision := int(payload.get("revision", 0))
	if server_revision > 0 and server_revision < _last_server_revision:
		return false
	var applied := apply_character_snapshot(character, source, 0, transaction_id)
	if applied:
		if server_revision > _last_server_revision:
			_last_server_revision = server_revision
			wallet["server_revision"] = _last_server_revision
		for currency_id in CURRENCY_IDS:
			GameManager.active_character[currency_id] = character[currency_id]
	return applied


func _read_nova_split(character: Dictionary, display_key: String, half_key: String) -> float:
	if character.has(display_key):
		return maxf(0.0, snappedf(float(character.get(display_key, 0)), 0.5))
	if character.has(half_key):
		return maxf(0.0, snappedf(float(character.get(half_key, 0)) / 2.0, 0.5))
	# Prefer previous wallet value over treating total as wagerable.
	return float(wallet.get(display_key, 0.0))


func _empty_balances() -> Dictionary:
	return {
		CURRENCY_FUEL: 0,
		CURRENCY_STARDUST: 0,
		CURRENCY_NOVA: 0,
	}


func _normalize_balance(currency_id: String, value: Variant) -> Variant:
	if currency_id == CURRENCY_FUEL:
		return maxf(0.0, snappedf(float(value), 0.01))
	if currency_id == CURRENCY_NOVA:
		# Display Nova may be .0 or .5 (server half-units serialized as display).
		return maxf(0.0, snappedf(float(value), 0.5))
	return maxi(0, int(value))


## Convert Character.nova_crystals half-units → display when economy_nova_scale == 2.
func _nova_display_from_character(character: Dictionary) -> float:
	var raw := float(character.get(CURRENCY_NOVA, 0))
	if int(character.get("economy_nova_scale", 1)) == 2:
		return raw / 2.0
	# Prefer explicit display field from economy responses.
	if character.has("nova_display"):
		return float(character.get("nova_display", 0))
	return raw


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
