/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 6 LIVE FOR BLACK MARKET / CONTRABAND
 *
 * Intentional discrete Market / Stim / Nova-surcharge / refresh-window rules.
 * RNG stays outside except injected [0,1) samplers.
 */
import { quantizeNova, roundHalfUp } from "./rounding.js";
import {
  BASIS_POINTS_DENOMINATOR,
  CONTRABAND_MANUAL_REFRESH_TRIGGER,
  CONTRABAND_RARITY_WEIGHTS,
  CONTRABAND_RESET_HOUR_UTC,
  DATE_PART_PAD_WIDTH,
  GEAR_SLOTS,
  MARKET_COMPANIES_PER_SLOT,
  MARKET_GEAR_LEVEL_OFFSET_WEIGHTS,
  MARKET_GEAR_OFFER_CHANCE,
  MARKET_HAGGLE_DISCOUNT_MAX_PERCENT,
  MARKET_HAGGLE_DISCOUNT_MIN_PERCENT,
  MARKET_HAGGLE_SUCCESS_CHANCE_NOVA,
  MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD,
  MARKET_HAGGLE_VENDOR_FLOOR_OFFSET,
  MARKET_MIN_STIM_OFFERS,
  MARKET_MORNING_REFRESH_HOUR_UTC,
  MARKET_NORMAL_SLOT_COUNT,
  MARKET_OFFER_KIND_GEAR,
  MARKET_OFFER_KIND_STIM,
  MARKET_PRICE_VARIANCE_MAX,
  MARKET_PRICE_VARIANCE_MIN,
  MARKET_RARITY_WEIGHTS,
  MARKET_STIM_ATTRIBUTES,
  MARKET_WINDOW_DURATION_HOURS,
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_SECOND,
  NOVA_SURCHARGE_BANDS,
  NOVA_SURCHARGE_TABLE,
  PERCENT_DENOMINATOR,
  SLOT_ELIGIBLE_COMPANIES,
  STIM_RARE_LEVEL_MAX,
  STIM_SAME_TIER_RESTIM_ELAPSED_DIVISOR,
  STIM_TIERS,
  STIM_UNCOMMON_LEVEL_MAX,
} from "./constants.js";
import { canonicalGearSlot } from "./gear.js";

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

/** Stim attribute multiplier from named bonusBps (500 → 0.05). */
export function stimBonusMultiplier(tier) {
  const spec = STIM_TIERS[tier];
  if (!spec) return 0;
  return spec.bonusBps / BASIS_POINTS_DENOMINATOR;
}

/** Half of the tier's base duration — the wait from cap before another same-tier dose. */
export function stimSameTierRestimCooldownHours(tier) {
  const spec = STIM_TIERS[tier];
  if (!spec) return 0;
  return spec.baseHours / STIM_SAME_TIER_RESTIM_ELAPSED_DIVISOR;
}

/**
 * Same-tier restim is allowed when remaining hours are at or below this value:
 * Uncommon 15h, Rare 30h, Epic 60h (`maxHours - half base` = 2.5 × baseHours).
 * Authority is server `expires_at` vs now — not client remaining.
 */
export function stimSameTierRestimRemainingBlockHours(tier) {
  const spec = STIM_TIERS[tier];
  if (!spec) return 0;
  return spec.maxHours - stimSameTierRestimCooldownHours(tier);
}

