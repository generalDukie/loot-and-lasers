/**
 * One-time first-mission tutorial package (common primary-stat helmet + bonus stardust).
 * Eligibility is stamped on new operatives only; progress is tracked on onboarding_tutorial.
 */
import { CLASSES } from "../../../src/lib/gameData.js";
import {
  allocateStatBudget,
  getItemStatBudget,
} from "./itemGeneration.js";
import { randomItem } from "./rewards.js";
import {
  normalizeOnboarding,
} from "./tutorialService.js";

export const TUTORIAL_FIRST_MISSION_STARDUST_BONUS = 100;
/** Cantina board during onboarding — all three offers use this duration. */
export const TUTORIAL_ONBOARDING_MISSION_DURATION_SECONDS = 30;

export function shouldPinTutorialOnboardingMissionDurations(character) {
  const ob = onboardingForCharacter(character);
  if (!isTutorialActiveForBonus(ob)) return false;
  if (Number(character?.missions_completed || 0) > 0) return false;
  return true;
}

export function isTutorialFirstMissionBonusEligible(onboarding) {
  return onboarding?.first_mission_bonus_eligible === true;
}

export function isTutorialActiveForBonus(onboarding) {
  const status = String(onboarding?.status || "");
  return status === "pending" || status === "active";
}

export function onboardingForCharacter(character) {
  return normalizeOnboarding(character?.onboarding_tutorial);
}

export function shouldReserveFirstMissionBonusLaunch(character) {
  const ob = character?.onboarding_tutorial;
  if (!isTutorialFirstMissionBonusEligible(ob)) return false;
  if (!isTutorialActiveForBonus(ob)) return false;
  if (ob.first_mission_bonus_spent) return false;
  if (Number(character?.missions_completed || 0) > 0) return false;
  if (ob.first_mission_bonus_mission_id) return false;
  return true;
}

export function shouldGrantFirstMissionBonusAtClaim(character, missionId) {
  const ob = character?.onboarding_tutorial;
  if (!isTutorialFirstMissionBonusEligible(ob)) return false;
  if (!isTutorialActiveForBonus(ob)) return false;
  if (ob.first_mission_bonus_spent) return false;
  if (String(ob.first_mission_bonus_mission_id || "") !== String(missionId || "")) return false;
  return true;
}

export function isFlaggedFirstMission(character, missionId) {
  const ob = character?.onboarding_tutorial;
  if (!ob?.first_mission_bonus_mission_id) return false;
  return String(ob.first_mission_bonus_mission_id) === String(missionId || "");
}

export function patchLaunchFirstMissionBonus(onboarding, missionId) {
  const base = normalizeOnboarding(onboarding);
  return {
    ...base,
    first_mission_bonus_eligible: true,
    first_mission_bonus_mission_id: String(missionId),
    first_mission_bonus_spent: false,
  };
}

export function patchSpendFirstMissionBonus(onboarding) {
  const base = normalizeOnboarding(onboarding);
  return {
    ...base,
    first_mission_bonus_spent: true,
  };
}

/** Common helmet with only the class primary stat rolled. */
export function generateTutorialFirstMissionHelmet(character, rng = Math.random) {
  const classKey = String(character?.class || "Vanguard");
  const primary = CLASSES[classKey]?.primaryStat || "strength";
  const level = Math.max(1, Math.floor(Number(character?.level) || 1));
  const budget = getItemStatBudget(level, "helmet", "common");
  const stats = allocateStatBudget([primary], budget, rng, "common");
  const item = randomItem("common", level, "helmet", rng, classKey, { origin: "mission" });
  return {
    ...item,
    stats,
  };
}

/** Replaces the normal mission loot chain for the tutorial first win. */
export function settleTutorialFirstMissionBonus({ character, missStreak = 0, rng = Math.random } = {}) {
  return {
    stardustBonus: TUTORIAL_FIRST_MISSION_STARDUST_BONUS,
    itemOutcome: "GEAR",
    gearDropped: true,
    stimDropped: false,
    junkDropped: false,
    itemTemplates: [generateTutorialFirstMissionHelmet(character, rng)],
    gearChance: 1,
    pityBefore: Math.max(0, Math.floor(Number(missStreak) || 0)),
  };
}
