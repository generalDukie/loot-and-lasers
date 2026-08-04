/**
 * Authoritative character XP grants + permanent free attribute awards on level-up.
 * XP curve remains in rewards.js (expForLevel). This module owns the grant loop
 * and class-weighted permanent attribute allocation (Prompt 04).
 */
import crypto from "node:crypto";
import { expForLevel } from "./rewards.js";

export const LEVEL_UP_ATTRS_PER_LEVEL = 2;

export const ATTR_KEYS = Object.freeze([
  "strength",
  "agility",
  "intellect",
  "vitality",
  "luck",
]);

/** Primary combat attribute per player class (from live CLASSES mapping). */
export const CLASS_PRIMARY_STAT = Object.freeze({
  Vanguard: "strength",
  "Astral Warden": "strength",
  "Shadow Operative": "agility",
  "Void Runner": "agility",
  Technomancer: "intellect",
  "Cosmic Engineer": "intellect",
});

/**
 * Per-point weights for free permanent attrs on level-up.
 * 35% primary · 25% vitality · 20% luck · 10% / 10% remaining core offs.
 */
export const LEVEL_UP_WEIGHT_PRIMARY = 0.35;
export const LEVEL_UP_WEIGHT_VITALITY = 0.25;
export const LEVEL_UP_WEIGHT_LUCK = 0.2;
export const LEVEL_UP_WEIGHT_OFF = 0.1;

export function classPrimaryStat(className) {
  return CLASS_PRIMARY_STAT[className] || "strength";
}

export function levelUpAttributeWeights(className) {
  const primary = classPrimaryStat(className);
  const core = ["strength", "agility", "intellect"];
  const offs = core.filter((k) => k !== primary);
  while (offs.length < 2) offs.push("strength");
  return Object.freeze({
    [primary]: LEVEL_UP_WEIGHT_PRIMARY,
    vitality: LEVEL_UP_WEIGHT_VITALITY,
    luck: LEVEL_UP_WEIGHT_LUCK,
    [offs[0]]: LEVEL_UP_WEIGHT_OFF,
    [offs[1]]: LEVEL_UP_WEIGHT_OFF,
  });
}

export function defaultRng() {
  return crypto.randomInt(0, 1_000_000) / 1_000_000;
}

export function pickLevelUpAttribute(className, rng = defaultRng) {
  const weights = levelUpAttributeWeights(className);
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = (typeof rng === "function" ? rng() : Number(rng) || 0) * total;
  if (!Number.isFinite(roll) || roll < 0) roll = 0;
  for (const [stat, weight] of entries) {
    roll -= weight;
    if (roll < 0) return stat;
  }
  return entries[entries.length - 1][0];
}

/**
 * Award exactly `2 * levelsGained` permanent attribute points into stats.
 * Returns { stats, awards } where awards is [{ stat }, ...] in award order.
 */
export function allocateLevelUpAttributes(character, levelsGained, rng = defaultRng) {
  const n = Math.max(0, Math.floor(Number(levelsGained) || 0));
  const stats = {
    strength: 0,
    agility: 0,
    intellect: 0,
    vitality: 0,
    luck: 0,
    ...(character?.stats && typeof character.stats === "object" ? character.stats : {}),
  };
  const awards = [];
  const points = n * LEVEL_UP_ATTRS_PER_LEVEL;
  for (let i = 0; i < points; i++) {
    const stat = pickLevelUpAttribute(character?.class, rng);
    stats[stat] = (Number(stats[stat]) || 0) + 1;
    awards.push({ stat });
  }
  return { stats, awards };
}

/** Free permanent attrs awarded across a level range (for UI metadata). */
export function getStatPointsForLevel(_level) {
  return LEVEL_UP_ATTRS_PER_LEVEL;
}

export function getStatPointsForLevelRange(fromLevel, toLevel) {
  const from = Math.max(1, Math.floor(Number(fromLevel) || 1));
  const to = Math.max(from, Math.floor(Number(toLevel) || from));
  return (to - from) * LEVEL_UP_ATTRS_PER_LEVEL;
}

/**
 * Authoritative XP grant with multi-level carryover + permanent attrs.
 * Does not persist — callers write `result.patch` inside their transaction.
 */
export function grantCharacterXp({
  character,
  xpAmount,
  source = "unknown",
  rng = defaultRng,
} = {}) {
  const ch = character && typeof character === "object" ? character : {};
  const previousLevel = Math.max(1, Math.floor(Number(ch.level) || 1));
  const previousXp = Math.max(0, Math.floor(Number(ch.experience) || 0));
  const previousReq = Math.max(
    1,
    Math.floor(Number(ch.experience_to_next_level) || expForLevel(previousLevel)),
  );

  const raw = Number(xpAmount);
  if (!Number.isFinite(raw) || raw < 0) {
    const err = new Error("Invalid XP amount");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const awarded = Math.floor(raw);

  const progression = {
    source: String(source || "unknown"),
    previous_level: previousLevel,
    level: previousLevel,
    levels_gained: 0,
    previous_xp: previousXp,
    xp_awarded: awarded,
    experience: previousXp,
    experience_to_next_level: previousReq,
    attribute_awards: [],
    stats: ch.stats && typeof ch.stats === "object" ? { ...ch.stats } : {},
  };

  if (awarded === 0) {
    return { patch: {}, progression };
  }

  let newExp = previousXp + awarded;
  let newLevel = previousLevel;
  let expToNext = previousReq;
  let safety = 0;
  const maxLevels = 100_000;

  while (newExp >= expToNext) {
    if (!Number.isFinite(expToNext) || expToNext <= 0) {
      const err = new Error("Invalid XP requirement during level-up");
      err.status = 500;
      err.code = "INTERNAL_ERROR";
      throw err;
    }
    newExp -= expToNext;
    newLevel += 1;
    expToNext = expForLevel(newLevel);
    safety += 1;
    if (safety > maxLevels) {
      const err = new Error("XP level-up safety limit exceeded");
      err.status = 500;
      err.code = "INTERNAL_ERROR";
      throw err;
    }
  }

  newExp = Math.max(0, Math.floor(newExp));
  const levelsGained = newLevel - previousLevel;
  const patch = {
    experience: newExp,
    level: newLevel,
    experience_to_next_level: expToNext,
  };

  let awards = [];
  if (levelsGained > 0) {
    const allocated = allocateLevelUpAttributes(ch, levelsGained, rng);
    patch.stats = allocated.stats;
    awards = allocated.awards;
  }

  progression.level = newLevel;
  progression.levels_gained = levelsGained;
  progression.experience = newExp;
  progression.experience_to_next_level = expToNext;
  progression.attribute_awards = awards;
  progression.stats = patch.stats ? { ...patch.stats } : { ...(ch.stats || {}) };

  return { patch, progression };
}

/** Remove internal progression stash before persisting Character JSON. */
export function consumeProgression(patch) {
  if (!patch || typeof patch !== "object") return null;
  const progression = patch.__progression || null;
  delete patch.__progression;
  return progression;
}
