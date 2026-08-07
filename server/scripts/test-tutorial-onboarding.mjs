/**
 * Smoke test for onboarding tutorial service.
 * Run: node server/scripts/test-tutorial-onboarding.mjs
 */
import {
  getOnboardingFromCharacter,
  beginOrResume,
  advanceNext,
  jumpToFinish,
  markSkipped,
  markCompleted,
  publicTutorialPayload,
  defaultOnboardingState,
  ONBOARDING_STEPS,
} from "../src/shared/tutorialService.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testService() {
  const legacy = getOnboardingFromCharacter({ id: "x" });
  assert(legacy.status === "completed", "legacy should be completed");
  assert(publicTutorialPayload(legacy).should_show === false, "legacy should not show");

  let state = defaultOnboardingState();
  assert(state.status === "pending", "new pending");
  state = beginOrResume(state);
  assert(state.status === "active", "activated");

  const seen = new Set([state.step_id]);
  for (let i = 0; i < ONBOARDING_STEPS.length + 2; i++) {
    state = advanceNext(state);
    seen.add(state.step_id);
    if (state.step_id === "finish") break;
  }
  assert(state.step_id === "finish", "ends on finish");
  assert(seen.size === ONBOARDING_STEPS.length, "visited all steps");

  state = jumpToFinish(beginOrResume(defaultOnboardingState()));
  assert(state.step_id === "finish", "jump finish");
  const done = markCompleted(state, { rewardClaimed: true });
  assert(done.state.status === "completed", "completed");
  assert(done.state.reward_claimed === true, "reward flagged");

  const skipped = markSkipped(beginOrResume(defaultOnboardingState()));
  assert(skipped.status === "skipped", "skipped");
  assert(publicTutorialPayload(skipped).should_show === false, "skip hides");

  console.log(`tutorialService ok — ${ONBOARDING_STEPS.length} steps`);
}

testService();
console.log("PASS");
