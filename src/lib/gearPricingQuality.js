/**
 * Permanent item-intrinsic pricing quality (post–Phase 7 amendment).
 *
 * Independent of Phase 6 Nova offer-relative Intrinsic Quality
 * (`gearIntrinsicQuality.js` / `scoreGearIntrinsicQuality`).
 *
 * CDF samples use `rollItemStats` only — never `GenerateGearItem` — so scoring
 * cannot recurse through the universal generator or consume gameplay RNG.
 */
import { rollItemStats } from "./itemGeneration.js";
import {
  applyHaggleDiscountToPrice,
  blackMarketPrice,
  CLASS_PRIMARY_INDEX,
  CLASS_ARCHETYPE,
  GEAR_ORIGINS_WITH_LEGACY_LISTING_VARIANCE,
  GEAR_ORIGIN_MARKET,
  GEAR_ORIGIN_CONTRABAND,
  gearQualityListPrice,
  gearQualityResaleValue,
  gearResaleValue,
  gearStatPool,
  MARKET_HAGGLE_DISCOUNT_MAX_PERCENT,
  MARKET_HAGGLE_VENDOR_FLOOR_OFFSET,
  MARKET_PRICE_VARIANCE_MIN,
  PRICING_QUALITY_CDF_LEVEL_SEED_MIX,
  PRICING_QUALITY_CDF_MIN_REFERENCE_LEVEL,
  PRICING_QUALITY_CDF_SAMPLE_SIZE,
  PRICING_QUALITY_CDF_SEED_BASE,
  PRICING_QUALITY_FALLBACK_UNRECOVERABLE,
  PRICING_QUALITY_NEUTRAL_SCORE,
  PRICING_QUALITY_PERCENTILE_SCALE,
  PRICING_QUALITY_RULES_VERSION,
  PRICING_QUALITY_SCORE_MAX,
  PRICING_QUALITY_SCORE_MIN,
  rollMarketGearSlot,
  roundHalfUp,
  scoreGearPricingQuality,
  qualityPriceMultiplierBps,
} from "./productionMath/index.js";
import { canonicalGearSlot } from "./productionMath/gear.js";

const MULBERRY_INCREMENT = 0x6d2b79f5;
const SEED_SHIFT_15 = 15;
const SEED_SHIFT_7 = 7;
const SEED_SHIFT_14 = 14;
const MULBERRY_MIX_61 = 61;
const UINT32_DIVISOR = 4294967296;
const RARITY_SEED_MIX = 0x9e3779b1;
const EMPIRICAL_CDF_TIE_HALF_DIVISOR = 2;

const cdfCache = new Map();
const CDF_CLASS_NAMES = Object.freeze(Object.keys(CLASS_PRIMARY_INDEX));

let cdfBuildDepth = 0;

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
  const text = String(rarity || "rare");
  let h = PRICING_QUALITY_CDF_SEED_BASE;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), RARITY_SEED_MIX);
  }
  return h >>> 0;
}

export function resolvePricingQualityStatBudgetLevel(statBudgetLevel) {
  const n = Math.floor(Number(statBudgetLevel));
  if (Number.isFinite(n) && n >= PRICING_QUALITY_CDF_MIN_REFERENCE_LEVEL) return n;
  return PRICING_QUALITY_CDF_MIN_REFERENCE_LEVEL;
}

export function pricingQualityCdfCacheKey(rarity, statBudgetLevel) {
  const key = String(rarity || "").toLowerCase();
  const level = resolvePricingQualityStatBudgetLevel(statBudgetLevel);
  return `${key}:${level}:${PRICING_QUALITY_RULES_VERSION}`;
}

function cdfSeed(rarity, statBudgetLevel) {
  const rarityHash = raritySeed(rarity);
  return Math.imul(rarityHash ^ statBudgetLevel, PRICING_QUALITY_CDF_LEVEL_SEED_MIX) >>> 0;
}

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

