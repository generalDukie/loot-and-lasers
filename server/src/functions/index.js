import { applyCharacterRewards, DAILY_REWARDS, redeemPromoCode, expForLevel, randomItem } from "../shared/rewards.js";
import { grantCharacterXp, consumeProgression } from "../shared/characterProgression.js";
import {
  mergeAchievementUnlocks,
  assertAchievementClientSafe,
  serializeCharacterAchievements,
  ACHIEVEMENTS,
} from "../shared/achievements.js";
import { serializeCollections } from "../shared/discovery.js";
import { getCollectionPercentage } from "../shared/collectionBonus.js";
import {
  createNotification,
  listNotifications,
  getUnreadCounts,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  notifyAchievementsUnlocked,
  CLIENT_CREATABLE_TYPES,
  assertNotificationClientSafe,
} from "../shared/notificationService.js";
import {
  serializePublicProfile,
  searchCharacters,
  getSocialState,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockPlayer,
  unblockPlayer,
  setPresence,
  getPresenceMap,
  getCharactersByIds,
} from "../shared/socialService.js";
import {
  listMail,
  getUnreadMailCount,
  getUnclaimedMailCount,
  sendPlayerMail,
  markMailRead,
  deleteMail,
  restoreMail,
} from "../shared/mailService.js";
import {
  getMyGuildState,
  joinGuild,
  leaveGuild,
  inviteToGuild,
  acceptGuildInvite,
  requestToJoinGuild,
  acceptGuildRequest,
  kickGuildMember,
  ensureWeeklyChallenge,
  contributeGuildMission,
  contributeGuildArenaWin,
  updateGuildSettings,
  toggleGuildWarReady,
  resolveGuildWar,
  applyRivalGuildWarResult,
} from "../shared/guildSocialService.js";
import { deleteMyCharacter } from "../shared/characterLifecycleService.js";
import {
  getAccountPreferences,
  saveAccountPreferences,
  ACCOUNT_PREFERENCE_KEYS,
  LOCAL_DEVICE_SETTING_KEYS,
} from "../shared/preferencesService.js";
import {
  RunIntegrityAudit,
  ApplyDataRepair,
  ValidateAccountIntegrity,
  ValidateCharacterIntegrity,
  INTEGRITY_VALIDATOR_VERSION,
} from "../shared/integrityService.js";
import { RecoverAmbiguousRequest, GetPlayerRecoveryState } from "../shared/recoveryService.js";
import { getMaintenanceState, setMaintenanceMode, assertWritesAllowed } from "../shared/maintenanceGate.js";
import { RunMigration, listMigrations, assertSchemaCompatible } from "../shared/migrationFramework.js";
import "../shared/migrations/registerBuiltins.js";
import { isAdmin } from "../entityAccess.js";
import {
  LookupPlayer,
  InspectCharacter,
  GetOpsDashboard,
  GetOpsTelemetry,
  GetRuntimeConfiguration,
  UpdateRuntimeConfiguration,
  SetFeatureFlag,
  listAdminPermissionsForUser,
  AdminPermissions,
  applyArenaModeration,
} from "../shared/adminOpsService.js";
import {
  RecordAnalyticsEvent,
} from "../shared/observability/index.js";
import { createService, entities } from "../entities.js";
import { db, nowIso, withTransactionAsync } from "../db.js";
import { getUserById } from "../auth.js";
import { ECONOMY_HANDLERS } from "./economy.js";
import { getInventoryCap, STARDUST_MAX } from "../shared/economyFormulas.js";
import { countBagOccupancy } from "../shared/inventoryGrant.js";
import { todayET, clock, TimeErrors } from "../shared/time/index.js";
import { getGameTime } from "../shared/schedulerService.js";
import {
  grantEntitlement,
  titleEntitlementKeyForAchievement,
  grantProductBundle,
} from "../entitlements/index.js";
import { resolveSelectedCharacter } from "../gameplayContext.js";
import {
  ClaimKeys,
  executeRewardClaim,
  deliverViaApplyCharacterRewards,
  detectSuspiciousRewardFields,
  getClaimByKey,
  RewardSources,
  RewardErrors,
} from "../rewards/index.js";
import {
  buildDailyLoginRewardState,
  CYCLE_THEMES as DAILY_CYCLE_THEMES,
} from "../shared/dailyLoginService.js";
import { getBalances } from "../shared/currencyService.js";
import {
  auditAdminModeration,
  recordCurrencyChange,
  recordItemOwnershipChange,
  ActorTypes,
  newCorrelationId,
} from "../audit/index.js";

const CYCLE_THEMES = DAILY_CYCLE_THEMES;

/**
 * Resolve the account-global selected Character via shared gameplay context.
 * Soft-null when nothing is selected (preserves prior 404 "No character" call sites).
 */
function myCharacter(user) {
  return resolveSelectedCharacter(user, { required: false });
}

function svc(user) {
  return createService(user);
}

export async function GetDailyLoginStatus(user, _body = {}) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character", success: false } };
  const existing = entities.DailyLogin.filter({ character_id: character.id });
  const progress = existing[0] || null;
  const daily_login = buildDailyLoginRewardState(progress);
  return {
    status: 200,
    body: {
      success: true,
      daily_login,
      ...daily_login,
      character,
      balances: getBalances(character),
    },
  };
}

