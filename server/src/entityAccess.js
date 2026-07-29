/**
 * Entity access control — ownership + admin gates for the document CRUD API.
 * Reads stay relatively open where the client needs public data (arena, social);
 * mutations require ownership (or admin).
 */
import { entities } from "./entities.js";
import { expForLevel } from "./shared/rewards.js";
import { CLASS_BASE_STATS, FUEL_MAX } from "./shared/economyFormulas.js";
import { assertNameHasNoDigits, NAME_NO_DIGITS_MSG } from "./shared/nameRules.js";
import { assertCanCreateCharacter, EntitlementError } from "./entitlements/index.js";

export function isAdmin(user) {
  return user?.role === "admin";
}

/** Character fields that only server functions / admins may mutate. */
export const CHARACTER_ECONOMY_FIELDS = new Set([
  "stardust",
  "nova_crystals",
  "total_stardust_earned",
  "experience",
  "level",
  "experience_to_next_level",
  "unspent_stat_points",
  "stats",
  "attribute_purchases",
  "attribute_purchases_by_stat",
  "fuel",
  "max_fuel",
  "fuel_purchases",
  "fuel_updated_at",
  "fuel_reset_at",
  "active_fuel_mounts",
  "active_mission_id",
  "mission_end_time",
  "missions_completed",
  "mission_gear_miss_streak",
  "mining_end_time",
  "mining_reward",
  "shop_meta",
  "weekly_nova_quests",
  "arena_rating",
  "arena_wins",
  "arena_losses",
  "arena_streak",
  "arena_max_streak",
  "arena_battles",
  "arena_battles_today",
  "arena_battles_date",
  "arena_last_battle_at",
  "arena_cooldown_at",
  "arena_attempts",
  "arena_attempts_left",
  "arena_attempts_date",
  "arena_bot_raid_at",
  "dungeon_deaths",
  "dungeon_deaths_date",
  "dungeon_clears",
  "dungeon_nodes_cleared",
  "dungeon_cooldown_until",
  "dungeon_cooldown_at",
  "dungeon_cooldown_ms",
  "dungeon_planet",
  "dungeon_enemy",
  "dungeon_extra_lives",
  "owned_ships",
  "ship_mod_loadouts",
  "ship_mods",
  "active_ship",
  "highest_sector",
  "discovered_species",
  "collected_artifacts",
  "collected_relics",
  "promo_codes_redeemed",
  "highest_damage",
  "arena_cooldown_at",
  // Time-sensitive / entitlement fields — server functions only
  "active_buffs",
  "playtime_seconds",
  "unlocked_titles",
  "unlocked_achievements",
  "active_title",
  "discovered_gear",
  "equipped_cosmetics",
  "active_cosmetic_frame",
]);

/** Non-admin Item.update may only touch these fields. */
export const ITEM_ALLOWED_UPDATE_FIELDS = new Set(["is_equipped", "locked"]);

/** Character ids belonging to this auth user. */
export function characterIdsForUser(userId) {
  if (!userId) return [];
  return entities.Character.filter({ created_by_id: userId }, "-created_date", 50).map((c) => c.id);
}

export function ownsCharacter(user, characterId) {
  if (!user || !characterId) return false;
  if (isAdmin(user)) return true;
  const c = entities.Character.get(characterId);
  return !!(c && c.created_by_id === user.id);
}

function ownsDocViaCreatedBy(user, doc) {
  return !!(doc && doc.created_by_id && doc.created_by_id === user.id);
}

function characterOwnedByUser(user, characterId) {
  return ownsCharacter(user, characterId);
}

/** Types only admins may create/update/delete via entity CRUD. */
export const ADMIN_WRITE_TYPES = new Set([
  "PromoCode",
  "SiteConfig",
  "ModerationConfig",
  "PlayerModeration",
  "Nexus",
  "NexusHallOfFame",
  "GalaxyNews",
]);

/** Types that must never be written through /api/entities (use auth routes / functions). */
export const BLOCKED_WRITE_TYPES = new Set(["User"]);

/**
 * Can this user mutate (update/delete) this existing document?
 */
