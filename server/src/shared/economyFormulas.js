/**
 * Server-side economy formulas — ported from src/lib/gameData.js + fuelMounts.js.
 * Keep numbers identical; do not retune balance here.
 */
import {
  expForLevel,
  getMissionXpPerFuel,
  getMissionStardustPerFuel,
  getStatPointsForLevelRange,
} from "./rewards.js";
import { grantCharacterXp } from "./characterProgression.js";
// LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION.
// Historical ×10 inflation. Not production XP. Not production economy authority.
import { XP_STARDUST_SCALE } from "./economyConstants.js";
import {
  startingAttributesForClass,
  CLASS_PRIMARY_INDEX,
  permanentAttributePurchaseCost,
  missionXpReward,
  missionStardustReward,
  missionSkipCostNova,
  BACKPACK_UNEQUIPPED_ITEM_CAP,
  XP_REWARD_EFFICIENCY,
  rollMissionVariance,
  clampMissionVariance,
  STIM_MAX_ACTIVE_EFFECTS,
  STIM_SHOP_MULT,
  STIM_SELL_MULT,
  MINUTES_PER_HOUR as PRODUCTION_MINUTES_PER_HOUR,
  miningStardustResolved,
  stimShopPriceResolved,
  stimSellValueResolved,
  MARKET_NORMAL_SLOT_COUNT,
  MARKET_GEAR_OFFER_CHANCE,
  MARKET_STIM_OFFER_CHANCE,
  MARKET_MIN_STIM_OFFERS,
  MARKET_PAID_REFRESH_NOVA,
  MARKET_RARITY_WEIGHTS,
  CONTRABAND_RARITY_WEIGHTS,
  CONTRABAND_FREE_REFRESH_TRIGGER,
  MARKET_HAGGLE_SUCCESS_CHANCE,
  MARKET_HAGGLE_DISCOUNT_MIN_PERCENT,
  MARKET_HAGGLE_DISCOUNT_MAX_PERCENT,
  blackMarketPrice,
} from "./productionMath.js";
import {
  generateContrabandOffer,
  generateNormalMarketOffers,
  marketWindowAt,
  mulberry32 as marketMulberry32,
  normalizeMarketMeta,
  shopGenerationId,
  contrabandPeriodId,
} from "../../../src/lib/blackMarket.js";
import {
  resolveMarketHaggle,
  rollMarketGearItemLevel,
  rollMarketGearRarity,
  rollContrabandRarity,
} from "../../../src/lib/productionMath/market.js";
import {
  CONSUMABLE_TIERS as STIM_CONSUMABLE_TIERS,
  STIM_ATTRIBUTES,
  prepareConsumableBuffs,
  resolveStimRarity,
  stimRarityRank,
} from "../../../src/lib/stimActivation.js";

/** One production XP-efficiency factor. Mission XP applies it twice (certified). */
export const MISSION_XP_REBALANCE = XP_REWARD_EFFICIENCY;
/**
 * Dungeon DRU → XP conversion: 1 DRU = 2 fuel-equivalents of XP at the
 * enemy's level. Single authoritative balance constant.
 */
export const DUNGEON_XP_PER_DRU_MULTIPLIER = 2.0;
import {
  computeItemVendorValue,
  ITEM_SELL_TYPE_WEIGHT,
} from "./itemGeneration.js";
import { todayET as todayETFromClock, getWeekKey as getWeekKeyFromClock, clock } from "./time/index.js";
import { DEFAULT_GAME_ZONE, getZonedParts } from "./time/zones.js";
import { zonedLocalToUtc } from "./time/periods.js";
import {
  MissionStardustReward,
  ArenaWinStardust,
  JunkSaleValue,
  missionGearDropChance as sdMissionGearDropChance,
  rollMissionGearDrop as sdRollMissionGearDrop,
  MISSION_GEAR_BASE_CHANCE,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_GEAR_DROP_CAP,
  MISSION_JUNK_CHANCE_ON_GEAR_FAIL,
  MISSION_STIM_CHANCE_AFTER_GEAR_FAIL,
  MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL,
  JUNK_AVG_MISSION_REWARD_RATIO,
  ARENA_REWARDED_WINS_PER_DAY,
  ARENA_WIN_FUEL_EQUIVALENT,
  MINING_EFFICIENCY,
  getArenaRewardedWinsState,
  arenaWinGrantsStardust,
  rollMissionGearRarity,
  rollDungeonRegularRarity,
  rollDungeonBossRarity,
  GearSaleValue,
  StardustPerFuel,
} from "./stardustEconomy.js";
import { ARENA_DEFAULT_RATING, ARENA_ELO_RATING_SCALE } from "../arena/config.js";

const PERCENT_SCALE = 100;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_SECOND
  * SECONDS_PER_MINUTE
  * MINUTES_PER_HOUR;

const NOVA_ITEM_LEVEL_MULTIPLIER = 0.1;
const BASE_INVENTORY_CAP = BACKPACK_UNEQUIPPED_ITEM_CAP;
const MISSION_DURATION_STEP_SECONDS = 15;
const MISSION_REWARD_VARIANCE = 0.10;
const FUEL_COST_PRECISION_SCALE = 100;
const SKIP_NOVA_HALF_UNITS_PER_FUEL = 0.2;
const NOVA_HALF_UNIT_SCALE = 2;

const SHOP_MORNING_START_HOUR = 2;
const SHOP_AFTERNOON_START_HOUR = 14;
const SHOP_WINDOW_DURATION_HOURS = 12;
const DATE_PART_PAD_WIDTH = 2;
const HAGGLE_SUCCESS_CHANCE = 0.4;
const HAGGLE_MIN_DISCOUNT_PERCENT = 15;
const HAGGLE_DISCOUNT_OUTCOME_COUNT = 6;
const SHOP_GEAR_MANUAL_REFRESH_SEED_STEP = 17;
const SHOP_CONSUMABLE_MANUAL_REFRESH_SEED_STEP = 19;
const SHOP_STOCK_SEED_MULTIPLIER = 7_919;
const SHOP_STOCK_SEED_OFFSET = 13;
const CONSUMABLE_STOCK_SEED_MULTIPLIER = 4_099;
const CONSUMABLE_STOCK_SEED_OFFSET = 7;
const HOT_DEAL_SEED_MULTIPLIER = 104_729;
const HOT_DEAL_SEED_OFFSET = 77;
const LEGACY_CONSUMABLE_STOCK_COUNT = 2;
const STIM_RARE_ROLL_THRESHOLD = 0.4;
const STIM_EPIC_ROLL_THRESHOLD = 0.8;
const STIM_REFRESH_BASE_DURATION_DIVISOR = 2;

const ARENA_XP_FUEL_EQUIVALENT_NUMERATOR = 5;
const ARENA_XP_FUEL_EQUIVALENT_DENOMINATOR = 7;
const WORMHOLE_BASE_TOTAL_DRU = 185;
const WORMHOLE_DRU_PER_DEPTH = 25;
const WORMHOLE_BASE_ENEMY_LEVEL = 200;
const WORMHOLE_LEVELS_PER_DEPTH = 35;
const WORMHOLE_FIRST_ENEMY_OFFSET = 3;
const DRU_PRECISION_SCALE = 100;

export { XP_STARDUST_SCALE }; // legacy Stardust callers only — not XP

/** Temporary Coming Soon gates — flip to restore hangar / void without hunting call sites. */
export const FEATURE_FLAGS = {
  shipHangarEnabled: false,
  voidEnabled: false,
};

export function isFeatureEnabled(featureId) {
  if (featureId === "ship_hangar") return FEATURE_FLAGS.shipHangarEnabled === true;
  if (featureId === "void") return FEATURE_FLAGS.voidEnabled === true;
  return true;
}

