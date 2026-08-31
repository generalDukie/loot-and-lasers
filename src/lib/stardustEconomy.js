/**
 * Authoritative Stardust economy — StardustPerFuel, attribute costs, vendor values,
 * mission/arena/mining/dungeon currency rules.
 *
 * XP, fuel costs, combat, and gear STAT budgets are intentionally out of scope.
 */
import { attributePurchaseCost, miningStardustResolved, MINUTES_PER_HOUR as PRODUCTION_MINUTES_PER_HOUR, stimSellValueResolved, stimEconomicLevel, resolveStimRarity } from "./productionMath/index.js";

// ── Constants ────────────────────────────────────────────────
export const MISSION_GEAR_BASE_CHANCE = 0.2;
export const MISSION_GEAR_PITY_INCREMENT = 0.025;
/** Soft upper bound so pity never exceeds a guaranteed drop. Spec has no 50% cap. */
export const MISSION_GEAR_DROP_CAP = 1;
/** After gear fails: chance to roll a Stim (exclusive chain). */
export const MISSION_STIM_CHANCE_AFTER_GEAR_FAIL = 0.25;
/** After gear and stim both fail: chance to roll Junk. */
export const MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL = 0.75;
/** @deprecated use MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL */
export const MISSION_JUNK_CHANCE_ON_GEAR_FAIL = MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL;
export const JUNK_AVG_MISSION_REWARD_RATIO = 0.45;
/** Prompt 11 alias */
export const JUNK_MISSION_REWARD_MULTIPLIER = JUNK_AVG_MISSION_REWARD_RATIO;
/** Uniform multiplier range around base junk value (mean multiplier = 1.0). */
export const JUNK_VALUE_MULT_MIN = 0.6;
export const JUNK_VALUE_MULT_MAX = 1.4;
export const JUNK_VARIANCE_MIN = JUNK_VALUE_MULT_MIN;
export const JUNK_VARIANCE_MAX = JUNK_VALUE_MULT_MAX;

export const GEAR_BASE_FUEL_EQUIVALENT = 2.0;
export const RARITY_SALE_MULT = Object.freeze({
  common: 0.7,
  uncommon: 0.85,
  rare: 1.0,
  epic: 1.2,
  legendary: 1.75,
});
export const WEAPON_VENDOR_MULT = 1.2;
export const SHIP_MODULE_VENDOR_MULT = 1.2;

/** Mission gear rarity weights (percent). */
export const MISSION_GEAR_RARITY_WEIGHTS = Object.freeze({
  common: 50,
  uncommon: 25,
  rare: 15,
  epic: 8,
  legendary: 2,
});

/** Regular dungeon enemy rarity (no Common). */
export const DUNGEON_REGULAR_RARITY_WEIGHTS = Object.freeze({
  uncommon: 40,
  rare: 30,
  epic: 20,
  legendary: 10,
});

/** Dungeon boss rarity. */
export const DUNGEON_BOSS_RARITY_WEIGHTS = Object.freeze({
  epic: 70,
  legendary: 30,
});

export const ARENA_REWARDED_WINS_PER_DAY = 10;
export const ARENA_WIN_FUEL_EQUIVALENT = 2.25;
export const ARENA_WIN_STARDUST_MULTIPLIER = ARENA_WIN_FUEL_EQUIVALENT;
export const MINING_EFFICIENCY = 0.03;

const MINUTES_PER_HOUR = 60;
const STARDUST_PER_FUEL_BASE = 50;
const STARDUST_GROWTH_COEFFICIENT = 1.009;
const STARDUST_GROWTH_EXPONENT = 1.625;
const STARDUST_HIGH_LEVEL_REFERENCE = 166.66;
const STARDUST_HIGH_LEVEL_EXPONENT = 3.055;
const LEGACY_LEVEL_INPUT_MAX = 500;
const DROP_CHANCE_PRECISION_SCALE = 10_000;

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

/** @deprecated Historical PCHIP waypoints — not production authority (Restoration 11). */
export const STARDUST_PER_FUEL_ANCHORS = Object.freeze([
  [1, 50],
  [10, 80],
  [25, 250],
  [50, 600],
  [75, 1200],
  [100, 2250],
  [150, 6000],
  [200, 15000],
  [250, 35000],
  [300, 75000],
]);

/** @deprecated Historical PCHIP waypoints — live attrcost is productionMath Horner. */
export const ATTRIBUTE_PURCHASE_COST_ANCHORS = Object.freeze([
  [1, 100],
  [10, 150],
  [20, 250],
  [30, 400],
  [40, 650],
  [50, 1000],
  [75, 2250],
  [100, 5000],
  [150, 15000],
  [200, 40000],
  [300, 200000],
  [400, 750000],
  [500, 2250000],
  [600, 6000000],
  [650, 10000000],
]);

