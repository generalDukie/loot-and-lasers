/**
 * Controlled entitlement mutations — the only path that should grant/revoke/consume.
 */

import { nanoid } from "nanoid";
import { clock } from "../shared/time/clock.js";
import { requireEntitlementDefinition, isFeatureEnabled } from "./definitions.js";
import { requireProductMapping } from "./products.js";
import { EntitlementError, EntitlementErrors } from "./errors.js";
import { invalidateAccountEntitlements } from "./cache.js";
import { resolveEntitlement, resolveQuantity } from "./resolve.js";
import {
  auditEntitlement,
  emitEntitlementEvent,
  findByExternalTransaction,
  getConsumptionByOperationId,
  getEntitlementById,
  getEntitlementByIdempotencyKey,
  insertConsumption,
  insertEntitlement,
  listDueExpirations,
  updateEntitlementStatus,
} from "./store.js";

/** Keep local to avoid circular imports with economyFormulas. */
const CHARACTER_MAX_SLOTS = 3;
const BASE_CHARACTER_SLOTS = 1;

function assertSourceAllowed(def, sourceType) {
  if (Array.isArray(def.allowedSources) && !def.allowedSources.includes(sourceType)) {
    throw new EntitlementError(
      EntitlementErrors.FORBIDDEN,
      `Source ${sourceType} not allowed for ${def.key}`
    );
  }
}

/**
 * Idempotent grant. Retries with the same idempotencyKey return the existing row.
 */
