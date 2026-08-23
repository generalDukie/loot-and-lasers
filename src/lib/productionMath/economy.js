/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 1 LIVE FOR ATTR COST / PHASE-1 CURRENCY HELPERS
 * Gear/market/mission reward primitives remain for later phases.
 */
import { roundHalfUp } from "./rounding.js";
import {
  ARENA_STARDUST_PER_SPF,
  DEFEAT_REWARD_FACTOR,
  GEAR_RESALE_FRACTION,
  MARKET_PRICE_RARITY_MULT,
  MINING_STARDUST_PER_SPF_PER_MINUTE,
  STARDUST_PF_BASE,
  STARDUST_PF_GROWTH_COEFFICIENT,
  STARDUST_PF_GROWTH_EXPONENT,
  STARDUST_PF_HILL_EXPONENT,
  STARDUST_PF_HILL_REFERENCE_LEVEL,
  STIM_SELL_MULT,
  STIM_SHOP_MULT,
} from "./constants.js";
import { gearSlotMultiplier } from "./gear.js";

function levelInt(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

/**
 * Certified StardustPerFuel.
 * ROUND(STARDUST_PF_BASE + GROWTH*(L-1)^EXP * (1 + (L/HILL_REF)^HILL_EXP))
 * Do not multiply by XP storage scale.
 */
export function stardustPerFuel(level) {
  const L = levelInt(level);
  if (L <= 1) return STARDUST_PF_BASE;
  const growth = STARDUST_PF_GROWTH_COEFFICIENT
    * (L - 1) ** STARDUST_PF_GROWTH_EXPONENT
    * (1 + (L / STARDUST_PF_HILL_REFERENCE_LEVEL) ** STARDUST_PF_HILL_EXPONENT);
  return Math.max(1, roundHalfUp(STARDUST_PF_BASE + growth));
}

/**
 * Mission Stardust. Independent variance input — not shared with XP.
 * Order: ROUND(Fuel * SPF(snapL) * stardustVariance); defeat then ROUND(win * 0.5).
 * No 0.85 XP-efficiency factor.
 */
export function missionStardustReward({
  fuel,
  snapshotLevel,
  stardustVariance = 1,
  defeated = false,
} = {}) {
  const F = Number(fuel) || 0;
  const v = Number(stardustVariance);
  let sd = roundHalfUp(F * stardustPerFuel(snapshotLevel) * v);
  if (defeated) sd = roundHalfUp(sd * DEFEAT_REWARD_FACTOR);
  return Math.max(0, sd);
}

export function arenaStardustReward(level) {
  return Math.max(0, roundHalfUp(ARENA_STARDUST_PER_SPF * stardustPerFuel(level)));
}

/** Certified rate: 0.03 * SPF(snapshotLevel) per minute. Session snapshots at start. */
export function miningStardustRate(snapshotLevel) {
  return MINING_STARDUST_PER_SPF_PER_MINUTE * stardustPerFuel(snapshotLevel);
}

export function miningStardust({ snapshotLevel, minutes } = {}) {
  return miningStardustRate(snapshotLevel) * (Number(minutes) || 0);
}

export function miningStardustResolved({ snapshotLevel, minutes } = {}) {
  return Math.max(0, roundHalfUp(miningStardust({ snapshotLevel, minutes })));
}

export function stimShopPrice(level, tier) {
  const mult = STIM_SHOP_MULT[tier];
  if (mult == null) return 0;
  return stardustPerFuel(level) * mult;
}

export function stimSellValue(level, tier) {
  const mult = STIM_SELL_MULT[tier];
  if (mult == null) return 0;
  return stardustPerFuel(level) * mult;
}

export function stimShopPriceResolved(level, tier) {
  return Math.max(0, roundHalfUp(stimShopPrice(level, tier)));
}

export function stimSellValueResolved(level, tier) {
  return Math.max(0, roundHalfUp(stimSellValue(level, tier)));
}

function slotPremium(slot) {
  return gearSlotMultiplier(slot);
}

/**
 * Pre-variance Black Market base (economic item level, not PvE hidden budget level).
 * SPF(il) * rarityMult * slotPremium
 */
export function blackMarketBasePrice(itemReferenceLevel, slot, rarity) {
  const rar = MARKET_PRICE_RARITY_MULT[rarity];
  if (rar == null) return 0;
  return stardustPerFuel(itemReferenceLevel) * rar * slotPremium(slot);
}

/**
 * ROUND(base * priceVariance). Variance is an explicit input.
 */
export function blackMarketPrice(itemReferenceLevel, slot, rarity, priceVariance = 1) {
  return Math.max(0, roundHalfUp(blackMarketBasePrice(itemReferenceLevel, slot, rarity) * Number(priceVariance)));
}

/**
 * Resale relative to pre-variance Market base at economic level.
 * Hidden PvE stat-budget offset must not be passed as itemReferenceLevel.
 */
export function gearResaleValue(itemReferenceLevel, slot, rarity) {
  const frac = GEAR_RESALE_FRACTION[rarity];
  if (frac == null) return 0;
  return Math.max(0, roundHalfUp(blackMarketBasePrice(itemReferenceLevel, slot, rarity) * frac));
}