function referencePricingQualities(rarity, statBudgetLevel) {
  const cacheKey = pricingQualityCdfCacheKey(rarity, statBudgetLevel);
  const cached = cdfCache.get(cacheKey);
  if (cached) return cached;
  if (cdfBuildDepth > 0) {
    throw new Error("Pricing-quality CDF must not recurse through scoring");
  }
  cdfBuildDepth += 1;
  try {
    const key = String(rarity || "").toLowerCase();
    const level = resolvePricingQualityStatBudgetLevel(statBudgetLevel);
    const rng = mulberry32(cdfSeed(key, level));
    const values = [];
    const classCount = CDF_CLASS_NAMES.length;
    for (let i = 0; i < PRICING_QUALITY_CDF_SAMPLE_SIZE; i++) {
      const className = CDF_CLASS_NAMES[i % classCount];
      const slot = rollMarketGearSlot(rng);
      const rolled = rollItemStats({
        itemLevel: level,
        statBudgetLevel: level,
        type: slot,
        rarity: key,
        rng,
        className,
      });
      values.push(
        scoreGearPricingQuality({
          stats: rolled.stats,
          rarity: key,
          slot,
          statBudgetLevel: level,
          className,
          actualTotal: rolled.budget,
          expectedBudget: rolled.preVarianceBudget,
        }).rawPricingQuality,
      );
    }
    values.sort((a, b) => a - b);
    cdfCache.set(cacheKey, values);
    return values;
  } finally {
    cdfBuildDepth -= 1;
  }
}

export function resetPricingQualityCdfCache() {
  cdfCache.clear();
}

export function getPricingQualityCdfCacheSize() {
  return cdfCache.size;
}

export function getPricingQualityCdfClassNames() {
  return CDF_CLASS_NAMES;
}

export function pricingQualityPercentile(rawPricingQuality, rarity, statBudgetLevel) {
  return empiricalCdf(
    referencePricingQualities(rarity, statBudgetLevel),
    Number(rawPricingQuality) || 0,
  );
}

export function pricingQualityScoreFromPercentile(percentile) {
  const p = Number(percentile);
  if (!Number.isFinite(p)) return PRICING_QUALITY_NEUTRAL_SCORE;
  const raw = roundHalfUp(PRICING_QUALITY_PERCENTILE_SCALE * p);
  if (raw < PRICING_QUALITY_SCORE_MIN) return PRICING_QUALITY_SCORE_MIN;
  if (raw > PRICING_QUALITY_SCORE_MAX) return PRICING_QUALITY_SCORE_MAX;
  return raw;
}

export const PRICING_QUALITY_PRESENTATION_KEYS = Object.freeze([
  "pricing_quality_score",
  "pricing_quality_rules_version",
  "pricing_quality_class",
  "pricing_quality_stat_budget_level",
  "pricing_quality_raw",
  "pricing_quality_percentile",
  "pricing_quality_multiplier_bps",
  "pricing_quality_fallback",
  "acquisition_stardust_paid",
]);

export const PRICING_QUALITY_KEY_PREFIX = "pricing_quality_";
export const ACQUISITION_STARDUST_PAID_KEY = "acquisition_stardust_paid";

export function isProtectedPricingQualityField(key) {
  const name = String(key || "");
  if (name === ACQUISITION_STARDUST_PAID_KEY) return true;
  return name.startsWith(PRICING_QUALITY_KEY_PREFIX);
}

export function omitPricingQualityFromPresentation(source) {
  if (!source || typeof source !== "object") return source;
  const out = { ...source };
  for (const key of Object.keys(out)) {
    if (isProtectedPricingQualityField(key)) delete out[key];
  }
  return out;
}

/**
 * Response-only deep copy that strips internal pricing-quality fields.
 * Never mutate the input — persisted items, shop stock, and server math keep
 * these fields.
 */
export function sanitizePublicResponseBody(value) {
  const copies = new WeakMap();
  function walk(node) {
    if (node == null || typeof node !== "object") return node;
    if (node instanceof Date) return new Date(node.getTime());
    if (copies.has(node)) return copies.get(node);
    if (Array.isArray(node)) {
      const arr = [];
      copies.set(node, arr);
      for (const entry of node) arr.push(walk(entry));
      return arr;
    }
    const out = {};
    copies.set(node, out);
    for (const [key, child] of Object.entries(node)) {
      if (isProtectedPricingQualityField(key)) continue;
      out[key] = walk(child);
    }
    return out;
  }
  return walk(value);
}

