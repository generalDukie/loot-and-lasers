import React from "react";
import { Swords } from "lucide-react";
import { ARENA_DAILY_FREE_BATTLES, ARENA_PAID_BATTLE_COST } from "@/lib/arenaEngine";

/**
 * Primary Arena daily-progress callout for free battles.
 * Presentation only — uses authoritative remaining count from the parent.
 */
export default function FreeBattlesStatus({ remaining, dailyMax = ARENA_DAILY_FREE_BATTLES, resetHint }) {
  const max = Math.max(1, Number(dailyMax) || ARENA_DAILY_FREE_BATTLES);
  const left = Math.max(0, Math.min(max, Number(remaining) || 0));
  const used = max - left;
  const depleted = left <= 0;
  const final = left === 1;

  const accent = depleted ? "#64748B" : final ? "#F59E0B" : "#FBBF24";
  const border = depleted
    ? "rgba(100,116,139,0.45)"
    : final
      ? "rgba(245,158,11,0.65)"
      : "rgba(251,191,36,0.55)";
  const wash = depleted
    ? "radial-gradient(ellipse 70% 90% at 15% 40%, rgba(100,116,139,0.14), transparent 60%)"
    : final
      ? "radial-gradient(ellipse 70% 90% at 15% 40%, rgba(245,158,11,0.2), transparent 60%)"
      : "radial-gradient(ellipse 70% 90% at 15% 40%, rgba(251,191,36,0.22), transparent 60%), radial-gradient(ellipse 50% 70% at 90% 20%, rgba(34,211,238,0.08), transparent 55%)";

  return (
    <div
      className={`relative rounded-xl border painted-panel canvas-grain overflow-hidden ${depleted ? "opacity-90" : ""}`}
      style={{ borderColor: border }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: wash }} />
      <div className="relative px-3 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
              style={{ background: `${accent}22`, color: accent, borderColor: `${accent}55` }}
            >
              <Swords className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            </div>
            <div className="min-w-0">
              <p
                className="text-[10px] sm:text-[11px] font-display font-bold tracking-[0.2em] uppercase leading-none"
                style={{ color: accent }}
              >
                Free Arena Battles
              </p>
              {depleted ? (
                <p className="font-display font-black text-base sm:text-lg tracking-wide text-slate-300 mt-1 leading-tight">
                  FREE BATTLES USED FOR TODAY
                </p>
              ) : (
                <p className="font-display font-black text-xl sm:text-2xl tracking-wide mt-0.5 leading-none" style={{ color: accent }}>
                  {left} / {max}{" "}
                  <span className="text-sm sm:text-base font-bold tracking-wider text-amber-100/90">
                    {final ? "FINAL FREE BATTLE" : "REMAINING"}
                  </span>
                </p>
              )}
            </div>
          </div>
          {resetHint && (
            <p className="text-[9px] sm:text-[10px] text-muted-foreground font-display tracking-wide uppercase shrink-0 text-right pt-0.5">
              Resets
              <br />
              <span className="text-foreground/80 normal-case tracking-normal">{resetHint}</span>
            </p>
          )}
        </div>

        <div className="flex gap-1 sm:gap-1.5" aria-hidden>
          {Array.from({ length: max }, (_, i) => {
            const filled = i < left;
            return (
              <div
                key={i}
                className="h-2 sm:h-2.5 flex-1 rounded-sm min-w-0"
                style={{
                  background: filled ? accent : "rgba(15,23,42,0.75)",
                  boxShadow: filled ? `0 0 8px ${accent}66` : "inset 0 0 0 1px rgba(148,163,184,0.25)",
                  opacity: depleted ? 0.45 : filled ? 1 : 0.7,
                }}
              />
            );
          })}
        </div>

        <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-snug">
          {depleted
            ? `Daily free quota spent (${used}/${max}). Keep climbing with paid battles for ${ARENA_PAID_BATTLE_COST} 💎 each — rating only.`
            : final
              ? "Last free battle of the day — use it for ranking progress and rewards."
              : "Use your free Arena battles each day to earn ranking progress and rewards."}
        </p>
      </div>
    </div>
  );
}
