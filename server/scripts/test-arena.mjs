/**
 * Arena direct-challenge tests.
 * Run: npm run test:arena
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-arena-"));
process.env.DB_PATH = path.join(tmpDir, "test-arena.db");
process.env.ARENA_CHALLENGE_COOLDOWN_MS = "0";
process.env.ARENA_CHALLENGE_MAX_PER_HOUR = "100";

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  computeDirectChallengeRatingDelta,
  estimateWinLoss,
  gapMultiplierForWin,
  repeatWinMultiplier,
  createDirectChallenge,
  completeDirectChallenge,
  previewDirectChallenge,
  ArenaErrors,
  ArenaError,
  DIRECT_CHALLENGE_RATING,
} = await import("../src/arena/index.js");
const { getChallengeById, getPairBattleStats, normalizeAccountPairKey } = await import(
  "../src/arena/store.js"
);
const { currentPeriodId } = await import("../src/arena/service.js");

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

function hashPw(pw) {
  return createHash("sha256").update(pw).digest("hex");
}

function insertUser(id, email) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, 'user', 1, ?, ?)`
  ).run(id, email, hashPw("x"), now, now);
  return { id, email, role: "user", active_character_id: null };
}

function makeChar(ownerId, { name, rating = 1000, id } = {}) {
  return entities.Character.create({
    id,
    name: name || `Op-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: ownerId,
    arena_rating: rating,
    arena_wins: 0,
    arena_losses: 0,
    arena_streak: 0,
    level: 10,
    class: "Scout",
    race: "Human",
    stats: {},
  });
}

console.log("\nArena direct-challenge tests\n");

test("close ratings: win gets normal Elo-ish positive gain", () => {
  const r = computeDirectChallengeRatingDelta({
    challengerRating: 1500,
    opponentRating: 1480,
    won: true,
    priorRankedWinsInPeriod: 0,
  });
  assert.ok(r.ratingDelta > 0);
  assert.ok(r.ratingDelta <= DIRECT_CHALLENGE_RATING.maximumGain);
  assert.equal(r.gapBand, "full");
  assert.equal(r.zeroRewardReason, null);
});

test("moderate gap below: win rating reduced", () => {
  const full = computeDirectChallengeRatingDelta({
    challengerRating: 1600,
    opponentRating: 1550,
    won: true,
  });
  const reduced = computeDirectChallengeRatingDelta({
    challengerRating: 1600,
    opponentRating: 1450, // gap 150 → medium
    won: true,
  });
  assert.equal(reduced.gapBand, "medium");
  assert.ok(reduced.ratingDelta < full.ratingDelta || reduced.gapMultiplier === 0.5);
  assert.ok(reduced.ratingDelta > 0);
});

test("far below zero threshold: victory gives exactly 0", () => {
  const r = computeDirectChallengeRatingDelta({
    challengerRating: 2000,
    opponentRating: 1500, // gap 500 > 400
    won: true,
  });
  assert.equal(r.ratingDelta, 0);
  assert.equal(r.zeroRewardReason, "OPPONENT_TOO_LOW_FOR_RATING_GAIN");
  assert.equal(gapMultiplierForWin(2000, 1500).zeroReward, true);
});

test("underdog victory: large but capped gain", () => {
  const r = computeDirectChallengeRatingDelta({
    challengerRating: 1400,
    opponentRating: 2000,
    won: true,
  });
  assert.ok(r.underdogVictory);
  assert.ok(r.ratingDelta > 10);
  assert.ok(r.ratingDelta <= DIRECT_CHALLENGE_RATING.maximumGain);
  assert.equal(r.gapMultiplier, 1);
});

test("loss vs lower-rated: meaningful capped loss (not zero rule)", () => {
  const r = computeDirectChallengeRatingDelta({
    challengerRating: 2000,
    opponentRating: 1400,
    won: false,
  });
  assert.ok(r.ratingDelta < 0);
  assert.ok(Math.abs(r.ratingDelta) <= DIRECT_CHALLENGE_RATING.maximumLoss);
  assert.equal(r.zeroRewardReason, null);
});

test("repeat opponent multipliers", () => {
  assert.equal(repeatWinMultiplier(0).band, "full");
  assert.equal(repeatWinMultiplier(1).band, "reduced");
  assert.equal(repeatWinMultiplier(2).zeroPositive, true);
});

test("preview estimates match win/loss calc", () => {
  const est = estimateWinLoss({
    challengerRating: 2000,
    opponentRating: 1500,
    priorRankedWinsInPeriod: 0,
  });
  assert.equal(est.estimatedWinChange, 0);
  assert.ok(est.estimatedLossChange < 0);
  assert.equal(est.warningCode, "OPPONENT_TOO_LOW_FOR_RATING_GAIN");
  assert.equal(est.ratingRewardEligible, false);
});

const userA = insertUser("acct-a", "a@loot.local");
const userB = insertUser("acct-b", "b@loot.local");
const userC = insertUser("acct-c", "c@loot.local");
const charA = makeChar(userA.id, { name: "Alpha", rating: 1600 });
const charA2 = makeChar(userA.id, { name: "AlphaAlt", rating: 1550 });
const charB = makeChar(userB.id, { name: "Bravo", rating: 1580 });
const charLow = makeChar(userC.id, { name: "Lowbie", rating: 1000 });
userA.active_character_id = charA.id;
userB.active_character_id = charB.id;

test("cannot challenge self", () => {
  const p = previewDirectChallenge(userA, {
    challengerCharacterId: charA.id,
    opponentCharacterId: charA.id,
  });
  assert.equal(p.challengeAllowed, false);
  assert.equal(p.reasonCode, ArenaErrors.ARENA_CANNOT_CHALLENGE_SELF);
});

test("cannot challenge same-account character", () => {
  const p = previewDirectChallenge(userA, {
    challengerCharacterId: charA.id,
    opponentCharacterId: charA2.id,
  });
  assert.equal(p.challengeAllowed, false);
  assert.equal(p.reasonCode, ArenaErrors.ARENA_SAME_ACCOUNT_CHALLENGE);
});

test("eligible opponent preview allowed", () => {
  const p = previewDirectChallenge(userA, {
    challengerCharacterId: charA.id,
    opponentCharacterId: charB.id,
  });
  assert.equal(p.challengeAllowed, true);
  assert.equal(p.challengerRating, 1600);
  assert.equal(p.opponentRating, 1580);
});

test("create challenge uses server ratings; ignores client rating fields", () => {
  const created = createDirectChallenge(userA, {
    challengerCharacterId: charA.id,
    opponentCharacterId: charB.id,
    idempotencyKey: "idem-create-1",
    challengerRating: 9999,
    opponentRating: 1,
    estimatedWinChange: 99,
  });
  assert.equal(created.challenge.challengerRatingAtStart, 1600);
  assert.equal(created.challenge.opponentRatingAtStart, 1580);
  assert.equal(created.challenge.status, "started");
  assert.ok(created.defenseSnapshot?.characterId === charB.id);
});

test("idempotent create replays same challenge", () => {
  const a = createDirectChallenge(userA, {
    challengerCharacterId: charA.id,
    opponentCharacterId: charB.id,
    idempotencyKey: "idem-create-1",
  });
  assert.equal(a.replayed, true);
  assert.equal(a.challenge.challengeId, getChallengeById(a.challenge.challengeId).challengeId);
});

test("snapshot ratings used even if live rating changes", () => {
  // Complete the open challenge from create test first by using a fresh pair.
  const freshA = insertUser("acct-snap-a", "snap-a@loot.local");
  const freshB = insertUser("acct-snap-b", "snap-b@loot.local");
  const c1 = makeChar(freshA.id, { name: "SnapA", rating: 1700 });
  const c2 = makeChar(freshB.id, { name: "SnapB", rating: 1650 });
  freshA.active_character_id = c1.id;

  const created = createDirectChallenge(freshA, {
    challengerCharacterId: c1.id,
    opponentCharacterId: c2.id,
    idempotencyKey: "idem-snap-1",
  });

  // Unrelated rating drift on both characters.
  entities.Character.update(c1.id, { arena_rating: 1900 });
  entities.Character.update(c2.id, { arena_rating: 900 });

  const done = completeDirectChallenge(freshA, {
    challengeId: created.challenge.challengeId,
    won: true,
  });
  assert.equal(done.replayed, false);
  // Delta computed from 1700 vs 1650, not 1900 vs 900.
  const expected = computeDirectChallengeRatingDelta({
    challengerRating: 1700,
    opponentRating: 1650,
    won: true,
    priorRankedWinsInPeriod: 0,
  });
  assert.equal(done.ratingDelta, expected.ratingDelta);
  const live = entities.Character.get(c1.id);
  assert.equal(live.arena_rating, 1900 + expected.ratingDelta);
});

test("idempotent complete does not double-apply rating", () => {
  const freshA = insertUser("acct-idem-a", "idem-a@loot.local");
  const freshB = insertUser("acct-idem-b", "idem-b@loot.local");
  const c1 = makeChar(freshA.id, { name: "IdemA", rating: 1500 });
  const c2 = makeChar(freshB.id, { name: "IdemB", rating: 1500 });
  freshA.active_character_id = c1.id;

  const created = createDirectChallenge(freshA, {
    challengerCharacterId: c1.id,
    opponentCharacterId: c2.id,
    idempotencyKey: "idem-complete-1",
  });
  const first = completeDirectChallenge(freshA, {
    challengeId: created.challenge.challengeId,
    won: true,
  });
  const ratingAfterFirst = entities.Character.get(c1.id).arena_rating;
  const second = completeDirectChallenge(freshA, {
    challengeId: created.challenge.challengeId,
    won: true,
  });
  assert.equal(second.replayed, true);
  assert.equal(entities.Character.get(c1.id).arena_rating, ratingAfterFirst);
  assert.equal(second.ratingDelta, first.ratingDelta);
});

test("client cannot force rewarded zero-gap battle via submitted delta", () => {
  const freshA = insertUser("acct-z-a", "z-a@loot.local");
  const freshB = insertUser("acct-z-b", "z-b@loot.local");
  const c1 = makeChar(freshA.id, { name: "High", rating: 2000 });
  const c2 = makeChar(freshB.id, { name: "Far", rating: 1500 });
  freshA.active_character_id = c1.id;
  const created = createDirectChallenge(freshA, {
    challengerCharacterId: c1.id,
    opponentCharacterId: c2.id,
    idempotencyKey: "idem-zero-1",
    estimatedWinChange: 32,
  });
  const done = completeDirectChallenge(freshA, {
    challengeId: created.challenge.challengeId,
    won: true,
    arena_rating_delta: 32,
  });
  assert.equal(done.ratingDelta, 0);
});

test("repeat opponent: second win reduced, third zero; loss still applies", () => {
  const ua = insertUser("acct-rep-a", "rep-a@loot.local");
  const ub = insertUser("acct-rep-b", "rep-b@loot.local");
  const ca = makeChar(ua.id, { name: "RepA", rating: 1500 });
  const cb = makeChar(ub.id, { name: "RepB", rating: 1490 });
  ua.active_character_id = ca.id;

  const deltas = [];
  for (let i = 0; i < 3; i++) {
    const created = createDirectChallenge(ua, {
      challengerCharacterId: ca.id,
      opponentCharacterId: cb.id,
      idempotencyKey: `idem-rep-win-${i}`,
    });
    // Clear active by completing
    const done = completeDirectChallenge(ua, {
      challengeId: created.challenge.challengeId,
      won: true,
    });
    deltas.push(done.ratingDelta);
    // Refresh live char for next create ownership
    Object.assign(ca, entities.Character.get(ca.id));
  }
  assert.ok(deltas[0] > 0, `first win ${deltas[0]}`);
  assert.ok(deltas[1] >= 0 && deltas[1] <= deltas[0], `second ${deltas[1]} <= first`);
  assert.equal(deltas[2], 0, "third win zero");

  const lossChallenge = createDirectChallenge(ua, {
    challengerCharacterId: ca.id,
    opponentCharacterId: cb.id,
    idempotencyKey: "idem-rep-loss",
  });
  const before = entities.Character.get(ca.id).arena_rating;
  const loss = completeDirectChallenge(ua, {
    challengeId: lossChallenge.challenge.challengeId,
    won: false,
  });
  assert.ok(loss.ratingDelta < 0);
  assert.equal(entities.Character.get(ca.id).arena_rating, before + loss.ratingDelta);
});

test("alternate character cannot bypass account-pair limits", () => {
  const ua = insertUser("acct-alt-a", "alt-a@loot.local");
  const ub = insertUser("acct-alt-b", "alt-b@loot.local");
  const ca1 = makeChar(ua.id, { name: "Alt1", rating: 1500 });
  const ca2 = makeChar(ua.id, { name: "Alt2", rating: 1500 });
  const cb = makeChar(ub.id, { name: "Target", rating: 1490 });
  ua.active_character_id = ca1.id;

  for (let i = 0; i < 2; i++) {
    const created = createDirectChallenge(ua, {
      challengerCharacterId: ca1.id,
      opponentCharacterId: cb.id,
      idempotencyKey: `idem-alt-a-${i}`,
    });
    completeDirectChallenge(ua, { challengeId: created.challenge.challengeId, won: true });
  }

  const pair = normalizeAccountPairKey(ua.id, ub.id);
  const stats = getPairBattleStats(pair, currentPeriodId());
  assert.ok(stats.rankedWins >= 2);

  ua.active_character_id = ca2.id;
  const created = createDirectChallenge(ua, {
    challengerCharacterId: ca2.id,
    opponentCharacterId: cb.id,
    idempotencyKey: "idem-alt-bypass",
  });
  const done = completeDirectChallenge(ua, {
    challengeId: created.challenge.challengeId,
    won: true,
  });
  assert.equal(done.ratingDelta, 0);
});

test("rejects unowned challenger character", () => {
  assert.throws(
    () =>
      createDirectChallenge(userA, {
        challengerCharacterId: charB.id,
        opponentCharacterId: charLow.id,
        idempotencyKey: "idem-steal",
      }),
    (e) => e instanceof ArenaError && e.code === ArenaErrors.ARENA_CHARACTER_NOT_OWNED
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
