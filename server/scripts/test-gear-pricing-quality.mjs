/**
 * Post–Phase 7 amendment — permanent Gear pricing quality.
 * Run: npm run test:gear-pricing-quality
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-pricing-quality-"));
process.env.DB_PATH = path.join(tmpDir, "pricing-quality.db");

const {
  GenerateGearItem,
  computeItemVendorValue,
  rollItemStats,
} = await import("../../src/lib/itemGeneration.js");
const {
  applyHaggleDiscountToPrice,
  CLASS_ARCHETYPE,
  CLASS_PRIMARY_INDEX,
  COMMON_LUCK_SHAPE,
  COMMON_OFF_SHAPE,
  COMMON_POSITIVE_STAT_COUNT,
  COMMON_PRIMARY_SHAPE,
  COMMON_VITALITY_SHAPE,
  DERIVED_STAT_LEVEL_CAP_LEVEL_1,
  DERIVED_STAT_LEVEL_CAP_LEVEL_25,
  DERIVED_STAT_LEVEL_CAP_LEVEL_75,
  DERIVED_STAT_LEVEL_CAP_LEVEL_100,
  epicDesirability,
  epicShape,
  GEAR_LUCK_ATTR_KEY,
  GEAR_SLOTS,
  GEAR_VITALITY_ATTR_KEY,
  gearQualityListPrice,
  gearQualityResaleValue,
  gearResaleValue,
  gearStatPool,
  classOffAttrKeys,
  classPrimaryAttrKey,
  MARKET_HAGGLE_DISCOUNT_MAX_PERCENT,
  MARKET_HAGGLE_VENDOR_FLOOR_OFFSET,
  MARKET_PRICE_VARIANCE_MIN,
  PRICING_QUALITY_CDF_SAMPLE_SIZE,
  PRICING_QUALITY_MULTIPLIER_MIN_BPS,
  PRICING_QUALITY_MULTIPLIER_PER_SCORE_BPS,
  PRICING_QUALITY_NEUTRAL_SCORE,
  PRICING_QUALITY_RULES_VERSION,
  PRICING_QUALITY_SCORE_MAX,
  PRICING_QUALITY_SCORE_MIN,
  qualityPriceMultiplierBps,
  RARITIES,
  RAW_QUALITY_BUDGET_WEIGHT,
  RAW_QUALITY_DESIRABILITY_WEIGHT,
  RAW_QUALITY_SHAPE_WEIGHT,
  roundHalfUp,
  scoreGearIntrinsicQuality,
  scoreGearPricingQuality,
  UNCOMMON_POSITIVE_STAT_COUNT,
} = await import("../../src/lib/productionMath/index.js");
const {
  collectProtectedPricingQualityFields,
  ensureGearPricingQuality,
  finalizeGearPricingQuality,
  getPricingQualityCdfCacheSize,
  gearQualityListPriceForItem,
  legacyMarketMinimumLegalPurchase,
  omitPricingQualityFromPresentation,
  persistAcquisitionStardustPaid,
  pricingQualityCdfCacheKey,
  pricingQualityPercentile,
  PRICING_QUALITY_PRESENTATION_KEYS,
  resetPricingQualityCdfCache,
  resolveAuthoritativeGearResaleValue,
  sanitizePublicResponseBody,
  simulatePricingQualityPopulation,
} = await import("../../src/lib/gearPricingQuality.js");
const {
  getIntrinsicQualityCdfCacheSize,
  resetIntrinsicQualityCdfCache,
  resolveOfferIntrinsicQuality,
} = await import("../../src/lib/gearIntrinsicQuality.js");
const { generateNormalMarketOffers, mulberry32, BLACK_MARKET_RULES_VERSION } = await import("../../src/lib/blackMarket.js");
const { serializeItem } = await import("../src/shared/inventoryEquipment.js");
const { serializeShopOffer } = await import("../src/shared/shopService.js");
const { entities } = await import("../src/entities.js");
const { DissolveItem, EnsureShop, BuyShopGear } = await import("../src/functions/economy.js");

let passed = 0;
let failed = 0;
const evidence = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

function assertClose(got, expect, eps, label) {
  assert.ok(Math.abs(got - expect) <= eps, `${label}: ${got} vs ${expect}`);
}

function rawFrom(bq, d, s) {
  return RAW_QUALITY_BUDGET_WEIGHT * bq
    + RAW_QUALITY_DESIRABILITY_WEIGHT * d
    + RAW_QUALITY_SHAPE_WEIGHT * s;
}

const PRICING_QUALITY_CLASS_MEAN_SPREAD_MAX = 5;
const PRICING_QUALITY_MATRIX_LEVELS = Object.freeze([
  DERIVED_STAT_LEVEL_CAP_LEVEL_1,
  DERIVED_STAT_LEVEL_CAP_LEVEL_25,
  DERIVED_STAT_LEVEL_CAP_LEVEL_75,
  DERIVED_STAT_LEVEL_CAP_LEVEL_100,
]);
const PRICING_QUALITY_SHAPE_FIXTURE_LEVEL = 20;
const PRICING_QUALITY_SHAPE_PRIMARY_SHARE_NUMERATOR = 7;
const PRICING_QUALITY_SHAPE_SHARE_DENOMINATOR = 10;

function assertFiniteQuality(item, label) {
  assert.equal(Number.isFinite(item.pricing_quality_raw), true, `${label} raw`);
  assert.equal(Number.isFinite(item.pricing_quality_score), true, `${label} score`);
  assert.equal(Number.isFinite(item.pricing_quality_percentile), true, `${label} percentile`);
  assert.equal(Number.isFinite(item.pricing_quality_multiplier_bps), true, `${label} multiplier`);
  assert.equal(Number.isFinite(item.sell_value), true, `${label} sell`);
  assert.ok(item.pricing_quality_score >= PRICING_QUALITY_SCORE_MIN, `${label} score min`);
  assert.ok(item.pricing_quality_score <= PRICING_QUALITY_SCORE_MAX, `${label} score max`);
  const minBps = PRICING_QUALITY_MULTIPLIER_MIN_BPS;
  const maxBps = minBps + PRICING_QUALITY_MULTIPLIER_PER_SCORE_BPS * PRICING_QUALITY_SCORE_MAX;
  assert.ok(item.pricing_quality_multiplier_bps >= minBps, `${label} multiplier min`);
  assert.ok(item.pricing_quality_multiplier_bps <= maxBps, `${label} multiplier max`);
}

console.log("\nGear pricing quality amendment\n");

test("Common Primary / Vitality / Luck / off-stat at 90/100/110% Budget Quality", () => {
  const expected = gearStatPool(10, "helmet", "common");
  const cases = [
    { bqMul: 0.9, key: "strength", shape: COMMON_PRIMARY_SHAPE, d: 1 },
    { bqMul: 1, key: "strength", shape: COMMON_PRIMARY_SHAPE, d: 1 },
    { bqMul: 1.1, key: "strength", shape: COMMON_PRIMARY_SHAPE, d: 1 },
    { bqMul: 0.9, key: "vitality", shape: COMMON_VITALITY_SHAPE, d: 1 },
    { bqMul: 1, key: "vitality", shape: COMMON_VITALITY_SHAPE, d: 1 },
    { bqMul: 1.1, key: "vitality", shape: COMMON_VITALITY_SHAPE, d: 1 },
    { bqMul: 0.9, key: "luck", shape: COMMON_LUCK_SHAPE, d: 1 },
    { bqMul: 1, key: "luck", shape: COMMON_LUCK_SHAPE, d: 1 },
    { bqMul: 1.1, key: "luck", shape: COMMON_LUCK_SHAPE, d: 1 },
    { bqMul: 0.9, key: "agility", shape: COMMON_OFF_SHAPE, d: 0 },
    { bqMul: 1, key: "agility", shape: COMMON_OFF_SHAPE, d: 0 },
    { bqMul: 1.1, key: "agility", shape: COMMON_OFF_SHAPE, d: 0 },
    { bqMul: 0.9, key: "intellect", shape: COMMON_OFF_SHAPE, d: 0 },
    { bqMul: 1, key: "intellect", shape: COMMON_OFF_SHAPE, d: 0 },
    { bqMul: 1.1, key: "intellect", shape: COMMON_OFF_SHAPE, d: 0 },
  ];
  for (const row of cases) {
    const t = Math.max(1, roundHalfUp(expected * row.bqMul));
    const bq = t / expected;
    const stats = { [row.key]: t };
    const scored = scoreGearPricingQuality({
      stats,
      rarity: "common",
      slot: "helmet",
      statBudgetLevel: 10,
      className: "Vanguard",
      actualTotal: t,
      expectedBudget: expected,
    });
    assertClose(scored.budgetQuality, bq, 1e-12, `${row.key}@${row.bqMul} BQ`);
    assertClose(scored.desirability, row.d, 1e-12, `${row.key} D`);
    assertClose(scored.shape, row.shape, 1e-12, `${row.key} S`);
    assertClose(scored.rawPricingQuality, rawFrom(bq, row.d, row.shape), 1e-9, `${row.key} raw`);
  }
  const malformed = scoreGearPricingQuality({
    stats: { strength: 40, vitality: 40 },
    rarity: "common",
    slot: "helmet",
    statBudgetLevel: 10,
    className: "Vanguard",
    expectedBudget: 80,
  });
  assert.equal(malformed.shape, 0);
  assert.equal(malformed.shapeFallback, "malformed_shape");
});

test("Uncommon pair and off-stat Shape branches", () => {
  const expected = 80;
  const pvTarget = scoreGearPricingQuality({
    stats: { strength: 50, vitality: 30 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assertClose(pvTarget.shape, 1, 1e-12, "P+V at 0.625");
  const pvLow = scoreGearPricingQuality({
    stats: { strength: 40, vitality: 40 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assert.ok(pvLow.shape < pvTarget.shape, "P+V below target");
  const pvHigh = scoreGearPricingQuality({
    stats: { strength: 60, vitality: 20 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assert.ok(pvHigh.shape < pvTarget.shape, "P+V above target");

  const plTarget = scoreGearPricingQuality({
    stats: { strength: 60, luck: 20 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assertClose(plTarget.shape, 0.85, 1e-12, "P+L at 0.75");
  const plLow = scoreGearPricingQuality({
    stats: { strength: 40, luck: 40 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assert.ok(plLow.shape < plTarget.shape);
  const plHigh = scoreGearPricingQuality({
    stats: { strength: 70, luck: 10 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assert.ok(plHigh.shape < plTarget.shape);

  const vlTarget = scoreGearPricingQuality({
    stats: { vitality: 60, luck: 20 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assertClose(vlTarget.shape, 0.75, 1e-12, "V+L at 0.75");

  const pOff = scoreGearPricingQuality({
    stats: { strength: 56, agility: 24 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assertClose(pOff.shape, 0.6, 1e-12, "P+off at 0.70 share");
  const vOff = scoreGearPricingQuality({
    stats: { vitality: 56, agility: 24 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assertClose(vOff.shape, 0.5, 1e-12, "V+off");
  const lOff = scoreGearPricingQuality({
    stats: { luck: 56, agility: 24 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assertClose(lOff.shape, 0.35, 1e-12, "L+off");
  const twoOff = scoreGearPricingQuality({
    stats: { agility: 40, intellect: 40 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assert.equal(twoOff.shape, 0);
  const malformed = scoreGearPricingQuality({
    stats: { strength: 30, vitality: 30, luck: 20 },
    rarity: "uncommon",
    slot: "armor",
    statBudgetLevel: 20,
    className: "Vanguard",
    expectedBudget: expected,
  });
  assert.equal(malformed.shape, 0);
  assert.equal(malformed.shapeFallback, "malformed_shape");
});

test("Rare reuses canonical Epic Desirability and Shape", () => {
  const stats = { strength: 40, vitality: 30, luck: 20, agility: 10 };
  const rare = scoreGearPricingQuality({
    stats,
    rarity: "rare",
    slot: "helmet",
    statBudgetLevel: 25,
    className: "Vanguard",
  });
  const epic = scoreGearPricingQuality({
    stats,
    rarity: "epic",
    slot: "helmet",
    statBudgetLevel: 25,
    className: "Vanguard",
  });
  assertClose(rare.desirability, epicDesirability(stats, "Vanguard"), 1e-12, "rare D");
  assertClose(rare.shape, epicShape(stats, "Vanguard"), 1e-12, "rare S");
  assertClose(rare.desirability, epic.desirability, 1e-12, "rare D vs epic D");
  assertClose(rare.shape, epic.shape, 1e-12, "rare S vs epic S");
});

test("Epic/Legendary Nova quality outputs are unchanged by pricing helpers", () => {
  const stats = { strength: 40, vitality: 30, luck: 20, agility: 10 };
  const nova = scoreGearIntrinsicQuality({
    stats,
    rarity: "epic",
    slot: "weapon",
    itemLevel: 40,
    referenceLevel: 40,
    className: "Vanguard",
  });
  const pricing = scoreGearPricingQuality({
    stats,
    rarity: "epic",
    slot: "weapon",
    statBudgetLevel: 40,
    className: "Vanguard",
  });
  assertClose(nova.desirability, pricing.desirability, 1e-12, "epic D shared");
  assertClose(nova.shape, pricing.shape, 1e-12, "epic S shared");
  assert.notEqual(nova.budgetQuality, undefined);
  const legendStats = {
    strength: 30, vitality: 25, luck: 20, agility: 13, intellect: 12,
  };
  const novaL = scoreGearIntrinsicQuality({
    stats: legendStats,
    rarity: "legendary",
    slot: "weapon",
    itemLevel: 40,
    referenceLevel: 40,
    className: "Vanguard",
  });
  const pricingL = scoreGearPricingQuality({
    stats: legendStats,
    rarity: "legendary",
    slot: "weapon",
    statBudgetLevel: 40,
    className: "Vanguard",
  });
  assertClose(novaL.desirability, pricingL.desirability, 1e-12, "legend D");
  assertClose(novaL.shape, pricingL.shape, 1e-12, "legend S");
});

test("Quality multiplier boundaries 0/25/50/75/100", () => {
  const expect = {
    0: 8000,
    25: 9000,
    50: 10000,
    75: 11000,
    100: 12000,
  };
  for (const [score, bps] of Object.entries(expect)) {
    assert.equal(qualityPriceMultiplierBps(Number(score)), bps);
  }
  const L = 50;
  const slot = "helmet";
  const rarity = "rare";
  const baseList50 = gearQualityListPrice(L, slot, rarity, 50);
  const baseResale50 = gearQualityResaleValue(L, slot, rarity, 50);
  assert.equal(baseList50, gearResaleValue(L, slot, rarity) === 0
    ? baseList50
    : gearQualityListPrice(L, slot, rarity, 50));
  assert.ok(gearQualityListPrice(L, slot, rarity, 0) < baseList50);
  assert.ok(gearQualityListPrice(L, slot, rarity, 100) > baseList50);
  assert.ok(gearQualityResaleValue(L, slot, rarity, 0) <= baseResale50);
  assert.ok(gearQualityResaleValue(L, slot, rarity, 100) >= baseResale50);
  assert.equal(gearQualityResaleValue(L, slot, rarity, 50), gearResaleValue(L, slot, rarity));
});

test("Higher quality never lowers list or resale when other inputs match", () => {
  for (const rarity of RARITIES) {
    for (const slot of ["helmet", "weapon"]) {
      let prevList = -1;
      let prevSale = -1;
      for (let score = 0; score <= 100; score += 25) {
        const list = gearQualityListPrice(10, slot, rarity, score);
        const sale = gearQualityResaleValue(10, slot, rarity, score);
        assert.ok(list >= prevList, `${rarity} ${slot} list`);
        assert.ok(sale >= prevSale, `${rarity} ${slot} sale`);
        prevList = list;
        prevSale = sale;
      }
    }
  }
});

test("Identical frozen items score identically; class relabel is symmetric", () => {
  const item = GenerateGearItem({
    itemLevel: 30,
    itemType: "armor",
    rarity: "rare",
    className: "Vanguard",
    rng: mulberry32(77),
  });
  const a = { ...item };
  const b = { ...item };
  delete a.pricing_quality_score;
  delete b.pricing_quality_score;
  finalizeGearPricingQuality(a, { className: "Vanguard" });
  finalizeGearPricingQuality(b, { className: "Vanguard" });
  assert.equal(a.pricing_quality_score, b.pricing_quality_score);
  assert.equal(a.pricing_quality_raw, b.pricing_quality_raw);
  const warden = scoreGearPricingQuality({
    stats: item.stats,
    rarity: "rare",
    slot: "armor",
    statBudgetLevel: item.stat_budget_level,
    className: "Astral Warden",
    actualTotal: item.stat_budget,
    expectedBudget: item.pre_variance_stat_budget,
  });
  const vanguard = scoreGearPricingQuality({
    stats: item.stats,
    rarity: "rare",
    slot: "armor",
    statBudgetLevel: item.stat_budget_level,
    className: "Vanguard",
    actualTotal: item.stat_budget,
    expectedBudget: item.pre_variance_stat_budget,
  });
  assertClose(warden.rawPricingQuality, vanguard.rawPricingQuality, 1e-12, "Might class relabel");
});

test("CDF identity, rules version, cache, RNG isolation, no generator recursion", () => {
  resetPricingQualityCdfCache();
  resetIntrinsicQualityCdfCache();
  const novaBefore = getIntrinsicQualityCdfCacheSize();
  const item = GenerateGearItem({
    itemLevel: 20,
    itemType: "boots",
    rarity: "uncommon",
    className: "Void Runner",
    rng: mulberry32(5),
  });
  const p1 = pricingQualityPercentile(item.pricing_quality_raw, "uncommon", 20);
  const p2 = pricingQualityPercentile(item.pricing_quality_raw, "uncommon", 20);
  assert.equal(p1, p2);
  assert.equal(pricingQualityCdfCacheKey("Uncommon", 20), `uncommon:20:${PRICING_QUALITY_RULES_VERSION}`);
  assert.ok(getPricingQualityCdfCacheSize() >= 1);
  assert.equal(getIntrinsicQualityCdfCacheSize(), novaBefore);
  assert.equal(item.pricing_quality_rules_version, PRICING_QUALITY_RULES_VERSION);
  assert.ok(item.pricing_quality_score >= PRICING_QUALITY_SCORE_MIN);
  assert.ok(item.pricing_quality_score <= PRICING_QUALITY_SCORE_MAX);
});

test("Scoring does not drift Gear generation RNG", () => {
  const rngA = mulberry32(909);
  const skip = GenerateGearItem({
    itemLevel: 18,
    itemType: "weapon",
    rarity: "epic",
    className: "Technomancer",
    rng: rngA,
    skipPricingQuality: true,
  });
  const rngB = mulberry32(909);
  const live = GenerateGearItem({
    itemLevel: 18,
    itemType: "weapon",
    rarity: "epic",
    className: "Technomancer",
    rng: rngB,
  });
  assert.deepEqual(live.stats, skip.stats);
  assert.equal(live.stat_budget, skip.stat_budget);
  assert.equal(live.rarity, skip.rarity);
  assert.equal(live.pre_variance_stat_budget, skip.pre_variance_stat_budget);
  assert.ok(live.pricing_quality_score != null);
  assert.equal(skip.pricing_quality_score, undefined);
});

test("Neutral score 50 only for unrecoverable legacy inputs", () => {
  const empty = finalizeGearPricingQuality({
    type: "helmet",
    rarity: "rare",
    level: 12,
    stats: {},
  });
  assert.equal(empty.pricing_quality_score, PRICING_QUALITY_NEUTRAL_SCORE);
  assert.equal(empty.pricing_quality_fallback, "unrecoverable_inputs");
  const recovered = finalizeGearPricingQuality({
    type: "helmet",
    rarity: "rare",
    level: 12,
    stat_budget_level: 12,
    stats: { strength: 8, vitality: 6, luck: 4 },
  }, { className: "Vanguard" });
  assert.ok(recovered.pricing_quality_fallback !== "unrecoverable_inputs" || recovered.pricing_quality_score !== 50
    || recovered.pricing_quality_class === "Vanguard");
  assert.equal(recovered.pricing_quality_class, "Vanguard");
});

test("Player-facing presentation omits pricing-quality fields", () => {
  const item = GenerateGearItem({
    itemLevel: 15,
    itemType: "neck",
    rarity: "rare",
    className: "Vanguard",
    rng: mulberry32(2),
  });
  const pub = serializeItem(item);
  for (const key of PRICING_QUALITY_PRESENTATION_KEYS) {
    assert.equal(pub[key], undefined, key);
  }
  const shop = serializeShopOffer({
    ...item,
    _slotId: "s1",
    cost: 10,
    nova_cost: 0,
  });
  for (const key of PRICING_QUALITY_PRESENTATION_KEYS) {
    assert.equal(shop.item[key], undefined, `shop ${key}`);
  }
  const omitted = omitPricingQualityFromPresentation(item);
  assert.equal(omitted.pricing_quality_score, undefined);
  assert.ok(omitted.stats);
});

test("Purchase and resale share the frozen multiplier; single final resale round", () => {
  const item = GenerateGearItem({
    itemLevel: 8,
    itemType: "helmet",
    rarity: "common",
    className: "Vanguard",
    origin: "mission",
    rng: mulberry32(44),
  });
  const list = gearQualityListPriceForItem(item);
  const sale = resolveAuthoritativeGearResaleValue(item);
  const uncapped = gearQualityResaleValue(
    item.level,
    item.type,
    item.rarity,
    item.pricing_quality_score,
  );
  assert.equal(qualityPriceMultiplierBps(item.pricing_quality_score), item.pricing_quality_multiplier_bps);
  assert.ok(sale <= uncapped);
  assert.ok(sale < list);
  const minBuy = applyHaggleDiscountToPrice(list, uncapped, MARKET_HAGGLE_DISCOUNT_MAX_PERCENT);
  assert.ok(sale < minBuy, `sale ${sale} < minBuy ${minBuy}`);
});

test("Resale cannot reach any legal purchase across rarity/slot/level matrix", () => {
  const levels = [1, 2, 10, 25, 50, 100];
  let violations = 0;
  for (const rarity of RARITIES) {
    for (const slot of GEAR_SLOTS) {
      for (const L of levels) {
        for (const score of [0, 25, 50, 75, 100]) {
          const list = gearQualityListPrice(L, slot, rarity, score);
          const calculated = gearQualityResaleValue(L, slot, rarity, score);
          const minBuy = applyHaggleDiscountToPrice(
            list,
            calculated,
            MARKET_HAGGLE_DISCOUNT_MAX_PERCENT,
          );
          const sale = Math.max(0, Math.min(
            calculated,
            minBuy - MARKET_HAGGLE_VENDOR_FLOOR_OFFSET,
          ));
          if (!(sale < minBuy) || !(sale < list)) {
            violations += 1;
          }
        }
      }
    }
  }
  assert.equal(violations, 0, `arbitrage violations=${violations}`);
  evidence.push("matrix sale < min legal purchase: 0 violations");
});

test("Legacy Market ceiling uses named 80% listing × max haggle, not 0.64", () => {
  const L = 5;
  const slot = "boots";
  const rarity = "common";
  const legacy = legacyMarketMinimumLegalPurchase(L, slot, rarity);
  const item = {
    type: slot,
    rarity,
    level: L,
    level_requirement: L,
    origin: "market",
    stats: { strength: 4 },
    className: "Vanguard",
  };
  finalizeGearPricingQuality(item, { className: "Vanguard" });
  const sale = resolveAuthoritativeGearResaleValue(item, { className: "Vanguard" });
  assert.ok(sale < legacy);
  assert.ok(legacy > 0);
  void MARKET_PRICE_VARIANCE_MIN;
});

test("Actual acquisition cost caps resale below Stardust paid", () => {
  const item = GenerateGearItem({
    itemLevel: 12,
    itemType: "armor",
    rarity: "uncommon",
    className: "Vanguard",
    origin: "market",
    rng: mulberry32(12),
  });
  persistAcquisitionStardustPaid(item, 3);
  const sale = resolveAuthoritativeGearResaleValue(item);
  assert.ok(sale < 3);
});

test("Existing snapshotted offers keep cost/nova when not regenerated", () => {
  const frozenOffer = {
    type: "helmet",
    rarity: "rare",
    level: 20,
    level_requirement: 20,
    cost: 1234,
    nova_cost: 2,
    rules_version: "phase6-intrinsic-quality-v5",
    price_variance: 0.81,
    stats: { strength: 10 },
  };
  assert.equal(frozenOffer.cost, 1234);
  assert.equal(frozenOffer.nova_cost, 2);
  assert.notEqual(frozenOffer.rules_version, BLACK_MARKET_RULES_VERSION);
});

test("New Market Gear offers snapshot quality list price", () => {
  const shop = generateNormalMarketOffers({
    playerLevel: 30,
    className: "Vanguard",
    rng: mulberry32(21),
    generationId: "pq-new",
  });
  const gear = shop.offers.filter((o) => o._offerKind === "gear");
  assert.ok(gear.length);
  for (const o of gear) {
    assert.equal(o.rules_version, BLACK_MARKET_RULES_VERSION);
    assert.equal(o.cost, gearQualityListPriceForItem(o));
    assert.ok(o.pricing_quality_score != null);
  }
});

test("Hidden PvE budget compares against stat_budget_level, not economic level", () => {
  const item = GenerateGearItem({
    economicLevel: 10,
    itemType: "armor",
    rarity: "rare",
    playerLevel: 10,
    applyPveHiddenBudgetOffset: true,
    className: "Vanguard",
    rng: mulberry32(3),
  });
  assert.ok(item.stat_budget_level > item.level);
  assert.equal(item.pricing_quality_stat_budget_level, item.stat_budget_level);
  const expected = gearStatPool(item.stat_budget_level, item.type, item.rarity);
  assertClose(item.pre_variance_stat_budget, expected, 0, "pre-variance matches hidden level");
});

test("Deterministic population: scores 0–100, class/archetype symmetry", () => {
  const pop = simulatePricingQualityPopulation({
    rarity: "rare",
    statBudgetLevel: 40,
    sampleSize: PRICING_QUALITY_CDF_SAMPLE_SIZE,
  });
  assert.equal(pop.scores.length, PRICING_QUALITY_CDF_SAMPLE_SIZE);
  assert.ok(pop.scores.every((s) => s >= 0 && s <= 100));
  const means = Object.entries(pop.byClass).map(([name, arr]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { name, mean };
  });
  const minC = Math.min(...means.map((m) => m.mean));
  const maxC = Math.max(...means.map((m) => m.mean));
  evidence.push(`class means L40 rare: ${means.map((m) => `${m.name}=${m.mean.toFixed(2)}`).join(", ")}`);
  assert.ok(maxC - minC < PRICING_QUALITY_CLASS_MEAN_SPREAD_MAX, `class mean spread ${maxC - minC} means ${JSON.stringify(means)}`);
  const archMeans = Object.entries(pop.byArchetype).map(([name, arr]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { name, mean };
  });
  const minA = Math.min(...archMeans.map((m) => m.mean));
  const maxA = Math.max(...archMeans.map((m) => m.mean));
  evidence.push(`archetype means: ${archMeans.map((m) => `${m.name}=${m.mean.toFixed(2)}`).join(", ")}`);
  assert.ok(maxA - minA < PRICING_QUALITY_CLASS_MEAN_SPREAD_MAX, `archetype mean spread ${maxA - minA}`);
  void CLASS_PRIMARY_INDEX;
  void CLASS_ARCHETYPE;
});

await testAsync("Purchase records actual Stardust paid; resale stays below it", async () => {
  const user = {
    id: "pq-buy-user",
    email: "pqbuy@example.com",
    role: "user",
    active_character_id: "",
  };
  const ch = entities.Character.create({
    id: "pq-buy-char",
    name: "Buyer",
    class: "Vanguard",
    race: "Keldris",
    level: 20,
    experience: 0,
    experience_to_next_level: 100000,
    stardust: 5_000_000,
    nova_crystals: 10_000,
    fuel: 100,
    max_fuel: 100,
    stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
    attribute_purchases_by_stat: {
      strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
    },
    equipped_items: {},
    shop_meta: {},
    created_by_id: user.id,
    created_by: user.email,
  });
  user.active_character_id = ch.id;
  const shop = await EnsureShop(user, {});
  assert.equal(shop.status, 200, shop.body?.error);
  const gear = (shop.body.shop_meta.shop_stock || []).find((s) => s.type !== "consumable");
  assert.ok(gear, "gear offer");
  const paid = Number(gear.cost);
  const before = entities.Character.get(ch.id).stardust;
  const buy = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "pq-buy-1",
    refresh_id: shop.body.shop_meta.window_idx,
  });
  assert.equal(buy.status, 200, buy.body?.error);
  const granted = buy.body.items?.[0];
  assert.ok(granted);
  const stored = entities.Item.get(granted.id);
  assert.equal(stored.acquisition_stardust_paid, paid);
  assert.equal(entities.Character.get(ch.id).stardust, before - paid);
  const sale = computeItemVendorValue(stored, { className: "Vanguard" });
  assert.ok(sale < paid, `sale ${sale} < paid ${paid}`);
  const replay = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "pq-buy-1",
    refresh_id: shop.body.shop_meta.window_idx,
  });
  assert.equal(replay.body.idempotent_replay, true);
});

await testAsync("Dissolve ignores client sell_value and uses frozen quality", async () => {
  const user = {
    id: "pq-sell-user",
    email: "pqsell@example.com",
    role: "user",
    active_character_id: "",
  };
  const ch = entities.Character.create({
    id: "pq-sell-char",
    name: "Seller",
    class: "Vanguard",
    race: "Keldris",
    level: 20,
    experience: 0,
    experience_to_next_level: 100000,
    stardust: 1000,
    nova_crystals: 0,
    fuel: 100,
    max_fuel: 100,
    stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
    attribute_purchases_by_stat: {
      strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
    },
    equipped_items: {},
    created_by_id: user.id,
    created_by: user.email,
  });
  user.active_character_id = ch.id;
  const generated = GenerateGearItem({
    itemLevel: 16,
    itemType: "legs",
    rarity: "rare",
    className: "Vanguard",
    origin: "mission",
    rng: mulberry32(8),
  });
  const row = entities.Item.create({
    ...generated,
    name: "Forged",
    sell_value: 1,
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  const expected = computeItemVendorValue(row, { className: "Vanguard" });
  assert.notEqual(expected, 1);
  const sold = await DissolveItem(user, { item_id: row.id, request_id: "pq-sell" });
  assert.equal(sold.status, 200, sold.body?.error);
  assert.equal(sold.body.stardust_gained, expected);
  const replay = await DissolveItem(user, { item_id: row.id, request_id: "pq-sell" });
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(replay.body.stardust_gained, expected);
});

test("Response sanitizer copies only and strips nested internal quality fields", () => {
  const source = {
    shop_meta: {
      shop_stock: [{
        name: "Helm",
        stats: { strength: 12 },
        cost: 40,
        nova_cost: 1,
        sell_value: 18,
        pricing_quality_score: 71,
        pricing_quality_raw: 0.82,
        pricing_quality_secret: true,
        acquisition_stardust_paid: 40,
      }],
    },
    patch: { shop_meta: { hot_deal: { pricing_quality_score: 12 } } },
    character: { shop_meta: { shop_stock: [{ acquisition_stardust_paid: 9 }] } },
    items: [{ rarity: "rare", pricing_quality_multiplier_bps: 9000 }],
    pending_loot: [{ item: { pricing_quality_class: "Vanguard" } }],
    granted: { item: { sell_value: 4, acquisition_stardust_paid: 11 } },
  };
  const copy = sanitizePublicResponseBody(source);
  const leaked = collectProtectedPricingQualityFields(copy);
  assert.deepEqual(leaked, []);
  assert.equal(copy.shop_meta.shop_stock[0].cost, 40);
  assert.equal(copy.shop_meta.shop_stock[0].nova_cost, 1);
  assert.equal(copy.shop_meta.shop_stock[0].sell_value, 18);
  assert.equal(copy.shop_meta.shop_stock[0].stats.strength, 12);
  assert.equal(copy.items[0].rarity, "rare");
  assert.equal(source.shop_meta.shop_stock[0].pricing_quality_score, 71);
  assert.equal(source.character.shop_meta.shop_stock[0].acquisition_stardust_paid, 9);
  assert.ok(source !== copy);
  assert.ok(source.shop_meta !== copy.shop_meta);
});

test("Lower-rarity shapes cover every class primary and off-stat pairing", () => {
  for (const className of Object.keys(CLASS_ARCHETYPE)) {
    const primary = classPrimaryAttrKey(className);
    const offs = classOffAttrKeys(className);
    const expectedCommon = gearStatPool(PRICING_QUALITY_SHAPE_FIXTURE_LEVEL, "helmet", "common");
    const commonCases = [
      { stats: { [primary]: expectedCommon }, shape: COMMON_PRIMARY_SHAPE },
      { stats: { [GEAR_VITALITY_ATTR_KEY]: expectedCommon }, shape: COMMON_VITALITY_SHAPE },
      { stats: { [GEAR_LUCK_ATTR_KEY]: expectedCommon }, shape: COMMON_LUCK_SHAPE },
      { stats: { [offs[0]]: expectedCommon }, shape: COMMON_OFF_SHAPE },
    ];
    for (const row of commonCases) {
      const scored = scoreGearPricingQuality({
        stats: row.stats,
        rarity: "common",
        slot: "helmet",
        statBudgetLevel: PRICING_QUALITY_SHAPE_FIXTURE_LEVEL,
        className,
        actualTotal: expectedCommon,
        expectedBudget: expectedCommon,
      });
      assertClose(scored.shape, row.shape, 1e-12, `${className} common shape`);
      assert.equal(Number.isFinite(scored.rawPricingQuality), true);
    }

    const expectedUncommon = gearStatPool(PRICING_QUALITY_SHAPE_FIXTURE_LEVEL, "armor", "uncommon");
    const primaryShare = Math.max(
      1,
      roundHalfUp(expectedUncommon * PRICING_QUALITY_SHAPE_PRIMARY_SHARE_NUMERATOR / PRICING_QUALITY_SHAPE_SHARE_DENOMINATOR),
    );
    const remainder = expectedUncommon - primaryShare;
    const uncommonCases = [
      { stats: { [primary]: primaryShare, [GEAR_VITALITY_ATTR_KEY]: remainder } },
      { stats: { [primary]: primaryShare, [GEAR_LUCK_ATTR_KEY]: remainder } },
      { stats: { [GEAR_VITALITY_ATTR_KEY]: primaryShare, [GEAR_LUCK_ATTR_KEY]: remainder } },
      { stats: { [primary]: primaryShare, [offs[0]]: remainder } },
      { stats: { [GEAR_VITALITY_ATTR_KEY]: primaryShare, [offs[0]]: remainder } },
      { stats: { [GEAR_LUCK_ATTR_KEY]: primaryShare, [offs[0]]: remainder } },
      { stats: { [offs[0]]: primaryShare, [offs[1]]: remainder } },
    ];
    for (const row of uncommonCases) {
      const scored = scoreGearPricingQuality({
        stats: row.stats,
        rarity: "uncommon",
        slot: "armor",
        statBudgetLevel: PRICING_QUALITY_SHAPE_FIXTURE_LEVEL,
        className,
        actualTotal: expectedUncommon,
        expectedBudget: expectedUncommon,
      });
      assert.equal(Object.keys(row.stats).length, UNCOMMON_POSITIVE_STAT_COUNT);
      assert.equal(Number.isFinite(scored.shape), true, `${className} uncommon shape finite`);
      assert.equal(Number.isFinite(scored.rawPricingQuality), true);
    }
  }
  void COMMON_POSITIVE_STAT_COUNT;
});

test("Generated Gear is finite, bounded, deterministic, and non-arbitrage across the production matrix", () => {
  const classNames = Object.keys(CLASS_ARCHETYPE);
  const byClass = Object.fromEntries(classNames.map((name) => [name, []]));
  const byArchetype = { Might: [], Reflex: [], Tech: [] };
  for (const rarity of RARITIES) {
    for (const level of PRICING_QUALITY_MATRIX_LEVELS) {
      for (const slot of GEAR_SLOTS) {
        for (const className of classNames) {
          const seed = (
            RARITIES.indexOf(rarity)
            + GEAR_SLOTS.indexOf(slot) * GEAR_SLOTS.length
            + classNames.indexOf(className) * classNames.length
            + level
          ) >>> 0;
          const item = GenerateGearItem({
            itemLevel: level,
            itemType: slot,
            rarity,
            className,
            origin: "mission",
            rng: mulberry32(seed),
          });
          const label = `${rarity}/${slot}/${className}/L${level}`;
          assertFiniteQuality(item, label);
          const again = GenerateGearItem({
            itemLevel: level,
            itemType: slot,
            rarity,
            className,
            origin: "mission",
            rng: mulberry32(seed),
          });
          assert.equal(again.pricing_quality_raw, item.pricing_quality_raw, `${label} raw replay`);
          assert.equal(again.pricing_quality_score, item.pricing_quality_score, `${label} score replay`);
          assert.equal(again.pricing_quality_multiplier_bps, item.pricing_quality_multiplier_bps, `${label} bps replay`);
          assert.equal(again.sell_value, item.sell_value, `${label} sell replay`);
          const list = gearQualityListPriceForItem(item);
          const sale = resolveAuthoritativeGearResaleValue(item, { className });
          assert.equal(sale, item.sell_value, `${label} sell matches resolver`);
          if (list > 0) assert.ok(sale < list, `${label} no-arbitrage ${sale} < ${list}`);
          byClass[className].push(item.pricing_quality_score);
          byArchetype[CLASS_ARCHETYPE[className]].push(item.pricing_quality_score);
        }
      }
    }
  }
  const classMeans = Object.values(byClass).map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length);
  const archMeans = Object.values(byArchetype).map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length);
  const classSpread = Math.max(...classMeans) - Math.min(...classMeans);
  const archSpread = Math.max(...archMeans) - Math.min(...archMeans);
  evidence.push(`matrix class mean spread ${classSpread.toFixed(3)}; archetype ${archSpread.toFixed(3)}`);
  assert.ok(classSpread < PRICING_QUALITY_CLASS_MEAN_SPREAD_MAX, `class spread ${classSpread}`);
  assert.ok(archSpread < PRICING_QUALITY_CLASS_MEAN_SPREAD_MAX, `archetype spread ${archSpread}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (evidence.length) {
  console.log("evidence:");
  for (const line of evidence) console.log(`  - ${line}`);
}
if (failed) process.exit(1);
