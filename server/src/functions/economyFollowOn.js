/**
 * Critical #2 follow-on economy handlers (arena/dungeon/ship/mining/casino/slots/weekly/guild).
 */
import { entities } from "../entities.js";
import { withTransactionAsync, db, nowIso } from "../db.js";
import { getUserById } from "../auth.js";
import { randomItem } from "../shared/rewards.js";
import { getCollectionPercentage, applyXpBonus } from "../shared/collectionBonus.js";
import { mergeDiscoveredGear } from "../shared/discovery.js";
import { mergeAchievementUnlocks } from "../shared/achievements.js";
import { collectGrant, grantItemOrPending, countBagOccupancy } from "../shared/inventoryGrant.js";
import {
  acceptServerPendingLoot,
  dissolveServerPendingLoot,
} from "../rewards/pending.js";
import {
  todayET,
  applyXpToCharacter,
  rollItemRarity,
  randomConsumable,
  getInventoryCap,
  computeStardustValue,
  clampStardust,
  FUEL_MAX,
  STARTER_SHIP,
  SHIP_TYPES,
  SHIP_MODS,
  getActiveShipId,
  getShipModIds,
  getTierCost,
  getNextModTier,
  computeMaxFuelForLoadout,
  ARENA_DAILY_FREE_BATTLES,
  ARENA_PAID_BATTLE_COST,
  ARENA_REFRESH_COST,
  ARENA_SKIP_COST,
  computeArenaRewards,
  DUNGEON_ENEMIES_PER_PLANET,
  DUNGEON_DEATHS_PER_DAY,
  DUNGEON_CONTINUE_COST,
  DUNGEON_SKIP_COST,
  DUNGEON_PATROL_REWARD_MULT,
  DUNGEON_MILESTONE_EVERY,
  DUNGEON_STORY_PLANETS,
  getEnemyDru,
  getDungeonEnemyLevel,
  druToRewards,
  dungeonCooldownMs,
  grantFrontierShipMod,
  isDungeonUnlockedByLevel,
  getDungeonUnlockLevel,
  computeMiningReward,
  WEEKLY_NOVA_QUESTS,
  ensureWeeklyNovaState,
  progressWeeklyNovaQuest,
  NOVA_CASINO_OPEN,
  CASINO_MAX_NOVA_BET,
  CASINO_WHEEL_TIERS,
  getCasinoMaxStardustBet,
  GUILD_CREATE_COST,
  GUILD_WAR_DECLARE_COST,
  GUILD_WAR_READY_HOURS,
  CHARACTER_SLOT_COST,
  CHARACTER_MAX_SLOTS,
  SCOUT_MILESTONE_LEVEL,
  SCOUT_MILESTONE_MOD_ID,
  NAME_CHANGE_COST,
  GUILD_WAR_SIM_COST,
} from "../shared/economyFormulas.js";
import { assertNameHasNoDigits } from "../shared/nameRules.js";
import {
  grantEntitlement,
  resolveCharacterSlotCapacity,
  consumeEntitlement,
  resolveQuantity,
  EntitlementErrors,
} from "../entitlements/index.js";
import {
  completeDirectChallenge,
  settleBotAsOpponent,
} from "../arena/index.js";
import { ArenaError } from "../arena/errors.js";
import {
  auditCasinoSettle,
  auditMiningEvent,
  auditDungeonBattle,
  newCorrelationId,
} from "../audit/index.js";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

function syncPurchasedSlotsColumn(accountId) {
  const slots = resolveCharacterSlotCapacity(accountId);
  const purchased = Math.max(0, slots.capacity - slots.base);
  db.prepare("UPDATE users SET purchased_slots = ?, updated_date = ? WHERE id = ?").run(
    purchased,
    nowIso(),
    accountId
  );
  return { ...slots, purchased };
}

/** Prefer user's active_character_id when owned; else newest character. */
export function requireMyChar(user) {
  const list = entities.Character.filter({ created_by_id: user.id }, "-created_date", 50);
  if (!list.length) httpErr(404, "No character");
  const activeId = user.active_character_id;
  if (activeId) {
    const active = list.find((c) => c.id === activeId);
    if (active) return active;
  }
  return list[0];
}

function wrap(fn) {
  return async (user, body) => {
    try {
      const result = await withTransactionAsync(async () => fn(user, body || {}));
      return { status: 200, body: result };
    } catch (err) {
      if (err.status) return { status: err.status, body: { error: err.message, code: err.code } };
      if (err.code && String(err.code).startsWith("ENTITLEMENT_")) {
        return { status: 400, body: { error: err.message, code: err.code } };
      }
      throw err;
    }
  };
}

function grantOrCompensate(ch, itemPayload, _patch) {
  return grantItemOrPending(ch, itemPayload);
}

function stripShopNoise(item) {
  if (!item) return null;
  const { _cost, _slotId, cost, nova_cost, ...rest } = item;
  return rest;
}

function mergeSpeciesDiscovery(ch, patch, speciesId) {
  if (speciesId == null) return;
  const id = Number(speciesId);
  if (!Number.isFinite(id) || id < 1) return;
  const disc = [...(patch.discovered_species || ch.discovered_species || [])];
  if (!disc.includes(id) && !disc.includes(String(id))) {
    disc.push(id);
    patch.discovered_species = disc;
  }
}

// ── Arena ────────────────────────────────────────────────────
export const SyncArenaDay = wrap((user) => {
  const ch = requireMyChar(user);
  const today = todayET();
  let left = ch.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
  if (ch.arena_attempts_date === today) {
    return { success: true, patched: false, arena_attempts_left: left, arena_attempts_date: today, character: ch };
  }
  left = ARENA_DAILY_FREE_BATTLES;
  const patch = { arena_attempts_left: left, arena_attempts_date: today };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patched: true, patch, character };
});

export const RefreshArenaOpponents = wrap((user, body) => {
  const ch = requireMyChar(user);
  const charge = !!body.charge;
  if (!charge) {
    return { success: true, charged: false, character: ch };
  }
  if ((ch.stardust || 0) < ARENA_REFRESH_COST) httpErr(400, "Not enough stardust");
  const patch = { stardust: (ch.stardust || 0) - ARENA_REFRESH_COST };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, charged: true, cost: ARENA_REFRESH_COST, patch, character };
});

