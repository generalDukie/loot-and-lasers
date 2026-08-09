/**
 * Prompt 04 — character progression: XP curve, grants, multi-level, free attrs.
 */
import assert from "node:assert/strict";
import {
  expForLevel,
  XP_REQUIREMENT_MULTIPLIER,
  POST_200_A,
  POST_200_P,
  POST_200_B,
  POST_200_Q,
} from "../src/shared/rewards.js";
import {
  grantCharacterXp,
  allocateLevelUpAttributes,
  levelUpAttributeWeights,
  getStatPointsForLevel,
  getStatPointsForLevelRange,
  LEVEL_UP_ATTRS_PER_LEVEL,
  CLASS_PRIMARY_STAT,
  pickLevelUpAttribute,
} from "../src/shared/characterProgression.js";

function almostEqual(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

// ── XP requirement ───────────────────────────────────────────
assert.equal(XP_REQUIREMENT_MULTIPLIER, 1.35);
assert.equal(POST_200_A, 0.8);
assert.equal(POST_200_P, 0.48);
assert.equal(POST_200_B, 0.79);
assert.equal(POST_200_Q, 0.71);

const levels = [1, 5, 100, 200, 201, 500, 501, 700, 1000];
let prev = 0;
for (const L of levels) {
  const req = expForLevel(L);
  assert.ok(Number.isInteger(req) && req >= 1, `expForLevel(${L}) integer >= 1`);
  assert.equal(req % 10, 0, `game scale multiple at L${L}`);
  assert.ok(req >= prev, `monotonic at L${L}`);
  prev = req;
}
assert.ok(expForLevel(501) > expForLevel(500));
assert.ok(expForLevel(1000) > expForLevel(700));

// Design curve (no post200 at L1) × pacing (global 1.5× × early-game ~1.198) × 10 game scale.
const l1Base = Math.round(1.35 * 2.106 * (1 ** 1.532) * (1 + (1 / 266) ** 3.683));
const l1Units = Math.round(Math.max(1, l1Base) * 1.5 * (1 + 0.2 * (1 - 1 / 100)));
assert.equal(expForLevel(1), l1Units * 10);

// ── Grants ───────────────────────────────────────────────────
const starter = {
  id: "c1",
  class: "Vanguard",
  level: 1,
  experience: 0,
  experience_to_next_level: expForLevel(1),
  stats: { strength: 10, agility: 7, intellect: 6, vitality: 12, luck: 8 },
};

assert.throws(() => grantCharacterXp({ character: starter, xpAmount: -1 }));
assert.throws(() => grantCharacterXp({ character: starter, xpAmount: Number.NaN }));

const zero = grantCharacterXp({ character: starter, xpAmount: 0 });
assert.equal(zero.progression.levels_gained, 0);
assert.deepEqual(zero.patch, {});

const below = grantCharacterXp({ character: starter, xpAmount: 1, rng: () => 0 });
assert.equal(below.progression.levels_gained, 0);
assert.equal(below.patch.experience, 1);
assert.equal(below.patch.level, 1);

const exactReq = expForLevel(1);
const exact = grantCharacterXp({ character: starter, xpAmount: exactReq, rng: () => 0 });
assert.equal(exact.progression.levels_gained, 1);
assert.equal(exact.patch.experience, 0);
assert.equal(exact.patch.level, 2);
assert.equal(exact.progression.attribute_awards.length, 2);

const excess = grantCharacterXp({
  character: starter,
  xpAmount: exactReq + 50,
  rng: () => 0,
});
assert.equal(excess.progression.levels_gained, 1);
assert.equal(excess.patch.experience, 50);

// Multi-level: enough XP for several levels
let multiXp = 0;
for (let L = 1; L <= 5; L++) multiXp += expForLevel(L);
const multi = grantCharacterXp({
  character: starter,
  xpAmount: multiXp,
  rng: () => 0,
});
assert.equal(multi.progression.levels_gained, 5);
assert.equal(multi.patch.level, 6);
assert.equal(multi.progression.attribute_awards.length, 10);
assert.equal(getStatPointsForLevelRange(1, 6), 10);
assert.equal(getStatPointsForLevel(2), LEVEL_UP_ATTRS_PER_LEVEL);

// Large grant remains finite
const huge = grantCharacterXp({
  character: starter,
  xpAmount: expForLevel(1) * 50,
  rng: () => 0.99,
});
assert.ok(huge.progression.levels_gained >= 1);
assert.ok(Number.isFinite(huge.patch.experience));
assert.ok(Number.isFinite(huge.patch.level));

// ── Attribute allocation ─────────────────────────────────────
for (const cls of Object.keys(CLASS_PRIMARY_STAT)) {
  const weights = levelUpAttributeWeights(cls);
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  assert.ok(almostEqual(sum, 1), `weights sum 1 for ${cls}`);
  assert.equal(weights[CLASS_PRIMARY_STAT[cls]], 0.35);
  assert.equal(weights.vitality, 0.25);
  assert.equal(weights.luck, 0.2);
}

const fixed = allocateLevelUpAttributes(starter, 3, () => 0);
assert.equal(fixed.awards.length, 6);
const deltaStr =
  fixed.stats.strength -
  starter.stats.strength +
  (fixed.stats.agility - starter.stats.agility) +
  (fixed.stats.intellect - starter.stats.intellect) +
  (fixed.stats.vitality - starter.stats.vitality) +
  (fixed.stats.luck - starter.stats.luck);
assert.equal(deltaStr, 6);

const picks = new Set();
for (let i = 0; i < 200; i++) {
  picks.add(pickLevelUpAttribute("Technomancer"));
}
for (const p of picks) {
  assert.ok(["intellect", "vitality", "luck", "strength", "agility"].includes(p));
}

// Persistence-shaped: applying grant patch then reloading fields
const after = { ...starter, ...exact.patch };
assert.equal(after.level, 2);
assert.equal(after.experience, 0);
assert.ok(after.stats.strength >= starter.stats.strength);

console.log("PASS character progression");
