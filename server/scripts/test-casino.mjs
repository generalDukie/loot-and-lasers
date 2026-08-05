/**
 * Casino v2 authority tests — four finalized games.
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
  getCasinoMaxStardustBet,
  getCasinoMinStardustBet,
  getMissionStardustPerFuel,
  NOVA_CASINO_OPEN,
} = await import("../src/shared/economyFormulas.js");
const {
  GAME_IDS,
  RETIRED_GAME_IDS,
  NOVA_MIN_WAGER,
  NOVA_MAX_WAGER,
  WHEEL_TIERS,
  REFINING_LADDER,
  REFINING_ATTEMPT_P,
  floorPayout,
  resolveGalacticDice,
  resolveStardustWheel,
  rollRefiningAttempt,
  buildSmugglersBoard,
  resolveSmugglersSelection,
  wheelSegmentLayout,
  stardustWagerLimits,
  validateStardustWager,
  validateNovaWager,
  CASINO_RULES_VERSION,
} = await import("../src/shared/casinoGames.js");
const {
  serializeCasinoState,
  assertCasinoClientSafe,
  normalizeCasinoGameId,
  listCasinoGames,
} = await import("../src/shared/casinoService.js");
const {
  CasinoSettle,
  GetCasinoState,
  RecoverCasinoWager,
  CasinoSessionStart,
  CasinoSessionAction,
} = await import("../src/functions/economyFollowOn.js");

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

function makeChar(user, opts = {}) {
  const ownerId = typeof user === "string" ? user : user.id;
  const ch = entities.Character.create({
    name: opts.name || `C-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: ownerId,
    level: opts.level ?? 20,
    class: "Vanguard",
    race: "Human",
    stats: {},
    stardust: opts.stardust ?? 500_000,
    nova_crystals: opts.nova ?? 2000,
  });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, ownerId);
  if (user && typeof user === "object") user.active_character_id = ch.id;
  return entities.Character.get(ch.id);
}

function unwrap(res) {
  const body = res?.body ?? res;
  if (res?.status && res.status >= 400) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body?.code;
    throw err;
  }
  return body;
}

function seqRng(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function seqInt(values) {
  let i = 0;
  return (_min, _max) => values[Math.min(i++, values.length - 1)];
}

console.log("\nCasino v2 authority tests\n");

// ── Shared registry / limits ─────────────────────────────────
test("four games enabled; retired IDs blocked", () => {
  assert.equal(NOVA_CASINO_OPEN, true);
  const state = serializeCasinoState({ level: 10, id: "x", stardust: 0, nova_crystals: 0 });
  assert.deepEqual(
    state.enabled_games.sort(),
    [
      GAME_IDS.CRYSTAL_REFINING,
      GAME_IDS.GALACTIC_DICE,
      GAME_IDS.SMUGGLERS_CACHE,
      GAME_IDS.STARDUST_WHEEL,
    ].sort(),
  );
  assert.equal(state.rules_version, CASINO_RULES_VERSION);
  for (const id of RETIRED_GAME_IDS) {
    assert.throws(() => normalizeCasinoGameId(id), /retired/i);
  }
});

test("stardust min 1× SD/F, max 50× SD/F", () => {
  for (const level of [1, 10, 50, 100]) {
    const sdf = Math.round(getMissionStardustPerFuel(level));
    assert.equal(getCasinoMinStardustBet(level), Math.max(1, sdf));
    assert.equal(getCasinoMaxStardustBet(level), Math.min(100_000_000, sdf * 50));
    const lim = stardustWagerLimits(sdf);
    assert.equal(lim.min, Math.max(1, sdf));
    assert.equal(lim.max, sdf * 50);
  }
});

test("nova wager 100–1000", () => {
  assert.equal(NOVA_MIN_WAGER, 100);
  assert.equal(NOVA_MAX_WAGER, 1000);
  assert.equal(validateNovaWager(99, 5000).ok, false);
  assert.equal(validateNovaWager(1001, 5000).ok, false);
  assert.equal(validateNovaWager(250, 5000).ok, true);
  assert.equal(validateNovaWager(250, 100).ok, false);
});

test("fractional / negative / unaffordable stardust rejected", () => {
  const sdf = 1000;
  assert.equal(validateStardustWager(1.5, sdf, 1e9).ok, false);
  assert.equal(validateStardustWager(-1, sdf, 1e9).ok, false);
  assert.equal(validateStardustWager(500, sdf, 100).ok, false);
  assert.equal(validateStardustWager(1000, sdf, 1e9).ok, true);
});

test("payout flooring + shove + 0×", () => {
  assert.equal(floorPayout(250, 1.25), 312);
  assert.equal(floorPayout(250, 0.5), 125);
  assert.equal(floorPayout(1000, 1), 1000);
  assert.equal(floorPayout(1000, 0), 0);
  const shove = resolveStardustWheel({ bet: 500, rng: () => 0.61 }); // shove band 0.60–0.80
  assert.equal(shove.tier_id, "shove");
  assert.equal(shove.gross_payout, 500);
  assert.equal(shove.net_result, 0);
});

test("client seed / payout_mult rejected", () => {
  assert.throws(() => assertCasinoClientSafe({ seed: 1 }), /seed/i);
  assert.throws(() => assertCasinoClientSafe({ payout_mult: 99 }), /payout/i);
});

test("wheel segments match probabilities (sum 1, visual sizes)", () => {
  const layout = wheelSegmentLayout();
  assert.equal(layout.length, 6);
  let sum = 0;
  for (let i = 0; i < WHEEL_TIERS.length; i++) {
    assert.equal(layout[i].p, WHEEL_TIERS[i].p);
    sum += layout[i].p;
    assert.ok(Math.abs(layout[i].end - layout[i].start - layout[i].p) < 1e-12);
  }
  assert.ok(Math.abs(sum - 1) < 1e-12);
  const rtp = WHEEL_TIERS.reduce((s, t) => s + t.p * t.mult, 0);
  assert.ok(Math.abs(rtp - 0.9) < 1e-12, `RTP=${rtp}`);
});

// ── Galactic Dice ────────────────────────────────────────────
test("galactic dice Low/Seven/High payouts", () => {
  const low = resolveGalacticDice({ bet: 1000, choice: "low", randomInt: seqInt([2, 3]) }); // 5
  assert.equal(low.won, true);
  assert.equal(low.gross_payout, 2000);
  const seven = resolveGalacticDice({ bet: 1000, choice: "seven", randomInt: seqInt([3, 4]) });
  assert.equal(seven.won, true);
  assert.equal(seven.gross_payout, 5000);
  const high = resolveGalacticDice({ bet: 1000, choice: "high", randomInt: seqInt([6, 6]) });
  assert.equal(high.won, true);
  assert.equal(high.gross_payout, 2000);
  // Natural seven without selecting Seven does not pay 5×
  const nat = resolveGalacticDice({ bet: 1000, choice: "low", randomInt: seqInt([1, 6]) });
  assert.equal(nat.natural_seven, true);
  assert.equal(nat.won, false);
  assert.equal(nat.gross_payout, 0);
  const doubles = resolveGalacticDice({ bet: 100, choice: "high", randomInt: seqInt([5, 5]) });
  assert.equal(doubles.doubles, true);
});

// ── Crystal Refining ladder examples ─────────────────────────
test("refining payout ladder floors", () => {
  const cases = [
    [100, [125, 300, 800, 2000, 5000]],
    [250, [312, 750, 2000, 5000, 12500]],
    [500, [625, 1500, 4000, 10000, 25000]],
    [750, [937, 2250, 6000, 15000, 37500]],
    [1000, [1250, 3000, 8000, 20000, 50000]],
  ];
  for (const [wager, expected] of cases) {
    for (let i = 0; i < 5; i++) {
      assert.equal(floorPayout(wager, REFINING_LADDER[i].mult), expected[i]);
    }
  }
  assert.deepEqual(
    [...REFINING_ATTEMPT_P],
    [0.4, 0.4, 0.40625, 0.3846153846, 0.4],
  );
  assert.equal(rollRefiningAttempt(0, () => 0.39), true);
  assert.equal(rollRefiningAttempt(0, () => 0.41), false);
});

// ── Smuggler's Cache ─────────────────────────────────────────
test("smugglers board composition + payouts", () => {
  const board = buildSmugglersBoard(() => 0.1);
  assert.equal(board.length, 6);
  const counts = {};
  for (const c of board) counts[c.cargo_id] = (counts[c.cargo_id] || 0) + 1;
  assert.equal(counts.worthless_scrap, 4);
  assert.equal(counts.damaged_shipment, 1);
  assert.equal(counts.alluring_contraband, 1);

  const scrap = resolveSmugglersSelection({
    bet: 100,
    board: board.map((b, i) => ({ ...b, cargo_id: "worthless_scrap", mult: 0, index: i })),
    index: 0,
  });
  assert.equal(scrap.gross_payout, 0);

  const damagedBoard = Array.from({ length: 6 }, (_, i) => ({
    index: i,
    cargo_id: i === 2 ? "damaged_shipment" : "worthless_scrap",
    label: i === 2 ? "Damaged Shipment" : "Worthless Scrap",
    mult: i === 2 ? 0.5 : 0,
  }));
  assert.equal(resolveSmugglersSelection({ bet: 250, board: damagedBoard, index: 2 }).gross_payout, 125);

  const jackBoard = Array.from({ length: 6 }, (_, i) => ({
    index: i,
    cargo_id: i === 1 ? "alluring_contraband" : "worthless_scrap",
    label: i === 1 ? "Alluring Contraband" : "Worthless Scrap",
    mult: i === 1 ? 2.5 : 0,
  }));
  assert.equal(resolveSmugglersSelection({ bet: 1000, board: jackBoard, index: 1 }).gross_payout, 2500);
});

// ── Integration: settle + sessions ───────────────────────────
await testAsync("CasinoSettle galactic_dice + idempotent retry", async () => {
  const user = insertUser("u-dice-1", "dice1@test.local");
  makeChar(user, { level: 20, stardust: 200_000, nova: 500 });
  const key = "dice-test-1";
  // Monkey-patch is hard; settle with real RNG then recover same key
  const r1 = unwrap(await CasinoSettle(user, {
    game: "galactic_dice",
    bet: getCasinoMinStardustBet(20),
    choice: "seven",
    request_id: key,
  }));
  assert.equal(r1.success, true);
  assert.ok(Array.isArray(r1.dice) && r1.dice.length === 2);
  assert.equal(r1.currency, "stardust");
  const bal1 = r1.balances.stardust;
  const r2 = unwrap(await CasinoSettle(user, {
    game: "galactic_dice",
    bet: getCasinoMinStardustBet(20),
    choice: "seven",
    request_id: key,
  }));
  assert.equal(r2.idempotent_replay, true);
  assert.deepEqual(r2.dice, r1.dice);
  assert.equal(r2.balances.stardust, bal1);
  const rec = unwrap(await RecoverCasinoWager(user, { request_id: key }));
  assert.equal(rec.found, true);
  assert.deepEqual(rec.dice, r1.dice);
});

await testAsync("retired game routes return 410", async () => {
  const user = insertUser("u-old-1", "old1@test.local");
  makeChar(user, { stardust: 50_000 });
  try {
    unwrap(await CasinoSettle(user, { game: "dice", bet: 1000, choice: "low", request_id: "old-1" }));
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e.status, 410);
  }
});

await testAsync("CasinoSettle stardust_wheel live settle ok", async () => {
  const user = insertUser("u-wheel-1", "wheel1@test.local");
  makeChar(user, { level: 20, stardust: 300_000 });
  const bet = getCasinoMinStardustBet(20);
  const r = unwrap(await CasinoSettle(user, {
    game: "stardust_wheel",
    bet,
    request_id: "wheel-live-1",
  }));
  assert.equal(r.success, true);
  assert.ok(r.segment);
  assert.ok(["lose", "shove", "x2", "x3", "x5", "x10"].includes(r.tier_id));
  assert.equal(r.gross_payout, floorPayout(bet, r.payout_mult));
});

await testAsync("crystal refining: deduct once, shatter/collect/idempotent", async () => {
  const user = insertUser("u-ref-1", "ref1@test.local");
  const { creditNova, NovaBalanceTypes, getBalances } = await import("../src/shared/currencyService.js");
  let ch0 = makeChar(user, { nova: 0 });
  ch0 = creditNova({
    user,
    character: ch0,
    amount: 5000,
    category: "nova_pack_grant",
    reasonCode: "nova_pack_grant",
    balanceType: NovaBalanceTypes.WAGERABLE,
    relatedEntityType: "character",
    relatedEntityId: ch0.id,
    idempotencyKey: "ref1-pack",
  }).character;
  const before = getBalances(ch0).nova_wagerable;
  // Keep starting until we get an active stage-1 session (or shatter)
  let start;
  let key = "ref-start-1";
  start = unwrap(await CasinoSessionStart(user, {
    game: "crystal_refining",
    bet: 100,
    request_id: key,
  }));
  assert.equal(start.success, true);
  assert.equal(getBalances(entities.Character.get(ch0.id)).nova_wagerable, before - 100);

  const replay = unwrap(await CasinoSessionStart(user, {
    game: "crystal_refining",
    bet: 100,
    request_id: key,
  }));
  assert.equal(replay.idempotent_replay, true);
  assert.equal(getBalances(entities.Character.get(ch0.id)).nova_wagerable, before - 100);

  if (start.event === "crystal_shattered") {
    assert.equal(start.gross_payout, 0);
    return;
  }
  assert.equal(start.session.stage, 1);
  assert.equal(start.session.can_collect, true);

  const collectKey = "ref-collect-1";
  const col = unwrap(await CasinoSessionAction(user, {
    session_id: start.session_id,
    action: "collect",
    request_id: collectKey,
  }));
  assert.equal(col.event, "payout_collected");
  assert.equal(col.gross_payout, 125);
  const afterCol = getBalances(entities.Character.get(ch0.id)).nova_wagerable;
  assert.equal(afterCol, before - 100 + 125);

  const col2 = unwrap(await CasinoSessionAction(user, {
    session_id: start.session_id,
    action: "collect",
    request_id: collectKey,
  }));
  assert.equal(col2.idempotent_replay, true);
  assert.equal(getBalances(entities.Character.get(ch0.id)).nova_wagerable, afterCol);
});

await testAsync("smugglers cache: board before select, reconnect, no double pay", async () => {
  const user = insertUser("u-cache-1", "cache1@test.local");
  const { creditNova, NovaBalanceTypes, getBalances } = await import("../src/shared/currencyService.js");
  let ch0 = makeChar(user, { nova: 0 });
  ch0 = creditNova({
    user,
    character: ch0,
    amount: 5000,
    category: "nova_pack_grant",
    reasonCode: "nova_pack_grant",
    balanceType: NovaBalanceTypes.WAGERABLE,
    relatedEntityType: "character",
    relatedEntityId: ch0.id,
    idempotencyKey: "cache1-pack",
  }).character;
  const before = getBalances(ch0).nova_wagerable;
  const start = unwrap(await CasinoSessionStart(user, {
    game: "smugglers_cache",
    bet: 100,
    request_id: "cache-start-1",
  }));
  assert.equal(start.crate_count, 6);
  assert.equal(start.session.sealed, true);
  assert.equal(start.session.board, null);
  assert.equal(getBalances(entities.Character.get(ch0.id)).nova_wagerable, before - 100);

  const state = unwrap(await GetCasinoState(user, {}));
  assert.ok(state.casino.active_sessions.some((s) => s.game_id === "smugglers_cache"));

  const pick = unwrap(await CasinoSessionAction(user, {
    session_id: start.session_id,
    action: "select",
    crate_index: 0,
    request_id: "cache-pick-1",
  }));
  assert.equal(pick.event, "crate_opened");
  assert.ok(Array.isArray(pick.board) && pick.board.length === 6);
  assert.equal(pick.selected_index, 0);
  const after = getBalances(entities.Character.get(ch0.id)).nova_wagerable;
  assert.equal(after, before - 100 + pick.gross_payout);

  const pick2 = unwrap(await CasinoSessionAction(user, {
    session_id: start.session_id,
    action: "select",
    crate_index: 0,
    request_id: "cache-pick-1",
  }));
  assert.equal(pick2.idempotent_replay, true);
  assert.equal(getBalances(entities.Character.get(ch0.id)).nova_wagerable, after);
});

await testAsync("GetCasinoState lists games + limits", async () => {
  const user = insertUser("u-state-1", "state1@test.local");
  makeChar(user, { level: 15, stardust: 10_000, nova: 800 });
  const res = unwrap(await GetCasinoState(user, {}));
  assert.equal(res.casino.games.length, 4);
  assert.equal(res.casino.nova_limits.min, 100);
  assert.equal(res.casino.nova_limits.max, 1000);
  assert.equal(res.casino.stardust_limits.min, getCasinoMinStardustBet(15));
  assert.equal(res.casino.stardust_limits.max, getCasinoMaxStardustBet(15));
});

// ── Statistical simulations ──────────────────────────────────
test("sim galactic dice selection frequencies", () => {
  const N = 36_000;
  let low = 0;
  let seven = 0;
  let high = 0;
  for (let i = 0; i < N; i++) {
    const r = resolveGalacticDice({
      bet: 100,
      choice: "seven",
      randomInt: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    });
    if (r.total <= 6) low += 1;
    else if (r.total === 7) seven += 1;
    else high += 1;
  }
  assert.ok(Math.abs(low / N - 15 / 36) < 0.02, `low=${low / N}`);
  assert.ok(Math.abs(seven / N - 6 / 36) < 0.02, `seven=${seven / N}`);
  assert.ok(Math.abs(high / N - 15 / 36) < 0.02, `high=${high / N}`);
});

test("sim wheel segment frequencies + RTP ~90%", () => {
  const N = 100_000;
  const counts = Object.fromEntries(WHEEL_TIERS.map((t) => [t.id, 0]));
  let paid = 0;
  const bet = 100;
  for (let i = 0; i < N; i++) {
    const r = resolveStardustWheel({ bet, rng: Math.random });
    counts[r.tier_id] += 1;
    paid += r.gross_payout;
  }
  for (const t of WHEEL_TIERS) {
    const f = counts[t.id] / N;
    assert.ok(Math.abs(f - t.p) < 0.015, `${t.id} f=${f} p=${t.p}`);
  }
  const rtp = paid / (N * bet);
  assert.ok(Math.abs(rtp - 0.9) < 0.02, `rtp=${rtp}`);
});

test("sim refining cumulative stage reach", () => {
  const N = 80_000;
  const reach = [0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) {
    let stage = 0;
    for (let a = 0; a < 5; a++) {
      if (!rollRefiningAttempt(a, Math.random)) break;
      stage = a + 1;
      reach[a] += 1;
    }
  }
  const expected = [0.4, 0.16, 0.065, 0.025, 0.01];
  for (let i = 0; i < 5; i++) {
    const f = reach[i] / N;
    assert.ok(Math.abs(f - expected[i]) < 0.012, `stage${i + 1} f=${f}`);
  }
});

test("sim smugglers cargo frequencies + RTP ~50%", () => {
  const N = 60_000;
  const counts = { worthless_scrap: 0, damaged_shipment: 0, alluring_contraband: 0 };
  let paid = 0;
  const bet = 100;
  for (let i = 0; i < N; i++) {
    const board = buildSmugglersBoard(Math.random);
    const idx = Math.floor(Math.random() * 6);
    const r = resolveSmugglersSelection({ bet, board, index: idx });
    counts[r.cargo_id] += 1;
    paid += r.gross_payout;
  }
  assert.ok(Math.abs(counts.worthless_scrap / N - 4 / 6) < 0.02);
  assert.ok(Math.abs(counts.damaged_shipment / N - 1 / 6) < 0.02);
  assert.ok(Math.abs(counts.alluring_contraband / N - 1 / 6) < 0.02);
  const rtp = paid / (N * bet);
  assert.ok(Math.abs(rtp - 0.5) < 0.025, `rtp=${rtp}`);
});

test("listCasinoGames presentation complete", () => {
  const games = listCasinoGames({ level: 5 });
  assert.equal(games.length, 4);
  assert.ok(games.find((g) => g.id === GAME_IDS.GALACTIC_DICE).choices.length === 3);
  assert.ok(games.find((g) => g.id === GAME_IDS.STARDUST_WHEEL).segments.length === 6);
  assert.ok(games.find((g) => g.id === GAME_IDS.CRYSTAL_REFINING).ladder.length === 5);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
