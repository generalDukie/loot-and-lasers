/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 1 LIVE FOR CHARACTER PROGRESSION
 *
 * Discrete production constants and tables.
 */

export const MODULE_STATUS = "CERTIFIED FORMULA — PHASE 1 LIVE FOR PROGRESSION";

/**
 * XP is completely 1:1. Calculated = granted = stored = displayed.
 * This named constant is an identity sentinel (must stay 1). It is not a conversion.
 * Do not reintroduce a hidden ×10 / ÷10 XP layer.
 * The production XP denomination was increased by rewriting the authoritative
 * XP formulas and constants. This is NOT an XP scaling layer.
 */
export const CANONICAL_XP_UNIT = "design";
export const PRODUCTION_XP_STORAGE_SCALE = 1;
export const PRODUCTION_XP_STORAGE_POLICY = "identity";

/**
 * Production MissionXPPerFuel coefficients.
 * Denomination was raised by rewriting these coefficients — not by an XP ×10 scale.
 * mission_xpf(L) = BASE + LINEAR*(L-1) + POWER*(L^EXPONENT - 1)
 */
export const MISSION_XPF_BASE = 100;
export const MISSION_XPF_LINEAR_COEFFICIENT = 5;
export const MISSION_XPF_POWER_COEFFICIENT = 0.32;
export const MISSION_XPF_EXPONENT = 1.67;

/**
 * Certified employment-load(L) inside XPToNext.
 * 1.67985 + 0.239507*L^0.662355 + 18.3178*(L/500)^4
 */
export const EMPLOYMENT_LOAD_BASE = 1.67985;
export const EMPLOYMENT_LOAD_POWER_COEFFICIENT = 0.239507;
export const EMPLOYMENT_LOAD_POWER_EXPONENT = 0.662355;
export const EMPLOYMENT_LOAD_QUARTIC_COEFFICIENT = 18.3178;
export const EMPLOYMENT_LOAD_QUARTIC_REFERENCE_LEVEL = 500;
export const EMPLOYMENT_LOAD_QUARTIC_EXPONENT = 4;

/**
 * Certified StardustPerFuel.
 * ROUND(50 + 1.009*(L-1)^1.625 * (1 + (L/166.66)^3.055))
 */
export const STARDUST_PF_BASE = 50;
export const STARDUST_PF_GROWTH_COEFFICIENT = 1.009;
export const STARDUST_PF_GROWTH_EXPONENT = 1.625;
export const STARDUST_PF_HILL_REFERENCE_LEVEL = 166.66;
export const STARDUST_PF_HILL_EXPONENT = 3.055;

export const STRESS_LEVELS = Object.freeze([
  1, 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000, 2500,
]);

export const VARIANCE_MIN = 0.9;
export const VARIANCE_MAX = 1.1;
export const MARKET_PRICE_VARIANCE_MIN = 0.8;
export const MARKET_PRICE_VARIANCE_MAX = 1.2;

export const XP_MISSION_SHARE = 0.46;
export const DRU_REFERENCE_MISSION_SHARE = 0.6;
export const XP_REWARD_EFFICIENCY = 0.85;
/** Named Mission XP efficiency factor (locked 0.85). */
export const MISSION_XP_EFFICIENCY = XP_REWARD_EFFICIENCY;
/** Named Mission XP reward scalar (locked 0.85). Distinct from efficiency. */
export const MISSION_XP_REWARD_SCALAR = XP_REWARD_EFFICIENCY;
/** @deprecated Use XP_REWARD_EFFICIENCY. Same Mission XP efficiency factor. */
export const MISSION_XP_REBALANCE = XP_REWARD_EFFICIENCY;
export const DEFEAT_REWARD_FACTOR = 0.5;
export const PVE_XP_MULTIPLIER = 1.25;
export const DUNGEON_XP_SHARE_COEFFICIENT = 0.87;
export const DUNGEON_XP_DRU_COEFFICIENT = 2.1;
export const ARENA_XP_PER_XPF = 2.125;
export const ARENA_STARDUST_PER_SPF = 2.25;
export const MINING_STARDUST_PER_SPF_PER_MINUTE = 0.03;

export const FRONTIER_BONUS_PER_LEVEL = 0.05;
export const FRONTIER_BONUS_CAP = 0.5;

