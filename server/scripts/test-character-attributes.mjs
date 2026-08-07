/**
 * Restoration 05 — Core attributes & derived statistics.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-character-attributes.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "loot-attr-"));
process.env.DB_PATH = path.join(tempDir, "attr.db");

const libStat = await import("../../src/lib/statEngine.js");
const sharedStat = await import("../src/shared/statEngine.js");
const libEpa = await import("../../src/lib/expectedPlayerAttributes.js");
const sharedEpa = await import("../src/shared/expectedPlayerAttributes.js");
const {
  buildAttributeSheet,
  readPermanentAttributes,
  equipmentAttributeBonuses,
  emptyAttrMap,
} = await import("../src/shared/characterAttributes.js");
const { entities } = await import("../src/entities.js");
const { GetCharacterAttributes, BuyAttribute } = await import(
  "../src/functions/economy.js"
);

console.log("\nCharacter attributes / derived stats tests\n");

assert.deepEqual(
  Object.keys(sharedStat).sort(),
  Object.keys(libStat).sort(),
  "statEngine exports match",
);
assert.equal(sharedStat.CRIT_CAP, libStat.CRIT_CAP);
assert.equal(sharedStat.getMaxHP(100), libStat.getMaxHP(100));
assert.equal(
  sharedStat.getBaseDamageFromPrimary(200),
  libStat.getBaseDamageFromPrimary(200),
);
console.log("  ✓ statEngine re-export parity");

assert.deepEqual(
  Object.keys(sharedEpa).sort(),
  Object.keys(libEpa).sort(),
  "expectedPlayerAttributes exports match",
);
assert.equal(sharedEpa.expectedPlayerAttributes(50), libEpa.expectedPlayerAttributes(50));
assert.equal(
  sharedEpa.dungeonEnemyAttributeBudget(40, false),
  libEpa.dungeonEnemyAttributeBudget(40, false),
);
assert.equal(
  sharedEpa.dungeonEnemyAttributeBudget(40, true),
  libEpa.dungeonEnemyAttributeBudget(40, true),
);
assert.equal(
  sharedEpa.missionEnemyAttributeBudget(25),
  libEpa.missionEnemyAttributeBudget(25),
);
console.log("  ✓ expectedPlayerAttributes re-export parity");

const { repairPermanentAttributes } = await import("../../src/lib/characterStats.js");
const { ensureCharacterPermanentStats } = await import("../src/shared/characterStatsRepair.js");

{
  const empty = {
    id: "c-empty",
    class: "Shadow Operative",
    level: 1,
    stats: {},
  };
  const fixed = repairPermanentAttributes(empty);
  assert.equal(fixed.repaired, true);
  assert.equal(fixed.stats.agility, 15);
  assert.equal(
    fixed.stats.strength + fixed.stats.agility + fixed.stats.intellect
      + fixed.stats.vitality + fixed.stats.luck,
    50,
  );
  const leveled = repairPermanentAttributes({
    class: "Vanguard",
    level: 2,
    stats: { strength: 1, intellect: 1 },
  });
  assert.equal(leveled.repaired, true);
  assert.equal(leveled.stats.strength, 16);
  assert.equal(leveled.stats.intellect, 7);
  console.log("  ✓ class base stat repair");
}

{
  const character = {
    id: "c-new",
    class: "Vanguard",
    race: "Zyrathi",
    level: 1,
    stats: { strength: 15, agility: 8, intellect: 6, vitality: 14, luck: 7 },
    attribute_purchases_by_stat: {
      strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
    },
    active_buffs: [],
  };
  const sheet = buildAttributeSheet(character, []);
  assert.deepEqual(sheet.permanent_attributes, character.stats);
  assert.deepEqual(sheet.equipment_bonuses, emptyAttrMap());
  const libPerm = libStat.computePermanentTotalStats(character, []);
  const libEff = libStat.computeTotalStats(character, []);
  const libDer = libStat.computeDerivedStats(libPerm, character);
  assert.deepEqual(sheet.permanent_totals, libPerm);
  assert.deepEqual(sheet.effective_attributes, libEff);
  assert.equal(sheet.derived.health, libDer.health);
  assert.equal(sheet.derived.damage, libDer.damage);
  assert.equal(sheet.derived_permanent.health, libDer.health);
  console.log("  ✓ new character sheet");
}

{
  const character = {
    id: "c-hi",
    class: "Technomancer",
    race: null,
    level: 80,
    stats: { strength: 40, agility: 50, intellect: 400, vitality: 200, luck: 120 },
    attribute_purchases_by_stat: {
      strength: 10, agility: 10, intellect: 200, vitality: 80, luck: 50,
    },
    active_buffs: [
      {
        stat: "intellect",
        mult: 0.2,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
    ],
  };
  const gear = [
    { id: "g1", stats: { intellect: 30, vitality: 10 }, is_equipped: true },
    { id: "g2", stats: { luck: 15, intellect: 20 }, is_equipped: true },
  ];
  const sheet = buildAttributeSheet(character, gear);
  assert.deepEqual(sheet.equipment_bonuses, equipmentAttributeBonuses(gear));
  assert.equal(sheet.equipment_bonuses.intellect, 50);
  const libPerm = libStat.computePermanentTotalStats(character, gear);
  const libEff = libStat.computeTotalStats(character, gear);
  assert.deepEqual(sheet.permanent_totals, libPerm);
  assert.deepEqual(sheet.effective_attributes, libEff);
  assert.ok(sheet.stim_bonuses.intellect > 0);
  assert.equal(
    sheet.effective_attributes.intellect,
    sheet.permanent_totals.intellect + sheet.stim_bonuses.intellect,
  );
  const derEff = libStat.computeDerivedStats(libEff, character);
  assert.equal(sheet.derived.health, derEff.health);
  assert.equal(sheet.derived.damage, derEff.damage);
  assert.equal(sheet.derived.critChance, derEff.critChance);
  assert.equal(sheet.derived.dodgeChance, derEff.dodgeChance);
  assert.equal(sheet.derived.armor, derEff.armor);
  assert.equal(sheet.derived.techResist, derEff.techResist);
  console.log("  ✓ equipment + stim high-level sheet");
}

{
  const character = {
    id: "c-persist",
    class: "Void Runner",
    level: 10,
    stats: { strength: 10, agility: 40, intellect: 10, vitality: 25, luck: 20 },
    damage: 99999,
    maxHp: 99999,
    critChance: 99,
  };
  const sheet = buildAttributeSheet(character, []);
  const expected = libStat.computeDerivedStats(
    libStat.computePermanentTotalStats(character, []),
    character,
  );
  assert.equal(sheet.derived.damage, expected.damage);
  assert.notEqual(sheet.derived.damage, 99999);
  assert.equal(readPermanentAttributes(character).agility, 40);
  console.log("  ✓ ignores client-supplied derived fields");
}

{
  const res = await GetCharacterAttributes(null, {});
  assert.equal(res.status, 401);
  console.log("  ✓ GetCharacterAttributes rejects unauthenticated");
}

{
  const account = {
    id: "attr-user-1",
    email: "attr@example.com",
    role: "user",
    active_character_id: "",
  };
  const ch = entities.Character.create({
    id: "attr-char-1",
    name: "AttrTest",
    class: "Vanguard",
    race: "Keldris",
    level: 5,
    experience: 0,
    experience_to_next_level: 100,
    stardust: 50_000,
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

  entities.Item.create({
    id: "attr-item-1",
    name: "Test Blade",
    type: "weapon",
    character_id: ch.id,
    owner_id: account.id,
    is_equipped: true,
    stats: { strength: 12, luck: 3 },
    created_by_id: account.id,
  });

  const getRes = await GetCharacterAttributes(account, {});
  assert.equal(getRes.status, 200, JSON.stringify(getRes.body));
  assert.equal(getRes.body.success, true);
  assert.equal(getRes.body.sheet.equipment_bonuses.strength, 12);
  assert.equal(
    getRes.body.sheet.permanent_totals.strength,
    libStat.computePermanentTotalStats(
      getRes.body.character,
      getRes.body.equipped_items,
    ).strength,
  );

  const beforeVit = ch.stats.vitality;
  const buy = await BuyAttribute(account, { stat: "vitality" });
  assert.equal(buy.status, 200, JSON.stringify(buy.body));
  assert.ok(buy.body.sheet);
  assert.equal(buy.body.character.stats.vitality, beforeVit + 1);
  assert.equal(
    buy.body.sheet.permanent_attributes.vitality,
    buy.body.character.stats.vitality,
  );
  console.log("  ✓ GetCharacterAttributes + BuyAttribute sheet round-trip");
}

{
  const account = {
    id: "attr-user-empty",
    email: "empty@example.com",
    role: "user",
    active_character_id: "",
  };
  const broken = entities.Character.create({
    id: "attr-char-empty",
    name: "EmptyStats",
    class: "Technomancer",
    race: "Luminae",
    level: 1,
    experience: 0,
    experience_to_next_level: 100,
    stardust: 0,
    nova_crystals: 0,
    fuel: 20,
    max_fuel: 20,
    stats: {},
    attribute_purchases: 0,
    attribute_purchases_by_stat: {
      strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
    },
    equipped_items: {},
    created_by_id: account.id,
    created_by: account.email,
    active_buffs: [],
  });
  account.active_character_id = broken.id;

  const getRes = await GetCharacterAttributes(account, {});
  assert.equal(getRes.status, 200, JSON.stringify(getRes.body));
  assert.equal(getRes.body.stats_repaired, true);
  assert.equal(getRes.body.sheet.permanent_attributes.intellect, 15);
  const reloaded = entities.Character.get(broken.id);
  assert.equal(reloaded.stats.intellect, 15);
  console.log("  ✓ GetCharacterAttributes repairs missing class base stats");
}

console.log("\nPASS character attributes\n");
try {
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch {
  /* ignore */
}
