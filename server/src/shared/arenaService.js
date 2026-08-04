/**
 * Authoritative Arena availability, offers, cooldown, and settlement helpers
 * (Restoration 16). Combat simulation lives in combatService; Elo/rewards in
 * economyFormulas; bots in arena/bots + arenaBotGenerator.
 */
import { nanoid } from "nanoid";
import { entities } from "../entities.js";
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

/** Finalized: 10-minute normal Arena cooldown. */
export const ARENA_BATTLE_COOLDOWN_MS = 10 * 60 * 1000;

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

export function findArenaOffer(character, offerId) {
  const bag = readArenaOffers(character);
  if (!bag || !offerId) return null;
  return bag.offers.find((x) => x && String(x.offer_id) === String(offerId)) || null;
}

export function publicOpponentOffer(offer) {
  if (!offer) return null;
  const opp = offer.opponent || {};
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
  };
}

function publicRankRow(ch, rank) {
  return {
    rank,
    id: ch.id, // UI alias (LeaderboardPage / Godot rows)
    character_id: ch.id,
    name: ch.name,
    level: ch.level || 1,
    class: ch.class,
    arena_rating: ch.arena_rating || 1000,
    arena_wins: ch.arena_wins || 0,
    arena_losses: ch.arena_losses || 0,
    race: ch.race,
    // Account id for same-account challenge gating (not Nakama user id).
    created_by_id: ch.created_by_id || null,
  };
}

/** Rank by arena_rating desc, then wins, then id (deterministic). */
export function computeArenaRank(characterId) {
  const all = entities.Character.filter({})
    .slice()
    .sort((a, b) => {
      const rd = (b.arena_rating || 1000) - (a.arena_rating || 1000);
      if (rd !== 0) return rd;
      const wd = (b.arena_wins || 0) - (a.arena_wins || 0);
      if (wd !== 0) return wd;
      return String(a.id).localeCompare(String(b.id));
    });
  const idx = all.findIndex((c) => c.id === characterId);
  return idx >= 0 ? idx + 1 : 0;
}

export function listArenaLeaderboard({ limit = 50, offset = 0 } = {}) {
  const all = entities.Character.filter({})
    .slice()
    .sort((a, b) => {
      const rd = (b.arena_rating || 1000) - (a.arena_rating || 1000);
      if (rd !== 0) return rd;
      const wd = (b.arena_wins || 0) - (a.arena_wins || 0);
      if (wd !== 0) return wd;
      return String(a.id).localeCompare(String(b.id));
    });
  const slice = all.slice(offset, offset + limit);
  return slice.map((c, i) => publicRankRow(c, offset + i + 1));
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
    rating: character.arena_rating || 1000,
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
 */
export function generateAndStoreArenaOffers(character, { force = false } = {}) {
  const existing = readArenaOffers(character);
  if (!force && existing?.offers?.length && existing.expires_at) {
    const exp = new Date(existing.expires_at).getTime();
    if (Number.isFinite(exp) && clock.nowMs() < exp) {
      return {
        character,
        offers: existing.offers.map(publicOpponentOffer),
        replay: true,
        expires_at: existing.expires_at,
      };
    }
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
  let realChars = pickRankedCandidates(ranked, ARENA_MAX_REAL_OPPONENTS);
  if (ranked.length > ARENA_MAX_REAL_OPPONENTS) {
    const third = ranked[ARENA_MAX_REAL_OPPONENTS];
    const gap = Math.abs((third.arena_rating || 1000) - (character.arena_rating || 1000));
    if (gap <= ARENA_RATING_BAND_WIDE) {
      realChars = pickRankedCandidates(ranked, Math.min(3, ranked.length));
    }
  }

  const realOffers = realChars.map((ch) => {
    const items = loadEquippedItemsForCharacter(ch.id);
    const opp = characterToOpponent(ch, items);
    return {
      offer_id: nanoid(12),
      matchup: "Operative",
      opponent: {
        ...opp,
        // Authoritative combatant for Prepare (full character + items).
        _combatant: { ...ch, stats: ch.stats || {} },
        _combatItems: items,
      },
    };
  });

  const needBots = Math.max(0, ARENA_CHALLENGER_SLOTS - realOffers.length);
  ensureBotPoolForPlayer(character);
  const bots = listBotsNearRating(character.arena_rating || 1000, {
    limit: needBots + 2,
  }).slice(0, needBots);

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
      offer_id: nanoid(12),
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
    const id = nanoid(10);
    const combatant = {
      id,
      name: `Operative-${id.slice(0, 4)}`,
      race: "Synthara",
      class: snap.class,
      level: snap.level,
      arena_rating: Math.max(
        0,
        (character.arena_rating || 1000) + Math.floor(Math.random() * 80) - 40,
      ),
      stats: snap.stats,
      isBot: true,
      arena_bot_id: null,
      ephemeral_bot: true,
      buildKey: snap.buildKey,
      strengthMultiplier: snap.strengthMultiplier,
    };
    botOffers.push({
      offer_id: nanoid(12),
      matchup: "Bot",
      opponent: {
        ...combatant,
        power: computePower(combatant, []),
        _combatant: combatant,
        _combatItems: [],
      },
    });
  }

  const offers = [...realOffers, ...botOffers].slice(0, ARENA_CHALLENGER_SLOTS);
  const nowIso = clock.nowIso();
  const expiresAt = new Date(clock.nowMs() + 5 * 60 * 1000).toISOString();
  const bag = {
    generated_at: nowIso,
    expires_at: expiresAt,
    offers,
  };
  const updated = entities.Character.update(character.id, {
    arena_opponent_offers: bag,
  });
  return {
    character: updated,
    offers: offers.map(publicOpponentOffer),
    replay: false,
    expires_at: expiresAt,
  };
}

/**
 * Resolve combatant from a stored offer. Rejects client-supplied stats.
 */
export function resolveOfferCombatant(character, offerId) {
  const offer = findArenaOffer(character, offerId);
  if (!offer) {
    const e = new Error("Opponent offer expired or invalid");
    e.status = 409;
    e.code = "ARENA_OFFER_INVALID";
    throw e;
  }
  const bag = readArenaOffers(character);
  if (bag?.expires_at && new Date(bag.expires_at).getTime() < clock.nowMs()) {
    const e = new Error("Opponent offer expired");
    e.status = 409;
    e.code = "ARENA_OFFER_EXPIRED";
    throw e;
  }
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
