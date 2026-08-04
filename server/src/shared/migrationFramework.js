/**
 * Versioned migration framework (Restoration 25).
 * Idempotent, checkpointed, dry-run capable. Not for ad-hoc production edits.
 */
import { db } from "../db.js";
import { clock } from "./time/clock.js";
import { nanoid } from "nanoid";
import { ensureIntegritySchema, insertRepairAudit } from "./integrityStore.js";

const SCHEMA_VERSION_KEY = "gameplay_schema_version";
export const CURRENT_SCHEMA_VERSION = 25;

/** @type {Map<string, object>} */
const REGISTRY = new Map();

function ensureAppMeta() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function getSchemaVersion() {
  ensureAppMeta();
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(SCHEMA_VERSION_KEY);
  return row ? Number(row.value) || 0 : 0;
}

export function setSchemaVersion(version) {
  ensureAppMeta();
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SCHEMA_VERSION_KEY, String(version));
}

/**
 * Register a migration definition.
 * @param {{
 *   id: string,
 *   description: string,
 *   targetVersion: number,
 *   preconditions?: (ctx) => void|Promise<void>,
 *   forward: (ctx) => object|Promise<object>,
 *   validate?: (ctx, forwardResult) => object|Promise<object>,
 *   rollback?: (ctx) => object|Promise<object>,
 * }} def
 */
export function registerMigration(def) {
  if (!def?.id || !def.forward) {
    throw new Error("Migration requires id and forward");
  }
  if (REGISTRY.has(def.id)) {
    throw new Error(`Duplicate migration id: ${def.id}`);
  }
  REGISTRY.set(def.id, Object.freeze({ ...def }));
}

export function listMigrations() {
  return [...REGISTRY.values()].sort((a, b) => (a.targetVersion || 0) - (b.targetVersion || 0));
}

export function getMigration(id) {
  return REGISTRY.get(id) || null;
}

function getCheckpoint(migrationId) {
  ensureIntegritySchema();
  const row = db
    .prepare(`SELECT * FROM migration_checkpoints WHERE migration_id = ?`)
    .get(migrationId);
  if (!row) return null;
  try {
    return { ...row, cursor: JSON.parse(row.cursor_json) };
  } catch {
    return { ...row, cursor: {} };
  }
}

