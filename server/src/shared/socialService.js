/**
 * Social authority (Restoration 23): profiles, friends, blocks, presence, search.
 * Node owns persistent relationships. Clients display and request mutations via RPCs.
 */
import { entities } from "../entities.js";
import { getUserRowById } from "../auth.js";
import { clock } from "./time/clock.js";
import { serializePublicProfileStatistics } from "./statisticsService.js";
import { tryCreateNotification } from "./notificationService.js";
import { computeArenaRank } from "./arenaService.js";
import { ARENA_DEFAULT_RATING } from "../arena/config.js";

const PRESENCE_OFFLINE_MS = 90_000;
const PRESENCE_STATUSES = new Set(["online", "away", "busy", "offline", "in_mission"]);
const SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const SOCIAL_DIRECTORY_QUERY_LIMIT = 500;
const FRIENDSHIP_QUERY_LIMIT = 500;
const PENDING_PAIR_QUERY_LIMIT = 5;
const FRIEND_REQUEST_LIST_LIMIT = 100;
const BLOCK_LIST_LIMIT = 200;
const BLOCK_PENDING_CLEANUP_LIMIT = 10;
const BLOCK_MATCH_QUERY_LIMIT = 5;
const PUBLIC_ACHIEVEMENT_LIMIT = 24;

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "SOCIAL_ERROR";
  throw e;
}

function normalizeForSearch(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Legacy identity always resolves from the owning account row, so other players
 * recognize every operative on an account even when the doc was never stamped.
 * `cache` lets batch serializers avoid one user lookup per character.
 */
function accountLegacy(ch, cache = null) {
  const ownerId = ch?.created_by_id || "";
  let row = null;
  if (ownerId) {
    if (cache && cache.has(ownerId)) {
      row = cache.get(ownerId);
    } else {
      row = getUserRowById(ownerId) || null;
      if (cache) cache.set(ownerId, row);
    }
  }
  const mode = row?.legacy_display || ch?.legacy_display;
  return {
    legacy_name: row?.legacy_name || ch?.legacy_name || null,
    legacy_display: mode === "family" ? "family" : "surname",
  };
}

export function isBlocked(blockerId, blockedId) {
  if (!blockerId || !blockedId) return false;
  return entities.Block.filter({ blocker_id: blockerId, blocked_id: blockedId }, null, 1).length > 0;
}

export function isBlockedEitherWay(a, b) {
  return isBlocked(a, b) || isBlocked(b, a);
}

function friendshipBetween(a, b) {
  const rows = entities.Friendship.filter(
    { participant_ids: a },
    null,
    FRIENDSHIP_QUERY_LIMIT,
  ) || [];
  return rows.find((f) => (f.participant_ids || []).includes(b)) || null;
}

function pendingBetween(a, b) {
  const out = entities.FriendRequest.filter(
    { from_character_id: a, to_character_id: b, status: "pending" },
    null,
    PENDING_PAIR_QUERY_LIMIT,
  );
  const inn = entities.FriendRequest.filter(
    { from_character_id: b, to_character_id: a, status: "pending" },
    null,
    PENDING_PAIR_QUERY_LIMIT,
  );
  return out[0] || inn[0] || null;
}

function serializeFriendRequest(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    from_character_id: doc.from_character_id,
    to_character_id: doc.to_character_id,
    from_name: doc.from_name || "",
    to_name: doc.to_name || "",
    status: doc.status || "pending",
    created_date: doc.created_date,
  };
}

function serializeFriendship(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    participant_ids: doc.participant_ids || [],
    created_date: doc.created_date,
  };
}

function serializeBlock(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    blocker_id: doc.blocker_id,
    blocked_id: doc.blocked_id,
    blocked_name: doc.blocked_name || "",
    created_date: doc.created_date,
  };
}

