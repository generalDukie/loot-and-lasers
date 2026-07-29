/**
 * Direct-challenge Elo + rating-gap + repeat-opponent scaling.
 * Uses ratings only — never level, gear, power, or inventory.
 */

import {
  ARENA_DIRECT_ELO_K,
  ARENA_RATING_POLICY_VERSION,
  DIRECT_CHALLENGE_RATING as CFG,
  REPEAT_OPPONENT,
} from "./config.js";

export function eloExpectedScore(challengerRating, opponentRating) {
  const a = Number(challengerRating) || 1000;
  const b = Number(opponentRating) || 1000;
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/**
 * Gap below = challengerRating - opponentRating when challenger is higher.
 * Multiplier applies only on challenger wins vs lower-rated opponents.
 */
export function gapMultiplierForWin(challengerRating, opponentRating, cfg = CFG) {
  const gapBelow = (Number(challengerRating) || 1000) - (Number(opponentRating) || 1000);
  if (gapBelow <= 0) {
    return { multiplier: 1, band: "underdog_or_equal", zeroReward: false };
  }
  if (gapBelow <= cfg.fullRewardGap) {
    return { multiplier: 1, band: "full", zeroReward: false };
  }
  if (gapBelow <= cfg.reducedRewardGap) {
    return { multiplier: cfg.mediumMultiplier, band: "medium", zeroReward: false };
  }
  if (gapBelow <= cfg.zeroRewardGap) {
    return { multiplier: cfg.lowMultiplier, band: "low", zeroReward: false };
  }
  return { multiplier: 0, band: "zero", zeroReward: true };
}

export function repeatWinMultiplier(priorRankedWinsInPeriod, policy = REPEAT_OPPONENT) {
  const n = Math.max(0, Number(priorRankedWinsInPeriod) || 0);
  // This battle will be win #n+1 against the pair this period.
  const matchIndex = n + 1;
  if (matchIndex <= policy.fullRewardMatches) {
    return { multiplier: 1, band: "full", zeroPositive: false, matchIndex };
  }
  const reducedEnd = policy.fullRewardMatches + policy.reducedRewardMatches;
  if (matchIndex <= reducedEnd && matchIndex <= policy.zeroRewardAfter) {
    return {
      multiplier: policy.reducedMultiplier,
      band: "reduced",
      zeroPositive: false,
      matchIndex,
    };
  }
  if (matchIndex > policy.zeroRewardAfter) {
    return { multiplier: 0, band: "zero", zeroPositive: true, matchIndex };
  }
  return {
    multiplier: policy.reducedMultiplier,
    band: "reduced",
    zeroPositive: false,
    matchIndex,
  };
}

/**
 * Compute final challenger rating delta for a direct ranked challenge.
 * Snapshot ratings must be used — not live leaderboard values.
 */
export function computeDirectChallengeRatingDelta({
  challengerRating,
  opponentRating,
  won,
  priorRankedWinsInPeriod = 0,
  k = ARENA_DIRECT_ELO_K,
  cfg = CFG,
  practice = false,
}) {
  if (practice) {
    return {
      ratingDelta: 0,
      expectedScore: eloExpectedScore(challengerRating, opponentRating),
      baseChange: 0,
      gapMultiplier: 1,
      repeatMultiplier: 1,
      gapBand: "practice",
      repeatBand: "practice",
      zeroRewardReason: "practice",
      ratingRewardEligible: false,
      underdogVictory: false,
      capped: false,
      policyVersion: ARENA_RATING_POLICY_VERSION,
    };
  }

  const cr = Number(challengerRating) || 1000;
  const or = Number(opponentRating) || 1000;
  const expected = eloExpectedScore(cr, or);
  const actual = won ? 1 : 0;
  let baseChange = k * (actual - expected);

  const gap = gapMultiplierForWin(cr, or, cfg);
  const repeat = won
    ? repeatWinMultiplier(priorRankedWinsInPeriod, REPEAT_OPPONENT)
    : { multiplier: 1, band: "n/a", zeroPositive: false, matchIndex: priorRankedWinsInPeriod };

  let change = baseChange;
  let zeroRewardReason = null;
  const underdogVictory = won && cr < or;

  if (won) {
    change *= gap.multiplier;
    change *= repeat.multiplier;

    if (gap.zeroReward || repeat.zeroPositive) {
      // Hard zero — do not round up to 1.
      change = 0;
      zeroRewardReason = gap.zeroReward
        ? "OPPONENT_TOO_LOW_FOR_RATING_GAIN"
        : "REPEAT_OPPONENT_NO_RATING";
    } else if (change > 0 && change < cfg.minimumNonzeroGain) {
      // Only bump to min when not in a zero band.
      change = cfg.minimumNonzeroGain;
    }

    if (change > cfg.maximumGain) change = cfg.maximumGain;
  } else {
    // Losses keep full Elo risk; never apply zero-victory rule.
    if (change < -cfg.maximumLoss) change = -cfg.maximumLoss;
    // Ensure meaningful loss when expected was high (already from Elo); no min-loss floor beyond raw.
  }

  // Integer points; hard zero stays 0 (no rounding up from tiny positives after scale).
  let ratingDelta = Math.trunc(change);
  if (won && (gap.zeroReward || repeat.zeroPositive)) {
    ratingDelta = 0;
  } else if (won && ratingDelta === 0 && change > 0 && !gap.zeroReward && !repeat.zeroPositive) {
    ratingDelta = cfg.minimumNonzeroGain;
  } else if (!won && ratingDelta === 0 && change < 0) {
    ratingDelta = -1;
  }

  return {
    ratingDelta,
    expectedScore: expected,
    baseChange: Math.trunc(baseChange),
    gapMultiplier: gap.multiplier,
    gapBand: gap.band,
    repeatMultiplier: repeat.multiplier,
    repeatBand: repeat.band,
    repeatMatchIndex: repeat.matchIndex,
    zeroRewardReason,
    ratingRewardEligible: won ? ratingDelta > 0 : true,
    underdogVictory,
    capped: won
      ? Math.abs(baseChange * gap.multiplier * repeat.multiplier) > cfg.maximumGain
      : Math.abs(baseChange) > cfg.maximumLoss,
    ratingGap: cr - or,
    policyVersion: ARENA_RATING_POLICY_VERSION,
    maximumGainApplied: cfg.maximumGain,
    maximumLossApplied: cfg.maximumLoss,
  };
}

/** Server preview for rankings UI (not final). */
export function estimateWinLoss({
  challengerRating,
  opponentRating,
  priorRankedWinsInPeriod = 0,
  k = ARENA_DIRECT_ELO_K,
  cfg = CFG,
}) {
  const win = computeDirectChallengeRatingDelta({
    challengerRating,
    opponentRating,
    won: true,
    priorRankedWinsInPeriod,
    k,
    cfg,
  });
  const loss = computeDirectChallengeRatingDelta({
    challengerRating,
    opponentRating,
    won: false,
    priorRankedWinsInPeriod,
    k,
    cfg,
  });
  const gap = gapMultiplierForWin(challengerRating, opponentRating, cfg);
  let warningCode = null;
  if (gap.zeroReward) warningCode = "OPPONENT_TOO_LOW_FOR_RATING_GAIN";
  else if (win.repeatBand === "reduced") warningCode = "ARENA_REPEAT_OPPONENT_REDUCED_REWARD";
  else if (win.repeatBand === "zero") warningCode = "ARENA_REPEAT_OPPONENT_NO_RATING";

  return {
    estimatedWinChange: win.ratingDelta,
    estimatedLossChange: loss.ratingDelta,
    ratingRewardEligible: win.ratingDelta > 0,
    warningCode,
    gapBand: gap.band,
    expectedScore: win.expectedScore,
  };
}
