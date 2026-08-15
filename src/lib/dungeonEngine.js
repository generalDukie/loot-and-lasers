// ═══════════════════════════════════════════
// DUNGEON ENGINE — enemy generation + DRU rewards
// ═══════════════════════════════════════════
// 1 DRU = mission XP for 1 fuel at the enemy's level (Stardust from dungeons is 0).
//   Stardust = 0
//   XP       = ROUND(DRU × XP/F(enemyLevel) × 0.87 × 2.10)
import {
  RACES,
  generateItem,
  rollItemRarity,
  getMissionXpPerFuel,
} from "@/lib/gameData";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/lib/avatarFeatures";
import {
  dungeonEnemyAttributeBudget,
  pickMissionEnemyArchetype,
  distributeMissionEnemyAttributes,
  MISSION_ENEMY_ARCHETYPE_CLASS,
} from "@/lib/expectedPlayerAttributes";

export const DUNGEON_ENEMIES_PER_PLANET = 10;
export const STORY_DUNGEON_COUNT = 10;
/** @deprecated Death quotas removed — infinite retries with shared cooldown. */
export const DUNGEON_DEATHS_PER_DAY = 0;
/** @deprecated Continue fee removed with death quotas. */
export const DUNGEON_CONTINUE_COST = 0;
/** @deprecated use DUNGEON_CONTINUE_COST */
export const DUNGEON_REVIVE_COST = DUNGEON_CONTINUE_COST;
export const DUNGEON_EXTRA_LIFE_COST = DUNGEON_CONTINUE_COST;
/** Shared post-sim cooldown for all dungeon / wormhole fights (1 hour). */
export const DUNGEON_BATTLE_COOLDOWN_HOURS = 1;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
export const DUNGEON_BATTLE_COOLDOWN_MS = DUNGEON_BATTLE_COOLDOWN_HOURS * MILLISECONDS_PER_HOUR;
/** @deprecated use DUNGEON_BATTLE_COOLDOWN_MS */
export const DUNGEON_WIN_COOLDOWN_MS = DUNGEON_BATTLE_COOLDOWN_MS;
/** @deprecated use DUNGEON_BATTLE_COOLDOWN_MS */
export const DUNGEON_LOSS_COOLDOWN_MS = DUNGEON_BATTLE_COOLDOWN_MS;
export const DUNGEON_SKIP_COST = 25; // Nova crystals to skip the cooldown

/**
 * Dungeon DRU → XP conversion: 1 DRU = 2 fuel-equivalents of XP at the
 * enemy's level. Single authoritative balance constant.
 */
export const DUNGEON_XP_PER_DRU_MULTIPLIER = 2.0;

/** Total DRU budget per story dungeon (index = planet id 1–10). */
export const DUNGEON_TOTAL_DRU = [0, 40, 50, 60, 70, 95, 110, 125, 140, 155, 185];

/** Share of dungeon DRU per enemy slot (1–9 regular, 10 boss). Sums to 1.0. */
export const DUNGEON_ENEMY_DRU_SHARE = [
  0,
  0.05, 0.06, 0.07, 0.08, 0.09,
  0.1, 0.11, 0.12, 0.14, 0.18,
];

/**
 * Fixed enemy levels per story dungeon (rows = dungeon 1–10, cols = E1–E9 + Boss).
 * Design chart — combat power and DRU rates both key off these levels.
 */
