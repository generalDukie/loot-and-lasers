/**
 * Phase 3 mission-combat sanity audit (not a product test).
 * Trace live Mission construction vs the prior 0% fixture vs Test 18 EPA analog.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/audit-mission-combat-sanity.mjs
 */
import {
  expectedPlayerAttributes,
  missionEnemyAttributeBudget,
  distributeProgressingPlayerAttributes,
  distributeExpectedPlayerAttributes,
  progressingPlayerAttributes,
} from "../../src/lib/expectedPlayerAttributes.js";
import { generateMissionEncounter } from "../../src/lib/missionCombat.js";
import { simulateBattle, buildFighter } from "../../src/lib/arenaEngine.js";
import {
  composePermanentAttributes,
} from "../../src/lib/characterStats.js";
import { computeCombatantTotalStats } from "../../src/lib/statEngine.js";
import { GenerateGearItem } from "../../src/lib/itemGeneration.js";
import {
  missionEnemyOutgoingMultiplier,
  GEAR_SLOTS,
  rawStandardAttack,
} from "../../src/lib/productionMath/index.js";
import { derivedCombatStats, contextMultiplierFor } from "../../src/lib/combatMath.js";

const LEVELS = [1, 10, 20, 50, 100, 200, 250, 500, 800];
const FIGHTS = 40;

