import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { applyPendingLootFromResponse, countItems, getInventoryCap } from "@/lib/inventoryCap";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  FUEL_MAX,
  MISSION_MIN_FUEL,
  FUEL_PURCHASE_AMOUNT,
  FUEL_PURCHASE_COST,
  FUEL_PURCHASE_MAX,
  generateDailyMissions,
  generateLowFuelBoard,
  getModEffectTotal,
  getEffectiveFuelCost,
  getStatPointsForLevelRange,
  GEAR_CATALOG_TOTAL,
  computeMissionXpFromFuel,
  computeMissionStardustFromFuel,
  normalizeMissionEfficiency,
  normalizeFuelAmount,
} from "@/lib/gameData";
import { contributeMission, getGuildMembership } from "@/lib/guildUtils";
import { processDiscovery } from "@/lib/discovery";
import { getMyCharacter, primeMyCharacterCache } from "@/lib/socialEngine";
import { toastNewAchievements } from "@/lib/achievementToasts";
import { pushNotification } from "@/lib/notificationEngine";
import { getNexusOwnerGuildId } from "@/lib/nexusEngine";
import { useToast } from "@/components/ui/use-toast";
import { playMissionComplete } from "@/lib/audioEngine";
import { generateMissionEncounter } from "@/lib/missionCombat";
import { simulateBattle } from "@/lib/arenaEngine";
import { pickMissionExploreSceneIndex } from "@/components/game/MissionExploreBackdrop";
import { getCollectionStats, applyXpBonus } from "@/lib/collectionBonus";
import confetti from "canvas-confetti";

// Computes stardust/XP for a mission (UI preview only — server awards on claim).
// XP  = fuel × XP/fuel(level) × xp efficiency (L1–10 ±25%, L11+ ±10%)
// SD  = fuel × SD/fuel(level) × stardust efficiency (independent roll, same bands)
// then ship / nexus / collection bonuses.
export function computeMissionGains(character, mission, nexusBonus, gearTotal = GEAR_CATALOG_TOTAL) {
  const bonusMult = nexusBonus ? 1.05 : 1;
  const stardustMult = 1 + getModEffectTotal(character, "mission_stardust_mult");
  const xpMult = 1 + getModEffectTotal(character, "mission_xp_mult");
  const { percentage } = getCollectionStats(character, gearTotal);
  const fuelCost = getEffectiveFuelCost(character, mission);
  const level = character.level || 1;
  const sdEff = normalizeMissionEfficiency(mission?.stardust_efficiency, level);
  const xpEff = normalizeMissionEfficiency(mission?.xp_efficiency, level);
  const chartXp = computeMissionXpFromFuel(fuelCost, level, xpEff);
  const chartSd = computeMissionStardustFromFuel(fuelCost, level, sdEff);
  const baseXp = Math.round(chartXp * xpMult);
  return {
    bonusMult,
    fuelCost,
    efficiency: sdEff,
    xpEfficiency: xpEff,
    stardustGain: Math.round(chartSd * bonusMult * stardustMult),
    stardustBase: chartSd,
    xpBase: chartXp,
    xpGain: applyXpBonus(baseXp, percentage),
    collectionPct: percentage,
  };
}

// Skip cost scales with REMAINING mission time — skipping near the end is cheap,
// skipping at launch costs the full duration's worth (5 💎 per minute remaining).
export const SKIP_CRYSTALS_PER_MINUTE = 5;

export function skipCostFor(mission, nowMs = Date.now()) {
  if (!mission || !mission.end_time) return 0;
  const remainingMs = Math.max(0, new Date(mission.end_time).getTime() - nowMs);
  if (remainingMs <= 0) return 0;
  // Use fractional minutes so cost ticks down during short missions too
  // (ceil-to-whole-minute first made sub-minute waits look like a flat fee).
  const remainingMinutes = remainingMs / 60000;
  return Math.max(1, Math.ceil(remainingMinutes * SKIP_CRYSTALS_PER_MINUTE));
}

