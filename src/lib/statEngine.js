// ═══════════════════════════════════════════
// STAT ENGINE — attribute → combat mapping
// ═══════════════════════════════════════════
// Permanent TotalAttribute =
//   Class Base + Level-Gained + Stardust-Purchased + Equipment
//
// character.stats already holds Class Base + Level-Gained + Purchased
// (buys and server level grants mutate stats). Level-Gained = 2 attrs/level
// via characterProgression. Equipment is summed from equipped items.
// Temporary stims are NOT part of permanent totals — use
// computePermanentTotalStats for combat formulas.
//
// Class roles (STR / AGI / INT primaries):
//  Strength  → Damage (STR class) | Armor vs Strength damage (AGI / INT)
//  Agility   → Dodge (all) + Damage (AGI class; bypasses Armor & Tech Resist)
//  Intellect → Damage / Tech (INT class) | Tech Resist (STR / AGI)
//  Vitality  → Max HP (all)
//  Luck      → Crit Chance (all)
//
import { CLASSES, getActiveBuffs, applyBuffs } from "@/lib/gameData";
import { resolvePermanentAttributes } from "@/lib/characterStats.js";
import {
  CRIT_DAMAGE_MULT,
  GENERIC_ATTR_EXPONENT,
  GENERIC_EARLY_EXPONENT,
  GENERIC_FORMAX_AT_100,
  GENERIC_FORMAX_EXPONENT,
  GENERIC_FORMAX_REFERENCE_LEVEL,
  HP_BASE,
  HP_PER_VITALITY,
  HP_VITALITY_SQUARED_COEFFICIENT,
  MISSION_ENEMY_BASE_RAMP_FLOOR,
  MISSION_ENEMY_BASE_RAMP_FULL_LEVEL,
  RAW_ATTACK_COEFFICIENT,
  RAW_ATTACK_EXPONENT,
  STANDARD_ATTACK_FLAT,
} from "@/lib/productionMath";

// ── Primary attribute keys (display order) ──
export const PRIMARY_STATS = ["strength", "agility", "intellect", "vitality", "luck"];

/** Damage archetype from class primary: str | agi | int */
export function getDamageArchetype(className) {
  const primary = CLASSES[className]?.primaryStat || "strength";
  if (primary === "agility") return "agi";
  if (primary === "intellect") return "int";
  return "str";
}

/**
 * Basic-attack damage channel for mitigation:
 *   strength → Armor
 *   tech     → Tech Resistance
 *   agility  → neither (bypass)
 */
export function getDamageType(className) {
  const arch = getDamageArchetype(className);
  if (arch === "int") return "tech";
  if (arch === "agi") return "agility";
  return "strength";
}

// ── Class scaling weights (1.0 = primary damage stat) ──
// Used for power scoring / opponent matching — not raw damage.
export const CLASS_STAT_WEIGHTS = {
  Vanguard:           { strength: 1.0,  vitality: 0.5, luck: 0.3, agility: 0.2, intellect: 0.2 },
  "Astral Warden":    { strength: 1.0,  vitality: 0.6, luck: 0.25, agility: 0.15, intellect: 0.2 },
  "Shadow Operative": { agility: 1.0,  vitality: 0.5, luck: 0.3, strength: 0.25, intellect: 0.15 },
  "Void Runner":      { agility: 1.0,  vitality: 0.45, luck: 0.35, strength: 0.2, intellect: 0.15 },
  Technomancer:       { intellect: 1.0, vitality: 0.5, luck: 0.3, strength: 0.25, agility: 0.15 },
  "Cosmic Engineer":  { intellect: 1.0, vitality: 0.5, luck: 0.3, strength: 0.25, agility: 0.15 },
};

/** @deprecated Damage no longer uses a class ATK multiplier; kept for callers. */
export const CLASS_ATK_MULT = {
  Vanguard: 1.0,
  "Astral Warden": 1.0,
  "Shadow Operative": 1.0,
  "Void Runner": 1.0,
  Technomancer: 1.0,
  "Cosmic Engineer": 1.0,
};

export function getClassWeights(className) {
  return CLASS_STAT_WEIGHTS[className] || CLASS_STAT_WEIGHTS.Vanguard;
}

// ── Caps & constants (authoritative combat system) ──
export const CRIT_CAP = 30;            // % absolute max (players)
export const DODGE_CAP = 25;           // % absolute max (players)
export const ARMOR_CAP = 30;           // % absolute max vs Strength damage (players)
export const TECH_RESIST_CAP = 30;     // % absolute max vs Tech damage (players)

