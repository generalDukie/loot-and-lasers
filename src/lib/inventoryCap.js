import { api } from "@/api/gameClient";
import { INVENTORY_CAP, ensureUniqueItemName, getInventoryCap } from "@/lib/gameData";

export { INVENTORY_CAP, getInventoryCap };

/**
 * Pending inventory pressure:
 * - loot: new drop waiting for a bag slot
 * - unequip: equipped gear waiting to move into a full bag
 * - overflow: bag already over cap — must dissolve down to cap
 */
let pending = null; // { mode: 'loot'|'unequip'|'overflow', item: object|null }
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(pending));
}

export function getPending() {
  return pending;
}

/** Back-compat — returns the pending item payload (loot/unequip), or null. */
export function getPendingItem() {
  return pending?.item ?? null;
}

export function getPendingMode() {
  return pending?.mode ?? null;
}

export function setPendingItem(item, mode = "loot") {
  if (!item && mode !== "overflow") {
    pending = null;
  } else {
    pending = { mode, item: item || null };
  }
  emit();
}

export function setPendingUnequip(item) {
  if (!item) return;
  pending = { mode: "unequip", item };
  emit();
}

export function setPendingOverflow() {
  pending = { mode: "overflow", item: null };
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
  if (!pending) setPendingItem(list[0], "loot");
  return true;
}

export async function countItems(characterId) {
  const items = await api.entities.Item.filter({ character_id: characterId, is_equipped: { $ne: true } });
  return items.length;
}

/** If bag is over the hard cap, force the mandatory dissolve modal. */
export async function enforceInventoryCap(character) {
  if (!character?.id) return false;
  const bagCount = await countItems(character.id);
  const cap = getInventoryCap(character);
  if (bagCount > cap) {
    setPendingOverflow();
    return true;
  }
  if (pending?.mode === "overflow" && bagCount <= cap) {
    clearPendingItem();
  }
  return false;
}

/** If bag has room, finish pending loot / unequip / clear overflow. */
export async function tryClaimPendingIfSpaceAvailable(character) {
  const p = pending;
  if (!p || !character?.id) return null;

  if (p.mode === "overflow") {
    return resolvePendingAfterFreeSlot(character);
  }

  const bagCount = await countItems(character.id);
  if (bagCount >= getInventoryCap(character)) return null;

  return resolvePendingAfterFreeSlot(character);
}

/**
 * After freeing a bag slot, finish whatever was waiting (claim loot or complete unequip).
 * Returns a short result for UI toasts; null if nothing pending / overflow still over.
 */
export async function resolvePendingAfterFreeSlot(character) {
  const p = pending;
  if (!p || !character?.id) return null;

  if (p.mode === "overflow") {
    const bagCount = await countItems(character.id);
    if (bagCount <= getInventoryCap(character)) {
      clearPendingItem();
      return { kind: "overflow_cleared", bagCount };
    }
    return { kind: "overflow", bagCount };
  }

  if (p.mode === "loot" && p.item) {
    await api.functions.invoke("AcceptPendingLoot", { item: p.item });
    const claimed = p.item;
    clearPendingItem();
    return { kind: "loot", item: claimed };
  }

  if (p.mode === "unequip" && p.item) {
    const eq = { ...(character.equipped_items || {}) };
    delete eq[p.item.type];
    await api.entities.Item.update(p.item.id, { is_equipped: false });
    await api.entities.Character.update(character.id, { equipped_items: eq });
    const item = p.item;
    clearPendingItem();
    return { kind: "unequip", item, patch: { equipped_items: eq } };
  }

  return null;
}

// Try to add an item. If the bag has room, creates it and returns it.
// If full, stashes the payload as pending (triggers the InventoryFullModal)
// and returns null.
export async function addItemWithCap(character, itemPayload) {
  const all = await api.entities.Item.filter({ character_id: character.id });
  const bagCount = all.filter((i) => !i.is_equipped).length;
  if (bagCount >= getInventoryCap(character)) {
    setPendingItem(itemPayload, "loot");
    return null;
  }
  const finalPayload = ensureUniqueItemName(itemPayload, all.map((i) => i.name));
  const res = await api.functions.invoke("AcceptPendingLoot", { item: finalPayload });
  return res.item || res.data?.item || null;
}
