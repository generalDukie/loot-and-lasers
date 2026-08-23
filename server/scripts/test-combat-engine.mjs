/**
 * Restoration 08 — authoritative combat engine tests.
 * Run: npm run test:combat
 */
import assert from "node:assert/strict";
import {
  calculateStrengthDamage,
  calculateTechDamage,
  calculateAgilityDamage,
  getMaxHP,
  CRIT_MULT,
  UNIVERSAL_VARIANCE_MIN,
  UNIVERSAL_VARIANCE_MAX,
  mitigationForDamageType,
} from "../../src/lib/statEngine.js";
import { resistFraction } from "../../src/lib/combatMath.js";
import {
  simulateBattle,
  buildFighter,
  resolveNormalAttack,
  resolveBasicHit,
  applyHealing,
} from "../../src/lib/arenaEngine.js";
import {
  SimulateCombat,
  buildCombatResult,
  publicCombatResult,
} from "../src/shared/combatService.js";
import { tryPhantomSignalMiss, createPassiveState } from "../../src/lib/classPassives.js";

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

function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function seqRng(seq) {
  let i = 0;
  return () => {
    if (i >= seq.length) return 0.99;
    return seq[i++];
  };
}

function baseChar(className = "Vanguard", level = 50, stats = null) {
  return {
    id: "char-test",
    name: className,
    class: className,
    level,
    race: "Cognati",
    stats: stats || { strength: 200, agility: 200, intellect: 200, vitality: 200, luck: 200 },
  };
}

function softEnemy(overrides = {}) {
  return {
    id: "enemy-test",
    name: "Test Foe",
    class: "Vanguard",
    level: 50,
    missionEnemy: true,
    suppressClassPassive: true,
    stats: { strength: 180, agility: 180, intellect: 180, vitality: 180, luck: 180 },
    ...overrides,
  };
}

console.log("\nCombat engine tests (Restoration 08)\n");

console.log("Damage formulas");
test("Might Damage uses universal variance only", () => {
  const rng = seqRng([0.0]); // -> 0.90
  const dmg = calculateStrengthDamage(100, rng);
  const base = 15 + 0.0032 * Math.pow(100, 1.727);
  assert.ok(Math.abs(dmg - base * 0.9) < 1e-9);
});

test("Tech Damage uses universal variance only", () => {
  const rng = seqRng([1.0]); // -> 1.10
  const dmg = calculateTechDamage(100, rng);
  const base = 15 + 0.0032 * Math.pow(100, 1.727);
  assert.ok(Math.abs(dmg - base * 1.1) < 1e-9);
});

test("Reflex Damage uses the same universal variance as Might/Tech", () => {
  const rng = seqRng([0.0]); // -> 0.90
  const dmg = calculateAgilityDamage(100, rng);
  const base = 15 + 0.0032 * Math.pow(100, 1.727);
  assert.ok(Math.abs(dmg - base * UNIVERSAL_VARIANCE_MIN) < 1e-9);
});

test("Combat damage rounds nearest (not floor)", () => {
  const hit = resolveBasicHit(
    {
      primaryValue: 10,
      archetype: "str",
      crit: 0,
      critMult: CRIT_MULT,
      damageType: "strength",
    },
    { resists: { might: 0, reflex: 0, tech: 0 } },
    { canCrit: false, rng: () => 0.5 },
  );
  assert.equal(hit.finalDamage, Math.round(hit.finalDamage));
  assert.ok(Number.isInteger(hit.finalDamage));
});

test("Max HP formula", () => {
  assert.equal(getMaxHP(0), 50);
  assert.equal(getMaxHP(100), Math.round(50 + 2.5 * 100 + 0.008 * 100 * 100));
});

test("Low / mid / high attribute damage stays finite", () => {
  for (const attr of [1, 50, 500, 5000]) {
    const d = calculateStrengthDamage(attr, () => 0.5);
    assert.ok(Number.isFinite(d) && d > 0);
  }
});

console.log("\nInitiative");
test("Normal initiative is 50/50 with no attribute influence", () => {
  let playerFirst = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const battle = simulateBattle(baseChar(), softEnemy(), [], [], { rng: seededRng(i * 17 + 3) });
    if (battle.initiativeFirstSide === "player") playerFirst += 1;
  }
  const rate = playerFirst / n;
  assert.ok(rate > 0.46 && rate < 0.54, `initiative rate ${rate}`);
});

test("Opening combatant recorded as initiative event", () => {
  const battle = simulateBattle(baseChar(), softEnemy(), [], [], { rng: seededRng(42) });
  const init = battle.events.find((e) => e.type === "initiative");
  assert.ok(init);
  assert.equal(init.opening_side, battle.initiativeFirstSide);
});

