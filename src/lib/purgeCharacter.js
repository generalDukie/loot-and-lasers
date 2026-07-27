import { api } from "@/api/gameClient";

// Best-effort delete of every record tied to a character. Each cleanup is
// wrapped in its own try/catch so a single failing entity can't block the
// rest of the purge (or the character deletion itself).
//
// GalaxyNews is keyed by character_name (not character_id), so callers must
// pass the name to fully clear a character's news footprint.
export async function purgeCharacter(characterId, characterName) {
  const byId = [
    ["Item", { character_id: characterId }],
    ["Mission", { character_id: characterId }],
    ["Mail", { owner_id: characterId }],
    ["AppNotification", { owner_id: characterId }],
    ["GuildMember", { character_id: characterId }],
    ["PlayerPresence", { character_id: characterId }],
    ["DailyLogin", { character_id: characterId }],
    ["ChatMessage", { sender_id: characterId }],
    ["PrivateMessage", { sender_id: characterId }],
    ["PrivateMessage", { recipient_id: characterId }],
    ["FriendRequest", { from_character_id: characterId }],
    ["FriendRequest", { to_character_id: characterId }],
    ["Block", { blocker_id: characterId }],
    ["Block", { blocked_id: characterId }],
    ["Report", { reporter_id: characterId }],
    ["Report", { reported_id: characterId }],
  ];

  for (const [entity, query] of byId) {
    try {
      await api.entities[entity].deleteMany(query);
    } catch (e) {
      // keep going — partial cleanup is better than none
    }
  }

  // GalaxyNews references the character by name, not id.
  if (characterName) {
    try {
      await api.entities.GalaxyNews.deleteMany({ character_name: characterName });
    } catch (e) { /* best-effort */ }
  }
}