/** Dungeon enemies may soft-cap past player ceilings up to these maxima. */
export const DUNGEON_CRIT_CAP = 75;
export const DUNGEON_DODGE_CAP = 75;
export const DUNGEON_ARMOR_CAP = 75;
export const DUNGEON_TECH_RESIST_CAP = 75;
export const CRIT_MULT = CRIT_DAMAGE_MULT;
export const DAMAGE_BASE = STANDARD_ATTACK_FLAT;
/** Early-game flat floor for mission soft foes + arena bots (not dungeon / not players). */
export const DAMAGE_BASE_RAMP_FLOOR = MISSION_ENEMY_BASE_RAMP_FLOOR;
/** Level at which ramped flat reaches DAMAGE_BASE. */
export const DAMAGE_BASE_RAMP_FULL_LEVEL = MISSION_ENEMY_BASE_RAMP_FULL_LEVEL;
export const DAMAGE_COEFF = RAW_ATTACK_COEFFICIENT;
export const DAMAGE_EXP = RAW_ATTACK_EXPONENT;
/** Historical Reflex special variance — NOT live combat authority (Phase 3). */
export const AGI_VARIANCE_MIN = 0.80;
export const AGI_VARIANCE_MAX = 1.05;
export const UNIVERSAL_VARIANCE_MIN = 0.90;
export const UNIVERSAL_VARIANCE_MAX = 1.10;

const DEFAULT_CLASS_STAT_WEIGHT = 0.1;
const SOFT_CAP_REFERENCE_LEVEL = GENERIC_FORMAX_REFERENCE_LEVEL;
const SOFT_CAP_REFERENCE_ATTRIBUTE = GENERIC_FORMAX_AT_100;
const SOFT_CAP_REFERENCE_GROWTH_EXPONENT = GENERIC_FORMAX_EXPONENT;
const SOFT_CAP_ATTRIBUTE_EXPONENT = GENERIC_ATTR_EXPONENT;
const SOFT_CAP_LEVEL_EXPONENT = GENERIC_EARLY_EXPONENT;
const HEALTH_BASE = HP_BASE;
const HEALTH_PER_VITALITY = HP_PER_VITALITY;
const HEALTH_VITALITY_SQUARED_COEFFICIENT = HP_VITALITY_SQUARED_COEFFICIENT;
const PERCENT_SCALE = 100;
const COMBAT_POWER_PER_LEVEL = 50;
const COMBAT_POWER_PER_WEIGHTED_ATTRIBUTE = 10;

/** Inclusive float roll in [min, max]. */
export function randomBetween(min, max, rng = Math.random) {
  return min + (max - min) * rng();
}

/** Soft-cap % curve shared by Crit / Dodge / Armor / Tech Resist. */
export function softCapPercent(level, totalAttr, maxPercent) {
  const L = Math.max(1, level || 1);
  const attr = Math.max(0, totalAttr || 0);
  const forMax = SOFT_CAP_REFERENCE_ATTRIBUTE * Math.pow(
    L / SOFT_CAP_REFERENCE_LEVEL,
    SOFT_CAP_REFERENCE_GROWTH_EXPONENT,
  );
  const fromAttr = forMax > 0
    ? maxPercent * Math.min(1, Math.pow(attr / forMax, SOFT_CAP_ATTRIBUTE_EXPONENT))
    : 0;
  const pre100Cap = maxPercent * Math.min(
    1,
    Math.pow(L / SOFT_CAP_REFERENCE_LEVEL, SOFT_CAP_LEVEL_EXPONENT),
  );
  return Math.min(fromAttr, pre100Cap, maxPercent);
}

export function getMaxHP(totalVitality) {
  const v = Math.max(0, totalVitality || 0);
  return Math.round(
    HEALTH_BASE
    + HEALTH_PER_VITALITY * v
    + HEALTH_VITALITY_SQUARED_COEFFICIENT * v * v,
  );
}

export function getCritChance(level, totalLuck, maxPercent = CRIT_CAP) {
  return softCapPercent(level, totalLuck, maxPercent);
}

export function getDodgeChance(level, totalAgility, maxPercent = DODGE_CAP) {
  return softCapPercent(level, totalAgility, maxPercent);
}

/** Attribute-derived Armor % — Strength classes always 0. */
export function getAttributeArmorPercent(characterClass, level, totalStrength, maxPercent = ARMOR_CAP) {
  if (getDamageArchetype(characterClass) === "str") return 0;
  return softCapPercent(level, totalStrength, maxPercent);
}

