/**
 * Smoke test for onboarding tutorial service.
 * Run: node server/scripts/test-tutorial-onboarding.mjs
 */
import {
  getOnboardingFromCharacter,
  beginOrResume,
  advanceNext,
  advanceGate,
  advanceTo,
  jumpToFinish,
  markSkipped,
  markCompleted,
  publicTutorialPayload,
  defaultOnboardingState,
  normalizeOnboarding,
  ONBOARDING_STEPS,
} from "../src/shared/tutorialService.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ACTION_GATES = new Set([
  "click_target",
  "launch_mission",
  "arena_battle",
  "buy_attribute",
  "equip_item",
]);

function testService() {
  const legacy = getOnboardingFromCharacter({ id: "x" });
  assert(legacy.status === "completed", "legacy should be completed");
  assert(publicTutorialPayload(legacy).should_show === false, "legacy should not show");

  const staleActive = getOnboardingFromCharacter({
    id: "old",
    onboarding_tutorial: { status: "active", step_id: "mission_pick" },
  });
  assert(staleActive.status === "completed", "pre-ship active tutorial is disabled");
  assert(staleActive.step_id === "finish", "pre-ship forwards to finish");
  assert(publicTutorialPayload(staleActive).should_show === false, "pre-ship does not show");

  let state = defaultOnboardingState();
  assert(state.status === "pending", "new pending");
  assert(state.step_id === "click_operative", "starts at operative panel");
  state = beginOrResume(state);
  assert(state.status === "active", "activated");

  const remapped = normalizeOnboarding({ status: "active", step_id: "hero" });
  assert(remapped.step_id === "click_operative", "legacy hero restarts at click_operative");
  assert(normalizeOnboarding({ status: "active", step_id: "shop_inspect" }).step_id === "shop_market", "removed shop inspect forwards");
  assert(normalizeOnboarding({ status: "active", step_id: "shop_sell" }).step_id === "shop_market", "removed shop sell forwards");
  assert(normalizeOnboarding({ status: "active", step_id: "arena_fight" }).step_id === "click_mine", "removed arena fight forwards");
  assert(normalizeOnboarding({ status: "active", step_id: "click_ranks" }).step_id === "click_mine", "removed click ranks forwards");
  assert(normalizeOnboarding({ status: "active", step_id: "frontier_dungeons" }).step_id === "mission_return", "removed frontier dungeons forwards");

  try {
    advanceTo(beginOrResume(defaultOnboardingState()), "finish");
    assert(false, "cannot skip ahead to finish");
  } catch (err) {
    assert(/skip ahead/i.test(err.message), "blocks skip ahead");
  }

  assert(ONBOARDING_STEPS[0].id === "click_operative", "catalog starts at operative");
  assert(ONBOARDING_STEPS[12].id === "click_shop", "shop nav follows hero equip");
  assert(ONBOARDING_STEPS[13].id === "shop_market", "shop market follows shop nav");
  assert(ONBOARDING_STEPS[15].id === "arena_free", "arena free follows click arena");
  assert(normalizeOnboarding({ status: "active", step_id: "mission_view_rewards" }).step_id === "click_hero", "removed view-rewards forwards to operative nav");
  assert(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 2].id === "continue_travels", "cantina return before finish");
  assert(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1].id === "finish", "catalog ends on finish");
  const ids = ONBOARDING_STEPS.map((s) => s.id);
  for (const required of [
    "click_operative",
    "click_hero",
    "hero_upgrade",
    "hero_equip",
    "click_cantina",
    "mission_pick",
    "click_shop",
    "shop_market",
    "click_arena",
    "arena_free",
    "click_mine",
    "continue_travels",
    "finish",
  ]) {
    assert(ids.includes(required), `catalog includes ${required}`);
  }
  for (const removed of [
    "shop_inspect",
    "shop_sell",
    "arena_fight",
    "arena_result",
    "click_ranks",
    "click_friends",
    "click_mail",
    "hero_stims",
    "frontier_dungeons",
    "mission_view_rewards",
  ]) {
    assert(!ids.includes(removed), `${removed} step removed`);
  }

  const seen = new Set([state.step_id]);
  while (state.step_id !== "finish") {
    const step = ONBOARDING_STEPS.find((s) => s.id === state.step_id);
    assert(step, `missing step ${state.step_id}`);
    assert(step.title && step.body, `${step.id} has copy`);
    assert(String(step.body).length < 320, `${step.id} copy stays short`);
    if (ACTION_GATES.has(step.gate) && !step.optional) {
      try {
        advanceNext(state);
        assert(false, `${step.id} should block next without gate`);
      } catch (err) {
        assert(
          err.code === "TUTORIAL_ACTION_REQUIRED" || /action/i.test(err.message),
          `${step.id} blocks next: ${err.message}`
        );
      }
      state = advanceGate(state, step.gate);
    } else {
      state = advanceNext(state);
    }
    seen.add(state.step_id);
  }
  assert(state.step_id === "finish", "ends on finish");
  assert(seen.size === ONBOARDING_STEPS.length, `visited all steps (${seen.size}/${ONBOARDING_STEPS.length})`);

  const payload = publicTutorialPayload(beginOrResume(defaultOnboardingState()));
  assert(payload.chapter_index >= 1, "chapter index");
  assert(String(payload.progress_label).includes("Operative"), "progress label names chapter");

  state = jumpToFinish(beginOrResume(defaultOnboardingState()));
  assert(state.step_id === "finish", "jump finish");
  const done = markCompleted(state, { rewardClaimed: true });
  assert(done.state.status === "completed", "completed");

  const skipped = markSkipped(beginOrResume(defaultOnboardingState()));
  assert(skipped.status === "skipped", "skipped");
  assert(publicTutorialPayload(skipped).should_show === false, "skip hides");

  console.log(`tutorialService ok — ${ONBOARDING_STEPS.length} steps`);
}

testService();
console.log("PASS");
