// Frontend mirror of the achievement catalog (api/shared/achievements.ts).
// Used for display + client-side preview; the backend re-evaluates authoritatively.

export const ACHIEVEMENT_TARGETS = Object.freeze({
  first_blood: 1,
  ten_kills: 10,
  fifty_kills: 50,
  centurion: 100,
  hot_streak: 5,
  unstoppable: 10,
  rising_star: 1_500,
  living_legend: 2_000,
  brawler: 25,
  initiate: 10,
  veteran: 50,
  ascendant: 100,
  operative: 50,
  wayfarer: 500,
  spelunker: 1,
  delver: 25,
  depths_walker: 100,
  frontier_scout: 5,
  pathfinder: 10,
  xenobiologist: 25,
  curator: 10,
  relic_keeper: 5,
  stardust_collector: 10_000,
  star_baron: 1_000_000,
});

export const ACHIEVEMENTS = [
  { id: "first_blood", name: "First Blood", desc: "Win your first Arena battle", icon: "🩸", category: "Combat", title: "the Skirmisher", check: (c) => (c.arena_wins || 0) >= ACHIEVEMENT_TARGETS.first_blood },
  { id: "ten_kills", name: "Seasoned Duelist", desc: "Win 10 Arena battles", icon: "⚔️", category: "Combat", title: "the Duelist", check: (c) => (c.arena_wins || 0) >= ACHIEVEMENT_TARGETS.ten_kills },
  { id: "fifty_kills", name: "Gladiator", desc: "Win 50 Arena battles", icon: "🛡️", category: "Combat", title: "the Gladiator", check: (c) => (c.arena_wins || 0) >= ACHIEVEMENT_TARGETS.fifty_kills },
  { id: "centurion", name: "Centurion", desc: "Win 100 Arena battles", icon: "🏅", category: "Combat", title: "the Champion", check: (c) => (c.arena_wins || 0) >= ACHIEVEMENT_TARGETS.centurion },
  { id: "hot_streak", name: "Hot Streak", desc: "Reach a 5-win Arena streak", icon: "🔥", category: "Combat", title: "On Fire", check: (c) => (c.arena_max_streak || 0) >= ACHIEVEMENT_TARGETS.hot_streak },
  { id: "unstoppable", name: "Unstoppable", desc: "Reach a 10-win Arena streak", icon: "⚡", category: "Combat", title: "Unstoppable", check: (c) => (c.arena_max_streak || 0) >= ACHIEVEMENT_TARGETS.unstoppable },
  { id: "rising_star", name: "Rising Star", desc: "Reach 1500 Arena rating", icon: "stardust", category: "Combat", title: "Rising Star", check: (c) => (c.arena_rating || 0) >= ACHIEVEMENT_TARGETS.rising_star },
  { id: "living_legend", name: "Living Legend", desc: "Reach 2000 Arena rating", icon: "👑", category: "Combat", title: "Living Legend", check: (c) => (c.arena_rating || 0) >= ACHIEVEMENT_TARGETS.living_legend },
  { id: "brawler", name: "Brawler", desc: "Fight 25 Arena battles", icon: "🥊", category: "Combat", title: "the Brawler", check: (c) => (c.arena_battles || 0) >= ACHIEVEMENT_TARGETS.brawler },

  { id: "initiate", name: "Initiate", desc: "Reach level 10", icon: "🌱", category: "Progression", title: "Initiate", check: (c) => (c.level || 0) >= ACHIEVEMENT_TARGETS.initiate },
  { id: "veteran", name: "Veteran", desc: "Reach level 50", icon: "🎖️", category: "Progression", title: "Veteran", check: (c) => (c.level || 0) >= ACHIEVEMENT_TARGETS.veteran },
  { id: "ascendant", name: "Ascendant", desc: "Reach level 100", icon: "🌟", category: "Progression", title: "Ascendant", check: (c) => (c.level || 0) >= ACHIEVEMENT_TARGETS.ascendant },
  { id: "operative", name: "Operative", desc: "Complete 50 missions", icon: "📋", category: "Progression", title: "the Operative", check: (c) => (c.missions_completed || 0) >= ACHIEVEMENT_TARGETS.operative },
  { id: "wayfarer", name: "Wayfarer", desc: "Complete 500 missions", icon: "🧭", category: "Progression", title: "the Wayfarer", check: (c) => (c.missions_completed || 0) >= ACHIEVEMENT_TARGETS.wayfarer },

  { id: "spelunker", name: "Spelunker", desc: "Clear 1 dungeon", icon: "🔦", category: "Exploration", title: "Spelunker", check: (c) => (c.dungeon_clears || 0) >= ACHIEVEMENT_TARGETS.spelunker },
  { id: "delver", name: "Delver", desc: "Clear 25 dungeons", icon: "⛏️", category: "Exploration", title: "the Delver", check: (c) => (c.dungeon_clears || 0) >= ACHIEVEMENT_TARGETS.delver },
  { id: "depths_walker", name: "Depths Walker", desc: "Clear 100 dungeons", icon: "🕳️", category: "Exploration", title: "the Depths Walker", check: (c) => (c.dungeon_clears || 0) >= ACHIEVEMENT_TARGETS.depths_walker },
  { id: "frontier_scout", name: "Frontier Scout", desc: "Reach sector 5", icon: "🪐", category: "Exploration", title: "Frontier Scout", check: (c) => (c.highest_sector || 0) >= ACHIEVEMENT_TARGETS.frontier_scout },
  { id: "pathfinder", name: "Pathfinder", desc: "Reach sector 10", icon: "🌠", category: "Exploration", title: "the Pathfinder", check: (c) => (c.highest_sector || 0) >= ACHIEVEMENT_TARGETS.pathfinder },
  { id: "xenobiologist", name: "Xenobiologist", desc: "Discover 25 species", icon: "🧬", category: "Exploration", title: "the Xenobiologist", check: (c) => ((c.discovered_species || []).length) >= ACHIEVEMENT_TARGETS.xenobiologist },
  { id: "curator", name: "Curator", desc: "Collect 10 artifacts", icon: "🏺", category: "Exploration", title: "the Curator", check: (c) => ((c.collected_artifacts || []).length) >= ACHIEVEMENT_TARGETS.curator },
  { id: "relic_keeper", name: "Relic Keeper", desc: "Collect 5 relics", icon: "💎", category: "Exploration", title: "the Relic Keeper", check: (c) => ((c.collected_relics || []).length) >= ACHIEVEMENT_TARGETS.relic_keeper },

  { id: "stardust_collector", name: "Stardust Collector", desc: "Earn 10,000 total stardust", icon: "💫", category: "Economy", title: "Stardust Collector", check: (c) => (c.total_stardust_earned || 0) >= ACHIEVEMENT_TARGETS.stardust_collector },
  { id: "star_baron", name: "Star Baron", desc: "Earn 1,000,000 total stardust", icon: "👑", category: "Economy", title: "Star Baron", check: (c) => (c.total_stardust_earned || 0) >= ACHIEVEMENT_TARGETS.star_baron },
];

