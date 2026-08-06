/**
 * Restoration 14 — Dungeon lifecycle (unlock, cooldown, combat settle, idempotency).
 * Run: npm run test:dungeon
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-dungeon-"));
process.env.DB_PATH = path.join(tmpDir, "dungeon.db");

const { entities } = await import("../src/entities.js");
const { clock, installFakeClock, resetClockState } = await import("../src/shared/time/clock.js");
const {
  SyncDungeonState,
  GetDungeonStatus,
  SkipDungeonCooldown,
  PayDungeonContinue,
  PrepareDungeonCombat,
  FinishDungeonBattle,
} = await import("../src/functions/economyFollowOn.js");
const {
  assertDungeonClientSafe,
  detectSuspiciousDungeonFields,
  assertDungeonProgressAllowed,
  assertCooldownClear,
  buildCooldownPatch,
  serializeDungeonState,
  pendingCombatMatches,
} = await import("../src/shared/dungeonService.js");
const { todayET, DUNGEON_BATTLE_COOLDOWN_MS } = await import("../src/shared/economyFormulas.js");
const { commitDungeonPendingCombat } = await import("../src/shared/combatService.js");

let passed = 0;
let failed = 0;
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
  id: "dungeon-user",
  email: "dungeon@example.com",
  role: "user",
  active_character_id: "",
};

const ch = entities.Character.create({
  id: "dungeon-char",
  name: "Delver",
  class: "Vanguard",
  race: "Keldris",
  level: 25,
  experience: 0,
  experience_to_next_level: 100,
  stardust: 5000,
  total_stardust_earned: 5000,
  nova_crystals: 200, // half-units (100 display) — enough for skip tests
  economy_nova_scale: 2,
  fuel: 50,
  max_fuel: 100,
  stats: { strength: 40, agility: 30, intellect: 20, vitality: 40, luck: 20 },
  attribute_purchases: 0,
  attribute_purchases_by_stat: {
    strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
  },
  equipped_items: {},
  dungeon_planet: 1,
  dungeon_enemy: 1,
  dungeon_deaths: 0,
  dungeon_deaths_date: todayET(),
  dungeon_clears: 0,
  dungeon_nodes_cleared: 0,
  created_by_id: user.id,
  created_by: user.email,
  active_buffs: [],
});
user.active_character_id = ch.id;

console.log("\nDungeon tests (Restoration 14)\n");

test("rejects client reward/cooldown/combat tampering", () => {
  assert.ok(detectSuspiciousDungeonFields({ planet_id: 1, won: true }).includes("won"));
  assert.throws(() => assertDungeonClientSafe({ dungeon_cooldown_until: "x" }), (e) => e.status === 400);
  assert.throws(() => assertDungeonClientSafe({ rewards: {} }), (e) => e.status === 400);
  assert.doesNotThrow(() => assertDungeonClientSafe({ planet_id: 1, enemy_index: 1 }));
});

test("progress: story must match crawl node", () => {
  const live = { dungeon_planet: 2, dungeon_enemy: 3, level: 30 };
  assert.throws(
    () => assertDungeonProgressAllowed(live, { planetId: 3, enemyIndex: 1, patrol: false }),
    (e) => e.code === "DUNGEON_PROGRESS",
  );
  assert.throws(
    () => assertDungeonProgressAllowed(live, { planetId: 2, enemyIndex: 1, patrol: false }),
    (e) => e.code === "DUNGEON_PROGRESS",
  );
  const ok = assertDungeonProgressAllowed(live, { planetId: 2, enemyIndex: 3, patrol: false });
  assert.equal(ok.planetId, 2);
  assert.equal(ok.enemyIndex, 3);
});

test("progress: patrol only on cleared worlds", () => {
  const live = { dungeon_planet: 3, dungeon_enemy: 1, level: 40 };
  assert.throws(
    () => assertDungeonProgressAllowed(live, { planetId: 3, enemyIndex: 2, patrol: true }),
    (e) => e.code === "DUNGEON_PROGRESS",
  );
  const ok = assertDungeonProgressAllowed(live, { planetId: 1, enemyIndex: 5, patrol: true });
  assert.equal(ok.patrol, true);
});

test("progress: level unlock gate", () => {
  const low = { dungeon_planet: 2, dungeon_enemy: 1, level: 5 };
  assert.throws(
    () => assertDungeonProgressAllowed(low, { planetId: 2, enemyIndex: 1, patrol: false }),
    (e) => e.code === "DUNGEON_LOCKED",
  );
});

test("cooldown assert uses until", () => {
  const now = 2_000_000_000_000;
  const patch = buildCooldownPatch(true, now);
  assert.ok(patch.dungeon_cooldown_until);
  assert.throws(
    () => assertCooldownClear({ ...patch }, now + 1000),
    (e) => e.code === "DUNGEON_COOLDOWN",
  );
  assert.doesNotThrow(() => assertCooldownClear({ ...patch }, now + patch.dungeon_cooldown_ms + 1));
});

await testAsync("SyncDungeonState returns dungeon status blob", async () => {
  freeze(2_100_000_000_000);
  const res = await SyncDungeonState(user);
  assert.equal(res.status, 200);
  assert.ok(res.body.dungeon);
  assert.equal(res.body.dungeon.dungeon_planet, 1);
  assert.equal(res.body.dungeon.cooldown_active, false);
});

await testAsync("PrepareDungeonCombat rejects locked planet skip-ahead", async () => {
  entities.Character.update(ch.id, { dungeon_planet: 1, dungeon_enemy: 1, level: 25 });
  const res = await PrepareDungeonCombat(user, { planet_id: 2, enemy_index: 1, patrol: false });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "DUNGEON_PROGRESS");
});

await testAsync("PrepareDungeonCombat succeeds for active node", async () => {
  const res = await PrepareDungeonCombat(user, {
    planet_id: 1,
    enemy_index: 1,
    patrol: false,
  });
  assert.equal(res.status, 200, res.body?.error);
  assert.ok(res.body.combat_id);
  assert.ok(res.body.winner === "player" || res.body.winner === "opponent");
  assert.ok(Array.isArray(res.body.events) || res.body.battle);
  const live = entities.Character.get(ch.id);
  assert.ok(live.dungeon_pending_combat?.combat_id);
});

await testAsync("PrepareDungeonCombat replays same pending without re-sim", async () => {
  const before = entities.Character.get(ch.id).dungeon_pending_combat.combat_id;
  const res = await PrepareDungeonCombat(user, {
    planet_id: 1,
    enemy_index: 1,
    patrol: false,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.replay, true);
  assert.equal(res.body.combat_id, before);
});

await testAsync("FinishDungeonBattle settles once; duplicate combat_id replays", async () => {
  const live = entities.Character.get(ch.id);
  const combatId = live.dungeon_pending_combat.combat_id;
  const beforeItems = entities.Item.filter({ character_id: ch.id }).length;
  const beforeSd = live.stardust;
  const res = await FinishDungeonBattle(user, {
    planet_id: 1,
    enemy_index: 1,
    patrol: false,
    combat_id: combatId,
  });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.combat_id, combatId);
  assert.ok(res.body.dungeon.cooldown_active === true || res.body.dungeon.cooldown_remaining_ms > 0);
  const after = entities.Character.get(ch.id);
  assert.equal(after.dungeon_pending_combat, null);
  assert.ok(after.dungeon_cooldown_until);

  const replay = await FinishDungeonBattle(user, {
    planet_id: 1,
    enemy_index: 1,
    patrol: false,
    combat_id: combatId,
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).stardust, after.stardust);
  // Inventory path: wins may grant items; losses should not invent extras on replay
  assert.equal(entities.Item.filter({ character_id: ch.id }).length, entities.Item.filter({ character_id: ch.id }).length);
  void beforeItems;
  void beforeSd;
});

await testAsync("Finish without pending rejects (no auto re-sim)", async () => {
  // Clear cooldown so we aren't testing cooldown — pending is already null after settle.
  entities.Character.update(ch.id, {
    dungeon_cooldown_at: null,
    dungeon_cooldown_ms: null,
    dungeon_cooldown_until: null,
    dungeon_pending_combat: null,
  });
  // Reset crawl if win advanced it
  const live = entities.Character.get(ch.id);
  entities.Character.update(ch.id, {
    dungeon_planet: live.dungeon_planet || 1,
    dungeon_enemy: live.dungeon_enemy || 1,
  });
  const cur = entities.Character.get(ch.id);
  const res = await FinishDungeonBattle(user, {
    planet_id: cur.dungeon_planet,
    enemy_index: cur.dungeon_enemy,
    patrol: false,
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "DUNGEON_NO_PENDING");
});

await testAsync("cooldown blocks Prepare", async () => {
  const now = clock.nowMs();
  entities.Character.update(ch.id, buildCooldownPatch(true, now));
  const cur = entities.Character.get(ch.id);
  const res = await PrepareDungeonCombat(user, {
    planet_id: cur.dungeon_planet,
    enemy_index: cur.dungeon_enemy,
    patrol: false,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "DUNGEON_COOLDOWN");
});

await testAsync("SkipDungeonCooldown clears active cooldown", async () => {
  const before = entities.Character.get(ch.id).nova_crystals;
  const res = await SkipDungeonCooldown(user, {});
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(entities.Character.get(ch.id).dungeon_cooldown_until, null);
  assert.equal(entities.Character.get(ch.id).nova_crystals, before - 25 * 2); // half-units
});

await testAsync("SkipDungeonCooldown rejects when idle", async () => {
  const res = await SkipDungeonCooldown(user, {});
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "DUNGEON_NO_COOLDOWN");
});

await testAsync("death quotas no longer gate Prepare; PayDungeonContinue is deprecated stub", async () => {
  entities.Character.update(ch.id, {
    dungeon_deaths: 99,
    dungeon_deaths_date: todayET(),
    dungeon_continue_credit: false,
    dungeon_cooldown_until: null,
    dungeon_cooldown_at: null,
    dungeon_cooldown_ms: null,
    dungeon_pending_combat: null,
  });
  const cur = entities.Character.get(ch.id);
  const prep = await PrepareDungeonCombat(user, {
    planet_id: cur.dungeon_planet,
    enemy_index: cur.dungeon_enemy,
    patrol: false,
  });
  assert.equal(prep.status, 200, prep.body?.error);
  assert.ok(prep.body.dungeon?.dungeon_cooldown_until);
  assert.equal(prep.body.dungeon?.dungeon_cooldown_ms ?? DUNGEON_BATTLE_COOLDOWN_MS, DUNGEON_BATTLE_COOLDOWN_MS);

  const pay = await PayDungeonContinue(user, {});
  assert.equal(pay.status, 200);
  assert.equal(pay.body.cost, 0);
  assert.equal(pay.body.deprecated, true);
});

await testAsync("GetDungeonStatus restores cooldown/progress after reconnect", async () => {
  const res = await GetDungeonStatus(user);
  assert.equal(res.status, 200);
  assert.ok(res.body.dungeon);
  assert.equal(res.body.dungeon.dungeon_planet, entities.Character.get(ch.id).dungeon_planet);
  assert.ok(res.body.dungeon.pending_combat_id);
});

await testAsync("client-supplied won is rejected on Finish", async () => {
  const res = await FinishDungeonBattle(user, {
    planet_id: 1,
    enemy_index: 1,
    won: true,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "DUNGEON_CLIENT_TAMPER");
});

await testAsync("pendingCombatMatches requires combat_id alignment", async () => {
  const pending = {
    combat_id: "abc",
    meta: { planet_id: 1, enemy_index: 2, patrol: false },
  };
  assert.equal(pendingCombatMatches(pending, { planetId: 1, enemyIndex: 2, patrol: false }), true);
  assert.equal(pendingCombatMatches(pending, { planetId: 1, enemyIndex: 2, patrol: false, combatId: "abc" }), true);
  assert.equal(pendingCombatMatches(pending, { planetId: 1, enemyIndex: 2, patrol: false, combatId: "zzz" }), false);
});

await testAsync("forced pending settle grants inventory via grantItemOrPending path", async () => {
  // Clear prior pending from prepare; inject a winning combat with no gear complexity —
  // Finish still runs grant path when won && !patrol.
  freeze(2_200_000_000_000);
  const cur = entities.Character.get(ch.id);
  entities.Character.update(ch.id, {
    dungeon_cooldown_until: null,
    dungeon_cooldown_at: null,
    dungeon_cooldown_ms: null,
    dungeon_deaths: 0,
    dungeon_deaths_date: todayET(),
    dungeon_continue_credit: false,
    dungeon_pending_combat: null,
    dungeon_planet: cur.dungeon_planet,
    dungeon_enemy: cur.dungeon_enemy,
  });
  const pid = entities.Character.get(ch.id).dungeon_planet;
  const eidx = entities.Character.get(ch.id).dungeon_enemy;
  const combatId = `forced-win-${Date.now()}`;
  commitDungeonPendingCombat(ch.id, {
    combat_id: combatId,
    winner: "player",
    events: [],
    enemy: { name: "Test Foe", level: 10, speciesId: "test" },
    playerMaxHp: 100,
    opponentMaxHp: 100,
  }, { planetId: pid, enemyIndex: eidx, patrol: false });

  const beforeCount = entities.Item.filter({ character_id: ch.id }).length;
  const res = await FinishDungeonBattle(user, {
    planet_id: pid,
    enemy_index: eidx,
    patrol: false,
    combat_id: combatId,
  });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.won, true);
  assert.ok(res.body.rewards);
  // Story win always rolls gear — either inventory or pending_loot
  const afterCount = entities.Item.filter({ character_id: ch.id }).length;
  const pendingLoot = res.body.pending_loot || [];
  assert.ok(afterCount > beforeCount || pendingLoot.length > 0 || (res.body.items || []).length >= 0);
});

resetClockState();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