/** Recursive paths of protected internal quality fields. Response-audit helper. */
export function collectProtectedPricingQualityFields(value) {
  const found = [];
  const seen = new WeakSet();
  function walk(node, path) {
    if (node == null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const next = path ? `${path}.${key}` : key;
      if (isProtectedPricingQualityField(key)) found.push(next);
      else walk(child, next);
    }
  }
  walk(value, "");
  return found;
}

export function sanitizePublicFunctionResult(result) {
  if (!result || typeof result !== "object") return result;
  if (Object.prototype.hasOwnProperty.call(result, "body")) {
    return {
      ...result,
      body: sanitizePublicResponseBody(result.body),
    };
  }
  return sanitizePublicResponseBody(result);
}

export function withPublicPricingQualitySanitize(handler) {
  if (typeof handler !== "function") return handler;
  return async (user, body) => {
    const result = await handler(user, body);
    if (user?.role === "admin") return result;
    return sanitizePublicFunctionResult(result);
  };
}

function resolveClassName(item, options = {}) {
  const frozen = item?.pricing_quality_class;
  if (frozen && CLASS_PRIMARY_INDEX[frozen] != null) return frozen;
  const fromOpts = options.className || options.characterClass;
  if (fromOpts && CLASS_PRIMARY_INDEX[fromOpts] != null) return fromOpts;
  const fromItem = item?.generating_class || item?.class_name || item?.owner_class;
  if (fromItem && CLASS_PRIMARY_INDEX[fromItem] != null) return fromItem;
  return null;
}

function actualStatTotal(item) {
  const persisted = Number(item?.stat_budget);
  if (Number.isFinite(persisted) && persisted > 0) return persisted;
  const stats = item?.stats || {};
  let sum = 0;
  for (const value of Object.values(stats)) {
    const n = Number(value) || 0;
    if (n > 0) sum += n;
  }
  return sum;
}

function resolveExpectedBudget(item, slot, rarity, statBudgetLevel) {
  const canonical = gearStatPool(statBudgetLevel, slot, rarity);
  const persisted = Number(item?.pre_variance_stat_budget);
  if (Number.isFinite(persisted) && persisted > 0 && persisted === canonical) return persisted;
  return canonical;
}

function hasVersionCompatiblePricingQuality(item) {
  if (!item || typeof item !== "object") return false;
  if (item.pricing_quality_rules_version !== PRICING_QUALITY_RULES_VERSION) return false;
  const score = Number(item.pricing_quality_score);
  if (!Number.isFinite(score)) return false;
  if (score < PRICING_QUALITY_SCORE_MIN || score > PRICING_QUALITY_SCORE_MAX) return false;
  if (item.pricing_quality_class && CLASS_PRIMARY_INDEX[item.pricing_quality_class] != null) {
    return true;
  }
  return item.pricing_quality_fallback === PRICING_QUALITY_FALLBACK_UNRECOVERABLE;
}

function stampPricingQuality(item, fields) {
  item.pricing_quality_score = fields.pricing_quality_score;
  item.pricing_quality_rules_version = PRICING_QUALITY_RULES_VERSION;
  item.pricing_quality_class = fields.pricing_quality_class;
  item.pricing_quality_stat_budget_level = fields.pricing_quality_stat_budget_level;
  item.pricing_quality_raw = fields.pricing_quality_raw;
  item.pricing_quality_percentile = fields.pricing_quality_percentile;
  item.pricing_quality_multiplier_bps = fields.pricing_quality_multiplier_bps;
  if (fields.pricing_quality_fallback) {
    item.pricing_quality_fallback = fields.pricing_quality_fallback;
  } else {
    delete item.pricing_quality_fallback;
  }
  return item;
}

function unrecoverableNeutral(item, partial = {}) {
  const level = resolvePricingQualityStatBudgetLevel(
    partial.statBudgetLevel
    ?? item?.stat_budget_level
    ?? item?.level
    ?? item?.level_requirement,
  );
  return stampPricingQuality(item, {
    pricing_quality_score: PRICING_QUALITY_NEUTRAL_SCORE,
    pricing_quality_class: partial.className || item?.pricing_quality_class || null,
    pricing_quality_stat_budget_level: level,
    pricing_quality_raw: null,
    pricing_quality_percentile: PRICING_QUALITY_NEUTRAL_SCORE / PRICING_QUALITY_PERCENTILE_SCALE,
    pricing_quality_multiplier_bps: qualityPriceMultiplierBps(PRICING_QUALITY_NEUTRAL_SCORE),
    pricing_quality_fallback: PRICING_QUALITY_FALLBACK_UNRECOVERABLE,
  });
}