export const DUNGEON_ENEMY_LEVELS = [
  null,
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  [30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
  [40, 42, 43, 45, 46, 48, 49, 51, 52, 54],
  [55, 57, 58, 60, 61, 63, 64, 66, 67, 69],
  [70, 72, 74, 76, 78, 80, 82, 84, 86, 88],
  [90, 93, 95, 98, 100, 103, 105, 108, 110, 113],
  [115, 118, 120, 123, 125, 128, 130, 133, 135, 138],
  [140, 143, 146, 149, 152, 155, 158, 161, 164, 167],
  [170, 173, 177, 180, 183, 187, 190, 193, 197, 200],
];

/**
 * Minimum PLAYER level to attempt each story dungeon (index = planet id 1–10).
 * Unlock ≠ recommended clear level — enemies keep their own fixed levels.
 */
export const DUNGEON_UNLOCK_LEVELS = Object.freeze([
  null, 10, 20, 30, 40, 50, 60, 70, 90, 120, 140,
]);

/** Player-level gate for story dungeon 1–10. Wormhole has no separate level gate. */
export function getDungeonUnlockLevel(planetId) {
  const id = Math.floor(Number(planetId) || 0);
  if (id >= 1 && id <= STORY_DUNGEON_COUNT) return DUNGEON_UNLOCK_LEVELS[id];
  return null;
}

/** True when playerLevel meets the unlock requirement for this planet (story 1–10). */
export function isDungeonUnlockedByLevel(planetId, playerLevel) {
  const unlock = getDungeonUnlockLevel(planetId);
  if (unlock == null) return true; // wormhole / unknown — not gated by this table
  return Math.max(1, Math.floor(Number(playerLevel) || 1)) >= unlock;
}

/** Relative offsets used to extend the L170–200 band into wormhole depths. */
const D10_LEVEL_OFFSETS = [0, 3, 7, 10, 13, 17, 20, 23, 27, 30];

const WORMHOLE_BASE_TOTAL_DRU = 185;
const WORMHOLE_DRU_PER_DEPTH = 25;
const WORMHOLE_BASE_ENEMY_LEVEL = 200;
const WORMHOLE_LEVELS_PER_DEPTH = 35;
const WORMHOLE_FIRST_ENEMY_LEVEL_OFFSET = 3;
const DRU_DECIMAL_SCALE = 100;
const DUNGEON_ENEMY_SEED_PLANET_MULTIPLIER = 1_000;
const DUNGEON_ENEMY_SEED_INDEX_MULTIPLIER = 37;
const DUNGEON_ENEMY_SEED_OFFSET = 7;
const DUNGEON_ENEMY_POWER_PER_LEVEL = 10;
const DUNGEON_ENEMY_POWER_PER_ATTRIBUTE = 3;
const DUNGEON_ENEMY_BASE_ARENA_RATING = 1_000;
const DUNGEON_ENEMY_ARENA_RATING_PER_LEVEL = 10;
const AVATAR_SPECIES_COUNT = 30;
const AVATAR_SPECIES_PLANET_MULTIPLIER = 13;
const AVATAR_SPECIES_ENCOUNTER_MULTIPLIER = 7;
const BOSS_RARITY_TIER_SIZE = 3;
const BOSS_MAX_RARITY_TIER_INDEX = 3;
const BOSS_RARITIES = ["rare", "epic", "epic", "legendary"];
const REGULAR_ENEMY_ITEM_DROP_CHANCE = 0.25;
const REGULAR_ENEMY_UNCOMMON_BASE_CHANCE = 0.12;

const FALLBACK_NAMES = [
  "Vrax'Nok", "Zyx-7", "Kaelith", "Drogath", "Nebulon", "Zyr'kara", "Cygnus",
  "Mordok", "Lyra-9", "Threx", "Zarvok", "Pixie-Δ", "Garrak", "Sylph",
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function sumStats(s) { return (s.strength || 0) + (s.agility || 0) + (s.intellect || 0) + (s.vitality || 0) + (s.luck || 0); }

function pickRace(planet, isBoss, rng) {
  if (isBoss && planet.bossRace && RACES[planet.bossRace]) return planet.bossRace;
  const pool = (planet.races || []).filter((r) => RACES[r]);
  return pool.length ? pick(pool, rng) : pick(Object.keys(RACES), rng);
}

/** Story band 1–10, or extrapolated wormhole band (>10). */
export function getDungeonBand(planetId) {
  return Math.max(1, Math.floor(planetId || 1));
}

/** Total DRU for a dungeon band (wormhole grows past D10). */
export function getDungeonTotalDru(planetId) {
  const band = getDungeonBand(planetId);
  if (band <= STORY_DUNGEON_COUNT) return DUNGEON_TOTAL_DRU[band];
  const depth = band - STORY_DUNGEON_COUNT;
  return Math.round(WORMHOLE_BASE_TOTAL_DRU + depth * WORMHOLE_DRU_PER_DEPTH);
}

/** DRU awarded for defeating enemyIndex (1–10) on this planet. */
export function getEnemyDru(planetId, enemyIndex) {
  const idx = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, enemyIndex || 1));
  const share = DUNGEON_ENEMY_DRU_SHARE[idx];
  return Math.round(getDungeonTotalDru(planetId) * share * DRU_DECIMAL_SCALE) / DRU_DECIMAL_SCALE;
}

/** Combat / reward level for enemyIndex (1–10) on this planet. */
export function getDungeonEnemyLevel(planetId, enemyIndex) {
  const idx = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, enemyIndex || 1));
  const band = getDungeonBand(planetId);
  if (band <= STORY_DUNGEON_COUNT) return DUNGEON_ENEMY_LEVELS[band][idx - 1];
  const depth = band - STORY_DUNGEON_COUNT;
  const start = WORMHOLE_BASE_ENEMY_LEVEL
    + (depth - 1) * WORMHOLE_LEVELS_PER_DEPTH
    + WORMHOLE_FIRST_ENEMY_LEVEL_OFFSET;
  return start + D10_LEVEL_OFFSETS[idx - 1];
}

/**
 * Convert DRU at an enemy level into Stardust / XP.
 * Stardust from dungeons is always 0;
 * XP = round(DRU × MissionXPPerFuel(enemyLevel) × DUNGEON_XP_PER_DRU_MULTIPLIER).
 */
export function druToRewards(dru, enemyLevel) {
  const lvl = Math.max(1, enemyLevel || 1);
  const units = Math.max(0, Number(dru) || 0);
  return {
    stardust: 0,
    experience: Math.max(
      units > 0 ? 1 : 0,
      Math.round(units * getMissionXpPerFuel(lvl) * DUNGEON_XP_PER_DRU_MULTIPLIER)
    ),
  };
}

