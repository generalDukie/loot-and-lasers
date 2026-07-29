/**
 * Event / maintenance window evaluation from authoritative UTC.
 * Workers may update status fields; runtime always re-derives from clock.
 */

import { clock } from "./clock.js";
import { parseInstant, toIsoUtc, remainingSeconds } from "./instant.js";
import { TimeErrors, TimeError } from "./errors.js";

/**
 * @typedef {object} EventWindow
 * @property {string} id
 * @property {string|Date} startsAtUtc
 * @property {string|Date} endsAtUtc
 * @property {string|Date} [claimStartsAtUtc]
 * @property {string|Date} [claimEndsAtUtc]
 * @property {string|Date} [registrationStartsAtUtc]
 * @property {string|Date} [registrationEndsAtUtc]
 * @property {number} [gracePeriodMs]
 * @property {boolean} [cancelled]
 * @property {number} [scheduleVersion]
 */

/**
 * Derive status from UTC boundaries (not worker-updated flags alone).
 * @returns {"scheduled"|"registration_open"|"active"|"grace_period"|"claim_only"|"ended"|"cancelled"}
 */
export function evaluateEventWindow(window, now = clock.now()) {
  if (!window) throw new TimeError(TimeErrors.EVENT_NOT_STARTED, "Missing event window");
  if (window.cancelled) return "cancelled";

  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const starts = parseInstant(window.startsAtUtc).getTime();
  const ends = parseInstant(window.endsAtUtc).getTime();
  if (!(ends > starts)) {
    throw new TimeError(TimeErrors.SCHEDULE_END_BEFORE_START, "Event end must be after start");
  }

  const graceMs = Number(window.gracePeriodMs) || 0;
  const graceEnds = ends + graceMs;

  const claimStart = window.claimStartsAtUtc
    ? parseInstant(window.claimStartsAtUtc).getTime()
    : starts;
  const claimEnd = window.claimEndsAtUtc
    ? parseInstant(window.claimEndsAtUtc).getTime()
    : graceEnds;

  const regStart = window.registrationStartsAtUtc
    ? parseInstant(window.registrationStartsAtUtc).getTime()
    : null;
  const regEnd = window.registrationEndsAtUtc
    ? parseInstant(window.registrationEndsAtUtc).getTime()
    : starts;

  if (nowMs < starts) {
    if (regStart != null && nowMs >= regStart && nowMs < regEnd) return "registration_open";
    return "scheduled";
  }
  if (nowMs < ends) return "active";
  if (graceMs > 0 && nowMs < graceEnds) return "grace_period";
  if (nowMs >= claimStart && nowMs < claimEnd) return "claim_only";
  return "ended";
}

export function assertEventActive(window, now = clock.now()) {
  const status = evaluateEventWindow(window, now);
  if (status === "cancelled") {
    throw new TimeError(TimeErrors.EVENT_ENDED, "Event cancelled");
  }
  if (status === "scheduled" || status === "registration_open") {
    throw new TimeError(TimeErrors.EVENT_NOT_STARTED, "Event has not started");
  }
  if (status === "ended") {
    throw new TimeError(TimeErrors.EVENT_ENDED, "Event has ended");
  }
  return status;
}

export function assertClaimWindowOpen(window, now = clock.now()) {
  const status = evaluateEventWindow(window, now);
  if (status === "cancelled" || status === "ended" || status === "scheduled" || status === "registration_open") {
    throw new TimeError(TimeErrors.CLAIM_WINDOW_CLOSED, `Claim window closed (${status})`);
  }
  return status;
}

export function describeEventWindow(window, now = clock.now()) {
  const status = evaluateEventWindow(window, now);
  return {
    id: window.id,
    status,
    scheduleVersion: window.scheduleVersion || 1,
    startsAtUtc: toIsoUtc(window.startsAtUtc),
    endsAtUtc: toIsoUtc(window.endsAtUtc),
    remainingSeconds: status === "active" ? remainingSeconds(window.endsAtUtc, now) : 0,
    serverTimeUtc: toIsoUtc(now instanceof Date ? now : new Date(now)),
  };
}

/** Maintenance uses the same UTC window model. */
export function isMaintenanceActive(window, now = clock.now()) {
  if (!window || window.cancelled) return false;
  const status = evaluateEventWindow(window, now);
  return status === "active" || status === "grace_period";
}
