/**
 * Authoritative Arena availability, offers, cooldown, and settlement helpers
 * (Restoration 16). Combat simulation lives in combatService; Elo/rewards in
 * economyFormulas; bots in arena/bots + arenaBotGenerator.
 */
import { nanoid } from "nanoid";
import { entities } from "../entities.js";
import { db } from "../db.js";
import { clock } from "./time/clock.js";
import {
  ARENA_DAILY_FREE_BATTLES,
  ARENA_PAID_BATTLE_COST,
  ARENA_SKIP_COST,
  ARENA_REWARDED_WINS_PER_DAY,
  getArenaRewardedWinsState,
  todayET,
} from "./economyFormulas.js";
import {
  ARENA_CHALLENGER_SLOTS,
  ARENA_MAX_REAL_OPPONENTS,
  ARENA_RATING_BAND,
  ARENA_RATING_BAND_WIDE,
  ARENA_LEVEL_BAND,
  characterToOpponent,
  rankArenaCandidates,
  pickRankedCandidates,
  computePower,
} from "../../../src/lib/arenaEngine.js";
import { loadEquippedItemsForCharacter } from "./characterAttributes.js";
import { readArenaPendingCombat } from "./combatService.js";
import {
  ensureBotPoolForPlayer,
  getArenaBot,
  listBotsNearRating,
} from "../arena/bots.js";
import { generateArenaBot } from "../../../src/lib/arenaBotGenerator.js";
import { ARENA_DEFAULT_RATING } from "../arena/config.js";

const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const ARENA_OFFER_TTL_HOURS = 2;
const ARENA_BATTLE_COOLDOWN_MINUTES = 10;
const SHUFFLE_HASH_MULTIPLIER = 33;
const SHUFFLE_LCG_MULTIPLIER = 1_664_525;
const SHUFFLE_LCG_INCREMENT = 1_013_904_223;
const UNSIGNED_32_BIT_RANGE = 4_294_967_296;
const PREFERRED_BOT_QUERY_BUFFER = 6;
const FALLBACK_BOT_QUERY_BUFFER = 8;
const DEFAULT_ARENA_LEADERBOARD_LIMIT = 50;
const ARENA_OFFER_ID_LENGTH = 12;
const EPHEMERAL_BOT_ID_LENGTH = 10;
const EPHEMERAL_BOT_NAME_ID_LENGTH = 4;
const EPHEMERAL_BOT_RATING_VARIANCE = 40;
const ARENA_RANK_SORT = Object.freeze([
  { field: "arena_rating", direction: "desc", defaultValue: ARENA_DEFAULT_RATING, cast: "integer", nullable: false },
  { field: "arena_wins", direction: "desc", defaultValue: 0, cast: "integer", nullable: false },
  { field: "id", direction: "asc", collation: "nocase", nullable: false },
]);

/** Challenger board lifetime (offer snapshots). */
export const ARENA_OFFER_TTL_MS = ARENA_OFFER_TTL_HOURS
  * MINUTES_PER_HOUR
  * SECONDS_PER_MINUTE
  * MILLISECONDS_PER_SECOND;

