/**
 * Restoration 13 — Mining system (AFK stardust sessions).
 * Run: npm run test:mining
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-mining-"));
process.env.DB_PATH = path.join(tmpDir, "mining.db");

const { entities } = await import("../src/entities.js");
const { clock, installFakeClock, resetClockState } = await import("../src/shared/time/clock.js");
const {
  StartMining,
  CollectMining,
  CancelMining,
  GetMiningStatus,
} = await import("../src/functions/economyFollowOn.js");
const {
  assertMiningClientSafe,
  detectSuspiciousMiningFields,
  serializeMiningState,
  clampMiningHours,
  MiningStates,
  buildMiningStartPatch,
} = await import("../src/shared/miningService.js");
const { computeMiningReward } = await import("../src/shared/economyFormulas.js");

let passed = 0;
let failed = 0;
/** @type {import("../src/shared/time/clock.js").FakeClock | null} */
let fake = null;

function freeze(ms) {
  resetClockState();
  fake = installFakeClock(ms);
  return fake;
}

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

const user = {
  id: "mining-user",
  email: "mining@example.com",
  role: "user",
  active_character_id: "",
};

const ch = entities.Character.create({
  id: "mining-char",
  name: "Miner",
  class: "Vanguard",
  race: "Keldris",
  level: 20,
  experience: 0,
  experience_to_next_level: 100,
  stardust: 1000,
  total_stardust_earned: 1000,
  nova_crystals: 10,
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

console.log("\nMining tests (Restoration 13)\n");

test("rejects client timer/reward/stardust tampering", () => {
  assert.deepEqual(detectSuspiciousMiningFields({ hours: 4, mining_reward: 99 }), ["mining_reward"]);
  assert.throws(() => assertMiningClientSafe({ mining_end_time: "x" }), (e) => e.status === 400);
  assert.throws(() => assertMiningClientSafe({ stardust: 1 }), (e) => e.status === 400);
  assert.doesNotThrow(() => assertMiningClientSafe({ hours: 4 }));
});

test("clampMiningHours bounds 1–24", () => {
  assert.equal(clampMiningHours(0), 1);
  assert.equal(clampMiningHours(99), 24);
  assert.equal(clampMiningHours(4.9), 4);
});

test("reward is snapshotted at start (SPF × 0.03 × minutes)", () => {
  const expected = computeMiningReward(20, 4);
  const patch = buildMiningStartPatch({ level: 20 }, 4, 1_700_000_000_000);
  assert.equal(patch.mining_reward, expected);
  assert.equal(patch.mining_hours, 4);
  assert.ok(patch.mining_start_time);
  assert.ok(patch.mining_end_time);
});

await testAsync("StartMining persists session + committed reward", async () => {
  freeze(1_700_000_000_000);
  const res = await StartMining(user, { hours: 2 });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.success, true);
  assert.equal(res.body.hours, 2);
  assert.equal(res.body.mining.mining_state, MiningStates.ACTIVE);
  assert.equal(res.body.mining.reward_state, "committed");
  assert.equal(res.body.patch.mining_reward, computeMiningReward(20, 2));
  const live = entities.Character.get(ch.id);
  assert.ok(live.mining_end_time);
  assert.ok(live.mining_start_time);
  assert.equal(live.mining_hours, 2);
  assert.equal(live.mining_reward, computeMiningReward(20, 2));
});

await testAsync("GetMiningStatus restores timer after reconnect", async () => {
  const res = await GetMiningStatus(user);
  assert.equal(res.status, 200);
  assert.equal(res.body.mining.mining_state, MiningStates.ACTIVE);
  assert.ok(res.body.mining.remaining_ms > 0);
  assert.equal(res.body.mining.mining_reward, entities.Character.get(ch.id).mining_reward);
});

await testAsync("CollectMining rejected before timer ends", async () => {
  const res = await CollectMining(user, { request_id: "mine_early" });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "MINING_NOT_READY");
});

await testAsync("reward does not reroll while active", async () => {
  const before = entities.Character.get(ch.id).mining_reward;
  const status = await GetMiningStatus(user);
  assert.equal(status.body.mining.mining_reward, before);
  fake.advance(30 * 60 * 1000);
  const again = await GetMiningStatus(user);
  assert.equal(again.body.mining.mining_reward, before);
});

await testAsync("CollectMining grants committed stardust once", async () => {
  freeze(1_700_000_000_000 + 2 * 3600 * 1000 + 1000);
  const before = entities.Character.get(ch.id);
  const expected = before.mining_reward;
  const beforeSd = before.stardust;
  const rid = "mine_collect_ok_1";
  const res = await CollectMining(user, { request_id: rid });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.stardust_gained, expected);
  assert.equal(res.body.mining.mining_state, MiningStates.IDLE);
  assert.equal(res.body.mining.collected, true);
  const after = entities.Character.get(ch.id);
  assert.equal(after.stardust, beforeSd + expected);
  assert.equal(after.mining_end_time, null);
  assert.equal(after.mining_reward, 0);
  assert.equal(after.mining_start_time, null);
  assert.equal(after.mining_hours, null);
});

await testAsync("duplicate request_id does not double-grant", async () => {
  const before = entities.Character.get(ch.id);
  const res = await CollectMining(user, { request_id: "mine_collect_ok_1" });
  assert.equal(res.status, 200);
  assert.equal(res.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).stardust, before.stardust);
});

await testAsync("second collect without replay key fails", async () => {
  const res = await CollectMining(user, { request_id: "mine_collect_ok_2" });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "MINING_NOT_ACTIVE");
});

await testAsync("rejects client-supplied mining_reward on start", async () => {
  const res = await StartMining(user, { hours: 1, mining_reward: 999999 });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "MINING_CLIENT_TAMPER");
});

await testAsync("mission mutex blocks StartMining", async () => {
  entities.Character.update(ch.id, {
    active_mission_id: "m1",
    mission_end_time: new Date(clock.nowMs() + 3600000).toISOString(),
  });
  const res = await StartMining(user, { hours: 1 });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "MINING_SHIP_BUSY");
  entities.Character.update(ch.id, { active_mission_id: null, mission_end_time: null });
});

await testAsync("CancelMining clears session without payout", async () => {
  freeze(1_800_000_000_000);
  const start = await StartMining(user, { hours: 3 });
  assert.equal(start.status, 200);
  const beforeSd = entities.Character.get(ch.id).stardust;
  const cancel = await CancelMining(user, {});
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.mining.mining_state, MiningStates.IDLE);
  const after = entities.Character.get(ch.id);
  assert.equal(after.stardust, beforeSd);
  assert.equal(after.mining_end_time, null);
});

await testAsync("serializeMiningState idle when cleared", async () => {
  const live = entities.Character.get(ch.id);
  const s = serializeMiningState(live);
  assert.equal(s.mining_state, MiningStates.IDLE);
  assert.equal(s.reward_state, "none");
  assert.equal(s.collected, true);
});

await testAsync("ownership: other account cannot collect foreign character", async () => {
  freeze(1_900_000_000_000);
  await StartMining(user, { hours: 1 });
  freeze(1_900_000_000_000 + 3600 * 1000 + 1);
  const foreign = {
    id: "other-user",
    email: "other@example.com",
    role: "user",
    active_character_id: "missing",
  };
  const res = await CollectMining(foreign, { request_id: "x" });
  assert.ok(res.status === 400 || res.status === 404 || res.status >= 400);
  const status = await GetMiningStatus(user);
  assert.equal(status.body.mining.mining_state, MiningStates.READY);
  await CollectMining(user, { request_id: "mine_own_final" });
});

resetClockState();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
