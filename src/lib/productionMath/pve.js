/**
 * AUTHORITATIVE FORMULA MODULE — PENDING CALLER MIGRATION IN LATER PHASES
 */
import { roundHalfUp, roundToMultipleOf5 } from "./rounding.js";
import {
  ARCHETYPE_INDEX_MAX,
  ATTR_INDEX,
  DUNGEON_BOSS_RARITY_WEIGHTS,
  DUNGEON_DRU,
  DUNGEON_ENCOUNTER_INDEX_MAX,
  DUNGEON_ENEMY_LEVELS,
  DUNGEON_INDEX_MAX,
  DUNGEON_REGULAR_RARITY_WEIGHTS,
  DUNGEON_UNLOCK_LEVELS,
  DUNGEON_WORMHOLE_BOSS_EPA_MULT,
  DUNGEON_WORMHOLE_ENEMY_MIN_ATTRIBUTES,
  DUNGEON_WORMHOLE_REGULAR_EPA_MULT,
  DUNGEON_XP_DRU_COEFFICIENT,
  DUNGEON_XP_SHARE_COEFFICIENT,
  DUNGEON_XP_SHARES,
  FRONTIER_BONUS_CAP,
  FRONTIER_BONUS_PER_LEVEL,
  GEAR_SLOTS,
  PVE_XP_MULTIPLIER,
  WORMHOLE_BAND_DRU_REFERENCE,
  WORMHOLE_BAND_WIDTH,
  WORMHOLE_BASE_LEVEL,
  WORMHOLE_ENCOUNTERS_PER_BAND,
  WORMHOLE_LEVEL_PER_INDEX,
} from "./constants.js";
import { missionXpPerFuel, xpToNextDruReference } from "./progression.js";
import { distributeEnemyAttributes, expectedPlayerAttributes } from "./attributes.js";
import { canonicalGearSlot } from "./gear.js";

function indexInt(n, lo, hi) {
  const v = Math.floor(Number(n) || 0);
  return Math.max(lo, Math.min(hi, v));
}

export function dungeonUnlockLevel(dungeonIndex) {
  return DUNGEON_UNLOCK_LEVELS[indexInt(dungeonIndex, 0, DUNGEON_INDEX_MAX)];
}

export function dungeonDru(dungeonIndex) {
  return DUNGEON_DRU[indexInt(dungeonIndex, 0, DUNGEON_INDEX_MAX)];
}

export function dungeonEnemyLevel(dungeonIndex, encounterIndex) {
  return DUNGEON_ENEMY_LEVELS[indexInt(dungeonIndex, 0, DUNGEON_INDEX_MAX)][indexInt(encounterIndex, 0, DUNGEON_ENCOUNTER_INDEX_MAX)];
}

export function dungeonEncounterShare(encounterIndex) {
  return DUNGEON_XP_SHARES[indexInt(encounterIndex, 0, DUNGEON_ENCOUNTER_INDEX_MAX)];
}

function pveXpFromDru(dru, share, referenceLevel) {
  return roundHalfUp(
    dru
    * share
    * missionXpPerFuel(referenceLevel)
    * DUNGEON_XP_SHARE_COEFFICIENT
    * DUNGEON_XP_DRU_COEFFICIENT,
  );
}

/** ROUND(DRU * share * mission_xpf(enemyL) * 0.87 * 2.10) then ROUND(* 1.25). No Frontier. */
export function dungeonEncounterXp(dungeonIndex, encounterIndex) {
  const d = indexInt(dungeonIndex, 0, DUNGEON_INDEX_MAX);
  const j = indexInt(encounterIndex, 0, DUNGEON_ENCOUNTER_INDEX_MAX);
  const raw = pveXpFromDru(DUNGEON_DRU[d], DUNGEON_XP_SHARES[j], DUNGEON_ENEMY_LEVELS[d][j]);
  return roundHalfUp(raw * PVE_XP_MULTIPLIER);
}

export function dungeonEncounterXpPreMultiplier(dungeonIndex, encounterIndex) {
  const d = indexInt(dungeonIndex, 0, DUNGEON_INDEX_MAX);
  const j = indexInt(encounterIndex, 0, DUNGEON_ENCOUNTER_INDEX_MAX);
  return pveXpFromDru(DUNGEON_DRU[d], DUNGEON_XP_SHARES[j], DUNGEON_ENEMY_LEVELS[d][j]);
}

