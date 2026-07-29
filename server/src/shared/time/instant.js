/**
 * Absolute-instant helpers.
 * Store and compare as UTC ISO-8601 with Z / explicit offset.
 */

import { TimeError, TimeErrors } from "./errors.js";
import { clock } from "./clock.js";

const ABSOLUTE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/** Parse an absolute timestamp; requires Z or numeric offset. */
export function parseInstant(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new TimeError(TimeErrors.INVALID_TIMESTAMP, "Invalid Date");
    }
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new TimeError(TimeErrors.INVALID_TIMESTAMP, "Invalid epoch ms");
    }
    return new Date(input);
  }
  if (typeof input !== "string" || !input.trim()) {
    throw new TimeError(TimeErrors.INVALID_TIMESTAMP, "Timestamp required");
  }
  const s = input.trim();
  // Reject naive local strings like "2026-07-29 14:00" or "2026-07-29T14:00:00"
  // (Must not treat YYYY-MM-DD hyphens as timezone offsets.)
  const hasExplicitOffset = /([Zz]|[+-]\d{2}:?\d{2})$/.test(s);
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(s) && !hasExplicitOffset) {
    throw new TimeError(
      TimeErrors.TIMESTAMP_OFFSET_REQUIRED,
      "Absolute timestamps require Z or an explicit offset"
    );
  }
  if (!ABSOLUTE_RE.test(s) && !hasExplicitOffset) {
    throw new TimeError(
      TimeErrors.TIMESTAMP_OFFSET_REQUIRED,
      "Absolute timestamps require Z or an explicit offset"
    );
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new TimeError(TimeErrors.INVALID_TIMESTAMP, `Cannot parse: ${s}`);
  }
  return d;
}

export function toIsoUtc(instant) {
  const d = instant instanceof Date ? instant : parseInstant(instant);
  return d.toISOString();
}

export function nowIso(c = clock) {
  return c.nowIso();
}

export function nowMs(c = clock) {
  return c.nowMs();
}

/** Nearest-integer rounding for final damage/HP-style values (also used for durations). */
export function roundNearest(n) {
  return Math.round(Number(n) || 0);
}

export function addMs(instant, ms) {
  const t = (instant instanceof Date ? instant.getTime() : parseInstant(instant).getTime()) + ms;
  return new Date(t);
}

export function durationMs({ hours = 0, minutes = 0, seconds = 0, days = 0 } = {}) {
  return ((((days * 24 + hours) * 60 + minutes) * 60) + seconds) * 1000;
}

export function isAfterOrEqual(a, b) {
  return parseInstant(a).getTime() >= parseInstant(b).getTime();
}

export function isBefore(a, b) {
  return parseInstant(a).getTime() < parseInstant(b).getTime();
}

/** Remaining seconds (floor), never negative. */
export function remainingSeconds(endsAt, now = clock.now()) {
  const ms = parseInstant(endsAt).getTime() - (now instanceof Date ? now.getTime() : Number(now));
  return Math.max(0, Math.floor(ms / 1000));
}
