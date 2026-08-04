/**
 * Critical #2 follow-on economy handlers (arena/dungeon/ship/mining/casino/slots/weekly/guild).
 */
import { entities } from "../entities.js";
import { withTransactionAsync, db, nowIso } from "../db.js";
import { clock } from "../shared/time/clock.js";
import { getUserById } from "../auth.js";
import {
  assertMiningClientSafe,
  assertMiningFinished,
  buildMiningClearPatch,
  buildMiningStartPatch,
  serializeMiningState,
} from "../shared/miningService.js";
import {
  assertDungeonClientSafe,
  assertCooldownClear,
  assertCooldownActive,
  assertDungeonProgressAllowed,
  assertContinueCredit,
  consumeContinueCreditPatch,
  buildCooldownPatch,
  clearCooldownPatch,
  pendingCombatMatches,
  serializeDungeonState,
  deathsToday,
  DUNGEON_CONTINUE_COST,
  DUNGEON_SKIP_COST,
  DUNGEON_DEATHS_PER_DAY,
} from "../shared/dungeonService.js";
import {
  debitNova,
  creditNova,
  debitStardust,
  creditStardust,
  hasNova,
  readNovaHalfUnits,
  toNovaHalfUnits,
  getBalances,
  resolveNovaPackage,
  NOVA_PACKAGES,
  novaDebitPatch,
  novaCreditPatch,
  recoverTransaction,
} from "../shared/currencyService.js";
import { randomItem } from "../shared/rewards.js";
import { getCollectionPercentage, applyXpBonus } from "../shared/collectionBonus.js";
import { mergeAchievementUnlocks } from "../shared/achievements.js";
import { notifyAchievementsUnlocked, tryCreateNotification } from "../shared/notificationService.js";
import {
  mergeDiscoveredGear,
  mergeSpeciesDiscovery,
  rollCombatCollectibleDiscoveries,
} from "../shared/discovery.js";
import { collectGrant, grantItemOrPending, countBagOccupancy } from "../shared/inventoryGrant.js";
import {
  acceptServerPendingLoot,
  dissolveServerPendingLoot,
} from "../rewards/pending.js";
import {
  todayET,
  applyXpToCharacter,
  consumeProgression,
  rollItemRarity,
  randomConsumable,
  getInventoryCap,
  computeStardustValue,
  clampStardust,
  FUEL_MAX,
  STARTER_SHIP,
  SHIP_TYPES,
  SHIP_MODS,
  getActiveShipId,
  getShipModIds,
  getTierCost,
  getNextModTier,
  computeMaxFuelForLoadout,
  ARENA_DAILY_FREE_BATTLES,
  ARENA_PAID_BATTLE_COST,
  ARENA_REFRESH_COST,
  ARENA_SKIP_COST,
  computeArenaRewards,
  getArenaRewardedWinsState,
  rollDungeonRegularRarity,
  rollDungeonBossRarity,
  DUNGEON_ENEMIES_PER_PLANET,
  DUNGEON_PATROL_REWARD_MULT,
  DUNGEON_MILESTONE_EVERY,
  DUNGEON_STORY_PLANETS,
  getEnemyDru,
  getDungeonEnemyLevel,
  druToRewards,
  grantFrontierShipMod,
  WEEKLY_NOVA_QUESTS,
  ensureWeeklyNovaState,
  progressWeeklyNovaQuest,
  NOVA_CASINO_OPEN,
  CASINO_MAX_NOVA_BET,
  CASINO_WHEEL_TIERS,
  getCasinoMaxStardustBet,
  GUILD_CREATE_COST,
  GUILD_WAR_DECLARE_COST,
  GUILD_WAR_READY_HOURS,
  CHARACTER_SLOT_COST,
  CHARACTER_MAX_SLOTS,
  SCOUT_MILESTONE_LEVEL,
  SCOUT_MILESTONE_MOD_ID,
  NAME_CHANGE_COST,
  GUILD_WAR_SIM_COST,
  dismissActiveBuff,
} from "../shared/economyFormulas.js";
import { assertNameHasNoDigits } from "../shared/nameRules.js";
import {
  grantEntitlement,
  resolveCharacterSlotCapacity,
  consumeEntitlement,
  resolveQuantity,
  EntitlementErrors,
} from "../entitlements/index.js";
import {
  completeDirectChallenge,
  settleBotAsOpponent,
} from "../arena/index.js";
import { ArenaError } from "../arena/errors.js";
import {
  auditCasinoSettle,
  auditMiningEvent,
  auditDungeonBattle,
  newCorrelationId,
} from "../audit/index.js";
import { resolveSelectedCharacter } from "../gameplayContext.js";
import {
  prepareDungeonCombatForCharacter,
  readDungeonPendingCombat,
  publicCombatResult,
  maxPlayerHitFromCombat,
  prepareArenaCombatForCharacter,
  readArenaPendingCombat,
  clearArenaPendingCombat,
} from "../shared/combatService.js";
import {
  assertArenaClientSafe,
  assertArenaCooldownClear,
  assertArenaCooldownActive,
  buildArenaCooldownPatch,
  clearArenaCooldownPatch,
  serializeArenaState,
  generateAndStoreArenaOffers,
  resolveOfferCombatant,
  listArenaLeaderboard,
  isArenaCooldownActive,
  ARENA_BATTLE_COOLDOWN_MS,
} from "../shared/arenaService.js";
import {
  assertCasinoClientSafe,
  serializeCasinoState,
  validateCasinoBetAmount,
  resolveCasinoOutcome,
  normalizeCasinoGameId,
  CASINO_RULES_VERSION,
} from "../shared/casinoService.js";
import {
  serializeCharacterStatistics,
  serializePublicProfileStatistics,
  serializeLeaderboardPage,
  getNearbyArenaEntries,
  STATISTIC_DEFINITIONS,
  LEADERBOARD_DEFINITIONS,
} from "../shared/statisticsService.js";
import { secureRandom, secureRandomInt } from "../rewards/rng.js";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

function normalizeOperationKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(key)) {
    httpErr(400, "Invalid request_id");
  }
  return key;
}

function getWalletOperation(accountId, operationType, operationKey) {
  if (!operationKey) return null;
  const row = db.prepare(`
    SELECT result_json
    FROM wallet_operations
    WHERE account_id = ? AND operation_type = ? AND operation_key = ?
  `).get(accountId, operationType, operationKey);
  if (!row) return null;
  try {
    return JSON.parse(row.result_json);
  } catch {
    return {};
  }
}

