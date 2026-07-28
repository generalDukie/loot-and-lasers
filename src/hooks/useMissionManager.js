import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/api/gameClient";
import { trackNovaSpend } from "@/lib/novaTracker";
import { useNavigate } from "react-router-dom";
import {
  generateItem,
  rollItemRarity,
  getExpForLevel,
  getEffectiveFuelCost,
  FUEL_MAX,
  MISSION_MIN_FUEL,
  FUEL_PURCHASE_AMOUNT,
  FUEL_PURCHASE_COST,
  FUEL_PURCHASE_MAX,
  checkFuelReset,
  generateDailyMissions,
  generateLowFuelBoard,
  getModEffectTotal,
  computeMissionXpFromFuel,
  computeMissionStardustFromFuel,
  normalizeMissionEfficiency,
  getStatPointsForLevelRange,
  randomConsumable,
  GEAR_CATALOG_TOTAL,
} from "@/lib/gameData";
import { contributeMission, getGuildMembership } from "@/lib/guildUtils";
import { processDiscovery } from "@/lib/discovery";
import { getMyCharacter } from "@/lib/socialEngine";
import { pushNotification } from "@/lib/notificationEngine";
import { getNexusOwnerGuildId } from "@/lib/nexusEngine";
import { addItemWithCap } from "@/lib/inventoryCap";
import { getEffectiveMissionDuration } from "@/lib/fuelMounts";
import { getCollectionStats, applyXpBonus } from "@/lib/collectionBonus";
import { useToast } from "@/components/ui/use-toast";
import { playMissionComplete } from "@/lib/audioEngine";
import { generateMissionEncounter } from "@/lib/missionCombat";
import { simulateBattle } from "@/lib/arenaEngine";
import { progressWeeklyNovaQuest } from "@/lib/weeklyNovaQuests";
import { pickMissionExploreSceneIndex } from "@/components/game/MissionExploreBackdrop";
import confetti from "canvas-confetti";

