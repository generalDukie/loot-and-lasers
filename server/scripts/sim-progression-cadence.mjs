/**
 * Light Monte Carlo: 300 Fuel/day mission XP + dungeon first-clear XP → days to L200.
 * Not a full economy sim — validates progression cadence vs balance targets (~14 days).
 *
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/sim-progression-cadence.mjs
 */
import { expForLevel, getMissionXpPerFuel } from "../src/shared/rewards.js";
import {
  MISSION_XP_REBALANCE,
  getEnemyDru,
  druToRewards,
  DUNGEON_UNLOCK_LEVELS,
} from "../src/shared/economyFormulas.js";

// Dungeon enemy levels (authoritative list from balance spec)
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

const FUEL_PER_DAY = 300;
const RUNS = 40;
const TARGET_LEVEL = 200;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function missionEff(level, rng) {
  if (level <= 10) return 0.75 + rng() * 0.5;
  return 0.9 + rng() * 0.2;
}

function unlockLevel(d) {
  return DUNGEON_UNLOCK_LEVELS[d] ?? 999;
}

function simulate(seed) {
  const rng = mulberry32(seed);
  let level = 1;
  let xp = 0;
  let day = 0;
  let missionXp = 0;
  let dungeonXp = 0;
  const cleared = new Set();

  function gain(amount, source) {
    xp += amount;
    if (source === "mission") missionXp += amount;
    else dungeonXp += amount;
    while (xp >= expForLevel(level)) {
      xp -= expForLevel(level);
      level += 1;
    }
  }

  function tryDungeons() {
    for (let d = 1; d <= 10; d++) {
      if (level < unlockLevel(d)) continue;
      const levels = DUNGEON_ENEMY_LEVELS[d];
      for (let i = 0; i < levels.length; i++) {
        const key = `${d}-${i}`;
        if (cleared.has(key)) continue;
        if (level < levels[i] - 5) break;
        cleared.add(key);
        const dru = getEnemyDru(d, i + 1);
        const { experience } = druToRewards(dru, levels[i]);
        gain(experience, "dungeon");
      }
    }
  }

  while (level < TARGET_LEVEL && day < 60) {
    day += 1;
    for (let f = 0; f < FUEL_PER_DAY; f++) {
      const eff = missionEff(level, rng);
      const xpGain = Math.round(1 * getMissionXpPerFuel(level) * eff * MISSION_XP_REBALANCE);
      gain(xpGain, "mission");
      tryDungeons();
      if (level >= TARGET_LEVEL) break;
    }
  }

  return {
    day,
    level,
    missionXp,
    dungeonXp,
    dungeonShare: dungeonXp / Math.max(1, missionXp + dungeonXp),
    clears: cleared.size,
  };
}

const results = [];
for (let i = 0; i < RUNS; i++) results.push(simulate(1000 + i * 97));

const days = results.map((r) => r.day).sort((a, b) => a - b);
const shares = results.map((r) => r.dungeonShare);
const median = days[Math.floor(days.length / 2)];
const mean = days.reduce((a, b) => a + b, 0) / days.length;
const meanShare = shares.reduce((a, b) => a + b, 0) / shares.length;
const meanClears = results.reduce((a, r) => a + r.clears, 0) / results.length;

console.log("\nProgression cadence Monte Carlo (mission+dungeon XP only)");
console.log(`  Runs: ${RUNS} · Fuel/day: ${FUEL_PER_DAY} · Target: L${TARGET_LEVEL}`);
console.log(`  Days to L200 — median ${median}, mean ${mean.toFixed(2)}, min ${days[0]}, max ${days[days.length - 1]}`);
console.log(`  Dungeon XP share at L200 — mean ${(meanShare * 100).toFixed(1)}% (target ~25%)`);
console.log(`  Avg dungeon encounters cleared — ${meanClears.toFixed(1)} / 100`);
console.log(`  Target band: ~14 days; dungeon share ~25%; clears ~94\n`);

if (median < 8 || median > 22) {
  console.error("WARN: median days outside 8–22 band — investigate XP curves");
  process.exitCode = 1;
}
if (meanShare > 0.55) {
  console.error("WARN: dungeon XP share >55% — early dungeon dominance may have returned");
  process.exitCode = 1;
}
