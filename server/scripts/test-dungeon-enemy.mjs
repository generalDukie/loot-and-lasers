/**
 * Dungeon enemy attribute scaling + unlock level tests.
 * Run: npm run test:dungeon-enemy
 */
import assert from "node:assert/strict";
import {
  dungeonWormholeEnemyAttributeTotal,
  expectedPlayerAttributes,
  roundHalfUp,
  DUNGEON_WORMHOLE_REGULAR_EPA_MULT,
  DUNGEON_WORMHOLE_BOSS_EPA_MULT,
} from "../../src/lib/productionMath/index.js";
import {
  distributeMissionEnemyAttributes,
  MISSION_ENEMY_ARCHETYPES,
} from "../../src/lib/expectedPlayerAttributes.js";
import {
  DUNGEON_ENEMY_LEVELS,
  DUNGEON_UNLOCK_LEVELS,
  DUNGEON_ENEMIES_PER_PLANET,
  getDungeonEnemyLevel,
  getDungeonUnlockLevel,
  isDungeonUnlockedByLevel,
  generateDungeonEnemy,
} from "../../src/lib/dungeonEngine.js";
import { DUNGEON_PLANETS } from "../../src/lib/dungeonData.js";
import { computeDerivedStats, CRIT_CAP, DODGE_CAP, ARMOR_CAP, TECH_RESIST_CAP } from "../../src/lib/statEngine.js";
import { derivedCombatStats } from "../../src/lib/combatMath.js";
import { buildFighter } from "../../src/lib/arenaEngine.js";
import * as M from "@/lib/productionMath";

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

console.log("\nDungeon enemy scaling & unlock tests\n");

test("regular dungeon budget = rround(production EPA × 1.20)", () => {
  assert.equal(DUNGEON_WORMHOLE_REGULAR_EPA_MULT, 1.2);
  for (const level of [10, 19, 50, 100, 200, 500]) {
    const got = dungeonWormholeEnemyAttributeTotal(level, false);
    const expected = Math.max(1, roundHalfUp(expectedPlayerAttributes(level) * 1.2));
    assert.equal(got, expected, `L${level} regular`);
  }
});

test("boss dungeon budget = rround(production EPA × 1.30) without compounding 1.20", () => {
  assert.equal(DUNGEON_WORMHOLE_BOSS_EPA_MULT, 1.3);
  for (const level of [19, 29, 54, 113, 200]) {
    const got = dungeonWormholeEnemyAttributeTotal(level, true);
    const expected = Math.max(1, roundHalfUp(expectedPlayerAttributes(level) * 1.3));
    const compounded = roundHalfUp(dungeonWormholeEnemyAttributeTotal(level, false) * 1.3);
    assert.equal(got, expected, `L${level} boss`);
    assert.notEqual(got, compounded, `L${level} must not compound 1.20×1.30`);
  }
});

