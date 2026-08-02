extends Node
## Stardust casino — CasinoSettle (dice / wheel). Crystal tables sealed on server.


func _ready() -> void:
	print("[CasinoManager] ready")


func max_bet() -> int:
	var level := maxi(1, int(GameManager.active_character.get("level", 1)))
	# Web getCasinoMaxStardustBet: SD/F × 25, floor 1000, cap 2_500_000.
	return clampi(MissionBoard.sd_per_fuel(level) * 25, 1000, 2_500_000)


func settle_dice(bet: int, choice: String) -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("CasinoSettle", {
		"game": "dice",
		"bet": bet,
		"choice": choice,
	})
	_apply(res)
	return res


func settle_wheel(bet: int) -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("CasinoSettle", {
		"game": "wheel",
		"bet": bet,
	})
	_apply(res)
	return res


func _apply(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
