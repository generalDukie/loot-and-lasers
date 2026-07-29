/**
 * Centralized audit writer — all game systems should call this, not insert rows directly.
 */

import { nanoid } from "nanoid";
import { clock } from "../shared/time/clock.js";
import {
  AUDIT_VERSION,
  ActorTypes,
  AuditResults,
  AuditSeverity,
  getActionMeta,
  isKnownAction,
} from "./registry.js";
import { AuditError, AuditErrors } from "./errors.js";
import { redactValue, hashIp, maskEmail } from "./redact.js";
import {
  advanceChain,
  computeContentHash,
  getAuditById,
  getByIdempotencyKey,
  insertAnnotation,
  insertAuditRow,
  listAnnotations,
  recordExportMeta,
  searchAudits,
} from "./store.js";

const SOURCE_SERVICE = "lootandlasers-api";
const SYSTEM_VERSION = process.env.APP_VERSION || "1.0.0";
const ENVIRONMENT = process.env.NODE_ENV || "development";

const ADMIN_ACTIONS_REQUIRING_REASON = new Set([
  "currency_granted",
  "currency_removed",
  "currency_corrected",
  "item_granted_by_admin",
  "item_removed_by_admin",
  "admin_currency_grant",
  "admin_currency_removal",
  "admin_item_grant",
  "admin_player_edit",
  "admin_player_reset",
  "admin_account_update",
  "account_role_changed",
  "player_banned",
  "player_muted",
  "character_deleted",
  "character_restored",
  "compensation_mail_sent",
  "remote_config_updated",
  "moderation_filter_updated",
  "guild_leadership_transferred",
  "admin_entity_created",
  "admin_entity_updated",
  "admin_entity_deleted",
]);

function j(v) {
  if (v == null) return null;
  return JSON.stringify(redactValue(v));
}

/**
 * Record an audit entry. Safe to call inside withTransactionAsync — shares the open txn.
 *
 * @param {object} input
 * @returns {object} recorded audit entry (or prior entry on idempotent replay)
 */
export function recordAuditEntry(input = {}) {
  const action = input.action;
  if (!action || !isKnownAction(action)) {
    throw new AuditError(
      AuditErrors.UNKNOWN_ACTION,
      `Unknown audit action: ${action}`,
      400
    );
  }

  const meta = getActionMeta(action);
  if (
    ADMIN_ACTIONS_REQUIRING_REASON.has(action) &&
    !input.reasonText &&
    !input.reasonCode &&
    !input.administratorNote
  ) {
    throw new AuditError(
      AuditErrors.REASON_REQUIRED,
      `Reason required for action ${action}`,
      400
    );
  }

  if (input.idempotencyKey) {
    const existing = getByIdempotencyKey(input.idempotencyKey);
    if (existing) return { ...existing, idempotentReplay: true };
  }

  const occurredAt = clock.nowIso(); // never trust client timestamps
  const recordedAt = occurredAt;
  const id = nanoid();

  const actorType = input.actorType || ActorTypes.SYSTEM;
  const result = input.result || AuditResults.SUCCESS;
  const severity = input.severity || meta.severity || AuditSeverity.INFORMATIONAL;
  const retentionClass = input.retentionClass || meta.retention;

  const chainScope =
    input.chainScope ||
    (input.targetAccountId
      ? `account:${input.targetAccountId}`
      : input.actorAccountId
        ? `actor:${input.actorAccountId}`
        : `category:${meta.category}`);

  const hashPayload = {
    auditVersion: AUDIT_VERSION,
    category: meta.category,
    action,
    result,
    severity,
    actorType,
    actorId: input.actorId || null,
    actorAccountId: input.actorAccountId || null,
    targetType: input.targetType || null,
    targetId: input.targetId || null,
    targetAccountId: input.targetAccountId || null,
    targetCharacterId: input.targetCharacterId || null,
    subjectType: input.subjectType || null,
    subjectId: input.subjectId || null,
    beforeState: redactValue(input.beforeState),
    afterState: redactValue(input.afterState),
    changeSet: redactValue(input.changeSet),
    reasonCode: input.reasonCode || null,
    occurredAt,
  };
  const contentHash = computeContentHash(hashPayload);
  const chain = advanceChain(chainScope, contentHash);

  const row = {
    id,
    audit_version: AUDIT_VERSION,
    category: meta.category,
    action,
    result,
    severity,
    actor_type: actorType,
    actor_id: input.actorId || null,
    actor_account_id: input.actorAccountId || null,
    actor_character_id: input.actorCharacterId || null,
    target_type: input.targetType || null,
    target_id: input.targetId || null,
    target_account_id: input.targetAccountId || null,
    target_character_id: input.targetCharacterId || null,
    subject_type: input.subjectType || null,
    subject_id: input.subjectId || null,
    correlation_id: input.correlationId || null,
    causation_id: input.causationId || null,
    event_id: input.eventId || null,
    command_id: input.commandId || null,
    request_id: input.requestId || null,
    session_id: input.sessionId || null,
    source_service: input.sourceService || SOURCE_SERVICE,
    environment: input.environment || ENVIRONMENT,
    reason_code: input.reasonCode || null,
    reason_text: input.reasonText ? String(input.reasonText).slice(0, 2000) : null,
    before_state_json: j(input.beforeState),
    after_state_json: j(input.afterState),
    change_set_json: j(input.changeSet),
    metadata_json: j(input.metadata),
    ip_address_hash: input.ipAddressHash || (input.ipAddress ? hashIp(input.ipAddress) : null),
    client_platform: input.clientPlatform || null,
    client_version: input.clientVersion || null,
    administrator_note: input.administratorNote
      ? String(input.administratorNote).slice(0, 2000)
      : null,
    retention_class: retentionClass,
    created_by_system_version: SYSTEM_VERSION,
    content_hash: contentHash,
    previous_entry_hash: chain.previousEntryHash,
    chain_scope: chainScope,
    chain_sequence: chain.chainSequence,
    idempotency_key: input.idempotencyKey || null,
    occurred_at: occurredAt,
    recorded_at: recordedAt,
    hold: !!input.hold,
  };

  try {
    return insertAuditRow(row);
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE") && input.idempotencyKey) {
      const existing = getByIdempotencyKey(input.idempotencyKey);
      if (existing) return { ...existing, idempotentReplay: true };
    }
    throw new AuditError(
      AuditErrors.WRITE_FAILED,
      err.message || "Audit write failed",
      500
    );
  }
}