export const ACHIEVEMENT_CATEGORIES = ["Combat", "Progression", "Exploration", "Economy"];

const PROGRESS_TARGETS = {
  first_blood: (c) => [c.arena_wins, ACHIEVEMENT_TARGETS.first_blood],
  ten_kills: (c) => [c.arena_wins, ACHIEVEMENT_TARGETS.ten_kills],
  fifty_kills: (c) => [c.arena_wins, ACHIEVEMENT_TARGETS.fifty_kills],
  centurion: (c) => [c.arena_wins, ACHIEVEMENT_TARGETS.centurion],
  hot_streak: (c) => [c.arena_max_streak, ACHIEVEMENT_TARGETS.hot_streak],
  unstoppable: (c) => [c.arena_max_streak, ACHIEVEMENT_TARGETS.unstoppable],
  rising_star: (c) => [c.arena_rating, ACHIEVEMENT_TARGETS.rising_star],
  living_legend: (c) => [c.arena_rating, ACHIEVEMENT_TARGETS.living_legend],
  brawler: (c) => [c.arena_battles, ACHIEVEMENT_TARGETS.brawler],
  initiate: (c) => [c.level, ACHIEVEMENT_TARGETS.initiate],
  veteran: (c) => [c.level, ACHIEVEMENT_TARGETS.veteran],
  ascendant: (c) => [c.level, ACHIEVEMENT_TARGETS.ascendant],
  operative: (c) => [c.missions_completed, ACHIEVEMENT_TARGETS.operative],
  wayfarer: (c) => [c.missions_completed, ACHIEVEMENT_TARGETS.wayfarer],
  spelunker: (c) => [c.dungeon_clears, ACHIEVEMENT_TARGETS.spelunker],
  delver: (c) => [c.dungeon_clears, ACHIEVEMENT_TARGETS.delver],
  depths_walker: (c) => [c.dungeon_clears, ACHIEVEMENT_TARGETS.depths_walker],
  frontier_scout: (c) => [c.highest_sector, ACHIEVEMENT_TARGETS.frontier_scout],
  pathfinder: (c) => [c.highest_sector, ACHIEVEMENT_TARGETS.pathfinder],
  xenobiologist: (c) => [(c.discovered_species || []).length, ACHIEVEMENT_TARGETS.xenobiologist],
  curator: (c) => [(c.collected_artifacts || []).length, ACHIEVEMENT_TARGETS.curator],
  relic_keeper: (c) => [(c.collected_relics || []).length, ACHIEVEMENT_TARGETS.relic_keeper],
  stardust_collector: (c) => [c.total_stardust_earned, ACHIEVEMENT_TARGETS.stardust_collector],
  star_baron: (c) => [c.total_stardust_earned, ACHIEVEMENT_TARGETS.star_baron],
};

export function evaluateUnlocked(character) {
  return ACHIEVEMENTS.filter((a) => { try { return a.check(character); } catch { return false; } }).map((a) => a.id);
}

/** Progress toward a locked achievement — { current, target } or null. */
export function getAchievementProgress(achievement, character) {
  const fn = PROGRESS_TARGETS[achievement?.id];
  if (!fn || !character) return null;
  const [raw, target] = fn(character);
  const current = Math.max(0, Number(raw) || 0);
  if (!target) return null;
  return { current: Math.min(current, target), target };
}

export function formatAchievementProgress(achievement, character) {
  const p = getAchievementProgress(achievement, character);
  if (!p) return null;
  const { current, target } = p;
  if (achievement.id === "stardust_collector" || achievement.id === "star_baron") {
    return `${current.toLocaleString()} / ${target.toLocaleString()}`;
  }
  return `${current} / ${target}`;
}
