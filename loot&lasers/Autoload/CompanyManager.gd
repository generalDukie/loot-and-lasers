extends Node
## Corporate Offices — Node GetCompanyStatus / PreviewShipment / ConfirmShipment / RedeemCommission.

signal companies_loaded(state: Dictionary)
signal shipment_previewed(preview: Dictionary)
signal shipment_settled(result: Dictionary)
signal commission_created(result: Dictionary)
signal company_error(error: String)
signal loading_changed(loading: bool)

var companies: Array = []
var eligible_items: Array = []
var overflow_companies: Array = []
var last_preview: Dictionary = {}
var last_item: Dictionary = {}
var loading := false

var _busy := false
var _shipment_request_id := ""
var _commission_request_id := ""
var _bound_character_id := ""
var _bound_account_id := ""


func _ready() -> void:
	print("[CompanyManager] ready (Node company authority)")
	if GameManager != null and not GameManager.active_character_changed.is_connected(_on_active_character_changed):
		GameManager.active_character_changed.connect(_on_active_character_changed)


func loaded_character_id() -> String:
	return _bound_character_id


func loaded_account_id() -> String:
	return _bound_account_id


func clear_local() -> void:
	_clear_loaded_payload()
	_shipment_request_id = ""
	_commission_request_id = ""
	_bound_character_id = ""
	_bound_account_id = ""


func _clear_loaded_payload() -> void:
	companies = []
	eligible_items = []
	overflow_companies = []
	last_preview = {}
	last_item = {}
	loading = false
	_busy = false


func _live_character_id() -> String:
	if GameManager == null:
		return ""
	return str(GameManager.selected_character_id()).strip_edges()


func _live_account_id() -> String:
	if AuthManager == null or typeof(AuthManager.user) != TYPE_DICTIONARY:
		return ""
	return str(AuthManager.user.get("id", "")).strip_edges()


func _bind_identity(character_id: String, account_id: String) -> void:
	if character_id == _bound_character_id and account_id == _bound_account_id:
		return
	_clear_loaded_payload()
	_shipment_request_id = ""
	_commission_request_id = ""
	_bound_character_id = character_id
	_bound_account_id = account_id
	companies_loaded.emit(_snapshot())


func _on_active_character_changed(character: Dictionary, _source: String) -> void:
	var cid := str(character.get("id", "")).strip_edges()
	if cid.is_empty():
		clear_local()
		companies_loaded.emit(_snapshot())
		return
	_bind_identity(cid, _live_account_id())


func company_row(company_id: String) -> Dictionary:
	for raw in companies:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = raw
		if str(row.get("id", "")) == company_id:
			return row
	return {}


func overflow_pending(company_id: String) -> bool:
	return overflow_companies.has(company_id) or bool(company_row(company_id).get("overflow_pending", false))


func eligible_for_company(company_id: String) -> Array:
	var out: Array = []
	for it in eligible_items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if str(it.get("manufacturer", "")) != company_id:
			continue
		out.append(it)
	return out


func load_status() -> Dictionary:
	if _busy:
		return _fail("Company request already in progress")
	var cid := _live_character_id()
	var aid := _live_account_id()
	_bind_identity(cid, aid)
	if cid.is_empty():
		return _fail("No character selected")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("GetCompanyStatus", {})
	_busy = false
	_set_loading(false)
	if _live_character_id() != cid or _live_account_id() != aid:
		return {"ok": false, "error": "Character changed", "data": {}}
	if not res.ok:
		var err := str(res.get("error", "Could not load Corporate Offices"))
		company_error.emit(err)
		return {"ok": false, "error": err, "data": {}}
	_apply_status(res.data if typeof(res.data) == TYPE_DICTIONARY else {})
	companies_loaded.emit(_snapshot())
	return {"ok": true, "error": "", "data": _snapshot()}


func preview_shipment(company_id: String, item_ids: Array) -> Dictionary:
	if _busy:
		return _fail("Company request already in progress")
	var cid := _live_character_id()
	var aid := _live_account_id()
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("PreviewShipment", {
		"company_id": company_id,
		"item_ids": item_ids,
	})
	_busy = false
	_set_loading(false)
	if _live_character_id() != cid or _live_account_id() != aid:
		return {"ok": false, "error": "Character changed", "data": {}}
	if not res.ok:
		var err := str(res.get("error", "Could not preview Shipment"))
		company_error.emit(err)
		return {"ok": false, "error": err, "data": {}, "code": str(res.get("code", ""))}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	last_preview = data.get("preview", {}) if typeof(data.get("preview", {})) == TYPE_DICTIONARY else {}
	shipment_previewed.emit(last_preview)
	return {"ok": true, "error": "", "data": last_preview}


