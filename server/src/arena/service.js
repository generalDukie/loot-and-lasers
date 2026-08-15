/**
 * Arena direct-challenge service — create, preview, complete (attacker-only rating).
 */

import { nanoid } from "nanoid";
import { entities } from "../entities.js";
import { todayET } from "../shared/economyFormulas.js";
import { clock } from "../shared/time/clock.js";
import {
  ARENA_RATING_POLICY_VERSION,
  ARENA_DEFAULT_RATING,
  CHALLENGE_LIMITS,
  CHALLENGE_TYPES,
  FARMING_SIGNAL_THRESHOLDS,
  DIRECT_CHALLENGE_RATING,
} from "./config.js";

const DATE_PART_PAD_WIDTH = 2;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
import { ArenaError, ArenaErrors } from "./errors.js";
import {
  assertOwnsCharacter,
  publicArenaCard,
  resolveEligibleOpponent,
} from "./eligibility.js";
import {
  computeDirectChallengeRatingDelta,
  estimateWinLoss,
  gapMultiplierForWin,
  repeatWinMultiplier,
} from "./rating.js";
import {
  auditArena,
  completeChallenge as storeComplete,
  countChallengesSince,
  emitArenaEvent,
  getActiveChallengeForAccount,
  getChallengeById,
  getChallengeByIdempotencyKey,
  getLatestChallengeCreatedAt,
  getPairBattleStats,
  incrementPairBattle,
  insertChallenge,
  normalizeAccountPairKey,
  normalizeCharacterPairKey,
} from "./store.js";

