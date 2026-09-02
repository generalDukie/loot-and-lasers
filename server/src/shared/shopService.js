/**
 * Shop presentation + vendor partitioning (Phase 6 Black Market + Contraband Loot).
 * Generation/pricing: src/lib/blackMarket.js + productionMath/market.js.
 * Purchases: economy.js BuyShop*.
 */
import {
  SHOP_REFRESH_COST,
  HOT_DEAL_REFRESH_COUNT,
  getShopWindow,
  getShopGameDayKey,
  SHOP_GEAR_RARITY_WEIGHTS,
  HOT_DEAL_RARITY_WEIGHTS,
  SHOP_SLOT_COUNT,
  SHOP_GEAR_CHANCE,
  SHOP_STIM_CHANCE,
  SHOP_MIN_STIMS,
} from "./economyFormulas.js";
import {
  CONTRABAND_MANUAL_REFRESH_TRIGGER,
  MARKET_HAGGLE_DISCOUNT_MAX_PERCENT,
  MARKET_HAGGLE_DISCOUNT_MIN_PERCENT,
  MARKET_HAGGLE_SUCCESS_CHANCE_NOVA,
  MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD,
  MARKET_PAID_REFRESH_NOVA,
  MARKET_RARITY_WEIGHTS,
  CONTRABAND_RARITY_WEIGHTS,
  quantizeNova,
  readContrabandManualRefreshCount,
} from "./productionMath.js";
import { contrabandWindowAt } from "../../../src/lib/productionMath/market.js";
import { omitPricingQualityFromPresentation } from "../../../src/lib/gearPricingQuality.js";
import { clock } from "./time/index.js";

export const SHOP_AUTHORITY_MAP = Object.freeze({
  GenerateShopInventory: "blackMarket.generateNormalMarketOffers + EnsureShop",
  GenerateGearInventory: "blackMarket.generateNormalMarketOffers (gear slots)",
  GenerateStimInventory: "blackMarket.generateNormalMarketOffers (stim slots, T18 level band)",
  GenerateContrabandLoot: "blackMarket.generateContrabandOffer",
  CalculateShopPrices: "gearQualityListPrice / stimShopPriceResolved / resolveNovaSurcharge",
  PurchaseShopItem: "BuyShopGear / BuyShopConsumable",
  ValidatePurchase: "assertShopPurchaseClientSafe + BuyShop* guards",
  RefreshInventory: "RefreshShop + marketWindowAt UTC 19:00/07:00",
  SerializeInventory: "shopService.serializeShopPresentation",
  RecoverPurchase: "wallet_operations getWalletOperation replay",
});

export const SHOP_VENDOR_GEAR = "gear";
export const SHOP_VENDOR_SUPPLY = "supply";
export const SHOP_CURRENCY_STARDUST = "stardust";
export const SHOP_CURRENCY_NOVA = "nova";

export const HAGGLE_SUCCESS_CHANCE = MARKET_HAGGLE_SUCCESS_CHANCE_STANDARD;
export const HAGGLE_SUCCESS_CHANCE_NOVA = MARKET_HAGGLE_SUCCESS_CHANCE_NOVA;
export const HAGGLE_DISCOUNT_MIN_PCT = MARKET_HAGGLE_DISCOUNT_MIN_PERCENT;
export const HAGGLE_DISCOUNT_MAX_PCT = MARKET_HAGGLE_DISCOUNT_MAX_PERCENT;

export {
  SHOP_REFRESH_COST,
  HOT_DEAL_REFRESH_COUNT,
  SHOP_GEAR_RARITY_WEIGHTS,
  HOT_DEAL_RARITY_WEIGHTS,
  SHOP_SLOT_COUNT,
  SHOP_GEAR_CHANCE,
  SHOP_STIM_CHANCE,
  SHOP_MIN_STIMS,
  getShopWindow,
  getShopGameDayKey,
};

export function isStimOffer(slot) {
  if (!slot || typeof slot !== "object") return false;
  return slot.type === "consumable" || slot._offerKind === "stim";
}

export function isGearOffer(slot) {
  return !!slot && !isStimOffer(slot);
}

export function shopStockFromMeta(meta) {
  if (Array.isArray(meta?.shop_stock) && meta.shop_stock.length) return meta.shop_stock;
  if (Array.isArray(meta?.gear_stock) && meta.gear_stock.length) return meta.gear_stock;
  return [];
}

