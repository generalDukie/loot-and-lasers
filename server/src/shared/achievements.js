/**
 * Achievement definitions & evaluation (Restoration 20).
 * Node is authoritative. Titles auto-unlock; no currency/item rewards on defs.
 * Progress sources are Character settlement counters (Prompt 19 statistics fields).
 */
import { ARTIFACT_COUNT, RELIC_COUNT, SPECIES_COUNT } from "../../../src/lib/collectibles.js";

/** Structured registry — IDs stable; do not rename without migration. */
export const ACHIEVEMENT_DEFINITIONS = Object.freeze([
  { id: "first_blood", name: "First Blood", desc: "Win your first Arena battle", icon: "🩸", category: "Combat", title: "the Skirmisher", source: "arena_wins", op: "gte", target: 1 },
  { id: "ten_kills", name: "Seasoned Duelist", desc: "Win 10 Arena battles", icon: "⚔️", category: "Combat", title: "the Duelist", source: "arena_wins", op: "gte", target: 10 },
  { id: "fifty_kills", name: "Gladiator", desc: "Win 50 Arena battles", icon: "🛡️", category: "Combat", title: "the Gladiator", source: "arena_wins", op: "gte", target: 50 },
  { id: "centurion", name: "Centurion", desc: "Win 100 Arena battles", icon: "🏅", category: "Combat", title: "the Champion", source: "arena_wins", op: "gte", target: 100 },
  { id: "hot_streak", name: "Hot Streak", desc: "Reach a 5-win Arena streak", icon: "🔥", category: "Combat", title: "On Fire", source: "arena_max_streak", op: "gte", target: 5 },
  { id: "unstoppable", name: "Unstoppable", desc: "Reach a 10-win Arena streak", icon: "⚡", category: "Combat", title: "Unstoppable", source: "arena_max_streak", op: "gte", target: 10 },
  { id: "rising_star", name: "Rising Star", desc: "Reach 1500 Arena rating", icon: "✨", category: "Combat", title: "Rising Star", source: "arena_rating", op: "gte", target: 1500 },
  { id: "living_legend", name: "Living Legend", desc: "Reach 2000 Arena rating", icon: "👑", category: "Combat", title: "Living Legend", source: "arena_rating", op: "gte", target: 2000 },
  { id: "brawler", name: "Brawler", desc: "Fight 25 Arena battles", icon: "🥊", category: "Combat", title: "the Brawler", source: "arena_battles", op: "gte", target: 25 },
  { id: "initiate", name: "Initiate", desc: "Reach level 10", icon: "🌱", category: "Progression", title: "Initiate", source: "level", op: "gte", target: 10 },
  { id: "veteran", name: "Veteran", desc: "Reach level 50", icon: "🎖️", category: "Progression", title: "Veteran", source: "level", op: "gte", target: 50 },
  { id: "ascendant", name: "Ascendant", desc: "Reach level 100", icon: "🌟", category: "Progression", title: "Ascendant", source: "level", op: "gte", target: 100 },
  { id: "operative", name: "Operative", desc: "Complete 50 missions", icon: "📋", category: "Progression", title: "the Operative", source: "missions_completed", op: "gte", target: 50 },
  { id: "wayfarer", name: "Wayfarer", desc: "Complete 500 missions", icon: "🧭", category: "Progression", title: "the Wayfarer", source: "missions_completed", op: "gte", target: 500 },
  { id: "spelunker", name: "Spelunker", desc: "Clear 1 dungeon", icon: "🔦", category: "Exploration", title: "Spelunker", source: "dungeon_clears", op: "gte", target: 1 },
  { id: "delver", name: "Delver", desc: "Clear 25 dungeons", icon: "⛏️", category: "Exploration", title: "the Delver", source: "dungeon_clears", op: "gte", target: 25 },
  { id: "depths_walker", name: "Depths Walker", desc: "Clear 100 dungeons", icon: "🕳️", category: "Exploration", title: "the Depths Walker", source: "dungeon_clears", op: "gte", target: 100 },
  { id: "frontier_scout", name: "Frontier Scout", desc: "Reach sector 5", icon: "🪐", category: "Exploration", title: "Frontier Scout", source: "highest_sector", op: "gte", target: 5 },
  { id: "pathfinder", name: "Pathfinder", desc: "Reach sector 10", icon: "🌠", category: "Exploration", title: "the Pathfinder", source: "highest_sector", op: "gte", target: 10 },
  { id: "xenobiologist", name: "Xenobiologist", desc: "Discover 25 species", icon: "🧬", category: "Exploration", title: "the Xenobiologist", source: "discovered_species.length", op: "gte", target: 25 },
  { id: "curator", name: "Curator", desc: "Collect 10 artifacts", icon: "🏺", category: "Exploration", title: "the Curator", source: "collected_artifacts.length", op: "gte", target: 10 },
  { id: "relic_keeper", name: "Relic Keeper", desc: "Collect 5 relics", icon: "💎", category: "Exploration", title: "the Relic Keeper", source: "collected_relics.length", op: "gte", target: 5 },
  { id: "stardust_collector", name: "Stardust Collector", desc: "Earn 10,000 total stardust", icon: "💫", category: "Economy", title: "Stardust Collector", source: "total_stardust_earned", op: "gte", target: 10000 },
  { id: "star_baron", name: "Star Baron", desc: "Earn 1,000,000 total stardust", icon: "👑", category: "Economy", title: "Star Baron", source: "total_stardust_earned", op: "gte", target: 1000000 },
].map((d) => Object.freeze({
  ...d,
  scope: "character",
  progress_type: "threshold",
  reward_type: "title",
  claim_mode: "automatic",
  hidden: false,
  enabled: true,
  retroactive: true,
  version: 1,
})));

