/**
 * Phase 7 Dungeon / Wormhole construction.
 * Consumes productionMath primitives. Does not clone DRU/XP/EPA arithmetic.
 */
import { RACES } from "@/lib/gameData";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/lib/avatarFeatures";
import {
  dungeonEnemyLevel,
  dungeonUnlockLevel,
  dungeonVictoryXpBundle,
  dungeonWormholeEnemyAttributes,
  isDungeonWormholeBossEncounter,
  pveGearStatBudgetLevel,
  projectedProgressionAfterXp,
  rollDungeonBossRarity,
  rollDungeonRegularRarity,
  rollDungeonWormholeGearSlot,
  wormholeBandIndex,
  wormholeEnemyLevel,
  wormholeEncounterInBandIndex,
  wormholeVictoryXpBundle,
  DUNGEON_COUNT,
  DUNGEON_ENCOUNTERS_PER_DUNGEON,
  DUNGEON_ENEMY_LEVELS as DUNGEON_ENEMY_LEVELS_0,
  DUNGEON_UNLOCK_LEVELS as DUNGEON_UNLOCK_LEVELS_0,
  DUNGEON_WORMHOLE_COOLDOWN_MS,
  DUNGEON_WORMHOLE_SKIP_NOVA,
  MISSION_ENEMY_ARCHETYPE_CLASS,
  PHASE7_CONTENT_DUNGEON,
  PHASE7_CONTENT_WORMHOLE,
} from "@/lib/productionMath";
import {
  dungeonEncounterArchetype,
  stageArchetypeIndex,
  wormholeEncounterArchetype,
} from "@/lib/dungeonArchetypeSchedule";
import { DUNGEON_PLANETS, getWormholePlanet, WORMHOLE_ID } from "@/lib/dungeonData";

export const DUNGEON_ENEMIES_PER_PLANET = DUNGEON_ENCOUNTERS_PER_DUNGEON;
export const STORY_DUNGEON_COUNT = DUNGEON_COUNT;
/** 1-indexed presentation tables wrapping production 0-indexed arrays. */
export const DUNGEON_ENEMY_LEVELS = Object.freeze([[], ...DUNGEON_ENEMY_LEVELS_0]);
export const DUNGEON_UNLOCK_LEVELS = Object.freeze([null, ...DUNGEON_UNLOCK_LEVELS_0]);
export const DUNGEON_SKIP_COST = DUNGEON_WORMHOLE_SKIP_NOVA;
export const DUNGEON_BATTLE_COOLDOWN_MS = DUNGEON_WORMHOLE_COOLDOWN_MS;
/** @deprecated Death quotas removed. */
export const DUNGEON_DEATHS_PER_DAY = 0;
/** @deprecated Continue fee removed. */
export const DUNGEON_CONTINUE_COST = 0;
export const DUNGEON_REVIVE_COST = DUNGEON_CONTINUE_COST;
export const DUNGEON_EXTRA_LIFE_COST = DUNGEON_CONTINUE_COST;
/** @deprecated Shared-timer alias; Dungeon and Wormhole cooldowns are independent. */
export const DUNGEON_WIN_COOLDOWN_MS = DUNGEON_BATTLE_COOLDOWN_MS;
export const DUNGEON_LOSS_COOLDOWN_MS = DUNGEON_BATTLE_COOLDOWN_MS;

export { WORMHOLE_ID, DUNGEON_PLANETS };

const DUNGEON_ENEMY_POWER_PER_LEVEL = 10;
const DUNGEON_ENEMY_POWER_PER_ATTRIBUTE = 3;
const DUNGEON_ENEMY_BASE_ARENA_RATING = 1_000;
const DUNGEON_ENEMY_ARENA_RATING_PER_LEVEL = 10;
const AVATAR_SPECIES_COUNT = 30;
const AVATAR_SPECIES_PLANET_MULTIPLIER = 13;
const AVATAR_SPECIES_ENCOUNTER_MULTIPLIER = 7;
const DUNGEON_ENEMY_SEED_PLANET_MULTIPLIER = 1_000;
const DUNGEON_ENEMY_SEED_INDEX_MULTIPLIER = 37;
const DUNGEON_ENEMY_SEED_OFFSET = 7;
const DUNGEON_DISPLAY_ID_ONE = 1;
const MULBERRY32_INCREMENT = 0x6D2B79F5;
const MULBERRY32_SHIFT_15 = 15;
const MULBERRY32_SHIFT_7 = 7;
const MULBERRY32_MIX = 61;
const MULBERRY32_SHIFT_14 = 14;
const UINT32_RANGE = 4_294_967_296;

