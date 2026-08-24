/**
 * DIAGNOSTIC ONLY — Phase 4 Mission combat pacing / enemy-HP normalization.
 * Production gameplay values are not changed. Live outgoing flag is restored false.
 *
 *   node --import ./server/scripts/register-src-alias.mjs ./server/scripts/audit-mission-combat-pacing.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MISSION_ENEMY_ARCHETYPE_CLASS,
  PLAYER_BASE_DAMAGE_FLAT,
  PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT,
  PLAYER_COMBAT_CONTEXT_MULT,
  RAW_ATTACK_COEFFICIENT,
  STANDARD_ATTACK_FLAT,
} from "../../src/lib/productionMath/constants.js";
import {
  missionEnemyAttributes,
  startingAttributesForClass,
} from "../../src/lib/productionMath/attributes.js";
import {
  missionEnemyOutgoingMultiplier,
  playerBaseDamage,
} from "../../src/lib/productionMath/combatStats.js";
import { roundHalfEven } from "../../src/lib/productionMath/rounding.js";
import {
  APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT,
  inferCombatContent,
  setApplyCertifiedMissionEnemyOutgoingInLiveCombat,
} from "../../src/lib/combatMath.js";
import {
  consumeStimOpening,
  maybeOrbitalAssistant,
  maybeUnlockDirtyTricks,
  onCombatStart,
  onTurnStart,
  snapshotPassiveHud,
} from "../../src/lib/classPassives.js";
import {
  buildFighter,
  resolveNormalAttack,
  simulateBattle,
} from "../../src/lib/arenaEngine.js";
import {
  T18_CLASS_INDEX,
  T18_CLASS_NAMES,
  t18MaxHp,
  t18MissionFight,
  t18MissionOutgoingMultiplier,
  t18PrimaryIndex,
  t18RawPlayerDamage,
} from "./t18FrozenCombat.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STATE_CSV = path.join(ROOT, "server", "fixtures", "test18", "checkpoint_character_states.csv");
const REPORT_PATH = path.join(ROOT, "docs", "PHASE4_MISSION_COMBAT_PACING_REPORT.md");
const JSON_PATH = path.join(ROOT, "docs", "PHASE4_MISSION_COMBAT_PACING_RESULTS.json");

const CHECKPOINTS = [10, 25, 50, 75, 100, 150, 200];
const PROFILES = ["F2P", "Light", "Premium"];
const CLASSES = [...T18_CLASS_NAMES];
const FIGHTS_PER_CHAR = 4;
const L1_FIGHTS = 40;
const ARCHETYPE_COUNT = 3;
const MINIMUM_SCALED_ENEMY_HP = 1;
const INITIATIVE_EVEN_SPLIT = 0.5;
const DIAGNOSTIC_COMBAT_ROUND_CAP = 5000;

const PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW =
  PLAYER_BASE_DAMAGE_FLAT / STANDARD_ATTACK_FLAT;
const NATIVE_PRIMARY_COEFFICIENT_OVER_HISTORICAL_RAW =
  PLAYER_BASE_DAMAGE_PRIMARY_COEFFICIENT / RAW_ATTACK_COEFFICIENT;
const MILD_SURVIVABILITY_ABOVE_NATIVE_NORMALIZATION = 0.25;
const MODERATE_SURVIVABILITY_ABOVE_NATIVE_NORMALIZATION = 0.50;
const STRONG_SURVIVABILITY_ABOVE_NATIVE_NORMALIZATION = 0.75;

const MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES = Object.freeze([
  Object.freeze({ id: "current_production_hp", label: "1.00", scale: 1 }),
  Object.freeze({
    id: "native_damage_normalization",
    label: "2.50",
    scale: PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW,
  }),
  Object.freeze({
    id: "native_plus_mild_survivability",
    label: "2.75",
    scale: PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW + MILD_SURVIVABILITY_ABOVE_NATIVE_NORMALIZATION,
  }),
  Object.freeze({
    id: "native_plus_moderate_survivability",
    label: "3.00",
    scale: PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW + MODERATE_SURVIVABILITY_ABOVE_NATIVE_NORMALIZATION,
  }),
  Object.freeze({
    id: "native_plus_strong_survivability",
    label: "3.25",
    scale: PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW + STRONG_SURVIVABILITY_ABOVE_NATIVE_NORMALIZATION,
  }),
]);

const OUTGOING_CHECKSUM_LEVELS = Object.freeze([
  Object.freeze({ level: 1, expected: 0.3 }),
  Object.freeze({ level: 10, expected: 0.35 }),
  Object.freeze({ level: 15, expected: 0.5 }),
  Object.freeze({ level: 20, expected: 2.5 }),
  Object.freeze({ level: 25, expected: 2.5 + (25 - 20) * (6 - 2.5) / (50 - 20) }),
  Object.freeze({ level: 50, expected: 6 }),
  Object.freeze({ level: 75, expected: 6 + (75 - 50) * (10 - 6) / (100 - 50) }),
  Object.freeze({ level: 100, expected: 10 }),
  Object.freeze({ level: 150, expected: 10 + (150 - 100) * (12 - 10) / (200 - 100) }),
  Object.freeze({ level: 200, expected: 12 }),
]);

const GUIDELINE_WIN_RATE_FLOOR = 0.99;
const GUIDELINE_WINNER_HP_LO = 0.80;
const GUIDELINE_WINNER_HP_HI = 0.85;
const GUIDELINE_TURNS_LO = 6;
const GUIDELINE_TURNS_HI = 10;

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
function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
function fmt(v, d = 3) { return v == null || Number.isNaN(Number(v)) ? "n/a" : Number(v).toFixed(d); }
function pct(v) { return `${(100 * Number(v || 0)).toFixed(1)}%`; }

function loadStates() {
  return parseCsv(STATE_CSV).map((r) => ({
    profile: r.profile,
    className: r.class,
    seed: n(r.seed),
    level: n(r.level),
    total: n(r.total_attrs),
    attrs: [n(r.STR), n(r.AGI), n(r.INT), n(r.VIT), n(r.LUCK)],
    primary: n(r.primary),
    hp: n(r.hp),
  }));
}

function l1State(className, profile) {
  const attrs = [...startingAttributesForClass(className)];
  const pri = t18PrimaryIndex(T18_CLASS_INDEX[className]);
  return {
    profile, className, seed: 0, level: 1, total: sum5(attrs), attrs,
    primary: attrs[pri], hp: t18MaxHp(attrs[3]),
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

function fighterFingerprint(fighter) {
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
  };
}

function scaleEnemyMaxHp(fighter, scale) {
  const unscaledMaxHp = fighter.maxHp;
  const scaledMaxHp = Math.max(MINIMUM_SCALED_ENEMY_HP, roundHalfEven(unscaledMaxHp * scale));
  fighter.maxHp = scaledMaxHp;
  fighter.hp = scaledMaxHp;
  return { unscaledMaxHp, scaledMaxHp };
}

function simulateMissionPacingBattle(player, opp, opts = {}) {
  const { rng = Math.random } = opts || {};
  const forcedDamageTypeEnum = opts?.forceDamageTypeEnum ?? null;
  const forcedCanDodge = typeof opts?.forceCanDodge === "boolean" ? opts.forceCanDodge : true;
  const content = inferCombatContent(opts, player, opp);
  const hpScale = opts.diagnosticEnemyMaxHpScale == null ? 1 : Number(opts.diagnosticEnemyMaxHpScale);

  const A = buildFighter(player, [], "player", { content });
  const B = buildFighter(opp, [], "opponent", { content });
  const enemyFingerprint = fighterFingerprint(B);
  const hp = scaleEnemyMaxHp(B, hpScale);

  const events = [];
  events.push(...onCombatStart(A, rng));
  events.push(...onCombatStart(B, rng));

  let attacker;
  let defender;
  let initiativeFirstSide;
  const aOpening = A.passiveState?.openingCharges || 0;
  const bOpening = B.passiveState?.openingCharges || 0;
  if (aOpening > 0 && bOpening > 0) {
    attacker = rng() < INITIATIVE_EVEN_SPLIT ? A : B;
    defender = attacker === A ? B : A;
    initiativeFirstSide = attacker.side;
  } else if (aOpening > 0) {
    attacker = A; defender = B; initiativeFirstSide = "player";
  } else if (bOpening > 0) {
    attacker = B; defender = A; initiativeFirstSide = "opponent";
  } else {
    const playerGoesFirst = rng() < INITIATIVE_EVEN_SPLIT;
    attacker = playerGoesFirst ? A : B;
    defender = playerGoesFirst ? B : A;
    initiativeFirstSide = attacker.side;
  }

  if (aOpening > 0 || bOpening > 0) {
    events.push({
      type: "passive",
      passive: "Dirty Tricks",
      kind: "stim_injector_turn_order",
      side: initiativeFirstSide,
      text: "Stim Injector takes the next two attack turns",
    });
  }
  events.push({
    type: "initiative",
    opening_side: initiativeFirstSide,
    attacker: initiativeFirstSide,
    text: `${initiativeFirstSide === "player" ? A.name : B.name} opens combat`,
  });

  const telemetry = {
    totalTurns: 0, playerTurns: 0, opponentTurns: 0, playerDamage: 0, opponentDamage: 0,
    critCount: 0, dodgeCount: 0, forcedMissCount: 0, passiveActivations: 0,
  };

  let round = 0;
  while (A.hp > 0 && B.hp > 0 && round < DIAGNOSTIC_COMBAT_ROUND_CAP) {
    round += 1;
    telemetry.totalTurns = round;
    if (attacker.side === "player") telemetry.playerTurns += 1;
    else telemetry.opponentTurns += 1;

    const stimStoleTurn = maybeUnlockDirtyTricks(A, round, rng, events)
      || maybeUnlockDirtyTricks(B, round, rng, events);
    if (stimStoleTurn) {
      if ((A.passiveState?.openingCharges || 0) > 0 && attacker !== A) {
        attacker = A; defender = B;
      } else if ((B.passiveState?.openingCharges || 0) > 0 && attacker !== B) {
        attacker = B; defender = A;
      }
    }

    const ownTurn = attacker.side === "player" ? telemetry.playerTurns : telemetry.opponentTurns;
    events.push(...onTurnStart(attacker, rng));
    const eventStart = events.length;
    maybeOrbitalAssistant(attacker, defender, events, rng);
    let result = { killed: A.hp <= 0 || B.hp <= 0 };
    if (A.hp > 0 && B.hp > 0) {
      result = resolveNormalAttack(attacker, defender, events, {
        rng, forcedDamageTypeEnum, forcedCanDodge, totalTurn: round, ownTurn,
      });
    }
    for (let i = eventStart; i < events.length; i++) {
      const ev = events[i];
      if (ev?.type === "dodge") telemetry.dodgeCount += 1;
      if (ev?.type === "miss") telemetry.forcedMissCount += 1;
      if (ev?.crit) telemetry.critCount += 1;
      if ((ev?.type === "attack" || ev?.kind === "fire_support") && Number(ev.damage || 0) > 0) {
        if (ev.attacker === "player") telemetry.playerDamage += Number(ev.damage);
        else if (ev.attacker === "opponent") telemetry.opponentDamage += Number(ev.damage);
      }
      if (ev?.type === "passive") telemetry.passiveActivations += 1;
    }
    if (result.killed || A.hp <= 0 || B.hp <= 0) break;
    if (consumeStimOpening(attacker, events)) continue;
    [attacker, defender] = [defender, attacker];
  }

  return {
    events,
    winner: A.hp > 0 ? "player" : "opponent",
    playerMaxHp: A.maxHp,
    opponentMaxHp: B.maxHp,
    initiativeFirstSide,
    content,
    telemetry,
    playerEnd: { hp: A.hp, barrier: A.barrier, ...snapshotPassiveHud(A) },
    opponentEnd: { hp: B.hp, barrier: B.barrier, ...snapshotPassiveHud(B) },
    diagnostic: { ...hp, enemyFingerprint },
  };
}

function summarizeProduction(result) {
  const events = result.events || [];
  const pHit = [];
  const eHit = [];
  let crits = 0;
  let dodges = 0;
  let attacks = 0;
  let pAttempt = 0;
  let eAttempt = 0;
  let pLanded = 0;
  let eLanded = 0;
  for (const e of events) {
    const isAttempt = e.isNormalAttack || e.type === "attack" || e.type === "dodge" || e.type === "miss";
    if (isAttempt && e.attacker === "player") pAttempt += 1;
    if (isAttempt && e.attacker === "opponent") eAttempt += 1;
    if (e.type === "dodge") dodges += 1;
    if (e.type === "attack") {
      attacks += 1;
      if (e.crit) crits += 1;
      if (e.attacker === "player") { pLanded += 1; if (e.damage > 0) pHit.push(e.damage); }
      if (e.attacker === "opponent") { eLanded += 1; if (e.damage > 0) eHit.push(e.damage); }
    }
  }
  const win = result.winner === "player";
  const pMax = result.playerMaxHp || 1;
  const eMax = result.opponentMaxHp || 1;
  return {
    win: win ? 1 : 0,
    turns: result.telemetry?.totalTurns ?? 0,
    playerHpWin: win ? (result.playerEnd?.hp ?? 0) / pMax : null,
    crit: attacks ? crits / attacks : 0,
    dodge: (attacks + dodges) ? dodges / (attacks + dodges) : 0,
    pDmg: mean(pHit),
    eDmg: mean(eHit),
    pAttempt,
    eAttempt,
    pLanded,
    eLanded,
    enemyMaxHp: eMax,
    unscaledEnemyMaxHp: result.diagnostic?.unscaledMaxHp ?? eMax,
    fracRemoved: pHit.length && eMax ? mean(pHit) / eMax : 0,
    enemyFingerprint: result.diagnostic?.enemyFingerprint || null,
  };
}

function summarizeT18(result) {
  const tel = result.tel;
  const attempts = tel.playerAttempts + tel.enemyAttempts;
  const win = result.win === 1;
  const pDmg = tel.playerLanded ? tel.playerDamage / tel.playerLanded : 0;
  return {
    win: win ? 1 : 0,
    turns: result.turns,
    playerHpWin: win ? result.php / result.pmax : null,
    crit: attempts ? (tel.playerCrits + tel.enemyCrits) / attempts : 0,
    dodge: attempts ? (tel.playerDodges + tel.enemyDodges) / attempts : 0,
    pDmg,
    eDmg: tel.enemyLanded ? tel.enemyDamage / tel.enemyLanded : 0,
    pAttempt: tel.playerAttempts,
    eAttempt: tel.enemyAttempts,
    pLanded: tel.playerLanded,
    eLanded: tel.enemyLanded,
    enemyMaxHp: result.emax,
    unscaledEnemyMaxHp: result.emax,
    fracRemoved: result.emax ? pDmg / result.emax : 0,
  };
}

function emptyAgg() {
  return {
    n: 0, wins: 0, turns: [], playerHpWin: [], crit: [], dodge: [], pDmg: [], eDmg: [],
    pAttempt: [], eAttempt: [], pLanded: [], eLanded: [], fracRemoved: [],
    enemyMaxHp: [], unscaledEnemyMaxHp: [],
  };
}

function addRow(agg, row) {
  agg.n += 1;
  agg.wins += row.win;
  agg.turns.push(row.turns);
  if (row.playerHpWin != null) agg.playerHpWin.push(row.playerHpWin);
  agg.crit.push(row.crit);
  agg.dodge.push(row.dodge);
  agg.pDmg.push(row.pDmg);
  agg.eDmg.push(row.eDmg);
  agg.pAttempt.push(row.pAttempt);
  agg.eAttempt.push(row.eAttempt);
  agg.pLanded.push(row.pLanded);
  agg.eLanded.push(row.eLanded);
  agg.fracRemoved.push(row.fracRemoved);
  agg.enemyMaxHp.push(row.enemyMaxHp);
  agg.unscaledEnemyMaxHp.push(row.unscaledEnemyMaxHp);
}

function fin(agg) {
  const winRate = agg?.n ? agg.wins / agg.n : 0;
  return {
    n: agg?.n || 0,
    winRate,
    lossRate: 1 - winRate,
    meanTurns: mean(agg?.turns || []),
    medianTurns: median(agg?.turns || []),
    p10Turns: quantile(agg?.turns || [], 0.1),
    p50Turns: quantile(agg?.turns || [], 0.5),
    p90Turns: quantile(agg?.turns || [], 0.9),
    meanWinnerHp: mean(agg?.playerHpWin || []),
    medianWinnerHp: median(agg?.playerHpWin || []),
    p10WinnerHp: quantile(agg?.playerHpWin || [], 0.1),
    p50WinnerHp: quantile(agg?.playerHpWin || [], 0.5),
    p90WinnerHp: quantile(agg?.playerHpWin || [], 0.9),
    meanEnemyAttempt: mean(agg?.eAttempt || []),
    meanEnemyLanded: mean(agg?.eLanded || []),
    meanPlayerAttempt: mean(agg?.pAttempt || []),
    meanPlayerLanded: mean(agg?.pLanded || []),
    pDmg: mean(agg?.pDmg || []),
    eDmg: mean(agg?.eDmg || []),
    crit: mean(agg?.crit || []),
    dodge: mean(agg?.dodge || []),
    fracRemoved: mean(agg?.fracRemoved || []),
    meanEnemyMaxHp: mean(agg?.enemyMaxHp || []),
    meanUnscaledEnemyMaxHp: mean(agg?.unscaledEnemyMaxHp || []),
  };
}

function guidelineNotes(s) {
  const notes = [];
  if (s.winRate + 1e-12 >= GUIDELINE_WIN_RATE_FLOOR) notes.push("win-safety");
  if (s.meanWinnerHp >= GUIDELINE_WINNER_HP_LO && s.meanWinnerHp <= GUIDELINE_WINNER_HP_HI) notes.push("winner-HP-band");
  if (s.meanTurns >= GUIDELINE_TURNS_LO && s.meanTurns <= GUIDELINE_TURNS_HI) notes.push("turn-band");
  return notes;
}
function hpBandDistance(s) {
  if (s.meanWinnerHp >= GUIDELINE_WINNER_HP_LO && s.meanWinnerHp <= GUIDELINE_WINNER_HP_HI) return 0;
  return s.meanWinnerHp < GUIDELINE_WINNER_HP_LO
    ? GUIDELINE_WINNER_HP_LO - s.meanWinnerHp
    : s.meanWinnerHp - GUIDELINE_WINNER_HP_HI;
}
function turnBandDistance(s) {
  if (s.meanTurns >= GUIDELINE_TURNS_LO && s.meanTurns <= GUIDELINE_TURNS_HI) return 0;
  return s.meanTurns < GUIDELINE_TURNS_LO
    ? GUIDELINE_TURNS_LO - s.meanTurns
    : s.meanTurns - GUIDELINE_TURNS_HI;
}
function fingerprintsEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function mapGet(map, key) {
  if (!map.has(key)) map.set(key, emptyAgg());
  return map.get(key);
}

function main() {
  const flagAtStart = APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT;
  const lines = [];
  const add = (line = "") => lines.push(line);
  try {
    if (PLAYER_COMBAT_CONTEXT_MULT !== 1) {
      throw new Error(`PLAYER_COMBAT_CONTEXT_MULT must remain 1, got ${PLAYER_COMBAT_CONTEXT_MULT}`);
    }
    if (Math.abs(PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW - NATIVE_PRIMARY_COEFFICIENT_OVER_HISTORICAL_RAW) > 1e-12) {
      throw new Error("Native/historical damage ratio mismatch between flat and primary coefficient");
    }

    const states = loadStates();
    const byKey = new Map();
    for (const s of states) {
      const key = `${s.level}|${s.className}|${s.profile}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(s);
    }

    const outgoingRows = OUTGOING_CHECKSUM_LEVELS.map((row) => {
      const got = missionEnemyOutgoingMultiplier(row.level);
      const t18 = t18MissionOutgoingMultiplier(row.level);
      return { ...row, got, t18, delta: got - row.expected };
    });
    const outgoingOk = outgoingRows.every((r) => Math.abs(r.delta) < 1e-12);

    setApplyCertifiedMissionEnemyOutgoingInLiveCombat(true);

    const identityMismatches = [];
    for (const cls of CLASSES.slice(0, 2)) {
      const state = l1State(cls, "F2P");
      const player = snapshotPlayer(state);
      const enemy = makeEnemy(1, 0);
      const seed = 4242;
      const a = simulateBattle(player, enemy, [], [], { rng: mulberry32(seed), mode: "mission" });
      const b = simulateMissionPacingBattle(player, enemy, {
        rng: mulberry32(seed), mode: "mission", diagnosticEnemyMaxHpScale: 1,
      });
      if (a.winner !== b.winner || a.telemetry.totalTurns !== b.telemetry.totalTurns
        || a.playerEnd.hp !== b.playerEnd.hp || a.opponentMaxHp !== b.opponentMaxHp) {
        identityMismatches.push({ cls, aTurns: a.telemetry.totalTurns, bTurns: b.telemetry.totalTurns });
      }
    }
    if (identityMismatches.length) {
      throw new Error(`scale=1 wrapper diverged from simulateBattle: ${JSON.stringify(identityMismatches)}`);
    }

    const pooled = Object.fromEntries(MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES.map((c) => [c.id, emptyAgg()]));
    const frozenPooled = emptyAgg();
    const cells = [];
    const byLevel = Object.fromEntries(MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES.map((c) => [c.id, new Map()]));
    const byClass = Object.fromEntries(MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES.map((c) => [c.id, new Map()]));
    const byProfile = Object.fromEntries(MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES.map((c) => [c.id, new Map()]));
    const frozenByLevel = new Map();
    let fingerprintMismatches = 0;
    const nativeRatioSamples = [];

    for (const L of [1, ...CHECKPOINTS]) {
      for (const cls of CLASSES) {
        for (const profile of PROFILES) {
          const cohort = L === 1 ? [l1State(cls, profile)] : (byKey.get(`${L}|${cls}|${profile}`) || []);
          const cellAggs = Object.fromEntries(MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES.map((c) => [c.id, emptyAgg()]));
          const extra = L === 1 ? L1_FIGHTS : FIGHTS_PER_CHAR;
          for (const state of cohort) {
            for (let arch = 0; arch < ARCHETYPE_COUNT; arch++) {
              for (let f = 0; f < extra; f++) {
                const seed = ((state.seed || 1) * 10007 + L * 97 + arch * 13 + f * 31 + CLASSES.indexOf(cls) * 17) >>> 0;
                const enemy = makeEnemy(L, arch);
                const player = snapshotPlayer(state);
                const pri = t18PrimaryIndex(T18_CLASS_INDEX[state.className]);

                const frozen = summarizeT18(t18MissionFight(
                  T18_CLASS_INDEX[state.className], L, state.attrs, L, enemy.attrs, mulberry32(seed),
                ));
                addRow(frozenPooled, frozen);
                addRow(mapGet(frozenByLevel, L), frozen);
                nativeRatioSamples.push(playerBaseDamage(state.attrs[pri]) / Math.max(1e-12, t18RawPlayerDamage(state.attrs[pri])));

                let baselineFp = null;
                for (const cand of MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES) {
                  const result = simulateMissionPacingBattle(player, enemy, {
                    rng: mulberry32(seed + 1),
                    mode: "mission",
                    diagnosticEnemyMaxHpScale: cand.scale,
                  });
                  const row = summarizeProduction(result);
                  if (!baselineFp) baselineFp = row.enemyFingerprint;
                  else if (!fingerprintsEqual(baselineFp, row.enemyFingerprint)) fingerprintMismatches += 1;
                  addRow(cellAggs[cand.id], row);
                  addRow(pooled[cand.id], row);
                  addRow(mapGet(byLevel[cand.id], L), row);
                  addRow(mapGet(byClass[cand.id], cls), row);
                  addRow(mapGet(byProfile[cand.id], profile), row);
                }
              }
            }
          }
          cells.push({
            L, cls, profile,
            ...Object.fromEntries(MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES.map((c) => [c.id, fin(cellAggs[c.id])])),
          });
        }
      }
    }

    setApplyCertifiedMissionEnemyOutgoingInLiveCombat(false);
    const flagAtEnd = APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT;
    const pooledFin = Object.fromEntries(MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES.map((c) => [c.id, fin(pooled[c.id])]));
    const frozenFin = fin(frozenPooled);
    const baseline = pooledFin.current_production_hp;
    const nativeCand = pooledFin.native_damage_normalization;

    const outliers = {};
    for (const cand of MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES) {
      const list = cells.map((cell) => ({ L: cell.L, cls: cell.cls, profile: cell.profile, s: cell[cand.id] }));
      outliers[cand.id] = {
        minWin: list.reduce((a, b) => (a.s.winRate <= b.s.winRate ? a : b)),
        lowHp: list.reduce((a, b) => (a.s.meanWinnerHp <= b.s.meanWinnerHp ? a : b)),
        highHp: list.reduce((a, b) => (a.s.meanWinnerHp >= b.s.meanWinnerHp ? a : b)),
        short: list.reduce((a, b) => (a.s.meanTurns <= b.s.meanTurns ? a : b)),
        long: list.reduce((a, b) => (a.s.meanTurns >= b.s.meanTurns ? a : b)),
      };
    }

    const scored = MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES.map((c) => {
      const s = pooledFin[c.id];
      return {
        ...c, s, notes: guidelineNotes(s), hpDist: hpBandDistance(s),
        turnDist: turnBandDistance(s), minCellWin: outliers[c.id].minWin.s.winRate,
      };
    });
    const safe = scored.filter((r) => r.s.winRate >= GUIDELINE_WIN_RATE_FLOOR && r.minCellWin >= GUIDELINE_WIN_RATE_FLOOR);
    const rec = [...(safe.length ? safe : scored)].sort((a, b) => (a.hpDist + a.turnDist / 100) - (b.hpDist + b.turnDist / 100))[0];

    add("# PHASE 4 — MISSION COMBAT PACING NORMALIZATION REPORT");
    add("");
    add("Diagnostic only. Production gameplay values were not changed.");
    add("Certified Mission enemy outgoing was enabled through the diagnostic hook only.");
    add("");
    add("## 1. Executive result");
    add("");
    add(`- Baseline HP ×1.00: N=${baseline.n}, win ${pct(baseline.winRate)}, mean turns ${fmt(baseline.meanTurns, 2)}, mean victory HP ${pct(baseline.meanWinnerHp)}, mean enemy attacks landed ${fmt(baseline.meanEnemyLanded, 2)}.`);
    add(`- Native-damage HP ×${fmt(PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW, 2)}: N=${nativeCand.n}, win ${pct(nativeCand.winRate)}, mean turns ${fmt(nativeCand.meanTurns, 2)}, mean victory HP ${pct(nativeCand.meanWinnerHp)}.`);
    add(`- Frozen Test 18: N=${frozenFin.n}, win ${pct(frozenFin.winRate)}, mean turns ${fmt(frozenFin.meanTurns, 2)}, mean victory HP ${pct(frozenFin.meanWinnerHp)}.`);
    add(`- Native/historical player Base Damage (sampled): ${fmt(mean(nativeRatioSamples), 6)} (algebraic ${fmt(PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW, 6)}).`);
    add(`- Closest pooled match among ${safe.length ? "win-safe" : "all"} candidates: **HP ×${rec.label}**. **No production change.**`);
    add("");
    add("## 2. Exact fixture source");
    add("");
    add("- Artifact: `server/fixtures/test18/checkpoint_character_states.csv`");
    add("- Method: direct load of retained Test 18 checkpoint rows (not a synthetic rebuild)");
    add("- Population: 6 classes × F2P / Light / Premium × original retained seeds");
    add("- Checkpoints: L10, L25, L50, L75, L100, L150, L200");
    add("- L1: reconstructed from production/Test 18 starting attributes. No L20.");
    add(`- Rows loaded: ${states.length}`);
    add("- F2P / Light / Premium are simulation fixture profiles, not production account classes.");
    add("");
    add("## 3. Baseline confirmation");
    add("");
    add("HP ×1.00 + certified outgoing ON (diagnostic hook). Prior blocker audit pooled production-ON: ~2.79 turns / ~95.6% winner HP / 100% wins.");
    add(`This run: mean turns **${fmt(baseline.meanTurns, 2)}**, median **${fmt(baseline.medianTurns, 2)}**, mean victory HP **${pct(baseline.meanWinnerHp)}**, win rate **${pct(baseline.winRate)}**, N=${baseline.n}.`);
    add(`Identity gate (×1.00 vs production simulateBattle): ${identityMismatches.length ? "FAILED" : "passed"}.`);
    add(`Outgoing checksum: ${outgoingOk ? "passed" : "FAILED"}.`);
    add("");
    add("| Level | expected | production | Test 18 | Δ vs expected |");
    add("| ---: | ---: | ---: | ---: | ---: |");
    for (const r of outgoingRows) add(`| ${r.level} | ${fmt(r.expected, 6)} | ${fmt(r.got, 6)} | ${fmt(r.t18, 6)} | ${fmt(r.delta, 12)} |`);
    add("");
    add("## 4. Candidate comparison");
    add("");
    add("Common-random-number replay: same player, enemy attributes, fight seed, initiative/variance/crit/dodge/passive RNG. Only enemy starting/max HP changes.");
    add("");
    add("| HP scale | battle N | win rate | mean turns | median turns | mean winner HP | P10 HP | P50 HP | P90 HP | enemy att. | enemy landed |");
    add("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    add(`| frozen T18 | ${frozenFin.n} | ${pct(frozenFin.winRate)} | ${fmt(frozenFin.meanTurns, 2)} | ${fmt(frozenFin.medianTurns, 2)} | ${pct(frozenFin.meanWinnerHp)} | ${pct(frozenFin.p10WinnerHp)} | ${pct(frozenFin.p50WinnerHp)} | ${pct(frozenFin.p90WinnerHp)} | ${fmt(frozenFin.meanEnemyAttempt, 2)} | ${fmt(frozenFin.meanEnemyLanded, 2)} |`);
    for (const c of MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES) {
      const s = pooledFin[c.id];
      add(`| ${c.label} | ${s.n} | ${pct(s.winRate)} | ${fmt(s.meanTurns, 2)} | ${fmt(s.medianTurns, 2)} | ${pct(s.meanWinnerHp)} | ${pct(s.p10WinnerHp)} | ${pct(s.p50WinnerHp)} | ${pct(s.p90WinnerHp)} | ${fmt(s.meanEnemyAttempt, 2)} | ${fmt(s.meanEnemyLanded, 2)} |`);
    }
    add("");
    add("| HP scale | P10/P50/P90 turns | player att./landed | avg landed pDmg | avg landed eDmg | crit | dodge | notes |");
    add("| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |");
    add(`| frozen T18 | ${fmt(frozenFin.p10Turns, 1)}/${fmt(frozenFin.p50Turns, 1)}/${fmt(frozenFin.p90Turns, 1)} | ${fmt(frozenFin.meanPlayerAttempt, 2)}/${fmt(frozenFin.meanPlayerLanded, 2)} | ${fmt(frozenFin.pDmg, 1)} | ${fmt(frozenFin.eDmg, 1)} | ${pct(frozenFin.crit)} | ${pct(frozenFin.dodge)} | historical engine |`);
    for (const c of MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES) {
      const s = pooledFin[c.id];
      add(`| ${c.label} | ${fmt(s.p10Turns, 1)}/${fmt(s.p50Turns, 1)}/${fmt(s.p90Turns, 1)} | ${fmt(s.meanPlayerAttempt, 2)}/${fmt(s.meanPlayerLanded, 2)} | ${fmt(s.pDmg, 1)} | ${fmt(s.eDmg, 1)} | ${pct(s.crit)} | ${pct(s.dodge)} | ${guidelineNotes(s).join(", ") || "outside bands"} |`);
    }
    add("");
    add("## 5. Level breakdown");
    add("");
    for (const c of MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES) {
      add(`### HP ×${c.label} (${c.id})`);
      add("");
      add("| Level | N | win | mean/median turns | P10/P90 turns | mean winner HP | P10/P90 HP | e att./landed | pDmg | eDmg |");
      add("| ---: | ---: | ---: | --- | --- | ---: | --- | --- | ---: | ---: |");
      for (const L of [1, ...CHECKPOINTS]) {
        const s = fin(byLevel[c.id].get(L));
        add(`| ${L} | ${s.n} | ${pct(s.winRate)} | ${fmt(s.meanTurns, 2)}/${fmt(s.medianTurns, 2)} | ${fmt(s.p10Turns, 1)}/${fmt(s.p90Turns, 1)} | ${pct(s.meanWinnerHp)} | ${pct(s.p10WinnerHp)}/${pct(s.p90WinnerHp)} | ${fmt(s.meanEnemyAttempt, 2)}/${fmt(s.meanEnemyLanded, 2)} | ${fmt(s.pDmg, 1)} | ${fmt(s.eDmg, 1)} |`);
      }
      add("");
    }
    add("## 6. Class breakdown");
    add("");
    for (const c of MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES) {
      add(`### HP ×${c.label}`);
      add("");
      add("| Class | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |");
      add("| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |");
      for (const cls of CLASSES) {
        const s = fin(byClass[c.id].get(cls));
        add(`| ${cls} | ${s.n} | ${pct(s.winRate)} | ${fmt(s.meanTurns, 2)} | ${pct(s.meanWinnerHp)} | ${pct(s.p10WinnerHp)}/${pct(s.p90WinnerHp)} | ${fmt(s.meanEnemyLanded, 2)} | ${fmt(s.pDmg, 1)} | ${fmt(s.eDmg, 1)} |`);
      }
      add("");
    }
    add("## 7. Profile breakdown");
    add("");
    for (const c of MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES) {
      add(`### HP ×${c.label}`);
      add("");
      add("| Profile | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |");
      add("| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |");
      for (const profile of PROFILES) {
        const s = fin(byProfile[c.id].get(profile));
        add(`| ${profile} | ${s.n} | ${pct(s.winRate)} | ${fmt(s.meanTurns, 2)} | ${pct(s.meanWinnerHp)} | ${pct(s.p10WinnerHp)}/${pct(s.p90WinnerHp)} | ${fmt(s.meanEnemyLanded, 2)} | ${fmt(s.pDmg, 1)} | ${fmt(s.eDmg, 1)} |`);
      }
      add("");
    }
    add("## 8. Outlier cells");
    add("");
    add("Per candidate, worst/best cells among level × class × profile.");
    add("");
    for (const c of MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES) {
      const o = outliers[c.id];
      add(`### HP ×${c.label}`);
      add("");
      add(`- Minimum win-rate cell: L${o.minWin.L} ${o.minWin.cls} ${o.minWin.profile} — ${pct(o.minWin.s.winRate)} (N=${o.minWin.s.n})`);
      add(`- Lowest mean winner HP: L${o.lowHp.L} ${o.lowHp.cls} ${o.lowHp.profile} — ${pct(o.lowHp.s.meanWinnerHp)}, ${fmt(o.lowHp.s.meanTurns, 2)} turns`);
      add(`- Highest mean winner HP: L${o.highHp.L} ${o.highHp.cls} ${o.highHp.profile} — ${pct(o.highHp.s.meanWinnerHp)}, ${fmt(o.highHp.s.meanTurns, 2)} turns`);
      add(`- Shortest mean-turn cell: L${o.short.L} ${o.short.cls} ${o.short.profile} — ${fmt(o.short.s.meanTurns, 2)} turns, HP ${pct(o.short.s.meanWinnerHp)}`);
      add(`- Longest mean-turn cell: L${o.long.L} ${o.long.cls} ${o.long.profile} — ${fmt(o.long.s.meanTurns, 2)} turns, HP ${pct(o.long.s.meanWinnerHp)}`);
      add("");
    }
    add("## 9. ×2.50 mathematical parity");
    add("");
    add("Relative HP removed per landed player attack = mean(average landed player damage / Mission enemy max HP).");
    add("If ×2.50 restores historical relative pacing, production×2.50 should approach frozen Test 18.");
    add("");
    add(`Native/historical Base Damage ratio (flat): **${fmt(PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW, 6)}**.`);
    add(`Native/historical primary coefficient ratio: **${fmt(NATIVE_PRIMARY_COEFFICIENT_OVER_HISTORICAL_RAW, 6)}**.`);
    add(`Enemy fingerprint mismatches across HP candidates: **${fingerprintMismatches}** (must be 0).`);
    add("");
    add("| Level | frozen frac | prod ×1.00 frac | prod ×2.50 frac | ×2.50 / frozen | ×1.00 / frozen |");
    add("| ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const L of [1, ...CHECKPOINTS]) {
      const fz = fin(frozenByLevel.get(L));
      const x1 = fin(byLevel.current_production_hp.get(L));
      const x25 = fin(byLevel.native_damage_normalization.get(L));
      add(`| ${L} | ${fmt(fz.fracRemoved, 4)} | ${fmt(x1.fracRemoved, 4)} | ${fmt(x25.fracRemoved, 4)} | ${fmt(x25.fracRemoved / Math.max(1e-12, fz.fracRemoved), 3)} | ${fmt(x1.fracRemoved / Math.max(1e-12, fz.fracRemoved), 3)} |`);
    }
    const fzAll = frozenFin.fracRemoved;
    const x1All = pooledFin.current_production_hp.fracRemoved;
    const x25All = pooledFin.native_damage_normalization.fracRemoved;
    add(`| pooled | ${fmt(fzAll, 4)} | ${fmt(x1All, 4)} | ${fmt(x25All, 4)} | ${fmt(x25All / Math.max(1e-12, fzAll), 3)} | ${fmt(x1All / Math.max(1e-12, fzAll), 3)} |`);
    add("");
    add(`Mean unscaled production enemy max HP: ${fmt(pooledFin.current_production_hp.meanUnscaledEnemyMaxHp, 1)}.`);
    add(`Mean scaled ×2.50 enemy max HP: ${fmt(pooledFin.native_damage_normalization.meanEnemyMaxHp, 1)} (ratio ${fmt(pooledFin.native_damage_normalization.meanEnemyMaxHp / Math.max(1, pooledFin.current_production_hp.meanUnscaledEnemyMaxHp), 4)}).`);
    add(`Frozen mean enemy max HP: ${fmt(frozenFin.meanEnemyMaxHp, 1)}.`);
    add("");
    add("Player displayed/native Damage was not reduced. No MissionPlayerDamageMultiplier exists in this diagnostic.");
    add("");
    add("## 10. Recommendation");
    add("");
    add("Guidelines (not hard gates): ~99%+ wins; typical victory HP ~80–85%; routine turns ~6–10; no severe class/profile hole.");
    add("");
    add("| candidate | win | min cell win | mean turns (Δ to 6–10) | mean HP (Δ to 80–85%) | guideline hits |");
    add("| --- | ---: | ---: | --- | --- | --- |");
    for (const row of scored) {
      add(`| ×${row.label} | ${pct(row.s.winRate)} | ${pct(row.minCellWin)} | ${fmt(row.s.meanTurns, 2)} (Δ ${fmt(row.turnDist, 2)}) | ${pct(row.s.meanWinnerHp)} (Δ ${fmt(row.hpDist, 3)}) | ${row.notes.join(", ") || "none"} |`);
    }
    add("");
    add(`Closest pooled match among ${safe.length ? "win-safe" : "all"} candidates: **HP ×${rec.label}** (\`${rec.id}\`).`);
    add("This is a diagnostic recommendation only. **Do not implement it in this change.**");
    add("If later approved, name it in production as something like `MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION`, never a meaningless numeric alias.");
    add("");
    add("## 11. Production-state confirmation");
    add("");
    add(`- Flag at start: \`${flagAtStart}\``);
    add(`- Flag at end: \`${flagAtEnd}\``);
    add("- Live Mission outgoing remains **OFF** (`APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT === false`).");
    add("- No Mission HP multiplier committed to production.");
    add("- No player damage change.");
    add("- No enemy attribute / EPA / Base Damage / Crit / Dodge / resistance change.");
    add("- Phase 5 not started.");
    add(`- Diagnostic wrapper identity vs simulateBattle at ×1.00: ${identityMismatches.length ? "FAILED" : "passed"}.`);
    add(`- Enemy non-HP fingerprint stable across candidates: ${fingerprintMismatches === 0 ? "passed" : "FAILED"}.`);
    add("");
    add("## 12. Regression results");
    add("");
    add("See following agent command output. Expected green because production behavior is unchanged.");
    add("");
    add("## 13. Files changed");
    add("");
    add("- `server/scripts/audit-mission-combat-pacing.mjs` (diagnostic runner)");
    add("- `docs/PHASE4_MISSION_COMBAT_PACING_REPORT.md` (this report)");
    add("- `docs/PHASE4_MISSION_COMBAT_PACING_RESULTS.json` (machine tables)");
    add("");
    add("PHASE 4 MISSION PACING AUDIT COMPLETE — HUMAN HP NORMALIZATION DECISION REQUIRED");
    add("");

    fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
    fs.writeFileSync(JSON_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      flagAtStart,
      flagAtEnd,
      nativeRatio: PLAYER_NATIVE_DAMAGE_OVER_HISTORICAL_RAW,
      sampledNativeRatio: mean(nativeRatioSamples),
      outgoingChecksum: outgoingRows,
      identityMismatches,
      fingerprintMismatches,
      frozen: frozenFin,
      pooled: pooledFin,
      recommendation: rec.id,
      cells: cells.map((cell) => ({
        level: cell.L,
        className: cell.cls,
        profile: cell.profile,
        candidates: Object.fromEntries(MISSION_ENEMY_HP_NORMALIZATION_CANDIDATES.map((c) => [c.id, cell[c.id]])),
      })),
    }, null, 2), "utf8");
    console.log(lines.join("\n"));
    console.log(`\nWrote ${REPORT_PATH}`);
  } finally {
    setApplyCertifiedMissionEnemyOutgoingInLiveCombat(false);
  }
}

main();
