extends Node
## Dissolve gear + pending loot claim/dissolve + bag-pressure prompts.

signal pressure_resolved

var pending_loot: Array = []


func _ready() -> void:
	print("[InventoryManager] ready")


func bag_cap(character: Dictionary = {}) -> int:
	var ch: Dictionary = character if not character.is_empty() else GameManager.active_character
	return InventoryRules.bag_cap(ch)


## Live bag occupancy (unequipped items). Returns -1 on fetch failure.
func bag_occupancy() -> int:
	var items_res: Dictionary = await AuthManager.list_items()
	if not items_res.ok or typeof(items_res.data) != TYPE_ARRAY:
		return -1
	return InventoryRules.bag_occupancy(items_res.data)


func is_bag_full() -> bool:
	var n := await bag_occupancy()
	if n < 0:
		return false
	return n >= bag_cap()


## Blocking recovery dialog.
## Returns: "ready" (already had space), "inventory", "dissolved", or "cancel".
func prompt_bag_pressure(host: Node, reason: String = "Inventory full") -> String:
	if host == null or not is_instance_valid(host):
		return "cancel"
	var n := await bag_occupancy()
	var cap := bag_cap()
	if n >= 0 and n < cap:
		return "ready"

	await list_pending_loot()
	var pending_n := pending_loot.size()
	var dlg := AcceptDialog.new()
	dlg.title = "Inventory Full"
	dlg.dialog_text = "%s\nBag %s/%s%s\nDissolve junk or open Inventory to free a slot." % [
		reason,
		str(n if n >= 0 else "?"),
		str(cap),
		(" · %s pending loot" % pending_n) if pending_n > 0 else "",
	]
	dlg.ok_button_text = "Open Inventory"
	dlg.add_button("Dissolve Junk", true, "dissolve")
	dlg.add_cancel_button("Cancel")
	host.add_child(dlg)
	dlg.popup_centered()

	var choice := await _await_pressure_choice(dlg)
	if is_instance_valid(dlg):
		dlg.queue_free()
	match choice:
		"inventory":
			GameManager.go_inventory()
			return "inventory"
		"dissolve":
			var items_res: Dictionary = await AuthManager.list_items()
			var items: Array = items_res.data if items_res.ok and typeof(items_res.data) == TYPE_ARRAY else []
			var junk: Array = InventoryRules.list_junk_ids(items)
			if junk.is_empty():
				GameManager.go_inventory()
				return "inventory"
			var res: Dictionary = await dissolve_junk(junk)
			pressure_resolved.emit()
			return "dissolved" if res.ok else "cancel"
		_:
			return "cancel"


func _await_pressure_choice(dlg: AcceptDialog) -> String:
	var out: Array = [""]
	var finish := func(v: String) -> void:
		if str(out[0]).is_empty():
			out[0] = v
		if is_instance_valid(dlg) and dlg.visible:
			dlg.hide()
	dlg.confirmed.connect(func() -> void: finish.call("inventory"))
	dlg.custom_action.connect(func(action: StringName) -> void: finish.call(str(action)))
	dlg.canceled.connect(func() -> void: finish.call("cancel"))
	dlg.close_requested.connect(func() -> void: finish.call("cancel"))
	while str(out[0]).is_empty() and is_instance_valid(dlg):
		await dlg.get_tree().process_frame
	return str(out[0]) if not str(out[0]).is_empty() else "cancel"


func set_locked(item_id: String, locked: bool) -> Dictionary:
	if item_id.is_empty():
		return {"ok": false, "error": "Missing item_id", "data": {}}
	return await AuthManager.patch_item(item_id, {"locked": locked})


func dissolve_item(item_id: String) -> Dictionary:
	if item_id.is_empty():
		return {"ok": false, "error": "Missing item_id", "data": {}}
	var res: Dictionary = await ApiClient.invoke("DissolveItem", {"item_id": item_id})
	_apply_character(res)
	if res.ok:
		await try_claim_pending()
	return res


func dissolve_junk(item_ids: Array) -> Dictionary:
	if item_ids.is_empty():
		return {"ok": false, "error": "No items", "data": {}}
	var res: Dictionary = await ApiClient.invoke("DissolveJunk", {"item_ids": item_ids})
	_apply_character(res)
	if res.ok:
		await try_claim_pending()
	return res


func list_pending_loot() -> Array:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		pending_loot = []
		return pending_loot
	var res: Dictionary = await ApiClient.request(
		"GET",
		"/api/rewards/pending-loot?characterId=%s" % cid.uri_encode(),
		null,
		true
	)
	pending_loot = []
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var arr: Variant = res.data.get("pending_loot", [])
		if typeof(arr) == TYPE_ARRAY:
			pending_loot = arr
	return pending_loot


func accept_pending(pending_id: String) -> Dictionary:
	if pending_id.is_empty():
		return {"ok": false, "error": "Missing pending_loot_id", "data": {}}
	var res: Dictionary = await ApiClient.invoke("AcceptPendingLoot", {"pending_loot_id": pending_id})
	_apply_character(res)
	await list_pending_loot()
	return res


func dissolve_pending(pending_id: String) -> Dictionary:
	if pending_id.is_empty():
		return {"ok": false, "error": "Missing pending_loot_id", "data": {}}
	var res: Dictionary = await ApiClient.invoke("DissolvePendingLoot", {"pending_loot_id": pending_id})
	_apply_character(res)
	await list_pending_loot()
	return res


## After freeing a bag slot, accept the oldest pending loot if space allows.
func try_claim_pending() -> Dictionary:
	await list_pending_loot()
	if pending_loot.is_empty():
		return {"ok": true, "claimed": false}
	var items_res: Dictionary = await AuthManager.list_items()
	var items: Array = items_res.data if items_res.ok and typeof(items_res.data) == TYPE_ARRAY else []
	var bag_n := InventoryRules.bag_occupancy(items)
	var cap := bag_cap()
	if bag_n >= cap:
		return {"ok": true, "claimed": false, "reason": "still_full"}
	var first: Variant = pending_loot[0]
	if typeof(first) != TYPE_DICTIONARY:
		return {"ok": false, "error": "Bad pending row"}
	var pid := str(first.get("id", ""))
	var res: Dictionary = await accept_pending(pid)
	if res.ok:
		return {"ok": true, "claimed": true, "pending_loot_id": pid, "data": res.get("data", {})}
	return res


func _apply_character(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