export function isShipHangarEnabled() {
  return isFeatureEnabled("ship_hangar");
}

export {
  MISSION_GEAR_BASE_CHANCE,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_GEAR_DROP_CAP,
  MISSION_JUNK_CHANCE_ON_GEAR_FAIL,
  MISSION_STIM_CHANCE_AFTER_GEAR_FAIL,
  MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL,
  JUNK_AVG_MISSION_REWARD_RATIO,
  ARENA_REWARDED_WINS_PER_DAY,
  ARENA_WIN_FUEL_EQUIVALENT,
  MINING_EFFICIENCY,
  getArenaRewardedWinsState,
  arenaWinGrantsStardust,
  rollMissionGearRarity,
  rollDungeonRegularRarity,
  rollDungeonBossRarity,
  JunkSaleValue,
  GearSaleValue,
  ArenaWinStardust,
  StardustPerFuel,
};

/** Clock-backed daily key (America/New_York). */
export function todayET(now = clock.now()) {
  return todayETFromClock(now);
}

/** Clock-backed weekly key (ET Monday week). */
export function getWeekKey(date = clock.now()) {
  return getWeekKeyFromClock(date);
}
// ── Classes (baseStats from productionMath.STARTING_ATTRIBUTES) ────────
function namedStartingStats(className) {
  const a = startingAttributesForClass(className);
  return {
    strength: a[0],
    agility: a[1],
    intellect: a[2],
    vitality: a[3],
    luck: a[4],
  };
}

export const CLASS_BASE_STATS = Object.fromEntries(
  Object.keys(CLASS_PRIMARY_INDEX).map((className) => [className, namedStartingStats(className)]),
);

// ── Attribute purchases ──────────────────────────────────────
// Live price: productionMath.permanentAttributePurchaseCost
// per-stat: intro table #1–#5, then certified attrcost(n-5). Horner curve unchanged.

export function lerpWaypoints(level, points) {
  const L = Math.max(1, Math.floor(level || 1));
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

export function getAttributePointCost(purchaseNumber) {
  return permanentAttributePurchaseCost(purchaseNumber);
}

export const ATTR_STAT_KEYS = ["strength", "agility", "intellect", "vitality", "luck"];

export function getAttributePurchaseCount(character, stat) {
  if (!character) return 0;
  if (stat) {
    const by = character.attribute_purchases_by_stat;
    if (by && typeof by[stat] === "number" && Number.isFinite(by[stat])) {
      return Math.max(0, Math.floor(by[stat]));
    }
    return 0;
  }
  if (character.attribute_purchases_by_stat && typeof character.attribute_purchases_by_stat === "object") {
    return ATTR_STAT_KEYS.reduce((sum, k) => sum + getAttributePurchaseCount(character, k), 0);
  }
  if (typeof character.attribute_purchases === "number" && Number.isFinite(character.attribute_purchases)) {
    return Math.max(0, Math.floor(character.attribute_purchases));
  }
  return ATTR_STAT_KEYS.reduce((sum, k) => sum + getAttributePurchaseCount(character, k), 0);
}

export function getNextAttributePointCost(character, stat) {
  if (!stat) {
    return Math.min(...ATTR_STAT_KEYS.map((k) => getNextAttributePointCost(character, k)));
  }
  return getAttributePointCost(getAttributePurchaseCount(character, stat) + 1);
}

// ── Stardust dissolve ────────────────────────────────────────
// LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION
export const STARDUST_PER_RARITY = {
  common: 8 * XP_STARDUST_SCALE,
  uncommon: 20 * XP_STARDUST_SCALE,
  rare: 50 * XP_STARDUST_SCALE,
  epic: 120 * XP_STARDUST_SCALE,
  legendary: 280 * XP_STARDUST_SCALE,
};

export const STARDUST_TYPE_WEIGHT = { ...ITEM_SELL_TYPE_WEIGHT };

export function computeStardustValue(item, options = {}) {
  return computeItemVendorValue(item, options);
}

export const NOVA_CRYSTAL_PER_RARITY = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 10 };

export function computeNovaCrystalCost(item) {
  const base = NOVA_CRYSTAL_PER_RARITY[item.rarity] ?? 0;
  if (!base) return 0;
  const levelMult = 1 + (item.level_requirement || 1) * NOVA_ITEM_LEVEL_MULTIPLIER;
  return Math.max(1, Math.round(base * levelMult));
}

// ── Fuel ─────────────────────────────────────────────────────
export const FUEL_MAX = 100;
/** JS integer safety bound — not a gameplay Stardust wallet cap. Casino wager caps are separate. */
export const STARDUST_MAX = Number.MAX_SAFE_INTEGER;
/** JS integer safety bound for admin Fuel overfill — not a gameplay tank cap. */
export const FUEL_STORAGE_MAX = Number.MAX_SAFE_INTEGER;

export function clampStardust(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.min(STARDUST_MAX, Math.max(0, Math.floor(n)));
}
export const FUEL_CYCLE_MS = HOURS_PER_DAY * MILLISECONDS_PER_HOUR;
export const FUEL_PURCHASE_AMOUNT = 20;
/** Finalized: 20 Fuel costs 20 Nova (flat). */
export const FUEL_PURCHASE_COST = 20;
export const FUEL_PURCHASE_MAX = 10;
export const MISSION_MIN_FUEL = MISSION_DURATION_STEP_SECONDS / SECONDS_PER_MINUTE;

export function checkFuelReset(character, nowMs = clock.nowMs(), options = {}) {
  const preserveOverfill = options?.preserveOverfill === true;
  const storedMax = character.max_fuel || FUEL_MAX;
  // While hangar is retired, daily refill uses base tank only — do not overwrite saved max_fuel.
  const max = getEffectiveMaxFuel(character);
  const resetAt = character.fuel_reset_at ? new Date(character.fuel_reset_at) : null;
  const now = Number(nowMs) || clock.nowMs();
  const fuelVal = Number(character.fuel);
  const fuelMissing = character.fuel == null || !Number.isFinite(fuelVal);
  const overfilled = Number.isFinite(fuelVal) && fuelVal > max;
  if (fuelMissing || !resetAt || now - resetAt.getTime() >= FUEL_CYCLE_MS) {
    const fuelAfterCycle = (!fuelMissing && preserveOverfill && overfilled) ? fuelVal : max;
    return { fuel: fuelAfterCycle, max_fuel: storedMax, fuel_reset_at: new Date(now).toISOString(), fuel_purchases: 0 };
  }
  if (overfilled && !preserveOverfill) {
    return { fuel: max };
  }
  return null;
}

// ── Fuel mounts ──────────────────────────────────────────────
export const FUEL_MOUNTS = [
  { id: 1, name: "Ion Booster",       emoji: "⚡", speed: 0.10, duration_hours: 1, stardust: 1200,  crystals: 0  },
  { id: 2, name: "Plasma Thruster",   emoji: "🔥", speed: 0.20, duration_hours: 2, stardust: 3000,  crystals: 0  },
  { id: 3, name: "Warp Core",         emoji: "🌀", speed: 0.30, duration_hours: 4, stardust: 5000,  crystals: 8  },
  { id: 4, name: "Singularity Drive", emoji: "🌌", speed: 0.45, duration_hours: 8, stardust: 10000, crystals: 20 },
];

export const MAX_FUEL_MOUNTS = 3;
const REDUCTION_CAP = 0.9;

export function getFuelMountById(id) {
  return FUEL_MOUNTS.find((m) => m.id === id) || null;
}

export function getActiveFuelMounts(character, nowMs = clock.nowMs()) {
  if (!isShipHangarEnabled()) return [];
  const now = Number(nowMs) || clock.nowMs();
  return (character?.active_fuel_mounts || []).filter(
    (m) => new Date(m.expires_at).getTime() > now
  );
}

