/**
 * Attribute badge artwork URLs.
 * Uses `new URL(..., import.meta.url)` so this module is safe to import from
 * both Vite (bundled asset URLs) and Node (file:// URLs) — gameData is shared.
 */

/** Hexagonal attribute badge artwork (badge only — no text labels). */
export const STAT_ICON_SRC = {
  strength: new URL("../assets/stats/strength.png", import.meta.url).href,
  agility: new URL("../assets/stats/agility.png", import.meta.url).href,
  intellect: new URL("../assets/stats/intellect.png", import.meta.url).href,
  vitality: new URL("../assets/stats/vitality.png", import.meta.url).href,
  luck: new URL("../assets/stats/luck.png", import.meta.url).href,
};

/** Image-URL alias — text/chip UIs should use emoji STAT_ICONS from gameData instead. */
export const STAT_ICONS = STAT_ICON_SRC;

export function getStatIconSrc(stat) {
  return STAT_ICON_SRC[stat] || null;
}
