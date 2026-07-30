/**
 * Arena bot combat snapshot generator.
 * Invoked only after matchmaking has already decided the opponent is a bot.
 * Isolated so bots can be disabled later without touching ranking/matchmaking.
 */
import { expectedPlayerAttributes, ATTR_KEYS } from "./expectedPlayerAttributes.js";

/** Inclusive level offset from the challenging player's level. */
export const ARENA_BOT_LEVEL_SPREAD = 5;

/** Strength multiplier range vs ExpectedPlayerAttributes(botLevel). */
export const ARENA_BOT_STRENGTH_MIN = 0.85;
export const ARENA_BOT_STRENGTH_MAX = 1.15;

/** Canonical player classes — same identifiers as real characters. */
export const ARENA_BOT_CLASSES = Object.freeze([
  "Vanguard",
  "Astral Warden",
  "Shadow Operative",
  "Void Runner",
  "Technomancer",
  "Cosmic Engineer",
]);

export const ARENA_BOT_BUILD_KEYS = Object.freeze(["damage", "balanced", "durable"]);

/**
 * Class → build profile → attribute share of total budget.
 * Shares must sum to 1.0; leftover points after flooring go to primaryStat.
 */
export const ARENA_BOT_BUILD_PROFILES = Object.freeze({
  Vanguard: Object.freeze({
    primaryStat: "strength",
    damage: Object.freeze({ strength: 0.45, vitality: 0.2, luck: 0.18, agility: 0.12, intellect: 0.05 }),
    balanced: Object.freeze({ strength: 0.38, vitality: 0.27, luck: 0.17, agility: 0.11, intellect: 0.07 }),
    durable: Object.freeze({ strength: 0.32, vitality: 0.35, luck: 0.14, agility: 0.1, intellect: 0.09 }),
  }),
  "Astral Warden": Object.freeze({
    primaryStat: "strength",
    damage: Object.freeze({ strength: 0.4, vitality: 0.25, luck: 0.18, agility: 0.1, intellect: 0.07 }),
    balanced: Object.freeze({ strength: 0.34, vitality: 0.32, luck: 0.17, agility: 0.09, intellect: 0.08 }),
    durable: Object.freeze({ strength: 0.28, vitality: 0.4, luck: 0.13, agility: 0.08, intellect: 0.11 }),
  }),
  "Shadow Operative": Object.freeze({
    primaryStat: "agility",
    damage: Object.freeze({ agility: 0.45, luck: 0.25, vitality: 0.17, strength: 0.07, intellect: 0.06 }),
    balanced: Object.freeze({ agility: 0.38, luck: 0.22, vitality: 0.25, strength: 0.08, intellect: 0.07 }),
    durable: Object.freeze({ agility: 0.4, vitality: 0.3, luck: 0.15, strength: 0.08, intellect: 0.07 }),
  }),
  "Void Runner": Object.freeze({
    primaryStat: "agility",
    damage: Object.freeze({ agility: 0.43, luck: 0.27, vitality: 0.17, strength: 0.07, intellect: 0.06 }),
    balanced: Object.freeze({ agility: 0.37, luck: 0.23, vitality: 0.25, strength: 0.08, intellect: 0.07 }),
    durable: Object.freeze({ agility: 0.34, vitality: 0.32, luck: 0.19, strength: 0.08, intellect: 0.07 }),
  }),
  Technomancer: Object.freeze({
    primaryStat: "intellect",
    damage: Object.freeze({ intellect: 0.45, luck: 0.22, vitality: 0.2, agility: 0.07, strength: 0.06 }),
    balanced: Object.freeze({ intellect: 0.38, vitality: 0.27, luck: 0.2, agility: 0.08, strength: 0.07 }),
    durable: Object.freeze({ intellect: 0.32, vitality: 0.35, luck: 0.18, agility: 0.08, strength: 0.07 }),
  }),
  "Cosmic Engineer": Object.freeze({
    primaryStat: "intellect",
    damage: Object.freeze({ intellect: 0.43, luck: 0.22, vitality: 0.22, agility: 0.07, strength: 0.06 }),
    balanced: Object.freeze({ intellect: 0.37, vitality: 0.3, luck: 0.19, agility: 0.08, strength: 0.06 }),
    durable: Object.freeze({ intellect: 0.31, vitality: 0.38, luck: 0.17, agility: 0.08, strength: 0.06 }),
  }),
});

