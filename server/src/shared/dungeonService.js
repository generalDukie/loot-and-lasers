/**
 * Galactic Frontier dungeon crawl — Node-authoritative gates & serialization.
 *
 * Combat simulation lives in combatService (Prompt 08). This module owns:
 * unlock / progress / cooldown / continue-credit / client tamper / status.
 */
import { clock } from "./time/clock.js";
import {
  DUNGEON_STORY_PLANETS,
  DUNGEON_ENEMIES_PER_PLANET,
  DUNGEON_SKIP_COST,
  DUNGEON_BATTLE_COOLDOWN_MS,
  isDungeonUnlockedByLevel,
  getDungeonUnlockLevel,
  dungeonCooldownMs,
} from "./economyFormulas.js";

export {
  DUNGEON_STORY_PLANETS,
  DUNGEON_ENEMIES_PER_PLANET,
  DUNGEON_SKIP_COST,
  DUNGEON_BATTLE_COOLDOWN_MS,
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
  "enemy",
  "battle",
  "events",
  "player",
  "rng_seed",
  "seed",
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

export function crawlPlanet(character) {
  return Math.max(1, Math.floor(Number(character?.dungeon_planet) || 1));
}

export function crawlEnemy(character) {
  return Math.min(
    DUNGEON_ENEMIES_PER_PLANET,
    Math.max(1, Math.floor(Number(character?.dungeon_enemy) || 1)),
  );
}

export function deathsToday(_character, _todayKey) {
  return 0;
}

export function freeLivesLeft(_character, _todayKey) {
  return Number.POSITIVE_INFINITY;
}

export function cooldownRemainingMs(character, nowMs = clock.nowMs()) {
  const untilIso = character?.dungeon_cooldown_until;
  if (untilIso) {
    const end = new Date(untilIso).getTime();
    if (Number.isFinite(end)) return Math.max(0, end - nowMs);
  }
  const atIso = character?.dungeon_cooldown_at;
  const ms = Number(character?.dungeon_cooldown_ms) || 0;
  if (atIso && ms > 0) {
    const start = new Date(atIso).getTime();
    if (Number.isFinite(start)) return Math.max(0, start + ms - nowMs);
  }
  return 0;
}

export function assertCooldownClear(character, nowMs = clock.nowMs()) {
  const rem = cooldownRemainingMs(character, nowMs);
  if (rem > 0) {
    throw err(400, "Dungeon on cooldown", "DUNGEON_COOLDOWN");
  }
}

export function assertCooldownActive(character, nowMs = clock.nowMs()) {
  if (cooldownRemainingMs(character, nowMs) <= 0) {
    throw err(400, "No active dungeon cooldown", "DUNGEON_NO_COOLDOWN");
  }
}

/** Shared 1h cooldown — outcome does not change duration. */
export function buildCooldownPatch(_won, nowMs = clock.nowMs()) {
  const cdMs = dungeonCooldownMs(_won);
  return {
    dungeon_cooldown_at: new Date(nowMs).toISOString(),
    dungeon_cooldown_ms: cdMs,
    dungeon_cooldown_until: new Date(nowMs + cdMs).toISOString(),
  };
}

export function clearCooldownPatch() {
  return {
    dungeon_cooldown_at: null,
    dungeon_cooldown_ms: null,
    dungeon_cooldown_until: null,
  };
}

/**
 * Story / wormhole encounter eligibility (mirrors client intent).
 */
export function assertDungeonProgressAllowed(character, { planetId, enemyIndex, viewingWormhole }) {
  const pid = Math.max(1, Math.floor(Number(planetId) || 1));
  const eidx = Math.min(
    DUNGEON_ENEMIES_PER_PLANET,
    Math.max(1, Math.floor(Number(enemyIndex) || 1)),
  );
  const crawlP = crawlPlanet(character);
  const crawlE = crawlEnemy(character);
  const wormhole = !!viewingWormhole || pid > DUNGEON_STORY_PLANETS;

  if (pid >= 1 && pid <= DUNGEON_STORY_PLANETS) {
    if (!isDungeonUnlockedByLevel(pid, character.level || 1)) {
      const need = getDungeonUnlockLevel(pid);
      throw err(403, `Dungeon ${pid} unlocks at level ${need}`, "DUNGEON_LOCKED");
    }
  }

  // Story push / wormhole crawl — must match active node.
  if (pid !== crawlP) {
    throw err(400, "Not your active frontier world", "DUNGEON_PROGRESS");
  }
  if (eidx !== crawlE) {
    throw err(400, "Not your active frontier node", "DUNGEON_PROGRESS");
  }
  return { planetId: pid, enemyIndex: eidx, viewingWormhole: wormhole };
}

/** @deprecated Death quotas removed — always false. */
export function needsContinueCredit(_character, _todayKey) {
  return false;
}

/** @deprecated No-op; death quotas removed. */
export function assertContinueCredit(_character, _todayKey) {}

/** @deprecated No-op; death quotas removed. */
export function consumeContinueCreditPatch(_character, _todayKey) {
  return {};
}

export function pendingCombatMatches(pending, { planetId, enemyIndex, combatId }) {
  if (!pending?.combat_id) return false;
  const meta = pending.meta || {};
  if (Number(meta.planet_id) !== Number(planetId)) return false;
  if (Number(meta.enemy_index) !== Number(enemyIndex)) return false;
  if (combatId) {
    if (String(pending.combat_id) !== String(combatId)) return false;
  }
  return true;
}

export function serializeDungeonState(character, nowMs = clock.nowMs(), _todayKey) {
  const pending = character?.dungeon_pending_combat;
  const hasPending = !!(pending && typeof pending === "object" && pending.combat_id);
  const rem = cooldownRemainingMs(character, nowMs);
  const crawlP = crawlPlanet(character);
  return {
    dungeon_planet: crawlP,
    dungeon_enemy: crawlEnemy(character),
    dungeon_deaths: 0,
    dungeon_deaths_date: null,
    free_lives_left: null,
    dungeon_clears: character?.dungeon_clears || 0,
    dungeon_nodes_cleared: character?.dungeon_nodes_cleared || 0,
    dungeon_continue_credit: false,
    cooldown_remaining_ms: rem,
    cooldown_active: rem > 0,
    dungeon_cooldown_until: character?.dungeon_cooldown_until || null,
    dungeon_cooldown_at: character?.dungeon_cooldown_at || null,
    dungeon_cooldown_ms: character?.dungeon_cooldown_ms ?? DUNGEON_BATTLE_COOLDOWN_MS,
    battle_cooldown_ms: DUNGEON_BATTLE_COOLDOWN_MS,
    skip_cost: DUNGEON_SKIP_COST,
    pending_combat_id: hasPending ? pending.combat_id : null,
    pending_meta: hasPending
      ? {
          planet_id: pending.meta?.planet_id ?? null,
          enemy_index: pending.meta?.enemy_index ?? null,
        }
      : null,
    server_now_ms: nowMs,
    server_now_iso: new Date(nowMs).toISOString(),
  };
}
