/**
 * Centralized audit-log tests.
 * Run: npm run test:audit
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-audit-"));
process.env.DB_PATH = path.join(tmpDir, "test-audit.db");

const { withTransactionAsync, db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  recordAuditEntry,
  recordCurrencyChange,
  recordAdminAction,
  annotateAudit,
  searchAuditLogs,
  getAuditDetail,
  exportAuditLogs,
  auditCasinoSettle,
  auditMiningEvent,
  auditDungeonBattle,
  auditFuelPurchase,
  auditAdminEntityWrite,
  auditAuthEvent,
  purgeExpiredAudits,
  ActorTypes,
  AuditError,
  AuditErrors,
  AuditResults,
  isKnownAction,
  redactValue,
  assertImmutable,
} = await import("../src/audit/index.js");

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

console.log("\nAudit system tests\n");

test("known actions registered", () => {
  assert.equal(isKnownAction("currency_granted"), true);
  assert.equal(isKnownAction("client_hack"), false);
  for (const action of [
    "casino_settled",
    "mining_started",
    "mining_collected",
    "mining_cancelled",
    "dungeon_battle_completed",
    "fuel_purchased",
    "login_succeeded",
    "login_failed",
    "password_reset_requested",
    "password_reset_completed",
    "guild_leadership_transferred",
    "admin_entity_created",
    "admin_entity_updated",
    "admin_entity_deleted",
    "remote_config_updated",
    "audit_retention_purged",
  ]) {
    assert.equal(isKnownAction(action), true, action);
  }
});

test("redacts forbidden fields", () => {
  const out = redactValue({ password: "secret", stardust: 10, nested: { access_token: "x" } });
  assert.equal(out.password, "[redacted]");
  assert.equal(out.nested.access_token, "[redacted]");
  assert.equal(out.stardust, 10);
});

test("rejects unknown action", () => {
  assert.throws(
    () => recordAuditEntry({ action: "not_a_real_action", actorType: ActorTypes.SYSTEM }),
    (e) => e instanceof AuditError && e.code === AuditErrors.UNKNOWN_ACTION
  );
});

test("admin currency grant requires reason", () => {
  assert.throws(
    () =>
      recordAuditEntry({
        action: "currency_granted",
        actorType: ActorTypes.ADMINISTRATOR,
        actorId: "a1",
      }),
    (e) => e.code === AuditErrors.REASON_REQUIRED
  );
});

test("records currency change with before/after", () => {
  const entry = recordCurrencyChange({
    user: { id: "acct-1", role: "admin" },
    character: { id: "char-1", created_by_id: "acct-1" },
    currencyType: "stardust",
    before: 1000,
    after: 1500,
    amount: 500,
    reasonText: "test grant",
    actorType: ActorTypes.ADMINISTRATOR,
    administratorNote: "test grant",
  });
  assert.equal(entry.action, "currency_granted");
  assert.equal(entry.beforeState.stardust, 1000);
  assert.equal(entry.afterState.stardust, 1500);
  assert.equal(entry.changeSet.amount, 500);
  assert.ok(entry.contentHash);
  assert.ok(entry.chainSequence >= 1);
});

test("idempotent write returns same entry", () => {
  const a = recordAuditEntry({
    action: "player_muted",
    actorType: ActorTypes.ADMINISTRATOR,
    actorId: "admin-1",
    actorAccountId: "admin-1",
    targetCharacterId: "char-x",
    reasonText: "spam",
    idempotencyKey: "mute-test-1",
  });
  const b = recordAuditEntry({
    action: "player_muted",
    actorType: ActorTypes.ADMINISTRATOR,
    actorId: "admin-1",
    actorAccountId: "admin-1",
    targetCharacterId: "char-x",
    reasonText: "spam",
    idempotencyKey: "mute-test-1",
  });
  assert.equal(a.auditId, b.auditId);
  assert.equal(b.idempotentReplay, true);
});

await testAsync("critical audit shares transaction with currency update", async () => {
  const ch = entities.Character.create({
    name: "AuditHero",
    created_by_id: "acct-tx",
    stardust: 500,
    level: 5,
  });

  await withTransactionAsync(() => {
    const before = ch.stardust;
    const after = before - 100;
    entities.Character.update(ch.id, { stardust: after });
    recordCurrencyChange({
      user: { id: "acct-tx", role: "user" },
      character: ch,
      currencyType: "stardust",
      before,
      after,
      amount: -100,
      reasonCode: "shop_purchase",
      actorType: ActorTypes.PLAYER,
      idempotencyKey: "tx-currency-1",
    });
  });

  assert.equal(entities.Character.get(ch.id).stardust, 400);
  const found = searchAuditLogs({ characterId: ch.id, action: "currency_spent" });
  assert.ok(found.total >= 1);
});

await testAsync("rollback drops uncommitted audit when critical write fails", async () => {
  const ch = entities.Character.create({
    name: "RollbackHero",
    created_by_id: "acct-rb",
    stardust: 900,
  });
  const beforeCount = searchAuditLogs({ characterId: ch.id }).total;

  let threw = false;
  try {
    await withTransactionAsync(() => {
      entities.Character.update(ch.id, { stardust: 800 });
      recordCurrencyChange({
        user: { id: "acct-rb", role: "user" },
        character: ch,
        currencyType: "stardust",
        before: 900,
        after: 800,
        actorType: ActorTypes.PLAYER,
        idempotencyKey: "tx-rollback-1",
      });
      throw Object.assign(new Error("forced fail"), { status: 500 });
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
  assert.equal(entities.Character.get(ch.id).stardust, 900);
  assert.equal(searchAuditLogs({ characterId: ch.id }).total, beforeCount);
});

test("annotation does not mutate original entry", () => {
  const entry = recordAdminAction(
    { id: "admin-2", email: "admin@loot.local" },
    {
      action: "admin_player_edit",
      targetId: "char-2",
      reasonText: "rename",
      beforeState: { name: "A" },
      afterState: { name: "B" },
    }
  );
  const annotation = annotateAudit(
    { id: "admin-2", email: "admin@loot.local" },
    entry.auditId,
    "Verified by support"
  );
  const detail = getAuditDetail(entry.auditId);
  assert.equal(detail.entry.beforeState.name, "A");
  assert.equal(detail.annotations.length >= 1, true);
  assert.equal(annotation.note, "Verified by support");
});

test("export records export audit entry", () => {
  const exported = exportAuditLogs(
    { id: "admin-3", email: "a@b.c" },
    { limit: 10 }
  );
  assert.ok(exported.exportId);
  const meta = searchAuditLogs({ action: "audit_export_requested" });
  assert.ok(meta.total >= 1);
});

test("assertImmutable throws", () => {
  assert.throws(() => assertImmutable(), (e) => e.code === "AUDIT_IMMUTABLE");
});

test("search filters by category", () => {
  const r = searchAuditLogs({ category: "currency", limit: 20 });
  assert.ok(r.items.every((i) => i.category === "currency"));
});

test("casino / mining / dungeon / fuel helpers record", () => {
  const user = { id: "acct-play", role: "user", email: "p@loot.local" };
  const character = { id: "char-play", created_by_id: "acct-play", stardust: 100 };

  assert.equal(
    auditCasinoSettle({
      user,
      character,
      game: "slots",
      bet: 10,
      beforeStardust: 100,
      afterStardust: 120,
      outcome: { win: true },
      correlationId: "casino-1",
    }).action,
    "casino_settled"
  );
  assert.equal(
    auditMiningEvent({
      user,
      character,
      action: "mining_collected",
      before: { stardust: 100 },
      after: { stardust: 105 },
      stardustGained: 5,
      hours: 1,
    }).action,
    "mining_collected"
  );
  assert.equal(
    auditDungeonBattle({
      user,
      character,
      won: true,
      beforeStardust: 105,
      afterStardust: 125,
      rewards: { stardust: 20, experience: 10 },
    }).action,
    "dungeon_battle_completed"
  );
  assert.equal(
    auditFuelPurchase({
      user,
      character,
      beforeNova: 50,
      afterNova: 40,
      beforeFuel: 10,
      afterFuel: 60,
      cost: 10,
    }).action,
    "fuel_purchased"
  );
});

test("admin entity write maps SiteConfig to remote_config_updated", () => {
  const admin = { id: "admin-cfg", role: "admin", email: "cfg@loot.local" };
  const site = auditAdminEntityWrite({
    user: admin,
    entityType: "SiteConfig",
    op: "update",
    entityId: "cfg-1",
    before: { feature_x: false },
    after: { feature_x: true },
    reasonText: "toggle feature",
  });
  assert.equal(site.action, "remote_config_updated");

  const raw = auditAdminEntityWrite({
    user: admin,
    entityType: "ItemTemplate",
    op: "create",
    entityId: "tpl-1",
    after: { name: "Blade" },
    reasonText: "seed template",
  });
  assert.equal(raw.action, "admin_entity_created");
});

test("auth helper records login and reset actions", () => {
  assert.equal(
    auditAuthEvent({
      action: "login_succeeded",
      user: { id: "u1", email: "u@loot.local", role: "user" },
      result: AuditResults.SUCCESS,
    }).action,
    "login_succeeded"
  );
  assert.equal(
    auditAuthEvent({
      action: "password_reset_requested",
      email: "u@loot.local",
      result: AuditResults.SUCCESS,
    }).action,
    "password_reset_requested"
  );
});

test("purgeExpiredAudits deletes aged non-held rows", () => {
  const old = recordAuditEntry({
    action: "login_failed",
    actorType: ActorTypes.PLAYER,
    actorId: "purge-user",
    actorAccountId: "purge-acct",
  });
  // Writer ignores client timestamps; backdate so retention expires.
  db.prepare("UPDATE audit_logs SET occurred_at = ? WHERE id = ?").run(
    "2000-01-01T00:00:00.000Z",
    old.auditId
  );
  const result = purgeExpiredAudits({ limit: 100, nowIso: "2030-01-01T00:00:00.000Z" });
  assert.ok(result.deleted >= 1);
  assert.equal(getAuditDetail(old.auditId), null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
