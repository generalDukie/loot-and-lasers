/**
 * Authoritative character XP grants + deterministic free attributes on level-up.
 * XP curve: productionMath.xpToNext. Allocation: productionMath.freeLevelAttributes.
 *
 * MAX_LEVELS_PER_XP_GRANT is a runaway-loop safety guard, not a gameplay level cap.
 * Production has no player-facing max level. L2000 is a validation horizon only.
 */
import {
  xpToNext,
  freeLevelAttributes,
  classPrimaryIndex,
  PLAYER_FREE_ATTR_WEIGHTS,
  FREE_ATTRS_PER_LEVEL_AFTER_1,
  projectedProgressionAfterXp,
  MAX_LEVELS_PER_XP_GRANT,
} from "./productionMath.js";
import {
  composePermanentAttributes,
  readPurchasesByStat,
} from "@/lib/characterStats.js";

export const LEVEL_UP_ATTRS_PER_LEVEL = FREE_ATTRS_PER_LEVEL_AFTER_1;
export { MAX_LEVELS_PER_XP_GRANT, projectedProgressionAfterXp };

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

export const LEVEL_UP_WEIGHT_PRIMARY = PLAYER_FREE_ATTR_WEIGHTS.primary;
export const LEVEL_UP_WEIGHT_VITALITY = PLAYER_FREE_ATTR_WEIGHTS.vitality;
export const LEVEL_UP_WEIGHT_LUCK = PLAYER_FREE_ATTR_WEIGHTS.luck;
export const LEVEL_UP_WEIGHT_OFF = PLAYER_FREE_ATTR_WEIGHTS.off1;

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
    [offs[1]]: PLAYER_FREE_ATTR_WEIGHTS.off2,
  });
}

function awardsFromFreeDelta(before, after) {
  const awards = [];
  for (let i = 0; i < ATTR_KEYS.length; i++) {
    const delta = Math.max(0, (after[i] || 0) - (before[i] || 0));
    for (let n = 0; n < delta; n++) awards.push({ stat: ATTR_KEYS[i] });
  }
  return awards;
}

/**
 * Recompute permanent stats at `fromLevel + levelsGained` from production components.
 * `rng` is ignored — allocation is deterministic (largest remainder).
 */
export function allocateLevelUpAttributes(character, levelsGained, _rng) {
  const from = Math.max(1, Math.floor(Number(character?.level) || 1));
  const n = Math.max(0, Math.floor(Number(levelsGained) || 0));
  const to = from + n;
  const primary = classPrimaryIndex(character?.class);
  const stats = composePermanentAttributes({ ...character, level: to });
  const awards = awardsFromFreeDelta(
    freeLevelAttributes(from, primary),
    freeLevelAttributes(to, primary),
  );
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
 * Rebuild derived progression caches without granting levels from stale leftover XP.
 * Used for development-data reconstruction after the Phase 0 curve/unit change.
 */
export function reconstructProgressionState(character) {
  const ch = character && typeof character === "object" ? character : {};
  const level = Math.max(1, Math.floor(Number(ch.level) || 1));
  const req = xpToNext(level);
  let experience = Math.max(0, Math.floor(Number(ch.experience) || 0));
  if (experience >= req) experience = Math.max(0, req - 1);
  const purchases = readPurchasesByStat(ch);
  const next = {
    ...ch,
    level,
    attribute_purchases_by_stat: purchases,
  };
  const stats = composePermanentAttributes(next);
  const purchaseTotal = ATTR_KEYS.reduce((sum, k) => sum + purchases[k], 0);
  return {
    level,
    experience,
    experience_to_next_level: req,
    stats,
    attribute_purchases_by_stat: purchases,
    attribute_purchases: purchaseTotal,
  };
}

/**
 * Authoritative XP grant with multi-level carryover + composed permanent attrs.
 * XP is 1:1 (no storage scale). Does not persist — callers write `result.patch`.
 * Always recomputes experience_to_next_level from xpToNext(level); never trusts stale storage.
 */
export function grantCharacterXp({
  character,
  xpAmount,
  source = "unknown",
} = {}) {
  const ch = character && typeof character === "object" ? character : {};
  const previousLevel = Math.max(1, Math.floor(Number(ch.level) || 1));
  const previousXp = Math.max(0, Math.floor(Number(ch.experience) || 0));
  const previousReq = xpToNext(previousLevel);

  const raw = Number(xpAmount);
  if (!Number.isFinite(raw) || raw < 0) {
    const err = new Error("Invalid XP amount");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const awarded = Math.floor(raw);

  const composedNow = composePermanentAttributes(ch);
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
    stats: composedNow,
  };

  if (awarded === 0) {
    const patch = {};
    if (Number(ch.experience_to_next_level) !== previousReq) {
      patch.experience_to_next_level = previousReq;
    }
    return { patch, progression };
  }

  const projected = projectedProgressionAfterXp({
    level: previousLevel,
    experience: previousXp,
    xpAmount: awarded,
  });
  const newExp = projected.experience;
  const newLevel = projected.level;
  const expToNext = projected.experience_to_next_level;
  const levelsGained = projected.levels_gained;
  const patch = {
    experience: newExp,
    level: newLevel,
    experience_to_next_level: expToNext,
  };

  const nextCharacter = { ...ch, level: newLevel };
  patch.stats = composePermanentAttributes(nextCharacter);
  const primary = classPrimaryIndex(ch.class);
  const awards = awardsFromFreeDelta(
    freeLevelAttributes(previousLevel, primary),
    freeLevelAttributes(newLevel, primary),
  );

  progression.level = newLevel;
  progression.levels_gained = levelsGained;
  progression.experience = newExp;
  progression.experience_to_next_level = expToNext;
  progression.attribute_awards = awards;
  progression.stats = { ...patch.stats };

  return { patch, progression };
}

/** Remove internal progression stash before persisting Character JSON. */
export function consumeProgression(patch) {
  if (!patch || typeof patch !== "object") return null;
  const progression = patch.__progression || null;
  delete patch.__progression;
  return progression;
}
