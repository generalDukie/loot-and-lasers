extends Node
## Casino v2 — GetCasinoState, CasinoSettle, CasinoSessionStart/Action, Recover.
## Outcomes are always Node-authoritative. Godot never picks results.

signal state_changed(casino: Dictionary)

var casino_state: Dictionary = {}
var _pending_request_id := ""


func _ready() -> void:
	print("[CasinoManager] ready (casino_v2)")


func load_state() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetCasinoState", {})
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		casino_state = res.data.get("casino", {}) if typeof(res.data.get("casino", null)) == TYPE_DICTIONARY else {}
		GameApiClient.apply_authoritative_response(res.data, "casino_state")
		state_changed.emit(casino_state)
	return res


func stardust_min() -> int:
	var lim: Variant = casino_state.get("stardust_limits", {})
	if typeof(lim) == TYPE_DICTIONARY and lim.has("min"):
		return maxi(1, int(lim["min"]))
	var level := maxi(1, int(GameManager.active_character.get("level", 1)))
	return maxi(1, StardustEconomy.stardust_per_fuel(level))


func stardust_max() -> int:
	var lim: Variant = casino_state.get("stardust_limits", {})
	if typeof(lim) == TYPE_DICTIONARY and lim.has("max"):
		return maxi(1, int(lim["max"]))
	var level := maxi(1, int(GameManager.active_character.get("level", 1)))
	return maxi(1, StardustEconomy.stardust_per_fuel(level) * 50)


## @deprecated Prefer stardust_max()
func max_bet() -> int:
	return stardust_max()


func nova_min() -> int:
	var lim: Variant = casino_state.get("nova_limits", {})
	if typeof(lim) == TYPE_DICTIONARY and lim.has("min"):
		return maxi(1, int(lim["min"]))
	return 100


func nova_max() -> int:
	var lim: Variant = casino_state.get("nova_limits", {})
	if typeof(lim) == TYPE_DICTIONARY and lim.has("max"):
		return maxi(1, int(lim["max"]))
	return 1000


## Purchased / wagerable Nova available for Casino (display).
func nova_wagerable() -> float:
	var lim: Variant = casino_state.get("nova_limits", {})
	if typeof(lim) == TYPE_DICTIONARY:
		if lim.has("wagerable_balance"):
			return float(lim["wagerable_balance"])
		if lim.has("wagerable"):
			return float(lim["wagerable"])
	return CurrencyManager.nova_wagerable()


## Nova the local client may wager: wagerable for players; total for admins.
## Server still enforces role=admin on CasinoSessionStart.
func nova_spendable() -> float:
	if AdminManager.is_admin():
		var lim: Variant = casino_state.get("nova_limits", {})
		if typeof(lim) == TYPE_DICTIONARY and lim.has("balance"):
			return float(lim["balance"])
		return float(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA))
	return nova_wagerable()


func nova_promotional() -> float:
	var lim: Variant = casino_state.get("nova_limits", {})
	if typeof(lim) == TYPE_DICTIONARY and lim.has("promotional"):
		return float(lim["promotional"])
	return CurrencyManager.nova_promotional()


func active_session(game_id: String) -> Dictionary:
	var sessions: Variant = casino_state.get("active_sessions", [])
	if typeof(sessions) != TYPE_ARRAY:
		return {}
	for s in sessions:
		if typeof(s) == TYPE_DICTIONARY and str(s.get("game_id", "")) == game_id:
			return s
	return {}


func settle_galactic_dice(bet: int, choice: String, request_id: String = "") -> Dictionary:
	var key := request_id if not request_id.is_empty() else _begin_request("gdice")
	var res: Dictionary = await GameApiClient.invoke("CasinoSettle", {
		"game": "galactic_dice",
		"bet": bet,
		"choice": choice,
		"request_id": key,
	})
	_finish_request(res, key)
	_apply(res)
	return res


func settle_stardust_wheel(bet: int, request_id: String = "") -> Dictionary:
	var key := request_id if not request_id.is_empty() else _begin_request("wheel")
	var res: Dictionary = await GameApiClient.invoke("CasinoSettle", {
		"game": "stardust_wheel",
		"bet": bet,
		"request_id": key,
	})
	_finish_request(res, key)
	_apply(res)
	return res


func session_start(game_id: String, bet: float, request_id: String = "") -> Dictionary:
	var key := request_id if not request_id.is_empty() else _begin_request("csstart")
	var res: Dictionary = await GameApiClient.invoke("CasinoSessionStart", {
		"game": game_id,
		"bet": bet,
		"request_id": key,
	})
	_finish_request(res, key)
	_apply(res)
	return res


func session_action(session_id: String, action: String, extra: Dictionary = {}, request_id: String = "") -> Dictionary:
	var key := request_id if not request_id.is_empty() else _begin_request("csact")
	var body: Dictionary = {
		"session_id": session_id,
		"action": action,
		"request_id": key,
	}
	for k in extra.keys():
		body[k] = extra[k]
	var res: Dictionary = await GameApiClient.invoke("CasinoSessionAction", body)
	_finish_request(res, key)
	_apply(res)
	return res


func recover(request_id: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("RecoverCasinoWager", {
		"request_id": request_id,
	})
	# Definitive recover outcome clears the pending settle key.
	if bool(res.get("ok", false)) or int(res.get("status", 0)) > 0:
		if _pending_request_id == request_id:
			_pending_request_id = ""
	_apply(res)
	return res


func pending_request_id() -> String:
	return _pending_request_id


func _begin_request(prefix: String) -> String:
	if _pending_request_id.is_empty():
		_pending_request_id = _new_request_id(prefix)
	return _pending_request_id


func _finish_request(res: Dictionary, key: String) -> void:
	# Keep pending only for ambiguous transport failures (status 0) so retry/recover stay idempotent.
	if bool(res.get("ok", false)) or int(res.get("status", 0)) > 0:
		if _pending_request_id == key:
			_pending_request_id = ""


func _new_request_id(prefix: String) -> String:
	return "%s-%d-%d" % [prefix, int(Time.get_unix_time_from_system()), randi() % 100000]


func _apply(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	if typeof(data.get("casino", null)) == TYPE_DICTIONARY:
		casino_state = data["casino"]
		state_changed.emit(casino_state)
	GameApiClient.apply_authoritative_response(data, "casino_settle")
