/**
 * Equipment attribute budget system.
 * Items roll only the five core attributes; combat %/HP/damage are derived elsewhere.
 *
 * Pipeline:
 *   ItemLevel → BaseGearStatBudget → SlotMult → RarityMult → pre-variance pool
 *   → intrinsic Uniform(GEAR_STAT_BUDGET_VARIANCE_MIN, GEAR_STAT_BUDGET_VARIANCE_MAX)
 *   → ROUND → select stats by rarity → min floors → random remainder → integer repair
 *
 * Common–Epic: optional per-item 60/40 Favored vs Total pool when a player class
 * is provided. Legendary: always all five stats.
 */

import {
  BASIS_POINTS_DENOMINATOR,
  GEAR_BUDGET_CURVE,
  GEAR_BUDGET_FLOOR,
  GEAR_BUDGET_LINEAR,
  GEAR_RARITY_BUDGET_MULT,
  GEAR_SLOT_NORMAL_MULT,
  GEAR_SLOT_PREMIUM_MULT,
  GEAR_SLOTS,
  GEAR_STAT_POOL_DESIRABLE,
  GEAR_STAT_POOL_IDS,
  GEAR_STAT_POOL_NORMAL,
  GEAR_STAT_POOL_PARTIAL_A,
  GEAR_STAT_POOL_PARTIAL_B,
  GEAR_STAT_POOL_PARTIAL_B_BLOCKED_RARITIES,
  LEGENDARY_PARTIAL_A_OFF_SHARE_BPS,
  LEGENDARY_PARTIAL_B_OFF_SHARE_BPS,
  PREMIUM_GEAR_SLOTS,
  SIMULATE_PARTIAL_A_OFF_COUNT,
  canonicalGearOrigin,
  canonicalGearSlot,
  defaultShipmentEligible,
  gearBaseStatBudget,
  gearRarityBudgetMultiplier,
  gearResaleValue,
  gearSlotMultiplier,
  gearStatPool,
  applyGearStatBudgetVariance,
  rollGearStatBudgetVariance,
  resolveGearLevelRefs,
  roundHalfUp,
  stimEconomicLevel,
  stimSellValueResolved,
  resolveStimRarity,
} from "./productionMath/index.js";

export {
  GEAR_STAT_POOL_DESIRABLE,
  GEAR_STAT_POOL_IDS,
  GEAR_STAT_POOL_NORMAL,
  GEAR_STAT_POOL_PARTIAL_A,
  GEAR_STAT_POOL_PARTIAL_B,
  LEGENDARY_PARTIAL_A_OFF_SHARE_BPS,
  LEGENDARY_PARTIAL_B_OFF_SHARE_BPS,
};

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

/** Slot budget multipliers — Weapon & Ship Module use GEAR_SLOT_PREMIUM_MULT. */
export const SLOT_STAT_MULT = Object.freeze(Object.fromEntries(
  GEAR_SLOTS.map((slot) => [
    slot,
    PREMIUM_GEAR_SLOTS.includes(slot) ? GEAR_SLOT_PREMIUM_MULT : GEAR_SLOT_NORMAL_MULT,
  ]),
));

export const COMMON_GEAR_STAT_COUNT = 1;
export const UNCOMMON_GEAR_STAT_COUNT = 2;
export const RARE_GEAR_STAT_COUNT = 3;
export const EPIC_GEAR_STAT_COUNT = 3;
export const LEGENDARY_GEAR_STAT_COUNT = 5;

export const RARITY_ATTR_COUNT = Object.freeze({
  common: COMMON_GEAR_STAT_COUNT,
  uncommon: UNCOMMON_GEAR_STAT_COUNT,
  rare: RARE_GEAR_STAT_COUNT,
  epic: EPIC_GEAR_STAT_COUNT,
  legendary: LEGENDARY_GEAR_STAT_COUNT,
});

/** Rarity STAT-budget multipliers — productionMath.GEAR_RARITY_BUDGET_MULT (Legendary 1.50). */
export const RARITY_BUDGET_MULT = { ...GEAR_RARITY_BUDGET_MULT };

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

/** Legendary Desirable pins each off-stat at the rarity floor (10%). */
export const LEGENDARY_DESIRABLE_OFF_SHARE_BPS = Math.round(
  RARITY_MIN_STAT_SHARE.legendary * BASIS_POINTS_DENOMINATOR,
);

