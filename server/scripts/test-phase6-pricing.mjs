/**
 * Phase 6 — Gear/Stim pricing, Nova surcharge, Haggling.
 * Run: npm run test:phase6-pricing
 */
import assert from "node:assert/strict";
import {
  applyOfferHaggle,
  generateContrabandOffer,
  generateNormalMarketOffers,
  isOfferHaggleEligible,
  mulberry32,
  shopGenerationId,
} from "../../src/lib/blackMarket.js";
import {
  applyHaggleDiscountToNova,
  applyHaggleDiscountToPrice,
  blackMarketBasePrice,
  blackMarketPrice,
  gearResaleValue,
  MARKET_HAGGLE_DISCOUNT_MAX_PERCENT,
  MARKET_HAGGLE_DISCOUNT_MIN_PERCENT,
  MARKET_HAGGLE_SUCCESS_CHANCE,
  MARKET_HAGGLE_SUCCESS_CHANCE_NOVA,
  MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD,
  MARKET_HAGGLE_VENDOR_FLOOR_OFFSET,
  MARKET_PRICE_VARIANCE_MAX,
  MARKET_PRICE_VARIANCE_MIN,
  marketHaggleSuccessChance,
  novaSurchargeSpec,
  quantizeNova,
  resolveMarketHaggle,
  resolveNovaSurcharge,
  roundHalfUp,
  stimShopPriceResolved,
  STIM_SHOP_MULT,
  stardustPerFuel,
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
    sell_value: gearResaleValue(itemLevel, slot, rarity),
  };
}

console.log("\nPhase 6 — pricing / Nova / haggling\n");

test("Gear price = ROUND(SPF × rar × slot × variance) at 0.80/1.00/1.20", () => {
  const rarities = ["common", "uncommon", "rare", "epic", "legendary"];
  const slots = ["helmet", "weapon"];
  const levels = [1, 10, 50, 100];
  const variances = [MARKET_PRICE_VARIANCE_MIN, 1, MARKET_PRICE_VARIANCE_MAX];
  for (const rarity of rarities) {
    for (const slot of slots) {
      for (const L of levels) {
        for (const v of variances) {
          const got = blackMarketPrice(L, slot, rarity, v);
          const expect = Math.round(blackMarketBasePrice(L, slot, rarity) * v);
          assert.equal(got, Math.max(0, expect));
        }
      }
    }
  }
});

test("Contraband uses the same Gear price architecture", () => {
  const offer = generateContrabandOffer({
    playerLevel: 40,
    rng: mulberry32(3),
    createGear: cheapGear,
    generationId: "c1",
  });
  const expect = blackMarketPrice(
    offer.level_requirement,
    offer.type,
    offer.rarity,
    offer.price_variance,
  );
  assert.equal(offer.cost, expect);
});

test("Stim shop prices match Phase 5 primitive; no ±20% variance", () => {
  assert.equal(stimShopPriceResolved(40, "uncommon"), roundHalfUp(stardustPerFuel(40) * STIM_SHOP_MULT.uncommon));
  assert.equal(stimShopPriceResolved(40, "rare"), roundHalfUp(stardustPerFuel(40) * STIM_SHOP_MULT.rare));
  assert.equal(stimShopPriceResolved(40, "epic"), roundHalfUp(stardustPerFuel(40) * STIM_SHOP_MULT.epic));
  const shop = generateNormalMarketOffers({
    playerLevel: 40,
    rng: mulberry32(11),
    createGear: cheapGear,
    generationId: shopGenerationId(1, 0, 0),
  });
  for (const o of shop.offers.filter((x) => x._offerKind === "stim")) {
    assert.equal(o.cost, stimShopPriceResolved(40, o.rarity));
    assert.equal(o.price_variance, 1);
    assert.equal(o.nova_cost, 0);
  }
});

