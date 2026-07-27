import React from "react";
import { STAT_ICONS } from "@/lib/gameData";

export default function ClassCard({ cls, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left p-4 rounded-xl border transition-all duration-300 ${
        selected
          ? "border-accent bg-accent/5 border-glow-purple"
          : "border-border/50 bg-card/50 hover:border-accent/30 hover:bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl">{cls.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-sm tracking-wide">{cls.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{cls.tagline}</p>
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