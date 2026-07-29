import { api } from "@/api/gameClient";

/** Fire-and-forget stardust sink logging for admin economy analytics. */
export async function trackStardustSpend(character, amount, source) {
  if (!character || !amount || amount <= 0) return;
  try {
    await api.entities.StardustSpendEvent.create({
      character_id: character.id,
      character_name: character.name,
      amount: Math.floor(amount),
      source,
      balance_after: Math.max(0, (character.stardust || 0) - Math.floor(amount)),
    });
  } catch {
    /* analytics must never block gameplay */
  }
}
