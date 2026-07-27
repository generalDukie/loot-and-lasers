import React from "react";
import { STAT_ICONS } from "@/lib/gameData";

export default function RaceCard({ race, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left p-4 rounded-xl border transition-all duration-300 ${
        selected
          ? "border-primary bg-primary/5 border-glow-cyan"
          : "border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl">{race.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-sm tracking-wide">{race.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{race.tagline}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.entries(race.bonuses).map(([stat, val]) => (
              <span key={stat} className="text-xs bg-muted/50 px-2 py-0.5 rounded-full text-primary">
                {STAT_ICONS[stat]} +{Math.round(val * 100)}% {stat}
              </span>
            ))}
          </div>
        </div>
      </div>
      {selected && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/50" />
      )}
    </button>
  );
}