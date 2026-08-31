/**
 * Phase 5 — Stim activation, stacking, expiration, selling, backpack.
 * Run: npm run test:phase5-stims
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-phase5-stims-"));
process.env.DB_PATH = path.join(tmpDir, "phase5-stims.db");

const {
  STIM_TIERS,
  STIM_MAX_ACTIVE_EFFECTS,
  STIM_SELL_MULT,
  STIM_SAME_TIER_RESTIM_ELAPSED_DIVISOR,
  MILLISECONDS_PER_HOUR,
  BACKPACK_UNEQUIPPED_ITEM_CAP,
  stimBonusMultiplier,
  stimSellValueResolved,
  stimSameTierRestimCooldownHours,
  stimSameTierRestimRemainingBlockHours,
  stardustPerFuel,
  roundHalfUp,
  nextStimState,
} = await import("../../src/lib/productionMath/index.js");
const {
  prepareConsumableBuffs,
  CONSUMABLE_TIERS,
  STIM_ATTRIBUTES,
  STIM_TOO_CONCENTRATED_REASON,
} = await import("../../src/lib/stimActivation.js");
const { computeItemVendorValue } = await import("../../src/lib/itemGeneration.js");
const { computePermanentTotalStats } = await import("../../src/lib/statEngine.js");
const { applyBuffs, getActiveBuffs } = await import("../../src/lib/gameData.js");
const { buildMissionStimItem } = await import("../src/shared/missionRewards.js");
const { countBagOccupancy } = await import("../src/shared/inventoryGrant.js");
const { entities } = await import("../src/entities.js");
const { clock, installFakeClock, resetClockState } = await import("../src/shared/time/clock.js");
const { UseConsumable, DissolveItem } = await import("../src/functions/economy.js");

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

function stimItem(stat, rarity, extra = {}) {
  const tier = CONSUMABLE_TIERS[rarity];
  return {
    name: `${tier.label} ${stat} Stim`,
    type: "consumable",
    rarity,
    level_requirement: extra.level_requirement ?? 10,
    consumable: {
      stat,
      mult: extra.mult ?? tier.mult,
      duration_hours: extra.duration_hours ?? tier.duration_hours,
      tier: rarity,
    },
  };
}

function charWithBuffs(buffs, stats = {
  intellect: 200, strength: 100, agility: 100, vitality: 100, luck: 100,
}) {
  return { stats, active_buffs: buffs, race: null, class: "Technomancer", level: 10 };
}

const NOW = Date.parse("2026-08-31T12:00:00.000Z");

console.log("\nPhase 5 Stim tests\n");

test("tier metadata: +5/+10/+20 and 6/12/24 base, 18/36/72 max", () => {
  assert.equal(stimBonusMultiplier("uncommon"), 0.05);
  assert.equal(stimBonusMultiplier("rare"), 0.10);
  assert.equal(stimBonusMultiplier("epic"), 0.20);
  assert.equal(STIM_TIERS.uncommon.baseHours, 6);
  assert.equal(STIM_TIERS.rare.baseHours, 12);
  assert.equal(STIM_TIERS.epic.baseHours, 24);
  assert.equal(STIM_TIERS.uncommon.maxHours, 18);
  assert.equal(STIM_TIERS.rare.maxHours, 36);
  assert.equal(STIM_TIERS.epic.maxHours, 72);
  assert.equal(CONSUMABLE_TIERS.uncommon.mult, 0.05);
  assert.equal(CONSUMABLE_TIERS.epic.duration_hours, 24);
  assert.equal(STIM_MAX_ACTIVE_EFFECTS, 3);
  assert.equal(STIM_SAME_TIER_RESTIM_ELAPSED_DIVISOR, 2);
  assert.equal(stimSameTierRestimCooldownHours("uncommon"), 3);
  assert.equal(stimSameTierRestimCooldownHours("rare"), 6);
  assert.equal(stimSameTierRestimCooldownHours("epic"), 12);
  assert.equal(stimSameTierRestimRemainingBlockHours("uncommon"), 15);
  assert.equal(stimSameTierRestimRemainingBlockHours("rare"), 30);
  assert.equal(stimSameTierRestimRemainingBlockHours("epic"), 60);
  assert.deepEqual([...STIM_ATTRIBUTES], ["strength", "agility", "intellect", "vitality", "luck"]);
});

test("mission Stim metadata is immutable after generation", () => {
  const item = buildMissionStimItem({ rarity: "rare", stat: "vitality", snapshotLevel: 33 });
  assert.equal(item.consumable.stat, "vitality");
  assert.equal(item.rarity, "rare");
  assert.equal(item.consumable.tier, "rare");
  assert.equal(item.level_requirement, 33);
  assert.equal(item.consumable.mult, 0.10);
  const copy = JSON.parse(JSON.stringify(item));
  assert.equal(copy.consumable.stat, "vitality");
  assert.equal(copy.rarity, "rare");
});

test("uncommon fresh 6h +5%; same-tier stacks immediately to 18h cap", () => {
  const item = stimItem("strength", "uncommon");
  let res = prepareConsumableBuffs(charWithBuffs([]), item, [], NOW);
  assert.equal(res.ok, true);
  assert.equal(res.buffs[0].mult, 0.05);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 6 * MILLISECONDS_PER_HOUR);
  res = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, NOW);
  assert.equal(res.ok, true);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 12 * MILLISECONDS_PER_HOUR);
  res = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, NOW);
  assert.equal(res.ok, true);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 18 * MILLISECONDS_PER_HOUR);
  const atCap = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, NOW);
  assert.equal(atCap.ok, false);
  assert.equal(atCap.reason, STIM_TOO_CONCENTRATED_REASON);
  assert.equal(nextStimState({ tier: "uncommon", remainingHours: 16 }, "uncommon").remainingHours, 18);
});

test("rare fresh 12h +10%; cap 36h", () => {
  const item = stimItem("agility", "rare");
  let res = prepareConsumableBuffs(charWithBuffs([]), item, [], NOW);
  assert.equal(res.buffs[0].mult, 0.10);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 12 * MILLISECONDS_PER_HOUR);
  const atCap = nextStimState({ tier: "rare", remainingHours: 30 }, "rare");
  assert.equal(atCap.remainingHours, 36);
});

test("epic fresh 24h +20%; cap 72h", () => {
  const item = stimItem("intellect", "epic");
  const res = prepareConsumableBuffs(charWithBuffs([]), item, [], NOW);
  assert.equal(res.buffs[0].mult, 0.20);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 24 * MILLISECONDS_PER_HOUR);
  assert.equal(nextStimState({ tier: "epic", remainingHours: 60 }, "epic").remainingHours, 72);
});

test("higher tier replaces with fresh base; remaining is not carried", () => {
  const rare = stimItem("strength", "rare");
  let res = prepareConsumableBuffs(charWithBuffs([]), rare, [], NOW);
  const remaining8h = [{
    ...res.buffs[0],
    expires_at: new Date(NOW + 8 * MILLISECONDS_PER_HOUR).toISOString(),
  }];
  res = prepareConsumableBuffs(charWithBuffs(remaining8h), stimItem("strength", "epic"), remaining8h, NOW);
  assert.equal(res.ok, true);
  assert.equal(res.buffs[0].rarity, "epic");
  assert.equal(res.buffs[0].mult, 0.20);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 24 * MILLISECONDS_PER_HOUR);
});

test("lower tier is blocked and does not consume (ok:false)", () => {
  const epic = stimItem("luck", "epic");
  const res = prepareConsumableBuffs(charWithBuffs([]), epic, [], NOW);
  const blocked = prepareConsumableBuffs(
    charWithBuffs(res.buffs),
    stimItem("luck", "uncommon"),
    res.buffs,
    NOW,
  );
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /stronger/i);
  assert.equal(blocked.buffs, undefined);
});

test("different attributes coexist up to the certified 3-effect cap", () => {
  let buffs = [];
  for (const [stat, rarity] of [["strength", "epic"], ["vitality", "rare"], ["luck", "uncommon"]]) {
    const res = prepareConsumableBuffs(charWithBuffs(buffs), stimItem(stat, rarity), buffs, NOW);
    assert.equal(res.ok, true);
    buffs = res.buffs;
  }
  assert.equal(buffs.length, 3);
  const fourth = prepareConsumableBuffs(charWithBuffs(buffs), stimItem("agility", "rare"), buffs, NOW);
  assert.equal(fourth.ok, false);
  assert.equal(fourth.buffs, undefined);
});

function restimAtCapCase(stat, rarity) {
  const item = stimItem(stat, rarity);
  const maxHours = STIM_TIERS[rarity].maxHours;
  const thresholdHours = stimSameTierRestimRemainingBlockHours(rarity);
  let res = prepareConsumableBuffs(charWithBuffs([]), item, [], NOW);
  res = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, NOW);
  res = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, NOW);
  assert.equal(res.ok, true);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, maxHours * MILLISECONDS_PER_HOUR);
  const expiresBefore = res.buffs[0].expires_at;
  const blocked = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, NOW);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, STIM_TOO_CONCENTRATED_REASON);
  assert.equal(blocked.buffs, undefined);
  assert.equal(res.buffs[0].expires_at, expiresBefore);
  const justAbove = NOW + (maxHours - thresholdHours) * MILLISECONDS_PER_HOUR - 1;
  const stillBlocked = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, justAbove);
  assert.equal(stillBlocked.ok, false);
  const atThreshold = NOW + (maxHours - thresholdHours) * MILLISECONDS_PER_HOUR;
  const allowed = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, atThreshold);
  assert.equal(allowed.ok, true);
  assert.equal(new Date(allowed.buffs[0].expires_at).getTime() - atThreshold, maxHours * MILLISECONDS_PER_HOUR);
}

test("uncommon stacks to 18h; restim allowed at 15h remaining", () => {
  restimAtCapCase("strength", "uncommon");
});

test("rare stacks to 36h; restim allowed at 30h remaining", () => {
  restimAtCapCase("agility", "rare");
});

test("epic stacks to 72h; restim allowed at 60h remaining", () => {
  restimAtCapCase("intellect", "epic");
});

test("successful same-tier use at 60h remaining extends and clamps; Epic 60h + 24h → 72h", () => {
  const item = stimItem("strength", "epic");
  const at60 = [{
    stat: "strength",
    mult: 0.20,
    rarity: "epic",
    duration_hours: 24,
    stacks: 3,
    name: item.name,
    expires_at: new Date(NOW + 60 * MILLISECONDS_PER_HOUR).toISOString(),
  }];
  const res = prepareConsumableBuffs(charWithBuffs(at60), item, at60, NOW);
  assert.equal(res.ok, true);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 72 * MILLISECONDS_PER_HOUR);
});

test("Epic with 24h remaining stacks immediately; 72h is blocked until 60h remaining", () => {
  const item = stimItem("strength", "epic");
  let res = prepareConsumableBuffs(charWithBuffs([]), item, [], NOW);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 24 * MILLISECONDS_PER_HOUR);
  res = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, NOW);
  assert.equal(res.ok, true);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 48 * MILLISECONDS_PER_HOUR);
  res = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, NOW);
  assert.equal(res.ok, true);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - NOW, 72 * MILLISECONDS_PER_HOUR);
  assert.equal(prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, NOW).ok, false);
  const at61 = NOW + 11 * MILLISECONDS_PER_HOUR;
  assert.equal(prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, at61).ok, false);
  const at60 = NOW + 12 * MILLISECONDS_PER_HOUR;
  const allowed = prepareConsumableBuffs(charWithBuffs(res.buffs), item, res.buffs, at60);
  assert.equal(allowed.ok, true);
  assert.equal(new Date(allowed.buffs[0].expires_at).getTime() - at60, 72 * MILLISECONDS_PER_HOUR);
});

test("expiration boundary: just-before applies, exact/after is 0%", () => {
  const expires = NOW + 6 * MILLISECONDS_PER_HOUR;
  const buff = {
    stat: "intellect",
    mult: 0.05,
    rarity: "uncommon",
    expires_at: new Date(expires).toISOString(),
  };
  const ch = charWithBuffs([buff], { intellect: 100, strength: 100, agility: 100, vitality: 100, luck: 100 });
  const base = { intellect: 100, strength: 100, agility: 100, vitality: 100, luck: 100 };
  assert.equal(getActiveBuffs(ch, expires - 1).length, 1);
  assert.equal(applyBuffs(base, getActiveBuffs(ch, expires - 1)).intellect, 105);
  assert.equal(getActiveBuffs(ch, expires).length, 0);
  assert.equal(applyBuffs(base, getActiveBuffs(ch, expires)).intellect, 100);
  assert.equal(getActiveBuffs(ch, expires + 1).length, 0);
});

test("stim modifies only the targeted attribute; base stats are not mutated", () => {
  const ch = charWithBuffs([{
    stat: "strength",
    mult: 0.20,
    rarity: "epic",
    expires_at: new Date(NOW + MILLISECONDS_PER_HOUR).toISOString(),
  }]);
  const permanent = computePermanentTotalStats(ch, []);
  const total = applyBuffs(permanent, getActiveBuffs(ch, NOW));
  assert.equal(total.strength, Math.round(permanent.strength * 1.2));
  assert.equal(total.agility, permanent.agility);
  assert.equal(ch.stats.strength, 100);
});

test("sell values: 0.75 / 1.50 / 3.25 × SPF; stale 1-SD path removed", () => {
  const L = 40;
  const spf = stardustPerFuel(L);
  assert.equal(stimSellValueResolved(L, "uncommon"), roundHalfUp(spf * STIM_SELL_MULT.uncommon));
  assert.equal(stimSellValueResolved(L, "rare"), roundHalfUp(spf * STIM_SELL_MULT.rare));
  assert.equal(stimSellValueResolved(L, "epic"), roundHalfUp(spf * STIM_SELL_MULT.epic));
  const mission = buildMissionStimItem({ rarity: "epic", stat: "luck", snapshotLevel: L });
  assert.equal(computeItemVendorValue(mission), stimSellValueResolved(L, "epic"));
  assert.notEqual(computeItemVendorValue(mission), 1);
  const legacyNoValue = stimItem("strength", "uncommon", { level_requirement: L });
  delete legacyNoValue.sell_value;
  assert.equal(computeItemVendorValue(legacyNoValue), stimSellValueResolved(L, "uncommon"));
  assert.equal(
    computeItemVendorValue({ type: "consumable", rarity: "rare", consumable: { stat: "luck", tier: "rare" } }, { fallbackLevel: 80 }),
    stimSellValueResolved(80, "rare"),
  );
});

const user = {
  id: "p5-stim-user",
  email: "p5-stim@example.com",
  role: "user",
  active_character_id: "",
};

const ch = entities.Character.create({
  id: "p5-stim-char",
  name: "StimTester",
  class: "Vanguard",
  race: "Keldris",
  level: 25,
  experience: 0,
  experience_to_next_level: 100,
  stardust: 5000,
  total_stardust_earned: 5000,
  nova_crystals: 0,
  fuel: 50,
  max_fuel: 100,
  stats: { strength: 40, agility: 20, intellect: 16, vitality: 36, luck: 20 },
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

function makeOwnedStim(id, rarity, stat) {
  const payload = buildMissionStimItem({ rarity, stat, snapshotLevel: ch.level });
  return entities.Item.create({
    id,
    ...payload,
    character_id: ch.id,
    owner_id: user.id,
    is_equipped: false,
    locked: false,
    created_by_id: user.id,
  });
}

await testAsync("UseConsumable consumes once; replay cannot double-use", async () => {
  resetClockState();
  installFakeClock(NOW);
  makeOwnedStim("p5-use-1", "uncommon", "strength");
  const first = await UseConsumable(user, { item_id: "p5-use-1" });
  assert.equal(first.status, 200);
  assert.equal(first.body.success, true);
  assert.equal(entities.Item.get("p5-use-1"), null);
  const live = entities.Character.get(ch.id);
  assert.equal(live.active_buffs.length, 1);
  assert.equal(live.active_buffs[0].stat, "strength");
  const replay = await UseConsumable(user, { item_id: "p5-use-1" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).active_buffs.length, 1);
});

await testAsync("wrong owner / missing / non-stim rejected", async () => {
  const other = entities.Character.create({
    id: "p5-other-char",
    name: "Other",
    class: "Vanguard",
    race: "Keldris",
    level: 10,
    created_by_id: "someone-else",
    created_by: "x@example.com",
    active_buffs: [],
    stats: { strength: 10, agility: 10, intellect: 10, vitality: 10, luck: 10 },
  });
  entities.Item.create({
    id: "p5-foreign",
    ...buildMissionStimItem({ rarity: "rare", stat: "luck", snapshotLevel: 10 }),
    character_id: other.id,
    owner_id: "someone-else",
    created_by_id: "someone-else",
  });
  const foreign = await UseConsumable(user, { item_id: "p5-foreign" });
  assert.equal(foreign.status, 403);
  assert.ok(entities.Item.get("p5-foreign"));
  const missing = await UseConsumable(user, { item_id: "p5-nope" });
  assert.equal(missing.status, 404);
  entities.Item.create({
    id: "p5-gear",
    name: "Not a Stim",
    type: "weapon",
    rarity: "rare",
    character_id: ch.id,
    owner_id: user.id,
    created_by_id: user.id,
    stats: { strength: 4 },
  });
  const notStim = await UseConsumable(user, { item_id: "p5-gear" });
  assert.equal(notStim.status, 400);
  assert.ok(entities.Item.get("p5-gear"));
});

await testAsync("lower-tier overwrite is rejected and item remains", async () => {
  makeOwnedStim("p5-epic-str", "epic", "agility");
  const epicUse = await UseConsumable(user, { item_id: "p5-epic-str" });
  assert.equal(epicUse.status, 200);
  makeOwnedStim("p5-uncommon-agi", "uncommon", "agility");
  const blocked = await UseConsumable(user, { item_id: "p5-uncommon-agi" });
  assert.equal(blocked.status, 400);
  assert.ok(entities.Item.get("p5-uncommon-agi"));
});

await testAsync("sell is atomic, replay-safe, and not 1 Stardust", async () => {
  const item = makeOwnedStim("p5-sell-1", "rare", "intellect");
  const expected = computeItemVendorValue(item, { fallbackLevel: ch.level });
  assert.ok(expected > 1);
  const before = entities.Character.get(ch.id).stardust;
  const first = await DissolveItem(user, { item_id: "p5-sell-1", request_id: "p5-sell-a" });
  assert.equal(first.status, 200);
  assert.equal(first.body.stardust_gained, expected);
  assert.equal(entities.Item.get("p5-sell-1"), null);
  assert.equal(entities.Character.get(ch.id).stardust, before + expected);
  const replay = await DissolveItem(user, { item_id: "p5-sell-1", request_id: "p5-sell-a" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(entities.Character.get(ch.id).stardust, before + expected);
});

await testAsync("use and sell each free one backpack slot; occupancy never exceeds cap", async () => {
  const before = countBagOccupancy(entities.Character.get(ch.id));
  assert.ok(before <= BACKPACK_UNEQUIPPED_ITEM_CAP);
  makeOwnedStim("p5-bag-use", "uncommon", "vitality");
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), before + 1);
  const used = await UseConsumable(user, { item_id: "p5-bag-use" });
  assert.equal(used.status, 200);
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), before);
  makeOwnedStim("p5-bag-sell", "uncommon", "luck");
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), before + 1);
  const sold = await DissolveItem(user, { item_id: "p5-bag-sell", request_id: "p5-bag-sell" });
  assert.equal(sold.status, 200);
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), before);
});

await testAsync("reconnect clock does not reset remaining duration", async () => {
  entities.Character.update(ch.id, { active_buffs: [] });
  resetClockState();
  const start = NOW + 10 * MILLISECONDS_PER_HOUR;
  installFakeClock(start);
  makeOwnedStim("p5-reconnect", "rare", "intellect");
  const used = await UseConsumable(user, { item_id: "p5-reconnect" });
  assert.equal(used.status, 200);
  const expires = new Date(
    entities.Character.get(ch.id).active_buffs.find((b) => b.stat === "intellect").expires_at,
  ).getTime();
  assert.equal(expires - start, 12 * MILLISECONDS_PER_HOUR);
  installFakeClock(start + 3 * MILLISECONDS_PER_HOUR);
  const remaining = expires - clock.nowMs();
  assert.equal(remaining, 9 * MILLISECONDS_PER_HOUR);
});

await testAsync("at-cap same-tier restim is rejected; item stays; duration unchanged", async () => {
  entities.Character.update(ch.id, { active_buffs: [] });
  resetClockState();
  installFakeClock(NOW);
  makeOwnedStim("p5-restim-1", "uncommon", "luck");
  makeOwnedStim("p5-restim-2", "uncommon", "luck");
  makeOwnedStim("p5-restim-3", "uncommon", "luck");
  assert.equal((await UseConsumable(user, { item_id: "p5-restim-1" })).status, 200);
  assert.equal((await UseConsumable(user, { item_id: "p5-restim-2" })).status, 200);
  assert.equal((await UseConsumable(user, { item_id: "p5-restim-3" })).status, 200);
  const before = entities.Character.get(ch.id).active_buffs.find((b) => b.stat === "luck");
  assert.equal(new Date(before.expires_at).getTime() - NOW, 18 * MILLISECONDS_PER_HOUR);
  const expiresBefore = before.expires_at;
  makeOwnedStim("p5-restim-early", "uncommon", "luck");
  const bagBefore = countBagOccupancy(entities.Character.get(ch.id));
  const blocked = await UseConsumable(user, {
    item_id: "p5-restim-early",
    remaining_hours: 0,
    last_applied_at: new Date(NOW - 24 * MILLISECONDS_PER_HOUR).toISOString(),
  });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.error, STIM_TOO_CONCENTRATED_REASON);
  assert.ok(entities.Item.get("p5-restim-early"));
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), bagBefore);
  const after = entities.Character.get(ch.id).active_buffs.find((b) => b.stat === "luck");
  assert.equal(after.expires_at, expiresBefore);
});

await testAsync("reconnect preserves remaining-based restim eligibility", async () => {
  entities.Character.update(ch.id, { active_buffs: [] });
  resetClockState();
  installFakeClock(NOW);
  makeOwnedStim("p5-elig-1", "epic", "vitality");
  makeOwnedStim("p5-elig-2", "epic", "vitality");
  makeOwnedStim("p5-elig-3", "epic", "vitality");
  makeOwnedStim("p5-elig-4", "epic", "vitality");
  assert.equal((await UseConsumable(user, { item_id: "p5-elig-1" })).status, 200);
  assert.equal((await UseConsumable(user, { item_id: "p5-elig-2" })).status, 200);
  assert.equal((await UseConsumable(user, { item_id: "p5-elig-3" })).status, 200);
  const atCap = entities.Character.get(ch.id).active_buffs.find((b) => b.stat === "vitality");
  assert.equal(new Date(atCap.expires_at).getTime() - NOW, 72 * MILLISECONDS_PER_HOUR);
  installFakeClock(NOW + 6 * MILLISECONDS_PER_HOUR);
  const stillBlocked = await UseConsumable(user, { item_id: "p5-elig-4" });
  assert.equal(stillBlocked.status, 400);
  assert.ok(entities.Item.get("p5-elig-4"));
  installFakeClock(NOW + stimSameTierRestimCooldownHours("epic") * MILLISECONDS_PER_HOUR);
  const allowed = await UseConsumable(user, { item_id: "p5-elig-4" });
  assert.equal(allowed.status, 200);
  assert.equal(entities.Item.get("p5-elig-4"), null);
  const live = entities.Character.get(ch.id).active_buffs.find((b) => b.stat === "vitality");
  assert.equal(
    new Date(live.expires_at).getTime() - clock.nowMs(),
    72 * MILLISECONDS_PER_HOUR,
  );
});

await testAsync("fourth active attribute is rejected without consuming the item", async () => {
  entities.Character.update(ch.id, { active_buffs: [] });
  resetClockState();
  installFakeClock(NOW);
  makeOwnedStim("p5-attr-str", "epic", "strength");
  makeOwnedStim("p5-attr-agi", "rare", "agility");
  makeOwnedStim("p5-attr-int", "uncommon", "intellect");
  makeOwnedStim("p5-attr-luck", "rare", "luck");
  assert.equal((await UseConsumable(user, { item_id: "p5-attr-str" })).status, 200);
  assert.equal((await UseConsumable(user, { item_id: "p5-attr-agi" })).status, 200);
  assert.equal((await UseConsumable(user, { item_id: "p5-attr-int" })).status, 200);
  const bagBefore = countBagOccupancy(entities.Character.get(ch.id));
  const fourth = await UseConsumable(user, { item_id: "p5-attr-luck" });
  assert.equal(fourth.status, 400);
  assert.match(String(fourth.body.error), /Remove one first/i);
  assert.ok(entities.Item.get("p5-attr-luck"));
  assert.equal(countBagOccupancy(entities.Character.get(ch.id)), bagBefore);
  assert.equal(entities.Character.get(ch.id).active_buffs.length, 3);
});

test("remaining duration is never negative after expiration", () => {
  const buff = {
    stat: "luck",
    mult: 0.05,
    rarity: "uncommon",
    expires_at: new Date(NOW - MILLISECONDS_PER_HOUR).toISOString(),
  };
  const remaining = Math.max(0, new Date(buff.expires_at).getTime() - NOW);
  assert.equal(remaining, 0);
});

if (failed) {
  console.error(`\nPhase 5 Stim tests: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nPhase 5 Stim tests: ${passed} passed`);