export async function grantEntitlement(input) {
  const {
    entitlementKey,
    accountId,
    characterId = null,
    quantity = 1,
    sourceType,
    sourceReferenceType = null,
    sourceReferenceId = null,
    externalProvider = null,
    externalProductId = null,
    externalTransactionId = null,
    externalOriginalTransactionId = null,
    idempotencyKey,
    startsAt = null,
    expiresAt = null,
    durationMs = null,
    createdBy = "system",
    correlationId = null,
    metadata = null,
    verificationStatus = null,
    verifiedAt = null,
    status = "active",
  } = input;

  if (!accountId) throw new EntitlementError(EntitlementErrors.FORBIDDEN, "accountId required");
  if (!idempotencyKey) {
    throw new EntitlementError(EntitlementErrors.IDEMPOTENCY_KEY_REQUIRED, "idempotencyKey required");
  }

  const existing = getEntitlementByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { entitlement: existing, created: false, idempotentReplay: true };
  }

  if (externalProvider && externalTransactionId) {
    const reused = findByExternalTransaction(externalProvider, externalTransactionId);
    if (reused) {
      if (reused.accountId !== accountId) {
        throw new EntitlementError(
          EntitlementErrors.EXTERNAL_TRANSACTION_REUSED,
          "External transaction already claimed by another account"
        );
      }
      return { entitlement: reused, created: false, idempotentReplay: true };
    }
  }

  const def = requireEntitlementDefinition(entitlementKey);
  assertSourceAllowed(def, sourceType);

  if (def.scope === "character" && !characterId) {
    throw new EntitlementError(EntitlementErrors.ENTITLEMENT_SCOPE_MISMATCH, "characterId required");
  }

  if (def.stackPolicy === "unique") {
    const owned = resolveEntitlement({
      entitlementKey,
      accountId,
      characterId,
      bypassCache: true,
    });
    if (owned.entitled) {
      const ent = getEntitlementById(owned.entitlementId);
      return { entitlement: ent, created: false, alreadyOwned: true };
    }
  }

  let resolvedExpires = expiresAt;
  if (!resolvedExpires && durationMs) {
    resolvedExpires = new Date(clock.nowMs() + durationMs).toISOString();
  }

  if (def.ownershipType === "subscription" || def.stackPolicy === "extend_from_later") {
    const qty = resolveQuantity({ entitlementKey, accountId, characterId });
    if (qty.entitlementIds?.length) {
      const cur = getEntitlementById(qty.entitlementIds[0]);
      if (cur && resolvedExpires) {
        const base = Math.max(clock.nowMs(), cur.expiresAt ? new Date(cur.expiresAt).getTime() : 0);
        const add = durationMs || Math.max(0, new Date(resolvedExpires).getTime() - clock.nowMs());
        const nextExp = new Date(base + add).toISOString();
        const updated = updateEntitlementStatus(
          cur.id,
          { expiresAt: nextExp, status: "active", reason: "renewal_extend" },
          createdBy
        );
        auditEntitlement({
          entitlementId: cur.id,
          entitlementKey,
          accountId,
          characterId,
          action: "EntitlementRenewed",
          actor: createdBy,
          detail: { expiresAt: nextExp },
          correlationId,
        });
        emitEntitlementEvent("EntitlementRenewed", {
          entitlementId: cur.id,
          entitlementKey,
          accountId,
          expiresAt: nextExp,
        });
        invalidateAccountEntitlements(accountId);
        return { entitlement: updated, created: false, renewed: true };
      }
    }
  }

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  if (def.maximumQuantity != null) {
    const current = resolveQuantity({ entitlementKey, accountId, characterId });
    if (current.quantity + qty > def.maximumQuantity) {
      throw new EntitlementError(
        EntitlementErrors.ENTITLEMENT_QUANTITY_INSUFFICIENT,
        `Would exceed maximumQuantity ${def.maximumQuantity}`
      );
    }
  }

  const grantCommandId = nanoid();

  // Re-check idempotency (callers may wrap in a transaction)
  const again = getEntitlementByIdempotencyKey(idempotencyKey);
  if (again) return { entitlement: again, created: false, idempotentReplay: true };

  const row = insertEntitlement({
    entitlementKey,
    accountId,
    characterId: def.scope === "character" ? characterId : null,
    scope: def.scope,
    status,
    quantity: qty,
    sourceType,
    sourceReferenceType,
    sourceReferenceId,
    externalProvider,
    externalProductId,
    externalTransactionId,
    externalOriginalTransactionId,
    grantCommandId,
    idempotencyKey,
    startsAt: startsAt || clock.nowIso(),
    expiresAt: resolvedExpires,
    createdBy,
    correlationId,
    metadata,
    verificationStatus,
    verifiedAt,
  });

  auditEntitlement({
    entitlementId: row.id,
    entitlementKey,
    accountId,
    characterId,
    action: "EntitlementGranted",
    actor: createdBy,
    detail: {
      sourceType,
      quantity: qty,
      expiresAt: resolvedExpires,
      externalProvider,
      externalTransactionRef: externalTransactionId
        ? `${String(externalTransactionId).slice(0, 8)}…`
        : null,
    },
    correlationId,
  });
  emitEntitlementEvent("EntitlementGranted", {
    entitlementId: row.id,
    entitlementKey,
    accountId,
    characterId,
    sourceType,
    quantity: qty,
  });

  invalidateAccountEntitlements(accountId);
  return { entitlement: row, created: true };
}

export async function grantProductBundle({
  productId,
  accountId,
  characterId = null,
  sourceType,
  idempotencyKey,
  externalProvider = null,
  externalTransactionId = null,
  createdBy = "system",
  correlationId = null,
  verificationStatus = "verified",
  verifiedAt = null,
}) {
  const mapping = requireProductMapping(productId);
  const results = [];
  for (let i = 0; i < mapping.grants.length; i++) {
    const g = mapping.grants[i];
    const r = await grantEntitlement({
      entitlementKey: g.entitlementKey,
      accountId,
      characterId,
      quantity: g.quantity || 1,
      durationMs: g.durationMs || null,
      sourceType,
      sourceReferenceType: "product",
      sourceReferenceId: productId,
      externalProvider: externalProvider || mapping.provider,
      externalProductId: productId,
      externalTransactionId,
      idempotencyKey: `${idempotencyKey}:${g.entitlementKey}:${i}`,
      createdBy,
      correlationId,
      verificationStatus,
      verifiedAt,
    });
    results.push(r);
  }
  auditEntitlement({
    entitlementKey: productId,
    accountId,
    action: "BundleGranted",
    actor: createdBy,
    detail: { productId, components: results.map((r) => r.entitlement?.id) },
    correlationId,
  });
  return { productId, grants: results };
}

