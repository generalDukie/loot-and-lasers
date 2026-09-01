/**
 * Phase 6 RawQuality for Nova surcharge. Not GES. Not the retired
 * 20/80 Budget/Distribution mix.
 *
 * RawQuality = 30 × BudgetQuality + 50 × Desirability + 20 × Shape
 * (uncapped). BudgetQuality = ActualBudget / neutral same-rarity/same-slot
 * pool at the snapshotted Market generation level.
 */
import {
  EPIC_DESIRABILITY_EXPONENT,
  EPIC_LUCK_ONLY_SHAPE_CEILING,
  EPIC_LUCK_SHAPE_PENALTY_ANCHORS,
  EPIC_PL_OFF_PENALTY_SLOPE,
  EPIC_PL_OFF_SHAPE_SCALE,
  EPIC_PL_OFF_TARGET_P_SHARE,
  EPIC_PRIMARY_ONLY_SHAPE_CEILING,
  EPIC_PV_OFF_PENALTY_SLOPE,
  EPIC_PV_OFF_TARGET_P_SHARE,
  EPIC_PV_SHAPE_PENALTY_ANCHORS,
  EPIC_DOUBLE_OFF_COUNT,
  EPIC_FULL_PVL_OFF_COUNT,
  EPIC_MIXED_OFF_COUNT,
  EPIC_SINGLE_DESIRABLE_COUNT,
  EPIC_SINGLE_DESIRABLE_SHARE_REFERENCE,
  EPIC_VITALITY_ONLY_SHAPE_CEILING,
  EPIC_VL_OFF_PENALTY_SLOPE,
  EPIC_VL_OFF_SHAPE_SCALE,
  EPIC_VL_OFF_TARGET_V_SHARE,
  GEAR_LUCK_ATTR_KEY,
  GEAR_VITALITY_ATTR_KEY,
  LEGENDARY_LEAKAGE_PENALTY_SLOPE,
  LEGENDARY_LUCK_SHAPE_PENALTY_ANCHORS,
  LEGENDARY_MANDATORY_STAT_SHARE,
  LEGENDARY_PV_SHAPE_PENALTY_ANCHORS,
  RAW_QUALITY_BUDGET_WEIGHT,
  RAW_QUALITY_DESIRABILITY_WEIGHT,
  RAW_QUALITY_SHAPE_WEIGHT,
  SIMULATE_ATTR_KEYS,
  UNIT_INTERVAL_MAX,
  UNIT_INTERVAL_MIN,
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
  if (!Number.isFinite(x) || x < UNIT_INTERVAL_MIN) return UNIT_INTERVAL_MIN;
  if (x > UNIT_INTERVAL_MAX) return UNIT_INTERVAL_MAX;
  return x;
}

function resolveReferenceLevel({ referenceLevel, itemLevel }) {
  const ref = Number(referenceLevel);
  if (Number.isFinite(ref) && ref >= 1) return Math.floor(ref);
  const item = Number(itemLevel);
  if (Number.isFinite(item) && item >= 1) return Math.floor(item);
  return 1;
}

export function interpolatePiecewise(x, anchors) {
  const v = Number(x);
  if (!Number.isFinite(v) || !anchors?.length) return 0;
  const first = anchors[0];
  if (v <= first[0]) return first[1];
  const last = anchors[anchors.length - 1];
  if (v >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (v <= x1) {
      const span = x1 - x0;
      if (!(span > 0)) return y1;
      return y0 + ((v - x0) / span) * (y1 - y0);
    }
  }
  return last[1];
}

export function classDesirableAttrKeys(className) {
  const primary = SIMULATE_ATTR_KEYS[classPrimaryIndex(className)] || SIMULATE_ATTR_KEYS[0];
  return Object.freeze([primary, GEAR_VITALITY_ATTR_KEY, GEAR_LUCK_ATTR_KEY]);
}

export function classOffAttrKeys(className) {
  const desirable = new Set(classDesirableAttrKeys(className));
  return Object.freeze(SIMULATE_ATTR_KEYS.filter((key) => !desirable.has(key)));
}

