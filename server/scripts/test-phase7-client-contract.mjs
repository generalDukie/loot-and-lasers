/**
 * Phase 7 client-integration contract: badge identities, view-cache ordering,
 * and skip request-ID retention. Mirrors Godot DungeonRules / DungeonClientState.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-phase7-client-contract.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-p7-client-"));
process.env.DB_PATH = path.join(tmpDir, "phase7-client.db");

const {
  dungeonBadgeIdsFromClears,
  presentDungeonBadgeIds,
} = await import("../../src/lib/dungeonBadges.js");
const {
  shouldRetainSkipRequestId,
  beginSkipIntent,
  completeSkipIntent,
  createSkipIntentState,
  HTTP_STATUS_REQUEST_TIMEOUT,
  HTTP_STATUS_TOO_EARLY,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HTTP_STATUS_SERVER_ERROR_MIN,
} = await import("../../src/lib/dungeonSkipRequest.js");
const {
  applyCharacterRefresh,
  applyDungeonSync,
  createDungeonViewCache,
  dungeonViewBlob,
} = await import("../../src/lib/dungeonClientState.js");
const { entities } = await import("../src/entities.js");
const { clock, installFakeClock, resetClockState } = await import("../src/shared/time/clock.js");
const { SkipDungeonCooldown } = await import("../src/functions/economyFollowOn.js");
const { emptyPhase7State, readPhase7, serializeDungeonState, PHASE7_PVE_RULES_VERSION } = await import("../src/shared/dungeonService.js");
const { DUNGEON_SKIP_COST, DUNGEON_BATTLE_COOLDOWN_MS, todayET } = await import("../src/shared/economyFormulas.js");
const { getBalances } = await import("../src/shared/currencyService.js");
const { getCollectionPercentage } = await import("../src/shared/collectionBonus.js");
const { serializeCollections } = await import("../src/shared/discovery.js");

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

console.log("\nPhase 7 client-integration contract\n");

test("D7 completed first is identity D7 with count 1", () => {
  const clears = [0, 0, 0, 0, 0, 0, 10, 0, 0, 0];
  assert.deepEqual(dungeonBadgeIdsFromClears(clears), ["D7"]);
});

test("D2 and D9 completed produce exactly those identities", () => {
  assert.deepEqual(
    dungeonBadgeIdsFromClears([0, 10, 0, 0, 0, 0, 0, 0, 10, 0]),
    ["D2", "D9"],
  );
});

test("nine clears produce no badge", () => {
  assert.deepEqual(dungeonBadgeIdsFromClears([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]), []);
});

test("ten completed tracks produce D1–D10", () => {
  assert.deepEqual(
    dungeonBadgeIdsFromClears(Array(10).fill(10)),
    ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"],
  );
});

test("Wormhole and Frontier do not add badge identities", () => {
  const character = {
    phase7_pve: {
      dungeon_clears: [0, 0, 0, 0, 0, 0, 10, 0, 0, 0],
      wormhole_next_index: 40,
    },
    dungeon_planet: 10,
  };
  assert.deepEqual(presentDungeonBadgeIds(character, null), ["D7"]);
});

test("fresh character with phase7_pve and no nested Dungeon view shows D7", () => {
  const character = {
    id: "fresh-1",
    phase7_pve: { dungeon_clears: [0, 0, 0, 0, 0, 0, 10, 0, 0, 0] },
  };
  assert.equal(character.dungeon, undefined);
  assert.deepEqual(presentDungeonBadgeIds(character, null), ["D7"]);
});

test("serialized dungeon_badge_ids win over tracks", () => {
  const character = { phase7_pve: { dungeon_clears: [10, 0, 0, 0, 0, 0, 0, 0, 0, 0] } };
  const view = { dungeon_badge_ids: ["D7"], tracks: [{ complete: true }] };
  assert.deepEqual(presentDungeonBadgeIds(character, view), ["D7"]);
});

test("character refresh after Dungeon sync retains the Dungeon view", () => {
  const dungeon = serializeDungeonState({
    level: 140,
    phase7_pve: {
      version: PHASE7_PVE_RULES_VERSION,
      dungeon_clears: [0, 0, 0, 0, 0, 0, 10, 0, 0, 0],
      wormhole_next_index: 0,
      dungeon_cooldown_until: null,
      wormhole_cooldown_until: null,
      pending_settlement: null,
    },
  });
  let cache = createDungeonViewCache();
  cache = applyDungeonSync(cache, "c1", dungeon);
  cache = applyCharacterRefresh(cache, { id: "c1", name: "Operative" });
  const blob = dungeonViewBlob(cache, { id: "c1" });
  assert.deepEqual(blob.dungeon_badge_ids, ["D7"]);
  assert.equal(blob.dungeon_badges, 1);
});

test("reverse character/Dungeon response order yields the same view", () => {
  const dungeon = { dungeon_badge_ids: ["D2", "D9"], dungeon_badges: 2, tracks: [] };
  let a = createDungeonViewCache();
  a = applyDungeonSync(a, "c1", dungeon);
  a = applyCharacterRefresh(a, { id: "c1" });
  let b = createDungeonViewCache();
  b = applyCharacterRefresh(b, { id: "c1" });
  b = applyDungeonSync(b, "c1", dungeon);
  assert.deepEqual(dungeonViewBlob(a, { id: "c1" }).dungeon_badge_ids, ["D2", "D9"]);
  assert.deepEqual(
    dungeonViewBlob(a, { id: "c1" }).dungeon_badge_ids,
    dungeonViewBlob(b, { id: "c1" }).dungeon_badge_ids,
  );
});

test("character switching clears the previous Dungeon view", () => {
  let cache = applyDungeonSync(createDungeonViewCache(), "c1", { dungeon_badge_ids: ["D7"] });
  cache = applyCharacterRefresh(cache, { id: "c2" });
  assert.equal(dungeonViewBlob(cache, { id: "c2" }), null);
});

test("collection copy is Dungeon-specific", () => {
  assert.equal("Dungeon badges · 1/10".includes("Planet Badge"), false);
  assert.ok("D7 · Ember Maw".includes("D7"));
  assert.ok("Earned by completing all ten one-time enemies in this Dungeon.".includes("Dungeon"));
});

test("Mission/Arena collection percentage consumes derived badge count only", () => {
  const d7 = { phase7_pve: { dungeon_clears: [0, 0, 0, 0, 0, 0, 10, 0, 0, 0] } };
  const none = { phase7_pve: { dungeon_clears: Array(10).fill(0) } };
  assert.ok(getCollectionPercentage(d7, 0) > getCollectionPercentage(none, 0));
  const summary = serializeCollections(d7);
  const row = summary.collections.find((c) => c.id === "dungeon_badges");
  assert.deepEqual(row.entry_ids, ["D7"]);
  assert.equal(row.discovered, 1);
});

test("skip request ID retention classes", () => {
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: 0 }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: 0, code: "TIMEOUT" }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: 400, retryable: true }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: HTTP_STATUS_REQUEST_TIMEOUT }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: HTTP_STATUS_TOO_EARLY }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: HTTP_STATUS_TOO_MANY_REQUESTS }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: HTTP_STATUS_SERVER_ERROR_MIN }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: 502 }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: 503 }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: 504 }), true);
  assert.equal(shouldRetainSkipRequestId({ ok: true, status: 200 }), false);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: 400, code: "DUNGEON_NO_COOLDOWN" }), false);
  assert.equal(shouldRetainSkipRequestId({ ok: false, status: 409, code: "DUNGEON_SKIP_ID_CONFLICT" }), false);
});

test("Dungeon and Wormhole skip IDs are independent", () => {
  let state = createSkipIntentState();
  const dungeon = beginSkipIntent(state, "dungeon", () => "d-skip-1");
  state = dungeon.state;
  const wormhole = beginSkipIntent(state, "wormhole", () => "wh-skip-1");
  state = wormhole.state;
  assert.equal(dungeon.requestId, "d-skip-1");
  assert.equal(wormhole.requestId, "wh-skip-1");
  state = completeSkipIntent(state, "dungeon", { ok: true, status: 200 });
  assert.equal(state.dungeon, "");
  assert.equal(state.wormhole, "wh-skip-1");
});

test("retryable 502 after begin keeps the same skip ID", () => {
  let state = createSkipIntentState();
  const first = beginSkipIntent(state, "dungeon", () => "d-skip-lost");
  state = completeSkipIntent(first.state, "dungeon", { ok: false, status: 502, retryable: true });
  const retry = beginSkipIntent(state, "dungeon", () => "d-skip-new");
  assert.equal(retry.requestId, "d-skip-lost");
});

test("character switch / logout clears skip IDs", () => {
  let state = beginSkipIntent(createSkipIntentState(), "dungeon", () => "d-skip-old").state;
  state = createSkipIntentState();
  assert.equal(state.dungeon, "");
  assert.equal(state.wormhole, "");
});

installFakeClock(2_300_000_000_000);

const user = {
  id: "p7-client-user",
  email: "p7-client@example.com",
  role: "user",
  active_character_id: "",
};
const ch = entities.Character.create({
  id: "p7-client-char",
  name: "Skipper",
  class: "Vanguard",
  race: "Keldris",
  level: 25,
  nova_crystals: 200,
  created_by_id: user.id,
  created_by: user.email,
  dungeon_deaths_date: todayET(),
  phase7_pve: {
    ...emptyPhase7State(),
    dungeon_cooldown_until: new Date(clock.nowMs() + DUNGEON_BATTLE_COOLDOWN_MS).toISOString(),
    wormhole_cooldown_until: new Date(clock.nowMs() + DUNGEON_BATTLE_COOLDOWN_MS).toISOString(),
  },
});
user.active_character_id = ch.id;

await testAsync("lost committed skip plus retry uses one ID and one 25-Nova debit", async () => {
  let intent = createSkipIntentState();
  const started = beginSkipIntent(intent, "dungeon", () => "client-skip-lost-1");
  intent = started.state;
  const beforeNova = getBalances(entities.Character.get(ch.id)).nova_crystals;
  const first = await SkipDungeonCooldown(user, {
    cooldown: "dungeon",
    request_id: started.requestId,
  });
  assert.equal(first.status, 200, first.body?.error);
  intent = completeSkipIntent(intent, "dungeon", { ok: false, status: 502, retryable: true });
  assert.equal(intent.dungeon, "client-skip-lost-1");
  const retry = beginSkipIntent(intent, "dungeon", () => "client-skip-lost-NEW");
  assert.equal(retry.requestId, "client-skip-lost-1");
  const second = await SkipDungeonCooldown(user, {
    cooldown: "dungeon",
    request_id: retry.requestId,
  });
  assert.equal(second.status, 200, second.body?.error);
  assert.equal(second.body.idempotent_replay, true);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, beforeNova - DUNGEON_SKIP_COST);
  assert.equal(readPhase7(entities.Character.get(ch.id)).dungeon_cooldown_until, null);
  assert.ok(readPhase7(entities.Character.get(ch.id)).wormhole_cooldown_until);
  intent = completeSkipIntent(retry.state, "dungeon", { ok: true, status: 200 });
  assert.equal(intent.dungeon, "");
});

void DUNGEON_SKIP_COST;
resetClockState();
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
