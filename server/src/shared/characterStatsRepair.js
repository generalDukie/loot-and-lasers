/**
 * Persist class base stats when Character.stats were never written or sum < 50.
 */
import { entities } from "../entities.js";
import {
  repairPermanentAttributes,
  permanentStatsNeedClassBaseRepair,
} from "./statEngine.js";

export { repairPermanentAttributes, permanentStatsNeedClassBaseRepair };

/**
 * Repair missing class-base stats in-memory, persisting when the row exists.
 * @returns {{ character: object, repaired: boolean }}
 */
export function ensureCharacterPermanentStats(character) {
  if (!character || typeof character !== "object") {
    return { character, repaired: false };
  }
  const { stats, repaired } = repairPermanentAttributes(character);
  if (!repaired) {
    return { character, repaired: false };
  }
  if (!character.id || !entities.Character.get(character.id)) {
    return { character: { ...character, stats }, repaired: true };
  }
  const updated = entities.Character.update(character.id, { stats });
  return { character: updated, repaired: true };
}