/** Attribute-derived Tech Resist % — Intellect classes always 0. */
export function getAttributeTechResistancePercent(characterClass, level, totalIntellect, maxPercent = TECH_RESIST_CAP) {
  if (getDamageArchetype(characterClass) === "int") return 0;
  return softCapPercent(level, totalIntellect, maxPercent);
}

/**
 * Linear flat ramp: 5 at L1 → 15 at L25+. Mission enemies (and historical bot
 * helpers) only. Live player / Dungeon combat uses combatMath canonical damage.
 */
export function getRampedDamageBase(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  if (L >= DAMAGE_BASE_RAMP_FULL_LEVEL) return DAMAGE_BASE;
  const span = DAMAGE_BASE_RAMP_FULL_LEVEL - 1;
  return DAMAGE_BASE_RAMP_FLOOR
    + (DAMAGE_BASE - DAMAGE_BASE_RAMP_FLOOR) * ((L - 1) / span);
}

/** Mission soft foes and arena bots only — never dungeon (dungeon foes also set isBot). */
export function usesRampedDamageBase(character) {
  if (!character || character.dungeonEnemy) return false;
  return !!(character.missionEnemy || character.isBot || character.is_bot);
}

export function getDamageBaseForCombatant(character) {
  if (usesRampedDamageBase(character)) {
    return getRampedDamageBase(character.level);
  }
  return DAMAGE_BASE;
}

/** Raw base damage curve (no variance) — used for sheet display. */
export function getBaseDamageFromPrimary(primaryAttribute, damageBase = DAMAGE_BASE) {
  const p = Math.max(0, primaryAttribute || 0);
  const flat = damageBase != null && Number.isFinite(Number(damageBase))
    ? Number(damageBase)
    : DAMAGE_BASE;
  return flat + DAMAGE_COEFF * Math.pow(p, DAMAGE_EXP);
}

export function calculateStrengthDamage(totalStrength, rng = Math.random, damageBase = DAMAGE_BASE) {
  return getBaseDamageFromPrimary(totalStrength, damageBase) * randomBetween(UNIVERSAL_VARIANCE_MIN, UNIVERSAL_VARIANCE_MAX, rng);
}

export function calculateTechDamage(totalIntellect, rng = Math.random, damageBase = DAMAGE_BASE) {
  return getBaseDamageFromPrimary(totalIntellect, damageBase) * randomBetween(UNIVERSAL_VARIANCE_MIN, UNIVERSAL_VARIANCE_MAX, rng);
}

export function calculateAgilityDamage(totalAgility, rng = Math.random, damageBase = DAMAGE_BASE) {
  // Phase 3: universal Uniform(0.90, 1.10) for all archetypes. AGI U(0.80,1.05) is not live.
  return getBaseDamageFromPrimary(totalAgility, damageBase) * randomBetween(UNIVERSAL_VARIANCE_MIN, UNIVERSAL_VARIANCE_MAX, rng);
}

/** Roll one basic-attack raw damage for the given archetype (pre-crit / pre-mit). */
export function rollBasicAttackDamage(_archetype, primaryValue, rng = Math.random, damageBase = DAMAGE_BASE) {
  return getBaseDamageFromPrimary(primaryValue, damageBase) * randomBetween(UNIVERSAL_VARIANCE_MIN, UNIVERSAL_VARIANCE_MAX, rng);
}

/**
 * Historical two-channel Armor/Tech mitigation. Live combat uses
 * combatMath.resistFraction (Might/Reflex/Tech). Do not call from settlement.
 */
export function mitigationForDamageType(damageType, armorPercent, techResistPercent) {
  if (damageType === "strength") return Math.max(0, (armorPercent || 0) / PERCENT_SCALE);
  if (damageType === "tech") return Math.max(0, (techResistPercent || 0) / PERCENT_SCALE);
  return 0;
}

// ── Total attributes ─────────────────────────────────────────
/** Permanent totals: base+purchased stats + equipment. No stims. Race is flavor-only. */
export function computePermanentTotalStats(character, equippedItems = []) {
  const stats = { ...resolvePermanentAttributes(character) };
  for (const it of equippedItems) {
    for (const [k, v] of Object.entries(it.stats || {})) {
      stats[k] = (stats[k] || 0) + (v || 0);
    }
  }
  return stats;
}

