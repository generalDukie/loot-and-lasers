/**
 * Wagerable vs Promotional Nova + half-crystal casino rules.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-nova-balances.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-nova-"));
process.env.DB_PATH = path.join(tmpDir, "test-nova.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  applyCharacterCreationStartingGrant,
  creditNova,
  debitNova,
  getBalances,
  NovaBalanceTypes,
  floorNovaPayout,
  STARTING_NOVA_DISPLAY,
} = await import("../src/shared/currencyService.js");
const { floorNovaCasinoPayout, validateNovaWager } = await import("../src/shared/casinoGames.js");
const { CasinoSessionStart } = await import("../src/functions/economyFollowOn.js");

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

function insertUser(id, email, role = "user") {
  const now = new Date().toISOString();
  const safeRole = role === "admin" ? "admin" : "user";
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, email, hashPw("x"), safeRole, now, now);
  return { id, email, role: safeRole, active_character_id: null };
}

function makeChar(user, opts = {}) {
  const ch = entities.Character.create({
    name: opts.name || `C-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: user.id,
    level: opts.level ?? 10,
    class: "Vanguard",
    race: "Human",
    stats: {},
    stardust: opts.stardust ?? 0,
    nova_crystals: opts.nova_half ?? 0,
    economy_nova_scale: 2,
  });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, user.id);
  user.active_character_id = ch.id;
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

console.log("\nNova dual-balance tests\n");

test("character creation → 500 promotional, 0 wagerable", () => {
  const user = insertUser("u-create", "create@t.l");
  let ch = makeChar(user, { nova_half: 0 });
  const grant = applyCharacterCreationStartingGrant(user, ch);
  const bal = getBalances(grant.character);
  assert.equal(bal.nova_crystals, STARTING_NOVA_DISPLAY);
  assert.equal(bal.nova_promotional, STARTING_NOVA_DISPLAY);
  assert.equal(bal.nova_wagerable, 0);
});

test("payout floors down to nearest 0.5", () => {
  assert.equal(floorNovaPayout(125.9, 1), 125.5);
  assert.equal(floorNovaToHalfLocal(125.5), 125.5);
  assert.equal(floorNovaCasinoPayout(100.5, 1.25), 125.5); // 125.625 → 125.5
  assert.equal(floorNovaCasinoPayout(100, 1.25), 125);
  assert.equal(floorNovaCasinoPayout(250, 0.5), 125);
  assert.equal(floorNovaCasinoPayout(1, 0.49), 0);
});

function floorNovaToHalfLocal(n) {
  return Math.floor(n * 2) / 2;
}

test("nova wager precision .5 ok, .25 rejected", () => {
  assert.equal(validateNovaWager(100.5, 1000).ok, true);
  assert.equal(validateNovaWager(100.25, 1000).ok, false);
  assert.equal(validateNovaWager(100.75, 1000).ok, false);
});

test("validateNovaWager allowAnyNova uses total balance messaging", () => {
  const denied = validateNovaWager(100, 50, { allowAnyNova: true });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "INSUFFICIENT_NOVA");
  assert.match(denied.reason, /Nova Crystals/i);
  assert.equal(validateNovaWager(100, 100, { allowAnyNova: true }).ok, true);
});

test("promotional cannot satisfy casino wager validation", () => {
  const check = validateNovaWager(100, 50); // wagerable 50, need 100
  assert.equal(check.ok, false);
  assert.match(check.reason, /Wagerable/i);
});

test("mixed: debit wagerable only for casino policy", () => {
  const user = insertUser("u-mix", "mix@t.l");
  let ch = makeChar(user, { nova_half: 0 });
  ch = creditNova({
    user,
    character: ch,
    amount: 500,
    category: "reward_grant",
    reasonCode: "promo",
    balanceType: NovaBalanceTypes.PROMOTIONAL,
    idempotencyKey: "mix-promo",
  }).character;
  ch = creditNova({
    user,
    character: ch,
    amount: 150,
    category: "nova_pack_grant",
    reasonCode: "nova_pack_grant",
    balanceType: NovaBalanceTypes.WAGERABLE,
    relatedEntityType: "character",
    relatedEntityId: ch.id,
    idempotencyKey: "mix-pack",
  }).character;
  let bal = getBalances(ch);
  assert.equal(bal.nova_promotional, 500);
  assert.equal(bal.nova_wagerable, 150);

  ch = debitNova({
    user,
    character: ch,
    amount: 100,
    category: "casino_wager",
    reasonCode: "casino_session_start",
    balanceType: NovaBalanceTypes.WAGERABLE,
    debitPolicy: NovaBalanceTypes.WAGERABLE,
    idempotencyKey: "mix-wager",
  }).character;
  bal = getBalances(ch);
  assert.equal(bal.nova_wagerable, 50);
  assert.equal(bal.nova_promotional, 500);

  assert.throws(() => {
    debitNova({
      user,
      character: ch,
      amount: 100,
      category: "casino_wager",
      reasonCode: "casino_session_start",
      balanceType: NovaBalanceTypes.WAGERABLE,
      debitPolicy: NovaBalanceTypes.WAGERABLE,
      idempotencyKey: "mix-wager-fail",
    });
  }, /Wagerable/i);
});

test("casino winnings credit wagerable", () => {
  const user = insertUser("u-win", "win@t.l");
  let ch = makeChar(user, { nova_half: 0 });
  ch = creditNova({
    user,
    character: ch,
    amount: 250,
    category: "casino_payout",
    reasonCode: "casino_cache_settle",
    balanceType: NovaBalanceTypes.WAGERABLE,
    idempotencyKey: "win-1",
  }).character;
  const bal = getBalances(ch);
  assert.equal(bal.nova_wagerable, 250);
  assert.equal(bal.nova_promotional, 0);
});

await testAsync("session start rejects promotional-only balance", async () => {
  const user = insertUser("u-sess", "sess@t.l");
  let ch = makeChar(user, { nova_half: 0 });
  ch = creditNova({
    user,
    character: ch,
    amount: 2000,
    category: "reward_grant",
    reasonCode: "promo",
    balanceType: NovaBalanceTypes.PROMOTIONAL,
    idempotencyKey: "sess-promo",
  }).character;
  try {
    unwrap(await CasinoSessionStart(user, {
      game: "smugglers_cache",
      bet: 100,
      request_id: "sess-fail-1",
    }));
    assert.fail("should reject");
  } catch (e) {
    assert.equal(e.status, 400);
    assert.match(e.message, /Wagerable/i);
  }
  const bal = getBalances(entities.Character.get(ch.id));
  assert.equal(bal.nova_promotional, 2000);
  assert.equal(bal.nova_wagerable, 0);
});

await testAsync("admin session start may spend promotional Nova", async () => {
  const user = insertUser("u-admin-sess", "admin-sess@t.l", "admin");
  let ch = makeChar(user, { nova_half: 0 });
  ch = creditNova({
    user,
    character: ch,
    amount: 2000,
    category: "reward_grant",
    reasonCode: "promo",
    balanceType: NovaBalanceTypes.PROMOTIONAL,
    idempotencyKey: "admin-sess-promo",
  }).character;
  const res = unwrap(await CasinoSessionStart(user, {
    game: "smugglers_cache",
    bet: 100,
    request_id: "admin-sess-ok-1",
  }));
  assert.equal(res.success, true);
  const bal = getBalances(entities.Character.get(ch.id));
  assert.equal(bal.nova_promotional, 1900);
  assert.equal(bal.nova_wagerable, 0);
  assert.equal(bal.nova_crystals, 1900);
});

await testAsync("session start succeeds with wagerable", async () => {
  const user = insertUser("u-sess2", "sess2@t.l");
  let ch = makeChar(user, { nova_half: 0 });
  ch = creditNova({
    user,
    character: ch,
    amount: 500,
    category: "nova_pack_grant",
    reasonCode: "nova_pack_grant",
    balanceType: NovaBalanceTypes.WAGERABLE,
    relatedEntityType: "character",
    relatedEntityId: ch.id,
    idempotencyKey: "sess2-pack",
  }).character;
  const res = unwrap(await CasinoSessionStart(user, {
    game: "smugglers_cache",
    bet: 100.5,
    request_id: "sess-ok-1",
  }));
  assert.equal(res.success, true);
  const bal = getBalances(entities.Character.get(ch.id));
  assert.equal(bal.nova_wagerable, 399.5);
});

test("ledger receipt includes balance_type", () => {
  const user = insertUser("u-led", "led@t.l");
  let ch = makeChar(user, { nova_half: 0 });
  const mut = creditNova({
    user,
    character: ch,
    amount: 10.5,
    category: "reward_grant",
    reasonCode: "promo",
    balanceType: NovaBalanceTypes.PROMOTIONAL,
    idempotencyKey: "led-1",
  });
  assert.equal(mut.transaction.balance_type, "promotional");
  assert.equal(mut.transaction.currency_type, "nova");
  assert.equal(mut.transaction.rounded_amount, 10.5);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
