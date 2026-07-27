// ═══════════════════════════════════════════
// DUNGEON ENGINE — enemy generation + rewards
// ═══════════════════════════════════════════
import { RACES, CLASSES, generateItem, rollItemRarity } from "@/lib/gameData";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/components/game/CharacterAvatar";

export const DUNGEON_ENEMIES_PER_PLANET = 10;
export const DUNGEON_DEATHS_PER_DAY = 3;
export const DUNGEON_REVIVE_COST = 20; // Nova crystals
export const DUNGEON_EXTRA_LIFE_COST = 5; // Nova crystals per extra life
export const DUNGEON_BATTLE_COOLDOWN_MS = 30 * 60 * 1000; // 30-minute cooldown between battles
export const DUNGEON_SKIP_COST = 10; // Nova crystals to skip the cooldown

const ENEMY_NAMES = [
  "Vrax'Nok", "Zyx-7", "Kaelith", "Drogath", "Nebulon", "Vex'ara", "Cygnus",
  "Mordok", "Lyra-9", "Thresh", "Zarvok", "Pixie-Δ", "Garruk", "Sylph",
  "Onyx-3", "Brak'tor", "Vesper", "Krellix", "Astra", "Mungo", "RustBeard",
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

// Deterministic enemy for a given planet + enemy index, scaled to the player.
export function generateDungeonEnemy(planet, enemyIndex, charLevel) {
  const seed = planet.id * 1000 + enemyIndex * 37 + 7;
  const rng = mulberry32(seed);
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;

  const raceKey = pick(Object.keys(RACES), rng);
  const classKey = pick(Object.keys(CLASSES), rng);
  const race = RACES[raceKey];
  const cls = CLASSES[classKey];

  // Threat is anchored to the planet + enemy position (easy → hard across the
  // crawl) with only a small nod to player level. As you level up and gear up,
  // your stats/equipment outpace enemy growth, so the same enemies feel easier.
  const level = Math.max(1, Math.floor(planet.id * 3 + enemyIndex + charLevel * 0.2));
  const base = cls.baseStats;
  const bonus = Math.floor(level * (isBoss ? 1.9 : 1.2));
  const stats = {};
  for (const k of Object.keys(base)) {
    stats[k] = base[k] + Math.floor(bonus * (0.6 + rng() * 0.8));
  }

  const power = Math.round(level * 10 + sumStats(stats) * 3);
  const name = isBoss ? planet.bossName : pick(ENEMY_NAMES, rng);

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

// Rewards for clearing (or failing) a dungeon enemy.
export function computeDungeonRewards(planet, enemyIndex, charLevel, won) {
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;
  if (!won) return { experience: 0, stardust: 0, item: null, isBoss };

  const experience = 60 + planet.id * 45 + enemyIndex * 24 + (isBoss ? 350 : 0);
  const stardust = 45 + planet.id * 30 + enemyIndex * 15 + (isBoss ? 600 : 0);

  let item = null;
  if (isBoss) {
    const tier = Math.min(3, Math.floor((planet.id - 1) / 3));
    const rarities = ["rare", "epic", "epic", "legendary"];
    item = generateItem(rollItemRarity(rarities[tier], charLevel), Math.max(1, charLevel));
  } else if (Math.random() < 0.25) {
    const rarity = rollItemRarity(Math.random() < 0.12 ? "uncommon" : "common", charLevel);
    item = generateItem(rarity, Math.max(1, charLevel));
  }

  return { experience, stardust, item, isBoss };
}