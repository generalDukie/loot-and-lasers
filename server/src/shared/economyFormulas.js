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
import { XP_STARDUST_SCALE } from "./economyConstants.js";

/** Global mission XP rebalance (applied after XP/Fuel × efficiency; scale already in XP/Fuel). */
export const MISSION_XP_REBALANCE = 0.85;
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
  AttributePurchaseCost,
  MissionStardustReward,
  ArenaWinStardust,
  computeMiningReward as miningStardustFromHours,
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

export { XP_STARDUST_SCALE };

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
// ── Classes (baseStats only) ─────────────────────────────────
const CLASS_TYPE_BASE_STATS = {
  strength:  { strength: 15, agility: 8,  intellect: 6,  vitality: 14, luck: 7  },
  agility:   { strength: 7,  agility: 15, intellect: 7,  vitality: 11, luck: 10 },
  intellect: { strength: 6,  agility: 8,  intellect: 15, vitality: 13, luck: 8  },
};

export const CLASS_BASE_STATS = {
  Vanguard: { ...CLASS_TYPE_BASE_STATS.strength },
  "Shadow Operative": { ...CLASS_TYPE_BASE_STATS.agility },
  Technomancer: { ...CLASS_TYPE_BASE_STATS.intellect },
  "Astral Warden": { ...CLASS_TYPE_BASE_STATS.strength },
  "Void Runner": { ...CLASS_TYPE_BASE_STATS.agility },
  "Cosmic Engineer": { ...CLASS_TYPE_BASE_STATS.intellect },
};

// ── Attribute purchases ──────────────────────────────────────
// Cost curve: AttributePurchaseCost in stardustEconomy.js (log-PCHIP anchors).

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
  return AttributePurchaseCost(purchaseNumber);
}

export const ATTR_STAT_KEYS = ["strength", "agility", "intellect", "vitality", "luck"];

