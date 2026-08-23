/**
 * Natural Dodge / Crit / Resistance level-cap retune.
 * Run: npm run test:derived-stat-caps
 */
import assert from "node:assert/strict";
import * as M from "@/lib/productionMath";
import { resolveNormalAttack } from "../../src/lib/arenaEngine.js";
import {
  createPassiveState,
  onCombatStart,
  DIRTY_TRICK_FLAT_BONUS,
  DIRTY_TRICKS,
} from "../../src/lib/classPassives.js";
import { CRIT_MULT } from "../../src/lib/statEngine.js";
import { APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT } from "../../src/lib/combatMath.js";
import { getFullSetAttributeBudget } from "../../src/lib/itemGeneration.js";
import { MISSION_PLAYER_GEAR_FILL } from "../../src/lib/expectedPlayerAttributes.js";

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

const CHECKPOINTS = Object.freeze([1, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100]);
const ACCEPTED_DODGE = Object.freeze({
  1: 0.08, 10: 0.1113, 20: 0.1401, 25: 0.15, 30: 0.1572, 40: 0.1681,
  50: 0.1762, 60: 0.184, 70: 0.1937, 75: 0.2, 80: 0.2078, 90: 0.2273, 100: 0.25,
});
const ACCEPTED_CRIT_RESIST = Object.freeze({
  1: 0.1, 10: 0.1321, 20: 0.163, 25: 0.175, 30: 0.1849, 40: 0.2013,
  50: 0.2148, 60: 0.2277, 70: 0.2418, 75: 0.25, 80: 0.259, 90: 0.2788, 100: 0.3,
});
const ANCHOR_LEVELS = Object.freeze([1, 25, 75, 100]);
const POST_MATURE_LEVELS = Object.freeze([101, 200, 500, 800, 1500, 2000]);
const CLASSES = Object.freeze([
  "Vanguard",
  "Astral Warden",
  "Shadow Operative",
  "Void Runner",
  "Technomancer",
  "Cosmic Engineer",
]);
const EXAMPLE_LEVELS = Object.freeze([1, 10, 20, 25, 50, 75, 100]);
const TRIALS = 8000;
const FREQUENCY_TOLERANCE = 0.02;
const PP_SCALE = 100;
const ATTR_STR = 0;
const ATTR_AGI = 1;
const ATTR_INT = 2;
const ATTR_LUCK = 4;

function pct(fraction) {
  return (fraction * PP_SCALE).toFixed(2);
}

function ppDelta(actual, accepted) {
  return Math.abs(actual - accepted) * PP_SCALE;
}

function ungearedAttrs(className, level) {
  const start = M.startingAttributesForClass(className);
  const free = M.freeLevelAttributes(level, M.classPrimaryIndex(className));
  return start.map((v, i) => v + free[i]);
}

function playerSpendWeights(primaryIndex) {
  const table = M.PLAYER_FREE_ATTR_WEIGHTS;
  const w = [table.off1, table.off1, table.off1, table.vitality, table.luck];
  const offs = [0, 1, 2].filter((i) => i !== primaryIndex);
  w[primaryIndex] = table.primary;
  w[offs[0]] = table.off1;
  w[offs[1]] = table.off2;
  return w;
}

function gearedAttrs(className, level) {
  const base = ungearedAttrs(className, level);
  const gearTotal = Math.round(getFullSetAttributeBudget(level) * MISSION_PLAYER_GEAR_FILL);
  const gear = M.allocateByWeights(gearTotal, playerSpendWeights(M.classPrimaryIndex(className)));
  return {
    attrs: base.map((v, i) => v + gear[i]),
    gearTotal,
  };
}

function binding(fromAttr, levelCap) {
  if (Math.abs(fromAttr - levelCap) <= 1e-12) return "tied";
  return fromAttr < levelCap ? "attribute" : "level-cap";
}

function fmtPct(fraction) {
  return `${(fraction * PP_SCALE).toFixed(4)}%`;
}

function logDerivedRow(label, attr, fromAttr, levelCap, actual, bindLabel) {
  console.log(
    `    ${label.padEnd(8)} attr=${String(attr).padStart(5)}  fromAttr=${fmtPct(fromAttr).padStart(10)}  `
    + `cap=${fmtPct(levelCap).padStart(10)}  actual=${fmtPct(actual).padStart(10)}  bind=${bindLabel}`,
  );
}

