/**
 * Versioned migration CLI (Restoration 25).
 *
 * Dry-run by default:
 *   node scripts/run-migration.mjs --id integrity_framework_v1
 * Apply:
 *   node scripts/run-migration.mjs --id integrity_framework_v1 --apply
 * List:
 *   node scripts/run-migration.mjs --list
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    id: null,
    apply: false,
    resume: false,
    list: false,
    dbPath: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--resume") opts.resume = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--id" && argv[i + 1]) opts.id = argv[++i];
    else if (a === "--db" && argv[i + 1]) opts.dbPath = path.resolve(argv[++i]);
  }
  return opts;
}

const opts = parseArgs(process.argv);
if (opts.dbPath) process.env.DB_PATH = opts.dbPath;

await import("../src/shared/migrations/registerBuiltins.js");
const {
  RunMigration,
  listMigrations,
} = await import("../src/shared/migrationFramework.js");

if (opts.list || !opts.id) {
  console.log("Registered migrations:");
  for (const m of listMigrations()) {
    console.log(`  - ${m.id} (target v${m.targetVersion}): ${m.description}`);
  }
  if (!opts.id) process.exit(0);
}

const report = await RunMigration(opts.id, {
  dryRun: !opts.apply,
  resume: opts.resume,
  operator: process.env.USER || process.env.USERNAME || "cli",
  env: process.env.NODE_ENV || "development",
});

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "completed" || report.status === "already_applied" ? 0 : 1);
