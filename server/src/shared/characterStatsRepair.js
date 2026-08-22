/**
 * Recompute persisted permanent attributes from production components
 * (starting + free-from-level + purchases) when they have drifted.
 */
import { entities } from "../entities.js";
import { xpToNext } from "./productionMath.js";
import {
  CHARACTER_CREATION_CATEGORY,
  CHARACTER_CREATION_NOVA_REASON,
  creditNova,
  getBalances,
  NovaBalanceTypes,
  recoverTransaction,
  STARTING_NOVA_DISPLAY,
} from "./currencyService.js";
import {
  repairPermanentAttributes,
  permanentStatsNeedClassBaseRepair,
} from "./statEngine.js";

export { repairPermanentAttributes, permanentStatsNeedClassBaseRepair };

/** Matches Godot HUD `maxi(1, experience_to_next_level)` when the field is missing. */
const XP_TO_NEXT_HUD_FLOOR = 1;

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

/**
 * Repair live characters that skipped production create defaults (admin create
 * used to omit XP-to-next and the 500 Nova grant). Idempotent.
 */
export function ensureCharacterLiveCreateDefaults(user, character) {
  const statsEnsured = ensureCharacterPermanentStats(character);
  let live = statsEnsured.character;
  let repaired = statsEnsured.repaired;
  if (!live?.id || !entities.Character.get(live.id)) {
    return { character: live, repaired };
  }

  const level = Math.max(1, Math.floor(Number(live.level) || 1));
  const canonicalToNext = xpToNext(level);
  const storedRaw = live.experience_to_next_level;
  const stored = Number(storedRaw);
  const xpToNextBroken =
    storedRaw == null
    || storedRaw === ""
    || !Number.isFinite(stored)
    || stored <= XP_TO_NEXT_HUD_FLOOR;

  if (!Number.isFinite(stored) || stored !== canonicalToNext) {
    live = entities.Character.update(live.id, {
      experience_to_next_level: canonicalToNext,
    });
    repaired = true;
  }

  const accountId = live.created_by_id || user?.id;
  const novaDisplay = getBalances(live).nova_crystals;
  const grantKey = `character_creation_nova:${live.id}`;
  const alreadyGranted = !accountId
    || !!recoverTransaction(accountId, CHARACTER_CREATION_CATEGORY, grantKey);
  if (!alreadyGranted && novaDisplay === 0 && (xpToNextBroken || level === 1)) {
    const grantUser = { id: accountId, email: user?.email || "" };
    live = creditNova({
      user: grantUser,
      character: live,
      amount: STARTING_NOVA_DISPLAY,
      category: CHARACTER_CREATION_CATEGORY,
      reasonCode: CHARACTER_CREATION_NOVA_REASON,
      relatedEntityType: "character",
      relatedEntityId: live.id,
      idempotencyKey: grantKey,
      balanceType: NovaBalanceTypes.PROMOTIONAL,
    }).character;
    repaired = true;
  }
  return { character: live, repaired };
}
