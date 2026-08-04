/**
 * Built-in migrations registered at load (Restoration 25).
 */
import { registerMigration, CURRENT_SCHEMA_VERSION, setSchemaVersion, getSchemaVersion } from "../migrationFramework.js";
import { ensureIntegritySchema } from "../integrityStore.js";
import { db } from "../../db.js";

registerMigration({
  id: "integrity_framework_v1",
  description:
    "Ensure quarantine/repair/migration tables exist and stamp gameplay_schema_version",
  targetVersion: CURRENT_SCHEMA_VERSION,
  async forward(ctx) {
    ensureIntegritySchema();
    const scanned = {
      users: db.prepare("SELECT COUNT(*) AS c FROM users").get()?.c ?? 0,
      entities: db.prepare("SELECT COUNT(*) AS c FROM entities").get()?.c ?? 0,
      wallet_operations: db.prepare("SELECT COUNT(*) AS c FROM wallet_operations").get()?.c ?? 0,
    };
    if (!ctx.dryRun) {
      setSchemaVersion(CURRENT_SCHEMA_VERSION);
    }
    ctx.saveCheckpoint({ phase: "tables_ready", scanned });
    return {
      records_scanned: scanned,
      proposed: ctx.dryRun
        ? { set_schema_version: CURRENT_SCHEMA_VERSION }
        : { schema_version: CURRENT_SCHEMA_VERSION },
    };
  },
  async validate(_ctx, forwardResult) {
    ensureIntegritySchema();
    const tables = ["data_quarantine", "repair_audit_log", "migration_runs", "migration_checkpoints"];
    for (const t of tables) {
      const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
      if (!row) return { ok: false, missing_table: t };
    }
    if (!_ctx.dryRun) {
      const v = getSchemaVersion();
      if (v < CURRENT_SCHEMA_VERSION) {
        return { ok: false, schema_version: v, expected: CURRENT_SCHEMA_VERSION };
      }
    }
    return { ok: true, forwardResult };
  },
});

registerMigration({
  id: "export_entity_types_arenamatch_note_v1",
  description:
    "Documentation/checkpoint migration: ArenaMatch entity type should be included in export lists (no data rewrite)",
  targetVersion: CURRENT_SCHEMA_VERSION,
  async forward(ctx) {
    // Non-destructive: only records that export constants should include ArenaMatch.
    const note = {
      action: "ensure_export_lists_include_ArenaMatch",
      data_mutations: 0,
    };
    ctx.saveCheckpoint({ phase: "noted", note });
    return {
      records_scanned: 0,
      records_valid: 0,
      proposed_mutations: ctx.dryRun ? [note] : [],
      applied: ctx.dryRun ? 0 : 0,
      message: "No player data rewritten — update migration/constants.js in deploy",
    };
  },
  async validate() {
    return { ok: true };
  },
});
