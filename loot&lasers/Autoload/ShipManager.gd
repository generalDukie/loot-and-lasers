extends Node
## Ship hangar + fuel mounts against the Node API.

func _ready() -> void:
	print("[ShipManager] ready")


func _hangar_offline() -> Dictionary:
	return {"ok": false, "error": "Ship Hangar is Coming Soon", "code": "ship_hangar_offline"}


func refresh(force_character: bool = false) -> Dictionary:
	return await MissionManager.refresh_character(force_character)


func buy_fuel_mount(mount_id: int) -> Dictionary:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return _hangar_offline()
	var res: Dictionary = await GameApiClient.invoke("BuyFuelMount", {"mount_id": mount_id})
	_apply(res)
	return res


func dismiss_fuel_mount(mount_id: int, expires_at: String = "") -> Dictionary:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return _hangar_offline()
	var body := {"mount_id": mount_id}
	if not expires_at.is_empty():
		body["expires_at"] = expires_at
	var res: Dictionary = await GameApiClient.invoke("DismissFuelMount", body)
	_apply(res)
	return res


func buy_ship(ship_id: String) -> Dictionary:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return _hangar_offline()
	var res: Dictionary = await GameApiClient.invoke("BuyShip", {"ship_id": ship_id})
	_apply(res)
	return res


func activate_ship(ship_id: String) -> Dictionary:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return _hangar_offline()
	var res: Dictionary = await GameApiClient.invoke("ActivateShip", {"ship_id": ship_id})
	_apply(res)
	return res


func buy_ship_mod(category_key: String, ship_id: String = "") -> Dictionary:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return _hangar_offline()
	var body := {"category_key": category_key}
	if not ship_id.is_empty():
		body["ship_id"] = ship_id
	var res: Dictionary = await GameApiClient.invoke("BuyShipMod", body)
	_apply(res)
	return res


func claim_scout_milestone() -> Dictionary:
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		return _hangar_offline()
	var res: Dictionary = await GameApiClient.invoke("ClaimScoutMilestone", {})
	_apply(res)
	return res


func _apply(res: Dictionary) -> void:
	if not res.ok:
		return
	GameApiClient.apply_authoritative_response(
		res.data if typeof(res.data) == TYPE_DICTIONARY else {},
		"ship_mutation"
	)
