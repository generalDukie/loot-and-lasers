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

/** Follows side-nav: Operative → Hero → Cantina → Frontier → Social → Arena → Market → Casino → Mine. */
export const ONBOARDING_STEPS = Object.freeze([
  {
    id: "click_operative",
    chapter: "Operative",
    title: "Here's Your Operative",
    body: "The Operative Panel shows your unreasonably magnificent character, your level, class, and wallet. In Loot&Lasers you'll use Fuel, and find Stardust and Nova Crystals. Click your Operative to continue.",
    gate: "click_target",
    page: null,
    spotlight: "shell-operative",
    placement: "right",
    cta: "Click your Operative to continue",
    nav_label: "Operative Panel",
  },
  {
    id: "click_hero",
    chapter: "Hero",
    title: "Operative Screen",
    body: "This screen is where you'll upgrade your character. Any gear you find or purchase on your journey will show up here, where you can equip it.",
    gate: "click_target",
    page: null,
    spotlight: "nav-hero",
    placement: "right",
    cta: "Click Hero to continue",
    nav_label: "Hero",
  },
  {
    id: "hero_upgrade",
    chapter: "Hero",
    title: "Attributes",
    body: "Strength hits harder. Agility strikes first. Intellect powers tech. Vitality keeps you standing. Luck finds more loot. You can spend Stardust here later — each buy costs more than the last.",
    gate: "ack",
    page: PAGE.hero,
    spotlight: "hero-attrs",
    extra_spotlight: "hero-attr-buy",
    placement: "left",
    cta: "Got it",
    nav_label: "Hero",
  },
  {
    id: "hero_stims",
    chapter: "Hero",
    title: "Stims",
    body: "Stims temporarily boost one attribute, then wear off. Don't burn a rare one unless you mean it.",
    gate: "ack",
    page: PAGE.hero,
    spotlight: "hero-stims",
    placement: "right",
    cta: "Got it",
    nav_label: "Hero",
  },
  {
    id: "click_cantina",
    chapter: "Cantina",
    title: "Open Cantina",
    body: "Contracts live in the Cantina. Click Cantina.",
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
    title: "Three Missions",
    body:
      "Missions are the lifeblood of Loot & Lasers. Each day your fuel reserves are refilled, and you can venture out into the cosmos. Some missions are long, some are short, and some give better rewards than others. Every mission will at least provide XP and Stardust - the primary currency in this world",
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
      "You aren't bound by your current adventure, feel free to click around and complete other tasks while waiting for a mission. Keep an eye on the button up here to quickly return and claim your rewards when your character has returned. You'll usually need to fight for them!",
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
    title: "Open Galactic Frontier",
    body: "PvE progression — not Arena. Click Galactic Frontier.",
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
    title: "Dungeons",
    body: "Galactic Frontier is dungeon PvE — planets, encounters, and bosses. The first world unlocks at level 10. You can't run one yet. Come back when you're stronger.",
    gate: "ack",
    page: PAGE.frontier,
    spotlight: "galaxy-map",
    extra_spotlight: "galaxy-encounters",
    placement: "right",
    cta: "Got it",
    nav_label: "Galactic Frontier",
  },
  {
    id: "frontier_dungeons",
    chapter: "Frontier",
    title: "Later Worlds",
    body: "Deeper planets unlock as you level. This is PvE progression. Arena is ranked PvP — a different loop.",
    gate: "ack",
    page: PAGE.frontier,
    spotlight: "galaxy-map",
    placement: "right",
    cta: "Got it",
    nav_label: "Galactic Frontier",
  },
  {
    id: "click_friends",
    chapter: "Social",
    title: "Friends",
    body: "Friends is your roster of other operatives. Click Friends.",
    gate: "click_target",
    page: null,
    spotlight: "nav-friends",
    placement: "right",
    cta: "Click Friends to continue",
    nav_label: "Friends",
  },
  {
    id: "click_mail",
    chapter: "Social",
    title: "Mail",
    body: "Mail is how rewards and messages reach you. Click Mail.",
    gate: "click_target",
    page: null,
    spotlight: "nav-mail",
    placement: "right",
    cta: "Click Mail to continue",
    nav_label: "Mail",
  },
  {
    id: "click_arena",
    chapter: "Arena",
    title: "Open Arena",
    body: "Arena is PvP. Click Arena.",
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
    body: "Three contenders. Matchmaking uses Arena rank. Free Battles are your daily attempts — spend them.",
    gate: "ack",
    page: PAGE.arena,
    spotlight: "arena-free",
    placement: "top",
    cta: "Got it",
    nav_label: "Arena",
  },
  {
    id: "arena_fight",
    chapter: "Arena",
    title: "Pick a Contender",
    body: "Select a contender and start the fight. Skip Battle still counts. Win or lose moves your rating.",
    gate: "arena_battle",
    page: PAGE.arena,
    spotlight: "arena-fight",
    extra_spotlight: "arena-outro",
    placement: "bottom",
    cta: "Start a battle to continue",
    nav_label: "Arena",
    optional: true,
  },
  {
    id: "arena_result",
    chapter: "Arena",
    title: "Battle Complete",
    body: "Win or lose, your rating moves. Close the report when you're ready — next stop is Ranks.",
    gate: "ack",
    page: PAGE.arena,
    spotlight: "arena-result",
    extra_spotlight: "arena-outro",
    placement: "left",
    cta: "Got it",
    nav_label: "Arena",
  },
  {
    id: "click_ranks",
    chapter: "Arena",
    title: "Open Ranks",
    body: "The ladder lives on Ranks. Click Ranks.",
    gate: "click_target",
    page: null,
    spotlight: "nav-ranks",
    placement: "right",
    cta: "Click Ranks to continue",
    nav_label: "Ranks",
  },
  {
    id: "arena_rank",
    chapter: "Arena",
    title: "Ranking",
    body: "This board is ranked by Arena rating. Your row climbs or drops with every fight.",
    gate: "ack",
    page: PAGE.ranks,
    spotlight: "ranks-you",
    extra_spotlight: "ranks-board",
    placement: "left",
    cta: "Got it",
    nav_label: "Ranks",
  },
  {
    id: "click_shop",
    chapter: "Market",
    title: "Open Black Market",
    body: "Buy and sell gear here. Click Black Market.",
    gate: "click_target",
    page: null,
    spotlight: "nav-shop",
    placement: "right",
    cta: "Click Black Market to continue",
    nav_label: "Black Market",
  },
  {
    id: "shop_inspect",
    chapter: "Market",
    title: "Buying",
    body: "Browse stalls and inspect price and stats before you buy. Don't spend your last Stardust unless you mean it.",
    gate: "ack",
    page: PAGE.shop,
    spotlight: "shop-buy",
    extra_spotlight: "shop-item",
    placement: "top",
    cta: "Got it",
    nav_label: "Black Market",
  },
  {
    id: "shop_sell",
    chapter: "Market",
    title: "Selling",
    body: "Click bag items into the Sell Tray (up to 5), check the value, then SELL ITEMS. Don't sell anything you still want.",
    gate: "ack",
    page: PAGE.shop,
    spotlight: "shop-sell-tray",
    extra_spotlight: "shop-sell-item",
    placement: "bottom",
    cta: "Got it",
    nav_label: "Black Market",
  },
  {
    id: "click_casino",
    chapter: "Casino",
    title: "Open Casino",
    body: "Wagers live here. Click Casino.",
    gate: "click_target",
    page: null,
    spotlight: "nav-casino",
    placement: "right",
    cta: "Click Casino to continue",
    nav_label: "Casino",
  },
  {
    id: "casino_explain",
    chapter: "Casino",
    title: "Nebula Casino",
    body: "Dice, the Wheel, Crystal Refining, and Smuggler's Cache. Bet Stardust or Nova. House games — don't wager what you can't lose.",
    gate: "ack",
    page: PAGE.casino,
    spotlight: "casino-games",
    placement: "bottom",
    cta: "Got it",
    nav_label: "Casino",
  },
  {
    id: "click_mine",
    chapter: "Mine",
    title: "Open Mine",
    body: "Idle Stardust lives here. Click Mine.",
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
    title: "Space Mining",
    body: "Deploy your ship for a set duration. Stardust accrues while you're elsewhere. You can't run Cantina missions while a mine is active.",
    gate: "ack",
    page: PAGE.mine,
    spotlight: "mine-hero",
    placement: "right",
    cta: "Got it",
    nav_label: "Mine",
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
    cta: "Claim & play",
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
  hero_gear: "hero_stims",
  hero_backpack: "hero_stims",
  hero_equip: "hero_stims",
});

const ACTION_GATES = new Set([
  "click_target",
  "launch_mission",
  "arena_battle",
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