func confirm_shipment(company_id: String, item_ids: Array) -> Dictionary:
	if _busy:
		return _fail("Company request already in progress")
	var cid := _live_character_id()
	var aid := _live_account_id()
	if _shipment_request_id.is_empty():
		_shipment_request_id = _new_request_id("ship")
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("ConfirmShipment", {
		"company_id": company_id,
		"item_ids": item_ids,
		"request_id": _shipment_request_id,
	}, true)
	_busy = false
	_set_loading(false)
	if _live_character_id() != cid or _live_account_id() != aid:
		return {"ok": false, "error": "Character changed", "data": {}}
	if bool(res.get("ok", false)) or int(res.get("status", 0)) > 0:
		_shipment_request_id = ""
	if not res.ok:
		var err := str(res.get("error", "Shipment failed"))
		company_error.emit(err)
		return {"ok": false, "error": err, "data": {}, "code": str(res.get("code", ""))}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	GameApiClient.apply_authoritative_response(data, "confirm_shipment")
	_apply_companies_payload(data)
	shipment_settled.emit(data)
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(str(GameManager.active_character.get("id", "")))
	return {"ok": true, "error": "", "data": data}


func redeem_commission(company_id: String, spend_token_id: String, slot: String, weights: Dictionary = {}) -> Dictionary:
	if _busy:
		return _fail("Company request already in progress")
	var cid := _live_character_id()
	var aid := _live_account_id()
	if _commission_request_id.is_empty():
		_commission_request_id = _new_request_id("comm")
	var payload := {
		"company_id": company_id,
		"spend_token_id": spend_token_id,
		"slot": slot,
		"request_id": _commission_request_id,
	}
	if not weights.is_empty():
		payload["weights"] = weights
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("RedeemCommission", payload, true)
	_busy = false
	_set_loading(false)
	if _live_character_id() != cid or _live_account_id() != aid:
		return {"ok": false, "error": "Character changed", "data": {}}
	if bool(res.get("ok", false)) or int(res.get("status", 0)) > 0:
		_commission_request_id = ""
	if not res.ok:
		var err := str(res.get("error", "Commission failed"))
		company_error.emit(err)
		return {"ok": false, "error": err, "data": {}, "code": str(res.get("code", "")), "status": int(res.get("status", 0))}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	GameApiClient.apply_authoritative_response(data, "redeem_commission")
	_apply_companies_payload(data)
	last_item = data.get("item", {}) if typeof(data.get("item", {})) == TYPE_DICTIONARY else {}
	commission_created.emit(data)
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(str(GameManager.active_character.get("id", "")))
	return {"ok": true, "error": "", "data": data}


func _apply_status(data: Dictionary) -> void:
	companies = data.get("companies", []) if typeof(data.get("companies", [])) == TYPE_ARRAY else []
	eligible_items = data.get("eligible_items", []) if typeof(data.get("eligible_items", [])) == TYPE_ARRAY else []
	overflow_companies = data.get("overflow_companies", []) if typeof(data.get("overflow_companies", [])) == TYPE_ARRAY else []
	if typeof(data.get("character", null)) == TYPE_DICTIONARY:
		GameApiClient.apply_authoritative_response(data, "company_status")


func _apply_companies_payload(data: Dictionary) -> void:
	if typeof(data.get("companies", null)) == TYPE_ARRAY:
		companies = data.get("companies", [])
	if typeof(data.get("overflow_companies", null)) == TYPE_ARRAY:
		overflow_companies = data.get("overflow_companies", [])
	elif typeof(data.get("company", null)) == TYPE_DICTIONARY:
		var row: Dictionary = data.company
		var cid := str(row.get("id", ""))
		var next: Array = []
		for existing in companies:
			if typeof(existing) == TYPE_DICTIONARY and str(existing.get("id", "")) == cid:
				next.append(row)
			else:
				next.append(existing)
		companies = next
		overflow_companies = []
		for existing in companies:
			if typeof(existing) == TYPE_DICTIONARY and bool(existing.get("overflow_pending", false)):
				overflow_companies.append(str(existing.get("id", "")))


func _snapshot() -> Dictionary:
	return {
		"companies": companies,
		"eligible_items": eligible_items,
		"overflow_companies": overflow_companies,
	}


func _new_request_id(prefix: String) -> String:
	return "%s-%d-%d" % [prefix, int(Time.get_unix_time_from_system()), randi() % 100000]


func _set_loading(value: bool) -> void:
	if loading == value:
		return
	loading = value
	loading_changed.emit(loading)


func _fail(error: String) -> Dictionary:
	company_error.emit(error)
	return {"ok": false, "error": error, "data": {}}
