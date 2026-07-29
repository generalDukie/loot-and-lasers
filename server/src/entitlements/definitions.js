/**
 * Trusted entitlement definition registry (code-level).
 * Unknown keys fail closed in production resolution.
 */

import { ACHIEVEMENTS } from "../shared/achievements.js";

/** @typedef {"account"|"character"|"platform"|"service"} EntitlementScope */
/** @typedef {"permanent"|"temporary"|"subscription"|"consumable"|"quantity_based"} OwnershipType */

/**
 * @type {Record<string, object>}
 */
const DEFS = {
  "account.character_slot": {
    key: "account.character_slot",
    displayName: "Character Slot",
    description: "Additional character slot for the account",
    category: "capacity",
    scope: "account",
    ownershipType: "quantity_based",
    durationType: "permanent",
    stackPolicy: "sum_quantity",
    renewalPolicy: "reject_while_active",
    revocationPolicy: "block_new_create",
    consumable: false,
    maximumQuantity: 2, // base 1 + 2 purchased = 3
    permanent: true,
    visibleToClient: true,
    requiresExternalVerification: false,
    allowedSources: ["direct_purchase", "administrator", "compensation", "migration", "bundle", "promotion"],
    auditSeverity: "high",
    schemaVersion: 1,
    status: "active",
  },
  "account.inventory_expansion": {
    key: "account.inventory_expansion",
    displayName: "Inventory Expansion",
    description: "Extra bag capacity beyond the base hard cap",
    category: "capacity",
    scope: "account",
    ownershipType: "quantity_based",
    durationType: "permanent",
    stackPolicy: "sum_quantity",
    consumable: false,
    maximumQuantity: 20,
    permanent: true,
    visibleToClient: true,
    allowedSources: ["direct_purchase", "administrator", "compensation", "reward", "migration", "bundle"],
    auditSeverity: "medium",
    schemaVersion: 1,
    status: "active",
  },
  "account.premium_edition": {
    key: "account.premium_edition",
    displayName: "Premium Edition",
    description: "Premium game edition access",
    category: "edition",
    scope: "account",
    ownershipType: "permanent",
    durationType: "permanent",
    stackPolicy: "unique",
    consumable: false,
    permanent: true,
    visibleToClient: true,
    allowedSources: ["platform_purchase", "direct_purchase", "administrator", "compensation", "migration", "bundle"],
    requiresExternalVerification: true,
    auditSeverity: "critical",
    schemaVersion: 1,
    status: "active",
  },
  "account.founder_status": {
    key: "account.founder_status",
    displayName: "Founder Status",
    description: "Founders package ownership",
    category: "edition",
    scope: "account",
    ownershipType: "permanent",
    durationType: "permanent",
    stackPolicy: "unique",
    consumable: false,
    permanent: true,
    visibleToClient: true,
    allowedSources: ["promotion", "administrator", "founder_package", "migration", "bundle", "platform_purchase"],
    auditSeverity: "critical",
    schemaVersion: 1,
    status: "active",
  },
  "account.subscription_membership": {
    key: "account.subscription_membership",
    displayName: "Subscription Membership",
    description: "Active paid subscription period",
    category: "subscription",
    scope: "account",
    ownershipType: "subscription",
    durationType: "temporary",
    stackPolicy: "extend_from_later",
    renewalPolicy: "extend_from_later",
    consumable: false,
    permanent: false,
    visibleToClient: true,
    requiresExternalVerification: true,
    allowedSources: ["subscription", "platform_purchase", "administrator", "compensation"],
    auditSeverity: "critical",
    schemaVersion: 1,
    status: "active",
  },
  "account.premium_reward_track": {
    key: "account.premium_reward_track",
    displayName: "Premium Reward Track",
    description: "Access to premium reward-track claims",
    category: "track",
    scope: "account",
    ownershipType: "permanent",
    durationType: "permanent",
    stackPolicy: "unique",
    consumable: false,
    permanent: true,
    visibleToClient: true,
    requiredFeatureFlags: ["premium_reward_track"],
    allowedSources: ["direct_purchase", "platform_purchase", "administrator", "bundle", "promotion"],
    auditSeverity: "high",
    schemaVersion: 1,
    status: "active",
  },
  "account.rename_token": {
    key: "account.rename_token",
    displayName: "Rename Token",
    description: "One free operative rename (consumable)",
    category: "service",
    scope: "account",
    ownershipType: "consumable",
    durationType: "permanent",
    stackPolicy: "sum_quantity",
    consumable: true,
    maximumQuantity: 99,
    permanent: true,
    visibleToClient: true,
    allowedSources: ["direct_purchase", "administrator", "compensation", "reward", "promotion", "bundle"],
    auditSeverity: "medium",
    schemaVersion: 1,
    status: "active",
  },
  "content.advanced_mission_pack": {
    key: "content.advanced_mission_pack",
    displayName: "Advanced Mission Pack",
    description: "Access to premium mission content",
    category: "content",
    scope: "account",
    ownershipType: "permanent",
    durationType: "permanent",
    stackPolicy: "unique",
    consumable: false,
    permanent: true,
    visibleToClient: true,
    requiredFeatureFlags: ["advanced_mission_pack"],
    allowedSources: ["direct_purchase", "platform_purchase", "administrator", "bundle", "promotion"],
    auditSeverity: "high",
    schemaVersion: 1,
    status: "active",
  },
  "cosmetic.frame.founder_gold": {
    key: "cosmetic.frame.founder_gold",
    displayName: "Founder Gold Frame",
    description: "Exclusive founder avatar frame",
    category: "cosmetic",
    scope: "account",
    ownershipType: "permanent",
    durationType: "permanent",
    stackPolicy: "unique",
    consumable: false,
    permanent: true,
    visibleToClient: true,
    allowedSources: ["founder_package", "bundle", "administrator", "promotion", "migration"],
    auditSeverity: "medium",
    schemaVersion: 1,
    status: "active",
  },
  "cosmetic.title.first_explorer": {
    key: "cosmetic.title.first_explorer",
    displayName: "First Explorer",
    description: "Founder title",
    category: "cosmetic",
    scope: "account",
    ownershipType: "permanent",
    durationType: "permanent",
    stackPolicy: "unique",
    consumable: false,
    permanent: true,
    visibleToClient: true,
    grants: { titleLabel: "First Explorer" },
    allowedSources: ["founder_package", "bundle", "administrator", "promotion", "migration"],
    auditSeverity: "medium",
    schemaVersion: 1,
    status: "active",
  },
  "service.ad_free": {
    key: "service.ad_free",
    displayName: "Ad-Free Access",
    description: "Suppress promotional interstitial surfaces",
    category: "service",
    scope: "account",
    ownershipType: "permanent",
    durationType: "permanent",
    stackPolicy: "unique",
    consumable: false,
    permanent: true,
    visibleToClient: true,
    allowedSources: ["direct_purchase", "platform_purchase", "administrator", "bundle", "subscription"],
    auditSeverity: "low",
    schemaVersion: 1,
    status: "active",
  },
};