export async function revokeEntitlement({
  entitlementId,
  actor,
  reason,
  status = "revoked",
  correlationId = null,
}) {
  if (!reason) throw new EntitlementError(EntitlementErrors.REASON_REQUIRED, "reason required");
  const cur = getEntitlementById(entitlementId);
  if (!cur) throw new EntitlementError(EntitlementErrors.ENTITLEMENT_NOT_FOUND, "Not found");
  if (cur.status === status) {
    return { entitlement: cur, changed: false };
  }
  const updated = updateEntitlementStatus(
    entitlementId,
    {
      status,
      revokedAt: clock.nowIso(),
      revokedBy: actor,
      revocationReason: reason,
      reason,
    },
    actor
  );
  auditEntitlement({
    entitlementId,
    entitlementKey: cur.entitlementKey,
    accountId: cur.accountId,
    characterId: cur.characterId,
    action: status === "refunded" ? "EntitlementRefunded" : status === "chargeback" ? "EntitlementChargebackReceived" : "EntitlementRevoked",
    actor,
    detail: { reason, previousStatus: cur.status, newStatus: status },
    correlationId,
  });
  emitEntitlementEvent("EntitlementRevoked", {
    entitlementId,
    entitlementKey: cur.entitlementKey,
    accountId: cur.accountId,
    status,
  });
  invalidateAccountEntitlements(cur.accountId);
  return { entitlement: updated, changed: true };
}

export async function suspendEntitlement({ entitlementId, actor, reason, correlationId = null }) {
  if (!reason) throw new EntitlementError(EntitlementErrors.REASON_REQUIRED, "reason required");
  const cur = getEntitlementById(entitlementId);
  if (!cur) throw new EntitlementError(EntitlementErrors.ENTITLEMENT_NOT_FOUND, "Not found");
  if (cur.status === "suspended") return { entitlement: cur, changed: false };
  const updated = updateEntitlementStatus(
    entitlementId,
    { status: "suspended", suspendedAt: clock.nowIso(), reason },
    actor
  );
  auditEntitlement({
    entitlementId,
    entitlementKey: cur.entitlementKey,
    accountId: cur.accountId,
    action: "EntitlementSuspended",
    actor,
    detail: { reason },
    correlationId,
  });
  invalidateAccountEntitlements(cur.accountId);
  return { entitlement: updated, changed: true };
}

export async function restoreEntitlement({ entitlementId, actor, reason, correlationId = null }) {
  if (!reason) throw new EntitlementError(EntitlementErrors.REASON_REQUIRED, "reason required");
  const cur = getEntitlementById(entitlementId);
  if (!cur) throw new EntitlementError(EntitlementErrors.ENTITLEMENT_NOT_FOUND, "Not found");
  const updated = updateEntitlementStatus(
    entitlementId,
    { status: "active", restoredAt: clock.nowIso(), reason },
    actor
  );
  auditEntitlement({
    entitlementId,
    entitlementKey: cur.entitlementKey,
    accountId: cur.accountId,
    action: "EntitlementRestored",
    actor,
    detail: { reason, previousStatus: cur.status },
    correlationId,
  });
  invalidateAccountEntitlements(cur.accountId);
  return { entitlement: updated, changed: true };
}

/**
 * Atomic consumable spend. operationId provides idempotency.
 */
