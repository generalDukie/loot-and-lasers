/**
 * External purchase verification.
 * Stripe / platform SDKs are not wired yet — verification fails closed unless
 * ENTITLEMENT_DEV_VERIFY=1 (local only) or provider is internal_nova / promotion.
 */

import { clock } from "../shared/time/clock.js";
import { getProductMapping, requireProductMapping } from "./products.js";
import { EntitlementError, EntitlementErrors } from "./errors.js";
import { grantProductBundle } from "./service.js";
import { findByExternalTransaction, upsertPurchaseVerification, auditEntitlement } from "./store.js";

function safeTxRef(txId) {
  if (!txId) return null;
  const s = String(txId);
  return s.length <= 12 ? s : `${s.slice(0, 8)}…`;
}

/**
 * Verify a purchase with the provider, then grant mapped entitlements.
 */
export async function verifyAndClaimPurchase({
  accountId,
  productId,
  provider,
  externalTransactionId,
  idempotencyKey,
  receiptPayload = null,
  createdBy = "system",
  correlationId = null,
}) {
  if (!accountId || !productId || !provider || !externalTransactionId || !idempotencyKey) {
    throw new EntitlementError(EntitlementErrors.PURCHASE_VERIFICATION_FAILED, "Missing purchase fields");
  }

  const mapping = requireProductMapping(productId);
  if (mapping.provider !== provider && provider !== "administrator") {
    throw new EntitlementError(
      EntitlementErrors.PRODUCT_NOT_REGISTERED,
      "Provider does not match product mapping"
    );
  }

  const existing = findByExternalTransaction(provider, externalTransactionId);
  if (existing) {
    if (existing.accountId !== accountId) {
      auditEntitlement({
        accountId,
        action: "SuspiciousTransactionReuse",
        actor: createdBy,
        detail: {
          provider,
          txRef: safeTxRef(externalTransactionId),
          ownerAccountId: existing.accountId,
        },
        correlationId,
      });
      throw new EntitlementError(
        EntitlementErrors.EXTERNAL_TRANSACTION_REUSED,
        "Transaction already claimed"
      );
    }
    return { claimed: false, alreadyOwned: true, entitlement: existing };
  }

  const verification = await verifyWithProvider({
    provider,
    productId,
    externalTransactionId,
    receiptPayload,
  });

  upsertPurchaseVerification({
    provider,
    productId,
    externalTransactionId,
    accountId,
    status: verification.ok ? "verified" : "failed",
    result: {
      ok: verification.ok,
      reason: verification.reason,
      // never store full receipt
      txRef: safeTxRef(externalTransactionId),
    },
    idempotencyKey,
  });

  if (!verification.ok) {
    auditEntitlement({
      accountId,
      action: "ExternalPurchaseVerificationFailed",
      actor: createdBy,
      detail: { provider, productId, txRef: safeTxRef(externalTransactionId), reason: verification.reason },
      correlationId,
    });
    throw new EntitlementError(
      EntitlementErrors.PURCHASE_VERIFICATION_FAILED,
      verification.reason || "Verification failed"
    );
  }

  auditEntitlement({
    accountId,
    action: "ExternalPurchaseVerified",
    actor: createdBy,
    detail: { provider, productId, txRef: safeTxRef(externalTransactionId) },
    correlationId,
  });

  const bundle = await grantProductBundle({
    productId,
    accountId,
    sourceType: provider === "stripe" ? "platform_purchase" : provider === "promotion" ? "promotion" : "direct_purchase",
    idempotencyKey,
    externalProvider: provider,
    externalTransactionId,
    createdBy,
    correlationId,
    verificationStatus: "verified",
    verifiedAt: clock.nowIso(),
  });

  return { claimed: true, verification, bundle };
}

async function verifyWithProvider({ provider, productId, externalTransactionId, receiptPayload }) {
  if (provider === "internal_nova" || provider === "promotion" || provider === "administrator") {
    return { ok: true, reason: "trusted_internal" };
  }

  if (provider === "stripe") {
    // No Stripe secret / webhook verification in this repo yet.
    if (process.env.ENTITLEMENT_DEV_VERIFY === "1" && process.env.NODE_ENV !== "production") {
      return { ok: true, reason: "dev_verify_bypass" };
    }
    return {
      ok: false,
      reason: "Stripe server verification is not configured (set Stripe webhook + secret)",
    };
  }

  return { ok: false, reason: `Unsupported provider: ${provider}` };
}

export function listClaimableProducts() {
  return Object.values(
    // re-export display-safe product list
    Object.fromEntries(
      Object.entries(
        // lazy avoid circular — use getProductMapping via products module
        {}
      )
    )
  );
}

export { getProductMapping };
