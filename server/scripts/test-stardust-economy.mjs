/**
 * Finalized Stardust economy tests.
 * Run: node server/scripts/test-stardust-economy.mjs
 */
import assert from "node:assert/strict";
import {
  StardustPerFuel,
  AttributePurchaseCost,
  MissionStardustReward,
  ArenaWinStardust,
  MiningStardust,
  computeMiningReward,
  JunkSaleValue,
  GearSaleValue,
  missionGearDropChance,
  rollMissionGearDrop,
  rollMissionGearRarity,
  rollDungeonRegularRarity,
  rollDungeonBossRarity,
  arenaWinGrantsStardust,
  getArenaRewardedWinsState,
  STARDUST_PER_FUEL_ANCHORS,
  MISSION_GEAR_BASE_CHANCE,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_GEAR_RARITY_WEIGHTS,
  DUNGEON_REGULAR_RARITY_WEIGHTS,
  DUNGEON_BOSS_RARITY_WEIGHTS,
  ARENA_REWARDED_WINS_PER_DAY,
  MINING_EFFICIENCY,
} from "../src/shared/stardustEconomy.js";
import {
  computeMissionStardustFromFuel,
  computeArenaRewards,
  druToRewards,
  getAttributePointCost,
  getAttributePurchaseCount,
  getNextAttributePointCost,
  missionGearDropChance as formulaPity,
} from "../src/shared/economyFormulas.js";
import { computeItemVendorValue } from "../src/shared/itemGeneration.js";
import { getMissionStardustPerFuel } from "../src/shared/rewards.js";
import { miningStardustResolved, MINUTES_PER_HOUR } from "../../src/lib/productionMath/index.js";

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

console.log("\nStardust economy tests\n");

test("StardustPerFuel closed-form (Restoration 11)", () => {
  const f = (L) => {
    if (L <= 1) return 50;
    return Math.round(50 + 1.009 * (L - 1) ** 1.625 * (1 + (L / 166.66) ** 3.055));
  };
  for (const L of [1, 10, 25, 50, 100, 200, 300, 500, 1000]) {
    assert.equal(StardustPerFuel(L), f(L), `L${L}`);
    assert.equal(getMissionStardustPerFuel(L), f(L), `alias L${L}`);
  }
  // Historical anchors are no longer production authority.
  assert.ok(Array.isArray(STARDUST_PER_FUEL_ANCHORS) && STARDUST_PER_FUEL_ANCHORS.length > 0);
});

test("StardustPerFuel monotone and uncapped", () => {
  let prev = StardustPerFuel(1);
  for (let L = 2; L <= 520; L++) {
    const v = StardustPerFuel(L);
    assert.ok(v >= prev, `L${L}: ${v} < ${prev}`);
    prev = v;
  }
  assert.ok(StardustPerFuel(1000) > StardustPerFuel(500));
});

test("MissionStardust = SD/F * fuel", () => {
  const rate50 = StardustPerFuel(50);
  assert.equal(MissionStardustReward(50, 5), rate50 * 5);
  assert.equal(computeMissionStardustFromFuel(5, 50, 1), rate50 * 5);
  assert.equal(MissionStardustReward(1, 2), 100);
});

test("Mission gear pity ladder", () => {
  assert.equal(MISSION_GEAR_BASE_CHANCE, 0.2);
  assert.equal(MISSION_GEAR_PITY_INCREMENT, 0.025);
  assert.equal(missionGearDropChance(0), 0.2);
  assert.equal(missionGearDropChance(1), 0.225);
  assert.equal(missionGearDropChance(2), 0.25);
  assert.equal(missionGearDropChance(4), 0.3);
  assert.equal(formulaPity(12), 0.5);
  assert.ok(missionGearDropChance(40) <= 1);
  assert.equal(missionGearDropChance(40), 1);
});

test("pity reset conceptually — streak 0 after success", () => {
  assert.equal(missionGearDropChance(0), 0.2);
  assert.equal(rollMissionGearDrop(0, () => 0.19), true);
  assert.equal(rollMissionGearDrop(0, () => 0.2), false);
});

test("Mission rarity weights", () => {
  assert.deepEqual(MISSION_GEAR_RARITY_WEIGHTS, {
    common: 50, uncommon: 25, rare: 15, epic: 8, legendary: 2,
  });
  const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  let i = 0;
  const seq = [];
  for (const [r, w] of Object.entries(MISSION_GEAR_RARITY_WEIGHTS)) {
    for (let k = 0; k < w; k++) seq.push(r);
  }
  // Deterministic coverage of table
  for (let n = 0; n < 100; n++) {
    const r = rollMissionGearRarity(() => (n + 0.5) / 100);
    counts[r] += 1;
  }
  assert.equal(counts.common, 50);
  assert.equal(counts.uncommon, 25);
  assert.equal(counts.rare, 15);
  assert.equal(counts.epic, 8);
  assert.equal(counts.legendary, 2);
});

test("Junk value 45% base with ±40% variance", () => {
  const missionReward = 10000;
  const baseJunk = 4500;
  assert.equal(JunkSaleValue(missionReward, () => 0), Math.round(baseJunk * 0.6)); // 2700
  assert.equal(JunkSaleValue(missionReward, () => 1), Math.round(baseJunk * 1.4)); // 6300
  assert.equal(JunkSaleValue(missionReward, () => 0.5), Math.round(baseJunk * 1.0)); // 4500
  const lo = JunkSaleValue(missionReward, () => 0);
  const hi = JunkSaleValue(missionReward, () => 1);
  assert.equal((lo + hi) / 2, baseJunk);
});

