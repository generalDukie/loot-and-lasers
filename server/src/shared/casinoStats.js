/**
 * Authoritative Casino statistics (per account + global).
 * Rejected requests must not call recordCasinoPlay.
 */
import { db, nowIso } from "../db.js";

export function ensureCasinoStatsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS casino_stats (
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, scope_id, game_id)
    );
  `);
}

ensureCasinoStatsTable();

function blankStats(gameId) {
  const base = {
    games_played: 0,
    wagered: 0,
    paid_out: 0,
    net_removed: 0,
    wins: 0,
    losses: 0,
    shoves: 0,
    largest_wager: 0,
    largest_payout: 0,
    current_streak: 0,
    longest_win_streak: 0,
    longest_loss_streak: 0,
    outcomes: {},
  };
  if (gameId === "galactic_dice") {
    Object.assign(base, {
      choice_low: 0,
      choice_seven: 0,
      choice_high: 0,
      wins_low: 0,
      wins_seven: 0,
      wins_high: 0,
      natural_sevens: 0,
      doubles: 0,
      seven_payouts: 0,
    });
  }
  if (gameId === "crystal_refining") {
    Object.assign(base, {
      sessions_started: 0,
      sessions_settled: 0,
      successful_attempts: 0,
      failed_attempts: 0,
      crystals_shattered: 0,
      collect_stage_1: 0,
      collect_stage_2: 0,
      collect_stage_3: 0,
      collect_stage_4: 0,
      fifth_stage_completions: 0,
      highest_stage: 0,
    });
  }
  if (gameId === "smugglers_cache") {
    Object.assign(base, {
      worthless_scrap: 0,
      damaged_shipment: 0,
      alluring_contraband: 0,
      position_counts: [0, 0, 0, 0, 0, 0],
    });
  }
  return base;
}

function loadRow(scope, scopeId, gameId) {
  const row = db.prepare(`
    SELECT stats_json FROM casino_stats
    WHERE scope = ? AND scope_id = ? AND game_id = ?
  `).get(scope, scopeId, gameId);
  if (!row) return blankStats(gameId);
  try {
    return { ...blankStats(gameId), ...JSON.parse(row.stats_json || "{}") };
  } catch {
    return blankStats(gameId);
  }
}

function saveRow(scope, scopeId, gameId, stats) {
  db.prepare(`
    INSERT INTO casino_stats (scope, scope_id, game_id, stats_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope, scope_id, game_id) DO UPDATE SET
      stats_json = excluded.stats_json,
      updated_at = excluded.updated_at
  `).run(scope, scopeId, gameId, JSON.stringify(stats), nowIso());
}

function applyStreak(stats, kind) {
  // kind: 'win' | 'loss' | 'shove' (shove does not break as loss)
  if (kind === "win") {
    stats.current_streak = stats.current_streak > 0 ? stats.current_streak + 1 : 1;
    stats.longest_win_streak = Math.max(stats.longest_win_streak, stats.current_streak);
  } else if (kind === "loss") {
    stats.current_streak = stats.current_streak < 0 ? stats.current_streak - 1 : -1;
    stats.longest_loss_streak = Math.max(stats.longest_loss_streak, Math.abs(stats.current_streak));
  }
}

function mutate(stats, event) {
  const wager = Math.floor(Number(event.wager) || 0);
  const payout = Math.floor(Number(event.gross_payout) || 0);
  const countGame = event.count_game !== false;

  if (countGame) {
    stats.games_played += 1;
    stats.wagered += wager;
    stats.paid_out += payout;
    stats.net_removed += wager - payout;
    stats.largest_wager = Math.max(stats.largest_wager, wager);
    stats.largest_payout = Math.max(stats.largest_payout, payout);
  }

  if (event.outcome) {
    stats.outcomes[event.outcome] = (stats.outcomes[event.outcome] || 0) + 1;
  }

  if (event.game_id === "galactic_dice" && countGame) {
    const c = event.choice;
    if (c === "low") stats.choice_low += 1;
    if (c === "seven") stats.choice_seven += 1;
    if (c === "high") stats.choice_high += 1;
    if (event.won && c === "low") stats.wins_low += 1;
    if (event.won && c === "seven") {
      stats.wins_seven += 1;
      stats.seven_payouts += 1;
    }
    if (event.won && c === "high") stats.wins_high += 1;
    if (event.natural_seven) stats.natural_sevens += 1;
    if (event.doubles) stats.doubles += 1;
    if (event.won) {
      stats.wins += 1;
      applyStreak(stats, "win");
    } else {
      stats.losses += 1;
      applyStreak(stats, "loss");
    }
  }

  if (event.game_id === "stardust_wheel" && countGame) {
    if (event.shove) {
      stats.shoves += 1;
      applyStreak(stats, "shove");
    } else if (event.won) {
      stats.wins += 1;
      applyStreak(stats, "win");
    } else {
      stats.losses += 1;
      applyStreak(stats, "loss");
    }
  }

  if (event.game_id === "crystal_refining") {
    if (event.session_started) stats.sessions_started += 1;
    if (event.session_settled) {
      stats.sessions_settled += 1;
      stats.games_played += 1;
      stats.wagered += wager;
      stats.paid_out += payout;
      stats.net_removed += wager - payout;
      stats.largest_wager = Math.max(stats.largest_wager, wager);
      stats.largest_payout = Math.max(stats.largest_payout, payout);
      if (payout > wager) {
        stats.wins += 1;
        applyStreak(stats, "win");
      } else if (payout === 0) {
        stats.losses += 1;
        applyStreak(stats, "loss");
      }
    }
    if (event.successful_attempt) stats.successful_attempts += 1;
    if (event.failed_attempt) stats.failed_attempts += 1;
    if (event.shattered) stats.crystals_shattered += 1;
    if (event.collect_stage === 1) stats.collect_stage_1 += 1;
    if (event.collect_stage === 2) stats.collect_stage_2 += 1;
    if (event.collect_stage === 3) stats.collect_stage_3 += 1;
    if (event.collect_stage === 4) stats.collect_stage_4 += 1;
    if (event.fifth_stage) stats.fifth_stage_completions += 1;
    if (event.stage_reached != null) {
      stats.highest_stage = Math.max(stats.highest_stage, event.stage_reached);
    }
  }

  if (event.game_id === "smugglers_cache" && countGame) {
    if (event.cargo_id === "worthless_scrap") stats.worthless_scrap += 1;
    if (event.cargo_id === "damaged_shipment") stats.damaged_shipment += 1;
    if (event.cargo_id === "alluring_contraband") stats.alluring_contraband += 1;
    const idx = Math.floor(Number(event.selected_index));
    if (Number.isInteger(idx) && idx >= 0 && idx <= 5) {
      stats.position_counts[idx] = (stats.position_counts[idx] || 0) + 1;
    }
    if (event.won) {
      stats.wins += 1;
      applyStreak(stats, "win");
    } else if (event.gross_payout > 0 && event.gross_payout < event.wager) {
      // Damaged shipment — partial recovery, count as loss for streak simplicity
      stats.losses += 1;
      applyStreak(stats, "loss");
    } else {
      stats.losses += 1;
      applyStreak(stats, "loss");
    }
  }
}

/**
 * @param {{ accountId: string, gameId: string, event: object }} args
 */
export function recordCasinoPlay({ accountId, gameId, event }) {
  const payload = { ...event, game_id: gameId };
  for (const [scope, scopeId] of [
    ["account", accountId],
    ["global", "all"],
  ]) {
    const stats = loadRow(scope, scopeId, gameId);
    mutate(stats, payload);
    saveRow(scope, scopeId, gameId, stats);
  }
}

export function getCasinoStats(scope, scopeId, gameId) {
  return loadRow(scope, scopeId, gameId);
}
