import { entities } from "../entities.js";
import { getInventoryCap } from "./economyFormulas.js";

/** Grant an item, or return it as pending loot when at cap (no auto-dissolve). */
export function grantItemOrPending(ch, itemPayload) {
  const cap = getInventoryCap(ch);
  const owned = entities.Item.filter({ character_id: ch.id }, null, 500);
  if (owned.length >= cap) {
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
