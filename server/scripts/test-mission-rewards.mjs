/**
 * Restoration 11 — mission reward chain + settlement helpers.
 * Run: npm run test:mission-rewards
 */
import assert from "node:assert/strict";
import {
  settleMissionItemChain,
  missionGearItemLevel,
  MISSION_GEAR_BASE_CHANCE,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_STIM_CHANCE_AFTER_GEAR_FAIL,
  MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL,
  JUNK_MISSION_REWARD_MULTIPLIER,
  JUNK_VARIANCE_MIN,
  JUNK_VARIANCE_MAX,
  missionGearDropChance,
  JunkSaleValue,
  StardustPerFuel,
  MissionStardustReward,
  rollMissionGearRarity,
} from "../src/shared/missionRewards.js";
import {
  computeMissionXpFromFuel,
  computeMissionStardustFromFuel,
  MISSION_XP_REBALANCE,
  getMissionXpPerFuel,
} from "../src/shared/economyFormulas.js";
import { applyXpBonus } from "../src/shared/collectionBonus.js";
import { grantCharacterXp } from "../src/shared/characterProgression.js";
import { missionXpReward, roundHalfUp } from "../../src/lib/productionMath/index.js";

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

function seqRng(seq) {
  let i = 0;
  return () => (i < seq.length ? seq[i++] : 0.99);
}

function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const char = { level: 50, class: "Vanguard" };
const mission = { name: "Salvage Run", rewards: {} };

console.log("\nMission rewards tests (Restoration 11)\n");

test("XP/Fuel canonical 1:1 units + 0.85 rebalance", () => {
  assert.equal(MISSION_XP_REBALANCE, 0.85);
  const scaled = getMissionXpPerFuel(1);
  assert.equal(scaled, 100);
  assert.equal(computeMissionXpFromFuel(10, 100, 1), missionXpReward({
    fuel: 10,
    snapshotLevel: 100,
    xpVariance: 1,
  }));
  for (const L of [1, 10, 100, 200, 500, 1000]) {
    assert.ok(getMissionXpPerFuel(L) >= getMissionXpPerFuel(Math.max(1, L - 1)));
  }
});

test("Stardust closed-form + mission reward", () => {
  assert.equal(StardustPerFuel(1), 50);
  assert.equal(MissionStardustReward(1, 3), 150);
  assert.equal(MissionStardustReward(50, 2), StardustPerFuel(50) * 2);
});

test("Junk constants 0.45 and variance 0.60–1.40", () => {
  assert.equal(JUNK_MISSION_REWARD_MULTIPLIER, 0.45);
  assert.equal(JUNK_VARIANCE_MIN, 0.6);
  assert.equal(JUNK_VARIANCE_MAX, 1.4);
  const reward = 10000;
  assert.equal(JunkSaleValue(reward, () => 0), Math.round(4500 * 0.6));
  assert.equal(JunkSaleValue(reward, () => 1), Math.round(4500 * 1.4));
});

test("Gear pity ladder", () => {
  assert.equal(MISSION_GEAR_BASE_CHANCE, 0.2);
  assert.equal(MISSION_GEAR_PITY_INCREMENT, 0.025);
  assert.equal(missionGearDropChance(0), 0.2);
  assert.equal(missionGearDropChance(1), 0.225);
  assert.equal(missionGearDropChance(32), 1);
});

test("Exclusive chain: Gear success → no Stim/Junk", () => {
  const r = settleMissionItemChain({
    character: char,
    mission,
    missionStardustReward: 1000,
    missStreak: 0,
    rng: seqRng([0.0]), // gear succeeds
  });
  assert.equal(r.itemOutcome, "GEAR");
  assert.equal(r.gearDropped, true);
  assert.equal(r.stimDropped, false);
  assert.equal(r.junkDropped, false);
  assert.equal(r.itemTemplates.length, 1);
  assert.notEqual(r.itemTemplates[0].type, "consumable");
  assert.notEqual(r.itemTemplates[0].type, "material");
});

test("Exclusive chain: Gear fail → Stim", () => {
  const r = settleMissionItemChain({
    character: char,
    mission,
    missionStardustReward: 1000,
    missStreak: 0,
    // gear fail (>=0.2), stim success (<0.25)
    rng: seqRng([0.5, 0.1]),
  });
  assert.equal(r.itemOutcome, "STIM");
  assert.equal(r.gearDropped, false);
  assert.equal(r.stimDropped, true);
  assert.equal(r.itemTemplates[0].type, "consumable");
});

test("Exclusive chain: Gear+Stim fail → Junk", () => {
  const r = settleMissionItemChain({
    character: char,
    mission,
    missionStardustReward: 1000,
    missStreak: 0,
    // gear fail, stim fail (>=0.25), junk success (<0.75)
    rng: seqRng([0.5, 0.5, 0.1, 0.5]),
  });
  assert.equal(r.itemOutcome, "JUNK");
  assert.equal(r.junkDropped, true);
  assert.equal(r.itemTemplates[0].type, "material");
  assert.ok(r.itemTemplates[0].sell_value >= 1);
});