function logStateTable(title, className, level, attrs) {
  const arch = M.classArchetype(className);
  const dodgeCap = M.naturalDodgeLevelCap(level);
  const critCap = M.naturalCritResistLevelCap(level);
  const convertedAgi = arch === "Reflex"
    ? attrs[ATTR_AGI] * M.reflexAgiConversion(level)
    : attrs[ATTR_AGI];
  const dodgeFrom = M.attributeDerivedAmount(level, convertedAgi, M.NATURAL_DODGE_CAP);
  const critFrom = M.attributeDerivedAmount(level, attrs[ATTR_LUCK], M.NATURAL_CRIT_CAP, {
    forMaxMult: M.CRIT_FORMAX_MULT,
    attrExponent: M.CRIT_ATTR_EXPONENT,
  });
  const dodge = M.dodgeChance(level, attrs[ATTR_AGI], arch);
  const crit = M.critChance(level, attrs[ATTR_LUCK]);
  const res = M.resistances(level, attrs, arch);
  console.log(`  ${title} ${className} (${arch}) L${level}`);
  logDerivedRow(
    "Dodge",
    attrs[ATTR_AGI],
    dodgeFrom,
    dodgeCap,
    dodge,
    binding(dodgeFrom, dodgeCap),
  );
  logDerivedRow(
    "Crit",
    attrs[ATTR_LUCK],
    critFrom,
    critCap,
    crit,
    binding(critFrom, critCap),
  );
  const resistAttr = {
    might: arch === "Might" ? null : attrs[ATTR_STR],
    reflex: arch === "Reflex" ? null : (arch === "Might" ? attrs[ATTR_INT] : attrs[ATTR_STR]),
    tech: arch === "Tech" ? null : attrs[ATTR_INT],
  };
  for (const channel of ["might", "reflex", "tech"]) {
    const attr = resistAttr[channel];
    if (attr == null) {
      logDerivedRow(`${channel[0].toUpperCase()}${channel.slice(1)}R`, 0, 0, critCap, 0, "n/a");
      continue;
    }
    const fromAttr = M.attributeDerivedAmount(level, attr, M.NATURAL_RESIST_CAP);
    logDerivedRow(
      `${channel[0].toUpperCase()}${channel.slice(1)}R`,
      attr,
      fromAttr,
      critCap,
      res[channel],
      binding(fromAttr, critCap),
    );
  }
}

