/**
 * Phase 4 Missions certification suite.
 * Run: npm run test:phase4-missions
 */
import assert from "node:assert/strict";
import {
  CLASS_ARCHETYPE,
  DEFEAT_REWARD_FACTOR,
  GEAR_SLOTS,
  MISSION_DURATION_POOL_MATURE_LEVEL,
  MISSION_DURATION_POOLS,
  MISSION_GEAR_PITY_INCREMENT,
  MISSION_GEAR_REFERENCE_CHANCE,
  MISSION_GEAR_REFERENCE_FUEL,
  MISSION_MAX_DURATION_SECONDS,
  MISSION_MIN_FUEL,
  MISSION_MAX_FUEL,
  MISSION_OFFER_COUNT,
  MISSION_SKIP_MIN_NOVA,
  MISSION_VARIANCE_PRECISION_SCALE,
  MISSION_VARIANCE_STEP,
  VARIANCE_MAX,
  VARIANCE_MIN,
} from "../../src/lib/productionMath/constants.js";
import {
  constructMissionEnemy,
  fuelFromDurationSeconds,
  generateMissionOfferEconomics,
  getMissionDurationPool,
  affordableNormalPoolDurations,
  hasDuplicateEconomicOffers,
  LOOT_OUTCOME_GEAR,
  LOOT_OUTCOME_JUNK,
  LOOT_OUTCOME_NONE,
  LOOT_OUTCOME_STIM,
  missionDefeatStardust,
  missionDefeatXp,
  missionGearDropProbability,
  missionJunkConditionalProbability,
  missionSkipCostNova,
  missionStimConditionalProbability,
  missionVictoryStardust,
  missionVictoryXp,
  nextFuelSinceLastGear,
  rollMissionGearItemLevel,
  rollMissionGearRarity,
  rollMissionJunkValue,
  rollMissionLootOutcome,
  rollMissionVariance,
  clampMissionVariance,
  snapshotMissionAcceptance,
} from "../../src/lib/productionMath/missions.js";
import {
  missionStardustReward,
  missionXpReward,
  missionEnemyOutgoingMultiplier,
  MISSION_COMBAT_RULES_VERSION,
  MISSION_ENEMY_HP_SCALE,
} from "../../src/lib/productionMath/index.js";
import {
  freeLevelAttributes,
  startingAttributesForClass,
} from "../../src/lib/productionMath/attributes.js";
import { GenerateGearItem } from "../../src/lib/itemGeneration.js";
import { simulateBattle } from "../../src/lib/arenaEngine.js";
import { generateMissionEncounter } from "../../src/lib/missionCombat.js";
import {
  APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT,
  setApplyCertifiedMissionEnemyOutgoingInLiveCombat,
} from "../../src/lib/combatMath.js";
import { settleMissionItemChain } from "../src/shared/missionRewards.js";

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

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seqRng(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

console.log("\nPhase 4 Missions certification\n");

const DURATION_CHECK_LEVELS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 50, 100, 500, 800, 1500, 2000,
];

test("duration pools match the discrete table at every checkpoint", () => {
  for (const L of DURATION_CHECK_LEVELS) {
    const pool = getMissionDurationPool(L);
    const expected = L >= MISSION_DURATION_POOL_MATURE_LEVEL
      ? MISSION_DURATION_POOLS[MISSION_DURATION_POOL_MATURE_LEVEL]
      : MISSION_DURATION_POOLS[L] || MISSION_DURATION_POOLS[MISSION_DURATION_POOL_MATURE_LEVEL];
    assert.deepEqual([...pool], [...expected], `L${L}`);
    assert.ok(pool.every((s) => s <= MISSION_MAX_DURATION_SECONDS));
  }
  assert.equal(fuelFromDurationSeconds(15), MISSION_MIN_FUEL);
  assert.equal(fuelFromDurationSeconds(1200), 20);
  assert.deepEqual(
    [...getMissionDurationPool(21)],
    [...getMissionDurationPool(2000)],
  );
});

