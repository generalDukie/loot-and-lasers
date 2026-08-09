/**
 * Equipment attribute budget system.
 * Items roll only the five core attributes; combat %/HP/damage are derived elsewhere.
 *
 * Pipeline:
 *   ItemLevel → BaseGearStatBudget → SlotMult → RarityMult → TotalStatPool
 *   → select stats by rarity → min floors → random remainder → integer repair
 *
 * Common–Epic: optional per-item 60/40 Favored vs Total pool when a player class
 * is provided. Legendary: always all five stats.
 */

import { GearSaleValue } from "./stardustEconomy.js";

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

/** Slot budget multipliers — Weapon & Ship Module are 20% stronger. */
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

export const RARITY_ATTR_COUNT = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 3,
  legendary: 5,
};

/** Rarity STAT-budget multipliers (not vendor sale multipliers). */
export const RARITY_BUDGET_MULT = {
  common: 0.7,
  uncommon: 0.85,
  rare: 1.0,
  epic: 1.2,
  legendary: 1.35,
};

/** Minimum share of TotalStatPool each rolled stat must receive. */
export const RARITY_MIN_STAT_SHARE = {
  common: 1.0,
  uncommon: 0.3,
  rare: 0.2,
  epic: 0.2,
  legendary: 0.1,
};

/** @deprecated use RARITY_MIN_STAT_SHARE.legendary */
export const LEGENDARY_MIN_STAT_SHARE = 0.1;

/**
 * Rare normal-slot base budget — one continuous, monotonic, infinitely scaling
 * curve (no anchors / PCHIP / Level-500 breakpoint / cap):
 *   BaseGearStatBudget(L) = ROUND(GEAR_BUDGET_LINEAR·L + GEAR_BUDGET_CURVE·√L + GEAR_BUDGET_FLOOR)
 * Constants fit to the intended targets (L1=12 … L500=795):
 *   GEAR_BUDGET_LINEAR — overall scale + permanent high-level per-level slope
 *   GEAR_BUDGET_CURVE  — early/mid front-loading (√L bend)
 *   GEAR_BUDGET_FLOOR  — Level-1 floor offset
 */
export const GEAR_BUDGET_LINEAR = 1.4079;
export const GEAR_BUDGET_CURVE = 2.2988;
export const GEAR_BUDGET_FLOOR = 8.277;

/**
 * Full equipped-set attribute totals (balance reference for progressing-player
 * mission soft foes). NOT used for individual item BaseGearStatBudget.
 */
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

/** @deprecated full-set units; individual items use BaseGearStatBudget directly. */
export const FULL_SET_SLOT_UNITS = 8.4;

// ── Piecewise-linear waypoint helper (full-set reference only) ──

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

/**
 * Rare normal-slot base budget at item level (before slot/rarity multipliers).
 * One continuous formula for every level — the same expression evaluates at
 * L50, L500, L2000, and beyond (no breakpoint, lookup table, or cap).
 */
export function BaseGearStatBudget(itemLevel) {
  const L = Math.max(1, Math.floor(Number(itemLevel) || 1));
  return Math.max(
    1,
    Math.round(GEAR_BUDGET_LINEAR * L + GEAR_BUDGET_CURVE * Math.sqrt(L) + GEAR_BUDGET_FLOOR),
  );
}

/** Alias — Rare normal-slot base budget. */
export function getNormalSlotBudget(itemLevel) {
  return BaseGearStatBudget(itemLevel);
}

