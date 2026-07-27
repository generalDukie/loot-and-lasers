import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, Swords, RotateCcw, User } from "lucide-react";

function eventTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDelta(n) {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

export default function ArenaMatchHistory({ matches = [], onRevenge, revengeBusyId = null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 painted-panel painted-frame canvas-grain">
      <div className="absolute inset-0 pointer-events-none opacity-60" style={{
        background: "radial-gradient(ellipse 70% 50% at 100% 0%, rgba(251,113,133,0.12), transparent 55%)",
      }} />
      <div className="relative p-4">
        <h3 className="font-display font-bold text-xs tracking-[0.18em] flex items-center gap-2 mb-3 text-rose-300/90">
          <History className="w-3.5 h-3.5" /> MATCH HISTORY
        </h3>
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {matches.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">
              No fights yet — challenge someone and rivalries start here.
            </p>
          )}
          <AnimatePresence initial={false}>
            {matches.map((m) => {
              const busy = revengeBusyId === m.id;
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg border border-border/40 bg-background/30 px-2.5 py-2 flex items-center gap-2.5"
                >
                  <div
                    className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border ${
                      m.won
                        ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                        : "bg-rose-500/15 border-rose-500/35 text-rose-300"
                    }`}
                  >
                    <Swords className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="font-display font-bold text-xs truncate">{m.opponent_name}</p>
                      {!m.opponent_is_bot && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[8px] font-display font-bold tracking-wide text-emerald-300/90">
                          <User className="w-2.5 h-2.5" /> REAL
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {m.won ? "Victory" : "Defeat"} · Lv {m.opponent_level}
                      {m.opponent_guild ? ` · ${m.opponent_guild}` : ""}
                      {" · "}
                      <span className={m.rating_delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {fmtDelta(m.rating_delta)}
                      </span>
                    </p>
                    <p className="text-[9px] text-muted-foreground/70 font-display tracking-wide">
                      {eventTime(m.created_date)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !onRevenge}
                    onClick={() => onRevenge?.(m)}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-display font-black tracking-wider border border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Rematch this opponent"
                  >
                    <RotateCcw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
                    REVENGE
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
