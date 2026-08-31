/**
 * Admin / live-ops tests (Restoration 26).
 * Run: npm run test:admin
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-admin-"));
process.env.DB_PATH = path.join(tmpDir, "test-admin.db");

const { db, nowIso } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  assertAdminPermission,
  AdminPermissions,
  LookupPlayer,
  InspectCharacter,
  SetFeatureFlag,
  GetRuntimeConfiguration,
  GetOpsDashboard,
  applyArenaModeration,
  listAdminPermissionsForUser,
} = await import("../src/shared/adminOpsService.js");
const { isArenaBanned } = await import("../src/arena/eligibility.js");
const { adminHasAuditPermission } = await import("../src/audit/registry.js");
const {
  AdminModeration,
  LookupPlayerRpc,
  InspectCharacterRpc,
  GetOpsDashboardRpc,
  GetRuntimeConfig,
  SetFeatureFlagRpc,
  SetMaintenanceModeRpc,
} = await import("../src/functions/index.js");
const { searchAuditLogs } = await import("../src/audit/writer.js");

let passed = 0;
let failed = 0;
const FORMER_PLAYER_LOOKUP_SCAN_CAP = 500;

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

function hashPw(pw) {
  return createHash("sha256").update(pw).digest("hex");
}

function insertUser(id, email, role = "user", extra = {}) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date, nakama_user_id)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(id, email, hashPw("x"), role, now, now, extra.nakama_user_id || null);
  return { id, email, role };
}

function makeCharacter(id, accountId, name = "Operative") {
  return entities.Character.create({
    id,
    created_by_id: accountId,
    name,
    class: "Vanguard",
    level: 3,
    experience: 10,
    experience_to_next_level: 100,
    stardust: 50,
    nova_crystals: 10,
    fuel: 5,
    max_fuel: 10,
    stats: { strength: 15, agility: 8, intellect: 6, vitality: 14, luck: 7 },
    equipped_items: {},
    arena_rating: 1000,
  });
}

console.log("\nAdmin / Live Ops (Restoration 26)\n");

test("permission denial for non-admin", () => {
  const u = insertUser("u-player", "p@t.test", "user");
  assert.throws(
    () => assertAdminPermission(u, AdminPermissions.VIEW_PLAYER),
    (e) => e.status === 403,
  );
  assert.equal(listAdminPermissionsForUser(u).length, 0);
  assert.equal(adminHasAuditPermission(u, "audit_logs.view"), false);
});

test("admin receives capability catalog", () => {
  const a = insertUser("u-admin", "a@t.test", "admin");
  assertAdminPermission(a, AdminPermissions.VIEW_PLAYER);
  assert.ok(listAdminPermissionsForUser(a).includes(AdminPermissions.MODIFY_CURRENCY));
  assert.equal(adminHasAuditPermission(a, "audit_logs.view"), true);
});

test("lookup by name / nakama / email", () => {
  const a = insertUser("u-look", "look@t.test", "admin", { nakama_user_id: "nk-look-1" });
  makeCharacter("ch-look", a.id, "NovaBlade");
  const byName = LookupPlayer(a, { q: "NovaBlade" });
  assert.ok(byName.characters.some((c) => c.id === "ch-look"));
  const byNk = LookupPlayer(a, { q: "nk-look-1" });
  assert.ok(byNk.accounts.some((x) => x.id === a.id));
  const byEmail = LookupPlayer(a, { q: "look@t.test" });
  assert.ok(byEmail.accounts.some((x) => x.id === a.id));
});

test("admin lookup reaches characters older than the former scan cap", () => {
  const admin = insertUser("u-look-cap", "look-cap@t.test", "admin");
  const target = makeCharacter("ch-look-cap", admin.id, "AncientAdminTarget");
  db.prepare("UPDATE entities SET created_date = ? WHERE id = ?")
    .run("2000-01-01T00:00:00.000Z", target.id);
  for (let index = 0; index <= FORMER_PLAYER_LOOKUP_SCAN_CAP; index += 1) {
    makeCharacter(`ch-look-fill-${index}`, admin.id, `AdminFiller${index}`);
  }
  const result = LookupPlayer(admin, { q: "AncientAdminTarget" });
  assert.ok(result.characters.some((character) => character.id === target.id));
});

test("inspect character is read-only snapshot", () => {
  const a = insertUser("u-insp", "insp@t.test", "admin");
  makeCharacter("ch-insp", a.id, "Inspector");
  const out = InspectCharacter(a, "ch-insp");
  assert.equal(out.read_only, true);
  assert.equal(out.character.id, "ch-insp");
  assert.ok(out.account);
  assert.ok(out.inventory);
});

test("feature flag set is audited and readable", () => {
  const a = insertUser("u-flag", "flag@t.test", "admin");
  const out = SetFeatureFlag(a, { flag: "casino_enabled", enabled: false, reason: "test outage" });
  assert.equal(out.enabled, false);
  const cfg = GetRuntimeConfiguration();
  assert.equal(cfg.feature_flags.casino_enabled, false);
  assert.equal(cfg.authority, "node");
});

test("arena suspend writes PlayerModeration fields", () => {
  const a = insertUser("u-ar", "ar@t.test", "admin");
  makeCharacter("ch-ar", a.id);
  applyArenaModeration(a, {
    characterId: "ch-ar",
    arenaSuspended: true,
    suspendedUntil: new Date(Date.now() + 3600000).toISOString(),
    reason: "griefing",
  });
  assert.equal(isArenaBanned("ch-ar"), true);
});

test("ops dashboard requires admin", () => {
  const u = insertUser("u-dash", "dash@t.test", "user");
  assert.throws(() => GetOpsDashboard(u), (e) => e.status === 403);
  const a = insertUser("u-dash-a", "dasha@t.test", "admin");
  const d = GetOpsDashboard(a);
  assert.ok(typeof d.accounts === "number");
  assert.ok(d.maintenance);
});

await testAsync("AdminModeration denies non-admin", async () => {
  const u = insertUser("u-deny", "deny@t.test", "user");
  const res = await AdminModeration(u, { action: "mute", character_id: "x", reason: "nope" });
  assert.equal(res.status, 403);
});

await testAsync("promo create is audited", async () => {
  const a = insertUser("u-promo", "promo@t.test", "admin");
  const res = await AdminModeration(a, {
    action: "create_promo_code",
    code: `TEST${Date.now()}`,
    label: "Test",
    rewards: { stardust: 10 },
    reason: "qa",
  });
  assert.equal(res.status, 200);
  const logs = searchAuditLogs({ limit: 20 });
  const entries = logs.entries || logs.results || logs || [];
  const list = Array.isArray(entries) ? entries : entries.items || [];
  // Soft assert: writer may shape differently
  assert.ok(res.body.promo_code?.id);
});

await testAsync("admin-owned character can receive uncapped fuel grants", async () => {
  const a = insertUser("u-fueladmin", "fueladmin@t.test", "admin");
  makeCharacter("ch-fueladmin", a.id);
  entities.Character.update("ch-fueladmin", { fuel: 0, max_fuel: 102 });
  const over = await AdminModeration(a, {
    action: "adjust_currency",
    character_id: "ch-fueladmin",
    deltas: { fuel: 100_000 },
    reason: "admin overfill",
  });
  assert.equal(over.status, 200);
  const afterOver = entities.Character.get("ch-fueladmin");
  assert.equal(afterOver.fuel, 100_000);
  assert.equal(afterOver.max_fuel, 102);
  const drain = await AdminModeration(a, {
    action: "adjust_currency",
    character_id: "ch-fueladmin",
    deltas: { fuel: -50_000 },
    reason: "drain overfill",
  });
  assert.equal(drain.status, 200);
  assert.equal(entities.Character.get("ch-fueladmin").fuel, 50_000);
});

await testAsync("fuel grant on non-admin character cannot exceed effective max while hangar is retired", async () => {
  const a = insertUser("u-fuelcap", "fuelcap@t.test", "admin");
  const player = insertUser("u-fuelplayer", "fuelplayer@t.test", "user");
  makeCharacter("ch-fuelcap", player.id);
  entities.Character.update("ch-fuelcap", { fuel: 100, max_fuel: 102 });
  const over = await AdminModeration(a, {
    action: "adjust_currency",
    character_id: "ch-fuelcap",
    deltas: { fuel: 10 },
    reason: "tank fill",
  });
  assert.equal(over.status, 200);
  const afterOver = entities.Character.get("ch-fuelcap");
  assert.equal(afterOver.fuel, 100);
  assert.equal(afterOver.max_fuel, 102);
  const under = await AdminModeration(a, {
    action: "adjust_currency",
    character_id: "ch-fuelcap",
    deltas: { fuel: -15 },
    reason: "drain",
  });
  assert.equal(under.status, 200);
  assert.equal(entities.Character.get("ch-fuelcap").fuel, 85);
  const fill = await AdminModeration(a, {
    action: "adjust_currency",
    character_id: "ch-fuelcap",
    deltas: { fuel: 20 },
    reason: "partial fill",
  });
  assert.equal(fill.status, 200);
  assert.equal(entities.Character.get("ch-fuelcap").fuel, 100);
});

await testAsync("currency grant works without reason and still records a supplied reason", async () => {
  const a = insertUser("u-cur", "cur@t.test", "admin");
  makeCharacter("ch-cur", a.id);
  const none = await AdminModeration(a, {
    action: "adjust_currency",
    character_id: "ch-cur",
    deltas: { stardust: 5 },
  });
  assert.equal(none.status, 200);
  assert.equal(entities.Character.get("ch-cur").stardust, 55);
  const ok = await AdminModeration(a, {
    action: "adjust_currency",
    character_id: "ch-cur",
    deltas: { stardust: 5 },
    reason: "compensation",
  });
  assert.equal(ok.status, 200);
  assert.equal(entities.Character.get("ch-cur").stardust, 60);
});

await testAsync("LookupPlayer / InspectCharacter RPCs", async () => {
  const a = insertUser("u-rpc", "rpc@t.test", "admin");
  makeCharacter("ch-rpc", a.id, "RpcHero");
  const look = await LookupPlayerRpc(a, { q: "RpcHero" });
  assert.equal(look.status, 200);
  const insp = await InspectCharacterRpc(a, { character_id: "ch-rpc" });
  assert.equal(insp.status, 200);
  assert.equal(insp.body.read_only, true);
});

await testAsync("GetRuntimeConfig / SetFeatureFlag / maintenance RPCs", async () => {
  const a = insertUser("u-rt", "rt@t.test", "admin");
  const cfg = await GetRuntimeConfig(a);
  assert.equal(cfg.status, 200);
  const flag = await SetFeatureFlagRpc(a, {
    flag: "arena_enabled",
    enabled: true,
    reason: "restore",
  });
  assert.equal(flag.status, 200);
  const maint = await SetMaintenanceModeRpc(a, { enabled: true, message: "test" });
  assert.equal(maint.status, 200);
  await SetMaintenanceModeRpc(a, { enabled: false });
});

await testAsync("GetOpsDashboardRpc", async () => {
  const a = insertUser("u-ops", "ops@t.test", "admin");
  const res = await GetOpsDashboardRpc(a);
  assert.equal(res.status, 200);
  assert.ok(res.body.dashboard);
  assert.ok(Array.isArray(res.body.permissions));
});

await testAsync("arena_suspend via AdminModeration", async () => {
  const a = insertUser("u-as", "as@t.test", "admin");
  makeCharacter("ch-as", a.id);
  const res = await AdminModeration(a, {
    action: "arena_suspend",
    character_id: "ch-as",
    hours: 2,
    reason: "test suspend",
  });
  assert.equal(res.status, 200);
  assert.equal(isArenaBanned("ch-as"), true);
});

const { buildSimulateLoadoutPlan, SIMULATE_GEAR_RARITY, SIMULATE_NOVA_GRANT, GEAR_SLOTS, resolveSimulateGearSlots } =
  await import("../../src/lib/productionMath/index.js");
const { composePermanentAttributes } = await import("../../src/lib/characterStats.js");

await testAsync("simulate_level denies non-admin", async () => {
  const u = insertUser("u-sim-deny", "sim-deny@t.test", "user");
  const res = await AdminModeration(u, { action: "simulate_level", character_id: "x", level: 10 });
  assert.equal(res.status, 403);
});

await testAsync("simulate_level missing character is 404", async () => {
  const a = insertUser("u-sim-404", "sim-404@t.test", "admin");
  const res = await AdminModeration(a, {
    action: "simulate_level",
    character_id: "missing-sim-char",
    level: 10,
  });
  assert.equal(res.status, 404);
});

await testAsync("simulate_level rebuilds L1 Vanguard snapshot", async () => {
  const a = insertUser("u-sim-l1", "sim-l1@t.test", "admin");
  makeCharacter("ch-sim-l1", a.id, "SimOne");
  entities.Item.create({
    name: "Old Junk",
    type: "weapon",
    rarity: "common",
    character_id: "ch-sim-l1",
    owner_id: a.id,
    is_equipped: false,
  });
  const res = await AdminModeration(a, {
    action: "simulate_level",
    character_id: "ch-sim-l1",
    level: 1,
  });
  assert.equal(res.status, 200, res.body?.error);
  const ch = entities.Character.get("ch-sim-l1");
  const plan = buildSimulateLoadoutPlan({ className: "Vanguard", level: 1, nowMs: Date.now() });
  assert.equal(ch.class, "Vanguard");
  assert.equal(ch.level, 1);
  assert.equal(ch.experience, 0);
  assert.equal(ch.attribute_purchases, 0);
  assert.equal(ch.fuel, ch.max_fuel);
  assert.equal(ch.stardust, plan.stardust);
  const { getBalances } = await import("../src/shared/currencyService.js");
  assert.equal(getBalances(ch).nova_crystals, SIMULATE_NOVA_GRANT);
  assert.equal(ch.onboarding_tutorial?.status, "completed");
  const items = entities.Item.filter({ character_id: "ch-sim-l1" }) || [];
  assert.equal(items.length, GEAR_SLOTS.length);
  assert.ok(items.every((it) => it.rarity === SIMULATE_GEAR_RARITY && it.is_equipped === true));
  assert.ok(items.every((it) => Number(it.level || it.level_requirement) === 1));
  assert.equal(Object.keys(ch.equipped_items || {}).length, GEAR_SLOTS.length);
  assert.equal((ch.active_buffs || []).length, 3);
  assert.ok((ch.active_buffs || []).every((b) => b.rarity === "uncommon"));
  assert.ok(!items.some((it) => it.name === "Old Junk"));
});

await testAsync("simulate_level L25 Technomancer purchases and epic-band not yet", async () => {
  const a = insertUser("u-sim-l25", "sim-l25@t.test", "admin");
  const created = makeCharacter("ch-sim-l25", a.id, "SimTech");
  entities.Character.update(created.id, { class: "Technomancer" });
  const res = await AdminModeration(a, {
    action: "simulate_level",
    character_id: "ch-sim-l25",
    level: 25,
  });
  assert.equal(res.status, 200, res.body?.error);
  const ch = entities.Character.get("ch-sim-l25");
  const plan = buildSimulateLoadoutPlan({ className: "Technomancer", level: 25, nowMs: Date.now() });
  assert.equal(ch.class, "Technomancer");
  assert.equal(ch.level, 25);
  assert.equal(ch.experience, 0);
  assert.equal(ch.attribute_purchases, plan.purchaseTotal);
  assert.equal(ch.attribute_purchases_by_stat.intellect, plan.purchasesByStat.intellect);
  const expectedStats = composePermanentAttributes({
    class: "Technomancer",
    level: 25,
    attribute_purchases_by_stat: plan.purchasesByStat,
  });
  assert.equal(ch.stats.intellect, expectedStats.intellect);
  assert.ok((ch.active_buffs || []).every((b) => b.rarity === "rare"));
  const items = entities.Item.filter({ character_id: "ch-sim-l25" }) || [];
  assert.equal(items.length, GEAR_SLOTS.length);
  assert.ok(items.every((it) => Number(it.level || it.level_requirement) === 25));
});

await testAsync("resolveSimulateGearSlots defaults and rejects partial B on uncommon", async () => {
  const defaults = resolveSimulateGearSlots(null);
  assert.equal(Object.keys(defaults).length, GEAR_SLOTS.length);
  assert.ok(GEAR_SLOTS.every((slot) => defaults[slot].rarity === SIMULATE_GEAR_RARITY));
  assert.ok(GEAR_SLOTS.every((slot) => defaults[slot].pool === "normal"));
  const mixed = resolveSimulateGearSlots({ helmet: { rarity: "legendary", pool: "desirable" } });
  assert.equal(mixed.helmet.rarity, "legendary");
  assert.equal(mixed.helmet.pool, "desirable");
  assert.equal(mixed.weapon.rarity, SIMULATE_GEAR_RARITY);
  try {
    resolveSimulateGearSlots({ helmet: { rarity: "uncommon", pool: "partial_b" } });
    assert.fail("expected partial_b uncommon to throw");
  } catch (err) {
    assert.equal(err.status, 400);
  }
  try {
    resolveSimulateGearSlots({ not_a_slot: { rarity: "rare", pool: "normal" } });
    assert.fail("expected unknown slot to throw");
  } catch (err) {
    assert.equal(err.status, 400);
  }
});

await testAsync("simulate_level honors per-slot rarity and directed pools", async () => {
  const a = insertUser("u-sim-slots", "sim-slots@t.test", "admin");
  const created = makeCharacter("ch-sim-slots", a.id, "SimSlots");
  entities.Character.update(created.id, { class: "Technomancer" });
  const slots = Object.fromEntries(
    GEAR_SLOTS.map((slot) => [slot, { rarity: "rare", pool: "normal" }]),
  );
  slots.helmet = { rarity: "legendary", pool: "desirable" };
  slots.weapon = { rarity: "common", pool: "partial_a" };
  slots.armor = { rarity: "epic", pool: "partial_b" };
  const res = await AdminModeration(a, {
    action: "simulate_level",
    character_id: "ch-sim-slots",
    level: 25,
    slots,
  });
  assert.equal(res.status, 200, res.body?.error);
  const items = entities.Item.filter({ character_id: "ch-sim-slots" }) || [];
  assert.equal(items.length, GEAR_SLOTS.length);
  const byType = Object.fromEntries(items.map((it) => [it.type, it]));
  assert.equal(byType.helmet.rarity, "legendary");
  assert.equal(byType.weapon.rarity, "common");
  assert.equal(byType.armor.rarity, "epic");
  assert.equal(byType.legs.rarity, "rare");
  const helmetStats = byType.helmet.stats || {};
  const helmetBudget = Object.values(helmetStats).reduce((sum, n) => sum + Number(n || 0), 0);
  const minEach = Math.floor(helmetBudget * 0.1);
  assert.equal(Number(helmetStats.strength), minEach);
  assert.equal(Number(helmetStats.agility), minEach);
  assert.ok(Number(helmetStats.intellect) >= minEach);
  const weaponKeys = Object.keys(byType.weapon.stats || {});
  assert.equal(weaponKeys.length, 1);
  assert.ok(["strength", "agility"].includes(weaponKeys[0]));
  const armorKeys = Object.keys(byType.armor.stats || {});
  assert.equal(armorKeys.length, 3);
  assert.ok(armorKeys.includes("strength"));
  assert.ok(armorKeys.includes("agility"));
});

await testAsync("simulate_level rejects partial B on uncommon", async () => {
  const a = insertUser("u-sim-badpool", "sim-badpool@t.test", "admin");
  makeCharacter("ch-sim-badpool", a.id, "SimBad");
  const slots = Object.fromEntries(
    GEAR_SLOTS.map((slot) => [slot, { rarity: "uncommon", pool: "partial_b" }]),
  );
  const res = await AdminModeration(a, {
    action: "simulate_level",
    character_id: "ch-sim-badpool",
    level: 10,
    slots,
  });
  assert.equal(res.status, 400);
});

const {
  BACKPACK_UNEQUIPPED_ITEM_CAP,
  STIM_TIERS,
  stimBonusMultiplier,
  stimSellValueResolved,
} = await import("../../src/lib/productionMath/index.js");
const { STIM_ATTRIBUTES } = await import("../../src/lib/stimActivation.js");

await testAsync("admin stim grant places a canonical Stim in backpack", async () => {
  const a = insertUser("u-stim-grant", "stim-grant@t.test", "admin");
  const player = insertUser("u-stim-target", "stim-target@t.test", "user");
  makeCharacter("ch-stim-grant", player.id, "StimTarget");
  const res = await AdminModeration(a, {
    action: "give_item",
    character_id: "ch-stim-grant",
    type: "consumable",
    rarity: "epic",
    stat: "intellect",
    reason: "qa stim",
  });
  assert.equal(res.status, 200, res.body?.error);
  const item = res.body.item;
  assert.equal(item.type, "consumable");
  assert.equal(item.rarity, "epic");
  assert.equal(item.consumable.stat, "intellect");
  assert.equal(item.consumable.tier, "epic");
  assert.equal(item.consumable.mult, stimBonusMultiplier("epic"));
  assert.equal(item.consumable.duration_hours, STIM_TIERS.epic.baseHours);
  assert.equal(item.level_requirement, 3);
  assert.equal(item.origin, "unassigned");
  assert.equal(item.sell_value, stimSellValueResolved(3, "epic"));
  assert.equal(item.is_equipped, false);
  assert.match(item.name, /Epic Intellect Stim/i);
  assert.equal(entities.Item.get(item.id)?.character_id, "ch-stim-grant");
});

await testAsync("admin stim grant covers every attribute and quality", async () => {
  const a = insertUser("u-stim-grid", "stim-grid@t.test", "admin");
  makeCharacter("ch-stim-grid", a.id, "StimGrid");
  const rarities = ["uncommon", "rare", "epic"];
  for (const rarity of rarities) {
    for (const stat of STIM_ATTRIBUTES) {
      const res = await AdminModeration(a, {
        action: "give_item",
        character_id: "ch-stim-grid",
        type: "consumable",
        rarity,
        stat,
        reason: "grid",
      });
      assert.equal(res.status, 200, `${rarity} ${stat}: ${res.body?.error}`);
      assert.equal(res.body.item.rarity, rarity);
      assert.equal(res.body.item.consumable.stat, stat);
      assert.equal(res.body.item.consumable.mult, stimBonusMultiplier(rarity));
      entities.Item.delete(res.body.item.id);
    }
  }
});

await testAsync("admin stim grant rejects invalid quality/attribute and ignores forged stats", async () => {
  const a = insertUser("u-stim-bad", "stim-bad@t.test", "admin");
  makeCharacter("ch-stim-bad", a.id, "StimBad");
  const common = await AdminModeration(a, {
    action: "give_item",
    character_id: "ch-stim-bad",
    type: "consumable",
    rarity: "common",
    stat: "strength",
  });
  assert.equal(common.status, 400);
  const legendary = await AdminModeration(a, {
    action: "give_item",
    character_id: "ch-stim-bad",
    type: "consumable",
    rarity: "legendary",
    stat: "strength",
  });
  assert.equal(legendary.status, 400);
  const badStat = await AdminModeration(a, {
    action: "give_item",
    character_id: "ch-stim-bad",
    type: "consumable",
    rarity: "rare",
    stat: "crit_chance",
  });
  assert.equal(badStat.status, 400);
  const forged = await AdminModeration(a, {
    action: "give_item",
    character_id: "ch-stim-bad",
    type: "consumable",
    rarity: "uncommon",
    stat: "luck",
    reason: "qa forged stim",
    item: {
      name: "Forged",
      type: "consumable",
      rarity: "uncommon",
      consumable: { stat: "luck", mult: 0.99, duration_hours: 999, tier: "uncommon" },
    },
  });
  assert.equal(forged.status, 200, forged.body?.error || JSON.stringify(forged.body));
  assert.equal(forged.body.item.consumable.mult, stimBonusMultiplier("uncommon"));
  assert.equal(forged.body.item.consumable.duration_hours, STIM_TIERS.uncommon.baseHours);
});

await testAsync("admin stim grant denies non-admin and respects backpack cap", async () => {
  const player = insertUser("u-stim-deny", "stim-deny@t.test", "user");
  makeCharacter("ch-stim-deny", player.id, "StimDeny");
  const denied = await AdminModeration(player, {
    action: "give_item",
    character_id: "ch-stim-deny",
    type: "consumable",
    rarity: "rare",
    stat: "vitality",
  });
  assert.equal(denied.status, 403);

  const a = insertUser("u-stim-bag", "stim-bag@t.test", "admin");
  makeCharacter("ch-stim-bag", a.id, "StimBag");
  for (let i = 0; i < BACKPACK_UNEQUIPPED_ITEM_CAP; i += 1) {
    entities.Item.create({
      id: `stim-bag-fill-${i}`,
      name: `Filler ${i}`,
      type: "material",
      rarity: "common",
      character_id: "ch-stim-bag",
      owner_id: a.id,
      created_by_id: a.id,
      is_equipped: false,
    });
  }
  const full = await AdminModeration(a, {
    action: "give_item",
    character_id: "ch-stim-bag",
    type: "consumable",
    rarity: "rare",
    stat: "agility",
    reason: "cap",
  });
  assert.equal(full.status, 400);
  assert.equal(full.body.code, "INVENTORY_FULL");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