function saveWalletOperation(accountId, operationType, operationKey, result) {
  if (!operationKey) return;
  db.prepare(`
    INSERT INTO wallet_operations (
      account_id, operation_type, operation_key, result_json, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    accountId,
    operationType,
    operationKey,
    JSON.stringify(result || {}),
    clock.nowIso(),
  );
}

function syncPurchasedSlotsColumn(accountId) {
  const slots = resolveCharacterSlotCapacity(accountId);
  const purchased = Math.max(0, slots.capacity - slots.base);
  db.prepare("UPDATE users SET purchased_slots = ?, updated_date = ? WHERE id = ?").run(
    purchased,
    nowIso(),
    accountId
  );
  return { ...slots, purchased };
}

/** Resolve the account-global selected owned Character. */
export function requireMyChar(user) {
  return resolveSelectedCharacter(user);
}

function wrap(fn) {
  return async (user, body) => {
    try {
      const result = await withTransactionAsync(async () => fn(user, body || {}));
      return { status: 200, body: result };
    } catch (err) {
      if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
      if (err.code && String(err.code).startsWith("ENTITLEMENT_")) {
        return { status: 400, body: { error: err.message, code: err.code } };
      }
      throw err;
    }
  };
}

function grantOrCompensate(ch, itemPayload, _patch) {
  return grantItemOrPending(ch, itemPayload);
}

function stripShopNoise(item) {
  if (!item) return null;
  const { _cost, _slotId, cost, nova_cost, ...rest } = item;
  return rest;
}

// ── Arena ────────────────────────────────────────────────────
export const SyncArenaDay = wrap((user, body = {}) => {
  assertArenaClientSafe(body);
  const ch = requireMyChar(user);
  const today = todayET();
  let left = ch.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
  let character = ch;
  let patched = false;
  if (ch.arena_attempts_date !== today) {
    left = ARENA_DAILY_FREE_BATTLES;
    character = entities.Character.update(ch.id, {
      arena_attempts_left: left,
      arena_attempts_date: today,
    });
    patched = true;
  }
  const arena = serializeArenaState(character, clock.nowMs(), today);
  return {
    success: true,
    patched,
    arena,
    arena_attempts_left: left,
    arena_attempts_date: today,
    character,
  };
});

export const GetArenaStatus = wrap((user, body = {}) => {
  assertArenaClientSafe(body);
  const ch = requireMyChar(user);
  const today = todayET();
  const arena = serializeArenaState(ch, clock.nowMs(), today);
  return { success: true, arena, character: ch, balances: getBalances(ch) };
});

export const GetArenaOpponents = wrap((user, body = {}) => {
  assertArenaClientSafe(body);
  let ch = requireMyChar(user);
  const force = !!body.refresh || !!body.force;
  const result = generateAndStoreArenaOffers(ch, { force });
  ch = result.character;
  return {
    success: true,
    opponents: result.offers,
    expires_at: result.expires_at,
    replay: result.replay,
    arena: serializeArenaState(ch, clock.nowMs(), todayET()),
    character: ch,
  };
});

export const GetArenaLeaderboard = wrap((user, body = {}) => {
  assertArenaClientSafe(body);
  const ch = requireMyChar(user);
  const page = serializeLeaderboardPage({
    limit: body.limit,
    offset: body.offset,
  });
  const arena = serializeArenaState(ch, clock.nowMs(), todayET());
  const out = {
    success: true,
    leaderboard_id: page.leaderboard_id,
    rankings: page.rankings,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    has_more: page.has_more,
    arena,
    player_rank: arena.rank_position,
  };
  if (body.nearby) {
    out.nearby = getNearbyArenaEntries(ch.id, {
      radius: body.nearby_radius ?? body.radius ?? 5,
    });
  }
  return out;
});

/** Owner career statistics — serialize Character settlement counters only. */
export const GetCharacterStatistics = wrap((user, body = {}) => {
  if (body && typeof body === "object") {
    for (const k of Object.keys(body)) {
      if (
        /^(missions_completed|arena_wins|arena_losses|dungeon_clears|highest_damage|total_stardust|leaderboard_score|rank)$/i.test(
          k
        ) ||
        /^(set|increment|mutate)_/i.test(k)
      ) {
        httpErr(400, "Client statistic mutation rejected", "STAT_CLIENT_MUTATION");
      }
    }
  }
  const ch = requireMyChar(user);
  const statistics = serializeCharacterStatistics(ch, { includePrivate: true });
  return {
    success: true,
    statistics,
    definitions: STATISTIC_DEFINITIONS,
    leaderboards: LEADERBOARD_DEFINITIONS,
  };
});

/**
 * Public profile statistics for another character (no currency / earned totals).
 * body.character_id required.
 */
export const GetPublicProfileStatistics = wrap((user, body = {}) => {
  requireMyChar(user); // auth gate
  const targetId = String(body.character_id || body.id || "").trim();
  if (!targetId) httpErr(400, "character_id required");
  const target = entities.Character.get(targetId);
  if (!target) httpErr(404, "Character not found");
  return {
    success: true,
    statistics: serializePublicProfileStatistics(target),
  };
});

export const RefreshArenaOpponents = wrap((user, body = {}) => {
  assertArenaClientSafe(body);
  let ch = requireMyChar(user);
  const charge = !!body.charge;
  if (charge) {
    if ((ch.stardust || 0) < ARENA_REFRESH_COST) httpErr(400, "Not enough stardust");
    ch = entities.Character.update(ch.id, {
      stardust: (ch.stardust || 0) - ARENA_REFRESH_COST,
    });
  }
  const result = generateAndStoreArenaOffers(ch, { force: true });
  return {
    success: true,
    charged: charge,
    cost: charge ? ARENA_REFRESH_COST : 0,
    opponents: result.offers,
    expires_at: result.expires_at,
    arena: serializeArenaState(result.character, clock.nowMs(), todayET()),
    character: result.character,
    balances: getBalances(result.character),
  };
});

export const SkipArenaCooldown = wrap((user, body = {}) => {
  assertArenaClientSafe(body);
  const ch = requireMyChar(user);
  assertArenaCooldownActive(ch);
  const requestId = String(body?.request_id || body?.idempotencyKey || "").trim();
  if (requestId) {
    const prior = recoverTransaction(user.id, "arena_cooldown_skip", requestId);
    if (prior) {
      const live = entities.Character.get(ch.id) || ch;
      return {
        success: true,
        patch: {},
        arena: serializeArenaState(live, clock.nowMs(), todayET()),
        character: live,
        balances: getBalances(live),
        transaction: prior,
        idempotent_replay: true,
      };
    }
  }
  const mut = debitNova({
    user,
    character: ch,
    amount: ARENA_SKIP_COST,
    category: "arena_cooldown_skip",
    reasonCode: "arena_cooldown_skip",
    idempotencyKey: requestId || undefined,
    extraPatch: clearArenaCooldownPatch(),
  });
  return {
    success: true,
    patch: mut.patch,
    arena: serializeArenaState(mut.character, clock.nowMs(), todayET()),
    character: mut.character,
    balances: mut.balances,
    transaction: mut.transaction,
    idempotent_replay: !!mut.replay,
  };
});

/**
 * Authoritative Arena combat prepare — shared simulator, committed pending.
 * Client supplies offer_id only (not winner/stats).
 */
export const PrepareArenaCombat = wrap((user, body = {}) => {
  assertArenaClientSafe(body);
  let ch = requireMyChar(user);
  const offerId = String(body.offer_id || body.offerId || "").trim();
  if (!offerId) httpErr(400, "offer_id required", "ARENA_OFFER_REQUIRED");

  const today = todayET();
  let freeLeft = ch.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
  if (ch.arena_attempts_date !== today) freeLeft = ARENA_DAILY_FREE_BATTLES;

  const skipRequested = !!body.skip_cooldown || !!body.skipped;
  const cooldownWasActive = isArenaCooldownActive(ch);
  const skipCooldown = skipRequested && cooldownWasActive;
  const wantFree = body.is_free != null ? !!body.is_free : freeLeft > 0;
  const useFree = wantFree && freeLeft > 0;

  assertArenaCooldownClear(ch, { skip: skipCooldown });

  let novaCost = 0;
  if (skipCooldown) novaCost += ARENA_SKIP_COST;
  if (!useFree) novaCost += ARENA_PAID_BATTLE_COST;
  if (novaCost > 0 && !hasNova(ch, novaCost)) {
    httpErr(400, "Not enough Nova Crystals", "INSUFFICIENT_NOVA");
  }

  const resolved = resolveOfferCombatant(ch, offerId);
  const existing = readArenaPendingCombat(ch);
  if (
    existing?.combat_id &&
    String(existing.meta?.offer_id || "") === offerId &&
    existing.winner &&
    Array.isArray(existing.events)
  ) {
    return {
      success: true,
      combat: publicCombatResult(existing),
      opponent: resolved.publicOpponent,
      offer_id: offerId,
      arena: serializeArenaState(ch, clock.nowMs(), today),
      character: ch,
      replay: true,
      is_free: existing.meta?.is_free !== false,
    };
  }

  const prepared = prepareArenaCombatForCharacter(ch, {
    offerId,
    combatant: resolved.combatant,
    opponentItems: resolved.items,
    opponentSummary: resolved.publicOpponent,
    arenaBotId: resolved.arena_bot_id,
    realCharacterId: resolved.realCharacterId,
    isBot: resolved.isBot,
    opponentRating: resolved.combatant.arena_rating || 1000,
    skipCooldown,
    isFree: useFree,
    rng: secureRandom,
  });
  ch = prepared.character;

  // Persist entitlement intent on pending meta only — Nova charged on Finish so
  // failed prepare never spends. (Combat already committed.)
  return {
    success: true,
    combat: publicCombatResult(prepared.combat),
    opponent: resolved.publicOpponent,
    offer_id: offerId,
    arena: serializeArenaState(ch, clock.nowMs(), today),
    character: ch,
    replay: prepared.replay,
    is_free: useFree,
    estimated_nova_cost: novaCost,
  };
});

export const FinishArenaBattle = wrap((user, body = {}) => {
  // Direct challenges keep rating settlement via challenge snapshot.
  if (body.challenge_id || body.challengeId) {
    // Legacy: direct-challenge completion still accepts client won until
    // challenge PrepareCombat is restored. Ladder path never trusts won.
    const legacyChallengeWon = !!body.won;
    assertArenaClientSafe(body);
    const challengeId = body.challenge_id || body.challengeId;
    let dc;
    try {
      const ch0 = requireMyChar(user);
      const pending = readArenaPendingCombat(ch0);
      const wonFromPending =
        pending && String(pending.meta?.challenge_id || "") === String(challengeId)
          ? pending.winner === "player"
          : null;
      const won = wonFromPending != null ? wonFromPending : legacyChallengeWon;
      dc = completeDirectChallenge(user, {
        challengeId,
        won,
        policyVersion: body.policyVersion,
      });
    } catch (err) {
      if (err instanceof ArenaError) httpErr(err.status || 400, err.message, err.code);
      throw err;
    }

    const ch = dc.character || requireMyChar(user);
    const actuallyWon = typeof dc.won === "boolean" ? dc.won : legacyChallengeWon;
    const today = todayET();
    let freeLeft = ch.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
    let attemptsDate = ch.arena_attempts_date;
    if (attemptsDate !== today) {
      freeLeft = ARENA_DAILY_FREE_BATTLES;
      attemptsDate = today;
    }
    if (dc.replayed) {
      return {
        success: true,
        rewards: {
          won: actuallyWon,
          free: false,
          experience: 0,
          stardust: 0,
          arena_rating_delta: dc.ratingDelta,
          direct_challenge: true,
          replayed: true,
        },
        is_free: false,
        nova_spent: 0,
        patch: {},
        character: ch,
        challenge_id: challengeId,
        newly_unlocked: [],
        replayed: true,
        arena: serializeArenaState(ch, clock.nowMs(), today),
      };
    }

    const isFree = body.is_free != null ? !!body.is_free : freeLeft > 0;
    const useFree = isFree && freeLeft > 0;
    const skipCooldown = !!body.skip_cooldown || !!body.skipped;
    let novaCost = 0;
    if (skipCooldown) novaCost += ARENA_SKIP_COST;
    if (!useFree) novaCost += ARENA_PAID_BATTLE_COST;
    if (novaCost > 0 && !hasNova(ch, novaCost)) httpErr(400, "Not enough Nova Crystals");

    const ratingEligible = (dc.ratingDelta || 0) > 0 || !actuallyWon;
    const rewardMult = !actuallyWon ? 0 : ratingEligible ? 1 : 0.25;
    const rewardedState = getArenaRewardedWinsState(ch, today);
    const baseRewards = computeArenaRewards(
      ch,
      { arena_rating: dc.challenge?.opponentRatingAtStart || 1000 },
      actuallyWon,
      { free: useFree, rewardedWinsToday: rewardedState.wins },
    );
    const experience = Math.round((baseRewards.experience || 0) * rewardMult);
    const stardust = baseRewards.stardust_rewarded
      ? Math.round((baseRewards.stardust || 0) * (ratingEligible ? 1 : rewardMult))
      : 0;

    const patch = { ...buildArenaCooldownPatch() };
    applyXpToCharacter(ch, experience, patch);
    if (stardust > 0) {
      patch.stardust = (ch.stardust || 0) + stardust;
      patch.total_stardust_earned = (ch.total_stardust_earned || 0) + stardust;
    }
    if (baseRewards.stardust_rewarded) {
      patch.arena_rewarded_wins_today = rewardedState.wins + 1;
      patch.arena_rewarded_wins_date = rewardedState.date;
    }
    patch.arena_attempts_left = Math.max(0, freeLeft - (useFree ? 1 : 0));
    patch.arena_attempts_date = attemptsDate;
    if (novaCost > 0) Object.assign(patch, novaDebitPatch(ch, novaCost));
    if (actuallyWon) {
      const weekly = progressWeeklyNovaQuest(ch, "arena", 1);
      if (weekly) patch.weekly_nova_quests = weekly;
    }
    const ach = mergeAchievementUnlocks(ch, patch);
    Object.assign(patch, ach.patch);
    const progression = consumeProgression(patch);
    patch.arena_pending_combat = null;
    const character = entities.Character.update(ch.id, patch);
    if (ach.newly_unlocked?.length) {
      notifyAchievementsUnlocked(character.id, ach.newly_unlocked);
    }
    return {
      success: true,
      rewards: {
        ...baseRewards,
        experience,
        stardust,
        arena_rating_delta: dc.ratingDelta,
        won: actuallyWon,
      },
      is_free: useFree,
      nova_spent: novaCost,
      patch,
      character,
      progression,
      challenge_id: challengeId,
      newly_unlocked: ach.newly_unlocked,
      arena: serializeArenaState(character, clock.nowMs(), today),
      balances: getBalances(character),
    };
  }

  // ── Ladder / offer path (authoritative pending combat) ──
  assertArenaClientSafe(body);
  let ch = requireMyChar(user);
  const today = todayET();
  const nowMs = clock.nowMs();
  const combatIdReq = body.combat_id ? String(body.combat_id).trim() : "";
  const offerId = String(body.offer_id || body.offerId || "").trim();

  if (combatIdReq) {
    const replay = getWalletOperation(user.id, "finish_arena", combatIdReq);
    if (replay) {
      return {
        success: true,
        ...replay,
        patch: {},
        arena: serializeArenaState(ch, nowMs, today),
        character: ch,
        balances: getBalances(ch),
        idempotent_replay: true,
      };
    }
  }

  const pending = readArenaPendingCombat(ch);
  if (!pending?.combat_id || !pending.winner) {
    httpErr(409, "No matching pending Arena combat", "ARENA_NO_PENDING");
  }
  if (combatIdReq && combatIdReq !== pending.combat_id) {
    httpErr(409, "combat_id does not match pending Arena combat", "ARENA_COMBAT_MISMATCH");
  }
  if (offerId && pending.meta?.offer_id && offerId !== pending.meta.offer_id) {
    httpErr(409, "offer_id does not match pending Arena combat", "ARENA_OFFER_MISMATCH");
  }

  const priorSettle = getWalletOperation(user.id, "finish_arena", pending.combat_id);
  if (priorSettle) {
    if (ch.arena_pending_combat) {
      ch = clearArenaPendingCombat(ch.id);
    }
    return {
      success: true,
      ...priorSettle,
      patch: {},
      arena: serializeArenaState(ch, nowMs, today),
      character: ch,
      balances: getBalances(ch),
      idempotent_replay: true,
    };
  }

  const won = pending.winner === "player";
  const combatId = pending.combat_id;
  const meta = pending.meta || {};

  let freeLeft = ch.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
  let attemptsDate = ch.arena_attempts_date;
  if (attemptsDate !== today) {
    freeLeft = ARENA_DAILY_FREE_BATTLES;
    attemptsDate = today;
  }
  const useFree = meta.is_free !== false && freeLeft > 0;
  const skipCooldown = !!meta.skip_cooldown;

  // If cooldown still active and skip was not prepared, reject.
  if (!skipCooldown) {
    try {
      assertArenaCooldownClear(ch);
    } catch (err) {
      // Allow finish if cooldown started after prepare (same match).
      if (ch.arena_last_battle_at && ch.arena_pending_combat) {
        /* settle anyway — match already simulated */
      } else {
        throw err;
      }
    }
  }

  let novaCost = 0;
  if (skipCooldown) novaCost += ARENA_SKIP_COST;
  if (!useFree) novaCost += ARENA_PAID_BATTLE_COST;
  if (novaCost > 0 && !hasNova(ch, novaCost)) {
    httpErr(400, "Not enough Nova Crystals", "INSUFFICIENT_NOVA");
  }

  const oppRating = meta.opponent_rating || 1000;
  const rewardedState = getArenaRewardedWinsState(ch, today);
  const rewards = computeArenaRewards(
    ch,
    { arena_rating: oppRating },
    won,
    { free: useFree, rewardedWinsToday: rewardedState.wins },
  );
  const collectPct = getCollectionPercentage(ch, 0);
  const boostedXp = won ? applyXpBonus(rewards.experience, collectPct) : 0;
  const stardustGain = rewards.stardust_rewarded ? (rewards.stardust || 0) : 0;
  const maxHit = maxPlayerHitFromCombat(pending);

  const patch = {
    arena_pending_combat: null,
    ...buildArenaCooldownPatch(),
  };
  applyXpToCharacter(ch, boostedXp, patch);

  if (rewards.stardust_rewarded) {
    patch.arena_rewarded_wins_today = rewardedState.wins + 1;
    patch.arena_rewarded_wins_date = rewardedState.date;
  } else if (rewardedState.date !== ch.arena_rewarded_wins_date) {
    patch.arena_rewarded_wins_today = rewardedState.wins;
    patch.arena_rewarded_wins_date = rewardedState.date;
  }

  const prevRating = ch.arena_rating || 1000;
  const newRating = Math.max(0, prevRating + rewards.arena_rating_delta);
  const prevStreak = ch.arena_streak || 0;
  const newStreak = won ? prevStreak + 1 : 0;
  patch.arena_rating = newRating;
  patch.arena_wins = (ch.arena_wins || 0) + (won ? 1 : 0);
  patch.arena_losses = (ch.arena_losses || 0) + (won ? 0 : 1);
  patch.arena_streak = newStreak;
  patch.arena_max_streak = Math.max(ch.arena_max_streak || 0, newStreak);
  patch.arena_battles = (ch.arena_battles || 0) + 1;
  patch.arena_attempts_left = Math.max(0, freeLeft - (useFree ? 1 : 0));
  patch.arena_attempts_date = attemptsDate;
  if (novaCost > 0) Object.assign(patch, novaDebitPatch(ch, novaCost));
  if (maxHit > 0) patch.highest_damage = Math.max(ch.highest_damage || 0, maxHit);
  if (won && meta.opponent_summary?.speciesId) {
    mergeSpeciesDiscovery(ch, patch, meta.opponent_summary.speciesId);
  }
  let discoveries = [];
  if (won) {
    const rolled = rollCombatCollectibleDiscoveries(ch, patch, { win: true });
    discoveries = rolled.found;
  }
  if (won) {
    const weekly = progressWeeklyNovaQuest(ch, "arena", 1);
    if (weekly) patch.weekly_nova_quests = weekly;
  }
  const ach = mergeAchievementUnlocks(ch, patch);
  Object.assign(patch, ach.patch);

  // Stardust via shared ledger when awarding (atomic with counter in same Character update).
  if (stardustGain > 0) {
    patch.stardust = (ch.stardust || 0) + stardustGain;
    patch.total_stardust_earned = (ch.total_stardust_earned || 0) + stardustGain;
  }

  const progression = consumeProgression(patch);
  let character = entities.Character.update(ch.id, patch);
  if (ach.newly_unlocked?.length) {
    notifyAchievementsUnlocked(character.id, ach.newly_unlocked);
  }

  let botUpdate = null;
  const ladderId = meta.arena_bot_id || null;
  if (ladderId) {
    botUpdate = settleBotAsOpponent(ladderId, {
      playerWon: won,
      playerRatingDelta: rewards.arena_rating_delta,
    });
  }

  const rankBefore = serializeArenaState(
    { ...ch, arena_rating: prevRating },
    nowMs,
    today,
  ).rank_position;
  const arena = serializeArenaState(character, clock.nowMs(), today);

  const resultBody = {
    success: true,
    combat_id: combatId,
    winner: pending.winner,
    combat: publicCombatResult(pending),
    rewards: {
      ...rewards,
      experience: boostedXp,
      stardust: stardustGain,
      collectionPct: collectPct,
      rating_before: prevRating,
      rating_after: newRating,
      rank_before: rankBefore,
      rank_after: arena.rank_position,
    },
    is_free: useFree,
    nova_spent: novaCost,
    opponent: meta.opponent_summary || null,
    patch,
    character,
    progression,
    newly_unlocked: ach.newly_unlocked,
    discoveries,
    bot: botUpdate,
    arena,
    balances: getBalances(character),
  };

  saveWalletOperation(user.id, "finish_arena", combatId, {
    success: true,
    combat_id: combatId,
    winner: pending.winner,
    rewards: resultBody.rewards,
    is_free: useFree,
    nova_spent: novaCost,
    arena,
    balances: resultBody.balances,
  });

  try {
    const oppName = meta.opponent_summary?.name || "an opponent";
    const pname = character.name;
    entities.GalaxyNews.create({
      message: won
        ? `🚀 ${pname} defeated ${oppName} in the Arena.`
        : `💀 ${oppName} defeated ${pname} in the Arena.`,
      entry_type: won ? "victory" : "defeat",
      character_name: pname,
      character_id: character.id,
    });
    if (won && [5, 10, 15, 20].includes(newStreak)) {
      entities.GalaxyNews.create({
        message: `🔥 ${pname} is on a ${newStreak}-match win streak!`,
        entry_type: "streak",
        character_name: pname,
        character_id: character.id,
      });
    }
    if (!won && prevStreak >= 5) {
      entities.GalaxyNews.create({
        message: `💀 ${pname}'s ${prevStreak}-match win streak has ended.`,
        entry_type: "streak",
        character_name: pname,
        character_id: character.id,
      });
    }
  } catch {
    /* optional feed */
  }

  return resultBody;
});

