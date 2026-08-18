/**
 * Administrative operations service (Restoration 26).
 *
 * Reuses existing AdminModeration / integrity / SiteConfig surfaces.
 * Does not invent multi-tier staff roles — product today is user | admin.
 * Node remains authoritative; Godot only displays.
 */
import { db } from "../db.js";
import { entities } from "../entities.js";
import { getUserById } from "../auth.js";
import { isAdmin } from "../entityAccess.js";
import { listOwnedItems } from "./inventoryEquipment.js";
import { getActiveStims } from "./economyFormulas.js";
import { getMaintenanceState, setMaintenanceMode } from "./maintenanceGate.js";
import { listOpenQuarantine, listRepairAudits } from "./integrityStore.js";
import { recordAdminAction } from "../audit/index.js";
import { newCorrelationId } from "../audit/helpers.js";
import { ActorTypes } from "../audit/registry.js";
import { getMetricsSnapshot } from "./observability/metrics.js";
import { GetDependencyHealth } from "./observability/health.js";
import { getAnalyticsBuffer } from "./observability/analytics.js";

/** Existing account roles only — do not invent GM/Support tiers. */
export const StaffRoles = Object.freeze({
  USER: "user",
  ADMIN: "admin",
});

/**
 * Capability catalog for documentation + assertAdminPermission.
 * Today every capability requires role=admin (binary).
 * Keys are stable for future granular assignment without inventing roles now.
 */
export const AdminPermissions = Object.freeze({
  VIEW_PLAYER: "view_player",
  MODIFY_CURRENCY: "modify_currency",
  GRANT_ITEM: "grant_item",
  BAN_PLAYER: "ban_player",
  MUTE_CHAT: "mute_chat",
  VIEW_LOGS: "view_logs",
  MODIFY_SHOPS: "modify_shops",
  MODIFY_FEATURE_FLAGS: "modify_feature_flags",
  RUN_REPAIRS: "run_repairs",
  EXECUTE_MIGRATION: "execute_migration",
  SEND_MAIL: "send_mail",
  MODIFY_PROMO: "modify_promo",
  MODIFY_RUNTIME_CONFIG: "modify_runtime_config",
  SET_MAINTENANCE: "set_maintenance",
  SET_ROLE: "set_role",
  ARENA_MODERATE: "arena_moderate",
});

const FEATURE_FLAGS_META_KEY = "feature_flags_v1";
const FEATURE_FLAG_NAME_MAX_LENGTH = 64;
const SITE_CONFIG_QUERY_LIMIT = 5;
const DEFAULT_PLAYER_LOOKUP_LIMIT = 20;
const MAX_PLAYER_LOOKUP_LIMIT = 50;
const PLAYER_EXACT_MATCH_LIMIT = 5;
const INSPECT_INVENTORY_LIMIT = 500;
const INSPECT_MAIL_LIMIT = 50;
const INSPECT_MISSION_LIMIT = 20;
const OPEN_REPORT_QUERY_LIMIT = 100;
const OPS_QUARANTINE_LIMIT = 20;
const OPS_REPAIR_AUDIT_LIMIT = 10;
const ONLINE_PRESENCE_QUERY_LIMIT = 500;
const OPS_DASHBOARD_SAMPLE_LIMIT = 5;
const OPS_ANALYTICS_BUFFER_LIMIT = 20;

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "ADMIN_OPS_ERROR";
  throw e;
}

export function assertAdmin(user) {
  if (!user?.id) httpErr(401, "Unauthorized", "UNAUTHORIZED");
  if (!isAdmin(user)) httpErr(403, "Admin only", "FORBIDDEN");
  return user;
}

/**
 * Permission check. Current product: admin has all capabilities.
 * Non-admins always denied. Unknown permissions denied.
 */
export function assertAdminPermission(user, permission) {
  assertAdmin(user);
  if (!permission || !Object.values(AdminPermissions).includes(permission)) {
    httpErr(403, `Unknown or denied permission: ${permission}`, "PERMISSION_DENIED");
  }
  return true;
}

export function listAdminPermissionsForUser(user) {
  if (!isAdmin(user)) return [];
  return Object.values(AdminPermissions);
}

function ensureAppMeta() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function getFeatureFlags() {
  ensureAppMeta();
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(FEATURE_FLAGS_META_KEY);
  if (!row?.value) {
    return {
      casino_enabled: true,
      arena_enabled: true,
      missions_enabled: true,
      mining_enabled: true,
      dungeons_enabled: true,
      shipments_enabled: false,
    };
  }
  try {
    return { ...JSON.parse(row.value) };
  } catch {
    return {};
  }
}

