import { RACES, CLASSES } from "@/lib/gameData";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/components/game/CharacterAvatar";

const ENCOUNTER_NAMES = [
  "Scrap Raider", "Dust Bandit", "Vermin Scout", "Hull Rat", "Junk Drone",
  "Space Mite", "Corridor Thug", "Loot Tick", "Derelict Guard", "Petty Corsair",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Soft end-of-mission foe — scaled well under the player so wins are near-certain
// without hard-coding the result. Higher mission risk nudges them slightly harder.
export function generateMissionEncounter(character, mission) {
  const playerLevel = character?.level || 1;
  const risk = mission?.risk || 1;
  // ~55–70% of player level; risk adds a small bump but stays below the hero.
  const level = Math.max(1, Math.floor(playerLevel * (0.5 + risk * 0.04)));
  const raceKey = pick(Object.keys(RACES));
  const classKey = pick(Object.keys(CLASSES));
  const race = RACES[raceKey];
  const cls = CLASSES[classKey];
  const base = cls.baseStats;
  const bonus = Math.floor(level * 0.55);
  const stats = {};
  for (const k of Object.keys(base)) {
    stats[k] = Math.max(1, Math.floor((base[k] + bonus) * 0.55));
  }

  return {
    id: `mission-foe-${Date.now()}`,
    name: pick(ENCOUNTER_NAMES),
    race: raceKey,
    class: classKey,
    level,
    stats,
    power: Math.round(level * 6 + Object.values(stats).reduce((a, b) => a + b, 0) * 2),
    arena_rating: 800 + level * 5,
    arena_wins: 0,
    arena_losses: 0,
    guild: null,
    lastOnlineMins: 0,
    appearance: {
      race: raceKey,
      skinColor: pick(race.skinColors),
      eyeStyle: pick(EYES),
      ears: pick(EARS),
      mouth: pick(MOUTHS),
      nose: pick(NOSES),
      eyebrows: pick(BROWS),
      marking: pick(MARKINGS),
    },
    speciesId: raceKey,
  };
}
