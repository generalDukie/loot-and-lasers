import React from "react";
import { CheckCircle2, Trophy, Skull, Swords, Clock } from "lucide-react";

function fmtHours(sec) {
  const s = sec || 0;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

const STATS = [
  { key: "missions_completed", label: "Missions Done", short: "Missions", icon: CheckCircle2, color: "#22C55E", fmt: (v) => v || 0 },
  { key: "arena_wins", label: "Arena Wins", short: "Arena", icon: Trophy, color: "#FFD700", fmt: (v) => v || 0 },
  { key: "dungeon_clears", label: "Dungeon Clears", short: "Clears", icon: Skull, color: "#A855F7", fmt: (v) => v || 0 },
  { key: "highest_damage", label: "Highest Damage", short: "Peak DMG", icon: Swords, color: "#FB7185", fmt: (v) => v || 0 },
  { key: "total_stardust_earned", label: "Stardust Earned", short: "Stardust", icon: "✨", color: "#22D3EE", fmt: (v) => v || 0 },
  { key: "playtime_seconds", label: "Time Played", short: "Played", icon: Clock, color: "#C084FC", fmt: (v) => fmtHours(v) },
];

// Public, read-only career stats shown on a character's profile and page.
// `dense` + default = 3×2; `stacked` = 2×3 (three tiers of two) for vertical side columns.
export default function CharacterStats({ character, hideStardust = false, compact = false, dense = false, stacked = false }) {
  const visibleStats = hideStardust ? STATS.filter((s) => s.key !== "total_stardust_earned") : STATS;
  const tight = dense || compact || stacked;

  return (
    <div
      className={`grid ${
        stacked ? "grid-cols-2 grid-rows-3 h-full gap-1.5 content-stretch" : dense ? "grid-cols-3 gap-1" : tight ? "grid-cols-3 gap-1.5" : "grid-cols-2 sm:grid-cols-3 gap-2"
      }`}
    >
      {visibleStats.map(({ key, label, short, icon, color, fmt }) => {
        const isEmoji = typeof icon === "string";
        const Icon = isEmoji ? null : icon;
        const title = label;
        return (
          <div
            key={key}
            title={title}
            className={`rounded-lg bg-card/50 border border-border/45 flex items-center min-w-0 min-h-0 ${
              stacked
                ? "px-2 py-1.5 gap-1.5"
                : dense
                ? "px-1.5 py-1 gap-1.5"
                : tight
                ? "p-2 gap-2"
                : "p-3 gap-2.5 rounded-xl"
            }`}
          >
            <div
              className={`rounded-md flex items-center justify-center shrink-0 ${
                stacked || dense ? "w-5 h-5" : tight ? "w-7 h-7" : "w-9 h-9"
              }`}
              style={{ backgroundColor: color + "18" }}
            >
              {isEmoji ? (
                <span className={stacked || dense ? "text-[10px]" : tight ? "text-sm" : "text-base"} style={{ color }}>{icon}</span>
              ) : (
                <Icon className={stacked || dense ? "w-3 h-3" : tight ? "w-3.5 h-3.5" : "w-4 h-4"} style={{ color }} />
              )}
            </div>
            <div className="min-w-0">
              <p className={`text-muted-foreground uppercase tracking-wide truncate ${stacked || dense ? "text-[7px] leading-none" : "text-[9px]"}`}>
                {stacked || dense ? short : label}
              </p>
              <p
                className={`font-display font-bold truncate leading-tight ${
                  stacked || dense ? "text-[11px]" : tight ? "text-xs" : "text-sm"
                }`}
                style={{ color }}
              >
                {fmt(character?.[key])}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
