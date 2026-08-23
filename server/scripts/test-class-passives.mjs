/**
 * Class passive + combat pipeline tests.
 * Run: npm run test:passives
 */
import assert from "node:assert/strict";
import {
  onCombatStart,
  onTurnStart,
  activateKineticTantrum,
  beginNormalAttackModifiers,
  endNormalAttackModifiers,
  tryPhantomSignalMiss,
  overclockDealtMultiplier,
  overclockTakenMultiplier,
  gainOverclockStack,
  removeOverclockStacks,
  applyDamageWithBarrier,
  maybeOrbitalAssistant,
  hasStimInjector,
  createPassiveState,
  DIRTY_TRICK_FLAT_BONUS,
  ASTRAL_BARRIER_MAX_HP_FRAC,
  ASTRAL_BARRIER_CHANCE,
  tickOverclockAfterAttempt,
  OVERCLOCK_STACK_CAP,
  OVERCLOCK_CRIT_STACK_LOSS,
  PHANTOM_REPRIME_OWN_TURNS,
  STRONG_TANTRUM_CRIT_MULT,
  ACQUIRE_TARGET_CRIT_BONUS,
  FIRE_SUPPORT_FRAC,
  DEFENSIVE_PROTOCOL_REDUCTION,
  PASSIVE_BY_CLASS,
  DIRTY_TRICKS,
  ORBITAL_EFFECTS,
  OVERCLOCK_DEALT_PER_STACK,
  PHANTOM_SIGNAL_CHARGES,
  passiveNameForClass,
} from "../../src/lib/classPassives.js";
import { simulateBattle, resolveNormalAttack, buildFighter } from "../../src/lib/arenaEngine.js";
import { CRIT_CAP, DODGE_CAP, CRIT_MULT } from "../../src/lib/statEngine.js";
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

