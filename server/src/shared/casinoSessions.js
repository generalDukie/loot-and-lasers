/**
 * Persistent Casino sessions for Crystal Refining + Smuggler's Cache.
 */
import { db, nowIso } from "../db.js";

export function ensureCasinoSessionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS casino_sessions (
      session_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      status TEXT NOT NULL,
      wager INTEGER NOT NULL,
      currency TEXT NOT NULL,
      state_json TEXT NOT NULL,
      start_request_id TEXT,
      last_action_request_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_casino_sessions_owner_status
      ON casino_sessions(account_id, character_id, game_id, status);
  `);
}

ensureCasinoSessionsTable();

export function insertCasinoSession(row) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO casino_sessions (
      session_id, account_id, character_id, game_id, status, wager, currency,
      state_json, start_request_id, last_action_request_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.session_id,
    row.account_id,
    row.character_id,
    row.game_id,
    row.status,
    row.wager,
    row.currency,
    JSON.stringify(row.state || {}),
    row.start_request_id || null,
    row.last_action_request_id || null,
    now,
    now,
  );
  return getCasinoSession(row.session_id);
}

export function getCasinoSession(sessionId) {
  const row = db.prepare("SELECT * FROM casino_sessions WHERE session_id = ?").get(sessionId);
  if (!row) return null;
  return hydrate(row);
}

export function findActiveCasinoSession(accountId, characterId, gameId) {
  const row = db.prepare(`
    SELECT * FROM casino_sessions
    WHERE account_id = ? AND character_id = ? AND game_id = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(accountId, characterId, gameId);
  return row ? hydrate(row) : null;
}

export function listActiveCasinoSessions(accountId, characterId) {
  const rows = db.prepare(`
    SELECT * FROM casino_sessions
    WHERE account_id = ? AND character_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `).all(accountId, characterId);
  return rows.map(hydrate);
}

export function updateCasinoSession(sessionId, patch) {
  const cur = getCasinoSession(sessionId);
  if (!cur) return null;
  const nextState = patch.state != null ? patch.state : cur.state;
  const status = patch.status != null ? patch.status : cur.status;
  const lastAction = patch.last_action_request_id != null
    ? patch.last_action_request_id
    : cur.last_action_request_id;
  db.prepare(`
    UPDATE casino_sessions
    SET status = ?, state_json = ?, last_action_request_id = ?, updated_at = ?
    WHERE session_id = ?
  `).run(status, JSON.stringify(nextState), lastAction || null, nowIso(), sessionId);
  return getCasinoSession(sessionId);
}

function hydrate(row) {
  let state = {};
  try {
    state = JSON.parse(row.state_json || "{}");
  } catch {
    state = {};
  }
  return {
    session_id: row.session_id,
    account_id: row.account_id,
    character_id: row.character_id,
    game_id: row.game_id,
    status: row.status,
    wager: row.wager,
    currency: row.currency,
    state,
    start_request_id: row.start_request_id,
    last_action_request_id: row.last_action_request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