export function recordSuccess(input) {
  return recordAuditEntry({ ...input, result: AuditResults.SUCCESS });
}

export function recordFailure(input) {
  return recordAuditEntry({
    ...input,
    result: input.result || AuditResults.FAILED,
  });
}

export function recordAdminAction(user, input = {}) {
  return recordAuditEntry({
    ...input,
    actorType: ActorTypes.ADMINISTRATOR,
    actorId: user.id,
    actorAccountId: user.id,
    reasonText: input.reasonText || input.reason || input.administratorNote,
    administratorNote: input.administratorNote || input.reasonText || input.reason,
  });
}

export function recordCurrencyChange({
  user,
  character,
  currencyType,
  before,
  after,
  amount,
  direction,
  action,
  reasonCode,
  reasonText,
  correlationId,
  commandId,
  eventId,
  source,
  administratorNote,
  actorType,
  idempotencyKey,
}) {
  const delta = amount != null ? amount : (after ?? 0) - (before ?? 0);
  const resolvedAction =
    action ||
    (delta > 0
      ? actorType === ActorTypes.ADMINISTRATOR
        ? "currency_granted"
        : "currency_earned"
      : actorType === ActorTypes.ADMINISTRATOR
        ? "currency_removed"
        : "currency_spent");

  return recordAuditEntry({
    action: resolvedAction,
    actorType:
      actorType ||
      (user?.role === "admin" ? ActorTypes.ADMINISTRATOR : ActorTypes.PLAYER),
    actorId: user?.id || "system",
    actorAccountId: user?.id || character?.created_by_id || null,
    actorCharacterId: character?.id || null,
    targetType: "character",
    targetId: character?.id || null,
    targetAccountId: character?.created_by_id || user?.id || null,
    targetCharacterId: character?.id || null,
    subjectType: "currency",
    subjectId: currencyType,
    beforeState: { [currencyType]: before },
    afterState: { [currencyType]: after },
    changeSet: {
      amount: delta,
      currencyType,
      direction: direction || (delta >= 0 ? "credit" : "debit"),
      source: source || null,
    },
    reasonCode,
    reasonText,
    administratorNote,
    correlationId,
    commandId,
    eventId,
    idempotencyKey,
    severity:
      Math.abs(delta) >= 100000 || currencyType === "nova_crystals"
        ? actorType === ActorTypes.ADMINISTRATOR
          ? AuditSeverity.HIGH
          : AuditSeverity.MEDIUM
        : undefined,
  });
}

