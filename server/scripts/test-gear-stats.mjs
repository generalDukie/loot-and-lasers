/**
 * Gear BaseGearStatBudget + allocation tests (Restoration 07).
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-gear-stats.mjs
 */
import assert from "node:assert/strict";
import {
  BaseGearStatBudget,
  getItemStatBudget,
  getSlotMultiplier,
  getRarityBudgetMultiplier,
  getRarityAttributeCount,
  getRarityMinStatShare,
  selectItemAttributes,
  allocateStatBudget,
  rollItemStats,
  GenerateGearItem,
  GetGearSlotMultiplier,
  GetGearRarityStatMultiplier,
  GEAR_BUDGET_LINEAR,
  GEAR_BUDGET_CURVE,
  GEAR_BUDGET_FLOOR,
  ITEM_ATTR_KEYS,
  FAVORED_POOL_CHANCE,
  computeItemVendorValue,
} from "../../src/lib/itemGeneration.js";

/** Reference C4 curve — must mirror BaseGearStatBudget exactly (round-half-up). */
const c4Budget = (L) =>
  Math.max(1, Math.trunc(Math.floor(GEAR_BUDGET_LINEAR * L + GEAR_BUDGET_CURVE * Math.sqrt(L) + GEAR_BUDGET_FLOOR + 0.5)));
import { GearSaleValue } from "../../src/lib/stardustEconomy.js";
import { applyGearStatBudgetVariance, gearResaleValue } from "../../src/lib/productionMath/index.js";
import { randomItem } from "../src/shared/rewards.js";

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

