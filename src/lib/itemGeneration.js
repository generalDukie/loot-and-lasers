/**
 * Equipment attribute budget system (V1).
 * Items roll only the five core attributes; combat %/HP/damage are derived elsewhere.
 *
 * Full-set budget anchors → normal slot = full/8.4 → × slot × rarity → allocate.
 *
 * Common–Epic: optional per-item 60/40 Favored vs Total pool when a player class
 * is provided. Legendary: always all five stats, class-neutral, ≥10% floor each.
 */

export const ITEM_ATTR_KEYS = ["strength", "agility", "intellect", "vitality", "luck"];

/** Full five-stat pool — identical for every class. */
export const TOTAL_STAT_POOL = ["strength", "agility", "intellect", "vitality", "luck"];

/**
 * Class-favored attribute pools (Common–Epic only).
 * Keys are archetypes: strength / agility / intellect.
 */
export const CLASS_FAVORED_STAT_POOLS = {
  strength: ["strength", "vitality", "luck"],
  agility: ["agility", "vitality", "luck"],
  intellect: ["intellect", "vitality", "luck"],
};

/** Map playable class names → archetype for favored-pool lookup. */
export const CLASS_ARCHETYPE_BY_NAME = {
  Vanguard: "strength",
  "Astral Warden": "strength",
  "Shadow Operative": "agility",
  "Void Runner": "agility",
  Technomancer: "intellect",
  "Cosmic Engineer": "intellect",
};

/** Chance the entire Common–Epic item uses the Favored Stat Pool (else Total). */
export const FAVORED_POOL_CHANCE = 0.6;

/** Legendary: each attribute receives at least this share of the total budget. */
export const LEGENDARY_MIN_STAT_SHARE = 0.1;

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

/** Slot budget multipliers — Weapon & Ship Module are ~20% stronger. */
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

/** Total slot-budget units in a full set: 6×1.0 + 2×1.2 = 8.4 */
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

/** Full equipped-set attribute totals (balance anchors). Level 1 uses mid of 10–15. */
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

/** Expected total attributes across all 8 equipped pieces at this item level. */
export function getFullSetAttributeBudget(itemLevel) {
  return lerpWaypoints(itemLevel, FULL_SET_BUDGET_ANCHORS);
}

/** Baseline normal-slot budget (before rarity) at this item level. */
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

/**
 * Final attribute budget for one item (before random variance).
 * FinalItemStatBudget = NormalSlotBudget × SlotMult × RarityMult
 */
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

/**
 * Resolve a class name or archetype string to strength|agility|intellect.
 * Returns null when no player/class context is available.
 */
export function resolveClassArchetype(classNameOrArchetype) {
  if (classNameOrArchetype == null || classNameOrArchetype === "") return null;
  const raw = String(classNameOrArchetype);
  const lower = raw.toLowerCase();
  if (lower === "strength" || lower === "str") return "strength";
  if (lower === "agility" || lower === "agi") return "agility";
  if (lower === "intellect" || lower === "int") return "intellect";
  if (CLASS_ARCHETYPE_BY_NAME[raw]) return CLASS_ARCHETYPE_BY_NAME[raw];
  // Case-insensitive class name match
  for (const [name, arch] of Object.entries(CLASS_ARCHETYPE_BY_NAME)) {
    if (name.toLowerCase() === lower) return arch;
  }
  return null;
}

/** Favored pool for a class, or null if class context is missing. */
export function getFavoredStatPool(classNameOrArchetype) {
  const arch = resolveClassArchetype(classNameOrArchetype);
  if (!arch) return null;
  return [...(CLASS_FAVORED_STAT_POOLS[arch] || TOTAL_STAT_POOL)];
}

/**
 * Pick which attributes appear on an item.
 *
 * Legendary: always all five (class-neutral — no 60/40).
 * Common–Epic with class context: ONE 60/40 roll for the whole item, then
 * select all unique attrs from that single chosen pool.
 * Without class context: neutral shuffle from Total Stat Pool (legacy behavior).
 *
 * @returns {{ attrs: string[], poolMode: 'favored'|'total'|'legendary'|'neutral' }}
 */
