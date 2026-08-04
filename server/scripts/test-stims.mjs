/**
 * Stim system tests — qualities, stacking, refresh, rarity replace, attribute apply.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-stims.mjs
 */
import assert from "node:assert/strict";
import {
  CONSUMABLE_TIERS,
  CONSUMABLES,
  MAX_BUFF_STACKS,
  MAX_ACTIVE_STAT_TYPES,
  STIM_YEARN_MESSAGE,
  prepareConsumableBuffs,
  dismissActiveBuff,
  stimRefreshRemainingMs,
  stimMaxDurationMs,
} from "../src/shared/economyFormulas.js";
import {
  applyBuffs,
  getActiveBuffs,
  prepareConsumableBuffs as webPrepare,
  CONSUMABLE_TIERS as WEB_TIERS,
} from "../../src/lib/gameData.js";
import {
  computePermanentTotalStats,
  computeTotalStats,
  getEffectiveAttribute,
} from "../../src/lib/statEngine.js";

const HOUR = 3600 * 1000;

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

function stimItem(stat, rarity) {
  const tier = CONSUMABLE_TIERS[rarity];
  return {
    name: `${tier.label} ${stat.charAt(0).toUpperCase() + stat.slice(1)} Stim`,
    type: "consumable",
    rarity,
    consumable: {
      stat,
      mult: tier.mult,
      duration_hours: tier.duration_hours,
      tier: rarity,
    },
  };
}

function charWithBuffs(buffs, stats = { intellect: 300, strength: 100, agility: 100, vitality: 100, luck: 100 }) {
  return { stats, active_buffs: buffs, race: null, class: "Technomancer", level: 10 };
}

console.log("\nStim system tests\n");

test("tier bonuses and durations", () => {
  assert.equal(CONSUMABLE_TIERS.uncommon.mult, 0.05);
  assert.equal(CONSUMABLE_TIERS.rare.mult, 0.1);
  assert.equal(CONSUMABLE_TIERS.epic.mult, 0.2);
  assert.equal(CONSUMABLE_TIERS.uncommon.duration_hours, 6);
  assert.equal(CONSUMABLE_TIERS.rare.duration_hours, 12);
  assert.equal(CONSUMABLE_TIERS.epic.duration_hours, 24);
  assert.equal(stimMaxDurationMs(6), 18 * HOUR);
  assert.equal(stimMaxDurationMs(12), 36 * HOUR);
  assert.equal(stimMaxDurationMs(24), 72 * HOUR);
  assert.equal(stimRefreshRemainingMs(6), 15 * HOUR);
  assert.equal(stimRefreshRemainingMs(12), 30 * HOUR);
  assert.equal(stimRefreshRemainingMs(24), 60 * HOUR);
});

test("no Common or Legendary stims generated", () => {
  assert.ok(!CONSUMABLE_TIERS.common);
  assert.ok(!CONSUMABLE_TIERS.legendary);
  assert.ok(CONSUMABLES.every((c) => ["uncommon", "rare", "epic"].includes(c.rarity)));
  assert.ok(CONSUMABLES.every((c) => c.consumable.stat !== "all"));
  assert.deepEqual(Object.keys(WEB_TIERS).sort(), ["epic", "rare", "uncommon"]);
});

test("first use activates with base duration + stacks=1", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const item = stimItem("intellect", "epic");
  const res = prepareConsumableBuffs(charWithBuffs([]), item, [], now);
  assert.equal(res.ok, true);
  assert.equal(res.buffs.length, 1);
  assert.equal(res.buffs[0].mult, 0.2);
  assert.equal(res.buffs[0].stacks, 1);
  assert.equal(res.buffs[0].rarity, "epic");
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - now, 24 * HOUR);
});