/**
 * Deterministic dungeon foe for a planet + encounter index (1–10).
 * Attributes = ExpectedPlayerAttributes(enemyLevel) × 1.20 (regular) or × 1.30 (boss).
 * Strength is independent of the challenging player's stats/gear (`_charLevel` unused).
 * Hidden MIGHT/REFLEX/TECH archetype drives combat family; artwork/name stay planet-flavored.
 */
export function generateDungeonEnemy(planet, enemyIndex, _charLevel) {
  const seed = planet.id * DUNGEON_ENEMY_SEED_PLANET_MULTIPLIER
    + enemyIndex * DUNGEON_ENEMY_SEED_INDEX_MULTIPLIER
    + DUNGEON_ENEMY_SEED_OFFSET;
  const rng = mulberry32(seed);
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;

  const level = getDungeonEnemyLevel(planet.id, enemyIndex);
  const budget = dungeonEnemyAttributeBudget(level, isBoss);
  const archetype = pickMissionEnemyArchetype(rng);
  const stats = distributeMissionEnemyAttributes(budget, archetype);
  const classKey = MISSION_ENEMY_ARCHETYPE_CLASS[archetype];

  // Appearance only — race combat bonuses intentionally omitted (race: null).
  const raceKey = pickRace(planet, isBoss, rng);
  const race = RACES[raceKey];

  const power = Math.round(
    level * DUNGEON_ENEMY_POWER_PER_LEVEL
    + sumStats(stats) * DUNGEON_ENEMY_POWER_PER_ATTRIBUTE,
  );
  const namePool = planet.enemyNames?.length ? planet.enemyNames : FALLBACK_NAMES;
  const name = isBoss ? planet.bossName : pick(namePool, rng);

  return {
    id: `dungeon-${planet.id}-${enemyIndex}`,
    name,
    // No race combat bonus — keeps the ExpectedPlayerAttributes budget exact.
    race: null,
    // Class ONLY for primary damage / resist-family rules; passives suppressed.
    class: classKey,
    dungeonEnemyArchetype: archetype,
    dungeonEnemy: true,
    suppressClassPassive: true,
    level,
    stats,
    power,
    arena_rating: DUNGEON_ENEMY_BASE_ARENA_RATING + level * DUNGEON_ENEMY_ARENA_RATING_PER_LEVEL,
    arena_wins: 0,
    arena_losses: 0,
    guild: null,
    lastOnlineMins: 0,
    appearance: {
      race: raceKey,
      skinColor: pick(race.skinColors, rng),
      eyeStyle: pick(EYES, rng),
      ears: pick(EARS, rng),
      mouth: pick(MOUTHS, rng),
      nose: pick(NOSES, rng),
      eyebrows: pick(BROWS, rng),
      marking: pick(MARKINGS, rng),
    },
    isBot: true,
    isBoss,
    speciesId: (
      (planet.id * AVATAR_SPECIES_PLANET_MULTIPLIER
        + enemyIndex * AVATAR_SPECIES_ENCOUNTER_MULTIPLIER)
      % AVATAR_SPECIES_COUNT
    ) + 1,
  };
}

/**
 * Rewards for clearing (or failing) a dungeon enemy.
 * @param {{ className?: string }} opts
 */
export function computeDungeonRewards(planet, enemyIndex, charLevel, won, opts = {}) {
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;
  const className = opts.className;
  const enemyLevel = getDungeonEnemyLevel(planet?.id, enemyIndex);
  const dru = getEnemyDru(planet?.id, enemyIndex);

  if (!won) {
    return {
      experience: 0,
      stardust: 0,
      item: null,
      isBoss,
      consolation: false,
      dru: 0,
      enemyLevel,
    };
  }

  const { experience, stardust } = druToRewards(dru, enemyLevel);

  let item = null;
  if (isBoss) {
    const tier = Math.min(
      BOSS_MAX_RARITY_TIER_INDEX,
      Math.floor(((planet.id || 1) - 1) / BOSS_RARITY_TIER_SIZE),
    );
    item = generateItem(
      rollItemRarity(BOSS_RARITIES[tier], charLevel),
      Math.max(1, charLevel),
      undefined,
      className,
    );
  } else if (Math.random() < REGULAR_ENEMY_ITEM_DROP_CHANCE) {
    const rarity = rollItemRarity(
      Math.random() < REGULAR_ENEMY_UNCOMMON_BASE_CHANCE ? "uncommon" : "common",
      charLevel,
    );
    item = generateItem(rarity, Math.max(1, charLevel), undefined, className);
  }

  return {
    experience,
    stardust,
    item,
    isBoss,
    consolation: false,
    dru: Math.round(dru * DRU_DECIMAL_SCALE) / DRU_DECIMAL_SCALE,
    enemyLevel,
  };
}

export function dungeonCooldownMs(_won) {
  return DUNGEON_BATTLE_COOLDOWN_MS;
}

