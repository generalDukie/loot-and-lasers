extends Node
## Galactic Frontier dungeon crawl — SyncDungeonState / FinishDungeonBattle.

signal state_changed

var selected_planet_id: int = 1
var viewing_wormhole := false
var pending_enemy: Dictionary = {}
var pending_battle: Dictionary = {}
var pending_player_items: Array = []
var pending_enemy_index: int = 1
var last_finish: Dictionary = {}
var _post_combat_selection_pending := false
var _client := DungeonClientState.new()
var _cd_dungeon_remaining_at_sync := 0
var _cd_dungeon_sync_ticks := 0
var _cd_wormhole_remaining_at_sync := 0
var _cd_wormhole_sync_ticks := 0


func _ready() -> void:
	print("[DungeonManager] ready")
	if GameManager != null and not GameManager.active_character_changed.is_connected(_on_active_character_changed):
		GameManager.active_character_changed.connect(_on_active_character_changed)


func clear_local() -> void:
	selected_planet_id = 1
	viewing_wormhole = false
	pending_enemy = {}
	pending_battle = {}
	pending_player_items = []
	pending_enemy_index = 1
	last_finish = {}
	_post_combat_selection_pending = false
	_client.clear()
	_cd_dungeon_remaining_at_sync = 0
	_cd_dungeon_sync_ticks = 0
	_cd_wormhole_remaining_at_sync = 0
	_cd_wormhole_sync_ticks = 0
	state_changed.emit()


func _on_active_character_changed(character: Dictionary, _source: String) -> void:
	var cid := str(character.get("id", "")).strip_edges()
	if cid.is_empty():
		clear_local()
		return
	if not _client.character_id.is_empty() and _client.character_id != cid:
		clear_local()
	_client.apply_character_refresh(character)


func active_char() -> Dictionary:
	return GameManager.active_character


func live_character_id() -> String:
	return str(active_char().get("id", "")).strip_edges()


func sync_state() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("SyncDungeonState", {})
	_apply(res)
	_apply_dungeon_blob(res)
	state_changed.emit()
	return res


func refresh_status() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetDungeonStatus", {})
	_apply(res)
	_apply_dungeon_blob(res)
	state_changed.emit()
	return res


func reassert_view() -> void:
	state_changed.emit()


func dungeon_blob() -> Dictionary:
	return _client.blob_for(active_char())


func track(planet_id: int) -> Dictionary:
	var tracks: Variant = dungeon_blob().get("tracks", [])
	if typeof(tracks) != TYPE_ARRAY:
		return {}
	var idx := planet_id - 1
	if idx < 0 or idx >= (tracks as Array).size():
		return {}
	var row: Variant = (tracks as Array)[idx]
	return row if typeof(row) == TYPE_DICTIONARY else {}


func wormhole_state() -> Dictionary:
	var v: Variant = dungeon_blob().get("wormhole", {})
	return v if typeof(v) == TYPE_DICTIONARY else {}


func wormhole_unlocked() -> bool:
	return bool(wormhole_state().get("unlocked", false))


func standard_clears() -> int:
	return DungeonRules.as_int(dungeon_blob().get("standard_clears", 0))


func pending_settlement() -> Dictionary:
	var v: Variant = dungeon_blob().get("pending_settlement", {})
	if typeof(v) == TYPE_DICTIONARY and not (v as Dictionary).is_empty():
		return v
	return {}


func skip_cooldown(kind: String = "") -> Dictionary:
	var selector := kind
	if selector.is_empty():
		selector = "wormhole" if viewing_wormhole else "dungeon"
	var request_id := _client.begin_skip(selector)
	var res: Dictionary = await GameApiClient.invoke("SkipDungeonCooldown", {
		"cooldown": selector,
		"request_id": request_id,
	})
	_client.complete_skip(selector, res)
	if res.ok:
		_apply(res)
		_apply_dungeon_blob(res)
	state_changed.emit()
	return res


func claim_pending_settlement() -> Dictionary:
	var body := {}
	var pending := pending_settlement()
	if not str(pending.get("combat_id", "")).is_empty():
		body["combat_id"] = str(pending.get("combat_id", ""))
	var res: Dictionary = await GameApiClient.invoke("ClaimPhase7Settlement", body)
	_apply(res)
	_apply_dungeon_blob(res)
	if res.ok:
		var items: Variant = res.data.get("items", []) if typeof(res.data) == TYPE_DICTIONARY else []
		if typeof(items) == TYPE_ARRAY and (items as Array).size() > 0:
			GameManager.remember_loot_from_claim({"items": items})
	state_changed.emit()
	return res


