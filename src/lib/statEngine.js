// ═══════════════════════════════════════════
// STAT ENGINE — attribute → combat mapping
// ═══════════════════════════════════════════
// Permanent TotalAttribute =
//   Class Base + Level-Gained + Stardust-Purchased + Equipment
//   (+ racial % at compute time; race is permanent, not a stim)
//
// character.stats already holds Class Base + Purchased (buys mutate stats).
// Level-Gained is currently 0 (no free points on level-up).
// Equipment is summed from equipped items.
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
import { CLASSES, RACES, getActiveBuffs, applyBuffs } from "@/lib/gameData";

// Racial bonuses are percentage-based multipliers (e.g. +6% Strength) applied
// at permanent-stat compute time so they stay relevant at every level.
export function applyRaceBonus(stats, race) {
  const bonuses = RACES[race]?.bonuses;
  if (!bonuses) return stats;
  const out = { ...stats };
  for (const [k, v] of Object.entries(bonuses)) {
    out[k] = Math.round((out[k] || 0) * (1 + v));
  }
  return out;
}

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
export const CRIT_CAP = 30;            // % absolute max
export const DODGE_CAP = 25;           // % absolute max
export const ARMOR_CAP = 30;           // % absolute max vs Strength damage
export const TECH_RESIST_CAP = 30;     // % absolute max vs Tech damage
export const CRIT_MULT = 1.5;          // crit damage multiplier
export const DAMAGE_BASE = 15;
export const DAMAGE_COEFF = 0.0032;
export const DAMAGE_EXP = 1.727;
export const AGI_VARIANCE_MIN = 0.80;
export const AGI_VARIANCE_MAX = 1.05;
export const UNIVERSAL_VARIANCE_MIN = 0.90;
export const UNIVERSAL_VARIANCE_MAX = 1.10;

/** Inclusive float roll in [min, max]. */
export function randomBetween(min, max, rng = Math.random) {
  return min + (max - min) * rng();
}

/** Soft-cap % curve shared by Crit / Dodge / Armor / Tech Resist. */
export function softCapPercent(level, totalAttr, maxPercent) {
  const L = Math.max(1, level || 1);
  const attr = Math.max(0, totalAttr || 0);
  const forMax = 700 * Math.pow(L / 100, 0.95);
  const fromAttr = forMax > 0
    ? maxPercent * Math.min(1, Math.pow(attr / forMax, 1.20))
    : 0;
  const pre100Cap = maxPercent * Math.min(1, Math.pow(L / 100, 0.65));
  return Math.min(fromAttr, pre100Cap, maxPercent);
}

export function getMaxHP(totalVitality) {
  const v = Math.max(0, totalVitality || 0);
  return Math.round(50 + 2.5 * v + 0.008 * Math.pow(v, 2));
}

export function getCritChance(level, totalLuck) {
  return softCapPercent(level, totalLuck, CRIT_CAP);
}

export function getDodgeChance(level, totalAgility) {
  return softCapPercent(level, totalAgility, DODGE_CAP);
}

/** Attribute-derived Armor % — Strength classes always 0. */
export function getAttributeArmorPercent(characterClass, level, totalStrength) {
  if (getDamageArchetype(characterClass) === "str") return 0;
  return softCapPercent(level, totalStrength, ARMOR_CAP);
}

/** Attribute-derived Tech Resist % — Intellect classes always 0. */
export function getAttributeTechResistancePercent(characterClass, level, totalIntellect) {
  if (getDamageArchetype(characterClass) === "int") return 0;
  return softCapPercent(level, totalIntellect, TECH_RESIST_CAP);
}

/** Raw base damage curve (no variance) — used for sheet display. */
export function getBaseDamageFromPrimary(primaryAttribute) {
  const p = Math.max(0, primaryAttribute || 0);
  return DAMAGE_BASE + DAMAGE_COEFF * Math.pow(p, DAMAGE_EXP);
}

export function calculateStrengthDamage(totalStrength, rng = Math.random) {
  return getBaseDamageFromPrimary(totalStrength) * randomBetween(UNIVERSAL_VARIANCE_MIN, UNIVERSAL_VARIANCE_MAX, rng);
}

export function calculateTechDamage(totalIntellect, rng = Math.random) {
  return getBaseDamageFromPrimary(totalIntellect) * randomBetween(UNIVERSAL_VARIANCE_MIN, UNIVERSAL_VARIANCE_MAX, rng);
}

export function calculateAgilityDamage(totalAgility, rng = Math.random) {
  return getBaseDamageFromPrimary(totalAgility)
    * randomBetween(AGI_VARIANCE_MIN, AGI_VARIANCE_MAX, rng)
    * randomBetween(UNIVERSAL_VARIANCE_MIN, UNIVERSAL_VARIANCE_MAX, rng);
}

/** Roll one basic-attack raw damage for the given archetype (pre-crit / pre-mit). */
export function rollBasicAttackDamage(archetype, primaryValue, rng = Math.random) {
  if (archetype === "agi") return calculateAgilityDamage(primaryValue, rng);
  if (archetype === "int") return calculateTechDamage(primaryValue, rng);
  return calculateStrengthDamage(primaryValue, rng);
}

/**
 * Mitigation fraction (0–1) for a damage type against a defender's % resists.
 * Agility damage ignores Armor and Tech Resistance.
 */
export function mitigationForDamageType(damageType, armorPercent, techResistPercent) {
  if (damageType === "strength") return Math.max(0, (armorPercent || 0) / 100);
  if (damageType === "tech") return Math.max(0, (techResistPercent || 0) / 100);
  return 0;
}

// ── Total attributes ─────────────────────────────────────────
/** Permanent totals: base+purchased stats + equipment + race. No stims. */
export function computePermanentTotalStats(character, equippedItems = []) {
  const stats = { ...(character?.stats || {}) };
  for (const it of equippedItems) {
    for (const [k, v] of Object.entries(it.stats || {})) {
      stats[k] = (stats[k] || 0) + (v || 0);
    }
  }
  return applyRaceBonus(stats, character?.race);
}

/** Buffed totals for UI (stim % on base stats, then gear + race). */
export function computeTotalStats(character, equippedItems = []) {
  const stats = applyBuffs(character?.stats || {}, getActiveBuffs(character));
  for (const it of equippedItems) {
    for (const [k, v] of Object.entries(it.stats || {})) {
      stats[k] = (stats[k] || 0) + (v || 0);
    }
  }
  return applyRaceBonus(stats, character?.race);
}

export function computeTotalStatsNoBuffs(character, equippedItems = []) {
  return computePermanentTotalStats(character, equippedItems);
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
  const rawBase = getBaseDamageFromPrimary(primaryValue);
  const damage = Math.round(archetype === "agi" ? rawBase * 0.925 : rawBase);

  const critChance = getCritChance(level, s("luck"));
  const health = getMaxHP(s("vitality"));
  const dodgeChance = getDodgeChance(level, s("agility"));
  const armor = getAttributeArmorPercent(className, level, s("strength"));
  const techResist = getAttributeTechResistancePercent(className, level, s("intellect"));

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
    (sum, k) => sum + (total[k] || 0) * (w[k] ?? 0.1),
    0
  );
  return Math.round((character.level || 1) * 50 + weighted * 10);
}
