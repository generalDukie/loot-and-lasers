/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 1 LIVE FOR CHARACTER PROGRESSION
 */
import {
  CLASS_ARCHETYPE,
  CLASS_PRIMARY_INDEX,
  ARCHETYPE_INDEX_MAX,
  ATTR_INDEX,
  ENEMY_ATTR_WEIGHTS,
  EPA_CHEBYSHEV_COEFFICIENTS,
  EPA_COMPACT_LAMBDA,
  EPA_RESIDUAL_GAUSSIANS,
  FREE_ATTRS_PER_LEVEL_AFTER_1,
  MISSION_ENEMY_EPA_FRACTION,
  MISSION_ENEMY_MIN_ATTRIBUTES,
  PLAYER_FREE_ATTR_WEIGHTS,
  STARTING_ATTRIBUTES,
} from "./constants.js";
import { roundHalfUp } from "./rounding.js";

function levelInt(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

function chebT(n, x) {
  if (n === 0) return 1;
  if (n === 1) return x;
  let t0 = 1;
  let t1 = x;
  for (let k = 2; k <= n; k++) { // magic-number-ok: Chebyshev recurrence from T2
    const t2 = 2 * x * t1 - t0; // magic-number-ok: Chebyshev T_{n}=2xT_{n-1}-T_{n-2}
    t0 = t1;
    t1 = t2;
  }
  return t1;
}

/**
 * Infinite production EPA. Linear + Chebyshev correction on compactified level,
 * plus three compact Gaussians that die out well before L1000.
 */
export function expectedPlayerAttributes(level) {
  const L = levelInt(level);
  const x = L / (L + EPA_COMPACT_LAMBDA);
  const u = 2 * x - 1; // magic-number-ok: map compact x in (0,1) onto Chebyshev [-1,1]
  const c = EPA_CHEBYSHEV_COEFFICIENTS;
  let v = c[0] + c[1] * L;
  for (let k = 2; k < c.length; k++) { // magic-number-ok: skip linear Chebyshev terms T0/T1
    v += c[k] * chebT(k, u);
  }
  for (const g of EPA_RESIDUAL_GAUSSIANS) {
    const z = (L - g.mu) / g.sigma;
    v += g.amplitude * Math.exp(-z * z);
  }
  return v;
}

function weightsFor(primaryIndex, table) {
  const w = [table.off1, table.off1, table.off1, table.vitality, table.luck];
  const offs = [ATTR_INDEX.str, ATTR_INDEX.agi, ATTR_INDEX.int].filter((i) => i !== primaryIndex);
  w[primaryIndex] = table.primary;
  w[offs[0]] = table.off1;
  w[offs[1]] = table.off2;
  return w;
}

/**
 * Largest-remainder allocation matching Test 18 `freeattrs` / enemy split.
 * Tie-break: higher fractional part, then higher index.
 */
export function allocateByWeights(total, weights) {
  const pts = Math.max(0, Math.floor(Number(total) || 0));
  const raw = weights.map((w) => pts * w);
  const a = raw.map((x) => Math.trunc(x));
  let rem = pts - a.reduce((s, n) => s + n, 0);
  const order = [...a.keys()].sort((i, j) => {
    const fi = raw[i] - a[i];
    const fj = raw[j] - a[j];
    if (fj !== fi) return fj - fi;
    return j - i;
  });
  for (let k = 0; k < rem; k++) a[order[k]] += 1;
  return a;
}

export function freeLevelAttributes(level, primaryIndex) {
  const L = levelInt(level);
  const pts = FREE_ATTRS_PER_LEVEL_AFTER_1 * (L - 1);
  return allocateByWeights(pts, weightsFor(primaryIndex, PLAYER_FREE_ATTR_WEIGHTS));
}

export function startingAttributesForClass(className) {
  const arch = CLASS_ARCHETYPE[className] || "Might";
  const s = STARTING_ATTRIBUTES[arch];
  return [s.str, s.agi, s.int, s.vit, s.luck];
}

export function startingAttributesForArchetype(archetype) {
  const s = STARTING_ATTRIBUTES[archetype];
  return [s.str, s.agi, s.int, s.vit, s.luck];
}

export function missionEnemyAttributeTotal(snapshotPlayerLevel) {
  return Math.max(
    MISSION_ENEMY_MIN_ATTRIBUTES,
    roundHalfUp(expectedPlayerAttributes(snapshotPlayerLevel) * MISSION_ENEMY_EPA_FRACTION),
  );
}

export function missionEnemyAttributes(snapshotPlayerLevel, archetypeIndex = 0) {
  const total = missionEnemyAttributeTotal(snapshotPlayerLevel);
  const arch = Math.max(0, Math.min(ARCHETYPE_INDEX_MAX, Math.floor(Number(archetypeIndex) || 0)));
  return {
    total,
    archetypeIndex: arch,
    attributes: allocateByWeights(total, weightsFor(arch, ENEMY_ATTR_WEIGHTS)),
  };
}

export function classPrimaryIndex(className) {
  return CLASS_PRIMARY_INDEX[className] ?? 0;
}

export function classArchetype(className) {
  return CLASS_ARCHETYPE[className] || "Might";
}
