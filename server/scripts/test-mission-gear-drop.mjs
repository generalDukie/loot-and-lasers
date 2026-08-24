/**
 * Mission Gear drop chance / Fuel-pity tests (Test 18 checksum).
 * Run: npm run test:mission-gear-drop
 */
import assert from "node:assert/strict";
import {
  MISSION_GEAR_REFERENCE_CHANCE,
  MISSION_GEAR_REFERENCE_FUEL,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_GEAR_PITY_CLAMP,
} from "../../src/lib/productionMath/constants.js";
import {
  missionGearDropProbability,
  nextFuelSinceLastGear,
  readFuelSinceLastGear,
} from "../../src/lib/productionMath/missions.js";

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

console.log("\nMission Gear drop tests (Fuel pity)\n");

test("reference chance is 30% at 12.5 Fuel and zero pity", () => {
  assert.equal(MISSION_GEAR_REFERENCE_CHANCE, 0.3);
  assert.equal(MISSION_GEAR_REFERENCE_FUEL, 12.5);
  assert.ok(Math.abs(missionGearDropProbability(12.5, 0) - 0.3) < 1e-12);
});

test("pity increments 2.5% of reference Fuel in the reference pity term", () => {
  assert.equal(MISSION_GEAR_PITY_INCREMENT, 0.025);
  assert.ok(missionGearDropProbability(12.5, 12.5) > missionGearDropProbability(12.5, 0));
});

test("reference pity clamps at 0.999", () => {
  assert.equal(MISSION_GEAR_PITY_CLAMP, 0.999);
  const p = missionGearDropProbability(12.5, 12.5 * 1000);
  assert.ok(p <= 1 && p >= 0.999);
});

test("legacy mission-count streak migrates as Fuel pity", () => {
  assert.equal(readFuelSinceLastGear({}), 0);
  assert.equal(readFuelSinceLastGear({ fuel_since_last_gear: 7.5 }), 7.5);
  assert.equal(readFuelSinceLastGear({ mission_gear_miss_streak: 2 }), 25);
});

test("success resets Fuel pity; failure adds Mission Fuel", () => {
  assert.equal(nextFuelSinceLastGear({ fuelSinceLastGear: 10, missionFuel: 2.5, gearDropped: true }), 0);
  assert.equal(nextFuelSinceLastGear({ fuelSinceLastGear: 10, missionFuel: 2.5, gearDropped: false }), 12.5);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
