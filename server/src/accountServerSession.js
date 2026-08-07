/**
 * Per-server active gameplay session (one machine per account per server shard).
 * Future multi-server deployments may share users/Nakama but each APP_ID owns its row.
 */
import { db, nowIso } from "./db.js";

export function getServerId() {
  return String(process.env.APP_ID || "lootandlasers-local").trim() || "lootandlasers-local";
}

export function ensureAccountServerSessionSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_server_sessions (
      user_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      active_nakama_session_key TEXT,
      updated_date TEXT NOT NULL,
      PRIMARY KEY (user_id, server_id)
    );
    CREATE INDEX IF NOT EXISTS idx_account_server_sessions_server
      ON account_server_sessions(server_id);
  `);
}

/** One-time copy from legacy users.* session columns into this server's row. */
export function migrateLegacyUserSessionColumns(serverId = getServerId()) {
  ensureAccountServerSessionSchema();
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const cols = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
  if (!cols.has("session_version") && !cols.has("active_nakama_session_key")) {
    return;
  }
  const metaKey = `account_server_sessions_legacy_v1:${serverId}`;
  const done = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(metaKey);
  if (done?.value === "done") return;

  const ts = nowIso();
  const users = db.prepare(`
    SELECT id, session_version, active_nakama_session_key
    FROM users
    WHERE (session_version IS NOT NULL AND session_version > 1)
       OR (active_nakama_session_key IS NOT NULL AND TRIM(active_nakama_session_key) <> '')
  `).all();

  const upsert = db.prepare(`
    INSERT INTO account_server_sessions (
      user_id, server_id, session_version, active_nakama_session_key, updated_date
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, server_id) DO UPDATE SET
      session_version = excluded.session_version,
      active_nakama_session_key = excluded.active_nakama_session_key,
      updated_date = excluded.updated_date
  `);

  for (const row of users) {
    const sv = Math.max(1, Math.floor(Number(row.session_version) || 1));
    const key = row.active_nakama_session_key
      ? String(row.active_nakama_session_key)
      : null;
    if (sv <= 1 && !key) continue;
    upsert.run(row.id, serverId, sv, key, ts);
  }

  db.prepare(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(metaKey, "done");
}

export function readAccountServerSession(userId, serverId = getServerId()) {
  if (!userId) return null;
  ensureAccountServerSessionSchema();
  return db.prepare(
    "SELECT * FROM account_server_sessions WHERE user_id = ? AND server_id = ?",
  ).get(userId, serverId);
}

export function writeAccountServerSession(
  userId,
  { sessionVersion, sessionKey },
  serverId = getServerId(),
) {
  if (!userId) {
    throw new Error("user_id required for server session");
  }
  ensureAccountServerSessionSchema();
  const ts = nowIso();
  const sv = Math.max(1, Math.floor(Number(sessionVersion) || 1));
  const key = sessionKey ? String(sessionKey) : null;
  db.prepare(`
    INSERT INTO account_server_sessions (
      user_id, server_id, session_version, active_nakama_session_key, updated_date
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, server_id) DO UPDATE SET
      session_version = excluded.session_version,
      active_nakama_session_key = excluded.active_nakama_session_key,
      updated_date = excluded.updated_date
  `).run(userId, serverId, sv, key, ts);
  return readAccountServerSession(userId, serverId);
}
