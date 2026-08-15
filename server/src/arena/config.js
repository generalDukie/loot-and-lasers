/**
 * Arena direct-challenge rating & anti-farm configuration.
 * Keys mirror arena.rating.* remote-config style; code defaults are safe.
 */

export const ARENA_RATING_POLICY_VERSION = 1;
export const ARENA_DEFAULT_RATING = 1_000;
export const ARENA_ELO_RATING_SCALE = 400;

const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const CHALLENGE_TTL_MINUTES = 30;

/** Elo K-factor for direct challenges (matchmaking may use shared formula defaults). */
export const ARENA_DIRECT_ELO_K = Number(process.env.ARENA_DIRECT_ELO_K || 28);

export const DIRECT_CHALLENGE_RATING = {
  /** Full reward when opponent is no more than this many points below challenger. */
  fullRewardGap: Number(process.env.ARENA_DC_FULL_REWARD_GAP || 100),
  /** Medium band ends here (inclusive upper for medium). */
  reducedRewardGap: Number(process.env.ARENA_DC_REDUCED_REWARD_GAP || 250),
  /** Beyond this below-gap → zero positive rating on win. */
  zeroRewardGap: Number(process.env.ARENA_DC_ZERO_REWARD_GAP || 400),
  mediumMultiplier: Number(process.env.ARENA_DC_MEDIUM_MULT || 0.5),
  lowMultiplier: Number(process.env.ARENA_DC_LOW_MULT || 0.2),
  maximumGain: Number(process.env.ARENA_DC_MAX_GAIN || 32),
  maximumLoss: Number(process.env.ARENA_DC_MAX_LOSS || 32),
  /** Floor for positive gains after scaling (0 allowed when zero rule applies). */
  minimumNonzeroGain: Number(process.env.ARENA_DC_MIN_NONZERO_GAIN || 1),
};

export const REPEAT_OPPONENT = {
  /** Wins with full rating against same account-pair in period. */
  fullRewardMatches: Number(process.env.ARENA_REPEAT_FULL || 1),
  /** Wins after full that still get reduced (before zero). */
  reducedRewardMatches: Number(process.env.ARENA_REPEAT_REDUCED || 1),
  reducedMultiplier: Number(process.env.ARENA_REPEAT_MULT || 0.4),
  /** After this many wins in period → zero positive rating. */
  zeroRewardAfter: Number(process.env.ARENA_REPEAT_ZERO_AFTER || 2),
  /** Period key: "daily" uses arena ET day. */
  period: process.env.ARENA_REPEAT_PERIOD || "daily",
};

export const CHALLENGE_LIMITS = {
  /** ms between creating new direct challenges. */
  createCooldownMs: Number(process.env.ARENA_CHALLENGE_COOLDOWN_MS || 8_000),
  /** Max direct ranked challenges created per hour. */
  maxPerHour: Number(process.env.ARENA_CHALLENGE_MAX_PER_HOUR || 20),
  /** Challenge expires if not completed. */
  ttlMs: Number(
    process.env.ARENA_CHALLENGE_TTL_MS
      || CHALLENGE_TTL_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND,
  ),
  /** Attacker-only rating (defender unchanged). */
  attackerOnlyRating: true,
};

export const CHALLENGE_TYPES = {
  MATCHMAKING_SELECTION: "matchmaking_selection",
  LEADERBOARD_DIRECT: "leaderboard_direct",
  NEARBY_RANK_DIRECT: "nearby_rank_direct",
  PRACTICE: "practice",
};

export const FARMING_SIGNAL_THRESHOLDS = {
  pairBattlesPerPeriod: 5,
  zeroPointChallengesPerPeriod: 4,
  challengesPerHour: 12,
};
