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

const PAGE = Object.freeze({
  hero: "res://Scenes/UI/stats.tscn",
  cantina: "res://Scenes/UI/cantina.tscn",
  mission_run: "res://Scenes/UI/mission_run.tscn",
  vault: "res://Scenes/UI/collectibles.tscn",
  shop: "res://Scenes/UI/shop.tscn",
  arena: "res://Scenes/UI/arena.tscn",
  ranks: "res://Scenes/UI/leaderboard.tscn",
  frontier: "res://Scenes/UI/galaxy.tscn",
  friends: "res://Scenes/UI/friends.tscn",
  mail: "res://Scenes/UI/mail.tscn",
  casino: "res://Scenes/UI/casino.tscn",
  mine: "res://Scenes/UI/mining.tscn",
});

/** Guided playthrough: Operative → Cantina mission → Frontier → Operative gear → Market → Arena → Mine. */
export const ONBOARDING_STEPS = Object.freeze([
  {
    id: "click_operative",
    chapter: "Operative",
    title: "Here's Your Operative",
    body: "The Operative Panel shows your unreasonably magnificent character, your level, class, and wallet. In Loot & Lasers you'll use Fuel, and find Stardust and Nova Crystals. Click your Operative to continue.",
    gate: "click_target",
    page: null,
    spotlight: "shell-operative",
    placement: "right",
    cta: "Click your Operative to continue",
    nav_label: "Operative Panel",
  },
  {
    id: "click_cantina",
    chapter: "Cantina",
    title: "Visit the Cantina",
    body:
      "There's all sorts of creatures in the Cantina. Most friendly... some not. A few even have missions they need help with.",
    gate: "click_target",
    page: null,
    spotlight: "nav-cantina",
    placement: "right",
    cta: "Click Cantina to continue",
    nav_label: "Cantina",
  },
  {
    id: "mission_pick",
    chapter: "Cantina",
    title: "Pick your Poison",
    body:
      "Missions are the lifeblood of Loot & Lasers. Each day your fuel reserves are refilled, and you can venture out into the cosmos. Some missions are long, some are short, and some give better rewards than others. Every mission will provide XP and Stardust - the primary currency in this world. Select a mission",
    gate: "click_target",
    page: PAGE.cantina,
    spotlight: "cantina-patrons",
    placement: "top",
    cta: "Select a mission",
    nav_label: "Cantina",
  },
  {
    id: "mission_start",
    chapter: "Cantina",
    title: "Start the Job",
    body: "Press START MISSION. The offer locks in until you finish and claim it.",
    gate: "launch_mission",
    page: PAGE.cantina,
    spotlight: "cantina-start",
    extra_spotlight: "cantina-patrons",
    placement: "top",
    cta: "Start a mission to continue",
    nav_label: "Cantina",
  },
  {
    id: "mission_timer",
    chapter: "Cantina",
    title: "The Clock's Running",
    body:
      "You aren't bound by your current adventure, feel free to click around and complete other tasks while waiting for a mission. Keep an eye on the button up here to quickly return and claim your rewards when your character has returned. You'll need to fight for them!",
    gate: "ack",
    page: PAGE.mission_run,
    spotlight: "shell-activity",
    extra_spotlight: "mission-timer",
    placement: "top",
    cta: "Got it",
    nav_label: "Mission",
  },
  {
    id: "click_frontier",
    chapter: "Frontier",
    title: "Venture into the Frontier",
    body: "You'll find plenty of planets to pillage in the Galactic Frontier.",
    gate: "click_target",
    page: null,
    spotlight: "nav-frontier",
    placement: "right",
    cta: "Click Galactic Frontier",
    nav_label: "Galactic Frontier",
  },
  {
    id: "frontier_fight",
    chapter: "Frontier",
    title: "Planets",
    body:
      "The planets you'll discover in the galactic frontier have 10 terrifying enemies scattered across them who just so happen to have awesome loot. You'll unlock the ability to venture out to the first planet at level 10.",
    gate: "ack",
    page: PAGE.frontier,
    spotlight: "galaxy-map",
    extra_spotlight: "galaxy-encounters",
    placement: "top_left",
    cta: "Got it",
    nav_label: "Galactic Frontier",
  },
  {
    id: "mission_return",
    chapter: "Cantina",
    title: "Loot?",
    body: "Your operative is still out on their mission. Let's check back in.",
    gate: "click_target",
    page: null,
    spotlight: "shell-activity",
    placement: "bottom",
    cta: "Tap Mission in Progress",
    nav_label: "Mission",
  },
  {
    id: "mission_fight",
    chapter: "Cantina",
    title: "Something needs a beating",
    body:
      "Mission complete... almost. Before a mission can end, you'll need to win the battle to claim the spoils.",
    gate: "click_target",
    page: PAGE.mission_run,
    spotlight: "mission-fight",
    placement: "top",
    cta: "Tap Fight Encounter",
    nav_label: "Mission",
  },
  {
    id: "mission_view_rewards",
    chapter: "Cantina",
    title: "Claim Your Spoils",
    body: "Victory! Tap View Rewards to see what your operative brought back.",
    gate: "click_target",
    page: "res://Scenes/UI/mission_combat.tscn",
    spotlight: "mission-view-rewards",
    placement: "top",
    cta: "Tap View Rewards",
    nav_label: "Mission",
  },
  {
    id: "click_hero",
    chapter: "Operative",
    title: "Operative Screen",
    body: "This screen is where you'll upgrade your operative. Any gear you find or purchase on your journey will show up here, where you can equip it.",
    gate: "click_target",
    page: null,
    spotlight: "nav-hero",
    placement: "right",
    cta: "Click Operative to continue",
    nav_label: "Operative",
  },
  {
    id: "hero_upgrade",
    chapter: "Operative",
    title: "Attributes",
    body:
      "Spend some of that stardust you earned to upgrade an attribute!",
    gate: "buy_attribute",
    page: PAGE.hero,
    spotlight: "hero-attrs",
    extra_spotlight: "hero-attr-buy",
    placement: "left",
    cta: "Upgrade now",
    nav_label: "Operative",
  },
  {
    id: "hero_equip",
    chapter: "Operative",
    title: "Gear Up",
    body:
      "Mission loot lands in your backpack. Equip the helmet you just earned — double-click it or drag it onto your loadout.",
    gate: "equip_item",
    page: PAGE.hero,
    spotlight: "hero-backpack",
    extra_spotlight: "hero-bag-helmet",
    placement: "left",
    cta: "Equip the helmet to continue",
    nav_label: "Operative",
  },
  {
    id: "click_shop",
    chapter: "Market",
    title: "Browse the Black Market",
    body:
      "Offload some loot and get a shiny new blaster. Everything you'll find here is registered and legal. Probably.",
    gate: "click_target",
    page: null,
    spotlight: "nav-shop",
    placement: "right",
    cta: "Click Black Market to continue",
    nav_label: "Black Market",
  },
  {
    id: "shop_market",
    chapter: "Market",
    title: "Black Market Basics",
    body:
      "The Black Market refreshes twice daily - or whenever you grease the gears with Nova Crystals. You also get 1 free refresh every 12 hours. Buy Gear and Stims, which are temporary attribute boosts you can stack for maximum space-drug efficiency. Sell loot down below.",
    gate: "ack",
    page: PAGE.shop,
    spotlight: "shop-buy",
    extra_spotlight: "shop-refresh-timer",
    placement: "bottom_right",
    cta: "Got it",
    nav_label: "Black Market",
  },
  {
    id: "click_arena",
    chapter: "Arena",
    title: "Fight for Glory",
    body: "Battle other players in the arena for bragging rights and some pocket change.",
    gate: "click_target",
    page: null,
    spotlight: "nav-arena",
    placement: "right",
    cta: "Click Arena to continue",
    nav_label: "Arena",
  },
  {
    id: "arena_free",
    chapter: "Arena",
    title: "Free Battles",
    body:
      "Pick your battles. You get rewards for the first 10 battles won per day, but you can keep fighting forever to climb the rankings and prove your worth!",
    gate: "ack",
    page: PAGE.arena,
    spotlight: "arena-free",
    extra_spotlight: "nav-ranks",
    placement: "top",
    cta: "Got it",
    nav_label: "Arena",
  },
  {
    id: "click_mine",
    chapter: "Mine",
    title: "Blast some asteroids",
    body: "Looking for some extra dust to line your pockets?",
    gate: "click_target",
    page: null,
    spotlight: "nav-mine",
    placement: "right",
    cta: "Click Mine to continue",
    nav_label: "Mine",
  },
  {
    id: "mine_explain",
    chapter: "Mine",
    title: "Work, work.",
    body:
      "Set your operative to mine asteroids for some stardust while you're away. You can't start missions while mining.",
    gate: "ack",
    page: PAGE.mine,
    spotlight: "mine-hero",
    placement: "center",
    cta: "Got it",
    nav_label: "Mine",
  },
  {
    id: "continue_travels",
    chapter: "Cantina",
    title: "Continue the adventure",
    body: "Looks like you know your way around the station. Get back out there and power up!",
    gate: "click_target",
    page: null,
    spotlight: "nav-cantina",
    placement: "right",
    cta: "Click Cantina to continue",
    nav_label: "Cantina",
  },
  {
    id: "finish",
    chapter: "Complete",
    title: "Training Complete",
    body: "You know enough to be dangerous. The rest of the galaxy is yours to figure out.",
    gate: "finish",
    page: null,
    spotlight: null,
    placement: "center",
    cta: "Shut up already!",
    nav_label: "",
  },
]);

