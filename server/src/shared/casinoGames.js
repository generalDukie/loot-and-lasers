/**
 * Finalized Casino resolvers (Galactic Dice, Stardust Wheel, Crystal Refining, Smuggler's Cache).
 * Gross payout = FLOOR(wager × multiplier). Node-authoritative only.
 */
import { secureRandom, secureRandomInt } from "../rewards/rng.js";

export const CASINO_RULES_VERSION = "casino_v2";

export const GAME_IDS = Object.freeze({
  GALACTIC_DICE: "galactic_dice",
  STARDUST_WHEEL: "stardust_wheel",
  CRYSTAL_REFINING: "crystal_refining",
  SMUGGLERS_CACHE: "smugglers_cache",
});

/** Legacy IDs that must not settle under old rules. */
export const RETIRED_GAME_IDS = Object.freeze([
  "dice",
  "stardust_dice",
  "wheel",
  "flip",
  "crystal_flip",
  "jackpot",
  "crystal_jackpot",
]);

export const NOVA_MIN_WAGER = 100;
export const NOVA_MAX_WAGER = 1000;

export const WHEEL_TIERS = Object.freeze([
  { id: "lose", label: "Lose", p: 0.6, mult: 0 },
  { id: "shove", label: "Shove", p: 0.2, mult: 1 },
  { id: "x2", label: "2×", p: 0.1, mult: 2 },
  { id: "x3", label: "3×", p: 0.05, mult: 3 },
  { id: "x5", label: "5×", p: 0.03, mult: 5 },
  { id: "x10", label: "10×", p: 0.02, mult: 10 },
]);

/** Per-attempt success chances (server-only). */
export const REFINING_ATTEMPT_P = Object.freeze([0.4, 0.4, 0.40625, 0.3846153846, 0.4]);

/** Cumulative reach % + total payout multipliers shown to players. */
export const REFINING_LADDER = Object.freeze([
  { stage: 1, cumulative_pct: 40, mult: 1.25 },
  { stage: 2, cumulative_pct: 16, mult: 3 },
  { stage: 3, cumulative_pct: 6.5, mult: 8 },
  { stage: 4, cumulative_pct: 2.5, mult: 20 },
  { stage: 5, cumulative_pct: 1, mult: 50 },
]);

export const CACHE_CARGO = Object.freeze({
  WORTHLESS_SCRAP: { id: "worthless_scrap", label: "Worthless Scrap", mult: 0, count: 4 },
  DAMAGED_SHIPMENT: { id: "damaged_shipment", label: "Damaged Shipment", mult: 0.5, count: 1 },
  ALLURING_CONTRABAND: { id: "alluring_contraband", label: "Alluring Contraband", mult: 2.5, count: 1 },
});

/** Integer (Stardust) gross payout = FLOOR(wager × mult). */
export function floorPayout(wager, mult) {
  const w = Math.max(0, Math.floor(Number(wager) || 0));
  const m = Number(mult) || 0;
  if (w <= 0 || m <= 0) return 0;
  return Math.floor(w * m);
}

/** Nova gross payout = FLOOR_TO_0.5(wager × mult). */
export function floorNovaCasinoPayout(wager, mult) {
  const w = Number(wager);
  const m = Number(mult) || 0;
  if (!Number.isFinite(w) || w <= 0 || m <= 0) return 0;
  return Math.floor(w * m * 2) / 2;
}

export function netFromGross(wager, grossPayout) {
  return Math.floor(Number(grossPayout) || 0) - Math.floor(Number(wager) || 0);
}

export function validateWholeWager(bet) {
  const n = Number(bet);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return { ok: false, reason: "Wager must be a positive whole-number integer" };
  }
  return { ok: true, bet: n };
}