function shuffleArenaOffers(offers) {
  const out = Array.isArray(offers) ? offers.slice() : [];
  // Deterministic per board so cached real-first packs are reordered once,
  // not re-rolled on every GetArenaOpponents / lobby tick.
  let seed = 1;
  for (const row of out) {
    const id = String(row?.offer_id || "");
    for (let i = 0; i < id.length; i += 1) {
      seed = (seed * SHUFFLE_HASH_MULTIPLIER + id.charCodeAt(i)) >>> 0;
    }
  }
  if (seed === 0) seed = 1;
  const rand = () => {
    seed = (Math.imul(seed, SHUFFLE_LCG_MULTIPLIER) + SHUFFLE_LCG_INCREMENT) >>> 0;
    return seed / UNSIGNED_32_BIT_RANGE;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** @deprecated Manual refresh removed — alias kept for older imports. */
export const ARENA_REFRESH_MS = ARENA_OFFER_TTL_MS;

/** Finalized: 10-minute normal Arena cooldown. */
export const ARENA_BATTLE_COOLDOWN_MS = ARENA_BATTLE_COOLDOWN_MINUTES
  * SECONDS_PER_MINUTE
  * MILLISECONDS_PER_SECOND;

/** Client fields that must never drive settlement (stripped / rejected). */
const CLIENT_STRIP = [
  "won",
  "winner",
  "rating",
  "rating_delta",
  "arena_rating",
  "arena_rating_delta",
  "rank",
  "stardust",
  "stardust_reward",
  "rewarded_wins",
  "arena_rewarded_wins_today",
  "cooldown",
  "arena_cooldown_at",
  "bot_level",
  "bot_stats",
  "bot_class",
  "strengthMultiplier",
  "combat_result",
  "events",
];

const CLIENT_HARD_REJECT = ["rng_seed", "seed", "production_rng_seed"];

/**
 * Strip client-authoritative settlement fields. Hard-reject RNG seed control.
 * Settlement always uses pending combat / server formulas — never body.won.
 */
export function assertArenaClientSafe(body = {}) {
  if (!body || typeof body !== "object") return;
  for (const k of CLIENT_HARD_REJECT) {
    if (Object.prototype.hasOwnProperty.call(body, k) && body[k] != null) {
      const e = new Error(`Client may not supply ${k}`);
      e.status = 400;
      e.code = "ARENA_CLIENT_AUTHORITY_REJECTED";
      throw e;
    }
  }
  for (const k of CLIENT_STRIP) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      delete body[k];
    }
  }
}

/** Cooldown start = last battle ISO; available when start + duration elapsed. */
export function arenaCooldownEndsMs(character, nowMs = clock.nowMs()) {
  void nowMs;
  const raw = character?.arena_cooldown_at;
  if (!raw) return 0;
  const start = new Date(raw).getTime();
  if (!Number.isFinite(start) || start <= 0) return 0;
  return start + ARENA_BATTLE_COOLDOWN_MS;
}

export function isArenaCooldownActive(character, nowMs = clock.nowMs()) {
  const ends = arenaCooldownEndsMs(character, nowMs);
  return ends > 0 && nowMs < ends;
}

export function assertArenaCooldownClear(character, { skip = false } = {}) {
  if (skip) return;
  if (isArenaCooldownActive(character)) {
    const e = new Error("Arena cooldown active");
    e.status = 429;
    e.code = "ARENA_COOLDOWN";
    e.details = { available_at: new Date(arenaCooldownEndsMs(character)).toISOString() };
    throw e;
  }
}

export function assertArenaCooldownActive(character) {
  if (!isArenaCooldownActive(character)) {
    const e = new Error("No active Arena cooldown to skip");
    e.status = 400;
    e.code = "ARENA_NO_COOLDOWN";
    throw e;
  }
}

export function buildArenaCooldownPatch(nowIso = clock.nowIso()) {
  return {
    arena_cooldown_at: nowIso,
    arena_last_battle_at: nowIso,
  };
}

export function clearArenaCooldownPatch() {
  return {
    arena_cooldown_at: null,
    arena_last_battle_at: null,
  };
}

export function readArenaOffers(character) {
  const o = character?.arena_opponent_offers;
  if (!o || typeof o !== "object" || !Array.isArray(o.offers)) return null;
  return o;
}

/**
 * True when the challenger board should be reminted:
 * missing/empty, past TTL, player leveled, or a real foe on the board leveled.
 */
