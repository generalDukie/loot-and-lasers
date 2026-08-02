extends Node
## Character sheet — BuyAttribute + equipped totals.

## Emitted whenever a purchase moves the local character (optimistic, synced or rolled back).
signal character_changed

var equipped_items: Array = []
var all_items: Array = []
var last_buy: Dictionary = {}


func _ready() -> void:
	print("[StatsManager] ready")


func refresh() -> Dictionary:
	var res: Dictionary = await MissionManager.refresh_character()
	await load_equipped()
	return res


func load_equipped() -> Array:
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


## Spend is applied locally first so the sheet and shell readouts move on press;
## the server patch is authoritative and a failure rolls the snapshot back.
func buy_attribute(stat: String) -> Dictionary:
	if not stat in StatsRules.ATTR_KEYS:
		return {"ok": false, "error": "Invalid stat", "data": {}}
	var cost := StatsRules.next_cost(GameManager.active_character, stat)
	var sd := int(GameManager.active_character.get("stardust", 0))
	if sd < cost:
		return {"ok": false, "error": "Need %s stardust" % cost, "data": {}}
	var rollback := _snapshot_buy_fields()
	_apply_optimistic_buy(stat, cost)
	character_changed.emit()
	var res: Dictionary = await ApiClient.invoke("BuyAttribute", {"stat": stat})
	if not res.ok:
		_restore_buy_fields(rollback)
		character_changed.emit()
		return res
	_apply_payload(res)
	if typeof(res.data) == TYPE_DICTIONARY:
		last_buy = {
			"stat": str(res.data.get("stat", stat)),
			"cost": int(res.data.get("cost", cost)),
		}
	character_changed.emit()
	return res


func _snapshot_buy_fields() -> Dictionary:
	var c: Dictionary = GameManager.active_character
	var snap := {"stardust": int(c.get("stardust", 0))}
	for key in ["stats", "attribute_purchases_by_stat"]:
		var raw: Variant = c.get(key, null)
		snap[key] = (raw as Dictionary).duplicate(true) if typeof(raw) == TYPE_DICTIONARY else null
	snap["attribute_purchases"] = c.get("attribute_purchases", null)
	return snap


func _restore_buy_fields(snap: Dictionary) -> void:
	var c: Dictionary = GameManager.active_character
	c["stardust"] = int(snap.get("stardust", 0))
	for key in ["stats", "attribute_purchases_by_stat", "attribute_purchases"]:
		var value: Variant = snap.get(key, null)
		if value == null:
			c.erase(key)
		else:
			c[key] = value


func _apply_optimistic_buy(stat: String, cost: int) -> void:
	var c: Dictionary = GameManager.active_character
	# Purchase counts fall back to (stats − class base), so read them before stats move.
	var by: Dictionary = {}
	for key in StatsRules.ATTR_KEYS:
		by[key] = StatsRules.purchase_count(c, key)
	by[stat] = int(by.get(stat, 0)) + 1

	var stats: Dictionary = {}
	var raw: Variant = c.get("stats", null)
	if typeof(raw) == TYPE_DICTIONARY:
		stats = (raw as Dictionary).duplicate()
	stats[stat] = int(stats.get(stat, 0)) + 1

	var total := 0
	for key in StatsRules.ATTR_KEYS:
		total += int(by.get(key, 0))

	c["stardust"] = maxi(0, int(c.get("stardust", 0)) - cost)
	c["stats"] = stats
	c["attribute_purchases_by_stat"] = by
	c["attribute_purchases"] = total


func _apply_payload(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
