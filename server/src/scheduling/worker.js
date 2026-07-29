/**
 * Durable in-process schedule worker.
 * Scans due schedules using UTC, claims occurrences with unique IDs,
 * applies missed-run policy, advances next_run_at_utc.
 */

import { nanoid } from "nanoid";
import { clock } from "../shared/time/clock.js";
import { computeNextOccurrences } from "../shared/time/occurrence.js";
import {
  dueSchedules,
  claimOccurrence,
  completeOccurrence,
  failOccurrence,
  skipOccurrence,
  advanceSchedule,
  auditSchedule,
  getSchedule,
} from "./store.js";
import { getHandler } from "./handlers.js";

const WORKER_ID = `worker-${process.pid}-${nanoid(6)}`;
let _timer = null;
let _running = false;

async function processSchedule(schedule) {
  const now = clock.now();
  const nowIso = clock.nowIso();

  // Collect due wall-clock occurrences up to now (catch-up), then apply policy.
  const lookbackFrom = schedule.lastRunAtUtc
    ? new Date(new Date(schedule.lastRunAtUtc).getTime() - 1000)
    : new Date(now.getTime() - 7 * 86400000);

  const candidates = computeNextOccurrences(schedule, lookbackFrom, schedule.maximumCatchUpRuns + 2).filter(
    (o) => o.scheduledAtUtc <= nowIso
  );

  if (!candidates.length) {
    // next_run_at was stale — recompute forward
    advanceSchedule(schedule, now);
    return { advanced: true };
  }

  let toRun = candidates;
  const policy = schedule.missedRunPolicy || "latest_only";
  if (policy === "latest_only" && candidates.length > 1) {
    const skipped = candidates.slice(0, -1);
    for (const s of skipped) {
      skipOccurrence(schedule, s.scheduledAtUtc, "missed_catch_up_latest_only");
      auditSchedule({
        scheduleId: schedule.id,
        occurrenceId: s.occurrenceId,
        action: "ScheduleOccurrenceSkipped",
        detail: { reason: "missed_catch_up_latest_only" },
      });
    }
    toRun = [candidates[candidates.length - 1]];
  } else if (policy === "skip") {
    for (const s of candidates) {
      skipOccurrence(schedule, s.scheduledAtUtc, "missed_skip_policy");
    }
    advanceSchedule(schedule, now);
    return { skipped: candidates.length };
  } else if (policy === "catch_up_all") {
    toRun = candidates.slice(0, schedule.maximumCatchUpRuns);
    if (candidates.length > schedule.maximumCatchUpRuns) {
      auditSchedule({
        scheduleId: schedule.id,
        action: "ScheduleOccurrenceMissed",
        detail: {
          unresolved: candidates.length - schedule.maximumCatchUpRuns,
          maximumCatchUpRuns: schedule.maximumCatchUpRuns,
        },
      });
      console.warn(
        `[scheduler] schedule ${schedule.key} exceeded catch-up limit; ${
          candidates.length - schedule.maximumCatchUpRuns
        } occurrences remain unresolved`
      );
    }
  }

  const results = [];
  for (const occ of toRun) {
    const claim = claimOccurrence(schedule, occ.scheduledAtUtc, WORKER_ID);
    if (!claim.claimed) {
      results.push({ occurrenceId: claim.occurrenceId, status: claim.reason });
      continue;
    }

    auditSchedule({
      scheduleId: schedule.id,
      occurrenceId: claim.occurrenceId,
      action: "ScheduleOccurrenceStarted",
      detail: { scheduledAtUtc: occ.scheduledAtUtc, delayMs: clock.nowMs() - new Date(occ.scheduledAtUtc).getTime() },
    });

    try {
      const handler = getHandler(schedule.handlerKey || "noop");
      const result = handler
        ? await handler(schedule, { ...occ, occurrenceId: claim.occurrenceId })
        : { type: "noop" };
      completeOccurrence(claim.occurrenceId, result);
      auditSchedule({
        scheduleId: schedule.id,
        occurrenceId: claim.occurrenceId,
        action: "ScheduleOccurrenceCompleted",
        detail: result,
      });
      results.push({ occurrenceId: claim.occurrenceId, status: "completed", result });
    } catch (err) {
      failOccurrence(claim.occurrenceId, err.message || String(err), true);
      auditSchedule({
        scheduleId: schedule.id,
        occurrenceId: claim.occurrenceId,
        action: "ScheduleOccurrenceFailed",
        detail: { error: err.message || String(err) },
      });
      results.push({ occurrenceId: claim.occurrenceId, status: "failed", error: err.message });
    }
  }

  // Advance past the last processed scheduled time
  const last = toRun[toRun.length - 1];
  const fresh = getSchedule(schedule.id);
  advanceSchedule(fresh || schedule, new Date(new Date(last.scheduledAtUtc).getTime() + 1000));
  return { results };
}

export async function tickScheduler() {
  if (_running) return { busy: true };
  _running = true;
  try {
    const due = dueSchedules(clock.nowIso(), 25);
    const outcomes = [];
    for (const schedule of due) {
      try {
        outcomes.push({ key: schedule.key, ...(await processSchedule(schedule)) });
      } catch (err) {
        console.error(`[scheduler] failed ${schedule.key}:`, err);
        outcomes.push({ key: schedule.key, error: err.message });
      }
    }
    return { scanned: due.length, outcomes };
  } finally {
    _running = false;
  }
}

export function startScheduler({ intervalMs = 15_000 } = {}) {
  if (_timer) return;
  console.log(`[scheduler] starting worker ${WORKER_ID} every ${intervalMs}ms`);
  // Immediate tick, then interval
  tickScheduler().catch((e) => console.error("[scheduler] tick error", e));
  _timer = setInterval(() => {
    tickScheduler().catch((e) => console.error("[scheduler] tick error", e));
  }, intervalMs);
  if (typeof _timer.unref === "function") _timer.unref();
}

export function stopScheduler() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

export function getWorkerId() {
  return WORKER_ID;
}
