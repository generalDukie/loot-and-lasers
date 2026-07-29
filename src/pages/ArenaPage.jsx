import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { getStatPointsForLevelRange } from "@/lib/gameData";
import { contributeArenaWin, getGuildMembership } from "@/lib/guildUtils";
import { processDiscovery } from "@/lib/discovery";
import { getCollectionStats } from "@/lib/collectionBonus";
import { getMyCharacter, primeMyCharacterCache } from "@/lib/socialEngine";
import { pushNotification } from "@/lib/notificationEngine";
import { toastNewAchievements } from "@/lib/achievementToasts";
import {
  ARENA_DAILY_FREE_BATTLES, ARENA_PAID_BATTLE_COST, ARENA_REFRESH_MS, ARENA_REFRESH_COST,
  ARENA_BATTLE_COOLDOWN_MS, ARENA_SKIP_COST, ARENA_CHALLENGER_SLOTS, ARENA_MAX_REAL_OPPONENTS,
  ARENA_RATING_BAND_WIDE,
  computePower, generateOpponents, characterToOpponent, simulateBattle, computeRewards,
  rankArenaCandidates, pickRankedCandidates, resolveOpponentItems,
} from "@/lib/arenaEngine";
import { loadArenaHistory, recordArenaMatch, resolveRevengeOpponent } from "@/lib/arenaHistory";
import ArenaOpponentCard from "@/components/game/ArenaOpponentCard";
import ArenaBattleOverlay from "@/components/game/ArenaBattleOverlay";
import ArenaNewsFeed from "@/components/game/ArenaNewsFeed";
import ArenaMatchHistory from "@/components/game/ArenaMatchHistory";
import CombatCompleteOverlay from "@/components/game/CombatCompleteOverlay";
import { ArenaBackdrop } from "@/components/game/ArenaBackdrop";
import FitScaleFrame from "@/components/game/FitScaleFrame";
import { Swords, Zap, RefreshCw, Flame, Shield, Clock } from "lucide-react";

