import { entities } from "../entities.js";
import { getInventoryCap } from "./economyFormulas.js";

/** Bag occupancy — equipped gear does not consume inventory slots. */
export function countBagOccupancy(ch) {
  const owned = entities.Item.filter({ character_id: ch.id }, null, 500);
  return owned.filter((i) => !i.is_equipped).length;
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
