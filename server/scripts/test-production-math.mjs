/**
 * Phase 0 production-math tests.
 * Independent of live gameplay. Does not rewrite existing gameplay tests.
 *
 * Run: node --import ./server/scripts/register-src-alias.mjs server/scripts/test-production-math.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "@/lib/productionMath";

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

function rround(x) {
  return Math.trunc(Math.floor(x + 0.5));
}

function t18MissionXpf(L) {
  return 10 + 0.5 * (L - 1) + 0.032 * (L ** 1.67 - 1);
}

function t18Avgfuel(L) {
  for (const [hi, v] of [
    [2, 0.375], [3, 0.5], [4, 0.75], [5, 0.875], [7, 1], [8, 1.5],
    [10, 1.75], [12, 3.75], [14, 5], [15, 6.25], [17, 8.75], [18, 10], [19, 11.25],
  ]) if (L <= hi) return v;
  return 12.5;
}

function t18Empl(L) {
  return 1.67985 + 0.239507 * L ** 0.662355 + 18.3178 * (L / 500) ** 4;
}

function t18Xpnext(L) {
  return Math.max(1, rround(t18Avgfuel(L) * t18MissionXpf(L) * 0.85 * t18Empl(L) / 0.46));
}

function t18Sdpf(L) {
  return rround(50 + 1.009 * (L - 1) ** 1.625 * (1 + (L / 166.66) ** 3.055));
}

function t18Gearbase(L) {
  return rround(1.4079 * L + 2.2988 * Math.sqrt(L) + 8.277);
}

function t18Attrcost(n) {
  const c = [0.00263490059, -0.0530391365, 0.411171165, -0.985347882, -0.461561195, 7.41094646];
  const z = Math.log(Math.max(1, n) + 20);
  let v = 0;
  for (const q of c) v = v * z + q;
  return Math.max(1, rround(Math.exp(v)));
}

function t18Outgoing(L) {
  if (L <= 1) return 0.3;
  if (L <= 10) return 0.3 + (L - 1) * (0.05 / 9);
  if (L <= 15) return 0.35 + (L - 10) * (0.15 / 5);
  if (L <= 20) return 0.5 + (L - 15) * (2.0 / 5);
  if (L <= 50) return 2.5 + (L - 20) * (3.5 / 30);
  if (L <= 100) return 6 + (L - 50) * (4 / 50);
  if (L <= 200) return 10 + (L - 100) * (2 / 100);
  return 12;
}

function t18Reflex(L) {
  if (L <= 400) return 0.225;
  if (L >= 750) return 0.325;
  return 0.225 + (L - 400) * (0.1 / 350);
}

function finite(x) {
  return Number.isFinite(x);
}

const STRESS = M.STRESS_LEVELS;

console.log("\nPhase 0 production math\n");

test("module is certified, Phase-1 live for progression, and does not mention GES", () => {
  assert.equal(M.MODULE_STATUS, "CERTIFIED FORMULA — PHASE 1 LIVE FOR PROGRESSION");
  assert.equal(typeof M.expectedPlayerAttributes, "function");
  assert.equal(M.GES, undefined);
  assert.equal(M.gesAutoEquip, undefined);
});

test("rounding: rround half-up vs half-even at .5", () => {
  assert.equal(M.roundHalfUp(1.5), 2);
  assert.equal(M.roundHalfUp(2.5), 3);
  assert.equal(M.roundHalfEven(1.5), 2);
  assert.equal(M.roundHalfEven(2.5), 2);
  assert.equal(M.roundHalfUp(50 + 2.5 * 1 + 0.008), 53);
});

test("Fuel/Nova quantization", () => {
  assert.equal(M.quantizeFuel(1.12), 1);
  assert.equal(M.quantizeFuel(1.13), 1.25);
  assert.equal(M.quantizeNova(1.24), 1);
  assert.equal(M.quantizeNova(1.25), 1.5);
});

test("mission_xpf exact T18, no ×10", () => {
  for (const L of STRESS) {
    assert.equal(M.missionXpPerFuel(L), t18MissionXpf(L));
  }
  assert.ok(M.missionXpPerFuel(1) < 20, "must be design units, not storage ×10");
});

test("avgfuel discrete table", () => {
  for (const L of [...STRESS, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 16, 19, 21, 22]) {
    assert.equal(M.averageMissionFuel(L), t18Avgfuel(L));
  }
});

test("xpToNext exact T18 architecture through L2500", () => {
  for (const L of STRESS) {
    assert.equal(M.xpToNext(L), t18Xpnext(L), `L${L}`);
  }
});

test("xpToNext monotone, finite, no hidden cap", () => {
  let prev = M.xpToNext(1);
  for (let L = 2; L <= 2500; L++) {
    const v = M.xpToNext(L);
    assert.ok(finite(v) && v >= 1 && v < Number.MAX_SAFE_INTEGER, `L${L}=${v}`);
    assert.ok(v >= prev, `L${L} ${v} < ${prev}`);
    prev = v;
  }
  evidence.push(`xpToNext L1000=${M.xpToNext(1000)} L2500=${M.xpToNext(2500)}`);
});

test("StardustPerFuel exact T18", () => {
  for (const L of STRESS) {
    assert.equal(M.stardustPerFuel(L), t18Sdpf(L), `L${L}`);
  }
});

test("StardustPerFuel monotone and not multiplied by XP scale", () => {
  let prev = M.stardustPerFuel(1);
  assert.equal(prev, 50);
  for (let L = 2; L <= 2500; L++) {
    const v = M.stardustPerFuel(L);
    assert.ok(finite(v) && v >= prev);
    prev = v;
  }
  evidence.push(`SPF L1000=${M.stardustPerFuel(1000)} L2500=${M.stardustPerFuel(2500)}`);
});

test("gear base budget exact T18", () => {
  for (const L of STRESS) assert.equal(M.gearBaseStatBudget(L), t18Gearbase(L), `L${L}`);
});

test("Legendary budget multiplier is 1.50 not 1.35", () => {
  assert.equal(M.GEAR_RARITY_BUDGET_MULT.legendary, 1.5);
  assert.equal(M.gearRarityBudgetMultiplier("legendary"), 1.5);
  assert.equal(M.gearSlotMultiplier("accessory"), 1);
  assert.equal(M.gearSlotMultiplier("weapon"), 1.2);
  assert.equal(M.gearSlotMultiplier("ship_module"), 1.2);
});

test("attribute purchase cost closed form", () => {
  for (const n of [1, 2, 10, 50, 100, 650, 1000, 2500]) {
    assert.equal(M.attributePurchaseCost(n), t18Attrcost(n), `n=${n}`);
    assert.ok(finite(M.attributePurchaseCost(n)));
  }
});

test("HP uses half-even combat ROUND", () => {
  assert.equal(M.maxHp(0), 50);
  assert.equal(M.maxHp(10), rround(50 + 25 + 0.8) || M.roundHalfEven(50 + 25 + 0.8));
  assert.equal(M.maxHp(14), M.roundHalfEven(50 + 2.5 * 14 + 0.008 * 196));
});

test("raw attack has no variance", () => {
  const raw = M.rawStandardAttack(15);
  assert.equal(raw, 15 + 0.0032 * 15 ** 1.727);
  assert.equal(M.standardAttackWithVariance(15, 1.1), raw * 1.1);
});

test("generic derived-stat + Crit specialization", () => {
  const L = 100;
  const fm = 700;
  const attr = 350;
  const generic = Math.min(0.25 * Math.min(1, (attr / fm) ** 1.2), 0.25 * Math.min(1, 1 ** 0.65), 0.25);
  assert.ok(Math.abs(M.derivedStat(L, attr, 0.25) - generic) < 1e-12);
  const critFm = fm * 1.55;
  const crit = Math.min(0.3 * Math.min(1, (attr / critFm) ** 1.8), 0.3 * Math.min(1, 1), 0.3);
  assert.ok(Math.abs(M.critChance(L, attr) - crit) < 1e-12);
  assert.ok(M.critChance(800, 1e9) <= 0.3 + 1e-12);
  assert.ok(M.dodgeChance(800, 1e9, "Might") <= 0.25 + 1e-12);
});

test("Crit/Dodge infinite safety", () => {
  for (const L of STRESS) {
    const c = M.critChance(L, 50 + L * 4);
    const d = M.dodgeChance(L, 50 + L * 4, "Reflex");
    assert.ok(finite(c) && c >= 0 && c <= 0.3);
    assert.ok(finite(d) && d >= 0 && d <= 0.25);
  }
});

test("three-channel resistances, no self-resist", () => {
  const attrs = [40, 10, 30, 20, 10];
  const m = M.resistances(100, attrs, "Might");
  const r = M.resistances(100, attrs, "Reflex");
  const t = M.resistances(100, attrs, "Tech");
  assert.equal(m.might, 0);
  assert.equal(r.reflex, 0);
  assert.equal(t.tech, 0);
  assert.ok(m.reflex > 0 && m.tech > 0);
  assert.ok(r.might > 0 && r.tech > 0);
  assert.ok(t.might > 0 && t.reflex > 0);
  assert.ok(m.reflex <= 0.3 && t.might <= 0.3);
});

test("Reflex conversion preserves plateaus and matures at 32.5%", () => {
  for (const L of [1, 10, 100, 300, 394]) {
    assert.ok(Math.abs(M.reflexAgiConversion(L) - 0.225) < 1e-12, `L${L}`);
  }
  for (const L of [756, 800, 1000, 2500]) {
    assert.ok(Math.abs(M.reflexAgiConversion(L) - 0.325) < 1e-12, `L${L}`);
  }
  const mid = M.reflexAgiConversion(500);
  assert.ok(Math.abs(mid - t18Reflex(500)) < 1e-12);
  let maxPct = 0;
  for (const L of [1, 400, 410, 450, 500, 575, 650, 740, 750, 800, 1000, 2500]) {
    const e = (100 * Math.abs(M.reflexAgiConversion(L) - t18Reflex(L))) / t18Reflex(L);
    if (e > maxPct) maxPct = e;
  }
  evidence.push(`reflex conversion max checkpoint % error ${maxPct.toFixed(4)}`);
  assert.ok(maxPct <= 0.5, `reflex error ${maxPct}`);
});

test("Mission enemy outgoing matches certified knots and asymptotes at 12", () => {
  for (const L of STRESS) {
    const e = (100 * Math.abs(M.missionEnemyOutgoingMultiplier(L) - t18Outgoing(L))) / t18Outgoing(L);
    assert.ok(e < 1e-9, `L${L} err ${e}`);
  }
  assert.equal(M.missionEnemyOutgoingMultiplier(200), 12);
  assert.equal(M.missionEnemyOutgoingMultiplier(2500), 12);
});

test("Mission enemy base ramp endpoints", () => {
  assert.equal(M.missionEnemyBaseDamage(1), 5);
  assert.ok(Math.abs(M.missionEnemyBaseDamage(24) - (5 + 10 * 23 / 24)) < 1e-12);
  assert.equal(M.missionEnemyBaseDamage(25), 15);
  assert.equal(M.missionEnemyBaseDamage(2500), 15);
});

test("player free attrs 35/35/20/5/5 vs enemy 35/25/20/10/10", () => {
  const p = M.freeLevelAttributes(101, 0);
  assert.equal(p.reduce((a, b) => a + b, 0), 200);
  assert.ok(p[0] > p[1] && p[3] >= p[0] - 2);
  const e = M.missionEnemyAttributes(50, 0).attributes;
  assert.equal(e.reduce((a, b) => a + b, 0), M.missionEnemyAttributeTotal(50));
  assert.notDeepEqual(M.PLAYER_FREE_ATTR_WEIGHTS, M.ENEMY_ATTR_WEIGHTS);
});

test("starting attributes", () => {
  assert.deepEqual(M.startingAttributesForArchetype("Might"), [15, 8, 6, 14, 7]);
  assert.deepEqual(M.startingAttributesForArchetype("Reflex"), [7, 15, 7, 11, 10]);
  assert.deepEqual(M.startingAttributesForArchetype("Tech"), [6, 8, 15, 13, 8]);
});

test("Mission XP/Stardust independent variance + defeat rounding", () => {
  const xp90 = M.missionXpReward({ fuel: 12.5, snapshotLevel: 40, xpVariance: 0.9 });
  const xp100 = M.missionXpReward({ fuel: 12.5, snapshotLevel: 40, xpVariance: 1 });
  const xp110 = M.missionXpReward({ fuel: 12.5, snapshotLevel: 40, xpVariance: 1.1 });
  const sd90 = M.missionStardustReward({ fuel: 12.5, snapshotLevel: 40, stardustVariance: 0.9 });
  const sd100 = M.missionStardustReward({ fuel: 12.5, snapshotLevel: 40, stardustVariance: 1 });
  const sd110 = M.missionStardustReward({ fuel: 12.5, snapshotLevel: 40, stardustVariance: 1.1 });
  assert.equal(xp90, rround(12.5 * t18MissionXpf(40) * 0.9 * 0.85 * 0.85));
  assert.equal(xp100, rround(12.5 * t18MissionXpf(40) * 1 * 0.85 * 0.85));
  assert.equal(xp110, rround(12.5 * t18MissionXpf(40) * 1.1 * 0.85 * 0.85));
  assert.equal(sd90, rround(12.5 * t18Sdpf(40) * 0.9));
  assert.equal(sd100, rround(12.5 * t18Sdpf(40) * 1));
  assert.equal(sd110, rround(12.5 * t18Sdpf(40) * 1.1));
  assert.equal(
    M.missionXpReward({ fuel: 12.5, snapshotLevel: 40, xpVariance: 1, defeated: true }),
    rround(xp100 * 0.5),
  );
  assert.equal(
    M.missionStardustReward({ fuel: 12.5, snapshotLevel: 40, stardustVariance: 1, defeated: true }),
    rround(sd100 * 0.5),
  );
  assert.ok(xp90 < xp100 && xp100 < xp110);
  assert.ok(sd90 < sd100 && sd100 < sd110);
  const mixed = M.missionXpReward({ fuel: 12.5, snapshotLevel: 40, xpVariance: 1.1 });
  const mixedSd = M.missionStardustReward({ fuel: 12.5, snapshotLevel: 40, stardustVariance: 0.9 });
  assert.equal(mixed, xp110);
  assert.equal(mixedSd, sd90);
});

test("Stardust has no XP 0.85 factors", () => {
  const sd = M.missionStardustReward({ fuel: 10, snapshotLevel: 20, stardustVariance: 1 });
  const withEff = rround(10 * t18Sdpf(20) * 0.85 * 0.85);
  assert.notEqual(sd, withEff);
});

test("Arena XP 2.125 xpf vs repo 5/7 conflict is replaced here", () => {
  for (const L of [1, 10, 50, 100, 800, 2500]) {
    assert.equal(M.arenaXpReward(L), rround(2.125 * t18MissionXpf(L)));
    assert.notEqual(M.arenaXpReward(L), rround((5 / 7) * t18MissionXpf(L)));
  }
});

test("Arena Stardust exact", () => {
  for (const L of STRESS) assert.equal(M.arenaStardustReward(L), rround(2.25 * t18Sdpf(L)));
});

test("Mining 0.03 SPF / min, no 720 cap in the primitive", () => {
  assert.equal(M.miningStardust({ snapshotLevel: 80, minutes: 10 }), 0.03 * t18Sdpf(80) * 10);
  assert.ok(M.miningStardust({ snapshotLevel: 80, minutes: 800 }) > M.miningStardust({ snapshotLevel: 80, minutes: 720 }));
});

test("Black Market price/resale order + slot premium; PvE offset excluded from resale level", () => {
  const base = t18Sdpf(40) * 7 * 1.2;
  assert.equal(M.blackMarketPrice(40, "weapon", "rare", 1), rround(base));
  assert.equal(M.blackMarketPrice(40, "weapon", "rare", 0.8), rround(base * 0.8));
  assert.equal(M.blackMarketPrice(40, "weapon", "rare", 1.2), rround(base * 1.2));
  assert.equal(M.gearResaleValue(40, "weapon", "rare"), rround(base * 0.4));
  assert.equal(M.pveHiddenStatBudgetOffset(150), 5);
  assert.equal(M.pveHiddenStatBudgetOffset(151), 6);
  assert.equal(M.pveHiddenStatBudgetOffset(191), 10);
  assert.equal(M.pveGearStatBudgetLevel(200), 210);
});

test("Stim shop/sell and level bands", () => {
  assert.equal(M.marketStimTier(19), "uncommon");
  assert.equal(M.marketStimTier(20), "rare");
  assert.equal(M.marketStimTier(49), "rare");
  assert.equal(M.marketStimTier(50), "epic");
  assert.equal(M.stimShopPrice(30, "rare"), t18Sdpf(30) * 3);
  assert.equal(M.stimSellValue(30, "rare"), t18Sdpf(30) * 1.5);
});

test("Stim stacking discrete rules", () => {
  const a = M.nextStimState({ tier: null, remainingHours: 0 }, "uncommon");
  assert.deepEqual(a, { tier: "uncommon", remainingHours: 6 });
  const b = M.nextStimState(a, "uncommon");
  assert.equal(b.remainingHours, 12);
  const c = M.nextStimState({ tier: "uncommon", remainingHours: 16 }, "uncommon");
  assert.equal(c.remainingHours, 18);
  const d = M.nextStimState(c, "rare");
  assert.deepEqual(d, { tier: "rare", remainingHours: 12 });
  const e = M.nextStimState(d, "uncommon");
  assert.deepEqual(e, d);
});

test("Mission rarity ≠ Dungeon rarity", () => {
  assert.deepEqual(M.MISSION_GEAR_RARITY_WEIGHTS, {
    common: 0.6, uncommon: 0.3, rare: 0.1, epic: 0, legendary: 0,
  });
  assert.deepEqual(M.DUNGEON_REGULAR_RARITY_WEIGHTS, {
    common: 0, uncommon: 0, rare: 0.85, epic: 0.1, legendary: 0.05,
  });
  assert.deepEqual(M.DUNGEON_BOSS_RARITY_WEIGHTS, {
    common: 0, uncommon: 0, rare: 0, epic: 0.8, legendary: 0.2,
  });
});

test("Dungeon DRU exact + XP conversion order", () => {
  assert.deepEqual([...M.DUNGEON_DRU], [60, 150, 170, 300, 340, 495, 715, 810, 1060, 1330]);
  const raw = rround(60 * 0.05 * t18MissionXpf(10) * 0.87 * 2.1);
  assert.equal(M.dungeonEncounterXpPreMultiplier(0, 0), raw);
  assert.equal(M.dungeonEncounterXp(0, 0), rround(raw * 1.25));
});

test("Wormhole infinite continuation", () => {
  assert.equal(M.wormholeEnemyLevel(0), 202);
  assert.equal(M.wormholeEnemyLevel(299), 202 + 2 * 299);
  const xp0 = M.wormholeEncounterXp(0);
  const xpHi = M.wormholeEncounterXp(1149);
  assert.ok(finite(xp0) && finite(xpHi) && xpHi > xp0);
  assert.ok(xpHi < Number.MAX_SAFE_INTEGER);
  evidence.push(`worm xp0=${xp0} idx1149=${xpHi} band1 dru=${M.wormholeBandDru(1)}`);
});

test("Frontier cap and scope (formula only)", () => {
  assert.equal(M.frontierBonusPct(10, 10), 0);
  assert.equal(M.frontierBonusPct(20, 10), 0.5);
  assert.equal(M.frontierBonusPct(11, 10), 0.05);
  assert.equal(M.applyFrontierBonus(100, 0.5), 150);
});

test("Nova surcharge exhaustive table", () => {
  assert.equal(M.NOVA_SURCHARGE_TABLE.epic.prices.length, 6);
  assert.equal(M.NOVA_SURCHARGE_TABLE.legendary.prices.length, 6);
  assert.equal(M.novaSurchargeBandIndex(0.749), 0);
  assert.equal(M.novaSurchargeBandIndex(0.75), 1);
  assert.equal(M.novaSurchargeBandIndex(0.99), 5);
  assert.equal(M.resolveNovaSurcharge("epic", 0.5, 0.99, 0), 0);
  assert.equal(M.resolveNovaSurcharge("epic", 0.5, 0, 0), 5);
  assert.deepEqual(M.NOVA_SURCHARGE_TABLE.epic.prices[5], [50, 75, 100]);
  assert.deepEqual(M.NOVA_SURCHARGE_TABLE.legendary.prices[5], [75, 100, 150]);
});

test("EPA anchor error, monotone, infinite safety", () => {
  const errors = [];
  for (const [L, y] of M.EPA_OFFICIAL_ANCHORS) {
    const v = M.expectedPlayerAttributes(L);
    const e = (100 * Math.abs(v - y)) / y;
    errors.push([L, v, e]);
    assert.ok(finite(v) && v > 0);
  }
  const maxE = Math.max(...errors.map((x) => x[2]));
  const meanE = errors.reduce((s, x) => s + x[2], 0) / errors.length;
  evidence.push(`EPA max% ${maxE.toFixed(4)} mean% ${meanE.toFixed(4)}`);
  evidence.push(`EPA L1000=${M.expectedPlayerAttributes(1000)} L2500=${M.expectedPlayerAttributes(2500)}`);
  evidence.push(`EPA per-anchor% ${errors.map(([L, , e]) => `${L}:${e.toFixed(3)}`).join(" ")}`);
  assert.ok(maxE <= 0.5, `EPA max error ${maxE} exceeds 0.5% gate`);
  let prev = M.expectedPlayerAttributes(1);
  assert.ok(prev > 0 && finite(prev));
  for (let L = 2; L <= 2500; L++) {
    const v = M.expectedPlayerAttributes(L);
    assert.ok(finite(v) && v > prev, `EPA L${L}`);
    prev = v;
  }
});

test("numeric safety vs MAX_SAFE_INTEGER", () => {
  const samples = [
    M.xpToNext(2500),
    M.stardustPerFuel(2500),
    M.blackMarketPrice(2500, "weapon", "legendary", 1.2),
    M.gearResaleValue(2500, "weapon", "legendary"),
    M.attributePurchaseCost(2500),
    M.missionXpReward({ fuel: 20, snapshotLevel: 2500, xpVariance: 1.1 }),
    M.dungeonEncounterXp(9, 9),
    M.wormholeEncounterXp(1149),
  ];
  for (const v of samples) {
    assert.ok(finite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER, String(v));
  }
  evidence.push(`numeric samples L2500 ${JSON.stringify(samples)}`);
});

test("XP unit policy is identity 1:1", () => {
  assert.equal(M.PRODUCTION_XP_STORAGE_SCALE, 1);
  assert.equal(M.PRODUCTION_XP_STORAGE_POLICY, "identity");
  assert.equal(M.toStorageXp(7), 7);
  assert.equal(M.fromStorageXp(7), 7);
  assert.equal(M.xpToNext(10), M.toStorageXp(M.xpToNext(10)));
});

test("frozen fixtures exist and match live module for key values", () => {
  const p = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../src/lib/productionMath/fixtures/production-math-fixtures.json",
  );
  assert.ok(fs.existsSync(p), "run generate-production-math-fixtures.mjs");
  const fix = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(fix.xpToNext["50"], M.xpToNext(50));
  assert.equal(fix.productionXpStorageScale, 1);
  assert.equal(fix.xpUnitPolicy, "identity-1:1");
  assert.equal(fix.stardustPerFuel["100"], M.stardustPerFuel(100));
  assert.equal(fix.dungeonDru[9], 1330);
  assert.equal(fix.missionXpFixtures.win100, M.missionXpReward({
    fuel: 12.5, snapshotLevel: 50, xpVariance: 1, defeated: false,
  }));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
for (const line of evidence) console.log("evidence:", line);
if (failed) process.exit(1);
