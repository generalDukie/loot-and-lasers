/**
 * Phase 6 — RawQuality for Nova surcharge (not GES, not 20/80 IQ).
 * Run: npm run test:phase6-quality
 */
import assert from "node:assert/strict";
import {
  BLACK_MARKET_RULES_VERSION,
  generateContrabandOffer,
  generateNormalMarketOffers,
  mulberry32,
} from "../../src/lib/blackMarket.js";
import {
  LEGENDARY_GEAR_STAT_COUNT,
  LEGENDARY_MIN_STAT_SHARE,
  RARITY_MIN_STAT_SHARE,
  rollItemStats,
} from "../../src/lib/itemGeneration.js";
import {
  getIntrinsicQualityCdfCacheSize,
  intrinsicQualityCdfCacheKey,
  resetIntrinsicQualityCdfCache,
  resolveIntrinsicQualityCdfReferenceLevel,
  resolveOfferIntrinsicQuality,
  rollIntrinsicQualityCdfIdentity,
  intrinsicQualityPercentile,
} from "../../src/lib/gearIntrinsicQuality.js";
import {
  EPIC_DESIRABILITY_EXPONENT,
  EPIC_LUCK_ONLY_SHAPE_CEILING,
  EPIC_PRIMARY_ONLY_SHAPE_CEILING,
  EPIC_VITALITY_ONLY_SHAPE_CEILING,
  GEAR_STAT_BUDGET_VARIANCE_MAX,
  GEAR_STAT_BUDGET_VARIANCE_MIN,
  gearStatPool,
  INTRINSIC_QUALITY_CDF_LEVEL_SEED_MIX,
  INTRINSIC_QUALITY_CDF_MIN_REFERENCE_LEVEL,
  INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL,
  INTRINSIC_QUALITY_CDF_SAMPLE_SIZE,
  INTRINSIC_QUALITY_RULES_VERSION,
  LEGENDARY_LEAKAGE_PENALTY_SLOPE,
  LEGENDARY_MANDATORY_STAT_SHARE,
  LEGENDARY_OFF_STAT_CAP_SHARE,
  LEGENDARY_OFF_STAT_CAP_SHARE_BPS,
  LEGENDARY_PARTIAL_B_OFF_SHARE_BPS,
  LEGENDARY_REQUIRED_STAT_COUNT,
  legendaryDesirability,
  legendaryLeakageShare,
  MARKET_GEAR_LEVEL_OFFSET_WEIGHTS,
  MARKET_HAGGLE_SUCCESS_CHANCE_NOVA,
  MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD,
  NOVA_SURCHARGE_BANDS,
  NOVA_SURCHARGE_LEGENDARY_CHANCES,
  NOVA_SURCHARGE_PERCENTILE_TOP2P5,
  NOVA_SURCHARGE_PERCENTILE_TOP25,
  NOVA_SURCHARGE_TABLE,
  novaSurchargeBandIndex,
  novaSurchargeSpec,
  RAW_QUALITY_BUDGET_WEIGHT,
  RAW_QUALITY_DESIRABILITY_WEIGHT,
  RAW_QUALITY_SHAPE_WEIGHT,
  rawQualityScore,
  resolveNovaSurcharge,
  rollMarketGearItemLevel,
  rollMarketGearSlot,
  CLASS_PRIMARY_INDEX,
  scoreGearIntrinsicQuality,
} from "../../src/lib/productionMath/index.js";

let passed = 0;
let failed = 0;
const calibrationRows = [];

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

function quantile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