// Computes stardust/XP for a mission.
// XP  = fuel × XP/fuel(level) × xp efficiency (0.90–1.10)
// SD  = fuel × SD/fuel(level) × stardust efficiency (0.90–1.10)
// then ship / nexus / collection bonuses.
export function computeMissionGains(character, mission, nexusBonus, gearTotal = GEAR_CATALOG_TOTAL) {
  const bonusMult = nexusBonus ? 1.05 : 1;
  const stardustMult = 1 + getModEffectTotal(character, "mission_stardust_mult");
  const xpMult = 1 + getModEffectTotal(character, "mission_xp_mult");
  const { percentage } = getCollectionStats(character, gearTotal);
  const fuelCost = getEffectiveFuelCost(character, mission);
  const sdEff = normalizeMissionEfficiency(mission?.stardust_efficiency);
  const xpEff = normalizeMissionEfficiency(mission?.xp_efficiency);
  const chartXp = computeMissionXpFromFuel(fuelCost, character.level, xpEff);
  const chartSd = computeMissionStardustFromFuel(fuelCost, character.level, sdEff);
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

// Encapsulates the full mission lifecycle: fuel cycle, daily quest generation,
// active-mission polling, launch/claim/skip, fuel purchase, reward computation,
// loot rolls, discoveries, and guild/Nexus side-effects. The view layer consumes
// the returned state + handlers and stays free of orchestration logic.
export function useMissionManager() {
  const [character, setCharacter] = useState(null);
  const [dailyMissions, setDailyMissions] = useState([]);
  const [activeMission, setActiveMission] = useState(null);
  const [launchAnim, setLaunchAnim] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [completeSummary, setCompleteSummary] = useState(null);
  const [missionBattle, setMissionBattle] = useState(null);
  const [nexusBonus, setNexusBonus] = useState(false);
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

    // Refill fuel to full once the 24h cycle elapses
    const resetPatch = checkFuelReset(char);
    if (resetPatch) {
      try { await api.entities.Character.update(char.id, resetPatch); } catch (e) {}
      Object.assign(char, resetPatch);
    }

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
            await api.entities.Mission.update(m.id, { status: "completed" });
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
    const startNow = new Date();
    const duration = getEffectiveMissionDuration(character, template);
    const endTime = new Date(startNow.getTime() + duration * 1000);

    // Pre-roll the loot drop at launch so the advertised drop (shown on the
    // active mission card) is exactly what claim will grant.
    const LOOT_TYPES = ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"];
    const lootType = LOOT_TYPES[template.name.length % 8];
    const lootRarity = rollItemRarity(template.rewards.item_rarity_chance, character.level);
    // Not every mission yields gear — level nudges drop rate slightly.
    const lootDrops = Math.random() < Math.min(0.85, 0.4 + Math.min(0.25, (character.level || 1) * 0.01));

    const mission = await api.entities.Mission.create({
      character_id: character.id,
      name: template.name,
      description: template.description,
      location: template.location,
      sector: template.sector,
      duration_seconds: duration,
      status: "in_progress",
      start_time: startNow.toISOString(),
      end_time: endTime.toISOString(),
      rewards: { ...template.rewards, loot_rarity: lootRarity, loot_type: lootType, loot_drops: lootDrops },
      level_requirement: template.level_requirement,
      patron: template.patron || null,
      explore_scene: pickMissionExploreSceneIndex(),
    });

    await api.entities.Character.update(character.id, {
      active_mission_id: mission.id,
      mission_end_time: endTime.toISOString(),
      fuel: currentFuel - fuelCost,
      fuel_updated_at: startNow.toISOString(),
    });

    setActiveMission(mission);
    setCharacter(c => ({ ...c, fuel: currentFuel - fuelCost, fuel_updated_at: startNow.toISOString() }));
    setLaunchAnim(mission);
    pushNotification({ owner_id: character.id, type: "system", title: "🚀 Mission Launched!", body: `${template.name} — returning in ${formatTime(duration)} · -${fuelCost} ⛽` });
  }, [activeMission, character, toast]);

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
    const { battle, enemy } = missionBattle;
    const won = battle?.winner === "player";
    setMissionBattle(null);

    if (!won) {
      try {
        await api.entities.Mission.update(activeMission.id, { status: "failed" });
        await api.entities.Character.update(character.id, { active_mission_id: "", mission_end_time: "" });
      } catch (e) {}
      setActiveMission(null);
      setCharacter((c) => ({ ...c, active_mission_id: "", mission_end_time: "" }));
      commitCantinaBoard(character.id, rollCantinaBoard({ ...character, fuel: character.fuel }));
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
      const rewards = activeMission.rewards;
      const { stardustGain, xpGain, collectionPct, stardustBase, xpBase, efficiency, xpEfficiency } = computeMissionGains(character, activeMission, nexusBonus);
      let newExp = (character.experience || 0) + xpGain;
      let newLevel = character.level;
      let expToNext = character.experience_to_next_level;

      while (newExp >= expToNext) {
        newExp -= expToNext;
        newLevel++;
        expToNext = getExpForLevel(newLevel);
      }

      const charUpdate = {
        experience: newExp,
        level: newLevel,
        experience_to_next_level: expToNext,
        stardust: (character.stardust || 0) + stardustGain,
        total_stardust_earned: (character.total_stardust_earned || 0) + stardustGain,
        unspent_stat_points: (character.unspent_stat_points || 0) + getStatPointsForLevelRange(character.level, newLevel),
        missions_completed: (character.missions_completed || 0) + 1,
        highest_sector: Math.max(character.highest_sector || 1, activeMission.sector),
        active_mission_id: "",
        mission_end_time: "",
      };

      const { updates: discUpdates, found: discFound } = processDiscovery(character, { win: true, speciesId: enemy?.speciesId || null });
      Object.assign(charUpdate, discUpdates);
      const weekly = progressWeeklyNovaQuest(character, "missions", 1);
      if (weekly) charUpdate.weekly_nova_quests = weekly;
      await api.entities.Character.update(character.id, charUpdate);
      await api.entities.Mission.update(activeMission.id, { status: "claimed" });

      const dropsGear = rewards.loot_drops !== false;
      let gearItem = null;
      if (dropsGear) {
        const rarity = rewards.loot_rarity || rollItemRarity(rewards.item_rarity_chance, character.level);
        gearItem = generateItem(rarity, character.level, rewards.loot_type);
        await addItemWithCap(character, {
          ...gearItem,
          owner_id: character.created_by_id,
          character_id: character.id,
        });
      }

      if (rewards.collectible) {
        const junkStats = 1 + Math.floor(Math.random() * 4);
        await addItemWithCap(character, {
          owner_id: character.created_by_id,
          character_id: character.id,
          name: rewards.collectible.name,
          type: "material",
          rarity: "uncommon",
          level_requirement: Math.max(1, character.level),
          stats: { luck: junkStats },
          flavor_text: "A curious trinket recovered on mission.",
          sell_value: 15,
          is_equipped: false,
        });
      }

      let consumableItem = null;
      if (Math.random() < 0.15) {
        const { _cost, ...consItem } = randomConsumable();
        await addItemWithCap(character, { ...consItem, owner_id: character.created_by_id, character_id: character.id });
        consumableItem = consItem;
      }

      const leveledUp = newLevel > character.level;
      setCompleteSummary({
        mission: activeMission,
        xp: {
          base: xpBase,
          efficiency: xpEfficiency,
          shipMult: getModEffectTotal(character, "mission_xp_mult"),
          collectionPct,
          total: xpGain,
        },
        stardust: {
          base: stardustBase,
          efficiency,
          nexus: nexusBonus,
          shipMult: getModEffectTotal(character, "mission_stardust_mult"),
          total: stardustGain,
        },
        leveledUp,
        newLevel,
        statPoints: getStatPointsForLevelRange(character.level, newLevel),
        gearItem,
        collectible: rewards.collectible || null,
        consumableItem,
        discoveries: discFound,
        fuelSpent: getEffectiveFuelCost(character, activeMission),
      });
      if (discFound.length) {
        pushNotification({ owner_id: character.id, type: "system", title: "🔎 Discovery!", body: discFound.map((f) => `${f.emoji} ${f.name}`).join(" · ") });
      }

      contributeMission({ ...character, level: newLevel }, activeMission);

      setActiveMission(null);
      const updatedChar = { ...character, ...charUpdate };
      setCharacter(updatedChar);
      commitCantinaBoard(updatedChar.id, rollCantinaBoard(updatedChar));
    } finally {
      claimingRef.current = false;
      setClaiming(false);
    }
  }, [missionBattle, activeMission, character, nexusBonus, toast, commitCantinaBoard]);

  const handleSkip = useCallback(async () => {
    if (!activeMission || activeMission.status !== "in_progress") return;
    if (claimingRef.current || missionBattle) return;
    const cost = skipCostFor(activeMission);
    if (cost <= 0) return;
    if ((character.nova_crystals || 0) < cost) {
      toast({ title: "Not enough Nova Crystals", description: `Skip costs ${cost} 💎 — you have ${character.nova_crystals || 0}.`, variant: "destructive" });
      return;
    }
    const completed = { ...activeMission, status: "completed" };
    await api.entities.Character.update(character.id, { nova_crystals: (character.nova_crystals || 0) - cost });
    await api.entities.Mission.update(activeMission.id, { status: "completed" });
    setActiveMission(completed);
    setCharacter(c => ({ ...c, nova_crystals: (c.nova_crystals || 0) - cost }));
    void trackNovaSpend(character, cost, "mission_skip");
    // Skip buys the wait — jump straight into the claim fight.
    await startMissionBattle(completed);
  }, [activeMission, character, missionBattle, toast, startMissionBattle]);

  const handleBuyFuel = useCallback(async () => {
    if ((character.fuel_purchases || 0) >= FUEL_PURCHASE_MAX) return;
    if ((character.nova_crystals || 0) < FUEL_PURCHASE_COST) {
      toast({ title: "Not enough Nova Crystals", description: `Need ${FUEL_PURCHASE_COST} 💎 to refuel.`, variant: "destructive" });
      return;
    }
    const upd = {
      nova_crystals: (character.nova_crystals || 0) - FUEL_PURCHASE_COST,
      fuel: (character.fuel || 0) + FUEL_PURCHASE_AMOUNT,
      fuel_purchases: (character.fuel_purchases || 0) + 1,
    };
    await api.entities.Character.update(character.id, upd);
    setCharacter((c) => ({ ...c, ...upd }));
    void trackNovaSpend(character, FUEL_PURCHASE_COST, "fuel_purchase");
    toast({ title: `⛽ +${FUEL_PURCHASE_AMOUNT} Fuel`, description: `-${FUEL_PURCHASE_COST} 💎` });
  }, [character, toast]);

  // Derived view values
  const skipCost = activeMission ? skipCostFor(activeMission, now) : 0;
  const gains = activeMission && character ? computeMissionGains(character, activeMission, nexusBonus) : null;
  const currentFuel = character ? Math.round((character.fuel ?? FUEL_MAX) * 100) / 100 : FUEL_MAX;
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
    navigate,
  };
}