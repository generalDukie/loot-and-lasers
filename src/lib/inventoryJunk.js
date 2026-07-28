import { powerRating } from "@/components/game/StatCompareBubble";

export const EQUIPPABLE_TYPES = [
  "weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module",
];

/**
 * Junk eligible for one-click Dissolve Junk:
 * - unequippable (materials, consumables, …)
 * - common equippable gear strictly worse than the piece already equipped in that slot
 * Skips locked / equipped items. Commons for empty slots are kept (might equip).
 */
export function isDissolveJunk(item, equippedItems = [], characterClass) {
  if (!item || item.locked || item.is_equipped) return false;
  if (!EQUIPPABLE_TYPES.includes(item.type)) return true;
  if (item.rarity !== "common") return false;
  const eq = (equippedItems || []).find((e) => e.type === item.type && e.is_equipped);
  if (!eq) return false;
  return powerRating(item, characterClass) < powerRating(eq, characterClass);
}

export function listDissolveJunk(items, characterClass) {
  const list = items || [];
  const equipped = list.filter((i) => i.is_equipped);
  return list.filter((i) => isDissolveJunk(i, equipped, characterClass));
}
