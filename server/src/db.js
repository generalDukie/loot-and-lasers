import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, "game.db");
export const db = new DatabaseSync(dbPath);

/** Run async fn inside a SQLite transaction (BEGIN IMMEDIATE). */
export async function withTransactionAsync(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = await fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  }
}

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

  CREATE TABLE IF NOT EXISTS wallet_operations (
    account_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    operation_key TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (account_id, operation_type, operation_key)
  );

  CREATE INDEX IF NOT EXISTS idx_wallet_operations_created
    ON wallet_operations(created_at);

  CREATE TABLE IF NOT EXISTS character_creation_requests (
    account_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    character_id TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (account_id, request_id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_character_creation_character
    ON character_creation_requests(character_id);
`);

// Lightweight column adds for existing DBs (CREATE TABLE IF NOT EXISTS won't alter).
(function ensureUserColumns() {
  const cols = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
  if (!cols.has("legacy_display")) {
    db.exec("ALTER TABLE users ADD COLUMN legacy_display TEXT DEFAULT 'surname'");
  }
  if (!cols.has("nakama_user_id")) {
    db.exec("ALTER TABLE users ADD COLUMN nakama_user_id TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_nakama_user_id ON users(nakama_user_id)");
  const duplicates = db.prepare(`
    SELECT nakama_user_id, COUNT(*) AS count
    FROM users
    WHERE nakama_user_id IS NOT NULL AND TRIM(nakama_user_id) <> ''
    GROUP BY nakama_user_id
    HAVING COUNT(*) > 1
  `).all();
  if (duplicates.length > 0) {
    const ids = duplicates.map((row) => row.nakama_user_id).join(", ");
    throw new Error(
      `Duplicate Nakama account mappings must be repaired before startup: ${ids}`,
    );
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nakama_user_id_unique
      ON users(nakama_user_id)
      WHERE nakama_user_id IS NOT NULL AND TRIM(nakama_user_id) <> ''
  `);
})();

