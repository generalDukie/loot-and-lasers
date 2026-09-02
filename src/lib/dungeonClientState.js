/**
 * Client Dungeon view cache — not server character data.
 * Survives concurrent character GET vs SyncDungeonState ordering.
 */
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
