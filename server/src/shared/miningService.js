/**
 * Space Mining — Node-authoritative AFK stardust sessions.
 *
 * Recovered product model (not location unlock trees):
 *   character picks duration 1–12h → reward snapshotted at start →
 *   timer advances on server clock → collect grants committed stardust once.
 *
 * Clients display countdown / preview only. Never trust client clocks or rewards.
 */
import { clock } from "./time/clock.js";
import { computeMiningReward } from "./economyFormulas.js";
import {
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_SECOND,
  MINING_RULES_VERSION,
  MINING_SESSION_HOURS_MAX,
  MINING_SESSION_HOURS_MIN,
} from "./productionMath.js";

export const MINING_NODE_ID = "stardust_afk";
export const MINING_NODE_NAME = "Stardust Node";
export const MINING_HOURS_MIN = MINING_SESSION_HOURS_MIN;
export const MINING_HOURS_MAX = MINING_SESSION_HOURS_MAX;

export const MiningStates = Object.freeze({
  IDLE: "idle",
  ACTIVE: "active",
  READY: "ready",
});

/** Client fields that must never drive mining outcomes. */
export const MINING_CLIENT_FORBIDDEN = Object.freeze([
  "mining_reward",
  "mining_end_time",
  "mining_start_time",
  "mining_hours",
  "mining_snapshot_level",
  "mining_rules_version",
  "mining_end_time_unix",
  "remaining_ms",
  "remaining_seconds",
  "stardust",
  "total_stardust_earned",
  "reward",
  "stardust_gained",
  "completion_time",
  "level",
]);

export function clampMiningHours(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return MINING_HOURS_MIN;
  return Math.min(MINING_HOURS_MAX, Math.max(MINING_HOURS_MIN, n));
}

export function detectSuspiciousMiningFields(body = {}) {
  if (!body || typeof body !== "object") return [];
  return MINING_CLIENT_FORBIDDEN.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
}

export function assertMiningClientSafe(body = {}) {
  const bad = detectSuspiciousMiningFields(body);
  if (bad.length) {
    const e = new Error(`Client mining authority rejected: ${bad.join(", ")}`);
    e.status = 400;
    e.code = "MINING_CLIENT_TAMPER";
    throw e;
  }
}

export function miningSessionId(character) {
  if (!character?.mining_end_time) return null;
  const start = character.mining_start_time || character.mining_end_time;
  return `${character.id}:${start}`;
}

export function serializeMiningState(character, nowMs = clock.nowMs()) {
  const endIso = character?.mining_end_time || null;
  const startIso = character?.mining_start_time || null;
  const hours = character?.mining_hours != null ? Number(character.mining_hours) : null;
  const reward = Math.max(0, Math.floor(Number(character?.mining_reward) || 0));
  const endMs = endIso ? new Date(endIso).getTime() : 0;
  const startMs = startIso
    ? new Date(startIso).getTime()
    : hours && endMs
      ? endMs - hours * MILLISECONDS_PER_HOUR
      : 0;

  let mining_state = MiningStates.IDLE;
  let remaining_ms = 0;
  if (endIso && Number.isFinite(endMs)) {
    remaining_ms = Math.max(0, endMs - nowMs);
    mining_state = remaining_ms > 0 ? MiningStates.ACTIVE : MiningStates.READY;
  }

  return {
    mining_session_id: miningSessionId(character),
    node_id: endIso ? MINING_NODE_ID : null,
    node_name: endIso ? MINING_NODE_NAME : null,
    hours: hours != null && Number.isFinite(hours) ? hours : null,
    mining_start_time: startIso,
    mining_end_time: endIso,
    mining_start_time_unix: startMs > 0 ? Math.floor(startMs / MILLISECONDS_PER_SECOND) : null,
    mining_end_time_unix: endMs > 0 ? Math.floor(endMs / MILLISECONDS_PER_SECOND) : null,
    remaining_ms,
    remaining_seconds: Math.ceil(remaining_ms / MILLISECONDS_PER_SECOND),
    mining_state,
    mining_reward: reward,
    mining_snapshot_level: character?.mining_snapshot_level ?? null,
    mining_rules_version: character?.mining_rules_version ?? null,
    reward_state: endIso ? "committed" : "none",
    collected: !endIso,
    server_now_ms: nowMs,
    server_now_iso: new Date(nowMs).toISOString(),
  };
}

export function buildMiningStartPatch(character, hoursRaw, nowMs = clock.nowMs()) {
  const hours = clampMiningHours(hoursRaw);
  const snapshotLevel = Math.max(1, Math.floor(Number(character.level) || 1));
  const reward = computeMiningReward(snapshotLevel, hours);
  const startIso = new Date(nowMs).toISOString();
  const endIso = new Date(nowMs + hours * MILLISECONDS_PER_HOUR).toISOString();
  return {
    mining_start_time: startIso,
    mining_end_time: endIso,
    mining_hours: hours,
    mining_reward: reward,
    mining_snapshot_level: snapshotLevel,
    mining_rules_version: MINING_RULES_VERSION,
  };
}

export function buildMiningClearPatch() {
  return {
    mining_end_time: null,
    mining_reward: 0,
    mining_start_time: null,
    mining_hours: null,
    mining_snapshot_level: null,
    mining_rules_version: null,
  };
}

export function assertMiningFinished(character, nowMs = clock.nowMs()) {
  if (!character?.mining_end_time) {
    const e = new Error("Not mining");
    e.status = 400;
    e.code = "MINING_NOT_ACTIVE";
    throw e;
  }
  const endMs = new Date(character.mining_end_time).getTime();
  if (endMs > nowMs) {
    const e = new Error("Mining not finished");
    e.status = 400;
    e.code = "MINING_NOT_READY";
    throw e;
  }
}
