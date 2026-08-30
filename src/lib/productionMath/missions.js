/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 4 LIVE FOR MISSION ECONOMY
 *
 * Duration pools, Fuel mapping, remainder exception, skip Nova, Fuel-normalized
 * loot hazards, pity, rarity, item-level offsets, and EPA enemy construction.
 * Production callers must not copy these formulas. Settlement RNG is injected.
 */
import {
  ATTR_INDEX,
  DEFEAT_REWARD_FACTOR,
  MISSION_COMBAT_RULES_VERSION,
  MISSION_ENEMY_HP_SCALE,
  GEAR_SLOTS,
  MISSION_BOARD_AFFORDABLE_REROLL_LIMIT,
  MISSION_DURATION_POOL_MATURE_LEVEL,
  MISSION_DURATION_POOLS,
  MISSION_ENEMY_ARCHETYPE_CLASS,
  MISSION_ENEMY_ARCHETYPE_WEIGHTS,
  MISSION_ENEMY_ARCHETYPES,
  MISSION_GEAR_LEVEL_OFFSET_WEIGHTS,
  MISSION_GEAR_PITY_CLAMP,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_GEAR_RARITY_WEIGHTS,
  MISSION_GEAR_REFERENCE_CHANCE,
  MISSION_GEAR_REFERENCE_FUEL,
  MISSION_JUNK_NO_DROP_BASE,
  MISSION_JUNK_VALUE_RATIO,
  MISSION_JUNK_VARIANCE_MAX,
  MISSION_JUNK_VARIANCE_MIN,
  MISSION_MAX_DURATION_SECONDS,
  MISSION_MIN_DURATION_SECONDS,
  MISSION_MIN_FUEL,
  MISSION_OFFER_COUNT,
  MISSION_OFFER_DEDUPE_NUDGE_LIMIT,
  MISSION_OFFER_DEDUPE_REROLL_LIMIT,
  MISSION_SECONDS_PER_FUEL,
  MISSION_SKIP_MIN_NOVA,
  MISSION_SKIP_RAW_NOVA_PER_FUEL,
  MISSION_STIM_NO_DROP_BASE,
  MISSION_VARIANCE_PRECISION_SCALE,
  MISSION_VARIANCE_STEP,
  MISSION_XP_EFFICIENCY,
  MISSION_XP_REWARD_SCALAR,
  RARITIES,
  STIM_RARE_LEVEL_MAX,
  STIM_UNCOMMON_LEVEL_MAX,
  VARIANCE_MAX,
  VARIANCE_MIN,
} from "./constants.js";
import { quantizeFuel, roundHalfUp } from "./rounding.js";
import { missionXpReward } from "./progression.js";
import { missionStardustReward, stardustPerFuel } from "./economy.js";
import { missionEnemyAttributeTotal, missionEnemyAttributes } from "./attributes.js";
import { missionEnemyBaseDamage, missionEnemyOutgoingMultiplier } from "./combatStats.js";

const ATTR_KEYS_FOR_COMBAT = Object.freeze(["strength", "agility", "intellect", "vitality", "luck"]);
const STIM_RARITY_UNCOMMON = "uncommon";
const STIM_RARITY_RARE = "rare";
const STIM_RARITY_EPIC = "epic";
export const LOOT_OUTCOME_GEAR = "GEAR";
export const LOOT_OUTCOME_STIM = "STIM";
export const LOOT_OUTCOME_JUNK = "JUNK";
export const LOOT_OUTCOME_NONE = "NONE";
const VARIANCE_NUDGE_SIGNS = Object.freeze([-1, 1]);

function requireRng(rng, label) {
  if (typeof rng !== "function") {
    throw new Error(`${label} requires injected RNG`);
  }
  return rng;
}