function seededRng(seed0) {
  let seed = seed0 >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function sum(stats) {
  return Object.values(stats || {}).reduce((a, b) => a + Number(b || 0), 0);
}

function makeLivePlayer(level, purchasesByStat = null) {
  return {
    name: "LiveVanguard",
    level,
    class: "Vanguard",
    race: "Cognati",
    attribute_purchases_by_stat: purchasesByStat || {
      strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
    },
  };
}

function makeSet(level, rarity, seed) {
  const rng = seededRng(seed);
  return GEAR_SLOTS.map((slot) => GenerateGearItem({
    itemLevel: level,
    itemType: slot,
    rarity,
    className: "Vanguard",
    rng,
  }));
}

function cohort(label, player, items, extra = {}) {
  return { label, player, items: items || [], ...extra };
}

function inspect(player, items, enemy) {
  const pTotals = computeCombatantTotalStats(player, items);
  const eTotals = computeCombatantTotalStats(enemy, []);
  const pDer = derivedCombatStats(player.level, pTotals, player.class);
  const eDer = derivedCombatStats(enemy.level, eTotals, enemy.class, {
    missionEnemy: true,
  });
  const pF = buildFighter(player, items, "player", { content: "mission" });
  const eF = buildFighter(enemy, [], "opponent", { content: "mission" });
  return {
    player: {
      level: player.level,
      attrs: pTotals,
      attrSum: sum(pTotals),
      gearSum: sum(pTotals) - sum(composePermanentAttributes(player.snapshotStats ? {
        class: player.class, level: player.level,
      } : player)),
      hp: pDer.maxHp,
      raw: rawStandardAttack(pDer.primaryValue, pDer.damageBase),
      crit: pDer.crit,
      dodge: pDer.dodge,
      resists: pDer.resists,
      outgoing: pF.contextMult,
    },
    enemy: {
      level: enemy.level,
      attrs: eTotals,
      attrSum: sum(eTotals),
      hp: eDer.maxHp,
      raw: rawStandardAttack(eDer.primaryValue, eDer.damageBase),
      crit: eDer.crit,
      dodge: eDer.dodge,
      resists: eDer.resists,
      outgoing: eF.contextMult,
      outgoingFn: missionEnemyOutgoingMultiplier(enemy.level),
    },
  };
}

function fightRate(player, items, level, seed0) {
  let wins = 0;
  let turns = 0;
  for (let i = 0; i < FIGHTS; i++) {
    const rng = seededRng((seed0 + i * 97) >>> 0);
    const enemy = generateMissionEncounter({ level }, null, rng);
    const battle = simulateBattle(player, enemy, items, [], { rng, content: "mission" });
    if (battle.winner === "player") wins += 1;
    turns += battle.telemetry?.totalTurns || battle.events?.length || 0;
  }
  return { wins, n: FIGHTS, rate: wins / FIGHTS, avgTurns: turns / FIGHTS };
}

console.log("\n=== Mission combat sanity audit ===\n");

for (const L of LEVELS) {
  const epa = expectedPlayerAttributes(L);
  const enemyBudget = missionEnemyAttributeBudget(L);
  const progressing = progressingPlayerAttributes(L);
  const liveBase = composePermanentAttributes(makeLivePlayer(L));
  const gear = makeSet(L, "uncommon", L * 13);
  const rare = makeSet(L, "rare", L * 13);
  const liveGearedTotals = computeCombatantTotalStats(makeLivePlayer(L), gear);
  const liveRareTotals = computeCombatantTotalStats(makeLivePlayer(L), rare);
  const fixtureStats = distributeProgressingPlayerAttributes(L, "MIGHT");
  const epaStats = distributeExpectedPlayerAttributes(L, "MIGHT");

  console.log(`--- L${L} ---`);
  console.log(`  EPA=${epa}  enemyBudget(35%)=${enemyBudget}  outgoing×=${missionEnemyOutgoingMultiplier(L).toFixed(4)}`);
  console.log(`  progressingPlayerAttributes (fixture pool)=${progressing}`);
  console.log(`  live start+free (no gear, no buys)=${sum(liveBase)}`, liveBase);
  console.log(`  live start+free+8 uncommon=${sum(liveGearedTotals)}`);
  console.log(`  live start+free+8 rare=${sum(liveRareTotals)}`);
  console.log(`  fixture snapshot sum=${sum(fixtureStats)}`);
  console.log(`  Test18 EPA-analog snapshot sum=${sum(epaStats)}`);
}

console.log("\n=== Representative fight cards (L50) ===\n");
{
  const L = 50;
  const live = makeLivePlayer(L);
  const gear = makeSet(L, "uncommon", 50);
  const fixture = {
    name: "Fixture",
    level: L,
    class: "Vanguard",
    snapshotStats: true,
    stats: distributeProgressingPlayerAttributes(L, "MIGHT"),
  };
  const epaP = {
    name: "EPA",
    level: L,
    class: "Vanguard",
    snapshotStats: true,
    stats: distributeExpectedPlayerAttributes(L, "MIGHT"),
  };
  const rng = seededRng(5000);
  const enemy = generateMissionEncounter({ level: L }, null, rng);
  for (const [label, p, items] of [
    ["PRIOR FIXTURE (progressing snapshot, no items)", fixture, []],
    ["LIVE start+free, no gear", live, []],
    ["LIVE start+free + 8 uncommon", live, gear],
    ["LIVE start+free + 8 rare", live, makeSet(L, "rare", 51)],
    ["TEST18 analog (EPA snapshot)", epaP, []],
  ]) {
    const card = inspect(p, items, enemy);
    console.log(label);
    console.log("  player", {
      attrSum: card.player.attrSum,
      hp: card.player.hp,
      raw: Number(card.player.raw.toFixed(2)),
      crit: Number((card.player.crit * 100).toFixed(2)),
      dodge: Number((card.player.dodge * 100).toFixed(2)),
      resists: Object.fromEntries(Object.entries(card.player.resists).map(([k, v]) => [k, Number((v * 100).toFixed(2))])),
      outgoing: card.player.outgoing,
    });
    console.log("  enemy ", {
      attrSum: card.enemy.attrSum,
      hp: card.enemy.hp,
      raw: Number(card.enemy.raw.toFixed(2)),
      crit: Number((card.enemy.crit * 100).toFixed(2)),
      dodge: Number((card.enemy.dodge * 100).toFixed(2)),
      outgoing: card.enemy.outgoing,
      outgoingFn: card.enemy.outgoingFn,
      impliedHit: Number((card.enemy.raw * card.enemy.outgoing).toFixed(2)),
    });
  }
}

console.log("\n=== Win rates ===\n");
for (const L of LEVELS) {
  const live = makeLivePlayer(L);
  const gear = makeSet(L, "uncommon", L * 17);
  const rare = makeSet(L, "rare", L * 19);
  const fixture = {
    name: "Fixture",
    level: L,
    class: "Vanguard",
    snapshotStats: true,
    stats: distributeProgressingPlayerAttributes(L, "MIGHT"),
  };
  const epaP = {
    name: "EPA",
    level: L,
    class: "Vanguard",
    snapshotStats: true,
    stats: distributeExpectedPlayerAttributes(L, "MIGHT"),
  };
  const rows = [
    ["fixture", fightRate(fixture, [], L, L * 1000)],
    ["live-naked", fightRate(live, [], L, L * 2000)],
    ["live-uncommon8", fightRate(live, gear, L, L * 3000)],
    ["live-rare8", fightRate(live, rare, L, L * 3500)],
    ["epa-analog", fightRate(epaP, [], L, L * 4000)],
  ];
  const line = rows.map(([k, r]) => `${k} ${(r.rate * 100).toFixed(0)}% turns=${r.avgTurns.toFixed(1)}`).join(" | ");
  console.log(`L${L}: ${line}`);
}
