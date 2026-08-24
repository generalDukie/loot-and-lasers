import { RACES } from "@/lib/gameData";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/lib/avatarFeatures";
import { constructMissionEnemy } from "@/lib/productionMath/missions.js";
import {
  MISSION_COMBAT_RULES_VERSION,
  MISSION_ENEMY_HP_SCALE,
  missionEnemyOutgoingMultiplier,
} from "@/lib/productionMath";

const ENCOUNTER_NAMES = [
  "Scrap Raider", "Dust Bandit", "Vermin Scout", "Hull Rat", "Junk Drone",
  "Space Mite", "Corridor Thug", "Loot Tick", "Derelict Guard", "Petty Corsair",
];

const MISSION_ENEMY_POWER_PER_LEVEL = 6;
const MISSION_ENEMY_POWER_PER_ATTRIBUTE = 2;
const MISSION_ENEMY_BASE_ARENA_RATING = 800;
const MISSION_ENEMY_ARENA_RATING_PER_LEVEL = 5;

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function snapshotValue(mission, key) {
  if (mission && mission[key] != null) return mission[key];
  const snap = mission?.rewards?.snapshot;
  if (snap && snap[key] != null) return snap[key];
  return undefined;
}

/**
 * Soft end-of-mission foe.
 * Combat stats come from productionMath constructMissionEnemy using the
 * Mission acceptance snapshot level (not live character level).
 * Presentation (name/race/art) is independent and has no combat effect.
 */
export function generateMissionEncounter(character, mission, rng) {
  if (typeof rng !== "function") {
    throw new Error("generateMissionEncounter requires injected RNG");
  }
  const snapshotLevel = Math.max(
    1,
    Math.floor(Number(
      mission?.character_level
      ?? mission?.enemy_epa_level
      ?? mission?.rewards?.snapshot?.character_level
      ?? character?.level
      ?? 1,
    )),
  );
  const built = constructMissionEnemy({ snapshotLevel, rng });
  const raceKey = pick(Object.keys(RACES), rng);
  const race = RACES[raceKey];
  const stats = built.stats;
  const attrSum = Object.values(stats).reduce((a, b) => a + b, 0);
  const snapHpScale = Number(snapshotValue(mission, "mission_enemy_hp_scale"));
  const snapOutgoing = Number(snapshotValue(mission, "mission_enemy_outgoing_multiplier"));
  const missionEnemyHpScale = Number.isFinite(snapHpScale) && snapHpScale > 0
    ? snapHpScale
    : MISSION_ENEMY_HP_SCALE;
  const missionEnemyOutgoingMultiplierFrozen = Number.isFinite(snapOutgoing)
    ? snapOutgoing
    : missionEnemyOutgoingMultiplier(snapshotLevel);
  const missionCombatRulesVersion = snapshotValue(mission, "mission_combat_rules_version")
    || MISSION_COMBAT_RULES_VERSION;

  return {
    id: `mission-foe-${Date.now()}`,
    name: pick(ENCOUNTER_NAMES, rng),
    missionEnemyArchetype: built.missionEnemyArchetype,
    missionEnemy: true,
    suppressClassPassive: true,
    class: built.class,
    race: null,
    level: snapshotLevel,
    stats,
    power: Math.round(
      snapshotLevel * MISSION_ENEMY_POWER_PER_LEVEL
      + attrSum * MISSION_ENEMY_POWER_PER_ATTRIBUTE,
    ),
    arena_rating: MISSION_ENEMY_BASE_ARENA_RATING + snapshotLevel * MISSION_ENEMY_ARENA_RATING_PER_LEVEL,
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
    _missionId: mission?.id || null,
    noGear: true,
    noPassive: true,
    noRaceEffect: true,
    baseDamage: built.baseDamage,
    attributeTotal: built.attributeTotal,
    expectedBudget: built.expectedBudget,
    missionEnemyHpScale,
    missionEnemyOutgoingMultiplier: missionEnemyOutgoingMultiplierFrozen,
    missionCombatRulesVersion,
  };
}
