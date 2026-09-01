class_name CodexCatalog
extends RefCounted
## In-game guide — mirrors src/components/game/CodexModal.jsx (sections + BBCode body).

const FUEL := "#39FF14"
const STARDUST := "#E879F9"
const AMBER := "#FBBF24"
const PRIMARY := "#22D3EE"
const MUTED := "#8CA4B7"
const FG := "#C8D6E0"

## Display mirrors (avoid class_name/Autoload chains — they break Codex compile).
const FUEL_PURCHASE_COST := 20
const FUEL_PURCHASE_AMOUNT := 20
const FUEL_PURCHASE_MAX := 10
const SHOP_REFRESH_COST := 20
const ARENA_FREE_BATTLES := 10
const ARENA_PAID_BATTLE_COST := 15
const DUNGEON_SKIP_COST := 25

const SECTIONS: Array = [
	{"id": "start", "label": "Getting Started", "icon": "book-open", "color": "#22D3EE"},
	{"id": "currencies", "label": "Currencies", "icon": "coins", "color": "#FFD700"},
	{"id": "missions", "label": "Missions & Fuel", "icon": "rocket", "color": "#FF9E4F"},
	{"id": "combat", "label": "Combat & Arena", "icon": "swords", "color": "#FF4D6D"},
	{"id": "galaxy", "label": "Galaxy Dungeon", "icon": "map", "color": "#00E5FF"},
	{"id": "market", "label": "Black Market", "icon": "shopping-bag", "color": "#4ADE80"},
	{"id": "guilds", "label": "Guilds & Nexus", "icon": "crown", "color": "#A855F7"},
	{"id": "social", "label": "Social & Mail", "icon": "users", "color": "#34D399"},
]


static func _h(text: String) -> String:
	return "[font_size=14][color=%s][b]%s[/b][/color][/font_size]\n" % [MUTED, text.to_upper()]


static func _p(text: String) -> String:
	## Concatenate so guide copy can contain literal %% without format errors.
	return "[color=" + FG + "]" + text + "[/color]\n\n"


static func _li(text: String) -> String:
	return "[color=" + FG + "]• " + text + "[/color]\n"


static func _tip(text: String) -> String:
	return "\n[font_size=14][i][color=" + MUTED + "]" + text + "[/color][/i][/font_size]"


static func _brand(text: String) -> String:
	return "[color=" + PRIMARY + "][b]" + text + "[/b][/color]"


static func _amber(text: String) -> String:
	return "[color=" + AMBER + "]" + text + "[/color]"


static func _fuel(text: String = "fuel") -> String:
	return "[color=" + FUEL + "][b]" + text + "[/b][/color]"


