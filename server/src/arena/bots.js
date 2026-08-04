/**
 * Persistent arena bot ladder — bots keep ratings, can raid the player,
 * and appear as matchmaking opponents for simulation.
 *
 * Combat stats come from generateArenaBot (ExpectedPlayerAttributes × 0.85–1.15).
 * Ranking / raid / pool selection logic is unchanged.
 */

import { nanoid } from "nanoid";
import { db } from "../db.js";
import { clock } from "../shared/time/clock.js";
import { entities } from "../entities.js";
import {
  eloExpectedScore,
  eloRatingDelta,
} from "../shared/economyFormulas.js";
import { generateArenaBot } from "../../../src/lib/arenaBotGenerator.js";
import { tryCreateNotification } from "../shared/notificationService.js";
// Attribute budgets: ExpectedPlayerAttributes (shared re-export of src/lib).

const BOT_NAMES = [
  "Vrax'Nok", "Zyx-7", "Kaelith", "Drogath", "Nebulon", "Zyr'kara", "Cygnus",
  "Mordok", "Lyra-9", "Threx", "Zarvok", "Pixie-Δ", "Garrak", "Sylph",
  "Onyx-3", "Brak'tor", "Vesper", "Krellix", "Astra", "Mungo", "RustBeard",
  "VoidCaptain", "Nova", "Zara", "Keagan", "Hexa", "Quill", "Rook",
];
const BOT_GUILDS = [
  "Void Reapers", "Stellar Syndicate", "Crimson Nebula", "Iron Orbit",
  "Quantum Corsairs", "Solar Fang", "The Forgotten", "Stellar Guard",
];
const RACES = ["Zyrathi", "Cognati", "Keldris", "Luminae", "Cethylli", "Myrrkin"];

/** How often incoming bot raids may process when the player opens Arena. */
export const BOT_RAID_COOLDOWN_MS = 12 * 60 * 1000;
export const BOT_RAIDS_PER_PULSE = 2;
/** Target bots near a player's rating for the ladder. */
export const BOT_POOL_TARGET = 14;

let schemaReady = false;

