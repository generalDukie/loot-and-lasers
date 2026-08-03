/**
 * Audit action / category / actor / result / severity registries.
 * Use these constants — do not scatter free-form strings for critical writes.
 */

export const AUDIT_VERSION = 1;

export const AuditCategories = Object.freeze({
  ACCOUNT: "account",
  AUTHENTICATION: "authentication",
  CHARACTER: "character",
  PROGRESSION: "progression",
  MISSION: "mission",
  REWARD: "reward",
  INVENTORY: "inventory",
  EQUIPMENT: "equipment",
  ITEM: "item",
  CURRENCY: "currency",
  ECONOMY: "economy",
  SHOP: "shop",
  PURCHASE: "purchase",
  TRADE: "trade",
  COLLECTIBLE: "collectible",
  ACHIEVEMENT: "achievement",
  SOCIAL: "social",
  GUILD: "guild",
  CHAT: "chat",
  MAIL: "mail",
  MODERATION: "moderation",
  SUPPORT: "support",
  ADMINISTRATION: "administration",
  FEATURE_FLAG: "feature_flag",
  REMOTE_CONFIGURATION: "remote_configuration",
  EVENT_PROCESSING: "event_processing",
  SECURITY: "security",
  PRIVACY: "privacy",
  MIGRATION: "migration",
  SYSTEM_OPERATION: "system_operation",
  ARENA: "arena",
  AUDIT: "audit",
});

export const ActorTypes = Object.freeze({
  PLAYER: "player",
  CHARACTER: "character",
  ADMINISTRATOR: "administrator",
  MODERATOR: "moderator",
  CUSTOMER_SUPPORT: "customer_support",
  DEVELOPER: "developer",
  SYSTEM: "system",
  BACKGROUND_WORKER: "background_worker",
  SCHEDULED_JOB: "scheduled_job",
  EXTERNAL_SERVICE: "external_service",
  MIGRATION: "migration",
  AUTOMATED_SECURITY_RULE: "automated_security_rule",
});

export const AuditResults = Object.freeze({
  SUCCESS: "success",
  FAILED: "failed",
  REJECTED: "rejected",
  BLOCKED: "blocked",
  PARTIALLY_COMPLETED: "partially_completed",
  REVERSED: "reversed",
  RESTORED: "restored",
  PENDING: "pending",
  EXPIRED: "expired",
});

export const AuditSeverity = Object.freeze({
  INFORMATIONAL: "informational",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
});

export const RetentionClasses = Object.freeze({
  SHORT_TERM_OPERATIONAL: "short_term_operational",
  STANDARD_GAMEPLAY: "standard_gameplay",
  CUSTOMER_SUPPORT: "customer_support",
  ECONOMY_CRITICAL: "economy_critical",
  MODERATION: "moderation",
  SECURITY: "security",
  ADMINISTRATIVE: "administrative",
  PERMANENT_OR_ARCHIVED: "permanent_or_archived",
});

/** Default retention days by class (configurable via env later). */
export const RETENTION_DAYS = Object.freeze({
  [RetentionClasses.SHORT_TERM_OPERATIONAL]: 30,
  [RetentionClasses.STANDARD_GAMEPLAY]: 180,
  [RetentionClasses.CUSTOMER_SUPPORT]: 365,
  [RetentionClasses.ECONOMY_CRITICAL]: 730,
  [RetentionClasses.MODERATION]: 1095,
  [RetentionClasses.SECURITY]: 1095,
  [RetentionClasses.ADMINISTRATIVE]: 1825,
  [RetentionClasses.PERMANENT_OR_ARCHIVED]: null,
});

/**
 * Registered actions: action → { category, defaultSeverity, retentionClass, critical }
 */
