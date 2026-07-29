/**
 * Authoritative reward claim orchestration.
 * Domain uniqueness (claim_key) + idempotency_key + persisted generated payload.
 */

import { createHash } from "node:crypto";
import { assertRewardSource, detectSuspiciousRewardFields } from "./sources.js";
import { RewardError, RewardErrors } from "./errors.js";
import { validateRewardPayload } from "./limits.js";
import {
  auditReward,
  emitRewardEvent,
  getClaimByIdempotencyKey,
  getClaimByKey,
  insertClaim,
  updateClaim,
  ClaimKeys,
} from "./store.js";
import { requireRewardDefinition } from "./definitions.js";
import { applyCharacterRewards } from "../shared/rewards.js";
import { createService, entities } from "../entities.js";
import { nanoid } from "nanoid";

function hashRequest(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function isCompleted(claim) {
  return claim && (claim.status === "completed" || claim.status === "rejected");
}

/**
 * Begin a domain-unique claim, or return an existing completed/replay result.
 *
 * @param {object} opts
 * @param {string} opts.claimKey - Domain uniqueness key
 * @param {string} [opts.idempotencyKey]
 * @param {string} opts.accountId
 * @param {string} [opts.characterId]
 * @param {string} opts.rewardSource
 * @param {string} [opts.sourceReferenceType]
 * @param {string} [opts.sourceReferenceId]
 * @param {string} opts.definitionKey
 * @param {number} [opts.definitionVersion]
 * @param {string} [opts.correlationId]
 * @param {string[]} [opts.suspiciousFields]
 * @param {object} [opts.clientBody] - scanned for forbidden fields
 * @param {() => object|Promise<object>} opts.generate - produces reward payload (server-only)
 * @param {(payload: object, claim: object) => object|Promise<object>} opts.deliver - applies value
 * @param {boolean} [opts.admin]
 */
export async function executeRewardClaim(opts) {
  const {
    claimKey,
    idempotencyKey = null,
    accountId,
    characterId = null,
    rewardSource,
    sourceReferenceType = null,
    sourceReferenceId = null,
    definitionKey,
    definitionVersion = null,
    correlationId = null,
    clientBody = null,
    generate,
    deliver,
    admin = false,
    createdBy = "system",
  } = opts;

  if (!accountId) throw new RewardError(RewardErrors.FORBIDDEN, "accountId required");
  if (!claimKey) throw new RewardError(RewardErrors.REWARD_NOT_ELIGIBLE, "claimKey required");
  assertRewardSource(rewardSource);

  const suspicious =
    opts.suspiciousFields ||
    (clientBody ? detectSuspiciousRewardFields(clientBody) : []);

  if (suspicious.length) {
    auditReward({
      claimKey,
      action: "suspicious_client_payload",
      actor: accountId,
      detail: { fields: suspicious, correlationId },
      correlationId,
    });
  }

  if (idempotencyKey) {
    const byIdem = getClaimByIdempotencyKey(idempotencyKey);
    if (byIdem) {
      if (byIdem.claimKey !== claimKey && byIdem.status === "completed") {
        throw new RewardError(
          RewardErrors.IDEMPOTENCY_PAYLOAD_MISMATCH,
          "Idempotency key already used for a different claim"
        );
      }
      if (byIdem.status === "completed") {
        auditReward({
          claimId: byIdem.id,
          claimKey,
          action: "claim_replay",
          actor: accountId,
          detail: { via: "idempotency_key" },
          correlationId,
        });
        return { claim: byIdem, created: false, idempotentReplay: true, result: byIdem.deliveredPayload };
      }
    }
  }

  const existing = getClaimByKey(claimKey);
  if (existing) {
    if (existing.status === "completed") {
      auditReward({
        claimId: existing.id,
        claimKey,
        action: "duplicate_claim_blocked",
        actor: accountId,
        detail: { via: "claim_key" },
        correlationId,
      });
      return { claim: existing, created: false, idempotentReplay: true, result: existing.deliveredPayload };
    }
    if (existing.status === "delivering" || existing.status === "generated") {
      throw new RewardError(RewardErrors.CLAIM_IN_PROGRESS, "Claim already in progress");
    }
    if (existing.status === "rejected" || existing.status === "failed_final") {
      throw new RewardError(
        existing.lastErrorCode || RewardErrors.REWARD_NOT_ELIGIBLE,
        "Claim previously rejected"
      );
    }
  }

  const def = requireRewardDefinition(definitionKey, definitionVersion);
  const requestHash = hashRequest({
    claimKey,
    rewardSource,
    sourceReferenceId,
    definitionKey: def.key,
    definitionVersion: def.version,
  });

  let claim;
  try {
    claim = insertClaim({
      claimKey,
      idempotencyKey,
      accountId,
      characterId,
      rewardSource,
      sourceReferenceType,
      sourceReferenceId,
      status: "eligible",
      definitionKey: def.key,
      definitionVersion: def.version,
      correlationId,
      requestHash,
      suspiciousFields: suspicious.length ? suspicious : null,
      createdBy,
    });
  } catch (err) {
    // UNIQUE claim_key race — re-read and treat as replay / in-progress
    const raced = getClaimByKey(claimKey);
    if (raced?.status === "completed") {
      return { claim: raced, created: false, idempotentReplay: true, result: raced.deliveredPayload };
    }
    if (raced) {
      throw new RewardError(RewardErrors.CLAIM_IN_PROGRESS, "Claim already in progress");
    }
    throw err;
  }

  auditReward({
    claimId: claim.id,
    claimKey,
    action: "eligibility_accepted",
    actor: accountId,
    correlationId,
  });

  let generated;
  try {
    generated = await generate();
  } catch (err) {
    updateClaim(claim.id, {
      status: "failed_final",
      lastErrorCode: err.code || RewardErrors.REWARD_GENERATION_FAILED,
    });
    auditReward({
      claimId: claim.id,
      claimKey,
      action: "generation_failed",
      actor: accountId,
      detail: { error: err.message, code: err.code },
      correlationId,
    });
    throw err;
  }

  const limits = validateRewardPayload(generated, { admin });
  if (!limits.ok) {
    updateClaim(claim.id, {
      status: "rejected",
      lastErrorCode: RewardErrors.REWARD_LIMIT_EXCEEDED,
      generatedPayload: generated,
    });
    auditReward({
      claimId: claim.id,
      claimKey,
      action: "safety_limit_violation",
      actor: accountId,
      detail: { errors: limits.errors },
      correlationId,
    });
    throw new RewardError(RewardErrors.REWARD_LIMIT_EXCEEDED, "Reward exceeds safety limits", {
      errors: limits.errors,
    });
  }

  claim = updateClaim(claim.id, {
    status: "generated",
    generatedPayload: generated,
  });
  emitRewardEvent("RewardGenerated", {
    claimId: claim.id,
    claimKey,
    rewardSource,
    accountId,
    characterId,
  });
  auditReward({
    claimId: claim.id,
    claimKey,
    action: "reward_generated",
    actor: accountId,
    detail: { summary: summarizePayload(generated) },
    correlationId,
  });

  claim = updateClaim(claim.id, { status: "delivering" });

  let delivered;
  try {
    delivered = await deliver(generated, claim);
  } catch (err) {
    updateClaim(claim.id, {
      status: "failed_retryable",
      lastErrorCode: err.code || RewardErrors.REWARD_DELIVERY_FAILED,
    });
    auditReward({
      claimId: claim.id,
      claimKey,
      action: "delivery_failed",
      actor: accountId,
      detail: { error: err.message, code: err.code },
      correlationId,
    });
    emitRewardEvent("RewardDeliveryFailed", {
      claimId: claim.id,
      claimKey,
      code: err.code || RewardErrors.REWARD_DELIVERY_FAILED,
    });
    throw err;
  }

  const completedAt = new Date().toISOString();
  claim = updateClaim(claim.id, {
    status: "completed",
    deliveredPayload: delivered,
    completedAt,
    deliveryDestination: delivered?.deliveryDestination || "character",
  });

  auditReward({
    claimId: claim.id,
    claimKey,
    action: "reward_delivered",
    actor: accountId,
    detail: { summary: summarizePayload(delivered) },
    correlationId,
  });
  emitRewardEvent("RewardDelivered", {
    claimId: claim.id,
    claimKey,
    rewardSource,
    accountId,
    characterId,
  });
  emitRewardEvent("RewardClaimed", {
    claimId: claim.id,
    claimKey,
    rewardSource,
  });

  return { claim, created: true, idempotentReplay: false, result: delivered };
}

function summarizePayload(p) {
  if (!p || typeof p !== "object") return {};
  return {
    stardust: p.stardust || 0,
    nova_crystals: p.nova_crystals || 0,
    experience: p.experience || 0,
    fuel: p.fuel || 0,
    itemCount: Array.isArray(p.items) ? p.items.length : p.item_rarity ? 1 : 0,
    hasCollectible: !!p.collectible,
  };
}

/**
 * Deliver a classic rewards object through applyCharacterRewards and record claim linkage.
 */
export async function deliverViaApplyCharacterRewards({
  user,
  characterId,
  payload,
  claim,
}) {
  const game = createService(user);
  const { patch, items, newly_unlocked } = await applyCharacterRewards(
    game,
    characterId,
    payload
  );
  return {
    ...payload,
    applied: patch,
    items,
    newly_unlocked,
    deliveryDestination: "character",
    rewardClaimId: claim.id,
  };
}

/** Resolve Nexus membership bonus from server state (not client flag). */
export function resolveNexusBonus(characterId) {
  const membership = entities.GuildMember.filter({ character_id: characterId })[0];
  if (!membership?.guild_id) return false;
  const nexus = entities.Nexus.filter({ singleton: true })[0];
  return !!(nexus?.owner_guild_id && nexus.owner_guild_id === membership.guild_id);
}

export { ClaimKeys, detectSuspiciousRewardFields };

/** Admin compensation / package grant through the same pipeline. */
export async function grantAdminReward({
  accountId,
  characterId,
  rewards,
  reason,
  idempotencyKey,
  actorId,
  correlationId = null,
  compensation = false,
}) {
  if (!reason || !String(reason).trim()) {
    throw new RewardError(RewardErrors.REASON_REQUIRED, "Admin reason required");
  }
  if (!idempotencyKey) {
    throw new RewardError(RewardErrors.IDEMPOTENCY_KEY_REQUIRED, "idempotencyKey required");
  }
  const ch = characterId ? entities.Character.get(characterId) : null;
  if (characterId && !ch) {
    throw new RewardError(RewardErrors.CHARACTER_NOT_OWNED, "Character not found");
  }
  if (ch && ch.created_by_id !== accountId) {
    // Allow admin targeting by character alone — accountId should match owner
    if (accountId && ch.created_by_id !== accountId) {
      throw new RewardError(RewardErrors.CHARACTER_NOT_OWNED, "Character does not belong to account");
    }
  }
  const ownerId = ch?.created_by_id || accountId;
  const source = compensation
    ? "compensation"
    : "administrator_grant";
  const defKey = compensation ? "compensation" : "administrator_grant";

  return executeRewardClaim({
    claimKey: ClaimKeys.admin(idempotencyKey),
    idempotencyKey,
    accountId: ownerId,
    characterId: characterId || null,
    rewardSource: source,
    sourceReferenceType: "admin",
    sourceReferenceId: idempotencyKey,
    definitionKey: defKey,
    correlationId,
    admin: true,
    createdBy: actorId || "admin",
    generate: async () => ({
      ...rewards,
      bonusReasons: [compensation ? "compensation" : "administrator_grant"],
      adminReason: String(reason).slice(0, 500),
    }),
    deliver: async (payload, claim) => {
      if (!characterId) {
        return { ...payload, deliveryDestination: "account", note: "no character — payload recorded only" };
      }
      const user = { id: ownerId };
      return deliverViaApplyCharacterRewards({
        user,
        characterId,
        payload: {
          stardust: payload.stardust,
          nova_crystals: payload.nova_crystals,
          experience: payload.experience,
          fuel: payload.fuel,
          item_rarity: payload.item_rarity,
          collectible: payload.collectible,
        },
        claim,
      });
    },
  });
}

export function newCorrelationId() {
  return nanoid();
}
