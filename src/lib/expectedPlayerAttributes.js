/**
 * Expected player total attributes + mission-enemy budget helpers.
 * Reusable for dungeon/arena balancing later — keep mission-specific
 * multipliers here only as named constants.
 */

export const ATTR_KEYS = Object.freeze([
  "strength",
  "agility",
  "intellect",
  "vitality",
  "luck",
]);

/**
 * Canonical expected TOTAL permanent attributes at a level
 * (Strength+Agility+Intellect+Vitality+Luck).
 */
export function expectedPlayerAttributes(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  return Math.round(50 + 19.3519 * L + 288.0495 * (1 - Math.exp(-L / 20)));
}

/** Mission end-of-fight enemy total attribute multiplier vs expected player. */
export const MISSION_ENEMY_ATTR_MULT = 0.35;

export function missionEnemyAttributeBudget(level) {
  return Math.round(expectedPlayerAttributes(level) * MISSION_ENEMY_ATTR_MULT);
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
