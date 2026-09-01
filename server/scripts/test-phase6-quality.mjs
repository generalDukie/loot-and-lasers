/**
 * Phase 6 — Intrinsic Quality for Nova surcharge (not GES, not variance-as-percentile).
 * Run: npm run test:phase6-quality
 */
import assert from "node:assert/strict";
import {
  applyOfferHaggle,
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
  discretionaryOffStatAvoidance,
  EPIC_DISTRIBUTION_DESIRABLE_SHARE_WEIGHT,
  EPIC_DISTRIBUTION_LUCK_SUITABILITY_WEIGHT,
  EPIC_DISTRIBUTION_PV_BALANCE_WEIGHT,
  GEAR_STAT_BUDGET_VARIANCE_MAX,
  GEAR_STAT_BUDGET_VARIANCE_MIN,
  gearStatPool,
  INTRINSIC_QUALITY_BUDGET_WEIGHT,
  INTRINSIC_QUALITY_CDF_LEVEL_SEED_MIX,
  INTRINSIC_QUALITY_CDF_MIN_REFERENCE_LEVEL,
  INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL,
  INTRINSIC_QUALITY_CDF_SAMPLE_SIZE,
  INTRINSIC_QUALITY_DISTRIBUTION_WEIGHT,
  LEGENDARY_DISTRIBUTION_LUCK_SUITABILITY_WEIGHT,
  LEGENDARY_DISTRIBUTION_OFF_STAT_AVOIDANCE_WEIGHT,
  LEGENDARY_DISTRIBUTION_PV_BALANCE_WEIGHT,
  LEGENDARY_MANDATORY_STAT_SHARE,
  LEGENDARY_REQUIRED_STAT_COUNT,
  LUCK_SUITABILITY_FULL_CREDIT_SHARE,
  LUCK_SUITABILITY_ZERO_CREDIT_SHARE,
  luckSuitability,
  MARKET_GEAR_LEVEL_OFFSET_WEIGHTS,
  MARKET_HAGGLE_SUCCESS_CHANCE_NOVA,
  MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD,
  NOVA_SURCHARGE_BANDS,
  NOVA_SURCHARGE_TABLE,
  novaSurchargeBandIndex,
  novaSurchargeSpec,
  primaryVitalityBalance,
  resolveNovaSurcharge,
  rollMarketGearItemLevel,
  scoreGearIntrinsicQuality,
} from "../../src/lib/productionMath/index.js";

let passed = 0;
let failed = 0;

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