/**
 * Set one feature flag (Node-authoritative runtime toggle).
 * Does not replace authorization, migrations, or gameplay formulas.
 */
export function SetFeatureFlag(user, { flag, enabled, reason }) {
  assertAdminPermission(user, AdminPermissions.MODIFY_FEATURE_FLAGS);
  if (!flag || typeof flag !== "string") httpErr(400, "flag required");
  if (!reason) httpErr(400, "reason required");
  const key = String(flag).trim().slice(0, FEATURE_FLAG_NAME_MAX_LENGTH);
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    httpErr(400, "flag must be snake_case identifier");
  }
  const before = getFeatureFlags();
  const after = { ...before, [key]: !!enabled };
  ensureAppMeta();
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(FEATURE_FLAGS_META_KEY, JSON.stringify(after));
  const corr = newCorrelationId();
  recordAdminAction(user, {
    action: "remote_config_updated",
    targetType: "feature_flag",
    targetId: key,
    beforeState: { [key]: before[key] },
    afterState: { [key]: after[key] },
    changeSet: { flag: key, enabled: !!enabled },
    reasonText: reason,
    administratorNote: reason,
    correlationId: corr,
    actorType: ActorTypes.ADMINISTRATOR,
  });
  return { flag: key, enabled: !!enabled, flags: after, correlation_id: corr };
}

export function GetRuntimeConfiguration() {
  const maintenance = getMaintenanceState();
  const flags = getFeatureFlags();
  let site = null;
  try {
    const list = entities.SiteConfig?.list?.("-updated_date", 1) || [];
    site = list[0]
      ? {
          id: list[0].id,
          site_title: list[0].site_title || list[0].title || null,
          announcement_text: list[0].announcement_text || null,
          maintenance_enabled: !!(list[0].maintenance_enabled || list[0].maintenance),
          maintenance_message: list[0].maintenance_message || null,
        }
      : null;
  } catch {
    site = null;
  }
  return {
    maintenance,
    feature_flags: flags,
    site_config: site,
    authority: "node",
    note: "Nakama RemoteConfig remains separate for Lua modules; Node enforces maintenance writes.",
  };
}

/**
 * Patch SiteConfig presentation fields only (theme/announcement/maintenance mirrors).
 * Write enforcement still via SetMaintenanceMode for Node gate.
 */
export function UpdateRuntimeConfiguration(user, patch = {}, reason = "") {
  assertAdminPermission(user, AdminPermissions.MODIFY_RUNTIME_CONFIG);
  if (!reason) httpErr(400, "reason required");
  const list = entities.SiteConfig.list("-updated_date", SITE_CONFIG_QUERY_LIMIT) || [];
  let doc = list[0];
  const allowed = [
    "site_title",
    "title",
    "announcement_text",
    "maintenance_enabled",
    "maintenance_message",
    "maintenance_allow_reads",
    "maintenance_allow_admin_writes",
  ];
  const updates = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) updates[k] = patch[k];
  }
  if (!Object.keys(updates).length) httpErr(400, "No allowed SiteConfig fields in patch");

  const before = doc ? { ...doc } : null;
  if (doc) doc = entities.SiteConfig.update(doc.id, updates);
  else doc = entities.SiteConfig.create({ ...updates, singleton: true });

  if (Object.prototype.hasOwnProperty.call(updates, "maintenance_enabled")) {
    setMaintenanceMode({
      enabled: !!updates.maintenance_enabled,
      message: updates.maintenance_message || doc.maintenance_message,
      allow_reads: updates.maintenance_allow_reads !== false,
      allow_admin_writes: updates.maintenance_allow_admin_writes !== false,
      operator: `admin:${user.id}`,
    });
  }

  const corr = newCorrelationId();
  recordAdminAction(user, {
    action: "remote_config_updated",
    targetType: "site_config",
    targetId: doc.id,
    beforeState: before
      ? {
          maintenance_enabled: before.maintenance_enabled,
          announcement_text: before.announcement_text,
        }
      : null,
    afterState: {
      maintenance_enabled: doc.maintenance_enabled,
      announcement_text: doc.announcement_text,
    },
    reasonText: reason,
    correlationId: corr,
  });
  return { site_config: doc, runtime: GetRuntimeConfiguration(), correlation_id: corr };
}

