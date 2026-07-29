/**
 * Admin + recovery routes for reward claims.
 */

import { requireAuth } from "../auth.js";
import { isAdmin } from "../entityAccess.js";
import { nanoid } from "nanoid";
import {
  searchClaims,
  getClaimById,
  listRewardAudit,
  grantAdminReward,
  listRewardDefinitions,
  RewardSources,
  RewardError,
  RewardErrors,
  listPendingLootForCharacter,
  auditReward,
  emitRewardEvent,
} from "../rewards/index.js";
import { updateClaim } from "../rewards/store.js";
import { entities, createService } from "../entities.js";
import { applyCharacterRewards } from "../shared/rewards.js";

function adminOnly(req, res) {
  if (!isAdmin(req.user)) {
    res.status(403).json({ error: "Admin only", code: RewardErrors.FORBIDDEN });
    return false;
  }
  return true;
}

function handleErr(res, err) {
  const code = err.code || RewardErrors.REWARD_DELIVERY_FAILED;
  const status =
    code === RewardErrors.FORBIDDEN
      ? 403
      : code === RewardErrors.REWARD_NOT_FOUND
        ? 404
        : code === RewardErrors.REWARD_ALREADY_CLAIMED || code === RewardErrors.CLAIM_IN_PROGRESS
          ? 409
          : 400;
  res.status(status).json({ error: err.message, code, details: err.details || undefined });
}

export function createRewardRouter(express) {
  const router = express.Router();

  router.get("/definitions", requireAuth, (_req, res) => {
    res.json({
      definitions: listRewardDefinitions().map((d) => ({
        key: d.key,
        version: d.version,
        sourceType: d.sourceType,
        displayName: d.displayName,
        resolvePolicy: d.resolvePolicy,
        status: d.status,
      })),
      sources: Object.values(RewardSources),
    });
  });

  /** Player: list own pending overflow loot (ids + preview). */
  router.get("/pending-loot", requireAuth, (req, res) => {
    const characterId = req.query.characterId || req.user.active_character_id;
    if (!characterId) return res.status(400).json({ error: "characterId required" });
    const ch = entities.Character.get(characterId);
    if (!ch || ch.created_by_id !== req.user.id) {
      return res.status(403).json({
        error: "Not your character",
        code: RewardErrors.CHARACTER_NOT_OWNED,
      });
    }
    const items = listPendingLootForCharacter(characterId).map((p) => ({
      id: p.id,
      item: p.item,
      createdAt: p.createdAt,
    }));
    res.json({ pending_loot: items });
  });

  router.get("/admin/search", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const result = searchClaims({
      accountId: req.query.accountId || null,
      characterId: req.query.characterId || null,
      rewardSource: req.query.rewardSource || null,
      status: req.query.status || null,
      claimKey: req.query.claimKey || null,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
    res.json(result);
  });

  router.get("/admin/audit/recent", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    res.json({ audit: listRewardAudit({ limit: Number(req.query.limit) || 50 }) });
  });

  router.get("/admin/:id", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const claim = getClaimById(req.params.id);
    if (!claim) {
      return res.status(404).json({ error: "Not found", code: RewardErrors.REWARD_NOT_FOUND });
    }
    const audit = listRewardAudit({ claimId: claim.id, limit: 100 });
    res.json({ claim, audit });
  });

  router.post("/admin/grant", requireAuth, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const body = req.body || {};
      const result = await grantAdminReward({
        accountId: body.accountId,
        characterId: body.characterId,
        rewards: body.rewards || {},
        reason: body.reason,
        idempotencyKey: body.idempotencyKey || `admin-reward:${nanoid()}`,
        actorId: req.user.email || req.user.id,
        correlationId: body.correlationId || nanoid(),
        compensation: !!body.compensation,
      });
      res.json({
        success: true,
        created: result.created,
        idempotentReplay: result.idempotentReplay,
        claim: result.claim,
        result: result.result,
      });
    } catch (err) {
      handleErr(res, err);
    }
  });

  /**
   * Retry delivery of a failed_retryable claim using the *persisted* generated payload.
   * Never regenerates / rerolls.
   */
  router.post("/admin/:id/retry-delivery", requireAuth, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const reason = String(req.body?.reason || "").trim();
      if (!reason) {
        throw new RewardError(RewardErrors.REASON_REQUIRED, "reason required");
      }
      const claim = getClaimById(req.params.id);
      if (!claim) throw new RewardError(RewardErrors.REWARD_NOT_FOUND, "Claim not found");
      if (claim.status === "completed") {
        return res.json({
          success: true,
          idempotentReplay: true,
          claim,
          result: claim.deliveredPayload,
        });
      }
      if (claim.status !== "failed_retryable" && claim.status !== "generated") {
        throw new RewardError(
          RewardErrors.REWARD_NOT_ELIGIBLE,
          `Cannot retry status ${claim.status}`
        );
      }
      if (!claim.generatedPayload) {
        throw new RewardError(
          RewardErrors.REWARD_GENERATION_FAILED,
          "No persisted generated payload"
        );
      }
      if (!claim.characterId) {
        throw new RewardError(RewardErrors.CHARACTER_NOT_OWNED, "No character on claim");
      }
      const user = { id: claim.accountId };
      const game = createService(user);
      const { patch, items, newly_unlocked } = await applyCharacterRewards(
        game,
        claim.characterId,
        claim.generatedPayload
      );
      const delivered = {
        ...claim.generatedPayload,
        applied: patch,
        items,
        newly_unlocked,
        deliveryDestination: "character",
        recovered: true,
      };
      const updated = updateClaim(claim.id, {
        status: "completed",
        deliveredPayload: delivered,
        completedAt: new Date().toISOString(),
      });
      auditReward({
        claimId: claim.id,
        claimKey: claim.claimKey,
        action: "manual_recovery",
        actor: req.user.email || req.user.id,
        detail: { reason },
      });
      emitRewardEvent("RewardDelivered", { claimId: claim.id, recovered: true });
      res.json({ success: true, claim: updated, result: delivered });
    } catch (err) {
      handleErr(res, err);
    }
  });

  return router;
}
