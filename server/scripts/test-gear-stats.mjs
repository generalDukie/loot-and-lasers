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
  allocateLegendaryClassBudget,
  legendaryOffStatIntegerCap,
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
  classGearStatRoles,
  itemStatDisplayOrder,
  CLASS_ARCHETYPE_BY_NAME,
  EQUIPMENT_SLOTS,
  GEAR_STAT_POOL_DESIRABLE,
  GEAR_STAT_POOL_PARTIAL_A,
  GEAR_STAT_POOL_PARTIAL_B,
  LEGENDARY_DESIRABLE_OFF_SHARE_BPS,
  LEGENDARY_PARTIAL_A_OFF_SHARE_BPS,
  LEGENDARY_PARTIAL_B_OFF_SHARE_BPS,
} from "../../src/lib/itemGeneration.js";

/** Reference C4 curve — must mirror BaseGearStatBudget exactly (round-half-up). */
const c4Budget = (L) =>
  Math.max(1, Math.trunc(Math.floor(GEAR_BUDGET_LINEAR * L + GEAR_BUDGET_CURVE * Math.sqrt(L) + GEAR_BUDGET_FLOOR + 0.5)));
import { GearSaleValue } from "../../src/lib/stardustEconomy.js";
import {
  applyGearStatBudgetVariance,
  gearResaleValue,
  BASIS_POINTS_DENOMINATOR,
  roundHalfUp,
  GEAR_STAT_BUDGET_VARIANCE_MIN,
  GEAR_STAT_BUDGET_VARIANCE_MAX,
  LEGENDARY_OFF_STAT_CAP_SHARE,
  LEGENDARY_MANDATORY_STAT_SHARE,
  LEGENDARY_REQUIRED_STAT_COUNT,
} from "../../src/lib/productionMath/index.js";
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

test("directed pools pick class-relative stats", () => {
  const vanguard = classGearStatRoles("Vanguard");
  const techno = classGearStatRoles("Technomancer");
  assert.deepEqual(vanguard.desirable.sort(), ["luck", "strength", "vitality"]);
  assert.deepEqual(vanguard.offs.sort(), ["agility", "intellect"]);
  assert.deepEqual(techno.desirable.sort(), ["intellect", "luck", "vitality"]);
  assert.deepEqual(techno.offs.sort(), ["agility", "strength"]);

  const commonDes = selectItemAttributes("common", seqRng([0, 0, 0]), {
    className: "Vanguard",
    statPool: GEAR_STAT_POOL_DESIRABLE,
  });
  assert.equal(commonDes.attrs.length, 1);
  assert.ok(vanguard.desirable.includes(commonDes.attrs[0]));
  assert.equal(commonDes.poolMode, GEAR_STAT_POOL_DESIRABLE);

  const commonA = selectItemAttributes("common", seqRng([0, 0, 0]), {
    className: "Vanguard",
    statPool: GEAR_STAT_POOL_PARTIAL_A,
  });
  assert.equal(commonA.attrs.length, 1);
  assert.ok(vanguard.offs.includes(commonA.attrs[0]));

  const uncommonDes = selectItemAttributes("uncommon", seqRng([0, 0, 0, 0]), {
    className: "Vanguard",
    statPool: GEAR_STAT_POOL_DESIRABLE,
  });
  assert.equal(uncommonDes.attrs.length, 2);
  for (const attr of uncommonDes.attrs) assert.ok(vanguard.desirable.includes(attr));

  const uncommonA = selectItemAttributes("uncommon", seqRng([0, 0, 0, 0]), {
    className: "Technomancer",
    statPool: GEAR_STAT_POOL_PARTIAL_A,
  });
  assert.equal(uncommonA.attrs.length, 2);
  const uncommonOffs = uncommonA.attrs.filter((a) => techno.offs.includes(a));
  const uncommonDesirable = uncommonA.attrs.filter((a) => techno.desirable.includes(a));
  assert.equal(uncommonOffs.length, 1);
  assert.equal(uncommonDesirable.length, 1);

  const rareDes = selectItemAttributes("rare", seqRng([0.1]), {
    className: "Vanguard",
    statPool: GEAR_STAT_POOL_DESIRABLE,
  });
  assert.deepEqual([...rareDes.attrs].sort(), [...vanguard.desirable].sort());

  const rareA = selectItemAttributes("rare", seqRng([0, 0, 0, 0, 0]), {
    className: "Vanguard",
    statPool: GEAR_STAT_POOL_PARTIAL_A,
  });
  assert.equal(rareA.attrs.filter((a) => vanguard.offs.includes(a)).length, 1);
  assert.equal(rareA.attrs.filter((a) => vanguard.desirable.includes(a)).length, 2);

  const rareB = selectItemAttributes("rare", seqRng([0, 0, 0, 0, 0]), {
    className: "Vanguard",
    statPool: GEAR_STAT_POOL_PARTIAL_B,
  });
  assert.deepEqual(
    [...rareB.attrs.filter((a) => vanguard.offs.includes(a))].sort(),
    [...vanguard.offs].sort(),
  );
  assert.equal(rareB.attrs.filter((a) => vanguard.desirable.includes(a)).length, 1);

  const epicB = selectItemAttributes("epic", seqRng([0.2, 0.4]), {
    className: "Technomancer",
    statPool: GEAR_STAT_POOL_PARTIAL_B,
  });
  assert.equal(epicB.attrs.length, 3);
  assert.deepEqual(
    [...epicB.attrs.filter((a) => techno.offs.includes(a))].sort(),
    [...techno.offs].sort(),
  );

  const leg = selectItemAttributes("legendary", seqRng([0.1]), {
    className: "Vanguard",
    statPool: GEAR_STAT_POOL_DESIRABLE,
  });
  assert.equal(leg.attrs.length, 5);
  assert.equal(leg.poolMode, GEAR_STAT_POOL_DESIRABLE);
});

