/**
 * Phase 6 — Contraband Loot generation, daily clock, 10-manual-refresh counter.
 * Run: npm run test:phase6-contraband
 */
import assert from "node:assert/strict";
import {
  generateContrabandOffer,
  mulberry32,
  nextContrabandManualRefreshState,
  shopGenerationId,
} from "../../src/lib/blackMarket.js";
import {
  CONTRABAND_MANUAL_REFRESH_TRIGGER,
  CONTRABAND_RARITY_WEIGHTS,
  contrabandPeriodId,
  contrabandTriggersFromManualRefreshCount,
  contrabandWindowAt,
  GEAR_ORIGIN_CONTRABAND,
  MARKET_OFFER_KIND_GEAR,
  rollContrabandRarity,
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

function cheapGear({ rarity, itemLevel, slot, origin, manufacturer }) {
  return {
    type: slot,
    rarity,
    level_requirement: itemLevel,
    level: itemLevel,
    stats: { strength: 1 },
    origin,
    manufacturer,
    shipment_eligible: false,
    stat_budget_variance: 1,
    sell_value: 1,
  };
}

console.log("\nPhase 6 — Contraband Loot\n");

test("one Gear-only offer at current player level", () => {
  const offer = generateContrabandOffer({
    playerLevel: 77,
    rng: mulberry32(9),
    createGear: cheapGear,
    generationId: shopGenerationId(1, 0, 1),
    periodId: "2026-08-31",
  });
  assert.equal(offer._offerKind, MARKET_OFFER_KIND_GEAR);
  assert.equal(offer.contraband, true);
  assert.equal(offer.origin, GEAR_ORIGIN_CONTRABAND);
  assert.equal(offer.haggle_eligible, false);
  assert.equal(offer.shipment_eligible, false);
  assert.equal(offer.level_requirement, 77);
  assert.notEqual(offer.type, "consumable");
  assert.ok(["rare", "epic", "legendary"].includes(offer.rarity));
  assert.ok(offer.manufacturer);
  for (const L of [1, 2, 3, 10, 50, 100, 500, 800, 1500, 2000]) {
    const atLevel = generateContrabandOffer({
      playerLevel: L,
      rng: mulberry32(L + 9),
      createGear: cheapGear,
      generationId: shopGenerationId(L, 0, 1),
      periodId: "2026-08-31",
    });
    assert.equal(atLevel.level_requirement, L);
    assert.equal(atLevel._offerKind, MARKET_OFFER_KIND_GEAR);
  }
});

test("Contraband rarity 65/25/10; never Common/Uncommon", () => {
  assert.equal(CONTRABAND_RARITY_WEIGHTS.rare, 0.65);
  assert.equal(CONTRABAND_RARITY_WEIGHTS.epic, 0.25);
  assert.equal(CONTRABAND_RARITY_WEIGHTS.legendary, 0.1);
  const counts = { rare: 0, epic: 0, legendary: 0 };
  const N = 20_000;
  for (let i = 0; i < N; i++) {
    counts[rollContrabandRarity(mulberry32(i + 1))] += 1;
  }
  assert.ok(counts.rare / N > 0.62 && counts.rare / N < 0.68);
  assert.ok(counts.epic / N > 0.22 && counts.epic / N < 0.28);
  assert.ok(counts.legendary / N > 0.08 && counts.legendary / N < 0.12);
});

test("daily Contraband window is 19:00 UTC", () => {
  const at1900 = Date.UTC(2026, 7, 31, 19, 0, 0);
  const at1859 = Date.UTC(2026, 7, 31, 18, 59, 0);
  const a = contrabandWindowAt(at1900);
  const b = contrabandWindowAt(at1859);
  assert.equal(contrabandPeriodId(at1900), "2026-08-31");
  assert.notEqual(a.period_id, b.period_id);
  assert.equal(a.endsAt - a.startsAt, 24 * 60 * 60 * 1000);
});

test("20,000 counted manual refreshes → 2,000 Contraband triggers", () => {
  const N = 20_000;
  assert.equal(contrabandTriggersFromManualRefreshCount(N), N / CONTRABAND_MANUAL_REFRESH_TRIGGER);
  let count = 0;
  let triggers = 0;
  for (let i = 0; i < N; i++) {
    const next = nextContrabandManualRefreshState(count);
    count = next.count;
    if (next.triggered) triggers += 1;
  }
  assert.equal(triggers, 2_000);
  assert.equal(count, 0);
});

test("counter 9 then next manual refresh triggers exactly once", () => {
  const next = nextContrabandManualRefreshState(9);
  assert.equal(next.triggered, true);
  assert.equal(next.count, 0);
  const after = nextContrabandManualRefreshState(next.count);
  assert.equal(after.triggered, false);
  assert.equal(after.count, 1);
});

if (failed) {
  console.error(`\nPhase 6 contraband: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nPhase 6 contraband: ${passed} passed`);
