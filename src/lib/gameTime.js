/**
 * Client game-clock helpers.
 * Display / countdown only — never authoritative for claims.
 * Daily quotas use America/New_York (DST-aware), matching the server.
 * Market / Contraband countdowns use UTC 19:00 / 07:00 — no DST.
 *
 * Prefer /api/time/now for serverTimeUtc sync when available.
 */

import { contrabandPeriodId, contrabandWindowAt, marketWindowAt } from "./productionMath/market.js";

export const DEFAULT_GAME_ZONE = "America/New_York";

const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const ET_MIDNIGHT_SEARCH_WINDOW_HOURS = 26;
const ET_SEARCH_PRECISION_MS = 250;
const ET_UTC_ESTIMATE_OFFSET_HOURS = 4;
const ET_UTC_SEARCH_RADIUS_HOURS = 6;
const ET_UTC_SEARCH_ITERATIONS = 40;
const SHOP_WINDOW_MORNING_START_HOUR = 2;
const SHOP_WINDOW_AFTERNOON_START_HOUR = 14;
const SHOP_WINDOW_DURATION_HOURS = 12;
const SHOP_GAME_DAY_RESET_HOUR = SHOP_WINDOW_AFTERNOON_START_HOUR;
const NEXT_DAY_PROBE_LIMIT_HOURS = 48;
const DATE_PART_PAD_WIDTH = 2;

let _serverOffsetMs = 0;
let _lastSyncAt = 0;

/** Apply offset from /api/time/now so countdowns track server time. */
export function applyServerTimeSync({ serverTimeUtc, responseGeneratedAtUtc } = {}) {
  const serverMs = new Date(serverTimeUtc || responseGeneratedAtUtc).getTime();
  if (!Number.isFinite(serverMs)) return;
  const localMs = Date.now();
  _serverOffsetMs = serverMs - localMs;
  _lastSyncAt = localMs;
}

export function estimateServerNowMs() {
  return Date.now() + _serverOffsetMs;
}

export function getServerOffsetMs() {
  return _serverOffsetMs;
}

export function lastTimeSyncAgeMs() {
  return _lastSyncAt ? Date.now() - _lastSyncAt : Infinity;
}

export function todayET(fromMs = estimateServerNowMs()) {
  return new Date(fromMs).toLocaleDateString("en-CA", { timeZone: DEFAULT_GAME_ZONE });
}

/** Milliseconds until the next Eastern Time midnight (quota rollover). */
export function msUntilNextETMidnight(from = estimateServerNowMs()) {
  const startDay = new Date(from).toLocaleDateString("en-CA", { timeZone: DEFAULT_GAME_ZONE });
  let lo = from;
  let hi = from + ET_MIDNIGHT_SEARCH_WINDOW_HOURS * MILLISECONDS_PER_HOUR;
  while (hi - lo > ET_SEARCH_PRECISION_MS) {
    const mid = Math.floor((lo + hi) / 2);
    const day = new Date(mid).toLocaleDateString("en-CA", { timeZone: DEFAULT_GAME_ZONE });
    if (day === startDay) lo = mid;
    else hi = mid;
  }
  return Math.max(0, hi - from);
}

/** Compact countdown for quota chips — e.g. "5h 12m" or "42m". */
export function formatEtaShort(ms) {
  const s = Math.max(0, Math.floor(ms / MILLISECONDS_PER_SECOND));
  const h = Math.floor(s / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const m = Math.floor((s % (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) / SECONDS_PER_MINUTE);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

/** Stable daily period id matching server dailyPeriodInfo. */
export function dailyPeriodId(fromMs = estimateServerNowMs()) {
  return `daily:na:${todayET(fromMs)}`;
}

/** ET wall-clock parts for shop window math (hour 0–23). */
function etParts(fromMs) {
  const d = new Date(fromMs);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_GAME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === HOURS_PER_DAY) hour = 0; // some engines use 24 for midnight
  return { year: get("year"), month: get("month"), day: get("day"), hour };
}

/**
 * Approximate UTC ms for an ET local wall time via binary search.
 * Display/countdown only — server getShopWindow is authoritative.
 */
function etLocalToUtcMs({ year, month, day, hour, minute = 0 }) {
  const targetKey = `${year}-${String(month).padStart(DATE_PART_PAD_WIDTH, "0")}-${String(day).padStart(DATE_PART_PAD_WIDTH, "0")}T${String(hour).padStart(DATE_PART_PAD_WIDTH, "0")}:${String(minute).padStart(DATE_PART_PAD_WIDTH, "0")}`;
  const utcEstimate = Date.UTC(year, month - 1, day, hour + ET_UTC_ESTIMATE_OFFSET_HOURS, minute);
  let lo = utcEstimate - ET_UTC_SEARCH_RADIUS_HOURS * MILLISECONDS_PER_HOUR;
  let hi = utcEstimate + ET_UTC_SEARCH_RADIUS_HOURS * MILLISECONDS_PER_HOUR;
  for (let i = 0; i < ET_UTC_SEARCH_ITERATIONS; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const p = etParts(mid);
    const key = `${p.year}-${String(p.month).padStart(DATE_PART_PAD_WIDTH, "0")}-${String(p.day).padStart(DATE_PART_PAD_WIDTH, "0")}T${String(p.hour).padStart(DATE_PART_PAD_WIDTH, "0")}:00`;
    if (key < targetKey) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** 12-hour Market windows at 19:00 UTC and 07:00 UTC. Display only. */
export function getShopWindow(nowMs = estimateServerNowMs()) {
  return marketWindowAt(nowMs);
}

/** Contraband daily key — 19:00 UTC. */
export function getShopGameDayKey(nowMs = estimateServerNowMs()) {
  return contrabandPeriodId(nowMs);
}

/** Ms until next Contraband daily refresh (19:00 UTC). */
export function msUntilNextShopGameDay(fromMs = estimateServerNowMs()) {
  return contrabandWindowAt(fromMs).secondsLeft * MILLISECONDS_PER_SECOND;
}