/** Lookup account / character by id, name, email, or nakama_user_id. */
export function LookupPlayer(user, query = {}) {
  assertAdminPermission(user, AdminPermissions.VIEW_PLAYER);
  const q = String(query.q || query.query || query.id || "").trim();
  const limit = Math.min(
    MAX_PLAYER_LOOKUP_LIMIT,
    Math.max(1, Number(query.limit) || DEFAULT_PLAYER_LOOKUP_LIMIT),
  );
  if (!q) httpErr(400, "query required");

  const results = { accounts: [], characters: [] };

  // Exact account id
  const byId = getUserById(q);
  if (byId) {
    results.accounts.push(serializeAccount(byId));
  }

  // Nakama id
  const byNakama = db
    .prepare(`SELECT * FROM users WHERE nakama_user_id = ? LIMIT ${PLAYER_EXACT_MATCH_LIMIT}`)
    .all(q);
  for (const row of byNakama) {
    if (!results.accounts.some((a) => a.id === row.id)) {
      results.accounts.push(serializeAccount(row));
    }
  }

  // Email (exact, case-insensitive)
  const byEmail = db
    .prepare(`SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT ${PLAYER_EXACT_MATCH_LIMIT}`)
    .all(q);
  for (const row of byEmail) {
    if (!results.accounts.some((a) => a.id === row.id)) {
      results.accounts.push(serializeAccount(row));
    }
  }

  // Character id
  const chExact = entities.Character.get(q);
  if (chExact) results.characters.push(serializeCharacterSummary(chExact));

  // Name contains across the complete directory; SQLite applies the result cap.
  const all = entities.Character.searchText("name", q, "-created_date", limit) || [];
  const ql = q.toLowerCase();
  for (const ch of all) {
    if (results.characters.length >= limit) break;
    if (String(ch.name || "").toLowerCase().includes(ql) || String(ch.id) === q) {
      if (!results.characters.some((c) => c.id === ch.id)) {
        results.characters.push(serializeCharacterSummary(ch));
      }
    }
  }

  return {
    query: q,
    accounts: results.accounts.slice(0, limit),
    characters: results.characters.slice(0, limit),
  };
}

/** Full authoritative character inspection (read-only). */
export function InspectCharacter(user, characterId) {
  assertAdminPermission(user, AdminPermissions.VIEW_PLAYER);
  if (!characterId) httpErr(400, "character_id required");
  const ch = entities.Character.get(characterId);
  if (!ch) httpErr(404, "Character not found");

  const account = ch.created_by_id ? getUserById(ch.created_by_id) : null;
  const items = listOwnedItems(characterId, INSPECT_INVENTORY_LIMIT);
  const modList = entities.PlayerModeration.filter({ character_id: characterId }) || [];
  const mail =
    entities.Mail.filter({ owner_id: characterId }, "-created_date", INSPECT_MAIL_LIMIT) || [];
  const missions =
    entities.Mission.filter(
      { character_id: characterId },
      "-created_date",
      INSPECT_MISSION_LIMIT,
    ) || [];

  return {
    character: ch,
    account: account ? serializeAccount(account) : null,
    inventory: {
      count: items.length,
      equipped: items.filter((i) => i.is_equipped),
      bag: items.filter((i) => !i.is_equipped),
    },
    moderation: modList[0] || null,
    active_stims: getActiveStims(ch),
    mail_recent: mail.map((m) => ({
      id: m.id,
      subject: m.subject,
      claimed: !!m.claimed,
      has_rewards: !!m.has_rewards,
      mail_type: m.mail_type,
      created_date: m.created_date,
    })),
    missions_recent: missions.map((m) => ({
      id: m.id,
      status: m.status || m.state,
      created_date: m.created_date,
    })),
    read_only: true,
  };
}

