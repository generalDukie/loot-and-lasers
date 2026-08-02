class_name CodexCatalog
extends RefCounted
## In-game guide — mirrors src/components/game/CodexModal.jsx (sections + BBCode body).

const FUEL := "#39FF14"
const STARDUST := "#E879F9"
const AMBER := "#FBBF24"
const PRIMARY := "#22D3EE"
const MUTED := "#8CA4B7"
const FG := "#C8D6E0"

const SECTIONS: Array = [
	{"id": "start", "label": "Getting Started", "icon": "📘", "color": "#22D3EE"},
	{"id": "currencies", "label": "Currencies", "icon": "🪙", "color": "#FFD700"},
	{"id": "missions", "label": "Missions & Fuel", "icon": "🚀", "color": "#FF9E4F"},
	{"id": "combat", "label": "Combat & Arena", "icon": "⚔", "color": "#FF4D6D"},
	{"id": "galaxy", "label": "Galaxy Dungeon", "icon": "🗺", "color": "#00E5FF"},
	{"id": "market", "label": "Black Market", "icon": "🛍", "color": "#4ADE80"},
	{"id": "blackhole", "label": "Void", "icon": "🌀", "color": "#9D6BFF"},
	{"id": "ship", "label": "Ship Hangar", "icon": "🚀", "color": "#FFD700"},
	{"id": "guilds", "label": "Guilds & Nexus", "icon": "👑", "color": "#A855F7"},
	{"id": "social", "label": "Social & Mail", "icon": "👥", "color": "#34D399"},
]


static func _h(text: String) -> String:
	return "[font_size=11][color=%s][b]%s[/b][/color][/font_size]\n" % [MUTED, text.to_upper()]


static func _p(text: String) -> String:
	return "[color=%s]%s[/color]\n\n" % [FG, text]


static func _li(text: String) -> String:
	return "[color=%s]• %s[/color]\n" % [FG, text]


static func _tip(text: String) -> String:
	return "\n[font_size=11][i][color=%s]%s[/color][/i][/font_size]" % [MUTED, text]


static func _brand(text: String) -> String:
	return "[color=%s][b]%s[/b][/color]" % [PRIMARY, text]


static func _amber(text: String) -> String:
	return "[color=%s]%s[/color]" % [AMBER, text]


static func _fuel(text: String = "fuel") -> String:
	return "[color=%s]⛽ %s[/color]" % [FUEL, text]


static func _stardust_h() -> String:
	return "[font_size=11][color=%s][b]✦ STARDUST[/b][/color][/font_size]\n" % STARDUST