test("story enemy level table preserved for dungeons 1–10", () => {
  const expected = [
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
    [30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
    [40, 42, 43, 45, 46, 48, 49, 51, 52, 54],
    [55, 57, 58, 60, 61, 63, 64, 66, 67, 69],
    [70, 72, 74, 76, 78, 80, 82, 84, 86, 88],
    [90, 93, 95, 98, 100, 103, 105, 108, 110, 113],
    [115, 118, 120, 123, 125, 128, 130, 133, 135, 138],
    [140, 143, 146, 149, 152, 155, 158, 161, 164, 167],
    [170, 173, 177, 180, 183, 187, 190, 193, 197, 200],
  ];
  for (let d = 1; d <= 10; d++) {
    assert.deepEqual(DUNGEON_ENEMY_LEVELS[d], expected[d - 1], `D${d} levels`);
    for (let e = 1; e <= 10; e++) {
      assert.equal(getDungeonEnemyLevel(d, e), expected[d - 1][e - 1]);
    }
  }
});

test("dungeon unlock levels match design chart", () => {
  const expected = [null, 10, 20, 30, 40, 50, 60, 70, 90, 120, 140];
  assert.deepEqual([...DUNGEON_UNLOCK_LEVELS], expected);
  for (let d = 1; d <= 10; d++) {
    assert.equal(getDungeonUnlockLevel(d), expected[d]);
  }
});

test("unlock thresholds: locked immediately below, unlocked at gate", () => {
  const cases = [
    [1, 10], [2, 20], [3, 30], [4, 40], [5, 50],
    [6, 60], [7, 70], [8, 90], [9, 120], [10, 140],
  ];
  for (const [dungeon, unlock] of cases) {
    assert.equal(isDungeonUnlockedByLevel(dungeon, unlock - 1), false, `D${dungeon} @ ${unlock - 1}`);
    assert.equal(isDungeonUnlockedByLevel(dungeon, unlock), true, `D${dungeon} @ ${unlock}`);
    assert.equal(isDungeonUnlockedByLevel(dungeon, unlock + 5), true, `D${dungeon} @ ${unlock + 5}`);
  }
  // Spec examples
  assert.equal(isDungeonUnlockedByLevel(7, 69), false);
  assert.equal(isDungeonUnlockedByLevel(7, 70), true);
});

test("only encounter 10 is boss (1.30); encounters 1–9 use 1.20", () => {
  const planet = DUNGEON_PLANETS[0];
  for (let e = 1; e <= DUNGEON_ENEMIES_PER_PLANET; e++) {
    const enemy = generateDungeonEnemy(planet, e, 999);
    const level = getDungeonEnemyLevel(planet.id, e);
    const isBoss = e === DUNGEON_ENEMIES_PER_PLANET;
    assert.equal(enemy.isBoss, isBoss, `E${e} isBoss`);
    const sum = Object.values(enemy.stats).reduce((a, b) => a + b, 0);
    const budget = dungeonWormholeEnemyAttributeTotal(level, isBoss);
    assert.equal(sum, budget, `E${e} attr sum`);
    if (isBoss) {
      assert.equal(budget, Math.max(1, roundHalfUp(expectedPlayerAttributes(level) * 1.3)));
    } else {
      assert.equal(budget, Math.max(1, roundHalfUp(expectedPlayerAttributes(level) * 1.2)));
    }
  }
});

test("enemy attributes independent of challenging player level", () => {
  const planet = DUNGEON_PLANETS[4]; // D5
  const a = generateDungeonEnemy(planet, 3, 1);
  const b = generateDungeonEnemy(planet, 3, 500);
  assert.deepEqual(a.stats, b.stats);
  assert.equal(a.level, b.level);
  assert.equal(a.dungeonEnemyArchetype, b.dungeonEnemyArchetype);
  assert.equal(a.class, b.class);
});

test("attribute allocation sums to budget for all archetypes", () => {
  for (const arch of MISSION_ENEMY_ARCHETYPES) {
    for (const level of [10, 50, 100, 200]) {
      for (const isBoss of [false, true]) {
        const budget = dungeonWormholeEnemyAttributeTotal(level, isBoss);
        const stats = distributeMissionEnemyAttributes(budget, arch);
        const sum = Object.values(stats).reduce((a, b) => a + b, 0);
        assert.equal(sum, budget, `${arch} L${level} boss=${isBoss}`);
      }
    }
  }
});

test("generated enemy suppresses passives and uses dungeon flags", () => {
  const enemy = generateDungeonEnemy(DUNGEON_PLANETS[0], 1, 10);
  assert.equal(enemy.dungeonEnemy, true);
  assert.equal(enemy.suppressClassPassive, true);
  assert.equal(enemy.race, null);
  assert.ok(["Might", "Reflex", "Tech"].includes(enemy.dungeonEnemyArchetype));
  assert.ok(enemy.appearance?.race);
});

test("dungeon enemies use production natural derived-stat caps, not 75%", () => {
  const enemy = generateDungeonEnemy(DUNGEON_PLANETS[9], 10, 140); // D10 boss L200
  const sheet = computeDerivedStats(enemy.stats, enemy);
  assert.ok(sheet.critChance <= CRIT_CAP + 1e-9);
  assert.ok(sheet.dodgeChance <= DODGE_CAP + 1e-9);
  assert.ok(sheet.armor <= ARMOR_CAP + 1e-9);
  assert.ok(sheet.techResist <= TECH_RESIST_CAP + 1e-9);

  const live = derivedCombatStats(enemy.level, enemy.stats, enemy.class, { dungeonEnemy: true });
  assert.ok(live.crit <= M.NATURAL_CRIT_CAP + 1e-12);
  assert.ok(live.dodge <= M.NATURAL_DODGE_CAP + 1e-12);
  assert.ok(live.resists.might <= M.NATURAL_RESIST_CAP + 1e-12);
  assert.ok(live.resists.reflex <= M.NATURAL_RESIST_CAP + 1e-12);
  assert.ok(live.resists.tech <= M.NATURAL_RESIST_CAP + 1e-12);

  const dungeonFighter = buildFighter(enemy, [], "opponent", { content: "dungeon" });
  const wormholeFighter = buildFighter(enemy, [], "opponent", { content: "wormhole" });
  for (const fighter of [dungeonFighter, wormholeFighter]) {
    assert.ok(fighter.crit <= M.NATURAL_CRIT_CAP + 1e-12);
    assert.ok(fighter.dodge <= M.NATURAL_DODGE_CAP + 1e-12);
    assert.ok(fighter.resists.might <= M.NATURAL_RESIST_CAP + 1e-12);
    assert.ok(fighter.resists.reflex <= M.NATURAL_RESIST_CAP + 1e-12);
    assert.ok(fighter.resists.tech <= M.NATURAL_RESIST_CAP + 1e-12);
    assert.equal(fighter.contextMult, M.DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT);
  }
});

test("saturated dungeon attributes still cannot exceed production natural caps", () => {
  const attrs = { strength: 1e9, agility: 1e9, intellect: 1e9, vitality: 1e9, luck: 1e9 };
  const live = derivedCombatStats(100, attrs, "Technomancer", { dungeonEnemy: true });
  assert.equal(live.crit, M.NATURAL_CRIT_CAP);
  assert.equal(live.dodge, M.NATURAL_DODGE_CAP);
  assert.equal(live.resists.might, M.NATURAL_RESIST_CAP);
  assert.equal(live.resists.reflex, M.NATURAL_RESIST_CAP);
  assert.equal(live.resists.tech, 0);
  const sheet = computeDerivedStats(attrs, {
    level: 100,
    class: "Technomancer",
    dungeonEnemy: true,
  });
  assert.ok(sheet.critChance <= CRIT_CAP + 1e-9);
  assert.ok(sheet.dodgeChance <= DODGE_CAP + 1e-9);
  assert.ok(sheet.armor <= ARMOR_CAP + 1e-9);
  assert.ok(sheet.techResist <= TECH_RESIST_CAP + 1e-9);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
