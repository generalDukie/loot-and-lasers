import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrateLegacyUserSessionColumns } from "./accountServerSession.js";

const NOVA_HALF_UNIT_STORAGE_SCALE = 2;
const CLASS_BASE_ATTRIBUTE_TOTAL = 50;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, "game.db");
export const db = new DatabaseSync(dbPath);

db.function("search_normalize", { deterministic: true }, (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim());

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
  CREATE INDEX IF NOT EXISTS idx_entities_type_character_id
    ON entities(type, json_extract(data, '$.character_id'));
  CREATE INDEX IF NOT EXISTS idx_entities_type_guild_id
    ON entities(type, json_extract(data, '$.guild_id'));
  CREATE INDEX IF NOT EXISTS idx_entities_type_name_search
    ON entities(type, search_normalize(CAST(json_extract(data, '$.name') AS TEXT)));
  CREATE INDEX IF NOT EXISTS idx_entities_arena_rank
    ON entities(
      type,
      CAST(COALESCE(json_extract(data, '$.arena_rating'), 1000) AS INTEGER) DESC,
      CAST(COALESCE(json_extract(data, '$.arena_wins'), 0) AS INTEGER) DESC,
      id ASC
    );
  CREATE INDEX IF NOT EXISTS idx_entities_arena_rank_nocase
    ON entities(
      type,
      CAST(COALESCE(json_extract(data, '$.arena_rating'), 1000) AS INTEGER) DESC,
      CAST(COALESCE(json_extract(data, '$.arena_wins'), 0) AS INTEGER) DESC,
      id COLLATE NOCASE ASC
    );

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
  if (!cols.has("session_version")) {
    db.exec("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1");
  }
  if (!cols.has("active_nakama_session_key")) {
    db.exec("ALTER TABLE users ADD COLUMN active_nakama_session_key TEXT");
  }
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
 * One-time historical 10× inflation of Stardust/shop stored amounts.
 * XP is 1:1 production policy — this migration must not convert XP.
 * Already-stamped databases are unchanged (idempotent via app_meta).
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
    // XP is 1:1 — do not multiply experience / experience_to_next_level.
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
      // XP is 1:1 — do not multiply next.experience.
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
      // XP is 1:1 — do not multiply next.experience.
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
    console.log(`[migrate] Legacy Stardust 10× amounts applied (${META_KEY}); XP left 1:1`);
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    console.error("[migrate] Legacy Stardust 10× amounts failed:", err);
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
       if (Number(data.economy_nova_scale) === NOVA_HALF_UNIT_STORAGE_SCALE) {
        update.run(JSON.stringify(data), now, row.id);
        continue;
      }
      const raw = Number(data.nova_crystals) || 0;
       const half = Math.max(0, Math.floor(raw * NOVA_HALF_UNIT_STORAGE_SCALE));
      data.nova_crystals = half;
       data.economy_nova_scale = NOVA_HALF_UNIT_STORAGE_SCALE;
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

/**
 * Dual Nova balances — wagerable vs promotional.
 * Evidence: pack grants tied to character → wagerable; remainder → promotional.
 * Uncertain balances (no pack evidence) → all promotional (never silently all-purchased).
 */
(() => {
  const META_KEY = "nova_dual_balance_v1";
  const existing = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(META_KEY);
  if (existing?.value === "done") return;

  try {
    db.exec("BEGIN IMMEDIATE");
    const rows = db.prepare("SELECT id, data FROM entities WHERE type = 'Character'").all();
    const update = db.prepare("UPDATE entities SET data = ?, updated_date = ? WHERE id = ? AND type = 'Character'");
    const now = new Date().toISOString();
    let uncertain = 0;
    let evidenced = 0;
    for (const row of rows) {
      let data;
      try {
        data = JSON.parse(row.data);
      } catch {
        continue;
      }
      if (data.nova_dual_balance_v1) {
        update.run(JSON.stringify(data), now, row.id);
        continue;
      }
      const total = Math.max(0, Math.floor(Number(data.nova_crystals) || 0));
      let evidencedWagerable = 0;
      try {
        const ops = db.prepare(`
          SELECT result_json FROM wallet_operations
          WHERE operation_type = 'econ_credit_nova_crystals'
        `).all();
        for (const op of ops) {
          let tx;
          try { tx = JSON.parse(op.result_json || "{}"); } catch { continue; }
          if (tx.category !== "nova_pack_grant") continue;
          if (tx.related_entity_id !== row.id && tx.character_id !== row.id) continue;
           const half = Number(tx.amount_half_units)
             || Math.round((Number(tx.amount) || 0) * NOVA_HALF_UNIT_STORAGE_SCALE);
          if (half > 0) evidencedWagerable += half;
        }
      } catch { /* ignore */ }
      const wagerable = Math.min(total, Math.max(0, evidencedWagerable));
      const promotional = Math.max(0, total - wagerable);
      const classification = evidencedWagerable > 0
        ? (wagerable < total ? "pack_evidence_remainder_promotional" : "pack_evidence_full")
        : (total > 0 ? "uncertain_remainder_as_promotional" : "empty");
      if (classification.startsWith("uncertain")) uncertain += 1;
      if (classification.startsWith("pack_")) evidenced += 1;
      data.nova_wagerable_half = wagerable;
      data.nova_promotional_half = promotional;
      data.nova_crystals = total;
       data.economy_nova_scale = NOVA_HALF_UNIT_STORAGE_SCALE;
      data.nova_dual_balance_v1 = true;
      data.nova_migration_classification = classification;
      update.run(JSON.stringify({ ...data, id: row.id }), now, row.id);
    }
    db.prepare(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(META_KEY, "done");
    db.exec("COMMIT");
    console.log(`[migrate] Nova dual balances applied (${META_KEY}) evidenced=${evidenced} uncertain_as_promo=${uncertain}`);
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    console.error("[migrate] Nova dual balances failed:", err);
    throw err;
  }
})();

/** One-time repair — merge missing class-base stats (50-point spread) for legacy rows. */
(function migrateClassBaseStatsV1() {
  const META_KEY = "class_base_stats_repair_v1";
  const done = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(META_KEY);
  if (done?.value === "done") return;

  const CLASS_BASE = {
    Vanguard: { strength: 15, agility: 8, intellect: 6, vitality: 14, luck: 7 },
    "Astral Warden": { strength: 15, agility: 8, intellect: 6, vitality: 14, luck: 7 },
    "Shadow Operative": { strength: 7, agility: 15, intellect: 7, vitality: 11, luck: 10 },
    "Void Runner": { strength: 7, agility: 15, intellect: 7, vitality: 11, luck: 10 },
    Technomancer: { strength: 6, agility: 8, intellect: 15, vitality: 13, luck: 8 },
    "Cosmic Engineer": { strength: 6, agility: 8, intellect: 15, vitality: 13, luck: 8 },
  };
  const ATTR_KEYS = ["strength", "agility", "intellect", "vitality", "luck"];

  const sumStats = (stats) =>
    ATTR_KEYS.reduce((s, k) => s + Math.max(0, Math.round(Number(stats?.[k]) || 0)), 0);

  const repairRow = (character) => {
    const base = CLASS_BASE[character?.class];
    if (!base) return { stats: character?.stats || {}, repaired: false };
    const current = {};
    for (const k of ATTR_KEYS) {
      current[k] = Math.max(0, Math.round(Number(character?.stats?.[k]) || 0));
    }
    if (sumStats(current) >= CLASS_BASE_ATTRIBUTE_TOTAL) {
      return { stats: current, repaired: false };
    }
    const repaired = {};
    for (const k of ATTR_KEYS) {
      repaired[k] = (base[k] || 0) + (current[k] || 0);
    }
    return { stats: repaired, repaired: true };
  };

  const rows = db.prepare("SELECT id, data FROM entities WHERE type = 'Character'").all();
  const update = db.prepare("UPDATE entities SET data = ?, updated_date = ? WHERE id = ? AND type = 'Character'");
  const now = new Date().toISOString();
  let repaired = 0;

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      let data;
      try {
        data = JSON.parse(row.data);
      } catch {
        continue;
      }
      const { stats, repaired: needsRepair } = repairRow(data);
      if (!needsRepair) continue;
      data.stats = stats;
      update.run(JSON.stringify({ ...data, id: row.id }), now, row.id);
      repaired += 1;
    }
    db.prepare(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(META_KEY, "done");
    db.exec("COMMIT");
    console.log(`[migrate] Class base stats repair applied (${META_KEY}) repaired=${repaired}`);
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    console.error("[migrate] Class base stats repair failed:", err);
    throw err;
  }
})();

/**
 * Leveling slowdown (global 1.5× + tapering early-game modifier) migration.
 * Recomputes each character's `experience_to_next_level` for their CURRENT level
 * under the new XP-requirement curve. Because the requirement only ever rises,
 * no character can cross a threshold, so accumulated experience and level are
 * preserved and no XP is created or destroyed. If a character somehow already
 * satisfies the new requirement (corrupted/admin data), it is resolved with the
 * authoritative carryover/level-up logic (`grantCharacterXp`) — not a bespoke
 * path — so overflow, multi-level, and +2 attribute awards behave normally.
 *
 * `expForLevel` and `grantCharacterXp` are injected by the caller (server
 * bootstrap) so this module never imports the XP curve, which would create a
 * db.js ↔ rewards.js load cycle. Returns a small summary; idempotent via app_meta.
 */
export function migrateXpRequirementSlowdown({ expForLevel, grantCharacterXp } = {}) {
  const META_KEY = "xp_requirement_slowdown_v1";
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const existing = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(META_KEY);
  if (existing?.value === "done") return { skipped: true };
  if (typeof expForLevel !== "function") {
    throw new Error("migrateXpRequirementSlowdown requires expForLevel");
  }

  try {
    db.exec("BEGIN IMMEDIATE");
    const rows = db.prepare("SELECT id, data FROM entities WHERE type = 'Character'").all();
    const update = db.prepare(
      "UPDATE entities SET data = ?, updated_date = ? WHERE id = ? AND type = 'Character'",
    );
    const now = new Date().toISOString();
    let updated = 0;
    let carriedOver = 0;
    for (const row of rows) {
      let data;
      try {
        data = JSON.parse(row.data);
      } catch {
        continue;
      }
      const level = Math.max(1, Math.floor(Number(data.level) || 1));
      const experience = Math.max(0, Math.floor(Number(data.experience) || 0));
      const newReq = expForLevel(level);

      if (experience > 0 && experience >= newReq && typeof grantCharacterXp === "function") {
        // Defensive (unreachable when raising a requirement): resolve any pending
        // level-ups through the authoritative granter so no XP is lost.
        const res = grantCharacterXp({
          character: { ...data, level, experience: 0, experience_to_next_level: newReq },
          xpAmount: experience,
          source: "xp_slowdown_migration",
        });
        data.level = res.patch.level ?? level;
        data.experience = res.patch.experience ?? experience;
        data.experience_to_next_level = res.patch.experience_to_next_level ?? newReq;
        if (res.patch.stats) data.stats = res.patch.stats;
        carriedOver += 1;
      } else {
        // Normal path: raise only the requirement; experience and level untouched.
        data.experience_to_next_level = newReq;
      }
      update.run(JSON.stringify({ ...data, id: row.id }), now, row.id);
      updated += 1;
    }
    db.prepare(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(META_KEY, "done");
    db.exec("COMMIT");
    console.log(
      `[migrate] XP requirement slowdown applied (${META_KEY}) updated=${updated} carried_over=${carriedOver}`,
    );
    return { skipped: false, updated, carriedOver };
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    console.error("[migrate] XP requirement slowdown failed:", err);
    throw err;
  }
}

/**
 * Phase 1: reconstruct development character progression onto productionMath.
 * Recomputes XP-to-next from xpToNext(level), clamps leftover XP (does not
 * convert obsolete ×10 units into extra levels), and recomposes attributes
 * from starting + free-from-level + purchases.
 */
export function migratePhase1ProgressionFoundation({ reconstructProgressionState } = {}) {
  const META_KEY = "phase1_production_progression_v1";
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const existing = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(META_KEY);
  if (existing?.value === "done") return { skipped: true };
  if (typeof reconstructProgressionState !== "function") {
    throw new Error("migratePhase1ProgressionFoundation requires reconstructProgressionState");
  }

  try {
    db.exec("BEGIN IMMEDIATE");
    const rows = db.prepare("SELECT id, data FROM entities WHERE type = 'Character'").all();
    const update = db.prepare(
      "UPDATE entities SET data = ?, updated_date = ? WHERE id = ? AND type = 'Character'",
    );
    const now = new Date().toISOString();
    let updated = 0;
    for (const row of rows) {
      let data;
      try {
        data = JSON.parse(row.data);
      } catch {
        continue;
      }
      const rebuilt = reconstructProgressionState(data);
      Object.assign(data, rebuilt);
      update.run(JSON.stringify({ ...data, id: row.id }), now, row.id);
      updated += 1;
    }
    db.prepare(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(META_KEY, "done");
    db.exec("COMMIT");
    console.log(`[migrate] Phase 1 production progression applied (${META_KEY}) updated=${updated}`);
    return { skipped: false, updated };
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    console.error("[migrate] Phase 1 production progression failed:", err);
    throw err;
  }
}

(function migrateAccountServerSessionsFromUsers() {
  migrateLegacyUserSessionColumns();
})();

import { clock } from "./shared/time/clock.js";

export function nowIso() {
  return clock.nowIso();
}
