import React from "react";
import { motion } from "framer-motion";
import { MAIL_FOLDERS, MAIL_CATEGORIES } from "@/lib/mailUi";

export function MailFolderBar({ active, onChange, counts = {} }) {
  return (
    <div
      className="mail-folder-bar flex flex-wrap gap-1.5 p-1.5 rounded-2xl border"
      style={{
        borderColor: "hsl(190 40% 40% / 0.28)",
        background: `
          linear-gradient(180deg, hsl(222 28% 12% / 0.92), hsl(230 32% 8% / 0.95)),
          repeating-linear-gradient(90deg, transparent, transparent 11px, hsl(190 50% 50% / 0.03) 11px, hsl(190 50% 50% / 0.03) 12px)
        `,
        boxShadow: "inset 0 1px 0 hsl(190 60% 60% / 0.08), 0 8px 24px rgba(0,0,0,0.22)",
      }}
      role="tablist"
      aria-label="Mailbox folders"
    >
      {MAIL_FOLDERS.map((f) => {
        const Icon = f.icon;
        const isActive = active === f.key;
        const count = Number(counts[f.key] || 0);
        return (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange?.(f.key)}
            className={`relative flex-1 min-w-[4.5rem] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-display font-semibold tracking-wide transition-all duration-200 border ${
              isActive
                ? "text-cyan-50 border-cyan-400/45"
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]"
            }`}
            style={
              isActive
                ? {
                    background: "linear-gradient(180deg, hsl(190 70% 40% / 0.28), hsl(200 60% 28% / 0.18))",
                    boxShadow: "0 0 16px hsl(190 90% 50% / 0.2)",
                  }
                : undefined
            }
          >
            {isActive && (
              <motion.span
                layoutId="mail-folder-glow"
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{ boxShadow: "inset 0 0 0 1px hsl(190 90% 60% / 0.35)" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <Icon className={`w-3.5 h-3.5 relative z-[1] ${isActive ? "text-cyan-300" : ""}`} />
            <span className="relative z-[1]">{f.label}</span>
            {count > 0 && (
              <span className="relative z-[1] mail-unread-pulse min-w-[1.05rem] h-[1.05rem] px-1 rounded-full text-[9px] font-bold tabular-nums flex items-center justify-center bg-cyan-400 text-background">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function MailCategoryChips({ active, onChange, visible = true }) {
  if (!visible) return null;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mail categories">
      {MAIL_CATEGORIES.map((c) => {
        const Icon = c.icon;
        const isActive = active === c.key;
        const disabled = !!c.soon;
        return (
          <button
            key={c.key}
            type="button"
            disabled={disabled}
            title={disabled ? "Coming soon" : c.label}
            onClick={() => !disabled && onChange?.(c.key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-display font-semibold tracking-wide border transition-all duration-150 ${
              disabled
                ? "opacity-40 cursor-not-allowed border-border/20 text-muted-foreground/60"
                : isActive
                  ? "border-amber-400/40 text-amber-100 bg-amber-500/15"
                  : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/50 hover:bg-white/[0.03]"
            }`}
            style={
              isActive && !disabled
                ? { boxShadow: "0 0 12px hsl(40 90% 50% / 0.15)" }
                : undefined
            }
          >
            <Icon className="w-3 h-3" />
            {c.label}
            {disabled && <span className="text-[8px] uppercase tracking-wider opacity-70">Soon</span>}
          </button>
        );
      })}
    </div>
  );
}
