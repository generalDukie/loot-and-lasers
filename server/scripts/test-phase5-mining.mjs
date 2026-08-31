/**
 * Phase 5 — Mining formula, snapshot, persistence, atomicity.
 * Run: npm run test:phase5-mining
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-phase5-mining-"));
process.env.DB_PATH = path.join(tmpDir, "phase5-mining.db");

const {
  MINING_STARDUST_PER_SPF_PER_MINUTE,
  MINING_SESSION_HOURS_MIN,
  MINING_SESSION_HOURS_MAX,
  MINING_RULES_VERSION,
  MINUTES_PER_HOUR,
  MILLISECONDS_PER_HOUR,
  stardustPerFuel,
  miningStardustResolved,
  roundHalfUp,
} = await import("../../src/lib/productionMath/index.js");
const { computeMiningReward, isShipHangarEnabled } = await import("../src/shared/economyFormulas.js");
const {
  buildMiningStartPatch,
  buildMiningClearPatch,
  serializeMiningState,
  clampMiningHours,
  MiningStates,
} = await import("../src/shared/miningService.js");
const { entities } = await import("../src/entities.js");
const { clock, installFakeClock, resetClockState } = await import("../src/shared/time/clock.js");
const {
  StartMining,
  CollectMining,
  GetMiningStatus,
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

function expectedMining(level, minutes) {
  return Math.max(0, roundHalfUp(
    stardustPerFuel(level) * MINING_STARDUST_PER_SPF_PER_MINUTE * minutes,
  ));
}

console.log("\nPhase 5 Mining tests\n");

test("product session bounds are 1–12 hours; no 720-minute daily cap", () => {
  assert.equal(MINING_SESSION_HOURS_MIN, 1);
  assert.equal(MINING_SESSION_HOURS_MAX, 12);
  assert.equal(clampMiningHours(0), 1);
  assert.equal(clampMiningHours(99), 12);
  assert.ok(expectedMining(80, 800) > expectedMining(80, 720));
});

test("formula 0.03 × SPF(snapshotLevel) per minute at representative levels/durations", () => {
  const levels = [1, 10, 25, 50, 75, 100, 150, 200, 500, 800, 1500, 2000];
  const durations = [1, 5, 30, 60, 12 * MINUTES_PER_HOUR];
  for (const L of levels) {
    for (const mins of durations) {
      const got = miningStardustResolved({ snapshotLevel: L, minutes: mins });
      assert.equal(got, expectedMining(L, mins));
      assert.ok(Number.isFinite(got));
      assert.ok(got >= 0);
    }
    assert.equal(computeMiningReward(L, 1), expectedMining(L, MINUTES_PER_HOUR));
  }
});

test("non-finite / negative minutes grant 0", () => {
  assert.equal(miningStardustResolved({ snapshotLevel: 50, minutes: Number.NaN }), 0);
  assert.equal(miningStardustResolved({ snapshotLevel: 50, minutes: Number.POSITIVE_INFINITY }), 0);
  assert.equal(miningStardustResolved({ snapshotLevel: 50, minutes: -10 }), 0);
});

test("Ship/Hangar remains disabled and does not multiply Mining", () => {
  assert.equal(isShipHangarEnabled(), false);
  const base = expectedMining(100, MINUTES_PER_HOUR);
  assert.equal(computeMiningReward(100, 1), base);
});

test("start patch freezes snapshot level + rules version, not claim-time level", () => {
  const patch = buildMiningStartPatch({ level: 40 }, 3, 1_900_000_000_000);
  assert.equal(patch.mining_snapshot_level, 40);
  assert.equal(patch.mining_rules_version, MINING_RULES_VERSION);
  assert.equal(patch.mining_reward, computeMiningReward(40, 3));
  assert.notEqual(patch.mining_reward, computeMiningReward(80, 3));
});

const user = {
  id: "p5-mine-user",
  email: "p5-mine@example.com",
  role: "user",
  active_character_id: "",
};

const ch = entities.Character.create({
  id: "p5-mine-char",
  name: "MinerP5",
  class: "Vanguard",
  race: "Keldris",
  level: 50,
  experience: 0,
  experience_to_next_level: 100,
  stardust: 1000,
  total_stardust_earned: 1000,
  nova_crystals: 0,
  fuel: 50,
  max_fuel: 100,
  stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
  attribute_purchases: 0,
  attribute_purchases_by_stat: {
    strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
  },
  equipped_items: {},
  mining_end_time: null,
  mining_reward: 0,
  created_by_id: user.id,
  created_by: user.email,
  active_buffs: [],
});
user.active_character_id = ch.id;

await testAsync("start / reconnect preserves the same session start", async () => {
  resetClockState();
  const t0 = 2_000_000_000_000;
  installFakeClock(t0);
  const start = await StartMining(user, { hours: 2 });
  assert.equal(start.status, 200);
  const started = entities.Character.get(ch.id);
  assert.equal(started.mining_snapshot_level, 50);
  const startIso = started.mining_start_time;
  installFakeClock(t0 + MILLISECONDS_PER_HOUR);
  const status = await GetMiningStatus(user, {});
  assert.equal(status.status, 200);
  assert.equal(status.body.mining.mining_start_time, startIso);
  assert.equal(status.body.mining.mining_state, MiningStates.ACTIVE);
  assert.equal(entities.Character.get(ch.id).mining_start_time, startIso);
  const dup = await StartMining(user, { hours: 12 });
  assert.equal(dup.body.already_active, true);
  assert.equal(entities.Character.get(ch.id).mining_hours, 2);
});

await testAsync("level-up during session does not change snapshotted payout", async () => {
  const live = entities.Character.get(ch.id);
  const snapReward = live.mining_reward;
  entities.Character.update(ch.id, { level: 200 });
  assert.notEqual(computeMiningReward(200, 2), snapReward);
  assert.equal(entities.Character.get(ch.id).mining_reward, snapReward);
  assert.equal(entities.Character.get(ch.id).mining_snapshot_level, 50);
  installFakeClock(2_000_000_000_000 + 2 * MILLISECONDS_PER_HOUR);
  const before = entities.Character.get(ch.id).stardust;
  const claim = await CollectMining(user, { request_id: "p5-mine-claim-1" });
  assert.equal(claim.status, 200);
  assert.equal(claim.body.stardust_gained, snapReward);
  assert.equal(entities.Character.get(ch.id).stardust, before + snapReward);
  assert.equal(entities.Character.get(ch.id).mining_end_time, null);
});

await testAsync("duplicate and concurrent claims cannot double-pay", async () => {
  const before = entities.Character.get(ch.id).stardust;
  const replay = await CollectMining(user, { request_id: "p5-mine-claim-1" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).stardust, before);
  const sessionReplay = await CollectMining(user, { request_id: "p5-mine-claim-other" });
  assert.equal(sessionReplay.status, 200);
  assert.equal(sessionReplay.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).stardust, before);

  resetClockState();
  const t1 = 2_100_000_000_000;
  installFakeClock(t1);
  await StartMining(user, { hours: 1 });
  installFakeClock(t1 + MILLISECONDS_PER_HOUR);
  const sd = entities.Character.get(ch.id).stardust;
  const [a, b] = await Promise.all([
    CollectMining(user, { request_id: "p5-conc-a" }),
    CollectMining(user, { request_id: "p5-conc-b" }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const gainedA = a.body.idempotent_replay ? 0 : a.body.stardust_gained;
  const gainedB = b.body.idempotent_replay ? 0 : b.body.stardust_gained;
  const winners = [gainedA, gainedB].filter((n) => n > 0);
  assert.equal(winners.length, 1);
  assert.equal(entities.Character.get(ch.id).stardust, sd + winners[0]);
  assert.equal(entities.Character.get(ch.id).mining_end_time, null);
});

test("elapsed remaining_ms is never negative", () => {
  const state = serializeMiningState({
    id: ch.id,
    mining_start_time: new Date(1_000).toISOString(),
    mining_end_time: new Date(2_000).toISOString(),
    mining_hours: 1,
    mining_reward: 10,
  }, 5_000);
  assert.equal(state.remaining_ms, 0);
  assert.equal(state.mining_state, MiningStates.READY);
  const clear = buildMiningClearPatch();
  assert.equal(clear.mining_end_time, null);
  assert.equal(clear.mining_snapshot_level, null);
});

if (failed) {
  console.error(`\nPhase 5 Mining tests: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nPhase 5 Mining tests: ${passed} passed`);