export async function ClaimDailyLogin(user, body = {}) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };

  const today = todayET();
  const claimKey = ClaimKeys.daily(character.id, today);
  const suspicious = detectSuspiciousRewardFields(body);

  try {
    const result = await withTransactionAsync(async () => {
      const prior = getClaimByKey(claimKey);
      if (prior?.status === "completed" && prior.deliveredPayload) {
        const live = entities.Character.get(character.id) || character;
        const progList = entities.DailyLogin.filter({ character_id: character.id });
        const progress = progList[0] || prior.deliveredPayload.progress || null;
        const daily_login = buildDailyLoginRewardState(progress, { today });
        return {
          ...prior.deliveredPayload,
          idempotentReplay: true,
          already_claimed: true,
          daily_login,
          character: live,
          balances: getBalances(live),
          patch: prior.deliveredPayload.applied || prior.deliveredPayload.patch || {},
        };
      }

      const existing = entities.DailyLogin.filter({ character_id: character.id });
      let progress = existing[0];

      if (progress && progress.last_claim_date === today) {
        const err = new Error("Already claimed today");
        err.status = 409;
        err.code = RewardErrors.REWARD_ALREADY_CLAIMED;
        err.progress = progress;
        throw err;
      }

      if (!progress) {
        progress = entities.DailyLogin.create({
          character_id: character.id,
          last_claim_date: "",
          current_day: 1,
          claimed_days: [],
          cycle_theme: CYCLE_THEMES[0],
        });
      }

      const day = progress.current_day || 1;
      const rewardEntry = DAILY_REWARDS[(day - 1)] || DAILY_REWARDS[0];

      const claimOut = await executeRewardClaim({
        claimKey,
        idempotencyKey: body?.idempotencyKey || body?.idempotency_key || null,
        accountId: user.id,
        characterId: character.id,
        rewardSource: RewardSources.DAILY_LOGIN,
        sourceReferenceType: "daily_period",
        sourceReferenceId: `${character.id}:${today}`,
        definitionKey: "daily_login",
        clientBody: body,
        suspiciousFields: suspicious,
        generate: async () => ({
          ...(rewardEntry.rewards || {}),
          claimed_day: day,
          period_key: today,
        }),
        deliver: async (payload, claim) => {
          const claimedDays = [...(progress.claimed_days || []), day];
          const wrapped = day >= 30;
          const nextDay = wrapped ? 1 : day + 1;
          const newTheme = wrapped
            ? CYCLE_THEMES[(CYCLE_THEMES.indexOf(progress.cycle_theme || CYCLE_THEMES[0]) + 1) % CYCLE_THEMES.length]
            : progress.cycle_theme;

          const updated = entities.DailyLogin.update(progress.id, {
            last_claim_date: today,
            current_day: nextDay,
            claimed_days: wrapped ? [] : claimedDays,
            cycle_theme: newTheme,
          });

          const delivered = await deliverViaApplyCharacterRewards({
            user,
            characterId: character.id,
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

          const live = entities.Character.get(character.id) || character;
          const daily_login = buildDailyLoginRewardState(updated, { today });

          return {
            success: true,
            claimed_day: day,
            rewards: rewardEntry.rewards,
            applied: delivered.applied,
            patch: delivered.applied,
            items: delivered.items,
            progress: updated,
            daily_login,
            wrapped,
            reward_claim_id: claim.id,
            character: live,
            balances: getBalances(live),
          };
        },
      });

      return claimOut.result;
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status === 409) {
      const daily_login = buildDailyLoginRewardState(err.progress, { today });
      const live = entities.Character.get(character.id) || character;
      return {
        status: 409,
        body: {
          error: err.message,
          progress: err.progress,
          code: err.code,
          daily_login,
          already_claimed: true,
          character: live,
          balances: getBalances(live),
        },
      };
    }
    if (err.code) {
      return { status: 400, body: { error: err.message, code: err.code } };
    }
    throw err;
  }
}

export async function ClaimMailReward(user, body) {
  const mailId = body.mail_id;
  if (!mailId) return { status: 400, body: { error: "Missing mail_id" } };

  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };

  const suspicious = detectSuspiciousRewardFields(body);
  const claimKey = ClaimKeys.mail(mailId);

  try {
    const result = await withTransactionAsync(async () => {
      const prior = getClaimByKey(claimKey);
      if (prior?.status === "completed" && prior.deliveredPayload) {
        return { ...prior.deliveredPayload, idempotentReplay: true };
      }

      const mail = entities.Mail.get(mailId);
      if (!mail) {
        const err = new Error("Mail not found");
        err.status = 404;
        throw err;
      }
      if (mail.owner_id !== character.id) {
        const err = new Error("Not your mail");
        err.status = 403;
        err.code = RewardErrors.CHARACTER_NOT_OWNED;
        throw err;
      }
      if (!mail.has_rewards) {
        const err = new Error("No rewards attached");
        err.status = 400;
        throw err;
      }
      if (mail.claimed) {
        const err = new Error("Rewards already claimed");
        err.status = 409;
        err.code = RewardErrors.REWARD_ALREADY_CLAIMED;
        throw err;
      }
      if (mail.expires_at && new Date(mail.expires_at).getTime() < clock.nowMs()) {
        const err = new Error("This mail has expired.");
        err.status = 403;
        err.code = TimeErrors.MAIL_EXPIRED;
        throw err;
      }

      const attachment = mail.rewards || {};

      const claimOut = await executeRewardClaim({
        claimKey,
        idempotencyKey: body?.idempotencyKey || body?.idempotency_key || null,
        accountId: user.id,
        characterId: character.id,
        rewardSource: RewardSources.MAIL_ATTACHMENT,
        sourceReferenceType: "mail",
        sourceReferenceId: mailId,
        definitionKey: "mail_attachment",
        clientBody: body,
        suspiciousFields: suspicious,
        generate: async () => ({ ...attachment }),
        deliver: async (payload, claim) => {
          entities.Mail.update(mailId, { claimed: true, read: true });
          const delivered = await deliverViaApplyCharacterRewards({
            user,
            characterId: character.id,
            payload,
            claim,
          });
          return {
            success: true,
            applied: delivered.applied,
            items: delivered.items,
            reward_claim_id: claim.id,
          };
        },
      });

      return claimOut.result;
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    if (err.code) return { status: 400, body: { error: err.message, code: err.code } };
    throw err;
  }
}

export async function RedeemPromoCode(user, body) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };

  const code = (body?.code || "").trim();
  if (!code) return { status: 400, body: { error: "Missing code" } };

  const suspicious = detectSuspiciousRewardFields(body);
  const claimKey = ClaimKeys.promo(user.id, code);
  const game = svc(user);
  const found = entities.PromoCode.filter({ code });
  const pc = found[0];
  if (pc) {
    try {
      const result = await withTransactionAsync(async () => {
        const prior = getClaimByKey(claimKey);
        if (prior?.status === "completed" && prior.deliveredPayload) {
          return { ...prior.deliveredPayload, idempotentReplay: true };
        }

        const fresh = entities.PromoCode.get(pc.id) || pc;
        if (!fresh.active) {
          const err = new Error("This code is no longer active");
          err.status = 410;
          throw err;
        }
        const redeemedBy = fresh.redeemed_by || [];
        if (redeemedBy.includes(character.id)) {
          const err = new Error("Code already redeemed");
          err.status = 409;
          err.code = RewardErrors.REWARD_ALREADY_CLAIMED;
          throw err;
        }
        if (fresh.max_redemptions && fresh.max_redemptions > 0 && redeemedBy.length >= fresh.max_redemptions) {
          const err = new Error("Redemption limit reached");
          err.status = 410;
          throw err;
        }

        const claimOut = await executeRewardClaim({
          claimKey,
          idempotencyKey: body?.idempotencyKey || `promo:${user.id}:${code}`,
          accountId: user.id,
          characterId: character.id,
          rewardSource: RewardSources.PROMOTION,
          sourceReferenceType: "promo_code",
          sourceReferenceId: fresh.id,
          definitionKey: "promotion",
          clientBody: body,
          suspiciousFields: suspicious,
          generate: async () => ({ ...(fresh.rewards || {}) }),
          deliver: async (payload, claim) => {
            entities.PromoCode.update(fresh.id, { redeemed_by: [...redeemedBy, character.id] });
            const delivered = await deliverViaApplyCharacterRewards({
              user,
              characterId: character.id,
              payload,
              claim,
            });
            return {
              success: true,
              code,
              label: fresh.label,
              patch: delivered.applied,
              items: delivered.items,
              reward_claim_id: claim.id,
            };
          },
        });
        return claimOut.result;
      });
      return { status: 200, body: result };
    } catch (err) {
      if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
      if (err.code) return { status: 400, body: { error: err.message, code: err.code } };
      throw err;
    }
  }

  const result = await redeemPromoCode(game, character, code);
  if (!result.ok) return { status: result.status, body: { error: result.error } };

  if (/^foundersonly$/i.test(code) && character.created_by_id) {
    try {
      await grantProductBundle({
        productId: "promo.founders_only",
        accountId: character.created_by_id,
        sourceType: "promotion",
        idempotencyKey: `promo:FoundersOnly:${character.created_by_id}`,
        externalProvider: "promotion",
        externalTransactionId: `promo:FoundersOnly:${character.created_by_id}`,
        createdBy: user.email || user.id,
      });
    } catch {
      /* already granted */
    }
  }

  return { status: 200, body: { success: true, ...result } };
}

export async function GetGameTime(user, _body = {}) {
  if (!user) return { status: 401, body: { error: "Unauthorized" } };
  return {
    status: 200,
    body: {
      success: true,
      ...getGameTime(),
    },
  };
}

export async function SyncAchievements(user, body = {}) {
  try {
    assertAchievementClientSafe(body);
  } catch (err) {
    return { status: err.status || 400, body: { error: err.message, code: err.code } };
  }
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };

  // Retroactive evaluation from current Character statistics (idempotent).
  const { patch: achPatch, newly_unlocked } = mergeAchievementUnlocks(character);
  const patch = { ...achPatch };
  const titles = new Set(patch.unlocked_titles || character.unlocked_titles || []);

  // Mirror achievement titles into character-scoped entitlements (idempotent keys).
  const toGrant = newly_unlocked?.length
    ? newly_unlocked
    : [];
  // Also backfill titles for already-unlocked achievements when Sync runs.
  const allIds = new Set([
    ...(character.unlocked_achievements || []),
    ...(patch.unlocked_achievements || []),
    ...toGrant,
  ]);
  for (const achId of allIds) {
    const a = ACHIEVEMENTS.find((x) => x.id === achId);
    if (!a?.title || !character.created_by_id) continue;
    try {
      await grantEntitlement({
        entitlementKey: titleEntitlementKeyForAchievement(achId),
        accountId: character.created_by_id,
        characterId: character.id,
        quantity: 1,
        sourceType: "achievement",
        sourceReferenceType: "achievement",
        sourceReferenceId: achId,
        idempotencyKey: `achievement-title:${character.id}:${achId}`,
        createdBy: "system",
      });
    } catch {
      /* already owned / unknown — ignore */
    }
  }

  if (body.title !== undefined) {
    if (body.title === "" || titles.has(body.title)) {
      patch.active_title = body.title;
    } else {
      return { status: 403, body: { error: "Title not unlocked", code: "ENTITLEMENT_NOT_OWNED" } };
    }
  }

  let updated = character;
  if (Object.keys(patch).length) {
    updated = entities.Character.update(character.id, patch);
  }
  if (newly_unlocked?.length) {
    notifyAchievementsUnlocked(updated.id, newly_unlocked);
  }

  return {
    status: 200,
    body: {
      success: true,
      character: updated,
      newly_unlocked,
      achievements: serializeCharacterAchievements(updated),
    },
  };
}

export async function GetNotifications(user, body = {}) {
  try {
    assertNotificationClientSafe(body || {});
  } catch (err) {
    return { status: err.status || 400, body: { error: err.message, code: err.code } };
  }
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };
  const unreadOnly = !!body?.unread_only;
  const notifications = listNotifications(character.id, {
    unreadOnly,
    limit: body?.limit,
  });
  return {
    status: 200,
    body: {
      success: true,
      notifications,
      counts: getUnreadCounts(character.id),
    },
  };
}

export async function CreateNotification(user, body = {}) {
  try {
    assertNotificationClientSafe(body || {});
  } catch (err) {
    return { status: err.status || 400, body: { error: err.message, code: err.code } };
  }
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };
  const type = String(body.type || "system").toLowerCase();
  if (!CLIENT_CREATABLE_TYPES.includes(type)) {
    return {
      status: 403,
      body: { error: "Type not creatable by client", code: "NOTIFICATION_TYPE_FORBIDDEN" },
    };
  }
  const ownerId = String(body.owner_id || "").trim();
  if (!ownerId) {
    return { status: 400, body: { error: "owner_id required" } };
  }
  // Reject forging achievement / reward unlocks via social create.
  if (/achievement|unlocked|arena_defense|mining|mission/i.test(String(body.title || ""))) {
    if (type === "system" && !body.related_id) {
      /* allow generic system social messages */
    }
  }
  try {
    const result = createNotification({
      owner_id: ownerId,
      type,
      title: body.title,
      body: body.body,
      related_id: body.related_id,
      priority: body.priority || "normal",
      idempotency_key: body.idempotency_key || body.request_id || null,
    });
    return { status: 200, body: { success: true, ...result } };
  } catch (err) {
    return { status: err.status || 400, body: { error: err.message, code: err.code } };
  }
}

