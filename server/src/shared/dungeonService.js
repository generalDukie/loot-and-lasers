/**
 * Phase 7 Dungeon / Wormhole authority — independent tracks, separate cooldowns,
 * versioned migration of disposable development PvE state.
 */
import { clock } from "./time/clock.js";
import {
  DUNGEON_BADGE_MAX,
  DUNGEON_COUNT,
  DUNGEON_ENCOUNTERS_PER_DUNGEON,
  DUNGEON_STANDARD_TOTAL_CLEARS_FOR_WORMHOLE,
  DUNGEON_WORMHOLE_COOLDOWN_MS,
  DUNGEON_WORMHOLE_SKIP_NOVA,
  PHASE7_CONTENT_DUNGEON,
  PHASE7_CONTENT_WORMHOLE,
  PHASE7_COOLDOWN_DUNGEON,
  PHASE7_COOLDOWN_WORMHOLE,
  PHASE7_PVE_RULES_VERSION,
  PHASE7_SKIP_LEDGER_TYPE,
  dungeonEnemyLevel,
  dungeonUnlockLevel,
  isDungeonWormholeBossEncounter,
  wormholeBandIndex,
  wormholeEnemyLevel,
  wormholeEncounterInBandIndex,
} from "./productionMath.js";
import { DUNGEON_PLANETS, getWormholePlanet } from "../../../src/lib/dungeonData.js";
import { dungeonBadgeCountFromClears, dungeonBadgeIdsFromClears } from "../../../src/lib/dungeonBadges.js";

export const DUNGEON_STORY_PLANETS = DUNGEON_COUNT;
export const DUNGEON_ENEMIES_PER_PLANET = DUNGEON_ENCOUNTERS_PER_DUNGEON;
export const DUNGEON_SKIP_COST = DUNGEON_WORMHOLE_SKIP_NOVA;
export const DUNGEON_BATTLE_COOLDOWN_MS = DUNGEON_WORMHOLE_COOLDOWN_MS;
export const PHASE7_DISPLAY_ID_ONE = 1;
export {
  PHASE7_CONTENT_DUNGEON,
  PHASE7_CONTENT_WORMHOLE,
  PHASE7_COOLDOWN_DUNGEON,
  PHASE7_COOLDOWN_WORMHOLE,
  PHASE7_PVE_RULES_VERSION,
  PHASE7_SKIP_LEDGER_TYPE,
};

export const DUNGEON_CLIENT_FORBIDDEN = Object.freeze([
  "won",
  "winner",
  "stardust",
  "experience",
  "rewards",
  "items",
  "dungeon_planet",
  "dungeon_enemy",
  "dungeon_deaths",
  "dungeon_clears",
  "dungeon_nodes_cleared",
  "dungeon_cooldown_at",
  "dungeon_cooldown_ms",
  "dungeon_cooldown_until",
  "dungeon_pending_combat",
  "dungeon_continue_credit",
  "wormhole_cooldown_until",
  "phase7_pve",
  "enemy",
  "battle",
  "events",
  "player",
  "rng_seed",
  "seed",
  "final_xp",
  "frontier_pct",
  "gear",
  "enemy_level",
  "is_boss",
  "archetype",
  "nova_cost",
]);

