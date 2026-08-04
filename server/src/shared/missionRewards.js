/**
 * Mission reward helpers (Restoration 11).
 * Settlement authority remains ClaimMission + executeRewardClaim;
 * this module centralizes the exclusive item chain and related constants.
 */
import {
  MISSION_GEAR_BASE_CHANCE,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_STIM_CHANCE_AFTER_GEAR_FAIL,
  MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL,
  JUNK_MISSION_REWARD_MULTIPLIER,
  JUNK_VARIANCE_MIN,
  JUNK_VARIANCE_MAX,
  missionGearDropChance,
  rollMissionGearDrop,
  rollMissionGearRarity,
  JunkSaleValue,
  MissionStardustReward,
  StardustPerFuel,
} from "./stardustEconomy.js";
import { randomItem } from "./rewards.js";
import { randomConsumable, priceStimOffer } from "./economyFormulas.js";

export {
  MISSION_GEAR_BASE_CHANCE,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_STIM_CHANCE_AFTER_GEAR_FAIL,
  MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL,
  JUNK_MISSION_REWARD_MULTIPLIER,
  JUNK_VARIANCE_MIN,
  JUNK_VARIANCE_MAX,
  missionGearDropChance,
  rollMissionGearDrop,
  rollMissionGearRarity,
  JunkSaleValue,
  MissionStardustReward,
  StardustPerFuel,
};

export const MISSION_LOOT_SLOTS = Object.freeze([
  "weapon",
  "armor",
  "helmet",
  "boots",
  "legs",
  "neck",
  "accessory",
  "ship_module",
]);

/** Mission Gear item level = character level at settlement (authoritative existing rule). */
export function missionGearItemLevel(character) {
  return Math.max(1, Math.floor(Number(character?.level) || 1));
}

/** Deterministic slot from mission name when launch did not pin loot_type. */
export function missionGearSlotFromMission(mission) {
  const name = String(mission?.name || mission?.rewards?.loot_type || "mission");
  if (MISSION_LOOT_SLOTS.includes(mission?.rewards?.loot_type)) {
    return mission.rewards.loot_type;
  }
  return MISSION_LOOT_SLOTS[name.length % MISSION_LOOT_SLOTS.length];
}

/**
 * Exclusive item chain at settlement (exactly once per claim generate):
 * Gear (pity) → Stim 25% → Junk 75% → NONE
 *
 * @returns {{
 *   itemOutcome: 'GEAR'|'STIM'|'JUNK'|'NONE',
 *   gearDropped: boolean,
 *   stimDropped: boolean,
 *   junkDropped: boolean,
 *   itemTemplates: object[],
 *   gearChance: number,
 *   pityBefore: number,
 * }}
 */
export function settleMissionItemChain({
  character,
  mission,
  missionStardustReward,
  missStreak,
  rng = Math.random,
} = {}) {
  const pityBefore = Math.max(0, Math.floor(Number(missStreak) || 0));
  const gearChance = missionGearDropChance(pityBefore);
  const itemTemplates = [];
  let gearDropped = false;
  let stimDropped = false;
  let junkDropped = false;
  let itemOutcome = "NONE";

  const level = missionGearItemLevel(character);
  const lootType = missionGearSlotFromMission(mission);

  if (rollMissionGearDrop(pityBefore, rng)) {
    gearDropped = true;
    itemOutcome = "GEAR";
    const rarity = rollMissionGearRarity(rng);
    itemTemplates.push(randomItem(rarity, level, lootType, rng, character?.class));
  } else if (rng() < MISSION_STIM_CHANCE_AFTER_GEAR_FAIL) {
    stimDropped = true;
    itemOutcome = "STIM";
    const { _cost, ...consItem } = randomConsumable(rng);
    itemTemplates.push(priceStimOffer(consItem, level));
  } else if (rng() < MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL) {
    junkDropped = true;
    itemOutcome = "JUNK";
    const junkName = mission?.rewards?.collectible?.name || "Salvaged Trinket";
    itemTemplates.push({
      name: junkName,
      type: "material",
      rarity: "common",
      level_requirement: level,
      stats: {},
      flavor_text: "A curious trinket recovered on mission.",
      sell_value: JunkSaleValue(missionStardustReward, rng),
    });
  }

  return {
    itemOutcome,
    gearDropped,
    stimDropped,
    junkDropped,
    itemTemplates,
    gearChance,
    pityBefore,
  };
}
