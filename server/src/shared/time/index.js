/**
 * Shared authoritative time module for Loot & Lasers.
 *
 * Rules:
 * - Absolute moments → UTC ISO strings (Z / offset required on write APIs)
 * - Wall-clock schedules → IANA zone + local time + recurrence
 * - Daily quotas → America/New_York midnight (DST-aware)
 * - Weekly periods → Monday 00:00 in America/New_York (unified)
 * - Application clock (clock.now*) is the primary authority
 */

export { clock, SystemClock, FakeClock, resetClockState, installFakeClock } from "./clock.js";
export { TimeErrors, TimeError } from "./errors.js";
export {
  DEFAULT_GAME_ZONE,
  KNOWN_ZONES,
  isValidTimeZone,
  assertTimeZone,
  getZonedParts,
  zonedDateKey,
  zonedShortName,
} from "./zones.js";
export {
  parseInstant,
  toIsoUtc,
  nowIso,
  nowMs,
  roundNearest,
  addMs,
  durationMs,
  isAfterOrEqual,
  isBefore,
  remainingSeconds,
} from "./instant.js";
export {
  zonedLocalToUtc,
  nextZonedMidnight,
  msUntilNextZonedMidnight,
  todayET,
  msUntilNextETMidnight,
  dailyPeriodId,
  dailyPeriodInfo,
  weekMondayDateKey,
  weeklyPeriodId,
  getWeekKey,
  weekEndUtc,
  formatEtaShort,
} from "./periods.js";
export {
  computeNextOccurrence,
  computeNextOccurrences,
  stableOccurrenceId,
} from "./occurrence.js";
export {
  evaluateEventWindow,
  assertEventActive,
  assertClaimWindowOpen,
  describeEventWindow,
  isMaintenanceActive,
} from "./eventWindows.js";