test("item stat display order is primary, vitality, luck, then remaining Str/Agi/Int", () => {
  assert.deepEqual(itemStatDisplayOrder("Vanguard"), [
    "strength",
    "vitality",
    "luck",
    "agility",
    "intellect",
  ]);
  assert.deepEqual(itemStatDisplayOrder("Astral Warden"), itemStatDisplayOrder("Vanguard"));
  assert.deepEqual(itemStatDisplayOrder("Shadow Operative"), [
    "agility",
    "vitality",
    "luck",
    "strength",
    "intellect",
  ]);
  assert.deepEqual(itemStatDisplayOrder("Void Runner"), itemStatDisplayOrder("Shadow Operative"));
  assert.deepEqual(itemStatDisplayOrder("Technomancer"), [
    "intellect",
    "vitality",
    "luck",
    "strength",
    "agility",
  ]);
  assert.deepEqual(itemStatDisplayOrder("Cosmic Engineer"), itemStatDisplayOrder("Technomancer"));
});

test("partial B rejected on common and uncommon", () => {
  assert.throws(() =>
    selectItemAttributes("common", Math.random, {
      className: "Vanguard",
      statPool: GEAR_STAT_POOL_PARTIAL_B,
    }),
  );
  assert.throws(() =>
    selectItemAttributes("uncommon", Math.random, {
      className: "Vanguard",
      statPool: GEAR_STAT_POOL_PARTIAL_B,
    }),
  );
  assert.throws(() =>
    selectItemAttributes("rare", Math.random, { statPool: GEAR_STAT_POOL_DESIRABLE }),
  );
});

test("legendary directed pools pin offs and dump remainder into desirable", () => {
  const roles = classGearStatRoles("Vanguard");
  const cases = [
    [GEAR_STAT_POOL_DESIRABLE, LEGENDARY_DESIRABLE_OFF_SHARE_BPS],
    [GEAR_STAT_POOL_PARTIAL_A, LEGENDARY_PARTIAL_A_OFF_SHARE_BPS],
    [GEAR_STAT_POOL_PARTIAL_B, LEGENDARY_PARTIAL_B_OFF_SHARE_BPS],
  ];
  for (const [pool, offBps] of cases) {
    const rolled = rollItemStats({
      itemLevel: 100,
      type: "armor",
      rarity: "legendary",
      className: "Vanguard",
      statPool: pool,
      statBudgetVariance: 1,
      rng: seqRng([0.15, 0.35, 0.55, 0.75, 0.22, 0.44, 0.66, 0.88]),
    });
    const total = rolled.targetBudget;
    const minEach = Math.floor(total * getRarityMinStatShare("legendary"));
    const offCap = legendaryOffStatIntegerCap(total);
    let expectedOff = minEach;
    if (offBps > LEGENDARY_DESIRABLE_OFF_SHARE_BPS) {
      expectedOff = Math.max(
        minEach,
        roundHalfUp((total * offBps) / BASIS_POINTS_DENOMINATOR),
      );
    }
    expectedOff = Math.min(expectedOff, Math.max(minEach, offCap));
    const sum = Object.values(rolled.stats).reduce((a, b) => a + b, 0);
    assert.equal(sum, total, pool);
    assert.equal(Object.keys(rolled.stats).length, ITEM_ATTR_KEYS.length);
    for (const key of roles.offs) {
      assert.equal(rolled.stats[key], expectedOff, `${pool} ${key}`);
    }
    for (const key of roles.desirable) {
      assert.ok(rolled.stats[key] >= minEach, `${pool} ${key}`);
    }
  }
});

