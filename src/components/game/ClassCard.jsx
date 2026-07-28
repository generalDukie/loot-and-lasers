import React from "react";
import { STAT_ICONS, STAT_COLORS } from "@/lib/gameData";
import ClassEmblem from "@/components/game/ClassEmblem";

export default function ClassCard({ cls, selected, onClick }) {
  const accent = STAT_COLORS[cls.primaryStat] || STAT_COLORS.all;

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
            <span className="text-xs bg-muted/50 px-2 py-0.5 rounded-full text-accent">
              {STAT_ICONS[cls.primaryStat]} Primary: {cls.primaryStat}
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
