extends Node
## Guild wars — DeclareGuildWar + ready toggle + client gauntlet resolve.

const DECLARE_COST := 5000


func _ready() -> void:
	print("[GuildWarManager] ready")


func list_wars(guild_id: String) -> Array:
	if guild_id.is_empty():
		return []
	var atk: Dictionary = await ApiClient.request(
		"POST", "/api/entities/GuildWar/filter",
		{"query": {"attacker_guild_id": guild_id}, "sort": "-declared_at", "limit": 20}, true
	)
	var def: Dictionary = await ApiClient.request(
		"POST", "/api/entities/GuildWar/filter",
		{"query": {"defender_guild_id": guild_id}, "sort": "-declared_at", "limit": 20}, true
	)
	var seen := {}
	var out: Array = []
	for arr in [atk.data if atk.ok else [], def.data if def.ok else []]:
		if typeof(arr) != TYPE_ARRAY:
			continue
		for w in arr:
			if typeof(w) != TYPE_DICTIONARY:
				continue
			var wid := str(w.get("id", ""))
			if wid.is_empty() or seen.has(wid):
				continue
			seen[wid] = true
			out.append(w)
	out.sort_custom(func(a, b):
		return str(a.get("declared_at", "")) > str(b.get("declared_at", ""))
	)
	return out


func declare_war(defender_guild_id: String) -> Dictionary:
	var res: Dictionary = await ApiClient.invoke("DeclareGuildWar", {
		"defender_guild_id": defender_guild_id,
	})
	if res.ok:
		var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
		var patch: Variant = data.get("patch", {})
		if typeof(patch) == TYPE_DICTIONARY:
			GameManager.active_character.merge(patch, true)
		var ch: Variant = data.get("character", {})
		if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
			GameManager.active_character = ch
	return res


func list_readies(war_id: String) -> Array:
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entities/GuildWarReady/filter",
		{"query": {"war_id": war_id}, "limit": 100}, true
	)
	return res.data if res.ok and typeof(res.data) == TYPE_ARRAY else []


func my_ready(war_id: String) -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	for r in await list_readies(war_id):
		if typeof(r) == TYPE_DICTIONARY and str(r.get("character_id", "")) == cid:
			return r
	return {}


func toggle_ready(war: Dictionary) -> Dictionary:
	var membership: Dictionary = SocialManager.my_membership
	var cid := str(GameManager.active_character.get("id", ""))
	var existing: Dictionary = await my_ready(str(war.get("id", "")))
	if not existing.is_empty():
		var del: Dictionary = await ApiClient.request(
			"DELETE", "/api/entities/GuildWarReady/%s" % str(existing.get("id", "")).uri_encode(),
			null, true
		)
		return {"ok": del.ok, "ready": false, "error": del.get("error", "")}
	var side := "attacker" if str(war.get("attacker_guild_id", "")) == str(membership.get("guild_id", "")) else "defender"
	var create: Dictionary = await ApiClient.request("POST", "/api/entities/GuildWarReady", {
		"war_id": str(war.get("id", "")),
		"guild_id": str(membership.get("guild_id", "")),
		"character_id": cid,
		"character_name": str(GameManager.active_character.get("name", "")),
		"character_level": int(GameManager.active_character.get("level", 1)),
		"side": side,
	}, true)
	return {"ok": create.ok, "ready": create.ok, "error": create.get("error", "")}


func is_deadline_passed(war: Dictionary) -> bool:
	var deadline := str(war.get("ready_deadline", ""))
	if deadline.is_empty():
		return false
	var cleaned := deadline.replace("Z", "").replace("z", "")
	var dict := Time.get_datetime_dict_from_datetime_string(cleaned, false)
	if dict.is_empty():
		return false
	var end := float(Time.get_unix_time_from_datetime_dict(dict))
	return Time.get_unix_time_from_system() >= end


func resolve_war(war: Dictionary) -> Dictionary:
	if str(war.get("status", "")) != "readying":
		return {"ok": false, "error": "War is not in readying state"}
	if not is_deadline_passed(war):
		return {"ok": false, "error": "Ready window still open"}
	var attackers: Array = await _load_fighters(str(war.get("id", "")), "attacker")
	var defenders: Array = await _load_fighters(str(war.get("id", "")), "defender")
	var winner := "defender"
	var duels: Array = []
	if defenders.is_empty():
		winner = "attacker"
	elif attackers.is_empty():
		winner = "defender"
	else:
		var g := _simulate_gauntlet(attackers, defenders)
		winner = str(g.get("winner", "defender"))
		duels = g.get("duels", [])
	var total := attackers.size() + defenders.size()
	var base := (80 + total * 15) * 10
	var rewards := {"stardust": base, "guild_xp": int(round(float(base) * 0.8))}
	var now := Time.get_datetime_string_from_system(true)
	var patch_war: Dictionary = await ApiClient.request(
		"PATCH", "/api/entities/GuildWar/%s" % str(war.get("id", "")).uri_encode(),
		{
			"status": "completed",
			"winner_side": winner,
			"battle_log": duels,
			"resolved_at": now,
			"attacker_ready_count": attackers.size(),
			"defender_ready_count": defenders.size(),
			"reward_stardust": rewards.stardust,
			"reward_guild_xp": rewards.guild_xp,
		}, true
	)
	if not patch_war.ok:
		return patch_war
	var win_gid := str(war.get("attacker_guild_id", "")) if winner == "attacker" else str(war.get("defender_guild_id", ""))
	await _bump_guild_wl(str(war.get("attacker_guild_id", "")), winner == "attacker")
	await _bump_guild_wl(str(war.get("defender_guild_id", "")), winner == "defender")
	await _apply_guild_xp(win_gid, int(rewards.guild_xp))
	await ApiClient.request("POST", "/api/entities/GuildLog", {
		"guild_id": win_gid,
		"entry_type": "war",
		"message": "won the guild war",
		"character_name": "War System",
	}, true)
	return {"ok": true, "winner": winner, "duels": duels, "rewards": rewards}


