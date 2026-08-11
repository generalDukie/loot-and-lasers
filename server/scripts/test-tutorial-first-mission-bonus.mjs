/**
 * Tests for tutorial first-mission bonus flags + settlement.
 * Run: node server/scripts/test-tutorial-first-mission-bonus.mjs
 */
import {
  defaultOnboardingState,
  normalizeOnboarding,
} from "../src/shared/tutorialService.js";
import {
  TUTORIAL_FIRST_MISSION_STARDUST_BONUS,
  shouldReserveFirstMissionBonusLaunch,
  shouldGrantFirstMissionBonusAtClaim,
  patchLaunchFirstMissionBonus,
  patchSpendFirstMissionBonus,
  generateTutorialFirstMissionHelmet,
  settleTutorialFirstMissionBonus,
} from "../src/shared/tutorialFirstMissionBonus.js";
import { CLASSES } from "../../src/lib/gameData.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testFlags() {
  const fresh = defaultOnboardingState();
  assert(fresh.first_mission_bonus_eligible === true, "new operative is eligible");
  assert(fresh.first_mission_bonus_mission_id == null, "no mission reserved yet");
  assert(fresh.first_mission_bonus_spent === false, "not spent yet");

  const legacy = normalizeOnboarding({
    status: "active",
    step_id: "click_operative",
  });
  assert(legacy.first_mission_bonus_eligible === false, "legacy tutorial state is not eligible");

  const character = {
    level: 1,
    class: "Vanguard",
    missions_completed: 0,
    onboarding_tutorial: fresh,
  };
  assert(shouldReserveFirstMissionBonusLaunch(character), "can reserve on launch");

  const launched = {
    ...character,
    onboarding_tutorial: patchLaunchFirstMissionBonus(fresh, "mission-1"),
  };
  assert(!shouldReserveFirstMissionBonusLaunch(launched), "cannot reserve twice");
  assert(
    shouldGrantFirstMissionBonusAtClaim(launched, "mission-1"),
    "claim matches reserved mission",
  );
  assert(
    !shouldGrantFirstMissionBonusAtClaim(launched, "mission-2"),
    "other missions do not grant bonus",
  );

  const skipped = {
    ...launched,
    onboarding_tutorial: {
      ...launched.onboarding_tutorial,
      status: "skipped",
    },
  };
  assert(!shouldGrantFirstMissionBonusAtClaim(skipped, "mission-1"), "skipped tutorial blocks bonus");

  const spent = {
    ...launched,
    onboarding_tutorial: patchSpendFirstMissionBonus(launched.onboarding_tutorial),
  };
  assert(!shouldGrantFirstMissionBonusAtClaim(spent, "mission-1"), "spent blocks bonus");
}

function testHelmet() {
  let seed = 42;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (const classKey of Object.keys(CLASSES)) {
    const item = generateTutorialFirstMissionHelmet({ class: classKey, level: 1 }, rng);
    const primary = CLASSES[classKey].primaryStat;
    assert(item.type === "helmet", `${classKey} helmet type`);
    assert(item.rarity === "common", `${classKey} common rarity`);
    assert(Object.keys(item.stats).length === 1, `${classKey} single stat only`);
    assert(item.stats[primary] > 0, `${classKey} primary stat present`);
  }
}

function testSettlement() {
  const bonus = settleTutorialFirstMissionBonus({
    character: { class: "Technomancer", level: 1 },
    missStreak: 2,
    rng: () => 0.5,
  });
  assert(bonus.stardustBonus === TUTORIAL_FIRST_MISSION_STARDUST_BONUS, "bonus stardust");
  assert(bonus.itemOutcome === "GEAR", "gear outcome");
  assert(bonus.itemTemplates.length === 1, "one item only");
  assert(bonus.itemTemplates[0].type === "helmet", "helmet drop");
}

testFlags();
testHelmet();
testSettlement();
console.log("tutorial first-mission bonus ok");
console.log("PASS");
