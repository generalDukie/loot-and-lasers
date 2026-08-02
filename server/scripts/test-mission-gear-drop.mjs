/**
 * Mission gear drop chance / pity tests.
 * Run: npm run test:mission-gear-drop
 */
import assert from "node:assert/strict";
import {
  MISSION_GEAR_DROP_BASE,
  MISSION_GEAR_PITY_STEP,
  MISSION_GEAR_DROP_CAP,
  missionGearDropChance,
  missionGearMissStreak,
  rollMissionGearDrop,
} from "../src/shared/economyFormulas.js";

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

console.log("\nMission gear drop tests\n");

test("base chance is 20%", () => {
  assert.equal(MISSION_GEAR_DROP_BASE, 0.2);
  assert.equal(missionGearDropChance(0), 0.2);
});

test("pity adds 2.5% per miss", () => {
  assert.equal(MISSION_GEAR_PITY_STEP, 0.025);
  assert.equal(missionGearDropChance(1), 0.225);
  assert.equal(missionGearDropChance(4), 0.3);
});

test("pity can reach 100% (no 50% soft-cap)", () => {
  assert.equal(MISSION_GEAR_DROP_CAP, 1);
  assert.equal(missionGearDropChance(12), 0.5);
  assert.equal(missionGearDropChance(32), 1);
  assert.equal(missionGearDropChance(100), 1);
});

test("miss streak coerces safely", () => {
  assert.equal(missionGearMissStreak(null), 0);
  assert.equal(missionGearMissStreak({}), 0);
  assert.equal(missionGearMissStreak({ mission_gear_miss_streak: 3.9 }), 3);
  assert.equal(missionGearMissStreak({ mission_gear_miss_streak: -2 }), 0);
});

test("rollMissionGearDrop respects chance", () => {
  assert.equal(rollMissionGearDrop(0, () => 0.19), true);
  assert.equal(rollMissionGearDrop(0, () => 0.2), false);
  assert.equal(rollMissionGearDrop(12, () => 0.499), true);
  assert.equal(rollMissionGearDrop(12, () => 0.5), false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
