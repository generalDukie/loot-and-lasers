/**
 * Liveness / readiness / build health (Restoration 27).
 * Telemetry exporters are optional — never mark gameplay fatal for them.
 */
import { DatabaseSync } from "node:sqlite";
import { db } from "../../db.js";
import { getMaintenanceState } from "../maintenanceGate.js";
import { assertSchemaCompatible, getSchemaVersion } from "../migrationFramework.js";
import { getBuildInfo } from "./logger.js";
import { getMetricsSnapshot } from "./metrics.js";
import { APP_ID } from "../../auth.js";

export function GetLiveness() {
  return {
    ok: true,
    probe: "liveness",
    app: "lootandlasers",
    appId: APP_ID,
    ...getBuildInfo(),
  };
}

export function GetReadiness() {
  const maintenance = getMaintenanceState();
  const checks = {};
  let ok = true;

  try {
    db.prepare("SELECT 1 AS ok").get();
    checks.database = { ok: true, critical: true };
  } catch (err) {
    ok = false;
    checks.database = { ok: false, critical: true, error: String(err?.message || err) };
  }

  try {
    const schema = assertSchemaCompatible();
    checks.schema = { ok: true, critical: true, schema_version: schema.schema_version };
  } catch (err) {
    ok = false;
    checks.schema = {
      ok: false,
      critical: true,
      error: String(err?.message || err),
      code: err?.code,
    };
  }

  checks.maintenance = {
    ok: true,
    critical: false,
    enabled: maintenance.enabled,
    // Maintenance does not fail readiness for GET health probes used by Docker —
    // write drain is enforced separately. Surface state only.
    note: "writes may be blocked while enabled",
  };

  checks.metrics = { ok: true, critical: false, optional: true };

  return {
    ok,
    probe: "readiness",
    app: "lootandlasers",
    appId: APP_ID,
    schema_version: getSchemaVersion(),
    maintenance: {
      enabled: maintenance.enabled,
      message: maintenance.message,
    },
    checks,
    ...getBuildInfo(),
  };
}

export function GetBuildInfoPublic() {
  return {
    ok: true,
    probe: "build",
    app: "lootandlasers",
    appId: APP_ID,
    ...getBuildInfo(),
    schema_version: getSchemaVersion(),
  };
}

/** Admin-only richer snapshot (no secrets). */
export function GetDependencyHealth() {
  const readiness = GetReadiness();
  const metrics = getMetricsSnapshot();
  return {
    ...readiness,
    probe: "dependencies",
    dependencies: {
      gameplay_database: {
        criticality: "critical",
        ...readiness.checks.database,
      },
      schema: {
        criticality: "critical",
        ...readiness.checks.schema,
      },
      metrics_exporter: {
        criticality: "optional",
        ok: true,
        note: "in-process registry only — no external exporter configured",
      },
      analytics: {
        criticality: "optional",
        ok: true,
        note: "non-authoritative; outage must not block gameplay",
      },
      nakama: {
        criticality: "degraded_nonblocking_for_node_reads",
        note: "Nakama health is external; Node JWT exchange failures measured separately",
      },
    },
    metrics_summary: {
      series_count: metrics.series_count,
      dropped_samples: metrics.dropped_samples,
    },
  };
}

// silence unused import if bundlers complain — DatabaseSync reserved for future isolated checks
void DatabaseSync;
