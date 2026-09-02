/**
 * Tests for tutorial first-mission bonus flags + settlement.
 * Run: node server/scripts/test-tutorial-first-mission-bonus.mjs
 */
import {
  defaultOnboardingState,
  normalizeOnboarding,
} from "../src/shared/tutorialService.js";
import {
  TUTORIAL_ONBOARDING_MISSION_DURATION_SECONDS,
  shouldReserveFirstMissionBonusLaunch,
  shouldGrantFirstMissionBonusAtClaim,
  shouldPinTutorialOnboardingMissionDurations,
  patchLaunchFirstMissionBonus,
  patchSpendFirstMissionBonus,
  generateTutorialFirstMissionHelmet,
  settleTutorialFirstMissionBonus,
} from "../src/shared/tutorialFirstMissionBonus.js";
import { CLASSES } from "../../src/lib/gameData.js";
import {
  allocateStatBudget,
  getItemStatBudget,
} from "../src/shared/itemGeneration.js";
import { randomItem } from "../src/shared/rewards.js";
import {
  finalizeGearPricingQuality,
  resolveAuthoritativeGearResaleValue,
} from "../../src/lib/gearPricingQuality.js";
import {
  COMMON_POSITIVE_STAT_COUNT,
} from "../../src/lib/productionMath/index.js";

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

  assert(TUTORIAL_ONBOARDING_MISSION_DURATION_SECONDS === 30, "tutorial board duration is 30s");
  assert(shouldPinTutorialOnboardingMissionDurations(character), "fresh operative pins board durations");
  assert(
    !shouldPinTutorialOnboardingMissionDurations({ ...character, missions_completed: 1 }),
    "after first mission board is not pinned",
  );
  assert(
    !shouldPinTutorialOnboardingMissionDurations({
      ...character,
      onboarding_tutorial: { ...fresh, status: "skipped" },
    }),
    "skipped tutorial does not pin board",
  );
}

const TUTORIAL_HELMET_TEST_SEEDS = Object.freeze([1, 42, 99, 1_234_567]);
const TUTORIAL_HELMET_LCG_MULTIPLIER = 1664525;
const TUTORIAL_HELMET_LCG_INCREMENT = 1013904223;
const TUTORIAL_HELMET_LCG_MODULUS = 0x100000000;

function makeLcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, TUTORIAL_HELMET_LCG_MULTIPLIER) + TUTORIAL_HELMET_LCG_INCREMENT) >>> 0;
    return state / TUTORIAL_HELMET_LCG_MODULUS;
  };
}

function countingRng(inner) {
  let calls = 0;
  const rng = () => {
    calls += 1;
    return inner();
  };
  rng.calls = () => calls;
  return rng;
}

function testHelmet() {
  for (const seed of TUTORIAL_HELMET_TEST_SEEDS) {
    for (const classKey of Object.keys(CLASSES)) {
      const character = { class: classKey, level: 1 };
      const primary = CLASSES[classKey].primaryStat;
      const liveRng = countingRng(makeLcg(seed));
      const item = generateTutorialFirstMissionHelmet(character, liveRng);

      assert(item.type === "helmet", `${classKey} helmet type`);
      assert(item.rarity === "common", `${classKey} common rarity`);
      assert(Object.keys(item.stats).length === COMMON_POSITIVE_STAT_COUNT, `${classKey} single stat only`);
      assert(item.stats[primary] > 0, `${classKey} primary stat present`);
      assert(Number.isFinite(item.pricing_quality_raw), `${classKey} finite raw quality`);
      assert(Number.isFinite(item.pricing_quality_score), `${classKey} finite quality score`);
      assert(Number.isFinite(item.pricing_quality_multiplier_bps), `${classKey} finite multiplier`);
      assert(Number.isFinite(item.sell_value), `${classKey} finite sell value`);

      const baselineRng = countingRng(makeLcg(seed));
      const rolled = randomItem("common", 1, "helmet", baselineRng, classKey, {
        origin: "mission",
        skipPricingQuality: true,
      });
      const budget = Number.isFinite(Number(rolled.stat_budget))
        ? Math.max(1, Math.floor(Number(rolled.stat_budget)))
        : getItemStatBudget(1, "helmet", "common");
      allocateStatBudget([primary], budget, baselineRng, "common");
      assert(
        liveRng.calls() === baselineRng.calls(),
        `${classKey} seed ${seed} quality finalization consumed extra RNG`,
      );

      const independent = {
        ...item,
        stats: { ...item.stats },
      };
      finalizeGearPricingQuality(independent, { className: classKey, forceRescore: true });
      independent.sell_value = resolveAuthoritativeGearResaleValue(independent, { className: classKey });
      assert(independent.pricing_quality_raw === item.pricing_quality_raw, `${classKey} raw quality reproduces`);
      assert(independent.pricing_quality_score === item.pricing_quality_score, `${classKey} score reproduces`);
      assert(
        independent.pricing_quality_multiplier_bps === item.pricing_quality_multiplier_bps,
        `${classKey} multiplier reproduces`,
      );
      assert(independent.sell_value === item.sell_value, `${classKey} sell value reproduces`);

      const again = generateTutorialFirstMissionHelmet(character, makeLcg(seed));
      assert(JSON.stringify(again.stats) === JSON.stringify(item.stats), `${classKey} seed ${seed} stats match`);
      assert(again.pricing_quality_score === item.pricing_quality_score, `${classKey} seed ${seed} score match`);
      assert(again.sell_value === item.sell_value, `${classKey} seed ${seed} sell match`);
    }
  }
}

function testSettlement() {
  const bonus = settleTutorialFirstMissionBonus({
    character: { class: "Technomancer", level: 1 },
    missStreak: 2,
    rng: () => 0.5,
  });
  assert(bonus.stardustBonus === 0, "no extra tutorial stardust");
  assert(bonus.itemOutcome === "GEAR", "gear outcome");
  assert(bonus.itemTemplates.length === 1, "one item only");
  assert(bonus.itemTemplates[0].type === "helmet", "helmet drop");
}

testFlags();
testHelmet();
testSettlement();
console.log("tutorial first-mission bonus ok");
console.log("PASS");
