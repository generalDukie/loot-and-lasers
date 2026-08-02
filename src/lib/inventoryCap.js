import { api } from "@/api/gameClient";
import { INVENTORY_CAP, getInventoryCap } from "@/lib/gameData";

export { INVENTORY_CAP, getInventoryCap };

/**
 * Pending inventory pressure:
 * - loot: new drop waiting for a bag slot
 * - unequip: equipped gear waiting to move into a full bag
 * - overflow: bag already over cap — must dissolve down to cap
 * - need_slot: bag at cap (e.g. mission launch) — dissolve until one free slot
 */
let pending = null; // { mode: 'loot'|'unequip'|'overflow'|'need_slot', item: object|null, pendingLootId?: string }
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

export function setPendingItem(item, mode = "loot", pendingLootId = null) {
  if (!item && mode !== "overflow" && mode !== "need_slot") {
    pending = null;
  } else {
    pending = { mode, item: item || null, pendingLootId: pendingLootId || null };
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

/** At-cap gate (mission launch, etc.) — dissolve until bagCount < cap. */
export function setPendingNeedSlot() {
  pending = { mode: "need_slot", item: null };
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

/** Normalize a server pending_loot list entry into { id, item }. */
function normalizePendingEntry(entry) {
  if (!entry) return null;
  if (entry.id && entry.item) return { id: entry.id, item: entry.item };
  // Legacy bare item — no server id (unclaimable until hydrated).
  return { id: entry.id || null, item: entry };
}

/** Pull pending loot from a server function response and open the full-inventory modal. */
export function applyPendingLootFromResponse(res) {
  const list = res?.pending_loot || res?.data?.pending_loot;
  if (!Array.isArray(list) || list.length === 0) return false;
  const first = normalizePendingEntry(list[0]);
  if (!first?.item) return false;

  // Prefer a server id; upgrade an existing client-only pending if we now have one.
  const existing = pending;
  if (!existing || existing.mode !== "loot") {
    setPendingItem(first.item, "loot", first.id);
    return true;
  }
  if (!existing.pendingLootId && first.id) {
    setPendingItem(first.item, "loot", first.id);
  }
  return true;
}

/**
 * Load the oldest server-persisted pending loot for this character into client state.
 * Returns { pending, hydrated, cleared }.
 */
export async function hydratePendingLootFromServer(characterId) {
  if (!characterId) return { pending: getPending(), hydrated: false, cleared: false };
  try {
    const res = await api.rewards.pendingLoot(characterId);
    const list = res?.pending_loot || [];
    if (!Array.isArray(list) || list.length === 0) {
      let cleared = false;
      if (pending?.mode === "loot" && !pending.pendingLootId) {
        // Ephemeral client-only pending that was never persisted — drop it.
        clearPendingItem();
        cleared = true;
      }
      return { pending: getPending(), hydrated: true, cleared };
    }
    const first = normalizePendingEntry(list[0]);
    if (!first?.id || !first?.item) {
      return { pending: getPending(), hydrated: true, cleared: false };
    }

    const existing = pending;
    if (!existing || existing.mode !== "loot" || !existing.pendingLootId) {
      setPendingItem(first.item, "loot", first.id);
    }
    return { pending: getPending(), hydrated: true, cleared: false };
  } catch {
    return { pending: getPending(), hydrated: false, cleared: false };
  }
}

/** Ensure loot-mode pending has a server id before accept/dissolve. */
async function ensurePendingLootId(characterId) {
  if (pending?.mode !== "loot") return pending;
  if (pending.pendingLootId) return pending;
  const { pending: next } = await hydratePendingLootFromServer(characterId);
  return next;
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
  if (pending?.mode === "need_slot" && bagCount < cap) {
    clearPendingItem();
  }
  // Restore pending loot modal after refresh / navigation.
  if (!pending) {
    await hydratePendingLootFromServer(character.id);
  }
  return false;
}

/** If bag has room, finish pending loot / unequip / clear overflow. */
export async function tryClaimPendingIfSpaceAvailable(character) {
  const p = pending;
  if (!p || !character?.id) return null;

  if (p.mode === "overflow" || p.mode === "need_slot") {
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
  let p = pending;
  if (!p || !character?.id) return null;

  if (p.mode === "overflow") {
    const bagCount = await countItems(character.id);
    if (bagCount <= getInventoryCap(character)) {
      clearPendingItem();
      return { kind: "overflow_cleared", bagCount };
    }
    return { kind: "overflow", bagCount };
  }

  if (p.mode === "need_slot") {
    const bagCount = await countItems(character.id);
    if (bagCount < getInventoryCap(character)) {
      clearPendingItem();
      return { kind: "overflow_cleared", bagCount };
    }
    return { kind: "need_slot", bagCount };
  }

  if (p.mode === "loot" && p.item) {
    p = (await ensurePendingLootId(character.id)) || p;
    if (!p?.pendingLootId) {
      throw new Error("Missing pending_loot_id — refresh inventory and try again");
    }
    await api.functions.invoke("AcceptPendingLoot", { pending_loot_id: p.pendingLootId });
    const claimed = p.item;
    clearPendingItem();
    // If more overflow loot is queued server-side, surface the next one.
    await hydratePendingLootFromServer(character.id);
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

// Client-side preview helper — actual grants must go through AcceptPendingLoot with pending_loot_id.
export async function addItemWithCap(character, itemPayload) {
  const all = await api.entities.Item.filter({ character_id: character.id });
  const bagCount = all.filter((i) => !i.is_equipped).length;
  if (bagCount >= getInventoryCap(character)) {
    setPendingItem(itemPayload, "loot");
    return null;
  }
  // Direct client creates are no longer supported for forged payloads.
  throw new Error("Use server reward flows — AcceptPendingLoot requires pending_loot_id");
}