export function rollArenaBotLevel(playerLevel, rng = Math.random) {
  const p = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const min = Math.max(1, p - ARENA_BOT_LEVEL_SPREAD);
  const max = p + ARENA_BOT_LEVEL_SPREAD;
  return min + Math.floor(rng() * (max - min + 1));
}

export function rollArenaBotStrengthMultiplier(rng = Math.random) {
  return ARENA_BOT_STRENGTH_MIN + rng() * (ARENA_BOT_STRENGTH_MAX - ARENA_BOT_STRENGTH_MIN);
}

export function arenaBotAttributeBudget(botLevel, strengthMultiplier) {
  const L = Math.max(1, Math.floor(Number(botLevel) || 1));
  const mult = Number(strengthMultiplier);
  const m = Number.isFinite(mult) ? mult : 1;
  return Math.round(expectedPlayerAttributes(L) * m);
}

/**
 * Allocate integer attrs from share profile.
 * Floor each share, then assign leftover points to primaryStat.
 * Guarantees STR+AGI+INT+VIT+LUCK === total.
 */
export function allocateArenaBotAttributes(total, shares, primaryStat = "strength") {
  const budget = Math.max(0, Math.floor(Number(total) || 0));
  const primary = ATTR_KEYS.includes(primaryStat) ? primaryStat : "strength";
  const out = { strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0 };
  let assigned = 0;
  for (const k of ATTR_KEYS) {
    const floor = Math.floor(budget * (shares?.[k] ?? 0));
    out[k] = floor;
    assigned += floor;
  }
  out[primary] += budget - assigned;
  return out;
}

export function pickArenaBotClass(rng = Math.random) {
  return ARENA_BOT_CLASSES[Math.floor(rng() * ARENA_BOT_CLASSES.length)];
}

export function pickArenaBotBuildKey(rng = Math.random) {
  return ARENA_BOT_BUILD_KEYS[Math.floor(rng() * ARENA_BOT_BUILD_KEYS.length)];
}

/**
 * Core combat snapshot for an Arena bot.
 * Does not invent fake gear for balance — attributes are the full combat budget.
 *
 * @param {{ playerLevel: number, rng?: () => number, className?: string, buildKey?: string, level?: number, strengthMultiplier?: number }} opts
 */
export function generateArenaBot(opts = {}) {
  const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
  const playerLevel = Math.max(1, Math.floor(Number(opts.playerLevel) || 1));
  const className = opts.className && ARENA_BOT_BUILD_PROFILES[opts.className]
    ? opts.className
    : pickArenaBotClass(rng);
  const profile = ARENA_BOT_BUILD_PROFILES[className];
  const buildKey = opts.buildKey && profile[opts.buildKey]
    ? opts.buildKey
    : pickArenaBotBuildKey(rng);
  const shares = profile[buildKey];
  const level = opts.level != null
    ? Math.max(1, Math.floor(Number(opts.level) || 1))
    : rollArenaBotLevel(playerLevel, rng);
  const strengthMultiplier = opts.strengthMultiplier != null
    ? Number(opts.strengthMultiplier)
    : rollArenaBotStrengthMultiplier(rng);
  const totalAttributes = arenaBotAttributeBudget(level, strengthMultiplier);
  const stats = allocateArenaBotAttributes(totalAttributes, shares, profile.primaryStat);

  return {
    level,
    class: className,
    buildKey,
    strengthMultiplier,
    totalAttributes,
    stats,
    // Explicit: bots are real-class combatants (passives on).
    dungeonEnemy: false,
    missionEnemy: false,
    suppressClassPassive: false,
  };
}
