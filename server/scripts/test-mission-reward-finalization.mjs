/**
 * Mission reward finalization + loss path + duplicate prevention + durations.
 *
 * Proves the reworked mission pipeline:
 *  - XP/Stardust/Fuel are FINALIZED at offer generation (level snapshot + baked
 *    ship/Collection/Nexus + independent 0.90–1.10 variance) and granted verbatim
 *    on a win — no recompute/re-roll at claim, even after a mid-mission level-up.
 *  - Loss grants 50% XP/Stardust, forces a Nothing item outcome, and freezes the
 *    gear pity streak; it still resolves and rotates the board.
 *  - No two simultaneous offers share an identical (fuel, XP, Stardust) tuple.
 *  - Variance is a flat ±10% at every level (old ±25% low-level band removed).
 *  - Generation uses the authoritative missionDuration pools.
 *
 * Run: node --import ./scripts/register-src-alias.mjs scripts/test-mission-reward-finalization.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-mission-reward-"));
process.env.DB_PATH = path.join(tmpDir, "mission-reward.db");

const { entities } = await import("../src/entities.js");
const { GetMissionBoard, LaunchMission, ClaimMission } = await import("../src/functions/economy.js");
const { getMissionRewardVariance, rollMissionEfficiency } = await import("../src/shared/economyFormulas.js");
const {
  getAllowedMissionDurations,
  rollMissionDurationSeconds,
  remainingFuelDurationSeconds,
  isLaunchableMissionDuration,
  MISSION_MIN_FUEL,
} = await import("../../src/lib/missionDuration.js");

let passed = 0;
let failed = 0;

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

let seq = 0;
function makeCharacter(overrides = {}) {
  seq += 1;
  const user = {
    id: `mr-user-${seq}`,
    email: `mr${seq}@example.com`,
    role: "user",
    active_character_id: "",
  };
  const ch = entities.Character.create({
    id: `mr-char-${seq}`,
    name: "Runner",
    class: "Vanguard",
    race: "Keldris",
    level: 8,
    experience: 0,
    experience_to_next_level: 100000,
    stardust: 10000,
    total_stardust_earned: 10000,
    nova_crystals: 400,
    fuel: 100,
    max_fuel: 100,
    fuel_purchases: 0,
    fuel_reset_at: new Date().toISOString(),
    highest_sector: 1,
    stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
    equipped_items: {},
    created_by_id: user.id,
    created_by: user.email,
    ...overrides,
  });
  user.active_character_id = ch.id;
  return { user, ch };
}

/** Force a mission to be finished with a deterministic winner, then it can be claimed. */
function forceResolve(chId, missionId, winner) {
  const past = new Date(Date.now() - 60_000).toISOString();
  entities.Mission.update(missionId, {
    end_time: past,
    combat_result: { combat_id: "forced", winner, events: [] },
  });
  entities.Character.update(chId, { mission_end_time: past });
}

console.log("\nMission reward finalization tests\n");

await testAsync("Variance is flat ±10% at every level (no ±25% low-level band)", () => {
  for (const L of [1, 3, 5, 10, 11, 50, 500]) {
    assert.equal(getMissionRewardVariance(L), 0.10, `variance L${L}`);
  }
  // rollMissionEfficiency stays inside [0.90, 1.10] even at L1/L5.
  for (const L of [1, 5, 50]) {
    let u = 0;
    const rng = () => {
      u = (u * 1664525 + 1013904223) >>> 0;
      return u / 0x100000000;
    };
    for (let i = 0; i < 500; i++) {
      const v = rollMissionEfficiency(L, rng);
      assert.ok(v >= 0.90 && v <= 1.10, `L${L} eff ${v} out of band`);
    }
  }
});

await testAsync("Offers store independent XP/Stardust variance in [0.90,1.10]", async () => {
  let sawIndependent = false;
  for (let n = 0; n < 30; n++) {
    const { user } = makeCharacter({ level: 3 });
    const res = await GetMissionBoard(user, {});
    for (const o of res.body.offers) {
      assert.ok(o.xp_efficiency >= 0.90 && o.xp_efficiency <= 1.10, `xp eff ${o.xp_efficiency}`);
      assert.ok(o.stardust_efficiency >= 0.90 && o.stardust_efficiency <= 1.10, `sd eff ${o.stardust_efficiency}`);
      if (o.xp_efficiency !== o.stardust_efficiency) sawIndependent = true;
    }
  }
  assert.ok(sawIndependent, "XP and Stardust variance are rolled independently");
});

