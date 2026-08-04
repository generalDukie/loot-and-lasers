import { entities } from "../entities.js";
import { getInventoryCap } from "./economyFormulas.js";
import { createPendingLoot } from "../rewards/store.js";

/** Bag occupancy — equipped gear does not consume inventory slots. */
export function countBagOccupancy(ch) {
  const owned = entities.Item.filter({ character_id: ch.id }, null, 500);
  return owned.filter((i) => !i.is_equipped).length;
}

/**
 * Block unequipping into a full bag. Equipped→bag increases occupancy by 1.
 * Slot swaps (equip another piece of the same type) keep bag size the same and are allowed.
 */
export function assertCanUnequipToBag(existing, patch) {
  if (!existing || patch?.is_equipped !== false || !existing.is_equipped) return;
  const ch = existing.character_id ? entities.Character.get(existing.character_id) : null;
  if (!ch) return;
  const cap = getInventoryCap(ch);
  if (countBagOccupancy(ch) >= cap) {
    const err = new Error("Inventory full — dissolve an item before unequipping");
    err.status = 400;
    throw err;
  }
}

/** Grant an item, or return it as pending loot when the bag is at cap (no auto-dissolve). */
export function grantItemOrPending(ch, itemPayload) {
  const cap = getInventoryCap(ch);
  if (countBagOccupancy(ch) >= cap) {
    return { item: null, pending: itemPayload, compensated: 0 };
  }
  const created = entities.Item.create({
    ...itemPayload,
    owner_id: ch.created_by_id,
    character_id: ch.id,
    is_equipped: false,
  });
  return { item: created, pending: null, compensated: 0 };
}

/**
 * Persist a GenerateGearItem / randomItem payload through the shared inventory path.
 * Does not regenerate stats — snapshots the provided fields.
 */
export function PersistGeneratedItem(ch, generatedItem) {
  if (!generatedItem || typeof generatedItem !== "object") {
    const err = new Error("Missing generated item");
    err.status = 400;
    throw err;
  }
  return grantItemOrPending(ch, {
    ...generatedItem,
    owner_id: ch.created_by_id,
    character_id: ch.id,
    is_equipped: false,
  });
}

/**
 * Collect a grant result into items / pending_loot arrays.
 * Pending overflow MUST be persisted via createPendingLoot so the client can AcceptPendingLoot.
 *
 * @param {object} result - from grantItemOrPending
 * @param {array} items
 * @param {array} pendingLoot - receives { id, item } records
 * @param {{ accountId: string, characterId: string, claimId?: string, claimKey?: string }} ctx
 */
export function collectGrant(result, items, pendingLoot, ctx) {
  if (result?.item) {
    items.push(result.item);
    return;
  }
  if (!result?.pending) return;
  if (!ctx?.accountId || !ctx?.characterId) {
    const err = new Error("Pending loot requires accountId and characterId");
    err.status = 500;
    throw err;
  }
  const pl = createPendingLoot({
    accountId: ctx.accountId,
    characterId: ctx.characterId,
    claimId: ctx.claimId || null,
    claimKey: ctx.claimKey || null,
    item: result.pending,
  });
  pendingLoot.push({ id: pl.id, item: pl.item });
}
