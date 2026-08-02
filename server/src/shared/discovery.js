/**
 * Cosmic Vault gear discovery keys — mirrors src/lib/gameData.js gearCatalogKey.
 * Persist via server reward delivery only (Character.discovered_gear is economy-locked).
 */

const GEAR_TYPES = new Set([
  "weapon",
  "armor",
  "helmet",
  "boots",
  "legs",
  "neck",
  "accessory",
  "ship_module",
]);

/** Stable catalog key for an equipment item, or null if not gear. */
export function gearCatalogKey(item) {
  if (!item || typeof item !== "object") return null;
  const type = item.type;
  if (!GEAR_TYPES.has(type)) return null;
  const base = item.base_name || item.name;
  if (!base) return null;
  return `${type}:${base}`;
}

/**
 * Merge gear discovery keys from granted/pending item payloads into `patch`.
 * Dedupes against character + in-flight patch.discovered_gear.
 * @returns {object} patch (mutated)
 */
export function mergeDiscoveredGear(character, items, patch = {}) {
  const prior = patch.discovered_gear || character?.discovered_gear || [];
  const set = new Set(Array.isArray(prior) ? prior.map(String) : []);
  const before = set.size;
  for (const it of items || []) {
    const key = gearCatalogKey(it);
    if (key) set.add(key);
  }
  if (set.size !== before || set.size !== (character?.discovered_gear || []).length) {
    patch.discovered_gear = [...set];
  }
  return patch;
}
