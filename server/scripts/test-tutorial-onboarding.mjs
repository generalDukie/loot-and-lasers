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
]);

function testService() {
  const legacy = getOnboardingFromCharacter({ id: "x" });
  assert(legacy.status === "completed", "legacy should be completed");
  assert(publicTutorialPayload(legacy).should_show === false, "legacy should not show");

  let state = defaultOnboardingState();
  assert(state.status === "pending", "new pending");
  assert(state.step_id === "click_operative", "starts at operative panel");
  state = beginOrResume(state);
  assert(state.status === "active", "activated");

  const remapped = normalizeOnboarding({ status: "active", step_id: "hero" });
  assert(remapped.step_id === "click_operative", "legacy hero restarts at click_operative");
  assert(normalizeOnboarding({ status: "active", step_id: "mission" }).step_id === "click_operative", "legacy mission restarts");
  assert(normalizeOnboarding({ status: "active", step_id: "arena" }).step_id === "click_operative", "legacy arena restarts");
  assert(normalizeOnboarding({ status: "active", step_id: "welcome" }).step_id === "click_operative", "legacy welcome restarts");
  assert(normalizeOnboarding({ status: "active", step_id: "finish" }).step_id === "finish", "finish stays finish");
  assert(normalizeOnboarding({ status: "completed", step_id: "finish" }).status === "completed", "completed stays completed");

  try {
    advanceTo(beginOrResume(defaultOnboardingState()), "finish");
    assert(false, "cannot skip ahead to finish");
  } catch (err) {
    assert(/skip ahead/i.test(err.message), "blocks skip ahead");
  }

  assert(ONBOARDING_STEPS[0].id === "click_operative", "catalog starts at operative");
  assert(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1].id === "finish", "catalog ends on finish");
  const ids = ONBOARDING_STEPS.map((s) => s.id);
  for (const required of [
    "click_operative",
    "click_hero",
    "hero_upgrade",
    "hero_gear",
    "hero_backpack",
    "hero_equip",
    "hero_stims",
    "click_cantina",
    "mission_start",
    "mission_timer",
    "click_frontier",
    "click_friends",
    "click_mail",
    "click_arena",
    "arena_fight",
    "click_ranks",
    "click_shop",
    "click_casino",
    "click_mine",
    "finish",
  ]) {
    assert(ids.includes(required), `catalog includes ${required}`);
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

  const pages = new Set(ONBOARDING_STEPS.map((s) => s.page).filter(Boolean));
  assert(pages.has("res://Scenes/UI/stats.tscn"), "hero page");
  assert(pages.has("res://Scenes/UI/cantina.tscn"), "cantina page");
  assert(pages.has("res://Scenes/UI/mission_run.tscn"), "mission run page");
  assert(pages.has("res://Scenes/UI/shop.tscn"), "shop page");
  assert(pages.has("res://Scenes/UI/arena.tscn"), "arena page");
  assert(pages.has("res://Scenes/UI/leaderboard.tscn"), "ranks page");
  assert(pages.has("res://Scenes/UI/galaxy.tscn"), "frontier page");
  assert(pages.has("res://Scenes/UI/collectibles.tscn"), "vault page");
  assert(pages.has("res://Scenes/UI/casino.tscn"), "casino page");
  assert(pages.has("res://Scenes/UI/mining.tscn"), "mine page");
  assert(pages.has("res://Scenes/UI/friends.tscn") || ids.includes("click_friends"), "friends nav step");
  assert(ids.includes("click_mail"), "mail nav step");

  const payload = publicTutorialPayload(beginOrResume(defaultOnboardingState()));
  assert(payload.chapter_index >= 1, "chapter index");
  assert(payload.chapter_total >= 8, "chapter total");
  assert(String(payload.progress_label).includes("Operative"), "progress label names chapter");

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