test("Exclusive chain: all fail → NONE", () => {
  const r = settleMissionItemChain({
    character: char,
    mission,
    missionStardustReward: 1000,
    missStreak: 0,
    rng: seqRng([0.9, 0.9, 0.9]),
  });
  assert.equal(r.itemOutcome, "NONE");
  assert.equal(r.itemTemplates.length, 0);
  assert.equal(r.gearDropped, false);
});

test("Mission gear item level = character level", () => {
  assert.equal(missionGearItemLevel({ level: 42 }), 42);
  assert.equal(missionGearItemLevel({}), 1);
});

test("Stim/Junk chances", () => {
  assert.equal(MISSION_STIM_CHANCE_AFTER_GEAR_FAIL, 0.25);
  assert.equal(MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL, 0.75);
});

test("Statistical long-run item outcomes (pity process)", () => {
  // One continuous RNG stream — per-mission reseeding biases the first roll vs pity.
  const n = 50000;
  const rng = seededRng(20260804);
  const counts = { GEAR: 0, STIM: 0, JUNK: 0, NONE: 0 };
  let streak = 0;
  for (let i = 0; i < n; i++) {
    const r = settleMissionItemChain({
      character: char,
      mission,
      missionStardustReward: 5000,
      missStreak: streak,
      rng,
    });
    counts[r.itemOutcome] += 1;
    streak = r.gearDropped ? 0 : streak + 1;
  }
  const g = counts.GEAR / n;
  const s = counts.STIM / n;
  const j = counts.JUNK / n;
  const none = counts.NONE / n;
  // Analytical gear rate ≈ 25.83%; Stim/Junk/None follow conditional chain.
  assert.ok(g > 0.24 && g < 0.28, `gear ${g}`);
  assert.ok(s > 0.16 && s < 0.21, `stim ${s}`);
  assert.ok(j > 0.38 && j < 0.46, `junk ${j}`);
  assert.ok(none > 0.11 && none < 0.17, `none ${none}`);
});

test("Statistical mission gear rarity", () => {
  const n = 10000;
  const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < n; i++) {
    counts[rollMissionGearRarity(seededRng(i * 17 + 3))] += 1;
  }
  assert.ok(counts.common / n > 0.47 && counts.common / n < 0.53);
  assert.ok(counts.uncommon / n > 0.22 && counts.uncommon / n < 0.28);
  assert.ok(counts.legendary / n > 0.01 && counts.legendary / n < 0.04);
});

test("L1 0.5 Fuel BASE XP uses both 0.85 factors", () => {
  const fuel = 0.5;
  const level = 1;
  for (const v of [0.9, 1, 1.1]) {
    const live = computeMissionXpFromFuel(fuel, level, v);
    const certified = missionXpReward({
      fuel,
      snapshotLevel: level,
      xpVariance: v,
    });
    const expected = roundHalfUp(fuel * 100 * v * 0.85 * 0.85);
    assert.equal(live, certified, `parity v=${v}`);
    assert.equal(live, expected, `certified product v=${v}`);
  }
  assert.equal(computeMissionXpFromFuel(0.5, 1, 0.9), 33);
  assert.equal(computeMissionXpFromFuel(0.5, 1, 1), 36);
  assert.equal(computeMissionXpFromFuel(0.5, 1, 1.1), 40);
  assert.notEqual(computeMissionXpFromFuel(0.5, 1, 1), 43);
});

test("L1 0.5 Fuel BASE Stardust has no XP 0.85 factors", () => {
  const base = computeMissionStardustFromFuel(0.5, 1);
  assert.equal(StardustPerFuel(1), 50);
  assert.equal(base, 25);
  assert.equal(Math.round(base * 0.9), 23);
  assert.equal(Math.round(base * 1), 25);
  assert.equal(Math.round(base * 1.1), 28);
  assert.equal(Math.round(base * 1.04), 26);
});

test("Collection XP bonus applies once after BASE mission XP", () => {
  const base = computeMissionXpFromFuel(0.5, 1, 1);
  assert.equal(base, 36);
  const once = applyXpBonus(base, 10);
  assert.equal(once, Math.round(36 * 1.1));
  const twice = applyXpBonus(once, 10);
  assert.notEqual(twice, once);
  const shipThenCollection = applyXpBonus(Math.round(base * 1.05), 10);
  assert.equal(shipThenCollection, Math.round(Math.round(36 * 1.05) * 1.1));
});

test("grantCharacterXp awards the integer Mission XP with no extra multiplier", () => {
  const granted = grantCharacterXp({
    character: {
      class: "Vanguard",
      level: 1,
      experience: 0,
      experience_to_next_level: 133,
      stats: { strength: 15, agility: 8, intellect: 6, vitality: 14, luck: 7 },
      attribute_purchases_by_stat: {
        strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
      },
    },
    xpAmount: 36,
    source: "mission",
  });
  assert.equal(granted.patch.experience, 36);
  assert.equal(granted.patch.level, 1);
  assert.equal(granted.progression.levels_gained, 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
