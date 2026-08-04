extends Node
## Character sheet — BuyAttribute + equipped totals.

## Emitted whenever an authoritative purchase updates the local character.
signal character_changed

var equipped_items: Array = []
var all_items: Array = []
var last_buy: Dictionary = {}


func _ready() -> void:
	print("[StatsManager] ready")


func clear_local() -> void:
	equipped_items = []
	all_items = []
	last_buy = {}


func refresh() -> Dictionary:
	var res: Dictionary = await MissionManager.refresh_character()
	await load_equipped()
	return res


func load_equipped() -> Array:
	# Phase 6: refresh Nakama read-only equipment snapshot (non-fatal; UI still uses Node).
	if EquipmentManager != null:
		var eq_res: Dictionary = await EquipmentManager.load_equipment()
		if not eq_res.get("success", false):
			print("[StatsManager] WARNING: Nakama equipment_get — %s" % str(eq_res.get("error", "")))

	var items_res: Dictionary = await AuthManager.list_items()
	equipped_items = []
	all_items = []
	if items_res.ok and typeof(items_res.data) == TYPE_ARRAY:
		for it in items_res.data:
			if typeof(it) != TYPE_DICTIONARY:
				continue
			all_items.append(it)
			if bool(it.get("is_equipped", false)):
				equipped_items.append(it)
	return equipped_items


## Affordability is previewed from the normalized wallet; the server response is
## the only source allowed to mutate Character stats or Stardust.
func buy_attribute(stat: String) -> Dictionary:
	if not stat in StatsRules.ATTR_KEYS:
		return {"ok": false, "error": "Invalid stat", "data": {}}
	var cost := StatsRules.next_cost(GameManager.active_character, stat)
	if not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost):
		return {"ok": false, "error": "Need %s stardust" % cost, "data": {}}
	var res: Dictionary = await GameApiClient.invoke("BuyAttribute", {"stat": stat})
	if not res.ok:
		return res
	_apply_payload(res)
	if typeof(res.data) == TYPE_DICTIONARY:
		last_buy = {
			"stat": str(res.data.get("stat", stat)),
			"cost": int(res.data.get("cost", cost)),
		}
	character_changed.emit()
	return res


func _apply_payload(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.apply_active_character_patch(patch, "stats_buy_attribute")
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.apply_active_character(ch, "stats_buy_attribute")
