/**
 * Restoration 12B — shop purchase settlement.
 * Run: npm run test:shop-purchases
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-shop-buy-"));
process.env.DB_PATH = path.join(tmpDir, "shop-buy.db");

const { entities } = await import("../src/entities.js");
const {
  EnsureShop,
  BuyShopGear,
  BuyShopConsumable,
} = await import("../src/functions/economy.js");
const {
  assertShopPurchaseClientSafe,
  detectSuspiciousShopPurchaseFields,
  shopMetaHasStock,
} = await import("../src/shared/shopService.js");
const { getShopWindow } = await import("../src/shared/economyFormulas.js");

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

const user = {
  id: "shop-buy-user",
  email: "shopbuy@example.com",
  role: "user",
  active_character_id: "",
};

const ch = entities.Character.create({
  id: "shop-buy-char",
  name: "Buyer",
  class: "Vanguard",
  race: "Keldris",
  level: 20,
  experience: 0,
  experience_to_next_level: 100,
  stardust: 500_000,
  nova_crystals: 100,
  fuel: 50,
  max_fuel: 100,
  stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
  attribute_purchases: 0,
  attribute_purchases_by_stat: {
    strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
  },
  equipped_items: {},
  shop_meta: {},
  created_by_id: user.id,
  created_by: user.email,
  active_buffs: [],
});
user.active_character_id = ch.id;

console.log("\nShop purchase tests (Restoration 12B)\n");

test("rejects client price/currency tampering", () => {
  assert.deepEqual(detectSuspiciousShopPurchaseFields({ slot_id: "x", cost: 1 }), ["cost"]);
  assert.throws(() => assertShopPurchaseClientSafe({ cost: 99 }), (e) => e.status === 400);
  assert.throws(() => assertShopPurchaseClientSafe({ stardust: 1 }), (e) => e.status === 400);
  assert.doesNotThrow(() => assertShopPurchaseClientSafe({ slot_id: "a", haggle: true }));
});

await testAsync("EnsureShop seeds persistent stock", async () => {
  const res = await EnsureShop(user);
  assert.equal(res.status, 200);
  assert.ok(shopMetaHasStock(res.body.shop_meta));
  assert.ok(res.body.shop_meta.hot_deal);
  assert.ok(res.body.vendors?.gear);
  assert.ok(res.body.vendors?.supply);
});

await testAsync("purchase gear succeeds once", async () => {
  const live = entities.Character.get(ch.id);
  const stock = live.shop_meta.shop_stock || live.shop_meta.gear_stock;
  const gear = stock.find((s) => s.type !== "consumable" && s._offerKind !== "stim");
  assert.ok(gear, "need a gear slot");
  const before = live.stardust;
  const rid = "shop-gear-ok-1";
  const res = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: rid,
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.success, true);
  assert.equal(res.body.haggle_failed, false);
  assert.ok(res.body.cost > 0);
  assert.ok((res.body.items || []).length >= 1 || (res.body.pending_loot || []).length >= 1);
  const after = entities.Character.get(ch.id);
  assert.equal(after.stardust, before - res.body.cost);
  assert.equal(after.shop_meta.purchased[gear._slotId], true);
  assert.equal(res.body.transaction_id, rid);
});

await testAsync("duplicate request_id replays without double charge", async () => {
  const before = entities.Character.get(ch.id);
  const beforeSd = before.stardust;
  const beforeItems = entities.Item.filter({ character_id: ch.id }).length;
  const rid = "shop-gear-ok-1";
  const res = await BuyShopGear(user, {
    slot_id: "ignored-on-replay",
    request_id: rid,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.idempotent_replay, true);
  const after = entities.Character.get(ch.id);
  assert.equal(after.stardust, beforeSd);
  assert.equal(entities.Item.filter({ character_id: ch.id }).length, beforeItems);
});

await testAsync("sold-out purchase rejected", async () => {
  const live = entities.Character.get(ch.id);
  const soldId = Object.keys(live.shop_meta.purchased || {})[0];
  assert.ok(soldId);
  const res = await BuyShopGear(user, {
    slot_id: soldId,
    request_id: "shop-gear-sold-1",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "SHOP_SOLD_OUT");
});

await testAsync("insufficient stardust rejected", async () => {
  entities.Character.update(ch.id, { stardust: 1 });
  const live = entities.Character.get(ch.id);
  const stock = live.shop_meta.shop_stock || [];
  const gear = stock.find(
    (s) => s.type !== "consumable" && !live.shop_meta.purchased?.[s._slotId] && !live.shop_meta.yanked?.[s._slotId]
  );
  assert.ok(gear);
  const res = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "shop-gear-broke-1",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /stardust/i);
  entities.Character.update(ch.id, { stardust: 500_000 });
});

await testAsync("client cost field rejected", async () => {
  const res = await BuyShopGear(user, {
    slot_id: "x",
    cost: 1,
    request_id: "shop-gear-tamper-1",
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "SHOP_PRICE_TAMPER");
});

await testAsync("refresh generation mismatch rejected", async () => {
  const live = entities.Character.get(ch.id);
  const stock = live.shop_meta.shop_stock || [];
  const gear = stock.find(
    (s) => s.type !== "consumable" && !live.shop_meta.purchased?.[s._slotId] && !live.shop_meta.yanked?.[s._slotId]
  );
  assert.ok(gear);
  const res = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "shop-gear-gen-1",
    refresh_id: Number(live.shop_meta.window_idx) + 999,
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "SHOP_GENERATION_MISMATCH");
});

await testAsync("stim purchase + sold-out + idempotent replay", async () => {
  const live = entities.Character.get(ch.id);
  const stock = live.shop_meta.shop_stock || [];
  const stim = stock.find(
    (s) =>
      (s.type === "consumable" || s._offerKind === "stim") &&
      !live.shop_meta.purchased?.[s._slotId]
  );
  assert.ok(stim, "need stim slot");
  const before = live.stardust;
  const rid = "shop-stim-ok-1";
  const res = await BuyShopConsumable(user, {
    slot_id: stim._slotId,
    request_id: rid,
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(res.status, 200, res.body?.error);
  assert.ok(res.body.cost > 0);
  assert.equal(res.body.vendor, "supply");
  const mid = entities.Character.get(ch.id);
  assert.equal(mid.stardust, before - res.body.cost);
  assert.equal(mid.shop_meta.purchased[stim._slotId], true);

  const again = await BuyShopConsumable(user, {
    slot_id: stim._slotId,
    request_id: rid,
  });
  assert.equal(again.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).stardust, mid.stardust);

  const sold = await BuyShopConsumable(user, {
    slot_id: stim._slotId,
    request_id: "shop-stim-sold-2",
    refresh_id: mid.shop_meta.window_idx,
  });
  assert.equal(sold.status, 409);
});

await testAsync("expired stock rejected without silent regen", async () => {
  const win = getShopWindow();
  entities.Character.update(ch.id, {
    shop_meta: {
      window_idx: win.idx - 1,
      shop_stock: [],
      purchased: {},
      yanked: {},
    },
    stardust: 500_000,
  });
  const res = await BuyShopGear(user, {
    slot_id: "any",
    request_id: "shop-gear-expired-1",
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "SHOP_STOCK_EXPIRED");
  // Restore shop for cleanliness
  await EnsureShop(user);
});

await testAsync("wrong account cannot buy", async () => {
  const other = {
    id: "shop-buy-other",
    email: "other@example.com",
    role: "user",
    active_character_id: "nope",
  };
  const res = await BuyShopGear(other, {
    slot_id: "x",
    request_id: "shop-gear-wrong-1",
  });
  assert.ok(res.status >= 400);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