(function ensureWalletOperationColumns() {
  const cols = new Set(db.prepare("PRAGMA table_info(wallet_operations)").all().map((c) => c.name));
  const additions = {
    character_id: "TEXT",
    request_fingerprint: "TEXT",
    transaction_id: "TEXT",
    revision: "INTEGER",
    updated_at: "TEXT",
  };
  for (const [name, type] of Object.entries(additions)) {
    if (!cols.has(name)) db.exec(`ALTER TABLE wallet_operations ADD COLUMN ${name} ${type}`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_operations_transaction
      ON wallet_operations(transaction_id)
      WHERE transaction_id IS NOT NULL
  `);
})();

/**
 * One-time 10× XP & Stardust unit-scale migration.
 * Preserves progression / purchasing power after formula exits were scaled.
 */
(function migrateXpStardustScale10x() {
  const SCALE = 10;
  const META_KEY = "xp_stardust_scale_v1";

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const existing = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(META_KEY);
  if (existing?.value === "done") return;

  const mul = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v === 0) return n;
    return Math.round(v * SCALE);
  };

  const scaleShopSlot = (slot) => {
    if (!slot || typeof slot !== "object") return slot;
    const next = { ...slot };
    if (next.cost != null) next.cost = mul(next.cost);
    if (next.sell_value != null) next.sell_value = mul(next.sell_value);
    if (next._cost != null) next._cost = mul(next._cost);
    return next;
  };

  const scaleCharacter = (data) => {
    const d = { ...data };
    if (d.experience != null) d.experience = mul(d.experience);
    if (d.experience_to_next_level != null) d.experience_to_next_level = mul(d.experience_to_next_level);
    if (d.stardust != null) d.stardust = mul(d.stardust);
    if (d.total_stardust_earned != null) d.total_stardust_earned = mul(d.total_stardust_earned);
    if (d.mining_reward != null) d.mining_reward = mul(d.mining_reward);
    if (d.shop_meta && typeof d.shop_meta === "object") {
      const sm = { ...d.shop_meta };
      if (Array.isArray(sm.gear_stock)) sm.gear_stock = sm.gear_stock.map(scaleShopSlot);
      if (Array.isArray(sm.cons_stock)) sm.cons_stock = sm.cons_stock.map(scaleShopSlot);
      if (sm.hot_deal) sm.hot_deal = scaleShopSlot(sm.hot_deal);
      d.shop_meta = sm;
    }
    return d;
  };

  const scaleItem = (data) => {
    const d = { ...data };
    if (d.sell_value != null) d.sell_value = mul(d.sell_value);
    return d;
  };

  const scaleMail = (data) => {
    const d = { ...data };
    const r = d.rewards;
    if (r && typeof r === "object") {
      const next = { ...r };
      if (next.experience != null) next.experience = mul(next.experience);
      if (next.stardust != null) next.stardust = mul(next.stardust);
      if (next.sell_value != null) next.sell_value = mul(next.sell_value);
      if (next.collectible?.sell_value != null) {
        next.collectible = { ...next.collectible, sell_value: mul(next.collectible.sell_value) };
      }
      d.rewards = next;
    }
    return d;
  };

  const scaleGuild = (data) => {
    const d = { ...data };
    if (d.total_stardust != null) d.total_stardust = mul(d.total_stardust);
    if (d.war_chest != null) d.war_chest = mul(d.war_chest);
    return d;
  };

  const scaleGuildMember = (data) => {
    const d = { ...data };
    if (d.contributed_stardust != null) d.contributed_stardust = mul(d.contributed_stardust);
    return d;
  };

  const scaleMission = (data) => {
    const d = { ...data };
    const r = d.rewards;
    if (r && typeof r === "object") {
      const next = { ...r };
      if (next.experience != null) next.experience = mul(next.experience);
      if (next.stardust != null) next.stardust = mul(next.stardust);
      d.rewards = next;
    }
    return d;
  };

  const transformers = {
    Character: scaleCharacter,
    Item: scaleItem,
    Mail: scaleMail,
    Guild: scaleGuild,
    GuildMember: scaleGuildMember,
    Mission: scaleMission,
  };

  const select = db.prepare("SELECT id, type, data FROM entities WHERE type = ?");
  const update = db.prepare("UPDATE entities SET data = ?, updated_date = ? WHERE id = ?");
  const now = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [type, transform] of Object.entries(transformers)) {
      const rows = select.all(type);
      for (const row of rows) {
        let data;
        try {
          data = JSON.parse(row.data);
        } catch {
          continue;
        }
        const next = transform(data);
        update.run(JSON.stringify({ ...next, id: row.id }), now, row.id);
      }
    }
    db.prepare(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(META_KEY, "done");
    db.exec("COMMIT");
    console.log(`[migrate] XP/Stardust 10× scale applied (${META_KEY})`);
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    console.error("[migrate] XP/Stardust 10× scale failed:", err);
    throw err;
  }
})();

/** Restoration 15 — convert Character.nova_crystals to integer half-units (×2). */
(() => {
  const META_KEY = "nova_half_units_v1";
  const existing = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(META_KEY);
  if (existing?.value === "done") return;

  try {
    db.exec("BEGIN IMMEDIATE");
    const rows = db.prepare("SELECT id, data FROM entities WHERE type = 'Character'").all();
    const update = db.prepare("UPDATE entities SET data = ?, updated_date = ? WHERE id = ? AND type = 'Character'");
    const now = new Date().toISOString();
    for (const row of rows) {
      let data;
      try {
        data = JSON.parse(row.data);
      } catch {
        continue;
      }
      if (Number(data.economy_nova_scale) === 2) {
        update.run(JSON.stringify(data), now, row.id);
        continue;
      }
      const raw = Number(data.nova_crystals) || 0;
      const half = Math.max(0, Math.floor(raw * 2));
      data.nova_crystals = half;
      data.economy_nova_scale = 2;
      update.run(JSON.stringify({ ...data, id: row.id }), now, row.id);
    }
    db.prepare(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(META_KEY, "done");
    db.exec("COMMIT");
    console.log(`[migrate] Nova half-units applied (${META_KEY})`);
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    console.error("[migrate] Nova half-units failed:", err);
    throw err;
  }
})();

import { clock } from "./shared/time/clock.js";

export function nowIso() {
  return clock.nowIso();
}