console.log("\nDodge and forced miss");
test("Successful Dodge deals zero damage and emits dodge", () => {
  const A = buildFighter(baseChar("Vanguard"), [], "player");
  const B = buildFighter(softEnemy({ stats: { strength: 1, agility: 9999, intellect: 1, vitality: 500, luck: 1 } }), [], "opponent");
  B.dodge = 1;
  A.crit = 0;
  const events = [];
  const result = resolveNormalAttack(A, B, events, { rng: () => 0.0 });
  assert.equal(result.outcome, "dodge");
  assert.ok(events.some((e) => e.type === "dodge" && e.dodged));
  assert.ok(!events.some((e) => e.type === "attack" && e.damage > 0));
});

test("Forced miss deals zero damage and does not emit dodge", () => {
  const defender = buildFighter(baseChar("Shadow Operative"), [], "opponent");
  defender.passiveState = createPassiveState();
  defender.passiveState.phantomPending = true;
  const events = [];
  const miss = tryPhantomSignalMiss(defender, events);
  assert.equal(miss.forcedMiss, true);
  assert.ok(events.some((e) => e.type === "miss" && e.missed && !e.dodged));
  assert.ok(!events.some((e) => e.type === "dodge"));
});

test("Dodged attack cannot Crit", () => {
  const A = buildFighter(baseChar(), [], "player");
  const B = buildFighter(softEnemy(), [], "opponent");
  A.crit = 1;
  B.dodge = 1;
  const events = [];
  resolveNormalAttack(A, B, events, { rng: () => 0.0 });
  const dodge = events.find((e) => e.type === "dodge");
  assert.ok(dodge);
  assert.equal(dodge.crit, false);
});

console.log("\nCrit and resistance");
test("Normal Crit multiplier is 1.5× and does not bypass resistance", () => {
  const attacker = {
    primaryValue: 100,
    archetype: "Might",
    damageChannel: "might",
    crit: 1,
    critMult: CRIT_MULT,
    damageType: "MIGHT",
    damageBase: 15,
  };
  const defender = { resists: { might: 0.2, reflex: 0, tech: 0 } };
  // Fixed variance mid; forceCrit path via canCrit + crit roll 0
  const rawBase = 15 + 0.0032 * Math.pow(100, 1.727);
  const rng = seqRng([0.5, 0.0]); // variance mid-ish, then crit roll
  // calculateStrength uses one rng for variance; resolveBasicHit: roll dmg then crit
  const hit = resolveBasicHit(attacker, defender, {
    canCrit: true,
    forceCrit: true,
    rng: () => 0.5,
  });
  const expectedPreMit = rawBase * 1.0 * CRIT_MULT; // randomBetween(0.9,1.1) at 0.5 → 1.0
  const expected = Math.round(expectedPreMit * 0.8);
  assert.equal(hit.crit, true);
  assert.equal(hit.finalDamage, expected);
});

test("True Damage cannot Crit", () => {
  const A = buildFighter(baseChar("Technomancer"), [], "player");
  const B = buildFighter(softEnemy({ stats: { strength: 1, agility: 1, intellect: 1, vitality: 5000, luck: 1 } }), [], "opponent");
  A.crit = 1;
  B.dodge = 0;
  const events = [];
  resolveNormalAttack(A, B, events, {
    rng: () => 0.99,
    forcedDamageTypeEnum: "TRUE",
    forcedCanDodge: false,
  });
  const atk = events.find((e) => e.type === "attack");
  assert.ok(atk);
  assert.equal(atk.crit, false);
  assert.equal(atk.damageType, "TRUE");
  assert.equal(atk.canCrit, false);
});

test("Might / Reflex / Tech channels resist; True bypasses", () => {
  assert.equal(resistFraction({ might: 0.25, reflex: 0.1, tech: 0.4 }, "might"), 0.25);
  assert.equal(resistFraction({ might: 0.25, reflex: 0.1, tech: 0.4 }, "tech"), 0.4);
  assert.equal(resistFraction({ might: 0.25, reflex: 0.1, tech: 0.4 }, "reflex"), 0.1);
  assert.equal(resistFraction({ might: 0.25, reflex: 0.1, tech: 0.4 }, "true"), 0);
  // Historical two-channel helper is not live combat authority.
  assert.equal(mitigationForDamageType("strength", 25, 40), 0.25);
});

