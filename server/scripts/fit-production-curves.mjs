/**
 * Targeted IRLS EPA + outgoing 4-hill refinement.
 * Run: node server/scripts/fit-production-curves.mjs
 */
const EPA_OFFICIAL = [
  [10, 402.6504],
  [25, 1011.245],
  [50, 2192.4117],
  [75, 3218.92],
  [100, 4126.3983],
  [150, 5857.7383],
  [200, 7716.1433],
  [250, 9576.67],
  [300, 11491.74],
  [400, 15535.875],
  [500, 19946.125],
  [600, 24521.945],
  [700, 29033.8783],
  [800, 33389.725],
];
const MATURE_SLOPE = (33389.725 - 29033.8783) / 100;

function pct(pred, truth) {
  return (100 * Math.abs(pred - truth)) / Math.abs(truth);
}
function chebT(n, x) {
  if (n === 0) return 1;
  if (n === 1) return x;
  let t0 = 1, t1 = x;
  for (let k = 2; k <= n; k++) {
    const t2 = 2 * x * t1 - t0;
    t0 = t1; t1 = t2;
  }
  return t1;
}
function compact(L, lam) { return L / (L + lam); }
function solveLstsq(A, y) {
  const n = y.length, m = A[0].length;
  const ATA = Array.from({ length: m }, () => Array(m).fill(0));
  const ATy = Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < m; a++) {
      ATy[a] += A[i][a] * y[i];
      for (let b = 0; b < m; b++) ATA[a][b] += A[i][a] * A[i][b];
    }
  }
  const M = ATA.map((row, i) => [...row, ATy[i]]);
  for (let i = 0; i < m; i++) {
    let piv = i;
    for (let r = i + 1; r < m; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    [M[i], M[piv]] = [M[piv], M[i]];
    if (Math.abs(M[i][i]) < 1e-18) return null;
    const fac = M[i][i];
    for (let j = i; j <= m; j++) M[i][j] /= fac;
    for (let r = 0; r < m; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let j = i; j <= m; j++) M[r][j] -= f * M[i][j];
    }
  }
  return M.map((row) => row[m]);
}
function epaCheb(params, L) {
  const lam = params[0];
  const u = 2 * compact(L, lam) - 1;
  let v = params[1] + params[2] * L;
  for (let i = 3; i < params.length; i++) v += params[i] * chebT(i - 1, u);
  return v;
}
function fitCheb(degree, lam, points) {
  const A = [], y = [];
  for (const [L, val, w0] of points) {
    const w = Math.sqrt(w0 ?? 1);
    const u = 2 * compact(L, lam) - 1;
    const row = [w, w * L];
    for (let k = 2; k <= degree; k++) row.push(w * chebT(k, u));
    A.push(row); y.push(w * val);
  }
  const coef = solveLstsq(A, y);
  return coef ? [lam, ...coef] : null;
}
function slope(fn, L) { return fn(L) - fn(L - 1); }
function monoOk(fn, hi = 2500) {
  let prev = fn(1);
  if (!Number.isFinite(prev) || prev <= 0) return false;
  for (let L = 2; L <= hi; L++) {
    const v = fn(L);
    if (!Number.isFinite(v) || v <= prev) return false;
    prev = v;
  }
  return true;
}
function report(fn) {
  const errs = EPA_OFFICIAL.map(([L, y]) => pct(fn(L), y));
  return {
    max: Math.max(...errs),
    mean: errs.reduce((a, b) => a + b, 0) / errs.length,
    errs: EPA_OFFICIAL.map(([L], i) => [L, Number(errs[i].toFixed(4)), Number(fn(L).toFixed(3))]),
    L1: fn(1), L1000: fn(1000), L1500: fn(1500), L2000: fn(2000), L2500: fn(2500),
    s500: slope(fn, 500), s800: slope(fn, 800), s1000: slope(fn, 1000),
    s1500: slope(fn, 1500), s2000: slope(fn, 2000),
    mono: monoOk(fn),
  };
}
function sane(r) {
  return r.mono && r.s800 > 38 && r.s1000 > 36 && r.s1500 > 34 && r.s2000 > 32
    && r.s800 < 52 && r.s2000 < 52 && r.L1 > 20 && r.L1 < 120;
}