function presenceIsOnline(doc, nowMs = clock.nowMs()) {
  if (!doc) return false;
  if (doc.status === "offline") return false;
  const seen = Date.parse(doc.last_seen_at || doc.updated_date || doc.created_date || 0);
  if (!Number.isFinite(seen)) return false;
  return nowMs - seen <= PRESENCE_OFFLINE_MS;
}

export function serializePresence(doc, nowMs = clock.nowMs()) {
  if (!doc) return null;
  const online = presenceIsOnline(doc, nowMs);
  return {
    id: doc.id,
    character_id: doc.character_id,
    character_name: doc.character_name || "",
    status: online ? (doc.status === "offline" ? "online" : doc.status || "online") : "offline",
    online,
    last_seen_at: doc.last_seen_at || doc.updated_date || null,
  };
}

/**
 * Public profile card — no currency / private inventory.
 */
export function serializePublicProfile(characterId) {
  const ch = entities.Character.get(characterId);
  if (!ch) return null;

  const membership = entities.GuildMember.filter({ character_id: ch.id }, null, 1)[0];
  let guild = null;
  if (membership) {
    const g = entities.Guild.get(membership.guild_id);
    if (g) {
      guild = {
        id: g.id,
        name: g.name,
        tag: g.tag || "",
        level: g.level || 1,
        role: membership.role || "member",
      };
    }
  }

  const presenceDoc = entities.PlayerPresence.filter({ character_id: ch.id }, null, 1)[0];
  const achievements = Array.isArray(ch.unlocked_achievements) ? ch.unlocked_achievements : [];
  const statistics = serializePublicProfileStatistics(ch);

  return {
    id: ch.id,
    name: ch.name,
    ...accountLegacy(ch),
    class: ch.class || null,
    race: ch.race || null,
    level: ch.level || 1,
    avatar_url: ch.avatar_url || "",
    active_title: ch.active_title || null,
    arena_rating: ch.arena_rating || ARENA_DEFAULT_RATING,
    arena_rank: computeArenaRank(ch.id),
    arena_wins: ch.arena_wins || 0,
    arena_losses: ch.arena_losses || 0,
    guild,
    presence: serializePresence(presenceDoc),
    public_achievements: achievements.slice(0, PUBLIC_ACHIEVEMENT_LIMIT),
    achievement_count: achievements.length,
    statistics,
  };
}

export function searchCharacters(query, { excludeId = null, limit = SEARCH_LIMIT } = {}) {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const lim = Math.max(1, Math.min(MAX_SEARCH_LIMIT, Number(limit) || SEARCH_LIMIT));
  const all = entities.Character.list("-created_date", SOCIAL_DIRECTORY_QUERY_LIMIT) || [];
  const legacyCache = new Map();
  const hits = [];
  for (const c of all) {
    if (excludeId && c.id === excludeId) continue;
    if (!normalizeForSearch(c.name).includes(q)) continue;
    hits.push({
      id: c.id,
      name: c.name,
      ...accountLegacy(c, legacyCache),
      level: c.level || 1,
      class: c.class || null,
      race: c.race || null,
      avatar_url: c.avatar_url || "",
      arena_rating: c.arena_rating || ARENA_DEFAULT_RATING,
    });
    if (hits.length >= lim) break;
  }
  return hits;
}

export function getFriends(characterId) {
  return (
    entities.Friendship.filter(
      { participant_ids: characterId },
      null,
      FRIENDSHIP_QUERY_LIMIT,
    ) || []
  ).map(serializeFriendship);
}

export function getIncomingRequests(characterId) {
  return (
    entities.FriendRequest.filter(
      { to_character_id: characterId, status: "pending" },
      "-created_date",
      FRIEND_REQUEST_LIST_LIMIT,
    ) || []
  ).map(serializeFriendRequest);
}

export function getOutgoingRequests(characterId) {
  return (
    entities.FriendRequest.filter(
      { from_character_id: characterId, status: "pending" },
      "-created_date",
      FRIEND_REQUEST_LIST_LIMIT,
    ) || []
  ).map(serializeFriendRequest);
}

