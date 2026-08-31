extends Node
## Black Market — Node EnsureShop / RefreshShop / BuyShop* authority (Restoration 12A/12B).
## Nakama is auth only. Purchases are atomic on Node; Godot never deducts currency or inserts items.
## Fuel packs remain MissionManager.buy_fuel (BuyFuel).

signal shop_loaded(shop: Dictionary)
signal shop_refreshed(shop: Dictionary)
signal item_purchased(result: Dictionary)
signal item_sold(result: Dictionary)
signal shop_changed(shop: Dictionary)
signal shop_error(error: String)
signal loading_changed(loading: bool)
signal mutation_state_changed(mutating: bool)

const FUEL_PURCHASE_AMOUNT := 20
const FUEL_PURCHASE_COST := 20
const FUEL_PURCHASE_MAX := 10
const SHOP_REFRESH_COST := 20
const DEFAULT_SHOP_ID := "general"

var shop_meta: Dictionary = {}
var shop_window: Dictionary = {}
var vendors: Dictionary = {}
var refresh_info: Dictionary = {}
var haggle_info: Dictionary = {}
var last_purchase: Dictionary = {}
var loading := false
var mutating := false

var _busy := false
var _pending_buy_request_id := ""


func _ready() -> void:
	print("[ShopManager] ready (Node shop authority)")


func clear_local() -> void:
	shop_meta = {}
	shop_window = {}
	vendors = {}
	refresh_info = {}
	haggle_info = {}
	last_purchase = {}
	loading = false
	mutating = false
	_busy = false
	_pending_buy_request_id = ""


func is_loading() -> bool:
	return loading


func is_mutating() -> bool:
	return mutating


func get_shop(_shop_id: String = DEFAULT_SHOP_ID) -> Dictionary:
	return shop_meta


func get_refresh_remaining(_shop_id: String = DEFAULT_SHOP_ID) -> int:
	if shop_window.has("secondsLeft"):
		return int(shop_window.get("secondsLeft", 0))
	return int(GameData.get_shop_window().get("secondsLeft", 0))


func ensure_shop() -> Dictionary:
	return await load_shop()


func load_shop(_character_id: String = "", _shop_id: String = DEFAULT_SHOP_ID) -> Dictionary:
	if _busy:
		return _fail("Shop request already in progress")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("EnsureShop", {})
	_busy = false
	_set_loading(false)
	if not res.ok:
		var err := str(res.get("error", "EnsureShop failed"))
		shop_error.emit(err)
		return {"ok": false, "error": err, "data": {}}
	_apply_shop_payload(res.data if typeof(res.data) == TYPE_DICTIONARY else {})
	_apply_character_payload(res)
	shop_loaded.emit(shop_meta)
	shop_changed.emit(shop_meta)
	return {"ok": true, "error": "", "data": res.data if typeof(res.data) == TYPE_DICTIONARY else {}}


func buy_fuel() -> Dictionary:
	return await MissionManager.buy_fuel()


func buy_consumable(slot_id: String) -> Dictionary:
	if TutorialManager != null and TutorialManager.blocks_black_market_commerce():
		return _fail("Finish or skip the tutorial before buying from the Black Market")
	if slot_id.is_empty():
		return _fail("Missing slot_id")
	if _busy:
		return _fail("Shop request already in progress")
	_busy = true
	_set_mutating(true)
	if _pending_buy_request_id.is_empty():
		_pending_buy_request_id = _new_request_id("shop-stim")
	var refresh_id := int(shop_meta.get("window_idx", shop_window.get("idx", 0)))
	_diag_buy("shop_buy_started", {
		"op": "BuyShopConsumable",
		"request_id": _pending_buy_request_id,
		"slot_id": slot_id,
		"refresh_id": refresh_id,
	})
	var res: Dictionary = await GameApiClient.invoke("BuyShopConsumable", {
		"slot_id": slot_id,
		"request_id": _pending_buy_request_id,
		"refresh_id": refresh_id,
	})
	_busy = false
	_set_mutating(false)
	_diag_buy("shop_buy_finished", {
		"op": "BuyShopConsumable",
		"request_id": _pending_buy_request_id,
		"slot_id": slot_id,
		"status": int(res.get("status", 0)),
		"ok": bool(res.get("ok", false)),
		"error": str(res.get("error", "")),
	})
	# Keep pending id only for ambiguous transport failures (status 0) so retry is idempotent.
	# Definitive HTTP outcomes (incl. Invalid request_id) must not reuse a rejected key.
	if bool(res.get("ok", false)) or int(res.get("status", 0)) > 0:
		_pending_buy_request_id = ""
	if not res.ok:
		var err := str(res.get("error", "BuyShopConsumable failed"))
		shop_error.emit(err)
		return {"ok": false, "error": err, "data": {}, "status": int(res.get("status", 0))}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	_apply_shop_payload(data)
	_apply_character_payload(res)
	last_purchase = {
		"kind": "stim",
		"cost": int(data.get("cost", 0)),
		"nova_cost": 0,
		"items": data.get("items", []),
		"pending_loot": data.get("pending_loot", []),
		"transaction_id": str(data.get("transaction_id", "")),
		"idempotent_replay": bool(data.get("idempotent_replay", false)),
	}
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(str(GameManager.active_character.get("id", "")))
	item_purchased.emit(data)
	shop_changed.emit(shop_meta)
	return {"ok": true, "error": "", "data": data}


