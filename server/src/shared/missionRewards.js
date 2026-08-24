/**
 * Phase 4 Mission physical-reward chain.
 *
 * Exclusive Test-18 checksum: Gear → Stim → Junk → None.
 * Settlement RNG is injected. Pity is Fuel-normalized, not mission-count.
 * Stim sale value is intentionally unfinished (Phase 5).
 */
import { GenerateGearItem } from "../../../src/lib/itemGeneration.js";
import {
  LOOT_OUTCOME_GEAR,
  LOOT_OUTCOME_JUNK,
  LOOT_OUTCOME_NONE,
  LOOT_OUTCOME_STIM,
  missionGearDropProbability,
  missionJunkConditionalProbability,
  missionStimConditionalProbability,
  missionStimRarityForLevel,
  nextFuelSinceLastGear,
  readFuelSinceLastGear,
  rollMissionGearItemLevel,
  rollMissionGearRarity,
  rollMissionGearSlot,
  rollMissionJunkValue,
  rollMissionLootOutcome,
  rollMissionStimAttribute,
} from "../../../src/lib/productionMath/missions.js";

export {
  LOOT_OUTCOME_GEAR,
  LOOT_OUTCOME_JUNK,
  LOOT_OUTCOME_NONE,
  LOOT_OUTCOME_STIM,
  missionGearDropProbability,
  missionJunkConditionalProbability,
  missionStimConditionalProbability,
  nextFuelSinceLastGear,
  readFuelSinceLastGear,
  rollMissionLootOutcome,
  rollMissionGearRarity,
  rollMissionJunkValue,
};

const MISSION_GEAR_ORIGIN = "mission";
const STIM_ITEM_TYPE = "consumable";
const JUNK_ITEM_TYPE = "material";
const JUNK_RARITY = "common";
const DEFAULT_JUNK_NAME = "Salvaged Trinket";

function snapshotLevelOf(character, mission) {
  const fromMission = Number(mission?.character_level ?? mission?.reward_item_level_basis);
  if (Number.isFinite(fromMission) && fromMission >= 1) return Math.floor(fromMission);
  return Math.max(1, Math.floor(Number(character?.level) || 1));
}

function requireRng(rng, label) {
  if (typeof rng !== "function") {
    throw new Error(`${label} requires injected RNG`);
  }
  return rng;
}

export function missionGearItemLevel(character, mission) {
  return snapshotLevelOf(character, mission);
}

/**
 * Exclusive item chain at settlement (victory only, exactly once per claim):
 * Gear → Stim → Junk → NONE
 */
export function settleMissionItemChain({
  character,
  mission,
  missionStardustReward,
  fuelSinceLastGear,
  rng,
} = {}) {
  const r = requireRng(rng, "settleMissionItemChain");
  const missionFuel = Number(
    mission?.original_fuel_cost ?? mission?.fuel_cost ?? 0,
  );
  const pityBefore = readFuelSinceLastGear({
    fuel_since_last_gear: fuelSinceLastGear ?? character?.fuel_since_last_gear,
    mission_gear_miss_streak: character?.mission_gear_miss_streak,
  });
  const snapshotLevel = snapshotLevelOf(character, mission);
  const rolled = rollMissionLootOutcome({
    missionFuel,
    fuelSinceLastGear: pityBefore,
    rng: r,
  });
  const itemTemplates = [];
  let gearDropped = false;
  let stimDropped = false;
  let junkDropped = false;
  const itemOutcome = rolled.outcome;

  if (itemOutcome === LOOT_OUTCOME_GEAR) {
    gearDropped = true;
    const rarity = rollMissionGearRarity(r);
    const slot = rollMissionGearSlot(r);
    const itemLevel = rollMissionGearItemLevel(snapshotLevel, r);
    itemTemplates.push(GenerateGearItem({
      itemLevel,
      itemType: slot,
      rarity,
      rng: r,
      origin: MISSION_GEAR_ORIGIN,
    }));
  } else if (itemOutcome === LOOT_OUTCOME_STIM) {
    stimDropped = true;
    const rarity = missionStimRarityForLevel(snapshotLevel);
    const attr = rollMissionStimAttribute(r);
    itemTemplates.push({
      name: `${attr} Stim`,
      type: STIM_ITEM_TYPE,
      rarity,
      level_requirement: snapshotLevel,
      stats: {},
      flavor_text: "A field stim recovered on mission.",
      origin: MISSION_GEAR_ORIGIN,
      consumable: { stat: attr, tier: rarity },
      // Phase 5 owns Stim sale-value migration. Leave unfinished sell path intact.
    });
  } else if (itemOutcome === LOOT_OUTCOME_JUNK) {
    junkDropped = true;
    const junkName = mission?.rewards?.collectible?.name || DEFAULT_JUNK_NAME;
    const sellValue = rollMissionJunkValue(missionStardustReward, r);
    itemTemplates.push({
      name: junkName,
      type: JUNK_ITEM_TYPE,
      rarity: JUNK_RARITY,
      level_requirement: snapshotLevel,
      stats: {},
      flavor_text: "A curious trinket recovered on mission.",
      origin: MISSION_GEAR_ORIGIN,
      sell_value: sellValue,
    });
  }

  return {
    itemOutcome,
    gearDropped,
    stimDropped,
    junkDropped,
    itemTemplates,
    gearChance: rolled.pGear,
    pityBefore,
    fuelSinceLastGearAfter: nextFuelSinceLastGear({
      fuelSinceLastGear: pityBefore,
      missionFuel,
      gearDropped,
    }),
  };
}