/** wormlevel(index) = 202 + 2*index. Genuinely infinite. */
export function wormholeEnemyLevel(encounterIndex) {
  const idx = Math.max(0, Math.floor(Number(encounterIndex) || 0));
  return WORMHOLE_BASE_LEVEL + WORMHOLE_LEVEL_PER_INDEX * idx;
}

export function wormholeBandIndex(encounterIndex) {
  const idx = Math.max(0, Math.floor(Number(encounterIndex) || 0));
  return Math.floor(idx / WORMHOLE_ENCOUNTERS_PER_BAND) + 1;
}

function wormholeBandWeight(band) {
  const B = Math.max(1, Math.floor(Number(band) || 1));
  const start = WORMHOLE_BASE_LEVEL + WORMHOLE_BAND_WIDTH * (B - 1) - 1;
  let prog = 0;
  for (let L = start; L < start + WORMHOLE_BAND_WIDTH; L++) {
    prog += xpToNextDruReference(L);
  }
  let prim = 0;
  for (let i = 0; i < WORMHOLE_ENCOUNTERS_PER_BAND; i++) {
    prim += DUNGEON_XP_SHARES[i] * missionXpPerFuel(
      WORMHOLE_BASE_LEVEL + WORMHOLE_BAND_WIDTH * (B - 1) + WORMHOLE_LEVEL_PER_INDEX * i,
    );
  }
  prim *= DUNGEON_XP_SHARE_COEFFICIENT * DUNGEON_XP_DRU_COEFFICIENT;
  return prog / prim;
}

let _weight1 = null;
function wormholeWeight1() {
  if (_weight1 == null) _weight1 = wormholeBandWeight(1);
  return _weight1;
}

export function wormholeBandDru(band) {
  const B = Math.max(1, Math.floor(Number(band) || 1));
  return roundToMultipleOf5(WORMHOLE_BAND_DRU_REFERENCE * wormholeBandWeight(B) / wormholeWeight1());
}

export function wormholeEncounterXpPreMultiplier(encounterIndex) {
  const idx = Math.max(0, Math.floor(Number(encounterIndex) || 0));
  const band = wormholeBandIndex(idx);
  const j = idx % WORMHOLE_ENCOUNTERS_PER_BAND;
  return pveXpFromDru(wormholeBandDru(band), DUNGEON_XP_SHARES[j], wormholeEnemyLevel(idx));
}

export function wormholeEncounterXp(encounterIndex) {
  return roundHalfUp(wormholeEncounterXpPreMultiplier(encounterIndex) * PVE_XP_MULTIPLIER);
}

/** Dungeon/Wormhole victory XP only. Does not boost Gear or Stardust. */
export function frontierBonusPct(enemyLevel, playerLevelAtVictory) {
  const diff = Math.max(0, Math.floor(Number(enemyLevel) || 0) - Math.floor(Number(playerLevelAtVictory) || 0));
  return Math.min(FRONTIER_BONUS_CAP, FRONTIER_BONUS_PER_LEVEL * diff);
}

export function applyFrontierBonus(baseXp, bonusPct) {
  return roundHalfUp((Number(baseXp) || 0) * (1 + (Number(bonusPct) || 0)));
}

export function isDungeonWormholeBossEncounter(encounterIndex) {
  return indexInt(encounterIndex, 0, DUNGEON_ENCOUNTER_INDEX_MAX) === DUNGEON_ENCOUNTER_INDEX_MAX;
}

export function wormholeEncounterInBandIndex(encounterIndex) {
  const idx = Math.max(0, Math.floor(Number(encounterIndex) || 0));
  return idx % WORMHOLE_ENCOUNTERS_PER_BAND;
}

export function wormholeAbsoluteIndex(band, encounterInBandIndex) {
  const B = Math.max(1, Math.floor(Number(band) || 1));
  const j = indexInt(encounterInBandIndex, 0, DUNGEON_ENCOUNTER_INDEX_MAX);
  return (B - 1) * WORMHOLE_ENCOUNTERS_PER_BAND + j;
}

/**
 * Regular: rround(production EPA × 1.20). Boss: rround(production EPA × 1.30).
 * Boss replaces regular; never 1.20×1.30.
 */
