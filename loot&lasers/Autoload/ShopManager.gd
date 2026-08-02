extends Node
## Black Market shop — EnsureShop stock + buy fuel/stims/gear against the Node API.

const FUEL_PURCHASE_AMOUNT := 20
const FUEL_PURCHASE_COST := 10
const FUEL_PURCHASE_MAX := 10
const SHOP_REFRESH_COST := 10

var shop_meta: Dictionary = {}
var last_purchase: Dictionary = {}


func _ready() -> void:
	print("[ShopManager] ready")


func ensure_shop() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("EnsureShop", {})
	_apply_payload(res)
	return res


func buy_fuel() -> Dictionary:
	var res: Dictionary = await MissionManager.buy_fuel()
	return res


func buy_consumable(slot_id: String) -> Dictionary:
	if slot_id.is_empty():
		return {"ok": false, "error": "Missing slot_id", "data": {}}
	var res: Dictionary = await GameApiClient.invoke("BuyShopConsumable", {"slot_id": slot_id})
	_apply_payload(res)
	if res.ok:
		last_purchase = {
			"kind": "consumable",
			"cost": int(res.data.get("cost", 0)) if typeof(res.data) == TYPE_DICTIONARY else 0,
			"items": res.data.get("items", []) if typeof(res.data) == TYPE_DICTIONARY else [],
			"pending_loot": res.data.get("pending_loot", []) if typeof(res.data) == TYPE_DICTIONARY else [],
		}
		await _remember_loot(last_purchase)
	return res


func buy_gear(slot_id: String, is_hot: bool = false, haggle: bool = false) -> Dictionary:
	if slot_id.is_empty():
		return {"ok": false, "error": "Missing slot_id", "data": {}}
	var res: Dictionary = await GameApiClient.invoke("BuyShopGear", {
		"slot_id": slot_id,
		"haggle": haggle,
		"is_hot": is_hot,
	})
	_apply_payload(res)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		if bool(res.data.get("haggle_failed", false)):
			last_purchase = {
				"kind": "haggle_fail",
				"note": str(res.data.get("haggle_note", "Haggle failed")),
			}
		else:
			last_purchase = {
				"kind": "gear",
				"cost": int(res.data.get("cost", 0)),
				"nova_cost": int(res.data.get("nova_cost", 0)),
				"items": res.data.get("items", []),
				"pending_loot": res.data.get("pending_loot", []),
				"haggle_note": str(res.data.get("haggle_note", "")),
			}
			await _remember_loot(last_purchase)
	return res


func refresh_shop(which: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("RefreshShop", {"which": which})
	_apply_payload(res)
	return res


func shop_stock() -> Array:
	var stock: Variant = shop_meta.get("shop_stock", [])
	if typeof(stock) == TYPE_ARRAY and (stock as Array).size() > 0:
		return stock
	return gear_stock()


func gear_stock() -> Array:
	var stock: Variant = shop_meta.get("gear_stock", [])
	return stock if typeof(stock) == TYPE_ARRAY else []


func cons_stock() -> Array:
	var stock: Variant = shop_meta.get("cons_stock", [])
	return stock if typeof(stock) == TYPE_ARRAY else []


func is_stim_slot(item: Dictionary) -> bool:
	if item.is_empty():
		return false
	return str(item.get("type", "")) == "consumable" or str(item.get("_offerKind", "")) == "stim"


func hot_deal() -> Dictionary:
	var hot: Variant = shop_meta.get("hot_deal", {})
	if typeof(hot) == TYPE_DICTIONARY and not (hot as Dictionary).is_empty():
		return hot
	return {}


func is_hot_purchased() -> bool:
	return bool(shop_meta.get("hot_purchased", false))


func is_hot_yanked() -> bool:
	return bool(shop_meta.get("hot_yanked", false))


func is_slot_purchased(slot_id: String) -> bool:
	var purchased: Variant = shop_meta.get("purchased", {})
	if typeof(purchased) != TYPE_DICTIONARY:
		return false
	return bool((purchased as Dictionary).get(slot_id, false))


func is_slot_yanked(slot_id: String) -> bool:
	var yanked: Variant = shop_meta.get("yanked", {})
	if typeof(yanked) != TYPE_DICTIONARY:
		return false
	return bool((yanked as Dictionary).get(slot_id, false))


func slot_cost_sd(item: Dictionary) -> int:
	if item.has("_cost"):
		return int(item.get("_cost", 0))
	return int(item.get("cost", 0))


func slot_cost_nova(item: Dictionary) -> int:
	return int(item.get("nova_cost", 0))


func fuel_purchases_left() -> int:
	var used := int(GameManager.active_character.get("fuel_purchases", 0))
	return maxi(0, FUEL_PURCHASE_MAX - used)


func can_buy_fuel() -> Dictionary:
	var c: Dictionary = GameManager.active_character
	var nova := int(c.get("nova_crystals", 0))
	var fuel := int(c.get("fuel", 0))
	var max_fuel := int(c.get("max_fuel", 100))
	if fuel_purchases_left() <= 0:
		return {"ok": false, "error": "Daily fuel purchases used up"}
	if nova < FUEL_PURCHASE_COST:
		return {"ok": false, "error": "Need %s Nova" % FUEL_PURCHASE_COST}
	if fuel > max_fuel - FUEL_PURCHASE_AMOUNT:
		return {"ok": false, "error": "Tank too full"}
	return {"ok": true}


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
	var meta: Variant = data.get("shop_meta", null)
	if typeof(meta) != TYPE_DICTIONARY:
		meta = GameManager.active_character.get("shop_meta", {})
	if typeof(meta) == TYPE_DICTIONARY:
		shop_meta = meta
		GameManager.active_character["shop_meta"] = shop_meta


func _remember_loot(purchase: Dictionary) -> void:
	var ids: PackedStringArray = []
	var items: Variant = purchase.get("items", [])
	if typeof(items) == TYPE_ARRAY:
		for it in items:
			if typeof(it) == TYPE_DICTIONARY and it.has("id"):
				ids.append(str(it["id"]))
	var pending: Variant = purchase.get("pending_loot", [])
	if typeof(pending) == TYPE_ARRAY:
		for p in pending:
			if typeof(p) != TYPE_DICTIONARY:
				continue
			var item: Variant = p.get("item", p)
			if typeof(item) == TYPE_DICTIONARY and item.has("id"):
				ids.append(str(item["id"]))
			elif p.has("id"):
				ids.append(str(p["id"]))
	if ids.size() > 0:
		GameManager.recent_loot_ids = ids
	if typeof(pending) == TYPE_ARRAY and (pending as Array).size() > 0:
		await InventoryManager.list_pending_loot()
