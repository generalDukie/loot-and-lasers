/**
 * ExpectedPlayerAttributes benchmark tests (Stim-adjusted anchors).
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-expected-player-attributes.mjs
 */
import assert from "node:assert/strict";
import {
  expectedPlayerAttributes,
  EXPECTED_PLAYER_ATTRIBUTE_ANCHORS,
  EXPECTED_PLAYER_AT_500,
  EXPECTED_PLAYER_POST_500_SLOPE,
} from "../../src/lib/expectedPlayerAttributes.js";
import {
  dungeonWormholeEnemyAttributeTotal,
  DUNGEON_WORMHOLE_REGULAR_EPA_MULT,
  DUNGEON_WORMHOLE_BOSS_EPA_MULT,
  expectedPlayerAttributes as productionExpectedPlayerAttributes,
  roundHalfUp,
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

console.log("\nExpectedPlayerAttributes tests\n");

test("exact anchors", () => {
  const required = [
    [1, 68],
    [10, 383],
    [25, 745],
    [50, 1277],
    [100, 2275],
    [150, 3263],
    [200, 4096],
    [250, 5365],
    [300, 6336],
    [350, 7700],
    [400, 8673],
    [450, 10095],
    [500, 11054],
  ];
  for (const [L, v] of required) {
    assert.equal(expectedPlayerAttributes(L), v, `L${L}`);
  }
  for (const [L, v] of EXPECTED_PLAYER_ATTRIBUTE_ANCHORS) {
    assert.equal(expectedPlayerAttributes(L), v, `table L${L}`);
  }
});

test("monotone + in-band between anchors", () => {
  for (let i = 0; i < EXPECTED_PLAYER_ATTRIBUTE_ANCHORS.length - 1; i++) {
    const [x0, y0] = EXPECTED_PLAYER_ATTRIBUTE_ANCHORS[i];
    const [x1, y1] = EXPECTED_PLAYER_ATTRIBUTE_ANCHORS[i + 1];
    let prev = y0;
    for (let L = x0 + 1; L < x1; L++) {
      const v = expectedPlayerAttributes(L);
      assert.equal(Number.isInteger(v), true);
      assert.ok(v >= prev, `L${L} decreased`);
      assert.ok(v >= y0 && v <= y1, `L${L}=${v} outside [${y0},${y1}]`);
      prev = v;
    }
  }
});

test("level 500+ linear tail", () => {
  assert.equal(EXPECTED_PLAYER_AT_500, 11054);
  assert.equal(EXPECTED_PLAYER_POST_500_SLOPE, 23.9);
  assert.ok(expectedPlayerAttributes(501) > expectedPlayerAttributes(500));
  assert.equal(expectedPlayerAttributes(600), Math.round(11054 + 23.9 * 100));
  assert.equal(expectedPlayerAttributes(600), 13444);
  assert.equal(expectedPlayerAttributes(1000), Math.round(11054 + 23.9 * 500));
  assert.equal(expectedPlayerAttributes(1000), 23004);
});

test("no extra Stim multiplier on benchmark", () => {
  // Anchors already include typical Stim uplift — must not be scaled again.
  assert.equal(expectedPlayerAttributes(100), 2275);
  assert.notEqual(expectedPlayerAttributes(100), Math.round(2275 * 1.125));
});

test("Dungeon/Wormhole budgets use production EPA helpers, not the retired PCHIP dungeon path", () => {
  assert.equal(DUNGEON_WORMHOLE_REGULAR_EPA_MULT, 1.2);
  assert.equal(DUNGEON_WORMHOLE_BOSS_EPA_MULT, 1.3);
  const epa = productionExpectedPlayerAttributes(100);
  assert.notEqual(epa, expectedPlayerAttributes(100));
  assert.equal(
    dungeonWormholeEnemyAttributeTotal(100, false),
    Math.max(1, roundHalfUp(epa * DUNGEON_WORMHOLE_REGULAR_EPA_MULT)),
  );
  assert.equal(
    dungeonWormholeEnemyAttributeTotal(100, true),
    Math.max(1, roundHalfUp(epa * DUNGEON_WORMHOLE_BOSS_EPA_MULT)),
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
