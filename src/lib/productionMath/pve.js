/**
 * AUTHORITATIVE FORMULA MODULE — PENDING CALLER MIGRATION IN LATER PHASES
 */
import { roundHalfUp, roundToMultipleOf5 } from "./rounding.js";
import {
  DUNGEON_DRU,
  DUNGEON_ENEMY_LEVELS,
  DUNGEON_UNLOCK_LEVELS,
  DUNGEON_XP_DRU_COEFFICIENT,
  DUNGEON_XP_SHARE_COEFFICIENT,
  DUNGEON_XP_SHARES,
  FRONTIER_BONUS_CAP,
  FRONTIER_BONUS_PER_LEVEL,
  PVE_XP_MULTIPLIER,
  WORMHOLE_BAND_DRU_REFERENCE,
  WORMHOLE_BAND_WIDTH,
  WORMHOLE_BASE_LEVEL,
  WORMHOLE_ENCOUNTERS_PER_BAND,
  WORMHOLE_LEVEL_PER_INDEX,
} from "./constants.js";
import { missionXpPerFuel, xpToNextDruReference } from "./progression.js";

function indexInt(n, lo, hi) {
  const v = Math.floor(Number(n) || 0);
  return Math.max(lo, Math.min(hi, v));
}

export function dungeonUnlockLevel(dungeonIndex) {
  return DUNGEON_UNLOCK_LEVELS[indexInt(dungeonIndex, 0, 9)];
}

export function dungeonDru(dungeonIndex) {
  return DUNGEON_DRU[indexInt(dungeonIndex, 0, 9)];
}

export function dungeonEnemyLevel(dungeonIndex, encounterIndex) {
  return DUNGEON_ENEMY_LEVELS[indexInt(dungeonIndex, 0, 9)][indexInt(encounterIndex, 0, 9)];
}

export function dungeonEncounterShare(encounterIndex) {
  return DUNGEON_XP_SHARES[indexInt(encounterIndex, 0, 9)];
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
  const d = indexInt(dungeonIndex, 0, 9);
  const j = indexInt(encounterIndex, 0, 9);
  const raw = pveXpFromDru(DUNGEON_DRU[d], DUNGEON_XP_SHARES[j], DUNGEON_ENEMY_LEVELS[d][j]);
  return roundHalfUp(raw * PVE_XP_MULTIPLIER);
}

export function dungeonEncounterXpPreMultiplier(dungeonIndex, encounterIndex) {
  const d = indexInt(dungeonIndex, 0, 9);
  const j = indexInt(encounterIndex, 0, 9);
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
  const start = 201 + WORMHOLE_BAND_WIDTH * (B - 1);
  let prog = 0;
  for (let L = start; L < start + WORMHOLE_BAND_WIDTH; L++) {
    prog += xpToNextDruReference(L);
  }
  let prim = 0;
  for (let i = 0; i < WORMHOLE_ENCOUNTERS_PER_BAND; i++) {
    prim += DUNGEON_XP_SHARES[i] * missionXpPerFuel(202 + WORMHOLE_BAND_WIDTH * (B - 1) + 2 * i);
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