export const SkipArenaCooldown = wrap((user) => {
  const ch = requireMyChar(user);
  if ((ch.nova_crystals || 0) < ARENA_SKIP_COST) httpErr(400, "Not enough Nova Crystals");
  const patch = {
    nova_crystals: (ch.nova_crystals || 0) - ARENA_SKIP_COST,
    arena_cooldown_at: null,
    arena_last_battle_at: null,
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character };
});

export const FinishArenaBattle = wrap((user, body) => {
  // Direct challenges: settle rating via challenge snapshot (idempotent), then apply economy.
  if (body.challenge_id || body.challengeId) {
    const challengeId = body.challenge_id || body.challengeId;
    let dc;
    try {
      dc = completeDirectChallenge(user, {
        challengeId,
        won: !!body.won,
        policyVersion: body.policyVersion,
      });
    } catch (err) {
      if (err instanceof ArenaError) httpErr(err.status || 400, err.message, err.code);
      throw err;
    }

    const ch = dc.character || requireMyChar(user);
    const won = !!body.won;
    const today = todayET();
    let freeLeft = ch.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
    let attemptsDate = ch.arena_attempts_date;
    if (attemptsDate !== today) {
      freeLeft = ARENA_DAILY_FREE_BATTLES;
      attemptsDate = today;
    }
    // On idempotent replay of challenge completion, skip re-consuming free attempts / nova.
    if (dc.replayed) {
      return {
        success: true,
        rewards: {
          won,
          free: false,
          experience: 0,
          stardust: 0,
          arena_rating_delta: dc.ratingDelta,
          direct_challenge: true,
          replayed: true,
        },
        is_free: false,
        nova_spent: 0,
        patch: {},
        character: ch,
        challenge_id: challengeId,
        newly_unlocked: [],
        replayed: true,
      };
    }

    const isFree = body.is_free != null ? !!body.is_free : freeLeft > 0;
    const useFree = isFree && freeLeft > 0;
    const skipCooldown = !!body.skip_cooldown || !!body.skipped;
    let novaCost = 0;
    if (skipCooldown) novaCost += ARENA_SKIP_COST;
    if (!useFree) novaCost += ARENA_PAID_BATTLE_COST;
    if (novaCost > 0 && (ch.nova_crystals || 0) < novaCost) httpErr(400, "Not enough Nova Crystals");

    // Economy rewards scaled down for zero-rating / reduced farming wins.
    const ratingEligible = (dc.ratingDelta || 0) > 0 || !won;
    const rewardMult = !won ? 0 : ratingEligible ? 1 : 0.25;
    const baseRewards = computeArenaRewards(
      ch,
      { arena_rating: dc.challenge?.opponentRatingAtStart || 1000 },
      won,
      useFree
    );
    const experience = Math.round((baseRewards.experience || 0) * rewardMult);
    const stardust = Math.round((baseRewards.stardust || 0) * rewardMult);
    const collectPct = getCollectionPercentage(ch, 0);
    const boostedXp = won ? applyXpBonus(experience, collectPct) : 0;

    const patch = { ...(dc.patch || {}) };
    applyXpToCharacter(ch, boostedXp, patch);
    if (stardust > 0) {
      patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + stardust;
      patch.total_stardust_earned =
        (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + stardust;
    }
    patch.arena_attempts_left = Math.max(0, freeLeft - (useFree ? 1 : 0));
    patch.arena_attempts_date = attemptsDate;
    if (novaCost > 0) {
      patch.nova_crystals = (patch.nova_crystals ?? ch.nova_crystals ?? 0) - novaCost;
    }
    const maxHit = Number(body.max_hit) || 0;
    if (maxHit > 0) patch.highest_damage = Math.max(ch.highest_damage || 0, maxHit);
    const opp = body.opponent || {};
    if (won) mergeSpeciesDiscovery(ch, patch, opp.speciesId ?? opp.species_id ?? body.species_id);
    if (won && (dc.ratingDelta || 0) > 0) {
      const weekly = progressWeeklyNovaQuest(ch, "arena", 1);
      if (weekly) patch.weekly_nova_quests = weekly;
    }
    const ach = mergeAchievementUnlocks(ch, patch);
    Object.assign(patch, ach.patch);

    const character = entities.Character.update(ch.id, patch);
    return {
      success: true,
      rewards: {
        won,
        free: useFree,
        experience: boostedXp,
        stardust,
        arena_rating_delta: dc.ratingDelta,
        collectionPct: collectPct,
        direct_challenge: true,
        zero_reward_reason: dc.result?.calc?.zeroRewardReason || null,
      },
      is_free: useFree,
      nova_spent: novaCost,
      patch,
      character,
      challenge_id: challengeId,
      newly_unlocked: ach.newly_unlocked,
    };
  }

  const ch = requireMyChar(user);
  const won = !!body.won;
  const today = todayET();
  let freeLeft = ch.arena_attempts_left ?? ARENA_DAILY_FREE_BATTLES;
  let attemptsDate = ch.arena_attempts_date;
  if (attemptsDate !== today) {
    freeLeft = ARENA_DAILY_FREE_BATTLES;
    attemptsDate = today;
  }
  const isFree = body.is_free != null ? !!body.is_free : freeLeft > 0;
  if (isFree && freeLeft <= 0) httpErr(400, "No free battles left");
  if (!isFree && freeLeft > 0) {
    // Client claimed paid while free remain — treat as free for rewards, still allow
  }
  const useFree = isFree && freeLeft > 0;

  const skipCooldown = !!body.skip_cooldown || !!body.skipped;
  let novaCost = 0;
  if (skipCooldown) novaCost += ARENA_SKIP_COST;
  if (!useFree) novaCost += ARENA_PAID_BATTLE_COST;
  if (novaCost > 0 && (ch.nova_crystals || 0) < novaCost) httpErr(400, "Not enough Nova Crystals");

  const opp = body.opponent || {};
  const rewards = computeArenaRewards(ch, { arena_rating: opp.arena_rating || 1000 }, won, useFree);
  const collectPct = getCollectionPercentage(ch, 0);
  const boostedXp = won ? applyXpBonus(rewards.experience, collectPct) : 0;

  const patch = {};
  applyXpToCharacter(ch, boostedXp, patch);
  const stardustGain = won ? (rewards.stardust || 0) : 0;
  if (stardustGain > 0) {
    patch.stardust = (ch.stardust || 0) + stardustGain;
    patch.total_stardust_earned = (ch.total_stardust_earned || 0) + stardustGain;
  }

  const prevRating = ch.arena_rating || 1000;
  const newRating = Math.max(0, prevRating + rewards.arena_rating_delta);
  const prevStreak = ch.arena_streak || 0;
  const newStreak = won ? prevStreak + 1 : 0;
  patch.arena_rating = newRating;
  patch.arena_wins = (ch.arena_wins || 0) + (won ? 1 : 0);
  patch.arena_losses = (ch.arena_losses || 0) + (won ? 0 : 1);
  patch.arena_streak = newStreak;
  patch.arena_max_streak = Math.max(ch.arena_max_streak || 0, newStreak);
  patch.arena_battles = (ch.arena_battles || 0) + 1;
  patch.arena_attempts_left = Math.max(0, freeLeft - (useFree ? 1 : 0));
  patch.arena_attempts_date = attemptsDate;
  const nowIsoStr = new Date().toISOString();
  patch.arena_cooldown_at = nowIsoStr;
  patch.arena_last_battle_at = nowIsoStr;
  if (novaCost > 0) patch.nova_crystals = (ch.nova_crystals || 0) - novaCost;

  const maxHit = Number(body.max_hit) || 0;
  if (maxHit > 0) patch.highest_damage = Math.max(ch.highest_damage || 0, maxHit);
  if (won) mergeSpeciesDiscovery(ch, patch, opp.speciesId ?? opp.species_id ?? body.species_id);

  if (won) {
    const weekly = progressWeeklyNovaQuest(ch, "arena", 1);
    if (weekly) patch.weekly_nova_quests = weekly;
  }

  const ach = mergeAchievementUnlocks(ch, patch);
  Object.assign(patch, ach.patch);

  const character = entities.Character.update(ch.id, patch);

  // Persistent bot ladder: mirror the player's Elo onto the bot they fought.
  let botUpdate = null;
  const ladderId = opp.arena_bot_id || opp.arenaBotId || null;
  if (ladderId) {
    botUpdate = settleBotAsOpponent(ladderId, {
      playerWon: won,
      playerRatingDelta: rewards.arena_rating_delta,
    });
  }

  return {
    success: true,
    rewards: { ...rewards, experience: boostedXp, collectionPct: collectPct },
    is_free: useFree,
    nova_spent: novaCost,
    patch,
    character,
    newly_unlocked: ach.newly_unlocked,
    bot: botUpdate,
  };
});

// ── Dungeon ──────────────────────────────────────────────────
export const SyncDungeonState = wrap((user) => {
  const ch = requireMyChar(user);
  const today = todayET();
  const patch = {};
  if (ch.dungeon_deaths_date !== today) {
    patch.dungeon_deaths = 0;
    patch.dungeon_deaths_date = today;
    patch.dungeon_extra_lives = 0;
  }
  if ((ch.ship_mods || []).includes("Genesis Core") && (ch.dungeon_planet || 1) <= DUNGEON_STORY_PLANETS) {
    patch.dungeon_planet = DUNGEON_STORY_PLANETS + 1;
    patch.dungeon_enemy = 1;
  }
  if (!Object.keys(patch).length) {
    return { success: true, patched: false, character: ch };
  }
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patched: true, patch, character };
});

