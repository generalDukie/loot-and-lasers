import { api } from "@/api/gameClient";
import {
  ARENA_HISTORY_LIMIT,
  snapshotOpponent,
  characterToOpponent,
} from "@/lib/arenaEngine";
import { getGuildMembership } from "@/lib/guildUtils";

export async function loadArenaHistory(characterId) {
  if (!characterId) return [];
  try {
    return (await api.entities.ArenaMatch.filter(
      { character_id: characterId },
      "-created_date",
      ARENA_HISTORY_LIMIT,
    )) || [];
  } catch {
    return [];
  }
}

export async function recordArenaMatch({ characterId, opp, won, ratingDelta, ratingAfter, isDefense = false }) {
  if (!characterId || !opp) return null;
  try {
    const record = await api.entities.ArenaMatch.create({
      character_id: characterId,
      opponent_real_id: opp.realCharacterId || null,
      opponent_name: opp.name,
      opponent_is_bot: !!opp.isBot,
      opponent_level: opp.level || 1,
      opponent_rating: opp.arena_rating || 1000,
      opponent_power: opp.power || 0,
      opponent_class: opp.class,
      opponent_race: opp.race,
      opponent_guild: opp.guild || null,
      won: !!won,
      rating_delta: ratingDelta || 0,
      rating_after: ratingAfter ?? null,
      is_defense: !!isDefense,
      arena_bot_id: opp.arena_bot_id || null,
      opponent_snapshot: snapshotOpponent(opp),
    });

    const all = await api.entities.ArenaMatch.filter(
      { character_id: characterId },
      "-created_date",
      ARENA_HISTORY_LIMIT + 20,
    );
    const excess = (all || []).slice(ARENA_HISTORY_LIMIT);
    await Promise.all(excess.map((old) => api.entities.ArenaMatch.delete(old.id).catch(() => null)));
    return record;
  } catch {
    return null;
  }
}

async function guildTagForCharacter(characterId) {
  try {
    const membership = await getGuildMembership(characterId);
    if (!membership) return null;
    const guild = await api.entities.Guild.get(membership.guild_id);
    return guild?.tag || guild?.name || null;
  } catch {
    return null;
  }
}

/**
 * Rebuild an opponent for revenge: live character + gear when real & available,
 * otherwise the frozen snapshot (bots / deleted accounts).
 */
export async function resolveRevengeOpponent(match, catalogItems = []) {
  const snap = match?.opponent_snapshot;
  if (!snap) return null;

  if (match.opponent_real_id) {
    try {
      const c = await api.entities.Character.get(match.opponent_real_id);
      if (c) {
        let eq = [];
        try {
          eq = (await api.entities.Item.filter({ character_id: c.id, is_equipped: true })) || [];
        } catch { /* use empty gear */ }
        const guildTag = await guildTagForCharacter(c.id);
        return characterToOpponent(c, eq, guildTag);
      }
    } catch { /* fall through to snapshot */ }
  }

  const equippedFromCatalog = (snap.equippedItemIds || [])
    .map((id) => catalogItems.find((c) => c.id === id))
    .filter(Boolean);
  const equippedItems = snap.equippedItems?.length ? snap.equippedItems : equippedFromCatalog;
  return {
    ...snap,
    id: snap.isBot ? `revenge-bot-${match.id}` : (snap.id || `revenge-${match.id}`),
    equippedItems,
    equippedItemIds: snap.equippedItemIds || equippedItems.map((i) => i.id).filter(Boolean),
    arena_bot_id: snap.arena_bot_id || match.arena_bot_id || null,
  };
}
