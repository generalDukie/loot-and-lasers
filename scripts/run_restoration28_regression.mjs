#!/usr/bin/env node
/**
 * Restoration 28 — aggregated Node gameplay regression suite.
 * Does not claim production readiness; exits non-zero on any failure.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const SUITES = [
  "test:shared-foundation",
  "test:entity-access",
  "test:progression",
  "test:attributes",
  "test:inventory",
  "test:gear-stats",
  "test:combat",
  "test:passives",
  "test:mission-rewards",
  "test:shops",
  "test:shop-purchases",
  "test:mining",
  "test:dungeon",
  "test:economy",
  "test:stardust-economy",
  "test:arena",
  "test:arena-authority",
  "test:stims",
  "test:casino",
  "test:statistics",
  "test:achievements",
  "test:scheduler",
  "test:notifications",
  "test:social",
  "test:settings",
  "test:integrity",
  "test:admin",
  "test:observability",
  "test:audit",
  "test:entitlements",
  "test:rewards",
];

const results = [];
let failed = 0;

for (const script of SUITES) {
  const started = Date.now();
  const run = spawnSync(npm, ["run", script], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    env: process.env,
  });
  const ms = Date.now() - started;
  const ok = run.status === 0;
  if (!ok) failed += 1;
  results.push({
    script,
    ok,
    exit: run.status ?? 1,
    ms,
    stderr_tail: String(run.stderr || "")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-6)
      .join("\n"),
  });
  console.log(`${ok ? "PASS" : "FAIL"} ${script} (${ms}ms)`);
}

const outPath = path.join(root, "docs", "restoration28-test-results.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      passed: results.filter((r) => r.ok).length,
      failed,
      total: results.length,
      results,
    },
    null,
    2,
  ),
);

console.log(`\nRestoration 28 regression: ${results.length - failed}/${results.length} passed`);
console.log(`Wrote ${outPath}`);
process.exit(failed ? 1 : 0);
