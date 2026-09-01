/**
 * Phase 6 live Black Market + Contraband Loot generation.
 * Production math lives in productionMath/market.js; this module snapshots offers.
 */
import { GenerateGearItem } from "./itemGeneration.js";
import {
  blackMarketBasePrice,
  blackMarketPrice,
  CONTRABAND_OFFER_COUNT,
  GEAR_ORIGIN_CONTRABAND,
  GEAR_ORIGIN_MARKET,
  gearResaleValue,
  MARKET_MIN_STIM_OFFERS,
  MARKET_NORMAL_SLOT_COUNT,
  MARKET_OFFER_KIND_GEAR,
  MARKET_OFFER_KIND_STIM,
  MARKET_PAID_REFRESH_NOVA,
  stimSellValueResolved,
  stimShopPriceResolved,
} from "./productionMath/index.js";
import {
  applyHaggleDiscountToNova,
  applyHaggleDiscountToPrice,
  companiesForSlot,
  contrabandPeriodId,
  contrabandWindowAt,
  marketStimTier,
  marketWindowAt,
  nextContrabandFreeRefreshState,
  nextContrabandManualRefreshState,
  readContrabandManualRefreshCount,
  resolveMarketHaggle,
  resolveNovaSurcharge,
  rollContrabandRarity,
  rollManufacturerForSlot,
  rollMarketGearItemLevel,
  rollMarketGearRarity,
  rollMarketGearSlot,
  rollMarketPriceVariance,
  rollMarketStimAttribute,
  rollNormalMarketOfferKinds,
  stimBonusMultiplier,
} from "./productionMath/market.js";
import { resolveOfferIntrinsicQuality } from "./gearIntrinsicQuality.js";

export const BLACK_MARKET_RULES_VERSION = "phase6-intrinsic-quality-v4";

const MULBERRY_INCREMENT = 0x6D2B79F5;
const UINT32_DIVISOR = 4294967296;
const SEED_SHIFT_15 = 15;
const SEED_SHIFT_7 = 7;
const SEED_SHIFT_14 = 14;
const MULBERRY_MIX_61 = 61;

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + MULBERRY_INCREMENT) | 0;
    let t = Math.imul(a ^ (a >>> SEED_SHIFT_15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> SEED_SHIFT_7), MULBERRY_MIX_61 | t)) ^ t;
    return ((t ^ (t >>> SEED_SHIFT_14)) >>> 0) / UINT32_DIVISOR;
  };
}

function requireRng(rng, label) {
  if (typeof rng !== "function") {
    throw new Error(`${label} requires injected RNG`);
  }
  return rng;
}

function defaultCreateGear({
  rarity,
  itemLevel,
  slot,
  origin,
  manufacturer,
  className,
  rng,
}) {
  return GenerateGearItem({
    itemLevel,
    itemType: slot,
    rarity,
    rng,
    className,
    origin,
    manufacturer,
    shipmentEligible: false,
  });
}

