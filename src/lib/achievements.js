// Frontend mirror of the achievement catalog (api/shared/achievements.ts).
// Used for display + client-side preview; the backend re-evaluates authoritatively.

export const ACHIEVEMENTS = [
  { id: "first_blood", name: "First Blood", desc: "Win your first Arena battle", icon: "🩸", category: "Combat", title: "the Skirmisher", check: (c) => (c.arena_wins || 0) >= 1 },
  { id: "ten_kills", name: "Seasoned Duelist", desc: "Win 10 Arena battles", icon: "⚔️", category: "Combat", title: "the Duelist", check: (c) => (c.arena_wins || 0) >= 10 },
  { id: "fifty_kills", name: "Gladiator", desc: "Win 50 Arena battles", icon: "🛡️", category: "Combat", title: "the Gladiator", check: (c) => (c.arena_wins || 0) >= 50 },
  { id: "centurion", name: "Centurion", desc: "Win 100 Arena battles", icon: "🏅", category: "Combat", title: "the Champion", check: (c) => (c.arena_wins || 0) >= 100 },
  { id: "hot_streak", name: "Hot Streak", desc: "Reach a 5-win Arena streak", icon: "🔥", category: "Combat", title: "On Fire", check: (c) => (c.arena_max_streak || 0) >= 5 },
  { id: "unstoppable", name: "Unstoppable", desc: "Reach a 10-win Arena streak", icon: "⚡", category: "Combat", title: "Unstoppable", check: (c) => (c.arena_max_streak || 0) >= 10 },
  { id: "rising_star", name: "Rising Star", desc: "Reach 1500 Arena rating", icon: "✨", category: "Combat", title: "Rising Star", check: (c) => (c.arena_rating || 0) >= 1500 },
  { id: "living_legend", name: "Living Legend", desc: "Reach 2000 Arena rating", icon: "👑", category: "Combat", title: "Living Legend", check: (c) => (c.arena_rating || 0) >= 2000 },
  { id: "brawler", name: "Brawler", desc: "Fight 25 Arena battles", icon: "🥊", category: "Combat", title: "the Brawler", check: (c) => (c.arena_battles || 0) >= 25 },

  { id: "initiate", name: "Initiate", desc: "Reach level 10", icon: "🌱", category: "Progression", title: "Initiate", check: (c) => (c.level || 0) >= 10 },
  { id: "veteran", name: "Veteran", desc: "Reach level 50", icon: "🎖️", category: "Progression", title: "Veteran", check: (c) => (c.level || 0) >= 50 },
  { id: "ascendant", name: "Ascendant", desc: "Reach level 100", icon: "🌟", category: "Progression", title: "Ascendant", check: (c) => (c.level || 0) >= 100 },
  { id: "operative", name: "Operative", desc: "Complete 50 missions", icon: "📋", category: "Progression", title: "the Operative", check: (c) => (c.missions_completed || 0) >= 50 },
  { id: "wayfarer", name: "Wayfarer", desc: "Complete 500 missions", icon: "🧭", category: "Progression", title: "the Wayfarer", check: (c) => (c.missions_completed || 0) >= 500 },

  { id: "spelunker", name: "Spelunker", desc: "Clear 1 dungeon", icon: "🔦", category: "Exploration", title: "Spelunker", check: (c) => (c.dungeon_clears || 0) >= 1 },
  { id: "delver", name: "Delver", desc: "Clear 25 dungeons", icon: "⛏️", category: "Exploration", title: "the Delver", check: (c) => (c.dungeon_clears || 0) >= 25 },
  { id: "depths_walker", name: "Depths Walker", desc: "Clear 100 dungeons", icon: "🕳️", category: "Exploration", title: "the Depths Walker", check: (c) => (c.dungeon_clears || 0) >= 100 },
  { id: "frontier_scout", name: "Frontier Scout", desc: "Reach sector 5", icon: "🪐", category: "Exploration", title: "Frontier Scout", check: (c) => (c.highest_sector || 0) >= 5 },
  { id: "pathfinder", name: "Pathfinder", desc: "Reach sector 10", icon: "🌠", category: "Exploration", title: "the Pathfinder", check: (c) => (c.highest_sector || 0) >= 10 },
  { id: "xenobiologist", name: "Xenobiologist", desc: "Discover 25 species", icon: "🧬", category: "Exploration", title: "the Xenobiologist", check: (c) => ((c.discovered_species || []).length) >= 25 },
  { id: "curator", name: "Curator", desc: "Collect 10 artifacts", icon: "🏺", category: "Exploration", title: "the Curator", check: (c) => ((c.collected_artifacts || []).length) >= 10 },
  { id: "relic_keeper", name: "Relic Keeper", desc: "Collect 5 relics", icon: "💎", category: "Exploration", title: "the Relic Keeper", check: (c) => ((c.collected_relics || []).length) >= 5 },

  { id: "stardust_collector", name: "Stardust Collector", desc: "Earn 1,000 total stardust", icon: "💫", category: "Economy", title: "Stardust Collector", check: (c) => (c.total_stardust_earned || 0) >= 1000 },
  { id: "star_baron", name: "Star Baron", desc: "Earn 100,000 total stardust", icon: "💰", category: "Economy", title: "Star Baron", check: (c) => (c.total_stardust_earned || 0) >= 100000 },
];

export const ACHIEVEMENT_CATEGORIES = ["Combat", "Progression", "Exploration", "Economy"];

export function evaluateUnlocked(character) {
  return ACHIEVEMENTS.filter((a) => { try { return a.check(character); } catch { return false; } }).map((a) => a.id);
}