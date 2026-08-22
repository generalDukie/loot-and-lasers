/**
 * Progression / economy / shop / stim / dungeon balance update tests.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-balance-update.mjs
 */
import assert from "node:assert/strict";
import { XP_STARDUST_SCALE } from "../src/shared/economyConstants.js";
import { expForLevel, getMissionXpPerFuel } from "../src/shared/rewards.js";
import {
  MISSION_XP_REBALANCE,
  DUNGEON_XP_PER_DRU_MULTIPLIER,
  DUNGEON_TOTAL_DRU,
  getDungeonTotalDru,
  getEnemyDru,
  druToRewards,
  computeMissionXpFromFuel,
  getShopWindow,
  getShopGameDayKey,
  generateSimpleShopStock,
  generateSimpleHotDeal,
  rollShopItemLevel,
  rollHotDealItemLevel,
  shopItemLevelMaxGap,
  gearShopPurchasePrice,
  stimShopPurchasePrice,
  stimShopSellValue,
  SHOP_SLOT_COUNT,
  SHOP_MIN_STIMS,
  SHOP_RARITY_MARKUP,
  HOT_DEAL_REFRESH_COUNT,
  randomConsumable,
  priceStimOffer,
  normalizeShopMeta,
  applyXpToCharacter,
} from "../src/shared/economyFormulas.js";
import {
  ARENA_WIN_FUEL_EQUIVALENT,
  ArenaWinStardust,
  JunkSaleValue,
  JUNK_AVG_MISSION_REWARD_RATIO,
  MISSION_STIM_CHANCE_AFTER_GEAR_FAIL,
  MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL,
  StardustPerFuel,
  GearSaleValue,
  MiningStardust,
} from "../src/shared/stardustEconomy.js";

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

