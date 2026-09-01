/**
 * Read-only Phase 6 audit used to decide level-specific CDFs (pre-change).
 * Live production now classifies with `intrinsicQualityPercentile(iq, rarity, qualityReferenceLevel)`.
 * Re-running this file compares diagnostic rarity-seeded CDFs against the live helper's
 * default L50 path and will not reproduce the original numeric report exactly.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/audit-phase6-cdf-level.mjs
 */
import { GenerateGearItem } from "../../src/lib/itemGeneration.js";
import {
  intrinsicQualityPercentile,
  resetIntrinsicQualityCdfCache,
  rollIntrinsicQualityCdfIdentity,
} from "../../src/lib/gearIntrinsicQuality.js";
import {
  CLASS_PRIMARY_INDEX,
  INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL,
  INTRINSIC_QUALITY_CDF_SAMPLE_SIZE,
  INTRINSIC_QUALITY_CDF_SEED_BASE,
  NOVA_SURCHARGE_BANDS,
  NOVA_SURCHARGE_TABLE,
  gearStatPool,
  novaSurchargeBandIndex,
  novaSurchargeSpec,
  resolveNovaSurcharge,
  scoreGearIntrinsicQuality,
} from "../../src/lib/productionMath/index.js";

const AUDIT_LEVELS = Object.freeze([50, 100, 500, 1000, 1500, 2000]);
const AUDIT_RARITIES = Object.freeze(["epic", "legendary"]);
const CLASS_NAMES = Object.freeze(Object.keys(CLASS_PRIMARY_INDEX));
const MULBERRY_INCREMENT = 0x6d2b79f5;
const SEED_SHIFT_15 = 15;
const SEED_SHIFT_7 = 7;
const SEED_SHIFT_14 = 14;
const MULBERRY_MIX_61 = 61;
const UINT32_DIVISOR = 4294967296;
const RARITY_SEED_MIX = 0x9e3779b1;
const EMPIRICAL_CDF_TIE_HALF_DIVISOR = 2;
const CLASSIFICATION_SEED_SALT = 0x51a11e01;
const SURCHARGE_SEED_SALT = 0xc0de500a;
const BAND_BOUNDARY_PERCENTILES = Object.freeze(
  NOVA_SURCHARGE_BANDS.slice(1).map((band) => band.minInclusive),
);
const REPORT_QUANTILES = Object.freeze([0.5, 0.75, 0.85, 0.92, 0.97, 0.99]);
const PERCENT_SCALE = 100;
const RELATIVE_DIFF_EPSILON = 1e-12;
const BQ_OFFSETS = Object.freeze([0, 1, 2, 3]);
const BQ_RATIO_SLOT = "helmet";
const BQ_RATIO_RARITY = "epic";

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + MULBERRY_INCREMENT) | 0;
    let t = Math.imul(a ^ (a >>> SEED_SHIFT_15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> SEED_SHIFT_7), MULBERRY_MIX_61 | t)) ^ t;
    return ((t ^ (t >>> SEED_SHIFT_14)) >>> 0) / UINT32_DIVISOR;
  };
}

function raritySeed(rarity) {
  const text = String(rarity || "epic");
  let h = INTRINSIC_QUALITY_CDF_SEED_BASE;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), RARITY_SEED_MIX);
  }
  return h >>> 0;
}

function mixSeed(base, extra) {
  return Math.imul(base ^ extra, RARITY_SEED_MIX) >>> 0;
}

function empiricalCdf(sorted, value) {
  const n = sorted.length;
  if (n <= 0) return 0;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  let equal = 0;
  for (let i = lo; i < n && sorted[i] === value; i++) equal += 1;
  return (lo + equal / EMPIRICAL_CDF_TIE_HALF_DIVISOR) / n;
}

function quantile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function pct(n, d) {
  if (!(d > 0)) return 0;
  return (n / d) * PERCENT_SCALE;
}

function relDiff(a, b) {
  if (Math.abs(b) <= RELATIVE_DIFF_EPSILON) {
    return Math.abs(a) <= RELATIVE_DIFF_EPSILON ? 0 : Infinity;
  }
  return ((a - b) / b) * PERCENT_SCALE;
}

function fmt(n, digits = 6) {
  return Number(n).toFixed(digits);
}

function fmtPct(n, digits = 3) {
  return `${Number(n).toFixed(digits)}%`;
}