function ensureSchema() {
  if (schemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS arena_bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      race TEXT,
      class TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      arena_rating INTEGER NOT NULL DEFAULT 1000,
      arena_wins INTEGER NOT NULL DEFAULT 0,
      arena_losses INTEGER NOT NULL DEFAULT 0,
      guild TEXT,
      appearance_json TEXT,
      stats_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_arena_bots_rating ON arena_bots(arena_rating);
  `);
  schemaReady = true;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rowToBot(row) {
  if (!row) return null;
  let appearance = {};
  let stats = {};
  try { appearance = JSON.parse(row.appearance_json || "{}"); } catch { /* */ }
  try { stats = JSON.parse(row.stats_json || "{}"); } catch { /* */ }
  return {
    id: row.id,
    name: row.name,
    race: row.race,
    class: row.class,
    level: row.level || 1,
    arena_rating: row.arena_rating || 1000,
    arena_wins: row.arena_wins || 0,
    arena_losses: row.arena_losses || 0,
    guild: row.guild || null,
    appearance,
    stats,
    isBot: true,
    arena_bot_id: row.id,
    speciesId: ((String(row.name).charCodeAt(0) || 1) % 30) + 1,
  };
}

export function getArenaBot(id) {
  ensureSchema();
  if (!id) return null;
  return rowToBot(db.prepare("SELECT * FROM arena_bots WHERE id = ?").get(id));
}

export function listBotsNearRating(rating = 1000, { limit = 8, excludeIds = [] } = {}) {
  ensureSchema();
  const r = Math.max(0, Math.floor(Number(rating) || 1000));
  const rows = db
    .prepare(
      `SELECT * FROM arena_bots
       ORDER BY ABS(arena_rating - ?) ASC, updated_at DESC
       LIMIT ?`
    )
    .all(r, Math.max(limit * 3, 24));
  const exclude = new Set(excludeIds.filter(Boolean));
  return rows
    .map(rowToBot)
    .filter((b) => b && !exclude.has(b.id))
    .slice(0, limit);
}

function createBotNear(anchorLevel, anchorRating) {
  ensureSchema();
  const id = nanoid();
  const now = clock.nowIso();
  const snap = generateArenaBot({ playerLevel: anchorLevel || 1 });
  const className = snap.class;
  const race = pick(RACES);
  const level = snap.level;
  const rating = Math.max(0, (anchorRating || 1000) + Math.floor(Math.random() * 120) - 60);
  const name = `${pick(BOT_NAMES)}`;
  const stats = snap.stats;
  const appearance = { skinColor: "#4A5568", eyeStyle: "Standard" };
  const guild = Math.random() < 0.55 ? pick(BOT_GUILDS) : null;
  const wins = Math.max(0, Math.floor(rating / 4) + Math.floor(Math.random() * 15));
  const losses = Math.floor(wins * (0.4 + Math.random() * 0.55));
  db.prepare(
    `INSERT INTO arena_bots
     (id, name, race, class, level, arena_rating, arena_wins, arena_losses, guild, appearance_json, stats_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    race,
    className,
    level,
    rating,
    wins,
    losses,
    guild,
    JSON.stringify(appearance),
    JSON.stringify(stats),
    now,
    now
  );
  return getArenaBot(id);
}

/** Ensure a band of bots exists around this player's rating/level. */
export function ensureBotPoolForPlayer(character, target = BOT_POOL_TARGET) {
  ensureSchema();
  const rating = character?.arena_rating || 1000;
  const level = character?.level || 1;
  const count = db.prepare("SELECT COUNT(*) AS n FROM arena_bots").get()?.n || 0;
  const need = Math.max(0, target - count);
  for (let i = 0; i < need; i++) createBotNear(level, rating);
  // Top up near-band if the global pool drifted away.
  const near = listBotsNearRating(rating, { limit: Math.ceil(target / 2) });
  if (near.length < Math.min(6, target)) {
    for (let i = 0; i < 4; i++) createBotNear(level, rating);
  }
  return listBotsNearRating(rating, { limit: target });
}

export function applyBotRatingDelta(botId, { won, ratingDelta }) {
  ensureSchema();
  const bot = getArenaBot(botId);
  if (!bot) return null;
  const nextRating = Math.max(0, (bot.arena_rating || 1000) + (ratingDelta || 0));
  const now = clock.nowIso();
  db.prepare(
    `UPDATE arena_bots SET
       arena_rating = ?,
       arena_wins = arena_wins + ?,
       arena_losses = arena_losses + ?,
       updated_at = ?
     WHERE id = ?`
  ).run(nextRating, won ? 1 : 0, won ? 0 : 1, now, botId);
  return getArenaBot(botId);
}

/**
 * When the player attacks a bot: mirror Elo onto the bot ladder.
 * Player already received +delta on win / −delta on loss — bot gets the opposite.
 */
export function settleBotAsOpponent(botId, { playerWon, playerRatingDelta }) {
  if (!botId) return null;
  const botDelta = -(Number(playerRatingDelta) || 0);
  return applyBotRatingDelta(botId, {
    won: !playerWon,
    ratingDelta: botDelta,
  });
}

/**
 * Simulate an incoming bot attack (bot is the aggressor).
 * Uses Elo expected score as the win probability for simulation.
 * Returns rating deltas from the PLAYER's perspective (defense).
 */
export function simulateBotRaid(character, bot) {
  const playerRating = character.arena_rating || 1000;
  const botRating = bot.arena_rating || 1000;
  // Bot's chance to beat the player.
  const botWinChance = eloExpectedScore(botRating, playerRating);
  const botWon = Math.random() < botWinChance;
  const playerWonDefense = !botWon;

  const playerDelta = eloRatingDelta(playerRating, botRating, playerWonDefense);
  const botDelta = eloRatingDelta(botRating, playerRating, botWon);

  return {
    playerWon: playerWonDefense,
    playerRatingDelta: playerDelta,
    botRatingDelta: botDelta,
    botWon,
    botWinChance,
  };
}

/**
 * Process pending incoming bot raids for a character.
 * Idempotent within BOT_RAID_COOLDOWN_MS via character.arena_bot_raid_at.
 */
export function processIncomingBotRaids(character, { maxRaids = BOT_RAIDS_PER_PULSE, force = false } = {}) {
  ensureSchema();
  if (!character?.id) return { raids: [], character, patch: null };

  const now = Date.now();
  const lastAt = character.arena_bot_raid_at
    ? new Date(character.arena_bot_raid_at).getTime()
    : 0;
  if (!force && lastAt && now - lastAt < BOT_RAID_COOLDOWN_MS) {
    return {
      raids: [],
      character,
      patch: null,
      skipped: true,
      retryAfterMs: BOT_RAID_COOLDOWN_MS - (now - lastAt),
    };
  }

  ensureBotPoolForPlayer(character);
  const bots = listBotsNearRating(character.arena_rating || 1000, {
    limit: Math.max(maxRaids * 3, 6),
  });
  if (!bots.length) {
    return { raids: [], character, patch: null };
  }

  // Prefer bots slightly above/below so raids feel varied.
  const shuffled = [...bots].sort(() => Math.random() - 0.5).slice(0, maxRaids);
  const raids = [];
  let live = { ...character };
  const patch = {};

  for (const bot of shuffled) {
    const freshBot = getArenaBot(bot.id) || bot;
    const result = simulateBotRaid(live, freshBot);

    const prevRating = live.arena_rating || 1000;
    const nextRating = Math.max(0, prevRating + result.playerRatingDelta);
    const prevStreak = live.arena_streak || 0;
    const newStreak = result.playerWon ? prevStreak + 1 : 0;

    patch.arena_rating = nextRating;
    patch.arena_wins = (live.arena_wins || 0) + (result.playerWon ? 1 : 0);
    patch.arena_losses = (live.arena_losses || 0) + (result.playerWon ? 0 : 1);
    patch.arena_streak = newStreak;
    patch.arena_max_streak = Math.max(live.arena_max_streak || 0, newStreak);
    patch.arena_battles = (live.arena_battles || 0) + 1;

    applyBotRatingDelta(freshBot.id, {
      won: result.botWon,
      ratingDelta: result.botRatingDelta,
    });
    const updatedBot = getArenaBot(freshBot.id);

    // Persist personal match log (defense).
    try {
      entities.ArenaMatch.create({
        character_id: live.id,
        opponent_real_id: null,
        opponent_name: freshBot.name,
        opponent_is_bot: true,
        opponent_level: freshBot.level,
        opponent_rating: freshBot.arena_rating,
        opponent_power: 0,
        opponent_class: freshBot.class,
        opponent_race: freshBot.race,
        opponent_guild: freshBot.guild,
        won: result.playerWon,
        rating_delta: result.playerRatingDelta,
        rating_after: nextRating,
        is_defense: true,
        arena_bot_id: freshBot.id,
        opponent_snapshot: {
          ...freshBot,
          isBot: true,
          arena_bot_id: freshBot.id,
        },
      });
    } catch (err) {
      console.error("[arena bots] match log failed", err?.message || err);
    }

    // Notify the player.
    try {
      tryCreateNotification({
        owner_id: live.id,
        type: "arena_defense",
        title: result.playerWon
          ? `Defended against ${freshBot.name}`
          : `${freshBot.name} raided you`,
        body: result.playerWon
          ? `You held the Arena (+${result.playerRatingDelta} rating). ${freshBot.name} is now ${updatedBot?.arena_rating ?? "?"} rating.`
          : `Lost ${Math.abs(result.playerRatingDelta)} rating. ${freshBot.name} climbs to ${updatedBot?.arena_rating ?? "?"}.`,
        related_id: freshBot.id,
        priority: "high",
        idempotency_key: `arena_defense:${live.id}:${freshBot.id}:${clock.nowIso().slice(0, 13)}`,
      });
    } catch (err) {
      console.error("[arena bots] notify failed", err?.message || err);
    }

    raids.push({
      bot: updatedBot || freshBot,
      playerWon: result.playerWon,
      playerRatingDelta: result.playerRatingDelta,
      botRatingDelta: result.botRatingDelta,
      ratingAfter: nextRating,
    });

    live = {
      ...live,
      arena_rating: nextRating,
      arena_wins: patch.arena_wins,
      arena_losses: patch.arena_losses,
      arena_streak: newStreak,
      arena_max_streak: patch.arena_max_streak,
      arena_battles: patch.arena_battles,
    };
  }

  patch.arena_bot_raid_at = new Date(now).toISOString();
  const characterUpdated = entities.Character.update(character.id, patch);

  return {
    raids,
    character: characterUpdated,
    patch,
    skipped: false,
  };
}

/** Public card shape for matchmaking UI. */
export function botToPublicOpponent(bot) {
  if (!bot) return null;
  return {
    id: bot.id,
    arena_bot_id: bot.id,
    name: bot.name,
    race: bot.race,
    class: bot.class,
    level: bot.level,
    arena_rating: bot.arena_rating,
    arena_wins: bot.arena_wins,
    arena_losses: bot.arena_losses,
    guild: bot.guild,
    appearance: bot.appearance || {},
    stats: bot.stats || {},
    isBot: true,
    speciesId: bot.speciesId,
    lastOnlineMins: Math.floor(Math.random() * 180),
  };
}