func buy_gear(slot_id: String, is_hot: bool = false, haggle: bool = false) -> Dictionary:
	if TutorialManager != null and TutorialManager.blocks_black_market_commerce():
		return _fail("Finish or skip the tutorial before buying from the Black Market")
	if slot_id.is_empty():
		return _fail("Missing slot_id")
	if _busy:
		return _fail("Shop request already in progress")
	_busy = true
	_set_mutating(true)
	if _pending_buy_request_id.is_empty():
		_pending_buy_request_id = _new_request_id("shop-gear")
	var refresh_id := int(shop_meta.get("window_idx", shop_window.get("idx", 0)))
	_diag_buy("shop_buy_started", {
		"op": "BuyShopGear",
		"request_id": _pending_buy_request_id,
		"slot_id": slot_id,
		"is_hot": is_hot,
		"haggle": haggle,
		"refresh_id": refresh_id,
	})
	var res: Dictionary = await GameApiClient.invoke("BuyShopGear", {
		"slot_id": slot_id,
		"is_hot": is_hot,
		"haggle": haggle,
		"request_id": _pending_buy_request_id,
		"refresh_id": refresh_id,
	})
	_busy = false
	_set_mutating(false)
	_diag_buy("shop_buy_finished", {
		"op": "BuyShopGear",
		"request_id": _pending_buy_request_id,
		"slot_id": slot_id,
		"status": int(res.get("status", 0)),
		"ok": bool(res.get("ok", false)),
		"error": str(res.get("error", "")),
	})
	# Keep pending id only for ambiguous transport failures (status 0) so retry is idempotent.
	# Definitive HTTP outcomes (incl. Invalid request_id) must not reuse a rejected key.
	if bool(res.get("ok", false)) or int(res.get("status", 0)) > 0:
		_pending_buy_request_id = ""
	if not res.ok:
		var err := str(res.get("error", "BuyShopGear failed"))
		shop_error.emit(err)
		return {"ok": false, "error": err, "data": {}, "status": int(res.get("status", 0))}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	_apply_shop_payload(data)
	_apply_character_payload(res)
	last_purchase = {
		"kind": "gear",
		"cost": int(data.get("cost", 0)),
		"nova_cost": int(data.get("nova_cost", 0)),
		"items": data.get("items", []),
		"pending_loot": data.get("pending_loot", []),
		"haggle_failed": bool(data.get("haggle_failed", false)),
		"haggle_success": bool(data.get("haggle_success", false)),
		"haggle_discount_pct": int(data.get("haggle_discount_pct", 0)),
		"haggle_note": str(data.get("haggle_note", "")),
		"transaction_id": str(data.get("transaction_id", "")),
		"idempotent_replay": bool(data.get("idempotent_replay", false)),
	}
	var haggle_only := bool(last_purchase.get("haggle_success", false)) or bool(last_purchase.get("haggle_failed", false))
	if not haggle_only and InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(str(GameManager.active_character.get("id", "")))
	if not haggle_only:
		item_purchased.emit(data)
	shop_changed.emit(shop_meta)
	return {"ok": true, "error": "", "data": data}


func buy_offer(_character_id: String, _shop_id: String, offer_id: String) -> Dictionary:
	## Compatibility wrapper — Node routes gear vs stim by offer type.
	if is_stim_slot(_find_slot(offer_id)):
		return await buy_consumable(offer_id)
	return await buy_gear(offer_id, false, false)


func sell_item(_character_id: String, item_instance_id: String, _quantity: int = 1) -> Dictionary:
	## Black Market sell — Node DissolveItem is the settlement RPC.
	if item_instance_id.is_empty():
		return _fail("Missing item_instance_id")
	if InventoryManager != null and InventoryManager.has_method("dissolve_item"):
		var res: Dictionary = await InventoryManager.dissolve_item(item_instance_id)
		if res.ok:
			item_sold.emit(res.data if typeof(res.data) == TYPE_DICTIONARY else {})
		return res
	return _fail("Sell not available")


## Batch fence — same payout path as a single Black Market sale.
func sell_items(item_ids: Array) -> Dictionary:
	if item_ids.is_empty():
		return _fail("No items")
	if InventoryManager == null or not InventoryManager.has_method("dissolve_junk"):
		return _fail("Sell not available")
	var res: Dictionary = await InventoryManager.dissolve_junk(item_ids, false)
	if res.ok:
		item_sold.emit(res.data if typeof(res.data) == TYPE_DICTIONARY else {})
	return res