function luckOnlyStats(luckShare, total = 1000) {
  const luck = Math.round(luckShare * total);
  return {
    strength: Math.max(0, total - luck),
    agility: 0,
    intellect: 0,
    vitality: 0,
    luck,
  };
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

console.log("\nPhase 6 — intrinsic quality\n");

resetIntrinsicQualityCdfCache();

test("Legendary production minimum is still 10% per stat", () => {
  assert.equal(RARITY_MIN_STAT_SHARE.legendary, 0.1);
  assert.equal(LEGENDARY_MIN_STAT_SHARE, 0.1);
  assert.equal(LEGENDARY_GEAR_STAT_COUNT, 5);
  assert.equal(LEGENDARY_MANDATORY_STAT_SHARE, RARITY_MIN_STAT_SHARE.legendary);
  assert.equal(LEGENDARY_REQUIRED_STAT_COUNT, LEGENDARY_GEAR_STAT_COUNT);
});

test("IQ = 20% BudgetQuality + 80% DistributionQuality; not GES weights", () => {
  assert.equal(INTRINSIC_QUALITY_BUDGET_WEIGHT, 0.2);
  assert.equal(INTRINSIC_QUALITY_DISTRIBUTION_WEIGHT, 0.8);
  assert.equal(EPIC_DISTRIBUTION_DESIRABLE_SHARE_WEIGHT, 0.6);
  assert.equal(EPIC_DISTRIBUTION_PV_BALANCE_WEIGHT, 0.2);
  assert.equal(EPIC_DISTRIBUTION_LUCK_SUITABILITY_WEIGHT, 0.2);
  assert.equal(LEGENDARY_DISTRIBUTION_OFF_STAT_AVOIDANCE_WEIGHT, 0.6);
  assert.equal(LEGENDARY_DISTRIBUTION_PV_BALANCE_WEIGHT, 0.25);
  assert.equal(LEGENDARY_DISTRIBUTION_LUCK_SUITABILITY_WEIGHT, 0.15);
  const ref = gearStatPool(50, "helmet", "epic");
  const stats = scaleShares({ strength: 0.35, vitality: 0.35, luck: 0.3 }, ref);
  const scored = scoreGearIntrinsicQuality({
    stats,
    rarity: "epic",
    slot: "helmet",
    itemLevel: 50,
    referenceLevel: 50,
    className: "Vanguard",
    actualTotal: ref,
  });
  const expect =
    INTRINSIC_QUALITY_BUDGET_WEIGHT * scored.budgetQuality
    + INTRINSIC_QUALITY_DISTRIBUTION_WEIGHT * scored.distributionQuality;
  assert.ok(Math.abs(scored.intrinsicQuality - expect) < 1e-12);
  assert.ok(Math.abs(scored.budgetQuality - 1) < 1e-12);
  assert.equal(scored.desirableStatShare, 1);
  assert.equal(scored.primaryVitalityBalance, 1);
  assert.equal(scored.luckSuitability, 1);
});

test("P/V balance is 1 - |P-V|/(P+V)", () => {
  assert.equal(primaryVitalityBalance({ strength: 50, vitality: 50 }, "Vanguard"), 1);
  assert.equal(primaryVitalityBalance({ strength: 40, vitality: 40 }, "Vanguard"), 1);
  assert.equal(primaryVitalityBalance({ strength: 60, vitality: 20 }, "Vanguard"), 0.5);
  assert.equal(primaryVitalityBalance({ strength: 100, vitality: 0 }, "Vanguard"), 0);
  assert.equal(primaryVitalityBalance({ strength: 0, vitality: 100 }, "Vanguard"), 0);
  assert.equal(primaryVitalityBalance({ strength: 0, vitality: 0 }, "Vanguard"), 0);
});

test("Luck suitability piecewise: 0 / full through 30% / linear 30–60 / zero at 60%+", () => {
  assert.equal(LUCK_SUITABILITY_FULL_CREDIT_SHARE, 0.3);
  assert.equal(LUCK_SUITABILITY_ZERO_CREDIT_SHARE, 0.6);
  assert.equal(luckSuitability(luckOnlyStats(0)), 0);
  assert.equal(luckSuitability(luckOnlyStats(0.01)), 1);
  assert.equal(luckSuitability(luckOnlyStats(0.1)), 1);
  assert.equal(luckSuitability(luckOnlyStats(0.2)), 1);
  assert.equal(luckSuitability(luckOnlyStats(0.3)), 1);
  const justAbove = luckSuitability(luckOnlyStats(0.301));
  assert.ok(justAbove < 1 && justAbove > 0.99, `just above 30% = ${justAbove}`);
  assert.ok(Math.abs(luckSuitability(luckOnlyStats(0.45)) - 0.5) < 1e-12);
  const justBelow = luckSuitability(luckOnlyStats(0.599));
  assert.ok(justBelow > 0 && justBelow < 0.01, `just below 60% = ${justBelow}`);
  assert.equal(luckSuitability(luckOnlyStats(0.6)), 0);
  assert.equal(luckSuitability(luckOnlyStats(0.8)), 0);
  const third = luckSuitability(luckOnlyStats(1 / 3));
  assert.ok(third < 1, "33.3% is not full credit");
  assert.ok(third < luckSuitability(luckOnlyStats(0.3)), "33.3% is not a special optimum vs 30%");
});

test("Epic regression anchors with BudgetQuality = 1.0", () => {
  const slot = "weapon";
  const rarity = "epic";
  const ref = gearStatPool(50, slot, rarity);
  const cases = [
    [{ strength: 0.35, vitality: 0.35, luck: 0.3 }, 1.0],
    [{ strength: 0.4, vitality: 0.3, luck: 0.3 }, 0.977],
    [{ strength: 0.5, vitality: 0.2, luck: 0.3 }, 0.931],
    [{ strength: 0.6, vitality: 0.2, luck: 0.2 }, 0.92],
    [{ strength: 0.2, vitality: 0.2, luck: 0.6 }, 0.84],
    [{ strength: 0.4, vitality: 0.4, agility: 0.2, luck: 0 }, 0.744],
  ];
  for (const [shares, expectedIq] of cases) {
    const scored = scoreGearIntrinsicQuality({
      stats: scaleShares(shares, ref),
      rarity,
      slot,
      itemLevel: 50,
      referenceLevel: 50,
      className: "Vanguard",
      actualTotal: ref,
    });
    assert.ok(Math.abs(scored.budgetQuality - 1) < 1e-12, `BQ ${scored.budgetQuality}`);
    assert.ok(
      Math.abs(scored.intrinsicQuality - expectedIq) < 0.002,
      `${JSON.stringify(shares)} IQ ${scored.intrinsicQuality} vs ${expectedIq}`,
    );
    console.log(`    epic anchor ${JSON.stringify(shares)} IQ=${scored.intrinsicQuality.toFixed(6)} expect=${expectedIq}`);
  }
});

test("BudgetQuality uses snapshotted Market level, not the item's own ItemLevel", () => {
  const slot = "weapon";
  const rarity = "epic";
  const L = 50;
  const variance = 1;
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
      actualTotal: Math.round(actual * variance),
    });
    assert.equal(scored.referenceLevel, L);
    assert.equal(scored.referenceBudget, gearStatPool(L, slot, rarity));
    bqs.push(scored.budgetQuality);
  }
  assert.ok(bqs[0] > bqs[1] && bqs[1] > bqs[2] && bqs[2] > bqs[3], `BQ ladder ${bqs.join(" > ")}`);
});

