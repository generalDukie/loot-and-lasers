import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Megaphone } from "lucide-react";
import ChatPlayerMenu from "@/components/social/ChatPlayerMenu";

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function formatClock(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return timeAgo(iso);
  }
}

/**
 * Premium message bubble for station chat.
 * Differentiates own / other / guild-tagged / system without loud color.
 */
export default function ChatMessageItem({
  msg,
  isMine,
  onTagSender,
  onWhisper,
  showAvatar = true,
  compact = false,
}) {
  const nameBtnRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);

  if (msg.deleted) {
    return (
      <div className="text-center text-[10px] text-muted-foreground/70 italic py-2 tracking-wide">
        — transmission purged —
      </div>
    );
  }

  const isSystem = !!(msg.is_system || msg.channel === "system" || msg.sender_name === "System");
  const hasGuild = !!msg.sender_guild_tag;
  const initial = (msg.sender_name || "?")[0]?.toUpperCase();

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex justify-center py-1"
      >
        <div
          className="inline-flex items-center gap-2 max-w-[92%] px-3.5 py-2 rounded-xl text-[12px] text-amber-100/85 border"
          style={{
            borderColor: "hsl(40 60% 45% / 0.35)",
            background: "linear-gradient(90deg, hsl(40 50% 20% / 0.25), hsl(40 40% 14% / 0.15))",
            boxShadow: "0 0 16px hsl(40 80% 50% / 0.08)",
          }}
        >
          <Megaphone className="w-3.5 h-3.5 text-amber-300/80 shrink-0" />
          <span>{msg.content}</span>
          <span className="text-[9px] text-amber-200/45 tabular-nums shrink-0">
            {formatClock(msg.created_date)}
          </span>
        </div>
      </motion.div>
    );
  }

  const bubbleStyle = isMine
    ? {
        background: "linear-gradient(160deg, hsl(190 70% 35% / 0.32), hsl(200 55% 22% / 0.28))",
        borderColor: "hsl(190 70% 50% / 0.4)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2), 0 0 12px hsl(190 90% 50% / 0.1)",
      }
    : hasGuild
      ? {
          background: "linear-gradient(160deg, hsl(280 35% 22% / 0.35), hsl(230 25% 12% / 0.4))",
          borderColor: "hsl(280 40% 55% / 0.28)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        }
      : {
          background: "linear-gradient(160deg, hsl(220 20% 16% / 0.75), hsl(230 22% 11% / 0.8))",
          borderColor: "hsl(210 18% 32% / 0.45)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        };

  function openMenu(e) {
    e.stopPropagation();
    if (isMine) {
      onTagSender?.(msg);
      return;
    }
    const rect = (nameBtnRef.current || e.currentTarget).getBoundingClientRect();
    setAnchorRect(rect);
    setMenuOpen(true);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : ""} ${compact ? "py-0.5" : "py-0.5"}`}
      >
        {showAvatar && (
          <button
            type="button"
            onClick={openMenu}
            className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-[11px] font-display font-bold border transition-transform hover:scale-105 active:scale-95"
            style={{
              color: isMine ? "hsl(190 90% 70%)" : "hsl(190 70% 65%)",
              borderColor: isMine ? "hsl(190 70% 50% / 0.45)" : "hsl(210 20% 40% / 0.45)",
              background: isMine
                ? "hsl(190 60% 30% / 0.35)"
                : "hsl(220 18% 16% / 0.9)",
              boxShadow: isMine ? "0 0 10px hsl(190 90% 50% / 0.2)" : undefined,
            }}
            title={msg.sender_name}
          >
            {initial}
          </button>
        )}

        <div className={`max-w-[min(78%,28rem)] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
          <div
            className={`flex items-center gap-1.5 text-[10px] mb-1 px-0.5 ${
              isMine ? "flex-row-reverse" : ""
            }`}
          >
            {hasGuild && (
              <span
                className="font-display font-semibold tracking-wide px-1.5 py-0.5 rounded-md text-[9px]"
                style={{
                  color: "hsl(40 90% 70%)",
                  background: "hsl(40 50% 30% / 0.25)",
                  border: "1px solid hsl(40 50% 45% / 0.3)",
                }}
              >
                [{msg.sender_guild_tag}]
              </span>
            )}
            <button
              ref={nameBtnRef}
              type="button"
              className={`font-display font-semibold tracking-wide transition-colors ${
                isMine
                  ? "text-cyan-200/90 hover:text-cyan-100"
                  : "text-foreground/85 hover:text-cyan-300"
              }`}
              onClick={openMenu}
            >
              {isMine ? "You" : msg.sender_name}
            </button>
            <span className="text-muted-foreground/55 tabular-nums">
              Lv{msg.sender_level || 1}
            </span>
            <span className="text-muted-foreground/40" title={msg.created_date}>
              · {formatClock(msg.created_date)}
            </span>
          </div>

          <div
            className={`px-3.5 py-2 text-[13px] leading-relaxed border break-words ${
              isMine ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-tl-md"
            }`}
            style={bubbleStyle}
          >
            {msg.content}
          </div>
        </div>
      </motion.div>

      <ChatPlayerMenu
        open={menuOpen}
        anchorRect={anchorRect}
        isMine={isMine}
        onClose={() => setMenuOpen(false)}
        onViewProfile={() => onTagSender?.(msg)}
        onWhisper={() => onWhisper?.(msg)}
      />
    </>
  );
}
