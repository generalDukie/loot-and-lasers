/**
 * Isolated backup restore drill (Restoration 25).
 * Copies export JSON into a temp DB via import-data dry-run + apply.
 * Does not touch production game.db.
 *
 * Usage:
 *   node scripts/restore-drill.mjs --file ./data/migration/backup.json
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = { file: null, skipApply: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) opts.file = path.resolve(argv[++i]);
    else if (argv[i] === "--dry-only") opts.skipApply = true;
  }
  return opts;
}

const opts = parseArgs(process.argv);
if (!opts.file || !fs.existsSync(opts.file)) {
  console.error("Provide --file path to a backup JSON export");
  process.exit(2);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-restore-drill-"));
const dbPath = path.join(tmpDir, "restored.db");
const importScript = path.join(__dirname, "import-data.mjs");

console.log(`[restore-drill] temp DB: ${dbPath}`);

function runImport(apply) {
  const args = [importScript, "--file", opts.file];
  if (apply) args.push("--apply");
  const env = { ...process.env, DB_PATH: dbPath };
  const r = spawnSync(process.execPath, args, { env, encoding: "utf8" });
  console.log(r.stdout || "");
  if (r.stderr) console.error(r.stderr);
  return r.status;
}

const dryStatus = runImport(false);
if (dryStatus !== 0) {
  console.error("[restore-drill] dry-run failed");
  process.exit(dryStatus || 1);
}

if (opts.skipApply) {
  console.log("[restore-drill] dry-only complete");
  process.exit(0);
}

const applyStatus = runImport(true);
if (applyStatus !== 0) {
  console.error("[restore-drill] apply failed");
  process.exit(applyStatus || 1);
}

// Basic post-restore checks
process.env.DB_PATH = dbPath;
const { db } = await import("../src/db.js");
const users = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
const entities = db.prepare("SELECT COUNT(*) AS c FROM entities").get().c;
console.log(JSON.stringify({
  ok: true,
  db_path: dbPath,
  users,
  entities,
  note: "Isolated restore succeeded — not production",
}, null, 2));
