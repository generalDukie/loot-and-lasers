/**
 * Authoritative statistics serialization & Arena ranking helpers (Restoration 19).
 * Counters live on Character documents, mutated only by gameplay settlement.
 * This module READS existing fields — it does not invent speculative statistics.
 */
import { entities } from "../entities.js";
import { computeArenaRank, listArenaLeaderboard } from "./arenaService.js";
import { getArenaRewardedWinsState, todayET } from "./economyFormulas.js";

/** Registry of recovered Character-scoped statistics (presentation + docs). */
export const STATISTIC_DEFINITIONS = Object.freeze([
  { id: "missions_completed", scope: "character", value_type: "int", op: "increment", source: "mission_claim", period: "lifetime", visibility: "public" },
  { id: "arena_wins", scope: "character", value_type: "int", op: "increment", source: "arena_finish", period: "lifetime", visibility: "public" },
  { id: "arena_losses", scope: "character", value_type: "int", op: "increment", source: "arena_finish", period: "lifetime", visibility: "public" },
  { id: "arena_battles", scope: "character", value_type: "int", op: "increment", source: "arena_finish", period: "lifetime", visibility: "public" },
  { id: "arena_streak", scope: "character", value_type: "int", op: "replace", source: "arena_finish", period: "current", visibility: "public" },
  { id: "arena_max_streak", scope: "character", value_type: "int", op: "maximum", source: "arena_finish", period: "lifetime", visibility: "public", comparison: "higher" },
  { id: "arena_rating", scope: "character", value_type: "int", op: "replace", source: "arena_authority", period: "current", visibility: "public" },
  { id: "dungeon_clears", scope: "character", value_type: "int", op: "increment", source: "dungeon_finish", period: "lifetime", visibility: "public" },
  { id: "dungeon_nodes_cleared", scope: "character", value_type: "int", op: "increment", source: "dungeon_finish", period: "lifetime", visibility: "public" },
  { id: "highest_sector", scope: "character", value_type: "int", op: "maximum", source: "mission_dungeon", period: "lifetime", visibility: "public", comparison: "higher" },
  { id: "highest_damage", scope: "character", value_type: "int", op: "maximum", source: "combat_finish", period: "lifetime", visibility: "public", comparison: "higher" },
  { id: "total_stardust_earned", scope: "character", value_type: "int", op: "add", source: "economy_ledger", period: "lifetime", visibility: "private_or_owner", note: "Gross credits; not current balance" },
  { id: "level", scope: "character", value_type: "int", op: "replace", source: "progression", period: "current", visibility: "public" },
  { id: "playtime_seconds", scope: "character", value_type: "int", op: "replace", source: "client_stripped", period: "lifetime", visibility: "public", note: "Non-authoritative — entity writes stripped" },
]);

export const LEADERBOARD_DEFINITIONS = Object.freeze([
  {
    id: "arena_rating",
    display_name: "Galactic Rankings",
    score_source: "character.arena_rating",
    sort: "desc",
    tie_breakers: ["arena_wins_desc", "character_id_asc"],
    rank_style: "ordinal", // 1,2,3,… by sort position (competition ties share order via wins then id)
    eligibility: "all_characters",
    nakama_mirror: false,
    bots_included: false,
    page_size_max: 100,
  },
]);

function arrLen(v) {
  return Array.isArray(v) ? v.length : 0;
}

/**
 * Owner-facing career statistics (matches CharacterStats.jsx fields + Arena extras).
 */
