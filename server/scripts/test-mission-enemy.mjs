/**
 * Mission end-of-fight enemy generation tests.
 * Run: npm run test:mission-enemy
 */
import assert from "node:assert/strict";
import {
  expectedPlayerAttributes,
  missionEnemyAttributeBudget,
  pickMissionEnemyArchetype,
  distributeMissionEnemyAttributes,
  distributeProgressingPlayerAttributes,
  MISSION_ENEMY_ATTR_SHARES,
  MISSION_ENEMY_ARCHETYPES,
} from "../../src/lib/expectedPlayerAttributes.js";
import { generateMissionEncounter } from "../../src/lib/missionCombat.js";
import {
  calculateAgilityDamage,
  calculateStrengthDamage,
  calculateTechDamage,
  AGI_VARIANCE_MIN,
  AGI_VARIANCE_MAX,
  UNIVERSAL_VARIANCE_MIN,
  UNIVERSAL_VARIANCE_MAX,
  getBaseDamageFromPrimary,
  getDamageBaseForCombatant,
  getRampedDamageBase,
} from "../../src/lib/statEngine.js";
import { simulateBattle } from "../../src/lib/arenaEngine.js";
import { CLASSES } from "../../src/lib/gameData.js";

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

function seqRng(values) {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i += 1;
    return v;
  };
}

console.log("\nMission enemy generation tests\n");

test("expected player attribute curve matches finalized anchors", () => {
  const samples = [
    [1, 68],
    [10, 383],
    [20, 630],
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
  for (const [level, exact] of samples) {
    assert.equal(expectedPlayerAttributes(level), exact, `L${level}`);
  }
  // Monotone between anchors / integers
  let prev = expectedPlayerAttributes(1);
  for (let L = 2; L <= 520; L++) {
    const v = expectedPlayerAttributes(L);
    assert.equal(v, Math.round(v));
    assert.ok(v >= prev, `L${L}: ${v} < ${prev}`);
    prev = v;
  }
  // Linear tail (Stim-adjusted)
  assert.equal(expectedPlayerAttributes(600), Math.round(11054 + 23.9 * 100));
  assert.equal(expectedPlayerAttributes(1000), Math.round(11054 + 23.9 * 500));
  assert.ok(expectedPlayerAttributes(501) > expectedPlayerAttributes(500));
});

test("mission enemy budgets = ROUND(EPA × 0.35)", () => {
  const samples = [
    [1, 24],
    [10, 134],
    [50, 447],
    [100, 796],
    [500, 3869],
  ];
  for (const [level, exact] of samples) {
    const got = missionEnemyAttributeBudget(level);
    const fromFormula = Math.round(expectedPlayerAttributes(level) * 0.35);
    assert.equal(got, fromFormula, `L${level} formula`);
    assert.equal(got, exact, `L${level}: got ${got}, expected ${exact}`);
  }
  // Formula equality + strictly increasing across a wide range.
  let prev = 0;
  for (let L = 1; L <= 520; L++) {
    const got = missionEnemyAttributeBudget(L);
    assert.equal(got, Math.round(expectedPlayerAttributes(L) * 0.35), `L${L} formula`);
    assert.ok(got >= prev, `L${L}: ${got} < ${prev}`);
    prev = got;
  }
  // Enemy is a soft fraction of the EPA benchmark (0.35), never exceeding it.
  for (const level of [1, 10, 50, 100, 500]) {
    assert.ok(missionEnemyAttributeBudget(level) < expectedPlayerAttributes(level));
  }
});

test("archetype pick is ~equal over large sample", () => {
  const counts = { MIGHT: 0, REFLEX: 0, TECH: 0 };
  const N = 9000;
  let seed = 1;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < N; i++) counts[pickMissionEnemyArchetype(rng)] += 1;
  for (const a of MISSION_ENEMY_ARCHETYPES) {
    const share = counts[a] / N;
    assert.ok(share > 0.31 && share < 0.36, `${a} share=${share}`);
  }
});

test("attribute shares match 35/25/20/10/10 and sum to budget", () => {
  for (const arch of MISSION_ENEMY_ARCHETYPES) {
    for (const level of [10, 50, 100, 250, 500, 750]) {
      const budget = missionEnemyAttributeBudget(level);
      const stats = distributeMissionEnemyAttributes(budget, arch);
      const sum = Object.values(stats).reduce((a, b) => a + b, 0);
      assert.equal(sum, budget, `${arch} L${level} sum`);
      const shares = MISSION_ENEMY_ATTR_SHARES[arch];
      for (const [k, share] of Object.entries(shares)) {
        const expected = budget * share;
        assert.ok(
          Math.abs(stats[k] - expected) <= 1.0001,
          `${arch} L${level} ${k}: ${stats[k]} vs ~${expected}`
        );
      }
    }
  }
});

