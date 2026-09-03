/**
 * Phase 9 — Companies, Shipments, reputation, tokens, Commissions.
 * Run: npm run test:phase9
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-phase9-"));
process.env.DB_PATH = path.join(tmpDir, "phase9.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const { sanitizeUpdatePayload } = await import("../src/entityAccess.js");
const { GenerateGearItem } = await import("../../src/lib/itemGeneration.js");
const {
  COMPANY_IDS,
  COMPANY_ID_DTD,
  COMPANY_ID_TTT,
  COMPANY_ID_RDR,
  COMPANY_ID_GORP,
  COMPANY_SLOTS,
  SLOT_ELIGIBLE_COMPANIES,
  GEAR_SLOTS,
  SHIPMENT_ITEM_COUNT,
  SHIPMENT_REPUTATION_REWARD,
  COMPANY_REPUTATION_PER_LEVEL,
  TOKEN_RARITY_EPIC,
  TOKEN_RARITY_RARE,
  CANONICAL_GEAR_STAT_KEYS,
  companyLevelFromReputation,
  companiesForSlot,
  rollManufacturerForSlot,
  shipmentPayoutFromBase,
  tokenRarityForCompanyLevel,
  nextTokenRarity,
  allocateRareCommissionStats,
  allocateEpicCommissionStats,
  allocateBudgetByPercents,
  defaultShipmentEligible,
} = await import("../../src/lib/productionMath/index.js");
const { DissolveItem } = await import("../src/functions/economy.js");
const {
  GetCompanyStatus,
  PreviewShipment,
  ConfirmShipment,
  RedeemCommission,
} = await import("../src/functions/companies.js");
const { toNovaHalfUnits } = await import("../src/shared/currencyService.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GODOT_ROOT = path.join(ROOT, "loot&lasers");

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

function hashPw(pw) {
  return createHash("sha256").update(pw).digest("hex");
}

function insertUser(id, email) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, 'user', 1, ?, ?)`,
  ).run(id, email, hashPw("x"), now, now);
  return { id, email, role: "user", active_character_id: null };
}

function makeChar(ownerId, opts = {}) {
  const ch = entities.Character.create({
    id: opts.id,
    name: opts.name || `Op-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: ownerId,
    level: opts.level ?? 20,
    class: opts.className || "Vanguard",
    race: "Human",
    stats: opts.stats || { strength: 40, agility: 20, intellect: 10, vitality: 30, luck: 15 },
    stardust: opts.stardust ?? 0,
    nova_crystals: toNovaHalfUnits(opts.nova ?? 0),
    experience: 0,
    fuel: 10,
    company_state: opts.companyState || undefined,
  });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, ownerId);
  return { ...ch, ...entities.Character.get(ch.id), created_by_id: ownerId };
}

function userFor(account) {
  return { ...account, active_character_id: account.active_character_id };
}

function seqRng(values) {
  const seq = Array.isArray(values) ? values : [values];
  let i = 0;
  return () => seq[Math.min(i++, seq.length - 1)];
}

function combinations(arr, k) {
  const out = [];
  const walk = (start, chosen) => {
    if (chosen.length === k) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < arr.length; i += 1) {
      chosen.push(arr[i]);
      walk(i + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return out;
}

function grantGear(character, { manufacturer, slot = "helmet", origin = "mission", eligible = true, sellValue = 100, equipped = false, locked = false, rng = () => 0.4 }) {
  const generated = GenerateGearItem({
    itemLevel: character.level || 1,
    itemType: slot,
    rarity: "rare",
    origin,
    manufacturer,
    shipmentEligible: eligible,
    rng,
    className: character.class,
  });
  return entities.Item.create({
    ...generated,
    sell_value: sellValue,
    manufacturer: manufacturer || generated.manufacturer,
    shipment_eligible: eligible,
    origin: generated.origin,
    is_equipped: equipped,
    locked,
    owner_id: character.created_by_id,
    character_id: character.id,
  });
}

function fiveItems(character, companyId, extra = {}) {
  const slots = COMPANY_SLOTS[companyId];
  return Array.from({ length: SHIPMENT_ITEM_COUNT }, (_, i) =>
    grantGear(character, { manufacturer: companyId, slot: slots[i % slots.length], sellValue: extra.sellValue ?? 100, ...extra }),
  );
}

console.log("\nPhase 9 Companies / Shipments / Commissions\n");

test("each slot maps to exactly two Companies; each Company maps to four slots", () => {
  for (const slot of GEAR_SLOTS) {
    assert.equal(companiesForSlot(slot).length, 2, slot);
  }
  for (const id of COMPANY_IDS) {
    assert.equal(COMPANY_SLOTS[id].length, 4, id);
  }
  const reverse = {};
  for (const id of COMPANY_IDS) {
    for (const slot of COMPANY_SLOTS[id]) {
      reverse[slot] = reverse[slot] || [];
      reverse[slot].push(id);
    }
  }
  for (const slot of GEAR_SLOTS) {
    assert.deepEqual([...reverse[slot]].sort(), [...SLOT_ELIGIBLE_COMPANIES[slot]].sort());
  }
});

test("compatible manufacturers are 50/50 under controlled RNG", () => {
  assert.equal(rollManufacturerForSlot("helmet", () => 0), COMPANY_ID_DTD);
  assert.equal(rollManufacturerForSlot("helmet", () => 0.99), COMPANY_ID_RDR);
  assert.equal(rollManufacturerForSlot("weapon", () => 0), COMPANY_ID_RDR);
  assert.equal(rollManufacturerForSlot("weapon", () => 0.99), COMPANY_ID_GORP);
});

test("generated Gear always has a legal manufacturer", () => {
  for (const slot of GEAR_SLOTS) {
    const item = GenerateGearItem({
      itemLevel: 8,
      itemType: slot,
      rarity: "rare",
      origin: "mission",
      rng: () => 0.1,
      className: "Vanguard",
    });
    assert.ok(COMPANY_IDS.includes(item.manufacturer), slot);
    assert.ok(COMPANY_SLOTS[item.manufacturer].includes(slot));
  }
});

test("origin and eligibility: market/contraband ineligible; other generated Gear eligible", () => {
  const sources = [
    ["mission", true],
    ["dungeon", true],
    ["wormhole", true],
    ["rare_commission", true],
    ["epic_commission", true],
    ["unassigned", true],
    ["tutorial", true],
    ["market", false],
    ["contraband", false],
  ];
  for (const [origin, eligible] of sources) {
    const item = GenerateGearItem({
      itemLevel: 5,
      itemType: "armor",
      rarity: "uncommon",
      origin,
      rng: () => 0.2,
    });
    assert.equal(defaultShipmentEligible(origin), eligible, origin);
    assert.equal(item.shipment_eligible, eligible, origin);
    assert.ok(item.manufacturer);
  }
});

test("shipment payout uses persisted sell values and roundHalfUp 10%", () => {
  const math = shipmentPayoutFromBase(1000);
  assert.equal(math.base_value, 1000);
  assert.equal(math.payout, 1100);
  assert.equal(math.bonus, 100);
  assert.equal(math.reputation, SHIPMENT_REPUTATION_REWARD);
  const odd = shipmentPayoutFromBase(5);
  assert.equal(odd.payout, 6);
  const evenish = shipmentPayoutFromBase(15);
  assert.equal(evenish.payout, 17);
});

test("company level is floor(rep / 1500) and unbounded", () => {
  assert.equal(companyLevelFromReputation(0), 0);
  assert.equal(companyLevelFromReputation(1499), 0);
  assert.equal(companyLevelFromReputation(1500), 1);
  assert.equal(companyLevelFromReputation(2999), 1);
  assert.equal(companyLevelFromReputation(3000), 2);
  assert.equal(companyLevelFromReputation(1_500_000), 1000);
});

test("staggered Rare/Epic token rotation continues indefinitely", () => {
  const epicAt = {
    [COMPANY_ID_DTD]: [1, 5, 9, 13],
    [COMPANY_ID_TTT]: [2, 6, 10, 14],
    [COMPANY_ID_RDR]: [3, 7, 11, 15],
    [COMPANY_ID_GORP]: [4, 8, 12, 16],
  };
  for (const id of COMPANY_IDS) {
    for (let L = 1; L <= 64; L += 1) {
      const expected = epicAt[id].includes(((L - 1) % 4) + 1 + Math.floor((L - 1) / 4) * 0)
        ? null
        : null;
      void expected;
      const offset = { DTD: 0, TTT: 1, RDR: 2, GORP: 3 }[id];
      const want = ((L - 1) % 4) === offset ? TOKEN_RARITY_EPIC : TOKEN_RARITY_RARE;
      assert.equal(tokenRarityForCompanyLevel(id, L), want, `${id} L${L}`);
    }
    assert.equal(nextTokenRarity(id, 0), tokenRarityForCompanyLevel(id, 1));
  }
  assert.equal(tokenRarityForCompanyLevel(COMPANY_ID_DTD, 1), TOKEN_RARITY_EPIC);
  assert.equal(tokenRarityForCompanyLevel(COMPANY_ID_TTT, 2), TOKEN_RARITY_EPIC);
  assert.equal(tokenRarityForCompanyLevel(COMPANY_ID_RDR, 3), TOKEN_RARITY_EPIC);
  assert.equal(tokenRarityForCompanyLevel(COMPANY_ID_GORP, 4), TOKEN_RARITY_EPIC);
});

test("largest-remainder allocation conserves budget and uses canonical order", () => {
  const stats = allocateBudgetByPercents(10, { strength: 40, agility: 40, intellect: 20 });
  assert.equal(Object.values(stats).reduce((s, n) => s + n, 0), 10);
  assert.equal(stats.vitality, 0);
  assert.equal(stats.luck, 0);
  const tie = allocateBudgetByPercents(2, { strength: 50, agility: 50 });
  assert.equal(tie.strength + tie.agility, 2);
  assert.ok(tie.strength >= 1);
});

test("Rare commissions accept all legal three-stat combinations", () => {
  for (const trio of combinations([...CANONICAL_GEAR_STAT_KEYS], 3)) {
    const weights = { [trio[0]]: 40, [trio[1]]: 40, [trio[2]]: 20 };
    const stats = allocateRareCommissionStats(50, weights);
    assert.equal(CANONICAL_GEAR_STAT_KEYS.reduce((s, k) => s + stats[k], 0), 50);
    for (const key of CANONICAL_GEAR_STAT_KEYS) {
      if (!trio.includes(key)) assert.equal(stats[key], 0);
    }
  }
});

test("Epic commissions force Primary/Vitality/Luck and conserve budget", () => {
  const a = allocateEpicCommissionStats(100, "strength", () => 0.2);
  assert.equal(Object.values(a).reduce((s, n) => s + n, 0), 100);
  assert.equal(a.agility, 0);
  assert.equal(a.intellect, 0);
  assert.ok(a.strength >= 30);
  assert.ok(a.vitality >= 30);
  assert.ok(a.luck >= 20);
  const b = allocateEpicCommissionStats(100, "strength", () => 0.9);
  assert.equal(Object.values(b).reduce((s, n) => s + n, 0), 100);
});

await testAsync("Shipment requires exactly five same-company unequipped eligible items", async () => {
  const account = insertUser("p9-a1", "p9-a1@x.test");
  const ch = makeChar(account.id);
  account.active_character_id = ch.id;
  const items = fiveItems(ch, COMPANY_ID_DTD, { sellValue: 200 });
  const four = await PreviewShipment(account, {
    company_id: COMPANY_ID_DTD,
    item_ids: items.slice(0, 4).map((i) => i.id),
  });
  assert.equal(four.status, 400);
  assert.equal(four.body.code, "INVALID_SHIPMENT_COUNT");

  items[0] = entities.Item.update(items[0].id, { is_equipped: true });
  const equipped = await PreviewShipment(account, {
    company_id: COMPANY_ID_DTD,
    item_ids: items.map((i) => i.id),
  });
  assert.equal(equipped.status, 400);
  assert.equal(equipped.body.code, "ITEM_EQUIPPED");
  entities.Item.update(items[0].id, { is_equipped: false });

  const mismatch = grantGear(ch, { manufacturer: COMPANY_ID_TTT, slot: "armor" });
  const mixed = await PreviewShipment(account, {
    company_id: COMPANY_ID_DTD,
    item_ids: [...items.slice(0, 4).map((i) => i.id), mismatch.id],
  });
  assert.equal(mixed.status, 400);
  assert.equal(mixed.body.code, "SHIPMENT_COMPANY_MISMATCH");

  const market = grantGear(ch, { manufacturer: COMPANY_ID_DTD, slot: "helmet", origin: "market", eligible: false });
  const ineligible = await PreviewShipment(account, {
    company_id: COMPANY_ID_DTD,
    item_ids: [...items.slice(0, 4).map((i) => i.id), market.id],
  });
  assert.equal(ineligible.status, 400);
  assert.equal(ineligible.body.code, "ITEM_NOT_SHIPMENT_ELIGIBLE");

  const dup = await PreviewShipment(account, {
    company_id: COMPANY_ID_DTD,
    item_ids: [items[0].id, items[0].id, items[1].id, items[2].id, items[3].id],
  });
  assert.equal(dup.status, 400);
  assert.equal(dup.body.code, "DUPLICATE_SHIPMENT_ITEM");
});

await testAsync("foreign IDs and missing IDs are rejected", async () => {
  const a = insertUser("p9-a2", "p9-a2@x.test");
  const b = insertUser("p9-b2", "p9-b2@x.test");
  const chA = makeChar(a.id);
  const chB = makeChar(b.id);
  a.active_character_id = chA.id;
  const mine = fiveItems(chA, COMPANY_ID_RDR);
  const theirs = grantGear(chB, { manufacturer: COMPANY_ID_RDR, slot: "weapon" });
  const foreign = await PreviewShipment(a, {
    company_id: COMPANY_ID_RDR,
    item_ids: [...mine.slice(0, 4).map((i) => i.id), theirs.id],
  });
  assert.equal(foreign.status, 403);
  const missing = await PreviewShipment(a, {
    company_id: COMPANY_ID_RDR,
    item_ids: [...mine.slice(0, 4).map((i) => i.id), "no-such-item"],
  });
  assert.equal(missing.status, 404);
});

await testAsync("preview matches settlement; items consumed once; reputation +100", async () => {
  const account = insertUser("p9-a3", "p9-a3@x.test");
  const ch = makeChar(account.id, { stardust: 10 });
  account.active_character_id = ch.id;
  const items = fiveItems(ch, COMPANY_ID_TTT, { sellValue: 100 });
  const ids = items.map((i) => i.id);
  const preview = await PreviewShipment(account, { company_id: COMPANY_ID_TTT, item_ids: ids });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.preview.payout, 550);
  assert.equal(preview.body.preview.base_value, 500);
  assert.equal(preview.body.preview.bonus, 50);
  const settled = await ConfirmShipment(account, {
    company_id: COMPANY_ID_TTT,
    item_ids: ids,
    request_id: "ship-a3-1",
  });
  assert.equal(settled.status, 200);
  assert.equal(settled.body.payout, preview.body.preview.payout);
  assert.equal(settled.body.reputation_granted, 100);
  const live = entities.Character.get(ch.id);
  assert.equal(live.stardust, 560);
  assert.equal(live.company_state.TTT.reputation, 100);
  assert.equal(live.company_state.TTT.shipment_count, 1);
  assert.equal(live.company_state.TTT.level, undefined);
  assert.equal(companyLevelFromReputation(live.company_state.TTT.reputation), 0);
  for (const id of ids) assert.equal(entities.Item.get(id), null);
  const replay = await ConfirmShipment(account, {
    company_id: COMPANY_ID_TTT,
    item_ids: ids,
    request_id: "ship-a3-1",
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).stardust, 560);
  assert.equal(entities.Character.get(ch.id).company_state.TTT.shipment_count, 1);
});

await testAsync("stale preview is revalidated; dissolved item blocks settlement", async () => {
  const account = insertUser("p9-a4", "p9-a4@x.test");
  const ch = makeChar(account.id);
  account.active_character_id = ch.id;
  const items = fiveItems(ch, COMPANY_ID_GORP, { sellValue: 80 });
  const ids = items.map((i) => i.id);
  const preview = await PreviewShipment(account, { company_id: COMPANY_ID_GORP, item_ids: ids });
  assert.equal(preview.status, 200);
  const gone = await DissolveItem(account, { item_id: ids[0] });
  assert.equal(gone.status, 200);
  const confirm = await ConfirmShipment(account, {
    company_id: COMPANY_ID_GORP,
    item_ids: ids,
    request_id: "ship-a4-stale",
  });
  assert.equal(confirm.status, 404);
  assert.ok(entities.Item.get(ids[1]));
});

await testAsync("stored lock values do not block dissolve or shipment", async () => {
  const account = insertUser("p9-a5", "p9-a5@x.test");
  const ch = makeChar(account.id);
  account.active_character_id = ch.id;
  const items = fiveItems(ch, COMPANY_ID_DTD, { sellValue: 50, locked: true });
  const dissolve = await DissolveItem(account, { item_id: items[0].id });
  assert.equal(dissolve.status, 200);
  const replacement = grantGear(ch, { manufacturer: COMPANY_ID_DTD, slot: "boots", sellValue: 50, locked: true });
  const confirm = await ConfirmShipment(account, {
    company_id: COMPANY_ID_DTD,
    item_ids: [replacement.id, ...items.slice(1).map((i) => i.id)],
    request_id: "ship-locked-ignored",
  });
  assert.equal(confirm.status, 200);
});

await testAsync("Item update cannot restore locking", async () => {
  const account = insertUser("p9-a6", "p9-a6@x.test");
  assert.throws(
    () => sanitizeUpdatePayload(account, "Item", { locked: true }),
    (err) => err.code === "ITEM_LOCK_REMOVED",
  );
  assert.throws(
    () => sanitizeUpdatePayload(account, "Item", { favorited: true }),
    (err) => err.code === "ITEM_LOCK_REMOVED",
  );
});

await testAsync("companies and characters stay isolated; level-up awards a token", async () => {
  const a = insertUser("p9-a7", "p9-a7@x.test");
  const b = insertUser("p9-b7", "p9-b7@x.test");
  const chA = makeChar(a.id, {
    companyState: {
      DTD: { reputation: 1400, shipment_count: 14, waiting_token: null, overflow_token: null },
    },
  });
  const chB = makeChar(b.id);
  a.active_character_id = chA.id;
  b.active_character_id = chB.id;
  const items = fiveItems(chA, COMPANY_ID_DTD, { sellValue: 10 });
  const settled = await ConfirmShipment(a, {
    company_id: COMPANY_ID_DTD,
    item_ids: items.map((i) => i.id),
    request_id: "ship-level-dtd",
  });
  assert.equal(settled.status, 200);
  assert.equal(settled.body.company.level, 1);
  assert.equal(settled.body.company.waiting_token.rarity, TOKEN_RARITY_EPIC);
  const other = entities.Character.get(chB.id);
  assert.equal(other.company_state?.DTD?.reputation || 0, 0);
  const liveA = entities.Character.get(chA.id);
  assert.equal(liveA.company_state.TTT.reputation || 0, 0);
});

await testAsync("overflow preserves the shipment, blocks same-company ships, allows others", async () => {
  const account = insertUser("p9-a8", "p9-a8@x.test");
  const existing = {
    id: "tok-wait-1",
    company_id: COMPANY_ID_DTD,
    rarity: TOKEN_RARITY_RARE,
    awarded_level: 1,
    status: "waiting",
  };
  const ch = makeChar(account.id, {
    companyState: {
      DTD: { reputation: 1400, shipment_count: 14, waiting_token: existing, overflow_token: null },
    },
  });
  account.active_character_id = ch.id;
  const items = fiveItems(ch, COMPANY_ID_DTD, { sellValue: 20 });
  const settled = await ConfirmShipment(account, {
    company_id: COMPANY_ID_DTD,
    item_ids: items.map((i) => i.id),
    request_id: "ship-overflow",
  });
  assert.equal(settled.status, 200);
  assert.equal(settled.body.overflow_pending, true);
  const live = entities.Character.get(ch.id);
  assert.equal(live.company_state.DTD.waiting_token.id, "tok-wait-1");
  assert.ok(live.company_state.DTD.overflow_token?.id);
  assert.equal(live.company_state.DTD.reputation, 1500);
  const blocked = await ConfirmShipment(account, {
    company_id: COMPANY_ID_DTD,
    item_ids: fiveItems(ch, COMPANY_ID_DTD).map((i) => i.id),
    request_id: "ship-overflow-block",
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "COMPANY_OVERFLOW_PENDING");
  const other = fiveItems(ch, COMPANY_ID_TTT, { sellValue: 10 });
  const allowed = await ConfirmShipment(account, {
    company_id: COMPANY_ID_TTT,
    item_ids: other.map((i) => i.id),
    request_id: "ship-other-ok",
  });
  assert.equal(allowed.status, 200);
});

await testAsync("overflow spend-old keeps new; spend-new keeps old; cancel preserves both", async () => {
  const account = insertUser("p9-a9", "p9-a9@x.test");
  const waiting = {
    id: "tok-old",
    company_id: COMPANY_ID_RDR,
    rarity: TOKEN_RARITY_RARE,
    awarded_level: 1,
    status: "waiting",
  };
  const overflow = {
    id: "tok-new",
    company_id: COMPANY_ID_RDR,
    rarity: TOKEN_RARITY_EPIC,
    awarded_level: 2,
    status: "overflow",
  };
  const ch = makeChar(account.id, {
    companyState: {
      RDR: { reputation: 3000, shipment_count: 30, waiting_token: waiting, overflow_token: overflow },
    },
  });
  account.active_character_id = ch.id;
  const status = await GetCompanyStatus(account, {});
  assert.equal(status.status, 200);
  assert.ok(status.body.overflow_companies.includes(COMPANY_ID_RDR));
  const still = entities.Character.get(ch.id).company_state.RDR;
  assert.equal(still.waiting_token.id, "tok-old");
  assert.equal(still.overflow_token.id, "tok-new");

  const created = await RedeemCommission(account, {
    company_id: COMPANY_ID_RDR,
    spend_token_id: "tok-old",
    slot: "weapon",
    weights: { strength: 40, vitality: 40, luck: 20 },
    request_id: "comm-spend-old",
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.item.origin, "rare_commission");
  assert.equal(created.body.item.manufacturer, COMPANY_ID_RDR);
  assert.equal(created.body.item.shipment_eligible, true);
  assert.equal(created.body.item.is_equipped, false);
  const after = entities.Character.get(ch.id).company_state.RDR;
  assert.equal(after.waiting_token.id, "tok-new");
  assert.equal(after.overflow_token, null);

  const replay = await RedeemCommission(account, {
    company_id: COMPANY_ID_RDR,
    spend_token_id: "tok-old",
    slot: "helmet",
    weights: { strength: 50, vitality: 30, luck: 20 },
    request_id: "comm-spend-old",
  });
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(replay.body.item.id, created.body.item.id);
});

await testAsync("Rare invalid weights reject without consuming the token", async () => {
  const account = insertUser("p9-a10", "p9-a10@x.test");
  const token = {
    id: "tok-rare",
    company_id: COMPANY_ID_TTT,
    rarity: TOKEN_RARITY_RARE,
    awarded_level: 1,
    status: "waiting",
  };
  const ch = makeChar(account.id, {
    companyState: {
      TTT: { reputation: 1500, shipment_count: 15, waiting_token: token, overflow_token: null },
    },
  });
  account.active_character_id = ch.id;
  const bad = await RedeemCommission(account, {
    company_id: COMPANY_ID_TTT,
    spend_token_id: "tok-rare",
    slot: "neck",
    weights: { strength: 70, vitality: 20, luck: 10 },
    request_id: "comm-bad-weights",
  });
  assert.equal(bad.status, 400);
  assert.equal(entities.Character.get(ch.id).company_state.TTT.waiting_token.id, "tok-rare");
  const illegalSlot = await RedeemCommission(account, {
    company_id: COMPANY_ID_TTT,
    spend_token_id: "tok-rare",
    slot: "weapon",
    weights: { strength: 40, vitality: 40, luck: 20 },
    request_id: "comm-bad-slot",
  });
  assert.equal(illegalSlot.status, 400);
  assert.equal(illegalSlot.body.code, "INVALID_COMPANY_SLOT");
});

await testAsync("Epic commission is deterministic, zero off-stats, and does not auto-equip", async () => {
  const account = insertUser("p9-a11", "p9-a11@x.test");
  const token = {
    id: "tok-epic",
    company_id: COMPANY_ID_GORP,
    rarity: TOKEN_RARITY_EPIC,
    awarded_level: 4,
    status: "waiting",
  };
  const ch = makeChar(account.id, {
    companyState: {
      GORP: { reputation: 6000, shipment_count: 60, waiting_token: token, overflow_token: null },
    },
    className: "Vanguard",
    level: 12,
  });
  account.active_character_id = ch.id;
  const created = await RedeemCommission(account, {
    company_id: COMPANY_ID_GORP,
    spend_token_id: "tok-epic",
    slot: "accessory",
    request_id: "comm-epic-1",
  });
  assert.equal(created.status, 200);
  const item = created.body.item;
  assert.equal(item.rarity, "epic");
  assert.equal(item.origin, "epic_commission");
  assert.equal(item.level, 12);
  assert.equal(item.is_equipped, false);
  assert.equal(item.stats.agility || 0, 0);
  assert.equal(item.stats.intellect || 0, 0);
  const budget = Object.values(item.stats).reduce((s, n) => s + (n || 0), 0);
  assert.equal(budget, item.stat_budget);
  const replay = await RedeemCommission(account, {
    company_id: COMPANY_ID_GORP,
    spend_token_id: "tok-epic",
    slot: "weapon",
    request_id: "comm-epic-1",
  });
  assert.equal(replay.body.item.id, item.id);
  assert.deepEqual(replay.body.item.stats, item.stats);
});

await testAsync("full backpack rejects commission and preserves waiting/overflow tokens", async () => {
  const account = insertUser("p9-a12", "p9-a12@x.test");
  const waiting = {
    id: "tok-full-w",
    company_id: COMPANY_ID_DTD,
    rarity: TOKEN_RARITY_RARE,
    awarded_level: 1,
    status: "waiting",
  };
  const overflow = {
    id: "tok-full-o",
    company_id: COMPANY_ID_DTD,
    rarity: TOKEN_RARITY_EPIC,
    awarded_level: 5,
    status: "overflow",
  };
  const ch = makeChar(account.id, {
    companyState: {
      DTD: { reputation: 7500, shipment_count: 75, waiting_token: waiting, overflow_token: overflow },
    },
  });
  account.active_character_id = ch.id;
  for (let i = 0; i < 10; i += 1) {
    grantGear(ch, { manufacturer: COMPANY_ID_TTT, slot: "armor", sellValue: 1, rng: () => 0.3 });
  }
  const failed = await RedeemCommission(account, {
    company_id: COMPANY_ID_DTD,
    spend_token_id: "tok-full-w",
    slot: "helmet",
    weights: { strength: 40, vitality: 40, luck: 20 },
    request_id: "comm-full",
  });
  assert.equal(failed.status, 400);
  assert.equal(failed.body.code, "INVENTORY_FULL");
  const live = entities.Character.get(ch.id).company_state.DTD;
  assert.equal(live.waiting_token.id, "tok-full-w");
  assert.equal(live.overflow_token.id, "tok-full-o");
});

await testAsync("GetCompanyStatus restores waiting and overflow after reload", async () => {
  const account = insertUser("p9-a13", "p9-a13@x.test");
  const ch = makeChar(account.id, {
    companyState: {
      GORP: {
        reputation: 4500,
        shipment_count: 45,
        waiting_token: {
          id: "tok-re-w",
          company_id: COMPANY_ID_GORP,
          rarity: "rare",
          awarded_level: 3,
          status: "waiting",
        },
        overflow_token: {
          id: "tok-re-o",
          company_id: COMPANY_ID_GORP,
          rarity: "epic",
          awarded_level: 4,
          status: "overflow",
        },
      },
    },
  });
  account.active_character_id = ch.id;
  const status = await GetCompanyStatus(account, {});
  const gorp = status.body.companies.find((c) => c.id === COMPANY_ID_GORP);
  assert.equal(gorp.waiting_token.id, "tok-re-w");
  assert.equal(gorp.overflow_token.id, "tok-re-o");
  assert.equal(gorp.overflow_pending, true);
});

test("Corporate Offices replaces Ship Hangar in live navigation", () => {
  const shell = fs.readFileSync(path.join(GODOT_ROOT, "Scenes/Main/game_shell.gd"), "utf8");
  assert.match(shell, /Corporate Offices/);
  assert.doesNotMatch(shell, /FEATURE_SHIP_HANGAR/);
  const gm = fs.readFileSync(path.join(GODOT_ROOT, "Autoload/GameManager.gd"), "utf8");
  assert.match(gm, /SCENE_CORPORATE_OFFICES/);
  assert.match(gm, /corporate_offices\.tscn/);
  const ui = fs.readFileSync(path.join(GODOT_ROOT, "Scenes/UI/corporate_offices.gd"), "utf8");
  assert.match(ui, /preview_shipment/);
  assert.match(ui, /confirm_shipment/);
  assert.match(ui, /redeem_commission/);
  const inv = fs.readFileSync(path.join(GODOT_ROOT, "Autoload/InventoryManager.gd"), "utf8");
  assert.doesNotMatch(inv, /set_locked/);
  const rules = fs.readFileSync(path.join(GODOT_ROOT, "Scripts/InventoryRules.gd"), "utf8");
  assert.doesNotMatch(rules, /item\.get\("locked"/);
});

test("client commission payload does not include final stats or epic rolls", () => {
  const mgr = fs.readFileSync(path.join(GODOT_ROOT, "Autoload/CompanyManager.gd"), "utf8");
  assert.match(mgr, /PreviewShipment/);
  assert.match(mgr, /ConfirmShipment/);
  assert.match(mgr, /item_ids/);
  assert.match(mgr, /spend_token_id/);
  assert.match(mgr, /weights/);
  assert.doesNotMatch(mgr, /"payout"/);
  assert.doesNotMatch(mgr, /final_stats/);
  assert.doesNotMatch(mgr, /epic_result/);
});

if (failed) {
  console.error(`\nPhase 9: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nPhase 9: ${passed} passed`);
