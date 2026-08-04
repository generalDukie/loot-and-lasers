extends Node
## Stardust casino — GetCasinoState + CasinoSettle (dice / wheel).
## Crystal tables sealed on server. Outcomes are never local.

var casino_state: Dictionary = {}


func _ready() -> void:
	print("[CasinoManager] ready")


func load_state() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetCasinoState", {})
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		casino_state = res.data.get("casino", {}) if typeof(res.data.get("casino", null)) == TYPE_DICTIONARY else {}
		GameApiClient.apply_authoritative_response(res.data, "casino_state")
	return res


func max_bet() -> int:
	if casino_state.has("max_stardust_bet"):
		return maxi(1, int(casino_state["max_stardust_bet"]))
	var level := maxi(1, int(GameManager.active_character.get("level", 1)))
	# Fallback mirror of server getCasinoMaxStardustBet — authoritative value from GetCasinoState.
	return clampi(StardustEconomy.stardust_per_fuel(level) * 25, 1000, 2_500_000)


func nova_open() -> bool:
	return bool(casino_state.get("nova_casino_open", false))


func settle_dice(bet: int, choice: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("CasinoSettle", {
		"game": "dice",
		"bet": bet,
		"choice": choice,
		"request_id": "dice-%s-%s" % [Time.get_ticks_msec(), randi()],
	})
	_apply(res)
	return res


func settle_wheel(bet: int) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("CasinoSettle", {
		"game": "wheel",
		"bet": bet,
		"request_id": "wheel-%s-%s" % [Time.get_ticks_msec(), randi()],
	})
	_apply(res)
	return res


func recover(request_id: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("RecoverCasinoWager", {
		"request_id": request_id,
	})
	_apply(res)
	return res


func _apply(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	if typeof(data.get("casino", null)) == TYPE_DICTIONARY:
		casino_state = data["casino"]
	GameApiClient.apply_authoritative_response(data, "casino_settle")
