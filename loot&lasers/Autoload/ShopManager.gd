extends Node
## Black Market shop — Phase 15: Nakama shop_get / shop_buy / shop_sell / shop_refresh.
## Fuel packs remain on Node (BuyFuel) via MissionManager.
## Soft currency (stardust) only for stall buy/sell. Free cooldown refresh (no Nova restock).

signal shop_loaded(shop: Dictionary)
signal shop_refreshed(shop: Dictionary)
signal item_purchased(result: Dictionary)
signal item_sold(result: Dictionary)
signal shop_changed(shop: Dictionary)
signal shop_error(error: String)
signal loading_changed(loading: bool)
signal mutation_state_changed(mutating: bool)

const FUEL_PURCHASE_AMOUNT := 20
const FUEL_PURCHASE_COST := 10
const FUEL_PURCHASE_MAX := 10
## Legacy Nova restock cost (Node). Nakama Phase 15 refresh is free when eligible.
const SHOP_REFRESH_COST := 0
const DEFAULT_SHOP_ID := "general"

var shop_meta: Dictionary = {}
var last_purchase: Dictionary = {}
var loading := false
var mutating := false

var _busy := false


func _ready() -> void:
	print("[ShopManager] ready (Nakama shop authority)")


func is_loading() -> bool:
	return loading


func is_mutating() -> bool:
	return mutating


func get_shop(_shop_id: String = DEFAULT_SHOP_ID) -> Dictionary:
	return shop_meta


func get_refresh_remaining(_shop_id: String = DEFAULT_SHOP_ID) -> int:
	return int(shop_meta.get("refresh_seconds_remaining", 0))


func ensure_shop() -> Dictionary:
	return await load_shop("", DEFAULT_SHOP_ID)


func load_shop(character_id: String = "", shop_id: String = DEFAULT_SHOP_ID) -> Dictionary:
	if _busy:
		return _fail("Shop request already in progress")
	_busy = true
	_set_loading(true)
	var payload := _character_payload(character_id)
	payload["shop_id"] = shop_id if not shop_id.is_empty() else DEFAULT_SHOP_ID
	payload["level"] = int(GameManager.active_character.get("level", 1))
	var res: Dictionary = await NakamaManager.invoke_rpc("shop_get", payload)
	_busy = false
	_set_loading(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "shop_get failed"))
		shop_error.emit(err)
		return {"ok": false, "error": err, "data": {}}
	_apply_shop_data(res.get("data", {}))
	shop_loaded.emit(shop_meta)
	shop_changed.emit(shop_meta)
	return {"ok": true, "error": "", "data": {"shop_meta": shop_meta, "shop": shop_meta}}


func buy_fuel() -> Dictionary:
	var res: Dictionary = await MissionManager.buy_fuel()
	return res


func buy_consumable(slot_id: String) -> Dictionary:
	return await buy_offer("", DEFAULT_SHOP_ID, slot_id)


func buy_gear(slot_id: String, _is_hot: bool = false, _haggle: bool = false) -> Dictionary:
	## Haggle / hot deal deferred — Phase 15 buys the authoritative offer as-is.
	return await buy_offer("", DEFAULT_SHOP_ID, slot_id)


func buy_offer(character_id: String, shop_id: String, offer_id: String) -> Dictionary:
	if offer_id.is_empty():
		return _fail("Missing offer_id")
	if _busy:
		return _fail("Shop request already in progress")
	_busy = true
	_set_mutating(true)
	var payload := _character_payload(character_id)
	payload["shop_id"] = shop_id if not shop_id.is_empty() else DEFAULT_SHOP_ID
	payload["offer_id"] = offer_id
	payload["request_id"] = "buy-%s-%d" % [offer_id.substr(0, mini(12, offer_id.length())), Time.get_unix_time_from_system()]
	if shop_meta.has("revision"):
		payload["expected_revision"] = int(shop_meta.get("revision", 1))
	var res: Dictionary = await NakamaManager.invoke_rpc("shop_buy", payload)
	_busy = false
	_set_mutating(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "shop_buy failed"))
		shop_error.emit(err)
		return {"ok": false, "error": err, "data": {}}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", null)) == TYPE_DICTIONARY else {}
	_apply_shop_data(data)
	last_purchase = {
		"kind": "gear",
		"cost": int(data.get("amount", 0)),
		"nova_cost": 0,
		"items": [{
			"id": str(data.get("item_instance_id", "")),
			"item_id": str(data.get("item_id", "")),
		}],
		"pending_loot": [],
	}
	if CurrencyManager != null and CurrencyManager.has_method("load_wallet"):
		await CurrencyManager.load_wallet()
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(str(payload.get("character_id", "")))
	item_purchased.emit(data)
	shop_changed.emit(shop_meta)
	return {"ok": true, "error": "", "data": data}


