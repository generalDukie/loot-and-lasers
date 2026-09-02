/**
 * Public-response sanitizer + same-window shop stock proof for pricing quality.
 * Run: npm run test:pricing-quality-public
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-pq-public-"));
process.env.DB_PATH = path.join(tmpDir, "pricing-quality-public.db");

const { entities } = await import("../src/entities.js");
const { FUNCTION_HANDLERS } = await import("../src/functions/index.js");
const { EnsureShop } = await import("../src/functions/economy.js");
const { createPendingLoot, getPendingLoot } = await import("../src/rewards/index.js");
const {
  collectProtectedPricingQualityFields,
  gearQualityListPriceForItem,
  sanitizePublicResponseBody,
} = await import("../../src/lib/gearPricingQuality.js");
const { GenerateGearItem } = await import("../../src/lib/itemGeneration.js");
const { mulberry32, BLACK_MARKET_RULES_VERSION } = await import("../../src/lib/blackMarket.js");
const { normalizeFunctionBody, sanitizeApiJsonBody } = await import("../src/apiResponse.js");

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

function assertPublicBody(body, label) {
  const leaked = collectProtectedPricingQualityFields(body);
  assert.deepEqual(leaked, [], `${label} leaked ${leaked.join(", ")}`);
}

function offerFingerprint(slot) {
  return {
    slotId: slot._slotId || slot.shop_item_id || slot.id,
    instance_id: slot.instance_id || null,
    name: slot.name,
    type: slot.type,
    rarity: slot.rarity,
    stats: slot.stats || {},
    cost: slot.cost,
    nova_cost: slot.nova_cost,
    sell_value: slot.sell_value,
    generation_id: slot.generation_id || null,
    haggle_attempted: !!slot.haggle_attempted,
    haggle_success: !!slot.haggle_success,
    haggle_discount_pct: Math.max(0, Math.round(Number(slot.haggle_discount_pct) || 0)),
    yanked: !!slot.yanked,
  };
}

function shopFingerprint(meta) {
  const stock = Array.isArray(meta?.shop_stock) ? meta.shop_stock : [];
  const hot = meta?.hot_deal || meta?.contraband_offer || null;
  return {
    window_idx: meta?.window_idx,
    free_refresh_used: !!meta?.free_refresh_used,
    market_generation_seq: meta?.market_generation_seq || 0,
    paid_refresh_count: meta?.paid_refresh_count || 0,
    purchased: { ...(meta?.purchased || {}) },
    yanked: { ...(meta?.yanked || {}) },
    hot_purchased: !!meta?.hot_purchased,
    hot_yanked: !!meta?.hot_yanked,
    offers: stock.map(offerFingerprint),
    hot: hot ? offerFingerprint(hot) : null,
  };
}

function firstGearOffer(meta) {
  const stock = Array.isArray(meta?.shop_stock) ? meta.shop_stock : [];
  return stock.find((slot) => slot.type !== "consumable" && slot._offerKind !== "stim");
}

const user = {
  id: "pq-public-user",
  email: "pqpublic@example.com",
  role: "user",
  active_character_id: "",
};

const ch = entities.Character.create({
  id: "pq-public-char",
  name: "Public",
  class: "Vanguard",
  race: "Keldris",
  level: 20,
  experience: 0,
  experience_to_next_level: 100000,
  stardust: 5_000_000,
  nova_crystals: 10_000,
  fuel: 100,
  max_fuel: 100,
  stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
  attribute_purchases_by_stat: {
    strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
  },
  equipped_items: {},
  shop_meta: {},
  created_by_id: user.id,
  created_by: user.email,
});
user.active_character_id = ch.id;

console.log("\nPricing quality public responses\n");

test("API JSON boundary strips players and retains admin inspection copies", () => {
  const raw = {
    shop_meta: { shop_stock: [{ pricing_quality_score: 3, cost: 9 }] },
    items: [{ acquisition_stardust_paid: 9, rarity: "rare" }],
  };
  const normalized = normalizeFunctionBody(raw, 200);
  assert.equal(normalized.success, true);
  assert.equal(normalized.shop_meta.shop_stock[0].pricing_quality_score, 3);
  const playerBody = sanitizeApiJsonBody(normalized, { role: "user" });
  assert.equal(playerBody.shop_meta.shop_stock[0].cost, 9);
  assert.equal(playerBody.items[0].rarity, "rare");
  assertPublicBody(playerBody, "player sanitizeApiJsonBody");
  const adminBody = sanitizeApiJsonBody(normalized, { role: "admin" });
  assert.equal(adminBody.shop_meta.shop_stock[0].pricing_quality_score, 3);
  assert.equal(adminBody.items[0].acquisition_stardust_paid, 9);
});

test("Mission / dungeon / tutorial-shaped payloads are stripped without mutating source", () => {
  const source = {
    rewards: {
      items: [{
        name: "Drop",
        stats: { strength: 8 },
        rarity: "uncommon",
        sell_value: 12,
        pricing_quality_raw: 0.4,
        pricing_quality_score: 22,
      }],
    },
    pending_loot: [{
      item: {
        pricing_quality_class: "Vanguard",
        acquisition_stardust_paid: 4,
        type: "helmet",
      },
    }],
    settlement: {
      granted: [{ pricing_quality_multiplier_bps: 8800, nova_cost: 0 }],
    },
    character: {
      shop_meta: { shop_stock: [{ pricing_quality_fallback: "x" }] },
    },
  };
  const copy = sanitizePublicResponseBody(source);
  assertPublicBody(copy, "pve fixture");
  assert.equal(copy.rewards.items[0].rarity, "uncommon");
  assert.equal(copy.rewards.items[0].sell_value, 12);
  assert.equal(source.rewards.items[0].pricing_quality_score, 22);
});

await testAsync("EnsureShop in the same window preserves stock exactly", async () => {
  const first = await FUNCTION_HANDLERS.EnsureShop(user, {});
  assert.equal(first.status, 200, first.body?.error);
  assertPublicBody(first.body, "EnsureShop first");
  const persistedFirst = shopFingerprint(entities.Character.get(ch.id).shop_meta);
  assert.ok(persistedFirst.offers.length > 0, "seeded stock");
  const internal = await EnsureShop(user);
  assert.ok(
    firstGearOffer(internal.body.shop_meta)?.pricing_quality_score != null,
    "persisted/internal EnsureShop keeps quality fields",
  );

  const second = await FUNCTION_HANDLERS.EnsureShop(user, {});
  assert.equal(second.status, 200, second.body?.error);
  assertPublicBody(second.body, "EnsureShop second");
  const persistedSecond = shopFingerprint(entities.Character.get(ch.id).shop_meta);
  assert.deepEqual(persistedSecond, persistedFirst, "authoritative stock unchanged");
  assert.deepEqual(
    shopFingerprint(second.body.shop_meta),
    shopFingerprint(first.body.shop_meta),
    "public shop_meta fingerprint unchanged",
  );
});

await testAsync("Haggle, purchase, and replay public bodies stay sanitized", async () => {
  const live = entities.Character.get(ch.id);
  const gear = firstGearOffer(live.shop_meta);
  assert.ok(gear, "gear offer");
  const origRandom = Math.random;
  Math.random = () => 0;
  let haggle;
  try {
    haggle = await FUNCTION_HANDLERS.BuyShopGear(user, {
      slot_id: gear._slotId,
      haggle: true,
      request_id: "pq-public-haggle",
      refresh_id: live.shop_meta.window_idx,
    });
  } finally {
    Math.random = origRandom;
  }
  assert.ok(haggle.status === 200 || haggle.status === 400, haggle.body?.error);
  assertPublicBody(haggle.body, "haggle");

  const afterHaggle = entities.Character.get(ch.id);
  const buySlot = firstGearOffer(afterHaggle.shop_meta);
  assert.ok(buySlot, "gear remaining after haggle");
  const buy = await FUNCTION_HANDLERS.BuyShopGear(user, {
    slot_id: buySlot._slotId,
    request_id: "pq-public-buy",
    refresh_id: afterHaggle.shop_meta.window_idx,
  });
  assert.equal(buy.status, 200, buy.body?.error);
  assertPublicBody(buy.body, "purchase");
  assert.ok((buy.body.items || []).length >= 1 || (buy.body.pending_loot || []).length >= 1);
  if (buy.body.items?.[0]) {
    assert.ok(buy.body.items[0].stats);
    assert.ok(buy.body.items[0].rarity);
    assert.equal(buy.body.items[0].pricing_quality_score, undefined);
  }
  const grantedId = buy.body.items?.[0]?.id;
  if (grantedId) {
    const stored = entities.Item.get(grantedId);
    assert.ok(stored.pricing_quality_score != null, "persisted grant keeps quality");
    assert.ok(stored.acquisition_stardust_paid > 0, "persisted grant keeps paid Stardust");
  }

  const replay = await FUNCTION_HANDLERS.BuyShopGear(user, {
    slot_id: buySlot._slotId,
    request_id: "pq-public-buy",
    refresh_id: afterHaggle.shop_meta.window_idx,
  });
  assert.equal(replay.status, 200, replay.body?.error);
  assert.equal(replay.body.idempotent_replay, true);
  assertPublicBody(replay.body, "purchase replay");
});

await testAsync("Genuine refresh generates quality-priced stock; GetInventory stays public", async () => {
  const before = entities.Character.get(ch.id);
  const beforeIds = (before.shop_meta.shop_stock || []).map((slot) => slot._slotId).join(",");
  const refresh = await FUNCTION_HANDLERS.RefreshShop(user, {
    which: "all",
    use_free: true,
    request_id: "pq-public-refresh",
  });
  assert.equal(refresh.status, 200, refresh.body?.error);
  assertPublicBody(refresh.body, "refresh");
  const after = entities.Character.get(ch.id);
  const afterIds = (after.shop_meta.shop_stock || []).map((slot) => slot._slotId).join(",");
  assert.notEqual(afterIds, beforeIds, "refresh replaced stock");
  const gear = (after.shop_meta.shop_stock || []).filter((slot) => slot._offerKind !== "stim" && slot.type !== "consumable");
  assert.ok(gear.length);
  for (const offer of gear) {
    assert.equal(offer.rules_version, BLACK_MARKET_RULES_VERSION);
    assert.equal(offer.cost, gearQualityListPriceForItem(offer));
    assert.ok(offer.pricing_quality_score != null, "persisted refresh stock keeps quality");
  }
  const replayRefresh = await FUNCTION_HANDLERS.RefreshShop(user, {
    which: "all",
    use_free: true,
    request_id: "pq-public-refresh",
  });
  assert.equal(replayRefresh.body.idempotent_replay, true);
  assertPublicBody(replayRefresh.body, "refresh replay");

  const inv = await FUNCTION_HANDLERS.GetInventory(user, {});
  assert.equal(inv.status, 200, inv.body?.error);
  assertPublicBody(inv.body, "GetInventory");
});

await testAsync("Pending loot accept, dissolve, and replay stay sanitized", async () => {
  const acceptItem = GenerateGearItem({
    itemLevel: 8,
    itemType: "helmet",
    rarity: "common",
    className: "Vanguard",
    origin: "mission",
    rng: mulberry32(19),
  });
  const acceptPl = createPendingLoot({
    accountId: user.id,
    characterId: ch.id,
    item: acceptItem,
  });
  assert.ok(getPendingLoot(acceptPl.id).item.pricing_quality_score != null);
  const accept = await FUNCTION_HANDLERS.AcceptPendingLoot(user, {
    pending_loot_id: acceptPl.id,
  });
  assert.equal(accept.status, 200, accept.body?.error);
  assertPublicBody(accept.body, "AcceptPendingLoot");
  if (accept.body.item?.id) {
    const stored = entities.Item.get(accept.body.item.id);
    assert.ok(stored.pricing_quality_score != null);
  }
  const acceptReplay = await FUNCTION_HANDLERS.AcceptPendingLoot(user, {
    pending_loot_id: acceptPl.id,
  });
  assert.equal(acceptReplay.body.idempotentReplay, true);
  assertPublicBody(acceptReplay.body, "AcceptPendingLoot replay");

  const dissolveItem = GenerateGearItem({
    itemLevel: 9,
    itemType: "armor",
    rarity: "uncommon",
    className: "Vanguard",
    origin: "dungeon",
    rng: mulberry32(21),
  });
  const dissolvePl = createPendingLoot({
    accountId: user.id,
    characterId: ch.id,
    item: dissolveItem,
  });
  const dissolved = await FUNCTION_HANDLERS.DissolvePendingLoot(user, {
    pending_loot_id: dissolvePl.id,
  });
  assert.equal(dissolved.status, 200, dissolved.body?.error);
  assertPublicBody(dissolved.body, "DissolvePendingLoot");
  const dissolveReplay = await FUNCTION_HANDLERS.DissolvePendingLoot(user, {
    pending_loot_id: dissolvePl.id,
  });
  assert.equal(dissolveReplay.body.idempotentReplay, true);
  assertPublicBody(dissolveReplay.body, "DissolvePendingLoot replay");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
