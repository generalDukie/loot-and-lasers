/**
 * Restoration 06 — Inventory & equipment authority.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-inventory-equipment.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "loot-inv-"));
process.env.DB_PATH = path.join(tempDir, "inv.db");

const { entities, createService } = await import("../src/entities.js");
const {
  EquipItem,
  UnequipItem,
  GetInventory,
  DissolveItem,
} = await import("../src/functions/economy.js");
const {
  EQUIPABLE_TYPES,
  equipItemForCharacter,
  buildInventorySnapshot,
} = await import("../src/shared/inventoryEquipment.js");
const { grantItemOrPending, countBagOccupancy } = await import(
  "../src/shared/inventoryGrant.js"
);
const { getInventoryCap } = await import("../src/shared/economyFormulas.js");
const { sanitizeUpdatePayload, ITEM_ALLOWED_UPDATE_FIELDS } = await import(
  "../src/entityAccess.js"
);
const { applyCharacterRewards } = await import("../src/shared/rewards.js");

console.log("\nInventory & equipment tests\n");

assert.ok(EQUIPABLE_TYPES.includes("weapon"));
assert.ok(EQUIPABLE_TYPES.includes("ship_module"));
assert.ok(!ITEM_ALLOWED_UPDATE_FIELDS.has("is_equipped"));
assert.ok(ITEM_ALLOWED_UPDATE_FIELDS.has("locked"));
console.log("  ✓ slots + client cannot PATCH is_equipped");

const accountA = {
  id: "inv-user-a",
  email: "a@example.com",
  role: "user",
  active_character_id: "",
};
const accountB = {
  id: "inv-user-b",
  email: "b@example.com",
  role: "user",
  active_character_id: "",
};
const accountR = {
  id: "inv-user-r",
  email: "r@example.com",
  role: "user",
  active_character_id: "",
};

function makeChar(account, id, name) {
  const ch = entities.Character.create({
    id,
    name,
    class: "Vanguard",
    race: "Keldris",
    level: 10,
    experience: 0,
    experience_to_next_level: 100,
    stardust: 10_000,
    nova_crystals: 0,
    fuel: 10,
    max_fuel: 20,
    stats: { strength: 20, agility: 10, intellect: 8, vitality: 18, luck: 10 },
    attribute_purchases: 0,
    attribute_purchases_by_stat: {
      strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
    },
    equipped_items: {},
    created_by_id: account.id,
    created_by: account.email,
    active_buffs: [],
  });
  account.active_character_id = ch.id;
  return ch;
}

const chA = makeChar(accountA, "inv-char-a", "Alpha");
const chB = makeChar(accountB, "inv-char-b", "Bravo");
const chR = makeChar(accountR, "inv-char-r", "Reward");

entities.Item.create({
  id: "inv-blade-1",
  name: "Test Blade",
  type: "weapon",
  rarity: "rare",
  level_requirement: 5,
  stats: { strength: 12, luck: 3 },
  character_id: chA.id,
  owner_id: accountA.id,
  is_equipped: false,
  locked: false,
  created_by_id: accountA.id,
});

entities.Item.create({
  id: "inv-helm-1",
  name: "Test Helm",
  type: "helmet",
  rarity: "uncommon",
  stats: { vitality: 5 },
  character_id: chA.id,
  owner_id: accountA.id,
  is_equipped: false,
  created_by_id: accountA.id,
});

entities.Item.create({
  id: "inv-foreign-1",
  name: "Foreign Blade",
  type: "weapon",
  stats: { strength: 9 },
  character_id: chB.id,
  owner_id: accountB.id,
  is_equipped: false,
  created_by_id: accountB.id,
});

{
  const stripped = sanitizeUpdatePayload(accountA, "Item", {
    is_equipped: true,
    locked: true,
    stats: { strength: 999 },
  });
  assert.deepEqual(stripped, { locked: true });
  console.log("  ✓ Item PATCH allowlist strips is_equipped + stats");
}

{
  const stripped = sanitizeUpdatePayload(accountA, "Character", {
    equipped_items: { weapon: "x" },
    name: "StillOk",
  });
  assert.equal(stripped.equipped_items, undefined);
  assert.equal(stripped.name, "StillOk");
  console.log("  ✓ Character PATCH strips equipped_items");
}

{
  const res = await EquipItem(accountA, { item_id: "inv-foreign-1" });
  assert.equal(res.status, 403);
  assert.equal(entities.Item.get("inv-foreign-1").is_equipped, false);
  console.log("  ✓ non-owner cannot equip");
}

{
  const res = await DissolveItem(accountA, { item_id: "inv-foreign-1" });
  assert.equal(res.status, 403);
  assert.ok(entities.Item.get("inv-foreign-1"));
  console.log("  ✓ non-owner cannot dissolve");
}

{
  const res = await EquipItem(accountA, { item_id: "inv-blade-1" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.success, true);
  assert.equal(entities.Item.get("inv-blade-1").is_equipped, true);
  assert.equal(res.body.character.equipped_items.weapon, "inv-blade-1");
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.sheet);
  assert.equal(res.body.sheet.equipment_bonuses.strength, 12);
  console.log("  ✓ owner equip empty slot + sheet");
}

{
  entities.Item.create({
    id: "inv-blade-2",
    name: "Better Blade",
    type: "weapon",
    stats: { strength: 20 },
    character_id: chA.id,
    owner_id: accountA.id,
    is_equipped: false,
    created_by_id: accountA.id,
  });
  const res = await EquipItem(accountA, { item_id: "inv-blade-2" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(entities.Item.get("inv-blade-2").is_equipped, true);
  assert.equal(entities.Item.get("inv-blade-1").is_equipped, false);
  assert.equal(res.body.character.equipped_items.weapon, "inv-blade-2");
  assert.equal(res.body.swapped_from, "inv-blade-1");
  const equippedWeapons = res.body.items.filter(
    (i) => i.type === "weapon" && i.is_equipped,
  );
  assert.equal(equippedWeapons.length, 1);
  console.log("  ✓ equip replacement swap is atomic");
}

{
  const bad = await EquipItem(accountA, { item_id: "missing" });
  assert.equal(bad.status, 404);
  entities.Item.create({
    id: "inv-stim-1",
    name: "Stim",
    type: "consumable",
    character_id: chA.id,
    owner_id: accountA.id,
    is_equipped: false,
    created_by_id: accountA.id,
  });
  const badType = await EquipItem(accountA, { item_id: "inv-stim-1" });
  assert.equal(badType.status, 400);
  console.log("  ✓ invalid item / incompatible type rejected");
}

{
  const again = await EquipItem(accountA, { item_id: "inv-blade-2" });
  assert.equal(again.status, 200);
  assert.equal(again.body.already, true);
  console.log("  ✓ idempotent re-equip");
}

{
  await EquipItem(accountA, { item_id: "inv-helm-1" });
  const u = await UnequipItem(accountA, { item_id: "inv-helm-1" });
  assert.equal(u.status, 200);
  assert.equal(entities.Item.get("inv-helm-1").is_equipped, false);
  assert.equal(u.body.character.equipped_items.helmet, undefined);
  console.log("  ✓ unequip succeeds");
}

{
  const empty = await UnequipItem(accountA, { item_id: "inv-helm-1" });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.already, true);
  console.log("  ✓ unequip already-bag is safe");
}

{
  const snap1 = buildInventorySnapshot(entities.Character.get(chA.id));
  const get = await GetInventory(accountA, {});
  assert.equal(get.status, 200);
  assert.equal(get.body.items.length, snap1.items.length);
  const reloaded = entities.Item.get("inv-blade-2");
  assert.equal(reloaded.is_equipped, true);
  assert.equal(reloaded.stats.strength, 20);
  console.log("  ✓ persistence + GetInventory hydrate");
}

{
  const cap = getInventoryCap(entities.Character.get(chA.id));
  let guard = 0;
  while (countBagOccupancy(entities.Character.get(chA.id)) < cap && guard < 40) {
    guard += 1;
    entities.Item.create({
      name: `Filler ${guard}`,
      type: "accessory",
      stats: {},
      character_id: chA.id,
      owner_id: accountA.id,
      is_equipped: false,
      created_by_id: accountA.id,
    });
  }
  const wornId = "inv-blade-2";
  assert.equal(entities.Item.get(wornId).is_equipped, true);
  const full = await UnequipItem(accountA, { item_id: wornId });
  assert.equal(full.status, 400);
  assert.equal(full.body.code, "INVENTORY_FULL");
  assert.equal(entities.Item.get(wornId).is_equipped, true);
  console.log("  ✓ unequip blocked when inventory full");
}

{
  const grant = grantItemOrPending(entities.Character.get(chA.id), {
    name: "Overflow Gear",
    type: "boots",
    stats: { agility: 1 },
    rarity: "common",
  });
  assert.equal(grant.item, null);
  assert.ok(grant.pending);
  console.log("  ✓ grant overflows to pending payload when full");
}

{
  const game = createService(accountR);
  const applied = await applyCharacterRewards(game, chR.id, {
    item_rarity: "rare",
  });
  assert.equal(applied.items.length, 1);
  assert.equal(applied.items[0].character_id, chR.id);
  assert.equal(applied.items[0].is_equipped, false);
  assert.ok(applied.items[0].id);
  assert.ok(entities.Item.get(applied.items[0].id));
  console.log("  ✓ reward insertion uses owned item create path");
}

{
  const rc = entities.Character.get(chR.id);
  let g = 0;
  while (countBagOccupancy(rc) < getInventoryCap(rc) && g < 30) {
    g += 1;
    entities.Item.create({
      name: `RFill ${g}`,
      type: "legs",
      character_id: rc.id,
      owner_id: accountR.id,
      is_equipped: false,
      created_by_id: accountR.id,
    });
  }
  const game = createService(accountR);
  const applied = await applyCharacterRewards(game, rc.id, { item_rarity: "epic" });
  assert.equal(applied.items.length, 0);
  assert.ok(applied.pending_loot.length >= 1);
  console.log("  ✓ full-bag reward goes to pending_loot");
}

{
  const core = equipItemForCharacter(entities.Character.get(chB.id), "inv-foreign-1");
  assert.equal(core.success, true);
  assert.equal(entities.Item.get("inv-foreign-1").is_equipped, true);
  console.log("  ✓ core equip helper");
}

console.log("\nPASS inventory equipment\n");
try {
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch {
  /* ignore */
}
