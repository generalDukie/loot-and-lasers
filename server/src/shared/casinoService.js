/**
 * Casino registry, validation, and outcome resolvers (Restoration 18).
 * Odds / limits recovered from economyFormulas — do not invent new games.
 */
import {
  NOVA_CASINO_OPEN,
  CASINO_MAX_NOVA_BET,
  CASINO_WHEEL_TIERS,
  getCasinoMaxStardustBet,
  CASINO_MIN_STARDUST_BET_FLOOR,
  CASINO_MAX_STARDUST_BET_CAP,
  CASINO_STARDUST_BET_SD_MULT,
} from "./economyFormulas.js";
import { secureRandom, secureRandomInt } from "../rewards/rng.js";

/** Snapshot for historical settlement stability. */
export const CASINO_RULES_VERSION = "casino_v1";

const CLIENT_STRIP = [
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
  // payout_mult / currency / wager on body are rejected as suspicious (legacy).
  if (body.currency != null || body.wager != null || body.payout_mult != null) {
    const e = new Error("Client payout multipliers are not accepted");
    e.status = 400;
    e.code = "SUSPICIOUS_CLIENT_PAYLOAD";
    throw e;
  }
  for (const k of CLIENT_STRIP) {
    if (k === "currency" || k === "wager" || k === "payout_mult") continue;
    if (Object.prototype.hasOwnProperty.call(body, k)) delete body[k];
  }
}

/** Public game registry — only games with complete resolvers. */
export function listCasinoGames({ level = 1 } = {}) {
  const maxSd = getCasinoMaxStardustBet(level);
  return [
    {
      id: "dice",
      aliases: ["stardust_dice"],
      name: "Stardust Dice",
      enabled: true,
      currency: "stardust",
      min_wager: 1,
      max_wager: maxSd,
      rules_version: CASINO_RULES_VERSION,
      presentation: "dice",
      description: "Guess high (4–6) or low (1–3). Even money.",
    },
    {
      id: "wheel",
      aliases: ["stardust_wheel"],
      name: "Stardust Wheel",
      enabled: true,
      currency: "stardust",
      min_wager: 1,
      max_wager: maxSd,
      rules_version: CASINO_RULES_VERSION,
      presentation: "wheel",
      description: "Weighted multiplier wheel.",
      tiers: CASINO_WHEEL_TIERS.map((t) => ({
        mult: t.mult,
        label: t.label,
        // Probability exposed for UI only; settlement uses server roll.
        p: t.p,
      })),
    },
    {
      id: "flip",
      aliases: ["crystal_flip"],
      name: "Crystal Flip",
      enabled: NOVA_CASINO_OPEN,
      currency: "nova",
      min_wager: 1,
      max_wager: CASINO_MAX_NOVA_BET,
      rules_version: CASINO_RULES_VERSION,
      presentation: "flip",
      sealed: !NOVA_CASINO_OPEN,
      description: "25% chance to double Nova.",
    },
    {
      id: "jackpot",
      aliases: ["crystal_jackpot"],
      name: "Crystal Jackpot",
      enabled: NOVA_CASINO_OPEN,
      currency: "nova",
      min_wager: 1,
      max_wager: CASINO_MAX_NOVA_BET,
      rules_version: CASINO_RULES_VERSION,
      presentation: "jackpot",
      sealed: !NOVA_CASINO_OPEN,
      description: "1% chance at 25× Nova.",
    },
  ];
}

export function normalizeCasinoGameId(raw) {
  const g = String(raw || "").toLowerCase().trim();
  if (g === "stardust_dice") return "dice";
  if (g === "stardust_wheel") return "wheel";
  if (g === "crystal_flip") return "flip";
  if (g === "crystal_jackpot") return "jackpot";
  return g;
}

export function getCasinoGameDefinition(gameId, level = 1) {
  const id = normalizeCasinoGameId(gameId);
  return listCasinoGames({ level }).find((g) => g.id === id || (g.aliases || []).includes(gameId)) || null;
}

export function serializeCasinoState(character) {
  const level = character?.level || 1;
  const games = listCasinoGames({ level });
  return {
    rules_version: CASINO_RULES_VERSION,
    nova_casino_open: NOVA_CASINO_OPEN,
    max_nova_bet: CASINO_MAX_NOVA_BET,
    max_stardust_bet: getCasinoMaxStardustBet(level),
    min_stardust_bet_floor: CASINO_MIN_STARDUST_BET_FLOOR,
    max_stardust_bet_cap: CASINO_MAX_STARDUST_BET_CAP,
    stardust_bet_sd_mult: CASINO_STARDUST_BET_SD_MULT,
    /** No finalized daily Casino wager/play caps recovered — report in PHASE_CASINO. */
    daily_limits: null,
    games,
    enabled_games: games.filter((g) => g.enabled).map((g) => g.id),
  };
}

