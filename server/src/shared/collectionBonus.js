/**
 * Collection bonus — XP % from discoveries.
 * Denominators follow live catalog lengths from src/lib (Layer 2 parity).
 */
import {
  SPECIES_COUNT,
  ARTIFACT_COUNT,
  RELIC_COUNT,
} from "../../../src/lib/collectibles.js";
import { DUNGEON_PLANETS } from "../../../src/lib/dungeonData.js";

export const COLLECTION_BASE_TOTAL =
  SPECIES_COUNT + ARTIFACT_COUNT + RELIC_COUNT + DUNGEON_PLANETS.length;

export function getCollectionPercentage(character, gearTotal) {
  const species = (character?.discovered_species || []).length;
  const artifacts = (character?.collected_artifacts || []).length;
  const relics = (character?.collected_relics || []).length;
  const gear = (character?.discovered_gear || []).length;
  const badges = Math.max(0, (character?.dungeon_planet || 1) - 1);

  const discovered = species + artifacts + relics + gear + badges;
  const total = COLLECTION_BASE_TOTAL + (gearTotal || 0);
  return total > 0 ? Math.round((discovered / total) * 1000) / 10 : 0;
}

export function applyXpBonus(baseXp, percentage) {
  return Math.round(baseXp * (1 + (percentage || 0) / 100));
}
