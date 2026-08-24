/**
 * Phase 4 certification runner. Composes math, board, settlement, and lifecycle suites.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "server/scripts/test-phase4-missions.mjs",
  "server/scripts/test-phase4-mission-combat-activation.mjs",
  "server/scripts/test-mission-duration.mjs",
  "server/scripts/test-mission-rewards.mjs",
  "server/scripts/test-mission-gear-drop.mjs",
  "server/scripts/test-mission-board-authority.mjs",
  "server/scripts/test-mission-reward-finalization.mjs",
  "server/scripts/test-phase4-mission-lifecycle.mjs",
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
  console.error(`\nPhase 4 runner: ${failed} suite(s) failed`);
  process.exit(1);
}
console.log("\nPhase 4 runner: all composed suites passed");
