import { ACHIEVEMENTS } from "@/lib/achievements";

/** Show a toast when a server response includes newly_unlocked achievement ids. */
export function toastNewAchievements(res, toast) {
  const ids = res?.newly_unlocked || res?.data?.newly_unlocked || [];
  if (!ids.length || !toast) return;
  const entries = ids.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean);
  const icons = entries.map((a) => a.icon).join(" ");
  const names = entries.map((a) => a.name).join(", ");
  toast({
    title: `${icons || "🏆"} ${ids.length > 1 ? "Achievements" : "Achievement"} unlocked!`,
    description: names || ids.join(", "),
  });
}