export const MISSION_ENEMY_EPA_FRACTION = 0.35;
export const MISSION_ENEMY_MIN_ATTRIBUTES = 5;
export const FREE_ATTRS_PER_LEVEL_AFTER_1 = 2;

export const PLAYER_FREE_ATTR_WEIGHTS = Object.freeze({
  primary: 0.35,
  vitality: 0.35,
  luck: 0.2,
  off1: 0.05,
  off2: 0.05,
});

export const ENEMY_ATTR_WEIGHTS = Object.freeze({
  primary: 0.35,
  vitality: 0.25,
  luck: 0.2,
  off1: 0.1,
  off2: 0.1,
});

export const STARTING_ATTRIBUTES = Object.freeze({
  Might: Object.freeze({ str: 15, agi: 8, int: 6, vit: 14, luck: 7 }),
  Reflex: Object.freeze({ str: 7, agi: 15, int: 7, vit: 11, luck: 10 }),
  Tech: Object.freeze({ str: 6, agi: 8, int: 15, vit: 13, luck: 8 }),
});

export const CLASS_ARCHETYPE = Object.freeze({
  Vanguard: "Might",
  "Astral Warden": "Might",
  "Shadow Operative": "Reflex",
  "Void Runner": "Reflex",
  Technomancer: "Tech",
  "Cosmic Engineer": "Tech",
});

export const CLASS_PRIMARY_INDEX = Object.freeze({
  Vanguard: 0,
  "Astral Warden": 0,
  "Shadow Operative": 1,
  "Void Runner": 1,
  Technomancer: 2,
  "Cosmic Engineer": 2,
});
export const ARCHETYPE_INDEX_MAX = 2;

export const ATTR_INDEX = Object.freeze({
  str: 0,
  agi: 1,
  int: 2,
  vit: 3,
  luck: 4,
});

export const GEAR_SLOTS = Object.freeze([
  "helmet",
  "armor",
  "legs",
  "boots",
  "neck",
  "accessory",
  "weapon",
  "ship_module",
]);

export const PREMIUM_GEAR_SLOTS = Object.freeze(["weapon", "ship_module"]);
export const GEAR_SLOT_PREMIUM_MULT = 1.2;
export const GEAR_SLOT_NORMAL_MULT = 1;
export const GEAR_SLOT_INDEX = Object.freeze(
  Object.fromEntries(GEAR_SLOTS.map((slot, index) => [slot, index])),
);
export const PREMIUM_GEAR_SLOT_INDICES = Object.freeze(
  PREMIUM_GEAR_SLOTS.map((slot) => GEAR_SLOT_INDEX[slot]),
);

/** Rare normal-slot BaseGearStatBudget(L) = ROUND(LINEAR*L + CURVE*√L + FLOOR). */
export const GEAR_BUDGET_LINEAR = 1.4079;
export const GEAR_BUDGET_CURVE = 2.2988;
export const GEAR_BUDGET_FLOOR = 8.277;

/**
 * Hard production Backpack cap — 10 unequipped items of any type
 * (Gear, Stims, Junk, materials, and other backpack-held items).
 * Equipped Gear does not count. No cargo/entitlement expansion.
 */
export const BACKPACK_UNEQUIPPED_ITEM_CAP = 10;
/** @deprecated Use BACKPACK_UNEQUIPPED_ITEM_CAP. Cap is all unequipped items, not Gear-only. */
export const BACKPACK_UNEQUIPPED_GEAR_CAP = BACKPACK_UNEQUIPPED_ITEM_CAP;

/**
 * Production Gear origin keys. Company/manufacturer assignment is Phase 9.
 * Unknown/legacy items use `unassigned`.
 */
export const GEAR_ORIGINS = Object.freeze([
  "mission",
  "dungeon",
  "wormhole",
  "market",
  "contraband",
  "commission",
  "unassigned",
]);
export const GEAR_SLOT_ALIASES = Object.freeze({ ring: "accessory" });
export const SHIPMENT_INELIGIBLE_ORIGINS = Object.freeze(["market", "contraband"]);
export const SHIPMENT_ELIGIBLE_ORIGINS = Object.freeze([
  "mission",
  "dungeon",
  "wormhole",
  "commission",
]);

