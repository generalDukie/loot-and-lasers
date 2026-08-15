import { DEFAULT_ARENA_RATING } from "@/lib/arenaEngine";

/** Convert a server defense snapshot into Arena opponent shape. */
export function defenseSnapshotToOpponent(snap) {
  if (!snap) return null;
  const equippedItems = snap.equippedItems || [];
  return {
    id: `real-${snap.characterId}`,
    realCharacterId: snap.characterId,
    name: snap.name,
    race: snap.race,
    class: snap.class,
    level: snap.level || 1,
    arena_rating: snap.arena_rating || DEFAULT_ARENA_RATING,
    stats: snap.stats || {},
    power: 0,
    arena_wins: snap.arena_wins || 0,
    arena_losses: snap.arena_losses || 0,
    guild: null,
    lastOnlineMins: 0,
    appearance: snap.appearance || {},
    avatar_url: snap.avatar_url,
    active_title: snap.active_title,
    isBot: false,
    equippedItems,
    speciesId: null,
    directChallenge: true,
  };
}

export function newChallengeIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `dc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