export function getFuelSpeedTotal(character) {
  if (!isShipHangarEnabled()) return 0;
  return getActiveFuelMounts(character).reduce((max, m) => Math.max(max, m.speed || 0), 0);
}

/** Gameplay max fuel while hangar is retired — base tank only (saved ship data intact). */
export function getEffectiveMaxFuel(character) {
  if (!isShipHangarEnabled()) return FUEL_MAX;
  return character?.max_fuel || FUEL_MAX;
}

/** Clamp a Fuel amount to the live gameplay tank. Does not rewrite stored max_fuel. */
export function clampFuelToEffectiveMax(character, fuel) {
  const cap = getEffectiveMaxFuel(character);
  const n = Number(fuel);
  if (!Number.isFinite(n)) return 0;
  return Math.min(cap, Math.max(0, n));
}

/**
 * Apply a Fuel grant. Admin-owned characters may exceed the tank cap;
 * everyone else is clamped to the live gameplay max.
 */
export function nextFuelAfterGrant(character, nextFuel, { uncapped = false } = {}) {
  const n = Number(nextFuel);
  if (!Number.isFinite(n)) return 0;
  if (uncapped) return Math.min(FUEL_STORAGE_MAX, Math.max(0, n));
  return clampFuelToEffectiveMax(character, n);
}

// ── Ship mods (effect totals for mission fuel/duration/rewards) ─
export const STARTER_SHIP = "scout";
export const SCOUT_MILESTONE_LEVEL = 20;
export const SCOUT_MILESTONE_MOD_ID = "fuel_tank_1";
export const NAME_CHANGE_COST = 500;
export const GUILD_WAR_SIM_COST = 500 * XP_STARDUST_SCALE; // legacy Stardust, not XP
export const SHIP_UPGRADE_STEP = 1.08;
export const SHIP_COST_STEP = 1.10;

export const SHIP_TYPES = {
  scout: {
    name: "Recon Scout", cost: 0, unlock_level: 1,
    inherent: {},
    upgrade_mult: 1.0,
    cost_mult: 1.0,
  },
  frigate: {
    name: "Storm Frigate", cost: 50000, unlock_level: 50,
    inherent: { mission_stardust_mult: 0.05 },
    upgrade_mult: SHIP_UPGRADE_STEP,
    cost_mult: SHIP_COST_STEP,
  },
  cruiser: {
    name: "Galaxy Cruiser", cost: 150000, unlock_level: 100,
    inherent: { mission_xp_mult: 0.05, mission_duration_reduction: 0.03 },
    upgrade_mult: SHIP_UPGRADE_STEP ** 2,
    cost_mult: SHIP_COST_STEP ** 2,
  },
  dreadnought: {
    name: "Void Dreadnought", cost: 400000, unlock_level: 200,
    inherent: { mission_stardust_mult: 0.10, mission_xp_mult: 0.10, fuel_cost_reduction: 1 },
    upgrade_mult: SHIP_UPGRADE_STEP ** 3,
    cost_mult: SHIP_COST_STEP ** 3,
  },
};

/** Tier costs + effects — ids/costs match client SHIP_MODS. */
// LEGACY ECONOMY IMPLEMENTATION — PENDING SYSTEM-SPECIFIC MIGRATION/RECONCILIATION
const FUEL_TANK_COSTS = [200, 450, 800, 1250, 1800, 2500, 3400, 4500, 5600, 6800].map((c) => c * XP_STARDUST_SCALE);
const FUEL_EFF_COSTS = [350, 700, 1100, 1600, 2200, 2900, 3700, 4600, 5600, 6800].map((c) => c * XP_STARDUST_SCALE);
const WARP_COSTS = [500, 950, 1450, 2000, 2600, 3300, 4100, 5000, 6000, 7100].map((c) => c * XP_STARDUST_SCALE);
const SD_MAG_COSTS = [300, 650, 1050, 1500, 2000, 2550, 3150, 3800, 4500, 5300].map((c) => c * XP_STARDUST_SCALE);
const NEURAL_COSTS = [400, 800, 1250, 1750, 2300, 2900, 3550, 4250, 5000, 5800].map((c) => c * XP_STARDUST_SCALE);
const CARGO_COSTS = [600, 1200, 1900, 2700, 3600, 4600, 5700, 6900, 8200, 9600].map((c) => c * XP_STARDUST_SCALE);

export const SHIP_MODS = {
  fuel_tank: {
    name: "Reinforced Fuel Tank",
    tiers: FUEL_TANK_COSTS.map((cost, i) => ({ id: `fuel_tank_${i + 1}`, cost, max_fuel_bonus: 2 })),
  },
  fuel_efficiency: {
    name: "Fuel Injector Tune",
    tiers: FUEL_EFF_COSTS.map((cost, i) => ({ id: `fuel_efficiency_${i + 1}`, cost, fuel_cost_reduction: 1 })),
  },
  warp_drive: {
    name: "Warp Drive",
    tiers: WARP_COSTS.map((cost, i) => ({ id: `warp_drive_${i + 1}`, cost, mission_duration_reduction: 0.005 })),
  },
  stardust_magnet: {
    name: "Stardust Magnet",
    tiers: SD_MAG_COSTS.map((cost, i) => ({ id: `stardust_magnet_${i + 1}`, cost, mission_stardust_mult: 0.005 })),
  },
  neural_accel: {
    name: "Neural Accelerator",
    tiers: NEURAL_COSTS.map((cost, i) => ({ id: `neural_accel_${i + 1}`, cost, mission_xp_mult: 0.005 })),
  },
  cargo_hold: {
    name: "Cargo Hold",
    tiers: CARGO_COSTS.map((cost, i) => ({ id: `cargo_hold_${i + 1}`, cost, inventory_cap_bonus: 1 })),
  },
};

export function getShipCostMult(shipId) {
  return SHIP_TYPES[shipId]?.cost_mult ?? 1;
}

export function getTierCost(tier, shipId) {
  if (!tier) return 0;
  return Math.max(1, Math.round((tier.cost || 0) * getShipCostMult(shipId)));
}

export function computeMaxFuelForLoadout(modIds, shipId) {
  const ids = modIds || [];
  const mult = getShipUpgradeMult(shipId);
  let bonus = 0;
  Object.values(SHIP_MODS).forEach((cat) => {
    cat.tiers.forEach((t) => { if (ids.includes(t.id)) bonus += t.max_fuel_bonus || 0; });
  });
  return FUEL_MAX + Math.round(bonus * mult);
}

export function getNextModTier(character, catKey, shipId) {
  const cat = SHIP_MODS[catKey];
  if (!cat) return null;
  const ids = getShipModIds(character, shipId);
  return cat.tiers.find((t) => !ids.includes(t.id)) || null;
}

export function getActiveShipId(character) {
  return character?.active_ship || STARTER_SHIP;
}

export function getShipUpgradeMult(shipId) {
  return SHIP_TYPES[shipId]?.upgrade_mult ?? 1;
}

export function getActiveShipType(character) {
  return SHIP_TYPES[getActiveShipId(character)] || SHIP_TYPES[STARTER_SHIP];
}

export function getShipModIds(character, shipId) {
  const id = shipId || getActiveShipId(character);
  const loadouts = character?.ship_mod_loadouts;
  if (loadouts && Array.isArray(loadouts[id])) return loadouts[id];
  if (id === getActiveShipId(character)) return character?.ship_mods || [];
  return [];
}