function formatTime(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function cantinaStorageKey(characterId) {
  return `loot_cantina_board_${characterId}`;
}

function readSavedCantinaBoard(characterId) {
  try {
    const raw = localStorage.getItem(cantinaStorageKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    if (!parsed.every((m) => m && m.name && m.patron?.name)) return null;
    // Backfill efficiency on older saved boards so preview/claim stay stable.
    return parsed.map((m) => ({
      ...m,
      stardust_efficiency: m.stardust_efficiency != null ? m.stardust_efficiency : 1,
      xp_efficiency: m.xp_efficiency != null ? m.xp_efficiency : 1,
    }));
  } catch {
    return null;
  }
}

function writeCantinaBoard(characterId, board) {
  try {
    localStorage.setItem(cantinaStorageKey(characterId), JSON.stringify(board));
  } catch { /* ignore quota */ }
}

// Fresh board after a mission finishes — residual tank gets residual jobs, else normal dailies.
function rollCantinaBoard(character) {
  const fuel = Math.round((character?.fuel ?? FUEL_MAX) * 100) / 100;
  if (fuel >= MISSION_MIN_FUEL) {
    const probe = generateDailyMissions(character);
    const cheapest = Math.min(...probe.map((m) => getEffectiveFuelCost(character, m)));
    if (fuel < cheapest) return generateLowFuelBoard(character, fuel, 3);
    return probe;
  }
  return generateDailyMissions(character);
}

function classifyClaimItems(items, rewards) {
  const list = Array.isArray(items) ? items : [];
  const gearItem = list.find((i) => i.type !== "material" && i.type !== "consumable") || null;
  const material = list.find((i) => i.type === "material") || null;
  const consumableItem = list.find((i) => i.type === "consumable") || null;
  let collectible = null;
  if (rewards?.collectible?.name) {
    collectible = {
      name: rewards.collectible.name,
      emoji: rewards.collectible.emoji || "🎁",
      rarity: material?.rarity || rewards.collectible.rarity || "common",
    };
  } else if (material) {
    collectible = {
      name: material.name,
      emoji: "🎁",
      rarity: material.rarity || "common",
    };
  }
  return { gearItem, collectible, consumableItem };
}

// Encapsulates the full mission lifecycle: fuel cycle, daily quest generation,
// active-mission polling, launch/claim/skip, fuel purchase, reward computation,
// loot rolls, discoveries, and guild/Nexus side-effects. The view layer consumes
// the returned state + handlers and stays free of orchestration logic.
export function useMissionManager() {
  const outlet = useOutletContext() || {};
  const setSharedCharacter = outlet.setCharacter;
  const [character, setLocalCharacter] = useState(null);

  const setCharacter = useCallback((next) => {
    setLocalCharacter((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (value) {
        primeMyCharacterCache(value);
        setSharedCharacter?.(value);
      }
      return value;
    });
  }, [setSharedCharacter]);
  const [dailyMissions, setDailyMissions] = useState([]);
  const [activeMission, setActiveMission] = useState(null);
  const [launchAnim, setLaunchAnim] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [completeSummary, setCompleteSummary] = useState(null);
  const [missionBattle, setMissionBattle] = useState(null);
  const [nexusBonus, setNexusBonus] = useState(false);
  const [inventoryFullOpen, setInventoryFullOpen] = useState(false);
  const claimingRef = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const commitCantinaBoard = useCallback((characterId, board) => {
    setDailyMissions(board);
    writeCantinaBoard(characterId, board);
  }, []);

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }

    // Server-authoritative 24h fuel cycle refill
    try {
      const res = await api.functions.invoke("SyncFuelCycle", {});
      const patch = res.patch || res.data?.patch || {};
      if (patch && Object.keys(patch).length) Object.assign(char, patch);
    } catch (e) { /* best-effort */ }

    // Same 3 patrons stay until one mission is finished — never reshuffle on load.
    const saved = readSavedCantinaBoard(char.id);
    if (saved) {
      setDailyMissions(saved);
    } else {
      const board = rollCantinaBoard(char);
      writeCantinaBoard(char.id, board);
      setDailyMissions(board);
    }
    setCharacter(char);
    setLoading(false);

    // Active mission + Nexus perk are non-blocking; load them best-effort so a
    // single failed fetch never traps the page on the loading spinner.
    try {
      if (char.active_mission_id) {
        const missions = await api.entities.Mission.filter({ id: char.active_mission_id });
        if (missions.length > 0) {
          const m = missions[0];
          if (m.status === "in_progress" && new Date(m.end_time) <= new Date()) {
            // Local UX only — ClaimMission completes server-side when claimed.
            m.status = "completed";
          }
          setActiveMission(m);
        }
      }
    } catch (e) {}
    try {
      let bonus = false;
      const ownerGid = await getNexusOwnerGuildId();
      if (ownerGid) {
        const m = await getGuildMembership(char.id);
        bonus = !!(m && m.guild_id === ownerGid);
      }
      setNexusBonus(bonus);
    } catch (e) {}
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  // Poll for mission completion — plays a fanfare + confetti burst the moment
  // the timer hits zero so the player is alerted even if they navigated away.
  useEffect(() => {
    if (!activeMission || activeMission.status !== "in_progress") return;
    let fired = false;
    const interval = setInterval(() => {
      setNow(Date.now());
      if (!fired && new Date(activeMission.end_time) <= new Date()) {
        fired = true;
        setActiveMission(m => m ? { ...m, status: "completed" } : null);
        playMissionComplete();
        if (!document.hidden) {
          confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
          setTimeout(() => {
            if (!document.hidden) confetti({ particleCount: 50, spread: 110, origin: { y: 0.4 } });
          }, 400);
        }
        toast({
          title: "🎉 MISSION COMPLETE!",
          description: `${activeMission.name} — return to the Cantina to claim your rewards!`,
        });
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeMission, toast]);

  const handleStart = useCallback(async (template) => {
    if (activeMission) return;
    if (character.mining_end_time) {
      toast({ title: "⛏️ Busy Mining", description: "Your ship is deployed mining a stardust node — finish or cancel mining first.", variant: "destructive" });
      return;
    }
    const fuelCost = getEffectiveFuelCost(character, template);
    const currentFuel = character.fuel ?? FUEL_MAX;
    if (currentFuel < fuelCost) {
      toast({ title: "⛽ Not enough fuel!", description: `Need ${fuelCost} fuel — only ${currentFuel} in the tank.`, variant: "destructive" });
      return;
    }

    try {
      const bagCount = await countItems(character.id);
      if (bagCount >= getInventoryCap(character)) {
        setInventoryFullOpen(true);
        return;
      }

      const res = await api.functions.invoke("LaunchMission", {
        template: {
          ...template,
          explore_scene: pickMissionExploreSceneIndex(),
        },
      });
      const patch = res.patch || res.data?.patch || {};
      const mission = res.mission || res.data?.mission;
      if (!mission) throw new Error("No mission returned");
      setActiveMission(mission);
      setCharacter((c) => ({ ...c, ...patch }));
      setLaunchAnim(mission);
      const duration = mission.duration_seconds || template.duration_seconds;
      const spent = patch.fuel != null
        ? Math.round(((character.fuel ?? FUEL_MAX) - patch.fuel) * 100) / 100
        : fuelCost;
      pushNotification({
        owner_id: character.id,
        type: "system",
        title: "🚀 Mission Launched!",
        body: `${template.name} — returning in ${formatTime(duration)} · -${spent} ⛽`,
      });
    } catch (e) {
      if (/inventory full/i.test(e?.message || "")) {
        setInventoryFullOpen(true);
        return;
      }
      toast({ title: "Launch failed", description: e?.message || "Try again.", variant: "destructive" });
      await load();
    }
  }, [activeMission, character, toast, load, setCharacter]);

  // Soft end-mission fight — used by claim and by skip-to-fight.
  const startMissionBattle = useCallback(async (mission) => {
    if (claimingRef.current || missionBattle) return;
    if (!mission || !character) return;
    claimingRef.current = true;
    setClaiming(true);
    try {
      let playerItems = [];
      try {
        playerItems = (await api.entities.Item.filter({ character_id: character.id, is_equipped: true })) || [];
      } catch (e) {}
      const enemy = generateMissionEncounter(character, mission);
      const battle = simulateBattle(character, enemy, playerItems);
      setMissionBattle({ enemy, battle, playerItems });
    } catch (e) {
      claimingRef.current = false;
      setClaiming(false);
      toast({ title: "Battle failed to start", description: "Try claiming again.", variant: "destructive" });
    }
  }, [character, missionBattle, toast]);

  // Claim opens a soft end-mission fight first — rewards only apply on a win.
  const handleClaim = useCallback(async () => {
    if (!activeMission || activeMission.status !== "completed") return;
    await startMissionBattle(activeMission);
  }, [activeMission, startMissionBattle]);

  const finishMissionBattle = useCallback(async () => {
    if (!missionBattle || !activeMission) return;
    // Consume the claim lock immediately so double-clicks on VIEW REWARDS cannot
    // fire two ClaimMission calls (second 409 used to toast over a successful claim).
    if (!claimingRef.current) return;
    claimingRef.current = false;
    const { battle, enemy } = missionBattle;
    const won = battle?.winner === "player";
    const missionSnapshot = activeMission;
    setMissionBattle(null);

    if (!won) {
      try {
        const res = await api.functions.invoke("FailMission", { mission_id: missionSnapshot.id });
        const patch = res.patch || res.data?.patch || {};
        setActiveMission(null);
        setCharacter((c) => ({ ...c, ...patch }));
        try {
          commitCantinaBoard(character.id, rollCantinaBoard({ ...character, ...patch }));
        } catch { /* board regen is best-effort */ }
      } catch (e) {
        toast({ title: "Could not resolve mission", description: e?.message, variant: "destructive" });
        await load();
      }
      toast({
        title: "Defeated — no rewards",
        description: "The encounter went south. Fuel is spent, but you walk away empty-handed.",
        variant: "destructive",
      });
      claimingRef.current = false;
      setClaiming(false);
      return;
    }

    try {
      const res = await api.functions.invoke("ClaimMission", {
        mission_id: missionSnapshot.id,
        won: true,
        species_id: enemy?.speciesId || null,
        nexus_bonus: nexusBonus,
      });
      const patch = res.patch || res.data?.patch || {};
      const fullChar = res.character || res.data?.character;
      toastNewAchievements(res, toast);
      const gains = res.gains || res.data?.gains || {};
      const items = res.items || res.data?.items || [];
      applyPendingLootFromResponse(res);
      const rewards = missionSnapshot.rewards || {};

      const { gearItem, collectible, consumableItem } = classifyClaimItems(items, rewards);
      const prevLevel = character.level || 1;
      const newLevel = patch.level ?? character.level ?? prevLevel;
      const leveledUp = newLevel > prevLevel;
      const stardustGain = gains.stardust ?? 0;
      const xpGain = gains.experience ?? 0;
      const collectionPct = gains.collectionPct ?? 0;
      const stardustBase = gains.stardustBase ?? stardustGain;
      const xpBase = gains.xpBase ?? xpGain;
      const efficiency = gains.efficiency ?? 1;
      const xpEfficiency = gains.xpEfficiency ?? 1;
      let fuelSpent = gains.fuelSpent;
      if (fuelSpent == null) {
        try { fuelSpent = getEffectiveFuelCost(character, missionSnapshot); }
        catch { fuelSpent = 0; }
      }

      let discFound = [];
      try {
        discFound = processDiscovery(character, {
          win: true,
          speciesId: enemy?.speciesId || null,
          gearItems: gearItem ? [gearItem] : [],
        }).found || [];
      } catch { /* discovery UI only */ }

      let shipXpMult = 0;
      let shipSdMult = 0;
      try {
        shipXpMult = getModEffectTotal(character, "mission_xp_mult") || 0;
        shipSdMult = getModEffectTotal(character, "mission_stardust_mult") || 0;
      } catch { /* preview chips only */ }

      setCompleteSummary({
        mission: missionSnapshot,
        xp: {
          base: xpBase,
          efficiency: xpEfficiency,
          shipMult: shipXpMult,
          collectionPct,
          total: xpGain,
        },
        stardust: {
          base: stardustBase,
          efficiency,
          nexus: nexusBonus,
          shipMult: shipSdMult,
          total: stardustGain,
        },
        leveledUp,
        newLevel,
        statPoints: getStatPointsForLevelRange(prevLevel, newLevel),
        gearItem,
        collectible,
        consumableItem,
        discoveries: discFound,
        fuelSpent,
      });
      if (discFound.length) {
        pushNotification({
          owner_id: character.id,
          type: "system",
          title: "🔎 Discovery!",
          body: discFound.map((f) => `${f.emoji || "✨"} ${f.name}`).join(" · "),
        });
      }

      void contributeMission({ ...character, ...patch, level: newLevel }, missionSnapshot).catch(() => {});

      setActiveMission(null);
      const updatedChar = { ...character, ...(fullChar || patch) };
      setCharacter(updatedChar);
      try {
        commitCantinaBoard(updatedChar.id, rollCantinaBoard(updatedChar));
      } catch { /* keep prior board */ }
    } catch (e) {
      toast({ title: "Claim failed", description: e?.message || "Try again.", variant: "destructive" });
      await load();
    } finally {
      claimingRef.current = false;
      setClaiming(false);
    }
  }, [missionBattle, activeMission, character, nexusBonus, toast, commitCantinaBoard, load]);

  const handleSkip = useCallback(async () => {
    if (!activeMission || activeMission.status !== "in_progress") return;
    if (claimingRef.current || missionBattle) return;
    const previewCost = skipCostFor(activeMission);
    if (previewCost <= 0) return;
    if ((character.nova_crystals || 0) < previewCost) {
      toast({ title: "Not enough Nova Crystals", description: `Skip costs ${previewCost} 💎 — you have ${character.nova_crystals || 0}.`, variant: "destructive" });
      return;
    }
    try {
      const res = await api.functions.invoke("SkipMission", { mission_id: activeMission.id });
      const patch = res.patch || res.data?.patch || {};
      const mission = res.mission || res.data?.mission || { ...activeMission, status: "completed" };
      const cost = res.skip_cost ?? res.data?.skip_cost ?? previewCost;
      setActiveMission({ ...mission, status: "completed" });
      setCharacter((c) => ({ ...c, ...patch }));
      void trackNovaSpend(character, cost, "mission_skip");
      await startMissionBattle({ ...mission, status: "completed" });
    } catch (e) {
      toast({ title: "Skip failed", description: e?.message || "Try again.", variant: "destructive" });
      await load();
    }
  }, [activeMission, character, missionBattle, toast, startMissionBattle, load]);

  const handleBuyFuel = useCallback(async () => {
    if ((character.fuel_purchases || 0) >= FUEL_PURCHASE_MAX) return;
    const maxFuel = character.max_fuel || FUEL_MAX;
    const fuel = character.fuel ?? 0;
    if (fuel > maxFuel - FUEL_PURCHASE_AMOUNT) {
      toast({
        title: "Tank too full",
        description: `Burn down to ${maxFuel - FUEL_PURCHASE_AMOUNT} or less before buying +${FUEL_PURCHASE_AMOUNT} fuel.`,
        variant: "destructive",
      });
      return;
    }
    if ((character.nova_crystals || 0) < FUEL_PURCHASE_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${FUEL_PURCHASE_COST} 💎 to refuel.`, variant: "destructive" });
      return;
    }
    try {
      const res = await api.functions.invoke("BuyFuel", {});
      const patch = res.patch || res.data?.patch || {};
      setCharacter((c) => ({ ...c, ...patch }));
      void trackNovaSpend(character, FUEL_PURCHASE_COST, "fuel_purchase");
      toast({ title: `⛽ +${FUEL_PURCHASE_AMOUNT} Fuel`, description: `-${FUEL_PURCHASE_COST} 💎` });
    } catch (e) {
      toast({ title: "Refuel failed", description: e?.message || "Try again.", variant: "destructive" });
      await load();
    }
  }, [character, toast, load]);

  // Derived view values
  const skipCost = activeMission ? skipCostFor(activeMission, now) : 0;
  const gains = activeMission && character ? computeMissionGains(character, activeMission, nexusBonus) : null;
  const currentFuel = character ? normalizeFuelAmount(character.fuel ?? FUEL_MAX) : FUEL_MAX;
  const cantinaMissions = dailyMissions;

  return {
    // state
    character,
    dailyMissions,
    activeMission,
    launchAnim,
    loading,
    claiming,
    completeSummary,
    missionBattle,
    nexusBonus,
    // derived
    skipCost,
    gains,
    currentFuel,
    cantAffordAny: dailyMissions.some((m) => m._lowFuel),
    cantinaMissions,
    // actions
    handleStart,
    handleClaim,
    finishMissionBattle,
    handleSkip,
    handleBuyFuel,
    setCompleteSummary,
    setLaunchAnim,
    inventoryFullOpen,
    setInventoryFullOpen,
    navigate,
  };
}
