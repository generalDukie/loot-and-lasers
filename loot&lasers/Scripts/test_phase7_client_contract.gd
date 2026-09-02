extends SceneTree
## Phase 7 client-integration contract (Godot).
## Run: Godot --headless --path loot&lasers -s res://Scripts/test_phase7_client_contract.gd


func _init() -> void:
	var failed := 0
	failed += _check("D7 completed first is D7", _assert_d7())
	failed += _check("D2 and D9 identities", _assert_d2_d9())
	failed += _check("nine clears produce no badge", _assert_nine())
	failed += _check("ten tracks are D1–D10", _assert_all())
	failed += _check("fresh phase7_pve without dungeon blob", _assert_fresh_session())
	failed += _check("Dungeon-specific badge copy", _assert_copy())
	failed += _check("status 0 retains skip id", _assert_retain({ "ok": false, "status": 0 }))
	failed += _check("timeout code retains skip id", _assert_retain({ "ok": false, "status": 0, "code": "TIMEOUT" }))
	failed += _check("retryable flag retains skip id", _assert_retain({ "ok": false, "status": 400, "retryable": true }))
	failed += _check("408 retains skip id", _assert_retain({ "ok": false, "status": DungeonRules.HTTP_STATUS_REQUEST_TIMEOUT }))
	failed += _check("425 retains skip id", _assert_retain({ "ok": false, "status": DungeonRules.HTTP_STATUS_TOO_EARLY }))
	failed += _check("429 retains skip id", _assert_retain({ "ok": false, "status": DungeonRules.HTTP_STATUS_TOO_MANY_REQUESTS }))
	failed += _check("500 retains skip id", _assert_retain({ "ok": false, "status": 500 }))
	failed += _check("502 retains skip id", _assert_retain({ "ok": false, "status": 502 }))
	failed += _check("503 retains skip id", _assert_retain({ "ok": false, "status": 503 }))
	failed += _check("504 retains skip id", _assert_retain({ "ok": false, "status": 504 }))
	failed += _check("success clears skip id", not DungeonRules.skip_request_id_should_retain({ "ok": true, "status": 200 }))
	failed += _check("definitive 400 clears skip id", not DungeonRules.skip_request_id_should_retain({ "ok": false, "status": 400, "code": "DUNGEON_NO_COOLDOWN" }))
	failed += _check("skip IDs stay independent", _assert_skip_independence())
	failed += _check("502 then retry keeps the same ID", _assert_skip_retry_same_id())
	failed += _check("sync then character refresh keeps view", _assert_view_order(true))
	failed += _check("character then sync keeps view", _assert_view_order(false))
	failed += _check("character switch clears view and skip IDs", _assert_switch_clears())
	failed += _check("loss stays on the defeated enemy dungeon", _assert_sel_loss())
	failed += _check("non-boss win stays on the same dungeon", _assert_sel_win())
	failed += _check("boss win selects the next dungeon", _assert_sel_boss())
	failed += _check("D10 boss win without Wormhole stays on D10", _assert_sel_d10_locked())
	failed += _check("D10 boss win with Wormhole selects Wormhole", _assert_sel_d10_open())
	failed += _check("Wormhole win stays on Wormhole", _assert_sel_wormhole_win())
	failed += _check("Wormhole loss stays on Wormhole", _assert_sel_wormhole_loss())
	print("test_phase7_client_contract: %s" % ("PASS" if failed == 0 else "FAIL (%d)" % failed))
	quit(0 if failed == 0 else 1)


func _check(name: String, ok: bool) -> int:
	print("  %s %s" % ["✓" if ok else "✗", name])
	return 0 if ok else 1


func _clears_d7() -> Array:
	return [0, 0, 0, 0, 0, 0, 10, 0, 0, 0]


func _assert_d7() -> bool:
	var ids := DungeonRules.badge_ids_from_clears(_clears_d7())
	return ids.size() == 1 and str(ids[0]) == "D7"


func _assert_d2_d9() -> bool:
	var ids := DungeonRules.badge_ids_from_clears([0, 10, 0, 0, 0, 0, 0, 0, 10, 0])
	return ids.size() == 2 and str(ids[0]) == "D2" and str(ids[1]) == "D9"


func _assert_nine() -> bool:
	return DungeonRules.badge_ids_from_clears([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]).is_empty()