test("rare directed pools keep the 20% floor", () => {
  for (const pool of [GEAR_STAT_POOL_DESIRABLE, GEAR_STAT_POOL_PARTIAL_A, GEAR_STAT_POOL_PARTIAL_B]) {
    const rolled = rollItemStats({
      itemLevel: 100,
      type: "armor",
      rarity: "rare",
      className: "Technomancer",
      statPool: pool,
      statBudgetVariance: 1,
      rng: seqRng([0.11, 0.31, 0.51, 0.71, 0.21, 0.41, 0.61, 0.81]),
    });
    const minEach = Math.floor(rolled.targetBudget * 0.2);
    const vals = Object.values(rolled.stats);
    assert.equal(vals.length, 3, pool);
    for (const v of vals) assert.ok(v >= minEach, `${pool} ${v} < ${minEach}`);
    assert.equal(vals.reduce((a, b) => a + b, 0), rolled.targetBudget);
  }
});

const LEGENDARY_OFF_CAP_REFERENCE_BUDGET = 150;
const LEGENDARY_OFF_CAP_REFERENCE_CLASS = "Cosmic Engineer";
const LEGENDARY_OFF_CAP_STRESS_ROLLS = 10_000;
const LEGENDARY_OFF_CAP_STRESS_SEED = 20_260_901;
const LEGENDARY_OFF_CAP_TEST_LEVELS = Object.freeze([1, 25, 50, 100, 200, 500]);
const LEGENDARY_OFF_CAP_TEST_VARIANCES = Object.freeze([
  GEAR_STAT_BUDGET_VARIANCE_MIN,
  (GEAR_STAT_BUDGET_VARIANCE_MIN + GEAR_STAT_BUDGET_VARIANCE_MAX) / 2,
  GEAR_STAT_BUDGET_VARIANCE_MAX,
]);
const LEGENDARY_OFF_CAP_FRACTIONAL_BUDGETS = Object.freeze([
  7, 11, 17, 23, 101, 149, 151, 157, 200,
]);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function legendaryAllocationViolations(stats, className, total) {
  const roles = classGearStatRoles(className);
  const cap = legendaryOffStatIntegerCap(total);
  const minEach = Math.floor(total * getRarityMinStatShare("legendary"));
  let violations = 0;
  const sum = ITEM_ATTR_KEYS.reduce((acc, key) => acc + Number(stats[key] || 0), 0);
  if (sum !== total) violations += 1;
  if (Object.keys(stats).length !== LEGENDARY_REQUIRED_STAT_COUNT) violations += 1;
  for (const key of ITEM_ATTR_KEYS) {
    const value = Number(stats[key] || 0);
    if (!Number.isInteger(value) || value < minEach) violations += 1;
  }
  for (const key of roles.offs) {
    if (Number(stats[key] || 0) > cap) violations += 1;
  }
  return violations;
}

test("legendary off-stat integer cap is floor(T × 17.5%)", () => {
  assert.equal(LEGENDARY_OFF_STAT_CAP_SHARE, 0.175);
  assert.equal(LEGENDARY_MANDATORY_STAT_SHARE, 0.1);
  assert.equal(
    legendaryOffStatIntegerCap(LEGENDARY_OFF_CAP_REFERENCE_BUDGET),
    Math.floor(LEGENDARY_OFF_CAP_REFERENCE_BUDGET * LEGENDARY_OFF_STAT_CAP_SHARE),
  );
  assert.equal(legendaryOffStatIntegerCap(LEGENDARY_OFF_CAP_REFERENCE_BUDGET), 26);
  for (const total of LEGENDARY_OFF_CAP_FRACTIONAL_BUDGETS) {
    assert.equal(
      legendaryOffStatIntegerCap(total),
      Math.floor(total * LEGENDARY_OFF_STAT_CAP_SHARE),
      `T=${total}`,
    );
  }
});

