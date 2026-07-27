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

// Count unequipped items owned by a character — equipped gear doesn't count
// against the inventory cap.
export async function countItems(characterId) {
  const items = await api.entities.Item.filter({ character_id: characterId, is_equipped: { $ne: true } });
  return items.length;
}

// Try to add an item. If the inventory has room, creates it and returns it.
// If full, stashes the payload as pending (triggers the InventoryFullModal)
// and returns null.
export async function addItemWithCap(character, itemPayload) {
  // Fetch every owned item once: count unequipped for the cap check AND gather
  // all names so the new item can be given a unique name before creation.
  const all = await api.entities.Item.filter({ character_id: character.id });
  const unequipped = all.filter((i) => !i.is_equipped).length;
  if (unequipped >= getInventoryCap(character)) {
    setPendingItem(itemPayload);
    return null;
  }
  const finalPayload = ensureUniqueItemName(itemPayload, all.map((i) => i.name));
  return await api.entities.Item.create(finalPayload);
}