test("generateMissionEncounter uses player level budget and suppresses passives", () => {
  const character = { level: 50, class: "Vanguard", stats: {} };
  let n = 0;
  const rng = () => {
    // Force TECH archetype (index 2): first call floor(r*3)=2 → r in [2/3,1)
    const vals = [0.9, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    return vals[n++] ?? 0.5;
  };
  const enemy = generateMissionEncounter(character, { id: "m1" }, rng);
  assert.equal(enemy.level, 50);
  assert.equal(enemy.missionEnemyArchetype, "TECH");
  assert.equal(enemy.class, "Technomancer");
  assert.equal(enemy.suppressClassPassive, true);
  assert.equal(enemy.missionEnemy, true);
  assert.equal(enemy.race, null);
  const sum = Object.values(enemy.stats).reduce((a, b) => a + b, 0);
  assert.equal(sum, missionEnemyAttributeBudget(50));
  assert.ok(ENCOUNTER_NAMES_HAS(enemy.name) || typeof enemy.name === "string");
});

function ENCOUNTER_NAMES_HAS(name) {
  return [
    "Scrap Raider", "Dust Bandit", "Vermin Scout", "Hull Rat", "Junk Drone",
    "Space Mite", "Corridor Thug", "Loot Tick", "Derelict Guard", "Petty Corsair",
  ].includes(name);
}

test("Reflex damage applies both variance rolls; Might/Tech only universal", () => {
  const primary = 100;
  const base = getBaseDamageFromPrimary(primary);

  // AGI: first roll Reflex 0.80–1.05, second universal 0.90–1.10
  const agi = calculateAgilityDamage(primary, seqRng([0, 0])); // mins
  assert.ok(Math.abs(agi - base * AGI_VARIANCE_MIN * UNIVERSAL_VARIANCE_MIN) < 1e-9);

  const agiMax = calculateAgilityDamage(primary, seqRng([1, 1]));
  assert.ok(Math.abs(agiMax - base * AGI_VARIANCE_MAX * UNIVERSAL_VARIANCE_MAX) < 1e-9);

  // Independent: first max, second min
  const agiMix = calculateAgilityDamage(primary, seqRng([1, 0]));
  assert.ok(Math.abs(agiMix - base * AGI_VARIANCE_MAX * UNIVERSAL_VARIANCE_MIN) < 1e-9);

  const str = calculateStrengthDamage(primary, seqRng([0]));
  assert.ok(Math.abs(str - base * UNIVERSAL_VARIANCE_MIN) < 1e-9);

  const tech = calculateTechDamage(primary, seqRng([1]));
  assert.ok(Math.abs(tech - base * UNIVERSAL_VARIANCE_MAX) < 1e-9);
});

test("mission enemy has no passive in simulateBattle; can crit/dodge/die", () => {
  const player = {
    name: "Hero",
    level: 50,
    class: "Vanguard",
    race: null,
    stats: distributeProgressingPlayerAttributes(50, "MIGHT"),
  };
  const enemy = generateMissionEncounter({ level: 50 }, null, () => 0.1);
  assert.equal(enemy.suppressClassPassive, true);

  const battle = simulateBattle(player, enemy, [], [], { rng: () => 0.5 });
  assert.ok(battle.events.length > 0);
  const foePassive = battle.events.find(
    (e) => e.side === "opponent" && e.type === "passive" && e.passive
  );
  assert.equal(foePassive, undefined);
  assert.ok(["player", "opponent"].includes(battle.winner));
  assert.ok(battle.opponentMaxHp > 0);
  assert.ok(battle.playerMaxHp > battle.opponentMaxHp);
});

test("progressing player overwhelmingly favored vs mission enemy", () => {
  const levels = [4, 10, 50, 100, 250];
  const results = {};
  for (const level of levels) {
    let wins = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const player = {
        name: "Progressing",
        level,
        class: "Vanguard",
        race: null,
        stats: distributeProgressingPlayerAttributes(level, "MIGHT"),
      };
      let seed = (level * 1000 + i * 97) >>> 0;
      const rng = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      const enemy = generateMissionEncounter({ level }, null, rng);
      const battle = simulateBattle(player, enemy, [], [], { rng });
      if (battle.winner === "player") wins += 1;
    }
    results[level] = { wins, N, rate: wins / N };
    console.log(`    L${level}: progressing wins ${wins}/${N} (${((wins / N) * 100).toFixed(0)}%)`);
    assert.ok(wins / N >= 0.95, `L${level} progressing win rate ${wins}/${N}`);
  }
  globalThis.__missionEnemyWinRates = results;
});

test("mission / arena-bot flat damage ramps; dungeon and players stay at 15", () => {
  assert.equal(getRampedDamageBase(1), 5);
  assert.equal(getRampedDamageBase(25), 15);
  assert.equal(getDamageBaseForCombatant({ missionEnemy: true, level: 1 }), 5);
  assert.equal(getDamageBaseForCombatant({ isBot: true, level: 1 }), 5);
  assert.equal(getDamageBaseForCombatant({ isBot: true, level: 25 }), 15);
  // Dungeon foes also set isBot — must keep full flat.
  assert.equal(getDamageBaseForCombatant({ isBot: true, dungeonEnemy: true, level: 1 }), 15);
  assert.equal(getDamageBaseForCombatant({ level: 1, class: "Vanguard" }), 15);
});

test("bare player favored at L1 (ramp) but falls behind by L10 (35% EPA)", () => {
  // With enemies at 35% of EPA, a totally un-allocated (bare base-stat) build is
  // favored at L1 (ramped base + tiny enemy budget) but is punished by L10 — the
  // intended "negligent / obsolete-gear players fall behind" curve. The ramp
  // itself is unchanged; this only exercises the new enemy budget.
  function bareWinRate(level, seed0) {
    let wins = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const player = {
        name: "Bare",
        level,
        class: "Vanguard",
        race: null,
        stats: { ...CLASSES.Vanguard.baseStats },
      };
      let seed = (seed0 + i * 91) >>> 0;
      const rng = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      const enemy = generateMissionEncounter({ level }, null, rng);
      const battle = simulateBattle(player, enemy, [], [], { rng });
      if (battle.winner === "player") wins += 1;
    }
    return wins / N;
  }
  const l1 = bareWinRate(1, 1000);
  const l10 = bareWinRate(10, 9000);
  console.log(`    bare Vanguard: L1 ${(l1 * 100).toFixed(0)}%  L10 ${(l10 * 100).toFixed(0)}%`);
  assert.ok(l1 >= 0.85, `L1 bare should still win easily: ${l1}`);
  assert.ok(l10 <= 0.5, `L10 bare should be punished by 35% EPA foes: ${l10}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