func current_planet_id() -> int:
	var blob := dungeon_blob()
	if blob.has("dungeon_planet"):
		return maxi(1, DungeonRules.as_int(blob.get("dungeon_planet", 1), 1))
	return maxi(1, DungeonRules.as_int(active_char().get("dungeon_planet", 1), 1))


func current_enemy_index() -> int:
	if viewing_wormhole:
		return clampi(DungeonRules.as_int(wormhole_state().get("enemy", 1), 1), 1, DungeonRules.ENEMIES_PER_PLANET)
	var t := track(selected_planet_id)
	if not t.is_empty() and t.get("next_enemy", null) != null:
		return clampi(DungeonRules.as_int(t.get("next_enemy", 1), 1), 1, DungeonRules.ENEMIES_PER_PLANET)
	return clampi(DungeonRules.as_int(active_char().get("dungeon_enemy", 1), 1), 1, DungeonRules.ENEMIES_PER_PLANET)


func highest_cleared() -> int:
	return standard_clears()


func can_enter_story(planet_id: int) -> Dictionary:
	var t := track(planet_id)
	if t.is_empty():
		var level := int(active_char().get("level", 1))
		if not DungeonRules.is_unlocked(planet_id, level):
			return {"ok": false, "error": "Requires level %s" % DungeonRules.unlock_level(planet_id)}
		return {"ok": true}
	if not bool(t.get("unlocked", false)):
		return {"ok": false, "error": "Requires level %s" % int(t.get("unlock_level", DungeonRules.unlock_level(planet_id)))}
	if bool(t.get("complete", false)):
		return {"ok": false, "error": "Dungeon complete"}
	return {"ok": true}


func select_planet(planet_id: int, wormhole: bool = false) -> void:
	selected_planet_id = planet_id
	viewing_wormhole = wormhole
	state_changed.emit()


func select_wormhole() -> void:
	var band := maxi(
		DungeonRules.DUNGEON_DISPLAY_ID_ONE,
		DungeonRules.as_int(wormhole_state().get("band", DungeonRules.DUNGEON_DISPLAY_ID_ONE), DungeonRules.DUNGEON_DISPLAY_ID_ONE),
	)
	select_planet(DungeonRules.wormhole_planet_id(band), true)


func consume_post_combat_selection() -> bool:
	if not _post_combat_selection_pending:
		return false
	_post_combat_selection_pending = false
	return true


func apply_selection_after_combat() -> void:
	var enemy: Dictionary = {}
	if typeof(last_finish.get("enemy", null)) == TYPE_DICTIONARY:
		enemy = last_finish.get("enemy")
	var rewards: Dictionary = {}
	if typeof(last_finish.get("rewards", null)) == TYPE_DICTIONARY:
		rewards = last_finish.get("rewards")
	var dungeon_id := DungeonRules.as_int(enemy.get("dungeon_id", selected_planet_id), selected_planet_id)
	var t := track(dungeon_id)
	var choice := DungeonRules.frontier_selection_after_combat({
		"viewing_wormhole": viewing_wormhole,
		"content": str(enemy.get("content", "")),
		"won": bool(last_finish.get("won", false)),
		"is_boss": bool(enemy.get("is_boss", false)) or bool(rewards.get("isBoss", false)),
		"track_complete": bool(t.get("complete", false)),
		"dungeon_id": dungeon_id,
		"selected_planet_id": selected_planet_id,
		"wormhole_unlocked": wormhole_unlocked(),
		"wormhole_band": wormhole_state().get("band", DungeonRules.DUNGEON_DISPLAY_ID_ONE),
	})
	select_planet(
		DungeonRules.as_int(choice.get("planet_id"), selected_planet_id),
		bool(choice.get("viewing_wormhole", false)),
	)


func cooldown_ms(kind: String = "") -> int:
	var selector := kind
	if selector.is_empty():
		selector = "wormhole" if viewing_wormhole else "dungeon"
	var now_ticks := Time.get_ticks_msec()
	if selector == "wormhole":
		return DungeonRules.displayed_remaining_ms(
			_cd_wormhole_remaining_at_sync,
			now_ticks - _cd_wormhole_sync_ticks,
		)
	return DungeonRules.displayed_remaining_ms(
		_cd_dungeon_remaining_at_sync,
		now_ticks - _cd_dungeon_sync_ticks,
	)


