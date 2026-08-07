import { api } from "@/api/gameClient";

/**
 * Thin RPC client for the onboarding tutorial.
 * Progress is server-owned; never invent completion locally.
 */
export async function fetchTutorialState() {
  const res = await api.functions.invoke("GetTutorialState", {});
  return res?.data || res;
}

export async function advanceTutorial(payload = { action: "next" }) {
  const res = await api.functions.invoke("AdvanceTutorial", payload);
  return res?.data || res;
}

export async function skipTutorial() {
  const res = await api.functions.invoke("SkipTutorial", {});
  return res?.data || res;
}

export async function completeTutorial() {
  const res = await api.functions.invoke("CompleteTutorial", {});
  return res?.data || res;
}