export function arenaOffersNeedRemint(character, nowMs = clock.nowMs()) {
  const bag = readArenaOffers(character);
  if (!bag || !Array.isArray(bag.offers) || bag.offers.length === 0) return true;
  if (bag.expires_at) {
    const exp = new Date(bag.expires_at).getTime();
    if (Number.isFinite(exp) && nowMs >= exp) return true;
  } else {
    return true;
  }
  const boardPlayerLevel = Number(bag.player_level);
  const livePlayerLevel = Number(character?.level) || 1;
  if (Number.isFinite(boardPlayerLevel) && boardPlayerLevel !== livePlayerLevel) {
    return true;
  }
  // Legacy bags without player_level: remint once so snapshots stay honest.
  if (!Number.isFinite(boardPlayerLevel)) return true;

  for (const offer of bag.offers) {
    const opp = offer?.opponent || {};
    const realId = String(opp.realCharacterId || opp.character_id || "").trim();
    if (!realId) continue; // bots don't level up
    const live = entities.Character.get(realId);
    if (!live) continue;
    const snapLevel = Number(
      opp.level
      ?? opp._combatant?.level
      ?? NaN,
    );
    const liveLevel = Number(live.level) || 1;
    if (Number.isFinite(snapLevel) && snapLevel !== liveLevel) {
      return true;
    }
  }
  return false;
}

/** Remint board quietly and return public offers (for prepare / open). */
export function remintArenaOffersPreferringPrevious(character) {
  const bag = readArenaOffers(character);
  const previousIds = (bag?.offers || []).flatMap(arenaOpponentIdentityIds);
  return generateAndStoreArenaOffers(character, {
    force: true,
    preferExcludeIds: previousIds,
  });
}

/** How many recently shown/fought opponent ids to remember for deprioritization. */
export const ARENA_RECENT_OPPONENT_HISTORY = 10;

/** Collect stable identity keys for an offer / public opponent card. */
export function arenaOpponentIdentityIds(offerOrOpp) {
  const opp = offerOrOpp?.opponent || offerOrOpp || {};
  const ids = [];
  if (opp.realCharacterId) ids.push(String(opp.realCharacterId));
  if (opp.character_id) ids.push(String(opp.character_id));
  if (opp.arena_bot_id) ids.push(String(opp.arena_bot_id));
  if (opp.id && !String(opp.id).startsWith("bot-ephemeral")) ids.push(String(opp.id));
  return [...new Set(ids.filter(Boolean))];
}

function readRecentOpponentIds(character) {
  const raw = character?.arena_recent_opponent_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || "")).filter(Boolean);
}

function mergeRecentOpponentIds(previous, newlyShown) {
  const out = [];
  const seen = new Set();
  for (const id of [...newlyShown, ...previous]) {
    const key = String(id || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= ARENA_RECENT_OPPONENT_HISTORY) break;
  }
  return out;
}

/**
 * Prefer candidates outside softExclude; always honor hardExclude when pool allows.
 * Falls back to soft-excluded ids only when needed to fill `count`.
 */
function pickCandidatesWithExclusions(ranked, count, hardExclude, softExclude) {
  const hard = hardExclude instanceof Set ? hardExclude : new Set(hardExclude || []);
  const soft = softExclude instanceof Set ? softExclude : new Set(softExclude || []);
  const notHard = ranked.filter((c) => c && !hard.has(String(c.id)));
  const preferred = notHard.filter((c) => !soft.has(String(c.id)));
  let picked = pickRankedCandidates(preferred, count);
  if (picked.length < count) {
    const pickedIds = new Set(picked.map((c) => String(c.id)));
    const fallbackPool = notHard.filter((c) => !pickedIds.has(String(c.id)));
    picked = [
      ...picked,
      ...pickRankedCandidates(fallbackPool, count - picked.length),
    ];
  }
  // Last resort: if hard-exclude emptied the pool (tiny population), allow hard ids
  // except we still try to keep at least one non-hard when possible.
  if (picked.length < count) {
    const pickedIds = new Set(picked.map((c) => String(c.id)));
    const rest = ranked.filter((c) => c && !pickedIds.has(String(c.id)));
    picked = [...picked, ...pickRankedCandidates(rest, count - picked.length)];
  }
  return picked;
}

