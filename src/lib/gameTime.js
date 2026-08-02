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
  if (hour === 24) hour = 0; // some engines use 24 for midnight
  return { year: get("year"), month: get("month"), day: get("day"), hour };
}

/**
 * Approximate UTC ms for an ET local wall time via binary search.
 * Display/countdown only — server getShopWindow is authoritative.
 */
function etLocalToUtcMs({ year, month, day, hour, minute = 0 }) {
  const targetKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  let lo = Date.UTC(year, month - 1, day, hour + 4, minute) - 6 * 3600 * 1000;
  let hi = Date.UTC(year, month - 1, day, hour + 4, minute) + 6 * 3600 * 1000;
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const p = etParts(mid);
    const key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}:00`;
    if (key < targetKey) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** 12-hour shop windows aligned to 2:00 AM / 2:00 PM America/New_York (mirrors server). */
export function getShopWindow(nowMs = estimateServerNowMs()) {
  const parts = etParts(nowMs);
  let startHour;
  let anchorMs = nowMs;
  if (parts.hour >= 14) {
    startHour = 14;
  } else if (parts.hour >= 2) {
    startHour = 2;
  } else {
    startHour = 14;
    anchorMs = nowMs - 12 * 3600 * 1000;
  }
  const anchor = etParts(anchorMs);
  const startsAt = etLocalToUtcMs({
    year: anchor.year,
    month: anchor.month,
    day: anchor.day,
    hour: startHour,
    minute: 0,
  });
  const endsAt = startsAt + 12 * 60 * 60 * 1000;
  const idx = Math.floor(startsAt / (12 * 60 * 60 * 1000));
  return {
    idx,
    startsAt,
    endsAt,
    secondsLeft: Math.max(0, Math.floor((endsAt - nowMs) / 1000)),
  };
}

/** Game-day key for Hot Deal (resets at 2:00 PM ET). */
export function getShopGameDayKey(nowMs = estimateServerNowMs()) {
  const parts = etParts(nowMs);
  let y = parts.year;
  let m = parts.month;
  let d = parts.day;
  if (parts.hour < 14) {
    const back = etParts(nowMs - 14 * 3600 * 1000);
    y = back.year;
    m = back.month;
    d = back.day;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Ms until next 2:00 PM ET Hot Deal / game-day reset. */
export function msUntilNextShopGameDay(fromMs = estimateServerNowMs()) {
  const parts = etParts(fromMs);
  let target;
  if (parts.hour < 14) {
    target = etLocalToUtcMs({
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 14,
      minute: 0,
    });
  } else {
    // Tomorrow 2 PM ET — walk forward until calendar day advances.
    let probe = fromMs + (24 - parts.hour) * 3600 * 1000;
    for (let i = 0; i < 48; i++) {
      const p = etParts(probe);
      if (p.year !== parts.year || p.month !== parts.month || p.day !== parts.day) {
        target = etLocalToUtcMs({
          year: p.year,
          month: p.month,
          day: p.day,
          hour: 14,
          minute: 0,
        });
        break;
      }
      probe += 3600 * 1000;
    }
  }
  return Math.max(0, (target || fromMs) - fromMs);
}
