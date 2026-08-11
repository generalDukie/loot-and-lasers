/**
 * Mission preview authority consolidation.
 *
 * Proves Node is the single source of truth for gameplay-relevant mission board
 * values (duration, Fuel, XP, Stardust, efficiency) and that manipulated client
 * values cannot change what a mission actually costs or rewards.
 *
 * Run: npm run test:mission-board-authority
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-mission-board-"));
process.env.DB_PATH = path.join(tmpDir, "mission-board.db");

const { entities } = await import("../src/entities.js");
const { GetMissionBoard, LaunchMission } = await import("../src/functions/economy.js");
const {
  computeMissionXpFromFuel,
  computeMissionStardustFromFuel,
  getEffectiveMissionDuration,
  normalizeMissionEfficiency,
} = await import("../src/shared/economyFormulas.js");
const { isLaunchableMissionDuration } = await import("../../src/lib/missionDuration.js");

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
    id: `mb-user-${seq}`,
    email: `mb${seq}@example.com`,
    role: "user",
    active_character_id: "",
  };
  const ch = entities.Character.create({
    id: `mb-char-${seq}`,
    name: "Runner",
    class: "Vanguard",
    race: "Keldris",
    level: 8,
    experience: 0,
    experience_to_next_level: 100,
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

console.log("\nMission board authority + parity tests\n");

await testAsync("GetMissionBoard returns 3 authoritative offers and persists them", async () => {
  const { user, ch } = makeCharacter();
  const res = await GetMissionBoard(user, {});
  assert.equal(res.status, 200, res.body?.error);
  const offers = res.body.offers;
  assert.equal(offers.length, 3);
  for (const o of offers) {
    assert.ok(o.offer_id, "offer_id present");
    assert.ok(isLaunchableMissionDuration(o.duration_seconds), "launchable duration");
    assert.ok(o.fuel_cost > 0, "fuel_cost > 0");
    assert.ok(o.preview_xp > 0, "preview_xp > 0");
    assert.ok(o.preview_stardust > 0, "preview_stardust > 0");
    assert.ok(o.xp_efficiency > 0 && o.stardust_efficiency > 0, "efficiency present");
    // Requirement 1: item/rarity probabilities are NOT revealed to the client.
    assert.equal(o.rarity_weights, undefined, "rarity spread not exposed");
    assert.equal(o.gear_drop_chance, undefined, "gear probability not exposed");
  }
  // Requirement 5: no two simultaneous offers share an identical reward tuple.
  const tuples = offers.map((o) => `${o.fuel_cost}|${o.preview_xp}|${o.preview_stardust}`);
  assert.equal(new Set(tuples).size, tuples.length, "no duplicate (fuel, XP, Stardust) tuples");
  const stored = entities.Character.get(ch.id).mission_board;
  assert.ok(stored && Array.isArray(stored.offers) && stored.offers.length === 3, "board persisted");
  // Finalized reward integers are persisted on each stored offer.
  for (const o of stored.offers) {
    assert.ok(Number.isFinite(o.final_xp) && o.final_xp > 0, "final_xp stored");
    assert.ok(Number.isFinite(o.final_stardust) && o.final_stardust > 0, "final_stardust stored");
    assert.ok(Number.isFinite(o.fuel_cost) && o.fuel_cost > 0, "fuel_cost stored");
    assert.equal(o.character_level, stored.character_level, "level snapshot stored");
  }
});

await testAsync("Tutorial onboarding pins all 3 cantina offers to 30 seconds", async () => {
  const { user } = makeCharacter({
    level: 1,
    missions_completed: 0,
    onboarding_tutorial: {
      status: "active",
      step_id: "mission_pick",
      first_mission_bonus_eligible: true,
    },
  });
  const res = await GetMissionBoard(user, {});
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.offers.length, 3);
  for (const o of res.body.offers) {
    assert.equal(o.duration_seconds, 30, `${o.name} should be 30s during tutorial`);
  }
});

await testAsync("Displayed XP/Stardust equal Node's authoritative formulas (parity)", async () => {
  const { user, ch } = makeCharacter();
  const level = ch.level;
  const res = await GetMissionBoard(user, {});
  for (const o of res.body.offers) {
    const expectedXp = computeMissionXpFromFuel(o.fuel_cost, level, o.xp_efficiency);
    // Stardust now carries independent variance (its efficiency roll), applied on
    // top of the base. No ship mods / zero collection on a fresh character → the
    // only modifiers are the variance rolls themselves.
    const expectedSd = Math.round(
      computeMissionStardustFromFuel(o.fuel_cost, level) *
        normalizeMissionEfficiency(o.stardust_efficiency, level)
    );
    assert.equal(o.preview_xp, expectedXp, "XP preview matches settlement formula");
    assert.equal(o.preview_stardust, expectedSd, "Stardust preview matches settlement formula");
    assert.equal(
      o.display_duration_seconds,
      getEffectiveMissionDuration(ch, { duration_seconds: o.duration_seconds }),
      "display duration is authoritative effective duration"
    );
  }
});

await testAsync("Reconnect / page hop re-serves the SAME board (no reroll)", async () => {
  const { user } = makeCharacter();
  const first = await GetMissionBoard(user, {});
  const again = await GetMissionBoard(user, {});
  assert.deepEqual(
    again.body.offers.map((o) => o.offer_id),
    first.body.offers.map((o) => o.offer_id),
    "same offer ids on re-fetch"
  );
  assert.equal(again.body.board_generated_at, first.body.board_generated_at);
});

await testAsync("Reroll flag is ignored — same board returned", async () => {
  const { user } = makeCharacter();
  const first = await GetMissionBoard(user, {});
  const rerolled = await GetMissionBoard(user, { reroll: true });
  assert.deepEqual(
    rerolled.body.offers.map((o) => o.offer_id),
    first.body.offers.map((o) => o.offer_id),
    "reroll does not produce new offer ids"
  );
  assert.equal(rerolled.body.generated, false);
});

await testAsync("Launch by offer_id uses server duration/efficiency and locks the board", async () => {
  const { user, ch } = makeCharacter();
  const board = await GetMissionBoard(user, {});
  const offer = board.body.offers[0];
  const res = await LaunchMission(user, { board_offer_id: offer.offer_id });
  assert.equal(res.status, 200, res.body?.error);
  const mission = res.body.mission;
  assert.equal(
    mission.duration_seconds,
    getEffectiveMissionDuration(ch, { duration_seconds: offer.duration_seconds }),
    "mission uses authoritative effective duration"
  );
  assert.equal(mission.stardust_efficiency, normalizeMissionEfficiency(offer.stardust_efficiency, ch.level));
  assert.equal(mission.xp_efficiency, normalizeMissionEfficiency(offer.xp_efficiency, ch.level));
  const live = entities.Character.get(ch.id);
  assert.equal(live.mission_board_status, "locked_active", "board locked on launch");
  assert.ok(live.mission_board?.offers?.length === 3, "board kept while mission is active");
  assert.equal(live.active_mission_id, mission.id, "active mission set");
  const during = await GetMissionBoard(user, {});
  assert.equal(during.body.state, "ACTIVE_MISSION");
  assert.deepEqual(during.body.offers, [], "no replacement offers while active");
});

await testAsync("Launch IGNORES manipulated client duration/efficiency/name", async () => {
  const { user } = makeCharacter();
  const board = await GetMissionBoard(user, {});
  const offer = board.body.offers[0];
  const res = await LaunchMission(user, {
    board_offer_id: offer.offer_id,
    template: {
      name: "HAXX 20-minute jackpot",
      duration_seconds: 1200,
      fuel_cost: 0.25,
      stardust_efficiency: 9,
      xp_efficiency: 9,
      level_requirement: 1,
    },
  });
  assert.equal(res.status, 200, res.body?.error);
  const mission = res.body.mission;
  assert.equal(mission.name, offer.name, "client name ignored");
  assert.notEqual(mission.duration_seconds, 1200, "client 20-min duration rejected");
  assert.equal(
    mission.stardust_efficiency,
    normalizeMissionEfficiency(offer.stardust_efficiency, 8),
    "client efficiency ignored"
  );
  assert.ok(mission.stardust_efficiency <= 1.10, "efficiency stays within ±10% band");
});

await testAsync("Unknown offer_id is rejected (409)", async () => {
  const { user } = makeCharacter();
  await GetMissionBoard(user, {});
  const res = await LaunchMission(user, { board_offer_id: "off_does_not_exist" });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "OFFER_NOT_FOUND");
});

await testAsync("Level requirement gate rejects an over-level offer (403)", async () => {
  const { user, ch } = makeCharacter({ level: 5 });
  // Inject a persisted board with an over-level offer to exercise the gate.
  entities.Character.update(ch.id, {
    mission_board: {
      version: 3,
      generated_at: new Date().toISOString(),
      character_level: 5,
      offers: [
        {
          offer_id: "off_locked",
          name: "Endgame Raid",
          description: "",
          location: "",
          sector: 1,
          level_requirement: 99,
          duration_seconds: 60,
          stardust_efficiency: 1,
          xp_efficiency: 1,
          low_fuel: false,
        },
      ],
    },
  });
  const res = await LaunchMission(user, { board_offer_id: "off_locked" });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "LEVEL_TOO_LOW");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