function pickBotsWithExclusions(character, needBots, hardExclude, softExclude) {
  if (needBots <= 0) return [];
  ensureBotPoolForPlayer(character);
  const hard = [...hardExclude].map(String);
  const soft = [...softExclude].map(String);
  let bots = listBotsNearRating(character.arena_rating || ARENA_DEFAULT_RATING, {
    limit: needBots + PREFERRED_BOT_QUERY_BUFFER,
    excludeIds: [...hard, ...soft],
  });
  if (bots.length < needBots) {
    const more = listBotsNearRating(character.arena_rating || ARENA_DEFAULT_RATING, {
      limit: needBots + FALLBACK_BOT_QUERY_BUFFER,
      excludeIds: hard,
    });
    const seen = new Set(bots.map((b) => b.id));
    for (const b of more) {
      if (seen.has(b.id)) continue;
      bots.push(b);
      seen.add(b.id);
      if (bots.length >= needBots) break;
    }
  }
  return bots.slice(0, needBots);
}

export function findArenaOffer(character, offerId) {
  const bag = readArenaOffers(character);
  if (!bag || !offerId) return null;
  return bag.offers.find((x) => x && String(x.offer_id) === String(offerId)) || null;
}

export function publicOpponentOffer(offer) {
  if (!offer) return null;
  const opp = offer.opponent || {};
  const stats =
    (opp.display_stats && typeof opp.display_stats === "object" && opp.display_stats)
    || (opp.stats && typeof opp.stats === "object" && opp.stats)
    || null;
  return {
    offer_id: offer.offer_id,
    id: opp.id || offer.offer_id,
    name: opp.name,
    level: opp.level,
    class: opp.class,
    race: opp.race,
    arena_rating: opp.arena_rating,
    arena_wins: opp.arena_wins,
    arena_losses: opp.arena_losses,
    power: opp.power,
    guild: opp.guild,
    appearance: opp.appearance || null,
    avatar_url: opp.avatar_url || null,
    isBot: !!opp.isBot,
    is_bot: !!opp.isBot,
    arena_bot_id: opp.arena_bot_id || null,
    realCharacterId: opp.realCharacterId || null,
    character_id: opp.realCharacterId || null,
    lastOnlineMins: opp.lastOnlineMins,
    matchup: offer.matchup || (opp.isBot ? "Bot" : "Operative"),
    stats: stats || undefined,
    display_stats: stats || undefined,
    equippedItems: Array.isArray(opp.equippedItems) ? opp.equippedItems : undefined,
  };
}

function publicRankRow(ch, rank, guildTag = "") {
  return {
    rank,
    id: ch.id, // UI alias (LeaderboardPage / Godot rows)
    character_id: ch.id,
    name: ch.name,
    level: ch.level || 1,
    class: ch.class,
    arena_rating: ch.arena_rating || ARENA_DEFAULT_RATING,
    arena_wins: ch.arena_wins || 0,
    arena_losses: ch.arena_losses || 0,
    race: ch.race,
    // Account id for same-account challenge gating (not Nakama user id).
    created_by_id: ch.created_by_id || null,
    guild_tag: guildTag,
  };
}

function guildTagsForCharacters(characters) {
  const characterIds = [...new Set(characters.map((character) => character?.id).filter(Boolean))];
  if (characterIds.length === 0) return new Map();
  const memberships = entities.GuildMember.filter(
    { character_id: { $in: characterIds } },
    "-created_date",
    characterIds.length,
  );
  const guildIds = [...new Set(memberships.map((membership) => membership.guild_id).filter(Boolean))];
  const guilds = guildIds.length > 0
    ? entities.Guild.filter({ id: { $in: guildIds } }, null, guildIds.length)
    : [];
  const tagByGuildId = new Map(guilds.map((guild) => [
    guild.id,
    String(guild.tag || guild.name || ""),
  ]));
  return new Map(memberships.map((membership) => [
    membership.character_id,
    tagByGuildId.get(membership.guild_id) || "",
  ]));
}