test("Nova surcharge: C/U/R never; every Epic/Legendary band chance and pool", () => {
  const bandProbes = [
    { id: "below25", percentile: 0 },
    { id: "17to25", percentile: 0.75 },
    { id: "10to17", percentile: 0.825 },
    { id: "5to10", percentile: 0.9 },
    { id: "2p5to5", percentile: 0.95 },
    { id: "top2p5", percentile: 0.975 },
  ];
  const expected = {
    epic: {
      chances: [0.3, 0.5, 0.6, 0.75, 0.85, 0.95],
      pools: [
        [10, 20, 40],
        [50, 60, 75],
        [80, 90, 100],
        [100, 110, 125],
        [125, 150, 175],
        [160, 180, 200],
      ],
    },
    legendary: {
      chances: [0.75, 0.9, 1, 1, 1, 1],
      pools: [
        [50, 60, 75],
        [75, 100, 125],
        [100, 125, 150],
        [160, 180, 200],
        [200, 225, 250],
        [250, 275, 300],
      ],
    },
  };
  const ineligible = ["common", "uncommon", "rare"];
  for (const rarity of ineligible) {
    for (const probe of bandProbes) {
      assert.equal(resolveNovaSurcharge(rarity, probe.percentile, 0, 0), 0);
      const spec = novaSurchargeSpec(rarity, probe.percentile);
      assert.equal(spec.probability, 0);
      assert.equal(spec.prices.length, 0);
    }
  }

  const poolSize = 3;
  const justBelowCertain = 0.999999;
  for (const rarity of ["epic", "legendary"]) {
    const table = expected[rarity];
    for (let i = 0; i < bandProbes.length; i++) {
      const percentile = bandProbes[i].percentile;
      const spec = novaSurchargeSpec(rarity, percentile);
      assert.equal(spec.bandId, bandProbes[i].id, `${rarity} ${bandProbes[i].id} band`);
      assert.equal(spec.probability, table.chances[i], `${rarity} ${bandProbes[i].id} chance`);
      assert.deepEqual(spec.prices, table.pools[i], `${rarity} ${bandProbes[i].id} pool`);
      assert.equal(spec.prices.length, poolSize);

      if (spec.probability < 1) {
        const miss = resolveNovaSurcharge(rarity, percentile, spec.probability, 0);
        assert.equal(miss, 0, `${rarity} ${bandProbes[i].id} miss at probability`);
      }

      for (let pi = 0; pi < poolSize; pi++) {
        const choiceUnit = (pi + 0.5) / poolSize;
        const nova = resolveNovaSurcharge(rarity, percentile, 0, choiceUnit);
        assert.equal(nova, table.pools[i][pi], `${rarity} ${bandProbes[i].id} pool[${pi}]`);
      }
    }
  }

  for (const probe of [bandProbes[3], bandProbes[4], bandProbes[5]]) {
    const spec = novaSurchargeSpec("legendary", probe.percentile);
    assert.equal(spec.probability, 1, `Legendary ${probe.id} is 100%`);
    for (const hitRoll of [0, 0.5, justBelowCertain]) {
      const nova = resolveNovaSurcharge("legendary", probe.percentile, hitRoll, 0);
      assert.equal(nova, spec.prices[0], `Legendary ${probe.id} always surcharges at hitRoll=${hitRoll}`);
    }
  }
});

test("Haggle eligibility: normal Gear only; Stims and Contraband ineligible", () => {
  const shop = generateNormalMarketOffers({
    playerLevel: 40,
    rng: mulberry32(21),
    createGear: cheapGear,
    generationId: shopGenerationId(1, 0, 0),
  });
  const gear = shop.offers.find((o) => o._offerKind === "gear");
  const stim = shop.offers.find((o) => o._offerKind === "stim");
  assert.ok(gear);
  assert.ok(stim);
  assert.equal(gear.haggle_eligible, true);
  assert.equal(isOfferHaggleEligible(gear), true);
  assert.equal(stim.haggle_eligible, false);
  assert.equal(isOfferHaggleEligible(stim), false);
  const stimAttempt = applyOfferHaggle(stim, () => 0);
  assert.equal(stimAttempt.ok, false);
  assert.equal(stimAttempt.code, "SHOP_HAGGLE_INELIGIBLE");

  const contra = generateContrabandOffer({
    playerLevel: 40,
    rng: mulberry32(8),
    createGear: cheapGear,
    generationId: "c-haggle",
  });
  assert.equal(contra.haggle_eligible, false);
  assert.equal(isOfferHaggleEligible(contra), false);
  const contraAttempt = applyOfferHaggle(contra, () => 0);
  assert.equal(contraAttempt.ok, false);
  assert.equal(contraAttempt.code, "SHOP_HAGGLE_INELIGIBLE");
});

