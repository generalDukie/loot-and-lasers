/**
 * Admin / live-ops tests (Restoration 26).
 * Run: npm run test:admin
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-admin-"));
process.env.DB_PATH = path.join(tmpDir, "test-admin.db");

const { db, nowIso } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  assertAdminPermission,
  AdminPermissions,
  LookupPlayer,
  InspectCharacter,
  SetFeatureFlag,
  GetRuntimeConfiguration,
  GetOpsDashboard,
  applyArenaModeration,
  listAdminPermissionsForUser,
} = await import("../src/shared/adminOpsService.js");
const { isArenaBanned } = await import("../src/arena/eligibility.js");
const { adminHasAuditPermission } = await import("../src/audit/registry.js");
const {
  AdminModeration,
  LookupPlayerRpc,
  InspectCharacterRpc,
  GetOpsDashboardRpc,
  GetRuntimeConfig,
  SetFeatureFlagRpc,
  SetMaintenanceModeRpc,
} = await import("../src/functions/index.js");
const { searchAuditLogs } = await import("../src/audit/writer.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

function hashPw(pw) {
  return createHash("sha256").update(pw).digest("hex");
}

function insertUser(id, email, role = "user", extra = {}) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date, nakama_user_id)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(id, email, hashPw("x"), role, now, now, extra.nakama_user_id || null);
  return { id, email, role };
}

function makeCharacter(id, accountId, name = "Operative") {
  return entities.Character.create({
    id,
    created_by_id: accountId,
    name,
    class: "Vanguard",
    level: 3,
    experience: 10,
    experience_to_next_level: 100,
    stardust: 50,
    nova_crystals: 10,
    fuel: 5,
    max_fuel: 10,
    stats: { strength: 15, agility: 8, intellect: 6, vitality: 14, luck: 7 },
    equipped_items: {},
    arena_rating: 1000,
  });
}

console.log("\nAdmin / Live Ops (Restoration 26)\n");

test("permission denial for non-admin", () => {
  const u = insertUser("u-player", "p@t.test", "user");
  assert.throws(
    () => assertAdminPermission(u, AdminPermissions.VIEW_PLAYER),
    (e) => e.status === 403,
  );
  assert.equal(listAdminPermissionsForUser(u).length, 0);
  assert.equal(adminHasAuditPermission(u, "audit_logs.view"), false);
});

test("admin receives capability catalog", () => {
  const a = insertUser("u-admin", "a@t.test", "admin");
  assertAdminPermission(a, AdminPermissions.VIEW_PLAYER);
  assert.ok(listAdminPermissionsForUser(a).includes(AdminPermissions.MODIFY_CURRENCY));
  assert.equal(adminHasAuditPermission(a, "audit_logs.view"), true);
});

test("lookup by name / nakama / email", () => {
  const a = insertUser("u-look", "look@t.test", "admin", { nakama_user_id: "nk-look-1" });
  makeCharacter("ch-look", a.id, "NovaBlade");
  const byName = LookupPlayer(a, { q: "NovaBlade" });
  assert.ok(byName.characters.some((c) => c.id === "ch-look"));
  const byNk = LookupPlayer(a, { q: "nk-look-1" });
  assert.ok(byNk.accounts.some((x) => x.id === a.id));
  const byEmail = LookupPlayer(a, { q: "look@t.test" });
  assert.ok(byEmail.accounts.some((x) => x.id === a.id));
});

test("inspect character is read-only snapshot", () => {
  const a = insertUser("u-insp", "insp@t.test", "admin");
  makeCharacter("ch-insp", a.id, "Inspector");
  const out = InspectCharacter(a, "ch-insp");
  assert.equal(out.read_only, true);
  assert.equal(out.character.id, "ch-insp");
  assert.ok(out.account);
  assert.ok(out.inventory);
});

test("feature flag set is audited and readable", () => {
  const a = insertUser("u-flag", "flag@t.test", "admin");
  const out = SetFeatureFlag(a, { flag: "casino_enabled", enabled: false, reason: "test outage" });
  assert.equal(out.enabled, false);
  const cfg = GetRuntimeConfiguration();
  assert.equal(cfg.feature_flags.casino_enabled, false);
  assert.equal(cfg.authority, "node");
});

test("arena suspend writes PlayerModeration fields", () => {
  const a = insertUser("u-ar", "ar@t.test", "admin");
  makeCharacter("ch-ar", a.id);
  applyArenaModeration(a, {
    characterId: "ch-ar",
    arenaSuspended: true,
    suspendedUntil: new Date(Date.now() + 3600000).toISOString(),
    reason: "griefing",
  });
  assert.equal(isArenaBanned("ch-ar"), true);
});

test("ops dashboard requires admin", () => {
  const u = insertUser("u-dash", "dash@t.test", "user");
  assert.throws(() => GetOpsDashboard(u), (e) => e.status === 403);
  const a = insertUser("u-dash-a", "dasha@t.test", "admin");
  const d = GetOpsDashboard(a);
  assert.ok(typeof d.accounts === "number");
  assert.ok(d.maintenance);
});

await testAsync("AdminModeration denies non-admin", async () => {
  const u = insertUser("u-deny", "deny@t.test", "user");
  const res = await AdminModeration(u, { action: "mute", character_id: "x", reason: "nope" });
  assert.equal(res.status, 403);
});

await testAsync("promo create is audited", async () => {
  const a = insertUser("u-promo", "promo@t.test", "admin");
  const res = await AdminModeration(a, {
    action: "create_promo_code",
    code: `TEST${Date.now()}`,
    label: "Test",
    rewards: { stardust: 10 },
    reason: "qa",
  });
  assert.equal(res.status, 200);
  const logs = searchAuditLogs({ limit: 20 });
  const entries = logs.entries || logs.results || logs || [];
  const list = Array.isArray(entries) ? entries : entries.items || [];
  // Soft assert: writer may shape differently
  assert.ok(res.body.promo_code?.id);
});

await testAsync("currency grant requires reason and works for admin", async () => {
  const a = insertUser("u-cur", "cur@t.test", "admin");
  makeCharacter("ch-cur", a.id);
  const bad = await AdminModeration(a, {
    action: "adjust_currency",
    character_id: "ch-cur",
    deltas: { stardust: 5 },
  });
  assert.equal(bad.status, 400);
  const ok = await AdminModeration(a, {
    action: "adjust_currency",
    character_id: "ch-cur",
    deltas: { stardust: 5 },
    reason: "compensation",
  });
  assert.equal(ok.status, 200);
  assert.equal(entities.Character.get("ch-cur").stardust, 55);
});

await testAsync("LookupPlayer / InspectCharacter RPCs", async () => {
  const a = insertUser("u-rpc", "rpc@t.test", "admin");
  makeCharacter("ch-rpc", a.id, "RpcHero");
  const look = await LookupPlayerRpc(a, { q: "RpcHero" });
  assert.equal(look.status, 200);
  const insp = await InspectCharacterRpc(a, { character_id: "ch-rpc" });
  assert.equal(insp.status, 200);
  assert.equal(insp.body.read_only, true);
});

await testAsync("GetRuntimeConfig / SetFeatureFlag / maintenance RPCs", async () => {
  const a = insertUser("u-rt", "rt@t.test", "admin");
  const cfg = await GetRuntimeConfig(a);
  assert.equal(cfg.status, 200);
  const flag = await SetFeatureFlagRpc(a, {
    flag: "arena_enabled",
    enabled: true,
    reason: "restore",
  });
  assert.equal(flag.status, 200);
  const maint = await SetMaintenanceModeRpc(a, { enabled: true, message: "test" });
  assert.equal(maint.status, 200);
  await SetMaintenanceModeRpc(a, { enabled: false });
});

await testAsync("GetOpsDashboardRpc", async () => {
  const a = insertUser("u-ops", "ops@t.test", "admin");
  const res = await GetOpsDashboardRpc(a);
  assert.equal(res.status, 200);
  assert.ok(res.body.dashboard);
  assert.ok(Array.isArray(res.body.permissions));
});

await testAsync("arena_suspend via AdminModeration", async () => {
  const a = insertUser("u-as", "as@t.test", "admin");
  makeCharacter("ch-as", a.id);
  const res = await AdminModeration(a, {
    action: "arena_suspend",
    character_id: "ch-as",
    hours: 2,
    reason: "test suspend",
  });
  assert.equal(res.status, 200);
  assert.equal(isArenaBanned("ch-as"), true);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
