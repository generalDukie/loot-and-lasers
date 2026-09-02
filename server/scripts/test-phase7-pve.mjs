/**
 * Phase 7 Dungeon / Wormhole / Frontier aggregate suite.
 * Run: npm run test:phase7-pve
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-phase7-"));
process.env.DB_PATH = path.join(tmpDir, "phase7.db");

const { entities } = await import("../src/entities.js");
const { clock, installFakeClock, resetClockState } = await import("../src/shared/time/clock.js");
const {
  PrepareDungeonCombat,
  FinishDungeonBattle,
  ClaimPhase7Settlement,
  SkipDungeonCooldown,
  SyncDungeonState,
  ClaimWeeklyNovaQuest,
} = await import("../src/functions/economyFollowOn.js");
const {
  applyVictoryProgress,
  deriveDungeonTarget,
  emptyPhase7State,
  phase7MigrationPatch,
  readPhase7,
  wormholeUnlocked,
  standardClearTotal,
  dungeonCooldownRemainingMs,
  wormholeCooldownRemainingMs,
  buildCooldownPatchForContent,
  displayedCooldownRemainingMs,
  dungeonBadgeCount,
  PHASE7_CONTENT_DUNGEON,
  PHASE7_CONTENT_WORMHOLE,
  PHASE7_PVE_RULES_VERSION,
} = await import("../src/shared/dungeonService.js");
const {
  dungeonEncounterArchetype,
  dungeonScheduleTable,
  extraArchetypeIndex,
  groupArchetypeIndices,
  countArchetypes,
  scheduleChecksum,
  wormholeBandSchedule,
  wormholeEncounterArchetype,
} = await import("../../src/lib/dungeonArchetypeSchedule.js");
const {
  dungeonEnemyLevel,
  dungeonUnlockLevel,
  dungeonWormholeEnemyAttributeTotal,
  dungeonWormholeEnemyAttributes,
  dungeonEncounterXp,
  wormholeEncounterXp,
  projectedProgressionAfterXp,
  xpToNext,
  pveGearStatBudgetLevel,
  gearResaleValue,
  wormholeEnemyLevel,
  wormholeBandIndex,
  wormholeEncounterInBandIndex,
  expectedPlayerAttributes,
  frontierBonusPct,
  applyFrontierBonus,
  roundHalfUp,
  DUNGEON_WORMHOLE_REGULAR_EPA_MULT,
  DUNGEON_WORMHOLE_BOSS_EPA_MULT,
  DUNGEON_COUNT,
  DUNGEON_ENCOUNTERS_PER_DUNGEON,
  DUNGEON_STANDARD_TOTAL_CLEARS_FOR_WORMHOLE,
  PHASE7_ARCHETYPE_SCHEDULE_VERSION,
  PHASE7_DUNGEON_EXTRA_ARCHETYPE_START_INDEX,
  rollDungeonRegularRarity,
  rollDungeonBossRarity,
  DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT,
  PLAYER_COMBAT_CONTEXT_MULT,
} = await import("../../src/lib/productionMath/index.js");
const { generateDungeonEnemy, freezePhase7Settlement } = await import("../../src/lib/dungeonEngine.js");
const { dungeonBadgeCountFromClears, dungeonBadgeIdsFromClears, presentDungeonBadgeIds } = await import("../../src/lib/dungeonBadges.js");
const { getCollectionPercentage, applyXpBonus } = await import("../src/shared/collectionBonus.js");
const { SimulateCombat } = await import("../src/shared/combatService.js");
const { grantItemOrPending } = await import("../src/shared/inventoryGrant.js");
const { todayET } = await import("../src/shared/economyFormulas.js");

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

function sum(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

const fixturePath = path.resolve("src/lib/productionMath/fixtures/phase7-archetype-schedule.json");

console.log("\nPhase 7 Dungeon / Wormhole / Frontier\n");

test("all ten Dungeon unlock gates and enemy levels come from productionMath", () => {
  const unlocks = [10, 20, 30, 40, 50, 60, 70, 90, 120, 140];
  for (let d = 0; d < DUNGEON_COUNT; d++) {
    assert.equal(dungeonUnlockLevel(d), unlocks[d], `D${d + 1} unlock`);
    for (let e = 0; e < DUNGEON_ENCOUNTERS_PER_DUNGEON; e++) {
      assert.equal(dungeonEnemyLevel(d, e), generateDungeonEnemy({
        dungeonId: d + 1,
        encounterNumber: e + 1,
      }).level);
    }
  }
});

test("enemy 10 is boss; 1–9 are not", () => {
  for (let e = 1; e <= 10; e++) {
    const enemy = generateDungeonEnemy({ dungeonId: 1, encounterNumber: e });
    assert.equal(enemy.isBoss, e === 10);
  }
});

test("regular budget is 1.20× production EPA; boss is 1.30× not stacked", () => {
  for (const level of [1, 10, 19, 50, 100, 200, 800, 1000, 2500]) {
    const epa = expectedPlayerAttributes(level);
    const regular = dungeonWormholeEnemyAttributeTotal(level, false);
    const boss = dungeonWormholeEnemyAttributeTotal(level, true);
    assert.equal(regular, Math.max(1, roundHalfUp(epa * DUNGEON_WORMHOLE_REGULAR_EPA_MULT)));
    assert.equal(boss, Math.max(1, roundHalfUp(epa * DUNGEON_WORMHOLE_BOSS_EPA_MULT)));
    assert.notEqual(boss, roundHalfUp(regular * DUNGEON_WORMHOLE_BOSS_EPA_MULT));
    assert.ok(Number.isFinite(regular) && Number.isFinite(boss));
  }
});

test("locked 35/25/20/10/10 allocation sums to the integer budget", () => {
  for (const arch of [0, 1, 2]) {
    for (const isBoss of [false, true]) {
      const built = dungeonWormholeEnemyAttributes(100, isBoss, arch);
      assert.equal(sum(built.attributes), built.total);
    }
  }
});

test("archetype schedule is 4/3/3, max four, fair extra-slot, not Might-first", () => {
  assert.equal(PHASE7_DUNGEON_EXTRA_ARCHETYPE_START_INDEX, 1);
  const table = dungeonScheduleTable();
  const dungeonTotals = { Might: 0, Reflex: 0, Tech: 0 };
  for (let d = 0; d < DUNGEON_COUNT; d++) {
    const counts = countArchetypes(groupArchetypeIndices("dungeon", d));
    assert.equal(sum(counts), 10);
    assert.equal(Math.max(counts.Might, counts.Reflex, counts.Tech), 4);
    assert.ok(Object.values(counts).every((n) => n === 3 || n === 4));
    dungeonTotals.Might += counts.Might;
    dungeonTotals.Reflex += counts.Reflex;
    dungeonTotals.Tech += counts.Tech;
    assert.equal(extraArchetypeIndex("dungeon", d), (1 + d) % 3);
  }
  const totals = Object.values(dungeonTotals).sort((a, b) => b - a);
  assert.deepEqual(totals, [34, 33, 33]);
  assert.notEqual(dungeonTotals.Might, 34);

  for (let i = 0; i < DUNGEON_COUNT - 2; i++) {
    const cycle = { Might: 0, Reflex: 0, Tech: 0 };
    for (let g = 0; g < 3; g++) {
      const c = countArchetypes(groupArchetypeIndices("dungeon", i + g));
      cycle.Might += c.Might;
      cycle.Reflex += c.Reflex;
      cycle.Tech += c.Tech;
    }
    assert.deepEqual(cycle, { Might: 10, Reflex: 10, Tech: 10 });
  }

  const highBands = [0, 1, 9, 49, 1149, 4999];
  for (const b of highBands) {
    const counts = countArchetypes(groupArchetypeIndices("wormhole", b));
    assert.equal(Math.max(counts.Might, counts.Reflex, counts.Tech), 4);
    assert.equal(sum(counts), 10);
  }
  for (const b of [0, 100, 1000]) {
    const cycle = { Might: 0, Reflex: 0, Tech: 0 };
    for (let g = 0; g < 3; g++) {
      const c = countArchetypes(groupArchetypeIndices("wormhole", b + g));
      cycle.Might += c.Might;
      cycle.Reflex += c.Reflex;
      cycle.Tech += c.Tech;
    }
    assert.deepEqual(cycle, { Might: 10, Reflex: 10, Tech: 10 });
  }

  assert.equal(dungeonEncounterArchetype(0, 0), dungeonEncounterArchetype(0, 0));
  assert.equal(wormholeEncounterArchetype(0), wormholeBandSchedule(0)[0]);
  const payload = {
    version: PHASE7_ARCHETYPE_SCHEDULE_VERSION,
    dungeons: table,
    wormholeBands: [0, 1, 2, 9, 49, 1149].map((b) => wormholeBandSchedule(b)),
  };
  const checksum = scheduleChecksum(payload);
  if (fs.existsSync(fixturePath)) {
    const frozen = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    assert.equal(checksum, frozen.checksum, "archetype schedule checksum changed");
    assert.deepEqual(table, frozen.dungeons);
  } else {
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    fs.writeFileSync(fixturePath, `${JSON.stringify({ checksum, ...payload }, null, 2)}\n`);
  }
});

test("same stage archetype across character/class identities", () => {
  const a = generateDungeonEnemy({ dungeonId: 4, encounterNumber: 10 });
  const b = generateDungeonEnemy({ dungeonId: 4, encounterNumber: 10 });
  assert.equal(a.dungeonEnemyArchetype, b.dungeonEnemyArchetype);
  assert.deepEqual(a.stats, b.stats);
  assert.equal(a.suppressClassPassive, true);
});

test("Wormhole levels and bands are infinite production primitives", () => {
  assert.equal(wormholeEnemyLevel(0), 202);
  assert.equal(wormholeBandIndex(0), 1);
  assert.equal(wormholeEncounterInBandIndex(9), 9);
  assert.equal(wormholeBandIndex(10), 2);
  assert.equal(wormholeEncounterInBandIndex(10), 0);
  const l1000Index = (1000 - 202) / 2;
  assert.equal(wormholeEnemyLevel(l1000Index), 1000);
  assert.ok(wormholeEncounterXp(l1000Index) > 0);
  const l2500Index = (2500 - 202) / 2;
  assert.ok(Number.isFinite(wormholeEncounterXp(l2500Index)));
  assert.equal(wormholeBandIndex(10_000), Math.floor(10_000 / 10) + 1);
});

test("Frontier applies to XP only through production functions", () => {
  assert.equal(frontierBonusPct(100, 100), 0);
  assert.equal(frontierBonusPct(100, 101), 0);
  assert.equal(frontierBonusPct(110, 100), 0.5);
  assert.equal(frontierBonusPct(109, 100), 0.45);
  const base = dungeonEncounterXp(0, 0);
  assert.equal(applyFrontierBonus(base, 0), base);
  assert.equal(applyFrontierBonus(base, 0.5), roundHalfUp(base * 1.5));
});

test("rarity rollers use production 85/10/5 and 80/20 tables", () => {
  assert.equal(rollDungeonRegularRarity(() => 0), "rare");
  assert.equal(rollDungeonRegularRarity(() => 0.84), "rare");
  assert.equal(rollDungeonRegularRarity(() => 0.86), "epic");
  assert.equal(rollDungeonRegularRarity(() => 0.94), "epic");
  assert.equal(rollDungeonRegularRarity(() => 0.96), "legendary");
  assert.equal(rollDungeonBossRarity(() => 0), "epic");
  assert.equal(rollDungeonBossRarity(() => 0.79), "epic");
  assert.equal(rollDungeonBossRarity(() => 0.81), "legendary");
});

test("Phase 3 combat context is player ×1.0 / enemy ×1.10 once", () => {
  const enemy = generateDungeonEnemy({ dungeonId: 1, encounterNumber: 1 });
  const player = {
    id: "p",
    name: "Operative",
    class: "Vanguard",
    level: 25,
    stats: { strength: 40, agility: 30, intellect: 20, vitality: 40, luck: 20 },
  };
  let rngI = 0;
  const rng = () => {
    rngI += 1;
    return (rngI % 10) / 10;
  };
  const battle = SimulateCombat({
    player,
    opponent: enemy,
    playerItems: [],
    opponentItems: [],
    rng,
    mode: "dungeon",
  });
  assert.ok(battle.winner === "player" || battle.winner === "opponent");
  assert.ok(Array.isArray(battle.events));
  assert.equal(PLAYER_COMBAT_CONTEXT_MULT, 1);
  assert.equal(DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT, 1.1);
});

test("migration resets only Dungeon/Wormhole PvE fields", () => {
  const patch = phase7MigrationPatch();
  assert.equal(patch.phase7_pve.version, PHASE7_PVE_RULES_VERSION);
  assert.deepEqual(patch.phase7_pve.dungeon_clears, Array(10).fill(0));
  assert.equal(patch.dungeon_pending_combat, null);
});

test("victory progress is per-track and Wormhole is absolute", () => {
  let state = emptyPhase7State();
  state = applyVictoryProgress(state, { content: PHASE7_CONTENT_DUNGEON, dungeonId: 3, encounterNumber: 1 });
  assert.equal(state.dungeon_clears[2], 1);
  assert.equal(state.dungeon_clears[0], 0);
  state = applyVictoryProgress(state, { content: PHASE7_CONTENT_WORMHOLE, wormholeIndex: 9 });
  assert.equal(state.wormhole_next_index, 10);
  assert.equal(standardClearTotal(state), 1);
});

const user = {
  id: "phase7-user",
  email: "phase7@example.com",
  role: "user",
  active_character_id: "",
};

function makeChar(overrides = {}) {
  const created = entities.Character.create({
    name: overrides.name || "Phase7",
    class: overrides.class || "Vanguard",
    race: "Keldris",
    level: overrides.level || 200,
    experience: 0,
    experience_to_next_level: 1000,
    stardust: 0,
    nova_crystals: 200,
    economy_nova_scale: 2,
    stats: { strength: 50, agility: 40, intellect: 30, vitality: 50, luck: 30 },
    equipped_items: {},
    created_by_id: user.id,
    created_by: user.email,
    active_buffs: [],
    dungeon_deaths_date: todayET(),
    phase7_pve: Object.prototype.hasOwnProperty.call(overrides, "phase7_pve")
      ? overrides.phase7_pve
      : emptyPhase7State(),
    ...overrides.create,
  });
  user.active_character_id = created.id;
  return created;
}

await testAsync("Dungeons share one cooldown; Wormhole cooldown is independent", async () => {
  resetClockState();
  installFakeClock(3_000_000_000_000);
  const created = makeChar();
  const until = new Date(clock.nowMs() + 3_600_000).toISOString();
  entities.Character.update(created.id, {
    phase7_pve: {
      ...emptyPhase7State(),
      dungeon_cooldown_until: until,
    },
  });
  user.active_character_id = created.id;
  const blocked = await PrepareDungeonCombat(user, { dungeon_id: 1 });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.code, "DUNGEON_COOLDOWN");
  const all = Array(10).fill(10);
  entities.Character.update(created.id, {
    phase7_pve: {
      ...emptyPhase7State(),
      dungeon_clears: all,
      dungeon_cooldown_until: until,
    },
  });
  const wh = await PrepareDungeonCombat(user, { viewing_wormhole: true });
  assert.equal(wh.status, 200, wh.body?.error);
  assert.equal(wh.body.dungeon.dungeon_cooldown_active, true);
  assert.equal(wh.body.dungeon.wormhole_cooldown_active, true);
});

await testAsync("concurrent fill after launch parks frozen Gear for claim without reroll", async () => {
  resetClockState();
  installFakeClock(3_100_000_000_000);
  const created = makeChar({ level: 25 });
  user.active_character_id = created.id;
  const frozen = freezePhase7Settlement({
    won: true,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 1,
    playerLevelAtVictory: 25,
    className: "Vanguard",
    rng: () => 0.12,
    generateGear: () => ({
      name: "Parked Rifle",
      type: "weapon",
      rarity: "rare",
      stats: { strength: 11 },
      level: 25,
      origin: "dungeon",
      id: "parked-rifle-id",
    }),
  });
  for (let i = 0; i < 10; i++) {
    grantItemOrPending(entities.Character.get(created.id), {
      name: `Bag ${i}`,
      type: "helmet",
      rarity: "common",
      stats: { vitality: 1 },
      level: 1,
    });
  }
  entities.Character.update(created.id, {
    dungeon_pending_combat: {
      combat_id: "park-1",
      winner: "player",
      events: [],
      settlement: frozen,
      meta: { content: PHASE7_CONTENT_DUNGEON, dungeon_id: 1, encounter_number: 1 },
    },
    phase7_pve: emptyPhase7State(),
  });
  const finish = await FinishDungeonBattle(user, { combat_id: "park-1" });
  assert.equal(finish.status, 200, finish.body?.error);
  assert.equal((finish.body.items || []).length, 0);
  assert.equal(finish.body.pending_settlement.gear.name, "Parked Rifle");
  const blocked = await PrepareDungeonCombat(user, { dungeon_id: 1 });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "PHASE7_PENDING_SETTLEMENT");
  const one = entities.Item.filter({ character_id: created.id })[0];
  entities.Item.delete(one.id);
  const claim = await ClaimPhase7Settlement(user, { combat_id: "park-1" });
  assert.equal(claim.status, 200, claim.body?.error);
  assert.equal(claim.body.items[0].name, "Parked Rifle");
  const replay = await ClaimPhase7Settlement(user, { combat_id: "park-1" });
  assert.equal(replay.body.idempotent_replay, true);
  const named = entities.Item.filter({ character_id: created.id }).filter((i) => i.name === "Parked Rifle");
  assert.equal(named.length, 1);
});

await testAsync("Sync after migration does not infer 100 clears from D10 cursor", async () => {
  const created = makeChar({
    create: { dungeon_planet: 10, dungeon_enemy: 10, dungeon_clears: 9 },
    phase7_pve: null,
  });
  user.active_character_id = created.id;
  const res = await SyncDungeonState(user, {});
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.dungeon.standard_clears, 0);
  assert.equal(res.body.dungeon.wormhole.unlocked, false);
});

test("displayed cooldown counts down from the server remaining snapshot", () => {
  assert.equal(displayedCooldownRemainingMs({ remainingMsAtSync: 5_000, elapsedMs: 1_200 }), 3_800);
  assert.equal(displayedCooldownRemainingMs({ remainingMsAtSync: 500, elapsedMs: 2_000 }), 0);
  const dungeonLeft = displayedCooldownRemainingMs({ remainingMsAtSync: 4_000, elapsedMs: 1_000 });
  const wormholeLeft = displayedCooldownRemainingMs({ remainingMsAtSync: 9_000, elapsedMs: 1_000 });
  assert.equal(dungeonLeft, 3_000);
  assert.equal(wormholeLeft, 8_000);
  const refreshed = displayedCooldownRemainingMs({ remainingMsAtSync: 2_000, elapsedMs: 0 });
  assert.equal(refreshed, 2_000);
});

test("independent-track Dungeon badges; Wormhole does not add badges", () => {
  const none = [9, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(dungeonBadgeCountFromClears(none), 0);
  assert.deepEqual(dungeonBadgeIdsFromClears(none), []);
  const d7 = [0, 0, 0, 0, 0, 0, 10, 0, 0, 0];
  assert.equal(dungeonBadgeCountFromClears(d7), 1);
  assert.deepEqual(dungeonBadgeIdsFromClears(d7), ["D7"]);
  const tenth = [0, 0, 0, 0, 0, 0, 10, 0, 0, 0];
  assert.equal(dungeonBadgeCountFromClears(tenth), 1);
  assert.deepEqual(dungeonBadgeIdsFromClears(tenth), ["D7"]);
  const two = [10, 0, 0, 0, 0, 0, 10, 0, 0, 0];
  assert.equal(dungeonBadgeCountFromClears(two), 2);
  assert.deepEqual(dungeonBadgeIdsFromClears(two), ["D1", "D7"]);
  const d2d9 = [0, 10, 0, 0, 0, 0, 0, 0, 10, 0];
  assert.deepEqual(dungeonBadgeIdsFromClears(d2d9), ["D2", "D9"]);
  const all = Array(10).fill(10);
  assert.equal(dungeonBadgeCountFromClears(all), 10);
  assert.deepEqual(dungeonBadgeIdsFromClears(all), ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"]);
  const character = {
    phase7_pve: {
      version: PHASE7_PVE_RULES_VERSION,
      dungeon_clears: two,
      wormhole_next_index: 40,
    },
  };
  assert.equal(dungeonBadgeCount(character), 2);
  const freshNoDungeonBlob = {
    phase7_pve: { dungeon_clears: d7, wormhole_next_index: 12 },
  };
  assert.deepEqual(presentDungeonBadgeIds(freshNoDungeonBlob, null), ["D7"]);
  assert.equal(presentDungeonBadgeIds(freshNoDungeonBlob, null).length, 1);
  const pct = getCollectionPercentage(character, 0);
  const base = getCollectionPercentage({
    phase7_pve: {
      version: PHASE7_PVE_RULES_VERSION,
      dungeon_clears: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  }, 0);
  assert.ok(pct > base);
  assert.equal(applyXpBonus(100, pct) >= applyXpBonus(100, base), true);
});

test("victory Gear economic level is the projected post-XP level", () => {
  const pre = 10;
  const makeGear = (opts) => ({
    level: opts.economicLevel,
    level_requirement: opts.economicLevel,
    stat_budget_level: pveGearStatBudgetLevel(opts.economicLevel),
    type: "weapon",
    rarity: "rare",
    origin: opts.origin,
    sell_value: gearResaleValue(opts.economicLevel, "weapon", "rare"),
  });
  const noLevel = freezePhase7Settlement({
    won: true,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 1,
    playerLevelAtVictory: pre,
    experience: 0,
    className: "Vanguard",
    rng: () => 0.12,
    generateGear: makeGear,
  });
  const projectedNone = projectedProgressionAfterXp({
    level: pre,
    experience: 0,
    xpAmount: noLevel.final_xp,
  });
  assert.equal(noLevel.player_level_at_victory, pre);
  assert.equal(noLevel.gear_economic_level, projectedNone.level);
  assert.equal(noLevel.gear.level, projectedNone.level);
  if (projectedNone.levels_gained === 0) {
    assert.equal(noLevel.gear.level, pre);
  }

  const near = xpToNext(pre) - 1;
  const leveled = freezePhase7Settlement({
    won: true,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 1,
    playerLevelAtVictory: pre,
    experience: near,
    className: "Vanguard",
    rng: () => 0.12,
    generateGear: makeGear,
  });
  const projected = projectedProgressionAfterXp({
    level: pre,
    experience: near,
    xpAmount: leveled.final_xp,
  });
  assert.ok(projected.levels_gained >= 1);
  assert.equal(leveled.gear_economic_level, projected.level);
  assert.notEqual(leveled.gear_economic_level, pre);
  assert.equal(leveled.gear.stat_budget_level, pveGearStatBudgetLevel(projected.level));
  assert.equal(leveled.gear.sell_value, gearResaleValue(projected.level, "weapon", "rare"));
  assert.notEqual(leveled.gear.sell_value, gearResaleValue(pre, "weapon", "rare"));
  assert.equal(leveled.gear.stat_budget_level, pveGearStatBudgetLevel(projected.level));
  assert.notEqual(leveled.gear.level, leveled.gear.stat_budget_level);

  const replay = freezePhase7Settlement({
    won: true,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 1,
    playerLevelAtVictory: pre,
    experience: near,
    className: "Vanguard",
    rng: () => 0.12,
    generateGear: makeGear,
  });
  assert.deepEqual(replay.gear, leveled.gear);

  const multi = freezePhase7Settlement({
    won: true,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 1,
    playerLevelAtVictory: 1,
    experience: xpToNext(1) - 1,
    className: "Vanguard",
    rng: () => 0.12,
    generateGear: makeGear,
  });
  const projectedMulti = projectedProgressionAfterXp({
    level: 1,
    experience: xpToNext(1) - 1,
    xpAmount: multi.final_xp,
  });
  assert.equal(multi.gear_economic_level, projectedMulti.level);
  if (projectedMulti.levels_gained >= 2) {
    assert.ok(multi.gear_economic_level >= 3);
  }

  const wormhole = freezePhase7Settlement({
    won: true,
    content: PHASE7_CONTENT_WORMHOLE,
    wormholeIndex: 0,
    encounterNumber: 1,
    playerLevelAtVictory: pre,
    experience: near,
    className: "Vanguard",
    rng: () => 0.12,
    generateGear: makeGear,
  });
  const projectedWh = projectedProgressionAfterXp({
    level: pre,
    experience: near,
    xpAmount: wormhole.final_xp,
  });
  assert.equal(wormhole.origin, PHASE7_CONTENT_WORMHOLE);
  assert.equal(wormhole.gear_economic_level, projectedWh.level);
  assert.notEqual(wormhole.gear_economic_level, pre);
  assert.equal(wormhole.gear.stat_budget_level, pveGearStatBudgetLevel(projectedWh.level));
});

test("defeat keeps true enemy identity and grants nothing", () => {
  const regular = freezePhase7Settlement({
    won: false,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 3,
    playerLevelAtVictory: 25,
    rng: () => {
      throw new Error("defeat must not roll Gear");
    },
    generateGear: () => {
      throw new Error("defeat must not generate Gear");
    },
  });
  assert.equal(regular.enemy_level, dungeonEnemyLevel(0, 2));
  assert.equal(regular.is_boss, false);
  assert.ok(regular.archetype);
  assert.equal(regular.final_xp, 0);
  assert.equal(regular.gear, null);

  const boss = freezePhase7Settlement({
    won: false,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 2,
    encounterNumber: 10,
    playerLevelAtVictory: 25,
    rng: () => 0,
    generateGear: () => {
      throw new Error("boss defeat must not generate Gear");
    },
  });
  assert.equal(boss.enemy_level, dungeonEnemyLevel(1, 9));
  assert.equal(boss.is_boss, true);
  assert.equal(boss.encounter_number, 10);

  const wh = freezePhase7Settlement({
    won: false,
    content: PHASE7_CONTENT_WORMHOLE,
    wormholeIndex: 0,
    encounterNumber: 1,
    playerLevelAtVictory: 200,
    rng: () => 0,
    generateGear: () => {
      throw new Error("wormhole defeat must not generate Gear");
    },
  });
  assert.equal(wh.enemy_level, wormholeEnemyLevel(0));
  assert.equal(wh.is_boss, false);

  const whBoss = freezePhase7Settlement({
    won: false,
    content: PHASE7_CONTENT_WORMHOLE,
    wormholeIndex: 9,
    encounterNumber: 10,
    playerLevelAtVictory: 200,
    rng: () => 0,
    generateGear: () => {
      throw new Error("wormhole boss defeat must not generate Gear");
    },
  });
  assert.equal(whBoss.enemy_level, wormholeEnemyLevel(9));
  assert.equal(whBoss.is_boss, true);
  assert.equal(whBoss.band, wormholeBandIndex(9));
});

await testAsync("Dungeon victory does not progress weekly Nova dungeon objective", async () => {
  const created = makeChar({ level: 25 });
  user.active_character_id = created.id;
  entities.Character.update(created.id, {
    weekly_nova_quests: { week: "test-week", arena: 0, dungeon: 2, missions: 0, claimed: [] },
    phase7_pve: emptyPhase7State(),
  });
  const frozen = freezePhase7Settlement({
    won: true,
    content: PHASE7_CONTENT_DUNGEON,
    dungeonId: 1,
    encounterNumber: 1,
    playerLevelAtVictory: 25,
    experience: 0,
    className: "Vanguard",
    rng: () => 0.12,
    generateGear: () => ({
      name: "Weekly Check",
      type: "weapon",
      rarity: "rare",
      stats: { strength: 4 },
      level: 25,
      origin: "dungeon",
    }),
  });
  entities.Character.update(created.id, {
    dungeon_pending_combat: {
      combat_id: "weekly-check-1",
      winner: "player",
      events: [],
      settlement: frozen,
      meta: { content: PHASE7_CONTENT_DUNGEON, dungeon_id: 1, encounter_number: 1 },
    },
  });
  const finish = await FinishDungeonBattle(user, { combat_id: "weekly-check-1" });
  assert.equal(finish.status, 200, finish.body?.error);
  const live = entities.Character.get(created.id);
  assert.equal(live.weekly_nova_quests?.dungeon, 2);
  const claim = await ClaimWeeklyNovaQuest(user, { quest_id: "dungeon" });
  assert.equal(claim.status, 400);
  assert.equal(claim.body.code, "WEEKLY_QUEST_RETIRED");
});

void dungeonCooldownRemainingMs;
void wormholeCooldownRemainingMs;
void buildCooldownPatchForContent;
void createHash;
void SkipDungeonCooldown;
void FinishDungeonBattle;
void dungeonBadgeCountFromClears;
void dungeonBadgeIdsFromClears;
void presentDungeonBadgeIds;
void ClaimWeeklyNovaQuest;

resetClockState();
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