/**
 * Effective totals: permanent pre-stim attributes, then Stim multipliers last.
 * Downstream combat/UI should prefer this when Stim effects should apply.
 */
export function computeTotalStats(character, equippedItems = []) {
  const permanent = computePermanentTotalStats(character, equippedItems);
  return applyBuffs(permanent, getActiveBuffs(character));
}

/**
 * Generated combatants (mission/dungeon foes, arena bots) already carry totaled
 * snapshot stats. Do not re-compose starting/free/purchased on top of them.
 */
export function computeSnapshotTotalStats(character, equippedItems = []) {
  const stats = {};
  for (const k of PRIMARY_STATS) {
    stats[k] = Math.max(0, Number(character?.stats?.[k]) || 0);
  }
  for (const it of equippedItems) {
    for (const [k, v] of Object.entries(it.stats || {})) {
      stats[k] = (stats[k] || 0) + (v || 0);
    }
  }
  return applyBuffs(stats, getActiveBuffs(character));
}

/** Player characters compose; generated foes/bots use their snapshot stats. */
export function computeCombatantTotalStats(character, equippedItems = []) {
  if (
    character?.missionEnemy
    || character?.dungeonEnemy
    || character?.isBot
    || character?.is_bot
    || character?.snapshotStats
  ) {
    return computeSnapshotTotalStats(character, equippedItems);
  }
  return computeTotalStats(character, equippedItems);
}

export function computeTotalStatsNoBuffs(character, equippedItems = []) {
  return computePermanentTotalStats(character, equippedItems);
}

/** Single-attribute effective value (permanent then active Stim). */
export function getEffectiveAttribute(character, equippedItems, attrKey) {
  const totals = computeTotalStats(character, equippedItems);
  return totals?.[attrKey] || 0;
}

// ── Derived combat stats (single source of truth) ──
export function computeDerivedStats(totalStats, character) {
  const level = character?.level || 1;
  const className = character?.class;
  const weights = getClassWeights(className);
  const s = (k) => totalStats?.[k] || 0;

  const primaryStat = CLASSES[className]?.primaryStat || "strength";
  const archetype = getDamageArchetype(className);
  const damageType = getDamageType(className);
  const primaryValue = s(primaryStat);

  // Sheet damage = expected base (no variance). AGI average agility-variance ≈ 0.925.
  // Mission / arena-bot combatants use the early flat ramp; dungeon + players stay at 15.
  const damageBase = getDamageBaseForCombatant(character);
  const rawBase = getBaseDamageFromPrimary(primaryValue, damageBase);
  const damage = Math.round(rawBase);

  const dungeonCaps = !!(character?.dungeonEnemy);
  const critCap = dungeonCaps ? DUNGEON_CRIT_CAP : CRIT_CAP;
  const dodgeCap = dungeonCaps ? DUNGEON_DODGE_CAP : DODGE_CAP;
  const armorCap = dungeonCaps ? DUNGEON_ARMOR_CAP : ARMOR_CAP;
  const techCap = dungeonCaps ? DUNGEON_TECH_RESIST_CAP : TECH_RESIST_CAP;

  const critChance = getCritChance(level, s("luck"), critCap);
  const health = getMaxHP(s("vitality"));
  const dodgeChance = getDodgeChance(level, s("agility"), dodgeCap);
  const armor = getAttributeArmorPercent(className, level, s("strength"), armorCap);
  const techResist = getAttributeTechResistancePercent(className, level, s("intellect"), techCap);

  return {
    damage,
    critChance,
    critMult: CRIT_MULT,
    health,
    dodgeChance,
    armor,
    techResist,
    damageType,
    archetype,
    primaryStat,
    primaryValue,
    weights,
    level,
  };
}

export function computeCombatPower(character, equippedItems = []) {
  const w = getClassWeights(character?.class);
  const total = computePermanentTotalStats(character, equippedItems);
  const weighted = PRIMARY_STATS.reduce(
    (sum, k) => sum + (total[k] || 0) * (w[k] ?? DEFAULT_CLASS_STAT_WEIGHT),
    0
  );
  return Math.round(
    (character.level || 1) * COMBAT_POWER_PER_LEVEL
    + weighted * COMBAT_POWER_PER_WEIGHTED_ATTRIBUTE,
  );
}

export {
  repairPermanentAttributes,
  permanentStatsNeedClassBaseRepair,
  resolvePermanentAttributes,
  parseStoredStats,
  normalizeAttrStats,
  sumAttrStats,
  classBaseStats,
} from "@/lib/characterStats.js";
