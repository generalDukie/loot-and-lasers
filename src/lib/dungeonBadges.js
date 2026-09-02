/**
 * Phase 7 Dungeon collection badges — derived from independent track completion.
 * Completing all ten one-time enemies in a standard Dungeon awards that Dungeon's
 * one badge. Maximum ten. Wormhole/Frontier do not award Dungeon badges.
 */
import {
  DUNGEON_BADGE_ID_PREFIX,
  DUNGEON_BADGE_MAX,
  DUNGEON_COUNT,
  DUNGEON_ENCOUNTERS_PER_DUNGEON,
} from "./productionMath/index.js";

export { DUNGEON_BADGE_ID_PREFIX, DUNGEON_BADGE_MAX, DUNGEON_COUNT };

const DUNGEON_BADGE_DISPLAY_OFFSET = 1;

function trackComplete(clears, index) {
  return Math.max(0, Math.floor(Number(clears[index]) || 0)) >= DUNGEON_ENCOUNTERS_PER_DUNGEON;
}

export function dungeonBadgeIdForIndex(index) {
  const i = Math.floor(Number(index) || 0);
  if (i < 0 || i >= DUNGEON_COUNT) return "";
  return `${DUNGEON_BADGE_ID_PREFIX}${i + DUNGEON_BADGE_DISPLAY_OFFSET}`;
}

export function dungeonBadgeIdsFromClears(clears) {
  if (!Array.isArray(clears)) return [];
  const ids = [];
  const limit = Math.min(DUNGEON_COUNT, clears.length);
  for (let i = 0; i < limit; i += 1) {
    if (trackComplete(clears, i)) ids.push(dungeonBadgeIdForIndex(i));
  }
  return ids.slice(0, DUNGEON_BADGE_MAX);
}

export function dungeonBadgeCountFromClears(clears) {
  return dungeonBadgeIdsFromClears(clears).length;
}

export function dungeonBadgeCount(character) {
  return dungeonBadgeIds(character).length;
}

export function dungeonBadgeIds(character) {
  return presentDungeonBadgeIds(character, null);
}

function normalizeBadgeIds(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const value of raw) {
    const id = String(value || "").trim().toUpperCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(0, DUNGEON_BADGE_MAX);
}

function badgeIdsFromTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  const ids = [];
  const limit = Math.min(DUNGEON_COUNT, tracks.length);
  for (let i = 0; i < limit; i += 1) {
    const row = tracks[i];
    if (row && typeof row === "object" && row.complete) {
      ids.push(dungeonBadgeIdForIndex(i));
    }
  }
  return ids;
}

/**
 * Client/server presentation priority:
 * 1. Current serialized dungeon_badge_ids
 * 2. phase7_pve.dungeon_clears
 * 3. Current track serialization
 * 4. Empty
 * Never uses legacy sequential dungeon_planet.
 */
export function presentDungeonBadgeIds(character, dungeonView = null) {
  const view = dungeonView && typeof dungeonView === "object" && !Array.isArray(dungeonView)
    ? dungeonView
    : (character?.dungeon && typeof character.dungeon === "object" ? character.dungeon : null);
  const serialized = normalizeBadgeIds(view?.dungeon_badge_ids);
  if (serialized) return serialized;
  if (Array.isArray(character?.phase7_pve?.dungeon_clears)) {
    return dungeonBadgeIdsFromClears(character.phase7_pve.dungeon_clears);
  }
  const fromViewTracks = badgeIdsFromTracks(view?.tracks);
  if (fromViewTracks.length) return fromViewTracks;
  const nested = character?.dungeon;
  if (nested && typeof nested === "object") {
    return badgeIdsFromTracks(nested.tracks);
  }
  return [];
}