export const SkipDungeonCooldown = wrap((user) => {
  const ch = requireMyChar(user);
  if ((ch.nova_crystals || 0) < DUNGEON_SKIP_COST) httpErr(400, "Not enough Nova Crystals");
  const patch = {
    nova_crystals: (ch.nova_crystals || 0) - DUNGEON_SKIP_COST,
    dungeon_cooldown_at: null,
    dungeon_cooldown_ms: null,
    dungeon_cooldown_until: null,
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character };
});

export const PayDungeonContinue = wrap((user) => {
  const ch = requireMyChar(user);
  if ((ch.nova_crystals || 0) < DUNGEON_CONTINUE_COST) httpErr(400, "Not enough Nova Crystals");
  const patch = { nova_crystals: (ch.nova_crystals || 0) - DUNGEON_CONTINUE_COST };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, cost: DUNGEON_CONTINUE_COST, patch, character };
});

export const FinishDungeonBattle = wrap((user, body) => {
  const ch = requireMyChar(user);
  const won = !!body.won;
  const planetId = Math.max(1, Math.floor(Number(body.planet_id) || ch.dungeon_planet || 1));
  const enemyIndex = Math.min(
    DUNGEON_ENEMIES_PER_PLANET,
    Math.max(1, Math.floor(Number(body.enemy_index) || ch.dungeon_enemy || 1)),
  );
  const patrol = !!body.patrol;
  const today = todayET();

  // Story dungeons 1–10 require the player level unlock gate.
  if (planetId >= 1 && planetId <= DUNGEON_STORY_PLANETS) {
    if (!isDungeonUnlockedByLevel(planetId, ch.level)) {
      const need = getDungeonUnlockLevel(planetId);
      httpErr(403, `Dungeon ${planetId} unlocks at level ${need}`);
    }
  }

  const mult = patrol ? DUNGEON_PATROL_REWARD_MULT : 1;
  const enemyLevel = getDungeonEnemyLevel(planetId, enemyIndex);
  const dru = getEnemyDru(planetId, enemyIndex) * mult;
  const isBoss = enemyIndex === DUNGEON_ENEMIES_PER_PLANET;
  let stardust = 0;
  let experience = 0;
  if (won) {
    const r = druToRewards(dru, enemyLevel);
    stardust = r.stardust;
    experience = r.experience;
  }

  const collectPct = getCollectionPercentage(ch, 0);
  const boostedXp = won ? applyXpBonus(experience, collectPct) : 0;
  const patch = {};
  applyXpToCharacter(ch, boostedXp, patch);

  const itemsGranted = [];
  const pendingLoot = [];
  let unlockedShipMod = null;
  if (won) {
    patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + stardust;
    patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + stardust;

    if (!patrol) {
      patch.dungeon_clears = (ch.dungeon_clears || 0) + (isBoss ? 1 : 0);
      if (isBoss) {
        if (planetId > DUNGEON_STORY_PLANETS) {
          patch.dungeon_planet = Math.max(ch.dungeon_planet || planetId, planetId) + 1;
          patch.dungeon_enemy = 1;
        } else if (planetId === DUNGEON_STORY_PLANETS) {
          const grant = grantFrontierShipMod(ch, planetId);
          patch.ship_mods = grant.ship_mods;
          if (grant.ship_mod_loadouts) patch.ship_mod_loadouts = grant.ship_mod_loadouts;
          unlockedShipMod = grant.unlockedLabel;
          if (grant.consolationStardust) {
            patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + grant.consolationStardust;
            patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + grant.consolationStardust;
          }
          patch.dungeon_planet = DUNGEON_STORY_PLANETS + 1;
          patch.dungeon_enemy = 1;
          patch.highest_sector = Math.max(ch.highest_sector || 1, DUNGEON_STORY_PLANETS);
        } else {
          patch.dungeon_planet = planetId + 1;
          patch.dungeon_enemy = 1;
          patch.highest_sector = Math.max(ch.highest_sector || 1, planetId + 1);
          const grant = grantFrontierShipMod(ch, planetId);
          patch.ship_mods = grant.ship_mods;
          if (grant.ship_mod_loadouts) patch.ship_mod_loadouts = grant.ship_mod_loadouts;
          unlockedShipMod = grant.unlockedLabel;
          if (grant.consolationStardust) {
            patch.stardust = (patch.stardust ?? ch.stardust ?? 0) + grant.consolationStardust;
            patch.total_stardust_earned = (patch.total_stardust_earned ?? ch.total_stardust_earned ?? 0) + grant.consolationStardust;
          }
        }
      } else {
        patch.dungeon_enemy = Math.min(DUNGEON_ENEMIES_PER_PLANET, enemyIndex + 1);
      }
    }

    // Gear loot
    let gear = null;
    if (!patrol && isBoss) {
      const tier = Math.min(3, Math.floor((planetId - 1) / 3));
      const rarities = ["rare", "epic", "epic", "legendary"];
      gear = randomItem(rollItemRarity(rarities[tier], ch.level || 1), Math.max(1, ch.level || 1), undefined, Math.random, ch.class);
    } else if (Math.random() < (patrol ? 0.12 : 0.25)) {
      const rarity = rollItemRarity(Math.random() < 0.12 ? "uncommon" : "common", ch.level || 1);
      gear = randomItem(rarity, Math.max(1, ch.level || 1), undefined, Math.random, ch.class);
    }
    const grantCtx = { accountId: user.id, characterId: ch.id };
    if (gear) {
      collectGrant(grantOrCompensate(ch, stripShopNoise(gear), patch), itemsGranted, pendingLoot, grantCtx);
    }

    if (Math.random() < (patrol ? 0.1 : 0.2)) {
      const cons = stripShopNoise(randomConsumable());
      collectGrant(grantOrCompensate(ch, cons, patch), itemsGranted, pendingLoot, grantCtx);
    }

    const nextNodes = (ch.dungeon_nodes_cleared || 0) + 1;
    patch.dungeon_nodes_cleared = nextNodes;
    if (nextNodes % DUNGEON_MILESTONE_EVERY === 0) {
      const rarity = rollItemRarity(Math.random() < 0.35 ? "rare" : "uncommon", ch.level || 1);
      const mile = randomItem(rarity, Math.max(1, ch.level || 1), undefined, Math.random, ch.class);
      collectGrant(grantOrCompensate(ch, stripShopNoise(mile), patch), itemsGranted, pendingLoot, grantCtx);
    }

    const weekly = progressWeeklyNovaQuest(
      { ...ch, weekly_nova_quests: patch.weekly_nova_quests || ch.weekly_nova_quests },
      "dungeon",
      1,
    );
    if (weekly) patch.weekly_nova_quests = weekly;
  } else {
    let deaths = ch.dungeon_deaths || 0;
    if (ch.dungeon_deaths_date !== today) deaths = 0;
    patch.dungeon_deaths = Math.min(DUNGEON_DEATHS_PER_DAY, deaths + 1);
    patch.dungeon_deaths_date = today;
  }

  const maxHit = Number(body.max_hit) || 0;
  if (maxHit > 0) patch.highest_damage = Math.max(ch.highest_damage || 0, maxHit);
  if (won) mergeSpeciesDiscovery(ch, patch, body.species_id);

  const cdMs = dungeonCooldownMs(won);
  const now = new Date().toISOString();
  patch.dungeon_cooldown_at = now;
  patch.dungeon_cooldown_ms = cdMs;
  patch.dungeon_cooldown_until = new Date(Date.now() + cdMs).toISOString();

  const ach = mergeAchievementUnlocks(ch, patch);
  Object.assign(patch, ach.patch);

  if (won) {
    mergeDiscoveredGear(ch, [
      ...itemsGranted,
      ...pendingLoot.map((p) => p.item),
    ], patch);
  }

  const character = entities.Character.update(ch.id, patch);
  auditDungeonBattle({
    user,
    character: ch,
    won,
    beforeStardust: ch.stardust || 0,
    afterStardust: patch.stardust ?? ch.stardust ?? 0,
    rewards: {
      stardust,
      experience: boostedXp,
      planetId,
      enemyIndex,
    },
    items: itemsGranted,
    pendingLoot,
    correlationId: newCorrelationId(),
  });
  return {
    success: true,
    won,
    rewards: { stardust, experience: boostedXp, base_experience: experience, dru: Math.round(dru * 100) / 100, enemyLevel, isBoss, patrol },
    items: itemsGranted,
    pending_loot: pendingLoot,
    ship_mod: unlockedShipMod,
    patch,
    character,
    newly_unlocked: ach.newly_unlocked,
  };
});

