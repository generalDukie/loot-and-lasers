// ═══════════════════════════════════════════
// DUNGEON ENGINE — enemy generation + DRU rewards
// ═══════════════════════════════════════════
// 1 DRU = mission rewards for 1 fuel at the enemy's level.
//   Stardust = DRU × SD/F(enemyLevel)
//   XP       = DRU × XP/F(enemyLevel) × 0.87
import {
  RACES,
  CLASSES,
  generateItem,
  rollItemRarity,
  SHIP_MODS,
  getActiveShipId,
  getActiveShipMods,
  getMissionXpPerFuel,
  getMissionStardustPerFuel,
} from "@/lib/gameData";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/components/game/CharacterAvatar";

export const DUNGEON_ENEMIES_PER_PLANET = 10;
export const DUNGEON_DEATHS_PER_DAY = 3; // free lives per day (ET rollover)
export const DUNGEON_CONTINUE_COST = 5; // Nova crystals per fight after free lives are spent
/** @deprecated use DUNGEON_CONTINUE_COST */
export const DUNGEON_REVIVE_COST = DUNGEON_CONTINUE_COST;
export const DUNGEON_EXTRA_LIFE_COST = DUNGEON_CONTINUE_COST;
/** Fallback / legacy cooldown length */
export const DUNGEON_BATTLE_COOLDOWN_MS = 30 * 60 * 1000;
export const DUNGEON_WIN_COOLDOWN_MS = 10 * 60 * 1000; // shorter after a win
export const DUNGEON_LOSS_COOLDOWN_MS = 25 * 60 * 1000; // longer after a loss
export const DUNGEON_SKIP_COST = 10; // Nova crystals to skip the cooldown
/** Patrol (cleared-world) reward multiplier */
export const DUNGEON_PATROL_REWARD_MULT = 0.4;
/** Milestone chest every N node clears */
export const DUNGEON_MILESTONE_EVERY = 5;

/** XP is slightly leaner than missions so ~25% of career XP comes from the Frontier. */
export const DUNGEON_XP_DRU_MULT = 0.87;

/** Total DRU budget per story dungeon (index = planet id 1–10). */
export const DUNGEON_TOTAL_DRU = [0, 60, 70, 80, 90, 100, 110, 120, 135, 150, 175];

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

/** Relative offsets used to extend the L170–200 band into wormhole depths. */
const D10_LEVEL_OFFSETS = [0, 3, 7, 10, 13, 17, 20, 23, 27, 30];

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

function pickClass(planet, isBoss, rng) {
  if (isBoss && planet.bossClass && CLASSES[planet.bossClass]) return planet.bossClass;
  const pool = (planet.classes || []).filter((c) => CLASSES[c]);
  return pool.length ? pick(pool, rng) : pick(Object.keys(CLASSES), rng);
}

/** Story band 1–10, or extrapolated wormhole band (>10). */
export function getDungeonBand(planetId) {
  return Math.max(1, Math.floor(planetId || 1));
}

/** Total DRU for a dungeon band (wormhole grows past D10). */
export function getDungeonTotalDru(planetId) {
  const band = getDungeonBand(planetId);
  if (band <= 10) return DUNGEON_TOTAL_DRU[band];
  const depth = band - 10;
  return Math.round(175 + depth * 25);
}

/** DRU awarded for defeating enemyIndex (1–10) on this planet. */
export function getEnemyDru(planetId, enemyIndex) {
  const idx = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, enemyIndex || 1));
  const share = DUNGEON_ENEMY_DRU_SHARE[idx];
  return Math.round(getDungeonTotalDru(planetId) * share * 100) / 100;
}

/** Combat / reward level for enemyIndex (1–10) on this planet. */
export function getDungeonEnemyLevel(planetId, enemyIndex) {
  const idx = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, enemyIndex || 1));
  const band = getDungeonBand(planetId);
  if (band <= 10) return DUNGEON_ENEMY_LEVELS[band][idx - 1];
  const depth = band - 10;
  const start = 200 + (depth - 1) * 35 + 3; // first enemy after D10 boss @ 200
  return start + D10_LEVEL_OFFSETS[idx - 1];
}

/**
 * Convert DRU at an enemy level into Stardust / XP.
 * 1 DRU ≡ 1 fuel of mission rewards at that level (XP × 0.87).
 */
export function druToRewards(dru, enemyLevel) {
  const lvl = Math.max(1, enemyLevel || 1);
  const units = Math.max(0, Number(dru) || 0);
  return {
    stardust: Math.max(units > 0 ? 1 : 0, Math.round(units * getMissionStardustPerFuel(lvl))),
    experience: Math.max(units > 0 ? 1 : 0, Math.round(units * getMissionXpPerFuel(lvl) * DUNGEON_XP_DRU_MULT)),
  };
}