/** Rank by arena_rating desc, then wins, then id (deterministic). */
export function computeArenaRank(characterId) {
  const character = entities.Character.get(characterId);
  if (!character) return 0;
  const rating = Number(character.arena_rating) || ARENA_DEFAULT_RATING;
  const wins = Number(character.arena_wins) || 0;
  const before = db.prepare(`
    SELECT COUNT(*) AS count
    FROM entities
    WHERE type = 'Character' AND (
      CAST(COALESCE(json_extract(data, '$.arena_rating'), ${ARENA_DEFAULT_RATING}) AS INTEGER) > ?
      OR (
        CAST(COALESCE(json_extract(data, '$.arena_rating'), ${ARENA_DEFAULT_RATING}) AS INTEGER) = ?
        AND CAST(COALESCE(json_extract(data, '$.arena_wins'), 0) AS INTEGER) > ?
      )
      OR (
        CAST(COALESCE(json_extract(data, '$.arena_rating'), ${ARENA_DEFAULT_RATING}) AS INTEGER) = ?
        AND CAST(COALESCE(json_extract(data, '$.arena_wins'), 0) AS INTEGER) = ?
        AND id COLLATE NOCASE < ? COLLATE NOCASE
      )
    )
  `).get(rating, rating, wins, rating, wins, character.id);
  return Number(before?.count || 0) + 1;
}

export function listArenaLeaderboard({ limit = DEFAULT_ARENA_LEADERBOARD_LIMIT, offset = 0 } = {}) {
  const page = entities.Character.ranked(ARENA_RANK_SORT, limit, offset);
  const guildTags = guildTagsForCharacters(page);
  return page.map((character, index) => publicRankRow(
    character,
    offset + index + 1,
    guildTags.get(character.id) || "",
  ));
}

export function serializeArenaState(character, nowMs = clock.nowMs(), today = todayET()) {
  const rewarded = getArenaRewardedWinsState(character, today);
  let freeLeft = character.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
  let attemptsDate = character.arena_attempts_date;
  if (attemptsDate !== today) {
    freeLeft = ARENA_DAILY_FREE_BATTLES;
    attemptsDate = today;
  }
  const cooldownEnds = arenaCooldownEndsMs(character, nowMs);
  const available = !isArenaCooldownActive(character, nowMs);
  const pending = readArenaPendingCombat(character);
  const rank = computeArenaRank(character.id);
  return {
    rating: character.arena_rating || ARENA_DEFAULT_RATING,
    rank_position: rank,
    rank,
    wins: character.arena_wins || 0,
    losses: character.arena_losses || 0,
    win_streak: character.arena_streak || 0,
    battles: character.arena_battles || 0,
    battles_today: character.arena_battles_today || 0,
    daily_attempt_limit: ARENA_DAILY_FREE_BATTLES,
    attempts_remaining: freeLeft,
    arena_attempts_left: freeLeft,
    arena_attempts_date: attemptsDate,
    available,
    cooldown_active: !available,
    cooldown_ms: ARENA_BATTLE_COOLDOWN_MS,
    arena_cooldown_at: character.arena_cooldown_at || null,
    arena_last_battle_at: character.arena_last_battle_at || null,
    next_battle_at: cooldownEnds > 0 ? new Date(cooldownEnds).toISOString() : null,
    available_at: cooldownEnds > 0 ? new Date(cooldownEnds).toISOString() : null,
    rewarded_wins_today: rewarded.wins,
    rewarded_wins_remaining: Math.max(0, ARENA_REWARDED_WINS_PER_DAY - rewarded.wins),
    rewarded_wins_cap: ARENA_REWARDED_WINS_PER_DAY,
    reward_cap_reached: rewarded.wins >= ARENA_REWARDED_WINS_PER_DAY,
    game_day: today,
    paid_battle_cost: ARENA_PAID_BATTLE_COST,
    skip_cooldown_cost: ARENA_SKIP_COST,
    pending_combat_id: pending?.combat_id || null,
    pending_match: pending
      ? {
          combat_id: pending.combat_id,
          winner: pending.winner,
          offer_id: pending.meta?.offer_id || null,
        }
      : null,
    server_time_ms: nowMs,
  };
}