/** Stardust stays integer; Nova allows .0 / .5 display amounts. */
export function validateNovaPrecisionWager(bet) {
  const n = Number(bet);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, reason: "Wager must be a positive amount" };
  }
  const half = Math.round(n * 2);
  if (Math.abs(n * 2 - half) > 1e-9) {
    return { ok: false, reason: "Nova wagers must end in .0 or .5" };
  }
  return { ok: true, bet: half / 2 };
}

export function stardustWagerLimits(stardustPerFuel) {
  const sdf = Math.max(1, Math.round(Number(stardustPerFuel) || 1));
  return { min: sdf, max: sdf * 50, sdf };
}

export function validateStardustWager(bet, levelSdf, balance) {
  const check = validateWholeWager(bet);
  if (!check.ok) return check;
  const { min, max } = stardustWagerLimits(levelSdf);
  if (check.bet < min) return { ok: false, reason: `Minimum wager is ${min} Stardust` };
  if (check.bet > max) return { ok: false, reason: `Maximum wager is ${max} Stardust` };
  if (check.bet > Math.floor(Number(balance) || 0)) {
    return { ok: false, reason: "Not enough stardust" };
  }
  return { ok: true, bet: check.bet, min, max };
}

/**
 * Validate Nova casino wager against available balance.
 * Default: callers pass wagerable (purchased) Nova only.
 * Admins may pass total Nova with `{ allowAnyNova: true }`.
 * @param {number} bet
 * @param {number} availableBalanceDisplay — Wagerable Nova, or total when allowAnyNova
 * @param {{ allowAnyNova?: boolean }} [opts]
 */
export function validateNovaWager(bet, availableBalanceDisplay, opts = {}) {
  const check = validateNovaPrecisionWager(bet);
  if (!check.ok) return check;
  if (check.bet < NOVA_MIN_WAGER) {
    return { ok: false, reason: `Minimum wager is ${NOVA_MIN_WAGER} Nova Crystals` };
  }
  if (check.bet > NOVA_MAX_WAGER) {
    return { ok: false, reason: `Maximum wager is ${NOVA_MAX_WAGER} Nova Crystals` };
  }
  const available = Number(availableBalanceDisplay) || 0;
  if (check.bet > available + 1e-9) {
    if (opts.allowAnyNova) {
      return {
        ok: false,
        reason: "Not enough Nova Crystals",
        code: "INSUFFICIENT_NOVA",
      };
    }
    return {
      ok: false,
      reason: "Not enough Wagerable Nova. Purchased Nova is required for Casino wagers.",
      code: "INSUFFICIENT_WAGERABLE_NOVA",
    };
  }
  return { ok: true, bet: check.bet, min: NOVA_MIN_WAGER, max: NOVA_MAX_WAGER };
}

export function resolveGalacticDice({ bet, choice, randomInt = secureRandomInt } = {}) {
  const c = String(choice || "").toLowerCase();
  if (!["low", "seven", "high"].includes(c)) {
    const e = new Error("Select Low, Seven, or High");
    e.status = 400;
    e.code = "INVALID_CASINO_CHOICE";
    throw e;
  }
  const d1 = randomInt(1, 6);
  const d2 = randomInt(1, 6);
  const total = d1 + d2;
  const doubles = d1 === d2;
  const naturalSeven = total === 7;
  let won = false;
  let mult = 0;
  if (c === "low" && total >= 2 && total <= 6) {
    won = true;
    mult = 2;
  } else if (c === "seven" && total === 7) {
    won = true;
    mult = 5;
  } else if (c === "high" && total >= 8 && total <= 12) {
    won = true;
    mult = 2;
  }
  const gross = floorPayout(bet, mult);
  return {
    game: GAME_IDS.GALACTIC_DICE,
    currency: "stardust",
    choice: c,
    dice: [d1, d2],
    total,
    doubles,
    natural_seven: naturalSeven,
    won,
    payout_mult: mult,
    wager: bet,
    gross_payout: gross,
    net_result: netFromGross(bet, gross),
    outcome: won ? (c === "seven" ? "seven_win" : `${c}_win`) : "lose",
    rules_version: CASINO_RULES_VERSION,
  };
}

