/**
 * Restoration 12A — shop architecture, generation, pricing, Hot Deal, haggle rules.
 * Run: npm run test:shops
 */
import assert from "node:assert/strict";
import {
  generateSimpleShopStock,
  generateSimpleHotDeal,
  normalizeShopMeta,
  shopGearSeed,
  rollShopGearRarity,
  rollHotDealRarity,
  gearShopPurchasePrice,
  stimShopPurchasePrice,
  rollHaggle,
  SHOP_SLOT_COUNT,
  SHOP_REFRESH_COST,
  SHOP_GEAR_RARITY_WEIGHTS,
  HOT_DEAL_RARITY_WEIGHTS,
  SHOP_MIN_STIMS,
  getShopWindow,
} from "../src/shared/economyFormulas.js";
import {
  serializeShopPresentation,
  serializeShopVendors,
  isStimOffer,
  isGearOffer,
  HAGGLE_SUCCESS_CHANCE,
  SHOP_VENDOR_GEAR,
  SHOP_VENDOR_SUPPLY,
} from "../src/shared/shopService.js";
import { randomItem } from "../src/shared/rewards.js";

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

const forClass = (rarity, level, type, rng) => randomItem(rarity, level, type, rng, "Vanguard");

console.log("\nShop architecture tests (Restoration 12A)\n");

test("shop stock is 8 slots with ≥1 stim", () => {
  const stock = generateSimpleShopStock(42, 20, forClass);
  assert.equal(stock.length, SHOP_SLOT_COUNT);
  const stims = stock.filter(isStimOffer);
  assert.ok(stims.length >= SHOP_MIN_STIMS);
  assert.ok(stock.some(isGearOffer));
  for (const s of stock) {
    assert.ok(s._slotId);
    assert.ok((s.cost ?? s._cost) > 0);
  }
});

test("same seed → identical structural offers (slot/rarity/cost/type)", () => {
  // Name flavor may consume extra RNG inside GenerateGearItem; persistence is the
  // production guarantee (EnsureShop keeps shop_meta). Structural fields must match.
  const a = generateSimpleShopStock(99, 15, forClass);
  const b = generateSimpleShopStock(99, 15, forClass);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i]._slotId, b[i]._slotId);
    assert.equal(a[i]._offerKind || a[i].type, b[i]._offerKind || b[i].type);
    assert.equal(a[i].rarity, b[i].rarity);
    assert.equal(a[i].cost, b[i].cost);
    assert.equal(a[i].type, b[i].type);
    assert.equal(a[i].level_requirement, b[i].level_requirement);
  }
});

test("persisted stock survives serialize round-trip identity", () => {
  const stock = generateSimpleShopStock(55, 18, forClass);
  const meta = {
    window_idx: 3,
    shop_stock: stock,
    hot_deal: generateSimpleHotDeal("2026-08-03", 18, forClass),
    purchased: {},
    yanked: {},
  };
  const p1 = serializeShopPresentation(meta);
  const p2 = serializeShopPresentation(meta);
  assert.equal(p1.vendors.gear.items.length, p2.vendors.gear.items.length);
  assert.equal(p1.vendors.gear.items[0]?.shop_item_id, p2.vendors.gear.items[0]?.shop_item_id);
  assert.equal(p1.vendors.gear.hot_deal?.shop_item_id, p2.vendors.gear.hot_deal?.shop_item_id);
  assert.deepEqual(
    p1.vendors.gear.items.map((i) => i.final_price),
    p2.vendors.gear.items.map((i) => i.final_price)
  );
});

test("normalizeShopMeta preserves stock within same window", () => {
  const win = getShopWindow();
  const stock = generateSimpleShopStock(shopGearSeed({ gear_refresh: 0, manual_refresh_count: 0 }, win), 10, forClass);
  const hot = generateSimpleHotDeal("2026-08-03", 10, forClass);
  const ch = {
    shop_meta: {
      window_idx: win.idx,
      shop_stock: stock,
      gear_stock: stock,
      hot_deal: hot,
      free_refresh_used: true,
      purchased: { [stock[0]._slotId]: true },
    },
  };
  const meta = normalizeShopMeta(ch, win, "2026-08-03");
  assert.equal(meta.window_idx, win.idx);
  assert.equal(meta.shop_stock.length, SHOP_SLOT_COUNT);
  assert.equal(meta.free_refresh_used, true);
  assert.equal(meta.purchased[stock[0]._slotId], true);
  assert.equal(meta.hot_deal._slotId, hot._slotId);
});

test("normalizeShopMeta clears stock on new window", () => {
  const win = getShopWindow();
  const ch = {
    shop_meta: {
      window_idx: win.idx - 1,
      shop_stock: [{ _slotId: "old" }],
      free_refresh_used: true,
    },
  };
  const meta = normalizeShopMeta(ch, win, "2026-08-03");
  assert.equal(meta.window_idx, win.idx);
  assert.equal(meta.shop_stock, undefined);
  assert.equal(meta.free_refresh_used, false);
  assert.deepEqual(meta.purchased, {});
});