test("same rarity stacks duration only — bonus stays +20%", () => {
  const now = Date.now();
  const item = stimItem("intellect", "epic");
  let ch = charWithBuffs([]);
  let res = prepareConsumableBuffs(ch, item, undefined, now);
  ch = charWithBuffs(res.buffs);
  res = prepareConsumableBuffs(ch, item, undefined, now + HOUR); // 23h left + 24 = 47
  assert.equal(res.ok, true);
  assert.equal(res.buffs.length, 1);
  assert.equal(res.buffs[0].mult, 0.2);
  assert.equal(res.buffs[0].stacks, 2);
  const rem = new Date(res.buffs[0].expires_at).getTime() - (now + HOUR);
  assert.equal(rem, 47 * HOUR);
  ch = charWithBuffs(res.buffs);
  res = prepareConsumableBuffs(ch, item, undefined, now + HOUR);
  assert.equal(res.ok, true);
  assert.equal(res.buffs[0].stacks, 3);
  assert.equal(res.buffs[0].mult, 0.2);
  assert.ok(new Date(res.buffs[0].expires_at).getTime() - (now + HOUR) <= 72 * HOUR);
});

test("max stack refresh thresholds", () => {
  const item = stimItem("intellect", "epic");
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  // At 62h remaining (>60): block
  const at62 = [
    {
      stat: "intellect",
      mult: 0.2,
      rarity: "epic",
      duration_hours: 24,
      stacks: 3,
      name: item.name,
      expires_at: new Date(now + 62 * HOUR).toISOString(),
    },
  ];
  let res = prepareConsumableBuffs(charWithBuffs(at62), item, at62, now);
  assert.equal(res.ok, false);
  assert.equal(res.reason, STIM_YEARN_MESSAGE);

  // At 58h remaining (<=60): refresh to 72h
  const at58 = [
    {
      ...at62[0],
      expires_at: new Date(now + 58 * HOUR).toISOString(),
    },
  ];
  res = prepareConsumableBuffs(charWithBuffs(at58), item, at58, now);
  assert.equal(res.ok, true);
  assert.equal(res.buffs[0].mult, 0.2);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - now, 72 * HOUR);
});

test("uncommon/rare refresh thresholds", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const u = stimItem("luck", "uncommon");
  const at16 = [
    {
      stat: "luck",
      mult: 0.05,
      rarity: "uncommon",
      duration_hours: 6,
      stacks: 3,
      name: u.name,
      expires_at: new Date(now + 16 * HOUR).toISOString(),
    },
  ];
  assert.equal(prepareConsumableBuffs(charWithBuffs(at16), u, at16, now).ok, false);
  const at15 = [{ ...at16[0], expires_at: new Date(now + 15 * HOUR).toISOString() }];
  const ur = prepareConsumableBuffs(charWithBuffs(at15), u, at15, now);
  assert.equal(ur.ok, true);
  assert.equal(new Date(ur.buffs[0].expires_at).getTime() - now, 18 * HOUR);

  const r = stimItem("vitality", "rare");
  const at31 = [
    {
      stat: "vitality",
      mult: 0.1,
      rarity: "rare",
      duration_hours: 12,
      stacks: 3,
      name: r.name,
      expires_at: new Date(now + 31 * HOUR).toISOString(),
    },
  ];
  assert.equal(prepareConsumableBuffs(charWithBuffs(at31), r, at31, now).ok, false);
  const at30 = [{ ...at31[0], expires_at: new Date(now + 30 * HOUR).toISOString() }];
  const rr = prepareConsumableBuffs(charWithBuffs(at30), r, at30, now);
  assert.equal(rr.ok, true);
  assert.equal(new Date(rr.buffs[0].expires_at).getTime() - now, 36 * HOUR);
});

test("max 3 different attributes; duration stacks do not take slots", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  let buffs = [];
  for (const stat of ["intellect", "vitality", "luck"]) {
    const res = prepareConsumableBuffs(charWithBuffs(buffs), stimItem(stat, "epic"), buffs, now);
    assert.equal(res.ok, true);
    buffs = res.buffs;
  }
  assert.equal(buffs.length, 3);
  // Stack duration on intellect — still 3 slots
  const stacked = prepareConsumableBuffs(charWithBuffs(buffs), stimItem("intellect", "epic"), buffs, now);
  assert.equal(stacked.ok, true);
  assert.equal(stacked.buffs.length, 3);
  // Fourth attribute blocked
  const fourth = prepareConsumableBuffs(charWithBuffs(buffs), stimItem("strength", "rare"), buffs, now);
  assert.equal(fourth.ok, false);
  assert.match(fourth.reason, /Remove one first/i);
});