const FALLBACK_NAMES = [
  "Vrax'Nok", "Zyx-7", "Kaelith", "Drogath", "Nebulon", "Zyr'kara", "Cygnus",
  "Mordok", "Lyra-9", "Threx", "Zarvok", "Pixie-Δ", "Garrak", "Sylph",
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + MULBERRY32_INCREMENT) | 0;
    let t = Math.imul(a ^ (a >>> MULBERRY32_SHIFT_15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> MULBERRY32_SHIFT_7), MULBERRY32_MIX | t)) ^ t;
    return ((t ^ (t >>> MULBERRY32_SHIFT_14)) >>> 0) / UINT32_RANGE;
  };
}

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function sumStats(s) {
  return (s.strength || 0) + (s.agility || 0) + (s.intellect || 0) + (s.vitality || 0) + (s.luck || 0);
}

export function getDungeonUnlockLevel(planetId) {
  const id = Math.floor(Number(planetId) || 0);
  if (id >= DUNGEON_DISPLAY_ID_ONE && id <= STORY_DUNGEON_COUNT) {
    return dungeonUnlockLevel(id - DUNGEON_DISPLAY_ID_ONE);
  }
  return null;
}

export function isDungeonUnlockedByLevel(planetId, playerLevel) {
  const unlock = getDungeonUnlockLevel(planetId);
  if (unlock == null) return true;
  return Math.max(1, Math.floor(Number(playerLevel) || 1)) >= unlock;
}

/** Story enemy level from production tables. Wormhole uses wormholeEnemyLevel. */
export function getDungeonEnemyLevel(planetId, enemyIndex) {
  const id = Math.max(DUNGEON_DISPLAY_ID_ONE, Math.floor(Number(planetId) || DUNGEON_DISPLAY_ID_ONE));
  const idx = Math.min(
    DUNGEON_ENEMIES_PER_PLANET,
    Math.max(DUNGEON_DISPLAY_ID_ONE, Math.floor(Number(enemyIndex) || DUNGEON_DISPLAY_ID_ONE)),
  );
  if (id <= STORY_DUNGEON_COUNT) {
    return dungeonEnemyLevel(id - DUNGEON_DISPLAY_ID_ONE, idx - DUNGEON_DISPLAY_ID_ONE);
  }
  const absolute = (id - STORY_DUNGEON_COUNT - DUNGEON_DISPLAY_ID_ONE)
    * DUNGEON_ENEMIES_PER_PLANET
    + (idx - DUNGEON_DISPLAY_ID_ONE);
  return wormholeEnemyLevel(absolute);
}

function presentationPlanet(content, dungeonId, wormholeIndex) {
  if (content === PHASE7_CONTENT_WORMHOLE) {
    const band = wormholeBandIndex(wormholeIndex);
    return getWormholePlanet(band);
  }
  return DUNGEON_PLANETS[dungeonId - DUNGEON_DISPLAY_ID_ONE] || DUNGEON_PLANETS[0];
}

function pickRace(planet, isBoss, rng) {
  if (isBoss && planet.bossRace && RACES[planet.bossRace]) return planet.bossRace;
  const pool = (planet.races || []).filter((r) => RACES[r]);
  return pool.length ? pick(pool, rng) : pick(Object.keys(RACES), rng);
}

/**
 * Server-authoritative Dungeon/Wormhole foe.
 * Archetype comes from the frozen global schedule, not per-attempt RNG.
 */
