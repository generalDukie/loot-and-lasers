/**
 * Authenticated HTTP proof: players never see internal pricing quality;
 * admins may retrieve it; persisted records stay intact.
 * Run: npm run test:pricing-quality-http
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-pq-http-"));
process.env.DB_PATH = path.join(tmpDir, "pricing-quality-http.db");
process.env.NODE_API_LISTEN = "0";
process.env.JWT_SECRET = "pricing-quality-http-secret";

const { db, nowIso } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const { signToken } = await import("../src/auth.js");
const { collectProtectedPricingQualityFields } = await import("../../src/lib/gearPricingQuality.js");
const { GenerateGearItem } = await import("../../src/lib/itemGeneration.js");
const { mulberry32 } = await import("../../src/lib/blackMarket.js");
const { createPendingLoot, getPendingLoot } = await import("../src/rewards/index.js");
const { EnsureShop } = await import("../src/functions/economy.js");
const { app } = await import("../src/index.js");
const {
  shouldRetainInternalPricingQuality,
  sanitizeApiJsonBody,
} = await import("../src/apiResponse.js");

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

function assertPublic(body, label) {
  const leaked = collectProtectedPricingQualityFields(body);
  assert.deepEqual(leaked, [], `${label} leaked ${leaked.join(", ")}`);
}

function hashPw(pw) {
  return createHash("sha256").update(pw).digest("hex");
}

function insertUser(id, email, role) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, email, hashPw("x"), role, now, now);
  return { id, email, role };
}

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function api(pathname, { method = "GET", token = "", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

const player = insertUser("pq-http-player", "pqplayer@example.com", "user");
const stranger = insertUser("pq-http-stranger", "pqstranger@example.com", "user");
const admin = insertUser("pq-http-admin", "pqadmin@example.com", "admin");
const playerToken = signToken(player.id);
const strangerToken = signToken(stranger.id);
const adminToken = signToken(admin.id);

const character = entities.Character.create({
  id: "pq-http-char",
  name: "HttpPilot",
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
  created_by_id: player.id,
  created_by: player.email,
});
db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(character.id, player.id);

const generated = GenerateGearItem({
  itemLevel: 12,
  itemType: "helmet",
  rarity: "rare",
  className: "Vanguard",
  origin: "mission",
  rng: mulberry32(44),
});
const item = entities.Item.create({
  ...generated,
  name: "Http Helm",
  character_id: character.id,
  owner_id: player.id,
  created_by_id: player.id,
  is_equipped: false,
});
assert.ok(item.pricing_quality_score != null);
const originalScore = item.pricing_quality_score;
const originalPaid = item.acquisition_stardust_paid ?? null;

const pendingItem = GenerateGearItem({
  itemLevel: 8,
  itemType: "armor",
  rarity: "uncommon",
  className: "Vanguard",
  origin: "dungeon",
  rng: mulberry32(18),
});
const pending = createPendingLoot({
  accountId: player.id,
  characterId: character.id,
  item: pendingItem,
});

const playerUser = { id: player.id, email: player.email, role: "user", active_character_id: character.id };
await EnsureShop(playerUser);
const liveShop = entities.Character.get(character.id);

console.log("\nPricing quality HTTP boundary\n");

test("isAdmin role is the retain gate; players are stripped", () => {
  assert.equal(shouldRetainInternalPricingQuality({ role: "admin" }), true);
  assert.equal(shouldRetainInternalPricingQuality({ role: "user" }), false);
  assert.equal(shouldRetainInternalPricingQuality(null), false);
  const sample = { pricing_quality_score: 7, stats: { strength: 3 } };
  assert.equal(sanitizeApiJsonBody(sample, { role: "admin" }).pricing_quality_score, 7);
  assert.equal(sanitizeApiJsonBody(sample, { role: "user" }).pricing_quality_score, undefined);
  assert.equal(sample.pricing_quality_score, 7);
});

await testAsync("Player Item list, filter, get, and update omit protected fields", async () => {
  const listed = await api("/api/entities/Item?limit=20", { token: playerToken });
  assert.equal(listed.status, 200, listed.data?.error);
  assertPublic(listed.data, "Item list");
  assert.ok(Array.isArray(listed.data));
  const listedRow = listed.data.find((row) => row.id === item.id);
  assert.ok(listedRow);
  assert.equal(listedRow.rarity, "rare");
  assert.ok(listedRow.stats);

  const filtered = await api("/api/entities/Item/filter", {
    method: "POST",
    token: playerToken,
    body: { query: { character_id: character.id }, limit: 20 },
  });
  assert.equal(filtered.status, 200, filtered.data?.error);
  assertPublic(filtered.data, "Item filter");

  const got = await api(`/api/entities/Item/${item.id}`, { token: playerToken });
  assert.equal(got.status, 200, got.data?.error);
  assertPublic(got.data, "Item get");
  assert.equal(got.data.id, item.id);
  assert.equal(got.data.sell_value != null, true);

  const patched = await api(`/api/entities/Item/${item.id}`, {
    method: "PATCH",
    token: playerToken,
    body: {
      locked: true,
      pricing_quality_score: 1,
      acquisition_stardust_paid: 99,
    },
  });
  assert.equal(patched.status, 400, patched.data?.error);
  assert.equal(patched.data?.code, "ITEM_LOCK_REMOVED");
  const stored = entities.Item.get(item.id);
  assert.equal(stored.pricing_quality_score, originalScore);
  assert.equal(stored.acquisition_stardust_paid ?? null, originalPaid);
  assert.notEqual(stored.locked, true);
});

await testAsync("Player Character GET strips shop metadata quality", async () => {
  const got = await api(`/api/entities/Character/${character.id}`, { token: playerToken });
  assert.equal(got.status, 200, got.data?.error);
  assertPublic(got.data, "Character get");
  assert.ok(got.data.shop_meta);
  const persisted = entities.Character.get(character.id);
  const offer = (persisted.shop_meta.shop_stock || []).find((slot) => slot._offerKind !== "stim");
  assert.ok(offer?.pricing_quality_score != null, "persisted shop stock keeps quality");
});

await testAsync("Player pending-loot REST omits protected fields", async () => {
  const res = await api(`/api/rewards/pending-loot?characterId=${character.id}`, {
    token: playerToken,
  });
  assert.equal(res.status, 200, res.data?.error);
  assertPublic(res.data, "pending-loot REST");
  assert.equal(getPendingLoot(pending.id).item.pricing_quality_score, pendingItem.pricing_quality_score);
});

await testAsync("Player cloud functions, replay, and nested shop errors omit protected fields", async () => {
  const shop = await api("/api/functions/EnsureShop", { method: "POST", token: playerToken, body: {} });
  assert.equal(shop.status, 200, shop.data?.error);
  assertPublic(shop.data, "EnsureShop HTTP");
  const replayShop = await api("/api/functions/EnsureShop", { method: "POST", token: playerToken, body: {} });
  assert.equal(replayShop.status, 200, replayShop.data?.error);
  assertPublic(replayShop.data, "EnsureShop HTTP replay");

  const inv = await api("/api/functions/GetInventory", { method: "POST", token: playerToken, body: {} });
  assert.equal(inv.status, 200, inv.data?.error);
  assertPublic(inv.data, "GetInventory HTTP");

  const mismatch = await api("/api/functions/BuyShopGear", {
    method: "POST",
    token: playerToken,
    body: {
      slot_id: (liveShop.shop_meta.shop_stock || [])[0]?._slotId || "missing",
      refresh_id: Number(liveShop.shop_meta.window_idx || 0) - 1,
      request_id: "pq-http-mismatch",
    },
  });
  assert.ok(mismatch.status >= 400, "expected shop generation error");
  assertPublic(mismatch.data, "BuyShopGear nested error");

  const gear = (entities.Character.get(character.id).shop_meta.shop_stock || [])
    .find((slot) => slot.type !== "consumable" && slot._offerKind !== "stim");
  assert.ok(gear);
  const buy = await api("/api/functions/BuyShopGear", {
    method: "POST",
    token: playerToken,
    body: {
      slot_id: gear._slotId,
      request_id: "pq-http-buy",
      refresh_id: entities.Character.get(character.id).shop_meta.window_idx,
    },
  });
  assert.equal(buy.status, 200, buy.data?.error);
  assertPublic(buy.data, "BuyShopGear HTTP");
  const replayBuy = await api("/api/functions/BuyShopGear", {
    method: "POST",
    token: playerToken,
    body: {
      slot_id: gear._slotId,
      request_id: "pq-http-buy",
      refresh_id: entities.Character.get(character.id).shop_meta.window_idx,
    },
  });
  assert.equal(replayBuy.data?.idempotent_replay, true);
  assertPublic(replayBuy.data, "BuyShopGear HTTP replay");
});

await testAsync("Unauthorized players cannot inspect and do not receive quality", async () => {
  const inspect = await api("/api/functions/InspectCharacter", {
    method: "POST",
    token: playerToken,
    body: { character_id: character.id },
  });
  assert.equal(inspect.status, 403);
  assertPublic(inspect.data, "player InspectCharacter");

  const foreign = await api(`/api/entities/Item/${item.id}`, { token: strangerToken });
  assert.equal(foreign.status, 403);
  assertPublic(foreign.data, "stranger Item get");
});

await testAsync("Authorized admin inspection retrieves protected fields; persist unchanged", async () => {
  const adminItem = await api(`/api/entities/Item/${item.id}`, { token: adminToken });
  assert.equal(adminItem.status, 200, adminItem.data?.error);
  assert.equal(adminItem.data.pricing_quality_score, originalScore);
  assert.ok(Object.prototype.hasOwnProperty.call(adminItem.data, "pricing_quality_raw"));

  const adminChar = await api(`/api/entities/Character/${character.id}`, { token: adminToken });
  assert.equal(adminChar.status, 200, adminChar.data?.error);
  const adminOffer = (adminChar.data.shop_meta?.shop_stock || [])
    .find((slot) => slot._offerKind !== "stim" && slot.type !== "consumable");
  assert.ok(adminOffer?.pricing_quality_score != null, "admin Character shop_meta keeps quality");

  const inspect = await api("/api/functions/InspectCharacter", {
    method: "POST",
    token: adminToken,
    body: { character_id: character.id },
  });
  assert.equal(inspect.status, 200, inspect.data?.error);
  const bag = inspect.data.inventory?.bag || inspect.data.inventory?.equipped || [];
  const inspected = [...(inspect.data.inventory?.bag || []), ...(inspect.data.inventory?.equipped || [])]
    .find((row) => row.id === item.id);
  assert.ok(inspected, "inspect inventory includes item");
  assert.equal(inspected.pricing_quality_score, originalScore);
  void bag;

  const stored = entities.Item.get(item.id);
  assert.equal(stored.pricing_quality_score, originalScore);
});

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
