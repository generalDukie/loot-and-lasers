/**
 * Authoritative Arena battle result normalization.
 * Server determines winner/outcome; clients must not recompute the winner.
 */

/**
 * @typedef {object} ArenaBattleRewards
 * @property {number} [credits]
 * @property {number} [stardust]
 * @property {number} [novaCrystals]
 * @property {number} [experience]
 * @property {number} [arena_rating_delta]
 * @property {boolean} [won]
 * @property {unknown[]} [items]
 */

/**
 * @typedef {object} ArenaBattleResult
 * @property {string} battleId
 * @property {string} winnerId
 * @property {string} loserId
 * @property {string} playerId
 * @property {string} opponentId
 * @property {"victory"|"defeat"|"draw"|"invalid"} outcome
 * @property {boolean} playerWon
 * @property {"player"|"opponent"|""} winner
 * @property {number} rankingChange
 * @property {ArenaBattleRewards} rewards
 */

/**
 * Normalize FinishArenaBattle / settle payloads into one shared result object.
 * `winner` must be the server-authoritative "player" | "opponent" (or empty).
 *
 * @param {object} args
 * @returns {ArenaBattleResult}
 */
export function normalizeArenaBattleResult({
  battleId = "",
  playerId = "",
  opponentId = "",
  winner = "",
  rewards = {},
  rankingChange = null,
  draw = false,
  invalid = false,
} = {}) {
  const w = String(winner || "").trim().toLowerCase();
  let playerWon = false;
  let outcome = "invalid";

  if (invalid) {
    outcome = "invalid";
    playerWon = false;
  } else if (draw || w === "draw") {
    outcome = "draw";
    playerWon = false;
  } else if (w === "player") {
    outcome = "victory";
    playerWon = true;
  } else if (w === "opponent") {
    outcome = "defeat";
    playerWon = false;
  } else if (typeof rewards?.won === "boolean") {
    playerWon = !!rewards.won;
    outcome = playerWon ? "victory" : "defeat";
  }

  const winnerId = playerWon ? String(playerId || "") : String(opponentId || "");
  const loserId = playerWon ? String(opponentId || "") : String(playerId || "");
  const delta =
    rankingChange != null
      ? Number(rankingChange) || 0
      : Number(rewards?.arena_rating_delta ?? rewards?.rating_delta ?? 0) || 0;

  const normalizedRewards = {
    ...(rewards && typeof rewards === "object" ? rewards : {}),
    won: playerWon,
    experience: Number(rewards?.experience ?? 0) || 0,
    stardust: Number(rewards?.stardust ?? 0) || 0,
    arena_rating_delta: delta,
  };

  return {
    battleId: String(battleId || ""),
    winnerId,
    loserId,
    playerId: String(playerId || ""),
    opponentId: String(opponentId || ""),
    outcome,
    playerWon,
    winner: w === "player" || w === "opponent" ? w : playerWon ? "player" : w === "draw" ? "" : "opponent",
    rankingChange: delta,
    rewards: normalizedRewards,
  };
}

/**
 * Temporary diagnostic logging for arena settlement debugging.
 * Safe: IDs only, no secrets.
 */
export function logArenaBattleResultDiag(tag, fields = {}) {
  const payload = {
    tag: String(tag || "arena"),
    authenticatedPlayerId: fields.authenticatedPlayerId ?? fields.userId ?? null,
    playerCombatantId: fields.playerCombatantId ?? fields.playerId ?? null,
    opponentId: fields.opponentId ?? null,
    winnerId: fields.winnerId ?? null,
    winner: fields.winner ?? null,
    playerWon: fields.playerWon ?? null,
    outcome: fields.outcome ?? null,
    rankingChange: fields.rankingChange ?? null,
    rewardsRequested: fields.rewardsRequested ?? null,
    rewardsGranted: fields.rewardsGranted ?? null,
  };
  console.log(`[ArenaBattleResult] ${JSON.stringify(payload)}`);
}