/** Map stored/legacy labels onto Uncommon / Rare / Epic. */
export function resolveStimRarity(source) {
  const raw = String(
    source?.rarity || source?.consumable?.tier || source?.tier || "",
  ).toLowerCase();
  if (STIM_TIERS[raw]) return raw;
  if (raw === "common" || raw === "minor") return "uncommon";
  if (raw === "legendary" || raw === "mythic" || raw === "prime") return "epic";
  const mult = Number(source?.mult ?? source?.consumable?.mult ?? 0);
  if (mult >= stimBonusMultiplier("epic")) return "epic";
  if (mult >= stimBonusMultiplier("rare")) return "rare";
  if (mult > 0) return "uncommon";
  return "uncommon";
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

function requireRng(rng, label) {
  if (typeof rng !== "function") {
    throw new Error(`${label} requires injected RNG`);
  }
  return rng;
}

function unitHalfOpen(rng) {
  const u = Number(rng());
  if (!Number.isFinite(u) || u < 0) return 0;
  if (u >= 1) return 1 - Number.EPSILON;
  return u;
}

function unitClosed(rng) {
  const u = Number(rng());
  if (!Number.isFinite(u) || u < 0) return 0;
  if (u > 1) return 1;
  return u;
}

function pickWeightedRecord(weights, rng) {
  const r = requireRng(rng, "pickWeightedRecord");
  const entries = Object.entries(weights).filter(([, w]) => Number(w) > 0);
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  let roll = unitHalfOpen(r) * total;
  for (const [key, w] of entries) {
    roll -= Number(w);
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function padDatePart(n) {
  return String(n).padStart(DATE_PART_PAD_WIDTH, "0");
}

function utcParts(nowMs) {
  const d = new Date(nowMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
  };
}

function utcMs(year, month, day, hour) {
  return Date.UTC(year, month - 1, day, hour, 0, 0, 0);
}

export function marketWindowDurationMs() {
  return MARKET_WINDOW_DURATION_HOURS * MILLISECONDS_PER_HOUR;
}

/**
 * Normal Market 12-hour windows: 19:00 UTC and 07:00 UTC. No DST.
 * Idempotent `idx` is unique per window start.
 */
export function marketWindowAt(nowMs) {
  const ms = Number(nowMs);
  const p = utcParts(ms);
  let startsAt;
  if (p.hour >= CONTRABAND_RESET_HOUR_UTC) {
    startsAt = utcMs(p.year, p.month, p.day, CONTRABAND_RESET_HOUR_UTC);
  } else if (p.hour >= MARKET_MORNING_REFRESH_HOUR_UTC) {
    startsAt = utcMs(p.year, p.month, p.day, MARKET_MORNING_REFRESH_HOUR_UTC);
  } else {
    startsAt = utcMs(p.year, p.month, p.day, MARKET_MORNING_REFRESH_HOUR_UTC)
      - marketWindowDurationMs();
  }
  const endsAt = startsAt + marketWindowDurationMs();
  const startHour = new Date(startsAt).getUTCHours();
  return {
    idx: Math.floor(startsAt / marketWindowDurationMs()),
    startsAt,
    endsAt,
    startHour,
    secondsLeft: Math.max(0, Math.floor((endsAt - ms) / MILLISECONDS_PER_SECOND)),
    rotationPeriodId: `market-rotation:utc:${Math.floor(startsAt / marketWindowDurationMs())}`,
  };
}

/** Contraband daily period keyed at 19:00 UTC. Independent of the 07:00 Market window. */
export function contrabandPeriodId(nowMs) {
  const ms = Number(nowMs);
  const p = utcParts(ms);
  let startsAt;
  if (p.hour >= CONTRABAND_RESET_HOUR_UTC) {
    startsAt = utcMs(p.year, p.month, p.day, CONTRABAND_RESET_HOUR_UTC);
  } else {
    startsAt = utcMs(p.year, p.month, p.day, CONTRABAND_RESET_HOUR_UTC) - MILLISECONDS_PER_DAY;
  }
  const d = new Date(startsAt);
  return `${d.getUTCFullYear()}-${padDatePart(d.getUTCMonth() + 1)}-${padDatePart(d.getUTCDate())}`;
}

export function contrabandWindowAt(nowMs) {
  const ms = Number(nowMs);
  const p = utcParts(ms);
  let startsAt;
  if (p.hour >= CONTRABAND_RESET_HOUR_UTC) {
    startsAt = utcMs(p.year, p.month, p.day, CONTRABAND_RESET_HOUR_UTC);
  } else {
    startsAt = utcMs(p.year, p.month, p.day, CONTRABAND_RESET_HOUR_UTC) - MILLISECONDS_PER_DAY;
  }
  const endsAt = startsAt + MILLISECONDS_PER_DAY;
  return {
    period_id: contrabandPeriodId(ms),
    startsAt,
    endsAt,
    secondsLeft: Math.max(0, Math.floor((endsAt - ms) / MILLISECONDS_PER_SECOND)),
  };
}

export function rollMarketOfferKind(rng) {
  const r = requireRng(rng, "rollMarketOfferKind");
  return unitHalfOpen(r) < MARKET_GEAR_OFFER_CHANCE
    ? MARKET_OFFER_KIND_GEAR
    : MARKET_OFFER_KIND_STIM;
}

export function rollNormalMarketOfferKinds(rng) {
  const r = requireRng(rng, "rollNormalMarketOfferKinds");
  const kinds = [];
  for (let i = 0; i < MARKET_NORMAL_SLOT_COUNT; i++) {
    kinds.push(rollMarketOfferKind(r));
  }
  const stimCount = kinds.filter((k) => k === MARKET_OFFER_KIND_STIM).length;
  let safeguardIndex = -1;
  if (stimCount < MARKET_MIN_STIM_OFFERS) {
    safeguardIndex = Math.floor(unitHalfOpen(r) * MARKET_NORMAL_SLOT_COUNT);
    kinds[safeguardIndex] = MARKET_OFFER_KIND_STIM;
  }
  return { kinds, safeguardIndex, stimCountBeforeSafeguard: stimCount };
}

export function rollMarketGearRarity(rng) {
  return pickWeightedRecord(MARKET_RARITY_WEIGHTS, rng);
}

export function rollContrabandRarity(rng) {
  return pickWeightedRecord(CONTRABAND_RARITY_WEIGHTS, rng);
}

export function rollMarketGearLevelOffsetIndex(rng) {
  const r = requireRng(rng, "rollMarketGearLevelOffsetIndex");
  const weights = MARKET_GEAR_LEVEL_OFFSET_WEIGHTS;
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = unitHalfOpen(r) * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

export function rollMarketGearItemLevel(playerLevel, rng) {
  const offset = rollMarketGearLevelOffsetIndex(rng);
  return marketGearReferenceLevel(playerLevel, offset);
}

export function rollMarketGearSlot(rng) {
  const r = requireRng(rng, "rollMarketGearSlot");
  return GEAR_SLOTS[Math.floor(unitHalfOpen(r) * GEAR_SLOTS.length)];
}

export function companiesForSlot(slot) {
  const key = canonicalGearSlot(slot) || String(slot || "").toLowerCase();
  return SLOT_ELIGIBLE_COMPANIES[key] || Object.freeze([]);
}

export function rollManufacturerForSlot(slot, rng) {
  const r = requireRng(rng, "rollManufacturerForSlot");
  const companies = companiesForSlot(slot);
  if (!companies.length) return null;
  const idx = Math.min(
    MARKET_COMPANIES_PER_SLOT - 1,
    Math.floor(unitHalfOpen(r) * companies.length),
  );
  return companies[idx];
}

export function rollMarketStimAttribute(rng) {
  const r = requireRng(rng, "rollMarketStimAttribute");
  return MARKET_STIM_ATTRIBUTES[
    Math.floor(unitHalfOpen(r) * MARKET_STIM_ATTRIBUTES.length)
  ];
}

export function rollMarketPriceVariance(rng, variance = null) {
  if (variance != null && Number.isFinite(Number(variance))) {
    const v = Number(variance);
    return Math.min(MARKET_PRICE_VARIANCE_MAX, Math.max(MARKET_PRICE_VARIANCE_MIN, v));
  }
  const r = requireRng(rng, "rollMarketPriceVariance");
  const span = MARKET_PRICE_VARIANCE_MAX - MARKET_PRICE_VARIANCE_MIN;
  return MARKET_PRICE_VARIANCE_MIN + unitClosed(r) * span;
}

export function rollHaggleDiscountPercent(rng) {
  const r = requireRng(rng, "rollHaggleDiscountPercent");
  const inclusiveCount =
    MARKET_HAGGLE_DISCOUNT_MAX_PERCENT - MARKET_HAGGLE_DISCOUNT_MIN_PERCENT + 1;
  return MARKET_HAGGLE_DISCOUNT_MIN_PERCENT
    + Math.floor(unitHalfOpen(r) * inclusiveCount);
}

export function clampHaggleDiscountPercent(discountPercent) {
  return Math.max(
    MARKET_HAGGLE_DISCOUNT_MIN_PERCENT,
    Math.min(MARKET_HAGGLE_DISCOUNT_MAX_PERCENT, Math.floor(Number(discountPercent) || 0)),
  );
}

export function applyHaggleDiscountToPrice(listingPrice, vendorValue, discountPercent) {
  const listing = Math.max(0, roundHalfUp(Number(listingPrice) || 0));
  const vendor = Math.max(0, roundHalfUp(Number(vendorValue) || 0));
  const floor = vendor + MARKET_HAGGLE_VENDOR_FLOOR_OFFSET;
  if (listing <= floor) return listing;
  const pct = clampHaggleDiscountPercent(discountPercent);
  const discounted = roundHalfUp(
    listing * (PERCENT_DENOMINATOR - pct) / PERCENT_DENOMINATOR,
  );
  return Math.max(floor, Math.min(listing, discounted));
}

/**
 * Apply the SAME Haggling discount percent to snapshotted Nova, then quantize
 * with the authoritative Nova half-unit helper. Do not roll a second discount.
 */
export function applyHaggleDiscountToNova(novaCost, discountPercent) {
  const nova = Number(novaCost) || 0;
  if (!(nova > 0)) return 0;
  const pct = clampHaggleDiscountPercent(discountPercent);
  const discounted = nova * (PERCENT_DENOMINATOR - pct) / PERCENT_DENOMINATOR;
  return quantizeNova(discounted);
}

/** Success chance from the offer's snapshotted Nova — do not reroll surcharge. */
export function marketHaggleSuccessChance(snapshottedNovaCost) {
  return Number(snapshottedNovaCost) > 0
    ? MARKET_HAGGLE_SUCCESS_CHANCE_NOVA
    : MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD;
}

export function resolveMarketHaggle(rng, snapshottedNovaCost = 0) {
  const r = requireRng(rng, "resolveMarketHaggle");
  const chance = marketHaggleSuccessChance(snapshottedNovaCost);
  if (!(unitHalfOpen(r) < chance)) {
    return { success: false, discountPercent: 0 };
  }
  return { success: true, discountPercent: rollHaggleDiscountPercent(r) };
}

/**
 * Counted free or paid manual refreshes. Auto 19:00/07:00 UTC does not count.
 * Returns next counter (0..TRIGGER-1) and whether this increment fired Contraband.
 */
export function readContrabandManualRefreshCount(meta) {
  return Math.max(
    0,
    Math.floor(
      Number(
        meta?.contraband_manual_refresh_count
        ?? meta?.contraband_free_refresh_count
        ?? meta?.hot_manual_refresh_count
        ?? 0,
      ) || 0,
    ),
  );
}

export function nextContrabandManualRefreshState(currentCount) {
  const next = Math.max(0, Math.floor(Number(currentCount) || 0)) + 1;
  if (next >= CONTRABAND_MANUAL_REFRESH_TRIGGER) {
    return {
      count: next % CONTRABAND_MANUAL_REFRESH_TRIGGER,
      triggered: true,
    };
  }
  return { count: next, triggered: false };
}

/** @deprecated Use nextContrabandManualRefreshState. */
export function nextContrabandFreeRefreshState(currentCount) {
  return nextContrabandManualRefreshState(currentCount);
}

export function contrabandTriggersFromManualRefreshCount(countedManualRefreshes) {
  return Math.floor(
    Math.max(0, Math.floor(Number(countedManualRefreshes) || 0))
    / CONTRABAND_MANUAL_REFRESH_TRIGGER,
  );
}

/** @deprecated Use contrabandTriggersFromManualRefreshCount. */
export function contrabandTriggersFromFreeRefreshCount(counted) {
  return contrabandTriggersFromManualRefreshCount(counted);
}