func refresh_shop(_which: String = "all") -> Dictionary:
	return await refresh_shop_for()


func refresh_shop_for(_character_id: String = "", _shop_id: String = DEFAULT_SHOP_ID) -> Dictionary:
	if TutorialManager != null and TutorialManager.blocks_black_market_commerce():
		return _fail("Finish or skip the tutorial before restocking the Black Market")
	if _busy:
		return _fail("Shop request already in progress")
	_busy = true
	_set_mutating(true)
	# Always paid restock (20 Nova) — infinite refreshes; no free/cooldown gate.
	var res: Dictionary = await GameApiClient.invoke("RefreshShop", {
		"which": "all",
		"use_free": false,
	})
	_busy = false
	_set_mutating(false)
	if not res.ok:
		var err := str(res.get("error", "RefreshShop failed"))
		shop_error.emit(err)
		return {"ok": false, "error": err, "data": {}}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	_apply_shop_payload(data)
	_apply_character_payload(res)
	shop_refreshed.emit(shop_meta)
	shop_changed.emit(shop_meta)
	return {"ok": true, "error": "", "data": data}


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
	return hot if typeof(hot) == TYPE_DICTIONARY else {}


func is_hot_purchased() -> bool:
	return bool(shop_meta.get("hot_purchased", false))


func is_hot_yanked() -> bool:
	return bool(shop_meta.get("hot_yanked", false))


func is_slot_purchased(slot_id: String) -> bool:
	var purchased: Variant = shop_meta.get("purchased", {})
	if typeof(purchased) == TYPE_DICTIONARY and bool((purchased as Dictionary).get(slot_id, false)):
		return true
	return false


func is_slot_yanked(slot_id: String) -> bool:
	var yanked: Variant = shop_meta.get("yanked", {})
	if typeof(yanked) == TYPE_DICTIONARY and bool((yanked as Dictionary).get(slot_id, false)):
		return true
	return false


func slot_cost_sd(item: Dictionary) -> int:
	if item.has("final_price"):
		return int(item.get("final_price", 0))
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
	var nova: float = float(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA)) if CurrencyManager != null else 0.0
	var fuel: float = float(CurrencyManager.get_balance(CurrencyManager.CURRENCY_FUEL)) if CurrencyManager != null else 0.0
	var max_fuel := ShipRules.effective_max_fuel(c)
	if fuel_purchases_left() <= 0:
		return {"ok": false, "error": "Daily fuel purchases used up"}
	if nova < FUEL_PURCHASE_COST:
		return {"ok": false, "error": "Need %s Nova" % NumberDisplay.nova(FUEL_PURCHASE_COST)}
	if fuel > max_fuel - FUEL_PURCHASE_AMOUNT:
		return {"ok": false, "error": "Tank too full"}
	return {"ok": true}


func _find_slot(slot_id: String) -> Dictionary:
	for row in shop_stock():
		if typeof(row) == TYPE_DICTIONARY and str(row.get("_slotId", "")) == slot_id:
			return row
	var hot := hot_deal()
	if str(hot.get("_slotId", "")) == slot_id:
		return hot
	return {}


func _apply_shop_payload(data: Dictionary) -> void:
	var meta: Variant = data.get("shop_meta", null)
	if typeof(meta) == TYPE_DICTIONARY:
		shop_meta = (meta as Dictionary).duplicate(true)
	var win: Variant = data.get("shop_window", null)
	if typeof(win) == TYPE_DICTIONARY:
		shop_window = (win as Dictionary).duplicate(true)
	var v: Variant = data.get("vendors", null)
	if typeof(v) == TYPE_DICTIONARY:
		vendors = (v as Dictionary).duplicate(true)
	var r: Variant = data.get("refresh", null)
	if typeof(r) == TYPE_DICTIONARY:
		refresh_info = (r as Dictionary).duplicate(true)
	var h: Variant = data.get("haggle", null)
	if typeof(h) == TYPE_DICTIONARY:
		haggle_info = (h as Dictionary).duplicate(true)


func _apply_character_payload(res: Dictionary) -> void:
	if typeof(res.get("data", null)) != TYPE_DICTIONARY:
		return
	GameApiClient.apply_authoritative_response(res.data, "shop_node_action")


func _new_request_id(prefix: String) -> String:
	## Node normalizeOperationKey allows only [A-Za-z0-9:_-] (see economy.js).
	## Time.get_unix_time_from_system() is a float; str() injects '.' and Node returns
	## "Invalid request_id". Cast to int like MissionManager.buy_fuel / web Date.now().
	return "%s-%d-%d" % [prefix, int(Time.get_unix_time_from_system()), randi() % 100000]


func _diag_buy(event: String, fields: Dictionary = {}) -> void:
	if DiagnosticLogger == null:
		return
	DiagnosticLogger.info("ShopManager", event, fields)


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