function err(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

export function detectSuspiciousDungeonFields(body = {}) {
  if (!body || typeof body !== "object") return [];
  return DUNGEON_CLIENT_FORBIDDEN.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
}

export function assertDungeonClientSafe(body = {}) {
  const bad = detectSuspiciousDungeonFields(body);
  if (bad.length) {
    throw err(400, `Client dungeon authority rejected: ${bad.join(", ")}`, "DUNGEON_CLIENT_TAMPER");
  }
}

export function emptyPhase7State() {
  return {
    version: PHASE7_PVE_RULES_VERSION,
    dungeon_clears: Array.from({ length: DUNGEON_COUNT }, () => 0),
    wormhole_next_index: 0,
    dungeon_cooldown_until: null,
    wormhole_cooldown_until: null,
    pending_settlement: null,
  };
}

export function needsPhase7Migration(character) {
  const state = character?.phase7_pve;
  return !state || state.version !== PHASE7_PVE_RULES_VERSION || !Array.isArray(state.dungeon_clears);
}

export function phase7MigrationPatch() {
  return {
    phase7_pve: emptyPhase7State(),
    dungeon_planet: PHASE7_DISPLAY_ID_ONE,
    dungeon_enemy: PHASE7_DISPLAY_ID_ONE,
    dungeon_cooldown_until: null,
    dungeon_cooldown_at: null,
    dungeon_cooldown_ms: null,
    dungeon_pending_combat: null,
    dungeon_continue_credit: false,
  };
}

export function readPhase7(character) {
  if (needsPhase7Migration(character)) return emptyPhase7State();
  const src = character.phase7_pve;
  const clears = Array.from({ length: DUNGEON_COUNT }, (_, i) => {
    const n = Math.max(0, Math.floor(Number(src.dungeon_clears?.[i]) || 0));
    return Math.min(DUNGEON_ENCOUNTERS_PER_DUNGEON, n);
  });
  return {
    version: PHASE7_PVE_RULES_VERSION,
    dungeon_clears: clears,
    wormhole_next_index: Math.max(0, Math.floor(Number(src.wormhole_next_index) || 0)),
    dungeon_cooldown_until: src.dungeon_cooldown_until || null,
    wormhole_cooldown_until: src.wormhole_cooldown_until || null,
    pending_settlement: src.pending_settlement && typeof src.pending_settlement === "object"
      ? src.pending_settlement
      : null,
  };
}

export function writePhase7Patch(base, updates) {
  return {
    ...base,
    version: PHASE7_PVE_RULES_VERSION,
    ...updates,
  };
}

export function standardClearTotal(state) {
  return (state.dungeon_clears || []).reduce((s, n) => s + n, 0);
}

export function dungeonBadgeCount(characterOrState) {
  if (Array.isArray(characterOrState?.dungeon_clears)) {
    return dungeonBadgeCountFromClears(characterOrState.dungeon_clears);
  }
  return dungeonBadgeCountFromClears(readPhase7(characterOrState).dungeon_clears);
}

export function displayedCooldownRemainingMs({
  remainingMsAtSync = 0,
  elapsedMs = 0,
} = {}) {
  const remaining = Math.max(0, Math.floor(Number(remainingMsAtSync) || 0));
  const elapsed = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  return Math.max(0, remaining - elapsed);
}

export function wormholeUnlocked(state) {
  return standardClearTotal(state) >= DUNGEON_STANDARD_TOTAL_CLEARS_FOR_WORMHOLE;
}

export function remainingMs(untilIso, nowMs) {
  if (!untilIso) return 0;
  const end = new Date(untilIso).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - nowMs);
}

export function dungeonCooldownRemainingMs(state, nowMs = clock.nowMs()) {
  return remainingMs(state.dungeon_cooldown_until, nowMs);
}

export function wormholeCooldownRemainingMs(state, nowMs = clock.nowMs()) {
  return remainingMs(state.wormhole_cooldown_until, nowMs);
}

export function cooldownUntilIso(nowMs, ms = DUNGEON_WORMHOLE_COOLDOWN_MS) {
  return new Date(nowMs + ms).toISOString();
}

export function parseCooldownSelector(body = {}) {
  const raw = String(body.cooldown || body.cooldown_kind || body.target || "").trim().toLowerCase();
  if (raw === PHASE7_COOLDOWN_DUNGEON || raw === PHASE7_COOLDOWN_WORMHOLE) return raw;
  return null;
}

export function parseDungeonSelection(body = {}) {
  if (body.dungeon_id === PHASE7_CONTENT_WORMHOLE || body.content === PHASE7_CONTENT_WORMHOLE) {
    return { content: PHASE7_CONTENT_WORMHOLE };
  }
  if (body.viewing_wormhole) {
    return { content: PHASE7_CONTENT_WORMHOLE };
  }
  const raw = body.dungeon_id ?? body.planet_id;
  if (raw == null || raw === "") return null;
  if (String(raw).toLowerCase() === PHASE7_CONTENT_WORMHOLE) {
    return { content: PHASE7_CONTENT_WORMHOLE };
  }
  const id = Math.floor(Number(raw) || 0);
  if (id >= PHASE7_DISPLAY_ID_ONE && id <= DUNGEON_COUNT) {
    return { content: PHASE7_CONTENT_DUNGEON, dungeonId: id };
  }
  if (id > DUNGEON_COUNT) {
    return { content: PHASE7_CONTENT_WORMHOLE };
  }
  return null;
}

