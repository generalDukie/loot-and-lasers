/**
 * Persisted Character.stats helpers — compose starting + free-from-level + purchases.
 * Gear, Stims, Ship/Hangar, Collection/Nexus are not baked into persisted stats.
 */
import { ATTR_STAT_KEYS } from "./gameData.js";
import {
  startingAttributesForClass,
  freeLevelAttributes,
  classPrimaryIndex,
  PERMANENT_ATTRIBUTE_POINTS_PER_PURCHASE,
} from "./productionMath/index.js";

export { ATTR_STAT_KEYS };

const EMPTY_PURCHASES = Object.freeze({
  strength: 0,
  agility: 0,
  intellect: 0,
  vitality: 0,
  luck: 0,
});

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
  const a = startingAttributesForClass(className);
  return normalizeAttrStats({
    strength: a[0],
    agility: a[1],
    intellect: a[2],
    vitality: a[3],
    luck: a[4],
  });
}

export function readPurchasesByStat(character) {
  const out = { ...EMPTY_PURCHASES };
  const by = character?.attribute_purchases_by_stat;
  if (by && typeof by === "object") {
    for (const k of ATTR_STAT_KEYS) {
      out[k] = Math.max(0, Math.floor(Number(by[k]) || 0));
    }
  }
  return out;
}

/**
 * Authoritative permanent attributes:
 * class starting + certified freeLevelAttributes(level) + purchased.
 */
export function composePermanentAttributes(character) {
  const className = character?.class || "";
  const level = Math.max(1, Math.floor(Number(character?.level) || 1));
  const start = startingAttributesForClass(className);
  const free = freeLevelAttributes(level, classPrimaryIndex(className));
  const purchased = readPurchasesByStat(character);
  const stats = {};
  for (let i = 0; i < ATTR_STAT_KEYS.length; i++) {
    const k = ATTR_STAT_KEYS[i];
    stats[k] = start[i] + free[i] + purchased[k] * PERMANENT_ATTRIBUTE_POINTS_PER_PURCHASE;
  }
  return stats;
}

function statsEqual(a, b) {
  for (const k of ATTR_STAT_KEYS) {
    if ((a[k] || 0) !== (b[k] || 0)) return false;
  }
  return true;
}

/** True when persisted stats drift from composed production components. */
export function permanentStatsNeedClassBaseRepair(character) {
  const expected = composePermanentAttributes(character);
  const current = normalizeAttrStats(parseStoredStats(character?.stats));
  return !statsEqual(current, expected);
}

/**
 * Recompute persisted stats from starting + free-from-level + purchases.
 * Ignores stale stored totals (development data is disposable).
 */
export function repairPermanentAttributes(character) {
  const expected = composePermanentAttributes(character);
  const current = normalizeAttrStats(parseStoredStats(character?.stats));
  return { stats: expected, repaired: !statsEqual(current, expected) };
}

export function resolvePermanentAttributes(character) {
  return composePermanentAttributes(character);
}
