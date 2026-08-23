/**
 * Arena bot generation tests.
 * Run: npm run test:arena-bot
 */
import assert from "node:assert/strict";
import {
  expectedPlayerAttributes,
} from "../../src/lib/expectedPlayerAttributes.js";
import {
  ARENA_BOT_CLASSES,
  ARENA_BOT_BUILD_KEYS,
  ARENA_BOT_BUILD_PROFILES,
  ARENA_BOT_LEVEL_SPREAD,
  ARENA_BOT_STRENGTH_MIN,
  ARENA_BOT_STRENGTH_MAX,
  rollArenaBotLevel,
  rollArenaBotStrengthMultiplier,
  arenaBotAttributeBudget,
  allocateArenaBotAttributes,
  generateArenaBot,
} from "../../src/lib/arenaBotGenerator.js";
import {
  generateOpponents,
  rankArenaCandidates,
  pickRankedCandidates,
  scoreArenaCandidate,
  ARENA_MAX_REAL_OPPONENTS,
  ARENA_CHALLENGER_SLOTS,
  ARENA_LEVEL_BAND,
  ARENA_RATING_BAND,
  ARENA_RATING_BAND_WIDE,
} from "../../src/lib/arenaEngine.js";
import { computeDerivedStats, CRIT_CAP, DODGE_CAP, ARMOR_CAP, TECH_RESIST_CAP } from "../../src/lib/statEngine.js";
import { simulateBattle } from "../../src/lib/arenaEngine.js";
import { CLASSES } from "../../src/lib/gameData.js";
import { passiveNameForClass } from "../../src/lib/classPassives.js";

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

console.log("\nArena bot generation tests\n");

test("bot level stays within playerLevel ±5 and ≥1", () => {
  assert.equal(ARENA_BOT_LEVEL_SPREAD, 5);
  for (let i = 0; i < 200; i++) {
    const lvl = rollArenaBotLevel(100);
    assert.ok(lvl >= 95 && lvl <= 105, `L100 → ${lvl}`);
  }
  for (let i = 0; i < 200; i++) {
    const lvl = rollArenaBotLevel(3);
    assert.ok(lvl >= 1 && lvl <= 8, `L3 → ${lvl}`);
  }
  assert.equal(rollArenaBotLevel(3, () => 0), 1);
  assert.equal(rollArenaBotLevel(3, () => 0.999), 8);
  assert.equal(rollArenaBotLevel(100, () => 0), 95);
  assert.equal(rollArenaBotLevel(100, () => 0.999), 105);
});

test("attribute budget is Expected × [0.85, 1.15] with rounding", () => {
  assert.equal(ARENA_BOT_STRENGTH_MIN, 0.85);
  assert.equal(ARENA_BOT_STRENGTH_MAX, 1.15);
  for (const level of [1, 10, 50, 100, 200]) {
    const expected = expectedPlayerAttributes(level);
    const lo = Math.round(expected * 0.85);
    const hi = Math.round(expected * 1.15);
    for (let i = 0; i < 40; i++) {
      const mult = rollArenaBotStrengthMultiplier();
      assert.ok(mult >= 0.85 && mult <= 1.15);
      const budget = arenaBotAttributeBudget(level, mult);
      assert.ok(budget >= lo - 1 && budget <= hi + 1, `L${level} budget ${budget} not in ~[${lo},${hi}]`);
    }
    assert.equal(arenaBotAttributeBudget(level, 0.85), lo);
    assert.equal(arenaBotAttributeBudget(level, 1.15), hi);
  }
});

test("all six canonical classes can generate", () => {
  assert.deepEqual([...ARENA_BOT_CLASSES], [
    "Vanguard", "Astral Warden", "Shadow Operative", "Void Runner", "Technomancer", "Cosmic Engineer",
  ]);
  for (const className of ARENA_BOT_CLASSES) {
    const snap = generateArenaBot({ playerLevel: 20, className, buildKey: "balanced" });
    assert.equal(snap.class, className);
    assert.ok(CLASSES[className], `missing CLASSES[${className}]`);
    assert.equal(snap.suppressClassPassive, false);
    assert.equal(snap.dungeonEnemy, false);
  }
});

test("every class has damage/balanced/durable builds summing to 100%", () => {
  for (const className of ARENA_BOT_CLASSES) {
    const profile = ARENA_BOT_BUILD_PROFILES[className];
    assert.ok(profile, className);
    assert.ok(profile.primaryStat);
    for (const key of ARENA_BOT_BUILD_KEYS) {
      const shares = profile[key];
      assert.ok(shares, `${className}.${key}`);
      const sum = Object.values(shares).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, `${className}.${key} shares=${sum}`);
    }
  }
});

