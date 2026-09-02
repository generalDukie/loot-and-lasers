/**
 * Phase 7 deterministic Dungeon/Wormhole enemy-archetype schedule.
 *
 * Global authored content. Not rolled per player, class, account, attempt,
 * process, or reconnect. Uses a versioned mix32 permutation of a 4/3/3 bag.
 */
import { createHash } from "node:crypto";
import {
  DUNGEON_COUNT,
  DUNGEON_ENCOUNTERS_PER_DUNGEON,
  DUNGEON_WORMHOLE_ARCHETYPE_BASE_COUNT,
  DUNGEON_WORMHOLE_ARCHETYPE_EXTRA_COUNT,
  MISSION_ENEMY_ARCHETYPES,
  PHASE7_ARCHETYPE_HASH_SHIFT_13,
  PHASE7_ARCHETYPE_HASH_SHIFT_16,
  PHASE7_ARCHETYPE_INDEX_STRIDE,
  PHASE7_ARCHETYPE_MIX_C1,
  PHASE7_ARCHETYPE_MIX_C2,
  PHASE7_ARCHETYPE_MIX_GOLDEN,
  PHASE7_ARCHETYPE_SCHEDULE_VERSION,
  PHASE7_ARCHETYPE_VERSION_SALT_HEX_WIDTH,
  PHASE7_ARCHETYPE_HEX_RADIX,
  PHASE7_ARCHETYPE_SEED_CONTENT_MULT,
  PHASE7_ARCHETYPE_SEED_GROUP_MULT,
  PHASE7_CONTENT_DUNGEON,
  PHASE7_CONTENT_WORMHOLE,
  PHASE7_DUNGEON_CONTENT_CODE,
  PHASE7_DUNGEON_EXTRA_ARCHETYPE_START_INDEX,
  PHASE7_WORMHOLE_CONTENT_CODE,
  PHASE7_WORMHOLE_EXTRA_ARCHETYPE_START_INDEX,
} from "./productionMath/constants.js";

const ARCHETYPE_COUNT = MISSION_ENEMY_ARCHETYPES.length;

function mix32(n) {
  let x = (Math.trunc(Number(n) || 0) + PHASE7_ARCHETYPE_MIX_GOLDEN) >>> 0;
  x = Math.imul(x ^ (x >>> PHASE7_ARCHETYPE_HASH_SHIFT_16), PHASE7_ARCHETYPE_MIX_C1) >>> 0;
  x = Math.imul(x ^ (x >>> PHASE7_ARCHETYPE_HASH_SHIFT_13), PHASE7_ARCHETYPE_MIX_C2) >>> 0;
  return (x ^ (x >>> PHASE7_ARCHETYPE_HASH_SHIFT_16)) >>> 0;
}

function versionSalt() {
  const hex = createHash("sha256")
    .update(PHASE7_ARCHETYPE_SCHEDULE_VERSION)
    .digest("hex")
    .slice(0, PHASE7_ARCHETYPE_VERSION_SALT_HEX_WIDTH);
  return Number.parseInt(hex, PHASE7_ARCHETYPE_HEX_RADIX) >>> 0;
}

function contentCode(contentType) {
  return contentType === PHASE7_CONTENT_WORMHOLE
    ? PHASE7_WORMHOLE_CONTENT_CODE
    : PHASE7_DUNGEON_CONTENT_CODE;
}

function extraStartIndex(contentType) {
  return contentType === PHASE7_CONTENT_WORMHOLE
    ? PHASE7_WORMHOLE_EXTRA_ARCHETYPE_START_INDEX
    : PHASE7_DUNGEON_EXTRA_ARCHETYPE_START_INDEX;
}

export function extraArchetypeIndex(contentType, groupIndex0) {
  const g = Math.max(0, Math.floor(Number(groupIndex0) || 0));
  return (extraStartIndex(contentType) + g) % ARCHETYPE_COUNT;
}

function bagForExtra(extraIndex) {
  const bag = [];
  for (let a = 0; a < ARCHETYPE_COUNT; a++) {
    const n = a === extraIndex
      ? DUNGEON_WORMHOLE_ARCHETYPE_EXTRA_COUNT
      : DUNGEON_WORMHOLE_ARCHETYPE_BASE_COUNT;
    for (let i = 0; i < n; i++) bag.push(a);
  }
  return bag;
}

function permuteBag(bag, seed) {
  const arr = bag.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = mix32(seed + i * PHASE7_ARCHETYPE_INDEX_STRIDE) % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function groupArchetypeIndices(contentType, groupIndex0) {
  const g = Math.max(0, Math.floor(Number(groupIndex0) || 0));
  const extra = extraArchetypeIndex(contentType, g);
  const seed = (
    versionSalt()
    + contentCode(contentType) * PHASE7_ARCHETYPE_SEED_CONTENT_MULT
    + g * PHASE7_ARCHETYPE_SEED_GROUP_MULT
  ) >>> 0;
  return permuteBag(bagForExtra(extra), seed);
}

export function stageArchetypeIndex(contentType, groupIndex0, encounterIndex0) {
  const e = Math.max(0, Math.floor(Number(encounterIndex0) || 0))
    % DUNGEON_ENCOUNTERS_PER_DUNGEON;
  return groupArchetypeIndices(contentType, groupIndex0)[e];
}

export function stageArchetypeName(contentType, groupIndex0, encounterIndex0) {
  return MISSION_ENEMY_ARCHETYPES[stageArchetypeIndex(contentType, groupIndex0, encounterIndex0)];
}

export function dungeonEncounterArchetype(dungeonIndex0, encounterIndex0) {
  return stageArchetypeName(PHASE7_CONTENT_DUNGEON, dungeonIndex0, encounterIndex0);
}

export function wormholeEncounterArchetype(absoluteIndex0) {
  const idx = Math.max(0, Math.floor(Number(absoluteIndex0) || 0));
  const bandIndex0 = Math.floor(idx / DUNGEON_ENCOUNTERS_PER_DUNGEON);
  const encounter = idx % DUNGEON_ENCOUNTERS_PER_DUNGEON;
  return stageArchetypeName(PHASE7_CONTENT_WORMHOLE, bandIndex0, encounter);
}

export function countArchetypes(indices) {
  const counts = { Might: 0, Reflex: 0, Tech: 0 };
  for (const i of indices) {
    counts[MISSION_ENEMY_ARCHETYPES[i]] += 1;
  }
  return counts;
}

export function dungeonScheduleTable() {
  return Array.from({ length: DUNGEON_COUNT }, (_, d) => (
    groupArchetypeIndices(PHASE7_CONTENT_DUNGEON, d).map((i) => MISSION_ENEMY_ARCHETYPES[i])
  ));
}

export function wormholeBandSchedule(bandIndex0) {
  return groupArchetypeIndices(PHASE7_CONTENT_WORMHOLE, bandIndex0)
    .map((i) => MISSION_ENEMY_ARCHETYPES[i]);
}

export function scheduleChecksum(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
