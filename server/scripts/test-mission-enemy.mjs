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
} from "../../src/lib/statEngine.js";
import { simulateBattle } from "../../src/lib/arenaEngine.js";
import { distributeExpectedPlayerAttributes } from "../../src/lib/expectedPlayerAttributes.js";

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

test("expected player attribute curve matches sample anchors", () => {
  // Spec sample table is approximate; the formula is authoritative.
  const samples = [
    [10, 357],
    [20, 619],
    [30, 854],
    [40, 1073],
    [50, 1282],
    [100, 2271],
    [150, 3240],
    [200, 4208],
    [250, 5175],
    [300, 6143],
    [400, 8078],
    [500, 10014],
  ];
  for (const [level, approx] of samples) {
    const got = expectedPlayerAttributes(level);
    assert.ok(Math.abs(got - approx) <= 1, `L${level}: got ${got}, approx ${approx}`);
  }
  // Continues past 500 without brackets.
  assert.ok(expectedPlayerAttributes(600) > expectedPlayerAttributes(500));
  assert.ok(expectedPlayerAttributes(1000) > expectedPlayerAttributes(600));
});

test("mission enemy budgets = ROUND(expected × 0.35)", () => {
  const samples = [
    [10, 125],
    [50, 449],
    [100, 795],
    [250, 1811],
    [500, 3505],
  ];
  for (const [level, approx] of samples) {
    const got = missionEnemyAttributeBudget(level);
    const fromFormula = Math.round(expectedPlayerAttributes(level) * 0.35);
    assert.equal(got, fromFormula, `L${level} formula`);
    assert.ok(Math.abs(got - approx) <= 1, `L${level}: got ${got}, approx ${approx}`);
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
  assert.equal(sum, 449);
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
    stats: distributeExpectedPlayerAttributes(50, "MIGHT"),
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

test("expected player overwhelmingly favored vs mission enemy", () => {
  const levels = [10, 50, 100, 250, 500];
  const results = {};
  for (const level of levels) {
    let wins = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const player = {
        name: "Expected",
        level,
        class: "Vanguard",
        race: null,
        stats: distributeExpectedPlayerAttributes(level, "MIGHT"),
      };
      // Deterministic-ish per trial
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
    console.log(`    L${level}: player wins ${wins}/${N} (${((wins / N) * 100).toFixed(0)}%)`);
    // Design intent: overwhelmingly favored — flag if below 90% so we can retune 35%.
    assert.ok(wins / N >= 0.9, `L${level} win rate ${wins}/${N}`);
  }
  // Stash for report
  globalThis.__missionEnemyWinRates = results;
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
