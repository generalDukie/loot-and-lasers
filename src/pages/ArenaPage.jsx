import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getExpForLevel } from "@/lib/gameData";
import { contributeArenaWin } from "@/lib/guildUtils";
import { processDiscovery } from "@/lib/discovery";
import { getCollectionStats, applyXpBonus } from "@/lib/collectionBonus";
import { getMyCharacter } from "@/lib/socialEngine";
import { pushNotification } from "@/lib/notificationEngine";
import {
  ARENA_DAILY_FREE_BATTLES, ARENA_PAID_BATTLE_COST, ARENA_REFRESH_MS, ARENA_REFRESH_COST,
  ARENA_BATTLE_COOLDOWN_MS, ARENA_SKIP_COST,
  computePower, generateOpponents, characterToOpponent, simulateBattle, computeRewards,
  getDivision,
} from "@/lib/arenaEngine";
import ArenaOpponentCard from "@/components/game/ArenaOpponentCard";
import ArenaBattleOverlay from "@/components/game/ArenaBattleOverlay";
import ArenaNewsFeed from "@/components/game/ArenaNewsFeed";
import { Swords, Trophy, Zap, RefreshCw, Flame, Shield, Crown, Clock } from "lucide-react";

// Resolve an opponent's equipped gear to full item records — real opponents
// carry `equippedItems` directly; bots only carry `equippedItemIds` that must be
// looked up against the loaded catalog. Used to render the enemy's weapon.
function resolveOpponentItems(opp, catalogItems) {
  if (opp.equippedItems?.length) return opp.equippedItems;
  if (opp.equippedItemIds?.length) {
    return opp.equippedItemIds.map((id) => catalogItems.find((c) => c.id === id)).filter(Boolean);
  }
  return [];
}

import { todayET } from "@/lib/gameTime";
function fmtMs(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

// Fetch up to `maxReal` real player characters near the player's level/rating and
// convert them to opponent shape. Falls back to all-bots if no other players exist.
async function fetchRealOpponents(char, maxReal = 1, excludeIds = []) {
  try {
    const chars = await api.entities.Character.list("-arena_rating", 60);
    const candidates = chars
      .filter((c) => c.id !== char.id)
      .filter((c) => !excludeIds.includes(c.id))
      .filter((c) => Math.abs((c.level || 1) - (char.level || 1)) <= 6);
    if (!candidates.length) return [];
    const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, maxReal);
    const out = [];
    for (const c of shuffled) {
      let eq = [];
      try { eq = (await api.entities.Item.filter({ character_id: c.id, is_equipped: true })) || []; } catch (e) {}
      out.push(characterToOpponent(c, eq));
    }
    return out;
  } catch (e) {
    return [];
  }
}