static func body_bbcode(section_id: String) -> String:
	match section_id:
		"start":
			return (
				_p("Welcome to %s, operative. You command a space station drifting through the cosmos. Here's how to get going:" % _brand("LOOT & LASERS"))
				+ _h("Your First Steps")
				+ _li("[b]Missions[/b] are your main income — head to the %s, pick a quest, and launch it using %s." % [_amber("Cantina"), _fuel()])
				+ _li("When a mission finishes, [b]claim[/b] it for XP, stardust, and random loot. Level up to unlock harder sectors.")
				+ _li("Equip better gear on your [b]Character[/b] page to raise your combat power.")
				+ _li("Spend [b]Stardust[/b] to buy attribute points anytime — each attribute has its own rising cost. Tap once or hold (~1s) to keep buying.")
				+ _li("Try the [b]Arena[/b] for PvP, or brave the [b]Galaxy Dungeon[/b] for risky loot.")
				+ _li("Dissolve unwanted gear in the [b]Void[/b] (or from your inventory) to reclaim stardust.")
				+ "\n" + _h("Where things live")
				+ _p("The [b]station hub[/b] on the home screen is your map — tap any glowing module to travel there. The %s gives quests, the [b]Nav Deck[/b] is the dungeon, [b]Hero / Ship Hangar[/b] is your character and vessel." % _amber("Cantina"))
				+ _tip("Tip: this guide lives in [b]Settings → Codex[/b] whenever you need a refresher.")
			)
		"currencies":
			return (
				_stardust_h()
				+ _p("The primary currency. Earned from missions, arena wins, dungeons, daily rewards, and dissolving gear in the Void. Spent in the Black Market, on ship mods, attribute buys, and arena challenger refreshes.")
				+ _h("💎 Nova Crystals")
				+ _p("Premium currency — buy them in the Crystal Store or earn them from daily rewards. Used to skip mission/arena/dungeon waits, buy extra fuel, and fight past free quotas (%s💎 per arena battle, %s💎 per frontier fight)." % [
					str(ArenaRules.PAID_BATTLE_COST), str(DungeonRules.CONTINUE_COST)
				])
				+ "[font_size=11]%s[/font_size]\n" % _fuel("FUEL")
				+ _p("Your mission energy. Each mission costs fuel based on its length. You get a pool of 100 that [b]resets to full every 24 hours[/b]. Need more sooner? Spend [b]%s Nova Crystals[/b] to buy +%s fuel, up to [b]%s times[/b] per cycle." % [
					str(ShopManager.FUEL_PURCHASE_COST),
					str(ShopManager.FUEL_PURCHASE_AMOUNT),
					str(ShopManager.FUEL_PURCHASE_MAX),
				])
			)
		"missions":
			return (
				_p("Missions are your steady engine for XP, stardust, and loot. Visit the %s to browse quests." % _amber("Cantina"))
				+ _h("How a mission works")
				+ _li("Each quest shows its [b]duration[/b] and [b]fuel cost[/b]. Longer jobs pay more.")
				+ _li("Launch it — fuel is consumed and a timer starts. You can keep playing while it runs.")
				+ _li("When the timer ends, the mission is ready to [b]claim[/b]. Claiming grants XP, stardust, and (about 20% of the time) gear — with pity bumps after misses. Stims drop on their own chance.")
				+ _li("Impatient? Spend [b]Nova Crystals[/b] to skip — cost scales with time left (5 💎 per remaining minute).")
				+ "\n" + _h("Fuel & reset")
				+ _p("Your fuel pool refills to full every [b]24 hours[/b]. You can spend [b]%s Nova Crystals[/b] to buy +%s fuel, up to [b]%s times[/b] per cycle. Upgrade your [b]Reinforced Fuel Tank[/b] for more capacity and [b]Fuel Injector Tune[/b] to cut per-mission costs." % [
					str(ShopManager.FUEL_PURCHASE_COST),
					str(ShopManager.FUEL_PURCHASE_AMOUNT),
					str(ShopManager.FUEL_PURCHASE_MAX),
				])
				+ _h("Ship bonuses")
				+ _p("Your active ship and its mods apply at launch (fuel/time reduction) and at claim (stardust/XP boosts). Check the Ship Hangar.")
			)
		"combat":
			return (
				_p("The [b]Arena[/b] is automated PvP — your stats and gear fight an opponent in a simulated battle. You get [b]%s free battles per day[/b] (resets at midnight Eastern). After that, each fight costs [b]%s Nova Crystals[/b] and awards rating only." % [
					str(ArenaRules.DAILY_FREE_BATTLES), str(ArenaRules.PAID_BATTLE_COST)
				])
				+ _h("Rating")
				+ _li("Winning raises your [b]rating[/b]; losing lowers it. Climb the leaderboard by rating alone.")
				+ _li("Beating higher-rated opponents gives bonus rating.")
				+ _li("Chain wins for a [b]streak[/b] — hit milestones for news feed glory.")
				+ "\n" + _h("Rewards")
				+ _p("Free battles earn XP and stardust on a [b]win[/b] only — losses grant nothing (rating still changes). After your free quota, battles cost Nova Crystals and award rating only.")
				+ _h("Power")
				+ _p("Your combat power comes from level + attributes + equipped gear rarity. Buy attributes with Stardust (each attribute has its own cost curve) and upgrade gear to climb the ladder.")
				+ _h("Attributes")
				+ _li("[b]Strength[/b] — Strength damage for STR classes; Armor vs Strength damage for AGI/INT (STR classes get 0% Armor from Strength).")
				+ _li("[b]Agility[/b] — Dodge for all; Agility damage for AGI classes (bypasses Armor & Tech Resist).")
				+ _li("[b]Intellect[/b] — Tech damage for INT classes; Tech Resist for STR/AGI (INT classes get 0% Tech Resist from Intellect).")
				+ _li("[b]Vitality[/b] — Max HP for all: round(50 + 2.5×VIT + 0.008×VIT²).")
				+ _li("[b]Luck[/b] — Crit Chance for all (cap 30%, soft-capped before Lv100, 1.5× crit damage).")
			)
		"galaxy":
			return (
				_p("The [b]Galaxy Map[/b] (Nav Deck) is a turn-based dungeon crawl across planets. Each planet has enemies to clear and a boss to defeat. You get [b]%s free lives per day[/b] (midnight Eastern); further fights cost [b]%s Nova Crystals[/b]." % [
					str(DungeonRules.DEATHS_PER_DAY), str(DungeonRules.CONTINUE_COST)
				])
				+ _li("Fight enemies in sequence — battles are auto-simulated like the arena.")
				+ _li("Defeating the [b]boss[/b] clears the planet and advances you to the next.")
				+ _li("Rewards use [b]DRU[/b] (Dungeon Reward Units): 1 DRU ≈ 1 fuel of mission payout at the enemy's level. XP pays at 87% of that rate.")
				+ _li("Loot and ship-mod unlocks drop from victories; bosses give the best hauls.")
				+ _li("Losses grant [b]no[/b] XP or stardust — only a longer cooldown (and a spent life).")
				+ _tip("Your dungeon progress and highest sector are shown in your public stats.")
			)
		"market":
			return (
				_p("The [b]Black Market[/b] (Bazaar) sells rotating gear and stims for ✦ stardust. The Armory usually includes a class signature weapon.")
				+ _h("Armory & Stim Lab")
				+ _li("Both stalls refresh every [b]6 hours[/b]. Spend [b]%s Nova Crystals[/b] to restock a stall early." % str(ShopManager.SHOP_REFRESH_COST))
				+ _li("Compare listed gear to what you have equipped before buying.")
				+ _li("[b]Haggle[/b] on armory pieces — about 40% of the time you get 15–20% off; if it fails, they yank the listing (no purchase).")
				+ _li("Rare [b]Scrap Crates[/b] (2 commons) and [b]Stim Trios[/b] show up as bundle deals.")
				+ "\n" + _h("Hot Deal")
				+ _p("One spotlight piece per day (midnight Eastern). It does [b]not[/b] change when you restock the Armory — buy it or wait for tomorrow.")
			)
		"blackhole":
			return (
				_p("The [b]Void[/b] recycles gear you no longer need. Dissolve an item and it turns into ✦ stardust — same payout whether you do it here or from your inventory.")
				+ _li("Only [b]unequipped[/b] items can be dissolved.")
				+ _li("Yield scales with the item's [b]rarity[/b], [b]stats[/b], and [b]level requirement[/b], plus a per-type weight (weapons & ship modules dissolve for more).")
				+ _li("It's the smart move for gear that's weaker than what you've equipped.")
			)
		"ship":
			return (
				_p("Your [b]ship[/b] passively boosts missions. Visit the Ship Hangar to buy permanent [b]mods[/b] with stardust.")
				+ _h("Upgrade categories")
				+ _li("[b]Reinforced Fuel Tank[/b] — more max fuel.")
				+ _li("[b]Fuel Injector Tune[/b] — less fuel per mission.")
				+ _li("[b]Warp Drive[/b] — shorter mission times.")
				+ _li("[b]Stardust Magnet[/b] — more stardust from missions.")
				+ _li("[b]Neural Accelerator[/b] — more XP from missions.")
				+ "\n" + _h("Ships")
				+ _p("Each ship keeps its own mod loadout — buy a new hull and keep flying your old one while you outfit the bay. Higher hulls cost a bit more to upgrade, but each mod tier runs [b]~8% stronger[/b] than the same tier on the previous hull. Locked hulls show a bay preview and level progress. At [b]Lv 20[/b] your Scout gets a free Fuel Tank tune. Full hulls unlock at 50 / 100 / 200.")
				+ _h("Fuel mounts")
				+ _p("Temporary mission-speed boosts bought from the hangar’s Fuel Mounts drawer. They do not replace permanent hull upgrades.")
			)
		"guilds":
			return (
				_p("[b]Guilds[/b] let you band together for shared progression, weekly challenges, and guild wars.")
				+ _li("Create or join a guild from the Guild page. Members contribute to a collective pool.")
				+ _li("[b]Weekly challenges[/b] reward coordinated activity — missions, arena wins, and more.")
				+ _li("Guilds can war with each other for glory and rewards.")
				+ "\n" + _h("The Nexus")
				+ _p("The [b]Nexus[/b] is a capturable central stronghold. The guild holding it gains a [b]+5% mission stardust[/b] perk for all members. Other guilds can assault it to seize control.")
			)
		"social":
			return (
				_p("Stay connected with the galaxy's other operatives.")
				+ _li("[b]Friends[/b] — send and accept friend requests, see who's online.")
				+ _li("[b]Messages[/b] — private one-on-one conversations. Alerts and system notices live in the blue bell button (bottom-right).")
				+ _li("[b]Mail[/b] — receive system mail and rewards. Some mail carries claimable rewards.")
				+ _li("[b]Global Chat[/b] — talk to everyone online. Mind the rules; report abuse if needed.")
				+ _li("[b]Daily Login[/b] — a 30-day reward calendar. Log in each day to claim; rewards escalate.")
				+ _tip("✉ Tip: check Mail and the notification bell regularly — rewards expire!")
			)
		_:
			return "[color=%s]Section unavailable.[/color]" % MUTED


## Plain-text fallback (kept for callers that still expect body()).
static func body(section_id: String) -> String:
	var bb := body_bbcode(section_id)
	var plain := bb
	for tag in ["[b]", "[/b]", "[i]", "[/i]"]:
		plain = plain.replace(tag, "")
	# Strip simple color/size tags.
	var cleaned := ""
	var i := 0
	while i < plain.length():
		if plain[i] == "[":
			var end := plain.find("]", i)
			if end < 0:
				cleaned += plain[i]
				i += 1
			else:
				i = end + 1
		else:
			cleaned += plain[i]
			i += 1
	return cleaned.strip_edges()
