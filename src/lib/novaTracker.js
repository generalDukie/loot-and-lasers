import { api } from "@/api/gameClient";

// Behind-the-scenes analytics: logs every Nova Crystal spend so admins can
// track player behaviour. Fire-and-forget — never throws or blocks the spend.
export async function trackNovaSpend(character, amount, source) {
  if (!character || !amount || amount <= 0) return;
  try {
    await api.entities.NovaSpendEvent.create({
      character_id: character.id,
      character_name: character.name,
      amount,
      source,
      balance_after: Math.max(0, (character.nova_crystals || 0) - amount),
    });
  } catch {}
}