export const RecoverArenaMatch = wrap((user, body = {}) => {
  assertArenaClientSafe(body);
  const ch = requireMyChar(user);
  const combatId = String(body.combat_id || "").trim();
  if (combatId) {
    const replay = getWalletOperation(user.id, "finish_arena", combatId);
    if (replay) {
      return {
        success: true,
        ...replay,
        character: ch,
        arena: serializeArenaState(ch, clock.nowMs(), todayET()),
        balances: getBalances(ch),
        recovered: true,
      };
    }
  }
  const pending = readArenaPendingCombat(ch);
  if (pending) {
    return {
      success: true,
      pending: true,
      combat: publicCombatResult(pending),
      combat_id: pending.combat_id,
      opponent: pending.meta?.opponent_summary || null,
      arena: serializeArenaState(ch, clock.nowMs(), todayET()),
      character: ch,
    };
  }
  return {
    success: true,
    pending: false,
    arena: serializeArenaState(ch, clock.nowMs(), todayET()),
    character: ch,
  };
});

// ── Dungeon ──────────────────────────────────────────────────
export const SyncDungeonState = wrap((user) => {
  const ch = requireMyChar(user);
  const today = todayET();
  const nowMs = clock.nowMs();
  const patch = {};
  if (ch.dungeon_deaths_date !== today) {
    patch.dungeon_deaths = 0;
    patch.dungeon_deaths_date = today;
    patch.dungeon_extra_lives = 0;
  }
  if ((ch.ship_mods || []).includes("Genesis Core") && (ch.dungeon_planet || 1) <= DUNGEON_STORY_PLANETS) {
    patch.dungeon_planet = DUNGEON_STORY_PLANETS + 1;
    patch.dungeon_enemy = 1;
  }
  let character = ch;
  if (Object.keys(patch).length) {
    character = entities.Character.update(ch.id, patch);
  }
  const dungeon = serializeDungeonState(character, nowMs, today);
  return {
    success: true,
    patched: Object.keys(patch).length > 0,
    patch: Object.keys(patch).length ? patch : undefined,
    dungeon,
    character,
  };
});

