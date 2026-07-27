/**
 * Export game data from a Loot & Lasers API into a JSON backup file.
 *
 * Usage:
 *   API_URL=http://localhost:8787 API_TOKEN=<admin-jwt> node scripts/export-data.mjs
 *
 * Options:
 *   --out ./data/migration/backup.json
 *   --types Character,Item,Guild
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENTITY_TYPES } from "./migration/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL || process.env.VITE_API_URL || "http://localhost:8787";
const TOKEN = process.env.API_TOKEN || process.env.ACCESS_TOKEN || "";
const APP_ID = process.env.APP_ID || "lootandlasers-local";

function parseArgs(argv) {
  const opts = {
    out: path.resolve(__dirname, "../data/migration/backup.json"),
    types: null,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) opts.out = path.resolve(argv[++i]);
    else if (argv[i] === "--types" && argv[i + 1]) opts.types = argv[++i].split(",").map((s) => s.trim());
  }
  return opts;
}

async function api(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${API.replace(/\/$/, "")}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "X-App-Id": APP_ID,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status}: ${data?.error || text}`);
  return data;
}

async function fetchEntityType(type, limit = 50000) {
  try {
    return await api(`/api/entities/${type}/filter`, {
      method: "POST",
      body: { query: {}, sort: "created_date", limit },
    });
  } catch {
    const q = new URLSearchParams({ sort: "created_date", limit: String(limit) });
    return await api(`/api/entities/${type}?${q}`);
  }
}

async function fetchUsers() {
  const users = [];
  try {
    const rows = await fetchEntityType("User");
    if (Array.isArray(rows)) {
      for (const row of rows) {
        users.push({
          id: row.id,
          email: row.email,
          role: row.role || "user",
          legacy_name: row.legacy_name || null,
          active_character_id: row.active_character_id || null,
          purchased_slots: row.purchased_slots || 0,
          created_date: row.created_date,
          updated_date: row.updated_date,
        });
      }
    }
  } catch (e) {
    console.warn(`[export] Could not fetch User entities: ${e.message}`);
  }
  return users;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!TOKEN) {
    console.error("Set API_TOKEN to an admin access token.");
    process.exit(1);
  }

  const types = opts.types || ENTITY_TYPES;
  const entities = {};
  let total = 0;

  console.log(`Exporting from ${API}`);
  console.log(`Types: ${types.join(", ")}`);

  for (const type of types) {
    if (type === "User") continue;
    process.stdout.write(`  ${type}... `);
    try {
      const rows = await fetchEntityType(type);
      entities[type] = Array.isArray(rows) ? rows : [];
      total += entities[type].length;
      console.log(entities[type].length);
    } catch (e) {
      entities[type] = [];
      console.log(`skip (${e.message})`);
    }
  }

  const users = types.includes("User") ? await fetchUsers() : [];

  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    source: "lootandlasers",
    app_id: APP_ID,
    api_url: API,
    users,
    entities,
    stats: {
      users: users.length,
      entities: total,
      by_type: Object.fromEntries(Object.entries(entities).map(([k, v]) => [k, v.length])),
    },
  };

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${opts.out}`);
  console.log(`  users: ${users.length}`);
  console.log(`  entities: ${total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
