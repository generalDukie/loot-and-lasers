/**
 * Time & scheduling unit tests (no external runner).
 * Run: node server/scripts/test-time.mjs
 */
import assert from "node:assert/strict";
import {
  clock,
  installFakeClock,
  resetClockState,
  parseInstant,
  toIsoUtc,
  isValidTimeZone,
  todayET,
  msUntilNextETMidnight,
  dailyPeriodId,
  getWeekKey,
  weekEndUtc,
  zonedLocalToUtc,
  computeNextOccurrences,
  TimeErrors,
  evaluateEventWindow,
} from "../src/shared/time/index.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    resetClockState();
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log("\nTime & scheduling tests\n");

test("rejects naive timestamps without offset", () => {
  assert.throws(() => parseInstant("2026-07-29T14:00:00"), (e) => e.code === TimeErrors.TIMESTAMP_OFFSET_REQUIRED);
});

test("parses Z timestamps", () => {
  const d = parseInstant("2026-07-29T18:00:00.000Z");
  assert.equal(toIsoUtc(d), "2026-07-29T18:00:00.000Z");
});

test("validates IANA zones", () => {
  assert.equal(isValidTimeZone("America/New_York"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone("EST"), false);
});

test("fake clock freezes now", () => {
  const fake = installFakeClock(Date.parse("2026-01-15T12:00:00.000Z"));
  assert.equal(clock.nowIso(), "2026-01-15T12:00:00.000Z");
  fake.advance(60_000);
  assert.equal(clock.nowIso(), "2026-01-15T12:01:00.000Z");
});

test("todayET uses America/New_York", () => {
  installFakeClock(Date.parse("2026-07-29T03:30:00.000Z")); // still prior evening in ET in summer? 03:30Z = 23:30 EDT prev day
  // 2026-07-29 03:30 UTC = 2026-07-28 23:30 EDT
  assert.equal(todayET(), "2026-07-28");
  installFakeClock(Date.parse("2026-07-29T08:00:00.000Z")); // 04:00 EDT
  assert.equal(todayET(), "2026-07-29");
});

test("msUntilNextETMidnight positive and < 26h", () => {
  const ms = msUntilNextETMidnight(Date.parse("2026-07-29T15:00:00.000Z"));
  assert.ok(ms > 0 && ms < 26 * 3600 * 1000);
});

test("dailyPeriodId stable format", () => {
  installFakeClock(Date.parse("2026-07-29T16:00:00.000Z"));
  assert.match(dailyPeriodId({ region: "na" }), /^daily:na:\d{4}-\d{2}-\d{2}$/);
});

test("getWeekKey returns ISO-like week", () => {
  installFakeClock(Date.parse("2026-07-29T16:00:00.000Z"));
  assert.match(getWeekKey(), /^\d{4}-W\d{2}$/);
});

test("weekEndUtc is after now", () => {
  installFakeClock(Date.parse("2026-07-29T16:00:00.000Z"));
  assert.ok(weekEndUtc().getTime() > clock.nowMs());
});

test("DST spring-forward skipped 2:30 America/New_York 2026", () => {
  // US DST 2026: springs forward 2026-03-08 02:00 → 03:00
  const resolved = zonedLocalToUtc(
    { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 },
    "America/New_York",
    { skippedTimePolicy: "next_valid" }
  );
  assert.ok(resolved.utc instanceof Date);
  assert.ok(resolved.dstAdjusted);
});

test("DST fall-back ambiguous 1:30 picks earlier by default", () => {
  // Falls back 2026-11-01 02:00 → 01:00
  const earlier = zonedLocalToUtc(
    { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 },
    "America/New_York",
    { ambiguityPolicy: "earlier" }
  );
  const later = zonedLocalToUtc(
    { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 },
    "America/New_York",
    { ambiguityPolicy: "later" }
  );
  assert.ok(later.utc.getTime() >= earlier.utc.getTime());
});

test("daily recurrence next occurrences are UTC ISO", () => {
  installFakeClock(Date.parse("2026-07-29T12:00:00.000Z"));
  const occ = computeNextOccurrences(
    {
      id: "t1",
      recurrence: "daily",
      localTime: "00:00",
      timeZoneId: "America/New_York",
    },
    clock.now(),
    3
  );
  assert.equal(occ.length, 3);
  for (const o of occ) {
    assert.match(o.scheduledAtUtc, /Z$/);
    assert.match(o.occurrenceId, /^schedule:t1:/);
  }
});

test("weekly Monday recurrence", () => {
  installFakeClock(Date.parse("2026-07-29T12:00:00.000Z")); // Wednesday
  const occ = computeNextOccurrences(
    {
      id: "w1",
      recurrence: "weekly",
      localTime: "00:00",
      timeZoneId: "America/New_York",
      weekdays: [1],
    },
    clock.now(),
    2
  );
  assert.equal(occ.length, 2);
  assert.ok(new Date(occ[0].scheduledAtUtc) > clock.now());
});

test("event window status transitions", () => {
  const window = {
    id: "e1",
    startsAtUtc: "2026-07-29T12:00:00.000Z",
    endsAtUtc: "2026-07-29T14:00:00.000Z",
    gracePeriodMs: 15 * 60 * 1000,
    claimEndsAtUtc: "2026-07-29T15:00:00.000Z",
  };
  assert.equal(evaluateEventWindow(window, new Date("2026-07-29T11:00:00.000Z")), "scheduled");
  assert.equal(evaluateEventWindow(window, new Date("2026-07-29T12:00:00.000Z")), "active");
  assert.equal(evaluateEventWindow(window, new Date("2026-07-29T14:05:00.000Z")), "grace_period");
  assert.equal(evaluateEventWindow(window, new Date("2026-07-29T14:20:00.000Z")), "claim_only");
  assert.equal(evaluateEventWindow(window, new Date("2026-07-29T16:00:00.000Z")), "ended");
});

test("stable occurrence ids match schedule:id:utc", () => {
  const occ = computeNextOccurrences(
    {
      id: "abc",
      recurrence: "daily",
      localTime: "12:00",
      timeZoneId: "UTC",
    },
    new Date("2026-07-29T00:00:00.000Z"),
    1
  )[0];
  assert.equal(occ.occurrenceId, `schedule:abc:${occ.scheduledAtUtc}`);
});

resetClockState();
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
