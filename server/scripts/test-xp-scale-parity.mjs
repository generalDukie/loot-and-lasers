/**
 * XP 1:1 unit policy — live XP equals productionMath, no hidden ×10.
 */
import assert from "node:assert/strict";
import { expForLevel, getMissionXpPerFuel } from "../src/shared/rewards.js";
import { XP_STARDUST_SCALE } from "../src/shared/economyConstants.js";
import { xpToNext, missionXpPerFuel, roundHalfUp } from "../../src/lib/productionMath/index.js";
import {
  computeMissionXpFromFuel,
  normalizeMissionEfficiency,
  MISSION_XP_REBALANCE,
} from "../src/shared/economyFormulas.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (err) { failed += 1; console.error(`  ✗ ${name}\n    ${err.stack || err.message}`); }
}

console.log("\nXP 1:1 unit policy (L1..500)\n");

test("expForLevel === productionMath.xpToNext", () => {
  const mismatches = [];
  for (let L = 1; L <= 500; L++) {
    if (expForLevel(L) !== xpToNext(L)) mismatches.push(L);
  }
  assert.equal(mismatches.length, 0, `mismatched levels: ${mismatches.slice(0, 10).join(",")}`);
});

test("getMissionXpPerFuel === roundHalfUp(missionXpPerFuel) with no ×10", () => {
  const mismatches = [];
  for (let L = 1; L <= 500; L++) {
    const expected = Math.max(1, roundHalfUp(missionXpPerFuel(L)));
    if (getMissionXpPerFuel(L) !== expected) mismatches.push(L);
  }
  assert.equal(mismatches.length, 0, `mismatched levels: ${mismatches.slice(0, 10).join(",")}`);
});

test("XP is not forced to multiples of 10", () => {
  assert.equal(expForLevel(1), 13);
  assert.equal(getMissionXpPerFuel(1), 10);
});

test("XP_STARDUST_SCALE is leftover economy debt and is not applied to XP", () => {
  assert.equal(XP_STARDUST_SCALE, 10);
  assert.notEqual(expForLevel(1), 13 * XP_STARDUST_SCALE);
  assert.notEqual(getMissionXpPerFuel(1), 10 * XP_STARDUST_SCALE);
  assert.equal(expForLevel(1), xpToNext(1));
});

test("Mission XP uses canonical XP/Fuel (no storage ×10)", () => {
  const levels = [1, 5, 10, 20, 50, 100, 250, 500];
  const fuels = [0.25, 1, 3, 7, 20];
  const effs = [0.5, 0.85, 1, 1.25, 1.5];
  for (const L of levels) {
    for (const f of fuels) {
      for (const eff of effs) {
        const got = computeMissionXpFromFuel(f, L, eff);
        const nEff = normalizeMissionEfficiency(eff, L);
        const ref = Math.max(f > 0 ? 1 : 0, Math.round(f * getMissionXpPerFuel(L) * nEff * MISSION_XP_REBALANCE));
        assert.equal(got, ref, `mission XP L${L} f${f} eff${eff}`);
      }
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