// ── Log-space monotone cubic PCHIP (AttributePurchaseCost only) ─

/**
 * Fritsch–Carlson monotone cubic Hermite derivatives for y values.
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {number[]}
 */
function pchipSlopes(xs, ys) {
  const n = xs.length;
  const d = new Array(n).fill(0);
  const delta = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    delta[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  }
  d[0] = delta[0];
  d[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] === 0 || delta[i] === 0 || Math.sign(delta[i - 1]) !== Math.sign(delta[i])) {
      d[i] = 0;
    } else {
      const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]);
      const w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1]);
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }
  return d;
}

function hermite(x, x0, x1, y0, y1, d0, d1) {
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * y0 + h10 * h * d0 + h01 * y1 + h11 * h * d1;
}

/**
 * Evaluate log-space PCHIP over positive anchors; exact at anchors;
 * power-law extrapolation past the last two anchors.
 * @param {ReadonlyArray<[number, number]>} anchors
 * @param {number} x
 * @returns {number} rounded integer
 */
export function logPchipAnchors(anchors, x) {
  const pts = anchors.map(([a, b]) => [Number(a), Number(b)]);
  if (!pts.length) return 0;
  const X = Math.max(pts[0][0], Number(x) || pts[0][0]);

  for (const [ax, ay] of pts) {
    if (X === ax) return Math.round(ay);
  }

  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2] || last;
  if (X > last[0]) {
    const ratio = last[1] / prev[1];
    const exp = (X - last[0]) / (last[0] - prev[0]);
    return Math.max(1, Math.round(last[1] * ratio ** exp));
  }

  if (X < pts[0][0]) return Math.round(pts[0][1]);

  const xs = pts.map((p) => p[0]);
  const lny = pts.map((p) => Math.log(p[1]));
  const d = pchipSlopes(xs, lny);

  let i = 0;
  while (i < xs.length - 2 && X > xs[i + 1]) i += 1;

  const yLog = hermite(X, xs[i], xs[i + 1], lny[i], lny[i + 1], d[i], d[i + 1]);
  return Math.max(1, Math.round(Math.exp(yLog)));
}

/** @deprecated alias — prefer StardustPerFuel */
export function getMissionStardustPerFuel(level = 1) {
  return StardustPerFuel(level);
}

/**
 * Infinite Stardust-per-Fuel (Restoration 11) — no waypoint table / PCHIP.
 * StardustPerFuel(L) = ROUND(50 + 1.009 × (L-1)^1.625 × (1 + (L/166.66)^3.055))
 */
export function StardustPerFuel(level = 1) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  if (L <= 1) return STARDUST_PER_FUEL_BASE;
  const growth =
    STARDUST_GROWTH_COEFFICIENT
    * (L - 1) ** STARDUST_GROWTH_EXPONENT
    * (1 + (L / STARDUST_HIGH_LEVEL_REFERENCE) ** STARDUST_HIGH_LEVEL_EXPONENT);
  return Math.max(1, Math.round(STARDUST_PER_FUEL_BASE + growth));
}

export function AttributePurchaseCost(purchaseNumber = 1) {
  return attributePurchaseCost(purchaseNumber);
}

export function MissionStardustReward(level, fuelCost) {
  const fuel = Math.max(0, Number(fuelCost) || 0);
  if (fuel <= 0) return 0;
  return Math.round(StardustPerFuel(level) * fuel);
}

export function ArenaWinStardust(level = 1) {
  return Math.round(ARENA_WIN_FUEL_EQUIVALENT * StardustPerFuel(level));
}

export function MiningStardust(level, minutes) {
  return miningStardustResolved({ snapshotLevel: level, minutes });
}

/** Mining hours helper — snapshots use hours at session start. */
export function computeMiningReward(level, hours) {
  return MiningStardust(level, (Number(hours) || 0) * PRODUCTION_MINUTES_PER_HOUR);
}

/**
 * Snapshot junk vendor value for a mission drop (Restoration 11).
 * BaseJunkValue = MissionStardustReward × 0.45
 * JunkValue = ROUND(BaseJunkValue × Uniform(0.60, 1.40))
 * Pass rng at drop time so the value is fixed on the item.
 * @param {number} missionStardustReward
 * @param {() => number} [rng] — returns [0,1); defaults to Math.random
 */