import { msUntilNextETMidnight, formatEtaShort } from "@/lib/gameTime";
import { STARDUST_GLYPH } from "@/components/game/StardustIcon";
function fmtMs(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

async function guildTagForCharacter(characterId) {
  try {
    const membership = await getGuildMembership(characterId);
    if (!membership) return null;
    const guild = await api.entities.Guild.get(membership.guild_id);
    return guild?.tag || guild?.name || null;
  } catch {
    return null;
  }
}

// Fetch up to `maxReal` real players near the player's rating (then level),
// attach guild tags + equipped gear, and convert to opponent shape.
async function fetchRealOpponents(char, maxReal = ARENA_MAX_REAL_OPPONENTS, excludeIds = []) {
  try {
    const chars = await api.entities.Character.list("-arena_rating", 80);
    const myOwnerId = char.created_by_id;
    const exclude = new Set(excludeIds.filter(Boolean));
    const candidates = chars
      .filter((c) => c.id !== char.id)
      .filter((c) => !myOwnerId || c.created_by_id !== myOwnerId)
      .filter((c) => !exclude.has(c.id));
    if (!candidates.length) return [];

    const ranked = rankArenaCandidates(char, candidates);
    const picked = pickRankedCandidates(ranked, maxReal);
    const out = await Promise.all(picked.map(async (c) => {
      let eq = [];
      try { eq = (await api.entities.Item.filter({ character_id: c.id, is_equipped: true })) || []; } catch (e) {}
      const guildTag = await guildTagForCharacter(c.id);
      return characterToOpponent(c, eq, guildTag);
    }));
    return out;
  } catch (e) {
    return [];
  }
}

// Mixes real players (when available) with bots to fill the challenger slots.
// Prefers up to ARENA_MAX_REAL_OPPONENTS reals from the rating band; fills a 3rd
// real slot only when another fair (wide-band) match exists. Rest are bots.
// `excludeIds` lists real character ids already on screen so a replacement
// can never duplicate a challenger still showing in the current refresh.
async function buildOpponentPool(char, catalogItems, excludeIds = []) {
  const candidates = await fetchRealOpponents(char, ARENA_CHALLENGER_SLOTS, excludeIds);
  const myRating = char.arena_rating || 1000;
  let real = candidates.slice(0, ARENA_MAX_REAL_OPPONENTS);
  if (candidates.length >= 3) {
    const thirdGap = Math.abs((candidates[2].arena_rating || 1000) - myRating);
    if (thirdGap <= ARENA_RATING_BAND_WIDE) real = candidates.slice(0, 3);
  }
  const bots = generateOpponents(char, ARENA_CHALLENGER_SLOTS - real.length, catalogItems);
  const pool = [...real, ...bots];
  // Final guard: drop any duplicate real player within this refresh.
  const seen = new Set();
  const deduped = pool.filter((o) => {
    const key = o.realCharacterId ? `real-${o.realCharacterId}` : o.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Keep reals visible but shuffle within the board so slot order isn't fixed.
  return deduped.sort(() => Math.random() - 0.5);
}

export default function ArenaPage() {
  const [character, setCharacterState] = useState(null);
  const [equippedItems, setEquippedItems] = useState([]);
  const [opponents, setOpponents] = useState([]);
  const [freeBattlesLeft, setFreeBattlesLeft] = useState(ARENA_DAILY_FREE_BATTLES);
  const [refreshAt, setRefreshAt] = useState(Date.now() + ARENA_REFRESH_MS);
  const [now, setNow] = useState(Date.now());
  const [battleState, setBattleState] = useState(null);
  const [completeSummary, setCompleteSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalogItems, setCatalogItems] = useState([]);
  const [matchHistory, setMatchHistory] = useState([]);
  const [revengeBusyId, setRevengeBusyId] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const setCharacter = useCallback((next) => {
    setCharacterState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (value) primeMyCharacterCache(value);
      return value;
    });
  }, []);

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    // arena_attempts_left tracks FREE BATTLES remaining today. Reset to the cap
    // each new day; battles after the free quota cost nova crystals.
    let left = char.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
    try {
      const sync = await api.functions.invoke("SyncArenaDay", {});
      const patch = sync.patch || sync.data?.patch;
      if (patch) Object.assign(char, patch);
      left = char.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
    } catch (e) { /* non-blocking */ }
    let items = [];
    try { items = await api.entities.Item.list(null, 250); } catch (e) {}
    setCatalogItems(items);
    setCharacter(char);
    setFreeBattlesLeft(left);
    setOpponents(await buildOpponentPool(char, items));
    setMatchHistory(await loadArenaHistory(char.id));
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
      toast({ title: "Not enough stardust", description: `Instant refresh costs ${ARENA_REFRESH_COST} ${STARDUST_GLYPH}.`, variant: "destructive" });
      return;
    }
    const res = await api.functions.invoke("RefreshArenaOpponents", { charge: true });
    const upd = res.patch || res.data?.patch || {};
    setCharacter((c) => ({ ...c, ...upd }));
    setOpponents(await buildOpponentPool({ ...character, ...upd }, catalogItems));
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
    const oppItems = resolveOpponentItems(opp, catalogItems);
    const battle = simulateBattle(character, opp, equippedItems, oppItems);
    const rewards = computeRewards(character, opp, battle.winner === "player", isFree);
    setBattleState({ battle, opp: { ...opp, equippedItems: oppItems.length ? oppItems : opp.equippedItems }, rewards, isFree, skipped: skipping });
  }

  async function handleRevenge(match) {
    if (revengeBusyId) return;
    setRevengeBusyId(match.id);
    try {
      const opp = await resolveRevengeOpponent(match, catalogItems);
      if (!opp) {
        toast({ title: "Opponent unavailable", description: "Could not rebuild that rival for a rematch.", variant: "destructive" });
        return;
      }
      handleChallenge(opp, { skip: cooldownActive });
    } finally {
      setRevengeBusyId(null);
    }
  }

  async function finishBattle() {
    const { battle, opp, rewards, isFree, skipped } = battleState;
    const { percentage: collectPct } = getCollectionStats(character);
    const prevLevel = character.level;
    const prevStreak = character.arena_streak || 0;
    const maxPlayerHit = Math.max(0, ...battle.events.filter((e) => e.attacker === "player" && e.damage).map((e) => e.damage));
    const skipCost = skipped ? ARENA_SKIP_COST : 0;
    const battleCost = isFree ? 0 : ARENA_PAID_BATTLE_COST;

    let res;
    try {
      res = await api.functions.invoke("FinishArenaBattle", {
        won: rewards.won,
        is_free: isFree,
        skipped: !!skipped,
        skip_cooldown: !!skipped,
        opponent: { arena_rating: opp.arena_rating, id: opp.id, speciesId: opp.speciesId },
        max_hit: maxPlayerHit,
        species_id: opp.speciesId,
      });
    } catch (e) {
      toast({ title: "Could not settle arena battle", description: e?.message || "Try again.", variant: "destructive" });
      setBattleState(null);
      await load();
      return;
    }
    const update = res.patch || res.data?.patch || {};
    const fullChar = res.character || res.data?.character;
    toastNewAchievements(res, toast);
    const serverRewards = res.rewards || res.data?.rewards || rewards;
    const boostedXp = serverRewards.experience || 0;
    const stardustGain = rewards.won ? (serverRewards.stardust || 0) : 0;
    const newLevel = update.level ?? character.level;
    const newRating = update.arena_rating ?? (character.arena_rating || 1000);
    const newStreak = update.arena_streak ?? (rewards.won ? prevStreak + 1 : 0);
    const oppItems = resolveOpponentItems(opp, catalogItems);
    const gearItems = oppItems.map((it) => ({
      id: it.id, name: it.name, type: it.type, rarity: it.rarity, base_name: it.base_name,
    }));
    const { found: discFound } = processDiscovery(character, { win: rewards.won, speciesId: opp.speciesId, gearItems });
    if ((skipCost || 0) + (battleCost || 0)) void trackNovaSpend(character, (skipCost || 0) + (battleCost || 0), "arena");

    // Galaxy news (fire-and-forget so a feed hiccup never blocks rewards)
    const pname = character.name;
    void api.entities.GalaxyNews.create({
      message: rewards.won ? `🚀 ${pname} defeated ${opp.name} in the Arena.` : `💀 ${opp.name} defeated ${pname} in the Arena.`,
      entry_type: rewards.won ? "victory" : "defeat",
      character_name: pname,
      character_id: character.id,
    });
    if (rewards.won && [5, 10, 15, 20].includes(newStreak)) {
      void api.entities.GalaxyNews.create({ message: `🔥 ${pname} is on a ${newStreak}-match win streak!`, entry_type: "streak", character_name: pname, character_id: character.id });
    }
    if (!rewards.won && prevStreak >= 5) {
      void api.entities.GalaxyNews.create({ message: `💀 ${pname}'s ${prevStreak}-match win streak has ended.`, entry_type: "streak", character_name: pname, character_id: character.id });
    }

    // Feed Arena wins into the guild weekly challenge (fire-and-forget)
    if (rewards.won) void contributeArenaWin(character);

    // Personal match log for revenge rematches
    void recordArenaMatch({
      characterId: character.id,
      opp,
      won: rewards.won,
      ratingDelta: rewards.arena_rating_delta,
      ratingAfter: newRating,
    }).then(async () => {
      setMatchHistory(await loadArenaHistory(character.id));
    });

    setCharacter((c) => ({ ...c, ...(fullChar || update) }));
    setFreeBattlesLeft((a) => Math.max(0, a - (isFree ? 1 : 0)));
    setBattleState(null);
    // Replace the just-fought challenger with a fresh mixed (real+bots) pick,
    // excluding real players already shown so no one appears twice at once.
    // Revenge fights may not be on the board — only swap if they were.
    const excludeIds = opponents.filter((o) => o.id !== opp.id).map((o) => o.realCharacterId).filter(Boolean);
    const onBoard = opponents.some((o) => o.id === opp.id);
    if (onBoard) {
      const replacement = (await buildOpponentPool(character, catalogItems, excludeIds))[0];
      setOpponents((prev) => prev.map((o) => (o.id === opp.id ? replacement : o)));
    }

    if (discFound.length) {
      pushNotification({ owner_id: character.id, type: "system", title: "🔎 Discovery!", body: discFound.map((f) => `${f.emoji} ${f.name}`).join(" · ") });
    }

    setCompleteSummary({
      mode: "arena",
      won: rewards.won,
      title: rewards.won ? `Defeated ${opp.name}` : `Defeated by ${opp.name}`,
      subtitle: `Lv ${opp.level} · ${opp.race} · ${opp.class}`,
      xp: rewards.won && boostedXp > 0 ? { base: rewards.experience || 0, collectionPct: collectPct, total: boostedXp } : undefined,
      stardust: rewards.won && stardustGain > 0 ? { total: stardustGain } : undefined,
      ratingDelta: rewards.arena_rating_delta,
      leveledUp: newLevel > prevLevel,
      prevLevel,
      newLevel,
      statPoints: getStatPointsForLevelRange(prevLevel, newLevel),
      discoveries: discFound,
      note: !rewards.won
        ? "No rewards on defeat"
        : (!isFree ? `Paid battle (−${ARENA_PAID_BATTLE_COST} 💎) — rating only` : undefined),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const power = computePower(character, equippedItems);
  const wins = character.arena_wins || 0;
  const losses = character.arena_losses || 0;
  const streak = character.arena_streak || 0;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col -mx-3 sm:-mx-4 px-3 sm:px-4 overflow-hidden">
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-2xl opacity-[0.55] pointer-events-none">
        <ArenaBackdrop />
        <div className="absolute inset-0 bg-background/55" />
      </div>

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
      {completeSummary && (
        <CombatCompleteOverlay summary={completeSummary} onClose={() => setCompleteSummary(null)} />
      )}

      <FitScaleFrame>
        <div className="flex flex-col gap-2.5 pb-1">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 16 }}
            className="relative rounded-xl border border-border/60 painted-panel painted-frame canvas-grain overflow-hidden"
          >
            <div className="absolute inset-0 pointer-events-none" style={{
              background: "radial-gradient(ellipse 60% 80% at 10% 50%, rgba(251,191,36,0.12), transparent 55%), radial-gradient(ellipse 50% 70% at 90% 30%, rgba(34,211,238,0.1), transparent 50%)",
            }} />
            <div className="relative px-3 py-2.5 sm:px-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-[9px] font-display tracking-[0.2em] uppercase text-cyan-300/80">Combat Colosseum</p>
                  <h1 className="font-display font-black text-lg sm:text-xl tracking-wider flex items-center gap-1.5">
                    <Swords className="w-5 h-5 text-primary" /> Battle Arena
                  </h1>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[8px] font-display tracking-widest uppercase text-muted-foreground">Rating</p>
                  <p className="font-display font-black text-2xl text-amber-300 leading-none drop-shadow-[0_0_10px_rgba(251,191,36,0.35)]">
                    {character.arena_rating || 0}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <Stat icon={Zap} label="Power" value={power} color="#22D3EE" />
                <Stat icon={Swords} label="W / L" value={`${wins} / ${losses}`} color="#60A5FA" />
                <Stat icon={Flame} label="Streak" value={streak} color="#FB7185" />
                <Stat icon={Shield} label="Free" value={`${freeBattlesLeft}/${ARENA_DAILY_FREE_BATTLES}`} hint={`resets ${formatEtaShort(msUntilNextETMidnight(now))}`} color="#FBBF24" />
              </div>
            </div>
          </motion.div>

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[10px] font-display font-bold tracking-[0.18em] text-muted-foreground">CHALLENGERS</h2>
            <button
              onClick={refreshOpponents}
              className="text-[10px] px-2.5 py-1 rounded-full font-display font-semibold flex items-center gap-1.5 transition-colors bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25"
            >
              <RefreshCw className="w-3 h-3" /> {canFreeRefresh ? "Refresh" : `Refresh · ${ARENA_REFRESH_COST} ${STARDUST_GLYPH}`}
              {!canFreeRefresh && <span className="text-muted-foreground font-body font-normal">{fmtMs(refreshAt - now)}</span>}
            </button>
          </div>

          {cooldownActive && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 backdrop-blur-sm">
              <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="text-[10px] text-amber-200 font-display">
                Cooldown {fmtMs(cooldownEnds - now)} — skip from any challenger ({ARENA_SKIP_COST} 💎).
              </span>
            </div>
          )}

          <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
            {opponents.map((o, i) => (
              <motion.div
                key={o.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 380, damping: 22 }}
                className="min-h-0"
              >
                <ArenaOpponentCard
                  opponent={o}
                  player={character}
                  playerPower={power}
                  freeBattle={freeBattlesLeft > 0}
                  onChallenge={handleChallenge}
                  cooldownActive={cooldownActive}
                  skipCost={ARENA_SKIP_COST}
                />
              </motion.div>
            ))}
          </div>

          {freeBattlesLeft <= 0 && (
            <div className="text-center text-[10px] text-muted-foreground rounded-md border border-border/40 bg-card/40 px-2 py-1">
              Free battles used — keep climbing for {ARENA_PAID_BATTLE_COST} 💎 per battle (rating only).
            </div>
          )}

          <div className="grid gap-2.5 lg:grid-cols-2">
            <ArenaMatchHistory
              matches={matchHistory}
              onRevenge={handleRevenge}
              revengeBusyId={revengeBusyId}
              compact
            />
            <ArenaNewsFeed compact />
          </div>
        </div>
      </FitScaleFrame>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, color }) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-background/45 border border-border/50 flex items-center gap-2 backdrop-blur-sm">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${color}22`, color }}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[8px] text-muted-foreground uppercase tracking-wide leading-none">{label}</p>
        <p className="font-display font-bold text-xs truncate leading-tight" style={{ color }}>{value}</p>
        {hint && <p className="text-[8px] text-muted-foreground/80 leading-tight truncate">{hint}</p>}
      </div>
    </div>
  );
}