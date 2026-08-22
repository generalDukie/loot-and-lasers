/**
 * AUTHORITATIVE FORMULA MODULE — PENDING CALLER MIGRATION IN LATER PHASES
 *
 * Rounding primitives matching certified Test 18 helpers.
 * Do not assume JS Math.round, Python 3 round, and T18 rround are identical.
 */

/** Test 18 `rround(x) = int(math.floor(x + 0.5))` — round-half-up for x ≥ 0. */
export function roundHalfUp(value) {
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  return Math.trunc(Math.floor(x + 0.5));
}

/**
 * Python 3 `round` / banker's rounding (half to even).
 * Certified combat HP and per-hit damage use this helper, not rround.
 */
export function roundHalfEven(value) {
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const n = Math.floor(ax);
  const frac = ax - n;
  if (frac < 0.5) return sign * n;
  if (frac > 0.5) return sign * (n + 1);
  return sign * (n % 2 === 0 ? n : n + 1);
}

/** Test 18 `round5` — nearest multiple of 5, half-up on the quotient. */
export function roundToMultipleOf5(value) {
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  return 5 * roundHalfUp(x / 5);
}

/**
 * Quantize to a positive step using round-half-up on the quotient.
 * Fuel uses step 0.25; Nova uses step 0.5.
 */
export function quantizeNearest(value, step) {
  const x = Number(value);
  const s = Number(step);
  if (!Number.isFinite(x) || !Number.isFinite(s) || s <= 0) return 0;
  return roundHalfUp(x / s) * s;
}

export const FUEL_QUANTIZE_STEP = 0.25;
export const NOVA_QUANTIZE_STEP = 0.5;

export function quantizeFuel(value) {
  return quantizeNearest(value, FUEL_QUANTIZE_STEP);
}

export function quantizeNova(value) {
  return quantizeNearest(value, NOVA_QUANTIZE_STEP);
}