// ── Ship ─────────────────────────────────────────────────────
export const BuyShip = wrap((user, body) => {
  const ch = requireMyChar(user);
  const shipId = body.ship_id;
  const ship = SHIP_TYPES[shipId];
  if (!ship) httpErr(400, "Unknown ship");
  if (shipId === STARTER_SHIP) httpErr(400, "Already owned");
  const owned = new Set([...(ch.owned_ships || [STARTER_SHIP]), STARTER_SHIP]);
  if (owned.has(shipId)) httpErr(400, "Already owned");
  if ((ch.level || 1) < (ship.unlock_level || 1)) httpErr(400, "Level too low");
  if ((ch.nova_crystals || 0) < ship.cost) httpErr(400, "Not enough Nova Crystals");
  const loadouts = { ...(ch.ship_mod_loadouts || {}) };
  if (!Array.isArray(loadouts[shipId])) loadouts[shipId] = [];
  const patch = {
    nova_crystals: (ch.nova_crystals || 0) - ship.cost,
    owned_ships: [...owned, shipId],
    ship_mod_loadouts: loadouts,
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, ship_id: shipId, patch, character };
});

export const BuyShipMod = wrap((user, body) => {
  const ch = requireMyChar(user);
  const catKey = body.category_key;
  const shipId = body.ship_id || getActiveShipId(ch);
  if (!SHIP_MODS[catKey]) httpErr(400, "Unknown mod category");
  const owned = new Set([...(ch.owned_ships || [STARTER_SHIP]), STARTER_SHIP]);
  if (!owned.has(shipId)) httpErr(400, "Ship not owned");
  const tier = getNextModTier(ch, catKey, shipId);
  if (!tier) httpErr(400, "Category maxed");
  const cost = getTierCost(tier, shipId);
  if ((ch.stardust || 0) < cost) httpErr(400, "Not enough stardust");
  const loadouts = { ...(ch.ship_mod_loadouts || {}) };
  const current = Array.isArray(loadouts[shipId]) ? [...loadouts[shipId]] : [...getShipModIds(ch, shipId)];
  const newMods = [...current, tier.id];
  loadouts[shipId] = newMods;
  const patch = {
    stardust: (ch.stardust || 0) - cost,
    ship_mod_loadouts: loadouts,
  };
  if (tier.max_fuel_bonus && shipId === getActiveShipId(ch)) {
    const newMax = computeMaxFuelForLoadout(newMods, shipId);
    patch.max_fuel = newMax;
    patch.fuel = Math.min((ch.fuel ?? FUEL_MAX) + (newMax - (ch.max_fuel || FUEL_MAX)), newMax);
    patch.fuel_updated_at = new Date().toISOString();
  }
  const character = entities.Character.update(ch.id, patch);
  return { success: true, tier_id: tier.id, cost, patch, character };
});