/**
 * Rare normal-slot base budget — one continuous, monotonic, infinitely scaling
 * curve (no anchors / PCHIP / Level-500 breakpoint / cap):
 *   BaseGearStatBudget(L) = ROUND(GEAR_BUDGET_LINEAR·L + GEAR_BUDGET_CURVE·√L + GEAR_BUDGET_FLOOR)
 * Constants fit to the intended targets (L1=12 … L500=795):
 *   GEAR_BUDGET_LINEAR — overall scale + permanent high-level per-level slope
 *   GEAR_BUDGET_CURVE  — early/mid front-loading (√L bend)
 *   GEAR_BUDGET_FLOOR  — Level-1 floor offset
 */
export { GEAR_BUDGET_LINEAR, GEAR_BUDGET_CURVE, GEAR_BUDGET_FLOOR };

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

const MIN_RANDOM_ALLOCATION_WEIGHT = 1e-9;
const VALIDATION_HTTP_STATUS = 400;

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
  const [xA, yA] = points[points.length - 2]; // magic-number-ok: previous waypoint pair
  const [xB, yB] = points[points.length - 1];
  const slope = (yB - yA) / (xB - xA);
  return yB + slope * (L - xB);
}

/**
 * Rare normal-slot base budget at item level (before slot/rarity multipliers).
 * Delegates to productionMath.gearBaseStatBudget (round-half-up).
 */
export function BaseGearStatBudget(itemLevel) {
  return gearBaseStatBudget(itemLevel);
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
  return gearSlotMultiplier(canonicalGearSlot(type) || type);
}

export function getRarityBudgetMultiplier(rarity) {
  return gearRarityBudgetMultiplier(rarity);
}

export function getRarityAttributeCount(rarity) {
  return RARITY_ATTR_COUNT[rarity] ?? COMMON_GEAR_STAT_COUNT;
}

export function getRarityMinStatShare(rarity) {
  return RARITY_MIN_STAT_SHARE[rarity] ?? RARITY_MIN_STAT_SHARE.rare;
}

/**
 * Final TotalStatPool for one item.
 * productionMath.gearStatPool: rround(Base × SlotMult × RarityMult).
 */
