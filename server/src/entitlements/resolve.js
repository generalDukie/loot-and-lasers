/**
 * Authoritative entitlement resolution.
 * Precedence: unknown → scope → revoked → refund/chargeback → suspended →
 * verification → not started → expired → consumed → feature → platform → active.
 */

import { clock } from "../shared/time/clock.js";
import {
  getEntitlementDefinition,
  isFeatureEnabled,
} from "./definitions.js";
import { EntitlementErrors } from "./errors.js";
import { listEntitlementsByKey } from "./store.js";
import { getCachedResolution, setCachedResolution } from "./cache.js";

function evaluateRecord(rec, def, nowMs, { characterId = null, platform = null } = {}) {
  if (!rec) {
    return { entitled: false, reason: EntitlementErrors.ENTITLEMENT_NOT_OWNED, status: "missing" };
  }

  if (def.scope === "character") {
    if (!characterId || rec.characterId !== characterId) {
      return {
        entitled: false,
        reason: EntitlementErrors.ENTITLEMENT_SCOPE_MISMATCH,
        status: rec.status,
        entitlementId: rec.id,
      };
    }
  }

  if (rec.status === "revoked") {
    return { entitled: false, reason: EntitlementErrors.ENTITLEMENT_REVOKED, status: "revoked", entitlementId: rec.id };
  }
  if (rec.status === "refunded") {
    return { entitled: false, reason: EntitlementErrors.ENTITLEMENT_REFUNDED, status: "refunded", entitlementId: rec.id };
  }
  if (rec.status === "chargeback") {
    return { entitled: false, reason: EntitlementErrors.ENTITLEMENT_CHARGEBACK, status: "chargeback", entitlementId: rec.id };
  }
  if (rec.status === "suspended") {
    return { entitled: false, reason: EntitlementErrors.ENTITLEMENT_SUSPENDED, status: "suspended", entitlementId: rec.id };
  }
  if (rec.status === "verification_failed" || rec.verificationStatus === "failed") {
    return {
      entitled: false,
      reason: EntitlementErrors.PURCHASE_VERIFICATION_FAILED,
      status: rec.status,
      entitlementId: rec.id,
    };
  }
  if (rec.status === "pending") {
    return {
      entitled: false,
      reason: EntitlementErrors.PURCHASE_VERIFICATION_REQUIRED,
      status: "pending",
      entitlementId: rec.id,
    };
  }

  if (rec.startsAt && new Date(rec.startsAt).getTime() > nowMs) {
    return {
      entitled: false,
      reason: EntitlementErrors.ENTITLEMENT_NOT_STARTED,
      status: rec.status,
      entitlementId: rec.id,
      startsAt: rec.startsAt,
    };
  }
  if (rec.expiresAt && new Date(rec.expiresAt).getTime() <= nowMs) {
    return {
      entitled: false,
      reason: EntitlementErrors.ENTITLEMENT_EXPIRED,
      status: "expired",
      entitlementId: rec.id,
      expiresAt: rec.expiresAt,
    };
  }

  const remaining = Math.max(0, (rec.quantity || 0) - (rec.consumedQuantity || 0));
  if (def.consumable && remaining <= 0) {
    return {
      entitled: false,
      reason: EntitlementErrors.ENTITLEMENT_CONSUMED,
      status: "consumed",
      entitlementId: rec.id,
      quantityAvailable: 0,
    };
  }

  if (Array.isArray(def.requiredFeatureFlags)) {
    for (const flag of def.requiredFeatureFlags) {
      if (!isFeatureEnabled(flag)) {
        return {
          entitled: false,
          reason: EntitlementErrors.ENTITLEMENT_FEATURE_DISABLED,
          status: rec.status,
          entitlementId: rec.id,
          featureFlag: flag,
        };
      }
    }
  }

  if (def.requiredPlatform && platform && def.requiredPlatform !== platform) {
    return {
      entitled: false,
      reason: EntitlementErrors.ENTITLEMENT_SCOPE_MISMATCH,
      status: rec.status,
      entitlementId: rec.id,
    };
  }

  if (rec.status !== "active") {
    return {
      entitled: false,
      reason: EntitlementErrors.ENTITLEMENT_INACTIVE,
      status: rec.status,
      entitlementId: rec.id,
    };
  }

  return {
    entitled: true,
    reason: "active",
    status: "active",
    entitlementId: rec.id,
    quantityAvailable: def.consumable ? remaining : rec.quantity,
    quantityConsumed: rec.consumedQuantity,
    source: rec.sourceType,
    startsAt: rec.startsAt,
    expiresAt: rec.expiresAt,
    matchedScope: def.scope,
    version: rec.version,
  };
}

/**
 * Resolve whether an account/character is entitled to a key.
 */
export function resolveEntitlement({
  entitlementKey,
  accountId,
  characterId = null,
  platform = null,
  now = clock.now(),
  bypassCache = false,
  correlationId = null,
} = {}) {
  const evaluatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);

  const def = getEntitlementDefinition(entitlementKey);
  if (!def) {
    return {
      entitled: false,
      reason: EntitlementErrors.ENTITLEMENT_UNKNOWN_KEY,
      status: "unknown",
      entitlementKey,
      evaluatedAt,
      correlationId,
    };
  }

  const cacheKey = `${accountId}|${characterId || ""}|${entitlementKey}`;
  if (!bypassCache) {
    const cached = getCachedResolution(cacheKey);
    if (cached) return { ...cached, evaluatedAt, fromCache: true };
  }

  const records = listEntitlementsByKey(accountId, entitlementKey, characterId);
  // Prefer the best active-like record
  let best = null;
  for (const rec of records) {
    const result = evaluateRecord(rec, def, nowMs, { characterId, platform });
    if (result.entitled) {
      best = {
        ...result,
        entitlementKey,
        evaluatedAt,
        correlationId,
      };
      break;
    }
    if (!best) {
      best = { ...result, entitlementKey, evaluatedAt, correlationId };
    }
  }

  if (!best) {
    best = {
      entitled: false,
      reason: EntitlementErrors.ENTITLEMENT_NOT_OWNED,
      status: "missing",
      entitlementKey,
      evaluatedAt,
      correlationId,
    };
  }

  setCachedResolution(cacheKey, best);
  return best;
}

/** Sum remaining quantity across active matching records. */
export function resolveQuantity({
  entitlementKey,
  accountId,
  characterId = null,
  now = clock.now(),
} = {}) {
  const def = getEntitlementDefinition(entitlementKey);
  if (!def) return { entitled: false, quantity: 0, reason: EntitlementErrors.ENTITLEMENT_UNKNOWN_KEY };

  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const records = listEntitlementsByKey(accountId, entitlementKey, characterId);
  let quantity = 0;
  const entitlementIds = [];
  for (const rec of records) {
    const ev = evaluateRecord(rec, def, nowMs, { characterId });
    if (!ev.entitled) continue;
    quantity += ev.quantityAvailable || 0;
    entitlementIds.push(rec.id);
  }
  return {
    entitled: quantity > 0 || (!def.consumable && entitlementIds.length > 0),
    quantity,
    entitlementIds,
    entitlementKey,
  };
}

export function toClientSafeEntitlement(rec, def) {
  return {
    entitlementKey: rec.entitlementKey,
    owned: true,
    status: rec.status,
    scope: rec.scope,
    quantityAvailable: Math.max(0, rec.quantity - rec.consumedQuantity),
    startsAt: rec.startsAt,
    expiresAt: rec.expiresAt,
    displayName: def?.displayName || rec.entitlementKey,
    category: def?.category || null,
  };
}