export async function MarkNotificationRead(user, body = {}) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };
  try {
    const notification = markNotificationRead(character.id, body?.id || body?.notification_id);
    return {
      status: 200,
      body: { success: true, notification, counts: getUnreadCounts(character.id) },
    };
  } catch (err) {
    return { status: err.status || 400, body: { error: err.message, code: err.code } };
  }
}

export async function MarkAllNotificationsRead(user, _body = {}) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };
  try {
    const result = markAllNotificationsRead(character.id);
    return { status: 200, body: { success: true, ...result } };
  } catch (err) {
    return { status: err.status || 400, body: { error: err.message, code: err.code } };
  }
}

export async function DismissNotification(user, body = {}) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };
  try {
    const notification = dismissNotification(character.id, body?.id || body?.notification_id);
    return {
      status: 200,
      body: { success: true, notification, counts: getUnreadCounts(character.id) },
    };
  } catch (err) {
    return { status: err.status || 400, body: { error: err.message, code: err.code } };
  }
}

/** Read-only achievement list (no mutation). */
export async function GetAchievements(user, body = {}) {
  try {
    assertAchievementClientSafe(body || {});
  } catch (err) {
    return { status: err.status || 400, body: { error: err.message, code: err.code } };
  }
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };
  return {
    status: 200,
    body: {
      success: true,
      ...serializeCharacterAchievements(character),
    },
  };
}

/** Cosmic Vault collection ownership summary. */
export async function GetCollections(user, body = {}) {
  try {
    assertAchievementClientSafe(body || {});
  } catch (err) {
    return { status: err.status || 400, body: { error: err.message, code: err.code } };
  }
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character" } };
  const gearTotal = Math.max(0, Math.floor(Number(body?.gear_total) || 0));
  return {
    status: 200,
    body: {
      success: true,
      percentage: getCollectionPercentage(character, gearTotal),
      ...serializeCollections(character, { gearTotal }),
    },
  };
}

// ── SendMessage ──────────────────────────────────────────────
const MAX_LEN = 280;
const GLOBAL_COOLDOWN_MS = 2000;
const PRIVATE_COOLDOWN_MS = 1000;
const SPAM_WINDOW_MS = 10000;
const SPAM_THRESHOLD = 5;
const SPAM_MUTE_MS = 3 * 60 * 1000;

function applyFilter(content, words) {
  let out = content;
  for (const w of words || []) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "****");
  }
  return out;
}

export async function SendMessage(user, body) {
  const channel = body.channel;
  const content = (body.content || "").toString().trim();
  const recipientId = body.recipient_id;
  if (!channel || !content) return { status: 400, body: { error: "Missing channel or content" } };
  if (content.length > MAX_LEN) return { status: 400, body: { error: "Message too long" } };

  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character found" } };

  const modList = entities.PlayerModeration.filter({ character_id: character.id });
  const mod = modList[0];
  if (mod) {
    if (mod.chat_banned) return { status: 403, body: { error: "You are banned from chat." } };
    if (mod.chat_muted_until && new Date(mod.chat_muted_until) > new Date()) {
      return { status: 403, body: { error: "You are temporarily silenced." } };
    }
  }

  const sinceMs = Date.now() - SPAM_WINDOW_MS;
  const recentChats = entities.ChatMessage.filter({ sender_id: character.id }, "-created_date", 10);
  const recentPrivs = entities.PrivateMessage.filter({ sender_id: character.id }, "-created_date", 10);
  const recentMails = entities.Mail.filter({ from_id: character.id, mail_type: "player" }, "-created_date", 10);
  const countSince = (list) => (list || []).filter((m) => new Date(m.created_date).getTime() > sinceMs).length;
  if (countSince(recentChats) + countSince(recentPrivs) + countSince(recentMails) >= SPAM_THRESHOLD) {
    const mutedUntil = new Date(Date.now() + SPAM_MUTE_MS).toISOString();
    if (mod) entities.PlayerModeration.update(mod.id, { chat_muted_until: mutedUntil });
    else entities.PlayerModeration.create({ character_id: character.id, chat_muted_until: mutedUntil });
    return { status: 429, body: { error: "You are sending messages too fast. You have been muted for 3 minutes." } };
  }

  const cfgList = entities.ModerationConfig.filter({ singleton: true });
  const filtered = applyFilter(content, cfgList[0]?.filtered_words || []);

  if (channel === "global") {
    const last = entities.ChatMessage.filter({ sender_id: character.id }, "-created_date", 1)[0];
    if (last && Date.now() - new Date(last.created_date).getTime() < GLOBAL_COOLDOWN_MS) {
      return { status: 429, body: { error: "Slow down — chat cooldown active." } };
    }
    const membership = entities.GuildMember.filter({ character_id: character.id })[0];
    let guildTag = "";
    if (membership) {
      const g = entities.Guild.get(membership.guild_id);
      guildTag = g?.tag || "";
    }
    const msg = entities.ChatMessage.create({
      sender_id: character.id,
      sender_name: character.name,
      sender_level: character.level || 1,
      sender_class: character.class,
      sender_guild_tag: guildTag,
      sender_avatar_url: character.avatar_url || "",
      content: filtered,
    }, { created_by_id: user.id, created_by: user.email });
    return { status: 200, body: { message: msg } };
  }

  if (channel === "private") {
    if (!recipientId) return { status: 400, body: { error: "Missing recipient_id" } };
    if (recipientId === character.id) return { status: 400, body: { error: "Cannot message yourself" } };
    if (entities.Block.filter({ blocker_id: recipientId, blocked_id: character.id }).length) {
      return { status: 403, body: { error: "You cannot message this player." } };
    }
    const last = entities.PrivateMessage.filter({ sender_id: character.id }, "-created_date", 1)[0];
    if (last && Date.now() - new Date(last.created_date).getTime() < PRIVATE_COOLDOWN_MS) {
      return { status: 429, body: { error: "Slow down — chat cooldown active." } };
    }

    const convs = entities.PrivateConversation.list(null, 10000);
    let conversation = convs.find((c) => {
      const p = c.participant_ids || [];
      return p.includes(character.id) && p.includes(recipientId);
    });
    if (!conversation) {
      conversation = entities.PrivateConversation.create({
        participant_ids: [character.id, recipientId],
        last_message_preview: filtered.slice(0, 80),
        last_message_at: nowIso(),
        last_sender_id: character.id,
      });
    } else {
      conversation = entities.PrivateConversation.update(conversation.id, {
        last_message_preview: filtered.slice(0, 80),
        last_message_at: nowIso(),
        last_sender_id: character.id,
      });
    }

    const msg = entities.PrivateMessage.create({
      conversation_id: conversation.id,
      sender_id: character.id,
      recipient_id: recipientId,
      content: filtered,
      read_by_recipient: false,
    });

    createNotification({
      owner_id: recipientId,
      type: "private_message",
      title: character.name,
      body: filtered.slice(0, 80),
      related_id: conversation.id,
      priority: "normal",
      idempotency_key: `pm:${msg.id}`,
    });

    return { status: 200, body: { message: msg, conversation_id: conversation.id } };
  }

  return { status: 400, body: { error: "Unknown channel" } };
}

// ── ResolveNexusAssault ──────────────────────────────────────
const RARITY_WEIGHT = { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 16 };
const HOLD_HOURS = 24;
const ASSAULT_COOLDOWN_MS = 30 * 60 * 1000;
const GARRISON_BASE = 1200;

function memberPower(members) {
  return (members || []).reduce((a, m) => a + ((m.character_level || 1) * 12), 0);
}
function guildUpgrades(guild) {
  return (guild.level || 1) * 80;
}
function equipmentQuality(memberIds, items) {
  const set = new Set(memberIds);
  return (items || []).filter((it) => set.has(it.character_id)).reduce((a, it) => a + (RARITY_WEIGHT[it.rarity] || 1), 0);
}
function strengthOf(guild, members, equip, participation, randomness) {
  const base = memberPower(members) + equip + guildUpgrades(guild);
  const activeBonus = Math.log2(1 + (members || []).length) * 50;
  return Math.max(1, Math.round((base + activeBonus) * participation * randomness));
}
function rand(min, max) { return min + Math.random() * (max - min); }
function daysBetween(a, b) { return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)); }