export const ACHIEVEMENT_CATEGORIES = Object.freeze(["Combat", "Progression", "Exploration", "Economy"]);

function readSource(character, source) {
  if (!character || !source) return 0;
  if (source.endsWith(".length")) {
    const key = source.slice(0, -".length".length);
    const arr = character[key];
    return Array.isArray(arr) ? arr.length : 0;
  }
  return Number(character[source]) || 0;
}

function meets(def, character) {
  const raw = readSource(character, def.source);
  if (def.op === "gte") return raw >= def.target;
  if (def.op === "lte") return raw <= def.target;
  if (def.op === "eq") return raw === def.target;
  return false;
}

/** Legacy-shaped catalog for callers that expect `.check`. */
export const ACHIEVEMENTS = ACHIEVEMENT_DEFINITIONS.map((d) => ({
  id: d.id,
  name: d.name,
  desc: d.desc,
  icon: d.icon,
  category: d.category,
  title: d.title,
  check: (c) => {
    try {
      return meets(d, c);
    } catch {
      return false;
    }
  },
}));

export function validateAchievementDefinitions(defs = ACHIEVEMENT_DEFINITIONS) {
  const ids = new Set();
  const errors = [];
  for (const d of defs) {
    if (!d.id || ids.has(d.id)) errors.push(`duplicate or missing id: ${d.id}`);
    ids.add(d.id);
    if (!["character", "account"].includes(d.scope)) errors.push(`${d.id}: bad scope`);
    if (!d.source || !(d.target > 0)) errors.push(`${d.id}: bad source/target`);
    if (!["gte", "lte", "eq"].includes(d.op)) errors.push(`${d.id}: bad op`);
    if (d.reward_type !== "title" || !d.title) errors.push(`${d.id}: title reward required`);
    if (!d.enabled) errors.push(`${d.id}: disabled`);
  }
  return { ok: errors.length === 0, errors };
}

export function evaluateUnlocked(character) {
  return ACHIEVEMENT_DEFINITIONS.filter((d) => d.enabled && meets(d, character)).map((d) => d.id);
}