function fighter(className, side, overrides = {}) {
  return {
    side,
    name: className,
    className,
    hp: 1_000_000,
    maxHp: 1_000_000,
    barrier: 0,
    primaryValue: 100,
    archetype: "str",
    standardAttack: 100,
    canonicalDamage: 100,
    damageBase: 15,
    crit: 0,
    critMult: CRIT_MULT,
    dodge: 0,
    resists: { might: 0, reflex: 0, tech: 0 },
    damageChannel: "might",
    damageType: "strength",
    contextMult: 1,
    suppressClassPassive: true,
    stats: {},
    passive: null,
    passiveState: createPassiveState(),
    ...overrides,
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rate(fn) {
  let hits = 0;
  for (let i = 0; i < TRIALS; i++) {
    if (fn(i)) hits += 1;
  }
  return hits / TRIALS;
}

console.log("derived-stat-caps");

test("exact Dodge anchors and mature plateau", () => {
  assert.equal(M.naturalDodgeLevelCap(1), 0.08);
  assert.equal(M.naturalDodgeLevelCap(25), 0.15);
  assert.equal(M.naturalDodgeLevelCap(75), 0.20);
  assert.equal(M.naturalDodgeLevelCap(100), 0.25);
  for (const L of POST_MATURE_LEVELS) {
    assert.equal(M.naturalDodgeLevelCap(L), 0.25);
  }
});

test("exact Crit/Resistance anchors and mature plateau", () => {
  assert.equal(M.naturalCritResistLevelCap(1), 0.10);
  assert.equal(M.naturalCritResistLevelCap(25), 0.175);
  assert.equal(M.naturalCritResistLevelCap(75), 0.25);
  assert.equal(M.naturalCritResistLevelCap(100), 0.30);
  for (const L of POST_MATURE_LEVELS) {
    assert.equal(M.naturalCritResistLevelCap(L), 0.30);
  }
});

test("integer L1–L100 is finite, monotone, non-negative, and within mature caps", () => {
  let prevD = -1;
  let prevC = -1;
  for (let L = 1; L <= 100; L++) {
    const d = M.naturalDodgeLevelCap(L);
    const c = M.naturalCritResistLevelCap(L);
    assert.ok(Number.isFinite(d) && Number.isFinite(c));
    assert.ok(d >= 0 && c >= 0);
    assert.ok(d <= 0.25 + 1e-15);
    assert.ok(c <= 0.30 + 1e-15);
    assert.ok(d >= prevD - 1e-15);
    assert.ok(c >= prevC - 1e-15);
    prevD = d;
    prevC = c;
  }
});

test("checkpoint table vs implemented PCHIP (report pp delta; anchors stay exact)", () => {
  console.log("\n  Checkpoint  Dodge cap   accepted   Δpp     Crit/Res cap  accepted   Δpp");
  for (const L of CHECKPOINTS) {
    const d = M.naturalDodgeLevelCap(L);
    const c = M.naturalCritResistLevelCap(L);
    const ad = ACCEPTED_DODGE[L];
    const ac = ACCEPTED_CRIT_RESIST[L];
    const dd = ppDelta(d, ad);
    const dc = ppDelta(c, ac);
    console.log(
      `  L${String(L).padStart(3)}      ${pct(d)}%      ${pct(ad)}%    ${dd.toFixed(4)}    ${pct(c)}%         ${pct(ac)}%    ${dc.toFixed(4)}`,
    );
    if (ANCHOR_LEVELS.includes(L)) {
      assert.equal(d, ad);
      assert.equal(c, ac);
    }
  }
});

test("actual stat is min(attribute-derived, level cap), not a guaranteed floor", () => {
  const tiny = M.derivedStat(25, 1, M.NATURAL_DODGE_CAP);
  const fromTiny = M.attributeDerivedAmount(25, 1, M.NATURAL_DODGE_CAP);
  assert.ok(tiny < M.naturalDodgeLevelCap(25) - 1e-6);
  assert.equal(tiny, fromTiny);
  const saturated = M.derivedStat(25, 1e9, M.NATURAL_DODGE_CAP);
  assert.equal(saturated, M.naturalDodgeLevelCap(25));
});

test("Reflex AGI conversion is unchanged", () => {
  assert.ok(Math.abs(M.reflexAgiConversion(1) - 0.225) < 1e-12);
  assert.ok(Math.abs(M.reflexAgiConversion(100) - 0.225) < 1e-12);
  assert.ok(Math.abs(M.reflexAgiConversion(394) - 0.225) < 1e-12);
  assert.ok(Math.abs(M.reflexAgiConversion(800) - 0.325) < 1e-12);
});

test("Crit ForMax ×1.55 and exponent 1.80 are unchanged", () => {
  assert.equal(M.CRIT_FORMAX_MULT, 1.55);
  assert.equal(M.CRIT_ATTR_EXPONENT, 1.8);
  const fromAttr = M.attributeDerivedAmount(100, 350, M.NATURAL_CRIT_CAP, {
    forMaxMult: M.CRIT_FORMAX_MULT,
    attrExponent: M.CRIT_ATTR_EXPONENT,
  });
  assert.ok(Math.abs(M.critChance(100, 350) - Math.min(fromAttr, 0.30)) < 1e-12);
});

test("resistance mapping unchanged (no self-resist; 100% into applicable channels)", () => {
  const attrs = [40, 10, 30, 20, 10];
  const m = M.resistances(100, attrs, "Might");
  const r = M.resistances(100, attrs, "Reflex");
  const t = M.resistances(100, attrs, "Tech");
  assert.equal(m.might, 0);
  assert.equal(r.reflex, 0);
  assert.equal(t.tech, 0);
  assert.equal(m.reflex, m.tech);
  assert.equal(t.might, t.reflex);
  assert.ok(m.reflex > 0 && r.might > 0 && r.tech > 0 && t.might > 0);
});

test("ungeared class examples distinguish ceiling vs actual", () => {
  console.log("\n  Ungeared starting + free-level attributes (no gear, no purchases)");
  for (const cls of CLASSES) {
    const arch = M.classArchetype(cls);
    console.log(`  --- ${cls} (${arch}) ---`);
    for (const L of EXAMPLE_LEVELS) {
      const a = ungearedAttrs(cls, L);
      const dodge = M.dodgeChance(L, a[ATTR_AGI], arch);
      const crit = M.critChance(L, a[ATTR_LUCK]);
      const res = M.resistances(L, a, arch);
      const dCap = M.naturalDodgeLevelCap(L);
      const cCap = M.naturalCritResistLevelCap(L);
      console.log(
        `  L${L} AGI=${a[ATTR_AGI]} LUCK=${a[ATTR_LUCK]} STR=${a[ATTR_STR]} INT=${a[ATTR_INT]}  `
        + `Dodge ${pct(dodge)}% (cap ${pct(dCap)}%)  Crit ${pct(crit)}% (cap ${pct(cCap)}%)  `
        + `MightR ${pct(res.might)}% ReflexR ${pct(res.reflex)}% TechR ${pct(res.tech)}%`,
      );
      assert.ok(dodge <= dCap + 1e-12);
      assert.ok(crit <= cCap + 1e-12);
      assert.ok(res.might <= cCap + 1e-12);
      assert.ok(res.reflex <= cCap + 1e-12);
      assert.ok(res.tech <= cCap + 1e-12);
    }
  }
});

test("Flashbang still bypasses the natural Dodge cap", () => {
  const v = fighter("Void Runner", "player", { dodge: M.NATURAL_DODGE_CAP, suppressClassPassive: false });
  onCombatStart(v, () => 0);
  assert.equal(v.passiveState.dirtyTrick, DIRTY_TRICKS[0]);
  assert.ok(Math.abs(v.dodge - (M.NATURAL_DODGE_CAP + DIRTY_TRICK_FLAT_BONUS)) < 1e-12);
  assert.ok(v.dodge > M.NATURAL_DODGE_CAP);
});

test("Targeting Beacon still bypasses the natural Crit cap", () => {
  const v = fighter("Void Runner", "player", { crit: M.NATURAL_CRIT_CAP, suppressClassPassive: false });
  onCombatStart(v, () => 0.4);
  assert.equal(v.passiveState.dirtyTrick, "targeting_beacon");
  assert.ok(Math.abs(v.crit - (M.NATURAL_CRIT_CAP + DIRTY_TRICK_FLAT_BONUS)) < 1e-12);
  assert.ok(v.crit > M.NATURAL_CRIT_CAP);
});

test("combat dodge/crit frequencies track configured chances", () => {
  const dodgeChance = 0.14;
  const critChance = 0.175;
  const resist = 0.10;
  const dodgeRate = rate((i) => {
    const atk = fighter("Vanguard", "player");
    const def = fighter("Technomancer", "opponent", { dodge: dodgeChance });
    const events = [];
    resolveNormalAttack(atk, def, events, { rng: mulberry32(1000 + i) });
    return events.some((e) => e.type === "dodge" && e.naturalDodge);
  });
  const critRate = rate((i) => {
    const atk = fighter("Vanguard", "player", { crit: critChance, dodge: 0 });
    const def = fighter("Technomancer", "opponent", { dodge: 0 });
    const events = [];
    resolveNormalAttack(atk, def, events, { rng: mulberry32(2000 + i), forcedCanDodge: false });
    return events.some((e) => e.crit);
  });
  const resistRate = rate((i) => {
    const atk = fighter("Vanguard", "player", { crit: 0 });
    const def = fighter("Technomancer", "opponent", {
      dodge: 0,
      resists: { might: resist, reflex: 0, tech: 0 },
    });
    const events = [];
    resolveNormalAttack(atk, def, events, { rng: mulberry32(3000 + i), forcedCanDodge: false });
    const hit = events.find((e) => e.type === "attack");
    return hit && Math.abs(hit.resistPercent - resist) < 1e-12;
  });
  console.log(`  observed dodge ${pct(dodgeRate)}% vs ${pct(dodgeChance)}%`);
  console.log(`  observed crit ${pct(critRate)}% vs ${pct(critChance)}%`);
  console.log(`  resistPercent match ${pct(resistRate)}%`);
  assert.ok(Math.abs(dodgeRate - dodgeChance) < FREQUENCY_TOLERANCE, `dodge ${dodgeRate}`);
  assert.ok(Math.abs(critRate - critChance) < FREQUENCY_TOLERANCE, `crit ${critRate}`);
  assert.equal(resistRate, 1);
});

test("Phantom Signal forced miss is distinct from natural Dodge", () => {
  const atk = fighter("Vanguard", "player");
  const def = fighter("Shadow Operative", "opponent", {
    dodge: 0.9,
    suppressClassPassive: false,
    name: "Shadow Operative",
  });
  def.passiveState.phantomPending = true;
  const events = [];
  resolveNormalAttack(atk, def, events, { rng: () => 0 });
  assert.equal(events[0].missKind, "phantom_signal");
  assert.equal(events[0].type, "miss");
  assert.equal(events[0].dodged, false);
  assert.ok(!events.some((e) => e.type === "dodge"));
});

test("realistic actual-stat diagnostics A (start+free) and B (on-level gear fill)", () => {
  console.log("\n  Diagnostic A = starting + free-level attributes only");
  console.log("  Diagnostic B = A + MISSION_PLAYER_GEAR_FILL × getFullSetAttributeBudget, allocated with PLAYER_FREE_ATTR_WEIGHTS");
  for (const cls of CLASSES) {
    for (const L of EXAMPLE_LEVELS) {
      logStateTable("[A]", cls, L, ungearedAttrs(cls, L));
      const geared = gearedAttrs(cls, L);
      logStateTable(`[B gear=${geared.gearTotal}]`, cls, L, geared.attrs);
    }
  }
});

test("native player damage architecture and Mission outgoing staging unchanged", () => {
  assert.equal(M.PLAYER_BASE_DAMAGE_FLAT, 37.5);
  assert.equal(M.PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT, 0.008);
  assert.equal(M.PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT, 1.727);
  assert.equal(M.PLAYER_COMBAT_CONTEXT_MULT, 1);
  assert.equal(M.DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT, 1.10);
  assert.equal(APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT, false);
  assert.equal(M.PLAYER_BASE_DAMAGE_SCALE, undefined);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
