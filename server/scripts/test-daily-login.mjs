/**
 * Daily login status + claim authority tests.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-daily-login.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-daily-"));
process.env.DB_PATH = path.join(tmpDir, "test-daily.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const { ClaimDailyLogin, GetDailyLoginStatus } = await import("../src/functions/index.js");
const { buildDailyLoginRewardState } = await import("../src/shared/dailyLoginService.js");
const { todayET } = await import("../src/shared/time/index.js");

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

function hashPw(pw) {
  return createHash("sha256").update(pw).digest("hex");
}

function insertUser(id, email) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, 'user', 1, ?, ?)`,
  ).run(id, email, hashPw("x"), now, now);
  return { id, email, role: "user", active_character_id: null };
}

function makeChar(ownerId, opts = {}) {
  const ch = entities.Character.create({
    id: opts.id,
    name: opts.name || `Daily-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: ownerId,
    level: opts.level ?? 10,
    class: "Vanguard",
    race: "Human",
    stardust: opts.stardust ?? 100,
    nova_crystals: opts.nova ?? 10,
    experience: opts.xp ?? 0,
    fuel: opts.fuel ?? 5,
    max_fuel: 100,
  });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, ownerId);
  return entities.Character.get(ch.id);
}

function unwrap(res) {
  if (res?.status && res?.body) return { status: res.status, ...res.body };
  return res;
}

console.log("\nDaily login tests\n");

test("buildDailyLoginRewardState marks day 1 available when never claimed", () => {
  const state = buildDailyLoginRewardState(null, { today: "2099-01-01" });
  assert.equal(state.currentDay, 1);
  assert.equal(state.canClaimToday, true);
  assert.equal(state.rewards.length, 30);
  assert.equal(state.rewards[0].status, "available");
  assert.equal(state.rewards[1].status, "locked");
});

test("buildDailyLoginRewardState marks claimed + available correctly", () => {
  const state = buildDailyLoginRewardState(
    {
      current_day: 3,
      last_claim_date: "2099-01-01",
      claimed_days: [1, 2],
      cycle_theme: "Stardust Voyage",
    },
    { today: "2099-01-02" },
  );
  assert.equal(state.canClaimToday, true);
  assert.equal(state.rewards[0].status, "claimed");
  assert.equal(state.rewards[1].status, "claimed");
  assert.equal(state.rewards[2].status, "available");
  assert.equal(state.rewards[3].status, "locked");
});

test("same-day already claimed → canClaimToday false", () => {
  const today = todayET();
  const state = buildDailyLoginRewardState(
    {
      current_day: 2,
      last_claim_date: today,
      claimed_days: [1],
    },
    { today },
  );
  assert.equal(state.canClaimToday, false);
  assert.equal(state.rewards[1].status, "locked");
});

await testAsync("GetDailyLoginStatus returns normalized state", async () => {
  const u = insertUser("u-daily-1", "d1@test.local");
  const ch = makeChar(u.id, { name: "DailyOne", stardust: 200 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const status = unwrap(await GetDailyLoginStatus(user, {}));
  assert.equal(status.status, 200);
  assert.equal(status.success, true);
  assert.equal(status.daily_login.canClaimToday, true);
  assert.equal(status.daily_login.rewards.length, 30);
  assert.equal(status.daily_login.rewards[0].status, "available");
});

await testAsync("ClaimDailyLogin grants once; duplicate rejected/idempotent", async () => {
  const u = insertUser("u-daily-2", "d2@test.local");
  const ch = makeChar(u.id, { name: "DailyTwo", stardust: 200, xp: 0, fuel: 5 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const before = entities.Character.get(ch.id);

  const first = unwrap(await ClaimDailyLogin(user, {}));
  assert.equal(first.status, 200);
  assert.equal(first.success, true);
  assert.equal(first.claimed_day, 1);
  assert.ok(first.daily_login);
  assert.equal(first.daily_login.canClaimToday, false);
  assert.ok(first.character);
  assert.ok(first.balances);
  assert.ok(first.patch || first.applied);

  const mid = entities.Character.get(ch.id);
  assert.ok(mid.stardust >= before.stardust);

  const second = unwrap(await ClaimDailyLogin(user, {}));
  // Either 409 already claimed, or 200 idempotent replay — never double-grant.
  assert.ok(second.status === 409 || second.idempotentReplay || second.already_claimed);
  const after = entities.Character.get(ch.id);
  assert.equal(after.stardust, mid.stardust);
  assert.equal(after.experience, mid.experience);
});

await testAsync("missed day does not reset cycle; continues at current_day", async () => {
  const u = insertUser("u-daily-3", "d3@test.local");
  const ch = makeChar(u.id, { name: "DailyThree" });
  entities.DailyLogin.create({
    character_id: ch.id,
    last_claim_date: "2000-01-01",
    current_day: 5,
    claimed_days: [1, 2, 3, 4],
    cycle_theme: "Nebula Reckoning",
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const status = unwrap(await GetDailyLoginStatus(user, {}));
  assert.equal(status.daily_login.currentDay, 5);
  assert.equal(status.daily_login.canClaimToday, true);
  assert.equal(status.daily_login.rewards[4].status, "available");
  assert.equal(status.daily_login.cycleTheme, "Nebula Reckoning");

  const claim = unwrap(await ClaimDailyLogin(user, {}));
  assert.equal(claim.status, 200);
  assert.equal(claim.claimed_day, 5);
  assert.equal(claim.progress.current_day, 6);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
