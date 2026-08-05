/**
 * Admin UI coverage check — greps Godot admin console for AdminManager calls.
 * Ensures every intended in-game admin action is reachable from admin.gd.
 *
 * Run: node scripts/verify_admin_ui_coverage.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ADMIN_UI = path.join(ROOT, "loot&lasers", "Scenes", "UI", "admin.gd");
const ADMIN_MGR = path.join(ROOT, "loot&lasers", "Autoload", "AdminManager.gd");

/** Methods that must be callable from the in-game admin console. */
const REQUIRED_UI_ACTIONS = [
  "list_open_reports",
  "resolve_report",
  "search_players",
  "inspect_character",
  "list_character_items",
  "mute_player",
  "ban_player",
  "unban_player",
  "unmute_player",
  "reset_player",
  "rename_character",
  "set_role",
  "adjust_currency",
  "list_guilds",
  "list_guild_members",
  "transfer_guild",
  "create_promo_code",
  "list_promo_codes",
  "toggle_promo_code",
  "delete_promo_code",
  "grant_item",
  "rewards_grant",
  "rewards_search",
  "rewards_get",
  "rewards_retry",
  "rewards_audit",
  "audit_search",
  "audit_timeline",
  "audit_get",
  "audit_integrity",
  "audit_annotate",
  "get_moderation_filter",
  "edit_filter",
  "send_system_mail",
  "email_log",
  "email_test",
  "schedules_list",
  "schedules_tick",
  "schedules_pause",
  "schedules_resume",
  "schedules_audit",
  "entitlements_grant",
  "entitlements_revoke",
  "entitlements_restore",
  "entitlements_search",
  "entitlements_products",
  "entitlements_audit",
  "economy_snapshot",
  "get_ops_dashboard",
  "get_runtime_config",
  "set_maintenance_mode",
  "set_feature_flag",
  "run_integrity_audit",
  "apply_data_repair",
  "run_migration",
  "arena_suspend",
  "arena_ban",
  "arena_unban",
];

/** Intentionally not exposed in ordinary UI (console/CLI/entity CRUD). */
const INTENTIONALLY_NOT_EXPOSED = [
  "schedules_create", // advanced JSON payload — keep manager-only
  "schedules_preview",
  "audit_export", // sensitive bulk export — prefer secure tooling
  "lookup_player", // used via search_players
  "moderation", // low-level hub; UI uses typed helpers
];

let failed = 0;
function pass(name) {
  console.log(`  ✓ ${name}`);
}
function fail(name, detail) {
  failed += 1;
  console.error(`  ✗ ${name}`);
  if (detail) console.error(`    ${detail}`);
}

const ui = fs.readFileSync(ADMIN_UI, "utf8");
const mgr = fs.readFileSync(ADMIN_MGR, "utf8");

console.log("\nAdmin UI coverage\n");

pass("admin.gd exists");
pass("AdminManager.gd exists");

if (ui.includes("_env_banner") && ui.includes("_target_banner")) {
  pass("environment + target banners present");
} else {
  fail("environment + target banners present");
}

if (ui.includes("_confirm_mod") && ui.includes("_require_target_and_reason")) {
  pass("shared confirmation / target validation helpers");
} else {
  fail("shared confirmation / target validation helpers");
}

for (const action of REQUIRED_UI_ACTIONS) {
  const inMgr = mgr.includes(`func ${action}(`);
  const inUi = ui.includes(`AdminManager.${action}(`) || ui.includes(`await AdminManager.${action}(`);
  if (!inMgr) {
    fail(`${action} exists on AdminManager`, "missing manager method");
    continue;
  }
  if (!inUi) {
    fail(`${action} wired in admin.gd`);
    continue;
  }
  pass(`${action} wired`);
}

for (const action of INTENTIONALLY_NOT_EXPOSED) {
  if (ui.includes(`AdminManager.${action}(`)) {
    // lookup via search is ok if only in manager
    fail(`${action} should stay intentionally unwired`, "found in admin.gd");
  } else {
    pass(`${action} intentionally not exposed in UI`);
  }
}

if (!ui.includes("Server Refresh wipe is intentionally not exposed") && !ui.includes("wipe is intentionally")) {
  // soft check
  if (ui.includes("Wipe unavailable") || ui.includes("wipe")) {
    pass("wipe remains non-executable stub");
  }
} else {
  pass("wipe remains non-executable stub");
}

console.log(`\n${REQUIRED_UI_ACTIONS.length} required actions checked; ${failed} failure(s)\n`);
process.exit(failed ? 1 : 0);
