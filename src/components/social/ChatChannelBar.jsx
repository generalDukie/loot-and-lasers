import React from "react";
import { motion } from "framer-motion";
import { Globe, Lock, Radio } from "lucide-react";

/**
 * Frequency-band channel selector for the station comms terminal.
 * Active channel reads as a locked-in frequency, not a plain tab.
 */
export default function ChatChannelBar({ channels, activeId, onChange }) {
  return (
    <div
      className="chat-freq-bar relative flex flex-wrap gap-2 p-1.5 rounded-2xl border w-full sm:w-auto"
      style={{
        borderColor: "hsl(190 40% 40% / 0.28)",
        background: `
          linear-gradient(180deg, hsl(222 28% 12% / 0.92), hsl(230 32% 8% / 0.95)),
          repeating-linear-gradient(90deg, transparent, transparent 11px, hsl(190 50% 50% / 0.03) 11px, hsl(190 50% 50% / 0.03) 12px)
        `,
        boxShadow: "inset 0 1px 0 hsl(190 60% 60% / 0.08), 0 8px 24px rgba(0,0,0,0.25)",
      }}
      role="tablist"
      aria-label="Communication frequencies"
    >
      <div className="hidden sm:flex items-center gap-1.5 px-2 text-[9px] font-display tracking-[0.22em] text-cyan-300/55 uppercase shrink-0">
        <Radio className="w-3 h-3" />
        Freq
      </div>
      {channels.map((ch) => {
        const Icon = ch.icon || Globe;
        const active = activeId === ch.id;
        const unread = Number(ch.unread || 0);
        return (
          <button
            key={ch.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(ch.id)}
            className={`relative flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-display font-semibold tracking-wide transition-all duration-200 border ${
              active
                ? "text-cyan-50 border-cyan-400/45"
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04] hover:border-border/40"
            }`}
            style={
              active
                ? {
                    background: "linear-gradient(180deg, hsl(190 70% 40% / 0.28), hsl(200 60% 28% / 0.18))",
                    boxShadow: "0 0 18px hsl(190 90% 50% / 0.22), inset 0 0 12px hsl(190 90% 50% / 0.08)",
                  }
                : undefined
            }
          >
            {active && (
              <motion.span
                layoutId="chat-freq-glow"
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{
                  boxShadow: "inset 0 0 0 1px hsl(190 90% 60% / 0.35)",
                }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <Icon className={`w-4 h-4 shrink-0 relative z-[1] ${active ? "text-cyan-300" : ""}`} />
            <span className="relative z-[1]">{ch.label}</span>
            {ch.sublabel && (
              <span className={`hidden md:inline relative z-[1] text-[9px] font-normal tracking-wider uppercase ${
                active ? "text-cyan-200/60" : "text-muted-foreground/50"
              }`}>
                {ch.sublabel}
              </span>
            )}
            {unread > 0 && (
              <span
                className="relative z-[1] chat-unread-pulse min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[9px] font-bold tabular-nums flex items-center justify-center"
                style={{
                  background: "hsl(190 90% 50% / 0.9)",
                  color: "hsl(230 25% 6%)",
                  boxShadow: "0 0 10px hsl(190 90% 50% / 0.55)",
                }}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
            {active && (
              <Lock className="w-3 h-3 text-cyan-300/70 relative z-[1] hidden sm:block" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}
