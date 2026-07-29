/**
 * Server-authoritative reward system tests.
 * Run: node server/scripts/test-rewards.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-rew-"));
process.env.DB_PATH = path.join(tmpDir, "test-rewards.db");

await import("../src/shared/economyFormulas.js"); // wire __llGetInventoryCap before rewards applicator

const {
  RewardSources,
  isValidRewardSource,
  detectSuspiciousRewardFields,
  getRewardDefinition,
  requireRewardDefinition,
  validateRewardPayload,
  REWARD_LIMITS,
  weightedPick,
  validateLootTable,
  executeRewardClaim,
  ClaimKeys,
  getClaimByKey,
  createPendingLoot,
  getPendingLoot,
  resolvePendingLoot,
  acceptServerPendingLoot,
  dissolveServerPendingLoot,
  RewardErrors,
  RewardError,
} = await import("../src/rewards/index.js");
const { entities } = await import("../src/entities.js");
const { withTransactionAsync } = await import("../src/db.js");

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

console.log("\nReward system tests\n");

test("reward sources are registered", () => {
  assert.equal(isValidRewardSource(RewardSources.MISSION_COMPLETION), true);
  assert.equal(isValidRewardSource("client_hack"), false);
});

test("definitions are versioned", () => {
  const d = getRewardDefinition("mission_completion");
  assert.equal(d.version, 1);
  assert.equal(d.resolvePolicy, "start");
  assert.throws(() => requireRewardDefinition("nope"), (e) => e.code === "REWARD_DEFINITION_INVALID");
});

test("detects suspicious client reward fields", () => {
  const found = detectSuspiciousRewardFields({
    mission_id: "m1",
    stardust: 99999,
    experience: 50,
    payout_mult: 25,
  });
  assert.ok(found.includes("stardust"));
  assert.ok(found.includes("experience"));
  assert.ok(found.includes("payout_mult"));
});

test("safety limits reject oversized payloads", () => {
  const bad = validateRewardPayload({ stardust: REWARD_LIMITS.maxStardustPerClaim + 1 });
  assert.equal(bad.ok, false);
  const ok = validateRewardPayload({ stardust: 100, experience: 50 });
  assert.equal(ok.ok, true);
});

test("weighted pick respects weights", () => {
  const table = [
    { id: "a", weight: 1 },
    { id: "b", weight: 0 },
  ];
  assert.equal(validateLootTable(table).ok, false);
  const good = [
    { id: "common", weight: 100 },
    { id: "rare", weight: 1 },
  ];
  assert.equal(validateLootTable(good).ok, true);
  let picks = 0;
  for (let i = 0; i < 50; i++) {
    const p = weightedPick(good, () => 0.001);
    if (p.id === "common") picks += 1;
  }
  assert.equal(picks, 50);
});

await testAsync("idempotent claim returns same result without double grant", async () => {
  let deliveries = 0;
  const claimKey = ClaimKeys.admin("test-idem-1");
  const run = () =>
    executeRewardClaim({
      claimKey,
      idempotencyKey: "idem-rew-1",
      accountId: "acct-r1",
      characterId: "char-r1",
      rewardSource: RewardSources.ADMINISTRATOR_GRANT,
      definitionKey: "administrator_grant",
      generate: async () => ({ stardust: 10, experience: 0 }),
      deliver: async (payload) => {
        deliveries += 1;
        return { ...payload, deliveryDestination: "character" };
      },
      admin: true,
    });

  const a = await run();
  const b = await run();
  assert.equal(a.claim.id, b.claim.id);
  assert.equal(b.idempotentReplay, true);
  assert.equal(deliveries, 1);
  assert.equal(getClaimByKey(claimKey).status, "completed");
});

await testAsync("domain uniqueness blocks second idempotency key", async () => {
  const claimKey = ClaimKeys.mission("mission-dup-1");
  await executeRewardClaim({
    claimKey,
    idempotencyKey: "key-a",
    accountId: "acct-r2",
    characterId: "char-r2",
    rewardSource: RewardSources.MISSION_COMPLETION,
    definitionKey: "mission_completion",
    generate: async () => ({ stardust: 5 }),
    deliver: async (p) => p,
  });
  const second = await executeRewardClaim({
    claimKey,
    idempotencyKey: "key-b",
    accountId: "acct-r2",
    characterId: "char-r2",
    rewardSource: RewardSources.MISSION_COMPLETION,
    definitionKey: "mission_completion",
    generate: async () => ({ stardust: 999 }),
    deliver: async (p) => p,
  });
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.result.stardust, 5);
});

await testAsync("delivery failure does not complete claim", async () => {
  const claimKey = ClaimKeys.mail("mail-fail-1");
  await assert.rejects(
    () =>
      executeRewardClaim({
        claimKey,
        accountId: "acct-r3",
        characterId: "char-r3",
        rewardSource: RewardSources.MAIL_ATTACHMENT,
        definitionKey: "mail_attachment",
        generate: async () => ({ stardust: 1 }),
        deliver: async () => {
          throw new RewardError(RewardErrors.REWARD_DELIVERY_FAILED, "boom");
        },
      }),
    (e) => e.code === RewardErrors.REWARD_DELIVERY_FAILED
  );
  const claim = getClaimByKey(claimKey);
  assert.equal(claim.status, "failed_retryable");
  assert.ok(claim.generatedPayload);
});

await testAsync("pending loot accept/dissolve uses server store", async () => {
  const user = { id: "acct-pl" };
  const ch = entities.Character.create({
    name: "Tester",
    created_by_id: user.id,
    stardust: 0,
    total_stardust_earned: 0,
    level: 1,
  });
  const pl = createPendingLoot({
    accountId: user.id,
    characterId: ch.id,
    item: {
      name: "Overflow Blade",
      type: "weapon",
      rarity: "rare",
      level_requirement: 1,
      stats: { strength: 2 },
      sell_value: 100,
    },
  });
  assert.equal(getPendingLoot(pl.id).status, "pending");

  // Forge attempt without id is not this path — dissolve by id uses stored sell value path
  const dissolved = dissolveServerPendingLoot(user, pl.id);
  assert.ok(dissolved.stardust_gained > 0);
  assert.equal(getPendingLoot(pl.id).status, "dissolved");

  const pl2 = createPendingLoot({
    accountId: user.id,
    characterId: ch.id,
    item: {
      name: "Accept Me",
      type: "material",
      rarity: "common",
      level_requirement: 1,
      stats: {},
      sell_value: 10,
    },
  });
  const accepted = acceptServerPendingLoot(user, pl2.id);
  assert.ok(accepted.item?.id);
  assert.equal(getPendingLoot(pl2.id).status, "accepted");
});

await testAsync("transaction rollback leaves no completed claim on throw after insert", async () => {
  const claimKey = ClaimKeys.daily("char-tx", "2099-01-01");
  try {
    await withTransactionAsync(async () => {
      await executeRewardClaim({
        claimKey,
        accountId: "acct-tx",
        characterId: "char-tx",
        rewardSource: RewardSources.DAILY_LOGIN,
        definitionKey: "daily_login",
        generate: async () => ({ stardust: 3 }),
        deliver: async (p) => p,
      });
      throw Object.assign(new Error("force rollback"), { status: 500 });
    });
  } catch {
    /* expected */
  }
  // After rollback the claim row should not remain completed (SQLite txn).
  const claim = getClaimByKey(claimKey);
  assert.ok(!claim || claim.status !== "completed");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