export function JunkSaleValue(missionStardustReward, rng = Math.random) {
  const base = Math.max(0, Number(missionStardustReward) || 0);
  const baseJunk = base * JUNK_AVG_MISSION_REWARD_RATIO;
  const roll = typeof rng === "function" ? rng() : Math.random();
  const u = Math.min(1, Math.max(0, Number(roll) || 0));
  const mult = JUNK_VALUE_MULT_MIN + u * (JUNK_VALUE_MULT_MAX - JUNK_VALUE_MULT_MIN);
  return Math.max(1, Math.round(baseJunk * mult));
}

/** @deprecated name — use JunkSaleValue(missionReward, rng) */
export function computeMissionJunkSellValue(missionStardustOrLevel, maybeFuelOrRng, maybeRng) {
  let reward;
  let rng = Math.random;
  if (typeof maybeFuelOrRng === "function") {
    reward = Number(missionStardustOrLevel);
    rng = maybeFuelOrRng;
  } else if (maybeFuelOrRng != null && typeof maybeFuelOrRng !== "function") {
    reward = MissionStardustReward(missionStardustOrLevel, maybeFuelOrRng);
    if (typeof maybeRng === "function") rng = maybeRng;
  } else {
    const n = Number(missionStardustOrLevel);
    if (Number.isFinite(n) && n > 0 && n === Math.floor(n) && n <= LEGACY_LEVEL_INPUT_MAX) {
      reward = MissionStardustReward(n, 1);
    } else {
      reward = n;
    }
  }
  return JunkSaleValue(reward, rng);
}

export function itemTypeVendorMult(type) {
  if (type === "weapon") return WEAPON_VENDOR_MULT;
  if (type === "ship_module") return SHIP_MODULE_VENDOR_MULT;
  return 1;
}

export function GearSaleValue(item) {
  if (!item) return 1;
  if (item.type === "consumable") {
    return stimSellValueResolved(stimEconomicLevel(item), resolveStimRarity(item));
  }
  if (item.type === "material") {
    const flat = item.sell_value;
    if (typeof flat === "number" && flat > 0) return Math.max(1, Math.round(flat));
    return 1;
  }
  const itemLevel = Math.max(1, Math.floor(Number(item.level_requirement ?? item.level) || 1));
  const rarityMult = RARITY_SALE_MULT[item.rarity] ?? 1;
  const typeMult = itemTypeVendorMult(item.type);
  return Math.max(
    1,
    Math.round(StardustPerFuel(itemLevel) * GEAR_BASE_FUEL_EQUIVALENT * rarityMult * typeMult)
  );
}

export function missionGearDropChance(missStreak = 0) {
  const streak = Math.max(0, Math.floor(Number(missStreak) || 0));
  const raw = MISSION_GEAR_BASE_CHANCE + streak * MISSION_GEAR_PITY_INCREMENT;
  return Math.min(
    MISSION_GEAR_DROP_CAP,
    Math.round(raw * DROP_CHANCE_PRECISION_SCALE) / DROP_CHANCE_PRECISION_SCALE,
  );
}

export function rollMissionGearDrop(missStreak = 0, rng = Math.random) {
  return rng() < missionGearDropChance(missStreak);
}

function rollFromWeights(weights, rng = Math.random) {
  const entries = RARITY_ORDER.filter((r) => (weights[r] || 0) > 0).map((r) => [r, weights[r]]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [rarity, w] of entries) {
    roll -= w;
    if (roll < 0) return rarity;
  }
  return entries[entries.length - 1]?.[0] || "common";
}

export function rollMissionGearRarity(rng = Math.random) {
  return rollFromWeights(MISSION_GEAR_RARITY_WEIGHTS, rng);
}

export function rollDungeonRegularRarity(rng = Math.random) {
  return rollFromWeights(DUNGEON_REGULAR_RARITY_WEIGHTS, rng);
}

export function rollDungeonBossRarity(rng = Math.random) {
  return rollFromWeights(DUNGEON_BOSS_RARITY_WEIGHTS, rng);
}

export function getArenaRewardedWinsState(character, today) {
  const date = character?.arena_rewarded_wins_date;
  if (date !== today) {
    return { wins: 0, date: today };
  }
  return {
    wins: Math.max(0, Math.floor(Number(character?.arena_rewarded_wins_today) || 0)),
    date: today,
  };
}

export function arenaWinGrantsStardust(rewardedWinsToday) {
  return Math.max(0, Math.floor(Number(rewardedWinsToday) || 0)) < ARENA_REWARDED_WINS_PER_DAY;
}
