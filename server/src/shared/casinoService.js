/**
 * Casino registry + client-safe helpers (casino_v2 — four finalized games).
 */
import { getMissionStardustPerFuel } from "./economyFormulas.js";
import { getBalances } from "./currencyService.js";
import { listActiveCasinoSessions } from "./casinoSessions.js";
import {
  CASINO_RULES_VERSION,
  GAME_IDS,
  RETIRED_GAME_IDS,
  NOVA_MIN_WAGER,
  NOVA_MAX_WAGER,
  WHEEL_TIERS,
  REFINING_LADDER,
  CACHE_CARGO,
  stardustWagerLimits,
  wheelSegmentLayout,
} from "./casinoGames.js";

export {
  CASINO_RULES_VERSION,
  GAME_IDS,
  RETIRED_GAME_IDS,
  NOVA_MIN_WAGER,
  NOVA_MAX_WAGER,
  WHEEL_TIERS,
  REFINING_LADDER,
  floorPayout,
  floorNovaCasinoPayout,
  netFromGross,
  validateWholeWager,
  validateStardustWager,
  validateNovaWager,
  resolveGalacticDice,
  resolveStardustWheel,
  rollRefiningAttempt,
  refiningMultForStage,
  buildSmugglersBoard,
  resolveSmugglersSelection,
  wheelSegmentLayout,
  stardustWagerLimits,
} from "./casinoGames.js";

const CLIENT_FORBIDDEN = [
  "outcome",
  "payout",
  "payout_mult",
  "delta_stardust",
  "delta_crystals",
  "wager",
  "currency",
  "seed",
  "rng_seed",
  "won",
  "mult",
  "dice",
  "board",
  "cargo",
  "gross_payout",
];

export function assertCasinoClientSafe(body = {}) {
  if (!body || typeof body !== "object") return;
  for (const k of ["seed", "rng_seed", "production_rng_seed"]) {
    if (body[k] != null) {
      const e = new Error(`Client may not supply ${k}`);
      e.status = 400;
      e.code = "CASINO_CLIENT_AUTHORITY_REJECTED";
      throw e;
    }
  }
  if (body.currency != null || body.wager != null || body.payout_mult != null) {
    const e = new Error("Client payout multipliers are not accepted");
    e.status = 400;
    e.code = "SUSPICIOUS_CLIENT_PAYLOAD";
    throw e;
  }
  for (const k of CLIENT_FORBIDDEN) {
    if (k === "currency" || k === "wager" || k === "payout_mult") continue;
    if (Object.prototype.hasOwnProperty.call(body, k)) delete body[k];
  }
}

export function normalizeCasinoGameId(raw) {
  const id = String(raw || "").trim().toLowerCase();
  if (RETIRED_GAME_IDS.includes(id)) {
    const e = new Error("That casino game has been retired");
    e.status = 410;
    e.code = "CASINO_GAME_RETIRED";
    throw e;
  }
  const aliases = {
    galactic_dice: GAME_IDS.GALACTIC_DICE,
    stardust_wheel: GAME_IDS.STARDUST_WHEEL,
    crystal_refining: GAME_IDS.CRYSTAL_REFINING,
    smugglers_cache: GAME_IDS.SMUGGLERS_CACHE,
    "smuggler's_cache": GAME_IDS.SMUGGLERS_CACHE,
    smugglerscache: GAME_IDS.SMUGGLERS_CACHE,
  };
  const canon = aliases[id] || id;
  if (!Object.values(GAME_IDS).includes(canon)) {
    const e = new Error("Unknown casino game");
    e.status = 400;
    e.code = "INVALID_CASINO_GAME";
    throw e;
  }
  return canon;
}

export function getCasinoGameDefinition(gameId, { level = 1 } = {}) {
  return listCasinoGames({ level }).find((g) => g.id === gameId) || null;
}

