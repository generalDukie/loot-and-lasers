// ═══════════════════════════════════════════
// STAT ENGINE — Shakes & Fidget-style RPG attributes
// ═══════════════════════════════════════════
// 5 PRIMARY ATTRIBUTES → derived OFFENSIVE & DEFENSIVE combat stats.
//
//  Strength  → +1 Physical Damage / pt          (Vanguard primary)
//  Agility   → +0.3% Dodge / pt (cap 40%)       (Shadow Operative primary)
//  Intellect → +1 Tech Damage / pt              (Technomancer / Cosmic Engineer primary)
//  Vitality  → +8 HP / pt, +0.5% Armor / pt     (Astral Warden primary)
//  Luck      → +0.3% Crit / pt (cap 35%)
//
// Every class benefits from Vitality (survivability) and Luck (crits),
// but each class's DAMAGE scales primarily from one attribute. This creates
// clear build differentiation: stack your primary stat for offense, or invest
// in Vitality/Luck for a tankier, crit-fishing playstyle.
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

// ── Class scaling weights (1.0 = primary damage stat) ──
// Determines how much each attribute contributes to Combat Power.
// Primary = 1.0, vitality = 0.5 (survivability), luck = 0.3 (crits),
// then two secondaries split 0.15 / 0.05.
export const CLASS_STAT_WEIGHTS = {
  Vanguard:           { strength: 1.0,  vitality: 0.5, luck: 0.3, agility: 0.15, intellect: 0.05 },
  "Shadow Operative": { agility: 1.0,  vitality: 0.5, luck: 0.3, strength: 0.15, intellect: 0.05 },
  Technomancer:      { intellect: 1.0, vitality: 0.5, luck: 0.3, agility: 0.15, strength: 0.05 },
  "Cosmic Engineer": { intellect: 1.0, vitality: 0.5, luck: 0.3, agility: 0.15, strength: 0.05 },
  "Astral Warden":   { vitality: 1.0,  intellect: 0.5, luck: 0.3, strength: 0.15, agility: 0.05 },
};

// Astral Warden trades raw offense for durability — Vitality is both its
// primary damage source AND HP source, so raw damage is dampened to prevent
// double-dipping into top-tier power.
export const CLASS_ATK_MULT = {
  Vanguard: 1.0,
  "Shadow Operative": 1.0,
  Technomancer: 1.0,
  "Cosmic Engineer": 1.0,
  "Astral Warden": 0.7,
};

export function getClassWeights(className) {
  return CLASS_STAT_WEIGHTS[className] || CLASS_STAT_WEIGHTS.Vanguard;
}

// ── Caps & constants ──
export const CRIT_CAP = 35;   // % — max crit chance from Luck
export const DODGE_CAP = 40;  // % — max dodge chance from Agility
export const ARMOR_CAP = 50;  // % — max damage reduction from Vitality
export const CRIT_MULT = 2;   // crits deal 2× damage

// ── Total attributes: base + buffs + equipped gear ──
// Item stats are already rarity-scaled at generation time (see _rollItem in
// gameData.js), so we add them raw here — NO second rarity multiplier.
// This is the single aggregation point used by the sheet, arena, and dungeon.
export function computeTotalStats(character, equippedItems = []) {
  const stats = applyBuffs(character?.stats || {}, getActiveBuffs(character));
  for (const it of equippedItems) {
    for (const [k, v] of Object.entries(it.stats || {})) {
      stats[k] = (stats[k] || 0) + (v || 0);
    }
  }
  return applyRaceBonus(stats, character?.race);
}

// Same as computeTotalStats but WITHOUT applying active stim buffs (base + gear
// only). Used to show how much each active stim contributes to the displayed
// combat stats.
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
// Both the character sheet and the arena/dungeon engines use these formulas
// so displayed values always match actual battle behaviour.
//
// OFFENSIVE:  Damage, Critical Chance
// DEFENSIVE:  Max Health, Dodge Chance, Armor
export function computeDerivedStats(totalStats, character) {
  const level = character?.level || 1;
  const weights = getClassWeights(character?.class);
  const s = (k) => totalStats?.[k] || 0;

  const primaryStat = CLASSES[character?.class]?.primaryStat || "strength";
  const atkMult = CLASS_ATK_MULT[character?.class] ?? 1.0;

  // ── OFFENSIVE ──
  // Damage mirrors the arena battle formula: primary stat × 2 + level × 3,
  // including the Astral Warden offense trade-off.
  const damage = Math.round((s(primaryStat) || 5) * 2 * atkMult + level * 3);
  // Crit: 3% base + 0.3% per Luck, capped.
  const critChance = Math.min(CRIT_CAP, Math.round((3 + s("luck") * 0.3) * 10) / 10);

  // ── DEFENSIVE ──
  // Health: Vitality × 8 + level × 20 + 80 base.
  const health = Math.round(s("vitality") * 8 + level * 20 + 80);
  // Dodge: 5% base + 0.3% per Agility, capped.
  const dodgeChance = Math.min(DODGE_CAP, Math.round((5 + s("agility") * 0.3) * 10) / 10);
  // Armor: 0.5% per Vitality, capped — flat % damage reduction.
  const armor = Math.min(ARMOR_CAP, Math.round(s("vitality") * 0.5 * 10) / 10);

  return {
    // offensive
    damage,
    critChance,
    critMult: CRIT_MULT,
    // defensive
    health,
    dodgeChance,
    armor,
    // meta
    primaryStat,
    weights,
    level,
  };
}

// ── Unified Combat Power ──
// Weights each attribute by class suitability, then adds level seasoning.
// Used by the character sheet for a single, readable power number.
export function computeCombatPower(character, equippedItems = []) {
  const w = getClassWeights(character?.class);
  const total = computeTotalStats(character, equippedItems);
  const weighted = PRIMARY_STATS.reduce(
    (sum, k) => sum + (total[k] || 0) * (w[k] ?? 0.1),
    0
  );
  return Math.round((character.level || 1) * 50 + weighted * 10);
}