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
  PRODUCTION_XP_STORAGE_SCALE,
  XP_MISSION_SHARE,
  XP_REWARD_EFFICIENCY,
} from "./constants.js";

function levelInt(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

/** Certified `mission_xpf(L)` in design units. Completely 1:1 — no ×10 / ÷10. */
export function missionXpPerFuel(level) {
  const L = levelInt(level);
  return 10 + 0.5 * (L - 1) + 0.032 * (L ** 1.67 - 1);
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
  return 1.67985 + 0.239507 * L ** 0.662355 + 18.3178 * (L / 500) ** 4;
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
 * Order: ROUND(Fuel * mission_xpf(snapL) * xpVariance * 0.85 * 0.85)
 */
export function missionXpReward({
  fuel,
  snapshotLevel,
  xpVariance = 1,
  defeated = false,
} = {}) {
  const F = Number(fuel) || 0;
  const v = Number(xpVariance);
  const raw = F * missionXpPerFuel(snapshotLevel) * v * XP_REWARD_EFFICIENCY * XP_REWARD_EFFICIENCY;
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
  note: "XP is completely 1:1. Calculated = granted = stored = API = displayed. PRODUCTION_XP_STORAGE_SCALE is identity 1, not a conversion. Do not bake ×10 or ÷10 into missionXpPerFuel / xpToNext / arena / dungeon primitives, grants, persistence, or HUD.",
});
