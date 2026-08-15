/**
 * Reset / claim period helpers.
 * Daily game quotas use America/New_York midnight (DST-aware).
 * Weekly periods use Monday 00:00 in the same zone (not ISO-UTC weeks).
 */

import { clock } from "./clock.js";
import { DEFAULT_GAME_ZONE, getZonedParts, zonedDateKey, assertTimeZone } from "./zones.js";
import { toIsoUtc } from "./instant.js";

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const LOCAL_TIME_CONVERGENCE_ATTEMPTS = 4;
const NONEXISTENT_TIME_SEARCH_HOURS = 4;
const MIDNIGHT_SEARCH_HOURS = 28;
const MIDNIGHT_SEARCH_PRECISION_MS = 250;
const ISO_WEEK_REFERENCE_WEEKDAY = 3;

/**
 * Convert a wall-clock local time in `timeZoneId` to a UTC Date.
 * Ambiguity policy: "earlier" | "later" (default earlier).
 * Skipped (nonexistent) policy: "next_valid" — advance to next representable instant.
 */
export function zonedLocalToUtc(
  { year, month, day, hour = 0, minute = 0, second = 0 },
  timeZoneId,
  { ambiguityPolicy = "earlier", skippedTimePolicy = "next_valid" } = {}
) {
  assertTimeZone(timeZoneId);

  // Initial guess: treat components as UTC then converge via zone format.
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < LOCAL_TIME_CONVERGENCE_ATTEMPTS; i++) {
    const parts = getZonedParts(new Date(guess), timeZoneId);
    const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const want = Date.UTC(year, month - 1, day, hour, minute, second);
    const delta = want - asIfUtc;
    if (delta === 0) break;
    guess += delta;
  }

  const verify = getZonedParts(new Date(guess), timeZoneId);
  const matches =
    verify.year === year &&
    verify.month === month &&
    verify.day === day &&
    verify.hour === hour &&
    verify.minute === minute;

  if (!matches) {
    // Nonexistent local time (spring forward) — step forward until wall matches or pass hour.
    if (skippedTimePolicy === "skip") {
      const err = new Error("Nonexistent local time");
      err.code = "NONEXISTENT_LOCAL_TIME";
      throw err;
    }
    let probe = guess;
    const searchWindowMs = NONEXISTENT_TIME_SEARCH_HOURS * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
    const searchStepMs = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
    for (let step = 0; step < searchWindowMs; step += searchStepMs) {
      probe = guess + step;
      const p = getZonedParts(new Date(probe), timeZoneId);
      if (p.year === year && p.month === month && p.day === day && p.hour >= hour) {
        return {
          utc: new Date(probe),
          dstAdjusted: true,
          adjustment: "skipped_to_next_valid",
          offsetMinutes: -new Date(probe).getTimezoneOffset(), // informational only
        };
      }
    }
  }

  // Ambiguity (fall back): probe ±1h for a second UTC that formats to same local.
  const oneHourMs = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
  const earlier = new Date(guess - oneHourMs);
  const later = new Date(guess + oneHourMs);
  const earlierParts = getZonedParts(earlier, timeZoneId);
  const laterParts = getZonedParts(later, timeZoneId);
  const sameLocal = (p) =>
    p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute;

  const candidates = [new Date(guess)];
  if (sameLocal(earlierParts) && earlier.getTime() !== guess) candidates.push(earlier);
  if (sameLocal(laterParts) && later.getTime() !== guess) candidates.push(later);
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const unique = [];
  for (const c of candidates) {
    if (!unique.some((u) => u.getTime() === c.getTime())) unique.push(c);
  }

  let chosen = unique[0];
  let ambiguous = unique.length > 1;
  if (ambiguous && ambiguityPolicy === "later") chosen = unique[unique.length - 1];

  return {
    utc: chosen,
    dstAdjusted: ambiguous || !matches,
    adjustment: ambiguous ? `ambiguous_${ambiguityPolicy}` : matches ? null : "skipped_to_next_valid",
    ambiguous,
  };
}