function fixtureGearOffer(overrides = {}) {
  return {
    type: "weapon",
    _offerKind: "gear",
    rarity: "epic",
    haggle_eligible: true,
    haggle_attempted: false,
    haggle_success: false,
    haggle_discount_pct: 0,
    yanked: false,
    cost: 20000,
    _cost: 20000,
    haggle_base_cost: 20000,
    nova_cost: 0,
    haggle_base_nova: 0,
    sell_value: 100,
    contraband: false,
    _hotDeal: false,
    origin: "market",
    ...overrides,
  };
}

function seqRng(values) {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i += 1;
    return v;
  };
}

test("Haggle 40% without Nova / 30% with snapshotted Nova; named constants", () => {
  assert.equal(MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD, 0.4);
  assert.equal(MARKET_HAGGLE_SUCCESS_CHANCE_NOVA, 0.3);
  assert.equal(MARKET_HAGGLE_SUCCESS_CHANCE, MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD);
  assert.equal(MARKET_HAGGLE_DISCOUNT_MIN_PERCENT, 10);
  assert.equal(MARKET_HAGGLE_DISCOUNT_MAX_PERCENT, 20);
  assert.equal(marketHaggleSuccessChance(0), MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD);
  assert.equal(marketHaggleSuccessChance(50), MARKET_HAGGLE_SUCCESS_CHANCE_NOVA);

  assert.equal(resolveMarketHaggle(() => 0, 0).success, true);
  assert.equal(resolveMarketHaggle(() => 0.399999, 0).success, true);
  assert.equal(resolveMarketHaggle(() => 0.4, 0).success, false);
  assert.equal(resolveMarketHaggle(() => 0.99, 0).success, false);

  assert.equal(resolveMarketHaggle(() => 0, 50).success, true);
  assert.equal(resolveMarketHaggle(() => 0.299999, 50).success, true);
  assert.equal(resolveMarketHaggle(() => 0.3, 50).success, false);
  assert.equal(resolveMarketHaggle(() => 0.399999, 50).success, false);

  const noNovaWin = applyOfferHaggle(fixtureGearOffer(), seqRng([0.399999, 0.5]));
  assert.equal(noNovaWin.success, true);
  const noNovaLose = applyOfferHaggle(fixtureGearOffer(), () => 0.4);
  assert.equal(noNovaLose.success, false);
  assert.equal(noNovaLose.yanked, true);

  const novaWin = applyOfferHaggle(
    fixtureGearOffer({ nova_cost: 50, haggle_base_nova: 50 }),
    seqRng([0.299999, 0.5]),
  );
  assert.equal(novaWin.success, true);
  const novaLoseAtForty = applyOfferHaggle(
    fixtureGearOffer({ nova_cost: 50, haggle_base_nova: 50 }),
    () => 0.399999,
  );
  assert.equal(novaLoseAtForty.success, false);
  assert.equal(novaLoseAtForty.yanked, true);
});

