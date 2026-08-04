/**
 * Authoritative character attribute sheet (Restoration 05).
 *
 * Permanent attrs persist on Character.stats (class base + level grants + buys).
 * Effective attrs and derived combat stats are computed here — never stored.
 *
 * Class passives remain combat-time (unchanged) — not folded into sheet totals.
 */
import { entities } from "../entities.js";
import {
  PRIMARY_STATS,
  computePermanentTotalStats,
  computeTotalStats,
  computeDerivedStats,
  computeCombatPower,
  CRIT_MULT,
} from "./statEngine.js";
import { getActiveBuffs } from "../../../src/lib/gameData.js";
import { getNextAttributePointCost } from "./economyFormulas.js";

export const ATTR_KEYS = PRIMARY_STATS;

export function emptyAttrMap() {
  const out = {};
  for (const k of ATTR_KEYS) out[k] = 0;
  return out;
}

/** Persisted permanent attributes (Character.stats). */
export function readPermanentAttributes(character = {}) {
  const stats = character?.stats && typeof character.stats === "object" ? character.stats : {};
  const out = emptyAttrMap();
  for (const k of ATTR_KEYS) {
    out[k] = Math.max(0, Math.round(Number(stats[k]) || 0));
  }
  return out;
}

/** Raw flat gear bonuses before race / stims. */
export function equipmentAttributeBonuses(equippedItems = []) {
  const out = emptyAttrMap();
  for (const it of equippedItems || []) {
    const st = it?.stats && typeof it.stats === "object" ? it.stats : {};
    for (const k of ATTR_KEYS) {
      out[k] += Math.round(Number(st[k]) || 0);
    }
  }
  return out;
}

export function loadEquippedItemsForCharacter(characterId) {
  if (!characterId) return [];
  return (
    entities.Item.filter(
      { character_id: characterId, is_equipped: true },
      "-created_date",
      20,
    ) || []
  );
}

/**
 * Build the full authoritative attribute sheet for a Character document.
 * @param {object} character
 * @param {object[]|null} equippedItems — omit to load from entities
 */
export function buildAttributeSheet(character, equippedItems = null) {
  const items =
    equippedItems == null
      ? loadEquippedItemsForCharacter(character?.id)
      : equippedItems || [];

  const permanent_attributes = readPermanentAttributes(character);
  const equipment_bonuses = equipmentAttributeBonuses(items);
  const naked_totals = computePermanentTotalStats(character, []);
  const permanent_totals = computePermanentTotalStats(character, items);
  const effective_attributes = computeTotalStats(character, items);
  const active_buffs = getActiveBuffs(character);

  const stim_bonuses = emptyAttrMap();
  for (const k of ATTR_KEYS) {
    stim_bonuses[k] =
      (effective_attributes[k] || 0) - (permanent_totals[k] || 0);
  }

  // Passives apply during combat settlement — sheet matches live web/Godot.
  const class_passive_bonuses = emptyAttrMap();

  const derived_permanent = computeDerivedStats(permanent_totals, character);
  const derived = computeDerivedStats(effective_attributes, character);

  const next_costs = {};
  for (const k of ATTR_KEYS) {
    next_costs[k] = getNextAttributePointCost(character, k);
  }

  return {
    character_id: character?.id || "",
    level: Number(character?.level) || 1,
    class: character?.class || "",
    race: character?.race || "",
    permanent_attributes,
    equipment_bonuses,
    stim_bonuses,
    class_passive_bonuses,
    naked_totals,
    permanent_totals,
    effective_attributes,
    derived_permanent,
    derived,
    combat_power: computeCombatPower(character, items),
    active_buffs,
    next_costs,
    crit_mult: CRIT_MULT,
  };
}
