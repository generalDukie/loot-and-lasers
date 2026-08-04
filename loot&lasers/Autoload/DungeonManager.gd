extends Node
## Galactic Frontier dungeon crawl — SyncDungeonState / FinishDungeonBattle.

signal state_changed

var selected_planet_id: int = 1
var viewing_wormhole := false
var patrol := false
var pending_enemy: Dictionary = {}
var pending_battle: Dictionary = {}
var pending_player_items: Array = []
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
	last_finish = {}


func active_char() -> Dictionary:
	return GameManager.active_character


func sync_state() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("SyncDungeonState", {})
	_apply(res)
	state_changed.emit()
	return res


func skip_cooldown() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("SkipDungeonCooldown", {})
	_apply(res)
	state_changed.emit()
	return res


func pay_continue() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("PayDungeonContinue", {})
	_apply(res)
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


func needs_continue_fee() -> bool:
	return DungeonRules.free_lives_left(active_char()) <= 0


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
	if needs_continue_fee():
		var paid: Dictionary = await pay_continue()
		if not paid.ok:
			return paid
	pending_enemy = DungeonRules.generate_enemy(planet, enemy_idx)
	pending_player_items = await _load_equipped()
	pending_battle = MissionCombat.simulate_battle(active_char(), pending_enemy, pending_player_items, [])
	return {"ok": true, "enemy": pending_enemy, "battle": pending_battle}


func finish_battle() -> Dictionary:
	if pending_battle.is_empty() or pending_enemy.is_empty():
		return {"ok": false, "error": "No pending battle"}
	var won := str(pending_battle.get("winner", "")) == "player"
	var max_hit := 0
	for ev in pending_battle.get("events", []):
		if typeof(ev) != TYPE_DICTIONARY:
			continue
		if str(ev.get("attacker", "")) == "player":
			max_hit = maxi(max_hit, int(ev.get("damage", 0)))
	var body := {
		"won": won,
		"planet_id": selected_planet_id,
		"enemy_index": _enemy_index_for_finish(),
		"patrol": patrol,
		"viewing_wormhole": viewing_wormhole,
		"species_id": pending_enemy.get("speciesId", 1),
		"max_hit": max_hit,
	}
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
	state_changed.emit()
	return res


func _enemy_index_for_finish() -> int:
	if pending_enemy.is_empty():
		return current_enemy_index()
	var id := str(pending_enemy.get("id", ""))
	var parts := id.split("-")
	if parts.size() >= 3:
		return clampi(int(parts[2]), 1, DungeonRules.ENEMIES_PER_PLANET)
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
