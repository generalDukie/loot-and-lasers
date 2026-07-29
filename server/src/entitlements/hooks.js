/**
 * Wire inventory-expansion entitlement into getInventoryCap without circular imports.
 */
import { resolveQuantity } from "./resolve.js";

export function registerInventoryExpansionHook() {
  globalThis.__llResolveInventoryExpansion = (accountId) => {
    try {
      return resolveQuantity({
        entitlementKey: "account.inventory_expansion",
        accountId,
      }).quantity;
    } catch {
      return 0;
    }
  };
}

registerInventoryExpansionHook();
