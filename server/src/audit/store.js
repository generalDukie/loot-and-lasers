/**
 * Append-only SQLite audit ledger + annotations + integrity chain + export meta.
 */

import { createHash } from "node:crypto";
import { db } from "../db.js";
import { clock } from "../shared/time/clock.js";
import { nanoid } from "nanoid";

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      audit_version INTEGER NOT NULL DEFAULT 1,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      severity TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      actor_account_id TEXT,
      actor_character_id TEXT,
      target_type TEXT,
      target_id TEXT,
      target_account_id TEXT,
      target_character_id TEXT,
      subject_type TEXT,
      subject_id TEXT,
      correlation_id TEXT,
      causation_id TEXT,
      event_id TEXT,
      command_id TEXT,
      request_id TEXT,
      session_id TEXT,
      source_service TEXT,
      environment TEXT,
      reason_code TEXT,
      reason_text TEXT,
      before_state_json TEXT,
      after_state_json TEXT,
      change_set_json TEXT,
      metadata_json TEXT,
      ip_address_hash TEXT,
      client_platform TEXT,
      client_version TEXT,
      administrator_note TEXT,
      retention_class TEXT NOT NULL,
      created_by_system_version TEXT,
      content_hash TEXT,
      previous_entry_hash TEXT,
      chain_scope TEXT,
      chain_sequence INTEGER,
      idempotency_key TEXT UNIQUE,
      occurred_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      hold INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_logs(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_category_action ON audit_logs(category, action);
    CREATE INDEX IF NOT EXISTS idx_audit_result ON audit_logs(result);
    CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_type, actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_target_account ON audit_logs(target_account_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_target_character ON audit_logs(target_character_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_logs(subject_type, subject_id);
    CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_logs(correlation_id);
    CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event_id);
    CREATE INDEX IF NOT EXISTS idx_audit_command ON audit_logs(command_id);
    CREATE INDEX IF NOT EXISTS idx_audit_env_service ON audit_logs(environment, source_service);
    CREATE INDEX IF NOT EXISTS idx_audit_retention ON audit_logs(retention_class, hold);

    CREATE TABLE IF NOT EXISTS audit_annotations (
      id TEXT PRIMARY KEY,
      audit_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_email TEXT,
      note TEXT NOT NULL,
      resolution_status TEXT,
      support_case_id TEXT,
      incident_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'staff',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_ann_audit ON audit_annotations(audit_id, created_at);

    CREATE TABLE IF NOT EXISTS audit_exports (
      id TEXT PRIMARY KEY,
      requested_by TEXT NOT NULL,
      filters_json TEXT,
      row_count INTEGER,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_integrity_chains (
      chain_scope TEXT PRIMARY KEY,
      last_hash TEXT,
      last_sequence INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_retention_holds (
      id TEXT PRIMARY KEY,
      audit_id TEXT,
      account_id TEXT,
      reason TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      released_at TEXT
    );
  `);
}

ensureSchema();

function parseJson(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function rowToAudit(row) {
  if (!row) return null;
  return {
    auditId: row.id,
    auditVersion: row.audit_version,
    category: row.category,
    action: row.action,
    result: row.result,
    severity: row.severity,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorAccountId: row.actor_account_id,
    actorCharacterId: row.actor_character_id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetAccountId: row.target_account_id,
    targetCharacterId: row.target_character_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    eventId: row.event_id,
    commandId: row.command_id,
    requestId: row.request_id,
    sessionId: row.session_id,
    sourceService: row.source_service,
    environment: row.environment,
    reasonCode: row.reason_code,
    reasonText: row.reason_text,
    beforeState: parseJson(row.before_state_json),
    afterState: parseJson(row.after_state_json),
    changeSet: parseJson(row.change_set_json),
    metadata: parseJson(row.metadata_json),
    ipAddressHash: row.ip_address_hash,
    clientPlatform: row.client_platform,
    clientVersion: row.client_version,
    administratorNote: row.administrator_note,
    retentionClass: row.retention_class,
    createdBySystemVersion: row.created_by_system_version,
    contentHash: row.content_hash,
    previousEntryHash: row.previous_entry_hash,
    chainScope: row.chain_scope,
    chainSequence: row.chain_sequence,
    idempotencyKey: row.idempotency_key,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    hold: !!row.hold,
  };
}

export function computeContentHash(fields) {
  const normalized = JSON.stringify(fields);
  return createHash("sha256").update(normalized).digest("hex");
}

export function getChainHead(chainScope) {
  return db
    .prepare("SELECT * FROM audit_integrity_chains WHERE chain_scope = ?")
    .get(chainScope);
}

export function advanceChain(chainScope, contentHash) {
  const now = clock.nowIso();
  const head = getChainHead(chainScope);
  const prev = head?.last_hash || null;
  const seq = (head?.last_sequence || 0) + 1;
  if (head) {
    db.prepare(
      `UPDATE audit_integrity_chains SET last_hash = ?, last_sequence = ?, updated_at = ? WHERE chain_scope = ?`
    ).run(contentHash, seq, now, chainScope);
  } else {
    db.prepare(
      `INSERT INTO audit_integrity_chains (chain_scope, last_hash, last_sequence, updated_at)
       VALUES (?, ?, ?, ?)`
    ).run(chainScope, contentHash, seq, now);
  }
  return { previousEntryHash: prev, chainSequence: seq };
}

export function getByIdempotencyKey(key) {
  if (!key) return null;
  return rowToAudit(
    db.prepare("SELECT * FROM audit_logs WHERE idempotency_key = ?").get(key)
  );
}

export function getAuditById(id) {
  return rowToAudit(db.prepare("SELECT * FROM audit_logs WHERE id = ?").get(id));
}

export function insertAuditRow(row) {
  db.prepare(
    `INSERT INTO audit_logs (
      id, audit_version, category, action, result, severity,
      actor_type, actor_id, actor_account_id, actor_character_id,
      target_type, target_id, target_account_id, target_character_id,
      subject_type, subject_id,
      correlation_id, causation_id, event_id, command_id, request_id, session_id,
      source_service, environment, reason_code, reason_text,
      before_state_json, after_state_json, change_set_json, metadata_json,
      ip_address_hash, client_platform, client_version, administrator_note,
      retention_class, created_by_system_version,
      content_hash, previous_entry_hash, chain_scope, chain_sequence,
      idempotency_key, occurred_at, recorded_at, hold
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    row.id,
    row.audit_version,
    row.category,
    row.action,
    row.result,
    row.severity,
    row.actor_type,
    row.actor_id,
    row.actor_account_id,
    row.actor_character_id,
    row.target_type,
    row.target_id,
    row.target_account_id,
    row.target_character_id,
    row.subject_type,
    row.subject_id,
    row.correlation_id,
    row.causation_id,
    row.event_id,
    row.command_id,
    row.request_id,
    row.session_id,
    row.source_service,
    row.environment,
    row.reason_code,
    row.reason_text,
    row.before_state_json,
    row.after_state_json,
    row.change_set_json,
    row.metadata_json,
    row.ip_address_hash,
    row.client_platform,
    row.client_version,
    row.administrator_note,
    row.retention_class,
    row.created_by_system_version,
    row.content_hash,
    row.previous_entry_hash,
    row.chain_scope,
    row.chain_sequence,
    row.idempotency_key,
    row.occurred_at,
    row.recorded_at,
    row.hold ? 1 : 0
  );
  return getAuditById(row.id);
}

export function searchAudits(filters = {}) {
  const where = [];
  const params = [];

  const add = (sql, val) => {
    if (val == null || val === "") return;
    where.push(sql);
    params.push(val);
  };

  add("id = ?", filters.auditId);
  add("category = ?", filters.category);
  add("action = ?", filters.action);
  add("result = ?", filters.result);
  add("severity = ?", filters.severity);
  add("actor_type = ?", filters.actorType);
  add("actor_id = ?", filters.actorId);
  add("target_type = ?", filters.targetType);
  add("target_id = ?", filters.targetId);
  add("target_account_id = ?", filters.accountId || filters.targetAccountId);
  add("target_character_id = ?", filters.characterId || filters.targetCharacterId);
  add("subject_type = ?", filters.subjectType);
  add("subject_id = ?", filters.subjectId);
  add("correlation_id = ?", filters.correlationId);
  add("event_id = ?", filters.eventId);
  add("command_id = ?", filters.commandId);
  add("request_id = ?", filters.requestId);
  add("source_service = ?", filters.sourceService);
  add("environment = ?", filters.environment);
  add("retention_class = ?", filters.retentionClass);

  if (filters.from) {
    where.push("occurred_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("occurred_at <= ?");
    params.push(filters.to);
  }
  if (filters.highRisk) {
    where.push("severity IN ('high','critical')");
  }
  if (filters.failedOnly) {
    where.push("result IN ('failed','rejected','blocked')");
  }

  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.offset) || 0);

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRow = db
    .prepare(`SELECT COUNT(*) AS n FROM audit_logs ${clause}`)
    .get(...params);
  const rows = db
    .prepare(
      `SELECT * FROM audit_logs ${clause} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return {
    total: countRow?.n || 0,
    limit,
    offset,
    items: rows.map(rowToAudit),
  };
}

export function insertAnnotation(input) {
  const id = nanoid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO audit_annotations
     (id, audit_id, author_id, author_email, note, resolution_status, support_case_id, incident_id, visibility, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    input.auditId,
    input.authorId,
    input.authorEmail || null,
    input.note,
    input.resolutionStatus || null,
    input.supportCaseId || null,
    input.incidentId || null,
    input.visibility || "staff",
    now
  );
  return {
    annotationId: id,
    auditId: input.auditId,
    authorId: input.authorId,
    authorEmail: input.authorEmail || null,
    note: input.note,
    resolutionStatus: input.resolutionStatus || null,
    supportCaseId: input.supportCaseId || null,
    incidentId: input.incidentId || null,
    visibility: input.visibility || "staff",
    createdAt: now,
  };
}

export function listAnnotations(auditId) {
  return db
    .prepare(
      `SELECT * FROM audit_annotations WHERE audit_id = ? ORDER BY created_at ASC`
    )
    .all(auditId)
    .map((r) => ({
      annotationId: r.id,
      auditId: r.audit_id,
      authorId: r.author_id,
      authorEmail: r.author_email,
      note: r.note,
      resolutionStatus: r.resolution_status,
      supportCaseId: r.support_case_id,
      incidentId: r.incident_id,
      visibility: r.visibility,
      createdAt: r.created_at,
    }));
}

export function recordExportMeta(input) {
  const id = nanoid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO audit_exports (id, requested_by, filters_json, row_count, status, created_at, completed_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    id,
    input.requestedBy,
    JSON.stringify(input.filters || {}),
    input.rowCount || 0,
    input.status || "completed",
    now,
    now
  );
  return { exportId: id, createdAt: now };
}

/** Soft immutability: application layer refuses updates/deletes. */
export function assertImmutable() {
  throw Object.assign(new Error("Audit records are immutable"), {
    status: 405,
    code: "AUDIT_IMMUTABLE",
  });
}