export function dungeonWormholeEnemyAttributeTotal(enemyLevel, isBoss = false) {
  const L = Math.max(1, Math.floor(Number(enemyLevel) || 1));
  const mult = isBoss ? DUNGEON_WORMHOLE_BOSS_EPA_MULT : DUNGEON_WORMHOLE_REGULAR_EPA_MULT;
  return Math.max(
    DUNGEON_WORMHOLE_ENEMY_MIN_ATTRIBUTES,
    roundHalfUp(expectedPlayerAttributes(L) * mult),
  );
}

export function dungeonWormholeEnemyAttributes(enemyLevel, isBoss = false, archetypeIndex = 0) {
  const total = dungeonWormholeEnemyAttributeTotal(enemyLevel, isBoss);
  const arch = indexInt(archetypeIndex, 0, ARCHETYPE_INDEX_MAX);
  const arr = distributeEnemyAttributes(total, arch);
  return {
    total,
    archetypeIndex: arch,
    attributes: {
      strength: arr[ATTR_INDEX.str],
      agility: arr[ATTR_INDEX.agi],
      intellect: arr[ATTR_INDEX.int],
      vitality: arr[ATTR_INDEX.vit],
      luck: arr[ATTR_INDEX.luck],
    },
  };
}

export function dungeonVictoryXpBundle(dungeonIndex, encounterIndex, playerLevelAtVictory) {
  const baseXp = dungeonEncounterXp(dungeonIndex, encounterIndex);
  const enemyLevel = dungeonEnemyLevel(dungeonIndex, encounterIndex);
  const playerLevel = Math.max(1, Math.floor(Number(playerLevelAtVictory) || 1));
  const frontierPct = frontierBonusPct(enemyLevel, playerLevel);
  const finalXp = applyFrontierBonus(baseXp, frontierPct);
  return {
    baseXp,
    enemyLevel,
    playerLevelAtVictory: playerLevel,
    frontierPct,
    frontierAmount: finalXp - baseXp,
    finalXp,
  };
}

export function wormholeVictoryXpBundle(encounterIndex, playerLevelAtVictory) {
  const idx = Math.max(0, Math.floor(Number(encounterIndex) || 0));
  const baseXp = wormholeEncounterXp(idx);
  const enemyLevel = wormholeEnemyLevel(idx);
  const playerLevel = Math.max(1, Math.floor(Number(playerLevelAtVictory) || 1));
  const frontierPct = frontierBonusPct(enemyLevel, playerLevel);
  const finalXp = applyFrontierBonus(baseXp, frontierPct);
  return {
    baseXp,
    enemyLevel,
    playerLevelAtVictory: playerLevel,
    frontierPct,
    frontierAmount: finalXp - baseXp,
    finalXp,
    band: wormholeBandIndex(idx),
    encounterInBandIndex: wormholeEncounterInBandIndex(idx),
  };
}

function requireRng(rng, label) {
  if (typeof rng !== "function") {
    throw new Error(`${label} requires injected RNG`);
  }
  return rng;
}

function unitHalfOpen(rng) {
  const u = Number(rng());
  if (!Number.isFinite(u) || u < 0) return 0;
  if (u >= 1) return 1 - Number.EPSILON;
  return u;
}

function pickWeightedRecord(weights, rng, label) {
  const r = requireRng(rng, label);
  const entries = Object.entries(weights).filter(([, w]) => Number(w) > 0);
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  let roll = unitHalfOpen(r) * total;
  for (const [key, w] of entries) {
    roll -= Number(w);
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

export function rollDungeonRegularRarity(rng) {
  return pickWeightedRecord(DUNGEON_REGULAR_RARITY_WEIGHTS, rng, "rollDungeonRegularRarity");
}

export function rollDungeonBossRarity(rng) {
  return pickWeightedRecord(DUNGEON_BOSS_RARITY_WEIGHTS, rng, "rollDungeonBossRarity");
}

export function rollDungeonWormholeGearSlot(rng) {
  const r = requireRng(rng, "rollDungeonWormholeGearSlot");
  return canonicalGearSlot(GEAR_SLOTS[Math.floor(unitHalfOpen(r) * GEAR_SLOTS.length)]) || GEAR_SLOTS[0];
}