function seqRng(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

console.log("\nGear stat budget / allocation tests\n");

test("BaseGearStatBudget matches C4 continuous formula", () => {
  // Formula is authoritative — assert the function equals it exactly.
  for (const L of [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 700, 1000, 2000]) {
    assert.equal(BaseGearStatBudget(L), c4Budget(L), `L${L}`);
  }
  // Near-exact reproduction of the intended targets (L1 exact; ≤7% elsewhere).
  const targets = { 1: 12, 10: 29, 25: 57, 50: 98, 100: 167, 200: 303, 300: 468, 400: 632, 500: 795 };
  assert.equal(BaseGearStatBudget(1), 12);
  for (const [L, t] of Object.entries(targets)) {
    const pct = Math.abs(BaseGearStatBudget(Number(L)) - t) / t;
    assert.ok(pct <= 0.08, `L${L} within 8% of target (got ${pct * 100}%)`);
  }
});

test("BaseGearStatBudget monotone, integer, infinitely scaling", () => {
  let prev = BaseGearStatBudget(1);
  for (let L = 2; L <= 2000; L++) {
    const v = BaseGearStatBudget(L);
    assert.equal(v, Math.round(v));
    assert.ok(v >= prev, `L${L}`);
    prev = v;
  }
});

test("BaseGearStatBudget is continuous past 500 (no breakpoint / cap)", () => {
  // Same single formula everywhere — no Level-500 seam, no post-500 fallback.
  for (const L of [499, 500, 501, 600, 700, 1000, 5000]) {
    assert.equal(BaseGearStatBudget(L), c4Budget(L), `L${L}`);
  }
  // Local slope stays smooth across the old 500 seam (no sudden jump).
  const s499 = BaseGearStatBudget(500) - BaseGearStatBudget(499);
  const s501 = BaseGearStatBudget(502) - BaseGearStatBudget(501);
  assert.ok(Math.abs(s499 - s501) <= 1, `slope continuous across 500 (${s499} vs ${s501})`);
  assert.ok(BaseGearStatBudget(1000) > BaseGearStatBudget(500));
});

test("slot multipliers (stat budget, once)", () => {
  assert.equal(getSlotMultiplier("armor"), 1);
  assert.equal(getSlotMultiplier("helmet"), 1);
  assert.equal(getSlotMultiplier("weapon"), 1.2);
  assert.equal(getSlotMultiplier("ship_module"), 1.2);
  assert.equal(GetGearSlotMultiplier("weapon"), 1.2);
});

test("rarity total budgets at L100", () => {
  const b100 = BaseGearStatBudget(100); // C4: 172
  assert.equal(b100, 172);
  assert.equal(getItemStatBudget(100, "armor", "common"), Math.round(b100 * 0.7));
  assert.equal(getItemStatBudget(100, "armor", "uncommon"), Math.round(b100 * 0.85));
  assert.equal(getItemStatBudget(100, "armor", "rare"), b100);
  assert.equal(getItemStatBudget(100, "armor", "epic"), Math.round(b100 * 1.2));
  assert.equal(getItemStatBudget(100, "armor", "legendary"), Math.round(b100 * 1.5));
  assert.equal(getItemStatBudget(100, "weapon", "legendary"), Math.round(b100 * 1.2 * 1.5));
  assert.equal(getItemStatBudget(100, "accessory", "legendary"), Math.round(b100 * 1.5));
  assert.equal(GetGearRarityStatMultiplier("legendary"), 1.5);
  assert.notEqual(GetGearRarityStatMultiplier("legendary"), 1.35);
  assert.notEqual(GetGearRarityStatMultiplier("legendary"), 1.75);
});

test("stat counts by rarity + unique attrs", () => {
  assert.equal(getRarityAttributeCount("common"), 1);
  assert.equal(getRarityAttributeCount("uncommon"), 2);
  assert.equal(getRarityAttributeCount("rare"), 3);
  assert.equal(getRarityAttributeCount("epic"), 3);
  assert.equal(getRarityAttributeCount("legendary"), 5);
  const leg = selectItemAttributes("legendary", () => 0.5);
  assert.equal(leg.attrs.length, 5);
  assert.deepEqual([...leg.attrs].sort(), [...ITEM_ATTR_KEYS].sort());
  const rare = selectItemAttributes("rare", seqRng([0.9, 0.1, 0.2, 0.3, 0.4, 0.5]));
  assert.equal(new Set(rare.attrs).size, rare.attrs.length);
});

test("allocation floors + exact sum", () => {
  const rarities = ["common", "uncommon", "rare", "epic", "legendary"];
  const types = ["armor", "weapon", "ship_module", "helmet"];
  for (const rarity of rarities) {
    const minShare = getRarityMinStatShare(rarity);
    for (const type of types) {
      for (let seed = 0; seed < 40; seed++) {
        const rng = seqRng([
          (seed * 0.017) % 1,
          (seed * 0.031 + 0.2) % 1,
          (seed * 0.053 + 0.4) % 1,
          (seed * 0.071 + 0.6) % 1,
          (seed * 0.089 + 0.1) % 1,
          (seed * 0.11 + 0.3) % 1,
          (seed * 0.13 + 0.5) % 1,
          (seed * 0.17 + 0.7) % 1,
        ]);
        const rolled = rollItemStats({
          itemLevel: 100,
          type,
          rarity,
          rng,
          className: null,
        });
        const pool = getItemStatBudget(100, type, rarity);
        const expected = rolled.targetBudget;
        const sum = Object.values(rolled.stats).reduce((a, b) => a + b, 0);
        assert.equal(sum, expected, `${rarity} ${type} seed ${seed}`);
        assert.equal(sum, rolled.budget);
        assert.equal(
          expected,
          Math.max(
            rolled.attributes.length,
            applyGearStatBudgetVariance(pool, rolled.statBudgetVariance),
          ),
        );
        const vals = Object.values(rolled.stats);
        assert.equal(vals.length, getRarityAttributeCount(rarity));
        assert.equal(new Set(Object.keys(rolled.stats)).size, vals.length);
        const floor = Math.floor(expected * minShare);
        let minEach = floor;
        while (minEach > 0 && minEach * vals.length > expected) minEach -= 1;
        for (const v of vals) {
          assert.ok(Number.isInteger(v));
          assert.ok(v >= minEach, `${rarity} val ${v} < ${minEach}`);
          assert.ok(v >= 0);
        }
        if (rarity === "common") {
          assert.equal(vals[0], expected);
        }
      }
    }
  }
});

test("random remainder produces varied distributions", () => {
  const seen = new Set();
  for (let seed = 0; seed < 30; seed++) {
    const rng = seqRng([
      (seed * 0.37) % 1,
      (seed * 0.61 + 0.1) % 1,
      (seed * 0.19 + 0.3) % 1,
      (seed * 0.47) % 1,
      (seed * 0.83) % 1,
      (seed * 0.29) % 1,
    ]);
    const { stats } = rollItemStats({
      itemLevel: 100,
      type: "armor",
      rarity: "legendary",
      rng,
    });
    seen.add(JSON.stringify(stats));
  }
  assert.ok(seen.size >= 5, `expected variety, got ${seen.size}`);
});

test("favored pool decided once per item (60/40)", () => {
  assert.equal(FAVORED_POOL_CHANCE, 0.6);
  const favored = selectItemAttributes("rare", seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), {
    className: "Vanguard",
  });
  assert.equal(favored.poolMode, "favored");
  for (const a of favored.attrs) {
    assert.ok(["strength", "vitality", "luck"].includes(a));
  }
  const total = selectItemAttributes("rare", seqRng([0.9, 0.1, 0.2, 0.3, 0.4, 0.5]), {
    className: "Vanguard",
  });
  assert.equal(total.poolMode, "total");
  const leg = selectItemAttributes("legendary", seqRng([0.1]), { className: "Vanguard" });
  assert.equal(leg.poolMode, "legendary");
  assert.equal(leg.attrs.length, 5);
});

