/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 1 LIVE FOR CHARACTER-SHEET STATS
 * PHASE 3 LIVE FOR COMBAT EVENT RESOLUTION (via src/lib/combatMath.js).
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
  GENERIC_FORMAX_REFERENCE_LEVEL,
  HP_BASE,
  HP_PER_VITALITY,
  HP_VITALITY_SQUARED_COEFFICIENT,
  MISSION_ENEMY_BASE_MATURE,
  MISSION_ENEMY_BASE_RAMP_FLOOR,
  MISSION_ENEMY_BASE_RAMP_FULL_LEVEL,
  MISSION_ENEMY_BASE_RAMP_LEVEL_SPAN,
  MISSION_ENEMY_BASE_RAMP_RISE,
  MISSION_OUTGOING_ASYMPTOTE,
  MISSION_OUTGOING_KNOTS,
  NATURAL_CRIT_CAP,
  NATURAL_DODGE_CAP,
  NATURAL_RESIST_CAP,
  PLAYER_BASE_DAMAGE_FLAT,
  PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT,
  PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT,
  RAW_ATTACK_COEFFICIENT,
  RAW_ATTACK_EXPONENT,
  REFLEX_BLEND_HALF_WIDTH,
  REFLEX_CONVERSION_HIGH,
  REFLEX_CONVERSION_LOW,
  REFLEX_RAMP_END_LEVEL,
  REFLEX_RAMP_START_LEVEL,
  STANDARD_ATTACK_FLAT,
} from "./constants.js";

function levelNum(level) {
  return Math.max(1, Number(level) || 1);
}

function attrNum(attr) {
  return Math.max(0, Number(attr) || 0);
}

/** Unrounded certified HP polynomial — barrier uses 15% of this, then Python round. */
export function unroundedMaxHp(vitality) {
  const v = attrNum(vitality);
  return HP_BASE + HP_PER_VITALITY * v + HP_VITALITY_SQUARED_COEFFICIENT * v * v;
}

/** Certified combat HP: Python round(BASE + PER_VIT*VIT + SQ*VIT^2). */
export function maxHp(vitality) {
  return Math.max(1, roundHalfEven(unroundedMaxHp(vitality)));
}

/**
 * Mission-enemy / historical unscaled polynomial. Variance is NOT included.
 * Optional `flat` replaces the mature STANDARD_ATTACK_FLAT (Mission EL ramp).
 * Not player Base Damage — see playerBaseDamage.
 */
export function rawStandardAttack(primaryAttr, flat = STANDARD_ATTACK_FLAT) {
  const p = attrNum(primaryAttr);
  const base = Number.isFinite(Number(flat)) ? Number(flat) : STANDARD_ATTACK_FLAT;
  return base + RAW_ATTACK_COEFFICIENT * p ** RAW_ATTACK_EXPONENT;
}

/**
 * Canonical player Base Damage (unrounded). Native combat-scale polynomial.
 * No universal player scale is applied after this value.
 */
export function playerBaseDamage(primaryAttr) {
  const p = attrNum(primaryAttr);
  return PLAYER_BASE_DAMAGE_FLAT
    + PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT * p ** PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT;
}

/**
 * Dungeon/Wormhole enemy canonical Base Damage (unrounded).
 * Same native combat-scale polynomial as players; context is ×1.10, not ×2.75.
 */
export function dungeonWormholeEnemyBaseDamage(primaryAttr) {
  return playerBaseDamage(primaryAttr);
}

/** Universal standard-attack variance Uniform(VARIANCE_MIN, VARIANCE_MAX). RNG stays outside. */
export function standardAttackWithVariance(primaryAttr, variance = 1, flat = STANDARD_ATTACK_FLAT) {
  return rawStandardAttack(primaryAttr, flat) * Number(variance);
}

export function genericForMax(level) {
  const L = levelNum(level);
  return GENERIC_FORMAX_AT_100 * (L / GENERIC_FORMAX_REFERENCE_LEVEL) ** GENERIC_FORMAX_EXPONENT;
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
  const early = cap * Math.min(1, (L / GENERIC_FORMAX_REFERENCE_LEVEL) ** GENERIC_EARLY_EXPONENT);
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
  const hermite = (t) => t * t * (3 - 2 * t); // magic-number-ok: cubic Hermite identity
  const blend = (x, knot) => {
    const t = (x - (knot - w)) / (2 * w); // magic-number-ok: full blend width = 2 * half-width
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

/** Mission enemy base ramp. EL<FULL_LEVEL: FLOOR+RISE*(EL-1)/SPAN; else MATURE. Endpoint: EL=24 ramps, EL=25 is MATURE. */
export function missionEnemyBaseDamage(enemyLevel) {
  const EL = levelNum(enemyLevel);
  if (EL < MISSION_ENEMY_BASE_RAMP_FULL_LEVEL) {
    return MISSION_ENEMY_BASE_RAMP_FLOOR
      + MISSION_ENEMY_BASE_RAMP_RISE * (EL - 1) / MISSION_ENEMY_BASE_RAMP_LEVEL_SPAN;
  }
  return MISSION_ENEMY_BASE_MATURE;
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