export const ActivateShip = wrap((user, body) => {
  const ch = requireMyChar(user);
  const shipId = body.ship_id;
  if (!SHIP_TYPES[shipId]) httpErr(400, "Unknown ship");
  const owned = new Set([...(ch.owned_ships || [STARTER_SHIP]), STARTER_SHIP]);
  if (!owned.has(shipId)) httpErr(400, "Ship not owned");
  const loadouts = ch.ship_mod_loadouts || {};
  const newMods = loadouts[shipId] || [];
  const newMax = computeMaxFuelForLoadout(newMods, shipId);
  const patch = {
    active_ship: shipId,
    max_fuel: newMax,
    fuel: Math.min(ch.fuel ?? FUEL_MAX, newMax),
    fuel_updated_at: new Date().toISOString(),
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character };
});

// ── Mining ───────────────────────────────────────────────────
export const StartMining = wrap((user, body) => {
  const ch = requireMyChar(user);
  if (ch.active_mission_id && ch.mission_end_time) httpErr(400, "Ship busy on mission");
  if (ch.mining_end_time) httpErr(400, "Already mining");
  const hours = Math.min(24, Math.max(1, Math.floor(Number(body.hours) || 1)));
  const reward = computeMiningReward(ch.level, hours);
  const end = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const patch = { mining_end_time: end, mining_reward: reward };
  const character = entities.Character.update(ch.id, patch);
  auditMiningEvent({
    user,
    character: ch,
    action: "mining_started",
    before: { mining_end_time: ch.mining_end_time || null, mining_reward: ch.mining_reward || 0 },
    after: patch,
    hours,
  });
  return { success: true, hours, patch, character };
});

export const CollectMining = wrap((user) => {
  const ch = requireMyChar(user);
  if (!ch.mining_end_time) httpErr(400, "Not mining");
  if (new Date(ch.mining_end_time).getTime() > Date.now()) httpErr(400, "Mining not finished");
  const r = ch.mining_reward || 0;
  const beforeStardust = ch.stardust || 0;
  const patch = {
    stardust: beforeStardust + r,
    total_stardust_earned: (ch.total_stardust_earned || 0) + r,
    mining_end_time: null,
    mining_reward: 0,
  };
  const character = entities.Character.update(ch.id, patch);
  auditMiningEvent({
    user,
    character: ch,
    action: "mining_collected",
    before: { stardust: beforeStardust, mining_reward: r },
    after: { stardust: patch.stardust, mining_reward: 0 },
    stardustGained: r,
  });
  return { success: true, stardust_gained: r, patch, character };
});

export const CancelMining = wrap((user) => {
  const ch = requireMyChar(user);
  if (!ch.mining_end_time) httpErr(400, "Not mining");
  const patch = { mining_end_time: null, mining_reward: 0 };
  const character = entities.Character.update(ch.id, patch);
  auditMiningEvent({
    user,
    character: ch,
    action: "mining_cancelled",
    before: { mining_end_time: ch.mining_end_time, mining_reward: ch.mining_reward || 0 },
    after: patch,
  });
  return { success: true, patch, character };
});

