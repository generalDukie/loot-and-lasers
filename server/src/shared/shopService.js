/**
 * Shop presentation + vendor partitioning (Restoration 12A/12C).
 * Generation/pricing remain in economyFormulas.js; purchases in economy.js.
 *
 * Recovered product model: one persistent Black Market with mixed gear+stim stalls
 * and a separate Hot Deal spotlight. Logical Gear / Supply vendor views are
 * derived from that stock for Prompt 12A serialization — not separate generators.
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

/**
 * Conceptual responsibility → authoritative implementation (Restoration 12C).
 * Exactly one live owner each; client/Nakama duplicates are isolated.
 */
export const SHOP_AUTHORITY_MAP = Object.freeze({
  GenerateShopInventory: "economyFormulas.generateSimpleShopStock + EnsureShop",
  GenerateGearInventory: "economyFormulas.generateSimpleGearSlot (via generateSimpleShopStock)",
  GenerateStimInventory: "economyFormulas.generateShopStimSlot / randomConsumable (via stock)",
  GenerateHotDeals: "economyFormulas.generateSimpleHotDeal",
  CalculateShopPrices: "gearShopPurchasePrice / stimShopPurchasePrice / computeNovaCrystalCost",
  PurchaseShopItem: "BuyShopGear / BuyShopConsumable",
  ValidatePurchase: "assertShopPurchaseClientSafe + BuyShop* guards",
  RefreshInventory: "RefreshShop + normalizeShopMeta window rotation",
  SerializeInventory: "shopService.serializeShopPresentation",
  RecoverPurchase: "wallet_operations getWalletOperation replay",
});

export const SHOP_VENDOR_GEAR = "gear";
export const SHOP_VENDOR_SUPPLY = "supply";
export const SHOP_CURRENCY_STARDUST = "stardust";
export const SHOP_CURRENCY_NOVA = "nova";

/** Haggle rules (purchase-time roll; does not mutate persisted listing price). */
export const HAGGLE_SUCCESS_CHANCE = 0.4;
export const HAGGLE_DISCOUNT_MIN_PCT = 15;
export const HAGGLE_DISCOUNT_MAX_PCT = 20;

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

/**
 * Persist-compatible offer pricing fields.
 * Recovered Black Market stores final listing as `cost` (variance baked at generation).
 * Hot Deal uses a better rarity table, not a separate persisted % discount.
 */
export function offerPricing(slot) {
  const base = Math.max(0, Math.round(Number(slot?.cost ?? slot?._cost) || 0));
  const discount = Math.max(0, Math.round(Number(slot?.discount) || 0));
  const finalPrice = Math.max(0, base - discount);
  return {
    base_price: base,
    discount,
    final_price: finalPrice,
    currency: SHOP_CURRENCY_STARDUST,
    nova_cost: Math.max(0, Math.round(Number(slot?.nova_cost) || 0)),
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
    : !!(meta.purchased?.[shopItemId] || meta.yanked?.[shopItemId]);
  const yanked = isHot ? !!meta.hot_yanked : !!meta.yanked?.[shopItemId];

  return {
    shop_item_id: shopItemId,
    generated_item_id: slot.instance_id || slot.id || null,
    vendor,
    vendor_id: vendor,
    ...pricing,
    hot_deal: !!(isHot || slot._hotDeal),
    sold_out: soldOut,
    yanked,
    purchased: isHot ? !!meta.hot_purchased : !!meta.purchased?.[shopItemId],
    refresh_id: meta.window_idx ?? null,
    haggle_eligible: !stim && !slot._bundle,
    offer_kind: stim ? "stim" : "gear",
    // Keep authoritative listing payload for clients that already read cost/_slotId.
    item: slot,
    cost: pricing.final_price,
    _slotId: shopItemId,
    _offerKind: stim ? "stim" : "gear",
    _hotDeal: !!(isHot || slot._hotDeal),
    nova_cost: pricing.nova_cost,
    name: slot.name,
    type: slot.type,
    rarity: slot.rarity,
    level_requirement: slot.level_requirement ?? slot.level,
    stats: slot.stats || {},
    flavor_text: slot.flavor_text || "",
    consumable: slot.consumable || null,
    sell_value: slot.sell_value,
  };
}

/**
 * Logical Gear Vendor + Supply Vendor views over unified Black Market stock.
 * Hot Deal is attached to Gear Vendor as a featured offer (not a 9th stall).
 */
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
  if (meta?.hot_deal) {
    hot = serializeShopOffer(meta.hot_deal, meta, { isHot: true });
  }

  return {
    gear: {
      id: SHOP_VENDOR_GEAR,
      name: "Gear Vendor",
      description: "Persistent Black Market gear stalls + Hot Deal spotlight",
      items: gearItems,
      hot_deal: hot,
    },
    supply: {
      id: SHOP_VENDOR_SUPPLY,
      name: "Supply Vendor",
      description: "Stims and utility consumables from the same refresh window",
      items: supplyItems,
      hot_deal: null,
    },
  };
}

export function serializeShopPresentation(meta, win = getShopWindow()) {
  return {
    shop_meta: meta,
    shop_window: {
      idx: win.idx,
      startsAt: win.startsAt,
      endsAt: win.endsAt,
      secondsLeft: win.secondsLeft,
      rotationPeriodId: win.rotationPeriodId,
      day_key: getShopGameDayKey(),
    },
    vendors: serializeShopVendors(meta),
    refresh: {
      cost_nova: SHOP_REFRESH_COST,
      free_available: false,
      free_refresh_used: true,
      manual_refresh_count: Math.max(0, Math.floor(meta?.manual_refresh_count || 0)),
      hot_deal_refresh_every: HOT_DEAL_REFRESH_COUNT,
      hot_manual_refresh_count: Math.max(0, Math.floor(meta?.hot_manual_refresh_count || 0)),
    },
    haggle: {
      success_chance: HAGGLE_SUCCESS_CHANCE,
      discount_min_pct: HAGGLE_DISCOUNT_MIN_PCT,
      discount_max_pct: HAGGLE_DISCOUNT_MAX_PCT,
      note: "Rolled at purchase; failure yanks listing; does not regenerate stock",
    },
    rarity: {
      gear: { ...SHOP_GEAR_RARITY_WEIGHTS },
      hot_deal: { ...HOT_DEAL_RARITY_WEIGHTS },
    },
  };
}

/** Client must never supply settlement fields (Restoration 12B). */
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

/** True when meta has a usable stock array for the current window. */
export function shopMetaHasStock(meta) {
  return (
    (Array.isArray(meta?.shop_stock) && meta.shop_stock.length > 0) ||
    (Array.isArray(meta?.gear_stock) && meta.gear_stock.length > 0)
  );
}