export function getAttributePurchaseCount(character, stat) {
  if (!character) return 0;
  if (stat) {
    const by = character.attribute_purchases_by_stat;
    if (by && typeof by[stat] === "number" && Number.isFinite(by[stat])) {
      return Math.max(0, Math.floor(by[stat]));
    }
    const base = CLASS_BASE_STATS[character.class] || {};
    return Math.max(0, (character.stats?.[stat] || 0) - (base[stat] || 0));
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
export const STARDUST_PER_RARITY = {
  common: 8 * XP_STARDUST_SCALE,
  uncommon: 20 * XP_STARDUST_SCALE,
  rare: 50 * XP_STARDUST_SCALE,
  epic: 120 * XP_STARDUST_SCALE,
  legendary: 280 * XP_STARDUST_SCALE,
};

export const STARDUST_TYPE_WEIGHT = { ...ITEM_SELL_TYPE_WEIGHT };

export function computeStardustValue(item) {
  return computeItemVendorValue(item);
}

export const NOVA_CRYSTAL_PER_RARITY = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 10 };

export function computeNovaCrystalCost(item) {
  const base = NOVA_CRYSTAL_PER_RARITY[item.rarity] ?? 0;
  if (!base) return 0;
  const levelMult = 1 + (item.level_requirement || 1) * 0.1;
  return Math.max(1, Math.round(base * levelMult));
}

// ── Fuel ─────────────────────────────────────────────────────
export const FUEL_MAX = 100;
/** Hard wallet ceiling for character stardust balance. */
export const STARDUST_MAX = 5_000_000_000_000 * XP_STARDUST_SCALE;

export function clampStardust(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.min(STARDUST_MAX, Math.max(0, Math.floor(n)));
}
export const FUEL_CYCLE_MS = 24 * 60 * 60 * 1000;
export const FUEL_PURCHASE_AMOUNT = 20;
/** Finalized: 20 Fuel costs 20 Nova (flat). */
export const FUEL_PURCHASE_COST = 20;
export const FUEL_PURCHASE_MAX = 10;
export const MISSION_MIN_FUEL = 0.25;

export function checkFuelReset(character, nowMs = clock.nowMs()) {
  const storedMax = character.max_fuel || FUEL_MAX;
  // While hangar is retired, daily refill uses base tank only — do not overwrite saved max_fuel.
  const max = getEffectiveMaxFuel(character);
  const resetAt = character.fuel_reset_at ? new Date(character.fuel_reset_at) : null;
  const now = Number(nowMs) || clock.nowMs();
  const fuelVal = Number(character.fuel);
  const fuelMissing = character.fuel == null || !Number.isFinite(fuelVal);
  if (fuelMissing || !resetAt || now - resetAt.getTime() >= FUEL_CYCLE_MS) {
    return { fuel: max, max_fuel: storedMax, fuel_reset_at: new Date(now).toISOString(), fuel_purchases: 0 };
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

// ── Ship mods (effect totals for mission fuel/duration/rewards) ─
export const STARTER_SHIP = "scout";
export const SCOUT_MILESTONE_LEVEL = 20;
export const SCOUT_MILESTONE_MOD_ID = "fuel_tank_1";
export const NAME_CHANGE_COST = 500;
export const GUILD_WAR_SIM_COST = 500 * XP_STARDUST_SCALE;
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

export function getInventoryCap(character) {
  const base = 10;
  const modBonus = Math.round(getModEffectTotal(character, "inventory_cap_bonus") || 0);
  let entBonus = 0;
  const accountId = character?.created_by_id;
  if (accountId) {
    // Lazy import avoids circular init with entitlements ↔ economyFormulas.
    try {
      // eslint-disable-next-line no-undef
      const resolveMod = globalThis.__llResolveInventoryExpansion;
      if (typeof resolveMod === "function") {
        entBonus = resolveMod(accountId);
      }
    } catch {
      entBonus = 0;
    }
  }
  return base + modBonus + entBonus;
}

// Wire for applyCharacterRewards without an import cycle (rewards ↔ this module).
globalThis.__llGetInventoryCap = getInventoryCap;

export function getEffectiveMissionDuration(character, mission) {
  const warpReduction = getModEffectTotal(character, "mission_duration_reduction");
  const fuelSpeed = getFuelSpeedTotal(character);
  const totalReduction = Math.min(REDUCTION_CAP, warpReduction + fuelSpeed);
  const raw = Math.max(1, Math.floor((mission?.duration_seconds || 0) * (1 - totalReduction)));
  return Math.max(15, Math.round(raw / 15) * 15);
}

export function getEffectiveFuelCost(character, mission) {
  if (typeof mission?.fuel_cost === "number") {
    return Math.max(MISSION_MIN_FUEL, Math.round(mission.fuel_cost * 100) / 100);
  }
  const effectiveSeconds = getEffectiveMissionDuration(character, mission);
  const raw = effectiveSeconds / 60 - getModEffectTotal(character, "fuel_cost_reduction");
  return Math.max(MISSION_MIN_FUEL, Math.round(raw * 100) / 100);
}

// ── Mission XP / SD ──────────────────────────────────────────
/** Mission reward variance band by player level (±fraction around 1.0). */
export function getMissionRewardVariance(_playerLevel = 1) {
  return 0.10;
}

/**
 * Per-mission variance roll — independent for XP and Stardust.
 * Uniform ±10% (0.90–1.10) at every level.
 */
export function rollMissionEfficiency(playerLevel = 1, rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  const v = getMissionRewardVariance(playerLevel);
  const raw = (1 - v) + r() * (2 * v);
  return Math.round(raw * 100) / 100;
}

/** Clamp / default efficiency for the player's variance band. */
export function normalizeMissionEfficiency(value, playerLevel = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  const v = getMissionRewardVariance(playerLevel);
  return Math.min(1 + v, Math.max(1 - v, Math.round(n * 100) / 100));
}

export function computeMissionXpFromFuel(fuelCost, level = 1, efficiency = 1) {
  const fuel = Math.max(0, Number(fuelCost) || 0);
  const eff = normalizeMissionEfficiency(efficiency, level);
  // getMissionXpPerFuel already includes XP_STARDUST_SCALE once.
  return Math.max(
    fuel > 0 ? 1 : 0,
    Math.round(fuel * getMissionXpPerFuel(level) * eff * MISSION_XP_REBALANCE)
  );
}

/** Mission Stardust = ROUND(StardustPerFuel(level) * fuel). Efficiency does not apply. */
export function computeMissionStardustFromFuel(fuelCost, level = 1, _efficiency = 1) {
  return MissionStardustReward(level, fuelCost);
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
  // Naturally complete → no charge (caller should use completion path).
  if (mission.end_time) {
    const remainingMs = Math.max(0, new Date(mission.end_time).getTime() - (_nowMs || clock.nowMs()));
    if (remainingMs <= 0) return 0;
  }
  const fuel =
    typeof mission.fuel_cost === "number"
      ? mission.fuel_cost
      : typeof mission.original_fuel_cost === "number"
        ? mission.original_fuel_cost
        : 0;
  // Lazy import avoided — inline half-unit formula (same as currencyService).
  const half = Math.max(1, Math.ceil(Math.max(0, Number(fuel) || 0) * 0.2));
  return half / 2; // display Nova (.0 or .5)
}

/** Skip cost in integer half-Nova units. */
export function skipCostHalfUnits(mission, nowMs = clock.nowMs()) {
  return Math.round(skipCostFor(mission, nowMs) * 2);
}

// ── Shop ─────────────────────────────────────────────────────
/** Finalized paid Gear Shop refresh. */
export const SHOP_REFRESH_COST = 20;
export const SHOP_SLOT_COUNT = 8;
export const SHOP_GEAR_CHANCE = 0.8;
export const SHOP_STIM_CHANCE = 0.2;
export const SHOP_MIN_STIMS = 1;
export const GEAR_SHOP_PRICE_VARIANCE_MIN = 0.8;
export const GEAR_SHOP_PRICE_VARIANCE_MAX = 1.2;
export const HOT_DEAL_REFRESH_COUNT = 10;
export const SHOP_RARITY_MARKUP = Object.freeze({
  common: 2.0,
  uncommon: 2.5,
  rare: 3.5,
  epic: 5.0,
  legendary: 7.0,
});
export const SHOP_GEAR_RARITY_WEIGHTS = Object.freeze({
  common: 0.6,
  uncommon: 0.3,
  rare: 0.08,
  epic: 0.015,
  legendary: 0.005,
});
export const HOT_DEAL_RARITY_WEIGHTS = Object.freeze({
  uncommon: 0.35,
  rare: 0.45,
  epic: 0.15,
  legendary: 0.05,
});
export const STIM_SHOP_FUEL_EQUIV = Object.freeze({
  uncommon: 2,
  rare: 4,
  epic: 10,
});
export const STIM_SELL_FUEL_EQUIV = Object.freeze({
  uncommon: 1,
  rare: 2,
  epic: 5,
});

/** 12-hour shop windows aligned to 2:00 AM / 2:00 PM America/New_York. */
export function getShopWindow(nowMs = clock.nowMs()) {
  const parts = getZonedParts(new Date(nowMs), DEFAULT_GAME_ZONE);
  let startHour;
  let anchorMs = nowMs;
  if (parts.hour >= 14) {
    startHour = 14;
  } else if (parts.hour >= 2) {
    startHour = 2;
  } else {
    startHour = 14;
    anchorMs = nowMs - 12 * 3600 * 1000;
  }
  const anchor = getZonedParts(new Date(anchorMs), DEFAULT_GAME_ZONE);
  const startUtc = zonedLocalToUtc(
    { year: anchor.year, month: anchor.month, day: anchor.day, hour: startHour, minute: 0, second: 0 },
    DEFAULT_GAME_ZONE
  ).utc.getTime();
  const endsAt = startUtc + 12 * 60 * 60 * 1000;
  const idx = Math.floor(startUtc / (12 * 60 * 60 * 1000));
  return {
    idx,
    startsAt: startUtc,
    endsAt,
    secondsLeft: Math.max(0, Math.floor((endsAt - nowMs) / 1000)),
    rotationPeriodId: `shop-rotation:global:${idx}`,
  };
}

/** Game-day key for Hot Deal (resets at 2:00 PM ET). */
export function getShopGameDayKey(nowMs = clock.nowMs()) {
  const parts = getZonedParts(new Date(nowMs), DEFAULT_GAME_ZONE);
  let y = parts.year;
  let m = parts.month;
  let d = parts.day;
  if (parts.hour < 14) {
    const back = getZonedParts(new Date(nowMs - 14 * 3600 * 1000), DEFAULT_GAME_ZONE);
    y = back.year;
    m = back.month;
    d = back.day;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Haggle: ~40% buy at 15–20% off; otherwise listing is yanked (no purchase). */
export function rollHaggle(rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  if (r() < 0.4) {
    const pct = 15 + Math.floor(r() * 6); // 15–20 inclusive
    const mult = 1 - pct / 100;
    return { ok: true, mult, key: "deal", pct, label: `They blinked — ${pct}% off` };
  }
  return {
    ok: false,
    mult: 0,
    key: "refused",
    label: "Deal soured — they yanked the listing",
  };
}

export function normalizeShopMeta(character, win = getShopWindow(), day = getShopGameDayKey()) {
  const prev = character?.shop_meta || {};
  const hot_day = day;
  const hot_purchased = prev.hot_day === day ? !!prev.hot_purchased : false;
  const hot_yanked = prev.hot_day === day ? !!prev.hot_yanked : false;
  const hot_manual_refresh_count =
    prev.hot_day === day ? Math.max(0, Math.floor(prev.hot_manual_refresh_count || 0)) : 0;
  if (!prev.window_idx || prev.window_idx !== win.idx) {
    return {
      window_idx: win.idx,
      gear_refresh: 0,
      cons_refresh: 0,
      free_refresh_used: false,
      manual_refresh_count: 0,
      purchased: {},
      yanked: {},
      hot_day,
      hot_purchased,
      hot_yanked,
      hot_manual_refresh_count,
    };
  }
  return {
    window_idx: win.idx,
    gear_refresh: Math.max(0, Math.floor(prev.gear_refresh || 0)),
    cons_refresh: Math.max(0, Math.floor(prev.cons_refresh || 0)),
    free_refresh_used: !!prev.free_refresh_used,
    manual_refresh_count: Math.max(0, Math.floor(prev.manual_refresh_count || 0)),
    purchased: prev.purchased && typeof prev.purchased === "object" ? { ...prev.purchased } : {},
    yanked: prev.yanked && typeof prev.yanked === "object" ? { ...prev.yanked } : {},
    hot_day,
    hot_purchased,
    hot_yanked,
    hot_manual_refresh_count,
    gear_stock: prev.gear_stock,
    cons_stock: prev.cons_stock,
    shop_stock: prev.shop_stock,
    hot_deal: prev.hot_deal,
  };
}

export function shopGearSeed(meta, win = getShopWindow()) {
  return (win?.idx || 0) + (meta?.gear_refresh || 0) + (meta?.manual_refresh_count || 0) * 17;
}

export function shopConsSeed(meta, win = getShopWindow()) {
  return (win?.idx || 0) + (meta?.cons_refresh || 0) + (meta?.manual_refresh_count || 0) * 19;
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

/** Max item-level gap below player level for normal shop gear. */
export function shopItemLevelMaxGap(playerLevel) {
  const L = Math.max(1, Math.floor(Number(playerLevel) || 1));
  if (L <= 5) return 0;
  if (L <= 10) return 1;
  if (L <= 15) return 2;
  if (L <= 20) return 3;
  if (L <= 21) return 3;
  if (L <= 23) return 4;
  if (L <= 25) return 5;
  if (L <= 27) return 6;
  if (L <= 29) return 7;
  if (L <= 31) return 8;
  if (L <= 33) return 9;
  return 10;
}

const SHOP_LEVEL_WEIGHTS = Object.freeze([
  [0, 20], [1, 15], [2, 13], [3, 11], [4, 9], [5, 8], [6, 7], [7, 6], [8, 5], [9, 4], [10, 2],
]);

export function rollShopItemLevel(playerLevel, rng = Math.random) {
  const L = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const maxGap = shopItemLevelMaxGap(L);
  const valid = SHOP_LEVEL_WEIGHTS.filter(([gap]) => gap <= maxGap && L - gap >= 1);
  const total = valid.reduce((s, [, w]) => s + w, 0) || 1;
  let roll = (typeof rng === "function" ? rng() : Math.random()) * total;
  for (const [gap, w] of valid) {
    roll -= w;
    if (roll <= 0) return Math.max(1, L - gap);
  }
  return L;
}

const HOT_LEVEL_WEIGHTS = Object.freeze([[0, 40], [1, 30], [2, 20], [3, 10]]);

export function rollHotDealItemLevel(playerLevel, rng = Math.random) {
  const L = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const valid = HOT_LEVEL_WEIGHTS.filter(([gap]) => L - gap >= 1);
  const total = valid.reduce((s, [, w]) => s + w, 0) || 1;
  let roll = (typeof rng === "function" ? rng() : Math.random()) * total;
  for (const [gap, w] of valid) {
    roll -= w;
    if (roll <= 0) return Math.max(1, L - gap);
  }
  return L;
}

export function gearShopPurchasePrice(item, rng = Math.random) {
  const sale = GearSaleValue(item);
  const markup = SHOP_RARITY_MARKUP[item?.rarity] ?? 3.5;
  const r = typeof rng === "function" ? rng : Math.random;
  const variance =
    GEAR_SHOP_PRICE_VARIANCE_MIN +
    r() * (GEAR_SHOP_PRICE_VARIANCE_MAX - GEAR_SHOP_PRICE_VARIANCE_MIN);
  return Math.max(1, Math.round(sale * markup * variance));
}

export function stimShopPurchasePrice(rarity, playerLevel = 1) {
  const S = StardustPerFuel(Math.max(1, playerLevel));
  const mult = STIM_SHOP_FUEL_EQUIV[rarity] ?? 2;
  return Math.max(1, Math.round(S * mult));
}

export function stimShopSellValue(rarity, playerLevel = 1) {
  const S = StardustPerFuel(Math.max(1, playerLevel));
  const mult = STIM_SELL_FUEL_EQUIV[rarity] ?? 1;
  return Math.max(1, Math.round(S * mult));
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

export function rollShopGearRarity(playerLevel, rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  return clampRarityByLevel(pickWeighted(SHOP_GEAR_RARITY_WEIGHTS, r), playerLevel);
}

export function rollHotDealRarity(playerLevel, rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  return clampRarityByLevel(pickWeighted(HOT_DEAL_RARITY_WEIGHTS, r), playerLevel);
}

/** Single normal-shop gear offer. */
export function generateSimpleGearSlot(playerLevel, randomItemFn, slotId, rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  const type = SHOP_GEAR_TYPES[Math.floor(r() * SHOP_GEAR_TYPES.length)];
  const rarity = rollShopGearRarity(playerLevel, r);
  const itemLevel = rollShopItemLevel(playerLevel, r);
  const item = randomItemFn(rarity, itemLevel, type);
  const cost = gearShopPurchasePrice(item, r);
  const nova_cost = computeNovaCrystalCost(item);
  return {
    ...item,
    level_requirement: itemLevel,
    _slotId: slotId,
    _offerKind: "gear",
    cost,
    nova_cost,
  };
}

function generateShopStimSlot(playerLevel, slotId, rng) {
  const def = randomConsumable(rng);
  const priced = priceStimOffer(def, playerLevel);
  return {
    ...priced,
    _slotId: slotId,
    _offerKind: "stim",
  };
}

/**
 * Unified normal shop: 8 independent 80/20 gear/stim rolls, then ensure ≥1 Stim.
 * Also mirrors into gear_stock / cons_stock for legacy UI paths.
 */
export function generateSimpleShopStock(seed, playerLevel, randomItemFn) {
  const rng = mulberry32(seed * 7919 + 13);
  const slots = [];
  for (let i = 0; i < SHOP_SLOT_COUNT; i++) {
    const isStim = rng() < SHOP_STIM_CHANCE;
    if (isStim) slots.push(generateShopStimSlot(playerLevel, `${seed}-${i}`, rng));
    else slots.push(generateSimpleGearSlot(playerLevel, randomItemFn, `${seed}-${i}`, rng));
  }
  const stimCount = slots.filter((s) => s._offerKind === "stim" || s.type === "consumable").length;
  if (stimCount < SHOP_MIN_STIMS) {
    const idx = Math.floor(rng() * slots.length);
    slots[idx] = generateShopStimSlot(playerLevel, `${seed}-${idx}-minstim`, rng);
  }
  return slots;
}

/** @deprecated use generateSimpleShopStock — kept for callers expecting gear-only arrays. */
export function generateSimpleGearStock(seed, playerLevel, randomItemFn) {
  return generateSimpleShopStock(seed, playerLevel, randomItemFn).filter(
    (s) => s._offerKind !== "stim" && s.type !== "consumable"
  );
}

/**
 * Stim qualities (authoritative). No Common or Legendary Stims.
 * Shop/sell prices are level-scaled via StardustPerFuel (2S / 4S / 10S buy; 50% sell).
 */
export const CONSUMABLE_TIERS = {
  uncommon: { mult: 0.05, duration_hours: 6,  label: "Uncommon", rarity: "uncommon" },
  rare:     { mult: 0.10, duration_hours: 12, label: "Rare",     rarity: "rare" },
  epic:     { mult: 0.20, duration_hours: 24, label: "Epic",     rarity: "epic" },
};

export const STIM_RARITY_RANK = { uncommon: 1, rare: 2, epic: 3 };

const CONSUMABLE_STATS = ["strength", "agility", "intellect", "vitality", "luck"];

export const STIM_ATTRIBUTES = Object.freeze([...CONSUMABLE_STATS]);

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
    bonus_percent: Math.round(tier.mult * 100),
    duration_hours: tier.duration_hours,
    max_duration_hours: tier.duration_hours * MAX_BUFF_STACKS,
    base_duration_ms: tier.duration_hours * MS_PER_HOUR,
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
    bonus_percent: Math.round(Number(buff.mult || def?.mult || 0) * 100),
    mult: Number(buff.mult || def?.mult || 0),
    name: buff.name || null,
    activated_at: buff.activated_at || null,
    expires_at: buff.expires_at,
    remaining_ms: remaining,
    remaining_hours: remaining / MS_PER_HOUR,
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
    .map((b) => serializeActiveStim(b, now))
    .filter(Boolean);
}

export const CONSUMABLES = Object.entries(CONSUMABLE_TIERS).flatMap(([tierKey, tier]) =>
  CONSUMABLE_STATS.map((stat) => ({
    name: `${tier.label} ${stat.charAt(0).toUpperCase() + stat.slice(1)} Stim`,
    type: "consumable",
    rarity: tier.rarity,
    level_requirement: 1,
    stats: {},
    consumable: { stat, mult: tier.mult, duration_hours: tier.duration_hours, tier: tierKey },
    sell_value: 0,
    flavor_text: `Boosts ${stat} by ${Math.round(tier.mult * 100)}% for ${tier.duration_hours} hours (stacks duration up to ${tier.duration_hours * 3}h).`,
    is_equipped: false,
  }))
);

/** Weighted pick: Uncommon 40% / Rare 40% / Epic 20%. */
export function randomConsumable(rng = Math.random) {
  const roll = typeof rng === "function" ? rng() : Math.random();
  let rarity = "uncommon";
  if (roll >= 0.8) rarity = "epic";
  else if (roll >= 0.4) rarity = "rare";
  const pool = CONSUMABLES.filter((c) => c.rarity === rarity);
  const pickRng = typeof rng === "function" ? rng() : Math.random();
  return pool[Math.floor(pickRng * pool.length)] || CONSUMABLES[0];
}

/** @deprecated separate cons stall removed — stims live in unified shop_stock. */
export function generateSimpleConsStock(seed, playerLevel = 1) {
  const rng = mulberry32(seed * 4099 + 7);
  const slots = [];
  for (let i = 0; i < 2; i++) {
    slots.push(generateShopStimSlot(playerLevel, `cons-${seed}-${i}`, rng));
  }
  return slots;
}

export function generateSimpleHotDeal(dayKey, playerLevel, randomItemFn) {
  const dayNum = String(dayKey || getShopGameDayKey()).split("-").reduce((a, p) => a + Number(p || 0), 0);
  const rng = mulberry32(dayNum * 104729 + 77);
  const type = SHOP_GEAR_TYPES[Math.floor(rng() * SHOP_GEAR_TYPES.length)];
  const rarity = rollHotDealRarity(playerLevel, rng);
  const itemLevel = rollHotDealItemLevel(playerLevel, rng);
  const item = randomItemFn(rarity, itemLevel, type);
  const cost = gearShopPurchasePrice(item, rng);
  const nova_cost = computeNovaCrystalCost(item);
  return {
    ...item,
    level_requirement: itemLevel,
    _slotId: `hot-${dayKey}`,
    _hotDeal: true,
    _offerKind: "gear",
    cost,
    nova_cost,
  };
}

// ── Consumable / Stim buffs ──────────────────────────────────
export const MAX_BUFF_STACKS = 3;
export const MAX_ACTIVE_STAT_TYPES = 3;
export const STIM_YEARN_MESSAGE = "Your character doesn't yearn for more yet.";

const MS_PER_HOUR = 3600 * 1000;

/** Infer rarity for legacy buffs/items that lack an explicit rarity field. */
export function resolveStimRarity(source) {
  const raw =
    source?.rarity ||
    source?.consumable?.tier ||
    source?.tier ||
    null;
  if (raw && STIM_RARITY_RANK[raw] != null) return raw;
  if (raw === "common" || raw === "minor") return "uncommon";
  if (raw === "legendary" || raw === "mythic" || raw === "prime") return "epic";
  const mult = Number(source?.mult ?? source?.consumable?.mult ?? 0);
  if (mult >= 0.2) return "epic";
  if (mult >= 0.1) return "rare";
  if (mult > 0) return "uncommon";
  return "uncommon";
}

export function stimRarityRank(rarity) {
  return STIM_RARITY_RANK[rarity] ?? 0;
}

export function stimMaxDurationMs(durationHours) {
  return Math.max(0, Number(durationHours) || 0) * MS_PER_HOUR * MAX_BUFF_STACKS;
}

/** Remaining ms at/below which a max-stacked stim may be refreshed to max. */
export function stimRefreshRemainingMs(durationHours) {
  const base = Math.max(0, Number(durationHours) || 0) * MS_PER_HOUR;
  return stimMaxDurationMs(durationHours) - base / 2;
}

function inferStimStacks(remainingMs, baseMs) {
  if (baseMs <= 0) return 1;
  return Math.min(MAX_BUFF_STACKS, Math.max(1, Math.ceil(remainingMs / baseMs)));
}

function makeStimBuff({ stat, mult, name, rarity, durationHours, stacks, expiresAt }) {
  return {
    stat,
    mult,
    name,
    rarity,
    duration_hours: durationHours,
    stacks,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

/**
 * Validate + compute next active_buffs for a Stim use.
 * Does not mutate inventory — caller deletes the item only when ok.
 * @param {object} character
 * @param {object} item
 * @param {array} [sourceBuffs]
 * @param {number} [nowMs]
 */
export function prepareConsumableBuffs(character, item, sourceBuffs, nowMs = clock.nowMs()) {
  if (!character || item?.type !== "consumable" || !item.consumable) {
    return { ok: false, reason: "Not a stim." };
  }
  // Stim Trio shop bundles are not directly injectable.
  if (item._bundle === "stim_trio" || item.consumable?.tier === "bundle") {
    return { ok: false, reason: "Open the Stim Trio bundle first." };
  }

  const now = Number(nowMs) || clock.nowMs();
  const stat = String(item.consumable.stat || "").toLowerCase();
  if (!CONSUMABLE_STATS.includes(stat)) {
    return { ok: false, reason: "Invalid Stim attribute." };
  }

  const rarity = resolveStimRarity(item);
  const tier = CONSUMABLE_TIERS[rarity];
  if (!tier || STIM_RARITY_RANK[rarity] == null) {
    return { ok: false, reason: "Invalid Stim rarity." };
  }
  // Authoritative mechanics — never trust item.consumable.mult / duration_hours.
  const durationHours = tier.duration_hours;
  const mult = tier.mult;
  const baseMs = durationHours * MS_PER_HOUR;
  const maxMs = baseMs * MAX_BUFF_STACKS;
  const refreshAt = maxMs - baseMs / 2;

  const source = sourceBuffs ?? character.active_buffs ?? [];
  const active = (source || []).filter((b) => new Date(b.expires_at).getTime() > now);
  const sameStatIdx = active.findIndex((b) => b.stat === stat);

  if (sameStatIdx < 0) {
    if (new Set(active.map((b) => b.stat)).size >= MAX_ACTIVE_STAT_TYPES) {
      return {
        ok: false,
        reason: `You already have ${MAX_ACTIVE_STAT_TYPES} active Stim effects. Remove one first.`,
      };
    }
    return {
      ok: true,
      buffs: [
        ...active,
        makeStimBuff({
          stat,
          mult,
          name: item.name,
          rarity,
          durationHours,
          stacks: 1,
          expiresAt: now + baseMs,
        }),
      ],
    };
  }

  const existing = active[sameStatIdx];
  const existingRarity = resolveStimRarity(existing);
  const inRank = stimRarityRank(rarity);
  const exRank = stimRarityRank(existingRarity);

  if (inRank < exRank) {
    return {
      ok: false,
      reason: `A stronger ${stat} Stim is already active. Remove it first to use a lower quality.`,
    };
  }

  const buffs = [...active];

  // Higher quality replaces lower — fresh effect, no duration transfer.
  if (inRank > exRank) {
    buffs[sameStatIdx] = makeStimBuff({
      stat,
      mult,
      name: item.name,
      rarity,
      durationHours,
      stacks: 1,
      expiresAt: now + baseMs,
    });
    return { ok: true, buffs };
  }

  // Same rarity: duration stack / max-stack refresh (bonus never stacks).
  // Always keep canonical tier mult (never inherit forged existing.mult).
  const remaining = Math.max(0, new Date(existing.expires_at).getTime() - now);
  let stacks = Number(existing.stacks);
  if (!Number.isFinite(stacks) || stacks < 1) {
    stacks = inferStimStacks(remaining, baseMs);
  }
  stacks = Math.min(MAX_BUFF_STACKS, Math.max(1, Math.floor(stacks)));

  if (stacks >= MAX_BUFF_STACKS) {
    if (remaining > refreshAt) {
      return { ok: false, reason: STIM_YEARN_MESSAGE };
    }
    buffs[sameStatIdx] = makeStimBuff({
      stat,
      mult,
      name: item.name,
      rarity,
      durationHours,
      stacks: MAX_BUFF_STACKS,
      expiresAt: now + maxMs,
    });
    return { ok: true, buffs };
  }

  const newRemaining = Math.min(remaining + baseMs, maxMs);
  const nextStacks = Math.min(MAX_BUFF_STACKS, stacks + 1);
  buffs[sameStatIdx] = makeStimBuff({
    stat,
    mult,
    name: item.name,
    rarity,
    durationHours,
    stacks: nextStacks,
    expiresAt: now + newRemaining,
  });
  return { ok: true, buffs };
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
  const roll = Math.random() * 100;
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
export const ARENA_REFRESH_COST = 50 * XP_STARDUST_SCALE;
export const ARENA_SKIP_COST = 1;
export const ARENA_ELO_K = 28;
export const ARENA_RATING_DELTA_MIN = 6;
export const ARENA_RATING_DELTA_MAX = 36;

export function getArenaStardustReward(level = 1) {
  return ArenaWinStardust(level);
}

export function getArenaXpReward(level = 1) {
  return Math.round(getMissionXpPerFuel(level) * 5 / 7);
}

export function eloExpectedScore(playerRating, oppRating) {
  return 1 / (1 + 10 ** (((oppRating || 1000) - (playerRating || 1000)) / 400));
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
  const ratingDelta = eloRatingDelta(player.arena_rating || 1000, opp?.arena_rating || 1000, won);
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
export const DUNGEON_BATTLE_COOLDOWN_MS = 60 * 60 * 1000;
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
  if (id >= 1 && id <= 10) return DUNGEON_UNLOCK_LEVELS[id];
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
  if (band <= 10) return DUNGEON_TOTAL_DRU[band];
  const depth = band - 10;
  return Math.round(185 + depth * 25);
}

export function getEnemyDru(planetId, enemyIndex) {
  const idx = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, enemyIndex || 1));
  const share = DUNGEON_ENEMY_DRU_SHARE[idx];
  return Math.round(getDungeonTotalDru(planetId) * share * 100) / 100;
}

export function getDungeonEnemyLevel(planetId, enemyIndex) {
  const idx = Math.min(DUNGEON_ENEMIES_PER_PLANET, Math.max(1, enemyIndex || 1));
  const band = getDungeonBand(planetId);
  if (band <= 10) return DUNGEON_ENEMY_LEVELS[band][idx - 1];
  const depth = band - 10;
  const start = 200 + (depth - 1) * 35 + 3;
  return start + D10_LEVEL_OFFSETS[idx - 1];
}

export function druToRewards(dru, enemyLevel) {
  const lvl = Math.max(1, enemyLevel || 1);
  const units = Math.max(0, Number(dru) || 0);
  return {
    // Standard dungeon: XP only — no direct Stardust.
    // getMissionXpPerFuel already includes XP_STARDUST_SCALE once.
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
  return miningStardustFromHours(level, hours);
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
export const CASINO_MAX_STARDUST_BET_CAP = 10_000_000 * XP_STARDUST_SCALE;
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

export const GUILD_CREATE_COST = 500 * XP_STARDUST_SCALE;
export const GUILD_WAR_DECLARE_COST = 500 * XP_STARDUST_SCALE;
export const GUILD_WAR_READY_HOURS = 24;
export const CHARACTER_SLOT_COST = 500;
export const CHARACTER_MAX_SLOTS = 3;
