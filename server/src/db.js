import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, "game.db");
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    legacy_name TEXT,
    legacy_display TEXT DEFAULT 'surname',
    active_character_id TEXT,
    purchased_slots INTEGER DEFAULT 0,
    email_verified INTEGER DEFAULT 0,
    otp_code TEXT,
    otp_expires_at TEXT,
    reset_token TEXT,
    reset_expires_at TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    created_by TEXT,
    created_by_id TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
  CREATE INDEX IF NOT EXISTS idx_entities_created_by_id ON entities(created_by_id);
  CREATE INDEX IF NOT EXISTS idx_entities_type_created ON entities(type, created_date);
`);

// Lightweight column adds for existing DBs (CREATE TABLE IF NOT EXISTS won't alter).
(function ensureUserColumns() {
  const cols = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
  if (!cols.has("legacy_display")) {
    db.exec("ALTER TABLE users ADD COLUMN legacy_display TEXT DEFAULT 'surname'");
  }
})();

export function nowIso() {
  return new Date().toISOString();
}