function capitalizeStimStat(stat) {
  const key = String(stat || "strength");
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function stimPayload({ rarity, stat, economicLevel, origin }) {
  const key = String(stat || "strength").toLowerCase();
  const rarityKey = String(rarity || "uncommon").toLowerCase();
  const label = rarityKey.charAt(0).toUpperCase() + rarityKey.slice(1);
  const statName = capitalizeStimStat(key);
  return {
    name: `${label} ${statName} Stim`,
    type: "consumable",
    rarity: rarityKey,
    level_requirement: economicLevel,
    level: economicLevel,
    stats: {},
    origin,
    shipment_eligible: false,
    manufacturer: null,
    sell_value: stimSellValueResolved(economicLevel, rarityKey),
    consumable: {
      stat: key,
      tier: rarityKey,
      mult: stimBonusMultiplier(rarityKey),
    },
  };
}

function snapshotGearOffer({
  item,
  slotId,
  origin,
  isContraband,
  generationId,
  windowIdx,
  rng,
  className = null,
  priceVariance = null,
  qualityReferenceLevel = null,
}) {
  const r = requireRng(rng, "snapshotGearOffer");
  const slot = item.type;
  const rarity = String(item.rarity || "").toLowerCase();
  const itemLevel = Math.max(1, Math.floor(Number(item.level_requirement ?? item.level) || 1));
  const referenceLevel = Math.max(
    1,
    Math.floor(Number(qualityReferenceLevel ?? itemLevel) || 1),
  );
  const variance = rollMarketPriceVariance(r, priceVariance);
  const baseMarketValue = blackMarketBasePrice(itemLevel, slot, rarity);
  const stardustPrice = blackMarketPrice(itemLevel, slot, rarity, variance);
  const vendorValue = gearResaleValue(itemLevel, slot, rarity);
  const quality = resolveOfferIntrinsicQuality({
    item,
    className,
    referenceLevel,
  });
  const novaCost = resolveNovaSurcharge(rarity, quality.percentile, r(), r());
  const manufacturer = item.manufacturer || null;
  return {
    ...item,
    origin,
    manufacturer,
    shipment_eligible: false,
    sell_value: vendorValue,
    _slotId: slotId,
    shop_item_id: slotId,
    _offerKind: MARKET_OFFER_KIND_GEAR,
    _hotDeal: !!isContraband,
    contraband: !!isContraband,
    cost: stardustPrice,
    _cost: stardustPrice,
    nova_cost: novaCost,
    base_market_value: baseMarketValue,
    price_variance: variance,
    budget_quality: quality.budgetQuality,
    distribution_quality: quality.distributionQuality,
    intrinsic_quality: quality.intrinsicQuality,
    intrinsic_quality_percentile: quality.percentile,
    intrinsic_quality_band: quality.band,
    intrinsic_quality_band_id: quality.bandId,
    desirable_stat_share: quality.desirableStatShare,
    off_stat_avoidance: quality.offStatAvoidance,
    discretionary_off_stat_avoidance: quality.discretionaryOffStatAvoidance,
    pv_balance: quality.primaryVitalityBalance,
    luck_suitability: quality.luckSuitability,
    quality_reference_level: quality.referenceLevel,
    quality_reference_budget: quality.referenceBudget,
    haggle_eligible: !isContraband,
    haggle_attempted: false,
    haggle_success: false,
    haggle_discount_pct: 0,
    haggle_base_cost: stardustPrice,
    haggle_base_nova: novaCost,
    yanked: false,
    generation_id: generationId,
    refresh_id: windowIdx,
    rules_version: BLACK_MARKET_RULES_VERSION,
  };
}

function snapshotStimOffer({
  rarity,
  stat,
  economicLevel,
  slotId,
  origin,
  generationId,
  windowIdx,
}) {
  const price = stimShopPriceResolved(economicLevel, rarity);
  const item = stimPayload({ rarity, stat, economicLevel, origin });
  return {
    ...item,
    sell_value: item.sell_value,
    _slotId: slotId,
    shop_item_id: slotId,
    _offerKind: MARKET_OFFER_KIND_STIM,
    _hotDeal: false,
    contraband: false,
    cost: price,
    _cost: price,
    nova_cost: 0,
    base_market_value: price,
    price_variance: 1,
    intrinsic_quality_percentile: null,
    haggle_eligible: false,
    haggle_attempted: false,
    haggle_success: false,
    haggle_discount_pct: 0,
    haggle_base_cost: price,
    haggle_base_nova: 0,
    yanked: false,
    generation_id: generationId,
    refresh_id: windowIdx,
    rules_version: BLACK_MARKET_RULES_VERSION,
    economic_level: economicLevel,
  };
}

export function generateNormalMarketOffers({
  playerLevel,
  className = null,
  rng,
  createGear = defaultCreateGear,
  generationId,
  windowIdx = null,
} = {}) {
  const r = requireRng(rng, "generateNormalMarketOffers");
  const L = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const { kinds, safeguardIndex, stimCountBeforeSafeguard } = rollNormalMarketOfferKinds(r);
  const offers = [];
  for (let i = 0; i < MARKET_NORMAL_SLOT_COUNT; i++) {
    const slotId = `${generationId}-n${i}`;
    if (kinds[i] === MARKET_OFFER_KIND_STIM) {
      const rarity = marketStimTier(L);
      const stat = rollMarketStimAttribute(r);
      offers.push(snapshotStimOffer({
        rarity,
        stat,
        economicLevel: L,
        slotId,
        origin: GEAR_ORIGIN_MARKET,
        generationId,
        windowIdx,
      }));
      continue;
    }
    const slot = rollMarketGearSlot(r);
    const rarity = rollMarketGearRarity(r);
    const itemLevel = rollMarketGearItemLevel(L, r);
    const manufacturer = rollManufacturerForSlot(slot, r);
    const item = createGear({
      rarity,
      itemLevel,
      slot,
      origin: GEAR_ORIGIN_MARKET,
      manufacturer,
      className,
      rng: r,
    });
    offers.push(snapshotGearOffer({
      item: { ...item, manufacturer, origin: GEAR_ORIGIN_MARKET },
      slotId,
      origin: GEAR_ORIGIN_MARKET,
      isContraband: false,
      generationId,
      windowIdx,
      rng: r,
      className,
      qualityReferenceLevel: L,
    }));
  }
  return {
    offers,
    safeguardIndex,
    stimCountBeforeSafeguard,
    stimCount: offers.filter((o) => o._offerKind === MARKET_OFFER_KIND_STIM).length,
  };
}

export function generateContrabandOffer({
  playerLevel,
  className = null,
  rng,
  createGear = defaultCreateGear,
  generationId,
  windowIdx = null,
  periodId = null,
} = {}) {
  const r = requireRng(rng, "generateContrabandOffer");
  const L = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const slot = rollMarketGearSlot(r);
  const rarity = rollContrabandRarity(r);
  const manufacturer = rollManufacturerForSlot(slot, r);
  const item = createGear({
    rarity,
    itemLevel: L,
    slot,
    origin: GEAR_ORIGIN_CONTRABAND,
    manufacturer,
    className,
    rng: r,
  });
  const offer = snapshotGearOffer({
    item: { ...item, manufacturer, origin: GEAR_ORIGIN_CONTRABAND },
    slotId: `${generationId}-contraband`,
    origin: GEAR_ORIGIN_CONTRABAND,
    isContraband: true,
    generationId,
    windowIdx,
    rng: r,
    className,
    qualityReferenceLevel: L,
  });
  offer.contraband_period_id = periodId;
  void CONTRABAND_OFFER_COUNT;
  return offer;
}

export function isOfferHaggleEligible(offer) {
  if (!offer || typeof offer !== "object") return false;
  if (offer._offerKind === MARKET_OFFER_KIND_STIM || offer.type === "consumable") return false;
  if (offer._bundle) return false;
  if (offer._hotDeal || offer.contraband || offer.origin === GEAR_ORIGIN_CONTRABAND) return false;
  if (offer.yanked) return false;
  if (offer.haggle_attempted) return false;
  if (offer.haggle_eligible === false) return false;
  return true;
}

export function applyOfferHaggle(offer, rng) {
  if (!offer || typeof offer !== "object") {
    return { ok: false, code: "SHOP_OFFER_MISSING" };
  }
  if (offer.haggle_attempted || offer.yanked) {
    return { ok: false, code: "SHOP_ALREADY_HAGGLED" };
  }
  if (!isOfferHaggleEligible(offer)) {
    return { ok: false, code: "SHOP_HAGGLE_INELIGIBLE" };
  }
  const listing = Number(offer.haggle_base_cost ?? offer.cost) || 0;
  const snapNova = Number(offer.haggle_base_nova ?? offer.nova_cost) || 0;
  const vendor = Number(offer.sell_value) || 0;
  const outcome = resolveMarketHaggle(rng, snapNova);
  if (!outcome.success) {
    return {
      ok: true,
      success: false,
      yanked: true,
      offer: {
        ...offer,
        haggle_attempted: true,
        haggle_success: false,
        haggle_eligible: false,
        haggle_discount_pct: 0,
        haggle_base_cost: listing,
        haggle_base_nova: snapNova,
        yanked: true,
        cost: listing,
        _cost: listing,
        nova_cost: snapNova,
      },
    };
  }
  const nextPrice = applyHaggleDiscountToPrice(listing, vendor, outcome.discountPercent);
  const nextNova = applyHaggleDiscountToNova(snapNova, outcome.discountPercent);
  return {
    ok: true,
    success: true,
    yanked: false,
    discountPercent: outcome.discountPercent,
    offer: {
      ...offer,
      haggle_attempted: true,
      haggle_success: true,
      haggle_eligible: false,
      haggle_discount_pct: outcome.discountPercent,
      haggle_base_cost: listing,
      haggle_base_nova: snapNova,
      yanked: false,
      cost: nextPrice,
      _cost: nextPrice,
      nova_cost: nextNova,
    },
  };
}

export function shopGenerationId(windowIdx, refreshSeq, extra = 0) {
  return `m${Number(windowIdx) || 0}-r${Number(refreshSeq) || 0}-x${Number(extra) || 0}`;
}

export function emptyPurchasedMap() {
  return {};
}

export function normalizeMarketMeta(prev = {}, win, contrabandPeriod) {
  const windowIdx = win?.idx;
  const sameWindow = prev.window_idx === windowIdx;
  const prevPeriod = prev.contraband_period_id || prev.hot_day || null;
  const sameContraband = prevPeriod == null || prevPeriod === contrabandPeriod;
  const manualCount = readContrabandManualRefreshCount(prev);
  const generationSeq = Math.max(0, Math.floor(Number(prev.market_generation_seq) || 0));
  const paidSeq = Math.max(0, Math.floor(Number(prev.paid_refresh_count) || 0));
  if (!sameWindow) {
    return {
      window_idx: windowIdx,
      market_window_starts_at: win?.startsAt ?? null,
      contraband_period_id: sameContraband ? (prev.contraband_period_id || contrabandPeriod) : contrabandPeriod,
      free_refresh_used: false,
      market_generation_seq: generationSeq,
      paid_refresh_count: paidSeq,
      contraband_manual_refresh_count: manualCount,
      contraband_free_refresh_count: manualCount,
      hot_manual_refresh_count: manualCount,
      purchased: emptyPurchasedMap(),
      yanked: {},
      shop_stock: sameWindow ? prev.shop_stock : null,
      gear_stock: null,
      cons_stock: null,
      hot_deal: sameContraband ? prev.hot_deal : null,
      hot_day: sameContraband ? (prev.hot_day || contrabandPeriod) : contrabandPeriod,
      hot_purchased: sameContraband ? !!prev.hot_purchased : false,
      hot_yanked: false,
      rules_version: BLACK_MARKET_RULES_VERSION,
    };
  }
  return {
    window_idx: windowIdx,
    market_window_starts_at: prev.market_window_starts_at ?? win?.startsAt ?? null,
    contraband_period_id: sameContraband ? (prev.contraband_period_id || contrabandPeriod) : contrabandPeriod,
    free_refresh_used: !!prev.free_refresh_used,
    market_generation_seq: generationSeq,
    paid_refresh_count: paidSeq,
    contraband_manual_refresh_count: manualCount,
    contraband_free_refresh_count: manualCount,
    hot_manual_refresh_count: manualCount,
    purchased: prev.purchased && typeof prev.purchased === "object" ? { ...prev.purchased } : {},
    yanked: prev.yanked && typeof prev.yanked === "object" ? { ...prev.yanked } : {},
    shop_stock: prev.shop_stock,
    gear_stock: prev.gear_stock,
    cons_stock: prev.cons_stock,
    hot_deal: sameContraband ? prev.hot_deal : null,
    hot_day: sameContraband ? (prev.hot_day || contrabandPeriod) : contrabandPeriod,
    hot_purchased: sameContraband ? !!prev.hot_purchased : false,
    hot_yanked: false,
    rules_version: BLACK_MARKET_RULES_VERSION,
  };
}

export function withNormalStock(meta, offers, win) {
  return {
    ...meta,
    window_idx: win?.idx ?? meta.window_idx,
    shop_stock: offers,
    gear_stock: offers,
    cons_stock: offers.filter((s) => s._offerKind === MARKET_OFFER_KIND_STIM),
    purchased: emptyPurchasedMap(),
    yanked: {},
  };
}

export function withContrabandStock(meta, offer, periodId) {
  return {
    ...meta,
    hot_deal: offer,
    contraband_offer: offer,
    contraband_period_id: periodId,
    hot_day: periodId,
    hot_purchased: false,
    hot_yanked: false,
  };
}

export {
  companiesForSlot,
  contrabandPeriodId,
  contrabandWindowAt,
  marketWindowAt,
  MARKET_MIN_STIM_OFFERS,
  MARKET_NORMAL_SLOT_COUNT,
  MARKET_PAID_REFRESH_NOVA,
  nextContrabandManualRefreshState,
  nextContrabandFreeRefreshState,
  readContrabandManualRefreshCount,
};