/**
 * Compute and freeze pricing quality on a Gear item. Does not consume RNG.
 * Does not alter stats, rarity, name, origin, or manufacturer.
 */
export function finalizeGearPricingQuality(item, options = {}) {
  if (!item || typeof item !== "object") return item;
  const slot = canonicalGearSlot(item.type) || item.type;
  if (!canonicalGearSlot(item.type)) return item;
  if (hasVersionCompatiblePricingQuality(item) && !options.forceRescore) {
    return item;
  }
  const className = resolveClassName(item, options);
  const rarity = String(item.rarity || "").toLowerCase();
  const stats = item.stats;
  const recoverable = className
    && stats
    && typeof stats === "object"
    && rarity;
  if (!recoverable) {
    return unrecoverableNeutral(item, { className, statBudgetLevel: item.stat_budget_level });
  }
  const statBudgetLevel = resolvePricingQualityStatBudgetLevel(
    item.stat_budget_level ?? item.level ?? item.level_requirement,
  );
  const expectedBudget = resolveExpectedBudget(item, slot, rarity, statBudgetLevel);
  const scored = scoreGearPricingQuality({
    stats,
    rarity,
    slot,
    statBudgetLevel,
    className,
    actualTotal: actualStatTotal(item),
    expectedBudget,
  });
  const percentile = pricingQualityPercentile(
    scored.rawPricingQuality,
    rarity,
    statBudgetLevel,
  );
  const score = pricingQualityScoreFromPercentile(percentile);
  return stampPricingQuality(item, {
    pricing_quality_score: score,
    pricing_quality_class: className,
    pricing_quality_stat_budget_level: statBudgetLevel,
    pricing_quality_raw: scored.rawPricingQuality,
    pricing_quality_percentile: percentile,
    pricing_quality_multiplier_bps: qualityPriceMultiplierBps(score),
    pricing_quality_fallback: scored.shapeFallback || null,
  });
}

export function ensureGearPricingQuality(item, options = {}) {
  return finalizeGearPricingQuality(item, options);
}

export function economicGearLevel(item, fallbackLevel = 1) {
  const fromItem = Number(item?.level ?? item?.level_requirement);
  if (Number.isFinite(fromItem) && fromItem >= 1) return Math.floor(fromItem);
  return Math.max(1, Math.floor(Number(fallbackLevel) || 1));
}

export function gearQualityListPriceForItem(item, options = {}) {
  const frozen = ensureGearPricingQuality(item, options);
  const slot = canonicalGearSlot(frozen.type) || frozen.type;
  const rarity = String(frozen.rarity || "").toLowerCase();
  const level = economicGearLevel(frozen, options.fallbackLevel);
  return gearQualityListPrice(level, slot, rarity, frozen.pricing_quality_score);
}

export function uncappedGearQualityResaleForItem(item, options = {}) {
  const frozen = ensureGearPricingQuality(item, options);
  const slot = canonicalGearSlot(frozen.type) || frozen.type;
  const rarity = String(frozen.rarity || "").toLowerCase();
  const level = economicGearLevel(frozen, options.fallbackLevel);
  return gearQualityResaleValue(level, slot, rarity, frozen.pricing_quality_score);
}

export function minimumLegalGearPurchaseValue(listPrice, vendorValue) {
  return applyHaggleDiscountToPrice(
    listPrice,
    vendorValue,
    MARKET_HAGGLE_DISCOUNT_MAX_PERCENT,
  );
}

/**
 * Lowest Stardust a pre-amendment Market/Contraband listing could legally
 * have sold for: old 80% listing variance × max 20% Haggle, including the
 * old vendor floor and rounding order. Do not inline 0.64.
 */
export function legacyMarketMinimumLegalPurchase(itemReferenceLevel, slot, rarity) {
  const oldListing = blackMarketPrice(
    itemReferenceLevel,
    slot,
    rarity,
    MARKET_PRICE_VARIANCE_MIN,
  );
  const oldVendor = gearResaleValue(itemReferenceLevel, slot, rarity);
  return minimumLegalGearPurchaseValue(oldListing, oldVendor);
}

