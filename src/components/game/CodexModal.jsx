import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, BookOpen, Coins, Rocket, Swords, Map as MapIcon, Orbit, Ship, Crown, Users,
  Fuel, Mail,
} from "lucide-react";

const SECTIONS = [
  { id: "start", label: "Getting Started", icon: BookOpen, color: "#22D3EE" },
  { id: "currencies", label: "Currencies", icon: Coins, color: "#FFD700" },
  { id: "missions", label: "Missions & Fuel", icon: Rocket, color: "#FF9E4F" },
  { id: "combat", label: "Combat & Arena", icon: Swords, color: "#FF4D6D" },
  { id: "galaxy", label: "Galaxy Dungeon", icon: MapIcon, color: "#00E5FF" },
  { id: "blackhole", label: "Black Hole", icon: Orbit, color: "#9D6BFF" },
  { id: "ship", label: "Ship & Mods", icon: Ship, color: "#FFD700" },
  { id: "guilds", label: "Guilds & Nexus", icon: Crown, color: "#A855F7" },
  { id: "social", label: "Social & Mail", icon: Users, color: "#34D399" },
];

function H({ children }) {
  return <h4 className="font-display font-semibold text-[11px] uppercase tracking-wide text-muted-foreground mt-3 mb-1">{children}</h4>;
}
function Li({ children }) { return <li className="ml-4 list-disc marker:text-muted-foreground">{children}</li>; }