test("higher rarity replaces lower and discards old duration", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const rare = stimItem("luck", "rare");
  let res = prepareConsumableBuffs(charWithBuffs([]), rare, [], now);
  // Advance so rare has 31h left conceptually — set stacks and long expiry
  const withRare = [
    {
      ...res.buffs[0],
      stacks: 3,
      expires_at: new Date(now + 31 * HOUR).toISOString(),
    },
  ];
  const epic = stimItem("luck", "epic");
  res = prepareConsumableBuffs(charWithBuffs(withRare), epic, withRare, now);
  assert.equal(res.ok, true);
  assert.equal(res.buffs[0].rarity, "epic");
  assert.equal(res.buffs[0].mult, 0.2);
  assert.equal(res.buffs[0].stacks, 1);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - now, 24 * HOUR);
});

test("lower rarity blocked; ok:false means item not consumed by caller", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const epic = stimItem("luck", "epic");
  let res = prepareConsumableBuffs(charWithBuffs([]), epic, [], now);
  const lower = prepareConsumableBuffs(charWithBuffs(res.buffs), stimItem("luck", "rare"), res.buffs, now);
  assert.equal(lower.ok, false);
  assert.match(lower.reason, /stronger/i);
});

test("manual dismiss frees slot and discards duration", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const buffs = [
    {
      stat: "intellect",
      mult: 0.2,
      rarity: "epic",
      stacks: 3,
      name: "Epic Intellect Stim",
      expires_at: new Date(now + 58 * HOUR).toISOString(),
    },
    {
      stat: "luck",
      mult: 0.1,
      rarity: "rare",
      stacks: 1,
      name: "Rare Luck Stim",
      expires_at: new Date(now + 12 * HOUR).toISOString(),
    },
  ];
  const res = dismissActiveBuff(charWithBuffs(buffs), { stat: "intellect", expires_at: buffs[0].expires_at, name: buffs[0].name }, now);
  assert.equal(res.ok, true);
  assert.equal(res.buffs.length, 1);
  assert.equal(res.buffs[0].stat, "luck");
});

test("expiration removes effect from getActiveBuffs", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const ch = charWithBuffs([
    {
      stat: "intellect",
      mult: 0.2,
      rarity: "epic",
      expires_at: new Date(now - 1000).toISOString(),
      name: "Epic Intellect Stim",
    },
  ]);
  assert.equal(getActiveBuffs(ch, now).length, 0);
});

test("persistence via expires_at — simulated logout/reconnect", () => {
  const activate = Date.parse("2026-08-01T12:00:00.000Z");
  const item = stimItem("vitality", "rare");
  const res = prepareConsumableBuffs(charWithBuffs([]), item, [], activate);
  const later = activate + 5 * HOUR;
  const active = getActiveBuffs(charWithBuffs(res.buffs), later);
  assert.equal(active.length, 1);
  assert.ok(new Date(active[0].expires_at).getTime() - later === 7 * HOUR);
});

test("300 Intellect + Epic Stim = 360; remove returns 300", () => {
  const now = Date.now();
  const permanent = { intellect: 300, strength: 10, agility: 10, vitality: 10, luck: 10 };
  const ch = charWithBuffs([], permanent);
  assert.equal(computePermanentTotalStats(ch, []).intellect, 300);
  assert.equal(computeTotalStats(ch, []).intellect, 300);

  const applied = prepareConsumableBuffs(ch, stimItem("intellect", "epic"), undefined, now);
  const buffed = { ...ch, active_buffs: applied.buffs };
  assert.equal(computePermanentTotalStats(buffed, []).intellect, 300);
  assert.equal(computeTotalStats(buffed, []).intellect, 360);
  assert.equal(getEffectiveAttribute(buffed, [], "intellect"), 360);

  const cleared = dismissActiveBuff(buffed, { stat: "intellect" }, now);
  const after = { ...buffed, active_buffs: cleared.buffs };
  assert.equal(computePermanentTotalStats(after, []).intellect, 300);
  assert.equal(computeTotalStats(after, []).intellect, 300);
});