console.log("=== IRLS minimax Chebyshev ===");
let best = null;
for (const degree of [5, 6, 7, 8]) {
  for (const lam of [50, 60, 70, 80, 90, 100, 110, 120, 140]) {
    let weights = EPA_OFFICIAL.map(() => 1);
    weights = [6, ...weights]; // L1
    let params = null;
    for (let it = 0; it < 25; it++) {
      const points = [[1, 50, weights[0]], ...EPA_OFFICIAL.map(([L, y], i) => [L, y, weights[i + 1]])];
      params = fitCheb(degree, lam, points);
      if (!params) break;
      const fn = (L) => epaCheb(params, L);
      const e1 = pct(fn(1), 50);
      const es = EPA_OFFICIAL.map(([L, y]) => pct(fn(L), y));
      const maxE = Math.max(e1, ...es);
      // IRLS: weight ~ current % error (minimax-ish)
      weights[0] = 4 + e1;
      for (let i = 0; i < es.length; i++) weights[i + 1] = 1 + 8 * (es[i] / Math.max(1e-6, maxE)) ** 2;
      // extra late-anchor weight to protect slope
      for (let i = 0; i < EPA_OFFICIAL.length; i++) {
        if (EPA_OFFICIAL[i][0] >= 500) weights[i + 1] *= 1.4;
      }
    }
    if (!params) continue;
    const fn = (L) => epaCheb(params, L);
    const r = report(fn);
    if (!sane(r)) continue;
    if (!best || r.max < best.max) best = { degree, lam, params, ...r };
  }
}
console.log("best IRLS", best && {
  degree: best.degree, lam: best.lam, max: best.max, mean: best.mean,
  L1: best.L1, L1000: best.L1000, L1500: best.L1500, L2000: best.L2000,
  s500: best.s500, s800: best.s800, s1000: best.s1000, s1500: best.s1500, s2000: best.s2000,
  mono: best.mono,
  errs: best.errs,
  params: best.params.map((x) => Number(x.toPrecision(14))),
});

// Two-compact: a + bL + Cheb(λ1) + Cheb(λ2) with λ2 > λ1
function fitTwoLam(d1, lam1, d2, lam2, points) {
  const A = [], y = [];
  for (const [L, val, w0] of points) {
    const w = Math.sqrt(w0 ?? 1);
    const u1 = 2 * compact(L, lam1) - 1;
    const u2 = 2 * compact(L, lam2) - 1;
    const row = [w, w * L];
    for (let k = 2; k <= d1; k++) row.push(w * chebT(k, u1));
    for (let k = 2; k <= d2; k++) row.push(w * chebT(k, u2));
    A.push(row); y.push(w * val);
  }
  return solveLstsq(A, y);
}
function evalTwo(coef, d1, lam1, d2, lam2, L) {
  const u1 = 2 * compact(L, lam1) - 1;
  const u2 = 2 * compact(L, lam2) - 1;
  let v = coef[0] + coef[1] * L;
  let i = 2;
  for (let k = 2; k <= d1; k++) v += coef[i++] * chebT(k, u1);
  for (let k = 2; k <= d2; k++) v += coef[i++] * chebT(k, u2);
  return v;
}

console.log("\n=== two-lambda Chebyshev ===");
let best2 = null;
const pts = [[1, 50, 8], ...EPA_OFFICIAL.map(([L, y]) => [L, y, L >= 500 ? 50 : 30])];
for (const d1 of [3, 4, 5]) {
  for (const d2 of [3, 4, 5]) {
    for (const lam1 of [40, 60, 80]) {
      for (const lam2 of [150, 220, 300, 400]) {
        const coef = fitTwoLam(d1, lam1, d2, lam2, pts);
        if (!coef) continue;
        const fn = (L) => evalTwo(coef, d1, lam1, d2, lam2, L);
        const r = report(fn);
        if (!sane(r)) continue;
        if (!best2 || r.max < best2.max) best2 = { d1, lam1, d2, lam2, coef, ...r };
      }
    }
  }
}
console.log("best two-lam", best2 && {
  d1: best2.d1, lam1: best2.lam1, d2: best2.d2, lam2: best2.lam2,
  max: best2.max, mean: best2.mean, L1: best2.L1,
  L1000: best2.L1000, L1500: best2.L1500, L2000: best2.L2000,
  s800: best2.s800, s1500: best2.s1500, s2000: best2.s2000,
  errs: best2.errs,
  coef: best2.coef.map((x) => Number(x.toPrecision(12))),
});

