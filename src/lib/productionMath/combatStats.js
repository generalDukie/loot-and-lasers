/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 1 LIVE FOR CHARACTER-SHEET STATS
 *
 * Combat event resolution still uses src/lib/statEngine.js until Phase 3.
 */
import { roundHalfEven } from "./rounding.js";
import {
  COMBAT_CONTEXT_MULT,
  CRIT_ATTR_EXPONENT,
  CRIT_FORMAX_MULT,
  GENERIC_ATTR_EXPONENT,
  GENERIC_EARLY_EXPONENT,
  GENERIC_FORMAX_AT_100,
  GENERIC_FORMAX_EXPONENT,
  MISSION_OUTGOING_ASYMPTOTE,
  MISSION_OUTGOING_KNOTS,
  NATURAL_CRIT_CAP,
  NATURAL_DODGE_CAP,
  NATURAL_RESIST_CAP,
  REFLEX_BLEND_HALF_WIDTH,
  REFLEX_CONVERSION_HIGH,
  REFLEX_CONVERSION_LOW,
  REFLEX_RAMP_END_LEVEL,
  REFLEX_RAMP_START_LEVEL,
} from "./constants.js";

function levelNum(level) {
  return Math.max(1, Number(level) || 1);
}

function attrNum(attr) {
  return Math.max(0, Number(attr) || 0);
}

/** Certified combat HP: Python round(50 + 2.5*VIT + 0.008*VIT^2). */
export function maxHp(vitality) {
  const v = attrNum(vitality);
  return Math.max(1, roundHalfEven(50 + 2.5 * v + 0.008 * v * v));
}

/** Raw standard attack. Variance is NOT included. */
export function rawStandardAttack(primaryAttr) {
  const p = attrNum(primaryAttr);
  return 15 + 0.0032 * p ** 1.727;
}

/** Universal standard-attack variance Uniform(0.90, 1.10). RNG stays outside. */
export function standardAttackWithVariance(primaryAttr, variance = 1) {
  return rawStandardAttack(primaryAttr) * Number(variance);
}

export function genericForMax(level) {
  const L = levelNum(level);
  return GENERIC_FORMAX_AT_100 * (L / 100) ** GENERIC_FORMAX_EXPONENT;
}

/**
 * Generic derived-stat curve (Dodge/Resist and non-Crit specs).
 * Final = min(FromAttr, Early, cap) with ForMax = 700*(L/100)^0.95 and exp 1.20.
 */
export function derivedStat(level, attr, cap, {
  forMaxMult = 1,
  attrExponent = GENERIC_ATTR_EXPONENT,
} = {}) {
  const L = levelNum(level);
  const x = attrNum(attr);
  const fm = genericForMax(L) * forMaxMult;
  const fromAttr = cap * Math.min(1, fm > 0 ? (x / fm) ** attrExponent : 0);
  const early = cap * Math.min(1, (L / 100) ** GENERIC_EARLY_EXPONENT);
  return Math.min(fromAttr, early, cap);
}

export function critChance(level, luck) {
  return derivedStat(level, luck, NATURAL_CRIT_CAP, {
    forMaxMult: CRIT_FORMAX_MULT,
    attrExponent: CRIT_ATTR_EXPONENT,
  });
}

/**
 * Smooth indefinitely valid Reflex AGI→Dodge conversion.
 * Preserves 22.5% through the low plateau, 32.5% at maturity, C1 blends at 400/750.
 */
