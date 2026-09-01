/**
 * Phase 6 — normal Black Market generation, Stim safeguard, snapshots.
 * Run: npm run test:phase6-market
 */
import assert from "node:assert/strict";
import {
  generateNormalMarketOffers,
  mulberry32,
  shopGenerationId,
} from "../../src/lib/blackMarket.js";
import {
  CONTRABAND_FREE_REFRESH_TRIGGER,
  MARKET_GEAR_LEVEL_OFFSET_WEIGHTS,
  MARKET_GEAR_OFFER_CHANCE,
  MARKET_MIN_STIM_OFFERS,
  MARKET_NORMAL_SLOT_COUNT,
  MARKET_OFFER_KIND_GEAR,
  MARKET_OFFER_KIND_STIM,
  MARKET_RARITY_WEIGHTS,
  MARKET_STIM_OFFER_CHANCE,
  marketStimTier,
  marketWindowAt,
  rollMarketGearItemLevel,
  rollMarketGearRarity,
  rollNormalMarketOfferKinds,
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

function generateShop(seed, level = 40) {
  return generateNormalMarketOffers({
    playerLevel: level,
    rng: mulberry32(seed),
    createGear: cheapGear,
    generationId: shopGenerationId(seed, 0, 0),
    windowIdx: 1,
  });
}

console.log("\nPhase 6 — normal Market generation\n");

test("exactly 8 slots; at least one Stim; kinds are gear or stim", () => {
  const built = generateShop(1);
  assert.equal(built.offers.length, MARKET_NORMAL_SLOT_COUNT);
  assert.ok(built.stimCount >= MARKET_MIN_STIM_OFFERS);
  for (const o of built.offers) {
    assert.ok(o._offerKind === MARKET_OFFER_KIND_GEAR || o._offerKind === MARKET_OFFER_KIND_STIM);
    assert.ok(o._slotId);
    assert.ok(o.cost >= 0);
  }
});

test("90/10 type rolls; all-Gear safeguard converts exactly one slot", () => {
  const forcedGear = () => 0;
  const kinds = rollNormalMarketOfferKinds(forcedGear);
  assert.equal(kinds.stimCountBeforeSafeguard, 0);
  assert.ok(kinds.safeguardIndex >= 0 && kinds.safeguardIndex < MARKET_NORMAL_SLOT_COUNT);
  assert.equal(kinds.kinds.filter((k) => k === MARKET_OFFER_KIND_STIM).length, 1);
  assert.equal(MARKET_GEAR_OFFER_CHANCE + MARKET_STIM_OFFER_CHANCE, 1);
});

test("duplicate Gear slots are legal; uniqueness is not enforced", () => {
  let sawDuplicateSlot = false;
  for (let seed = 1; seed <= 200 && !sawDuplicateSlot; seed++) {
    const gear = generateShop(seed, 80).offers.filter((o) => o._offerKind === MARKET_OFFER_KIND_GEAR);
    const slots = gear.map((g) => g.type);
    if (slots.length !== new Set(slots).size) sawDuplicateSlot = true;
  }
  assert.equal(sawDuplicateSlot, true);
});

test("snapshot identity for same seed", () => {
  const a = generateShop(4242, 30);
  const b = generateShop(4242, 30);
  assert.equal(a.offers.length, b.offers.length);
  for (let i = 0; i < a.offers.length; i++) {
    assert.equal(a.offers[i]._offerKind, b.offers[i]._offerKind);
    assert.equal(a.offers[i].rarity, b.offers[i].rarity);
    assert.equal(a.offers[i].cost, b.offers[i].cost);
    assert.equal(a.offers[i].type, b.offers[i].type);
    assert.equal(a.offers[i].nova_cost, b.offers[i].nova_cost);
  }
});

test("T18 Stim tier bands: L≤19 Uncommon, L≤49 Rare, else Epic", () => {
  assert.equal(marketStimTier(1), "uncommon");
  assert.equal(marketStimTier(19), "uncommon");
  assert.equal(marketStimTier(20), "rare");
  assert.equal(marketStimTier(49), "rare");
  assert.equal(marketStimTier(50), "epic");
  const shop = generateShop(7, 12);
  for (const o of shop.offers.filter((x) => x._offerKind === MARKET_OFFER_KIND_STIM)) {
    assert.equal(o.rarity, "uncommon");
    assert.equal(o.economic_level, 12);
    assert.equal(o.nova_cost, 0);
    assert.equal(o.haggle_eligible, false);
  }
  for (const o of shop.offers.filter((x) => x._offerKind === MARKET_OFFER_KIND_GEAR)) {
    assert.equal(o.haggle_eligible, true);
  }
});

test("Market UTC windows are 12h at 19:00/07:00", () => {
  const evening = Date.UTC(2026, 7, 31, 19, 0, 0);
  const morning = Date.UTC(2026, 8, 1, 7, 0, 0);
  const beforeSeven = Date.UTC(2026, 8, 1, 6, 59, 0);
  const w19 = marketWindowAt(evening);
  const w07 = marketWindowAt(morning);
  const wPre = marketWindowAt(beforeSeven);
  assert.equal(w19.startHour, 19);
  assert.equal(w07.startHour, 7);
  assert.equal(wPre.startHour, 19);
  assert.equal(w19.endsAt - w19.startsAt, w07.endsAt - w07.startsAt);
  assert.notEqual(w19.idx, w07.idx);
});

test("500,000 shops: 0 missing Stim, 8 offers, types valid", () => {
  const N = 500_000;
  let missingStim = 0;
  let badCount = 0;
  let badType = 0;
  let stimBefore = 0;
  let stimAfter = 0;
  let safeguard = 0;
  for (let i = 0; i < N; i++) {
    const built = generateShop(i * 997 + 13, 80);
    if (built.offers.length !== MARKET_NORMAL_SLOT_COUNT) badCount += 1;
    stimBefore += built.stimCountBeforeSafeguard;
    stimAfter += built.stimCount;
    if (built.safeguardIndex >= 0) safeguard += 1;
    if (built.stimCount < MARKET_MIN_STIM_OFFERS) missingStim += 1;
    for (const o of built.offers) {
      if (o._offerKind !== MARKET_OFFER_KIND_GEAR && o._offerKind !== MARKET_OFFER_KIND_STIM) {
        badType += 1;
      }
    }
  }
  console.log(`    pre-safeguard mean Stim/shop=${(stimBefore / N).toFixed(4)} post=${(stimAfter / N).toFixed(4)} safeguard=${safeguard}`);
  assert.equal(missingStim, 0);
  assert.equal(badCount, 0);
  assert.equal(badType, 0);
  void CONTRABAND_FREE_REFRESH_TRIGGER;
});

test("normal Gear rarity 20/35/30/12.5/2.5 and item levels L through L-3", () => {
  const rarityN = 40_000;
  const rarityCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < rarityN; i++) {
    rarityCounts[rollMarketGearRarity(mulberry32(i + 101))] += 1;
  }
  for (const [rarity, weight] of Object.entries(MARKET_RARITY_WEIGHTS)) {
    const observed = rarityCounts[rarity] / rarityN;
    assert.ok(
      Math.abs(observed - weight) < 0.015,
      `${rarity} ${observed} vs ${weight}`,
    );
  }

  const levels = [1, 2, 3, 10, 50, 100, 500, 800, 1500, 2000];
  const sampleN = 12_000;
  for (const L of levels) {
    const counts = new Map();
    for (let i = 0; i < sampleN; i++) {
      const il = rollMarketGearItemLevel(L, mulberry32(L * 10_000 + i + 3));
      assert.ok(il >= 1 && il <= L, `invalid IL ${il} at player ${L}`);
      counts.set(il, (counts.get(il) || 0) + 1);
    }
    for (let off = 0; off < MARKET_GEAR_LEVEL_OFFSET_WEIGHTS.length; off++) {
      const expectedLevel = Math.max(1, L - off);
      const expectedShare = MARKET_GEAR_LEVEL_OFFSET_WEIGHTS
        .map((w, i) => (Math.max(1, L - i) === expectedLevel ? w : 0))
        .reduce((s, w) => s + w, 0);
      if (expectedShare <= 0) continue;
      const observed = (counts.get(expectedLevel) || 0) / sampleN;
      assert.ok(
        Math.abs(observed - expectedShare) < 0.025,
        `L${L} item ${expectedLevel} ${observed} vs ${expectedShare}`,
      );
    }
  }
});

if (failed) {
  console.error(`\nPhase 6 market: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nPhase 6 market: ${passed} passed`);