export const RARITIES = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"]);
export const GEAR_RARITY_BUDGET_MULT = Object.freeze({
  common: 0.7,
  uncommon: 0.85,
  rare: 1,
  epic: 1.2,
  legendary: 1.5,
});
export const GEAR_RARITY_BUDGET_MULT_BY_INDEX = Object.freeze(
  RARITIES.map((rarity) => GEAR_RARITY_BUDGET_MULT[rarity]),
);
export const GEAR_RARITY_BUDGET_MULT_DEFAULT = GEAR_RARITY_BUDGET_MULT.rare;
/** Intrinsic Gear total-stat-budget variance. Applied once at generation, then persisted. */
export const GEAR_STAT_BUDGET_VARIANCE_MIN = 0.90;
export const GEAR_STAT_BUDGET_VARIANCE_MAX = 1.10;

export const MARKET_RARITY_WEIGHTS = Object.freeze({
  common: 0.2,
  uncommon: 0.35,
  rare: 0.3,
  epic: 0.125,
  legendary: 0.025,
});

export const MISSION_GEAR_RARITY_WEIGHTS = Object.freeze({
  common: 0.6,
  uncommon: 0.3,
  rare: 0.1,
  epic: 0,
  legendary: 0,
});

export const DUNGEON_REGULAR_RARITY_WEIGHTS = Object.freeze({
  common: 0,
  uncommon: 0,
  rare: 0.85,
  epic: 0.1,
  legendary: 0.05,
});

export const DUNGEON_BOSS_RARITY_WEIGHTS = Object.freeze({
  common: 0,
  uncommon: 0,
  rare: 0,
  epic: 0.8,
  legendary: 0.2,
});

export const CONTRABAND_RARITY_WEIGHTS = Object.freeze({
  common: 0,
  uncommon: 0,
  rare: 0.65,
  epic: 0.25,
  legendary: 0.1,
});

export const MISSION_GEAR_LEVEL_OFFSET_WEIGHTS = Object.freeze([
  0.1, 0.15, 0.2, 0.2, 0.2, 0.15,
]);

export const MARKET_GEAR_LEVEL_OFFSET_WEIGHTS = Object.freeze([
  0.35, 0.35, 0.2, 0.1,
]);

export const MARKET_NORMAL_SLOT_COUNT = 8;
export const MARKET_GEAR_OFFER_CHANCE = 0.9;
export const MARKET_STIM_OFFER_CHANCE = 0.1;

export const MARKET_PRICE_RARITY_MULT = Object.freeze({
  common: 2.8,
  uncommon: 4.25,
  rare: 7,
  epic: 12,
  legendary: 24.5,
});

export const GEAR_RESALE_FRACTION = Object.freeze({
  common: 0.6,
  uncommon: 0.6,
  rare: 0.4,
  epic: 0.35,
  legendary: 0.3,
});

export const STIM_SHOP_MULT = Object.freeze({
  uncommon: 1.5,
  rare: 3,
  epic: 6.5,
});

export const STIM_SELL_MULT = Object.freeze({
  uncommon: 0.75,
  rare: 1.5,
  epic: 3.25,
});

export const STIM_TIERS = Object.freeze({
  uncommon: Object.freeze({
    bonusBps: 500,
    baseHours: 6,
    maxHours: 18,
  }),
  rare: Object.freeze({
    bonusBps: 1000,
    baseHours: 12,
    maxHours: 36,
  }),
  epic: Object.freeze({
    bonusBps: 2000,
    baseHours: 24,
    maxHours: 72,
  }),
});

export const STIM_MAX_ACTIVE_EFFECTS = 3;
export const STIM_UNCOMMON_LEVEL_MAX = 19;
export const STIM_RARE_LEVEL_MAX = 49;

/**
 * Player combat-context tempo is ×1 everywhere. Player Base Damage is the native
 * combat-scale polynomial (PLAYER_BASE_DAMAGE_*), not a scaled legacy raw.
 */
export const PLAYER_COMBAT_CONTEXT_MULT = 1;
/**
 * Dungeon/Wormhole enemy tempo after native combat-scale Base Damage.
 * Preserves former unscaled-raw × 2.75 because 2.5 × 1.10 = 2.75.
 */
export const DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT = 1.10;

/** Canonical player (and Dungeon/Wormhole enemy) Base Damage flat. */
export const PLAYER_BASE_DAMAGE_FLAT = 37.5;
export const PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT = 0.008;
export const PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT = 1.727;