export function recordItemOwnershipChange({
  user,
  action,
  item,
  previousOwnerCharacterId,
  newOwnerCharacterId,
  previousLocation,
  newLocation,
  quantityBefore,
  quantityAfter,
  correlationId,
  reasonText,
  actorType,
  idempotencyKey,
}) {
  return recordAuditEntry({
    action,
    actorType:
      actorType ||
      (user?.role === "admin" ? ActorTypes.ADMINISTRATOR : ActorTypes.PLAYER),
    actorId: user?.id || "system",
    actorAccountId: user?.id || null,
    targetType: "character",
    targetId: newOwnerCharacterId || previousOwnerCharacterId,
    targetCharacterId: newOwnerCharacterId || previousOwnerCharacterId,
    subjectType: "item",
    subjectId: item?.id || null,
    beforeState: {
      ownerCharacterId: previousOwnerCharacterId || null,
      location: previousLocation || null,
      quantity: quantityBefore ?? null,
    },
    afterState: {
      ownerCharacterId: newOwnerCharacterId || null,
      location: newLocation || null,
      quantity: quantityAfter ?? null,
    },
    changeSet: {
      itemDefinitionId: item?.base_name || item?.name || null,
      rarity: item?.rarity || null,
      type: item?.type || null,
    },
    reasonText,
    correlationId,
    idempotencyKey,
    metadata: {
      itemName: item?.name || null,
    },
  });
}

export function recordModerationAction(user, input) {
  return recordAdminAction(user, {
    ...input,
    category: undefined,
  });
}

export function getAuditDetail(auditId) {
  const entry = getAuditById(auditId);
  if (!entry) return null;
  const annotations = listAnnotations(auditId);
  return { entry, annotations };
}

export function searchAuditLogs(filters) {
  return searchAudits(filters);
}

export function annotateAudit(user, auditId, note, extras = {}) {
  const entry = getAuditById(auditId);
  if (!entry) {
    throw new AuditError(AuditErrors.NOT_FOUND, "Audit entry not found", 404);
  }
  const annotation = insertAnnotation({
    auditId,
    authorId: user.id,
    authorEmail: maskEmail(user.email),
    note: String(note).slice(0, 4000),
    ...extras,
  });
  // Meta-audit once (specific action, no recursion into annotation of this)
  recordAuditEntry({
    action: "audit_annotation_created",
    actorType: ActorTypes.ADMINISTRATOR,
    actorId: user.id,
    actorAccountId: user.id,
    targetType: "audit",
    targetId: auditId,
    subjectType: "annotation",
    subjectId: annotation.annotationId,
    changeSet: { annotationId: annotation.annotationId },
    reasonText: "annotation",
    idempotencyKey: `ann:${annotation.annotationId}`,
  });
  return annotation;
}

export function exportAuditLogs(user, filters = {}) {
  const capped = { ...filters, limit: Math.min(500, Number(filters.limit) || 200), offset: 0 };
  const result = searchAudits(capped);
  const meta = recordExportMeta({
    requestedBy: user.id,
    filters: capped,
    rowCount: result.items.length,
    status: "completed",
  });
  recordAuditEntry({
    action: "audit_export_requested",
    actorType: ActorTypes.ADMINISTRATOR,
    actorId: user.id,
    actorAccountId: user.id,
    changeSet: { exportId: meta.exportId, rowCount: result.items.length },
    reasonText: "export",
    idempotencyKey: `export:${meta.exportId}`,
  });
  return { ...result, exportId: meta.exportId };
}

export function verifyAuditIntegrity(entry) {
  if (!entry?.contentHash) return { ok: false, reason: "missing_hash" };
  const hashPayload = {
    auditVersion: entry.auditVersion,
    category: entry.category,
    action: entry.action,
    result: entry.result,
    severity: entry.severity,
    actorType: entry.actorType,
    actorId: entry.actorId || null,
    actorAccountId: entry.actorAccountId || null,
    targetType: entry.targetType || null,
    targetId: entry.targetId || null,
    targetAccountId: entry.targetAccountId || null,
    targetCharacterId: entry.targetCharacterId || null,
    subjectType: entry.subjectType || null,
    subjectId: entry.subjectId || null,
    beforeState: entry.beforeState,
    afterState: entry.afterState,
    changeSet: entry.changeSet,
    reasonCode: entry.reasonCode || null,
    occurredAt: entry.occurredAt,
  };
  // Note: re-hash may differ if redaction normalization differs; treat as soft check.
  const recomputed = computeContentHash(hashPayload);
  return {
    ok: recomputed === entry.contentHash,
    stored: entry.contentHash,
    recomputed,
    chainScope: entry.chainScope,
    chainSequence: entry.chainSequence,
    previousEntryHash: entry.previousEntryHash,
  };
}
