/**
 * Shared scheduler façade tests (Restoration 21).
 * Run: npm run test:scheduler
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-sched-"));
process.env.DB_PATH = path.join(tmpDir, "test-sched.db");

const { installFakeClock, resetClockState, clock } = await import("../src/shared/time/clock.js");
const {
  getGameTime,
  executeDailyReset,
  executeWeeklyReset,
  serializeCooldown,
  recoverMissedSchedules,
  RECURRING_CONSUMERS,
  listDailyHooks,
  registerDailyHook,
} = await import("../src/shared/schedulerService.js");
const { checkFuelReset, FUEL_CYCLE_MS, FUEL_MAX } = await import("../src/shared/economyFormulas.js");
const { GetGameTime } = await import("../src/functions/index.js");
const { ensureDefaultSchedules } = await import("../src/scheduling/bootstrap.js");
const { getScheduleByKey } = await import("../src/scheduling/store.js");

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

console.log("\nShared Scheduler (Restoration 21)\n");

test("getGameTime exposes ET day/week and shop window", () => {
  const gt = getGameTime();
  assert.ok(gt.serverTimeUtc);
  assert.equal(gt.gameTimeZoneId, "America/New_York");
  assert.ok(String(gt.todayET).match(/^\d{4}-\d{2}-\d{2}$/));
  assert.ok(gt.dailyPeriodId.startsWith("daily:na:"));
  assert.ok(gt.weeklyPeriodId.startsWith("weekly:"));
  assert.ok(gt.shopWindow);
  assert.ok(Array.isArray(gt.consumers));
});

test("RECURRING_CONSUMERS documents absent casino/stats daily", () => {
  const casino = RECURRING_CONSUMERS.find((c) => c.id === "casino_daily_limits");
  assert.equal(casino.kind, "absent");
  const stats = RECURRING_CONSUMERS.find((c) => c.id === "statistics_daily_warehouse");
  assert.equal(stats.kind, "absent");
  const fuel = RECURRING_CONSUMERS.find((c) => c.id === "fuel_cycle");
  assert.equal(fuel.kind, "rolling_24h");
  const arena = RECURRING_CONSUMERS.find((c) => c.id === "arena_daily");
  assert.equal(arena.kind, "production_game_day");
  assert.deepEqual(arena.fields, ["arena_rewarded_wins_date"]);
  assert.equal(JSON.stringify(RECURRING_CONSUMERS).includes("arena_attempts"), false);
});

await testAsync("executeDailyReset runs hooks idempotently", async () => {
  let calls = 0;
  registerDailyHook("test_probe", async () => {
    calls += 1;
    return { ok: true };
  });
  const a = await executeDailyReset({});
  const b = await executeDailyReset({});
  assert.equal(a.type, "daily_reset");
  assert.ok(a.periodId);
  assert.equal(a.hooks.test_probe.ok, true);
  assert.equal(b.hooks.test_probe.ok, true);
  assert.equal(calls, 2);
  assert.ok(listDailyHooks().includes("period_marker"));
});

await testAsync("executeWeeklyReset returns week key", async () => {
  const w = await executeWeeklyReset({});
  assert.equal(w.type, "weekly_reset");
  assert.ok(w.weekKey);
});

test("serializeCooldown remaining ms", () => {
  const now = clock.nowMs();
  const c = serializeCooldown(now + 5000, now);
  assert.equal(c.active, true);
  assert.ok(c.remaining_ms >= 4900 && c.remaining_ms <= 5000);
  const done = serializeCooldown(now - 1000, now);
  assert.equal(done.active, false);
  assert.equal(done.remaining_ms, 0);
});

test("fuel reset uses clock not wall Date.now (fake clock)", () => {
  resetClockState();
  const t0 = Date.parse("2026-06-01T12:00:00.000Z");
  installFakeClock(t0);
  const ch = {
    fuel: 10,
    max_fuel: FUEL_MAX,
    fuel_reset_at: new Date(t0 - FUEL_CYCLE_MS - 1000).toISOString(),
    fuel_purchases: 5,
  };
  const patch = checkFuelReset(ch);
  assert.ok(patch);
  assert.equal(patch.fuel, FUEL_MAX);
  assert.equal(patch.fuel_purchases, 0);
  assert.equal(Date.parse(patch.fuel_reset_at), t0);
  // Within cycle — no reset
  installFakeClock(t0);
  const ch2 = {
    fuel: 50,
    max_fuel: FUEL_MAX,
    fuel_reset_at: new Date(t0 - 1000).toISOString(),
    fuel_purchases: 2,
  };
  assert.equal(checkFuelReset(ch2), null);
  const overCap = checkFuelReset({
    fuel: 102,
    max_fuel: 102,
    fuel_reset_at: new Date(t0 - 1000).toISOString(),
    fuel_purchases: 0,
  });
  assert.deepEqual(overCap, { fuel: FUEL_MAX });
  const midCycleKeep = checkFuelReset({
    fuel: 100_000,
    max_fuel: FUEL_MAX,
    fuel_reset_at: new Date(t0 - 1000).toISOString(),
    fuel_purchases: 0,
  }, t0, { preserveOverfill: true });
  assert.equal(midCycleKeep, null);
  const cycleKeepOverfill = checkFuelReset({
    fuel: 100_000,
    max_fuel: FUEL_MAX,
    fuel_reset_at: new Date(t0 - FUEL_CYCLE_MS - 1000).toISOString(),
    fuel_purchases: 5,
  }, t0, { preserveOverfill: true });
  assert.ok(cycleKeepOverfill);
  assert.equal(cycleKeepOverfill.fuel, 100_000);
  assert.equal(cycleKeepOverfill.fuel_purchases, 0);
  assert.equal(Date.parse(cycleKeepOverfill.fuel_reset_at), t0);
  const cycleFillBelowCap = checkFuelReset({
    fuel: 50,
    max_fuel: FUEL_MAX,
    fuel_reset_at: new Date(t0 - FUEL_CYCLE_MS - 1000).toISOString(),
    fuel_purchases: 5,
  }, t0, { preserveOverfill: true });
  assert.ok(cycleFillBelowCap);
  assert.equal(cycleFillBelowCap.fuel, FUEL_MAX);
  resetClockState();
});

test("timezone independence: same period for offset clocks in same ET day", () => {
  resetClockState();
  // 2026-03-15 10:00 ET ≈ 14:00 UTC (EDT)
  installFakeClock(Date.parse("2026-03-15T14:00:00.000Z"));
  const a = getGameTime().todayET;
  installFakeClock(Date.parse("2026-03-15T18:00:00.000Z"));
  const b = getGameTime().todayET;
  assert.equal(a, b);
  resetClockState();
});

await testAsync("GetGameTime RPC requires user", async () => {
  const denied = await GetGameTime(null, {});
  assert.equal(denied.status, 401);
  const ok = await GetGameTime({ id: "u1" }, {});
  assert.equal(ok.status, 200);
  assert.ok(ok.body.todayET);
});

test("default schedules seeded", () => {
  ensureDefaultSchedules();
  assert.ok(getScheduleByKey("daily-reset-et"));
  assert.ok(getScheduleByKey("weekly-reset-et"));
  assert.ok(getScheduleByKey("mail-expiry-sweep"));
});

await testAsync("recoverMissedSchedules is tick alias", async () => {
  ensureDefaultSchedules();
  const result = await recoverMissedSchedules();
  assert.ok(result == null || typeof result === "object");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