export const GetDungeonStatus = wrap((user) => {
  const ch = requireMyChar(user);
  const today = todayET();
  const dungeon = serializeDungeonState(ch, clock.nowMs(), today);
  return { success: true, dungeon, character: ch };
});

export const SkipDungeonCooldown = wrap((user, body = {}) => {
  assertDungeonClientSafe(body);
  const ch = requireMyChar(user);
  const requestId = String(body?.request_id || body?.idempotencyKey || "").trim();
  if (requestId) {
    const prior = recoverTransaction(user.id, "dungeon_cooldown_skip", requestId);
    if (prior) {
      const live = entities.Character.get(ch.id) || ch;
      return {
        success: true,
        patch: {},
        dungeon: serializeDungeonState(live, clock.nowMs(), todayET()),
        character: live,
        balances: getBalances(live),
        transaction: prior,
        idempotent_replay: true,
      };
    }
  }
  assertCooldownActive(ch);
  const mut = debitNova({
    user,
    character: ch,
    amount: DUNGEON_SKIP_COST,
    category: "dungeon_cooldown_skip",
    reasonCode: "dungeon_cooldown_skip",
    idempotencyKey: requestId || undefined,
    extraPatch: clearCooldownPatch(),
  });
  const dungeon = serializeDungeonState(mut.character, clock.nowMs(), todayET());
  return {
    success: true,
    patch: mut.patch,
    dungeon,
    character: mut.character,
    balances: mut.balances,
    transaction: mut.transaction,
    idempotent_replay: !!mut.replay,
  };
});

export const PayDungeonContinue = wrap((user, body = {}) => {
  assertDungeonClientSafe(body);
  const ch = requireMyChar(user);
  const today = todayET();
  if (deathsToday(ch, today) < DUNGEON_DEATHS_PER_DAY) {
    httpErr(400, "Continue fee not required", "DUNGEON_CONTINUE_NOT_NEEDED");
  }
  if (ch.dungeon_continue_credit) {
    const dungeon = serializeDungeonState(ch, clock.nowMs(), today);
    return {
      success: true,
      cost: 0,
      already_credited: true,
      patch: {},
      dungeon,
      character: ch,
      balances: getBalances(ch),
    };
  }
  const mut = debitNova({
    user,
    character: ch,
    amount: DUNGEON_CONTINUE_COST,
    category: "dungeon_continue",
    reasonCode: "dungeon_continue",
    extraPatch: { dungeon_continue_credit: true },
  });
  const dungeon = serializeDungeonState(mut.character, clock.nowMs(), today);
  return {
    success: true,
    cost: DUNGEON_CONTINUE_COST,
    patch: mut.patch,
    dungeon,
    character: mut.character,
    balances: mut.balances,
    transaction: mut.transaction,
  };
});

/**
 * Authoritative dungeon/wormhole combat simulation (Restoration 08 + 14).
 * Idempotent for the same planet_id + enemy_index + patrol keys.
 */
export const PrepareDungeonCombat = wrap((user, body) => {
  assertDungeonClientSafe(body);
  let ch = requireMyChar(user);
  if (body?.player || body?.enemy || body?.battle || body?.winner != null || body?.events) {
    httpErr(400, "Client combat payloads are not accepted", "CLIENT_COMBAT_REJECTED");
  }
  if (body?.rng_seed != null || body?.seed != null) {
    httpErr(400, "Client RNG seeds are not accepted", "CLIENT_RNG_REJECTED");
  }

  const today = todayET();
  const nowMs = clock.nowMs();
  assertCooldownClear(ch, nowMs);

  const encounter = assertDungeonProgressAllowed(ch, {
    planetId: body.planet_id ?? ch.dungeon_planet ?? 1,
    enemyIndex: body.enemy_index ?? ch.dungeon_enemy ?? 1,
    patrol: !!body.patrol,
    viewingWormhole: !!body.viewing_wormhole,
  });

  const existingPending = readDungeonPendingCombat(ch);
  const willReplay = pendingCombatMatches(existingPending, {
    planetId: encounter.planetId,
    enemyIndex: encounter.enemyIndex,
    patrol: encounter.patrol,
  });
  if (!willReplay) {
    assertContinueCredit(ch, today);
    const creditPatch = consumeContinueCreditPatch(ch, today);
    if (Object.keys(creditPatch).length) {
      ch = entities.Character.update(ch.id, creditPatch);
    }
  }

  const prepared = prepareDungeonCombatForCharacter(ch, {
    planetId: encounter.planetId,
    enemyIndex: encounter.enemyIndex,
    patrol: encounter.patrol,
    viewingWormhole: encounter.viewingWormhole,
    rng: secureRandom,
  });
  const pub = publicCombatResult(prepared.combat);
  const rawChar = prepared.character || ch;
  const { dungeon_pending_combat: _pending, ...safeCharacter } = rawChar;
  void _pending;
  const dungeon = serializeDungeonState(rawChar, nowMs, today);
  return {
    success: true,
    replay: prepared.replay,
    combat_id: prepared.combat.combat_id,
    planet_id: encounter.planetId,
    enemy_index: encounter.enemyIndex,
    patrol: encounter.patrol,
    viewing_wormhole: encounter.viewingWormhole,
    ...pub,
    enemy: pub.enemy,
    battle: pub.battle,
    dungeon,
    character: safeCharacter,
  };
});

