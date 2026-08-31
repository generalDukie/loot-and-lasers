/**
 * Phase 5 certification runner. Composes Stim + Mining suites.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "server/scripts/test-phase5-stims.mjs",
  "server/scripts/test-phase5-mining.mjs",
  "server/scripts/test-stims.mjs",
  "server/scripts/test-mining.mjs",
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
  console.error(`\nPhase 5 runner: ${failed} suite(s) failed`);
  process.exit(1);
}
console.log("\nPhase 5 runner: all composed suites passed");