export function selectItemAttributes(rarity, rng = Math.random, options = {}) {
  const count = getRarityAttributeCount(rarity);
  const className = options.className;

  // Legendary — completely separate: all five, no pool mode.
  if (rarity === "legendary" || count >= ITEM_ATTR_KEYS.length) {
    return { attrs: [...ITEM_ATTR_KEYS], poolMode: "legendary" };
  }

  const favored = getFavoredStatPool(className);
  let pool;
  let poolMode;

  if (favored) {
    // ONE roll per item — not per attribute.
    if (rng() < FAVORED_POOL_CHANCE) {
      pool = favored;
      poolMode = "favored";
    } else {
      pool = [...TOTAL_STAT_POOL];
      poolMode = "total";
    }
  } else {
    pool = [...TOTAL_STAT_POOL];
    poolMode = "neutral";
  }

  // Rare/Epic favored: pool has exactly 3 → use all three unique attrs.
  if (count >= pool.length) {
    return { attrs: shuffleInPlace([...pool], rng), poolMode };
  }
  return { attrs: shuffleInPlace([...pool], rng).slice(0, count), poolMode };
}

/**
 * Distribute `budget` across `attrs` with randomized weights.
 * Guarantees sum(values) === budget after integer allocation (largest remainder).
 * Rejects pathological dumps via min/max share clamps.
 */
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
    // Fall back: equal shares + mild noise, then re-clamp & renormalize.
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

  // Every selected attr gets ≥1 when the budget allows.
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

/**
 * Legendary distribution: class-neutral, all five stats.
 * Reserve ~10% of budget for each attribute, then randomly distribute the rest
 * (extras may be zero so one stat can sit at the floor while another spikes).
 * Final values always sum exactly to `budget`.
 */
export function allocateLegendaryStatBudget(budget, rng = Math.random) {
  const keys = [...ITEM_ATTR_KEYS];
  const n = keys.length;
  const total = Math.max(n, Math.round(budget || 0));

  let minEach = Math.floor(total * LEGENDARY_MIN_STAT_SHARE);
  while (minEach > 0 && minEach * n > total) minEach -= 1;

  const reserved = minEach * n;
  const leftover = total - reserved;

  // Free-form remainder weights — allow 0 extra on some stats.
  const extras = new Array(n).fill(0);
  if (leftover > 0) {
    const raw = keys.map(() => rng());
    const wSum = raw.reduce((a, b) => a + b, 0) || 1;
    const exact = raw.map((w) => leftover * (w / wSum));
    const floors = exact.map((x) => Math.floor(x));
    let rem = leftover - floors.reduce((a, b) => a + b, 0);
    const byFrac = exact
      .map((x, i) => ({ i, frac: x - floors[i] }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let i = 0; i < n; i++) extras[i] = floors[i];
    for (let k = 0; k < rem; k++) extras[byFrac[k].i] += 1;
  }

  const stats = {};
  keys.forEach((k, i) => { stats[k] = minEach + extras[i]; });

  // Exact-sum safety (should already match).
  let sum = keys.reduce((a, k) => a + stats[k], 0);
  if (sum !== total) {
    const delta = total - sum;
    const order = shuffleInPlace([...keys], rng);
    if (delta > 0) {
      for (let i = 0; i < delta; i++) stats[order[i % n]] += 1;
    } else {
      let left = -delta;
      for (const k of order) {
        if (left <= 0) break;
        const can = Math.max(0, stats[k] - minEach);
        const take = Math.min(can, left);
        stats[k] -= take;
        left -= take;
      }
    }
  }

  return stats;
}

/**
 * Apply ±variancePct around the target budget, then allocate.
 * Pass `className` for Common–Epic class-aware pool selection.
 * Returns { stats, budget, attributes, targetBudget, poolMode }.
 */
export function rollItemStats({
  itemLevel,
  type,
  rarity,
  rng = Math.random,
  variancePct = 0.08,
  className,
} = {}) {
  const { attrs, poolMode } = selectItemAttributes(rarity, rng, { className });
  const target = getItemStatBudget(itemLevel, type, rarity);
  const lo = 1 - variancePct;
  const hi = 1 + variancePct;
  let budget = Math.round(target * (lo + rng() * (hi - lo)));
  budget = Math.max(attrs.length, budget);

  const stats = rarity === "legendary"
    ? allocateLegendaryStatBudget(budget, rng)
    : allocateStatBudget(attrs, budget, rng);

  const sum = Object.values(stats).reduce((a, b) => a + (b || 0), 0);
  return {
    stats,
    budget: sum,
    attributes: attrs,
    targetBudget: target,
    poolMode,
  };
}

/** Vendor sell factor by rarity (budget already embeds level). */
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

/**
 * Stardust vendor/dissolve value — scales with attribute budget, rarity, and slot.
 * Level is already reflected in the rolled budget, so we avoid a second steep level curve.
 */
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
  // 10× stardust resolution — apply once at vendor exit (not to Nova).
  return Math.max(1, Math.round(statSum * rarityF * typeW * 10));
}