export function listCasinoGames({ level = 1 } = {}) {
  const sdf = getMissionStardustPerFuel(level);
  const { min: minSd, max: maxSd } = stardustWagerLimits(sdf);
  return [
    {
      id: GAME_IDS.GALACTIC_DICE,
      name: "Galactic Dice",
      enabled: true,
      currency: "stardust",
      min_wager: minSd,
      max_wager: maxSd,
      rules_version: CASINO_RULES_VERSION,
      presentation: "galactic_dice",
      description: "Two dice. Bet Low (2–6), Seven, or High (8–12).",
      choices: [
        { id: "low", label: "Low — 2×", mult: 2 },
        { id: "seven", label: "Seven — 5×", mult: 5 },
        { id: "high", label: "High — 2×", mult: 2 },
      ],
    },
    {
      id: GAME_IDS.STARDUST_WHEEL,
      name: "Stardust Wheel",
      enabled: true,
      currency: "stardust",
      min_wager: minSd,
      max_wager: maxSd,
      rules_version: CASINO_RULES_VERSION,
      presentation: "stardust_wheel",
      description: "Spin the weighted wheel. Shove returns your wager.",
      tiers: WHEEL_TIERS.map((t) => ({ id: t.id, label: t.label, mult: t.mult, p: t.p })),
      segments: wheelSegmentLayout(),
    },
    {
      id: GAME_IDS.CRYSTAL_REFINING,
      name: "Crystal Refining",
      enabled: true,
      currency: "nova",
      min_wager: NOVA_MIN_WAGER,
      max_wager: NOVA_MAX_WAGER,
      rules_version: CASINO_RULES_VERSION,
      presentation: "crystal_refining",
      description: "Push your luck refining an unstable crystal — up to five stages.",
      ladder: REFINING_LADDER.map((r) => ({ ...r })),
      session: true,
    },
    {
      id: GAME_IDS.SMUGGLERS_CACHE,
      name: "Smuggler's Cache",
      enabled: true,
      currency: "nova",
      min_wager: NOVA_MIN_WAGER,
      max_wager: NOVA_MAX_WAGER,
      rules_version: CASINO_RULES_VERSION,
      presentation: "smugglers_cache",
      description: "Pick one of six sealed crates. Board composition is fixed.",
      composition: [
        { ...CACHE_CARGO.WORTHLESS_SCRAP, chance: "4/6" },
        { ...CACHE_CARGO.DAMAGED_SHIPMENT, chance: "1/6" },
        { ...CACHE_CARGO.ALLURING_CONTRABAND, chance: "1/6" },
      ],
      session: true,
    },
  ];
}

export function serializeCasinoState(character, user = null) {
  const level = character?.level || 1;
  const games = listCasinoGames({ level });
  const balances = getBalances(character);
  const sdf = getMissionStardustPerFuel(level);
  const sdLimits = stardustWagerLimits(sdf);
  const active = user
    ? listActiveCasinoSessions(user.id, character.id).map((s) => ({
        session_id: s.session_id,
        game_id: s.game_id,
        status: s.status,
        wager: s.wager,
        currency: s.currency,
        state: publicSessionState(s),
      }))
    : [];
  return {
    rules_version: CASINO_RULES_VERSION,
    games,
    enabled_games: games.filter((g) => g.enabled).map((g) => g.id),
    retired_games: [...RETIRED_GAME_IDS],
    stardust_limits: {
      min: sdLimits.min,
      max: sdLimits.max,
      stardust_per_fuel: sdLimits.sdf,
      balance: balances.stardust,
    },
    nova_limits: {
      min: NOVA_MIN_WAGER,
      max: NOVA_MAX_WAGER,
      balance: balances.nova_crystals,
      wagerable: balances.nova_wagerable,
      promotional: balances.nova_promotional,
      /** Casino may only use this balance. */
      wagerable_balance: balances.nova_wagerable,
    },
    nova_casino_open: true,
    active_sessions: active,
    daily_limits: null,
  };
}

/** Strip hidden RNG internals from refining / cache session state for clients. */
export function publicSessionState(session) {
  if (!session) return null;
  const st = session.state || {};
  if (session.game_id === GAME_IDS.CRYSTAL_REFINING) {
    return {
      stage: st.stage || 0,
      status: session.status,
      collectible_mult: st.collectible_mult || 0,
      can_collect: !!st.can_collect,
      can_refine: !!st.can_refine,
      shattered: !!st.shattered,
      completed: !!st.completed,
      last_event: st.last_event || null,
      wager: session.wager,
      gross_payout: st.gross_payout ?? null,
      net_result: st.net_result ?? null,
    };
  }
  if (session.game_id === GAME_IDS.SMUGGLERS_CACHE) {
    const sealed = session.status === "active" && st.selected_index == null;
    return {
      status: session.status,
      wager: session.wager,
      crate_count: 6,
      selected_index: st.selected_index ?? null,
      board: sealed ? null : st.board || null,
      sealed,
      gross_payout: st.gross_payout ?? null,
      net_result: st.net_result ?? null,
      outcome: st.outcome || null,
      label: st.label || null,
    };
  }
  return { status: session.status, wager: session.wager };
}

/** @deprecated — use validateStardustWager / validateNovaWager */
export function validateCasinoBetAmount(bet) {
  const n = Number(bet);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return { ok: false, reason: "Wager must be a positive whole-number integer" };
  }
  return { ok: true, bet: n };
}