function renderSection(id) {
  switch (id) {
    case "start":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>Welcome to <span className="text-primary font-display font-bold">LOOT & LASERS</span>, operative. You command a space station drifting through the cosmos. Here's how to get going:</p>
          <H>Your First Steps</H>
          <ul className="space-y-1.5">
            <Li><b>Missions</b> are your main income — head to the <span className="text-amber-400">Cantina</span>, pick a quest, and launch it using <Fuel className="w-3 h-3 inline" /> fuel.</Li>
            <Li>When a mission finishes, <b>claim</b> it for XP, stardust, and random loot. Level up to unlock harder sectors.</Li>
            <Li>Equip better gear on your <b>Character</b> page to raise your combat power.</Li>
            <Li>Spend <b>stat points</b> each level to shape your build.</Li>
            <Li>Try the <b>Arena</b> for PvP, or brave the <b>Galaxy Dungeon</b> for risky loot.</Li>
            <Li>Toss unwanted gear into the <b>Black Hole</b> to reclaim stardust.</Li>
          </ul>
          <H>Where things live</H>
          <p>The <b>station hub</b> on the home screen is your map — tap any glowing module to travel there. The <span className="text-amber-400">Cantina</span> gives quests, the <b>Nav Deck</b> is the dungeon, <b>Hero / Ship</b> is your character and vessel.</p>
          <p className="text-xs text-muted-foreground italic">Tip: this guide lives in <b>Settings → Codex</b> whenever you need a refresher.</p>
        </div>
      );
    case "currencies":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <H>✨ Stardust</H>
          <p>The primary currency. Earned from missions, arena, dungeons, daily rewards, and dissolving gear in the Black Hole. Spent in the Shop, on ship mods, to refresh the arena, and to buy extra arena attempts.</p>
          <H>💎 Nova Crystals</H>
          <p>Premium currency — buy them in the Crystal Store or earn them from daily rewards. Used to skip mission wait times and buy extra arena attempts.</p>
          <H><Fuel className="w-3 h-3 inline" /> Fuel</H>
          <p>Your mission energy. Each mission costs fuel based on its length and reward tier. You get a pool of 100 that <b>resets to full every 24 hours</b>. Need more sooner? Spend <b>Nova Crystals</b> to buy +20 fuel, up to 5 times per cycle.</p>
        </div>
      );
    case "missions":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>Missions are your steady engine for XP, stardust, and loot. Visit the <span className="text-amber-400">Cantina</span> to browse quests.</p>
          <H>How a mission works</H>
          <ul className="space-y-1.5">
            <Li>Each quest shows its <b>risk</b>, <b>duration</b>, and <b>fuel cost</b>. Higher risk = bigger rewards but longer waits.</Li>
            <Li>Launch it — fuel is consumed and a timer starts. You can keep playing while it runs.</Li>
            <Li>When the timer ends, the mission is ready to <b>claim</b>. Claiming grants XP, stardust, a loot drop, and sometimes a collectible.</Li>
            <Li>Impatient? Spend <b>Nova Crystals</b> to skip — cost scales with time left (5 💎 per remaining minute).</Li>
          </ul>
          <H>Fuel &amp; reset</H>
          <p>Your fuel pool refills to full every <b>24 hours</b>. You can spend <b>Nova Crystals</b> to buy +20 fuel, up to 5 times per cycle. Upgrade your <b>Reinforced Fuel Tank</b> for more capacity and <b>Fuel Injector Tune</b> to cut per-mission costs.</p>
          <H>Ship bonuses</H>
          <p>Your active ship and its mods apply at launch (fuel/time reduction) and at claim (stardust/XP boosts). Check the Ship Dock.</p>
        </div>
      );
    case "combat":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>The <b>Arena</b> is automated PvP — your stats and gear fight an opponent in a simulated battle. You get <b>5 attempts per day</b>.</p>
          <H>Rating</H>
          <ul className="space-y-1.5">
            <Li>Winning raises your <b>rating</b>; losing lowers it. Climb the leaderboard by rating alone.</Li>
            <Li>Beating higher-rated opponents gives bonus rating.</Li>
            <Li>Chain wins for a <b>streak</b> — hit milestones for news feed glory.</Li>
          </ul>
          <H>Rewards</H>
          <p>Free battles earn XP and stardust (wins give more). After your free quota, battles cost Nova Crystals and award rating only.</p>
          <H>Power</H>
          <p>Your combat power comes from level + attributes + equipped gear rarity. Upgrade gear and allocate stats to climb the ladder.</p>
        </div>
      );
    case "galaxy":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>The <b>Galaxy Map</b> (Nav Deck) is a turn-based dungeon crawl across planets. Each planet has enemies to clear and a boss to defeat.</p>
          <ul className="space-y-1.5">
            <Li>Fight enemies in sequence — battles are auto-simulated like the arena.</Li>
            <Li>Defeating the <b>boss</b> clears the planet and advances you to the next.</Li>
            <Li>Loot and stardust drop from victories; bosses give the best hauls.</Li>
          </ul>
          <p className="text-xs text-muted-foreground">Your dungeon progress and highest sector are shown in your public stats.</p>
        </div>
      );
    case "blackhole":
      return (
        <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
          <p>The <b>Black Hole</b> recycles gear you no longer need. Toss an item in and it dissolves into ✨ stardust.</p>
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
          <p>Your <b>ship</b> passively boosts missions. Visit the Ship Dock to buy permanent <b>mods</b> with stardust.</p>
          <H>Upgrade categories</H>
          <ul className="space-y-1.5">
            <Li><b>Reinforced Fuel Tank</b> — more max fuel.</Li>
            <Li><b>Fuel Injector Tune</b> — less fuel per mission.</Li>
            <Li><b>Warp Drive</b> — shorter mission times.</Li>
            <Li><b>Stardust Magnet</b> — more stardust from missions.</Li>
            <Li><b>Neural Accelerator</b> — more XP from missions.</Li>
          </ul>
          <H>Ships</H>
          <p>Each ship keeps its own mod loadout. Hulls unlock with major milestones — Frigate at 50, Cruiser at 100, Dreadnought at 200 — each with inherent bonuses that stack with your mods.</p>
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
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-border/60 painted-panel canvas-grain"
          >
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-lg tracking-wide">Codex &amp; Guide</h2>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="px-4 py-2 border-b border-border/30 bg-primary/5 text-[11px] text-muted-foreground text-center">
              You can reopen this guide anytime from <b className="text-foreground">Settings → Codex</b>.
            </div>

            {/* Section tabs */}
            <div className="flex gap-1.5 p-3 overflow-x-auto border-b border-border/30">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const isActive = active === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-semibold tracking-wide transition-colors border ${
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
            <div className="overflow-y-auto p-5">
              {renderSection(active)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}