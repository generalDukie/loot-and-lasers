/**
 * Trusted product → entitlement grant mappings.
 * Clients never choose which entitlements a product unlocks.
 */

export const PRODUCT_MAPPINGS = Object.freeze({
  // Internal Nova purchases (already paid via in-game currency)
  "nova.character_slot": {
    productId: "nova.character_slot",
    provider: "internal_nova",
    displayName: "Character Slot (Nova)",
    version: 1,
    grants: [{ entitlementKey: "account.character_slot", quantity: 1 }],
  },
  "nova.rename_token": {
    productId: "nova.rename_token",
    provider: "internal_nova",
    displayName: "Rename Token (Nova)",
    version: 1,
    grants: [{ entitlementKey: "account.rename_token", quantity: 1 }],
  },
  // Future Stripe / web packages (verification required before grant)
  "stripe.founder_pack_deluxe": {
    productId: "stripe.founder_pack_deluxe",
    provider: "stripe",
    displayName: "Founder Pack Deluxe",
    version: 1,
    requiresExternalVerification: true,
    grants: [
      { entitlementKey: "account.founder_status", quantity: 1 },
      { entitlementKey: "account.character_slot", quantity: 1 },
      { entitlementKey: "cosmetic.frame.founder_gold", quantity: 1 },
      { entitlementKey: "cosmetic.title.first_explorer", quantity: 1 },
      { entitlementKey: "account.rename_token", quantity: 1 },
    ],
  },
  "stripe.premium_edition": {
    productId: "stripe.premium_edition",
    provider: "stripe",
    displayName: "Premium Edition",
    version: 1,
    requiresExternalVerification: true,
    grants: [
      { entitlementKey: "account.premium_edition", quantity: 1 },
      { entitlementKey: "account.premium_reward_track", quantity: 1 },
      { entitlementKey: "service.ad_free", quantity: 1 },
    ],
  },
  "stripe.mission_pack": {
    productId: "stripe.mission_pack",
    provider: "stripe",
    displayName: "Advanced Mission Pack",
    version: 1,
    requiresExternalVerification: true,
    grants: [{ entitlementKey: "content.advanced_mission_pack", quantity: 1 }],
  },
  "promo.founders_only": {
    productId: "promo.founders_only",
    provider: "promotion",
    displayName: "FoundersOnly Promo",
    version: 1,
    grants: [
      { entitlementKey: "account.founder_status", quantity: 1 },
      { entitlementKey: "cosmetic.frame.founder_gold", quantity: 1 },
      { entitlementKey: "cosmetic.title.first_explorer", quantity: 1 },
    ],
  },
});

export function getProductMapping(productId) {
  return PRODUCT_MAPPINGS[productId] || null;
}

export function requireProductMapping(productId) {
  const m = getProductMapping(productId);
  if (!m) {
    const err = new Error(`Product not registered: ${productId}`);
    err.code = "PRODUCT_NOT_REGISTERED";
    throw err;
  }
  return m;
}

export function listProductMappings() {
  return Object.values(PRODUCT_MAPPINGS);
}
