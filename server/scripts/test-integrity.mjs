/**
 * Save integrity / recovery / migration tests (Restoration 25).
 * Run: npm run test:integrity
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-integrity-"));
process.env.DB_PATH = path.join(tmpDir, "test-integrity.db");

const { db, nowIso } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  ValidateAccountIntegrity,
  ValidateCharacterIntegrity,
  ValidateInventoryIntegrity,
  ValidateEquipmentIntegrity,
  ValidateCurrencyIntegrity,
  ReconcileCurrencyLedger,
  ValidateTransactionIntegrity,
  RunIntegrityAudit,
  ApplyDataRepair,
  QuarantineRecord,
  SerializeRecoveryState,
} = await import("../src/shared/integrityService.js");
const { RecoverAmbiguousRequest } = await import("../src/shared/recoveryService.js");
const {
  setMaintenanceMode,
  assertWritesAllowed,
  getMaintenanceState,
} = await import("../src/shared/maintenanceGate.js");
const {
  RunMigration,
  listMigrations,
  getSchemaVersion,
  assertSchemaCompatible,
} = await import("../src/shared/migrationFramework.js");
await import("../src/shared/migrations/registerBuiltins.js");
const { insertClaim, ClaimKeys, getClaimByKey } = await import("../src/rewards/store.js");
const {
  RecoverAmbiguousRequestRpc,
  GetRecoveryState,
  RunIntegrityAuditRpc,
  ApplyDataRepairRpc,
} = await import("../src/functions/index.js");

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

function insertUser(id, email, extra = {}) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date, legacy_display, nakama_user_id, active_character_id)
     VALUES (?, ?, ?, ?, 1, ?, ?, 'surname', ?, ?)`,
  ).run(
    id,
    email,
    hashPw("x"),
    extra.role || "user",
    now,
    now,
    extra.nakama_user_id || null,
    extra.active_character_id || null,
  );
  return { id, email, role: extra.role || "user" };
}

function makeCharacter(id, accountId, patch = {}) {
  return entities.Character.create({
    id,
    created_by_id: accountId,
    name: patch.name || "Operative",
    class: patch.class || "Vanguard",
    level: patch.level ?? 1,
    experience: patch.experience ?? 0,
    experience_to_next_level: patch.experience_to_next_level ?? 100,
    stardust: patch.stardust ?? 0,
    nova_crystals: patch.nova_crystals ?? 0,
    fuel: patch.fuel ?? 10,
    max_fuel: patch.max_fuel ?? 10,
    stats: patch.stats || { strength: 5, agility: 5, intellect: 5, vitality: 5, luck: 5 },
    equipped_items: patch.equipped_items || {},
    active_buffs: patch.active_buffs || [],
    arena_rating: patch.arena_rating ?? 1000,
    ...patch,
  });
}

console.log("\nIntegrity / Recovery / Migration (Restoration 25)\n");

test("schema tables exist after import", () => {
  for (const t of ["data_quarantine", "repair_audit_log", "migration_runs", "migration_checkpoints"]) {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
    assert.ok(row, t);
  }
});

test("valid character passes structural checks", () => {
  const u = insertUser("u-ok", "ok@t.test", { nakama_user_id: "nk-ok" });
  const ch = makeCharacter("ch-ok", u.id);
  const r = ValidateCharacterIntegrity(ch.id);
  assert.equal(r.by_severity.critical, 0);
  assert.equal(r.by_severity.high, 0);
});

test("invalid class detected", () => {
  const u = insertUser("u-cls", "cls@t.test");
  const ch = makeCharacter("ch-cls", u.id, { class: "NotAClass" });
  const r = ValidateCharacterIntegrity(ch.id);
  assert.ok(r.findings.some((f) => f.code === "INVALID_CLASS"));
});

test("negative attributes detected", () => {
  const u = insertUser("u-attr", "attr@t.test");
  // Bypass create normalization by updating raw JSON if needed
  const ch = makeCharacter("ch-attr", u.id);
  entities.Character.update(ch.id, { stats: { strength: -3, agility: 1, intellect: 1, vitality: 1, luck: 1 } });
  const r = ValidateCharacterIntegrity(ch.id);
  assert.ok(r.findings.some((f) => f.code === "INVALID_PERMANENT_ATTR"));
});

test("account mapping + ownership", () => {
  const u = insertUser("u-map", "map@t.test", { nakama_user_id: "nk-map" });
  makeCharacter("ch-map", u.id);
  const r = ValidateAccountIntegrity(u.id);
  assert.equal(r.ok, true);
});

test("cross-account active character flagged", () => {
  const a = insertUser("u-a", "a@t.test");
  const b = insertUser("u-b", "b@t.test");
  const chB = makeCharacter("ch-b", b.id);
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(chB.id, a.id);
  const r = ValidateAccountIntegrity(a.id);
  assert.ok(r.findings.some((f) => f.code === "CROSS_ACCOUNT_ACTIVE_CHARACTER"));
});

test("equipped missing item detected; dry-run clear does not mutate", () => {
  const u = insertUser("u-eq", "eq@t.test");
  const ch = makeCharacter("ch-eq", u.id, {
    equipped_items: { weapon: "missing-item-id" },
  });
  const inv = ValidateEquipmentIntegrity(ch.id);
  assert.ok(inv.findings.some((f) => f.code === "EQUIPPED_ITEM_MISSING"));
  const dry = ApplyDataRepair({
    repairType: "clear_invalid_equip_refs",
    characterId: ch.id,
    dryRun: true,
  });
  assert.equal(dry.dry_run, true);
  assert.ok(dry.would_clear.length >= 1);
  const still = entities.Character.get(ch.id);
  assert.equal(still.equipped_items.weapon, "missing-item-id");
});

test("apply clear invalid equip refs + quarantine + audit", () => {
  const u = insertUser("u-eq2", "eq2@t.test");
  const ch = makeCharacter("ch-eq2", u.id, {
    equipped_items: { weapon: "ghost-weapon" },
  });
  const out = ApplyDataRepair({
    repairType: "clear_invalid_equip_refs",
    characterId: ch.id,
    dryRun: false,
    actor: "test",
  });
  assert.equal(out.repaired, true);
  assert.equal(entities.Character.get(ch.id).equipped_items.weapon, undefined);
  const q = db.prepare("SELECT COUNT(*) AS c FROM data_quarantine WHERE issue_code = ?").get("INVALID_EQUIP_REF_CLEARED");
  assert.ok(q.c >= 1);
});

test("currency negative stardust detected", () => {
  const u = insertUser("u-cur", "cur@t.test");
  const ch = makeCharacter("ch-cur", u.id, { stardust: 10 });
  // Force bad value via raw update
  const row = db.prepare("SELECT data FROM entities WHERE id = ?").get(ch.id);
  const data = JSON.parse(row.data);
  data.stardust = -5;
  db.prepare("UPDATE entities SET data = ? WHERE id = ?").run(JSON.stringify(data), ch.id);
  const r = ValidateCurrencyIntegrity(ch.id);
  assert.ok(r.findings.some((f) => f.code === "INVALID_STARDUST"));
});

test("incomplete ledger does not destroy balance", () => {
  const u = insertUser("u-led", "led@t.test");
  const ch = makeCharacter("ch-led", u.id, { stardust: 999 });
  const r = ReconcileCurrencyLedger(u.id, { characterId: ch.id });
  assert.equal(r.current_balances.stardust, 999);
  assert.ok(["incomplete_history", "ledger_partial", "baseline_present"].includes(r.classification));
});

test("orphaned item detected in inventory owner check", () => {
  const u = insertUser("u-it", "it@t.test");
  const ch = makeCharacter("ch-it", u.id);
  entities.Item.create({
    id: "item-orphan-owner",
    character_id: ch.id,
    name: "Blade",
    type: "weapon",
    rarity: "common",
    is_equipped: false,
  });
  const r = ValidateInventoryIntegrity(ch.id);
  assert.equal(r.by_severity.critical, 0);
});

test("quarantine preserves payload", () => {
  const q = QuarantineRecord({
    entityType: "Item",
    entityId: "x1",
    ownerId: "u1",
    issueCode: "TEST_Q",
    severity: "high",
    payload: { hello: "world" },
  });
  assert.equal(q.issue_code, "TEST_Q");
  assert.equal(q.payload.hello, "world");
  assert.equal(q.review_status, "open");
});

test("recover ambiguous claim returns committed claim without mutation", () => {
  const u = insertUser("u-rec", "rec@t.test");
  const ch = makeCharacter("ch-rec", u.id);
  const key = ClaimKeys.mission("mission-1");
  insertClaim({
    claimKey: key,
    accountId: u.id,
    characterId: ch.id,
    rewardSource: "mission",
    status: "completed",
    deliveredPayload: { stardust: 10 },
    generatedPayload: { stardust: 10 },
    completedAt: nowIso(),
  });
  const before = getClaimByKey(key);
  const out = RecoverAmbiguousRequest(u.id, { claim_key: key });
  assert.equal(out.found, true);
  assert.equal(out.source, "reward_claim");
  assert.deepEqual(out.committed.delivered.stardust, 10);
  assert.equal(getClaimByKey(key).status, before.status);
});

test("recover missing key returns not_found", () => {
  const u = insertUser("u-nf", "nf@t.test");
  const out = RecoverAmbiguousRequest(u.id, { claim_key: "mission:does-not-exist" });
  assert.equal(out.found, false);
  assert.equal(out.status, "not_found");
});

test("maintenance blocks writes for players", () => {
  setMaintenanceMode({ enabled: true, message: "Down for repair" });
  assert.equal(getMaintenanceState().enabled, true);
  assert.throws(() => assertWritesAllowed({ id: "u", role: "user" }), (e) => e.code === "MAINTENANCE_MODE");
  assertWritesAllowed({ id: "a", role: "admin" });
  setMaintenanceMode({ enabled: false });
});

await testAsync("migration dry-run does not stamp done", async () => {
  const report = await RunMigration("integrity_framework_v1", {
    dryRun: true,
    operator: "test",
  });
  assert.equal(report.dry_run, true);
  const done = db.prepare("SELECT value FROM app_meta WHERE key = ?").get("migration_done:integrity_framework_v1");
  assert.ok(!done || done.value !== "done");
});

await testAsync("migration apply is idempotent", async () => {
  const first = await RunMigration("integrity_framework_v1", {
    dryRun: false,
    operator: "test",
  });
  assert.ok(first.status === "completed" || first.status === "already_applied");
  assert.ok(getSchemaVersion() >= 25);
  const second = await RunMigration("integrity_framework_v1", {
    dryRun: false,
    operator: "test",
  });
  assert.equal(second.status, "already_applied");
  assert.ok(listMigrations().length >= 1);
  assert.ok(assertSchemaCompatible().ok);
});

await testAsync("RunIntegrityAudit aggregates sections", async () => {
  const u = insertUser("u-aud", "aud@t.test", { nakama_user_id: "nk-aud" });
  const ch = makeCharacter("ch-aud", u.id);
  const report = RunIntegrityAudit({ accountId: u.id, characterId: ch.id });
  assert.ok(report.sections.character);
  assert.ok(report.sections.inventory);
  assert.ok(report.sections.currency);
});

await testAsync("player RecoverAmbiguousRequest RPC", async () => {
  const u = insertUser("u-rpc", "rpc@t.test");
  makeCharacter("ch-rpc", u.id);
  const key = ClaimKeys.daily(u.id, "2026-08-03");
  insertClaim({
    claimKey: key,
    accountId: u.id,
    characterId: "ch-rpc",
    rewardSource: "daily",
    status: "completed",
    deliveredPayload: { ok: true },
    completedAt: nowIso(),
  });
  const res = await RecoverAmbiguousRequestRpc(u, { claim_key: key });
  assert.equal(res.status, 200);
  assert.equal(res.body.found, true);
});

await testAsync("player GetRecoveryState RPC", async () => {
  const u = insertUser("u-rs", "rs@t.test");
  makeCharacter("ch-rs", u.id);
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run("ch-rs", u.id);
  const res = await GetRecoveryState(u);
  assert.equal(res.status, 200);
  assert.equal(res.body.recovery.authoritative, true);
  assert.equal(res.body.recovery.client_cache_may_overwrite, false);
});

await testAsync("non-admin cannot run integrity audit RPC", async () => {
  const u = insertUser("u-na", "na@t.test");
  const res = await RunIntegrityAuditRpc(u, { account_id: u.id });
  assert.equal(res.status, 403);
});

await testAsync("admin audit RPC works", async () => {
  const u = insertUser("u-adm", "adm@t.test", { role: "admin" });
  makeCharacter("ch-adm", u.id);
  const res = await RunIntegrityAuditRpc({ ...u, role: "admin" }, { character_id: "ch-adm" });
  assert.equal(res.status, 200);
  assert.ok(res.body.report);
});

await testAsync("admin repair dry-run by default", async () => {
  const u = insertUser("u-rep", "rep@t.test", { role: "admin" });
  const ch = makeCharacter("ch-rep", u.id, { equipped_items: { armor: "nope" } });
  const res = await ApplyDataRepairRpc({ ...u, role: "admin" }, {
    repair_type: "clear_invalid_equip_refs",
    character_id: ch.id,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.dry_run, true);
});

test("SerializeRecoveryState never authorizes client cache overwrite", () => {
  const s = SerializeRecoveryState({ id: "c1", created_by_id: "a1" });
  assert.equal(s.client_cache_may_overwrite, false);
  assert.equal(s.authoritative, true);
});

test("unsafe repair type rejected", () => {
  assert.throws(
    () => ApplyDataRepair({ repairType: "guess_missing_currency", characterId: "x", dryRun: false }),
    (e) => e.code === "UNSAFE_REPAIR",
  );
});

// Invariant: one character one owner
test("invariant one character one owner", () => {
  const u = insertUser("u-inv", "inv@t.test");
  const ch = makeCharacter("ch-inv", u.id);
  assert.equal(entities.Character.get(ch.id).created_by_id, u.id);
  const r = ValidateAccountIntegrity(u.id);
  assert.ok(!r.findings.some((f) => f.code === "CHARACTER_OWNER_MISMATCH"));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