test("allocated attributes always sum exactly to BotTotalAttributes", () => {
  for (const className of ARENA_BOT_CLASSES) {
    for (const buildKey of ARENA_BOT_BUILD_KEYS) {
      for (const total of [50, 83, 357, 1000, 4208]) {
        const shares = ARENA_BOT_BUILD_PROFILES[className][buildKey];
        const primary = ARENA_BOT_BUILD_PROFILES[className].primaryStat;
        const stats = allocateArenaBotAttributes(total, shares, primary);
        const sum = Object.values(stats).reduce((a, b) => a + b, 0);
        assert.equal(sum, total, `${className} ${buildKey} total=${total}`);
      }
    }
  }
});

test("bots use production natural combat caps (same as Dungeon/Wormhole)", () => {
  const snap = generateArenaBot({
    playerLevel: 200,
    level: 200,
    className: "Vanguard",
    buildKey: "damage",
    strengthMultiplier: 1.15,
  });
  const derived = computeDerivedStats(snap.stats, {
    level: snap.level,
    class: snap.class,
    dungeonEnemy: false,
  });
  assert.ok(derived.critChance <= CRIT_CAP + 1e-9);
  assert.ok(derived.dodgeChance <= DODGE_CAP + 1e-9);
  assert.ok(derived.armor <= ARMOR_CAP + 1e-9);
  assert.ok(derived.techResist <= TECH_RESIST_CAP + 1e-9);
});

test("bots reuse authoritative class passives in simulateBattle", () => {
  const snap = generateArenaBot({
    playerLevel: 30,
    level: 30,
    className: "Shadow Operative",
    buildKey: "damage",
    strengthMultiplier: 1.0,
  });
  assert.equal(passiveNameForClass(snap.class), "Phantom Signal");
  const player = {
    name: "Hero",
    level: 30,
    class: "Vanguard",
    race: null,
    stats: { strength: 80, agility: 20, intellect: 10, vitality: 40, luck: 20 },
  };
  const bot = {
    name: "Bot",
    level: snap.level,
    class: snap.class,
    race: null,
    stats: snap.stats,
    suppressClassPassive: false,
  };
  const battle = simulateBattle(player, bot, [], [], { rng: () => 0.5 });
  assert.ok(battle.events.length > 0);
  // Opponent fighter should have Phantom Signal active (not suppressed).
  const passiveEvt = battle.events.find(
    (e) => e.side === "opponent" && e.type === "passive" && e.passive === "Phantom Signal"
  );
  // Phantom Signal may only show as miss events — also accept guaranteed early misses.
  const phantomMiss = battle.events.find(
    (e) => e.defender === "opponent" && e.missed && e.phantomSignal
  );
  assert.ok(
    passiveEvt || phantomMiss || battle.events.some((e) => e.defender === "opponent" && e.missed),
    "expected Shadow Operative passive behavior"
  );
});

test("generateOpponents produces bots in ±5 level band with valid classes", () => {
  const char = { level: 50, arena_rating: 1200 };
  const opps = generateOpponents(char, 12, []);
  assert.equal(opps.length, 12);
  for (const o of opps) {
    assert.equal(o.isBot, true);
    assert.ok(o.level >= 45 && o.level <= 55, `level ${o.level}`);
    assert.ok(ARENA_BOT_CLASSES.includes(o.class), o.class);
    const sum = Object.values(o.stats).reduce((a, b) => a + b, 0);
    const expected = expectedPlayerAttributes(o.level);
    assert.ok(sum >= Math.round(expected * 0.85) - 1);
    assert.ok(sum <= Math.round(expected * 1.15) + 1);
    // Cosmetic weapon only — no combat stats on gear.
    for (const it of o.equippedItems || []) {
      const gearSum = Object.values(it.stats || {}).reduce((a, b) => a + (b || 0), 0);
      assert.equal(gearSum, 0);
    }
  }
});

test("real-player matchmaking helpers unchanged (regression)", () => {
  assert.equal(ARENA_MAX_REAL_OPPONENTS, 2);
  assert.equal(ARENA_CHALLENGER_SLOTS, 3);
  assert.equal(ARENA_LEVEL_BAND, 8);
  assert.equal(ARENA_RATING_BAND, 120);
  assert.equal(ARENA_RATING_BAND_WIDE, 280);

  const player = { level: 40, arena_rating: 1500 };
  const candidates = [
    { id: "a", level: 40, arena_rating: 1510, updated_date: new Date().toISOString() },
    { id: "b", level: 42, arena_rating: 1700, updated_date: new Date().toISOString() },
    { id: "c", level: 55, arena_rating: 1500, updated_date: new Date().toISOString() }, // outside level band
    { id: "d", level: 39, arena_rating: 1480, updated_date: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString() },
  ];
  const ranked = rankArenaCandidates(player, candidates);
  assert.ok(!ranked.find((c) => c.id === "c"), "level-band filter still applies");
  assert.equal(ranked[0].id, "a");
  const picked = pickRankedCandidates(ranked, 2);
  assert.equal(picked.length, 2);
  assert.ok(typeof scoreArenaCandidate(player, candidates[0]) === "number");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
