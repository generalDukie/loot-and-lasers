/**
 * Server-side economy formulas — ported from src/lib/gameData.js + fuelMounts.js.
 * Keep numbers identical; do not retune balance here.
 */
import {
  expForLevel,
  getMissionXpPerFuel,
  getMissionStardustPerFuel,
  getStatPointsForLevelRange,
  XP_STARDUST_SCALE,
} from "./rewards.js";
import {
  computeItemVendorValue,
  ITEM_SELL_TYPE_WEIGHT,
} from "./itemGeneration.js";
import { todayET as todayETFromClock, getWeekKey as getWeekKeyFromClock, clock } from "./time/index.js";

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
const ATTR_PURCHASE_COST_WAYPOINTS = [
  [1, 10], [10, 15], [20, 25], [30, 40], [40, 65], [50, 100],
  [75, 225], [100, 500], [150, 1500], [200, 4000], [300, 20000],
  [400, 75000], [500, 225000], [600, 600000], [650, 1000000],
];

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
  const n = Math.max(1, Math.floor(purchaseNumber || 1));
  let cost;
  if (n <= 650) {
    cost = Math.max(1, Math.round(lerpWaypoints(n, ATTR_PURCHASE_COST_WAYPOINTS)));
  } else {
    // Shape unchanged: ROUND(10 × (1 + (n-1)/97.54)^5.657); scale applied once below.
    cost = Math.max(1, Math.round(10 * (1 + (n - 1) / 97.54) ** 5.657));
  }
  return cost * XP_STARDUST_SCALE;
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
export const FUEL_PURCHASE_COST = 10;
export const FUEL_PURCHASE_MAX = 10;
export const MISSION_MIN_FUEL = 0.25;