test("low-Fuel remainder: L17 with 2 Fuel can receive 120s / 2 Fuel", () => {
  const offers = generateMissionOfferEconomics({
    level: 17,
    availableFuel: 2,
    rng: () => 0,
  });
  assert.equal(offers.length, MISSION_OFFER_COUNT);
  assert.ok(offers.every((o) => o.fuelCost === 2));
  assert.ok(offers.every((o) => o.durationSeconds === 120));
  assert.ok(offers.every((o) => o.lowFuel === true));
});

test("L21 with 15 Fuel never rolls above 15 and still uses the normal pool", () => {
  const remainingFuel = 15;
  const matureLevel = MISSION_DURATION_POOL_MATURE_LEVEL;
  const affordable = affordableNormalPoolDurations(matureLevel, remainingFuel);
  assert.ok(affordable.length > 1, "15 Fuel should afford more than one L21 duration");
  const seen = new Set();
  const boards = 200;
  for (let i = 0; i < boards; i++) {
    const offers = generateMissionOfferEconomics({
      level: matureLevel,
      availableFuel: remainingFuel,
      rng: mulberry32(i + 1),
    });
    assert.equal(offers.length, MISSION_OFFER_COUNT);
    for (const o of offers) {
      assert.equal(o.lowFuel, false);
      assert.ok(o.fuelCost <= remainingFuel + 1e-9, `rolled ${o.fuelCost} above ${remainingFuel}`);
      assert.ok(affordable.includes(o.durationSeconds), `duration ${o.durationSeconds} not in affordable pool`);
      seen.add(o.fuelCost);
    }
  }
  assert.ok(seen.size > 1, "boards must not pin every offer to leftover Fuel");
  assert.ok(!seen.has(MISSION_MAX_FUEL), "full-pool max Fuel must not appear when 15 remains");
});

test("192000 low-Fuel cases: 0 stranded usable Fuel", () => {
  const MAX_L = 800;
  const MAX_FUEL = 20;
  const STEP = 0.25;
  const REPS = 3;
  let stranded = 0;
  let cases = 0;
  for (let L = 1; L <= MAX_L; L++) {
    for (let fuel = STEP; fuel <= MAX_FUEL + 1e-9; fuel += STEP) {
      const q = Math.round(fuel / STEP) * STEP;
      for (let r = 0; r < REPS; r++) {
        cases += 1;
        const rng = mulberry32(L * 1000 + Math.round(q * 4) * 10 + r);
        const offers = generateMissionOfferEconomics({
          level: L,
          availableFuel: q,
          rng,
        });
        if (!offers.some((o) => o.fuelCost <= q + 1e-9)) stranded += 1;
        const poolAffordable = affordableNormalPoolDurations(L, q);
        if (poolAffordable.length > 0) {
          for (const o of offers) {
            assert.equal(o.lowFuel, false);
            assert.ok(o.fuelCost <= q + 1e-9, `L${L} fuel=${q} rolled ${o.fuelCost}`);
          }
        }
        for (const o of offers) {
          if (o.lowFuel) {
            assert.ok(o.fuelCost <= q + 1e-9);
            assert.ok(o.fuelCost >= MISSION_MIN_FUEL);
            assert.equal(o.durationSeconds, Math.round(o.fuelCost * 60));
          }
          assert.ok(Number.isFinite(o.fuelCost) && Number.isFinite(o.durationSeconds));
          assert.ok(o.fuelCost >= 0);
        }
      }
    }
  }
  assert.equal(cases, 192000, `cases=${cases}`);
  assert.equal(stranded, 0, `stranded=${stranded}`);
});

