import React from "react";
import CharacterAvatar, { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/components/game/CharacterAvatar";
import StatIcon from "@/components/game/StatIcon";

const RACE_ACCENT = {
  Zyrathi: "#FF6B1A",
  Cognati: "#00E5FF",
  Luminae: "#C9B8FF",
  Grothak: "#FF8C42",
  Synthara: "#9D6BFF",
};

export default function RaceCard({ race, selected, onClick }) {
  const accent = RACE_ACCENT[race.name] || "#22D3EE";
  const skin = race.skinColors?.[0] || "#888";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left p-3.5 rounded-xl border transition-all duration-300 overflow-hidden ${
        selected
          ? "border-primary bg-primary/5 border-glow-cyan"
          : "border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(ellipse at 12% 30%, ${accent}22, transparent 55%)`,
        }}
      />
      <div className="relative flex items-start gap-3">
        <div
          className="shrink-0 rounded-xl border p-0.5"
          style={{
            borderColor: selected ? `${accent}99` : `${accent}44`,
            boxShadow: selected ? `0 0 16px ${accent}40` : `0 0 10px ${accent}18`,
            background: `radial-gradient(circle at 50% 40%, ${accent}28, transparent 70%)`,
          }}
        >
          <CharacterAvatar
            race={race.name}
            skinColor={skin}
            eyeStyle={EYES[0]}
            ears={EARS[0]}
            mouth={MOUTHS[0]}
            nose={NOSES[0]}
            eyebrows={BROWS[0]}
            marking={MARKINGS[0]}
            size={64}
            static
            uid={`card-${race.name}`}
          />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none" aria-hidden>{race.emoji}</span>
            <h3 className="font-display font-semibold text-sm tracking-wide">{race.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{race.tagline}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.entries(race.bonuses).map(([stat, val]) => (
              <span key={stat} className="text-xs bg-muted/50 px-2 py-0.5 rounded-full text-primary inline-flex items-center gap-1">
                <StatIcon stat={stat} className="w-3 h-3" /> +{Math.round(val * 100)}% {stat}
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