await testAsync("No two simultaneous offers share an identical (fuel, XP, Stardust) tuple", async () => {
  for (let n = 0; n < 60; n++) {
    const { user } = makeCharacter({ level: 1 + (n % 30) });
    const res = await GetMissionBoard(user, {});
    const tuples = res.body.offers.map((o) => `${o.fuel_cost}|${o.preview_xp}|${o.preview_stardust}`);
    assert.equal(new Set(tuples).size, tuples.length, `board ${n} has a duplicate tuple`);
  }
});

await testAsync("WIN grants EXACTLY the displayed finalized reward (no recompute/re-roll)", async () => {
  const { user, ch } = makeCharacter();
  const board = await GetMissionBoard(user, {});
  const offer = board.body.offers[0];
  const beforeStardust = entities.Character.get(ch.id).stardust;
  const launch = await LaunchMission(user, { board_offer_id: offer.offer_id });
  const missionId = launch.body.mission.id;
  // Mission entity carries the finalized values verbatim.
  assert.equal(launch.body.mission.final_xp, offer.preview_xp, "mission final_xp = displayed");
  assert.equal(launch.body.mission.final_stardust, offer.preview_stardust, "mission final_stardust = displayed");

  forceResolve(ch.id, missionId, "player");
  const claim = await ClaimMission(user, { mission_id: missionId });
  assert.equal(claim.status, 200, claim.body?.error);
  assert.equal(claim.body.won, true);
  assert.equal(claim.body.gains.experience, offer.preview_xp, "granted XP = displayed XP");
  assert.equal(claim.body.gains.stardust, offer.preview_stardust, "granted Stardust = displayed Stardust");
  const after = entities.Character.get(ch.id);
  assert.equal(after.stardust - beforeStardust, offer.preview_stardust, "wallet delta = displayed Stardust");
});

await testAsync("Mid-mission LEVEL-UP does not change the finalized reward", async () => {
  const { user, ch } = makeCharacter({ level: 8 });
  const board = await GetMissionBoard(user, {});
  const offer = board.body.offers[0];
  const launch = await LaunchMission(user, { board_offer_id: offer.offer_id });
  const missionId = launch.body.mission.id;
  // Jump the character far up-level (would raise a recomputed reward) mid-flight.
  entities.Character.update(ch.id, {
    level: 120,
    stats: { strength: 900, agility: 400, intellect: 300, vitality: 900, luck: 400 },
    experience_to_next_level: 10_000_000,
  });
  forceResolve(ch.id, missionId, "player");
  const claim = await ClaimMission(user, { mission_id: missionId });
  assert.equal(claim.body.won, true);
  assert.equal(claim.body.gains.experience, offer.preview_xp, "XP unchanged by level-up");
  assert.equal(claim.body.gains.stardust, offer.preview_stardust, "Stardust unchanged by level-up");
});

await testAsync("LOSS grants 50% XP/Stardust, no item, freezes pity, resolves + rotates", async () => {
  const { user, ch } = makeCharacter({ mission_gear_miss_streak: 3 });
  const board = await GetMissionBoard(user, {});
  const launchedIds = board.body.offers.map((o) => o.offer_id).sort();
  const offer = board.body.offers[0];
  const beforeStardust = entities.Character.get(ch.id).stardust;
  const launch = await LaunchMission(user, { board_offer_id: offer.offer_id });
  const missionId = launch.body.mission.id;

  forceResolve(ch.id, missionId, "opponent");
  const claim = await ClaimMission(user, { mission_id: missionId });
  assert.equal(claim.status, 200, claim.body?.error);
  assert.equal(claim.body.won, false);
  assert.equal(claim.body.gains.experience, Math.round(offer.preview_xp / 2), "50% XP on loss");
  assert.equal(claim.body.gains.stardust, Math.round(offer.preview_stardust / 2), "50% Stardust on loss");
  assert.deepEqual(claim.body.items, [], "no items on loss");
  assert.equal(claim.body.item_outcome, "NONE", "forced Nothing outcome");

  const after = entities.Character.get(ch.id);
  assert.equal(after.mission_gear_miss_streak, 3, "pity streak frozen on loss");
  assert.equal(after.stardust - beforeStardust, Math.round(offer.preview_stardust / 2), "wallet delta = 50% Stardust");
  assert.equal(after.active_mission_id, "", "mission slot freed");
  assert.equal(entities.Mission.get(missionId).status, "failed", "mission marked failed");

  // Board rotated: a fresh set of offers, different ids.
  const rotatedIds = claim.body.cantina_offers.map((o) => o.offer_id).sort();
  assert.equal(claim.body.cantina_offers.length, 3, "loss rotates to a new 3-offer board");
  assert.notDeepEqual(rotatedIds, launchedIds, "loss produces a new offer set");
});

