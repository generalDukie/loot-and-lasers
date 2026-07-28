// ═══════════════════════════════════════════
// STAT ENGINE — attribute → combat mapping
// ═══════════════════════════════════════════
// Class roles (STR / AGI / INT primaries):
//
//  Strength  → Damage (STR class) | Armor vs STR damage (AGI / INT classes)
//  Agility   → Dodge (all) + Damage (AGI class, slightly lower rate)
//  Intellect → Damage (INT class) | Tech Resist vs INT damage (STR / AGI)
//  Vitality  → HP (all)
//  Luck      → Crit Chance (all)
//
import { CLASSES, RACES, getActiveBuffs, applyBuffs } from "@/lib/gameData";

// Racial bonuses are percentage-based multipliers (e.g. +6% Strength) applied
// at stat-compute time so they stay relevant at every level forever — a flat
// +3 would go stale, but +6% scales with everything (base + gear + buffs) with
// no cap, so the bonus grows at every level indefinitely.
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

/** Combat damage channel: physical (mitigated by armor) or tech (by tech resist). */
export function getDamageType(className) {
  return getDamageArchetype(className) === "int" ? "tech" : "physical";
}

// ── Class scaling weights (1.0 = primary damage stat) ──
// Secondaries favor the defensive stats each class actually uses.
export const CLASS_STAT_WEIGHTS = {
  Vanguard:           { strength: 1.0,  vitality: 0.5, luck: 0.3, agility: 0.2, intellect: 0.2 },
  "Astral Warden":    { strength: 1.0,  vitality: 0.6, luck: 0.25, agility: 0.15, intellect: 0.2 },
  "Shadow Operative": { agility: 1.0,  vitality: 0.5, luck: 0.3, strength: 0.25, intellect: 0.15 },
  "Void Runner":      { agility: 1.0,  vitality: 0.45, luck: 0.35, strength: 0.2, intellect: 0.15 },
  Technomancer:       { intellect: 1.0, vitality: 0.5, luck: 0.3, strength: 0.25, agility: 0.15 },
  "Cosmic Engineer":  { intellect: 1.0, vitality: 0.5, luck: 0.3, strength: 0.25, agility: 0.15 },
};

// AGI classes deal slightly less primary damage than STR/INT.
export const CLASS_ATK_MULT = {
  Vanguard: 1.0,
  "Astral Warden": 1.0,
  "Shadow Operative": 0.9,
  "Void Runner": 0.9,
  Technomancer: 1.0,
  "Cosmic Engineer": 1.0,
};

export function getClassWeights(className) {
  return CLASS_STAT_WEIGHTS[className] || CLASS_STAT_WEIGHTS.Vanguard;
}

// ── Caps & constants ──
export const CRIT_CAP = 35;          // % — max crit chance from Luck
export const DODGE_CAP = 40;         // % — max dodge chance from Agility
export const ARMOR_CAP = 50;         // % — max reduction vs physical (STR) damage
export const TECH_RESIST_CAP = 50;   // % — max reduction vs tech (INT) damage
export const CRIT_MULT = 2;          // crits deal 2× damage
export const ARMOR_PER_STR = 0.5;    // % armor per Strength (non-STR classes)
export const TECH_RESIST_PER_INT = 0.5; // % tech resist per Intellect (non-INT classes)

// ── Total attributes: base + buffs + equipped gear ──
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
  const stats = { ...(character?.stats || {}) };
  for (const it of equippedItems) {
    for (const [k, v] of Object.entries(it.stats || {})) {
      stats[k] = (stats[k] || 0) + (v || 0);
    }
  }
  return applyRaceBonus(stats, character?.race);
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
  const atkMult = CLASS_ATK_MULT[className] ?? 1.0;

  const damage = Math.round((s(primaryStat) || 5) * 2 * atkMult + level * 3);
  const critChance = Math.min(CRIT_CAP, Math.round((3 + s("luck") * 0.3) * 10) / 10);

  const health = Math.round(s("vitality") * 8 + level * 20 + 80);
  const dodgeChance = Math.min(DODGE_CAP, Math.round((5 + s("agility") * 0.3) * 10) / 10);

  // Armor from Strength — STR classes spend Strength on damage, not armor.
  const armor =
    archetype === "str"
      ? 0
      : Math.min(ARMOR_CAP, Math.round(s("strength") * ARMOR_PER_STR * 10) / 10);

  // Tech resist from Intellect — INT classes spend Intellect on damage, not resist.
  const techResist =
    archetype === "int"
      ? 0
      : Math.min(TECH_RESIST_CAP, Math.round(s("intellect") * TECH_RESIST_PER_INT * 10) / 10);

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
    weights,
    level,
  };
}

export function computeCombatPower(character, equippedItems = []) {
  const w = getClassWeights(character?.class);
  const total = computeTotalStats(character, equippedItems);
  const weighted = PRIMARY_STATS.reduce(
    (sum, k) => sum + (total[k] || 0) * (w[k] ?? 0.1),
    0
  );
  return Math.round((character.level || 1) * 50 + weighted * 10);
}