export function canWriteDoc(user, type, doc) {
  if (!user || !doc) return false;
  if (isAdmin(user)) return true;
  if (BLOCKED_WRITE_TYPES.has(type)) return false;
  if (ADMIN_WRITE_TYPES.has(type)) return false;

  switch (type) {
    case "Character":
      return ownsDocViaCreatedBy(user, doc);

    case "Item":
    case "Mission":
    case "DailyLogin":
    case "HubLayout":
    case "NovaSpendEvent":
    case "StardustSpendEvent":
    case "PlayerPresence":
      if (ownsDocViaCreatedBy(user, doc)) return true;
      if (doc.character_id && characterOwnedByUser(user, doc.character_id)) return true;
      if (doc.owner_id && characterOwnedByUser(user, doc.owner_id)) return true;
      return false;

    case "Mail":
      // Recipient (owner_id = character id) or sender
      if (doc.owner_id && characterOwnedByUser(user, doc.owner_id)) return true;
      if (doc.from_id && characterOwnedByUser(user, doc.from_id)) return true;
      if (ownsDocViaCreatedBy(user, doc)) return true;
      return false;

    case "AppNotification":
      if (doc.character_id && characterOwnedByUser(user, doc.character_id)) return true;
      if (doc.owner_id && characterOwnedByUser(user, doc.owner_id)) return true;
      return ownsDocViaCreatedBy(user, doc);

    case "Block":
      return doc.blocker_id && characterOwnedByUser(user, doc.blocker_id);

    case "FriendRequest":
      return (
        (doc.from_id && characterOwnedByUser(user, doc.from_id)) ||
        (doc.to_id && characterOwnedByUser(user, doc.to_id))
      );

    case "Friendship":
      return (
        (doc.character_a_id && characterOwnedByUser(user, doc.character_a_id)) ||
        (doc.character_b_id && characterOwnedByUser(user, doc.character_b_id))
      );

    case "PrivateConversation": {
      const ids = characterIdsForUser(user.id);
      const parts = doc.participant_ids || [doc.a_id, doc.b_id].filter(Boolean);
      return parts.some((id) => ids.includes(id));
    }

    case "PrivateMessage":
      if (doc.sender_id && characterOwnedByUser(user, doc.sender_id)) return true;
      if (doc.recipient_id && characterOwnedByUser(user, doc.recipient_id)) return true;
      return ownsDocViaCreatedBy(user, doc);

    case "ChatMessage":
      return doc.sender_id && characterOwnedByUser(user, doc.sender_id);

    case "Report":
      return ownsDocViaCreatedBy(user, doc);

    case "Guild":
    case "GuildMember":
    case "GuildLog":
    case "GuildChallenge":
    case "GuildBattle":
    case "GuildWar":
    case "GuildWarReady": {
      // Member of the guild may mutate membership-adjacent records; leaders handled in app logic.
      const guildId = type === "Guild" ? doc.id : doc.guild_id;
      if (!guildId) return ownsDocViaCreatedBy(user, doc);
      const ids = characterIdsForUser(user.id);
      const membership = entities.GuildMember.filter({ guild_id: guildId }, null, 500)
        .find((m) => ids.includes(m.character_id));
      return !!membership || ownsDocViaCreatedBy(user, doc);
    }

    case "ArenaMatch":
      return ownsDocViaCreatedBy(user, doc);

    case "NexusAssault":
      return ownsDocViaCreatedBy(user, doc);

    default:
      return ownsDocViaCreatedBy(user, doc);
  }
}

/**
 * Can this user create a document of this type with this payload?
 * Forces ownership stamps in sanitizeCreatePayload.
 */
export function canCreateType(user, type, data = {}) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (BLOCKED_WRITE_TYPES.has(type)) return false;
  if (ADMIN_WRITE_TYPES.has(type)) return false;

  switch (type) {
    case "Item":
    case "Mission":
      // Loot / missions only via server functions for non-admins.
      return false;

    case "Character":
    case "DailyLogin":
    case "HubLayout":
    case "Mail":
    case "AppNotification":
    case "Block":
    case "FriendRequest":
    case "Friendship":
    case "PrivateConversation":
    case "PrivateMessage":
    case "ChatMessage":
    case "Report":
    case "Guild":
    case "GuildMember":
    case "GuildLog":
    case "GuildChallenge":
    case "GuildBattle":
    case "GuildWar":
    case "GuildWarReady":
    case "ArenaMatch":
    case "PlayerPresence":
    case "NovaSpendEvent":
    case "StardustSpendEvent":
    case "NexusAssault":
      return true;
    default:
      return false;
  }
}

