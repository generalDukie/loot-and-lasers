import React from "react";
import { motion } from "framer-motion";
import { MessageSquare, UserCircle, X } from "lucide-react";
import { fullName } from "@/lib/legacyName";

export default function FriendRow({ friend, presence, onMessage, onProfile, onRemove }) {
  const status = presence?.status;
  const isOnline = presence && (Date.now() - new Date(presence.last_seen_at).getTime()) < 90000;
  const dotColor = !isOnline ? "#6B7280" : status === "in_mission" ? "#FBBF24" : "#34D399";

  function formatOffline(lastSeenAt) {
    if (!lastSeenAt) return "Offline";
    const diffMs = Date.now() - new Date(lastSeenAt).getTime();
    const totalHours = diffMs / 3600000;
    if (totalHours < 1) {
      const mins = Math.max(1, Math.floor(diffMs / 60000));
      return `Offline · ${mins}m ago`;
    }
    if (totalHours < 24) {
      const h = Math.floor(totalHours);
      return `Offline · ${h}h ago`;
    }
    const d = Math.floor(totalHours / 24);
    return `Offline · ${d}d ago`;
  }

  const statusText = !isOnline ? formatOffline(presence?.last_seen_at) : status === "in_mission" ? "In Mission" : "Online";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
      className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/15 border border-border/20 hover:border-primary/30 transition-colors"
    >
      <div className="relative w-10 h-10 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-center font-display font-bold shrink-0" style={{ color: "#22D3EE" }}>
        {(friend.name || "?")[0]?.toUpperCase()}
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card" style={{ background: dotColor }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display font-semibold text-sm truncate">{fullName(friend) || friend.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          Lv {friend.level || 1} · {friend.class}{friend.guild_tag ? ` · [${friend.guild_tag}]` : ""} · {statusText}
        </p>
      </div>
      <button onClick={() => onMessage(friend)} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary" title="Message">
        <MessageSquare className="w-4 h-4" />
      </button>
      <button onClick={() => onProfile(friend)} className="p-1.5 rounded-lg hover:bg-muted/30 text-muted-foreground" title="Profile">
        <UserCircle className="w-4 h-4" />
      </button>
      <button onClick={() => onRemove(friend)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive" title="Remove">
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}