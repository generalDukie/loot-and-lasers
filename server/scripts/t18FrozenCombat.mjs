/**
 * DIAGNOSTIC ONLY — frozen Test 18 `nfight` / derived helpers.
 * Not imported by production combat. Do not use as a live authority.
 *
 * Source: Test 18 analysis package `scripts/test18_runner.py`
 * (extracted copy under %TEMP%/t18_analysis).
 */
import { roundHalfEven } from "../../src/lib/productionMath/rounding.js";

export const T18_CLASS_NAMES = Object.freeze([
  "Vanguard",
  "Astral Warden",
  "Shadow Operative",
  "Void Runner",
  "Technomancer",
  "Cosmic Engineer",
]);

export const T18_CLASS_INDEX = Object.freeze(Object.fromEntries(
  T18_CLASS_NAMES.map((name, i) => [name, i]),
));

const VOID_T2 = 12;
const VOID_T3 = 24;
const TECH_CAP = 6;
const TECH_VENT = 2;
const TECH_CRIT_LOSS = 2;
const VANGUARD_OWN_MULT = 1.5;
const FIGHT_TURN_CAP = 200;
const VARIANCE_MIN = 0.9;
const VARIANCE_SPAN = 0.2;
const CRIT_DAMAGE_MULT = 1.5;
const STRONG_TANTRUM_MULT = 2;
const PLAYER_ATTACK_FLAT = 15;
const RAW_ATTACK_COEFFICIENT = 0.0032;
const RAW_ATTACK_EXPONENT = 1.727;
const HP_BASE = 50;
const HP_PER_VIT = 2.5;
const HP_VIT_SQUARED = 0.008;
const DIRTY_TRICK_FLAT = 0.075;
const ASTRAL_BARRIER_CHANCE = 0.1;
const ASTRAL_BARRIER_HP_FRAC = 0.15;
const PHANTOM_REPRIME_TURNS = 10;
const OVERCLOCK_DEALT = 0.125;
const OVERCLOCK_TAKEN = 0.05;
const ORBITAL_TRUE_FRAC = 0.6;
const ORBITAL_DEFENSE_TAKEN = 0.75;
const ORBITAL_ACQUIRE_CRIT = 0.4;
const NATURAL_CRIT_CAP = 0.3;
const NATURAL_DODGE_CAP = 0.25;
const NATURAL_RESIST_CAP = 0.3;
const FORMAX_AT_100 = 700;
const FORMAX_EXPONENT = 0.95;
const GENERIC_ATTR_EXPONENT = 1.2;
const EARLY_CAP_EXPONENT = 0.65;
const CRIT_FORMAX_MULT = 1.55;
const CRIT_ATTR_EXPONENT = 1.8;
const REFLEX_DODGE_LOW = 0.225;
const REFLEX_DODGE_HIGH = 0.325;
const REFLEX_RAMP_START = 400;
const REFLEX_RAMP_END = 750;
const REFLEX_RAMP_RISE = 0.1;
const REFLEX_RAMP_SPAN = 350;
const MISSION_RAMP_FULL_LEVEL = 25;
const MISSION_RAMP_FLOOR = 5;
const MISSION_RAMP_RISE = 10;
const MISSION_RAMP_SPAN = 24;
const ENEMY_MIN_ATTRS = 5;

export function t18PythonRound(value) {
  return roundHalfEven(value);
}

export function t18RoundHalfUp(value) {
  return Math.trunc(Math.floor(Number(value) + 0.5));
}

export function t18MissionOutgoingMultiplier(level) {
  const L = Number(level);
  if (L <= 1) return 0.3;
  if (L <= 10) return 0.3 + (L - 1) * (0.05 / 9);
  if (L <= 15) return 0.35 + (L - 10) * (0.15 / 5);
  if (L <= 20) return 0.5 + (L - 15) * (2 / 5);
  if (L <= 50) return 2.5 + (L - 20) * (3.5 / 30);
  if (L <= 100) return 6 + (L - 50) * (4 / 50);
  if (L <= 200) return 10 + (L - 100) * (2 / 100);
  return 12;
}