export function deriveDungeonTarget(state, character, selection) {
  const level = Math.max(1, Math.floor(Number(character?.level) || 1));
  if (!selection) {
    throw err(400, "Select a Dungeon or the Wormhole", "DUNGEON_SELECTION_REQUIRED");
  }
  if (selection.content === PHASE7_CONTENT_WORMHOLE) {
    if (!wormholeUnlocked(state)) {
      throw err(403, "Wormhole unlocks after all 100 standard Dungeon enemies are cleared", "WORMHOLE_LOCKED");
    }
    const idx = state.wormhole_next_index;
    const encounterNumber = wormholeEncounterInBandIndex(idx) + PHASE7_DISPLAY_ID_ONE;
    return {
      content: PHASE7_CONTENT_WORMHOLE,
      dungeonId: null,
      encounterNumber,
      wormholeIndex: idx,
      isBoss: isDungeonWormholeBossEncounter(wormholeEncounterInBandIndex(idx)),
      enemyLevel: wormholeEnemyLevel(idx),
      band: wormholeBandIndex(idx),
    };
  }
  const dungeonId = selection.dungeonId;
  const dungeonIndex0 = dungeonId - PHASE7_DISPLAY_ID_ONE;
  const unlock = dungeonUnlockLevel(dungeonIndex0);
  if (level < unlock) {
    throw err(403, `Dungeon ${dungeonId} unlocks at level ${unlock}`, "DUNGEON_LOCKED");
  }
  const cleared = state.dungeon_clears[dungeonIndex0] || 0;
  if (cleared >= DUNGEON_ENCOUNTERS_PER_DUNGEON) {
    throw err(400, "Dungeon already complete", "DUNGEON_COMPLETE");
  }
  const encounterNumber = cleared + PHASE7_DISPLAY_ID_ONE;
  const encounterIndex0 = cleared;
  return {
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId,
    encounterNumber,
    wormholeIndex: null,
    isBoss: isDungeonWormholeBossEncounter(encounterIndex0),
    enemyLevel: dungeonEnemyLevel(dungeonIndex0, encounterIndex0),
    band: null,
  };
}

export function targetsMatch(a, b) {
  if (!a || !b) return false;
  if (a.content !== b.content) return false;
  if (a.content === PHASE7_CONTENT_WORMHOLE) {
    return Number(a.wormholeIndex) === Number(b.wormholeIndex);
  }
  return Number(a.dungeonId) === Number(b.dungeonId)
    && Number(a.encounterNumber) === Number(b.encounterNumber);
}

export function pendingTargetFromMeta(meta = {}) {
  if (!meta || typeof meta !== "object") return null;
  if (meta.content === PHASE7_CONTENT_WORMHOLE || meta.viewing_wormhole) {
    return {
      content: PHASE7_CONTENT_WORMHOLE,
      dungeonId: null,
      encounterNumber: meta.encounter_number ?? null,
      wormholeIndex: meta.wormhole_index,
    };
  }
  return {
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: meta.dungeon_id ?? meta.planet_id,
    encounterNumber: meta.encounter_number ?? meta.enemy_index,
    wormholeIndex: null,
  };
}

export function applyVictoryProgress(state, target) {
  const next = writePhase7Patch(state, {
    dungeon_clears: state.dungeon_clears.slice(),
  });
  if (target.content === PHASE7_CONTENT_WORMHOLE) {
    next.wormhole_next_index = Math.max(0, Math.floor(Number(target.wormholeIndex) || 0)) + 1;
  } else {
    const i = target.dungeonId - PHASE7_DISPLAY_ID_ONE;
    next.dungeon_clears[i] = Math.min(
      DUNGEON_ENCOUNTERS_PER_DUNGEON,
      (next.dungeon_clears[i] || 0) + 1,
    );
  }
  return next;
}

function trackView(state, character, dungeonIndex0, nowMs) {
  const dungeonId = dungeonIndex0 + PHASE7_DISPLAY_ID_ONE;
  const unlock = dungeonUnlockLevel(dungeonIndex0);
  const level = Math.max(1, Math.floor(Number(character?.level) || 1));
  const cleared = state.dungeon_clears[dungeonIndex0] || 0;
  const complete = cleared >= DUNGEON_ENCOUNTERS_PER_DUNGEON;
  const unlocked = level >= unlock;
  const nextEnemy = complete ? null : cleared + PHASE7_DISPLAY_ID_ONE;
  const planet = DUNGEON_PLANETS[dungeonIndex0];
  return {
    dungeon_id: dungeonId,
    dungeon_index: dungeonIndex0,
    name: planet?.name || `Dungeon ${dungeonId}`,
    icon: planet?.icon || "orbit",
    unlock_level: unlock,
    unlocked,
    complete,
    cleared_count: cleared,
    next_enemy: nextEnemy,
    is_boss_next: nextEnemy === DUNGEON_ENCOUNTERS_PER_DUNGEON,
    enemy_level: complete ? null : dungeonEnemyLevel(dungeonIndex0, cleared),
    cooldown_remaining_ms: dungeonCooldownRemainingMs(state, nowMs),
  };
}