function fighter(className, side = "player", overrides = {}) {
  const f = {
    side,
    name: className,
    className,
    hp: 1000,
    maxHp: 1000,
    barrier: 0,
    primaryValue: 100,
    archetype: "str",
    standardAttack: 100,
    crit: 0.1,
    critMult: CRIT_MULT,
    dodge: 0.1,
    armorPercent: 0,
    techResistPercent: 0,
    resists: { might: 0, reflex: 0, tech: 0 },
    damageChannel: "might",
    damageType: "strength",
    stats: {},
    passive: null,
    passiveState: createPassiveState(),
    ...overrides,
  };
  return f;
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

function baseChar(className, level = 50) {
  return {
    name: className,
    class: className,
    level,
    race: "Cognati",
    stats: { strength: 200, agility: 200, intellect: 200, vitality: 200, luck: 200 },
  };
}

console.log("\nClass passive tests\n");

// ── Kinetic Tantrum ──────────────────────────────────────────
test("1. Enemy Dodge activates Strong Kinetic Tantrum", () => {
  const v = fighter("Vanguard");
  onCombatStart(v);
  const events = [];
  activateKineticTantrum(v, "strong", events);
  assert.equal(v.passiveState.kineticTantrum, "strong");
  assert.ok(events.some((e) => e.kind === "kinetic_tantrum_strong"));
});

test("2. Strong Kinetic Tantrum guarantees hit + 2.0x Crit", () => {
  const v = fighter("Vanguard");
  onCombatStart(v);
  v.passiveState.kineticTantrum = "strong";
  const mods = beginNormalAttackModifiers(v);
  assert.equal(mods.guaranteedHit, true);
  assert.equal(mods.guaranteedCrit, true);
  assert.equal(mods.critMultOverride, STRONG_TANTRUM_CRIT_MULT);
});

test("3. Vanguard Dodge activates Normal Kinetic Tantrum", () => {
  const v = fighter("Vanguard");
  onCombatStart(v);
  const events = [];
  activateKineticTantrum(v, "normal", events);
  assert.equal(v.passiveState.kineticTantrum, "normal");
  assert.ok(events.some((e) => e.kind === "kinetic_tantrum_normal"));
});

test("4. Normal Kinetic Tantrum guarantees Crit but not hit", () => {
  const v = fighter("Vanguard");
  onCombatStart(v);
  v.passiveState.kineticTantrum = "normal";
  const mods = beginNormalAttackModifiers(v);
  assert.equal(mods.guaranteedCrit, true);
  assert.equal(mods.guaranteedHit, false);
  assert.equal(mods.critMultOverride, 1.5);
});

test("5. Dodge vs Normal Tantrum upgrades to Strong", () => {
  const v = fighter("Vanguard");
  onCombatStart(v);
  v.passiveState.kineticTantrum = "normal";
  const mods = beginNormalAttackModifiers(v);
  const events = [];
  // Simulate dodge upgrade mid-attack
  activateKineticTantrum(v, "strong", events);
  endNormalAttackModifiers(v, mods, events);
  assert.equal(v.passiveState.kineticTantrum, "strong");
});

test("6. Strong cannot be overwritten by Normal", () => {
  const v = fighter("Vanguard");
  onCombatStart(v);
  const events = [];
  activateKineticTantrum(v, "strong", events);
  activateKineticTantrum(v, "normal", events);
  assert.equal(v.passiveState.kineticTantrum, "strong");
  assert.ok(events.some((e) => e.kind === "kinetic_tantrum_blocked_downgrade"));
});

test("7. Phantom Signal miss is not a Dodge (no Kinetic trigger path)", () => {
  const shadow = fighter("Shadow Operative", "opponent");
  onCombatStart(shadow);
  const events = [];
  const r = tryPhantomSignalMiss(shadow, events);
  assert.equal(r.forcedMiss, true);
  assert.equal(events[0].type, "miss");
  assert.equal(events[0].dodged, false);
  assert.equal(events[0].missed, true);
  assert.equal(events[0].hologram, true);
});

test("8–9. Phantom Signal forces the next incoming attack, then must re-prime", () => {
  const shadow = fighter("Shadow Operative");
  onCombatStart(shadow);
  assert.equal(shadow.passiveState.phantomPending, true);
  const events = [];
  assert.equal(tryPhantomSignalMiss(shadow, events).forcedMiss, true);
  assert.equal(shadow.passiveState.phantomPending, false);
  assert.equal(tryPhantomSignalMiss(shadow, events).forcedMiss, false);
  assert.equal(events.filter((e) => e.missKind === "phantom_signal").length, 1);
});

// ── Astral Barrier ───────────────────────────────────────────
test("10–12. Astral Barrier 10% proc, 15% Max HP, restore not stack", () => {
  const w = fighter("Astral Warden", "player", { maxHp: 1000, hp: 1000 });
  onCombatStart(w);
  // Force proc
  let events = onTurnStart(w, () => 0.05);
  assert.ok(ASTRAL_BARRIER_CHANCE === 0.1);
  assert.equal(w.barrier, Math.round(1000 * ASTRAL_BARRIER_MAX_HP_FRAC));
  assert.ok(events.some((e) => e.kind === "astral_barrier_created"));

  w.barrier = 50;
  events = onTurnStart(w, () => 0.05);
  assert.equal(w.barrier, Math.round(1000 * ASTRAL_BARRIER_MAX_HP_FRAC));
  assert.ok(events.some((e) => e.kind === "astral_barrier_restored"));

  // No proc
  w.barrier = 0;
  events = onTurnStart(w, () => 0.5);
  assert.equal(w.barrier, 0);
  assert.equal(events.length, 0);
});

test("13. Barrier absorbs damage before HP", () => {
  const w = fighter("Astral Warden", "player", { hp: 1000, maxHp: 1000, barrier: 40 });
  onCombatStart(w);
  w.barrier = 40;
  const events = [];
  const res = applyDamageWithBarrier(w, 25, events);
  assert.equal(res.barrierAbsorbed, 25);
  assert.equal(res.hpDamage, 0);
  assert.equal(w.barrier, 15);
  assert.equal(w.hp, 1000);

  const res2 = applyDamageWithBarrier(w, 30, events);
  assert.equal(res2.barrierAbsorbed, 15);
  assert.equal(res2.hpDamage, 15);
  assert.equal(w.barrier, 0);
  assert.equal(w.hp, 985);
});

// ── Dirty Tricks ─────────────────────────────────────────────
test("14–16. Dirty Tricks selects one; Flashbang/Beacon bypass caps", () => {
  const tricks = new Set();
  for (let i = 0; i < 30; i++) {
    const v = fighter("Void Runner", "player", { dodge: DODGE_CAP / 100, crit: CRIT_CAP / 100 });
    const events = onCombatStart(v, () => i / 30);
    assert.ok(v.passiveState.dirtyTrick);
    tricks.add(v.passiveState.dirtyTrick);
    if (v.passiveState.dirtyTrick === "flashbang") {
      assert.ok(v.dodge > DODGE_CAP / 100);
      assert.ok(Math.abs(v.dodge - (DODGE_CAP / 100 + DIRTY_TRICK_FLAT_BONUS)) < 1e-9);
    }
    if (v.passiveState.dirtyTrick === "targeting_beacon") {
      assert.ok(v.crit > CRIT_CAP / 100);
      assert.ok(Math.abs(v.crit - (CRIT_CAP / 100 + DIRTY_TRICK_FLAT_BONUS)) < 1e-9);
    }
    assert.equal(events.filter((e) => e.kind === "dirty_trick_selected").length, 1);
  }
  assert.ok(tricks.has("flashbang"));
  assert.ok(tricks.has("targeting_beacon"));
  assert.ok(tricks.has("stim_injector"));
});

test("17. Stim Injector opening turn order via simulateBattle", () => {
  // Force stim by controlling Dirty Trick roll: DIRTY_TRICKS[2] when rng floor(rng*3)=2 → rng in [2/3,1)
  // Combat start for player VR then opponent: each calls rng for trick.
  // Initiative skipped when stim. Queue: player, player, opponent...
  const player = baseChar("Void Runner");
  const opp = baseChar("Vanguard");
  // Sequence: player trick roll (≥2/3), opponent unused for VR... opp is Vanguard so no trick.
  // onCombatStart player: one rng for trick. Then stim plan. No initiative rng.
  const rng = seqRng([0.9]); // stim_injector
  const result = simulateBattle(player, opp, [], [], { rng });
  assert.ok(result.events.some((e) => e.dirtyTrick === "stim_injector"));
  assert.ok(result.events.some((e) => e.kind === "stim_injector_turn_order"));
  const attacks = result.events.filter((e) => e.type === "attack" || e.type === "dodge" || e.type === "miss");
  // First two combat actions should be player attacking
  assert.ok(attacks.length >= 2);
  assert.equal(attacks[0].attacker, "player");
  assert.equal(attacks[1].attacker, "player");
  if (attacks[2]) assert.equal(attacks[2].attacker, "opponent");
});

// ── Overclock ────────────────────────────────────────────────
test("18–20. Overclock stacks, multipliers, crit removes 2, floor 0", () => {
  const t = fighter("Technomancer");
  onCombatStart(t);
  const events = [];
  assert.equal(t.passiveState.overclockStacks, 0);
  gainOverclockStack(t, events);
  gainOverclockStack(t, events);
  gainOverclockStack(t, events);
  gainOverclockStack(t, events);
  assert.equal(t.passiveState.overclockStacks, 4);
  assert.ok(Math.abs(overclockDealtMultiplier(t) - (1 + 4 * 0.125)) < 1e-9);
  assert.ok(Math.abs(overclockTakenMultiplier(t) - (1 + 4 * 0.05)) < 1e-9);
  removeOverclockStacks(t, OVERCLOCK_CRIT_STACK_LOSS, events);
  assert.equal(t.passiveState.overclockStacks, 2);
  removeOverclockStacks(t, OVERCLOCK_CRIT_STACK_LOSS, events);
  assert.equal(t.passiveState.overclockStacks, 0);
});

// ── Orbital Assistant ────────────────────────────────────────
test("21–23. Orbital Assistant on engineer turns 2/4/6/8/10; Fire Support secondary True", () => {
  const eng = fighter("Cosmic Engineer", "player", { standardAttack: 100 });
  const foe = fighter("Vanguard", "opponent", { hp: 1000, dodge: 0 });
  onCombatStart(eng);
  onCombatStart(foe);
  const events = [];
  maybeOrbitalAssistant(eng, foe, events, () => 0); // turn 1 — no proc
  assert.equal(eng.passiveState.engineerTurns, 1);
  assert.ok(!events.some((e) => e.kind === "orbital_assistant_activated"));

  // Force fire_support: ORBITAL_EFFECTS[0]
  maybeOrbitalAssistant(eng, foe, events, () => 0);
  assert.equal(eng.passiveState.engineerTurns, 2);
  assert.ok(events.some((e) => e.kind === "orbital_assistant_activated"));
  const fs = events.find((e) => e.kind === "fire_support");
  assert.ok(fs);
  assert.equal(fs.type, "secondary");
  assert.equal(fs.isNormalAttack, false);
  assert.equal(fs.damageType, "TRUE");
  assert.equal(fs.canDodge, true);
  assert.equal(fs.canCrit, false);
  assert.equal(fs.damage, Math.round(100 * FIRE_SUPPORT_FRAC));
});

test("23b. Fire Support can be Dodged (not a normal attack)", () => {
  const eng2 = fighter("Cosmic Engineer", "player", { standardAttack: 100 });
  const foe2 = fighter("Vanguard", "opponent", { hp: 1000, dodge: 1 });
  onCombatStart(eng2);
  onCombatStart(foe2);
  eng2.passiveState.engineerTurns = 1;
  const ev2 = [];
  // effect pick 0 → fire_support; dodge roll 0 → dodge succeeds
  maybeOrbitalAssistant(eng2, foe2, ev2, seqRng([0, 0]));
  assert.ok(ev2.some((e) => e.kind === "fire_support_dodged" && e.dodged));
  assert.ok(!ev2.some((e) => e.kind === "fire_support" && (e.damage || 0) > 0));
  assert.equal(foe2.hp, 1000);
  assert.ok(ev2.some((e) => e.kind === "kinetic_tantrum_normal"));
});

test("24. Defensive Protocol reduces next hit by 25%", () => {
  const eng = fighter("Cosmic Engineer");
  onCombatStart(eng);
  eng.passiveState.nextIncomingDamageMult = 1 - DEFENSIVE_PROTOCOL_REDUCTION;
  const events = [];
  const res = applyDamageWithBarrier(eng, 100, events);
  assert.equal(res.finalIncoming, 75);
  assert.equal(res.hpDamage, 75);
  assert.equal(eng.passiveState.nextIncomingDamageMult, 1);
  assert.ok(events.some((e) => e.kind === "defensive_protocol_consumed"));
});

test("25. Acquire Target +40 Crit uncapped on next attack mods", () => {
  const eng = fighter("Cosmic Engineer", "player", { crit: 0.14 });
  onCombatStart(eng);
  eng.passiveState.nextAttackCritBonus = ACQUIRE_TARGET_CRIT_BONUS;
  const mods = beginNormalAttackModifiers(eng);
  assert.ok(Math.abs(mods.critBonusFlat - 0.4) < 1e-9);
  const effective = eng.crit + mods.critBonusFlat;
  assert.ok(effective > CRIT_CAP / 100);
  assert.ok(Math.abs(effective - 0.54) < 1e-9);
  const events = [];
  endNormalAttackModifiers(eng, mods, events);
  assert.equal(eng.passiveState.nextAttackCritBonus, 0);
});

test("26. Passive state cleared between separate combats", () => {
  const p = baseChar("Technomancer");
  const o = baseChar("Vanguard");
  const r1 = simulateBattle(p, o, [], [], { rng: seededRng(42) });
  const r2 = simulateBattle(p, o, [], [], { rng: seededRng(42) });
  // Fresh fighters each battle — end stacks from fight 1 must not carry via character blob
  assert.deepEqual(
    r1.events.filter((e) => e.kind === "overclock_stack_gained").length,
    r2.events.filter((e) => e.kind === "overclock_stack_gained").length
  );
  // New combat always starts at 0 stacks
  assert.ok(r1.events.some((e) => e.kind === "overclock_ready"));
  assert.ok(r2.events.some((e) => e.kind === "overclock_ready"));
});

test("27. Seeded combat is deterministic", () => {
  const p = baseChar("Astral Warden");
  const o = baseChar("Shadow Operative");
  const a = simulateBattle(p, o, [], [], { rng: seededRng(99) });
  const b = simulateBattle(p, o, [], [], { rng: seededRng(99) });
  assert.equal(a.winner, b.winner);
  assert.equal(a.events.length, b.events.length);
  assert.deepEqual(
    a.events.map((e) => e.type + ":" + (e.kind || "") + ":" + (e.damage ?? "")),
    b.events.map((e) => e.type + ":" + (e.kind || "") + ":" + (e.damage ?? ""))
  );
});

test("Phantom miss does not activate Kinetic on Vanguard attacker", () => {
  const player = baseChar("Vanguard");
  const opp = baseChar("Shadow Operative");
  // Initiative: rng < 0.5 → player first. Use 0.1 so player (Vanguard) attacks first into Phantom.
  const rng = seqRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const result = simulateBattle(player, opp, [], [], { rng });
  const firstCombat = result.events.find((e) => e.type === "miss" || e.type === "attack" || e.type === "dodge");
  assert.equal(firstCombat?.type, "miss");
  assert.equal(firstCombat?.missKind, "phantom_signal");
  assert.ok(!result.events.some((e) => e.kind === "kinetic_tantrum_strong" || e.kind === "kinetic_tantrum_normal"));
});

// ── Restoration 09 expansions ────────────────────────────────
test("Registry maps six finalized classes; no superseded names", () => {
  assert.equal(Object.keys(PASSIVE_BY_CLASS).length, 6);
  assert.equal(PASSIVE_BY_CLASS.Vanguard, "Kinetic Tantrum");
  assert.equal(PASSIVE_BY_CLASS["Astral Warden"], "Astral Barrier");
  assert.equal(PASSIVE_BY_CLASS["Shadow Operative"], "Phantom Signal");
  assert.equal(PASSIVE_BY_CLASS["Void Runner"], "Dirty Tricks");
  assert.equal(PASSIVE_BY_CLASS.Technomancer, "Overclock");
  assert.equal(PASSIVE_BY_CLASS["Cosmic Engineer"], "Orbital Assistant");
  const blob = JSON.stringify(PASSIVE_BY_CLASS);
  assert.ok(!blob.includes("Temper Flare"));
  assert.ok(!blob.includes("Now You See Me"));
  assert.ok(!blob.includes("Bag of Tricks"));
  assert.equal(passiveNameForClass("UnknownClass"), null);
  assert.equal(PHANTOM_SIGNAL_CHARGES, 1);
  assert.equal(PHANTOM_REPRIME_OWN_TURNS, 10);
  assert.equal(OVERCLOCK_STACK_CAP, 6);
  assert.equal(OVERCLOCK_CRIT_STACK_LOSS, 2);
  assert.equal(OVERCLOCK_DEALT_PER_STACK, 0.125);
  assert.equal(DIRTY_TRICKS.length, 3);
  assert.equal(ORBITAL_EFFECTS.length, 3);
});

test("Overclock gains stack on Dodged and Missed normal attacks", () => {
  const tech = buildFighter(baseChar("Technomancer"), [], "player");
  const foe = buildFighter(
    { ...baseChar("Vanguard"), missionEnemy: true, suppressClassPassive: true },
    [],
    "opponent",
  );
  onCombatStart(tech);
  onCombatStart(foe);
  foe.dodge = 1;
  tech.crit = 0;
  const events = [];
  resolveNormalAttack(tech, foe, events, { rng: () => 0 });
  assert.equal(events.filter((e) => e.type === "dodge").length, 1);
  assert.equal(tech.passiveState.overclockStacks, 1);
  assert.ok(events.some((e) => e.kind === "overclock_stack_gained"));
});

test("Barrier broken event emits when barrier depletes", () => {
  const w = fighter("Astral Warden", "player", { hp: 500, maxHp: 500, barrier: 10 });
  const events = [];
  applyDamageWithBarrier(w, 25, events);
  assert.ok(events.some((e) => e.kind === "barrier_absorbed"));
  assert.ok(events.some((e) => e.kind === "barrier_broken"));
  assert.equal(w.barrier, 0);
});

test("Mission/Dungeon SimulateCombat share the same engine; context differs", () => {
  const player = baseChar("Void Runner");
  const opponent = {
    ...baseChar("Vanguard"),
    id: "foe",
    missionEnemy: true,
    suppressClassPassive: true,
  };
  const a = SimulateCombat({ player, opponent, rng: seededRng(55), mode: "mission" });
  const b = SimulateCombat({
    player,
    opponent: { ...opponent, missionEnemy: false, dungeonEnemy: true },
    rng: seededRng(55),
    mode: "dungeon",
  });
  assert.equal(a.content, "mission");
  assert.equal(b.content, "dungeon");
  assert.ok(a.events.some((e) => e.type === "initiative"));
  assert.ok(b.events.some((e) => e.type === "initiative"));
  assert.ok(a.events.some((e) => e.kind === "dirty_trick_selected"));
  assert.ok(b.events.some((e) => e.kind === "dirty_trick_selected"));
});

test("Statistical: Dirty Tricks ~1/3 each", () => {
  const counts = { flashbang: 0, targeting_beacon: 0, stim_injector: 0 };
  const n = 3000;
  for (let i = 0; i < n; i++) {
    const v = fighter("Void Runner");
    onCombatStart(v, seededRng(i * 97 + 3));
    counts[v.passiveState.dirtyTrick] += 1;
  }
  for (const k of DIRTY_TRICKS) {
    const rate = counts[k] / n;
    assert.ok(rate > 0.30 && rate < 0.37, `${k} rate ${rate}`);
  }
});

test("Statistical: Astral Barrier ~10% per Warden turn", () => {
  let procs = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const w = fighter("Astral Warden", "player", { maxHp: 1000, hp: 1000 });
    onCombatStart(w);
    const events = onTurnStart(w, seededRng(i * 13 + 7));
    if (events.length) procs += 1;
  }
  const rate = procs / n;
  assert.ok(rate > 0.08 && rate < 0.12, `barrier proc ${rate}`);
});

test("Statistical: Orbital Assistant actions ~1/3 each when triggered", () => {
  const counts = { fire_support: 0, defensive_protocol: 0, acquire_target: 0 };
  const n = 3000;
  for (let i = 0; i < n; i++) {
    const eng = fighter("Cosmic Engineer", "player", { standardAttack: 50 });
    const foe = fighter("Vanguard", "opponent", { hp: 1e9, dodge: 0 });
    onCombatStart(eng);
    onCombatStart(foe);
    eng.passiveState.engineerTurns = 1;
    const events = [];
    maybeOrbitalAssistant(eng, foe, events, seededRng(i * 41 + 9));
    const act = events.find((e) => e.kind === "orbital_assistant_activated");
    if (act) counts[act.effect] += 1;
  }
  for (const k of ORBITAL_EFFECTS) {
    const rate = counts[k] / n;
    assert.ok(rate > 0.30 && rate < 0.37, `${k} rate ${rate}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
