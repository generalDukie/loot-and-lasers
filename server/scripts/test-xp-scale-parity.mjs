/**
 * XP scale-simplification parity guard.
 *
 * The redundant `× XP_STARDUST_SCALE` layer was folded into the authoritative
 * XP functions (expForLevel, getMissionXpPerFuel) as an explicit final ×10 step.
 * This test locks the exact pre-refactor outputs so the representation change can
 * never silently alter XP payouts.
 *
 * Reference implementations below reproduce the two-step math exactly
 * (round(designCurve × pacing) × 10, where XP-to-next pacing = global 1.5× plus
 * the tapering early-game modifier). Both must match the current exports for
 * every integer level 1..500, and final mission XP must match across
 * Fuel/efficiency (mission XP has no pacing multiplier).
 *
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-xp-scale-parity.mjs
 */
import assert from "node:assert/strict";
import { expForLevel, getMissionXpPerFuel } from "../src/shared/rewards.js";
import {
  computeMissionXpFromFuel,
  normalizeMissionEfficiency,
  MISSION_XP_REBALANCE,
} from "../src/shared/economyFormulas.js";
import { applyXpBonus } from "../src/shared/collectionBonus.js";

const SCALE = 10; // historical XP_STARDUST_SCALE

// ── Reference (pre-refactor) formulas ────────────────────────────────
function refPost200Growth(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const X = Math.max(0, (L - 200) / 100);
  return 1 + 0.8 * X ** 0.48 + 0.79 * X ** 0.71;
}
function refEarlyGameXpModifier(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  return 1 + 0.2 * Math.max(0, 1 - L / 100);
}
function refXpToNextBase(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const base = Math.max(1, Math.round(1.35 * 2.106 * (L ** 1.532) * (1 + (L / 266) ** 3.683)));
  // Pacing multipliers: global 1.5× + tapering early-game modifier.
  return Math.max(1, Math.round(base * refPost200Growth(L) * 1.5 * refEarlyGameXpModifier(L)));
}
function refExpForLevel(level) {
  return refXpToNextBase(level) * SCALE; // round(base × post200 × 1.5 × early) × 10
}
function refMissionXpPerFuelBase(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  return Math.max(1, Math.round(10 + 0.5 * (L - 1) + 0.032 * (L ** 1.67 - 1)));
}
function refMissionXpPerFuel(level) {
  return refMissionXpPerFuelBase(level) * SCALE; // OLD: round(base) × 10
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (err) { failed += 1; console.error(`  ✗ ${name}\n    ${err.stack || err.message}`); }
}

console.log("\nXP scale-simplification parity (L1..500)\n");

test("expForLevel L1..500 === reference round(base)×10", () => {
  const mismatches = [];
  for (let L = 1; L <= 500; L++) {
    if (expForLevel(L) !== refExpForLevel(L)) mismatches.push(L);
  }
  assert.equal(mismatches.length, 0, `mismatched levels: ${mismatches.slice(0, 10).join(",")}`);
});

test("getMissionXpPerFuel L1..500 === reference round(base)×10", () => {
  const mismatches = [];
  for (let L = 1; L <= 500; L++) {
    if (getMissionXpPerFuel(L) !== refMissionXpPerFuel(L)) mismatches.push(L);
  }
  assert.equal(mismatches.length, 0, `mismatched levels: ${mismatches.slice(0, 10).join(",")}`);
});

test("All XP outputs remain exact multiples of 10 (scale preserved, not merged)", () => {
  for (const L of [1, 5, 10, 20, 50, 100, 250, 500]) {
    assert.equal(expForLevel(L) % 10, 0, `expForLevel(${L})`);
    assert.equal(getMissionXpPerFuel(L) % 10, 0, `getMissionXpPerFuel(${L})`);
  }
});

test("Final mission XP === reference across Fuel × efficiency × rebalance × collection", () => {
  const levels = [1, 5, 10, 20, 50, 100, 250, 500];
  const fuels = [0.25, 1, 3, 7, 20];
  const effs = [0.5, 0.85, 1, 1.25, 1.5];
  const cols = [0, 10, 37.5];
  let checks = 0;
  for (const L of levels) {
    for (const f of fuels) {
      for (const eff of effs) {
        const got = computeMissionXpFromFuel(f, L, eff);
        // Same pipeline as computeMissionXpFromFuel, substituting only the OLD XP/Fuel rate.
        const nEff = normalizeMissionEfficiency(eff, L);
        const ref = Math.max(f > 0 ? 1 : 0, Math.round(f * refMissionXpPerFuel(L) * nEff * MISSION_XP_REBALANCE));
        assert.equal(got, ref, `mission XP L${L} f${f} eff${eff}`);
        for (const c of cols) {
          assert.equal(applyXpBonus(got, c), applyXpBonus(ref, c), `collection L${L} f${f} eff${eff} c${c}`);
        }
        checks += 1;
      }
    }
  }
  assert.ok(checks === levels.length * fuels.length * effs.length);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
