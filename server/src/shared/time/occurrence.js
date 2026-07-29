/**
 * Next-occurrence calculator for wall-clock recurring schedules.
 * Supports: daily, weekly (by weekday), monthly (by day-of-month).
 */

import { assertTimeZone, getZonedParts } from "./zones.js";
import { zonedLocalToUtc } from "./periods.js";
import { toIsoUtc } from "./instant.js";
import { TimeError, TimeErrors } from "./errors.js";

const WEEKDAY_TO_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const NUM_TO_WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseLocalTime(localTime) {
  const m = String(localTime || "00:00").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new TimeError(TimeErrors.INVALID_RECURRENCE, `Bad localTime: ${localTime}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new TimeError(TimeErrors.INVALID_RECURRENCE, `Bad localTime: ${localTime}`);
  }
  return { hour, minute, second };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addCalendarDays(y, m, d, delta) {
  const utc = new Date(Date.UTC(y, m - 1, d + delta));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

/**
 * @param {object} schedule
 * @param {string} schedule.recurrence  "daily" | "weekly" | "monthly"
 * @param {string} schedule.localTime   "HH:MM" or "HH:MM:SS"
 * @param {string} schedule.timeZoneId
 * @param {number[]} [schedule.weekdays]  0=Sun..6=Sat for weekly
 * @param {number} [schedule.dayOfMonth]  1-31 for monthly; months lacking day use last day
 * @param {string} [schedule.ambiguityPolicy] earlier|later
 * @param {string} [schedule.skippedTimePolicy] next_valid|skip
 * @param {Date|number|string} from
 * @param {number} [count]
 */
export function computeNextOccurrences(schedule, from, count = 1) {
  assertTimeZone(schedule.timeZoneId);
  const { hour, minute, second } = parseLocalTime(schedule.localTime);
  const recurrence = schedule.recurrence || "daily";
  const ambiguityPolicy = schedule.ambiguityPolicy || "earlier";
  const skippedTimePolicy = schedule.skippedTimePolicy || "next_valid";
  const fromDate = from instanceof Date ? from : new Date(from);
  const out = [];
  let cursor = fromDate;

  for (let n = 0; n < count * 400 && out.length < count; n++) {
    const parts = getZonedParts(cursor, schedule.timeZoneId);
    let candidateDay = { year: parts.year, month: parts.month, day: parts.day };

    if (recurrence === "daily") {
      // If today's local time already passed, move to tomorrow
      const todayTry = zonedLocalToUtc(
        { ...candidateDay, hour, minute, second },
        schedule.timeZoneId,
        { ambiguityPolicy, skippedTimePolicy }
      );
      if (todayTry.utc.getTime() > cursor.getTime()) {
        out.push(buildOccurrence(schedule, todayTry, { ...candidateDay, hour, minute, second }));
        cursor = new Date(todayTry.utc.getTime() + 1000);
        continue;
      }
      candidateDay = addCalendarDays(candidateDay.year, candidateDay.month, candidateDay.day, 1);
    } else if (recurrence === "weekly") {
      const wanted = Array.isArray(schedule.weekdays) && schedule.weekdays.length
        ? schedule.weekdays.map(Number)
        : [1]; // default Monday
      let found = null;
      for (let i = 0; i < 8; i++) {
        const day = addCalendarDays(candidateDay.year, candidateDay.month, candidateDay.day, i);
        const noon = zonedLocalToUtc({ ...day, hour: 12, minute: 0, second: 0 }, schedule.timeZoneId).utc;
        const wd = WEEKDAY_TO_NUM[getZonedParts(noon, schedule.timeZoneId).weekday];
        if (!wanted.includes(wd)) continue;
        const tryAt = zonedLocalToUtc(
          { ...day, hour, minute, second },
          schedule.timeZoneId,
          { ambiguityPolicy, skippedTimePolicy }
        );
        if (tryAt.utc.getTime() > cursor.getTime()) {
          found = { day, tryAt };
          break;
        }
      }
      if (!found) {
        cursor = new Date(cursor.getTime() + 86400000);
        continue;
      }
      out.push(buildOccurrence(schedule, found.tryAt, { ...found.day, hour, minute, second }));
      cursor = new Date(found.tryAt.utc.getTime() + 1000);
      continue;
    } else if (recurrence === "monthly") {
      let dom = Number(schedule.dayOfMonth || 1);
      let y = parts.year;
      let m = parts.month;
      for (let guard = 0; guard < 24; guard++) {
        const dim = daysInMonth(y, m);
        const day = Math.min(dom, dim); // last-day policy when month lacks day
        const tryAt = zonedLocalToUtc(
          { year: y, month: m, day, hour, minute, second },
          schedule.timeZoneId,
          { ambiguityPolicy, skippedTimePolicy }
        );
        if (tryAt.utc.getTime() > cursor.getTime()) {
          out.push(buildOccurrence(schedule, tryAt, { year: y, month: m, day, hour, minute, second }));
          cursor = new Date(tryAt.utc.getTime() + 1000);
          break;
        }
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
      continue;
    } else {
      throw new TimeError(TimeErrors.INVALID_RECURRENCE, `Unsupported recurrence: ${recurrence}`);
    }

    const tryAt = zonedLocalToUtc(
      { ...candidateDay, hour, minute, second },
      schedule.timeZoneId,
      { ambiguityPolicy, skippedTimePolicy }
    );
    if (tryAt.utc.getTime() > cursor.getTime()) {
      out.push(buildOccurrence(schedule, tryAt, { ...candidateDay, hour, minute, second }));
      cursor = new Date(tryAt.utc.getTime() + 1000);
    } else {
      cursor = new Date(cursor.getTime() + 3600000);
    }
  }

  return out;
}

function buildOccurrence(schedule, resolved, local) {
  const scheduledAtUtc = toIsoUtc(resolved.utc);
  const occurrenceId = `schedule:${schedule.id || schedule.key || "anon"}:${scheduledAtUtc}`;
  return {
    occurrenceId,
    scheduledAtUtc,
    localDate: `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`,
    localTime: `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}:${String(local.second).padStart(2, "0")}`,
    timeZoneId: schedule.timeZoneId,
    dstAdjusted: !!resolved.dstAdjusted,
    adjustment: resolved.adjustment,
    ambiguous: !!resolved.ambiguous,
  };
}

export function computeNextOccurrence(schedule, from) {
  return computeNextOccurrences(schedule, from, 1)[0] || null;
}

export function stableOccurrenceId(scheduleId, scheduledAtUtc) {
  return `schedule:${scheduleId}:${scheduledAtUtc}`;
}

export { NUM_TO_WEEKDAY, WEEKDAY_TO_NUM };
