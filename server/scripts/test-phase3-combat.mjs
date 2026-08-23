/**
 * Phase 3 — production combat engine fixtures.
 * Run: npm run test:phase3-combat
 */
import assert from "node:assert/strict";
import {
  simulateBattle,
  buildFighter,
  resolveBasicHit,
  resolveNormalAttack,
} from "../../src/lib/arenaEngine.js";
import {
  onCombatStart,
  onTurnStart,
  tryPhantomSignalMiss,
  activateKineticTantrum,
  beginNormalAttackModifiers,
  endNormalAttackModifiers,
  tickOverclockAfterAttempt,
  removeOverclockStacks,
  maybeOrbitalAssistant,
  maybeUnlockDirtyTricks,
  isOrbitalActivationTurn,
  applyDamageWithBarrier,
  OVERCLOCK_STACK_CAP,
  OVERCLOCK_VENT_STACKS,
  OVERCLOCK_CRIT_STACK_LOSS,
  OVERCLOCK_DEALT_PER_STACK,
  DIRTY_TRICK_TURN_TWO,
  DIRTY_TRICK_TURN_THREE,
  DIRTY_TRICKS,
} from "../../src/lib/classPassives.js";
import {
  combatContextMultiplier,
  missionEnemyOutgoingMultiplier,
  missionEnemyBaseDamage,
  PLAYER_COMBAT_CONTEXT_MULT,
  DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT,
  VARIANCE_MIN,
  VARIANCE_MAX,
} from "../../src/lib/productionMath/index.js";
import {
  resistFraction,
  rollUniversalVariance,
  contextMultiplierFor,
  APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT,
} from "../../src/lib/combatMath.js";
import { maxHp } from "../../src/lib/productionMath/index.js";
import { computeCombatantTotalStats } from "../../src/lib/statEngine.js";
import { CLASSES } from "../../src/lib/gameData.js";
import { SimulateCombat } from "../src/shared/combatService.js";

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

function seqRng(seq) {
  let i = 0;
  return () => {
    if (i >= seq.length) return 0.99;
    return seq[i++];
  };
}

function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
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
    snapshotStats: true,
  };
}

function pveFoe(extras = {}) {
  return {
    id: "foe",
    name: "Foe",
    class: "Vanguard",
    level: 50,
    missionEnemy: true,
    suppressClassPassive: true,
    stats: { strength: 80, agility: 80, intellect: 80, vitality: 80, luck: 40 },
    ...extras,
  };
}

console.log("\nPhase 3 combat fixtures\n");

test("Universal variance injects 0.90 / 1.00 / 1.10", () => {
  assert.equal(rollUniversalVariance(() => 0, null), VARIANCE_MIN);
  assert.equal(rollUniversalVariance(() => 0.5, null), 1);
  assert.equal(rollUniversalVariance(() => 1, null), VARIANCE_MAX);
  assert.equal(rollUniversalVariance(() => 0.3, 1.1), 1.1);
});

