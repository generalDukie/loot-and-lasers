/**
 * Phase 1 — live character progression foundation.
 * XPToNext, grants, 35/35/20/5/5 allocation, attrcost, high-level stress.
 */
import assert from "node:assert/strict";
import { xpToNext, freeLevelAttributes, classPrimaryIndex, attributePurchaseCost, STARTING_ATTRIBUTES, STARTING_NOVA, STARTING_STARDUST, FREE_FUEL_PER_GAME_DAY, maxHp, rawStandardAttack, critChance, dodgeChance, resistances, classArchetype } from "../../src/lib/productionMath/index.js";
import { expForLevel, getMissionXpPerFuel } from "../src/shared/rewards.js";
import {
  grantCharacterXp,
  allocateLevelUpAttributes,
  levelUpAttributeWeights,
  getStatPointsForLevel,
  getStatPointsForLevelRange,
  LEVEL_UP_ATTRS_PER_LEVEL,
  CLASS_PRIMARY_STAT,
  MAX_LEVELS_PER_XP_GRANT,
  reconstructProgressionState,
} from "../src/shared/characterProgression.js";
import { composePermanentAttributes } from "../../src/lib/characterStats.js";
import { CLASS_BASE_STATS, getAttributePointCost, FUEL_MAX } from "../src/shared/economyFormulas.js";
import { computeProductionSheetDerived } from "../src/shared/characterAttributes.js";

function starter(className = "Vanguard", extras = {}) {
  const stats = composePermanentAttributes({ class: className, level: 1, attribute_purchases_by_stat: {} });
  return {
    id: "c1",
    class: className,
    level: 1,
    experience: 0,
    experience_to_next_level: expForLevel(1),
    stats,
    attribute_purchases_by_stat: { strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0 },
    stardust: 0,
    ...extras,
  };
}

function sumAttrs(stats) {
  return ["strength", "agility", "intellect", "vitality", "luck"].reduce((s, k) => s + (stats[k] || 0), 0);
}

console.log("\nPhase 1 live character progression\n");

assert.equal(expForLevel(1), xpToNext(1));
assert.equal(expForLevel(1), 133);
assert.equal(expForLevel(50), xpToNext(50));
assert.equal(expForLevel(50), 63623);
assert.equal(expForLevel(100), 202397);
assert.notEqual(expForLevel(1) % 10, 0, "XP is 1:1, not forced multiples of 10");
assert.equal(getMissionXpPerFuel(1), 100);
assert.ok(MAX_LEVELS_PER_XP_GRANT >= 100_000, "safety guard is not a practical cap");

const classes = {
  Vanguard: STARTING_ATTRIBUTES.Might,
  "Astral Warden": STARTING_ATTRIBUTES.Might,
  "Shadow Operative": STARTING_ATTRIBUTES.Reflex,
  "Void Runner": STARTING_ATTRIBUTES.Reflex,
  Technomancer: STARTING_ATTRIBUTES.Tech,
  "Cosmic Engineer": STARTING_ATTRIBUTES.Tech,
};
for (const [cls, start] of Object.entries(classes)) {
  const named = CLASS_BASE_STATS[cls];
  assert.equal(named.strength, start.str, cls);
  assert.equal(named.agility, start.agi, cls);
  assert.equal(named.intellect, start.int, cls);
  assert.equal(named.vitality, start.vit, cls);
  assert.equal(named.luck, start.luck, cls);
  const composed = composePermanentAttributes({ class: cls, level: 1 });
  assert.deepEqual(composed, named);
  assert.equal(sumAttrs(composed), 50);
}
assert.equal(STARTING_NOVA, 500);
assert.equal(STARTING_STARDUST, 0);
assert.equal(FREE_FUEL_PER_GAME_DAY, 100);
assert.equal(FUEL_MAX, 100);

assert.throws(() => grantCharacterXp({ character: starter(), xpAmount: -1 }));
assert.throws(() => grantCharacterXp({ character: starter(), xpAmount: Number.NaN }));

const zero = grantCharacterXp({ character: starter(), xpAmount: 0 });
assert.equal(zero.progression.levels_gained, 0);

const below = grantCharacterXp({ character: starter(), xpAmount: 1 });
assert.equal(below.progression.levels_gained, 0);
assert.equal(below.patch.experience, 1);
assert.equal(below.patch.level, 1);
assert.equal(below.patch.experience_to_next_level, xpToNext(1));

const exactReq = expForLevel(1);
const exact = grantCharacterXp({ character: starter(), xpAmount: exactReq });
assert.equal(exact.progression.levels_gained, 1);
assert.equal(exact.patch.experience, 0);
assert.equal(exact.patch.level, 2);
assert.equal(exact.progression.attribute_awards.length, 2);
assert.equal(sumAttrs(exact.patch.stats), 52);
assert.equal(exact.patch.experience_to_next_level, xpToNext(2));

const leftover = grantCharacterXp({ character: starter(), xpAmount: exactReq + 5 });
assert.equal(leftover.progression.levels_gained, 1);
assert.equal(leftover.patch.experience, 5);

let multiXp = 0;
for (let L = 1; L <= 5; L++) multiXp += expForLevel(L);
const multi = grantCharacterXp({ character: starter(), xpAmount: multiXp });
assert.equal(multi.progression.levels_gained, 5);
assert.equal(multi.patch.level, 6);
assert.equal(multi.progression.attribute_awards.length, 10);
assert.equal(getStatPointsForLevelRange(1, 6), 10);
assert.equal(getStatPointsForLevel(2), LEVEL_UP_ATTRS_PER_LEVEL);
assert.equal(sumAttrs(multi.patch.stats), 50 + 10);

