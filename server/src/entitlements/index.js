/**
 * Entitlement module public API.
 */

export * from "./errors.js";
export * from "./definitions.js";
export * from "./products.js";
export {
  resolveEntitlement,
  resolveQuantity,
  toClientSafeEntitlement,
} from "./resolve.js";
export {
  grantEntitlement,
  grantProductBundle,
  revokeEntitlement,
  suspendEntitlement,
  restoreEntitlement,
  consumeEntitlement,
  resolveCharacterSlotCapacity,
  assertCanCreateCharacter,
  processExpiredEntitlements,
} from "./service.js";
export {
  requireEntitlement,
  requireAnyEntitlement,
  requireAllEntitlements,
  requireEntitlementQuantity,
  requireActiveSubscription,
  consumeEntitlementGuard,
} from "./guards.js";
export { verifyAndClaimPurchase } from "./verify.js";
export { migrateLegacyEntitlements } from "./migrate.js";
export {
  listEntitlementsForAccount,
  getEntitlementById,
  searchEntitlements,
  listAudit,
  getStatusHistory,
} from "./store.js";
export { invalidateAccountEntitlements, clearEntitlementCache } from "./cache.js";
export { listProductMappings } from "./products.js";