export function checkFuelReset(character) {
  const max = character.max_fuel || FUEL_MAX;
  const resetAt = character.fuel_reset_at ? new Date(character.fuel_reset_at) : null;
  const now = Date.now();
  const fuelVal = Number(character.fuel);
  const fuelMissing = character.fuel == null || !Number.isFinite(fuelVal);
  if (fuelMissing || !resetAt || now - resetAt.getTime() >= FUEL_CYCLE_MS) {
    return { fuel: max, max_fuel: max, fuel_reset_at: new Date(now).toISOString(), fuel_purchases: 0 };
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

export function getActiveFuelMounts(character) {
  const now = Date.now();
  return (character?.active_fuel_mounts || []).filter(
    (m) => new Date(m.expires_at).getTime() > now
  );
}

export function getFuelSpeedTotal(character) {
  return getActiveFuelMounts(character).reduce((max, m) => Math.max(max, m.speed || 0), 0);
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
export function getMissionRewardVariance(playerLevel = 1) {
  return (Math.max(1, Number(playerLevel) || 1) <= 10) ? 0.25 : 0.10;
}

/**
 * Per-mission efficiency roll — independent for XP and Stardust.
 * Levels 1–10: ±25% (0.75–1.25). Level 11+: ±10% (0.90–1.10).
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
  return Math.max(fuel > 0 ? 1 : 0, Math.round(fuel * getMissionXpPerFuel(level) * eff));
}

export function computeMissionStardustFromFuel(fuelCost, level = 1, efficiency = 1) {
  const fuel = Math.max(0, Number(fuelCost) || 0);
  const eff = normalizeMissionEfficiency(efficiency, level);
  return Math.max(fuel > 0 ? 1 : 0, Math.round(fuel * getMissionStardustPerFuel(level) * eff));
}

/** Mission junk trinket vendor/dissolve value — ~1× SD/F at completion level. */
export function computeMissionJunkSellValue(level = 1) {
  return Math.max(1, Math.round(getMissionStardustPerFuel(level)));
}

export const SKIP_CRYSTALS_PER_MINUTE = 5;

export function skipCostFor(mission, nowMs = Date.now()) {
  if (!mission || !mission.end_time) return 0;
  const remainingMs = Math.max(0, new Date(mission.end_time).getTime() - nowMs);
  if (remainingMs <= 0) return 0;
  const remainingMinutes = remainingMs / 60000;
  return Math.max(1, Math.ceil(remainingMinutes * SKIP_CRYSTALS_PER_MINUTE));
}

// ── Shop ─────────────────────────────────────────────────────
export const SHOP_REFRESH_COST = 10;
const SHOP_WINDOW_MS = 6 * 60 * 60 * 1000;

export function getShopWindow(nowMs = clock.nowMs()) {
  const ms = nowMs;
  const idx = Math.floor(ms / SHOP_WINDOW_MS);
  const startsAt = idx * SHOP_WINDOW_MS;
  const endsAt = startsAt + SHOP_WINDOW_MS;
  return {
    idx,
    startsAt,
    endsAt,
    secondsLeft: Math.max(0, Math.floor((endsAt - ms) / 1000)),
    rotationPeriodId: `shop-rotation:global:${idx}`,
  };
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

export function normalizeShopMeta(character, win = getShopWindow(), day = todayET()) {
  const prev = character?.shop_meta || {};
  const hot_day = day;
  const hot_purchased = prev.hot_day === day ? !!prev.hot_purchased : false;
  const hot_yanked = prev.hot_day === day ? !!prev.hot_yanked : false;
  if (!prev.window_idx || prev.window_idx !== win.idx) {
    return {
      window_idx: win.idx,
      gear_refresh: 0,
      cons_refresh: 0,
      purchased: {},
      yanked: {},
      hot_day,
      hot_purchased,
      hot_yanked,
    };
  }
  return {
    window_idx: win.idx,
    gear_refresh: Math.max(0, Math.floor(prev.gear_refresh || 0)),
    cons_refresh: Math.max(0, Math.floor(prev.cons_refresh || 0)),
    purchased: prev.purchased && typeof prev.purchased === "object" ? { ...prev.purchased } : {},
    yanked: prev.yanked && typeof prev.yanked === "object" ? { ...prev.yanked } : {},
    hot_day,
    hot_purchased,
    hot_yanked,
    gear_stock: prev.gear_stock,
    cons_stock: prev.cons_stock,
    hot_deal: prev.hot_deal,
  };
}

export function shopGearSeed(meta, win = getShopWindow()) {
  return (win?.idx || 0) + (meta?.gear_refresh || 0);
}

export function shopConsSeed(meta, win = getShopWindow()) {
  return (win?.idx || 0) + (meta?.cons_refresh || 0);
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

/** Minimal shop gear stock (MVP) — 6 slots, cost = stardustValue * 1.2. */
export function generateSimpleGearSlot(playerLevel, randomItemFn, slotId, rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  const type = SHOP_GEAR_TYPES[Math.floor(r() * SHOP_GEAR_TYPES.length)];
  const roll = r();
  const rarity = clampRarityByLevel(
    roll < 0.4 ? "common" : roll < 0.7 ? "uncommon" : roll < 0.88 ? "rare" : roll < 0.97 ? "epic" : "legendary",
    playerLevel
  );
  const item = randomItemFn(rarity, Math.max(1, playerLevel), type);
  const cost = Math.max(5 * XP_STARDUST_SCALE, Math.round(computeStardustValue(item) * 1.2));
  const nova_cost = computeNovaCrystalCost(item);
  return {
    ...item,
    _slotId: slotId,
    cost,
    nova_cost,
  };
}

export function generateSimpleGearStock(seed, playerLevel, randomItemFn) {
  const rng = mulberry32(seed * 7919 + 13);
  const slots = [];
  for (let i = 0; i < 6; i++) {
    slots.push(generateSimpleGearSlot(playerLevel, randomItemFn, `${seed}-${i}`, rng));
  }
  return slots;
}

const CONSUMABLE_TIERS = {
  common:    { mult: 0.05, duration_hours: 2,  label: "Minor",    rarity: "common",    cost: 400,  sell_value: 150 },
  uncommon:  { mult: 0.10, duration_hours: 6,  label: "Standard", rarity: "uncommon", cost: 800,  sell_value: 250 },
  rare:      { mult: 0.15, duration_hours: 10, label: "Major",    rarity: "rare",     cost: 2200, sell_value: 600 },
  epic:      { mult: 0.20, duration_hours: 15, label: "Prime",    rarity: "epic",     cost: 5000, sell_value: 1200 },
  legendary: { mult: 0.20, duration_hours: 24, label: "Mythic",  rarity: "legendary", cost: 12000, sell_value: 3000, allStats: true },
};

const CONSUMABLE_STATS = ["strength", "agility", "intellect", "vitality", "luck"];

export const CONSUMABLES = Object.entries(CONSUMABLE_TIERS).flatMap(([tierKey, tier]) => {
  if (tier.allStats) {
    return [{
      name: `${tier.label} Omni-Stim`,
      type: "consumable",
      rarity: tier.rarity,
      level_requirement: 1,
      stats: {},
      consumable: { stat: "all", mult: tier.mult, duration_hours: tier.duration_hours, tier: tierKey },
      sell_value: tier.sell_value,
      flavor_text: `Boosts ALL stats by ${Math.round(tier.mult * 100)}% for ${tier.duration_hours} hours.`,
      is_equipped: false,
      _cost: tier.cost,
    }];
  }
  return CONSUMABLE_STATS.map((stat) => ({
    name: `${tier.label} ${stat.charAt(0).toUpperCase() + stat.slice(1)} Stim`,
    type: "consumable",
    rarity: tier.rarity,
    level_requirement: 1,
    stats: {},
    consumable: { stat, mult: tier.mult, duration_hours: tier.duration_hours, tier: tierKey },
    sell_value: tier.sell_value,
    flavor_text: `Boosts ${stat} by ${Math.round(tier.mult * 100)}% for ${tier.duration_hours} hours.`,
    is_equipped: false,
    _cost: tier.cost,
  }));
});

export function randomConsumable(rng = Math.random) {
  const roll = typeof rng === "function" ? rng() : Math.random();
  if (roll < 0.01) {
    const legendary = CONSUMABLES.filter((c) => c.rarity === "legendary");
    return legendary[Math.floor((typeof rng === "function" ? rng() : Math.random()) * legendary.length)];
  }
  const pool = CONSUMABLES.filter((c) => c.rarity !== "legendary");
  return pool[Math.floor((typeof rng === "function" ? rng() : Math.random()) * pool.length)];
}

export function generateSimpleConsStock(seed) {
  const rng = mulberry32(seed * 4099 + 7);
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const def = randomConsumable(rng);
    slots.push({
      ...def,
      _slotId: `cons-${seed}-${i}`,
      _cost: def._cost ?? def.sell_value ?? (25 * XP_STARDUST_SCALE),
    });
  }
  return slots;
}

export function generateSimpleHotDeal(dayKey, playerLevel, randomItemFn) {
  const dayNum = String(dayKey || todayET()).split("-").reduce((a, p) => a + Number(p || 0), 0);
  const rng = mulberry32(dayNum * 104729 + 77);
  const type = SHOP_GEAR_TYPES[Math.floor(rng() * SHOP_GEAR_TYPES.length)];
  const roll = rng();
  const rarity = clampRarityByLevel(
    roll < 0.15 ? "uncommon" : roll < 0.45 ? "rare" : roll < 0.78 ? "epic" : "legendary",
    playerLevel
  );
  const item = randomItemFn(rarity, Math.max(1, playerLevel), type);
  const cost = Math.max(5 * XP_STARDUST_SCALE, Math.round(computeStardustValue(item) * 1.05));
  const nova_cost = computeNovaCrystalCost(item);
  return { ...item, _slotId: `hot-${dayKey}`, _hotDeal: true, cost, nova_cost };
}

// ── Consumable buffs ─────────────────────────────────────────
export const MAX_BUFF_STACKS = 3;
export const MAX_ACTIVE_STAT_TYPES = 3;

export function prepareConsumableBuffs(character, item, sourceBuffs) {
  if (!character || item?.type !== "consumable" || !item.consumable) {
    return { ok: false, reason: "Not a stim." };
  }
  const now = Date.now();
  const durationMs = (item.consumable.duration_hours || 6) * 3600 * 1000;
  const maxExpiry = now + durationMs * MAX_BUFF_STACKS;
  const source = sourceBuffs ?? character.active_buffs ?? [];
  const active = source.filter((b) => new Date(b.expires_at).getTime() > now);
  const sameStatIdx = active.findIndex((b) => b.stat === item.consumable.stat);
  if (sameStatIdx < 0 && new Set(active.map((b) => b.stat)).size >= MAX_ACTIVE_STAT_TYPES) {
    return { ok: false, reason: `You already have ${MAX_ACTIVE_STAT_TYPES} active stat boosts. Wait for one to expire.` };
  }
  if (sameStatIdx >= 0 && active[sameStatIdx].name === item.name) {
    const existingExpiry = new Date(active[sameStatIdx].expires_at).getTime();
    if (existingExpiry - now >= durationMs * MAX_BUFF_STACKS) {
      return { ok: false, reason: `${item.name} is already at max stacks (${MAX_BUFF_STACKS}×).` };
    }
  }
  if (sameStatIdx >= 0 && (item.consumable.mult || 0) < (active[sameStatIdx].mult || 0)) {
    return { ok: false, reason: `A stronger ${item.consumable.stat} stim is already active.` };
  }
  let buffs;
  if (sameStatIdx >= 0) {
    const existing = active[sameStatIdx];
    buffs = [...active];
    if (existing.name === item.name) {
      const newExpiry = Math.min(new Date(existing.expires_at).getTime() + durationMs, maxExpiry);
      buffs[sameStatIdx] = { ...existing, expires_at: new Date(newExpiry).toISOString() };
    } else {
      buffs[sameStatIdx] = {
        stat: item.consumable.stat,
        mult: item.consumable.mult,
        expires_at: new Date(now + durationMs).toISOString(),
        name: item.name,
      };
    }
  } else {
    buffs = [
      ...active,
      {
        stat: item.consumable.stat,
        mult: item.consumable.mult,
        expires_at: new Date(now + durationMs).toISOString(),
        name: item.name,
      },
    ];
  }
  return { ok: true, buffs };
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

/** Apply XP and level-ups onto a character patch (mutates patch in place). */
export function applyXpToCharacter(ch, xpGain, patch = {}) {
  let newExp = (patch.experience ?? ch.experience ?? 0) + (xpGain || 0);
  let newLevel = patch.level ?? ch.level ?? 1;
  let expToNext = patch.experience_to_next_level ?? ch.experience_to_next_level ?? expForLevel(newLevel);
  const prevLevel = newLevel;
  while (newExp >= expToNext) {
    newExp -= expToNext;
    newLevel++;
    expToNext = expForLevel(newLevel);
  }
  const statPoints = getStatPointsForLevelRange(prevLevel, newLevel);
  patch.experience = newExp;
  patch.level = newLevel;
  patch.experience_to_next_level = expToNext;
  if (statPoints > 0) {
    patch.unspent_stat_points = (patch.unspent_stat_points ?? ch.unspent_stat_points ?? 0) + statPoints;
  }
  return patch;
}

export { getMissionXpPerFuel, getMissionStardustPerFuel, expForLevel };

// ── Arena ────────────────────────────────────────────────────
export const ARENA_DAILY_FREE_BATTLES = 10;
export const ARENA_PAID_BATTLE_COST = 5;
export const ARENA_REFRESH_COST = 50 * XP_STARDUST_SCALE;
export const ARENA_SKIP_COST = 1;
export const ARENA_ELO_K = 28;
export const ARENA_RATING_DELTA_MIN = 6;
export const ARENA_RATING_DELTA_MAX = 36;

export function getArenaStardustReward(level = 1) {
  return Math.round(getMissionStardustPerFuel(level) * 5 / 3);
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

export function computeArenaRewards(player, opp, won, free = true) {
  const ratingDelta = eloRatingDelta(player.arena_rating || 1000, opp?.arena_rating || 1000, won);
  const loot = (free && won)
    ? { experience: getArenaXpReward(player.level || 1), stardust: getArenaStardustReward(player.level || 1) }
    : { experience: 0, stardust: 0 };
  return {
    won,
    free,
    experience: loot.experience,
    stardust: loot.stardust,
    arena_rating_delta: ratingDelta,
  };
}

// ── Dungeon ──────────────────────────────────────────────────
export const DUNGEON_ENEMIES_PER_PLANET = 10;
export const DUNGEON_DEATHS_PER_DAY = 3;
export const DUNGEON_CONTINUE_COST = 5;
export const DUNGEON_SKIP_COST = 10;
export const DUNGEON_WIN_COOLDOWN_MS = 10 * 60 * 1000;
export const DUNGEON_LOSS_COOLDOWN_MS = 25 * 60 * 1000;
export const DUNGEON_PATROL_REWARD_MULT = 0.4;
export const DUNGEON_XP_DRU_MULT = 0.87;
export const DUNGEON_MILESTONE_EVERY = 5;
export const DUNGEON_STORY_PLANETS = 10;

export const DUNGEON_TOTAL_DRU = [0, 60, 70, 80, 90, 100, 110, 120, 135, 150, 175];
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
const D10_LEVEL_OFFSETS = [0, 3, 7, 10, 13, 17, 20, 23, 27, 30];

/** Minimal planet ship-mod grant table (id → flavor + SHIP_MODS cat). */
export const DUNGEON_PLANET_SHIP_MODS = {
  1: { shipMod: "Plasma Drive", shipModCat: "fuel_efficiency" },
  2: { shipMod: "Warp Coil", shipModCat: "warp_drive" },
  3: { shipMod: "Phase Shift", shipModCat: "fuel_tank" },
  4: { shipMod: "Singularity Engine", shipModCat: "warp_drive" },
  5: { shipMod: "Void Sail", shipModCat: "stardust_magnet" },
  6: { shipMod: "Cryo Thruster", shipModCat: "fuel_tank" },
  7: { shipMod: "Solar Booster", shipModCat: "fuel_efficiency" },
  8: { shipMod: "Quantum Anchor", shipModCat: "neural_accel" },
  9: { shipMod: "Aether Wing", shipModCat: "cargo_hold" },
  10: { shipMod: "Genesis Core", shipModCat: "neural_accel" },
};

export function getDungeonBand(planetId) {
  return Math.max(1, Math.floor(planetId || 1));
}

export function getDungeonTotalDru(planetId) {
  const band = getDungeonBand(planetId);
  if (band <= 10) return DUNGEON_TOTAL_DRU[band];
  const depth = band - 10;
  return Math.round(175 + depth * 25);
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
    stardust: Math.max(units > 0 ? 1 : 0, Math.round(units * getMissionStardustPerFuel(lvl))),
    experience: Math.max(units > 0 ? 1 : 0, Math.round(units * getMissionXpPerFuel(lvl) * DUNGEON_XP_DRU_MULT)),
  };
}

export function dungeonCooldownMs(won) {
  return won ? DUNGEON_WIN_COOLDOWN_MS : DUNGEON_LOSS_COOLDOWN_MS;
}

export function computeMiningReward(level, hours) {
  return Math.round((level || 1) * 12 * hours) * XP_STARDUST_SCALE;
}

export function grantFrontierShipMod(character, planetId) {
  const meta = DUNGEON_PLANET_SHIP_MODS[planetId] || null;
  const catKey = meta?.shipModCat;
  const flavor = meta?.shipMod;
  const cat = catKey ? SHIP_MODS[catKey] : null;
  const flavorMods = [...(character.ship_mods || [])];
  if (flavor && !flavorMods.includes(flavor)) flavorMods.push(flavor);

  if (!cat) {
    return { ship_mods: flavorMods, ship_mod_loadouts: null, unlockedLabel: flavor || null, maxed: true };
  }

  const shipId = getActiveShipId(character);
  const loadouts = { ...(character.ship_mod_loadouts || {}) };
  const installed = [...(Array.isArray(loadouts[shipId]) ? loadouts[shipId] : getShipModIds(character, shipId))];
  const knownIds = new Set(Object.values(SHIP_MODS).flatMap((c) => c.tiers.map((t) => t.id)));
  const cleaned = installed.filter((id) => knownIds.has(id));
  const next = cat.tiers.find((t) => !cleaned.includes(t.id));

  if (!next) {
    return {
      ship_mods: flavorMods,
      ship_mod_loadouts: null,
      unlockedLabel: flavor ? `${flavor} (catalogued)` : null,
      maxed: true,
      consolationStardust: (400 + (planetId || 1) * 80) * XP_STARDUST_SCALE,
    };
  }

  cleaned.push(next.id);
  loadouts[shipId] = cleaned;
  return {
    ship_mods: flavorMods,
    ship_mod_loadouts: loadouts,
    unlockedLabel: `${flavor || cat.name} — ${cat.name} T${cat.tiers.indexOf(next) + 1}`,
    maxed: false,
  };
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

// ── Casino ───────────────────────────────────────────────────
export const NOVA_CASINO_OPEN = false;
export const CASINO_MAX_NOVA_BET = 100;
/** Max stardust bet ≈ 25× mission SD/F (floored at 100, capped). */
export const CASINO_STARDUST_BET_SD_MULT = 25;
export const CASINO_MAX_STARDUST_BET_CAP = 250_000 * XP_STARDUST_SCALE;
export const CASINO_MIN_STARDUST_BET_FLOOR = 100 * XP_STARDUST_SCALE;

export function getCasinoMaxStardustBet(level = 1) {
  const sdf = getMissionStardustPerFuel(level);
  return Math.min(
    CASINO_MAX_STARDUST_BET_CAP,
    Math.max(CASINO_MIN_STARDUST_BET_FLOOR, sdf * CASINO_STARDUST_BET_SD_MULT),
  );
}

/** @deprecated Prefer getCasinoMaxStardustBet(level) — kept as L1 floor reference. */
export const CASINO_MAX_STARDUST_BET = CASINO_MIN_STARDUST_BET_FLOOR;

export const CASINO_WHEEL_TIERS = [
  { p: 0.50, mult: 0, label: "Bust" },
  { p: 0.22, mult: 1, label: "Push" },
  { p: 0.15, mult: 2, label: "2×" },
  { p: 0.08, mult: 3, label: "3×" },
  { p: 0.04, mult: 5, label: "5×" },
  { p: 0.008, mult: 10, label: "10×" },
  { p: 0.002, mult: 25, label: "25×" },
];

export const GUILD_CREATE_COST = 500 * XP_STARDUST_SCALE;
export const GUILD_WAR_DECLARE_COST = 500 * XP_STARDUST_SCALE;
export const GUILD_WAR_READY_HOURS = 24;
export const CHARACTER_SLOT_COST = 500;
export const CHARACTER_MAX_SLOTS = 3;
