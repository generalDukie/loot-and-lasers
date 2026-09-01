/**
 * Phase 6 certification runner.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "server/scripts/test-phase6-market.mjs",
  "server/scripts/test-phase6-contraband.mjs",
  "server/scripts/test-phase6-pricing.mjs",
  "server/scripts/test-phase6-quality.mjs",
  "server/scripts/test-phase6-transactions.mjs",
  "server/scripts/test-shops.mjs",
  "server/scripts/test-shop-purchases.mjs",
  "server/scripts/test-shop-stress.mjs",
];

let failed = 0;
for (const rel of files) {
  console.log(`\n── ${rel} ──`);
  const result = spawnSync(
    process.execPath,
    ["--import", "./server/scripts/register-src-alias.mjs", rel],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0) failed += 1;
}
if (failed) {
  console.error(`\nPhase 6 runner: ${failed} suite(s) failed`);
  process.exit(1);
}
console.log("\nPhase 6 runner: all composed suites passed");