export const FinishDungeonBattle = wrap((user, body) => {
  assertDungeonClientSafe(body);
  let ch = requireMyChar(user);
  const today = todayET();
  const nowMs = clock.nowMs();

  const planetId = Math.max(1, Math.floor(Number(body.planet_id) || ch.dungeon_planet || 1));
  const enemyIndex = Math.min(
    DUNGEON_ENEMIES_PER_PLANET,
    Math.max(1, Math.floor(Number(body.enemy_index) || ch.dungeon_enemy || 1)),
  );
  const patrol = !!body.patrol;
  const viewingWormhole = !!body.viewing_wormhole;
  const combatIdReq = body.combat_id ? String(body.combat_id).trim() : "";

  // Idempotent settle: same combat_id never pays twice.
  const settleKey = combatIdReq || "";
  if (settleKey) {
    const replay = getWalletOperation(user.id, "finish_dungeon", settleKey);
    if (replay) {
      return {
        success: true,
        ...replay,
        patch: {},
        dungeon: serializeDungeonState(ch, nowMs, today),
        character: ch,
        idempotent_replay: true,
      };
    }
  }

  // Authoritative combat — require committed pending. Never re-sim on Finish.
  const pending = readDungeonPendingCombat(ch);
  if (!pendingCombatMatches(pending, {
    planetId,
    enemyIndex,
    patrol,
    combatId: combatIdReq || null,
  })) {
    httpErr(409, "No matching pending dungeon combat", "DUNGEON_NO_PENDING");
  }

  assertDungeonProgressAllowed(ch, {
    planetId,
    enemyIndex,
    patrol,
    viewingWormhole,
  });

  const won = pending.winner === "player";
  const combatId = pending.combat_id;

  const priorSettle = getWalletOperation(user.id, "finish_dungeon", combatId);
  if (priorSettle) {
    // Pending may linger if a prior response was lost after wallet write — clear + replay.
    if (ch.dungeon_pending_combat) {
      ch = entities.Character.update(ch.id, { dungeon_pending_combat: null });
    }
    return {
      success: true,
      ...priorSettle,
      patch: {},
      dungeon: serializeDungeonState(ch, nowMs, today),
      character: ch,
      idempotent_replay: true,
    };
  }

  const mult = patrol ? DUNGEON_PATROL_REWARD_MULT : 1;
  const enemyLevel = getDungeonEnemyLevel(planetId, enemyIndex);
  const dru = getEnemyDru(planetId, enemyIndex) * mult;
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;
  let stardust = 0;
  let experience = 0;
  if (won) {
    const r = druToRewards(dru, enemyLevel);
    stardust = r.stardust;
    experience = r.experience;
  }

  const collectPct = getCollectionPercentage(ch, 0);
  const boostedXp = won ? applyXpBonus(experience, collectPct) : 0;
  const patch = { dungeon_pending_combat: null };
  applyXpToCharacter(ch, boostedXp, patch);

  const itemsGranted = [];
  const pendingLoot = [];
  let unlockedShipMod = null;
  if (won) {
    patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + stardust;
    patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + stardust;

    if (!patrol) {
      patch.dungeon_clears = (ch.dungeon_clears || 0) + (isBoss ? 1 : 0);
      if (isBoss) {
        if (planetId > DUNGEON_STORY_PLANETS) {
          patch.dungeon_planet = Math.max(ch.dungeon_planet || planetId, planetId) + 1;
          patch.dungeon_enemy = 1;
        } else if (planetId === DUNGEON_STORY_PLANETS) {
          const grant = grantFrontierShipMod(ch, planetId);
          patch.ship_mods = grant.ship_mods;
          if (grant.ship_mod_loadouts) patch.ship_mod_loadouts = grant.ship_mod_loadouts;
          unlockedShipMod = grant.unlockedLabel;
          if (grant.consolationStardust) {
            patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + grant.consolationStardust;
            patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + grant.consolationStardust;
          }
          patch.dungeon_planet = DUNGEON_STORY_PLANETS + 1;
          patch.dungeon_enemy = 1;
          patch.highest_sector = Math.max(ch.highest_sector || 1, DUNGEON_STORY_PLANETS);
        } else {
          patch.dungeon_planet = planetId + 1;
          patch.dungeon_enemy = 1;
          patch.highest_sector = Math.max(ch.highest_sector || 1, planetId + 1);
          const grant = grantFrontierShipMod(ch, planetId);
          patch.ship_mods = grant.ship_mods;
          if (grant.ship_mod_loadouts) patch.ship_mod_loadouts = grant.ship_mod_loadouts;
          unlockedShipMod = grant.unlockedLabel;
          if (grant.consolationStardust) {
            patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + grant.consolationStardust;
            patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + grant.consolationStardust;
          }
        }
      } else {
        patch.dungeon_enemy = Math.min(DUNGEON_ENEMIES_PER_PLANET, enemyIndex + 1);
      }
    }

    // Gear loot — first story defeat only (patrol = already cleared, no gear).
    // RNG via secureRandom (Node authority); settle-once via wallet_operations.
    let gear = null;
    if (!patrol) {
      const itemLevel = Math.max(1, enemyLevel || ch.level || 1);
      const rarity = isBoss
        ? rollDungeonBossRarity(secureRandom)
        : rollDungeonRegularRarity(secureRandom);
      gear = randomItem(rarity, itemLevel, undefined, secureRandom, ch.class);
    }
    const grantCtx = { accountId: user.id, characterId: ch.id };
    if (gear) {
      collectGrant(grantOrCompensate(ch, stripShopNoise(gear), patch), itemsGranted, pendingLoot, grantCtx);
    }

    if (secureRandom() < (patrol ? 0.1 : 0.2)) {
      const cons = stripShopNoise(randomConsumable(secureRandom));
      collectGrant(grantOrCompensate(ch, cons, patch), itemsGranted, pendingLoot, grantCtx);
    }

    const nextNodes = (ch.dungeon_nodes_cleared || 0) + 1;
    patch.dungeon_nodes_cleared = nextNodes;
    if (nextNodes % DUNGEON_MILESTONE_EVERY === 0) {
      const rarity = rollDungeonRegularRarity(secureRandom);
      const mile = randomItem(rarity, Math.max(1, enemyLevel || ch.level || 1), undefined, secureRandom, ch.class);
      collectGrant(grantOrCompensate(ch, stripShopNoise(mile), patch), itemsGranted, pendingLoot, grantCtx);
    }

    const weekly = progressWeeklyNovaQuest(
      { ...ch, weekly_nova_quests: patch.weekly_nova_quests || ch.weekly_nova_quests },
      "dungeon",
      1,
    );
    if (weekly) patch.weekly_nova_quests = weekly;
  } else {
    let deaths = ch.dungeon_deaths || 0;
    if (ch.dungeon_deaths_date !== today) deaths = 0;
    patch.dungeon_deaths = Math.min(DUNGEON_DEATHS_PER_DAY, deaths + 1);
    patch.dungeon_deaths_date = today;
  }

  const maxHit = maxPlayerHitFromCombat(pending);
  if (maxHit > 0) patch.highest_damage = Math.max(ch.highest_damage || 0, maxHit);
  const speciesId =
    pending._enemy_full?.speciesId ??
    pending._enemy_full?.species_id ??
    pending.enemy?.speciesId ??
    pending.enemy?.species_id ??
    null;
  if (won) mergeSpeciesDiscovery(ch, patch, speciesId);
  let discoveries = [];
  if (won) {
    const rolled = rollCombatCollectibleDiscoveries(ch, patch, { win: true });
    discoveries = rolled.found;
  }

  Object.assign(patch, buildCooldownPatch(won, nowMs));

  const ach = mergeAchievementUnlocks(ch, patch);
  Object.assign(patch, ach.patch);

  if (won) {
    mergeDiscoveredGear(ch, [
      ...itemsGranted,
      ...pendingLoot.map((p) => p.item),
    ], patch);
  }

  const progression = consumeProgression(patch);
  const character = entities.Character.update(ch.id, patch);
  if (ach.newly_unlocked?.length) {
    notifyAchievementsUnlocked(character.id, ach.newly_unlocked);
  }
  auditDungeonBattle({
    user,
    character: ch,
    won,
    beforeStardust: ch.stardust || 0,
    afterStardust: patch.stardust ?? ch.stardust ?? 0,
    rewards: {
      stardust,
      experience: boostedXp,
      planetId,
      enemyIndex,
    },
    items: itemsGranted,
    pendingLoot,
    correlationId: newCorrelationId(),
  });

  const receipt = {
    won,
    combat_id: combatId,
    rewards: {
      stardust,
      experience: boostedXp,
      base_experience: experience,
      dru: Math.round(dru * 100) / 100,
      enemyLevel,
      isBoss,
      patrol,
    },
    items: itemsGranted,
    pending_loot: pendingLoot,
    ship_mod: unlockedShipMod,
    newly_unlocked: ach.newly_unlocked,
    discoveries,
  };
  saveWalletOperation(user.id, "finish_dungeon", combatId, receipt);

  const dungeon = serializeDungeonState(character, nowMs, today);
  try {
    const pname = character.name;
    const label = patrol ? "patrolled" : isBoss ? "conquered a boss on" : "cleared an enemy on";
    entities.GalaxyNews.create({
      message: won
        ? `⚔️ ${pname} ${label} sector ${planetId}.`
        : `💀 ${pname} fell on sector ${planetId}.`,
      entry_type: won ? "victory" : "defeat",
      character_name: pname,
      character_id: character.id,
    });
  } catch {
    /* optional feed */
  }
  return {
    success: true,
    ...receipt,
    patch,
    dungeon,
    character,
    progression,
  };
});