export function getInstalledMods(character, shipId) {
  const id = shipId || getActiveShipId(character);
  const ids = getShipModIds(character, id);
  const out = [];
  Object.entries(SHIP_MODS).forEach(([catKey, cat]) => {
    cat.tiers.forEach((tier) => {
      if (ids.includes(tier.id)) out.push({ ...tier, catKey });
    });
  });
  return out;
}

export function getModEffectTotal(character, effectKey) {
  if (!isShipHangarEnabled()) return 0;
  const mult = getShipUpgradeMult(getActiveShipId(character));
  const modTotal = getInstalledMods(character).reduce((sum, m) => sum + (m[effectKey] || 0), 0) * mult;
  const ship = getActiveShipType(character);
  return modTotal + (ship.inherent?.[effectKey] || 0);
}

export function getInventoryCap(_character) {
  void _character;
  // Production Backpack is a hard 10 unequipped items (Gear, stims, junk).
  // Cargo Hold / entitlements do not expand it.
  return BACKPACK_UNEQUIPPED_ITEM_CAP;
}

// Wire for applyCharacterRewards without an import cycle (rewards ↔ this module).
globalThis.__llGetInventoryCap = getInventoryCap;

export function getEffectiveMissionDuration(character, mission) {
  const warpReduction = getModEffectTotal(character, "mission_duration_reduction");
  const fuelSpeed = getFuelSpeedTotal(character);
  const totalReduction = Math.min(REDUCTION_CAP, warpReduction + fuelSpeed);
  const raw = Math.max(1, Math.floor((mission?.duration_seconds || 0) * (1 - totalReduction)));
  return Math.max(
    MISSION_DURATION_STEP_SECONDS,
    Math.round(raw / MISSION_DURATION_STEP_SECONDS) * MISSION_DURATION_STEP_SECONDS,
  );
}

export function getEffectiveFuelCost(character, mission) {
  if (typeof mission?.fuel_cost === "number") {
    return Math.max(
      MISSION_MIN_FUEL,
      Math.round(mission.fuel_cost * FUEL_COST_PRECISION_SCALE)
        / FUEL_COST_PRECISION_SCALE,
    );
  }
  const effectiveSeconds = getEffectiveMissionDuration(character, mission);
  const raw = effectiveSeconds / SECONDS_PER_MINUTE
    - getModEffectTotal(character, "fuel_cost_reduction");
  return Math.max(
    MISSION_MIN_FUEL,
    Math.round(raw * FUEL_COST_PRECISION_SCALE) / FUEL_COST_PRECISION_SCALE,
  );
}

// ── Mission XP / SD ──────────────────────────────────────────
/** Mission reward variance band by player level (±fraction around 1.0). */
export function getMissionRewardVariance(_playerLevel = 1) {
  return MISSION_REWARD_VARIANCE;
}

/**
 * Per-mission variance roll — independent for XP and Stardust.
 * Discrete thousandths in VARIANCE_MIN..VARIANCE_MAX at every level.
 */
export function rollMissionEfficiency(playerLevel = 1, rng = Math.random) {
  void playerLevel;
  const r = typeof rng === "function" ? rng : Math.random;
  return rollMissionVariance(r);
}

/** Clamp / default efficiency for the player's variance band. */
export function normalizeMissionEfficiency(value, _playerLevel = 1) {
  return clampMissionVariance(value);
}

export function computeMissionXpFromFuel(fuelCost, level = 1, efficiency = 1) {
  const fuel = Math.max(0, Number(fuelCost) || 0);
  const eff = normalizeMissionEfficiency(efficiency, level);
  const xp = missionXpReward({
    fuel,
    snapshotLevel: level,
    xpVariance: eff,
    defeated: false,
  });
  return Math.max(fuel > 0 ? 1 : 0, xp);
}

/** Mission Stardust = ROUND(StardustPerFuel(level) * fuel * variance). */
export function computeMissionStardustFromFuel(fuelCost, level = 1, efficiency = 1) {
  return missionStardustReward({
    fuel: fuelCost,
    snapshotLevel: level,
    stardustVariance: efficiency,
    defeated: false,
  });
}

/** Junk vendor value — 45% of originating mission Stardust × Uniform(0.60, 1.40), snapshotted. */
export function computeMissionJunkSellValue(missionStardustReward, rng = Math.random) {
  return JunkSaleValue(missionStardustReward, rng);
}

/**
 * Mission skip Nova cost from original Fuel (Restoration 15).
 * Half-units: MAX(1, CEILING(fuel × 0.20)) → display 0.5 / 1 / 1.5 / …
 * Elapsed time does not reduce cost. Already-complete missions → 0.
 *
 * @deprecated SKIP_CRYSTALS_PER_MINUTE — superseded time-based skip.
 */
export const SKIP_CRYSTALS_PER_MINUTE = 5; // retained for audit/migration reference only

export function skipCostFor(mission, _nowMs = clock.nowMs()) {
  if (!mission) return 0;
  void _nowMs;
  // Elapsed time never reduces skip price. Cost is always original Fuel.
  const fuel =
    typeof mission.original_fuel_cost === "number"
      ? mission.original_fuel_cost
      : typeof mission.fuel_cost === "number"
        ? mission.fuel_cost
        : 0;
  return missionSkipCostNova(fuel);
}

/** Skip cost in integer half-Nova units. */
export function skipCostHalfUnits(mission, nowMs = clock.nowMs()) {
  return Math.round(skipCostFor(mission, nowMs) * NOVA_HALF_UNIT_SCALE);
}

// ── Shop (Phase 6 Black Market + Contraband Loot) ────────────
/** Paid normal-Market refresh. */
export const SHOP_REFRESH_COST = MARKET_PAID_REFRESH_NOVA;
export const SHOP_SLOT_COUNT = MARKET_NORMAL_SLOT_COUNT;
export const SHOP_GEAR_CHANCE = MARKET_GEAR_OFFER_CHANCE;
export const SHOP_STIM_CHANCE = MARKET_STIM_OFFER_CHANCE;
export const SHOP_MIN_STIMS = MARKET_MIN_STIM_OFFERS;
export const GEAR_SHOP_PRICE_VARIANCE_MIN = 0.8;
export const GEAR_SHOP_PRICE_VARIANCE_MAX = 1.2;
export const HOT_DEAL_REFRESH_COUNT = CONTRABAND_FREE_REFRESH_TRIGGER;
/** @deprecated HISTORICAL vendor→markup architecture. Live price is SPF × rarity × slot × variance. */
export const SHOP_RARITY_MARKUP = Object.freeze({
  common: 2.0,
  uncommon: 2.5,
  rare: 3.5,
  epic: 5.0,
  legendary: 7.0,
});
export const SHOP_GEAR_RARITY_WEIGHTS = MARKET_RARITY_WEIGHTS;
export const HOT_DEAL_RARITY_WEIGHTS = CONTRABAND_RARITY_WEIGHTS;
/** @deprecated use STIM_SHOP_MULT — historical 2/4/10 Fuel-equiv shop prices. */
export const STIM_SHOP_FUEL_EQUIV = STIM_SHOP_MULT;
/** @deprecated use STIM_SELL_MULT — historical 1/2/5 Fuel-equiv sell prices. */
export const STIM_SELL_FUEL_EQUIV = STIM_SELL_MULT;

/** 12-hour Market windows at 19:00 UTC and 07:00 UTC. No DST. */
export function getShopWindow(nowMs = clock.nowMs()) {
  const win = marketWindowAt(nowMs);
  return {
    idx: win.idx,
    startsAt: win.startsAt,
    endsAt: win.endsAt,
    secondsLeft: win.secondsLeft,
    startHour: win.startHour,
    rotationPeriodId: win.rotationPeriodId,
  };
}

/** Contraband daily key — 19:00 UTC. Historical name kept for callers. */
export function getShopGameDayKey(nowMs = clock.nowMs()) {
  return contrabandPeriodId(nowMs);
}

