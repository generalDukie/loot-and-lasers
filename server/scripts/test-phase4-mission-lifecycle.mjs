/**
 * Phase 4 Mission live-path lifecycle: backpack, skip, launch/claim idempotency.
 * Run via npm run test:phase4-missions (composed runner).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-phase4-life-"));
process.env.DB_PATH = path.join(tmpDir, "phase4-life.db");

const { entities } = await import("../src/entities.js");
const {
  GetMissionBoard,
  LaunchMission,
  ClaimMission,
  SkipMission,
  PrepareMissionCombat,
} = await import("../src/functions/economy.js");
const { skipCostFor, getInventoryCap } = await import("../src/shared/economyFormulas.js");
const { countBagOccupancy } = await import("../src/shared/inventoryGrant.js");
const { getBalances } = await import("../src/shared/currencyService.js");
const { BACKPACK_UNEQUIPPED_ITEM_CAP } = await import("../../src/lib/productionMath/constants.js");

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
    id: `p4-user-${seq}`,
    email: `p4${seq}@example.com`,
    role: "user",
    active_character_id: "",
  };
  const ch = entities.Character.create({
    id: `p4-char-${seq}`,
    name: "Lifecycle",
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
    missions_completed: 1,
    stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
    equipped_items: {},
    created_by_id: user.id,
    created_by: user.email,
    ...overrides,
  });
  user.active_character_id = ch.id;
  return { user, ch };
}

function fillBackpack(ch, count) {
  for (let i = 0; i < count; i++) {
    entities.Item.create({
      id: `${ch.id}-bag-${i}-${Date.now()}-${i}`,
      name: `Filler ${i}`,
      type: "junk",
      rarity: "common",
      character_id: ch.id,
      owner_id: ch.created_by_id,
      is_equipped: false,
      locked: false,
      created_by_id: ch.created_by_id,
    });
  }
}

function forceReady(chId, missionId, winner = "player") {
  const past = new Date(Date.now() - 60_000).toISOString();
  entities.Mission.update(missionId, {
    end_time: past,
    combat_result: { combat_id: `forced-${missionId}`, winner, events: [] },
  });
  entities.Character.update(chId, { mission_end_time: past });
}

async function launchFirst(user) {
  const board = await GetMissionBoard(user, {});
  assert.equal(board.status, 200, board.body?.error);
  const offer = board.body.offers[0];
  const launch = await LaunchMission(user, { board_offer_id: offer.offer_id });
  return { offer, launch };
}

console.log("\nPhase 4 Mission lifecycle\n");

await testAsync("10/10 backpack rejects launch with Fuel unchanged", async () => {
  const { user, ch } = makeCharacter();
  fillBackpack(ch, BACKPACK_UNEQUIPPED_ITEM_CAP);
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), BACKPACK_UNEQUIPPED_ITEM_CAP);
  const fuelBefore = entities.Character.get(ch.id).fuel;
  const board = await GetMissionBoard(user, {});
  const offer = board.body.offers[0];
  const launch = await LaunchMission(user, { board_offer_id: offer.offer_id });
  assert.ok(launch.status >= 400, "launch must fail at 10/10");
  const live = entities.Character.get(ch.id);
  assert.equal(live.fuel, fuelBefore);
  assert.ok(!live.active_mission_id);
});

await testAsync("9/10 backpack allows launch", async () => {
  const { user, ch } = makeCharacter();
  fillBackpack(ch, BACKPACK_UNEQUIPPED_ITEM_CAP - 1);
  const { launch } = await launchFirst(user);
  assert.equal(launch.status, 200, launch.body?.error);
  assert.ok(launch.body.mission?.id);
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), BACKPACK_UNEQUIPPED_ITEM_CAP - 1);
});

await testAsync("active-mission fill to 10/10 blocks claim once; free slot then claims exactly once", async () => {
  const { user, ch } = makeCharacter();
  const { launch } = await launchFirst(user);
  assert.equal(launch.status, 200, launch.body?.error);
  const missionId = launch.body.mission.id;
  const remaining = getInventoryCap(ch) - countBagOccupancy(ch);
  fillBackpack(ch, remaining);
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), getInventoryCap(ch));
  forceReady(ch.id, missionId, "player");
  const blocked = await ClaimMission(user, { mission_id: missionId });
  assert.equal(blocked.status, 409, blocked.body?.error);
  assert.equal(blocked.body.code, "BACKPACK_FULL");
  const still = entities.Mission.get(missionId);
  assert.ok(still.status !== "claimed" && still.status !== "failed", `status=${still.status}`);
  const extra = entities.Item.filter({ character_id: ch.id }).find((i) => !i.is_equipped);
  entities.Item.delete(extra.id);
  const claim = await ClaimMission(user, { mission_id: missionId });
  assert.equal(claim.status, 200, claim.body?.error);
  const afterClaim = entities.Character.get(ch.id);
  const xpAfter = afterClaim.experience;
  const sdAfter = afterClaim.stardust;
  const replay = await ClaimMission(user, { mission_id: missionId });
  const live = entities.Character.get(ch.id);
  assert.ok(
    replay.status === 200 || replay.status === 409,
    `replay status ${replay.status}`,
  );
  assert.equal(live.experience, xpAfter, "replay must not grant XP again");
  assert.equal(live.stardust, sdAfter, "replay must not grant Stardust again");
  assert.ok(countBagOccupancy(live) <= getInventoryCap(live));
});

await testAsync("duplicate launch does not double Fuel debit or create two missions", async () => {
  const { user, ch } = makeCharacter();
  const board = await GetMissionBoard(user, {});
  const offer = board.body.offers[0];
  const fuelBefore = entities.Character.get(ch.id).fuel;
  const a = await LaunchMission(user, { board_offer_id: offer.offer_id });
  const b = await LaunchMission(user, { board_offer_id: offer.offer_id });
  assert.equal(a.status, 200, a.body?.error);
  assert.ok(b.status >= 400);
  const live = entities.Character.get(ch.id);
  const expectedFuel = Math.round((fuelBefore - a.body.mission.fuel_cost) * 100) / 100;
  assert.equal(live.fuel, expectedFuel);
  const missions = entities.Mission.filter({ character_id: ch.id });
  assert.equal(missions.filter((m) => m.status === "in_progress" || m.id === live.active_mission_id).length, 1);
});

await testAsync("Godot board_offer_id alias launches the persisted offer", async () => {
  const { user } = makeCharacter();
  const board = await GetMissionBoard(user, {});
  const offer = board.body.offers[0];
  const launch = await LaunchMission(user, { board_offer_id: offer.offer_id });
  assert.equal(launch.status, 200, launch.body?.error);
  assert.equal(launch.body.mission.fuel_cost, offer.fuel_cost);
});

await testAsync("skip at start charges original-Fuel Nova once; duplicate skip does not double-charge", async () => {
  const { user, ch } = makeCharacter({ nova_crystals: 20 });
  const { launch } = await launchFirst(user);
  const mission = launch.body.mission;
  const cost = skipCostFor(mission);
  assert.ok(cost > 0, `skip cost should be > 0, got ${cost}`);
  const novaBefore = getBalances(entities.Character.get(ch.id)).nova_crystals;
  const skip1 = await SkipMission(user, { mission_id: mission.id });
  assert.equal(skip1.status, 200, skip1.body?.error);
  const charged = Number(skip1.body.skip_cost ?? cost);
  const midNova = getBalances(entities.Character.get(ch.id)).nova_crystals;
  assert.ok(charged > 0, "skip must charge Nova");
  assert.ok(Math.abs((novaBefore - midNova) - charged) < 1e-9);
  const skip2 = await SkipMission(user, { mission_id: mission.id });
  const afterNova = getBalances(entities.Character.get(ch.id)).nova_crystals;
  assert.ok(Math.abs(afterNova - midNova) < 1e-9, "no second Nova debit");
  assert.ok(skip2.status === 200 || skip2.status >= 400);
});

await testAsync("concurrent skip requests debit Nova at most once", async () => {
  const { user, ch } = makeCharacter({ nova_crystals: 20 });
  const { launch } = await launchFirst(user);
  const mission = launch.body.mission;
  const cost = skipCostFor(mission);
  const novaBefore = getBalances(entities.Character.get(ch.id)).nova_crystals;
  const [a, b] = await Promise.all([
    SkipMission(user, { mission_id: mission.id }),
    SkipMission(user, { mission_id: mission.id }),
  ]);
  assert.ok(a.status === 200 || b.status === 200);
  const afterNova = getBalances(entities.Character.get(ch.id)).nova_crystals;
  const charged = Number((a.status === 200 ? a.body.skip_cost : b.body.skip_cost) ?? cost);
  assert.ok(Math.abs((novaBefore - afterNova) - charged) < 1e-9);
});

await testAsync("insufficient Nova and missing mission reject skip", async () => {
  const { user } = makeCharacter({ nova_crystals: 0, missions_completed: 1 });
  const { launch } = await launchFirst(user);
  const skip = await SkipMission(user, { mission_id: launch.body.mission.id });
  assert.ok(skip.status >= 400);
  const none = await SkipMission(user, { mission_id: "msn_none" });
  assert.ok(none.status >= 400);
});

await testAsync("PrepareMissionCombat is idempotent after skip", async () => {
  const { user } = makeCharacter();
  const { launch } = await launchFirst(user);
  const missionId = launch.body.mission.id;
  const skip = await SkipMission(user, { mission_id: missionId });
  assert.equal(skip.status, 200, skip.body?.error);
  const first = await PrepareMissionCombat(user, { mission_id: missionId });
  const second = await PrepareMissionCombat(user, { mission_id: missionId });
  assert.equal(first.status, 200, first.body?.error);
  assert.equal(second.status, 200, second.body?.error);
  assert.equal(first.body.combat_id, second.body.combat_id);
  assert.equal(second.body.replay, true);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