/** Next midnight (00:00:00) in `timeZoneId` strictly after `from`. */
export function nextZonedMidnight(from = clock.now(), timeZoneId = DEFAULT_GAME_ZONE) {
  const start = from instanceof Date ? from : new Date(from);
  const startKey = zonedDateKey(start, timeZoneId);
  // Binary search similar to legacy msUntilNextETMidnight
  let lo = start.getTime();
  let hi = lo + MIDNIGHT_SEARCH_HOURS * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
  while (hi - lo > MIDNIGHT_SEARCH_PRECISION_MS) {
    const mid = Math.floor((lo + hi) / 2);
    const day = zonedDateKey(new Date(mid), timeZoneId);
    if (day === startKey) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

export function msUntilNextZonedMidnight(from = clock.nowMs(), timeZoneId = DEFAULT_GAME_ZONE) {
  const fromMs = typeof from === "number" ? from : new Date(from).getTime();
  return Math.max(0, nextZonedMidnight(fromMs, timeZoneId).getTime() - fromMs);
}

/** @deprecated alias — daily quotas use ET. */
export function todayET(now = clock.now()) {
  return zonedDateKey(now, DEFAULT_GAME_ZONE);
}

export function msUntilNextETMidnight(from = clock.nowMs()) {
  return msUntilNextZonedMidnight(from, DEFAULT_GAME_ZONE);
}

/**
 * Stable daily period id.
 * @example daily:global:2026-07-29  |  daily:na:2026-07-29
 */
export function dailyPeriodId({
  region = "global",
  timeZoneId = DEFAULT_GAME_ZONE,
  now = clock.now(),
} = {}) {
  const key = zonedDateKey(now, timeZoneId);
  return `daily:${region}:${key}`;
}

export function dailyPeriodInfo({
  region = "na",
  timeZoneId = DEFAULT_GAME_ZONE,
  now = clock.now(),
} = {}) {
  const periodKey = zonedDateKey(now, timeZoneId);
  const next = nextZonedMidnight(now, timeZoneId);
  const periodId = `daily:${region}:${periodKey}`;
  return {
    periodId,
    periodKey,
    timeZoneId,
    region,
    nextResetAtUtc: toIsoUtc(next),
    remainingMs: Math.max(0, next.getTime() - (now instanceof Date ? now.getTime() : Number(now))),
  };
}

/**
 * ET (or named zone) week key: Monday-start calendar week.
 * Format: YYYY-Www where week 1 contains the year's first Monday... actually
 * we label by the Monday date of the week for stability: weekly:{zone}:{mondayKey}
 * and also provide iso-like YYYY-Www derived from that Monday.
 */
export function weekMondayDateKey(now = clock.now(), timeZoneId = DEFAULT_GAME_ZONE) {
  const p = getZonedParts(now, timeZoneId);
  const dow = WEEKDAY_INDEX[p.weekday] ?? 0; // 0=Sun
  // Days since Monday
  const sinceMon = (dow + 6) % 7;
  // Walk back in UTC guesses
  let t = zonedLocalToUtc(
    { year: p.year, month: p.month, day: p.day, hour: 12, minute: 0, second: 0 },
    timeZoneId
  ).utc.getTime();
  const oneDayMs = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
  t -= sinceMon * oneDayMs;
  return zonedDateKey(new Date(t), timeZoneId);
}

export function weeklyPeriodId({
  region = "na",
  timeZoneId = DEFAULT_GAME_ZONE,
  now = clock.now(),
} = {}) {
  const monday = weekMondayDateKey(now, timeZoneId);
  return `weekly:${region}:${monday}`;
}

/** ISO-like week label from Monday date key (for display / soft compat). */
export function getWeekKey(now = clock.now(), timeZoneId = DEFAULT_GAME_ZONE) {
  // Prefer ET Monday week for game systems (was previously pure UTC ISO — unified here).
  const mondayKey = weekMondayDateKey(now, timeZoneId);
  const [y, m, d] = mondayKey.split("-").map(Number);
  // ISO week number of that Monday
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + ISO_WEEK_REFERENCE_WEEKDAY);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date - firstThursday) /
          (HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND) -
        ISO_WEEK_REFERENCE_WEEKDAY +
        ((firstThursday.getUTCDay() + 6) % DAYS_PER_WEEK)) /
        DAYS_PER_WEEK
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Next Monday 00:00 in zone (end of current weekly period). */
export function weekEndUtc(now = clock.now(), timeZoneId = DEFAULT_GAME_ZONE) {
  const mondayKey = weekMondayDateKey(now, timeZoneId);
  const [y, m, d] = mondayKey.split("-").map(Number);
  // Calendar +7 days (not fixed 7*86400000) so DST transitions stay correct.
  const next = new Date(Date.UTC(y, m - 1, d + DAYS_PER_WEEK));
  return zonedLocalToUtc(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZoneId
  ).utc;
}

export function formatEtaShort(ms) {
  const s = Math.max(0, Math.floor(ms / MILLISECONDS_PER_SECOND));
  const secondsPerHour = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
  const h = Math.floor(s / secondsPerHour);
  const m = Math.floor((s % secondsPerHour) / SECONDS_PER_MINUTE);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}