function saveCheckpoint(migrationId, cursor, status = "in_progress") {
  ensureIntegritySchema();
  const now = clock.nowIso();
  db.prepare(`
    INSERT INTO migration_checkpoints (migration_id, cursor_json, status, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(migration_id) DO UPDATE SET
      cursor_json = excluded.cursor_json,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(migrationId, JSON.stringify(cursor || {}), status, now);
}

function recordRun({ migrationId, mode, status, dryRun, checkpoint, report, operator }) {
  ensureIntegritySchema();
  const id = nanoid();
  const now = clock.nowIso();
  db.prepare(`
    INSERT INTO migration_runs (
      id, migration_id, mode, status, dry_run, checkpoint_json, report_json,
      started_at, completed_at, operator
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    migrationId,
    mode,
    status,
    dryRun ? 1 : 0,
    checkpoint ? JSON.stringify(checkpoint) : null,
    report ? JSON.stringify(report) : null,
    now,
    status === "completed" || status === "failed" ? now : null,
    operator || null,
  );
  return id;
}

/**
 * Run a registered migration.
 * @param {string} migrationId
 * @param {{ dryRun?: boolean, resume?: boolean, operator?: string, env?: string }} opts
 */
export async function RunMigration(migrationId, opts = {}) {
  const {
    dryRun = true,
    resume = false,
    operator = "cli",
    env = process.env.NODE_ENV || "development",
  } = opts;

  const def = getMigration(migrationId);
  if (!def) {
    const e = new Error(`Unknown migration: ${migrationId}`);
    e.status = 404;
    e.code = "MIGRATION_NOT_FOUND";
    throw e;
  }

  // Safety: refuse non-dry-run against production without explicit confirm flag
  if (!dryRun && env === "production" && process.env.ALLOW_PROD_MIGRATION !== "1") {
    const e = new Error(
      "Refusing production migration without ALLOW_PROD_MIGRATION=1 and --apply",
    );
    e.status = 403;
    e.code = "PROD_MIGRATION_BLOCKED";
    throw e;
  }

  const doneKey = `migration_done:${migrationId}`;
  ensureAppMeta();
  const already = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(doneKey);
  if (already?.value === "done" && !dryRun && !resume) {
    return {
      migration_id: migrationId,
      status: "already_applied",
      dry_run: false,
      report: { message: "Migration already marked done" },
    };
  }

  let checkpoint = resume ? getCheckpoint(migrationId) : null;
  const ctx = {
    db,
    dryRun: !!dryRun,
    resume: !!resume,
    checkpoint: checkpoint?.cursor || {},
    saveCheckpoint: (cursor) => {
      if (!dryRun) saveCheckpoint(migrationId, cursor, "in_progress");
      ctx.checkpoint = cursor;
    },
    operator,
    clock,
  };

  if (def.preconditions) {
    await def.preconditions(ctx);
  }

  let forwardResult;
  try {
    forwardResult = (await def.forward(ctx)) || {};
  } catch (err) {
    recordRun({
      migrationId,
      mode: dryRun ? "dry_run" : "apply",
      status: "failed",
      dryRun,
      checkpoint: ctx.checkpoint,
      report: { error: String(err.message || err) },
      operator,
    });
    throw err;
  }

  let validation = { ok: true };
  if (def.validate) {
    validation = (await def.validate(ctx, forwardResult)) || { ok: true };
  }

  const report = {
    migration_id: migrationId,
    description: def.description,
    target_version: def.targetVersion,
    dry_run: !!dryRun,
    forward: forwardResult,
    validation,
    checkpoint: ctx.checkpoint,
  };

  if (!dryRun && validation.ok !== false) {
    saveCheckpoint(migrationId, ctx.checkpoint, "completed");
    db.prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(doneKey, "done");
    if (def.targetVersion != null) {
      const current = getSchemaVersion();
      if (def.targetVersion > current) setSchemaVersion(def.targetVersion);
    }
    insertRepairAudit({
      repairType: `migration:${migrationId}`,
      targetEntityType: "schema",
      targetEntityId: migrationId,
      before: { schema_version: getSchemaVersion() },
      after: report.forward,
      evidence: { validation },
      actor: operator,
      automated: true,
      reason: def.description,
    });
  }

  const runId = recordRun({
    migrationId,
    mode: dryRun ? "dry_run" : "apply",
    status: validation.ok === false ? "validation_failed" : "completed",
    dryRun,
    checkpoint: ctx.checkpoint,
    report,
    operator,
  });

  return { ...report, run_id: runId, status: validation.ok === false ? "validation_failed" : "completed" };
}

export async function ResumeMigration(migrationId, opts = {}) {
  return RunMigration(migrationId, { ...opts, resume: true, dryRun: opts.dryRun === true ? true : false });
}

export async function ValidateMigration(migrationId, opts = {}) {
  return RunMigration(migrationId, { ...opts, dryRun: true });
}

/**
 * Workers / startup: refuse to write if binary expects newer schema than DB.
 */
export function assertSchemaCompatible({ minVersion = CURRENT_SCHEMA_VERSION } = {}) {
  const v = getSchemaVersion();
  // Fresh DBs may be 0 until integrity_framework_v1 runs — allow boot but warn.
  if (v === 0) return { ok: true, schema_version: 0, note: "unversioned_or_fresh" };
  if (v < minVersion - 5) {
    // Very old — fail safe
    const e = new Error(
      `Schema version ${v} too old for this binary (min ${minVersion}). Run migrations.`,
    );
    e.status = 503;
    e.code = "SCHEMA_INCOMPATIBLE";
    throw e;
  }
  return { ok: true, schema_version: v };
}