test("Gear sale values", () => {
  const rate = StardustPerFuel(50);
  assert.equal(
    GearSaleValue({ type: "armor", rarity: "rare", level_requirement: 50 }),
    Math.round(rate * 2 * 1.0 * 1.0)
  );
  assert.equal(
    GearSaleValue({ type: "armor", rarity: "epic", level_requirement: 50 }),
    Math.round(rate * 2 * 1.2)
  );
  assert.equal(
    GearSaleValue({ type: "armor", rarity: "legendary", level_requirement: 50 }),
    Math.round(rate * 2 * 1.75)
  );
  assert.equal(
    GearSaleValue({ type: "weapon", rarity: "legendary", level_requirement: 50 }),
    Math.round(rate * 2 * 1.75 * 1.2)
  );
  // Source-agnostic
  const a = GearSaleValue({ type: "boots", rarity: "rare", level_requirement: 25, from: "mission" });
  const b = GearSaleValue({ type: "boots", rarity: "rare", level_requirement: 25, from: "dungeon" });
  assert.equal(a, b);
});

test("Dungeon rewards: 0 direct Stardust", () => {
  const r = druToRewards(10, 50);
  assert.equal(r.stardust, 0);
  assert.ok(r.experience > 0);
});

test("Dungeon rarity tables", () => {
  assert.deepEqual(DUNGEON_REGULAR_RARITY_WEIGHTS, {
    uncommon: 40, rare: 30, epic: 20, legendary: 10,
  });
  assert.deepEqual(DUNGEON_BOSS_RARITY_WEIGHTS, { epic: 70, legendary: 30 });
  for (let n = 0; n < 100; n++) {
    const r = rollDungeonRegularRarity(() => (n + 0.5) / 100);
    assert.notEqual(r, "common");
  }
  for (let n = 0; n < 100; n++) {
    const r = rollDungeonBossRarity(() => (n + 0.5) / 100);
    assert.ok(r === "epic" || r === "legendary");
  }
});

test("Arena first 10 wins/day", () => {
  assert.equal(ARENA_REWARDED_WINS_PER_DAY, 10);
  const sd50 = StardustPerFuel(50);
  assert.equal(ArenaWinStardust(50), Math.round(2.25 * sd50));
  assert.equal(arenaWinGrantsStardust(0), true);
  assert.equal(arenaWinGrantsStardust(9), true);
  assert.equal(arenaWinGrantsStardust(10), false);
  const loss = computeArenaRewards({ level: 50, arena_rating: 1000 }, { arena_rating: 1000 }, false, {
    free: true, rewardedWinsToday: 0,
  });
  assert.equal(loss.stardust, 0);
  const win11 = computeArenaRewards({ level: 50, arena_rating: 1000 }, { arena_rating: 1000 }, true, {
    free: true, rewardedWinsToday: 10,
  });
  assert.equal(win11.stardust, 0);
  const win1 = computeArenaRewards({ level: 50, arena_rating: 1000 }, { arena_rating: 1000 }, true, {
    free: false, rewardedWinsToday: 0,
  });
  assert.equal(win1.stardust, ArenaWinStardust(50));
  assert.equal(win1.experience, 0); // paid fight: XP still free-gated
  const state = getArenaRewardedWinsState({ arena_rewarded_wins_today: 3, arena_rewarded_wins_date: "2026-01-01" }, "2026-01-02");
  assert.equal(state.wins, 0);
});

test("Mining 3% efficiency", () => {
  assert.equal(MINING_EFFICIENCY, 0.03);
  assert.equal(MiningStardust(50, 1), miningStardustResolved({ snapshotLevel: 50, minutes: 1 }));
  assert.equal(
    computeMiningReward(50, 1),
    miningStardustResolved({ snapshotLevel: 50, minutes: MINUTES_PER_HOUR }),
  );
});

test("Attribute purchase Horner costs + independent per-stat intro mapping", () => {
  assert.equal(AttributePurchaseCost(1), 100);
  assert.equal(AttributePurchaseCost(10), 112);
  assert.equal(AttributePurchaseCost(50), 260);
  assert.equal(AttributePurchaseCost(650), 111517);
  assert.equal(getAttributePointCost(1), 10);
  assert.equal(getAttributePointCost(5), 80);
  assert.equal(getAttributePointCost(6), AttributePurchaseCost(1));
  assert.equal(getAttributePointCost(15), AttributePurchaseCost(10));
  assert.equal(getAttributePointCost(55), AttributePurchaseCost(50));
  assert.equal(getAttributePointCost(655), AttributePurchaseCost(650));
  assert.ok(AttributePurchaseCost(651) > AttributePurchaseCost(650));
  const ch = {
    class: "Vanguard",
    stats: { strength: 15, agility: 8, intellect: 6, vitality: 14, luck: 7 },
    attribute_purchases_by_stat: { strength: 200, agility: 50, intellect: 0, vitality: 0, luck: 0 },
  };
  assert.equal(getAttributePurchaseCount(ch, "strength"), 200);
  assert.equal(getAttributePurchaseCount(ch, "agility"), 50);
  assert.equal(getAttributePurchaseCount(ch), 250);
  assert.notEqual(getNextAttributePointCost(ch, "strength"), getNextAttributePointCost(ch, "agility"));
  assert.equal(getNextAttributePointCost(ch, "strength"), getAttributePointCost(201));
  assert.equal(getNextAttributePointCost(ch, "agility"), getAttributePointCost(51));
  assert.equal(getNextAttributePointCost(ch, "intellect"), 10);
  assert.equal(getNextAttributePointCost(ch, "strength"), AttributePurchaseCost(196));
  assert.equal(getNextAttributePointCost(ch, "agility"), AttributePurchaseCost(46));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