// ── Ship ─────────────────────────────────────────────────────
export const BuyShip = wrap((user, body) => {
  const ch = requireMyChar(user);
  const shipId = body.ship_id;
  const ship = SHIP_TYPES[shipId];
  if (!ship) httpErr(400, "Unknown ship");
  if (shipId === STARTER_SHIP) httpErr(400, "Already owned");
  const owned = new Set([...(ch.owned_ships || [STARTER_SHIP]), STARTER_SHIP]);
  if (owned.has(shipId)) httpErr(400, "Already owned");
  if ((ch.level || 1) < (ship.unlock_level || 1)) httpErr(400, "Level too low");
  if (!hasNova(ch, ship.cost)) httpErr(400, "Not enough Nova Crystals");
  const loadouts = { ...(ch.ship_mod_loadouts || {}) };
  if (!Array.isArray(loadouts[shipId])) loadouts[shipId] = [];
  const patch = {
    ...novaDebitPatch(ch, ship.cost),
    owned_ships: [...owned, shipId],
    ship_mod_loadouts: loadouts,
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, ship_id: shipId, patch, character };
});

export const BuyShipMod = wrap((user, body) => {
  const ch = requireMyChar(user);
  const catKey = body.category_key;
  const shipId = body.ship_id || getActiveShipId(ch);
  if (!SHIP_MODS[catKey]) httpErr(400, "Unknown mod category");
  const owned = new Set([...(ch.owned_ships || [STARTER_SHIP]), STARTER_SHIP]);
  if (!owned.has(shipId)) httpErr(400, "Ship not owned");
  const tier = getNextModTier(ch, catKey, shipId);
  if (!tier) httpErr(400, "Category maxed");
  const cost = getTierCost(tier, shipId);
  if ((ch.stardust || 0) < cost) httpErr(400, "Not enough stardust");
  const loadouts = { ...(ch.ship_mod_loadouts || {}) };
  const current = Array.isArray(loadouts[shipId]) ? [...loadouts[shipId]] : [...getShipModIds(ch, shipId)];
  const newMods = [...current, tier.id];
  loadouts[shipId] = newMods;
  const patch = {
    stardust: (ch.stardust || 0) - cost,
    ship_mod_loadouts: loadouts,
  };
  if (tier.max_fuel_bonus && shipId === getActiveShipId(ch)) {
    const newMax = computeMaxFuelForLoadout(newMods, shipId);
    patch.max_fuel = newMax;
    patch.fuel = Math.min((ch.fuel ?? FUEL_MAX) + (newMax - (ch.max_fuel || FUEL_MAX)), newMax);
    patch.fuel_updated_at = new Date().toISOString();
  }
  const character = entities.Character.update(ch.id, patch);
  return { success: true, tier_id: tier.id, cost, patch, character };
});

export const ActivateShip = wrap((user, body) => {
  const ch = requireMyChar(user);
  const shipId = body.ship_id;
  if (!SHIP_TYPES[shipId]) httpErr(400, "Unknown ship");
  const owned = new Set([...(ch.owned_ships || [STARTER_SHIP]), STARTER_SHIP]);
  if (!owned.has(shipId)) httpErr(400, "Ship not owned");
  const loadouts = ch.ship_mod_loadouts || {};
  const newMods = loadouts[shipId] || [];
  const newMax = computeMaxFuelForLoadout(newMods, shipId);
  const patch = {
    active_ship: shipId,
    max_fuel: newMax,
    fuel: Math.min(ch.fuel ?? FUEL_MAX, newMax),
    fuel_updated_at: new Date().toISOString(),
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character };
});

// ── Mining (Node-authoritative AFK stardust sessions) ─────────
export const GetMiningStatus = wrap((user) => {
  const ch = requireMyChar(user);
  const mining = serializeMiningState(ch);
  return { success: true, mining, character: ch };
});

export const StartMining = wrap((user, body) => {
  assertMiningClientSafe(body);
  const ch = requireMyChar(user);
  if (ch.active_mission_id && ch.mission_end_time) {
    httpErr(400, "Ship busy on mission", "MINING_SHIP_BUSY");
  }
  if (ch.mining_end_time) httpErr(400, "Already mining", "MINING_ALREADY_ACTIVE");
  const nowMs = clock.nowMs();
  const patch = buildMiningStartPatch(ch, body.hours, nowMs);
  const character = entities.Character.update(ch.id, patch);
  const mining = serializeMiningState(character, nowMs);
  auditMiningEvent({
    user,
    character: ch,
    action: "mining_started",
    before: {
      mining_end_time: ch.mining_end_time || null,
      mining_reward: ch.mining_reward || 0,
      mining_start_time: ch.mining_start_time || null,
      mining_hours: ch.mining_hours ?? null,
    },
    after: patch,
    hours: patch.mining_hours,
  });
  return {
    success: true,
    hours: patch.mining_hours,
    patch,
    mining,
    character,
  };
});

export const CollectMining = wrap((user, body = {}) => {
  assertMiningClientSafe(body);
  const requestId = normalizeOperationKey(body?.request_id || body?.idempotencyKey);
  const replay = getWalletOperation(user.id, "collect_mining", requestId);
  if (replay) {
    const ch = requireMyChar(user);
    return {
      success: true,
      ...replay,
      patch: {},
      mining: serializeMiningState(ch),
      character: ch,
      idempotent_replay: true,
    };
  }

  const ch = requireMyChar(user);
  const nowMs = clock.nowMs();
  assertMiningFinished(ch, nowMs);
  const r = Math.max(0, Math.floor(Number(ch.mining_reward) || 0));
  const beforeStardust = ch.stardust || 0;
  const sessionId = serializeMiningState(ch, nowMs).mining_session_id;
  const clear = buildMiningClearPatch();
  const patch = {
    stardust: beforeStardust + r,
    total_stardust_earned: (ch.total_stardust_earned || 0) + r,
    ...clear,
  };
  const character = entities.Character.update(ch.id, patch);
  const mining = serializeMiningState(character, nowMs);
  if (r > 0) {
    tryCreateNotification({
      owner_id: character.id,
      type: "mining",
      title: "Mining complete",
      body: `Collected ${r.toLocaleString()} Stardust from your mining run.`,
      related_id: sessionId || null,
      priority: "normal",
      idempotency_key: sessionId
        ? `mining:${character.id}:${sessionId}`
        : `mining:${character.id}:${requestId || clock.nowMs()}`,
    });
  }
  auditMiningEvent({
    user,
    character: ch,
    action: "mining_collected",
    before: { stardust: beforeStardust, mining_reward: r },
    after: { stardust: patch.stardust, mining_reward: 0 },
    stardustGained: r,
  });
  const receipt = {
    request_id: requestId || null,
    stardust_gained: r,
    mining_session_id: sessionId,
  };
  saveWalletOperation(user.id, "collect_mining", requestId, receipt);
  return { success: true, ...receipt, patch, mining, character };
});

export const CancelMining = wrap((user, body = {}) => {
  assertMiningClientSafe(body);
  const ch = requireMyChar(user);
  if (!ch.mining_end_time) httpErr(400, "Not mining", "MINING_NOT_ACTIVE");
  const patch = buildMiningClearPatch();
  const character = entities.Character.update(ch.id, patch);
  const mining = serializeMiningState(character);
  auditMiningEvent({
    user,
    character: ch,
    action: "mining_cancelled",
    before: {
      mining_end_time: ch.mining_end_time,
      mining_reward: ch.mining_reward || 0,
      mining_start_time: ch.mining_start_time || null,
      mining_hours: ch.mining_hours ?? null,
    },
    after: patch,
  });
  return { success: true, patch, mining, character };
});

// ── Casino (server-authoritative rolls) ──────────────────────
export const GetCasinoState = wrap((user, body = {}) => {
  assertCasinoClientSafe(body);
  const ch = requireMyChar(user);
  const casino = serializeCasinoState(ch);
  return {
    success: true,
    casino,
    character: ch,
    balances: getBalances(ch),
  };
});

export const RecoverCasinoWager = wrap((user, body = {}) => {
  assertCasinoClientSafe(body);
  const ch = requireMyChar(user);
  const key = String(body.request_id || body.idempotencyKey || body.wager_id || "").trim();
  if (!key) httpErr(400, "request_id required");
  const prior = getWalletOperation(user.id, "casino_settle", key);
  if (!prior) {
    return {
      success: true,
      found: false,
      casino: serializeCasinoState(ch),
      character: ch,
      balances: getBalances(ch),
    };
  }
  const live = entities.Character.get(ch.id) || ch;
  return {
    success: true,
    found: true,
    ...prior,
    character: live,
    balances: getBalances(live),
    recovered: true,
  };
});

