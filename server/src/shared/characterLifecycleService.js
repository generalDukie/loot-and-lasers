/**
 * Character delete + related cleanup (account settings).
 * Entity CRUD is locked for social/mail/news — purge must go through this RPC.
 */
import { db, nowIso } from "../db.js";
import { entities } from "../entities.js";
import { leaveGuild } from "./guildSocialService.js";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "CHARACTER_DELETE_ERROR";
  throw e;
}

function ownsCharacter(user, character) {
  if (!user || !character) return false;
  if (user.is_admin || user.role === "admin") return true;
  return character.created_by_id === user.id;
}

function purgeByQuery(type, query, limit = 2000) {
  const rows = entities[type]?.filter?.(query, null, limit) || [];
  let deleted = 0;
  for (const row of rows) {
    try {
      entities[type].delete(row.id);
      deleted += 1;
    } catch {
      /* best-effort */
    }
  }
  return deleted;
}

/**
 * Permanently delete an owned character and related gameplay rows.
 */
export function deleteMyCharacter(user, characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) httpErr(400, "character_id required");
  const character = entities.Character.get(cid);
  if (!character) httpErr(404, "Character not found");
  if (!ownsCharacter(user, character)) {
    httpErr(403, "Not your character");
  }

  // Leave guild first (handles leadership transfer / member_count).
  try {
    leaveGuild(character);
  } catch {
    /* already out or non-member — continue */
  }

  const counts = {
    Item: purgeByQuery("Item", { character_id: cid }),
    Mission: purgeByQuery("Mission", { character_id: cid }),
    Mail: purgeByQuery("Mail", { owner_id: cid }),
    AppNotification: purgeByQuery("AppNotification", { owner_id: cid }),
    GuildMember: purgeByQuery("GuildMember", { character_id: cid }),
    GuildWarReady: purgeByQuery("GuildWarReady", { character_id: cid }),
    PlayerPresence: purgeByQuery("PlayerPresence", { character_id: cid }),
    DailyLogin: purgeByQuery("DailyLogin", { character_id: cid }),
    ChatMessage: purgeByQuery("ChatMessage", { sender_id: cid }),
    PrivateMessage:
      purgeByQuery("PrivateMessage", { sender_id: cid }) +
      purgeByQuery("PrivateMessage", { recipient_id: cid }),
    FriendRequest:
      purgeByQuery("FriendRequest", { from_character_id: cid }) +
      purgeByQuery("FriendRequest", { to_character_id: cid }),
    Friendship: purgeByQuery("Friendship", { participant_ids: cid }),
    Block:
      purgeByQuery("Block", { blocker_id: cid }) +
      purgeByQuery("Block", { blocked_id: cid }),
    Report:
      purgeByQuery("Report", { reporter_id: cid }) +
      purgeByQuery("Report", { reported_id: cid }),
    GalaxyNews:
      purgeByQuery("GalaxyNews", { character_id: cid }) +
      (character.name
        ? purgeByQuery("GalaxyNews", { character_name: character.name })
        : 0),
    HubLayout: purgeByQuery("HubLayout", { character_id: cid }),
    NovaSpendEvent: purgeByQuery("NovaSpendEvent", { character_id: cid }),
    StardustSpendEvent: purgeByQuery("StardustSpendEvent", { character_id: cid }),
  };

  db.prepare(
    `UPDATE users SET active_character_id = NULL, updated_date = ? WHERE id = ? AND active_character_id = ?`,
  ).run(nowIso(), user.id, cid);

  entities.Character.delete(cid);
  return { success: true, character_id: cid, purged: counts };
}
