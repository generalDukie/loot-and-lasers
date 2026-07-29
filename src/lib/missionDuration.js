/**
 * Authoritative mission-duration pools by player level.
 * Fuel cost remains duration_minutes (1 min = 1 Fuel).
 * Integer seconds only — no interpolated / legacy brackets.
 */

export const MISSION_MIN_DURATION_SECONDS = 15;
export const MISSION_MAX_DURATION_SECONDS = 1200; // 20 minutes hard cap
export const MISSION_MIN_FUEL = 0.25; // 15s

/** Per-level { min, max, step } in seconds. Level 21+ uses entry 21 permanently. */
const MISSION_DURATION_RULES = {
  1: { min: 15, max: 30, step: 15 },
  2: { min: 15, max: 30, step: 15 },
  3: { min: 15, max: 45, step: 15 },
  4: { min: 30, max: 60, step: 15 },
  5: { min: 30, max: 75, step: 15 },
  6: { min: 30, max: 90, step: 30 },
  7: { min: 30, max: 90, step: 30 },
  8: { min: 60, max: 120, step: 30 },
  9: { min: 60, max: 150, step: 30 },
  10: { min: 60, max: 150, step: 30 },
  11: { min: 150, max: 300, step: 150 },
  12: { min: 150, max: 300, step: 150 },
  13: { min: 150, max: 450, step: 150 },
  14: { min: 150, max: 450, step: 150 },
  15: { min: 150, max: 600, step: 150 },
  16: { min: 300, max: 750, step: 150 },
  17: { min: 300, max: 750, step: 150 },
  18: { min: 300, max: 900, step: 150 },
  19: { min: 300, max: 1050, step: 150 },
  20: { min: 300, max: 1200, step: 150 },
  /** Level 21 and above — fixed pool, never grows past 20 min. */
  21: { min: 300, max: 1200, step: 300 },
};

function normalizeLevel(level = 1) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

function ruleForLevel(level = 1) {
  const lvl = normalizeLevel(level);
  if (lvl >= 21) return MISSION_DURATION_RULES[21];
  return MISSION_DURATION_RULES[lvl] || MISSION_DURATION_RULES[21];
}

/** Normal allowed durations (seconds) for a level — no leftover-fuel exception. */
export function getAllowedMissionDurations(level = 1) {
  const { min, max, step } = ruleForLevel(level);
  const out = [];
  for (let s = min; s <= max; s += step) out.push(s);
  return out;
}

/** Min/max of the normal pool (legacy helpers / UI). */
export function getMissionDurationBracket(level = 1) {
  const pool = getAllowedMissionDurations(level);
  return { minSec: pool[0], maxSec: pool[pool.length - 1] };
}

/**
 * Pick one duration from the normal level pool.
 * `unit` in [0,1] maps across the discrete pool (deterministic when provided).
 */
export function rollMissionDurationSeconds(level = 1, unit = Math.random()) {
  const pool = getAllowedMissionDurations(level);
  const t = Math.min(1, Math.max(0, Number(unit)));
  if (!Number.isFinite(t)) return pool[0];
  const idx = Math.min(pool.length - 1, Math.round((pool.length - 1) * t));
  return pool[idx];
}

function normalizeFuelAmount(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Exact leftover-fuel duration (seconds): 1 Fuel = 60 seconds.
 * Clamped to [15, 1200]. Returns null if below minimum spendable fuel.
 */
export function remainingFuelDurationSeconds(currentFuel) {
  const fuel = normalizeFuelAmount(currentFuel);
  if (fuel < MISSION_MIN_FUEL) return null;
  const sec = Math.round(fuel * 60);
  return Math.min(
    MISSION_MAX_DURATION_SECONDS,
    Math.max(MISSION_MIN_DURATION_SECONDS, sec)
  );
}

/**
 * True when remaining fuel cannot pay for any normal-pool mission
 * (using base fuel = duration/60, before ship mods).
 */
export function needsRemainingFuelException(level, currentFuel) {
  const fuel = normalizeFuelAmount(currentFuel);
  if (fuel < MISSION_MIN_FUEL) return false;
  const pool = getAllowedMissionDurations(level);
  const cheapest = Math.min(...pool.map((sec) => normalizeFuelAmount(sec / 60)));
  return fuel < cheapest;
}

/** Whether a raw client duration is in the normal pool for the level. */
export function isNormalPoolDuration(level, durationSeconds) {
  const sec = Math.floor(Number(durationSeconds));
  return getAllowedMissionDurations(level).includes(sec);
}

/**
 * Accept normal-pool durations, or an exact remaining-fuel exception duration.
 * `pinnedFuel` is the optional fuel_cost on low-fuel / residual offers.
 */
export function isValidMissionDuration(level, durationSeconds, pinnedFuel = null) {
  const sec = Math.floor(Number(durationSeconds));
  if (!Number.isFinite(sec)) return false;
  if (sec < MISSION_MIN_DURATION_SECONDS || sec > MISSION_MAX_DURATION_SECONDS) return false;
  if (isNormalPoolDuration(level, sec)) return true;
  if (pinnedFuel == null || !Number.isFinite(Number(pinnedFuel))) return false;
  const expected = remainingFuelDurationSeconds(pinnedFuel);
  return expected != null && expected === sec;
}
