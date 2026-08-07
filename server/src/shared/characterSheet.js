/**
 * Thin Character sheet helpers for Layer 2 foundation.
 * Persisted create-shape + sheet inputs. Effective attrs / derived combat stats
 * live in characterAttributes.js (statEngine re-export).
 */
import { CLASS_BASE_STATS } from "./economyFormulas.js";
import { resolvePermanentAttributes } from "./statEngine.js";
export {
  buildAttributeSheet,
  loadEquippedItemsForCharacter,
  readPermanentAttributes,
  ATTR_KEYS,
} from "./characterAttributes.js";
export {
  ensureCharacterPermanentStats,
  repairPermanentAttributes,
  permanentStatsNeedClassBaseRepair,
} from "./characterStatsRepair.js";

/** Keys every server-authored Character create must expose after sanitization. */
export const REQUIRED_CHARACTER_CREATE_KEYS = Object.freeze([
  "name",
  "class",
  "stats",
  "level",
  "experience",
  "experience_to_next_level",
  "stardust",
  "nova_crystals",
  "fuel",
  "max_fuel",
  "attribute_purchases",
  "attribute_purchases_by_stat",
  "equipped_items",
  "created_by_id",
]);

export function classBaseStats(className) {
  return CLASS_BASE_STATS[className] ? { ...CLASS_BASE_STATS[className] } : null;
}

/**
 * Read persisted inputs other systems need without inventing derived combat.
 */
export function readPersistedSheetInputs(character = {}) {
  const stats = resolvePermanentAttributes(character);
  const purchases =
    character?.attribute_purchases_by_stat &&
    typeof character.attribute_purchases_by_stat === "object"
      ? { ...character.attribute_purchases_by_stat }
      : {
          strength: 0,
          agility: 0,
          intellect: 0,
          vitality: 0,
          luck: 0,
        };
  const equipped =
    character?.equipped_items && typeof character.equipped_items === "object"
      ? { ...character.equipped_items }
      : {};
  const buffs = Array.isArray(character?.active_buffs)
    ? character.active_buffs.slice()
    : [];
  return {
    id: character?.id || "",
    class: character?.class || "",
    race: character?.race || "",
    level: Number(character?.level) || 1,
    stats,
    attribute_purchases_by_stat: purchases,
    equipped_items: equipped,
    active_buffs: buffs,
    fuel: Number(character?.fuel) || 0,
    stardust: Number(character?.stardust) || 0,
    nova_crystals: Number(character?.nova_crystals) || 0,
  };
}

/**
 * Lightweight create-shape guard. Throws 400 on missing required keys.
 * Does not reshape or invent field values.
 */
export function assertCharacterCreateShape(character) {
  if (!character || typeof character !== "object") {
    const err = new Error("Invalid character payload");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  for (const key of REQUIRED_CHARACTER_CREATE_KEYS) {
    if (character[key] === undefined || character[key] === null) {
      const err = new Error(`Character missing required field: ${key}`);
      err.status = 400;
      err.code = "VALIDATION_ERROR";
      throw err;
    }
  }
  if (!character.stats || typeof character.stats !== "object") {
    const err = new Error("Character stats must be an object");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (!classBaseStats(character.class) && character.class) {
    // Class already validated upstream for players; keep assert soft for admins.
  }
  return character;
}
