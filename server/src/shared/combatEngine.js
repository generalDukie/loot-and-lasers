/**
 * Layer 2 / Restoration 08 — shared combat simulation.
 * Authoritative source: src/lib/arenaEngine.js (+ classPassives + combatMath/productionMath).
 * Requires Node `@/` alias (server start / tests use register-src-alias).
 */
export {
  simulateBattle,
  buildFighter,
  resolveNormalAttack,
  resolveBasicHit,
  applyHealing,
} from "../../../src/lib/arenaEngine.js";

export {
  rollBasicAttackDamage,
  calculateStrengthDamage,
  calculateTechDamage,
  calculateAgilityDamage,
  mitigationForDamageType, // historical Armor/Tech helper — not live settlement
  getMaxHP,
  CRIT_MULT,
  AGI_VARIANCE_MIN, // historical — not live combat variance
  AGI_VARIANCE_MAX,
  UNIVERSAL_VARIANCE_MIN,
  UNIVERSAL_VARIANCE_MAX,
  DAMAGE_BASE,
  DAMAGE_BASE_RAMP_FLOOR,
  DAMAGE_BASE_RAMP_FULL_LEVEL,
  DAMAGE_COEFF,
  DAMAGE_EXP,
  getRampedDamageBase,
  usesRampedDamageBase,
  getDamageBaseForCombatant,
} from "./statEngine.js";
