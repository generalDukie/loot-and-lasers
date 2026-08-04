/**
 * Quarantine + repair audit persistence (Restoration 25).
 * Does not delete gameplay value — preserves evidence for review.
 */
import { db } from "../db.js";
import { clock } from "./time/clock.js";
import { nanoid } from "nanoid";

let schemaReady = false;

export function ensureIntegritySchema() {
  if (schemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_quarantine (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      owner_id TEXT,
      issue_code TEXT NOT NULL,
      severity TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      related_json TEXT,
      review_status TEXT NOT NULL DEFAULT 'open',
      resolution_notes TEXT,
      validator_version TEXT,
      detected_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_quarantine_status
      ON data_quarantine(review_status, severity, detected_at);
    CREATE INDEX IF NOT EXISTS idx_quarantine_entity
      ON data_quarantine(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_quarantine_owner
      ON data_quarantine(owner_id, detected_at);

    CREATE TABLE IF NOT EXISTS repair_audit_log (
      id TEXT PRIMARY KEY,
      repair_type TEXT NOT NULL,
      target_entity_type TEXT,
      target_entity_id TEXT,
      before_json TEXT,
      after_json TEXT,
      evidence_json TEXT,
      tool_version TEXT,
      actor TEXT NOT NULL,
      automated INTEGER NOT NULL DEFAULT 1,
      reason TEXT,
      rollback_ref TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_repair_audit_target
      ON repair_audit_log(target_entity_type, target_entity_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_repair_audit_created
      ON repair_audit_log(created_at);

    CREATE TABLE IF NOT EXISTS migration_runs (
      id TEXT PRIMARY KEY,
      migration_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      dry_run INTEGER NOT NULL DEFAULT 0,
      checkpoint_json TEXT,
      report_json TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      operator TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_migration_runs_mig
      ON migration_runs(migration_id, started_at);

    CREATE TABLE IF NOT EXISTS migration_checkpoints (
      migration_id TEXT PRIMARY KEY,
      cursor_json TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  schemaReady = true;
}

ensureIntegritySchema();

export const QuarantineStatus = Object.freeze({
  OPEN: "open",
  IN_REVIEW: "in_review",
  RESOLVED: "resolved",
  DISMISSED: "dismissed",
});

export function insertQuarantineRecord({
  entityType,
  entityId = null,
  ownerId = null,
  issueCode,
  severity,
  payload,
  related = null,
  validatorVersion = "integrity_v1",
}) {
  ensureIntegritySchema();
  const id = nanoid();
  const now = clock.nowIso();
  db.prepare(`
    INSERT INTO data_quarantine (
      id, entity_type, entity_id, owner_id, issue_code, severity,
      payload_json, related_json, review_status, validator_version,
      detected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `).run(
    id,
    String(entityType || "unknown"),
    entityId == null ? null : String(entityId),
    ownerId == null ? null : String(ownerId),
    String(issueCode || "UNKNOWN"),
    String(severity || "medium"),
    JSON.stringify(payload ?? {}),
    related == null ? null : JSON.stringify(related),
    String(validatorVersion),
    now,
    now,
  );
  return getQuarantineById(id);
}

export function getQuarantineById(id) {
  ensureIntegritySchema();
  const row = db.prepare("SELECT * FROM data_quarantine WHERE id = ?").get(id);
  return rowToQuarantine(row);
}

export function listOpenQuarantine({ limit = 100, ownerId = null } = {}) {
  ensureIntegritySchema();
  const lim = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  if (ownerId) {
    return db
      .prepare(
        `SELECT * FROM data_quarantine
         WHERE review_status = 'open' AND owner_id = ?
         ORDER BY detected_at DESC LIMIT ?`,
      )
      .all(ownerId, lim)
      .map(rowToQuarantine);
  }
  return db
    .prepare(
      `SELECT * FROM data_quarantine
       WHERE review_status = 'open'
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           ELSE 3
         END,
         detected_at DESC
       LIMIT ?`,
    )
    .all(lim)
    .map(rowToQuarantine);
}

export function insertRepairAudit({
  repairType,
  targetEntityType = null,
  targetEntityId = null,
  before = null,
  after = null,
  evidence = null,
  toolVersion = "integrity_v1",
  actor = "system",
  automated = true,
  reason = null,
  rollbackRef = null,
}) {
  ensureIntegritySchema();
  const id = nanoid();
  const now = clock.nowIso();
  db.prepare(`
    INSERT INTO repair_audit_log (
      id, repair_type, target_entity_type, target_entity_id,
      before_json, after_json, evidence_json, tool_version,
      actor, automated, reason, rollback_ref, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(repairType),
    targetEntityType,
    targetEntityId,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
    evidence == null ? null : JSON.stringify(evidence),
    toolVersion,
    String(actor),
    automated ? 1 : 0,
    reason,
    rollbackRef,
    now,
  );
  return id;
}

export function listRepairAudits({ limit = 50, targetEntityId = null } = {}) {
  ensureIntegritySchema();
  const lim = Math.min(500, Math.max(1, Math.floor(Number(limit) || 50)));
  if (targetEntityId) {
    return db
      .prepare(
        `SELECT * FROM repair_audit_log
         WHERE target_entity_id = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(targetEntityId, lim)
      .map(rowToRepair);
  }
  return db
    .prepare(`SELECT * FROM repair_audit_log ORDER BY created_at DESC LIMIT ?`)
    .all(lim)
    .map(rowToRepair);
}

function rowToQuarantine(row) {
  if (!row) return null;
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    owner_id: row.owner_id,
    issue_code: row.issue_code,
    severity: row.severity,
    payload: safeJson(row.payload_json, {}),
    related: safeJson(row.related_json, null),
    review_status: row.review_status,
    resolution_notes: row.resolution_notes,
    validator_version: row.validator_version,
    detected_at: row.detected_at,
    updated_at: row.updated_at,
  };
}

function rowToRepair(row) {
  if (!row) return null;
  return {
    id: row.id,
    repair_type: row.repair_type,
    target_entity_type: row.target_entity_type,
    target_entity_id: row.target_entity_id,
    before: safeJson(row.before_json, null),
    after: safeJson(row.after_json, null),
    evidence: safeJson(row.evidence_json, null),
    tool_version: row.tool_version,
    actor: row.actor,
    automated: !!row.automated,
    reason: row.reason,
    rollback_ref: row.rollback_ref,
    created_at: row.created_at,
  };
}

function safeJson(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