test("200000 three-offer sets: 0 economic duplicates after safeguard", () => {
  const SETS = 200000;
  let after = 0;
  let injected = 0;
  for (let i = 0; i < SETS; i++) {
    const rng = mulberry32(i * 17 + 3);
    const forceDup = i % 2 === 0;
    if (forceDup) injected += 1;
    const offers = generateMissionOfferEconomics({
      level: (i % 40) + 1,
      availableFuel: 20,
      rng: forceDup
        ? (() => {
          let n = 0;
          return () => {
            n += 1;
            return n <= 6 ? 0 : rng();
          };
        })()
        : rng,
    });
    if (hasDuplicateEconomicOffers(offers)) after += 1;
  }
  assert.equal(after, 0, `duplicates after safeguard=${after} injected-prone=${injected}`);
});

test("XP/Stardust named factors, independent variance, snapshot level", () => {
  const fuel = 12.5;
  const L = 50;
  const xpLo = missionVictoryXp({ fuel, snapshotLevel: L, xpVariance: 0.9 });
  const xpMid = missionVictoryXp({ fuel, snapshotLevel: L, xpVariance: 1 });
  const xpHi = missionVictoryXp({ fuel, snapshotLevel: L, xpVariance: 1.1 });
  const sdLo = missionVictoryStardust({ fuel, snapshotLevel: L, stardustVariance: 0.9 });
  const sdHi = missionVictoryStardust({ fuel, snapshotLevel: L, stardustVariance: 1.1 });
  assert.ok(xpLo < xpMid && xpMid < xpHi);
  assert.ok(sdLo < sdHi);
  assert.equal(missionXpReward({ fuel, snapshotLevel: L, xpVariance: 1, defeated: false }), xpMid);
  assert.equal(
    missionStardustReward({ fuel, snapshotLevel: L, stardustVariance: 1, defeated: false }),
    missionVictoryStardust({ fuel, snapshotLevel: L, stardustVariance: 1 }),
  );
  assert.ok(
    missionVictoryXp({ fuel, snapshotLevel: 200, xpVariance: 1 })
      > missionVictoryXp({ fuel, snapshotLevel: L, xpVariance: 1 }),
  );
});

