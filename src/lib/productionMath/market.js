/**
 * AUTHORITATIVE FORMULA MODULE — PENDING CALLER MIGRATION IN LATER PHASES
 *
 * Intentional discrete Market / Stim / Nova-surcharge rules. RNG stays outside.
 */
import {
  NOVA_SURCHARGE_BANDS,
  NOVA_SURCHARGE_TABLE,
  STIM_RARE_LEVEL_MAX,
  STIM_TIERS,
  STIM_UNCOMMON_LEVEL_MAX,
} from "./constants.js";

const STIM_TIER_RANK = Object.freeze({ uncommon: 0, rare: 1, epic: 2 });

function levelInt(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

/** Player-level-band Stim shop tier: L≤UNCOMMON_MAX Uncommon, L≤RARE_MAX Rare, else Epic. */
export function marketStimTier(playerLevel) {
  const L = levelInt(playerLevel);
  if (L <= STIM_UNCOMMON_LEVEL_MAX) return "uncommon";
  if (L <= STIM_RARE_LEVEL_MAX) return "rare";
  return "epic";
}

export function stimTierSpec(tier) {
  return STIM_TIERS[tier] || null;
}

/**
 * Same-tier extends up to cap; higher replaces with fresh duration; lower does not replace.
 * Returns the next {tier, remainingHours} state. Max 3 active effects is a caller concern.
 */
export function nextStimState(current, incomingTier) {
  const spec = STIM_TIERS[incomingTier];
  if (!spec) return current;
  const cur = current && current.tier ? current : { tier: null, remainingHours: 0 };
  const inc = STIM_TIER_RANK[incomingTier];
  const have = cur.tier == null ? -1 : STIM_TIER_RANK[cur.tier];
  if (inc > have) return { tier: incomingTier, remainingHours: spec.baseHours };
  if (inc === have) {
    return {
      tier: incomingTier,
      remainingHours: Math.min(spec.maxHours, (Number(cur.remainingHours) || 0) + spec.baseHours),
    };
  }
  return cur;
}

export function marketGearReferenceLevel(playerLevel, offsetIndex) {
  const L = levelInt(playerLevel);
  const off = Math.max(0, Math.floor(Number(offsetIndex) || 0));
  return Math.max(1, L - off);
}

export function novaSurchargeBandIndex(percentile) {
  const p = Number(percentile);
  if (!Number.isFinite(p)) return 0;
  for (let i = NOVA_SURCHARGE_BANDS.length - 1; i >= 0; i--) {
    if (p >= NOVA_SURCHARGE_BANDS[i].minInclusive) return i;
  }
  return 0;
}

export function novaSurchargeSpec(rarity, percentile) {
  const table = NOVA_SURCHARGE_TABLE[rarity];
  if (!table) return { band: -1, probability: 0, prices: Object.freeze([]) };
  const band = novaSurchargeBandIndex(percentile);
  return {
    band,
    bandId: NOVA_SURCHARGE_BANDS[band].id,
    probability: table.probabilities[band],
    prices: table.prices[band],
  };
}

/**
 * Deterministic surcharge resolve.
 * hitRoll in [0,1): offer occurs if hitRoll < probability.
 * choiceUnit in [0,1) selects among allowed Nova values.
 */
export function resolveNovaSurcharge(rarity, percentile, hitRoll, choiceUnit) {
  const spec = novaSurchargeSpec(rarity, percentile);
  if (spec.probability <= 0) return 0;
  if (!(Number(hitRoll) < spec.probability)) return 0;
  const prices = spec.prices;
  const u = Math.min(1, Math.max(0, Number(choiceUnit) || 0));
  const idx = Math.min(prices.length - 1, Math.floor(u * prices.length));
  return prices[idx];
}