test("Context multipliers: Mission / Dungeon / Arena", () => {
  assert.equal(combatContextMultiplier({ content: "mission", role: "player" }), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(missionEnemyOutgoingMultiplier(1), 0.3);
  assert.equal(missionEnemyOutgoingMultiplier(10), 0.35);
  assert.equal(missionEnemyOutgoingMultiplier(15), 0.5);
  assert.equal(missionEnemyOutgoingMultiplier(20), 2.5);
  assert.equal(missionEnemyOutgoingMultiplier(50), 6);
  assert.equal(missionEnemyOutgoingMultiplier(100), 10);
  assert.equal(missionEnemyOutgoingMultiplier(200), 12);
  assert.equal(combatContextMultiplier({ content: "dungeon", role: "player" }), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(combatContextMultiplier({ content: "dungeon", role: "enemy" }), DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT);
  assert.equal(combatContextMultiplier({ content: "arena", role: "player" }), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(combatContextMultiplier({ content: "arena", role: "enemy" }), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT, false);
  assert.equal(contextMultiplierFor("mission", "enemy", 50), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(contextMultiplierFor("mission", "player", 50), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(contextMultiplierFor("dungeon", "enemy", 50), DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT);
  assert.equal(contextMultiplierFor("dungeon", "player", 50), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(contextMultiplierFor("arena", "enemy", 50), PLAYER_COMBAT_CONTEXT_MULT);
});

test("Mission early base-damage ramp is separate from outgoing curve", () => {
  assert.equal(missionEnemyBaseDamage(1), 5);
  assert.ok(Math.abs(missionEnemyBaseDamage(24) - (5 + 10 * 23 / 24)) < 1e-12);
  assert.equal(missionEnemyBaseDamage(25), 15);
});

test("resolveBasicHit emits resist fields; True bypasses resist", () => {
  const attacker = {
    primaryValue: 100,
    damageBase: 15,
    crit: 0,
    damageChannel: "might",
    contextMult: 1,
  };
  const defender = { resists: { might: 0.2, reflex: 0, tech: 0 } };
  const hit = resolveBasicHit(attacker, defender, { canCrit: false, rng: () => 0.5 });
  assert.ok(hit.resistPercent > 0);
  assert.ok(hit.resistedAmount > 0);
  const trueHit = resolveBasicHit(attacker, defender, {
    canCrit: false,
    rng: () => 0.5,
    damageTypeForMitigation: "true",
  });
  assert.equal(trueHit.resistPercent, 0);
  assert.equal(resistFraction(defender.resists, "might"), 0.2);
});

test("Vanguard own Dodge primes 1.5× which is consumed even without a hit", () => {
  const v = buildFighter(baseChar("Vanguard"), [], "player");
  onCombatStart(v);
  const events = [];
  activateKineticTantrum(v, "normal", events);
  assert.equal(v.passiveState.kineticTantrum, "normal");
  assert.ok(events.some((e) => e.kind === "kinetic_tantrum_normal"));
  const mods = beginNormalAttackModifiers(v);
  assert.equal(mods.guaranteedHit, false);
  assert.equal(mods.guaranteedCrit, true);
  endNormalAttackModifiers(v, mods, events);
  assert.equal(v.passiveState.kineticTantrum, null);
  assert.ok(events.some((e) => e.kind === "kinetic_tantrum_consumed"));
});

test("Vanguard enemy Dodge primes 2.0× guaranteed hit; Strong beats Normal", () => {
  const v = buildFighter(baseChar("Vanguard"), [], "player");
  onCombatStart(v);
  const events = [];
  activateKineticTantrum(v, "normal", events);
  activateKineticTantrum(v, "strong", events);
  assert.equal(v.passiveState.kineticTantrum, "strong");
  const mods = beginNormalAttackModifiers(v);
  assert.equal(mods.guaranteedHit, true);
  assert.equal(mods.critMultOverride, 2);
});

test("Forced Phantom miss does not prime Kinetic Tantrum", () => {
  const result = simulateBattle(baseChar("Vanguard"), baseChar("Shadow Operative"), [], [], {
    rng: seqRng([0.1]),
    content: "arena",
  });
  const first = result.events.find((e) => e.type === "miss" || e.type === "attack" || e.type === "dodge");
  assert.equal(first?.type, "miss");
  assert.equal(first?.missKind, "phantom_signal");
  assert.ok(!result.events.some((e) => e.kind === "kinetic_tantrum_strong" || e.kind === "kinetic_tantrum_normal"));
});

test("Astral Barrier 10% proc / no-proc / refresh not stack", () => {
  const w = buildFighter(baseChar("Astral Warden"), [], "player");
  onCombatStart(w);
  const proc = onTurnStart(w, () => 0.05);
  assert.ok(proc.some((e) => e.kind === "astral_barrier_created"));
  const amount = w.barrier;
  assert.ok(amount > 0);
  w.barrier = 1;
  const refresh = onTurnStart(w, () => 0.05);
  assert.equal(w.barrier, amount);
  assert.ok(refresh.some((e) => e.kind === "astral_barrier_restored"));
  w.barrier = 0;
  const none = onTurnStart(w, () => 0.5);
  assert.equal(w.barrier, 0);
  assert.equal(none.length, 0);
});

test("Shadow first incoming is forced miss; re-primes on 10th own turn", () => {
  const s = buildFighter(baseChar("Shadow Operative"), [], "opponent");
  onCombatStart(s);
  assert.equal(s.passiveState.phantomPending, true);
  const events = [];
  assert.equal(tryPhantomSignalMiss(s, events).forcedMiss, true);
  assert.equal(s.passiveState.phantomPending, false);
  assert.ok(events.some((e) => e.kind === "phantom_signal_miss"));
  for (let i = 0; i < 9; i++) onTurnStart(s, () => 0.99);
  assert.equal(s.passiveState.phantomPending, false);
  const tenth = onTurnStart(s, () => 0.99);
  assert.equal(s.passiveState.phantomPending, true);
  assert.ok(tenth.some((e) => e.kind === "phantom_signal_reprimed"));
});

test("Void Runner start + distinct tricks at total turns 14 and 28", () => {
  const v = buildFighter(baseChar("Void Runner"), [], "player");
  const start = onCombatStart(v, () => 0);
  assert.equal(v.passiveState.dirtyTricks.length, 1);
  assert.ok(start.some((e) => e.kind === "dirty_trick_selected"));
  const ev = [];
  maybeUnlockDirtyTricks(v, DIRTY_TRICK_TURN_TWO, () => 0, ev);
  assert.equal(v.passiveState.dirtyTricks.length, 2);
  maybeUnlockDirtyTricks(v, DIRTY_TRICK_TURN_THREE, () => 0, ev);
  assert.equal(v.passiveState.dirtyTricks.length, 3);
  assert.equal(new Set(v.passiveState.dirtyTricks).size, 3);
  for (const t of DIRTY_TRICKS) assert.ok(v.passiveState.dirtyTricks.includes(t));
});

test("Technomancer 0→6 resolves at 6 then vents 6→4; Crit −2 floor 0", () => {
  const t = buildFighter(baseChar("Technomancer"), [], "player");
  onCombatStart(t);
  const events = [];
  for (let i = 0; i < OVERCLOCK_STACK_CAP; i++) tickOverclockAfterAttempt(t, events);
  assert.equal(t.passiveState.overclockStacks, OVERCLOCK_STACK_CAP);
  assert.ok(Math.abs(1 + OVERCLOCK_STACK_CAP * OVERCLOCK_DEALT_PER_STACK - 1.75) < 1e-12);
  tickOverclockAfterAttempt(t, events);
  assert.equal(t.passiveState.overclockStacks, OVERCLOCK_STACK_CAP - OVERCLOCK_VENT_STACKS);
  assert.ok(events.some((e) => e.kind === "overclock_vented" && e.before === 6 && e.after === 4));
  t.passiveState.overclockStacks = 1;
  const loss = [];
  removeOverclockStacks(t, OVERCLOCK_CRIT_STACK_LOSS, loss);
  assert.equal(t.passiveState.overclockStacks, 0);
  assert.ok(loss.some((e) => e.kind === "overclock_stacks_removed"));
});

test("Orbital Assistant cadence 2/4/6/8/10 then 13/16/19", () => {
  const expected = [2, 4, 6, 8, 10, 13, 16, 19, 22];
  for (let n = 1; n <= 22; n++) {
    assert.equal(isOrbitalActivationTurn(n), expected.includes(n), `turn ${n}`);
  }
});

test("Orbital equal selection + Defensive Protocol consume event", () => {
  const eng = buildFighter(baseChar("Cosmic Engineer"), [], "player");
  const foe = buildFighter(pveFoe({ vitality: 5000 }), [], "opponent");
  foe.hp = 1e9;
  foe.dodge = 0;
  onCombatStart(eng);
  onCombatStart(foe);
  eng.passiveState.engineerTurns = 1;
  const defEv = [];
  maybeOrbitalAssistant(eng, foe, defEv, () => 0.4); // pick index 1 → defensive
  assert.ok(defEv.some((e) => e.kind === "orbital_assistant_activated" && e.effect === "defensive_protocol"));
  assert.ok(defEv.some((e) => e.kind === "defensive_protocol_applied"));
  const hitEv = [];
  const res = applyDamageWithBarrier(eng, 100, hitEv);
  assert.equal(res.finalIncoming, 75);
  assert.ok(hitEv.some((e) => e.kind === "defensive_protocol_consumed" && e.amount === 25));
});

test("Mission / Arena / Dungeon / Wormhole all use simulateBattle", () => {
  const player = baseChar("Technomancer");
  const mission = SimulateCombat({ player, opponent: pveFoe(), rng: seededRng(3), mode: "mission" });
  const dungeon = SimulateCombat({
    player,
    opponent: { ...pveFoe(), missionEnemy: false, dungeonEnemy: true },
    rng: seededRng(3),
    mode: "dungeon",
  });
  const arena = SimulateCombat({
    player,
    opponent: baseChar("Vanguard"),
    rng: seededRng(3),
    mode: "arena",
  });
  const wormhole = SimulateCombat({
    player,
    opponent: { ...pveFoe(), missionEnemy: false, dungeonEnemy: true },
    rng: seededRng(3),
    mode: "wormhole",
  });
  assert.equal(mission.content, "mission");
  assert.equal(dungeon.content, "dungeon");
  assert.equal(arena.content, "arena");
  assert.equal(wormhole.content, "dungeon");
  for (const c of [mission, dungeon, arena, wormhole]) {
    assert.ok(c.events.some((e) => e.type === "initiative"));
    assert.ok(c.events.some((e) => e.type === "attack" || e.type === "dodge" || e.type === "miss"));
    assert.ok(c.telemetry);
    assert.ok(c.playerEnd && typeof c.playerEnd.overclockStacks === "number");
  }
});

test("Structured events for Dodge + Overclock + Barrier", () => {
  const tech = buildFighter(baseChar("Technomancer"), [], "player");
  const foe = buildFighter(pveFoe(), [], "opponent");
  onCombatStart(tech);
  onCombatStart(foe);
  foe.dodge = 1;
  const events = [];
  resolveNormalAttack(tech, foe, events, { rng: () => 0 });
  assert.ok(events.some((e) => e.type === "dodge" && e.naturalDodge));
  assert.ok(events.some((e) => e.kind === "overclock_stack_gained"));
});

test("L1–L2000 remain finite with no NaN", () => {
  for (const L of [1, 10, 50, 100, 500, 800, 1500, 2000]) {
    const battle = simulateBattle(baseChar("Vanguard", L), pveFoe({ level: L }), [], [], {
      rng: seededRng(L),
      content: "mission",
    });
    assert.ok(Number.isFinite(battle.playerMaxHp) && battle.playerMaxHp > 0, `L${L} player HP`);
    assert.ok(Number.isFinite(battle.opponentMaxHp) && battle.opponentMaxHp > 0, `L${L} foe HP`);
    for (const ev of battle.events) {
      if (ev.damage != null) assert.ok(Number.isFinite(ev.damage), `L${L} damage`);
      if (ev.finalDamage != null) assert.ok(Number.isFinite(ev.finalDamage), `L${L} final`);
    }
    assert.ok(battle.telemetry.totalTurns > 0);
    assert.ok(battle.telemetry.totalTurns < 5000);
  }
});

test("generated foes use snapshot stats; players compose sheet totals", () => {
  const foe = pveFoe({
    stats: { strength: 80, agility: 80, intellect: 80, vitality: 400, luck: 40 },
  });
  const f = buildFighter(foe, [], "opponent", { content: "mission" });
  assert.equal(f.maxHp, maxHp(400));

  const player = {
    name: "Sheet",
    class: "Vanguard",
    level: 1,
    stats: { strength: 999, agility: 999, intellect: 999, vitality: 999, luck: 999 },
  };
  const p = buildFighter(player, [], "player");
  assert.equal(p.maxHp, maxHp(CLASSES.Vanguard.baseStats.vitality));
  assert.ok(p.maxHp < maxHp(999));
});

test("equipped Gear is counted exactly once", () => {
  const player = { name: "G", class: "Vanguard", level: 1 };
  const gear = [{ id: "w", stats: { vitality: 10, strength: 5 } }];
  const none = computeCombatantTotalStats(player, []);
  const once = computeCombatantTotalStats(player, gear);
  assert.equal(once.vitality, none.vitality + 10);
  assert.equal(once.strength, none.strength + 5);
  const foe = pveFoe({
    stats: { strength: 10, agility: 10, intellect: 10, vitality: 100, luck: 10 },
  });
  assert.equal(buildFighter(foe, [], "opponent").maxHp, maxHp(100));
  assert.equal(buildFighter(foe, gear, "opponent").maxHp, maxHp(110));
});

test("Fire Support True Damage skips resist; Defensive Protocol still applies", () => {
  const eng = buildFighter(baseChar("Cosmic Engineer"), [], "player");
  const foe = buildFighter(pveFoe({ vitality: 5000 }), [], "opponent");
  foe.hp = 1e9;
  foe.dodge = 0;
  foe.resists = { might: 0.3, reflex: 0.3, tech: 0.3 };
  onCombatStart(eng);
  onCombatStart(foe);
  eng.passiveState.engineerTurns = 1;
  const events = [];
  maybeOrbitalAssistant(eng, foe, events, () => 0);
  const fs = events.find((e) => e.kind === "fire_support");
  assert.ok(fs);
  assert.equal(fs.damageType, "TRUE");
  assert.equal(fs.trueDamage, true);
  assert.ok(fs.damage > 0);
  foe.passiveState.nextIncomingDamageMult = 0.75;
  const reduced = [];
  const res = applyDamageWithBarrier(foe, 100, reduced);
  assert.equal(res.finalIncoming, 75);
  assert.ok(reduced.some((e) => e.kind === "defensive_protocol_consumed"));
});

test("Stim Injector opening charges emit consume events", () => {
  const foe = pveFoe({
    stats: { vitality: 8000, strength: 1, agility: 1, intellect: 1, luck: 1 },
  });
  const battle = simulateBattle(baseChar("Void Runner"), foe, [], [], {
    rng: () => 0.9,
    content: "mission",
  });
  assert.ok(battle.events.some((e) => e.kind === "dirty_trick_selected" && e.dirtyTrick === "stim_injector"));
  assert.ok(battle.events.filter((e) => e.kind === "stim_injector_charge").length >= 1);
});

test("Death ends combat; no extra Orbital after HP 0", () => {
  const player = baseChar("Cosmic Engineer", 80, {
    strength: 800, agility: 100, intellect: 900, vitality: 800, luck: 400,
  });
  const foe = pveFoe({
    stats: { strength: 1, agility: 1, intellect: 1, vitality: 1, luck: 1 },
    level: 1,
  });
  const battle = simulateBattle(player, foe, [], [], { rng: () => 0.99, content: "mission" });
  assert.equal(battle.winner, "player");
  assert.equal(battle.opponentEnd.hp, 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
