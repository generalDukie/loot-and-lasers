import React from "react";
import { motion } from "framer-motion";
import { Flag } from "lucide-react";

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function ChatMessageItem({ msg, isMine, onTagSender, showAvatar = true }) {
  if (msg.deleted) {
    return <div className="text-center text-[10px] text-muted-foreground italic py-1">— message removed —</div>;
  }
  const initial = (msg.sender_name || "?")[0]?.toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}
    >
      {showAvatar && (
        <div className="w-7 h-7 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center text-xs font-bold shrink-0" style={{ color: "#22D3EE" }}>
          {initial}
        </div>
      )}
      <div className={`max-w-[78%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {msg.sender_guild_tag && <span className="text-amber-300">[{msg.sender_guild_tag}]</span>}
          <button className="font-display font-semibold text-foreground/80 hover:text-primary" onClick={() => onTagSender?.(msg)}>
            {msg.sender_name}
          </button>
          <span>Lv{msg.sender_level || 1}</span>
          <span>· {timeAgo(msg.created_date)}</span>
        </div>
        <div className={`px-3 py-1.5 rounded-2xl text-sm ${isMine ? "bg-primary/20 rounded-tr-sm" : "bg-muted/30 rounded-tl-sm"}`}>
          {msg.content}
        </div>
      </div>
    </motion.div>
  );
}