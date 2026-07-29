/**
 * Mission duration pool + remaining-fuel exception tests.
 * Run: npm run test:mission-duration
 */
import assert from "node:assert/strict";
import {
  getAllowedMissionDurations,
  rollMissionDurationSeconds,
  remainingFuelDurationSeconds,
  needsRemainingFuelException,
  isNormalPoolDuration,
  isValidMissionDuration,
} from "../../src/lib/missionDuration.js";

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
    console.error(`    ${err.message}`);
  }
}

console.log("\nMission duration tests\n");

const EXPECTED = {
  1: [15, 30],
  2: [15, 30],
  3: [15, 30, 45],
  4: [30, 45, 60],
  5: [30, 45, 60, 75],
  6: [30, 60, 90],
  7: [30, 60, 90],
  8: [60, 90, 120],
  9: [60, 90, 120, 150],
  10: [60, 90, 120, 150],
  11: [150, 300],
  12: [150, 300],
  13: [150, 300, 450],
  14: [150, 300, 450],
  15: [150, 300, 450, 600],
  16: [300, 450, 600, 750],
  17: [300, 450, 600, 750],
  18: [300, 450, 600, 750, 900],
  19: [300, 450, 600, 750, 900, 1050],
  20: [300, 450, 600, 750, 900, 1050, 1200],
  21: [300, 600, 900, 1200],
  100: [300, 600, 900, 1200],
};

for (const [lvl, pool] of Object.entries(EXPECTED)) {
  test(`Level ${lvl} pool`, () => {
    assert.deepEqual(getAllowedMissionDurations(Number(lvl)), pool);
  });
}

test("rollMissionDurationSeconds stays in pool", () => {
  for (const level of [1, 5, 10, 15, 20, 21, 50]) {
    const pool = getAllowedMissionDurations(level);
    for (let u = 0; u <= 10; u++) {
      const sec = rollMissionDurationSeconds(level, u / 10);
      assert.ok(pool.includes(sec), `L${level} unit=${u / 10} → ${sec}`);
    }
  }
});

test("Level 21+ never exceeds 5/10/15/20", () => {
  assert.deepEqual(getAllowedMissionDurations(21), [300, 600, 900, 1200]);
  assert.deepEqual(getAllowedMissionDurations(999), [300, 600, 900, 1200]);
});

test("remaining-fuel exception durations", () => {
  assert.equal(remainingFuelDurationSeconds(2), 120); // L17 leftover
  assert.equal(remainingFuelDurationSeconds(3), 180); // L21 leftover
  assert.equal(remainingFuelDurationSeconds(1), 60); // L15 leftover
  assert.equal(remainingFuelDurationSeconds(0.75), 45); // L10 leftover
  assert.equal(remainingFuelDurationSeconds(0.25), 15); // L4 leftover
});

test("needsRemainingFuelException when below pool minimum", () => {
  assert.equal(needsRemainingFuelException(17, 2), true);
  assert.equal(needsRemainingFuelException(21, 3), true);
  assert.equal(needsRemainingFuelException(15, 1), true);
  assert.equal(needsRemainingFuelException(10, 0.75), true);
  assert.equal(needsRemainingFuelException(4, 0.25), true);
});

test("exception NOT needed when fuel covers a normal pool mission", () => {
  assert.equal(needsRemainingFuelException(21, 18), false); // can afford 5/10/15
  assert.equal(needsRemainingFuelException(17, 5), false);
  assert.equal(needsRemainingFuelException(10, 1), false); // 60s = 1 fuel in pool
  assert.equal(needsRemainingFuelException(4, 0.5), false); // 30s in pool
});

test("isValidMissionDuration accepts pool and exact leftover", () => {
  assert.equal(isValidMissionDuration(21, 300), true);
  assert.equal(isValidMissionDuration(21, 420), false); // 7m not in L21+ pool
  assert.equal(isValidMissionDuration(21, 180, 3), true); // 3m leftover
  assert.equal(isValidMissionDuration(17, 120, 2), true);
  assert.equal(isValidMissionDuration(17, 120), false); // no pin → not in pool
  assert.equal(isNormalPoolDuration(20, 1050), true);
  assert.equal(isNormalPoolDuration(21, 1050), false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