export function reflexAgiConversion(level) {
  const L = levelNum(level);
  const lo = REFLEX_CONVERSION_LOW;
  const hi = REFLEX_CONVERSION_HIGH;
  const a = REFLEX_RAMP_START_LEVEL;
  const b = REFLEX_RAMP_END_LEVEL;
  const w = REFLEX_BLEND_HALF_WIDTH;
  const slope = (hi - lo) / (b - a);
  const piece = (x) => {
    if (x <= a) return lo;
    if (x >= b) return hi;
    return lo + slope * (x - a);
  };
  const hermite = (t) => t * t * (3 - 2 * t);
  const blend = (x, knot) => {
    const t = (x - (knot - w)) / (2 * w);
    if (t <= 0) return piece(knot - w);
    if (t >= 1) return piece(knot + w);
    const s = hermite(Math.max(0, Math.min(1, t)));
    return piece(knot - w) * (1 - s) + piece(knot + w) * s;
  };
  if (Math.abs(L - a) < w) return blend(L, a);
  if (Math.abs(L - b) < w) return blend(L, b);
  return piece(L);
}

export function dodgeChance(level, agility, archetype = "Might") {
  const converted = archetype === "Reflex"
    ? attrNum(agility) * reflexAgiConversion(level)
    : attrNum(agility);
  return derivedStat(level, converted, NATURAL_DODGE_CAP);
}

/**
 * Three-channel natural resistances. No self-resistance.
 * Might: INT → Reflex+Tech; Reflex: STR→Might, INT→Tech; Tech: STR→Might+Reflex.
 */
export function resistances(level, attrs, archetype) {
  const a = Array.isArray(attrs)
    ? attrs
    : [attrs?.str, attrs?.agi, attrs?.int, attrs?.vit, attrs?.luck];
  const str = attrNum(a[0]);
  const intel = attrNum(a[2]);
  const vs = (x) => derivedStat(level, x, NATURAL_RESIST_CAP);
  if (archetype === "Might") {
    return { might: 0, reflex: vs(intel), tech: vs(intel) };
  }
  if (archetype === "Reflex") {
    return { might: vs(str), reflex: 0, tech: vs(intel) };
  }
  return { might: vs(str), reflex: vs(str), tech: 0 };
}

/** Mission enemy base ramp. EL<25: 5+10*(EL-1)/24; else 15. Endpoint: EL=24 ramps, EL=25 is 15. */
export function missionEnemyBaseDamage(enemyLevel) {
  const EL = levelNum(enemyLevel);
  if (EL < 25) return 5 + 10 * (EL - 1) / 24;
  return 15;
}

/**
 * Mission enemy outgoing final-damage multiplier.
 * Certified piecewise that matures at ×12 for L≥200 — already indefinitely valid.
 * Smooth Hill/sigmoid fits hit knots but distort the L15–L20 cliff (see Phase 0 retry).
 * Intentional production exception: exact certified interpolation for behavioral fidelity.
 */
export function missionEnemyOutgoingMultiplier(level) {
  const L = levelNum(level);
  const knots = MISSION_OUTGOING_KNOTS;
  if (L <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [b, yb] = knots[i];
    const [a, ya] = knots[i - 1];
    if (L <= b) {
      const t = (L - a) / (b - a);
      return ya + t * (yb - ya);
    }
  }
  return MISSION_OUTGOING_ASYMPTOTE;
}

export function combatContextMultiplier({ role, content, level } = {}) {
  if (content === "arena") return COMBAT_CONTEXT_MULT.arena;
  if (content === "mission") {
    return role === "enemy" ? missionEnemyOutgoingMultiplier(level) : COMBAT_CONTEXT_MULT.missionPlayer;
  }
  if (role === "enemy") return COMBAT_CONTEXT_MULT.dungeonWormholeEnemy;
  return COMBAT_CONTEXT_MULT.dungeonWormholePlayer;
}

export function missionPlayerDamageMultiplier() {
  return COMBAT_CONTEXT_MULT.missionPlayer;
}

export function dungeonWormholePlayerDamageMultiplier() {
  return COMBAT_CONTEXT_MULT.dungeonWormholePlayer;
}

export function dungeonWormholeEnemyDamageMultiplier() {
  return COMBAT_CONTEXT_MULT.dungeonWormholeEnemy;
}

export function arenaDamageMultiplier() {
  return COMBAT_CONTEXT_MULT.arena;
}