function scoreGeneratedItem({ rarity, className, identity, item }) {
  return scoreGearIntrinsicQuality({
    stats: item.stats,
    rarity,
    slot: identity.slot,
    itemLevel: identity.itemLevel,
    referenceLevel: identity.referenceLevel,
    className,
    actualTotal: item.stat_budget ?? null,
  });
}

function generateMarketSample(rarity, referenceLevel, rng, index) {
  const className = CLASS_NAMES[index % CLASS_NAMES.length];
  const identity = rollIntrinsicQualityCdfIdentity(rng, referenceLevel);
  const item = GenerateGearItem({
    itemLevel: identity.itemLevel,
    itemType: identity.slot,
    rarity,
    rng,
    className,
  });
  const scored = scoreGeneratedItem({ rarity, className, identity, item });
  return { className, identity, item, scored };
}

function buildLevelCdf(rarity, referenceLevel) {
  const rng = mulberry32(raritySeed(rarity));
  const values = [];
  for (let i = 0; i < INTRINSIC_QUALITY_CDF_SAMPLE_SIZE; i++) {
    values.push(generateMarketSample(rarity, referenceLevel, rng, i).scored.intrinsicQuality);
  }
  values.sort((a, b) => a - b);
  return values;
}

function cdfStats(sorted) {
  const q = {};
  for (const p of REPORT_QUANTILES) q[`p${Math.round(p * PERCENT_SCALE)}`] = quantile(sorted, p);
  return {
    n: sorted.length,
    mean: mean(sorted),
    median: q.p50,
    ...q,
  };
}

function bandThresholds(sorted) {
  const out = {};
  for (const p of BAND_BOUNDARY_PERCENTILES) {
    out[String(p)] = quantile(sorted, p);
  }
  return out;
}

function poolKey(spec) {
  return `${spec.bandId}:${spec.probability}:${spec.prices.join(",")}`;
}

function expectedNova(spec) {
  if (!(spec.probability > 0) || !spec.prices.length) return 0;
  return spec.probability * mean(spec.prices);
}

function classifyIq(iq, rarity, levelSorted) {
  const percentile = empiricalCdf(levelSorted, iq);
  const spec = novaSurchargeSpec(rarity, percentile);
  return { percentile, spec };
}

function classifyIqLiveL50(iq, rarity) {
  const percentile = intrinsicQualityPercentile(iq, rarity);
  const spec = novaSurchargeSpec(rarity, percentile);
  return { percentile, spec };
}

function budgetRatioTable() {
  const rows = [];
  for (const L of AUDIT_LEVELS) {
    const denom = gearStatPool(L, BQ_RATIO_SLOT, BQ_RATIO_RARITY);
    const ratios = {};
    for (const off of BQ_OFFSETS) {
      const il = Math.max(1, L - off);
      ratios[`L-${off}`] = gearStatPool(il, BQ_RATIO_SLOT, BQ_RATIO_RARITY) / denom;
    }
    rows.push({ L, ...ratios });
  }
  return rows;
}

resetIntrinsicQualityCdfCache();

const cdfByRarityLevel = new Map();
for (const rarity of AUDIT_RARITIES) {
  for (const L of AUDIT_LEVELS) {
    cdfByRarityLevel.set(`${rarity}:${L}`, buildLevelCdf(rarity, L));
  }
}

const l50LiveCheck = { epic: [], legendary: [] };
for (const rarity of AUDIT_RARITIES) {
  const diagnostic = cdfByRarityLevel.get(`${rarity}:${INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL}`);
  const rng = mulberry32(mixSeed(raritySeed(rarity), CLASSIFICATION_SEED_SALT));
  for (let i = 0; i < 8; i++) {
    const sample = generateMarketSample(rarity, INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL, rng, i);
    const live = intrinsicQualityPercentile(sample.scored.intrinsicQuality, rarity);
    const diag = empiricalCdf(diagnostic, sample.scored.intrinsicQuality);
    l50LiveCheck[rarity].push({ live, diag, delta: live - diag });
  }
}