export function rollWheelTier(rng = secureRandom) {
  let r = rng();
  for (const tier of WHEEL_TIERS) {
    r -= tier.p;
    if (r <= 1e-12) return { ...tier };
  }
  return { ...WHEEL_TIERS[WHEEL_TIERS.length - 1] };
}

/** Cumulative segment ends in [0,1) for visual mapping. */
export function wheelSegmentLayout() {
  let acc = 0;
  return WHEEL_TIERS.map((t) => {
    const start = acc;
    acc += t.p;
    return {
      id: t.id,
      label: t.label,
      mult: t.mult,
      p: t.p,
      start,
      end: acc,
      mid: (start + acc) / 2,
    };
  });
}

export function resolveStardustWheel({ bet, rng = secureRandom } = {}) {
  const tier = rollWheelTier(rng);
  const layout = wheelSegmentLayout();
  const seg = layout.find((s) => s.id === tier.id) || layout[0];
  const gross = floorPayout(bet, tier.mult);
  const shove = tier.id === "shove";
  const won = tier.mult > 1;
  const lose = tier.mult === 0;
  return {
    game: GAME_IDS.STARDUST_WHEEL,
    currency: "stardust",
    tier_id: tier.id,
    label: tier.label,
    payout_mult: tier.mult,
    segment: { id: seg.id, start: seg.start, end: seg.end, mid: seg.mid, p: seg.p },
    wager: bet,
    gross_payout: gross,
    net_result: netFromGross(bet, gross),
    won,
    shove,
    lose,
    outcome: tier.id,
    rules_version: CASINO_RULES_VERSION,
  };
}

export function refiningMultForStage(stage) {
  const row = REFINING_LADDER.find((r) => r.stage === stage);
  return row ? row.mult : 0;
}

export function rollRefiningAttempt(stageIndex0, rng = secureRandom) {
  const p = REFINING_ATTEMPT_P[stageIndex0];
  if (p == null) {
    const e = new Error("Invalid refinement stage");
    e.status = 400;
    throw e;
  }
  return rng() < p;
}

export function buildSmugglersBoard(rng = secureRandom) {
  const board = [];
  for (let i = 0; i < CACHE_CARGO.WORTHLESS_SCRAP.count; i++) {
    board.push({ ...CACHE_CARGO.WORTHLESS_SCRAP });
  }
  board.push({ ...CACHE_CARGO.DAMAGED_SHIPMENT });
  board.push({ ...CACHE_CARGO.ALLURING_CONTRABAND });
  // Fisher–Yates with secure RNG
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = board[i];
    board[i] = board[j];
    board[j] = tmp;
  }
  return board.map((cargo, index) => ({
    index,
    cargo_id: cargo.id,
    label: cargo.label,
    mult: cargo.mult,
  }));
}

export function resolveSmugglersSelection({ bet, board, index } = {}) {
  const i = Math.floor(Number(index));
  if (!Number.isInteger(i) || i < 0 || i > 5) {
    const e = new Error("Select a crate (0–5)");
    e.status = 400;
    e.code = "INVALID_CRATE_SELECTION";
    throw e;
  }
  const cell = board[i];
  if (!cell) {
    const e = new Error("Invalid board");
    e.status = 500;
    throw e;
  }
  const gross = floorNovaCasinoPayout(bet, cell.mult);
  return {
    game: GAME_IDS.SMUGGLERS_CACHE,
    currency: "nova",
    selected_index: i,
    cargo_id: cell.cargo_id,
    label: cell.label,
    payout_mult: cell.mult,
    wager: bet,
    gross_payout: gross,
    net_result: Math.round((gross - bet) * 2) / 2,
    board,
    won: cell.mult > 1,
    shove: cell.mult === 1,
    lose: cell.mult === 0,
    outcome: cell.cargo_id,
    rules_version: CASINO_RULES_VERSION,
  };
}
