/**
 * Server-side RNG for rewards. Never accept client seeds.
 */

import { randomInt, createHash } from "node:crypto";

/** Uniform float in [0, 1). */
export function secureRandom() {
  return randomInt(0, 2 ** 48) / 2 ** 48;
}

/** Inclusive integer range. */
export function secureRandomInt(min, max) {
  return randomInt(min, max + 1);
}

/**
 * Weighted pick. Entries: { weight: number > 0, ... }.
 * Returns the chosen entry or null if empty/invalid.
 */
export function weightedPick(entries, rng = secureRandom) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let total = 0;
  for (const e of entries) {
    const w = Number(e.weight);
    if (!(w > 0)) continue;
    total += w;
  }
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const e of entries) {
    const w = Number(e.weight);
    if (!(w > 0)) continue;
    roll -= w;
    if (roll <= 0) return e;
  }
  return entries[entries.length - 1];
}

/**
 * Derive a non-secret roll reference for audit (not usable as a seed by clients).
 */
export function rollReference(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

export function validateLootTable(entries) {
  const errors = [];
  if (!Array.isArray(entries) || entries.length === 0) {
    errors.push("empty table");
    return { ok: false, errors };
  }
  for (const e of entries) {
    if (!(Number(e.weight) > 0)) errors.push("non-positive weight");
    if (e.minQty != null && e.maxQty != null && e.minQty > e.maxQty) errors.push("qty range");
  }
  return { ok: errors.length === 0, errors };
}