const statsReport = [];
const thresholdReport = [];
for (const rarity of AUDIT_RARITIES) {
  const l50 = cdfByRarityLevel.get(`${rarity}:${INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL}`);
  const l50Stats = cdfStats(l50);
  const l50Thr = bandThresholds(l50);
  for (const L of AUDIT_LEVELS) {
    const sorted = cdfByRarityLevel.get(`${rarity}:${L}`);
    const stats = cdfStats(sorted);
    statsReport.push({
      rarity,
      level: L,
      ...stats,
      dMean: stats.mean - l50Stats.mean,
      dMedian: stats.median - l50Stats.median,
      dP75: stats.p75 - l50Stats.p75,
      dP85: stats.p85 - l50Stats.p85,
      dP92: stats.p92 - l50Stats.p92,
      dP97: stats.p97 - l50Stats.p97,
      dP99: stats.p99 - l50Stats.p99,
    });
    const thr = bandThresholds(sorted);
    const row = { rarity, level: L };
    for (const p of BAND_BOUNDARY_PERCENTILES) {
      const key = String(p);
      row[`iq_${key}`] = thr[key];
      row[`d_${key}`] = thr[key] - l50Thr[key];
    }
    thresholdReport.push(row);
  }
}

const classReport = [];
const novaReport = [];
for (const rarity of AUDIT_RARITIES) {
  for (const L of AUDIT_LEVELS) {
    const levelSorted = cdfByRarityLevel.get(`${rarity}:${L}`);
    const genRng = mulberry32(mixSeed(mixSeed(raritySeed(rarity), CLASSIFICATION_SEED_SALT), L));
    const surchargeRng = mulberry32(mixSeed(mixSeed(raritySeed(rarity), SURCHARGE_SEED_SALT), L));
    let sameBand = 0;
    let shift1 = 0;
    let shift2 = 0;
    let probChange = 0;
    let poolChange = 0;
    let realizedChange = 0;
    let hitMissChange = 0;
    let absPctDelta = 0;
    let novaFixed = 0;
    let novaLevel = 0;
    let evFixed = 0;
    let evLevel = 0;
    const n = INTRINSIC_QUALITY_CDF_SAMPLE_SIZE;
    for (let i = 0; i < n; i++) {
      const sample = generateMarketSample(rarity, L, genRng, i);
      const iq = sample.scored.intrinsicQuality;
      const fixed = classifyIqLiveL50(iq, rarity);
      const correct = classifyIq(iq, rarity, levelSorted);
      const bandDelta = Math.abs(fixed.spec.band - correct.spec.band);
      if (bandDelta === 0) sameBand += 1;
      else if (bandDelta === 1) shift1 += 1;
      else shift2 += 1;
      if (fixed.spec.probability !== correct.spec.probability) probChange += 1;
      if (poolKey(fixed.spec) !== poolKey(correct.spec)) poolChange += 1;
      absPctDelta += Math.abs(fixed.percentile - correct.percentile);
      const hitRoll = surchargeRng();
      const choiceUnit = surchargeRng();
      const realizedFixed = resolveNovaSurcharge(rarity, fixed.percentile, hitRoll, choiceUnit);
      const realizedLevel = resolveNovaSurcharge(rarity, correct.percentile, hitRoll, choiceUnit);
      novaFixed += realizedFixed;
      novaLevel += realizedLevel;
      evFixed += expectedNova(fixed.spec);
      evLevel += expectedNova(correct.spec);
      if (realizedFixed !== realizedLevel) realizedChange += 1;
      if ((realizedFixed > 0) !== (realizedLevel > 0)) hitMissChange += 1;
    }
    classReport.push({
      rarity,
      level: L,
      n,
      sameBandPct: pct(sameBand, n),
      shift1Pct: pct(shift1, n),
      shift2Pct: pct(shift2, n),
      meanAbsPercentileDelta: absPctDelta / n,
    });
    novaReport.push({
      rarity,
      level: L,
      n,
      bandChangePct: pct(shift1 + shift2, n),
      probChangePct: pct(probChange, n),
      poolChangePct: pct(poolChange, n),
      realizedChangePct: pct(realizedChange, n),
      hitMissChangePct: pct(hitMissChange, n),
      meanNovaFixed: novaFixed / n,
      meanNovaLevel: novaLevel / n,
      meanNovaRelPct: relDiff(novaFixed / n, novaLevel / n),
      evFixed: evFixed / n,
      evLevel: evLevel / n,
      evRelPct: relDiff(evFixed / n, evLevel / n),
    });
  }
}