export function getBlocks(characterId) {
  return (
    entities.Block.filter({ blocker_id: characterId }, null, BLOCK_LIST_LIMIT) || []
  ).map(serializeBlock);
}

export function getSocialState(characterId) {
  return {
    friends: getFriends(characterId),
    incoming_requests: getIncomingRequests(characterId),
    outgoing_requests: getOutgoingRequests(characterId),
    blocks: getBlocks(characterId),
  };
}

export function sendFriendRequest(fromChar, toCharacterId) {
  if (!fromChar?.id) httpErr(400, "Missing sender");
  const toId = String(toCharacterId || "").trim();
  if (!toId) httpErr(400, "Missing target");
  if (fromChar.id === toId) httpErr(400, "Cannot friend yourself.");
  const toChar = entities.Character.get(toId);
  if (!toChar) httpErr(404, "Character not found");
  if (isBlocked(toChar.id, fromChar.id)) httpErr(403, "You cannot send a request to this player.");
  if (isBlocked(fromChar.id, toChar.id)) httpErr(403, "Unblock this player before sending a request.");
  if (pendingBetween(fromChar.id, toChar.id)) {
    httpErr(409, "A request is already pending between you.");
  }
  if (friendshipBetween(fromChar.id, toChar.id)) httpErr(409, "You are already friends.");

  const req = entities.FriendRequest.create({
    from_character_id: fromChar.id,
    to_character_id: toChar.id,
    from_name: fromChar.name,
    to_name: toChar.name,
    status: "pending",
  });
  tryCreateNotification({
    owner_id: toChar.id,
    type: "friend_request",
    title: fromChar.name,
    body: "sent you a friend request",
    related_id: req.id,
    priority: "normal",
    idempotency_key: `friend_req:${req.id}`,
  });
  return { request: serializeFriendRequest(req), state: getSocialState(fromChar.id) };
}

export function acceptFriendRequest(myChar, requestId) {
  const req = entities.FriendRequest.get(requestId);
  if (!req) httpErr(404, "Request not found");
  if (req.to_character_id !== myChar.id) httpErr(403, "Not your request");
  if (req.status !== "pending") httpErr(409, "Request is no longer pending");
  if (isBlockedEitherWay(myChar.id, req.from_character_id)) {
    entities.FriendRequest.update(req.id, { status: "declined" });
    httpErr(403, "Cannot accept while blocked");
  }
  const participants = [req.from_character_id, req.to_character_id].sort();
  let friendship = friendshipBetween(participants[0], participants[1]);
  if (!friendship) {
    friendship = entities.Friendship.create({ participant_ids: participants });
  }
  entities.FriendRequest.update(req.id, { status: "accepted" });
  tryCreateNotification({
    owner_id: req.from_character_id,
    type: "system",
    title: myChar.name,
    body: "accepted your friend request",
    priority: "normal",
    idempotency_key: `friend_accept:${req.id}`,
  });
  return {
    friendship: serializeFriendship(friendship),
    request: serializeFriendRequest(entities.FriendRequest.get(req.id)),
    state: getSocialState(myChar.id),
  };
}

export function declineFriendRequest(myChar, requestId) {
  const req = entities.FriendRequest.get(requestId);
  if (!req) httpErr(404, "Request not found");
  if (req.to_character_id !== myChar.id && req.from_character_id !== myChar.id) {
    httpErr(403, "Not your request");
  }
  if (req.status !== "pending") httpErr(409, "Request is no longer pending");
  const updated = entities.FriendRequest.update(req.id, { status: "declined" });
  return { request: serializeFriendRequest(updated), state: getSocialState(myChar.id) };
}

export function cancelFriendRequest(myChar, requestId) {
  return declineFriendRequest(myChar, requestId);
}

