import { api } from "@/api/gameClient";
import { INVENTORY_CAP, ensureUniqueItemName, getInventoryCap } from "@/lib/gameData";

export { INVENTORY_CAP, getInventoryCap };

// Pending-item store — when an item can't be added (inventory full), it's
// stashed here so the InventoryFullModal can prompt the player and the Black
// Hole page can auto-claim it once room opens up.
let pending = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(pending));
}

export function getPendingItem() {
  return pending;
}

export function setPendingItem(item) {
  pending = item;
  emit();
}

export function clearPendingItem() {
  pending = null;
  emit();
}

export function subscribePending(fn) {
  listeners.add(fn);
  fn(pending);
  return () => listeners.delete(fn);
}

/** Pull pending loot from a server function response and open the full-inventory modal. */
export function applyPendingLootFromResponse(res) {
  const list = res?.pending_loot || res?.data?.pending_loot;
  if (!Array.isArray(list) || list.length === 0) return false;
  if (!pending) setPendingItem(list[0]);
  return true;
}

export async function countItems(characterId) {
  const items = await api.entities.Item.filter({ character_id: characterId });
  return items.length;
}

// Try to add an item. If the inventory has room, creates it and returns it.
// If full, stashes the payload as pending (triggers the InventoryFullModal)
// and returns null.
export async function addItemWithCap(character, itemPayload) {
  const all = await api.entities.Item.filter({ character_id: character.id });
  if (all.length >= getInventoryCap(character)) {
    setPendingItem(itemPayload);
    return null;
  }
  const finalPayload = ensureUniqueItemName(itemPayload, all.map((i) => i.name));
  const res = await api.functions.invoke("AcceptPendingLoot", { item: finalPayload });
  return res.item || res.data?.item || null;
}
