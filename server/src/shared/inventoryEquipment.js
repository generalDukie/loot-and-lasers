/**
 * Authoritative inventory + equipment mutations (Restoration 06).
 * Item rows live in entities.Item; Character.equipped_items is a server-owned slot map.
 */
import { entities } from "../entities.js";
import { EQUIPMENT_SLOTS, computeItemVendorValue } from "./itemGeneration.js";
import { countBagOccupancy, BACKPACK_FULL_ERROR_MESSAGE } from "./inventoryGrant.js";
import { getInventoryCap } from "./economyFormulas.js";
import { canonicalGearSlot } from "./productionMath.js";
import {
  buildAttributeSheet,
  loadEquippedItemsForCharacter,
} from "./characterAttributes.js";

export { EQUIPMENT_SLOTS };

export const EQUIPABLE_TYPES = Object.freeze([...EQUIPMENT_SLOTS]);
const EQUIPABLE_SET = new Set(EQUIPMENT_SLOTS);

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

function computeLiveSellValue(item) {
  return computeItemVendorValue(item);
}

export function isEquippableType(type) {
  return !!canonicalGearSlot(type) || EQUIPABLE_SET.has(String(type || ""));
}

/** All Item rows owned by a character (bag + equipped). */
export function listOwnedItems(characterId, limit = 500) {
  if (!characterId) return [];
  return entities.Item.filter({ character_id: characterId }, "-created_date", limit) || [];
}

/** Canonical client-facing item shape (optional fields preserved when present). */
export function serializeItem(item) {
  if (!item || typeof item !== "object") return null;
  const type = canonicalGearSlot(item.type) || item.type;
  return {
    id: item.id,
    name: item.name,
    base_name: item.base_name,
    type,
    rarity: item.rarity,
    level: item.level ?? item.level_requirement ?? null,
    level_requirement: item.level_requirement ?? item.level ?? null,
    stat_budget_level: item.stat_budget_level ?? item.level ?? item.level_requirement ?? null,
    pre_variance_stat_budget: item.pre_variance_stat_budget ?? null,
    stat_budget_variance: item.stat_budget_variance ?? null,
    stat_budget: item.stat_budget ?? null,
    stats: item.stats && typeof item.stats === "object" ? item.stats : {},
    is_equipped: !!item.is_equipped,
    locked: !!item.locked,
    character_id: item.character_id || null,
    owner_id: item.owner_id || null,
    sell_value: computeLiveSellValue(item),
    origin: item.origin || "unassigned",
    manufacturer: item.manufacturer ?? null,
    shipment_eligible: item.shipment_eligible ?? null,
    consumable: item.consumable,
    flavor_text: item.flavor_text,
    created_date: item.created_date,
    updated_date: item.updated_date,
  };
}

export function buildInventorySnapshot(character) {
  const raw = listOwnedItems(character?.id);
  const items = raw.map(serializeItem).filter(Boolean);
  const equipped_items = items.filter((i) => i.is_equipped);
  const bag_items = items.filter((i) => !i.is_equipped);
  const sheet = buildAttributeSheet(
    character,
    loadEquippedItemsForCharacter(character?.id),
  );
  return {
    items,
    equipped_items,
    bag_items,
    bag_occupancy: bag_items.length,
    bag_capacity: getInventoryCap(character),
    equipped_map: { ...(character?.equipped_items || {}) },
    sheet,
    character,
  };
}

function requireOwnedItem(ch, itemId) {
  if (!itemId) httpErr(400, "Missing item_id", "VALIDATION_ERROR");
  const item = entities.Item.get(itemId);
  if (!item) httpErr(404, "Item not found", "ITEM_NOT_FOUND");
  if (item.character_id !== ch.id) {
    httpErr(403, "Not your item", "ITEM_NOT_OWNED");
  }
  return item;
}

/**
 * Equip an owned bag item into its type slot. Displaces any currently equipped
 * piece of the same type back to the bag (atomic within a transaction).
 */
export function equipItemForCharacter(ch, itemId) {
  const item = requireOwnedItem(ch, itemId);
  const slot = canonicalGearSlot(item.type) || item.type;
  if (!isEquippableType(slot)) {
    httpErr(400, "Item is not equippable", "SLOT_INCOMPATIBLE");
  }

  if (item.is_equipped) {
    const snap = buildInventorySnapshot(ch);
    return { success: true, already: true, ...snap };
  }

  const owned = listOwnedItems(ch.id);
  const current = owned.find(
    (i) => (canonicalGearSlot(i.type) || i.type) === slot && i.is_equipped && i.id !== item.id,
  );

  // Equip first so a full bag can still receive the displaced piece.
  entities.Item.update(item.id, { is_equipped: true, type: slot });
  if (current) {
    entities.Item.update(current.id, { is_equipped: false });
  }

  const eq = { ...(ch.equipped_items || {}) };
  if (eq.ring && slot === "accessory") delete eq.ring;
  eq[slot] = item.id;
  const character = entities.Character.update(ch.id, { equipped_items: eq });
  const snap = buildInventorySnapshot(character);
  return {
    success: true,
    already: false,
    swapped_from: current?.id || null,
    item_id: item.id,
    type: slot,
    ...snap,
  };
}

/**
 * Unequip an owned worn item into the bag. Rejects when the bag is at capacity.
 */
export function unequipItemForCharacter(ch, itemId) {
  const item = requireOwnedItem(ch, itemId);

  if (!item.is_equipped) {
    const snap = buildInventorySnapshot(ch);
    return { success: true, already: true, ...snap };
  }

  const cap = getInventoryCap(ch);
  if (countBagOccupancy(ch) >= cap) {
    httpErr(
      400,
      BACKPACK_FULL_ERROR_MESSAGE,
      "INVENTORY_FULL",
    );
  }

  entities.Item.update(item.id, { is_equipped: false });
  const eq = { ...(ch.equipped_items || {}) };
  const slot = canonicalGearSlot(item.type) || item.type;
  if (eq[slot] === item.id) delete eq[slot];
  if (eq.ring === item.id) delete eq.ring;
  const character = entities.Character.update(ch.id, { equipped_items: eq });
  const snap = buildInventorySnapshot(character);
  return {
    success: true,
    already: false,
    item_id: item.id,
    type: item.type,
    ...snap,
  };
}
