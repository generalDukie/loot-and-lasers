/**
 * Natural level ceilings for Dodge / Crit / Resistance.
 * Fritsch–Carlson PCHIP (monotone cubic) through named anchors.
 * Actual derived stats remain min(attribute-derived, level cap, mature cap).
 */
import {
  CRIT_RESIST_LEVEL_CAP_ANCHORS,
  CRIT_RESIST_LEVEL_CAP_AT_100,
  CUBIC_HERMITE_CUBE_COEFFICIENT,
  CUBIC_HERMITE_SQUARE_COEFFICIENT,
  DERIVED_STAT_LEVEL_CAP_LEVEL_1,
  DERIVED_STAT_LEVEL_CAP_LEVEL_100,
  DODGE_LEVEL_CAP_ANCHORS,
  DODGE_LEVEL_CAP_AT_100,
  PCHIP_ENDPOINT_SLOPE_LIMIT,
  PCHIP_SECANT_DOUBLE_WEIGHT,
} from "./constants.js";

function levelNum(level) {
  return Math.max(DERIVED_STAT_LEVEL_CAP_LEVEL_1, Number(level) || DERIVED_STAT_LEVEL_CAP_LEVEL_1);
}

function pchipEndSlope(h0, h1, m0, m1) {
  let d = ((PCHIP_SECANT_DOUBLE_WEIGHT * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
  if (Math.sign(d) !== Math.sign(m0)) d = 0;
  else if (
    Math.sign(m0) !== Math.sign(m1)
    && Math.abs(d) > PCHIP_ENDPOINT_SLOPE_LIMIT * Math.abs(m0)
  ) {
    d = PCHIP_ENDPOINT_SLOPE_LIMIT * m0;
  }
  return d;
}

/** PCHIP endpoint uses the last point (n-1) and the last two intervals (n-2, n-3). */
const PCHIP_LAST_POINT_INDEX_OFFSET = 1;
const PCHIP_LAST_INTERVAL_INDEX_OFFSET = 2;
const PCHIP_PREV_INTERVAL_INDEX_OFFSET = 3;

function pchipDerivatives(xs, ys) {
  const n = xs.length;
  const h = Array(n - 1);
  const m = Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    m[i] = (ys[i + 1] - ys[i]) / h[i];
  }
  const d = Array(n);
  d[0] = pchipEndSlope(h[0], h[1], m[0], m[1]);
  d[n - PCHIP_LAST_POINT_INDEX_OFFSET] = pchipEndSlope(
    h[n - PCHIP_LAST_INTERVAL_INDEX_OFFSET],
    h[n - PCHIP_PREV_INTERVAL_INDEX_OFFSET],
    m[n - PCHIP_LAST_INTERVAL_INDEX_OFFSET],
    m[n - PCHIP_PREV_INTERVAL_INDEX_OFFSET],
  );
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] === 0 || m[i] === 0 || Math.sign(m[i - 1]) !== Math.sign(m[i])) {
      d[i] = 0;
    } else {
      const w1 = PCHIP_SECANT_DOUBLE_WEIGHT * h[i] + h[i - 1];
      const w2 = h[i] + PCHIP_SECANT_DOUBLE_WEIGHT * h[i - 1];
      d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  return Object.freeze({ xs: Object.freeze([...xs]), ys: Object.freeze([...ys]), d: Object.freeze(d), h: Object.freeze(h) });
}

function hermite(t, y0, y1, d0, d1, span) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = CUBIC_HERMITE_CUBE_COEFFICIENT * t3 - CUBIC_HERMITE_SQUARE_COEFFICIENT * t2 + 1;
  const h10 = t3 - CUBIC_HERMITE_CUBE_COEFFICIENT * t2 + t;
  const h01 = -CUBIC_HERMITE_CUBE_COEFFICIENT * t3 + CUBIC_HERMITE_SQUARE_COEFFICIENT * t2;
  const h11 = t3 - t2;
  return h00 * y0 + h10 * span * d0 + h01 * y1 + h11 * span * d1;
}

function evaluatePchip(curve, x) {
  const { xs, ys, d, h } = curve;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let k = 0;
  while (k < xs.length - PCHIP_LAST_INTERVAL_INDEX_OFFSET && x > xs[k + 1]) k += 1;
  const t = (x - xs[k]) / h[k];
  return hermite(t, ys[k], ys[k + 1], d[k], d[k + 1], h[k]);
}

function curveFromAnchors(anchors) {
  return pchipDerivatives(
    anchors.map((a) => a.level),
    anchors.map((a) => a.cap),
  );
}

const DODGE_LEVEL_CAP_PCHIP = curveFromAnchors(DODGE_LEVEL_CAP_ANCHORS);
const CRIT_RESIST_LEVEL_CAP_PCHIP = curveFromAnchors(CRIT_RESIST_LEVEL_CAP_ANCHORS);

/** Natural Dodge ceiling at `level`. Flat at the L100 mature cap for L100+. */
export function naturalDodgeLevelCap(level) {
  const L = levelNum(level);
  if (L >= DERIVED_STAT_LEVEL_CAP_LEVEL_100) return DODGE_LEVEL_CAP_AT_100;
  return evaluatePchip(DODGE_LEVEL_CAP_PCHIP, L);
}

/** Natural Crit / each Resistance ceiling at `level`. Flat at the L100 mature cap for L100+. */
export function naturalCritResistLevelCap(level) {
  const L = levelNum(level);
  if (L >= DERIVED_STAT_LEVEL_CAP_LEVEL_100) return CRIT_RESIST_LEVEL_CAP_AT_100;
  return evaluatePchip(CRIT_RESIST_LEVEL_CAP_PCHIP, L);
}
