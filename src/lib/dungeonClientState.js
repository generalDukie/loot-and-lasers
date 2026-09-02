/**
 * Client Dungeon view cache — not server character data.
 * Survives concurrent character GET vs SyncDungeonState ordering.
 * Also hosts Frontier map-selection helpers mirrored in Godot DungeonRules.
 */
import {
  DUNGEON_COUNT,
  PHASE7_CONTENT_WORMHOLE,
} from "./productionMath/constants.js";

const DUNGEON_DISPLAY_ID_ONE = 1;
const NEXT_DUNGEON_ID_STEP = 1;

export function createDungeonViewCache() {
  return {
    characterId: "",
    view: null,
  };
}

function liveId(character) {
  return String(character?.id || "").trim();
}

export function applyDungeonSync(cache, characterId, view) {
  const id = String(characterId || "").trim();
  if (!id || !view || typeof view !== "object") {
    return { ...cache };
  }
  return {
    characterId: id,
    view: structuredClone(view),
  };
}

export function applyCharacterRefresh(cache, character) {
  const id = liveId(character);
  if (!id) return createDungeonViewCache();
  if (cache.characterId && cache.characterId !== id) {
    return { characterId: id, view: null };
  }
  return {
    characterId: id,
    view: cache.view,
  };
}

export function dungeonViewBlob(cache, character = null) {
  const id = liveId(character) || cache.characterId;
  if (cache.view && cache.characterId && cache.characterId === id) {
    return cache.view;
  }
  const nested = character?.dungeon;
  if (nested && typeof nested === "object") return nested;
  return null;
}

export function clearDungeonViewCache() {
  return createDungeonViewCache();
}

export function wormholePlanetId(band) {
  const n = Math.max(
    DUNGEON_DISPLAY_ID_ONE,
    Math.floor(Number(band) || DUNGEON_DISPLAY_ID_ONE),
  );
  return DUNGEON_COUNT + n;
}

function foughtDungeonId(args) {
  const fromEnemy = Math.floor(Number(args?.dungeon_id));
  if (
    Number.isFinite(fromEnemy)
    && fromEnemy >= DUNGEON_DISPLAY_ID_ONE
    && fromEnemy <= DUNGEON_COUNT
  ) {
    return fromEnemy;
  }
  const selected = Math.floor(Number(args?.selected_planet_id) || DUNGEON_DISPLAY_ID_ONE);
  if (selected >= DUNGEON_DISPLAY_ID_ONE && selected <= DUNGEON_COUNT) {
    return selected;
  }
  return DUNGEON_DISPLAY_ID_ONE;
}

/** Map selection after a Frontier fight. Does not use sequential dungeon_planet. */
export function frontierSelectionAfterCombat(args = {}) {
  const viewingWormhole = !!args.viewing_wormhole;
  const content = String(args.content || "").trim();
  const wormholeBand = Math.max(
    DUNGEON_DISPLAY_ID_ONE,
    Math.floor(Number(args.wormhole_band) || DUNGEON_DISPLAY_ID_ONE),
  );
  if (viewingWormhole || content === PHASE7_CONTENT_WORMHOLE) {
    return {
      planet_id: wormholePlanetId(wormholeBand),
      viewing_wormhole: true,
    };
  }
  const fought = foughtDungeonId(args);
  const won = !!args.won;
  const isBoss = !!args.is_boss;
  const trackComplete = !!args.track_complete;
  if (!won || (!isBoss && !trackComplete)) {
    return { planet_id: fought, viewing_wormhole: false };
  }
  const nextPlanet = fought + NEXT_DUNGEON_ID_STEP;
  if (nextPlanet > DUNGEON_COUNT) {
    if (args.wormhole_unlocked) {
      return {
        planet_id: wormholePlanetId(wormholeBand),
        viewing_wormhole: true,
      };
    }
    return { planet_id: DUNGEON_COUNT, viewing_wormhole: false };
  }
  return { planet_id: nextPlanet, viewing_wormhole: false };
}