export function getItemStatBudget(itemLevel, type, rarity) {
  const slot = canonicalGearSlot(type) || type;
  return gearStatPool(itemLevel, slot, rarity);
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

export function normalizeGearStatPool(statPool) {
  if (statPool == null || statPool === "") return GEAR_STAT_POOL_NORMAL;
  const pool = String(statPool).trim().toLowerCase();
  if (!GEAR_STAT_POOL_IDS.includes(pool)) {
    const err = new Error("Invalid gear stat pool");
    err.status = VALIDATION_HTTP_STATUS;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return pool;
}

export function classGearStatRoles(className) {
  const favored = getFavoredStatPool(className);
  if (!favored) return null;
  return {
    primary: resolveClassArchetype(className),
    desirable: [...favored],
    offs: TOTAL_STAT_POOL.filter((key) => !favored.includes(key)),
  };
}

export function legendaryOffShareBpsForPool(statPool) {
  const pool = normalizeGearStatPool(statPool);
  if (pool === GEAR_STAT_POOL_DESIRABLE) return LEGENDARY_DESIRABLE_OFF_SHARE_BPS;
  if (pool === GEAR_STAT_POOL_PARTIAL_A) return LEGENDARY_PARTIAL_A_OFF_SHARE_BPS;
  if (pool === GEAR_STAT_POOL_PARTIAL_B) return LEGENDARY_PARTIAL_B_OFF_SHARE_BPS;
  return null;
}

function assertDirectedStatPool(rarity, pool, className) {
  if (pool === GEAR_STAT_POOL_NORMAL) return classGearStatRoles(className);
  if (
    pool === GEAR_STAT_POOL_PARTIAL_B
    && GEAR_STAT_POOL_PARTIAL_B_BLOCKED_RARITIES.includes(rarity)
  ) {
    const err = new Error("partial_b is not allowed for common or uncommon gear");
    err.status = VALIDATION_HTTP_STATUS;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const roles = classGearStatRoles(className);
  if (!roles) {
    const err = new Error("className required for directed gear stat pool");
    err.status = VALIDATION_HTTP_STATUS;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return roles;
}

function pickSubset(pool, count, rng) {
  const n = Math.max(0, Math.min(count, pool.length));
  if (n <= 0) return [];
  return shuffleInPlace([...pool], rng).slice(0, n);
}

function selectDirectedItemAttributes(rarity, rng, roles, pool) {
  const count = getRarityAttributeCount(rarity);
  if (rarity === "legendary" || count >= ITEM_ATTR_KEYS.length) {
    return [...ITEM_ATTR_KEYS];
  }
  if (pool === GEAR_STAT_POOL_DESIRABLE) {
    return pickSubset(roles.desirable, count, rng);
  }
  if (pool === GEAR_STAT_POOL_PARTIAL_A) {
    const offCount = Math.min(SIMULATE_PARTIAL_A_OFF_COUNT, roles.offs.length, count);
    return [
      ...pickSubset(roles.offs, offCount, rng),
      ...pickSubset(roles.desirable, count - offCount, rng),
    ];
  }
  const offCount = Math.min(roles.offs.length, count);
  return [
    ...pickSubset(roles.offs, offCount, rng),
    ...pickSubset(roles.desirable, count - offCount, rng),
  ];
}

/**
 * Pick which attributes appear on an item.
 * Legendary: always all five.
 * Common–Epic with class: optional favored pool (existing intentional restriction).
 * Directed pools (desirable / partial_a / partial_b) are admin-simulate only.
 */
export function selectItemAttributes(rarity, rng = Math.random, options = {}) {
  const count = getRarityAttributeCount(rarity);
  const className = options.className;
  const pool = normalizeGearStatPool(options.statPool);

  if (pool !== GEAR_STAT_POOL_NORMAL) {
    const roles = assertDirectedStatPool(rarity, pool, className);
    return {
      attrs: selectDirectedItemAttributes(rarity, rng, roles, pool),
      poolMode: pool,
    };
  }

  if (rarity === "legendary" || count >= ITEM_ATTR_KEYS.length) {
    return { attrs: [...ITEM_ATTR_KEYS], poolMode: "legendary" };
  }

  const favored = getFavoredStatPool(className);
  let livePool;
  let poolMode;

  if (favored) {
    if (rng() < FAVORED_POOL_CHANCE) {
      livePool = favored;
      poolMode = "favored";
    } else {
      livePool = [...TOTAL_STAT_POOL];
      poolMode = "total";
    }
  } else {
    livePool = [...TOTAL_STAT_POOL];
    poolMode = "neutral";
  }

  if (count >= livePool.length) {
    return { attrs: shuffleInPlace([...livePool], rng), poolMode };
  }
  return { attrs: shuffleInPlace([...livePool], rng).slice(0, count), poolMode };
}

function minEachForShare(total, attrCount, minRatio) {
  let minEach = Math.floor(total * minRatio);
  while (minEach > 0 && minEach * attrCount > total) minEach -= 1;
  return minEach;
}

function distributeWeightedRemainder(count, leftover, rng) {
  const extras = new Array(count).fill(0);
  if (leftover <= 0 || count <= 0) return extras;
  const raw = extras.map(() => Math.max(MIN_RANDOM_ALLOCATION_WEIGHT, rng()));
  const wSum = raw.reduce((a, b) => a + b, 0) || 1;
  const exact = raw.map((w) => leftover * (w / wSum));
  const floors = exact.map((x) => Math.floor(x));
  let rem = leftover - floors.reduce((a, b) => a + b, 0);
  const byFrac = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let i = 0; i < count; i++) extras[i] = floors[i];
  for (let k = 0; k < rem; k++) extras[byFrac[k % count].i] += 1;
  return extras;
}

function repairBudgetSum(stats, keys, total, minEach, rng) {
  const n = keys.length;
  let sum = keys.reduce((a, k) => a + stats[k], 0);
  if (sum === total || n <= 0) return stats;
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
    while (left > 0) {
      let donor = order[0];
      for (const k of order) if (stats[k] > stats[donor]) donor = k;
      if (stats[donor] <= 0) break;
      stats[donor] -= 1;
      left -= 1;
    }
  }
  return stats;
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
    if (n >= RARITY_ATTR_COUNT.legendary) rarityKey = "legendary";
    else if (n === RARITY_ATTR_COUNT.uncommon) rarityKey = "uncommon";
    else rarityKey = "rare";
  }
  const minEach = minEachForShare(total, n, getRarityMinStatShare(rarityKey));
  const extras = distributeWeightedRemainder(n, total - minEach * n, rng);
  const stats = {};
  keys.forEach((k, i) => {
    stats[k] = minEach + extras[i];
  });
  return repairBudgetSum(stats, keys, total, minEach, rng);
}

/**
 * Legendary directed pools: pin each off-stat to offShareBps of the piece
 * (Desirable uses the 10% floor as a cap), then dump leftover into desirable
 * with the same piece-budget floor + random remainder.
 */
export function allocateLegendaryDirectedBudget(budget, rng, className, offShareBps) {
  const roles = classGearStatRoles(className);
  const keys = [...ITEM_ATTR_KEYS];
  const total = Math.max(0, Math.round(Number(budget) || 0));
  if (!roles || total <= 0) return {};
  const minEach = minEachForShare(total, keys.length, getRarityMinStatShare("legendary"));
  const minShareBps = LEGENDARY_DESIRABLE_OFF_SHARE_BPS;
  let offEach = minEach;
  if (offShareBps > minShareBps) {
    offEach = Math.max(
      minEach,
      roundHalfUp((total * offShareBps) / BASIS_POINTS_DENOMINATOR),
    );
  }
  const maxOffEach = Math.floor(
    (total - minEach * roles.desirable.length) / roles.offs.length,
  );
  offEach = Math.min(offEach, Math.max(minEach, maxOffEach));

  const stats = {};
  for (const key of roles.offs) stats[key] = offEach;
  const leftover = total - offEach * roles.offs.length;
  const extraPool = leftover - minEach * roles.desirable.length;
  const extras = distributeWeightedRemainder(
    roles.desirable.length,
    Math.max(0, extraPool),
    rng,
  );
  roles.desirable.forEach((key, i) => {
    stats[key] = minEach + extras[i];
  });
  return repairBudgetSum(stats, roles.desirable, leftover, minEach, rng);
}

/** @deprecated unified into allocateStatBudget(..., "legendary") */
export function allocateLegendaryStatBudget(budget, rng = Math.random) {
  return allocateStatBudget([...ITEM_ATTR_KEYS], budget, rng, "legendary");
}

/**
 * Generate item stats from level / type / rarity.
 * Intrinsic budget variance is rolled once here and must be persisted on the item.
 * Pass `className` for Common–Epic class-aware pool selection.
 * Pass `statBudgetVariance` to inject 0.90 / 1.00 / 1.10 in tests.
 */
export function rollItemStats({
  itemLevel,
  statBudgetLevel,
  type,
  rarity,
  rng = Math.random,
  className,
  statPool = null,
  statBudgetVariance = null,
  variancePct = 0, // ignored — live path is GEAR_STAT_BUDGET_VARIANCE_*
} = {}) {
  void variancePct;
  const slot = canonicalGearSlot(type) || type;
  const pool = normalizeGearStatPool(statPool);
  const { attrs, poolMode } = selectItemAttributes(rarity, rng, { className, statPool: pool });
  const budgetLevel = Math.max(1, Math.floor(Number(statBudgetLevel ?? itemLevel) || 1));
  const preVarianceBudget = getItemStatBudget(budgetLevel, slot, rarity);
  const variance = rollGearStatBudgetVariance(rng, statBudgetVariance);
  const variedBudget = applyGearStatBudgetVariance(preVarianceBudget, variance);
  const budget = Math.max(attrs.length, variedBudget);
  const offShareBps = rarity === "legendary" ? legendaryOffShareBpsForPool(pool) : null;
  const stats = offShareBps == null
    ? allocateStatBudget(attrs, budget, rng, rarity)
    : allocateLegendaryDirectedBudget(budget, rng, className, offShareBps);
  const sum = Object.values(stats).reduce((a, b) => a + (b || 0), 0);
  return {
    stats,
    budget: sum,
    attributes: attrs,
    targetBudget: budget,
    preVarianceBudget,
    statBudgetVariance: variance,
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
 * Canonical production Gear generator (Phase 2).
 * Source systems choose slot / rarity / economic level / origin; this finalizes stats.
 * Hidden PvE stat-budget offset is opt-in (`applyPveHiddenBudgetOffset`) so Mission /
 * Dungeon / Wormhole callers are not redesigned in this phase.
 *
 * @param {object} opts
 * @param {number} [opts.itemLevel] economic/display level (alias of economicLevel)
 * @param {number} [opts.economicLevel]
 * @param {number} [opts.statBudgetLevel]
 * @param {number} [opts.playerLevel] used only when applyPveHiddenBudgetOffset
 * @param {boolean} [opts.applyPveHiddenBudgetOffset]
 * @param {string} opts.itemType
 * @param {string} opts.rarity
 * @param {() => number} [opts.rng]
 * @param {string|null} [opts.className]
 * @param {string|null} [opts.statPool] admin-simulate directed pool; live loot omits
 * @param {string|null} [opts.origin]
 * @param {string|null} [opts.manufacturer]
 * @param {boolean|null} [opts.shipmentEligible]
 * @param {object|null} [opts.generationContext]
 */
export function GenerateGearItem({
  itemLevel,
  economicLevel,
  statBudgetLevel,
  playerLevel,
  applyPveHiddenBudgetOffset = false,
  itemType,
  rarity,
  rng = Math.random,
  className = null,
  statPool = null,
  origin = null,
  manufacturer = null,
  shipmentEligible = null,
  generationContext = null,
} = {}) {
  const ctxOrigin = origin || generationContext?.origin || generationContext?.source || null;
  const levels = resolveGearLevelRefs({
    economicLevel,
    itemLevel,
    statBudgetLevel,
    playerLevel,
    applyPveHiddenBudgetOffset,
  });
  const L = levels.economicLevel;
  if (!Number.isFinite(L) || L < 1) {
    const err = new Error("Invalid item level");
    err.status = VALIDATION_HTTP_STATUS;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const type = canonicalGearSlot(itemType);
  if (!type) {
    const err = new Error("Invalid gear item type");
    err.status = VALIDATION_HTTP_STATUS;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const r = String(rarity || "").toLowerCase();
  if (!RARITY_ATTR_COUNT[r]) {
    const err = new Error("Invalid gear rarity");
    err.status = VALIDATION_HTTP_STATUS;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const rolled = rollItemStats({
    itemLevel: L,
    statBudgetLevel: levels.statBudgetLevel,
    type,
    rarity: r,
    rng,
    className,
    statPool: statPool ?? generationContext?.statPool ?? null,
  });
  const resolvedOrigin = canonicalGearOrigin(ctxOrigin) || "unassigned";
  const item = {
    type,
    rarity: r,
    level_requirement: L,
    level: L,
    stat_budget_level: levels.statBudgetLevel,
    pre_variance_stat_budget: rolled.preVarianceBudget,
    stat_budget_variance: rolled.statBudgetVariance,
    stat_budget: rolled.targetBudget,
    stats: rolled.stats,
    is_equipped: false,
    origin: resolvedOrigin,
    manufacturer: manufacturer == null ? null : String(manufacturer),
    shipment_eligible: shipmentEligible == null
      ? defaultShipmentEligible(resolvedOrigin)
      : !!shipmentEligible,
  };
  item.sell_value = computeItemVendorValue(item);
  return item;
}

/** Legacy vendor factors (unused by live resale; kept for shop heuristics if any). */
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
 * Production Gear resale — pre-variance Black Market base × rarity fraction,
 * at ECONOMIC item level (hidden PvE stat-budget level must not be used).
 * Stims: ROUND_HALF_UP(SPF(economicLevel) × STIM_SELL_MULT). Junk/materials keep
 * their snapshotted sell_value.
 */
export function computeItemVendorValue(item, options = {}) {
  if (!item) return 0;
  const type = canonicalGearSlot(item.type) || item.type;
  if (item.type === "consumable") {
    const rarity = resolveStimRarity(item);
    const level = stimEconomicLevel(item, options.fallbackLevel);
    return stimSellValueResolved(level, rarity);
  }
  if (item.type === "material" || !canonicalGearSlot(item.type)) {
    const flat = item.sell_value;
    if (typeof flat === "number" && flat > 0) return Math.max(1, Math.round(flat));
    return 1;
  }
  const economic = Math.max(
    1,
    Math.floor(Number(item.level ?? item.level_requirement) || 1),
  );
  const rarity = String(item.rarity || "").toLowerCase();
  return gearResaleValue(economic, type, rarity);
}
