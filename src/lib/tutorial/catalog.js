/**
 * Client catalog for the reusable tutorial engine.
 * Server remains authoritative for progress + rewards; this drives presentation.
 */

export const TUTORIAL_EVENT = "ll-tutorial-action";

/** Dispatch when the player performs a gated tutorial action. */
export function emitTutorialAction(action, detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TUTORIAL_EVENT, {
      detail: { action, ...detail },
    })
  );
}

/**
 * Spotlight ids must match data-tutorial attributes in the shell/pages.
 * Steps are ordered; ids match server ONBOARDING_STEPS.
 */
export const ONBOARDING_STEP_META = Object.freeze({
  welcome: {
    primaryLabel: "Let's go",
    allowBack: false,
    highlightInteractive: false,
  },
  hero: {
    primaryLabel: "Open Hero",
    allowBack: true,
    navigateTo: "/character",
    waitForAction: "visit:/character",
    highlightInteractive: true,
  },
  mission: {
    primaryLabel: "Open Cantina",
    allowBack: true,
    navigateTo: "/missions",
    waitForAction: "visit:/missions",
    highlightInteractive: true,
  },
  inventory: {
    primaryLabel: "Continue",
    allowBack: true,
    navigateTo: "/character",
    waitForAction: null,
    secondaryHint: "Equip an item from your backpack if you have one, then continue.",
    highlightInteractive: true,
  },
  arena: {
    primaryLabel: "Open Arena",
    allowBack: true,
    navigateTo: "/arena",
    waitForAction: "visit:/arena",
    highlightInteractive: true,
  },
  daily: {
    primaryLabel: "Got it",
    allowBack: true,
    openDaily: true,
    waitForAction: null,
    highlightInteractive: false,
  },
  wallet: {
    primaryLabel: "Continue",
    allowBack: true,
    waitForAction: null,
    highlightInteractive: false,
  },
  finish: {
    primaryLabel: "Claim & play",
    allowBack: true,
    finish: true,
    highlightInteractive: false,
  },
});

export function metaForStep(stepId) {
  return ONBOARDING_STEP_META[stepId] || ONBOARDING_STEP_META.welcome;
}