export function t18UnroundedHp(vit) {
  const v = Number(vit) || 0;
  return HP_BASE + HP_PER_VIT * v + HP_VIT_SQUARED * v * v;
}

export function t18MaxHp(vit) {
  return t18PythonRound(t18UnroundedHp(vit));
}

export function t18RawPlayerDamage(primary) {
  const p = Math.max(0, Number(primary) || 0);
  return PLAYER_ATTACK_FLAT + RAW_ATTACK_COEFFICIENT * p ** RAW_ATTACK_EXPONENT;
}

export function t18MissionEnemyFlat(enemyLevel) {
  const EL = Number(enemyLevel);
  if (EL < MISSION_RAMP_FULL_LEVEL) {
    return MISSION_RAMP_FLOOR + MISSION_RAMP_RISE * (EL - 1) / MISSION_RAMP_SPAN;
  }
  return PLAYER_ATTACK_FLAT;
}

export function t18RawEnemyDamage(primary, enemyLevel) {
  const p = Math.max(0, Number(primary) || 0);
  return t18MissionEnemyFlat(enemyLevel) + RAW_ATTACK_COEFFICIENT * p ** RAW_ATTACK_EXPONENT;
}

function t18Soft(L, x, cap) {
  const fm = FORMAX_AT_100 * (L / 100) ** FORMAX_EXPONENT;
  const fromAttr = cap * Math.min(1, fm > 0 ? (x / fm) ** GENERIC_ATTR_EXPONENT : 0);
  const early = cap * Math.min(1, (L / 100) ** EARLY_CAP_EXPONENT);
  return Math.min(fromAttr, early, cap);
}

export function t18Crit(L, luck) {
  const fm = FORMAX_AT_100 * (L / 100) ** FORMAX_EXPONENT * CRIT_FORMAX_MULT;
  const fromAttr = NATURAL_CRIT_CAP * Math.min(1, fm > 0 ? (luck / fm) ** CRIT_ATTR_EXPONENT : 0);
  const early = NATURAL_CRIT_CAP * Math.min(1, (L / 100) ** EARLY_CAP_EXPONENT);
  return Math.min(fromAttr, early, NATURAL_CRIT_CAP);
}

function t18ReflexDodgeCoeff(L) {
  if (L <= REFLEX_RAMP_START) return REFLEX_DODGE_LOW;
  if (L >= REFLEX_RAMP_END) return REFLEX_DODGE_HIGH;
  return REFLEX_DODGE_LOW + (L - REFLEX_RAMP_START) * (REFLEX_RAMP_RISE / REFLEX_RAMP_SPAN);
}

export function t18Dodge(L, agi, archIndex) {
  const x = archIndex === 1 ? agi * t18ReflexDodgeCoeff(L) : agi;
  return t18Soft(L, x, NATURAL_DODGE_CAP);
}

export function t18Resists(L, attrs, archIndex) {
  const a = attrs;
  const might = archIndex === 0 ? 0 : t18Soft(L, a[0], NATURAL_RESIST_CAP);
  const reflex = archIndex === 1
    ? 0
    : t18Soft(L, archIndex === 0 ? a[2] : a[0], NATURAL_RESIST_CAP);
  const tech = archIndex === 2 ? 0 : t18Soft(L, a[2], NATURAL_RESIST_CAP);
  return { might, reflex, tech };
}

export function t18PrimaryIndex(classIndex) {
  if (classIndex < 2) return 0;
  if (classIndex < 4) return 1;
  return 2;
}

export function t18EnemyArchetypeIndex(ea) {
  let arch = 0;
  if (ea[1] > ea[arch]) arch = 1;
  if (ea[2] > ea[arch]) arch = 2;
  return arch;
}

