/**
 * Phase 8 Arena / PvP production tests.
 * Run: npm run test:phase8-arena
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-phase8-arena-"));
process.env.DB_PATH = path.join(tmpDir, "phase8-arena.db");
process.env.ARENA_CHALLENGE_COOLDOWN_MS = "0";
process.env.ARENA_CHALLENGE_MAX_PER_HOUR = "100";

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const { clock, installFakeClock, resetClockState } = await import("../src/shared/time/clock.js");
const {
  PrepareArenaCombat,
  FinishArenaBattle,
  GetArenaStatus,
  GetArenaOpponents,
  RecoverArenaMatch,
  SkipArenaCooldown,
} = await import("../src/functions/economyFollowOn.js");
const {
  ARENA_SKIP_COST,
  ARENA_REWARDED_WINS_PER_DAY,
  computeArenaRewards,
  applyArenaRewardGrant,
  getArenaXpReward,
  getArenaStardustReward,
  productionGameDayId,
} = await import("../src/shared/economyFormulas.js");
const { arenaXpReward, arenaStardustReward, ARENA_COOLDOWN_SKIP_NOVA, xpToNext } = await import(
  "../../src/lib/productionMath/index.js"
);
const { commitArenaPendingCombat, readArenaPendingCombat } = await import(
  "../src/shared/combatService.js"
);
const { createDirectChallenge } = await import("../src/arena/service.js");
const { sanitizePublicResponseBody } = await import("../../src/lib/gearPricingQuality.js");
const { isArenaCooldownActive, ARENA_BATTLE_COOLDOWN_MS } = await import(
  "../src/shared/arenaService.js"
);
const { toNovaHalfUnits } = await import("../src/shared/currencyService.js");
const { getCollectionPercentage, applyXpBonus } = await import("../src/shared/collectionBonus.js");

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
    arena_rewarded_wins_today: opts.rewardedWins ?? 0,
    arena_rewarded_wins_date: opts.rewardedDate,
    arena_cooldown_at: opts.cooldownAt || null,
    level: opts.level ?? 20,
    class: opts.className || "Vanguard",
    race: "Human",
    stats: opts.stats || { strength: 40, agility: 20, intellect: 10, vitality: 30, luck: 15 },
    stardust: opts.stardust ?? 0,
    nova_crystals: toNovaHalfUnits(opts.nova ?? 100),
    experience: opts.experience ?? 0,
    fuel: 10,
  });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, ownerId);
  if (opts.cooldownAt) {
    entities.Character.update(ch.id, { arena_cooldown_at: opts.cooldownAt });
  }
  return { ...ch, ...entities.Character.get(ch.id) };
}

function unwrap(res) {
  if (res?.status && res.status >= 400) {
    const err = new Error(res.body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = res.body?.code;
    err.body = res.body;
    throw err;
  }
  if (res?.status && res?.body) return res.body;
  return res;
}

function commitOutcome(characterId, winner, meta = {}) {
  const combatId = `p8-${characterId}-${winner}-${Math.random().toString(36).slice(2, 8)}`;
  commitArenaPendingCombat(characterId, {
    combat_id: combatId,
    winner,
    events: [{ type: "resolved" }],
    mode: "arena",
  }, {
    offerId: meta.offerId || `offer-${combatId}`,
    challengeId: meta.challengeId || "",
    opponentRating: meta.opponentRating ?? 1000,
    skipCooldown: !!meta.skipCooldown,
    opponentSummary: meta.opponentSummary || { name: "Rival" },
  });
  return combatId;
}

console.log("\nPhase 8 Arena / PvP\n");

test("skip cost is 10 Nova; paid battle entitlement is gone", () => {
  assert.equal(ARENA_COOLDOWN_SKIP_NOVA, 10);
  assert.equal(ARENA_SKIP_COST, 10);
  assert.equal(ARENA_REWARDED_WINS_PER_DAY, 10);
});

test("canonical XP and Stardust wrappers match productionMath", () => {
  for (const L of [1, 10, 50, 100, 800, 2000]) {
    assert.equal(getArenaXpReward(L), arenaXpReward(L));
    assert.equal(getArenaStardustReward(L), arenaStardustReward(L));
  }
});

test("win 11 grants zero XP/SD in preview; win 10 still grants", () => {
  const player = { level: 40, arena_rating: 1000 };
  const opp = { arena_rating: 1000 };
  const tenth = computeArenaRewards(player, opp, true, { rewardedWinsToday: 9 });
  assert.equal(tenth.experience, arenaXpReward(40));
  assert.equal(tenth.stardust, arenaStardustReward(40));
  const eleventh = computeArenaRewards(player, opp, true, { rewardedWinsToday: 10 });
  assert.equal(eleventh.experience, 0);
  assert.equal(eleventh.stardust, 0);
  assert.ok(eleventh.arena_rating_delta !== 0 || eleventh.arena_rating_delta === 0);
  const loss = computeArenaRewards(player, opp, false, { rewardedWinsToday: 3 });
  assert.equal(loss.experience, 0);
  assert.equal(loss.stardust, 0);
});

test("direct-challenge reward reduction stays outside canonical formulas", () => {
  const day = "2026-09-01";
  const base = {
    level: 20,
    experience: 0,
    arena_rewarded_wins_today: 0,
    arena_rewarded_wins_date: day,
    stardust: 0,
  };
  const full = applyArenaRewardGrant({ ...base }, { won: true, collectPct: 0, gameDay: day });
  const reduced = applyArenaRewardGrant({ ...base }, {
    won: true,
    collectPct: 0,
    xpMultiplier: 0.25,
    stardustMultiplier: 0.25,
    gameDay: day,
  });
  assert.equal(full.experience, arenaXpReward(20));
  assert.equal(full.stardust, arenaStardustReward(full.postXpLevel));
  assert.equal(reduced.experience, Math.round(arenaXpReward(20) * 0.25));
  assert.equal(reduced.stardust, Math.round(arenaStardustReward(reduced.postXpLevel) * 0.25));
  assert.ok(reduced.experience < full.experience);
});

test("Stardust uses post-XP level after a level-up", () => {
  const need = xpToNext(8);
  const ch = {
    level: 8,
    experience: need - 2,
    arena_rewarded_wins_today: 0,
    arena_rewarded_wins_date: "2026-09-01",
    stardust: 0,
  };
  const grant = applyArenaRewardGrant(ch, {
    won: true,
    collectPct: 0,
    gameDay: "2026-09-01",
  });
  assert.equal(grant.experience, arenaXpReward(8));
  assert.ok(grant.postXpLevel >= 9);
  assert.equal(grant.stardust, arenaStardustReward(grant.postXpLevel));
  assert.notEqual(grant.stardust, arenaStardustReward(8));
});

test("production game day flips at 19:00 UTC, not Eastern midnight", () => {
  const before = Date.UTC(2026, 8, 2, 18, 59, 0);
  const atReset = Date.UTC(2026, 8, 2, 19, 0, 0);
  const after = Date.UTC(2026, 8, 2, 19, 0, 1);
  const etMidnightEdt = Date.UTC(2026, 8, 2, 4, 0, 0);
  assert.equal(productionGameDayId(before), "2026-09-01");
  assert.equal(productionGameDayId(atReset), "2026-09-02");
  assert.equal(productionGameDayId(after), "2026-09-02");
  assert.equal(productionGameDayId(etMidnightEdt), "2026-09-01");
});

test("DST spring-forward does not move the 19:00 UTC boundary", () => {
  const before = Date.UTC(2026, 2, 8, 18, 59, 0);
  const atReset = Date.UTC(2026, 2, 8, 19, 0, 0);
  assert.equal(productionGameDayId(before), "2026-03-07");
  assert.equal(productionGameDayId(atReset), "2026-03-08");
});

await testAsync("ladder Finish uses committed winner and ignores body.won", async () => {
  const u = insertUser("p8-auth-1", "p8-auth-1@test.local");
  const ch = makeChar(u.id, { name: "Auth", nova: 50, stardust: 0 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const combatId = commitOutcome(ch.id, "opponent");
  const finish = unwrap(await FinishArenaBattle(user, {
    combat_id: combatId,
    won: true,
    experience: 99999,
    stardust: 99999,
    arena_rating_delta: 99,
  }));
  assert.equal(finish.winner, "opponent");
  assert.equal(finish.won, false);
  assert.equal(finish.rewards.experience, 0);
  assert.equal(finish.rewards.stardust, 0);
  assert.equal(isArenaCooldownActive(finish.character), true);
});

await testAsync("wins 1-10 grant, 11th is rating only, losses do not consume", async () => {
  const u = insertUser("p8-cap-1", "p8-cap-1@test.local");
  const day = productionGameDayId();
  const ch = makeChar(u.id, {
    name: "Cap",
    level: 20,
    nova: 200,
    stardust: 0,
    rewardedWins: 0,
    rewardedDate: day,
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  let live = entities.Character.get(ch.id);
  for (let i = 0; i < 10; i++) {
    live = entities.Character.update(ch.id, {
      arena_cooldown_at: null,
      level: 20,
      experience: 0,
    });
    const collectPct = getCollectionPercentage(live, 0);
    const expectedXp = Math.round(applyXpBonus(arenaXpReward(20), collectPct));
    const combatId = commitOutcome(ch.id, "player");
    const finish = unwrap(await FinishArenaBattle(user, { combat_id: combatId }));
    assert.equal(finish.rewards.experience, expectedXp);
    assert.equal(finish.rewards.stardust, arenaStardustReward(finish.rewards.post_xp_level));
    assert.equal(finish.character.arena_rewarded_wins_today, i + 1);
  }
  live = entities.Character.update(ch.id, { arena_cooldown_at: null, level: 20 });
  const lossId = commitOutcome(ch.id, "opponent");
  const loss = unwrap(await FinishArenaBattle(user, { combat_id: lossId }));
  assert.equal(loss.rewards.experience, 0);
  assert.equal(loss.rewards.stardust, 0);
  assert.equal(loss.character.arena_rewarded_wins_today, 10);

  live = entities.Character.update(ch.id, { arena_cooldown_at: null, level: 20 });
  const eleventhId = commitOutcome(ch.id, "player");
  const eleventh = unwrap(await FinishArenaBattle(user, { combat_id: eleventhId }));
  assert.equal(eleventh.rewards.experience, 0);
  assert.equal(eleventh.rewards.stardust, 0);
  assert.equal(eleventh.character.arena_rewarded_wins_today, 10);
  assert.ok(Number.isFinite(eleventh.rewards.arena_rating_delta));
  assert.equal(isArenaCooldownActive(eleventh.character), true);
  void live;
});

await testAsync("19:00 UTC resets the rewarded-win counter", async () => {
  resetClockState();
  const fake = installFakeClock(Date.UTC(2026, 8, 2, 18, 59, 0));
  const u = insertUser("p8-day-1", "p8-day-1@test.local");
  const ch = makeChar(u.id, {
    name: "Day",
    rewardedWins: 10,
    rewardedDate: productionGameDayId(fake.nowMs()),
    nova: 50,
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const before = unwrap(await GetArenaStatus(user, {}));
  assert.equal(before.arena.rewarded_wins_today, 10);
  assert.equal(before.arena.rating_only, true);
  fake.freeze(Date.UTC(2026, 8, 2, 19, 0, 0));
  const after = unwrap(await GetArenaStatus(user, {}));
  assert.equal(after.arena.rewarded_wins_today, 0);
  assert.equal(after.arena.rating_only, false);
  resetClockState();
});

await testAsync("active skip costs 10 Nova; no cooldown skip is rejected", async () => {
  resetClockState();
  const u = insertUser("p8-skip-1", "p8-skip-1@test.local");
  const ch = makeChar(u.id, { name: "Skip", nova: 25 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  unwrap(await FinishArenaBattle(user, { combat_id: commitOutcome(ch.id, "player") }));
  assert.equal(isArenaCooldownActive(entities.Character.get(ch.id)), true);
  const skipped = unwrap(await SkipArenaCooldown(user, { request_id: "skip-1" }));
  assert.equal(skipped.character.nova_crystals, toNovaHalfUnits(15));
  assert.equal(isArenaCooldownActive(skipped.character), false);
  const replay = unwrap(await SkipArenaCooldown(user, { request_id: "skip-1" }));
  assert.equal(replay.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).nova_crystals, toNovaHalfUnits(15));
  const clear = await SkipArenaCooldown(user, { request_id: "skip-2" });
  assert.ok(clear.status >= 400);
  assert.equal(entities.Character.get(ch.id).nova_crystals, toNovaHalfUnits(15));
});

await testAsync("insufficient Nova skip mutates nothing", async () => {
  resetClockState();
  const u = insertUser("p8-skip-poor", "p8-skip-poor@test.local");
  const ch = makeChar(u.id, {
    name: "Poor",
    nova: 13,
    stardust: 40,
    rating: 1111,
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  unwrap(await FinishArenaBattle(user, { combat_id: commitOutcome(ch.id, "player") }));
  entities.Character.update(ch.id, { nova_crystals: toNovaHalfUnits(3), stardust: 40, arena_rating: 1111 });
  const res = await SkipArenaCooldown(user, {});
  assert.ok(res.status >= 400);
  const live = entities.Character.get(ch.id);
  assert.equal(live.nova_crystals, toNovaHalfUnits(3));
  assert.equal(live.stardust, 40);
  assert.equal(live.arena_rating, 1111);
  assert.equal(isArenaCooldownActive(live), true);
});

await testAsync("Prepare skip debit is immediate; delayed Finish cannot avoid it", async () => {
  resetClockState();
  const now = Date.UTC(2026, 8, 2, 12, 0, 0);
  const fake = installFakeClock(now);
  const u = insertUser("p8-skip-prep", "p8-skip-prep@test.local");
  const ch = makeChar(u.id, {
    name: "PrepSkip",
    nova: 30,
    cooldownAt: new Date(now).toISOString(),
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const board = unwrap(await GetArenaOpponents(user, {}));
  const offerId = board.opponents[0].offer_id;
  const prep = unwrap(await PrepareArenaCombat(user, {
    offer_id: offerId,
    skip_cooldown: true,
  }));
  assert.equal(prep.nova_spent, ARENA_SKIP_COST);
  assert.equal(prep.skip_paid, true);
  assert.equal(entities.Character.get(ch.id).nova_crystals, toNovaHalfUnits(20));
  assert.equal(isArenaCooldownActive(entities.Character.get(ch.id)), false);

  const dup = unwrap(await PrepareArenaCombat(user, {
    offer_id: offerId,
    skip_cooldown: true,
  }));
  assert.equal(dup.replay, true);
  assert.equal(dup.nova_spent, 0);
  assert.equal(entities.Character.get(ch.id).nova_crystals, toNovaHalfUnits(20));

  const recovered = unwrap(await RecoverArenaMatch(user, { combat_id: prep.combat.combat_id }));
  assert.equal(recovered.pending, true);
  assert.equal(recovered.skip_paid, true);
  assert.equal(entities.Character.get(ch.id).nova_crystals, toNovaHalfUnits(20));

  fake.advance(ARENA_BATTLE_COOLDOWN_MS + 1000);
  const finish = unwrap(await FinishArenaBattle(user, { combat_id: prep.combat.combat_id }));
  assert.equal(finish.nova_spent, 0);
  assert.equal(finish.skip_paid, true);
  assert.equal(entities.Character.get(ch.id).nova_crystals, toNovaHalfUnits(20));
  assert.equal(isArenaCooldownActive(finish.character), true);

  const after = unwrap(await RecoverArenaMatch(user, { combat_id: prep.combat.combat_id }));
  assert.equal(after.recovered, true);
  assert.equal(entities.Character.get(ch.id).nova_crystals, toNovaHalfUnits(20));
  resetClockState();
});

await testAsync("insufficient Nova skip creates no pending combat", async () => {
  resetClockState();
  const now = Date.UTC(2026, 8, 2, 13, 0, 0);
  installFakeClock(now);
  const u = insertUser("p8-skip-broke", "p8-skip-broke@test.local");
  const ch = makeChar(u.id, {
    name: "BrokeSkip",
    nova: 3,
    stardust: 77,
    rating: 1212,
    cooldownAt: new Date(now).toISOString(),
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const board = unwrap(await GetArenaOpponents(user, {}));
  const res = await PrepareArenaCombat(user, {
    offer_id: board.opponents[0].offer_id,
    skip_cooldown: true,
  });
  assert.ok(res.status >= 400);
  assert.equal(res.body?.code, "INSUFFICIENT_NOVA");
  const live = entities.Character.get(ch.id);
  assert.equal(live.nova_crystals, toNovaHalfUnits(3));
  assert.equal(live.stardust, 77);
  assert.equal(live.arena_rating, 1212);
  assert.equal(readArenaPendingCombat(live), null);
  assert.equal(isArenaCooldownActive(live), true);
  resetClockState();
});

await testAsync("no-active-cooldown skip intent never charges", async () => {
  resetClockState();
  const u = insertUser("p8-skip-idle", "p8-skip-idle@test.local");
  const ch = makeChar(u.id, { name: "IdleSkip", nova: 40 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const board = unwrap(await GetArenaOpponents(user, {}));
  const prep = unwrap(await PrepareArenaCombat(user, {
    offer_id: board.opponents[0].offer_id,
    skip_cooldown: true,
  }));
  assert.equal(prep.skip_cooldown, false);
  assert.equal(prep.nova_spent, 0);
  assert.equal(entities.Character.get(ch.id).nova_crystals, toNovaHalfUnits(40));
});

await testAsync("invalid offer skip intent mutates nothing", async () => {
  resetClockState();
  const now = Date.UTC(2026, 8, 2, 14, 0, 0);
  installFakeClock(now);
  const u = insertUser("p8-skip-bad", "p8-skip-bad@test.local");
  const ch = makeChar(u.id, {
    name: "BadSkip",
    nova: 40,
    cooldownAt: new Date(now).toISOString(),
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  unwrap(await GetArenaOpponents(user, {}));
  const res = await PrepareArenaCombat(user, {
    offer_id: "not-a-real-offer",
    skip_cooldown: true,
  });
  assert.ok(res.status >= 400);
  const live = entities.Character.get(ch.id);
  assert.equal(live.nova_crystals, toNovaHalfUnits(40));
  assert.equal(readArenaPendingCombat(live), null);
  resetClockState();
});

await testAsync("concurrent Finish after paid Prepare settles once", async () => {
  resetClockState();
  const now = Date.UTC(2026, 8, 2, 15, 0, 0);
  installFakeClock(now);
  const u = insertUser("p8-skip-conc", "p8-skip-conc@test.local");
  const ch = makeChar(u.id, {
    name: "ConcSkip",
    nova: 30,
    cooldownAt: new Date(now).toISOString(),
  });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const board = unwrap(await GetArenaOpponents(user, {}));
  const prep = unwrap(await PrepareArenaCombat(user, {
    offer_id: board.opponents[0].offer_id,
    skip_cooldown: true,
  }));
  assert.equal(prep.nova_spent, ARENA_SKIP_COST);
  const [a, b] = await Promise.all([
    FinishArenaBattle(user, { combat_id: prep.combat.combat_id }),
    FinishArenaBattle(user, { combat_id: prep.combat.combat_id }),
  ]);
  const bodies = [a, b].map((row) => (row.status >= 400 ? row.body : unwrap(row)));
  const ok = bodies.filter((row) => row && (row.success || row.idempotent_replay));
  assert.ok(ok.length >= 1);
  assert.equal(entities.Character.get(ch.id).nova_crystals, toNovaHalfUnits(20));
  assert.equal(entities.Character.get(ch.id).arena_battles, 1);
  resetClockState();
});

await testAsync("duplicate Finish is idempotent including rewards", async () => {
  const u = insertUser("p8-idemp", "p8-idemp@test.local");
  const ch = makeChar(u.id, { name: "Idem", level: 15, nova: 20, stardust: 0 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const combatId = commitOutcome(ch.id, "player");
  const first = unwrap(await FinishArenaBattle(user, { combat_id: combatId }));
  const second = unwrap(await FinishArenaBattle(user, { combat_id: combatId, won: false }));
  assert.equal(second.idempotent_replay, true);
  assert.equal(second.winner, first.winner);
  assert.equal(entities.Character.get(ch.id).stardust, first.character.stardust);
  assert.equal(entities.Character.get(ch.id).arena_rewarded_wins_today, 1);
});

await testAsync("concurrent Finish settles once", async () => {
  const u = insertUser("p8-conc", "p8-conc@test.local");
  const ch = makeChar(u.id, { name: "Conc", level: 12, nova: 20, stardust: 0 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const combatId = commitOutcome(ch.id, "player");
  const [a, b] = await Promise.all([
    FinishArenaBattle(user, { combat_id: combatId }),
    FinishArenaBattle(user, { combat_id: combatId }),
  ]);
  const bodies = [a, b].map((row) => (row.status >= 400 ? row.body : unwrap(row)));
  const ok = bodies.filter((row) => row && (row.success || row.idempotent_replay));
  assert.ok(ok.length >= 1);
  assert.equal(entities.Character.get(ch.id).arena_rewarded_wins_today, 1);
});

await testAsync("pending combat blocks a different offer", async () => {
  const u = insertUser("p8-pend", "p8-pend@test.local");
  const ch = makeChar(u.id, { name: "Pend", nova: 50 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  unwrap(await GetArenaOpponents(user, {}));
  const board = unwrap(await GetArenaOpponents(user, {}));
  assert.ok(board.opponents?.length >= 2);
  unwrap(await PrepareArenaCombat(user, { offer_id: board.opponents[0].offer_id }));
  const blocked = await PrepareArenaCombat(user, { offer_id: board.opponents[1].offer_id });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body?.code, "ARENA_PENDING_COMBAT");
  const pending = readArenaPendingCombat(entities.Character.get(ch.id));
  assert.equal(pending.meta.offer_id, board.opponents[0].offer_id);
});

await testAsync("direct challenge requires prepared combat; forged won is ignored", async () => {
  const ua = insertUser("p8-dc-a", "p8-dc-a@test.local");
  const ub = insertUser("p8-dc-b", "p8-dc-b@test.local");
  const ca = makeChar(ua.id, { name: "DCA", rating: 1000, nova: 40 });
  const cb = makeChar(ub.id, { name: "DCB", rating: 1000 });
  const attacker = { id: ua.id, active_character_id: ca.id, role: "user" };
  const created = createDirectChallenge(attacker, {
    opponentCharacterId: cb.id,
    idempotencyKey: "p8-dc-1",
  });
  const forged = await FinishArenaBattle(attacker, {
    challenge_id: created.challenge.challengeId,
    won: true,
  });
  assert.ok(forged.status >= 400);
  const prep = unwrap(await PrepareArenaCombat(attacker, {
    challenge_id: created.challenge.challengeId,
  }));
  const finish = unwrap(await FinishArenaBattle(attacker, {
    challenge_id: created.challenge.challengeId,
    combat_id: prep.combat.combat_id,
    won: prep.combat.winner !== "player",
  }));
  assert.equal(finish.winner, prep.combat.winner);
});

await testAsync("recover returns the same committed combat", async () => {
  const u = insertUser("p8-rec", "p8-rec@test.local");
  const ch = makeChar(u.id, { name: "Rec", nova: 20 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  const combatId = commitOutcome(ch.id, "player");
  const rec = unwrap(await RecoverArenaMatch(user, { combat_id: combatId }));
  assert.equal(rec.pending, true);
  assert.equal(rec.combat_id, combatId);
  const finish = unwrap(await FinishArenaBattle(user, { combat_id: combatId }));
  const rec2 = unwrap(await RecoverArenaMatch(user, { combat_id: combatId }));
  assert.equal(rec2.recovered, true);
  assert.equal(rec2.winner, finish.winner);
});

await testAsync("foreign combat id fails safely", async () => {
  const ua = insertUser("p8-for-a", "p8-for-a@test.local");
  const ub = insertUser("p8-for-b", "p8-for-b@test.local");
  const ca = makeChar(ua.id, { name: "Own", nova: 20 });
  const cb = makeChar(ub.id, { name: "Other", nova: 20 });
  const userA = { id: ua.id, active_character_id: ca.id, role: "user" };
  const userB = { id: ub.id, active_character_id: cb.id, role: "user" };
  const combatId = commitOutcome(ca.id, "player");
  const foreign = await FinishArenaBattle(userB, { combat_id: combatId });
  assert.ok(foreign.status >= 400);
  const stale = await FinishArenaBattle(userA, { combat_id: "not-this-combat" });
  assert.ok(stale.status >= 400);
});

await testAsync("public Arena payload strips pricing-quality fields", async () => {
  const dirty = {
    arena: { rating: 1000, rewarded_wins_today: 2 },
    opponent: {
      name: "Rogue",
      pricing_quality_score: 77,
      acquisition_stardust_paid: 1234,
    },
    combat: { winner: "player", events: [] },
  };
  const clean = sanitizePublicResponseBody(dirty);
  assert.equal(clean.opponent.pricing_quality_score, undefined);
  assert.equal(clean.opponent.acquisition_stardust_paid, undefined);
  assert.equal(clean.arena.rating, 1000);
});

await testAsync("more than ten fights need no 15-Nova purchase", async () => {
  const u = insertUser("p8-unlim", "p8-unlim@test.local");
  const ch = makeChar(u.id, { name: "Unlim", nova: 0, level: 18 });
  const user = { id: u.id, active_character_id: ch.id, role: "user" };
  for (let i = 0; i < 12; i++) {
    entities.Character.update(ch.id, { arena_cooldown_at: null });
    const combatId = commitOutcome(ch.id, i % 2 === 0 ? "player" : "opponent");
    const finish = unwrap(await FinishArenaBattle(user, { combat_id: combatId }));
    assert.equal(finish.nova_spent, 0);
    assert.notEqual(finish.nova_spent, 15);
  }
  assert.equal(entities.Character.get(ch.id).nova_crystals, 0);
});

await testAsync("Godot Arena callers do not send an authoritative winner", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const manager = fs.readFileSync(path.join(root, "loot&lasers/Autoload/ArenaManager.gd"), "utf8");
  const finishInvoke = manager.match(
    /func finish_battle\(\)[\s\S]*?GameApiClient\.invoke\("FinishArenaBattle", body\)/,
  );
  const prepareInvoke = manager.match(
    /func prepare_challenge\([\s\S]*?GameApiClient\.invoke\("PrepareArenaCombat", payload\)/,
  );
  assert.ok(finishInvoke);
  assert.ok(prepareInvoke);
  assert.match(finishInvoke[0], /"combat_id": pending_combat_id/);
  assert.doesNotMatch(finishInvoke[0], /"won"\s*:/);
  assert.doesNotMatch(prepareInvoke[0], /"won"\s*:/);
  assert.doesNotMatch(prepareInvoke[0], /"is_free"\s*:/);
  assert.doesNotMatch(manager, /"is_free"\s*:/);
  const lobby = fs.readFileSync(path.join(root, "loot&lasers/Scenes/UI/arena.gd"), "utf8");
  assert.doesNotMatch(lobby, /PAID_BATTLE_COST|DAILY_FREE_BATTLES|is_free/);
  const rules = fs.readFileSync(path.join(root, "loot&lasers/Scripts/ArenaRules.gd"), "utf8");
  assert.doesNotMatch(rules, /DAILY_FREE_BATTLES|PAID_BATTLE_COST/);
  assert.match(lobby, /REWARDED WINS TODAY|RATING ONLY/);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