// ── Casino (server-authoritative rolls) ──────────────────────
function rollWheelTier() {
  const r = Math.random();
  let acc = 0;
  for (const t of CASINO_WHEEL_TIERS) {
    acc += t.p;
    if (r <= acc) return t;
  }
  return CASINO_WHEEL_TIERS[0];
}

export const CasinoSettle = wrap((user, body) => {
  const ch = requireMyChar(user);
  const game = String(body.game || "").toLowerCase();
  const bet = Math.floor(Number(body.bet) || 0);
  if (bet < 1) httpErr(400, "Invalid bet");

  const maxStardustBet = getCasinoMaxStardustBet(ch.level || 1);
  let deltaCrystals = 0;
  let deltaStardust = 0;
  let outcome = {};

  if (game === "dice" || game === "stardust_dice") {
    if (bet > maxStardustBet) httpErr(400, `Bet too high (max ${maxStardustBet})`);
    if ((ch.stardust || 0) < bet) httpErr(400, "Not enough stardust");
    const choice = String(body.choice || "").toLowerCase();
    if (choice !== "high" && choice !== "low") httpErr(400, "Choose high or low");
    const dice = 1 + Math.floor(Math.random() * 6);
    const high = dice >= 4;
    const won = (choice === "high" && high) || (choice === "low" && !high);
    deltaStardust = won ? bet : -bet;
    outcome = { dice, won, choice, payout_mult: won ? 2 : 0 };
  } else if (game === "wheel" || game === "stardust_wheel") {
    if (bet > maxStardustBet) httpErr(400, `Bet too high (max ${maxStardustBet})`);
    if ((ch.stardust || 0) < bet) httpErr(400, "Not enough stardust");
    const tier = rollWheelTier();
    // Net change: bust −bet, push 0, Nx → +(N−1)×bet (stake returned × N).
    deltaStardust = Math.round(bet * (tier.mult - 1));
    outcome = { mult: tier.mult, payout_mult: tier.mult, label: tier.label || null };
  } else if (game === "flip" || game === "crystal_flip") {
    if (!NOVA_CASINO_OPEN) httpErr(400, "Crystal tables sealed");
    if (bet > CASINO_MAX_NOVA_BET) httpErr(400, "Bet too high");
    if ((ch.nova_crystals || 0) < bet) httpErr(400, "Not enough Nova Crystals");
    const won = Math.random() < 0.25;
    deltaCrystals = won ? bet : -bet;
    outcome = { won, payout_mult: won ? 2 : 0 };
  } else if (game === "jackpot" || game === "crystal_jackpot") {
    if (!NOVA_CASINO_OPEN) httpErr(400, "Crystal tables sealed");
    if (bet > CASINO_MAX_NOVA_BET) httpErr(400, "Bet too high");
    if ((ch.nova_crystals || 0) < bet) httpErr(400, "Not enough Nova Crystals");
    const won = Math.random() < 0.01;
    deltaCrystals = won ? bet * (25 - 1) : -bet;
    outcome = { won, mult: won ? 25 : 0, payout_mult: won ? 25 : 0 };
  } else if (body.currency != null || body.wager != null || body.payout_mult != null) {
    // Legacy client-authored payout path — rejected. Outcomes must use named games above.
    httpErr(400, "Client payout multipliers are not accepted", "SUSPICIOUS_CLIENT_PAYLOAD");
  } else {
    httpErr(400, "Unknown casino game");
  }

  if (deltaCrystals > 0 && !NOVA_CASINO_OPEN) httpErr(400, "Crystal tables sealed");

  // Re-read inside the transaction so concurrent patches can't stale-overwrite.
  const live = entities.Character.get(ch.id) || ch;
  const nextStardust = clampStardust((live.stardust || 0) + deltaStardust);
  const nextCrystals = Math.max(0, (live.nova_crystals || 0) + deltaCrystals);
  const patch = {
    stardust: nextStardust,
    nova_crystals: nextCrystals,
  };
  if (deltaStardust > 0) {
    patch.total_stardust_earned = (live.total_stardust_earned || 0) + deltaStardust;
  }

  if (deltaStardust === 0 && deltaCrystals === 0) {
    return {
      success: true,
      push: true,
      outcome,
      max_bet: maxStardustBet,
      delta_stardust: 0,
      delta_crystals: 0,
      patch: {},
      character: live,
    };
  }
  const beforeStardust = live.stardust || 0;
  const beforeNova = live.nova_crystals || 0;
  const character = entities.Character.update(ch.id, patch);
  auditCasinoSettle({
    user,
    character: live,
    game,
    bet,
    beforeStardust,
    afterStardust: patch.stardust,
    beforeNova,
    afterNova: patch.nova_crystals,
    outcome,
    correlationId: newCorrelationId(),
  });
  return {
    success: true,
    delta_stardust: deltaStardust,
    delta_crystals: deltaCrystals,
    max_bet: maxStardustBet,
    outcome,
    patch,
    character,
  };
});

// ── Character slot ───────────────────────────────────────────
export const BuyCharacterSlot = wrap(async (user) => {
  const ch = requireMyChar(user);
  const freshUser = getUserById(user.id);
  const slots = resolveCharacterSlotCapacity(user.id);
  if (slots.capacity >= CHARACTER_MAX_SLOTS) {
    httpErr(400, "Max slots reached", EntitlementErrors.CHARACTER_SLOT_LIMIT_REACHED);
  }
  if ((ch.nova_crystals || 0) < CHARACTER_SLOT_COST) httpErr(400, "Not enough Nova Crystals");

  const patch = { nova_crystals: (ch.nova_crystals || 0) - CHARACTER_SLOT_COST };
  const character = entities.Character.update(ch.id, patch);

  await grantEntitlement({
    entitlementKey: "account.character_slot",
    accountId: user.id,
    quantity: 1,
    sourceType: "direct_purchase",
    sourceReferenceType: "nova_purchase",
    sourceReferenceId: `nova.character_slot:${ch.id}:${Date.now()}`,
    externalProvider: "internal_nova",
    externalProductId: "nova.character_slot",
    externalTransactionId: `nova-slot:${user.id}:${slots.extra + 1}`,
    idempotencyKey: `nova-slot:${user.id}:${slots.extra + 1}`,
    createdBy: user.email || user.id,
  });

  const synced = syncPurchasedSlotsColumn(user.id);
  return {
    success: true,
    purchased_slots: synced.purchased,
    character_slots: synced,
    patch,
    character,
    user: getUserById(user.id),
  };
});