test("Mission reward variance is discrete thousandths in 0.900–1.100", () => {
  assert.equal(VARIANCE_MIN, 0.9);
  assert.equal(VARIANCE_MAX, 1.1);
  assert.equal(MISSION_VARIANCE_STEP, 0.001);
  assert.equal(MISSION_VARIANCE_PRECISION_SCALE, 1000);
  assert.equal(1 / MISSION_VARIANCE_PRECISION_SCALE, MISSION_VARIANCE_STEP);

  assert.equal(clampMissionVariance(0.9), VARIANCE_MIN);
  assert.equal(clampMissionVariance(1.1), VARIANCE_MAX);
  assert.equal(clampMissionVariance(0.957), 0.957);
  assert.equal(clampMissionVariance(1.013), 1.013);
  assert.equal(clampMissionVariance(0.899), VARIANCE_MIN);
  assert.equal(clampMissionVariance(1.101), VARIANCE_MAX);
  assert.notEqual(clampMissionVariance(0.957), 0.96);

  assert.equal(rollMissionVariance(() => 0), VARIANCE_MIN);
  assert.equal(rollMissionVariance(() => 1), VARIANCE_MAX);

  const rngPair = seqRng([0, 0.5]);
  const xpRoll = rollMissionVariance(rngPair);
  const sdRoll = rollMissionVariance(rngPair);
  assert.notEqual(xpRoll, sdRoll, "XP and Stardust rolls are independent");

  const seedA = mulberry32(4242);
  const seedB = mulberry32(4242);
  assert.equal(rollMissionVariance(seedA), rollMissionVariance(seedB));
  assert.equal(rollMissionVariance(seedA), rollMissionVariance(seedB));

  for (let i = 0; i < 4000; i++) {
    const v = rollMissionVariance(mulberry32(i + 1));
    const ticks = Math.round(v * MISSION_VARIANCE_PRECISION_SCALE);
    assert.equal(v, ticks / MISSION_VARIANCE_PRECISION_SCALE, `granularity ${v}`);
    assert.ok(v >= VARIANCE_MIN && v <= VARIANCE_MAX, `band ${v}`);
  }

  const xp = missionVictoryXp({ fuel: 12.5, snapshotLevel: 50, xpVariance: 0.957 });
  const sd = missionVictoryStardust({ fuel: 12.5, snapshotLevel: 50, stardustVariance: 1.013 });
  assert.ok(Number.isInteger(xp), `xp ${xp}`);
  assert.ok(Number.isInteger(sd), `sd ${sd}`);
  assert.equal(xp, missionXpReward({ fuel: 12.5, snapshotLevel: 50, xpVariance: 0.957 }));
  assert.equal(
    sd,
    missionStardustReward({ fuel: 12.5, snapshotLevel: 50, stardustVariance: 1.013 }),
  );

  const offer = {
    fuelCost: 2,
    durationSeconds: 120,
    xpVariance: 0.957,
    stardustVariance: 1.013,
    offerId: "off_var",
    name: "Variance",
  };
  const snap1 = snapshotMissionAcceptance({ characterLevel: 12, offer });
  const snap2 = snapshotMissionAcceptance({ characterLevel: 12, offer, rng: () => 0.99 });
  assert.equal(snap1.xp_efficiency, 0.957);
  assert.equal(snap1.stardust_efficiency, 1.013);
  assert.equal(snap1.preview_xp, snap1.final_xp);
  assert.equal(snap1.preview_stardust, snap1.final_stardust);
  assert.equal(snap2.xp_efficiency, snap1.xp_efficiency);
  assert.equal(snap2.stardust_efficiency, snap1.stardust_efficiency);
  assert.equal(snap2.final_xp, snap1.final_xp);
  assert.equal(snap2.final_stardust, snap1.final_stardust);
  assert.equal(
    snap1.final_xp,
    missionVictoryXp({ fuel: 2, snapshotLevel: 12, xpVariance: 0.957 }),
  );
  assert.equal(
    snap1.final_stardust,
    missionVictoryStardust({ fuel: 2, snapshotLevel: 12, stardustVariance: 1.013 }),
  );

  const boardA = generateMissionOfferEconomics({
    level: 25,
    availableFuel: 20,
    rng: mulberry32(777),
  });
  const boardB = generateMissionOfferEconomics({
    level: 25,
    availableFuel: 20,
    rng: mulberry32(777),
  });
  assert.equal(boardA.length, boardB.length);
  let sawIndependentBoard = false;
  for (let i = 0; i < boardA.length; i++) {
    assert.equal(boardA[i].xpVariance, boardB[i].xpVariance);
    assert.equal(boardA[i].stardustVariance, boardB[i].stardustVariance);
    const ticksXp = Math.round(boardA[i].xpVariance * MISSION_VARIANCE_PRECISION_SCALE);
    const ticksSd = Math.round(boardA[i].stardustVariance * MISSION_VARIANCE_PRECISION_SCALE);
    assert.equal(boardA[i].xpVariance, ticksXp / MISSION_VARIANCE_PRECISION_SCALE);
    assert.equal(boardA[i].stardustVariance, ticksSd / MISSION_VARIANCE_PRECISION_SCALE);
    if (boardA[i].xpVariance !== boardA[i].stardustVariance) sawIndependentBoard = true;
    const frozen = snapshotMissionAcceptance({ characterLevel: 25, offer: boardA[i] });
    assert.equal(frozen.xp_efficiency, boardA[i].xpVariance);
    assert.equal(frozen.stardust_efficiency, boardA[i].stardustVariance);
    assert.equal(frozen.preview_xp, frozen.final_xp);
    assert.equal(frozen.preview_stardust, frozen.final_stardust);
  }
  assert.ok(sawIndependentBoard, "board XP/SD variance rolls differ");
});

test("defeat uses named 50% factor", () => {
  assert.equal(DEFEAT_REWARD_FACTOR, 0.5);
  assert.equal(missionDefeatXp(100), 50);
  assert.equal(missionDefeatStardust(80), 40);
});