test("higher ±10% budget variance raises BudgetQuality; BQ is not clamped to 1", () => {
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

test("Legendary discretionary off-stat avoidance: floor is free, excess is penalized", () => {
  const T = 100;
  const floor = LEGENDARY_MANDATORY_STAT_SHARE * T;
  const atFloor = {
    strength: 30,
    vitality: 30,
    luck: 20,
    agility: floor,
    intellect: floor,
  };
  const moved = {
    strength: 20,
    vitality: 30,
    luck: 20,
    agility: 20,
    intellect: floor,
  };
  const movedMore = {
    strength: 15,
    vitality: 20,
    luck: 20,
    agility: 25,
    intellect: 20,
  };
  const a = discretionaryOffStatAvoidance(atFloor, "Vanguard", T);
  const b = discretionaryOffStatAvoidance(moved, "Vanguard", T);
  const c = discretionaryOffStatAvoidance(movedMore, "Vanguard", T);
  assert.equal(a, 1);
  assert.ok(b < a, `B ${b} < A 1`);
  assert.ok(c < b, `C ${c} < B ${b}`);
});

test("distribution outweighs budget variance; 1.10 is not auto Top 1%", () => {
  const rngHi = mulberry32(101);
  const rngLo = mulberry32(202);
  const highs = [];
  const lows = [];
  for (let i = 0; i < 400; i++) {
    const hi = rollItemStats({
      itemLevel: 50,
      type: "weapon",
      rarity: "epic",
      className: "Vanguard",
      rng: rngHi,
      statBudgetVariance: GEAR_STAT_BUDGET_VARIANCE_MAX,
    });
    const lo = rollItemStats({
      itemLevel: 50,
      type: "weapon",
      rarity: "epic",
      className: "Vanguard",
      rng: rngLo,
      statBudgetVariance: GEAR_STAT_BUDGET_VARIANCE_MIN,
    });
    highs.push(scoreGearIntrinsicQuality({
      stats: hi.stats,
      rarity: "epic",
      slot: "weapon",
      itemLevel: 50,
      referenceLevel: 50,
      className: "Vanguard",
      actualTotal: hi.targetBudget,
    }));
    lows.push(scoreGearIntrinsicQuality({
      stats: lo.stats,
      rarity: "epic",
      slot: "weapon",
      itemLevel: 50,
      referenceLevel: 50,
      className: "Vanguard",
      actualTotal: lo.targetBudget,
    }));
  }
  const all = [...highs, ...lows].map((s) => s.intrinsicQuality).sort((a, b) => a - b);
  let hiTop1Shared = 0;
  for (const s of highs) {
    const n = all.length;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (all[mid] < s.intrinsicQuality) lo = mid + 1;
      else hi = mid;
    }
    let equal = 0;
    for (let i = lo; i < n && all[i] === s.intrinsicQuality; i++) equal += 1;
    if ((lo + equal / 2) / n >= 0.99) hiTop1Shared += 1;
  }
  assert.ok(hiTop1Shared / highs.length < 0.2, `max-budget top1 share ${hiTop1Shared / highs.length}`);
  const loBest = Math.max(...lows.map((s) => s.intrinsicQuality));
  const hiWorst = Math.min(...highs.map((s) => s.intrinsicQuality));
  assert.ok(loBest > hiWorst, "excellent 0.90-budget distribution can beat a weak 1.10-budget piece");
});

test("offer snapshots quality at generation level; later player level does not change it", () => {
  const shop = generateNormalMarketOffers({
    playerLevel: 50,
    className: "Vanguard",
    rng: mulberry32(99),
    generationId: "q-persist",
  });
  const offer = shop.offers.find((o) => o._offerKind === "gear");
  assert.ok(offer);
  assert.equal(offer.quality_reference_level, 50);
  const before = {
    iq: offer.intrinsic_quality,
    p: offer.intrinsic_quality_percentile,
    nova: offer.nova_cost,
    band: offer.intrinsic_quality_band,
    bq: offer.budget_quality,
  };
  const rescored = resolveOfferIntrinsicQuality({
    item: { ...offer, level: 51, level_requirement: offer.level_requirement },
    className: "Vanguard",
    referenceLevel: 51,
  });
  assert.equal(rescored.referenceLevel, 50);
  assert.ok(Math.abs(rescored.budgetQuality - before.bq) < 1e-12);
  assert.ok(Math.abs(rescored.intrinsicQuality - before.iq) < 1e-12);
  assert.equal(rescored.percentile, before.p);
  const haggled = applyOfferHaggle(offer, () => 0.99);
  assert.equal(haggled.offer.intrinsic_quality, before.iq);
  assert.equal(haggled.offer.intrinsic_quality_percentile, before.p);
  assert.equal(haggled.offer.nova_cost, before.nova);
  assert.equal(haggled.offer.intrinsic_quality_band, before.band);
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
    assert.notEqual(id.slot, null);
  }
  const shares = offsetCounts.map((c) => c / n);
  const expected = [...MARKET_GEAR_LEVEL_OFFSET_WEIGHTS];
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(shares[i] - expected[i]) < 0.02,
      `offset ${i} share ${shares[i]} vs ${expected[i]}`,
    );
  }
  console.log(`    CDF IL offset shares=${shares.map((s) => s.toFixed(3)).join("/")}`);

  const onLevel = [];
  const lowLevel = [];
  const rngP = mulberry32(77);
  for (let i = 0; i < 400; i++) {
    const hi = rollItemStats({
      itemLevel: L,
      type: "weapon",
      rarity: "epic",
      className: "Vanguard",
      rng: rngP,
    });
    const lo = rollItemStats({
      itemLevel: L - 3,
      type: "weapon",
      rarity: "epic",
      className: "Vanguard",
      rng: rngP,
    });
    onLevel.push(resolveOfferIntrinsicQuality({
      item: {
        type: "weapon",
        rarity: "epic",
        level_requirement: L,
        stats: hi.stats,
        stat_budget: hi.targetBudget,
        quality_reference_level: L,
      },
      className: "Vanguard",
    }).percentile);
    lowLevel.push(resolveOfferIntrinsicQuality({
      item: {
        type: "weapon",
        rarity: "epic",
        level_requirement: L - 3,
        stats: lo.stats,
        stat_budget: lo.targetBudget,
        quality_reference_level: L,
      },
      className: "Vanguard",
    }).percentile);
  }
  assert.ok(
    mean(onLevel) > mean(lowLevel),
    `on-level percentile ${mean(onLevel)} vs L-3 ${mean(lowLevel)}`,
  );
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
  assert.equal(intrinsicQualityPercentile(0.9, "epic"), intrinsicQualityPercentile(0.9, "epic"));
  assert.equal(
    intrinsicQualityPercentile(0.9, "epic", L),
    intrinsicQualityPercentile(0.9, "epic"),
  );
});