test("applyBuffs is final multiplier — gear included before stim", () => {
  const stats = applyBuffs({ intellect: 250 }, [{ stat: "intellect", mult: 0.2 }]);
  assert.equal(stats.intellect, 300);
  const ch = {
    stats: { intellect: 200, strength: 0, agility: 0, vitality: 0, luck: 0 },
    active_buffs: [
      {
        stat: "intellect",
        mult: 0.2,
        expires_at: new Date(Date.now() + HOUR).toISOString(),
      },
    ],
    race: null,
  };
  const gear = [{ stats: { intellect: 100 } }];
  // permanent 300, stim ×1.2 = 360
  assert.equal(computePermanentTotalStats(ch, gear).intellect, 300);
  assert.equal(computeTotalStats(ch, gear).intellect, 360);
});

test("web prepareConsumableBuffs stays in sync on yearn message", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const item = stimItem("intellect", "epic");
  const at62 = [
    {
      stat: "intellect",
      mult: 0.2,
      rarity: "epic",
      duration_hours: 24,
      stacks: 3,
      name: item.name,
      expires_at: new Date(now + 62 * HOUR).toISOString(),
    },
  ];
  const res = webPrepare(charWithBuffs(at62), item, at62, now);
  assert.equal(res.ok, false);
  assert.equal(res.reason, STIM_YEARN_MESSAGE);
});

test("MAX caps exported", () => {
  assert.equal(MAX_BUFF_STACKS, 3);
  assert.equal(MAX_ACTIVE_STAT_TYPES, 3);
});

test("forged item mult/duration clamped to rarity tier", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const forged = {
    name: "Forged Rare Strength Stim",
    type: "consumable",
    rarity: "rare",
    consumable: {
      stat: "strength",
      mult: 0.99,
      duration_hours: 999,
      tier: "rare",
    },
  };
  const res = prepareConsumableBuffs(charWithBuffs([]), forged, [], now);
  assert.equal(res.ok, true);
  assert.equal(res.buffs[0].mult, 0.1);
  assert.equal(res.buffs[0].duration_hours, 12);
  assert.equal(new Date(res.buffs[0].expires_at).getTime() - now, 12 * HOUR);
});

test("Common/Legendary rarity rejected; invalid attribute rejected", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const common = {
    name: "Common Strength Stim",
    type: "consumable",
    rarity: "common",
    consumable: { stat: "strength", mult: 0.05, duration_hours: 6, tier: "common" },
  };
  // resolveStimRarity maps common → uncommon (legacy), then clamps to uncommon tier
  const mapped = prepareConsumableBuffs(charWithBuffs([]), common, [], now);
  assert.equal(mapped.ok, true);
  assert.equal(mapped.buffs[0].rarity, "uncommon");
  assert.equal(mapped.buffs[0].mult, 0.05);

  const badStat = {
    name: "Epic Crit Stim",
    type: "consumable",
    rarity: "epic",
    consumable: { stat: "crit_chance", mult: 0.2, duration_hours: 24, tier: "epic" },
  };
  assert.equal(prepareConsumableBuffs(charWithBuffs([]), badStat, [], now).ok, false);

  const webForged = webPrepare(
    charWithBuffs([]),
    {
      name: "x",
      type: "consumable",
      rarity: "epic",
      consumable: { stat: "luck", mult: 0.5, duration_hours: 100, tier: "epic" },
    },
    [],
    now,
  );
  assert.equal(webForged.ok, true);
  assert.equal(webForged.buffs[0].mult, 0.2);
  assert.equal(webForged.buffs[0].duration_hours, 24);
});

test("unstimulated attributes unchanged", () => {
  const now = Date.now();
  const ch = charWithBuffs([], {
    strength: 100,
    agility: 80,
    intellect: 60,
    vitality: 90,
    luck: 40,
  });
  const res = prepareConsumableBuffs(ch, stimItem("strength", "rare"), undefined, now);
  const buffed = { ...ch, active_buffs: res.buffs };
  assert.equal(computeTotalStats(buffed, []).strength, 110);
  assert.equal(computeTotalStats(buffed, []).agility, 80);
  assert.equal(computeTotalStats(buffed, []).intellect, 60);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