func _load_fighters(war_id: String, side: String) -> Array:
	var readies := await list_readies(war_id)
	var fighters: Array = []
	for r in readies:
		if typeof(r) != TYPE_DICTIONARY:
			continue
		if str(r.get("side", "")) != side:
			continue
		var cid := str(r.get("character_id", ""))
		if cid.begins_with("smoke-bot-"):
			# Synthetic members — skip in combat
			continue
		var ch_res: Dictionary = await ApiClient.request(
			"GET", "/api/entities/Character/%s" % cid.uri_encode(), null, true
		)
		if not ch_res.ok or typeof(ch_res.data) != TYPE_DICTIONARY:
			continue
		var items_res: Dictionary = await ApiClient.request(
			"POST", "/api/entities/Item/filter",
			{"query": {"character_id": cid, "is_equipped": true}, "limit": 20}, true
		)
		var items: Array = items_res.data if items_res.ok and typeof(items_res.data) == TYPE_ARRAY else []
		fighters.append({"character": ch_res.data, "items": items})
	fighters.sort_custom(func(a, b):
		return int(a.character.get("level", 1)) > int(b.character.get("level", 1))
	)
	return fighters


func _simulate_gauntlet(attackers: Array, defenders: Array) -> Dictionary:
	var duels: Array = []
	var def_idx := 0
	var attacker_won := false
	for a_idx in range(attackers.size()):
		if def_idx >= defenders.size():
			attacker_won = true
			break
		var atk: Dictionary = attackers[a_idx]
		while def_idx < defenders.size():
			var def: Dictionary = defenders[def_idx]
			var battle: Dictionary = MissionCombat.simulate_battle(
				atk.character, def.character, atk.items, def.items
			)
			var atk_won := str(battle.get("winner", "")) == "player"
			duels.append({
				"attacker_name": str(atk.character.get("name", "?")),
				"defender_name": str(def.character.get("name", "?")),
				"attacker_level": int(atk.character.get("level", 1)),
				"defender_level": int(def.character.get("level", 1)),
				"winner": "attacker" if atk_won else "defender",
				"events": battle.get("events", []),
				"playerMaxHp": battle.get("playerMaxHp", 0),
				"opponentMaxHp": battle.get("opponentMaxHp", 0),
			})
			if atk_won:
				def_idx += 1
			else:
				break
		if def_idx >= defenders.size():
			attacker_won = true
			break
	return {"duels": duels, "winner": "attacker" if attacker_won else "defender"}


func _bump_guild_wl(guild_id: String, won: bool) -> void:
	if guild_id.is_empty():
		return
	var g: Dictionary = await ApiClient.request(
		"GET", "/api/entities/Guild/%s" % guild_id.uri_encode(), null, true
	)
	if not g.ok or typeof(g.data) != TYPE_DICTIONARY:
		return
	var guild: Dictionary = g.data
	var patch := {}
	if won:
		patch["war_wins"] = int(guild.get("war_wins", 0)) + 1
	else:
		patch["war_losses"] = int(guild.get("war_losses", 0)) + 1
	await ApiClient.request(
		"PATCH", "/api/entities/Guild/%s" % guild_id.uri_encode(), patch, true
	)


func _apply_guild_xp(guild_id: String, xp_amount: int) -> void:
	if guild_id.is_empty() or xp_amount <= 0:
		return
	var g: Dictionary = await ApiClient.request(
		"GET", "/api/entities/Guild/%s" % guild_id.uri_encode(), null, true
	)
	if not g.ok or typeof(g.data) != TYPE_DICTIONARY:
		return
	var guild: Dictionary = g.data
	var exp := int(guild.get("experience", 0)) + xp_amount
	var level := int(guild.get("level", 1))
	var to_next := int(guild.get("experience_to_next", 1000))
	while exp >= to_next:
		exp -= to_next
		level += 1
		to_next = int(floor(float(to_next) * 1.4))
	await ApiClient.request(
		"PATCH", "/api/entities/Guild/%s" % guild_id.uri_encode(),
		{"experience": exp, "level": level, "experience_to_next": to_next}, true
	)