test("Successful Haggle: one 10–20% roll applied to Stardust and Nova; Nova 0.5 quantize; vendor floor", () => {
  const listing = 1000;
  const vendor = 400;
  const discounted = applyHaggleDiscountToPrice(listing, vendor, 20);
  assert.ok(discounted > vendor);
  assert.equal(discounted, 800);
  const tight = applyHaggleDiscountToPrice(10, 9, 20);
  assert.equal(tight, 9 + MARKET_HAGGLE_VENDOR_FLOOR_OFFSET);

  assert.equal(applyHaggleDiscountToNova(50, 13), quantizeNova(50 * 0.87));
  assert.equal(applyHaggleDiscountToNova(50, 15), 42.5);
  assert.equal(applyHaggleDiscountToNova(25, 13), quantizeNova(21.75));

  const rolled = applyOfferHaggle(
    fixtureGearOffer({ nova_cost: 50, haggle_base_nova: 50, sell_value: 100 }),
    seqRng([0, 0.5]),
  );
  assert.equal(rolled.success, true);
  assert.equal(rolled.discountPercent, 15);
  assert.equal(rolled.offer.cost, applyHaggleDiscountToPrice(20000, 100, 15));
  assert.equal(rolled.offer.nova_cost, applyHaggleDiscountToNova(50, 15));
  assert.equal(rolled.offer.nova_cost, 42.5);
  assert.equal(rolled.offer.haggle_base_cost, 20000);
  assert.equal(rolled.offer.haggle_base_nova, 50);
  assert.equal(rolled.offer.haggle_discount_pct, 15);

  const again = applyOfferHaggle(rolled.offer, () => 0);
  assert.equal(again.ok, false);
  assert.equal(again.code, "SHOP_ALREADY_HAGGLED");
  assert.equal(rolled.offer.cost, applyHaggleDiscountToPrice(20000, 100, 15));
  assert.equal(rolled.offer.nova_cost, 42.5);
});

test("Failed Haggle yanks; no price change; retry cannot haggle", () => {
  const offer = fixtureGearOffer({ nova_cost: 25, haggle_base_nova: 25 });
  const failed = applyOfferHaggle(offer, () => 0.99);
  assert.equal(failed.success, false);
  assert.equal(failed.yanked, true);
  assert.equal(failed.offer.cost, offer.cost);
  assert.equal(failed.offer.nova_cost, 25);
  assert.equal(failed.offer.yanked, true);
  assert.equal(failed.offer.haggle_attempted, true);
  const retry = applyOfferHaggle(failed.offer, () => 0);
  assert.equal(retry.ok, false);
  assert.equal(retry.code, "SHOP_ALREADY_HAGGLED");
});

test("Haggle stress: observed rates, discount range, Nova 0.5, fail never purchasable", () => {
  const trials = 20000;
  let noNovaHits = 0;
  let novaHits = 0;
  for (let i = 0; i < trials; i++) {
    const noNova = applyOfferHaggle(fixtureGearOffer(), mulberry32(i + 1));
    if (noNova.success) {
      noNovaHits += 1;
      assert.ok(noNova.discountPercent >= 10 && noNova.discountPercent <= 20);
      assert.equal(noNova.offer.yanked, false);
      assert.equal(noNova.offer.haggle_eligible, false);
    } else {
      assert.equal(noNova.yanked, true);
      assert.equal(noNova.offer.yanked, true);
      assert.equal(noNova.offer.cost, 20000);
      assert.equal(noNova.offer.nova_cost, 0);
    }

    const withNova = applyOfferHaggle(
      fixtureGearOffer({ nova_cost: 25, haggle_base_nova: 25 }),
      mulberry32(i + 100_003),
    );
    if (withNova.success) {
      novaHits += 1;
      assert.ok(withNova.discountPercent >= 10 && withNova.discountPercent <= 20);
      assert.equal(withNova.offer.nova_cost, applyHaggleDiscountToNova(25, withNova.discountPercent));
      assert.equal(withNova.offer.nova_cost, quantizeNova(withNova.offer.nova_cost));
      assert.equal(withNova.offer.cost, applyHaggleDiscountToPrice(20000, 100, withNova.discountPercent));
    } else {
      assert.equal(withNova.yanked, true);
      assert.equal(withNova.offer.yanked, true);
      assert.equal(withNova.offer.cost, 20000);
      assert.equal(withNova.offer.nova_cost, 25);
    }
  }
  const noNovaRate = noNovaHits / trials;
  const novaRate = novaHits / trials;
  assert.ok(
    Math.abs(noNovaRate - MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD) < 0.02,
    `no-Nova rate ${noNovaRate}`,
  );
  assert.ok(
    Math.abs(novaRate - MARKET_HAGGLE_SUCCESS_CHANCE_NOVA) < 0.02,
    `Nova rate ${novaRate}`,
  );
  console.log(
    `    stress n=${trials} noNova=${noNovaRate.toFixed(4)} nova=${novaRate.toFixed(4)}`,
  );
});

if (failed) {
  console.error(`\nPhase 6 pricing: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nPhase 6 pricing: ${passed} passed`);
