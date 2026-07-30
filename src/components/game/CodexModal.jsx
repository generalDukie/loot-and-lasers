import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, BookOpen, Coins, Rocket, Swords, Map as MapIcon, Orbit, Ship, Crown, Users,
  Fuel, Mail, ShoppingBag,
} from "lucide-react";
import { FUEL_PURCHASE_AMOUNT, FUEL_PURCHASE_COST, FUEL_PURCHASE_MAX, SHOP_REFRESH_COST, FUEL_COLOR, STARDUST_COLOR } from "@/lib/gameData";
import { ARENA_DAILY_FREE_BATTLES, ARENA_PAID_BATTLE_COST } from "@/lib/arenaEngine";
import { DUNGEON_DEATHS_PER_DAY, DUNGEON_CONTINUE_COST } from "@/lib/dungeonEngine";
import GameplayOverlayPortal from "@/components/game/GameplayOverlayPortal";
import StardustIcon, { STARDUST_GLYPH } from "@/components/game/StardustIcon";

const SECTIONS = [
  { id: "start", label: "Getting Started", icon: BookOpen, color: "#22D3EE" },
  { id: "currencies", label: "Currencies", icon: Coins, color: "#FFD700" },
  { id: "missions", label: "Missions & Fuel", icon: Rocket, color: "#FF9E4F" },
  { id: "combat", label: "Combat & Arena", icon: Swords, color: "#FF4D6D" },
  { id: "galaxy", label: "Galaxy Dungeon", icon: MapIcon, color: "#00E5FF" },
  { id: "market", label: "Black Market", icon: ShoppingBag, color: "#4ADE80" },
  { id: "blackhole", label: "Void", icon: Orbit, color: "#9D6BFF" },
  { id: "ship", label: "Ship Hangar", icon: Ship, color: "#FFD700" },
  { id: "guilds", label: "Guilds & Nexus", icon: Crown, color: "#A855F7" },
  { id: "social", label: "Social & Mail", icon: Users, color: "#34D399" },
];

function H({ children }) {
  return <h4 className="font-display font-semibold text-[11px] uppercase tracking-wide text-muted-foreground mt-2 mb-0.5">{children}</h4>;
}
function Li({ children }) { return <li className="ml-3 list-disc marker:text-muted-foreground">{children}</li>; }

