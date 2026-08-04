import { api } from "@/api/gameClient";

/**
 * Permanently delete a character and related rows via Node DeleteMyCharacter.
 * Entity deleteMany is locked for social/mail/news — do not call those from the client.
 */
export async function purgeCharacter(characterId, _characterName) {
  void _characterName;
  const res = await api.functions.invoke("DeleteMyCharacter", {
    character_id: characterId,
  });
  const data = res?.data || res || {};
  if (data.error) throw new Error(data.error);
  return data;
}
