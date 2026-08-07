import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, User, UserPlus, Shield, Ban, Swords } from "lucide-react";

/**
 * Lightweight player action menu for chat usernames.
 * Opens on click; closes on outside click / Escape.
 */
export default function ChatPlayerMenu({
  open,
  anchorRect,
  onClose,
  onViewProfile,
  onWhisper,
  onAddFriend,
  onInviteGuild,
  onBlock,
  isMine = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);

  if (!open || !anchorRect || isMine) return null;

  const top = Math.min(window.innerHeight - 220, anchorRect.bottom + 6);
  const left = Math.min(window.innerWidth - 200, Math.max(8, anchorRect.left));

  const items = [
    { id: "profile", label: "View Profile", icon: User, onClick: onViewProfile },
    { id: "whisper", label: "Whisper", icon: MessageSquare, onClick: onWhisper },
    onAddFriend ? { id: "friend", label: "Add Friend", icon: UserPlus, onClick: onAddFriend } : null,
    onInviteGuild ? { id: "guild", label: "Invite to Guild", icon: Swords, onClick: onInviteGuild } : null,
    onBlock ? { id: "block", label: "Block", icon: Ban, onClick: onBlock, danger: true } : null,
  ].filter(Boolean);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[220] min-w-[11.5rem] rounded-xl border overflow-hidden py-1 shadow-2xl"
      style={{
        top,
        left,
        borderColor: "hsl(190 40% 40% / 0.4)",
        background: "linear-gradient(160deg, hsl(222 28% 12% / 0.98), hsl(230 32% 8% / 0.99))",
        boxShadow: "0 16px 40px rgba(0,0,0,0.55), 0 0 20px hsl(190 90% 50% / 0.12)",
      }}
      role="menu"
    >
      <p className="px-3 py-1.5 text-[9px] font-display tracking-[0.18em] uppercase text-cyan-300/55 flex items-center gap-1.5">
        <Shield className="w-3 h-3" />
        Operative link
      </p>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] font-display transition-colors ${
              item.danger
                ? "text-rose-300/90 hover:bg-rose-500/10"
                : "text-foreground/90 hover:bg-cyan-500/10 hover:text-cyan-100"
            }`}
            onClick={() => {
              item.onClick?.();
              onClose?.();
            }}
          >
            <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