function originUsesLegacyListingVariance(origin) {
  const key = String(origin || "").toLowerCase();
  return GEAR_ORIGINS_WITH_LEGACY_LISTING_VARIANCE.includes(key)
    || key === GEAR_ORIGIN_MARKET
    || key === GEAR_ORIGIN_CONTRABAND;
}

function validAcquisitionPaid(item) {
  const n = Number(item?.acquisition_stardust_paid);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Authoritative Gear resale: quality formula, then strict purchase ceilings.
 * Operation order:
 * 1. quality list price
 * 2. max legal 20% haggle of that list (vendor floor uses calculated resale)
 * 3. cap resale to at most one Stardust below that purchase
 * 4. additional ActualStardustPaid / legacy-Market ceilings
 */
export function resolveAuthoritativeGearResaleValue(item, options = {}) {
  const frozen = ensureGearPricingQuality(item, options);
  const slot = canonicalGearSlot(frozen.type) || frozen.type;
  if (!canonicalGearSlot(frozen.type)) return 0;
  const rarity = String(frozen.rarity || "").toLowerCase();
  const level = economicGearLevel(frozen, options.fallbackLevel);
  const score = frozen.pricing_quality_score;
  const listPrice = gearQualityListPrice(level, slot, rarity, score);
  const calculated = gearQualityResaleValue(level, slot, rarity, score);
  const minHagglePurchase = minimumLegalGearPurchaseValue(listPrice, calculated);
  let cap = minHagglePurchase - MARKET_HAGGLE_VENDOR_FLOOR_OFFSET;
  const paid = validAcquisitionPaid(frozen);
  if (paid != null) {
    cap = Math.min(cap, paid - MARKET_HAGGLE_VENDOR_FLOOR_OFFSET);
  } else if (originUsesLegacyListingVariance(frozen.origin)) {
    const legacyMin = legacyMarketMinimumLegalPurchase(level, slot, rarity);
    cap = Math.min(cap, legacyMin - MARKET_HAGGLE_VENDOR_FLOOR_OFFSET);
  }
  return Math.max(0, Math.min(calculated, cap));
}

export function persistAcquisitionStardustPaid(item, stardustPaid) {
  if (!item || typeof item !== "object") return item;
  const n = Math.max(0, Math.floor(Number(stardustPaid) || 0));
  if (n > 0) item.acquisition_stardust_paid = n;
  return item;
}

export function simulatePricingQualityPopulation({
  rarity,
  statBudgetLevel,
  sampleSize = PRICING_QUALITY_CDF_SAMPLE_SIZE,
} = {}) {
  const key = String(rarity || "").toLowerCase();
  const level = resolvePricingQualityStatBudgetLevel(statBudgetLevel);
  const rng = mulberry32(cdfSeed(`${key}:sim`, level));
  const classCount = CDF_CLASS_NAMES.length;
  const byClass = Object.fromEntries(CDF_CLASS_NAMES.map((name) => [name, []]));
  const byArchetype = { Might: [], Reflex: [], Tech: [] };
  const scores = [];
  for (let i = 0; i < sampleSize; i++) {
    const className = CDF_CLASS_NAMES[i % classCount];
    const slot = rollMarketGearSlot(rng);
    const rolled = rollItemStats({
      itemLevel: level,
      statBudgetLevel: level,
      type: slot,
      rarity: key,
      rng,
      className,
    });
    const scored = scoreGearPricingQuality({
      stats: rolled.stats,
      rarity: key,
      slot,
      statBudgetLevel: level,
      className,
      actualTotal: rolled.budget,
      expectedBudget: rolled.preVarianceBudget,
    });
    const percentile = pricingQualityPercentile(scored.rawPricingQuality, key, level);
    const score = pricingQualityScoreFromPercentile(percentile);
    scores.push(score);
    byClass[className].push(score);
    const arch = CLASS_ARCHETYPE[className];
    if (arch && byArchetype[arch]) byArchetype[arch].push(score);
  }
  return { scores, byClass, byArchetype, rarity: key, statBudgetLevel: level };
}