test("skip Nova from original Fuel", () => {
  assert.equal(missionSkipCostNova(1), MISSION_SKIP_MIN_NOVA);
  assert.equal(missionSkipCostNova(2), 0.5);
  assert.equal(missionSkipCostNova(5), 0.5);
  assert.equal(missionSkipCostNova(7.5), 1);
  assert.equal(missionSkipCostNova(10), 1);
  assert.equal(missionSkipCostNova(12.5), 1.5);
  assert.equal(missionSkipCostNova(15), 1.5);
  assert.equal(missionSkipCostNova(17.5), 2);
  assert.equal(missionSkipCostNova(20), 2);
});

test("Gear pity Fuel formula + Stim 10% / Junk 75% at 12.5 Fuel", () => {
  const F = MISSION_GEAR_REFERENCE_FUEL;
  assert.ok(Math.abs(missionGearDropProbability(F, 0) - MISSION_GEAR_REFERENCE_CHANCE) < 1e-12);
  assert.ok(missionGearDropProbability(F, 25) > missionGearDropProbability(F, 0));
  assert.ok(Math.abs(missionStimConditionalProbability(F) - 0.1) < 1e-12);
  assert.ok(Math.abs(missionJunkConditionalProbability(F) - 0.75) < 1e-12);
  assert.equal(nextFuelSinceLastGear({ fuelSinceLastGear: 10, missionFuel: 2.5, gearDropped: true }), 0);
  assert.equal(nextFuelSinceLastGear({ fuelSinceLastGear: 10, missionFuel: 2.5, gearDropped: false }), 12.5);
  void MISSION_GEAR_PITY_INCREMENT;
});

test("exclusive loot chain: at most one physical item", () => {
  assert.equal(
    rollMissionLootOutcome({ missionFuel: 12.5, fuelSinceLastGear: 0, rng: () => 0 }).outcome,
    LOOT_OUTCOME_GEAR,
  );
  assert.equal(
    rollMissionLootOutcome({ missionFuel: 12.5, fuelSinceLastGear: 0, rng: seqRng([0.99, 0]) }).outcome,
    LOOT_OUTCOME_STIM,
  );
  assert.equal(
    rollMissionLootOutcome({
      missionFuel: 12.5,
      fuelSinceLastGear: 0,
      rng: seqRng([0.99, 0.99, 0]),
    }).outcome,
    LOOT_OUTCOME_JUNK,
  );
  assert.equal(
    rollMissionLootOutcome({
      missionFuel: 12.5,
      fuelSinceLastGear: 0,
      rng: seqRng([0.99, 0.99, 0.99]),
    }).outcome,
    LOOT_OUTCOME_NONE,
  );
});

test("Mission Gear rarity 60/30/10 and no Epic/Legendary", () => {
  const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  const n = 20000;
  const rng = mulberry32(99);
  for (let i = 0; i < n; i++) counts[rollMissionGearRarity(rng)] += 1;
  assert.equal(counts.epic + (counts.legendary || 0), 0);
  assert.ok(counts.common / n > 0.55 && counts.common / n < 0.65);
  assert.ok(counts.uncommon / n > 0.25 && counts.uncommon / n < 0.35);
  assert.ok(counts.rare / n > 0.07 && counts.rare / n < 0.13);
});

test("item-level offsets clamp at 1 and never exceed snapshot", () => {
  const rng = mulberry32(4);
  for (let i = 0; i < 2000; i++) assert.equal(rollMissionGearItemLevel(1, rng), 1);
  for (let i = 0; i < 2000; i++) {
    const L = rollMissionGearItemLevel(10, rng);
    assert.ok(L >= 1 && L <= 10);
  }
});

test("Junk value = ROUND(MissionStardust * 0.45 * U(0.60,1.40))", () => {
  assert.equal(rollMissionJunkValue(1000, () => 0.5), Math.round(1000 * 0.45 * 1));
  assert.equal(rollMissionJunkValue(1000, () => 0), Math.round(1000 * 0.45 * 0.6));
});