test("Epic/Legendary band populations follow within-rarity CDF; class is not segmented", () => {
  const n = 8_000;
  const expected = [0.75, 0.10, 0.07, 0.05, 0.02, 0.01];
  const L = INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL;
  for (const rarity of ["epic", "legendary"]) {
    const rng = mulberry32(rarity === "epic" ? 7 : 11);
    const iqs = [];
    const bandCounts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const itemLevel = rollMarketGearItemLevel(L, rng);
      const rolled = rollItemStats({
        itemLevel,
        type: "armor",
        rarity,
        className: "Technomancer",
        rng,
      });
      const resolved = resolveOfferIntrinsicQuality({
        item: {
          type: "armor",
          rarity,
          level_requirement: itemLevel,
          stats: rolled.stats,
          stat_budget: rolled.targetBudget,
          quality_reference_level: L,
        },
        className: "Technomancer",
      });
      iqs.push(resolved.intrinsicQuality);
      bandCounts[resolved.band] += 1;
    }
    iqs.sort((a, b) => a - b);
    const shares = bandCounts.map((c) => c / n);
    for (let i = 0; i < expected.length; i++) {
      assert.ok(
        Math.abs(shares[i] - expected[i]) < 0.04,
        `${rarity} band ${NOVA_SURCHARGE_BANDS[i].id} ${shares[i]} vs ${expected[i]}`,
      );
    }
    console.log(
      `    ${rarity} mean=${mean(iqs).toFixed(4)} median=${median(iqs).toFixed(4)}`
      + ` P75=${quantile(iqs, 0.75).toFixed(4)} P85=${quantile(iqs, 0.85).toFixed(4)}`
      + ` P92=${quantile(iqs, 0.92).toFixed(4)} P97=${quantile(iqs, 0.97).toFixed(4)}`
      + ` P99=${quantile(iqs, 0.99).toFixed(4)}`,
    );
    console.log(`    ${rarity} band shares=${shares.map((s) => s.toFixed(3)).join("/")}`);
  }

  const percentiles = { Vanguard: [], Technomancer: [] };
  for (const className of Object.keys(percentiles)) {
    const rng = mulberry32(className === "Vanguard" ? 21 : 22);
    for (let i = 0; i < 1_200; i++) {
      const rolled = rollItemStats({
        itemLevel: 50,
        type: "weapon",
        rarity: "epic",
        className,
        rng,
      });
      const resolved = resolveOfferIntrinsicQuality({
        item: {
          type: "weapon",
          rarity: "epic",
          level_requirement: 50,
          stats: rolled.stats,
          stat_budget: rolled.targetBudget,
          quality_reference_level: 50,
        },
        className,
      });
      percentiles[className].push(resolved.percentile);
    }
  }
  const vMean = mean(percentiles.Vanguard);
  const tMean = mean(percentiles.Technomancer);
  assert.ok(
    Math.abs(vMean - tMean) < 0.08,
    `class percentile means Vanguard=${vMean} Technomancer=${tMean}`,
  );
  console.log(`    class percentile means Vanguard=${vMean.toFixed(3)} Technomancer=${tMean.toFixed(3)}`);
});

