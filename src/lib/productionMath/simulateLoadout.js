/**
 * Admin expected-loadout plan. Pure math — persistence lives in server admin ops.
 */
import {
  ATTR_INDEX,
  BASIS_POINTS_DENOMINATOR,
  GEAR_SLOTS,
  GEAR_STAT_POOL_IDS,
  GEAR_STAT_POOL_PARTIAL_B,
  GEAR_STAT_POOL_PARTIAL_B_BLOCKED_RARITIES,
  MILLISECONDS_PER_HOUR,
  PLAYER_FREE_ATTR_WEIGHTS,
  RARITIES,
  SIMULATE_ATTR_KEYS,
  SIMULATE_GEAR_RARITY,
  SIMULATE_GEAR_STAT_POOL_DEFAULT,
  SIMULATE_NOVA_GRANT,
  SIMULATE_PURCHASE_EPA_SHARE_BPS,
  SIMULATE_PURCHASE_RAMP_COMPLETE_LEVEL,
  SIMULATE_STARDUST_DAY_COUNT,
  SIMULATE_STIM_LUCK_KEY,
  SIMULATE_STIM_VITALITY_KEY,
  STIM_MAX_ACTIVE_EFFECTS,
  STIM_RARE_LEVEL_MAX,
  STIM_TIERS,
  STIM_UNCOMMON_LEVEL_MAX,
} from "./constants.js";
import { roundHalfUp } from "./rounding.js";
import { averageMissionFuel, employmentLoad } from "./progression.js";
import { stardustPerFuel } from "./economy.js";
import { marketStimTier } from "./market.js";
import {
  allocateByWeights,
  classPrimaryIndex,
  expectedPlayerAttributes,
  startingAttributesForClass,
  freeLevelAttributes,
} from "./attributes.js";

