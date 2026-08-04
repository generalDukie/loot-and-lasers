/**
 * Ambiguous-write recovery (Restoration 25).
 * Returns committed state by stable keys — never rerolls outcomes.
 */
import { db } from "../db.js";
import { recoverTransaction } from "./currencyService.js";
import { getClaimByKey, getPendingLoot } from "../rewards/store.js";
import { SerializeRecoveryState } from "./integrityService.js";
import { isMaintenanceActive, getMaintenanceState } from "./maintenanceGate.js";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "RECOVERY_ERROR";
  throw e;
}

/**
 * Look up a committed mutation by idempotency / claim / wallet key.
 * Does not create new mutations.
 */
export function RecoverAmbiguousRequest(accountId, body = {}) {
  if (!accountId) httpErr(401, "Unauthorized");

  const claimKey = body.claim_key || body.claimKey || null;
  const idempotencyKey =
    body.idempotency_key || body.idempotencyKey || body.request_id || body.requestId || null;
  const operationType = body.operation_type || body.operationType || null;
  const category = body.category || operationType || null;
  const pendingLootId = body.pending_loot_id || body.pendingLootId || null;
  const arenaChallengeKey = body.arena_idempotency_key || body.arenaIdempotencyKey || null;

  const result = {
    found: false,
    source: null,
    committed: null,
    status: "not_found",
  };

  if (claimKey) {
    const claim = getClaimByKey(String(claimKey));
    if (claim) {
      result.found = true;
      result.source = "reward_claim";
      result.status = claim.status || "unknown";
      result.committed = {
        claim_key: claim.claimKey || claim.claim_key || claimKey,
        claim_id: claim.id || claim.claimId,
        status: claim.status,
        delivered: claim.deliveredPayload ?? claim.delivered_payload ?? null,
        generated: claim.generatedPayload ?? claim.generated_payload ?? null,
      };
      return result;
    }
  }

  if (accountId && idempotencyKey) {
    const receipt = recoverTransaction(accountId, category || "unknown", idempotencyKey);
    if (receipt) {
      result.found = true;
      result.source = "wallet_operations";
      result.status = "committed";
      result.committed = receipt;
      return result;
    }
  }

  if (accountId && operationType && idempotencyKey) {
    const row = db
      .prepare(
        `SELECT result_json, created_at FROM wallet_operations
         WHERE account_id = ? AND operation_type = ? AND operation_key = ?`,
      )
      .get(accountId, operationType, String(idempotencyKey));
    if (row) {
      result.found = true;
      result.source = "wallet_operations";
      result.status = "committed";
      try {
        result.committed = JSON.parse(row.result_json);
      } catch {
        result.committed = { raw: true };
      }
      result.committed_at = row.created_at;
      return result;
    }
  }

  if (arenaChallengeKey) {
    try {
      const row = db
        .prepare(`SELECT * FROM arena_challenges WHERE idempotency_key = ?`)
        .get(String(arenaChallengeKey));
      if (row) {
        result.found = true;
        result.source = "arena_challenges";
        result.status = row.status || "committed";
        result.committed = {
          id: row.id,
          status: row.status,
          idempotency_key: row.idempotency_key,
          // Do not resimulate — return stored outcome fields only
          result_json: row.result_json ? safeParse(row.result_json) : null,
        };
        return result;
      }
    } catch {
      /* schema variance */
    }
  }

  if (pendingLootId) {
    const loot = getPendingLoot(String(pendingLootId));
    if (loot) {
      if (loot.accountId && loot.accountId !== accountId) {
        httpErr(403, "Pending loot not owned by account", "FORBIDDEN");
      }
      result.found = true;
      result.source = "reward_pending_loot";
      result.status = loot.status;
      result.committed = loot;
      return result;
    }
  }

  return result;
}

export function GetPlayerRecoveryState(user, character) {
  const maint = getMaintenanceState();
  const review = hasOpenCharacterReview(character?.id, user?.id);
  return SerializeRecoveryState(character, {
    maintenance: maint.enabled,
    reviewRequired: review,
  });
}

function hasOpenCharacterReview(characterId, accountId) {
  if (!characterId && !accountId) return false;
  try {
    const row = db
      .prepare(
        `SELECT id FROM data_quarantine
         WHERE review_status = 'open'
           AND severity IN ('critical', 'high')
           AND (entity_id = ? OR owner_id = ?)
         LIMIT 1`,
      )
      .get(characterId || "", accountId || "");
    return !!row;
  } catch {
    return false;
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export { isMaintenanceActive };
