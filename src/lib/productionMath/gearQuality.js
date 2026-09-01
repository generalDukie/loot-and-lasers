/**
 * Nova-surcharge Intrinsic Quality. Not GES. Not raw stat-budget variance.
 *
 * BudgetQuality = ActualBudget / neutral same-rarity/same-slot pool at the
 * snapshotted Market generation level (not the item's own ItemLevel).
 * Not clamped to 1.0 — Phase 2 ±10% variance can exceed the neutral pool.
 */
import {
  EPIC_DISTRIBUTION_DESIRABLE_SHARE_WEIGHT,
  EPIC_DISTRIBUTION_LUCK_SUITABILITY_WEIGHT,
  EPIC_DISTRIBUTION_PV_BALANCE_WEIGHT,
  GEAR_LUCK_ATTR_KEY,
  GEAR_VITALITY_ATTR_KEY,
  INTRINSIC_QUALITY_BUDGET_WEIGHT,
  INTRINSIC_QUALITY_DISTRIBUTION_WEIGHT,
  LEGENDARY_DISTRIBUTION_LUCK_SUITABILITY_WEIGHT,
  LEGENDARY_DISTRIBUTION_OFF_STAT_AVOIDANCE_WEIGHT,
  LEGENDARY_DISTRIBUTION_PV_BALANCE_WEIGHT,
  LEGENDARY_MANDATORY_BUDGET_SHARE,
  LEGENDARY_MANDATORY_STAT_SHARE,
  LUCK_SUITABILITY_DECAY_SPAN,
  LUCK_SUITABILITY_FULL_CREDIT_SHARE,
  LUCK_SUITABILITY_ZERO_CREDIT_SHARE,
  SIMULATE_ATTR_KEYS,
} from "./constants.js";
import { classPrimaryIndex } from "./attributes.js";
import { gearStatPool } from "./gear.js";