/** Haggle: 40% (no Nova) / 30% (Nova > 0); 10–20% off Stardust and Nova. Failure yanks. */
export function rollHaggle(rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  const outcome = resolveMarketHaggle(r);
  if (outcome.success) {
    return {
      ok: true,
      mult: 1 - outcome.discountPercent / PERCENT_SCALE,
      key: "deal",
      pct: outcome.discountPercent,
      label: `They blinked — ${outcome.discountPercent}% off`,
    };
  }
  return {
    ok: false,
    mult: 1,
    key: "refused",
    pct: 0,
    label: "They wouldn't budge",
  };
}

export function normalizeShopMeta(character, win = getShopWindow(), day = getShopGameDayKey()) {
  return normalizeMarketMeta(character?.shop_meta || {}, win, day);
}

export function shopGearSeed(meta, win = getShopWindow()) {
  return (win?.idx || 0)
    + (meta?.market_generation_seq || meta?.gear_refresh || 0)
    + (meta?.paid_refresh_count || 0)
    + (meta?.manual_refresh_count || 0) * SHOP_GEAR_MANUAL_REFRESH_SEED_STEP;
}

export function shopConsSeed(meta, win = getShopWindow()) {
  return shopGearSeed(meta, win)
    + (meta?.cons_refresh || 0) * SHOP_CONSUMABLE_MANUAL_REFRESH_SEED_STEP;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHOP_GEAR_TYPES = ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"];
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const RARITY_UNLOCK_LEVEL = { common: 1, uncommon: 1, rare: 3, epic: 6, legendary: 12 };

function clampRarityByLevel(rarity, playerLevel = 1) {
  const level = Math.max(1, playerLevel || 1);
  let maxIdx = 0;
  for (let t = 0; t < RARITY_ORDER.length; t++) {
    if (level >= (RARITY_UNLOCK_LEVEL[RARITY_ORDER[t]] || 1)) maxIdx = t;
  }
  const i = RARITY_ORDER.indexOf(rarity);
  return RARITY_ORDER[Math.max(0, Math.min(i < 0 ? 0 : i, maxIdx))];
}

function pickWeighted(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1]?.[0];
}

const SHOP_MAX_ITEM_LEVEL_GAP_BRACKETS = Object.freeze([
  [5, 0],
  [10, 1],
  [15, 2],
  [21, 3],
  [23, 4],
  [25, 5],
  [27, 6],
  [29, 7],
  [31, 8],
  [33, 9],
]);
const SHOP_MAX_ITEM_LEVEL_GAP = 10;

/** Max item-level gap below player level for normal shop gear. */
export function shopItemLevelMaxGap(playerLevel) {
  const L = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const bracket = SHOP_MAX_ITEM_LEVEL_GAP_BRACKETS.find(([maxLevel]) => L <= maxLevel);
  return bracket?.[1] ?? SHOP_MAX_ITEM_LEVEL_GAP;
}

const SHOP_LEVEL_WEIGHTS = Object.freeze([
  [0, 20], [1, 15], [2, 13], [3, 11], [4, 9], [5, 8], [6, 7], [7, 6], [8, 5], [9, 4], [10, 2],
]);

export function rollShopItemLevel(playerLevel, rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  return rollMarketGearItemLevel(playerLevel, r);
}

/** Contraband is 100% current player level. */
export function rollHotDealItemLevel(playerLevel, _rng = Math.random) {
  void _rng;
  return Math.max(1, Math.floor(Number(playerLevel) || 1));
}

/** @deprecated HISTORICAL vendor×markup. Live Market uses blackMarketPrice. */
export function gearShopPurchasePrice(item, rng = Math.random) {
  const rarity = String(item?.rarity || "rare").toLowerCase();
  const slot = item?.type;
  const level = Math.max(1, Math.floor(Number(item?.level_requirement ?? item?.level) || 1));
  const r = typeof rng === "function" ? rng : Math.random;
  const variance =
    GEAR_SHOP_PRICE_VARIANCE_MIN +
    r() * (GEAR_SHOP_PRICE_VARIANCE_MAX - GEAR_SHOP_PRICE_VARIANCE_MIN);
  const priced = blackMarketPrice(level, slot, rarity, variance);
  if (priced > 0) return priced;
  const sale = GearSaleValue(item);
  const markup = SHOP_RARITY_MARKUP[item?.rarity] ?? SHOP_RARITY_MARKUP.rare;
  return Math.max(1, Math.round(sale * markup * variance));
}

export function stimShopPurchasePrice(rarity, playerLevel = 1) {
  const tier = STIM_SHOP_MULT[rarity] != null ? rarity : "uncommon";
  return Math.max(1, stimShopPriceResolved(playerLevel, tier));
}

export function stimShopSellValue(rarity, playerLevel = 1) {
  const tier = STIM_SELL_MULT[rarity] != null ? rarity : "uncommon";
  return Math.max(1, stimSellValueResolved(playerLevel, tier));
}

/** Attach standardized Stim shop/sell pricing for a given player/shop level. */
export function priceStimOffer(def, playerLevel = 1) {
  const rarity = def?.rarity || def?.consumable?.tier || "uncommon";
  const cost = stimShopPurchasePrice(rarity, playerLevel);
  const sell_value = stimShopSellValue(rarity, playerLevel);
  return {
    ...def,
    sell_value,
    _cost: cost,
    cost,
  };
}

export function rollShopGearRarity(_playerLevel, rng = Math.random) {
  void _playerLevel;
  const r = typeof rng === "function" ? rng : Math.random;
  return rollMarketGearRarity(r);
}

export function rollHotDealRarity(_playerLevel, rng = Math.random) {
  void _playerLevel;
  const r = typeof rng === "function" ? rng : Math.random;
  return rollContrabandRarity(r);
}

function createGearFromRandomItemFn(randomItemFn) {
  return ({ rarity, itemLevel, slot, origin, manufacturer, rng }) => {
    const item = randomItemFn(rarity, itemLevel, slot, rng);
    return {
      ...item,
      origin,
      manufacturer,
      shipment_eligible: false,
    };
  };
}

/** Single normal-shop gear offer. */
export function generateSimpleGearSlot(playerLevel, randomItemFn, slotId, rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  const built = generateNormalMarketOffers({
    playerLevel,
    rng: r,
    createGear: createGearFromRandomItemFn(randomItemFn),
    generationId: slotId || "slot",
  });
  const gear = built.offers.find((o) => o._offerKind === "gear") || built.offers[0];
  return { ...gear, _slotId: slotId || gear._slotId };
}

/**
 * Unified normal shop: 8 independent 90/10 gear/stim rolls, then ensure ≥1 Stim.
 */
export function generateSimpleShopStock(seed, playerLevel, randomItemFn) {
  const rng = marketMulberry32(
    (Number(seed) || 0) * SHOP_STOCK_SEED_MULTIPLIER + SHOP_STOCK_SEED_OFFSET,
  );
  const built = generateNormalMarketOffers({
    playerLevel,
    rng,
    createGear: createGearFromRandomItemFn(randomItemFn),
    generationId: shopGenerationId(seed, 0, 0),
  });
  return built.offers;
}

/** @deprecated use generateSimpleShopStock — kept for callers expecting gear-only arrays. */
export function generateSimpleGearStock(seed, playerLevel, randomItemFn) {
  return generateSimpleShopStock(seed, playerLevel, randomItemFn).filter(
    (s) => s._offerKind !== "stim" && s.type !== "consumable"
  );
}

/**
 * Stim qualities — productionMath STIM_TIERS via stimActivation.CONSUMABLE_TIERS.
 * Shop/sell: STIM_SHOP_MULT / STIM_SELL_MULT × SPF (Phase 6 Market purchase is not implemented).
 */
