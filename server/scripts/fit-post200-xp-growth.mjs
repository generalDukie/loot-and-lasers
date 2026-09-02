/**
 * Fit Post200Growth A/P/B/Q against long-term cadence targets.
 * Final shipped coefficients live in server/src/shared/rewards.js.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/fit-post200-xp-growth.mjs
 */
import {
  getMissionXpPerFuel,
  expForLevel,
  POST_200_A,
  POST_200_P,
  POST_200_B,
  POST_200_Q,
  post200Growth,
} from "../src/shared/rewards.js";
import { dungeonEncounterXp } from "../../src/lib/productionMath/index.js";
import {
  MISSION_XP_REBALANCE,
  DUNGEON_UNLOCK_LEVELS,
} from "../src/shared/economyFormulas.js";

const FUEL_PER_DAY = 300;
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

function daysToTargets(targets) {
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
        gain(dungeonEncounterXp(d - 1, i));
      }
    }
  }

  while (level < maxT && day < 25000) {
    day += 1;
    for (let f = 0; f < FUEL_PER_DAY; f++) {
      gain(Math.round(getMissionXpPerFuel(level) * MISSION_XP_REBALANCE));
      tryDungeons();
      if (level >= maxT) break;
    }
  }
  for (const t of targets) if (hit[t] == null) hit[t] = day;
  return hit;
}

const checkpoints = [50, 100, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];
const hit = daysToTargets(checkpoints);

console.log("Shipped Post200Growth coefficients:");
console.log(`  A=${POST_200_A} P=${POST_200_P} B=${POST_200_B} Q=${POST_200_Q}`);
console.log(`  growth(200)=${post200Growth(200)} growth(300)=${post200Growth(300).toFixed(4)}`);
console.log("\nTiming (300 Fuel/day, eff=1, mission×0.85 + dungeon first-clears):");
for (const L of checkpoints) console.log(`  L${L}: ${hit[L]}d`);
console.log("\nXP/Fuel (game scale):", [1, 10, 50, 100, 200, 300, 400, 500, 700, 1000].map((L) => [L, getMissionXpPerFuel(L)]));
console.log("XP-to-next (game scale):", [100, 200, 300, 400, 500, 700, 1000].map((L) => [L, expForLevel(L)]));
