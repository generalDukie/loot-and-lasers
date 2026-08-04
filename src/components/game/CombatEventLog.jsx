import React, { useEffect, useRef } from "react";
import { formatCombatLogLine } from "@/lib/combatPresentation";

/** Compact live combat event log — technical readability without cluttering the stage. */
export default function CombatEventLog({ events = [], currentIdx = -1 }) {
  const endRef = useRef(null);
  const visible = events.slice(0, Math.max(0, currentIdx + 1)).slice(-8);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [currentIdx]);

  if (!visible.length) return null;

  return (
    <div
      className="absolute bottom-24 left-3 right-3 sm:left-auto sm:right-4 sm:w-72 max-h-28 overflow-y-auto rounded-lg border border-white/10 bg-black/55 backdrop-blur-sm px-2 py-1.5 z-30 pointer-events-none"
      aria-live="polite"
    >
      <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/80 font-display mb-1">Combat log</p>
      <ul className="space-y-0.5">
        {visible.map((ev, i) => {
          const absIdx = Math.max(0, currentIdx + 1 - visible.length) + i;
          const active = absIdx === currentIdx;
          return (
            <li
              key={`${absIdx}-${ev?.type}-${ev?.kind || ""}`}
              className={`text-[10px] font-mono leading-snug ${active ? "text-amber-200" : "text-white/70"}`}
            >
              {formatCombatLogLine(ev, absIdx)}
            </li>
          );
        })}
      </ul>
      <div ref={endRef} />
    </div>
  );
}