export const MAX_BUFF_STACKS = STIM_MAX_ACTIVE_EFFECTS;
export const MAX_ACTIVE_STAT_TYPES = STIM_MAX_ACTIVE_EFFECTS;
export const CONSUMABLE_TIERS = STIM_CONSUMABLE_TIERS;
export const STIM_RARITY_RANK = Object.freeze({ uncommon: 1, rare: 2, epic: 3 });

export {
  prepareConsumableBuffs,
  resolveStimRarity,
  stimRarityRank,
  STIM_ATTRIBUTES,
};

/**
 * Authoritative Stim mechanics from rarity only — ignore client/item forged
 * mult / duration_hours (except for resolving rarity via resolveStimRarity).
 */
export function getStimDefinition(rarityOrSource) {
  const rarity =
    typeof rarityOrSource === "string"
      ? resolveStimRarity({ rarity: rarityOrSource })
      : resolveStimRarity(rarityOrSource);
  const tier = CONSUMABLE_TIERS[rarity];
  if (!tier) return null;
  return {
    rarity,
    mult: tier.mult,
    bonus_percent: Math.round(tier.mult * PERCENT_SCALE),
    duration_hours: tier.duration_hours,
    max_duration_hours: tier.max_duration_hours ?? tier.duration_hours * MAX_BUFF_STACKS,
    base_duration_ms: tier.duration_hours * MILLISECONDS_PER_HOUR,
    max_duration_ms: stimMaxDurationMs(tier.duration_hours),
    label: tier.label,
  };
}

export function serializeActiveStim(buff, nowMs = clock.nowMs()) {
  if (!buff || typeof buff !== "object") return null;
  const expires = new Date(buff.expires_at).getTime();
  const remaining = Math.max(0, expires - (Number(nowMs) || clock.nowMs()));
  const rarity = resolveStimRarity(buff);
  const def = getStimDefinition(rarity);
  return {
    attribute: buff.stat,
    stat: buff.stat,
    rarity,
    bonus_percent: Math.round(Number(buff.mult || def?.mult || 0) * PERCENT_SCALE),
    mult: Number(buff.mult || def?.mult || 0),
    name: buff.name || null,
    activated_at: buff.activated_at || null,
    last_applied_at: buff.last_applied_at || null,
    expires_at: buff.expires_at,
    remaining_ms: remaining,
    remaining_hours: remaining / MILLISECONDS_PER_HOUR,
    max_duration_hours: def?.max_duration_hours ?? null,
    duration_hours: buff.duration_hours ?? def?.duration_hours ?? null,
    stacks: buff.stacks ?? 1,
    status: remaining > 0 ? "active" : "expired",
  };
}

export function getActiveStims(character, nowMs = clock.nowMs()) {
  const now = Number(nowMs) || clock.nowMs();
  const source = character?.active_buffs || [];
  return (source || [])
    .filter((b) => b && new Date(b.expires_at).getTime() > now)
    .filter((b) => STIM_ATTRIBUTES.includes(String(b.stat || "").toLowerCase()))
    .map((b) => serializeActiveStim(b, now))
    .filter(Boolean);
}

export const CONSUMABLES = Object.entries(CONSUMABLE_TIERS).flatMap(([tierKey, tier]) =>
  STIM_ATTRIBUTES.map((stat) => ({
    name: `${tier.label} ${stat.charAt(0).toUpperCase() + stat.slice(1)} Stim`,
    type: "consumable",
    rarity: tier.rarity,
    level_requirement: 1,
    stats: {},
    consumable: { stat, mult: tier.mult, duration_hours: tier.duration_hours, tier: tierKey },
    sell_value: 0,
    flavor_text: `Boosts ${stat} by ${Math.round(tier.mult * PERCENT_SCALE)}% for ${tier.duration_hours} hours (stacks duration up to ${tier.max_duration_hours}h).`,
    is_equipped: false,
  }))
);

/** Weighted pick: Uncommon 40% / Rare 40% / Epic 20%. */
export function randomConsumable(rng = Math.random) {
  const roll = typeof rng === "function" ? rng() : Math.random();
  let rarity = "uncommon";
  if (roll >= STIM_EPIC_ROLL_THRESHOLD) rarity = "epic";
  else if (roll >= STIM_RARE_ROLL_THRESHOLD) rarity = "rare";
  const pool = CONSUMABLES.filter((c) => c.rarity === rarity);
  const pickRng = typeof rng === "function" ? rng() : Math.random();
  return pool[Math.floor(pickRng * pool.length)] || CONSUMABLES[0];
}

/** @deprecated separate cons stall removed — stims live in unified shop_stock. */
export function generateSimpleConsStock(seed, playerLevel = 1) {
  const rng = mulberry32(
    seed * CONSUMABLE_STOCK_SEED_MULTIPLIER + CONSUMABLE_STOCK_SEED_OFFSET,
  );
  const slots = [];
  for (let i = 0; i < LEGACY_CONSUMABLE_STOCK_COUNT; i++) {
    const def = randomConsumable(rng);
    const priced = priceStimOffer(def, playerLevel);
    slots.push({
      ...priced,
      _slotId: `cons-${seed}-${i}`,
      _offerKind: "stim",
    });
  }
  return slots;
}

export function generateSimpleHotDeal(dayKey, playerLevel, randomItemFn) {
  const dayNum = String(dayKey || getShopGameDayKey()).split("-").reduce((a, p) => a + Number(p || 0), 0);
  const rng = marketMulberry32(dayNum * HOT_DEAL_SEED_MULTIPLIER + HOT_DEAL_SEED_OFFSET);
  return generateContrabandOffer({
    playerLevel,
    rng,
    createGear: createGearFromRandomItemFn(randomItemFn),
    generationId: `contraband-${dayKey || "day"}`,
    periodId: dayKey || getShopGameDayKey(),
  });
}

// ── Consumable / Stim buffs ──────────────────────────────────
/** @deprecated HISTORICAL yearn-block copy — same-tier cap extension now consumes even at cap. */
export const STIM_YEARN_MESSAGE = "Your character doesn't yearn for more yet.";

export function stimMaxDurationMs(durationHours) {
  return Math.max(0, Number(durationHours) || 0)
    * MILLISECONDS_PER_HOUR
    * MAX_BUFF_STACKS;
}

/** @deprecated HISTORICAL yearn-threshold helper — not used by live activation. */
export function stimRefreshRemainingMs(durationHours) {
  const base = Math.max(0, Number(durationHours) || 0) * MILLISECONDS_PER_HOUR;
  return stimMaxDurationMs(durationHours) - base / STIM_REFRESH_BASE_DURATION_DIVISOR;
}

/** Pure helper — remove one active Stim effect by identity. */

export function dismissActiveBuff(character, { stat, expires_at, name } = {}, nowMs = clock.nowMs()) {
  const now = Number(nowMs) || clock.nowMs();
  if (!stat) return { ok: false, reason: "Missing stat" };
  const source = character?.active_buffs || [];
  const next = source.filter((b) => {
    if (b.stat !== stat) return true;
    if (expires_at && b.expires_at !== expires_at) return true;
    if (name && b.name !== name) return true;
    return false;
  });
  const buffs = next.filter((b) => new Date(b.expires_at).getTime() > now);
  return { ok: true, buffs };
}

// ── Mission gear drop (hit chance) + pity ────────────────────
/** @deprecated use MISSION_GEAR_BASE_CHANCE */
export const MISSION_GEAR_DROP_BASE = MISSION_GEAR_BASE_CHANCE;
/** @deprecated use MISSION_GEAR_PITY_INCREMENT */
export const MISSION_GEAR_PITY_STEP = MISSION_GEAR_PITY_INCREMENT;
/** Stim / consumable roll — independent of gear hit/miss. */
/** Stim / consumable roll — only after gear miss (ClaimMission exclusive chain). */
export const MISSION_CONSUMABLE_DROP_CHANCE = 0.25;

