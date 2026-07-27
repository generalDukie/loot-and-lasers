// ═══════════════════════════════════════════
// DUNGEON ENGINE — enemy generation + rewards
// ═══════════════════════════════════════════
import { RACES, CLASSES, generateItem, rollItemRarity, SHIP_MODS, getActiveShipId, getActiveShipMods, scaleCombatXp } from "@/lib/gameData";
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

// Deterministic enemy for a given planet + enemy index, scaled to the player.
export function generateDungeonEnemy(planet, enemyIndex, charLevel) {
  const seed = planet.id * 1000 + enemyIndex * 37 + 7;
  const rng = mulberry32(seed);
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;

  const raceKey = pickRace(planet, isBoss, rng);
  const classKey = pickClass(planet, isBoss, rng);
  const race = RACES[raceKey];
  const cls = CLASSES[classKey];

  const level = Math.max(1, Math.floor(planet.id * 3 + enemyIndex + charLevel * 0.2));
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
 * @param {{ patrol?: boolean }} opts — patrol = cleared-world farm (reduced payout, no ship mods)
 */
export function computeDungeonRewards(planet, enemyIndex, charLevel, won, opts = {}) {
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;
  const patrol = !!opts.patrol;
  const mult = patrol ? DUNGEON_PATROL_REWARD_MULT : 1;
  const pl = Math.max(1, charLevel || 1);
  // Story worlds ~ their id band; wormhole / infinite use depth as content level.
  const contentLevel = Math.max(1, planet?.id > 10
    ? 10 + Math.max(0, (planet.id - 10))
    : (planet?.id || 1) * 5);

  if (!won) {
    const raw = Math.round((12 + (planet.id || 1) * 6 + enemyIndex * 2) * (patrol ? 0.5 : 1));
    return {
      experience: scaleCombatXp(raw, pl, contentLevel),
      stardust: 0,
      item: null,
      isBoss,
      patrol,
      consolation: true,
    };
  }

  const rawXp = Math.round((55 + (planet.id || 1) * 40 + enemyIndex * 22 + (isBoss ? 320 : 0)) * mult);
  let experience = scaleCombatXp(rawXp, pl, contentLevel);
  let stardust = Math.round((45 + (planet.id || 1) * 30 + enemyIndex * 15 + (isBoss ? 600 : 0)) * mult);

  let item = null;
  if (!patrol && isBoss) {
    const tier = Math.min(3, Math.floor(((planet.id || 1) - 1) / 3));
    const rarities = ["rare", "epic", "epic", "legendary"];
    item = generateItem(rollItemRarity(rarities[tier], charLevel), Math.max(1, charLevel));
  } else if (Math.random() < (patrol ? 0.12 : 0.25)) {
    const rarity = rollItemRarity(Math.random() < 0.12 ? "uncommon" : "common", charLevel);
    item = generateItem(rarity, Math.max(1, charLevel));
  }

  return { experience, stardust, item, isBoss, patrol, consolation: false };
}

export function dungeonCooldownMs(won) {
  return won ? DUNGEON_WIN_COOLDOWN_MS : DUNGEON_LOSS_COOLDOWN_MS;
}

/** Milestone chest every N career node clears (story + patrol). */
export function rollMilestoneChest(character, charLevel) {
  const next = (character.dungeon_nodes_cleared || 0) + 1;
  if (next % DUNGEON_MILESTONE_EVERY !== 0) return { nodesCleared: next, item: null };
  const rarity = rollItemRarity(Math.random() < 0.35 ? "rare" : "uncommon", charLevel);
  return { nodesCleared: next, item: generateItem(rarity, Math.max(1, charLevel)) };
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
      consolationStardust: 400 + (planet.id || 1) * 80,
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