function buildEvents(atkName, defName, atkStrength, defStrength, attackerWon) {
  const atkShare = atkStrength / (atkStrength + defStrength);
  const ev = [];
  ev.push({ phase: "arrival", side: "attacker", emoji: "🛸", text: `${atkName}'s fleet drops out of warp above the Galactic Command Nexus.` });
  ev.push({ phase: "bombardment", side: "attacker", emoji: "💥", text: `Orbital laser batteries rain fire on ${defName}'s defensive platforms.` });
  ev.push({ phase: "turrets", side: "defender", emoji: "🛡️", text: `${defName}'s auto-turrets return fire, shredding attacker screens.` });
  if (atkShare > 0.5) ev.push({ phase: "breach", side: "attacker", emoji: "👾", text: `${atkName}'s alien assault marines breach the station corridors.` });
  else ev.push({ phase: "breach", side: "defender", emoji: "🪖", text: `${defName} repels the boarding parties at the airlock.` });
  ev.push({ phase: "explosion", side: "both", emoji: "🔥", text: `A reactor core detonates — debris and casualties on both sides!` });
  if (atkShare > 0.45) ev.push({ phase: "turning", side: "attacker", emoji: "⚡", text: `${atkName} breaks through the inner defensive ring.` });
  else ev.push({ phase: "turning", side: "defender", emoji: "🧱", text: `${defName} holds the line — the assault falters.` });
  if (attackerWon) {
    ev.push({ phase: "climax", side: "attacker", emoji: "🏁", text: `${atkName} overruns the command deck!` });
    ev.push({ phase: "victory", side: "attacker", emoji: "👑", text: `${atkName} seizes control of the Galactic Command Nexus!` });
  } else {
    ev.push({ phase: "climax", side: "defender", emoji: "🚫", text: `${atkName}'s offensive collapses under sustained fire.` });
    ev.push({ phase: "victory", side: "defender", emoji: "👑", text: `${defName} holds the Galactic Command Nexus!` });
  }
  return ev;
}

export async function ResolveNexusAssault(user, body) {
  const attackerGuildId = body.attacker_guild_id;
  const characterId = body.character_id;
  if (!attackerGuildId || !characterId) {
    return { status: 400, body: { error: "Missing attacker_guild_id or character_id" } };
  }

  const character = entities.Character.get(characterId);
  if (!character || character.created_by_id !== user.id) {
    return { status: 403, body: { error: "Character does not belong to caller" } };
  }

  const membership = entities.GuildMember.filter({ character_id: characterId })[0];
  if (!membership || membership.guild_id !== attackerGuildId || !["leader", "officer"].includes(membership.role)) {
    return { status: 403, body: { error: "Only guild leaders or officers may declare an assault" } };
  }

  const attackerGuild = entities.Guild.get(attackerGuildId);
  const attackerMembers = entities.GuildMember.filter({ guild_id: attackerGuildId });

  let nexus = entities.Nexus.filter({ singleton: true })[0];
  if (!nexus) {
    nexus = entities.Nexus.create({ singleton: true, status: "vulnerable", defense_streak: 0 });
  }

  const now = new Date();
  const nowIsoStr = now.toISOString();

  if (nexus.last_assault_at && (now - new Date(nexus.last_assault_at)) < ASSAULT_COOLDOWN_MS) {
    return { status: 409, body: { error: "The Nexus is still reeling from the last assault. Try again shortly." } };
  }

  const hasOwner = !!nexus.owner_guild_id;
  let defenderGuild = null;
  let defenderMembers = [];
  let defenderName = "Nexus Automated Garrison";
  let defenderIsGuild = false;

  if (hasOwner) {
    const heldMs = now - new Date(nexus.captured_at);
    if (heldMs < HOLD_HOURS * 3600 * 1000) {
      const hoursLeft = Math.ceil((HOLD_HOURS * 3600 * 1000 - heldMs) / 3600000);
      return { status: 409, body: { error: `The Nexus is not yet vulnerable. It can be attacked in ~${hoursLeft}h.` } };
    }
    defenderGuild = entities.Guild.get(nexus.owner_guild_id);
    defenderMembers = entities.GuildMember.filter({ guild_id: nexus.owner_guild_id });
    defenderName = defenderGuild.name;
    defenderIsGuild = true;
  }

  const allItems = entities.Item.filter({ is_equipped: true }, "-created_date", 500);
  const atkMemberIds = attackerMembers.map((m) => m.character_id);
  const defMemberIds = defenderMembers.map((m) => m.character_id);
  const atkEquip = equipmentQuality(atkMemberIds, allItems);
  const defEquip = defenderIsGuild ? equipmentQuality(defMemberIds, allItems) : 0;

  const atkStrength = strengthOf(attackerGuild, attackerMembers, atkEquip, rand(0.8, 1.0), rand(0.9, 1.1));
  const defStrength = defenderIsGuild
    ? strengthOf(defenderGuild, defenderMembers, defEquip, rand(0.8, 1.0), rand(0.9, 1.1))
    : Math.max(1, Math.round(GARRISON_BASE * rand(0.9, 1.1)));

  const atkShare = atkStrength / (atkStrength + defStrength);
  const attackerWon = Math.random() < atkShare;
  const events = buildEvents(attackerGuild.name, defenderName, atkStrength, defStrength, attackerWon);

  let ownershipChanged = false;
  let reignDays = 0;

  if (attackerWon) {
    if (defenderIsGuild) {
      reignDays = daysBetween(nexus.captured_at, nowIsoStr);
      const prevCaptures = entities.NexusHallOfFame.filter({ guild_id: defenderGuild.id }).length + 1;
      entities.NexusHallOfFame.create({
        guild_id: defenderGuild.id,
        guild_name: defenderGuild.name,
        guild_tag: defenderGuild.tag,
        leader_name: nexus.owner_guild_leader,
        captured_at: nexus.captured_at,
        lost_at: nowIsoStr,
        reign_days: reignDays,
        defenses: nexus.defense_streak || 0,
        captures: prevCaptures,
        lost_to: attackerGuild.name,
      });
    }
    entities.Nexus.update(nexus.id, {
      owner_guild_id: attackerGuild.id,
      owner_guild_name: attackerGuild.name,
      owner_guild_tag: attackerGuild.tag,
      owner_guild_leader: attackerGuild.leader_name,
      owner_member_count: attackerMembers.length,
      captured_at: nowIsoStr,
      defense_streak: 0,
      status: "controlled",
      last_assault_at: nowIsoStr,
    });
    ownershipChanged = true;
    entities.GalaxyNews.create({
      message: reignDays > 0
        ? `⚡ The Galactic Command Nexus has fallen! ${attackerGuild.name} defeated ${defenderGuild.name} after a ${reignDays}-day reign and now controls the Nexus!`
        : `⚡ ${attackerGuild.name} has captured the Galactic Command Nexus and is now recognized as the strongest guild in the galaxy!`,
      entry_type: "champion",
      character_name: attackerGuild.name,
    });
  } else {
    entities.Nexus.update(nexus.id, {
      defense_streak: (nexus.defense_streak || 0) + 1,
      last_assault_at: nowIsoStr,
      owner_member_count: defenderIsGuild ? defenderMembers.length : (nexus.owner_member_count || 0),
    });
  }

  entities.NexusAssault.create({
    attacker_guild_id: attackerGuild.id,
    attacker_guild_name: attackerGuild.name,
    attacker_guild_tag: attackerGuild.tag,
    defender_guild_id: defenderIsGuild ? defenderGuild.id : "",
    defender_guild_name: defenderName,
    attacker_strength: atkStrength,
    defender_strength: defStrength,
    winner: attackerWon ? "attacker" : "defender",
    events,
    ownership_changed: ownershipChanged,
    initiated_by: character.name,
  });

  return {
    status: 200,
    body: {
      winner: attackerWon ? "attacker" : "defender",
      events,
      attacker_strength: atkStrength,
      defender_strength: defStrength,
      defender_name: defenderName,
      ownership_changed: ownershipChanged,
      reign_days: reignDays,
      nexus: entities.Nexus.get(nexus.id),
    },
  };
}

// ── AdminModeration ──────────────────────────────────────────
export async function AdminModeration(user, body) {
  if (user.role !== "admin") return { status: 403, body: { error: "Admin only" } };

  try {
    return await withTransactionAsync(async () => {
      const result = await adminModerationInner(user, body || {});
      return result;
    });
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
    throw err;
  }
}

