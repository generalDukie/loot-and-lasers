/**
 * Phase 7 Dungeon/Wormhole lifecycle — unlock, independent tracks, cooldowns, settle, idempotency.
 * Run: npm run test:dungeon
 *
 * Retired Restoration-14 assertions:
 * - Sequential planet cursor / DUNGEON_PROGRESS for later unlocked Dungeons
 * - Shared Dungeon/Wormhole cooldown
 * - Stardust/consumable rewards and collection-XP on victory
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
  ClaimPhase7Settlement,
} = await import("../src/functions/economyFollowOn.js");
const {
  assertDungeonClientSafe,
  detectSuspiciousDungeonFields,
  deriveDungeonTarget,
  emptyPhase7State,
  pendingCombatMatches,
  readPhase7,
  serializeDungeonState,
  wormholeUnlocked,
  PHASE7_CONTENT_DUNGEON,
  PHASE7_CONTENT_WORMHOLE,
  PHASE7_PVE_RULES_VERSION,
} = await import("../src/shared/dungeonService.js");
const { todayET, DUNGEON_BATTLE_COOLDOWN_MS, DUNGEON_SKIP_COST } = await import("../src/shared/economyFormulas.js");
const { freezePhase7Settlement } = await import("../../src/lib/dungeonEngine.js");
const { dungeonEncounterXp, DUNGEON_WORMHOLE_SKIP_NOVA, dungeonEnemyLevel } = await import("../../src/lib/productionMath/index.js");
const { grantItemOrPending } = await import("../src/shared/inventoryGrant.js");
const { getBalances } = await import("../src/shared/currencyService.js");

let passed = 0;
let failed = 0;

function freeze(ms) {
  resetClockState();
  installFakeClock(ms);
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

function phase7State(overrides = {}) {
  return {
    ...emptyPhase7State(),
    ...overrides,
    dungeon_clears: overrides.dungeon_clears || emptyPhase7State().dungeon_clears,
  };
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
  nova_crystals: 200,
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

function resetFightState(extra = {}) {
  const live = entities.Character.get(ch.id);
  return entities.Character.update(ch.id, {
    phase7_pve: phase7State(extra.phase7_pve || {}),
    dungeon_pending_combat: null,
    dungeon_cooldown_until: null,
    dungeon_cooldown_at: null,
    dungeon_cooldown_ms: null,
    wormhole_cooldown_until: null,
    level: extra.level ?? live.level,
    nova_crystals: extra.nova_crystals ?? live.nova_crystals,
    stardust: extra.stardust ?? live.stardust,
  });
}

console.log("\nPhase 7 Dungeon lifecycle\n");

test("rejects client reward/cooldown/combat tampering", () => {
  assert.ok(detectSuspiciousDungeonFields({ planet_id: 1, won: true }).includes("won"));
  assert.throws(() => assertDungeonClientSafe({ dungeon_cooldown_until: "x" }), (e) => e.status === 400);
  assert.throws(() => assertDungeonClientSafe({ rewards: {} }), (e) => e.status === 400);
  assert.throws(() => assertDungeonClientSafe({ gear: {} }), (e) => e.status === 400);
  assert.doesNotThrow(() => assertDungeonClientSafe({ planet_id: 1, enemy_index: 1 }));
});

test("independent tracks: later unlocked Dungeon is legal while earlier is incomplete", () => {
  const state = phase7State({ dungeon_clears: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  const d2 = deriveDungeonTarget(state, { level: 25 }, { content: PHASE7_CONTENT_DUNGEON, dungeonId: 2 });
  assert.equal(d2.dungeonId, 2);
  assert.equal(d2.encounterNumber, 1);
  assert.equal(d2.isBoss, false);
  assert.throws(
    () => deriveDungeonTarget(state, { level: 5 }, { content: PHASE7_CONTENT_DUNGEON, dungeonId: 2 }),
    (e) => e.code === "DUNGEON_LOCKED",
  );
});

test("completed Dungeon cannot be replayed; defeat does not clear", () => {
  const complete = phase7State({ dungeon_clears: [10, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  assert.throws(
    () => deriveDungeonTarget(complete, { level: 25 }, { content: PHASE7_CONTENT_DUNGEON, dungeonId: 1 }),
    (e) => e.code === "DUNGEON_COMPLETE",
  );
  const mid = phase7State({ dungeon_clears: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  const next = deriveDungeonTarget(mid, { level: 25 }, { content: PHASE7_CONTENT_DUNGEON, dungeonId: 1 });
  assert.equal(next.encounterNumber, 4);
});

test("99/100 does not unlock Wormhole; 100/100 does; D10-only does not", () => {
  const ninetyNine = phase7State({ dungeon_clears: [10, 10, 10, 10, 10, 10, 10, 10, 10, 9] });
  assert.equal(wormholeUnlocked(ninetyNine), false);
  assert.throws(
    () => deriveDungeonTarget(ninetyNine, { level: 200 }, { content: PHASE7_CONTENT_WORMHOLE }),
    (e) => e.code === "WORMHOLE_LOCKED",
  );
  const d10Only = phase7State({ dungeon_clears: [0, 0, 0, 0, 0, 0, 0, 0, 0, 10] });
  assert.equal(wormholeUnlocked(d10Only), false);
  const all = phase7State({ dungeon_clears: Array(10).fill(10) });
  assert.equal(wormholeUnlocked(all), true);
  const wh = deriveDungeonTarget(all, { level: 1 }, { content: PHASE7_CONTENT_WORMHOLE });
  assert.equal(wh.band, 1);
  assert.equal(wh.encounterNumber, 1);
  assert.equal(wh.wormholeIndex, 0);
});

test("pendingCombatMatches uses Phase 7 target identity", () => {
  const pending = {
    combat_id: "abc",
    meta: { content: PHASE7_CONTENT_DUNGEON, dungeon_id: 1, encounter_number: 2 },
  };
  assert.equal(pendingCombatMatches(pending, {
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 2,
  }), true);
  assert.equal(pendingCombatMatches(pending, {
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 3,
  }), false);
});

await testAsync("SyncDungeonState migrates disposable PvE state and exposes ten tracks", async () => {
  freeze(2_000_000_000_000);
  const res = await SyncDungeonState(user, {});
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.dungeon.tracks.length, 10);
  assert.equal(res.body.dungeon.standard_clear_total_required, 100);
  assert.equal(res.body.dungeon.wormhole.unlocked, false);
  assert.equal(res.body.dungeon.skip_cost, DUNGEON_SKIP_COST);
  assert.equal(DUNGEON_SKIP_COST, DUNGEON_WORMHOLE_SKIP_NOVA);
  const live = entities.Character.get(ch.id);
  assert.equal(live.phase7_pve.version, PHASE7_PVE_RULES_VERSION);
});

await testAsync("PrepareDungeonCombat accepts a later unlocked Dungeon while D1 is incomplete", async () => {
  resetFightState();
  const res = await PrepareDungeonCombat(user, { dungeon_id: 2 });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.dungeon_id, 2);
  assert.equal(res.body.enemy_index, 1);
  assert.equal(res.body.viewing_wormhole, false);
  assert.ok(res.body.combat_id);
  assert.ok(res.body.dungeon.dungeon_cooldown_active);
  assert.equal(res.body.dungeon.wormhole_cooldown_active, false);
});

await testAsync("PrepareDungeonCombat duplicate request_id replays the same combat", async () => {
  const first = await PrepareDungeonCombat(user, { dungeon_id: 2, request_id: "prep-d2-a" });
  assert.equal(first.status, 200, first.body?.error);
  const again = await PrepareDungeonCombat(user, { dungeon_id: 2, request_id: "prep-d2-a" });
  assert.equal(again.status, 200);
  assert.equal(again.body.combat_id, first.body.combat_id);
  assert.equal(again.body.idempotent_replay, true);
});

await testAsync("FinishDungeonBattle settles once; duplicate combat_id replays", async () => {
  const live = entities.Character.get(ch.id);
  const combatId = live.dungeon_pending_combat.combat_id;
  const beforeXp = live.experience || 0;
  const beforeSd = live.stardust;
  const res = await FinishDungeonBattle(user, { combat_id: combatId });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.combat_id, combatId);
  assert.equal(res.body.rewards.stardust, 0);
  const after = entities.Character.get(ch.id);
  assert.equal(after.dungeon_pending_combat, null);
  assert.equal(after.stardust, beforeSd);
  if (res.body.won) {
    assert.equal(res.body.rewards.base_experience, dungeonEncounterXp(1, 0));
    assert.equal((res.body.items || []).length + (res.body.pending_settlement ? 1 : 0), 1);
    assert.ok((after.experience || 0) >= beforeXp);
    assert.equal(readPhase7(after).dungeon_clears[1], 1);
  } else {
    assert.equal(res.body.rewards.experience, 0);
    assert.equal((res.body.items || []).length, 0);
    assert.equal(readPhase7(after).dungeon_clears[1], 0);
  }
  const replay = await FinishDungeonBattle(user, { combat_id: combatId });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).stardust, after.stardust);
  assert.equal(entities.Character.get(ch.id).experience, after.experience);
});

await testAsync("client-supplied won is rejected on Finish", async () => {
  const res = await FinishDungeonBattle(user, { won: true });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "DUNGEON_CLIENT_TAMPER");
});

await testAsync("SkipDungeonCooldown requires selector, costs 25 Nova, is idempotent", async () => {
  freeze(2_100_000_000_000);
  resetFightState({
    nova_crystals: 200,
    phase7_pve: {
      dungeon_cooldown_until: new Date(clock.nowMs() + DUNGEON_BATTLE_COOLDOWN_MS).toISOString(),
      wormhole_cooldown_until: new Date(clock.nowMs() + DUNGEON_BATTLE_COOLDOWN_MS).toISOString(),
    },
  });
  const missing = await SkipDungeonCooldown(user, {});
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, "DUNGEON_SKIP_SELECTOR");
  const beforeNova = getBalances(entities.Character.get(ch.id)).nova_crystals;
  const res = await SkipDungeonCooldown(user, { cooldown: "dungeon", request_id: "dskip_1" });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, beforeNova - DUNGEON_SKIP_COST);
  const live = entities.Character.get(ch.id);
  assert.equal(readPhase7(live).dungeon_cooldown_until, null);
  assert.ok(readPhase7(live).wormhole_cooldown_until);
  const again = await SkipDungeonCooldown(user, { cooldown: "dungeon", request_id: "dskip_1" });
  assert.equal(again.body.idempotent_replay, true);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, beforeNova - DUNGEON_SKIP_COST);
});

await testAsync("inactive skip rejects with no debit", async () => {
  resetFightState({ nova_crystals: 200 });
  const before = getBalances(entities.Character.get(ch.id)).nova_crystals;
  const res = await SkipDungeonCooldown(user, { cooldown: "dungeon", request_id: "dskip-none" });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "DUNGEON_NO_COOLDOWN");
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, before);
});

await testAsync("10/10 backpack rejects Prepare before combat or cooldown", async () => {
  resetFightState();
  for (const item of entities.Item.filter({ character_id: ch.id })) {
    entities.Item.delete(item.id);
  }
  const live = entities.Character.get(ch.id);
  for (let i = 0; i < 10; i++) {
    assert.ok(grantItemOrPending(live, {
      name: `Fill ${i}`,
      type: "helmet",
      rarity: "common",
      stats: { vitality: 1 },
      level: 1,
    }).item);
  }
  const beforeCd = readPhase7(entities.Character.get(ch.id)).dungeon_cooldown_until;
  const res = await PrepareDungeonCombat(user, { dungeon_id: 1 });
  assert.equal(res.status, 400, res.body?.error);
  assert.equal(res.body.code, "INVENTORY_FULL");
  const after = entities.Character.get(ch.id);
  assert.equal(after.dungeon_pending_combat, null);
  assert.equal(readPhase7(after).dungeon_cooldown_until, beforeCd);
});

await testAsync("forced victory freeze grants exactly one Gear and production XP", async () => {
  for (const item of entities.Item.filter({ character_id: ch.id })) {
    entities.Item.delete(item.id);
  }
  resetFightState();
  const frozen = freezePhase7Settlement({
    won: true,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 1,
    playerLevelAtVictory: 25,
    className: "Vanguard",
    rng: () => 0,
    generateGear: () => ({
      name: "Frozen Blade",
      type: "weapon",
      rarity: "rare",
      stats: { strength: 8 },
      level: 25,
      origin: "dungeon",
    }),
  });
  assert.equal(frozen.base_xp, dungeonEncounterXp(0, 0));
  assert.equal(frozen.gear.name, "Frozen Blade");
  entities.Character.update(ch.id, {
    dungeon_pending_combat: {
      combat_id: "forced-win-1",
      winner: "player",
      events: [],
      settlement: frozen,
      meta: { content: PHASE7_CONTENT_DUNGEON, dungeon_id: 1, encounter_number: 1 },
    },
  });
  const res = await FinishDungeonBattle(user, { combat_id: "forced-win-1" });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.won, true);
  assert.equal(res.body.rewards.stardust, 0);
  assert.equal((res.body.items || []).length, 1);
  assert.equal(res.body.items[0].name, "Frozen Blade");
  assert.equal(readPhase7(entities.Character.get(ch.id)).dungeon_clears[0], 1);
});

await testAsync("forced defeat grants zero rewards and does not advance", async () => {
  resetFightState({
    phase7_pve: { dungeon_clears: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  });
  const frozen = freezePhase7Settlement({
    won: false,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 2,
    playerLevelAtVictory: 25,
    className: "Vanguard",
    rng: () => {
      throw new Error("defeat must not roll Gear");
    },
    generateGear: () => {
      throw new Error("defeat must not generate Gear");
    },
  });
  assert.equal(frozen.gear, null);
  assert.equal(frozen.final_xp, 0);
  assert.equal(frozen.enemy_level, dungeonEnemyLevel(0, 1));
  assert.equal(frozen.is_boss, false);
  assert.ok(frozen.archetype);
  entities.Character.update(ch.id, {
    dungeon_pending_combat: {
      combat_id: "forced-loss-1",
      winner: "opponent",
      events: [],
      settlement: frozen,
      meta: { content: PHASE7_CONTENT_DUNGEON, dungeon_id: 1, encounter_number: 2 },
    },
  });
  const beforeXp = entities.Character.get(ch.id).experience || 0;
  const res = await FinishDungeonBattle(user, { combat_id: "forced-loss-1" });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.won, false);
  assert.equal(res.body.rewards.experience, 0);
  assert.equal(res.body.enemy.level, dungeonEnemyLevel(0, 1));
  assert.equal(res.body.enemy.is_boss, false);
  assert.equal((res.body.items || []).length, 0);
  assert.equal(entities.Character.get(ch.id).experience || 0, beforeXp);
  assert.equal(readPhase7(entities.Character.get(ch.id)).dungeon_clears[0], 1);
});

await testAsync("Finish of an older combat does not clear a newer pending combat", async () => {
  for (const item of entities.Item.filter({ character_id: ch.id })) {
    entities.Item.delete(item.id);
  }
  resetFightState({
    phase7_pve: emptyPhase7State(),
    nova_crystals: 200,
  });
  const first = await PrepareDungeonCombat(user, { dungeon_id: 1, request_id: "prep-old-a" });
  assert.equal(first.status, 200, first.body?.error);
  const combatA = first.body.combat_id;
  const settleA = await FinishDungeonBattle(user, { combat_id: combatA });
  assert.equal(settleA.status, 200, settleA.body?.error);
  const xpAfterA = entities.Character.get(ch.id).experience || 0;
  const clearsAfterA = readPhase7(entities.Character.get(ch.id)).dungeon_clears[0];
  entities.Character.update(ch.id, {
    phase7_pve: {
      ...readPhase7(entities.Character.get(ch.id)),
      dungeon_cooldown_until: null,
    },
    dungeon_cooldown_until: null,
  });
  const second = await PrepareDungeonCombat(user, { dungeon_id: 1, request_id: "prep-new-b" });
  assert.equal(second.status, 200, second.body?.error);
  const combatB = second.body.combat_id;
  assert.notEqual(combatB, combatA);
  const pendingB = structuredClone(entities.Character.get(ch.id).dungeon_pending_combat);
  const replayA = await FinishDungeonBattle(user, { combat_id: combatA });
  assert.equal(replayA.status, 200);
  assert.equal(replayA.body.idempotent_replay, true);
  assert.equal(replayA.body.combat_id, combatA);
  const livePending = entities.Character.get(ch.id).dungeon_pending_combat;
  assert.ok(livePending);
  assert.equal(livePending.combat_id, combatB);
  assert.equal(JSON.stringify(livePending.settlement), JSON.stringify(pendingB.settlement));
  assert.equal(entities.Character.get(ch.id).experience || 0, xpAfterA);
  const settleB = await FinishDungeonBattle(user, { combat_id: combatB });
  assert.equal(settleB.status, 200, settleB.body?.error);
  assert.equal(settleB.body.idempotent_replay, undefined);
  if (settleB.body.won) {
    assert.equal(readPhase7(entities.Character.get(ch.id)).dungeon_clears[0], clearsAfterA + 1);
  }
  const beforeUnknown = {
    xp: entities.Character.get(ch.id).experience || 0,
    pending: entities.Character.get(ch.id).dungeon_pending_combat,
    nova: getBalances(entities.Character.get(ch.id)).nova_crystals,
  };
  const unknown = await FinishDungeonBattle(user, { combat_id: "unknown-combat-id" });
  assert.ok(unknown.status === 409 || unknown.status === 400);
  assert.equal(entities.Character.get(ch.id).experience || 0, beforeUnknown.xp);
  assert.equal(
    JSON.stringify(entities.Character.get(ch.id).dungeon_pending_combat),
    JSON.stringify(beforeUnknown.pending),
  );
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, beforeUnknown.nova);
});

await testAsync("Skip request_id is required, retry-safe, and rejects conflicting activity", async () => {
  freeze(2_200_000_000_000);
  resetFightState({
    nova_crystals: 200,
    phase7_pve: {
      dungeon_cooldown_until: new Date(clock.nowMs() + DUNGEON_BATTLE_COOLDOWN_MS).toISOString(),
      wormhole_cooldown_until: new Date(clock.nowMs() + DUNGEON_BATTLE_COOLDOWN_MS).toISOString(),
    },
  });
  const missingId = await SkipDungeonCooldown(user, { cooldown: "dungeon" });
  assert.equal(missingId.status, 400);
  assert.equal(missingId.body.code, "MISSING_REQUEST_ID");
  const beforeNova = getBalances(entities.Character.get(ch.id)).nova_crystals;
  const first = await SkipDungeonCooldown(user, { cooldown: "dungeon", request_id: "lost-skip-1" });
  assert.equal(first.status, 200, first.body?.error);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, beforeNova - DUNGEON_SKIP_COST);
  const lost = await SkipDungeonCooldown(user, { cooldown: "dungeon", request_id: "lost-skip-1" });
  assert.equal(lost.body.idempotent_replay, true);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, beforeNova - DUNGEON_SKIP_COST);
  assert.equal(readPhase7(entities.Character.get(ch.id)).dungeon_cooldown_until, null);
  assert.ok(readPhase7(entities.Character.get(ch.id)).wormhole_cooldown_until);
  const conflict = await SkipDungeonCooldown(user, { cooldown: "wormhole", request_id: "lost-skip-1" });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "DUNGEON_SKIP_ID_CONFLICT");
  assert.ok(readPhase7(entities.Character.get(ch.id)).wormhole_cooldown_until);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, beforeNova - DUNGEON_SKIP_COST);
  const other = await SkipDungeonCooldown(user, { cooldown: "wormhole", request_id: "lost-skip-wh" });
  assert.equal(other.status, 200, other.body?.error);
  assert.equal(readPhase7(entities.Character.get(ch.id)).wormhole_cooldown_until, null);
  const cleared = await SkipDungeonCooldown(user, { cooldown: "dungeon", request_id: "skip-already-clear" });
  assert.equal(cleared.status, 400);
  assert.equal(cleared.body.code, "DUNGEON_NO_COOLDOWN");
  assert.equal(
    getBalances(entities.Character.get(ch.id)).nova_crystals,
    beforeNova - DUNGEON_SKIP_COST - DUNGEON_SKIP_COST,
  );
});

await testAsync("PayDungeonContinue remains a no-op", async () => {
  const res = await PayDungeonContinue(user, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.deprecated, true);
});

await testAsync("GetDungeonStatus exposes pending settlement identity", async () => {
  const res = await GetDungeonStatus(user, {});
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.dungeon.tracks));
  assert.equal(res.body.dungeon.battle_cooldown_ms, DUNGEON_BATTLE_COOLDOWN_MS);
});

void ClaimPhase7Settlement;
void serializeDungeonState;

resetClockState();
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