console.log("PHASE 6 QUALITY CDF LEVEL AUDIT");
console.log(`sample_size=${INTRINSIC_QUALITY_CDF_SAMPLE_SIZE}`);
console.log(`live_reference_level=${INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL}`);
console.log("");
console.log("## BudgetQuality L-k / L ratios (helmet/epic, rounding included)");
console.log("L\tL-0\tL-1\tL-2\tL-3");
for (const row of budgetRatioTable()) {
  console.log(`${row.L}\t${fmt(row["L-0"], 6)}\t${fmt(row["L-1"], 6)}\t${fmt(row["L-2"], 6)}\t${fmt(row["L-3"], 6)}`);
}
console.log("");
console.log("## Live L50 helper vs diagnostic L50 CDF (8 probes each rarity)");
for (const rarity of AUDIT_RARITIES) {
  const maxAbs = Math.max(...l50LiveCheck[rarity].map((x) => Math.abs(x.delta)));
  console.log(`${rarity} max_|live-diag|=${fmt(maxAbs, 8)}`);
}
console.log("");
console.log("## CDF statistics");
console.log("rarity\tL\tmean\tmedian\tP75\tP85\tP92\tP97\tP99\tdMean\tdMed\tdP75\tdP85\tdP92\tdP97\tdP99");
for (const row of statsReport) {
  console.log(
    [
      row.rarity,
      row.level,
      fmt(row.mean),
      fmt(row.median),
      fmt(row.p75),
      fmt(row.p85),
      fmt(row.p92),
      fmt(row.p97),
      fmt(row.p99),
      fmt(row.dMean),
      fmt(row.dMedian),
      fmt(row.dP75),
      fmt(row.dP85),
      fmt(row.dP92),
      fmt(row.dP97),
      fmt(row.dP99),
    ].join("\t"),
  );
}
console.log("");
console.log("## Band-boundary IQ thresholds vs L50");
console.log("rarity\tL\tIQ@75\tIQ@85\tIQ@92\tIQ@97\tIQ@99\td75\td85\td92\td97\td99");
for (const row of thresholdReport) {
  console.log(
    [
      row.rarity,
      row.level,
      fmt(row["iq_0.75"]),
      fmt(row["iq_0.85"]),
      fmt(row["iq_0.92"]),
      fmt(row["iq_0.97"]),
      fmt(row["iq_0.99"]),
      fmt(row["d_0.75"]),
      fmt(row["d_0.85"]),
      fmt(row["d_0.92"]),
      fmt(row["d_0.97"]),
      fmt(row["d_0.99"]),
    ].join("\t"),
  );
}
console.log("");
console.log("## Same-item classification (fixed L50 CDF vs level CDF)");
console.log("rarity\tL\tsame\t1-band\t2+\tmean_|Δp|");
for (const row of classReport) {
  console.log(
    [
      row.rarity,
      row.level,
      fmtPct(row.sameBandPct),
      fmtPct(row.shift1Pct),
      fmtPct(row.shift2Pct),
      fmt(row.meanAbsPercentileDelta, 6),
    ].join("\t"),
  );
}
console.log("");
console.log("## Nova-economy impact (common hit/choice rolls)");
console.log("rarity\tL\tbandΔ\tprobΔ\tpoolΔ\trealizedΔ\thit/missΔ\tmeanNova L50\tmeanNova lvl\trel%\tEV L50\tEV lvl\tEV rel%");
for (const row of novaReport) {
  console.log(
    [
      row.rarity,
      row.level,
      fmtPct(row.bandChangePct),
      fmtPct(row.probChangePct),
      fmtPct(row.poolChangePct),
      fmtPct(row.realizedChangePct),
      fmtPct(row.hitMissChangePct),
      fmt(row.meanNovaFixed, 4),
      fmt(row.meanNovaLevel, 4),
      fmtPct(row.meanNovaRelPct, 3),
      fmt(row.evFixed, 4),
      fmt(row.evLevel, 4),
      fmtPct(row.evRelPct, 3),
    ].join("\t"),
  );
}

const worst = {
  shift1: Math.max(...classReport.filter((r) => r.level !== INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL).map((r) => r.shift1Pct)),
  shift2: Math.max(...classReport.filter((r) => r.level !== INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL).map((r) => r.shift2Pct)),
  realized: Math.max(...novaReport.filter((r) => r.level !== INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL).map((r) => r.realizedChangePct)),
  relNova: Math.max(
    ...novaReport
      .filter((r) => r.level !== INTRINSIC_QUALITY_CDF_REFERENCE_LEVEL)
      .map((r) => Math.abs(r.meanNovaRelPct)),
  ),
};
console.log("");
console.log("## Worst non-L50 deltas");
console.log(`max_1_band_shift=${fmtPct(worst.shift1)}`);
console.log(`max_2plus_band_shift=${fmtPct(worst.shift2)}`);
console.log(`max_realized_nova_change=${fmtPct(worst.realized)}`);
console.log(`max_|mean_nova_rel|=${fmtPct(worst.relNova)}`);
