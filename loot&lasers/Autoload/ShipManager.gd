extends Node
## Ship hangar + fuel mounts against the Node API.

func _ready() -> void:
	print("[ShipManager] ready")


func refresh() -> Dictionary:
	return await MissionManager.refresh_character()


func buy_fuel_mount(mount_id: int) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("BuyFuelMount", {"mount_id": mount_id})
	_apply(res)
	return res


func dismiss_fuel_mount(mount_id: int, expires_at: String = "") -> Dictionary:
	var body := {"mount_id": mount_id}
	if not expires_at.is_empty():
		body["expires_at"] = expires_at
	var res: Dictionary = await GameApiClient.invoke("DismissFuelMount", body)
	_apply(res)
	return res


func buy_ship(ship_id: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("BuyShip", {"ship_id": ship_id})
	_apply(res)
	return res


func activate_ship(ship_id: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("ActivateShip", {"ship_id": ship_id})
	_apply(res)
	return res


func buy_ship_mod(category_key: String, ship_id: String = "") -> Dictionary:
	var body := {"category_key": category_key}
	if not ship_id.is_empty():
		body["ship_id"] = ship_id
	var res: Dictionary = await GameApiClient.invoke("BuyShipMod", body)
	_apply(res)
	return res


func claim_scout_milestone() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("ClaimScoutMilestone", {})
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