static func _stardust_h() -> String:
	return "[font_size=14][color=" + STARDUST + "][b]STARDUST[/b][/color][/font_size]\n"

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
				+ _li("Sell unwanted gear at the [b]Black Market[/b] to reclaim stardust and free backpack slots.")
				+ "\n" + _h("Where things live")
				+ _p("The [b]station hub[/b] on the home screen is your map — tap any glowing module to travel there. The %s gives quests, the [b]Nav Deck[/b] is the dungeon, [b]Operative / Ship Hangar[/b] is your character and vessel." % _amber("Cantina"))
				+ _tip("Tip: this guide lives in [b]Settings → Codex[/b] whenever you need a refresher.")
			)
		"currencies":
			return (
				_stardust_h()
				+ _p("The primary currency. Earned from missions, arena wins, dungeons, daily rewards, and selling gear at the Black Market. Spent in the Black Market, on ship mods, and attribute buys.")
				+ _h("Nova Crystals")
				+ _p("Premium currency — buy them in the Crystal Store or earn them from daily rewards. Used to skip mission/arena/dungeon waits, buy extra fuel, and fight past free arena quotas (%s Nova Crystals per arena battle after free fights). Frontier cooldown skip costs %s Nova Crystals." % [
					NumberDisplay.nova(ARENA_PAID_BATTLE_COST), NumberDisplay.nova(DUNGEON_SKIP_COST)
				])
				+ "[font_size=14]%s[/font_size]\n" % _fuel("FUEL")
				+ _p("Your mission energy. Each mission costs fuel based on its length. You get a pool of 100 that [b]resets to full every 24 hours[/b]. Need more sooner? Spend [b]%s Nova Crystals[/b] to buy +%s fuel, up to [b]%s times[/b] per cycle." % [
					NumberDisplay.nova(FUEL_PURCHASE_COST),
					NumberDisplay.quantity(FUEL_PURCHASE_AMOUNT),
					NumberDisplay.quantity(FUEL_PURCHASE_MAX),
				])
			)
		"missions":
			return (
				_p("Missions are your steady engine for XP, stardust, and loot. Visit the %s to browse quests." % _amber("Cantina"))
				+ _h("How a mission works")
				+ _li("Each quest shows its [b]duration[/b] and [b]fuel cost[/b]. Longer jobs pay more.")
				+ _li("Launch it — fuel is consumed and a timer starts. You can keep playing while it runs.")
				+ _li("When the timer ends, the mission is ready to [b]claim[/b]. Claiming grants XP, stardust, and (about 20% of the time) gear — with pity bumps after misses. Stims drop on their own chance.")
				+ _li("Impatient? Spend [b]Nova Crystals[/b] to skip — cost scales with time left (5 Nova Crystals per remaining minute).")
				+ "\n" + _h("Fuel & reset")
				+ _p("Your fuel pool refills to full every [b]24 hours[/b]. You can spend [b]%s Nova Crystals[/b] to buy +%s fuel, up to [b]%s times[/b] per cycle. Upgrade your [b]Reinforced Fuel Tank[/b] for more capacity and [b]Fuel Injector Tune[/b] to cut per-mission costs." % [
					NumberDisplay.nova(FUEL_PURCHASE_COST),
					NumberDisplay.quantity(FUEL_PURCHASE_AMOUNT),
					NumberDisplay.quantity(FUEL_PURCHASE_MAX),
				])
				+ _h("Ship bonuses")
				+ _p("Your active ship and its mods apply at launch (fuel/time reduction) and at claim (stardust/XP boosts). Check the Ship Hangar.")
			)
		"combat":
			return (
				_p("The [b]Arena[/b] is automated PvP — your stats and gear fight an opponent in a simulated battle. You get [b]%s free battles per day[/b] (resets at midnight Eastern). After that, each fight costs [b]%s Nova Crystals[/b] and awards rating only." % [
					NumberDisplay.quantity(ARENA_FREE_BATTLES), NumberDisplay.nova(ARENA_PAID_BATTLE_COST)
				])
				+ _h("Challengers")
				+ _li("You see [b]three[/b] challengers at a time. The board lasts [b]2 hours[/b], remints after you fight one, or when you (or a real foe on the board) level up.")
				+ _li("Rankings remain the path to pick a specific rival when they appear on your board.")
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
				+ _li("[b]Vitality[/b] — Max HP for all: round(50 + 2.5x VIT + 0.008x VIT^2).")
				+ _li("[b]Luck[/b] — Crit Chance for all (cap 30%, soft-capped before Lv100, 1.5x crit damage).")
			)
		"galaxy":
			return (
				_p("The [b]Galaxy Map[/b] (Nav Deck) is a turn-based dungeon crawl across planets. Each planet has enemies to clear and a boss to defeat. After every fight (win or loss) you wait a [b]1 hour cooldown[/b] shared across all worlds; skip it for [b]%s Nova Crystals[/b]." % [
					NumberDisplay.nova(DUNGEON_SKIP_COST)
				])
				+ _li("Fight enemies in sequence — battles are auto-simulated like the arena.")
				+ _li("Defeating the [b]boss[/b] clears the planet and advances you to the next.")
				+ _li("Rewards use [b]DRU[/b] (Dungeon Reward Units): 1 DRU = 2 fuel of mission XP payout at the enemy's level.")
				+ _li("Loot drops from victories; bosses give the best hauls.")
				+ _li("Losses grant [b]no[/b] XP or stardust — only the same 1 hour cooldown as a win.")
				+ _tip("Your dungeon progress and highest sector are shown in your public stats.")
			)
		"market":
			return (
				_p("The [b]Black Market[/b] sells eight rotating gear and stim stalls for Stardust. Epic and Legendary gear may also ask for a Nova surcharge.")
				+ _h("Stalls")
				+ _li("Stock refreshes automatically at 19:00 and 07:00 UTC. One free restock per 12-hour window; after that, spend [b]%s Nova Crystals[/b] to restock." % NumberDisplay.nova(SHOP_REFRESH_COST))
				+ _li("Compare listed gear to what you have equipped before buying.")
				+ _li("[b]Haggle[/b] on normal Market gear — 40% without a Nova surcharge, 30% if the listing has any Nova. Success takes 10–20% off both Stardust and Nova. Failure yanks that stall until the next Market refresh. Stims and Contraband cannot be haggled.")
				+ "\n" + _h("Sell")
				+ _p("Stage unequipped backpack items in the sell tray to convert them to Stardust. Equipped gear must be unequipped on Operative first. This is the only way to remove items from your backpack.")
				+ "\n" + _h("Contraband Loot")
				+ _p("One separate Gear-only spotlight. It refreshes daily at 19:00 UTC, and also after every ten [b]manual[/b] Market restocks (free or paid). Automatic 12-hour refreshes do not advance that counter.")
			)
		"guilds":
			return (
				_p("[b]Guilds[/b] let you band together for shared progression, weekly challenges, and guild wars.")
				+ _li("Create or join a guild from the Guild page. Members contribute to a collective pool.")
				+ _li("[b]Weekly challenges[/b] reward coordinated activity — missions, arena wins, and more.")
				+ _li("Guilds can war with each other for glory and rewards.")
				+ "\n" + _h("The Nexus")
				+ _p("The [b]Nexus[/b] is a capturable central stronghold. The guild holding it gains a [b]+5% mission stardust[/b] perk for all members. Any guild with enough power can assault it at any time to seize control.")
			)
		"social":
			return (
				_p("Stay connected with the galaxy's other operatives.")
				+ _li("[b]Friends[/b] — send and accept friend requests, see who's online.")
				+ _li("[b]Messages[/b] — private one-on-one conversations. Alerts and system notices live in the blue bell button (bottom-right).")
				+ _li("[b]Mail[/b] — receive system mail and rewards. Some mail carries claimable rewards.")
				+ _li("[b]Global Chat[/b] — talk to everyone online. Mind the rules; report abuse if needed.")
				+ _li("[b]Daily Login[/b] — a 30-day reward calendar. Log in each day to claim; rewards escalate.")
				+ _tip("Tip: check Mail and the notification bell regularly — rewards expire!")
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
