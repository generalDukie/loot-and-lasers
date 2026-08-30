/**
 * Phase 2 — Gear / Backpack / Item Economy.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-phase2-gear-economy.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-phase2-gear-"));
process.env.DB_PATH = path.join(tmpDir, "phase2-gear.db");

const {
  GenerateGearItem,
  BaseGearStatBudget,
  getItemStatBudget,
  getSlotMultiplier,
  getRarityBudgetMultiplier,
  rollItemStats,
  EQUIPMENT_SLOTS,
  ITEM_ATTR_KEYS,
  computeItemVendorValue,
} = await import("../../src/lib/itemGeneration.js");
const {
  gearBaseStatBudget,
  gearStatPool,
  gearResaleValue,
  applyGearStatBudgetVariance,
  rollGearStatBudgetVariance,
  roundHalfUp,
  pveHiddenStatBudgetOffset,
  pveGearStatBudgetLevel,
  BACKPACK_UNEQUIPPED_GEAR_CAP,
  GEAR_RARITY_BUDGET_MULT,
  GEAR_STAT_BUDGET_VARIANCE_MAX,
  GEAR_STAT_BUDGET_VARIANCE_MIN,
  canonicalGearSlot,
} = await import("../../src/lib/productionMath/index.js");
const { GearSaleValue } = await import("../../src/lib/stardustEconomy.js");
const { entities } = await import("../src/entities.js");
const {
  EquipItem,
  UnequipItem,
  GetInventory,
  DissolveItem,
  EnsureShop,
  BuyShopGear,
  BuyShopConsumable,
  LaunchMission,
} = await import("../src/functions/economy.js");
const { grantItemOrPending, countBagOccupancy, assertBackpackHasSpace } = await import("../src/shared/inventoryGrant.js");
const { getInventoryCap } = await import("../src/shared/economyFormulas.js");
const { PrepareDungeonCombat } = await import("../src/functions/economyFollowOn.js");

let passed = 0;
let failed = 0;
const evidence = [];

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

function seqRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

let seq = 0;
function makeCharacter(overrides = {}) {
  seq += 1;
  const user = {
    id: `p2-user-${seq}`,
    email: `p2${seq}@example.com`,
    role: "user",
    active_character_id: "",
  };
  const ch = entities.Character.create({
    id: `p2-char-${seq}`,
    name: "Runner",
    class: "Vanguard",
    race: "Keldris",
    level: 10,
    experience: 0,
    experience_to_next_level: 100000,
    stardust: 50_000,
    total_stardust_earned: 50_000,
    nova_crystals: 0,
    fuel: 100,
    max_fuel: 100,
    stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
    attribute_purchases_by_stat: {
      strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
    },
    equipped_items: {},
    created_by_id: user.id,
    created_by: user.email,
    ...overrides,
  });
  user.active_character_id = ch.id;
  return { user, ch };
}

console.log("\nPhase 2 gear / backpack / resale\n");

test("GearBase anchors + high-level finite/monotone", () => {
  const levels = [1, 10, 50, 100, 500, 800, 1500, 2000];
  let prev = 0;
  for (const L of levels) {
    const v = gearBaseStatBudget(L);
    assert.equal(v, BaseGearStatBudget(L), `live wrapper L${L}`);
    assert.ok(Number.isInteger(v) && Number.isFinite(v) && v > 0);
    assert.ok(v >= prev, `monotone L${L}`);
    prev = v;
    evidence.push(`GearBase L${L}=${v}`);
  }
  assert.equal(gearBaseStatBudget(1), 12);
  assert.ok(gearBaseStatBudget(2000) > gearBaseStatBudget(1500));
  assert.ok(gearBaseStatBudget(2000) < Number.MAX_SAFE_INTEGER);
});

test("rarity multipliers Legendary 1.50; accessory has no slot premium", () => {
  assert.equal(GEAR_RARITY_BUDGET_MULT.legendary, 1.5);
  assert.equal(getRarityBudgetMultiplier("legendary"), 1.5);
  assert.equal(getSlotMultiplier("accessory"), 1);
  assert.equal(getSlotMultiplier("ring"), 1);
  assert.equal(getSlotMultiplier("weapon"), 1.2);
  assert.equal(getSlotMultiplier("ship_module"), 1.2);
  const L = 100;
  const base = gearBaseStatBudget(L);
  assert.equal(getItemStatBudget(L, "accessory", "legendary"), gearStatPool(L, "accessory", "legendary"));
  assert.equal(getItemStatBudget(L, "armor", "legendary"), gearStatPool(L, "armor", "legendary"));
  assert.ok(getItemStatBudget(L, "weapon", "legendary") > getItemStatBudget(L, "accessory", "legendary"));
  evidence.push(`L100 base=${base} legend armor=${getItemStatBudget(L, "armor", "legendary")} weapon=${getItemStatBudget(L, "weapon", "legendary")}`);
});

test("canonical Accessory; no production ring slot", () => {
  assert.equal(canonicalGearSlot("ring"), "accessory");
  assert.equal(canonicalGearSlot("accessory"), "accessory");
  const item = GenerateGearItem({
    itemLevel: 8,
    itemType: "ring",
    rarity: "rare",
    rng: seqRng(7),
  });
  assert.equal(item.type, "accessory");
  assert.ok(!EQUIPMENT_SLOTS.includes("ring"));
});

test("universal generation: 8 slots × 5 rarities, exact budget, valid stats", () => {
  const rarities = ["common", "uncommon", "rare", "epic", "legendary"];
  const ids = new Set();
  for (const slot of EQUIPMENT_SLOTS) {
    for (const rarity of rarities) {
      for (const L of [1, 10, 50, 100, 500, 1500, 2000]) {
        const item = GenerateGearItem({
          itemLevel: L,
          itemType: slot,
          rarity,
          rng: seqRng(L * 17 + slot.length * 3 + rarity.length),
          className: "Vanguard",
        });
        const sum = Object.values(item.stats).reduce((a, b) => a + b, 0);
        const pool = getItemStatBudget(L, slot, rarity);
        assert.ok(
          item.stat_budget_variance >= GEAR_STAT_BUDGET_VARIANCE_MIN
          && item.stat_budget_variance <= GEAR_STAT_BUDGET_VARIANCE_MAX,
          `${slot} ${rarity} L${L} variance`,
        );
        const expected = applyGearStatBudgetVariance(pool, item.stat_budget_variance);
        assert.equal(sum, expected, `${slot} ${rarity} L${L}`);
        assert.equal(sum, item.stat_budget);
        assert.equal(item.pre_variance_stat_budget, pool);
        assert.equal(item.level, L);
        assert.equal(item.stat_budget_level, L);
        for (const [k, v] of Object.entries(item.stats)) {
          assert.ok(ITEM_ATTR_KEYS.includes(k), k);
          assert.ok(Number.isInteger(v) && v >= 0 && Number.isFinite(v));
        }
        assert.ok(!Object.values(item.stats).some((v) => v < 0));
        ids.add(`${slot}:${rarity}:${L}:${sum}`);
      }
    }
  }
  assert.ok(ids.size > 100);
});

test("intrinsic Gear stat-budget variance is ±10%, once, persisted, exact allocation", () => {
  assert.equal(GEAR_STAT_BUDGET_VARIANCE_MIN, 0.9);
  assert.equal(GEAR_STAT_BUDGET_VARIANCE_MAX, 1.1);
  const L = 100;
  const slot = "armor";
  const rarity = "rare";
  const pre = getItemStatBudget(L, slot, rarity);
  assert.equal(rollGearStatBudgetVariance(() => 0), GEAR_STAT_BUDGET_VARIANCE_MIN);
  assert.equal(rollGearStatBudgetVariance(() => 0.5), 1);
  assert.equal(rollGearStatBudgetVariance(() => 1), GEAR_STAT_BUDGET_VARIANCE_MAX);
  assert.equal(
    applyGearStatBudgetVariance(pre, GEAR_STAT_BUDGET_VARIANCE_MIN),
    roundHalfUp(pre * GEAR_STAT_BUDGET_VARIANCE_MIN),
  );
  assert.equal(applyGearStatBudgetVariance(pre, 1), pre);
  assert.equal(
    applyGearStatBudgetVariance(pre, GEAR_STAT_BUDGET_VARIANCE_MAX),
    roundHalfUp(pre * GEAR_STAT_BUDGET_VARIANCE_MAX),
  );

  const lo = rollItemStats({
    itemLevel: L, type: slot, rarity, rng: seqRng(3), statBudgetVariance: GEAR_STAT_BUDGET_VARIANCE_MIN,
  });
  const mid = rollItemStats({
    itemLevel: L, type: slot, rarity, rng: seqRng(3), statBudgetVariance: 1,
  });
  const hi = rollItemStats({
    itemLevel: L, type: slot, rarity, rng: seqRng(3), statBudgetVariance: GEAR_STAT_BUDGET_VARIANCE_MAX,
  });
  assert.equal(lo.preVarianceBudget, pre);
  assert.equal(mid.preVarianceBudget, pre);
  assert.equal(hi.preVarianceBudget, pre);
  assert.equal(lo.targetBudget, applyGearStatBudgetVariance(pre, GEAR_STAT_BUDGET_VARIANCE_MIN));
  assert.equal(mid.targetBudget, pre);
  assert.equal(hi.targetBudget, applyGearStatBudgetVariance(pre, GEAR_STAT_BUDGET_VARIANCE_MAX));
  assert.equal(lo.budget, lo.targetBudget);
  assert.equal(mid.budget, mid.targetBudget);
  assert.equal(hi.budget, hi.targetBudget);
  assert.equal(Object.values(lo.stats).reduce((a, b) => a + b, 0), lo.targetBudget);
  assert.equal(Object.values(mid.stats).reduce((a, b) => a + b, 0), mid.targetBudget);
  assert.equal(Object.values(hi.stats).reduce((a, b) => a + b, 0), hi.targetBudget);

  const SAMPLE = 20000;
  const meanRng = seqRng(1);
  let sumVar = 0;
  let sumRatio = 0;
  for (let i = 0; i < SAMPLE; i++) {
    const v = rollGearStatBudgetVariance(meanRng);
    sumVar += v;
    sumRatio += applyGearStatBudgetVariance(pre, v) / pre;
  }
  const meanVar = sumVar / SAMPLE;
  const meanRatio = sumRatio / SAMPLE;
  assert.ok(Math.abs(meanVar - 1) < 0.01, `mean variance ${meanVar}`);
  assert.ok(Math.abs(meanRatio - 1) < 0.01, `mean budget ratio ${meanRatio}`);

  const a = GenerateGearItem({
    itemLevel: L, itemType: slot, rarity, rng: seqRng(42),
  });
  const b = GenerateGearItem({
    itemLevel: L, itemType: slot, rarity, rng: seqRng(42),
  });
  assert.equal(a.stat_budget_variance, b.stat_budget_variance);
  assert.deepEqual(a.stats, b.stats);
  const c = GenerateGearItem({
    itemLevel: L, itemType: slot, rarity, rng: seqRng(43),
  });
  assert.ok(
    a.stat_budget_variance !== c.stat_budget_variance || JSON.stringify(a.stats) !== JSON.stringify(c.stats),
  );

  const persisted = entities.Item.create({
    name: "Variance Blade",
    type: a.type,
    rarity: a.rarity,
    level: a.level,
    level_requirement: a.level_requirement,
    stat_budget_level: a.stat_budget_level,
    pre_variance_stat_budget: a.pre_variance_stat_budget,
    stat_budget_variance: a.stat_budget_variance,
    stat_budget: a.stat_budget,
    stats: a.stats,
  });
  const again = entities.Item.get(persisted.id);
  assert.equal(again.stat_budget_variance, a.stat_budget_variance);
  assert.equal(again.stat_budget, a.stat_budget);
  assert.deepEqual(again.stats, a.stats);
  const sumAgain = Object.values(again.stats).reduce((s, n) => s + n, 0);
  assert.equal(sumAgain, again.stat_budget);
  assert.equal(sumAgain, applyGearStatBudgetVariance(again.pre_variance_stat_budget, again.stat_budget_variance));
});

test("PvE hidden budget is opt-in and does not inflate economic level or resale", () => {
  assert.equal(pveHiddenStatBudgetOffset(10), 5);
  assert.equal(pveHiddenStatBudgetOffset(200), 10);
  const economic = 10;
  const withOffset = GenerateGearItem({
    economicLevel: economic,
    itemType: "armor",
    rarity: "rare",
    playerLevel: 10,
    applyPveHiddenBudgetOffset: true,
    rng: seqRng(99),
  });
  const without = GenerateGearItem({
    economicLevel: economic,
    itemType: "armor",
    rarity: "rare",
    rng: seqRng(99),
  });
  assert.equal(withOffset.level, 10);
  assert.equal(withOffset.stat_budget_level, pveGearStatBudgetLevel(10));
  assert.equal(without.stat_budget_level, 10);
  const saleWith = computeItemVendorValue(withOffset);
  const saleWithout = computeItemVendorValue(without);
  assert.equal(saleWith, saleWithout);
  assert.equal(saleWith, gearResaleValue(10, "armor", "rare"));
  assert.ok(Object.values(withOffset.stats).reduce((a, b) => a + b, 0)
    > Object.values(without.stats).reduce((a, b) => a + b, 0));
  evidence.push(`PvE L10 offset=${pveHiddenStatBudgetOffset(10)} sale=${saleWith}`);
});

test("Mission-style default generation does not apply PvE offset", () => {
  const item = GenerateGearItem({
    itemLevel: 10,
    itemType: "helmet",
    rarity: "common",
    origin: "mission",
    rng: () => 0.4,
  });
  assert.equal(item.stat_budget_level, 10);
  assert.equal(item.origin, "mission");
  assert.equal(item.shipment_eligible, true);
  assert.equal(item.manufacturer, null);
});

test("Market origin is shipment-ineligible; unassigned defers eligibility", () => {
  const market = GenerateGearItem({
    itemLevel: 5,
    itemType: "boots",
    rarity: "uncommon",
    origin: "market",
    rng: () => 0.2,
  });
  assert.equal(market.shipment_eligible, false);
  const unknown = GenerateGearItem({
    itemLevel: 5,
    itemType: "boots",
    rarity: "uncommon",
    rng: () => 0.2,
  });
  assert.equal(unknown.origin, "unassigned");
  assert.equal(unknown.shipment_eligible, null);
});

test("resale ratios vs pre-variance market base; shop GearSaleValue stays separate", () => {
  const L = 50;
  const common = gearResaleValue(L, "armor", "common");
  const uncommon = gearResaleValue(L, "armor", "uncommon");
  const rare = gearResaleValue(L, "armor", "rare");
  const epic = gearResaleValue(L, "armor", "epic");
  const legend = gearResaleValue(L, "armor", "legendary");
  const weapon = gearResaleValue(L, "weapon", "rare");
  assert.ok(common > 0 && uncommon > common);
  assert.ok(rare > uncommon);
  assert.ok(epic > rare);
  assert.ok(legend > epic);
  assert.ok(weapon > rare);
  assert.notEqual(gearResaleValue(L, "weapon", "legendary"), GearSaleValue({
    type: "weapon", rarity: "legendary", level_requirement: L,
  }));
  evidence.push(`resale L50 armor C/U/R/E/L=${common}/${uncommon}/${rare}/${epic}/${legend} weapon-rare=${weapon}`);
});

test("no GES export / auto-equip flags on generated items", () => {
  const item = GenerateGearItem({
    itemLevel: 3,
    itemType: "neck",
    rarity: "epic",
    rng: () => 0.33,
  });
  assert.equal(item.is_equipped, false);
  assert.equal(item.ges, undefined);
  assert.equal(item.gearScore, undefined);
});

await testAsync("Backpack cap is exactly 10 unequipped items; stims consume a slot", async () => {
  const { ch } = makeCharacter();
  assert.equal(getInventoryCap(ch), BACKPACK_UNEQUIPPED_GEAR_CAP);
  assert.equal(BACKPACK_UNEQUIPPED_GEAR_CAP, 10);
  for (let i = 0; i < 9; i++) {
    const g = grantItemOrPending(ch, {
      name: `Gear ${i}`,
      type: "helmet",
      rarity: "common",
      stats: { vitality: 1 },
      level: 1,
    });
    assert.ok(g.item, `insert ${i}`);
  }
  const stim = grantItemOrPending(ch, {
    name: "Stim",
    type: "consumable",
    rarity: "uncommon",
    sell_value: 12,
    consumable: { attribute: "strength" },
  });
  assert.ok(stim.item);
  assert.equal(countBagOccupancy(ch), 10);
  const overflowGear = grantItemOrPending(ch, {
    name: "Eleventh",
    type: "boots",
    rarity: "common",
    stats: { agility: 1 },
    level: 1,
  });
  assert.equal(overflowGear.item, null);
  assert.ok(overflowGear.pending);
  const overflowStim = grantItemOrPending(ch, {
    name: "Stim 2",
    type: "consumable",
    rarity: "uncommon",
    sell_value: 12,
    consumable: { attribute: "agility" },
  });
  assert.equal(overflowStim.item, null);
  assert.ok(overflowStim.pending);
  assert.equal(countBagOccupancy(ch), 10);
  evidence.push(`backpack max observed=${countBagOccupancy(ch)}`);
});

await testAsync("shop buy and mission launch reject when backpack is full", async () => {
  const { user, ch } = makeCharacter({ stardust: 500_000, nova_crystals: 50 });
  for (let i = 0; i < 10; i++) {
    assert.ok(grantItemOrPending(ch, {
      name: `Fill ${i}`,
      type: "helmet",
      rarity: "common",
      stats: { vitality: 1 },
      level: 1,
    }).item);
  }
  const live = entities.Character.get(ch.id);
  assert.equal(countBagOccupancy(live), 10);
  const beforeSd = live.stardust;
  assert.throws(
    () => assertBackpackHasSpace(live),
    (err) => err.code === "INVENTORY_FULL",
  );

  const shop = await EnsureShop(user, {});
  assert.equal(shop.status, 200, shop.body?.error);
  const liveShop = entities.Character.get(ch.id);
  const stock = liveShop.shop_meta?.shop_stock || liveShop.shop_meta?.gear_stock || [];
  const gearSlot = stock.find((s) => s.type !== "consumable" && s._offerKind !== "stim");
  const stimSlot = stock.find((s) => s.type === "consumable" || s._offerKind === "stim");
  assert.ok(gearSlot, "need a gear shop slot");
  assert.ok(stimSlot, "need a stim shop slot");
  const buy = await BuyShopGear(user, { slot_id: gearSlot._slotId });
  assert.equal(buy.status, 400, buy.body?.error);
  assert.equal(buy.body.code, "INVENTORY_FULL");
  assert.equal(entities.Character.get(ch.id).stardust, beforeSd);
  assert.ok(!buy.body.items?.length);
  const buyC = await BuyShopConsumable(user, { slot_id: stimSlot._slotId });
  assert.equal(buyC.status, 400, buyC.body?.error);
  assert.equal(buyC.body.code, "INVENTORY_FULL");
  assert.equal(entities.Character.get(ch.id).stardust, beforeSd);
  const launch = await LaunchMission(user, { board_offer_id: "no-such-offer" });
  assert.equal(launch.status, 400);
  assert.equal(launch.body.code, "INVENTORY_FULL");
  const dungeon = await PrepareDungeonCombat(user, { planet_id: 1, enemy_index: 1 });
  assert.equal(dungeon.status, 400, dungeon.body?.error);
  assert.equal(dungeon.body.code, "INVENTORY_FULL");
  evidence.push("full-bag shop/mission/dungeon launch blocked INVENTORY_FULL");
});

await testAsync("equip empty slot, occupied swap, full-backpack swap, mismatch, replay", async () => {
  const { user, ch } = makeCharacter();
  const bagA = entities.Item.create({
    name: "Blade A",
    type: "weapon",
    rarity: "rare",
    stats: { strength: 8 },
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  const empty = await EquipItem(user, { item_id: bagA.id });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.already, false);
  assert.equal(entities.Item.get(bagA.id).is_equipped, true);
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), 0);

  const bagB = entities.Item.create({
    name: "Blade B",
    type: "weapon",
    rarity: "epic",
    stats: { strength: 12 },
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  const swap = await EquipItem(user, { item_id: bagB.id });
  assert.equal(swap.status, 200);
  assert.equal(entities.Item.get(bagB.id).is_equipped, true);
  assert.equal(entities.Item.get(bagA.id).is_equipped, false);

  const bagC = entities.Item.create({
    name: "Blade C",
    type: "weapon",
    rarity: "legendary",
    stats: { strength: 20 },
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  while (countBagOccupancy(entities.Character.get(ch.id)) < 10) {
    entities.Item.create({
      name: "Fill",
      type: "armor",
      rarity: "common",
      stats: { vitality: 1 },
      character_id: ch.id,
      owner_id: user.id,
      is_equipped: false,
    });
  }
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), 10);
  const before = countBagOccupancy(entities.Character.get(ch.id));
  const fullSwap = await EquipItem(user, { item_id: bagC.id, request_id: "p2-full-swap" });
  assert.equal(fullSwap.status, 200, fullSwap.body?.error);
  assert.equal(entities.Item.get(bagC.id).is_equipped, true);
  assert.equal(entities.Item.get(bagB.id).is_equipped, false);
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), before);
  evidence.push(`full-backpack occupied swap occupancy=${before}→${countBagOccupancy(entities.Character.get(ch.id))}`);

  const replay = await EquipItem(user, { item_id: bagC.id, request_id: "p2-full-swap" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);

  const armorFill = entities.Item.filter({ character_id: ch.id }, null, 50)
    .find((i) => i.type === "armor" && !i.is_equipped);
  assert.ok(armorFill);
  const emptySlotFromFull = await EquipItem(user, { item_id: armorFill.id });
  assert.equal(emptySlotFromFull.status, 200, emptySlotFromFull.body?.error);
  assert.equal(entities.Item.get(armorFill.id).is_equipped, true);
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), 9);

  const stim = entities.Item.create({
    name: "NotGear",
    type: "consumable",
    rarity: "uncommon",
    sell_value: 5,
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  const mismatch = await EquipItem(user, { item_id: stim.id });
  assert.equal(mismatch.status, 400);

  const other = makeCharacter();
  const stolen = await EquipItem(other.user, { item_id: armorFill.id });
  assert.equal(stolen.status, 403);

  const missing = await EquipItem(user, { item_id: "no-such-item" });
  assert.equal(missing.status, 404);
});

await testAsync("unequip with space vs full backpack rejection", async () => {
  const { user, ch } = makeCharacter();
  const item = entities.Item.create({
    name: "Legs",
    type: "legs",
    rarity: "rare",
    stats: { agility: 4 },
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  await EquipItem(user, { item_id: item.id });
  const ok = await UnequipItem(user, { item_id: item.id });
  assert.equal(ok.status, 200);
  assert.equal(entities.Item.get(item.id).is_equipped, false);

  await EquipItem(user, { item_id: item.id });
  while (countBagOccupancy(entities.Character.get(ch.id)) < 10) {
    entities.Item.create({
      name: "FillU",
      type: "boots",
      rarity: "common",
      stats: { agility: 1 },
      character_id: ch.id,
      owner_id: user.id,
      is_equipped: false,
    });
  }
  const blocked = await UnequipItem(user, { item_id: item.id });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.code, "INVENTORY_FULL");
  assert.equal(entities.Item.get(item.id).is_equipped, true);
});

await testAsync("sell recomputes production resale; replay cannot double-pay", async () => {
  const { user, ch } = makeCharacter({ stardust: 1000, total_stardust_earned: 1000 });
  const item = entities.Item.create({
    name: "Sold",
    type: "weapon",
    rarity: "epic",
    level: 20,
    level_requirement: 20,
    stats: { strength: 9 },
    sell_value: 1,
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  const expected = gearResaleValue(20, "weapon", "epic");
  assert.notEqual(expected, 1);
  const before = entities.Character.get(ch.id).stardust;
  const sold = await DissolveItem(user, { item_id: item.id, request_id: "p2-sell-1" });
  assert.equal(sold.status, 200, sold.body?.error);
  assert.equal(sold.body.stardust_gained, expected);
  assert.equal(entities.Character.get(ch.id).stardust, before + expected);
  assert.ok(!entities.Item.get(item.id));
  const replay = await DissolveItem(user, { item_id: item.id, request_id: "p2-sell-1" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(replay.body.stardust_gained, expected);
  assert.equal(entities.Character.get(ch.id).stardust, before + expected);
  evidence.push(`sell L20 weapon epic=${expected} (ignored persisted sell_value=1)`);
});

await testAsync("equipped Gear cannot be sold; unequipped sale still works", async () => {
  const { user, ch } = makeCharacter({ stardust: 2500, total_stardust_earned: 2500 });
  const worn = entities.Item.create({
    name: "Worn Blade",
    type: "weapon",
    rarity: "rare",
    level: 12,
    level_requirement: 12,
    stats: { strength: 6 },
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  const bag = entities.Item.create({
    name: "Bag Blade",
    type: "weapon",
    rarity: "uncommon",
    level: 8,
    level_requirement: 8,
    stats: { strength: 3 },
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  const equipped = await EquipItem(user, { item_id: worn.id });
  assert.equal(equipped.status, 200);
  const beforeSd = entities.Character.get(ch.id).stardust;
  const beforeBag = countBagOccupancy(entities.Character.get(ch.id));
  const beforeEq = { ...(entities.Character.get(ch.id).equipped_items || {}) };

  const blocked = await DissolveItem(user, { item_id: worn.id, request_id: "p2-sell-equipped" });
  assert.equal(blocked.status, 400, blocked.body?.error);
  assert.equal(blocked.body.code, "ITEM_EQUIPPED");
  assert.equal(entities.Item.get(worn.id).is_equipped, true);
  assert.equal(entities.Character.get(ch.id).stardust, beforeSd);
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), beforeBag);
  assert.equal(entities.Character.get(ch.id).equipped_items.weapon, worn.id);
  assert.deepEqual(entities.Character.get(ch.id).equipped_items, beforeEq);

  const replay = await DissolveItem(user, { item_id: worn.id, request_id: "p2-sell-equipped" });
  assert.equal(replay.status, 400);
  assert.equal(replay.body.idempotent_replay, undefined);
  assert.equal(entities.Character.get(ch.id).stardust, beforeSd);
  assert.ok(entities.Item.get(worn.id));

  const expectedBag = gearResaleValue(8, "weapon", "uncommon");
  const soldBag = await DissolveItem(user, { item_id: bag.id });
  assert.equal(soldBag.status, 200, soldBag.body?.error);
  assert.equal(soldBag.body.stardust_gained, expectedBag);
  assert.ok(!entities.Item.get(bag.id));
  assert.equal(entities.Item.get(worn.id).is_equipped, true);
  evidence.push(`equipped sale rejected ITEM_EQUIPPED; unequipped L8 weapon uncommon=${expectedBag}`);
});

await testAsync("persistence: IDs, stats, equipped, backpack exact after reload", async () => {
  const { user, ch } = makeCharacter();
  const created = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const it = entities.Item.create({
      name: `Persist ${slot}`,
      type: slot,
      rarity: "rare",
      level: 12,
      stats: { luck: 3 },
      origin: "mission",
      character_id: ch.id,
      owner_id: user.id,
      is_equipped: false,
    });
    created.push(it);
    if (slot === "weapon" || slot === "helmet") {
      await EquipItem(user, { item_id: it.id });
    }
  }
  const snap = await GetInventory(user, {});
  assert.equal(snap.status, 200);
  const byId = Object.fromEntries(snap.body.items.map((i) => [i.id, i]));
  for (const it of created) {
    const again = entities.Item.get(it.id);
    assert.equal(again.rarity, "rare");
    assert.equal(again.level, 12);
    assert.equal(again.stats.luck, 3);
    assert.equal(again.origin, "mission");
    assert.equal(byId[it.id].id, it.id);
  }
  assert.equal(entities.Item.get(created.find((i) => i.type === "weapon").id).is_equipped, true);
  assert.equal(snap.body.bag_capacity, 10);
});

await testAsync("item-level does not block equip", async () => {
  const { user, ch } = makeCharacter({ level: 1 });
  const item = entities.Item.create({
    name: "High",
    type: "neck",
    rarity: "legendary",
    level: 500,
    level_requirement: 500,
    stats: { luck: 40 },
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
  });
  const res = await EquipItem(user, { item_id: item.id });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(entities.Item.get(item.id).is_equipped, true);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (evidence.length) {
  console.log("evidence:");
  for (const line of evidence) console.log(`  ${line}`);
}
if (failed) process.exit(1);
