/**
 * Versioned reward definition registry (code-backed).
 * Clients cannot alter these; long-running activities snapshot version at start.
 */

import { RewardSources } from "./sources.js";

/** @typedef {{ key: string, version: number, sourceType: string, displayName: string, status: string, fixed?: object, resolvePolicy: 'start'|'completion'|'claim', notes?: string }} RewardDefinition */

/** @type {Map<string, RewardDefinition[]>} */
const DEFINITIONS = new Map();

function register(def) {
  const list = DEFINITIONS.get(def.key) || [];
  if (list.some((d) => d.version === def.version)) {
    throw new Error(`Duplicate reward definition ${def.key}@${def.version}`);
  }
  list.push(Object.freeze({ ...def, status: def.status || "active" }));
  list.sort((a, b) => a.version - b.version);
  DEFINITIONS.set(def.key, list);
}

register({
  key: "mission_completion",
  version: 1,
  sourceType: RewardSources.MISSION_COMPLETION,
  displayName: "Mission Completion",
  resolvePolicy: "start",
  notes: "Loot rarity/type/drops snapshotted on LaunchMission; currency/XP computed at claim from snapshot + character state.",
});

register({
  key: "daily_login",
  version: 1,
  sourceType: RewardSources.DAILY_LOGIN,
  displayName: "Daily Login",
  resolvePolicy: "claim",
  notes: "Uses DAILY_REWARDS table + server calendar day (America/New_York).",
});

register({
  key: "mail_attachment",
  version: 1,
  sourceType: RewardSources.MAIL_ATTACHMENT,
  displayName: "Mail Attachment",
  resolvePolicy: "claim",
});

register({
  key: "promotion",
  version: 1,
  sourceType: RewardSources.PROMOTION,
  displayName: "Promo Code",
  resolvePolicy: "claim",
});

register({
  key: "administrator_grant",
  version: 1,
  sourceType: RewardSources.ADMINISTRATOR_GRANT,
  displayName: "Administrator Grant",
  resolvePolicy: "claim",
});

register({
  key: "compensation",
  version: 1,
  sourceType: RewardSources.COMPENSATION,
  displayName: "Compensation",
  resolvePolicy: "claim",
});

register({
  key: "casino",
  version: 1,
  sourceType: RewardSources.CASINO,
  displayName: "Casino Settle",
  resolvePolicy: "claim",
});

register({
  key: "onboarding_tutorial",
  version: 1,
  sourceType: RewardSources.ONBOARDING_TUTORIAL,
  displayName: "Onboarding Tutorial Starter Pack",
  resolvePolicy: "claim",
  fixed: {
    stardust: 1000,
    nova_crystals: 25,
    fuel: 20,
  },
  notes: "One-time starter pack on tutorial completion. Idempotent per character.",
});

export function getRewardDefinition(key, version = null) {
  const list = DEFINITIONS.get(key);
  if (!list?.length) return null;
  if (version == null) return list[list.length - 1];
  return list.find((d) => d.version === version) || null;
}

export function requireRewardDefinition(key, version = null) {
  const d = getRewardDefinition(key, version);
  if (!d || d.status !== "active") {
    const err = new Error(`Reward definition unavailable: ${key}@${version ?? "latest"}`);
    err.code = "REWARD_DEFINITION_INVALID";
    throw err;
  }
  return d;
}

export function listRewardDefinitions() {
  return [...DEFINITIONS.values()].flat();
}

export function snapshotDefinitionRef(key) {
  const d = requireRewardDefinition(key);
  return { definitionKey: d.key, definitionVersion: d.version, resolvePolicy: d.resolvePolicy };
}