export function validateCasinoBetAmount(bet) {
  if (bet === null || bet === undefined || bet === "") {
    return { ok: false, reason: "Invalid bet" };
  }
  if (typeof bet === "number" && !Number.isFinite(bet)) {
    return { ok: false, reason: "Invalid bet" };
  }
  const asNum = Number(bet);
  if (!Number.isFinite(asNum) || !Number.isInteger(asNum) || asNum < 1) {
    return { ok: false, reason: Number.isInteger(asNum) && asNum < 1 ? "Invalid bet" : "Wager must be a whole positive number" };
  }
  return { ok: true, bet: asNum };
}

/**
 * Roll wheel tiers with injectable RNG (production: secureRandom).
 */
export function rollWheelTier(rng = secureRandom) {
  const r = typeof rng === "function" ? rng() : secureRandom();
  let acc = 0;
  for (const t of CASINO_WHEEL_TIERS) {
    acc += t.p;
    if (r <= acc) return t;
  }
  return CASINO_WHEEL_TIERS[0];
}

/**
 * Resolve one Casino outcome. Does not mutate balances.
 * @returns {{ currency, delta, gross_wager, gross_payout, net_result, outcome }}
 */
export function resolveCasinoOutcome({
  gameId,
  bet,
  choice = null,
  level = 1,
  rng = secureRandom,
  randomInt = secureRandomInt,
} = {}) {
  const id = normalizeCasinoGameId(gameId);
  const def = getCasinoGameDefinition(id, level);
  if (!def) {
    const e = new Error("Unknown casino game");
    e.status = 400;
    e.code = "CASINO_UNKNOWN_GAME";
    throw e;
  }
  if (!def.enabled) {
    const e = new Error(def.sealed ? "Crystal tables sealed" : "Casino game unavailable");
    e.status = 400;
    e.code = "CASINO_GAME_DISABLED";
    throw e;
  }

  if (def.currency === "stardust") {
    if (bet > def.max_wager) {
      const e = new Error(`Bet too high (max ${def.max_wager})`);
      e.status = 400;
      e.code = "CASINO_BET_TOO_HIGH";
      throw e;
    }
  } else if (def.currency === "nova") {
    if (bet > CASINO_MAX_NOVA_BET) {
      const e = new Error("Bet too high");
      e.status = 400;
      e.code = "CASINO_BET_TOO_HIGH";
      throw e;
    }
  }

  if (id === "dice") {
    const c = String(choice || "").toLowerCase();
    if (c !== "high" && c !== "low") {
      const e = new Error("Choose high or low");
      e.status = 400;
      e.code = "CASINO_CHOICE_REQUIRED";
      throw e;
    }
    const dice = randomInt(1, 6);
    const high = dice >= 4;
    const won = (c === "high" && high) || (c === "low" && !high);
    const delta = won ? bet : -bet;
    const grossPayout = won ? bet * 2 : 0;
    return {
      game: id,
      currency: "stardust",
      delta,
      gross_wager: bet,
      gross_payout: grossPayout,
      net_result: delta,
      outcome: { dice, won, choice: c, payout_mult: won ? 2 : 0 },
      rules_version: CASINO_RULES_VERSION,
    };
  }

  if (id === "wheel") {
    const tier = rollWheelTier(rng);
    const delta = Math.round(bet * (tier.mult - 1));
    const grossPayout = Math.round(bet * tier.mult);
    return {
      game: id,
      currency: "stardust",
      delta,
      gross_wager: bet,
      gross_payout: grossPayout,
      net_result: delta,
      outcome: { mult: tier.mult, payout_mult: tier.mult, label: tier.label || null },
      rules_version: CASINO_RULES_VERSION,
    };
  }

  if (id === "flip") {
    const won = rng() < 0.25;
    const delta = won ? bet : -bet;
    return {
      game: id,
      currency: "nova",
      delta,
      gross_wager: bet,
      gross_payout: won ? bet * 2 : 0,
      net_result: delta,
      outcome: { won, payout_mult: won ? 2 : 0 },
      rules_version: CASINO_RULES_VERSION,
    };
  }

  if (id === "jackpot") {
    const won = rng() < 0.01;
    const delta = won ? bet * (25 - 1) : -bet;
    return {
      game: id,
      currency: "nova",
      delta,
      gross_wager: bet,
      gross_payout: won ? bet * 25 : 0,
      net_result: delta,
      outcome: { won, mult: won ? 25 : 0, payout_mult: won ? 25 : 0 },
      rules_version: CASINO_RULES_VERSION,
    };
  }

  const e = new Error("Unknown casino game");
  e.status = 400;
  throw e;
}

/** Theoretical E[mult] for wheel (for docs / stats). */
export function casinoWheelExpectedMultiplier() {
  return CASINO_WHEEL_TIERS.reduce((s, t) => s + t.p * t.mult, 0);
}