function compatibilityCursor(state) {
  const incomplete = state.dungeon_clears.findIndex((n) => n < DUNGEON_ENCOUNTERS_PER_DUNGEON);
  if (incomplete >= 0) {
    return {
      dungeon_planet: incomplete + PHASE7_DISPLAY_ID_ONE,
      dungeon_enemy: (state.dungeon_clears[incomplete] || 0) + PHASE7_DISPLAY_ID_ONE,
    };
  }
  const idx = state.wormhole_next_index;
  return {
    dungeon_planet: DUNGEON_COUNT + wormholeBandIndex(idx),
    dungeon_enemy: wormholeEncounterInBandIndex(idx) + PHASE7_DISPLAY_ID_ONE,
  };
}

export function serializeDungeonState(character, nowMs = clock.nowMs(), _todayKey) {
  const state = readPhase7(character);
  const pending = character?.dungeon_pending_combat;
  const hasPending = !!(pending && typeof pending === "object" && pending.combat_id);
  const clears = standardClearTotal(state);
  const whOn = wormholeUnlocked(state);
  const idx = state.wormhole_next_index;
  const dCd = dungeonCooldownRemainingMs(state, nowMs);
  const wCd = wormholeCooldownRemainingMs(state, nowMs);
  const cursor = compatibilityCursor(state);
  const settlement = state.pending_settlement;
  return {
    rules_version: PHASE7_PVE_RULES_VERSION,
    tracks: Array.from({ length: DUNGEON_COUNT }, (_, i) => trackView(state, character, i, nowMs)),
    standard_clears: clears,
    dungeon_badges: dungeonBadgeCountFromClears(state.dungeon_clears),
    dungeon_badge_ids: dungeonBadgeIdsFromClears(state.dungeon_clears),
    dungeon_badge_max: DUNGEON_BADGE_MAX,
    standard_clear_total_required: DUNGEON_STANDARD_TOTAL_CLEARS_FOR_WORMHOLE,
    wormhole: {
      unlocked: whOn,
      locked_reason: whOn ? null : "Clear all 100 standard Dungeon enemies",
      band: whOn ? wormholeBandIndex(idx) : null,
      enemy: whOn ? wormholeEncounterInBandIndex(idx) + PHASE7_DISPLAY_ID_ONE : null,
      enemy_level: whOn ? wormholeEnemyLevel(idx) : null,
      is_boss: whOn ? isDungeonWormholeBossEncounter(wormholeEncounterInBandIndex(idx)) : false,
      next_index: idx,
      name: whOn ? getWormholePlanet(wormholeBandIndex(idx)).name : "The Wormhole",
      cooldown_remaining_ms: wCd,
    },
    dungeon_cooldown_remaining_ms: dCd,
    wormhole_cooldown_remaining_ms: wCd,
    dungeon_cooldown_until: state.dungeon_cooldown_until,
    wormhole_cooldown_until: state.wormhole_cooldown_until,
    dungeon_cooldown_active: dCd > 0,
    wormhole_cooldown_active: wCd > 0,
    skip_cost: DUNGEON_SKIP_COST,
    skip_cost_nova: DUNGEON_SKIP_COST,
    battle_cooldown_ms: DUNGEON_BATTLE_COOLDOWN_MS,
    pending_combat_id: hasPending ? pending.combat_id : null,
    pending_meta: hasPending ? pending.meta || null : null,
    pending_settlement: settlement
      ? {
          combat_id: settlement.combat_id || null,
          origin: settlement.origin || null,
          has_gear: !!settlement.gear,
          won: !!settlement.won,
        }
      : null,
    pending_settlement_full: settlement || null,
    dungeon_planet: cursor.dungeon_planet,
    dungeon_enemy: cursor.dungeon_enemy,
    dungeon_deaths: 0,
    dungeon_deaths_date: null,
    free_lives_left: null,
    dungeon_clears: clears,
    dungeon_nodes_cleared: character?.dungeon_nodes_cleared || 0,
    dungeon_continue_credit: false,
    cooldown_remaining_ms: dCd,
    cooldown_active: dCd > 0,
    dungeon_cooldown_at: null,
    dungeon_cooldown_ms: DUNGEON_BATTLE_COOLDOWN_MS,
    server_now_ms: nowMs,
    server_now_iso: new Date(nowMs).toISOString(),
  };
}