function seqRng(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

console.log("\nBalance update tests\n");

test("legacy XP_STARDUST_SCALE remains 10 (economy debt, not XP)", () => {
  assert.equal(XP_STARDUST_SCALE, 10);
});

test("XP formula from L1 forever — no L500 boundary", () => {
  assert.equal(expForLevel(1), 13);
  assert.ok(expForLevel(501) > expForLevel(500));
  assert.ok(Number.isFinite(expForLevel(10000)));
  assert.ok(expForLevel(10000) > expForLevel(1000));
});

test("Mission XP uses 0.85 rebalance; canonical XP/Fuel", () => {
  assert.equal(MISSION_XP_REBALANCE, 0.85);
  const rate = getMissionXpPerFuel(100);
  const xp = computeMissionXpFromFuel(10, 100, 1);
  assert.equal(xp, Math.round(10 * rate * 0.85));
});

test("Dungeon DRU totals and XP × 2.0 per DRU", () => {
  assert.deepEqual(DUNGEON_TOTAL_DRU.slice(1), [40, 50, 60, 70, 95, 110, 125, 140, 155, 185]);
  assert.equal(getDungeonTotalDru(1), 40);
  assert.equal(getDungeonTotalDru(10), 185);
  const shares = [0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.14, 0.18];
  assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const dru = getEnemyDru(1, 10);
  assert.equal(dru, Math.round(40 * 0.18 * 100) / 100);
  const { experience, stardust } = druToRewards(dru, 19);
  assert.equal(stardust, 0);
  assert.equal(DUNGEON_XP_PER_DRU_MULTIPLIER, 2.0);
  assert.equal(
    experience,
    Math.round(dru * getMissionXpPerFuel(19) * DUNGEON_XP_PER_DRU_MULTIPLIER)
  );
});

test("Arena 2.25S; junk 0.45; mission chain chances", () => {
  assert.equal(ARENA_WIN_FUEL_EQUIVALENT, 2.25);
  assert.equal(ArenaWinStardust(100), Math.round(2.25 * StardustPerFuel(100)));
  assert.equal(JUNK_AVG_MISSION_REWARD_RATIO, 0.45);
  assert.equal(MISSION_STIM_CHANCE_AFTER_GEAR_FAIL, 0.25);
  assert.equal(MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL, 0.75);
  const junk = JunkSaleValue(1000, () => 0.5);
  // mid variance ≈ 1.0
  assert.equal(junk, Math.round(1000 * 0.45 * (0.6 + 0.5 * 0.8)));
});

test("Mining unchanged at 3%", () => {
  assert.equal(MiningStardust(100, 60), Math.round(StardustPerFuel(100) * 0.03 * 60));
});

test("Shop 8 slots 80/20 with min 1 stim", () => {
  assert.equal(SHOP_SLOT_COUNT, 8);
  assert.equal(SHOP_MIN_STIMS, 1);
  const fakeItem = (rarity, level, type) => ({
    name: `${rarity} ${type}`,
    type,
    rarity,
    level_requirement: level,
    stats: { strength: 1 },
  });
  for (let seed = 1; seed <= 30; seed++) {
    const stock = generateSimpleShopStock(seed, 50, fakeItem);
    assert.equal(stock.length, 8);
    const stims = stock.filter((s) => s.type === "consumable");
    assert.ok(stims.length >= 1, `seed ${seed} had 0 stims`);
  }
});

test("Shop item level never above player; early gaps", () => {
  assert.equal(shopItemLevelMaxGap(1), 0);
  assert.equal(shopItemLevelMaxGap(5), 0);
  assert.equal(shopItemLevelMaxGap(10), 1);
  assert.equal(shopItemLevelMaxGap(20), 3);
  assert.equal(shopItemLevelMaxGap(34), 10);
  for (let i = 0; i < 100; i++) {
    const L = rollShopItemLevel(25, seqRng([(i * 0.017) % 1]));
    assert.ok(L >= 1 && L <= 25);
  }
});

test("Gear shop price markup × variance; stim fixed 2S/4S/10S", () => {
  assert.equal(SHOP_RARITY_MARKUP.common, 2);
  assert.equal(SHOP_RARITY_MARKUP.legendary, 7);
  const item = { type: "armor", rarity: "rare", level_requirement: 100 };
  const sale = GearSaleValue(item);
  const price = gearShopPurchasePrice(item, () => 0.5);
  const midVar = 0.8 + 0.5 * 0.4;
  assert.equal(price, Math.round(sale * 3.5 * midVar));

  assert.equal(stimShopPurchasePrice("uncommon", 100), Math.round(StardustPerFuel(100) * 2));
  assert.equal(stimShopPurchasePrice("rare", 100), Math.round(StardustPerFuel(100) * 4));
  assert.equal(stimShopPurchasePrice("epic", 100), Math.round(StardustPerFuel(100) * 10));
  assert.equal(stimShopSellValue("uncommon", 100), Math.round(StardustPerFuel(100) * 1));
  assert.equal(stimShopSellValue("epic", 100), Math.round(StardustPerFuel(100) * 5));
  const stim = priceStimOffer(randomConsumable(() => 0.9), 50);
  assert.ok(stim.cost > 0);
  assert.equal(stim.sell_value, stimShopSellValue(stim.rarity, 50));
});

test("Hot Deal gear-only rarity and HOT_DEAL_REFRESH_COUNT=10", () => {
  assert.equal(HOT_DEAL_REFRESH_COUNT, 10);
  const fakeItem = (rarity, level, type) => ({
    name: "x",
    type,
    rarity,
    level_requirement: level,
    stats: {},
  });
  const hot = generateSimpleHotDeal("2026-08-02", 100, fakeItem);
  assert.equal(hot._hotDeal, true);
  assert.ok(["uncommon", "rare", "epic", "legendary"].includes(hot.rarity));
  assert.ok(hot.level_requirement <= 100);
  assert.ok(hot.cost > 0);
});

test("Shop window helpers return finite 12h period", () => {
  const win = getShopWindow(Date.now());
  assert.ok(Number.isFinite(win.idx));
  assert.ok(win.endsAt > win.startsAt);
  assert.ok(getShopGameDayKey().length >= 8);
  assert.equal(win.endsAt - win.startsAt, 12 * 60 * 60 * 1000);
});

test("normalizeShopMeta free refresh resets on window; hot counter on day", () => {
  const winB = { idx: 101 };
  const day = "2026-08-02";
  const next = normalizeShopMeta(
    {
      shop_meta: {
        window_idx: 100,
        free_refresh_used: true,
        hot_day: day,
        hot_manual_refresh_count: 7,
        hot_purchased: true,
        purchased: { a: true },
      },
    },
    winB,
    day
  );
  assert.equal(next.free_refresh_used, false);
  assert.deepEqual(next.purchased, {});
  assert.equal(next.hot_manual_refresh_count, 7);
  assert.equal(next.hot_purchased, true);

  const dayRoll = normalizeShopMeta(
    {
      shop_meta: {
        window_idx: 101,
        free_refresh_used: true,
        hot_day: "2026-08-01",
        hot_manual_refresh_count: 7,
        hot_purchased: true,
      },
    },
    winB,
    day
  );
  assert.equal(dayRoll.hot_manual_refresh_count, 0);
  assert.equal(dayRoll.hot_purchased, false);
  assert.equal(dayRoll.free_refresh_used, true);
});

test("Hot Deal item level never above player; L1 only L1", () => {
  for (let i = 0; i < 40; i++) {
    assert.equal(rollHotDealItemLevel(1, () => (i % 10) / 10), 1);
    const L = rollHotDealItemLevel(50, () => (i * 0.037) % 1);
    assert.ok(L >= 47 && L <= 50);
  }
});

test("Excess XP carries through level-ups; scale once", () => {
  const patch = {};
  const ch = { level: 1, experience: 0 };
  // Dump enough XP for several levels
  const dump = expForLevel(1) + expForLevel(2) + Math.floor(expForLevel(3) / 2);
  applyXpToCharacter(ch, dump, patch);
  assert.ok(patch.level >= 3);
  assert.ok((patch.experience ?? 0) >= 0);
  assert.ok(patch.experience < expForLevel(patch.level));
});

test("Vendor sale unchanged vs shop purchase markup", () => {
  const item = { type: "weapon", rarity: "epic", level_requirement: 50 };
  const sale = GearSaleValue(item);
  const buy = gearShopPurchasePrice(item, () => 0); // min variance 0.8
  assert.equal(buy, Math.round(sale * 5.0 * 0.8));
  assert.ok(buy > sale);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
