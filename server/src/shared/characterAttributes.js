/**
 * Authoritative character attribute sheet (Restoration 05 / Phase 1).
 *
 * Permanent attrs persist as components: class start + free-from-level + purchases.
 * Character.stats is a recomputed cache of those components.
 * Effective attrs add gear + stims. Derived *sheet* stats use productionMath.
 * Combat event resolution still uses statEngine until Phase 3.
 */
import { entities } from "../entities.js";
import {
  PRIMARY_STATS,
  computePermanentTotalStats,
  computeTotalStats,
  computeCombatPower,
  CRIT_MULT,
  getClassWeights,
  getDamageType,
  resolvePermanentAttributes,
} from "./statEngine.js";
import { getActiveBuffs } from "../../../src/lib/gameData.js";
import { getNextAttributePointCost } from "./economyFormulas.js";
import {
  maxHp,
  rawStandardAttack,
  critChance,
  dodgeChance,
  resistances,
  classArchetype,
  classPrimaryIndex,
  roundHalfUp,
} from "./productionMath.js";

export const ATTR_KEYS = PRIMARY_STATS;
const SHEET_CHANCE_PERCENT_SCALE = 100;
const ARCHETYPE_TO_COMBAT_KEY = Object.freeze({
  Might: "str",
  Reflex: "agi",
  Tech: "int",
});

export function emptyAttrMap() {
  const out = {};
  for (const k of ATTR_KEYS) out[k] = 0;
  return out;
}

/** Persisted permanent attributes (Character.stats). */
export function readPermanentAttributes(character = {}) {
  return resolvePermanentAttributes(character);
}

/** Raw flat gear bonuses before stims. */
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
 * Phase 1 character-sheet derived stats from productionMath.
 * Combat resolution continues to use statEngine.computeDerivedStats (Phase 3).
 */
export function computeProductionSheetDerived(totalStats, character) {
  const level = Math.max(1, Math.floor(Number(character?.level) || 1));
  const className = character?.class || "";
  const archetype = classArchetype(className);
  const primaryIndex = classPrimaryIndex(className);
  const attrs = ATTR_KEYS.map((k) => Math.max(0, Number(totalStats?.[k]) || 0));
  const resist = resistances(level, attrs, archetype);
  const primaryKey = ATTR_KEYS[primaryIndex] || "strength";
  const primaryValue = attrs[primaryIndex] || 0;
  return {
    damage: roundHalfUp(rawStandardAttack(primaryValue)),
    critChance: critChance(level, attrs[4]) * SHEET_CHANCE_PERCENT_SCALE,
    critMult: CRIT_MULT,
    health: maxHp(attrs[3]),
    dodgeChance: dodgeChance(level, attrs[1], archetype) * SHEET_CHANCE_PERCENT_SCALE,
    armor: resist.might * SHEET_CHANCE_PERCENT_SCALE,
    techResist: resist.tech * SHEET_CHANCE_PERCENT_SCALE,
    reflexResist: resist.reflex * SHEET_CHANCE_PERCENT_SCALE,
    damageType: getDamageType(className),
    archetype: ARCHETYPE_TO_COMBAT_KEY[archetype] || "str",
    primaryStat: primaryKey,
    primaryValue,
    weights: getClassWeights(className),
    level,
  };
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

  const derived_permanent = computeProductionSheetDerived(permanent_totals, character);
  const derived = computeProductionSheetDerived(effective_attributes, character);

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
