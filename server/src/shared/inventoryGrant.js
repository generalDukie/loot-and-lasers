import { entities } from "../entities.js";
import { getInventoryCap } from "./economyFormulas.js";
import { createPendingLoot } from "../rewards/store.js";
import { EQUIPMENT_SLOTS } from "./itemGeneration.js";
import { canonicalGearSlot } from "./productionMath.js";

const GEAR_TYPE_SET = new Set(EQUIPMENT_SLOTS);
const OWNED_ITEM_QUERY_LIMIT = 500;

export const BACKPACK_FULL_ERROR_CODE = "INVENTORY_FULL";
export const BACKPACK_FULL_ERROR_MESSAGE = "Inventory full — sell an item at the Black Market first";

export function isBackpackGearType(type) {
  return !!canonicalGearSlot(type) || GEAR_TYPE_SET.has(String(type || ""));
}

/** Unequipped backpack occupancy. Gear, stims, junk, and materials all count. */
export function countBagOccupancy(ch) {
  const owned = entities.Item.filter({ character_id: ch.id }, null, OWNED_ITEM_QUERY_LIMIT);
  return owned.filter((i) => !i.is_equipped).length;
}

export function backpackHasSpace(ch, extraSlots = 1) {
  const need = Math.max(1, Math.floor(Number(extraSlots) || 1));
  return countBagOccupancy(ch) + need <= getInventoryCap(ch);
}

/**
 * Hard-block player actions that would put a new item in the backpack.
 * In-flight settlement may still use grantItemOrPending → pending loot.
 */
export function assertBackpackHasSpace(ch, extraSlots = 1) {
  if (backpackHasSpace(ch, extraSlots)) return;
  const err = new Error(BACKPACK_FULL_ERROR_MESSAGE);
  err.status = 400;
  err.code = BACKPACK_FULL_ERROR_CODE;
  throw err;
}

/** Unequipped backpack slots a reward payload will consume. Equipped promo kits do not count. */
export function backpackSlotsNeeded(rewards) {
  if (!rewards || typeof rewards !== "object") return 0;
  let n = 0;
  if (rewards.item_rarity) n += 1;
  if (Array.isArray(rewards.itemTemplates)) n += rewards.itemTemplates.length;
  if (Array.isArray(rewards.items)) n += rewards.items.length;
  if (rewards.collectible && rewards.collectible.type === "consumable") n += 1;
  return n;
}

/** True when a reward payload will insert at least one backpack item. */
export function rewardNeedsBackpackSlot(rewards) {
  return backpackSlotsNeeded(rewards) > 0;
}

/**
 * Block unequipping into a full backpack. Equipped→bag increases occupancy by 1.
 * Slot swaps (equip another piece of the same type) keep bag size the same and are allowed.
 */
export function assertCanUnequipToBag(existing, patch) {
  if (!existing || patch?.is_equipped !== false || !existing.is_equipped) return;
  const ch = existing.character_id ? entities.Character.get(existing.character_id) : null;
  if (!ch) return;
  const cap = getInventoryCap(ch);
  if (countBagOccupancy(ch) >= cap) {
    const err = new Error(BACKPACK_FULL_ERROR_MESSAGE);
    err.status = 400;
    err.code = BACKPACK_FULL_ERROR_CODE;
    throw err;
  }
}

/**
 * Insert into the backpack, or return pending when already at cap.
 * Every item type consumes a slot. Callers that start a reward action must
 * assertBackpackHasSpace first so the player is blocked instead of charged.
 */
export function grantItemOrPending(ch, itemPayload) {
  const cap = getInventoryCap(ch);
  if (countBagOccupancy(ch) >= cap) {
    return { item: null, pending: itemPayload, compensated: 0 };
  }
  const created = entities.Item.create({
    ...itemPayload,
    type: canonicalGearSlot(itemPayload?.type) || itemPayload?.type,
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
