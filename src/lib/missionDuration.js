/**
 * Mission duration compatibility layer.
 * Authoritative pools, Fuel mapping, and remainder exception live in productionMath.
 */
import {
  MISSION_MAX_DURATION_SECONDS as AUTH_MAX_DURATION_SECONDS,
  MISSION_MIN_DURATION_SECONDS as AUTH_MIN_DURATION_SECONDS,
  MISSION_MIN_FUEL as AUTH_MIN_FUEL,
  MISSION_MAX_FUEL as AUTH_MAX_FUEL,
  MISSION_SECONDS_PER_FUEL as AUTH_SECONDS_PER_FUEL,
} from "./productionMath/constants.js";
import {
  getAllowedMissionDurations,
  isLaunchableMissionDuration as isLaunchableFromAuthority,
  isNormalPoolDuration,
  isValidMissionDuration,
  needsRemainingFuelException as needsRemainderFromAuthority,
  remainingFuelDurationSeconds as remainingFuelFromAuthority,
  rollMissionDurationSeconds as rollMissionDurationFromAuthority,
} from "./productionMath/missions.js";

export const MISSION_MIN_DURATION_SECONDS = AUTH_MIN_DURATION_SECONDS;
export const MISSION_MAX_DURATION_SECONDS = AUTH_MAX_DURATION_SECONDS;
export const MISSION_SECONDS_PER_FUEL = AUTH_SECONDS_PER_FUEL;
export const MISSION_MIN_FUEL = AUTH_MIN_FUEL;
export const MISSION_MAX_FUEL = AUTH_MAX_FUEL;

export {
  getAllowedMissionDurations,
  isNormalPoolDuration,
  isValidMissionDuration,
};

export function remainingFuelDurationSeconds(currentFuel) {
  return remainingFuelFromAuthority(currentFuel);
}

export function needsRemainingFuelException(level, currentFuel) {
  return needsRemainderFromAuthority(level, currentFuel);
}

export function isLaunchableMissionDuration(durationSeconds) {
  return isLaunchableFromAuthority(durationSeconds);
}

export function getMissionDurationBracket(level = 1) {
  const pool = getAllowedMissionDurations(level);
  return { minSec: pool[0], maxSec: pool[pool.length - 1] };
}

export function rollMissionDurationSeconds(level = 1, unitOrRng) {
  return rollMissionDurationFromAuthority(level, unitOrRng);
}