test("settleMissionItemChain routes Gear through randomItem origin=mission", () => {
  const r = settleMissionItemChain({
    character: { level: 20, fuel_since_last_gear: 0 },
    mission: { character_level: 20, fuel_cost: 12.5 },
    missionStardustReward: 400,
    rng: () => 0,
  });
  assert.equal(r.itemOutcome, LOOT_OUTCOME_GEAR);
  assert.equal(r.itemTemplates.length, 1);
  assert.equal(r.itemTemplates[0].origin, "mission");
  assert.ok(String(r.itemTemplates[0].name || "").trim().length > 0);
  assert.notEqual(r.itemTemplates[0].name, "Item");
  assert.equal(r.itemTemplates[0].name, r.itemTemplates[0].base_name);
});

test("enemy construction uses snapshot EPA * 35% and exact allocation", () => {
  const rng = mulberry32(8);
  for (const L of [1, 10, 20, 25, 50, 75, 100, 200, 500]) {
    const e = constructMissionEnemy({ snapshotLevel: L, rng });
    assert.equal(e.attributeTotal, e.expectedBudget);
    assert.equal(e.noPassive, true);
    assert.equal(e.noGear, true);
    assert.ok(["Might", "Reflex", "Tech"].includes(e.missionEnemyArchetype));
  }
  const foe = generateMissionEncounter({ level: 200 }, { character_level: 10 }, mulberry32(1));
  assert.equal(foe.level, 10, "enemy uses snapshot not live level");
});

test("snapshotMissionAcceptance freezes acceptance-level payouts", () => {
  const snap = snapshotMissionAcceptance({
    characterLevel: 12,
    offer: {
      fuelCost: 2,
      durationSeconds: 120,
      xpVariance: 1,
      stardustVariance: 1,
      offerId: "off_1",
      name: "Test",
    },
  });
  assert.equal(snap.character_level, 12);
  assert.equal(snap.final_xp, missionVictoryXp({ fuel: 2, snapshotLevel: 12, xpVariance: 1 }));
  assert.equal(snap.enemy_epa_level, 12);
  assert.equal(snap.mission_combat_rules_version, MISSION_COMBAT_RULES_VERSION);
  assert.equal(snap.mission_enemy_hp_scale, MISSION_ENEMY_HP_SCALE);
  assert.equal(snap.mission_enemy_outgoing_multiplier, missionEnemyOutgoingMultiplier(12));
});

test("certified Mission enemy outgoing is live; purchased-ish gate is retired", () => {
  assert.equal(APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT, true);
  assert.equal(missionEnemyOutgoingMultiplier(1), 0.3);
  assert.equal(missionEnemyOutgoingMultiplier(10), 0.35);
  assert.equal(missionEnemyOutgoingMultiplier(15), 0.5);
  assert.equal(missionEnemyOutgoingMultiplier(20), 2.5);
  assert.ok(Math.abs(missionEnemyOutgoingMultiplier(25) - (2.5 + (6 - 2.5) * (25 - 20) / (50 - 20))) < 1e-12);
  assert.equal(missionEnemyOutgoingMultiplier(50), 6);
  assert.equal(missionEnemyOutgoingMultiplier(75), 8);
  assert.equal(missionEnemyOutgoingMultiplier(100), 10);
  assert.equal(missionEnemyOutgoingMultiplier(150), 11);
  assert.equal(missionEnemyOutgoingMultiplier(200), 12);
});

test("snapshot freezes payouts when the character later levels", () => {
  const offer = {
    fuelCost: 5,
    durationSeconds: 300,
    xpVariance: 1,
    stardustVariance: 1,
    offerId: "off_snap",
    name: "Snap",
  };
  const at12 = snapshotMissionAcceptance({ characterLevel: 12, offer });
  const live50Xp = missionVictoryXp({ fuel: 5, snapshotLevel: 50, xpVariance: 1 });
  assert.equal(at12.character_level, 12);
  assert.equal(at12.final_xp, missionVictoryXp({ fuel: 5, snapshotLevel: 12, xpVariance: 1 }));
  assert.ok(live50Xp > at12.final_xp);
  assert.equal(at12.enemy_epa_level, 12);
  assert.equal(at12.mission_combat_rules_version, MISSION_COMBAT_RULES_VERSION);
  assert.equal(at12.mission_enemy_hp_scale, MISSION_ENEMY_HP_SCALE);
  assert.equal(at12.mission_enemy_outgoing_multiplier, missionEnemyOutgoingMultiplier(12));
});

