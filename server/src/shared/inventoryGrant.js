import { entities } from "../entities.js";
import { getInventoryCap } from "./economyFormulas.js";

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

export function collectGrant(result, items, pendingLoot) {
  if (result?.item) items.push(result.item);
  else if (result?.pending) pendingLoot.push(result.pending);
}
