/**
 * Space Mining — Node-authoritative AFK stardust sessions.
 *
 * Recovered product model (not location unlock trees):
 *   character picks duration 1–24h → reward snapshotted at start →
 *   timer advances on server clock → collect grants committed stardust once.
 *
 * Clients display countdown / preview only. Never trust client clocks or rewards.
 */
import { clock } from "./time/clock.js";
import { computeMiningReward } from "./economyFormulas.js";

export const MINING_NODE_ID = "stardust_afk";
export const MINING_NODE_NAME = "Stardust Node";
export const MINING_HOURS_MIN = 1;
export const MINING_HOURS_MAX = 24;

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
      ? endMs - hours * 3600 * 1000
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
    mining_start_time_unix: startMs > 0 ? Math.floor(startMs / 1000) : null,
    mining_end_time_unix: endMs > 0 ? Math.floor(endMs / 1000) : null,
    remaining_ms,
    remaining_seconds: Math.ceil(remaining_ms / 1000),
    mining_state,
    mining_reward: reward,
    reward_state: endIso ? "committed" : "none",
    collected: !endIso,
    server_now_ms: nowMs,
    server_now_iso: new Date(nowMs).toISOString(),
  };
}

export function buildMiningStartPatch(character, hoursRaw, nowMs = clock.nowMs()) {
  const hours = clampMiningHours(hoursRaw);
  const reward = computeMiningReward(character.level || 1, hours);
  const startIso = new Date(nowMs).toISOString();
  const endIso = new Date(nowMs + hours * 3600 * 1000).toISOString();
  return {
    mining_start_time: startIso,
    mining_end_time: endIso,
    mining_hours: hours,
    mining_reward: reward,
  };
}

export function buildMiningClearPatch() {
  return {
    mining_end_time: null,
    mining_reward: 0,
    mining_start_time: null,
    mining_hours: null,
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