// ── Weekly ───────────────────────────────────────────────────
export const ClaimWeeklyNovaQuest = wrap((user, body) => {
  const ch = requireMyChar(user);
  const questId = body.quest_id;
  const quest = WEEKLY_NOVA_QUESTS.find((q) => q.id === questId);
  if (!quest) httpErr(400, "Unknown quest");
  const state = ensureWeeklyNovaState(ch);
  if (state.claimed.includes(questId)) httpErr(400, "Already claimed");
  if ((state[quest.key] || 0) < quest.goal) httpErr(400, "Quest not complete");
  const nextState = { ...state, claimed: [...state.claimed, questId] };
  const patch = {
    weekly_nova_quests: nextState,
    nova_crystals: (ch.nova_crystals || 0) + quest.reward,
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, quest, patch, character };
});

/** Crystal pack catalog — Stripe checkout TBD; local/dev grant when allowed. */
export const CRYSTAL_PACKS = Object.freeze({
  pouch: { id: "pouch", name: "Crystal Pouch", crystals: 500, price: "$4.99" },
  cluster: { id: "cluster", name: "Crystal Cluster", crystals: 1200, price: "$9.99" },
  vault: { id: "vault", name: "Crystal Vault", crystals: 2800, price: "$19.99" },
  motherlode: { id: "motherlode", name: "Motherlode", crystals: 6000, price: "$39.99" },
});

function crystalPackGrantAllowed() {
  if (process.env.CRYSTAL_PACK_DEV_GRANT === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * PurchaseCrystalPack — credits Nova for a catalog pack.
 * Production without CRYSTAL_PACK_DEV_GRANT returns 501 (Stripe not wired).
 * Non-production (and explicit DEV grant) grants immediately for local play.
 */
export const PurchaseCrystalPack = wrap((user, body) => {
  const packId = String(body.pack_id || body.packId || "").trim();
  const pack = CRYSTAL_PACKS[packId];
  if (!pack) httpErr(400, "Unknown pack");
  if (!crystalPackGrantAllowed()) {
    httpErr(501, "Checkout coming soon — Stripe payment is being connected");
  }
  const ch = requireMyChar(user);
  const crystals = pack.crystals;
  const patch = { nova_crystals: (ch.nova_crystals || 0) + crystals };
  const character = entities.Character.update(ch.id, patch);
  return {
    success: true,
    pack,
    crystals,
    patch,
    character,
    mode: "dev_grant",
  };
});

// ── Guild ────────────────────────────────────────────────────
export const CreateGuild = wrap((user, body) => {
  const ch = requireMyChar(user);
  const name = String(body.name || "").trim();
  if (!name) httpErr(400, "Guild needs a name");
  assertNameHasNoDigits(name, "Guild name");
  const tag = String(body.tag || "").trim().toUpperCase().slice(0, 4);
  const description = String(body.description || "").trim();
  if ((ch.stardust || 0) < GUILD_CREATE_COST) httpErr(400, "Not enough stardust");
  const existing = entities.GuildMember.filter({ character_id: ch.id }, null, 5);
  if (existing.length) httpErr(400, "Already in a guild");
  const nameTaken = entities.Guild.filter({ name }, null, 1);
  if (nameTaken.length) httpErr(400, "Name taken");

  const patch = { stardust: (ch.stardust || 0) - GUILD_CREATE_COST };
  const character = entities.Character.update(ch.id, patch);
  const guild = entities.Guild.create({
    name,
    tag,
    description,
    leader_id: ch.id,
    leader_name: ch.name,
    level: 1,
    experience: 0,
    experience_to_next: 1000,
    total_missions: 0,
    total_stardust: 0,
    member_count: 1,
  });
  const member = entities.GuildMember.create({
    guild_id: guild.id,
    character_id: ch.id,
    character_name: ch.name,
    character_level: ch.level,
    character_race: ch.race,
    role: "leader",
    contributed_missions: 0,
    contributed_stardust: 0,
    joined_date: new Date().toISOString(),
  });
  entities.GuildLog.create({
    guild_id: guild.id,
    entry_type: "create",
    message: "founded the guild",
    character_name: ch.name,
  });
  return { success: true, guild, member, patch, character };
});

export const DeclareGuildWar = wrap((user, body) => {
  const ch = requireMyChar(user);
  const defenderId = body.defender_guild_id;
  if (!defenderId) httpErr(400, "Missing defender_guild_id");
  if ((ch.stardust || 0) < GUILD_WAR_DECLARE_COST) httpErr(400, "Not enough stardust");

  const membership = entities.GuildMember.filter({ character_id: ch.id }, null, 5)[0];
  if (!membership) httpErr(400, "Not in a guild");
  if (!["leader", "officer"].includes(membership.role)) httpErr(403, "Officers only");

  const attackerGuild = entities.Guild.get(membership.guild_id);
  const defenderGuild = entities.Guild.get(defenderId);
  if (!attackerGuild || !defenderGuild) httpErr(404, "Guild not found");
  if (attackerGuild.id === defenderGuild.id) httpErr(400, "Cannot declare on yourself");

  const patch = { stardust: (ch.stardust || 0) - GUILD_WAR_DECLARE_COST };
  const character = entities.Character.update(ch.id, patch);
  const now = new Date();
  const deadline = new Date(now.getTime() + GUILD_WAR_READY_HOURS * 3600 * 1000);
  const war = entities.GuildWar.create({
    attacker_guild_id: attackerGuild.id,
    attacker_guild_name: attackerGuild.name,
    attacker_guild_tag: attackerGuild.tag || "",
    defender_guild_id: defenderGuild.id,
    defender_guild_name: defenderGuild.name,
    defender_guild_tag: defenderGuild.tag || "",
    status: "readying",
    declared_at: now.toISOString(),
    ready_deadline: deadline.toISOString(),
    initiated_by: ch.name,
    attacker_ready_count: 0,
    defender_ready_count: 0,
  });
  return { success: true, war, patch, character };
});

export const DismissFuelMount = wrap((user, body) => {
  const ch = requireMyChar(user);
  const mountId = body.mount_id;
  const expiresAt = body.expires_at;
  if (mountId == null) httpErr(400, "Missing mount_id");
  const next = (ch.active_fuel_mounts || []).filter(
    (m) => !(m.id === mountId && (!expiresAt || m.expires_at === expiresAt)),
  );
  const patch = { active_fuel_mounts: next };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character };
});

export const ClaimScoutMilestone = wrap((user) => {
  const ch = requireMyChar(user);
  if ((ch.level || 1) < SCOUT_MILESTONE_LEVEL) httpErr(400, "Level too low");
  if (ch.ship_milestones?.scout_bay) httpErr(409, "Already claimed");
  const loadouts = { ...(ch.ship_mod_loadouts || {}) };
  const scoutMods = Array.isArray(loadouts[STARTER_SHIP])
    ? [...loadouts[STARTER_SHIP]]
    : [...getShipModIds(ch, STARTER_SHIP)];
  if (!scoutMods.includes(SCOUT_MILESTONE_MOD_ID)) scoutMods.push(SCOUT_MILESTONE_MOD_ID);
  loadouts[STARTER_SHIP] = scoutMods;
  const patch = {
    ship_mod_loadouts: loadouts,
    ship_milestones: { ...(ch.ship_milestones || {}), scout_bay: true },
  };
  if (getActiveShipId(ch) === STARTER_SHIP) {
    const newMax = computeMaxFuelForLoadout(scoutMods, STARTER_SHIP);
    const oldMax = ch.max_fuel || FUEL_MAX;
    patch.max_fuel = newMax;
    patch.fuel = Math.min((ch.fuel ?? FUEL_MAX) + (newMax - oldMax), newMax);
    patch.fuel_updated_at = nowIso();
  }
  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character };
});