/** Expected total attributes across all 8 equipped pieces (mission soft-foe reference). */
export function getFullSetAttributeBudget(itemLevel) {
  return lerpWaypoints(itemLevel, FULL_SET_BUDGET_ANCHORS);
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

export function getRarityMinStatShare(rarity) {
  return RARITY_MIN_STAT_SHARE[rarity] ?? 0.2;
}

/**
 * Final TotalStatPool for one item.
 * ROUND(BaseGearStatBudget(level) × SlotMult × RarityMult)
 */
export function getItemStatBudget(itemLevel, type, rarity) {
  return Math.round(
    BaseGearStatBudget(itemLevel) * getSlotMultiplier(type) * getRarityBudgetMultiplier(rarity)
  );
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function resolveClassArchetype(classNameOrArchetype) {
  if (classNameOrArchetype == null || classNameOrArchetype === "") return null;
  const raw = String(classNameOrArchetype);
  const lower = raw.toLowerCase();
  if (lower === "strength" || lower === "str") return "strength";
  if (lower === "agility" || lower === "agi") return "agility";
  if (lower === "intellect" || lower === "int") return "intellect";
  if (CLASS_ARCHETYPE_BY_NAME[raw]) return CLASS_ARCHETYPE_BY_NAME[raw];
  for (const [name, arch] of Object.entries(CLASS_ARCHETYPE_BY_NAME)) {
    if (name.toLowerCase() === lower) return arch;
  }
  return null;
}

export function getFavoredStatPool(classNameOrArchetype) {
  const arch = resolveClassArchetype(classNameOrArchetype);
  if (!arch) return null;
  return [...(CLASS_FAVORED_STAT_POOLS[arch] || TOTAL_STAT_POOL)];
}

/**
 * Pick which attributes appear on an item.
 * Legendary: always all five.
 * Common–Epic with class: optional favored pool (existing intentional restriction).
 */
export function selectItemAttributes(rarity, rng = Math.random, options = {}) {
  const count = getRarityAttributeCount(rarity);
  const className = options.className;

  if (rarity === "legendary" || count >= ITEM_ATTR_KEYS.length) {
    return { attrs: [...ITEM_ATTR_KEYS], poolMode: "legendary" };
  }

  const favored = getFavoredStatPool(className);
  let pool;
  let poolMode;

  if (favored) {
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

  if (count >= pool.length) {
    return { attrs: shuffleInPlace([...pool], rng), poolMode };
  }
  return { attrs: shuffleInPlace([...pool], rng).slice(0, count), poolMode };
}

/**
 * Distribute TotalStatPool across attrs with rarity minimum floors, then
 * randomly allocate the remainder (allows heavily uneven rolls).
 * Sum of values always equals `budget` exactly.
 *
 * @param {string[]} attrs
 * @param {number} budget
 * @param {() => number} [rng]
 * @param {string} [rarity] — used for min share; inferred from attrs.length if omitted
 */
export function allocateStatBudget(attrs, budget, rng = Math.random, rarity = null) {
  const keys = Array.isArray(attrs) ? attrs.filter(Boolean) : [];
  const total = Math.max(0, Math.round(Number(budget) || 0));
  if (!keys.length || total <= 0) return {};
  if (keys.length === 1) return { [keys[0]]: total };

  const n = keys.length;
  let rarityKey = rarity;
  if (!rarityKey) {
    if (n >= 5) rarityKey = "legendary";
    else if (n === 2) rarityKey = "uncommon";
    else rarityKey = "rare";
  }
  let minRatio = getRarityMinStatShare(rarityKey);
  let minEach = Math.floor(total * minRatio);
  while (minEach > 0 && minEach * n > total) minEach -= 1;

  const reserved = minEach * n;
  const leftover = total - reserved;

  const extras = new Array(n).fill(0);
  if (leftover > 0) {
    // Free-form weights — allow near-zero extras so one stat can spike.
    const raw = keys.map(() => Math.max(1e-9, rng()));
    const wSum = raw.reduce((a, b) => a + b, 0) || 1;
    const exact = raw.map((w) => leftover * (w / wSum));
    const floors = exact.map((x) => Math.floor(x));
    let rem = leftover - floors.reduce((a, b) => a + b, 0);
    const byFrac = exact
      .map((x, i) => ({ i, frac: x - floors[i] }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let i = 0; i < n; i++) extras[i] = floors[i];
    for (let k = 0; k < rem; k++) extras[byFrac[k % n].i] += 1;
  }

  const stats = {};
  keys.forEach((k, i) => {
    stats[k] = minEach + extras[i];
  });

  // Exact-sum remainder repair (never violate floors when removing).
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
      // If still over (pathological), strip from highest.
      while (left > 0) {
        let donor = order[0];
        for (const k of order) if (stats[k] > stats[donor]) donor = k;
        if (stats[donor] <= 0) break;
        stats[donor] -= 1;
        left -= 1;
      }
    }
  }

  return stats;
}

/** @deprecated unified into allocateStatBudget(..., "legendary") */
export function allocateLegendaryStatBudget(budget, rng = Math.random) {
  return allocateStatBudget([...ITEM_ATTR_KEYS], budget, rng, "legendary");
}

/**
 * Generate item stats from level / type / rarity.
 * TotalStatPool is fixed (no post-budget variance).
 * Pass `className` for Common–Epic class-aware pool selection.
 */
export function rollItemStats({
  itemLevel,
  type,
  rarity,
  rng = Math.random,
  className,
  variancePct = 0, // ignored — TotalStatPool is authoritative
} = {}) {
  void variancePct;
  const { attrs, poolMode } = selectItemAttributes(rarity, rng, { className });
  const budget = Math.max(attrs.length, getItemStatBudget(itemLevel, type, rarity));
  const stats = allocateStatBudget(attrs, budget, rng, rarity);
  const sum = Object.values(stats).reduce((a, b) => a + (b || 0), 0);
  return {
    stats,
    budget: sum,
    attributes: attrs,
    targetBudget: budget,
    poolMode,
  };
}

/** Prompt 07 conceptual aliases — same implementations. */
export const GetGearSlotMultiplier = getSlotMultiplier;
export const GetGearRarityStatMultiplier = getRarityBudgetMultiplier;
export const GetGearStatCount = getRarityAttributeCount;
export const GetMinimumStatAllocation = getRarityMinStatShare;
export const SelectGearAttributes = selectItemAttributes;
export const AllocateGearStats = allocateStatBudget;

/**
 * Source-independent gear payload (Restoration 07).
 * Reward/shop systems choose level, type, rarity; this finalizes persistent stats.
 * `generationContext` is metadata only — it must not change budget math.
 *
 * @param {object} opts
 * @param {number} opts.itemLevel
 * @param {string} opts.itemType
 * @param {string} opts.rarity
 * @param {() => number} [opts.rng]
 * @param {string|null} [opts.className]
 * @param {object|null} [opts.generationContext]
 */
export function GenerateGearItem({
  itemLevel,
  itemType,
  rarity,
  rng = Math.random,
  className = null,
  generationContext = null,
} = {}) {
  void generationContext;
  const L = Math.max(1, Math.floor(Number(itemLevel) || 1));
  if (!Number.isFinite(L) || L < 1) {
    const err = new Error("Invalid item level");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const type = EQUIPMENT_SLOTS.includes(itemType) ? itemType : null;
  if (!type) {
    const err = new Error("Invalid gear item type");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const r = String(rarity || "").toLowerCase();
  if (!RARITY_ATTR_COUNT[r]) {
    const err = new Error("Invalid gear rarity");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const rolled = rollItemStats({
    itemLevel: L,
    type,
    rarity: r,
    rng,
    className,
  });
  const item = {
    type,
    rarity: r,
    level_requirement: L,
    level: L,
    stats: rolled.stats,
    is_equipped: false,
  };
  item.sell_value = computeItemVendorValue(item);
  return item;
}

/** Legacy vendor factors (unused by GearSaleValue; kept for shop heuristics if any). */
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
 * Stardust vendor/dissolve value — universal gear formula (level × rarity × type).
 * Source (mission/dungeon/shop) does not affect sale value.
 */
export function computeItemVendorValue(item) {
  return GearSaleValue(item);
}