test("level-specific CDF: cache key, lazy reuse, no class, Contraband share, early clamp", () => {
  assert.equal(BLACK_MARKET_RULES_VERSION, "phase6-intrinsic-quality-v4");
  assert.equal(INTRINSIC_QUALITY_CDF_SAMPLE_SIZE, 4096);
  assert.ok(INTRINSIC_QUALITY_CDF_LEVEL_SEED_MIX);
  assert.equal(INTRINSIC_QUALITY_CDF_MIN_REFERENCE_LEVEL, 1);
  assert.equal(resolveIntrinsicQualityCdfReferenceLevel(null), INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL);
  assert.equal(resolveIntrinsicQualityCdfReferenceLevel(537), 537);
  assert.equal(intrinsicQualityCdfCacheKey("Epic", 537), "epic:537");
  assert.notEqual(intrinsicQualityCdfCacheKey("epic", 50), intrinsicQualityCdfCacheKey("epic", 500));
  assert.notEqual(intrinsicQualityCdfCacheKey("epic", 500), intrinsicQualityCdfCacheKey("legendary", 500));

  resetIntrinsicQualityCdfCache();
  assert.equal(getIntrinsicQualityCdfCacheSize(), 0);
  const firstA = intrinsicQualityPercentile(0.9, "epic", 537);
  assert.equal(getIntrinsicQualityCdfCacheSize(), 1);
  const firstB = intrinsicQualityPercentile(0.9, "epic", 537);
  assert.equal(firstA, firstB);
  assert.equal(getIntrinsicQualityCdfCacheSize(), 1);
  intrinsicQualityPercentile(0.9, "legendary", 537);
  assert.equal(getIntrinsicQualityCdfCacheSize(), 2);
  intrinsicQualityPercentile(0.9, "epic", 100);
  assert.equal(getIntrinsicQualityCdfCacheSize(), 3);

  const probeIqs = [0.72, 0.8, 0.88, 0.92, 0.96, 1.0];
  let maxAbs = 0;
  for (const iq of probeIqs) {
    maxAbs = Math.max(
      maxAbs,
      Math.abs(intrinsicQualityPercentile(iq, "epic", 50) - intrinsicQualityPercentile(iq, "epic", 2000)),
    );
  }
  assert.ok(maxAbs > 0, `L50 vs L2000 CDF should differ for some IQ probes, maxAbs=${maxAbs}`);

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
    nova: gear500.nova_cost,
  };
  const rescoredWrongLevel = resolveOfferIntrinsicQuality({
    item: { ...gear500, level: 501, level_requirement: gear500.level_requirement },
    className: "Vanguard",
    referenceLevel: 501,
  });
  assert.equal(rescoredWrongLevel.referenceLevel, 500);
  assert.equal(rescoredWrongLevel.percentile, before500.p);
  assert.equal(rescoredWrongLevel.band, before500.band);
  assert.ok(Math.abs(rescoredWrongLevel.intrinsicQuality - before500.iq) < 1e-12);

  const contra500 = generateContrabandOffer({
    playerLevel: 500,
    className: "Vanguard",
    rng: mulberry32(77),
    generationId: "c-500",
  });
  assert.equal(contra500.quality_reference_level, 500);
  assert.equal(contra500.level_requirement, 500);
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
    assert.equal(id.referenceLevel, 1);
    assert.equal(id.itemLevel, 1);
  }
  const l2 = { 1: 0, 2: 0 };
  for (let i = 0; i < 800; i++) {
    const id = rollIntrinsicQualityCdfIdentity(rngClamp, 2);
    assert.ok(id.itemLevel === 1 || id.itemLevel === 2);
    l2[id.itemLevel] += 1;
  }
  assert.ok(l2[1] > 0 && l2[2] > 0, `L2 clamp mix ${JSON.stringify(l2)}`);
  const l3 = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < 800; i++) {
    const id = rollIntrinsicQualityCdfIdentity(rngClamp, 3);
    assert.ok(id.itemLevel >= 1 && id.itemLevel <= 3);
    l3[id.itemLevel] += 1;
  }
  assert.ok(l3[1] > 0 && l3[3] > 0, `L3 clamp mix ${JSON.stringify(l3)}`);
});

