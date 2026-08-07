/**
 * Persisted Character.stats helpers — class base repair + normalization.
 * Each class starts with 50 permanent attribute points (STR / AGI / INT spread).
 */
import { CLASSES, ATTR_STAT_KEYS } from "./gameData.js";

export { ATTR_STAT_KEYS };

const BASE_STAT_TOTAL = 50;

export function parseStoredStats(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed && !Array.isArray(parsed) ? { ...parsed } : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...raw };
  return {};
}

export function normalizeAttrStats(stats) {
  const out = {};
  for (const k of ATTR_STAT_KEYS) {
    out[k] = Math.max(0, Math.round(Number(stats?.[k]) || 0));
  }
  return out;
}

export function sumAttrStats(stats) {
  return ATTR_STAT_KEYS.reduce(
    (sum, k) => sum + Math.max(0, Math.round(Number(stats?.[k]) || 0)),
    0,
  );
}

export function classBaseStats(className) {
  const base = CLASSES[className]?.baseStats;
  if (!base || typeof base !== "object") return null;
  return normalizeAttrStats(base);
}

/** True when persisted stats are missing the class base spread (sum < 50). */
export function permanentStatsNeedClassBaseRepair(character) {
  const base = classBaseStats(character?.class);
  if (!base) return false;
  const current = normalizeAttrStats(parseStoredStats(character?.stats));
  return sumAttrStats(current) < BASE_STAT_TOTAL;
}

/**
 * Merge class base into stored stats when the base spread was never applied.
 * Preserves level-up grants / purchases already stored (added on top of base).
 */
export function repairPermanentAttributes(character) {
  const className = character?.class || "";
  const base = classBaseStats(className);
  const current = normalizeAttrStats(parseStoredStats(character?.stats));
  if (!base) return { stats: current, repaired: false };

  if (sumAttrStats(current) >= BASE_STAT_TOTAL) {
    return { stats: current, repaired: false };
  }

  const repaired = {};
  for (const k of ATTR_STAT_KEYS) {
    repaired[k] = Math.max(0, Math.round(Number(base[k]) || 0))
      + Math.max(0, Math.round(Number(current[k]) || 0));
  }
  return { stats: repaired, repaired: true };
}

export function resolvePermanentAttributes(character) {
  return repairPermanentAttributes(character).stats;
}