function renderSection(id) {
  switch (id) {
    case "start":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>Welcome to <span className="text-primary font-display font-bold">LOOT & LASERS</span>, operative. You command a space station drifting through the cosmos. Here's how to get going:</p>
          <H>Your First Steps</H>
          <ul className="space-y-1.5">
            <Li><b>Missions</b> are your main income — head to the <span className="text-amber-400">Cantina</span>, pick a quest, and launch it using <Fuel className="w-3 h-3 inline" style={{ color: FUEL_COLOR }} /> <span style={{ color: FUEL_COLOR }}>fuel</span>.</Li>
            <Li>When a mission finishes, <b>claim</b> it for XP, stardust, and random loot. Level up to unlock harder sectors.</Li>
            <Li>Equip better gear on your <b>Character</b> page to raise your combat power.</Li>
            <Li>Spend <b>Stardust</b> to buy attribute points anytime — each attribute has its own rising cost. Tap once or hold (~1s) to keep buying.</Li>
            <Li>Try the <b>Arena</b> for PvP, or brave the <b>Galaxy Dungeon</b> for risky loot.</Li>
            <Li>Dissolve unwanted gear in the <b>Void</b> (or from your inventory) to reclaim stardust.</Li>
          </ul>
          <H>Where things live</H>
          <p>The <b>station hub</b> on the home screen is your map — tap any glowing module to travel there. The <span className="text-amber-400">Cantina</span> gives quests, the <b>Nav Deck</b> is the dungeon, <b>Hero / Ship Hangar</b> is your character and vessel.</p>
          <p className="text-xs text-muted-foreground italic">Tip: this guide lives in <b>Settings → Codex</b> whenever you need a refresher.</p>
        </div>
      );
    case "currencies":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <H><span className="inline-flex items-center gap-1" style={{ color: STARDUST_COLOR }}><StardustIcon className="w-3.5 h-3.5 inline" /> Stardust</span></H>
          <p>The primary currency. Earned from missions, arena wins, dungeons, daily rewards, and dissolving gear in the Void. Spent in the Black Market, on ship mods, attribute buys, and arena challenger refreshes.</p>
          <H>💎 Nova Crystals</H>
          <p>Premium currency — buy them in the Crystal Store or earn them from daily rewards. Used to skip mission/arena/dungeon waits, buy extra fuel, and fight past free quotas ({ARENA_PAID_BATTLE_COST}💎 per arena battle, {DUNGEON_CONTINUE_COST}💎 per frontier fight).</p>
          <H><Fuel className="w-3 h-3 inline" style={{ color: FUEL_COLOR }} /> <span style={{ color: FUEL_COLOR }}>Fuel</span></H>
          <p>Your mission energy. Each mission costs fuel based on its length. You get a pool of 100 that <b>resets to full every 24 hours</b>. Need more sooner? Spend <b>{FUEL_PURCHASE_COST} Nova Crystals</b> to buy +{FUEL_PURCHASE_AMOUNT} fuel, up to <b>{FUEL_PURCHASE_MAX} times</b> per cycle.</p>
        </div>
      );
    case "missions":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>Missions are your steady engine for XP, stardust, and loot. Visit the <span className="text-amber-400">Cantina</span> to browse quests.</p>
          <H>How a mission works</H>
          <ul className="space-y-1.5">
            <Li>Each quest shows its <b>duration</b> and <b>fuel cost</b>. Longer jobs pay more.</Li>
            <Li>Launch it — fuel is consumed and a timer starts. You can keep playing while it runs.</Li>
            <Li>When the timer ends, the mission is ready to <b>claim</b>. Claiming grants XP, stardust, and (about 20% of the time) gear — with pity bumps after misses. Stims drop on their own chance.</Li>
            <Li>Impatient? Spend <b>Nova Crystals</b> to skip — cost scales with time left (5 💎 per remaining minute).</Li>
          </ul>
          <H>Fuel &amp; reset</H>
          <p>Your fuel pool refills to full every <b>24 hours</b>. You can spend <b>{FUEL_PURCHASE_COST} Nova Crystals</b> to buy +{FUEL_PURCHASE_AMOUNT} fuel, up to <b>{FUEL_PURCHASE_MAX} times</b> per cycle. Upgrade your <b>Reinforced Fuel Tank</b> for more capacity and <b>Fuel Injector Tune</b> to cut per-mission costs.</p>
          <H>Ship bonuses</H>
          <p>Your active ship and its mods apply at launch (fuel/time reduction) and at claim (stardust/XP boosts). Check the Ship Hangar.</p>
        </div>
      );
    case "combat":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>The <b>Arena</b> is automated PvP — your stats and gear fight an opponent in a simulated battle. You get <b>{ARENA_DAILY_FREE_BATTLES} free battles per day</b> (resets at midnight Eastern). After that, each fight costs <b>{ARENA_PAID_BATTLE_COST} Nova Crystals</b> and awards rating only.</p>
          <H>Rating</H>
          <ul className="space-y-1.5">
            <Li>Winning raises your <b>rating</b>; losing lowers it. Climb the leaderboard by rating alone.</Li>
            <Li>Beating higher-rated opponents gives bonus rating.</Li>
            <Li>Chain wins for a <b>streak</b> — hit milestones for news feed glory.</Li>
          </ul>
          <H>Rewards</H>
          <p>Free battles earn XP and stardust on a <b>win</b> only — losses grant nothing (rating still changes). After your free quota, battles cost Nova Crystals and award rating only.</p>
          <H>Power</H>
          <p>Your combat power comes from level + attributes + equipped gear rarity. Buy attributes with Stardust (each attribute has its own cost curve) and upgrade gear to climb the ladder.</p>
          <H>Attributes</H>
          <ul className="space-y-1.5">
            <Li><b>Strength</b> — Strength damage for STR classes; Armor vs Strength damage for AGI/INT (STR classes get 0% Armor from Strength).</Li>
            <Li><b>Agility</b> — Dodge for all; Agility damage for AGI classes (bypasses Armor &amp; Tech Resist).</Li>
            <Li><b>Intellect</b> — Tech damage for INT classes; Tech Resist for STR/AGI (INT classes get 0% Tech Resist from Intellect).</Li>
            <Li><b>Vitality</b> — Max HP for all: round(50 + 2.5×VIT + 0.008×VIT²).</Li>
            <Li><b>Luck</b> — Crit Chance for all (cap 30%, soft-capped before Lv100, 1.5× crit damage).</Li>
          </ul>
        </div>
      );
    case "galaxy":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>The <b>Galaxy Map</b> (Nav Deck) is a turn-based dungeon crawl across planets. Each planet has enemies to clear and a boss to defeat. You get <b>{DUNGEON_DEATHS_PER_DAY} free lives per day</b> (midnight Eastern); further fights cost <b>{DUNGEON_CONTINUE_COST} Nova Crystals</b>.</p>
          <ul className="space-y-1.5">
            <Li>Fight enemies in sequence — battles are auto-simulated like the arena.</Li>
            <Li>Defeating the <b>boss</b> clears the planet and advances you to the next.</Li>
            <Li>Rewards use <b>DRU</b> (Dungeon Reward Units): 1 DRU ≈ 1 fuel of mission payout at the enemy's level. XP pays at 87% of that rate.</Li>
            <Li>Loot and ship-mod unlocks drop from victories; bosses give the best hauls.</Li>
            <Li>Losses grant <b>no</b> XP or stardust — only a longer cooldown (and a spent life).</Li>
          </ul>
          <p className="text-xs text-muted-foreground">Your dungeon progress and highest sector are shown in your public stats.</p>
        </div>
      );
    case "market":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>The <b>Black Market</b> (Bazaar) sells rotating gear and stims for {STARDUST_GLYPH} stardust. The Armory usually includes a class signature weapon.</p>
          <H>Armory &amp; Stim Lab</H>
          <ul className="space-y-1.5">
            <Li>Both stalls refresh every <b>6 hours</b>. Spend <b>{SHOP_REFRESH_COST} Nova Crystals</b> to restock a stall early.</Li>
            <Li>Compare listed gear to what you have equipped before buying.</Li>
            <Li><b>Haggle</b> on armory pieces — about 40% of the time you get 15–20% off; if it fails, they yank the listing (no purchase).</Li>
            <Li>Rare <b>Scrap Crates</b> (2 commons) and <b>Stim Trios</b> show up as bundle deals.</Li>
          </ul>
          <H>Hot Deal</H>
          <p>One spotlight piece per day (midnight Eastern). It does <b>not</b> change when you restock the Armory — buy it or wait for tomorrow.</p>
        </div>
      );
    case "blackhole":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>The <b>Void</b> recycles gear you no longer need. Dissolve an item and it turns into {STARDUST_GLYPH} stardust — same payout whether you do it here or from your inventory.</p>
          <ul className="space-y-1.5">
            <Li>Only <b>unequipped</b> items can be dissolved.</Li>
            <Li>Yield scales with the item's <b>rarity</b>, <b>stats</b>, and <b>level requirement</b>, plus a per-type weight (weapons &amp; ship modules dissolve for more).</Li>
            <Li>It's the smart move for gear that's weaker than what you've equipped.</Li>
          </ul>
        </div>
      );
    case "ship":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>Your <b>ship</b> passively boosts missions. Visit the Ship Hangar to buy permanent <b>mods</b> with stardust.</p>
          <H>Upgrade categories</H>
          <ul className="space-y-1.5">
            <Li><b>Reinforced Fuel Tank</b> — more max fuel.</Li>
            <Li><b>Fuel Injector Tune</b> — less fuel per mission.</Li>
            <Li><b>Warp Drive</b> — shorter mission times.</Li>
            <Li><b>Stardust Magnet</b> — more stardust from missions.</Li>
            <Li><b>Neural Accelerator</b> — more XP from missions.</Li>
          </ul>
          <H>Ships</H>
          <p>Each ship keeps its own mod loadout — buy a new hull and keep flying your old one while you outfit the bay. Higher hulls cost a bit more to upgrade, but each mod tier runs <b>~8% stronger</b> than the same tier on the previous hull. Locked hulls show a bay preview and level progress. At <b>Lv 20</b> your Scout gets a free Fuel Tank tune. Full hulls unlock at 50 / 100 / 200.</p>
          <H>Fuel mounts</H>
          <p>Temporary mission-speed boosts bought from the hangar’s Fuel Mounts drawer. They do not replace permanent hull upgrades.</p>
        </div>
      );
    case "guilds":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p><b>Guilds</b> let you band together for shared progression, weekly challenges, and guild wars.</p>
          <ul className="space-y-1.5">
            <Li>Create or join a guild from the Guild page. Members contribute to a collective pool.</Li>
            <Li><b>Weekly challenges</b> reward coordinated activity — missions, arena wins, and more.</Li>
            <Li>Guilds can war with each other for glory and rewards.</Li>
          </ul>
          <H>The Nexus</H>
          <p>The <b>Nexus</b> is a capturable central stronghold. The guild holding it gains a <b>+5% mission stardust</b> perk for all members. Other guilds can assault it to seize control.</p>
        </div>
      );
    case "social":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>Stay connected with the galaxy's other operatives.</p>
          <ul className="space-y-1.5">
            <Li><b>Friends</b> — send and accept friend requests, see who's online.</Li>
            <Li><b>Messages</b> — private one-on-one conversations. Alerts and system notices live in the blue bell button (bottom-right).</Li>
            <Li><b>Mail</b> — receive system mail and rewards. Some mail carries claimable rewards.</Li>
            <Li><b>Global Chat</b> — talk to everyone online. Mind the rules; report abuse if needed.</Li>
            <Li><b>Daily Login</b> — a 30-day reward calendar. Log in each day to claim; rewards escalate.</Li>
          </ul>
          <p className="text-xs text-muted-foreground"><Mail className="w-3 h-3 inline" /> Tip: check Mail and the notification bell regularly — rewards expire!</p>
        </div>
      );
    default:
      return null;
  }
}

export default function CodexModal({ open, onClose }) {
  const [active, setActive] = useState("start");

  useEffect(() => {
    if (!open) return;
    setActive("start");
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <GameplayOverlayPortal
          as={motion.div}
          className="z-[80] flex items-center justify-center p-3"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className="relative w-full max-w-2xl max-h-[84%] flex flex-col rounded-2xl border border-border/60 painted-panel canvas-grain"
          >
            <div className="flex items-center justify-between p-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-lg tracking-wide">Codex &amp; Guide</h2>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="px-3 py-1.5 border-b border-border/30 bg-primary/5 text-[11px] text-muted-foreground text-center">
              You can reopen this guide anytime from <b className="text-foreground">Settings → Codex</b>.
            </div>

            {/* Section tabs */}
            <div className="flex gap-1.5 p-2 overflow-x-auto border-b border-border/30">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const isActive = active === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.25 rounded-lg text-xs font-display font-semibold tracking-wide transition-colors border ${
                      isActive ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/20"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: isActive ? s.color : undefined }} />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="overflow-y-auto p-4">
              {renderSection(active)}
            </div>
          </motion.div>
        </GameplayOverlayPortal>
      )}
    </AnimatePresence>
  );
}