export const COMBAT_CONTEXT_MULT = Object.freeze({
  missionPlayer: PLAYER_COMBAT_CONTEXT_MULT,
  dungeonWormholePlayer: PLAYER_COMBAT_CONTEXT_MULT,
  dungeonWormholeEnemy: DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT,
  arena: PLAYER_COMBAT_CONTEXT_MULT,
});

/**
 * Mission-enemy / historical unscaled polynomial flat.
 * Players and Dungeon/Wormhole enemies do not use this as live Base Damage.
 * Phase 4 must reconcile Mission enemy construction onto combat-scale damage.
 */
export const STANDARD_ATTACK_FLAT = 15;
export const RAW_ATTACK_COEFFICIENT = 0.0032;
export const RAW_ATTACK_EXPONENT = PLAYER_BASE_DAMAGE_PRIMARY_EXPONENT;
export const CRIT_DAMAGE_MULT = 1.5;

/** Certified HP: round_half_even(BASE + PER_VIT*VIT + SQ*VIT^2). */
export const HP_BASE = 50;
export const HP_PER_VITALITY = 2.5;
export const HP_VITALITY_SQUARED_COEFFICIENT = 0.008;

/**
 * Mission-only final MaxHP normalization. Universal maxHp(Vitality) is unchanged.
 * Native-damage term restores historical HP removed per player hit after the
 * Phase 3 native Base Damage migration:
 *   PLAYER_BASE_DAMAGE_FLAT / STANDARD_ATTACK_FLAT = 37.5 / 15 = 2.5
 *   PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT / RAW_ATTACK_COEFFICIENT = 0.008 / 0.0032 = 2.5
 * Pacing term is the approved extra Mission combat-presence factor (not part of
 * the 2.5 algebraic identity). Effective scale = 2.5 × 1.20 = 3.0.
 * Vitality, EPA, attributes, and Base Damage are not changed.
 */
export const MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION =
  PLAYER_BASE_DAMAGE_FLAT / STANDARD_ATTACK_FLAT;
export const MISSION_ENEMY_HP_PACING_MULTIPLIER = 1.20;
export const MISSION_ENEMY_HP_SCALE =
  MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION * MISSION_ENEMY_HP_PACING_MULTIPLIER;
/** Frozen on Mission acceptance so in-flight combats cannot silently retune. */
export const MISSION_COMBAT_RULES_VERSION = "phase4_mission_combat_v1";

/**
 * Mission enemy early flat ramp. EL<25: FLOOR + RISE*(EL-1)/SPAN; else MATURE.
 * Endpoint: EL=24 still ramps; EL=25 is STANDARD_ATTACK_FLAT.
 */
export const MISSION_ENEMY_BASE_RAMP_FULL_LEVEL = 25;
export const MISSION_ENEMY_BASE_RAMP_FLOOR = 5;
export const MISSION_ENEMY_BASE_RAMP_RISE = 10;
export const MISSION_ENEMY_BASE_RAMP_LEVEL_SPAN = 24;
export const MISSION_ENEMY_BASE_MATURE = STANDARD_ATTACK_FLAT;

export const NATURAL_CRIT_CAP = 0.3;
export const NATURAL_DODGE_CAP = 0.25;
export const NATURAL_RESIST_CAP = 0.3;
export const CRIT_FORMAX_MULT = 1.55;
export const CRIT_ATTR_EXPONENT = 1.8;

export const GENERIC_FORMAX_AT_100 = 700;
export const GENERIC_FORMAX_REFERENCE_LEVEL = 100;
export const GENERIC_FORMAX_EXPONENT = 0.95;
export const GENERIC_ATTR_EXPONENT = 1.2;
/**
 * Retired live formula: cap * min(1, (Level / 100) ** GENERIC_EARLY_EXPONENT).
 * Dodge / Crit / Resistance natural ceilings now use PCHIP anchors below.
 * Kept as a named historical record so 0.65 is not a stray literal.
 */
export const GENERIC_EARLY_EXPONENT = 0.65;

export const DERIVED_STAT_LEVEL_CAP_LEVEL_1 = 1;
export const DERIVED_STAT_LEVEL_CAP_LEVEL_25 = 25;
export const DERIVED_STAT_LEVEL_CAP_LEVEL_75 = 75;
export const DERIVED_STAT_LEVEL_CAP_LEVEL_100 = GENERIC_FORMAX_REFERENCE_LEVEL;