func _assert_all() -> bool:
	var ids := DungeonRules.badge_ids_from_clears([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
	if ids.size() != 10:
		return false
	return str(ids[0]) == "D1" and str(ids[6]) == "D7" and str(ids[9]) == "D10"


func _assert_fresh_session() -> bool:
	var character := {
		"id": "fresh-1",
		"phase7_pve": { "dungeon_clears": _clears_d7() },
	}
	var ids := DungeonRules.badge_ids_from_character(character, {})
	return ids.size() == 1 and str(ids[0]) == "D7" and DungeonRules.badge_label(7).begins_with("D7 ·")


func _assert_copy() -> bool:
	var status := DungeonRules.badge_status_text(1)
	var empty := DungeonRules.badge_empty_text()
	var desc := DungeonRules.badge_description()
	var label := DungeonRules.badge_label(7)
	if status.contains("Planet Badge") or status.contains("Frontier planet"):
		return false
	if empty.contains("spiral planet") or empty.contains("Planet Badge"):
		return false
	if not desc.contains("Dungeon"):
		return false
	return label.contains("D7") and label.contains("Ember Maw")


func _assert_retain(res: Dictionary) -> bool:
	return DungeonRules.skip_request_id_should_retain(res)


func _assert_skip_independence() -> bool:
	var state := DungeonClientState.new()
	var dungeon_id := state.begin_skip("dungeon")
	var wormhole_id := state.begin_skip("wormhole")
	if dungeon_id.is_empty() or wormhole_id.is_empty() or dungeon_id == wormhole_id:
		return false
	state.complete_skip("dungeon", { "ok": true, "status": 200 })
	return state.pending_skip_id("dungeon") == "" and state.pending_skip_id("wormhole") == wormhole_id


func _assert_skip_retry_same_id() -> bool:
	var state := DungeonClientState.new()
	var first := state.begin_skip("dungeon")
	state.complete_skip("dungeon", { "ok": false, "status": 502, "retryable": true })
	var retry := state.begin_skip("dungeon")
	return retry == first and not first.is_empty()


func _assert_view_order(sync_first: bool) -> bool:
	var state := DungeonClientState.new()
	var dungeon := { "dungeon_badge_ids": ["D7"], "dungeon_badges": 1 }
	var character := { "id": "c1" }
	if sync_first:
		state.apply_dungeon_sync("c1", dungeon)
		state.apply_character_refresh(character)
	else:
		state.apply_character_refresh(character)
		state.apply_dungeon_sync("c1", dungeon)
	var blob: Dictionary = state.blob_for(character)
	var ids: Variant = blob.get("dungeon_badge_ids", [])
	return typeof(ids) == TYPE_ARRAY and (ids as Array).size() == 1 and str((ids as Array)[0]) == "D7"


func _assert_switch_clears() -> bool:
	var state := DungeonClientState.new()
	state.apply_dungeon_sync("c1", { "dungeon_badge_ids": ["D7"] })
	state.begin_skip("dungeon")
	state.apply_character_refresh({ "id": "c2" })
	return state.blob_for({ "id": "c2" }).is_empty() and state.pending_skip_id("dungeon") == ""


func _sel(args: Dictionary) -> Dictionary:
	return DungeonRules.frontier_selection_after_combat(args)


func _assert_sel_loss() -> bool:
	var s := _sel({
		"viewing_wormhole": false,
		"won": false,
		"is_boss": false,
		"dungeon_id": 7,
		"selected_planet_id": 7,
	})
	return int(s.get("planet_id", 0)) == 7 and not bool(s.get("viewing_wormhole", true))


func _assert_sel_win() -> bool:
	var s := _sel({
		"viewing_wormhole": false,
		"won": true,
		"is_boss": false,
		"track_complete": false,
		"dungeon_id": 7,
		"selected_planet_id": 7,
	})
	return int(s.get("planet_id", 0)) == 7 and not bool(s.get("viewing_wormhole", true))


func _assert_sel_boss() -> bool:
	var s := _sel({
		"viewing_wormhole": false,
		"won": true,
		"is_boss": true,
		"track_complete": true,
		"dungeon_id": 7,
		"selected_planet_id": 7,
	})
	return int(s.get("planet_id", 0)) == 8 and not bool(s.get("viewing_wormhole", true))


func _assert_sel_d10_locked() -> bool:
	var s := _sel({
		"viewing_wormhole": false,
		"won": true,
		"is_boss": true,
		"track_complete": true,
		"dungeon_id": DungeonRules.STATIC_PLANET_COUNT,
		"wormhole_unlocked": false,
	})
	return int(s.get("planet_id", 0)) == DungeonRules.STATIC_PLANET_COUNT and not bool(s.get("viewing_wormhole", true))


func _assert_sel_d10_open() -> bool:
	var s := _sel({
		"viewing_wormhole": false,
		"won": true,
		"is_boss": true,
		"track_complete": true,
		"dungeon_id": DungeonRules.STATIC_PLANET_COUNT,
		"wormhole_unlocked": true,
		"wormhole_band": 2,
	})
	return int(s.get("planet_id", 0)) == DungeonRules.wormhole_planet_id(2) and bool(s.get("viewing_wormhole", false))


func _assert_sel_wormhole_win() -> bool:
	var s := _sel({
		"viewing_wormhole": true,
		"content": DungeonRules.WORMHOLE_ID,
		"won": true,
		"is_boss": true,
		"wormhole_band": 3,
	})
	return int(s.get("planet_id", 0)) == DungeonRules.wormhole_planet_id(3) and bool(s.get("viewing_wormhole", false))


func _assert_sel_wormhole_loss() -> bool:
	var s := _sel({
		"viewing_wormhole": true,
		"content": DungeonRules.WORMHOLE_ID,
		"won": false,
		"wormhole_band": 1,
	})
	return int(s.get("planet_id", 0)) == DungeonRules.wormhole_planet_id(1) and bool(s.get("viewing_wormhole", false))
