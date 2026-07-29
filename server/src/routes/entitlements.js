/**
 * Player + admin entitlement HTTP routes.
 */

import { requireAuth } from "../auth.js";
import { isAdmin } from "../entityAccess.js";
import { nanoid } from "nanoid";
import {
  listEntitlementDefinitions,
  resolveEntitlement,
  resolveQuantity,
  resolveCharacterSlotCapacity,
  listEntitlementsForAccount,
  toClientSafeEntitlement,
  getEntitlementDefinition,
  grantEntitlement,
  revokeEntitlement,
  restoreEntitlement,
  suspendEntitlement,
  searchEntitlements,
  listAudit,
  getEntitlementById,
  getStatusHistory,
  verifyAndClaimPurchase,
  listProductMappings,
  EntitlementError,
  EntitlementErrors,
  FEATURE_FLAGS,
} from "./index.js";

function adminOnly(req, res) {
  if (!isAdmin(req.user)) {
    res.status(403).json({ error: "Admin only", code: EntitlementErrors.FORBIDDEN });
    return false;
  }
  return true;
}

function handleErr(res, err) {
  const code = err.code || EntitlementErrors.ENTITLEMENT_INACTIVE;
  const status =
    code === EntitlementErrors.FORBIDDEN
      ? 403
      : code === EntitlementErrors.ENTITLEMENT_NOT_FOUND
        ? 404
        : code === EntitlementErrors.CHARACTER_SLOT_LIMIT_REACHED
          ? 409
          : 400;
  res.status(status).json({ error: err.message, code, details: err.details || undefined });
}

export function createEntitlementRouter(express) {
  const router = express.Router();

  /** Safe ownership summary for the authenticated account. */
  router.get("/me", requireAuth, (req, res) => {
    const accountId = req.user.id;
    const characterId = req.query.characterId || req.user.active_character_id || null;
    const rows = listEntitlementsForAccount(accountId, { includeInactive: false });
    const defs = listEntitlementDefinitions({ visibleOnly: true });
    const byKey = new Map();
    for (const r of rows) {
      const def = getEntitlementDefinition(r.entitlementKey);
      if (!def?.visibleToClient) continue;
      const resolved = resolveEntitlement({
        entitlementKey: r.entitlementKey,
        accountId,
        characterId,
        bypassCache: true,
      });
      if (!resolved.entitled && r.status !== "active") continue;
      byKey.set(r.entitlementKey, {
        ...toClientSafeEntitlement(r, def),
        entitled: !!resolved.entitled,
        reason: resolved.reason,
      });
    }
    const slots = resolveCharacterSlotCapacity(accountId);
    res.json({
      entitlements: [...byKey.values()],
      characterSlots: slots,
      featureFlags: FEATURE_FLAGS,
      serverTimeUtc: new Date().toISOString(),
    });
  });

  router.get("/definitions", requireAuth, (_req, res) => {
    res.json({
      definitions: listEntitlementDefinitions({ visibleOnly: true }).map((d) => ({
        key: d.key,
        displayName: d.displayName,
        description: d.description,
        category: d.category,
        scope: d.scope,
        ownershipType: d.ownershipType,
        consumable: !!d.consumable,
      })),
    });
  });

  router.get("/check/:key", requireAuth, (req, res) => {
    const result = resolveEntitlement({
      entitlementKey: req.params.key,
      accountId: req.user.id,
      characterId: req.query.characterId || req.user.active_character_id || null,
    });
    res.json({
      entitlementKey: req.params.key,
      entitled: result.entitled,
      status: result.status,
      reason: result.reason,
      quantityAvailable: result.quantityAvailable ?? 0,
      startsAt: result.startsAt || null,
      expiresAt: result.expiresAt || null,
      evaluatedAt: result.evaluatedAt,
    });
  });

  /** Claim a verified purchase (Stripe not configured → fails closed). */
  router.post("/claim-purchase", requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const result = await verifyAndClaimPurchase({
        accountId: req.user.id,
        productId: body.productId,
        provider: body.provider,
        externalTransactionId: body.externalTransactionId,
        idempotencyKey: body.idempotencyKey || `claim:${req.user.id}:${body.externalTransactionId}`,
        receiptPayload: body.receipt || null,
        createdBy: req.user.email || req.user.id,
      });
      res.json({
        success: true,
        claimed: result.claimed,
        alreadyOwned: !!result.alreadyOwned,
        grants: (result.bundle?.grants || []).map((g) => ({
          entitlementKey: g.entitlement?.entitlementKey,
          entitlementId: g.entitlement?.id,
          created: g.created,
        })),
      });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // ── Admin ────────────────────────────────────────────────
  router.get("/admin/search", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const result = searchEntitlements({
      accountId: req.query.accountId || null,
      characterId: req.query.characterId || null,
      entitlementKey: req.query.key || null,
      status: req.query.status || null,
      sourceType: req.query.sourceType || null,
      provider: req.query.provider || null,
      externalTransactionId: req.query.externalTransactionId || null,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
    res.json(result);
  });

  router.get("/admin/products", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    res.json({ products: listProductMappings() });
  });

  router.get("/admin/audit", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    res.json({ audit: listAudit({ accountId: req.query.accountId || null, limit: Number(req.query.limit) || 50 }) });
  });

  router.get("/admin/:id", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const entitlement = getEntitlementById(req.params.id);
    if (!entitlement) return res.status(404).json({ error: "Not found", code: EntitlementErrors.ENTITLEMENT_NOT_FOUND });
    res.json({
      entitlement,
      definition: getEntitlementDefinition(entitlement.entitlementKey),
      history: getStatusHistory(entitlement.id),
    });
  });

  router.post("/admin/grant", requireAuth, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const body = req.body || {};
      if (!body.reason) {
        return res.status(400).json({ error: "reason required", code: EntitlementErrors.REASON_REQUIRED });
      }
      const highValue = [
        "account.premium_edition",
        "account.founder_status",
        "account.subscription_membership",
        "content.advanced_mission_pack",
      ].includes(body.entitlementKey);
      // All admins can grant for now; high-value requires explicit confirm flag.
      if (highValue && body.confirm !== true) {
        return res.status(400).json({
          error: "High-value grant requires confirm: true",
          code: EntitlementErrors.FORBIDDEN,
        });
      }
      const result = await grantEntitlement({
        entitlementKey: body.entitlementKey,
        accountId: body.accountId,
        characterId: body.characterId || null,
        quantity: body.quantity || 1,
        durationMs: body.durationMs || null,
        expiresAt: body.expiresAt || null,
        sourceType: "administrator",
        sourceReferenceType: "admin_grant",
        sourceReferenceId: body.reason,
        idempotencyKey: body.idempotencyKey || `admin-grant:${nanoid()}`,
        createdBy: req.user.email || req.user.id,
        metadata: { reason: body.reason },
      });
      res.status(201).json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post("/admin/:id/revoke", requireAuth, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await revokeEntitlement({
        entitlementId: req.params.id,
        actor: req.user.email || req.user.id,
        reason: req.body?.reason,
        status: req.body?.status || "revoked",
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post("/admin/:id/suspend", requireAuth, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await suspendEntitlement({
        entitlementId: req.params.id,
        actor: req.user.email || req.user.id,
        reason: req.body?.reason,
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post("/admin/:id/restore", requireAuth, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await restoreEntitlement({
        entitlementId: req.params.id,
        actor: req.user.email || req.user.id,
        reason: req.body?.reason,
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  return router;
}