func prepare_fight() -> Dictionary:
	if not pending_settlement().is_empty() and bool(pending_settlement().get("has_gear", false)):
		return {"ok": false, "error": "Recover pending Dungeon Gear before starting another fight"}
	var planet: Dictionary = DungeonRules.get_planet(selected_planet_id)
	if viewing_wormhole:
		if not wormhole_unlocked():
			return {"ok": false, "error": "Clear all 100 standard Dungeon enemies to open the Wormhole"}
	else:
		var gate := can_enter_story(selected_planet_id)
		if not bool(gate.get("ok", false)):
			return gate
	if cooldown_ms() > 0:
		return {"ok": false, "error": "On cooldown (%s)" % DungeonRules.format_ms(cooldown_ms())}

	var body := {}
	if viewing_wormhole:
		body["viewing_wormhole"] = true
		body["dungeon_id"] = "wormhole"
	else:
		body["dungeon_id"] = selected_planet_id
	var res: Dictionary = await GameApiClient.invoke("PrepareDungeonCombat", body)
	if not res.ok:
		return {"ok": false, "error": str(res.get("error", "PrepareDungeonCombat failed"))}
	var payload: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	pending_enemy = payload.get("enemy", {}) if typeof(payload.get("enemy", {})) == TYPE_DICTIONARY else {}
	var combat_wrap: Variant = payload.get("combat", null)
	if typeof(combat_wrap) == TYPE_DICTIONARY:
		var c_enemy: Variant = (combat_wrap as Dictionary).get("enemy", null)
		if typeof(c_enemy) == TYPE_DICTIONARY and not (c_enemy as Dictionary).is_empty():
			if pending_enemy.is_empty():
				pending_enemy = (c_enemy as Dictionary).duplicate(true)
			else:
				pending_enemy.merge(c_enemy, true)
	# Fallback display name if summary is thin.
	if pending_enemy.is_empty() and not planet.is_empty():
		pending_enemy = {"name": "Frontier Foe", "level": 1}
	var battle: Dictionary = payload.get("battle", {}) if typeof(payload.get("battle", {})) == TYPE_DICTIONARY else {}
	if battle.is_empty() and typeof(payload.get("events", null)) == TYPE_ARRAY:
		battle = {
			"winner": payload.get("winner", ""),
			"events": payload.get("events", []),
			"playerMaxHp": payload.get("playerMaxHp", 0),
			"opponentMaxHp": payload.get("opponentMaxHp", 0),
			"initiativeFirstSide": payload.get("opening_side", ""),
			"playerEnd": payload.get("playerEnd", {}),
			"opponentEnd": payload.get("opponentEnd", {}),
		}
	pending_battle = _normalize_battle_for_ui(battle)
	var pds: Variant = payload.get("player_display_stats", battle.get("player_display_stats", null))
	if typeof(pds) != TYPE_DICTIONARY and typeof(combat_wrap) == TYPE_DICTIONARY:
		pds = (combat_wrap as Dictionary).get("player_display_stats", null)
	if typeof(pds) == TYPE_DICTIONARY:
		pending_battle["player_display_stats"] = (pds as Dictionary).duplicate(true)
	pending_player_items = StatsManager.equipped_items.duplicate(true) \
		if typeof(StatsManager.equipped_items) == TYPE_ARRAY and not StatsManager.equipped_items.is_empty() \
		else await _load_equipped()
	pending_enemy_index = int(payload.get("enemy_index", current_enemy_index()))
	var cid := str(payload.get("combat_id", ""))
	if not cid.is_empty():
		pending_battle["combat_id"] = cid
	if typeof(payload.get("character", null)) == TYPE_DICTIONARY:
		GameManager.apply_active_character(payload.character, "dungeon_prepare")
	if typeof(payload.get("dungeon", null)) == TYPE_DICTIONARY:
		_store_dungeon_view(payload.dungeon, str(payload.get("combat_id", "")))
	return {"ok": true, "enemy": pending_enemy, "battle": pending_battle, "combat_id": cid}


