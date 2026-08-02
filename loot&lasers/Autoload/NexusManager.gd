extends Node
## Command Nexus guild control — ResolveNexusAssault.

const HOLD_HOURS := 24
const ASSAULT_COOLDOWN_MS := 30 * 60 * 1000
const MIN_GUILD_LEVEL := 3
const MIN_MEMBERS := 5
const MIN_POWER := 500

var nexus: Dictionary = {}
var last_assault: Dictionary = {}


func _ready() -> void:
	print("[NexusManager] ready")


func load_nexus() -> Dictionary:
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Nexus/filter",
		{"query": {"singleton": true}, "limit": 1}, true
	)
	nexus = {}
	if res.ok and typeof(res.data) == TYPE_ARRAY and (res.data as Array).size() > 0:
		nexus = res.data[0]
	return {"ok": res.ok, "nexus": nexus, "error": res.get("error", "")}


func guild_power(guild: Dictionary, members: Array) -> int:
	var member_power := 0
	for m in members:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		member_power += int(m.get("character_level", 1)) * 12
	return member_power + int(guild.get("level", 1)) * 80


func is_vulnerable(n: Dictionary = {}) -> bool:
	var nx: Dictionary = n if not n.is_empty() else nexus
	if nx.is_empty() or str(nx.get("owner_guild_id", "")).is_empty():
		return true
	if str(nx.get("status", "")) == "vulnerable":
		return true
	var captured := str(nx.get("captured_at", ""))
	if captured.is_empty():
		return true
	var held_ms := _age_ms(captured)
	return held_ms >= HOLD_HOURS * 3600 * 1000


func hours_until_vulnerable(n: Dictionary = {}) -> int:
	var nx: Dictionary = n if not n.is_empty() else nexus
	if nx.is_empty() or str(nx.get("owner_guild_id", "")).is_empty():
		return 0
	var held_ms := _age_ms(str(nx.get("captured_at", "")))
	var remaining := HOLD_HOURS * 3600 * 1000 - held_ms
	return maxi(0, int(ceil(float(remaining) / 3600000.0)))


func format_reign(n: Dictionary = {}) -> String:
	var nx: Dictionary = n if not n.is_empty() else nexus
	var ms := _age_ms(str(nx.get("captured_at", "")))
	var days := int(ms / 86400000.0)
	var hours := int((int(ms) % 86400000) / 3600000.0)
	if days > 0:
		return "%sd %sh" % [days, hours]
	var mins := int((int(ms) % 3600000) / 60000.0)
	return "%sh %sm" % [hours, mins]


func eligibility(guild: Dictionary, members: Array) -> Dictionary:
	if guild.is_empty():
		return {"ok": false, "error": "You are not in a guild."}
	if int(guild.get("level", 1)) < MIN_GUILD_LEVEL:
		return {"ok": false, "error": "Guild level %s required." % MIN_GUILD_LEVEL}
	if members.size() < MIN_MEMBERS:
		return {"ok": false, "error": "%s active members required." % MIN_MEMBERS}
	var power := guild_power(guild, members)
	if power < MIN_POWER:
		return {"ok": false, "error": "Guild power %s required (have %s)." % [MIN_POWER, power]}
	return {"ok": true, "power": power}


func owns_nexus(guild_id: String) -> bool:
	return not guild_id.is_empty() and str(nexus.get("owner_guild_id", "")) == guild_id


func assault_cooldown_ms() -> int:
	var last := str(nexus.get("last_assault_at", ""))
	if last.is_empty():
		return 0
	var age := _age_ms(last)
	return maxi(0, ASSAULT_COOLDOWN_MS - int(age))


func resolve_assault(attacker_guild_id: String) -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if attacker_guild_id.is_empty() or cid.is_empty():
		return {"ok": false, "error": "Missing guild or character"}
	var res: Dictionary = await GameApiClient.invoke("ResolveNexusAssault", {
		"attacker_guild_id": attacker_guild_id,
		"character_id": cid,
	})
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		last_assault = res.data
		var nx: Variant = res.data.get("nexus", {})
		if typeof(nx) == TYPE_DICTIONARY and not (nx as Dictionary).is_empty():
			nexus = nx
		else:
			await load_nexus()
	return res


func _age_ms(iso: String) -> float:
	if iso.is_empty():
		return 0.0
	var cleaned := iso.replace("Z", "").replace("z", "")
	var dict := Time.get_datetime_dict_from_datetime_string(cleaned, false)
	if dict.is_empty():
		return 0.0
	var then_ms := float(Time.get_unix_time_from_datetime_dict(dict)) * 1000.0
	return maxf(0.0, Time.get_unix_time_from_system() * 1000.0 - then_ms)
