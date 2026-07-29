/**
 * Thin helpers for common game-system integrations.
 */

import { nanoid } from "nanoid";
import {
  ActorTypes,
  AuditResults,
} from "./registry.js";
import {
  recordAdminAction,
  recordAuditEntry,
  recordCurrencyChange,
  recordItemOwnershipChange,
  recordSuccess,
} from "./writer.js";

export function newCorrelationId() {
  return nanoid();
}

/** Safe try-audit that rethrows for critical actions, swallows for noncritical. */
export function safeAudit(fn, { critical = false } = {}) {
  try {
    return fn();
  } catch (err) {
    if (critical) throw err;
    console.error("[audit] noncritical write failed", err?.message || err);
    return null;
  }
}

export function auditAdminModeration(user, moderationAction, detail = {}) {
  const map = {
    mute: "player_muted",
    unmute: "player_unmuted",
    ban: "player_banned",
    unban: "player_unbanned",
    delete_message: "chat_message_removed",
    edit_filter: "moderation_filter_updated",
    send_system_mail: "system_mail_sent",
    resolve_report: "moderation_note_added",
    give_item: "item_granted_by_admin",
    adjust_currency: "admin_currency_grant",
    reset_player: "admin_player_reset",
    set_role: "account_role_changed",
  };
  const action = map[moderationAction] || "admin_player_edit";

  // For currency adjustment, pick grant vs removal from deltas.
  let resolved = action;
  if (moderationAction === "adjust_currency") {
    const deltas = detail.deltas || {};
    const net =
      (Number(deltas.stardust) || 0) +
      (Number(deltas.nova_crystals) || 0) +
      (Number(deltas.fuel) || 0);
    resolved = net < 0 ? "admin_currency_removal" : "admin_currency_grant";
  }
  if (moderationAction === "send_system_mail" && detail.hasRewards) {
    resolved = "compensation_mail_sent";
  }

  return recordAdminAction(user, {
    action: resolved,
    targetType: detail.targetType || "character",
    targetId: detail.targetId || detail.characterId || null,
    targetAccountId: detail.targetAccountId || null,
    targetCharacterId: detail.characterId || detail.targetCharacterId || null,
    subjectType: detail.subjectType || null,
    subjectId: detail.subjectId || null,
    beforeState: detail.beforeState,
    afterState: detail.afterState,
    changeSet: detail.changeSet,
    reasonText: detail.reason || detail.reasonText || moderationAction,
    administratorNote: detail.reason || detail.notes || null,
    correlationId: detail.correlationId || newCorrelationId(),
    idempotencyKey: detail.idempotencyKey,
    metadata: detail.metadata,
    severity: detail.severity,
  });
}

export function auditShopPurchase({
  user,
  character,
  beforeStardust,
  afterStardust,
  beforeNova,
  afterNova,
  item,
  cost,
  novaCost,
  correlationId,
}) {
  const corr = correlationId || newCorrelationId();
  if (beforeStardust != null && afterStardust != null && beforeStardust !== afterStardust) {
    recordCurrencyChange({
      user,
      character,
      currencyType: "stardust",
      before: beforeStardust,
      after: afterStardust,
      reasonCode: "shop_purchase",
      source: "shop",
      correlationId: corr,
      actorType: ActorTypes.PLAYER,
    });
  }
  if (beforeNova != null && afterNova != null && beforeNova !== afterNova) {
    recordCurrencyChange({
      user,
      character,
      currencyType: "nova_crystals",
      before: beforeNova,
      after: afterNova,
      reasonCode: "shop_purchase",
      source: "shop",
      correlationId: corr,
      actorType: ActorTypes.PLAYER,
    });
  }
  if (item) {
    recordItemOwnershipChange({
      user,
      action: "item_purchased",
      item,
      previousOwnerCharacterId: null,
      newOwnerCharacterId: character.id,
      previousLocation: "shop",
      newLocation: "inventory",
      correlationId: corr,
      actorType: ActorTypes.PLAYER,
    });
  }
  return recordSuccess({
    action: "shop_purchase_completed",
    actorType: ActorTypes.PLAYER,
    actorId: user.id,
    actorAccountId: user.id,
    actorCharacterId: character.id,
    targetType: "character",
    targetId: character.id,
    targetAccountId: character.created_by_id || user.id,
    targetCharacterId: character.id,
    subjectType: "purchase",
    subjectId: item?.id || null,
    changeSet: {
      cost: cost || 0,
      novaCost: novaCost || 0,
      itemName: item?.name || null,
    },
    correlationId: corr,
  });
}

export function auditRewardClaimBridge({
  user,
  character,
  claim,
  result = AuditResults.SUCCESS,
  action = "reward_claimed",
}) {
  return safeAudit(
    () =>
      recordAuditEntry({
        action,
        result,
        actorType: ActorTypes.PLAYER,
        actorId: user?.id || claim?.accountId,
        actorAccountId: claim?.accountId || user?.id,
        actorCharacterId: claim?.characterId || character?.id,
        targetType: "character",
        targetId: claim?.characterId || character?.id,
        targetAccountId: claim?.accountId,
        targetCharacterId: claim?.characterId || character?.id,
        subjectType: "reward_claim",
        subjectId: claim?.id || claim?.claimKey,
        eventId: claim?.id,
        correlationId: claim?.correlationId,
        changeSet: {
          rewardSource: claim?.rewardSource,
          claimKey: claim?.claimKey,
        },
        idempotencyKey: claim?.id
          ? `reward_audit:${claim.id}:${action}`
          : undefined,
      }),
    { critical: false }
  );
}

export {
  recordAuditEntry,
  recordSuccess,
  recordFailure,
  recordAdminAction,
  recordCurrencyChange,
  recordItemOwnershipChange,
} from "./writer.js";
