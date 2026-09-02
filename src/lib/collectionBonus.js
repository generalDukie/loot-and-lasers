// ═══════════════════════════════════════════
// COLLECTION BONUS — total collection % = XP bonus %
// Every collectible discovered (species, artifacts, relics, gear, badges)
// increases the total collection percentage, which is applied as a flat
// XP bonus to all XP sources (missions, arena, dungeon, daily login, mail).
// ═══════════════════════════════════════════
import { ALIEN_SPECIES, ARTIFACTS, RELICS } from "@/lib/collectibles";
import { DUNGEON_PLANETS } from "@/lib/dungeonData";
import { dungeonBadgeCount } from "@/lib/dungeonBadges";
import { GEAR_CATALOG_TOTAL } from "@/lib/gameData";

const PERCENT_SCALE = 100;
const PERCENT_DECIMAL_SCALE = 10;
const PERCENT_ROUNDING_SCALE = PERCENT_SCALE * PERCENT_DECIMAL_SCALE;

// Fixed totals for non-gear categories (gear uses the static catalog size).
export const COLLECTION_BASE_TOTAL =
  ALIEN_SPECIES.length + ARTIFACTS.length + RELICS.length + DUNGEON_PLANETS.length;

// Computes the total collection percentage across all collectible categories.
export function getCollectionStats(character, gearTotal = GEAR_CATALOG_TOTAL) {
  const species = (character?.discovered_species || []).length;
  const artifacts = (character?.collected_artifacts || []).length;
  const relics = (character?.collected_relics || []).length;
  const gear = (character?.discovered_gear || []).length;
  const badges = dungeonBadgeCount(character);

  const discovered = species + artifacts + relics + gear + badges;
  const total = COLLECTION_BASE_TOTAL + gearTotal;
  const percentage = total > 0
    ? Math.round((discovered / total) * PERCENT_ROUNDING_SCALE) / PERCENT_DECIMAL_SCALE
    : 0;

  return { discovered, total, percentage };
}

// Applies the collection XP bonus to a base XP value.
export function applyXpBonus(baseXp, percentage) {
  return Math.round(baseXp * (1 + (percentage || 0) / PERCENT_SCALE));
}
