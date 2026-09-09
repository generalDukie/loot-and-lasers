/**
 * Stim presentation overlay — 15 catalog names from the stim pack.
 *
 * Keys MUST be visual ids (`stim_{stat}_{rarity}`). `name` is the player-facing
 * title from the pack (do not invent). New stims only; existing inventory is
 * not remapped.
 *
 * Mirror the same 15 names in `loot&lasers/Scripts/StimCatalog.gd`.
 */
import {
  MARKET_STIM_ATTRIBUTES,
  STIM_TIERS,
  STIM_VISUAL_ID_PREFIX,
  STIM_VISUAL_ID_SEPARATOR,
} from "./constants.js";

const STIM_ITEM_TYPE = "consumable";

export const STIM_PRESENTATION = Object.freeze({
  stim_strength_uncommon: Object.freeze({ name: "Strength Field Injector" }),
  stim_agility_uncommon: Object.freeze({ name: "Agility Field Injector" }),
  stim_intellect_uncommon: Object.freeze({ name: "Intellect Field Injector" }),
  stim_vitality_uncommon: Object.freeze({ name: "Vitality Field Injector" }),
  stim_luck_uncommon: Object.freeze({ name: "Luck Field Injector" }),
  stim_strength_rare: Object.freeze({ name: "Strength Precision Injector" }),
  stim_agility_rare: Object.freeze({ name: "Agility Precision Injector" }),
  stim_intellect_rare: Object.freeze({ name: "Intellect Precision Injector" }),
  stim_vitality_rare: Object.freeze({ name: "Vitality Precision Injector" }),
  stim_luck_rare: Object.freeze({ name: "Luck Precision Injector" }),
  stim_strength_epic: Object.freeze({ name: "Strength Infusion Capsule" }),
  stim_agility_epic: Object.freeze({ name: "Agility Infusion Capsule" }),
  stim_intellect_epic: Object.freeze({ name: "Intellect Infusion Capsule" }),
  stim_vitality_epic: Object.freeze({ name: "Vitality Infusion Capsule" }),
  stim_luck_epic: Object.freeze({ name: "Luck Infusion Capsule" }),
});

export function stimVisualId(stat, rarity) {
  const s = String(stat || "").trim().toLowerCase();
  const r = String(rarity || "").trim().toLowerCase();
  if (!MARKET_STIM_ATTRIBUTES.includes(s) || !STIM_TIERS[r]) return "";
  return [STIM_VISUAL_ID_PREFIX, s, r].join(STIM_VISUAL_ID_SEPARATOR);
}

export function stimDisplayName(stat, rarity) {
  const id = stimVisualId(stat, rarity);
  if (!id) return "";
  return String(STIM_PRESENTATION[id]?.name || "").trim() || id;
}

function buildStimCatalog() {
  const rows = [];
  for (const rarity of Object.keys(STIM_TIERS)) {
    for (const stat of MARKET_STIM_ATTRIBUTES) {
      const id = stimVisualId(stat, rarity);
      const name = stimDisplayName(stat, rarity);
      rows.push(Object.freeze({ id, name, stat, rarity }));
    }
  }
  return Object.freeze(rows);
}

export const STIM_CATALOG = buildStimCatalog();

export function applyStimPresentation(item) {
  if (!item || typeof item !== "object") return item;
  const type = String(item.type || "").trim().toLowerCase();
  if (type && type !== STIM_ITEM_TYPE) return item;
  const consumable = item.consumable && typeof item.consumable === "object"
    ? item.consumable
    : null;
  const stat = String(consumable?.stat || "").trim().toLowerCase();
  const rarity = String(item.rarity || consumable?.tier || "").trim().toLowerCase();
  const id = stimVisualId(stat, rarity);
  const overlay = id ? STIM_PRESENTATION[id] : null;
  if (!overlay) return item;
  return {
    ...item,
    name: overlay.name,
    base_name: overlay.name,
    visual_id: id,
  };
}
