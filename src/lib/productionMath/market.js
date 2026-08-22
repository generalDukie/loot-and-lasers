/**
 * AUTHORITATIVE FORMULA MODULE — PENDING CALLER MIGRATION IN LATER PHASES
 *
 * Intentional discrete Market / Stim / Nova-surcharge rules. RNG stays outside.
 */
import {
  NOVA_SURCHARGE_BANDS,
  NOVA_SURCHARGE_TABLE,
  STIM_TIERS,
} from "./constants.js";

function levelInt(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

/** Player-level-band Stim shop tier: L<20 Uncommon, L<50 Rare, else Epic. */
export function marketStimTier(playerLevel) {
  const L = levelInt(playerLevel);
  if (L < 20) return "uncommon";
  if (L < 50) return "rare";
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
  const rank = { uncommon: 0, rare: 1, epic: 2 };
  const inc = rank[incomingTier];
  const have = cur.tier == null ? -1 : rank[cur.tier];
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
  if (!Number.isFinite(p) || p < NOVA_SURCHARGE_BANDS[1].minInclusive) return 0;
  if (p >= 0.99) return 5;
  if (p >= 0.97) return 4;
  if (p >= 0.92) return 3;
  if (p >= 0.85) return 2;
  if (p >= 0.75) return 1;
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
