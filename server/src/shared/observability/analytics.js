/**
 * Non-authoritative product analytics (Restoration 27).
 * Events never grant rewards, progression, or currency.
 * Provider outage / buffer full → drop; never block gameplay.
 */
import { logger } from "./logger.js";
import { redactForLog } from "./redactOps.js";
import { incCounter } from "./metrics.js";

const MAX_BUFFER = 200;
const buffer = [];
let dropped = 0;

/** Bounded registry of allowed event names. */
export const ANALYTICS_EVENTS = Object.freeze({
  client_session_start: { version: 1 },
  screen_viewed: { version: 1 },
  settings_changed: { version: 1 },
  api_request_failed: { version: 1 },
  auth_flow_stage: { version: 1 },
  shop_browsed: { version: 1 },
  combat_playback_skipped: { version: 1 },
  connection_error_shown: { version: 1 },
  // Server-side after commit (optional observation only)
  mission_settled_observed: { version: 1 },
  economy_mutation_observed: { version: 1 },
});

/**
 * @returns {{ accepted: boolean, reason?: string }}
 */
export function RecordAnalyticsEvent(input = {}) {
  try {
    const name = String(input.name || input.event || "").trim();
    if (!name || !ANALYTICS_EVENTS[name]) {
      incCounter("analytics_rejected_total", { reason: "unknown_event" });
      return { accepted: false, reason: "unknown_event" };
    }
    const props = input.properties && typeof input.properties === "object" ? input.properties : {};
    if (JSON.stringify(props).length > 4000) {
      incCounter("analytics_rejected_total", { reason: "oversized" });
      return { accepted: false, reason: "oversized" };
    }

    // Consent: if client asserts opted_out, drop optional events
    if (input.consent === false || input.opted_out === true) {
      incCounter("analytics_rejected_total", { reason: "consent" });
      return { accepted: false, reason: "consent" };
    }

    const row = {
      name,
      version: ANALYTICS_EVENTS[name].version,
      ts: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      source: input.source || "unknown",
      release: process.env.RELEASE_VERSION || "dev",
      properties: redactForLog(props),
      // Never trust client-claimed progression fields
      authoritative: false,
    };

    buffer.unshift(row);
    if (buffer.length > MAX_BUFFER) {
      buffer.length = MAX_BUFFER;
      dropped += 1;
      incCounter("analytics_dropped_total", { reason: "buffer" });
    }
    incCounter("analytics_accepted_total", { event: name.slice(0, 48) });
    return { accepted: true };
  } catch (err) {
    dropped += 1;
    try {
      logger.debug("analytics_record_failed", { error: String(err?.message || err) });
    } catch {
      /* isolate */
    }
    return { accepted: false, reason: "internal" };
  }
}

export function getAnalyticsBuffer(limit = 50) {
  return {
    events: buffer.slice(0, Math.min(100, Math.max(1, limit))),
    dropped,
    max_buffer: MAX_BUFFER,
    note: "Non-authoritative. Must not drive gameplay.",
  };
}

export function resetAnalyticsForTests() {
  buffer.length = 0;
  dropped = 0;
}