test("level-specific CDF band populations and class alignment across production range", () => {
  const levels = [1, 10, 50, 100, 500, 1000, 1500, 2000];
  const expected = [0.75, 0.10, 0.07, 0.05, 0.02, 0.01];
  const n = 2_000;
  const shareTolerance = 0.055;
  resetIntrinsicQualityCdfCache();
  for (const L of levels) {
    for (const rarity of ["epic", "legendary"]) {
      const rng = mulberry32(L * 17 + (rarity === "epic" ? 3 : 5));
      const bandCounts = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        const itemLevel = rollMarketGearItemLevel(L, rng);
        const rolled = rollItemStats({
          itemLevel,
          type: "armor",
          rarity,
          className: "Technomancer",
          rng,
        });
        const resolved = resolveOfferIntrinsicQuality({
          item: {
            type: "armor",
            rarity,
            level_requirement: itemLevel,
            stats: rolled.stats,
            stat_budget: rolled.targetBudget,
            quality_reference_level: L,
          },
          className: "Technomancer",
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
  assert.equal(
    getIntrinsicQualityCdfCacheSize(),
    levels.length * 2,
    "lazy cache one entry per rarity/level pair",
  );

  for (const L of [1, 2000]) {
    const percentiles = { Vanguard: [], Technomancer: [] };
    for (const className of Object.keys(percentiles)) {
      const rng = mulberry32(L + (className === "Vanguard" ? 31 : 32));
      for (let i = 0; i < 800; i++) {
        const rolled = rollItemStats({
          itemLevel: L,
          type: "weapon",
          rarity: "epic",
          className,
          rng,
        });
        percentiles[className].push(resolveOfferIntrinsicQuality({
          item: {
            type: "weapon",
            rarity: "epic",
            level_requirement: L,
            stats: rolled.stats,
            stat_budget: rolled.targetBudget,
            quality_reference_level: L,
          },
          className,
        }).percentile);
      }
    }
    const vMean = mean(percentiles.Vanguard);
    const tMean = mean(percentiles.Technomancer);
    assert.ok(
      Math.abs(vMean - tMean) < 0.1,
      `L${L} class percentile means Vanguard=${vMean} Technomancer=${tMean}`,
    );
    console.log(`    L${L} class percentile means Vanguard=${vMean.toFixed(3)} Technomancer=${tMean.toFixed(3)}`);
  }

  resetIntrinsicQualityCdfCache();
  const perfLevels = [1, 10, 50, 100, 500, 1000, 1500, 2000];
  for (const L of perfLevels) {
    const t0 = performance.now();
    intrinsicQualityPercentile(0.9, "epic", L);
    const t1 = performance.now();
    intrinsicQualityPercentile(0.91, "epic", L);
    const t2 = performance.now();
    const buildMs = t1 - t0;
    const hitMs = t2 - t1;
    console.log(`    epic L${L} CDF build ${buildMs.toFixed(1)}ms cache-hit ${hitMs.toFixed(2)}ms`);
    assert.ok(hitMs < buildMs || hitMs < 5, `cache hit should be cheap at L${L}`);
  }
  assert.equal(getIntrinsicQualityCdfCacheSize(), perfLevels.length);
});

test("Nova surcharge tables/pools unchanged; Haggling constants unchanged", () => {
  assert.deepEqual(NOVA_SURCHARGE_TABLE.epic.probabilities, [0.3, 0.4, 0.55, 0.65, 0.75, 0.85]);
  assert.deepEqual(NOVA_SURCHARGE_TABLE.epic.prices[1], [10, 25, 25]);
  assert.deepEqual(NOVA_SURCHARGE_TABLE.legendary.probabilities, [0.4, 0.55, 0.7, 0.8, 0.9, 0.95]);
  assert.deepEqual(NOVA_SURCHARGE_TABLE.legendary.prices[5], [75, 100, 150]);
  assert.equal(NOVA_SURCHARGE_BANDS[0].maxExclusive, 0.75);
  assert.equal(NOVA_SURCHARGE_BANDS[5].minInclusive, 0.99);
  assert.equal(MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD, 0.4);
  assert.equal(MARKET_HAGGLE_SUCCESS_CHANCE_NOVA, 0.3);
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
      const item = {
        type: "weapon",
        rarity,
        level_requirement: itemLevel,
        stats: rolled.stats,
        stat_budget: rolled.targetBudget,
        stat_budget_variance: rolled.statBudgetVariance,
        quality_reference_level: 50,
      };
      const resolved = resolveOfferIntrinsicQuality({ item, className: "Vanguard" });
      const spec = novaSurchargeSpec(rarity, resolved.percentile);
      const nova = resolveNovaSurcharge(rarity, resolved.percentile, 0, 0.5);
      rows.push({
        rarity,
        classRoles: "Vanguard primary=strength offs=agility,intellect",
        marketLevel: 50,
        itemLevel,
        slot: "weapon",
        actualBudget: resolved.actualBudget,
        referenceBudget: resolved.referenceBudget,
        variance: rolled.statBudgetVariance,
        budgetQuality: resolved.budgetQuality,
        stats: rolled.stats,
        desirableShare: resolved.desirableStatShare,
        discretionaryOff: resolved.discretionaryOffStatAvoidance,
        pv: resolved.primaryVitalityBalance,
        luck: resolved.luckSuitability,
        dq: resolved.distributionQuality,
        iq: resolved.intrinsicQuality,
        percentile: resolved.percentile,
        band: resolved.bandId,
        chance: spec.probability,
        novaIfHit: nova,
      });
    }
  }
  const epic = rows.filter((r) => r.rarity === "epic");
  const legendary = rows.filter((r) => r.rarity === "legendary");
  const highBudgetPoor = epic.reduce((best, r) => (
    !best || (r.budgetQuality > 1 && r.dq < (best.dq ?? 1) && r.budgetQuality >= best.budgetQuality * 0.98 && r.dq < 0.75)
      ? ((r.budgetQuality > 1 && r.dq < 0.85) ? r : best)
      : best
  ), null) || epic.slice().sort((a, b) => (b.budgetQuality - b.dq) - (a.budgetQuality - a.dq))[0];
  const lowBudgetExcellent = epic.slice().sort((a, b) => (b.dq - b.budgetQuality) - (a.dq - a.budgetQuality))[0];
  const strongEpic = epic.slice().sort((a, b) => b.iq - a.iq)[0];
  const strongLeg = legendary.slice().sort((a, b) => b.iq - a.iq)[0];
  const weakLegOff = legendary.slice().sort((a, b) => a.discretionaryOff - b.discretionaryOff)[0];
  const picks = [
    ["high budget / poor distribution", highBudgetPoor],
    ["lower budget / excellent distribution", lowBudgetExcellent],
    ["strong Epic", strongEpic],
    ["strong Legendary", strongLeg],
    ["weak Legendary with discretionary off-stat excess", weakLegOff],
  ];
  for (const [label, ex] of picks) {
    assert.ok(ex, label);
    console.log(
      `    ${label}: ${ex.rarity} IL=${ex.itemLevel}/${ex.marketLevel} var=${ex.variance.toFixed(4)}`
      + ` actual=${ex.actualBudget} ref=${ex.referenceBudget} BQ=${ex.budgetQuality.toFixed(4)}`
      + ` DQ=${ex.dq.toFixed(4)} IQ=${ex.iq.toFixed(4)} p=${ex.percentile.toFixed(4)} band=${ex.band}`
      + ` chance=${ex.chance} novaHit=${ex.novaIfHit}`
      + ` PV=${ex.pv.toFixed(3)} luck=${ex.luck.toFixed(3)}`
      + ` des=${ex.desirableShare.toFixed(3)} dOff=${ex.discretionaryOff.toFixed(3)}`
      + ` stats=${JSON.stringify(ex.stats)}`,
    );
  }
  assert.ok(lowBudgetExcellent.dq > highBudgetPoor.dq || lowBudgetExcellent.iq > highBudgetPoor.iq
    || strongEpic.iq >= highBudgetPoor.iq);
});

if (failed) {
  console.error(`\nPhase 6 quality: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nPhase 6 quality: ${passed} passed`);
