/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 1 LIVE FOR CHARACTER PROGRESSION
 */
import { roundHalfUp } from "./rounding.js";
import {
  AVGFUEL_MATURE,
  AVGFUEL_TABLE,
  ARENA_XP_PER_XPF,
  CANONICAL_XP_UNIT,
  DEFEAT_REWARD_FACTOR,
  DRU_REFERENCE_MISSION_SHARE,
  EMPLOYMENT_LOAD_BASE,
  EMPLOYMENT_LOAD_POWER_COEFFICIENT,
  EMPLOYMENT_LOAD_POWER_EXPONENT,
  EMPLOYMENT_LOAD_QUARTIC_COEFFICIENT,
  EMPLOYMENT_LOAD_QUARTIC_EXPONENT,
  EMPLOYMENT_LOAD_QUARTIC_REFERENCE_LEVEL,
  MAX_LEVELS_PER_XP_GRANT,
  MISSION_XPF_BASE,
  MISSION_XPF_EXPONENT,
  MISSION_XPF_LINEAR_COEFFICIENT,
  MISSION_XPF_POWER_COEFFICIENT,
  PRODUCTION_XP_STORAGE_SCALE,
  XP_MISSION_SHARE,
  XP_REWARD_EFFICIENCY,
  MISSION_XP_EFFICIENCY,
  MISSION_XP_REWARD_SCALAR,
} from "./constants.js";

function levelInt(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

/**
 * Certified `mission_xpf(L)` in production design units. Completely 1:1.
 * Coefficients are the production formula — not `oldFormula * 10` and not an XP_SCALE.
 */
export function missionXpPerFuel(level) {
  const L = levelInt(level);
  return (
    MISSION_XPF_BASE
    + MISSION_XPF_LINEAR_COEFFICIENT * (L - 1)
    + MISSION_XPF_POWER_COEFFICIENT * (L ** MISSION_XPF_EXPONENT - 1)
  );
}

/** Intentional discrete avgfuel(L); matures at 12.5. */
export function averageMissionFuel(level) {
  const L = levelInt(level);
  for (const row of AVGFUEL_TABLE) {
    if (L <= row.maxLevel) return row.value;
  }
  return AVGFUEL_MATURE;
}

export function employmentLoad(level) {
  const L = levelInt(level);
  return EMPLOYMENT_LOAD_BASE
    + EMPLOYMENT_LOAD_POWER_COEFFICIENT * L ** EMPLOYMENT_LOAD_POWER_EXPONENT
    + EMPLOYMENT_LOAD_QUARTIC_COEFFICIENT * (L / EMPLOYMENT_LOAD_QUARTIC_REFERENCE_LEVEL) ** EMPLOYMENT_LOAD_QUARTIC_EXPONENT;
}

function xpToNextCore(level, share) {
  const L = levelInt(level);
  const raw = averageMissionFuel(L) * missionXpPerFuel(L) * XP_REWARD_EFFICIENCY * employmentLoad(L) / share;
  return Math.max(1, roundHalfUp(raw));
}

/** Certified xpnext(L) in canonical design XP units. */
export function xpToNext(level) {
  return xpToNextCore(level, XP_MISSION_SHARE);
}

/**
 * Project level/leftover XP after an award without mutating the character.
 * Same loop used by grantCharacterXp. awarded === 0 does not consume leftover XP into a level-up.
 */
export function projectedProgressionAfterXp({
  level,
  experience = 0,
  xpAmount = 0,
} = {}) {
  const previousLevel = Math.max(1, Math.floor(Number(level) || 1));
  const previousXp = Math.max(0, Math.floor(Number(experience) || 0));
  const awarded = Math.max(0, Math.floor(Number(xpAmount) || 0));
  const previousReq = xpToNext(previousLevel);
  if (awarded === 0) {
    return {
      level: previousLevel,
      experience: previousXp,
      experience_to_next_level: previousReq,
      levels_gained: 0,
    };
  }
  let newExp = previousXp + awarded;
  let newLevel = previousLevel;
  let expToNext = previousReq;
  let safety = 0;
  while (newExp >= expToNext) {
    if (!Number.isFinite(expToNext) || expToNext <= 0) {
      const err = new Error("Invalid XP requirement during level-up");
      err.status = 500;
      err.code = "INTERNAL_ERROR";
      throw err;
    }
    newExp -= expToNext;
    newLevel += 1;
    expToNext = xpToNext(newLevel);
    safety += 1;
    if (safety > MAX_LEVELS_PER_XP_GRANT) {
      const err = new Error("XP level-up safety limit exceeded");
      err.status = 500;
      err.code = "INTERNAL_ERROR";
      throw err;
    }
  }
  return {
    level: newLevel,
    experience: Math.max(0, Math.floor(newExp)),
    experience_to_next_level: expToNext,
    levels_gained: newLevel - previousLevel,
  };
}

/** Wormhole BandWeight reference curve (share 0.60), not player XPToNext. */
export function xpToNextDruReference(level) {
  return xpToNextCore(level, DRU_REFERENCE_MISSION_SHARE);
}

/** Identity helper: XP storage equals canonical design XP. Scale must stay 1. */
export function toStorageXp(designXp) {
  return roundHalfUp(Number(designXp) || 0) * PRODUCTION_XP_STORAGE_SCALE;
}

/** Identity helper: stored XP equals canonical design XP. Scale must stay 1. */
export function fromStorageXp(storageXp) {
  return (Number(storageXp) || 0) / PRODUCTION_XP_STORAGE_SCALE;
}

/**
 * Mission win XP. Variance is an explicit input — RNG stays outside this primitive.
 * Order: ROUND(Fuel * mission_xpf(snapL) * xpVariance * MISSION_XP_EFFICIENCY * MISSION_XP_REWARD_SCALAR)
 */
export function missionXpReward({
  fuel,
  snapshotLevel,
  xpVariance = 1,
  defeated = false,
} = {}) {
  const F = Number(fuel) || 0;
  const v = Number(xpVariance);
  const raw = F * missionXpPerFuel(snapshotLevel) * v * MISSION_XP_EFFICIENCY * MISSION_XP_REWARD_SCALAR;
  let xp = roundHalfUp(raw);
  if (defeated) xp = roundHalfUp(xp * DEFEAT_REWARD_FACTOR);
  return Math.max(0, xp);
}

export function arenaXpReward(level) {
  return Math.max(0, roundHalfUp(ARENA_XP_PER_XPF * missionXpPerFuel(level)));
}

export const XP_UNIT_POLICY = Object.freeze({
  canonical: CANONICAL_XP_UNIT,
  storageScale: PRODUCTION_XP_STORAGE_SCALE,
  note: "The production XP denomination was increased by rewriting the authoritative XP formulas and constants. This is NOT an XP scaling layer. Calculated = granted = stored = API = displayed. PRODUCTION_XP_STORAGE_SCALE is identity 1.",
});