export const DODGE_LEVEL_CAP_AT_1 = 0.08;
export const DODGE_LEVEL_CAP_AT_25 = 0.15;
export const DODGE_LEVEL_CAP_AT_75 = 0.2;
export const DODGE_LEVEL_CAP_AT_100 = NATURAL_DODGE_CAP;

export const CRIT_RESIST_LEVEL_CAP_AT_1 = 0.1;
export const CRIT_RESIST_LEVEL_CAP_AT_25 = 0.175;
export const CRIT_RESIST_LEVEL_CAP_AT_75 = 0.25;
export const CRIT_RESIST_LEVEL_CAP_AT_100 = NATURAL_CRIT_CAP;

export const DODGE_LEVEL_CAP_ANCHORS = Object.freeze([
  Object.freeze({ level: DERIVED_STAT_LEVEL_CAP_LEVEL_1, cap: DODGE_LEVEL_CAP_AT_1 }),
  Object.freeze({ level: DERIVED_STAT_LEVEL_CAP_LEVEL_25, cap: DODGE_LEVEL_CAP_AT_25 }),
  Object.freeze({ level: DERIVED_STAT_LEVEL_CAP_LEVEL_75, cap: DODGE_LEVEL_CAP_AT_75 }),
  Object.freeze({ level: DERIVED_STAT_LEVEL_CAP_LEVEL_100, cap: DODGE_LEVEL_CAP_AT_100 }),
]);

export const CRIT_RESIST_LEVEL_CAP_ANCHORS = Object.freeze([
  Object.freeze({ level: DERIVED_STAT_LEVEL_CAP_LEVEL_1, cap: CRIT_RESIST_LEVEL_CAP_AT_1 }),
  Object.freeze({ level: DERIVED_STAT_LEVEL_CAP_LEVEL_25, cap: CRIT_RESIST_LEVEL_CAP_AT_25 }),
  Object.freeze({ level: DERIVED_STAT_LEVEL_CAP_LEVEL_75, cap: CRIT_RESIST_LEVEL_CAP_AT_75 }),
  Object.freeze({ level: DERIVED_STAT_LEVEL_CAP_LEVEL_100, cap: CRIT_RESIST_LEVEL_CAP_AT_100 }),
]);

/** Fritsch–Carlson / cubic Hermite identities — not gameplay knobs. */
export const PCHIP_SECANT_DOUBLE_WEIGHT = 2;
export const CUBIC_HERMITE_SQUARE_COEFFICIENT = 3;
export const CUBIC_HERMITE_CUBE_COEFFICIENT = 2;
export const PCHIP_ENDPOINT_SLOPE_LIMIT = 3;

