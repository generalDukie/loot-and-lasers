extends Node
## Character sheet — BuyAttribute + equipped totals + authoritative attribute sheet.

## Emitted whenever an authoritative purchase updates the local character.
signal character_changed

const CHARACTER_REFRESH_RESULT_INDEX: int = 0
const MAX_ATTRIBUTE_PURCHASE_BATCH: int = 20

var equipped_items: Array = []
var all_items: Array = []
var last_buy: Dictionary = {}
## Last successful GetCharacterAttributes sheet (Node authority). Empty until loaded.
var authoritative_sheet: Dictionary = {}


func _ready() -> void:
	print("[StatsManager] ready")


func clear_local() -> void:
	equipped_items = []
	all_items = []
	last_buy = {}
	authoritative_sheet = {}


## Apply EquipItem / UnequipItem / GetInventory snapshot fields (presentation cache).
func apply_inventory_snapshot(data: Dictionary) -> bool:
	var applied := false
	var items: Variant = data.get("items", null)
	if typeof(items) == TYPE_ARRAY:
		all_items = []
		equipped_items = []
		for it in items:
			if typeof(it) != TYPE_DICTIONARY:
				continue
			all_items.append(it)
			if bool(it.get("is_equipped", false)):
				equipped_items.append(it)
		applied = true
	else:
		var eq_list: Variant = data.get("equipped_items", null)
		if typeof(eq_list) == TYPE_ARRAY:
			equipped_items = []
			for it in eq_list:
				if typeof(it) == TYPE_DICTIONARY:
					equipped_items.append(it)
			applied = true
	var sheet: Variant = data.get("sheet", null)
	if typeof(sheet) == TYPE_DICTIONARY and not (sheet as Dictionary).is_empty():
		authoritative_sheet = sheet
		applied = true
	if applied:
		character_changed.emit()
	return applied


func refresh(force_character: bool = false) -> Dictionary:
	var requests := AsyncGroup.new()
	requests.add(MissionManager.refresh_character.bind(force_character))
	requests.add(load_equipped)
	requests.add(load_attribute_sheet)
	var results := await requests.wait()
	var character_result: Dictionary = results[CHARACTER_REFRESH_RESULT_INDEX]
	return character_result


func load_equipped() -> Array:
	# Node Items only — Nakama equipment_get is client-blocked.
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


## Fetch Node-computed permanent / effective / derived attributes. Presentation only.
func load_attribute_sheet() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetCharacterAttributes", {}, true)
	if not res.ok:
		print("[StatsManager] WARNING: GetCharacterAttributes — %s" % str(res.get("error", "")))
		return authoritative_sheet
	var data: Variant = res.data
	if typeof(data) != TYPE_DICTIONARY:
		return authoritative_sheet
	var sheet: Variant = data.get("sheet", {})
	if typeof(sheet) == TYPE_DICTIONARY and not (sheet as Dictionary).is_empty():
		authoritative_sheet = sheet
	GameApiClient.apply_authoritative_response(data, "get_character_attributes")
	return authoritative_sheet


## Prefer Node sheet fields; fall back to local StatsRules preview when offline/empty.
func display_totals(character: Dictionary, equipped: Array = []) -> Dictionary:
	var sheet := authoritative_sheet
	if not sheet.is_empty() and typeof(sheet.get("effective_attributes", null)) == TYPE_DICTIONARY:
		return sheet["effective_attributes"]
	return StatsRules.display_totals(character, equipped)


func permanent_totals(character: Dictionary, equipped: Array = []) -> Dictionary:
	var sheet := authoritative_sheet
	if not sheet.is_empty() and typeof(sheet.get("permanent_totals", null)) == TYPE_DICTIONARY:
		return sheet["permanent_totals"]
	return StatsRules.permanent_totals(character, equipped)


func naked_totals(character: Dictionary) -> Dictionary:
	var sheet := authoritative_sheet
	if not sheet.is_empty() and typeof(sheet.get("naked_totals", null)) == TYPE_DICTIONARY:
		return sheet["naked_totals"]
	return StatsRules.naked_totals(character)


func derived_stats(character: Dictionary, totals: Dictionary) -> Dictionary:
	var sheet := authoritative_sheet
	if not sheet.is_empty() and typeof(sheet.get("derived_permanent", null)) == TYPE_DICTIONARY:
		# Hero combat panel uses pre-stim derived (matches prior StatsRules.derived(c, permanent)).
		return sheet["derived_permanent"]
	return StatsRules.derived(character, totals)


func next_cost(character: Dictionary, stat: String) -> int:
	var sheet := authoritative_sheet
	var costs: Variant = sheet.get("next_costs", null) if not sheet.is_empty() else null
	if typeof(costs) == TYPE_DICTIONARY and costs.has(stat):
		return int(costs[stat])
	return StatsRules.next_cost(character, stat)


## Affordability is previewed from the normalized wallet; the server response is
## the only source allowed to mutate Character stats or Stardust.
## `count` batches sequential purchases (cost curve applied per point) in one RPC.
func buy_attribute(stat: String, count: int = 1) -> Dictionary:
	if not stat in StatsRules.ATTR_KEYS:
		return {"ok": false, "error": "Invalid stat", "data": {}}
	var n := clampi(count, 1, MAX_ATTRIBUTE_PURCHASE_BATCH)
	var ch: Dictionary = GameManager.active_character
	var requested_cost := StatsRules.batch_cost(ch, stat, n)
	if not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, requested_cost):
		var dust := int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
		n = mini(n, StatsRules.max_affordable_purchases(ch, stat, dust))
	if n <= 0:
		var one := next_cost(ch, stat)
		return {"ok": false, "error": "Need %s stardust" % one, "data": {}}
	var preview_cost := StatsRules.batch_cost(ch, stat, n)
	var res: Dictionary = await GameApiClient.invoke("BuyAttribute", {"stat": stat, "count": n})
	if not res.ok:
		return res
	_apply_payload(res)
	if typeof(res.data) == TYPE_DICTIONARY:
		last_buy = {
			"stat": str(res.data.get("stat", stat)),
			"cost": int(res.data.get("cost", preview_cost)),
			"count": int(res.data.get("count", 1)),
		}
		var sheet: Variant = res.data.get("sheet", null)
		if typeof(sheet) == TYPE_DICTIONARY and not (sheet as Dictionary).is_empty():
			authoritative_sheet = sheet
		else:
			await load_attribute_sheet()
	character_changed.emit()
	return res


func _apply_payload(res: Dictionary) -> void:
	if not res.ok:
		return
	GameApiClient.apply_authoritative_response(
		res.data if typeof(res.data) == TYPE_DICTIONARY else {},
		"stats_buy_attribute"
	)
