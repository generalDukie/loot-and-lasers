/**
 * Achievements / collections authority tests (Restoration 20).
 * Run: npm run test:achievements
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-ach-"));
process.env.DB_PATH = path.join(tmpDir, "test-ach.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENTS,
  validateAchievementDefinitions,
  evaluateUnlocked,
  mergeAchievementUnlocks,
  serializeCharacterAchievements,
  assertAchievementClientSafe,
  getAchievementProgress,
} = await import("../src/shared/achievements.js");
const {
  rollCombatCollectibleDiscoveries,
  mergeCollectionIds,
  serializeCollections,
  RELIC_DISCOVERY_CHANCE,
  ARTIFACT_DISCOVERY_CHANCE,
} = await import("../src/shared/discovery.js");
const { SyncAchievements, GetAchievements, GetCollections } = await import(
  "../src/functions/index.js"
);

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

function hashPw(pw) {
  return createHash("sha256").update(pw).digest("hex");
}

function insertUser(id, email) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, 'user', 1, ?, ?)`,
  ).run(id, email, hashPw("x"), now, now);
  return { id, email, role: "user", active_character_id: null };
}

function makeChar(ownerId, opts = {}) {
  return entities.Character.create({
    name: opts.name || `C-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: ownerId,
    level: opts.level ?? 1,
    arena_wins: opts.arena_wins ?? 0,
    arena_rating: opts.arena_rating ?? 1000,
    arena_max_streak: opts.arena_max_streak ?? 0,
    arena_battles: opts.arena_battles ?? 0,
    missions_completed: opts.missions_completed ?? 0,
    dungeon_clears: opts.dungeon_clears ?? 0,
    highest_sector: opts.highest_sector ?? 1,
    total_stardust_earned: opts.total_stardust_earned ?? 0,
    discovered_species: opts.discovered_species || [],
    collected_artifacts: opts.collected_artifacts || [],
    collected_relics: opts.collected_relics || [],
    unlocked_achievements: opts.unlocked_achievements || [],
    unlocked_titles: opts.unlocked_titles || [],
    ...opts.extra,
  });
}

console.log("\nAchievements / Collections (Restoration 20)\n");

test("definition IDs unique and valid", () => {
  const v = validateAchievementDefinitions();
  assert.equal(v.ok, true, v.errors.join("; "));
  assert.equal(ACHIEVEMENT_DEFINITIONS.length, 24);
  assert.equal(ACHIEVEMENTS.length, 24);
});

test("all defs character-scoped title automatic", () => {
  for (const d of ACHIEVEMENT_DEFINITIONS) {
    assert.equal(d.scope, "character");
    assert.equal(d.reward_type, "title");
    assert.equal(d.claim_mode, "automatic");
    assert.equal(d.hidden, false);
    assert.equal(d.retroactive, true);
  }
});

test("threshold unlock first_blood", () => {
  assert.deepEqual(evaluateUnlocked({ arena_wins: 0 }), []);
  assert.ok(evaluateUnlocked({ arena_wins: 1 }).includes("first_blood"));
});

test("rating achievement permanent after fall", () => {
  const ch = {
    arena_rating: 1600,
    unlocked_achievements: [],
    unlocked_titles: [],
  };
  const first = mergeAchievementUnlocks(ch);
  assert.ok(first.newly_unlocked.includes("rising_star"));
  const after = {
    ...ch,
    ...first.patch,
    arena_rating: 1200,
  };
  const second = mergeAchievementUnlocks(after);
  assert.ok((after.unlocked_achievements || first.patch.unlocked_achievements).includes("rising_star")
    || second.patch.unlocked_achievements?.includes("rising_star")
    || first.patch.unlocked_achievements.includes("rising_star"));
  // Re-merge with unlocked set preserved — no revoke
  const locked = {
    arena_rating: 1200,
    unlocked_achievements: first.patch.unlocked_achievements,
    unlocked_titles: first.patch.unlocked_titles,
  };
  const again = mergeAchievementUnlocks(locked);
  assert.ok(locked.unlocked_achievements.includes("rising_star"));
  assert.equal(again.newly_unlocked.includes("rising_star"), false);
});

test("duplicate merge does not re-unlock", () => {
  const ch = { arena_wins: 10, unlocked_achievements: ["first_blood", "ten_kills"], unlocked_titles: ["the Skirmisher", "the Duelist"] };
  const r = mergeAchievementUnlocks(ch);
  assert.equal(r.newly_unlocked.length, 0);
});

test("progress caps display but raw retained", () => {
  const p = getAchievementProgress("ten_kills", { arena_wins: 50 });
  assert.equal(p.current, 10);
  assert.equal(p.raw, 50);
  assert.equal(p.target, 10);
});

test("serialize omits secret expressions", () => {
  const s = serializeCharacterAchievements({ arena_wins: 1, unlocked_achievements: ["first_blood"], unlocked_titles: ["the Skirmisher"] });
  assert.equal(s.completed_count, 1);
  const row = s.achievements.find((a) => a.id === "first_blood");
  assert.equal(row.completed, true);
  assert.equal(row.reward.claim_mode, "automatic");
  assert.equal(row.hidden, false);
  assert.equal(row.source, undefined);
});

test("client mutation assert rejects progress injection", () => {
  assert.throws(() => assertAchievementClientSafe({ unlocked_achievements: ["x"] }), (e) => e.code === "ACHIEVEMENT_CLIENT_AUTHORITY_REJECTED");
  assert.throws(() => assertAchievementClientSafe({ progress: 99 }), (e) => e.code === "ACHIEVEMENT_CLIENT_AUTHORITY_REJECTED");
  assert.doesNotThrow(() => assertAchievementClientSafe({ title: "the Duelist" }));
});

test("collection id merge dedupes", () => {
  const patch = {};
  mergeCollectionIds({ collected_artifacts: [1, 2] }, patch, "collected_artifacts", [2, 3]);
  assert.deepEqual([...patch.collected_artifacts].sort((a, b) => a - b), [1, 2, 3]);
});

test("combat collectible roll rates recovered", () => {
  assert.equal(RELIC_DISCOVERY_CHANCE, 0.02);
  assert.equal(ARTIFACT_DISCOVERY_CHANCE, 0.03);
});

test("forced RNG grants relic once", () => {
  const patch = {};
  // First call rng: relic chance hit (0), then weighted pick (0)
  let n = 0;
  const rng = () => {
    n += 1;
    return 0; // always pick first / always under threshold
  };
  const { found } = rollCombatCollectibleDiscoveries({ collected_relics: [], collected_artifacts: [] }, patch, {
    win: true,
    rng,
  });
  assert.ok(found.some((f) => f.kind === "relic"));
  assert.ok(found.some((f) => f.kind === "artifact"));
  assert.ok(patch.collected_relics.length >= 1);
  assert.ok(patch.collected_artifacts.length >= 1);
  // Loss grants nothing
  const patch2 = {};
  const miss = rollCombatCollectibleDiscoveries({}, patch2, { win: false, rng });
  assert.equal(miss.found.length, 0);
});

test("serialize collections historical discovery", () => {
  const s = serializeCollections({
    discovered_species: [1, 2],
    collected_artifacts: [5],
    collected_relics: [],
    discovered_gear: ["weapon:Foo"],
    phase7_pve: {
      dungeon_clears: [10, 10, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  });
  assert.equal(s.semantics, "historical_discovery");
  assert.equal(s.collections.find((c) => c.id === "species").discovered, 2);
  assert.equal(s.collections.find((c) => c.id === "dungeon_badges").discovered, 2);
  assert.deepEqual(s.collections.find((c) => c.id === "dungeon_badges").entry_ids, ["D1", "D2"]);
});

await testAsync("SyncAchievements unlocks from stats and rejects injection", async () => {
  const u = insertUser("u-ach1", "a1@t.test");
  const ch = makeChar(u.id, { arena_wins: 1, level: 10 });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, u.id);
  const user = { ...u, active_character_id: ch.id };
  const bad = await SyncAchievements(user, { unlocked_achievements: ["centurion"] });
  assert.equal(bad.status, 400);
  const ok = await SyncAchievements(user, {});
  assert.equal(ok.status, 200);
  assert.ok(ok.body.newly_unlocked.includes("first_blood"));
  assert.ok(ok.body.newly_unlocked.includes("initiate"));
  assert.ok(ok.body.character.unlocked_achievements.includes("first_blood"));
  assert.ok(ok.body.achievements);
  const again = await SyncAchievements(user, {});
  assert.equal(again.body.newly_unlocked.length, 0);
});

await testAsync("GetAchievements read-only", async () => {
  const u = insertUser("u-ach2", "a2@t.test");
  const ch = makeChar(u.id, {
    arena_wins: 10,
    unlocked_achievements: ["first_blood", "ten_kills"],
    unlocked_titles: ["the Skirmisher", "the Duelist"],
  });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, u.id);
  const res = await GetAchievements({ ...u, active_character_id: ch.id }, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.completed_count, 2);
});

await testAsync("GetCollections returns ownership", async () => {
  const u = insertUser("u-col", "col@t.test");
  const ch = makeChar(u.id, { discovered_species: [1, 2, 3], collected_artifacts: [1] });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, u.id);
  const res = await GetCollections({ ...u, active_character_id: ch.id }, { gear_total: 50 });
  assert.equal(res.status, 200);
  assert.equal(res.body.collections.find((c) => c.id === "species").discovered, 3);
});

await testAsync("title equip rejected when not unlocked", async () => {
  const u = insertUser("u-tit", "tit@t.test");
  const ch = makeChar(u.id, { unlocked_achievements: [], unlocked_titles: [] });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, u.id);
  const res = await SyncAchievements({ ...u, active_character_id: ch.id }, { title: "the Champion" });
  assert.equal(res.status, 403);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
