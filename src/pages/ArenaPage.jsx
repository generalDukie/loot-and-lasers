import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { trackStardustSpend } from "@/lib/stardustTracker";
import { useNavigate, useLocation } from "react-router-dom";
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
  generateOpponents, characterToOpponent, simulateBattle, computeRewards,
  rankArenaCandidates, pickRankedCandidates, resolveOpponentItems, ladderBotToOpponent,
} from "@/lib/arenaEngine";
import { defenseSnapshotToOpponent } from "@/lib/arenaChallenge";
import { loadArenaHistory, recordArenaMatch, resolveRevengeOpponent } from "@/lib/arenaHistory";
import ArenaOpponentCard from "@/components/game/ArenaOpponentCard";
import ArenaBattleOverlay from "@/components/game/ArenaBattleOverlay";
import ArenaNewsFeed from "@/components/game/ArenaNewsFeed";
import ArenaMatchHistory from "@/components/game/ArenaMatchHistory";
import CombatCompleteOverlay from "@/components/game/CombatCompleteOverlay";
import LevelUpOverlay, { pendingLevelUpFromSummary } from "@/components/game/LevelUpOverlay";
import { ArenaBackdrop } from "@/components/game/ArenaBackdrop";
import FitScaleFrame from "@/components/game/FitScaleFrame";
import { Swords, RefreshCw, Flame, Shield, Clock } from "lucide-react";

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

