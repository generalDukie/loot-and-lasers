/**
 * Phase 4 final Mission combat activation — official certification.
 * Exact Test 18 retained states. Purchased-ish fixtures are not authority.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT,
  MISSION_COMBAT_RULES_VERSION,
  MISSION_ENEMY_ARCHETYPE_CLASS,
  MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION,
  MISSION_ENEMY_HP_PACING_MULTIPLIER,
  MISSION_ENEMY_HP_SCALE,
  PLAYER_BASE_DAMAGE_FLAT,
  PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT,
  PLAYER_COMBAT_CONTEXT_MULT,
  RAW_ATTACK_COEFFICIENT,
  STANDARD_ATTACK_FLAT,
} from "../../src/lib/productionMath/constants.js";
import {
  maxHp,
  missionEnemyMaxHp,
  missionEnemyOutgoingMultiplier,
} from "../../src/lib/productionMath/combatStats.js";
import { roundHalfEven } from "../../src/lib/productionMath/rounding.js";
import {
  missionEnemyAttributes,
  startingAttributesForClass,
} from "../../src/lib/productionMath/attributes.js";
import { snapshotMissionAcceptance } from "../../src/lib/productionMath/missions.js";
import {
  APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT,
  contextMultiplierFor,
  derivedCombatStats,
  roundCombatDamage,
} from "../../src/lib/combatMath.js";
import { buildFighter, resolveBasicHit, simulateBattle } from "../../src/lib/arenaEngine.js";
import { generateMissionEncounter } from "../../src/lib/missionCombat.js";
import { T18_CLASS_NAMES } from "./t18FrozenCombat.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STATE_CSV = path.join(ROOT, "server", "fixtures", "test18", "checkpoint_character_states.csv");
const RESULTS_JSON = path.join(ROOT, "docs", "PHASE4_FINAL_MISSION_COMBAT_ACTIVATION_RESULTS.json");

const CHECKPOINTS = Object.freeze([10, 25, 50, 75, 100, 150, 200]);
const PROFILES = Object.freeze(["F2P", "Light", "Premium"]);
const CLASSES = T18_CLASS_NAMES;
const ARCHETYPE_COUNT = 3;
const FIGHTS_PER_CHAR = 4;
const L1_FIGHTS = 40;
const APPROVED_MEAN_TURNS = 7.41;
const APPROVED_MEAN_VICTORY_HP = 0.852;
const MEAN_TURNS_ABS_TOLERANCE = 0.45;
const MEAN_VICTORY_HP_ABS_TOLERANCE = 0.04;
const MIN_POOLED_WIN_RATE = 0.999;
const MIN_CELL_WIN_RATE = 0.99;
const HP_VITALITY_SAMPLES = Object.freeze([14, 80, 400, 1078, 2500]);
const EXACT_ONCE_LEVEL = 50;
const SNAPSHOT_FREEZE_LEVEL = 12;
const MINIMUM_REPLAY_FIGHTS = 32400;
const SEED_MIX_A = 10007;
const SEED_MIX_B = 97;
const SEED_MIX_C = 13;
const SEED_MIX_D = 31;
const SEED_MIX_E = 17;
const ARCHETYPE_NAMES = Object.freeze(["Might", "Reflex", "Tech"]);
const IDENTITY_HP_SCALE = 1;
const L25_OUTGOING = 2.5 + (6 - 2.5) * (25 - 20) / (50 - 20);

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

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i]; });
    return row;
  });
}

function num(v) {
  return Number(v);
}

function loadStates() {
  return parseCsv(fs.readFileSync(STATE_CSV, "utf8")).map((r) => ({
    profile: r.profile,
    className: r.class,
    seed: num(r.seed),
    level: num(r.level),
    attrs: [num(r.STR), num(r.AGI), num(r.INT), num(r.VIT), num(r.LUCK)],
  }));
}

function l1State(className, profile) {
  return {
    profile,
    className,
    seed: 0,
    level: 1,
    attrs: [...startingAttributesForClass(className)],
  };
}

function snapshotPlayer(state) {
  const [strength, agility, intellect, vitality, luck] = state.attrs;
  return {
    name: `${state.profile}-${state.className}-${state.seed}-L${state.level}`,
    class: state.className,
    level: state.level,
    snapshotStats: true,
    stats: { strength, agility, intellect, vitality, luck },
  };
}

function makeEnemy(level, archetypeIndex) {
  const arr = missionEnemyAttributes(level, archetypeIndex).attributes;
  const archetype = ARCHETYPE_NAMES[archetypeIndex];
  return {
    name: `Mission-${archetype}`,
    class: MISSION_ENEMY_ARCHETYPE_CLASS[archetype],
    level,
    missionEnemy: true,
    suppressClassPassive: true,
    snapshotStats: true,
    noGear: true,
    noPassive: true,
    stats: {
      strength: arr[0],
      agility: arr[1],
      intellect: arr[2],
      vitality: arr[3],
      luck: arr[4],
    },
  };
}

function fingerprint(fighter) {
  return {
    strength: fighter.stats?.strength,
    agility: fighter.stats?.agility,
    intellect: fighter.stats?.intellect,
    vitality: fighter.stats?.vitality,
    luck: fighter.stats?.luck,
    standardAttack: fighter.standardAttack,
    canonicalDamage: fighter.canonicalDamage,
    damageBase: fighter.damageBase,
    crit: fighter.crit,
    dodge: fighter.dodge,
    resists: { ...(fighter.resists || {}) },
    contextMult: fighter.contextMult,
    archetype: fighter.archetype,
  };
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i];
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function emptyAgg() {
  return { n: 0, wins: 0, turns: [], hp: [], eAttempt: 0, eLanded: 0 };
}

function addFight(agg, row) {
  agg.n += 1;
  agg.wins += row.win;
  agg.turns.push(row.turns);
  if (row.winHp != null) agg.hp.push(row.winHp);
  agg.eAttempt += row.eAttempt;
  agg.eLanded += row.eLanded;
}

function summarizeBattle(result) {
  const events = result.events || [];
  let eAttempt = 0;
  let eLanded = 0;
  for (const ev of events) {
    const isAttempt = ev.isNormalAttack || ev.type === "attack" || ev.type === "dodge" || ev.type === "miss";
    if (isAttempt && ev.attacker === "opponent") eAttempt += 1;
    if (ev.type === "attack" && ev.attacker === "opponent") eLanded += 1;
  }
  const win = result.winner === "player" ? 1 : 0;
  const pMax = result.playerMaxHp || 1;
  return {
    win,
    turns: result.telemetry?.totalTurns ?? 0,
    winHp: win ? (result.playerEnd?.hp ?? 0) / pMax : null,
    eAttempt,
    eLanded,
  };
}

function fin(agg) {
  const turns = [...agg.turns].sort((a, b) => a - b);
  const hp = [...agg.hp].sort((a, b) => a - b);
  return {
    n: agg.n,
    winRate: agg.n ? agg.wins / agg.n : 0,
    meanTurns: mean(agg.turns),
    medianTurns: quantile(turns, 0.5),
    p10Turns: quantile(turns, 0.1),
    p90Turns: quantile(turns, 0.9),
    meanVictoryHp: mean(agg.hp),
    p10VictoryHp: quantile(hp, 0.1),
    p50VictoryHp: quantile(hp, 0.5),
    p90VictoryHp: quantile(hp, 0.9),
    enemyAttempts: agg.eAttempt,
    enemyLanded: agg.eLanded,
  };
}

console.log("\nPhase 4 Mission combat activation\n");

test("live certified outgoing flag is ON with locked checksum", () => {
  assert.equal(APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT, true);
  assert.equal(missionEnemyOutgoingMultiplier(1), 0.3);
  assert.equal(missionEnemyOutgoingMultiplier(10), 0.35);
  assert.equal(missionEnemyOutgoingMultiplier(15), 0.5);
  assert.equal(missionEnemyOutgoingMultiplier(20), 2.5);
  assert.ok(Math.abs(missionEnemyOutgoingMultiplier(25) - L25_OUTGOING) < 1e-12);
  assert.equal(missionEnemyOutgoingMultiplier(50), 6);
  assert.equal(missionEnemyOutgoingMultiplier(75), 8);
  assert.equal(missionEnemyOutgoingMultiplier(100), 10);
  assert.equal(missionEnemyOutgoingMultiplier(150), 11);
  assert.equal(missionEnemyOutgoingMultiplier(200), 12);
  assert.equal(contextMultiplierFor("mission", "enemy", 1), 0.3);
  assert.equal(contextMultiplierFor("mission", "enemy", 50), 6);
  assert.equal(contextMultiplierFor("mission", "enemy", 200), 12);
  assert.equal(contextMultiplierFor("mission", "player", 50), PLAYER_COMBAT_CONTEXT_MULT);
  assert.equal(contextMultiplierFor("dungeon", "enemy", 50), DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT);
});

test("Mission enemy HP scale is 2.50 × 1.20 = 3.00 from named authorities", () => {
  assert.equal(
    MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION,
    PLAYER_BASE_DAMAGE_FLAT / STANDARD_ATTACK_FLAT,
  );
  assert.equal(
    MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION,
    PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT / RAW_ATTACK_COEFFICIENT,
  );
  assert.equal(MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION, 2.5);
  assert.equal(MISSION_ENEMY_HP_PACING_MULTIPLIER, 1.2);
  assert.equal(MISSION_ENEMY_HP_SCALE, 3);
});

test("Mission enemy MaxHP is roundHalfEven(universal maxHp × 2.50 × 1.20)", () => {
  for (const vit of HP_VITALITY_SAMPLES) {
    const normal = maxHp(vit);
    const expected = Math.max(
      1,
      roundHalfEven(
        normal
        * MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION
        * MISSION_ENEMY_HP_PACING_MULTIPLIER,
      ),
    );
    assert.equal(missionEnemyMaxHp(vit), expected);
    const derived = derivedCombatStats(50, {
      strength: 10, agility: 10, intellect: 10, vitality: vit, luck: 10,
    }, "Vanguard", { missionEnemy: true });
    assert.equal(derived.maxHp, expected);
    const player = derivedCombatStats(50, {
      strength: 10, agility: 10, intellect: 10, vitality: vit, luck: 10,
    }, "Vanguard", {});
    assert.equal(player.maxHp, normal);
    const dungeon = derivedCombatStats(50, {
      strength: 10, agility: 10, intellect: 10, vitality: vit, luck: 10,
    }, "Vanguard", { dungeonEnemy: true });
    assert.equal(dungeon.maxHp, normal);
  }
});

test("non-HP Mission enemy combat properties are invariant under HP normalization", () => {
  let mismatches = 0;
  for (const L of [1, 10, 25, 50, 100, 200]) {
    for (let arch = 0; arch < ARCHETYPE_COUNT; arch++) {
      const enemy = makeEnemy(L, arch);
      const scaled = buildFighter(enemy, [], "opponent", { content: "mission" });
      const unscaled = derivedCombatStats(L, enemy.stats, enemy.class, {
        missionEnemy: true,
        missionEnemyHpScale: IDENTITY_HP_SCALE,
      });
      const expected = {
        strength: enemy.stats.strength,
        agility: enemy.stats.agility,
        intellect: enemy.stats.intellect,
        vitality: enemy.stats.vitality,
        luck: enemy.stats.luck,
        standardAttack: unscaled.standardAttack,
        canonicalDamage: unscaled.canonicalDamage,
        damageBase: unscaled.damageBase,
        crit: unscaled.crit,
        dodge: unscaled.dodge,
        resists: { ...(unscaled.resists || {}) },
        contextMult: missionEnemyOutgoingMultiplier(L),
        archetype: unscaled.archetype,
      };
      if (JSON.stringify(fingerprint(scaled)) !== JSON.stringify(expected)) mismatches += 1;
      assert.equal(scaled.maxHp, missionEnemyMaxHp(enemy.stats.vitality));
      assert.equal(scaled.hp, scaled.maxHp);
      assert.notEqual(scaled.maxHp, maxHp(enemy.stats.vitality));
    }
  }
  assert.equal(mismatches, 0);
});

test("outgoing applies exactly once at the established resolution boundary", () => {
  const enemy = makeEnemy(EXACT_ONCE_LEVEL, 0);
  const attacker = buildFighter(enemy, [], "opponent", { content: "mission" });
  const defender = buildFighter({
    name: "Dummy",
    class: "Vanguard",
    level: 1,
    snapshotStats: true,
    stats: { strength: 10, agility: 0, intellect: 0, vitality: 10, luck: 0 },
  }, [], "player", { content: "mission" });
  defender.dodge = 0;
  defender.resists = { might: 0, reflex: 0, tech: 0 };
  const outgoing = missionEnemyOutgoingMultiplier(EXACT_ONCE_LEVEL);
  assert.equal(attacker.contextMult, outgoing);
  const hit = resolveBasicHit(attacker, defender, {
    canCrit: false, rng: () => 0, variance: 1,
  });
  const once = roundCombatDamage(attacker.canonicalDamage * outgoing);
  const missing = roundCombatDamage(attacker.canonicalDamage);
  const doubled = roundCombatDamage(attacker.canonicalDamage * outgoing * outgoing);
  const dungeonContam = roundCombatDamage(
    attacker.canonicalDamage * DUNGEON_WORMHOLE_ENEMY_DAMAGE_MULT,
  );
  assert.equal(hit.finalDamage, once);
  assert.notEqual(hit.finalDamage, missing);
  assert.notEqual(hit.finalDamage, doubled);
  assert.notEqual(hit.finalDamage, dungeonContam);
});

test("acceptance snapshot freezes HP scale and outgoing multiplier", () => {
  const snap = snapshotMissionAcceptance({
    characterLevel: SNAPSHOT_FREEZE_LEVEL,
    offer: {
      fuelCost: 2,
      durationSeconds: 120,
      xpVariance: 1,
      stardustVariance: 1,
      offerId: "off_combat",
      name: "CombatSnap",
    },
  });
  assert.equal(snap.mission_combat_rules_version, MISSION_COMBAT_RULES_VERSION);
  assert.equal(snap.mission_enemy_hp_scale, MISSION_ENEMY_HP_SCALE);
  assert.equal(
    snap.mission_enemy_outgoing_multiplier,
    missionEnemyOutgoingMultiplier(SNAPSHOT_FREEZE_LEVEL),
  );
  const enemy = generateMissionEncounter(
    { level: 200, class: "Vanguard" },
    {
      character_level: SNAPSHOT_FREEZE_LEVEL,
      mission_enemy_hp_scale: snap.mission_enemy_hp_scale,
      mission_enemy_outgoing_multiplier: snap.mission_enemy_outgoing_multiplier,
      mission_combat_rules_version: snap.mission_combat_rules_version,
      rewards: { snapshot: snap },
    },
    mulberry32(11),
  );
  assert.equal(enemy.level, SNAPSHOT_FREEZE_LEVEL);
  assert.equal(enemy.missionEnemyHpScale, MISSION_ENEMY_HP_SCALE);
  assert.equal(enemy.missionEnemyOutgoingMultiplier, missionEnemyOutgoingMultiplier(SNAPSHOT_FREEZE_LEVEL));
  const fighter = buildFighter(enemy, [], "opponent", { content: "mission" });
  assert.equal(fighter.contextMult, missionEnemyOutgoingMultiplier(SNAPSHOT_FREEZE_LEVEL));
  assert.equal(fighter.maxHp, missionEnemyMaxHp(enemy.stats.vitality, enemy.missionEnemyHpScale));
});

test("exact Test 18 state replay ≈ approved HP ×3.00 diagnostic", () => {
  assert.equal(APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT, true);
  const states = loadStates().filter((s) => (
    CHECKPOINTS.includes(s.level)
    && PROFILES.includes(s.profile)
    && CLASSES.includes(s.className)
  ));
  assert.ok(states.length > 0, "retained Test 18 checkpoints loaded");
  const byKey = new Map();
  for (const s of states) {
    const key = `${s.level}|${s.className}|${s.profile}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(s);
  }
  const pooled = emptyAgg();
  const byLevel = new Map();
  const byClass = new Map();
  const byProfile = new Map();
  let minCellWin = 1;

  for (const L of [1, ...CHECKPOINTS]) {
    for (const cls of CLASSES) {
      for (const profile of PROFILES) {
        const cohort = L === 1 ? [l1State(cls, profile)] : (byKey.get(`${L}|${cls}|${profile}`) || []);
        assert.ok(cohort.length > 0, `missing cohort L${L} ${cls} ${profile}`);
        const cell = emptyAgg();
        const extra = L === 1 ? L1_FIGHTS : FIGHTS_PER_CHAR;
        for (const state of cohort) {
          for (let arch = 0; arch < ARCHETYPE_COUNT; arch++) {
            for (let f = 0; f < extra; f++) {
              const seed = ((state.seed || 1) * SEED_MIX_A + L * SEED_MIX_B + arch * SEED_MIX_C
                + f * SEED_MIX_D + CLASSES.indexOf(cls) * SEED_MIX_E) >>> 0;
              const result = simulateBattle(
                snapshotPlayer(state),
                makeEnemy(L, arch),
                [],
                [],
                { rng: mulberry32(seed), mode: "mission" },
              );
              const row = summarizeBattle(result);
              addFight(cell, row);
              addFight(pooled, row);
              if (!byLevel.has(L)) byLevel.set(L, emptyAgg());
              addFight(byLevel.get(L), row);
              if (!byClass.has(cls)) byClass.set(cls, emptyAgg());
              addFight(byClass.get(cls), row);
              if (!byProfile.has(profile)) byProfile.set(profile, emptyAgg());
              addFight(byProfile.get(profile), row);
            }
          }
        }
        const cellWin = cell.n ? cell.wins / cell.n : 0;
        if (cellWin < minCellWin) minCellWin = cellWin;
      }
    }
  }

  const pooledFin = fin(pooled);
  const payload = {
    n: pooledFin.n,
    winRate: pooledFin.winRate,
    minCellWinRate: minCellWin,
    meanTurns: pooledFin.meanTurns,
    medianTurns: pooledFin.medianTurns,
    p10Turns: pooledFin.p10Turns,
    p90Turns: pooledFin.p90Turns,
    meanVictoryHp: pooledFin.meanVictoryHp,
    p10VictoryHp: pooledFin.p10VictoryHp,
    p50VictoryHp: pooledFin.p50VictoryHp,
    p90VictoryHp: pooledFin.p90VictoryHp,
    enemyAttempts: pooledFin.enemyAttempts,
    enemyLanded: pooledFin.enemyLanded,
    byLevel: Object.fromEntries([...byLevel.entries()].map(([k, v]) => [k, fin(v)])),
    byClass: Object.fromEntries([...byClass.entries()].map(([k, v]) => [k, fin(v)])),
    byProfile: Object.fromEntries([...byProfile.entries()].map(([k, v]) => [k, fin(v)])),
  };
  fs.mkdirSync(path.dirname(RESULTS_JSON), { recursive: true });
  fs.writeFileSync(RESULTS_JSON, JSON.stringify(payload, null, 2));

  console.log(`    N=${payload.n} win=${payload.winRate} minCell=${payload.minCellWinRate}`);
  console.log(`    meanTurns=${payload.meanTurns.toFixed(3)} median=${payload.medianTurns}`);
  console.log(`    meanVictoryHp=${(payload.meanVictoryHp * 100).toFixed(2)}%`);

  assert.ok(payload.n >= MINIMUM_REPLAY_FIGHTS, `N=${payload.n}`);
  assert.ok(payload.winRate >= MIN_POOLED_WIN_RATE, `winRate=${payload.winRate}`);
  assert.ok(payload.minCellWinRate >= MIN_CELL_WIN_RATE, `minCell=${payload.minCellWinRate}`);
  assert.ok(
    Math.abs(payload.meanTurns - APPROVED_MEAN_TURNS) <= MEAN_TURNS_ABS_TOLERANCE,
    `meanTurns=${payload.meanTurns}`,
  );
  assert.ok(
    Math.abs(payload.meanVictoryHp - APPROVED_MEAN_VICTORY_HP) <= MEAN_VICTORY_HP_ABS_TOLERANCE,
    `meanVictoryHp=${payload.meanVictoryHp}`,
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