export function currentSeasonId(now = new Date()) {
  // Monthly season stub aligned with client getSeason().
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(DATE_PART_PAD_WIDTH, "0")}`;
}

export function currentPeriodId() {
  return todayET();
}

function hourAgoIso() {
  return new Date(Date.now() - MILLISECONDS_PER_HOUR).toISOString();
}

function assertChallengeLimits(accountId) {
  const active = getActiveChallengeForAccount(accountId);
  if (active) {
    if (active.expiresAt && new Date(active.expiresAt).getTime() < Date.now()) {
      // Allow new challenge; leave expired record for audit.
    } else if (active.status === "started" || active.status === "created") {
      throw new ArenaError(
        ArenaErrors.ARENA_ACTIVE_CHALLENGE_EXISTS,
        "Resolve your active direct challenge first",
        409,
        { challengeId: active.challengeId }
      );
    }
  }

  const lastAt = getLatestChallengeCreatedAt(accountId);
  if (lastAt) {
    const elapsed = Date.now() - new Date(lastAt).getTime();
    if (elapsed < CHALLENGE_LIMITS.createCooldownMs) {
      throw new ArenaError(
        ArenaErrors.ARENA_CHALLENGE_COOLDOWN,
        "Challenge cooldown active",
        429,
        { retryAfterMs: CHALLENGE_LIMITS.createCooldownMs - elapsed }
      );
    }
  }

  const hourly = countChallengesSince(accountId, hourAgoIso());
  if (hourly >= CHALLENGE_LIMITS.maxPerHour) {
    throw new ArenaError(
      ArenaErrors.ARENA_CHALLENGE_COOLDOWN,
      "Hourly direct-challenge limit reached",
      429
    );
  }
}

function buildPreviewPayload({
  challengerChar,
  opponent,
  opponentRating,
  priorWins,
  challengeAllowed,
  challengeType,
}) {
  const cr = challengerChar.arena_rating || ARENA_DEFAULT_RATING;
  const est = estimateWinLoss({
    challengerRating: cr,
    opponentRating,
    priorRankedWinsInPeriod: priorWins,
  });
  const gap = gapMultiplierForWin(cr, opponentRating);
  const repeat = repeatWinMultiplier(priorWins);

  return {
    challengeAllowed,
    challengerRating: cr,
    opponentRating,
    estimatedWinChange: est.estimatedWinChange,
    estimatedLossChange: est.estimatedLossChange,
    ratingRewardEligible: est.ratingRewardEligible,
    warningCode: est.warningCode,
    gapBand: gap.band,
    repeatBand: repeat.band,
    challengeType,
    policyVersion: ARENA_RATING_POLICY_VERSION,
    opponent: publicArenaCard(opponent),
    config: {
      fullRewardGap: DIRECT_CHALLENGE_RATING.fullRewardGap,
      zeroRewardGap: DIRECT_CHALLENGE_RATING.zeroRewardGap,
      maximumGain: DIRECT_CHALLENGE_RATING.maximumGain,
      maximumLoss: DIRECT_CHALLENGE_RATING.maximumLoss,
    },
  };
}

export function previewDirectChallenge(user, body = {}) {
  const challengerCharacterId = body.challengerCharacterId || user.active_character_id;
  const opponentCharacterId = body.opponentCharacterId;
  const challengeType = body.challengeType || CHALLENGE_TYPES.LEADERBOARD_DIRECT;

  if (!challengerCharacterId || !opponentCharacterId) {
    throw new ArenaError(
      ArenaErrors.ARENA_INVALID_REQUEST,
      "challengerCharacterId and opponentCharacterId required"
    );
  }

  const challengerChar = assertOwnsCharacter(user, challengerCharacterId);

  let resolved;
  try {
    resolved = resolveEligibleOpponent({
      challengerUser: user,
      challengerChar,
      opponentCharacterId,
    });
  } catch (err) {
    if (err instanceof ArenaError) {
      return {
        challengeAllowed: false,
        reasonCode: err.code,
        error: err.message,
        opponent: publicArenaCard(entities.Character.get(opponentCharacterId)),
      };
    }
    throw err;
  }

  const accountPairKey = normalizeAccountPairKey(user.id, resolved.opponentAccountId);
  const prior = getPairBattleStats(accountPairKey, currentPeriodId());
  const preview = buildPreviewPayload({
    challengerChar,
    opponent: resolved.opponent,
    opponentRating: resolved.opponentRating,
    priorWins: prior.rankedWins,
    challengeAllowed: true,
    challengeType,
  });

  try {
    assertChallengeLimits(user.id);
  } catch (err) {
    if (err instanceof ArenaError) {
      return {
        ...preview,
        challengeAllowed: false,
        reasonCode: err.code,
        error: err.message,
      };
    }
    throw err;
  }

  return preview;
}

/**
 * Create + start a ranked direct challenge. Captures rating snapshot at start.
 * Body: challengerCharacterId, opponentCharacterId, idempotencyKey, challengeType?
 */
export function createDirectChallenge(user, body = {}) {
  const challengerCharacterId = body.challengerCharacterId || user.active_character_id;
  const opponentCharacterId = body.opponentCharacterId;
  const idempotencyKey = body.idempotencyKey;
  const challengeType = body.challengeType || CHALLENGE_TYPES.LEADERBOARD_DIRECT;

  if (!challengerCharacterId || !opponentCharacterId) {
    throw new ArenaError(
      ArenaErrors.ARENA_INVALID_REQUEST,
      "challengerCharacterId and opponentCharacterId required"
    );
  }
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new ArenaError(
      ArenaErrors.ARENA_INVALID_REQUEST,
      "idempotencyKey required"
    );
  }

  // Ignore client-submitted ratings / estimates entirely.
  const existing = getChallengeByIdempotencyKey(idempotencyKey);
  if (existing) {
    if (
      existing.challengerAccountId !== user.id ||
      existing.opponentCharacterId !== opponentCharacterId
    ) {
      throw new ArenaError(
        ArenaErrors.ARENA_IDEMPOTENCY_CONFLICT,
        "Idempotency key already used",
        409
      );
    }
    return { challenge: existing, replayed: true };
  }

  const challengerChar = assertOwnsCharacter(user, challengerCharacterId);
  assertChallengeLimits(user.id);

  const resolved = resolveEligibleOpponent({
    challengerUser: user,
    challengerChar,
    opponentCharacterId,
  });

  const periodId = currentPeriodId();
  const seasonId = currentSeasonId();
  const accountPairKey = normalizeAccountPairKey(user.id, resolved.opponentAccountId);
  const characterPairKey = normalizeCharacterPairKey(
    challengerChar.id,
    resolved.opponent.id
  );
  const prior = getPairBattleStats(accountPairKey, periodId);
  const cr = challengerChar.arena_rating || ARENA_DEFAULT_RATING;
  const or = resolved.opponentRating;

  const est = estimateWinLoss({
    challengerRating: cr,
    opponentRating: or,
    priorRankedWinsInPeriod: prior.rankedWins,
  });
  const gap = gapMultiplierForWin(cr, or);
  const repeat = repeatWinMultiplier(prior.rankedWins);

  const correlationId = nanoid();
  const battleId = nanoid();
  const expiresAt = new Date(Date.now() + CHALLENGE_LIMITS.ttlMs).toISOString();

  const ratingSnapshot = {
    challengerRatingAtStart: cr,
    opponentRatingAtStart: or,
    ratingGap: cr - or,
    expectedScore: est.expectedScore,
    baseWinChange: est.estimatedWinChange,
    baseLossChange: est.estimatedLossChange,
    gapMultiplier: gap.multiplier,
    gapBand: gap.band,
    repeatMultiplier: repeat.multiplier,
    repeatBand: repeat.band,
    priorPairWins: prior.rankedWins,
    maximumGain: DIRECT_CHALLENGE_RATING.maximumGain,
    maximumLoss: DIRECT_CHALLENGE_RATING.maximumLoss,
    challengeType,
    policyVersion: ARENA_RATING_POLICY_VERSION,
    seasonId,
    periodId,
    attackerOnly: CHALLENGE_LIMITS.attackerOnlyRating,
  };

  const challenge = insertChallenge({
    battleId,
    challengerAccountId: user.id,
    challengerCharacterId: challengerChar.id,
    opponentAccountId: resolved.opponentAccountId,
    opponentCharacterId: resolved.opponent.id,
    seasonId,
    challengeType,
    challengerRatingAtStart: cr,
    opponentRatingAtStart: or,
    ratingGap: cr - or,
    expectedScore: est.expectedScore,
    winRatingEstimate: est.estimatedWinChange,
    lossRatingEstimate: est.estimatedLossChange,
    ratingMultiplier: gap.multiplier * repeat.multiplier,
    zeroRewardReason: gap.zeroReward ? "OPPONENT_TOO_LOW_FOR_RATING_GAIN" : null,
    gapBand: gap.band,
    repeatBand: repeat.band,
    priorPairWins: prior.rankedWins,
    status: "started",
    defenseSnapshot: resolved.defenseSnapshot,
    ratingSnapshot,
    idempotencyKey,
    correlationId,
    policyVersion: ARENA_RATING_POLICY_VERSION,
    startedAt: clock.nowIso(),
    expiresAt,
    accountPairKey,
    characterPairKey,
    periodId,
  });

  auditArena({
    challengeId: challenge.challengeId,
    action: "direct_challenge_created",
    actor: user.id,
    correlationId,
    detail: {
      challengerCharacterId: challengerChar.id,
      opponentCharacterId: resolved.opponent.id,
      accountPairKey,
      ratings: { challenger: cr, opponent: or },
      ratingGap: cr - or,
      estimates: {
        win: est.estimatedWinChange,
        loss: est.estimatedLossChange,
      },
      policyVersion: ARENA_RATING_POLICY_VERSION,
      seasonId,
      battleId,
    },
  });
  emitArenaEvent("ArenaDirectChallengeCreated", {
    challengeId: challenge.challengeId,
    correlationId,
    battleId,
  });
  emitArenaEvent("ArenaDirectChallengeStarted", {
    challengeId: challenge.challengeId,
    correlationId,
    battleId,
    ratingSnapshot,
  });

  maybeEmitFarmingSignals({
    accountPairKey,
    periodId,
    prior,
    userId: user.id,
    challengeId: challenge.challengeId,
    zeroReward: !!gap.zeroReward,
  });

  return {
    challenge,
    replayed: false,
    preview: buildPreviewPayload({
      challengerChar,
      opponent: resolved.opponent,
      opponentRating: or,
      priorWins: prior.rankedWins,
      challengeAllowed: true,
      challengeType,
    }),
    defenseSnapshot: resolved.defenseSnapshot,
  };
}

function maybeEmitFarmingSignals({
  accountPairKey,
  periodId,
  prior,
  userId,
  challengeId,
  zeroReward,
}) {
  const battles = (prior.rankedBattles || 0) + 1;
  if (battles >= FARMING_SIGNAL_THRESHOLDS.pairBattlesPerPeriod) {
    emitArenaEvent("ArenaRepeatedOpponentDetected", {
      accountPairKey,
      periodId,
      rankedBattles: battles,
      challengeId,
      signal: "many_pair_battles",
    });
    auditArena({
      challengeId,
      action: "farming_signal_repeated_pair",
      actor: userId,
      detail: { accountPairKey, battles },
    });
  }
  if (zeroReward) {
    emitArenaEvent("ArenaRatingRewardBlocked", {
      challengeId,
      reason: "preview_zero_gap",
      signal: "zero_point_challenge",
    });
  }
  const hourly = countChallengesSince(userId, hourAgoIso());
  if (hourly >= FARMING_SIGNAL_THRESHOLDS.challengesPerHour) {
    emitArenaEvent("ArenaRepeatedOpponentDetected", {
      challengeId,
      signal: "high_challenge_frequency",
      hourly,
    });
  }
}

/**
 * Complete a started direct challenge. Uses snapshot ratings only.
 * Idempotent: replaying returns the original result without double-applying rating.
 */
export function completeDirectChallenge(user, body = {}) {
  const challengeId = body.challengeId;
  const won = !!body.won;
  if (!challengeId) {
    throw new ArenaError(ArenaErrors.ARENA_INVALID_REQUEST, "challengeId required");
  }

  const challenge = getChallengeById(challengeId);
  if (!challenge) {
    throw new ArenaError(ArenaErrors.ARENA_CHALLENGE_NOT_FOUND, "Challenge not found", 404);
  }
  if (challenge.challengerAccountId !== user.id) {
    throw new ArenaError(ArenaErrors.ARENA_CHALLENGE_NOT_OWNED, "Not your challenge", 403);
  }

  if (challenge.status === "completed") {
    auditArena({
      challengeId,
      action: "duplicate_completion_blocked",
      actor: user.id,
      correlationId: challenge.correlationId,
      detail: { replayed: true },
    });
    return {
      challenge,
      replayed: true,
      ratingDelta: challenge.finalRatingDelta,
      result: challenge.result,
    };
  }

  if (challenge.expiresAt && new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw new ArenaError(ArenaErrors.ARENA_CHALLENGE_EXPIRED, "Challenge expired");
  }

  if (
    body.policyVersion != null &&
    Number(body.policyVersion) !== challenge.policyVersion
  ) {
    throw new ArenaError(
      ArenaErrors.ARENA_RATING_POLICY_CHANGED,
      "Rating policy version mismatch"
    );
  }

  // Never trust client rating fields.
  const calc = computeDirectChallengeRatingDelta({
    challengerRating: challenge.challengerRatingAtStart,
    opponentRating: challenge.opponentRatingAtStart,
    won,
    priorRankedWinsInPeriod: challenge.priorPairWins || 0,
    practice: challenge.challengeType === CHALLENGE_TYPES.PRACTICE,
  });

  const challengerChar = assertOwnsCharacter(user, challenge.challengerCharacterId);
  const prevRating = challengerChar.arena_rating || ARENA_DEFAULT_RATING;
  // Apply delta to live character, but delta was computed from snapshot.
  const newRating = Math.max(0, prevRating + calc.ratingDelta);

  const patch = {
    arena_rating: newRating,
    arena_wins: (challengerChar.arena_wins || 0) + (won ? 1 : 0),
    arena_losses: (challengerChar.arena_losses || 0) + (won ? 0 : 1),
    arena_battles: (challengerChar.arena_battles || 0) + 1,
    arena_last_battle_at: clock.nowIso(),
    arena_cooldown_at: clock.nowIso(),
  };

  // Competitive streak: only count when rating-bearing win (or any win if not zero-gap?).
  // Spec: zero-point battles must not increase win streaks used for major ranking rewards.
  const prevStreak = challengerChar.arena_streak || 0;
  if (won && calc.ratingDelta > 0) {
    patch.arena_streak = prevStreak + 1;
    patch.arena_max_streak = Math.max(challengerChar.arena_max_streak || 0, patch.arena_streak);
  } else if (won && calc.ratingDelta === 0) {
    // Keep streak unchanged for zero-point victories.
    patch.arena_streak = prevStreak;
  } else {
    patch.arena_streak = 0;
  }

  const character = entities.Character.update(challengerChar.id, patch);

  incrementPairBattle(
    challenge.accountPairKey,
    challenge.characterPairKey,
    challenge.periodId,
    { won }
  );

  const result = {
    won,
    ratingDelta: calc.ratingDelta,
    ratingBefore: prevRating,
    ratingAfter: newRating,
    calc,
    attackerOnly: true,
  };

  const updated = storeComplete(challenge.challengeId, {
    status: "completed",
    won,
    finalRatingDelta: calc.ratingDelta,
    result,
    battleId: challenge.battleId,
  });

  auditArena({
    challengeId: challenge.challengeId,
    action: won ? "challenge_completed_win" : "challenge_completed_loss",
    actor: user.id,
    correlationId: challenge.correlationId,
    detail: {
      accountPairKey: challenge.accountPairKey,
      ratingsAtStart: {
        challenger: challenge.challengerRatingAtStart,
        opponent: challenge.opponentRatingAtStart,
      },
      ratingGap: challenge.ratingGap,
      baseCalculation: calc.baseChange,
      appliedMultiplier: calc.gapMultiplier * calc.repeatMultiplier,
      finalChange: calc.ratingDelta,
      policyVersion: challenge.policyVersion,
      repeatMatchCount: calc.repeatMatchIndex,
      battleId: challenge.battleId,
      seasonId: challenge.seasonId,
      zeroRewardReason: calc.zeroRewardReason,
    },
  });

  if (calc.zeroRewardReason) {
    auditArena({
      challengeId: challenge.challengeId,
      action:
        calc.zeroRewardReason === "REPEAT_OPPONENT_NO_RATING"
          ? "rating_blocked_repeat_opponent"
          : "zero_rating_awarded_gap",
      actor: "system",
      correlationId: challenge.correlationId,
      detail: { reason: calc.zeroRewardReason, finalChange: 0 },
    });
    emitArenaEvent("ArenaRatingRewardBlocked", {
      challengeId: challenge.challengeId,
      reason: calc.zeroRewardReason,
    });
  } else if (won && (calc.gapMultiplier < 1 || calc.repeatMultiplier < 1)) {
    auditArena({
      challengeId: challenge.challengeId,
      action:
        calc.repeatMultiplier < 1
          ? "rating_reduced_repeat_opponent"
          : "rating_reduced_gap",
      actor: "system",
      correlationId: challenge.correlationId,
      detail: {
        gapMultiplier: calc.gapMultiplier,
        repeatMultiplier: calc.repeatMultiplier,
        finalChange: calc.ratingDelta,
      },
    });
    emitArenaEvent("ArenaRatingRewardReduced", {
      challengeId: challenge.challengeId,
      gapMultiplier: calc.gapMultiplier,
      repeatMultiplier: calc.repeatMultiplier,
      finalChange: calc.ratingDelta,
    });
  }

  if (calc.underdogVictory) {
    emitArenaEvent("ArenaUnderdogVictory", {
      challengeId: challenge.challengeId,
      ratingDelta: calc.ratingDelta,
    });
    auditArena({
      challengeId: challenge.challengeId,
      action: "underdog_victory",
      actor: user.id,
      correlationId: challenge.correlationId,
      detail: { ratingDelta: calc.ratingDelta },
    });
  }

  auditArena({
    challengeId: challenge.challengeId,
    action: calc.ratingDelta >= 0 ? "rating_gain" : "rating_loss",
    actor: user.id,
    correlationId: challenge.correlationId,
    detail: { delta: calc.ratingDelta, before: prevRating, after: newRating },
  });

  emitArenaEvent("ArenaDirectChallengeCompleted", {
    challengeId: challenge.challengeId,
    battleId: challenge.battleId,
    won,
    ratingDelta: calc.ratingDelta,
    correlationId: challenge.correlationId,
  });

  return {
    challenge: updated,
    replayed: false,
    ratingDelta: calc.ratingDelta,
    result,
    patch,
    character,
    rewards: {
      won,
      experience: 0,
      stardust: 0,
      arena_rating_delta: calc.ratingDelta,
      free: false,
      direct_challenge: true,
    },
  };
}

export function getChallengeForUser(user, challengeId) {
  const challenge = getChallengeById(challengeId);
  if (!challenge) {
    throw new ArenaError(ArenaErrors.ARENA_CHALLENGE_NOT_FOUND, "Challenge not found", 404);
  }
  if (
    challenge.challengerAccountId !== user.id &&
    challenge.opponentAccountId !== user.id
  ) {
    throw new ArenaError(ArenaErrors.ARENA_CHALLENGE_NOT_OWNED, "Not your challenge", 403);
  }
  return challenge;
}
