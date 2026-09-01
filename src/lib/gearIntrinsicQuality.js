/**
 * Offer-time Intrinsic Quality + within-rarity percentile for Nova surcharge.
 * Scoring is productionMath/gearQuality RawQuality. Percentile is the empirical
 * CDF of that score among same-rarity **normal Black Market** Gear: Market 35/35/20/10
 * ItemLevel offsets vs snapshotted generation level, Phase 2 ±10% variance,
 * current slot/allocation rules, class-relative roles. Cache key is
 * rarity + qualityReferenceLevel (not class). Contraband uses this same
 * rarity/level CDF (no separate current-level distribution).
 */
import { GenerateGearItem } from "./itemGeneration.js";
import {
  CLASS_PRIMARY_INDEX,
  INTRINSIC_QUALITY_CDF_LEVEL_SEED_MIX,
  INTRINSIC_QUALITY_CDF_MIN_REFERENCE_LEVEL,
  INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL,
  INTRINSIC_QUALITY_CDF_SAMPLE_SIZE,
  INTRINSIC_QUALITY_CDF_SEED_BASE,
  novaSurchargeBandIndex,
  NOVA_SURCHARGE_BANDS,
  rollMarketGearItemLevel,
  rollMarketGearSlot,
  scoreGearIntrinsicQuality,
} from "./productionMath/index.js";

const MULBERRY_INCREMENT = 0x6d2b79f5;
const SEED_SHIFT_15 = 15;
const SEED_SHIFT_7 = 7;
const SEED_SHIFT_14 = 14;
const MULBERRY_MIX_61 = 61;
const UINT32_DIVISOR = 4294967296;
const RARITY_SEED_MIX = 0x9e3779b1;

const cdfCache = new Map();
const CDF_CLASS_NAMES = Object.freeze(Object.keys(CLASS_PRIMARY_INDEX));

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + MULBERRY_INCREMENT) | 0;
    let t = Math.imul(a ^ (a >>> SEED_SHIFT_15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> SEED_SHIFT_7), MULBERRY_MIX_61 | t)) ^ t;
    return ((t ^ (t >>> SEED_SHIFT_14)) >>> 0) / UINT32_DIVISOR;
  };
}

function raritySeed(rarity) {
  const text = String(rarity || "epic");
  let h = INTRINSIC_QUALITY_CDF_SEED_BASE;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), RARITY_SEED_MIX);
  }
  return h >>> 0;
}

export function resolveIntrinsicQualityCdfReferenceLevel(qualityReferenceLevel) {
  const n = Math.floor(Number(qualityReferenceLevel));
  if (Number.isFinite(n) && n >= INTRINSIC_QUALITY_CDF_MIN_REFERENCE_LEVEL) return n;
  return INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL;
}

export function intrinsicQualityCdfCacheKey(rarity, qualityReferenceLevel) {
  const key = String(rarity || "").toLowerCase();
  const level = resolveIntrinsicQualityCdfReferenceLevel(qualityReferenceLevel);
  return `${key}:${level}`;
}

function cdfSeed(rarity, referenceLevel) {
  const rarityHash = raritySeed(rarity);
  return Math.imul(rarityHash ^ referenceLevel, INTRINSIC_QUALITY_CDF_LEVEL_SEED_MIX) >>> 0;
}

const EMPIRICAL_CDF_TIE_HALF_DIVISOR = 2;

function empiricalCdf(sorted, value) {
  const n = sorted.length;
  if (n <= 0) return 0;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  let equal = 0;
  for (let i = lo; i < n && sorted[i] === value; i++) equal += 1;
  const less = lo;
  return (less + equal / EMPIRICAL_CDF_TIE_HALF_DIVISOR) / n;
}

/**
 * One CDF sample identity: Market ItemLevel mix vs a generation-level
 * reference. Live offers score BudgetQuality the same way. Early levels
 * use live `rollMarketGearItemLevel` clamping.
 */
export function rollIntrinsicQualityCdfIdentity(
  rng,
  referenceLevel = INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL,
) {
  const L = Math.max(
    INTRINSIC_QUALITY_CDF_MIN_REFERENCE_LEVEL,
    Math.floor(Number(referenceLevel) || INTRINSIC_QUALITY_CDF_MIN_REFERENCE_LEVEL),
  );
  return {
    referenceLevel: L,
    itemLevel: rollMarketGearItemLevel(L, rng),
    slot: rollMarketGearSlot(rng),
  };
}

function referenceIntrinsicQualities(rarity, qualityReferenceLevel) {
  const cacheKey = intrinsicQualityCdfCacheKey(rarity, qualityReferenceLevel);
  const cached = cdfCache.get(cacheKey);
  if (cached) return cached;
  const key = String(rarity || "").toLowerCase();
  const referenceLevel = resolveIntrinsicQualityCdfReferenceLevel(qualityReferenceLevel);
  const rng = mulberry32(cdfSeed(key, referenceLevel));
  const values = [];
  const classCount = CDF_CLASS_NAMES.length;
  for (let i = 0; i < INTRINSIC_QUALITY_CDF_SAMPLE_SIZE; i++) {
    const className = CDF_CLASS_NAMES[i % classCount];
    const identity = rollIntrinsicQualityCdfIdentity(rng, referenceLevel);
    const item = GenerateGearItem({
      itemLevel: identity.itemLevel,
      itemType: identity.slot,
      rarity,
      rng,
      className,
    });
    values.push(
      scoreGearIntrinsicQuality({
        stats: item.stats,
        rarity,
        slot: identity.slot,
        itemLevel: identity.itemLevel,
        referenceLevel: identity.referenceLevel,
        className,
        actualTotal: item.stat_budget ?? null,
      }).intrinsicQuality,
    );
  }
  values.sort((a, b) => a - b);
  cdfCache.set(cacheKey, values);
  return values;
}

export function resetIntrinsicQualityCdfCache() {
  cdfCache.clear();
}

export function getIntrinsicQualityCdfCacheSize() {
  return cdfCache.size;
}

export function intrinsicQualityPercentile(intrinsicQuality, rarity, qualityReferenceLevel) {
  return empiricalCdf(
    referenceIntrinsicQualities(rarity, qualityReferenceLevel),
    Number(intrinsicQuality) || 0,
  );
}

export function resolveOfferIntrinsicQuality({ item, className, referenceLevel } = {}) {
  const rarity = String(item?.rarity || "").toLowerCase();
  const slot = item?.type;
  const itemLevel = Math.max(1, Math.floor(Number(item?.level_requirement ?? item?.level) || 1));
  const snapshottedRef = Number(item?.quality_reference_level);
  const resolvedReference = Number.isFinite(snapshottedRef)
    && snapshottedRef >= INTRINSIC_QUALITY_CDF_MIN_REFERENCE_LEVEL
    ? Math.floor(snapshottedRef)
    : referenceLevel;
  const scored = scoreGearIntrinsicQuality({
    stats: item?.stats,
    rarity,
    slot,
    itemLevel,
    referenceLevel: resolvedReference,
    className,
    actualTotal: item?.stat_budget ?? null,
  });
  const needsBand = rarity === "epic" || rarity === "legendary";
  const percentile = needsBand
    ? intrinsicQualityPercentile(scored.intrinsicQuality, rarity, scored.referenceLevel)
    : 0;
  const band = novaSurchargeBandIndex(percentile);
  return {
    ...scored,
    percentile,
    band,
    bandId: NOVA_SURCHARGE_BANDS[band]?.id || null,
  };
}
