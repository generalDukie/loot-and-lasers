import { RACES } from "@/lib/gameData";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/lib/avatarFeatures";
import {
  missionEnemyAttributeBudget,
  pickMissionEnemyArchetype,
  distributeMissionEnemyAttributes,
  MISSION_ENEMY_ARCHETYPE_CLASS,
} from "@/lib/expectedPlayerAttributes";

const ENCOUNTER_NAMES = [
  "Scrap Raider", "Dust Bandit", "Vermin Scout", "Hull Rat", "Junk Drone",
  "Space Mite", "Corridor Thug", "Loot Tick", "Derelict Guard", "Petty Corsair",
];

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Soft end-of-mission foe.
 * Power = expectedPlayerAttributes(playerLevel) × 35% (EPA benchmark),
 * distributed by a hidden MIGHT / REFLEX / TECH archetype. The low-level
 * base-damage ramp (statEngine) still wraps this foe via missionEnemy/level.
 * Presentation (name/race/art) is independent. Combat uses player formulas via
 * a class family mapping with passives suppressed.
 */
export function generateMissionEncounter(character, mission, rng = Math.random) {
  const playerLevel = Math.max(1, Math.floor(Number(character?.level) || 1));
  // Presentation level = player level (no direct combat level multiplier).
  const level = playerLevel;

  const archetype = pickMissionEnemyArchetype(rng);
  const budget = missionEnemyAttributeBudget(level);
  const stats = distributeMissionEnemyAttributes(budget, archetype);
  const classKey = MISSION_ENEMY_ARCHETYPE_CLASS[archetype];

  // Appearance only — race combat bonuses are intentionally not applied
  // (character.race left unset so attribute budget stays exact).
  const raceKey = pick(Object.keys(RACES), rng);
  const race = RACES[raceKey];

  return {
    id: `mission-foe-${Date.now()}`,
    name: pick(ENCOUNTER_NAMES, rng),
    // Hidden combat archetype — not shown in UI.
    missionEnemyArchetype: archetype,
    missionEnemy: true,
    suppressClassPassive: true,
    // Class is ONLY for primary damage / resist-family rules in statEngine.
    class: classKey,
    // No race combat bonus — keeps the soft progressing budget exact.
    race: null,
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
      skinColor: pick(race.skinColors, rng),
      eyeStyle: pick(EYES, rng),
      ears: pick(EARS, rng),
      mouth: pick(MOUTHS, rng),
      nose: pick(NOSES, rng),
      eyebrows: pick(BROWS, rng),
      marking: pick(MARKINGS, rng),
    },
    speciesId: raceKey,
    // mission arg reserved for future authored encounter overrides
    _missionId: mission?.id || null,
  };
}
