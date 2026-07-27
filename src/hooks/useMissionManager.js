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
  FUEL_PURCHASE_AMOUNT,
  FUEL_PURCHASE_COST,
  FUEL_PURCHASE_MAX,
  checkFuelReset,
  generateDailyMissions,
  generateLowFuelMission,
  getModEffectTotal,
  getEarlyXpMultiplier,
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
import confetti from "canvas-confetti";

// Computes the actual stardust/XP a mission will grant, including ship-mod
// bonuses, the early-game catch-up multiplier, and the Nexus owner perk.
// Used both for the on-card reward preview and at claim time so they match.
export function computeMissionGains(character, mission, nexusBonus, gearTotal = GEAR_CATALOG_TOTAL) {
  const rewards = mission?.rewards || {};
  const bonusMult = nexusBonus ? 1.05 : 1;
  const stardustMult = 1 + getModEffectTotal(character, "mission_stardust_mult");
  const xpMult = (1 + getModEffectTotal(character, "mission_xp_mult")) * getEarlyXpMultiplier(character.level);
  const { percentage } = getCollectionStats(character, gearTotal);
  const baseXp = Math.round((rewards.experience || 0) * xpMult);
  return {
    bonusMult,
    stardustGain: Math.round((rewards.stardust || 0) * bonusMult * stardustMult),
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
  const [nexusBonus, setNexusBonus] = useState(false);
  const claimingRef = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }

    // Refill fuel to full once the 24h cycle elapses
    const resetPatch = checkFuelReset(char);
    if (resetPatch) {
      try { await api.entities.Character.update(char.id, resetPatch); } catch (e) {}
      Object.assign(char, resetPatch);
    }

    setDailyMissions(generateDailyMissions(char));
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
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
        setTimeout(() => confetti({ particleCount: 50, spread: 110, origin: { y: 0.4 } }), 400);
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
    // Not every mission yields gear — higher-risk runs drop loot more often.
    const lootDrops = Math.random() < Math.min(0.85, 0.35 + (template.risk || 1) * 0.1);

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
      difficulty: template.difficulty,
      level_requirement: template.level_requirement,
      risk: template.risk || 1,
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

  const handleClaim = useCallback(async () => {
    if (claimingRef.current) return;
    if (!activeMission || activeMission.status !== "completed") return;
    claimingRef.current = true;
    setClaiming(true);
    try {
      const rewards = activeMission.rewards;
      const { stardustGain, xpGain, collectionPct } = computeMissionGains(character, activeMission, nexusBonus);
      let newExp = (character.experience || 0) + xpGain;
      let newLevel = character.level;
      let expToNext = character.experience_to_next_level;

      // Level up loop
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
        unspent_stat_points: (character.unspent_stat_points || 0) + (newLevel - character.level) * 4,
        missions_completed: (character.missions_completed || 0) + 1,
        highest_sector: Math.max(character.highest_sector || 1, activeMission.sector),
        active_mission_id: "",
        mission_end_time: "",
      };

      const { updates: discUpdates, found: discFound } = processDiscovery(character, { win: true, speciesId: null });
      Object.assign(charUpdate, discUpdates);
      await api.entities.Character.update(character.id, charUpdate);
      await api.entities.Mission.update(activeMission.id, { status: "claimed" });

      // Gear only drops when the launch roll said it would (legacy missions without
      // a roll still drop, preserving old behavior).
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
        // Vendor trash: sell value scales with mission level and is randomized
        // via random stat points (computeStardustValue uses stats + level_requirement).
        const junkStats = 1 + Math.floor(Math.random() * 4); // 1-4
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

      // Consumable drop — 15% base chance; legendary gated at 1% via randomConsumable.
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
          base: rewards.experience || 0,
          earlyMult: getEarlyXpMultiplier(character.level),
          shipMult: getModEffectTotal(character, "mission_xp_mult"),
          collectionPct,
          total: xpGain,
        },
        stardust: {
          base: rewards.stardust || 0,
          nexus: nexusBonus,
          shipMult: getModEffectTotal(character, "mission_stardust_mult"),
          total: stardustGain,
        },
        leveledUp,
        newLevel,
        statPoints: (newLevel - character.level) * 4,
        gearItem,
        collectible: rewards.collectible || null,
        consumableItem,
        discoveries: discFound,
        fuelSpent: getEffectiveFuelCost(character, activeMission),
      });
      if (discFound.length) {
        pushNotification({ owner_id: character.id, type: "system", title: "🔎 Discovery!", body: discFound.map((f) => `${f.emoji} ${f.name}`).join(" · ") });
      }

      // Feed completion into the guild shared log + collective progression
      contributeMission({ ...character, level: newLevel }, activeMission);

      setActiveMission(null);
      const updatedChar = { ...character, ...charUpdate };
      setCharacter(updatedChar);
      // Re-roll the cantina so the player gets fresh quests after each claim.
      setDailyMissions(generateDailyMissions(updatedChar));
    } finally {
      claimingRef.current = false;
      setClaiming(false);
    }
  }, [activeMission, character, nexusBonus]);

  const handleSkip = useCallback(async () => {
    if (!activeMission || activeMission.status !== "in_progress") return;
    const cost = skipCostFor(activeMission);
    if (cost <= 0) return;
    if ((character.nova_crystals || 0) < cost) {
      toast({ title: "Not enough Nova Crystals", description: `Skip costs ${cost} 💎 — you have ${character.nova_crystals || 0}.`, variant: "destructive" });
      return;
    }
    await api.entities.Character.update(character.id, { nova_crystals: (character.nova_crystals || 0) - cost });
    await api.entities.Mission.update(activeMission.id, { status: "completed" });
    setActiveMission(m => (m ? { ...m, status: "completed" } : null));
    setCharacter(c => ({ ...c, nova_crystals: (c.nova_crystals || 0) - cost }));
    void trackNovaSpend(character, cost, "mission_skip");
    toast({ title: "⏭️ Mission Skipped!", description: `-${cost} 💎 — ready to claim.` });
  }, [activeMission, character, toast]);

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

  const shuffleMissions = useCallback(() => {
    if (character) setDailyMissions(generateDailyMissions(character));
  }, [character]);

  // Derived view values
  const skipCost = activeMission ? skipCostFor(activeMission, now) : 0;
  const gains = activeMission && character ? computeMissionGains(character, activeMission, nexusBonus) : null;
  const currentFuel = character ? (character.fuel ?? FUEL_MAX) : FUEL_MAX;
  const cantAffordAny = character && dailyMissions.length > 0 && dailyMissions.every((m) => currentFuel < getEffectiveFuelCost(character, m));
  const cantinaMissions = character && (!activeMission && cantAffordAny && currentFuel >= 0.5)
    ? [...dailyMissions, generateLowFuelMission(character, currentFuel)]
    : dailyMissions;

  return {
    // state
    character,
    dailyMissions,
    activeMission,
    launchAnim,
    loading,
    claiming,
    completeSummary,
    nexusBonus,
    // derived
    skipCost,
    gains,
    currentFuel,
    cantAffordAny,
    cantinaMissions,
    // actions
    handleStart,
    handleClaim,
    handleSkip,
    handleBuyFuel,
    shuffleMissions,
    setCompleteSummary,
    setLaunchAnim,
    navigate,
  };
}