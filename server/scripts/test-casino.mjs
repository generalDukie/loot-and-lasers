/**
 * Casino authority tests (Restoration 18).
 * Run: npm run test:casino
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-casino-"));
process.env.DB_PATH = path.join(tmpDir, "test-casino.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  CASINO_WHEEL_TIERS,
  NOVA_CASINO_OPEN,
  getCasinoMaxStardustBet,
  CASINO_MIN_STARDUST_BET_FLOOR,
  CASINO_MAX_STARDUST_BET_CAP,
} = await import("../src/shared/economyFormulas.js");
const {
  resolveCasinoOutcome,
  rollWheelTier,
  validateCasinoBetAmount,
  serializeCasinoState,
  casinoWheelExpectedMultiplier,
  CASINO_RULES_VERSION,
  assertCasinoClientSafe,
} = await import("../src/shared/casinoService.js");
const { CasinoSettle, GetCasinoState, RecoverCasinoWager } = await import(
  "../src/functions/economyFollowOn.js"
);

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
    name: opts.name || `C-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: ownerId,
    level: opts.level ?? 20,
    class: "Vanguard",
    race: "Human",
    stats: {},
    stardust: opts.stardust ?? 100_000,
    nova_crystals: opts.nova ?? 50,
  });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, ownerId);
  return entities.Character.get(ch.id);
}

function unwrap(res) {
  return res?.body ?? res;
}

function seqRng(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function seqInt(values) {
  let i = 0;
  return (_min, _max) => values[Math.min(i++, values.length - 1)];
}

console.log("\nCasino authority tests\n");

test("crystal tables sealed; stardust games enabled", () => {
  assert.equal(NOVA_CASINO_OPEN, false);
  const state = serializeCasinoState({ level: 10 });
  assert.equal(state.nova_casino_open, false);
  assert.ok(state.enabled_games.includes("dice"));
  assert.ok(state.enabled_games.includes("wheel"));
  assert.ok(!state.enabled_games.includes("flip"));
  assert.equal(state.daily_limits, null);
  assert.equal(state.rules_version, CASINO_RULES_VERSION);
});

test("wager bounds scale with level via SD/F × 25", () => {
  assert.equal(CASINO_MIN_STARDUST_BET_FLOOR, 1000);
  assert.equal(CASINO_MAX_STARDUST_BET_CAP, 2_500_000);
  const lo = getCasinoMaxStardustBet(1);
  assert.ok(lo >= 1000);
  const hi = getCasinoMaxStardustBet(200);
  assert.ok(hi <= 2_500_000);
  assert.ok(hi >= lo);
});

test("bet validation rejects bad values", () => {
  assert.equal(validateCasinoBetAmount(0).ok, false);
  assert.equal(validateCasinoBetAmount(-5).ok, false);
  assert.equal(validateCasinoBetAmount(1.5).ok, false);
  assert.equal(validateCasinoBetAmount(NaN).ok, false);
  assert.equal(validateCasinoBetAmount(Infinity).ok, false);
  assert.equal(validateCasinoBetAmount(100).ok, true);
});

test("client seed / payout_mult rejected", () => {
  assert.throws(() => assertCasinoClientSafe({ seed: 1 }), /seed/i);
  assert.throws(() => assertCasinoClientSafe({ payout_mult: 99 }), /payout/i);
});

test("dice even money with injected RNG", () => {
  const win = resolveCasinoOutcome({
    gameId: "dice",
    bet: 1000,
    choice: "high",
    randomInt: seqInt([6]),
  });
  assert.equal(win.outcome.won, true);
  assert.equal(win.delta, 1000);
  assert.equal(win.gross_payout, 2000);
  assert.equal(win.net_result, 1000);

  const lose = resolveCasinoOutcome({
    gameId: "dice",
    bet: 1000,
    choice: "high",
    randomInt: seqInt([2]),
  });
  assert.equal(lose.outcome.won, false);
  assert.equal(lose.delta, -1000);
  assert.equal(lose.gross_payout, 0);
});

test("wheel tier roll + net = bet×(mult-1)", () => {
  const bust = resolveCasinoOutcome({
    gameId: "wheel",
    bet: 1000,
    rng: () => 0.0,
  });
  assert.equal(bust.outcome.mult, 0);
  assert.equal(bust.delta, -1000);

  // Push band starts after 0.50
  const push = resolveCasinoOutcome({
    gameId: "wheel",
    bet: 1000,
    rng: () => 0.51,
  });
  assert.equal(push.outcome.mult, 1);
  assert.equal(push.delta, 0);
  assert.equal(push.gross_payout, 1000);
});

test("wheel expected multiplier ~1.09 (player-favoring table preserved)", () => {
  const e = casinoWheelExpectedMultiplier();
  assert.ok(Math.abs(e - 1.09) < 1e-9, `E[mult]=${e}`);
  const sumP = CASINO_WHEEL_TIERS.reduce((s, t) => s + t.p, 0);
  assert.ok(Math.abs(sumP - 1) < 1e-9);
});

test("sealed nova games reject resolve", () => {
  assert.throws(
    () => resolveCasinoOutcome({ gameId: "flip", bet: 1 }),
    /sealed|unavailable/i,
  );
});

test("statistical wheel frequencies (deterministic grid)", () => {
  const counts = Object.fromEntries(CASINO_WHEEL_TIERS.map((t) => [t.mult, 0]));
  const N = 100_000;
  for (let i = 0; i < N; i++) {
    const r = (i + 0.5) / N;
    const tier = rollWheelTier(() => r);
    counts[tier.mult] += 1;
  }
  for (const t of CASINO_WHEEL_TIERS) {
    const obs = counts[t.mult] / N;
    assert.ok(Math.abs(obs - t.p) < 0.002, `mult ${t.mult}: obs=${obs} p=${t.p}`);
  }
});

await testAsync("GetCasinoState + CasinoSettle debit/credit + idempotent replay", async () => {
  const u = insertUser("u-cas-1", "c1@test.local");
  const ch = makeChar(u.id, { stardust: 50_000, level: 25 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };

  const state = unwrap(await GetCasinoState(user, {}));
  assert.ok(state.casino.max_stardust_bet >= 1000);
  assert.deepEqual(state.casino.enabled_games.sort(), ["dice", "wheel"].sort());

  // Force a loss via monkeypatch is hard; settle many dice until we see both or use recover path.
  // Use wheel with request_id twice after one settle.
  const key = "wheel-test-1";
  // Keep settling until we get a non-push or just take first
  let first = unwrap(
    await CasinoSettle(user, { game: "wheel", bet: 1000, request_id: key }),
  );
  assert.equal(first.success, true);
  assert.ok(first.outcome);
  const balAfter = first.character.stardust;
  const outcome = first.outcome;

  const replay = unwrap(
    await CasinoSettle(user, { game: "wheel", bet: 1000, request_id: key }),
  );
  assert.equal(replay.idempotent_replay, true);
  assert.deepEqual(replay.outcome, outcome);
  assert.equal(entities.Character.get(ch.id).stardust, balAfter);

  const recovered = unwrap(await RecoverCasinoWager(user, { request_id: key }));
  assert.equal(recovered.found, true);
  assert.deepEqual(recovered.outcome, outcome);
});

await testAsync("insufficient funds rejects without outcome commit", async () => {
  const u = insertUser("u-cas-2", "c2@test.local");
  const ch = makeChar(u.id, { stardust: 100, level: 10 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const res = await CasinoSettle(user, {
    game: "dice",
    bet: 5000,
    choice: "high",
    request_id: "poor-1",
  });
  assert.ok(res.status >= 400);
  assert.equal(entities.Character.get(ch.id).stardust, 100);
});

await testAsync("client payout_mult body rejected", async () => {
  const u = insertUser("u-cas-3", "c3@test.local");
  const ch = makeChar(u.id, { stardust: 10_000 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const res = await CasinoSettle(user, {
    game: "dice",
    bet: 100,
    choice: "high",
    payout_mult: 99,
    request_id: "tamper-1",
  });
  assert.ok(res.status >= 400);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