func finish_battle() -> Dictionary:
	if pending_battle.is_empty():
		return {"ok": false, "error": "No pending battle"}
	# Settlement uses committed Node combat; body.won is ignored server-side.
	var combat_id := str(pending_battle.get("combat_id", ""))
	if combat_id.is_empty():
		combat_id = str(GameManager.active_character.get("pending_combat_id", ""))
	var body := {
		"planet_id": selected_planet_id,
		"enemy_index": pending_enemy_index if pending_enemy_index > 0 else _enemy_index_for_finish(),
		"viewing_wormhole": viewing_wormhole,
	}
	if not combat_id.is_empty():
		body["combat_id"] = combat_id
	var res: Dictionary = await GameApiClient.invoke("FinishDungeonBattle", body)
	_apply(res)
	last_finish = res.data if res.ok and typeof(res.data) == TYPE_DICTIONARY else {}
	if res.ok:
		_post_combat_selection_pending = true
		if not last_finish.has("won"):
			last_finish["won"] = str(pending_battle.get("winner", "opponent")) == "player"
		var items: Variant = last_finish.get("items", [])
		if typeof(items) == TYPE_ARRAY and (items as Array).size() > 0:
			GameManager.remember_loot_from_claim({"items": items})
	pending_enemy = {}
	pending_battle = {}
	pending_player_items = []
	pending_enemy_index = 1
	state_changed.emit()
	return res


func _enemy_index_for_finish() -> int:
	if pending_enemy.is_empty():
		return current_enemy_index()
	var id := str(pending_enemy.get("id", ""))
	var parts := id.split("-")
	if parts.size() >= 3:
		return clampi(int(parts[2]), 1, DungeonRules.ENEMIES_PER_PLANET)
	# Prefer meta from prepare response enemy_index if present on pending battle path.
	return current_enemy_index()


func _load_equipped() -> Array:
	var cid := str(active_char().get("id", ""))
	if cid.is_empty():
		return []
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Item/filter",
		{"query": {"character_id": cid, "is_equipped": true}, "limit": 20}, true
	)
	return res.data if res.ok and typeof(res.data) == TYPE_ARRAY else []


## Flatten Node combat payload so Skip / HP bars can read EndHp the same way as arena.
func _normalize_battle_for_ui(battle: Dictionary) -> Dictionary:
	if battle.is_empty():
		return {}
	var player_end: Dictionary = {}
	var opp_end: Dictionary = {}
	if typeof(battle.get("playerEnd", null)) == TYPE_DICTIONARY:
		player_end = battle["playerEnd"]
	if typeof(battle.get("opponentEnd", null)) == TYPE_DICTIONARY:
		opp_end = battle["opponentEnd"]
	var out := battle.duplicate(true)
	if not out.has("playerEndHp") and player_end.has("hp"):
		out["playerEndHp"] = int(player_end.get("hp", 0))
	if not out.has("opponentEndHp") and opp_end.has("hp"):
		out["opponentEndHp"] = int(opp_end.get("hp", 0))
	out["playerMaxHp"] = int(out.get("playerMaxHp", 0))
	out["opponentMaxHp"] = int(out.get("opponentMaxHp", 0))
	return out


func _apply(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.apply_active_character_patch(patch, "dungeon_mutation")
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.apply_active_character(ch, "dungeon_mutation")
	_apply_dungeon_blob(res)


func _apply_dungeon_blob(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	if typeof(data.get("dungeon", null)) != TYPE_DICTIONARY:
		return
	_store_dungeon_view(data.dungeon, str(data.get("combat_id", "")))


func _store_dungeon_view(dungeon: Dictionary, combat_id: String = "") -> void:
	_client.apply_dungeon_sync(live_character_id(), dungeon)
	for k in [
		"dungeon_planet", "dungeon_enemy", "dungeon_deaths", "dungeon_deaths_date",
		"dungeon_clears", "dungeon_nodes_cleared", "dungeon_continue_credit",
		"dungeon_cooldown_until", "dungeon_cooldown_at", "dungeon_cooldown_ms",
		"wormhole_cooldown_until",
	]:
		if dungeon.has(k):
			GameManager.active_character[k] = dungeon[k]
	var pending_id := str(dungeon.get("pending_combat_id", combat_id))
	if not pending_id.is_empty():
		GameManager.active_character["pending_combat_id"] = pending_id
	_capture_cooldowns(dungeon)


func _capture_cooldowns(dungeon: Dictionary) -> void:
	var now_ticks := Time.get_ticks_msec()
	_cd_dungeon_remaining_at_sync = maxi(0, DungeonRules.as_int(dungeon.get("dungeon_cooldown_remaining_ms", 0)))
	_cd_dungeon_sync_ticks = now_ticks
	_cd_wormhole_remaining_at_sync = maxi(0, DungeonRules.as_int(dungeon.get("wormhole_cooldown_remaining_ms", 0)))
	_cd_wormhole_sync_ticks = now_ticks
