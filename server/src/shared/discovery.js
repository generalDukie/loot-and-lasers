/**
 * Cosmic Vault discovery — gear keys + combat artifact/relic rolls (Restoration 20).
 * Historical discovery: append-once; selling items does not remove entries.
 * Client processDiscovery is presentation-only; Node persists ownership.
 */
import { ARTIFACTS, RELICS, SPECIES_COUNT } from "../../../src/lib/collectibles.js";
import { secureRandom } from "../rewards/rng.js";

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

/** Recovered rates from src/lib/discovery.js — do not invent new rates. */
export const RELIC_DISCOVERY_CHANCE = 0.02;
export const ARTIFACT_DISCOVERY_CHANCE = 0.03;

const DISCOVERY_WEIGHTS = { common: 50, uncommon: 30, rare: 15, epic: 4, legendary: 1 };

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

/** Append-once id into a Character collection array field. */
export function mergeCollectionIds(character, patch, field, ids) {
  const prior = patch[field] || character?.[field] || [];
  const set = new Set(
    Array.isArray(prior)
      ? prior.map((x) => {
          const n = Number(x);
          return Number.isFinite(n) ? n : x;
        })
      : [],
  );
  const before = set.size;
  for (const raw of ids || []) {
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    set.add(Number.isFinite(n) ? n : raw);
  }
  if (set.size !== before || set.size !== (character?.[field] || []).length) {
    patch[field] = [...set];
  }
  return patch;
}

export function mergeSpeciesDiscovery(character, patch, speciesId) {
  if (speciesId == null || speciesId === "") return patch;
  return mergeCollectionIds(character, patch, "discovered_species", [speciesId]);
}

function weightedPick(pool, rng) {
  if (!pool.length) return null;
  const total = pool.reduce((s, e) => s + (DISCOVERY_WEIGHTS[e.rarity] || 1), 0);
  let roll = rng() * total;
  for (const e of pool) {
    roll -= DISCOVERY_WEIGHTS[e.rarity] || 1;
    if (roll <= 0) return e;
  }
  return pool[pool.length - 1];
}

/**
 * On combat win: roll relic (2%) then artifact (3%) against remaining catalog.
 * Species/gear are handled by callers (known ids / granted items).
 * @returns {{ found: Array, patch: object }}
 */
export function rollCombatCollectibleDiscoveries(character, patch = {}, { win = false, rng = secureRandom } = {}) {
  const found = [];
  if (!win) return { found, patch };

  const relics = new Set(
    (patch.collected_relics || character?.collected_relics || []).map((x) => Number(x)).filter(Number.isFinite),
  );
  if (rng() < RELIC_DISCOVERY_CHANCE && relics.size < RELICS.length) {
    const remaining = RELICS.filter((r) => !relics.has(r.id));
    const r = weightedPick(remaining, rng);
    if (r) {
      relics.add(r.id);
      patch.collected_relics = [...relics];
      found.push({ kind: "relic", id: r.id, emoji: r.emoji, name: r.name });
    }
  }

  const arts = new Set(
    (patch.collected_artifacts || character?.collected_artifacts || []).map((x) => Number(x)).filter(Number.isFinite),
  );
  if (rng() < ARTIFACT_DISCOVERY_CHANCE && arts.size < ARTIFACTS.length) {
    const remaining = ARTIFACTS.filter((a) => !arts.has(a.id));
    const a = weightedPick(remaining, rng);
    if (a) {
      arts.add(a.id);
      patch.collected_artifacts = [...arts];
      found.push({ kind: "artifact", id: a.id, emoji: a.emoji, name: a.name });
    }
  }

  return { found, patch };
}

/**
 * Collection summary for Cosmic Vault / GetCollections.
 * Ownership = historical discovery (append-only Character arrays).
 */
export function serializeCollections(character, { gearTotal = 0 } = {}) {
  const species = [...new Set(character?.discovered_species || [])];
  const artifacts = [...new Set(character?.collected_artifacts || [])];
  const relics = [...new Set(character?.collected_relics || [])];
  const gear = [...new Set(character?.discovered_gear || [])];
  const badges = Math.max(0, (character?.dungeon_planet || 1) - 1);
  return {
    semantics: "historical_discovery",
    collections: [
      {
        id: "species",
        display_name: "Alien Species",
        discovered: species.length,
        total: SPECIES_COUNT,
        entry_ids: species,
        completed: species.length >= SPECIES_COUNT,
      },
      {
        id: "artifacts",
        display_name: "Artifacts",
        discovered: artifacts.length,
        total: ARTIFACTS.length,
        entry_ids: artifacts,
        completed: artifacts.length >= ARTIFACTS.length,
      },
      {
        id: "relics",
        display_name: "Relics",
        discovered: relics.length,
        total: RELICS.length,
        entry_ids: relics,
        completed: relics.length >= RELICS.length,
      },
      {
        id: "gear",
        display_name: "Gear Catalog",
        discovered: gear.length,
        total: gearTotal || gear.length,
        entry_ids: gear,
        completed: gearTotal > 0 ? gear.length >= gearTotal : false,
      },
      {
        id: "dungeon_badges",
        display_name: "Dungeon Badges",
        discovered: badges,
        total: null,
        entry_ids: [],
        completed: false,
        note: "Derived from dungeon_planet progress",
      },
    ],
  };
}