function median(sorted) {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function scaleShares(shares, total) {
  const stats = {
    strength: 0,
    agility: 0,
    intellect: 0,
    vitality: 0,
    luck: 0,
  };
  for (const [k, v] of Object.entries(shares)) stats[k] = v * total;
  return stats;
}

function scoreShares(shares, {
  rarity = "epic",
  bq = 1,
  slot = "weapon",
  level = 50,
  className = "Vanguard",
} = {}) {
  const ref = gearStatPool(level, slot, rarity);
  const actual = ref * bq;
  return scoreGearIntrinsicQuality({
    stats: scaleShares(shares, actual),
    rarity,
    slot,
    itemLevel: level,
    referenceLevel: level,
    className,
    actualTotal: actual,
  });
}

function assertClose(actual, expected, tol, label) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: actual=${actual} expected=${expected} tol=${tol}`,
  );
}

function recordCalib(label, actual, expected, tol) {
  calibrationRows.push({ label, actual, expected, delta: actual - expected, tol });
  assertClose(actual, expected, tol, label);
  console.log(`    ${label}: actual=${actual.toFixed(4)} expected=${expected} Δ=${(actual - expected).toFixed(4)}`);
}

console.log("\nPhase 6 — intrinsic quality\n");

resetIntrinsicQualityCdfCache();

test("Legendary production minimum 10% and 17.5% off-stat cap constants unchanged", () => {
  assert.equal(RARITY_MIN_STAT_SHARE.legendary, 0.1);
  assert.equal(LEGENDARY_MIN_STAT_SHARE, 0.1);
  assert.equal(LEGENDARY_GEAR_STAT_COUNT, 5);
  assert.equal(LEGENDARY_MANDATORY_STAT_SHARE, RARITY_MIN_STAT_SHARE.legendary);
  assert.equal(LEGENDARY_REQUIRED_STAT_COUNT, LEGENDARY_GEAR_STAT_COUNT);
  assert.equal(LEGENDARY_OFF_STAT_CAP_SHARE, 0.175);
  assert.equal(LEGENDARY_PARTIAL_B_OFF_SHARE_BPS, 1750);
  assert.equal(LEGENDARY_PARTIAL_B_OFF_SHARE_BPS, LEGENDARY_OFF_STAT_CAP_SHARE_BPS);
});

test("RawQuality = 30×BQ + 50×Desirability + 20×Shape; uncapped", () => {
  assert.equal(RAW_QUALITY_BUDGET_WEIGHT, 30);
  assert.equal(RAW_QUALITY_DESIRABILITY_WEIGHT, 50);
  assert.equal(RAW_QUALITY_SHAPE_WEIGHT, 20);
  assert.equal(EPIC_DESIRABILITY_EXPONENT, 2);
  const scored = scoreShares({ strength: 0.4, vitality: 0.4, luck: 0.2 });
  assertClose(scored.budgetQuality, 1, 1e-12, "BQ");
  assertClose(scored.desirability, 1, 1e-12, "D");
  assertClose(scored.shape, 1, 1e-12, "S");
  assertClose(scored.intrinsicQuality, 100, 1e-12, "RQ");
  assertClose(rawQualityScore(1.1, 1, 1), 103, 1e-12, "BQ 1.10");
  assertClose(rawQualityScore(0.9, 1, 1), 97, 1e-12, "BQ 0.90");
  assert.ok(scored.intrinsicQuality === scored.rawQuality);
});

test("calibration: Epic full P/V/L at BQ 1.00", () => {
  const cases = [
    [{ strength: 0.4, vitality: 0.4, luck: 0.2 }, 100, 1e-9],
    [{ strength: 0.45, vitality: 0.35, luck: 0.2 }, 100, 1e-9],
    [{ strength: 0.35, vitality: 0.45, luck: 0.2 }, 99.6, 0.05],
    [{ strength: 0.4, vitality: 0.35, luck: 0.25 }, 99.4, 0.05],
    [{ strength: 0.45, vitality: 0.3, luck: 0.25 }, 97.3, 0.05],
    [{ strength: 0.5, vitality: 0.3, luck: 0.2 }, 96.5, 1e-9],
    [{ strength: 0.35, vitality: 0.35, luck: 0.3 }, 96.5, 1e-9],
    [{ strength: 0.4, vitality: 0.3, luck: 0.3 }, 96.0, 0.05],
    [{ strength: 0.55, vitality: 0.25, luck: 0.2 }, 93.5, 1e-9],
    [{ strength: 0.6, vitality: 0.2, luck: 0.2 }, 92.0, 1e-9],
    [{ strength: 0.25, vitality: 0.25, luck: 0.5 }, 89.0, 0.05],
    [{ strength: 0.2, vitality: 0.2, luck: 0.6 }, 86.0, 0.05],
  ];
  for (const [shares, expected, tol] of cases) {
    recordCalib(`epic PVL ${JSON.stringify(shares)}`, scoreShares(shares).intrinsicQuality, expected, tol);
  }
});

test("calibration: Epic with off-stats at BQ 1.00", () => {
  const cases = [
    [{ strength: 0.5, vitality: 0.3, agility: 0.2 }, 82.0, 1e-9, "P+V+off 50/30/20"],
    [{ strength: 0.45, vitality: 0.35, agility: 0.2 }, 77.0, 1e-9, "P+V+off 45/35/20"],
    [{ strength: 0.55, vitality: 0.25, agility: 0.2 }, 77.0, 1e-9, "P+V+off 55/25/20"],
    [{ vitality: 0.6, agility: 0.2, intellect: 0.2 }, 58.0, 1e-9, "V-only 60/20/20"],
    [{ vitality: 0.35, agility: 0.35, intellect: 0.3 }, 42.0, 0.15, "V-only 35/35/30"],
  ];
  for (const [shares, expected, tol, label] of cases) {
    recordCalib(`epic ${label}`, scoreShares(shares).intrinsicQuality, expected, tol);
  }
});

test("calibration: Legendary at BQ 1.00", () => {
  const cases = [
    [{ strength: 0.3, vitality: 0.3, luck: 0.2, agility: 0.1, intellect: 0.1 }, 100.0, 1e-9],
    [{ strength: 0.3125, vitality: 0.3125, luck: 0.175, agility: 0.1, intellect: 0.1 }, 100.0, 1e-9],
    [{ strength: 0.35, vitality: 0.35, luck: 0.1, agility: 0.1, intellect: 0.1 }, 99.4, 0.05],
    [{ strength: 0.4, vitality: 0.3, luck: 0.1, agility: 0.1, intellect: 0.1 }, 97.4, 0.05],
    [{ strength: 0.3, vitality: 0.3, luck: 0.15, agility: 0.15, intellect: 0.1 }, 85.0, 1e-9],
    [{ strength: 0.25, vitality: 0.25, luck: 0.2, agility: 0.15, intellect: 0.15 }, 70.0, 1e-9],
    [{ strength: 0.225, vitality: 0.225, luck: 0.2, agility: 0.175, intellect: 0.175 }, 55.0, 0.05],
  ];
  for (const [shares, expected, tol] of cases) {
    recordCalib(`legendary ${JSON.stringify(shares)}`, scoreShares(shares, { rarity: "legendary" }).intrinsicQuality, expected, tol);
  }
});

test("Epic 40/40/20 at BQ 0.90 is RawQuality 97.0", () => {
  const low = scoreShares({ strength: 0.4, vitality: 0.4, luck: 0.2 }, { bq: 0.9 });
  recordCalib("epic 40/40/20 BQ 0.90", low.intrinsicQuality, 97.0, 1e-9);
  const thirty = scoreShares({ strength: 0.35, vitality: 0.35, luck: 0.3 });
  assertClose(Math.abs(low.intrinsicQuality - thirty.intrinsicQuality), 0.5, 0.05, "0.90 40/40/20 vs 35/35/30");
});

test("BudgetQuality ±10% variance; BQ is not clamped to 1", () => {
  const slot = "helmet";
  const rarity = "epic";
  const ref = gearStatPool(50, slot, rarity);
  const low = scoreGearIntrinsicQuality({
    stats: { strength: ref },
    rarity,
    slot,
    itemLevel: 50,
    referenceLevel: 50,
    className: "Vanguard",
    actualTotal: Math.round(ref * GEAR_STAT_BUDGET_VARIANCE_MIN),
  });
  const high = scoreGearIntrinsicQuality({
    stats: { strength: ref },
    rarity,
    slot,
    itemLevel: 50,
    referenceLevel: 50,
    className: "Vanguard",
    actualTotal: Math.round(ref * GEAR_STAT_BUDGET_VARIANCE_MAX),
  });
  assert.ok(high.budgetQuality > low.budgetQuality);
  assert.ok(high.budgetQuality > 1, `excellent on-level BQ ${high.budgetQuality}`);
  assert.ok(low.budgetQuality < 1);
});

test("L/L-1/L-2/L-3 BudgetQuality uses actual/neutralRef with no extra level penalty", () => {
  const slot = "weapon";
  const rarity = "epic";
  const L = 50;
  const bqs = [];
  for (const itemLevel of [50, 49, 48, 47]) {
    const actual = gearStatPool(itemLevel, slot, rarity);
    const scored = scoreGearIntrinsicQuality({
      stats: { strength: actual },
      rarity,
      slot,
      itemLevel,
      referenceLevel: L,
      className: "Vanguard",
      actualTotal: actual,
    });
    const expect = actual / gearStatPool(L, slot, rarity);
    assertClose(scored.budgetQuality, expect, 1e-12, `L${itemLevel} BQ`);
    assert.equal(scored.referenceLevel, L);
    bqs.push(scored.budgetQuality);
  }
  assert.ok(bqs[0] > bqs[1] && bqs[1] > bqs[2] && bqs[2] > bqs[3], `BQ ladder ${bqs.join(" > ")}`);
});

test("Epic stat-set shape branches", () => {
  const pvl = scoreShares({ strength: 0.4, vitality: 0.4, luck: 0.2 });
  assertClose(pvl.shape, 1, 1e-12, "P+V+L shape");
  const pvOff = scoreShares({ strength: 0.5, vitality: 0.3, agility: 0.2 });
  assertClose(pvOff.shape, 1, 1e-12, "P+V+off 50/30");
  const plOff = scoreShares({ strength: 0.6, luck: 0.2, agility: 0.2 });
  assertClose(plOff.shape, 0.85, 1e-12, "P+L+off 60/20");
  const vlOff = scoreShares({ vitality: 0.6, luck: 0.2, agility: 0.2 });
  assertClose(vlOff.shape, 0.75, 1e-12, "V+L+off 60/20");
  const pOnly = scoreShares({ strength: 0.6, agility: 0.2, intellect: 0.2 });
  assertClose(pOnly.shape, EPIC_PRIMARY_ONLY_SHAPE_CEILING, 1e-12, "P-only ceiling");
  const vOnly = scoreShares({ vitality: 0.6, agility: 0.2, intellect: 0.2 });
  assertClose(vOnly.shape, EPIC_VITALITY_ONLY_SHAPE_CEILING, 1e-12, "V-only ceiling");
  const lOnly = scoreShares({ luck: 0.6, agility: 0.2, intellect: 0.2 });
  assertClose(lOnly.shape, EPIC_LUCK_ONLY_SHAPE_CEILING, 1e-12, "Luck-only ceiling");
});

test("Legendary mandatory 10% off-stat is forgiven; leakage 0–15%", () => {
  const leakages = [0, 0.025, 0.05, 0.075, 0.1, 0.125, 0.15];
  const expectedD = leakages.map((x) => 1 - LEGENDARY_LEAKAGE_PENALTY_SLOPE * x);
  for (let i = 0; i < leakages.length; i++) {
    const leak = leakages[i];
    const perOff = 0.1 + leak / 2;
    const remain = 1 - 2 * perOff;
    const shares = {
      strength: remain / 3,
      vitality: remain / 3,
      luck: remain / 3,
      agility: perOff,
      intellect: perOff,
    };
    const stats = scaleShares(shares, 100);
    assertClose(legendaryLeakageShare(stats, "Vanguard", 100), leak, 1e-12, `leak ${leak}`);
    assertClose(legendaryDesirability(stats, "Vanguard", 100), expectedD[i], 1e-12, `D leak ${leak}`);
  }
  const floorOnly = scaleShares({
    strength: 0.3, vitality: 0.3, luck: 0.2, agility: 0.1, intellect: 0.1,
  }, 100);
  assertClose(legendaryLeakageShare(floorOnly, "Vanguard", 100), 0, 1e-12, "floor leakage");
  assertClose(legendaryDesirability(floorOnly, "Vanguard", 100), 1, 1e-12, "floor D");
});

test("offer snapshots quality at generation level; later player level does not change it", () => {
  const shop = generateNormalMarketOffers({
    playerLevel: 50,
    className: "Vanguard",
    rng: mulberry32(9),
    generationId: "q-snap",
  });
  const gear = shop.offers.find((o) => o._offerKind === "gear");
  assert.ok(gear);
  assert.equal(gear.quality_reference_level, 50);
  assert.equal(gear.rules_version, BLACK_MARKET_RULES_VERSION);
  assert.equal(BLACK_MARKET_RULES_VERSION, "phase6-intrinsic-quality-v5");
  assert.equal(INTRINSIC_QUALITY_RULES_VERSION, "phase6-raw-quality-v1");
  const before = {
    iq: gear.intrinsic_quality,
    p: gear.intrinsic_quality_percentile,
    band: gear.intrinsic_quality_band,
    nova: gear.nova_cost,
  };
  const later = resolveOfferIntrinsicQuality({
    item: { ...gear, level: 51 },
    className: "Vanguard",
    referenceLevel: 51,
  });
  assert.equal(later.referenceLevel, 50);
  assert.equal(later.percentile, before.p);
  assert.equal(later.band, before.band);
  assertClose(later.intrinsicQuality, before.iq, 1e-12, "snapshot IQ");
  const contra = generateContrabandOffer({
    playerLevel: 50,
    className: "Vanguard",
    rng: mulberry32(3),
    generationId: "q-c",
  });
  assert.equal(contra.quality_reference_level, 50);
  assert.equal(contra.level_requirement, 50);
});

test("CDF population uses Market 35/35/20/10 IL vs snapshotted generation level", () => {
  const L = INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL;
  assert.deepEqual([...MARKET_GEAR_LEVEL_OFFSET_WEIGHTS], [0.35, 0.35, 0.2, 0.1]);
  const rng = mulberry32(18);
  const offsetCounts = [0, 0, 0, 0];
  const n = 20_000;
  for (let i = 0; i < n; i++) {
    const id = rollIntrinsicQualityCdfIdentity(rng, L);
    assert.equal(id.referenceLevel, L);
    const offset = L - id.itemLevel;
    assert.ok(offset >= 0 && offset < offsetCounts.length);
    offsetCounts[offset] += 1;
  }
  const shares = offsetCounts.map((c) => c / n);
  const expected = [...MARKET_GEAR_LEVEL_OFFSET_WEIGHTS];
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Math.abs(shares[i] - expected[i]) < 0.02, `offset ${i} ${shares[i]} vs ${expected[i]}`);
  }
  console.log(`    CDF IL offset shares=${shares.map((s) => s.toFixed(3)).join("/")}`);

  const onLevel = [];
  const lowLevel = [];
  const rngP = mulberry32(77);
  for (let i = 0; i < 400; i++) {
    const hi = rollItemStats({ itemLevel: L, type: "weapon", rarity: "epic", className: "Vanguard", rng: rngP });
    const lo = rollItemStats({ itemLevel: L - 3, type: "weapon", rarity: "epic", className: "Vanguard", rng: rngP });
    onLevel.push(resolveOfferIntrinsicQuality({
      item: {
        type: "weapon", rarity: "epic", level_requirement: L, stats: hi.stats,
        stat_budget: hi.targetBudget, quality_reference_level: L,
      },
      className: "Vanguard",
    }).percentile);
    lowLevel.push(resolveOfferIntrinsicQuality({
      item: {
        type: "weapon", rarity: "epic", level_requirement: L - 3, stats: lo.stats,
        stat_budget: lo.targetBudget, quality_reference_level: L,
      },
      className: "Vanguard",
    }).percentile);
  }
  assert.ok(mean(onLevel) > mean(lowLevel), `on-level ${mean(onLevel)} vs L-3 ${mean(lowLevel)}`);
  console.log(`    on-level mean p=${mean(onLevel).toFixed(3)} L-3 mean p=${mean(lowLevel).toFixed(3)}`);

  const twin = {
    type: "weapon",
    rarity: "epic",
    level_requirement: L,
    stats: { strength: 40, vitality: 40, luck: 20 },
    stat_budget: 100,
    quality_reference_level: L,
  };
  const marketP = resolveOfferIntrinsicQuality({ item: twin, className: "Vanguard" }).percentile;
  const contraP = resolveOfferIntrinsicQuality({
    item: { ...twin, contraband: true, origin: "contraband" },
    className: "Vanguard",
  }).percentile;
  assert.equal(marketP, contraP);
});

test("new 75/82.5/90/95/97.5 bands and within-rarity CDF populations", () => {
  assert.equal(NOVA_SURCHARGE_BANDS[0].maxExclusive, NOVA_SURCHARGE_PERCENTILE_TOP25);
  assert.equal(NOVA_SURCHARGE_BANDS[5].minInclusive, NOVA_SURCHARGE_PERCENTILE_TOP2P5);
  assert.equal(novaSurchargeBandIndex(0.749), 0);
  assert.equal(novaSurchargeBandIndex(0.75), 1);
  assert.equal(novaSurchargeBandIndex(0.825), 2);
  assert.equal(novaSurchargeBandIndex(0.9), 3);
  assert.equal(novaSurchargeBandIndex(0.95), 4);
  assert.equal(novaSurchargeBandIndex(0.975), 5);

  const n = 8_000;
  const expected = [0.75, 0.075, 0.075, 0.05, 0.025, 0.025];
  const L = INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL;
  for (const rarity of ["epic", "legendary"]) {
    const rng = mulberry32(rarity === "epic" ? 7 : 11);
    const iqs = [];
    const bandCounts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const itemLevel = rollMarketGearItemLevel(L, rng);
      const rolled = rollItemStats({
        itemLevel, type: "armor", rarity, className: "Technomancer", rng,
      });
      const resolved = resolveOfferIntrinsicQuality({
        item: {
          type: "armor", rarity, level_requirement: itemLevel,
          stats: rolled.stats, stat_budget: rolled.targetBudget,
          quality_reference_level: L,
        },
        className: "Technomancer",
      });
      iqs.push(resolved.intrinsicQuality);
      bandCounts[resolved.band] += 1;
    }
    const shares = bandCounts.map((c) => c / n);
    for (let i = 0; i < expected.length; i++) {
      assert.ok(
        Math.abs(shares[i] - expected[i]) < 0.04,
        `${rarity} band ${NOVA_SURCHARGE_BANDS[i].id} ${shares[i]} vs ${expected[i]}`,
      );
    }
    const chances = NOVA_SURCHARGE_TABLE[rarity].probabilities;
    let incidence = 0;
    for (let i = 0; i < shares.length; i++) incidence += shares[i] * chances[i];
    const expectInc = expected.reduce((sum, share, i) => sum + share * chances[i], 0);
    console.log(
      `    ${rarity} mean=${mean(iqs).toFixed(4)} median=${median(iqs.slice().sort((a, b) => a - b)).toFixed(4)}`
      + ` band shares=${shares.map((s) => s.toFixed(3)).join("/")}`
      + ` surcharge≈${incidence.toFixed(4)} (design ${expectInc.toFixed(4)})`,
    );
    assert.ok(Math.abs(incidence - expectInc) < 0.05, `${rarity} incidence ${incidence} vs ${expectInc}`);
  }
});

test("level-specific CDF: cache key, lazy reuse, no class, Contraband share, early clamp", () => {
  assert.equal(BLACK_MARKET_RULES_VERSION, "phase6-intrinsic-quality-v5");
  assert.equal(INTRINSIC_QUALITY_CDF_SAMPLE_SIZE, 4096);
  assert.ok(INTRINSIC_QUALITY_CDF_LEVEL_SEED_MIX);
  assert.equal(INTRINSIC_QUALITY_CDF_MIN_REFERENCE_LEVEL, 1);
  assert.equal(resolveIntrinsicQualityCdfReferenceLevel(null), INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL);
  assert.equal(resolveIntrinsicQualityCdfReferenceLevel(537), 537);
  assert.equal(intrinsicQualityCdfCacheKey("Epic", 537), "epic:537");
  assert.notEqual(intrinsicQualityCdfCacheKey("epic", 50), intrinsicQualityCdfCacheKey("epic", 500));

  resetIntrinsicQualityCdfCache();
  assert.equal(getIntrinsicQualityCdfCacheSize(), 0);
  const firstA = intrinsicQualityPercentile(90, "epic", 537);
  assert.equal(getIntrinsicQualityCdfCacheSize(), 1);
  const firstB = intrinsicQualityPercentile(90, "epic", 537);
  assert.equal(firstA, firstB);
  intrinsicQualityPercentile(90, "legendary", 537);
  assert.equal(getIntrinsicQualityCdfCacheSize(), 2);
  intrinsicQualityPercentile(90, "epic", 100);
  assert.equal(getIntrinsicQualityCdfCacheSize(), 3);

  const probeIqs = [70, 85, 92, 97, 100, 103];
  let maxAbs = 0;
  for (const iq of probeIqs) {
    maxAbs = Math.max(
      maxAbs,
      Math.abs(intrinsicQualityPercentile(iq, "epic", 50) - intrinsicQualityPercentile(iq, "epic", 2000)),
    );
  }
  assert.ok(maxAbs > 0, `L50 vs L2000 CDF should differ, maxAbs=${maxAbs}`);

  const twin500 = {
    type: "weapon",
    rarity: "epic",
    level_requirement: 500,
    stats: { strength: 40, vitality: 40, luck: 20 },
    stat_budget: 100,
    quality_reference_level: 500,
  };
  const market500 = resolveOfferIntrinsicQuality({ item: twin500, className: "Vanguard" });
  const contraTwin = resolveOfferIntrinsicQuality({
    item: { ...twin500, contraband: true, origin: "contraband" },
    className: "Vanguard",
  });
  assert.equal(market500.percentile, contraTwin.percentile);
  assert.equal(market500.band, contraTwin.band);
  const sizeBeforeClass = getIntrinsicQualityCdfCacheSize();
  resolveOfferIntrinsicQuality({ item: twin500, className: "Technomancer" });
  assert.equal(getIntrinsicQualityCdfCacheSize(), sizeBeforeClass);

  const shop500 = generateNormalMarketOffers({
    playerLevel: 500,
    className: "Vanguard",
    rng: mulberry32(501),
    generationId: "lvl-500",
  });
  const gear500 = shop500.offers.find((o) => o._offerKind === "gear");
  assert.ok(gear500);
  assert.equal(gear500.quality_reference_level, 500);
  assert.equal(gear500.rules_version, BLACK_MARKET_RULES_VERSION);
  const before500 = {
    iq: gear500.intrinsic_quality,
    p: gear500.intrinsic_quality_percentile,
    band: gear500.intrinsic_quality_band,
  };
  const rescoredWrongLevel = resolveOfferIntrinsicQuality({
    item: { ...gear500, level: 501, level_requirement: gear500.level_requirement },
    className: "Vanguard",
    referenceLevel: 501,
  });
  assert.equal(rescoredWrongLevel.referenceLevel, 500);
  assert.equal(rescoredWrongLevel.percentile, before500.p);
  assertClose(rescoredWrongLevel.intrinsicQuality, before500.iq, 1e-12, "L500 snapshot");

  const contra500 = generateContrabandOffer({
    playerLevel: 500,
    className: "Vanguard",
    rng: mulberry32(77),
    generationId: "c-500",
  });
  assert.equal(contra500.quality_reference_level, 500);
  if (contra500.rarity === "epic" || contra500.rarity === "legendary") {
    const sameIqMarket = resolveOfferIntrinsicQuality({
      item: {
        type: contra500.type,
        rarity: contra500.rarity,
        level_requirement: contra500.level_requirement,
        stats: contra500.stats,
        stat_budget: contra500.stat_budget,
        quality_reference_level: 500,
      },
      className: "Vanguard",
    });
    assert.equal(sameIqMarket.percentile, contra500.intrinsic_quality_percentile);
  }

  const rngClamp = mulberry32(3);
  for (let i = 0; i < 200; i++) {
    const id = rollIntrinsicQualityCdfIdentity(rngClamp, 1);
    assert.equal(id.itemLevel, 1);
  }
});

test("level-specific CDF band populations across production range", () => {
  const levels = [1, 10, 50, 100, 500, 1000, 1500, 2000];
  const expected = [0.75, 0.075, 0.075, 0.05, 0.025, 0.025];
  const n = 2_000;
  const shareTolerance = 0.06;
  const classNames = Object.keys(CLASS_PRIMARY_INDEX);
  resetIntrinsicQualityCdfCache();
  for (const L of levels) {
    for (const rarity of ["epic", "legendary"]) {
      const rng = mulberry32(L * 17 + (rarity === "epic" ? 3 : 5));
      const bandCounts = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        const className = classNames[i % classNames.length];
        const itemLevel = rollMarketGearItemLevel(L, rng);
        const slot = rollMarketGearSlot(rng);
        const rolled = rollItemStats({
          itemLevel, type: slot, rarity, className, rng,
        });
        const resolved = resolveOfferIntrinsicQuality({
          item: {
            type: slot, rarity, level_requirement: itemLevel,
            stats: rolled.stats, stat_budget: rolled.targetBudget,
            quality_reference_level: L,
          },
          className,
        });
        bandCounts[resolved.band] += 1;
      }
      const shares = bandCounts.map((c) => c / n);
      for (let i = 0; i < expected.length; i++) {
        assert.ok(
          Math.abs(shares[i] - expected[i]) < shareTolerance,
          `${rarity} L${L} band ${NOVA_SURCHARGE_BANDS[i].id} ${shares[i]} vs ${expected[i]}`,
        );
      }
      console.log(`    L${L} ${rarity} band shares=${shares.map((s) => s.toFixed(3)).join("/")}`);
    }
  }
  assert.equal(getIntrinsicQualityCdfCacheSize(), levels.length * 2);

  resetIntrinsicQualityCdfCache();
  const perfLevels = [1, 10, 50, 100, 500, 1000, 1500, 2000];
  for (const L of perfLevels) {
    const t0 = performance.now();
    intrinsicQualityPercentile(90, "epic", L);
    const t1 = performance.now();
    intrinsicQualityPercentile(91, "epic", L);
    const t2 = performance.now();
    const buildMs = t1 - t0;
    const hitMs = t2 - t1;
    console.log(`    epic L${L} CDF build ${buildMs.toFixed(1)}ms cache-hit ${hitMs.toFixed(2)}ms`);
    assert.ok(hitMs < buildMs || hitMs < 5, `cache hit should be cheap at L${L}`);
  }
  assert.equal(getIntrinsicQualityCdfCacheSize(), perfLevels.length);
});

test("CDF generation does not consume live offer RNG", () => {
  resetIntrinsicQualityCdfCache();
  const shopA = generateNormalMarketOffers({
    playerLevel: 40,
    className: "Vanguard",
    rng: mulberry32(99),
    generationId: "rng-a",
  });
  resetIntrinsicQualityCdfCache();
  intrinsicQualityPercentile(90, "epic", 40);
  intrinsicQualityPercentile(90, "legendary", 40);
  const shopB = generateNormalMarketOffers({
    playerLevel: 40,
    className: "Vanguard",
    rng: mulberry32(99),
    generationId: "rng-a",
  });
  assert.equal(shopA.offers.length, shopB.offers.length);
  for (let i = 0; i < shopA.offers.length; i++) {
    assert.equal(shopA.offers[i].generation_id, shopB.offers[i].generation_id);
    assert.equal(shopA.offers[i].rarity, shopB.offers[i].rarity);
    assert.equal(shopA.offers[i].cost, shopB.offers[i].cost);
    assert.equal(shopA.offers[i].nova_cost, shopB.offers[i].nova_cost);
    assert.equal(shopA.offers[i].intrinsic_quality, shopB.offers[i].intrinsic_quality);
  }
});

test("Nova surcharge chances/pools and Haggling constants", () => {
  assert.deepEqual(NOVA_SURCHARGE_TABLE.epic.probabilities, [0.3, 0.5, 0.6, 0.75, 0.85, 0.95]);
  assert.deepEqual(NOVA_SURCHARGE_TABLE.legendary.probabilities, NOVA_SURCHARGE_LEGENDARY_CHANCES);
  assert.equal(MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD, 0.4);
  assert.equal(MARKET_HAGGLE_SUCCESS_CHANCE_NOVA, 0.3);
  for (const probe of [0.825, 0.9, 0.95, 0.975]) {
    const spec = novaSurchargeSpec("legendary", probe);
    assert.equal(spec.probability, 1);
    assert.ok(resolveNovaSurcharge("legendary", probe, 0.999999, 0) > 0);
  }
  assert.equal(resolveNovaSurcharge("common", 0.99, 0, 0), 0);
});

test("representative generated examples", () => {
  const rng = mulberry32(424242);
  const rows = [];
  for (const rarity of ["epic", "legendary"]) {
    for (let i = 0; i < 80; i++) {
      const rolled = rollItemStats({
        itemLevel: i % 4 === 0 ? 47 : 50,
        type: "weapon",
        rarity,
        className: "Vanguard",
        rng,
        statBudgetVariance: i % 5 === 0
          ? GEAR_STAT_BUDGET_VARIANCE_MAX
          : i % 5 === 1
            ? GEAR_STAT_BUDGET_VARIANCE_MIN
            : null,
      });
      const itemLevel = i % 4 === 0 ? 47 : 50;
      const resolved = resolveOfferIntrinsicQuality({
        item: {
          type: "weapon",
          rarity,
          level_requirement: itemLevel,
          stats: rolled.stats,
          stat_budget: rolled.targetBudget,
          quality_reference_level: 50,
        },
        className: "Vanguard",
      });
      rows.push({
        rarity,
        itemLevel,
        variance: rolled.statBudgetVariance,
        budgetQuality: resolved.budgetQuality,
        desirability: resolved.desirability,
        shape: resolved.shape,
        iq: resolved.intrinsicQuality,
        percentile: resolved.percentile,
        band: resolved.bandId,
        leakage: resolved.legendaryLeakageShare,
        stats: rolled.stats,
      });
    }
  }
  const epic = rows.filter((r) => r.rarity === "epic");
  const legendary = rows.filter((r) => r.rarity === "legendary");
  const strongEpic = epic.slice().sort((a, b) => b.iq - a.iq)[0];
  const strongLeg = legendary.slice().sort((a, b) => b.iq - a.iq)[0];
  const leakyLeg = legendary.slice().sort((a, b) => b.leakage - a.leakage)[0];
  for (const [label, ex] of [
    ["strong Epic", strongEpic],
    ["strong Legendary", strongLeg],
    ["leakiest Legendary", leakyLeg],
  ]) {
    assert.ok(ex, label);
    console.log(
      `    ${label}: ${ex.rarity} IL=${ex.itemLevel} BQ=${ex.budgetQuality.toFixed(4)}`
      + ` D=${ex.desirability.toFixed(4)} S=${ex.shape.toFixed(4)} RQ=${ex.iq.toFixed(4)}`
      + ` p=${ex.percentile.toFixed(4)} band=${ex.band} stats=${JSON.stringify(ex.stats)}`,
    );
  }
});

if (failed) {
  console.error(`\nPhase 6 quality: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nPhase 6 quality: ${passed} passed`);