export const ONBOARDING_STARTER_REWARD = Object.freeze({
  stardust: 0,
  nova_crystals: 0,
  fuel: 0,
});

const STEP_IDS = ONBOARDING_STEPS.map((s) => s.id);

/** Removed steps — forward saved progress to the next live step. */
const REMOVED_STEP_FORWARD = Object.freeze({
  click_vault: "click_cantina",
  vault_explain: "click_cantina",
  operative_identity: "click_hero",
  hero_gear: "hero_equip",
  hero_backpack: "hero_equip",
  hero_stims: "click_shop",
  shop_inspect: "shop_market",
  shop_sell: "shop_market",
  click_friends: "click_arena",
  click_mail: "click_arena",
  arena_fight: "click_mine",
  arena_result: "click_mine",
  click_ranks: "click_mine",
  frontier_dungeons: "mission_return",
  arena_rank: "click_mine",
  click_casino: "click_mine",
  casino_explain: "click_mine",
});

const ACTION_GATES = new Set([
  "click_target",
  "launch_mission",
  "arena_battle",
  "buy_attribute",
  "equip_item",
]);

export function defaultOnboardingState() {
  return {
    status: "pending",
    step_id: "click_operative",
    reward_claimed: false,
    completed_ids: [],
    started_at: null,
    completed_at: null,
    updated_at: null,
    first_mission_bonus_eligible: true,
    first_mission_bonus_mission_id: null,
    first_mission_bonus_spent: false,
  };
}