export function serializeCharacterStatistics(character, { includePrivate = true } = {}) {
  if (!character) return null;
  const today = todayET();
  const rewarded = getArenaRewardedWinsState(character, today);
  const rank = computeArenaRank(character.id);
  const stats = {
    character_id: character.id,
    name: character.name,
    level: character.level || 1,
    class: character.class || null,
    race: character.race || null,
    // Career counters (Character document — settlement-authored)
    missions_completed: character.missions_completed || 0,
    arena_wins: character.arena_wins || 0,
    arena_losses: character.arena_losses || 0,
    arena_battles: character.arena_battles || 0,
    arena_streak: character.arena_streak || 0,
    arena_max_streak: character.arena_max_streak || 0,
    arena_rating: character.arena_rating || 1000,
    arena_rank: rank,
    dungeon_clears: character.dungeon_clears || 0,
    dungeon_nodes_cleared: character.dungeon_nodes_cleared || 0,
    highest_sector: character.highest_sector || 1,
    highest_damage: character.highest_damage || 0,
    playtime_seconds: character.playtime_seconds || 0,
    // Collections (length only)
    discovered_species_count: arrLen(character.discovered_species),
    collected_artifacts_count: arrLen(character.collected_artifacts),
    collected_relics_count: arrLen(character.collected_relics),
    // Daily (Arena rewarded — shared game-day)
    arena_rewarded_wins_today: rewarded.wins,
    arena_rewarded_wins_date: rewarded.date,
    game_day: today,
  };
  if (includePrivate) {
    stats.total_stardust_earned = character.total_stardust_earned || 0;
    stats.stardust = character.stardust || 0; // current balance — not lifetime
  }
  // Personal records recovered from existing max fields
  stats.personal_records = {
    highest_damage: { value: character.highest_damage || 0, comparison: "higher" },
    arena_max_streak: { value: character.arena_max_streak || 0, comparison: "higher" },
    highest_sector: { value: character.highest_sector || 1, comparison: "higher" },
    // No separate highest_rating field — current rating is Arena authority only
  };
  return stats;
}

/**
 * Public profile card — no currency balances / earned totals.
 */
export function serializePublicProfileStatistics(character) {
  const full = serializeCharacterStatistics(character, { includePrivate: false });
  if (!full) return null;
  const {
    total_stardust_earned: _a,
    stardust: _b,
    ...pub
  } = full;
  void _a;
  void _b;
  return pub;
}

/** Deterministic Arena ordering shared with listArenaLeaderboard. */
export function sortedArenaCharacters() {
  return entities.Character.filter({})
    .slice()
    .sort((a, b) => {
      const rd = (b.arena_rating || 1000) - (a.arena_rating || 1000);
      if (rd !== 0) return rd;
      const wd = (b.arena_wins || 0) - (a.arena_wins || 0);
      if (wd !== 0) return wd;
      return String(a.id).localeCompare(String(b.id));
    });
}

/**
 * Nearby-player view around a character (server-authoritative rank window).
 */
export function getNearbyArenaEntries(characterId, { radius = 5 } = {}) {
  const all = sortedArenaCharacters();
  const idx = all.findIndex((c) => c.id === characterId);
  if (idx < 0) {
    return {
      player_rank: 0,
      total: all.length,
      entries: [],
      radius,
    };
  }
  const r = Math.max(0, Math.min(25, Math.floor(Number(radius) || 5)));
  const start = Math.max(0, idx - r);
  const end = Math.min(all.length, idx + r + 1);
  const entries = all.slice(start, end).map((c, i) => ({
    rank: start + i + 1,
    id: c.id,
    character_id: c.id,
    name: c.name,
    level: c.level || 1,
    class: c.class,
    arena_rating: c.arena_rating || 1000,
    arena_wins: c.arena_wins || 0,
    arena_losses: c.arena_losses || 0,
    race: c.race,
    created_by_id: c.created_by_id || null,
    is_self: c.id === characterId,
  }));
  return {
    player_rank: idx + 1,
    total: all.length,
    entries,
    radius: r,
  };
}

export function serializeLeaderboardPage({ limit = 50, offset = 0 } = {}) {
  const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || 50)));
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const all = sortedArenaCharacters();
  const rankings = listArenaLeaderboard({ limit: lim, offset: off });
  return {
    leaderboard_id: "arena_rating",
    definition: LEADERBOARD_DEFINITIONS[0],
    rankings,
    total: all.length,
    limit: lim,
    offset: off,
    has_more: off + lim < all.length,
  };
}

export {
  listArenaLeaderboard,
  computeArenaRank,
};