/** Ops dashboard snapshot (existing data only). */
export function GetOpsDashboard(user) {
  assertAdmin(user);
  const maintenance = getMaintenanceState();
  const flags = getFeatureFlags();
  const users = db.prepare("SELECT COUNT(*) AS c FROM users").get()?.c ?? 0;
  const characters = db.prepare("SELECT COUNT(*) AS c FROM entities WHERE type = 'Character'").get()?.c ?? 0;
  const openReports =
    (entities.Report.filter(
      { status: "open" },
      "-created_date",
      OPEN_REPORT_QUERY_LIMIT,
    ) || []).length;
  const quarantine = listOpenQuarantine({ limit: OPS_QUARANTINE_LIMIT });
  const recentRepairs = listRepairAudits({ limit: OPS_REPAIR_AUDIT_LIMIT });

  let presenceCount = 0;
  try {
    presenceCount = (
      entities.PlayerPresence.list("-updated_date", ONLINE_PRESENCE_QUERY_LIMIT) || []
    ).length;
  } catch {
    presenceCount = 0;
  }

  return {
    players_online_estimate: presenceCount,
    accounts: users,
    characters,
    open_reports: openReports,
    maintenance,
    feature_flags: flags,
    pending_quarantine: quarantine.length,
    quarantine_sample: quarantine.slice(0, OPS_DASHBOARD_SAMPLE_LIMIT).map((q) => ({
      id: q.id,
      issue_code: q.issue_code,
      severity: q.severity,
      entity_type: q.entity_type,
    })),
    recent_repairs: recentRepairs.slice(0, OPS_DASHBOARD_SAMPLE_LIMIT).map((r) => ({
      id: r.id,
      repair_type: r.repair_type,
      created_at: r.created_at,
    })),
    ops_metrics: getMetricsSnapshot(),
    generated_at: new Date().toISOString(),
  };
}

/** Admin-only observability bundle (metrics + dependency health). Not for players. */
export function GetOpsTelemetry(user) {
  assertAdmin(user);
  return {
    dashboard: GetOpsDashboard(user),
    dependencies: GetDependencyHealth(),
    analytics_buffer: getAnalyticsBuffer(OPS_ANALYTICS_BUFFER_LIMIT),
    note: "Operational telemetry only. Analytics is non-authoritative.",
  };
}

/** Upsert PlayerModeration arena / suspension fields (existing schema). */
export function applyArenaModeration(user, {
  characterId,
  arenaBanned = null,
  arenaSuspended = null,
  suspendedUntil = null,
  reason,
}) {
  assertAdminPermission(user, AdminPermissions.ARENA_MODERATE);
  if (!characterId) httpErr(400, "character_id required");
  if (!reason) httpErr(400, "reason required");
  const ch = entities.Character.get(characterId);
  if (!ch) httpErr(404, "Character not found");

  const list = entities.PlayerModeration.filter({ character_id: characterId }) || [];
  let rec = list[0];
  const before = rec
    ? {
        arena_banned: !!rec.arena_banned,
        arena_suspended: !!rec.arena_suspended,
        suspended_until: rec.suspended_until || null,
      }
    : { arena_banned: false, arena_suspended: false, suspended_until: null };

  const patch = { notes: reason };
  if (arenaBanned != null) patch.arena_banned = !!arenaBanned;
  if (arenaSuspended != null) patch.arena_suspended = !!arenaSuspended;
  if (suspendedUntil !== undefined) patch.suspended_until = suspendedUntil;

  if (rec) rec = entities.PlayerModeration.update(rec.id, patch);
  else {
    rec = entities.PlayerModeration.create({
      character_id: characterId,
      chat_banned: false,
      arena_banned: !!arenaBanned,
      arena_suspended: !!arenaSuspended,
      suspended_until: suspendedUntil,
      notes: reason,
    });
  }

  const corr = newCorrelationId();
  recordAdminAction(user, {
    action: arenaBanned || arenaSuspended ? "player_banned" : "player_unbanned",
    targetType: "character",
    targetId: characterId,
    targetAccountId: ch.created_by_id,
    targetCharacterId: characterId,
    beforeState: before,
    afterState: {
      arena_banned: !!rec.arena_banned,
      arena_suspended: !!rec.arena_suspended,
      suspended_until: rec.suspended_until || null,
    },
    reasonText: reason,
    correlationId: corr,
    metadata: { scope: "arena" },
  });

  return { moderation: rec, correlation_id: corr };
}

function serializeAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    nakama_user_id: row.nakama_user_id || null,
    active_character_id: row.active_character_id || null,
    legacy_name: row.legacy_name || null,
    created_date: row.created_date,
    // Never expose password_hash / tokens
  };
}

function serializeCharacterSummary(ch) {
  return {
    id: ch.id,
    name: ch.name,
    class: ch.class,
    level: ch.level,
    created_by_id: ch.created_by_id,
    stardust: ch.stardust,
    nova_crystals: ch.nova_crystals,
    arena_rating: ch.arena_rating,
  };
}
