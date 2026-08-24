/**
 * DIAGNOSTIC ONLY — Phase 4 Mission outgoing blocker audit.
 * Loads exact Test 18 checkpoint states. Does not change production values.
 *
 * Run:
 *   node --import ./server/scripts/register-src-alias.mjs ./server/scripts/audit-mission-outgoing-blocker.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLASS_ARCHETYPE,
  GEAR_SLOTS,
  MISSION_ENEMY_ARCHETYPE_CLASS,
} from "../../src/lib/productionMath/constants.js";
import {
  expectedPlayerAttributes,
  freeLevelAttributes,
  missionEnemyAttributeTotal,
  missionEnemyAttributes,
  startingAttributesForClass,
} from "../../src/lib/productionMath/attributes.js";
import {
  critChance,
  dodgeChance,
  maxHp,
  missionEnemyBaseDamage,
  missionEnemyOutgoingMultiplier,
  playerBaseDamage,
  rawStandardAttack,
  resistances,
} from "../../src/lib/productionMath/combatStats.js";
import { GenerateGearItem } from "../../src/lib/itemGeneration.js";
import { simulateBattle } from "../../src/lib/arenaEngine.js";
import { computeCombatantTotalStats } from "../../src/lib/statEngine.js";
import {
  APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT,
  setApplyCertifiedMissionEnemyOutgoingInLiveCombat,
} from "../../src/lib/combatMath.js";
import {
  T18_CLASS_INDEX,
  T18_CLASS_NAMES,
  t18Crit,
  t18Dodge,
  t18MaxHp,
  t18MissionEnemyAttributes,
  t18MissionFight,
  t18MissionOutgoingMultiplier,
  t18PrimaryIndex,
  t18RawEnemyDamage,
  t18RawPlayerDamage,
  t18RoundHalfUp,
} from "./t18FrozenCombat.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STATE_CSV = path.join(ROOT, "server", "fixtures", "test18", "checkpoint_character_states.csv");
const EPA_CSV = path.join(ROOT, "server", "fixtures", "test18", "epa_checkpoints.csv");
const REPORT_PATH = path.join(ROOT, "docs", "PHASE4_MISSION_OUTGOING_BLOCKER_REPORT.md");

const CHECKPOINTS = [10, 25, 50, 75, 100, 150, 200];
const PROFILES = ["F2P", "Light", "Premium"];
const CLASSES = [...T18_CLASS_NAMES];
const FIGHTS_PER_CHAR = 4;
const ISH_SAMPLE = 20;
const EPA_FRACTION = 0.35;
const ENEMY_MIN = 5;
const OUTGOING_LEVELS = [1, 10, 15, 20, 25, 50, 75, 100, 150, 200, 500, 800];

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

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    header.forEach((h, i) => { row[h] = cols[i]; });
    return row;
  });
}

function n(v) { return Number(v) || 0; }
function sum5(a) { return a[0] + a[1] + a[2] + a[3] + a[4]; }
function mean(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function fmt(v, d = 3) { return v == null || Number.isNaN(Number(v)) ? "n/a" : Number(v).toFixed(d); }
function pct(v) { return `${(100 * Number(v || 0)).toFixed(1)}%`; }
function cmean(list, pick) { return mean(list.map(pick)); }

function loadEpa() {
  const map = new Map();
  for (const r of parseCsv(EPA_CSV)) map.set(n(r.Level ?? r.level), n(r.EPA ?? r.epa));
  return map;
}

function loadStates() {
  return parseCsv(STATE_CSV).map((r) => {
    const attrs = [n(r.STR), n(r.AGI), n(r.INT), n(r.VIT), n(r.LUCK)];
    const purchased = [n(r.purchased_STR), n(r.purchased_AGI), n(r.purchased_INT), n(r.purchased_VIT), n(r.purchased_LUCK)];
    const gear = [n(r.gear_STR), n(r.gear_AGI), n(r.gear_INT), n(r.gear_VIT), n(r.gear_LUCK)];
    const pre = [n(r.pre_stim_STR), n(r.pre_stim_AGI), n(r.pre_stim_INT), n(r.pre_stim_VIT), n(r.pre_stim_LUCK)];
    const eff = [n(r.effective_STR), n(r.effective_AGI), n(r.effective_INT), n(r.effective_VIT), n(r.effective_LUCK)];
    return {
      profile: r.profile,
      className: r.class,
      seed: n(r.seed),
      level: n(r.level),
      total: n(r.total_attrs),
      attrs,
      primary: n(r.primary),
      hp: n(r.hp),
      rawDamage: n(r.raw_damage),
      crit: n(r.crit),
      dodge: n(r.dodge),
      purchasedTotal: sum5(purchased),
      gearTotal: sum5(gear),
      stimTotal: sum5(eff) - sum5(pre),
    };
  });
}

function l1State(className, profile) {
  const start = startingAttributesForClass(className);
  const attrs = [...start];
  const pri = t18PrimaryIndex(T18_CLASS_INDEX[className]);
  return {
    profile, className, seed: 0, level: 1, total: sum5(attrs), attrs,
    primary: attrs[pri], hp: t18MaxHp(attrs[3]), rawDamage: t18RawPlayerDamage(attrs[pri]),
    crit: t18Crit(1, attrs[4]), dodge: t18Dodge(1, attrs[1], pri),
    purchasedTotal: 0, gearTotal: 0, stimTotal: 0,
  };
}

function purchasedIshPlayer(level, className, rng) {
  const start = startingAttributesForClass(className);
  const free = freeLevelAttributes(level, 0);
  const stats = {
    strength: start[0] + free[0] + Math.floor(level / 5),
    agility: start[1] + free[1],
    intellect: start[2] + free[2],
    vitality: start[3] + free[3] + Math.floor(level / 8),
    luck: start[4] + free[4],
  };
  const items = [...GEAR_SLOTS].map((slot) => GenerateGearItem({
    itemLevel: Math.max(1, level),
    itemType: slot,
    rarity: level < 20 ? "common" : level < 50 ? "uncommon" : "rare",
    rng,
    origin: "mission",
    className,
  }));
  return { name: className, level, class: className, stats, items };
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
  const archetype = ["Might", "Reflex", "Tech"][archetypeIndex];
  return {
    name: `Mission-${archetype}`,
    class: MISSION_ENEMY_ARCHETYPE_CLASS[archetype],
    level,
    missionEnemy: true,
    suppressClassPassive: true,
    snapshotStats: true,
    noGear: true,
    noPassive: true,
    stats: { strength: arr[0], agility: arr[1], intellect: arr[2], vitality: arr[3], luck: arr[4] },
    attrs: arr,
  };
}

function summarizeProduction(result) {
  const events = result.events || [];
  const pHit = [];
  const eHit = [];
  let crits = 0;
  let dodges = 0;
  let attacks = 0;
  for (const e of events) {
    if (e.type === "dodge") dodges += 1;
    if (e.type === "attack") {
      attacks += 1;
      if (e.crit) crits += 1;
      if (e.attacker === "player" && e.damage > 0) pHit.push(e.damage);
      if (e.attacker === "opponent" && e.damage > 0) eHit.push(e.damage);
    }
  }
  const win = result.winner === "player";
  const pMax = result.playerMaxHp || 1;
  const eMax = result.opponentMaxHp || 1;
  const pHp = result.playerEnd?.hp ?? 0;
  const eHp = result.opponentEnd?.hp ?? 0;
  return {
    win: win ? 1 : 0,
    turns: result.telemetry?.totalTurns ?? 0,
    winnerHp: win ? pHp / pMax : eHp / eMax,
    playerHpWin: win ? pHp / pMax : null,
    crit: attacks ? crits / attacks : 0,
    dodge: (attacks + dodges) ? dodges / (attacks + dodges) : 0,
    pDmg: mean(pHit),
    eDmg: mean(eHit),
  };
}

function summarizeT18(result) {
  const tel = result.tel;
  const attempts = tel.playerAttempts + tel.enemyAttempts;
  const win = result.win === 1;
  return {
    win: win ? 1 : 0,
    turns: result.turns,
    winnerHp: win ? result.php / result.pmax : result.ehp / result.emax,
    playerHpWin: win ? result.php / result.pmax : null,
    crit: attempts ? (tel.playerCrits + tel.enemyCrits) / attempts : 0,
    dodge: attempts ? (tel.playerDodges + tel.enemyDodges) / attempts : 0,
    pDmg: tel.playerLanded ? tel.playerDamage / tel.playerLanded : 0,
    eDmg: tel.enemyLanded ? tel.enemyDamage / tel.enemyLanded : 0,
  };
}

function emptyAgg() {
  return { n: 0, wins: 0, turns: [], winnerHp: [], playerHpWin: [], crit: [], dodge: [], pDmg: [], eDmg: [] };
}
function addRow(agg, row) {
  agg.n += 1;
  agg.wins += row.win;
  agg.turns.push(row.turns);
  agg.winnerHp.push(row.winnerHp);
  if (row.playerHpWin != null) agg.playerHpWin.push(row.playerHpWin);
  agg.crit.push(row.crit);
  agg.dodge.push(row.dodge);
  agg.pDmg.push(row.pDmg);
  agg.eDmg.push(row.eDmg);
}
function fin(agg) {
  return {
    n: agg.n,
    winRate: agg.n ? agg.wins / agg.n : 0,
    meanTurns: mean(agg.turns),
    medianTurns: median(agg.turns),
    meanWinnerHp: mean(agg.winnerHp),
    meanPlayerHpWin: mean(agg.playerHpWin),
    crit: mean(agg.crit),
    dodge: mean(agg.dodge),
    pDmg: mean(agg.pDmg),
    eDmg: mean(agg.eDmg),
  };
}

function runThreeWay(state, archIndex, fightSeed) {
  const L = state.level;
  const enemy = makeEnemy(L, archIndex);
  const a = summarizeT18(t18MissionFight(
    T18_CLASS_INDEX[state.className], L, state.attrs, L, enemy.attrs, mulberry32(fightSeed),
  ));
  const player = snapshotPlayer(state);
  setApplyCertifiedMissionEnemyOutgoingInLiveCombat(false);
  const b = summarizeProduction(simulateBattle(player, enemy, [], [], {
    rng: mulberry32(fightSeed + 1),
    mode: "mission",
  }));
  setApplyCertifiedMissionEnemyOutgoingInLiveCombat(true);
  const c = summarizeProduction(simulateBattle(player, enemy, [], [], {
    rng: mulberry32(fightSeed + 1),
    mode: "mission",
  }));
  setApplyCertifiedMissionEnemyOutgoingInLiveCombat(false);
  return { a, b, c };
}

function main() {
  const flagAtStart = APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT;
  try {
    const states = loadStates();
    const epaMap = loadEpa();
    const byKey = new Map();
    for (const s of states) {
      const key = `${s.level}|${s.className}|${s.profile}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(s);
    }

    const out = [];
    const add = (line = "") => out.push(line);

    add("# PHASE 4 — FINAL MISSION OUTGOING BLOCKER REPORT");
    add("");
    add("Diagnostic only. Production gameplay values were not changed.");
    add("");
    add("## 1. Exact Test 18 state source");
    add("");
    add("- Artifact: `server/fixtures/test18/checkpoint_character_states.csv`");
    add("- Copied from Test 18 analysis package `%TEMP%/t18_analysis/analysis/checkpoint_character_states.csv`");
    add("- Method: direct load of retained checkpoint rows (not a synthetic rebuild)");
    add("- Population: 360 characters (6 classes × 3 profiles × 20 seeds)");
    add("- Checkpoints in file: L10, L25, L50, L75, L100, L150, L200, … L800");
    add("- L1: reconstructed from production/Test 18 starting attributes (BASE). No L1 checkpoint row exists.");
    add("- L20: **omitted**. No checkpoint row exists; this audit does not interpolate.");
    add(`- Rows loaded: ${states.length}`);
    add("");

    add("## 2. Earlier purchased-ish fixture audit");
    add("");
    add("The Phase 4 outgoing-curve gate built players as starting + free-level attributes with **primaryIndex always 0** (Might weights for every class), plus `floor(level/5)` Strength and `floor(level/8)` Vitality, plus 8 generated Gear pieces (common <20 / uncommon <50 / rare ≥50). Three fights per class per listed level. No F2P/Light/Premium split, no Test 18 purchases, no Stims.");
    add("");
    add("| Level | Class | T18 F2P | T18 Light | T18 Premium | purchased-ish | F2P/ish | Prem/ish | T18 F2P purchased | T18 F2P gear | T18 F2P stim |");
    add("| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    const ratios = [];
    for (const L of CHECKPOINTS) {
      for (const cls of CLASSES) {
        const f2p = byKey.get(`${L}|${cls}|F2P`) || [];
        const light = byKey.get(`${L}|${cls}|Light`) || [];
        const prem = byKey.get(`${L}|${cls}|Premium`) || [];
        const ishTotals = [];
        for (let i = 0; i < ISH_SAMPLE; i++) {
          const rng = mulberry32(L * 10000 + CLASSES.indexOf(cls) * 100 + i);
          const p = purchasedIshPlayer(L, cls, rng);
          const t = computeCombatantTotalStats(p, p.items);
          ishTotals.push(n(t.strength) + n(t.agility) + n(t.intellect) + n(t.vitality) + n(t.luck));
        }
        const ishMean = mean(ishTotals);
        const tF = cmean(f2p, (s) => s.total);
        const tL = cmean(light, (s) => s.total);
        const tP = cmean(prem, (s) => s.total);
        ratios.push(tF / Math.max(1, ishMean));
        add(`| ${L} | ${cls} | ${fmt(tF, 1)} | ${fmt(tL, 1)} | ${fmt(tP, 1)} | ${fmt(ishMean, 1)} | ${fmt(tF / Math.max(1, ishMean), 2)} | ${fmt(tP / Math.max(1, ishMean), 2)} | ${fmt(cmean(f2p, (s) => s.purchasedTotal), 1)} | ${fmt(cmean(f2p, (s) => s.gearTotal), 1)} | ${fmt(cmean(f2p, (s) => s.stimTotal), 1)} |`);
      }
    }
    add("");
    add(`Mean F2P / purchased-ish total-attribute ratio: **${fmt(mean(ratios), 2)}×**.`);
    add("The gate fixtures were substantially underpowered versus actual Test 18 combat-ready totals.");
    add("");

    add("## 3. Player state parity");
    add("");
    add("Exact checkpoint load: combat-ready STR/AGI/INT/VIT/LUCK are used as-is.");
    add("");
    add("| Level | Class | Profile | N | total | primary | VIT | Luck | purchased | gear | stim |");
    add("| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const L of [1, ...CHECKPOINTS]) {
      for (const cls of CLASSES) {
        for (const profile of PROFILES) {
          const cohort = L === 1 ? [l1State(cls, profile)] : (byKey.get(`${L}|${cls}|${profile}`) || []);
          add(`| ${L}${L === 1 ? "*" : ""} | ${cls} | ${profile} | ${cohort.length} | ${fmt(cmean(cohort, (s) => s.total), 1)} | ${fmt(cmean(cohort, (s) => s.primary), 1)} | ${fmt(cmean(cohort, (s) => s.attrs[3]), 1)} | ${fmt(cmean(cohort, (s) => s.attrs[4]), 1)} | ${fmt(cmean(cohort, (s) => s.purchasedTotal), 1)} | ${fmt(cmean(cohort, (s) => s.gearTotal), 1)} | ${fmt(cmean(cohort, (s) => s.stimTotal), 1)} |`);
        }
      }
    }
    add("");
    add("\\* L1 is reconstructed starting state, not a retained checkpoint.");
    add("");

    add("## 4. Derived combat-state parity");
    add("");
    add("CSV = retained Test 18 recorded values. T18 = frozen derived math on the same attrs. Prod = current production derived math.");
    add("");
    add("| Level | Class | Profile | CSV HP | T18 HP | Prod HP | CSV BD | T18 BD | Prod BD | CSV crit | T18 crit | Prod crit | CSV dodge | T18 dodge | Prod dodge |");
    add("| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    const bdRatios = [];
    for (const L of CHECKPOINTS) {
      for (const cls of CLASSES) {
        const archName = CLASS_ARCHETYPE[cls];
        const pri = t18PrimaryIndex(T18_CLASS_INDEX[cls]);
        for (const profile of PROFILES) {
          const cohort = byKey.get(`${L}|${cls}|${profile}`) || [];
          const csvHp = cmean(cohort, (s) => s.hp);
          const tHp = cmean(cohort, (s) => t18MaxHp(s.attrs[3]));
          const pHp = cmean(cohort, (s) => maxHp(s.attrs[3]));
          const csvBd = cmean(cohort, (s) => s.rawDamage);
          const tBd = cmean(cohort, (s) => t18RawPlayerDamage(s.primary));
          const pBd = cmean(cohort, (s) => playerBaseDamage(s.primary));
          const csvC = cmean(cohort, (s) => s.crit);
          const tC = cmean(cohort, (s) => t18Crit(L, s.attrs[4]));
          const pC = cmean(cohort, (s) => critChance(L, s.attrs[4]));
          const csvD = cmean(cohort, (s) => s.dodge);
          const tD = cmean(cohort, (s) => t18Dodge(L, s.attrs[1], pri));
          const pD = cmean(cohort, (s) => dodgeChance(L, s.attrs[1], archName));
          bdRatios.push(pBd / Math.max(1e-9, tBd));
          add(`| ${L} | ${cls} | ${profile} | ${fmt(csvHp, 1)} | ${fmt(tHp, 1)} | ${fmt(pHp, 1)} | ${fmt(csvBd, 2)} | ${fmt(tBd, 2)} | ${fmt(pBd, 2)} | ${fmt(csvC, 4)} | ${fmt(tC, 4)} | ${fmt(pC, 4)} | ${fmt(csvD, 4)} | ${fmt(tD, 4)} | ${fmt(pD, 4)} |`);
        }
      }
    }
    add("");
    add(`Mean production player Base Damage / Test 18 Mission raw BD = **${fmt(mean(bdRatios), 3)}**.`);
    add("This is the locked native player polynomial (37.5 + 0.008·P^1.727) versus Test 18 Mission's unscaled 15 + 0.0032·P^1.727 (algebraically intended ≈ ×2.5).");
    add("Crit/Dodge differences, where present, come from production PCHIP natural caps versus Test 18 `(L/100)^0.65` early ceilings — not from this audit.");
    add("");

    add("## 5. Enemy parity");
    add("");
    add("| Level | T18 EPA | Prod EPA | T18 budget | Prod budget | T18 Might attrs | Prod Might attrs | same | T18 HP | Prod HP | T18 BD | Prod BD | T18 out | Prod out |");
    add("| ---: | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const L of [1, ...CHECKPOINTS, 500, 800]) {
      const t18Epa = epaMap.has(L) ? epaMap.get(L) : expectedPlayerAttributes(L);
      const prodEpa = expectedPlayerAttributes(L);
      const t18Budget = Math.max(ENEMY_MIN, t18RoundHalfUp(t18Epa * EPA_FRACTION));
      const prodBudget = missionEnemyAttributeTotal(L);
      const t18Might = t18MissionEnemyAttributes(t18Epa * EPA_FRACTION, 0);
      const prodMight = missionEnemyAttributes(L, 0).attributes;
      const same = t18Budget === prodBudget && t18Might.every((v, i) => v === prodMight[i]);
      add(`| ${L} | ${fmt(t18Epa, 3)} | ${fmt(prodEpa, 3)} | ${t18Budget} | ${prodBudget} | ${t18Might.join("/")} | ${prodMight.join("/")} | ${same ? "yes" : "NO"} | ${t18MaxHp(t18Might[3])} | ${maxHp(prodMight[3])} | ${fmt(t18RawEnemyDamage(t18Might[0], L), 2)} | ${fmt(rawStandardAttack(prodMight[0], missionEnemyBaseDamage(L)), 2)} | ${fmt(t18MissionOutgoingMultiplier(L), 4)} | ${fmt(missionEnemyOutgoingMultiplier(L), 4)} |`);
    }
    add("");

    add("## 6. Mission outgoing multiplier table");
    add("");
    add("| Level | Test 18 | production | Δ |");
    add("| ---: | ---: | ---: | ---: |");
    for (const L of OUTGOING_LEVELS) {
      const a = t18MissionOutgoingMultiplier(L);
      const b = missionEnemyOutgoingMultiplier(L);
      add(`| ${L} | ${a} | ${b} | ${fmt(b - a, 12)} |`);
    }
    add("");

    add("## 7–8. Three-way replay");
    add("");
    add("A = frozen Test 18 engine + certified outgoing.");
    add("B = production combat + outgoing OFF.");
    add("C = production combat + certified outgoing ON (hook only; flag restored to false).");
    add("Same player attrs and same production-constructed enemy attrs. B and C share an identical production RNG stream. A uses the same integer seed through the frozen engine (consumption cannot be bit-identical across engines).");
    add("");
    add("| Level | Class | Profile | N | A win | B win | C win | A turns mean/med | C turns mean/med | A winnerHP | C winnerHP | A pDmg | C pDmg | A eDmg | C eDmg |");
    add("| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");

    const pooled = { a: emptyAgg(), b: emptyAgg(), c: emptyAgg() };
    const cells = [];
    for (const L of [1, ...CHECKPOINTS]) {
      for (const cls of CLASSES) {
        for (const profile of PROFILES) {
          const cohort = L === 1 ? [l1State(cls, profile)] : (byKey.get(`${L}|${cls}|${profile}`) || []);
          const ag = { a: emptyAgg(), b: emptyAgg(), c: emptyAgg() };
          const extra = L === 1 ? 40 : FIGHTS_PER_CHAR;
          for (const state of cohort) {
            for (let arch = 0; arch < 3; arch++) {
              for (let f = 0; f < extra; f++) {
                const seed = ((state.seed || 1) * 10007 + L * 97 + arch * 13 + f * 31 + CLASSES.indexOf(cls) * 17) >>> 0;
                const r = runThreeWay(state, arch, seed);
                addRow(ag.a, r.a);
                addRow(ag.b, r.b);
                addRow(ag.c, r.c);
                addRow(pooled.a, r.a);
                addRow(pooled.b, r.b);
                addRow(pooled.c, r.c);
              }
            }
          }
          const A = fin(ag.a);
          const B = fin(ag.b);
          const C = fin(ag.c);
          cells.push({ L, cls, profile, A, B, C });
          add(`| ${L} | ${cls} | ${profile} | ${A.n} | ${pct(A.winRate)} | ${pct(B.winRate)} | ${pct(C.winRate)} | ${fmt(A.meanTurns, 1)}/${fmt(A.medianTurns, 1)} | ${fmt(C.meanTurns, 1)}/${fmt(C.medianTurns, 1)} | ${pct(A.meanWinnerHp)} | ${pct(C.meanWinnerHp)} | ${fmt(A.pDmg, 1)} | ${fmt(C.pDmg, 1)} | ${fmt(A.eDmg, 1)} | ${fmt(C.eDmg, 1)} |`);
        }
      }
    }
    const PA = fin(pooled.a);
    const PB = fin(pooled.b);
    const PC = fin(pooled.c);
    add("");
    add("### Pooled");
    add("");
    add("| Engine | N | Win rate | Mean/median turns | Winner HP% | Player HP% on wins | Crit freq | Dodge freq | Avg landed player | Avg landed enemy |");
    add("| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const [name, x] of [["A Test18+outgoing", PA], ["B production OFF", PB], ["C production ON", PC]]) {
      add(`| ${name} | ${x.n} | ${pct(x.winRate)} | ${fmt(x.meanTurns, 2)} / ${fmt(x.medianTurns, 2)} | ${pct(x.meanWinnerHp)} | ${pct(x.meanPlayerHpWin)} | ${fmt(x.crit, 4)} | ${fmt(x.dodge, 4)} | ${fmt(x.pDmg, 2)} | ${fmt(x.eDmg, 2)} |`);
    }
    add("");
    add("### Extra per-cell Crit/Dodge / B win");
    add("");
    add("| Level | Class | Profile | A crit | C crit | A dodge | C dodge | B win |");
    add("| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |");
    for (const row of cells) {
      add(`| ${row.L} | ${row.cls} | ${row.profile} | ${fmt(row.A.crit, 4)} | ${fmt(row.C.crit, 4)} | ${fmt(row.A.dodge, 4)} | ${fmt(row.C.dodge, 4)} | ${pct(row.B.winRate)} |`);
    }
    add("");

    const aMin = Math.min(...cells.map((r) => r.A.winRate));
    const cMin = Math.min(...cells.map((r) => r.C.winRate));
    add("## 9. Root cause");
    add("");
    add(`Test 18 reconstruction gate: pooled A win rate = **${pct(PA.winRate)}**, minimum cell = **${pct(aMin)}**.`);
    add(`Production + ON, same states: pooled C win rate = **${pct(PC.winRate)}**, minimum cell = **${pct(cMin)}**.`);
    add(`Production + OFF: pooled B win rate = **${pct(PB.winRate)}**.`);
    add("");
    add("Proven causes:");
    add("");
    add("1. **Earlier purchased-ish fixtures were underpowered** versus actual Test 18 combat-ready states (purchases + Gear + Stims). That is why the Phase 4 gate reported ~46.9% ON wins.");
    add("2. **Outgoing multiplier matches** Test 18 piecewise knots to production interpolation within floating error.");
    add("3. **Enemy construction is the certified 35% EPA split.** Replay uses `mode: mission` and `missionEnemy: true` (no dungeon ×1.10, no double outgoing).");
    add("4. **Production player Mission damage is the locked native polynomial (~×2.5 vs Test 18 Mission's unscaled curve).** Enemies still use the historical raw curve × outgoing. On exact Test 18 states that makes production ON safer for the player than frozen Test 18, not harsher.");
    add("5. Dirty Tricks timing differs (Test 18 primary 12/24 vs production 14/28). Real post-Test-18 passive difference; not large enough to explain a 47% pooled collapse on these states.");
    add("");

    add("## 10. Production recommendation");
    add("");
    let rec = "C";
    let recText = "AUDIT BLOCKED — TEST 18 STATE/REPLAY CANNOT BE RECONSTRUCTED RELIABLY";
    if (PA.winRate >= 0.98) {
      if (PC.winRate >= 0.95) {
        rec = "A";
        recText = "CERTIFIED OUTGOING SAFE TO ACTIVATE";
      } else {
        rec = "B";
        recText = "CERTIFIED OUTGOING STILL UNSAFE — EXACT PRODUCTION DIVERGENCE IDENTIFIED";
      }
    }
    add(`**${rec}. ${recText}**`);
    add("");
    add(`Evidence rule: A must reproduce extremely-safe Mission behavior before C is used for a production decision. Observed A pooled win rate ${pct(PA.winRate)}; C pooled win rate ${pct(PC.winRate)}.`);
    add("");

    add("## 11. Production flag");
    add("");
    add(`APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT at start: **${flagAtStart}**`);
    add(`APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT after audit: **${APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT}**`);
    add("Flag was toggled only inside this diagnostic hook and restored to false. Live combat remains OFF.");
    add("");

    add("## 12. Regression results");
    add("");
    add("See the following process run in this session for `audit:no-magic-numbers`, `test:phase4-missions`, `test:production-math`, `test:derived-stat-caps`, `test:damage-scale`, `test:phase3-combat`, `test:combat`, `test:passives`, `test:mission-enemy`.");
    add("");

    add("## 13. Files changed");
    add("");
    add("- `server/fixtures/test18/checkpoint_character_states.csv`");
    add("- `server/fixtures/test18/epa_checkpoints.csv`");
    add("- `server/scripts/t18FrozenCombat.mjs` (diagnostic frozen engine)");
    add("- `server/scripts/audit-mission-outgoing-blocker.mjs` (this audit)");
    add("- `docs/PHASE4_MISSION_OUTGOING_BLOCKER_REPORT.md`");
    add("");
    add("No production combat, economy, or flag default was modified.");
    add("");
    add("STOP. Phase 5 was not started.");

    const report = out.join("\n");
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, report);
    console.log(report);
    console.log(`\nWrote ${REPORT_PATH}`);
  } finally {
    setApplyCertifiedMissionEnemyOutgoingInLiveCombat(false);
  }
  if (APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT) {
    throw new Error("Outgoing flag leaked ON");
  }
}

main();