/**
 * Can this user delete this document via entity CRUD?
 * Items/Missions: non-admins must use DissolveItem / UseConsumable / mission functions.
 */
export function canDeleteDoc(user, type, doc) {
  if (!user || !doc) return false;
  if (isAdmin(user)) return true;
  if (type === "Item" || type === "Mission") return false;
  return canWriteDoc(user, type, doc);
}

/**
 * Strip client-controlled ownership / id forges on create.
 * Rejects client-supplied ids (Critical #3) unless admin.
 * Character.create forces economy defaults for non-admins.
 */
export function sanitizeCreatePayload(user, type, data = {}) {
  const out = { ...data };
  // Never trust client id for non-admins — prevents UPSERT overwrite of others' rows.
  if (!isAdmin(user)) {
    delete out.id;
  }
  out.created_by_id = user.id;
  out.created_by = user.email;

  // Character always belongs to caller
  if (type === "Character") {
    out.created_by_id = user.id;

    const name = String(out.name || "").trim();
    if (name.length < 2 || name.length > 24) {
      const err = new Error("Name must be 2–24 characters");
      err.status = 400;
      throw err;
    }
    if (/\d/.test(name)) {
      const err = new Error(NAME_NO_DIGITS_MSG);
      err.status = 400;
      throw err;
    }
    out.name = name;

    // Every new operative starts with a full fuel tank (admins included).
    const now = new Date().toISOString();
    out.fuel = FUEL_MAX;
    out.max_fuel = FUEL_MAX;
    out.fuel_purchases = 0;
    out.fuel_reset_at = now;
    out.fuel_updated_at = now;

    if (!isAdmin(user)) {
      const existingCount = entities.Character.filter({ created_by_id: user.id }, null, 50).length;
      try {
        assertCanCreateCharacter(user.id, existingCount);
      } catch (err) {
        if (err instanceof EntitlementError || err.code === "CHARACTER_SLOT_LIMIT_REACHED") {
          const e = new Error(err.message || "Character slot limit reached");
          e.status = 409;
          e.code = err.code || "CHARACTER_SLOT_LIMIT_REACHED";
          throw e;
        }
        throw err;
      }
      const clientNova = Number(out.nova_crystals) || 0;

      out.level = 1;
      out.experience = 0;
      out.experience_to_next_level = expForLevel(1);
      out.stardust = 0;
      out.total_stardust_earned = 0;
      out.unspent_stat_points = 0;
      out.attribute_purchases = 0;
      out.attribute_purchases_by_stat = {
        strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0,
      };
      out.missions_completed = 0;
      out.highest_sector = 1;
      out.active_mission_id = "";
      out.mission_end_time = "";
      if (!out.equipped_items || typeof out.equipped_items !== "object") {
        out.equipped_items = {};
      }
      // Force class base stats — never trust client progression attributes.
      const base = CLASS_BASE_STATS[out.class];
      if (base) out.stats = { ...base };
      // First character may start with up to 100 nova from client; otherwise force 0.
      out.nova_crystals = existingCount === 0 ? Math.min(100, Math.max(0, clientNova)) : 0;

      // Strip other locked progression fields if client forged them.
      for (const key of CHARACTER_ECONOMY_FIELDS) {
        if (
          key === "level" || key === "experience" || key === "experience_to_next_level"
          || key === "stardust" || key === "total_stardust_earned"
          || key === "unspent_stat_points" || key === "attribute_purchases"
          || key === "attribute_purchases_by_stat" || key === "fuel" || key === "max_fuel"
          || key === "fuel_purchases" || key === "fuel_reset_at" || key === "fuel_updated_at"
          || key === "missions_completed" || key === "highest_sector"
          || key === "active_mission_id" || key === "mission_end_time"
          || key === "nova_crystals" || key === "stats"
        ) {
          continue;
        }
        delete out[key];
      }
    }
  }

  // Item / mission must attach to caller's character when character_id provided
  if ((type === "Item" || type === "Mission" || type === "DailyLogin") && out.character_id) {
    if (!characterOwnedByUser(user, out.character_id) && !isAdmin(user)) {
      const err = new Error("character_id does not belong to you");
      err.status = 403;
      throw err;
    }
  }

  if (type === "Mail" && out.owner_id && !isAdmin(user)) {
    // Allow sending mail TO other characters (guild invites), but from must be yours if set
    if (out.from_id && !characterOwnedByUser(user, out.from_id)) {
      const err = new Error("from_id does not belong to you");
      err.status = 403;
      throw err;
    }
    // Critical #5: players cannot forge claimable reward mail
    delete out.rewards;
    delete out.has_rewards;
    out.has_rewards = false;
    out.claimed = false;
  }

  if (type === "PromoCode" && !isAdmin(user)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }

  return out;
}