export function classPrimaryAttrKey(className) {
  return classDesirableAttrKeys(className)[0];
}

/**
 * Actual generated budget vs neutral pool at the snapshotted generation level.
 * Do not clamp to 1.0. Do not add a separate ItemLevel penalty.
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

export function desirableStatShare(stats, className, total = null) {
  const t = total != null ? total : totalStats(stats);
  if (!(t > 0)) return 0;
  let sum = 0;
  for (const key of classDesirableAttrKeys(className)) sum += attrValue(stats, key);
  return sum / t;
}

export function offStatAvoidance(stats, className, total = null) {
  const t = total != null ? total : totalStats(stats);
  if (!(t > 0)) return 0;
  let off = 0;
  for (const key of classOffAttrKeys(className)) off += attrValue(stats, key);
  return 1 - off / t;
}

export function pShareOfPv(primary, vitality) {
  const pair = Number(primary) + Number(vitality);
  if (!(pair > 0)) return 0;
  return Number(primary) / pair;
}

export function legendaryLeakageShare(stats, className, total = null) {
  const t = total != null ? Number(total) : totalStats(stats);
  if (!(t > 0) || !Number.isFinite(t)) return 0;
  const floor = LEGENDARY_MANDATORY_STAT_SHARE;
  let leakage = 0;
  for (const key of classOffAttrKeys(className)) {
    leakage += Math.max(0, attrValue(stats, key) / t - floor);
  }
  return leakage;
}

export function epicDesirability(stats, className, total = null) {
  const share = desirableStatShare(stats, className, total);
  return share ** EPIC_DESIRABILITY_EXPONENT;
}

export function legendaryDesirability(stats, className, total = null) {
  const leakage = legendaryLeakageShare(stats, className, total);
  return clampUnitInterval(1 - LEGENDARY_LEAKAGE_PENALTY_SLOPE * leakage);
}

function presentPositive(value) {
  return Number(value) > 0;
}

function epicFullPvlShape(primary, vitality, luckShare) {
  const pvPenalty = interpolatePiecewise(
    pShareOfPv(primary, vitality),
    EPIC_PV_SHAPE_PENALTY_ANCHORS,
  );
  const luckPenalty = interpolatePiecewise(luckShare, EPIC_LUCK_SHAPE_PENALTY_ANCHORS);
  return clampUnitInterval(1 - pvPenalty - luckPenalty);
}

function epicPvOffShape(primary, vitality) {
  const x = pShareOfPv(primary, vitality);
  return clampUnitInterval(
    1 - EPIC_PV_OFF_PENALTY_SLOPE * Math.abs(x - EPIC_PV_OFF_TARGET_P_SHARE),
  );
}

function epicPlOffShape(primary, luck) {
  const pair = primary + luck;
  if (!(pair > 0)) return 0;
  const x = primary / pair;
  return EPIC_PL_OFF_SHAPE_SCALE * clampUnitInterval(
    1 - EPIC_PL_OFF_PENALTY_SLOPE * Math.abs(x - EPIC_PL_OFF_TARGET_P_SHARE),
  );
}

function epicVlOffShape(vitality, luck) {
  const pair = vitality + luck;
  if (!(pair > 0)) return 0;
  const x = vitality / pair;
  return EPIC_VL_OFF_SHAPE_SCALE * clampUnitInterval(
    1 - EPIC_VL_OFF_PENALTY_SLOPE * Math.abs(x - EPIC_VL_OFF_TARGET_V_SHARE),
  );
}

function epicSingleDesirableShape(desirableShare, ceiling) {
  const ref = EPIC_SINGLE_DESIRABLE_SHARE_REFERENCE;
  if (!(ref > 0)) return 0;
  return ceiling * Math.min(UNIT_INTERVAL_MAX, desirableShare / ref);
}

export function epicShape(stats, className, total = null) {
  const t = total != null ? Number(total) : totalStats(stats);
  if (!(t > 0) || !Number.isFinite(t)) return 0;
  const primaryKey = classPrimaryAttrKey(className);
  const primary = attrValue(stats, primaryKey);
  const vitality = attrValue(stats, GEAR_VITALITY_ATTR_KEY);
  const luck = attrValue(stats, GEAR_LUCK_ATTR_KEY);
  const offPresent = classOffAttrKeys(className).filter((key) => presentPositive(attrValue(stats, key))).length;
  const hasP = presentPositive(primary);
  const hasV = presentPositive(vitality);
  const hasLuck = presentPositive(luck);
  const desirablePresent = Number(hasP) + Number(hasV) + Number(hasLuck);
  const share = desirableStatShare(stats, className, t);

  if (hasP && hasV && hasLuck && offPresent === EPIC_FULL_PVL_OFF_COUNT) {
    return epicFullPvlShape(primary, vitality, luck / t);
  }
  if (hasP && hasV && !hasLuck && offPresent === EPIC_MIXED_OFF_COUNT) {
    return epicPvOffShape(primary, vitality);
  }
  if (hasP && !hasV && hasLuck && offPresent === EPIC_MIXED_OFF_COUNT) {
    return epicPlOffShape(primary, luck);
  }
  if (!hasP && hasV && hasLuck && offPresent === EPIC_MIXED_OFF_COUNT) {
    return epicVlOffShape(vitality, luck);
  }
  if (desirablePresent === EPIC_SINGLE_DESIRABLE_COUNT && offPresent === EPIC_DOUBLE_OFF_COUNT) {
    if (hasP) return epicSingleDesirableShape(share, EPIC_PRIMARY_ONLY_SHAPE_CEILING);
    if (hasV) return epicSingleDesirableShape(share, EPIC_VITALITY_ONLY_SHAPE_CEILING);
    return epicSingleDesirableShape(share, EPIC_LUCK_ONLY_SHAPE_CEILING);
  }
  return 0;
}

export function legendaryShape(stats, className, total = null) {
  const t = total != null ? Number(total) : totalStats(stats);
  if (!(t > 0) || !Number.isFinite(t)) return 0;
  const primary = attrValue(stats, classPrimaryAttrKey(className));
  const vitality = attrValue(stats, GEAR_VITALITY_ATTR_KEY);
  const luckShare = attrValue(stats, GEAR_LUCK_ATTR_KEY) / t;
  const pvPenalty = interpolatePiecewise(
    pShareOfPv(primary, vitality),
    LEGENDARY_PV_SHAPE_PENALTY_ANCHORS,
  );
  const luckPenalty = interpolatePiecewise(luckShare, LEGENDARY_LUCK_SHAPE_PENALTY_ANCHORS);
  return clampUnitInterval(1 - pvPenalty - luckPenalty);
}

export function gearDesirability(stats, className, rarity, total = null) {
  const key = String(rarity || "").toLowerCase();
  if (key === "legendary") return legendaryDesirability(stats, className, total);
  return epicDesirability(stats, className, total);
}

export function gearShape(stats, className, rarity, total = null) {
  const key = String(rarity || "").toLowerCase();
  if (key === "legendary") return legendaryShape(stats, className, total);
  return epicShape(stats, className, total);
}

export function rawQualityScore(budgetQuality, desirability, shape) {
  return (
    RAW_QUALITY_BUDGET_WEIGHT * Number(budgetQuality)
    + RAW_QUALITY_DESIRABILITY_WEIGHT * Number(desirability)
    + RAW_QUALITY_SHAPE_WEIGHT * Number(shape)
  );
}

/**
 * Combined RawQuality and Nova-surcharge band inputs.
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
  const leakage = legendaryLeakageShare(stats, className, total);
  const desirability = gearDesirability(stats, className, rarity, total);
  const shape = gearShape(stats, className, rarity, total);
  const intrinsicQuality = rawQualityScore(budgetQuality, desirability, shape);
  return Object.freeze({
    budgetQuality,
    desirability,
    shape,
    intrinsicQuality,
    rawQuality: intrinsicQuality,
    distributionQuality: desirability,
    desirableStatShare: desirableShare,
    offStatAvoidance: avoidance,
    legendaryLeakageShare: leakage,
    referenceLevel: refLevel,
    referenceBudget,
    actualBudget: total,
    rarity: String(rarity || "").toLowerCase(),
  });
}