test("T=150 Cosmic Engineer Legendary caps STR and AGI at 26", () => {
  const roles = classGearStatRoles(LEGENDARY_OFF_CAP_REFERENCE_CLASS);
  assert.deepEqual([...roles.offs].sort(), ["agility", "strength"]);
  const overflowRng = seqRng([
    0.999, 1e-12, 1e-12, 1e-12, 1e-12, 0.5, 0.5, 0.5, 0.5, 0.5,
  ]);
  const stats = allocateLegendaryClassBudget(
    LEGENDARY_OFF_CAP_REFERENCE_BUDGET,
    overflowRng,
    LEGENDARY_OFF_CAP_REFERENCE_CLASS,
  );
  const cap = legendaryOffStatIntegerCap(LEGENDARY_OFF_CAP_REFERENCE_BUDGET);
  assert.equal(cap, 26);
  assert.equal(legendaryAllocationViolations(
    stats,
    LEGENDARY_OFF_CAP_REFERENCE_CLASS,
    LEGENDARY_OFF_CAP_REFERENCE_BUDGET,
  ), 0);
  assert.ok(stats.strength <= cap, `STR ${stats.strength}`);
  assert.ok(stats.agility <= cap, `AGI ${stats.agility}`);
  const minEach = Math.floor(
    LEGENDARY_OFF_CAP_REFERENCE_BUDGET * getRarityMinStatShare("legendary"),
  );
  for (const key of ITEM_ATTR_KEYS) {
    assert.ok(stats[key] >= minEach, `${key} ${stats[key]}`);
  }
  const sum = ITEM_ATTR_KEYS.reduce((acc, key) => acc + stats[key], 0);
  assert.equal(sum, LEGENDARY_OFF_CAP_REFERENCE_BUDGET);
});

test("legendary off-stat cap holds across classes, slots, levels, and ±10% variance", () => {
  const classes = Object.keys(CLASS_ARCHETYPE_BY_NAME);
  let rolls = 0;
  let violations = 0;
  for (const className of classes) {
    for (const slot of EQUIPMENT_SLOTS) {
      for (const level of LEGENDARY_OFF_CAP_TEST_LEVELS) {
        for (const variance of LEGENDARY_OFF_CAP_TEST_VARIANCES) {
          const rng = seqRng([
            (rolls * 0.017 + 0.11) % 1,
            (rolls * 0.031 + 0.23) % 1,
            (rolls * 0.053 + 0.41) % 1,
            (rolls * 0.071 + 0.59) % 1,
            (rolls * 0.089 + 0.73) % 1,
            (rolls * 0.101 + 0.07) % 1,
            (rolls * 0.127 + 0.29) % 1,
            (rolls * 0.149 + 0.47) % 1,
          ]);
          const rolled = rollItemStats({
            itemLevel: level,
            type: slot,
            rarity: "legendary",
            className,
            statBudgetVariance: variance,
            rng,
          });
          rolls += 1;
          violations += legendaryAllocationViolations(
            rolled.stats,
            className,
            rolled.targetBudget,
          );
        }
      }
    }
  }
  assert.equal(rolls, classes.length * EQUIPMENT_SLOTS.length
    * LEGENDARY_OFF_CAP_TEST_LEVELS.length * LEGENDARY_OFF_CAP_TEST_VARIANCES.length);
  assert.equal(violations, 0, `matrix violations ${violations} / ${rolls}`);
});

test("legendary off-stat cap stress produces zero violations", () => {
  const classes = Object.keys(CLASS_ARCHETYPE_BY_NAME);
  const rng = mulberry32(LEGENDARY_OFF_CAP_STRESS_SEED);
  let violations = 0;
  for (let i = 0; i < LEGENDARY_OFF_CAP_STRESS_ROLLS; i++) {
    const className = classes[i % classes.length];
    const slot = EQUIPMENT_SLOTS[i % EQUIPMENT_SLOTS.length];
    const level = LEGENDARY_OFF_CAP_TEST_LEVELS[i % LEGENDARY_OFF_CAP_TEST_LEVELS.length];
    const variance = LEGENDARY_OFF_CAP_TEST_VARIANCES[i % LEGENDARY_OFF_CAP_TEST_VARIANCES.length];
    const rolled = rollItemStats({
      itemLevel: level,
      type: slot,
      rarity: "legendary",
      className,
      statBudgetVariance: variance,
      rng,
    });
    violations += legendaryAllocationViolations(
      rolled.stats,
      className,
      rolled.targetBudget,
    );
  }
  assert.equal(violations, 0, `stress violations ${violations} / ${LEGENDARY_OFF_CAP_STRESS_ROLLS}`);
  console.log(`    stress rolls=${LEGENDARY_OFF_CAP_STRESS_ROLLS} violations=${violations}`);
});

test("integer rounding never pushes an off-stat above floor(T × cap share)", () => {
  const className = LEGENDARY_OFF_CAP_REFERENCE_CLASS;
  for (const total of LEGENDARY_OFF_CAP_FRACTIONAL_BUDGETS) {
    const cap = legendaryOffStatIntegerCap(total);
    const stats = allocateLegendaryClassBudget(
      total,
      seqRng([0.999, 1e-12, 1e-12, 1e-12, 1e-12, 0.8, 0.2, 0.4, 0.6]),
      className,
    );
    assert.equal(legendaryAllocationViolations(stats, className, total), 0, `T=${total}`);
    for (const key of classGearStatRoles(className).offs) {
      assert.ok(stats[key] <= cap, `T=${total} ${key}=${stats[key]} cap=${cap}`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