/**
 * Build stable opponent offers: prefer real players, fill with ladder bots.
 * Stores full combat snapshots server-side; returns public cards only.
 *
 * @param {object} character
 * @param {{ force?: boolean, excludeIds?: string[], preferExcludeIds?: string[] }} [opts]
 *   force — ignore unexpired cache and mint a new board
 *   excludeIds — hard-exclude when enough alternatives exist (e.g. just-fought)
 *   preferExcludeIds — soft-exclude (previous board / recent history)
 */
export function generateAndStoreArenaOffers(character, {
  force = false,
  excludeIds = [],
  preferExcludeIds = [],
} = {}) {
  const existing = readArenaOffers(character);
  const previousBoardIds = (existing?.offers || []).flatMap(arenaOpponentIdentityIds);
  if (!force && !arenaOffersNeedRemint(character)) {
    console.log("[ArenaOffers]", JSON.stringify({
      mode: "replay_cache",
      previousContenderIds: previousBoardIds,
      opponentFought: excludeIds,
      eligiblePoolSize: null,
      excludedIds: excludeIds,
      newlySelectedContenderIds: previousBoardIds,
    }));
    return {
      character,
      offers: existing.offers.map(publicOpponentOffer),
      replay: true,
      expires_at: existing.expires_at,
    };
  }

  const myId = character.id;
  const others = entities.Character.filter({}).filter(
    (c) => c && c.id !== myId && c.created_by_id !== character.created_by_id,
  );
  const ranked = rankArenaCandidates(character, others, {
    levelBand: ARENA_LEVEL_BAND,
    tightBand: ARENA_RATING_BAND,
    wideBand: ARENA_RATING_BAND_WIDE,
  });

  const recent = readRecentOpponentIds(character);
  const hardExclude = new Set(
    [...(excludeIds || [])].map((x) => String(x || "")).filter(Boolean),
  );
  // Soft: previous board + recent history + caller prefer list (never reshuffle same 3).
  const softExclude = new Set(
    [
      ...previousBoardIds,
      ...recent,
      ...(preferExcludeIds || []),
    ]
      .map((x) => String(x || ""))
      .filter(Boolean),
  );

  let realTarget = ARENA_MAX_REAL_OPPONENTS;
  if (ranked.length > ARENA_MAX_REAL_OPPONENTS) {
    const third = ranked[ARENA_MAX_REAL_OPPONENTS];
    const gap = Math.abs(
      (third.arena_rating || ARENA_DEFAULT_RATING)
        - (character.arena_rating || ARENA_DEFAULT_RATING),
    );
    if (gap <= ARENA_RATING_BAND_WIDE) {
      realTarget = Math.min(ARENA_CHALLENGER_SLOTS, ranked.length);
    }
  }

  const realChars = pickCandidatesWithExclusions(
    ranked,
    realTarget,
    hardExclude,
    softExclude,
  );

  const realOffers = realChars.map((ch) => {
    const items = loadEquippedItemsForCharacter(ch.id);
    const opp = characterToOpponent(ch, items);
    return {
      offer_id: nanoid(ARENA_OFFER_ID_LENGTH),
      matchup: "Operative",
      opponent: {
        ...opp,
        _combatant: { ...ch, stats: ch.stats || {} },
        _combatItems: items,
      },
    };
  });

  const needBots = Math.max(0, ARENA_CHALLENGER_SLOTS - realOffers.length);
  const bots = pickBotsWithExclusions(character, needBots, hardExclude, softExclude);

  const botOffers = bots.map((bot) => {
    const combatant = {
      id: bot.id,
      name: bot.name,
      race: bot.race,
      class: bot.class,
      level: bot.level,
      arena_rating: bot.arena_rating,
      arena_wins: bot.arena_wins,
      arena_losses: bot.arena_losses,
      stats: bot.stats || {},
      appearance: bot.appearance,
      isBot: true,
      arena_bot_id: bot.id,
      guild: bot.guild,
    };
    const power = computePower(combatant, []);
    return {
      offer_id: nanoid(ARENA_OFFER_ID_LENGTH),
      matchup: "Bot",
      opponent: {
        ...combatant,
        id: `bot-${bot.id}`,
        power,
        lastOnlineMins: 0,
        _combatant: combatant,
        _combatItems: [],
      },
    };
  });

  // Ephemeral generateArenaBot fill if ladder empty (still server-side).
  while (realOffers.length + botOffers.length < ARENA_CHALLENGER_SLOTS) {
    const snap = generateArenaBot({ playerLevel: character.level || 1 });
    const id = nanoid(EPHEMERAL_BOT_ID_LENGTH);
    const combatant = {
      id,
      name: `Operative-${id.slice(0, EPHEMERAL_BOT_NAME_ID_LENGTH)}`,
      race: "Synthara",
      class: snap.class,
      level: snap.level,
      arena_rating: Math.max(
        0,
        (character.arena_rating || ARENA_DEFAULT_RATING)
          + Math.floor(Math.random() * EPHEMERAL_BOT_RATING_VARIANCE * 2)
          - EPHEMERAL_BOT_RATING_VARIANCE,
      ),
      stats: snap.stats,
      isBot: true,
      arena_bot_id: null,
      ephemeral_bot: true,
      buildKey: snap.buildKey,
      strengthMultiplier: snap.strengthMultiplier,
    };
    botOffers.push({
      offer_id: nanoid(ARENA_OFFER_ID_LENGTH),
      matchup: "Bot",
      opponent: {
        ...combatant,
        power: computePower(combatant, []),
        _combatItems: [],
        _combatant: combatant,
      },
    });
  }

  const packed = [...realOffers, ...botOffers].slice(0, ARENA_CHALLENGER_SLOTS);
  const offers = shuffleArenaOffers(packed);
  const newlySelected = offers.flatMap(arenaOpponentIdentityIds);
  const nowIso = clock.nowIso();
  const expiresAt = new Date(clock.nowMs() + ARENA_OFFER_TTL_MS).toISOString();
  const bag = {
    generated_at: nowIso,
    expires_at: expiresAt,
    player_level: Math.max(1, Number(character.level) || 1),
    offers,
  };
  const nextRecent = mergeRecentOpponentIds(recent, [
    ...newlySelected,
    ...[...hardExclude],
  ]);

  console.log("[ArenaOffers]", JSON.stringify({
    mode: "mint",
    previousContenderIds: previousBoardIds,
    opponentFought: [...hardExclude],
    eligiblePoolSize: ranked.length,
    excludedIds: [...hardExclude],
    softExcludedIds: [...softExclude],
    newlySelectedContenderIds: newlySelected,
  }));

  const updated = entities.Character.update(character.id, {
    arena_opponent_offers: bag,
    arena_recent_opponent_ids: nextRecent,
  });
  return {
    character: updated,
    offers: offers.map(publicOpponentOffer),
    replay: false,
    expires_at: expiresAt,
    debug: {
      previousContenderIds: previousBoardIds,
      opponentFought: [...hardExclude],
      eligiblePoolSize: ranked.length,
      excludedIds: [...hardExclude],
      newlySelectedContenderIds: newlySelected,
    },
  };
}