export function offerPricing(slot) {
  const base = Math.max(0, Math.round(Number(slot?.haggle_base_cost ?? slot?.cost ?? slot?._cost) || 0));
  const finalPrice = Math.max(0, Math.round(Number(slot?.cost ?? slot?._cost) || 0));
  const discount = Math.max(0, base - finalPrice);
  return {
    base_price: base,
    discount,
    final_price: finalPrice,
    currency: SHOP_CURRENCY_STARDUST,
    nova_cost: quantizeNova(Math.max(0, Number(slot?.nova_cost) || 0)),
  };
}

export function serializeShopOffer(slot, meta = {}, { isHot = false } = {}) {
  if (!slot || typeof slot !== "object") return null;
  const shopItemId = String(slot._slotId || slot.shop_item_id || "");
  const pricing = offerPricing(slot);
  const stim = isStimOffer(slot);
  const vendor = isHot || !stim ? SHOP_VENDOR_GEAR : SHOP_VENDOR_SUPPLY;
  const soldOut = isHot
    ? !!(meta.hot_purchased || meta.hot_yanked)
    : !!(meta.purchased?.[shopItemId] || meta.yanked?.[shopItemId] || slot.yanked);
  const yanked = isHot ? !!meta.hot_yanked : !!(meta.yanked?.[shopItemId] || slot.yanked);
  const haggleAttempted = !!slot.haggle_attempted || Math.max(0, Math.round(Number(slot.haggle_discount_pct) || 0)) > 0
    || slot.haggle_success === false && slot.haggle_attempted;
  const hagglePct = Math.max(0, Math.round(Number(slot.haggle_discount_pct) || 0));
  const haggleEligible = !stim && !slot._bundle && !soldOut && !yanked && !slot.haggle_attempted
    && hagglePct <= 0
    && slot.haggle_eligible !== false
    && !isHot
    && !slot._hotDeal
    && !slot.contraband;

  return {
    shop_item_id: shopItemId,
    generated_item_id: slot.instance_id || slot.id || null,
    vendor,
    vendor_id: vendor,
    ...pricing,
    hot_deal: !!(isHot || slot._hotDeal || slot.contraband),
    contraband: !!(isHot || slot.contraband || slot._hotDeal),
    sold_out: soldOut,
    yanked,
    purchased: isHot ? !!meta.hot_purchased : !!meta.purchased?.[shopItemId],
    refresh_id: meta.window_idx ?? slot.refresh_id ?? null,
    generation_id: slot.generation_id || null,
    haggle_discount_pct: hagglePct,
    haggle_attempted: !!slot.haggle_attempted || haggleAttempted,
    haggle_success: !!slot.haggle_success,
    haggle_eligible: haggleEligible,
    offer_kind: stim ? "stim" : "gear",
    item: omitPricingQualityFromPresentation(slot),
    cost: pricing.final_price,
    _slotId: shopItemId,
    _offerKind: stim ? "stim" : "gear",
    _hotDeal: !!(isHot || slot._hotDeal || slot.contraband),
    nova_cost: pricing.nova_cost,
    name: slot.name,
    type: slot.type,
    rarity: slot.rarity,
    level_requirement: slot.level_requirement ?? slot.level,
    stats: slot.stats || {},
    flavor_text: slot.flavor_text || "",
    consumable: slot.consumable || null,
    sell_value: slot.sell_value,
    manufacturer: slot.manufacturer ?? null,
    origin: slot.origin ?? null,
    shipment_eligible: slot.shipment_eligible === true,
  };
}

export function serializeShopVendors(meta) {
  const stock = shopStockFromMeta(meta);
  const gearItems = [];
  const supplyItems = [];
  for (const slot of stock) {
    const row = serializeShopOffer(slot, meta, { isHot: false });
    if (!row) continue;
    if (row.vendor === SHOP_VENDOR_SUPPLY) supplyItems.push(row);
    else gearItems.push(row);
  }

  let hot = null;
  const contraband = meta?.hot_deal || meta?.contraband_offer;
  if (contraband) {
    hot = serializeShopOffer(contraband, meta, { isHot: true });
  }

  return {
    gear: {
      id: SHOP_VENDOR_GEAR,
      name: "Gear Vendor",
      description: "Persistent Black Market gear stalls + Contraband Loot",
      items: gearItems,
      hot_deal: hot,
      contraband_loot: hot,
    },
    supply: {
      id: SHOP_VENDOR_SUPPLY,
      name: "Supply Vendor",
      description: "Stims from the same Market refresh window",
      items: supplyItems,
      hot_deal: null,
      contraband_loot: null,
    },
  };
}