export function t18MissionEnemyAttributes(total, archetypeIndex) {
  const budget = Math.max(ENEMY_MIN_ATTRS, t18RoundHalfUp(total));
  const w = [0.1, 0.1, 0.1, 0.25, 0.2];
  w[archetypeIndex] = 0.35;
  const raw = w.map((weight) => budget * weight);
  const a = raw.map((x) => Math.trunc(x));
  const rem = budget - a.reduce((s, n) => s + n, 0);
  const order = [0, 1, 2, 3, 4].sort((i, j) => {
    const fi = raw[i] - a[i];
    const fj = raw[j] - a[j];
    if (fj !== fi) return fj - fi;
    return i - j;
  });
  for (let k = 0; k < rem; k++) a[order[k]] += 1;
  return a;
}

function randInt(rng, n) {
  return Math.min(n - 1, Math.floor(rng() * n));
}

function emptyTel() {
  return {
    playerAttempts: 0,
    enemyAttempts: 0,
    playerLanded: 0,
    enemyLanded: 0,
    playerCrits: 0,
    enemyCrits: 0,
    playerDodges: 0,
    enemyDodges: 0,
    playerDamage: 0,
    enemyDamage: 0,
  };
}

function finish(win, turns, php, pmax, ehp, emax, tel) {
  return { win, turns, php, pmax, ehp, emax, tel };
}

/**
 * Frozen Test 18 mission fight. `rng` is a [0,1) sampler.
 * Returns win (1 = player), turns, HP, and attack telemetry.
 */