export const CasinoSettle = wrap((user, body = {}) => {
  assertCasinoClientSafe(body);
  const ch = requireMyChar(user);
  const betCheck = validateCasinoBetAmount(body.bet);
  if (!betCheck.ok) httpErr(400, betCheck.reason);
  const bet = betCheck.bet;
  const game = normalizeCasinoGameId(body.game);

  let settleKey = "";
  try {
    settleKey = normalizeOperationKey(body.request_id || body.idempotencyKey || "");
  } catch {
    settleKey = "";
  }
  if (!settleKey) {
    settleKey = `auto:${Date.now().toString(36)}_${Math.floor(secureRandom() * 1e9).toString(36)}`;
  }

  const prior = getWalletOperation(user.id, "casino_settle", settleKey);
  if (prior) {
    const live = entities.Character.get(ch.id) || ch;
    return {
      ...prior,
      character: live,
      balances: getBalances(live),
      casino: serializeCasinoState(live),
      idempotent_replay: true,
    };
  }

  // Affordability before roll — max loss is the wager for all recovered games.
  const live0 = entities.Character.get(ch.id) || ch;
  if (game === "dice" || game === "wheel") {
    if ((live0.stardust || 0) < bet) httpErr(400, "Not enough stardust");
  } else if (game === "flip" || game === "jackpot") {
    if (!NOVA_CASINO_OPEN) httpErr(400, "Crystal tables sealed");
    if (!hasNova(live0, bet)) httpErr(400, "Not enough Nova Crystals");
  }

  const resolved = resolveCasinoOutcome({
    gameId: game,
    bet,
    choice: body.choice,
    level: ch.level || 1,
    rng: secureRandom,
    randomInt: secureRandomInt,
  });

  const live = entities.Character.get(ch.id) || ch;
  const beforeStardust = live.stardust || 0;
  const beforeNova = live.nova_crystals || 0;

  if (resolved.currency === "stardust" && resolved.delta < 0 && (live.stardust || 0) < Math.abs(resolved.delta)) {
    httpErr(400, "Not enough stardust");
  }
  if (resolved.currency === "nova" && resolved.delta < 0 && !hasNova(live, Math.abs(resolved.delta))) {
    httpErr(400, "Not enough Nova Crystals");
  }

  let character = live;
  let patch = {};

  if (resolved.delta === 0) {
    const receipt = {
      success: true,
      push: true,
      wager_id: settleKey,
      game: resolved.game,
      bet,
      gross_wager: resolved.gross_wager,
      gross_payout: resolved.gross_payout,
      net_result: 0,
      delta_stardust: 0,
      delta_crystals: 0,
      outcome: resolved.outcome,
      rules_version: CASINO_RULES_VERSION,
      max_bet: getCasinoMaxStardustBet(ch.level || 1),
    };
    saveWalletOperation(user.id, "casino_settle", settleKey, receipt);
    auditCasinoSettle({
      user,
      character: live,
      game: resolved.game,
      bet,
      beforeStardust,
      afterStardust: beforeStardust,
      beforeNova,
      afterNova: beforeNova,
      outcome: resolved.outcome,
      correlationId: newCorrelationId(),
    });
    return {
      ...receipt,
      patch: {},
      character: live,
      balances: getBalances(live),
      casino: serializeCasinoState(live),
    };
  }

  let mut;
  if (resolved.currency === "stardust") {
    if (resolved.delta > 0) {
      mut = creditStardust({
        user,
        character: live,
        amount: resolved.delta,
        category: "casino_payout",
        reasonCode: "casino_settle",
        idempotencyKey: `casino_pay_${settleKey}`,
        relatedEntityType: "casino_wager",
        relatedEntityId: settleKey,
      });
    } else {
      mut = debitStardust({
        user,
        character: live,
        amount: Math.abs(resolved.delta),
        category: "casino_wager",
        reasonCode: "casino_settle",
        idempotencyKey: `casino_wager_${settleKey}`,
        relatedEntityType: "casino_wager",
        relatedEntityId: settleKey,
      });
    }
  } else if (resolved.delta > 0) {
    mut = creditNova({
      user,
      character: live,
      amount: resolved.delta,
      category: "casino_payout",
      reasonCode: "casino_settle",
      idempotencyKey: `casino_pay_${settleKey}`,
    });
  } else {
    mut = debitNova({
      user,
      character: live,
      amount: Math.abs(resolved.delta),
      category: "casino_wager",
      reasonCode: "casino_settle",
      idempotencyKey: `casino_wager_${settleKey}`,
    });
  }
  character = mut.character;
  patch = mut.patch || {};

  auditCasinoSettle({
    user,
    character: live,
    game: resolved.game,
    bet,
    beforeStardust,
    afterStardust: character.stardust || 0,
    beforeNova,
    afterNova: character.nova_crystals || 0,
    outcome: resolved.outcome,
    correlationId: newCorrelationId(),
  });

  const receipt = {
    success: true,
    wager_id: settleKey,
    game: resolved.game,
    bet,
    gross_wager: resolved.gross_wager,
    gross_payout: resolved.gross_payout,
    net_result: resolved.net_result,
    delta_stardust: resolved.currency === "stardust" ? resolved.delta : 0,
    delta_crystals: resolved.currency === "nova" ? resolved.delta : 0,
    outcome: resolved.outcome,
    rules_version: CASINO_RULES_VERSION,
    max_bet: getCasinoMaxStardustBet(ch.level || 1),
    balances: getBalances(character),
  };
  saveWalletOperation(user.id, "casino_settle", settleKey, receipt);

  return {
    ...receipt,
    patch,
    character,
    casino: serializeCasinoState(character),
  };
});

// ── Character slot ───────────────────────────────────────────
export const BuyCharacterSlot = wrap(async (user) => {
  const ch = requireMyChar(user);
  const freshUser = getUserById(user.id);
  const slots = resolveCharacterSlotCapacity(user.id);
  if (slots.capacity >= CHARACTER_MAX_SLOTS) {
    httpErr(400, "Max slots reached", EntitlementErrors.CHARACTER_SLOT_LIMIT_REACHED);
  }
  if (!hasNova(ch, CHARACTER_SLOT_COST)) httpErr(400, "Not enough Nova Crystals");

  const patch = { ...novaDebitPatch(ch, CHARACTER_SLOT_COST) };
  const character = entities.Character.update(ch.id, patch);

  await grantEntitlement({
    entitlementKey: "account.character_slot",
    accountId: user.id,
    quantity: 1,
    sourceType: "direct_purchase",
    sourceReferenceType: "nova_purchase",
    sourceReferenceId: `nova.character_slot:${ch.id}:${Date.now()}`,
    externalProvider: "internal_nova",
    externalProductId: "nova.character_slot",
    externalTransactionId: `nova-slot:${user.id}:${slots.extra + 1}`,
    idempotencyKey: `nova-slot:${user.id}:${slots.extra + 1}`,
    createdBy: user.email || user.id,
  });

  const synced = syncPurchasedSlotsColumn(user.id);
  return {
    success: true,
    purchased_slots: synced.purchased,
    character_slots: synced,
    patch,
    character,
    user: getUserById(user.id),
  };
});

// ── Weekly ───────────────────────────────────────────────────
export const ClaimWeeklyNovaQuest = wrap((user, body) => {
  const ch = requireMyChar(user);
  const questId = body.quest_id;
  const quest = WEEKLY_NOVA_QUESTS.find((q) => q.id === questId);
  if (!quest) httpErr(400, "Unknown quest");
  const state = ensureWeeklyNovaState(ch);
  if (state.claimed.includes(questId)) httpErr(400, "Already claimed");
  if ((state[quest.key] || 0) < quest.goal) httpErr(400, "Quest not complete");
  const nextState = { ...state, claimed: [...state.claimed, questId] };
  const patch = {
    weekly_nova_quests: nextState,
    ...novaCreditPatch(ch, quest.reward),
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, quest, patch, character };
});

/** Crystal pack catalog — finalized Restoration 15 grants (display Nova). */
export const CRYSTAL_PACKS = NOVA_PACKAGES;

function crystalPackGrantAllowed() {
  // Never free-grant in production.
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.CRYSTAL_PACK_DEV_GRANT === "0") return false;
  // Explicit opt-in always wins outside production (local + staging sandboxes).
  if (process.env.CRYSTAL_PACK_DEV_GRANT === "1") return true;
  // Staging / production-like envs require that explicit opt-in.
  const lootEnv = String(process.env.LOOT_ENVIRONMENT || "").toLowerCase();
  if (lootEnv === "staging" || lootEnv === "production") return false;
  // Bare local development defaults to allowed.
  return true;
}

/**
 * PurchaseCrystalPack — credits Nova for a catalog pack.
 * Production without CRYSTAL_PACK_DEV_GRANT returns 501 (Stripe not wired).
 * Non-production (and explicit DEV grant) grants immediately for local play.
 */
export const PurchaseCrystalPack = wrap((user, body) => {
  const packId = String(body.pack_id || body.packId || "").trim();
  const pack = resolveNovaPackage(packId);
  if (!pack) httpErr(400, "Unknown pack");
  if (!crystalPackGrantAllowed()) {
    httpErr(501, "Checkout coming soon — Stripe payment is being connected");
  }
  const ch = requireMyChar(user);
  const externalId = String(body.receipt_id || body.purchase_token || body.request_id || "").trim();
  const idem = externalId
    ? `nova_pack_${pack.id}_${externalId}`
    : `nova_pack_dev_${pack.id}_${ch.id}`;
  const mut = creditNova({
    user,
    character: ch,
    amount: pack.crystals,
    category: "nova_pack_grant",
    reasonCode: "nova_pack_grant",
    relatedEntityType: "product",
    relatedEntityId: pack.id,
    idempotencyKey: idem,
  });
  return {
    success: true,
    pack,
    crystals: pack.crystals,
    patch: mut.patch,
    character: mut.character,
    balances: mut.balances,
    transaction: mut.transaction,
    mode: "dev_grant",
    idempotent_replay: !!mut.replay,
  };
});

