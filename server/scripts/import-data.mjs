/**
 * Import game data JSON into local SQLite.
 *
 * Usage:
 *   node scripts/import-data.mjs --file ./data/migration/backup.json        # dry-run
 *   node scripts/import-data.mjs --file ./data/migration/backup.json --apply
 *
 * Options:
 *   --apply                  Write to database (default is dry-run)
 *   --default-password X     Password for imported users (default: changeme-import)
 *   --skip-users             Skip users table import
 *   --types Character,Item   Only import these entity types
 *   --replace                Delete existing rows of each type before import
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { db, nowIso } from "../src/db.js";
import { IMPORT_ORDER } from "./migration/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    file: null,
    apply: false,
    skipUsers: false,
    defaultPassword: process.env.IMPORT_DEFAULT_PASSWORD || "changeme-import",
    types: null,
    replace: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--skip-users") opts.skipUsers = true;
    else if (a === "--replace") opts.replace = true;
    else if (a === "--file" && argv[i + 1]) opts.file = path.resolve(argv[++i]);
    else if (a === "--default-password" && argv[i + 1]) opts.defaultPassword = argv[++i];
    else if (a === "--types" && argv[i + 1]) opts.types = argv[++i].split(",").map((s) => s.trim());
  }
  return opts;
}

function loadExport(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (raw.entities && typeof raw.entities === "object") return raw;
  // Allow flat { Character: [...], Item: [...] } dumps
  const entities = {};
  for (const [key, val] of Object.entries(raw)) {
    if (Array.isArray(val) && key[0] === key[0].toUpperCase()) entities[key] = val;
  }
  return { version: 1, users: raw.users || [], entities };
}

function normalizeEntity(doc) {
  const {
    id,
    created_by = null,
    created_by_id = null,
    created_date,
    updated_date,
    ...rest
  } = doc;
  if (!id) throw new Error("Entity missing id");
  const ts = created_date || nowIso();
  const upd = updated_date || ts;
  const payload = {
    ...rest,
    id,
    created_by,
    created_by_id,
    created_date: ts,
    updated_date: upd,
  };
  return { id, created_by, created_by_id, created_date: ts, updated_date: upd, payload };
}

function upsertEntity(type, doc) {
  const { id, created_by, created_by_id, created_date, updated_date, payload } = normalizeEntity(doc);
  db.prepare(`
    INSERT INTO entities (id, type, data, created_by, created_by_id, created_date, updated_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      data = excluded.data,
      created_by = excluded.created_by,
      created_by_id = excluded.created_by_id,
      created_date = excluded.created_date,
      updated_date = excluded.updated_date
  `).run(id, type, JSON.stringify(payload), created_by, created_by_id, created_date, updated_date);
}

async function upsertUser(user, defaultPassword) {
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) throw new Error(`User ${user.id} missing email`);
  const ts = user.created_date || nowIso();
  const upd = user.updated_date || ts;
  const hash = await bcrypt.hash(defaultPassword, 10);

  const existingByEmail = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (existingByEmail && existingByEmail.id !== user.id) {
    throw new Error(`Email ${email} already belongs to user ${existingByEmail.id}`);
  }

  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, role, legacy_name, active_character_id,
      purchased_slots, email_verified, created_date, updated_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      role = excluded.role,
      legacy_name = excluded.legacy_name,
      active_character_id = excluded.active_character_id,
      purchased_slots = excluded.purchased_slots,
      updated_date = excluded.updated_date
  `).run(
    user.id,
    email,
    hash,
    user.role || "user",
    user.legacy_name || null,
    user.active_character_id || null,
    user.purchased_slots || 0,
    ts,
    upd
  );
}

function collectIds(exportData) {
  const characterIds = new Set((exportData.entities.Character || []).map((r) => r.id));
  const userIds = new Set((exportData.users || []).map((r) => r.id));
  for (const r of exportData.entities.User || []) {
    if (r?.id) userIds.add(r.id);
  }
  return { characterIds, userIds };
}

function validateReferences(exportData) {
  const warnings = [];
  const { characterIds, userIds } = collectIds(exportData);

  for (const item of exportData.entities.Item || []) {
    if (item.character_id && !characterIds.has(item.character_id)) {
      warnings.push(`Item ${item.id} references missing character ${item.character_id}`);
    }
    if (item.owner_id && !userIds.has(item.owner_id)) {
      warnings.push(`Item ${item.id} references missing user owner ${item.owner_id}`);
    }
  }
  for (const mail of exportData.entities.Mail || []) {
    if (mail.owner_id && !characterIds.has(mail.owner_id)) {
      warnings.push(`Mail ${mail.id} references missing character owner ${mail.owner_id}`);
    }
  }
  for (const ch of exportData.entities.Character || []) {
    if (ch.created_by_id && !userIds.has(ch.created_by_id)) {
      warnings.push(`Character ${ch.id} references missing user ${ch.created_by_id}`);
    }
  }
  return warnings;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.file) {
    console.error("Usage: node scripts/import-data.mjs --file ./data/migration/backup.json [--apply]");
    process.exit(1);
  }
  if (!fs.existsSync(opts.file)) {
    console.error(`File not found: ${opts.file}`);
    process.exit(1);
  }

  const exportData = loadExport(opts.file);
  const entityMap = exportData.entities || {};
  const order = opts.types
    ? opts.types
    : IMPORT_ORDER.filter((t) => entityMap[t]?.length);

  const warnings = validateReferences(exportData);
  const userCount = opts.skipUsers ? 0 : (exportData.users || []).length;
  let entityCount = 0;
  for (const t of order) entityCount += (entityMap[t] || []).length;

  console.log(`\nImport ${opts.apply ? "APPLY" : "DRY-RUN"} ← ${opts.file}`);
  console.log(`  users: ${userCount}${opts.skipUsers ? " (skipped)" : ""}`);
  console.log(`  entities: ${entityCount} across ${order.length} types`);
  for (const t of order) {
    const n = (entityMap[t] || []).length;
    if (n) console.log(`    ${t}: ${n}`);
  }
  if (warnings.length) {
    console.log(`\n  ${warnings.length} reference warning(s):`);
    for (const w of warnings.slice(0, 20)) console.log(`    ⚠ ${w}`);
    if (warnings.length > 20) console.log(`    ... and ${warnings.length - 20} more`);
  }

  if (!opts.apply) {
    console.log("\nDry-run only. Re-run with --apply to write to the database.");
    console.log(`Imported users will get password: ${opts.defaultPassword}`);
    console.log("Tell players to use Forgot Password after migration.\n");
    return;
  }

  if (!opts.skipUsers) {
    for (const user of exportData.users || []) {
      await upsertUser(user, opts.defaultPassword);
    }
    console.log(`Imported ${exportData.users?.length || 0} users`);
  }

  for (const type of order) {
    const rows = entityMap[type] || [];
    if (!rows.length) continue;
    if (opts.replace) {
      db.prepare("DELETE FROM entities WHERE type = ?").run(type);
    }
    for (const row of rows) {
      upsertEntity(type, row);
    }
    console.log(`  ✓ ${type}: ${rows.length}`);
  }

  // Import User entities into entity store if present (auth still uses users table)
  if (!opts.types && Array.isArray(entityMap.User) && entityMap.User.length) {
    if (opts.replace) db.prepare("DELETE FROM entities WHERE type = ?").run("User");
    for (const row of entityMap.User) upsertEntity("User", row);
    console.log(`  ✓ User entities: ${entityMap.User.length}`);
  }

  console.log("\nImport complete.");
  console.log(`Users can log in with their email and password: ${opts.defaultPassword}`);
  console.log("Recommend forcing password reset via Forgot Password after go-live.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