function remapStepId(rawId) {
  const id = String(rawId || "click_operative");
  if (REMOVED_STEP_FORWARD[id]) return REMOVED_STEP_FORWARD[id];
  if (STEP_IDS.includes(id)) return id;
  return "click_operative";
}

export function normalizeOnboarding(raw) {
  const base = defaultOnboardingState();
  if (!raw || typeof raw !== "object") return base;
  const status = ["pending", "active", "completed", "skipped"].includes(raw.status)
    ? raw.status
    : base.status;
  const completed_ids = Array.isArray(raw.completed_ids)
    ? raw.completed_ids.map(String).filter((id) => STEP_IDS.includes(id))
    : [];
  return {
    status,
    step_id: remapStepId(raw.step_id || base.step_id),
    reward_claimed: !!raw.reward_claimed,
    completed_ids,
    started_at: raw.started_at || null,
    completed_at: raw.completed_at || null,
    updated_at: raw.updated_at || null,
    first_mission_bonus_eligible: raw.first_mission_bonus_eligible === true,
    first_mission_bonus_mission_id: raw.first_mission_bonus_mission_id || null,
    first_mission_bonus_spent: !!raw.first_mission_bonus_spent,
  };
}

export function getOnboardingFromCharacter(character) {
  const completed = {
    ...defaultOnboardingState(),
    status: "completed",
    step_id: "finish",
    reward_claimed: true,
  };
  if (!character || character.onboarding_tutorial == null) {
    return completed;
  }
  const normalized = normalizeOnboarding(character.onboarding_tutorial);
  if (normalized.first_mission_bonus_eligible !== true) {
    return { ...normalized, ...completed, first_mission_bonus_eligible: false };
  }
  return normalized;
}