export async function consumeEntitlement({
  entitlementKey,
  accountId,
  characterId = null,
  quantity = 1,
  operationId,
  reason = null,
  target = null,
  createdBy = "system",
  correlationId = null,
}) {
  if (!operationId) {
    throw new EntitlementError(EntitlementErrors.IDEMPOTENCY_KEY_REQUIRED, "operationId required");
  }
  const prior = getConsumptionByOperationId(operationId);
  if (prior) {
    return { consumed: false, idempotentReplay: true, consumption: prior, entitlement: getEntitlementById(prior.entitlement_id) };
  }

  const def = requireEntitlementDefinition(entitlementKey);
  if (!def.consumable) {
    throw new EntitlementError(EntitlementErrors.FORBIDDEN, "Entitlement is not consumable");
  }

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));

  const again = getConsumptionByOperationId(operationId);
  if (again) {
    return {
      consumed: false,
      idempotentReplay: true,
      consumption: again,
      entitlement: getEntitlementById(again.entitlement_id),
    };
  }
  const owned = resolveQuantity({ entitlementKey, accountId, characterId });
  if (owned.quantity < qty) {
    throw new EntitlementError(
      EntitlementErrors.ENTITLEMENT_QUANTITY_INSUFFICIENT,
      "Insufficient entitlement quantity"
    );
  }
  const ent = getEntitlementById(owned.entitlementIds[0]);
  const nextConsumed = ent.consumedQuantity + qty;
  if (nextConsumed > ent.quantity) {
    throw new EntitlementError(EntitlementErrors.ENTITLEMENT_QUANTITY_INSUFFICIENT, "Would go negative");
  }
  const status = nextConsumed >= ent.quantity ? "consumed" : "active";
  const updated = updateEntitlementStatus(
    ent.id,
    { consumedQuantity: nextConsumed, status, reason: reason || "consume" },
    createdBy
  );
  insertConsumption({
    entitlementId: ent.id,
    accountId,
    quantity: qty,
    operationId,
    reason,
    target,
    createdBy,
  });
  auditEntitlement({
    entitlementId: ent.id,
    entitlementKey,
    accountId,
    characterId,
    action: "EntitlementConsumed",
    actor: createdBy,
    detail: { quantity: qty, operationId, reason },
    correlationId,
  });
  emitEntitlementEvent("EntitlementConsumed", {
    entitlementId: ent.id,
    entitlementKey,
    accountId,
    quantity: qty,
    operationId,
  });

  invalidateAccountEntitlements(accountId);
  return { consumed: true, entitlement: updated };
}

export function resolveCharacterSlotCapacity(accountId) {
  const extra = resolveQuantity({
    entitlementKey: "account.character_slot",
    accountId,
  });
  const capacity = Math.min(CHARACTER_MAX_SLOTS, BASE_CHARACTER_SLOTS + extra.quantity);
  return {
    base: BASE_CHARACTER_SLOTS,
    extra: extra.quantity,
    capacity,
    max: CHARACTER_MAX_SLOTS,
  };
}

export function assertCanCreateCharacter(accountId, currentCount) {
  if (!isFeatureEnabled("entitlement_enforcement")) {
    return resolveCharacterSlotCapacity(accountId);
  }
  const slots = resolveCharacterSlotCapacity(accountId);
  if (currentCount >= slots.capacity) {
    throw new EntitlementError(
      EntitlementErrors.CHARACTER_SLOT_LIMIT_REACHED,
      `Character slot limit reached (${slots.capacity})`
    );
  }
  return slots;
}

export function processExpiredEntitlements(limit = 100) {
  const due = listDueExpirations(clock.nowIso(), limit);
  let n = 0;
  for (const ent of due) {
    updateEntitlementStatus(ent.id, { status: "expired", reason: "expiration_worker" }, "system");
    auditEntitlement({
      entitlementId: ent.id,
      entitlementKey: ent.entitlementKey,
      accountId: ent.accountId,
      action: "EntitlementExpired",
      actor: "system",
      detail: { expiresAt: ent.expiresAt },
    });
    emitEntitlementEvent("EntitlementExpired", {
      entitlementId: ent.id,
      entitlementKey: ent.entitlementKey,
      accountId: ent.accountId,
    });
    invalidateAccountEntitlements(ent.accountId);
    n += 1;
  }
  return { expired: n };
}
