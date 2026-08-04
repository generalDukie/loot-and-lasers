/**
 * Arena authority tests (Restoration 16).
 * Run: npm run test:arena-authority
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-arena-auth-"));
process.env.DB_PATH = path.join(tmpDir, "test-arena-auth.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const { clock } = await import("../src/shared/time/clock.js");
const {
  ARENA_BATTLE_COOLDOWN_MS,
  isArenaCooldownActive,
  serializeArenaState,
  generateAndStoreArenaOffers,
  assertArenaClientSafe,
} = await import("../src/shared/arenaService.js");
const {
  PrepareArenaCombat,
  FinishArenaBattle,
  GetArenaStatus,
  GetArenaOpponents,
  RecoverArenaMatch,
  SkipArenaCooldown,
} = await import("../src/functions/economyFollowOn.js");
const {
  ARENA_WIN_FUEL_EQUIVALENT,
  ARENA_REWARDED_WINS_PER_DAY,
  computeArenaRewards,
  ArenaWinStardust,
  getArenaRewardedWinsState,
} = await import("../src/shared/economyFormulas.js");
const { ARENA_PAID_BATTLE_COST } = await import("../src/shared/economyFormulas.js");

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
    name: opts.name || `Op-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: ownerId,
    arena_rating: opts.rating ?? 1000,
    arena_wins: opts.wins ?? 0,
    arena_losses: 0,
    arena_streak: 0,
    arena_battles: opts.battles ?? 0,
    arena_attempts_left: opts.attempts ?? 10,
    arena_attempts_date: opts.attemptsDate,
    arena_rewarded_wins_today: opts.rewardedWins ?? 0,
    arena_rewarded_wins_date: opts.rewardedDate,
    arena_cooldown_at: opts.cooldownAt || null,
    level: opts.level ?? 20,
    class: opts.className || "Vanguard",
    race: "Human",
    stats: opts.stats || { strength: 40, agility: 20, intellect: 10, vitality: 30, luck: 15 },
    stardust: opts.stardust ?? 1000,
    nova_crystals: opts.nova ?? 100,
    experience: 0,
    fuel: 10,
  });
  const user = entities.User?.get?.(ownerId);
  void user;
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, ownerId);
  return { ...ch, ...entities.Character.get(ch.id) };
}

function unwrap(res) {
  if (res?.status && res?.body) return res.body;
  return res;
}

console.log("\nArena authority tests\n");

test("cooldown is 10 minutes", () => {
  assert.equal(ARENA_BATTLE_COOLDOWN_MS, 10 * 60 * 1000);
});

test("Arena Stardust multiplier is 2.25 (not 1.5)", () => {
  assert.equal(ARENA_WIN_FUEL_EQUIVALENT, 2.25);
  assert.equal(ARENA_REWARDED_WINS_PER_DAY, 10);
  assert.equal(ARENA_PAID_BATTLE_COST, 15);
  const sd = ArenaWinStardust(50);
  assert.ok(sd > 0);
});

test("rewarded wins gate: 10th grants, 11th zero", () => {
  const player = { level: 20, arena_rating: 1000 };
  const opp = { arena_rating: 1000 };
  const r10 = computeArenaRewards(player, opp, true, { free: true, rewardedWinsToday: 9 });
  assert.equal(r10.stardust_rewarded, true);
  assert.ok(r10.stardust > 0);
  const r11 = computeArenaRewards(player, opp, true, { free: true, rewardedWinsToday: 10 });
  assert.equal(r11.stardust_rewarded, false);
  assert.equal(r11.stardust, 0);
  const loss = computeArenaRewards(player, opp, false, { free: true, rewardedWinsToday: 0 });
  assert.equal(loss.stardust, 0);
});

test("client RNG seed hard-rejected", () => {
  assert.throws(() => assertArenaClientSafe({ seed: 123 }), /seed/i);
  const body = { won: true, arena_rating_delta: 99, offer_id: "x" };
  assertArenaClientSafe(body);
  assert.equal(body.won, undefined);
  assert.equal(body.offer_id, "x");
});

test("cooldown active uses server timestamps", () => {
  const now = clock.nowMs();
  const ch = { arena_cooldown_at: new Date(now - 60_000).toISOString() };
  assert.equal(isArenaCooldownActive(ch, now), true);
  const done = { arena_cooldown_at: new Date(now - ARENA_BATTLE_COOLDOWN_MS - 1000).toISOString() };
  assert.equal(isArenaCooldownActive(done, now), false);
});

await testAsync("offers prefer bots when alone; stable offer_id", async () => {
  const u = insertUser("u-arena-1", "a1@test.local");
  const ch = makeChar(u.id, { name: "Solo", level: 25, rating: 1100 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const gen = generateAndStoreArenaOffers(ch, { force: true });
  assert.ok(gen.offers.length >= 1);
  assert.ok(gen.offers.every((o) => o.offer_id));
  const again = generateAndStoreArenaOffers(entities.Character.get(ch.id), { force: false });
  assert.equal(again.replay, true);
  assert.equal(again.offers[0].offer_id, gen.offers[0].offer_id);
  void user;
});

await testAsync("Prepare + Finish settles once; ignores client won; cooldown applies", async () => {
  const u = insertUser("u-arena-2", "a2@test.local");
  const ch = makeChar(u.id, {
    name: "Fighter",
    level: 30,
    rating: 1000,
    nova: 100,
    attempts: 10,
    stardust: 5000,
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };

  const offersRes = unwrap(await GetArenaOpponents(user, { force: true }));
  assert.ok(offersRes.opponents?.length);
  const offerId = offersRes.opponents[0].offer_id;

  const prep = unwrap(await PrepareArenaCombat(user, { offer_id: offerId, is_free: true }));
  assert.ok(prep.combat?.combat_id);
  assert.ok(prep.combat?.winner === "player" || prep.combat?.winner === "opponent");
  const combatId = prep.combat.combat_id;
  const serverWinner = prep.combat.winner;

  const finish = unwrap(
    await FinishArenaBattle(user, {
      combat_id: combatId,
      offer_id: offerId,
      won: serverWinner !== "player", // tamper — must be ignored
    }),
  );
  assert.equal(finish.winner, serverWinner);
  assert.ok(finish.character.arena_cooldown_at);
  assert.equal(isArenaCooldownActive(finish.character), true);

  const ratingDelta = finish.rewards.arena_rating_delta;
  const ratingAfter = finish.character.arena_rating;

  const replay = unwrap(
    await FinishArenaBattle(user, { combat_id: combatId, offer_id: offerId }),
  );
  assert.equal(replay.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).arena_rating, ratingAfter);

  const recover = unwrap(await RecoverArenaMatch(user, { combat_id: combatId }));
  assert.ok(recover.recovered || recover.rewards || recover.combat_id === combatId);
  void ratingDelta;
});

await testAsync("cannot prepare while cooldown active without skip", async () => {
  const u = insertUser("u-arena-3", "a3@test.local");
  const ch = makeChar(u.id, {
    name: "Cool",
    cooldownAt: new Date().toISOString(),
    nova: 50,
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const offersRes = unwrap(await GetArenaOpponents(user, { force: true }));
  const offerId = offersRes.opponents[0].offer_id;
  let status = 200;
  try {
    const r = await PrepareArenaCombat(user, { offer_id: offerId });
    status = r.status || 200;
    if (r.body && !r.body.success && r.status) status = r.status;
  } catch (e) {
    status = e.status || 500;
  }
  // wrap returns status on httpErr
  const r2 = await PrepareArenaCombat(user, { offer_id: offerId });
  assert.ok(r2.status === 429 || r2.status === 400 || (r2.body && r2.status >= 400));
  void ch;
});

await testAsync("GetArenaStatus exposes rewarded win progress", async () => {
  const u = insertUser("u-arena-4", "a4@test.local");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const ch = makeChar(u.id, {
    name: "Status",
    rewardedWins: 7,
    rewardedDate: today,
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const status = unwrap(await GetArenaStatus(user, {}));
  assert.equal(status.arena.rewarded_wins_today, 7);
  assert.equal(status.arena.rewarded_wins_remaining, 3);
  assert.equal(status.arena.paid_battle_cost, 15);
  assert.equal(status.arena.cooldown_ms, ARENA_BATTLE_COOLDOWN_MS);
});

await testAsync("self-match prevented via offer ownership", async () => {
  const u1 = insertUser("u-arena-5a", "a5a@test.local");
  const u2 = insertUser("u-arena-5b", "a5b@test.local");
  const ch1 = makeChar(u1.id, { name: "A", level: 20, rating: 1050 });
  makeChar(u2.id, { name: "B", level: 20, rating: 1040 });
  const user = { id: u1.id, active_character_id: ch1.id, role: "user" };
  const offers = generateAndStoreArenaOffers(entities.Character.get(ch1.id), { force: true });
  for (const o of offers.offers) {
    assert.notEqual(o.realCharacterId, ch1.id);
  }
  void user;
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