// ========== outgoing 4-hill refinement ==========
function hill(L, n, h) {
  const lp = L ** n, hp = h ** n;
  return lp / (hp + lp);
}
function outHills(p, L) {
  const [a1, n1, h1, a2, n2, h2, a3, n3, h3, a4, n4, h4] = p;
  return 12
    - a1 * (1 - hill(L, n1, h1))
    - a2 * (1 - hill(L, n2, h2))
    - a3 * (1 - hill(L, n3, h3))
    - a4 * (1 - hill(L, n4, h4));
}
function nelder(obj, start, step, iters) {
  const n = start.length;
  const simp = [start.slice()];
  for (let i = 0; i < n; i++) {
    const p = start.slice();
    p[i] = p[i] === 0 ? step : p[i] * (1 + step);
    simp.push(p);
  }
  const sc = simp.map(obj);
  for (let it = 0; it < iters; it++) {
    const order = sc.map((s, i) => [s, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const bestI = order[0], worstI = order[n], secondI = order[n - 1];
    const c = Array(n).fill(0);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) c[j] += simp[order[k]][j];
    for (let j = 0; j < n; j++) c[j] /= n;
    const r = c.map((cj, j) => cj + (cj - simp[worstI][j]));
    const rs = obj(r);
    if (rs < sc[bestI]) {
      const e = c.map((cj, j) => cj + 2 * (r[j] - cj));
      const es = obj(e);
      if (es < rs) { simp[worstI] = e; sc[worstI] = es; }
      else { simp[worstI] = r; sc[worstI] = rs; }
    } else if (rs < sc[secondI]) { simp[worstI] = r; sc[worstI] = rs; }
    else {
      const ctr = rs < sc[worstI]
        ? c.map((cj, j) => cj + 0.5 * (r[j] - cj))
        : c.map((cj, j) => cj + 0.5 * (simp[worstI][j] - cj));
      const cs = obj(ctr);
      if (cs < Math.min(rs, sc[worstI])) { simp[worstI] = ctr; sc[worstI] = cs; }
      else {
        for (let i = 0; i < simp.length; i++) {
          if (i === bestI) continue;
          simp[i] = simp[bestI].map((b, j) => b + 0.5 * (simp[i][j] - b));
          sc[i] = obj(simp[i]);
        }
      }
    }
  }
  const bi = sc.map((s, i) => [s, i]).sort((a, b) => a[0] - b[0])[0][1];
  return simp[bi];
}
function t18Out(L) {
  if (L <= 1) return 0.3;
  if (L <= 10) return 0.3 + (L - 1) * (0.05 / 9);
  if (L <= 15) return 0.35 + (L - 10) * (0.15 / 5);
  if (L <= 20) return 0.5 + (L - 15) * (2.0 / 5);
  if (L <= 50) return 2.5 + (L - 20) * (3.5 / 30);
  if (L <= 100) return 6 + (L - 50) * (4 / 50);
  if (L <= 200) return 10 + (L - 100) * (2 / 100);
  return 12;
}

const seed = [0.82282139, 2.7451575, 33.192359, 5.0350686, 12.511237, 20.671483, 0.042861164, 1.6648749, 10.305314, 5.8001676, 11.195432, 94.175996];
function outObj(p) {
  if (p.some((x) => !Number.isFinite(x))) return 1e12;
  for (let i = 0; i < 12; i += 3) if (p[i] < 0 || p[i + 1] <= 0.2 || p[i + 2] <= 0.5) return 1e12;
  let s = 0;
  for (const L of [1, 10, 15, 20, 50, 100, 200]) {
    const y = t18Out(L);
    const v = outHills(p, L);
    const e = (v - y) / y;
    s += (L === 200 ? 4 : 8) * e * e;
  }
  const hi = outHills(p, 2000);
  if (hi > 12.002 || hi < 11.998) s += 5;
  if (outHills(p, 200) < 11.97) s += 2;
  return s;
}
const refined = nelder(outObj, seed, 0.03, 12000);
const fn = (L) => outHills(refined, L);
const knotLs = [1, 10, 15, 20, 50, 100, 200];
console.log("\n=== OUTGOING refined 4-hill ===");
console.log("params", refined.map((x) => Number(x.toPrecision(14))));
console.log("knots", knotLs.map((L) => [L, t18Out(L), Number(fn(L).toFixed(6)), Number(pct(fn(L), t18Out(L)).toFixed(4))]));
const extra = [12, 17, 18, 25, 35, 75, 150, 300, 800, 1500, 2000, 2500];
console.log("extra", extra.map((L) => [L, Number(t18Out(L).toFixed(4)), Number(fn(L).toFixed(4)), Number(pct(fn(L), t18Out(L)).toFixed(3))]));
let prev = fn(1), mono = true, maxV = fn(1);
for (let L = 2; L <= 2500; L++) {
  const v = fn(L);
  if (v + 1e-12 < prev) { mono = false; break; }
  if (v > maxV) maxV = v;
  prev = v;
}
console.log({ mono, maxV, L1500: fn(1500), L2000: fn(2000), L2500: fn(2500), sumA: refined[0]+refined[3]+refined[6]+refined[9] });
