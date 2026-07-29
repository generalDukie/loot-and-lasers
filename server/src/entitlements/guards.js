/**
 * Reusable entitlement access guards for route/function handlers.
 */

import { EntitlementError, EntitlementErrors } from "./errors.js";
import { resolveEntitlement, resolveQuantity } from "./resolve.js";
import { consumeEntitlement } from "./service.js";

export function requireEntitlement(entitlementKey, ctx = {}) {
  const result = resolveEntitlement({ entitlementKey, ...ctx, bypassCache: !!ctx.bypassCache });
  if (!result.entitled) {
    throw new EntitlementError(result.reason || EntitlementErrors.ENTITLEMENT_NOT_OWNED, "Not entitled", result);
  }
  return result;
}

export function requireAnyEntitlement(keys, ctx = {}) {
  let last = null;
  for (const key of keys) {
    const r = resolveEntitlement({ entitlementKey: key, ...ctx });
    if (r.entitled) return r;
    last = r;
  }
  throw new EntitlementError(
    last?.reason || EntitlementErrors.ENTITLEMENT_NOT_OWNED,
    "Not entitled to any required key",
    last
  );
}

export function requireAllEntitlements(keys, ctx = {}) {
  const results = [];
  for (const key of keys) {
    results.push(requireEntitlement(key, ctx));
  }
  return results;
}

export function requireEntitlementQuantity(entitlementKey, quantity, ctx = {}) {
  const q = resolveQuantity({ entitlementKey, accountId: ctx.accountId, characterId: ctx.characterId });
  if (q.quantity < quantity) {
    throw new EntitlementError(
      EntitlementErrors.ENTITLEMENT_QUANTITY_INSUFFICIENT,
      `Need ${quantity}, have ${q.quantity}`
    );
  }
  return q;
}

export function requireActiveSubscription(ctx = {}) {
  return requireEntitlement("account.subscription_membership", ctx);
}

export async function consumeEntitlementGuard(entitlementKey, quantity, commandContext) {
  return consumeEntitlement({
    entitlementKey,
    quantity,
    accountId: commandContext.accountId,
    characterId: commandContext.characterId || null,
    operationId: commandContext.operationId,
    reason: commandContext.reason || null,
    target: commandContext.target || null,
    createdBy: commandContext.createdBy || "system",
    correlationId: commandContext.correlationId || null,
  });
}