export const AUDIT_ACTIONS = Object.freeze({
  // Account / auth
  account_created: { category: AuditCategories.ACCOUNT, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.CUSTOMER_SUPPORT },
  account_role_changed: { category: AuditCategories.ACCOUNT, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  password_reset_requested: { category: AuditCategories.AUTHENTICATION, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.SECURITY },
  password_reset_completed: { category: AuditCategories.AUTHENTICATION, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.SECURITY },
  admin_login: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.LOW, retention: RetentionClasses.ADMINISTRATIVE },

  // Character
  character_created: { category: AuditCategories.CHARACTER, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.CUSTOMER_SUPPORT },
  character_renamed: { category: AuditCategories.CHARACTER, severity: AuditSeverity.LOW, retention: RetentionClasses.CUSTOMER_SUPPORT },
  character_deleted: { category: AuditCategories.CHARACTER, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  character_restored: { category: AuditCategories.CHARACTER, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },

  // Currency
  currency_earned: { category: AuditCategories.CURRENCY, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  currency_spent: { category: AuditCategories.CURRENCY, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  currency_granted: { category: AuditCategories.CURRENCY, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  currency_removed: { category: AuditCategories.CURRENCY, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  currency_refunded: { category: AuditCategories.CURRENCY, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  currency_corrected: { category: AuditCategories.CURRENCY, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },

  // Inventory / items
  item_obtained: { category: AuditCategories.INVENTORY, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  item_removed: { category: AuditCategories.INVENTORY, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  item_sold: { category: AuditCategories.INVENTORY, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  item_purchased: { category: AuditCategories.INVENTORY, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  item_equipped: { category: AuditCategories.EQUIPMENT, severity: AuditSeverity.LOW, retention: RetentionClasses.STANDARD_GAMEPLAY },
  item_unequipped: { category: AuditCategories.EQUIPMENT, severity: AuditSeverity.LOW, retention: RetentionClasses.STANDARD_GAMEPLAY },
  item_consumed: { category: AuditCategories.INVENTORY, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.STANDARD_GAMEPLAY },
  item_destroyed: { category: AuditCategories.INVENTORY, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  item_granted_by_admin: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  item_removed_by_admin: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },

  // Missions / rewards
  mission_started: { category: AuditCategories.MISSION, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.STANDARD_GAMEPLAY },
  mission_completed: { category: AuditCategories.MISSION, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.STANDARD_GAMEPLAY },
  reward_claimed: { category: AuditCategories.REWARD, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  reward_claim_rejected: { category: AuditCategories.REWARD, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.ECONOMY_CRITICAL },
  duplicate_reward_claim_blocked: { category: AuditCategories.REWARD, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.SECURITY },
  reward_restored: { category: AuditCategories.REWARD, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },

  // Shop
  shop_purchase_completed: { category: AuditCategories.SHOP, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  shop_purchase_failed: { category: AuditCategories.SHOP, severity: AuditSeverity.LOW, retention: RetentionClasses.STANDARD_GAMEPLAY },

  // Mail
  mail_sent: { category: AuditCategories.MAIL, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.CUSTOMER_SUPPORT },
  mail_attachment_claimed: { category: AuditCategories.MAIL, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  compensation_mail_sent: { category: AuditCategories.MAIL, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  system_mail_sent: { category: AuditCategories.MAIL, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.ADMINISTRATIVE },

  // Moderation
  player_muted: { category: AuditCategories.MODERATION, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.MODERATION, critical: true },
  player_unmuted: { category: AuditCategories.MODERATION, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.MODERATION, critical: true },
  player_banned: { category: AuditCategories.MODERATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.MODERATION, critical: true },
  player_unbanned: { category: AuditCategories.MODERATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.MODERATION, critical: true },
  chat_message_removed: { category: AuditCategories.MODERATION, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.MODERATION },
  moderation_note_added: { category: AuditCategories.MODERATION, severity: AuditSeverity.LOW, retention: RetentionClasses.MODERATION },
  player_reported: { category: AuditCategories.MODERATION, severity: AuditSeverity.LOW, retention: RetentionClasses.MODERATION },

  // Administration
  admin_player_edit: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  admin_item_grant: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  admin_currency_grant: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  admin_currency_removal: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  admin_character_restore: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  admin_account_update: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  admin_manual_retry: { category: AuditCategories.EVENT_PROCESSING, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.ADMINISTRATIVE },
  admin_data_export: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE },
  admin_audit_viewed: { category: AuditCategories.AUDIT, severity: AuditSeverity.LOW, retention: RetentionClasses.ADMINISTRATIVE },
  admin_player_reset: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.CRITICAL, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  remote_config_updated: { category: AuditCategories.REMOTE_CONFIGURATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  moderation_filter_updated: { category: AuditCategories.MODERATION, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.ADMINISTRATIVE },

  // Arena
  arena_battle_completed: { category: AuditCategories.ARENA, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.STANDARD_GAMEPLAY },
  arena_direct_challenge_completed: { category: AuditCategories.ARENA, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.STANDARD_GAMEPLAY },

  // Casino / mining / dungeon / fuel
  casino_settled: { category: AuditCategories.ECONOMY, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  mining_started: { category: AuditCategories.PROGRESSION, severity: AuditSeverity.LOW, retention: RetentionClasses.STANDARD_GAMEPLAY },
  mining_collected: { category: AuditCategories.ECONOMY, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },
  mining_cancelled: { category: AuditCategories.PROGRESSION, severity: AuditSeverity.LOW, retention: RetentionClasses.STANDARD_GAMEPLAY },
  dungeon_battle_completed: { category: AuditCategories.PROGRESSION, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.STANDARD_GAMEPLAY },
  fuel_purchased: { category: AuditCategories.PURCHASE, severity: AuditSeverity.INFORMATIONAL, retention: RetentionClasses.ECONOMY_CRITICAL, critical: true },

  // Auth (generic login + existing password resets)
  login_succeeded: { category: AuditCategories.AUTHENTICATION, severity: AuditSeverity.LOW, retention: RetentionClasses.SECURITY },
  login_failed: { category: AuditCategories.AUTHENTICATION, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.SECURITY },
  nakama_bridge: { category: AuditCategories.AUTHENTICATION, severity: AuditSeverity.LOW, retention: RetentionClasses.SECURITY },
  admin_login: { category: AuditCategories.AUTHENTICATION, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.SECURITY },

  // Guild
  guild_leadership_transferred: { category: AuditCategories.GUILD, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },

  // Admin entity CRUD
  admin_entity_created: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  admin_entity_updated: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },
  admin_entity_deleted: { category: AuditCategories.ADMINISTRATION, severity: AuditSeverity.HIGH, retention: RetentionClasses.ADMINISTRATIVE, critical: true },

  // Audit meta
  audit_annotation_created: { category: AuditCategories.AUDIT, severity: AuditSeverity.LOW, retention: RetentionClasses.ADMINISTRATIVE },
  audit_export_requested: { category: AuditCategories.AUDIT, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.ADMINISTRATIVE },
  audit_integrity_verified: { category: AuditCategories.AUDIT, severity: AuditSeverity.LOW, retention: RetentionClasses.ADMINISTRATIVE },
  audit_retention_purged: { category: AuditCategories.SYSTEM_OPERATION, severity: AuditSeverity.MEDIUM, retention: RetentionClasses.ADMINISTRATIVE },
});

export function getActionMeta(action) {
  return AUDIT_ACTIONS[action] || null;
}

export function isKnownAction(action) {
  return Object.prototype.hasOwnProperty.call(AUDIT_ACTIONS, action);
}

export const AuditPermissions = Object.freeze({
  VIEW: "audit_logs.view",
  VIEW_PLAYER: "audit_logs.view_player",
  VIEW_ECONOMY: "audit_logs.view_economy",
  VIEW_INVENTORY: "audit_logs.view_inventory",
  VIEW_MODERATION: "audit_logs.view_moderation",
  VIEW_ADMIN: "audit_logs.view_admin",
  VIEW_SECURITY: "audit_logs.view_security",
  VIEW_SENSITIVE: "audit_logs.view_sensitive_metadata",
  EXPORT: "audit_logs.export",
  ANNOTATE: "audit_logs.annotate",
  VERIFY_INTEGRITY: "audit_logs.verify_integrity",
});

/** Current project: admins get full audit access; refine when roles expand. */
export function adminHasAuditPermission(_user, _permission) {
  return true;
}