/**
 * Strip locked economy / reward fields from update payloads for non-admins.
 */
export function sanitizeUpdatePayload(user, type, data = {}) {
  if (isAdmin(user)) {
    const out = { ...data };
    if (type === "Character" && out.name != null) {
      out.name = String(out.name).trim();
      assertNameHasNoDigits(out.name);
    }
    return out;
  }
  const out = { ...data };

  if (type === "Character") {
    for (const key of CHARACTER_ECONOMY_FIELDS) {
      delete out[key];
    }
    if (out.name != null) {
      out.name = String(out.name).trim();
      if (out.name.length < 2 || out.name.length > 24) {
        const err = new Error("Name must be 2–24 characters");
        err.status = 400;
        throw err;
      }
      assertNameHasNoDigits(out.name);
    }
  }

  if (type === "Item") {
    for (const key of Object.keys(out)) {
      if (!ITEM_ALLOWED_UPDATE_FIELDS.has(key)) delete out[key];
    }
  }

  if (type === "Mail") {
    delete out.rewards;
    delete out.has_rewards;
  }

  return out;
}

/** True if a query has at least one concrete field constraint (not empty / not only empty $and). */
export function queryIsConstrained(query) {
  if (!query || typeof query !== "object") return false;
  const keys = Object.keys(query).filter((k) => k !== "$and" && k !== "$or");
  if (keys.length > 0) return true;
  if (Array.isArray(query.$or) && query.$or.some(queryIsConstrained)) return true;
  if (Array.isArray(query.$and) && query.$and.length > 0 && query.$and.every(queryIsConstrained)) return true;
  return false;
}

/**
 * Scope list/filter for highly sensitive types.
 * Returns null to use the request query as-is; otherwise a forced query merge.
 */
export function scopeReadQuery(user, type, query = {}) {
  if (isAdmin(user)) return query;

  if (type === "PromoCode") {
    // Players may look up a single code string for redeem UX; no full list dumps.
    if (query.code && typeof query.code === "string") return { code: query.code };
    const err = new Error("Promo codes are not listable");
    err.status = 403;
    throw err;
  }

  if (type === "PlayerModeration") {
    const ids = characterIdsForUser(user.id);
    return { ...query, character_id: { $in: ids } };
  }

  if (type === "PrivateMessage") {
    const ids = characterIdsForUser(user.id);
    return {
      $or: [
        { sender_id: { $in: ids } },
        { recipient_id: { $in: ids } },
      ],
    };
  }

  if (type === "Mail") {
    const ids = characterIdsForUser(user.id);
    // Keep caller filters but always require ownership path
    return {
      $and: [
        query && Object.keys(query).length ? query : { id: { $exists: true } },
        {
          $or: [
            { owner_id: { $in: ids } },
            { from_id: { $in: ids } },
          ],
        },
      ],
    };
  }

  return query;
}

export function assertCanWrite(user, type, doc) {
  if (canWriteDoc(user, type, doc)) return;
  const err = new Error("Forbidden");
  err.status = 403;
  throw err;
}

export function assertCanDelete(user, type, doc) {
  if (canDeleteDoc(user, type, doc)) return;
  const err = new Error(
    type === "Item"
      ? "Use DissolveItem or UseConsumable"
      : "Forbidden"
  );
  err.status = 403;
  throw err;
}

export function assertCanCreate(user, type, data) {
  if (canCreateType(user, type, data)) return;
  const err = new Error("Forbidden");
  err.status = 403;
  throw err;
}