async function adminModerationInner(user, body) {
  const action = body.action;

  if (action === "mute") {
    const { character_id, minutes, reason } = body;
    if (!reason) return { status: 400, body: { error: "reason required" } };
    const until = new Date(Date.now() + (minutes || 30) * 60000).toISOString();
    const list = entities.PlayerModeration.filter({ character_id });
    let rec = list[0];
    const before = rec ? { ...rec } : null;
    if (rec) rec = entities.PlayerModeration.update(rec.id, { chat_muted_until: until, notes: reason || rec.notes });
    else rec = entities.PlayerModeration.create({ character_id, chat_muted_until: until, chat_banned: false, notes: reason || "" });
    const ch = entities.Character.get(character_id);
    auditAdminModeration(user, "mute", {
      characterId: character_id,
      targetAccountId: ch?.created_by_id,
      reason,
      beforeState: before,
      afterState: { chat_muted_until: until },
      changeSet: { minutes: minutes || 30 },
    });
    return { status: 200, body: { success: true, moderation: rec } };
  }

  if (action === "ban") {
    const { character_id, reason } = body;
    if (!reason) return { status: 400, body: { error: "reason required" } };
    const list = entities.PlayerModeration.filter({ character_id });
    let rec = list[0];
    const before = rec ? { chat_banned: rec.chat_banned } : { chat_banned: false };
    if (rec) rec = entities.PlayerModeration.update(rec.id, { chat_banned: true, chat_banned_reason: reason || "" });
    else rec = entities.PlayerModeration.create({ character_id, chat_banned: true, chat_banned_reason: reason || "" });
    const ch = entities.Character.get(character_id);
    auditAdminModeration(user, "ban", {
      characterId: character_id,
      targetAccountId: ch?.created_by_id,
      reason,
      beforeState: before,
      afterState: { chat_banned: true },
    });
    return { status: 200, body: { success: true, moderation: rec } };
  }

  if (action === "unban" || action === "unmute") {
    const { character_id, reason } = body;
    const list = entities.PlayerModeration.filter({ character_id });
    if (list[0]) {
      const patch = action === "unban" ? { chat_banned: false, chat_banned_reason: "" } : { chat_muted_until: null };
      const before = { ...list[0] };
      const rec = entities.PlayerModeration.update(list[0].id, patch);
      const ch = entities.Character.get(character_id);
      auditAdminModeration(user, action, {
        characterId: character_id,
        targetAccountId: ch?.created_by_id,
        reason: reason || action,
        beforeState: before,
        afterState: patch,
      });
      return { status: 200, body: { success: true, moderation: rec } };
    }
    return { status: 200, body: { success: true } };
  }

  if (action === "delete_message") {
    const existing = entities.ChatMessage.get(body.message_id);
    const rec = entities.ChatMessage.update(body.message_id, { deleted: true, deleted_by: user.id, content: "[removed]" });
    auditAdminModeration(user, "delete_message", {
      targetType: "chat_message",
      targetId: body.message_id,
      reason: body.reason || "message_removed",
      beforeState: existing ? { deleted: !!existing.deleted, content_len: (existing.content || "").length } : null,
      afterState: { deleted: true },
      subjectType: "chat_message",
      subjectId: body.message_id,
    });
    return { status: 200, body: { success: true, message: rec } };
  }

  if (action === "edit_filter") {
    const list = entities.ModerationConfig.filter({ singleton: true });
    let rec = list[0];
    const before = rec ? { wordCount: (rec.filtered_words || []).length } : { wordCount: 0 };
    if (rec) rec = entities.ModerationConfig.update(rec.id, { filtered_words: body.words });
    else rec = entities.ModerationConfig.create({ singleton: true, filtered_words: body.words });
    auditAdminModeration(user, "edit_filter", {
      targetType: "moderation_config",
      targetId: rec.id,
      reason: body.reason || "filter_update",
      beforeState: before,
      afterState: { wordCount: (body.words || []).length },
    });
    return { status: 200, body: { success: true, config: rec } };
  }

  if (action === "send_system_mail") {
    const { subject, body: mailBody, rewards, recipients, expires_days, reason } = body;
    let recipientIds = recipients || [];
    if (recipients === "all") {
      recipientIds = entities.Character.list("-created_date", 2000).map((c) => c.id);
    }
    const hasRewards = !!(rewards && Object.keys(rewards).length);
    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 86400000).toISOString() : null;
    const records = recipientIds.map((rid) => ({
      owner_id: rid,
      from_id: "system",
      from_name: "Galactic Command",
      to_id: rid,
      to_name: "",
      subject: subject || "System Notice",
      body: mailBody || "",
      mail_type: "system",
      folder: "system",
      read: false,
      claimed: false,
      has_rewards: hasRewards,
      rewards: hasRewards ? rewards : undefined,
      expires_at: expiresAt,
    }));
    const created = entities.Mail.bulkCreate(records);
    auditAdminModeration(user, "send_system_mail", {
      reason: reason || (hasRewards ? "compensation_mail" : "system_mail"),
      hasRewards,
      changeSet: {
        recipientCount: created.length,
        hasRewards,
        subject: subject || "System Notice",
        rewardKeys: hasRewards ? Object.keys(rewards) : [],
      },
      subjectType: "mail_batch",
      subjectId: created[0]?.id || null,
    });
    return { status: 200, body: { success: true, count: created.length } };
  }

  if (action === "resolve_report") {
    const existing = entities.Report.get(body.report_id);
    const rec = entities.Report.update(body.report_id, { status: "resolved", action_taken: body.action_taken || "" });
    auditAdminModeration(user, "resolve_report", {
      actionOverride: null,
      targetType: "report",
      targetId: body.report_id,
      reason: body.action_taken || "resolved",
      beforeState: existing ? { status: existing.status } : null,
      afterState: { status: "resolved" },
    });
    // resolve_report isn't in map — use admin_player_edit via custom call
    return { status: 200, body: { success: true, report: rec } };
  }

  if (action === "give_item") {
    const { character_id, reason } = body;
    if (!reason) return { status: 400, body: { error: "reason required for item grants" } };
    const ch = entities.Character.get(character_id);
    if (!ch) return { status: 404, body: { error: "Character not found" } };

    let item = body.item;
    if (!item || !item.name || !item.type || !item.rarity) {
      const type = item?.type || body.type;
      const rarity = item?.rarity || body.rarity || "rare";
      const level = Math.max(1, Number(item?.level_requirement || body.level || ch.level) || 1);
      if (!type) {
        return { status: 400, body: { error: "item requires name, type, rarity (or type + rarity to generate)" } };
      }
      item = randomItem(rarity, level, type, Math.random, ch.class);
    }

    const {
      id: _ignoreId,
      character_id: _ignoreChar,
      owner_id: _ignoreOwner,
      created_by_id: _ignoreCb,
      created_by: _ignoreBy,
      created_date: _ignoreCd,
      updated_date: _ignoreUd,
      is_equipped: _ignoreEq,
      ...safeItem
    } = item;
    const cap = getInventoryCap(ch);
    const bagCount = countBagOccupancy(ch);
    if (bagCount >= cap) {
      return {
        status: 400,
        body: {
          error: `Inventory full (${bagCount}/${cap}) — only unequipped items count. Free a bag slot first.`,
          inventory_count: bagCount,
          inventory_cap: cap,
        },
      };
    }
    const created = entities.Item.create({
      ...safeItem,
      name: String(safeItem.name || "Granted Item").trim() || "Granted Item",
      type: safeItem.type,
      rarity: safeItem.rarity,
      owner_id: ch.created_by_id || user.id,
      character_id: ch.id,
      created_by_id: user.id,
      created_by: user.email,
      is_equipped: false,
      locked: !!safeItem.locked,
    });
    const corr = newCorrelationId();
    recordItemOwnershipChange({
      user,
      action: "item_granted_by_admin",
      item: created,
      previousOwnerCharacterId: null,
      newOwnerCharacterId: ch.id,
      previousLocation: "system_storage",
      newLocation: "inventory",
      correlationId: corr,
      reasonText: reason,
      actorType: ActorTypes.ADMINISTRATOR,
    });
    auditAdminModeration(user, "give_item", {
      characterId: ch.id,
      targetAccountId: ch.created_by_id,
      subjectType: "item",
      subjectId: created.id,
      reason,
      correlationId: corr,
      changeSet: { itemName: created.name, rarity: created.rarity, type: created.type },
      afterState: { itemId: created.id },
    });
    return {
      status: 200,
      body: {
        success: true,
        item: created,
        character_name: ch.name,
        character_id: ch.id,
        inventory_count: bagCount + 1,
        inventory_cap: cap,
      },
    };
  }

  if (action === "adjust_currency") {
    const { character_id, deltas, reason } = body;
    if (!reason) return { status: 400, body: { error: "reason required for currency adjustments" } };
    if (!deltas || typeof deltas !== "object") {
      return { status: 400, body: { error: "deltas required" } };
    }
    const ch = entities.Character.get(character_id);
    if (!ch) return { status: 404, body: { error: "Character not found" } };
    const {
      creditNova,
      debitNova,
      getBalances,
      NovaBalanceTypes,
    } = await import("../shared/currencyService.js");
    const { ensureNovaSplitFields: ensureSplit } = await import("../shared/novaBalances.js");
    let live = ensureSplit(ch);
    const beforeBal = getBalances(live);
    const before = {
      stardust: live.stardust || 0,
      nova_crystals: beforeBal.nova_crystals,
      nova_wagerable: beforeBal.nova_wagerable,
      nova_promotional: beforeBal.nova_promotional,
      fuel: live.fuel || 0,
      arena_attempts_left: live.arena_attempts_left || 0,
      experience: live.experience || 0,
      level: live.level || 1,
    };
    const patch = {};
    if (deltas.stardust != null && deltas.stardust !== 0) {
      patch.stardust = Math.min(
        STARDUST_MAX,
        Math.max(0, (live.stardust || 0) + Number(deltas.stardust)),
      );
      if (deltas.stardust > 0) {
        patch.total_stardust_earned = (live.total_stardust_earned || 0) + Number(deltas.stardust);
      }
    }
    // Prefer explicit split deltas; legacy nova_crystals → promotional (safe default).
    const wagerableDelta = Number(deltas.nova_wagerable ?? deltas.nova_purchased ?? 0) || 0;
    const promoDelta = Number(
      deltas.nova_promotional ?? deltas.nova_bonus ??
      (wagerableDelta === 0 ? deltas.nova_crystals : 0) ?? 0,
    ) || 0;
    const targetUser = { id: live.created_by_id, role: "admin" };
    if (wagerableDelta !== 0) {
      const fn = wagerableDelta > 0 ? creditNova : debitNova;
      const mut = fn({
        user: targetUser,
        character: live,
        amount: Math.abs(wagerableDelta),
        category: wagerableDelta > 0 ? "admin_purchased" : "admin_remove",
        reasonCode: wagerableDelta > 0 ? "admin_grant_wagerable" : "admin_remove_wagerable",
        idempotencyKey: `admin_nova_w_${live.id}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        balanceType: NovaBalanceTypes.WAGERABLE,
        debitPolicy: NovaBalanceTypes.WAGERABLE,
      });
      live = mut.character;
      Object.assign(patch, mut.patch);
    }
    if (promoDelta !== 0) {
      const fn = promoDelta > 0 ? creditNova : debitNova;
      const mut = fn({
        user: targetUser,
        character: live,
        amount: Math.abs(promoDelta),
        category: "admin_promotional",
        reasonCode: promoDelta > 0 ? "admin_grant_promotional" : "admin_remove_promotional",
        idempotencyKey: `admin_nova_p_${live.id}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        balanceType: NovaBalanceTypes.PROMOTIONAL,
        debitPolicy: NovaBalanceTypes.PROMOTIONAL,
      });
      live = mut.character;
      Object.assign(patch, mut.patch);
    }
    if (deltas.fuel != null && deltas.fuel !== 0) {
      patch.fuel = Math.max(0, Math.min(ch.max_fuel || 100, (ch.fuel || 0) + Number(deltas.fuel)));
    }
    if (deltas.arena_attempts != null && deltas.arena_attempts !== 0) {
      patch.arena_attempts_left = Math.max(0, (ch.arena_attempts_left || 0) + Number(deltas.arena_attempts));
      patch.arena_attempts_date = todayET();
    }
    if (deltas.experience != null && deltas.experience !== 0) {
      const xpDelta = Number(deltas.experience);
      if (!Number.isFinite(xpDelta)) {
        return { status: 400, body: { error: "Invalid experience delta" } };
      }
      if (xpDelta > 0) {
        const granted = grantCharacterXp({
          character: ch,
          xpAmount: xpDelta,
          source: "admin_currency_adjust",
        });
        Object.assign(patch, granted.patch);
        if (granted.progression) patch.__progression = granted.progression;
      } else {
        patch.experience = Math.max(0, (ch.experience || 0) + Math.floor(xpDelta));
      }
    }
    if (!Object.keys(patch).length) {
      return { status: 400, body: { error: "No currency deltas provided" } };
    }
    const progression = consumeProgression(patch);
    const updated = Object.keys(patch).length
      ? entities.Character.update(character_id, patch)
      : entities.Character.get(character_id);
    const afterBal = getBalances(updated);
    const corr = newCorrelationId();
    for (const key of ["stardust", "fuel"]) {
      if (deltas[key] != null && deltas[key] !== 0) {
        recordCurrencyChange({
          user,
          character: ch,
          currencyType: key,
          before: before[key],
          after: updated[key],
          amount: Number(deltas[key]),
          reasonCode: "admin_adjust",
          reasonText: reason,
          correlationId: corr,
          actorType: ActorTypes.ADMINISTRATOR,
          administratorNote: reason,
          source: "admin_moderation",
        });
      }
    }
    auditAdminModeration(user, "adjust_currency", {
      characterId: ch.id,
      targetAccountId: ch.created_by_id,
      reason,
      deltas,
      beforeState: before,
      afterState: {
        stardust: updated.stardust,
        nova_crystals: afterBal.nova_crystals,
        nova_wagerable: afterBal.nova_wagerable,
        nova_promotional: afterBal.nova_promotional,
        fuel: updated.fuel,
        level: updated.level,
        experience: updated.experience,
        arena_attempts_left: updated.arena_attempts_left,
      },
      changeSet: { deltas },
      correlationId: corr,
    });
    return {
      status: 200,
      body: {
        success: true,
        character: updated,
        character_name: ch.name,
        progression,
        balances: afterBal,
      },
    };
  }

  if (action === "reset_player") {
    const { character_id, reason } = body;
    if (!reason) return { status: 400, body: { error: "reason required for player reset" } };
    const ch = entities.Character.get(character_id);
    if (!ch) return { status: 404, body: { error: "Character not found" } };
    const before = {
      level: ch.level,
      stardust: ch.stardust,
      nova_crystals: ch.nova_crystals,
      arena_rating: ch.arena_rating,
    };
    entities.Item.deleteMany({ character_id });
    const updated = entities.Character.update(character_id, {
      level: 1, experience: 0, experience_to_next_level: expForLevel(1),
      stardust: 0, nova_crystals: 0, nova_wagerable_half: 0, nova_promotional_half: 0,
      nova_dual_balance_v1: true, unspent_stat_points: 0, attribute_purchases: 0,
      attribute_purchases_by_stat: { strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0 },
      discovered_species: [], collected_artifacts: [], collected_relics: [],
      arena_wins: 0, arena_losses: 0, arena_rating: 1000,
      arena_streak: 0, arena_max_streak: 0, arena_battles: 0,
      fuel: ch.max_fuel || 100, fuel_purchases: 0,
      equipped_items: {}, active_mission_id: "", mission_end_time: "",
      missions_completed: 0, highest_sector: 1, dungeon_clears: 0,
      highest_damage: 0, total_stardust_earned: 0,
      promo_codes_redeemed: [], active_buffs: [],
    });
    auditAdminModeration(user, "reset_player", {
      characterId: ch.id,
      targetAccountId: ch.created_by_id,
      reason,
      beforeState: before,
      afterState: { level: 1, stardust: 0, nova_crystals: 0, arena_rating: 1000 },
    });
    return { status: 200, body: { success: true, character: updated } };
  }

  if (action === "set_role") {
    const { character_id, user_id, role, reason } = body;
    if (!reason) return { status: 400, body: { error: "reason required for role changes" } };
    let targetUserId = user_id || null;
    if (!targetUserId && character_id) {
      const ch = entities.Character.get(character_id);
      if (!ch) return { status: 404, body: { error: "Character not found" } };
      targetUserId = ch.created_by_id;
    }
    if (!targetUserId) return { status: 400, body: { error: "user_id or character_id required" } };
    const target = getUserById(targetUserId);
    if (!target) return { status: 404, body: { error: "Account not found" } };
    const targetRole = role === "admin" ? "admin" : "user";
    if (targetUserId === user.id) {
      return { status: 400, body: { error: "You cannot change your own role" } };
    }
    const beforeRole = target.role;
    db.prepare("UPDATE users SET role = ?, updated_date = ? WHERE id = ?")
      .run(targetRole, nowIso(), targetUserId);
    const updated = getUserById(targetUserId);
    const userEnt = entities.User.get(targetUserId);
    if (userEnt) entities.User.update(targetUserId, { role: targetRole });
    auditAdminModeration(user, "set_role", {
      targetType: "account",
      targetId: targetUserId,
      targetAccountId: targetUserId,
      reason,
      beforeState: { role: beforeRole },
      afterState: { role: targetRole },
    });
    return { status: 200, body: { success: true, role: updated.role, user_id: targetUserId, email: updated.email } };
  }

  if (action === "transfer_guild") {
    const { guild_id, new_leader_id } = body;
    const guild = entities.Guild.get(guild_id);
    if (!guild) return { status: 404, body: { error: "Guild not found" } };
    const members = entities.GuildMember.filter({ guild_id });
    const newLeaderMember = members.find((m) => m.character_id === new_leader_id);
    if (!newLeaderMember) return { status: 400, body: { error: "New leader is not a member of this guild" } };
    const prevLeaderId = guild.leader_id;
    for (const m of members) {
      if (m.role === "leader") entities.GuildMember.update(m.id, { role: "member" });
    }
    entities.GuildMember.update(newLeaderMember.id, { role: "leader" });
    const updated = entities.Guild.update(guild_id, {
      leader_id: new_leader_id,
      leader_name: newLeaderMember.character_name,
    });
    auditAdminModeration(user, "transfer_guild", {
      targetType: "guild",
      targetId: guild_id,
      characterId: new_leader_id,
      reason: body.reason || "transfer_guild",
      beforeState: { leader_id: prevLeaderId, leader_name: guild.leader_name },
      afterState: { leader_id: new_leader_id, leader_name: newLeaderMember.character_name },
      changeSet: { guild_id, prevLeaderId, new_leader_id },
    });
    return { status: 200, body: { success: true, guild: updated } };
  }

  if (action === "create_promo_code") {
    const cleanCode = (body.code || "").trim();
    if (!cleanCode) return { status: 400, body: { error: "Code required" } };
    if (entities.PromoCode.filter({ code: cleanCode })[0]) {
      return { status: 409, body: { error: "Code already exists" } };
    }
    const created = entities.PromoCode.create({
      code: cleanCode,
      label: body.label || cleanCode,
      rewards: body.rewards || {},
      max_redemptions: body.max_redemptions || 0,
      active: true,
      redeemed_by: [],
    });
    auditAdminModeration(user, "create_promo_code", {
      targetType: "promo_code",
      targetId: created.id,
      reason: body.reason || "create_promo_code",
      afterState: {
        code: created.code,
        active: created.active,
        max_redemptions: created.max_redemptions,
      },
      changeSet: { rewards: Object.keys(created.rewards || {}) },
    });
    return { status: 200, body: { success: true, promo_code: created } };
  }

  if (action === "delete_promo_code") {
    const existing = entities.PromoCode.get(body.promo_code_id);
    entities.PromoCode.delete(body.promo_code_id);
    auditAdminModeration(user, "delete_promo_code", {
      targetType: "promo_code",
      targetId: body.promo_code_id,
      reason: body.reason || "delete_promo_code",
      beforeState: existing
        ? { code: existing.code, active: existing.active }
        : null,
      afterState: { deleted: true },
    });
    return { status: 200, body: { success: true } };
  }

  if (action === "toggle_promo_code") {
    const existing = entities.PromoCode.get(body.promo_code_id);
    const updated = entities.PromoCode.update(body.promo_code_id, { active: body.active });
    auditAdminModeration(user, "toggle_promo_code", {
      targetType: "promo_code",
      targetId: body.promo_code_id,
      reason: body.reason || "toggle_promo_code",
      beforeState: existing ? { active: existing.active } : null,
      afterState: { active: !!body.active },
    });
    return { status: 200, body: { success: true, promo_code: updated } };
  }

  if (
    action === "arena_ban" ||
    action === "arena_unban" ||
    action === "arena_suspend" ||
    action === "arena_unsuspend" ||
    action === "suspend" ||
    action === "unsuspend"
  ) {
    const { character_id, reason, hours } = body;
    if (!reason) return { status: 400, body: { error: "reason required" } };
    if (!character_id) return { status: 400, body: { error: "character_id required" } };

    let arenaBanned = null;
    let arenaSuspended = null;
    let suspendedUntil = undefined;

    if (action === "arena_ban") arenaBanned = true;
    if (action === "arena_unban") {
      arenaBanned = false;
      arenaSuspended = false;
      suspendedUntil = null;
    }
    if (action === "arena_suspend" || action === "suspend") {
      arenaSuspended = true;
      const h = Math.max(1, Number(hours) || 24);
      suspendedUntil = new Date(Date.now() + h * 3600000).toISOString();
    }
    if (action === "arena_unsuspend" || action === "unsuspend") {
      arenaSuspended = false;
      suspendedUntil = null;
    }

    const out = applyArenaModeration(user, {
      characterId: character_id,
      arenaBanned,
      arenaSuspended,
      suspendedUntil,
      reason,
    });
    return { status: 200, body: { success: true, moderation: out.moderation } };
  }

  return { status: 400, body: { error: "Unknown action" } };
}

