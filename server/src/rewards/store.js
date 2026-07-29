/**
 * Durable reward claim ledger (SQLite).
 * Domain uniqueness via claim_key; idempotency via idempotency_key.
 */

import { db } from "../db.js";
import { clock } from "../shared/time/clock.js";
import { nanoid } from "nanoid";

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_claims (
      id TEXT PRIMARY KEY,
      claim_key TEXT NOT NULL UNIQUE,
      idempotency_key TEXT UNIQUE,
      account_id TEXT NOT NULL,
      character_id TEXT,
      reward_source TEXT NOT NULL,
      source_reference_type TEXT,
      source_reference_id TEXT,
      status TEXT NOT NULL,
      definition_key TEXT,
      definition_version INTEGER NOT NULL DEFAULT 1,
      generated_payload_json TEXT,
      delivered_payload_json TEXT,
      delivery_destination TEXT,
      correlation_id TEXT,
      request_hash TEXT,
      suspicious_fields_json TEXT,
      last_error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      created_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reward_claims_account ON reward_claims(account_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_reward_claims_source ON reward_claims(reward_source, source_reference_id);
    CREATE INDEX IF NOT EXISTS idx_reward_claims_status ON reward_claims(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_reward_claims_character ON reward_claims(character_id, created_at);

    CREATE TABLE IF NOT EXISTS reward_claim_audit (
      id TEXT PRIMARY KEY,
      claim_id TEXT,
      claim_key TEXT,
      action TEXT NOT NULL,
      actor TEXT,
      detail_json TEXT,
      correlation_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reward_audit_created ON reward_claim_audit(created_at);
    CREATE INDEX IF NOT EXISTS idx_reward_audit_claim ON reward_claim_audit(claim_id);

    CREATE TABLE IF NOT EXISTS reward_outbox (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reward_pending_loot (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      claim_id TEXT,
      claim_key TEXT,
      item_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pending_loot_char
      ON reward_pending_loot(character_id, status);
  `);
}

ensureSchema();

function rowToClaim(row) {
  if (!row) return null;
  return {
    id: row.id,
    claimKey: row.claim_key,
    idempotencyKey: row.idempotency_key,
    accountId: row.account_id,
    characterId: row.character_id,
    rewardSource: row.reward_source,
    sourceReferenceType: row.source_reference_type,
    sourceReferenceId: row.source_reference_id,
    status: row.status,
    definitionKey: row.definition_key,
    definitionVersion: row.definition_version,
    generatedPayload: row.generated_payload_json ? JSON.parse(row.generated_payload_json) : null,
    deliveredPayload: row.delivered_payload_json ? JSON.parse(row.delivered_payload_json) : null,
    deliveryDestination: row.delivery_destination,
    correlationId: row.correlation_id,
    requestHash: row.request_hash,
    suspiciousFields: row.suspicious_fields_json ? JSON.parse(row.suspicious_fields_json) : null,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
  };
}

export function auditReward({
  claimId = null,
  claimKey = null,
  action,
  actor = "system",
  detail = null,
  correlationId = null,
}) {
  db.prepare(
    `INSERT INTO reward_claim_audit
     (id, claim_id, claim_key, action, actor, detail_json, correlation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nanoid(),
    claimId,
    claimKey,
    action,
    actor,
    detail ? JSON.stringify(detail) : null,
    correlationId,
    clock.nowIso()
  );
}

export function emitRewardEvent(eventType, payload) {
  db.prepare(
    `INSERT INTO reward_outbox (id, event_type, payload_json, status, created_at)
     VALUES (?, ?, ?, 'pending', ?)`
  ).run(nanoid(), eventType, JSON.stringify(payload), clock.nowIso());
}

export function getClaimByKey(claimKey) {
  return rowToClaim(db.prepare("SELECT * FROM reward_claims WHERE claim_key = ?").get(claimKey));
}

export function getClaimByIdempotencyKey(key) {
  if (!key) return null;
  return rowToClaim(db.prepare("SELECT * FROM reward_claims WHERE idempotency_key = ?").get(key));
}

export function getClaimById(id) {
  return rowToClaim(db.prepare("SELECT * FROM reward_claims WHERE id = ?").get(id));
}

export function insertClaim(input) {
  const id = input.id || nanoid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO reward_claims (
      id, claim_key, idempotency_key, account_id, character_id, reward_source,
      source_reference_type, source_reference_id, status, definition_key, definition_version,
      generated_payload_json, delivered_payload_json, delivery_destination,
      correlation_id, request_hash, suspicious_fields_json, last_error_code,
      created_at, updated_at, completed_at, created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    input.claimKey,
    input.idempotencyKey || null,
    input.accountId,
    input.characterId || null,
    input.rewardSource,
    input.sourceReferenceType || null,
    input.sourceReferenceId || null,
    input.status || "pending",
    input.definitionKey || null,
    input.definitionVersion ?? 1,
    input.generatedPayload ? JSON.stringify(input.generatedPayload) : null,
    input.deliveredPayload ? JSON.stringify(input.deliveredPayload) : null,
    input.deliveryDestination || "character",
    input.correlationId || null,
    input.requestHash || null,
    input.suspiciousFields ? JSON.stringify(input.suspiciousFields) : null,
    input.lastErrorCode || null,
    now,
    now,
    input.completedAt || null,
    input.createdBy || "system"
  );
  return getClaimById(id);
}

export function updateClaim(id, patch) {
  const cur = getClaimById(id);
  if (!cur) return null;
  const now = clock.nowIso();
  db.prepare(
    `UPDATE reward_claims SET
      status = COALESCE(?, status),
      generated_payload_json = COALESCE(?, generated_payload_json),
      delivered_payload_json = COALESCE(?, delivered_payload_json),
      delivery_destination = COALESCE(?, delivery_destination),
      last_error_code = COALESCE(?, last_error_code),
      completed_at = COALESCE(?, completed_at),
      updated_at = ?
     WHERE id = ?`
  ).run(
    patch.status ?? null,
    patch.generatedPayload != null ? JSON.stringify(patch.generatedPayload) : null,
    patch.deliveredPayload != null ? JSON.stringify(patch.deliveredPayload) : null,
    patch.deliveryDestination ?? null,
    patch.lastErrorCode ?? null,
    patch.completedAt ?? null,
    now,
    id
  );
  return getClaimById(id);
}

export function searchClaims({
  accountId = null,
  characterId = null,
  rewardSource = null,
  status = null,
  claimKey = null,
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
  if (rewardSource) {
    clauses.push("reward_source = ?");
    params.push(rewardSource);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (claimKey) {
    clauses.push("claim_key = ?");
    params.push(claimKey);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const items = db
    .prepare(`SELECT * FROM reward_claims ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, Math.min(200, limit), offset)
    .map(rowToClaim);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM reward_claims ${where}`).get(...params).c;
  return { items, total, limit, offset };
}

export function listRewardAudit({ claimId = null, limit = 50 } = {}) {
  if (claimId) {
    return db
      .prepare("SELECT * FROM reward_claim_audit WHERE claim_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(claimId, limit)
      .map((r) => ({
        id: r.id,
        claimId: r.claim_id,
        claimKey: r.claim_key,
        action: r.action,
        actor: r.actor,
        detail: r.detail_json ? JSON.parse(r.detail_json) : null,
        correlationId: r.correlation_id,
        createdAt: r.created_at,
      }));
  }
  return db
    .prepare("SELECT * FROM reward_claim_audit ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map((r) => ({
      id: r.id,
      claimId: r.claim_id,
      claimKey: r.claim_key,
      action: r.action,
      actor: r.actor,
      detail: r.detail_json ? JSON.parse(r.detail_json) : null,
      correlationId: r.correlation_id,
      createdAt: r.created_at,
    }));
}

/** Build stable domain claim keys. */
export const ClaimKeys = {
  mission: (missionId) => `mission:${missionId}`,
  daily: (characterId, periodKey) => `daily:${characterId}:${periodKey}`,
  mail: (mailId) => `mail:${mailId}`,
  promo: (accountId, code) => `promo:${accountId}:${String(code).toUpperCase()}`,
  admin: (idempotencyKey) => `admin:${idempotencyKey}`,
  weekly: (characterId, weekKey, questId) => `weekly:${characterId}:${weekKey}:${questId}`,
  arena: (characterId, battleKey) => `arena:${characterId}:${battleKey}`,
};

function rowToPending(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    characterId: row.character_id,
    claimId: row.claim_id,
    claimKey: row.claim_key,
    item: JSON.parse(row.item_json),
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

/** Persist overflow loot server-side — clients may preview but cannot forge grants. */
export function createPendingLoot({
  accountId,
  characterId,
  claimId = null,
  claimKey = null,
  item,
}) {
  const id = nanoid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO reward_pending_loot
     (id, account_id, character_id, claim_id, claim_key, item_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, accountId, characterId, claimId, claimKey, JSON.stringify(item), now);
  return rowToPending(db.prepare("SELECT * FROM reward_pending_loot WHERE id = ?").get(id));
}

export function getPendingLoot(id) {
  return rowToPending(db.prepare("SELECT * FROM reward_pending_loot WHERE id = ?").get(id));
}

export function listPendingLootForCharacter(characterId, { status = "pending" } = {}) {
  return db
    .prepare(
      `SELECT * FROM reward_pending_loot WHERE character_id = ? AND status = ? ORDER BY created_at ASC`
    )
    .all(characterId, status)
    .map(rowToPending);
}

export function resolvePendingLoot(id, status) {
  const now = clock.nowIso();
  db.prepare(
    `UPDATE reward_pending_loot SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'`
  ).run(status, now, id);
  return getPendingLoot(id);
}
