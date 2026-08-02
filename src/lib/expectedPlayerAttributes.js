/**
 * Expected player total attributes + PvE enemy budget helpers.
 * Mission and dungeon multipliers live here; distribution is shared.
 *
 * ExpectedPlayerAttributes(level) is a balance benchmark only — never derived
 * from the live player's gear, purchases, activity, or active Stims.
 *
 * The Stim-adjusted anchor table already bakes in typical combat-ready Stim
 * usage (~3 active Stims at ~+12.5% average on Primary/Vitality/Luck).
 * Do NOT multiply the result by another Stim factor.
 */

import { getFullSetAttributeBudget } from "./itemGeneration.js";

export const ATTR_KEYS = Object.freeze([
  "strength",
  "agility",
  "intellect",
  "vitality",
  "luck",
]);

/** Class base attributes always sum to this. */
export const PLAYER_BASE_ATTRIBUTES = 50;

/**
 * Authoritative Stim-adjusted ExpectedPlayerAttributes anchors
 * (simulation-derived combat-ready player benchmark).
 * Levels at these points must return the exact values.
 */
export const EXPECTED_PLAYER_ATTRIBUTE_ANCHORS = Object.freeze([
  [1, 68],
  [10, 383],
  [20, 630],
  [25, 745],
  [30, 864],
  [40, 1087],
  [50, 1277],
  [60, 1512],
  [70, 1718],
  [80, 1919],
  [90, 2119],
  [100, 2275],
  [110, 2520],
  [120, 2706],
  [130, 2893],
  [140, 3078],
  [150, 3263],
  [160, 3448],
  [170, 3631],
  [180, 3816],
  [190, 4001],
  [200, 4096],
  [250, 5365],
  [300, 6336],
  [350, 7700],
  [400, 8673],
  [450, 10095],
  [500, 11054],
]);

/** Linear late-game slope for level > 500 (Stim-adjusted). */
export const EXPECTED_PLAYER_POST_500_SLOPE = 23.9;
export const EXPECTED_PLAYER_AT_500 = 11054;

// ── Monotone cubic PCHIP (linear attribute space — not log) ──

function pchipSlopes(xs, ys) {
  const n = xs.length;
  const d = new Array(n).fill(0);
  const delta = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    delta[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  }
  d[0] = delta[0];
  d[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] === 0 || delta[i] === 0 || Math.sign(delta[i - 1]) !== Math.sign(delta[i])) {
      d[i] = 0;
    } else {
      const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]);
      const w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1]);
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }
  return d;
}

function hermite(x, x0, x1, y0, y1, d0, d1) {
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * y0 + h10 * h * d0 + h01 * y1 + h11 * h * d1;
}

/**
 * Monotone cubic PCHIP over anchors; exact at anchors.
 * @param {ReadonlyArray<[number, number]>} anchors
 * @param {number} x
 */
function pchipAnchors(anchors, x) {
  const pts = anchors.map(([a, b]) => [Number(a), Number(b)]);
  if (!pts.length) return 0;
  const X = Math.max(pts[0][0], Number(x) || pts[0][0]);

  for (const [ax, ay] of pts) {
    if (X === ax) return Math.round(ay);
  }

  if (X < pts[0][0]) return Math.round(pts[0][1]);

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d = pchipSlopes(xs, ys);

  let i = 0;
  while (i < xs.length - 2 && X > xs[i + 1]) i += 1;

  return Math.max(1, Math.round(hermite(X, xs[i], xs[i + 1], ys[i], ys[i + 1], d[i], d[i + 1])));
}

/**
 * Canonical expected TOTAL effective attributes at a level
 * (Strength+Agility+Intellect+Vitality+Luck), including typical Stim uplift
 * baked into the anchor table.
 * Balance benchmark only — not the live player's attributes.
 */
export function expectedPlayerAttributes(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  if (L > 500) {
    return Math.round(EXPECTED_PLAYER_AT_500 + EXPECTED_PLAYER_POST_500_SLOPE * (L - 500));
  }
  return pchipAnchors(EXPECTED_PLAYER_ATTRIBUTE_ANCHORS, L);
}

/**
 * Realistic power for a player who keeps gear roughly on-level.
 * Level-ups grant 0 free attrs; progression comes from equipped set budgets.
 * GEAR_FILL ≈ uncommon-common blend of a full 8-slot set.
 * Used for mission soft-encounter budgets (separate from ExpectedPlayerAttributes).
 */
export const MISSION_PLAYER_GEAR_FILL = 0.75;

