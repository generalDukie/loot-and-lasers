/**
 * Bounded in-process metrics registry (Restoration 27).
 * Low-cardinality labels only — rejects player/item/transaction IDs.
 * Telemetry failure must never throw into gameplay.
 */
import { logger } from "./logger.js";

const MAX_SERIES = 500;
const MAX_LABEL_KEY_LEN = 32;
const MAX_LABEL_VAL_LEN = 64;

/** Keys that must never appear as metric labels. */
const FORBIDDEN_LABEL_KEYS = new Set([
  "account_id",
  "accountid",
  "user_id",
  "userid",
  "character_id",
  "characterid",
  "item_id",
  "itemid",
  "mission_id",
  "missionid",
  "transaction_id",
  "transactionid",
  "request_id",
  "requestid",
  "trace_id",
  "traceid",
  "email",
  "token",
  "error_message",
  "message",
  "path",
  "url",
]);

/** @type {Map<string, { type: string, value: number, sum?: number, count?: number, labels: object }>} */
const series = new Map();
let dropped = 0;

function labelKey(name, labels) {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`);
  return `${name}|${parts.join(",")}`;
}

function sanitizeLabels(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).slice(0, MAX_LABEL_KEY_LEN);
    if (FORBIDDEN_LABEL_KEYS.has(key.toLowerCase())) {
      dropped += 1;
      continue;
    }
    const val = String(v ?? "").slice(0, MAX_LABEL_VAL_LEN);
    // Reject UUID-like / long free-form as values
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(val) || val.length > 48) {
      dropped += 1;
      continue;
    }
    out[key] = val;
  }
  return out;
}

function ensureSeries(type, name, labels) {
  const safeLabels = sanitizeLabels(labels);
  const key = labelKey(name, safeLabels);
  let row = series.get(key);
  if (!row) {
    if (series.size >= MAX_SERIES) {
      dropped += 1;
      return null;
    }
    row = { type, name, value: 0, sum: 0, count: 0, labels: safeLabels };
    series.set(key, row);
  }
  return row;
}

export function RecordMetric(name, value = 1, labels = {}, type = "counter") {
  try {
    const n = String(name || "").slice(0, 96);
    if (!n) return;
    const row = ensureSeries(type, n, labels);
    if (!row) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    if (type === "gauge") {
      row.value = v;
    } else if (type === "histogram" || type === "timer") {
      row.count += 1;
      row.sum += v;
      row.value = row.sum / row.count;
    } else {
      row.value += v;
    }
  } catch (err) {
    dropped += 1;
    try {
      logger.debug("metric_record_failed", { error: String(err?.message || err) });
    } catch {
      /* never throw */
    }
  }
}

export function incCounter(name, labels = {}, by = 1) {
  RecordMetric(name, by, labels, "counter");
}

export function setGauge(name, value, labels = {}) {
  RecordMetric(name, value, labels, "gauge");
}

export function observeDuration(name, ms, labels = {}) {
  RecordMetric(name, ms, labels, "histogram");
}

export function getMetricsSnapshot() {
  const out = [];
  for (const row of series.values()) {
    out.push({
      name: row.name,
      type: row.type,
      value: row.value,
      count: row.count || undefined,
      sum: row.type === "histogram" || row.type === "timer" ? row.sum : undefined,
      labels: row.labels,
    });
  }
  return {
    series: out,
    series_count: out.length,
    dropped_samples: dropped,
    max_series: MAX_SERIES,
  };
}

export function resetMetricsForTests() {
  series.clear();
  dropped = 0;
}

export function getDroppedMetricCount() {
  return dropped;
}
