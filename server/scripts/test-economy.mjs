/**
 * Restoration 15 — Economy, Nova half-units, costs, ledger helpers.
 * Run: npm run test:economy
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-economy-"));
process.env.DB_PATH = path.join(tmpDir, "economy.db");

const { entities } = await import("../src/entities.js");
const {
  toNovaHalfUnits,
  fromNovaHalfUnits,
  formatNovaDisplay,
  creditNova,
  debitNova,
  debitNovaHalfUnits,
  getBalances,
  missionSkipCostHalfUnits,
  missionSkipCostDisplay,
  NOVA_PACKAGES,
  resolveNovaPackage,
  STARTING_NOVA_DISPLAY,
  hasNova,
} = await import("../src/shared/currencyService.js");
const {
  FUEL_PURCHASE_COST,
  FUEL_PURCHASE_AMOUNT,
  FUEL_PURCHASE_MAX,
  SHOP_REFRESH_COST,
  ARENA_PAID_BATTLE_COST,
  DUNGEON_SKIP_COST,
  skipCostFor,
  skipCostHalfUnits,
  StardustPerFuel,
  GearSaleValue,
} = await import("../src/shared/economyFormulas.js");
const { BuyFuel } = await import("../src/functions/economy.js");
const { PurchaseCrystalPack, SkipDungeonCooldown } = await import("../src/functions/economyFollowOn.js");
const { buildCooldownPatch } = await import("../src/shared/dungeonService.js");
const { clock, installFakeClock, resetClockState } = await import("../src/shared/time/clock.js");

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

console.log("\nEconomy tests (Restoration 15)\n");

test("finalized Nova sink costs", () => {
  assert.equal(FUEL_PURCHASE_COST, 20);
  assert.equal(FUEL_PURCHASE_AMOUNT, 20);
  assert.equal(FUEL_PURCHASE_MAX, 10);
  assert.equal(SHOP_REFRESH_COST, 20);
  assert.equal(ARENA_PAID_BATTLE_COST, 15);
  assert.equal(DUNGEON_SKIP_COST, 25);
  assert.equal(STARTING_NOVA_DISPLAY, 25);
});

test("Nova half-unit precision", () => {
  assert.equal(toNovaHalfUnits(20), 40);
  assert.equal(toNovaHalfUnits(0.5), 1);
  assert.equal(toNovaHalfUnits(1.5), 3);
  assert.equal(fromNovaHalfUnits(40), 20);
  assert.equal(formatNovaDisplay(1), "0.5");
  assert.equal(formatNovaDisplay(40), "20");
  assert.throws(() => toNovaHalfUnits(0.25), (e) => e.code === "INVALID_NOVA_PRECISION");
});

test("mission skip Fuel formula reference ranges", () => {
  // 1–5 Fuel → 0.5 Nova; >5–10 → 1; >10–15 → 1.5; >15–20 → 2
  assert.equal(missionSkipCostDisplay(1), 0.5);
  assert.equal(missionSkipCostDisplay(5), 0.5);
  assert.equal(missionSkipCostHalfUnits(5), 1);
  assert.equal(missionSkipCostDisplay(5.1), 1);
  assert.equal(missionSkipCostDisplay(10), 1);
  assert.equal(missionSkipCostDisplay(15), 1.5);
  assert.equal(missionSkipCostDisplay(20), 2);
  const m = { fuel_cost: 8, end_time: new Date(Date.now() + 3600000).toISOString() };
  assert.equal(skipCostFor(m), missionSkipCostDisplay(8));
  assert.equal(skipCostHalfUnits(m), missionSkipCostHalfUnits(8));
  const done = { fuel_cost: 8, end_time: new Date(Date.now() - 1000).toISOString() };
  assert.equal(skipCostFor(done), 0);
});

test("StardustPerFuel shared primitive still authoritative", () => {
  assert.equal(StardustPerFuel(1), Math.round(50 + 1.009 * 0 ** 1.625 * (1 + (1 / 166.66) ** 3.055)));
  let prev = StardustPerFuel(1);
  for (const L of [10, 25, 50, 100, 200, 300, 500, 1000]) {
    const v = StardustPerFuel(L);
    assert.ok(v >= prev, `L${L}`);
    prev = v;
  }
});

test("Nova package catalog grants", () => {
  assert.equal(resolveNovaPackage("pack_2").crystals, 275);
  assert.equal(resolveNovaPackage("pack_5").crystals, 850);
  assert.equal(resolveNovaPackage("pack_10").crystals, 1950);
  assert.equal(resolveNovaPackage("pack_20").crystals, 4500);
  assert.equal(resolveNovaPackage("pack_50").crystals, 12750);
  assert.equal(resolveNovaPackage("pack_100").crystals, 30000);
  assert.equal(resolveNovaPackage("pouch").crystals, 850);
  assert.equal(Object.keys(NOVA_PACKAGES).filter((k) => k.startsWith("pack_")).length, 6);
});

const user = {
  id: "econ-user",
  email: "econ@example.com",
  role: "user",
  active_character_id: "",
};

const ch = entities.Character.create({
  id: "econ-char",
  name: "Banker",
  class: "Vanguard",
  race: "Keldris",
  level: 20,
  experience: 0,
  experience_to_next_level: 100,
  stardust: 10000,
  total_stardust_earned: 10000,
  nova_crystals: 400, // half-units = 200 display
  economy_nova_scale: 2,
  fuel: 10,
  max_fuel: 100,
  fuel_purchases: 0,
  fuel_reset_at: new Date().toISOString(),
  stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
  attribute_purchases: 0,
  attribute_purchases_by_stat: {
    strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
  },
  equipped_items: {},
  created_by_id: user.id,
  created_by: user.email,
  active_buffs: [],
});
user.active_character_id = ch.id;

test("getBalances returns display Nova from half-units", () => {
  const b = getBalances(entities.Character.get(ch.id));
  assert.equal(b.nova_half_units, 400);
  assert.equal(b.nova_crystals, 200);
});

await testAsync("credit/debit create ledger + balances", async () => {
  const before = entities.Character.get(ch.id);
  const credit = creditNova({
    user,
    character: before,
    amount: 10,
    category: "test_credit",
    idempotencyKey: "econ_credit_1",
  });
  assert.equal(credit.balances.nova_crystals, 210);
  assert.equal(credit.transaction.balance_before, 200);
  assert.equal(credit.transaction.balance_after, 210);

  const debit = debitNova({
    user,
    character: entities.Character.get(ch.id),
    amount: 20,
    category: "test_debit",
    idempotencyKey: "econ_debit_1",
  });
  assert.equal(debit.balances.nova_crystals, 190);
  assert.equal(debit.transaction.amount_half_units, 40);

  const replay = debitNova({
    user,
    character: entities.Character.get(ch.id),
    amount: 20,
    category: "test_debit",
    idempotencyKey: "econ_debit_1",
  });
  assert.equal(replay.replay, true);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, 190);
});

await testAsync("BuyFuel costs 20 Nova / grants 20 Fuel / max 10", async () => {
  entities.Character.update(ch.id, {
    nova_crystals: 500, // 250 display
    economy_nova_scale: 2,
    fuel: 10,
    fuel_purchases: 0,
    fuel_reset_at: new Date().toISOString(),
  });
  const res = await BuyFuel(user, { request_id: "fuel_buy_1" });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.nova_debited, 20);
  assert.equal(res.body.nova_half_units_debited, 40);
  assert.equal(res.body.fuel_granted, 20);
  const live = entities.Character.get(ch.id);
  assert.equal(live.fuel, 30);
  assert.equal(live.fuel_purchases, 1);
  assert.equal(getBalances(live).nova_crystals, 230);

  const replay = await BuyFuel(user, { request_id: "fuel_buy_1" });
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).fuel_purchases, 1);

  entities.Character.update(ch.id, { fuel_purchases: 10, fuel: 10, nova_crystals: 500 });
  const capped = await BuyFuel(user, { request_id: "fuel_buy_11" });
  assert.equal(capped.status, 400);
});

await testAsync("SkipDungeonCooldown costs 25 Nova and requires cooldown", async () => {
  installFakeClock(3_000_000_000_000);
  entities.Character.update(ch.id, {
    ...buildCooldownPatch(true, clock.nowMs()),
    nova_crystals: 100,
    economy_nova_scale: 2,
  });
  const res = await SkipDungeonCooldown(user, { request_id: "dskip_1" });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, 25);
  assert.equal(entities.Character.get(ch.id).dungeon_cooldown_until, null);
  const again = await SkipDungeonCooldown(user, { request_id: "dskip_1" });
  assert.equal(again.body.idempotent_replay, true);
  resetClockState();
});

await testAsync("PurchaseCrystalPack grants exact catalog amount once", async () => {
  process.env.CRYSTAL_PACK_DEV_GRANT = "1";
  entities.Character.update(ch.id, { nova_crystals: 0, economy_nova_scale: 2 });
  const res = await PurchaseCrystalPack(user, {
    pack_id: "pack_2",
    receipt_id: "rcpt_pack2_a",
  });
  assert.equal(res.status, 200, res.body?.error);
  assert.equal(res.body.crystals, 275);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, 275);
  const replay = await PurchaseCrystalPack(user, {
    pack_id: "pack_2",
    receipt_id: "rcpt_pack2_a",
  });
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(getBalances(entities.Character.get(ch.id)).nova_crystals, 275);
});

await testAsync("insufficient Nova rejected without mutation", async () => {
  entities.Character.update(ch.id, { nova_crystals: 2, economy_nova_scale: 2 }); // 1 display
  assert.equal(hasNova(entities.Character.get(ch.id), 20), false);
  assert.throws(
    () => debitNovaHalfUnits({
      user,
      character: entities.Character.get(ch.id),
      amountHalfUnits: 40,
      category: "fail",
    }),
    (e) => e.code === "INSUFFICIENT_NOVA",
  );
  assert.equal(entities.Character.get(ch.id).nova_crystals, 2);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