function attrValue(stats, key) {
  const n = Number(stats?.[key] || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function totalStats(stats) {
  let sum = 0;
  for (const key of SIMULATE_ATTR_KEYS) sum += attrValue(stats, key);
  return sum;
}

function clampUnitInterval(value) {
  const x = Number(value);
  if (!Number.isFinite(x) || x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function resolveReferenceLevel({ referenceLevel, itemLevel }) {
  const ref = Number(referenceLevel);
  if (Number.isFinite(ref) && ref >= 1) return Math.floor(ref);
  const item = Number(itemLevel);
  if (Number.isFinite(item) && item >= 1) return Math.floor(item);
  return 1;
}

export function classDesirableAttrKeys(className) {
  const primary = SIMULATE_ATTR_KEYS[classPrimaryIndex(className)] || SIMULATE_ATTR_KEYS[0];
  return Object.freeze([primary, GEAR_VITALITY_ATTR_KEY, GEAR_LUCK_ATTR_KEY]);
}

export function classOffAttrKeys(className) {
  const desirable = new Set(classDesirableAttrKeys(className));
  return Object.freeze(SIMULATE_ATTR_KEYS.filter((key) => !desirable.has(key)));
}

/**
 * Actual generated budget vs neutral pool at the snapshotted generation level.
 * Do not clamp to 1.0.
 */
export function gearBudgetQuality({
  stats,
  referenceLevel,
  itemLevel,
  slot,
  rarity,
  actualTotal = null,
} = {}) {
  const refLevel = resolveReferenceLevel({ referenceLevel, itemLevel });
  const referenceBudget = gearStatPool(refLevel, slot, rarity);
  const actual = actualTotal != null ? Number(actualTotal) : totalStats(stats);
  if (!(referenceBudget > 0) || !(actual >= 0) || !Number.isFinite(actual)) return 0;
  return actual / referenceBudget;
}

/** Share of the piece budget on primary + vitality + luck. */
export function desirableStatShare(stats, className, total = null) {
  const t = total != null ? total : totalStats(stats);
  if (!(t > 0)) return 0;
  let sum = 0;
  for (const key of classDesirableAttrKeys(className)) sum += attrValue(stats, key);
  return sum / t;
}

/** 1 − off-stat budget share. Not the Legendary discretionary-excess helper. */
export function offStatAvoidance(stats, className, total = null) {
  const t = total != null ? total : totalStats(stats);
  if (!(t > 0)) return 0;
  let off = 0;
  for (const key of classOffAttrKeys(className)) off += attrValue(stats, key);
  return 1 - off / t;
}

/**
 * Legendary: 1 − (discretionary off-stat excess / discretionary budget).
 * Mandatory 10% per required stat is not a penalty.
 */
export function discretionaryOffStatAvoidance(stats, className, total = null) {
  const t = total != null ? Number(total) : totalStats(stats);
  if (!(t > 0) || !Number.isFinite(t)) return 0;
  const mandatoryPerStat = LEGENDARY_MANDATORY_STAT_SHARE * t;
  const discretionaryBudget = t - LEGENDARY_MANDATORY_BUDGET_SHARE * t;
  if (!(discretionaryBudget > 0)) return 1;
  let excess = 0;
  for (const key of classOffAttrKeys(className)) {
    excess += Math.max(0, attrValue(stats, key) - mandatoryPerStat);
  }
  return clampUnitInterval(1 - excess / discretionaryBudget);
}

/** 1 − |P−V|/(P+V). Equal P/V → 1. One side zero → 0. Both zero → 0. */
export function primaryVitalityBalance(stats, className) {
  const primaryKey = classDesirableAttrKeys(className)[0];
  const primary = attrValue(stats, primaryKey);
  const vitality = attrValue(stats, GEAR_VITALITY_ATTR_KEY);
  const pair = primary + vitality;
  if (!(pair > 0)) return 0;
  return 1 - Math.abs(primary - vitality) / pair;
}

/**
 * LuckShare = Luck / ActualTotalAllocatedStats.
 * 0 luck → 0; (0, 30%] → 1; (30%, 60%) linear decay; ≥60% → 0.
 */
export function luckSuitability(stats, className, total = null) {
  void className;
  const t = total != null ? Number(total) : totalStats(stats);
  const luck = attrValue(stats, GEAR_LUCK_ATTR_KEY);
  if (!(luck > 0) || !(t > 0) || !Number.isFinite(t)) return 0;
  const luckShare = luck / t;
  if (luckShare <= LUCK_SUITABILITY_FULL_CREDIT_SHARE) return 1;
  if (luckShare >= LUCK_SUITABILITY_ZERO_CREDIT_SHARE) return 0;
  return clampUnitInterval(
    (LUCK_SUITABILITY_ZERO_CREDIT_SHARE - luckShare) / LUCK_SUITABILITY_DECAY_SPAN,
  );
}

export function epicDistributionQuality(stats, className, total = null) {
  const t = total != null ? total : totalStats(stats);
  return (
    EPIC_DISTRIBUTION_DESIRABLE_SHARE_WEIGHT * desirableStatShare(stats, className, t)
    + EPIC_DISTRIBUTION_PV_BALANCE_WEIGHT * primaryVitalityBalance(stats, className)
    + EPIC_DISTRIBUTION_LUCK_SUITABILITY_WEIGHT * luckSuitability(stats, className, t)
  );
}

export function legendaryDistributionQuality(stats, className, total = null) {
  const t = total != null ? total : totalStats(stats);
  return (
    LEGENDARY_DISTRIBUTION_OFF_STAT_AVOIDANCE_WEIGHT
      * discretionaryOffStatAvoidance(stats, className, t)
    + LEGENDARY_DISTRIBUTION_PV_BALANCE_WEIGHT * primaryVitalityBalance(stats, className)
    + LEGENDARY_DISTRIBUTION_LUCK_SUITABILITY_WEIGHT * luckSuitability(stats, className, t)
  );
}

export function gearDistributionQuality(stats, className, rarity, total = null) {
  const key = String(rarity || "").toLowerCase();
  if (key === "legendary") return legendaryDistributionQuality(stats, className, total);
  return epicDistributionQuality(stats, className, total);
}

/**
 * Combined Intrinsic Quality and Nova-surcharge band inputs.
 * Percentile among same-rarity items is applied by the caller (empirical CDF).
 */
export function scoreGearIntrinsicQuality({
  stats,
  rarity,
  slot,
  itemLevel,
  referenceLevel,
  className,
  actualTotal = null,
} = {}) {
  const total = actualTotal != null ? Number(actualTotal) : totalStats(stats);
  const refLevel = resolveReferenceLevel({ referenceLevel, itemLevel });
  const referenceBudget = gearStatPool(refLevel, slot, rarity);
  const budgetQuality = gearBudgetQuality({
    stats,
    referenceLevel: refLevel,
    itemLevel,
    slot,
    rarity,
    actualTotal: total,
  });
  const desirableShare = desirableStatShare(stats, className, total);
  const avoidance = offStatAvoidance(stats, className, total);
  const discretionaryAvoidance = discretionaryOffStatAvoidance(stats, className, total);
  const pvBalance = primaryVitalityBalance(stats, className);
  const luck = luckSuitability(stats, className, total);
  const distributionQuality = gearDistributionQuality(stats, className, rarity, total);
  const intrinsicQuality =
    INTRINSIC_QUALITY_BUDGET_WEIGHT * budgetQuality
    + INTRINSIC_QUALITY_DISTRIBUTION_WEIGHT * distributionQuality;
  return Object.freeze({
    budgetQuality,
    distributionQuality,
    intrinsicQuality,
    desirableStatShare: desirableShare,
    offStatAvoidance: avoidance,
    discretionaryOffStatAvoidance: discretionaryAvoidance,
    primaryVitalityBalance: pvBalance,
    luckSuitability: luck,
    referenceLevel: refLevel,
    referenceBudget,
    actualBudget: total,
    rarity: String(rarity || "").toLowerCase(),
  });
}