export function missionGearMissStreak(character) {
  return Math.max(0, Math.floor(Number(character?.mission_gear_miss_streak) || 0));
}

/** Effective gear drop chance for the next launch given current miss streak. */
export function missionGearDropChance(missStreak = 0) {
  return sdMissionGearDropChance(missStreak);
}

export function rollMissionGearDrop(missStreak = 0, rng = Math.random) {
  return sdRollMissionGearDrop(missStreak, rng);
}

// ── Loot rarity ──────────────────────────────────────────────
export const ITEM_DROP_RATES = {
  common:    { common: 85, uncommon: 12, rare: 3,  epic: 0,  legendary: 0  },
  uncommon:  { common: 55, uncommon: 35, rare: 8,  epic: 2,  legendary: 0  },
  rare:      { common: 25, uncommon: 40, rare: 25, epic: 8,  legendary: 2  },
  epic:      { common: 10, uncommon: 25, rare: 35, epic: 22, legendary: 8  },
  legendary: { common: 0,  uncommon: 10, rare: 30, epic: 35, legendary: 25 },
};

function rollFromTable(rates) {
  const roll = Math.random() * PERCENT_SCALE;
  let cumulative = 0;
  for (const rarity of RARITY_ORDER) {
    cumulative += rates[rarity] || 0;
    if (roll < cumulative) return rarity;
  }
  return RARITY_ORDER[0];
}

export function rollItemRarity(chanceString, playerLevel = 1) {
  const level = Math.max(1, playerLevel || 1);
  let maxIdx = 0;
  for (let t = 0; t < RARITY_ORDER.length; t++) {
    if (level >= (RARITY_UNLOCK_LEVEL[RARITY_ORDER[t]] || 1)) maxIdx = t;
  }
  const rates = ITEM_DROP_RATES[chanceString] || ITEM_DROP_RATES.common;
  const idx = Math.min(RARITY_ORDER.indexOf(rollFromTable(rates)), maxIdx);
  return RARITY_ORDER[idx];
}

/** Apply XP and level-ups onto a character patch (mutates patch in place).
 * Returns the additive progression summary (also stored on patch.__progression).
 */
export function applyXpToCharacter(ch, xpGain, patch = {}) {
  const merged = {
    ...ch,
    experience: patch.experience ?? ch.experience,
    level: patch.level ?? ch.level,
    experience_to_next_level: patch.experience_to_next_level ?? ch.experience_to_next_level,
    stats: patch.stats ?? ch.stats,
    class: patch.class ?? ch.class,
  };
  const granted = grantCharacterXp({
    character: merged,
    xpAmount: xpGain,
    source: "applyXpToCharacter",
  });
  Object.assign(patch, granted.patch);
  patch.__progression = granted.progression;
  return granted.progression;
}

export { consumeProgression } from "./characterProgression.js";

export { getMissionXpPerFuel, getMissionStardustPerFuel, expForLevel };

// ── Arena ────────────────────────────────────────────────────
export const ARENA_DAILY_FREE_BATTLES = 10;
/** Finalized: additional Arena battle entitlement. */
export const ARENA_PAID_BATTLE_COST = 15;
export const ARENA_REFRESH_COST = 50 * XP_STARDUST_SCALE; // legacy Stardust, not XP
export const ARENA_SKIP_COST = 1;
export const ARENA_ELO_K = 28;
export const ARENA_RATING_DELTA_MIN = 6;
export const ARENA_RATING_DELTA_MAX = 36;

export function getArenaStardustReward(level = 1) {
  return ArenaWinStardust(level);
}

export function getArenaXpReward(level = 1) {
  return Math.round(
    getMissionXpPerFuel(level)
      * ARENA_XP_FUEL_EQUIVALENT_NUMERATOR
      / ARENA_XP_FUEL_EQUIVALENT_DENOMINATOR,
  );
}

export function eloExpectedScore(playerRating, oppRating) {
  return 1 / (
    1
    + 10 ** (
      ((oppRating || ARENA_DEFAULT_RATING) - (playerRating || ARENA_DEFAULT_RATING))
        / ARENA_ELO_RATING_SCALE
    )
  );
}

export function eloRatingDelta(playerRating, oppRating, won, k = ARENA_ELO_K) {
  const expected = eloExpectedScore(playerRating, oppRating);
  const raw = Math.round(k * ((won ? 1 : 0) - expected));
  if (won) {
    return Math.max(ARENA_RATING_DELTA_MIN, Math.min(ARENA_RATING_DELTA_MAX, raw));
  }
  return Math.max(-ARENA_RATING_DELTA_MAX, Math.min(-ARENA_RATING_DELTA_MIN, raw));
}

/**
 * Arena rewards. Stardust: first ARENA_REWARDED_WINS_PER_DAY wins/day only.
 * XP still tied to free-battle quota (unrelated progression preserved).
 * @param {object} player
 * @param {object} opp
 * @param {boolean} won
 * @param {boolean|{free?: boolean, rewardedWinsToday?: number}} freeOrOpts
 */
export function computeArenaRewards(player, opp, won, freeOrOpts = true) {
  let free = true;
  let rewardedWinsToday = 0;
  if (typeof freeOrOpts === "object" && freeOrOpts != null) {
    free = freeOrOpts.free !== false;
    rewardedWinsToday = Math.max(0, Math.floor(Number(freeOrOpts.rewardedWinsToday) || 0));
  } else {
    free = !!freeOrOpts;
  }
  const ratingDelta = eloRatingDelta(
    player.arena_rating || ARENA_DEFAULT_RATING,
    opp?.arena_rating || ARENA_DEFAULT_RATING,
    won,
  );
  const grantSd = won && arenaWinGrantsStardust(rewardedWinsToday);
  const grantXp = free && won;
  return {
    won,
    free,
    experience: grantXp ? getArenaXpReward(player.level || 1) : 0,
    stardust: grantSd ? getArenaStardustReward(player.level || 1) : 0,
    arena_rating_delta: ratingDelta,
    stardust_rewarded: grantSd,
  };
}

// ── Dungeon ──────────────────────────────────────────────────
export const DUNGEON_ENEMIES_PER_PLANET = 10;
/** @deprecated Death quotas removed — infinite retries with shared cooldown. */
export const DUNGEON_DEATHS_PER_DAY = 0;
/** @deprecated Continue fee removed with death quotas. */
export const DUNGEON_CONTINUE_COST = 0;
/** Finalized: dungeon cooldown skip (Nova crystals). */
export const DUNGEON_SKIP_COST = 25;
/** Shared post-sim cooldown for all dungeon / wormhole fights. */
export const DUNGEON_BATTLE_COOLDOWN_HOURS = 1;
export const DUNGEON_BATTLE_COOLDOWN_MS = DUNGEON_BATTLE_COOLDOWN_HOURS
  * MILLISECONDS_PER_HOUR;
/** @deprecated use DUNGEON_BATTLE_COOLDOWN_MS */
export const DUNGEON_WIN_COOLDOWN_MS = DUNGEON_BATTLE_COOLDOWN_MS;
/** @deprecated use DUNGEON_BATTLE_COOLDOWN_MS */
export const DUNGEON_LOSS_COOLDOWN_MS = DUNGEON_BATTLE_COOLDOWN_MS;
export const DUNGEON_STORY_PLANETS = 10;