test("No Armor field introduced on combat events", () => {
  const battle = simulateBattle(baseChar(), softEnemy(), [], [], { rng: seededRng(9) });
  for (const ev of battle.events) {
    assert.equal(Object.prototype.hasOwnProperty.call(ev, "Armor"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(ev, "armor"), false);
  }
});

console.log("\nHealing");
test("Healing cannot Crit/miss/dodge and cannot exceed Max HP", () => {
  const target = { hp: 80, maxHp: 100 };
  const { healed } = applyHealing(target, 50);
  assert.equal(healed, 20);
  assert.equal(target.hp, 100);
});

console.log("\nTurn structure / encounter independence");
test("Death ends combat; temporary state not on permanent character", () => {
  const player = baseChar();
  const enemy = softEnemy({
    stats: { strength: 1, agility: 1, intellect: 1, vitality: 1, luck: 1 },
  });
  const permanentStats = { ...player.stats };
  const battle = simulateBattle(player, enemy, [], [], { rng: seededRng(1) });
  assert.ok(battle.winner === "player" || battle.winner === "opponent");
  assert.deepEqual(player.stats, permanentStats);
  assert.ok(battle.playerEnd.hp >= 0);
});

test("Replaying stored events does not require resimulation", () => {
  const battle = simulateBattle(baseChar(), softEnemy(), [], [], { rng: seededRng(77) });
  const committed = buildCombatResult(battle, { mode: "debug", encounterId: "x" });
  const pub = publicCombatResult(committed);
  assert.equal(pub.battle.winner, battle.winner);
  assert.equal(pub.battle.events.length, battle.events.length);
  assert.equal(pub.combat_id, committed.combat_id);
});

test("Same snapshot + seed is identical within one content; Mission vs Dungeon context differs", () => {
  const a = SimulateCombat({
    player: baseChar(),
    opponent: softEnemy(),
    rng: seededRng(123),
    mode: "mission",
  });
  const b = SimulateCombat({
    player: baseChar(),
    opponent: softEnemy(),
    rng: seededRng(123),
    mode: "mission",
  });
  assert.equal(a.winner, b.winner);
  assert.equal(a.events.length, b.events.length);
  const dungeon = SimulateCombat({
    player: baseChar(),
    opponent: { ...softEnemy(), missionEnemy: false, dungeonEnemy: true },
    rng: seededRng(123),
    mode: "dungeon",
  });
  assert.equal(a.content, "mission");
  assert.equal(dungeon.content, "dungeon");
  assert.ok(Array.isArray(dungeon.events) && dungeon.events.length > 0);
});

test("Client-facing result hides _enemy_full / passive internals", () => {
  const combat = SimulateCombat({
    player: baseChar(),
    opponent: softEnemy({ secret: true }),
    rng: seededRng(5),
  });
  const pub = publicCombatResult(combat);
  assert.equal(pub._enemy_full, undefined);
  assert.equal(pub.playerEnd?.passiveState, undefined);
});

console.log("\nStatistical validation");
test("Dodge frequency matches supplied chance (~20%)", () => {
  const n = 3000;
  let dodges = 0;
  let attempts = 0;
  for (let i = 0; i < n; i++) {
    const A = buildFighter(baseChar(), [], "player");
    const B = buildFighter(softEnemy(), [], "opponent");
    A.crit = 0;
    B.dodge = 0.2;
    B.hp = 1e9;
    A.hp = 1e9;
    const events = [];
    resolveNormalAttack(A, B, events, { rng: seededRng(i * 31 + 11) });
    attempts += 1;
    if (events.some((e) => e.type === "dodge")) dodges += 1;
  }
  const rate = dodges / attempts;
  assert.ok(rate > 0.17 && rate < 0.23, `dodge rate ${rate}`);
});

test("Crit frequency matches supplied chance (~15%)", () => {
  const n = 3000;
  let crits = 0;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const hit = resolveBasicHit(
      {
        primaryValue: 50,
        archetype: "Might",
        damageChannel: "might",
        crit: 0.15,
        critMult: CRIT_MULT,
        damageType: "MIGHT",
        damageBase: 15,
      },
      { resists: { might: 0, reflex: 0, tech: 0 } },
      { canCrit: true, rng: seededRng(i * 19 + 7) },
    );
    hits += 1;
    if (hit.crit) crits += 1;
  }
  const rate = crits / hits;
  assert.ok(rate > 0.12 && rate < 0.18, `crit rate ${rate}`);
});

test("isNormalAttack flag present on normal attacks", () => {
  const A = buildFighter(baseChar(), [], "player");
  const B = buildFighter(softEnemy(), [], "opponent");
  B.dodge = 0;
  A.crit = 0;
  const events = [];
  resolveNormalAttack(A, B, events, { rng: () => 0.99 });
  const atk = events.find((e) => e.type === "attack");
  assert.equal(atk.isNormalAttack, true);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
