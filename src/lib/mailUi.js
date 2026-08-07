import {
  Inbox,
  Send,
  Cog,
  Trash2,
  Gift,
  Users,
  User,
  Handshake,
  Sparkles,
  Radio,
} from "lucide-react";

/** API-backed mailbox folders. */
export const MAIL_FOLDERS = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "sent", label: "Sent", icon: Send },
  { key: "system", label: "System", icon: Cog },
  { key: "deleted", label: "Deleted", icon: Trash2 },
];

/**
 * Client-side category filters (inbox-focused, future-proof).
 * `soon: true` = visible but disabled until that mail type exists.
 */
export const MAIL_CATEGORIES = [
  { key: "all", label: "All", icon: Radio },
  { key: "system", label: "System", icon: Cog },
  { key: "rewards", label: "Rewards", icon: Gift },
  { key: "guild", label: "Guild", icon: Users },
  { key: "friends", label: "Friends", icon: User },
  { key: "trades", label: "Trades", icon: Handshake, soon: true },
  { key: "events", label: "Events", icon: Sparkles, soon: true },
];

export function mailCategoryOf(mail) {
  const type = String(mail?.mail_type || "player").toLowerCase();
  if (mail?.has_rewards) return "rewards";
  if (type.includes("guild")) return "guild";
  if (type === "system" || type === "admin" || type === "event") return type === "event" ? "events" : "system";
  if (type === "trade" || type === "auction" || type === "marketplace") return "trades";
  if (type === "player" || type === "friend") return "friends";
  return "friends";
}

export function filterMailsByCategory(mails, category) {
  if (!category || category === "all") return mails;
  return (mails || []).filter((m) => {
    const type = String(m.mail_type || "player").toLowerCase();
    switch (category) {
      case "rewards":
        return !!m.has_rewards;
      case "guild":
        return type.includes("guild");
      case "system":
        return type === "system" || type === "admin";
      case "friends":
        return type === "player" || type === "friend";
      case "trades":
        return type === "trade" || type === "auction" || type === "marketplace";
      case "events":
        return type === "event" || type === "daily" || type === "login_reward";
      default:
        return true;
    }
  });
}

export function mailPreview(mail, max = 72) {
  const raw = String(mail?.body || "").replace(/\s+/g, " ").trim();
  if (!raw) return "No message body";
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

export function formatMailTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function summarizeRewards(rewards) {
  if (!rewards) return "";
  const parts = [];
  if (rewards.stardust) parts.push(`${Number(rewards.stardust).toLocaleString()} Stardust`);
  if (rewards.nova_crystals) parts.push(`${rewards.nova_crystals} Nova`);
  if (rewards.fuel) parts.push(`${rewards.fuel} Fuel`);
  if (rewards.item_rarity) parts.push(`${rewards.item_rarity} gear`);
  if (rewards.collectible) parts.push(rewards.collectible.name || "Collectible");
  if (Array.isArray(rewards.items) && rewards.items.length) {
    parts.push(`${rewards.items.length} item${rewards.items.length > 1 ? "s" : ""}`);
  }
  return parts.join(" · ") || "Attached package";
}

export function isMailPriority(mail) {
  return !!(mail?.has_rewards && !mail?.claimed) || String(mail?.mail_type || "").includes("guild");
}
