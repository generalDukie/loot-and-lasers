/**
 * Client game-clock helpers.
 * Display / countdown only — never authoritative for claims.
 * Daily quotas use America/New_York (DST-aware), matching the server.
 *
 * Prefer /api/time/now for serverTimeUtc sync when available.
 */

export const DEFAULT_GAME_ZONE = "America/New_York";

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
  let hi = from + 26 * 60 * 60 * 1000;
  while (hi - lo > 250) {
    const mid = Math.floor((lo + hi) / 2);
    const day = new Date(mid).toLocaleDateString("en-CA", { timeZone: DEFAULT_GAME_ZONE });
    if (day === startDay) lo = mid;
    else hi = mid;
  }
  return Math.max(0, hi - from);
}

/** Compact countdown for quota chips — e.g. "5h 12m" or "42m". */
export function formatEtaShort(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

/** Stable daily period id matching server dailyPeriodInfo. */
export function dailyPeriodId(fromMs = estimateServerNowMs()) {
  return `daily:na:${todayET(fromMs)}`;
}
