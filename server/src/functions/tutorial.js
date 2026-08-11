/**
 * Interactive onboarding tutorial RPCs.
 * Progress is server-owned and resume-safe.
 */
import { entities } from "../entities.js";
import { withTransactionAsync } from "../db.js";
import { getBalances } from "../shared/currencyService.js";
import {
  getOnboardingFromCharacter,
  publicTutorialPayload,
  beginOrResume,
  advanceTo,
  advanceNext,
  advanceGate,
  jumpToFinish,
  markSkipped,
  markCompleted,
  stepIndex,
  stepById,
  ONBOARDING_STEPS,
} from "../shared/tutorialService.js";
import { resolveSelectedCharacter } from "../gameplayContext.js";

function myCharacter(user) {
  return resolveSelectedCharacter(user, { required: false });
}

function assertCharacterMatchesGate(ch, state, gate) {
  const step = stepById(state.step_id);
  if (step.optional) return;
  if (gate === "launch_mission") {
    const active = Boolean(ch?.active_mission_id);
    const done = Number(ch?.missions_completed || 0) > 0;
    if (!active && !done) httpErr(400, "Start a mission first", "TUTORIAL_GATE_UNMET");
  }
}

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

async function persistOnboarding(characterId, state) {
  return entities.Character.update(characterId, { onboarding_tutorial: state });
}

/** Read / soft-start tutorial state for the selected character. */
export async function GetTutorialState(user, _body = {}) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character", success: false } };

  let state = getOnboardingFromCharacter(character);
  let live = character;
  const storedId = character.onboarding_tutorial?.step_id;
  if (state.status === "pending") {
    state = beginOrResume(state);
    live = await persistOnboarding(character.id, state);
  } else if (state.status === "active" && storedId && state.step_id !== storedId) {
    state = beginOrResume(state);
    live = await persistOnboarding(character.id, state);
  }

  return {
    status: 200,
    body: {
      success: true,
      tutorial: publicTutorialPayload(state),
      character: live,
      balances: getBalances(live),
    },
  };
}

/**
 * Advance tutorial progress.
 * Body: { action: "next"|"back"|"set"|"gate", step_id?, gate? }
 * Visit/ack: client sends next after arriving or reading.
 * Action gates: client sends { action: "gate", gate } after the required interaction.
 */
export async function AdvanceTutorial(user, body = {}) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character", success: false } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = entities.Character.get(character.id) || character;
      let state = beginOrResume(getOnboardingFromCharacter(ch));
      if (state.status === "completed" || state.status === "skipped") {
        httpErr(409, "Tutorial already finished", "TUTORIAL_FINISHED");
      }

      const action = String(body.action || "next").toLowerCase();
      if (action === "gate") {
        const gate = String(body.gate || body.gate_id || "");
        assertCharacterMatchesGate(ch, state, gate);
        state = advanceGate(state, gate);
      } else if (action === "set" || ((body.step_id || body.stepId) && action !== "next" && action !== "back")) {
        const target = String(body.step_id || body.stepId || "");
        state = advanceTo(state, target);
      } else if (action === "back") {
        const idx = stepIndex(state.step_id);
        if (idx <= 0) httpErr(400, "Already at first step");
        state = advanceTo(state, ONBOARDING_STEPS[idx - 1].id);
      } else {
        state = advanceNext(state);
      }

      const live = await persistOnboarding(ch.id, state);
      return {
        success: true,
        tutorial: publicTutorialPayload(state),
        character: live,
        balances: getBalances(live),
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code, success: false } };
    throw err;
  }
}

/** Skip tutorial permanently. */
export async function SkipTutorial(user, body = {}) {
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character", success: false } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = entities.Character.get(character.id) || character;
      let state = getOnboardingFromCharacter(ch);
      if (state.status === "completed") {
        httpErr(409, "Tutorial already completed", "TUTORIAL_COMPLETED");
      }
      if (state.status !== "skipped") {
        state = markSkipped(state);
        const live = await persistOnboarding(ch.id, state);
        return {
          success: true,
          skipped: true,
          tutorial: publicTutorialPayload(state),
          character: live,
          balances: getBalances(live),
        };
      }
      return {
        success: true,
        skipped: true,
        tutorial: publicTutorialPayload(state),
        character: ch,
        balances: getBalances(ch),
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code, success: false } };
    throw err;
  }
}

/** Complete tutorial (no separate completion reward — first-mission claim handles onboarding loot). */
export async function CompleteTutorial(user, body = {}) {
  void body;
  const character = await myCharacter(user);
  if (!character) return { status: 404, body: { error: "No character", success: false } };

  try {
    const result = await withTransactionAsync(async () => {
      const ch = entities.Character.get(character.id) || character;
      let state = getOnboardingFromCharacter(ch);

      if (state.status === "skipped") {
        httpErr(409, "Tutorial was skipped", "TUTORIAL_SKIPPED");
      }

      if (state.status === "completed") {
        const live = entities.Character.get(ch.id) || ch;
        return {
          success: true,
          completed: true,
          already_completed: true,
          tutorial: publicTutorialPayload(state),
          character: live,
          balances: getBalances(live),
        };
      }

      if (state.status === "active" || state.status === "pending") {
        state = jumpToFinish(beginOrResume(state));
      }

      const { state: nextState, already } = markCompleted(state, { rewardClaimed: false });
      const live = await persistOnboarding(ch.id, nextState);
      const fresh = entities.Character.get(ch.id) || live;

      return {
        success: true,
        completed: true,
        already_completed: already,
        tutorial: publicTutorialPayload(nextState),
        character: fresh,
        balances: getBalances(fresh),
      };
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err.status) return { status: err.status, body: { error: err.message, code: err.code, success: false } };
    throw err;
  }
}
