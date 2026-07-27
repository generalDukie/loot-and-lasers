import React from "react";
import { CheckCircle2, Trophy, Skull, Swords, Clock } from "lucide-react";

function fmtHours(sec) {
  const s = sec || 0;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

const STATS = [
  { key: "missions_completed", label: "Missions Done", icon: CheckCircle2, color: "#22C55E", fmt: (v) => v || 0 },
  { key: "arena_wins", label: "Arena Wins", icon: Trophy, color: "#FFD700", fmt: (v) => v || 0 },
  { key: "dungeon_clears", label: "Dungeon Clears", icon: Skull, color: "#A855F7", fmt: (v) => v || 0 },
  { key: "highest_damage", label: "Highest Damage", icon: Swords, color: "#FB7185", fmt: (v) => v || 0 },
  { key: "total_stardust_earned", label: "Stardust Earned", icon: "✨", color: "#22D3EE", fmt: (v) => v || 0 },
  { key: "playtime_seconds", label: "Time Played", icon: Clock, color: "#C084FC", fmt: (v) => fmtHours(v) },
];

// Public, read-only career stats shown on a character's profile and page.
export default function CharacterStats({ character, hideStardust = false }) {
  const visibleStats = hideStardust ? STATS.filter((s) => s.key !== "total_stardust_earned") : STATS;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {visibleStats.map(({ key, label, icon, color, fmt }) => {
        const isEmoji = typeof icon === 'string';
        const Icon = isEmoji ? null : icon;
        return (
        <div key={key} className="p-3 rounded-xl bg-card/50 border border-border/50 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + "18" }}>
            {isEmoji ? <span className="text-base" style={{ color }}>{icon}</span> : <Icon className="w-4 h-4" style={{ color }} />}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
            <p className="font-display font-bold text-sm truncate" style={{ color }}>{fmt(character?.[key])}</p>
          </div>
        </div>
        );
      })}
    </div>
  );
}