test("GenerateGearItem source-independence (same inputs + RNG)", () => {
  const seeds = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88];
  const mission = GenerateGearItem({
    itemLevel: 40,
    itemType: "weapon",
    rarity: "epic",
    className: "Technomancer",
    rng: seqRng(seeds),
    generationContext: { source: "mission" },
  });
  const dungeon = GenerateGearItem({
    itemLevel: 40,
    itemType: "weapon",
    rarity: "epic",
    className: "Technomancer",
    rng: seqRng(seeds),
    generationContext: { source: "dungeon" },
  });
  const shop = GenerateGearItem({
    itemLevel: 40,
    itemType: "weapon",
    rarity: "epic",
    className: "Technomancer",
    rng: seqRng(seeds),
    generationContext: { source: "shop" },
  });
  const wormhole = GenerateGearItem({
    itemLevel: 40,
    itemType: "weapon",
    rarity: "epic",
    className: "Technomancer",
    rng: seqRng(seeds),
    generationContext: { source: "wormhole" },
  });
  assert.deepEqual(mission.stats, dungeon.stats);
  assert.deepEqual(mission.stats, shop.stats);
  assert.deepEqual(mission.stats, wormhole.stats);
  assert.equal(mission.sell_value, shop.sell_value);
  const sum = Object.values(mission.stats).reduce((a, b) => a + b, 0);
  assert.equal(sum, mission.stat_budget);
  assert.equal(
    sum,
    applyGearStatBudgetVariance(getItemStatBudget(40, "weapon", "epic"), mission.stat_budget_variance),
  );
});

test("randomItem wraps GenerateGearItem (stats parity)", () => {
  const seeds = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85];
  const a = randomItem("rare", 25, "boots", seqRng(seeds), "Void Runner", {
    source: "mission",
  });
  const b = GenerateGearItem({
    itemLevel: 25,
    itemType: "boots",
    rarity: "rare",
    className: "Void Runner",
    rng: seqRng(seeds),
  });
  assert.deepEqual(a.stats, b.stats);
  assert.equal(a.level_requirement, 25);
  assert.ok(a.name);
  assert.equal(a.type, "boots");
});

test("GenerateGearItem rejects bad inputs", () => {
  assert.throws(() =>
    GenerateGearItem({ itemLevel: 10, itemType: "consumable", rarity: "rare" }),
  );
  assert.throws(() =>
    GenerateGearItem({ itemLevel: 10, itemType: "weapon", rarity: "mythic" }),
  );
});

test("vendor logic uses production resale (sale ≠ stat mult)", () => {
  const item = { type: "weapon", rarity: "legendary", level_requirement: 100, level: 100 };
  assert.equal(computeItemVendorValue(item), gearResaleValue(100, "weapon", "legendary"));
  assert.notEqual(computeItemVendorValue(item), GearSaleValue(item));
  assert.equal(getRarityBudgetMultiplier("legendary"), 1.5);
});

test("odd small pools reconcile exactly", () => {
  const stats = allocateStatBudget(
    ["strength", "agility", "luck"],
    7,
    () => 0.5,
    "rare",
  );
  assert.equal(Object.values(stats).reduce((a, b) => a + b, 0), 7);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