export const RenameCharacter = wrap(async (user, body) => {
  const ch = requireMyChar(user);
  const name = String(body?.name || "").trim();
  if (!name || name.length < 2 || name.length > 24) httpErr(400, "Name must be 2–24 characters");
  assertNameHasNoDigits(name);
  const taken = entities.Character.filter({ name }, null, 5).filter((c) => c.id !== ch.id);
  if (taken.length) httpErr(409, "Name taken");

  const tokens = resolveQuantity({ entitlementKey: "account.rename_token", accountId: user.id });
  const useToken = body?.pay_with_nova !== true && tokens.quantity > 0;

  let patch;
  if (useToken) {
    await consumeEntitlement({
      entitlementKey: "account.rename_token",
      accountId: user.id,
      quantity: 1,
      operationId: body?.idempotencyKey || `rename-token:${user.id}:${ch.id}:${name}`,
      reason: "character_rename",
      target: { characterId: ch.id, name },
      createdBy: user.email || user.id,
    });
    patch = { name };
  } else {
    if ((ch.nova_crystals || 0) < NAME_CHANGE_COST) httpErr(400, "Not enough Nova Crystals");
    patch = {
      name,
      nova_crystals: (ch.nova_crystals || 0) - NAME_CHANGE_COST,
    };
  }

  const character = entities.Character.update(ch.id, patch);
  return { success: true, patch, character, used_rename_token: !!useToken && tokens.quantity > 0 };
});

/** Dissolve server-persisted pending loot for stardust. Requires pending_loot_id. */
export const DissolvePendingLoot = wrap((user, body) => {
  const pendingId = body?.pending_loot_id || body?.pendingLootId;
  if (!pendingId) httpErr(400, "Missing pending_loot_id — client item payloads are not accepted");
  return dissolveServerPendingLoot(user, pendingId);
});

/**
 * Accept server-persisted pending loot once inventory has room.
 * Client-submitted item bodies are ignored.
 */
export const AcceptPendingLoot = wrap((user, body) => {
  const pendingId = body?.pending_loot_id || body?.pendingLootId;
  if (!pendingId) httpErr(400, "Missing pending_loot_id — client item payloads are not accepted");
  return acceptServerPendingLoot(user, pendingId);
});

/**
 * Legacy guild war sim payout.
 * Client reward_stardust is ignored — server uses a fixed win/loss schedule.
 */
export const ApplyGuildWarResult = wrap((user, body) => {
  const ch = requireMyChar(user);
  const won = !!body.won;
  // Server-authoritative reward (scaled units). Client amounts are ignored.
  const capped = won ? 2500 * 10 : 500 * 10;
  const delta = -GUILD_WAR_SIM_COST + capped;
  const next = (ch.stardust || 0) + delta;
  if (next < 0) httpErr(400, "Not enough stardust for war chest");
  const patch = {
    stardust: next,
    total_stardust_earned: (ch.total_stardust_earned || 0) + Math.max(0, capped),
  };
  const character = entities.Character.update(ch.id, patch);
  return { success: true, delta, patch, character, won, reward_stardust: capped };
});

export const ECONOMY_FOLLOW_ON_HANDLERS = {
  SyncArenaDay,
  RefreshArenaOpponents,
  FinishArenaBattle,
  SkipArenaCooldown,
  SyncDungeonState,
  SkipDungeonCooldown,
  PayDungeonContinue,
  FinishDungeonBattle,
  BuyShip,
  BuyShipMod,
  ActivateShip,
  StartMining,
  CollectMining,
  CancelMining,
  CasinoSettle,
  BuyCharacterSlot,
  ClaimWeeklyNovaQuest,
  PurchaseCrystalPack,
  CreateGuild,
  DeclareGuildWar,
  DismissFuelMount,
  ClaimScoutMilestone,
  RenameCharacter,
  DissolvePendingLoot,
  AcceptPendingLoot,
  ApplyGuildWarResult,
};