function generateDungeonEnemyCore({
  content = PHASE7_CONTENT_DUNGEON,
  dungeonId = DUNGEON_DISPLAY_ID_ONE,
  encounterNumber = DUNGEON_DISPLAY_ID_ONE,
  wormholeIndex = 0,
} = {}) {
  const isWormhole = content === PHASE7_CONTENT_WORMHOLE;
  const encounterIndex0 = Math.max(0, Math.floor(Number(encounterNumber) || DUNGEON_DISPLAY_ID_ONE) - DUNGEON_DISPLAY_ID_ONE);
  const dungeonIndex0 = Math.max(0, Math.floor(Number(dungeonId) || DUNGEON_DISPLAY_ID_ONE) - DUNGEON_DISPLAY_ID_ONE);
  const absolute = isWormhole
    ? Math.max(0, Math.floor(Number(wormholeIndex) || 0))
    : dungeonIndex0 * DUNGEON_ENEMIES_PER_PLANET + encounterIndex0;
  const isBoss = isDungeonWormholeBossEncounter(
    isWormhole ? wormholeEncounterInBandIndex(absolute) : encounterIndex0,
  );
  const level = isWormhole
    ? wormholeEnemyLevel(absolute)
    : dungeonEnemyLevel(dungeonIndex0, encounterIndex0);
  const archetype = isWormhole
    ? wormholeEncounterArchetype(absolute)
    : dungeonEncounterArchetype(dungeonIndex0, encounterIndex0);
  const archetypeIndex = stageArchetypeIndex(
    isWormhole ? PHASE7_CONTENT_WORMHOLE : PHASE7_CONTENT_DUNGEON,
    isWormhole ? Math.floor(absolute / DUNGEON_ENEMIES_PER_PLANET) : dungeonIndex0,
    isWormhole ? wormholeEncounterInBandIndex(absolute) : encounterIndex0,
  );
  const built = dungeonWormholeEnemyAttributes(level, isBoss, archetypeIndex);
  const stats = built.attributes;
  const classKey = MISSION_ENEMY_ARCHETYPE_CLASS[archetype];
  const planet = presentationPlanet(
    isWormhole ? PHASE7_CONTENT_WORMHOLE : PHASE7_CONTENT_DUNGEON,
    dungeonId,
    absolute,
  );
  const encounterNumberResolved = isWormhole
    ? wormholeEncounterInBandIndex(absolute) + DUNGEON_DISPLAY_ID_ONE
    : encounterIndex0 + DUNGEON_DISPLAY_ID_ONE;
  const seed = (planet.id || dungeonId) * DUNGEON_ENEMY_SEED_PLANET_MULTIPLIER
    + encounterNumberResolved * DUNGEON_ENEMY_SEED_INDEX_MULTIPLIER
    + DUNGEON_ENEMY_SEED_OFFSET;
  const rng = mulberry32(seed);
  const raceKey = pickRace(planet, isBoss, rng);
  const race = RACES[raceKey];
  const namePool = planet.enemyNames?.length ? planet.enemyNames : FALLBACK_NAMES;
  const name = isBoss ? planet.bossName : pick(namePool, rng);
  const power = Math.round(
    level * DUNGEON_ENEMY_POWER_PER_LEVEL
    + sumStats(stats) * DUNGEON_ENEMY_POWER_PER_ATTRIBUTE,
  );

  return {
    id: isWormhole
      ? `wormhole-${absolute + DUNGEON_DISPLAY_ID_ONE}`
      : `dungeon-${dungeonId}-${encounterNumberResolved}`,
    name,
    race: null,
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
      ((planet.id || dungeonId) * AVATAR_SPECIES_PLANET_MULTIPLIER
        + encounterNumberResolved * AVATAR_SPECIES_ENCOUNTER_MULTIPLIER)
      % AVATAR_SPECIES_COUNT
    ) + DUNGEON_DISPLAY_ID_ONE,
    content: isWormhole ? PHASE7_CONTENT_WORMHOLE : PHASE7_CONTENT_DUNGEON,
    attributeTotal: built.total,
  };
}

/**
 * Server-authoritative Dungeon/Wormhole foe.
 * Object form is canonical. (planet, encounter, unusedLevel) remains a test/compat shim.
 */
export function generateDungeonEnemy(arg, encounterNumber, _unusedPlayerLevel) {
  if (
    arg
    && typeof arg === "object"
    && typeof encounterNumber === "number"
    && arg.id != null
    && arg.content == null
    && arg.dungeonId == null
  ) {
    const dungeonId = Math.max(DUNGEON_DISPLAY_ID_ONE, Math.floor(Number(arg.id) || DUNGEON_DISPLAY_ID_ONE));
    return generateDungeonEnemyCore({
      content: dungeonId > STORY_DUNGEON_COUNT ? PHASE7_CONTENT_WORMHOLE : PHASE7_CONTENT_DUNGEON,
      dungeonId: dungeonId > STORY_DUNGEON_COUNT ? STORY_DUNGEON_COUNT : dungeonId,
      encounterNumber,
      wormholeIndex: 0,
    });
  }
  return generateDungeonEnemyCore(arg || {});
}

export function dungeonCooldownMs(_won) {
  return DUNGEON_BATTLE_COOLDOWN_MS;
}

function requireRng(rng, label) {
  if (typeof rng !== "function") {
    throw new Error(`${label} requires injected RNG`);
  }
  return rng;
}

/**
 * Freeze victory XP/Frontier/Gear at combat commit.
 * XP/Frontier use the pre-grant player level. Gear uses the projected post-XP level.
 * Defeat returns a zero-reward freeze with true enemy identity and must not call Gear RNG.
 */
