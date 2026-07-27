import React from "react";
import { STAT_ICONS } from "@/lib/gameData";

// Shows a single primary attribute bar with an optional gear-bonus indicator.
// `value` = total (base + gear), `base` = character's allocated + racial base.
// When gear adds to this stat, the bonus is shown as a green chip.
export default function StatBar({ stat, value, base, maxValue = 30 }) {
  const safeBase = base ?? value;
  const bonus = Math.max(0, (value || 0) - (safeBase || 0));
  const pct = Math.min(100, ((value || 0) / maxValue) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm w-5 text-center">{STAT_ICONS[stat]}</span>
      <span className="text-xs font-medium w-16 capitalize text-muted-foreground">{stat}</span>
      <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-display font-semibold w-8 text-right">{value || 0}</span>
      {bonus > 0 && (
        <span className="text-[9px] font-bold text-green-400 bg-green-500/10 px-1 rounded">+{bonus}</span>
      )}
    </div>
  );
}