export function removeFriend(myChar, otherId) {
  const other = String(otherId || "").trim();
  if (!other) httpErr(400, "Missing friend id");
  const f = friendshipBetween(myChar.id, other);
  if (!f) httpErr(404, "Not friends");
  entities.Friendship.delete(f.id);
  return { success: true, state: getSocialState(myChar.id) };
}

export function blockPlayer(myChar, blockedId) {
  const bid = String(blockedId || "").trim();
  if (!bid) httpErr(400, "Missing target");
  if (bid === myChar.id) httpErr(400, "Cannot block yourself");
  const blocked = entities.Character.get(bid);
  if (!blocked) httpErr(404, "Character not found");

  const f = friendshipBetween(myChar.id, bid);
  if (f) entities.Friendship.delete(f.id);

  const pend = entities.FriendRequest.filter(
    { from_character_id: bid, to_character_id: myChar.id, status: "pending" },
    null,
    BLOCK_PENDING_CLEANUP_LIMIT,
  );
  for (const r of pend) entities.FriendRequest.update(r.id, { status: "declined" });
  const out = entities.FriendRequest.filter(
    { from_character_id: myChar.id, to_character_id: bid, status: "pending" },
    null,
    BLOCK_PENDING_CLEANUP_LIMIT,
  );
  for (const r of out) entities.FriendRequest.update(r.id, { status: "declined" });

  let block = entities.Block.filter({ blocker_id: myChar.id, blocked_id: bid }, null, 1)[0];
  if (!block) {
    block = entities.Block.create({
      blocker_id: myChar.id,
      blocked_id: bid,
      blocked_name: blocked.name,
    });
  }
  return { block: serializeBlock(block), state: getSocialState(myChar.id) };
}

export function unblockPlayer(myChar, blockedId) {
  const bid = String(blockedId || "").trim();
  if (!bid) httpErr(400, "Missing target");
  const list = entities.Block.filter(
    { blocker_id: myChar.id, blocked_id: bid },
    null,
    BLOCK_MATCH_QUERY_LIMIT,
  );
  for (const b of list) entities.Block.delete(b.id);
  return { success: true, state: getSocialState(myChar.id) };
}

export function setPresence(myChar, status = "online") {
  const st = String(status || "online").toLowerCase();
  const normalized = PRESENCE_STATUSES.has(st) ? st : "online";
  const now = new Date(clock.nowMs()).toISOString();
  let doc = entities.PlayerPresence.filter({ character_id: myChar.id }, null, 1)[0];
  if (!doc) {
    doc = entities.PlayerPresence.create({
      character_id: myChar.id,
      character_name: myChar.name,
      status: normalized,
      last_seen_at: now,
    });
  } else {
    doc = entities.PlayerPresence.update(doc.id, {
      status: normalized,
      last_seen_at: now,
      character_name: myChar.name,
    });
  }
  return { presence: serializePresence(doc) };
}

export function getPresenceMap(characterIds = []) {
  const ids = [...new Set((characterIds || []).filter(Boolean))];
  const map = {};
  const now = clock.nowMs();
  for (const id of ids) {
    const doc = entities.PlayerPresence.filter({ character_id: id }, null, 1)[0];
    map[id] = serializePresence(doc, now) || {
      character_id: id,
      status: "offline",
      online: false,
      last_seen_at: null,
    };
  }
  return map;
}

export function getCharactersByIds(ids = []) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  const legacyCache = new Map();
  return uniq
    .map((id) => entities.Character.get(id))
    .filter(Boolean)
    .map((c) => ({
      id: c.id,
      name: c.name,
      ...accountLegacy(c, legacyCache),
      level: c.level || 1,
      class: c.class || null,
      race: c.race || null,
      avatar_url: c.avatar_url || "",
      arena_rating: c.arena_rating || ARENA_DEFAULT_RATING,
      active_title: c.active_title || null,
    }));
}