export function stepIndex(stepId) {
  const i = STEP_IDS.indexOf(remapStepId(stepId));
  return i < 0 ? 0 : i;
}

export function stepById(stepId) {
  return ONBOARDING_STEPS.find((s) => s.id === remapStepId(stepId)) || ONBOARDING_STEPS[0];
}

function chapterList() {
  const out = [];
  for (const s of ONBOARDING_STEPS) {
    if (s.chapter && !out.includes(s.chapter)) out.push(s.chapter);
  }
  return out;
}

export function publicTutorialPayload(state) {
  const s = normalizeOnboarding(state);
  const step = stepById(s.step_id);
  const idx = stepIndex(s.step_id);
  const chapters = chapterList();
  const chapter = step.chapter || "";
  const chapterIndex = Math.max(0, chapters.indexOf(chapter));
  return {
    status: s.status,
    step_id: s.step_id,
    reward_claimed: s.reward_claimed,
    completed_ids: s.completed_ids || [],
    step_index: idx + 1,
    step_total: ONBOARDING_STEPS.length,
    chapter,
    chapter_index: chapterIndex + 1,
    chapter_total: chapters.length,
    progress_label: chapter ? `${chapter} — ${step.title}` : step.title,
    step,
    steps: ONBOARDING_STEPS.map(({ id, title, gate, page, nav_label, chapter: ch }) => ({
      id,
      title,
      gate,
      page,
      nav_label,
      chapter: ch,
    })),
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

function withCompleted(s, leavingId) {
  const ids = Array.isArray(s.completed_ids) ? [...s.completed_ids] : [];
  if (leavingId && !ids.includes(leavingId)) ids.push(leavingId);
  return ids;
}

export function advanceTo(state, nextStepId, opts = {}) {
  const s = assertCanMutateTutorial(state);
  const target = remapStepId(nextStepId);
  if (!STEP_IDS.includes(target)) httpErr(400, "Unknown tutorial step");
  const cur = stepIndex(s.step_id);
  const next = stepIndex(target);
  if (next > cur + 1) httpErr(400, "Cannot skip ahead in tutorial");
  if (next > cur && !opts.fromGate) {
    const step = stepById(s.step_id);
    if (ACTION_GATES.has(String(step.gate || "")) && !step.optional) {
      httpErr(400, "Complete the highlighted action first", "TUTORIAL_ACTION_REQUIRED");
    }
  }
  const now = clock.nowIso();
  return {
    ...s,
    status: "active",
    step_id: target,
    completed_ids: next > cur ? withCompleted(s, s.step_id) : s.completed_ids,
    started_at: s.started_at || now,
    updated_at: now,
  };
}

export function assertCanAckAdvance(state) {
  const s = assertCanMutateTutorial(state);
  const step = stepById(s.step_id);
  const gate = String(step.gate || "ack");
  if (ACTION_GATES.has(gate) && !step.optional) {
    httpErr(400, "Complete the highlighted action first", "TUTORIAL_ACTION_REQUIRED");
  }
  return s;
}

export function assertGateAdvance(state, gate) {
  const s = assertCanMutateTutorial(state);
  const step = stepById(s.step_id);
  const expected = String(step.gate || "");
  if (expected !== String(gate || "")) {
    httpErr(400, "Wrong tutorial action", "TUTORIAL_GATE_MISMATCH");
  }
  return s;
}

export function advanceNext(state) {
  const s = assertCanAckAdvance(state);
  const cur = stepIndex(s.step_id);
  if (cur >= ONBOARDING_STEPS.length - 1) {
    return {
      ...s,
      status: "active",
      step_id: "finish",
      completed_ids: withCompleted(s, s.step_id),
      updated_at: clock.nowIso(),
    };
  }
  return advanceTo(s, ONBOARDING_STEPS[cur + 1].id);
}

export function advanceGate(state, gate) {
  assertGateAdvance(state, gate);
  const s = normalizeOnboarding(state);
  const cur = stepIndex(s.step_id);
  if (cur >= ONBOARDING_STEPS.length - 1) {
    return {
      ...s,
      status: "active",
      step_id: "finish",
      completed_ids: withCompleted(s, s.step_id),
      updated_at: clock.nowIso(),
    };
  }
  return advanceTo(s, ONBOARDING_STEPS[cur + 1].id, { fromGate: true });
}

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