function levelInt(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

function unitInterval(rng) {
  const u = Number(rng());
  if (!Number.isFinite(u) || u < 0) return 0;
  if (u >= 1) return 1 - Number.EPSILON;
  return u;
}

function unitClosedInterval(rng) {
  const u = Number(rng());
  if (!Number.isFinite(u) || u < 0) return 0;
  if (u > 1) return 1;
  return u;
}

function pickUniform(list, rng) {
  const n = list.length;
  if (n <= 0) return null;
  const idx = Math.min(n - 1, Math.floor(unitInterval(rng) * n));
  return list[idx];
}

function pickWeighted(entries, rng) {
  const total = entries.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
  if (total <= 0) return entries[0]?.value ?? null;
  let roll = unitInterval(rng) * total;
  for (const entry of entries) {
    roll -= Number(entry.weight || 0);
    if (roll < 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

export function getMissionDurationPool(level = 1) {
  const L = levelInt(level);
  if (L >= MISSION_DURATION_POOL_MATURE_LEVEL) {
    return MISSION_DURATION_POOLS[MISSION_DURATION_POOL_MATURE_LEVEL];
  }
  return MISSION_DURATION_POOLS[L] || MISSION_DURATION_POOLS[MISSION_DURATION_POOL_MATURE_LEVEL];
}

export function getAllowedMissionDurations(level = 1) {
  return [...getMissionDurationPool(level)];
}

export function fuelFromDurationSeconds(durationSeconds) {
  const sec = Math.floor(Number(durationSeconds) || 0);
  return quantizeFuel(sec / MISSION_SECONDS_PER_FUEL);
}

export function durationSecondsFromFuel(fuel) {
  const f = quantizeFuel(fuel);
  if (f < MISSION_MIN_FUEL) return null;
  const sec = roundHalfUp(f * MISSION_SECONDS_PER_FUEL);
  return Math.min(
    MISSION_MAX_DURATION_SECONDS,
    Math.max(MISSION_MIN_DURATION_SECONDS, sec),
  );
}

export function remainingFuelDurationSeconds(currentFuel) {
  return durationSecondsFromFuel(currentFuel);
}

export function cheapestNormalPoolFuel(level = 1) {
  const pool = getMissionDurationPool(level);
  let cheapest = Infinity;
  for (const sec of pool) {
    const f = fuelFromDurationSeconds(sec);
    if (f < cheapest) cheapest = f;
  }
  return cheapest;
}

export function needsRemainingFuelException(level, currentFuel) {
  const fuel = quantizeFuel(currentFuel);
  if (fuel < MISSION_MIN_FUEL) return false;
  return fuel < cheapestNormalPoolFuel(level);
}

export function affordableNormalPoolDurations(level, currentFuel) {
  const fuel = quantizeFuel(currentFuel);
  return getMissionDurationPool(level).filter((sec) => fuelFromDurationSeconds(sec) <= fuel);
}

export function isNormalPoolDuration(level, durationSeconds) {
  const sec = Math.floor(Number(durationSeconds));
  return getMissionDurationPool(level).includes(sec);
}

export function isLaunchableMissionDuration(durationSeconds) {
  const sec = Math.floor(Number(durationSeconds));
  return (
    Number.isFinite(sec)
    && sec >= MISSION_MIN_DURATION_SECONDS
    && sec <= MISSION_MAX_DURATION_SECONDS
  );
}

export function isValidMissionDuration(level, durationSeconds, pinnedFuel = null) {
  const sec = Math.floor(Number(durationSeconds));
  if (!isLaunchableMissionDuration(sec)) return false;
  if (isNormalPoolDuration(level, sec)) return true;
  if (pinnedFuel == null || !Number.isFinite(Number(pinnedFuel))) return false;
  const expected = remainingFuelDurationSeconds(pinnedFuel);
  return expected != null && expected === sec;
}

export function rollMissionDurationSeconds(level = 1, rngOrUnit) {
  const pool = getMissionDurationPool(level);
  if (typeof rngOrUnit === "function") return pickUniform(pool, rngOrUnit);
  const t = Math.min(1, Math.max(0, Number(rngOrUnit)));
  if (!Number.isFinite(t)) return pool[0];
  const idx = Math.min(pool.length - 1, Math.floor(t * pool.length));
  return pool[idx];
}

function missionVarianceMinTicks() {
  return roundHalfUp(VARIANCE_MIN * MISSION_VARIANCE_PRECISION_SCALE);
}

function missionVarianceMaxTicks() {
  return roundHalfUp(VARIANCE_MAX * MISSION_VARIANCE_PRECISION_SCALE);
}

function missionVarianceInclusiveTickCount() {
  return missionVarianceMaxTicks() - missionVarianceMinTicks() + 1;
}

function ticksFromMissionVariance(value) {
  return roundHalfUp(Number(value) * MISSION_VARIANCE_PRECISION_SCALE);
}

function missionVarianceFromTicks(ticks) {
  return ticks / MISSION_VARIANCE_PRECISION_SCALE;
}

export function rollMissionVariance(rng) {
  const r = requireRng(rng, "rollMissionVariance");
  const minTicks = missionVarianceMinTicks();
  const count = missionVarianceInclusiveTickCount();
  const idx = Math.min(count - 1, Math.floor(unitInterval(r) * count));
  return missionVarianceFromTicks(minTicks + idx);
}

export function clampMissionVariance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  const ticks = Math.min(
    missionVarianceMaxTicks(),
    Math.max(missionVarianceMinTicks(), ticksFromMissionVariance(n)),
  );
  return missionVarianceFromTicks(ticks);
}

export function missionSkipCostNova(originalFuel) {
  const fuel = Math.max(0, Number(originalFuel) || 0);
  const raw = fuel * MISSION_SKIP_RAW_NOVA_PER_FUEL;
  const ceiled = Math.ceil(raw / MISSION_SKIP_MIN_NOVA) * MISSION_SKIP_MIN_NOVA;
  return Math.max(MISSION_SKIP_MIN_NOVA, ceiled);
}

export function missionSkipCostHalfUnits(originalFuel) {
  return roundHalfUp(missionSkipCostNova(originalFuel) / MISSION_SKIP_MIN_NOVA);
}

export function missionVictoryXp({ fuel, snapshotLevel, xpVariance }) {
  return missionXpReward({
    fuel,
    snapshotLevel,
    xpVariance: clampMissionVariance(xpVariance),
    defeated: false,
  });
}

export function missionVictoryStardust({ fuel, snapshotLevel, stardustVariance }) {
  return missionStardustReward({
    fuel,
    snapshotLevel,
    stardustVariance: clampMissionVariance(stardustVariance),
    defeated: false,
  });
}

export function missionDefeatXp(victoryXp) {
  return Math.max(0, roundHalfUp((Number(victoryXp) || 0) * DEFEAT_REWARD_FACTOR));
}

export function missionDefeatStardust(victoryStardust) {
  return Math.max(0, roundHalfUp((Number(victoryStardust) || 0) * DEFEAT_REWARD_FACTOR));
}

export function missionXpNamedFactors() {
  return {
    efficiency: MISSION_XP_EFFICIENCY,
    rewardScalar: MISSION_XP_REWARD_SCALAR,
  };
}

export function readFuelSinceLastGear(character) {
  const stored = Number(character?.fuel_since_last_gear);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const streak = Math.max(0, Math.floor(Number(character?.mission_gear_miss_streak) || 0));
  return quantizeFuel(streak * MISSION_GEAR_REFERENCE_FUEL);
}

export function missionGearReferencePity(fuelSinceLastGear) {
  const F = Math.max(0, Number(fuelSinceLastGear) || 0);
  return Math.min(
    MISSION_GEAR_PITY_CLAMP,
    MISSION_GEAR_REFERENCE_CHANCE
      + MISSION_GEAR_PITY_INCREMENT * (F / MISSION_GEAR_REFERENCE_FUEL),
  );
}

export function missionGearDropProbability(missionFuel, fuelSinceLastGear) {
  const F = Number(missionFuel) || 0;
  if (F <= 0) return 0;
  const pRef = missionGearReferencePity(fuelSinceLastGear);
  return 1 - (1 - pRef) ** (F / MISSION_GEAR_REFERENCE_FUEL);
}

export function missionStimConditionalProbability(missionFuel) {
  const F = Number(missionFuel) || 0;
  if (F <= 0) return 0;
  return 1 - MISSION_STIM_NO_DROP_BASE ** (F / MISSION_GEAR_REFERENCE_FUEL);
}

export function missionJunkConditionalProbability(missionFuel) {
  const F = Number(missionFuel) || 0;
  if (F <= 0) return 0;
  return 1 - MISSION_JUNK_NO_DROP_BASE ** (F / MISSION_GEAR_REFERENCE_FUEL);
}

export function nextFuelSinceLastGear({ fuelSinceLastGear, missionFuel, gearDropped }) {
  if (gearDropped) return 0;
  return quantizeFuel((Number(fuelSinceLastGear) || 0) + (Number(missionFuel) || 0));
}

export function rollMissionLootOutcome({ missionFuel, fuelSinceLastGear, rng }) {
  const r = requireRng(rng, "rollMissionLootOutcome");
  const F = Number(missionFuel) || 0;
  const pGear = missionGearDropProbability(F, fuelSinceLastGear);
  if (unitInterval(r) < pGear) {
    return { outcome: LOOT_OUTCOME_GEAR, pGear, pStim: 0, pJunk: 0 };
  }
  const pStim = missionStimConditionalProbability(F);
  if (unitInterval(r) < pStim) {
    return { outcome: LOOT_OUTCOME_STIM, pGear, pStim, pJunk: 0 };
  }
  const pJunk = missionJunkConditionalProbability(F);
  if (unitInterval(r) < pJunk) {
    return { outcome: LOOT_OUTCOME_JUNK, pGear, pStim, pJunk };
  }
  return { outcome: LOOT_OUTCOME_NONE, pGear, pStim, pJunk };
}

export function rollMissionGearRarity(rng) {
  const r = requireRng(rng, "rollMissionGearRarity");
  const entries = RARITIES.map((rarity) => ({
    value: rarity,
    weight: Number(MISSION_GEAR_RARITY_WEIGHTS[rarity] || 0),
  })).filter((entry) => entry.weight > 0);
  return pickWeighted(entries, r);
}

export function rollMissionGearSlot(rng) {
  return pickUniform(GEAR_SLOTS, requireRng(rng, "rollMissionGearSlot"));
}

export function rollMissionGearItemLevel(snapshotLevel, rng) {
  const r = requireRng(rng, "rollMissionGearItemLevel");
  const snap = levelInt(snapshotLevel);
  const entries = MISSION_GEAR_LEVEL_OFFSET_WEIGHTS.map((weight, offset) => ({
    value: offset,
    weight,
  }));
  const offset = pickWeighted(entries, r);
  return Math.max(1, snap - offset);
}

export function missionStimRarityForLevel(snapshotLevel) {
  const L = levelInt(snapshotLevel);
  if (L <= STIM_UNCOMMON_LEVEL_MAX) return STIM_RARITY_UNCOMMON;
  if (L <= STIM_RARE_LEVEL_MAX) return STIM_RARITY_RARE;
  return STIM_RARITY_EPIC;
}

export function rollMissionStimAttribute(rng) {
  return pickUniform(ATTR_KEYS_FOR_COMBAT, requireRng(rng, "rollMissionStimAttribute"));
}

export function missionJunkBaseValue(missionStardustReward) {
  return (Number(missionStardustReward) || 0) * MISSION_JUNK_VALUE_RATIO;
}

export function rollMissionJunkValue(missionStardustReward, rng) {
  const r = requireRng(rng, "rollMissionJunkValue");
  const base = missionJunkBaseValue(missionStardustReward);
  const span = MISSION_JUNK_VARIANCE_MAX - MISSION_JUNK_VARIANCE_MIN;
  const variance = MISSION_JUNK_VARIANCE_MIN + unitClosedInterval(r) * span;
  return Math.max(0, roundHalfUp(base * variance));
}

export function missionEconomicSignature({ durationSeconds, xpVariance, stardustVariance }) {
  return [
    Math.floor(Number(durationSeconds) || 0),
    clampMissionVariance(xpVariance),
    clampMissionVariance(stardustVariance),
  ].join("|");
}

function nudgeVariance(value, rng) {
  const dir = pickUniform(VARIANCE_NUDGE_SIGNS, rng) * MISSION_VARIANCE_STEP;
  return clampMissionVariance((Number(value) || 1) + dir);
}

export function dedupeMissionEconomicOffers(offers, rng) {
  const r = requireRng(rng, "dedupeMissionEconomicOffers");
  const seen = new Set();
  for (const offer of offers) {
    let tries = 0;
    let key = missionEconomicSignature(offer);
    while (seen.has(key) && tries < MISSION_OFFER_DEDUPE_REROLL_LIMIT) {
      offer.xpVariance = rollMissionVariance(r);
      offer.stardustVariance = rollMissionVariance(r);
      key = missionEconomicSignature(offer);
      tries += 1;
    }
    let nudges = 0;
    while (seen.has(key) && nudges < MISSION_OFFER_DEDUPE_NUDGE_LIMIT) {
      offer.stardustVariance = nudgeVariance(offer.stardustVariance, r);
      key = missionEconomicSignature(offer);
      if (seen.has(key)) {
        offer.xpVariance = nudgeVariance(offer.xpVariance, r);
        key = missionEconomicSignature(offer);
      }
      nudges += 1;
    }
    seen.add(key);
  }
  return offers;
}

export function hasDuplicateEconomicOffers(offers) {
  const seen = new Set();
  for (const offer of offers) {
    const key = missionEconomicSignature(offer);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function rollBoardDurations(level, rng) {
  const pool = getMissionDurationPool(level);
  const durations = [];
  for (let i = 0; i < MISSION_OFFER_COUNT; i++) {
    durations.push(pickUniform(pool, rng));
  }
  return durations;
}

export function generateMissionBoardDurations(opts = {}) {
  const level = opts.level;
  const availableFuel = opts.availableFuel ?? opts.fuel ?? opts.currentFuel;
  const rng = opts.rng ?? opts.random;
  const r = requireRng(rng, "generateMissionBoardDurations");
  const fuel = quantizeFuel(availableFuel);
  const affordable = affordableNormalPoolDurations(level, fuel);
  if (affordable.length > 0) {
    let durations = rollBoardDurations(level, r);
    let attempts = 0;
    while (
      !durations.some((sec) => fuelFromDurationSeconds(sec) <= fuel)
      && attempts < MISSION_BOARD_AFFORDABLE_REROLL_LIMIT
    ) {
      durations = rollBoardDurations(level, r);
      attempts += 1;
    }
    if (!durations.some((sec) => fuelFromDurationSeconds(sec) <= fuel)) {
      durations[0] = pickUniform(affordable, r);
    }
    return durations.map((sec) => ({
      durationSeconds: sec,
      fuelCost: fuelFromDurationSeconds(sec),
      lowFuel: false,
    }));
  }
  if (fuel < MISSION_MIN_FUEL) {
    return rollBoardDurations(level, r).map((sec) => ({
      durationSeconds: sec,
      fuelCost: fuelFromDurationSeconds(sec),
      lowFuel: false,
    }));
  }
  const remainderSec = remainingFuelDurationSeconds(fuel);
  const remainderFuel = quantizeFuel(fuel);
  const slots = [];
  for (let i = 0; i < MISSION_OFFER_COUNT; i++) {
    slots.push({
      durationSeconds: remainderSec,
      fuelCost: remainderFuel,
      lowFuel: true,
    });
  }
  return slots;
}

export function generateMissionOfferEconomics(opts = {}) {
  const level = opts.level;
  const availableFuel =
    opts.availableFuel ??
    opts.fuel ??
    opts.currentFuel;
  const rng = opts.rng ?? opts.random;
  const r = requireRng(rng, "generateMissionOfferEconomics");
  const slots = generateMissionBoardDurations({
    level,
    availableFuel,
    rng: r,
  });
  const offers = slots.map((slot) => {
    const durationSeconds = slot.durationSeconds;
    const fuelCost = slot.fuelCost;
    const lowFuel = !!slot.lowFuel;
    const xpVariance = rollMissionVariance(r);
    const stardustVariance = rollMissionVariance(r);
    return {
      durationSeconds,
      fuelCost,
      lowFuel,
      xpVariance,
      stardustVariance,
      duration_seconds: durationSeconds,
      fuel_cost: fuelCost,
      low_fuel: lowFuel,
      xp_efficiency: xpVariance,
      stardust_efficiency: stardustVariance,
    };
  });
  return dedupeMissionEconomicOffers(offers, r);
}

export function pickMissionEnemyArchetype(rng) {
  const r = requireRng(rng, "pickMissionEnemyArchetype");
  const entries = MISSION_ENEMY_ARCHETYPES.map((value, i) => ({
    value,
    weight: MISSION_ENEMY_ARCHETYPE_WEIGHTS[i],
  }));
  return pickWeighted(entries, r);
}

export function constructMissionEnemy({ snapshotLevel, rng }) {
  const r = requireRng(rng, "constructMissionEnemy");
  const level = levelInt(snapshotLevel);
  const archetype = pickMissionEnemyArchetype(r);
  const archetypeIndex = MISSION_ENEMY_ARCHETYPES.indexOf(archetype);
  const built = missionEnemyAttributes(level, archetypeIndex);
  const arr = built.attributes;
  const stats = {
    strength: arr[ATTR_INDEX.str],
    agility: arr[ATTR_INDEX.agi],
    intellect: arr[ATTR_INDEX.int],
    vitality: arr[ATTR_INDEX.vit],
    luck: arr[ATTR_INDEX.luck],
  };
  const total = Object.values(stats).reduce((sum, n) => sum + n, 0);
  return {
    missionEnemy: true,
    suppressClassPassive: true,
    snapshotStats: true,
    level,
    class: MISSION_ENEMY_ARCHETYPE_CLASS[archetype],
    race: null,
    missionEnemyArchetype: archetype,
    stats,
    attributeTotal: total,
    expectedBudget: missionEnemyAttributeTotal(level),
    baseDamage: missionEnemyBaseDamage(level),
    noGear: true,
    noPassive: true,
    noRaceEffect: true,
  };
}

export function snapshotMissionAcceptance({
  characterLevel,
  offer,
  collectionPct = 0,
  nexusBonus = false,
  ...rest
} = {}) {
  const snapshotLevel = levelInt(characterLevel ?? rest.characterLevel);
  const collected = Number(collectionPct ?? rest.collectionPct) || 0;
  const nexus = !!(nexusBonus ?? rest.nexusBonus);
  const fuel = Number(offer.fuelCost ?? offer.fuel_cost);
  const durationSeconds = Math.floor(Number(offer.durationSeconds ?? offer.duration_seconds));
  const xpVariance = clampMissionVariance(offer.xpVariance ?? offer.xp_efficiency);
  const stardustVariance = clampMissionVariance(
    offer.stardustVariance ?? offer.stardust_efficiency,
  );
  const previewXp = Number.isFinite(Number(offer.finalXp ?? offer.final_xp))
    ? Number(offer.finalXp ?? offer.final_xp)
    : missionVictoryXp({ fuel, snapshotLevel, xpVariance });
  const previewStardust = Number.isFinite(Number(offer.finalStardust ?? offer.final_stardust))
    ? Number(offer.finalStardust ?? offer.final_stardust)
    : missionVictoryStardust({ fuel, snapshotLevel, stardustVariance });
  return {
    character_level: snapshotLevel,
    original_fuel_cost: fuel,
    fuel_cost: fuel,
    duration_seconds: durationSeconds,
    xp_efficiency: xpVariance,
    stardust_efficiency: stardustVariance,
    xp_basis: missionXpReward({
      fuel,
      snapshotLevel,
      xpVariance: 1,
      defeated: false,
    }),
    stardust_basis: stardustPerFuel(snapshotLevel),
    final_xp: previewXp,
    final_stardust: previewStardust,
    preview_xp: previewXp,
    preview_stardust: previewStardust,
    reward_item_level_basis: snapshotLevel,
    accepted_offer_id: offer.offerId ?? offer.offer_id ?? "",
    template_name: offer.name || "",
    enemy_epa_level: snapshotLevel,
    enemy_attribute_budget: missionEnemyAttributeTotal(snapshotLevel),
    collection_pct: Number(collectionPct) || 0,
    nexus_bonus: !!nexusBonus,
    mission_combat_rules_version: MISSION_COMBAT_RULES_VERSION,
    mission_enemy_hp_scale: MISSION_ENEMY_HP_SCALE,
    mission_enemy_outgoing_multiplier: missionEnemyOutgoingMultiplier(snapshotLevel),
  };
}
