/**
 * XP/Fuel formula + Post200Growth long-term leveling tests.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-xp-curve-update.mjs
 */
import assert from "node:assert/strict";
import { XP_STARDUST_SCALE } from "../src/shared/economyConstants.js";
import {
  expForLevel,
  post200Growth,
  getMissionXpPerFuel,
  XP_REQUIREMENT_MULTIPLIER,
  POST_200_START_LEVEL,
  POST_200_A,
  POST_200_P,
  POST_200_B,
  POST_200_Q,
  XP_PER_FUEL_LINEAR_COEFFICIENT,
  XP_PER_FUEL_POWER_COEFFICIENT,
  XP_PER_FUEL_EXPONENT,
} from "../src/shared/rewards.js";
import {
  MISSION_XP_REBALANCE,
  DUNGEON_XP_PER_DRU_MULTIPLIER,
  DUNGEON_TOTAL_DRU,
  getEnemyDru,
  druToRewards,
  computeMissionXpFromFuel,
  applyXpToCharacter,
  DUNGEON_UNLOCK_LEVELS,
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

const DUNGEON_ENEMY_LEVELS = {
  1: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  2: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  3: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
  4: [40, 42, 43, 45, 46, 48, 49, 51, 52, 54],
  5: [55, 57, 58, 60, 61, 63, 64, 66, 67, 69],
  6: [70, 72, 74, 76, 78, 80, 82, 84, 86, 88],
  7: [90, 93, 95, 98, 100, 103, 105, 108, 110, 113],
  8: [115, 118, 120, 123, 125, 128, 130, 133, 135, 138],
  9: [140, 143, 146, 149, 152, 155, 158, 161, 164, 167],
  10: [170, 173, 177, 180, 183, 187, 190, 193, 197, 200],
};

function expectedDaysTo(targets, fuelPerDay = 300) {
  const maxT = Math.max(...targets);
  const hit = Object.create(null);
  let level = 1;
  let xp = 0;
  let day = 0;
  const cleared = new Set();

  function gain(amount) {
    xp += amount;
    while (xp >= expForLevel(level) && level < maxT + 5) {
      xp -= expForLevel(level);
      level += 1;
      if (targets.includes(level) && hit[level] == null) hit[level] = day;
    }
  }

  function tryDungeons() {
    for (let d = 1; d <= 10; d++) {
      if (level < (DUNGEON_UNLOCK_LEVELS[d] ?? 999)) continue;
      const levels = DUNGEON_ENEMY_LEVELS[d];
      for (let i = 0; i < levels.length; i++) {
        const key = `${d}-${i}`;
        if (cleared.has(key)) continue;
        if (level < levels[i] - 5) break;
        cleared.add(key);
        const { experience } = druToRewards(getEnemyDru(d, i + 1), levels[i]);
        gain(experience);
      }
    }
  }

  while (level < maxT && day < 25000) {
    day += 1;
    for (let f = 0; f < fuelPerDay; f++) {
      gain(Math.round(getMissionXpPerFuel(level) * 1.0 * MISSION_XP_REBALANCE));
      tryDungeons();
      if (level >= maxT) break;
    }
  }
  for (const t of targets) if (hit[t] == null) hit[t] = day;
  return hit;
}

console.log("\nXP curve update tests\n");

test("centralized XP/Fuel + Post200 constants", () => {
  assert.equal(XP_STARDUST_SCALE, 10);
  assert.equal(XP_REQUIREMENT_MULTIPLIER, 1.35);
  assert.equal(MISSION_XP_REBALANCE, 0.85);
  assert.equal(XP_PER_FUEL_LINEAR_COEFFICIENT, 0.5);
  assert.equal(XP_PER_FUEL_POWER_COEFFICIENT, 0.032);
  assert.equal(XP_PER_FUEL_EXPONENT, 1.67);
  assert.equal(POST_200_START_LEVEL, 200);
  assert.equal(POST_200_A, 0.8);
  assert.equal(POST_200_P, 0.48);
  assert.equal(POST_200_B, 0.79);
  assert.equal(POST_200_Q, 0.71);
  assert.ok(POST_200_Q > POST_200_P);
  assert.ok(POST_200_A >= 0 && POST_200_B >= 0);
});

test("XP/Fuel reference outputs (game scale)", () => {
  // Design curve rounds to an integer, then ×10 game scale (values stay multiples of 10).
  assert.equal(getMissionXpPerFuel(1), 100);
  assert.equal(getMissionXpPerFuel(10), 160);
  assert.ok(Math.abs(getMissionXpPerFuel(50) - 570) <= 10);
  assert.ok(Math.abs(getMissionXpPerFuel(100) - 1300) <= 10);
  assert.ok(Math.abs(getMissionXpPerFuel(200) - 3320) <= 10);
});

test("XP/Fuel monotonic and unbounded", () => {
  let prev = 0;
  for (const L of [1, 10, 50, 100, 200, 300, 500, 700, 1000, 2500, 10000]) {
    const v = getMissionXpPerFuel(L);
    assert.ok(Number.isFinite(v), `finite L${L}`);
    assert.ok(v > prev, `monotonic L${L}`);
    assert.equal(v % XP_STARDUST_SCALE, 0, `scale once L${L}`);
    prev = v;
  }
});

test("Mission XP uses shared XP/Fuel ×0.85; scale once", () => {
  const rate = getMissionXpPerFuel(100);
  assert.equal(computeMissionXpFromFuel(10, 100, 1), Math.round(10 * rate * 0.85));
  assert.equal(MISSION_XP_REBALANCE, 0.85);
});

test("Dungeon XP uses × 2.0 per DRU; uses enemy level XP/Fuel", () => {
  assert.deepEqual(DUNGEON_TOTAL_DRU.slice(1), [40, 50, 60, 70, 95, 110, 125, 140, 155, 185]);
  assert.equal(DUNGEON_XP_PER_DRU_MULTIPLIER, 2.0);
  const dru = getEnemyDru(1, 10);
  const { experience, stardust } = druToRewards(dru, 19);
  assert.equal(stardust, 0);
  assert.equal(
    experience,
    Math.round(dru * getMissionXpPerFuel(19) * DUNGEON_XP_PER_DRU_MULTIPLIER)
  );
  // Enemy level, not player level:
  const highPlayer = druToRewards(dru, 19);
  const wrongLevel = druToRewards(dru, 100);
  assert.notEqual(highPlayer.experience, wrongLevel.experience);
});

test("Post200Growth = 1 at L200; continuous into L201", () => {
  assert.equal(post200Growth(1), 1);
  assert.equal(post200Growth(200), 1);
  assert.ok(post200Growth(201) > 1);
  assert.ok(post200Growth(201) - post200Growth(200) < 0.2);
  const base200 = Math.round(1.35 * 2.106 * 200 ** 1.532 * (1 + (200 / 266) ** 3.683));
  // Post200Growth(200)=1 and earlyGameXpModifier(200)=1, so only global 1.5× applies.
  assert.equal(expForLevel(200), Math.round(base200 * 1.5) * 10);
  assert.ok(expForLevel(201) >= expForLevel(200));
});

test("XP requirement: multiplier, monotonic, no cap, finite at L1000+", () => {
  assert.equal(XP_REQUIREMENT_MULTIPLIER, 1.35);
  let prev = 0;
  for (const L of [1, 50, 100, 200, 201, 300, 400, 500, 700, 1000, 5000]) {
    const v = expForLevel(L);
    assert.ok(Number.isFinite(v), `finite L${L}`);
    assert.ok(v > prev, `monotonic L${L}`);
    assert.equal(v % XP_STARDUST_SCALE, 0, `game scale multiple L${L}`);
    prev = v;
  }
});

test("applyXpToCharacter carries overflow XP safely", () => {
  const ch = { level: 200, experience: expForLevel(200) - 10, experience_to_next_level: expForLevel(200) };
  const patch = {};
  applyXpToCharacter(ch, 50, patch);
  assert.ok(patch.level >= 200);
  assert.ok(patch.experience >= 0);
  assert.equal(patch.experience_to_next_level, expForLevel(patch.level));
});

test("Timing validation (300 Fuel/day, expected eff=1)", () => {
  const hit = expectedDaysTo([200, 300, 400, 500, 700]);
  // Requirement pacing: global 1.5× (+ tapering early-game). ~1.5× longer than
  // the pre-slowdown baseline; slightly more below L100.
  assert.ok(hit[200] >= 18 && hit[200] <= 27, `L200 days ${hit[200]}`);
  assert.ok(hit[300] >= 76 && hit[300] <= 100, `L300 days ${hit[300]}`);
  assert.ok(hit[400] >= 260 && hit[400] <= 330, `L400 days ${hit[400]}`);
  assert.ok(hit[500] >= 750 && hit[500] <= 920, `L500 days ${hit[500]}`);
  assert.ok(hit[700] >= 4100 && hit[700] <= 4950, `L700 days ${hit[700]}`);
  console.log(`    timing L200=${hit[200]}d L300=${hit[300]}d L400=${hit[400]}d L500=${hit[500]}d L700=${hit[700]}d`);
});

test("High-level sanity: continues past L1000 without NaN/Infinity", () => {
  const hit = expectedDaysTo([200, 500, 700, 1000]);
  assert.ok(hit[1000] > hit[700]);
  assert.ok(Number.isFinite(expForLevel(1000)));
  assert.ok(Number.isFinite(getMissionXpPerFuel(1000)));
  assert.ok(Number.isFinite(expForLevel(10000)));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
