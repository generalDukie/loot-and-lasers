extends Node
## Crystal store — pack catalog + weekly Nova quests (mirrors web weeklyNovaQuests.js).

const PACKS := [
	{
		"id": "pack_2",
		"name": "Signal Shard",
		"blurb": "A scout’s first haul from the fringe.",
		"crystals": 275,
		"price": "$1.99",
		"usd": 1.99,
		"bonus": "",
		"color": "#67E8F9",
		"tier": "spark",
	},
	{
		"id": "pack_5",
		"name": "Ember Pouch",
		"blurb": "Warm crystals still humming from the kiln.",
		"crystals": 850,
		"price": "$4.99",
		"usd": 4.99,
		"bonus": "",
		"color": "#22D3EE",
		"tier": "ember",
	},
	{
		"id": "pack_10",
		"name": "Cosmic Cluster",
		"blurb": "The operative favorite — dense and loud.",
		"crystals": 1950,
		"price": "$9.99",
		"usd": 9.99,
		"bonus": "",
		"color": "#C084FC",
		"tier": "cluster",
		"popular": true,
	},
	{
		"id": "pack_20",
		"name": "Stellar Vault",
		"blurb": "Sealed under guild wax for serious runs.",
		"crystals": 4500,
		"price": "$19.99",
		"usd": 19.99,
		"bonus": "",
		"color": "#FBBF24",
		"tier": "vault",
	},
	{
		"id": "pack_50",
		"name": "Void Motherlode",
		"blurb": "Salvaged from a dark-sector freighter.",
		"crystals": 12750,
		"price": "$49.99",
		"usd": 49.99,
		"bonus": "",
		"color": "#FB7185",
		"tier": "motherlode",
	},
	{
		"id": "pack_100",
		"name": "Hypernova Cache",
		"blurb": "Fleet-scale payload. Maximum yield.",
		"crystals": 30000,
		"price": "$99.99",
		"usd": 99.99,
		"bonus": "",
		"color": "#FDE68A",
		"tier": "hypernova",
		"best_value": true,
	},
]

## Mirrors WEEKLY_NOVA_QUESTS in src/lib/weeklyNovaQuests.js
const QUESTS := [
	{
		"id": "arena",
		"key": "arena",
		"label": "Arena Ace",
		"desc": "Win 5 Arena battles",
		"goal": 5,
		"reward": 8,
		"emoji": "swords",
	},
	{
		"id": "dungeon",
		"key": "dungeon",
		"label": "Dungeon Delver",
		"desc": "Win 3 dungeon fights",
		"goal": 3,
		"reward": 7,
		"emoji": "compass",
	},
	{
		"id": "missions",
		"key": "missions",
		"label": "Mission Runner",
		"desc": "Complete 5 missions",
		"goal": 5,
		"reward": 5,
		"emoji": "beer",
	},
]


func _ready() -> void:
	print("[CrystalStoreManager] ready")


func weekly_state() -> Dictionary:
	var raw: Variant = GameManager.active_character.get("weekly_nova_quests", {})
	return raw if typeof(raw) == TYPE_DICTIONARY else {}


func quest_progress(quest_id: String) -> int:
	return int(weekly_state().get(quest_id, 0))


func is_claimed(quest_id: String) -> bool:
	var claimed: Variant = weekly_state().get("claimed", [])
	if typeof(claimed) != TYPE_ARRAY:
		return false
	return quest_id in claimed


func can_claim(quest_id: String) -> bool:
	if is_claimed(quest_id):
		return false
	var goal := 5
	for q in QUESTS:
		if str(q["id"]) == quest_id:
			goal = int(q["goal"])
			break
	return quest_progress(quest_id) >= goal


func total_weekly_reward() -> int:
	var sum := 0
	for q in QUESTS:
		sum += int(q["reward"])
	return sum


## Seconds until next Monday 00:00 America/New_York (approx UTC−5, matches SocialManager week math).
func weekly_seconds_left() -> int:
	var unix: int = int(Time.get_unix_time_from_system()) - 5 * 3600
	var dict := Time.get_datetime_dict_from_unix_time(unix)
	var y: int = int(dict.get("year", 2026))
	var m: int = int(dict.get("month", 1))
	var d: int = int(dict.get("day", 1))
	var t := [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
	var yy: int = y - (1 if m < 3 else 0)
	var wd: int = (yy + int(yy / 4) - int(yy / 100) + int(yy / 400) + int(t[m - 1]) + d) % 7
	var since_mon: int = (wd + 6) % 7
	# Days until next Monday (0 if already Monday → still count to next week end = 7d from this Mon midnight).
	var days_to_end: int = 7 - since_mon
	if days_to_end <= 0:
		days_to_end = 7
	var hour: int = int(dict.get("hour", 0))
	var minute: int = int(dict.get("minute", 0))
	var second: int = int(dict.get("second", 0))
	var sec_into_day: int = hour * 3600 + minute * 60 + second
	var left: int = days_to_end * 86400 - sec_into_day
	return maxi(0, left)


static func format_week_left(sec: int) -> String:
	var d := int(sec / 86400)
	var h := int((sec % 86400) / 3600)
	if d > 0:
		return "%sd %sh" % [d, h]
	var m := int((sec % 3600) / 60)
	if h > 0:
		return "%sh %sm" % [h, m]
	return "%sm" % m


func claim_quest(quest_id: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("ClaimWeeklyNovaQuest", {"quest_id": quest_id})
	if res.ok:
		_apply_character_payload(res.data if typeof(res.data) == TYPE_DICTIONARY else {})
	return res


## Local/dev grants Nova via PurchaseCrystalPack; production returns 501 until Stripe.
## Web CrystalStorePage does not call this yet — checkout toast only.
func purchase_pack(pack_id: String) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("PurchaseCrystalPack", {"pack_id": pack_id})
	if res.ok:
		_apply_character_payload(res.data if typeof(res.data) == TYPE_DICTIONARY else {})
	return res


func pack_by_id(pack_id: String) -> Dictionary:
	for p in PACKS:
		if str(p["id"]) == pack_id:
			return p
	return {}


func pack_value_bonus_pct(pack: Dictionary) -> int:
	var base: Dictionary = PACKS[0] if PACKS.size() > 0 else {}
	var base_usd := float(base.get("usd", 1.99))
	var base_crystals := float(base.get("crystals", 275))
	if base_usd <= 0.0 or base_crystals <= 0.0:
		return 0
	var base_rate := base_crystals / base_usd
	var usd := float(pack.get("usd", 0))
	var crystals := float(pack.get("crystals", 0))
	if usd <= 0.0:
		return 0
	var rate := crystals / usd
	return maxi(0, int(round((rate / base_rate - 1.0) * 100.0)))


func featured_packs() -> Array:
	var out: Array = []
	for p in PACKS:
		if bool(p.get("popular", false)) or bool(p.get("best_value", false)):
			out.append(p)
	return out


func shelf_packs() -> Array:
	var out: Array = []
	for p in PACKS:
		if not bool(p.get("popular", false)) and not bool(p.get("best_value", false)):
			out.append(p)
	return out


func _apply_character_payload(data: Dictionary) -> void:
	GameApiClient.apply_authoritative_response(data, "crystal_store_purchase")