// Prefer server-authored offers (stable offer_id). Fall back to legacy client mix.
async function buildOpponentPool(char, catalogItems, excludeIds = []) {
  void excludeIds;
  try {
    const res = await api.functions.invoke("GetArenaOpponents", {});
    const offers = res.opponents || res.data?.opponents || [];
    if (offers.length) {
      return offers.map((o) => ({
        ...o,
        offer_id: o.offer_id,
        isBot: !!(o.isBot || o.is_bot),
        equippedItems: [],
      }));
    }
  } catch { /* fall through to legacy */ }

  const candidates = await fetchRealOpponents(char, ARENA_CHALLENGER_SLOTS, excludeIds);
  const myRating = char.arena_rating || 1000;
  let real = candidates.slice(0, ARENA_MAX_REAL_OPPONENTS);
  if (candidates.length >= 3) {
    const thirdGap = Math.abs((candidates[2].arena_rating || 1000) - myRating);
    if (thirdGap <= ARENA_RATING_BAND_WIDE) real = candidates.slice(0, 3);
  }
  const needBots = Math.max(0, ARENA_CHALLENGER_SLOTS - real.length);
  let bots = [];
  if (needBots > 0) {
    try {
      const res = await api.arena.listBots({ characterId: char.id, limit: needBots + 2 });
      const ladder = (res?.bots || []).map((b) => ladderBotToOpponent(b, catalogItems)).filter(Boolean);
      bots = ladder.slice(0, needBots);
    } catch { /* fall through */ }
    if (bots.length < needBots) {
      bots = [
        ...bots,
        ...generateOpponents(char, needBots - bots.length, catalogItems),
      ];
    }
  }
  const pool = [...real, ...bots];
  const seen = new Set();
  const deduped = pool.filter((o) => {
    const key = o.realCharacterId ? `real-${o.realCharacterId}` : (o.arena_bot_id || o.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const [levelUp, setLevelUp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalogItems, setCatalogItems] = useState([]);
  const [matchHistory, setMatchHistory] = useState([]);
  const [revengeBusyId, setRevengeBusyId] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const directChallengeConsumed = useRef(false);

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
    // Incoming bot raids (settled server-side) — toast results, then load board.
    try {
      const raidRes = await api.arena.processBotRaids({ characterId: char.id, max: 2 });
      const raidPatch = raidRes?.patch;
      if (raidPatch) Object.assign(char, raidPatch);
      if (raidRes?.character) Object.assign(char, raidRes.character);
      setCharacter({ ...char });
      for (const raid of raidRes?.raids || []) {
        const delta = raid.playerRatingDelta || 0;
        toast({
          title: raid.playerWon
            ? `Defended vs ${raid.bot?.name || "a bot"}`
            : `Raided by ${raid.bot?.name || "a bot"}`,
          description: raid.playerWon
            ? `Held the Arena (${delta >= 0 ? "+" : ""}${delta} rating). Rival is now ${raid.bot?.arena_rating ?? "?"} rating.`
            : `Lost ${Math.abs(delta)} rating. ${raid.bot?.name || "Bot"} climbs to ${raid.bot?.arena_rating ?? "?"}.`,
          variant: raid.playerWon ? "default" : "destructive",
        });
      }
    } catch { /* non-blocking */ }
    setOpponents(await buildOpponentPool(char, items));
    setMatchHistory(await loadArenaHistory(char.id));
    setLoading(false);
    // Equipped gear for combat presentation — load best-effort so a hiccup
    // never traps the page on the loading spinner.
    try { setEquippedItems((await api.entities.Item.filter({ character_id: char.id, is_equipped: true })) || []); } catch (e) {}
  }, [navigate, setCharacter, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const canFreeRefresh = now >= refreshAt;
  const cooldownEnds = character?.arena_cooldown_at ? new Date(character.arena_cooldown_at).getTime() + ARENA_BATTLE_COOLDOWN_MS : 0;
  const cooldownActive = now < cooldownEnds;

  // Launch a leaderboard direct challenge once the arena has loaded.
  useEffect(() => {
    if (loading || !character || directChallengeConsumed.current) return;
    const dc = location.state?.directChallenge;
    if (!dc?.challengeId || !dc?.defenseSnapshot) return;
    directChallengeConsumed.current = true;
    navigate(location.pathname, { replace: true, state: {} });

    const opp = defenseSnapshotToOpponent(dc.defenseSnapshot);
    if (!opp) {
      toast({ title: "Challenge failed", description: "Defense snapshot missing.", variant: "destructive" });
      return;
    }

    if (dc.preview?.warningCode === "OPPONENT_TOO_LOW_FOR_RATING_GAIN") {
      toast({
        title: "No ranking points on victory",
        description: `You still risk ${Math.abs(dc.preview.estimatedLossChange || 0)} rating if you lose.`,
      });
    }

    const skipping = cooldownActive;
    const isFree = freeBattlesLeft > 0;
    const totalCost = (skipping ? ARENA_SKIP_COST : 0) + (isFree ? 0 : ARENA_PAID_BATTLE_COST);
    if (totalCost > 0 && (character.nova_crystals || 0) < totalCost) {
      toast({
        title: "Not enough Nova Crystals",
        description: `Need ${totalCost} 💎 to fight now. Challenge stays active until it expires.`,
        variant: "destructive",
      });
      return;
    }
    const oppItems = opp.equippedItems || [];
    const battle = simulateBattle(character, opp, equippedItems, oppItems);
    const estWin = dc.preview?.estimatedWinChange;
    const rewards = {
      ...computeRewards(character, opp, battle.winner === "player", isFree),
      arena_rating_delta:
        battle.winner === "player"
          ? (estWin ?? 0)
          : (dc.preview?.estimatedLossChange ?? -6),
    };
    setBattleState({
      battle,
      opp: { ...opp, equippedItems: oppItems },
      rewards,
      isFree,
      skipped: skipping,
      challengeId: dc.challengeId,
      policyVersion: dc.policyVersion,
    });
  }, [
    loading,
    character,
    location.state,
    location.pathname,
    navigate,
    toast,
    cooldownActive,
    freeBattlesLeft,
    equippedItems,
  ]);

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
    void trackStardustSpend(character, ARENA_REFRESH_COST, "arena_refresh");
    setOpponents(await buildOpponentPool({ ...character, ...upd }, catalogItems));
  }

  // When the player is on cooldown, each challenger's button becomes a
  // "Skip & Challenge" action — one click pays the skip cost and fights that
  // opponent, removing the old two-step skip-then-challenge flow.
  async function handleChallenge(opp, opts = {}) {
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

    const offerId = opp.offer_id || opp.offerId;
    if (offerId) {
      try {
        const prep = await api.functions.invoke("PrepareArenaCombat", {
          offer_id: offerId,
          is_free: isFree,
          skip_cooldown: !!skipping,
        });
        const combat = prep.combat || prep.data?.combat;
        const battle = combat?.battle || {
          winner: combat?.winner,
          events: combat?.events || [],
          playerMaxHp: combat?.playerMaxHp,
          opponentMaxHp: combat?.opponentMaxHp,
          playerEnd: combat?.playerEnd,
          opponentEnd: combat?.opponentEnd,
          initiativeFirstSide: combat?.opening_side,
        };
        const won = battle.winner === "player";
        const rewards = computeRewards(character, opp, won, isFree);
        setBattleState({
          battle,
          opp: { ...opp, ...(prep.opponent || {}) },
          rewards,
          isFree: prep.is_free ?? isFree,
          skipped: skipping,
          combat_id: combat?.combat_id,
          offer_id: offerId,
        });
        return;
      } catch (e) {
        toast({
          title: "Could not start Arena battle",
          description: e?.message || "Try refreshing opponents.",
          variant: "destructive",
        });
        return;
      }
    }

    // Legacy path (no offer_id) — client sim only for playback; Finish still strips won.
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
    const { battle, opp, rewards, isFree, skipped, challengeId, policyVersion, combat_id, offer_id } = battleState;
    const { percentage: collectPct } = getCollectionStats(character);
    const prevLevel = character.level;
    const prevStreak = character.arena_streak || 0;
    const skipCost = skipped ? ARENA_SKIP_COST : 0;
    const battleCost = isFree ? 0 : ARENA_PAID_BATTLE_COST;

    let res;
    try {
      if (challengeId) {
        res = await api.functions.invoke("FinishArenaBattle", {
          won: rewards.won,
          is_free: isFree,
          skipped: !!skipped,
          skip_cooldown: !!skipped,
          challenge_id: challengeId,
          policyVersion,
        });
      } else {
        res = await api.functions.invoke("FinishArenaBattle", {
          combat_id: combat_id || undefined,
          offer_id: offer_id || undefined,
          is_free: isFree,
          skipped: !!skipped,
          skip_cooldown: !!skipped,
        });
      }
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
    const won = challengeId
      ? !!rewards.won
      : (res.winner ? res.winner === "player" : !!serverRewards.won);
    const boostedXp = serverRewards.experience || 0;
    const stardustGain = won ? (serverRewards.stardust || 0) : 0;
    const newLevel = update.level ?? character.level;
    const newRating = update.arena_rating ?? (character.arena_rating || 1000);
    const newStreak = update.arena_streak ?? (won ? prevStreak + 1 : 0);
    const oppItems = resolveOpponentItems(opp, catalogItems);
    const gearItems = oppItems.map((it) => ({
      id: it.id, name: it.name, type: it.type, rarity: it.rarity, base_name: it.base_name,
    }));
    const { found: discFound } = processDiscovery(character, { win: won, speciesId: opp.speciesId, gearItems });
    if ((skipCost || 0) + (battleCost || 0)) void trackNovaSpend(character, (skipCost || 0) + (battleCost || 0), "arena");

    // Feed Arena wins into the guild weekly challenge (fire-and-forget)
    if (won) void contributeArenaWin(character);

    // Personal match log for revenge rematches
    void recordArenaMatch({
      characterId: character.id,
      opp,
      won,
      ratingDelta: serverRewards.arena_rating_delta ?? rewards.arena_rating_delta,
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
      won,
      title: won ? `Defeated ${opp.name}` : `Defeated by ${opp.name}`,
      subtitle: `Lv ${opp.level} · ${opp.race} · ${opp.class}`,
      xp: won && boostedXp > 0 ? { base: rewards.experience || 0, collectionPct: collectPct, total: boostedXp } : undefined,
      stardust: won && stardustGain > 0 ? { total: stardustGain } : undefined,
      ratingDelta: serverRewards.arena_rating_delta ?? rewards.arena_rating_delta,
      leveledUp: newLevel > prevLevel,
      prevLevel,
      newLevel,
      statPoints: getStatPointsForLevelRange(prevLevel, newLevel),
      discoveries: discFound,
      note: !won
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
        <CombatCompleteOverlay
          summary={completeSummary}
          onClose={() => {
            const pending = pendingLevelUpFromSummary(completeSummary);
            setCompleteSummary(null);
            if (pending) setLevelUp(pending);
          }}
        />
      )}
      {levelUp && (
        <LevelUpOverlay
          open
          fromLevel={levelUp.fromLevel}
          toLevel={levelUp.toLevel}
          character={character}
          attributeAwards={levelUp.attributeAwards}
          onConfirm={() => setLevelUp(null)}
        />
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

              <div className="grid grid-cols-3 gap-1.5">
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