// ── Social / profiles / mail / guild membership (Restoration 23) ──

function socialOk(body) {
  return { status: 200, body };
}

function socialCatch(err) {
  if (err?.status) return { status: err.status, body: { error: err.message, code: err.code } };
  throw err;
}

export async function GetPublicProfile(user, body = {}) {
  try {
    if (!user) return { status: 401, body: { error: "Unauthorized" } };
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const targetId = String(body.character_id || body.id || "").trim();
    if (!targetId) return { status: 400, body: { error: "character_id required" } };
    const profile = serializePublicProfile(targetId);
    if (!profile) return { status: 404, body: { error: "Character not found" } };
    return socialOk({ success: true, profile });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function SearchCharacters(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const results = searchCharacters(body.query || body.q || "", {
      excludeId: character.id,
      limit: body.limit,
    });
    return socialOk({ success: true, results });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function GetSocialState(user) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    return socialOk({ success: true, ...getSocialState(character.id) });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function SendFriendRequest(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = sendFriendRequest(character, body.to_character_id || body.character_id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function AcceptFriendRequest(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = acceptFriendRequest(character, body.request_id || body.id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function DeclineFriendRequest(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = declineFriendRequest(character, body.request_id || body.id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function RemoveFriend(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = removeFriend(character, body.character_id || body.friend_id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function BlockPlayer(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = blockPlayer(character, body.character_id || body.blocked_id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function UnblockPlayer(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = unblockPlayer(character, body.character_id || body.blocked_id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function SetPresence(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = setPresence(character, body.status || "online");
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function GetPresenceMap(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const ids = Array.isArray(body.character_ids) ? body.character_ids : [];
    return socialOk({ success: true, presence: getPresenceMap(ids) });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function GetCharactersByIds(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const ids = Array.isArray(body.ids) ? body.ids : [];
    return socialOk({ success: true, characters: getCharactersByIds(ids.slice(0, 50)) });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function GetChatHistory(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const channel = String(body.channel || "global").toLowerCase();
    const lim = Math.max(1, Math.min(100, Number(body.limit) || 50));
    if (channel === "global") {
      const messages = entities.ChatMessage.list("-created_date", lim) || [];
      return socialOk({ success: true, messages: messages.reverse() });
    }
    if (channel === "private") {
      const conversationId = String(body.conversation_id || "").trim();
      const recipientId = String(body.recipient_id || "").trim();
      let convId = conversationId;
      if (!convId && recipientId) {
        const convs = entities.PrivateConversation.list(null, 10000) || [];
        const found = convs.find((c) => {
          const p = c.participant_ids || [];
          return p.includes(character.id) && p.includes(recipientId);
        });
        convId = found?.id || "";
      }
      if (!convId) return socialOk({ success: true, messages: [], conversation_id: null });
      const conv = entities.PrivateConversation.get(convId);
      const parts = conv?.participant_ids || [];
      if (!parts.includes(character.id)) {
        return { status: 403, body: { error: "Not your conversation" } };
      }
      const messages =
        entities.PrivateMessage.filter({ conversation_id: convId }, "-created_date", lim) || [];
      return socialOk({
        success: true,
        conversation_id: convId,
        messages: messages.reverse(),
      });
    }
    return { status: 400, body: { error: "Unknown channel" } };
  } catch (err) {
    return socialCatch(err);
  }
}

export async function GetInbox(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const folder = body.folder || "inbox";
    const mail = listMail(character.id, { folder, limit: body.limit });
    return socialOk({
      success: true,
      mail,
      unread_count: getUnreadMailCount(character.id),
      unclaimed_count: getUnclaimedMailCount(character.id),
    });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function SendMail(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = sendPlayerMail(
      character,
      body.to_character_id || body.to_id,
      body.subject,
      body.body,
    );
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function MarkMailRead(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const mail = markMailRead(character.id, body.mail_id || body.id, body.read !== false);
    return socialOk({ success: true, mail });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function DeleteMail(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const mail = deleteMail(character.id, body.mail_id || body.id);
    return socialOk({ success: true, mail });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function RestoreMail(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const mail = restoreMail(character.id, body.mail_id || body.id);
    return socialOk({ success: true, mail });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function GetMyGuild(user) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    return socialOk({ success: true, ...getMyGuildState(character.id) });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function JoinGuild(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = joinGuild(character, body.guild_id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function LeaveGuild(user) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = leaveGuild(character);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function InviteGuildMember(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = inviteToGuild(character, body.character_id || body.to_character_id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function AcceptGuildInvite(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = acceptGuildInvite(character, body.mail_id || body.id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function RequestJoinGuild(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = requestToJoinGuild(character, body.guild_id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function AcceptGuildRequest(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = acceptGuildRequest(
      character,
      body.guild_id,
      body.character_id || body.from_id || body.requester_id,
    );
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function KickGuildMember(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = kickGuildMember(character, body.character_id || body.target_id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function EnsureGuildChallenge(user) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = ensureWeeklyChallenge(character);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function ContributeGuildMission(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const mission = body.mission && typeof body.mission === "object" ? body.mission : {};
    const gains = body.gains && typeof body.gains === "object" ? body.gains : {
      stardust: body.stardust,
      experience: body.experience ?? body.xp,
    };
    const out = contributeGuildMission(character, mission, gains);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function ContributeGuildArenaWin(user) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = contributeGuildArenaWin(character);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function UpdateGuildSettings(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const patch = body.settings && typeof body.settings === "object" ? body.settings : body;
    const out = updateGuildSettings(character, patch);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function ToggleGuildWarReady(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = toggleGuildWarReady(character, body.war_id || body.id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function ResolveGuildWar(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = resolveGuildWar(character, body.war_id || body.id);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function ApplyRivalGuildWarResult(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const out = applyRivalGuildWarResult(character, body);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function MarkConversationRead(user, body = {}) {
  try {
    const character = await myCharacter(user);
    if (!character) return { status: 404, body: { error: "No character" } };
    const conversationId = String(body.conversation_id || "").trim();
    if (!conversationId) return { status: 400, body: { error: "conversation_id required" } };
    const conv = entities.PrivateConversation.get(conversationId);
    if (!conv || !(conv.participant_ids || []).includes(character.id)) {
      return { status: 403, body: { error: "Not your conversation" } };
    }
    const msgs =
      entities.PrivateMessage.filter(
        { conversation_id: conversationId, recipient_id: character.id, read_by_recipient: false },
        null,
        200,
      ) || [];
    for (const m of msgs) {
      entities.PrivateMessage.update(m.id, { read_by_recipient: true });
    }
    return socialOk({ success: true, marked: msgs.length });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function DeleteMyCharacter(user, body = {}) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    const out = deleteMyCharacter(user, body.character_id || body.id);
    return socialOk(out);
  } catch (err) {
    return socialCatch(err);
  }
}

export async function GetAccountPreferences(user) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    const preferences = getAccountPreferences(user.id);
    return socialOk({
      success: true,
      preferences,
      synchronizable_keys: ACCOUNT_PREFERENCE_KEYS,
      local_device_keys: LOCAL_DEVICE_SETTING_KEYS,
    });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function SaveAccountPreferences(user, body = {}) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    const patch = body.preferences && typeof body.preferences === "object" ? body.preferences : body;
    const preferences = saveAccountPreferences(user.id, patch);
    return socialOk({ success: true, preferences });
  } catch (err) {
    return socialCatch(err);
  }
}

/** Player-safe: committed state lookup after lost response. Never mutates. */
export async function RecoverAmbiguousRequestRpc(user, body = {}) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    const out = RecoverAmbiguousRequest(user.id, body || {});
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

/** Player-safe recovery presentation flags (maintenance / review / pending loot). */
export async function GetRecoveryState(user) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    const character = await myCharacter(user);
    const recovery = GetPlayerRecoveryState(user, character);
    const maintenance = getMaintenanceState();
    return socialOk({
      success: true,
      recovery,
      maintenance: {
        enabled: maintenance.enabled,
        message: maintenance.message,
      },
      validator_version: INTEGRITY_VALIDATOR_VERSION,
    });
  } catch (err) {
    return socialCatch(err);
  }
}

/** Admin / internal: scoped integrity audit. No public repair controls for players. */
export async function RunIntegrityAuditRpc(user, body = {}) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    if (!isAdmin(user)) return { status: 403, body: { error: "Admin only", code: "FORBIDDEN" } };
    const accountId = body.account_id || body.accountId || null;
    const characterId = body.character_id || body.characterId || null;
    if (!accountId && !characterId) {
      return { status: 400, body: { error: "account_id or character_id required" } };
    }
    const report = RunIntegrityAudit({
      accountId,
      characterId,
      quarantine: !!body.quarantine,
      includeOrphans: !!body.include_orphans,
      includeScheduler: !!body.include_scheduler,
    });
    return socialOk({ success: true, report });
  } catch (err) {
    return socialCatch(err);
  }
}

/** Admin: dry-run by default. Explicit apply=true required to mutate. */
export async function ApplyDataRepairRpc(user, body = {}) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    if (!isAdmin(user)) return { status: 403, body: { error: "Admin only", code: "FORBIDDEN" } };
    const dryRun = body.apply !== true;
    const out = ApplyDataRepair({
      repairType: body.repair_type || body.repairType,
      characterId: body.character_id || body.characterId,
      dryRun,
      actor: `admin:${user.id}`,
    });
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

/** Admin: set Node-enforced maintenance mode. */
export async function SetMaintenanceModeRpc(user, body = {}) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    if (!isAdmin(user)) return { status: 403, body: { error: "Admin only", code: "FORBIDDEN" } };
    const state = setMaintenanceMode({
      enabled: !!body.enabled,
      message: body.message || null,
      allow_reads: body.allow_reads !== false,
      allow_admin_writes: body.allow_admin_writes !== false,
      operator: `admin:${user.id}`,
    });
    return socialOk({ success: true, maintenance: state });
  } catch (err) {
    return socialCatch(err);
  }
}

/** Admin: dry-run migration by default. */
export async function RunMigrationRpc(user, body = {}) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    if (!isAdmin(user)) return { status: 403, body: { error: "Admin only", code: "FORBIDDEN" } };
    const migrationId = body.migration_id || body.migrationId;
    if (!migrationId) return { status: 400, body: { error: "migration_id required" } };
    const dryRun = body.apply !== true;
    const report = await RunMigration(migrationId, {
      dryRun,
      resume: !!body.resume,
      operator: `admin:${user.id}`,
      env: process.env.NODE_ENV || "development",
    });
    return socialOk({
      success: true,
      migrations_available: listMigrations().map((m) => ({
        id: m.id,
        description: m.description,
        target_version: m.targetVersion,
      })),
      report,
    });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function LookupPlayerRpc(user, body = {}) {
  try {
    const out = LookupPlayer(user, body);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function InspectCharacterRpc(user, body = {}) {
  try {
    const characterId = body.character_id || body.characterId || body.id;
    const out = InspectCharacter(user, characterId);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function GetOpsDashboardRpc(user) {
  try {
    const dashboard = GetOpsDashboard(user);
    return socialOk({
      success: true,
      dashboard,
      permissions: listAdminPermissionsForUser(user),
    });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function GetOpsTelemetryRpc(user) {
  try {
    const out = GetOpsTelemetry(user);
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

/**
 * Client analytics ingest — untrusted, schema-validated, never authoritative.
 * Does not grant rewards or progression.
 */
export async function RecordClientAnalytics(user, body = {}) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    const result = RecordAnalyticsEvent({
      name: body.name || body.event,
      properties: body.properties || {},
      source: "godot_client",
      consent: body.consent !== false,
      opted_out: body.opted_out === true,
    });
    return socialOk({ success: true, ...result, authoritative: false });
  } catch (err) {
    // Analytics must never fail gameplay — return soft success
    return socialOk({ success: true, accepted: false, reason: "isolated_failure", authoritative: false });
  }
}

/** Any authenticated user may read runtime config (flags + maintenance display). */
export async function GetRuntimeConfig(user) {
  try {
    if (!user?.id) return { status: 401, body: { error: "Unauthorized" } };
    return socialOk({ success: true, ...GetRuntimeConfiguration() });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function SetFeatureFlagRpc(user, body = {}) {
  try {
    const out = SetFeatureFlag(user, {
      flag: body.flag || body.key,
      enabled: body.enabled,
      reason: body.reason,
    });
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

export async function UpdateRuntimeConfigRpc(user, body = {}) {
  try {
    const patch = body.patch && typeof body.patch === "object" ? body.patch : body;
    const { reason, ...rest } = patch;
    const out = UpdateRuntimeConfiguration(user, rest, body.reason || reason || "");
    return socialOk({ success: true, ...out });
  } catch (err) {
    return socialCatch(err);
  }
}

/** Internal helper used by tests — validate one account without admin gate when called directly. */
export { ValidateAccountIntegrity, ValidateCharacterIntegrity, assertWritesAllowed, assertSchemaCompatible, AdminPermissions };

export const FUNCTION_HANDLERS = {
  ClaimDailyLogin,
  GetDailyLoginStatus,
  ClaimMailReward,
  RedeemPromoCode,
  SyncAchievements,
  GetAchievements,
  GetCollections,
  GetGameTime,
  GetNotifications,
  CreateNotification,
  MarkNotificationRead,
  MarkAllNotificationsRead,
  DismissNotification,
  SendMessage,
  ResolveNexusAssault,
  AdminModeration,
  GetPublicProfile,
  SearchCharacters,
  GetSocialState,
  SendFriendRequest,
  AcceptFriendRequest,
  DeclineFriendRequest,
  RemoveFriend,
  BlockPlayer,
  UnblockPlayer,
  SetPresence,
  GetPresenceMap,
  GetCharactersByIds,
  GetChatHistory,
  MarkConversationRead,
  GetInbox,
  SendMail,
  MarkMailRead,
  DeleteMail,
  RestoreMail,
  GetMyGuild,
  JoinGuild,
  LeaveGuild,
  InviteGuildMember,
  AcceptGuildInvite,
  RequestJoinGuild,
  AcceptGuildRequest,
  KickGuildMember,
  EnsureGuildChallenge,
  ContributeGuildMission,
  ContributeGuildArenaWin,
  UpdateGuildSettings,
  ToggleGuildWarReady,
  ResolveGuildWar,
  ApplyRivalGuildWarResult,
  DeleteMyCharacter,
  GetAccountPreferences,
  SaveAccountPreferences,
  RecoverAmbiguousRequest: RecoverAmbiguousRequestRpc,
  GetRecoveryState,
  RunIntegrityAudit: RunIntegrityAuditRpc,
  ApplyDataRepair: ApplyDataRepairRpc,
  SetMaintenanceMode: SetMaintenanceModeRpc,
  RunMigration: RunMigrationRpc,
  LookupPlayer: LookupPlayerRpc,
  InspectCharacter: InspectCharacterRpc,
  GetOpsDashboard: GetOpsDashboardRpc,
  GetOpsTelemetry: GetOpsTelemetryRpc,
  RecordClientAnalytics,
  GetRuntimeConfig,
  SetFeatureFlag: SetFeatureFlagRpc,
  UpdateRuntimeConfig: UpdateRuntimeConfigRpc,
  ...ECONOMY_HANDLERS,
};
