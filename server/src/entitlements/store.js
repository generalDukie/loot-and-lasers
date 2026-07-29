/**
 * Durable entitlement store (SQLite).
 * Mirrors scheduling tables: unique occurrence/idempotency + audit history.
 */

import { db } from "../db.js";
import { clock } from "../shared/time/clock.js";
import { nanoid } from "nanoid";

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entitlements (
      id TEXT PRIMARY KEY,
      entitlement_key TEXT NOT NULL,
      account_id TEXT NOT NULL,
      character_id TEXT,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      consumed_quantity INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL,
      source_reference_type TEXT,
      source_reference_id TEXT,
      external_provider TEXT,
      external_product_id TEXT,
      external_transaction_id TEXT,
      external_original_transaction_id TEXT,
      grant_command_id TEXT,
      idempotency_key TEXT,
      starts_at TEXT,
      expires_at TEXT,
      revoked_at TEXT,
      revoked_by TEXT,
      revocation_reason TEXT,
      suspended_at TEXT,
      restored_at TEXT,
      verified_at TEXT,
      verification_status TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      correlation_id TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_ent_account_key ON entitlements(account_id, entitlement_key);
    CREATE INDEX IF NOT EXISTS idx_ent_character_key ON entitlements(character_id, entitlement_key);
    CREATE INDEX IF NOT EXISTS idx_ent_status_expires ON entitlements(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_ent_source ON entitlements(source_type, source_reference_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ent_idempotency
      ON entitlements(idempotency_key) WHERE idempotency_key IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ent_external_tx
      ON entitlements(external_provider, external_transaction_id)
      WHERE external_provider IS NOT NULL AND external_transaction_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS entitlement_status_history (
      id TEXT PRIMARY KEY,
      entitlement_id TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      actor TEXT,
      reason TEXT,
      detail_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ent_hist_ent ON entitlement_status_history(entitlement_id, created_at);

    CREATE TABLE IF NOT EXISTS entitlement_consumptions (
      id TEXT PRIMARY KEY,
      entitlement_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      operation_id TEXT NOT NULL UNIQUE,
      reason TEXT,
      target_json TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS entitlement_audit (
      id TEXT PRIMARY KEY,
      entitlement_id TEXT,
      entitlement_key TEXT,
      account_id TEXT,
      character_id TEXT,
      action TEXT NOT NULL,
      actor TEXT,
      detail_json TEXT,
      correlation_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ent_audit_created ON entitlement_audit(created_at);
    CREATE INDEX IF NOT EXISTS idx_ent_audit_account ON entitlement_audit(account_id, created_at);

    CREATE TABLE IF NOT EXISTS external_purchase_verifications (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      product_id TEXT,
      external_transaction_id TEXT NOT NULL,
      account_id TEXT,
      status TEXT NOT NULL,
      verification_result_json TEXT,
      idempotency_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, external_transaction_id)
    );

    CREATE TABLE IF NOT EXISTS entitlement_outbox (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ent_outbox_status ON entitlement_outbox(status, created_at);
  `);
}

ensureSchema();

function rowToEntitlement(row) {
  if (!row) return null;
  return {
    id: row.id,
    entitlementKey: row.entitlement_key,
    accountId: row.account_id,
    characterId: row.character_id || null,
    scope: row.scope,
    status: row.status,
    quantity: row.quantity,
    consumedQuantity: row.consumed_quantity,
    remainingQuantity: Math.max(0, row.quantity - row.consumed_quantity),
    sourceType: row.source_type,
    sourceReferenceType: row.source_reference_type,
    sourceReferenceId: row.source_reference_id,
    externalProvider: row.external_provider,
    externalProductId: row.external_product_id,
    externalTransactionId: row.external_transaction_id,
    externalOriginalTransactionId: row.external_original_transaction_id,
    grantCommandId: row.grant_command_id,
    idempotencyKey: row.idempotency_key,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    revocationReason: row.revocation_reason,
    suspendedAt: row.suspended_at,
    restoredAt: row.restored_at,
    verifiedAt: row.verified_at,
    verificationStatus: row.verification_status,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    correlationId: row.correlation_id,
    version: row.version,
  };
}

export function auditEntitlement({
  entitlementId = null,
  entitlementKey = null,
  accountId = null,
  characterId = null,
  action,
  actor = "system",
  detail = null,
  correlationId = null,
}) {
  db.prepare(
    `INSERT INTO entitlement_audit
     (id, entitlement_id, entitlement_key, account_id, character_id, action, actor, detail_json, correlation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nanoid(),
    entitlementId,
    entitlementKey,
    accountId,
    characterId,
    action,
    actor,
    detail ? JSON.stringify(detail) : null,
    correlationId,
    clock.nowIso()
  );
}

export function emitEntitlementEvent(eventType, payload) {
  db.prepare(
    `INSERT INTO entitlement_outbox (id, event_type, payload_json, status, created_at)
     VALUES (?, ?, ?, 'pending', ?)`
  ).run(nanoid(), eventType, JSON.stringify(payload), clock.nowIso());
}

export function recordStatusHistory(entitlementId, previousStatus, newStatus, actor, reason, detail = null) {
  db.prepare(
    `INSERT INTO entitlement_status_history
     (id, entitlement_id, previous_status, new_status, actor, reason, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nanoid(),
    entitlementId,
    previousStatus,
    newStatus,
    actor,
    reason,
    detail ? JSON.stringify(detail) : null,
    clock.nowIso()
  );
}

export function getEntitlementById(id) {
  return rowToEntitlement(db.prepare("SELECT * FROM entitlements WHERE id = ?").get(id));
}

export function getEntitlementByIdempotencyKey(key) {
  if (!key) return null;
  return rowToEntitlement(db.prepare("SELECT * FROM entitlements WHERE idempotency_key = ?").get(key));
}

export function findByExternalTransaction(provider, txId) {
  if (!provider || !txId) return null;
  return rowToEntitlement(
    db
      .prepare("SELECT * FROM entitlements WHERE external_provider = ? AND external_transaction_id = ?")
      .get(provider, txId)
  );
}

export function listEntitlementsForAccount(accountId, { includeInactive = false } = {}) {
  const rows = includeInactive
    ? db.prepare("SELECT * FROM entitlements WHERE account_id = ? ORDER BY created_at DESC").all(accountId)
    : db
        .prepare(
          `SELECT * FROM entitlements WHERE account_id = ? AND status IN ('active','pending','suspended')
           ORDER BY created_at DESC`
        )
        .all(accountId);
  return rows.map(rowToEntitlement);
}

export function listEntitlementsByKey(accountId, entitlementKey, characterId = null) {
  if (characterId) {
    return db
      .prepare(
        `SELECT * FROM entitlements WHERE account_id = ? AND entitlement_key = ?
         AND (character_id IS NULL OR character_id = ?) ORDER BY created_at DESC`
      )
      .all(accountId, entitlementKey, characterId)
      .map(rowToEntitlement);
  }
  return db
    .prepare("SELECT * FROM entitlements WHERE account_id = ? AND entitlement_key = ? ORDER BY created_at DESC")
    .all(accountId, entitlementKey)
    .map(rowToEntitlement);
}

export function insertEntitlement(input) {
  const id = input.id || nanoid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO entitlements (
      id, entitlement_key, account_id, character_id, scope, status, quantity, consumed_quantity,
      source_type, source_reference_type, source_reference_id,
      external_provider, external_product_id, external_transaction_id, external_original_transaction_id,
      grant_command_id, idempotency_key, starts_at, expires_at,
      verified_at, verification_status, metadata_json,
      created_at, updated_at, created_by, correlation_id, version
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`
  ).run(
    id,
    input.entitlementKey,
    input.accountId,
    input.characterId || null,
    input.scope,
    input.status || "active",
    input.quantity ?? 1,
    input.consumedQuantity ?? 0,
    input.sourceType,
    input.sourceReferenceType || null,
    input.sourceReferenceId || null,
    input.externalProvider || null,
    input.externalProductId || null,
    input.externalTransactionId || null,
    input.externalOriginalTransactionId || null,
    input.grantCommandId || null,
    input.idempotencyKey || null,
    input.startsAt || now,
    input.expiresAt || null,
    input.verifiedAt || null,
    input.verificationStatus || null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    now,
    now,
    input.createdBy || "system",
    input.correlationId || null
  );
  return getEntitlementById(id);
}

export function updateEntitlementStatus(id, patch, actor = "system") {
  const cur = getEntitlementById(id);
  if (!cur) return null;
  const now = clock.nowIso();
  const nextStatus = patch.status ?? cur.status;
  db.prepare(
    `UPDATE entitlements SET
      status = ?,
      quantity = COALESCE(?, quantity),
      consumed_quantity = COALESCE(?, consumed_quantity),
      expires_at = COALESCE(?, expires_at),
      starts_at = COALESCE(?, starts_at),
      revoked_at = COALESCE(?, revoked_at),
      revoked_by = COALESCE(?, revoked_by),
      revocation_reason = COALESCE(?, revocation_reason),
      suspended_at = COALESCE(?, suspended_at),
      restored_at = COALESCE(?, restored_at),
      verified_at = COALESCE(?, verified_at),
      verification_status = COALESCE(?, verification_status),
      updated_at = ?,
      version = version + 1
     WHERE id = ?`
  ).run(
    nextStatus,
    patch.quantity ?? null,
    patch.consumedQuantity ?? null,
    patch.expiresAt !== undefined ? patch.expiresAt : null,
    patch.startsAt !== undefined ? patch.startsAt : null,
    patch.revokedAt ?? null,
    patch.revokedBy ?? null,
    patch.revocationReason ?? null,
    patch.suspendedAt ?? null,
    patch.restoredAt ?? null,
    patch.verifiedAt ?? null,
    patch.verificationStatus ?? null,
    now,
    id
  );
  if (nextStatus !== cur.status) {
    recordStatusHistory(id, cur.status, nextStatus, actor, patch.reason || null, patch);
  }
  return getEntitlementById(id);
}

export function insertConsumption({ entitlementId, accountId, quantity, operationId, reason, target, createdBy }) {
  db.prepare(
    `INSERT INTO entitlement_consumptions
     (id, entitlement_id, account_id, quantity, operation_id, reason, target_json, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nanoid(),
    entitlementId,
    accountId,
    quantity,
    operationId,
    reason || null,
    target ? JSON.stringify(target) : null,
    clock.nowIso(),
    createdBy || "system"
  );
}

export function getConsumptionByOperationId(operationId) {
  const row = db.prepare("SELECT * FROM entitlement_consumptions WHERE operation_id = ?").get(operationId);
  return row || null;
}

export function searchEntitlements({
  accountId = null,
  characterId = null,
  entitlementKey = null,
  status = null,
  sourceType = null,
  provider = null,
  externalTransactionId = null,
  limit = 50,
  offset = 0,
} = {}) {
  const clauses = [];
  const params = [];
  if (accountId) {
    clauses.push("account_id = ?");
    params.push(accountId);
  }
  if (characterId) {
    clauses.push("character_id = ?");
    params.push(characterId);
  }
  if (entitlementKey) {
    clauses.push("entitlement_key = ?");
    params.push(entitlementKey);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (sourceType) {
    clauses.push("source_type = ?");
    params.push(sourceType);
  }
  if (provider) {
    clauses.push("external_provider = ?");
    params.push(provider);
  }
  if (externalTransactionId) {
    clauses.push("external_transaction_id = ?");
    params.push(externalTransactionId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM entitlements ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, Math.min(200, limit), offset);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM entitlements ${where}`).get(...params).c;
  return { items: rows.map(rowToEntitlement), total, limit, offset };
}

export function listAudit({ accountId = null, limit = 50 } = {}) {
  if (accountId) {
    return db
      .prepare("SELECT * FROM entitlement_audit WHERE account_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(accountId, limit)
      .map((r) => ({
        id: r.id,
        entitlementId: r.entitlement_id,
        entitlementKey: r.entitlement_key,
        accountId: r.account_id,
        characterId: r.character_id,
        action: r.action,
        actor: r.actor,
        detail: r.detail_json ? JSON.parse(r.detail_json) : null,
        correlationId: r.correlation_id,
        createdAt: r.created_at,
      }));
  }
  return db
    .prepare("SELECT * FROM entitlement_audit ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map((r) => ({
      id: r.id,
      entitlementId: r.entitlement_id,
      entitlementKey: r.entitlement_key,
      accountId: r.account_id,
      characterId: r.character_id,
      action: r.action,
      actor: r.actor,
      detail: r.detail_json ? JSON.parse(r.detail_json) : null,
      correlationId: r.correlation_id,
      createdAt: r.created_at,
    }));
}

export function listDueExpirations(nowIso = clock.nowIso(), limit = 100) {
  return db
    .prepare(
      `SELECT * FROM entitlements
       WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?
       ORDER BY expires_at ASC LIMIT ?`
    )
    .all(nowIso, limit)
    .map(rowToEntitlement);
}

export function upsertPurchaseVerification(row) {
  const now = clock.nowIso();
  const existing = db
    .prepare("SELECT id FROM external_purchase_verifications WHERE provider = ? AND external_transaction_id = ?")
    .get(row.provider, row.externalTransactionId);
  if (existing) {
    db.prepare(
      `UPDATE external_purchase_verifications SET status = ?, verification_result_json = ?, account_id = ?,
       updated_at = ?, product_id = COALESCE(?, product_id) WHERE id = ?`
    ).run(
      row.status,
      JSON.stringify(row.result || {}),
      row.accountId || null,
      now,
      row.productId || null,
      existing.id
    );
    return existing.id;
  }
  const id = nanoid();
  db.prepare(
    `INSERT INTO external_purchase_verifications
     (id, provider, product_id, external_transaction_id, account_id, status, verification_result_json, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    row.provider,
    row.productId || null,
    row.externalTransactionId,
    row.accountId || null,
    row.status,
    JSON.stringify(row.result || {}),
    row.idempotencyKey || null,
    now,
    now
  );
  return id;
}

export function getStatusHistory(entitlementId, limit = 50) {
  return db
    .prepare("SELECT * FROM entitlement_status_history WHERE entitlement_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(entitlementId, limit)
    .map((r) => ({
      id: r.id,
      entitlementId: r.entitlement_id,
      previousStatus: r.previous_status,
      newStatus: r.new_status,
      actor: r.actor,
      reason: r.reason,
      detail: r.detail_json ? JSON.parse(r.detail_json) : null,
      createdAt: r.created_at,
    }));
}