// Mixes real players (when available) with bots to fill the challenger slots.
// `excludeIds` lists real character ids already on screen so a replacement
// can never duplicate a challenger still showing in the current refresh.
async function buildOpponentPool(char, catalogItems, excludeIds = []) {
  const real = await fetchRealOpponents(char, 1, excludeIds);
  const bots = generateOpponents(char, 3 - real.length, catalogItems);
  const pool = [...real, ...bots];
  // Final guard: drop any duplicate real player within this refresh.
  const seen = new Set();
  const deduped = pool.filter((o) => {
    const key = o.realCharacterId ? `real-${o.realCharacterId}` : o.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.sort(() => Math.random() - 0.5);
}

export default function ArenaPage() {
  const [character, setCharacter] = useState(null);
  const [equippedItems, setEquippedItems] = useState([]);
  const [opponents, setOpponents] = useState([]);
  const [freeBattlesLeft, setFreeBattlesLeft] = useState(ARENA_DAILY_FREE_BATTLES);
  const [refreshAt, setRefreshAt] = useState(Date.now() + ARENA_REFRESH_MS);
  const [now, setNow] = useState(Date.now());
  const [battleState, setBattleState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalogItems, setCatalogItems] = useState([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    const today = todayET();
    // arena_attempts_left tracks FREE BATTLES remaining today. Reset to the cap
    // each new day; battles after the free quota cost nova crystals.
    let left = char.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
    if (char.arena_attempts_date !== today) {
      left = ARENA_DAILY_FREE_BATTLES;
      try { await api.entities.Character.update(char.id, { arena_attempts_left: left, arena_attempts_date: today }); } catch (e) {}
      char.arena_attempts_left = left;
      char.arena_attempts_date = today;
    }
    let items = [];
    try { items = await api.entities.Item.list(null, 250); } catch (e) {}
    setCatalogItems(items);
    setCharacter(char);
    setFreeBattlesLeft(left);
    setOpponents(await buildOpponentPool(char, items));
    setLoading(false);
    // Equipped gear feeds the power readout — load it best-effort so a hiccup
    // never traps the page on the loading spinner.
    try { setEquippedItems((await api.entities.Item.filter({ character_id: char.id, is_equipped: true })) || []); } catch (e) {}
  }, [navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const canFreeRefresh = now >= refreshAt;
  const cooldownEnds = character?.arena_cooldown_at ? new Date(character.arena_cooldown_at).getTime() + ARENA_BATTLE_COOLDOWN_MS : 0;
  const cooldownActive = now < cooldownEnds;

  async function refreshOpponents() {
    if (canFreeRefresh) {
      setOpponents(await buildOpponentPool(character, catalogItems));
      setRefreshAt(Date.now() + ARENA_REFRESH_MS);
      return;
    }
    if ((character.stardust || 0) < ARENA_REFRESH_COST) {
      toast({ title: "Not enough stardust", description: `Instant refresh costs ${ARENA_REFRESH_COST} ✨.`, variant: "destructive" });
      return;
    }
    const upd = { stardust: (character.stardust || 0) - ARENA_REFRESH_COST };
    await api.entities.Character.update(character.id, upd);
    setCharacter((c) => ({ ...c, ...upd }));
    setOpponents(await buildOpponentPool(character, catalogItems));
  }

  // When the player is on cooldown, each challenger's button becomes a
  // "Skip & Challenge" action — one click pays the skip cost and fights that
  // opponent, removing the old two-step skip-then-challenge flow.
  function handleChallenge(opp, opts = {}) {
    if (cooldownActive && !opts.skip) {
      toast({ title: "Battle Cooldown", description: `Skip with ${ARENA_SKIP_COST} 💎 to fight now.`, variant: "destructive" });
      return;
    }
    const skipping = cooldownActive && opts.skip;
    const isFree = freeBattlesLeft > 0;
    const totalCost = (skipping ? ARENA_SKIP_COST : 0) + (isFree ? 0 : ARENA_PAID_BATTLE_COST);
    if (totalCost > 0 && (character.nova_crystals || 0) < totalCost) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${totalCost} 💎 to fight now.`, variant: "destructive" });
      return;
    }
    const battle = simulateBattle(character, opp, equippedItems, opp.equippedItems || []);
    const rewards = computeRewards(character, opp, battle.winner === "player", isFree);
    setBattleState({ battle, opp, rewards, isFree, skipped: skipping });
  }

  async function finishBattle() {
    const { battle, opp, rewards, isFree, skipped } = battleState;
    const { percentage: collectPct } = getCollectionStats(character, catalogItems.length);
    const boostedXp = applyXpBonus(rewards.experience, collectPct);
    let newExp = (character.experience || 0) + boostedXp;
    let newLevel = character.level;
    let expToNext = character.experience_to_next_level;
    while (newExp >= expToNext) { newExp -= expToNext; newLevel++; expToNext = getExpForLevel(newLevel); }

    const prevRating = character.arena_rating || 1000;
    const newRating = Math.max(0, prevRating + rewards.arena_rating_delta);
    const prevDiv = getDivision(prevRating).label;
    const newDiv = getDivision(newRating).label;
    const prevStreak = character.arena_streak || 0;
    const newStreak = rewards.won ? prevStreak + 1 : 0;
    const newMaxStreak = Math.max(character.arena_max_streak || 0, newStreak);

    const maxPlayerHit = Math.max(0, ...battle.events.filter((e) => e.attacker === "player" && e.damage).map((e) => e.damage));
    // First 10 battles/day are free (xp + stardust + rating). After that each
    // battle costs nova crystals and yields rating only — unlimited climbing.
    const update = {
      experience: newExp,
      level: newLevel,
      experience_to_next_level: expToNext,
      stardust: (character.stardust || 0) + rewards.stardust,
      total_stardust_earned: (character.total_stardust_earned || 0) + rewards.stardust,
      highest_damage: Math.max(character.highest_damage || 0, maxPlayerHit),
      arena_rating: newRating,
      arena_wins: (character.arena_wins || 0) + (rewards.won ? 1 : 0),
      arena_losses: (character.arena_losses || 0) + (rewards.won ? 0 : 1),
      arena_streak: newStreak,
      arena_max_streak: newMaxStreak,
      arena_battles: (character.arena_battles || 0) + 1,
      arena_attempts_left: Math.max(0, freeBattlesLeft - (isFree ? 1 : 0)),
      arena_cooldown_at: new Date().toISOString(),
      unspent_stat_points: (character.unspent_stat_points || 0) + (newLevel - character.level) * 4,
    };
    const skipCost = skipped ? ARENA_SKIP_COST : 0;
    const battleCost = isFree ? 0 : ARENA_PAID_BATTLE_COST;
    if (skipCost || battleCost) update.nova_crystals = (character.nova_crystals || 0) - skipCost - battleCost;
    const gearItems = (opp.equippedItemIds || []).map((id) => {
      const it = catalogItems.find((c) => c.id === id);
      return it ? { id: it.id, name: it.name, type: it.type, rarity: it.rarity } : null;
    }).filter(Boolean);
    const { updates: discUpdates, found: discFound } = processDiscovery(character, { win: rewards.won, speciesId: opp.speciesId, gearItems });
    Object.assign(update, discUpdates);
    await api.entities.Character.update(character.id, update);
    if ((skipCost || 0) + (battleCost || 0)) void trackNovaSpend(character, (skipCost || 0) + (battleCost || 0), "arena");

    // Galaxy news (fire-and-forget so a feed hiccup never blocks rewards)
    const pname = character.name;
    void api.entities.GalaxyNews.create({
      message: rewards.won ? `🚀 ${pname} defeated ${opp.name} in the Arena.` : `💀 ${opp.name} defeated ${pname} in the Arena.`,
      entry_type: rewards.won ? "victory" : "defeat",
      character_name: pname,
    });
    if (rewards.won && newDiv !== prevDiv) {
      void api.entities.GalaxyNews.create({ message: `👑 ${pname} has been promoted to ${newDiv}.`, entry_type: "rankup", character_name: pname });
    }
    if (rewards.won && [5, 10, 15, 20].includes(newStreak)) {
      void api.entities.GalaxyNews.create({ message: `🔥 ${pname} is on a ${newStreak}-match win streak!`, entry_type: "streak", character_name: pname });
    }
    if (!rewards.won && prevStreak >= 5) {
      void api.entities.GalaxyNews.create({ message: `💀 ${pname}'s ${prevStreak}-match win streak has ended.`, entry_type: "streak", character_name: pname });
    }

    // Feed Arena wins into the guild weekly challenge (fire-and-forget)
    if (rewards.won) void contributeArenaWin(character);

    setCharacter((c) => ({ ...c, ...update }));
    setFreeBattlesLeft((a) => Math.max(0, a - (isFree ? 1 : 0)));
    setBattleState(null);
    // Replace the just-fought challenger with a fresh mixed (real+bots) pick,
    // excluding real players already shown so no one appears twice at once.
    const excludeIds = opponents.filter((o) => o.id !== opp.id).map((o) => o.realCharacterId).filter(Boolean);
    const replacement = (await buildOpponentPool(character, catalogItems, excludeIds))[0];
    setOpponents((prev) => prev.map((o) => (o.id === opp.id ? replacement : o)));

    const rewTxt = isFree
      ? `+${boostedXp} XP · +${rewards.stardust} ✨ · `
      : `-${ARENA_PAID_BATTLE_COST} 💎 · `;
    toast({
      title: rewards.won ? "🎉 Victory!" : "Defeat",
      description: `${rewTxt}${rewards.arena_rating_delta >= 0 ? "+" : ""}${rewards.arena_rating_delta} rating${newLevel > character.level ? ` · LEVEL UP! → ${newLevel}` : ""}`,
    });
    if (discFound.length) {
      pushNotification({ owner_id: character.id, type: "system", title: "🔎 Discovery!", body: discFound.map((f) => `${f.emoji} ${f.name}`).join(" · ") });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const power = computePower(character, equippedItems);
  const division = getDivision(character.arena_rating || 0);
  const wins = character.arena_wins || 0;
  const losses = character.arena_losses || 0;
  const streak = character.arena_streak || 0;

  return (
    <div className="space-y-6">
      {battleState && (
        <ArenaBattleOverlay
          player={character}
          opponent={battleState.opp}
          battle={battleState.battle}
          onDone={finishBattle}
          playerItems={equippedItems}
          opponentItems={resolveOpponentItems(battleState.opp, catalogItems)}
        />
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 16 }}>
        <h1 className="font-display font-bold text-xl tracking-wider flex items-center gap-2 mb-3">
          <Swords className="w-5 h-5 text-primary" /> Battle Arena
        </h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat icon={Trophy} label="Rating" value={character.arena_rating || 0} color="#FFD700" />
          <Stat icon={Crown} label="Rank" value={division.label} color="#A855F7" />
          <Stat icon={Zap} label="Power" value={power} color="#22D3EE" />
          <Stat icon={Swords} label="W / L" value={`${wins} / ${losses}`} color="#60A5FA" />
          <Stat icon={Flame} label="Streak" value={streak} color="#FB7185" />
          <div className="p-2 rounded-lg bg-card/60 border border-border/50 flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-300" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Free Battles</p>
              <p className="font-display font-bold text-sm text-amber-300">{freeBattlesLeft}/{ARENA_DAILY_FREE_BATTLES}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Opponents */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-display font-semibold text-muted-foreground tracking-wide">CHALLENGERS</h2>
        <button
          onClick={refreshOpponents}
          className="text-xs px-3 py-1 rounded-full font-medium flex items-center gap-1 transition-colors bg-accent/10 text-accent hover:bg-accent/20"
        >
          <RefreshCw className="w-3 h-3" /> {canFreeRefresh ? "Refresh" : `Refresh (${ARENA_REFRESH_COST} ✨)`}
          {!canFreeRefresh && <span className="text-muted-foreground ml-1">{fmtMs(refreshAt - now)}</span>}
        </button>
      </div>

      {cooldownActive && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="text-xs text-amber-300 font-display">Battle cooldown — {fmtMs(cooldownEnds - now)} left · skip from any challenger below ({ARENA_SKIP_COST} 💎).</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {opponents.map((o) => (
          <ArenaOpponentCard key={o.id} opponent={o} onChallenge={handleChallenge} cooldownActive={cooldownActive} skipCost={ARENA_SKIP_COST} />
        ))}
      </div>

      {freeBattlesLeft <= 0 && (
        <div className="text-center text-xs text-muted-foreground">
          Free battles used — keep climbing for {ARENA_PAID_BATTLE_COST} 💎 per battle (rating only).
        </div>
      )}

      <ArenaNewsFeed />
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="p-2 rounded-lg bg-card/60 border border-border/50 flex items-center gap-2">
      <Icon className="w-4 h-4" style={{ color }} />
      <div className="min-w-0">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="font-display font-bold text-sm truncate" style={{ color }}>{value}</p>
      </div>
    </div>
  );
}