/** @deprecated Shared-timer helper — use dungeon/wormhole remaining independently. */
export function cooldownRemainingMs(character, nowMs = clock.nowMs()) {
  return dungeonCooldownRemainingMs(readPhase7(character), nowMs);
}

export function assertCooldownClear(character, nowMs = clock.nowMs()) {
  const rem = cooldownRemainingMs(character, nowMs);
  if (rem > 0) {
    throw err(400, "Dungeon on cooldown", "DUNGEON_COOLDOWN");
  }
}

export function assertSelectedCooldownClear(state, content, nowMs = clock.nowMs()) {
  if (content === PHASE7_CONTENT_WORMHOLE) {
    const rem = wormholeCooldownRemainingMs(state, nowMs);
    if (rem > 0) throw err(400, "Wormhole on cooldown", "WORMHOLE_COOLDOWN");
    return;
  }
  const rem = dungeonCooldownRemainingMs(state, nowMs);
  if (rem > 0) throw err(400, "Dungeon on cooldown", "DUNGEON_COOLDOWN");
}

export function assertCooldownActive(character, nowMs = clock.nowMs()) {
  if (cooldownRemainingMs(character, nowMs) <= 0) {
    throw err(400, "No active dungeon cooldown", "DUNGEON_NO_COOLDOWN");
  }
}

export function buildCooldownPatchForContent(state, content, nowMs = clock.nowMs()) {
  const until = cooldownUntilIso(nowMs);
  if (content === PHASE7_CONTENT_WORMHOLE) {
    return writePhase7Patch(state, { wormhole_cooldown_until: until });
  }
  return writePhase7Patch(state, { dungeon_cooldown_until: until });
}

export function clearSelectedCooldown(state, selector) {
  if (selector === PHASE7_COOLDOWN_WORMHOLE) {
    return writePhase7Patch(state, { wormhole_cooldown_until: null });
  }
  return writePhase7Patch(state, { dungeon_cooldown_until: null });
}

export function pendingCombatMatches(pending, target) {
  if (!pending?.combat_id) return false;
  const meta = pending.meta || {};
  return targetsMatch(pendingTargetFromMeta(meta), target);
}

/** @deprecated Sequential-cursor gate; Phase 7 derives the next enemy server-side. */
export function assertDungeonProgressAllowed(character, { planetId, enemyIndex, viewingWormhole }) {
  const state = readPhase7(character);
  const selection = viewingWormhole || Number(planetId) > DUNGEON_COUNT
    ? { content: PHASE7_CONTENT_WORMHOLE }
    : { content: PHASE7_CONTENT_DUNGEON, dungeonId: Number(planetId) };
  const target = deriveDungeonTarget(state, character, selection);
  if (selection.content === PHASE7_CONTENT_DUNGEON && Number(enemyIndex) && Number(enemyIndex) !== target.encounterNumber) {
    throw err(400, "Not your active frontier node", "DUNGEON_PROGRESS");
  }
  return {
    planetId: target.dungeonId || planetId,
    enemyIndex: target.encounterNumber,
    viewingWormhole: target.content === PHASE7_CONTENT_WORMHOLE,
    target,
  };
}

export function crawlPlanet(character) {
  return compatibilityCursor(readPhase7(character)).dungeon_planet;
}

export function crawlEnemy(character) {
  return compatibilityCursor(readPhase7(character)).dungeon_enemy;
}

export function deathsToday(_character, _todayKey) {
  return 0;
}

export function freeLivesLeft(_character, _todayKey) {
  return Number.POSITIVE_INFINITY;
}

export function needsContinueCredit(_character, _todayKey) {
  return false;
}

export function assertContinueCredit(_character, _todayKey) {}

export function consumeContinueCreditPatch(_character, _todayKey) {
  return {};
}

export function clearCooldownPatch() {
  return {
    dungeon_cooldown_at: null,
    dungeon_cooldown_ms: null,
    dungeon_cooldown_until: null,
  };
}

export function buildCooldownPatch(_won, nowMs = clock.nowMs()) {
  return {
    dungeon_cooldown_at: new Date(nowMs).toISOString(),
    dungeon_cooldown_ms: DUNGEON_BATTLE_COOLDOWN_MS,
    dungeon_cooldown_until: new Date(nowMs + DUNGEON_BATTLE_COOLDOWN_MS).toISOString(),
  };
}
