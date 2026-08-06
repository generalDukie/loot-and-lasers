import React from "react";
import { STAT_COLORS } from "@/lib/gameData";
import ClassEmblem from "@/components/game/ClassEmblem";
import StatIcon from "@/components/game/StatIcon";

export default function ClassCard({ cls, selected, onClick, compact = false }) {
  const accent = STAT_COLORS[cls.primaryStat] || STAT_COLORS.all;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`relative w-full text-left rounded-xl border transition-all duration-200 overflow-hidden px-2.5 py-2 ${
          selected
            ? "border-accent bg-accent/10 border-glow-purple shadow-[0_0_18px_rgba(168,85,247,0.18)]"
            : "border-border/45 bg-card/40 hover:border-accent/35 hover:bg-card/70"
        }`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ background: `radial-gradient(ellipse at 0% 50%, ${accent}22, transparent 60%)` }}
        />
        <div className="relative flex items-center gap-2 min-w-0">
          <ClassEmblem cls={cls} size={40} animate={selected} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-sm leading-none" aria-hidden>{cls.emoji}</span>
              <h3 className="font-display font-semibold text-[12px] tracking-wide truncate">{cls.name}</h3>
            </div>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{cls.tagline}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[9px] bg-muted/50 px-1.5 py-px rounded-full text-accent truncate max-w-full inline-flex items-center gap-0.5">
                <StatIcon stat={cls.primaryStat} className="w-2.5 h-2.5" /> {cls.primaryStat}
              </span>
              {cls.special && (
                <span className="text-[9px] bg-primary/10 px-1.5 py-px rounded-full text-primary font-medium truncate">
                  ✦ {cls.special.name}
                </span>
              )}
            </div>
          </div>
          {selected && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left p-3.5 rounded-xl border transition-all duration-300 overflow-hidden ${
        selected
          ? "border-accent bg-accent/5 border-glow-purple"
          : "border-border/50 bg-card/50 hover:border-accent/30 hover:bg-card"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{
          background: `radial-gradient(ellipse at 12% 30%, ${accent}20, transparent 55%)`,
        }}
      />
      <div className="relative flex items-start gap-3">
        <ClassEmblem cls={cls} size={64} animate={selected} />
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none" aria-hidden>{cls.emoji}</span>
            <h3 className="font-display font-semibold text-sm tracking-wide">{cls.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{cls.tagline}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs bg-muted/50 px-2 py-0.5 rounded-full text-accent inline-flex items-center gap-1">
              <StatIcon stat={cls.primaryStat} className="w-3 h-3" /> Primary: {cls.primaryStat}
            </span>
            {cls.special && (
              <span className="text-xs bg-primary/10 px-2 py-0.5 rounded-full text-primary font-medium">
                ✦ {cls.special.name}
              </span>
            )}
          </div>
        </div>
      </div>
      {selected && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent shadow-lg shadow-accent/50" />
      )}
    </button>
  );
}