await testAsync("WIN increments pity streak on a Nothing outcome; not frozen like loss", async () => {
  // A win with no gear should bump the pity streak (unchanged item/pity math).
  const { user, ch } = makeCharacter({ mission_gear_miss_streak: 0 });
  const board = await GetMissionBoard(user, {});
  const offer = board.body.offers[0];
  const launch = await LaunchMission(user, { board_offer_id: offer.offer_id });
  const missionId = launch.body.mission.id;
  forceResolve(ch.id, missionId, "player");
  const claim = await ClaimMission(user, { mission_id: missionId });
  assert.equal(claim.body.won, true);
  const after = entities.Character.get(ch.id);
  const gotGear = (claim.body.items || []).length > 0;
  if (gotGear) {
    assert.equal(after.mission_gear_miss_streak, 0, "gear drop resets streak");
  } else {
    assert.equal(after.mission_gear_miss_streak, 1, "no-gear win increments streak");
  }
});

await testAsync("Reroll only happens by resolving: reopen = same set, claim = new set", async () => {
  const { user, ch } = makeCharacter();
  const first = await GetMissionBoard(user, {});
  const firstIds = first.body.offers.map((o) => o.offer_id).sort();
  // Reopen / reroll flag → same board.
  const again = await GetMissionBoard(user, { reroll: true });
  assert.deepEqual(again.body.offers.map((o) => o.offer_id).sort(), firstIds, "reopen keeps the same board");

  const launch = await LaunchMission(user, { board_offer_id: first.body.offers[0].offer_id });
  forceResolve(ch.id, launch.body.mission.id, "player");
  const claim = await ClaimMission(user, { mission_id: launch.body.mission.id });
  const afterIds = claim.body.cantina_offers.map((o) => o.offer_id).sort();
  assert.notDeepEqual(afterIds, firstIds, "resolving rotates to a new board");
  // Subsequent reopen serves the rotated set.
  const post = await GetMissionBoard(user, {});
  assert.deepEqual(post.body.offers.map((o) => o.offer_id).sort(), afterIds, "post-claim board persists");
});

await testAsync("Generation uses authoritative duration pools (boundaries)", () => {
  assert.deepEqual(getAllowedMissionDurations(5), [30, 45, 60, 75]);
  assert.deepEqual(getAllowedMissionDurations(6), [30, 60, 90]);
  assert.deepEqual(getAllowedMissionDurations(7), [30, 60, 90]);
  assert.deepEqual(getAllowedMissionDurations(16), [300, 450, 600, 750]);
  assert.deepEqual(getAllowedMissionDurations(17), [300, 450, 600, 750]);
  assert.deepEqual(getAllowedMissionDurations(20), [300, 450, 600, 750, 900, 1050, 1200]);
  assert.deepEqual(getAllowedMissionDurations(21), [300, 600, 900, 1200]);
  assert.deepEqual(getAllowedMissionDurations(999), [300, 600, 900, 1200], "L21+ pool is permanent");
  // Every rolled duration is in-pool and launchable.
  for (const L of [1, 5, 6, 7, 16, 17, 20, 21, 100]) {
    const pool = getAllowedMissionDurations(L);
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const d = rollMissionDurationSeconds(L, u);
      assert.ok(pool.includes(d), `L${L} u${u} rolled ${d} off-pool`);
      assert.ok(isLaunchableMissionDuration(d), `L${L} rolled ${d} not launchable`);
    }
  }
});

await testAsync("Low-fuel remaining-duration edges preserved", () => {
  assert.equal(remainingFuelDurationSeconds(MISSION_MIN_FUEL - 0.01), null, "below min fuel → no offer");
  assert.equal(remainingFuelDurationSeconds(MISSION_MIN_FUEL), 15, "0.25 fuel → 15s");
  assert.equal(remainingFuelDurationSeconds(5), 300, "5 fuel → 5 min");
  assert.equal(remainingFuelDurationSeconds(9999), 1200, "huge fuel clamps to 20 min");
});

await testAsync("Low-fuel board is served when no normal offer is affordable", async () => {
  // 0.5 fuel cannot pay for any L8 normal-pool mission (cheapest = 1 min = 1 fuel).
  const { user } = makeCharacter({ level: 8, fuel: 0.5, max_fuel: 100 });
  const res = await GetMissionBoard(user, {});
  assert.ok(res.body.offers.length >= 1, "a low-fuel offer is served");
  for (const o of res.body.offers) {
    assert.ok(o.low_fuel, "served offers are low-fuel");
    assert.ok(o.fuel_cost <= 0.5 + 1e-9, `low-fuel cost ${o.fuel_cost} exceeds available fuel`);
    assert.ok(o.preview_xp > 0 && o.preview_stardust > 0, "low-fuel offer still finalized");
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