func sell_item(character_id: String, item_instance_id: String, quantity: int = 1) -> Dictionary:
	if item_instance_id.is_empty():
		return _fail("Missing item_instance_id")
	if _busy:
		return _fail("Shop request already in progress")
	_busy = true
	_set_mutating(true)
	var payload := _character_payload(character_id)
	payload["item_instance_id"] = item_instance_id
	payload["quantity"] = quantity
	payload["request_id"] = "sell-%s-%d" % [item_instance_id.substr(0, mini(12, item_instance_id.length())), Time.get_unix_time_from_system()]
	var res: Dictionary = await NakamaManager.invoke_rpc("shop_sell", payload)
	_busy = false
	_set_mutating(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "shop_sell failed"))
		shop_error.emit(err)
		return {"ok": false, "error": err, "data": {}}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", null)) == TYPE_DICTIONARY else {}
	if CurrencyManager != null and CurrencyManager.has_method("load_wallet"):
		await CurrencyManager.load_wallet()
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(str(payload.get("character_id", "")))
	item_sold.emit(data)
	return {"ok": true, "error": "", "data": data}


func refresh_shop(_which: String = "all") -> Dictionary:
	return await refresh_shop_for("", DEFAULT_SHOP_ID)


func refresh_shop_for(character_id: String = "", shop_id: String = DEFAULT_SHOP_ID) -> Dictionary:
	if _busy:
		return _fail("Shop request already in progress")
	_busy = true
	_set_mutating(true)
	var payload := _character_payload(character_id)
	payload["shop_id"] = shop_id if not shop_id.is_empty() else DEFAULT_SHOP_ID
	payload["level"] = int(GameManager.active_character.get("level", 1))
	payload["request_id"] = "ref-%d-%d" % [Time.get_unix_time_from_system(), randi() % 100000]
	var res: Dictionary = await NakamaManager.invoke_rpc("shop_refresh", payload)
	_busy = false
	_set_mutating(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "shop_refresh failed"))
		shop_error.emit(err)
		return {"ok": false, "error": err, "data": {}}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", null)) == TYPE_DICTIONARY else {}
	_apply_shop_data(data)
	if CurrencyManager != null and CurrencyManager.has_method("load_wallet"):
		await CurrencyManager.load_wallet()
	shop_refreshed.emit(shop_meta)
	shop_changed.emit(shop_meta)
	return {"ok": true, "error": "", "data": data}


func shop_stock() -> Array:
	var stock: Variant = shop_meta.get("shop_stock", [])
	if typeof(stock) == TYPE_ARRAY and (stock as Array).size() > 0:
		return stock
	var offers: Variant = shop_meta.get("offers", [])
	if typeof(offers) == TYPE_ARRAY:
		return offers
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
	return {}


func is_hot_purchased() -> bool:
	return false


func is_hot_yanked() -> bool:
	return false


func is_slot_purchased(slot_id: String) -> bool:
	var purchased: Variant = shop_meta.get("purchased", {})
	if typeof(purchased) == TYPE_DICTIONARY and bool((purchased as Dictionary).get(slot_id, false)):
		return true
	for row in shop_stock():
		if typeof(row) == TYPE_DICTIONARY and str(row.get("offer_id", row.get("_slotId", ""))) == slot_id:
			return bool(row.get("purchased", false))
	return false


func is_slot_yanked(_slot_id: String) -> bool:
	return false


func slot_cost_sd(item: Dictionary) -> int:
	if item.has("_cost"):
		return int(item.get("_cost", 0))
	if typeof(item.get("price", null)) == TYPE_DICTIONARY:
		return int((item.get("price") as Dictionary).get("amount", 0))
	return int(item.get("cost", 0))


func slot_cost_nova(_item: Dictionary) -> int:
	return 0


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


func _character_payload(character_id: String) -> Dictionary:
	var cid := character_id.strip_edges()
	if cid.is_empty():
		cid = str(GameManager.active_character.get("id", ""))
	var payload := {}
	if not cid.is_empty():
		payload["character_id"] = cid
	return payload


func _apply_shop_data(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	var meta: Variant = data.get("shop_meta", null)
	if typeof(meta) != TYPE_DICTIONARY:
		meta = data.get("shop", null)
	if typeof(meta) == TYPE_DICTIONARY:
		shop_meta = (meta as Dictionary).duplicate(true)


func _set_loading(value: bool) -> void:
	if loading == value:
		return
	loading = value
	loading_changed.emit(loading)


func _set_mutating(value: bool) -> void:
	if mutating == value:
		return
	mutating = value
	mutation_state_changed.emit(mutating)


func _fail(error: String) -> Dictionary:
	shop_error.emit(error)
	return {"ok": false, "error": error, "data": {}}