// Achievement titles → character-scoped cosmetic entitlements
for (const a of ACHIEVEMENTS) {
  if (!a.title) continue;
  const key = `cosmetic.title.${a.id}`;
  DEFS[key] = {
    key,
    displayName: a.title,
    description: `Achievement title: ${a.name}`,
    category: "cosmetic",
    scope: "character",
    ownershipType: "permanent",
    durationType: "permanent",
    stackPolicy: "unique",
    consumable: false,
    permanent: true,
    visibleToClient: true,
    grants: { titleLabel: a.title, achievementId: a.id },
    allowedSources: ["achievement", "administrator", "migration", "reward"],
    auditSeverity: "low",
    schemaVersion: 1,
    status: "active",
  };
}

/** Simple code-level feature flags for entitlement gates. */
export const FEATURE_FLAGS = Object.freeze({
  premium_reward_track: true,
  advanced_mission_pack: true,
  entitlement_enforcement: true,
  stripe_checkout: false,
});

export function isFeatureEnabled(flag) {
  if (!flag) return true;
  return FEATURE_FLAGS[flag] !== false;
}

export function getEntitlementDefinition(key) {
  return DEFS[key] || null;
}

export function requireEntitlementDefinition(key) {
  const def = getEntitlementDefinition(key);
  if (!def || def.status !== "active") {
    const err = new Error(`Unknown entitlement: ${key}`);
    err.code = "ENTITLEMENT_UNKNOWN_KEY";
    throw err;
  }
  return def;
}

export function listEntitlementDefinitions({ visibleOnly = false } = {}) {
  return Object.values(DEFS).filter((d) => !visibleOnly || d.visibleToClient);
}

export function titleEntitlementKeyForAchievement(achievementId) {
  return `cosmetic.title.${achievementId}`;
}

export function titleLabelFromEntitlementKey(key) {
  return getEntitlementDefinition(key)?.grants?.titleLabel || null;
}
