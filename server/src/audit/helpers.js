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
    transfer_guild: "guild_leadership_transferred",
    create_promo_code: "admin_player_edit",
    delete_promo_code: "admin_player_edit",
    toggle_promo_code: "admin_player_edit",
    arena_ban: "player_banned",
    arena_unban: "player_unbanned",
    arena_suspend: "player_banned",
    arena_unsuspend: "player_unbanned",
    suspend: "player_banned",
    unsuspend: "player_unbanned",
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

export function auditCasinoSettle({
  user,
  character,
  game,
  bet,
  beforeStardust,
  afterStardust,
  beforeNova,
  afterNova,
  outcome,
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
      reasonCode: "casino_settle",
      source: "casino",
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
      reasonCode: "casino_settle",
      source: "casino",
      correlationId: corr,
      actorType: ActorTypes.PLAYER,
    });
  }
  return recordSuccess({
    action: "casino_settled",
    actorType: ActorTypes.PLAYER,
    actorId: user.id,
    actorAccountId: user.id,
    actorCharacterId: character.id,
    targetType: "character",
    targetId: character.id,
    targetAccountId: character.created_by_id || user.id,
    targetCharacterId: character.id,
    subjectType: "casino_game",
    subjectId: game || null,
    changeSet: {
      game,
      bet: bet || 0,
      deltaStardust: (afterStardust ?? beforeStardust) - (beforeStardust ?? 0),
      deltaNova: (afterNova ?? beforeNova) - (beforeNova ?? 0),
      outcome: outcome || null,
    },
    correlationId: corr,
  });
}

export function auditMiningEvent({
  user,
  character,
  action,
  before = {},
  after = {},
  stardustGained = 0,
  hours = null,
  correlationId,
}) {
  const corr = correlationId || newCorrelationId();
  if (action === "mining_collected" && stardustGained > 0) {
    recordCurrencyChange({
      user,
      character,
      currencyType: "stardust",
      before: before.stardust ?? character.stardust ?? 0,
      after: after.stardust ?? (before.stardust ?? 0) + stardustGained,
      reasonCode: "mining_collect",
      source: "mining",
      correlationId: corr,
      actorType: ActorTypes.PLAYER,
    });
  }
  return recordSuccess({
    action,
    actorType: ActorTypes.PLAYER,
    actorId: user.id,
    actorAccountId: user.id,
    actorCharacterId: character.id,
    targetType: "character",
    targetId: character.id,
    targetAccountId: character.created_by_id || user.id,
    targetCharacterId: character.id,
    subjectType: "mining",
    subjectId: character.id,
    beforeState: before,
    afterState: after,
    changeSet: { hours, stardustGained: stardustGained || 0 },
    correlationId: corr,
  });
}

export function auditDungeonBattle({
  user,
  character,
  won,
  beforeStardust,
  afterStardust,
  rewards = {},
  items = [],
  pendingLoot = [],
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
      reasonCode: "dungeon_battle",
      source: "dungeon",
      correlationId: corr,
      actorType: ActorTypes.PLAYER,
    });
  }
  return recordSuccess({
    action: "dungeon_battle_completed",
    actorType: ActorTypes.PLAYER,
    actorId: user.id,
    actorAccountId: user.id,
    actorCharacterId: character.id,
    targetType: "character",
    targetId: character.id,
    targetAccountId: character.created_by_id || user.id,
    targetCharacterId: character.id,
    subjectType: "dungeon_battle",
    subjectId: character.id,
    changeSet: {
      won: !!won,
      stardust: rewards.stardust || 0,
      experience: rewards.experience || 0,
      itemCount: (items || []).length,
      pendingLootCount: (pendingLoot || []).length,
      planetId: rewards.planetId ?? null,
      enemyIndex: rewards.enemyIndex ?? null,
    },
    correlationId: corr,
  });
}

export function auditFuelPurchase({
  user,
  character,
  beforeNova,
  afterNova,
  beforeFuel,
  afterFuel,
  cost,
  correlationId,
}) {
  const corr = correlationId || newCorrelationId();
  if (beforeNova != null && afterNova != null && beforeNova !== afterNova) {
    recordCurrencyChange({
      user,
      character,
      currencyType: "nova_crystals",
      before: beforeNova,
      after: afterNova,
      reasonCode: "fuel_purchase",
      source: "fuel",
      correlationId: corr,
      actorType: ActorTypes.PLAYER,
    });
  }
  return recordSuccess({
    action: "fuel_purchased",
    actorType: ActorTypes.PLAYER,
    actorId: user.id,
    actorAccountId: user.id,
    actorCharacterId: character.id,
    targetType: "character",
    targetId: character.id,
    targetAccountId: character.created_by_id || user.id,
    targetCharacterId: character.id,
    subjectType: "fuel",
    subjectId: character.id,
    beforeState: { nova_crystals: beforeNova, fuel: beforeFuel },
    afterState: { nova_crystals: afterNova, fuel: afterFuel },
    changeSet: { cost: cost || 0, fuelGained: (afterFuel ?? 0) - (beforeFuel ?? 0) },
    correlationId: corr,
  });
}

/** Admin entity create/update/delete, with SiteConfig mapped to remote_config_updated. */
export function auditAdminEntityWrite({
  user,
  entityType,
  op,
  entityId,
  before = null,
  after = null,
  reasonText,
}) {
  if (!user || !isAdminUser(user)) return null;
  const isSiteConfig = entityType === "SiteConfig";
  let action = "admin_entity_updated";
  if (op === "create") action = "admin_entity_created";
  if (op === "delete") action = "admin_entity_deleted";
  if (isSiteConfig) action = "remote_config_updated";

  return safeAudit(
    () =>
      recordAdminAction(user, {
        action,
        targetType: entityType,
        targetId: entityId || after?.id || before?.id || null,
        subjectType: entityType,
        subjectId: entityId || after?.id || before?.id || null,
        beforeState: summarizeEntity(before),
        afterState: summarizeEntity(after),
        changeSet: { op, entityType },
        reasonText: reasonText || `${op}_${entityType}`,
        administratorNote: reasonText || `${op} ${entityType}`,
        correlationId: newCorrelationId(),
      }),
    { critical: true }
  );
}

function isAdminUser(user) {
  return user?.role === "admin";
}

function summarizeEntity(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const {
    id,
    name,
    type,
    theme,
    text_overrides,
    code,
    active,
    leader_id,
    leader_name,
    email,
    role,
    ...rest
  } = doc;
  // Keep a small, redacted-safe snapshot — avoid dumping full inventories.
  const out = { id, name, type, theme: theme ? "[theme]" : undefined, text_overrides: text_overrides ? "[text_overrides]" : undefined, code, active, leader_id, leader_name, email, role };
  const keys = Object.keys(rest);
  if (keys.length) out._fieldCount = keys.length;
  return out;
}

export function auditAuthEvent({
  action,
  user = null,
  email = null,
  ipAddress = null,
  result = AuditResults.SUCCESS,
  metadata = {},
}) {
  return safeAudit(
    () =>
      recordAuditEntry({
        action,
        result,
        actorType: user?.role === "admin" && action === "admin_login"
          ? ActorTypes.ADMINISTRATOR
          : ActorTypes.PLAYER,
        actorId: user?.id || email || "anonymous",
        actorAccountId: user?.id || null,
        targetType: "account",
        targetId: user?.id || null,
        targetAccountId: user?.id || null,
        subjectType: "auth",
        subjectId: email || user?.email || null,
        ipAddress: ipAddress || null,
        changeSet: metadata,
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