/**
 * After a completed Arena fight: mint a fresh 3-pack, hard-excluding the fought
 * opponent and soft-excluding the previous board / recent history.
 */
export function refreshArenaOffersAfterBattle(character, foughtOpponentId = "") {
  const bag = readArenaOffers(character);
  const previousIds = (bag?.offers || []).flatMap(arenaOpponentIdentityIds);
  const fought = String(foughtOpponentId || "").trim();
  return generateAndStoreArenaOffers(character, {
    force: true,
    excludeIds: fought ? [fought] : [],
    preferExcludeIds: previousIds,
  });
}

/**
 * Resolve combatant from a stored offer. Rejects client-supplied stats.
 *
 * - Offer present → honor it (TTL / level remints belong on GetArenaOpponents / post-fight).
 * - Offer missing + board due for remint → remint, then ask client to pick again.
 * - Offer missing + board still valid → return current board without reminting
 *   (stale client / race). Reminting here was wiping the live board and soft-excluding
 *   the foe the player just clicked.
 */
export function resolveOfferCombatant(character, offerId) {
  const offer = findArenaOffer(character, offerId);
  if (!offer) {
    if (arenaOffersNeedRemint(character)) {
      const reminted = remintArenaOffersPreferringPrevious(character);
      const e = new Error("Challengers updated — pick again");
      e.status = 409;
      e.code = "ARENA_BOARD_REFRESHED";
      e.character = reminted.character;
      e.opponents = reminted.offers;
      e.expires_at = reminted.expires_at;
      e.arena = serializeArenaState(reminted.character, clock.nowMs());
      throw e;
    }
    const bag = readArenaOffers(character);
    const e = new Error("Challengers updated — pick again");
    e.status = 409;
    e.code = "ARENA_BOARD_REFRESHED";
    e.character = character;
    e.opponents = Array.isArray(bag?.offers) ? bag.offers.map(publicOpponentOffer) : [];
    e.expires_at = bag?.expires_at || null;
    e.arena = serializeArenaState(character, clock.nowMs());
    throw e;
  }
  const bag = readArenaOffers(character);
  void bag;
  const opp = offer.opponent || {};
  let combatant = opp._combatant;
  let items = opp._combatItems || [];

  if (opp.realCharacterId) {
    const live = entities.Character.get(opp.realCharacterId);
    if (!live) {
      const e = new Error("Opponent unavailable");
      e.status = 404;
      e.code = "ARENA_OPPONENT_UNAVAILABLE";
      throw e;
    }
    if (live.id === character.id) {
      const e = new Error("Cannot fight yourself");
      e.status = 400;
      e.code = "ARENA_SELF_MATCH";
      throw e;
    }
    if (live.created_by_id === character.created_by_id) {
      const e = new Error("Cannot fight your own account");
      e.status = 400;
      e.code = "ARENA_SAME_ACCOUNT";
      throw e;
    }
    // Preserve offer-time snapshot if present; else live (defense snapshot policy: offer-captured).
    if (!combatant) {
      combatant = { ...live };
      items = loadEquippedItemsForCharacter(live.id);
    }
  } else if (opp.arena_bot_id) {
    const bot = getArenaBot(opp.arena_bot_id);
    if (!bot && !combatant) {
      const e = new Error("Bot opponent unavailable");
      e.status = 404;
      e.code = "ARENA_BOT_UNAVAILABLE";
      throw e;
    }
    if (!combatant && bot) {
      combatant = {
        id: bot.id,
        name: bot.name,
        race: bot.race,
        class: bot.class,
        level: bot.level,
        arena_rating: bot.arena_rating,
        stats: bot.stats || {},
        isBot: true,
        arena_bot_id: bot.id,
      };
      items = [];
    }
  }

  if (!combatant) {
    const e = new Error("Opponent snapshot missing");
    e.status = 409;
    e.code = "ARENA_SNAPSHOT_MISSING";
    throw e;
  }

  return {
    offer,
    combatant,
    items,
    publicOpponent: publicOpponentOffer(offer),
    arena_bot_id: opp.arena_bot_id || combatant.arena_bot_id || null,
    realCharacterId: opp.realCharacterId || null,
    isBot: !!opp.isBot || !!combatant.isBot,
  };
}

export {
  ARENA_DAILY_FREE_BATTLES,
  ARENA_PAID_BATTLE_COST,
  ARENA_SKIP_COST,
  ARENA_REWARDED_WINS_PER_DAY,
};