test("enemy archetypes are ~1/3 each and allocation sums to budget", () => {
  const counts = { Might: 0, Reflex: 0, Tech: 0 };
  const n = 9000;
  const rng = mulberry32(7);
  for (let i = 0; i < n; i++) {
    const e = constructMissionEnemy({ snapshotLevel: 40, rng });
    counts[e.missionEnemyArchetype] += 1;
    assert.equal(e.attributeTotal, e.expectedBudget);
  }
  for (const a of ["Might", "Reflex", "Tech"]) {
    const share = counts[a] / n;
    assert.ok(share > 0.30 && share < 0.36, `${a} share=${share}`);
  }
});

test("loot hazards are monotone in Fuel and exclusive", () => {
  const fuels = [0.25, 0.5, 1, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20];
  let prevG = 0;
  let prevS = 0;
  let prevJ = 0;
  for (const F of fuels) {
    const g = missionGearDropProbability(F, 0);
    const s = missionStimConditionalProbability(F);
    const j = missionJunkConditionalProbability(F);
    assert.ok(g >= prevG && g <= 1);
    assert.ok(s >= prevS && s <= 1);
    assert.ok(j >= prevJ && j <= 1);
    prevG = g;
    prevS = s;
    prevJ = j;
  }
  assert.ok(Math.abs(missionStimConditionalProbability(12.5) - 0.1) < 1e-12);
  assert.ok(Math.abs(missionJunkConditionalProbability(12.5) - 0.75) < 1e-12);
});

test("item-level offset distribution never exceeds snapshot or drops below 1", () => {
  const n = 20000;
  const rng = mulberry32(21);
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let i = 0; i < n; i++) {
    const L = rollMissionGearItemLevel(20, rng);
    assert.ok(L >= 15 && L <= 20);
    counts[20 - L] += 1;
  }
  assert.ok(counts[0] / n > 0.08 && counts[0] / n < 0.12);
  assert.ok(counts[1] / n > 0.12 && counts[1] / n < 0.18);
});

test("skip cost is independent of elapsed time and uses original Fuel", () => {
  assert.equal(missionSkipCostNova(1), 0.5);
  assert.equal(missionSkipCostNova(20), 2);
  assert.equal(missionSkipCostNova(7.5), 1);
});

test("offer economics ignore extra client fields", () => {
  const offers = generateMissionOfferEconomics({
    level: 8,
    availableFuel: 20,
    rng: mulberry32(3),
    clientFuel: 0.25,
    clientXp: 999999,
    clientStardust: 999999,
  });
  assert.equal(offers.length, MISSION_OFFER_COUNT);
  for (const o of offers) {
    assert.ok(o.fuelCost >= MISSION_MIN_FUEL);
    assert.ok(o.final_xp == null || o.final_xp !== 999999);
  }
});

test("reward checkpoints use snapshot level not a hidden scalar", () => {
  const levels = [1, 10, 20, 25, 50, 75, 100, 150, 200, 500, 800, 1500, 2000];
  let prev = 0;
  for (const L of levels) {
    const xp = missionVictoryXp({ fuel: 12.5, snapshotLevel: L, xpVariance: 1 });
    const sd = missionVictoryStardust({ fuel: 12.5, snapshotLevel: L, stardustVariance: 1 });
    assert.ok(Number.isFinite(xp) && Number.isFinite(sd));
    assert.ok(xp >= prev);
    prev = xp;
    assert.equal(
      missionXpReward({ fuel: 12.5, snapshotLevel: L, xpVariance: 1, defeated: false }),
      xp,
    );
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