const huge = grantCharacterXp({ character: starter(), xpAmount: expForLevel(1) * 50 });
assert.ok(huge.progression.levels_gained >= 1);
assert.ok(Number.isFinite(huge.patch.experience));
assert.ok(Number.isFinite(huge.patch.level));
assert.ok(huge.patch.experience < huge.patch.experience_to_next_level);

for (const cls of Object.keys(CLASS_PRIMARY_STAT)) {
  const weights = levelUpAttributeWeights(cls);
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, `weights sum 1 for ${cls}`);
  assert.equal(weights[CLASS_PRIMARY_STAT[cls]], 0.35);
  assert.equal(weights.vitality, 0.35);
  assert.equal(weights.luck, 0.2);
}

const alloc = allocateLevelUpAttributes(starter("Vanguard"), 3);
assert.equal(alloc.awards.length, 6);
assert.equal(sumAttrs(alloc.stats), 56);

const checkLevels = [2, 10, 50, 100, 500, 800, 1500, 2000];
for (const L of checkLevels) {
  const primary = classPrimaryIndex("Vanguard");
  const free = freeLevelAttributes(L, primary);
  const freeTotal = free.reduce((s, n) => s + n, 0);
  assert.equal(freeTotal, 2 * (L - 1), `free attrs at L${L}`);
  const stats = composePermanentAttributes({ class: "Vanguard", level: L });
  assert.equal(sumAttrs(stats), 50 + 2 * (L - 1), `permanent total at L${L}`);
  const granted = grantCharacterXp({
    character: starter("Vanguard"),
    xpAmount: Array.from({ length: L - 1 }, (_, i) => expForLevel(i + 1)).reduce((s, n) => s + n, 0),
  });
  assert.equal(granted.patch.level, L, `grant to L${L}`);
  assert.equal(sumAttrs(granted.patch.stats), 50 + 2 * (L - 1));
  assert.equal(granted.patch.experience_to_next_level, xpToNext(L));
  assert.ok(granted.patch.experience < granted.patch.experience_to_next_level);
  const reloaded = { ...starter("Vanguard"), ...granted.patch };
  const again = reconstructProgressionState(reloaded);
  assert.equal(again.level, L);
  assert.equal(again.experience, granted.patch.experience);
  assert.deepEqual(again.stats, granted.patch.stats);
}

assert.equal(attributePurchaseCost(1), 100);
assert.equal(attributePurchaseCost(10), 112);
assert.equal(attributePurchaseCost(50), 260);
assert.equal(attributePurchaseCost(650), 111517);
assert.equal(getAttributePointCost(1), 10);
assert.equal(getAttributePointCost(2), 20);
assert.equal(getAttributePointCost(3), 40);
assert.equal(getAttributePointCost(4), 60);
assert.equal(getAttributePointCost(5), 80);
assert.equal(getAttributePointCost(6), attributePurchaseCost(1));
assert.equal(getAttributePointCost(6), 100);
assert.equal(getAttributePointCost(15), 112);
assert.equal(getAttributePointCost(55), 260);
assert.equal(getAttributePointCost(655), 111517);
assert.ok(getAttributePointCost(2505) > getAttributePointCost(1005));
assert.ok(Number.isFinite(getAttributePointCost(2505)));

const sheet = computeProductionSheetDerived(
  { strength: 15, agility: 8, intellect: 6, vitality: 14, luck: 7 },
  { class: "Vanguard", level: 1 },
);
assert.equal(sheet.health, maxHp(14));
assert.equal(sheet.damage, Math.trunc(Math.floor(rawStandardAttack(15) + 0.5)));
assert.ok(sheet.critChance >= 0 && sheet.critChance <= 30);
assert.ok(sheet.dodgeChance >= 0 && sheet.dodgeChance <= 25);
const resist = resistances(1, [15, 8, 6, 14, 7], classArchetype("Vanguard"));
assert.equal(sheet.armor, resist.might * 100);
assert.equal(sheet.techResist, resist.tech * 100);
assert.equal(dodgeChance(1, 8, "Might") * 100, sheet.dodgeChance);
assert.equal(critChance(1, 7) * 100, sheet.critChance);

const stale = reconstructProgressionState({
  class: "Vanguard",
  level: 10,
  experience: 999_999_999,
  experience_to_next_level: 12,
  stats: { strength: 1, agility: 1, intellect: 1, vitality: 1, luck: 1 },
  attribute_purchases_by_stat: { strength: 2, agility: 0, intellect: 0, vitality: 0, luck: 0 },
});
assert.equal(stale.level, 10);
assert.ok(stale.experience < stale.experience_to_next_level);
assert.equal(stale.experience_to_next_level, xpToNext(10));
assert.deepEqual(stale.stats, composePermanentAttributes({
  class: "Vanguard",
  level: 10,
  attribute_purchases_by_stat: stale.attribute_purchases_by_stat,
}));

const twice = grantCharacterXp({
  character: { ...starter(), ...exact.patch },
  xpAmount: 0,
});
assert.equal(twice.progression.levels_gained, 0);

console.log("PASS Phase 1 character progression");
