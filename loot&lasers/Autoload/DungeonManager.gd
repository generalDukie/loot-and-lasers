extends Node
## Galactic Frontier dungeon crawl — SyncDungeonState / FinishDungeonBattle.

signal state_changed

var selected_planet_id: int = 1
var viewing_wormhole := false
var patrol := false
var pending_enemy: Dictionary = {}
var pending_battle: Dictionary = {}
var pending_player_items: Array = []
var pending_enemy_index: int = 1
var last_finish: Dictionary = {}


func _ready() -> void:
	print("[DungeonManager] ready")


func clear_local() -> void:
	selected_planet_id = 1
	viewing_wormhole = false
	patrol = false
	pending_enemy = {}
	pending_battle = {}
	pending_player_items = []
	pending_enemy_index = 1
	last_finish = {}


func active_char() -> Dictionary:
	return GameManager.active_character


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


func skip_cooldown() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("SkipDungeonCooldown", {})
	_apply(res)
	_apply_dungeon_blob(res)
	state_changed.emit()
	return res


func current_planet_id() -> int:
	return maxi(1, int(active_char().get("dungeon_planet", 1)))


func current_enemy_index() -> int:
	return clampi(int(active_char().get("dungeon_enemy", 1)), 1, DungeonRules.ENEMIES_PER_PLANET)


func highest_cleared() -> int:
	# dungeon_planet advances on boss clear; clears track progress.
	return maxi(0, current_planet_id() - 1)


func can_enter_story(planet_id: int) -> Dictionary:
	var c := active_char()
	var level := int(c.get("level", 1))
	if not DungeonRules.is_unlocked(planet_id, level):
		return {"ok": false, "error": "Requires level %s" % DungeonRules.unlock_level(planet_id)}
	if planet_id > current_planet_id():
		return {"ok": false, "error": "Clear earlier worlds first"}
	return {"ok": true}


func select_planet(planet_id: int, as_patrol: bool = false, wormhole: bool = false) -> void:
	selected_planet_id = planet_id
	patrol = as_patrol
	viewing_wormhole = wormhole
	state_changed.emit()


func cooldown_ms() -> int:
	return DungeonRules.cooldown_remaining_ms(active_char())


func prepare_fight() -> Dictionary:
	var planet: Dictionary = DungeonRules.get_planet(selected_planet_id)
	var enemy_idx := current_enemy_index()
	if patrol:
		# Cleared-world patrols mirror web behavior: random regular foe with a
		# 10% chance to rematch that world's boss.
		var rng := RandomNumberGenerator.new()
		rng.randomize()
		enemy_idx = DungeonRules.ENEMIES_PER_PLANET if rng.randf() < 0.1 else rng.randi_range(1, DungeonRules.ENEMIES_PER_PLANET - 1)
	elif viewing_wormhole:
		enemy_idx = current_enemy_index()
	elif selected_planet_id != current_planet_id():
		return {"ok": false, "error": "Not your active frontier world"}
	var gate := can_enter_story(selected_planet_id) if not viewing_wormhole and not patrol else {"ok": true}
	if not bool(gate.get("ok", false)) and not patrol and not viewing_wormhole:
		return gate
	if cooldown_ms() > 0:
		return {"ok": false, "error": "On cooldown (%s)" % DungeonRules.format_ms(cooldown_ms())}

	var body := {
		"planet_id": selected_planet_id,
		"enemy_index": enemy_idx,
		"patrol": patrol,
		"viewing_wormhole": viewing_wormhole,
	}
	var res: Dictionary = await GameApiClient.invoke("PrepareDungeonCombat", body)
	if not res.ok:
		return {"ok": false, "error": str(res.get("error", "PrepareDungeonCombat failed"))}
	var payload: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	pending_enemy = payload.get("enemy", {}) if typeof(payload.get("enemy", {})) == TYPE_DICTIONARY else {}
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
	pending_battle = battle
	pending_player_items = []
	pending_enemy_index = int(payload.get("enemy_index", enemy_idx))
	var cid := str(payload.get("combat_id", ""))
	if not cid.is_empty():
		pending_battle["combat_id"] = cid
	if typeof(payload.get("dungeon", null)) == TYPE_DICTIONARY:
		var dungeon: Dictionary = payload.dungeon
		for k in ["dungeon_cooldown_until", "dungeon_cooldown_at", "dungeon_cooldown_ms", "dungeon_continue_credit"]:
			if dungeon.has(k):
				GameManager.active_character[k] = dungeon[k]
		GameManager.active_character["pending_combat_id"] = dungeon.get("pending_combat_id", cid)
	if typeof(payload.get("character", null)) == TYPE_DICTIONARY:
		GameManager.apply_active_character(payload.character, "dungeon_prepare")
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
		"patrol": patrol,
		"viewing_wormhole": viewing_wormhole,
	}
	if not combat_id.is_empty():
		body["combat_id"] = combat_id
	var res: Dictionary = await GameApiClient.invoke("FinishDungeonBattle", body)
	_apply(res)
	last_finish = res.data if res.ok and typeof(res.data) == TYPE_DICTIONARY else {}
	if res.ok:
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
	var dungeon: Dictionary = data.dungeon
	for k in [
		"dungeon_planet", "dungeon_enemy", "dungeon_deaths", "dungeon_deaths_date",
		"dungeon_clears", "dungeon_nodes_cleared", "dungeon_continue_credit",
		"dungeon_cooldown_until", "dungeon_cooldown_at", "dungeon_cooldown_ms",
	]:
		if dungeon.has(k):
			GameManager.active_character[k] = dungeon[k]
	GameManager.active_character["pending_combat_id"] = dungeon.get("pending_combat_id", "")
	GameManager.active_character["dungeon"] = dungeon
