/**
 * Entity access control — ownership + admin gates for the document CRUD API.
 * Reads stay relatively open where the client needs public data (arena, social);
 * mutations require ownership (or admin).
 */
import { entities } from "./entities.js";

export function isAdmin(user) {
  return user?.role === "admin";
}

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
    case "Character":
    case "Item":
    case "Mission":
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
    case "NexusAssault":
      return true;
    default:
      return false;
  }
}

/**
 * Strip client-controlled ownership / id forges on create.
 * Rejects client-supplied ids (Critical #3) unless admin.
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

export function assertCanCreate(user, type, data) {
  if (canCreateType(user, type, data)) return;
  const err = new Error("Forbidden");
  err.status = 403;
  throw err;
}
