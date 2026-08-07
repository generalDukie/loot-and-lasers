/**
 * Onboarding tutorial authority (presentation steps + completion/reward).
 * Character.onboarding_tutorial is server-owned; clients may only advance via RPCs.
 */
import { clock } from "./time/clock.js";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

/** Canonical step order — keep stable; append new steps at end for future tutorials. */
export const ONBOARDING_STEPS = Object.freeze([
  {
    id: "welcome",
    title: "Welcome, Operative",
    body: "Loot & Lasers is about growing stronger, collecting gear, and climbing the ranks. Let's cover the essentials in under three minutes.",
    route: "/",
    spotlight: null,
    gate: "ack",
  },
  {
    id: "hero",
    title: "Your Hero",
    body: "Open Hero to manage equipment and attributes. Gear and stats decide how hard you hit — and how long you last.",
    route: "/character",
    spotlight: "nav-hero",
    gate: "visit",
  },
  {
    id: "mission",
    title: "Missions & Frontier",
    body: "The Cantina launches timed missions for XP and loot. Galactic Frontier is the spiral crawl for riskier rewards. Visit the Cantina to continue.",
    route: "/missions",
    spotlight: "nav-cantina",
    gate: "visit",
  },
  {
    id: "inventory",
    title: "Backpack & Equip",
    body: "Your backpack lives on the Hero page. Equip an item from the bag onto an empty slot — or tap Next if your bag is empty.",
    route: "/character",
    spotlight: "hero-backpack",
    gate: "ack",
  },
  {
    id: "arena",
    title: "Battle Arena",
    body: "Arena is automated PvP with free daily battles for ranking progress. Visit the Arena lobby to see your free battles and challengers.",
    route: "/arena",
    spotlight: "nav-arena",
    gate: "visit",
  },
  {
    id: "daily",
    title: "Daily Rewards",
    body: "Claim Daily Login rewards each day for a streak of Stardust, fuel, and gear. Consistency pays.",
    route: "/",
    spotlight: null,
    gate: "ack",
    openDaily: true,
  },
  {
    id: "wallet",
    title: "Your Wallet",
    body: "Fuel powers ship systems and missions, Stardust buys market goods and guild founding, and Nova Crystals skip waits or buy premium boosts.",
    route: null,
    spotlight: "shell-wallet",
    gate: "ack",
  },
  {
    id: "finish",
    title: "You're Cleared for Launch",
    body: "Tutorial complete. Claim a small starter package, then explore freely — the Codex in Settings has the full manual.",
    route: "/",
    spotlight: null,
    gate: "finish",
  },
]);

export const ONBOARDING_STARTER_REWARD = Object.freeze({
  stardust: 1000,
  nova_crystals: 25,
  fuel: 20,
});

const STEP_IDS = ONBOARDING_STEPS.map((s) => s.id);

export function defaultOnboardingState() {
  return {
    status: "pending", // pending | active | completed | skipped
    step_id: "welcome",
    reward_claimed: false,
    started_at: null,
    completed_at: null,
    updated_at: null,
  };
}

export function normalizeOnboarding(raw) {
  const base = defaultOnboardingState();
  if (!raw || typeof raw !== "object") return base;
  const status = ["pending", "active", "completed", "skipped"].includes(raw.status)
    ? raw.status
    : base.status;
  let step_id = String(raw.step_id || base.step_id);
  if (!STEP_IDS.includes(step_id)) step_id = base.step_id;
  return {
    status,
    step_id,
    reward_claimed: !!raw.reward_claimed,
    started_at: raw.started_at || null,
    completed_at: raw.completed_at || null,
    updated_at: raw.updated_at || null,
  };
}

export function getOnboardingFromCharacter(character) {
  // Legacy characters never stored this field — do not force onboarding on veterans.
  if (!character || character.onboarding_tutorial == null) {
    return {
      ...defaultOnboardingState(),
      status: "completed",
      step_id: "finish",
      reward_claimed: true,
    };
  }
  return normalizeOnboarding(character.onboarding_tutorial);
}

export function stepIndex(stepId) {
  const i = STEP_IDS.indexOf(stepId);
  return i < 0 ? 0 : i;
}

export function stepById(stepId) {
  return ONBOARDING_STEPS.find((s) => s.id === stepId) || ONBOARDING_STEPS[0];
}

export function publicTutorialPayload(state) {
  const s = normalizeOnboarding(state);
  const step = stepById(s.step_id);
  const idx = stepIndex(s.step_id);
  return {
    status: s.status,
    step_id: s.step_id,
    reward_claimed: s.reward_claimed,
    step_index: idx + 1,
    step_total: ONBOARDING_STEPS.length,
    step,
    steps: ONBOARDING_STEPS.map(({ id, title }) => ({ id, title })),
    reward: ONBOARDING_STARTER_REWARD,
    should_show: s.status === "pending" || s.status === "active",
  };
}

export function assertCanMutateTutorial(state) {
  const s = normalizeOnboarding(state);
  if (s.status === "completed" || s.status === "skipped") {
    httpErr(409, "Tutorial already finished");
  }
  return s;
}

export function beginOrResume(state) {
  const s = normalizeOnboarding(state);
  if (s.status === "completed" || s.status === "skipped") return s;
  const now = clock.nowIso();
  return {
    ...s,
    status: "active",
    started_at: s.started_at || now,
    updated_at: now,
  };
}

export function advanceTo(state, nextStepId) {
  const s = assertCanMutateTutorial(state);
  if (!STEP_IDS.includes(nextStepId)) httpErr(400, "Unknown tutorial step");
  const cur = stepIndex(s.step_id);
  const next = stepIndex(nextStepId);
  // Allow same step (idempotent), next step, or going back one for UX.
  if (next > cur + 1) httpErr(400, "Cannot skip ahead in tutorial");
  const now = clock.nowIso();
  return {
    ...s,
    status: "active",
    step_id: nextStepId,
    started_at: s.started_at || now,
    updated_at: now,
  };
}

export function advanceNext(state) {
  const s = assertCanMutateTutorial(state);
  const cur = stepIndex(s.step_id);
  if (cur >= ONBOARDING_STEPS.length - 1) {
    return { ...s, status: "active", step_id: "finish", updated_at: clock.nowIso() };
  }
  return advanceTo(s, ONBOARDING_STEPS[cur + 1].id);
}

/** Jump to finish without intermediate steps (used by CompleteTutorial). */
export function jumpToFinish(state) {
  const s = assertCanMutateTutorial(state);
  const now = clock.nowIso();
  return {
    ...s,
    status: "active",
    step_id: "finish",
    started_at: s.started_at || now,
    updated_at: now,
  };
}

export function markSkipped(state) {
  const s = normalizeOnboarding(state);
  if (s.status === "completed") httpErr(409, "Tutorial already completed");
  if (s.status === "skipped") return s;
  const now = clock.nowIso();
  return {
    ...s,
    status: "skipped",
    completed_at: now,
    updated_at: now,
  };
}

export function markCompleted(state, { rewardClaimed }) {
  const s = normalizeOnboarding(state);
  if (s.status === "completed") {
    return { state: s, already: true };
  }
  if (s.status === "skipped") {
    // Skipping already finished the guide; reward may still be claimable once.
  }
  const now = clock.nowIso();
  return {
    state: {
      ...s,
      status: "completed",
      step_id: "finish",
      reward_claimed: !!(s.reward_claimed || rewardClaimed),
      completed_at: now,
      updated_at: now,
    },
    already: false,
  };
}
