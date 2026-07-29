/**
 * Entitlement unit tests (no external runner).
 * Run: node server/scripts/test-entitlements.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Isolate DB before importing modules that open SQLite
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-ent-"));
process.env.DB_PATH = path.join(tmpDir, "test-entitlements.db");

const {
  grantEntitlement,
  revokeEntitlement,
  consumeEntitlement,
  resolveEntitlement,
  resolveQuantity,
  resolveCharacterSlotCapacity,
  assertCanCreateCharacter,
  getEntitlementDefinition,
  requireEntitlement,
  EntitlementErrors,
  EntitlementError,
  verifyAndClaimPurchase,
  processExpiredEntitlements,
  clearEntitlementCache,
} = await import("../src/entitlements/index.js");
const { installFakeClock, resetClockState, clock } = await import("../src/shared/time/index.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    clearEntitlementCache();
    resetClockState();
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
    clearEntitlementCache();
    resetClockState();
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

console.log("\nEntitlement tests\n");

test("definition registry knows character_slot", () => {
  const d = getEntitlementDefinition("account.character_slot");
  assert.equal(d.scope, "account");
  assert.equal(getEntitlementDefinition("not.a.real.key"), null);
});

await testAsync("idempotent grant returns same row", async () => {
  const a = await grantEntitlement({
    entitlementKey: "account.rename_token",
    accountId: "acct-1",
    quantity: 1,
    sourceType: "administrator",
    idempotencyKey: "idem-rename-1",
    createdBy: "test",
  });
  const b = await grantEntitlement({
    entitlementKey: "account.rename_token",
    accountId: "acct-1",
    quantity: 1,
    sourceType: "administrator",
    idempotencyKey: "idem-rename-1",
    createdBy: "test",
  });
  assert.equal(a.entitlement.id, b.entitlement.id);
  assert.equal(b.idempotentReplay || !b.created, true);
});

await testAsync("unknown key fails closed on resolve", async () => {
  const r = resolveEntitlement({ entitlementKey: "nope.unknown", accountId: "acct-1" });
  assert.equal(r.entitled, false);
  assert.equal(r.reason, EntitlementErrors.ENTITLEMENT_UNKNOWN_KEY);
});

await testAsync("character slot capacity and create guard", async () => {
  await grantEntitlement({
    entitlementKey: "account.character_slot",
    accountId: "acct-slots",
    quantity: 1,
    sourceType: "migration",
    idempotencyKey: "slots-1",
  });
  const cap = resolveCharacterSlotCapacity("acct-slots");
  assert.equal(cap.capacity, 2);
  assertCanCreateCharacter("acct-slots", 1);
  assert.throws(
    () => assertCanCreateCharacter("acct-slots", 2),
    (e) => e.code === EntitlementErrors.CHARACTER_SLOT_LIMIT_REACHED
  );
});

await testAsync("consume rename token once; retry same operationId is safe", async () => {
  await grantEntitlement({
    entitlementKey: "account.rename_token",
    accountId: "acct-ren",
    quantity: 1,
    sourceType: "administrator",
    idempotencyKey: "ren-grant",
  });
  const c1 = await consumeEntitlement({
    entitlementKey: "account.rename_token",
    accountId: "acct-ren",
    quantity: 1,
    operationId: "op-ren-1",
    reason: "test",
  });
  assert.equal(c1.consumed, true);
  const c2 = await consumeEntitlement({
    entitlementKey: "account.rename_token",
    accountId: "acct-ren",
    quantity: 1,
    operationId: "op-ren-1",
    reason: "test",
  });
  assert.equal(c2.idempotentReplay, true);
  const q = resolveQuantity({ entitlementKey: "account.rename_token", accountId: "acct-ren" });
  assert.equal(q.quantity, 0);
  await assert.rejects(
    () =>
      consumeEntitlement({
        entitlementKey: "account.rename_token",
        accountId: "acct-ren",
        quantity: 1,
        operationId: "op-ren-2",
      }),
    (e) => e.code === EntitlementErrors.ENTITLEMENT_QUANTITY_INSUFFICIENT
  );
});

await testAsync("temporary entitlement expires by server clock", async () => {
  installFakeClock(Date.parse("2026-07-29T12:00:00.000Z"));
  await grantEntitlement({
    entitlementKey: "account.subscription_membership",
    accountId: "acct-sub",
    quantity: 1,
    sourceType: "administrator",
    idempotencyKey: "sub-1",
    expiresAt: "2026-07-29T13:00:00.000Z",
  });
  assert.equal(resolveEntitlement({ entitlementKey: "account.subscription_membership", accountId: "acct-sub" }).entitled, true);
  installFakeClock(Date.parse("2026-07-29T14:00:00.000Z"));
  clearEntitlementCache();
  const r = resolveEntitlement({
    entitlementKey: "account.subscription_membership",
    accountId: "acct-sub",
    bypassCache: true,
  });
  assert.equal(r.entitled, false);
  assert.equal(r.reason, EntitlementErrors.ENTITLEMENT_EXPIRED);
});

await testAsync("revoke blocks access; restore re-enables", async () => {
  const g = await grantEntitlement({
    entitlementKey: "account.founder_status",
    accountId: "acct-f",
    quantity: 1,
    sourceType: "administrator",
    idempotencyKey: "founder-1",
  });
  await revokeEntitlement({ entitlementId: g.entitlement.id, actor: "admin", reason: "test revoke" });
  clearEntitlementCache();
  assert.equal(resolveEntitlement({ entitlementKey: "account.founder_status", accountId: "acct-f", bypassCache: true }).entitled, false);
  const { restoreEntitlement } = await import("../src/entitlements/service.js");
  await restoreEntitlement({ entitlementId: g.entitlement.id, actor: "admin", reason: "test restore" });
  clearEntitlementCache();
  assert.equal(resolveEntitlement({ entitlementKey: "account.founder_status", accountId: "acct-f", bypassCache: true }).entitled, true);
});

await testAsync("external transaction cannot be claimed by two accounts", async () => {
  await grantEntitlement({
    entitlementKey: "account.premium_edition",
    accountId: "acct-a",
    quantity: 1,
    sourceType: "platform_purchase",
    externalProvider: "stripe",
    externalTransactionId: "tx_shared_1",
    idempotencyKey: "prem-a",
    verificationStatus: "verified",
  });
  await assert.rejects(
    () =>
      grantEntitlement({
        entitlementKey: "account.premium_edition",
        accountId: "acct-b",
        quantity: 1,
        sourceType: "platform_purchase",
        externalProvider: "stripe",
        externalTransactionId: "tx_shared_1",
        idempotencyKey: "prem-b",
        verificationStatus: "verified",
      }),
    (e) => e.code === EntitlementErrors.EXTERNAL_TRANSACTION_REUSED
  );
});

await testAsync("stripe claim fails closed without verification config", async () => {
  await assert.rejects(
    () =>
      verifyAndClaimPurchase({
        accountId: "acct-stripe",
        productId: "stripe.premium_edition",
        provider: "stripe",
        externalTransactionId: "cs_test_123",
        idempotencyKey: "stripe-fail-1",
      }),
    (e) => e.code === EntitlementErrors.PURCHASE_VERIFICATION_FAILED
  );
});

await testAsync("requireEntitlement throws when missing", async () => {
  assert.throws(
    () => requireEntitlement("account.premium_edition", { accountId: "nobody" }),
    (e) => e instanceof EntitlementError
  );
});

await testAsync("expiration worker marks due rows", async () => {
  installFakeClock(Date.parse("2026-01-01T00:00:00.000Z"));
  await grantEntitlement({
    entitlementKey: "account.subscription_membership",
    accountId: "acct-exp",
    quantity: 1,
    sourceType: "administrator",
    idempotencyKey: "exp-1",
    expiresAt: "2026-01-01T01:00:00.000Z",
  });
  installFakeClock(Date.parse("2026-01-01T02:00:00.000Z"));
  const r = processExpiredEntitlements(10);
  assert.ok(r.expired >= 1);
});

resetClockState();
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
