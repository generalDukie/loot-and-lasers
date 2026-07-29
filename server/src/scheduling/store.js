/**
 * Durable schedule store (SQLite).
 * Occurrence IDs are unique — duplicate workers cannot apply twice.
 */

import { db } from "../db.js";
import { clock } from "../shared/time/clock.js";
import { toIsoUtc } from "../shared/time/instant.js";
import { computeNextOccurrence, computeNextOccurrences } from "../shared/time/occurrence.js";
import { nanoid } from "nanoid";

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      recurrence TEXT NOT NULL,
      local_time TEXT NOT NULL,
      time_zone_id TEXT NOT NULL,
      weekdays TEXT,
      day_of_month INTEGER,
      starts_on TEXT,
      ends_on TEXT,
      next_run_at_utc TEXT,
      last_run_at_utc TEXT,
      ambiguity_policy TEXT NOT NULL DEFAULT 'earlier',
      skipped_time_policy TEXT NOT NULL DEFAULT 'next_valid',
      missed_run_policy TEXT NOT NULL DEFAULT 'latest_only',
      maximum_catch_up_runs INTEGER NOT NULL DEFAULT 3,
      enabled INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      handler_key TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS schedule_occurrences (
      occurrence_id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      schedule_version INTEGER NOT NULL,
      scheduled_at_utc TEXT NOT NULL,
      status TEXT NOT NULL,
      locked_by TEXT,
      locked_until TEXT,
      started_at_utc TEXT,
      completed_at_utc TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      result_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(schedule_id, scheduled_at_utc)
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(enabled, next_run_at_utc);
    CREATE INDEX IF NOT EXISTS idx_occ_status ON schedule_occurrences(status, scheduled_at_utc);

    CREATE TABLE IF NOT EXISTS schedule_audit (
      id TEXT PRIMARY KEY,
      schedule_id TEXT,
      occurrence_id TEXT,
      action TEXT NOT NULL,
      actor TEXT,
      detail_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_audit_created ON schedule_audit(created_at);
  `);
}

ensureSchema();

function rowToSchedule(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    displayName: row.display_name,
    scheduleType: row.schedule_type,
    recurrence: row.recurrence,
    localTime: row.local_time,
    timeZoneId: row.time_zone_id,
    weekdays: row.weekdays ? JSON.parse(row.weekdays) : null,
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    nextRunAtUtc: row.next_run_at_utc,
    lastRunAtUtc: row.last_run_at_utc,
    ambiguityPolicy: row.ambiguity_policy,
    skippedTimePolicy: row.skipped_time_policy,
    missedRunPolicy: row.missed_run_policy,
    maximumCatchUpRuns: row.maximum_catch_up_runs,
    enabled: !!row.enabled,
    version: row.version,
    handlerKey: row.handler_key,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export function auditSchedule({ scheduleId = null, occurrenceId = null, action, actor = "system", detail = null }) {
  db.prepare(
    `INSERT INTO schedule_audit (id, schedule_id, occurrence_id, action, actor, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(nanoid(), scheduleId, occurrenceId, action, actor, detail ? JSON.stringify(detail) : null, clock.nowIso());
}

export function listSchedules() {
  return db.prepare("SELECT * FROM schedules ORDER BY key").all().map(rowToSchedule);
}

export function getSchedule(id) {
  return rowToSchedule(db.prepare("SELECT * FROM schedules WHERE id = ?").get(id));
}

export function getScheduleByKey(key) {
  return rowToSchedule(db.prepare("SELECT * FROM schedules WHERE key = ?").get(key));
}

export function createSchedule(input, actor = "system") {
  const id = input.id || nanoid();
  const now = clock.nowIso();
  const schedule = {
    id,
    key: input.key,
    displayName: input.displayName || input.key,
    scheduleType: input.scheduleType || "custom",
    recurrence: input.recurrence || "daily",
    localTime: input.localTime || "00:00",
    timeZoneId: input.timeZoneId || "America/New_York",
    weekdays: input.weekdays || null,
    dayOfMonth: input.dayOfMonth ?? null,
    startsOn: input.startsOn || null,
    endsOn: input.endsOn || null,
    ambiguityPolicy: input.ambiguityPolicy || "earlier",
    skippedTimePolicy: input.skippedTimePolicy || "next_valid",
    missedRunPolicy: input.missedRunPolicy || "latest_only",
    maximumCatchUpRuns: input.maximumCatchUpRuns ?? 3,
    enabled: input.enabled !== false ? 1 : 0,
    version: 1,
    handlerKey: input.handlerKey || null,
    payload: input.payload || null,
  };

  const next = computeNextOccurrence(schedule, clock.now());
  const nextRun = next?.scheduledAtUtc || null;

  db.prepare(
    `INSERT INTO schedules (
      id, key, display_name, schedule_type, recurrence, local_time, time_zone_id,
      weekdays, day_of_month, starts_on, ends_on, next_run_at_utc, last_run_at_utc,
      ambiguity_policy, skipped_time_policy, missed_run_policy, maximum_catch_up_runs,
      enabled, version, handler_key, payload_json, created_at, updated_at, created_by, updated_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    schedule.id,
    schedule.key,
    schedule.displayName,
    schedule.scheduleType,
    schedule.recurrence,
    schedule.localTime,
    schedule.timeZoneId,
    schedule.weekdays ? JSON.stringify(schedule.weekdays) : null,
    schedule.dayOfMonth,
    schedule.startsOn,
    schedule.endsOn,
    nextRun,
    schedule.ambiguityPolicy,
    schedule.skippedTimePolicy,
    schedule.missedRunPolicy,
    schedule.maximumCatchUpRuns,
    schedule.enabled,
    schedule.version,
    schedule.handlerKey,
    schedule.payload ? JSON.stringify(schedule.payload) : null,
    now,
    now,
    actor,
    actor
  );

  auditSchedule({
    scheduleId: id,
    action: "ScheduleCreated",
    actor,
    detail: { key: schedule.key, nextRun },
  });

  return getSchedule(id);
}

export function setScheduleEnabled(id, enabled, actor = "system") {
  db.prepare("UPDATE schedules SET enabled = ?, updated_at = ?, updated_by = ? WHERE id = ?").run(
    enabled ? 1 : 0,
    clock.nowIso(),
    actor,
    id
  );
  auditSchedule({
    scheduleId: id,
    action: enabled ? "ScheduleResumed" : "SchedulePaused",
    actor,
  });
  return getSchedule(id);
}

export function dueSchedules(nowIso = clock.nowIso(), limit = 50) {
  return db
    .prepare(
      `SELECT * FROM schedules
       WHERE enabled = 1 AND next_run_at_utc IS NOT NULL AND next_run_at_utc <= ?
       ORDER BY next_run_at_utc ASC LIMIT ?`
    )
    .all(nowIso, limit)
    .map(rowToSchedule);
}

/**
 * Atomically claim an occurrence for processing.
 * Returns { claimed: true, occurrence } or { claimed: false, reason }.
 */
export function claimOccurrence(schedule, scheduledAtUtc, workerId, lockMs = 60_000) {
  const occurrenceId = `schedule:${schedule.id}:${scheduledAtUtc}`;
  const now = clock.nowIso();
  const lockUntil = toIsoUtc(new Date(clock.nowMs() + lockMs));

  const existing = db.prepare("SELECT * FROM schedule_occurrences WHERE occurrence_id = ?").get(occurrenceId);
  if (existing) {
    if (existing.status === "completed" || existing.status === "skipped") {
      return { claimed: false, reason: "already_processed", occurrenceId };
    }
    if (
      existing.status === "processing" &&
      existing.locked_until &&
      existing.locked_until > now
    ) {
      return { claimed: false, reason: "in_progress", occurrenceId };
    }
    db.prepare(
      `UPDATE schedule_occurrences SET status = 'processing', locked_by = ?, locked_until = ?,
       started_at_utc = ?, attempt_count = attempt_count + 1 WHERE occurrence_id = ?`
    ).run(workerId, lockUntil, now, occurrenceId);
    return { claimed: true, occurrenceId, recovered: true };
  }

  try {
    db.prepare(
      `INSERT INTO schedule_occurrences (
        occurrence_id, schedule_id, schedule_version, scheduled_at_utc, status,
        locked_by, locked_until, started_at_utc, attempt_count, created_at
      ) VALUES (?, ?, ?, ?, 'processing', ?, ?, ?, 1, ?)`
    ).run(
      occurrenceId,
      schedule.id,
      schedule.version,
      scheduledAtUtc,
      workerId,
      lockUntil,
      now,
      now
    );
    return { claimed: true, occurrenceId, recovered: false };
  } catch (err) {
    // Unique race
    return { claimed: false, reason: "race", occurrenceId };
  }
}

export function completeOccurrence(occurrenceId, result = null) {
  const now = clock.nowIso();
  db.prepare(
    `UPDATE schedule_occurrences SET status = 'completed', completed_at_utc = ?, locked_by = NULL,
     locked_until = NULL, result_json = ? WHERE occurrence_id = ?`
  ).run(now, result ? JSON.stringify(result) : null, occurrenceId);
}

export function failOccurrence(occurrenceId, error, retryable = true) {
  db.prepare(
    `UPDATE schedule_occurrences SET status = ?, last_error = ?, locked_by = NULL, locked_until = NULL
     WHERE occurrence_id = ?`
  ).run(retryable ? "failed_retryable" : "failed_final", String(error).slice(0, 2000), occurrenceId);
}

export function skipOccurrence(schedule, scheduledAtUtc, reason) {
  const occurrenceId = `schedule:${schedule.id}:${scheduledAtUtc}`;
  const now = clock.nowIso();
  try {
    db.prepare(
      `INSERT INTO schedule_occurrences (
        occurrence_id, schedule_id, schedule_version, scheduled_at_utc, status,
        completed_at_utc, attempt_count, last_error, created_at
      ) VALUES (?, ?, ?, ?, 'skipped', ?, 0, ?, ?)`
    ).run(occurrenceId, schedule.id, schedule.version, scheduledAtUtc, now, reason, now);
  } catch {
    /* already exists */
  }
  return occurrenceId;
}

export function advanceSchedule(schedule, fromUtc = clock.now()) {
  const next = computeNextOccurrence(schedule, fromUtc);
  db.prepare(
    `UPDATE schedules SET last_run_at_utc = ?, next_run_at_utc = ?, updated_at = ? WHERE id = ?`
  ).run(
    schedule.nextRunAtUtc || clock.nowIso(),
    next?.scheduledAtUtc || null,
    clock.nowIso(),
    schedule.id
  );
  return next;
}

export function listAudit(limit = 50) {
  return db
    .prepare("SELECT * FROM schedule_audit ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map((r) => ({
      id: r.id,
      scheduleId: r.schedule_id,
      occurrenceId: r.occurrence_id,
      action: r.action,
      actor: r.actor,
      detail: r.detail_json ? JSON.parse(r.detail_json) : null,
      createdAt: r.created_at,
    }));
}

export function previewOccurrences(input, count = 5) {
  const schedule = {
    id: input.id || input.key || "preview",
    key: input.key || "preview",
    recurrence: input.recurrence || "daily",
    localTime: input.localTime || "00:00",
    timeZoneId: input.timeZoneId || "America/New_York",
    weekdays: input.weekdays || null,
    dayOfMonth: input.dayOfMonth ?? null,
    ambiguityPolicy: input.ambiguityPolicy || "earlier",
    skippedTimePolicy: input.skippedTimePolicy || "next_valid",
  };
  return computeNextOccurrences(schedule, clock.now(), count);
}
