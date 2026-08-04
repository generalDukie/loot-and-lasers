/**
 * Maintenance write gate (Restoration 25).
 * Node enforces — clients only display status.
 */
import { db } from "../db.js";
import { entities } from "../entities.js";

const META_KEY = "maintenance_mode";

function readMeta() {
  try {
    const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(META_KEY);
    if (!row?.value) return null;
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function readSiteConfig() {
  try {
    const list = entities.SiteConfig?.list?.("-updated_date", 5) || [];
    const doc = list[0] || null;
    if (!doc) return null;
    return {
      enabled: !!(doc.maintenance_enabled || doc.maintenance),
      message: doc.maintenance_message || doc.message || null,
      allow_reads: doc.maintenance_allow_reads !== false,
      allow_admin_writes: doc.maintenance_allow_admin_writes !== false,
    };
  } catch {
    return null;
  }
}

export function getMaintenanceState() {
  const fromMeta = readMeta();
  if (fromMeta && typeof fromMeta === "object") {
    return {
      enabled: !!fromMeta.enabled,
      message: fromMeta.message || "Temporary maintenance — please try again shortly.",
      allow_reads: fromMeta.allow_reads !== false,
      allow_admin_writes: fromMeta.allow_admin_writes !== false,
      source: "app_meta",
    };
  }
  const fromSite = readSiteConfig();
  if (fromSite) {
    return { ...fromSite, source: "SiteConfig" };
  }
  return {
    enabled: false,
    message: null,
    allow_reads: true,
    allow_admin_writes: true,
    source: "none",
  };
}

export function isMaintenanceActive() {
  return getMaintenanceState().enabled;
}

/**
 * Set maintenance via app_meta (internal/admin tooling — not a public gameplay RPC body).
 */
export function setMaintenanceMode({ enabled, message = null, allow_reads = true, allow_admin_writes = true, operator = "system" }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const payload = {
    enabled: !!enabled,
    message: message || (enabled ? "Temporary maintenance — please try again shortly." : null),
    allow_reads: !!allow_reads,
    allow_admin_writes: !!allow_admin_writes,
    updated_by: operator,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(META_KEY, JSON.stringify(payload));
  return getMaintenanceState();
}

/**
 * Throw if gameplay writes are blocked.
 * Admins may write when allow_admin_writes is true.
 */
export function assertWritesAllowed(user = null) {
  const state = getMaintenanceState();
  if (!state.enabled) return state;
  const isAdmin = user?.role === "admin";
  if (isAdmin && state.allow_admin_writes) return state;
  const e = new Error(state.message || "Maintenance in progress");
  e.status = 503;
  e.code = "MAINTENANCE_MODE";
  e.retryable = true;
  throw e;
}