export const DUNGEON_TOTAL_DRU = [0, 40, 50, 60, 70, 95, 110, 125, 140, 155, 185];
export const DUNGEON_ENEMY_DRU_SHARE = [
  0, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.14, 0.18,
];
export const DUNGEON_ENEMY_LEVELS = [
  null,
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  [30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
  [40, 42, 43, 45, 46, 48, 49, 51, 52, 54],
  [55, 57, 58, 60, 61, 63, 64, 66, 67, 69],
  [70, 72, 74, 76, 78, 80, 82, 84, 86, 88],
  [90, 93, 95, 98, 100, 103, 105, 108, 110, 113],
  [115, 118, 120, 123, 125, 128, 130, 133, 135, 138],
  [140, 143, 146, 149, 152, 155, 158, 161, 164, 167],
  [170, 173, 177, 180, 183, 187, 190, 193, 197, 200],
];

/**
 * Minimum PLAYER level to attempt each story dungeon (index = planet id 1–10).
 * Keep in sync with src/lib/dungeonEngine.js DUNGEON_UNLOCK_LEVELS.
 */
export const DUNGEON_UNLOCK_LEVELS = Object.freeze([
  null, 10, 20, 30, 40, 50, 60, 70, 90, 120, 140,
]);

export function getDungeonUnlockLevel(planetId) {
  const id = Math.floor(Number(planetId) || 0);
  if (id >= 1 && id <= DUNGEON_STORY_PLANETS) return DUNGEON_UNLOCK_LEVELS[id];
  return null;
}

export function isDungeonUnlockedByLevel(planetId, playerLevel) {
  const unlock = getDungeonUnlockLevel(planetId);
  if (unlock == null) return true;
  return Math.max(1, Math.floor(Number(playerLevel) || 1)) >= unlock;
}

const D10_LEVEL_OFFSETS = [0, 3, 7, 10, 13, 17, 20, 23, 27, 30];

/** Minimal planet ship-mod grant table (id → flavor + SHIP_MODS cat). */
export function getDungeonBand(planetId) {
  return Math.max(1, Math.floor(planetId || 1));
}

export function getDungeonTotalDru(planetId) {
  const band = getDungeonBand(planetId);
  if (band <= DUNGEON_STORY_PLANETS) return DUNGEON_TOTAL_DRU[band];
  const depth = band - DUNGEON_STORY_PLANETS;
  return Math.round(WORMHOLE_BASE_TOTAL_DRU + depth * WORMHOLE_DRU_PER_DEPTH);
}

export function getEnemyDru(planetId, enemyIndex) {
  const idx = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, enemyIndex || 1));
  const share = DUNGEON_ENEMY_DRU_SHARE[idx];
  return Math.round(getDungeonTotalDru(planetId) * share * DRU_PRECISION_SCALE)
    / DRU_PRECISION_SCALE;
}

export function getDungeonEnemyLevel(planetId, enemyIndex) {
  const idx = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, enemyIndex || 1));
  const band = getDungeonBand(planetId);
  if (band <= DUNGEON_STORY_PLANETS) return DUNGEON_ENEMY_LEVELS[band][idx - 1];
  const depth = band - DUNGEON_STORY_PLANETS;
  const start = WORMHOLE_BASE_ENEMY_LEVEL
    + (depth - 1) * WORMHOLE_LEVELS_PER_DEPTH
    + WORMHOLE_FIRST_ENEMY_OFFSET;
  return start + D10_LEVEL_OFFSETS[idx - 1];
}

export function druToRewards(dru, enemyLevel) {
  const lvl = Math.max(1, enemyLevel || 1);
  const units = Math.max(0, Number(dru) || 0);
  return {
    // Standard dungeon: XP only — no direct Stardust.
    // getMissionXpPerFuel is canonical 1:1 XP (no storage ×10).
    // XP = round(DRU × MissionXPPerFuel(enemyLevel) × DUNGEON_XP_PER_DRU_MULTIPLIER).
    stardust: 0,
    experience: Math.max(
      units > 0 ? 1 : 0,
      Math.round(units * getMissionXpPerFuel(lvl) * DUNGEON_XP_PER_DRU_MULTIPLIER)
    ),
  };
}

export function dungeonCooldownMs(_won) {
  return DUNGEON_BATTLE_COOLDOWN_MS;
}

export function computeMiningReward(level, hours) {
  return miningStardustResolved({
    snapshotLevel: level,
    minutes: (Number(hours) || 0) * PRODUCTION_MINUTES_PER_HOUR,
  });
}

// ── Weekly nova quests ───────────────────────────────────────
export const WEEKLY_NOVA_QUESTS = [
  { id: "arena", key: "arena", goal: 5, reward: 8 },
  { id: "dungeon", key: "dungeon", goal: 3, reward: 7 },
  { id: "missions", key: "missions", goal: 5, reward: 5 },
];

export function ensureWeeklyNovaState(character) {
  const week = getWeekKey();
  const raw = character?.weekly_nova_quests;
  if (raw && raw.week === week) {
    return {
      week,
      arena: raw.arena || 0,
      dungeon: raw.dungeon || 0,
      missions: raw.missions || 0,
      claimed: Array.isArray(raw.claimed) ? raw.claimed : [],
    };
  }
  return { week, arena: 0, dungeon: 0, missions: 0, claimed: [] };
}

export function progressWeeklyNovaQuest(character, key, amount = 1) {
  if (!character || amount <= 0) return null;
  if (!WEEKLY_NOVA_QUESTS.some((q) => q.key === key)) return null;
  const state = ensureWeeklyNovaState(character);
  const quest = WEEKLY_NOVA_QUESTS.find((q) => q.key === key);
  const nextVal = Math.min(quest.goal, (state[key] || 0) + amount);
  return { ...state, [key]: nextVal };
}

// ── Casino (casino_v2 finalized games) ───────────────────────
export const NOVA_CASINO_OPEN = true;
export const CASINO_MAX_NOVA_BET = 1000;
export const CASINO_MIN_NOVA_BET = 100;
/** Max stardust bet = 50× mission SD/F; min = 1× SD/F. */
export const CASINO_STARDUST_BET_SD_MULT = 50;
export const CASINO_MAX_STARDUST_BET_CAP = 10_000_000 * XP_STARDUST_SCALE; // legacy Stardust cap, not XP
export const CASINO_MIN_STARDUST_BET_FLOOR = 1;

export function getCasinoMaxStardustBet(level = 1) {
  const sdf = Math.max(1, Math.round(getMissionStardustPerFuel(level)));
  return Math.min(CASINO_MAX_STARDUST_BET_CAP, sdf * CASINO_STARDUST_BET_SD_MULT);
}

export function getCasinoMinStardustBet(level = 1) {
  return Math.max(1, Math.round(getMissionStardustPerFuel(level)));
}

/** @deprecated Prefer getCasinoMaxStardustBet(level). */
export const CASINO_MAX_STARDUST_BET = CASINO_MIN_STARDUST_BET_FLOOR;

/** Legacy wheel tiers kept for historical docs only — live odds in casinoGames.js. */
export const CASINO_WHEEL_TIERS = [
  { p: 0.6, mult: 0, label: "Lose" },
  { p: 0.2, mult: 1, label: "Shove" },
  { p: 0.1, mult: 2, label: "2×" },
  { p: 0.05, mult: 3, label: "3×" },
  { p: 0.03, mult: 5, label: "5×" },
  { p: 0.02, mult: 10, label: "10×" },
];

export const GUILD_CREATE_COST = 500 * XP_STARDUST_SCALE; // legacy Stardust, not XP
export const GUILD_WAR_DECLARE_COST = 500 * XP_STARDUST_SCALE; // legacy Stardust, not XP
export const GUILD_WAR_READY_HOURS = 24;
export const CHARACTER_SLOT_COST = 500;
export const CHARACTER_MAX_SLOTS = 3;