// Deterministic enemy for a given planet + enemy index.
export function generateDungeonEnemy(planet, enemyIndex, _charLevel) {
  const seed = planet.id * 1000 + enemyIndex * 37 + 7;
  const rng = mulberry32(seed);
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;

  const raceKey = pickRace(planet, isBoss, rng);
  const classKey = pickClass(planet, isBoss, rng);
  const race = RACES[raceKey];
  const cls = CLASSES[classKey];

  const level = getDungeonEnemyLevel(planet.id, enemyIndex);
  const base = cls.baseStats;
  const bonus = Math.floor(level * (isBoss ? 1.9 : 1.2));
  const stats = {};
  for (const k of Object.keys(base)) {
    stats[k] = base[k] + Math.floor(bonus * (0.6 + rng() * 0.8));
  }

  const power = Math.round(level * 10 + sumStats(stats) * 3);
  const namePool = planet.enemyNames?.length ? planet.enemyNames : FALLBACK_NAMES;
  const name = isBoss ? planet.bossName : pick(namePool, rng);

  return {
    id: `dungeon-${planet.id}-${enemyIndex}`,
    name,
    race: raceKey,
    class: classKey,
    level,
    stats,
    power,
    arena_rating: 1000 + level * 10,
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
    speciesId: ((planet.id * 13 + enemyIndex * 7) % 30) + 1,
  };
}

/**
 * Rewards for clearing (or failing) a dungeon enemy.
 * @param {{ patrol?: boolean, className?: string }} opts — patrol = cleared-world farm (reduced payout, no ship mods)
 */
export function computeDungeonRewards(planet, enemyIndex, charLevel, won, opts = {}) {
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;
  const patrol = !!opts.patrol;
  const className = opts.className;
  const mult = patrol ? DUNGEON_PATROL_REWARD_MULT : 1;
  const enemyLevel = getDungeonEnemyLevel(planet?.id, enemyIndex);
  const dru = getEnemyDru(planet?.id, enemyIndex) * mult;

  if (!won) {
    return {
      experience: 0,
      stardust: 0,
      item: null,
      isBoss,
      patrol,
      consolation: false,
      dru: 0,
      enemyLevel,
    };
  }

  const { experience, stardust } = druToRewards(dru, enemyLevel);

  let item = null;
  if (!patrol && isBoss) {
    const tier = Math.min(3, Math.floor(((planet.id || 1) - 1) / 3));
    const rarities = ["rare", "epic", "epic", "legendary"];
    item = generateItem(rollItemRarity(rarities[tier], charLevel), Math.max(1, charLevel), undefined, className);
  } else if (Math.random() < (patrol ? 0.12 : 0.25)) {
    const rarity = rollItemRarity(Math.random() < 0.12 ? "uncommon" : "common", charLevel);
    item = generateItem(rarity, Math.max(1, charLevel), undefined, className);
  }

  return {
    experience,
    stardust,
    item,
    isBoss,
    patrol,
    consolation: false,
    dru: Math.round(dru * 100) / 100,
    enemyLevel,
  };
}

export function dungeonCooldownMs(won) {
  return won ? DUNGEON_WIN_COOLDOWN_MS : DUNGEON_LOSS_COOLDOWN_MS;
}

/** Milestone chest every N career node clears (story + patrol). */
export function rollMilestoneChest(character, charLevel) {
  const next = (character.dungeon_nodes_cleared || 0) + 1;
  if (next % DUNGEON_MILESTONE_EVERY !== 0) return { nodesCleared: next, item: null };
  const rarity = rollItemRarity(Math.random() < 0.35 ? "rare" : "uncommon", charLevel);
  return {
    nodesCleared: next,
    item: generateItem(rarity, Math.max(1, charLevel), undefined, character?.class),
  };
}

/**
 * Grant the next free ship-mod tier for a category onto the active ship.
 * Also records the flavor name on character.ship_mods for collection UI.
 */
export function grantFrontierShipMod(character, planet) {
  const catKey = planet?.shipModCat;
  const flavor = planet?.shipMod;
  const cat = catKey ? SHIP_MODS[catKey] : null;
  const flavorMods = [...(character.ship_mods || [])];
  if (flavor && !flavorMods.includes(flavor)) flavorMods.push(flavor);

  if (!cat) {
    return { ship_mods: flavorMods, ship_mod_loadouts: null, unlockedLabel: flavor || null, tier: null, maxed: true };
  }

  const shipId = getActiveShipId(character);
  const loadouts = { ...(character.ship_mod_loadouts || {}) };
  const installed = [...(Array.isArray(loadouts[shipId]) ? loadouts[shipId] : getActiveShipMods(character))];
  // Keep only known tier ids so legacy flavor strings don't block progression.
  const knownIds = new Set(Object.values(SHIP_MODS).flatMap((c) => c.tiers.map((t) => t.id)));
  const cleaned = installed.filter((id) => knownIds.has(id));
  const next = cat.tiers.find((t) => !cleaned.includes(t.id));

  if (!next) {
    return {
      ship_mods: flavorMods,
      ship_mod_loadouts: null,
      unlockedLabel: flavor ? `${flavor} (catalogued)` : null,
      tier: null,
      maxed: true,
      consolationStardust: (400 + (planet.id || 1) * 80) * 10,
    };
  }

  cleaned.push(next.id);
  loadouts[shipId] = cleaned;
  return {
    ship_mods: flavorMods,
    ship_mod_loadouts: loadouts,
    unlockedLabel: `${flavor || cat.name} — ${cat.name} T${cat.tiers.indexOf(next) + 1}`,
    tier: next,
    cat,
    maxed: false,
  };
}
