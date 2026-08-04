/**
 * Observability tests (Restoration 27).
 * Run: npm run test:observability
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-obs-"));
process.env.DB_PATH = path.join(tmpDir, "test-obs.db");
process.env.LOG_LEVEL = "error"; // quiet structured logs during tests

const {
  CreateStructuredLogger,
  redactForLog,
  RedactSensitiveData,
  RecordMetric,
  incCounter,
  getMetricsSnapshot,
  resetMetricsForTests,
  getDroppedMetricCount,
  GenerateCorrelationID,
  GetLiveness,
  GetReadiness,
  GetBuildInfoPublic,
  RecordAnalyticsEvent,
  resetAnalyticsForTests,
  ANALYTICS_EVENTS,
} = await import("../src/shared/observability/index.js");
const { GetOpsTelemetry } = await import("../src/shared/adminOpsService.js");
const { RecordClientAnalytics, GetOpsTelemetryRpc } = await import("../src/functions/index.js");
const { db, nowIso } = await import("../src/db.js");
const { createHash } = await import("node:crypto");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

console.log("\nObservability (Restoration 27)\n");

test("structured logger exports and redacts tokens", () => {
  const log = CreateStructuredLogger("test");
  assert.equal(typeof log.info, "function");
  const red = redactForLog({
    authorization: "Bearer secret",
    password: "x",
    request_id: "abc12345",
    email: "player@example.com",
  });
  assert.equal(red.authorization, "[redacted]");
  assert.equal(red.password, "[redacted]");
  assert.equal(red.request_id, "abc12345");
  assert.match(String(red.email), /\*\*\*/);
  assert.equal(RedactSensitiveData({ access_token: "tok" }).access_token, "[redacted]");
});

test("metrics reject high-cardinality labels", () => {
  resetMetricsForTests();
  const before = getDroppedMetricCount();
  RecordMetric("test_counter", 1, { account_id: "u-1", route: "missions" });
  RecordMetric("test_counter", 1, { character_id: "c-1" });
  RecordMetric("http_ok", 1, { method: "GET", status_class: "2xx", route: "/health" });
  const snap = getMetricsSnapshot();
  assert.ok(snap.series.some((s) => s.name === "http_ok"));
  assert.ok(getDroppedMetricCount() >= before);
  // account_id series should not appear as a label
  for (const s of snap.series) {
    assert.equal(s.labels.account_id, undefined);
    assert.equal(s.labels.character_id, undefined);
  }
});

test("correlation id generated", () => {
  const a = GenerateCorrelationID();
  const b = GenerateCorrelationID();
  assert.ok(a.length >= 8);
  assert.notEqual(a, b);
});

test("liveness / readiness / build", () => {
  const live = GetLiveness();
  assert.equal(live.ok, true);
  assert.equal(live.probe, "liveness");
  const ready = GetReadiness();
  assert.equal(ready.ok, true);
  assert.equal(ready.checks.database.ok, true);
  const build = GetBuildInfoPublic();
  assert.equal(build.probe, "build");
  assert.ok(build.release);
});

test("analytics rejects unknown events and accepts registered", () => {
  resetAnalyticsForTests();
  assert.equal(RecordAnalyticsEvent({ name: "not_a_real_event" }).accepted, false);
  assert.equal(
    RecordAnalyticsEvent({ name: "screen_viewed", properties: { screen: "hub" }, source: "test" }).accepted,
    true,
  );
  assert.ok(ANALYTICS_EVENTS.screen_viewed);
});

test("analytics respects consent opt-out", () => {
  const r = RecordAnalyticsEvent({ name: "screen_viewed", consent: false });
  assert.equal(r.accepted, false);
  assert.equal(r.reason, "consent");
});

test("analytics outage isolation — oversized rejected without throw", () => {
  const big = { blob: "x".repeat(5000) };
  const r = RecordAnalyticsEvent({ name: "screen_viewed", properties: big });
  assert.equal(r.accepted, false);
});

await testAsync("RecordClientAnalytics never grants authority", async () => {
  const now = nowIso();
  const id = "u-obs";
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, 'user', 1, ?, ?)`,
  ).run(id, "obs@t.test", createHash("sha256").update("x").digest("hex"), now, now);
  const res = await RecordClientAnalytics({ id, role: "user" }, {
    name: "screen_viewed",
    properties: { screen: "missions" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.authoritative, false);
});

await testAsync("GetOpsTelemetry admin only", async () => {
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, 'user', 1, ?, ?)`,
  ).run("u-obs2", "obs2@t.test", createHash("sha256").update("x").digest("hex"), now, now);
  const denied = await GetOpsTelemetryRpc({ id: "u-obs2", role: "user" });
  assert.equal(denied.status, 403);

  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, 'admin', 1, ?, ?)`,
  ).run("u-obs-a", "obsa@t.test", createHash("sha256").update("x").digest("hex"), now, now);
  const ok = await GetOpsTelemetryRpc({ id: "u-obs-a", role: "admin" });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.dashboard);
  assert.ok(ok.body.dependencies);
});

test("incCounter does not throw on bad labels", () => {
  assert.doesNotThrow(() => incCounter("x", { transaction_id: "t-1", method: "POST" }));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