export const DUNGEON_COUNT = 10;
export const DUNGEON_ENCOUNTERS_PER_DUNGEON = 10;
export const DUNGEON_INDEX_MAX = DUNGEON_COUNT - 1;
export const DUNGEON_ENCOUNTER_INDEX_MAX = DUNGEON_ENCOUNTERS_PER_DUNGEON - 1;
export const DUNGEON_DRU = Object.freeze([60, 150, 170, 300, 340, 495, 715, 810, 1060, 1330]);
export const DUNGEON_UNLOCK_LEVELS = Object.freeze([10, 20, 30, 40, 50, 60, 70, 90, 120, 140]);
export const DUNGEON_XP_SHARES = Object.freeze([
  0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.14, 0.18,
]);
export const DUNGEON_ENEMY_LEVELS = Object.freeze([
  Object.freeze([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
  Object.freeze([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]),
  Object.freeze([30, 31, 32, 33, 34, 35, 36, 37, 38, 39]),
  Object.freeze([40, 42, 43, 45, 46, 48, 49, 51, 52, 54]),
  Object.freeze([55, 57, 58, 60, 61, 63, 64, 66, 67, 69]),
  Object.freeze([70, 72, 74, 76, 78, 80, 82, 84, 86, 88]),
  Object.freeze([90, 93, 95, 98, 100, 103, 105, 108, 110, 113]),
  Object.freeze([115, 118, 120, 123, 125, 128, 130, 133, 135, 138]),
  Object.freeze([140, 143, 146, 149, 152, 155, 158, 161, 164, 167]),
  Object.freeze([170, 173, 177, 180, 183, 187, 190, 193, 197, 200]),
]);

export const WORMHOLE_BASE_LEVEL = 202;
export const WORMHOLE_LEVEL_PER_INDEX = 2;
export const WORMHOLE_ENCOUNTERS_PER_BAND = 10;
export const WORMHOLE_BAND_WIDTH = 20;
export const WORMHOLE_BAND_DRU_REFERENCE = 1340;

export const GAME_DAY_RESET_HOUR_UTC = 19;
export const MARKET_REFRESH_HOURS_UTC = Object.freeze([19, 7]);
export const CONTRABAND_RESET_HOUR_UTC = 19;
export const FREE_FUEL_PER_GAME_DAY = 100;
export const STARTING_FUEL = FREE_FUEL_PER_GAME_DAY;
export const PAID_FUEL_PER_PURCHASE = 20;
export const PAID_FUEL_NOVA_COST = 20;
export const MAX_PAID_FUEL_PURCHASES_PER_GAME_DAY = 10;
export const STARTING_NOVA = 500;
export const STARTING_STARDUST = 0;

export const JS_MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export const COMPANY_SLOTS = Object.freeze({
  Company1: Object.freeze(["helmet", "armor", "legs", "boots"]),
  Company2: Object.freeze(["armor", "boots", "neck", "accessory"]),
  Company3: Object.freeze(["helmet", "legs", "weapon", "ship_module"]),
  Company4: Object.freeze(["weapon", "neck", "accessory", "ship_module"]),
});

export const NOVA_SURCHARGE_BANDS = Object.freeze([
  Object.freeze({ id: "below25", minInclusive: 0, maxExclusive: 0.75 }),
  Object.freeze({ id: "15to25", minInclusive: 0.75, maxExclusive: 0.85 }),
  Object.freeze({ id: "8to15", minInclusive: 0.85, maxExclusive: 0.92 }),
  Object.freeze({ id: "3to8", minInclusive: 0.92, maxExclusive: 0.97 }),
  Object.freeze({ id: "1to3", minInclusive: 0.97, maxExclusive: 0.99 }),
  Object.freeze({ id: "top1", minInclusive: 0.99, maxExclusive: Infinity }),
]);

export const NOVA_SURCHARGE_TABLE = Object.freeze({
  epic: Object.freeze({
    probabilities: Object.freeze([0.3, 0.4, 0.55, 0.65, 0.75, 0.85]),
    prices: Object.freeze([
      Object.freeze([5, 10, 15]),
      Object.freeze([10, 25, 25]),
      Object.freeze([20, 30, 40]),
      Object.freeze([30, 40, 50]),
      Object.freeze([40, 50, 75]),
      Object.freeze([50, 75, 100]),
    ]),
  }),
  legendary: Object.freeze({
    probabilities: Object.freeze([0.4, 0.55, 0.7, 0.8, 0.9, 0.95]),
    prices: Object.freeze([
      Object.freeze([10, 15, 20]),
      Object.freeze([20, 30, 40]),
      Object.freeze([30, 40, 50]),
      Object.freeze([40, 50, 75]),
      Object.freeze([50, 75, 100]),
      Object.freeze([75, 100, 150]),
    ]),
  }),
});

export const EPA_OFFICIAL_ANCHORS = Object.freeze([
  Object.freeze([10, 402.6504]),
  Object.freeze([25, 1011.245]),
  Object.freeze([50, 2192.4117]),
  Object.freeze([75, 3218.92]),
  Object.freeze([100, 4126.3983]),
  Object.freeze([150, 5857.7383]),
  Object.freeze([200, 7716.1433]),
  Object.freeze([250, 9576.67]),
  Object.freeze([300, 11491.74]),
  Object.freeze([400, 15535.875]),
  Object.freeze([500, 19946.125]),
  Object.freeze([600, 24521.945]),
  Object.freeze([700, 29033.8783]),
  Object.freeze([800, 33389.725]),
]);

export const T18_L1_EPA = 50;

/**
 * EPA(L) = c0 + c1*L + Σ_{k=2..7} ck * T_k(2*L/(L+λ) - 1)
 *        + Σ_i A_i exp(-((L-μ_i)/σ_i)^2)
 * Chebyshev fit to official T18 anchors + L1=50; three compact Gaussians
 * pull max official-anchor error under 0.5% without changing high-L slope.
 */
export const EPA_COMPACT_LAMBDA = 80;
export const EPA_CHEBYSHEV_COEFFICIENTS = Object.freeze([
  -159.31392924564,
  43.613870937224,
  572.90450494445,
  879.5810746474,
  795.69577089403,
  441.88660880886,
  154.3014043182,
  72.952149350431,
]);
export const EPA_RESIDUAL_GAUSSIANS = Object.freeze([
  Object.freeze({ mu: 150, sigma: 40, amplitude: -52.11245097289954 }),
  Object.freeze({ mu: 200, sigma: 40, amplitude: 58.1384690907907 }),
  Object.freeze({ mu: 400, sigma: 70, amplitude: -97.90216324155018 }),
]);

export const REFLEX_CONVERSION_LOW = 0.225;
export const REFLEX_CONVERSION_HIGH = 0.325;
export const REFLEX_RAMP_START_LEVEL = 400;
export const REFLEX_RAMP_END_LEVEL = 750;
export const REFLEX_BLEND_HALF_WIDTH = 6;

export const AVGFUEL_TABLE = Object.freeze([
  Object.freeze({ maxLevel: 2, value: 0.375 }),
  Object.freeze({ maxLevel: 3, value: 0.5 }),
  Object.freeze({ maxLevel: 4, value: 0.75 }),
  Object.freeze({ maxLevel: 5, value: 0.875 }),
  Object.freeze({ maxLevel: 7, value: 1 }),
  Object.freeze({ maxLevel: 8, value: 1.5 }),
  Object.freeze({ maxLevel: 10, value: 1.75 }),
  Object.freeze({ maxLevel: 12, value: 3.75 }),
  Object.freeze({ maxLevel: 14, value: 5 }),
  Object.freeze({ maxLevel: 15, value: 6.25 }),
  Object.freeze({ maxLevel: 17, value: 8.75 }),
  Object.freeze({ maxLevel: 18, value: 10 }),
  Object.freeze({ maxLevel: 19, value: 11.25 }),
]);
export const AVGFUEL_MATURE = 12.5;

export const ATTR_COST_HORNER = Object.freeze([
  0.00263490059,
  -0.0530391365,
  0.411171165,
  -0.985347882,
  -0.461561195,
  7.41094646,
]);
export const ATTR_COST_LOG_OFFSET = 20;

/** First N purchases of each attribute use a discrete intro table, not attrcost. */
export const PERMANENT_ATTRIBUTE_POINTS_PER_PURCHASE = 1;
export const ATTR_INTRO_PURCHASE_COUNT = 5;
export const ATTR_INTRO_PURCHASE_COST_1 = 10;
export const ATTR_INTRO_PURCHASE_COST_2 = 20;
export const ATTR_INTRO_PURCHASE_COST_3 = 40;
export const ATTR_INTRO_PURCHASE_COST_4 = 60;
export const ATTR_INTRO_PURCHASE_COST_5 = 80;
export const ATTR_INTRO_PURCHASE_COSTS = Object.freeze([
  ATTR_INTRO_PURCHASE_COST_1,
  ATTR_INTRO_PURCHASE_COST_2,
  ATTR_INTRO_PURCHASE_COST_3,
  ATTR_INTRO_PURCHASE_COST_4,
  ATTR_INTRO_PURCHASE_COST_5,
]);

export const MISSION_OUTGOING_KNOTS = Object.freeze([
  Object.freeze([1, 0.3]),
  Object.freeze([10, 0.35]),
  Object.freeze([15, 0.5]),
  Object.freeze([20, 2.5]),
  Object.freeze([50, 6]),
  Object.freeze([100, 10]),
  Object.freeze([200, 12]),
]);
export const MISSION_OUTGOING_ASYMPTOTE = 12;

/** Simultaneous Cantina offers on a normal board. */
export const MISSION_OFFER_COUNT = 3;
export const MISSION_SECONDS_PER_FUEL = 60;
export const MISSION_MIN_DURATION_SECONDS = 15;
export const MISSION_MAX_DURATION_SECONDS = 1200;
export const MISSION_DURATION_POOL_MATURE_LEVEL = 21;
export const MISSION_MIN_FUEL = MISSION_MIN_DURATION_SECONDS / MISSION_SECONDS_PER_FUEL;

/**
 * Discrete production Mission duration pools (seconds). Uniform selection.
 * L21+ is intentionally stable forever — not a level cap.
 */
export const MISSION_DURATION_POOLS = Object.freeze({
  1: Object.freeze([15, 30]),
  2: Object.freeze([15, 30]),
  3: Object.freeze([15, 30, 45]),
  4: Object.freeze([30, 45, 60]),
  5: Object.freeze([30, 45, 60, 75]),
  6: Object.freeze([30, 60, 90]),
  7: Object.freeze([30, 60, 90]),
  8: Object.freeze([60, 90, 120]),
  9: Object.freeze([60, 90, 120, 150]),
  10: Object.freeze([60, 90, 120, 150]),
  11: Object.freeze([150, 300]),
  12: Object.freeze([150, 300]),
  13: Object.freeze([150, 300, 450]),
  14: Object.freeze([150, 300, 450]),
  15: Object.freeze([150, 300, 450, 600]),
  16: Object.freeze([300, 450, 600, 750]),
  17: Object.freeze([300, 450, 600, 750]),
  18: Object.freeze([300, 450, 600, 750, 900]),
  19: Object.freeze([300, 450, 600, 750, 900, 1050]),
  20: Object.freeze([300, 450, 600, 750, 900, 1050, 1200]),
  21: Object.freeze([300, 600, 900, 1200]),
});

export const MISSION_SKIP_RAW_NOVA_PER_FUEL = 0.1;
export const MISSION_SKIP_MIN_NOVA = 0.5;

export const MISSION_GEAR_REFERENCE_FUEL = AVGFUEL_MATURE;
export const MISSION_GEAR_REFERENCE_CHANCE = 0.3;
export const MISSION_GEAR_PITY_INCREMENT = 0.025;
export const MISSION_GEAR_PITY_CLAMP = 0.999;
export const MISSION_STIM_NO_DROP_BASE = 0.9;
export const MISSION_JUNK_NO_DROP_BASE = 0.25;
export const MISSION_JUNK_VALUE_RATIO = 0.45;
export const MISSION_JUNK_VARIANCE_MIN = 0.6;
export const MISSION_JUNK_VARIANCE_MAX = 1.4;

export const MISSION_ENEMY_ARCHETYPES = Object.freeze(["Might", "Reflex", "Tech"]);
export const MISSION_ENEMY_ARCHETYPE_WEIGHTS = Object.freeze([1, 1, 1]);
export const MISSION_ENEMY_ARCHETYPE_CLASS = Object.freeze({
  Might: "Vanguard",
  Reflex: "Shadow Operative",
  Tech: "Technomancer",
});

export const MISSION_OFFER_DEDUPE_REROLL_LIMIT = 20;
export const MISSION_OFFER_DEDUPE_NUDGE_LIMIT = 64;
export const MISSION_BOARD_AFFORDABLE_REROLL_LIMIT = 32;
/** Discrete Mission XP/Stardust variance increment: VARIANCE_MIN..VARIANCE_MAX in thousandths. */
export const MISSION_VARIANCE_STEP = 0.001;
export const MISSION_VARIANCE_PRECISION_SCALE = 1000;

export const PVE_HIDDEN_BUDGET_OFFSET = Object.freeze([
  Object.freeze({ maxLevel: 150, offset: 5 }),
  Object.freeze({ maxLevel: 160, offset: 6 }),
  Object.freeze({ maxLevel: 170, offset: 7 }),
  Object.freeze({ maxLevel: 180, offset: 8 }),
  Object.freeze({ maxLevel: 190, offset: 9 }),
]);
export const PVE_HIDDEN_BUDGET_OFFSET_MATURE = 10;

/** Admin expected-loadout simulator (not a live player formula). */
export const BASIS_POINTS_DENOMINATOR = 10000;
/** Light-spender purchase share of EPA once the ramp completes. */
export const SIMULATE_PURCHASE_EPA_SHARE_BPS = 3800;
/** Purchase share is 0 at L1 and reaches SIMULATE_PURCHASE_EPA_SHARE_BPS at this level. */
export const SIMULATE_PURCHASE_RAMP_COMPLETE_LEVEL = 25;
export const SIMULATE_STARDUST_DAY_COUNT = 10;
export const SIMULATE_NOVA_GRANT = 100000;
export const SIMULATE_GEAR_RARITY = "rare";
export const SIMULATE_ATTR_KEYS = Object.freeze([
  "strength",
  "agility",
  "intellect",
  "vitality",
  "luck",
]);
export const SIMULATE_STIM_VITALITY_KEY = "vitality";
export const SIMULATE_STIM_LUCK_KEY = "luck";
export const MILLISECONDS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const MILLISECONDS_PER_HOUR =
  MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
