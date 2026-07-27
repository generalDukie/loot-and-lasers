import React from "react";
import { STAT_ICONS, getStatDescription, CLASSES } from "@/lib/gameData";

const STAT_LABELS = {
  strength: "Strength",
  agility: "Agility",
  intellect: "Intellect",
  vitality: "Vitality",
  luck: "Luck",
};

const STAT_COLORS = {
  strength: { bar: "#F87171", soft: "rgba(248,113,113,0.15)", text: "#FCA5A5" },
  agility: { bar: "#34D399", soft: "rgba(52,211,153,0.15)", text: "#6EE7B7" },
  intellect: { bar: "#60A5FA", soft: "rgba(96,165,250,0.15)", text: "#93C5FD" },
  vitality: { bar: "#FB7185", soft: "rgba(251,113,133,0.15)", text: "#FDA4AF" },
  luck: { bar: "#FBBF24", soft: "rgba(251,191,36,0.15)", text: "#FCD34D" },
};

// Read-only starting-stat chart for character creation — value + class-aware tip.
export default function ClassStatsChart({ characterClass, stats, raceBonusNote }) {
  const cls = CLASSES[characterClass];
  const entries = Object.entries(stats || {});
  const maxVal = Math.max(1, ...entries.map(([, v]) => v || 0));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h4 className="text-xs font-display font-semibold text-muted-foreground tracking-wide">STARTING STATS</h4>
        {cls && (
          <span className="text-[10px] text-muted-foreground">
            Primary: <span className="font-semibold" style={{ color: (STAT_COLORS[cls.primaryStat] || {}).text }}>{STAT_LABELS[cls.primaryStat]}</span>
          </span>
        )}
      </div>
      {entries.map(([stat, val]) => {
        const colors = STAT_COLORS[stat] || STAT_COLORS.strength;
        const isPrimary = cls?.primaryStat === stat;
        const isSecondary = cls?.secondaryStat === stat;
        const pct = Math.round(((val || 0) / maxVal) * 100);
        return (
          <div
            key={stat}
            className="rounded-lg px-2.5 py-2 border"
            style={{
              background: colors.soft,
              borderColor: isPrimary ? colors.bar + "88" : isSecondary ? colors.bar + "44" : "hsl(var(--border) / 0.4)",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm leading-none">{STAT_ICONS[stat]}</span>
              <span className="text-xs font-display font-semibold tracking-wide flex-1" style={{ color: colors.text }}>
                {STAT_LABELS[stat]}
                {isPrimary && <span className="ml-1.5 text-[9px] uppercase tracking-wider opacity-80">Primary</span>}
                {isSecondary && !isPrimary && <span className="ml-1.5 text-[9px] uppercase tracking-wider opacity-60">Secondary</span>}
              </span>
              <span className="font-display font-bold text-sm tabular-nums" style={{ color: colors.text }}>{val}</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/25 overflow-hidden mb-1.5">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors.bar }} />
            </div>
            <p className="text-[10px] leading-snug" style={{ color: colors.text, opacity: 0.85 }}>
              {getStatDescription(stat, characterClass)}
            </p>
          </div>
        );
      })}
      {raceBonusNote && (
        <p className="text-[10px] text-muted-foreground pt-1">{raceBonusNote}</p>
      )}
    </div>
  );
}
