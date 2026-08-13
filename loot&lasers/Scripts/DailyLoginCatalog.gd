class_name DailyLoginCatalog
extends RefCounted
## Mirror of server/src/shared/rewards.js DAILY_REWARDS for display labels/icons only.
## Claim eligibility and grants are always server-authoritative.

const ENTRIES: Array = [
	{"day": 1, "rewards": {"stardust": 100}},
	{"day": 2, "rewards": {"experience": 800}},
	{"day": 3, "rewards": {"stardust": 600}},
	{"day": 4, "rewards": {"fuel": 25}},
	{"day": 5, "rewards": {"item_rarity": "rare"}},
	{"day": 6, "rewards": {"nova_crystals": 3}},
	{"day": 7, "rewards": {"stardust": 1500}},
	{"day": 8, "rewards": {"stardust": 800}},
	{"day": 9, "rewards": {"experience": 1000}},
	{"day": 10, "rewards": {"collectible": {"name": "Uncommon Strength Stim"}}},
	{"day": 11, "rewards": {"stardust": 1000}},
	{"day": 12, "rewards": {"fuel": 30}},
	{"day": 13, "rewards": {"nova_crystals": 4}},
	{"day": 14, "rewards": {"experience": 1200}},
	{"day": 15, "rewards": {"item_rarity": "rare"}},
	{"day": 16, "rewards": {"stardust": 2000}},
	{"day": 17, "rewards": {"stardust": 1200}},
	{"day": 18, "rewards": {"collectible": {"name": "Uncommon Agility Stim"}}},
	{"day": 19, "rewards": {"experience": 1500}},
	{"day": 20, "rewards": {"nova_crystals": 8}},
	{"day": 21, "rewards": {"item_rarity": "rare", "stardust": 1500}},
	{"day": 22, "rewards": {"experience": 2000}},
	{"day": 23, "rewards": {"collectible": {"name": "Rare Vitality Stim"}}},
	{"day": 24, "rewards": {"stardust": 2000}},
	{"day": 25, "rewards": {"item_rarity": "epic"}},
	{"day": 26, "rewards": {"nova_crystals": 10}},
	{"day": 27, "rewards": {"experience": 2500}},
	{"day": 28, "rewards": {"stardust": 3000}},
	{"day": 29, "rewards": {"stardust": 3000, "fuel": 40}},
	{"day": 30, "rewards": {"item_rarity": "legendary"}},
]


static func reward_label(rewards: Dictionary) -> String:
	if rewards.is_empty():
		return "Reward"
	if typeof(rewards.get("collectible", null)) == TYPE_DICTIONARY:
		return str(rewards.collectible.get("name", "Collectible"))
	var parts: PackedStringArray = []
	if rewards.has("item_rarity"):
		var r := str(rewards.item_rarity)
		parts.append("%s Crate" % r.capitalize())
	if int(rewards.get("experience", 0)) > 0:
		parts.append("%s XP" % int(rewards.experience))
	if int(rewards.get("stardust", 0)) > 0:
		parts.append("%s SD" % int(rewards.stardust))
	if int(rewards.get("nova_crystals", 0)) > 0:
		parts.append("%s Nova" % int(rewards.nova_crystals))
	if int(rewards.get("fuel", 0)) > 0:
		parts.append("%s Fuel" % int(rewards.fuel))
	return " · ".join(parts) if parts.size() > 0 else "Reward"


static func reward_icon_id(rewards: Dictionary) -> String:
	if typeof(rewards.get("collectible", null)) == TYPE_DICTIONARY:
		return "sparkles"
	if rewards.has("item_rarity"):
		var r := str(rewards.item_rarity)
		if r == "legendary":
			return "trophy"
		if r == "epic":
			return "shield"
		return "package"
	if int(rewards.get("nova_crystals", 0)) > 0:
		return "nova"
	if int(rewards.get("experience", 0)) > 0:
		return "star"
	if int(rewards.get("fuel", 0)) > 0:
		return "fuel"
	if int(rewards.get("stardust", 0)) > 0:
		return "sparkles"
	return "gift"


static func reward_accent(rewards: Dictionary) -> Color:
	if int(rewards.get("nova_crystals", 0)) > 0:
		return CurrencyIcon.NOVA_GOLD
	if rewards.has("item_rarity"):
		return ClientUi.GOLD
	if int(rewards.get("experience", 0)) > 0:
		return ClientUi.BRAND_GRAD_CYAN
	if int(rewards.get("stardust", 0)) > 0:
		return GameData.STARDUST_COLOR
	if int(rewards.get("fuel", 0)) > 0:
		return CurrencyIcon.FUEL_GREEN
	return ClientUi.CYAN_SOFT
