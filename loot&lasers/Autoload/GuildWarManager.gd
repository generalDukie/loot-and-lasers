extends Node
## Guild wars — DeclareGuildWar + ToggleGuildWarReady + ResolveGuildWar (Node authority).

const DECLARE_COST := 5000


func _ready() -> void:
	print("[GuildWarManager] ready")


func list_wars(guild_id: String) -> Array:
	if guild_id.is_empty():
		return []
	var atk: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildWar/filter",
		{"query": {"attacker_guild_id": guild_id}, "sort": "-declared_at", "limit": 20}, true
	)
	var def: Dictionary = await GameApiClient.request(
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
	var res: Dictionary = await GameApiClient.invoke("DeclareGuildWar", {
		"defender_guild_id": defender_guild_id,
	})
	if res.ok:
		var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
		var patch: Variant = data.get("patch", {})
		if typeof(patch) == TYPE_DICTIONARY:
			GameManager.apply_active_character_patch(patch, "guild_war_declare")
		var ch: Variant = data.get("character", {})
		if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
			GameManager.apply_active_character(ch, "guild_war_declare")
	return res


func list_readies(war_id: String) -> Array:
	var res: Dictionary = await GameApiClient.request(
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
	var res: Dictionary = await GameApiClient.invoke("ToggleGuildWarReady", {
		"war_id": str(war.get("id", "")),
	})
	if not res.ok:
		return {"ok": false, "ready": false, "error": res.get("error", "Ready toggle failed")}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	return {"ok": true, "ready": bool(data.get("ready", false)), "error": ""}


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
	var res: Dictionary = await GameApiClient.invoke("ResolveGuildWar", {
		"war_id": str(war.get("id", "")),
	})
	if not res.ok:
		return {"ok": false, "error": res.get("error", "Resolve failed")}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var war_out: Variant = data.get("war", {})
	var rewards: Variant = data.get("rewards", {})
	return {
		"ok": true,
		"winner": str(data.get("winner_side", "")),
		"duels": data.get("battle_log", []),
		"rewards": rewards if typeof(rewards) == TYPE_DICTIONARY else {},
		"war": war_out if typeof(war_out) == TYPE_DICTIONARY else {},
	}
