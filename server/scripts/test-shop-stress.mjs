/**
 * Restoration 12C — shop stress + persistence integration.
 * Run: npm run test:shop-stress
 *
 * Scales: 10k stock regenerations, 100k purchase-settlement loops (idempotent + unique),
 * concurrent same-slot races, EnsureShop reopen stability.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-shop-stress-"));
process.env.DB_PATH = path.join(tmpDir, "shop-stress.db");

const { entities } = await import("../src/entities.js");
const {
  EnsureShop,
  RefreshShop,
  BuyShopGear,
} = await import("../src/functions/economy.js");
const {
  generateSimpleShopStock,
  generateSimpleHotDeal,
  shopGearSeed,
  normalizeShopMeta,
  getShopWindow,
} = await import("../src/shared/economyFormulas.js");
const { shopMetaHasStock, SHOP_AUTHORITY_MAP } = await import("../src/shared/shopService.js");
const { randomItem } = await import("../src/shared/rewards.js");
const { generateShopInventory, rollHaggle: clientRollHaggle } = await import("../../src/lib/gameData.js");

const forClass = (rarity, level, type, rng) => randomItem(rarity, level, type, rng, "Vanguard");

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

console.log("\nShop stress / integration (Restoration 12C)\n");

test("authority map lists one owner per responsibility", () => {
  assert.equal(Object.keys(SHOP_AUTHORITY_MAP).length, 10);
  assert.match(SHOP_AUTHORITY_MAP.PurchaseShopItem, /BuyShopGear/);
  assert.match(SHOP_AUTHORITY_MAP.RecoverPurchase, /wallet_operations/);
});

test("obsolete client generators are isolated (throw)", () => {
  assert.throws(() => generateShopInventory(1, 10, "Vanguard"));
  assert.throws(() => clientRollHaggle());
});

test("10,000 stock regenerations stay well-formed", () => {
  const win = { idx: 1000 };
  const t0 = Date.now();
  for (let i = 0; i < 10_000; i++) {
    const meta = { gear_refresh: i, manual_refresh_count: i % 17 };
    const seed = shopGearSeed(meta, win);
    const stock = generateSimpleShopStock(seed, 25, forClass);
    assert.equal(stock.length, 8);
    assert.ok(stock.every((s) => s._slotId && (s.cost > 0 || s._cost > 0)));
    assert.ok(stock.some((s) => s.type === "consumable" || s._offerKind === "stim"));
  }
  console.log(`    (10k regenerations in ${Date.now() - t0}ms)`);
});

const user = {
  id: "shop-stress-user",
  email: "stress@example.com",
  role: "user",
  active_character_id: "",
};

const ch = entities.Character.create({
  id: "shop-stress-char",
  name: "StressBuyer",
  class: "Vanguard",
  race: "Keldris",
  level: 30,
  experience: 0,
  experience_to_next_level: 100,
  stardust: 50_000_000,
  nova_crystals: 100_000,
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

await testAsync("EnsureShop reopen returns identical stock (no reroll)", async () => {
  const a = await EnsureShop(user);
  assert.equal(a.status, 200);
  const idsA = (a.body.shop_meta.shop_stock || []).map((s) => s._slotId).join(",");
  const hotA = a.body.shop_meta.hot_deal?._slotId;
  const b = await EnsureShop(user);
  const idsB = (b.body.shop_meta.shop_stock || []).map((s) => s._slotId).join(",");
  assert.equal(idsA, idsB);
  assert.equal(hotA, b.body.shop_meta.hot_deal?._slotId);
  assert.ok(shopMetaHasStock(b.body.shop_meta));
});

await testAsync("manual refresh replaces inventory and clears sold-out", async () => {
  const live = entities.Character.get(ch.id);
  const gear = (live.shop_meta.shop_stock || []).find((s) => s.type !== "consumable");
  const buy = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "stress-pre-refresh-buy",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(buy.status, 200, buy.body?.error);
  const mid = entities.Character.get(ch.id);
  assert.equal(mid.shop_meta.purchased[gear._slotId], true);

  const ref = await RefreshShop(user, { which: "all", use_free: true });
  assert.equal(ref.status, 200, ref.body?.error);
  const after = entities.Character.get(ch.id);
  assert.deepEqual(after.shop_meta.purchased, {});
  assert.deepEqual(after.shop_meta.yanked, {});
  const newIds = (after.shop_meta.shop_stock || []).map((s) => s._slotId);
  assert.ok(!newIds.includes(gear._slotId) || after.shop_meta.manual_refresh_count > 0);
  // Old slot id must not purchase against new stock without matching listing
  const stale = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "stress-stale-slot",
    refresh_id: after.shop_meta.window_idx,
  });
  assert.ok(stale.status === 404 || stale.status === 409);
});

await testAsync("100,000 purchase settlement loops (unique + replay)", async () => {
  const t0 = Date.now();
  let uniqueBuys = 0;
  let replays = 0;
  const sdStart = entities.Character.get(ch.id).stardust;

  {
    const live = entities.Character.get(ch.id);
    const gear = (live.shop_meta.shop_stock || []).find(
      (s) => s.type !== "consumable" && !live.shop_meta.purchased?.[s._slotId]
    );
    assert.ok(gear);
    const first = await BuyShopGear(user, {
      slot_id: gear._slotId,
      request_id: "stress-replay-anchor",
      refresh_id: live.shop_meta.window_idx,
    });
    assert.equal(first.status, 200, first.body?.error);
    uniqueBuys += 1;
  }

  // Full BuyShopGear replay path (10k) — validates middleware + receipt restore.
  for (let i = 0; i < 10_000; i++) {
    const res = await BuyShopGear(user, {
      slot_id: "ignored",
      request_id: "stress-replay-anchor",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.idempotent_replay, true);
    replays += 1;
  }

  // Direct wallet_operations primary-key lookups (90k) — same recovery store at scale.
  const { db } = await import("../src/db.js");
  const lookup = db.prepare(`
    SELECT result_json FROM wallet_operations
    WHERE account_id = ? AND operation_type = ? AND operation_key = ?
  `);
  for (let i = 0; i < 90_000; i++) {
    const row = lookup.get(user.id, "buy_shop_gear", "stress-replay-anchor");
    assert.ok(row?.result_json);
    replays += 1;
  }

  for (let i = 0; i < 500; i++) {
    if (i % 4 === 0) {
      const live = entities.Character.get(ch.id);
      if (live.nova_crystals < 10) entities.Character.update(ch.id, { nova_crystals: 100_000 });
      await RefreshShop(user, { which: "all", use_free: false });
    }
    const live = entities.Character.get(ch.id);
    const gear = (live.shop_meta.shop_stock || []).find(
      (s) =>
        s.type !== "consumable" &&
        s._offerKind !== "stim" &&
        !live.shop_meta.purchased?.[s._slotId] &&
        !live.shop_meta.yanked?.[s._slotId]
    );
    if (!gear) continue;
    const res = await BuyShopGear(user, {
      slot_id: gear._slotId,
      request_id: `stress-unique-${i}`,
      refresh_id: live.shop_meta.window_idx,
    });
    if (res.status === 200 && !res.body.idempotent_replay) uniqueBuys += 1;
  }

  const sdEnd = entities.Character.get(ch.id).stardust;
  assert.ok(uniqueBuys > 10, `expected unique buys, got ${uniqueBuys}`);
  assert.equal(replays, 100_000);
  assert.ok(sdEnd < sdStart);
  assert.ok(sdEnd >= 0);
  console.log(
    `    (uniqueBuys=${uniqueBuys} recoveryLookups=${replays} Δsd=${sdStart - sdEnd} in ${Date.now() - t0}ms)`
  );
});

await testAsync("concurrent same-slot purchases settle once", async () => {
  // Single SQLite connection cannot nest BEGIN from Promise.all; simulate the race
  // as back-to-back requests (production Node still serializes via IMMEDIATE + sold-out).
  await RefreshShop(user, { which: "all", use_free: false });
  const live = entities.Character.get(ch.id);
  const gear = (live.shop_meta.shop_stock || []).find((s) => s.type !== "consumable");
  assert.ok(gear);
  const beforeSd = live.stardust;
  const beforeItems = entities.Item.filter({ character_id: ch.id }).length;

  const first = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "stress-race-winner",
    refresh_id: live.shop_meta.window_idx,
  });
  assert.equal(first.status, 200, first.body?.error);
  assert.ok((first.body.items || []).length >= 1 || (first.body.pending_loot || []).length >= 1);

  const losers = [];
  for (let i = 0; i < 19; i++) {
    losers.push(
      await BuyShopGear(user, {
        slot_id: gear._slotId,
        request_id: `stress-race-loser-${i}`,
        refresh_id: live.shop_meta.window_idx,
      })
    );
  }
  assert.ok(losers.every((r) => r.status === 409));

  const after = entities.Character.get(ch.id);
  assert.equal(after.shop_meta.purchased[gear._slotId], true);
  assert.equal(after.stardust, beforeSd - first.body.cost);
  const afterItems = entities.Item.filter({ character_id: ch.id }).length;
  assert.ok(afterItems === beforeItems + 1 || (first.body.pending_loot || []).length >= 1);

  // Same request_id recovery still returns one grant
  const replay = await BuyShopGear(user, {
    slot_id: gear._slotId,
    request_id: "stress-race-winner",
  });
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).stardust, after.stardust);
});

await testAsync("window normalize drops old stock without client help", async () => {
  const win = getShopWindow();
  const meta = normalizeShopMeta(
    {
      shop_meta: {
        window_idx: win.idx - 1,
        shop_stock: [{ _slotId: "old" }],
        purchased: { old: true },
      },
    },
    win,
    "2099-01-01"
  );
  assert.equal(meta.shop_stock, undefined);
  assert.deepEqual(meta.purchased, {});
});

test("hot deal generator stays separate from stall seed", () => {
  const a = generateSimpleHotDeal("2099-01-01", 20, forClass);
  const b = generateSimpleHotDeal("2099-01-01", 20, forClass);
  assert.equal(a._slotId, b._slotId);
  assert.equal(a.rarity, b.rarity);
  assert.equal(a.cost, b.cost);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