/** Merge newly earned achievements into a character patch (unlocks are permanent). */
export function mergeAchievementUnlocks(character, patch = {}) {
  const projected = { ...character, ...patch };
  const prior = new Set(projected.unlocked_achievements || []);
  const evaluated = evaluateUnlocked(projected);
  const unlocked = [...new Set([...prior, ...evaluated])];
  const titles = new Set(projected.unlocked_titles || []);
  for (const id of unlocked) {
    const a = ACHIEVEMENT_DEFINITIONS.find((x) => x.id === id);
    if (a?.title) titles.add(a.title);
  }

  const achPatch = {};
  const sortArr = (arr) => [...arr].sort();
  if (JSON.stringify(sortArr(unlocked)) !== JSON.stringify(sortArr(projected.unlocked_achievements || []))) {
    achPatch.unlocked_achievements = unlocked;
  }
  if (JSON.stringify(sortArr([...titles])) !== JSON.stringify(sortArr(projected.unlocked_titles || []))) {
    achPatch.unlocked_titles = [...titles];
  }

  return {
    patch: achPatch,
    newly_unlocked: evaluated.filter((id) => !prior.has(id)),
  };
}

export function getAchievementProgress(defOrId, character) {
  const def = typeof defOrId === "string"
    ? ACHIEVEMENT_DEFINITIONS.find((d) => d.id === defOrId)
    : defOrId;
  if (!def || !character) return null;
  const raw = Math.max(0, readSource(character, def.source));
  const target = def.target;
  return {
    current: Math.min(raw, target),
    raw,
    target,
  };
}

/**
 * Safe Godot/web list payload — no secret evaluation expressions.
 * Completions are permanent even if current rating falls.
 */
export function serializeCharacterAchievements(character) {
  const unlocked = new Set(character?.unlocked_achievements || []);
  const titles = character?.unlocked_titles || [];
  const achievements = ACHIEVEMENT_DEFINITIONS.filter((d) => d.enabled).map((d) => {
    const done = unlocked.has(d.id);
    const progress = getAchievementProgress(d, character);
    return {
      id: d.id,
      name: d.name,
      desc: d.desc,
      icon: d.icon,
      category: d.category,
      title: d.title,
      scope: d.scope,
      completed: done,
      progress: progress
        ? { current: progress.current, target: progress.target }
        : null,
      reward: { type: "title", title: d.title, claim_mode: "automatic", claimed: done },
      hidden: false,
      sort_order: ACHIEVEMENT_DEFINITIONS.findIndex((x) => x.id === d.id),
    };
  });
  const completed = achievements.filter((a) => a.completed).length;
  return {
    achievements,
    categories: ACHIEVEMENT_CATEGORIES,
    unlocked_achievements: [...unlocked],
    unlocked_titles: titles,
    active_title: character?.active_title || "",
    completed_count: completed,
    total_count: achievements.length,
    catalog_totals: {
      species: SPECIES_COUNT,
      artifacts: ARTIFACT_COUNT,
      relics: RELIC_COUNT,
    },
  };
}

/** Reject client-injected progress / completion / reward fields. */
export function assertAchievementClientSafe(body = {}) {
  if (!body || typeof body !== "object") return;
  const hard = [
    "unlocked_achievements",
    "unlocked_titles",
    "newly_unlocked",
    "progress",
    "completed",
    "completion",
    "reward",
    "reward_amount",
    "stardust",
    "nova",
    "collection_entry",
    "discovered_species",
    "collected_artifacts",
    "collected_relics",
    "discovered_gear",
  ];
  for (const k of hard) {
    if (Object.prototype.hasOwnProperty.call(body, k) && body[k] != null) {
      const e = new Error(`Client may not supply ${k}`);
      e.status = 400;
      e.code = "ACHIEVEMENT_CLIENT_AUTHORITY_REJECTED";
      throw e;
    }
  }
  // Allow only title equip (string) beyond empty body.
  for (const k of Object.keys(body)) {
    if (k === "title") continue;
    if (/^(set|increment|mutate|claim)_/i.test(k)) {
      const e = new Error(`Client may not supply ${k}`);
      e.status = 400;
      e.code = "ACHIEVEMENT_CLIENT_AUTHORITY_REJECTED";
      throw e;
    }
  }
}