export function freezePhase7Settlement({
  won,
  content,
  dungeonId,
  encounterNumber,
  wormholeIndex,
  playerLevelAtVictory,
  experience = 0,
  className,
  rng,
  generateGear,
  gearEconomicLevel = null,
} = {}) {
  const isWormhole = content === PHASE7_CONTENT_WORMHOLE;
  const identity = phase7EncounterIdentity({
    content,
    dungeonId,
    encounterNumber,
    wormholeIndex,
  });
  const playerLevel = Math.max(1, Math.floor(Number(playerLevelAtVictory) || 1));
  if (!won) {
    return {
      won: false,
      content: identity.content,
      dungeon_id: identity.dungeon_id,
      encounter_number: identity.encounter_number,
      wormhole_index: identity.wormhole_index,
      band: identity.band,
      is_boss: identity.is_boss,
      archetype: identity.archetype,
      enemy_level: identity.enemy_level,
      base_xp: 0,
      frontier_pct: 0,
      frontier_amount: 0,
      final_xp: 0,
      player_level_at_victory: playerLevel,
      player_level_after_xp: playerLevel,
      gear_economic_level: null,
      gear_stat_budget_level: null,
      gear: null,
      origin: identity.content,
    };
  }

  const xp = isWormhole
    ? wormholeVictoryXpBundle(wormholeIndex, playerLevel)
    : dungeonVictoryXpBundle(
      Math.max(0, (dungeonId || DUNGEON_DISPLAY_ID_ONE) - DUNGEON_DISPLAY_ID_ONE),
      Math.max(0, (encounterNumber || DUNGEON_DISPLAY_ID_ONE) - DUNGEON_DISPLAY_ID_ONE),
      playerLevel,
    );
  const projected = projectedProgressionAfterXp({
    level: playerLevel,
    experience,
    xpAmount: xp.finalXp,
  });
  const gearLevel = Math.max(
    1,
    Math.floor(Number(gearEconomicLevel != null ? gearEconomicLevel : projected.level) || 1),
  );
  const r = requireRng(rng, "freezePhase7Settlement");
  const rarity = identity.is_boss ? rollDungeonBossRarity(r) : rollDungeonRegularRarity(r);
  const slot = rollDungeonWormholeGearSlot(r);
  const origin = identity.content;
  const gear = generateGear({
    rarity,
    economicLevel: gearLevel,
    playerLevel: gearLevel,
    applyPveHiddenBudgetOffset: true,
    itemType: slot,
    rng: r,
    className: className || null,
    origin,
  });

  return {
    won: true,
    content: origin,
    dungeon_id: identity.dungeon_id,
    encounter_number: identity.encounter_number,
    wormhole_index: identity.wormhole_index,
    band: identity.band,
    is_boss: identity.is_boss,
    archetype: identity.archetype,
    base_xp: xp.baseXp,
    frontier_pct: xp.frontierPct,
    frontier_amount: xp.frontierAmount,
    final_xp: xp.finalXp,
    player_level_at_victory: playerLevel,
    player_level_after_xp: projected.level,
    enemy_level: identity.enemy_level,
    gear_economic_level: gearLevel,
    gear_stat_budget_level: pveGearStatBudgetLevel(gearLevel),
    gear,
    origin,
  };
}

function phase7EncounterIdentity({
  content,
  dungeonId,
  encounterNumber,
  wormholeIndex,
} = {}) {
  const isWormhole = content === PHASE7_CONTENT_WORMHOLE;
  const dungeonIndex0 = Math.max(
    0,
    Math.floor(Number(dungeonId) || DUNGEON_DISPLAY_ID_ONE) - DUNGEON_DISPLAY_ID_ONE,
  );
  const absolute = isWormhole
    ? Math.max(0, Math.floor(Number(wormholeIndex) || 0))
    : dungeonIndex0 * DUNGEON_ENEMIES_PER_PLANET
      + Math.max(0, Math.floor(Number(encounterNumber) || DUNGEON_DISPLAY_ID_ONE) - DUNGEON_DISPLAY_ID_ONE);
  const encounterIndex0 = isWormhole
    ? wormholeEncounterInBandIndex(absolute)
    : Math.max(0, Math.floor(Number(encounterNumber) || DUNGEON_DISPLAY_ID_ONE) - DUNGEON_DISPLAY_ID_ONE);
  const isBoss = isDungeonWormholeBossEncounter(encounterIndex0);
  const enemyLevel = isWormhole
    ? wormholeEnemyLevel(absolute)
    : dungeonEnemyLevel(dungeonIndex0, encounterIndex0);
  const archetype = isWormhole
    ? wormholeEncounterArchetype(absolute)
    : dungeonEncounterArchetype(dungeonIndex0, encounterIndex0);
  return {
    content: isWormhole ? PHASE7_CONTENT_WORMHOLE : PHASE7_CONTENT_DUNGEON,
    dungeon_id: isWormhole ? null : (dungeonId || DUNGEON_DISPLAY_ID_ONE),
    encounter_number: encounterIndex0 + DUNGEON_DISPLAY_ID_ONE,
    wormhole_index: isWormhole ? absolute : null,
    band: isWormhole ? wormholeBandIndex(absolute) : null,
    is_boss: isBoss,
    enemy_level: enemyLevel,
    archetype,
  };
}
