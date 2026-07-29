/**
 * Durable arena direct-challenge ledger, audit, outbox, and pair battle counters.
 */

import { db } from "../db.js";
import { clock } from "../shared/time/clock.js";
import { nanoid } from "nanoid";

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS arena_challenges (
      id TEXT PRIMARY KEY,
      battle_id TEXT,
      challenger_account_id TEXT NOT NULL,
      challenger_character_id TEXT NOT NULL,
      opponent_account_id TEXT NOT NULL,
      opponent_character_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      challenge_type TEXT NOT NULL,
      challenger_rating_at_start INTEGER NOT NULL,
      opponent_rating_at_start INTEGER NOT NULL,
      rating_gap INTEGER NOT NULL,
      expected_score REAL,
      win_rating_estimate INTEGER,
      loss_rating_estimate INTEGER,
      rating_multiplier REAL,
      zero_reward_reason TEXT,
      gap_band TEXT,
      repeat_band TEXT,
      prior_pair_wins INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      defense_snapshot_json TEXT,
      rating_snapshot_json TEXT,
      result_json TEXT,
      won INTEGER,
      final_rating_delta INTEGER,
      idempotency_key TEXT UNIQUE,
      correlation_id TEXT,
      policy_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      expires_at TEXT,
      account_pair_key TEXT NOT NULL,
      character_pair_key TEXT NOT NULL,
      period_id TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_arena_ch_challenger
      ON arena_challenges(challenger_account_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_arena_ch_opponent
      ON arena_challenges(opponent_character_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_arena_ch_pair_period
      ON arena_challenges(account_pair_key, period_id, status);

    CREATE TABLE IF NOT EXISTS arena_pair_battles (
      id TEXT PRIMARY KEY,
      account_pair_key TEXT NOT NULL,
      character_pair_key TEXT NOT NULL,
      period_id TEXT NOT NULL,
      ranked_wins INTEGER NOT NULL DEFAULT 0,
      ranked_losses INTEGER NOT NULL DEFAULT 0,
      ranked_battles INTEGER NOT NULL DEFAULT 0,
      last_battle_at TEXT,
      UNIQUE(account_pair_key, period_id)
    );

    CREATE INDEX IF NOT EXISTS idx_arena_pair_period
      ON arena_pair_battles(account_pair_key, period_id);

    CREATE TABLE IF NOT EXISTS arena_challenge_audit (
      id TEXT PRIMARY KEY,
      challenge_id TEXT,
      action TEXT NOT NULL,
      actor TEXT,
      detail_json TEXT,
      correlation_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_arena_audit_created ON arena_challenge_audit(created_at);
    CREATE INDEX IF NOT EXISTS idx_arena_audit_challenge ON arena_challenge_audit(challenge_id);

    CREATE TABLE IF NOT EXISTS arena_outbox (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_arena_outbox_status ON arena_outbox(status, created_at);
  `);
}

ensureSchema();

export function normalizeAccountPairKey(accountA, accountB) {
  const a = String(accountA || "");
  const b = String(accountB || "");
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function normalizeCharacterPairKey(charA, charB) {
  const a = String(charA || "");
  const b = String(charB || "");
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function rowToChallenge(row) {
  if (!row) return null;
  return {
    challengeId: row.id,
    battleId: row.battle_id,
    challengerAccountId: row.challenger_account_id,
    challengerCharacterId: row.challenger_character_id,
    opponentAccountId: row.opponent_account_id,
    opponentCharacterId: row.opponent_character_id,
    seasonId: row.season_id,
    challengeType: row.challenge_type,
    challengerRatingAtStart: row.challenger_rating_at_start,
    opponentRatingAtStart: row.opponent_rating_at_start,
    ratingGap: row.rating_gap,
    expectedScore: row.expected_score,
    winRatingEstimate: row.win_rating_estimate,
    lossRatingEstimate: row.loss_rating_estimate,
    ratingMultiplier: row.rating_multiplier,
    zeroRewardReason: row.zero_reward_reason,
    gapBand: row.gap_band,
    repeatBand: row.repeat_band,
    priorPairWins: row.prior_pair_wins,
    status: row.status,
    defenseSnapshot: row.defense_snapshot_json
      ? JSON.parse(row.defense_snapshot_json)
      : null,
    ratingSnapshot: row.rating_snapshot_json
      ? JSON.parse(row.rating_snapshot_json)
      : null,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    won: row.won == null ? null : !!row.won,
    finalRatingDelta: row.final_rating_delta,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    policyVersion: row.policy_version,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    accountPairKey: row.account_pair_key,
    characterPairKey: row.character_pair_key,
    periodId: row.period_id,
  };
}

export function auditArena({
  challengeId = null,
  action,
  actor = "system",
  detail = null,
  correlationId = null,
}) {
  db.prepare(
    `INSERT INTO arena_challenge_audit
     (id, challenge_id, action, actor, detail_json, correlation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nanoid(),
    challengeId,
    action,
    actor,
    detail ? JSON.stringify(detail) : null,
    correlationId,
    clock.nowIso()
  );
}

export function emitArenaEvent(eventType, payload) {
  db.prepare(
    `INSERT INTO arena_outbox (id, event_type, payload_json, status, created_at)
     VALUES (?, ?, ?, 'pending', ?)`
  ).run(nanoid(), eventType, JSON.stringify(payload), clock.nowIso());
}

export function getChallengeById(id) {
  return rowToChallenge(
    db.prepare("SELECT * FROM arena_challenges WHERE id = ?").get(id)
  );
}

export function getChallengeByIdempotencyKey(key) {
  if (!key) return null;
  return rowToChallenge(
    db.prepare("SELECT * FROM arena_challenges WHERE idempotency_key = ?").get(key)
  );
}

export function getActiveChallengeForAccount(accountId) {
  return rowToChallenge(
    db
      .prepare(
        `SELECT * FROM arena_challenges
         WHERE challenger_account_id = ? AND status IN ('created','started')
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(accountId)
  );
}

export function countChallengesSince(accountId, sinceIso) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM arena_challenges
       WHERE challenger_account_id = ? AND created_at >= ?`
    )
    .get(accountId, sinceIso);
  return row?.n || 0;
}

export function getLatestChallengeCreatedAt(accountId) {
  const row = db
    .prepare(
      `SELECT created_at FROM arena_challenges
       WHERE challenger_account_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(accountId);
  return row?.created_at || null;
}

export function getPairBattleStats(accountPairKey, periodId) {
  const row = db
    .prepare(
      `SELECT * FROM arena_pair_battles
       WHERE account_pair_key = ? AND period_id = ?`
    )
    .get(accountPairKey, periodId);
  if (!row) {
    return { rankedWins: 0, rankedLosses: 0, rankedBattles: 0 };
  }
  return {
    rankedWins: row.ranked_wins || 0,
    rankedLosses: row.ranked_losses || 0,
    rankedBattles: row.ranked_battles || 0,
    lastBattleAt: row.last_battle_at,
  };
}

export function insertChallenge(input) {
  const id = input.challengeId || nanoid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO arena_challenges (
      id, battle_id, challenger_account_id, challenger_character_id,
      opponent_account_id, opponent_character_id, season_id, challenge_type,
      challenger_rating_at_start, opponent_rating_at_start, rating_gap,
      expected_score, win_rating_estimate, loss_rating_estimate, rating_multiplier,
      zero_reward_reason, gap_band, repeat_band, prior_pair_wins, status,
      defense_snapshot_json, rating_snapshot_json, result_json, won, final_rating_delta,
      idempotency_key, correlation_id, policy_version,
      created_at, started_at, completed_at, expires_at,
      account_pair_key, character_pair_key, period_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    input.battleId || null,
    input.challengerAccountId,
    input.challengerCharacterId,
    input.opponentAccountId,
    input.opponentCharacterId,
    input.seasonId,
    input.challengeType,
    input.challengerRatingAtStart,
    input.opponentRatingAtStart,
    input.ratingGap,
    input.expectedScore ?? null,
    input.winRatingEstimate ?? null,
    input.lossRatingEstimate ?? null,
    input.ratingMultiplier ?? null,
    input.zeroRewardReason || null,
    input.gapBand || null,
    input.repeatBand || null,
    input.priorPairWins ?? 0,
    input.status || "started",
    input.defenseSnapshot ? JSON.stringify(input.defenseSnapshot) : null,
    input.ratingSnapshot ? JSON.stringify(input.ratingSnapshot) : null,
    null,
    null,
    null,
    input.idempotencyKey || null,
    input.correlationId || null,
    input.policyVersion,
    now,
    input.startedAt || now,
    null,
    input.expiresAt || null,
    input.accountPairKey,
    input.characterPairKey,
    input.periodId
  );
  return getChallengeById(id);
}

export function completeChallenge(id, patch) {
  const now = clock.nowIso();
  db.prepare(
    `UPDATE arena_challenges SET
      status = ?,
      won = ?,
      final_rating_delta = ?,
      result_json = ?,
      completed_at = ?,
      battle_id = COALESCE(?, battle_id)
     WHERE id = ?`
  ).run(
    patch.status || "completed",
    patch.won ? 1 : 0,
    patch.finalRatingDelta,
    patch.result ? JSON.stringify(patch.result) : null,
    now,
    patch.battleId || null,
    id
  );
  return getChallengeById(id);
}

export function incrementPairBattle(accountPairKey, characterPairKey, periodId, { won }) {
  const now = clock.nowIso();
  const existing = db
    .prepare(
      `SELECT * FROM arena_pair_battles WHERE account_pair_key = ? AND period_id = ?`
    )
    .get(accountPairKey, periodId);

  if (!existing) {
    db.prepare(
      `INSERT INTO arena_pair_battles
       (id, account_pair_key, character_pair_key, period_id,
        ranked_wins, ranked_losses, ranked_battles, last_battle_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      nanoid(),
      accountPairKey,
      characterPairKey,
      periodId,
      won ? 1 : 0,
      won ? 0 : 1,
      now
    );
    return;
  }

  db.prepare(
    `UPDATE arena_pair_battles SET
      ranked_wins = ranked_wins + ?,
      ranked_losses = ranked_losses + ?,
      ranked_battles = ranked_battles + 1,
      last_battle_at = ?,
      character_pair_key = ?
     WHERE account_pair_key = ? AND period_id = ?`
  ).run(
    won ? 1 : 0,
    won ? 0 : 1,
    now,
    characterPairKey,
    accountPairKey,
    periodId
  );
}

export function listRecentAudit(limit = 50) {
  return db
    .prepare(
      `SELECT * FROM arena_challenge_audit ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit)
    .map((r) => ({
      id: r.id,
      challengeId: r.challenge_id,
      action: r.action,
      actor: r.actor,
      detail: r.detail_json ? JSON.parse(r.detail_json) : null,
      correlationId: r.correlation_id,
      createdAt: r.created_at,
    }));
}
