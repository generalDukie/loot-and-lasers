import { api } from "@/api/gameClient";
import { getWeekKey, weekEndDate } from "@/lib/guildEngine";

/** Weekly F2P Nova drip — earn by playing, claim from Crystal Store. */
export const WEEKLY_NOVA_QUESTS = [
  {
    id: "arena",
    key: "arena",
    label: "Arena Ace",
    desc: "Win 5 Arena battles",
    goal: 5,
    reward: 8,
    emoji: "⚔️",
  },
  {
    id: "dungeon",
    key: "dungeon",
    label: "Dungeon Delver",
    desc: "Win 3 dungeon fights",
    goal: 3,
    reward: 7,
    emoji: "🧭",
  },
  {
    id: "missions",
    key: "missions",
    label: "Mission Runner",
    desc: "Complete 5 missions",
    goal: 5,
    reward: 5,
    emoji: "🍺",
  },
];

export function ensureWeeklyNovaState(character) {
  const week = getWeekKey();
  const raw = character?.weekly_nova_quests;
  if (raw && raw.week === week) {
    return {
      week,
      arena: raw.arena || 0,
      dungeon: raw.dungeon || 0,
      missions: raw.missions || 0,
      claimed: Array.isArray(raw.claimed) ? raw.claimed : [],
    };
  }
  return { week, arena: 0, dungeon: 0, missions: 0, claimed: [] };
}

/** Returns updated weekly_nova_quests object to merge into a Character.update (or null if no change). */
export function progressWeeklyNovaQuest(character, key, amount = 1) {
  if (!character || amount <= 0) return null;
  if (!WEEKLY_NOVA_QUESTS.some((q) => q.key === key)) return null;
  const state = ensureWeeklyNovaState(character);
  const quest = WEEKLY_NOVA_QUESTS.find((q) => q.key === key);
  const nextVal = Math.min(quest.goal, (state[key] || 0) + amount);
  if (nextVal === (state[key] || 0)) return state; // already at cap — still return state so week stays current
  return { ...state, [key]: nextVal };
}

export function weeklyNovaQuestStatus(character) {
  const state = ensureWeeklyNovaState(character);
  return WEEKLY_NOVA_QUESTS.map((q) => {
    const progress = state[q.key] || 0;
    const claimed = state.claimed.includes(q.id);
    const complete = progress >= q.goal;
    return { ...q, progress, claimed, complete, claimable: complete && !claimed };
  });
}

export function weeklyNovaSecondsLeft() {
  const end = new Date(weekEndDate()).getTime();
  return Math.max(0, Math.floor((end - Date.now()) / 1000));
}

/**
 * Claim a completed weekly quest. Awards nova and marks claimed.
 * Returns { characterPatch, quest } or throws on failure.
 */
export async function claimWeeklyNovaQuest(character, questId) {
  const quest = WEEKLY_NOVA_QUESTS.find((q) => q.id === questId);
  if (!quest) throw new Error("Unknown quest");
  const fresh = await api.entities.Character.get(character.id);
  const state = ensureWeeklyNovaState(fresh);
  if (state.claimed.includes(questId)) throw new Error("Already claimed");
  if ((state[quest.key] || 0) < quest.goal) throw new Error("Quest not complete");

  const nextState = { ...state, claimed: [...state.claimed, questId] };
  const patch = {
    weekly_nova_quests: nextState,
    nova_crystals: (fresh.nova_crystals || 0) + quest.reward,
  };
  await api.entities.Character.update(character.id, patch);
  return { patch, quest, character: { ...fresh, ...patch } };
}