export function t18MissionFight(classIndex, level, playerAttrs, enemyLevel, enemyAttrs, rng) {
  const cls = classIndex;
  const L = level;
  const EL = enemyLevel;
  const pa = playerAttrs;
  const ea = enemyAttrs;
  const pri = t18PrimaryIndex(cls);
  const arch = t18EnemyArchetypeIndex(ea);
  let php = t18MaxHp(pa[3]);
  const pmax = php;
  let ehp = t18MaxHp(ea[3]);
  const emax = ehp;
  let pc = t18Crit(L, pa[4]);
  let pd = t18Dodge(L, pa[1], pri);
  const ec = t18Crit(EL, ea[4]);
  const ed = t18Dodge(EL, ea[1], arch);
  const pr = t18Resists(L, pa, pri);
  const er = t18Resists(EL, ea, arch);

  let phantomPending = cls === 2;
  let shadowTurn = 0;
  let barrier = 0;
  let over = 0;
  let engTurn = 0;
  let engDef = false;
  let acq = false;
  let strong = false;
  let normal = false;
  const dirtyActive = [0, 0, 0];
  let opening = 0;
  if (cls === 3) {
    const d = randInt(rng, 3);
    dirtyActive[d] = 1;
    if (d === 0) pd += DIRTY_TRICK_FLAT;
    else if (d === 1) pc += DIRTY_TRICK_FLAT;
    else opening = 2;
  }
  let pturn = opening > 0 ? true : rng() < 0.5;
  const playerMult = 1;
  const enemyMult = t18MissionOutgoingMultiplier(EL);
  const tel = emptyTel();

  for (let z = 0; z < FIGHT_TURN_CAP; z++) {
    if (php <= 0) return finish(0, z, php, pmax, ehp, emax, tel);
    if (ehp <= 0) return finish(1, z, php, pmax, ehp, emax, tel);

    if (cls === 3 && (z + 1 === VOID_T2 || z + 1 === VOID_T3)) {
      const rem = [];
      for (let q = 0; q < 3; q++) if (dirtyActive[q] === 0) rem.push(q);
      if (rem.length > 0) {
        const d = rem[randInt(rng, rem.length)];
        dirtyActive[d] = 1;
        if (d === 0) pd += DIRTY_TRICK_FLAT;
        else if (d === 1) pc += DIRTY_TRICK_FLAT;
        else {
          opening = 2;
          pturn = true;
        }
      }
    }

    if (pturn) {
      if (cls === 2) {
        shadowTurn += 1;
        if (shadowTurn % PHANTOM_REPRIME_TURNS === 0) phantomPending = true;
      }
      if (cls === 1 && rng() < ASTRAL_BARRIER_CHANCE) {
        barrier = t18PythonRound(ASTRAL_BARRIER_HP_FRAC * t18UnroundedHp(pa[3]));
      }
      const us = strong;
      const un = normal && !us;
      const ua = acq;
      tel.playerAttempts += 1;
      if (!us && rng() < ed) {
        tel.enemyDodges += 1;
        if (cls === 0) strong = true;
      } else {
        let dmg = t18RawPlayerDamage(pa[pri]);
        dmg *= VARIANCE_MIN + VARIANCE_SPAN * rng();
        if (cls === 4) dmg *= 1 + OVERCLOCK_DEALT * over;
        let didCrit = false;
        if (us || un || rng() < (pc + (ua ? ORBITAL_ACQUIRE_CRIT : 0))) {
          didCrit = true;
          dmg *= us ? STRONG_TANTRUM_MULT : (un ? VANGUARD_OWN_MULT : CRIT_DAMAGE_MULT);
        }
        if (pri === 0) dmg *= 1 - er.might;
        else if (pri === 1) dmg *= 1 - er.reflex;
        else dmg *= 1 - er.tech;
        dmg *= playerMult;
        const dealt = Math.max(0, t18PythonRound(dmg));
        ehp = Math.max(0, ehp - dealt);
        tel.playerLanded += 1;
        tel.playerDamage += dealt;
        if (didCrit) tel.playerCrits += 1;
      }
      if (us) strong = false;
      if (un) normal = false;
      if (ua) acq = false;
      if (cls === 4) {
        if (over >= TECH_CAP) over = Math.max(0, over - TECH_VENT);
        else over = Math.min(TECH_CAP, over + 1);
      }
      if (cls === 5 && php > 0 && ehp > 0) {
        engTurn += 1;
        const proc = (engTurn <= 10 && engTurn % 2 === 0)
          || (engTurn >= 13 && (engTurn - 13) % 3 === 0);
        if (proc) {
          const mode = randInt(rng, 3);
          if (mode === 0) {
            if (rng() >= ed) {
              const od = t18PythonRound(t18RawPlayerDamage(pa[2]) * ORBITAL_TRUE_FRAC * playerMult);
              ehp = Math.max(0, ehp - od);
            }
          } else if (mode === 1) {
            engDef = true;
          } else {
            acq = true;
          }
        }
      }
      if (opening > 0) {
        opening -= 1;
        pturn = opening > 0;
      } else {
        pturn = false;
      }
    } else {
      if (phantomPending) {
        phantomPending = false;
        pturn = true;
        continue;
      }
      tel.enemyAttempts += 1;
      if (rng() < pd) {
        tel.playerDodges += 1;
        if (cls === 0) normal = true;
      } else {
        let dmg = t18RawEnemyDamage(ea[arch], EL);
        dmg *= VARIANCE_MIN + VARIANCE_SPAN * rng();
        const cr = rng() < ec;
        if (cr) dmg *= CRIT_DAMAGE_MULT;
        if (arch === 0) dmg *= 1 - pr.might;
        else if (arch === 1) dmg *= 1 - pr.reflex;
        else dmg *= 1 - pr.tech;
        if (cls === 4) dmg *= 1 + OVERCLOCK_TAKEN * over;
        dmg *= enemyMult;
        let fd = Math.max(0, t18PythonRound(dmg));
        if (engDef) {
          fd = t18PythonRound(fd * ORBITAL_DEFENSE_TAKEN);
          engDef = false;
        }
        if (barrier > 0) {
          const aa = Math.min(barrier, fd);
          barrier -= aa;
          fd -= aa;
        }
        php = Math.max(0, php - fd);
        tel.enemyLanded += 1;
        tel.enemyDamage += fd;
        if (cr) {
          tel.enemyCrits += 1;
          if (cls === 4) over = Math.max(0, over - TECH_CRIT_LOSS);
        }
      }
      pturn = true;
    }
  }
  return finish(php > 0 ? 1 : 0, FIGHT_TURN_CAP, php, pmax, ehp, emax, tel);
}