function levelInt(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

function purchaseWeightVector(primaryIndex) {
  const w = [
    PLAYER_FREE_ATTR_WEIGHTS.off1,
    PLAYER_FREE_ATTR_WEIGHTS.off1,
    PLAYER_FREE_ATTR_WEIGHTS.off1,
    PLAYER_FREE_ATTR_WEIGHTS.vitality,
    PLAYER_FREE_ATTR_WEIGHTS.luck,
  ];
  const offs = [ATTR_INDEX.str, ATTR_INDEX.agi, ATTR_INDEX.int].filter(
    (i) => i !== primaryIndex,
  );
  w[primaryIndex] = PLAYER_FREE_ATTR_WEIGHTS.primary;
  w[offs[0]] = PLAYER_FREE_ATTR_WEIGHTS.off1;
  w[offs[1]] = PLAYER_FREE_ATTR_WEIGHTS.off2;
  return w;
}

function titleCase(value) {
  const s = String(value || "");
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SIMULATE_SLOT_VALIDATION_HTTP_STATUS = 400;

function simulateSlotValidationError(message) {
  const err = new Error(message);
  err.status = SIMULATE_SLOT_VALIDATION_HTTP_STATUS;
  err.code = "VALIDATION_ERROR";
  throw err;
}

export function normalizeSimulateStatPool(value) {
  if (value == null || value === "") return SIMULATE_GEAR_STAT_POOL_DEFAULT;
  const pool = String(value).trim().toLowerCase();
  if (!GEAR_STAT_POOL_IDS.includes(pool)) {
    simulateSlotValidationError(`invalid gear stat pool: ${pool}`);
  }
  return pool;
}

export function normalizeSimulateRarity(value) {
  const rarity = String(value == null || value === "" ? SIMULATE_GEAR_RARITY : value)
    .trim()
    .toLowerCase();
  if (!RARITIES.includes(rarity)) {
    simulateSlotValidationError(`invalid gear rarity: ${rarity}`);
  }
  return rarity;
}

export function defaultSimulateGearSlots() {
  return Object.fromEntries(
    GEAR_SLOTS.map((slot) => [
      slot,
      { rarity: SIMULATE_GEAR_RARITY, pool: SIMULATE_GEAR_STAT_POOL_DEFAULT },
    ]),
  );
}

/** Per-slot rarity + pool for admin simulate. Missing slots use Rare + Normal. */
export function resolveSimulateGearSlots(slotsInput) {
  const defaults = defaultSimulateGearSlots();
  if (slotsInput == null) return defaults;
  if (typeof slotsInput !== "object" || Array.isArray(slotsInput)) {
    simulateSlotValidationError("slots must be an object keyed by gear slot");
  }
  for (const key of Object.keys(slotsInput)) {
    if (!GEAR_SLOTS.includes(key)) {
      simulateSlotValidationError(`unknown gear slot: ${key}`);
    }
  }
  const out = {};
  for (const slot of GEAR_SLOTS) {
    const spec = slotsInput[slot] ?? defaults[slot];
    if (spec == null || typeof spec !== "object" || Array.isArray(spec)) {
      simulateSlotValidationError(`slots.${slot} must be an object`);
    }
    const rarity = normalizeSimulateRarity(
      spec.rarity == null || spec.rarity === "" ? SIMULATE_GEAR_RARITY : spec.rarity,
    );
    const pool = normalizeSimulateStatPool(
      spec.pool == null || spec.pool === "" ? SIMULATE_GEAR_STAT_POOL_DEFAULT : spec.pool,
    );
    if (
      pool === GEAR_STAT_POOL_PARTIAL_B
      && GEAR_STAT_POOL_PARTIAL_B_BLOCKED_RARITIES.includes(rarity)
    ) {
      simulateSlotValidationError(`partial_b is not allowed for ${rarity} gear`);
    }
    out[slot] = { rarity, pool };
  }
  return out;
}

/** 0 at L1, BASIS_POINTS_DENOMINATOR at/after SIMULATE_PURCHASE_RAMP_COMPLETE_LEVEL. */
export function simulatePurchaseRampBps(level) {
  const L = levelInt(level);
  if (L <= 1) return 0;
  const span = SIMULATE_PURCHASE_RAMP_COMPLETE_LEVEL - 1;
  if (L >= SIMULATE_PURCHASE_RAMP_COMPLETE_LEVEL) return BASIS_POINTS_DENOMINATOR;
  return Math.round(((L - 1) * BASIS_POINTS_DENOMINATOR) / span);
}

export function simulatePurchaseTotal(level) {
  const epa = expectedPlayerAttributes(level);
  const rampBps = simulatePurchaseRampBps(level);
  return Math.max(
    0,
    Math.round(
      (epa * SIMULATE_PURCHASE_EPA_SHARE_BPS * rampBps)
      / (BASIS_POINTS_DENOMINATOR * BASIS_POINTS_DENOMINATOR),
    ),
  );
}

export function simulatePurchasesByStat(level, className) {
  const primary = classPrimaryIndex(className);
  const allocated = allocateByWeights(
    simulatePurchaseTotal(level),
    purchaseWeightVector(primary),
  );
  const out = {};
  for (let i = 0; i < SIMULATE_ATTR_KEYS.length; i += 1) {
    out[SIMULATE_ATTR_KEYS[i]] = allocated[i];
  }
  return out;
}

/** Expected mission Stardust for one day at this level (avg fuel × SPF × employment). */
export function expectedDailyMissionStardust(level) {
  return Math.max(
    0,
    roundHalfUp(
      averageMissionFuel(level) * stardustPerFuel(level) * employmentLoad(level),
    ),
  );
}

export function simulateStardustGrant(level) {
  return expectedDailyMissionStardust(level) * SIMULATE_STARDUST_DAY_COUNT;
}

export function simulateStimStats(className) {
  const primary = classPrimaryIndex(className);
  const primaryKey = SIMULATE_ATTR_KEYS[primary] || SIMULATE_ATTR_KEYS[0];
  const stats = [primaryKey, SIMULATE_STIM_VITALITY_KEY, SIMULATE_STIM_LUCK_KEY];
  return stats.slice(0, STIM_MAX_ACTIVE_EFFECTS);
}

export function simulateStimTier(level) {
  return marketStimTier(level);
}

export function buildSimulateStimBuffs({ className, level, nowMs = Date.now() } = {}) {
  const tier = simulateStimTier(level);
  const spec = STIM_TIERS[tier];
  const mult = spec.bonusBps / BASIS_POINTS_DENOMINATOR;
  const expiresAt = new Date(
    Number(nowMs) + spec.maxHours * MILLISECONDS_PER_HOUR,
  ).toISOString();
  return simulateStimStats(className).map((stat) => ({
    stat,
    mult,
    name: `${titleCase(tier)} ${titleCase(stat)} Stim`,
    rarity: tier,
    duration_hours: spec.baseHours,
    stacks: STIM_MAX_ACTIVE_EFFECTS,
    expires_at: expiresAt,
  }));
}

export function buildSimulateLoadoutPlan({ className, level, nowMs = Date.now() } = {}) {
  const L = levelInt(level);
  const purchasesByStat = simulatePurchasesByStat(L, className);
  const purchaseTotal = SIMULATE_ATTR_KEYS.reduce(
    (sum, key) => sum + purchasesByStat[key],
    0,
  );
  const start = startingAttributesForClass(className);
  const free = freeLevelAttributes(L, classPrimaryIndex(className));
  const startFree = {};
  for (let i = 0; i < SIMULATE_ATTR_KEYS.length; i += 1) {
    startFree[SIMULATE_ATTR_KEYS[i]] = start[i] + free[i];
  }
  return {
    level: L,
    className: className || "",
    epa: expectedPlayerAttributes(L),
    purchaseRampBps: simulatePurchaseRampBps(L),
    purchaseTotal,
    purchasesByStat,
    startFree,
    gearRarity: SIMULATE_GEAR_RARITY,
    gearSlots: [...GEAR_SLOTS],
    stimTier: simulateStimTier(L),
    stimBuffs: buildSimulateStimBuffs({ className, level: L, nowMs }),
    stardust: simulateStardustGrant(L),
    nova: SIMULATE_NOVA_GRANT,
    stimUncommonLevelMax: STIM_UNCOMMON_LEVEL_MAX,
    stimRareLevelMax: STIM_RARE_LEVEL_MAX,
  };
}