// ── Guild ────────────────────────────────────────────────────
export const CreateGuild = wrap((user, body) => {
  const ch = requireMyChar(user);
  const name = String(body.name || "").trim();
  if (!name) httpErr(400, "Guild needs a name");
  assertNameHasNoDigits(name, "Guild name");
  const tag = String(body.tag || "").trim().toUpperCase().slice(0, 4);
  const description = String(body.description || "").trim();
  if ((ch.stardust || 0) < GUILD_CREATE_COST) httpErr(400, "Not enough stardust");
  const existing = entities.GuildMember.filter({ character_id: ch.id }, null, 5);
  if (existing.length) httpErr(400, "Already in a guild");
  const nameTaken = entities.Guild.filter({ name }, null, 1);
  if (nameTaken.length) httpErr(400, "Name taken");

  const patch = { stardust: (ch.stardust || 0) - GUILD_CREATE_COST };
  const character = entities.Character.update(ch.id, patch);
  const guild = entities.Guild.create({
    name,
    tag,
    description,
    leader_id: ch.id,
    leader_name: ch.name,
    level: 1,
    experience: 0,
    experience_to_next: 1000,
    total_missions: 0,
    total_stardust: 0,
    member_count: 1,
  });
  const member = entities.GuildMember.create({
    guild_id: guild.id,
    character_id: ch.id,
    character_name: ch.name,
    character_level: ch.level,
    character_race: ch.race,
    role: "leader",
    contributed_missions: 0,
    contributed_stardust: 0,
    joined_date: new Date().toISOString(),
  });
  entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "create",
    message: "founded the guild",
    character_name: ch.name,
  });
  return { success: true, guild, member, patch, character };
});

export const DeclareGuildWar = wrap((user, body) => {
  const ch = requireMyChar(user);
  const defenderId = body.defender_guild_id;
  if (!defenderId) httpErr(400, "Missing defender_guild_id");
  if ((ch.stardust || 0) < GUILD_WAR_DECLARE_COST) httpErr(400, "Not enough stardust");

  const membership = entities.GuildMember.filter({ character_id: ch.id }, null, 5)[0];
  if (!membership) httpErr(400, "Not in a guild");
  if (!["leader", "officer"].includes(membership.role)) httpErr(403, "Officers only");

  const attackerGuild = entities.Guild.get(membership.guild_id);
  const defenderGuild = entities.Guild.get(defenderId);
  if (!attackerGuild || !defenderGuild) httpErr(404, "Guild not found");
  if (attackerGuild.id === defenderGuild.id) httpErr(400, "Cannot declare on yourself");

  const patch = { stardust: (ch.stardust || 0) - GUILD_WAR_DECLARE_COST };
  const character = entities.Character.update(ch.id, patch);
  const now = new Date();
  const deadline = new Date(now.getTime() + GUILD_WAR_READY_HOURS * 3600 * 1000);
  const war = entities.GuildWar.create({
    attacker_guild_id: attackerGuild.id,
    attacker_guild_name: attackerGuild.name,
    attacker_guild_tag: attackerGuild.tag || "",
    defender_guild_id: defenderGuild.id,
    defender_guild_name: defenderGuild.name,
    defender_guild_tag: defenderGuild.tag || "",
    status: "readying",
    declared_at: now.toISOString(),
    ready_deadline: deadline.toISOString(),
    initiated_by: ch.name,
    attacker_ready_count: 0,
    defender_ready_count: 0,
  });
  return { success: true, war, patch, character };
});

export const DismissFuelMount = wrap((user, body) => {
  const ch = requireMyChar(user);
  const mountId = body.mount_id;
  const expiresAt = body.expires_at;
  if (mountId == null) httpErr(400, "Missing mount_id");
  const next = (ch.active_fuel_mounts || []).filter(
    (m) => !(m.id === mountId && (!expiresAt || m.expires_at === expiresAt)),
  );
  const patch = { active_fuel_mounts: next };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character };
});

export const DismissActiveBuff = wrap((user, body) => {
  const ch = requireMyChar(user);
  const stat = body?.stat;
  if (!stat) httpErr(400, "Missing stat");
  const prepared = dismissActiveBuff(ch, {
    stat,
    expires_at: body?.expires_at,
    name: body?.name,
  });
  if (!prepared.ok) httpErr(400, prepared.reason || "Failed to remove Stim");
  const patch = { active_buffs: prepared.buffs };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character };
});

export const ClaimScoutMilestone = wrap((user) => {
  const ch = requireMyChar(user);
  if ((ch.level || 1) < SCOUT_MILESTONE_LEVEL) httpErr(400, "Level too low");
  if (ch.ship_milestones?.scout_bay) httpErr(409, "Already claimed");
  const loadouts = { ...(ch.ship_mod_loadouts || {}) };
  const scoutMods = Array.isArray(loadouts[STARTER_SHIP])
    ? [...loadouts[STARTER_SHIP]]
    : [...getShipModIds(ch, STARTER_SHIP)];
  if (!scoutMods.includes(SCOUT_MILESTONE_MOD_ID)) scoutMods.push(SCOUT_MILESTONE_MOD_ID);
  loadouts[STARTER_SHIP] = scoutMods;
  const patch = {
    ship_mod_loadouts: loadouts,
    ship_milestones: { ...(ch.ship_milestones || {}), scout_bay: true },
  };
  if (getActiveShipId(ch) === STARTER_SHIP) {
    const newMax = computeMaxFuelForLoadout(scoutMods, STARTER_SHIP);
    const oldMax = ch.max_fuel || FUEL_MAX;
    patch.max_fuel = newMax;
    patch.fuel = Math.min((ch.fuel ?? FUEL_MAX) + (newMax - oldMax), newMax);
    patch.fuel_updated_at = nowIso();
  }
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character };
});

export const RenameCharacter = wrap(async (user, body) => {
  const ch = requireMyChar(user);
  const name = String(body?.name || "").trim();
  if (!name || name.length < 2 || name.length > 24) httpErr(400, "Name must be 2–24 characters");
  assertNameHasNoDigits(name);
  const taken = entities.Character.filter({ name }, null, 5).filter((c) => c.id !== ch.id);
  if (taken.length) httpErr(409, "Name taken");

  const tokens = resolveQuantity({ entitlementKey: "account.rename_token", accountId: user.id });
  const useToken = body?.pay_with_nova !== true && tokens.quantity > 0;

  let patch;
  if (useToken) {
    await consumeEntitlement({
      entitlementKey: "account.rename_token",
      accountId: user.id,
      quantity: 1,
      operationId: body?.idempotencyKey || `rename-token:${user.id}:${ch.id}:${name}`,
      reason: "character_rename",
      target: { characterId: ch.id, name },
      createdBy: user.email || user.id,
    });
    patch = { name };
  } else {
    if (!hasNova(ch, NAME_CHANGE_COST)) httpErr(400, "Not enough Nova Crystals");
    patch = {
      name,
      ...novaDebitPatch(ch, NAME_CHANGE_COST),
    };
  }

  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character, used_rename_token: !!useToken && tokens.quantity > 0 };
});

/** Dissolve server-persisted pending loot for stardust. Requires pending_loot_id. */
export const DissolvePendingLoot = wrap((user, body) => {
  const pendingId = body?.pending_loot_id || body?.pendingLootId;
  if (!pendingId) httpErr(400, "Missing pending_loot_id — client item payloads are not accepted");
  return dissolveServerPendingLoot(user, pendingId);
});

/**
 * Accept server-persisted pending loot once inventory has room.
 * Client-submitted item bodies are ignored.
 */
export const AcceptPendingLoot = wrap((user, body) => {
  const pendingId = body?.pending_loot_id || body?.pendingLootId;
  if (!pendingId) httpErr(400, "Missing pending_loot_id — client item payloads are not accepted");
  return acceptServerPendingLoot(user, pendingId);
});

/**
 * Legacy guild war sim payout.
 * Client reward_stardust is ignored — server uses a fixed win/loss schedule.
 */
export const ApplyGuildWarResult = wrap((user, body) => {
  const ch = requireMyChar(user);
  const won = !!body.won;
  // Server-authoritative reward (scaled units). Client amounts are ignored.
  const capped = won ? 2500 * 10 : 500 * 10;
  const delta = -GUILD_WAR_SIM_COST + capped;
  const next = (ch.stardust || 0) + delta;
  if (next < 0) httpErr(400, "Not enough stardust for war chest");
  const patch = {
    stardust: next,
    total_stardust_earned: (ch.total_stardust_earned || 0) + Math.max(0, capped),
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, delta, patch, character, won, reward_stardust: capped };
});

export const ECONOMY_FOLLOW_ON_HANDLERS = {
  SyncArenaDay,
  GetArenaStatus,
  GetArenaOpponents,
  GetArenaLeaderboard,
  GetCharacterStatistics,
  GetPublicProfileStatistics,
  RefreshArenaOpponents,
  FinishArenaBattle,
  PrepareArenaCombat,
  RecoverArenaMatch,
  SkipArenaCooldown,
  SyncDungeonState,
  GetDungeonStatus,
  SkipDungeonCooldown,
  PayDungeonContinue,
  PrepareDungeonCombat,
  FinishDungeonBattle,
  BuyShip,
  BuyShipMod,
  ActivateShip,
  GetMiningStatus,
  StartMining,
  CollectMining,
  CancelMining,
  GetCasinoState,
  RecoverCasinoWager,
  CasinoSettle,
  BuyCharacterSlot,
  ClaimWeeklyNovaQuest,
  PurchaseCrystalPack,
  CreateGuild,
  DeclareGuildWar,
  DismissFuelMount,
  DismissActiveBuff,
  ClaimScoutMilestone,
  RenameCharacter,
  DissolvePendingLoot,
  AcceptPendingLoot,
  ApplyGuildWarResult,
};
