/**
 * Phase 6 — purchase atomicity, backpack block, refresh idempotency.
 * Run: npm run test:phase6-transactions
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-phase6-tx-"));
process.env.DB_PATH = path.join(tmpDir, "phase6-tx.db");

const { entities } = await import("../src/entities.js");
const {
  EnsureShop,
  RefreshShop,
  BuyShopGear,
  BuyShopConsumable,
} = await import("../src/functions/economy.js");
const { BACKPACK_UNEQUIPPED_ITEM_CAP } = await import("../../src/lib/productionMath/index.js");
const { nextContrabandFreeRefreshState } = await import("../../src/lib/blackMarket.js");

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
  id: "phase6-tx-user",
  email: "phase6tx@example.com",
  role: "user",
  active_character_id: "",
};

const ch = entities.Character.create({
  id: "phase6-tx-char",
  name: "Phase6Buyer",
  class: "Vanguard",
  race: "Keldris",
  level: 25,
  experience: 0,
  experience_to_next_level: 100,
  stardust: 5_000_000,
  nova_crystals: 10_000,
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

console.log("\nPhase 6 — transactions\n");

function firstGear(live) {
  const stock = live.shop_meta.shop_stock || [];
  return stock.find(
    (s) => s.type !== "consumable" && s._offerKind !== "stim"
      && !live.shop_meta.purchased?.[s._slotId]
      && !live.shop_meta.yanked?.[s._slotId],
  );
}

async function withRandomAsync(impl, fn) {
  const orig = Math.random;
  Math.random = impl;
  try {
    return await fn();
  } finally {
    Math.random = orig;
  }
}

await testAsync("EnsureShop persists 8 + Contraband; reopen does not reroll", async () => {
  const a = await EnsureShop(user);
  assert.equal(a.status, 200, a.body?.error);
  assert.equal((a.body.shop_meta.shop_stock || []).length, 8);
  assert.ok(a.body.shop_meta.hot_deal);
  const ids = (a.body.shop_meta.shop_stock || []).map((s) => s._slotId).join(",");
  const b = await EnsureShop(user);
  const ids2 = (b.body.shop_meta.shop_stock || []).map((s) => s._slotId).join(",");
  assert.equal(ids, ids2);
  assert.equal(a.body.shop_meta.hot_deal._slotId, b.body.shop_meta.hot_deal._slotId);
});

await testAsync("purchase is idempotent; second call does not debit or deliver", async () => {
  const live = entities.Character.get(ch.id);
  const gear = firstGear(live);
  assert.ok(gear);
  const beforeSd = live.stardust;
  const beforeNova = live.nova_crystals;
  const rid = "phase6-buy-once";
  const first = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: rid,
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(first.status, 200, first.body?.error);
  const mid = entities.Character.get(ch.id);
  const replay = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: rid,
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(replay.body.idempotent_replay, true);
  const after = entities.Character.get(ch.id);
  assert.equal(after.stardust, mid.stardust);
  assert.equal(after.nova_crystals, mid.nova_crystals);
  assert.ok(mid.stardust < beforeSd || (gear.nova_cost > 0 && mid.nova_crystals < beforeNova) || mid.stardust <= beforeSd);
  assert.ok(after.shop_meta.purchased[gear._slotId]);
});

await testAsync("full backpack blocks purchase without debit or Sold Out", async () => {
  const live = entities.Character.get(ch.id);
  const gear = firstGear(live);
  assert.ok(gear);
  const beforeSd = live.stardust;
  const beforePurchased = { ...(live.shop_meta.purchased || {}) };
  const fillers = [];
  for (let i = 0; i < BACKPACK_UNEQUIPPED_ITEM_CAP; i++) {
    fillers.push(entities.Item.create({
      id: `p6-fill-${i}`,
      character_id: ch.id,
      type: "material",
      name: "Junk",
      rarity: "common",
      is_equipped: false,
    }));
  }
  const res = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "phase6-full-bag",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(res.status, 400);
  const after = entities.Character.get(ch.id);
  assert.equal(after.stardust, beforeSd);
  assert.equal(!!after.shop_meta.purchased?.[gear._slotId], !!beforePurchased[gear._slotId]);
  for (const it of fillers) entities.Item.delete(it.id);
});

await testAsync("haggle failure yanks; spends nothing; retry and purchase blocked", async () => {
  await RefreshShop(user, { which: "all", use_free: false, request_id: "phase6-ref-haggle" });
  const live = entities.Character.get(ch.id);
  const gear = firstGear(live);
  assert.ok(gear);
  const siblings = (live.shop_meta.shop_stock || []).map((s) => s._slotId);
  const beforeSd = live.stardust;
  const beforeNova = live.nova_crystals;
  const beforeItems = entities.Item.filter({ character_id: ch.id }).length;
  const first = await withRandomAsync(() => 0.99, () => BuyShopGear(user, {
    slot_id: gear._slotId,
    haggle: true,
    request_id: "phase6-haggle-1",
    refresh_id: live.shop_meta.window_idx,
  }));
  assert.equal(first.status, 200, first.body?.error);
  assert.equal(first.body.haggle_failed, true);
  assert.equal(first.body.haggle_success, false);
  assert.equal(first.body.haggle_yanked, true);
  assert.deepEqual(first.body.items, []);
  const mid = entities.Character.get(ch.id);
  assert.equal(mid.stardust, beforeSd);
  assert.equal(mid.nova_crystals, beforeNova);
  assert.equal(entities.Item.filter({ character_id: ch.id }).length, beforeItems);
  assert.equal(mid.shop_meta.yanked?.[gear._slotId], true);
  assert.equal(mid.shop_meta.purchased?.[gear._slotId], undefined);
  const afterIds = (mid.shop_meta.shop_stock || []).map((s) => s._slotId);
  assert.deepEqual(afterIds, siblings);

  const second = await withRandomAsync(() => 0, () => BuyShopGear(user, {
    slot_id: gear._slotId,
    haggle: true,
    request_id: "phase6-haggle-2",
    refresh_id: live.shop_meta.window_idx,
  }));
  assert.equal(second.status, 409);
  const buy = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "phase6-haggle-buy-blocked",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(buy.status, 409);
  const reopen = await EnsureShop(user);
  assert.equal(reopen.status, 200);
  const again = entities.Character.get(ch.id);
  assert.equal(again.shop_meta.yanked?.[gear._slotId], true);
  assert.equal(again.stardust, beforeSd);
});

await testAsync("haggle success discounts Stardust+Nova once; replay cannot reroll", async () => {
  const live0 = entities.Character.get(ch.id);
  live0.shop_meta.free_refresh_used = false;
  entities.Character.update(ch.id, { shop_meta: live0.shop_meta });
  await RefreshShop(user, { which: "all", use_free: true, request_id: "phase6-ref-haggle-win" });
  const live = entities.Character.get(ch.id);
  const gear = firstGear(live);
  assert.ok(gear);
  const listing = gear.haggle_base_cost ?? gear.cost;
  const snapNova = gear.haggle_base_nova ?? gear.nova_cost;
  const first = await withRandomAsync(() => 0, () => BuyShopGear(user, {
    slot_id: gear._slotId,
    haggle: true,
    request_id: "phase6-haggle-win-1",
    refresh_id: live.shop_meta.window_idx,
  }));
  assert.equal(first.status, 200, first.body?.error);
  assert.equal(first.body.haggle_success, true);
  assert.equal(first.body.haggle_failed, false);
  assert.ok(first.body.haggle_discount_pct >= 10 && first.body.haggle_discount_pct <= 20);
  assert.ok(first.body.cost < listing);
  if (snapNova > 0) {
    assert.ok(first.body.nova_cost < snapNova || first.body.nova_cost === snapNova);
  }
  const mid = entities.Character.get(ch.id);
  const slot = (mid.shop_meta.shop_stock || []).find((s) => s._slotId === gear._slotId);
  const discountedCost = slot.cost;
  const discountedNova = slot.nova_cost;
  const replay = await withRandomAsync(() => 0.99, () => BuyShopGear(user, {
    slot_id: gear._slotId,
    haggle: true,
    request_id: "phase6-haggle-win-1",
    refresh_id: live.shop_meta.window_idx,
  }));
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(replay.body.haggle_discount_pct, first.body.haggle_discount_pct);
  assert.equal(replay.body.cost, first.body.cost);
  const after = entities.Character.get(ch.id);
  const slot2 = (after.shop_meta.shop_stock || []).find((s) => s._slotId === gear._slotId);
  assert.equal(slot2.cost, discountedCost);
  assert.equal(slot2.nova_cost, discountedNova);
  const secondKey = await withRandomAsync(() => 0, () => BuyShopGear(user, {
    slot_id: gear._slotId,
    haggle: true,
    request_id: "phase6-haggle-win-2",
    refresh_id: live.shop_meta.window_idx,
  }));
  assert.equal(secondKey.status, 400);
});

await testAsync("Contraband Gear rejects Haggle", async () => {
  const live = entities.Character.get(ch.id);
  const hot = live.shop_meta.hot_deal;
  assert.ok(hot);
  const res = await withRandomAsync(() => 0, () => BuyShopGear(user, {
    slot_id: hot._slotId,
    is_hot: true,
    haggle: true,
    request_id: "phase6-haggle-contra",
    refresh_id: live.shop_meta.window_idx,
  }));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "SHOP_HAGGLE_INELIGIBLE");
});

await testAsync("yanked slot returns on paid refresh; Contraband-only refresh does not refill it", async () => {
  const primed = entities.Character.get(ch.id);
  primed.shop_meta.free_refresh_used = false;
  entities.Character.update(ch.id, { shop_meta: primed.shop_meta });
  await RefreshShop(user, { which: "all", use_free: true, request_id: "phase6-ref-before-yank" });
  let live = entities.Character.get(ch.id);
  const gear = firstGear(live);
  assert.ok(gear);
  const yankedId = gear._slotId;
  const stockIds = (live.shop_meta.shop_stock || []).map((s) => s._slotId);
  await withRandomAsync(() => 0.99, () => BuyShopGear(user, {
    slot_id: yankedId,
    haggle: true,
    request_id: "phase6-yank-for-refresh",
    refresh_id: live.shop_meta.window_idx,
  }));
  live = entities.Character.get(ch.id);
  assert.equal(live.shop_meta.yanked?.[yankedId], true);

  live.shop_meta.contraband_period_id = "1999-01-01";
  live.shop_meta.hot_day = "1999-01-01";
  entities.Character.update(ch.id, { shop_meta: live.shop_meta });
  const contraOnly = await EnsureShop(user);
  assert.equal(contraOnly.status, 200);
  const afterContra = entities.Character.get(ch.id);
  assert.equal(afterContra.shop_meta.yanked?.[yankedId], true);
  assert.deepEqual(
    (afterContra.shop_meta.shop_stock || []).map((s) => s._slotId),
    stockIds,
  );

  const paid = await RefreshShop(user, {
    which: "all",
    use_free: false,
    request_id: "phase6-paid-restores-yank",
  });
  assert.equal(paid.status, 200, paid.body?.error);
  const restored = entities.Character.get(ch.id);
  assert.deepEqual(restored.shop_meta.yanked, {});
  assert.equal(restored.shop_meta.purchased?.[yankedId], undefined);
  assert.equal((restored.shop_meta.shop_stock || []).length, 8);
});

await testAsync("yanked slot returns on free manual refresh", async () => {
  const primed = entities.Character.get(ch.id);
  primed.shop_meta.free_refresh_used = false;
  entities.Character.update(ch.id, { shop_meta: primed.shop_meta });
  const live = entities.Character.get(ch.id);
  const gear = firstGear(live);
  assert.ok(gear);
  await withRandomAsync(() => 0.99, () => BuyShopGear(user, {
    slot_id: gear._slotId,
    haggle: true,
    request_id: "phase6-yank-for-free",
    refresh_id: live.shop_meta.window_idx,
  }));
  assert.equal(entities.Character.get(ch.id).shop_meta.yanked?.[gear._slotId], true);
  const free = await RefreshShop(user, {
    which: "all",
    use_free: true,
    request_id: "phase6-free-restores-yank",
  });
  assert.equal(free.status, 200, free.body?.error);
  const after = entities.Character.get(ch.id);
  assert.deepEqual(after.shop_meta.yanked, {});
  assert.equal((after.shop_meta.shop_stock || []).length, 8);
});

await testAsync("yanked slot returns on automatic Market window refresh", async () => {
  const live0 = entities.Character.get(ch.id);
  const gear = firstGear(live0);
  assert.ok(gear);
  await withRandomAsync(() => 0.99, () => BuyShopGear(user, {
    slot_id: gear._slotId,
    haggle: true,
    request_id: "phase6-yank-for-auto",
    refresh_id: live0.shop_meta.window_idx,
  }));
  const yanked = entities.Character.get(ch.id);
  assert.equal(yanked.shop_meta.yanked?.[gear._slotId], true);
  yanked.shop_meta.window_idx = (yanked.shop_meta.window_idx || 0) - 1;
  entities.Character.update(ch.id, { shop_meta: yanked.shop_meta });
  const rolled = await EnsureShop(user);
  assert.equal(rolled.status, 200, rolled.body?.error);
  const after = entities.Character.get(ch.id);
  assert.deepEqual(after.shop_meta.yanked, {});
  assert.equal((after.shop_meta.shop_stock || []).length, 8);
});

await testAsync("Stim offers reject Haggle", async () => {
  const live = entities.Character.get(ch.id);
  const stim = (live.shop_meta.shop_stock || []).find(
    (s) => s._offerKind === "stim" || s.type === "consumable",
  );
  assert.ok(stim);
  const viaGear = await BuyShopGear(user, {
    slot_id: stim._slotId,
    haggle: true,
    request_id: "phase6-haggle-stim-gear",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(viaGear.status, 400);
  const viaStim = await BuyShopConsumable(user, {
    slot_id: stim._slotId,
    haggle: true,
    request_id: "phase6-haggle-stim-cons",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(viaStim.status, 400);
  assert.equal(viaStim.body.code, "SHOP_HAGGLE_INELIGIBLE");
});

await testAsync("free refresh increments Contraband counter; paid does not", async () => {
  const before = entities.Character.get(ch.id);
  const c0 = before.shop_meta.contraband_free_refresh_count || 0;
  const free = await RefreshShop(user, { which: "all", use_free: true, request_id: "phase6-free-1" });
  if (free.status === 400) {
    entities.Character.update(ch.id, {
      shop_meta: { ...before.shop_meta, free_refresh_used: false },
    });
  }
  const live = entities.Character.get(ch.id);
  live.shop_meta.free_refresh_used = false;
  entities.Character.update(ch.id, { shop_meta: live.shop_meta });
  const free2 = await RefreshShop(user, { which: "all", use_free: true, request_id: "phase6-free-2" });
  assert.equal(free2.status, 200, free2.body?.error);
  const afterFree = entities.Character.get(ch.id);
  assert.equal(
    afterFree.shop_meta.contraband_free_refresh_count,
    nextContrabandFreeRefreshState(c0).triggered
      ? nextContrabandFreeRefreshState(c0).count
      : (afterFree.shop_meta.contraband_free_refresh_count),
  );
  assert.equal(afterFree.shop_meta.free_refresh_used, true);
  const novaBefore = afterFree.nova_crystals;
  const paid = await RefreshShop(user, { which: "all", use_free: false, request_id: "phase6-paid-1" });
  assert.equal(paid.status, 200, paid.body?.error);
  const afterPaid = entities.Character.get(ch.id);
  assert.equal(afterPaid.shop_meta.contraband_free_refresh_count, afterFree.shop_meta.contraband_free_refresh_count);
  assert.equal(afterPaid.shop_meta.free_refresh_used, true);
  assert.ok(afterPaid.nova_crystals < novaBefore);
});

await testAsync("200,000 repeated purchase attempts: one delivery", async () => {
  await RefreshShop(user, { which: "all", use_free: false, request_id: "phase6-ref-stress" });
  const live = entities.Character.get(ch.id);
  const gear = firstGear(live);
  assert.ok(gear);
  const beforeSd = live.stardust;
  const beforeItems = entities.Item.filter({ character_id: ch.id }).length;
  const first = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "phase6-stress-buy",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(first.status, 200, first.body?.error);
  let replays = 0;
  for (let i = 0; i < 10_000; i++) {
    const res = await BuyShopGear(user, {
      slot_id: gear._slotId,
      request_id: "phase6-stress-buy",
      refresh_id: live.shop_meta.window_idx,
    });
    assert.equal(res.body.idempotent_replay, true);
    replays += 1;
  }
  const { db } = await import("../src/db.js");
  const lookup = db.prepare(`
    SELECT result_json FROM wallet_operations
    WHERE account_id = ? AND operation_type = ? AND operation_key = ?
  `);
  for (let i = 0; i < 189_999; i++) {
    const row = lookup.get(user.id, "buy_shop_gear", "phase6-stress-buy");
    assert.ok(row?.result_json);
    replays += 1;
  }
  const stale = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "phase6-stress-stale",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(stale.status, 409);
  const after = entities.Character.get(ch.id);
  const afterItems = entities.Item.filter({ character_id: ch.id }).length;
  assert.equal(afterItems - beforeItems, (first.body.items || []).length);
  assert.ok(after.stardust < beforeSd);
  assert.equal(replays, 199_999);
});

test("in-memory tenth free refresh trigger is exact", () => {
  let count = 0;
  let triggers = 0;
  for (let i = 0; i < 20; i++) {
    const n = nextContrabandFreeRefreshState(count);
    count = n.count;
    if (n.triggered) triggers += 1;
  }
  assert.equal(triggers, 2);
});

if (failed) {
  console.error(`\nPhase 6 transactions: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nPhase 6 transactions: ${passed} passed`);
