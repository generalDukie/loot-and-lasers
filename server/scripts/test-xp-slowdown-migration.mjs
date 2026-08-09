/**
 * Existing-character safety for the 1.5× + early-game XP-requirement slowdown.
 *
 * Verifies migrateXpRequirementSlowdown():
 *  - recomputes experience_to_next_level to the NEW curve for the current level
 *  - preserves accumulated experience and level (raising a requirement never
 *    grants a level; no XP created or destroyed)
 *  - resolves any (defensive) pending level-ups via authoritative carryover
 *  - is idempotent (guarded by app_meta)
 *
 * Uses a throwaway DB_PATH so the real game.db is never touched.
 *
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-xp-slowdown-migration.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDb = path.join(os.tmpdir(), `ll-xp-mig-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;

const { db, migrateXpRequirementSlowdown } = await import("../src/db.js");
const { expForLevel } = await import("../src/shared/rewards.js");
const { grantCharacterXp } = await import("../src/shared/characterProgression.js");

// OLD requirement (pre-slowdown): round(design × post200Growth) × 10.
function oldExpForLevel(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const design = Math.max(1, Math.round(1.35 * 2.106 * (L ** 1.532) * (1 + (L / 266) ** 3.683)));
  const post = 1 + 0.8 * Math.max(0, (L - 200) / 100) ** 0.48 + 0.79 * Math.max(0, (L - 200) / 100) ** 0.71;
  return Math.max(1, Math.round(design * post)) * 10;
}

function insertCharacter(id, data) {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO entities (id, type, data, created_by, created_by_id, created_date, updated_date) VALUES (?, 'Character', ?, ?, ?, ?, ?)",
  ).run(id, JSON.stringify({ ...data, id }), "u", "u", now, now);
}
function readCharacter(id) {
  const row = db.prepare("SELECT data FROM entities WHERE id = ? AND type = 'Character'").get(id);
  return JSON.parse(row.data);
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (err) { failed += 1; console.error(`  ✗ ${name}\n    ${err.stack || err.message}`); }
}

console.log("\nXP requirement slowdown — existing-character migration\n");

// Normal mid-level character stored under the OLD curve.
const L = 50;
insertCharacter("c-normal", {
  level: L,
  experience: oldExpForLevel(L) - 100, // < old requirement (invariant)
  experience_to_next_level: oldExpForLevel(L),
  stats: { strength: 20, agility: 10, intellect: 8, vitality: 25, luck: 12 },
});

// Fresh level-1 character with 0 XP.
insertCharacter("c-fresh", {
  level: 1,
  experience: 0,
  experience_to_next_level: oldExpForLevel(1),
  stats: { strength: 10, agility: 7, intellect: 6, vitality: 12, luck: 8 },
});

// Defensive: corrupted/admin character sitting on more XP than even the NEW req.
insertCharacter("c-overflow", {
  level: 10,
  experience: expForLevel(10) + expForLevel(11) + 25,
  experience_to_next_level: oldExpForLevel(10),
  stats: { strength: 15, agility: 9, intellect: 7, vitality: 18, luck: 10 },
});

const result = migrateXpRequirementSlowdown({ expForLevel, grantCharacterXp });

test("migration ran (not skipped) and updated all characters", () => {
  assert.equal(result.skipped, false);
  assert.equal(result.updated, 3);
});

test("normal character: requirement raised to new curve, XP/level preserved", () => {
  const c = readCharacter("c-normal");
  assert.equal(c.level, L, "level unchanged");
  assert.equal(c.experience, oldExpForLevel(L) - 100, "experience preserved exactly");
  assert.equal(c.experience_to_next_level, expForLevel(L), "requirement uses new curve");
  assert.ok(c.experience < c.experience_to_next_level, "no accidental level-up");
});

test("fresh level-1 character: requirement raised, still 0 XP at level 1", () => {
  const c = readCharacter("c-fresh");
  assert.equal(c.level, 1);
  assert.equal(c.experience, 0);
  assert.equal(c.experience_to_next_level, expForLevel(1));
});

test("overflow character: authoritative carryover, no XP lost", () => {
  const before = expForLevel(10) + expForLevel(11) + 25;
  const c = readCharacter("c-overflow");
  assert.ok(c.level > 10, `leveled up (was 10, now ${c.level})`);
  assert.equal(c.experience_to_next_level, expForLevel(c.level), "requirement matches new level");
  assert.ok(c.experience < c.experience_to_next_level, "leftover XP below next requirement");
  // Total XP conserved: consumed(levels gained) + leftover === original grant.
  let consumed = 0;
  for (let lv = 10; lv < c.level; lv++) consumed += expForLevel(lv);
  assert.equal(consumed + c.experience, before, "no XP created or destroyed");
});

test("migration is idempotent (second run skips)", () => {
  const second = migrateXpRequirementSlowdown({ expForLevel, grantCharacterXp });
  assert.equal(second.skipped, true);
});

// Cleanup temp DB files.
try {
  db.close?.();
  for (const suffix of ["", "-wal", "-shm"]) {
    const f = tmpDb + suffix;
    if (fs.existsSync(f)) fs.rmSync(f, { force: true });
  }
} catch { /* ignore */ }

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
