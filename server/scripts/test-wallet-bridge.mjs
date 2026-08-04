import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loot-wallet-bridge-"));
process.env.DB_PATH = path.join(dir, "wallet.db");
process.env.LOOT_WALLET_BRIDGE_SECRET = "test-wallet-secret";

const { db } = await import("../src/db.js");
const { createWalletBridgeRouter } = await import("../src/walletBridge.js");

const now = new Date().toISOString();
db.prepare(`
  INSERT INTO users (
    id, email, password_hash, role, active_character_id, nakama_user_id,
    created_date, updated_date
  ) VALUES (?, ?, ?, 'user', ?, ?, ?, ?)
`).run("acct-a", "a@example.test", "x", "char-a", "nakama-a", now, now);
db.prepare(`
  INSERT INTO users (
    id, email, password_hash, role, active_character_id, nakama_user_id,
    created_date, updated_date
  ) VALUES (?, ?, ?, 'user', ?, ?, ?, ?)
`).run("acct-b", "b@example.test", "x", "char-b", "nakama-b", now, now);

function insertCharacter(id, owner) {
  const data = {
    id, fuel: 20, stardust: 100, nova_crystals: 5,
    created_by_id: owner, created_by: `${owner}@example.test`,
    created_date: now, updated_date: now,
  };
  db.prepare(`
    INSERT INTO entities (id, type, data, created_by, created_by_id, created_date, updated_date)
    VALUES (?, 'Character', ?, ?, ?, ?, ?)
  `).run(id, JSON.stringify(data), data.created_by, owner, now, now);
}
insertCharacter("char-a", "acct-a");
insertCharacter("char-b", "acct-b");

const app = express();
app.use(express.json());
app.use("/internal/wallet", createWalletBridgeRouter(express));
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}/internal/wallet/apply`;

async function request(body, secret = "test-wallet-secret") {
  const headers = { "content-type": "application/json" };
  if (secret != null) headers["x-loot-wallet-bridge-secret"] = secret;
  const response = await fetch(base, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

const common = {
  nakama_user_id: "nakama-a",
  character_id: "char-a",
  reference_id: "mission-1",
  amount: 10,
};

assert.equal((await request(common, "wrong")).status, 401, "wrong secret must fail");
delete process.env.LOOT_WALLET_BRIDGE_SECRET;
assert.equal((await request(common)).status, 503, "missing configured secret must fail closed");
process.env.LOOT_WALLET_BRIDGE_SECRET = "test-wallet-secret";

const ownership = await request({
  ...common, character_id: "char-b",
  operation_type: "mission_start_fuel", operation_key: "ownership",
});
assert.equal(ownership.status, 403, "explicit foreign character must be rejected");

const insufficient = await request({
  ...common, amount: 6,
  operation_type: "mission_skip_nova", operation_key: "insufficient",
});
assert.equal(insufficient.status, 409);
assert.equal(insufficient.body.code, "INSUFFICIENT_FUNDS");

const debit = await request({
  ...common, operation_type: "shop_buy_stardust", operation_key: "buy-1",
});
assert.equal(debit.status, 200);
assert.equal(debit.body.balances.stardust, 90);

const laterCredit = await request({
  ...common, amount: 5, reference_id: "item-2",
  operation_type: "shop_sell_stardust", operation_key: "sell-2",
});
assert.equal(laterCredit.body.balances.stardust, 95);
const replay = await request({
  ...common, operation_type: "shop_buy_stardust", operation_key: "buy-1",
});
assert.equal(replay.body.idempotent_replay, true);
assert.equal(replay.body.balances.stardust, 95, "replay must return live, not stored balances");
assert.equal(replay.body.transaction_id, debit.body.transaction_id, "replay receipt must be exact-once");

const conflicting = await request({
  ...common, amount: 11, operation_type: "shop_buy_stardust", operation_key: "buy-1",
});
assert.equal(conflicting.status, 409, "changed amount on same key must conflict");

const orphanRefund = await request({
  ...common, amount: 1, reference_id: "never-paid",
  operation_type: "mission_start_fuel_refund", operation_key: "orphan-refund",
});
assert.equal(orphanRefund.status, 409, "standalone compensation must be rejected");

const paid = await request({
  ...common, amount: 5, reference_id: "mission-comp",
  operation_type: "mission_start_fuel", operation_key: "mission-comp-debit",
});
assert.equal(paid.body.balances.fuel, 15);
const refundBody = {
  ...common, amount: 5, reference_id: "mission-comp",
  operation_type: "mission_start_fuel_refund", operation_key: "mission-comp-refund",
};
const refunded = await request(refundBody);
assert.equal(refunded.body.balances.fuel, 20);
const refundReplay = await request(refundBody);
assert.equal(refundReplay.body.balances.fuel, 20, "compensation replay must not double credit");
const paidReplay = await request({
  ...common, amount: 5, reference_id: "mission-comp",
  operation_type: "mission_start_fuel", operation_key: "mission-comp-debit",
});
assert.equal(paidReplay.body.code, "OPERATION_COMPENSATED", "compensated debit cannot replay as payment");

const fractionalFuel = await request({
  ...common, amount: 0.25, reference_id: "mission-fractional",
  operation_type: "mission_start_fuel", operation_key: "mission-fractional-debit",
});
assert.equal(fractionalFuel.status, 200);
assert.equal(fractionalFuel.body.balances.fuel, 19.75, "mission Fuel supports hundredths");
const fractionalRefund = await request({
  ...common, amount: 0.25, reference_id: "mission-fractional",
  operation_type: "mission_start_fuel_refund", operation_key: "mission-fractional-refund",
});
assert.equal(fractionalRefund.body.balances.fuel, 20);

const character = JSON.parse(db.prepare(
  "SELECT data FROM entities WHERE type = 'Character' AND id = 'char-a'"
).get().data);
assert.ok(character.fuel >= 0 && character.stardust >= 0 && character.nova_crystals >= 0);

server.close();
try {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
} catch {
  // node:sqlite keeps the test DB handle open on some Windows builds.
}
console.log("wallet bridge tests passed");
