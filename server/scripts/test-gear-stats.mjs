/**
 * Gear BaseGearStatBudget + allocation tests.
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
  BASE_GEAR_STAT_BUDGET_ANCHORS,
  ITEM_ATTR_KEYS,
  computeItemVendorValue,
} from "../../src/lib/itemGeneration.js";
import { GearSaleValue } from "../../src/lib/stardustEconomy.js";

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

test("BaseGearStatBudget anchors exact", () => {
  for (const [L, v] of BASE_GEAR_STAT_BUDGET_ANCHORS) {
    assert.equal(BaseGearStatBudget(L), v, `L${L}`);
  }
});

test("BaseGearStatBudget monotone and in-band", () => {
  let prev = BaseGearStatBudget(1);
  for (let L = 2; L <= 520; L++) {
    const v = BaseGearStatBudget(L);
    assert.equal(v, Math.round(v));
    assert.ok(v >= prev, `L${L}`);
    prev = v;
  }
  for (let i = 0; i < BASE_GEAR_STAT_BUDGET_ANCHORS.length - 1; i++) {
    const [x0, y0] = BASE_GEAR_STAT_BUDGET_ANCHORS[i];
    const [x1, y1] = BASE_GEAR_STAT_BUDGET_ANCHORS[i + 1];
    for (let L = x0 + 1; L < x1; L++) {
      const v = BaseGearStatBudget(L);
      assert.ok(v >= y0 && v <= y1, `L${L}=${v}`);
    }
  }
});

test("BaseGearStatBudget >500 linear", () => {
  assert.equal(BaseGearStatBudget(600), Math.round(795 + 1.63 * 100));
  assert.equal(BaseGearStatBudget(1000), Math.round(795 + 1.63 * 500));
});

test("slot multipliers", () => {
  assert.equal(getSlotMultiplier("armor"), 1);
  assert.equal(getSlotMultiplier("weapon"), 1.2);
  assert.equal(getSlotMultiplier("ship_module"), 1.2);
});

test("rarity total budgets at L100", () => {
  assert.equal(BaseGearStatBudget(100), 167);
  assert.equal(getItemStatBudget(100, "armor", "common"), Math.round(167 * 0.7));
  assert.equal(getItemStatBudget(100, "armor", "uncommon"), Math.round(167 * 0.85));
  assert.equal(getItemStatBudget(100, "armor", "rare"), 167);
  assert.equal(getItemStatBudget(100, "armor", "epic"), Math.round(167 * 1.2));
  assert.equal(getItemStatBudget(100, "armor", "legendary"), Math.round(167 * 1.35));
  assert.equal(getItemStatBudget(100, "weapon", "legendary"), 271);
});

test("stat counts by rarity", () => {
  assert.equal(getRarityAttributeCount("common"), 1);
  assert.equal(getRarityAttributeCount("uncommon"), 2);
  assert.equal(getRarityAttributeCount("rare"), 3);
  assert.equal(getRarityAttributeCount("epic"), 3);
  assert.equal(getRarityAttributeCount("legendary"), 5);
  const leg = selectItemAttributes("legendary", () => 0.5);
  assert.equal(leg.attrs.length, 5);
  assert.deepEqual([...leg.attrs].sort(), [...ITEM_ATTR_KEYS].sort());
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
        const sum = Object.values(rolled.stats).reduce((a, b) => a + b, 0);
        assert.equal(sum, pool, `${rarity} ${type} seed ${seed}`);
        assert.equal(sum, rolled.budget);
        const vals = Object.values(rolled.stats);
        assert.equal(vals.length, getRarityAttributeCount(rarity));
        const floor = Math.floor(pool * minShare);
        // Integer floor may be reduced if n*floor > pool
        let minEach = floor;
        while (minEach > 0 && minEach * vals.length > pool) minEach -= 1;
        for (const v of vals) {
          assert.ok(v >= minEach, `${rarity} val ${v} < ${minEach}`);
        }
        if (rarity === "common") {
          assert.equal(vals[0], pool);
        }
      }
    }
  }
});

test("random remainder produces varied distributions", () => {
  const seen = new Set();
  for (let seed = 0; seed < 30; seed++) {
    const rng = seqRng([(seed * 0.37) % 1, (seed * 0.61 + 0.1) % 1, (seed * 0.19 + 0.3) % 1, (seed * 0.47) % 1, (seed * 0.83) % 1, (seed * 0.29) % 1]);
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

test("vendor logic unchanged (sale ≠ stat mult)", () => {
  const item = { type: "weapon", rarity: "legendary", level_requirement: 100 };
  assert.equal(computeItemVendorValue(item), GearSaleValue(item));
  // Stat pool uses 1.35; sale uses 1.75 — still different systems
  assert.equal(getRarityBudgetMultiplier("legendary"), 1.35);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