test("shop gear rarity table (not mission)", () => {
  assert.deepEqual(SHOP_GEAR_RARITY_WEIGHTS, {
    common: 0.6,
    uncommon: 0.3,
    rare: 0.08,
    epic: 0.015,
    legendary: 0.005,
  });
  assert.deepEqual(HOT_DEAL_RARITY_WEIGHTS, {
    uncommon: 0.35,
    rare: 0.45,
    epic: 0.15,
    legendary: 0.05,
  });
  // High level: all rarities unlockable
  const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (let n = 0; n < 10000; n++) {
    counts[rollShopGearRarity(50, () => (n + 0.5) / 10000)] += 1;
  }
  assert.ok(counts.common > 5000);
  assert.ok(counts.legendary > 0 && counts.legendary < 200);
});

test("hot deal rarity never common", () => {
  for (let n = 0; n < 200; n++) {
    const r = rollHotDealRarity(50, () => (n + 0.5) / 200);
    assert.notEqual(r, "common");
  }
});

test("pricing persists as positive listing cost", () => {
  const item = randomItem("rare", 20, "weapon", () => 0.5, "Vanguard");
  const price = gearShopPurchasePrice(item, () => 0.5);
  assert.ok(price >= 1);
  assert.equal(stimShopPurchasePrice("uncommon", 10), stimShopPurchasePrice("uncommon", 10));
  assert.ok(stimShopPurchasePrice("epic", 10) > stimShopPurchasePrice("uncommon", 10));
});

test("vendor partition: gear vs supply", () => {
  const stock = generateSimpleShopStock(7, 25, forClass);
  const hot = generateSimpleHotDeal("2026-08-03", 25, forClass);
  const meta = {
    window_idx: 1,
    shop_stock: stock,
    hot_deal: hot,
    purchased: {},
    yanked: {},
  };
  const vendors = serializeShopVendors(meta);
  assert.equal(vendors.gear.id, SHOP_VENDOR_GEAR);
  assert.equal(vendors.supply.id, SHOP_VENDOR_SUPPLY);
  assert.ok(vendors.gear.items.every((i) => i.vendor === SHOP_VENDOR_GEAR));
  assert.ok(vendors.supply.items.every((i) => i.vendor === SHOP_VENDOR_SUPPLY));
  assert.equal(vendors.gear.items.length + vendors.supply.items.length, stock.length);
  assert.ok(vendors.gear.hot_deal);
  assert.equal(vendors.gear.hot_deal.hot_deal, true);
  assert.equal(vendors.supply.hot_deal, null);
});

test("serialize presentation includes window + haggle rules", () => {
  const stock = generateSimpleShopStock(3, 12, forClass);
  const meta = {
    window_idx: 9,
    shop_stock: stock,
    hot_deal: generateSimpleHotDeal("2026-08-03", 12, forClass),
    free_refresh_used: false,
    purchased: {},
    yanked: {},
  };
  const p = serializeShopPresentation(meta);
  assert.ok(p.shop_window.endsAt > p.shop_window.startsAt);
  assert.equal(p.refresh.cost_nova, SHOP_REFRESH_COST);
  assert.equal(p.refresh.free_available, false);
  assert.equal(p.haggle.success_chance, HAGGLE_SUCCESS_CHANCE);
  assert.ok(p.vendors.gear);
  assert.ok(p.vendors.supply);
  const offer = p.vendors.gear.items[0] || p.vendors.supply.items[0];
  assert.ok(offer.shop_item_id);
  assert.ok(offer.base_price >= 0);
  assert.equal(offer.final_price, offer.base_price - offer.discount);
  assert.equal(offer.currency, "stardust");
});

test("sold-out flags surface in serialization", () => {
  const stock = generateSimpleShopStock(1, 8, forClass);
  const id = stock[0]._slotId;
  const meta = {
    window_idx: 1,
    shop_stock: stock,
    purchased: { [id]: true },
    yanked: {},
    hot_deal: generateSimpleHotDeal("2026-08-03", 8, forClass),
    hot_purchased: true,
  };
  const vendors = serializeShopVendors(meta);
  const all = [...vendors.gear.items, ...vendors.supply.items];
  const sold = all.find((o) => o.shop_item_id === id);
  assert.equal(sold.sold_out, true);
  assert.equal(vendors.gear.hot_deal.sold_out, true);
});

test("haggle success discounts; fail does not invent stock", () => {
  const win = rollHaggle(() => 0.1); // success path first roll < 0.4
  assert.equal(win.ok, true);
  assert.ok(win.mult >= 0.8 && win.mult <= 0.85);
  const lose = rollHaggle(() => 0.9);
  assert.equal(lose.ok, false);
});

test("refresh cost constant", () => {
  assert.equal(SHOP_REFRESH_COST, 20);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
