/**
 * Equipment attribute budget system (V1) — server mirror of src/lib/itemGeneration.js.
 * Keep formulas identical; live loot/shop call through randomItem → rollItemStats.
 */

export const ITEM_ATTR_KEYS = ["strength", "agility", "intellect", "vitality", "luck"];

export const EQUIPMENT_SLOTS = [
  "helmet",
  "armor",
  "legs",
  "boots",
  "weapon",
  "neck",
  "accessory",
  "ship_module",
];

export const SLOT_STAT_MULT = {
  helmet: 1.0,
  armor: 1.0,
  legs: 1.0,
  boots: 1.0,
  neck: 1.0,
  accessory: 1.0,
  weapon: 1.2,
  ship_module: 1.2,
};

export const FULL_SET_SLOT_UNITS = 8.4;

export const RARITY_ATTR_COUNT = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 3,
  legendary: 5,
};

export const RARITY_BUDGET_MULT = {
  common: 0.7,
  uncommon: 0.85,
  rare: 1.0,
  epic: 1.2,
  legendary: 1.35,
};

export const FULL_SET_BUDGET_ANCHORS = [
  [1, 12.5],
  [10, 245],
  [25, 480],
  [50, 825],
  [100, 1405],
  [200, 2545],
  [300, 3930],
  [400, 5305],
  [500, 6675],
];

function lerpWaypoints(level, points) {
  const L = Math.max(1, Number(level) || 1);
  if (L <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (L <= x1) {
      const t = (L - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  const [xA, yA] = points[points.length - 2];
  const [xB, yB] = points[points.length - 1];
  const slope = (yB - yA) / (xB - xA);
  return yB + slope * (L - xB);
}

export function getFullSetAttributeBudget(itemLevel) {
  return lerpWaypoints(itemLevel, FULL_SET_BUDGET_ANCHORS);
}

export function getNormalSlotBudget(itemLevel) {
  return getFullSetAttributeBudget(itemLevel) / FULL_SET_SLOT_UNITS;
}

export function getSlotMultiplier(type) {
  return SLOT_STAT_MULT[type] ?? 1.0;
}

export function getRarityBudgetMultiplier(rarity) {
  return RARITY_BUDGET_MULT[rarity] ?? 1.0;
}

export function getRarityAttributeCount(rarity) {
  return RARITY_ATTR_COUNT[rarity] ?? 1;
}

export function getItemStatBudget(itemLevel, type, rarity) {
  const base = getNormalSlotBudget(itemLevel);
  return base * getSlotMultiplier(type) * getRarityBudgetMultiplier(rarity);
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function selectItemAttributes(rarity, rng = Math.random) {
  const count = getRarityAttributeCount(rarity);
  if (count >= ITEM_ATTR_KEYS.length) return [...ITEM_ATTR_KEYS];
  const pool = shuffleInPlace([...ITEM_ATTR_KEYS], rng);
  return pool.slice(0, count);
}

export function allocateStatBudget(attrs, budget, rng = Math.random) {
  const keys = Array.isArray(attrs) ? attrs.filter(Boolean) : [];
  const total = Math.max(0, Math.round(budget || 0));
  if (!keys.length || total <= 0) return {};
  if (keys.length === 1) return { [keys[0]]: total };

  const n = keys.length;
  const maxShare = n === 2 ? 0.72 : n === 3 ? 0.55 : 0.38;
  const minShare = n === 2 ? 0.28 : n === 3 ? 0.18 : 0.10;

  let weights = null;
  for (let attempt = 0; attempt < 48; attempt++) {
    const raw = keys.map(() => 0.15 + rng());
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const normalized = raw.map((w) => w / sum);
    if (normalized.every((w) => w >= minShare - 1e-9 && w <= maxShare + 1e-9)) {
      weights = normalized;
      break;
    }
  }
  if (!weights) {
    weights = keys.map(() => 1 / n);
    weights = weights.map((w) => {
      const jitter = (rng() - 0.5) * (maxShare - minShare) * 0.6;
      return Math.min(maxShare, Math.max(minShare, w + jitter));
    });
    const s = weights.reduce((a, b) => a + b, 0) || 1;
    weights = weights.map((w) => w / s);
  }

  const exact = weights.map((w) => total * w);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const byFrac = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const values = [...floors];
  for (let k = 0; k < remainder; k++) values[byFrac[k].i] += 1;

  if (total >= n) {
    for (let i = 0; i < n; i++) {
      if (values[i] >= 1) continue;
      let donor = 0;
      for (let j = 1; j < n; j++) if (values[j] > values[donor]) donor = j;
      if (values[donor] > 1) {
        values[donor] -= 1;
        values[i] = 1;
      }
    }
  }

  const stats = {};
  keys.forEach((k, i) => { stats[k] = values[i]; });
  return stats;
}

export function rollItemStats({
  itemLevel,
  type,
  rarity,
  rng = Math.random,
  variancePct = 0.08,
} = {}) {
  const attrs = selectItemAttributes(rarity, rng);
  const target = getItemStatBudget(itemLevel, type, rarity);
  const lo = 1 - variancePct;
  const hi = 1 + variancePct;
  let budget = Math.round(target * (lo + rng() * (hi - lo)));
  budget = Math.max(attrs.length, budget);
  const stats = allocateStatBudget(attrs, budget, rng);
  const sum = Object.values(stats).reduce((a, b) => a + (b || 0), 0);
  return { stats, budget: sum, attributes: attrs, targetBudget: target };
}

export const RARITY_SELL_FACTOR = {
  common: 0.55,
  uncommon: 0.7,
  rare: 0.9,
  epic: 1.15,
  legendary: 1.4,
};

export const ITEM_SELL_TYPE_WEIGHT = {
  weapon: 1.4,
  armor: 1.2,
  helmet: 1.0,
  boots: 1.0,
  legs: 1.0,
  neck: 1.1,
  accessory: 1.15,
  ship_module: 1.35,
  material: 0.5,
  consumable: 0.6,
};

export function computeItemVendorValue(item) {
  if (!item) return 1;
  if (item.type === "consumable" || item.type === "material") {
    const flat = item.sell_value;
    if (typeof flat === "number" && flat > 0) return Math.max(1, Math.round(flat));
  }
  const statSum = item.stats
    ? Object.values(item.stats).reduce((a, b) => a + (b || 0), 0)
    : 0;
  if (statSum <= 0) {
    return Math.max(1, Math.round(item.sell_value || 1));
  }
  const rarityF = RARITY_SELL_FACTOR[item.rarity] ?? 0.9;
  const typeW = ITEM_SELL_TYPE_WEIGHT[item.type] ?? 1;
  return Math.max(1, Math.round(statSum * rarityF * typeW));
}