export function progressingPlayerAttributes(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  return Math.round(PLAYER_BASE_ATTRIBUTES + getFullSetAttributeBudget(L) * MISSION_PLAYER_GEAR_FILL);
}

/**
 * Soft end-of-mission foe vs a progressing player.
 * ~28% of progressing power — nearly always loses to equipped/on-level players;
 * bare / obsolete-gear players fall behind as level rises.
 */
export const MISSION_ENEMY_ATTR_MULT = 0.28;

export function missionEnemyAttributeBudget(level) {
  return Math.round(progressingPlayerAttributes(level) * MISSION_ENEMY_ATTR_MULT);
}

/** Regular dungeon foes — 120% of expected player attrs at the enemy's own level. */
export const DUNGEON_REGULAR_ATTRIBUTE_MULTIPLIER = 1.20;

/** Dungeon boss (encounter 10) — 130% of expected player attrs at the boss's own level. */
export const DUNGEON_BOSS_ATTRIBUTE_MULTIPLIER = 1.30;

/**
 * Dungeon enemy total attribute budget from the enemy's level (not the player).
 * Boss uses 1.30 directly — never compounds with the regular 1.20.
 */
export function dungeonEnemyAttributeBudget(level, isBoss = false) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const mult = isBoss ? DUNGEON_BOSS_ATTRIBUTE_MULTIPLIER : DUNGEON_REGULAR_ATTRIBUTE_MULTIPLIER;
  return Math.round(expectedPlayerAttributes(L) * mult);
}

/** Hidden combat archetypes — not shown in UI / names / art. */
export const MISSION_ENEMY_ARCHETYPES = Object.freeze(["MIGHT", "REFLEX", "TECH"]);

/**
 * Map hidden archetype → playable class used ONLY for primary-stat /
 * resist-family rules in statEngine. Passives must be suppressed separately.
 */
export const MISSION_ENEMY_ARCHETYPE_CLASS = Object.freeze({
  MIGHT: "Vanguard",
  REFLEX: "Shadow Operative",
  TECH: "Technomancer",
});

/** Share of total budget by attribute key, per archetype. */
export const MISSION_ENEMY_ATTR_SHARES = Object.freeze({
  MIGHT: Object.freeze({
    strength: 0.35,
    vitality: 0.25,
    luck: 0.2,
    agility: 0.1,
    intellect: 0.1,
  }),
  REFLEX: Object.freeze({
    agility: 0.35,
    vitality: 0.25,
    luck: 0.2,
    strength: 0.1,
    intellect: 0.1,
  }),
  TECH: Object.freeze({
    intellect: 0.35,
    vitality: 0.25,
    luck: 0.2,
    strength: 0.1,
    agility: 0.1,
  }),
});

export function pickMissionEnemyArchetype(rng = Math.random) {
  const i = Math.floor(rng() * MISSION_ENEMY_ARCHETYPES.length);
  return MISSION_ENEMY_ARCHETYPES[i];
}

/**
 * Distribute an integer budget across five attributes using archetype shares.
 * Largest-remainder method guarantees the five values sum exactly to `total`.
 */
export function distributeMissionEnemyAttributes(total, archetype) {
  const budget = Math.max(0, Math.floor(Number(total) || 0));
  const shares = MISSION_ENEMY_ATTR_SHARES[archetype] || MISSION_ENEMY_ATTR_SHARES.MIGHT;
  const keys = ATTR_KEYS.filter((k) => shares[k] != null);
  const raw = keys.map((k) => {
    const exact = budget * shares[k];
    const floor = Math.floor(exact);
    return { key: k, floor, frac: exact - floor };
  });
  let assigned = raw.reduce((s, r) => s + r.floor, 0);
  let remain = budget - assigned;
  raw.sort((a, b) => b.frac - a.frac || a.key.localeCompare(b.key));
  for (let i = 0; i < raw.length && remain > 0; i++) {
    raw[i].floor += 1;
    remain -= 1;
  }
  const out = { strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0 };
  for (const r of raw) out[r.key] = r.floor;
  return out;
}

/** Build expected-player flat stats for simulations (no gear). */
export function distributeExpectedPlayerAttributes(level, archetype = "MIGHT") {
  return distributeMissionEnemyAttributes(expectedPlayerAttributes(level), archetype);
}

/** Build progressing-player flat stats for simulations (no gear items; attrs baked in). */
export function distributeProgressingPlayerAttributes(level, archetype = "MIGHT") {
  return distributeMissionEnemyAttributes(progressingPlayerAttributes(level), archetype);
}