export function serializeShopPresentation(meta, win = getShopWindow(), nowMs = clock.nowMs()) {
  const contra = contrabandWindowAt(nowMs);
  const freeUsed = !!meta?.free_refresh_used;
  return {
    shop_meta: meta,
    shop_window: {
      idx: win.idx,
      startsAt: win.startsAt,
      endsAt: win.endsAt,
      secondsLeft: win.secondsLeft,
      rotationPeriodId: win.rotationPeriodId,
      day_key: getShopGameDayKey(nowMs),
    },
    contraband_window: {
      period_id: contra.period_id,
      startsAt: contra.startsAt,
      endsAt: contra.endsAt,
      secondsLeft: contra.secondsLeft,
    },
    vendors: serializeShopVendors(meta),
    refresh: {
      cost_nova: MARKET_PAID_REFRESH_NOVA,
      free_available: !freeUsed,
      free_refresh_used: freeUsed,
      manual_refresh_count: Math.max(0, Math.floor(meta?.market_generation_seq || meta?.manual_refresh_count || 0)),
      paid_refresh_count: Math.max(0, Math.floor(meta?.paid_refresh_count || 0)),
      hot_deal_refresh_every: CONTRABAND_MANUAL_REFRESH_TRIGGER,
      hot_manual_refresh_count: readContrabandManualRefreshCount(meta),
      contraband_manual_refresh_count: readContrabandManualRefreshCount(meta),
      contraband_free_refresh_count: readContrabandManualRefreshCount(meta),
      contraband_trigger: CONTRABAND_MANUAL_REFRESH_TRIGGER,
    },
    haggle: {
      success_chance: HAGGLE_SUCCESS_CHANCE,
      success_chance_standard: HAGGLE_SUCCESS_CHANCE,
      success_chance_nova: HAGGLE_SUCCESS_CHANCE_NOVA,
      discount_min_pct: HAGGLE_DISCOUNT_MIN_PCT,
      discount_max_pct: HAGGLE_DISCOUNT_MAX_PCT,
      note: "One attempt per normal Gear offer. 40% without Nova / 30% with a Nova surcharge. Success applies the same 10–20% discount to Stardust and Nova. Failure yanks the listing.",
    },
    rarity: {
      gear: { ...MARKET_RARITY_WEIGHTS },
      contraband: { ...CONTRABAND_RARITY_WEIGHTS },
      hot_deal: { ...CONTRABAND_RARITY_WEIGHTS },
    },
  };
}

export const SHOP_PURCHASE_FORBIDDEN_CLIENT_FIELDS = Object.freeze([
  "cost",
  "price",
  "stardust",
  "stardust_cost",
  "nova",
  "nova_cost",
  "nova_crystals",
  "discount",
  "final_price",
  "base_price",
  "currency",
  "sell_value",
  "item",
  "items",
  "balance",
  "rarity",
  "item_level",
  "level_requirement",
  "manufacturer",
  "haggle_discount_pct",
  "haggle_success",
  "haggle_eligible",
  "haggle_attempted",
  "haggle_failed",
  "haggle_discount",
  "discount_percent",
  "yanked",
  "pricing_quality_score",
  "pricing_quality_raw",
  "pricing_quality_percentile",
  "pricing_quality_multiplier_bps",
  "pricing_quality_class",
  "pricing_quality_stat_budget_level",
  "pricing_quality_rules_version",
  "pricing_quality_fallback",
  "acquisition_stardust_paid",
]);

export function detectSuspiciousShopPurchaseFields(body) {
  if (!body || typeof body !== "object") return [];
  return SHOP_PURCHASE_FORBIDDEN_CLIENT_FIELDS.filter((k) => body[k] != null);
}

export function assertShopPurchaseClientSafe(body) {
  const bad = detectSuspiciousShopPurchaseFields(body);
  if (bad.length) {
    const err = new Error(`Client must not supply purchase fields: ${bad.join(", ")}`);
    err.status = 400;
    err.code = "SHOP_PRICE_TAMPER";
    throw err;
  }
}

export function shopMetaHasStock(meta) {
  return (
    (Array.isArray(meta?.shop_stock) && meta.shop_stock.length > 0) ||
    (Array.isArray(meta?.gear_stock) && meta.gear_stock.length > 0)
  );
}

export function shopMetaHasContraband(meta) {
  return !!(meta?.hot_deal || meta?.contraband_offer);
}
