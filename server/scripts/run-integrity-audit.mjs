/**
 * Integrity audit CLI (Restoration 25).
 *
 * Usage:
 *   node scripts/run-integrity-audit.mjs --character <id>
 *   node scripts/run-integrity-audit.mjs --account <id> --quarantine
 *   node scripts/run-integrity-audit.mjs --character <id> --orphans
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    account: null,
    character: null,
    quarantine: false,
    orphans: false,
    scheduler: false,
    dbPath: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--quarantine") opts.quarantine = true;
    else if (a === "--orphans") opts.orphans = true;
    else if (a === "--scheduler") opts.scheduler = true;
    else if (a === "--account" && argv[i + 1]) opts.account = argv[++i];
    else if (a === "--character" && argv[i + 1]) opts.character = argv[++i];
    else if (a === "--db" && argv[i + 1]) opts.dbPath = path.resolve(argv[++i]);
  }
  return opts;
}

const opts = parseArgs(process.argv);
if (opts.dbPath) process.env.DB_PATH = opts.dbPath;

if (!opts.account && !opts.character && !opts.orphans && !opts.scheduler) {
  console.error("Provide --account, --character, --orphans, and/or --scheduler");
  process.exit(2);
}

const { RunIntegrityAudit } = await import("../src/shared/integrityService.js");
const report = RunIntegrityAudit({
  accountId: opts.account,
  characterId: opts.character,
  quarantine: opts.quarantine,
  includeOrphans: opts.orphans,
  includeScheduler: opts.scheduler,
});

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
